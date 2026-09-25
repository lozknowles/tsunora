import assert from 'node:assert/strict';
import {createHash, createHmac} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {OpenWAAdapter, type OpenWAConfig} from './openwa.js';
import {definitionHash, parseMessagingCommand} from './messaging-commands.js';
import {JobCatalog} from './job-catalog.js';
import {ActionRegistry, ArtifactStore, JobRuntime, ResourceLockManager, RunLedger, WorkerRegistry} from './job-runtime.js';
import {ControlEventBus, type AgentControlService} from './application-service.js';
import type {JobDefinition} from './job-types.js';
import {startWebDashboard} from './web-server.js';
import {once} from 'node:events';
import {spawnSync} from 'node:child_process';
import {savedMessagingMilestones,savedMessagingReport,savedMessagingTemplateHash} from './messaging-saved-jobs.js';
import {repositoryCodeReviewDefinition} from './repository-review-definition.js';
import type {ParameterizedJobRun} from './parameterized-job-types.js';

const sender='441234567890@c.us';
test('saved review command bridge preserves IDs, reports authoritative handoffs and requires grants',async t=>{
  const s=setup(t),runs:ParameterizedJobRun[]=[];
  const saved={definition:{id:'repository-code-review',version:1,follow:'pinned'},enabled:true};
  let entries:any[]=[];
  Object.assign(s.service,{exportSavedJob:()=>saved,jobDefinition:()=>repositoryCodeReviewDefinition,parameterizedRuns:()=>runs,
    parameterizedRun:(id:string)=>({...runs.find(run=>run.id===id)!,executionHistory:{entries}}),
    runSavedJob:(_id:string,actor:string,key:string,origin:import('./request-origin.js').GovernedRequestOrigin)=>{const run={id:'11111111-2222-4333-8444-555555555555',trigger:{type:'manual',actor,id:key,origin},savedJobId:'review',status:'QUEUED',requestedAt:new Date().toISOString(),transitions:[],usage:{source:'unavailable'},evidence:[]} as unknown as ParameterizedJobRun;runs.push(run);return run;},
    cancelParameterizedRun:(id:string)=>{runs.find(run=>run.id===id)!.status='CANCELLED';}
  });
  const template={kind:'saved' as const,name:'review',jobId:'review',definitionHash:savedMessagingTemplateHash(s.service,'review'),parameters:{},arguments:{},maxActive:1,maxRunsPerHour:2};
  s.config.templates.push(template);s.reopen();await s.enroll();
  assert.equal(s.receive('run review','no-grant').rejected,true);
  const pair=s.adapter.beginPairing();s.receive(pair.command,'pair-review');s.adapter.confirmPairing(String(s.adapter.status().pairing[0].hash),['review']);
  const accepted=s.receive('run review','review');assert.equal(runs.length,1);assert.ok(accepted.runId);assert.equal(runs[0].trigger.origin?.request,'run review');assert.equal(runs[0].trigger.origin?.channel,'openwa');assert.equal(runs[0].trigger.origin?.authentication,'enrolled-direct-sender');assert.doesNotMatch(JSON.stringify(runs[0].trigger.origin),/441234567890|@c\.us/);
  assert.equal(s.receive(`status ${accepted.runId}`,'review-status').accepted,true);
  entries=[{id:'requested',type:'HANDOFF_REQUESTED',outcome:'INFO',title:'Handoff requested',content:'reason: context capacity',at:new Date().toISOString()},
    {id:'bad',type:'HANDOFF_COMPLETED',outcome:'FAILED',title:'Never complete',content:'',at:new Date().toISOString()},
    {id:'completed',type:'HANDOFF_COMPLETED',outcome:'SUCCEEDED',title:'Handoff completed',content:'reason: context capacity; api_key=secret-value',at:new Date().toISOString()}];
  s.adapter.reconcile();s.adapter.reconcile();
  const handoffs=s.adapter.db.prepare("SELECT body FROM outbox WHERE kind='handoff'").all();assert.equal(handoffs.length,2);assert.doesNotMatch(JSON.stringify(handoffs),/secret-value|Never complete/);
  const projected=s.service.parameterizedRun(accepted.runId!);assert.equal(savedMessagingMilestones(projected).length,2);assert.match(savedMessagingReport(projected,'http://localhost'),/context: unavailable/);
  s.reopen();await s.adapter.checkHealth();assert.equal(s.receive('run review','review').duplicate,true);assert.equal(runs.length,1);
  assert.equal(s.receive(`cancel ${accepted.runId}`,'review-cancel').accepted,true);assert.equal(runs[0].status,'CANCELLED');
});
const job: JobDefinition={apiVersion:'agent-control/v1',kind:'Job',metadata:{id:'test',name:'Bounded test',version:'1.0.0'},spec:{priority:'normal',concurrency:'no-overlap',parameters:{count:{type:'integer',minimum:1,maximum:2,default:1}},steps:[{id:'check',action:'test@1.0.0',requires:[],timeoutSeconds:5,verification:['check']} ]}};
function setup(t: test.TestContext) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'openwa-test-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  process.env.OPENWA_TEST_API='test-api-key-long-enough';process.env.OPENWA_TEST_SECRET='test-signature-secret-over-thirty-two-characters';
  const config: OpenWAConfig={gatewayUrl:'http://127.0.0.1:19190/api',sessionId:'11111111-1111-4111-8111-111111111111',expectedPhone:'+441111111111',accountLabel:'test',dashboardUrl:'http://127.0.0.1:19191',apiKeyEnv:'OPENWA_TEST_API',webhookSecretEnv:'OPENWA_TEST_SECRET',progressSeconds:30,templates:[{name:'test',jobId:'test',definitionHash:definitionHash(job),parameters:{},arguments:{count:[1,2]},maxActive:1,maxRunsPerHour:3}]};
  const catalog=new JobCatalog();catalog.addJob(job);const actions=new ActionRegistry().register('test@1.0.0',async()=>({verification:['check']}));const workers=new WorkerRegistry().register({id:'local',capabilities:[],health:'healthy',capacity:1,active:0,observedAt:new Date().toISOString()});
  const runtime=()=>new JobRuntime(catalog,actions,workers,new RunLedger(path.join(root,'runs.json')),new ArtifactStore(path.join(root,'artifacts')),new ResourceLockManager(path.join(root,'locks.json')));
  let rt=runtime(), adapter: OpenWAAdapter, time=Date.now(), connection='ready', sends=0, sendStatus=200;
  const sentBodies:unknown[]=[];
  const service={events:new ControlEventBus(),job:()=>job,runs:()=>rt.ledger.list(),run:(id:string)=>rt.ledger.get(id)!,modelInvocations:()=>[],createJobRun:(id:string,p:Record<string,unknown>,actor:string,key:string)=>rt.createRun(`${id}@1.0.0`,p,{type:'manual',actor},undefined,key),cancelJobRun:(id:string)=>rt.cancel(id)} as unknown as AgentControlService;
  const request=(async(url:any,init?:RequestInit)=>{if(String(url).endsWith('send-text')){sends++;sentBodies.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify({messageId:`message-${sends}`,timestamp:Math.floor(time/1000)}),{status:sendStatus});}return new Response(JSON.stringify({status:connection,phone:'441111111111'}));}) as typeof fetch;
  const reopen=()=>{adapter?.close();rt=runtime();adapter=new OpenWAAdapter(service,config,path.join(root,'openwa.sqlite'),request,()=>time);return adapter;};reopen();t.after(()=>adapter.close());
  const receive=(body:string,id=body,extra:Record<string,unknown>={},eventExtra:Record<string,unknown>={})=>{const payload={event:'message.received',timestamp:new Date(time).toISOString(),sessionId:config.sessionId,idempotencyKey:`key-${id}`,deliveryId:`delivery-${id}`,data:{id,from:sender,chatId:sender,to:'441111111111@c.us',type:'text',body,timestamp:Math.floor(time/1000),fromMe:false,isGroup:false,isForwarded:false,...extra},...eventExtra};const raw=Buffer.from(JSON.stringify(payload));return adapter.receive(raw,{'x-openwa-signature':`sha256=${createHmac('sha256',process.env.OPENWA_TEST_SECRET!).update(raw).digest('hex')}`,'x-openwa-event':payload.event,'x-openwa-idempotency-key':payload.idempotencyKey,'x-openwa-delivery-id':payload.deliveryId});};
  const enroll=async()=>{await adapter.checkHealth();const pair=adapter.beginPairing();receive(pair.command,'pair');const pending=adapter.status().pairing[0];adapter.confirmPairing(String(pending.hash),['test']);};
  return {get adapter(){return adapter;},get rt(){return rt;},get sends(){return sends;},sentBodies,receive,enroll,reopen,service,config,advance:(ms:number)=>time+=ms,disconnect:()=>connection='disconnected',reconnect:()=>connection='ready',fail:(status:number)=>sendStatus=status};
}

test('phone-capitalized Help uses the pinned OpenWA chatId request and messageId response contract',async t=>{
  const s=setup(t);await s.enroll();assert.equal(s.receive('Help','phone-help').accepted,true);
  await s.adapter.tick();assert.equal(s.sentBodies.length,1);
  const body=s.sentBodies[0] as Record<string,unknown>;assert.deepEqual(Object.keys(body).sort(),['chatId','linkPreview','text']);
  assert.equal(body.chatId,sender);assert.equal(body.linkPreview,false);assert.match(String(body.text),/Approved templates: test/);
  assert.equal(s.adapter.status().deliveries[0].remoteId,'message-1');assert.equal(s.adapter.status().deliveries[0].state,'submitted');
  assert.deepEqual(parseMessagingCommand('Run test {"count":2}'),{verb:'run',template:'test',arguments:{count:2}});
});
test('deterministic parser denies shell, ambiguous requests and unsupported lifecycle commands',()=>{assert.deepEqual(parseMessagingCommand('run test {"count":2}'),{verb:'run',template:'test',arguments:{count:2}});for(const text of ['sh -c whoami','run test;whoami','please do work','pause run-1','resume run-1','cancel job 0','cancel job -1','cancel job 1 then run test'])assert.throws(()=>parseMessagingCommand(text));assert.deepEqual(parseMessagingCommand('Cancel job 1'),{verb:'cancel',runId:'job:1'});assert.deepEqual(parseMessagingCommand('status 2'),{verb:'status',runId:'job:2'});});

test('short job numbers persist across restart and cannot address another operator job',async t=>{
  const s=setup(t);await s.enroll();const first=s.receive('run test','first').runId!;
  const body=()=>String(s.adapter.db.prepare('SELECT body FROM outbox ORDER BY id DESC LIMIT 1').get()!.body);
  assert.match(body(),/^Job 1 accepted/);assert.match(body(),/cancel job 1/);
  assert.doesNotMatch(body().split('\n').filter(l=>!l.startsWith('http')).join('\n'),/run-/);
  s.receive('cancel job 1','cancel-first');assert.equal(s.rt.ledger.get(first)?.status,'CANCELLED');
  const other='449999999999@lid',extra={from:other,chatId:other},pair=s.adapter.beginPairing();s.receive(pair.command,'pair-other',extra);
  s.adapter.confirmPairing(String(s.adapter.status().pairing[0].hash),['test']);s.advance(1);
  const second=s.receive('run test','second',extra).runId!;assert.notEqual(first,second);assert.match(body(),/^Job 1 accepted/);
  s.reopen();await s.adapter.checkHealth();assert.equal(s.receive('run test','second',extra).duplicate,true);
  s.receive('cancel job 1','again-first');assert.equal(s.rt.ledger.get(second)?.status,'QUEUED');
  assert.equal(s.receive(`cancel ${second}`,'cross-operator').rejected,true);
  assert.equal(s.receive('cancel job 99','unknown-number').rejected,true);assert.match(body(),/job_number_not_found/);
  s.receive('cancel job 1','cancel-second',extra);assert.equal(s.rt.ledger.get(second)?.status,'CANCELLED');
  s.advance(1);const third=s.receive('run test','third').runId!;assert.match(body(),/^Job 2 accepted/);
  await s.rt.tick();s.receive('cancel job 2','already-finished');assert.match(body(),/already finished \(SUCCEEDED\)/);assert.doesNotMatch(body(),/Cancellation requested/);
  s.adapter.db.exec('DROP TABLE job_numbers');s.reopen();await s.adapter.checkHealth();
  s.receive('status job 2','migrated');assert.match(body(),/^Job 2: SUCCEEDED/);assert.equal(s.rt.ledger.get(third)?.status,'SUCCEEDED');
});
test('enrolment requires observed direct sender and dashboard confirmation; gateway identity is not operator',async t=>{const s=setup(t);await s.adapter.checkHealth();assert.deepEqual(s.receive('help'),{rejected:true});const challenge=s.adapter.beginPairing();assert.throws(()=>s.adapter.confirmPairing('not-observed',['test']));s.receive(challenge.command,'pair-group',{isGroup:true});assert.equal(s.adapter.status().pairing[0].sender,null);s.receive(challenge.command,'pair-human');assert.equal(s.adapter.status().operators.length,0);s.adapter.confirmPairing(String(s.adapter.status().pairing[0].hash),['test']);assert.equal(s.receive('help','new-help').accepted,true);s.adapter.revoke(sender);assert.equal(s.receive('help','after-revoke').rejected,true);});
test('signed commands execute real runtime, report unavailable metrics, preserve durable dedupe after restart',async t=>{const s=setup(t);await s.enroll();const run=s.receive('run test {"count":2}','one');assert.ok(run.runId);assert.equal(s.rt.ledger.list().length,1);await s.rt.tick();assert.equal(s.rt.ledger.get(run.runId!)?.status,'SUCCEEDED');assert.equal(s.receive(`report ${run.runId}`,'report').accepted,true);s.reopen();await s.adapter.checkHealth();assert.equal(s.receive('run test {"count":2}','one').duplicate,true);assert.equal(s.rt.ledger.list().length,1);const bodies=s.adapter.db.prepare('SELECT body FROM outbox').all().map(r=>String(r.body)).join('\n');assert.match(bodies,/Context occupancy: unavailable/);assert.match(bodies,/input unavailable/);assert.match(bodies,/SUCCEEDED/);assert.doesNotMatch(bodies,/test-signature-secret/);});
test('crash between runtime persistence and adapter completion reconciles same job',async t=>{const s=setup(t);await s.enroll();const run=s.receive('run test','crash');const key=createHash('sha256').update(`${s.config.sessionId}:crash`).digest('hex');s.adapter.db.prepare("UPDATE commands SET state='processing',runId=NULL WHERE key=?").run(key);s.adapter.db.prepare('DELETE FROM outbox WHERE dedupe=?').run(key);s.reopen();await s.adapter.checkHealth();assert.equal(s.receive('run test','crash').runId,run.runId);assert.equal(s.rt.ledger.list().length,1);});
test('invalid HMAC, stale events, groups, edits, self sends, quotes and missing forwarding provenance cannot execute',async t=>{const s=setup(t);await s.enroll();assert.throws(()=>s.adapter.receive(Buffer.from('{}'),{}),/invalid_signature/);for(const [id,extra] of Object.entries({group:{isGroup:true},self:{fromMe:true},quote:{quotedMessage:{body:'run test'}},forward:{isForwarded:true},unknown:{isForwarded:undefined},media:{media:{}},spoof:{from:'Someone',chatId:'Someone'}}))assert.equal(s.receive('run test',id,extra).ignored,true);assert.equal(s.receive('run test','edit',{}, {event:'message.edited'}).ignored,true);assert.throws(()=>s.receive('run test','stale',{timestamp:1}),/stale/);assert.equal(s.rt.ledger.list().length,0);});
test('approved argument scope, active budget and ownership are enforced',async t=>{const s=setup(t);await s.enroll();assert.equal(s.receive('run test {"count":999}','bad-arg').rejected,true);assert.equal(s.receive('run test {"shell":"touch /tmp/unsafe"}','shell').rejected,true);const accepted=s.receive('run test','one');assert.ok(accepted.runId);assert.equal(s.receive('run test','over-budget').rejected,true);assert.equal(s.receive('status run-other','other').rejected,true);const cancelled=s.receive(`cancel ${accepted.runId}`,'cancel');assert.equal(cancelled.accepted,true);assert.equal(s.rt.ledger.get(accepted.runId!)?.status,'CANCELLED');});
test('disconnect and disabled adapter leave core jobs usable; reconnect recovers queue',async t=>{const s=setup(t);await s.enroll();s.receive('help','help');s.disconnect();await s.adapter.checkHealth();await s.adapter.tick();assert.equal(s.sends,0);s.adapter.setEnabled(false);assert.throws(()=>s.receive('jobs','disabled'),/disabled/);const run=s.rt.createRun('test@1.0.0',{}, {type:'manual',actor:'dashboard'});await s.rt.tick();assert.equal(s.rt.ledger.get(run.id)?.status,'SUCCEEDED');s.adapter.setEnabled(true);s.reconnect();await s.adapter.checkHealth();await s.adapter.tick();assert.equal(s.sends,1);});
test('bounded backoff and uncertain sends do not automatically duplicate; interrupted sends remain uncertain',async t=>{const s=setup(t);await s.enroll();s.receive('help','help');s.fail(429);await s.adapter.tick();assert.equal(s.sends,1);await s.adapter.tick();assert.equal(s.sends,1);s.advance(6000);s.fail(503);await s.adapter.tick();assert.equal(s.adapter.status().deliveries[0].state,'uncertain');await s.adapter.tick();assert.equal(s.sends,2);assert.throws(()=>s.adapter.retry(Number(s.adapter.status().deliveries[0].id)));s.adapter.db.exec("UPDATE outbox SET state='sending'");s.reopen();assert.equal(s.adapter.status().deliveries[0].code,'restart_during_send');});
test('terminal results suppress obsolete progress and survive notification restart',async t=>{const s=setup(t);await s.enroll();const r=s.receive('run test','run');s.adapter.reconcile();s.adapter.db.prepare('INSERT INTO outbox(dedupe,sender,runId,body,kind,due) VALUES (?,?,?,?,?,?)').run('obsolete',sender,r.runId!,'Earlier progress','progress',Date.now());await s.rt.tick();s.adapter.reconcile();assert.ok(s.adapter.status().deliveries.some(d=>d.kind==='terminal'));assert.ok(s.adapter.status().deliveries.some(d=>d.kind==='progress'&&d.state==='suppressed'));const count=s.adapter.status().deliveries.length;s.reopen();s.adapter.reconcile();assert.equal(s.adapter.status().deliveries.length,count);assert.equal(s.rt.ledger.get(r.runId!)?.status,'SUCCEEDED');});
test('HTTP setup, QR and enrolment require operator authentication and mutation origin checks',async t=>{const s=setup(t);const server=startWebDashboard(s.service,{host:'127.0.0.1',port:0,operatorToken:'dashboard-test',openwa:s.adapter});await once(server,'listening');t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));const port=(server.address() as {port:number}).port,base=`http://127.0.0.1:${port}/api/integrations/openwa`;assert.equal((await fetch(base)).status,401);assert.equal((await fetch(base+'/qr',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);assert.equal((await fetch(base,{headers:{Authorization:'Bearer dashboard-test'}})).status,200);assert.equal((await fetch(base+'/enabled',{method:'POST',headers:{Authorization:'Bearer dashboard-test','Content-Type':'application/json',Origin:'https://attacker.invalid'},body:'{"enabled":false}'})).status,403);assert.equal((await fetch(base+'/webhook',{method:'POST',body:'{}'})).status,403);});
test('natural language produces a validated proposal and never starts work until explicit command',async t=>{const s=setup(t);await s.enroll();assert.equal(s.receive('please run test','proposal').rejected,true);assert.equal(s.rt.ledger.list().length,0);assert.match(String(s.adapter.db.prepare('SELECT body FROM outbox ORDER BY id DESC LIMIT 1').get()!.body),/Proposed command \(not executed\)/);assert.ok(s.receive('run test','confirmation').runId);});
test('running cancellation remains requested until action cleanup completes',async t=>{const s=setup(t);await s.enroll();let release!:()=>void;const hold=new Promise<void>(resolve=>release=resolve);s.rt.actions.register('hold@1.0.0',async context=>{if(!context.signal.aborted)await new Promise<void>(resolve=>context.signal.addEventListener('abort',()=>resolve(),{once:true}));await hold;return {};});s.rt.catalog.addJob({...job,metadata:{...job.metadata,id:'hold'},spec:{...job.spec,steps:[{id:'hold',action:'hold@1.0.0',requires:[]}]}});const run=s.rt.createRun('hold@1.0.0',{}, {type:'manual',actor:'test'});const tick=s.rt.tick();while(s.rt.ledger.get(run.id)?.status!=='RUNNING')await new Promise(resolve=>setTimeout(resolve,1));assert.equal(s.rt.cancel(run.id).status,'CANCELLING');release();await tick;assert.equal(s.rt.ledger.get(run.id)?.status,'CANCELLED');});
test('a killed writer leaves one durable run, defaults reconcile and conflicting request keys fail',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'messaging-crash-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const runtimeUrl=new URL('./job-runtime.js',import.meta.url).href,catalogUrl=new URL('./job-catalog.js',import.meta.url).href;
  const source=`import {JobRuntime,RunLedger,ActionRegistry,WorkerRegistry,ArtifactStore,ResourceLockManager} from ${JSON.stringify(runtimeUrl)};import {JobCatalog} from ${JSON.stringify(catalogUrl)};const root=${JSON.stringify(root)};const catalog=new JobCatalog();catalog.addJob(${JSON.stringify(job)});const runtime=new JobRuntime(catalog,new ActionRegistry(),new WorkerRegistry(),new RunLedger(root+'/runs.json'),new ArtifactStore(root+'/artifacts'),new ResourceLockManager(root+'/locks.json'));runtime.createRun('test@1.0.0',{}, {type:'manual',actor:'human'},undefined,'same-event');process.kill(process.pid,'SIGKILL');`;
  const child=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',source],{timeout:10000,encoding:'utf8'});assert.ok(child.signal==='SIGKILL'||child.status!==0,child.stderr);
  const catalog=new JobCatalog();catalog.addJob(job);const ledger=new RunLedger(root+'/runs.json'),runtime=new JobRuntime(catalog,new ActionRegistry(),new WorkerRegistry(),ledger,new ArtifactStore(root+'/artifacts'),new ResourceLockManager(root+'/locks.json'));
  assert.equal(ledger.list().length,1);assert.equal(runtime.createRun('test@1.0.0',{}, {type:'manual',actor:'human'},undefined,'same-event').id,ledger.list()[0].id);assert.throws(()=>runtime.createRun('test@1.0.0',{count:2},{type:'manual',actor:'human'},undefined,'same-event'),/request_key_conflict/);
});
test('definition drift, expired challenge and changed linked identity fail closed',async t=>{const s=setup(t);await s.enroll();s.adapter.config.templates[0].definitionHash='0'.repeat(64);assert.equal(s.receive('run test','drift').rejected,true);const pair=s.adapter.beginPairing();s.advance(300001);await s.adapter.checkHealth();s.receive(pair.command,'expired');assert.equal(s.adapter.status().pairing.length,0);assert.throws(()=>s.adapter.confirmPairing('expired',[]));});
test('signed delivery acknowledgements track delivery without executing another command',async t=>{const s=setup(t);await s.enroll();s.receive('help','help');await s.adapter.tick();assert.equal(s.adapter.status().deliveries[0].state,'submitted');s.receive('run test','ack',{id:'message-1',status:'delivered'},{event:'message.ack'});assert.equal(s.adapter.status().deliveries[0].state,'delivered');s.receive('run test','late-failure',{id:'message-1',status:'failed'},{event:'message.failed'});assert.equal(s.adapter.status().deliveries[0].state,'delivered');assert.equal(s.rt.ledger.list().length,0);});

test('normalized OpenWA voice notes reach social intake while forwarded audio remains denied',async t=>{
 const s=setup(t);await s.enroll();const messages:unknown[]=[];
 s.adapter.social={accept:(m:unknown)=>{messages.push(m);return {accepted:true};},accepts:()=>false} as unknown as import('./social-voice.js').SocialVoiceCoordinator;
 assert.equal(s.receive('','voice-note',{type:'voice',media:{mimetype:'audio/ogg'}}).accepted,true);
 assert.equal((messages[0] as {kind:string}).kind,'audio');
 s.receive('','forwarded',{type:'voice',media:{mimetype:'audio/ogg'},isForwarded:true});assert.equal(messages.length,1);
});


test('voice outbox preserves bounded audio JSON beyond the text summary limit',async t=>{
 const s=setup(t);await s.enroll();const bytes=Buffer.alloc(5000);bytes.write('RIFF');bytes.write('WAVE',8);
 s.adapter.queueSocial({channel:'openwa',account:s.config.sessionId,sender,conversation:sender},'', 'voice-integrity',{bytes,mime:'audio/wav'});
 const row=s.adapter.db.prepare("SELECT body FROM outbox WHERE kind='voice'").get()!;
 assert.deepEqual(Buffer.from(JSON.parse(String(row.body)).base64,'base64'),bytes);
});

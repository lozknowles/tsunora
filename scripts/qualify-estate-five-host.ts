/** UI/API operator only. Native Jobs own every inventory command and graph update. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {execFileSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import type {AddressInfo} from 'node:net';
import {chromium} from 'playwright-core';
import {EstateDiscovery,registerEstateDiscovery} from '../src/control/estate-discovery.js';
import {estateHash,type EstateSnapshot} from '../src/control/estate-model.js';
import {estateResourceAlias,validateEstateEnvelope} from '../src/control/estate-remote.js';
import {executeSsh,type SshExecutor} from '../src/control/managed-node-ssh.js';
import {emptyConfig,type ResourceConfig} from '../src/control/config.js';
import {ActionRegistry,WorkerRegistry,createJobRuntime} from '../src/control/job-runtime.js';
import {JobCatalog} from '../src/control/job-catalog.js';
import {AgentControlService} from '../src/control/application-service.js';
import {PtyRegistry} from '../src/control/pty.js';
import {startWebDashboard} from '../src/control/web-server.js';

const configPath=process.env.ESTATE_FIVE_CONFIG,approvalPath=process.env.ESTATE_FIVE_APPROVAL,outDir=process.env.ESTATE_EVIDENCE_DIR;
assert.ok(configPath&&approvalPath&&outDir);const bytes=fs.readFileSync(configPath),approval=JSON.parse(fs.readFileSync(approvalPath,'utf8'));
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');assert.equal(sha(bytes),approval.configurationSha256);
const config=emptyConfig();config.resources=JSON.parse(bytes.toString()).resources as ResourceConfig[];assert.equal(config.resources.length,4);
for(const r of config.resources){const entry=approval.selectedResources.find((s:any)=>s.alias===estateResourceAlias(r.id));assert.ok(entry);assert.equal(r.estateDiscovery?.expectedIdentitySha256,entry.expectedIdentitySha256);}
assert.equal(new Set(config.resources.map(r=>r.id)).size,4);
const out=path.resolve(outDir),root=path.join(out,'private-runtime');assert.ok(!fs.existsSync(out),'Fresh evidence directory required');fs.mkdirSync(root,{recursive:true,mode:0o700});
process.env.AGENT_CONTROL_ACTIVITY_LOG=path.join(root,'activity.jsonl');
const git=(...args:string[])=>execFileSync('git',args,{encoding:'utf8'}).trim(),candidateCommit=git('rev-parse','HEAD');assert.equal(git('status','--porcelain'),'');
const write=(name:string,value:unknown)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});write('approval.json',approval);
const runtime=createJobRuntime(path.join(root,'jobs'),new JobCatalog(),new ActionRegistry(),new WorkerRegistry());
const service=new AgentControlService({version:1,paused:false,lastRestorePoint:null,lanes:[]},new PtyRegistry(),undefined,'4.12.1-estate-five-host-candidate').configureProjection({jobRuntime:runtime});
let estate:EstateDiscovery;const transportReceipts:Array<Record<string,any>>=[];
const executor:SshExecutor=async(command,args,input,options)=>{
 assert.ok(options.ownedExecution);assert.equal(options.session?.remoteTransport,true);const runId=estate.latest()?.runId,startedAt=new Date().toISOString(),result=await executeSsh(command,args,input,options);
 let envelope=null;try{const response=JSON.parse(result.stdout.replace(/^\uFEFF/,'')),r=config.resources.find(r=>estateResourceAlias(r.id)===response.resourceAlias);assert.ok(r);envelope=validateEstateEnvelope(JSON.stringify(response),response.resourceAlias,response.nonce,r.estateDiscovery?.expectedIdentitySha256,approval.controllerIdentitySha256,r.platform);}catch{/* Native adapter owns admission; failures remain explicit. */}
 transportReceipts.push({runId,startedAt,completedAt:new Date().toISOString(),kind:'PRODUCTION_OWNED_SSH',actualRemoteDispatch:true,exitCode:result.status,timedOut:Boolean(result.timedOut),aborted:Boolean(result.aborted),responseSha256:sha(result.stdout),envelope});return result;
};
estate=new EstateDiscovery({root:path.join(root,'estate'),config:()=>config,remoteExecutor:executor,onEvent:(type,payload)=>service.events.emit('environment.discovery_changed',{eventType:type,...payload},undefined,'estate-discovery')});registerEstateDiscovery(runtime,estate);
runtime.ledger.subscribe((runId,type,status)=>service.events.emit('job.run_changed',{runId,type,status},undefined,'run-ledger'));
const allowedOrigins:string[]=[],token=randomBytes(32).toString('hex'),server=startWebDashboard(service,{host:'127.0.0.1',port:0,operatorToken:token,estate,allowedOrigins});await once(server,'listening');const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;allowedOrigins.push(url);
const browser=await chromium.launch({headless:true,executablePath:'/snap/bin/chromium',args:['--no-sandbox']}),context=await browser.newContext({viewport:{width:1840,height:1260},colorScheme:'dark'});await context.addInitScript(t=>sessionStorage.setItem('agent-control-operator-token',t),token);
const page=await context.newPage(),errors:string[]=[];page.on('pageerror',()=>errors.push('BROWSER_PAGE_ERROR'));let busy=false,phase='START';const tick=setInterval(async()=>{if(busy)return;busy=true;try{await runtime.tick();}catch{errors.push('NATIVE_TICK_ERROR');}finally{busy=false;}},100);
const note=async(lines:string[])=>page.evaluate(v=>(window as any).AgentControlEstate.setRecordingNote(v),lines);
const shot=async(name:string)=>{await page.evaluate(()=>window.scrollTo(0,0));await page.locator('#estate-workspace').screenshot({path:path.join(out,name)});};
const snapshots:EstateSnapshot[]=[];
try{
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction("typeof state!=='undefined'&&state.operatorAuth==='authenticated'");await page.locator('[data-view="estate"]').click();await page.waitForFunction(()=>(window as any).AgentControlEstate.state().projection?.estate?.status==='EMPTY');
 for(const category of ['PASSIVE_INVENTORY','CAPABILITY_PROBES','REMOTE_HOST_DISCOVERY'])await page.locator(`[name="estate-category"][value="${category}"]`).check();
 for(const r of approval.selectedResources)await page.locator(`[name="estate-target"][value="${r.alias}"]`).check();
 await page.locator('#estate-video').check();await page.locator('#estate-grant').click();await page.waitForFunction(()=>Boolean((window as any).AgentControlEstate.state().permissionId));await page.evaluate(()=>(window as any).AgentControlEstate.startRecording());
 await note(['FIVE SELECTED HOSTS / controller + four approved SSH resources','Prior bootstrap receipts: existing SSH keys trusted; pins independently matched','Android pin is SSH installation only; physical identity remains unverified']);await shot('01-approved-five-hosts.png');await page.waitForTimeout(5000);await page.locator('.estate-scope summary').click();
 for(let cycle=1;cycle<=3;cycle++){
  phase=`NATIVE_CYCLE_${cycle}`;await note([`NATIVE FIVE-HOST DISCOVERY / cycle ${cycle} of 3`,'Linux and Windows: OS/firmware identity pins','Android: live metadata, DEGRADED identity coverage; no hardware-ID bypass']);
  const previous=estate.latest()?.id??null;await page.locator('#estate-run').click();await page.waitForFunction(old=>{const s=(window as any).AgentControlEstate.state().projection?.estate;return s?.snapshotId!==old&&['COMPLETED','PARTIAL','FAILED'].includes(s?.status);},previous,{timeout:110000});
  const s=estate.latest()!;snapshots.push(s);write(`snapshot-${cycle}.json`,s);write(`replay-${cycle}.json`,estate.replay(s.id));assert.equal(runtime.ledger.get(s.runId)?.status,'SUCCEEDED');assert.equal(s.status,'PARTIAL');assert.equal(s.entities.filter(e=>e.kind==='host').length,5);assert.equal(s.entities.find(e=>e.id==='host:controller-local')?.attributes.physicalIdentityDigest,approval.controllerIdentitySha256);
  for(const entry of approval.selectedResources){const h=s.entities.find(e=>e.id===`host:${entry.alias}`)!;assert.ok(h);assert.equal(h.attributes.identityDigest,entry.expectedIdentitySha256);assert.equal(h.state,entry.platform==='android'?'DEGRADED':'AVAILABLE');assert.equal(h.attributes.identityScope,entry.identityScope);assert.ok(s.entities.some(e=>e.kind==='cpu'&&e.hostId===h.id));}
  if(cycle===1){for(const entry of approval.selectedResources){await page.evaluate(id=>(window as any).AgentControlEstate.select(id),`host:${entry.alias}`);await note([`${entry.platform.toUpperCase()} HOST / current native metadata`,entry.identityScope==='SSH_INSTALLATION'?'LIMITED: SSH installation identity; physical identity unverified':'OS/firmware identity matched the independently approved pin','GPU absence/unavailable metadata remains explicit; no inferred device details']);await shot(`host-${entry.alias.slice(-8)}.png`);await page.waitForTimeout(4000);}}
  await shot(`0${cycle+1}-native-five-cycle-${cycle}.png`);await page.waitForTimeout(3500);
 }
 phase='CONTINUITY';const first=snapshots[0],last=snapshots.at(-1)!;
 for(const s of snapshots){assert.deepEqual(s.entities.map(e=>e.id).sort(),first.entities.map(e=>e.id).sort());assert.deepEqual(s.relationships.map(e=>e.id).sort(),first.relationships.map(e=>e.id).sort());for(const e of first.entities)assert.equal(s.entities.find(x=>x.id===e.id)?.firstSeen,e.firstSeen);for(const r of first.relationships)assert.equal(s.relationships.find(x=>x.id===r.id)?.firstSeen,r.firstSeen);}
 for(const s of snapshots.slice(1))assert.ok(s.comparison?.records.every(r=>r.changes.includes('UNCHANGED')));
 assert.equal(transportReceipts.length,12);assert.equal(new Set(transportReceipts.map(r=>r.envelope?.nonce)).size,12);
 for(const receipt of transportReceipts){assert.equal(receipt.exitCode,0);const s=snapshots.find(s=>s.runId===receipt.runId)!,h=s.entities.find(e=>e.id===`host:${receipt.envelope.resourceAlias}`)!;assert.ok(h.evidence.some(e=>e.digest===estateHash(receipt.envelope)));}
 await page.locator('#estate-diff').evaluate(n=>(n.closest('details') as HTMLDetailsElement).open=true);await note(['THREE-CYCLE CONTINUITY / stable IDs and first-seen times',`${last.entities.length} entities / ${last.relationships.length} relationships`,'Four OS/firmware identities; one Android SSH-installation identity']);await shot('05-five-host-diff.png');await page.waitForTimeout(5000);
 phase='FACTORY_LINK';await page.locator('[data-view="factory"]').click();await page.waitForFunction(()=>(window as any).AgentControlFactory.state().transport==='CONNECTED');await page.evaluate(id=>(window as any).AgentControlFactory.inspect(`job:${id}`),last.runId);await note(['NATIVE JOB RECEIPT / 12 real owned SSH executions','Job SUCCEEDED: observations recorded; Estate remains PARTIAL','View discovered hosts opens this exact run without rerunning discovery']);await page.locator('#factory-workspace').screenshot({path:path.join(out,'06-native-five-job.png')});await page.waitForTimeout(5000);
 await page.getByRole('button',{name:'View discovered hosts',exact:true}).click();await page.waitForFunction(id=>(window as any).AgentControlEstate.state().mode==='REPLAY'&&(window as any).AgentControlEstate.state().projection?.estate?.snapshotId===id,last.id);await page.locator('#estate-live').click();
 const android=approval.selectedResources.find((e:any)=>e.platform==='android');await page.evaluate(id=>(window as any).AgentControlEstate.select(id),`host:${android.alias}`);assert.match(await page.locator('#estate-inspector').innerText(),/Physical hardware identity is unverified/);
 await note(['EXPERIMENTAL_MULTI_HOST / five host records with live metadata','Four OS/firmware identities verified; Android identity is installation scoped','No production logs, installs, network changes, service restarts or deployment']);await shot('07-five-host-verdict.png');await page.waitForTimeout(7000);
 phase='VIDEO_EXPORT';await page.evaluate(()=>(window as any).AgentControlEstate.stopRecording());await page.waitForFunction(()=>!(window as any).AgentControlEstate.state().recording);
 const video=await page.evaluate(()=>(window as any).AgentControlEstate.captureBytes());assert.ok(video.length>10000);fs.writeFileSync(path.join(out,'estate-five-host-discovery.webm'),Buffer.from(video),{mode:0o600});
 write('video-manifest.json',await page.evaluate(()=>(window as any).AgentControlEstate.captureManifest()));write('factory-replay.json',await page.evaluate(()=>(window as any).AgentControlFactory.replay()));write('permission.json',estate.assertPermission(last.permissionId));write('native-runs.json',runtime.ledger.list());write('native-artifacts.json',runtime.ledger.list().flatMap(r=>r.artifacts.map(id=>{const {storageRef,...record}=runtime.artifacts.get(id)!;return{id,record,value:runtime.artifacts.read(id)};})));write('native-transport-receipts.json',transportReceipts);assert.deepEqual(errors,[]);
 const verdict={candidateCommit,candidateDirty:false,hostRecords:5,osOrFirmwareIdentities:4,androidInstallationIdentities:1,physicalAndroidIdentity:'UNVERIFIED',physicalNetworkRecovery:'NOT_TESTED_THIS_RUN',nativeJobs:3,actualRemoteExecutions:12,threeCycleIdentityContinuity:'PASS',entities:last.entities.length,relationships:last.relationships.length,verifiedCrossHostRelationships:last.relationships.filter(r=>r.from==='host:controller-local'&&r.basis==='VERIFIED').length,declaredCrossHostRelationships:last.relationships.filter(r=>r.from==='host:controller-local'&&r.basis==='DECLARED').length,hosts:last.entities.filter(e=>e.kind==='host').map(h=>({id:h.id,label:h.label,state:h.state,platform:h.attributes.platform,identityScope:h.attributes.identityScope??'SYSTEMD_MACHINE_ID',entities:last.entities.filter(e=>e.id===h.id||e.hostId===h.id).length,lastSuccessfulDiscovery:h.lastSuccessfulDiscovery,attributes:h.attributes})),snapshotSha256:estateHash(last),eventChainHead:last.events.at(-1)?.sha256,browserErrors:errors,overall:'EXPERIMENTAL_MULTI_HOST',estateStatus:'PARTIAL',limitations:['Android hardware identity inaccessible; existing trusted SSH-installation fingerprint is independently pinned.','Windows shared GPU memory is not claimed as dedicated VRAM.','Unsupported GPU metadata remains unknown.','No physical network outage/recovery tested in this run.','No production/application logs, arbitrary user files, credentials or private key contents read.','No installation, host configuration change, merge, push, release or deployment.']};write('qualification.json',verdict);console.log(JSON.stringify({candidateCommit,hosts:5,identityLimitedHosts:1,nativeJobs:3,actualRemoteExecutions:12,entities:verdict.entities,relationships:verdict.relationships,overall:verdict.overall}));
}catch{write('failure.json',{phase,classification:'FIVE_HOST_QUALIFICATION_FAILED',browserErrors:errors,completedSnapshots:snapshots.length});write('transport-failure-summary.json',transportReceipts.map(({envelope,...r})=>({...r,envelopeAccepted:Boolean(envelope)})));await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw Error('estate_five_host_qualification_failed');}
finally{clearInterval(tick);while(busy)await new Promise(r=>setTimeout(r,50));await browser.close();server.close();}

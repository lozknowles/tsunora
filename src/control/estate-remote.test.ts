import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {EstateRemoteAdapter,estateResourceAlias,estateSshArgs,estateProbeProgram,validateEstateEnvelope,ESTATE_REMOTE_SCHEMA,ESTATE_REMOTE_METHOD,ESTATE_REMOTE_LIMITS} from './estate-remote.js';
import {emptyConfig,type ResourceConfig} from './config.js';
import type {SshExecutor} from './managed-node-ssh.js';
import type {OwnedExecution} from './owned-process.js';
import {EstateDiscovery,registerEstateDiscovery} from './estate-discovery.js';
import {ActionRegistry,WorkerRegistry,createJobRuntime} from './job-runtime.js';
import {JobCatalog} from './job-catalog.js';
import {estateProjection,estateComparison} from './estate-model.js';

const pin='a'.repeat(64),localPin='b'.repeat(64);
const resource=():ResourceConfig=>({id:'synthetic-approved',platform:'linux',transport:{type:'ssh',host:'approved.example.invalid',port:2222,user:'fixture',identityFile:'/fixture/approved-key'},capabilities:[],managedNode:{enabled:true},estateDiscovery:{enabled:true,scope:'metadata-only',authorisationDigest:'c'.repeat(64),expectedIdentitySha256:pin}});
const request=(input:string)=>JSON.parse(Buffer.from(input.match(/base64\.b64decode\('([^']+)'\)/)![1],'base64').toString());
const envelope=(input:string)=>({schema:ESTATE_REMOTE_SCHEMA,method:ESTATE_REMOTE_METHOD,...request(input),observedAt:new Date().toISOString(),status:'COMPLETE',host:{identitySha256:pin,platform:'linux',architecture:'x86_64'},cpuCount:4,memoryBytes:8*1024**3,missing:[]});
const success:SshExecutor=async(_command,_args,input)=>({status:0,stdout:JSON.stringify(envelope(input)),stderr:''});
function fixture(executor:SshExecutor=success){
 const config=emptyConfig();config.resources=[resource()];const calls:unknown[][]=[],states:unknown[]=[];let cleanups=0;
 const owned:OwnedExecution={runProcess:async()=>{throw Error('LOCAL_FALLBACK_FORBIDDEN');},terminateAll:async()=>{cleanups++;return{outcome:'confirmed',reason:'fixture',requestedAt:'fixture',completedAt:'fixture',processes:[]};},activePids:()=>[]};
 const adapter=new EstateRemoteAdapter(()=>config,async(...args)=>{calls.push(args);return executor(...args);});
 const controller=new AbortController();const context={signal:controller.signal,ownedExecution:owned,controllerIdentitySha256:localPin,onState:(state:string,reason:string)=>states.push({state,reason})};
 return{config,calls,states,adapter,controller,context,cleanups:()=>cleanups,run:()=>adapter.discover('synthetic-approved',context)};
}
test('Estate remote binds an approved resource and validates an envelope through the shared SSH executor',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.state,'AVAILABLE');assert.equal(f.calls.length,1);
 assert.deepEqual(f.states.map((s:any)=>s.state),['DISCOVERED','CONNECTING','AVAILABLE']);
 const [command,args,input,options]=f.calls[0] as [string,string[],string,any];assert.equal(command,'ssh');assert.ok(args.includes('StrictHostKeyChecking=yes'));assert.ok(args.includes('ConnectionAttempts=1'));assert.deepEqual(args.slice(-6),['timeout','--signal=TERM','--kill-after=2','12','python3','-']);assert.equal(options.ownedExecution,f.context.ownedExecution);assert.equal(options.session.remoteTransport,true);assert.equal(options.session.transformOutputLine('stderr','private route and secret'),undefined);assert.ok(!options.session.commandLabel.includes('approved.example.invalid'));assert.ok(!input.includes('approved.example.invalid'));
});
const denials:Array<[string,(r:ResourceConfig)=>void]>=[
 ['disabled resource',r=>{r.managedNode!.enabled=false;}],['disabled Estate binding',r=>{r.estateDiscovery!.enabled=false;}],
 ['missing authorisation',r=>{r.estateDiscovery!.authorisationDigest='';}],['missing identity pin',r=>{delete r.estateDiscovery!.expectedIdentitySha256;}],
 ['wrong scope',r=>{(r.estateDiscovery as any).scope='logs';}],['non-SSH transport',r=>{r.transport.type='local';}],
 ['host option injection',r=>{r.transport.host='-oProxyCommand=whoami';}],['host shell injection',r=>{r.transport.host='host; touch /tmp/forbidden';}],
 ['user shell injection',r=>{r.transport.user='user$(id)';}],['identity newline injection',r=>{r.transport.identityFile='/fixture/key\n-oProxyCommand=id';}],
 ['invalid port',r=>{r.transport.port=-1;}],['relative identity path',r=>{r.transport.identityFile='unsafe-key';}],
 ['same physical controller identity',r=>{r.estateDiscovery!.expectedIdentitySha256=localPin;}]
];
for(const [label,mutate] of denials)test(`Estate remote rejects ${label} before dispatch`,async()=>{const f=fixture();mutate(f.config.resources[0]);assert.equal((await f.run()).state,'UNAUTHORISED');assert.equal(f.calls.length,0);});
test('Estate remote rejects unknown IDs and arbitrary endpoint strings without local fallback',async()=>{const f=fixture();for(const id of ['unknown','ssh://arbitrary.invalid','synthetic-approved;id'])assert.equal((await f.adapter.discover(id,f.context)).state,'UNAUTHORISED');assert.equal(f.calls.length,0);});
test('Estate remote refuses duplicate configured identities',async()=>{const f=fixture();f.config.resources.push(resource());assert.equal((await f.run()).state,'UNAUTHORISED');assert.equal(f.calls.length,0);});
test('Estate remote contains private configuration-loader failures before dispatch',async()=>{const f=fixture(),adapter=new EstateRemoteAdapter(()=>{throw Error('private-host secret configuration');},success);const r=await adapter.discover(resource().id,f.context);assert.equal(r.state,'UNAUTHORISED');assert.ok(!JSON.stringify(r).includes('private-host'));assert.throws(()=>new EstateDiscovery({root:fs.mkdtempSync(path.join(os.tmpdir(),'estate-config-test-')),config:()=>{throw Error('private-host secret');}}),/^Error: estate_configuration_unavailable$/);});
test('Estate remote exposes no caller-controlled command arguments',()=>{const args=estateSshArgs(resource());assert.ok(args.includes('ConnectTimeout=8'));assert.ok(args.includes('UpdateHostKeys=no'));assert.ok(!args.includes('sh'));assert.ok(!args.includes('-c'));});
const invalid:Array<[string,(e:any)=>void]>=[
 ['schema mismatch',e=>e.schema='other/v1'],['claimed host mismatch',e=>e.host.identitySha256='d'.repeat(64)],
 ['nonce mismatch',e=>e.nonce='00000000-0000-4000-8000-000000000000'],['resource impersonation',e=>e.resourceAlias='resource:another'],
 ['unapproved extra data',e=>e.privateEndpoint='do-not-retain.example.invalid'],['stale observation',e=>e.observedAt='2000-01-01T00:00:00Z'],
 ['false completion',e=>{e.cpuCount=null;}],['wrong provenance method',e=>e.method='untrusted'],['invalid numeric metadata',e=>e.memoryBytes=-1]
];
for(const [label,mutate] of invalid)test(`Estate remote rejects ${label}`,async()=>{const f=fixture(async(_c,_a,input)=>{const e=envelope(input);mutate(e);return{status:0,stdout:JSON.stringify(e),stderr:''};});assert.equal((await f.run()).state,'INVALID_RESPONSE');});
test('Estate remote rejects malformed and oversized output without retaining response text',async()=>{for(const stdout of ['private-secret not json','x'.repeat(40*1024)]){const f=fixture(async()=>({status:0,stdout,stderr:''}));const r=await f.run();assert.equal(r.state,'INVALID_RESPONSE');assert.ok(!JSON.stringify([r,f.states]).includes('private-secret'));}});
test('Estate remote reports valid partial metadata as DEGRADED',async()=>{const f=fixture(async(_c,_a,input)=>{const e:any=envelope(input);e.cpuCount=null;e.missing=['CPU_UNAVAILABLE'];e.status='PARTIAL';return{status:0,stdout:JSON.stringify(e),stderr:''};});assert.equal((await f.run()).state,'DEGRADED');});
for(const [label,response,wanted] of [
 ['connection timeout',{status:255,stdout:'',stderr:'Connection timed out: private-host'},'TIMED_OUT'],
 ['command timeout',{status:124,stdout:'',stderr:''},'TIMED_OUT'],
 ['executor timeout',{status:255,stdout:'',stderr:'',timedOut:true},'TIMED_OUT'],
 ['unreachable transport',{status:255,stdout:'',stderr:'network is unreachable private-host secret=abc'},'UNREACHABLE'],
 ['transport authentication',{status:255,stdout:'',stderr:'Permission denied private-host'},'UNAUTHORISED'],
 ['collector failure',{status:1,stdout:'',stderr:'private host diagnostic'},'INVALID_RESPONSE']
] as const)test(`Estate remote classifies ${label} without private diagnostics`,async()=>{const f=fixture(async()=>response),r=await f.run();assert.equal(r.state,wanted);assert.ok(!JSON.stringify([r,f.states]).includes('private-host'));assert.equal(f.calls.length,1);});
test('Estate remote sanitises thrown transport errors',async()=>{const f=fixture(async()=>{throw Error('private-host token=do-not-retain');});assert.equal((await f.run()).state,'UNREACHABLE');assert.ok(!JSON.stringify(f.states).includes('private-host'));});
test('Estate remote honours pre-dispatch cancellation',async()=>{const f=fixture();f.controller.abort();assert.equal((await f.run()).state,'CANCELLED');assert.equal(f.calls.length,0);});
test('Estate remote cancellation terminates owned execution even if transport ignores the signal',async()=>{const f=fixture(async()=>new Promise(()=>{}));const pending=f.run();f.controller.abort();assert.equal((await pending).state,'CANCELLED');assert.equal(f.cleanups(),1);});
test('Estate remote overall deadline is bounded independently of an unresponsive executor',async t=>{t.mock.timers.enable({apis:['setTimeout']});const f=fixture(async()=>new Promise(()=>{})),pending=f.run();t.mock.timers.tick(ESTATE_REMOTE_LIMITS.overallMs);assert.equal((await pending).state,'TIMED_OUT');assert.equal(f.cleanups(),1);});
test('Estate remote revalidates authorisation after transport completion',async()=>{let f:ReturnType<typeof fixture>;f=fixture(async(_c,_a,input)=>{f.config.resources[0].estateDiscovery!.enabled=false;return{status:0,stdout:JSON.stringify(envelope(input)),stderr:''};});assert.equal((await f.run()).state,'UNAUTHORISED');});

function native(executor:SshExecutor=success){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'estate-native-synthetic-')),config=emptyConfig();config.resources=[resource()];
 const estate=new EstateDiscovery({root:path.join(root,'estate'),config:()=>config,remoteExecutor:executor,controllerIdentity:async()=>localPin});
 const runtime=createJobRuntime(path.join(root,'jobs'),new JobCatalog(),new ActionRegistry(),new WorkerRegistry());registerEstateDiscovery(runtime,estate);
 const permission=estate.grant({categories:['PASSIVE_INVENTORY','REMOTE_HOST_DISCOVERY'],targetIds:[estateResourceAlias(resource().id)]},'SYNTHETIC_TEST');
 const start=()=>runtime.createRun('discover-estate@1.0.0',{permissionId:permission.id},{type:'manual',actor:'SYNTHETIC_TEST'});
 const run=async()=>{const job=start();await runtime.tick();return{job:runtime.ledger.get(job.id)!,snapshot:estate.latest()!};};
 return{root,config,estate,runtime,permission,start,run};
}
test('SYNTHETIC native Jobs reconcile three remote passes with stable host/entity/relationship IDs',async()=>{
 const f=native();const a=await f.run(),b=await f.run(),c=await f.run();assert.equal(a.job.status,'SUCCEEDED');
 for(const relation of a.snapshot.relationships)assert.ok(a.snapshot.diff.some(d=>d.id===relation.id&&d.change==='NEW'));
 assert.ok(a.snapshot.comparison?.records.every(r=>r.changes.includes('NEW')||r.changes.includes('MODEL_ADDED')));
 const hostId=`host:${estateResourceAlias(resource().id)}`;
 assert.equal(c.snapshot.entities.find(e=>e.id===hostId)?.state,'AVAILABLE');assert.ok(c.snapshot.entities.some(e=>e.id==='host:controller-local'));
 assert.deepEqual(a.snapshot.entities.map(e=>e.id),c.snapshot.entities.map(e=>e.id));assert.deepEqual(a.snapshot.relationships.map(e=>e.id),c.snapshot.relationships.map(e=>e.id));
 for(const old of a.snapshot.entities)assert.equal(c.snapshot.entities.find(e=>e.id===old.id)?.firstSeen,old.firstSeen);
 for(const old of a.snapshot.relationships)assert.equal(c.snapshot.relationships.find(e=>e.id===old.id)?.firstSeen,old.firstSeen);
 assert.equal(new Set(c.snapshot.relationships.map(e=>e.id)).size,c.snapshot.relationships.length);assert.ok(c.snapshot.relationships.some(e=>e.from==='host:controller-local'&&e.to===hostId&&e.basis==='VERIFIED'));
 assert.ok(c.snapshot.comparison?.records.some(e=>e.id===hostId&&e.changes.includes('UNCHANGED')));assert.ok(b.snapshot.entities.find(e=>e.id===hostId)?.lastSuccessfulDiscovery);
 assert.ok(c.snapshot.events.some(e=>e.type==='REMOTE_CONNECTING'));assert.ok(c.job.artifacts.length>0);
});
test('SYNTHETIC native partial completion retains local graph, stale remote children and relationships, then recovers',async()=>{
 let down=false;const f=native(async(...args)=>down?{status:255,stdout:'',stderr:'network is unreachable'}:success(...args));
 const a=await f.run();down=true;const b=await f.run();assert.equal(b.job.status,'SUCCEEDED');assert.equal(b.snapshot.status,'PARTIAL');
 const hostId=`host:${estateResourceAlias(resource().id)}`,old=a.snapshot.entities.find(e=>e.id===hostId)!,failed=b.snapshot.entities.find(e=>e.id===hostId)!;
 assert.equal(failed.state,'UNREACHABLE');assert.equal(failed.lastSuccessfulDiscovery,old.lastSuccessfulDiscovery);assert.equal(failed.lastSeen,old.lastSeen);
 assert.ok(b.snapshot.entities.some(e=>e.id==='host:controller-local'&&e.state==='VERIFIED'));assert.ok(b.snapshot.entities.some(e=>e.hostId===hostId&&e.state==='STALE'));
 assert.ok(b.snapshot.relationships.some(e=>e.to===hostId&&e.state==='STALE'));assert.ok(!b.snapshot.diff.some(e=>['REMOVED','MODEL_REMOVED'].includes(e.change)));
 down=false;const c=await f.run();assert.equal(c.snapshot.entities.find(e=>e.id===hostId)?.state,'AVAILABLE');assert.ok(c.snapshot.events.some(e=>e.entity?.id===hostId&&e.entity.state==='RECOVERED'));
 assert.ok(c.snapshot.diff.some(e=>e.id===hostId&&e.change==='RECOVERED'));assert.equal(c.snapshot.entities.filter(e=>e.id===hostId).length,1);assert.ok(!c.snapshot.entities.some(e=>e.state==='STALE'));
 assert.ok(estateProjection(b.snapshot).entities.some(e=>e.id===hostId&&e.state==='UNREACHABLE'));
});
test('SYNTHETIC native resource binding drift invalidates a granted permission before dispatch',async()=>{const f=native();f.config.resources[0].transport.host='changed.example.invalid';assert.throws(()=>f.estate.assertPermission(f.permission.id),/binding_changed/);});
test('SYNTHETIC native discovery cannot use remote transport without the category grant',async()=>{let calls=0;const f=native(async(...args)=>{calls++;return success(...args);});const p=f.estate.grant({categories:['PASSIVE_INVENTORY'],targetIds:[estateResourceAlias(resource().id)]},'SYNTHETIC_TEST');const job=f.runtime.createRun('discover-estate@1.0.0',{permissionId:p.id},{type:'manual',actor:'SYNTHETIC_TEST'});await f.runtime.tick();assert.equal(calls,0);assert.equal(f.runtime.ledger.get(job.id)?.status,'SUCCEEDED');assert.ok(f.estate.latest()?.entities.some(e=>e.state==='BLOCKED'));});
test('SYNTHETIC native Job cancellation reaches the remote adapter and retains cancelled evidence',async()=>{
 let entered!:()=>void;const arrived=new Promise<void>(r=>entered=r);const f=native(async()=>{entered();return new Promise(()=>{});});const job=f.start(),tick=f.runtime.tick();await arrived;f.runtime.cancel(job.id);await tick;assert.notEqual(f.runtime.ledger.get(job.id)?.status,'SUCCEEDED');assert.ok(f.estate.latest()?.events.some(e=>e.type==='REMOTE_CANCELLED'));
});
test('SYNTHETIC malformed remote results add no CPU or cross-host verification',async()=>{const f=native(async()=>({status:0,stdout:'bad',stderr:''}));const r=await f.run();assert.equal(r.snapshot.status,'PARTIAL');assert.ok(!r.snapshot.entities.some(e=>e.id.startsWith('cpu:resource:')));assert.ok(!r.snapshot.relationships.some(e=>e.to.startsWith('host:resource:')&&e.basis==='VERIFIED'));assert.equal(estateComparison(null,r.snapshot).records.length,r.snapshot.entities.length+r.snapshot.relationships.length);});
test('SYNTHETIC native cancellation retains previous remote entities and relationships as stale',async()=>{
 let hang=false,entered!:()=>void;const arrived=new Promise<void>(r=>entered=r);const f=native(async(...args)=>{if(hang){entered();return new Promise(()=>{});}return success(...args);});const before=await f.run();hang=true;const job=f.start(),tick=f.runtime.tick();await arrived;f.runtime.cancel(job.id);await tick;const after=f.estate.latest()!;assert.equal(after.entities.length,before.snapshot.entities.length);assert.equal(after.relationships.length,before.snapshot.relationships.length);assert.ok(after.entities.some(e=>e.id.startsWith('cpu:resource:')&&e.state==='STALE'));assert.ok(!after.diff.some(e=>e.change==='REMOVED'));
});
test('Estate host zones and colours derive from real projection identities and explicit states',async()=>{
 const layout=await import(new URL('../../assets/dashboard/estate-client.js',import.meta.url).href),colours=await import(new URL('../../assets/dashboard/factory-layout.js',import.meta.url).href);const f=native(),r=await f.run(),projection=estateProjection(r.snapshot),positioned=layout.positionEstate(projection.entities);assert.equal(positioned.hostZones.length,2);assert.equal(new Set(positioned.hostZones.map((z:any)=>z.id)).size,2);assert.notEqual(colours.entityColour({state:'AVAILABLE'}),colours.entityColour({state:'UNREACHABLE'}));assert.notEqual(colours.entityColour({state:'UNAUTHORISED'}),colours.entityColour({state:'AVAILABLE'}));
});

const hardwareEnvelope=(input:string)=>({...envelope(input),cpuModel:'Fixture CPU',gpuInventory:{status:'OBSERVED',devices:[{index:0,model:'Fixture NVIDIA GPU',memoryMiB:6144,driver:'580.1'}]}});
test('Estate remote accepts bounded hardware metadata without changing identity or core completeness',async()=>{
 const f=fixture(async(_c,_a,input)=>({status:0,stdout:JSON.stringify(hardwareEnvelope(input)),stderr:''})),r=await f.run();
 assert.equal(r.state,'AVAILABLE');assert.ok('envelope' in r);assert.equal(r.envelope.host.identitySha256,pin);assert.equal(r.envelope.gpuInventory?.devices[0].memoryMiB,6144);
});
test('Estate remote rejects malformed hardware inventories before graph trust',async()=>{
 for(const mutate of [(e:any)=>e.gpuInventory.devices.push(e.gpuInventory.devices[0]),(e:any)=>e.gpuInventory.status='UNAVAILABLE',(e:any)=>e.gpuInventory.devices[0].memoryMiB=-1,(e:any)=>e.gpuInventory.devices[0].privateEndpoint='private.invalid',(e:any)=>e.cpuModel='bad\nmodel',(e:any)=>e.gpuInventory.devices=Array(33).fill(e.gpuInventory.devices[0])]){
  const f=fixture(async(_c,_a,input)=>{const e=hardwareEnvelope(input);mutate(e);return{status:0,stdout:JSON.stringify(e),stderr:''};});assert.equal((await f.run()).state,'INVALID_RESPONSE');
 }
});
test('SYNTHETIC native GPU inventory has stable identity, provenance and stale retention on missing tooling',async()=>{
 let missing=false;const f=native(async(_c,_a,input)=>{const e=hardwareEnvelope(input);if(missing)e.gpuInventory={status:'UNAVAILABLE',devices:[]};return{status:0,stdout:JSON.stringify(e),stderr:''};});
 const a=(await f.run()).snapshot,b=(await f.run()).snapshot,hostId=`host:${estateResourceAlias(resource().id)}`,gpu=a.entities.find(e=>e.hostId===hostId&&e.kind==='gpu')!;
 assert.ok(gpu);assert.equal(gpu.attributes.memoryMiB,6144);assert.equal(b.entities.find(e=>e.id===gpu.id)?.firstSeen,gpu.firstSeen);assert.ok(a.relationships.some(r=>r.to===gpu.id&&r.basis==='VERIFIED'));assert.equal(gpu.evidence[0].category,'REMOTE_HOST_DISCOVERY');
 missing=true;const c=(await f.run()).snapshot;assert.equal(c.entities.find(e=>e.id===gpu.id)?.state,'STALE');assert.ok(!c.diff.some(d=>d.id===gpu.id&&d.change==='REMOVED'));
});
test('Estate host summaries show both hosts hardware, unknown GPU coverage and failed-contact staleness',async()=>{
 const {hostHardware}=await import(new URL('../../assets/dashboard/estate-client.js',import.meta.url).href),f=native(async(_c,_a,input)=>({status:0,stdout:JSON.stringify(hardwareEnvelope(input)),stderr:''})),s=(await f.run()).snapshot,p=estateProjection(s),hostId=`host:${estateResourceAlias(resource().id)}`;
 const rows=hostHardware(p,hostId);assert.match(rows[0].value,/Fixture CPU.*4 logical CPUs/);assert.equal(rows[1].value,'8.0 GiB');assert.match(rows[2].value,/6.0 GiB VRAM/);assert.match(hostHardware(p,'host:controller-local')[0].value,/logical CPUs/);
 p.entities.find(e=>e.id===hostId)!.state='UNREACHABLE';assert.ok(hostHardware(p,hostId).every((r:any)=>r.state==='STALE'));
 const legacy=native(),old=estateProjection((await legacy.run()).snapshot);assert.equal(hostHardware(old,hostId)[2].state,'UNKNOWN');assert.match(hostHardware(old,hostId)[2].value,/Unknown/);
});
test('Estate GPU inventory distinguishes observed NVIDIA absence from unavailable metadata',async()=>{
 const {hostHardware}=await import(new URL('../../assets/dashboard/estate-client.js',import.meta.url).href),f=native(async(_c,_a,input)=>{const e=hardwareEnvelope(input);e.gpuInventory.devices=[];return{status:0,stdout:JSON.stringify(e),stderr:''};}),p=estateProjection((await f.run()).snapshot),rows=hostHardware(p,`host:${estateResourceAlias(resource().id)}`);
 assert.equal(rows[2].value,'None reported by NVIDIA driver');assert.ok(!p.entities.some(e=>e.id.startsWith('gpu:resource:')));
});
test('Fixed collector parses only approved hardware fields and preserves canonical machine identity',()=>{
 const program=fs.readFileSync(new URL('../../scripts/estate-remote-probe.py',import.meta.url),'utf8');
 const prefix=`import subprocess,json,hashlib\nREQUEST={'resourceAlias':'fixture','nonce':'fixture'}\ndef mock(args,**kw):\n assert kw['timeout']==2\n if args==['systemd-id128','machine-id']: return 'A'*32\n if args==['lscpu','--json']: return json.dumps({'lscpu':[{'field':'Model name:','data':'Fixture CPU'},{'field':'Unapproved:','data':'DO_NOT_EMIT'}]})\n if args==['nvidia-smi','--query-gpu=index,name,memory.total,driver_version','--format=csv,noheader,nounits']: return '0, Fixture NVIDIA GPU, 6144, 580.1\\n'\n raise Exception('unexpected command')\nsubprocess.check_output=mock\n`;
 const output=execFileSync('python3',['-'],{input:prefix+program,encoding:'utf8'}),e=JSON.parse(output);assert.equal(e.cpuModel,'Fixture CPU');assert.equal(e.gpuInventory.devices[0].memoryMiB,6144);assert.ok(!output.includes('DO_NOT_EMIT'));assert.ok(!output.includes('A'.repeat(32)));
 const expected=execFileSync('python3',['-c',"import hashlib;print(hashlib.sha256(('agent-control-machine/v1:'+'a'*32).encode()).hexdigest())"],{encoding:'utf8'}).trim();assert.equal(e.host.identitySha256,expected);
});
test('Fixed collector reports optional utility failure as unknown without losing pinned identity',()=>{
 const program=fs.readFileSync(new URL('../../scripts/estate-remote-probe.py',import.meta.url),'utf8'),prefix=`import subprocess,json\nREQUEST={'resourceAlias':'fixture','nonce':'fixture'}\ndef mock(args,**kw):\n if args[0]=='systemd-id128': return 'a'*32\n raise subprocess.TimeoutExpired(args,2)\nsubprocess.check_output=mock\n`;
 const e=JSON.parse(execFileSync('python3',['-'],{input:prefix+program,encoding:'utf8'}));assert.equal(e.cpuModel,null);assert.deepEqual(e.gpuInventory,{status:'UNAVAILABLE',devices:[]});assert.equal(e.host.identitySha256.length,64);
});

const platformEnvelope=(input:string,platform:'windows'|'android')=>({...hardwareEnvelope(input),method:platform==='windows'?'smbios-uuid+cim-metadata/v1':'termux-ssh-host-key+android-metadata/v1',host:{identitySha256:pin,platform,architecture:platform==='windows'?'x86_64':'aarch64',identityScope:platform==='windows'?'SMBIOS_UUID':'SSH_INSTALLATION'},status:platform==='android'?'PARTIAL':'COMPLETE',missing:platform==='android'?['PHYSICAL_IDENTITY_UNAVAILABLE']:[],gpuInventory:platform==='windows'?{status:'OBSERVED',source:'WINDOWS_CIM',devices:[{index:0,model:'Fixture integrated GPU',memoryMiB:null,driver:'32.1'}]}:{status:'UNAVAILABLE',devices:[]}});
for(const platform of ['windows','android'] as const)test(`Estate ${platform} uses its pinned identity contract and native owned SSH without Linux managed-node authority`,async()=>{
 const f=fixture(async(_c,_a,input)=>{const decoded=platform==='windows'?Buffer.from(input.match(/FromBase64String\('([^']+)'\)/)![1],'base64').toString():JSON.stringify(request(input));const data=JSON.parse(decoded);const e=platformEnvelope(estateProbeProgram(data.resourceAlias,data.nonce),platform);return{status:0,stdout:JSON.stringify(e),stderr:''};});f.config.resources[0].platform=platform;delete f.config.resources[0].managedNode;
 const r=await f.run();assert.equal(r.state,platform==='android'?'DEGRADED':'AVAILABLE');assert.ok('envelope' in r);assert.equal(r.envelope.host.identityScope,platform==='android'?'SSH_INSTALLATION':'SMBIOS_UUID');assert.equal(f.calls.length,1);assert.equal((f.calls[0][3] as any).ownedExecution,f.context.ownedExecution);
});
for(const [label,mutate] of [
 ['Android falsely claims full physical identity',(e:any)=>{e.status='COMPLETE';e.missing=[];}],
 ['Android swaps hardware identity scope',(e:any)=>e.host.identityScope='SMBIOS_UUID'],
 ['Android omits identity scope',(e:any)=>delete e.host.identityScope],
 ['platform swaps method',(e:any)=>e.method=ESTATE_REMOTE_METHOD],
 ['Android invents Windows GPU provenance',(e:any)=>e.gpuInventory={status:'OBSERVED',source:'WINDOWS_CIM',devices:[]}],
] as const)test(`Estate platform validator rejects ${label}`,()=>{
 const input=estateProbeProgram('resource:fixture','00000000-0000-4000-8000-000000000000'),e=platformEnvelope(input,'android');mutate(e);assert.throws(()=>validateEstateEnvelope(JSON.stringify(e),'resource:fixture','00000000-0000-4000-8000-000000000000',pin,localPin,'android'));
});
test('Estate platform validator rejects a response from a different configured platform',()=>{
 const nonce='00000000-0000-4000-8000-000000000000',e=platformEnvelope(estateProbeProgram('resource:fixture',nonce),'windows');assert.throws(()=>validateEstateEnvelope(JSON.stringify(e),'resource:fixture',nonce,pin,localPin,'linux'),/platform_mismatch/);
});
test('Estate Windows command has a fixed remote deadline and sends requests only as encoded data',()=>{
 const r=resource();r.platform='windows';const args=estateSshArgs(r);assert.ok(args.includes('-EncodedCommand'));const wrapper=Buffer.from(args.at(-1)!,'base64').toString('utf16le');assert.ok(wrapper.includes('WaitOne(12000)'));assert.ok(wrapper.includes('$p.Stop()'));assert.ok(wrapper.includes('exit 124'));assert.ok(!wrapper.includes(r.transport.host!));
 const script=estateProbeProgram("resource:'; throw 'injected",'00000000-0000-4000-8000-000000000000','windows');assert.ok(!script.includes("resource:'; throw 'injected"));assert.throws(()=>estateProbeProgram('fixture','nonce','unknown'),/unsupported/);
});
test('SYNTHETIC Android native graph stays partial while retaining authenticated hardware observations',async()=>{
 const f=native(async(_c,_a,input)=>({status:0,stdout:JSON.stringify(platformEnvelope(input,'android')),stderr:''}));f.config.resources[0].platform='android';delete f.config.resources[0].managedNode;
 const permission=f.estate.grant({categories:['PASSIVE_INVENTORY','REMOTE_HOST_DISCOVERY'],targetIds:[estateResourceAlias(resource().id)]},'SYNTHETIC_TEST');const run=f.runtime.createRun('discover-estate@1.0.0',{permissionId:permission.id},{type:'manual',actor:'SYNTHETIC_TEST'});await f.runtime.tick();assert.equal(f.runtime.ledger.get(run.id)?.status,'SUCCEEDED');const s=f.estate.latest()!,host=s.entities.find(e=>e.id===`host:${estateResourceAlias(resource().id)}`)!;assert.equal(s.status,'PARTIAL');assert.equal(host.state,'DEGRADED');assert.equal(host.attributes.identityScope,'SSH_INSTALLATION');assert.ok(s.entities.some(e=>e.hostId===host.id&&e.kind==='cpu'));assert.ok(!s.entities.some(e=>e.hostId===host.id&&e.kind==='gpu'));
});
test('Windows graphics summary never presents shared adapter memory as dedicated VRAM',async()=>{
 const {hostHardware}=await import(new URL('../../assets/dashboard/estate-client.js',import.meta.url).href),p={entities:[{id:'host:w',kind:'host',state:'AVAILABLE',detail:{attributes:{platform:'windows'}}},{id:'gpu:w:0',kind:'gpu',state:'IDENTIFIED',laneId:'host:w',detail:{attributes:{inventorySource:'WINDOWS_CIM',model:'Integrated GPU',memoryMiB:null}}}]};const gpu=hostHardware(p,'host:w')[2];assert.equal(gpu.label,'GPU');assert.equal(gpu.value,'Integrated GPU');
});
test('Android collector hashes only the existing public host-key identity and explicitly reports its limitation',()=>{
 const program=fs.readFileSync(new URL('../../scripts/estate-android-probe.py',import.meta.url),'utf8');
 const prefix=`import subprocess,json\nREQUEST={'resourceAlias':'fixture','nonce':'fixture'}\ndef mock(args,**kw):\n assert kw['timeout']==2\n if args[0]=='ssh-keygen':\n  assert args[-1]=='/data/data/com.termux/files/usr/etc/ssh/ssh_host_ed25519_key.pub'\n  return '256 SHA256:'+('A'*43)+' private-comment (ED25519)'\n if args[0]=='/system/bin/getprop':\n  assert args[1] in ['ro.soc.model','ro.product.model','ro.build.version.release']\n  return 'Fixture'\n raise Exception('unexpected command')\nsubprocess.check_output=mock\n`;
 const text=execFileSync('python3',['-'],{input:prefix+program,encoding:'utf8'}),e=JSON.parse(text);assert.equal(e.host.identityScope,'SSH_INSTALLATION');assert.equal(e.status,'PARTIAL');assert.ok(e.missing.includes('PHYSICAL_IDENTITY_UNAVAILABLE'));assert.ok(!text.includes('SHA256:'));assert.ok(!text.includes('private-comment'));
});

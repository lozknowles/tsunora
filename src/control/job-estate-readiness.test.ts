import test from 'node:test';
import assert from 'node:assert/strict';
import {operationalReadiness,projectJobEstateMap,type DeclaredReadiness,type ExecutionAdmission} from './job-estate-readiness.js';
import {estateObservationState} from './estate-map.js';
import {CredentialDiscoveryAdapter,LocalRuntimeDiscoveryAdapter,ConfiguredResourceDiscoveryAdapter,type DiscoveryScan,type DiscoveryAdapterContext} from './environment-discovery.js';
import {projectEstateMap} from './estate-map.js';
import {emptyConfig} from './config.js';
import {AgentControlService} from './application-service.js';
import {PtyRegistry} from './pty.js';
import type {EnvironmentDiscoveryRuntime} from './environment-discovery.js';
const now=new Date('2026-09-13T12:00:00Z');
function fixture() {
  const item=(id:string,kind:string)=>({id,kind,nodeId:'node-a',label:id,health:'HEALTHY',lifecycle:'DISCOVERED',operationalState:'AVAILABLE',resourceClasses:[],change:'NEW',fingerprint:id,attributes:{},provenance:[{adapter:'probe',method:'read-only',authority:'AUTHORITATIVE',observedAt:now.toISOString()}]});
  const scan={schema:'agent-control.environment-discovery/v1',id:'scan',status:'COMPLETED',completedAt:now.toISOString(),startedAt:now.toISOString(),includeRemote:false,includeMemory:false,failures:[],recommendations:[],summary:{machines:1,gpus:0,localModels:0,providers:0,agents:0,tools:1,memorySources:0,healthy:2,needsQualification:0,unavailable:0,new:2},items:[item('machine','MACHINE'),item('tool','TOOL')],mode:'FULL_DISCOVERY',testing:'QUICK_TEST'} as DiscoveryScan;
  const candidate={resourceId:'tool',nodeId:'node-a',capability:'evidence.report',confidence:'VERIFIED',evidence:{fingerprint:'tool',expiresAt:new Date(+now+3600000).toISOString()}};
  const declared:DeclaredReadiness={id:'job',jobDigest:'a'.repeat(64),primaryState:'READY',qualification:'NOT_YET_QUALIFIED',authority:{state:'NO_APPROVAL_REQUIRED'},reasons:[],requirements:[{type:'capability',requirement:'evidence.report',satisfied:true,candidates:[candidate],evidence:[candidate]}]};
  const admission:ExecutionAdmission={jobDigest:declared.jobDigest,resourceIds:['tool'],capabilities:['evidence.report'],state:'QUALIFIED',runId:'run-real-proof',artifactSha256:'b'.repeat(64),implementationSha256:'c'.repeat(64),expiresAt:new Date(+now+120000).toISOString(),authentication:'NOT_REQUIRED',scope:'READ_ONLY_LOCAL_INSPECTION'};
  return {scan,declared,admission};
}
test('declaration without an admitted executor is not operational READY',()=>{
  const {scan,declared}=fixture();const r=operationalReadiness(declared,scan,[],now);
  assert.equal(r.declaredReadiness,'READY');assert.equal(r.primaryState,'UNSUPPORTED');assert.equal(r.executionAdmission,null);
});
test('qualified executor and live resources permit readiness without implying approval or execution',()=>{
  const {scan,declared,admission}=fixture();declared.authority.state='APPROVAL_REQUIRED';
  const r=operationalReadiness(declared,scan,[admission],now);
  assert.equal(r.primaryState,'READY');assert.equal(r.authority.state,'APPROVAL_REQUIRED');assert.equal(r.authorityGranted,false);assert.equal(r.executable,false);
});
test('stale parent invalidates a fresh tool and long-lived capability proof',()=>{
  const {scan,declared,admission}=fixture();scan.items[0].provenance[0].observedAt=new Date(+now-121000).toISOString();
  assert.equal(operationalReadiness(declared,scan,[admission],now).primaryState,'BLOCKED');
});
test('configured-only, future and offline observations cannot establish liveness',()=>{
  const {scan}=fixture();const i=scan.items[0];i.provenance[0].authority='CONFIGURED';assert.equal(estateObservationState(i,+now).alive,false);
  i.provenance[0].authority='AUTHORITATIVE';i.provenance[0].observedAt=new Date(+now+1000).toISOString();assert.equal(estateObservationState(i,+now).alive,false);
  i.provenance[0].observedAt=now.toISOString();i.health='OFFLINE';assert.equal(estateObservationState(i,+now).alive,false);
});
test('authentication failure retains its specific gap and blocks capability use',()=>{
  const {scan,declared,admission}=fixture();scan.items[1].attributes.authenticationState='AUTHENTICATION_REQUIRED';
  const r=operationalReadiness(declared,scan,[admission],now);assert.ok(r.reasons.some(e=>e.state==='AUTHENTICATION_REQUIRED'));assert.notEqual(r.primaryState,'READY');
});
test('expired or wrong-digest admission cannot satisfy another job',()=>{
  const {scan,declared,admission}=fixture();
  assert.equal(operationalReadiness(declared,scan,[{...admission,jobDigest:'d'.repeat(64)}],now).primaryState,'UNSUPPORTED');
  assert.equal(operationalReadiness(declared,scan,[{...admission,expiresAt:now.toISOString()}],now).primaryState,'UNSUPPORTED');
});
test('Estate Map connects jobs, requirements and real resources without phantom resource nodes',()=>{
  const {scan,declared,admission}=fixture();const r=operationalReadiness(declared,scan,[admission],now);
  const map=projectJobEstateMap(scan,[r],[],now);assert.ok(map.edges.some(e=>e.from==='library-job:job'));
  assert.ok(map.edges.some(e=>e.from==='library-capability:capability:evidence.report'&&e.to==='tool'));
  assert.deepEqual((map.nodes.find(n=>n.id==='tool')!.detail.jobLibrary as any).readyJobs,['job']);
});
test('credential reference presence is FOUND, not authenticated or qualified',async()=>{
  const context={config:{...emptyConfig(),providers:[{id:'example',kind:'openai-compatible',credentialEnv:'REFERENCE_ENV'}]},environment:{REFERENCE_ENV:'synthetic-fixture'},observedAt:now.toISOString()} as unknown as DiscoveryAdapterContext;
  const records=await new CredentialDiscoveryAdapter().discover(context);assert.equal(records[0].attributes.authenticationState,'FOUND');assert.equal(records[0].lifecycle,'DISCOVERED');
  assert.ok(!JSON.stringify(records).includes('synthetic-fixture'));
});
test('unqualified executable with a successful status probe may be alive without capability qualification',()=>{
  const {scan}=fixture();const i=scan.items[1];i.kind='RUNTIME';i.health='NEEDS_QUALIFICATION';i.attributes.lastSuccessfullyVerifiedAt=now.toISOString();i.provenance[0].method='fixed-executable-and-status-discovery';
  assert.equal(estateObservationState(i,+now).alive,true);assert.equal(estateObservationState(i,+now).qualification,'DISCOVERED');
});
test('existing Estate Map service can consume freshly evaluated library impact',()=>{
  const {scan,declared}=fixture();let called=false;
  const service=new AgentControlService({version:1,paused:false,lastRestorePoint:null,lanes:[]},new PtyRegistry()).configureProjection({
    environmentDiscovery:{projection:()=>({latest:scan})} as EnvironmentDiscoveryRuntime,
    jobLibraryReadiness:(latest,at)=>{called=true;assert.equal(latest.id,scan.id);assert.ok(Number.isFinite(+at));return [operationalReadiness(declared,latest,[],at)];}});
  const map=service.estateMap();assert.equal(called,true);assert.ok(map.nodes.some(n=>n.id==='library-job:job'));
});
test('full and quick endpoint catalogue observations establish reachability without capability qualification',async()=>{
  const context={mode:'FULL_DISCOVERY',testing:'QUICK_TEST',config:emptyConfig(),environment:{},observedAt:now.toISOString(),probe:{
    command:async()=>({ok:false,stdout:'',stderr:''}),json:async()=>({ok:true,status:200,body:{data:[]}})}} as unknown as DiscoveryAdapterContext;
  const records=await new LocalRuntimeDiscoveryAdapter().discover(context);const endpoints=records.filter(r=>r.kind==='ENDPOINT');
  assert.ok(endpoints.length>0);assert.ok(endpoints.every(r=>r.health==='HEALTHY'&&r.lifecycle==='DISCOVERED'));
  const quick=await new LocalRuntimeDiscoveryAdapter().discover({...context,mode:'QUICK_RESCAN'});assert.deepEqual(quick.filter(r=>r.kind==='ENDPOINT').map(r=>r.id),endpoints.map(r=>r.id));
});
test('Estate Map cannot override computed liveness through attributes or ignore a stale parent',()=>{
  const {scan}=fixture();scan.items[0].provenance[0].observedAt=new Date(+now-121000).toISOString();
  scan.items[1].attributes.availability='ALIVE';scan.items[1].attributes.qualification='QUALIFIED';
  const map=projectEstateMap(scan,now.toISOString());const tool=map.nodes.find(n=>n.id==='tool')!;
  assert.equal(tool.detail.availability,'NOT_CURRENTLY_VERIFIED');assert.equal(tool.detail.qualification,'DISCOVERED');
});
test('a fresh configuration observation cannot refresh stale authoritative proof',()=>{
  const {scan}=fixture();scan.items[0].provenance[0].observedAt=new Date(+now-121000).toISOString();
  scan.items[0].provenance.push({adapter:'configuration',method:'declaration',authority:'CONFIGURED',observedAt:now.toISOString()});
  const map=projectEstateMap(scan,now.toISOString());assert.equal(map.nodes.find(n=>n.id==='machine')!.detail.freshness,'STALE');
});
test('rediscovery preserves the real managed-node probe timestamp instead of refreshing old health',async()=>{
  const lastProbeAt=new Date(+now-3600000).toISOString();
  const context={config:{...emptyConfig(),resources:[{id:'remote',platform:'linux',transport:{type:'ssh',host:'example.invalid'},capabilities:[]}]},
    managedNodes:[{resourceId:'remote',health:'healthy',lastProbeAt,storage:[],temperatures:[],connectivity:[]}],includeRemote:true,observedAt:now.toISOString()} as unknown as DiscoveryAdapterContext;
  const records=await new ConfiguredResourceDiscoveryAdapter().discover(context);
  assert.equal(records[0].provenance[0].observedAt,lastProbeAt);
});

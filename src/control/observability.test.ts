import test from 'node:test';
import assert from 'node:assert/strict';
import {nodeWorkIndex,projectNodeDashboard,projectRunInspector,projectJobInspector,inspectorHistory,scopedInspectorUsage,inspectorAccounting,executionRouteProjection} from './observability.js';
import {projectRuntimeMap,type RuntimeMapProjection,type RuntimeMapNode} from './runtime-map.js';
import type {WorkParcel} from './work-parcels.js';
import type {RunRecord} from './job-types.js';
import {MemoryHarnessEfficiencyLedger,createInvocationObservation} from './harness-efficiency.js';
import {usageProjection} from './usage-projection.js';
import {accountingSchema} from './usage-accounting.js';
import {LocalNodeResources,CpuCounterSampler,projectNvidiaMeasurements} from './node-resources.js';
const at='2026-09-13T10:00:00.000Z',later=new Date('2026-09-13T11:00:00.000Z');
function map():RuntimeMapProjection{return projectRuntimeMap({runs:[],sessions:[],sessionEvents:()=>[],now:at});}
function node(id:string,type:RuntimeMapNode['type'],detail:Record<string,unknown>={}):RuntimeMapNode{return{id,type,label:id,state:'SUCCEEDED',expandable:true,detail,evidence:[]};}
function estate(){const m=map();m.nodes=[node('physical-alpha','machine',{nodeId:'alpha',platform:'linux'}),node('physical-beta','machine',{nodeId:'beta',platform:'windows'}),node('accelerator-a','gpu',{nodeId:'alpha',deviceId:'physical-alpha'}),node('runtime-a','runtime',{nodeId:'alpha'}),node('runtime-unbound','runtime')];return m;}
function parcel():WorkParcel{return {id:'parcel-test',objective:'Review an example',status:'SUCCEEDED',createdAt:at,endedAt:at,stages:[],audit:{invocations:[{id:'call-1',accountingInvocationId:'ledger-1',stageId:'review',node:'alpha',providerExecutionNodeId:'alpha',workloadNodeId:'beta',credentialNodeId:'credentials-only',provider:'vendor-a',model:'model-a',providerModel:'model-version-a',startedAt:at,exchange:{input:'query api_key=forbidden-secret-value',output:'safe output',redacted:true,truncated:false},inputTokens:100,cachedInputTokens:40,freshInputTokens:60,outputTokens:20,totalTokens:120}],timeline:[{id:'event-1',at,type:'invocation.completed',summary:'Recorded call completed'}]},context:undefined} as unknown as WorkParcel;}
function usageLedger(){const ledger=new MemoryHarnessEfficiencyLedger();const accounting=accountingSchema.parse({schema:'agent-control.usage-accounting/v1',revision:0,parentInvocationId:null,retryOfInvocationId:null,parcelId:'parcel-test',batonId:null,providerRequestId:null,modelRevision:'model-version-a',runtime:'neutral-runtime',runtimeVersion:'1',machine:'alpha',hardware:'cpu',jobType:'review',executionKind:'API',provenance:{kind:'NATIVE',source:'test-reported-counter-adapter',sourceVersion:'1',migrationVersion:null,at},semantics:{id:'inclusive/v1',input:'INCLUDES_CACHE',reasoning:'IN_OUTPUT',total:'INPUT_PLUS_OUTPUT',billing:'TOKEN_PARTITIONS'},evidence:{input:100,cached:40,cacheWrite:0,output:20,reasoning:null,total:120},pricing:null,reportedCost:null,localApiChargeKnownZero:false});ledger.record(createInvocationObservation({id:'ledger-1',jobId:'review',runId:'run-a',taskId:'task-a',laneId:'lane-a',model:'model-a',provider:'vendor-a',harnessProfile:'STANDARD',executionStrategy:'test',startedAt:at,completedAt:at,recipeFingerprint:'fixture',accounting}));return ledger;}
function usage(){return usageProjection(usageLedger(),[],{period:'all',groupBy:'agent'},later);}
test('node dashboard uses exact identity, excludes unbound and other-node resources',()=>{const n=projectNodeDashboard(estate(),'physical-alpha',[],[]);assert.deepEqual(n.resources.map(r=>r.id),['accelerator-a','runtime-a']);assert.throws(()=>projectNodeDashboard(estate(),'runtime-a',[],[]),/node_missing/);});
test('CPU-only and Windows nodes do not acquire accelerator cards from another machine',()=>{const n=projectNodeDashboard(estate(),'physical-beta',[],[]);assert.equal(n.node.detail.platform,'windows');assert.equal(n.resources.filter(r=>r.type==='gpu').length,0);});
test('nested environments remain hierarchical and guest capacity is excluded from physical totals',()=>{
 const e=estate(),physical=e.nodes[0]!;physical.detail.cpuLogical=8;physical.detail.totalMemoryBytes=12_000;
 e.nodes.push({...node('android-host','runtime',{nodeId:'alpha',executionEnvironmentKind:'HOST_OS',executionContainment:{parentId:'physical-alpha'}}),parentId:'physical-alpha'}, {...node('linux-guest','runtime',{nodeId:'alpha',configuredId:'linux-guest',executionEnvironmentKind:'GUEST_OS',executionContainment:{parentId:'android-host'},transport:'ssh'}),parentId:'android-host'});
 const measurement=(value:number|null,source:string)=>({value,source,authority:value===null?'unavailable':'authoritative',freshness:value===null?'unavailable':'current',observedAt:at,limitations:[],qualifiedForAdmission:false});
 const managed={resourceId:'linux-guest',state:'ONLINE',health:'healthy',lastHeartbeatAt:at,lastProbeAt:at,os:{name:'Linux',version:'1',architecture:'aarch64'},measurements:{cpuLogical:measurement(2,'guest'),cpuBusyPercent:measurement(null,'guest'),memoryTotalBytes:measurement(6_000,'guest'),memoryAvailableBytes:measurement(4_000,'guest'),uptimeSeconds:measurement(1,'guest'),loadOne:measurement(null,'guest'),loadFive:measurement(null,'guest'),loadFifteen:measurement(null,'guest')},storage:[],optical:[],network:[],temperatures:[],services:[],containerRuntimes:[{id:'runtime-podman',environmentId:'linux-guest',kind:'PODMAN',version:'5',state:'AVAILABLE',observedAt:at,executableEvidence:'executable:podman',containers:[]}],connectivity:[],capabilities:['container.execute','transport.ssh'],workloads:[],currentWorkload:null,maintenance:{state:'APPROVAL_REQUIRED',detail:'test'},warnings:[]} as never;
 const dashboard=projectNodeDashboard(e,'physical-alpha',[managed],[]);assert.deepEqual(dashboard.executionEnvironments.map(item=>item.id),['android-host','linux-guest']);assert.equal(dashboard.executionEnvironments[1]?.runtimes[0]?.kind,'PODMAN');assert.equal(dashboard.resourceAccounting.physicalTotals.MEMORY_BYTES,12_000);assert.equal(dashboard.resourceAccounting.excludedFromEstateTotals.find(item=>item.metric==='MEMORY_BYTES')?.value,6_000);
 const route=executionRouteProjection(e,[managed],{workers:['linux-guest'],reason:'container.execute required',runtimeId:'runtime-podman'});assert.deepEqual(route.path.map(item=>item.id),['physical-alpha','android-host','linux-guest']);assert.equal(route.transport,'ssh');assert.equal(route.runtime?.kind,'PODMAN');
});
test('ordinary devices do not acquire empty nested-environment UI data',()=>{const dashboard=projectNodeDashboard(estate(),'physical-beta',[],[]);assert.deepEqual(dashboard.executionEnvironments,[]);assert.equal(dashboard.resourceAccounting.excludedFromEstateTotals.length,0);});
test('work binding uses provider execution, not workload or credential residency',()=>{const rows=nodeWorkIndex([parcel()],[],[]);assert.deepEqual(rows.map(r=>r.nodeId),['alpha']);assert.equal(projectNodeDashboard(estate(),'physical-beta',[],rows).work.length,0);});
test('active owned session establishes binding before completed model invocation exists',()=>{const p=parcel();p.audit.invocations=[];p.status='RUNNING';delete p.endedAt;const rows=nodeWorkIndex([p],[],[{id:'session-a',scope:{parcelId:p.id,nodeId:'beta'} as never,state:'RUNNING'}]);assert.equal(rows[0]?.nodeId,'beta');assert.equal(rows[0]?.endedAt,null);});
test('unbound work stays unbound and no default controller identity is invented',()=>{const p=parcel();p.audit.invocations=[];assert.deepEqual(nodeWorkIndex([p],[],[]),[]);});
test('repeated execution evidence does not duplicate node work',()=>{const p=parcel();p.audit.invocations.push({...p.audit.invocations[0]!,id:'call-2'});assert.equal(nodeWorkIndex([p],[],[]).length,1);});
test('Run Inspector preserves exact operation, provider and physical link',()=>{const p=parcel(),m=map();m.nodes=[node('model:call-1','model-call')];const i=projectRunInspector(p,m,usage(),estate(),'model:call-1');assert.equal(i.calls.length,1);assert.equal(i.calls[0]?.physicalNode,'physical-alpha');assert.equal(i.calls[0]?.provider,'vendor-a');assert.equal(i.calls[0]?.accounting?.id,'ledger-1');assert.throws(()=>projectRunInspector(p,m,usage(),estate(),'model:absent'),/operation_missing/);});
test('another operation cannot display an unrelated model exchange',()=>{const m=map();m.nodes=[node('tool-a','tool')];assert.equal(projectRunInspector(parcel(),m,usage(),estate(),'tool-a').calls.length,0);});
test('input/cache/fresh/output totals reuse canonical accounting without event snapshot addition',()=>{const p=parcel();p.audit.timeline.push({...p.audit.timeline[0]!,id:'event-2'});const i=projectRunInspector(p,map(),usage(),estate());assert.equal(i.usage.totals.input.value,100);assert.equal(i.usage.totals.cached.value,40);assert.equal(i.usage.totals.fresh.value,60);assert.equal(i.usage.totals.output.value,20);assert.equal(i.usage.totals.tokens.value,120);assert.equal(i.usage.totals.cacheHit.value,.4);assert.equal(i.usage.totals.apiCost.reported,0);});
test('empty accounting remains unknown, not zero cost or fictional savings',()=>{const i=projectRunInspector(parcel(),map(),usageProjection(undefined,[],{period:'all'},later),estate());assert.equal(i.usage.totals.input.value,null);assert.equal(i.usage.totals.cacheHit.value,null);assert.equal(i.usage.totals.cacheSaving.reported,0);});
test('prompt redaction and context boundaries survive new navigation',()=>{const i=projectRunInspector(parcel(),map(),usage(),estate());assert.ok(!JSON.stringify(i).includes('forbidden-secret-value'));assert.match(i.context.explanation,/distinct mechanisms/);assert.deepEqual(i.context.records,[]);});
test('history export retains source event identity and is stable',()=>{const i=projectRunInspector(parcel(),map(),usage(),estate()),a=inspectorHistory(i),b=inspectorHistory(i);assert.equal(a.sha256,b.sha256);assert.match(a.content,/event-1/);assert.equal(a.entryCount,1);assert.equal(a.derived,true);});
test('deterministic jobs bind only from actual sessions and preserve provenance',()=>{const run={id:'job-run',jobId:'maintenance',trigger:{type:'manual',actor:'operator'},requestedAt:at,status:'SUCCEEDED',endedAt:at,provenance:[{type:'action.completed',at,detail:'Read-only inspection completed'}],steps:[],artifacts:[]} as unknown as RunRecord;const rows=nodeWorkIndex([],[],[{id:'s',scope:{runId:run.id,nodeId:'beta'} as never,state:'EXITED'}],[run]);assert.equal(rows[0]?.kind,'job');const i=projectJobInspector(run,map(),usageProjection(undefined,[],{period:'all'},later),estate(),rows.map(r=>r.nodeId));assert.equal(i.physicalNodes[0]?.id,'physical-beta');assert.equal(i.events[0]?.type,'action.completed');assert.equal(i.calls.length,0);});
test('native resource sampling reports first-frame unavailability and whole-node scope',async()=>{const sampler=new LocalNodeResources(),s=await sampler.sample([]);assert.equal(s.scope,'WHOLE_NODE');assert.equal(s.cpuBusyPercent.value,null);assert.deepEqual(s.gpu,[]);assert.ok(s.memoryTotalBytes.value===null||s.memoryTotalBytes.value>0);assert.deepEqual(await sampler.sample([]),s);});

test('native sample cache and in-flight work are keyed by requested accelerator inventory',async()=>{
  const sampler=new LocalNodeResources(),cpu=await sampler.sample([]),inventory=[{id:'accelerator-other',index:0,adapter:'unsupported'}];
  const other=await sampler.sample(inventory);assert.notEqual(cpu,other);assert.equal(await sampler.sample(inventory),other);
  const concurrent=new LocalNodeResources(),[a,b]=await Promise.all([concurrent.sample([]),concurrent.sample(inventory)]);assert.notEqual(a,b);assert.deepEqual(a.gpu,[]);assert.deepEqual(b.gpu,[]);
});

test('whole-job accounting adds sibling parcels once and excludes unrelated runs',()=>{
  const ledger=usageLedger(),original=ledger.list()[0]!;
  ledger.record({...original,id:'ledger-2',runId:'run-b',accounting:{...original.accounting!,parcelId:'parcel-other'}});
  ledger.record({...original,id:'ledger-3',runId:'unrelated',accounting:{...original.accounting!,parcelId:'not-this-job'}});
  const projection=scopedInspectorUsage(ledger,[],{runId:'parameterized-parent',parcelIds:['parcel-test','parcel-other','parcel-test']});
  assert.equal(projection.totals.calls,2);assert.equal(projection.totals.input.value,200);assert.equal(projection.totals.cached.value,80);assert.equal(projection.totals.tokens.value,240);assert.equal(projection.totals.apiCost.reported,0);
});

test('whole-node CPU sampling retains a meaningful interval across interleaved inventory requests',()=>{
 const cpu=new CpuCounterSampler();assert.equal(cpu.measure({at:1000,total:100,idle:50}).value,null);
 assert.equal(cpu.measure({at:1010,total:110,idle:51}).value,null);
 const next=cpu.measure({at:2000,total:300,idle:150});assert.equal(next.value,50);assert.equal(next.intervalMs,1000);
 assert.equal(cpu.measure({at:2001,total:320,idle:150}),next);
 assert.equal(cpu.measure({at:32001,total:500,idle:200}).value,null);
});
test('NVIDIA adapter failure and partial rows preserve known devices with unavailable counters',()=>{
 const inventory=[{id:'gpu-0',index:0,adapter:'nvidia'},{id:'gpu-1',index:1,adapter:'nvidia'}];
 const failed=projectNvidiaMeasurements(inventory,undefined,at);assert.equal(failed.length,2);assert.ok(failed.every(g=>g.usedBytes.value===null&&g.busyPercent.value===null));
 const partial=projectNvidiaMeasurements(inventory,'0, 0, 0\n1, , bad',at);assert.equal(partial[0]?.usedBytes.value,0);assert.equal(partial[0]?.busyPercent.value,0);assert.equal(partial[1]?.usedBytes.value,null);assert.equal(partial[1]?.busyPercent.value,null);
});
test('exact model accounting remains accessible beyond the aggregate detail-row cap',()=>{
 const ledger=usageLedger(),original=ledger.list()[0]!;
 for(let i=2;i<=1001;i++)ledger.record({...original,id:'ledger-'+i,startedAt:new Date(Date.parse(at)+i).toISOString()});
 const capped=usageProjection(ledger,[],{period:'all',limit:1000},later);assert.equal(capped.coverage.matching,1001);assert.equal(capped.rows.length,1000);assert.ok(!capped.rows.some(r=>r.id==='ledger-1'));
 const m=map();m.nodes=[node('model:call-1','model-call')];const exact=projectRunInspector(parcel(),m,capped,estate(),'model:call-1',inspectorAccounting(ledger,[],['ledger-1']));assert.equal(exact.calls[0]?.accounting?.usage.cachedInputTokens,40);assert.equal(exact.calls[0]?.accounting?.id,'ledger-1');
 const excluded={list:()=>ledger.list(),usageHistory:()=>({excludedIds:['ledger-1'],events:[]})};assert.deepEqual(inspectorAccounting(excluded,[],['ledger-1']),[]);
});

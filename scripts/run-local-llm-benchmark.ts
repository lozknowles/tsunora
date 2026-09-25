import {registerLlamaCppBenchmarkJobs} from '../src/control/llama-cpp-benchmark-adapter.js';
import fs from 'node:fs';
import path from 'node:path';
import {ActionRegistry,ArtifactStore,JobRuntime,ResourceLockManager,RunLedger,WorkerRegistry} from '../src/control/job-runtime.js';
import {JobCatalog} from '../src/control/job-catalog.js';
import {WorkParcelCoordinator,WorkParcelStore} from '../src/control/work-parcels.js';
import {EnvironmentDiscoveryRuntime,LocalMachineDiscoveryAdapter} from '../src/control/environment-discovery.js';
import {LocalBenchmarkController} from '../src/control/local-llm-benchmark-controller.js';
import {PoeRuntime} from '../src/control/poe.js';
import {projectEstateMap} from '../src/control/estate-map.js';
import {projectRuntimeMap} from '../src/control/runtime-map.js';

// Explicit operator entry point; never invoked by the preparation command.
const [configurationFile,flag,approvedDigest]=process.argv.slice(2);
if(!configurationFile||flag!=='--approve-spec'||!approvedDigest?.match(/^[a-f0-9]{64}$/))throw Error('Usage after operator approval: run-local-llm-benchmark.ts CONFIGURATION_JSON --approve-spec EXACT_SHA256');
const {root,template}=JSON.parse(fs.readFileSync(configurationFile,'utf8'));
const discovery=new EnvironmentDiscoveryRuntime({file:path.join(root,'discovery.json'),configurationRevision:()=> 'isolated-benchmark/v1',config:()=>({resources:[],models:[],providers:[],services:[],lanes:[]} as any),adapters:[new LocalMachineDiscoveryAdapter()]});
await discovery.discover({mode:'QUICK_RESCAN',testing:'QUICK_TEST',includeRemote:false,includeMemory:false});
const actions=new ActionRegistry(),catalog=new JobCatalog(actions.ids()),controller=new LocalBenchmarkController({registerExecution:registerLlamaCppBenchmarkJobs,root,template,scan:()=>discovery.projection().latest,catalog,actions});
controller.admit(template);
const workers=new WorkerRegistry().register({id:'local-benchmark-controller',capabilities:['benchmark.control'],health:'healthy',capacity:1,active:0,observedAt:new Date().toISOString()}),runtime=new JobRuntime(catalog,actions,workers,new RunLedger(path.join(root,'benchmark-runs.json')),new ArtifactStore(path.join(root,'benchmark-artifacts')),new ResourceLockManager(path.join(root,'benchmark-locks.json')),{approval:()=>false});
const parcels=new WorkParcelCoordinator(runtime,new WorkParcelStore(path.join(root,'parcels.json')),{plan:()=>{throw Error('use_frozen_poe_plan');}});
const poe=new PoeRuntime({file:path.join(root,'conversations.json'),evidence:{overview:()=>({title:'Local benchmark',summary:'Native workflow',facts:[],related:[]}),resolve:()=>({title:'Local benchmark',summary:'Native workflow',facts:[],related:[]})},benchmark:{submit:input=>{const digest=controller.authorize(input);try{const parcel=parcels.submitApprovedPlan(input.proposal.objective,input.actor,input.requestKey,input.plan);controller.bind(digest,parcel.id);return {parcelId:parcel.id};}catch(error){controller.revoke(digest);throw error;}}}});
const draft=poe.projection().proposals.find(p=>p.stages[0]?.parameters?.specSha256===approvedDigest&&p.state==='DRAFT');if(!draft)throw Error('approved_draft_not_found');
const frozen=poe.freezeBenchmark(draft.id,draft.revision),approved=poe.approveBenchmark(frozen.id,{revision:frozen.revision,frozenSha256:frozen.frozenSha256!,actor:'operator-explicit-spec-approval'}),parcelId=approved.execution!.parcelId;
const graphRoot=path.join(root,'maps',parcelId);fs.mkdirSync(graphRoot,{recursive:true});
let sequence=0;const snapshot=()=>{const parcel=parcels.get(parcelId),estate=controller.project(projectEstateMap(discovery.projection().latest)),processMap=controller.project(projectRuntimeMap({parcel,runs:runtime.ledger.list(),sessions:[],sessionEvents:()=>[]}),parcel.stages.flatMap(s=>s.runId?[s.runId]:[]));fs.writeFileSync(path.join(graphRoot,`${String(sequence++).padStart(6,'0')}.json`),JSON.stringify({estate,process:processMap}),{flag:'wx'});};
const timer=setInterval(snapshot,1000),refresh=setInterval(()=>{void discovery.discover({mode:'QUICK_RESCAN',testing:'QUICK_TEST',includeRemote:false,includeMemory:false}).catch(error=>console.error(String(error)));},30000);
const abort=()=>{for(const run of runtime.ledger.list())if(!run.endedAt)runtime.cancel(run.id,'operator_interrupted_benchmark');};process.once('SIGINT',abort);process.once('SIGTERM',abort);
try{for(let i=0;i<200;i++){await parcels.tick();await runtime.tick();await parcels.tick();snapshot();const parcel=parcels.get(parcelId);console.log(JSON.stringify({parcelId,status:parcel.status,stages:parcel.stages.map(s=>({id:s.id,status:s.status,runId:s.runId}))}));if(parcel.endedAt){if(parcel.status!=='SUCCEEDED')process.exitCode=1;break;}}}finally{clearInterval(timer);clearInterval(refresh);process.removeListener('SIGINT',abort);process.removeListener('SIGTERM',abort);snapshot();}
const results=path.join(root,'evidence','results');const leagues=fs.readdirSync(results).map(f=>JSON.parse(fs.readFileSync(path.join(results,f),'utf8'))).filter(r=>r.kind==='league-table'&&r.specSha256===approvedDigest);
console.log(JSON.stringify({parcelId,leagueTables:leagues,retention:'KEEP_ALL',productionRoutingChanged:false}));

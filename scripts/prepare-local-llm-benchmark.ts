import {registerLlamaCppBenchmarkJobs} from '../src/control/llama-cpp-benchmark-adapter.js';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ActionRegistry,ArtifactStore,JobRuntime,ResourceLockManager,RunLedger,WorkerRegistry} from '../src/control/job-runtime.js';
import {JobCatalog} from '../src/control/job-catalog.js';
import {EnvironmentDiscoveryRuntime,LocalMachineDiscoveryAdapter} from '../src/control/environment-discovery.js';
import {BenchmarkEvidenceStore,benchmarkHash,PYTHON_REPAIR_CASES,type LocalBenchmarkSpec} from '../src/control/local-llm-benchmark.js';
import {fileHash} from '../src/control/local-llm-benchmark-actions.js';
import {localHardwareFingerprint,LocalBenchmarkController} from '../src/control/local-llm-benchmark-controller.js';
import {PoeRuntime} from '../src/control/poe.js';

// Preparation only: fixed control probes; never download, install or start a model target.
const [rootArg,runtimeArg,candidatesArg]=process.argv.slice(2);
if(!rootArg||!runtimeArg||!candidatesArg)throw Error('Usage: prepare-local-llm-benchmark.ts ISOLATED_ROOT EXISTING_LLAMA_SERVER CANDIDATES_JSON');
const root=path.resolve(rootArg),runtimePath=path.resolve(runtimeArg),sandboxPath='/usr/bin/bwrap',validatorPath=fileURLToPath(new URL('./python-repair-validator.py',import.meta.url));
fs.mkdirSync(root,{recursive:true,mode:0o700});fs.mkdirSync(path.join(root,'targets'),{recursive:true,mode:0o700});
if(fs.readdirSync(path.join(root,'targets')).length)throw Error('worked_example_requires_empty_targets_directory');
const store=new BenchmarkEvidenceStore(path.join(root,'evidence')),runtimeSha256=await fileHash(runtimePath),sandboxSha256=await fileHash(sandboxPath),validatorSha256=await fileHash(validatorPath);
const actions=new ActionRegistry();
actions.registerReadOnly('local-benchmark.control-probe@1.0.0',async context=>{
  const version=await context.ownedExecution.runProcess({command:runtimePath,args:['--version'],maxOutputBytes:10000},context.signal);if(version.exitCode!==0)throw Error('runtime_version_probe_failed');
  const checks=[];
  for(const [id,source,passed]of [['correct','def solve(x):\n return sum(x)/len(x) if x else 0',true],['incorrect','def solve(x):\n return 42',false],['malicious','import os\ndef solve(x):\n return 0',false]] as const){
    const result=await context.ownedExecution.runProcess({command:sandboxPath,args:['--unshare-all','--die-with-parent','--new-session','--ro-bind','/usr','/usr','--ro-bind','/lib','/lib','--ro-bind','/lib64','/lib64','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--ro-bind',validatorPath,'/validator.py','/usr/bin/prlimit','--as=536870912','--cpu=5','--nproc=32','--','/usr/bin/python3','-I','/validator.py'],input:JSON.stringify({source,inputs:[[],[2,4]],expected:[0,3]}),env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},maxOutputBytes:10000},AbortSignal.any([context.signal,AbortSignal.timeout(10000)]));
    const verdict=result.exitCode===0?JSON.parse(result.stdout):null;context.recordEvidence?.(id,{exitCode:result.exitCode,stderr:result.stderr,stdout:result.stdout,verdict,expectedPassed:passed});if(verdict?.passed!==passed)throw Error(`control_probe_failed:${id}`);checks.push(id);
  }
  const cleanup=await context.ownedExecution.terminateAll('control-probe-completed');if(cleanup.outcome!=='confirmed'||context.ownedExecution.activePids().length)throw Error('control_cleanup_unconfirmed');checks.push('owned-cleanup');
  return {artifacts:[{name:'control-proof',value:{kind:'local-benchmark-control-qualification',status:'PASS',scope:'Fixed native control execution and restricted Python validator only; no target model qualification',runId:context.run.id,runtimeSha256,sandboxSha256,validatorSha256,hardwareFingerprint:localHardwareFingerprint(),runtimeVersion:(version.stdout+'\n'+version.stderr).trim(),checks,observedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+24*3600000).toISOString(),cleanup}}],verification:['controls-verified']};
});
const catalog=new JobCatalog(actions.ids());catalog.addJob({apiVersion:'agent-control/v1',kind:'Job',metadata:{id:'local-benchmark-control-probe',name:'Verify benchmark control execution',version:'1.0.0'},spec:{priority:'low',concurrency:'no-overlap',steps:[{id:'probe',action:'local-benchmark.control-probe@1.0.0',requires:['control.probe'],outputs:[{name:'control-proof',type:'application/json',schema:'agent-control.local-benchmark-control/v1',version:'1.0.0'}],timeoutSeconds:60,verification:['controls-verified']}]}});
const workers=new WorkerRegistry().register({id:'controller-probe',capabilities:['control.probe'],health:'healthy',capacity:1,active:0,observedAt:new Date().toISOString()}),artifacts=new ArtifactStore(path.join(root,'artifacts'));
const runtime=new JobRuntime(catalog,actions,workers,new RunLedger(path.join(root,'runs.json')),artifacts,new ResourceLockManager(path.join(root,'locks.json')),{approval:()=>false});
const run=runtime.createRun('local-benchmark-control-probe@1.0.0',{}, {type:'manual',actor:'operator-requested-benchmark-preparation'});await runtime.tick();
const record=runtime.ledger.get(run.id)!;if(record.status!=='SUCCEEDED')throw Error(`control_probe_${record.status}:${record.errors.join(',')}`);
const proof=artifacts.read(record.artifacts.at(-1)!);const qualified=store.put('results',proof);
const discovery=new EnvironmentDiscoveryRuntime({file:path.join(root,'discovery.json'),configurationRevision:()=> 'isolated-benchmark/v1',config:()=>({resources:[],models:[],providers:[],services:[],lanes:[]} as any),adapters:[new LocalMachineDiscoveryAdapter()]});
const scan=await discovery.discover({mode:'QUICK_RESCAN',testing:'QUICK_TEST',includeRemote:false,includeMemory:false}),machine=scan.items.find(i=>i.kind==='MACHINE')!;
const candidates=JSON.parse(fs.readFileSync(candidatesArg,'utf8'));
const template:LocalBenchmarkSpec={schema:'agent-control.local-llm-benchmark/v1',id:'mallow-python-repair',version:'1.0.0',objective:'Find the best local model for Python repair on this machine. Correctness matters most. Only permissive licences; under 8 GB.',workload:'Python function repair with fixed independent tests',cases:structuredClone(PYTHON_REPAIR_CASES),scoring:{correctnessWeight:.95,speedWeight:.05,memoryWeight:0,subjectiveWeight:0,formula:'100 * (0.95 * passed/planned + 0.05 * fastest complete elapsed / candidate elapsed). Workload winner must pass every attempt.'},attempts:2,settings:{context:2048,maxTokens:256,temperature:0,seed:7,threads:4,gpuLayers:0,concurrency:1,timeoutMs:90000,cache:'COLD_PER_CANDIDATE',tools:[]},constraints:{maxArtifactBytes:8e9,maxDiskBytes:2e9,mustFitVram:false,permissiveOnly:true,families:['qwen']},hardware:{resourceId:machine.id,scanId:scan.id,fingerprint:localHardwareFingerprint(),cpu:String(machine.attributes.cpuModel),ramBytes:Number(machine.attributes.availableMemoryBytes),freeDiskBytes:Number(machine.attributes.diskAvailableBytes),freeVramBytes:0,observedAt:scan.completedAt},execution:{capability:'benchmark.control',qualified:true,expiresAt:(proof as any).expiresAt,authentication:'NOT_REQUIRED',runtimePath,runtimeSha256,runtimeVersion:(proof as any).runtimeVersion,sandboxPath,sandboxSha256,validatorSha256,architectures:['qwen2'],qualificationEvidenceSha256:qualified.sha256},candidates,judge:null,retention:'KEEP_ALL',routing:'RECOMMENDATION_ONLY',createdAt:new Date().toISOString()};
const controller=new LocalBenchmarkController({registerExecution:registerLlamaCppBenchmarkJobs,root,template,scan:()=>discovery.projection().latest,catalog,actions});controller.admit(template);
const poe=new PoeRuntime({file:path.join(root,'conversations.json'),evidence:{overview:()=>({title:'Benchmark preparation',summary:'Approval required',facts:[],related:[]}),resolve:()=>({title:'Benchmark preparation',summary:'Approval required',facts:[],related:[]})},localBenchmark:{draft:objective=>controller.draft(objective)}}),conversation=poe.createConversation({actorId:'operator',channel:'dashboard'});
await poe.ask({conversationId:conversation.id,text:template.objective});const draft=poe.projection().proposals[0]!,specSha256=String(draft.stages[0]!.parameters!.specSha256),spec=store.read('definitions',specSha256);
for(const [name,value]of Object.entries({'configuration.json':{root,template:spec},'review-plan.json':{state:'PROVISIONABLE',approval:'REQUIRED',specSha256,controlRunId:run.id,qualificationEvidenceSha256:qualified.sha256,initialModels:0,downloadBytes:candidates.reduce((n:number,c:any)=>n+c.bytes,0),runtimeInstallationRequired:false,execution:'CPU only, 4 threads, nice 10, sequential, loopback only',retention:'KEEP_ALL',apiCost:0,workloadRuns:12,standardProbes:2,modelResults:[],proposal:draft},'benchmark-spec.json':spec}))fs.writeFileSync(path.join(root,name),JSON.stringify(value,null,2),{flag:'wx',mode:0o600});
fs.writeFileSync(path.join(root,'conversation.md'),poe.transcript(conversation.id),{flag:'wx',mode:0o600});
console.log(JSON.stringify({root,controlRunId:run.id,controlStatus:record.status,specSha256,proposalState:draft.state,initialTargetModels:0,downloadedBytes:0,modelResults:0,hardware:template.hardware}));

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import Ajv from 'ajv';
import {JobCatalog} from '../src/control/job-catalog.js';
import {ActionRegistry,ArtifactStore,JobRuntime,ResourceLockManager,RunLedger,WorkerRegistry} from '../src/control/job-runtime.js';
import {estateObservationState} from '../src/control/estate-map.js';
import {operationalReadiness,projectJobEstateMap,type ExecutionAdmission} from '../src/control/job-estate-readiness.js';
import type {DiscoveryScan} from '../src/control/environment-discovery.js';
import {ExternalJobCatalogue,boundedGet} from './external-job-catalogue.mjs';
import {assessReadiness} from './capability-binding.mjs';

const [sourceFile,schemaUrl,schemaHash,scanFile,output]=process.argv.slice(2);
if(!sourceFile||!schemaUrl||!schemaHash||!scanFile||!output||fs.existsSync(output)) throw Error('Require source, schema URL/hash, fresh scan, NEW output directory');
const scan=JSON.parse(fs.readFileSync(scanFile,'utf8')) as DiscoveryScan;
const source=JSON.parse(fs.readFileSync(sourceFile,'utf8'));
const schema=await boundedGet(schemaUrl);if(schema.sha256!==schemaHash)throw Error('schema_digest_mismatch');
const client=new ExternalJobCatalogue({jobSchema:JSON.parse(schema.body)});await client.refresh(source);
const jobs=client.query();
const selected=['disk-space-check','gpu-inspection','structured-extraction'];
for(const id of selected)await client.manifest(id);
const at=new Date();
if(!scan.items.some(i=>i.kind==='MACHINE'&&i.nodeId==='controller'&&estateObservationState(i,+at).alive))throw Error('fresh_controller_observation_required');
fs.mkdirSync(output,{recursive:true});
const declared=jobs.map((j:any)=>assessReadiness(j,scan,{now:at}));
const before=declared.map((r:any)=>operationalReadiness(r,scan,[],at));
const write=(name:string,value:unknown)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
// Risk classification and admission decisions persisted BEFORE any dispatch.
write('selection.json',{source,at:at.toISOString(),allJobs:jobs.map((j:any)=>({id:j.id,risk:j.risk,costCeiling:j.cost_ceiling,mutation:j.mutation_level,approval:j.approval.required,selected:selected.includes(j.id)})),
  selected,reason:'Host inspection, GPU inspection and report-only supplied input; read-only local zero-billable-cost scope. No model inference or external communication.'});
write('admission-before.json',before);
const actions=new ActionRegistry();
const outputValidators=new Map(jobs.map((j:any)=>[j.id,new Ajv({strict:false}).compile(j.outputs)]));
actions.registerReadOnly('validation.inspect-resource@1.0.0',async context=>{
  const machine=scan.items.find(i=>i.kind==='MACHINE'&&i.nodeId==='controller');
  if(!machine||!estateObservationState(machine).alive)throw Error('supporting_machine_not_currently_alive');
  const kind=context.parameters.inspection;
  let facts:Record<string,unknown>;
  if(kind==='host.inspect') {
    const disk=fs.statfsSync(process.cwd());
    facts={kind,observedAt:new Date().toISOString(),cpuLogical:os.cpus().length,memoryTotalBytes:os.totalmem(),memoryAvailableBytes:os.freemem(),
      diskTotalBytes:disk.blocks*disk.bsize,diskAvailableBytes:disk.bavail*disk.bsize,used_percent:100*(disk.blocks-disk.bavail)/disk.blocks,
      health:(disk.blocks-disk.bavail)/disk.blocks>=0.9?'warning':'healthy',deleted:0,source:'node:os+statfs'};
  } else if(kind==='gpu.inspect') {
    const query=async(args:string[])=>{
      const p=await context.ownedExecution!.runProcess({command:'nvidia-smi',args},context.signal);
      if(p.exitCode!==0)throw Error('gpu_inspection_failed');return p.stdout;
    };
    const usage=await query(['--query-gpu=index,memory.total,memory.used,utilization.gpu','--format=csv,noheader,nounits']);
    const processes=await query(['--query-compute-apps=pid,used_memory','--format=csv,noheader,nounits']);
    const devices=usage.trim().split(/\r?\n/).filter(Boolean).map(row=>row.split(',').map(Number));
    const allocations=processes.trim().split(/\r?\n/).filter(Boolean).map(row=>row.split(',').map(Number));
    facts={kind,observedAt:new Date().toISOString(),devices,allocations,mainComputeProcess:allocations.toSorted((a,b)=>b[1]-a[1])[0]??null,
      coverage:'GPU totals and compute processes; graphics and driver allocations may remain unattributed',
      source:'owned-process:nvidia-smi',sourceSha256:createHash('sha256').update(usage+'\n'+processes).digest('hex')};
  } else throw Error('inspection_contract_not_supported');
  const result={outcome:'COMPLETE',facts,evidence:[`source:${facts.source}`],actions:[]};
  return {artifacts:[{name:'observations',value:result}],evidence:result.evidence};
});
actions.registerReadOnly('validation.verify-observations@1.0.0',async context=>{
  const artifact=context.inputArtifacts[0];const result=context.readArtifact(artifact.id) as any;const facts=result.facts;
  const recent=Date.now()-Date.parse(facts.observedAt)>=0&&Date.now()-Date.parse(facts.observedAt)<30000;
  const numeric=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
  const validate=outputValidators.get(String(context.parameters.libraryJobId)) as any;
  const valid=Boolean(validate?.(result))&&result.actions.length===0&&recent&&(facts.kind==='host.inspect'?
    [facts.cpuLogical,facts.memoryTotalBytes,facts.memoryAvailableBytes,facts.diskTotalBytes,facts.diskAvailableBytes].every(numeric)&&facts.cpuLogical>0&&facts.diskAvailableBytes<=facts.diskTotalBytes&&facts.memoryAvailableBytes<=facts.memoryTotalBytes:
    facts.kind==='gpu.inspect'&&facts.devices.length>0&&facts.devices.every((r:number[])=>r.length===4&&r.every(numeric)&&r[2]<=r[1]&&r[3]<=100)&&
    facts.allocations.every((r:number[])=>r.length===2&&r.every(numeric))&&
    (!facts.mainComputeProcess||facts.allocations.every((r:number[])=>r[1]<=facts.mainComputeProcess[1])));
  return {verification:valid?['independent-observation-check']:[],evidence:[`artifact:${artifact.sha256}`]};
});
let forbiddenCalls=0;
actions.registerReadOnly('validation.refuse-unbound@1.0.0',async()=>{forbiddenCalls++;throw Error('No executor is admitted; must never dispatch');});
const catalog=new JobCatalog(actions.ids());
const definitions:any[]=[];
for(const id of selected) {
  const manifest=jobs.find((j:any)=>j.id===id);
  if(!manifest||manifest.risk!=='low'||manifest.approval.required||manifest.mutation_level!=='read-only'||manifest.cost_ceiling.amount!==0)throw Error('selection_outside_authorized_scope');
  const inspection=manifest.capabilities.find((c:string)=>['host.inspect','gpu.inspect'].includes(c));
  if(!inspection)continue; // Record blocked admission, do not invent a report-only executor.
  const definition={apiVersion:'agent-control/v1',kind:'Job',metadata:{id:`physical-${id}`,name:manifest.description,version:'1.0.0'},
    spec:{priority:'normal',concurrency:'no-overlap',parameters:{libraryJobId:{type:'string',required:true},libraryDigest:{type:'string',required:true},inspection:{type:'string',enum:['host.inspect','gpu.inspect'],required:true},scenario:{type:'string',required:true},inputDigest:{type:'string',required:true},target:{type:'string',enum:['machine:controller'],required:true}},steps:[
      {id:'inspect',action:'validation.inspect-resource@1.0.0',requires:[inspection],timeoutSeconds:15,outputs:[{name:'observations',type:'application/json',schema:'physical-observation/v1',version:'1.0.0'}]},
      {id:'verify',action:'validation.verify-observations@1.0.0',requires:['evidence.report'],dependsOn:['inspect'],inputs:{result:'inspect.observations'},verification:['independent-observation-check']}]}};
  catalog.addJob(definition as any);definitions.push({definition,manifest,inspection});
}
for(const manifest of jobs.filter((j:any)=>j.approval.required))catalog.addJob({apiVersion:'agent-control/v1',kind:'Job',metadata:{id:`approval-boundary-${manifest.id}`,name:'Denied approval boundary',version:'1.0.0'},
  spec:{priority:'normal',concurrency:'no-overlap',parameters:{libraryJobId:{type:'string',required:true},libraryDigest:{type:'string',required:true}},steps:[{id:'deny',action:'validation.refuse-unbound@1.0.0',requires:[],approval:`job-digest:${manifest.sha256}`} ]}});
const registry=new WorkerRegistry().register({id:'isolated-read-only-controller',capabilities:['host.inspect','gpu.inspect','evidence.report'],health:'healthy',active:0,capacity:1,observedAt:at.toISOString(),
  capabilityExpiresAt:Object.fromEntries(['host.inspect','gpu.inspect','evidence.report'].map(c=>[c,new Date(+at+120000).toISOString()]))});
const runtime=new JobRuntime(catalog,actions,registry,new RunLedger(path.join(output,'ledger.json')),new ArtifactStore(path.join(output,'artifacts')),new ResourceLockManager(path.join(output,'locks.json')),{approval:()=>false});
const exercise=[];const admissions:ExecutionAdmission[]=[];
for(const {definition,manifest,inspection} of definitions) {
  const input={scenario:inspection==='host.inspect'?'Inspect current controller disk space with a 90 percent warning threshold; delete nothing.':'Inspect current controller GPU totals and compute-process allocations; stop nothing.'};
  const inputDigest=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const created=runtime.createRun(`${definition.metadata.id}@1.0.0`,{libraryJobId:manifest.id,libraryDigest:manifest.sha256,inspection,...input,inputDigest,target:'machine:controller'}, {type:'manual',actor:'authorized-physical-readiness-validation'});
  await runtime.tick();await runtime.tick();
  const run=runtime.ledger.get(created.id)!;const artifacts=runtime.artifacts.list(run.id);
  exercise.push({jobId:manifest.id,runId:run.id,status:run.status,kind:'LIVE_READ_ONLY_VARIANT',inputDigest,target:'machine:controller',scope:['read-only:bound-inputs','local-mutation:isolated-run-output'],canonicalFixtureExecuted:false,outputSchemaValidated:run.status==='SUCCEEDED',artifacts:artifacts.map(a=>({id:a.id,sha256:a.sha256})),errors:run.errors});
  if(run.status==='SUCCEEDED'&&artifacts.length) {
    const result=declared.find((r:any)=>r.id===manifest.id);
    admissions.push({jobDigest:manifest.sha256,resourceIds:[...new Set(result.requirements.flatMap((r:any)=>r.candidates.map((c:any)=>c.resourceId)))] as string[],capabilities:manifest.capabilities,
      state:'QUALIFIED',runId:run.id,artifactSha256:artifacts[0].sha256,implementationSha256:createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex'),
      expiresAt:new Date(+at+120000).toISOString(),authentication:'NOT_REQUIRED',scope:'READ_ONLY_LOCAL_INSPECTION'});
  }
}
const approvalProof=[];
for(const manifest of jobs.filter((j:any)=>j.approval.required)) {
  const created=runtime.createRun(`approval-boundary-${manifest.id}@1.0.0`,{libraryJobId:manifest.id,libraryDigest:manifest.sha256},{type:'manual',actor:'denial-boundary-validation'});
  await runtime.tick();const run=runtime.ledger.get(created.id)!;
  approvalProof.push({jobId:manifest.id,runId:run.id,status:run.status,stepStatus:run.steps[0].status,actionCalls:forbiddenCalls});
}
if(forbiddenCalls||approvalProof.some(p=>p.stepStatus!=='WAITING_FOR_APPROVAL'))throw Error('approval_boundary_failed');
const finishedAt=new Date();const results=declared.map((r:any)=>operationalReadiness(r,scan,admissions,finishedAt));
const counts=(values:string[])=>Object.fromEntries([...new Set(values)].map(k=>[k,values.filter(v=>v===k).length]));
write('execution-admissions.json',admissions);
write('estate-map.json',projectJobEstateMap(scan,results,runtime.ledger.list(),finishedAt));
write('report.json',{source,scanId:scan.id,assessedAt:finishedAt.toISOString(),selected,exercise,approvalProof,
  blockedSelected:[{jobId:'structured-extraction',reason:'qualified_execution_contract_missing',dispatched:false}],
  technicalReadiness:counts(results.map(r=>r.primaryState)),declaredReadiness:counts(declared.map((r:any)=>r.primaryState)),
  authority:counts(results.map(r=>r.authority.state)),overlappingGaps:counts(results.flatMap(r=>[...new Set(r.reasons.map(x=>x.state))])),
  results,boundaries:{liveReadOnlyVariants:exercise.length,canonicalFixtureRuns:0,qualifiedCanonicalJobs:0,deployments:0,mobileActions:0,forbiddenActionCalls:forbiddenCalls},
  qualificationScope:'Exact inspected job digest, local resource observations, implementation hash and independent artifact verifier; not model or general canonical-job qualification.'});
console.log(JSON.stringify({exercise,approvalProof,technicalReadiness:counts(results.map(r=>r.primaryState)),declaredReadiness:counts(declared.map((r:any)=>r.primaryState))},null,2));

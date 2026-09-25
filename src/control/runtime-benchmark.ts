import {registerTargetRecovery} from './register-target-recovery.js';
import {OwnedProcessManager} from './owned-process.js';
import {benchmarkResumeCursor} from './benchmark-resume.js';
import {validateRuntimeBenchmarkCode} from './runtime-benchmark-validator.js';
import {createHash,randomUUID} from 'node:crypto';
import type {JobRuntime} from './job-runtime.js';
import type {ActionContext} from './job-types.js';
import {registerModelHardwareQualification,validateLabSpec,labSpecDigest,LabAdmissionBlocked,type LabQualificationSpec,type LabAttemptResult,type LabExecutionAdapter} from './model-hardware-qualification.js';
import {createTransportLlamaLabAdapter,type TransportLabProfile} from './transport-llama-lab-adapter.js';
import {TargetLlamaRuntime,type RuntimeTarget} from './target-llama-runtime.js';
import {assessTargetAdmission,validateTargetPolicy,type TargetResourcePolicy,type TargetObservation} from './runtime-target-telemetry.js';
import {createInvocationObservation,type HarnessEfficiencyLedgerPort} from './harness-efficiency.js';
export interface RuntimeBenchmarkSettings {
 schema:'agent-control.runtime-benchmark/v1';spec:LabQualificationSpec;profile:TransportLabProfile;target:RuntimeTarget;policy:TargetResourcePolicy;
 authority:{actor:string;expiresAt:string;allowServiceSuspension:boolean};
 /** Declared workload floor, checked before dispatch and again at launch. */
 launchMinimumAvailableBytes?:number;
}
export interface BenchmarkTargetPort {
 id:string;producer(c:ActionContext):unknown;observe(c:ActionContext):Promise<TargetObservation>;
 platform(c:ActionContext):Promise<Pick<TargetObservation,'batteryPercent'|'charging'|'thermalCelsius'|'thermalStatus'> & {evidence:unknown}>;
 execute(operation:'observe'|'invoke'|'abort',c:ActionContext,payload?:Record<string,unknown>):Promise<any>;
 recover(c:ActionContext,id:string):Promise<{restored:boolean;result?:LabAttemptResult}>;
}
/** Configuration declares a workload floor; no speculative credit for reclaimable memory. */
export function benchmarkResourceRequirement(settings:RuntimeBenchmarkSettings) {
 const policy=validateTargetPolicy(settings.policy),declared=settings.launchMinimumAvailableBytes;
 if(declared!==undefined&&(!Number.isSafeInteger(declared)||declared<policy.minimumAvailableBytes))throw Error('runtime_launch_memory_policy_invalid');
 return {minimumAvailableBytes:Math.max(policy.minimumAvailableBytes,declared??0),source:declared===undefined?'target-policy':'configured-workload-floor',targetMinimumAvailableBytes:policy.minimumAvailableBytes};
}
export function assessBenchmarkAdmission(settings:RuntimeBenchmarkSettings,observation:TargetObservation) {
 const requirement=benchmarkResourceRequirement(settings),target=assessTargetAdmission(observation,settings.policy);
 const workloadAllowed=observation.availableRamBytes!==null&&observation.availableRamBytes>=requirement.minimumAvailableBytes;
 return {allowed:target.allowed&&workloadAllowed,decision:target.allowed&&workloadAllowed?'ADMIT':'REFUSE',reasons:[...target.reasons,...(workloadAllowed?[]:['WORKLOAD_MEMORY_UNAVAILABLE_OR_INSUFFICIENT'])],target,workload:{allowed:workloadAllowed,...requirement,availableBytes:observation.availableRamBytes}};
}
export function createRuntimeBenchmarkAdapter(settings:RuntimeBenchmarkSettings,target:BenchmarkTargetPort):LabExecutionAdapter {
 const policy=validateTargetPolicy(settings.policy),requirement=benchmarkResourceRequirement(settings);let restored=true;
 const record=(c:ActionContext,name:string,data:unknown)=>{if(!c.recordEvidence)throw Error('runtime_evidence_required');return c.recordEvidence(name,{producer:target.producer(c),at:new Date().toISOString(),data});};
 const admit=async(c:ActionContext)=>{
  let observation:TargetObservation;
  try{observation=await target.observe(c);}catch(error){record(c,'runtime-admission',{decision:'REFUSE',reason:'TELEMETRY_UNAVAILABLE',policy,errorClass:error instanceof Error?error.message:'unknown'});return {available:false,evidence:{reason:'TELEMETRY_UNAVAILABLE'}};}
  const decision=assessBenchmarkAdmission(settings,observation);const evidence=record(c,'runtime-admission',{...decision,workload:settings.spec.id,target:settings.spec.target,observation,policy});
  return {available:decision.allowed,evidence:{id:evidence.id,sha256:evidence.sha256}};
 };
 const adapter=createTransportLlamaLabAdapter({profile:settings.profile,admit,validateCode:validateRuntimeBenchmarkCode,execute:async(value,c)=>{
  c.signal.throwIfAborted();const attemptId=randomUUID();let result:LabAttemptResult;let monitoring=true,thermalRefused=false;restored=false;
  const start=Date.now();
  const cleanup=async()=>{const at=new Date().toISOString();let success=false;try{const recovery=await target.recover(c,attemptId);record(c,'runtime-recovery',recovery);success=recovery.restored;restored=success;}catch{}return {outcome:success?'confirmed' as const:'uncertain' as const,reason:'target-runtime-restoration',requestedAt:at,completedAt:new Date().toISOString(),processes:[]};};
  const finishCleanup=c.retainCleanup?.({kind:'target-runtime',target:settings.spec.target.device,attemptId,producer:target.producer(c)},cleanup);
  const monitor=async()=>{while(monitoring){await new Promise(resolve=>setTimeout(resolve,2000));if(!monitoring)break;try{const observation=await target.platform(c);record(c,'runtime-inflight-telemetry',observation);if(policy.batteryRequired&&(observation.thermalCelsius===null||observation.thermalCelsius>=policy.maximumThermalCelsius||observation.thermalStatus===null||observation.thermalStatus>=policy.maximumThermalStatus)){thermalRefused=true;record(c,'runtime-thermal-abort',{decision:'REFUSE',observation,policy});await target.recover(c,attemptId);break;}}catch{thermalRefused=true;await target.recover(c,attemptId);break;}}};
  const monitored=(policy.batteryRequired?monitor():Promise.resolve()).catch(()=>{thermalRefused=true;});
  try{
   record(c,'runtime-invocation-dispatch',{attemptId,fixture:value.input,model:settings.profile.model,modelSha256:settings.profile.modelSha256,provenance:'AGENT_CONTROL_RUNTIME_EVIDENCE'});
   result=await target.execute('invoke',c,{...value,attemptId,minimumAvailableBytes:requirement.minimumAvailableBytes}) as LabAttemptResult;
   restored=(result.rawResponse as any)?.originalServiceRestored===true;
   if(thermalRefused){result.status='FAILED';result.error='thermal_or_telemetry_abort';}
   if(!restored)throw Error('runtime_restoration_unconfirmed');
   record(c,'runtime-postflight',{observation:await target.observe(c),restored,elapsedMs:Date.now()-start});
   const at=new Date().toISOString();finishCleanup?.({outcome:'confirmed',reason:'target-restoration-evidenced',requestedAt:at,completedAt:at,processes:[]});return result;
  }catch(error){const proof=await cleanup();if(proof.outcome==='confirmed')finishCleanup?.(proof);throw error;}
  finally{monitoring=false;await monitored;if(!restored)throw Error('runtime_restoration_unconfirmed');}
 }});
 adapter.restore=async()=>({restored,evidence:{producer:'agent-control-runtime',perInvocationRestorationConfirmed:restored}});
 return adapter;
}
/** Product composition: uses the existing JobRuntime, registry, scheduler and evidence store. */
export function registerRuntimeBenchmark(runtime:JobRuntime,raw:RuntimeBenchmarkSettings,efficiency?:HarnessEfficiencyLedgerPort){
 const settings=structuredClone(raw);if(settings.schema!=='agent-control.runtime-benchmark/v1'||!settings.authority?.actor||!Number.isFinite(Date.parse(settings.authority.expiresAt)))throw Error('runtime_benchmark_configuration_invalid');
 if(settings.target.originalService&&!settings.authority.allowServiceSuspension)throw Error('runtime_service_suspension_not_authorised');
 if(settings.target.resource.id!==settings.spec.target.device||settings.target.environment!==settings.spec.target.environment)throw Error('runtime_target_binding_mismatch');
 const spec=validateLabSpec(settings.spec),digest=labSpecDigest(spec),target=new TargetLlamaRuntime(settings.target),adapter=createRuntimeBenchmarkAdapter(settings,target);
 registerTargetRecovery(runtime,settings.target,target);
 const workerId='runtime-benchmark:'+settings.target.resource.id;
 runtime.workers.registerControllerInternal({id:workerId,capabilities:['model.hardware.qualify'],health:'healthy',capacity:1,active:0,observedAt:new Date().toISOString()});
 runtime.actions.registerConsequentialControl('runtime-benchmark.inspect@1.0.0',async c=>{
  if(c.worker.id!==workerId||Date.parse(settings.authority.expiresAt)<=Date.now())throw Error('runtime_benchmark_authority_invalid');
  const observation=await target.observe(c);
  return {artifacts:[{name:'target-inspection',value:{observation,admission:assessBenchmarkAdmission(settings,observation),boundary:'Read-only target inspection. Process presence does not authorise termination.'}}],verification:['target-observed']};
 },['REMOTE_NODE','FILESYSTEM_WRITE']);
 runtime.catalog.knownActions?.add('runtime-benchmark.inspect@1.0.0');
 runtime.catalog.addJob({apiVersion:'agent-control/v1',kind:'Job',metadata:{id:'runtime-benchmark-inspect',version:'1.0.0',name:'Inspect configured benchmark target'},spec:{priority:'normal',concurrency:'no-overlap',steps:[{id:'inspect',action:'runtime-benchmark.inspect@1.0.0',requires:['model.hardware.qualify'],resources:['lab/qualification-window'],timeoutSeconds:120,verification:['target-observed'],outputs:[{name:'target-inspection',type:'application/json',schema:'agent-control.target-inspection/v1',version:'1.0.0'}]}]}});
 runtime.restoreRetainedCleanup('target-runtime',(identity,run,stepId,recoveryWorker)=>{
  const p=identity.producer as any;
  if(identity.target!==settings.target.resource.id||p?.environment!==settings.target.environment||p?.provenance!=='AGENT_CONTROL_RUNTIME_EVIDENCE'||recoveryWorker!==workerId||!/^[a-f0-9-]{36}$/.test(String(identity.attemptId)))return null;
  return async()=>{const started=new Date().toISOString();const step=run.steps.find(s=>s.id===stepId)!;
   const context={run,step,worker:runtime.workers.list().find(w=>w.id===workerId)!,signal:new AbortController().signal,recordEvidence:(name:string,value:unknown)=>{const live=runtime.ledger.get(run.id)!;const artifact=runtime.artifacts.create(live,stepId,workerId,{name,type:'json',schema:'agent-control.attempt-evidence/v1',version:'1.0.0',retention:'run-history'},value);live.artifacts.push(artifact.id);live.steps.find(s=>s.id===stepId)!.artifactIds.push(artifact.id);runtime.ledger.update(live,'run.recovery_observation');return artifact;}} as ActionContext;
   const recovery=await target.recover(context,String(identity.attemptId));context.recordEvidence!('runtime-recovery',{producer:target.producer(context),at:new Date().toISOString(),data:recovery});
   return {outcome:recovery.restored?'confirmed':'uncertain',reason:'target-runtime-restoration',requestedAt:started,completedAt:new Date().toISOString(),processes:[]};};
 });
 runtime.registerCleanupVerifier('model-hardware-qualification.execute@1.0.0',async(run,actor)=>{
  const step=run.steps[0],attempt=step.attempts.at(-1);if(!attempt||attempt.workerId!==workerId||run.parameters.specSha256!==digest)throw Error('cleanup_run_binding_invalid');
  const registrations=runtime.artifacts.list(run.id).filter(a=>a.stepId===step.id&&a.name==='retained-cleanup-registered'&&a.createdAt>=attempt.startedAt);
  if(!registrations.length)return false;
  let confirmed=true;
  for(const registration of registrations){
    const value=runtime.artifacts.read(registration.id) as any,p=value.identity?.producer;
    if(value.workerId!==workerId||value.identity?.kind!=='target-runtime'||p?.runId!==run.id||p?.stepId!==step.id||p?.target!==spec.target.device||p?.environment!==spec.target.environment||!/^[a-f0-9-]{36}$/.test(value.identity?.attemptId))throw Error('cleanup_attempt_binding_invalid');
    const verificationId=randomUUID(),recordEvidence=(name:string,data:unknown)=>{const live=runtime.ledger.get(run.id)!;const artifact=runtime.artifacts.create(live,step.id,workerId,{name,type:'json',schema:'agent-control.attempt-evidence/v1',version:'1.0.0'},data);live.artifacts.push(artifact.id);live.steps[0].artifactIds.push(artifact.id);runtime.ledger.update(live,'run.cleanup_verification_observed',{artifactId:artifact.id});return artifact;};
    const context={run,step,worker:runtime.workers.list().find(w=>w.id===workerId)!,signal:AbortSignal.timeout(30000),recordEvidence} as ActionContext;
    const owned=new OwnedProcessManager();let observation:any;
    try{observation=await target.execute('verify-cleanup',context,{attemptId:value.identity.attemptId,verificationId},owned,context.signal);}catch{observation={confirmed:false,error:'current_verification_unavailable'};}finally{await owned.terminateAll('cleanup-verification-complete');}
    const valid=validCurrentCleanup(observation,{verificationId,attemptId:value.identity.attemptId,runId:run.id,stepId:step.id,target:spec.target.device,environment:spec.target.environment});
    recordEvidence('attempt-current-cleanup-verification',{actor,registration:{id:registration.id,sha256:registration.sha256},verificationId,observation,accepted:valid});confirmed=confirmed&&valid;
  }
  return confirmed;
 });
 runtime.registerResumePolicy('model-hardware-qualification.execute@1.0.0',run=>{const checkpoint=benchmarkResumeCursor(run,spec,settings.profile,runtime.artifacts);return {complete:checkpoint.complete,checkpoint};});
 registerModelHardwareQualification(runtime.catalog,runtime.actions,{resolveSameRun:async(s,c)=>{const checkpoint=c.run.resumptions!.at(-1)!;const meta=runtime.artifacts.get(checkpoint.checkpointId);if(!meta||meta.runId!==c.run.id||meta.sha256!==checkpoint.checkpointSha256)throw Error('runtime_resume_checkpoint_invalid');const retained=runtime.artifacts.read(meta.id);const cursor=benchmarkResumeCursor(c.run,s,settings.profile,runtime.artifacts);if(JSON.stringify(retained.checkpoint)!==JSON.stringify(cursor))throw Error('runtime_resume_cursor_changed');return cursor.reused;},defaultSpecSha256:digest,resolve:hash=>{if(hash!==digest)throw Error('runtime_benchmark_unknown_spec');return spec;},authorize:async(s,c)=>{
  const renewal=c.run.resumptions?.at(-1),authority=renewal?{actor:renewal.actor,expiresAt:renewal.expiresAt,allowServiceSuspension:settings.authority.allowServiceSuspension}:settings.authority;
  if(c.worker.id!==workerId||labSpecDigest(s)!==digest||Date.parse(authority.expiresAt)<=Date.now())throw Error('runtime_benchmark_authority_invalid');
  c.recordEvidence?.('runtime-benchmark-authority',{producer:target.producer(c),authority,specSha256:digest,resumeGeneration:renewal?.generation??null});
 },adapters:[adapter],recordAccounting:async(c,result,id)=>{
  const measurement=c.recordEvidence!('physical-inference-measurement',{schema:'agent-control.physical-inference-experiment/v1',producer:target.producer(c),device:spec.target.device,environment:spec.target.environment,model:spec.target.model,modelSha256:spec.target.modelSha256,runtime:spec.target.runtime,runtimeVersion:settings.profile.runtimeVersion,quantisation:settings.profile.quantisation,config:settings.profile,invocations:[{id:id.id,accountingInvocationId:id.id,startedAt:id.startedAt,endedAt:id.endedAt,status:result.status,request:result.input,output:result.output,usage:{prompt_tokens:result.tokens.input,prompt_tokens_details:{cached_tokens:result.tokens.cached},completion_tokens:result.tokens.output},metrics:result.metrics}],resourceEvidence:result.rawResponse});
  if(efficiency){const rawUsage:any={};if(result.tokens.input!==null)rawUsage.prompt_tokens=result.tokens.input;if(result.tokens.output!==null)rawUsage.completion_tokens=result.tokens.output;if(result.tokens.cached!==null)rawUsage.prompt_tokens_details={cached_tokens:result.tokens.cached};const observation=createInvocationObservation({id:id.id,jobId:c.run.jobId,runId:c.run.id,stepId:c.step.id,taskId:c.run.id,laneId:spec.target.device,model:spec.target.model,provider:spec.target.runtime,harnessProfile:'STANDARD',harnessId:'model-hardware-qualification/v1',executionStrategy:'agent-control-runtime',startedAt:id.startedAt,completedAt:id.endedAt,rawUsage,outcome:result.status==='SUCCEEDED'?'COMPLETE':'FAILED',error:result.error??undefined,recipeFingerprint:digest,evidenceIds:[measurement.id]});Object.assign(observation.accounting!,{machine:spec.target.device,runtime:spec.target.runtime,modelRevision:spec.target.modelSha256,executionKind:'LOCAL'});efficiency.record(observation);}return id.id;
 }});
 return {workerId,specSha256:digest};
}

export function validCurrentCleanup(v:any,expected:{verificationId:string;attemptId:string;runId:string;stepId:string;target:string;environment:string}){
 return v?.schema==='agent-control.current-cleanup/v1'&&v.verificationId===expected.verificationId&&v.attemptId===expected.attemptId&&v.bindingVerified===true&&v.confirmed===true&&Number.isFinite(Date.parse(v.observedAt))&&Math.abs(Date.now()-Date.parse(v.observedAt))<60000&&['runId','stepId','target','environment'].every(k=>v.producer?.[k]===(expected as any)[k])&&['attemptTerminated','runtimeAbsent','ownershipReleased','originalServiceIdentity','originalServiceHealth','protectedResourceExpected'].every(k=>v.checks?.[k]===true);
}

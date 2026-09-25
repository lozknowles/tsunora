import {createHash} from 'node:crypto';
import type {BenchmarkCase} from './local-llm-benchmark.js';
import type {ActionContext} from './job-types.js';
import type {ActionRegistry} from './job-runtime.js';
import type {JobCatalog} from './job-catalog.js';

export type LabCompatibility='BLOCKED'|'SUPPORTED'|'SUPPORTED_WITH_LIMITATIONS'|'DOES_NOT_FIT'|'RUNTIME_INCOMPATIBLE'|'HARDWARE_INCOMPATIBLE'|'FAILED'|'NOT_YET_TESTED';
export type LabTestClass='COMMON_COMPARABLE'|'CAPABILITY'|'BOUNDARY_OPTIMISATION';
export class LabPreparationFailure extends Error {
 constructor(readonly classification:Extract<LabCompatibility,'DOES_NOT_FIT'|'RUNTIME_INCOMPATIBLE'|'HARDWARE_INCOMPATIBLE'|'FAILED'>,readonly reason:string,readonly evidence:unknown){super('lab_preparation_'+classification.toLowerCase());}
}
export class LabAdmissionBlocked extends Error {
 constructor(readonly evidence:unknown){super('lab_transport_admission_failed');}
}
export interface LabQualificationSpec {
 schema:'agent-control.model-hardware-qualification/v1';id:string;version:string;
 target:{device:string;environment:string;runtime:string;model:string;modelSha256:string;runtimeSha256:string;discoveryEvidence:string[]};
 adapter:string;profileRef:string;testClass:LabTestClass;cases:BenchmarkCase[];repetitions:number;timeoutMs:number;
 requestedDimensions:string[];evidenceRequirements:string[];resourcePolicyRef:string;continuationSha256?:string;
}
export interface LabAttemptResult {
 status:'SUCCEEDED'|'FAILED'|'OOM'|'TIMED_OUT'|'CANCELLED'|'UNSUPPORTED'|'BLOCKED';executionStarted?:boolean;output:string;input:unknown;error:string|null;
 tokens:{input:number|null;cached:number|null;output:number|null};
 metrics:Record<string,number|null>;configuration:unknown;rawResponse:unknown;
 evidenceAvailability:Record<string,'RECORDED'|'UNAVAILABLE'|'UNSUPPORTED'|'NOT_RECORDED'|'PROTECTED_REDACTED'>;
}
export interface LabExecutionAdapter {
 id:string;
 compatibility(spec:LabQualificationSpec,context:ActionContext):Promise<{status:LabCompatibility;reasons:string[];evidence:unknown}>;
 prepare(spec:LabQualificationSpec,context:ActionContext):Promise<unknown>;
 invoke(spec:Omit<LabQualificationSpec,'cases'>,task:Pick<BenchmarkCase,'id'|'prompt'>,context:ActionContext):Promise<LabAttemptResult>;
 validate(task:BenchmarkCase,result:LabAttemptResult,context:ActionContext):Promise<{passed:boolean|null;reason:string;evidence:unknown}>;
 restore(spec:LabQualificationSpec,state:unknown,context:ActionContext):Promise<{restored:boolean;evidence:unknown}>;
}
export const labSpecDigest=(value:LabQualificationSpec)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function validateLabAttempt(r:LabAttemptResult){
 if(!r||!['SUCCEEDED','FAILED','OOM','TIMED_OUT','CANCELLED','UNSUPPORTED','BLOCKED'].includes(r.status)||typeof r.output!=='string'||!(r.error===null||typeof r.error==='string')||!r.tokens||!r.metrics||!r.evidenceAvailability)throw Error('lab_attempt_invalid');
 for(const key of ['input','cached','output'] as const){const value=r.tokens[key];if(value!==null&&(!Number.isSafeInteger(value)||value<0))throw Error('lab_token_invalid');}
 if(r.status==='BLOCKED'&&(r.executionStarted!==false||r.output!==''||Object.values(r.tokens).some(v=>v!==null)))throw Error('lab_blocked_execution_contradiction');
 if(r.executionStarted===false&&r.status!=='BLOCKED')throw Error('lab_execution_state_contradiction');
 if(r.tokens.input!==null&&r.tokens.cached!==null&&r.tokens.cached>r.tokens.input)throw Error('lab_cached_tokens_exceed_input');
 if(Object.values(r.metrics).some(value=>value!==null&&(typeof value!=='number'||!Number.isFinite(value))))throw Error('lab_metric_invalid');
 if(Object.values(r.evidenceAvailability).some(value=>!['RECORDED','UNAVAILABLE','UNSUPPORTED','NOT_RECORDED','PROTECTED_REDACTED'].includes(value)))throw Error('lab_evidence_availability_invalid');
 return r;
}
export function validateLabSpec(s:LabQualificationSpec){
 if(s?.schema!=='agent-control.model-hardware-qualification/v1'||!s.id||!s.version||!s.adapter||!s.profileRef||!s.resourcePolicyRef||!['COMMON_COMPARABLE','CAPABILITY','BOUNDARY_OPTIMISATION'].includes(s.testClass))throw Error('lab_spec_invalid');
 if(!Number.isInteger(s.repetitions)||s.repetitions<(s.testClass==='CAPABILITY'?1:3)||s.repetitions>30||!Number.isInteger(s.timeoutMs)||s.timeoutMs<1000||s.timeoutMs>86400000)throw Error('lab_limits_invalid');
 if(!s.target||![s.target.device,s.target.environment,s.target.runtime,s.target.model].every(v=>typeof v==='string'&&v.length>0&&v.length<=240)||![s.target.modelSha256,s.target.runtimeSha256].every(v=>/^[a-f0-9]{64}$/.test(v))||!Array.isArray(s.target.discoveryEvidence)||!s.target.discoveryEvidence.length)throw Error('lab_identity_evidence_required');
 if(!Array.isArray(s.cases)||!s.cases.length||s.cases.length>32||new Set(s.cases.map(c=>c.id)).size!==s.cases.length||s.cases.some(c=>!c.id||typeof c.prompt!=='string'||!c.prompt||c.prompt.length>2*1024*1024||!['exact-text','json-schema','python-function-tests'].includes(c.validator)))throw Error('lab_workload_invalid');
 if(!Array.isArray(s.requestedDimensions)||s.requestedDimensions.length>16||!Array.isArray(s.evidenceRequirements)||!s.evidenceRequirements.length)throw Error('lab_capabilities_invalid');
 if(s.continuationSha256!==undefined&&!/^[a-f0-9]{64}$/.test(s.continuationSha256))throw Error('lab_continuation_digest_invalid');
 return structuredClone(s);
}
/** Registers one ordinary governed job; no scheduler, telemetry store or model downloader. */
export function registerModelHardwareQualification(catalog:JobCatalog,actions:ActionRegistry,options:{
 resolveSameRun?:(spec:LabQualificationSpec,context:ActionContext)=>Promise<Array<{caseId:string;repetition:number;id:string;sha256:string;status:'SUCCEEDED';quality:boolean|null;evidenceComplete:boolean}>>;
 defaultSpecSha256?:string;
 resolve:(digest:string)=>LabQualificationSpec;
 authorize:(spec:LabQualificationSpec,context:ActionContext)=>Promise<void>;
 adapters:LabExecutionAdapter[];
 resolveContinuation?:(spec:LabQualificationSpec,context:ActionContext)=>Promise<Array<{caseId:string;repetition:number;id:string;sha256:string;status:'SUCCEEDED';quality:boolean|null;evidenceComplete:boolean}>>;
 recordAccounting?:(context:ActionContext,result:LabAttemptResult,identity:{id:string;startedAt:string;endedAt:string;spec:LabQualificationSpec})=>Promise<string|null>;
}){
 if(new Set(options.adapters.map(a=>a.id)).size!==options.adapters.length)throw Error('lab_adapter_duplicate');
 actions.registerConsequentialControl('model-hardware-qualification.execute@1.0.0',async context=>{
  if(!context.recordEvidence)throw Error('lab_authoritative_evidence_required');
  const digest=String(context.parameters.specSha256??'');if(!/^[a-f0-9]{64}$/.test(digest))throw Error('lab_spec_digest_required');
  const spec=validateLabSpec(options.resolve(digest));if(labSpecDigest(spec)!==digest)throw Error('lab_spec_changed');
  await options.authorize(spec,context);
  context.signal.throwIfAborted();
  const adapter=options.adapters.find(a=>a.id===spec.adapter);if(!adapter)throw Error('lab_adapter_unavailable');
  const reused=context.run.resumptions?.length?(options.resolveSameRun?await options.resolveSameRun(spec,context):(()=>{throw Error('lab_same_run_resolver_required');})()):spec.continuationSha256?(options.resolveContinuation?await options.resolveContinuation(spec,context):(()=>{throw Error('lab_continuation_resolver_required');})()):[];
  const slots=new Set<string>();for(const a of reused){const slot=a.caseId+':'+a.repetition;if(!spec.cases.some(c=>c.id===a.caseId)||!Number.isInteger(a.repetition)||a.repetition<1||a.repetition>spec.repetitions||slots.has(slot)||a.status!=='SUCCEEDED'||!a.id||!/^[a-f0-9]{64}$/.test(a.sha256)||![true,false,null].includes(a.quality)||typeof a.evidenceComplete!=='boolean')throw Error('lab_continuation_invalid');slots.add(slot);}
  if(spec.continuationSha256||context.run.resumptions?.length)context.recordEvidence('lab-continuation',{digest:spec.continuationSha256,reused,boundary:'References to verified prior executions; no duplicate accounting or retrospective quality changes.'});
  const boundedContext={...context,signal:AbortSignal.any([context.signal,AbortSignal.timeout(spec.timeoutMs)])};
  const definition=context.recordEvidence('lab-qualified-spec',{spec,digest});
  const compatibility=await adapter.compatibility(spec,boundedContext);
  const admission=context.recordEvidence('lab-compatibility',{...compatibility,target:spec.target,specSha256:digest});
  boundedContext.signal.throwIfAborted();
  if(!['SUPPORTED','SUPPORTED_WITH_LIMITATIONS'].includes(compatibility.status))return{artifacts:[{name:'qualification',value:{schema:'agent-control.lab-qualification/v1',specSha256:digest,status:compatibility.status,definition:definition.id,compatibility:admission.id,attempts:[],reused,completedAttemptCount:reused.length,plannedAttemptCount:spec.cases.length*spec.repetitions,executionStatus:'INTERRUPTED'}}],verification:['lab-evidence-retained']};
  // prepare must roll back its own partial failure; restore receives the completed preparation receipt.
  let state:unknown;
  try{state=await adapter.prepare(spec,boundedContext);}catch(error){const failure=context.recordEvidence('lab-preparation-failure',{specSha256:digest,status:error instanceof LabPreparationFailure?error.classification:context.signal.aborted?'CANCELLED':boundedContext.signal.aborted?'TIMED_OUT':'FAILED',reason:error instanceof LabPreparationFailure?error.reason:null,evidence:error instanceof LabPreparationFailure?error.evidence:null,errorClass:error instanceof Error?error.name:'UnknownError',partialRollback:'Adapter must retain its own rollback receipt; not inferred here.'});if(error instanceof LabPreparationFailure)return{artifacts:[{name:'qualification',value:{schema:'agent-control.lab-qualification/v1',specSha256:digest,status:error.classification,definition:definition.id,compatibility:admission.id,preparationFailure:failure.id,attempts:[],productionRoutingChanged:false}}],verification:['lab-evidence-retained']};throw Error('lab_preparation_failed');}
  const attempts:Array<{id:string;sha256:string;status:string;quality:boolean|null;evidenceComplete:boolean}>=[];
  let restored=false;
  try{
   qualification:for(const task of spec.cases)for(let repetition=1;repetition<=spec.repetitions;repetition++){
    if(slots.has(task.id+':'+repetition))continue;
    boundedContext.signal.throwIfAborted();if(labSpecDigest(spec)!==digest)throw Error('lab_spec_changed');await options.authorize(spec,boundedContext);
    const startedAt=new Date().toISOString(),id=`${context.run.id}:${task.id}:${repetition}${context.run.resumptions?.length?':resume-'+context.run.resumptions.at(-1)!.generation:''}`;
    const {cases:_cases,...publicSpec}=spec;
    let result:LabAttemptResult;
    try{result=validateLabAttempt(await adapter.invoke(publicSpec,{id:task.id,prompt:task.prompt},boundedContext));}
    catch(error){result=error instanceof LabAdmissionBlocked?{status:'BLOCKED',executionStarted:false,input:task.prompt,output:'',error:'resource_admission_blocked',tokens:{input:null,cached:null,output:null},metrics:{},configuration:{profileRef:spec.profileRef},rawResponse:{admissionEvidence:error.evidence},evidenceAvailability:{'input-output':'NOT_RECORDED'}}:{status:context.signal.aborted?'CANCELLED':boundedContext.signal.aborted?'TIMED_OUT':'FAILED',input:task.prompt,output:'',error:context.signal.aborted?'qualification_cancelled':boundedContext.signal.aborted?'qualification_deadline':'adapter_invocation_failed',tokens:{input:null,cached:null,output:null},metrics:{},configuration:{profileRef:spec.profileRef},rawResponse:{errorClass:error instanceof Error?error.name:'UnknownError',exceptionMessageRetained:false},evidenceAvailability:{'input-output':'NOT_RECORDED'}};}
    const endedAt=new Date().toISOString();
    const response=context.recordEvidence('lab-invocation-response',{id,specSha256:digest,caseId:task.id,repetition,startedAt,endedAt,result});
    let verdict:Awaited<ReturnType<LabExecutionAdapter['validate']>>={passed:null,reason:'Inference did not succeed; quality not evaluated.',evidence:null};
    if(result.status==='SUCCEEDED')try{verdict=await adapter.validate(task,result,boundedContext);}catch(error){verdict={passed:null,reason:'Validator failed; quality unknown.',evidence:{errorClass:error instanceof Error?error.name:'UnknownError'}};}
    const quality=context.recordEvidence('lab-quality-verdict',{id,...verdict});
    const accountingId=result.status==='BLOCKED'?null:await options.recordAccounting?.(context,result,{id,startedAt,endedAt,spec})??null;
    const record=context.recordEvidence('lab-qualification-attempt',{schema:'agent-control.lab-attempt/v1',id,runId:context.run.id,specSha256:digest,benchmarkVersion:spec.version,testClass:spec.testClass,target:spec.target,caseId:task.id,caseSha256:createHash('sha256').update(JSON.stringify(task)).digest('hex'),repetition,startedAt,endedAt,status:result.status,quality:{passed:verdict.passed,evidenceId:quality.id},accountingInvocationId:accountingId,response:{id:response.id,sha256:response.sha256},definition:{id:definition.id,sha256:definition.sha256}});
    attempts.push({id:record.id,sha256:record.sha256,status:result.status,quality:verdict.passed,evidenceComplete:spec.evidenceRequirements.every(key=>result.evidenceAvailability[key]==='RECORDED')});
    // Evidence is committed before advancing; every non-success stops this serial suite.
    if(result.status!=='SUCCEEDED')break qualification;
   }
  }finally{
   // Cancellation must still permit bounded restoration of resources owned by this parcel.
   let recovery:Awaited<ReturnType<LabExecutionAdapter['restore']>>;
   try{recovery=await adapter.restore(spec,state,{...context,signal:AbortSignal.timeout(120000)});}catch(error){context.recordEvidence('lab-restoration',{restored:false,errorClass:error instanceof Error?error.name:'UnknownError'});throw Error('lab_restoration_unconfirmed');}
   restored=recovery.restored;
   context.recordEvidence('lab-restoration',recovery);if(!restored)throw Error('lab_restoration_unconfirmed');
  }
  boundedContext.signal.throwIfAborted();
  const combined=[...reused,...attempts];
  return{artifacts:[{name:'qualification',value:{schema:'agent-control.lab-qualification/v1',specSha256:digest,status:attempts.some(a=>a.status==='BLOCKED')?'BLOCKED':combined.every(a=>a.status==='SUCCEEDED'&&a.quality===true)?combined.every(a=>a.evidenceComplete)?'QUALIFIED':'INCOMPLETE':'FAILED',definition:definition.id,compatibility:admission.id,attempts,reused,completedAttemptCount:combined.filter(a=>a.status==='SUCCEEDED').length,qualityPassedCount:combined.filter(a=>a.status==='SUCCEEDED'&&a.quality===true).length,executionStatus:combined.filter(a=>a.status==='SUCCEEDED').length===spec.cases.length*spec.repetitions?'COMPLETE':'INTERRUPTED',reusedAttemptCount:reused.length,plannedAttemptCount:spec.cases.length*spec.repetitions,unattemptedCount:spec.cases.length*spec.repetitions-attempts.length-reused.length,restored,productionRoutingChanged:false}}],verification:['lab-evidence-retained']};
 },['FILESYSTEM_WRITE','REMOTE_NODE']);
 catalog.knownActions?.add('model-hardware-qualification.execute@1.0.0');
 catalog.addJob({apiVersion:'agent-control/v1',kind:'Job',metadata:{id:'model-hardware-qualification',version:'1.0.0',name:'Qualify this model on this device'},spec:{priority:'normal',concurrency:'no-overlap',parameters:{specSha256:{type:'string',required:true,...(options.defaultSpecSha256?{default:options.defaultSpecSha256}:{})}},steps:[{id:'qualify',action:'model-hardware-qualification.execute@1.0.0',requires:['model.hardware.qualify'],resources:['lab/qualification-window'],timeoutSeconds:86400,verification:['lab-evidence-retained'],outputs:[{name:'qualification',type:'application/json',schema:'agent-control.lab-qualification/v1',version:'1.0.0'}]}]}});
}

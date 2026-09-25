import {createHash} from 'node:crypto';
import type {ArtifactStore} from './job-runtime.js';
import type {RunRecord} from './job-types.js';
import {labSpecDigest,type LabQualificationSpec} from './model-hardware-qualification.js';
import {verifyLabContinuation,type PriorLabEvidence} from './lab-continuation.js';

/** Read-only reconciliation. No target access, admission or caller-supplied cursor. */
export function benchmarkResumeCursor(run:RunRecord,spec:LabQualificationSpec,configuration:unknown,store:ArtifactStore,inspectionOnly=false){
 const digest=labSpecDigest(spec),step=run.steps[0];
 if(run.steps.length!==1||step.action!=='model-hardware-qualification.execute@1.0.0'||run.parameters.specSha256!==digest||spec.continuationSha256)throw Error('benchmark_resume_binding_mismatch');
 const records=store.list(run.id).filter(a=>a.stepId===step.id),linked=new Set(run.artifacts);
 const read=(ref:PriorLabEvidence)=>{const a=store.get(ref?.id);if(!a||a.runId!==run.id||a.stepId!==step.id||a.sha256!==ref.sha256||!linked.has(a.id))throw Error('benchmark_resume_evidence_binding');return store.readText(a.id);};
 const load=(id:string)=>{const a=store.get(id);if(!a)throw Error('benchmark_resume_evidence_missing');return JSON.parse(read(a));};
 const boundaries=records.filter(a=>a.name==='target-recovery-boundary').map(a=>load(a.id)).filter(b=>b.recoveryBoundary==='CONFIRMED'&&b.target===spec.target.device&&b.environment===spec.target.environment&&b.receipt?.status==='COMPLETE'&&b.receipt?.pre?.bootId!==b.receipt?.post?.bootId);
 const abandoned:string[]=[];
 const refs:PriorLabEvidence[]=[],refusals:string[]=[],responses=new Set<string>(),completed=new Set<string>(),unresolved:string[]=[];
 for(const meta of records.filter(a=>a.name==='lab-qualification-attempt')){
  const a=load(meta.id),response=load(a.response?.id),definition=load(a.definition?.id);
  read(a.response);read(a.definition);
  const task=spec.cases.find(c=>c.id===a.caseId),slot=a.caseId+':'+a.repetition;
  if(a.schema!=='agent-control.lab-attempt/v1'||a.runId!==run.id||a.specSha256!==digest||definition.digest!==digest||JSON.stringify(definition.spec)!==JSON.stringify(spec)||!task||!Number.isInteger(a.repetition)||a.repetition<1||a.repetition>spec.repetitions||a.caseSha256!==createHash('sha256').update(JSON.stringify(task)).digest('hex')||a.id!==response.id||a.caseId!==response.caseId||a.repetition!==response.repetition||response.specSha256!==digest||a.startedAt!==response.startedAt||a.endedAt!==response.endedAt)throw Error('benchmark_resume_attempt_mismatch');
  if(responses.has(a.response.id))throw Error('benchmark_resume_duplicate_response');responses.add(a.response.id);
  const quality=load(a.quality?.evidenceId);
  if(quality.id!==a.id||quality.passed!==a.quality.passed)throw Error('benchmark_resume_score_mismatch');
  if(a.status==='BLOCKED'){
   if(response.result?.status!=='BLOCKED'||response.result.executionStarted!==false||response.result.output!==''||Object.values(response.result.tokens??{}).some(v=>v!==null))throw Error('benchmark_resume_refusal_invalid');
   refusals.push(meta.id);continue;
  }
  if(a.status!=='SUCCEEDED'){if(['FAILED','CANCELLED'].includes(a.status)&&boundaries.some(b=>a.startedAt>=b.evidenceWindow.from&&a.endedAt<b.evidenceWindow.to)){abandoned.push(meta.id);continue;}if(!inspectionOnly)throw Error('benchmark_resume_execution_ambiguous');unresolved.push(meta.id);continue;}
  if(completed.has(slot))throw Error('benchmark_resume_execution_ambiguous');
  const nativeRef=response.result?.rawResponse?.nativeExecutionEvidence,native=JSON.parse(read(nativeRef));
  if(native.classification!=='AGENT_CONTROL_RUNTIME_EVIDENCE'||native.missing?.length!==0||native.producer?.runId!==run.id||native.producer?.stepId!==step.id||native.producer?.target!==spec.target.device||native.producer?.environment!==spec.target.environment||native.ownedProcess?.exitCode!==0||response.result.rawResponse.originalServiceRestored!==true)throw Error('benchmark_resume_native_evidence_required');
  completed.add(slot);refs.push(meta);
 }
 if(records.some(a=>a.name==='lab-invocation-response'&&!responses.has(a.id)))throw Error('benchmark_resume_uncommitted_response');
 if(records.filter(a=>a.name==='runtime-invocation-dispatch').length!==refs.length+unresolved.length+abandoned.length)throw Error('benchmark_resume_uncommitted_dispatch');
 const reused=verifyLabContinuation(spec,refs,read,configuration);
 const restoration=records.filter(a=>a.name==='lab-restoration').at(-1);
 if((refs.length||refusals.length)&&(!restoration||load(restoration.id).restored!==true))throw Error('benchmark_resume_restoration_unconfirmed');
 const outstanding=spec.cases.flatMap(c=>Array.from({length:spec.repetitions},(_,i)=>({caseId:c.id,repetition:i+1}))).filter(s=>!completed.has(s.caseId+':'+s.repetition));
 return {...(inspectionOnly?{inspectionOnly:true,resumable:unresolved.length===0,unresolved}:{}),schema:'agent-control.benchmark-resume-cursor/v1',runId:run.id,specSha256:digest,reused,refusals,outstanding,completedCount:reused.length,plannedCount:spec.cases.length*spec.repetitions,complete:outstanding.length===0};
}

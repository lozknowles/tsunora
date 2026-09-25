import {createHash} from 'node:crypto';
import type {ArtifactRecord} from './job-types.js';
export function labQualificationSummaries(runId:string,records:ArtifactRecord[],read:(id:string)=>unknown){
 const scoped=new Map(records.filter(r=>r.runId===runId).map(r=>[r.id,r]));
 return records.filter(r=>r.runId===runId&&r.schema==='agent-control.lab-qualification/v1').map(meta=>{
  const q=read(meta.id) as any,definition=scoped.get(q.definition);
  if(!definition||q.schema!=='agent-control.lab-qualification/v1')throw Error('lab_qualification_binding_invalid');
  const d=read(definition.id) as any;
  if(d.digest!==q.specSha256||createHash('sha256').update(JSON.stringify(d.spec)).digest('hex')!==q.specSha256)throw Error('lab_qualification_definition_invalid');
  return {status:q.status,target:d.spec.target,benchmarkVersion:d.spec.version,testClass:d.spec.testClass,attemptCount:Array.isArray(q.attempts)?q.attempts.length:null,recordedAt:meta.createdAt,evidence:{id:meta.id,sha256:meta.sha256},definitionEvidence:{id:definition.id,sha256:definition.sha256}};
 });
}
/** Read-only joins over the existing checksum-verifying artifact store, never a second Lab ledger. */
export function labObservations(runId:string,records:ArtifactRecord[],read:(id:string)=>unknown){
 const byId=new Map(records.filter(r=>r.runId===runId).map(r=>[r.id,r]));
 const load=(id:string,sha?:string)=>{const meta=byId.get(id);if(!meta||sha&&meta.sha256!==sha)throw Error('lab_evidence_binding_invalid');return {meta,value:read(id) as any};};
 const seen=new Set<string>();
 return records.filter(r=>r.runId===runId&&r.name==='lab-qualification-attempt').map(meta=>{
  const a=load(meta.id).value;
  if(a.schema!=='agent-control.lab-attempt/v1'||a.runId!==runId||typeof a.id!=='string'||seen.has(a.id))throw Error('lab_attempt_identity_invalid');seen.add(a.id);
  const definition=load(a.definition.id,a.definition.sha256),response=load(a.response.id,a.response.sha256),quality=load(a.quality.evidenceId);
  const spec=definition.value.spec,result=response.value.result;
  if(definition.value.digest!==a.specSha256||createHash('sha256').update(JSON.stringify(spec)).digest('hex')!==a.specSha256||response.value.id!==a.id||response.value.specSha256!==a.specSha256||quality.value.id!==a.id||quality.value.passed!==a.quality.passed||JSON.stringify(spec.target)!==JSON.stringify(a.target))throw Error('lab_evidence_join_invalid');
  const task=spec.cases.find((c:any)=>c.id===a.caseId);
  if(!task||createHash('sha256').update(JSON.stringify(task)).digest('hex')!==a.caseSha256)throw Error('lab_workload_binding_invalid');
  return {id:a.id,accountingInvocationId:a.accountingInvocationId,runId,benchmarkVersion:a.benchmarkVersion,testClass:a.testClass,caseId:a.caseId,caseSha256:a.caseSha256,repetition:a.repetition,quality:a.quality.passed===true?'PASS':a.quality.passed===false?'FAIL':'UNKNOWN',qualityReason:typeof quality.value.reason==='string'?quality.value.reason:'Reason not recorded',status:a.status,target:a.target,configuration:result.configuration,metrics:result.metrics,tokens:result.tokens,evidenceAvailability:result.evidenceAvailability,evidenceComplete:spec.evidenceRequirements.every((key:string)=>result.evidenceAvailability[key]==='RECORDED'),evidence:[meta,definition.meta,response.meta,quality.meta].map(m=>({id:m.id,sha256:m.sha256})),routingRecommendation:a.quality.passed===true&&a.status==='SUCCEEDED'?'Case passed; full qualification and current availability still required.':'Do not recommend this combination for this case from this evidence.'};
 });
}

/** A numeric wire alias survives generic secret-key redaction without relaxing that boundary. */
export function labObservationForApi(observation:ReturnType<typeof labObservations>[number]){
 const value=observation.metrics?.timeToFirstTokenSeconds;
 const ttftSeconds=typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
 return {...observation,usage:observation.tokens,metrics:{...observation.metrics,ttftSeconds}};
}

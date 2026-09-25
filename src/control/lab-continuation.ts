import {createHash} from 'node:crypto';
import type {LabQualificationSpec} from './model-hardware-qualification.js';
export interface PriorLabEvidence {id:string;sha256:string;}
export function verifyLabContinuation(spec:LabQualificationSpec, refs:PriorLabEvidence[], read:(ref:PriorLabEvidence)=>string, configuration:unknown){
 const load=(ref:PriorLabEvidence)=>{if(!ref||!ref.id||!/^[a-f0-9]{64}$/.test(ref.sha256))throw Error('lab_prior_reference_invalid');const text=read(ref);if(createHash('sha256').update(text).digest('hex')!==ref.sha256)throw Error('lab_prior_checksum_mismatch');return JSON.parse(text);};
 const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
 return refs.map(ref=>{
  const a=load(ref),definition=load(a.definition),response=load(a.response),prior=definition.spec;
  const currentCase=spec.cases.find(c=>c.id===a.caseId),oldCase=prior?.cases?.find((c:any)=>c.id===a.caseId);
  if(a.schema!=='agent-control.lab-attempt/v1'||a.status!=='SUCCEEDED'||response.result?.status!=='SUCCEEDED'||a.id!==response.id||a.runId===undefined||response.caseId!==a.caseId||response.repetition!==a.repetition||!currentCase||!same(currentCase,oldCase))throw Error('lab_prior_execution_mismatch');
  for(const key of ['id','version','adapter','profileRef','testClass','repetitions'] as const)if(!same(spec[key],prior[key]))throw Error('lab_prior_spec_mismatch');
  for(const key of ['device','environment','runtime','model','modelSha256','runtimeSha256'] as const)if(spec.target[key]!==prior.target?.[key]||spec.target[key]!==a.target?.[key])throw Error('lab_prior_target_mismatch');
  if(createHash('sha256').update(JSON.stringify(prior)).digest('hex')!==a.specSha256||a.specSha256!==response.specSha256||definition.digest!==a.specSha256||a.caseSha256!==createHash('sha256').update(JSON.stringify(currentCase)).digest('hex')||!same(response.result.configuration,configuration))throw Error('lab_prior_configuration_mismatch');
  if(![true,false,null].includes(a.quality?.passed)||response.result.executionStarted===false)throw Error('lab_prior_quality_invalid');
  return {caseId:a.caseId,repetition:a.repetition,id:ref.id,sha256:ref.sha256,status:'SUCCEEDED' as const,quality:a.quality.passed as boolean|null,evidenceComplete:spec.evidenceRequirements.every(k=>response.result.evidenceAvailability?.[k]==='RECORDED')};
 });
}

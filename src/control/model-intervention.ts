import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type InterventionKind='PROMPT'|'CONTEXT_POLICY'|'RETRIEVAL_POLICY'|'EXPERT_CONFIGURATION'|'ROUTING_RULE'|'MODEL_ADAPTER'|'MODEL_CHECKPOINT'|'OTHER';
export type JsonValue=null|boolean|number|string|JsonValue[]|{[key:string]:JsonValue};

export interface PromotionProposal {
  schema:'agent-control.model-improvement-promotion-proposal/v1';
  id:string; experimentId:string; baselineSha256:string; candidateSha256:string;
  interventionKind:InterventionKind;
  target:{id:string;workload:string;route:string};
  intendedEffect:string; previousState:JsonValue; proposedState:JsonValue;
  previousStateSha256:string; proposedStateSha256:string;
  affectedConfigurationReference:string; rollbackPlan:string;
  candidateEvidence:string[]; securityEvidence:string[]; regressionEvidence:string[];
  approvalRequirement:string; createdAt:string; sha256:string;
}
export interface PromotionApproval {
  schema:'agent-control.model-improvement-promotion-approval/v1';
  id:string; proposalSha256:string; candidateSha256:string; approved:boolean;
  actor:string; reason:string; evidence:string[]; decidedAt:string; sha256:string;
}
export interface InterventionObservation {
  observedState:JsonValue; observedStateSha256:string; candidateSha256:string|null;
  protectedStateSha256:string; evidence:string[]; observedAt:string;
}
export interface AppliedEffectReceipt {
  schema:'agent-control.model-improvement-applied-effect/v1';
  id:string; proposalSha256:string; approvalId:string; approvalSha256:string;
  experimentId:string; candidateSha256:string; interventionKind:InterventionKind;
  target:PromotionProposal['target']; previousStateSha256:string; appliedStateSha256:string;
  adapter:{id:string;version:string}; applicationTimestamp:string;
  verificationMethod:string; verificationEvidence:string[]; protectedStateComparison:{beforeSha256:string;afterSha256:string;unchanged:boolean};
  actor:string; result:'VERIFIED'; sha256:string;
}
export interface RollbackProposal {
  schema:'agent-control.model-improvement-rollback-proposal/v1';id:string;
  promotionReceiptSha256:string;experimentId:string;target:PromotionProposal['target'];
  restoreStateSha256:string;reason:string;approvalRequirement:string;createdAt:string;sha256:string;
}
export interface RollbackReceipt {
  schema:'agent-control.model-improvement-rollback-receipt/v1';id:string;
  originalPromotionReceiptSha256:string;rollbackProposalSha256:string;experimentId:string;
  stateBeforeRollbackSha256:string;restoredStateSha256:string;
  adapter:{id:string;version:string};verificationMethod:string;verificationEvidence:string[];
  protectedStateComparison:{beforeSha256:string;afterSha256:string;unchanged:boolean};
  timestamp:string;actor:string;result:'VERIFIED';sha256:string;
}
export interface PreparedIntervention {proposalSha256:string;currentStateSha256:string;protectedStateSha256:string;evidence:string[];}
export interface InterventionAdapter {
  readonly id:string;readonly version:string;readonly kinds:readonly InterventionKind[];
  prepare(proposal:PromotionProposal,approval:PromotionApproval):PreparedIntervention;
  apply(proposal:PromotionProposal,prepared:PreparedIntervention):{appliedAt:string;evidence:string[]};
  observe(proposal:PromotionProposal):InterventionObservation;
  rollback(proposal:PromotionProposal,receipt:AppliedEffectReceipt):{appliedAt:string;evidence:string[]};
}

const sort=(value:unknown):unknown=>Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,sort(item)])):value;
const stable=(value:unknown)=>JSON.stringify(sort(value));
export const interventionSha256=(value:unknown)=>createHash('sha256').update(typeof value==='string'?value:stable(value)).digest('hex');
const seal=<T extends object>(value:T)=>({...value,sha256:interventionSha256(value)});
const required=(value:string,code:string)=>{const result=value.trim();if(!result)throw Error(code);return result;};
const strings=(values:string[],code:string)=>[...new Set(values.map(value=>required(value,code)))].sort();
export const validSealed=(value:{sha256:string})=>interventionSha256(Object.fromEntries(Object.entries(value).filter(([key])=>key!=='sha256')))===value.sha256;

export function createPromotionProposal(input:Omit<PromotionProposal,'schema'|'id'|'previousStateSha256'|'proposedStateSha256'|'createdAt'|'sha256'>,createdAt=new Date().toISOString()):PromotionProposal{
  const base={schema:'agent-control.model-improvement-promotion-proposal/v1' as const,id:`promotion-proposal-${randomUUID()}`,...structuredClone(input),intendedEffect:required(input.intendedEffect,'promotion_effect_required'),affectedConfigurationReference:required(input.affectedConfigurationReference,'promotion_configuration_reference_required'),rollbackPlan:required(input.rollbackPlan,'promotion_rollback_plan_required'),candidateEvidence:strings(input.candidateEvidence,'promotion_candidate_evidence_required'),securityEvidence:strings(input.securityEvidence,'promotion_security_evidence_required'),regressionEvidence:strings(input.regressionEvidence,'promotion_regression_evidence_required'),approvalRequirement:required(input.approvalRequirement,'promotion_approval_requirement_required'),previousStateSha256:interventionSha256(input.previousState),proposedStateSha256:interventionSha256(input.proposedState),createdAt};
  if(!base.candidateEvidence.length||!base.securityEvidence.length||!base.regressionEvidence.length)throw Error('promotion_evidence_required');
  return seal(base);
}
export function createPromotionApproval(proposal:PromotionProposal,input:{approved:boolean;actor:string;reason:string;evidence:string[];candidateSha256:string},decidedAt=new Date().toISOString()):PromotionApproval{
  if(!validSealed(proposal)||proposal.candidateSha256!==input.candidateSha256)throw Error('promotion_approval_binding_mismatch');
  if(!input.evidence.length)throw Error('promotion_approval_evidence_required');
  return seal({schema:'agent-control.model-improvement-promotion-approval/v1' as const,id:`promotion-approval-${randomUUID()}`,proposalSha256:proposal.sha256,candidateSha256:input.candidateSha256,approved:input.approved,actor:required(input.actor,'promotion_actor_required'),reason:required(input.reason,'promotion_reason_required'),evidence:strings(input.evidence,'promotion_approval_evidence_required'),decidedAt});
}
export function createRollbackProposal(receipt:AppliedEffectReceipt,input:{reason:string;approvalRequirement:string},createdAt=new Date().toISOString()):RollbackProposal{
  if(!validSealed(receipt))throw Error('rollback_promotion_receipt_invalid');
  return seal({schema:'agent-control.model-improvement-rollback-proposal/v1' as const,id:`rollback-proposal-${randomUUID()}`,promotionReceiptSha256:receipt.sha256,experimentId:receipt.experimentId,target:structuredClone(receipt.target),restoreStateSha256:receipt.previousStateSha256,reason:required(input.reason,'rollback_reason_required'),approvalRequirement:required(input.approvalRequirement,'rollback_approval_requirement_required'),createdAt});
}
export function createAppliedEffectReceipt(input:Omit<AppliedEffectReceipt,'schema'|'id'|'sha256'>):AppliedEffectReceipt{return seal({schema:'agent-control.model-improvement-applied-effect/v1' as const,id:`applied-effect-${randomUUID()}`,...structuredClone(input)});}
export function createRollbackReceipt(input:Omit<RollbackReceipt,'schema'|'id'|'sha256'>):RollbackReceipt{return seal({schema:'agent-control.model-improvement-rollback-receipt/v1' as const,id:`rollback-receipt-${randomUUID()}`,...structuredClone(input)});}

interface PromptRouteState{prompt:string;candidateSha256:string|null;experimentId:string|null;updatedAt:string;}
interface PromptStateFile{schema:'agent-control.prompt-interventions/v1';routes:Record<string,PromptRouteState>;}
export class FilePromptInterventionAdapter implements InterventionAdapter{
  readonly id='agent-control.prompt-file';readonly version='1';readonly kinds=['PROMPT'] as const;
  constructor(private readonly stateFile:string,private readonly allowedTargets:string[],private readonly protectedState:()=>JsonValue,private readonly quarantined=()=>false,private readonly clock=()=>new Date().toISOString()){}
  prepare(proposal:PromotionProposal,approval:PromotionApproval){this.assertBound(proposal,approval);if(this.quarantined())throw Error('promotion_adapter_quarantined');const route=this.route(proposal.target.id);const current=this.routeValue(route);if(interventionSha256(current)!==proposal.previousStateSha256)throw Error('promotion_target_state_drifted');return{proposalSha256:proposal.sha256,currentStateSha256:proposal.previousStateSha256,protectedStateSha256:interventionSha256(this.protectedState()),evidence:[`prompt-route:${proposal.target.id}:prepared`]};}
  apply(proposal:PromotionProposal,prepared:PreparedIntervention){if(prepared.proposalSha256!==proposal.sha256)throw Error('promotion_prepare_binding_mismatch');const proposed=this.promptValue(proposal.proposedState);this.writeRoute(proposal.target.id,{prompt:proposed.prompt,candidateSha256:proposal.candidateSha256,experimentId:proposal.experimentId,updatedAt:this.clock()});return{appliedAt:this.clock(),evidence:[`prompt-route:${proposal.target.id}:written`]};}
  observe(proposal:PromotionProposal){const route=this.route(proposal.target.id),state=this.routeValue(route);return{observedState:state,observedStateSha256:interventionSha256(state),candidateSha256:route.candidateSha256,protectedStateSha256:interventionSha256(this.protectedState()),evidence:[`prompt-route:${proposal.target.id}:independent-read`],observedAt:this.clock()};}
  rollback(proposal:PromotionProposal,receipt:AppliedEffectReceipt){if(receipt.proposalSha256!==proposal.sha256||!validSealed(receipt))throw Error('rollback_receipt_binding_mismatch');const previous=this.promptValue(proposal.previousState);this.writeRoute(proposal.target.id,{prompt:previous.prompt,candidateSha256:previous.candidateSha256,experimentId:previous.experimentId,updatedAt:this.clock()});return{appliedAt:this.clock(),evidence:[`prompt-route:${proposal.target.id}:restored`]};}
  private assertBound(proposal:PromotionProposal,approval:PromotionApproval){if(!this.kinds.includes(proposal.interventionKind as 'PROMPT'))throw Error('promotion_adapter_kind_unsupported');if(!validSealed(proposal)||!validSealed(approval)||!approval.approved||approval.proposalSha256!==proposal.sha256||approval.candidateSha256!==proposal.candidateSha256)throw Error('promotion_adapter_approval_invalid');if(!this.allowedTargets.includes(proposal.target.id))throw Error('promotion_target_not_allowed');if(`file:${path.resolve(this.stateFile)}#${proposal.target.id}`!==proposal.affectedConfigurationReference)throw Error('promotion_configuration_reference_mismatch');}
  private promptValue(value:JsonValue){if(!value||Array.isArray(value)||typeof value!=='object'||typeof value.prompt!=='string')throw Error('promotion_prompt_state_invalid');return{prompt:value.prompt,candidateSha256:typeof value.candidateSha256==='string'?value.candidateSha256:null,experimentId:typeof value.experimentId==='string'?value.experimentId:null};}
  private routeValue(route:PromptRouteState):JsonValue{return{prompt:route.prompt,candidateSha256:route.candidateSha256,experimentId:route.experimentId};}
  private read():PromptStateFile{const value=JSON.parse(fs.readFileSync(this.stateFile,'utf8')) as PromptStateFile;if(value.schema!=='agent-control.prompt-interventions/v1'||!value.routes||typeof value.routes!=='object')throw Error('promotion_prompt_store_invalid');return value;}
  private route(id:string){const route=this.read().routes[id];if(!route)throw Error('promotion_target_missing');return route;}
  private writeRoute(id:string,route:PromptRouteState){const value=this.read();value.routes[id]=route;fs.mkdirSync(path.dirname(this.stateFile),{recursive:true});const temporary=`${this.stateFile}.${process.pid}.${randomUUID()}.tmp`;fs.writeFileSync(temporary,`${JSON.stringify(value,null,2)}\n`,{mode:0o600});fs.renameSync(temporary,this.stateFile);}
}

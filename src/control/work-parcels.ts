import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {HarnessEfficiencyLedgerPort, ModelInvocationObservation} from './harness-efficiency.js';
import type {JobRuntime} from './job-runtime.js';
import type {RunRecord} from './job-types.js';
import type {SystemReadiness} from './system-readiness.js';
import type {ModelRegistry} from './model-registry.js';
import type {WorkAttribution} from './identity-control-plane.js';
import type {ExecutionEvidenceMode} from './parameterized-job-types.js';
import type {GovernedRequestOrigin} from './request-origin.js';
import {assertNoSensitiveMaterial, redactSensitiveValue} from './security-redaction.js';
import {
  addParcelQuestion,
  addSteeringAmendment,
  addSuccessCriterion,
  allSuccessCriteriaPass,
  answerParcelQuestion,
  appendParcelContextEvent,
  createBatonView,
  createParcelContext,
  evaluateSuccessCriterion,
  inferStageCriteria,
  retrieveParcelContext,
  updateParcelActiveState,
  verifyParcelContextEventChain,
  withdrawParcelQuestion,
  type ParcelBatonView,
  type ParcelContextEventType,
  type ParcelContextState,
  type ParcelQuestion,
  type ParcelSuccessCriterion,
} from './parcel-context.js';
import type {AdaptiveOrchestrationRuntime, AdaptiveOutcome, AdaptiveRouteCandidate, AdaptiveTaskClass} from './adaptive-orchestration.js';
import type {TransportIntegrityRecord} from './transport-integrity.js';
import type {CacheEvidence} from './cache-evidence.js';
import type {CacheAwareExpertRuntime, CacheContextIdentity, CacheRouteIdentity} from './cache-aware-expert.js';
import type {AgentTemplateRegistry, AgentTemplateSelection} from './agent-template.js';

export type ParcelStatus = 'PLANNING' | 'QUEUED' | 'RUNNING' | 'WAITING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export type ParcelStageStatus = 'QUEUED' | 'BLOCKED' | 'RUNNING' | 'WAITING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export interface WorkParcelPlanStage {
  id: string; name: string; job: string; dependsOn?: string[]; parameters?: Record<string, unknown>;
  template?: AgentTemplateSelection;
  requiredCapabilities?: string[]; outputs?: string[]; executor?: string;
  requestedRoute?: {provider?: string; accountProfile?: string; model?: string; modelRole?: string; allowFallback?: boolean; purpose?: 'EXECUTION' | 'QUALIFICATION'; profile?: 'THIN' | 'STANDARD' | 'DEEP'; reason: string; cacheContext?: CacheContextIdentity; cacheScope?: {sessionId?: string; cacheScopeId?: string; backendInstanceId?: string}; cacheScopeByModel?: Record<string, {sessionId?: string; cacheScopeId?: string; backendInstanceId?: string}>};
}
export interface WorkParcelPlan {objective: string; constraints?: string[]; successCriteria?: Array<{id?: string; kind: ParcelSuccessCriterion['kind']; description: string; source?: ParcelSuccessCriterion['source']; requiredEvidence?: string[]; stageId?: string}>; planner: {kind: 'deterministic' | 'reasoning-model'; provider?: string; model?: string; reason: string}; stages: WorkParcelPlanStage[];}
export interface WorkParcelStage extends WorkParcelPlanStage {
  dependsOn: string[]; parameters: Record<string, unknown>; requiredCapabilities: string[]; outputs: string[]; status: ParcelStageStatus; runId?: string; waitingReason?: string; waitingQuestionIds?: string[]; error?: string;
  baton?: ({schema: 'agent-control.work-parcel-baton/v1'; artifactIds: string[]; outputTypes: string[]; transportContextSha256?: string; transportIntegrityState?: string; cacheExpertDecisionId?: string; cacheExpertId?: string} | ParcelBatonView) & {cacheExpertDecisionId?: string; cacheExpertId?: string};
  cacheExpertDecisionId?: string;
  actualRoute?: {workers: string[]; workloadNodeId?: string; providerExecutionNodeId?: string; credentialNodeId?: string; provider?: string; accountProfile?: string; accountLabel?: string; accountPlan?: string; accountPlanAuthority?: 'operator-configured' | 'provider-reported'; accountQualification?: string; accountAvailability?: string; model?: string; profile?: string; reason: string};
  startedAt?: string; endedAt?: string;
}
export interface WorkParcelTelemetry {inputTokens?: number | null; freshInputTokens: number | null; cachedInputTokens: number | null; cacheWriteTokens?: number | null; outputTokens: number | null; reasoningTokens: number | null; totalTokens: number | null; cost: number | null; currency: string | null; elapsedMs: number;}
export interface WorkParcelDecision {outcome: 'IN_PROGRESS' | 'COMPLETE' | 'FAIL_CLOSED' | 'CANCELLED'; title: string; summary: string; evidence: string[]; blockedStages: string[]; authority: 'Agent Control';}
export interface WorkParcelInvocationAudit {accountingInvocationId?: string; exchange?: {input: string; output: string; redacted: true; truncated: boolean}; id: string; stageId: string; runId: string | null; route: string; provider: string; accountProfileId?: string | null; accountLabel?: string | null; accountPlan?: string | null; model: string; logicalRole?: string | null; registryModelId?: string; providerModel?: string; qualificationVersion?: string; invocationProfile?: string | null; node: string | null; workloadNodeId?: string | null; providerExecutionNodeId?: string | null; credentialNodeId?: string | null; profile: string; startedAt: string; completedAt: string | null; elapsedMs: number | null; requestDispatched?: boolean | null; usageAuthority?: 'authoritative' | 'estimated' | 'unavailable'; inputTokens?: number | null; freshInputTokens: number | null; cachedInputTokens: number | null; cacheWriteTokens?: number | null; outputTokens: number | null; reasoningTokens: number | null; totalTokens: number | null; providerReportedCost: number | null; calculatedCost: number | null; costBasis: 'provider-reported' | 'calculated' | 'unavailable'; currency: string | null; cacheEvidence?: CacheEvidence; costAccounting?: ModelInvocationObservation['costAccounting']; verifierResult: string; outcome: string;}
export interface WorkParcelAuditEvent {id: string; at: string; type: 'task.received' | 'task.classified' | 'target.resolving' | 'target.found' | 'readiness.checked' | 'planning.started' | 'planning.failed' | 'plan.selected' | 'route.requested' | 'stage.dispatched' | 'stage.failed' | 'route.resolved' | 'invocation.started' | 'invocation.completed' | 'invocation.failed' | 'retry.exhausted' | 'governor.decision' | 'route.changed' | 'handoff.completed' | 'handoff.failed' | 'verification.completed' | 'question.created' | 'question.answered' | 'steering.accepted' | 'criterion.evaluated' | 'baton.created' | 'context.retrieved' | 'transport.context_bound' | 'transport.integrity_changed' | 'transport.repair_recorded' | 'transport.inspection' | 'cache.experts_assessed' | 'cache.expert_selected' | 'cache.expert_observed'; stageId?: string; summary: string; detail: string;}
export interface WorkParcelAudit {schema: 'agent-control.work-parcel-audit/v1'; recordedAt: string; classification: string; selectedExecution: 'Work Parcel'; planningRationale: string; planner: {kind: string; provider: string | null; model: string | null}; orchestrationDecisionId?: string; alternatives: Array<{stageId: string; candidate: string; eligible: boolean; reasons: string[]}>; timeline: WorkParcelAuditEvent[]; invocations: WorkParcelInvocationAudit[]; totals: {models: string[]; invocations: number; inputTokens?: number | null; freshInputTokens: number | null; cachedInputTokens: number | null; cacheWriteTokens?: number | null; outputTokens: number | null; reasoningTokens: number | null; totalTokens: number | null; providerReportedCost: number | null; calculatedCost: number | null; cost: number | null; costBasis: 'provider-reported' | 'calculated' | 'unavailable'; currency: string | null; modelExecutionMs: number; wallClockMs: number};}
export interface WorkParcel {id: string; prompt: string; objective: string; actor: string; origin?: GovernedRequestOrigin; attribution?: WorkAttribution; executionMode?: ExecutionEvidenceMode; executionOwner?: 'work-parcel-coordinator' | 'direct-repository-review-executor' | 'environment-discovery-runtime'; status: ParcelStatus; planner: WorkParcelPlan['planner']; stages: WorkParcelStage[]; context?: ParcelContextState; createdAt: string; updatedAt: string; endedAt?: string; telemetry: WorkParcelTelemetry; decision?: WorkParcelDecision; audit: WorkParcelAudit; provenance: Array<{at: string; type: string; detail: string}>; transportIntegrity?: TransportIntegrityRecord;}
export interface WorkParcelPlanner {plan(prompt: string): Promise<WorkParcelPlan> | WorkParcelPlan;}
export type ReasoningPlanProposer = (input: {prompt: string; jobs: Array<{id: string; name: string; version: string; description?: string}>}) => Promise<unknown>;

interface Snapshot {version: 1; parcels: WorkParcel[];}
const terminalRun = new Set(['SUCCEEDED', 'FAILED', 'DEGRADED', 'CANCELLED', 'MISSED', 'DISCONNECTED']);
const failedRun = new Set(['FAILED', 'DEGRADED', 'CANCELLED', 'MISSED', 'DISCONNECTED']);
const now = () => new Date().toISOString();
function writeAtomic(file: string, value: unknown) { fs.mkdirSync(path.dirname(file), {recursive: true}); const temporary = `${file}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600}); fs.renameSync(temporary, file); }

export class WorkParcelStore {
  private readonly values = new Map<string, WorkParcel>();
  private readonly listeners = new Set<(parcel: WorkParcel) => void>();
  constructor(readonly file: string) { if (fs.existsSync(file)) { const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Snapshot; if (parsed.version !== 1) throw new Error('unsupported_work_parcel_snapshot'); for (const parcel of parsed.parcels) this.values.set(parcel.id, normalizeStoredParcel(parcel)); } }
  subscribe(listener: (parcel: WorkParcel) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  add(parcel: WorkParcel) { if (this.values.has(parcel.id)) throw new Error('work_parcel_exists'); this.values.set(parcel.id, structuredClone(redactSensitiveValue(normalizeStoredParcel(parcel)))); this.save(); const stored = this.get(parcel.id)!; this.notify(stored); return stored; }
  get(id: string) { const value = this.values.get(id); return value ? structuredClone(value) : undefined; }
  list() { return [...this.values.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map(value => structuredClone(value)); }
  update(parcel: WorkParcel) { if (!this.values.has(parcel.id)) throw new Error('work_parcel_missing'); parcel.updatedAt = now(); this.values.set(parcel.id, structuredClone(redactSensitiveValue(normalizeStoredParcel(parcel)))); this.save(); const stored = this.get(parcel.id)!; this.notify(stored); return stored; }
  private notify(parcel: WorkParcel) { for (const listener of this.listeners) { try { listener(structuredClone(parcel)); } catch { /* Observability must not impair execution. */ } } }
  private save() { writeAtomic(this.file, {version: 1, parcels: this.list()} satisfies Snapshot); }
}

function normalizeStoredParcel(parcel: WorkParcel) {
  parcel.stages = parcel.stages.map(stage => ({...stage, dependsOn: [...(stage.dependsOn ?? [])], parameters: structuredClone(stage.parameters ?? {}), requiredCapabilities: [...(stage.requiredCapabilities ?? [])], outputs: [...(stage.outputs ?? [])], waitingQuestionIds: [...(stage.waitingQuestionIds ?? [])]}));
  parcel.context ??= createParcelContext({goal: parcel.objective || parcel.prompt, actor: parcel.actor, plan: parcel.stages, at: parcel.createdAt});
  verifyParcelContextEventChain(parcel.context.events); updateParcelActiveState(parcel.context, {plan: parcel.stages, currentStageIds: parcel.stages.filter(stage => ['RUNNING','WAITING'].includes(stage.status)).map(stage => stage.id), at: parcel.updatedAt}); return parcel;
}

export class CatalogNaturalLanguagePlanner implements WorkParcelPlanner {
  constructor(private readonly runtime: JobRuntime, private readonly complex?: WorkParcelPlanner) {}
  async plan(prompt: string) {
    const normalized = prompt.trim(); if (!normalized) throw new Error('work_parcel_prompt_required');
    const jobs = this.runtime.catalog.listJobs(), mentioned = jobs.filter(job => normalized.toLowerCase().includes(job.metadata.id.toLowerCase()));
    if (mentioned.length === 1) return {objective: normalized, planner: {kind: 'deterministic' as const, reason: `Prompt named registered Job ${mentioned[0].metadata.id}`}, stages: [{id: 'execute', name: mentioned[0].metadata.name, job: `${mentioned[0].metadata.id}@${mentioned[0].metadata.version}`, requestedRoute: {reason: 'Use normal Agent Control placement and routing'}}]};
    if (/(?:\b(?:evaluate|qualify|benchmark|test)\b.*\bfreetoken\b|\bfreetoken\b.*\b(?:evaluate|qualify|benchmark|test)\b)/i.test(normalized)) return freeTokenEvaluationPlan(normalized);
    if (!this.complex) throw new Error('work_parcel_reasoning_planner_unconfigured');
    return this.complex.plan(normalized);
  }
}

/** Adapts a model call into plan data only; validation and execution remain Agent Control responsibilities. */
export class ReasoningModelWorkParcelPlanner implements WorkParcelPlanner {
  constructor(private readonly runtime: JobRuntime, private readonly provider: string, private readonly model: string, private readonly propose: ReasoningPlanProposer) {}
  async plan(prompt: string): Promise<WorkParcelPlan> {
    const jobs = this.runtime.catalog.listJobs().map(job => ({id: job.metadata.id, name: job.metadata.name, version: job.metadata.version, description: job.metadata.description}));
    const raw = await this.propose({prompt, jobs}); if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('work_parcel_reasoning_plan_invalid');
    const value = raw as {objective?: unknown; stages?: unknown}; if (!Array.isArray(value.stages)) throw new Error('work_parcel_reasoning_plan_invalid');
    const stages = value.stages.map(item => { if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('work_parcel_reasoning_plan_invalid'); const stage = item as Record<string, unknown>, allowed = new Set(['id','name','job','dependsOn','parameters','requestedRoute','requiredCapabilities','outputs','executor','template']); if (Object.keys(stage).some(key => !allowed.has(key)) || !['id','name','job'].every(key => typeof stage[key] === 'string')) throw new Error('work_parcel_reasoning_plan_invalid'); return structuredClone(stage) as unknown as WorkParcelPlanStage; });
    return {objective: typeof value.objective === 'string' && value.objective.trim() ? value.objective : prompt, planner: {kind: 'reasoning-model', provider: this.provider, model: this.model, reason: 'Reasoning model proposed registered Job references; Agent Control validation is authoritative'}, stages};
  }
}

export function validateWorkParcelPlan(plan: WorkParcelPlan, runtime: JobRuntime, templates?:AgentTemplateRegistry) {
  if (!plan.objective.trim() || !plan.stages.length) throw new Error('work_parcel_plan_empty');
  const ids = new Set<string>();
  for (const stage of plan.stages) { if (!/^[a-z0-9][a-z0-9-]*$/.test(stage.id) || ids.has(stage.id)) throw new Error('work_parcel_stage_id_invalid'); if (typeof stage.name !== 'string' || !stage.name.trim() || typeof stage.job !== 'string' || !Array.isArray(stage.dependsOn ?? []) || (stage.dependsOn ?? []).some(value => typeof value !== 'string') || (stage.parameters !== undefined && (!stage.parameters || typeof stage.parameters !== 'object' || Array.isArray(stage.parameters))) || !Array.isArray(stage.requiredCapabilities ?? []) || (stage.requiredCapabilities ?? []).some(value => typeof value !== 'string') || !Array.isArray(stage.outputs ?? []) || (stage.outputs ?? []).some(value => typeof value !== 'string') || (stage.executor !== undefined && typeof stage.executor !== 'string')) throw new Error('work_parcel_stage_invalid'); if (stage.requestedRoute && (typeof stage.requestedRoute.reason !== 'string' || (stage.requestedRoute.provider !== undefined && typeof stage.requestedRoute.provider !== 'string') || (stage.requestedRoute.accountProfile !== undefined && typeof stage.requestedRoute.accountProfile !== 'string') || (stage.requestedRoute.model !== undefined && typeof stage.requestedRoute.model !== 'string') || (stage.requestedRoute.modelRole !== undefined && typeof stage.requestedRoute.modelRole !== 'string') || (stage.requestedRoute.allowFallback !== undefined && typeof stage.requestedRoute.allowFallback !== 'boolean') || (stage.requestedRoute.purpose !== undefined && !['EXECUTION','QUALIFICATION'].includes(stage.requestedRoute.purpose)) || (stage.requestedRoute.profile !== undefined && !['THIN','STANDARD','DEEP'].includes(stage.requestedRoute.profile)))) throw new Error('work_parcel_route_invalid'); ids.add(stage.id); const job=runtime.catalog.job(stage.job);if (!job) throw new Error(`work_parcel_job_missing:${stage.job}`);if(stage.template){if(!templates)throw Error('agent_template_registry_unconfigured');templates.binding(stage.template,job);} }
  for (const stage of plan.stages) if (stage.requestedRoute) {
    const {cacheContext, cacheScope, cacheScopeByModel} = stage.requestedRoute;
    if (cacheContext && (typeof cacheContext !== 'object' || Array.isArray(cacheContext) || (cacheContext.contextTags !== undefined && (!Array.isArray(cacheContext.contextTags) || cacheContext.contextTags.some(value => typeof value !== 'string'))) || ['taskType','repositoryRef','repositoryIdentitySha256','branchStateSha256','dependencyContextSha256','instructionContextSha256','toolContractSha256','governancePolicySha256','immutableContextSha256','promptPrefixSha256','transportContextSha256'].some(key => cacheContext[key as keyof CacheContextIdentity] !== undefined && cacheContext[key as keyof CacheContextIdentity] !== null && typeof cacheContext[key as keyof CacheContextIdentity] !== 'string'))) throw new Error('work_parcel_cache_context_invalid');
    if (cacheScope && (typeof cacheScope !== 'object' || Array.isArray(cacheScope) || Object.values(cacheScope).some(value => typeof value !== 'string' || !value.trim()))) throw new Error('work_parcel_cache_scope_invalid');
    if (cacheScopeByModel && (typeof cacheScopeByModel !== 'object' || Array.isArray(cacheScopeByModel) || Object.entries(cacheScopeByModel).some(([modelId,scope]) => !modelId.trim() || !scope || typeof scope !== 'object' || Array.isArray(scope) || Object.values(scope).some(value => typeof value !== 'string' || !value.trim())))) throw new Error('work_parcel_cache_scope_invalid');
  }
  for (const stage of plan.stages) for (const dependency of stage.dependsOn ?? []) if (!ids.has(dependency) || dependency === stage.id) throw new Error(`work_parcel_dependency_invalid:${stage.id}:${dependency}`);
  const visiting = new Set<string>(), visited = new Set<string>(), byId = new Map(plan.stages.map(stage => [stage.id, stage]));
  const visit = (id: string) => { if (visiting.has(id)) throw new Error('work_parcel_dependency_cycle'); if (visited.has(id)) return; visiting.add(id); for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency); visiting.delete(id); visited.add(id); }; for (const id of ids) visit(id);
  for (const criterion of plan.successCriteria ?? []) if (!criterion.description?.trim() || criterion.stageId && !ids.has(criterion.stageId)) throw new Error('work_parcel_success_criterion_invalid');
  return structuredClone(plan);
}

export class WorkParcelCoordinator {
  private readonly planning = new Set<string>();
  constructor(readonly runtime: JobRuntime, readonly store: WorkParcelStore, readonly planner: WorkParcelPlanner, readonly efficiency?: HarnessEfficiencyLedgerPort, private readonly models?: ModelRegistry, readonly adaptiveOrchestration?: AdaptiveOrchestrationRuntime, readonly cacheExperts?: CacheAwareExpertRuntime, readonly agentTemplates?:AgentTemplateRegistry) {}
  recordConfigurationProposal(input:{proposalId:string;scanId:string;sha256:string;operationCount:number;actor:string}){
    assertNoSensitiveMaterial(JSON.stringify(input),'work_parcel_credential_material_forbidden');const at=now(),id=`parcel-environment-${input.proposalId}`;const existing=this.store.get(id);if(existing)return existing;
    const objective=`Review and apply ${input.operationCount} explicitly approved environment configuration operation(s) from discovery ${input.scanId}`;
    const context=createParcelContext({goal:objective,actor:input.actor,at});
    const stage:WorkParcelStage={id:'apply-configuration',name:'Apply approved environment configuration',job:'environment-discovery-configuration-apply@1.0.0',dependsOn:[],parameters:{proposalId:input.proposalId},requiredCapabilities:['configuration.manage'],outputs:['configuration-revision'],status:'WAITING',waitingReason:'Explicit approved proposal is awaiting the existing configuration boundary'};
    return this.store.add({id,prompt:objective,objective,actor:input.actor,executionMode:'LIVE',executionOwner:'environment-discovery-runtime',status:'WAITING',planner:{kind:'deterministic',reason:'Environment Discovery generated a governed configuration-change parcel after explicit operator approval'},stages:[stage],context,createdAt:at,updatedAt:at,telemetry:emptyTelemetry(),audit:{schema:'agent-control.work-parcel-audit/v1',recordedAt:at,classification:'Governed configuration change',selectedExecution:'Work Parcel',planningRationale:'Discovery, qualification, recommendation, approval and activation remain separate',planner:{kind:'deterministic',provider:null,model:null},alternatives:[],timeline:[event(at,'task.received','Approved environment configuration proposal recorded',`${input.proposalId}; sha256 ${input.sha256}`),event(at,'plan.selected','Existing configuration mutation boundary selected',`${input.operationCount} operation(s); no secret material retained`)],invocations:[],totals:auditTotals([],at)},decision:{outcome:'IN_PROGRESS',title:'Configuration change awaiting application',summary:'The approved proposal has not altered active configuration.',evidence:[`discovery:${input.scanId}`,`proposal:${input.proposalId}`,`sha256:${input.sha256}`],blockedStages:[],authority:'Agent Control'},provenance:[{at,type:'environment.configuration.proposed',detail:`${input.proposalId}:${input.sha256}`}]});
  }
  recordConfigurationApplied(parcelId:string,evidence:string){const parcel=this.get(parcelId);if(parcel.executionOwner!=='environment-discovery-runtime')throw new Error('environment_discovery_parcel_owner_mismatch');const at=now(),stage=parcel.stages[0]!;stage.status='SUCCEEDED';stage.waitingReason=undefined;stage.startedAt=stage.startedAt??at;stage.endedAt=at;parcel.status='SUCCEEDED';parcel.endedAt=at;parcel.decision={outcome:'COMPLETE',title:'Approved environment configuration applied',summary:'The existing configuration boundary validated and committed the approved proposal.',evidence:[...new Set([...(parcel.decision?.evidence??[]),evidence])],blockedStages:[],authority:'Agent Control'};parcel.audit.timeline.push(event(at,'verification.completed','Configuration revision committed through the governed store',evidence));parcel.provenance.push({at,type:'environment.configuration.applied',detail:evidence});return this.store.update(parcel);}
  submitApprovedPlan(prompt: string, actor: string, requestKey: string, input: WorkParcelPlan, origin?: GovernedRequestOrigin) {
    if(!/^[a-f0-9]{64}$/.test(requestKey))throw new Error('parcel_request_key_invalid');
    assertNoSensitiveMaterial(JSON.stringify({prompt,origin}), 'work_parcel_credential_material_forbidden');
    const id=`parcel-social-${requestKey}`,existing=this.store.get(id);
    if(existing){if(existing.actor!==actor||existing.prompt!==prompt||JSON.stringify(existing.origin??null)!==JSON.stringify(origin??null))throw new Error('parcel_request_identity_mismatch');return this.ensureOrchestration(existing);}
    const plan=validateWorkParcelPlan(input,this.runtime,this.agentTemplates),at=now(),stages=materializeStages(plan.stages),context=contextForPlan(plan,actor,stages,at,prompt);
    const parcel=this.store.add({id,prompt,objective:plan.objective,actor,...(origin?{origin:structuredClone(origin)}:{}),executionMode:'LIVE',executionOwner:'work-parcel-coordinator',status:'QUEUED',planner:plan.planner,stages,context,createdAt:at,updatedAt:at,telemetry:emptyTelemetry(),audit:createDecisionAudit(prompt,plan,this.runtime,at),provenance:[{at,type:'submitted',detail:'Approved social template; durable request identity; existing runtime remains authoritative'}]});
    return this.ensureOrchestration(parcel,plan);
  }
  submitTemplatePlan(prompt:string,actor:string,requestKey:string,input:WorkParcelPlan){
    if(!/^[a-f0-9]{64}$/.test(requestKey))throw Error('parcel_request_key_invalid');
    assertNoSensitiveMaterial(prompt,'work_parcel_credential_material_forbidden');
    const id=`parcel-template-${requestKey}`,existing=this.store.get(id);
    if(existing){if(existing.actor!==actor||existing.prompt!==prompt)throw Error('parcel_request_identity_mismatch');return this.ensureOrchestration(existing);}
    const plan=validateWorkParcelPlan(input,this.runtime,this.agentTemplates);if(plan.stages.some(stage=>!stage.template))throw Error('agent_template_selection_required');
    const at=now(),stages=materializeStages(plan.stages),context=contextForPlan(plan,actor,stages,at,prompt),parcel=this.store.add({id,prompt,objective:plan.objective,actor,executionMode:'LIVE',executionOwner:'work-parcel-coordinator',status:'QUEUED',planner:plan.planner,stages,context,createdAt:at,updatedAt:at,telemetry:emptyTelemetry(),audit:createDecisionAudit(prompt,plan,this.runtime,at),provenance:[{at,type:'agent-template.submitted',detail:'Digest-bound Agent Template and registered Job submitted through the existing governed runtime'}]});
    return this.ensureOrchestration(parcel,plan);
  }
  submitNativePlan(prompt:string,actor:string,requestKey:string,input:WorkParcelPlan){
    if(!/^[a-f0-9]{64}$/.test(requestKey))throw Error('parcel_request_key_invalid');
    assertNoSensitiveMaterial(prompt,'work_parcel_credential_material_forbidden');
    const id=`parcel-native-${requestKey}`,existing=this.store.get(id);
    if(existing){if(existing.actor!==actor||existing.prompt!==prompt)throw Error('parcel_request_identity_mismatch');return this.ensureOrchestration(existing);}
    const plan=validateWorkParcelPlan(input,this.runtime,this.agentTemplates),at=now(),stages=materializeStages(plan.stages),context=contextForPlan(plan,actor,stages,at,prompt),parcel=this.store.add({id,prompt,objective:plan.objective,actor,executionMode:'LIVE',executionOwner:'work-parcel-coordinator',status:'QUEUED',planner:plan.planner,stages,context,createdAt:at,updatedAt:at,telemetry:emptyTelemetry(),audit:createDecisionAudit(prompt,plan,this.runtime,at),provenance:[{at,type:'native-plan.submitted',detail:'Deterministic registered-Job plan submitted through the governed Work Parcel runtime'}]});
    return this.ensureOrchestration(parcel,plan);
  }
  async submit(prompt: string, actor: string, attribution?: WorkAttribution) {
    assertNoSensitiveMaterial(prompt, 'work_parcel_credential_material_forbidden');
    const plan = validateWorkParcelPlan(await this.planner.plan(prompt), this.runtime,this.agentTemplates), at = now(), stages = materializeStages(plan.stages), context = contextForPlan(plan, actor, stages, at, prompt);
    const parcel = this.store.add({id: `parcel-${randomUUID()}`, prompt, objective: plan.objective, actor, ...(attribution ? {attribution: structuredClone(attribution)} : {}), executionMode: 'LIVE', executionOwner: 'work-parcel-coordinator', status: 'QUEUED', planner: plan.planner, stages, context, createdAt: at, updatedAt: at, telemetry: emptyTelemetry(), audit: createDecisionAudit(prompt, plan, this.runtime, at), provenance: [{at, type: 'submitted', detail: `Natural-language request accepted; planner=${plan.planner.kind}`} ]});
    return this.ensureOrchestration(parcel, plan);
  }
  accept(prompt: string, actor: string, systems: SystemReadiness[] = [], attribution?: WorkAttribution, origin?: GovernedRequestOrigin) {
    if (!prompt.trim()) throw new Error('work_parcel_prompt_required');
    assertNoSensitiveMaterial(JSON.stringify({prompt,origin}), 'work_parcel_credential_material_forbidden');
    const at = now(), id = `parcel-${randomUUID()}`, target = systems.find(system => new RegExp(`\\b${escapeRegExp(system.id)}\\b`, 'i').test(prompt) || new RegExp(`\\b${escapeRegExp(system.name)}\\b`, 'i').test(prompt));
    const timeline: WorkParcelAuditEvent[] = [event(at, 'task.received', 'Natural-language task accepted', 'Verbatim prompt retained before planning'), event(at, 'task.classified', 'Task queued for governed planning', 'Registered Job selection remains authoritative')];
    if (target) timeline.push(event(at, 'target.resolving', `Resolving target: ${target.name}`, target.id), event(at, 'target.found', 'Target found', `${target.type}:${target.id}`), event(at, 'readiness.checked', `Execution state: ${target.execution}`, `Reachability: ${target.reachable}; Authentication: ${target.authentication}; Capabilities: ${target.capabilities.join(', ') || 'none reported'}`));
    timeline.push(event(at, 'planning.started', 'Selecting registered Job', 'Planner may only select Jobs present in the canonical catalog'));
    const blocked = target && ['AUTH REQUIRED','OFFLINE','DEGRADED','UNKNOWN'].includes(target.execution) ? `BLOCKED — ${target.name} ${target.blockingReason ?? target.execution.toLowerCase()}` : null;
    const parcel = this.store.add({id, prompt, objective: prompt, actor, ...(origin ? {origin: structuredClone(origin)} : {}), ...(attribution ? {attribution: {...structuredClone(attribution), parcelId: id}} : {}), executionMode: 'LIVE', executionOwner: 'work-parcel-coordinator', status: blocked ? 'FAILED' : 'PLANNING', planner: {kind: 'deterministic', reason: blocked ?? 'Planning pending'}, stages: [], context: createParcelContext({goal: prompt, actor, at}), createdAt: at, updatedAt: at, ...(blocked ? {endedAt: at} : {}), telemetry: emptyTelemetry(), audit: planningAudit(at, timeline, blocked), provenance: [{at, type: 'submitted', detail: 'Natural-language request durably accepted before planning'}, ...(blocked ? [{at, type: 'readiness.blocked', detail: blocked}] : [])]});
    this.ensureOrchestration(parcel);
    if (!blocked) this.startPlanning(parcel.id);
    return this.store.get(parcel.id)!;
  }
  get(id: string) { let value = this.store.get(id); if (!value) throw new Error('work_parcel_missing'); if (this.captureLiveRoutes(value)) value = this.store.update(value); return this.withTelemetry(value); }
  list() { return this.store.list().map(value => { if (this.captureLiveRoutes(value)) value = this.store.update(value); return this.withTelemetry(value); }); }
  askQuestion(id: string, input: {text: string; originatingStageId?: string; dependentStageIds: string[]; priority?: ParcelQuestion['priority']; consequence?: ParcelQuestion['consequence']; actor: string}) {
    const parcel = this.get(id), context = mustParcelContext(parcel); for (const stageId of input.dependentStageIds) { const stage = parcel.stages.find(item => item.id === stageId); if (!stage) throw new Error(`parcel_question_dependency_missing:${stageId}`); if (['RUNNING','SUCCEEDED','FAILED','CANCELLED'].includes(stage.status)) throw new Error(`parcel_question_dependency_already_started:${stageId}`); }
    if (input.originatingStageId && !parcel.stages.some(item => item.id === input.originatingStageId)) throw new Error('parcel_question_origin_missing'); const question = addParcelQuestion(context, input);
    for (const stage of parcel.stages.filter(item => question.dependentStageIds.includes(item.id))) { stage.waitingQuestionIds = [...new Set([...(stage.waitingQuestionIds ?? []), question.id])]; stage.status = 'WAITING'; stage.waitingReason = `Waiting for answer to ${question.id}`; }
    appendAudit(parcel, {at: question.createdAt, type: 'question.created', stageId: question.originatingStageId, summary: 'Non-blocking operator question recorded', detail: `${question.id}; dependent stages ${question.dependentStageIds.join(', ') || 'none'}`}); parcel.provenance.push({at: question.createdAt, type: 'question.created', detail: question.id}); return this.store.update(this.reconcile(parcel));
  }
  answerQuestion(id: string, questionId: string, answer: string, actor: string) {
    const parcel = this.get(id), question = answerParcelQuestion(mustParcelContext(parcel), questionId, answer, actor);
    for (const stage of parcel.stages.filter(item => question.dependentStageIds.includes(item.id))) { stage.waitingQuestionIds = (stage.waitingQuestionIds ?? []).filter(value => value !== questionId); if (!stage.waitingQuestionIds.length && stage.status === 'WAITING') { stage.status = 'QUEUED'; stage.waitingReason = undefined; } }
    appendAudit(parcel, {at: question.answeredAt!, type: 'question.answered', stageId: question.originatingStageId, summary: 'Operator answer recorded', detail: `${question.id}; dependent stages eligible to resume`}); parcel.provenance.push({at: question.answeredAt!, type: 'question.answered', detail: question.id}); return this.store.update(this.reconcile(parcel));
  }
  withdrawQuestion(id: string, questionId: string, actor: string) { const parcel = this.get(id), question = withdrawParcelQuestion(mustParcelContext(parcel), questionId, actor); for (const stage of parcel.stages.filter(item => question.dependentStageIds.includes(item.id))) { stage.waitingQuestionIds = (stage.waitingQuestionIds ?? []).filter(value => value !== questionId); if (!stage.waitingQuestionIds.length && stage.status === 'WAITING') { stage.status = 'QUEUED'; stage.waitingReason = undefined; } } return this.store.update(this.reconcile(parcel)); }
  steer(id: string, input: {instruction: string; constraints?: string[]; affectedStageIds?: string[]; supersedes?: string[]; actor: string}) { const parcel = this.get(id); for (const stageId of input.affectedStageIds ?? []) if (!parcel.stages.some(stage => stage.id === stageId)) throw new Error(`parcel_steering_stage_missing:${stageId}`); const amendment = addSteeringAmendment(mustParcelContext(parcel), input); appendAudit(parcel, {at: amendment.createdAt, type: 'steering.accepted', summary: 'User steering amendment accepted', detail: `${amendment.id}; original goal retained; affected ${amendment.affectedStageIds.join(', ') || 'all remaining stages'}`}); parcel.provenance.push({at: amendment.createdAt, type: 'steering.accepted', detail: amendment.id}); return this.store.update(parcel); }
  addCriterion(id: string, input: {kind: ParcelSuccessCriterion['kind']; description: string; source: ParcelSuccessCriterion['source']; sourceActor: string; stageId?: string; requiredEvidence?: string[]}) { const parcel = this.get(id); if (input.stageId && !parcel.stages.some(stage => stage.id === input.stageId)) throw new Error('parcel_success_criterion_stage_missing'); const criterion = addSuccessCriterion(mustParcelContext(parcel), input); return {parcel: this.store.update(parcel), criterion}; }
  evaluateCriterion(id: string, criterionId: string, input: {status: 'PASS' | 'FAIL'; evidence: string[]; detail?: string; actor: string}) { const parcel = this.get(id), criterion = evaluateSuccessCriterion(mustParcelContext(parcel), criterionId, input); appendAudit(parcel, {at: criterion.evaluatedAt!, type: 'criterion.evaluated', stageId: criterion.stageId, summary: criterion.description, detail: `${criterion.status}; evidence ${criterion.evidence.join(', ') || 'none'}`}); return this.store.update(this.reconcile(parcel)); }
  retrieveContext(id: string, input: {query: string; limit?: number; types?: ParcelContextEventType[]; stageIds?: string[]; actor?: string}) { const parcel = this.get(id), results = retrieveParcelContext(mustParcelContext(parcel), input); appendAudit(parcel, {at: now(), type: 'context.retrieved', summary: 'Governed parcel-history retrieval completed', detail: `${results.length} event(s); ${results.map(item => item.id).join(', ')}`}); this.store.update(parcel); return results; }
  cancel(id: string, actor: string) { const parcel = this.get(id); for (const stage of parcel.stages) if (stage.runId && !['SUCCEEDED','FAILED','CANCELLED'].includes(stage.status)) this.runtime.cancel(stage.runId, `parcel_cancelled_by:${actor}`); for (const stage of parcel.stages) if (!['SUCCEEDED','FAILED'].includes(stage.status)) stage.status = 'CANCELLED'; parcel.status = 'CANCELLED'; parcel.endedAt = now(); parcel.provenance.push({at: now(), type: 'cancelled', detail: actor}); return this.store.update(parcel); }
  async tick() {
    for (const stored of this.store.list().filter(parcel => (!parcel.executionOwner || parcel.executionOwner === 'work-parcel-coordinator') && ['PLANNING','QUEUED','RUNNING','WAITING'].includes(parcel.status)).reverse()) {
      if (stored.status === 'PLANNING') { this.startPlanning(stored.id); return this.get(stored.id); }
      const before = JSON.stringify({status: stored.status, stages: stored.stages.map(stage => [stage.status, stage.runId, stage.waitingReason, stage.error])}), parcel = this.reconcile(stored); if (['SUCCEEDED','FAILED','CANCELLED'].includes(parcel.status)) { this.store.update(parcel); return this.get(parcel.id); }
      const activeCount = parcel.stages.filter(stage => stage.status === 'RUNNING').length, dispatchBudget = Math.max(0, this.runtime.schedulerConcurrencyLimit() - activeCount), readyStages = parcel.stages.filter(stage => stage.status === 'QUEUED' && !(stage.waitingQuestionIds?.length) && stage.dependsOn.every(id => parcel.stages.find(item => item.id === id)?.status === 'SUCCEEDED')).slice(0, dispatchBudget);
      if (readyStages.length) {
        for (const ready of readyStages) try {
          const routeRequest = ready.requestedRoute, context = mustParcelContext(parcel), dependencies = parcel.stages.filter(stage => ready.dependsOn.includes(stage.id)), artifactIds = dependencies.flatMap(stage => stage.baton?.artifactIds ?? []), outputTypes = dependencies.flatMap(stage => stage.baton?.outputTypes ?? []), selectedEventIds = context.events.filter(item => ready.dependsOn.includes(item.stageId ?? '') || ['steering.accepted','question.answered','stage.failed','recovery.recorded'].includes(item.type)).map(item => item.id);
          const baton = createBatonView(context, {sourceStageIds: ready.dependsOn, targetStageId: ready.id, nextAction: `Execute ${ready.name} through ${ready.job} and satisfy its declared verification boundary`, artifactIds, outputTypes, selectedEventIds});
          ready.baton = baton; appendAudit(parcel, {at: baton.createdAt, type: 'baton.created', stageId: ready.id, summary: 'Bounded operational baton view sealed', detail: `${baton.id}; sha256 ${baton.sha256}; ${baton.sizeBytes} bytes; full history remains in parcel ledger`});
          let modelRoute;
          if (routeRequest?.model || routeRequest?.modelRole) {
            if (!this.models) throw new Error('model_registry_unconfigured');
            const definition = this.runtime.catalog.job(ready.job); if (!definition) throw new Error('job_missing');
            const first = definition.spec.steps.find(step => !(step.dependsOn?.length)) ?? definition.spec.steps[0];
            const worker = first ? this.runtime.workers.resolve(first.requires).worker : undefined;
            if (!worker) throw new Error('model_route_worker_unavailable');
            const required = [...new Set([...ready.requiredCapabilities, ...(routeRequest.modelRole ? this.models.routes().roles[routeRequest.modelRole]?.requires ?? [] : [])])];
            let candidates = this.modelCandidates(routeRequest, worker.id, required);
            const cacheDecision = this.cacheExperts ? this.cacheExperts.assess({parcelId: parcel.id, stageId: ready.id, context: routeRequest.cacheContext ?? derivedCacheContext(parcel, ready), candidates: candidates.map((candidate, index) => { const worker=this.runtime.workers.list().find(item=>item.id===candidate.route.nodeId); return {route: cacheRoute(candidate.route, cacheScopeFor(routeRequest,candidate.route.modelId)), eligible: candidate.eligible, capabilityQualified: candidate.eligible && required.every(capability => candidate.capabilities?.includes(capability)), integrityQualified: !['BLOCKED','ESCALATED'].includes(parcel.transportIntegrity?.state ?? 'COMPLETE'), health: candidate.availability === 'unavailable' ? 'offline' : candidate.availability === 'unknown' ? 'unknown' : 'healthy', baseScore: Math.max(0, 1 - index * .05), currentLoadRatio: worker && worker.capacity > 0 ? worker.active / worker.capacity : null, reasons: [...candidate.reasons]};})}) : undefined;
            if (cacheDecision) {
              ready.cacheExpertDecisionId = cacheDecision.id;
              const preferred = cacheDecision.selectedRoute;
              candidates = candidates.map(candidate => { const assessment = cacheDecision.candidates.find(item => sameCacheRoute(item.route, cacheRoute(candidate.route, cacheScopeFor(routeRequest,candidate.route.modelId)))); return {...candidate, reasons: [...candidate.reasons, ...(assessment?.cacheScore ? [`warm-expert:${assessment.state}/${assessment.compatibility}:${assessment.cacheScore.toFixed(4)}`] : [])]}; }).sort((left, right) => Number(preferred ? !sameCacheRoute(cacheRoute(left.route, cacheScopeFor(routeRequest,left.route.modelId)), preferred) : false) - Number(preferred ? !sameCacheRoute(cacheRoute(right.route, cacheScopeFor(routeRequest,right.route.modelId)), preferred) : false) || (left.declaredOrder ?? 0) - (right.declaredOrder ?? 0)).map((candidate, index) => ({...candidate, declaredOrder: index}));
              appendAudit(parcel, {at: cacheDecision.createdAt, type: 'cache.experts_assessed', stageId: ready.id, summary: 'Warm Expert candidates assessed', detail: cacheDecision.candidates.map(item => `${item.route.providerId}/${item.route.modelId} ${item.state}/${item.compatibility} cache=${item.cacheScore.toFixed(4)} authority=${item.evidenceAuthority}`).join('; ')});
            }
            const adaptive = this.adaptiveOrchestration && parcel.audit.orchestrationDecisionId
              ? this.adaptiveOrchestration.evaluateDecision(parcel.audit.orchestrationDecisionId, {stageId: ready.id, candidates, workflowCandidates: [{id: 'work-parcel-coordinator', version: '1', eligible: true, reasons: []}]})
              : undefined;
            const selectedRoute = adaptive?.selectedRoute?.route, selectedModel = selectedRoute?.modelId;
            const cacheSelected = !selectedRoute ? cacheDecision?.selectedRoute : undefined, selected = selectedRoute ?? (cacheSelected ? {providerId: cacheSelected.providerId, modelId: cacheSelected.modelId, accountProfileId: cacheSelected.accountProfileId, nodeId: cacheSelected.nodeId} : undefined);
            modelRoute = this.models.route({model: selected?.modelId ?? routeRequest.model, modelRole: selected?.modelId ? undefined : routeRequest.modelRole, accountProfile: selected?.accountProfileId ?? routeRequest.accountProfile, nodeId: selected?.nodeId ?? worker.id, requiredCapabilities: required, allowFallback: selected?.modelId ? false : routeRequest.allowFallback, purpose: routeRequest.purpose});
            if (cacheDecision && this.cacheExperts) {
              const finalRoute = cacheRoute({providerId: modelRoute.providerId, modelId: modelRoute.modelId, accountProfileId: modelRoute.accountProfileId, nodeId: modelRoute.nodeId}, cacheScopeFor(routeRequest,modelRoute.modelId));
              const confirmed = this.cacheExperts.confirmSelection(cacheDecision.id, finalRoute, selectedRoute ? 'Adaptive quality/cost/capability policy selected the final governed route' : 'Warm Expert preference applied within qualified policy order');
              appendAudit(parcel, {at: now(), type: 'cache.expert_selected', stageId: ready.id, summary: confirmed.selectedExpertId ? 'Warm Expert route selected' : 'Governed route selected without warm affinity', detail: confirmed.reason});
            }
            ready.actualRoute = {workers: [worker.id], workloadNodeId: modelRoute.workloadNodeId, providerExecutionNodeId: modelRoute.providerExecutionNodeId, credentialNodeId: modelRoute.credentialNodeId ?? undefined, provider: modelRoute.providerId, accountProfile: modelRoute.accountProfileId ?? undefined, accountLabel: modelRoute.accountLabel ?? undefined, accountPlan: modelRoute.accountPlan ?? undefined, accountPlanAuthority: modelRoute.accountPlanAuthority ?? undefined, accountQualification: modelRoute.accountQualification ?? undefined, accountAvailability: modelRoute.accountAvailability ?? undefined, model: modelRoute.modelId, profile: routeRequest.profile, reason: modelRoute.fallback ? `Qualified fallback selected: ${modelRoute.fallbackReason}` : `Qualified ${modelRoute.requestedRole ? `role ${modelRoute.requestedRole}` : `model ${modelRoute.modelId}`} selected`};
            appendParcelContextEvent(context, {type: 'route.selected', stageId: ready.id, summary: `${modelRoute.providerId}/${modelRoute.accountProfileId ?? 'default'}/${modelRoute.modelId}@${modelRoute.providerExecutionNodeId}`, detail: {qualificationVersion: modelRoute.qualificationVersion, fallback: modelRoute.fallback, fallbackReason: modelRoute.fallbackReason, requiredCapabilities: ready.requiredCapabilities, cacheExpertDecisionId: ready.cacheExpertDecisionId ?? null}, tags: ['route'], evidence: []});
          } else if (this.adaptiveOrchestration && parcel.audit.orchestrationDecisionId) {
            this.adaptiveOrchestration.evaluateDecision(parcel.audit.orchestrationDecisionId, {stageId: ready.id, workflowCandidates: [{id: 'work-parcel-coordinator', version: '1', eligible: true, reasons: []}]});
          }
          const job=this.runtime.catalog.job(ready.job)!,templateBinding=ready.template?this.agentTemplates!.binding(ready.template,job):undefined;
          const parcelContext = {schema: 'agent-control.run-parcel-context/v1' as const, parcelId: parcel.id, stageId: ready.id, originalGoal: context.active.originalGoal, currentInterpretation: context.active.currentInterpretation, effectiveInstructions: [...(templateBinding?[templateBinding.portableInstructions,...(templateBinding.providerAdaptation?[templateBinding.providerAdaptation.instructions]:[])]:[]),...context.active.effectiveInstructions], constraints: [...context.active.constraints], successCriteria: context.criteria.map(item => ({id: item.id, description: item.description, status: item.status})), baton};
          const run = this.runtime.createRun(ready.job, ready.parameters, {type: 'manual', actor: `work-parcel:${parcel.id}`, ...(templateBinding?{templateBinding}:{}), ...(modelRoute ? {modelRoute} : {}), parcelContext}, undefined, parcel.id.startsWith('parcel-social-') ? `${parcel.id}:${ready.id}` : undefined); ready.runId = run.id; ready.status = 'RUNNING'; ready.startedAt = now(); ready.executor = ready.executor ?? run.trigger.modelRoute?.modelId ?? 'agent-control-job-runtime'; parcel.status = 'RUNNING'; parcel.provenance.push({at: ready.startedAt, type: 'stage.started', detail: `${ready.id}:${run.id}`},...(templateBinding?[{at:ready.startedAt,type:'agent-template.bound',detail:`${templateBinding.id}@${templateBinding.version}:${templateBinding.digest}`}]:[])); appendParcelContextEvent(context, {at: ready.startedAt, type: 'stage.started', stageId: ready.id, summary: `${ready.name} dispatched`, detail: {runId: run.id, job: ready.job, executor: ready.executor,template:templateBinding?`${templateBinding.id}@${templateBinding.version}`:null}, tags: ['stage'], evidence: [baton.sha256,...(templateBinding?[templateBinding.digest]:[])]}); appendAudit(parcel, {at: ready.startedAt, type: 'stage.dispatched', stageId: ready.id, summary: `${ready.name} dispatched`, detail: `Job ${ready.job}; Run ${run.id}${templateBinding?`; template ${templateBinding.id}@${templateBinding.version} sha256 ${templateBinding.digest}`:''}; requested route ${routeRequestLabel(ready)}${modelRoute ? `; resolved ${modelRoute.providerId}/${modelRoute.modelId} on ${modelRoute.nodeId}; qualification ${modelRoute.qualificationVersion}` : ''}`});
        }
        catch (error) { const detail = error instanceof Error ? error.message : String(error); ready.status = 'FAILED'; ready.error = `dispatch_failed:${detail}`; ready.endedAt = now(); parcel.provenance.push({at: ready.endedAt, type: 'stage.dispatch_failed', detail: `${ready.id}:${detail}`}); appendParcelContextEvent(mustParcelContext(parcel), {at: ready.endedAt, type: 'stage.failed', stageId: ready.id, summary: `${ready.name} failed before dispatch`, detail: {reason: detail}, tags: ['stage','failure'], evidence: []}); appendAudit(parcel, {at: ready.endedAt, type: 'stage.failed', stageId: ready.id, summary: `${ready.name} failed before dispatch`, detail}); }
        this.store.update(this.reconcile(parcel)); return this.get(parcel.id);
      }
      this.store.update(parcel); if (before !== JSON.stringify({status: parcel.status, stages: parcel.stages.map(stage => [stage.status, stage.runId, stage.waitingReason, stage.error])})) return this.get(parcel.id);
    }
    return undefined;
  }
  private ensureOrchestration(parcel: WorkParcel, plan?: WorkParcelPlan) {
    if (!this.adaptiveOrchestration) return parcel;
    const objective = plan?.objective ?? parcel.objective, taskClass = classifyTask(objective, plan?.stages ?? parcel.stages), requiredCapabilities = this.requiredModelCapabilities(plan?.stages ?? parcel.stages);
    if (parcel.audit.orchestrationDecisionId) this.adaptiveOrchestration.updateRequest(parcel.audit.orchestrationDecisionId, {objective, taskClass, requiredCapabilities, workflowId: 'work-parcel-coordinator'});
    else {
      const decision = this.adaptiveOrchestration.startDecision({parcelId: parcel.id, objective, taskClass, requiredCapabilities, workflowId: 'work-parcel-coordinator'});
      parcel.audit.orchestrationDecisionId = decision.id;
      this.store.update(parcel);
    }
    return this.store.get(parcel.id)!;
  }
  private modelCandidates(routeRequest: NonNullable<WorkParcelPlanStage['requestedRoute']>, nodeId: string, requiredCapabilities: string[]): AdaptiveRouteCandidate[] {
    if (!this.models) return [];
    const rows = this.models.list().filter(row => routeRequest.model ? row.id === routeRequest.model : routeRequest.modelRole ? row.assignedRoles.includes(routeRequest.modelRole) : false);
    return rows.map((row, index) => {
      const fallbackRoute = {providerId: row.provider, modelId: row.id, accountProfileId: row.account?.id ?? null, nodeId: row.account?.nodeId ?? row.qualification.nodes[0] ?? row.nodes?.[0] ?? nodeId, modelVersion: row.qualification.version};
      try {
        const route = this.models!.route({model: row.id, modelRole: routeRequest.modelRole, accountProfile: routeRequest.accountProfile, nodeId, requiredCapabilities, allowFallback: false});
        return {route: {...route, modelVersion: route.qualificationVersion}, eligible: true, reasons: [], capabilities: [...row.qualification.capabilities], latencyMs: row.qualification.latencyMs ?? null, availability: row.account && row.account.availability !== 'AVAILABLE' ? 'unavailable' : 'available', costAuthority: 'unavailable' as const, estimatedCost: null, declaredOrder: index};
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return {route: fallbackRoute, eligible: false, reasons: [detail], capabilities: [...row.qualification.capabilities], latencyMs: row.qualification.latencyMs ?? null, availability: row.account && row.account.availability !== 'AVAILABLE' ? 'unavailable' : 'unknown', costAuthority: 'unavailable' as const, estimatedCost: null, declaredOrder: index};
      }
    });
  }
  private requiredModelCapabilities(stages: Array<WorkParcelPlanStage | WorkParcelStage>) {
    const capabilities = new Set<string>();
    for (const stage of stages) {
      const route = stage.requestedRoute;
      if (!route) continue;
      if (route.modelRole) for (const capability of this.models?.routes().roles[route.modelRole]?.requires ?? []) capabilities.add(capability);
    }
    return [...capabilities];
  }
  private startPlanning(id: string) { if (this.planning.has(id)) return; this.planning.add(id); void this.completePlanning(id).finally(() => this.planning.delete(id)); }
  private async completePlanning(id: string) {
    const pending = this.store.get(id); if (!pending || pending.status !== 'PLANNING') return;
    try {
      const plan = validateWorkParcelPlan(await this.planner.plan(pending.prompt), this.runtime,this.agentTemplates), decided = createDecisionAudit(pending.prompt, plan, this.runtime, now());
      const orchestrationDecisionId = pending.audit.orchestrationDecisionId;
      pending.objective = plan.objective; pending.planner = plan.planner; pending.stages = materializeStages(plan.stages); const context = mustParcelContext(pending); context.active.currentInterpretation = plan.objective; context.active.constraints = [...new Set(plan.constraints ?? [])]; updateParcelActiveState(context, {plan: pending.stages}); appendParcelContextEvent(context, {type: 'plan.recorded', summary: `${pending.stages.length} governed stage(s) recorded`, detail: {stageIds: pending.stages.map(stage => stage.id), planner: plan.planner.kind, interpretation: plan.objective}, tags: ['plan'], evidence: []}); for (const criterion of plan.successCriteria ?? []) addSuccessCriterion(context, {id: criterion.id, kind: criterion.kind, description: criterion.description, source: criterion.source ?? 'INFERRED', sourceActor: plan.planner.kind === 'reasoning-model' ? `${plan.planner.provider ?? 'provider'}/${plan.planner.model ?? 'model'}` : 'agent-control-planner', stageId: criterion.stageId, requiredEvidence: criterion.requiredEvidence}); inferStageCriteria(context, pending.stages); pending.status = 'QUEUED'; pending.audit = {...decided, ...(orchestrationDecisionId ? {orchestrationDecisionId} : {}), timeline: [...pending.audit.timeline, ...decided.timeline.filter(item => !['task.received','task.classified'].includes(item.type))]}; this.ensureOrchestration(pending, plan); pending.provenance.push({at: now(), type: 'planned', detail: `Registered stages selected; planner=${plan.planner.kind}`}); this.store.update(pending);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error); pending.status = 'FAILED'; pending.endedAt = now(); pending.provenance.push({at: pending.endedAt, type: 'planning.failed', detail}); pending.audit.timeline.push(event(pending.endedAt, 'planning.failed', 'Planning failed closed', detail)); this.store.update(pending);
    }
  }
  private reconcile(parcel: WorkParcel) {
    const context = mustParcelContext(parcel);
    for (const stage of parcel.stages) if (stage.runId && !['SUCCEEDED','FAILED','CANCELLED'].includes(stage.status)) {
      const previousStatus = stage.status;
      const run = this.runtime.ledger.get(stage.runId); if (!run) { stage.status = 'FAILED'; stage.error = 'run_missing_after_restart'; continue; }
      stage.status = run.status === 'SUCCEEDED' ? 'SUCCEEDED' : failedRun.has(run.status) ? 'FAILED' : run.status === 'WAITING' ? 'WAITING' : 'RUNNING';
      stage.waitingReason = run.steps.find(step => step.waitingReason)?.waitingReason; stage.error = run.errors.at(-1) ?? run.steps.find(step => step.error)?.error;
      const resolvedRoute = routeFor(run, this.invocations(run.id)), previousRoute = actualRouteLabel(stage);
      if (resolvedRoute.workers.length || resolvedRoute.provider || resolvedRoute.model) {
        stage.actualRoute = {...stage.actualRoute, ...resolvedRoute, profile: resolvedRoute.profile ?? stage.actualRoute?.profile};
        const detail = actualRouteLabel(stage);
        if (detail !== previousRoute && !parcel.audit.timeline.some(event => event.type === 'route.resolved' && event.stageId === stage.id && event.detail === detail)) appendAudit(parcel, {at: now(), type: 'route.resolved', stageId: stage.id, summary: `${stage.name} actual route recorded`, detail});
      }
      if (terminalRun.has(run.status)) {
        stage.endedAt = run.endedAt ?? now();
        if (stage.status === 'SUCCEEDED' && previousStatus !== 'SUCCEEDED') {
          const cacheDecision = stage.cacheExpertDecisionId ? this.cacheExperts?.decision(stage.cacheExpertDecisionId) : undefined;
          stage.baton = {...createBatonView(context, {sourceStageIds: [stage.id], nextAction: `Continue with stages depending on ${stage.name}`, artifactIds: [...run.artifacts], outputTypes: run.artifacts.map(id => this.runtime.artifacts.get(id)?.type ?? 'unknown'), selectedEventIds: context.events.filter(item => item.stageId === stage.id || item.type === 'steering.accepted').map(item => item.id)}), ...(stage.cacheExpertDecisionId ? {cacheExpertDecisionId: stage.cacheExpertDecisionId} : {}), ...(cacheDecision?.selectedExpertId ? {cacheExpertId: cacheDecision.selectedExpertId} : {})};
          appendParcelContextEvent(context, {at: stage.endedAt, type: 'stage.completed', stageId: stage.id, summary: `${stage.name} completed through verification`, detail: {runId: run.id, artifactIds: run.artifacts, batonId: stage.baton.id}, tags: ['stage','verified'], evidence: [stage.baton.sha256, ...run.artifacts]});
          const inferred = context.criteria.find(item => item.kind === 'STAGE_VERIFIED' && item.stageId === stage.id && item.status === 'PENDING'); if (inferred) evaluateSuccessCriterion(context, inferred.id, {status: 'PASS', evidence: [`stage:${stage.id}:verified`, ...run.artifacts], actor: 'agent-control-verifier', at: stage.endedAt});
        } else if (stage.status === 'FAILED' && previousStatus !== 'FAILED') appendParcelContextEvent(context, {at: stage.endedAt, type: 'stage.failed', stageId: stage.id, summary: `${stage.name} failed`, detail: {runId: run.id, reason: stage.error ?? 'unclassified'}, tags: ['stage','failure'], evidence: []});
        if (previousStatus !== stage.status) this.recordAdaptiveOutcome(parcel, stage, run);
      }
    }
    for (const stage of parcel.stages.filter(item => item.status === 'SUCCEEDED')) {
      const inferred = context.criteria.find(item => item.kind === 'STAGE_VERIFIED' && item.stageId === stage.id && item.status === 'PENDING');
      if (inferred) evaluateSuccessCriterion(context, inferred.id, {status: 'PASS', evidence: [`stage:${stage.id}:verified`, ...(stage.baton?.artifactIds ?? [])], actor: 'agent-control-verifier', at: stage.endedAt ?? now()});
    }
    const failed = parcel.stages.filter(stage => stage.status === 'FAILED');
    if (failed.length) for (const stage of parcel.stages.filter(stage => stage.status === 'QUEUED' && stage.dependsOn.some(id => failed.some(item => item.id === id)))) { stage.status = 'BLOCKED'; stage.waitingReason = `Upstream gate failed: ${stage.dependsOn.filter(id => failed.some(item => item.id === id)).join(', ')}`; }
    let propagated = true; while (propagated) { propagated = false; for (const stage of parcel.stages.filter(stage => stage.status === 'QUEUED' && stage.dependsOn.some(id => parcel.stages.find(item => item.id === id)?.status === 'BLOCKED'))) { stage.status = 'BLOCKED'; stage.waitingReason = 'Blocked by downstream dependency chain'; propagated = true; } }
    const failedCriteria = context.criteria.filter(item => item.status === 'FAIL');
    if (failedCriteria.length) { parcel.status = 'FAILED'; parcel.endedAt ??= now(); parcel.provenance.push(...failedCriteria.filter(item => !parcel.provenance.some(event => event.type === 'criterion.failed' && event.detail === item.id)).map(item => ({at: item.evaluatedAt ?? now(), type: 'criterion.failed', detail: item.id}))); }
    else if (parcel.stages.every(stage => stage.status === 'SUCCEEDED') && allSuccessCriteriaPass(context)) { parcel.status = 'SUCCEEDED'; parcel.endedAt ??= now(); if(!parcel.audit.timeline.some(item=>item.type==='verification.completed')){appendAudit(parcel,{at:parcel.endedAt,type:'verification.completed',summary:'All declared verification criteria passed',detail:`${context.criteria.length} criterion/criteria passed through the normal Work Parcel boundary`});appendParcelContextEvent(context,{at:parcel.endedAt,type:'verification.result',summary:'Work Parcel verification complete',detail:{status:'PASS',criteria:context.criteria.map(item=>item.id)},tags:['verification','pass'],evidence:context.criteria.flatMap(item=>item.evidence)});} }
    else if (parcel.stages.every(stage => stage.status === 'SUCCEEDED')) { parcel.status = 'WAITING'; parcel.endedAt = undefined; }
    else if (parcel.stages.every(stage => ['SUCCEEDED','FAILED','BLOCKED','CANCELLED'].includes(stage.status)) && failed.length) { parcel.status = 'FAILED'; parcel.endedAt = now(); }
    else parcel.status = parcel.stages.some(stage => stage.status === 'RUNNING') ? 'RUNNING' : parcel.stages.some(stage => stage.status === 'WAITING') ? 'WAITING' : 'QUEUED';
    const activeStages = parcel.stages.filter(stage => ['RUNNING','WAITING'].includes(stage.status)), route = activeStages.find(stage => stage.actualRoute)?.actualRoute; updateParcelActiveState(context, {plan: parcel.stages, currentStageIds: activeStages.map(stage => stage.id), route: route ? actualRouteLabel(activeStages.find(stage => stage.actualRoute)!) : undefined, model: route?.model, node: route?.providerExecutionNodeId ?? route?.workers[0]});
    parcel.telemetry = this.telemetry(parcel); this.syncAudit(parcel); return parcel;
  }
  private invocations(runId: string) { return (this.efficiency?.list() ?? []).filter(item => item.runId === runId); }
  private recordAdaptiveOutcome(parcel: WorkParcel, stage: WorkParcelStage, run: RunRecord) {
    if (!this.adaptiveOrchestration || !parcel.audit.orchestrationDecisionId) return;
    const records = this.invocations(run.id), outcome = adaptiveOutcome(run.status), failureClass = run.status === 'CANCELLED' ? 'cancel' as const : run.status === 'FAILED' || run.status === 'DEGRADED' ? run.steps.some(step => step.error && /provider|model/i.test(step.error)) ? 'provider' as const : 'workflow' as const : undefined;
    if (!records.length) {
      this.adaptiveOrchestration.recordOutcome({decisionId: parcel.audit.orchestrationDecisionId, parcelId: parcel.id, stageId: stage.id, workflow: {id: 'work-parcel-coordinator', version: '1'}, evidenceKind: 'PRODUCTION_WORK_PARCEL', outcome, verified: run.status === 'SUCCEEDED', qualityGatePass: run.status === 'SUCCEEDED' ? true : run.status === 'FAILED' ? false : null, failureClass});
      return;
    }
    for (const record of records) {
      const modelRoute = run.trigger.modelRoute;
      this.adaptiveOrchestration.recordOutcome({decisionId: parcel.audit.orchestrationDecisionId, parcelId: parcel.id, stageId: stage.id, observationId: record.id, route: {providerId: modelRoute?.providerId ?? record.provider, modelId: modelRoute?.modelId ?? record.model, accountProfileId: modelRoute?.accountProfileId ?? record.accountProfileId ?? null, nodeId: modelRoute?.nodeId ?? stage.actualRoute?.workers[0] ?? null, modelVersion: modelRoute?.qualificationVersion ?? null}, capabilities: modelRoute ? this.models?.qualification(modelRoute.modelId).capabilities : [], workflow: {id: 'work-parcel-coordinator', version: '1'}, evidenceKind: 'PRODUCTION_WORK_PARCEL', outcome, verified: run.status === 'SUCCEEDED', qualityGatePass: run.status === 'SUCCEEDED' ? true : run.status === 'FAILED' ? false : null, firstPass: record.turnNumber === 1 ? run.status === 'SUCCEEDED' : null, retryCount: Math.max(0, record.turnNumber - 1), latencyMs: record.elapsedMs, usage: {inputTokens: record.usage.inputTokens, outputTokens: record.usage.outputTokens, totalTokens: record.usage.totalProcessedTokens, cachedInputTokens: record.usage.cachedInputTokens}, cost: record.providerReportedCost ?? record.calculatedCost, currency: record.currency, costAuthority: record.providerReportedCost !== null ? 'authoritative' : record.calculatedCost !== null ? 'estimated' : 'unavailable', failureClass});
    }
  }
  private telemetry(parcel: WorkParcel) { const records = parcel.stages.flatMap(stage => stage.runId ? this.invocations(stage.runId) : []); return aggregateTelemetry(records, parcel.createdAt, parcel.endedAt); }
  private captureLiveRoutes(parcel: WorkParcel) {
    let changed = false;
    for (const stage of parcel.stages) {
      if (!stage.runId || ['SUCCEEDED','FAILED','CANCELLED'].includes(stage.status)) continue;
      const run = this.runtime.ledger.get(stage.runId); if (!run) continue;
      const resolved = routeFor(run, this.invocations(run.id)); if (!resolved.workers.length && !resolved.provider && !resolved.model) continue;
      const previous = actualRouteLabel(stage); stage.actualRoute = {...stage.actualRoute, ...resolved, profile: resolved.profile ?? stage.actualRoute?.profile}; const detail = actualRouteLabel(stage);
      if (detail !== previous) { changed = true; if (!parcel.audit.timeline.some(event => event.type === 'route.resolved' && event.stageId === stage.id && event.detail === detail)) appendAudit(parcel, {at: now(), type: 'route.resolved', stageId: stage.id, summary: `${stage.name} actual route recorded`, detail}); }
    }
    return changed;
  }
  private withTelemetry(parcel: WorkParcel) { if (parcel.executionOwner === 'direct-repository-review-executor') { parcel.decision = explainParcelDecision(parcel); return parcel; } parcel.audit ??= legacyAudit(parcel); parcel.telemetry = this.telemetry(parcel); this.syncAudit(parcel); parcel.decision = explainParcelDecision(parcel); return parcel; }
  private syncAudit(parcel: WorkParcel) {
    const records = parcel.stages.flatMap(stage => stage.runId ? this.invocations(stage.runId).map(record => ({stage, record, modelRoute: this.runtime.ledger.get(stage.runId!)?.trigger.modelRoute})) : []);
    parcel.audit.invocations = records.map(({stage, record, modelRoute}) => invocationAudit(stage, record, modelRoute));
    if (this.cacheExperts) for (const {stage, record, modelRoute} of records) if (record.completedAt && record.state !== 'RUNNING') {
      const scope = stage.requestedRoute ? cacheScopeFor(stage.requestedRoute,modelRoute?.modelId ?? record.model) : undefined, context = {...(stage.requestedRoute?.cacheContext ?? derivedCacheContext(parcel, stage)), ...(record.cacheEvidence?.requestPrefixSha256 ? {promptPrefixSha256: record.cacheEvidence.requestPrefixSha256} : {})};
      const workerId = modelRoute?.nodeId ?? stage.actualRoute?.workers[0] ?? 'controller', health = this.runtime.workers.list().find(item => item.id === workerId)?.health ?? 'unknown';
      const expert = this.cacheExperts.observe({invocationId: record.id, route: cacheRoute({providerId: modelRoute?.providerId ?? record.provider, modelId: modelRoute?.modelId ?? record.model, accountProfileId: modelRoute?.accountProfileId ?? record.accountProfileId ?? null, nodeId: workerId}, scope), context, cacheEvidence: record.cacheEvidence, observedAt: record.completedAt, taskClass: classifyTask(parcel.objective, parcel.stages), capabilities: modelRoute ? this.models?.qualification(modelRoute.modelId).capabilities ?? [] : [], outcome: record.outcome, verifierResult: record.verifierResult, health, evidenceIds: record.provenance.evidenceIds});
      if (!parcel.audit.timeline.some(event => event.type === 'cache.expert_observed' && event.detail.includes(record.id))) appendAudit(parcel, {at: record.completedAt, type: 'cache.expert_observed', stageId: stage.id, summary: `Cache expertise observed: ${expert.state}`, detail: `${record.id}; ${expert.cache.authority}; reused ${expert.cache.reusedTokens ?? 'unavailable'}; processed ${expert.cache.processedPromptTokens ?? 'unavailable'}; verifier ${expert.verifierResult}`});
    }
    for (const {stage, record} of records) if (record.completedAt && !parcel.audit.timeline.some(event => event.type === 'invocation.completed' && event.detail.includes(record.id))) appendAudit(parcel, {at: record.completedAt, type: 'invocation.completed', stageId: stage.id, summary: `${record.provider} / ${record.model} invocation completed`, detail: `${record.id}; ${record.usage.totalProcessedTokens === null ? 'tokens not reported' : `${record.usage.totalProcessedTokens} tokens`}; ${record.providerReportedCost === null ? 'provider cost not reported' : `provider cost ${record.providerReportedCost} ${record.currency ?? ''}`.trim()}`});
    const ordered = [...records].sort((a, b) => Date.parse(a.record.startedAt) - Date.parse(b.record.startedAt)); for (let index = 1; index < ordered.length; index++) { const before = ordered[index - 1], after = ordered[index]; if (`${before.record.provider}/${before.record.model}/${before.record.harnessProfile}` === `${after.record.provider}/${after.record.model}/${after.record.harnessProfile}`) continue; const id = `route-change:${before.record.id}:${after.record.id}`; if (!parcel.audit.timeline.some(event => event.id === id)) parcel.audit.timeline.push({id, at: after.record.startedAt, type: 'route.changed', stageId: after.stage.id, summary: `${before.record.provider}/${before.record.model} → ${after.record.provider}/${after.record.model}`, detail: `Observed execution strategy ${after.record.executionStrategy}; previous verifier ${before.record.verifierResult}; incremental provider cost ${after.record.providerReportedCost === null ? 'not reported' : `${after.record.providerReportedCost} ${after.record.currency ?? ''}`.trim()}`}); }
    parcel.audit.totals = auditTotals(parcel.audit.invocations, parcel.createdAt, parcel.endedAt);
  }
}

function createDecisionAudit(prompt: string, plan: WorkParcelPlan, runtime: JobRuntime, at: string): WorkParcelAudit {
  const classification = plan.planner.kind === 'reasoning-model' ? 'Complex task requiring a bounded reasoning planner' : plan.stages.length > 1 ? 'Deterministic multi-stage governed workflow' : 'Registered Job request';
  const alternatives: WorkParcelAudit['alternatives'] = [];
  for (const stage of plan.stages) {
    const definition = runtime.catalog.job(stage.job); if (!definition) continue;
    for (const step of definition.spec.steps) {
      const placement = runtime.workers.resolve(step.requires);
      if (placement.worker) alternatives.push({stageId: stage.id, candidate: placement.worker.id, eligible: true, reasons: placement.rationale.reasons});
      for (const rejected of placement.rationale.rejected) alternatives.push({stageId: stage.id, candidate: rejected.workerId, eligible: false, reasons: rejected.reasons});
    }
  }
  const timeline: WorkParcelAuditEvent[] = [
    {id: `audit-${randomUUID()}`, at, type: 'task.received', summary: 'Task received', detail: prompt},
    {id: `audit-${randomUUID()}`, at, type: 'task.classified', summary: `Classified: ${classification}`, detail: `Observable inputs: ${plan.stages.length} stage(s); planner=${plan.planner.kind}`},
    {id: `audit-${randomUUID()}`, at, type: 'plan.selected', summary: 'Work Parcel selected', detail: plan.planner.reason},
    ...plan.stages.map(stage => ({id: `audit-${randomUUID()}`, at, type: 'route.requested' as const, stageId: stage.id, summary: `${stage.name} route requested`, detail: routeRequestLabel(stage)})),
  ];
  return {schema: 'agent-control.work-parcel-audit/v1', recordedAt: at, classification, selectedExecution: 'Work Parcel', planningRationale: plan.planner.reason, planner: {kind: plan.planner.kind, provider: plan.planner.provider ?? null, model: plan.planner.model ?? null}, alternatives, timeline, invocations: [], totals: auditTotals([], at)};
}

function legacyAudit(parcel: WorkParcel): WorkParcelAudit {
  const at = parcel.createdAt, classification = 'Legacy parcel created before durable routing audit';
  return {schema: 'agent-control.work-parcel-audit/v1', recordedAt: now(), classification, selectedExecution: 'Work Parcel', planningRationale: parcel.planner.reason, planner: {kind: parcel.planner.kind, provider: parcel.planner.provider ?? null, model: parcel.planner.model ?? null}, alternatives: [], timeline: [{id: `audit-${randomUUID()}`, at, type: 'task.received', summary: 'Legacy task retained', detail: 'Original prompt and execution evidence preserved; unavailable decision-time alternatives were not reconstructed'}], invocations: [], totals: auditTotals([], parcel.createdAt, parcel.endedAt)};
}

function appendAudit(parcel: WorkParcel, event: Omit<WorkParcelAuditEvent, 'id'>) { parcel.audit.timeline.push({id: `audit-${randomUUID()}`, ...event}); }
function event(at: string, type: WorkParcelAuditEvent['type'], summary: string, detail: string): WorkParcelAuditEvent { return {id: `audit-${randomUUID()}`, at, type, summary, detail}; }
function planningAudit(at: string, timeline: WorkParcelAuditEvent[], blocked: string | null): WorkParcelAudit { return {schema: 'agent-control.work-parcel-audit/v1', recordedAt: at, classification: blocked ? 'Target readiness blocked before dispatch' : 'Planning in progress', selectedExecution: 'Work Parcel', planningRationale: blocked ?? 'Resolving registered Jobs and governed execution readiness', planner: {kind: 'pending', provider: null, model: null}, alternatives: [], timeline, invocations: [], totals: auditTotals([], at, blocked ? at : undefined)}; }
function materializeStages(stages: WorkParcelPlanStage[]): WorkParcelStage[] { return stages.map(stage => ({...stage, dependsOn: [...(stage.dependsOn ?? [])], parameters: structuredClone(stage.parameters ?? {}), requiredCapabilities: [...(stage.requiredCapabilities ?? [])], outputs: [...(stage.outputs ?? [])], waitingQuestionIds: [], status: 'QUEUED'})); }
function contextForPlan(plan: WorkParcelPlan, actor: string, stages: WorkParcelStage[], at: string, originalGoal = plan.objective) { const context = createParcelContext({goal: originalGoal, actor, plan: stages, constraints: plan.constraints, criteria: (plan.successCriteria ?? []).map(item => ({...item, source: item.source ?? 'INFERRED', sourceActor: plan.planner.kind === 'reasoning-model' ? `${plan.planner.provider ?? 'provider'}/${plan.planner.model ?? 'model'}` : 'agent-control-planner', requiredEvidence: item.requiredEvidence ?? []})), at}); context.active.currentInterpretation = plan.objective; inferStageCriteria(context, stages, 'agent-control-policy', at); return context; }
function mustParcelContext(parcel: WorkParcel) { parcel.context ??= createParcelContext({goal: parcel.objective || parcel.prompt, actor: parcel.actor, plan: parcel.stages, at: parcel.createdAt}); return parcel.context; }
function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function routeRequestLabel(stage: WorkParcelPlanStage) { const route = stage.requestedRoute; return route ? `Requested provider ${route.provider ?? 'policy-selected'}; account ${route.accountProfile ?? 'policy-selected'}; model ${route.model ?? 'policy-selected'}; role ${route.modelRole ?? 'policy-selected'}; fallback ${route.allowFallback === false ? 'disabled' : 'allowed'}; purpose ${route.purpose ?? 'EXECUTION'}; profile ${route.profile ?? 'policy-selected'}; ${route.reason}` : 'Normal Agent Control placement and routing policy'; }
function cacheScopeFor(route: NonNullable<WorkParcelPlanStage['requestedRoute']>, modelId: string) { return route.cacheScopeByModel?.[modelId] ?? route.cacheScope; }
function actualRouteLabel(stage: WorkParcelStage) { const route = stage.actualRoute; return route ? `Workers ${route.workers.join(', ') || 'none'}; provider ${route.provider ?? 'no model'}; account ${route.accountLabel ?? route.accountProfile ?? 'default'}; model ${route.model ?? 'no model'}; profile ${route.profile ?? 'control action'}; ${route.reason}` : 'Actual route not reported'; }
function invocationAudit(stage: WorkParcelStage, record: ModelInvocationObservation, modelRoute?: RunRecord['trigger']['modelRoute']): WorkParcelInvocationAudit { return {id: record.id, stageId: stage.id, runId: record.runId, route: record.executionStrategy, provider: modelRoute?.providerId ?? record.provider, accountProfileId: modelRoute?.accountProfileId ?? record.accountProfileId ?? null, accountLabel: modelRoute?.accountLabel ?? null, accountPlan: modelRoute?.accountPlan ?? null, model: modelRoute?.modelId ?? record.model, ...(modelRoute ? {logicalRole: modelRoute.requestedRole, registryModelId: modelRoute.modelId, providerModel: modelRoute.providerModel, qualificationVersion: modelRoute.qualificationVersion} : {}), node: modelRoute?.nodeId ?? stage.actualRoute?.workers[0] ?? null, workloadNodeId: modelRoute?.workloadNodeId ?? stage.actualRoute?.workloadNodeId ?? null, providerExecutionNodeId: modelRoute?.providerExecutionNodeId ?? modelRoute?.nodeId ?? stage.actualRoute?.providerExecutionNodeId ?? null, credentialNodeId: modelRoute?.credentialNodeId ?? stage.actualRoute?.credentialNodeId ?? null, profile: record.harnessProfile, startedAt: record.startedAt, completedAt: record.completedAt, elapsedMs: record.elapsedMs, usageAuthority: record.usageSource === 'provider-reported' ? 'authoritative' : record.usageSource === 'estimated' ? 'estimated' : 'unavailable', inputTokens: record.usage.inputTokens, freshInputTokens: record.usage.freshInputTokens, cachedInputTokens: record.usage.cachedInputTokens, cacheWriteTokens: record.usage.cacheWriteTokens, outputTokens: record.usage.outputTokens, reasoningTokens: record.usage.reasoningTokens, totalTokens: record.usage.totalProcessedTokens, providerReportedCost: record.providerReportedCost, calculatedCost: record.calculatedCost, costBasis: record.providerReportedCost !== null ? 'provider-reported' : record.calculatedCost !== null ? 'calculated' : 'unavailable', currency: record.currency, ...(record.cacheEvidence ? {cacheEvidence: structuredClone(record.cacheEvidence)} : {}), ...(record.costAccounting ? {costAccounting: structuredClone(record.costAccounting)} : {}), verifierResult: record.verifierResult, outcome: record.outcome}; }
function auditTotals(records: WorkParcelInvocationAudit[], start: string, end?: string): WorkParcelAudit['totals'] {
  const complete = (selector: (record: WorkParcelInvocationAudit) => number | null) => records.length > 0 && records.every(record => selector(record) !== null) ? records.reduce((sum, record) => sum + (selector(record) ?? 0), 0) : null;
  const provider = complete(record => record.providerReportedCost), calculated = complete(record => record.calculatedCost), currencies = [...new Set(records.map(record => record.currency).filter((value): value is string => Boolean(value)))];
  return {models: [...new Set(records.map(record => record.accountProfileId ? `${record.provider}/${record.accountLabel ?? record.accountProfileId}/${record.model}` : record.model))], invocations: records.length, inputTokens: complete(record => record.inputTokens ?? null), freshInputTokens: complete(record => record.freshInputTokens), cachedInputTokens: complete(record => record.cachedInputTokens), cacheWriteTokens: complete(record => record.cacheWriteTokens ?? null), outputTokens: complete(record => record.outputTokens), reasoningTokens: complete(record => record.reasoningTokens), totalTokens: complete(record => record.totalTokens), providerReportedCost: provider, calculatedCost: calculated, cost: provider ?? calculated, costBasis: provider !== null ? 'provider-reported' : calculated !== null ? 'calculated' : 'unavailable', currency: currencies.length === 1 ? currencies[0] : null, modelExecutionMs: records.reduce((sum, record) => sum + (record.elapsedMs ?? 0), 0), wallClockMs: Math.max(0, Date.parse(end ?? now()) - Date.parse(start))};
}

export function explainParcelDecision(parcel: WorkParcel): WorkParcelDecision {
  const failed = parcel.stages.find(stage => stage.status === 'FAILED'), blocked = parcel.stages.filter(stage => stage.status === 'BLOCKED').map(stage => stage.name);
  if (failed) {
    const error = failed.error ?? 'The Job failed without a more specific verified reason', capacity = error.match(/freetoken_capacity_gate_failed:free_vram_mib=(\d+):required=(\d+)/), asset = /freetoken_asset_gate_failed/.test(error);
    if (capacity) { const free = Number(capacity[1]), required = Number(capacity[2]); return {outcome: 'FAIL_CLOSED', title: 'Why Agent Control stopped', summary: `The ${failed.name} safety gate measured ${free.toLocaleString('en-GB')} MiB free VRAM, below the required ${required.toLocaleString('en-GB')} MiB. Agent Control stopped before installation, server launch, benchmarking or provider qualification.`, evidence: [`Measured free VRAM: ${free} MiB`, `Minimum safe threshold: ${required} MiB`, 'Provider/model request: none; the deterministic safety gate stopped first', `Failed Job: ${failed.job}`, `Run: ${failed.runId ?? 'not recorded'}`], blockedStages: blocked, authority: 'Agent Control'}; }
    if (asset) return {outcome: 'FAIL_CLOSED', title: 'Why Agent Control stopped', summary: `The ${failed.name} safety gate found no compatible checkpoint. Agent Control preserved the existing assets and blocked every dependent stage.`, evidence: [error, `Failed Job: ${failed.job}`, `Run: ${failed.runId ?? 'not recorded'}`], blockedStages: blocked, authority: 'Agent Control'};
    return {outcome: 'FAIL_CLOSED', title: 'Why Agent Control stopped', summary: `${failed.name} failed, so Agent Control blocked dependent work instead of continuing without verified prerequisites.`, evidence: [error, `Failed Job: ${failed.job}`, `Run: ${failed.runId ?? 'not recorded'}`], blockedStages: blocked, authority: 'Agent Control'};
  }
  if (parcel.status === 'SUCCEEDED') return {outcome: 'COMPLETE', title: 'Why Agent Control completed', summary: 'Every planned Job completed through the normal Agent Control verification boundary.', evidence: parcel.stages.map(stage => `${stage.name}: ${stage.status}`), blockedStages: [], authority: 'Agent Control'};
  if (parcel.status === 'CANCELLED') return {outcome: 'CANCELLED', title: 'Why Agent Control stopped', summary: 'The parcel was cancelled through the Agent Control operator boundary.', evidence: parcel.provenance.filter(item => item.type === 'cancelled').map(item => item.detail), blockedStages: blocked, authority: 'Agent Control'};
  if (parcel.status === 'FAILED') { const detail = [...parcel.provenance].reverse().find(item => ['planning.failed','readiness.blocked'].includes(item.type))?.detail ?? [...parcel.audit.timeline].reverse().find(item => item.type === 'planning.failed')?.detail ?? 'Planning failed before a registered Job could be dispatched'; return {outcome: 'FAIL_CLOSED', title: 'Why Agent Control stopped', summary: 'Agent Control retained the request and stopped before dispatch because planning or target readiness failed.', evidence: [detail], blockedStages: blocked, authority: 'Agent Control'}; }
  if (parcel.status === 'PLANNING') return {outcome: 'IN_PROGRESS', title: 'What Agent Control is doing', summary: 'Resolving targets, readiness and registered Jobs before dispatch.', evidence: parcel.audit.timeline.slice(-3).map(item => item.summary), blockedStages: blocked, authority: 'Agent Control'};
  const active = parcel.stages.find(stage => ['RUNNING','WAITING'].includes(stage.status)); return {outcome: 'IN_PROGRESS', title: 'What Agent Control is doing', summary: active ? `${active.name} is ${active.status.toLowerCase()}.` : 'The parcel is waiting for its next eligible Job.', evidence: active?.waitingReason ? [active.waitingReason] : [], blockedStages: blocked, authority: 'Agent Control'};
}

function routeFor(run: RunRecord, invocations: ModelInvocationObservation[]) {
  const last = invocations.at(-1), route = run.trigger.modelRoute;
  const placementReason = run.steps.flatMap(step => step.placement?.reasons ?? []).join(', ');
  return {
    workers: [...run.selectedWorkers],
    workloadNodeId: route?.workloadNodeId,
    providerExecutionNodeId: route?.providerExecutionNodeId ?? route?.nodeId,
    credentialNodeId: route?.credentialNodeId ?? undefined,
    provider: route?.providerId ?? last?.provider,
    accountProfile: route?.accountProfileId ?? undefined,
    accountLabel: route?.accountLabel ?? undefined,
    accountPlan: route?.accountPlan ?? undefined,
    accountPlanAuthority: route?.accountPlanAuthority ?? undefined,
    accountQualification: route?.accountQualification ?? undefined,
    accountAvailability: route?.accountAvailability ?? undefined,
    model: route?.modelId ?? last?.model,
    profile: last?.harnessProfile,
    reason: placementReason || (route ? `Qualified route ${route.qualificationVersion}` : 'Normal Agent Control placement; no model invocation reported'),
  };
}
function emptyTelemetry(): WorkParcelTelemetry { return {inputTokens: null, freshInputTokens: null, cachedInputTokens: null, cacheWriteTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null, cost: null, currency: null, elapsedMs: 0}; }
function aggregateTelemetry(records: ModelInvocationObservation[], start: string, end?: string): WorkParcelTelemetry { const sum = (selector: (record: ModelInvocationObservation) => number | null) => records.length && records.every(record => selector(record) !== null) ? records.reduce((total, record) => total + (selector(record) ?? 0), 0) : null; const providerCost = sum(record => record.providerReportedCost), calculated = sum(record => record.calculatedCost); return {inputTokens: sum(record => record.usage.inputTokens), freshInputTokens: sum(record => record.usage.freshInputTokens), cachedInputTokens: sum(record => record.usage.cachedInputTokens), cacheWriteTokens: sum(record => record.usage.cacheWriteTokens), outputTokens: sum(record => record.usage.outputTokens), reasoningTokens: sum(record => record.usage.reasoningTokens), totalTokens: sum(record => record.usage.totalProcessedTokens), cost: providerCost ?? calculated, currency: records.length && records.every(record => record.currency === records[0].currency) ? records[0].currency : null, elapsedMs: Math.max(0, Date.parse(end ?? now()) - Date.parse(start))}; }

function classifyTask(objective: string, stages: Array<WorkParcelPlanStage | WorkParcelStage>): AdaptiveTaskClass {
  const value = `${objective} ${stages.map(stage => `${stage.name} ${stage.job}`).join(' ')}`.toLowerCase();
  if (/repository[- ]review|code review|whole[- ]repository/.test(value)) return 'repository-review';
  if (/debug|diagnos|troubleshoot|regression/.test(value)) return 'debugging';
  if (/test[- ]generation|generate tests|coverage/.test(value)) return 'test-generation';
  if (/repair|fix|patch|remediat/.test(value)) return 'repair';
  if (/coding|code|implement|develop/.test(value)) return 'coding';
  if (/critique|review/.test(value)) return 'critique';
  if (/reason|architecture|design/.test(value)) return 'reasoning';
  if (/tool|inspect|inventory|query/.test(value)) return 'tool-use';
  if (/long[- ]context|large context|whole repo/.test(value)) return 'long-context';
  return 'other';
}
function adaptiveOutcome(status: string): AdaptiveOutcome { return status === 'SUCCEEDED' ? 'SUCCEEDED' : status === 'CANCELLED' ? 'CANCELLED' : status === 'DEGRADED' ? 'FAILED' : 'FAILED'; }

function cacheRoute(route: {providerId: string; modelId: string; accountProfileId?: string | null; nodeId?: string | null}, scope?: {sessionId?: string; cacheScopeId?: string; backendInstanceId?: string}): CacheRouteIdentity {
  const workerId = route.nodeId ?? 'controller';
  return {workerId, providerId: route.providerId, modelId: route.modelId, accountProfileId: route.accountProfileId ?? null, nodeId: route.nodeId ?? null, sessionId: scope?.sessionId ?? null, cacheScopeId: scope?.cacheScopeId ?? null, backendInstanceId: scope?.backendInstanceId ?? null};
}
function sameCacheRoute(left: CacheRouteIdentity, right: CacheRouteIdentity) { return JSON.stringify(left) === JSON.stringify(right); }
function derivedCacheContext(parcel: WorkParcel, stage: WorkParcelPlanStage): CacheContextIdentity {
  const repositoryRef = typeof stage.parameters?.repository === 'string' ? `${stage.parameters.repository}@${String(stage.parameters.ref ?? 'HEAD')}` : null;
  const repositoryIdentitySha256 = repositoryRef ? createHash('sha256').update(repositoryRef).digest('hex') : null;
  const immutable = stage.parameters?.snapshotSha256 ?? stage.parameters?.immutableBundleSha256 ?? parcel.transportIntegrity?.contractSha256;
  return {taskType: classifyTask(parcel.objective,[stage]), repositoryRef, repositoryIdentitySha256, branchStateSha256: typeof stage.parameters?.ref === 'string' ? createHash('sha256').update(stage.parameters.ref).digest('hex') : null, dependencyContextSha256:null,instructionContextSha256:null,toolContractSha256:null,governancePolicySha256:null,immutableContextSha256: typeof immutable === 'string' ? immutable : null, promptPrefixSha256: null, transportContextSha256: parcel.transportIntegrity?.contractSha256 ?? null, contextTags: [`job:${stage.job}`, ...(repositoryRef ? [`repository:${repositoryRef}`] : [])], estimatedTokens: null};
}

export function freeTokenEvaluationPlan(objective: string): WorkParcelPlan { return {objective, planner: {kind: 'deterministic', reason: 'Safety-constrained built-in qualification routine selected from explicit FreeToken objective'}, stages: [
  {id: 'inventory', name: 'A · Safety and asset inventory', job: 'freetoken-inventory@1.0.0', requestedRoute: {profile: 'THIN', reason: 'Deterministic host inspection; no model required'}},
  {id: 'gate', name: 'B · Compatibility and capacity gate', job: 'freetoken-readiness-gate@1.0.0', dependsOn: ['inventory'], requestedRoute: {profile: 'THIN', reason: 'Fail-closed resource and asset validation'}},
  {id: 'isolated', name: 'C · Isolated FreeToken qualification', job: 'freetoken-isolated-qualification@1.0.0', dependsOn: ['gate'], requestedRoute: {profile: 'STANDARD', reason: 'Isolated port and environment only after gate passes'}},
  {id: 'benchmark', name: 'D · Comparative benchmark', job: 'freetoken-comparative-benchmark@1.0.0', dependsOn: ['isolated'], requestedRoute: {profile: 'STANDARD', reason: 'Compare the same prompt/model only after endpoint verification'}},
  {id: 'provider', name: 'E · Agent Control provider qualification', job: 'freetoken-provider-qualification@1.0.0', dependsOn: ['benchmark'], requestedRoute: {profile: 'DEEP', reason: 'Register no production route; qualification evidence only'}},
]}; }

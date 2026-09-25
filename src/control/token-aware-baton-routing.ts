import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {GovernedHandoffRuntime, HandoffRequest} from './handoff-runtime.js';
import {normalizeCapabilityId} from './capability-intelligence.js';

export const TOKEN_BATON_ROUTING_SCHEMA = 'agent-control.token-aware-baton-routing/v1' as const;
export type TelemetryAuthority = 'authoritative' | 'estimated' | 'unavailable';
export type GovernorState = 'CONTINUE' | 'PREPARE_BATON' | 'COMPACT' | 'HANDOFF';
export type RoutingAction = 'CONTINUE' | 'COMPACT_AND_CONTINUE' | 'BATON_AND_HANDOFF';
export type RemainingWork = 'DIFFICULT' | 'BOUNDED' | 'MECHANICAL';
export type ReasoningState = 'UNFINISHED' | 'COMPLETE';
export type ContextLifecycleKind = 'COMPACTION' | 'NEW_CONTEXT' | 'RESUME' | 'CONTINUATION';
export type RoutingTriggerKind = 'CONTEXT_PRESSURE' | 'QUALITY_GATE' | 'PROVIDER_FAILURE';

export interface RoutingTrigger {
  kind: RoutingTriggerKind;
  code: string;
  reason: string;
  evidence: string[];
}

export interface TokenGovernorPolicy {
  continuePercent: number;
  prepareBatonPercent: number;
  compactPercent: number;
  handoffPercent: number;
  sampleRetention: number;
}

export const DEFAULT_TOKEN_GOVERNOR_POLICY: TokenGovernorPolicy = Object.freeze({continuePercent: 60, prepareBatonPercent: 75, compactPercent: 85, handoffPercent: 90, sampleRetention: 240});

export interface TokenAmounts {inputTokens: number | null; freshInputTokens: number | null; cachedInputTokens: number | null; cacheWriteTokens: number | null; outputTokens: number | null; totalTokens: number | null;}
export interface AccountRouteIdentity {nodeId?: string; workloadNodeId?: string; providerExecutionNodeId?: string; credentialNodeId?: string; accountProfileId?: string; accountLabel?: string; accountPlan?: string; accountPlanAuthority?: 'operator-configured' | 'provider-reported'; accountQualification?: string; accountAvailability?: string;}
export interface ContextOccupancy {tokens: number | null; limitTokens: number | null; authority: TelemetryAuthority; source: string;}
export interface CostEstimate {amount: number | null; currency: string | null; authority: TelemetryAuthority; source: string;}
export interface TokenTelemetrySample extends AccountRouteIdentity {
  threadId: string;
  parcelId: string;
  agentId: string;
  providerId: string;
  modelId: string;
  observedAt?: string;
  elapsedMs: number;
  active?: boolean;
  cumulative: Partial<TokenAmounts>;
  context?: Partial<ContextOccupancy>;
  cost?: Partial<CostEstimate>;
  contextLifecycle?: {kind: ContextLifecycleKind; contextId?: string; authority: TelemetryAuthority; source: string};
}

export interface ContextLifecycleRecord {
  id: string;
  at: string;
  threadId: string;
  parcelId: string;
  kind: ContextLifecycleKind;
  contextId: string | null;
  authority: TelemetryAuthority;
  source: string;
  cumulative: TokenAmounts;
}

export interface TokenTelemetryPoint {
  at: string;
  elapsedMs: number;
  cumulative: TokenAmounts;
  context: ContextOccupancy;
  contextPercent: number | null;
  cost: CostEstimate;
}

export interface ThreadTokenRecord extends AccountRouteIdentity {
  id: string;
  parcelId: string;
  agentId: string;
  providerId: string;
  modelId: string;
  startedAt: string;
  updatedAt: string;
  active: boolean;
  recoverable: boolean;
  governor: {state: GovernorState; currentThreshold: number | null; nextThreshold: number | null; reason: string};
  latest: TokenTelemetryPoint;
  samples: TokenTelemetryPoint[];
  batonId?: string;
}

export interface ParcelTokenTotals {
  parcelId: string;
  threads: string[];
  byModel: Array<{providerId: string; accountProfileId: string | null; accountLabel: string | null; accountPlan: string | null; modelId: string; nodeId: string | null; workloadNodeId: string | null; providerExecutionNodeId: string | null; credentialNodeId: string | null; inputTokens: number | null; freshInputTokens: number | null; cachedInputTokens: number | null; cacheWriteTokens: number | null; outputTokens: number | null; totalTokens: number | null; cost: number | null; currency: string | null}>;
  inputTokens: number | null;
  freshInputTokens: number | null;
  cachedInputTokens: number | null;
  cacheWriteTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cost: number | null;
  currency: string | null;
}

export interface VerifiedBaton extends AccountRouteIdentity {
  schema: 'agent-control.token-baton/v1';
  id: string;
  threadId: string;
  parcelId: string;
  providerId: string;
  modelId: string;
  objective: string;
  completedWork: string[];
  decisions: string[];
  filesChanged: string[];
  git: {sha: string; dirty: boolean; diffSummary: string};
  testsAndEvidence: string[];
  evidenceReferences?: string[];
  unresolvedIssues: string[];
  nextAction: string;
  tokenState: TokenTelemetryPoint;
  parcelTotals: ParcelTokenTotals;
  createdAt: string;
  sha256: string;
  transportContextSha256?: string;
  transportIntegrityState?: string;
}

export interface BatonInput extends Omit<VerifiedBaton, 'schema' | 'id' | 'tokenState' | 'parcelTotals' | 'createdAt' | 'sha256'> {}
export interface TokenRoutingDecision {
  id: string;
  at: string;
  threadId: string;
  parcelId: string;
  state: GovernorState;
  action: RoutingAction;
  reason: string;
  /** Present on all newly recorded decisions; optional only for v1 snapshot compatibility. */
  trigger?: RoutingTrigger;
  contextPercent: number | null;
  target?: {providerId: string; accountProfileId?: string; accountLabel?: string; accountPlan?: string; accountPlanAuthority?: 'operator-configured' | 'provider-reported'; accountQualification?: string; accountAvailability?: string; modelId: string; nodeId?: string; workloadNodeId?: string; providerExecutionNodeId?: string; credentialNodeId?: string};
  batonId?: string;
  outcome: 'RECORDED' | 'SUCCEEDED' | 'FAILED';
}

export interface TokenRoutingCandidate extends AccountRouteIdentity {providerId: string; modelId: string; estimatedCost: number | null; qualified: boolean; capabilities: string[]; preferenceOrder?: number;}
export interface RoutingAssessment {remainingWork: RemainingWork; reasoningState: ReasoningState; requiredCapabilities: string[]; candidates: TokenRoutingCandidate[]; trigger?: RoutingTrigger;}
export interface TokenRoutingEvent {type: 'telemetry' | 'governor.transition' | 'context.lifecycle' | 'baton.created' | 'handoff.result'; threadId: string; parcelId: string; at: string;}
export interface TokenRoutingProjection {schema: typeof TOKEN_BATON_ROUTING_SCHEMA; observedAt: string; policy: TokenGovernorPolicy; threads: ThreadTokenRecord[]; parcels: ParcelTokenTotals[]; decisions: TokenRoutingDecision[]; contextLifecycle: ContextLifecycleRecord[];}

interface Snapshot {schema: typeof TOKEN_BATON_ROUTING_SCHEMA; policy: TokenGovernorPolicy; threads: ThreadTokenRecord[]; batons: VerifiedBaton[]; decisions: TokenRoutingDecision[]; contextLifecycle?: ContextLifecycleRecord[];}
const emptyAmounts = (): TokenAmounts => ({inputTokens: null, freshInputTokens: null, cachedInputTokens: null, cacheWriteTokens: null, outputTokens: null, totalTokens: null});
const emptyContext = (): ContextOccupancy => ({tokens: null, limitTokens: null, authority: 'unavailable', source: 'provider_not_reported'});
const emptyCost = (): CostEstimate => ({amount: null, currency: null, authority: 'unavailable', source: 'provider_not_reported'});
const now = () => new Date().toISOString();
const validNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const clone = <T>(value: T): T => structuredClone(value);

export function normalizeGovernorPolicy(input: Partial<TokenGovernorPolicy> = {}): TokenGovernorPolicy {
  const value = {...DEFAULT_TOKEN_GOVERNOR_POLICY, ...input};
  for (const key of ['continuePercent', 'prepareBatonPercent', 'compactPercent', 'handoffPercent'] as const) if (!Number.isFinite(value[key]) || value[key] <= 0 || value[key] >= 100) throw new Error(`token_governor_${key}_invalid`);
  if (!(value.continuePercent < value.prepareBatonPercent && value.prepareBatonPercent < value.compactPercent && value.compactPercent < value.handoffPercent)) throw new Error('token_governor_threshold_order_invalid');
  if (!Number.isSafeInteger(value.sampleRetention) || value.sampleRetention < 2 || value.sampleRetention > 10_000) throw new Error('token_governor_sample_retention_invalid');
  return value;
}

export function governorFor(contextPercent: number | null, policy: TokenGovernorPolicy): ThreadTokenRecord['governor'] {
  if (contextPercent === null) return {state: 'CONTINUE', currentThreshold: null, nextThreshold: policy.prepareBatonPercent, reason: 'current_context_unavailable'};
  if (contextPercent >= policy.handoffPercent) return {state: 'HANDOFF', currentThreshold: policy.handoffPercent, nextThreshold: null, reason: 'context_handoff_threshold_reached'};
  if (contextPercent >= policy.compactPercent) return {state: 'COMPACT', currentThreshold: policy.compactPercent, nextThreshold: policy.handoffPercent, reason: 'context_compaction_threshold_reached'};
  if (contextPercent >= policy.prepareBatonPercent) return {state: 'PREPARE_BATON', currentThreshold: policy.prepareBatonPercent, nextThreshold: policy.compactPercent, reason: 'context_baton_preparation_threshold_reached'};
  if (contextPercent >= policy.continuePercent) return {state: 'CONTINUE', currentThreshold: policy.continuePercent, nextThreshold: policy.prepareBatonPercent, reason: 'context_continue_threshold_reached'};
  return {state: 'CONTINUE', currentThreshold: null, nextThreshold: policy.continuePercent, reason: 'context_within_policy'};
}

export class TokenAwareBatonRuntime {
  private readonly threads = new Map<string, ThreadTokenRecord>();
  private readonly batons = new Map<string, VerifiedBaton>();
  private readonly decisions: TokenRoutingDecision[] = [];
  private readonly contextLifecycle: ContextLifecycleRecord[] = [];
  private readonly listeners = new Set<(event: TokenRoutingEvent) => void>();
  readonly policy: TokenGovernorPolicy;

  constructor(readonly file?: string, policy: Partial<TokenGovernorPolicy> = {}, private readonly clock: () => string = now) {
    this.policy = normalizeGovernorPolicy(policy); this.load();
  }

  subscribe(listener: (event: TokenRoutingEvent) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  thread(id: string) { const value = this.threads.get(id); if (!value) throw new Error('token_thread_missing'); return clone(value); }
  baton(id: string) { const value = this.batons.get(id); if (!value) throw new Error('token_baton_missing'); return clone(value); }

  observe(input: TokenTelemetrySample): ThreadTokenRecord {
    if (!input.threadId || !input.parcelId || !input.agentId || !input.providerId || !input.modelId || !validNumber(input.elapsedMs)) throw new Error('token_telemetry_identity_invalid');
    validateAccountIdentity(input);
    const at = input.observedAt ?? this.clock(); if (Number.isNaN(Date.parse(at))) throw new Error('token_telemetry_timestamp_invalid');
    const prior = this.threads.get(input.threadId), cumulative = mergeAmounts(prior?.latest.cumulative ?? emptyAmounts(), input.cumulative);
    const context = mergeContext(prior?.latest.context ?? emptyContext(), input.context), cost = mergeCost(prior?.latest.cost ?? emptyCost(), input.cost);
    const contextPercent = context.tokens === null || context.limitTokens === null || context.limitTokens === 0 ? null : Math.min(100, context.tokens / context.limitTokens * 100);
    const latest: TokenTelemetryPoint = {at, elapsedMs: input.elapsedMs, cumulative, context, contextPercent, cost};
    if (prior && (prior.parcelId !== input.parcelId || prior.agentId !== input.agentId || prior.providerId !== input.providerId || prior.accountProfileId !== input.accountProfileId || prior.modelId !== input.modelId || prior.nodeId !== input.nodeId || prior.workloadNodeId !== input.workloadNodeId || prior.providerExecutionNodeId !== input.providerExecutionNodeId || prior.credentialNodeId !== input.credentialNodeId)) throw new Error('token_thread_identity_changed');
    const governor = governorFor(contextPercent, this.policy), active = input.active ?? prior?.active ?? true;
    const account = {...(input.nodeId ? {nodeId: input.nodeId} : {}), ...(input.workloadNodeId ? {workloadNodeId: input.workloadNodeId} : {}), ...(input.providerExecutionNodeId ? {providerExecutionNodeId: input.providerExecutionNodeId} : {}), ...(input.credentialNodeId ? {credentialNodeId: input.credentialNodeId} : {}), ...(input.accountProfileId ? {accountProfileId: input.accountProfileId, ...(input.accountLabel ? {accountLabel: input.accountLabel} : {}), ...(input.accountPlan ? {accountPlan: input.accountPlan} : {}), ...(input.accountPlanAuthority ? {accountPlanAuthority: input.accountPlanAuthority} : {}), ...(input.accountQualification ? {accountQualification: input.accountQualification} : {}), ...(input.accountAvailability ? {accountAvailability: input.accountAvailability} : {})} : {})};
    const record: ThreadTokenRecord = prior ? {...prior, ...account, updatedAt: at, active, latest, governor, samples: [...prior.samples, latest].slice(-this.policy.sampleRetention)} : {id: input.threadId, parcelId: input.parcelId, agentId: input.agentId, providerId: input.providerId, ...account, modelId: input.modelId, startedAt: at, updatedAt: at, active, recoverable: true, governor, latest, samples: [latest]};
    this.threads.set(record.id, record);
    this.save(); this.emit({type: 'telemetry', threadId: record.id, parcelId: record.parcelId, at});
    if (input.contextLifecycle) this.recordContextLifecycle(record.id, input.contextLifecycle, at);
    if (!prior || prior.governor.state !== governor.state) this.record(record, actionFor(governor.state), governor.reason, 'RECORDED');
    return clone(record);
  }

  recordContextLifecycle(threadId: string, input: {kind: ContextLifecycleKind; contextId?: string; authority: TelemetryAuthority; source: string}, at = this.clock()): ContextLifecycleRecord {
    const thread = this.thread(threadId);
    if (!['COMPACTION', 'NEW_CONTEXT', 'RESUME', 'CONTINUATION'].includes(input.kind) || !['authoritative', 'estimated', 'unavailable'].includes(input.authority) || !input.source.trim()) throw new Error('token_context_lifecycle_invalid');
    const record: ContextLifecycleRecord = {id: `context-lifecycle:${randomUUID()}`, at, threadId, parcelId: thread.parcelId, kind: input.kind, contextId: input.contextId ?? null, authority: input.authority, source: input.source, cumulative: clone(thread.latest.cumulative)};
    this.contextLifecycle.push(record); this.save(); this.emit({type: 'context.lifecycle', threadId, parcelId: thread.parcelId, at}); return clone(record);
  }

  assess(threadId: string, assessment: RoutingAssessment): TokenRoutingDecision {
    const thread = this.thread(threadId), state = thread.governor.state, pressure = thread.latest.contextPercent;
    const trigger = normalizeTrigger(assessment.trigger, thread);
    let action: RoutingAction = state === 'COMPACT' || state === 'HANDOFF' ? 'COMPACT_AND_CONTINUE' : 'CONTINUE', reason = thread.governor.reason, target: TokenRoutingDecision['target'];
    if (trigger.kind === 'QUALITY_GATE' || trigger.kind === 'PROVIDER_FAILURE') {
      const eligible = eligibleCandidates(thread, assessment);
      const selected = eligible.sort((a, b) => (a.preferenceOrder ?? Number.MAX_SAFE_INTEGER) - (b.preferenceOrder ?? Number.MAX_SAFE_INTEGER) || routeKey(a).localeCompare(routeKey(b)))[0];
      if (selected) {
        action = 'BATON_AND_HANDOFF';
        target = decisionTarget(selected);
        reason = trigger.kind === 'QUALITY_GATE'
          ? `quality_gate_failed_governed_fallback_selected:${trigger.code}`
          : `provider_failure_retry_exhausted_governed_fallback_selected:${trigger.code}`;
      } else {
        action = 'CONTINUE';
        reason = trigger.kind === 'QUALITY_GATE'
          ? `quality_gate_failed_no_qualified_governed_fallback:${trigger.code}`
          : `provider_failure_retry_exhausted_no_qualified_governed_fallback:${trigger.code}`;
      }
      return this.record(thread, action, reason, 'RECORDED', target, undefined, trigger);
    }
    if (state === 'HANDOFF' && assessment.reasoningState === 'COMPLETE' && ['BOUNDED', 'MECHANICAL'].includes(assessment.remainingWork)) {
      const currentCost = thread.latest.cost.amount;
      const eligible = eligibleCandidates(thread, assessment).filter(candidate => currentCost === null || candidate.estimatedCost === null || candidate.estimatedCost < currentCost);
      const selected = eligible.sort((a, b) => (a.estimatedCost ?? Infinity) - (b.estimatedCost ?? Infinity) || routeKey(a).localeCompare(routeKey(b)))[0];
      if (selected) { action = 'BATON_AND_HANDOFF'; target = decisionTarget(selected); reason = 'context_handoff_threshold_and_bounded_work_on_qualified_lower_cost_route'; }
      else reason = assessment.reasoningState === 'COMPLETE' ? 'context_high_no_qualified_cheaper_route' : 'difficult_reasoning_remains_on_current_model';
    }
    if (assessment.reasoningState === 'UNFINISHED' && state === 'HANDOFF') { action = 'COMPACT_AND_CONTINUE'; reason = 'difficult_reasoning_remains_on_current_model'; }
    return this.record(thread, action, reason, 'RECORDED', target, undefined, trigger);
  }

  createBaton(input: BatonInput): VerifiedBaton {
    const thread = this.thread(input.threadId);
    if (thread.parcelId !== input.parcelId || thread.providerId !== input.providerId || thread.accountProfileId !== input.accountProfileId || thread.modelId !== input.modelId || thread.nodeId !== input.nodeId || thread.workloadNodeId !== input.workloadNodeId || thread.providerExecutionNodeId !== input.providerExecutionNodeId || thread.credentialNodeId !== input.credentialNodeId) throw new Error('token_baton_provenance_mismatch');
    for (const [field, value] of Object.entries({objective: input.objective, nextAction: input.nextAction, gitSha: input.git?.sha})) if (typeof value !== 'string' || !value.trim()) throw new Error(`token_baton_${field}_required`);
    for (const value of [input.completedWork, input.decisions, input.filesChanged, input.testsAndEvidence, input.unresolvedIssues, input.evidenceReferences ?? []]) if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error('token_baton_array_invalid');
    const createdAt = this.clock(), id = `token-baton:${randomUUID()}`, withoutHash = {schema: 'agent-control.token-baton/v1' as const, id, ...clone(input), tokenState: clone(thread.latest), parcelTotals: this.parcel(thread.parcelId), createdAt};
    const baton: VerifiedBaton = {...withoutHash, sha256: digest(withoutHash)};
    this.batons.set(id, baton); const stored = this.threads.get(thread.id)!; stored.batonId = id; this.threads.set(stored.id, stored); this.save(); this.emit({type: 'baton.created', threadId: thread.id, parcelId: thread.parcelId, at: createdAt}); return clone(baton);
  }

  async handoff(threadId: string, batonId: string, target: TokenRoutingDecision['target'] & {providerId: string; modelId: string}, execute: () => Promise<void>): Promise<TokenRoutingDecision> {
    const thread = this.thread(threadId), baton = this.baton(batonId); if (baton.threadId !== thread.id) throw new Error('token_handoff_baton_thread_mismatch');
    const trigger = [...this.decisions].reverse().find(decision => decision.threadId === thread.id && decision.target && routeKey(decision.target) === routeKey(target))?.trigger ?? contextTrigger(thread);
    this.record(thread, 'BATON_AND_HANDOFF', 'verified_baton_ready_for_explicit_handoff', 'RECORDED', target, batonId, trigger);
    try { await execute(); const original = this.threads.get(thread.id)!; original.recoverable = true; this.threads.set(original.id, original); this.save(); return this.record(thread, 'BATON_AND_HANDOFF', 'handoff_completed_original_thread_recoverable', 'SUCCEEDED', target, batonId, trigger); }
    catch (error) { const original = this.threads.get(thread.id)!; original.recoverable = true; original.governor = governorFor(original.latest.contextPercent, this.policy); this.threads.set(original.id, original); this.save(); return this.record(original, actionFor(original.governor.state), `handoff_failed_original_thread_reassessed:${message(error)}`, 'FAILED', target, batonId, trigger); }
  }

  async governedHandoff(threadId: string, batonId: string, target: TokenRoutingDecision['target'] & {providerId: string; modelId: string}, handoffs: GovernedHandoffRuntime, request: Omit<HandoffRequest, 'baton' | 'reason'>, executeDestination?: (result: Awaited<ReturnType<GovernedHandoffRuntime['request']>>) => Promise<void>) {
    const trigger = [...this.decisions].reverse().find(decision => decision.threadId === threadId && decision.target && routeKey(decision.target) === routeKey(target))?.trigger;
    return this.handoff(threadId, batonId, target, async () => {
      const result = await handoffs.request({...request, reason: trigger?.kind === 'QUALITY_GATE' ? `Quality governor approved verified baton escalation: ${trigger.code}` : trigger?.kind === 'PROVIDER_FAILURE' ? `Provider-failure governor approved verified baton continuation: ${trigger.code}` : 'Token governor approved verified baton handoff', baton: {tokenBatonId: batonId, tokenBatonSha256: this.baton(batonId).sha256}});
      if (result.status !== 'COMPLETED') throw new Error(`governed_handoff_not_completed:${result.status}`);
      await executeDestination?.(result);
    });
  }

  parcel(parcelId: string): ParcelTokenTotals {
    const threads = [...this.threads.values()].filter(thread => thread.parcelId === parcelId), byModel = new Map<string, ParcelTokenTotals['byModel'][number]>();
    for (const thread of threads) {
      const key = routeKey(thread), existing = byModel.get(key);
      if (!existing) {
        byModel.set(key, {providerId: thread.providerId, accountProfileId: thread.accountProfileId ?? null, accountLabel: thread.accountLabel ?? null, accountPlan: thread.accountPlan ?? null, modelId: thread.modelId, nodeId: thread.nodeId ?? null, workloadNodeId: thread.workloadNodeId ?? null, providerExecutionNodeId: thread.providerExecutionNodeId ?? thread.nodeId ?? null, credentialNodeId: thread.credentialNodeId ?? null, ...clone(thread.latest.cumulative), cost: thread.latest.cost.amount, currency: thread.latest.cost.currency});
        continue;
      }
      existing.inputTokens = sum(existing.inputTokens, thread.latest.cumulative.inputTokens); existing.freshInputTokens = sum(existing.freshInputTokens, thread.latest.cumulative.freshInputTokens); existing.cachedInputTokens = sum(existing.cachedInputTokens, thread.latest.cumulative.cachedInputTokens); existing.cacheWriteTokens = sum(existing.cacheWriteTokens, thread.latest.cumulative.cacheWriteTokens); existing.outputTokens = sum(existing.outputTokens, thread.latest.cumulative.outputTokens); existing.totalTokens = sum(existing.totalTokens, thread.latest.cumulative.totalTokens); existing.cost = sum(existing.cost, thread.latest.cost.amount); existing.currency = existing.currency ?? thread.latest.cost.currency; byModel.set(key, existing);
    }
    const values = [...byModel.values()];
    return {parcelId, threads: threads.map(thread => thread.id).sort(), byModel: clone(values), inputTokens: aggregate(values.map(value => value.inputTokens)), freshInputTokens: aggregate(values.map(value => value.freshInputTokens)), cachedInputTokens: aggregate(values.map(value => value.cachedInputTokens)), cacheWriteTokens: aggregate(values.map(value => value.cacheWriteTokens)), outputTokens: aggregate(values.map(value => value.outputTokens)), totalTokens: aggregate(values.map(value => value.totalTokens)), cost: aggregate(values.map(value => value.cost)), currency: [...new Set(values.map(value => value.currency).filter((value): value is string => Boolean(value)))].length === 1 ? values.find(value => value.currency)?.currency ?? null : null};
  }

  projection(): TokenRoutingProjection { const parcels = [...new Set([...this.threads.values()].map(thread => thread.parcelId))].sort().map(id => this.parcel(id)); return {schema: TOKEN_BATON_ROUTING_SCHEMA, observedAt: this.clock(), policy: clone(this.policy), threads: [...this.threads.values()].sort((a,b) => a.id.localeCompare(b.id)).map(clone), parcels, decisions: this.decisions.map(clone), contextLifecycle: this.contextLifecycle.map(clone)}; }
  evidence() { return {schema: TOKEN_BATON_ROUTING_SCHEMA, policy: clone(this.policy), threads: [...this.threads.values()].map(clone), batons: [...this.batons.values()].map(clone), decisions: this.decisions.map(clone), contextLifecycle: this.contextLifecycle.map(clone)} satisfies Snapshot; }

  private record(thread: ThreadTokenRecord, action: RoutingAction, reason: string, outcome: TokenRoutingDecision['outcome'], target?: TokenRoutingDecision['target'], batonId?: string, trigger: RoutingTrigger = contextTrigger(thread)) { const decision: TokenRoutingDecision = {id: `token-route:${randomUUID()}`, at: this.clock(), threadId: thread.id, parcelId: thread.parcelId, state: thread.governor.state, action, reason, trigger: clone(trigger), contextPercent: thread.latest.contextPercent, ...(target ? {target} : {}), ...(batonId ? {batonId} : {}), outcome}; this.decisions.push(decision); this.save(); this.emit({type: outcome === 'RECORDED' ? 'governor.transition' : 'handoff.result', threadId: thread.id, parcelId: thread.parcelId, at: decision.at}); return clone(decision); }
  private emit(event: TokenRoutingEvent) { for (const listener of this.listeners) listener(event); }
  private load() { if (!this.file || !fs.existsSync(this.file)) return; const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Snapshot; if (parsed.schema !== TOKEN_BATON_ROUTING_SCHEMA) throw new Error('token_routing_snapshot_unsupported'); normalizeGovernorPolicy(parsed.policy); for (const item of parsed.threads ?? []) { const samples = item.samples.map(point => ({...point, cumulative: normalizePersistedAmounts(point.cumulative)})), latest = {...item.latest, cumulative: normalizePersistedAmounts(item.latest.cumulative)}; this.threads.set(item.id, {...item, samples, latest}); } for (const item of parsed.batons ?? []) this.batons.set(item.id, item); this.decisions.push(...(parsed.decisions ?? []).map(decision => ({...decision, trigger: decision.trigger ?? {kind: 'CONTEXT_PRESSURE' as const, code: 'legacy_context_governor', reason: decision.reason, evidence: []}}))); this.contextLifecycle.push(...(parsed.contextLifecycle ?? []).map(item => ({...item, cumulative: normalizePersistedAmounts(item.cumulative)}))); }
  private save() { if (!this.file) return; fs.mkdirSync(path.dirname(this.file), {recursive: true, mode: 0o700}); const temporary = `${this.file}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(this.evidence(), null, 2)}\n`, {mode: 0o600}); fs.renameSync(temporary, this.file); }
}

function mergeAmounts(previous: TokenAmounts, input: Partial<TokenAmounts>): TokenAmounts {
  const prior = normalizePersistedAmounts(previous), inputValue = valid(input.inputTokens), freshValue = valid(input.freshInputTokens), cachedValue = valid(input.cachedInputTokens), cacheWriteValue = valid(input.cacheWriteTokens), outputValue = valid(input.outputTokens), totalValue = valid(input.totalTokens), inputChanged = inputValue !== null && inputValue !== prior.inputTokens, outputChanged = outputValue !== null && outputValue !== prior.outputTokens;
  const next: TokenAmounts = {
    inputTokens: inputValue ?? prior.inputTokens,
    freshInputTokens: freshValue ?? (inputChanged ? null : prior.freshInputTokens),
    cachedInputTokens: cachedValue ?? (inputChanged ? null : prior.cachedInputTokens),
    cacheWriteTokens: cacheWriteValue ?? (inputChanged ? null : prior.cacheWriteTokens),
    outputTokens: outputValue ?? prior.outputTokens,
    totalTokens: totalValue ?? (inputChanged || outputChanged ? null : prior.totalTokens),
  };
  completeInputBreakdown(next);
  if (next.totalTokens === null && next.inputTokens !== null && next.outputTokens !== null) next.totalTokens = next.inputTokens + next.outputTokens;
  for (const [name, value] of Object.entries(next)) if (value !== null && prior[name as keyof TokenAmounts] !== null && value < prior[name as keyof TokenAmounts]!) throw new Error(`token_telemetry_cumulative_${name}_decreased`);
  return next;
}
function normalizePersistedAmounts(value: Partial<TokenAmounts> | undefined): TokenAmounts { const normalized: TokenAmounts = {inputTokens: valid(value?.inputTokens), freshInputTokens: valid(value?.freshInputTokens), cachedInputTokens: valid(value?.cachedInputTokens), cacheWriteTokens: valid(value?.cacheWriteTokens), outputTokens: valid(value?.outputTokens), totalTokens: valid(value?.totalTokens)}; completeInputBreakdown(normalized); if (normalized.totalTokens === null && normalized.inputTokens !== null && normalized.outputTokens !== null) normalized.totalTokens = normalized.inputTokens + normalized.outputTokens; return normalized; }
function completeInputBreakdown(value: TokenAmounts) {
  if (value.inputTokens === null && value.freshInputTokens !== null && value.cachedInputTokens !== null && value.cacheWriteTokens !== null) value.inputTokens = value.freshInputTokens + value.cachedInputTokens + value.cacheWriteTokens;
  if (value.inputTokens === null && value.cacheWriteTokens === null && value.freshInputTokens !== null && value.cachedInputTokens !== null) value.inputTokens = value.freshInputTokens + value.cachedInputTokens;
  if (value.inputTokens === null) return;
  const cached = value.cachedInputTokens ?? 0, written = value.cacheWriteTokens ?? 0;
  if (cached > value.inputTokens) throw new Error('token_telemetry_cached_input_exceeds_total_input');
  if (written > value.inputTokens || cached + written > value.inputTokens) throw new Error('token_telemetry_cache_write_exceeds_total_input');
  if (value.cachedInputTokens !== null && value.cacheWriteTokens !== null) {
    const derived = value.inputTokens - cached - written;
    if (value.freshInputTokens === null) value.freshInputTokens = derived;
    else if (value.freshInputTokens !== derived) throw new Error('token_telemetry_input_breakdown_mismatch');
    return;
  }
  if (value.cacheWriteTokens === null && value.cachedInputTokens !== null) {
    const maximumFresh = value.inputTokens - cached;
    if (value.freshInputTokens === null) value.freshInputTokens = maximumFresh;
    else if (value.freshInputTokens > maximumFresh) throw new Error('token_telemetry_input_breakdown_mismatch');
    return;
  }
  if (value.freshInputTokens !== null && value.cacheWriteTokens !== null && value.cachedInputTokens === null) {
    if (value.freshInputTokens + written > value.inputTokens) throw new Error('token_telemetry_input_breakdown_mismatch');
    value.cachedInputTokens = value.inputTokens - value.freshInputTokens - written;
  }
}
function routeKey(value: {providerId: string; accountProfileId?: string; modelId: string; nodeId?: string; providerExecutionNodeId?: string; credentialNodeId?: string}) { return `${value.providerId}\u0000${value.accountProfileId ?? ''}\u0000${value.modelId}\u0000${value.providerExecutionNodeId ?? value.nodeId ?? ''}\u0000${value.credentialNodeId ?? ''}`; }
function contextTrigger(thread: ThreadTokenRecord): RoutingTrigger { return {kind: 'CONTEXT_PRESSURE', code: thread.governor.reason, reason: thread.governor.reason, evidence: thread.latest.contextPercent === null ? [] : [`context_percent:${thread.latest.contextPercent}`]}; }
function normalizeTrigger(trigger: RoutingTrigger | undefined, thread: ThreadTokenRecord): RoutingTrigger {
  if (!trigger) return contextTrigger(thread);
  if (!['CONTEXT_PRESSURE', 'QUALITY_GATE', 'PROVIDER_FAILURE'].includes(trigger.kind) || !/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(trigger.code) || !trigger.reason.trim() || !Array.isArray(trigger.evidence) || trigger.evidence.some(item => typeof item !== 'string' || !item.trim())) throw new Error('token_routing_trigger_invalid');
  return clone(trigger);
}
function eligibleCandidates(thread: ThreadTokenRecord, assessment: RoutingAssessment) {
  const required = assessment.requiredCapabilities.map(normalizeCapabilityId);
  return assessment.candidates.filter(candidate => {
    const available = new Set(candidate.capabilities.map(normalizeCapabilityId));
    return candidate.qualified && required.every(capability => available.has(capability)) && routeKey(candidate) !== routeKey(thread);
  });
}
function decisionTarget(selected: TokenRoutingCandidate): NonNullable<TokenRoutingDecision['target']> { return {providerId: selected.providerId, ...(selected.accountProfileId ? {accountProfileId: selected.accountProfileId, accountLabel: selected.accountLabel, accountPlan: selected.accountPlan, accountPlanAuthority: selected.accountPlanAuthority, accountQualification: selected.accountQualification, accountAvailability: selected.accountAvailability} : {}), modelId: selected.modelId, ...(selected.nodeId ? {nodeId: selected.nodeId} : {}), ...(selected.workloadNodeId ? {workloadNodeId: selected.workloadNodeId} : {}), ...(selected.providerExecutionNodeId ? {providerExecutionNodeId: selected.providerExecutionNodeId} : {}), ...(selected.credentialNodeId ? {credentialNodeId: selected.credentialNodeId} : {})}; }
function validateAccountIdentity(value: AccountRouteIdentity) { for (const [name,node] of Object.entries({nodeId:value.nodeId,workloadNodeId:value.workloadNodeId,providerExecutionNodeId:value.providerExecutionNodeId,credentialNodeId:value.credentialNodeId})) if (node !== undefined && !/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(node)) throw new Error(`token_${name}_invalid`); if (value.accountProfileId !== undefined && !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(value.accountProfileId)) throw new Error('token_account_profile_identity_invalid'); if (value.accountProfileId === undefined && (value.accountLabel !== undefined || value.accountPlan !== undefined || value.accountPlanAuthority !== undefined || value.accountQualification !== undefined || value.accountAvailability !== undefined || value.credentialNodeId !== undefined)) throw new Error('token_account_profile_identity_invalid'); if (value.accountLabel !== undefined && (!value.accountLabel.trim() || value.accountLabel.length > 128 || /@/.test(value.accountLabel))) throw new Error('token_account_profile_label_invalid'); if (value.accountPlan !== undefined && (!value.accountPlan.trim() || value.accountPlan.length > 80 || /@/.test(value.accountPlan))) throw new Error('token_account_profile_plan_invalid'); if (value.accountPlanAuthority !== undefined && !['operator-configured','provider-reported'].includes(value.accountPlanAuthority)) throw new Error('token_account_profile_plan_authority_invalid'); if (value.accountQualification !== undefined && !['UNTESTED','QUALIFYING','QUALIFIED','DEGRADED','DISABLED','FAILED'].includes(value.accountQualification)) throw new Error('token_account_profile_qualification_invalid'); if (value.accountAvailability !== undefined && !['AVAILABLE','AUTH_REQUIRED','UNQUALIFIED','DEGRADED','DISABLED'].includes(value.accountAvailability)) throw new Error('token_account_profile_availability_invalid'); }
function mergeContext(previous: ContextOccupancy, input?: Partial<ContextOccupancy>): ContextOccupancy { if (!input) return previous; const authority = input.authority ?? previous.authority, tokens = input.tokens === undefined ? previous.tokens : valid(input.tokens), limitTokens = input.limitTokens === undefined ? previous.limitTokens : valid(input.limitTokens); if (authority === 'authoritative' && (tokens === null || limitTokens === null)) throw new Error('token_context_authoritative_values_required'); return {tokens, limitTokens, authority, source: input.source ?? previous.source}; }
function mergeCost(previous: CostEstimate, input?: Partial<CostEstimate>): CostEstimate { if (!input) return previous; return {amount: valid(input.amount) ?? previous.amount, currency: input.currency ?? previous.currency, authority: input.authority ?? previous.authority, source: input.source ?? previous.source}; }
function valid(value: unknown) { return validNumber(value) ? value : null; }
function actionFor(state: GovernorState): RoutingAction { return state === 'CONTINUE' || state === 'PREPARE_BATON' ? 'CONTINUE' : 'COMPACT_AND_CONTINUE'; }
function sum(left: number | null, right: number | null) { return left === null || right === null ? null : left + right; }
function aggregate(values: Array<number | null>) { return values.length && values.every((value): value is number => value !== null) ? values.reduce((total, value) => total + value, 0) : null; }
function digest(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function message(error: unknown) { return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, '_').slice(0, 160); }

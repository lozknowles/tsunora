import {legacyDecimal, accountingSchema, accountingIdentity, normalizeAttestedUsage, usageHash, type UsageAccounting} from './usage-accounting.js';
import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {redactSensitiveText} from './context-readers.js';
import {estimateTokens} from './token-aware-output.js';
import type {HarnessEfficiencyConfig} from './config.js';
import {calculateVersionedApiCost, type InvocationCostAccounting, type VersionedModelPricing} from './cost-accounting.js';
import type {CacheEvidence} from './cache-evidence.js';
import type {ExecutionResourceSummary} from './resource-telemetry.js';
import type {GovernedRuntimeBudget} from './runtime-budget.js';

export type HarnessProfileName = 'THIN' | 'STANDARD' | 'DEEP';
export type HarnessRoutingMode = 'OBSERVE' | 'ENFORCE' | 'EXPERIMENT';

export interface HarnessProfilePolicy {
  name: HarnessProfileName;
  maximumInitialContextTokens: number;
  maximumSources: number;
  maximumOptionalSkills: number;
  maximumTools: number;
  maximumTurns: number;
  allowBroadRepositoryContext: boolean;
  allowSharedContext: boolean;
  verificationRequired: true;
}

export const DEFAULT_HARNESS_PROFILES: Readonly<Record<HarnessProfileName, HarnessProfilePolicy>> = Object.freeze({
  THIN: Object.freeze({name: 'THIN', maximumInitialContextTokens: 4_096, maximumSources: 12, maximumOptionalSkills: 1, maximumTools: 6, maximumTurns: 3, allowBroadRepositoryContext: false, allowSharedContext: false, verificationRequired: true}),
  STANDARD: Object.freeze({name: 'STANDARD', maximumInitialContextTokens: 16_384, maximumSources: 48, maximumOptionalSkills: 4, maximumTools: 24, maximumTurns: 10, allowBroadRepositoryContext: false, allowSharedContext: true, verificationRequired: true}),
  DEEP: Object.freeze({name: 'DEEP', maximumInitialContextTokens: 65_536, maximumSources: 192, maximumOptionalSkills: 16, maximumTools: 64, maximumTurns: 32, allowBroadRepositoryContext: true, allowSharedContext: true, verificationRequired: true}),
});

export function configuredHarnessProfiles(config?: HarnessEfficiencyConfig): Readonly<Record<HarnessProfileName, HarnessProfilePolicy>> {
  const names: HarnessProfileName[] = ['THIN', 'STANDARD', 'DEEP'];
  return Object.freeze(Object.fromEntries(names.map(name => [name, Object.freeze({...DEFAULT_HARNESS_PROFILES[name], ...(config?.profiles?.[name] ?? {}), name, verificationRequired: true as const})])) as unknown as Record<HarnessProfileName, HarnessProfilePolicy>);
}

export function configuredHarnessProfileRouter(config?: HarnessEfficiencyConfig) {
  return new HarnessProfileRouter({mode: config?.routingMode === 'enforce' ? 'ENFORCE' : 'OBSERVE', minimumVerifiedRuns: config?.minimumVerifiedRuns ?? 10, minimumSuccessRate: config?.minimumSuccessRate ?? .9, minimumSameModelControlledRuns: config?.minimumSameModelControlledRuns ?? 10});
}

export type ContextPacketSourceKind =
  | 'system_instructions'
  | 'agent_control_instructions'
  | 'tool_schemas'
  | 'skills'
  | 'workspace_bootstrap'
  | 'memory_shared_context'
  | 'repository_instructions'
  | 'task_context'
  | 'conversation_history'
  | 'other';

export interface ContextPacketSource {
  id: string;
  kind: ContextPacketSourceKind;
  content?: string;
  estimatedTokens?: number;
  required?: boolean;
  persistent?: boolean;
  broad?: boolean;
  relevance: number;
  provenanceIds: string[];
  description?: string;
}

export interface ContextPacketEntry {
  id: string;
  kind: ContextPacketSourceKind;
  estimatedTokens: number;
  required: boolean;
  persistent: boolean;
  provenanceIds: string[];
  contentHash?: string;
}

export interface ContextPacketOmission {
  id: string;
  kind: ContextPacketSourceKind;
  estimatedTokens: number;
  reason: 'profile_filtered' | 'source_limit' | 'token_budget';
  provenanceIds: string[];
}

export interface ContextPacket {
  schema: 'agent-control.context-packet/v1';
  id: string;
  profile: HarnessProfileName;
  entries: ContextPacketEntry[];
  omitted: ContextPacketOmission[];
  estimatedTokens: number;
  startupContextTokens: number;
  taskContextTokens: number;
  historyTokens: number;
  sourceIds: string[];
  provenanceIds: string[];
  derived: true;
}

export class ContextPacketBuilder {
  constructor(readonly profiles: Readonly<Record<HarnessProfileName, HarnessProfilePolicy>> = DEFAULT_HARNESS_PROFILES) {}

  build(profileName: HarnessProfileName, sources: ContextPacketSource[], options: {availableContextTokens?: number} = {}): ContextPacket {
    const profile = this.profiles[profileName];
    if (options.availableContextTokens !== undefined && (!Number.isSafeInteger(options.availableContextTokens) || options.availableContextTokens < 1)) throw new Error('context_packet_available_budget_invalid');
    const maximumTokens = Math.min(profile.maximumInitialContextTokens, options.availableContextTokens ?? Number.POSITIVE_INFINITY);
    const normalized = sources.map(source => ({...source, estimatedTokens: source.estimatedTokens ?? estimateTokens(source.content ?? '')}));
    const duplicates = normalized.filter((source, index) => normalized.findIndex(item => item.id === source.id) !== index);
    if (duplicates.length) throw new Error(`context_packet_duplicate_source:${duplicates[0].id}`);
    if (normalized.some(source => source.relevance < 0 || source.relevance > 1)) throw new Error('context_packet_relevance_invalid');

    const permitted = normalized.filter(source => this.permitted(profile, source));
    const filtered = normalized.filter(source => !permitted.includes(source));
    const ordered = permitted.sort((left, right) => Number(right.required) - Number(left.required) || right.relevance - left.relevance || left.id.localeCompare(right.id));
    const entries: ContextPacketEntry[] = [];
    const omitted: ContextPacketOmission[] = filtered.map(source => this.omission(source, 'profile_filtered'));
    let tokens = 0;
    for (const source of ordered) {
      const entry = this.entry(source);
      if (entries.length >= profile.maximumSources) {
        if (source.required) throw new Error(`context_packet_required_source_limit:${source.id}`);
        omitted.push(this.omission(source, 'source_limit'));
        continue;
      }
      if (tokens + entry.estimatedTokens > maximumTokens) {
        if (source.required) throw new Error(`context_packet_required_budget_exceeded:${source.id}`);
        omitted.push(this.omission(source, 'token_budget'));
        continue;
      }
      entries.push(entry);
      tokens += entry.estimatedTokens;
    }
    const identity = {profile: profileName, entries: entries.map(entry => ({id: entry.id, kind: entry.kind, estimatedTokens: entry.estimatedTokens, contentHash: entry.contentHash})), omitted: omitted.map(item => ({id: item.id, reason: item.reason}))};
    const hash = createHash('sha256').update(stableJson(identity)).digest('hex');
    const startupKinds = new Set<ContextPacketSourceKind>(['system_instructions', 'agent_control_instructions', 'tool_schemas', 'skills', 'workspace_bootstrap', 'memory_shared_context', 'repository_instructions', 'other']);
    return {
      schema: 'agent-control.context-packet/v1', id: `context-${hash.slice(0, 20)}`, profile: profileName, entries, omitted,
      estimatedTokens: tokens,
      startupContextTokens: entries.filter(entry => entry.persistent && startupKinds.has(entry.kind)).reduce((sum, entry) => sum + entry.estimatedTokens, 0),
      taskContextTokens: entries.filter(entry => entry.kind === 'task_context').reduce((sum, entry) => sum + entry.estimatedTokens, 0),
      historyTokens: entries.filter(entry => entry.kind === 'conversation_history').reduce((sum, entry) => sum + entry.estimatedTokens, 0),
      sourceIds: entries.map(entry => entry.id),
      provenanceIds: [...new Set(entries.flatMap(entry => entry.provenanceIds))].sort(),
      derived: true,
    };
  }

  private permitted(profile: HarnessProfilePolicy, source: ContextPacketSource & {estimatedTokens: number}) {
    if (source.required) return true;
    if (profile.name === 'THIN' && (source.broad || source.kind === 'memory_shared_context' || source.kind === 'workspace_bootstrap')) return false;
    if (!profile.allowBroadRepositoryContext && source.broad) return false;
    if (!profile.allowSharedContext && source.kind === 'memory_shared_context') return false;
    return profile.name !== 'THIN' || source.relevance >= .75;
  }

  private entry(source: ContextPacketSource & {estimatedTokens: number}): ContextPacketEntry {
    return {id: source.id, kind: source.kind, estimatedTokens: source.estimatedTokens, required: Boolean(source.required), persistent: source.persistent ?? !['task_context', 'conversation_history'].includes(source.kind), provenanceIds: [...source.provenanceIds], ...(source.content === undefined ? {} : {contentHash: createHash('sha256').update(source.content).digest('hex')})};
  }

  private omission(source: ContextPacketSource & {estimatedTokens: number}, reason: ContextPacketOmission['reason']): ContextPacketOmission {
    return {id: source.id, kind: source.kind, estimatedTokens: source.estimatedTokens, reason, provenanceIds: [...source.provenanceIds]};
  }
}

export type ContextGraphNodeType = 'repository' | 'file' | 'symbol' | 'dependency' | 'service' | 'machine' | 'model' | 'provider' | 'test' | 'benchmark' | 'task' | 'failure' | 'fix' | 'decision' | 'documentation' | 'person_approved_rule';
export type ContextGraphRelation = 'DEPENDS_ON' | 'CALLS' | 'IMPLEMENTS' | 'TESTED_BY' | 'FAILED_WITH' | 'FIXED_BY' | 'RUNS_ON' | 'DEPLOYED_TO' | 'RELATED_TO' | 'SUPERSEDES' | 'VERIFIED_BY';

export interface ContextGraphNode {id: string; type: ContextGraphNodeType; label: string; summary?: string; metadata?: Record<string, unknown>; provenanceIds: string[]; verified?: boolean;}
export interface ContextGraphEdge {from: string; to: string; relation: ContextGraphRelation; provenanceIds: string[];}
export interface ContextGraphQuery {text?: string; types?: ContextGraphNodeType[]; limit?: number;}
export interface ContextGraphNeighbourhood {nodes: ContextGraphNode[]; edges: ContextGraphEdge[]; depth: number;}
export interface CompactGraphEvidence {nodeId: string; type: ContextGraphNodeType; label: string; summary?: string; score: number; provenanceIds: string[];}

export interface ContextGraph {
  findRelevantNodes(query: ContextGraphQuery): Promise<ContextGraphNode[]>;
  followRelationships(nodeIds: string[], relations?: ContextGraphRelation[]): Promise<ContextGraphEdge[]>;
  retrieveNeighbourhood(nodeIds: string[], depth: number): Promise<ContextGraphNeighbourhood>;
  rankEvidence(nodes: ContextGraphNode[], query?: string): Promise<Array<{node: ContextGraphNode; score: number}>>;
  compactEvidence(nodes: ContextGraphNode[], query?: string): Promise<CompactGraphEvidence[]>;
  recordProvenance(edge: ContextGraphEdge): Promise<void>;
  writeVerifiedKnowledge(node: ContextGraphNode, verificationRef: string): Promise<void>;
  recordRetrievedEvidence?(node: ContextGraphNode): Promise<void>;
}

export class InMemoryContextGraph implements ContextGraph {
  private readonly nodes = new Map<string, ContextGraphNode>();
  private readonly edges: ContextGraphEdge[] = [];

  constructor(nodes: ContextGraphNode[] = [], edges: ContextGraphEdge[] = []) {
    for (const node of nodes) this.nodes.set(node.id, structuredClone(node));
    for (const edge of edges) this.edges.push(structuredClone(edge));
  }

  async findRelevantNodes(query: ContextGraphQuery): Promise<ContextGraphNode[]> {
    const terms = query.text?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
    const eligible = [...this.nodes.values()].filter(node => !query.types?.length || query.types.includes(node.type));
    const ranked = await this.rankEvidence(eligible, query.text);
    return ranked.filter(item => !terms.length || item.score > 0).slice(0, query.limit ?? 20).map(item => structuredClone(item.node));
  }

  async followRelationships(nodeIds: string[], relations?: ContextGraphRelation[]): Promise<ContextGraphEdge[]> {
    const ids = new Set(nodeIds), allowed = relations ? new Set(relations) : undefined;
    return this.edges.filter(edge => (ids.has(edge.from) || ids.has(edge.to)) && (!allowed || allowed.has(edge.relation))).map(edge => structuredClone(edge));
  }

  async retrieveNeighbourhood(nodeIds: string[], depth: number): Promise<ContextGraphNeighbourhood> {
    if (!Number.isSafeInteger(depth) || depth < 0 || depth > 8) throw new Error('context_graph_depth_invalid');
    const seen = new Set(nodeIds), selectedEdges: ContextGraphEdge[] = [];
    let frontier = new Set(nodeIds);
    for (let level = 0; level < depth; level++) {
      const next = new Set<string>();
      for (const edge of this.edges) if (frontier.has(edge.from) || frontier.has(edge.to)) {
        if (!selectedEdges.some(item => stableJson(item) === stableJson(edge))) selectedEdges.push(structuredClone(edge));
        for (const id of [edge.from, edge.to]) if (!seen.has(id)) { seen.add(id); next.add(id); }
      }
      frontier = next;
    }
    return {nodes: [...seen].flatMap(id => this.nodes.has(id) ? [structuredClone(this.nodes.get(id)!)] : []), edges: selectedEdges, depth};
  }

  async rankEvidence(nodes: ContextGraphNode[], query = ''): Promise<Array<{node: ContextGraphNode; score: number}>> {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return nodes.map(node => { const haystack = `${node.label} ${node.summary ?? ''}`.toLowerCase(); const matches = terms.filter(term => haystack.includes(term)).length; return {node: structuredClone(node), score: terms.length ? matches / terms.length + (node.verified ? .1 : 0) : (node.verified ? 1 : .5)}; }).sort((left, right) => right.score - left.score || left.node.id.localeCompare(right.node.id));
  }

  async compactEvidence(nodes: ContextGraphNode[], query = ''): Promise<CompactGraphEvidence[]> {
    return (await this.rankEvidence(nodes, query)).map(item => ({nodeId: item.node.id, type: item.node.type, label: item.node.label, summary: item.node.summary, score: item.score, provenanceIds: [...item.node.provenanceIds]}));
  }

  async recordProvenance(edge: ContextGraphEdge): Promise<void> {
    if (!this.nodes.has(edge.from) || !this.nodes.has(edge.to)) throw new Error('context_graph_edge_node_missing');
    this.edges.push(structuredClone(edge));
  }

  async writeVerifiedKnowledge(node: ContextGraphNode, verificationRef: string): Promise<void> {
    if (!node.verified || !verificationRef.trim()) throw new Error('context_graph_verification_required');
    this.nodes.set(node.id, {...structuredClone(node), provenanceIds: [...new Set([...node.provenanceIds, verificationRef])]});
  }

  async recordRetrievedEvidence(node: ContextGraphNode): Promise<void> {
    if(!node.id.trim()||!node.provenanceIds.length)throw new Error('context_graph_retrieved_evidence_invalid');
    this.nodes.set(node.id,structuredClone(node));
  }
}

export interface HarnessOutcomeEvidence {
  verifiedRuns: number;
  verifiedSuccessRate: number;
  sameModelControlledRuns: number;
  productionQualified: boolean;
}

export interface HarnessRoutingSignals {
  taskId: string;
  complexity: number;
  risk: 'low' | 'medium' | 'high';
  knownExactTargets: boolean;
  estimatedFiles: number;
  deterministicVerifier: boolean;
  ambiguity: number;
  architectural: boolean;
  requestedProfile?: HarnessProfileName;
  evidence?: Partial<Record<HarnessProfileName, HarnessOutcomeEvidence>>;
}

export interface HarnessProfileDecision {
  recommendedProfile: HarnessProfileName;
  appliedProfile: HarnessProfileName;
  mode: HarnessRoutingMode;
  evidenceQualified: boolean;
  reasons: string[];
}

export interface HarnessRouterPolicy {mode: HarnessRoutingMode; minimumVerifiedRuns: number; minimumSuccessRate: number; minimumSameModelControlledRuns: number;}

export class HarnessProfileRouter {
  constructor(readonly policy: HarnessRouterPolicy = {mode: 'OBSERVE', minimumVerifiedRuns: 10, minimumSuccessRate: .9, minimumSameModelControlledRuns: 10}) {}

  route(signals: HarnessRoutingSignals): HarnessProfileDecision {
    if ([signals.complexity, signals.ambiguity].some(value => value < 0 || value > 1) || !Number.isSafeInteger(signals.estimatedFiles) || signals.estimatedFiles < 0) throw new Error('harness_routing_signals_invalid');
    const reasons: string[] = [];
    let recommended: HarnessProfileName;
    if (signals.requestedProfile) { recommended = signals.requestedProfile; reasons.push(`profile_requested:${recommended}`); }
    else if (signals.architectural || signals.complexity >= .75 || signals.ambiguity >= .7 || signals.estimatedFiles > 8 || signals.risk === 'high') { recommended = 'DEEP'; reasons.push('complexity_or_risk_requires_deep'); }
    else if (signals.risk === 'low' && signals.knownExactTargets && signals.estimatedFiles <= 2 && signals.deterministicVerifier && signals.complexity <= .35 && signals.ambiguity <= .25) { recommended = 'THIN'; reasons.push('bounded_task_with_deterministic_verifier'); }
    else { recommended = 'STANDARD'; reasons.push('insufficient_evidence_for_specialised_profile'); }
    const evidence = signals.evidence?.[recommended];
    const evidenceQualified = recommended === 'STANDARD' || Boolean(evidence?.productionQualified && evidence.verifiedRuns >= this.policy.minimumVerifiedRuns && evidence.verifiedSuccessRate >= this.policy.minimumSuccessRate && evidence.sameModelControlledRuns >= this.policy.minimumSameModelControlledRuns);
    const controlledExperiment = this.policy.mode === 'EXPERIMENT' && Boolean(signals.requestedProfile);
    const applied = controlledExperiment || (this.policy.mode === 'ENFORCE' && evidenceQualified) ? recommended : 'STANDARD';
    if (controlledExperiment) reasons.push('controlled_experiment_profile_applied');
    else if (applied !== recommended) reasons.push(this.policy.mode === 'OBSERVE' ? 'observational_mode_standard_applied' : 'profile_evidence_not_qualified');
    return {recommendedProfile: recommended, appliedProfile: applied, mode: this.policy.mode, evidenceQualified, reasons};
  }
}

export type HarnessEscalationReason = 'missing_context' | 'test_failure' | 'ambiguous_repository_state' | 'unexpected_dependency' | 'model_uncertainty' | 'verifier_rejection' | 'tool_limitation' | 'execution_failure';
export interface HarnessEscalationDecision {action: 'ESCALATE' | 'REVIEW'; from: HarnessProfileName; to?: HarnessProfileName; reason: HarnessEscalationReason; preserve: {contextPacketId?: string; checkpointRef?: string};}

export class HarnessEscalationController {
  next(current: HarnessProfileName, attempted: HarnessProfileName[], reason: HarnessEscalationReason, preserve: HarnessEscalationDecision['preserve'] = {}): HarnessEscalationDecision {
    const order: HarnessProfileName[] = ['THIN', 'STANDARD', 'DEEP'];
    const next = order.slice(order.indexOf(current) + 1).find(profile => !attempted.includes(profile));
    return next ? {action: 'ESCALATE', from: current, to: next, reason, preserve: structuredClone(preserve)} : {action: 'REVIEW', from: current, reason, preserve: structuredClone(preserve)};
  }
}

export type StartupContextComponentName = ContextPacketSourceKind;
export type MeasurementKind = 'provider_reported' | 'estimated' | 'unknown';
export interface StartupContextComponent {name: StartupContextComponentName; estimatedTokens: number | null; bytes: number | null; percentage: number | null; persistent: boolean; measurement: MeasurementKind; provenanceIds: string[];}
export interface StartupContextBreakdown {components: StartupContextComponent[]; startupContextTokens: number; taskContextTokens: number; conversationHistoryTokens: number; totalEstimatedContextTokens: number; repeatedContextCostEstimate: number; turns: number;}

export function measureStartupContext(sources: ContextPacketSource[], turns = 1): StartupContextBreakdown {
  if (!Number.isSafeInteger(turns) || turns < 1) throw new Error('startup_context_turns_invalid');
  const names: StartupContextComponentName[] = ['system_instructions', 'agent_control_instructions', 'tool_schemas', 'skills', 'workspace_bootstrap', 'memory_shared_context', 'repository_instructions', 'task_context', 'conversation_history', 'other'];
  const values = names.map(name => {
    const matching = sources.filter(source => source.kind === name);
    const tokens = matching.reduce((sum, source) => sum + (source.estimatedTokens ?? estimateTokens(source.content ?? '')), 0);
    const bytes = matching.reduce((sum, source) => sum + (source.content === undefined ? 0 : Buffer.byteLength(source.content, 'utf8')), 0);
    return {name, estimatedTokens: tokens, bytes, persistent: matching.some(source => source.persistent ?? !['task_context', 'conversation_history'].includes(name)), measurement: 'estimated' as const, provenanceIds: [...new Set(matching.flatMap(source => source.provenanceIds))]};
  });
  const total = values.reduce((sum, value) => sum + value.estimatedTokens, 0);
  const components = values.map(value => ({...value, percentage: total ? value.estimatedTokens / total * 100 : 0}));
  const startupKinds = new Set<StartupContextComponentName>(['system_instructions', 'agent_control_instructions', 'tool_schemas', 'skills', 'workspace_bootstrap', 'memory_shared_context', 'repository_instructions', 'other']);
  const startup = components.filter(component => component.persistent && startupKinds.has(component.name)).reduce((sum, component) => sum + (component.estimatedTokens ?? 0), 0);
  return {components, startupContextTokens: startup, taskContextTokens: components.find(component => component.name === 'task_context')?.estimatedTokens ?? 0, conversationHistoryTokens: components.find(component => component.name === 'conversation_history')?.estimatedTokens ?? 0, totalEstimatedContextTokens: total, repeatedContextCostEstimate: startup * turns, turns};
}

export interface NormalizedProviderUsage {
  inputTokens: number | null;
  freshInputTokens: number | null;
  cachedInputTokens: number | null;
  cacheWriteTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalProcessedTokens: number | null;
}

export function normalizeProviderUsage(raw: unknown): NormalizedProviderUsage {
  const input = metric(raw, ['input_tokens'], ['prompt_tokens'], ['inputTokens']);
  const cached = metric(raw, ['input_tokens_details', 'cached_tokens'], ['prompt_tokens_details', 'cached_tokens'], ['cache_read_input_tokens'], ['cached_input_tokens'], ['cachedInputTokens']);
  const openAiCacheWrite = metric(raw, ['input_tokens_details', 'cache_write_tokens']);
  const cacheWrite = openAiCacheWrite ?? metric(raw, ['cache_creation_input_tokens'], ['cache_write_input_tokens'], ['cacheWriteTokens']);
  const output = metric(raw, ['output_tokens'], ['completion_tokens'], ['outputTokens']);
  const reasoning = metric(raw, ['output_tokens_details', 'reasoning_tokens'], ['completion_tokens_details', 'reasoning_tokens'], ['reasoning_tokens'], ['reasoningTokens']);
  const reportedTotal = metric(raw, ['total_tokens'], ['totalTokens']);
  return {
    inputTokens: input,
    // Responses input_tokens_details reports cache reads and writes as
    // disjoint portions of input_tokens. Other provider aliases have not all
    // established that accounting contract, so retain their historical fresh
    // input derivation until their adapters can attest it.
    freshInputTokens: input !== null && cached !== null ? Math.max(0, input - cached - (openAiCacheWrite ?? 0)) : null,
    cachedInputTokens: cached,
    cacheWriteTokens: cacheWrite,
    outputTokens: output,
    reasoningTokens: reasoning,
    totalProcessedTokens: reportedTotal ?? (input !== null && output !== null ? input + output : null),
  };
}

export interface InvocationPricing {
  currency: string;
  freshInputPerMillionTokens: number;
  cachedInputPerMillionTokens?: number;
  cacheWritePerMillionTokens?: number;
  outputPerMillionTokens: number;
  reasoningPerMillionTokens?: number;
  fixedPerRequest?: number;
  source: string;
}

export function calculateInvocationCost(usage: NormalizedProviderUsage, pricing?: InvocationPricing): number | null {
  if (!pricing) return null;
  const fresh = usage.freshInputTokens;
  if (fresh === null || usage.outputTokens === null) return null;
  if ((usage.cachedInputTokens ?? 0) > 0 && pricing.cachedInputPerMillionTokens === undefined) return null;
  if ((usage.cacheWriteTokens ?? 0) > 0 && pricing.cacheWritePerMillionTokens === undefined) return null;
  if (usage.reasoningTokens !== null && pricing.reasoningPerMillionTokens === undefined && usage.reasoningTokens > 0) return null;
  return (pricing.fixedPerRequest ?? 0)
    + fresh * pricing.freshInputPerMillionTokens / 1_000_000
    + (usage.cachedInputTokens ?? 0) * (pricing.cachedInputPerMillionTokens ?? 0) / 1_000_000
    + (usage.cacheWriteTokens ?? 0) * (pricing.cacheWritePerMillionTokens ?? 0) / 1_000_000
    + usage.outputTokens * pricing.outputPerMillionTokens / 1_000_000
    + (usage.reasoningTokens ?? 0) * (pricing.reasoningPerMillionTokens ?? 0) / 1_000_000;
}

export type InvocationVerifierResult = 'UNKNOWN' | 'PASS' | 'FAIL';
export type InvocationFinalResult = 'UNKNOWN' | 'SUCCEEDED' | 'FAILED' | 'DEGRADED' | 'CANCELLED' | 'DISCONNECTED';
export type InvocationPhase = 'provider selected' | 'request sent' | 'waiting for provider' | 'response received' | 'processing' | 'verification' | 'complete';
export interface ContextCompilerInvocationRouting {
  initialTier: 'E2B' | 'E4B' | 'LUNA' | 'SOL';
  activeTier: 'E2B' | 'E4B' | 'LUNA' | 'SOL';
  sequence: Array<'E2B' | 'E4B' | 'LUNA' | 'SOL'>;
  stage: string;
  escalationReason?: string;
  compilerConfidence?: number;
  originalContextTokens?: number;
  contextPacketTokens?: number;
  retainedEvidenceIds: string[];
}

export interface ModelInvocationObservation {
  schema: 'agent-control.model-invocation/v1';
  accounting?: UsageAccounting;
  id: string;
  jobId: string;
  runId: string | null;
  stepId: string | null;
  taskId: string;
  laneId: string;
  model: string;
  provider: string;
  accountProfileId?: string;
  harnessProfile: HarnessProfileName;
  harnessId: string;
  executionStrategy: string;
  turnNumber: number;
  startedAt: string;
  completedAt: string | null;
  elapsedMs: number | null;
  state: 'RUNNING' | 'COMPLETE' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT';
  phase: InvocationPhase;
  phaseUpdatedAt?: string;
  startup: StartupContextBreakdown;
  usage: NormalizedProviderUsage;
  cacheEvidence?: CacheEvidence;
  providerReportedCost: number | null;
  calculatedCost: number | null;
  currency: string | null;
  /** Immutable per-invocation price/quota/energy evidence; absent for legacy records. */
  costAccounting?: InvocationCostAccounting;
  /** Optional measured execution resources. Values remain unavailable unless an adapter supplied evidence. */
  resources?: ExecutionResourceSummary;
  usageSource: 'provider-reported' | 'transport' | 'estimated' | 'unknown';
  costSource: 'reported' | 'estimated' | 'unknown';
  finishReason: string | null;
  toolCalls: number;
  toolIds: string[];
  agentId: string | null;
  filesContextSupplied: number | null;
  contextSourceIds: string[];
  retrievedContextTokens: number | null;
  repositoryContextTokens: number | null;
  conversationHistoryTokens: number;
  verifierResult: InvocationVerifierResult;
  finalJobResult: InvocationFinalResult;
  outcome: 'RUNNING' | 'COMPLETE' | 'FAILED' | 'CANCELLED';
  error: string | null;
  provenance: {recipeFingerprint: string; contextPacketId?: string; evidenceIds: string[]};
  routing?: ContextCompilerInvocationRouting;
  /** Resolved immutable execution budget; absent for legacy invocations. */
  runtimeBudget?: GovernedRuntimeBudget;
  providerTimings?: Record<string, number>;
}

export interface InvocationObservationInput {
  accounting?: UsageAccounting;
  id?: string;
  jobId: string;
  runId?: string;
  stepId?: string;
  taskId: string;
  laneId: string;
  model: string;
  provider: string;
  accountProfileId?: string;
  harnessProfile: HarnessProfileName;
  harnessId?: string;
  executionStrategy: string;
  turnNumber?: number;
  startedAt: string;
  completedAt: string;
  startupSources?: ContextPacketSource[];
  rawUsage?: unknown;
  cacheEvidence?: CacheEvidence;
  providerReportedCost?: number;
  pricing?: InvocationPricing;
  costAccounting?: InvocationCostAccounting;
  resources?: ExecutionResourceSummary;
  toolIds?: string[];
  filesContextSupplied?: number;
  agentId?: string;
  retrievedContextTokens?: number;
  repositoryContextTokens?: number;
  contextSourceIds?: string[];
  outcome?: ModelInvocationObservation['outcome'];
  error?: string;
  recipeFingerprint: string;
  contextPacketId?: string;
  evidenceIds?: string[];
  finishReason?: string;
  phase?: InvocationPhase;
  routing?: ContextCompilerInvocationRouting;
  runtimeBudget?: GovernedRuntimeBudget;
  providerTimings?: Record<string, number>;
}

export function createInvocationObservation(input: InvocationObservationInput): ModelInvocationObservation {
  const accounting=input.accounting ? accountingSchema.parse(input.accounting) : undefined;
  const nativeAccounting=accounting??accountingSchema.parse({schema:'agent-control.usage-accounting/v1',revision:0,parentInvocationId:null,retryOfInvocationId:null,parcelId:null,batonId:null,providerRequestId:null,modelRevision:null,runtime:null,runtimeVersion:null,machine:null,hardware:null,jobType:null,executionKind:'UNKNOWN',provenance:{kind:'NATIVE',source:'invocation-adapter-unattested',sourceVersion:'1',migrationVersion:null,at:input.startedAt},semantics:{id:'unattested/v1',input:'UNKNOWN',reasoning:'UNKNOWN',total:'PROVIDER_ONLY',billing:'UNKNOWN'},evidence:{input:metric(input.rawUsage,['input_tokens'],['prompt_tokens'],['inputTokens']),cached:metric(input.rawUsage,['input_tokens_details','cached_tokens'],['prompt_tokens_details','cached_tokens'],['cache_read_input_tokens'],['cachedInputTokens']),cacheWrite:metric(input.rawUsage,['cache_creation_input_tokens'],['input_tokens_details','cache_write_tokens'],['cacheWriteTokens']),output:metric(input.rawUsage,['output_tokens'],['completion_tokens'],['outputTokens']),reasoning:metric(input.rawUsage,['output_tokens_details','reasoning_tokens'],['completion_tokens_details','reasoning_tokens'],['reasoningTokens']),total:metric(input.rawUsage,['total_tokens'],['totalTokens'])},pricing:null,reportedCost:input.providerReportedCost!==undefined&&input.pricing?.currency?{amount:legacyDecimal(input.providerReportedCost),currency:input.pricing.currency,source:'provider-reported'}:null});
  const usage = accounting ? normalizeAttestedUsage(accounting.evidence,accounting.semantics) : normalizeProviderUsage(input.rawUsage);
  const started = Date.parse(input.startedAt), completed = Date.parse(input.completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) throw new Error('invocation_timestamp_invalid');
  const turnNumber = input.turnNumber ?? 1;
  const startup = measureStartupContext(input.startupSources ?? [], turnNumber);
  const versionedPricing: VersionedModelPricing | undefined = input.costAccounting?.cloud?.pricingBasis;
  const calculatedCost = versionedPricing ? calculateVersionedApiCost(usage, versionedPricing) : calculateInvocationCost(usage, input.pricing);
  return {
    schema: 'agent-control.model-invocation/v1', accounting:nativeAccounting, id: input.id ?? `inv-${randomUUID()}`, jobId: input.jobId, runId: input.runId ?? null, stepId: input.stepId ?? null, taskId: input.taskId, laneId: input.laneId,
    model: input.model, provider: input.provider, ...(input.accountProfileId ? {accountProfileId: input.accountProfileId} : {}), harnessProfile: input.harnessProfile, harnessId: input.harnessId ?? 'adaptive-harness', executionStrategy: input.executionStrategy, turnNumber,
    startedAt: input.startedAt, completedAt: input.completedAt, elapsedMs: completed - started, state: input.outcome === 'CANCELLED' || /cancel/i.test(input.error ?? '') ? 'CANCELLED' : /timeout|timed out/i.test(input.error ?? '') ? 'TIMED_OUT' : input.outcome === 'FAILED' ? 'FAILED' : 'COMPLETE', phase: input.phase ?? 'complete', phaseUpdatedAt: input.completedAt,
    startup, usage, ...(input.cacheEvidence ? {cacheEvidence: structuredClone(input.cacheEvidence)} : {}),
    providerReportedCost: input.providerReportedCost ?? null,
    calculatedCost, currency: versionedPricing?.currency ?? input.pricing?.currency ?? null,
    ...(input.costAccounting ? {costAccounting: structuredClone(input.costAccounting)} : {}),
    ...(input.resources ? {resources: structuredClone(input.resources)} : {}),
    usageSource: Object.values(usage).some(value => typeof value === 'number') ? 'provider-reported' : 'unknown',
    costSource: input.providerReportedCost !== undefined ? 'reported' : calculatedCost !== null ? 'estimated' : 'unknown', finishReason: input.finishReason ?? null,
    toolCalls: input.toolIds?.length ?? 0, toolIds: [...(input.toolIds ?? [])], agentId: input.agentId ?? null, filesContextSupplied: input.filesContextSupplied ?? null, contextSourceIds: [...(input.contextSourceIds ?? [])],
    retrievedContextTokens: input.retrievedContextTokens ?? null, repositoryContextTokens: input.repositoryContextTokens ?? null, conversationHistoryTokens: startup.conversationHistoryTokens,
    verifierResult: 'UNKNOWN', finalJobResult: 'UNKNOWN', outcome: input.outcome ?? 'COMPLETE', error: input.error === undefined ? null : boundedRedactedError(input.error),
    provenance: {recipeFingerprint: input.recipeFingerprint, ...(input.contextPacketId ? {contextPacketId: input.contextPacketId} : {}), evidenceIds: [...(input.evidenceIds ?? [])]},
    ...(input.routing ? {routing: structuredClone(input.routing)} : {}),
    ...(input.runtimeBudget ? {runtimeBudget: structuredClone(input.runtimeBudget)} : {}),
    ...(input.providerTimings ? {providerTimings: structuredClone(input.providerTimings)} : {}),
  };
}

export interface InvocationStartInput {
  id?: string; jobId: string; runId?: string; stepId?: string; taskId: string; laneId: string; model: string; provider: string;
  harnessProfile: HarnessProfileName; executionStrategy: string; startedAt: string; recipeFingerprint: string; contextPacketId?: string;
  routing?: ContextCompilerInvocationRouting;
  runtimeBudget?: GovernedRuntimeBudget;
}

export function createInvocationStart(input: InvocationStartInput): ModelInvocationObservation {
  if (!Number.isFinite(Date.parse(input.startedAt))) throw new Error('invocation_timestamp_invalid');
  return {
    schema: 'agent-control.model-invocation/v1', id: input.id ?? `inv-${randomUUID()}`, jobId: input.jobId, runId: input.runId ?? null, stepId: input.stepId ?? null,
    taskId: input.taskId, laneId: input.laneId, model: input.model, provider: input.provider, harnessProfile: input.harnessProfile, harnessId: 'adaptive-harness', executionStrategy: input.executionStrategy,
    turnNumber: 1, startedAt: input.startedAt, completedAt: null, elapsedMs: null, state: 'RUNNING', phase: 'request sent', phaseUpdatedAt: input.startedAt, startup: measureStartupContext([], 1), usage: normalizeProviderUsage(undefined),
    providerReportedCost: null, calculatedCost: null, currency: null, usageSource: 'unknown', costSource: 'unknown', finishReason: null, toolCalls: 0, toolIds: [], agentId: null,
    filesContextSupplied: null, contextSourceIds: [], retrievedContextTokens: null, repositoryContextTokens: null, conversationHistoryTokens: 0, verifierResult: 'UNKNOWN', finalJobResult: 'UNKNOWN',
    outcome: 'RUNNING', error: null, provenance: {recipeFingerprint: input.recipeFingerprint, ...(input.contextPacketId ? {contextPacketId: input.contextPacketId} : {}), evidenceIds: []},
    ...(input.routing ? {routing: structuredClone(input.routing)} : {}),
    ...(input.runtimeBudget ? {runtimeBudget: structuredClone(input.runtimeBudget)} : {}),
  };
}

function normalizedPersistedInvocation(record: ModelInvocationObservation): ModelInvocationObservation {
  const usageKnown = Object.values(record.usage).some(value => typeof value === 'number');
  return {
    ...record, usage: {...record.usage, cacheWriteTokens: record.usage.cacheWriteTokens ?? null}, stepId: record.stepId ?? null, completedAt: record.completedAt ?? null, elapsedMs: record.elapsedMs ?? null,
    state: record.state ?? (record.outcome === 'FAILED' ? 'FAILED' : record.outcome === 'CANCELLED' ? 'CANCELLED' : 'COMPLETE'), phase: record.phase ?? 'complete', phaseUpdatedAt: record.phaseUpdatedAt ?? record.completedAt ?? record.startedAt,
    usageSource: record.usageSource ?? (usageKnown ? 'provider-reported' : 'unknown'), costSource: record.costSource ?? (record.providerReportedCost !== null ? 'reported' : record.calculatedCost !== null ? 'estimated' : 'unknown'),
    finishReason: record.finishReason ?? null,
    ...(record.resources ? {resources: structuredClone(record.resources)} : {}),
  };
}

export interface EfficiencyAggregate {
  invocations: number;
  jobs: number;
  verifiedSuccesses: number;
  verifierFailures: number;
  modelTurns: number;
  totalProcessedTokens: number | null;
  freshInputTokens: number | null;
  cachedInputTokens: number | null;
  cacheWriteTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  elapsedMs: number;
  providerReportedCost: number | null;
  calculatedCost: number | null;
  currency: string | null;
  cacheEffectiveness: number | null;
  tokensPerVerifiedOutcome: number | null;
  freshTokensPerVerifiedOutcome: number | null;
  turnsPerVerifiedOutcome: number | null;
  timePerVerifiedOutcomeMs: number | null;
  costPerVerifiedOutcome: number | null;
  unknownMetricInvocations: number;
}

export interface HarnessEfficiencyMetrics {
  schema: 'agent-control.harness-efficiency-metrics/v1';
  overall: EfficiencyAggregate;
  byProfile: Record<string, EfficiencyAggregate>;
  byProvider: Record<string, EfficiencyAggregate>;
  byModel: Record<string, EfficiencyAggregate>;
  byLane: Record<string, EfficiencyAggregate>;
  byJob: Record<string, EfficiencyAggregate>;
  escalationRate: number | null;
  observedAt: string;
}

export interface HarnessEfficiencyLedgerPort {
  record(observation: ModelInvocationObservation): string;
  complete(id: string, observation: ModelInvocationObservation): string;
  setPhase(ids: string[], phase: Exclude<InvocationPhase, 'complete'>): void;
  finalizePending(ids: string[], outcome: 'FAILED' | 'CANCELLED', error: string, finishReason: string, completedAt?: string): void;
  markVerification(ids: string[], result: Exclude<InvocationVerifierResult, 'UNKNOWN'>, finalResult?: InvocationFinalResult): void;
  markFinalResult(ids: string[], finalResult: Exclude<InvocationFinalResult, 'UNKNOWN'>): void;
  list(): ModelInvocationObservation[];
  metrics(): HarnessEfficiencyMetrics;
  usageHistory?(): {excludedIds:string[];events:UsageResetEvent[]};
  resetUsage?(confirmation:string,expectedDigest:string,actor:string):UsageResetEvent;
}

export interface UsageResetEvent {id:string;at:string;actor:string;count:number;digest:string;kind:'USAGE_VISIBILITY_RESET';}
export class MemoryHarnessEfficiencyLedger implements HarnessEfficiencyLedgerPort {
  protected history:{excludedIds:string[];events:UsageResetEvent[]}={excludedIds:[],events:[]};
  usageHistory(){return structuredClone(this.history);}
  resetUsage(confirmation:string,expectedDigest:string,actor:string){const ids=this.list().map(r=>r.id).sort(),digest=usageHash(ids);if(confirmation!=='RESET USAGE HISTORY'||expectedDigest!==digest||!actor)throw Error('usage_reset_confirmation_required');const event:UsageResetEvent={id:`usage-reset-${randomUUID()}`,at:new Date().toISOString(),actor,count:ids.length,digest,kind:'USAGE_VISIBILITY_RESET'};this.history={excludedIds:ids,events:[...this.history.events,event]};return structuredClone(event);}
  reviseUsage(id:string,value:UsageAccounting){const a=accountingSchema.parse(value),current=this.records.get(id);if(!current?.accounting)throw Error('usage_native_identity_required');if(accountingIdentity(a)!==accountingIdentity(current.accounting)||JSON.stringify([a.semantics,a.pricing,a.localApiChargeKnownZero])!==JSON.stringify([current.accounting.semantics,current.accounting.pricing,current.accounting.localApiChargeKnownZero]))throw Error('usage_identity_immutable');if(a.revision<current.accounting.revision)throw Error('usage_revision_stale');if(a.revision===current.accounting.revision){if(usageHash(a)!==usageHash(current.accounting))throw Error('usage_revision_conflict');return id;}this.records.set(id,{...current,accounting:a,usage:normalizeAttestedUsage(a.evidence,a.semantics)});return id;}
  protected readonly records = new Map<string, ModelInvocationObservation>();
  record(observation: ModelInvocationObservation): string { if(observation.accounting){const a=accountingSchema.parse(observation.accounting);if(a.parentInvocationId===observation.id||a.retryOfInvocationId===observation.id)throw Error('usage_self_parent');if(a.retryOfInvocationId&&!this.records.has(a.retryOfInvocationId))throw Error('usage_retry_parent_missing');if(a.providerRequestId&&this.list().some(r=>r.provider===observation.provider&&r.accountProfileId===observation.accountProfileId&&r.accounting?.providerRequestId===a.providerRequestId))throw Error('usage_provider_request_duplicate');} if (this.records.has(observation.id)) throw new Error(`invocation_exists:${observation.id}`); this.records.set(observation.id, structuredClone(observation)); return observation.id; }
  complete(id: string, observation: ModelInvocationObservation): string {
    const current = this.records.get(id); if (!current) throw new Error(`invocation_missing:${id}`);
    if(current.accounting && (!observation.accounting || accountingIdentity(current.accounting)!==accountingIdentity(observation.accounting) || observation.accounting.revision<current.accounting.revision))throw Error('usage_identity_immutable');
    const elapsedMs = observation.completedAt === null ? observation.elapsedMs : Math.max(0, Date.parse(observation.completedAt) - Date.parse(current.startedAt));
    this.records.set(id, structuredClone({...observation, id, jobId: current.jobId, runId: current.runId, stepId: observation.stepId ?? current.stepId, taskId: current.taskId, laneId: current.laneId, startedAt: current.startedAt, elapsedMs})); return id;
  }
  setPhase(ids: string[], phase: Exclude<InvocationPhase, 'complete'>): void { const phaseUpdatedAt = new Date().toISOString(); for (const id of ids) { const current = this.records.get(id); if (!current) throw new Error(`invocation_missing:${id}`); if (current.phase !== 'complete') this.records.set(id, {...current, phase, phaseUpdatedAt}); } }
  finalizePending(ids: string[], outcome: 'FAILED' | 'CANCELLED', error: string, finishReason: string, completedAt = new Date().toISOString()): void { for (const id of ids) { const current = this.records.get(id); if (!current) throw new Error(`invocation_missing:${id}`); if (current.state !== 'RUNNING') continue; const elapsedMs = Math.max(0, Date.parse(completedAt) - Date.parse(current.startedAt)); this.records.set(id, {...current, completedAt, elapsedMs, state: outcome === 'CANCELLED' ? 'CANCELLED' : /timeout|timed out/i.test(error) ? 'TIMED_OUT' : 'FAILED', phase: 'complete', phaseUpdatedAt: completedAt, outcome, error: boundedRedactedError(error), finishReason}); } }
  markVerification(ids: string[], result: Exclude<InvocationVerifierResult, 'UNKNOWN'>, finalResult: InvocationFinalResult = 'UNKNOWN'): void { const phaseUpdatedAt = new Date().toISOString(); for (const id of ids) { const current = this.records.get(id); if (!current) throw new Error(`invocation_missing:${id}`); this.records.set(id, {...current, phase: finalResult === 'UNKNOWN' ? 'verification' : 'complete', phaseUpdatedAt, verifierResult: result, finalJobResult: finalResult}); } }
  markFinalResult(ids: string[], finalResult: Exclude<InvocationFinalResult, 'UNKNOWN'>): void { const phaseUpdatedAt = new Date().toISOString(); for (const id of ids) { const current = this.records.get(id); if (!current) throw new Error(`invocation_missing:${id}`); this.records.set(id, {...current, phase: 'complete', phaseUpdatedAt, finalJobResult: finalResult}); } }
  list(): ModelInvocationObservation[] { return [...this.records.values()].map(record => structuredClone(record)); }
  metrics(): HarnessEfficiencyMetrics {
    const records = this.list();
    const group = (selector: (record: ModelInvocationObservation) => string) => Object.fromEntries([...new Set(records.map(selector))].sort().map(key => [key, aggregate(records.filter(record => selector(record) === key))]));
    const jobs = new Map<string, Set<HarnessProfileName>>();
    for (const record of records) { const set = jobs.get(record.jobId) ?? new Set<HarnessProfileName>(); set.add(record.harnessProfile); jobs.set(record.jobId, set); }
    const escalatedJobs = [...jobs.values()].filter(profiles => profiles.size > 1).length;
    return {schema: 'agent-control.harness-efficiency-metrics/v1', overall: aggregate(records), byProfile: group(record => record.harnessProfile), byProvider: group(record => record.provider), byModel: group(record => record.model), byLane: group(record => record.laneId), byJob: group(record => record.jobId), escalationRate: jobs.size ? escalatedJobs / jobs.size : null, observedAt: new Date().toISOString()};
  }
}

export class FileHarnessEfficiencyLedger extends MemoryHarnessEfficiencyLedger {
  constructor(readonly file: string) {
    super();
    if (fs.existsSync(file)) {
      const value = JSON.parse(fs.readFileSync(file, 'utf8')) as {schema: string; records: ModelInvocationObservation[]};
      if (value.schema !== 'agent-control.harness-efficiency-ledger/v1') throw new Error('harness_efficiency_ledger_schema_unsupported');
      this.history=(value as typeof value & {usageHistory?:{excludedIds:string[];events:UsageResetEvent[]}}).usageHistory??this.history;
      for (const record of value.records) this.records.set(record.id, structuredClone(normalizedPersistedInvocation(record)));
    }
  }
  override reviseUsage(id:string,value:UsageAccounting){const result=super.reviseUsage(id,value);this.save();return result;}
  override resetUsage(confirmation:string,digest:string,actor:string){const event=super.resetUsage(confirmation,digest,actor);this.save();return event;}
  override record(observation: ModelInvocationObservation): string { const id = super.record(observation); this.save(); return id; }
  override complete(id: string, observation: ModelInvocationObservation): string { const result = super.complete(id, observation); this.save(); return result; }
  override setPhase(ids: string[], phase: Exclude<InvocationPhase, 'complete'>): void { super.setPhase(ids, phase); this.save(); }
  override finalizePending(ids: string[], outcome: 'FAILED' | 'CANCELLED', error: string, finishReason: string, completedAt?: string): void { super.finalizePending(ids, outcome, error, finishReason, completedAt); this.save(); }
  override markVerification(ids: string[], result: Exclude<InvocationVerifierResult, 'UNKNOWN'>, finalResult: InvocationFinalResult = 'UNKNOWN'): void { super.markVerification(ids, result, finalResult); this.save(); }
  override markFinalResult(ids: string[], finalResult: Exclude<InvocationFinalResult, 'UNKNOWN'>): void { super.markFinalResult(ids, finalResult); this.save(); }
  private save() { fs.mkdirSync(path.dirname(this.file), {recursive: true}); const temporary = `${this.file}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify({schema: 'agent-control.harness-efficiency-ledger/v1', records: this.list(), usageHistory:this.history}, null, 2)}\n`, {mode: 0o600}); fs.renameSync(temporary, this.file); }
}

export interface HarnessStrategyIdentity {modelId: string; providerId: string; profile: HarnessProfileName; contextStrategyId: string; promptVersion: string; toolIds: string[]; skillIds: string[];}
export function harnessStrategyFingerprint(strategy: HarnessStrategyIdentity) { return createHash('sha256').update(stableJson({...strategy, toolIds: [...strategy.toolIds].sort(), skillIds: [...strategy.skillIds].sort()})).digest('hex'); }

function aggregate(records: ModelInvocationObservation[]): EfficiencyAggregate {
  const jobs = new Set(records.map(record => record.jobId));
  const successes = new Set(records.filter(record => record.verifierResult === 'PASS' && record.finalJobResult === 'SUCCEEDED').map(record => record.jobId));
  const verifierFailures = new Set(records.filter(record => record.verifierResult === 'FAIL').map(record => record.jobId)).size;
  const complete = (selector: (record: ModelInvocationObservation) => number | null | undefined) => records.length > 0 && records.every(record => typeof selector(record) === 'number') ? records.reduce((sum, record) => sum + (selector(record) ?? 0), 0) : null;
  const total = complete(record => record.usage.totalProcessedTokens), fresh = complete(record => record.usage.freshInputTokens), cached = complete(record => record.usage.cachedInputTokens), cacheWrite = complete(record => record.usage.cacheWriteTokens), output = complete(record => record.usage.outputTokens), reasoning = complete(record => record.usage.reasoningTokens);
  const providerCost = complete(record => record.providerReportedCost), calculatedCost = complete(record => record.calculatedCost);
  const currencies = [...new Set(records.map(record => record.currency).filter((value): value is string => value !== null))];
  const cost = providerCost ?? calculatedCost;
  return {
    invocations: records.length, jobs: jobs.size, verifiedSuccesses: successes.size, verifierFailures, modelTurns: records.length, totalProcessedTokens: total, freshInputTokens: fresh, cachedInputTokens: cached, cacheWriteTokens: cacheWrite, outputTokens: output, reasoningTokens: reasoning,
    elapsedMs: records.reduce((sum, record) => sum + (record.elapsedMs ?? 0), 0), providerReportedCost: providerCost, calculatedCost, currency: currencies.length === 1 ? currencies[0] : null,
    cacheEffectiveness: fresh !== null && cached !== null && fresh + cached + (cacheWrite ?? 0) > 0 ? cached / (fresh + cached + (cacheWrite ?? 0)) : null,
    tokensPerVerifiedOutcome: ratio(total, successes.size), freshTokensPerVerifiedOutcome: ratio(fresh, successes.size), turnsPerVerifiedOutcome: successes.size ? records.length / successes.size : null,
    timePerVerifiedOutcomeMs: successes.size ? records.reduce((sum, record) => sum + (record.elapsedMs ?? 0), 0) / successes.size : null, costPerVerifiedOutcome: ratio(cost, successes.size),
    unknownMetricInvocations: records.filter(record => [record.usage.totalProcessedTokens, record.usage.freshInputTokens, record.usage.cachedInputTokens, record.providerReportedCost, record.calculatedCost].some(value => value === null)).length,
  };
}

function ratio(value: number | null, denominator: number) { return value === null || denominator === 0 ? null : value / denominator; }
function metric(raw: unknown, ...paths: string[][]): number | null { for (const item of paths) { let value = raw; for (const part of item) { if (!value || typeof value !== 'object' || Array.isArray(value)) { value = undefined; break; } value = (value as Record<string, unknown>)[part]; } if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value; } return null; }
function boundedRedactedError(value: string) { const redacted = redactSensitiveText(value); return redacted.length <= 2_048 ? redacted : `${redacted.slice(0, 2_045)}...`; }
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`; return JSON.stringify(value); }

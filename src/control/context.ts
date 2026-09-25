import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {saveWorkspace, type Baton, type LaneState, type WorkspaceState} from '../state.js';

export type ContextSourceType =
  | 'openai_shared_thread'
  | 'openai_chatkit_thread'
  | 'chatgpt_work_thread'
  | 'codex_thread'
  | 'github_pr'
  | 'github_issue'
  | 'git_commit'
  | 'artifact'
  | 'test_report'
  | 'web_url'
  | 'local_file'
  | (string & {});

export type EvidenceClassification =
  | 'verified_executable'
  | 'repository_evidence'
  | 'external_authoritative'
  | 'agent_observation'
  | 'agent_interpretation'
  | 'unsupported_assertion';

export type AccessibilityStatus =
  | 'available'
  | 'inaccessible'
  | 'authentication_required'
  | 'expired'
  | 'deleted'
  | 'unsupported'
  | 'unknown';

export type ContextRetentionMode = 'reference_only' | 'ephemeral_extract';

export interface ContextRetentionPolicy {
  mode: ContextRetentionMode;
  expiresAt?: string;
}

export interface ContextSource {
  id: string;
  type: ContextSourceType;
  provider?: string;
  url?: string;
  localRef?: string;
  originatingLaneId: number;
  originatingAgent?: string;
  originatingProvider?: string;
  originatingModel?: string;
  taskId: string;
  repository?: string;
  branch?: string;
  commitSha?: string;
  createdAt: string;
  description: string;
  classification: EvidenceClassification;
  accessibility: AccessibilityStatus;
  estimatedTokens?: number;
  retention?: ContextRetentionPolicy;
  fingerprint: string;
}

export type ContextSourceInput = Omit<ContextSource, 'id' | 'createdAt' | 'fingerprint'> & {
  id?: string;
  createdAt?: string;
};

export interface EvidenceRecord {
  id: string;
  taskId: string;
  classification: EvidenceClassification;
  description: string;
  sourceId?: string;
  repository?: string;
  commitSha?: string;
  testName?: string;
  result?: 'passed' | 'failed' | 'observed';
  createdAt: string;
}

export interface AgentConclusion {
  id: string;
  taskId: string;
  laneId: number;
  agentId: string;
  provider?: string;
  model?: string;
  claim: string;
  confidence: number;
  evidenceIds: string[];
  contextSourceIds: string[];
  independent: boolean;
  createdAt: string;
}

export interface ConsensusDecision {
  id: string;
  taskId: string;
  judgeLaneId: number;
  conclusionIds: string[];
  selectedConclusionId: string;
  conclusion: string;
  agreements: string[];
  disagreements: string[];
  dissentingConclusionIds: string[];
  finalConfidence: number;
  contextTier: ContextTier;
  provenanceNodeId: string;
  createdAt: string;
}

export type ProvenanceNodeKind = 'decision' | 'conclusion' | 'context_source' | 'evidence' | 'commit' | 'test';
export interface ProvenanceNode {id: string; kind: ProvenanceNodeKind; refId: string; label: string; metadata?: Record<string, unknown>}
export interface ProvenanceEdge {from: string; to: string; relation: 'derived_from' | 'supported_by' | 'context_in' | 'refers_to' | 'disagrees_with'}

export type ContextTier = 1 | 2 | 3 | 4;
export interface ContextAccessRecord {
  id: string;
  taskId: string;
  laneId: number;
  tier: ContextTier;
  reason: string;
  contextSourceIds: string[];
  evidenceIds: string[];
  estimatedTokens: number;
  createdAt: string;
}

interface ContextSnapshot {
  version: 1;
  savedAt: string;
  sources: ContextSource[];
  evidence: EvidenceRecord[];
  conclusions: AgentConclusion[];
  decisions: ConsensusDecision[];
  provenanceNodes: ProvenanceNode[];
  provenanceEdges: ProvenanceEdge[];
  access: ContextAccessRecord[];
}

const trustWeight: Record<EvidenceClassification, number> = {
  verified_executable: 1,
  repository_evidence: .85,
  external_authoritative: .75,
  agent_observation: .5,
  agent_interpretation: .25,
  unsupported_assertion: .05,
};

export class ContextStore {
  private sources = new Map<string, ContextSource>();
  private evidence = new Map<string, EvidenceRecord>();
  private conclusions = new Map<string, AgentConclusion>();
  private decisions = new Map<string, ConsensusDecision>();
  private provenanceNodes = new Map<string, ProvenanceNode>();
  private provenanceEdges: ProvenanceEdge[] = [];
  private access: ContextAccessRecord[] = [];

  constructor(readonly file = path.resolve(process.env.AGENT_CONTROL_STATE_DIR || '.agent-control', 'context.json')) {}

  static load(file?: string): ContextStore {
    const store = new ContextStore(file);
    if (!fs.existsSync(store.file)) return store;
    const snapshot = JSON.parse(fs.readFileSync(store.file, 'utf8')) as ContextSnapshot;
    if (snapshot.version !== 1) throw new Error('unsupported_context_snapshot');
    for (const item of snapshot.sources) store.sources.set(item.id, item);
    for (const item of snapshot.evidence) store.evidence.set(item.id, item);
    for (const item of snapshot.conclusions) store.conclusions.set(item.id, item);
    for (const item of snapshot.decisions) store.decisions.set(item.id, item);
    for (const item of snapshot.provenanceNodes) store.provenanceNodes.set(item.id, item);
    store.provenanceEdges = snapshot.provenanceEdges;
    store.access = snapshot.access ?? [];
    return store;
  }

  attachSource(input: ContextSourceInput): {source: ContextSource; created: boolean} {
    const ref = validateAndNormalizeReference(input);
    const fingerprint = createHash('sha256').update(JSON.stringify({type: input.type, taskId: input.taskId, ref})).digest('hex');
    const duplicate = [...this.sources.values()].find(source => source.fingerprint === fingerprint);
    if (duplicate) return {source: duplicate, created: false};
    const source: ContextSource = {
      ...input,
      ...ref,
      id: input.id ?? `ctx-${randomUUID()}`,
      createdAt: input.createdAt ?? new Date().toISOString(),
      fingerprint,
    };
    if (this.sources.has(source.id)) throw new Error('context_source_id_exists');
    this.sources.set(source.id, source);
    this.node('context_source', source.id, source.description, {type: source.type, provider: source.provider});
    this.save();
    return {source, created: true};
  }

  setAccessibility(sourceId: string, accessibility: AccessibilityStatus): ContextSource {
    const source = this.mustSource(sourceId);
    const updated = {...source, accessibility};
    this.sources.set(sourceId, updated);
    this.save();
    return updated;
  }

  addEvidence(input: Omit<EvidenceRecord, 'id' | 'createdAt'> & {id?: string; createdAt?: string}): EvidenceRecord {
    if (input.sourceId) this.mustSource(input.sourceId);
    const item: EvidenceRecord = {...input, id: input.id ?? `ev-${randomUUID()}`, createdAt: input.createdAt ?? new Date().toISOString()};
    this.evidence.set(item.id, item);
    const evidenceNode = this.node('evidence', item.id, item.description, {classification: item.classification, result: item.result});
    if (item.sourceId) this.edge(evidenceNode.id, nodeId('context_source', item.sourceId), 'context_in');
    if (item.commitSha) {
      const commit = this.node('commit', item.commitSha, item.commitSha, {repository: item.repository});
      this.edge(evidenceNode.id, commit.id, 'refers_to');
    }
    if (item.testName) {
      const test = this.node('test', item.id, item.testName, {result: item.result});
      this.edge(evidenceNode.id, test.id, 'supported_by');
    }
    this.save();
    return item;
  }

  addConclusion(input: Omit<AgentConclusion, 'id' | 'createdAt'> & {id?: string; createdAt?: string}): AgentConclusion {
    for (const id of input.evidenceIds) this.mustEvidence(id);
    for (const id of input.contextSourceIds) this.mustSource(id);
    const conclusion: AgentConclusion = {
      ...input,
      confidence: clamp(input.confidence),
      id: input.id ?? `con-${randomUUID()}`,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    this.conclusions.set(conclusion.id, conclusion);
    const conclusionNode = this.node('conclusion', conclusion.id, conclusion.claim, {laneId: conclusion.laneId, agentId: conclusion.agentId, provider: conclusion.provider, model: conclusion.model});
    for (const id of conclusion.evidenceIds) this.edge(conclusionNode.id, nodeId('evidence', id), 'supported_by');
    for (const id of conclusion.contextSourceIds) this.edge(conclusionNode.id, nodeId('context_source', id), 'context_in');
    this.save();
    return conclusion;
  }

  recordDecision(decision: ConsensusDecision): ConsensusDecision {
    this.decisions.set(decision.id, decision);
    this.save();
    return decision;
  }

  recordAccess(input: Omit<ContextAccessRecord, 'id' | 'createdAt'>): ContextAccessRecord {
    const item: ContextAccessRecord = {...input, id: `access-${randomUUID()}`, createdAt: new Date().toISOString()};
    this.access.push(item);
    this.save();
    return item;
  }

  findSources(taskId: string, laneId?: number, baton?: Baton): ContextSource[] {
    const referenced = new Set(baton?.contextSourceIds ?? []);
    return [...this.sources.values()].filter(source => source.taskId === taskId && (laneId === undefined || source.originatingLaneId === laneId || referenced.has(source.id)));
  }

  taskEvidence(taskId: string): EvidenceRecord[] { return [...this.evidence.values()].filter(item => item.taskId === taskId); }
  taskConclusions(taskId: string): AgentConclusion[] { return [...this.conclusions.values()].filter(item => item.taskId === taskId); }
  getSource(id: string): ContextSource | undefined { return this.sources.get(id); }
  getEvidence(id: string): EvidenceRecord | undefined { return this.evidence.get(id); }
  getConclusion(id: string): AgentConclusion | undefined { return this.conclusions.get(id); }
  getDecision(id: string): ConsensusDecision | undefined { return this.decisions.get(id); }
  accessHistory(taskId: string): ContextAccessRecord[] { return this.access.filter(item => item.taskId === taskId); }

  assessCommit(source: ContextSource, currentCommit?: string): 'current' | 'stale' | 'unbound' {
    if (!source.commitSha || !currentCommit) return 'unbound';
    return source.commitSha === currentCommit ? 'current' : 'stale';
  }

  traceDecision(decisionId: string): {nodes: ProvenanceNode[]; edges: ProvenanceEdge[]} {
    const decision = this.decisions.get(decisionId);
    if (!decision) throw new Error('consensus_decision_missing');
    const wanted = new Set<string>([decision.provenanceNodeId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of this.provenanceEdges) if (wanted.has(edge.from) && !wanted.has(edge.to)) { wanted.add(edge.to); changed = true; }
    }
    return {nodes: [...wanted].map(id => this.provenanceNodes.get(id)).filter((node): node is ProvenanceNode => Boolean(node)), edges: this.provenanceEdges.filter(edge => wanted.has(edge.from) && wanted.has(edge.to))};
  }

  createDecisionNode(decisionId: string, label: string, metadata?: Record<string, unknown>): ProvenanceNode {
    return this.node('decision', decisionId, label, metadata);
  }

  linkDecision(decisionNodeId: string, conclusion: AgentConclusion, selected: boolean) {
    this.edge(decisionNodeId, nodeId('conclusion', conclusion.id), selected ? 'derived_from' : 'disagrees_with');
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), {recursive: true});
    const snapshot: ContextSnapshot = {
      version: 1,
      savedAt: new Date().toISOString(),
      sources: [...this.sources.values()],
      evidence: [...this.evidence.values()],
      conclusions: [...this.conclusions.values()],
      decisions: [...this.decisions.values()],
      provenanceNodes: [...this.provenanceNodes.values()],
      provenanceEdges: this.provenanceEdges,
      access: this.access,
    };
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(snapshot, null, 2)}\n`, {mode: 0o600});
    fs.renameSync(temp, this.file);
  }

  private node(kind: ProvenanceNodeKind, refId: string, label: string, metadata?: Record<string, unknown>): ProvenanceNode {
    const id = nodeId(kind, refId);
    const existing = this.provenanceNodes.get(id);
    if (existing) return existing;
    const node = {id, kind, refId, label, metadata};
    this.provenanceNodes.set(id, node);
    return node;
  }

  private edge(from: string, to: string, relation: ProvenanceEdge['relation']) {
    if (!this.provenanceEdges.some(edge => edge.from === from && edge.to === to && edge.relation === relation)) this.provenanceEdges.push({from, to, relation});
  }

  private mustSource(id: string): ContextSource { const item = this.sources.get(id); if (!item) throw new Error('context_source_missing'); return item; }
  private mustEvidence(id: string): EvidenceRecord { const item = this.evidence.get(id); if (!item) throw new Error('evidence_missing'); return item; }
}

export class LaneContextService {
  constructor(
    readonly state: WorkspaceState,
    readonly store: ContextStore,
    private readonly persist: (state: WorkspaceState) => void = saveWorkspace,
  ) {}

  attach(laneId: number, input: Omit<ContextSourceInput, 'originatingLaneId'>): {source: ContextSource; created: boolean} {
    const lane = this.mustLane(laneId);
    const attached = this.store.attachSource({...input, originatingLaneId: laneId});
    const ids = new Set(lane.baton.contextSourceIds ?? []);
    ids.add(attached.source.id);
    lane.baton = {...lane.baton, contextSourceIds: [...ids], revision: lane.baton.revision + (attached.created ? 1 : 0), updatedAt: new Date().toISOString()};
    this.persist(this.state);
    return attached;
  }

  discover(laneId: number, taskId: string): ContextSource[] {
    const lane = this.mustLane(laneId);
    return this.store.findSources(taskId, laneId, lane.baton);
  }

  private mustLane(id: number): LaneState { const lane = this.state.lanes.find(item => item.id === id); if (!lane) throw new Error('lane_missing'); return lane; }
}

export interface ContextRoutingRequest {
  taskId: string;
  laneId: number;
  baton: Baton;
  currentCommit?: string;
  complexity: 'low' | 'medium' | 'high';
  urgency: 'low' | 'normal' | 'high';
  confidence: number;
  disputed: boolean;
  modelContextCapacity: number;
  reservedPromptTokens: number;
  maxContextTokens: number;
  tokenCostPerThousand: number;
  maxMonetaryCost: number;
  maxAddedLatencyMs: number;
}

export interface ContextSelection {
  tier: ContextTier;
  reason: string;
  contextSourceIds: string[];
  evidenceIds: string[];
  omitted: Array<{sourceId: string; reason: string}>;
  warnings: string[];
  estimatedTokens: number;
  estimatedCost: number;
}

export type ProgressiveContextPurpose = 'discover' | 'locate_matches' | 'inspect_selected' | 'verify_complete';
export interface ProgressiveContextRepresentation {
  level: 0 | 1 | 2 | 3;
  kind: 'summary' | 'index' | 'selected_context' | 'full_artifact';
  estimatedTokens: number;
  available: boolean;
  authoritative: boolean;
}
export interface ProgressiveContextRequest {
  handle: string;
  purpose: ProgressiveContextPurpose;
  remainingContextTokens: number;
  representations: ProgressiveContextRepresentation[];
}
export interface ProgressiveContextSelection {
  handle: string;
  representation: ProgressiveContextRepresentation;
  fitsBudget: boolean;
  reason: string;
}

export class ContextRouter {
  constructor(readonly store: ContextStore) {}

  select(request: ContextRoutingRequest): ContextSelection {
    const confidence = clamp(request.confidence);
    let tier: ContextTier = 1;
    let reason = 'baton_is_minimum_sufficient_context';
    if (request.complexity !== 'low' || confidence < .8 || request.disputed) { tier = 2; reason = 'repository_evidence_required'; }
    if (request.complexity === 'high' || confidence < .6 || request.disputed) { tier = 3; reason = 'relevant_shared_context_required'; }

    const evidence = tier >= 2 ? this.store.taskEvidence(request.taskId) : [];
    const candidates = this.store.findSources(request.taskId, undefined, request.baton);
    const omitted: ContextSelection['omitted'] = [];
    const warnings: string[] = [];
    const selected: ContextSource[] = [];
    const tokenLimit = Math.max(0, Math.min(request.maxContextTokens, request.modelContextCapacity - request.reservedPromptTokens));
    let tokens = 0;
    let cost = 0;

    if (tier >= 3) {
      const ranked = candidates.sort((left, right) => sourceScore(this.store, right, request.currentCommit) - sourceScore(this.store, left, request.currentCommit));
      for (const source of ranked) {
        if (source.accessibility !== 'available') { omitted.push({sourceId: source.id, reason: `source_${source.accessibility}`}); continue; }
        const commit = this.store.assessCommit(source, request.currentCommit);
        if (commit === 'stale') warnings.push(`stale_commit:${source.id}:${source.commitSha}`);
        const nextTokens = source.estimatedTokens ?? 1200;
        const nextCost = nextTokens / 1000 * request.tokenCostPerThousand;
        if (tokens + nextTokens > tokenLimit) { omitted.push({sourceId: source.id, reason: 'token_budget'}); continue; }
        if (cost + nextCost > request.maxMonetaryCost) { omitted.push({sourceId: source.id, reason: 'monetary_budget'}); continue; }
        if ((selected.length + 1) * 250 > request.maxAddedLatencyMs && request.urgency === 'high') { omitted.push({sourceId: source.id, reason: 'latency_budget'}); continue; }
        selected.push(source); tokens += nextTokens; cost += nextCost;
      }
    }

    const selection: ContextSelection = {tier, reason, contextSourceIds: selected.map(source => source.id), evidenceIds: evidence.map(item => item.id), omitted, warnings, estimatedTokens: tokens, estimatedCost: cost};
    this.store.recordAccess({taskId: request.taskId, laneId: request.laneId, tier, reason, contextSourceIds: selection.contextSourceIds, evidenceIds: selection.evidenceIds, estimatedTokens: tokens});
    return selection;
  }

  escalate(previous: ContextSelection, reason: string): ContextSelection {
    const tier = Math.min(4, previous.tier + 1) as ContextTier;
    return {...previous, tier, reason: `escalated:${reason}`};
  }

  /** Selects a derived command-result view without changing the authoritative artifact. */
  selectProgressive(request: ProgressiveContextRequest): ProgressiveContextSelection {
    if (!request.handle.trim() || !Number.isSafeInteger(request.remainingContextTokens) || request.remainingContextTokens < 0) throw new Error('progressive_context_request_invalid');
    const requiredLevel: Record<ProgressiveContextPurpose, 0 | 1 | 2 | 3> = {discover: 0, locate_matches: 1, inspect_selected: 2, verify_complete: 3};
    const level = requiredLevel[request.purpose];
    const eligible = request.representations.filter(item => item.available && item.level >= level).sort((left, right) => left.level - right.level || left.estimatedTokens - right.estimatedTokens);
    const selected = eligible[0];
    if (!selected) throw new Error('progressive_context_representation_unavailable');
    const fitsBudget = selected.estimatedTokens <= request.remainingContextTokens;
    return {
      handle: request.handle,
      representation: structuredClone(selected),
      fitsBudget,
      reason: fitsBudget ? `minimum_sufficient_${selected.kind}` : `${selected.kind}_exceeds_context_budget_use_artifact_reference`,
    };
  }
}

export interface ContextReadRequest {query?: string; sectionHints?: string[]}
export interface ContextReadResult {sourceId: string; text: string; tokens: number; sections?: string[]}
export interface ContextSourceReader {read(source: ContextSource, maxTokens: number, request?: ContextReadRequest): Promise<ContextReadResult>}

export async function loadSelectedContext(store: ContextStore, selection: ContextSelection, reader: ContextSourceReader, request: ContextReadRequest = {}): Promise<{materials: ContextReadResult[]; failures: Array<{sourceId: string; error: string}>}> {
  const materials: ContextReadResult[] = [], failures: Array<{sourceId: string; error: string}> = [];
  for (const id of selection.contextSourceIds) {
    const source = store.getSource(id);
    if (!source || source.accessibility !== 'available') { failures.push({sourceId: id, error: source ? `source_${source.accessibility}` : 'source_missing'}); continue; }
    try { materials.push(await reader.read(source, Math.max(1, selection.estimatedTokens), request)); }
    catch (error) { failures.push({sourceId: id, error: error instanceof Error ? error.message : String(error)}); }
  }
  return {materials, failures};
}

export class ConsensusJudge {
  constructor(readonly store: ContextStore) {}

  synthesize(taskId: string, judgeLaneId: number, conclusionIds: string[], contextTier: ContextTier): ConsensusDecision {
    const conclusions = conclusionIds.map(id => this.store.getConclusion(id)).filter((item): item is AgentConclusion => Boolean(item));
    if (conclusions.length !== conclusionIds.length || conclusions.length < 2) throw new Error('consensus_conclusions_missing');
    if (conclusions.some(item => item.taskId !== taskId)) throw new Error('consensus_task_mismatch');
    if (conclusions.some(item => !item.independent)) throw new Error('consensus_independence_required');
    if (new Set(conclusions.map(item => item.laneId)).size !== conclusions.length) throw new Error('consensus_duplicate_lane');
    const groups = new Map<string, AgentConclusion[]>();
    for (const conclusion of conclusions) {
      const key = normalizeClaim(conclusion.claim);
      groups.set(key, [...(groups.get(key) ?? []), conclusion]);
    }
    const ranked = [...groups.values()].map(items => ({items, score: items.reduce((sum, item) => sum + conclusionWeight(this.store, item), 0)})).sort((left, right) => right.score - left.score);
    const selected = ranked[0].items.sort((left, right) => conclusionWeight(this.store, right) - conclusionWeight(this.store, left))[0];
    const total = ranked.reduce((sum, group) => sum + group.score, 0);
    const evidenceQuality = bestEvidenceWeight(this.store, selected);
    const finalConfidence = clamp((ranked[0].score / Math.max(total, .0001)) * (.5 + evidenceQuality / 2));
    const dissent = conclusions.filter(item => normalizeClaim(item.claim) !== normalizeClaim(selected.claim));
    const id = `decision-${randomUUID()}`;
    const decisionNode = this.store.createDecisionNode(id, selected.claim, {judgeLaneId, contextTier});
    for (const conclusion of conclusions) this.store.linkDecision(decisionNode.id, conclusion, conclusion.id === selected.id || normalizeClaim(conclusion.claim) === normalizeClaim(selected.claim));
    const decision: ConsensusDecision = {
      id, taskId, judgeLaneId, conclusionIds,
      selectedConclusionId: selected.id,
      conclusion: selected.claim,
      agreements: ranked.filter(group => group.items.length > 1).map(group => group.items[0].claim),
      disagreements: dissent.map(item => item.claim),
      dissentingConclusionIds: dissent.map(item => item.id),
      finalConfidence,
      contextTier,
      provenanceNodeId: decisionNode.id,
      createdAt: new Date().toISOString(),
    };
    return this.store.recordDecision(decision);
  }
}

function validateAndNormalizeReference(input: ContextSourceInput): Pick<ContextSource, 'url' | 'localRef'> {
  if (Boolean(input.url) === Boolean(input.localRef)) throw new Error('context_source_requires_one_reference');
  if (input.localRef) {
    if (/\0|\r|\n/.test(input.localRef)) throw new Error('invalid_local_reference');
    return {localRef: input.localRef};
  }
  const parsed = new URL(input.url!);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported_context_url_scheme');
  if (parsed.username || parsed.password) throw new Error('context_url_credentials_forbidden');
  for (const key of parsed.searchParams.keys()) if (/token|auth|key|secret|session|credential|signature/i.test(key)) throw new Error('context_url_sensitive_parameter_forbidden');
  parsed.hash = '';
  return {url: parsed.toString()};
}

function sourceScore(store: ContextStore, source: ContextSource, currentCommit?: string): number {
  const commit = store.assessCommit(source, currentCommit);
  return trustWeight[source.classification] * 100 + (commit === 'current' ? 20 : commit === 'stale' ? -20 : 0);
}

function bestEvidenceWeight(store: ContextStore, conclusion: AgentConclusion): number {
  return Math.max(.05, ...conclusion.evidenceIds.map(id => trustWeight[store.getEvidence(id)?.classification ?? 'unsupported_assertion']));
}

function conclusionWeight(store: ContextStore, conclusion: AgentConclusion): number { return conclusion.confidence * bestEvidenceWeight(store, conclusion); }
function normalizeClaim(value: string): string { return value.trim().toLowerCase().replace(/\s+/g, ' '); }
function nodeId(kind: ProvenanceNodeKind, refId: string): string { return `${kind}:${refId}`; }
function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }

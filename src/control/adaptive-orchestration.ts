import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Evidence is deliberately typed so benchmark, qualification and production outcomes cannot be silently mixed. */
export type AdaptiveEvidenceKind = 'BENCHMARK' | 'QUALIFICATION' | 'PRODUCTION_WORK_PARCEL';
export type AdaptiveTaskClass = 'coding' | 'debugging' | 'repository-review' | 'reasoning' | 'tool-use' | 'long-context' | 'test-generation' | 'repair' | 'critique' | 'structured-output' | 'other' | string;
export type AdaptiveOutcome = 'SUCCEEDED' | 'FAILED' | 'REVIEW_REQUIRED' | 'REPAIRED' | 'ESCALATED' | 'PROVIDER_FAILURE' | 'INFRASTRUCTURE_FAILURE' | 'POLICY_BLOCKED' | 'CANCELLED' | 'INSUFFICIENT_EVIDENCE';
export type AdaptiveDecisionNodeKind = 'REQUEST' | 'CLASSIFICATION' | 'REQUIRED_CAPABILITIES' | 'POLICY' | 'ELIGIBLE_CANDIDATES' | 'LEAGUE_EVIDENCE' | 'TRADEOFF' | 'ROUTE' | 'EXECUTION' | 'QUALITY_GATE' | 'VERIFICATION' | 'REVIEW' | 'REPAIR' | 'EVIDENCE_UPDATE' | 'ESCALATION';
export type AdaptiveNodeStatus = 'OBSERVED' | 'PASSED' | 'REJECTED' | 'SELECTED' | 'EXCLUDED';

export interface AdaptiveRouteIdentity {
  providerId: string;
  modelId: string;
  accountProfileId?: string | null;
  nodeId?: string | null;
  modelVersion?: string | null;
  location?: 'local' | 'remote';
}

export interface AdaptiveRouteCandidate {
  route: AdaptiveRouteIdentity;
  eligible: boolean;
  reasons: string[];
  capabilities?: string[];
  estimatedCost?: number | null;
  costAuthority?: 'authoritative' | 'estimated' | 'unavailable';
  latencyMs?: number | null;
  availability?: 'available' | 'unavailable' | 'unknown';
  declaredOrder?: number;
}

export interface AdaptiveWorkflowCandidate {
  id: string;
  version?: string | null;
  eligible: boolean;
  reasons: string[];
  estimatedCost?: number | null;
  costAuthority?: 'authoritative' | 'estimated' | 'unavailable';
  latencyMs?: number | null;
  declaredOrder?: number;
}

export interface AdaptiveLeagueFilter {
  capability?: string;
  providerId?: string;
  modelId?: string;
  modelVersion?: string;
  location?: 'local' | 'remote';
  evidenceKind?: AdaptiveEvidenceKind;
  minQuality?: number;
  maxAgeDays?: number;
  sort?: 'quality' | 'cost' | 'latency' | 'reliability' | 'confidence' | 'samples' | 'recent';
}

export interface AdaptiveOrchestrationConfig {
  enabled?: boolean;
  minimumSamplesForPreference?: number;
  minimumQualityScore?: number;
  maxEvidenceAgeDays?: number;
  policyQualityFloor?: number;
  maxRouteCost?: number | null;
  maxRouteLatencyMs?: number | null;
  qualityWeight?: number;
  reliabilityWeight?: number;
  costWeight?: number;
  latencyWeight?: number;
  confidenceWeight?: number;
  explorationRate?: number;
}

export interface AdaptivePolicy {
  enabled: boolean;
  minimumSamplesForPreference: number;
  minimumQualityScore: number;
  maxEvidenceAgeDays: number;
  policyQualityFloor: number;
  maxRouteCost: number | null;
  maxRouteLatencyMs: number | null;
  qualityWeight: number;
  reliabilityWeight: number;
  costWeight: number;
  latencyWeight: number;
  confidenceWeight: number;
  explorationRate: number;
}

export interface AdaptiveUsage {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  cachedInputTokens?: number | null;
  localComputeCost?: number | null;
}

export interface AdaptiveOutcomeInput {
  decisionId: string;
  parcelId: string;
  observationId?: string;
  stageId?: string;
  taskClass?: AdaptiveTaskClass;
  route?: AdaptiveRouteIdentity;
  capabilities?: string[];
  workflow?: {id: string; version?: string | null};
  evidenceKind: AdaptiveEvidenceKind;
  outcome: AdaptiveOutcome;
  verified: boolean;
  qualityScore?: number | null;
  qualityGatePass?: boolean | null;
  firstPass?: boolean | null;
  retryCount?: number;
  escalationCount?: number;
  latencyMs?: number | null;
  usage?: AdaptiveUsage;
  cost?: number | null;
  currency?: string | null;
  costAuthority?: 'authoritative' | 'estimated' | 'unavailable';
  localComputeCost?: number | null;
  localCostAuthority?: 'authoritative' | 'estimated' | 'unavailable';
  failureClass?: 'model' | 'workflow' | 'provider' | 'infrastructure' | 'policy' | 'cancel' | 'insufficient-evidence';
  observedAt?: string;
}

interface AdaptiveEvidenceObservation {
  id: string;
  decisionId: string;
  parcelId: string;
  stageId: string | null;
  taskClass: string;
  evidenceKind: AdaptiveEvidenceKind;
  route: AdaptiveRouteIdentity | null;
  capabilities: string[];
  workflow: {id: string; version: string | null} | null;
  outcome: AdaptiveOutcome;
  verified: boolean;
  countsTowardQuality: boolean;
  qualityScore: number | null;
  qualityGatePass: boolean | null;
  firstPass: boolean | null;
  retryCount: number;
  escalationCount: number;
  latencyMs: number | null;
  usage: Required<AdaptiveUsage>;
  cost: number | null;
  currency: string | null;
  costAuthority: 'authoritative' | 'estimated' | 'unavailable';
  localComputeCost: number | null;
  localCostAuthority: 'authoritative' | 'estimated' | 'unavailable';
  failureClass: AdaptiveOutcomeInput['failureClass'] | null;
  observedAt: string;
}

type DecisionFactValue = string | number | boolean | null | string[] | number[];
export type DecisionFact = DecisionFactValue | Record<string, DecisionFactValue> | Array<DecisionFactValue | Record<string, DecisionFactValue>>;
export interface AdaptiveDecisionNode {
  id: string;
  at: string;
  parentId?: string;
  stageId?: string;
  kind: AdaptiveDecisionNodeKind;
  status: AdaptiveNodeStatus;
  facts: Record<string, DecisionFact>;
}

export interface AdaptiveSelection {
  route?: AdaptiveRouteIdentity;
  workflow?: {id: string; version: string | null};
  score: number;
  reason: string;
  evidenceSample: number;
  sparseEvidence: boolean;
}

export interface AdaptiveDecisionRecord {
  schema: 'agent-control.adaptive-decision/v1';
  id: string;
  parcelId: string;
  createdAt: string;
  updatedAt: string;
  request: {
    objectiveFingerprint: string;
    taskClass: string;
    requiredCapabilities: string[];
    policy: AdaptivePolicy;
    workflowId: string | null;
  };
  nodes: AdaptiveDecisionNode[];
  routeHistory: Array<{at: string; stageId: string | null; route: AdaptiveRouteIdentity | null; status: 'selected' | 'rejected' | 'observed'; reason: string; score?: number; evidenceSample?: number}>;
  selectedRoute?: AdaptiveSelection;
  selectedWorkflow?: AdaptiveSelection;
  outcomes: Array<{id: string; at: string; stageId: string | null; route: AdaptiveRouteIdentity | null; workflow: {id: string; version: string | null} | null; outcome: AdaptiveOutcome; verified: boolean; countsTowardQuality: boolean; failureClass: AdaptiveOutcomeInput['failureClass'] | null}>;
}

export interface ModelCapabilityLeagueRow {
  taskClass: string;
  route: AdaptiveRouteIdentity;
  capabilities: string[];
  capabilityScores: Record<string, number>;
  successRate: number | null;
  qualityScore: number | null;
  qualityGatePassRate: number | null;
  firstPassRate: number | null;
  retryRate: number | null;
  escalationRate: number | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCost: number | null;
  currency: string | null;
  costAuthority: 'authoritative' | 'estimated' | 'unavailable';
  localComputeCost: number | null;
  localCostAuthority: 'authoritative' | 'estimated' | 'unavailable';
  cacheEfficiency: number | null;
  reliability: number | null;
  operationalFailureRate: number | null;
  sampleSize: number;
  totalObservations: number;
  confidence: number;
  evidenceAgeDays: number | null;
  trend: 'improving' | 'stable' | 'declining' | 'unknown';
  evidenceKinds: Record<AdaptiveEvidenceKind, number>;
  modelVersion: string | null;
}

export interface WorkflowLeagueRow extends Omit<ModelCapabilityLeagueRow, 'route' | 'capabilities' | 'capabilityScores' | 'modelVersion'> {
  workflow: {id: string; version: string | null};
}

export interface AdaptiveOrchestrationSnapshot {
  version: 1;
  decisions: AdaptiveDecisionRecord[];
  modelEvidence: AdaptiveEvidenceObservation[];
  workflowEvidence: AdaptiveEvidenceObservation[];
}

export interface AdaptiveOrchestrationStore {
  load(): AdaptiveOrchestrationSnapshot;
  save(snapshot: AdaptiveOrchestrationSnapshot): void;
}

const DEFAULT_POLICY: AdaptivePolicy = {
  enabled: true,
  minimumSamplesForPreference: 3,
  minimumQualityScore: .7,
  maxEvidenceAgeDays: 90,
  policyQualityFloor: .6,
  maxRouteCost: null,
  maxRouteLatencyMs: null,
  qualityWeight: .5,
  reliabilityWeight: .2,
  costWeight: .15,
  latencyWeight: .1,
  confidenceWeight: .05,
  explorationRate: .1,
};

const operationalOutcomes = new Set<AdaptiveOutcome>(['PROVIDER_FAILURE', 'INFRASTRUCTURE_FAILURE', 'POLICY_BLOCKED', 'CANCELLED', 'INSUFFICIENT_EVIDENCE']);
const qualityOutcomes = new Set<AdaptiveOutcome>(['SUCCEEDED', 'FAILED', 'REVIEW_REQUIRED', 'REPAIRED']);
const evidenceWeight: Record<AdaptiveEvidenceKind, number> = {BENCHMARK: .6, QUALIFICATION: .8, PRODUCTION_WORK_PARCEL: 1};

export class MemoryAdaptiveOrchestrationStore implements AdaptiveOrchestrationStore {
  private snapshot: AdaptiveOrchestrationSnapshot = {version: 1, decisions: [], modelEvidence: [], workflowEvidence: []};
  load() { return structuredClone(this.snapshot); }
  save(snapshot: AdaptiveOrchestrationSnapshot) { this.snapshot = structuredClone(snapshot); }
}

export class FileAdaptiveOrchestrationStore implements AdaptiveOrchestrationStore {
  constructor(readonly file: string) {}
  load(): AdaptiveOrchestrationSnapshot {
    if (!fs.existsSync(this.file)) return {version: 1, decisions: [], modelEvidence: [], workflowEvidence: []};
    const value = JSON.parse(fs.readFileSync(this.file, 'utf8')) as AdaptiveOrchestrationSnapshot;
    if (value.version !== 1 || !Array.isArray(value.decisions) || !Array.isArray(value.modelEvidence) || !Array.isArray(value.workflowEvidence)) throw new Error('adaptive_orchestration_snapshot_invalid');
    return structuredClone(value);
  }
  save(snapshot: AdaptiveOrchestrationSnapshot) {
    fs.mkdirSync(path.dirname(this.file), {recursive: true});
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, {encoding: 'utf8', mode: 0o600});
    fs.renameSync(temporary, this.file);
  }
}

export class AdaptiveOrchestrationRuntime {
  private readonly policy: AdaptivePolicy;
  private snapshot: AdaptiveOrchestrationSnapshot;

  constructor(readonly store: AdaptiveOrchestrationStore = new MemoryAdaptiveOrchestrationStore(), config: AdaptiveOrchestrationConfig = {}, private readonly clock: () => string = () => new Date().toISOString()) {
    this.policy = normalizePolicy(config);
    this.snapshot = store.load();
  }

  policySnapshot() { return structuredClone(this.policy); }

  startDecision(input: {parcelId: string; objective: string; taskClass: AdaptiveTaskClass; requiredCapabilities?: string[]; workflowId?: string; policy?: AdaptiveOrchestrationConfig}) {
    const at = this.clock();
    const policy = normalizePolicy({...this.policy, ...(input.policy ?? {})});
    const id = `orchestration-${randomUUID()}`;
    const record: AdaptiveDecisionRecord = {
      schema: 'agent-control.adaptive-decision/v1', id, parcelId: input.parcelId, createdAt: at, updatedAt: at,
      request: {objectiveFingerprint: fingerprint(input.objective), taskClass: safeTaskClass(input.taskClass), requiredCapabilities: safeIdentifiers(input.requiredCapabilities ?? []), policy, workflowId: input.workflowId ? safeIdentifier(input.workflowId) : null},
      nodes: [], routeHistory: [], outcomes: [],
    };
    this.pushNode(record, 'REQUEST', 'OBSERVED', {parcelId: input.parcelId, objectiveFingerprint: record.request.objectiveFingerprint});
    this.pushNode(record, 'CLASSIFICATION', 'SELECTED', {taskClass: record.request.taskClass, method: 'governed-task-classifier'});
    this.pushNode(record, 'REQUIRED_CAPABILITIES', 'OBSERVED', {capabilities: record.request.requiredCapabilities});
    this.pushNode(record, 'POLICY', 'PASSED', policyFacts(policy));
    this.snapshot.decisions.push(record); this.persist();
    return structuredClone(record);
  }

  updateRequest(decisionId: string, input: {objective?: string; taskClass?: AdaptiveTaskClass; requiredCapabilities?: string[]; workflowId?: string | null}) {
    const record = this.mustDecision(decisionId);
    if (input.objective !== undefined) record.request.objectiveFingerprint = fingerprint(input.objective);
    if (input.taskClass !== undefined) record.request.taskClass = safeTaskClass(input.taskClass);
    if (input.requiredCapabilities !== undefined) record.request.requiredCapabilities = safeIdentifiers(input.requiredCapabilities);
    if (input.workflowId !== undefined) record.request.workflowId = input.workflowId ? safeIdentifier(input.workflowId) : null;
    const classification = record.nodes.find(item => item.kind === 'CLASSIFICATION');
    if (classification) classification.facts = {taskClass: record.request.taskClass, method: 'governed-task-classifier'};
    const capabilities = record.nodes.find(item => item.kind === 'REQUIRED_CAPABILITIES');
    if (capabilities) capabilities.facts = {capabilities: record.request.requiredCapabilities};
    record.updatedAt = this.clock(); this.persist(); return structuredClone(record);
  }

  evaluateDecision(decisionId: string, input: {stageId?: string; candidates?: AdaptiveRouteCandidate[]; workflowCandidates?: AdaptiveWorkflowCandidate[]}) {
    const record = this.mustDecision(decisionId);
    const policy = record.request.policy;
    const candidates = (input.candidates ?? []).map((candidate, index) => ({...candidate, route: normalizeRoute(candidate.route), reasons: safeReasons(candidate.reasons), declaredOrder: candidate.declaredOrder ?? index}));
    const evaluated = candidates.map(candidate => this.evaluateCandidate(record, candidate, policy));
    const eligible = evaluated.filter(candidate => candidate.eligible);
    const selectionSeed = `${record.parcelId}:${input.stageId ?? 'parcel'}:model`;
    const selected = choose(eligible, policy, selectionSeed);
    const candidateFacts = evaluated.map(candidate => ({route: routeLabel(candidate.route), status: candidate.eligible ? 'eligible' : 'rejected', reasons: candidate.reasons, capabilities: candidate.capabilities ?? [], availability: candidate.availability ?? 'unknown', evidenceSample: candidate.row?.sampleSize ?? 0, confidence: candidate.row?.confidence ?? 0, quality: candidate.row?.qualityScore ?? null, score: Number(candidate.score.toFixed(4)), estimatedCost: candidate.estimatedCost ?? candidate.row?.estimatedCost ?? null, costAuthority: candidate.costAuthority ?? candidate.row?.costAuthority ?? 'unavailable', latencyMs: candidate.latencyMs ?? candidate.row?.latencyMs ?? null}));
    if (!policy.enabled) {
      this.pushNode(record, 'ELIGIBLE_CANDIDATES', 'EXCLUDED', {stageId: input.stageId ?? null, candidates: candidateFacts});
      this.pushNode(record, 'LEAGUE_EVIDENCE', evaluated.length ? 'OBSERVED' : 'EXCLUDED', {stageId: input.stageId ?? null, evidence: evaluated.map(candidate => ({route: routeLabel(candidate.route), evidenceSample: candidate.row?.sampleSize ?? 0, totalObservations: candidate.row?.totalObservations ?? 0, confidence: Number((candidate.row?.confidence ?? 0).toFixed(3)), quality: candidate.row?.qualityScore ?? null, evidenceAgeDays: candidate.row?.evidenceAgeDays ?? null, trend: candidate.row?.trend ?? 'unknown', modelVersion: candidate.row?.modelVersion ?? candidate.route.modelVersion ?? null}))});
      this.pushNode(record, 'TRADEOFF', 'EXCLUDED', {stageId: input.stageId ?? null, reason: 'adaptive-orchestration-disabled-by-policy'});
      record.updatedAt = this.clock(); this.persist(); return structuredClone(record);
    }
    this.pushNode(record, 'ELIGIBLE_CANDIDATES', selected ? 'PASSED' : 'REJECTED', {stageId: input.stageId ?? null, candidates: candidateFacts});
    this.pushNode(record, 'LEAGUE_EVIDENCE', evaluated.length ? 'OBSERVED' : 'EXCLUDED', {stageId: input.stageId ?? null, evidence: evaluated.map(candidate => ({route: routeLabel(candidate.route), evidenceSample: candidate.row?.sampleSize ?? 0, totalObservations: candidate.row?.totalObservations ?? 0, confidence: Number((candidate.row?.confidence ?? 0).toFixed(3)), quality: candidate.row?.qualityScore ?? null, evidenceAgeDays: candidate.row?.evidenceAgeDays ?? null, trend: candidate.row?.trend ?? 'unknown', modelVersion: candidate.row?.modelVersion ?? candidate.route.modelVersion ?? null}))});
    this.pushNode(record, 'TRADEOFF', selected ? 'SELECTED' : 'REJECTED', {stageId: input.stageId ?? null, selected: selected ? routeLabel(selected.route) : 'none', reason: selected ? (selected.reasons.join(', ') || 'Governed route selected') : 'No eligible qualified route', score: selected?.score ?? null, estimatedCost: selected?.estimatedCost ?? selected?.row?.estimatedCost ?? null, costAuthority: selected?.costAuthority ?? selected?.row?.costAuthority ?? 'unavailable', latencyMs: selected?.latencyMs ?? selected?.row?.latencyMs ?? null, quality: selected?.row?.qualityScore ?? null, confidence: selected?.row?.confidence ?? 0});
    if (selected) {
      const selectionReason = selected.reasons.join(', ') || (selected.preferenceReady ? 'Highest governed quality/cost/latency score with sufficient evidence' : explorationSelected(selected, eligible, policy, selectionSeed) ? 'Controlled deterministic exploration of an evidence-backed sparse route' : 'No candidate has sufficient evidence; declared policy order retained');
      record.selectedRoute = {route: selected.route, score: selected.score, reason: selectionReason, evidenceSample: selected.row?.sampleSize ?? 0, sparseEvidence: !(selected.preferenceReady)};
      record.routeHistory.push({at: this.clock(), stageId: input.stageId ?? null, route: selected.route, status: 'selected', reason: selectionReason, score: selected.score, evidenceSample: selected.row?.sampleSize ?? 0});
      this.pushNode(record, 'ROUTE', 'SELECTED', {stageId: input.stageId ?? null, route: routeLabel(selected.route), reason: selectionReason, score: selected.score, evidenceSample: selected.row?.sampleSize ?? 0, sparseEvidence: !selected.preferenceReady, exploration: explorationSelected(selected, eligible, policy, selectionSeed)});
      for (const rejected of evaluated.filter(candidate => routeKey(candidate.route) !== routeKey(selected.route))) record.routeHistory.push({at: this.clock(), stageId: input.stageId ?? null, route: rejected.route, status: 'rejected', reason: rejected.reasons.join(', ') || 'Lower governed score', score: rejected.score, evidenceSample: rejected.row?.sampleSize ?? 0});
    } else this.pushNode(record, 'ROUTE', 'REJECTED', {stageId: input.stageId ?? null, reason: 'No eligible qualified route'});

    const workflows = input.workflowCandidates ?? [];
    if (workflows.length) {
      const workflowRows = this.workflowLeague(record.request.taskClass, policy);
      const workflowEvaluated = workflows.map((candidate, index) => {
        const id = safeIdentifier(candidate.id), version = candidate.version ? safeIdentifier(candidate.version) : null;
        const row = workflowRows.find(item => item.workflow.id === id && item.workflow.version === version);
        const reasons = safeReasons(candidate.reasons);
        if (!candidate.eligible) reasons.push('candidate-not-eligible');
        if (candidate.estimatedCost !== null && candidate.estimatedCost !== undefined && policy.maxRouteCost !== null && candidate.estimatedCost > policy.maxRouteCost) reasons.push('policy-cost-ceiling');
        if (candidate.latencyMs !== null && candidate.latencyMs !== undefined && policy.maxRouteLatencyMs !== null && candidate.latencyMs > policy.maxRouteLatencyMs) reasons.push('policy-latency-ceiling');
        if (row && row.sampleSize >= policy.minimumSamplesForPreference && row.qualityScore !== null && row.qualityScore < policy.policyQualityFloor) reasons.push('policy-quality-floor');
        const eligible = candidate.eligible && reasons.length === 0;
        const score = workflowScore(candidate, row, policy, this.workflowCostBounds(record.request.taskClass, policy), this.workflowLatencyBounds(record.request.taskClass, policy));
        const preferenceReady = Boolean(row && row.sampleSize >= policy.minimumSamplesForPreference && row.qualityScore !== null && row.qualityScore >= policy.minimumQualityScore);
        return {...candidate, id, version, reasons, eligible, row, score, preferenceReady, declaredOrder: candidate.declaredOrder ?? index};
      });
      const workflowEligible = workflowEvaluated.filter(candidate => candidate.eligible);
      const workflowSeed = `${record.parcelId}:${input.stageId ?? 'parcel'}:workflow`;
      const workflow = chooseWorkflow(workflowEligible, policy, workflowSeed)[0];
      this.pushNode(record, 'ELIGIBLE_CANDIDATES', workflow ? 'PASSED' : 'REJECTED', {stageId: input.stageId ?? null, workflows: workflowEvaluated.map(candidate => ({workflow: `${candidate.id}@${candidate.version ?? 'unknown'}`, status: candidate.eligible ? 'eligible' : 'rejected', reasons: candidate.reasons, evidenceSample: candidate.row?.sampleSize ?? 0, confidence: candidate.row?.confidence ?? 0, quality: candidate.row?.qualityScore ?? null, score: Number(candidate.score.toFixed(4)), estimatedCost: candidate.estimatedCost ?? candidate.row?.estimatedCost ?? null, costAuthority: candidate.costAuthority ?? candidate.row?.costAuthority ?? 'unavailable', latencyMs: candidate.latencyMs ?? candidate.row?.latencyMs ?? null}))});
      this.pushNode(record, 'LEAGUE_EVIDENCE', workflowEvaluated.length ? 'OBSERVED' : 'EXCLUDED', {stageId: input.stageId ?? null, workflows: workflowEvaluated.map(candidate => ({workflow: `${candidate.id}@${candidate.version ?? 'unknown'}`, evidenceSample: candidate.row?.sampleSize ?? 0, totalObservations: candidate.row?.totalObservations ?? 0, confidence: Number((candidate.row?.confidence ?? 0).toFixed(3)), quality: candidate.row?.qualityScore ?? null, evidenceAgeDays: candidate.row?.evidenceAgeDays ?? null, trend: candidate.row?.trend ?? 'unknown'}))});
      if (workflow) {
        const reason = workflow.reasons.join(', ') || (workflow.preferenceReady ? 'Highest governed workflow quality/cost/latency score with sufficient evidence' : explorationSelected(workflow, workflowEligible, policy, workflowSeed) ? 'Controlled deterministic exploration of an evidence-backed sparse workflow' : 'No workflow candidate has sufficient evidence; declared policy order retained');
        record.selectedWorkflow = {workflow: {id: workflow.id, version: workflow.version}, score: workflow.score, reason, evidenceSample: workflow.row?.sampleSize ?? 0, sparseEvidence: !workflow.preferenceReady};
        this.pushNode(record, 'TRADEOFF', 'SELECTED', {stageId: input.stageId ?? null, workflow: `${workflow.id}@${workflow.version ?? 'unknown'}`, score: workflow.score, evidenceSample: workflow.row?.sampleSize ?? 0, sparseEvidence: !workflow.preferenceReady, exploration: explorationSelected(workflow, workflowEligible, policy, workflowSeed), reason});
        for (const rejected of workflowEvaluated.filter(candidate => `${candidate.id}@${candidate.version ?? 'unknown'}` !== `${workflow.id}@${workflow.version ?? 'unknown'}`)) record.routeHistory.push({at: this.clock(), stageId: input.stageId ?? null, route: null, status: 'rejected', reason: `workflow:${rejected.reasons.join(', ') || 'lower governed score'}`, score: rejected.score, evidenceSample: rejected.row?.sampleSize ?? 0});
      }
    }
    record.updatedAt = this.clock(); this.persist(); return structuredClone(record);
  }

  recordObservedRoute(decisionId: string, input: {stageId?: string; route: AdaptiveRouteIdentity; reason: string}) {
    const record = this.mustDecision(decisionId), route = normalizeRoute(input.route), at = this.clock();
    const previous = record.routeHistory.at(-1)?.route;
    if (previous && routeKey(previous) === routeKey(route)) return structuredClone(record);
    record.routeHistory.push({at, stageId: input.stageId ?? null, route, status: 'observed', reason: safeReason(input.reason)});
    this.pushNode(record, 'ROUTE', 'OBSERVED', {stageId: input.stageId ?? null, route: routeLabel(route), reason: safeReason(input.reason)});
    record.updatedAt = at; this.persist(); return structuredClone(record);
  }

  recordOutcome(input: AdaptiveOutcomeInput) {
    const record = this.mustDecision(input.decisionId), at = input.observedAt ?? this.clock(), route = input.route ? normalizeRoute(input.route) : null, workflow = input.workflow ? {id: safeIdentifier(input.workflow.id), version: input.workflow.version ? safeIdentifier(input.workflow.version) : null} : null;
    const outcomeId = `${input.parcelId}:${input.stageId ?? 'parcel'}:${route ? routeKey(route) : 'workflow'}:${input.observationId ? safeIdentifier(input.observationId) : workflowKey(workflow)}:${input.outcome}`;
    if (record.outcomes.some(item => item.id === outcomeId)) return structuredClone(record);
    const countsTowardQuality = Boolean(input.verified && input.qualityGatePass !== null && input.qualityGatePass !== undefined && qualityOutcomes.has(input.outcome) && !operationalOutcomes.has(input.outcome) && !['provider', 'infrastructure', 'policy', 'cancel', 'insufficient-evidence'].includes(input.failureClass ?? ''));
    const observation: AdaptiveEvidenceObservation = {
      id: outcomeId, decisionId: input.decisionId, parcelId: input.parcelId, stageId: input.stageId ?? null, taskClass: safeTaskClass(input.taskClass ?? record.request.taskClass), evidenceKind: input.evidenceKind, route, capabilities: safeIdentifiers(input.capabilities ?? []), workflow,
      outcome: input.outcome, verified: input.verified, countsTowardQuality, qualityScore: numberOrNull(input.qualityScore), qualityGatePass: boolOrNull(input.qualityGatePass), firstPass: boolOrNull(input.firstPass), retryCount: nonnegativeInteger(input.retryCount), escalationCount: nonnegativeInteger(input.escalationCount), latencyMs: numberOrNull(input.latencyMs), usage: {inputTokens: numberOrNull(input.usage?.inputTokens), outputTokens: numberOrNull(input.usage?.outputTokens), totalTokens: numberOrNull(input.usage?.totalTokens), cachedInputTokens: numberOrNull(input.usage?.cachedInputTokens), localComputeCost: numberOrNull(input.localComputeCost ?? input.usage?.localComputeCost)}, cost: numberOrNull(input.cost), currency: input.currency ? safeCurrency(input.currency) : null, costAuthority: input.cost === null || input.cost === undefined ? 'unavailable' : input.costAuthority ?? 'unavailable', localComputeCost: numberOrNull(input.localComputeCost ?? input.usage?.localComputeCost), localCostAuthority: input.localComputeCost === null || input.localComputeCost === undefined ? 'unavailable' : input.localCostAuthority ?? 'unavailable', failureClass: input.failureClass ?? null, observedAt: at,
    };
    if (route) this.snapshot.modelEvidence.push(structuredClone(observation));
    if (workflow) this.snapshot.workflowEvidence.push(structuredClone(observation));
    record.outcomes.push({id: outcomeId, at, stageId: observation.stageId, route, workflow, outcome: observation.outcome, verified: observation.verified, countsTowardQuality, failureClass: observation.failureClass});
    this.pushNode(record, 'EXECUTION', input.outcome === 'CANCELLED' ? 'EXCLUDED' : 'OBSERVED', {stageId: observation.stageId, route: route ? routeLabel(route) : 'workflow-only', outcome: input.outcome, evidenceKind: input.evidenceKind, evidenceId: observation.id, verified: observation.verified, qualityScore: observation.qualityScore, qualityGatePass: observation.qualityGatePass, latencyMs: observation.latencyMs, tokens: {inputTokens: observation.usage.inputTokens, outputTokens: observation.usage.outputTokens, totalTokens: observation.usage.totalTokens, cachedInputTokens: observation.usage.cachedInputTokens}, cost: {amount: observation.cost, currency: observation.currency, authority: observation.costAuthority, localComputeCost: observation.localComputeCost, localAuthority: observation.localCostAuthority}, failureClass: observation.failureClass ?? null});
    this.pushNode(record, 'QUALITY_GATE', countsTowardQuality ? (input.qualityGatePass ? 'PASSED' : 'REJECTED') : 'EXCLUDED', {stageId: observation.stageId, verified: input.verified, qualityGatePass: observation.qualityGatePass, countsTowardQuality, failureClass: observation.failureClass ?? 'none'});
    this.pushNode(record, 'VERIFICATION', input.verified ? 'PASSED' : 'EXCLUDED', {stageId: observation.stageId, outcome: input.outcome, authority: input.verified ? 'independent-verifier' : 'not-verified'});
    this.pushNode(record, 'EVIDENCE_UPDATE', countsTowardQuality ? 'PASSED' : 'EXCLUDED', {stageId: observation.stageId, evidenceId: observation.id, modelLeagueUpdated: Boolean(route && countsTowardQuality), workflowLeagueUpdated: Boolean(workflow && countsTowardQuality), operationalFailureRecorded: Boolean(observation.failureClass && !countsTowardQuality)});
    if (input.outcome === 'ESCALATED' || input.escalationCount) this.pushNode(record, 'ESCALATION', 'OBSERVED', {stageId: observation.stageId, count: observation.escalationCount, reason: observation.failureClass ?? 'governed escalation'});
    record.updatedAt = at; this.persist(); return structuredClone(record);
  }

  decision(id: string) { return structuredClone(this.mustDecision(id)); }
  decisions() { return structuredClone([...this.snapshot.decisions].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))); }
  recordOperationalNode(decisionId: string, input: {stageId?: string; kind: Exclude<AdaptiveDecisionNodeKind, 'REQUEST' | 'CLASSIFICATION' | 'REQUIRED_CAPABILITIES' | 'POLICY'>; status: AdaptiveNodeStatus; facts: Record<string, DecisionFact>; route?: AdaptiveRouteIdentity | null; reason?: string}) {
    const record = this.mustDecision(decisionId), at = this.clock(), facts = structuredClone(input.facts);
    this.pushNode(record, input.kind, input.status, {stageId: input.stageId ?? null, ...facts});
    if (input.route) record.routeHistory.push({at, stageId: input.stageId ?? null, route: normalizeRoute(input.route), status: input.status === 'SELECTED' ? 'selected' : input.status === 'REJECTED' || input.status === 'EXCLUDED' ? 'rejected' : 'observed', reason: safeReason(input.reason ?? String(facts.reason ?? 'operational routing event'))});
    record.updatedAt = at; this.persist(); return structuredClone(record);
  }
  modelLeague(taskClass?: string, policy = this.policy, filter: AdaptiveLeagueFilter = {}) { return sortLeague(deriveLeague(filterObservations(this.snapshot.modelEvidence, taskClass, filter, Date.parse(this.clock())), policy, undefined, 'model', Date.parse(this.clock())) as ModelCapabilityLeagueRow[], filter.sort); }
  workflowLeague(taskClass?: string, policy = this.policy, filter: AdaptiveLeagueFilter = {}) { return sortLeague(deriveLeague(filterObservations(this.snapshot.workflowEvidence, taskClass, filter, Date.parse(this.clock())), policy, undefined, 'workflow', Date.parse(this.clock())) as WorkflowLeagueRow[], filter.sort); }
  report(id: string) {
    const decision = this.decision(id);
    const modelEvidence = this.snapshot.modelEvidence.filter(item => item.decisionId === id);
    const workflowEvidence = this.snapshot.workflowEvidence.filter(item => item.decisionId === id);
    const evidence = [...modelEvidence, ...workflowEvidence.filter(item => !modelEvidence.some(existing => existing.id === item.id))];
    return {schema: 'agent-control.adaptive-report/v1', decisionId: id, parcelId: decision.parcelId, request: structuredClone(decision.request), selectedRoute: decision.selectedRoute ?? null, selectedWorkflow: decision.selectedWorkflow ?? null, steps: decision.nodes.map(node => ({at: node.at, parentId: node.parentId ?? null, kind: node.kind, status: node.status, stageId: node.stageId ?? null, facts: structuredClone(node.facts)})), evidence: structuredClone(evidence), reconciliation: {modelEvidence: modelEvidence.length, workflowEvidence: workflowEvidence.length, uniqueEvidence: evidence.length, outcomes: decision.outcomes.length}, narrative: decision.nodes.map(node => narrative(node)).filter(Boolean), humanReadable: humanReadable(decision, evidence)};
  }

  private evaluateCandidate(record: AdaptiveDecisionRecord, candidate: AdaptiveRouteCandidate, policy: AdaptivePolicy) {
    const row = this.modelLeague(record.request.taskClass, policy).find(item => routeKey(item.route) === routeKey(candidate.route));
    const reasons = [...candidate.reasons];
    if (!candidate.eligible) reasons.push('candidate-not-eligible');
    if (candidate.availability === 'unavailable') reasons.push('availability-unavailable');
    if (candidate.availability === 'unknown') reasons.push('availability-unknown');
    for (const capability of record.request.requiredCapabilities) if (!(candidate.capabilities ?? []).includes(capability)) reasons.push(`capability-${capability}-unproven`);
    if (candidate.estimatedCost !== null && candidate.estimatedCost !== undefined && policy.maxRouteCost !== null && candidate.estimatedCost > policy.maxRouteCost) reasons.push('policy-cost-ceiling');
    if (candidate.latencyMs !== null && candidate.latencyMs !== undefined && policy.maxRouteLatencyMs !== null && candidate.latencyMs > policy.maxRouteLatencyMs) reasons.push('policy-latency-ceiling');
    if (row && row.sampleSize >= policy.minimumSamplesForPreference && row.qualityScore !== null && row.qualityScore < policy.policyQualityFloor) reasons.push('policy-quality-floor');
    const eligible = candidate.eligible && reasons.length === 0;
    const score = routeScore(candidate, row, policy, record.request.requiredCapabilities, this.costBounds(record.request.taskClass, policy), this.latencyBounds(record.request.taskClass, policy));
    const preferenceReady = Boolean(row && row.sampleSize >= policy.minimumSamplesForPreference && row.qualityScore !== null && row.qualityScore >= policy.minimumQualityScore);
    return {...candidate, reasons, eligible, row, score, preferenceReady};
  }

  private costBounds(taskClass: string, policy = this.policy) { const values = this.modelLeague(taskClass, policy).map(row => row.estimatedCost).filter((value): value is number => value !== null); return {min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null}; }
  private latencyBounds(taskClass: string, policy = this.policy) { const values = this.modelLeague(taskClass, policy).map(row => row.latencyMs).filter((value): value is number => value !== null); return {min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null}; }
  private workflowCostBounds(taskClass: string, policy = this.policy) { const values = this.workflowLeague(taskClass, policy).map(row => row.estimatedCost).filter((value): value is number => value !== null); return {min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null}; }
  private workflowLatencyBounds(taskClass: string, policy = this.policy) { const values = this.workflowLeague(taskClass, policy).map(row => row.latencyMs).filter((value): value is number => value !== null); return {min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null}; }
  private pushNode(record: AdaptiveDecisionRecord, kind: AdaptiveDecisionNodeKind, status: AdaptiveNodeStatus, facts: Record<string, DecisionFact>) { const parentId = record.nodes.at(-1)?.id, node = this.node(kind, status, facts, parentId); record.nodes.push(node); return node; }
  private node(kind: AdaptiveDecisionNodeKind, status: AdaptiveNodeStatus, facts: Record<string, DecisionFact>, parentId?: string): AdaptiveDecisionNode { return {id: `decision-node-${randomUUID()}`, at: this.clock(), ...(parentId ? {parentId} : {}), kind, status, facts}; }
  private mustDecision(id: string) { const value = this.snapshot.decisions.find(item => item.id === id); if (!value) throw new Error('adaptive_decision_missing'); return value; }
  private persist() { this.store.save(this.snapshot); }
}

function normalizePolicy(input: AdaptiveOrchestrationConfig | Partial<AdaptivePolicy>): AdaptivePolicy {
  const number = (value: number | undefined, fallback: number, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => value === undefined ? fallback : Number.isFinite(value) && value >= minimum && value <= maximum ? value : (() => { throw new Error('invalid_adaptive_orchestration_policy'); })();
  return {enabled: input.enabled ?? DEFAULT_POLICY.enabled, minimumSamplesForPreference: Math.floor(number(input.minimumSamplesForPreference, DEFAULT_POLICY.minimumSamplesForPreference, 1, 100_000)), minimumQualityScore: number(input.minimumQualityScore, DEFAULT_POLICY.minimumQualityScore, 0, 1), maxEvidenceAgeDays: number(input.maxEvidenceAgeDays, DEFAULT_POLICY.maxEvidenceAgeDays, 1, 3_650), policyQualityFloor: number(input.policyQualityFloor, DEFAULT_POLICY.policyQualityFloor, 0, 1), maxRouteCost: input.maxRouteCost == null ? DEFAULT_POLICY.maxRouteCost : number(input.maxRouteCost, 0, 0, Number.MAX_SAFE_INTEGER), maxRouteLatencyMs: input.maxRouteLatencyMs == null ? DEFAULT_POLICY.maxRouteLatencyMs : number(input.maxRouteLatencyMs, 0, 0, Number.MAX_SAFE_INTEGER), qualityWeight: number(input.qualityWeight, DEFAULT_POLICY.qualityWeight, 0, 1), reliabilityWeight: number(input.reliabilityWeight, DEFAULT_POLICY.reliabilityWeight, 0, 1), costWeight: number(input.costWeight, DEFAULT_POLICY.costWeight, 0, 1), latencyWeight: number(input.latencyWeight, DEFAULT_POLICY.latencyWeight, 0, 1), confidenceWeight: number(input.confidenceWeight, DEFAULT_POLICY.confidenceWeight, 0, 1), explorationRate: number(input.explorationRate, DEFAULT_POLICY.explorationRate, 0, 1)};
}

function deriveLeague(observations: AdaptiveEvidenceObservation[], policy: AdaptivePolicy, taskClass: string | undefined, kind: 'model' | 'workflow', nowMs = Date.now()) {
  const filtered = observations.filter(item => !taskClass || item.taskClass === taskClass);
  const groups = new Map<string, AdaptiveEvidenceObservation[]>();
  for (const observation of filtered) {
    const identity = kind === 'model' ? routeKey(observation.route) : workflowKey(observation.workflow);
    if (identity === 'none') continue;
    const key = `${observation.taskClass}\u0000${identity}`;
    groups.set(key, [...(groups.get(key) ?? []), observation]);
  }
  const rows = [...groups.entries()].map(([key, values]) => {
    const className = key.split('\u0000', 1)[0], quality = values.filter(item => item.countsTowardQuality), weights = values.map(item => observationWeight(item, policy, nowMs)), weighted = (selector: (item: AdaptiveEvidenceObservation) => number | null) => weightedAverage(values, weights, selector), boolRate = (selector: (item: AdaptiveEvidenceObservation) => boolean | null) => weightedAverage(values.filter(item => selector(item) !== null), values.filter(item => selector(item) !== null).map(item => observationWeight(item, policy, nowMs)), item => selector(item) ? 1 : 0), age = values.length ? Math.max(0, (nowMs - Math.min(...values.map(item => Date.parse(item.observedAt)))) / 86_400_000) : null, sampleSize = quality.length, confidence = Math.min(1, Math.sqrt(sampleSize / 10)) * (values.length ? Math.min(1, values.reduce((sum, item) => sum + observationWeight(item, policy, nowMs), 0) / Math.max(1, values.length)) : 0), evidenceKinds = {BENCHMARK: values.filter(item => item.evidenceKind === 'BENCHMARK').length, QUALIFICATION: values.filter(item => item.evidenceKind === 'QUALIFICATION').length, PRODUCTION_WORK_PARCEL: values.filter(item => item.evidenceKind === 'PRODUCTION_WORK_PARCEL').length}, costs = values.filter(item => item.cost !== null), localCosts = values.filter(item => item.localComputeCost !== null), inputs = values.filter(item => item.usage.inputTokens !== null && item.usage.inputTokens > 0 && item.usage.cachedInputTokens !== null), currencies = [...new Set(costs.map(item => item.currency).filter((item): item is string => Boolean(item)))], costAuthority = authorityFor(costs.map(item => item.costAuthority)), localCostAuthority = authorityFor(localCosts.map(item => item.localCostAuthority));
    const common = {taskClass: className, successRate: boolRate(item => item.countsTowardQuality ? item.qualityGatePass : null), qualityScore: weighted(item => item.countsTowardQuality ? item.qualityScore : null), qualityGatePassRate: boolRate(item => item.qualityGatePass), firstPassRate: boolRate(item => item.firstPass), retryRate: weighted(values.length ? item => item.retryCount : () => null), escalationRate: weighted(values.length ? item => item.escalationCount : () => null), latencyMs: weighted(item => item.latencyMs), inputTokens: weighted(item => item.usage.inputTokens), outputTokens: weighted(item => item.usage.outputTokens), totalTokens: weighted(item => item.usage.totalTokens), estimatedCost: weighted(item => item.cost), currency: currencies.length === 1 ? currencies[0] : null, costAuthority, localComputeCost: weighted(item => item.localComputeCost), localCostAuthority, cacheEfficiency: weightedAverage(inputs, inputs.map(item => observationWeight(item, policy, nowMs)), item => item.usage.inputTokens && item.usage.cachedInputTokens !== null ? item.usage.cachedInputTokens / item.usage.inputTokens : null), reliability: quality.length ? quality.filter(item => item.qualityGatePass === true).length / quality.length : null, operationalFailureRate: values.length ? values.filter(item => operationalOutcomes.has(item.outcome)).length / values.length : null, sampleSize, totalObservations: values.length, confidence, evidenceAgeDays: age, trend: trend(values), evidenceKinds};
    if (kind === 'model') {
      const route = values.find(item => item.route)?.route ?? {providerId: 'unknown', modelId: 'unknown', accountProfileId: null, nodeId: null, modelVersion: null};
      const capabilities = [...new Set(values.flatMap(item => item.capabilities))].sort();
      const capabilityScores = Object.fromEntries(capabilities.map(capability => { const capabilityValues = quality.filter(item => item.capabilities.includes(capability) && item.qualityScore !== null); return [capability, weightedAverage(capabilityValues, capabilityValues.map(item => observationWeight(item, policy, nowMs)), item => item.qualityScore) ?? 0]; }));
      return {...common, route, capabilities, capabilityScores, modelVersion: route.modelVersion ?? null} satisfies ModelCapabilityLeagueRow;
    }
    return {...common, workflow: values.find(item => item.workflow)?.workflow ?? {id: 'unknown', version: null}} satisfies WorkflowLeagueRow;
  });
  return rows.sort((a, b) => (b.confidence - a.confidence) || (b.qualityScore ?? -.1) - (a.qualityScore ?? -.1) || JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function filterObservations(observations: AdaptiveEvidenceObservation[], taskClass: string | undefined, filter: AdaptiveLeagueFilter, nowMs: number) {
  const maxAge = filter.maxAgeDays === undefined ? null : Math.max(0, filter.maxAgeDays);
  return observations.filter(item => {
    if (taskClass && item.taskClass !== taskClass) return false;
    if (filter.capability && !item.capabilities.includes(filter.capability)) return false;
    if (filter.providerId && item.route?.providerId !== filter.providerId) return false;
    if (filter.modelId && item.route?.modelId !== filter.modelId) return false;
    if (filter.modelVersion && item.route?.modelVersion !== filter.modelVersion) return false;
    if (filter.location && routeLocation(item.route) !== filter.location) return false;
    if (filter.evidenceKind && item.evidenceKind !== filter.evidenceKind) return false;
    if (filter.minQuality !== undefined && (item.qualityScore === null || item.qualityScore < filter.minQuality)) return false;
    if (maxAge !== null && (nowMs - Date.parse(item.observedAt)) / 86_400_000 > maxAge) return false;
    return true;
  });
}

function sortLeague<T extends {qualityScore: number | null; estimatedCost: number | null; latencyMs: number | null; reliability: number | null; confidence: number; sampleSize: number; evidenceAgeDays: number | null}>(rows: T[], sort: AdaptiveLeagueFilter['sort']) {
  const value = (item: T) => sort === 'quality' ? item.qualityScore ?? -Infinity : sort === 'cost' ? item.estimatedCost === null ? Infinity : item.estimatedCost : sort === 'latency' ? item.latencyMs === null ? Infinity : item.latencyMs : sort === 'reliability' ? item.reliability ?? -Infinity : sort === 'confidence' ? item.confidence : sort === 'samples' ? item.sampleSize : sort === 'recent' ? item.evidenceAgeDays === null ? Infinity : item.evidenceAgeDays : item.confidence;
  return [...rows].sort((a, b) => { const left = value(a), right = value(b); if (left !== right) return sort === 'cost' || sort === 'latency' || sort === 'recent' ? left - right : right - left; return JSON.stringify(a).localeCompare(JSON.stringify(b)); });
}

function routeScore(candidate: AdaptiveRouteCandidate, row: ModelCapabilityLeagueRow | undefined, policy: AdaptivePolicy, required: string[], costBounds: {min: number | null; max: number | null}, latencyBounds: {min: number | null; max: number | null}) {
  const capabilityCoverage = required.length ? (candidate.capabilities ?? []).filter(item => required.includes(item)).length / required.length : 1;
  const quality = row?.qualityScore ?? .5, reliability = row?.reliability ?? .5, confidence = row?.confidence ?? 0, cost = normalizedLow(candidate.estimatedCost ?? row?.estimatedCost ?? null, costBounds), latency = normalizedLow(candidate.latencyMs ?? row?.latencyMs ?? null, latencyBounds);
  return capabilityCoverage * .2 + quality * policy.qualityWeight + reliability * policy.reliabilityWeight + cost * policy.costWeight + latency * policy.latencyWeight + confidence * policy.confidenceWeight;
}

function workflowScore(candidate: AdaptiveWorkflowCandidate, row: WorkflowLeagueRow | undefined, policy: AdaptivePolicy, costBounds: {min: number | null; max: number | null}, latencyBounds: {min: number | null; max: number | null}) {
  const quality = row?.qualityScore ?? .5, reliability = row?.reliability ?? .5, confidence = row?.confidence ?? 0, cost = normalizedLow(candidate.estimatedCost ?? row?.estimatedCost ?? null, costBounds), latency = normalizedLow(candidate.latencyMs ?? row?.latencyMs ?? null, latencyBounds);
  return quality * policy.qualityWeight + reliability * policy.reliabilityWeight + cost * policy.costWeight + latency * policy.latencyWeight + confidence * policy.confidenceWeight;
}

function choose<T extends {declaredOrder?: number; score: number; preferenceReady: boolean; row?: {sampleSize: number}; route: AdaptiveRouteIdentity; reasons: string[]; costAuthority?: AdaptiveRouteCandidate['costAuthority']; latencyMs?: number | null}>(values: T[], policy: AdaptivePolicy, seed = '') {
  if (!values.length) return undefined;
  const preferred = values.filter(item => item.preferenceReady);
  const pool = preferred.length ? preferred : values;
  const ordered = [...pool].sort((a, b) => (preferred.length ? b.score - a.score : (a.declaredOrder ?? 0) - (b.declaredOrder ?? 0)) || (a.declaredOrder ?? 0) - (b.declaredOrder ?? 0));
  if (!preferred.length && policy.explorationRate > 0) {
    const observed = ordered.filter(item => (item.row?.sampleSize ?? 0) > 0);
    const fraction = deterministicFraction(seed);
    if (observed.length > 1 && fraction < policy.explorationRate) return observed[Math.min(observed.length - 1, Math.floor((fraction / policy.explorationRate) * observed.length))];
  }
  return ordered[0];
}

function chooseWorkflow<T extends {declaredOrder?: number; score: number; preferenceReady: boolean; row?: {sampleSize: number}}>(values: T[], policy: AdaptivePolicy, seed = ''): T[] {
  if (!values.length) return [];
  const preferred = values.filter(item => item.preferenceReady);
  const ordered = [...(preferred.length ? preferred : values)].sort((a, b) => (preferred.length ? b.score - a.score : (a.declaredOrder ?? 0) - (b.declaredOrder ?? 0)) || (a.declaredOrder ?? 0) - (b.declaredOrder ?? 0));
  if (!preferred.length && policy.explorationRate > 0) {
    const observed = ordered.filter(item => (item.row?.sampleSize ?? 0) > 0);
    const fraction = deterministicFraction(seed);
    if (observed.length > 1 && fraction < policy.explorationRate) {
      const selected = observed[Math.min(observed.length - 1, Math.floor((fraction / policy.explorationRate) * observed.length))];
      return [selected, ...ordered.filter(item => item !== selected)];
    }
  }
  return ordered;
}

function explorationSelected<T extends {declaredOrder?: number; preferenceReady: boolean; row?: {sampleSize: number}}>(selected: T, values: T[], policy: AdaptivePolicy, seed: string) {
  if (selected.preferenceReady || policy.explorationRate <= 0) return false;
  const ordered = [...values].sort((a, b) => (a.declaredOrder ?? 0) - (b.declaredOrder ?? 0));
  const observed = ordered.filter(item => (item.row?.sampleSize ?? 0) > 0);
  const fraction = deterministicFraction(seed);
  if (observed.length <= 1 || fraction >= policy.explorationRate) return false;
  return selected === observed[Math.min(observed.length - 1, Math.floor((fraction / policy.explorationRate) * observed.length))];
}

function normalizedLow(value: number | null, bounds: {min: number | null; max: number | null}) { if (value === null || bounds.min === null || bounds.max === null) return .5; if (bounds.min === bounds.max) return 1; return Math.max(0, Math.min(1, 1 - (value - bounds.min) / (bounds.max - bounds.min))); }
function deterministicFraction(seed: string) { if (!seed) return 1; return createHash('sha256').update(seed).digest().readUInt32BE(0) / 0xffffffff; }
function weightedAverage(values: AdaptiveEvidenceObservation[], weights: number[], selector: (item: AdaptiveEvidenceObservation) => number | null) { const pairs = values.map((item, index) => ({value: selector(item), weight: weights[index]})).filter((item): item is {value: number; weight: number} => item.value !== null && Number.isFinite(item.value)); const total = pairs.reduce((sum, item) => sum + item.weight, 0); return total ? pairs.reduce((sum, item) => sum + item.value * item.weight, 0) / total : null; }
function authorityFor(values: Array<'authoritative' | 'estimated' | 'unavailable'>): 'authoritative' | 'estimated' | 'unavailable' { if (!values.length) return 'unavailable'; if (values.every(value => value === 'authoritative')) return 'authoritative'; if (values.some(value => value === 'estimated')) return 'estimated'; return 'unavailable'; }
function observationWeight(item: AdaptiveEvidenceObservation, policy: AdaptivePolicy, nowMs = Date.now()) { const age = Math.max(0, (nowMs - Date.parse(item.observedAt)) / 86_400_000); return evidenceWeight[item.evidenceKind] * Math.exp(-age / Math.max(1, policy.maxEvidenceAgeDays)); }
function trend(values: AdaptiveEvidenceObservation[]): 'improving' | 'stable' | 'declining' | 'unknown' { const quality = values.filter(item => item.countsTowardQuality && item.qualityScore !== null).sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt)); if (quality.length < 2) return 'unknown'; const middle = Math.floor(quality.length / 2), before = quality.slice(0, middle), after = quality.slice(middle), average = (items: AdaptiveEvidenceObservation[]) => items.reduce((sum, item) => sum + (item.qualityScore ?? 0), 0) / items.length, delta = average(after) - average(before); return delta > .08 ? 'improving' : delta < -.08 ? 'declining' : 'stable'; }
function fingerprint(value: string) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function routeKey(route: AdaptiveRouteIdentity | null | undefined) { return route ? `${route.providerId}/${route.accountProfileId ?? 'default'}/${route.modelId}@${route.nodeId ?? 'controller'}#${route.modelVersion ?? 'unknown'}` : 'none'; }
function workflowKey(workflow: {id: string; version: string | null} | null | undefined) { return workflow ? `${workflow.id}@${workflow.version ?? 'unknown'}` : 'none'; }
function routeLabel(route: AdaptiveRouteIdentity) { return `${route.providerId}/${route.accountProfileId ?? 'default'}/${route.modelId}@${route.nodeId ?? 'controller'}`; }
function routeLocation(route: AdaptiveRouteIdentity | null | undefined): 'local' | 'remote' | 'unknown' { if (!route) return 'unknown'; return route.location ?? (route.nodeId === 'controller' ? 'local' : route.nodeId ? 'remote' : 'unknown'); }
function normalizeRoute(route: AdaptiveRouteIdentity): AdaptiveRouteIdentity { return {providerId: safeIdentifier(route.providerId), modelId: safeIdentifier(route.modelId), accountProfileId: route.accountProfileId ? safeIdentifier(route.accountProfileId) : null, nodeId: route.nodeId ? safeIdentifier(route.nodeId) : 'controller', modelVersion: route.modelVersion ? safeIdentifier(route.modelVersion) : null, ...(route.location ? {location: route.location} : {})}; }
function safeIdentifier(value: string) { const normalized = String(value).trim(); if (!/^[a-z0-9][a-z0-9._:/@-]{0,255}$/i.test(normalized)) throw new Error('adaptive_identifier_invalid'); return normalized; }
function safeIdentifiers(values: string[]) { return [...new Set(values.map(value => safeIdentifier(value)))]; }
function safeTaskClass(value: string) { return safeIdentifier(value.toLowerCase().replace(/\s+/g, '-')); }
function safeReasons(values: string[]) { return values.map(safeReason); }
function safeReason(value: string) { return String(value).replace(/[\r\n]+/g, ' ').slice(0, 512); }
function safeCurrency(value: string) { const normalized = String(value).trim().toUpperCase(); if (!/^[A-Z][A-Z0-9._-]{0,15}$/.test(normalized)) throw new Error('adaptive_currency_invalid'); return normalized; }
function numberOrNull(value: number | null | undefined) { return value === null || value === undefined ? null : Number.isFinite(value) ? value : null; }
function boolOrNull(value: boolean | null | undefined) { return value === null || value === undefined ? null : value; }
function nonnegativeInteger(value: number | undefined) { return value === undefined ? 0 : Number.isSafeInteger(value) && value >= 0 ? value : 0; }
function policyFacts(policy: AdaptivePolicy): Record<string, DecisionFact> { return {enabled: policy.enabled, minimumSamplesForPreference: policy.minimumSamplesForPreference, minimumQualityScore: policy.minimumQualityScore, maxEvidenceAgeDays: policy.maxEvidenceAgeDays, policyQualityFloor: policy.policyQualityFloor, maxRouteCost: policy.maxRouteCost, maxRouteLatencyMs: policy.maxRouteLatencyMs, qualityWeight: policy.qualityWeight, reliabilityWeight: policy.reliabilityWeight, costWeight: policy.costWeight, latencyWeight: policy.latencyWeight, confidenceWeight: policy.confidenceWeight, explorationRate: policy.explorationRate}; }
function narrative(node: AdaptiveDecisionNode) { const stage = node.stageId ? ` for ${node.stageId}` : ''; if (node.kind === 'REQUEST') return `Work Parcel request accepted${stage}; objective fingerprint ${String(node.facts.objectiveFingerprint ?? 'unavailable')}.`; if (node.kind === 'CLASSIFICATION') return `Task classified as ${String(node.facts.taskClass)}${stage}.`; if (node.kind === 'REQUIRED_CAPABILITIES') return `Required capabilities: ${factList(node.facts.capabilities)}${stage}.`; if (node.kind === 'POLICY') return `Policy snapshot recorded${stage}.`; if (node.kind === 'ELIGIBLE_CANDIDATES') return `Eligible-candidate evaluation recorded ${factList(node.facts.candidates)}${stage}.`; if (node.kind === 'LEAGUE_EVIDENCE') return `Historical league evidence was consulted${stage}.`; if (node.kind === 'TRADEOFF') return `Trade-off decision${stage}: ${String(node.facts.reason ?? node.facts.selected ?? 'recorded')}.`; if (node.kind === 'ROUTE') return `${node.status === 'SELECTED' ? 'Selected' : node.status === 'REJECTED' ? 'Rejected' : 'Observed'} route ${String(node.facts.route ?? node.facts.workflow ?? 'none')}${stage}: ${String(node.facts.reason ?? '')}`.trim(); if (node.kind === 'EXECUTION') return `Execution ${String(node.facts.outcome ?? node.status.toLowerCase())}${stage} on ${String(node.facts.route ?? 'workflow-only')}.`; if (node.kind === 'QUALITY_GATE') return `Quality gate ${String(node.facts.countsTowardQuality === true ? 'updated league evidence' : 'excluded this outcome')}${stage}.`; if (node.kind === 'VERIFICATION') return `Verification ${node.status === 'PASSED' ? 'passed' : 'was not available'}${stage}.`; if (node.kind === 'REVIEW') return `Reviewer ${node.status === 'PASSED' ? 'completed' : node.status === 'REJECTED' ? 'was rejected' : 'was invoked'}${stage}.`; if (node.kind === 'REPAIR') return `Repair ${node.status === 'PASSED' ? 'completed' : node.status === 'REJECTED' ? 'failed' : 'was invoked'}${stage}.`; if (node.kind === 'EVIDENCE_UPDATE') return `Evidence update ${node.status === 'PASSED' ? 'recorded' : 'excluded'}${stage}.`; if (node.kind === 'ESCALATION') return `Escalation observed${stage}: ${String(node.facts.reason ?? '')}`; return ''; }
function humanReadable(record: AdaptiveDecisionRecord, observations: AdaptiveEvidenceObservation[] = []) {
  const lines = [`# Routing & Orchestration Decision Record`, ``, `Work Parcel: ${record.parcelId}`, `Decision: ${record.id}`, `Created: ${record.createdAt}`, `Updated: ${record.updatedAt}`, ``, `## Request and classification`, ``, `Task class: ${record.request.taskClass}`, `Required capabilities: ${record.request.requiredCapabilities.join(', ') || 'none recorded'}`, `Objective fingerprint: ${record.request.objectiveFingerprint}`, ``, `## Policy applied`, ``, `- Minimum samples for preference: ${record.request.policy.minimumSamplesForPreference}`, `- Minimum quality score: ${record.request.policy.minimumQualityScore}`, `- Quality floor: ${record.request.policy.policyQualityFloor}`, `- Evidence age limit: ${record.request.policy.maxEvidenceAgeDays} days`, `- Exploration rate: ${record.request.policy.explorationRate}`, ``, `## Operational decision path`, ``];
  for (const node of record.nodes) lines.push(`- ${node.at} · ${node.kind} · ${node.status}${node.stageId ? ` · stage ${node.stageId}` : ''}${node.parentId ? ` · parent ${node.parentId}` : ''}: ${narrative(node)}`);
  lines.push('', '## Selected route and workflow', '', `Route: ${record.selectedRoute?.route ? routeLabel(record.selectedRoute.route) : 'none selected'}`, `Workflow: ${record.selectedWorkflow?.workflow ? `${record.selectedWorkflow.workflow.id}@${record.selectedWorkflow.workflow.version ?? 'unknown'}` : 'none selected'}`, '', '## Outcome and evidence updates');
  if (!record.outcomes.length) lines.push('', 'No terminal outcome has been recorded.');
  else for (const outcome of record.outcomes) lines.push(`- ${outcome.at} · ${outcome.outcome} · ${outcome.verified ? 'verified' : 'not verified'} · ${outcome.countsTowardQuality ? 'league evidence updated' : 'quality evidence excluded'}${outcome.failureClass ? ` · failure class ${outcome.failureClass}` : ''}`);
  lines.push('', '## Measurements and immutable evidence');
  if (!observations.length) lines.push('', 'No provider/workflow measurements have been recorded.');
  else for (const observation of observations) {
    const subject = observation.route ? routeLabel(observation.route) : observation.workflow ? `${observation.workflow.id}@${observation.workflow.version ?? 'unknown'}` : 'workflow-only';
    const tokens = `input ${observation.usage.inputTokens ?? 'unavailable'} / output ${observation.usage.outputTokens ?? 'unavailable'} / total ${observation.usage.totalTokens ?? 'unavailable'}`;
    const cost = observation.cost === null ? 'unavailable' : `${observation.cost}${observation.currency ? ` ${observation.currency}` : ''}`;
    lines.push(`- ${observation.observedAt} · ${observation.evidenceKind} · evidence ${observation.id} · ${subject} · ${observation.verified ? 'verified' : 'not verified'} · quality ${observation.qualityScore ?? 'unavailable'} · tokens ${tokens} · cost ${cost} (${observation.costAuthority}) · latency ${observation.latencyMs ?? 'unavailable'}ms${observation.failureClass ? ` · failure ${observation.failureClass}` : ''}`);
  }
  lines.push('', 'This record contains operational facts only; private model reasoning is not stored.');
  return lines.join('\n');
}
function factList(value: DecisionFact | undefined) { if (Array.isArray(value)) return value.length ? value.map(item => typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item)).join('; ') : 'none'; return value === undefined || value === null ? 'none' : String(value); }

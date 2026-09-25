import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {ModelInvocationObservation} from './harness-efficiency.js';
import {redactSensitiveText} from './context-readers.js';
import {calculateVersionedApiCost} from './cost-accounting.js';
import type {ExecutionResourceSummary} from './resource-telemetry.js';

export type ModelLifecycleState = 'CANDIDATE' | 'QUALIFIED' | 'PREFERRED' | 'DEGRADED' | 'QUARANTINED' | 'RETIRED';
export type EvaluationAttemptStatus = 'QUEUED' | 'RUNNING' | 'PASSED' | 'FAILED' | 'BLOCKED' | 'UNAVAILABLE';
export type EvaluationFailureClass = 'CAPABILITY_UNAVAILABLE' | 'AUTHENTICATION_UNAVAILABLE' | 'PROVIDER_UNAVAILABLE' | 'VERIFICATION_FAILED' | 'TIMEOUT' | 'POLICY_DENIED' | 'ARCHITECTURE_REGRESSION' | 'UNKNOWN';
export type EvaluationOutcomeAttribution = 'MODEL_SUCCESS' | 'MODEL_FAILURE' | 'HARNESS_FAILURE' | 'TEST_INVALIDATED' | 'PROVIDER_FAILURE' | 'ENDPOINT_UNAVAILABLE' | 'INDETERMINATE';
export type QualificationCategory = 'coding' | 'repository-review' | 'bug-diagnosis' | 'code-modification' | 'reasoning' | 'retrieval' | 'large-context' | 'context-recovery' | 'long-running' | 'tool-calling' | 'browser-use' | 'computer-use' | 'steering' | 'parallel-work' | 'reviewer' | 'structured-output' | 'safety-scope';

export interface ModelCandidateIdentity {
  providerId: string;
  accountProfileId?: string;
  modelId: string;
  providerModel: string;
  runtimeId: string;
  runtimeVersion: string | null;
  modelVersion: string | null;
  nodeId: string;
  localArtifact?: {sha256: string; bytes: number; format: string; quantization?: string};
}

export interface FrozenQualificationTask {
  id: string;
  category: QualificationCategory;
  version: string;
  fixture: {
    execution: 'MODEL_STRUCTURED' | 'AGENT_CONTROL_WORKFLOW' | 'BROWSER' | 'COMPUTER';
    instruction: string;
    expectedEvidence: string[];
    forbiddenEvidence: string[];
  };
  inputSha256: string;
  scorer: {id: string; version: string; maximumScore: number; passScore: number};
  requiredCapabilities: string[];
  repetitions: number;
  seed: number;
  maximumDurationMs: number;
  safetyCritical?: boolean;
}
export interface FrozenQualificationSuite {schema: 'agent-control.frozen-qualification-suite/v1'; id: string; version: string; createdAt: string; tasks: FrozenQualificationTask[]; sha256: string;}

export interface EvaluationUsage {
  inputTokens: number | null;
  freshInputTokens: number | null;
  cachedInputTokens: number | null;
  cacheWriteTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  authority: 'PROVIDER_REPORTED' | 'ADAPTER_DERIVED' | 'ESTIMATED' | 'UNAVAILABLE';
}
export interface EvaluationCost {
  actual: number | null;
  calculated: number | null;
  equivalentUncached: number | null;
  estimatedCacheSavings: number | null;
  currency: string | null;
  authority: 'PROVIDER_REPORTED' | 'CALCULATED' | 'ESTIMATED' | 'UNAVAILABLE';
}
export interface EvaluationResources extends Omit<ExecutionResourceSummary, 'sampleCount' | 'attributedSampleCount' | 'samplingIntervalMs' | 'baseline' | 'devicePeakVramBytes' | 'source' | 'limitations'> {
  sampleCount?: number;
  attributedSampleCount?: number;
  samplingIntervalMs?: number;
  baseline?: ExecutionResourceSummary['baseline'];
  devicePeakVramBytes?: number | null;
  source?: string;
  limitations?: string[];
}

export interface ModelEvaluationAttempt {
  schema: 'agent-control.model-evaluation-attempt/v1';
  id: string;
  batchId: string;
  candidate: ModelCandidateIdentity;
  suiteId: string;
  suiteVersion: string;
  suiteSha256: string;
  taskId: string;
  taskVersion: string;
  category: QualificationCategory;
  scorerId: string;
  scorerVersion: string;
  repetition: number;
  seed: number;
  agentControlVersion: string;
  adapterVersion: string;
  promptVersion: string;
  status: EvaluationAttemptStatus;
  score: number | null;
  maximumScore: number;
  passed: boolean | null;
  verification: 'PASS' | 'FAIL' | 'UNAVAILABLE';
  criticalFailure: boolean;
  startedAt: string;
  completedAt: string | null;
  elapsedMs: number | null;
  retries: number;
  usage: EvaluationUsage;
  cost: EvaluationCost;
  resources: EvaluationResources;
  finishReason: string | null;
  failureClass: EvaluationFailureClass | null;
  outcomeAttribution: EvaluationOutcomeAttribution;
  failureDetail: string | null;
  evidence: string[];
  invocationIds: string[];
  capabilitiesObserved: string[];
}

export interface ModelEvaluationBatch {
  schema: 'agent-control.model-evaluation-batch/v1';
  id: string;
  suiteId: string;
  suiteVersion: string;
  suiteSha256: string;
  candidates: ModelCandidateIdentity[];
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'BLOCKED' | 'FAILED' | 'CANCELLED';
  attemptIds: string[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  requestedBy: string;
  reason: string;
}

export interface ModelStatusTransition {
  id: string; routeKey: string; from: ModelLifecycleState | null; to: ModelLifecycleState; at: string; actor: string; reason: string; evidence: string[]; approved: boolean;
}

export interface ModelPromotionPolicy {
  minimumSamples: number;
  minimumQualityRatio: number;
  minimumReliability: number;
  minimumRelativeImprovement: number;
  maximumCriticalFailures: number;
  maximumCostPerSuccess?: number;
  minimumRecentDays: number;
  humanApprovalForPreferred: boolean;
}

export interface ModelRegressionWarning {id: string; routeKey: string; category: QualificationCategory | 'overall'; metric: 'success-rate' | 'quality' | 'fresh-tokens' | 'latency' | 'cost'; baseline: number; recent: number; change: number; severity: 'WARNING' | 'CRITICAL'; sampleCount: number; baselineSampleCount: number; detectedAt: string; evidenceAttemptIds: string[];}

export interface ModelWindowMetrics {
  attempts: number; completed: number; executed: number; excludedAttempts: number; attribution: Record<EvaluationOutcomeAttribution, number>; passed: number; reliability: number | null; quality: number | null; criticalFailures: number; retries: number;
  inputTokens: number | null; freshInputTokens: number | null; cachedInputTokens: number | null; cacheWriteTokens: number | null; outputTokens: number | null; totalTokens: number | null;
  cacheHitRatio: number | null; cacheCoverage: {knownAttempts: number; totalAttempts: number}; estimatedCacheSavings: number | null;
  actualCost: number | null; calculatedCost: number | null; equivalentUncachedCost: number | null; currency: string | null;
  elapsedMs: number; costPerSuccessfulTask: number | null; tokensPerSuccessfulTask: number | null; freshTokensPerSuccessfulTask: number | null; timePerSuccessfulTaskMs: number | null; retriesPerSuccessfulTask: number | null;
  resourceCoverage: {measuredAttempts: number; totalAttempts: number};
}

export interface ModelIntelligenceProjection {
  schema: 'agent-control.model-intelligence/v1'; observedAt: string; queue: ModelEvaluationBatch[]; attempts: ModelEvaluationAttempt[];
  routes: Array<{routeKey: string; identity: ModelCandidateIdentity; state: ModelLifecycleState; today: ModelWindowMetrics; days7: ModelWindowMetrics; current: ModelWindowMetrics; days30: ModelWindowMetrics; days90: ModelWindowMetrics; allTime: ModelWindowMetrics; byCategory: Partial<Record<QualificationCategory, ModelWindowMetrics>>; regressions: ModelRegressionWarning[]}>;
  leaders: Record<string, {routeKey: string; value: number; sampleCount: number; basis: string} | null>;
  regressions: ModelRegressionWarning[]; transitions: ModelStatusTransition[];
}

export interface ModelEvaluationExecutionResult {
  observation: ModelInvocationObservation;
  score: number | null;
  passed: boolean | null;
  retries?: number;
  criticalFailure?: boolean;
  evidence?: string[];
  capabilitiesObserved?: string[];
  failureClass?: EvaluationFailureClass;
  outcomeAttribution?: EvaluationOutcomeAttribution;
}
export interface ModelEvaluationExecutorPort { execute(input: {batch: ModelEvaluationBatch; suite: FrozenQualificationSuite; task: FrozenQualificationTask; candidate: ModelCandidateIdentity; repetition: number}): Promise<ModelEvaluationExecutionResult>; }
export interface ModelEvaluationCoordinatorOptions {agentControlVersion: string; adapterVersion: string; promptVersion: string; clock?: () => string}

interface Snapshot {schema: 'agent-control.model-intelligence-ledger/v1'; attempts: ModelEvaluationAttempt[]; batches: ModelEvaluationBatch[]; transitions: ModelStatusTransition[]}

const defaultPolicy: ModelPromotionPolicy = {minimumSamples: 5, minimumQualityRatio: .75, minimumReliability: .9, minimumRelativeImprovement: .05, maximumCriticalFailures: 0, minimumRecentDays: 7, humanApprovalForPreferred: true};

export class ModelIntelligenceLedger {
  private readonly attempts = new Map<string, ModelEvaluationAttempt>(); private readonly batches = new Map<string, ModelEvaluationBatch>(); private readonly transitions: ModelStatusTransition[] = [];
  constructor(readonly file?: string, private readonly clock = () => new Date().toISOString()) {
    if (!file || !fs.existsSync(file)) return; const snapshot = JSON.parse(fs.readFileSync(file, 'utf8')) as Snapshot; if (snapshot.schema !== 'agent-control.model-intelligence-ledger/v1') throw new Error('model_intelligence_snapshot_invalid'); for (const item of snapshot.attempts) { const normalized = {...item, outcomeAttribution: item.outcomeAttribution ?? inferAttemptAttribution(item)}; validateAttempt(normalized); this.attempts.set(normalized.id, normalized); } let recovered = false; for (const item of snapshot.batches) { if (item.status === 'RUNNING') { item.status = 'QUEUED'; item.startedAt = null; recovered = true; } this.batches.set(item.id, item); } this.transitions.push(...(snapshot.transitions ?? [])); if (recovered) this.save();
  }
  createBatch(input: {suite: FrozenQualificationSuite; candidates: ModelCandidateIdentity[]; requestedBy: string; reason: string; id?: string; at?: string}) {
    validateFrozenSuite(input.suite); const at = input.at ?? this.clock(), id = input.id ?? `evaluation-batch-${randomUUID()}`; if (this.batches.has(id)) throw new Error('model_evaluation_batch_exists'); if (!input.candidates.length) throw new Error('model_evaluation_candidates_required');
    const candidates = input.candidates.map(sanitizeIdentity); if (new Set(candidates.map(modelRouteKey)).size !== candidates.length) throw new Error('model_evaluation_candidate_duplicate');
    const batch: ModelEvaluationBatch = {schema: 'agent-control.model-evaluation-batch/v1', id, suiteId: input.suite.id, suiteVersion: input.suite.version, suiteSha256: input.suite.sha256, candidates, status: 'QUEUED', attemptIds: [], createdAt: at, startedAt: null, completedAt: null, requestedBy: safeIdentifier(input.requestedBy), reason: safeText(input.reason, 2_048)}; this.batches.set(id, batch); this.save(); return structuredClone(batch);
  }
  startBatch(id: string, at = this.clock()) { const batch = this.mustBatch(id); if (batch.status !== 'QUEUED') throw new Error('model_evaluation_batch_not_queued'); batch.status = 'RUNNING'; batch.startedAt = at; this.save(); return structuredClone(batch); }
  finishBatch(id: string, status: Exclude<ModelEvaluationBatch['status'], 'QUEUED' | 'RUNNING'>, at = this.clock()) { const batch = this.mustBatch(id); if (!['QUEUED','RUNNING'].includes(batch.status)) throw new Error('model_evaluation_batch_terminal'); batch.status = status; batch.completedAt = at; this.save(); return structuredClone(batch); }
  recordAttempt(input: Omit<ModelEvaluationAttempt, 'schema' | 'id' | 'outcomeAttribution'> & {id?: string; outcomeAttribution?: EvaluationOutcomeAttribution}) {
    const item: ModelEvaluationAttempt = {schema: 'agent-control.model-evaluation-attempt/v1', ...structuredClone(input), id: input.id ?? `evaluation-attempt-${randomUUID()}`, candidate: sanitizeIdentity(input.candidate), outcomeAttribution: input.outcomeAttribution ?? inferAttemptAttribution(input), failureDetail: input.failureDetail ? safeText(input.failureDetail, 2_048) : null, evidence: safeList(input.evidence), invocationIds: safeList(input.invocationIds), capabilitiesObserved: safeList(input.capabilitiesObserved)};
    if (this.attempts.has(item.id)) throw new Error('model_evaluation_attempt_exists'); const batch = this.mustBatch(item.batchId); if (item.suiteSha256 !== batch.suiteSha256) throw new Error('model_evaluation_suite_identity_mismatch'); validateAttempt(item); this.attempts.set(item.id, item); if (!batch.attemptIds.includes(item.id)) batch.attemptIds.push(item.id); this.save(); return structuredClone(item);
  }
  recordInvocation(input: {batchId: string; suite: FrozenQualificationSuite; task: FrozenQualificationTask; candidate: ModelCandidateIdentity; observation: ModelInvocationObservation; score: number | null; passed: boolean | null; agentControlVersion: string; adapterVersion: string; promptVersion: string; repetition?: number; retries?: number; criticalFailure?: boolean; evidence?: string[]; capabilitiesObserved?: string[]; failureClass?: EvaluationFailureClass; outcomeAttribution?: EvaluationOutcomeAttribution}) {
    const observation = input.observation, usage: EvaluationUsage = {inputTokens: observation.usage.inputTokens, freshInputTokens: observation.usage.freshInputTokens, cachedInputTokens: observation.usage.cachedInputTokens, cacheWriteTokens: observation.usage.cacheWriteTokens, outputTokens: observation.usage.outputTokens, reasoningTokens: observation.usage.reasoningTokens, totalTokens: observation.usage.totalProcessedTokens, authority: observation.usageSource === 'provider-reported' ? 'PROVIDER_REPORTED' : observation.usageSource === 'estimated' ? 'ESTIMATED' : 'UNAVAILABLE'};
    const actual = observation.providerReportedCost, calculated = observation.calculatedCost, authority: EvaluationCost['authority'] = actual !== null ? 'PROVIDER_REPORTED' : calculated !== null ? 'CALCULATED' : 'UNAVAILABLE';
    const uncached = equivalentUncachedCost(observation), savings = uncached !== null && calculated !== null ? Math.max(0, uncached - calculated) : null, energy = observation.costAccounting?.localEnergy;
    const resources: EvaluationResources = observation.resources ? {...structuredClone(observation.resources), energyWh: energy?.energyWh ?? observation.resources.energyWh, authority: observation.resources.authority === 'MEASURED' || energy?.energyWh !== null && energy?.energyWh !== undefined && !energy.estimate ? 'MEASURED' : observation.resources.authority === 'ESTIMATED' || energy?.estimate ? 'ESTIMATED' : 'UNAVAILABLE'} : {cpuMs: null, gpuMs: null, peakRamBytes: null, peakVramBytes: null, energyWh: energy?.energyWh ?? null, authority: energy?.energyWh === null || energy?.energyWh === undefined ? 'UNAVAILABLE' : energy.estimate ? 'ESTIMATED' : 'MEASURED'};
    return this.recordAttempt({batchId: input.batchId, candidate: input.candidate, suiteId: input.suite.id, suiteVersion: input.suite.version, suiteSha256: input.suite.sha256, taskId: input.task.id, taskVersion: input.task.version, category: input.task.category, scorerId: input.task.scorer.id, scorerVersion: input.task.scorer.version, repetition: input.repetition ?? 1, seed: input.task.seed, agentControlVersion: input.agentControlVersion, adapterVersion: input.adapterVersion, promptVersion: input.promptVersion, status: input.passed === true ? 'PASSED' : input.passed === false ? 'FAILED' : observation.outcome === 'FAILED' ? 'FAILED' : 'UNAVAILABLE', score: input.score, maximumScore: input.task.scorer.maximumScore, passed: input.passed, verification: input.passed === true ? 'PASS' : input.passed === false ? 'FAIL' : 'UNAVAILABLE', criticalFailure: input.criticalFailure ?? false, startedAt: observation.startedAt, completedAt: observation.completedAt, elapsedMs: observation.elapsedMs, retries: input.retries ?? 0, usage, cost: {actual, calculated, equivalentUncached: uncached, estimatedCacheSavings: savings, currency: observation.currency, authority}, resources, finishReason: observation.finishReason, failureClass: input.failureClass ?? (input.passed === false ? 'VERIFICATION_FAILED' : null), outcomeAttribution: input.outcomeAttribution, failureDetail: observation.error, evidence: [...(input.evidence ?? []), ...observation.provenance.evidenceIds], invocationIds: [observation.id], capabilitiesObserved: input.capabilitiesObserved ?? []});
  }
  attemptsList(filter: {routeKey?: string; batchId?: string; category?: QualificationCategory; since?: string} = {}) { return [...this.attempts.values()].filter(item => (!filter.routeKey || modelRouteKey(item.candidate) === filter.routeKey) && (!filter.batchId || item.batchId === filter.batchId) && (!filter.category || item.category === filter.category) && (!filter.since || Date.parse(item.startedAt) >= Date.parse(filter.since))).sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt) || left.id.localeCompare(right.id)).map(item => structuredClone(item)); }
  batchesList() { return [...this.batches.values()].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)).map(item => structuredClone(item)); }
  state(routeKey: string) { return [...this.transitions].reverse().find(item => item.routeKey === routeKey)?.to ?? 'CANDIDATE'; }
  transition(input: {routeKey: string; to: ModelLifecycleState; actor: string; reason: string; evidence?: string[]; approved?: boolean; at?: string}) { const from = this.state(input.routeKey); if (!allowedModelTransition(from, input.to)) throw new Error(`model_status_transition_invalid:${from}:${input.to}`); if (input.to === 'QUALIFIED' && !this.promotionAssessment(input.routeKey).eligible) throw new Error('model_qualified_transition_evidence_insufficient'); if (input.to === 'PREFERRED' && (!input.approved || !this.promotionAssessment(input.routeKey).eligible)) throw new Error(!input.approved ? 'model_preferred_transition_requires_approval' : 'model_preferred_transition_evidence_insufficient'); const item: ModelStatusTransition = {id: `model-transition-${randomUUID()}`, routeKey: input.routeKey, from, to: input.to, at: input.at ?? this.clock(), actor: safeIdentifier(input.actor), reason: safeText(input.reason, 2_048), evidence: safeList(input.evidence ?? []), approved: input.approved ?? false}; this.transitions.push(item); this.save(); return structuredClone(item); }
  promotionAssessment(routeKey: string, incumbentRouteKey?: string, policy: Partial<ModelPromotionPolicy> = {}) {
    const effective = {...defaultPolicy, ...policy}, attempts = this.attemptsList({routeKey}), metrics = aggregateModelAttempts(attempts), incumbent = incumbentRouteKey ? aggregateModelAttempts(this.attemptsList({routeKey: incumbentRouteKey})) : undefined, reasons: string[] = [];
    const completedAttempts = attempts.filter(item => ['PASSED','FAILED'].includes(item.status)), spanDays = completedAttempts.length > 1 ? (Date.parse(completedAttempts.at(-1)!.startedAt) - Date.parse(completedAttempts[0].startedAt)) / 86_400_000 : 0;
    if (metrics.completed < effective.minimumSamples) reasons.push(`insufficient-samples:${metrics.completed}/${effective.minimumSamples}`); if (spanDays < effective.minimumRecentDays) reasons.push(`insufficient-history-days:${spanDays.toFixed(2)}/${effective.minimumRecentDays}`); if ((metrics.quality ?? 0) < effective.minimumQualityRatio) reasons.push(`quality-below-minimum:${metrics.quality ?? 'unavailable'}`); if ((metrics.reliability ?? 0) < effective.minimumReliability) reasons.push(`reliability-below-minimum:${metrics.reliability ?? 'unavailable'}`); if (metrics.criticalFailures > effective.maximumCriticalFailures) reasons.push(`critical-failures:${metrics.criticalFailures}`); if (effective.maximumCostPerSuccess !== undefined && (metrics.costPerSuccessfulTask === null || metrics.costPerSuccessfulTask > effective.maximumCostPerSuccess)) reasons.push('cost-per-success-unacceptable'); if (incumbent && incumbent.quality !== null && metrics.quality !== null && metrics.quality < incumbent.quality * (1 + effective.minimumRelativeImprovement)) reasons.push('improvement-not-meaningful');
    const regressions = detectRegressions(attempts, this.clock()); if (regressions.some(item => item.severity === 'CRITICAL')) reasons.push('critical-regression-detected');
    return {eligible: reasons.length === 0, targetState: reasons.length ? 'CANDIDATE' as const : 'QUALIFIED' as const, preferredRequiresHumanApproval: effective.humanApprovalForPreferred, metrics, incumbent, regressions, reasons: reasons.length ? reasons : ['evidence-thresholds-satisfied'], policy: effective};
  }
  projection(at = this.clock()): ModelIntelligenceProjection {
    const allAttempts = this.attemptsList(), routeKeys = [...new Set(allAttempts.map(item => modelRouteKey(item.candidate)))], routes = routeKeys.map(routeKey => { const attempts = this.attemptsList({routeKey}), identity = attempts.at(-1)!.candidate, days7 = aggregateModelAttempts(windowAttempts(attempts, 7, at)), categories = [...new Set(attempts.map(item => item.category))]; return {routeKey, identity, state: this.state(routeKey), today: aggregateModelAttempts(windowAttempts(attempts, 'today', at)), days7, current: days7, days30: aggregateModelAttempts(windowAttempts(attempts, 30, at)), days90: aggregateModelAttempts(windowAttempts(attempts, 90, at)), allTime: aggregateModelAttempts(attempts), byCategory: Object.fromEntries(categories.map(category => [category, aggregateModelAttempts(windowAttempts(attempts.filter(item => item.category === category), 30, at))])), regressions: detectRegressions(attempts, at)}; }), regressions = routes.flatMap(item => item.regressions);
    return {schema: 'agent-control.model-intelligence/v1', observedAt: at, queue: this.batchesList(), attempts: allAttempts.slice(-500), routes, leaders: leaders(routes), regressions, transitions: this.transitions.map(item => structuredClone(item))};
  }
  private mustBatch(id: string) { const item = this.batches.get(id); if (!item) throw new Error('model_evaluation_batch_missing'); return item; }
  private save() { if (!this.file) return; fs.mkdirSync(path.dirname(this.file), {recursive: true}); const temporary = `${this.file}.${process.pid}.tmp`, snapshot: Snapshot = {schema: 'agent-control.model-intelligence-ledger/v1', attempts: this.attemptsList(), batches: this.batchesList(), transitions: this.transitions}; fs.writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, {mode: 0o600}); fs.renameSync(temporary, this.file); }
}

/** Executes a queued frozen suite through a provider-neutral invocation and scoring port. */
export class ModelEvaluationCoordinator {
  private readonly clock: () => string;
  constructor(readonly ledger: ModelIntelligenceLedger, readonly suite: FrozenQualificationSuite, readonly executor: ModelEvaluationExecutorPort, readonly options: ModelEvaluationCoordinatorOptions) { validateFrozenSuite(suite); this.clock = options.clock ?? (() => new Date().toISOString()); }
  async runNext() { const batch = this.ledger.batchesList().find(item => item.status === 'QUEUED'); return batch ? this.runBatch(batch.id) : undefined; }
  async runBatch(id: string) {
    let batch = this.ledger.batchesList().find(item => item.id === id); if (!batch) throw new Error('model_evaluation_batch_missing'); if (batch.suiteSha256 !== this.suite.sha256) throw new Error('model_evaluation_suite_identity_mismatch'); batch = this.ledger.startBatch(id, this.clock());
    for (const candidate of batch.candidates) for (const task of this.suite.tasks) for (let repetition = 1; repetition <= task.repetitions; repetition++) {
      if (this.ledger.attemptsList({batchId: batch.id}).some(item => modelRouteKey(item.candidate) === modelRouteKey(candidate) && item.taskId === task.id && item.repetition === repetition)) continue;
      try {
        const result = await this.executor.execute({batch, suite: this.suite, task, candidate, repetition});
        this.ledger.recordInvocation({batchId: batch.id, suite: this.suite, task, candidate, observation: result.observation, score: result.score, passed: result.passed, agentControlVersion: this.options.agentControlVersion, adapterVersion: this.options.adapterVersion, promptVersion: this.options.promptVersion, repetition, retries: result.retries, criticalFailure: result.criticalFailure, evidence: result.evidence, capabilitiesObserved: result.capabilitiesObserved, failureClass: result.failureClass, outcomeAttribution: result.outcomeAttribution});
      } catch (error) {
        const at = this.clock(), classification = classifyEvaluationFailure(error);
        this.ledger.recordAttempt({batchId: batch.id, candidate, suiteId: this.suite.id, suiteVersion: this.suite.version, suiteSha256: this.suite.sha256, taskId: task.id, taskVersion: task.version, category: task.category, scorerId: task.scorer.id, scorerVersion: task.scorer.version, repetition, seed: task.seed, agentControlVersion: this.options.agentControlVersion, adapterVersion: this.options.adapterVersion, promptVersion: this.options.promptVersion, status: classification === 'POLICY_DENIED' ? 'BLOCKED' : 'UNAVAILABLE', score: null, maximumScore: task.scorer.maximumScore, passed: null, verification: 'UNAVAILABLE', criticalFailure: task.safetyCritical === true && classification === 'ARCHITECTURE_REGRESSION', startedAt: at, completedAt: at, elapsedMs: 0, retries: 0, usage: unavailableUsage(), cost: unavailableCost(), resources: unavailableResources(), finishReason: null, failureClass: classification, failureDetail: error instanceof Error ? error.message : String(error), evidence: [], invocationIds: [], capabilitiesObserved: []});
      }
    }
    const attempts = this.ledger.attemptsList({batchId: batch.id}), measured = attempts.filter(item => ['PASSED','FAILED'].includes(item.status)).length, unavailable = attempts.filter(item => ['UNAVAILABLE','BLOCKED'].includes(item.status)).length;
    return this.ledger.finishBatch(batch.id, measured === 0 && unavailable > 0 ? 'BLOCKED' : unavailable ? 'PARTIAL' : 'COMPLETED', this.clock());
  }
}

export function freezeQualificationSuite(input: Omit<FrozenQualificationSuite, 'schema' | 'sha256'>): FrozenQualificationSuite { const base = {schema: 'agent-control.frozen-qualification-suite/v1' as const, ...structuredClone(input)}, suite = {...base, sha256: sha(base)}; validateFrozenSuite(suite); return suite; }
export function loadFrozenQualificationSuite(file: string) { const value = JSON.parse(fs.readFileSync(file, 'utf8')) as FrozenQualificationSuite; validateFrozenSuite(value); return structuredClone(value); }
export function validateFrozenSuite(suite: FrozenQualificationSuite) { if (suite.schema !== 'agent-control.frozen-qualification-suite/v1' || !suite.id || !suite.version || !suite.tasks.length) throw new Error('frozen_qualification_suite_invalid'); const {sha256, ...base} = suite; if (sha(base) !== sha256) throw new Error('frozen_qualification_suite_hash_invalid'); const ids = new Set<string>(); for (const task of suite.tasks) { const fixture = task.fixture; if (ids.has(task.id) || !task.inputSha256.match(/^[a-f0-9]{64}$/) || !fixture || !['MODEL_STRUCTURED','AGENT_CONTROL_WORKFLOW','BROWSER','COMPUTER'].includes(fixture.execution) || !fixture.instruction.trim() || !fixture.expectedEvidence.length || fixture.expectedEvidence.some(item => !item.trim()) || fixture.forbiddenEvidence.some(item => !item.trim()) || sha(fixture) !== task.inputSha256 || task.scorer.maximumScore <= 0 || task.scorer.passScore < 0 || task.scorer.passScore > task.scorer.maximumScore || task.repetitions < 1 || !Number.isSafeInteger(task.seed) || !Number.isSafeInteger(task.maximumDurationMs) || task.maximumDurationMs < 1) throw new Error('frozen_qualification_task_invalid'); ids.add(task.id); } return true; }

export function aggregateModelAttempts(attempts: ModelEvaluationAttempt[]): ModelWindowMetrics {
  const executed = attempts.filter(item => ['PASSED','FAILED'].includes(item.status)), completed = executed.filter(item => ['MODEL_SUCCESS','MODEL_FAILURE'].includes(item.outcomeAttribution)), passed = completed.filter(item => item.passed === true), completeSum = (selector: (item: ModelEvaluationAttempt) => number | null) => completed.length > 0 && completed.every(item => selector(item) !== null) ? completed.reduce((sum, item) => sum + (selector(item) ?? 0), 0) : null;
  const cacheKnown = completed.filter(item => item.usage.freshInputTokens !== null && item.usage.cachedInputTokens !== null), cacheFresh = cacheKnown.reduce((sum, item) => sum + item.usage.freshInputTokens!, 0), cacheRead = cacheKnown.reduce((sum, item) => sum + item.usage.cachedInputTokens!, 0), scoreKnown = completed.filter(item => item.score !== null), actualCost = completeSum(item => item.cost.actual), calculatedCost = completeSum(item => item.cost.calculated), currencyValues = [...new Set(completed.map(item => item.cost.currency).filter((value): value is string => Boolean(value)))], measuredResources = completed.filter(item => item.resources.authority === 'MEASURED');
  const totalTokens = completeSum(item => item.usage.totalTokens), freshInputTokens = completeSum(item => item.usage.freshInputTokens), elapsedMs = completed.reduce((sum, item) => sum + (item.elapsedMs ?? 0), 0), retries = completed.reduce((sum, item) => sum + item.retries, 0), effectiveCost = actualCost ?? calculatedCost, attribution = Object.fromEntries(['MODEL_SUCCESS','MODEL_FAILURE','HARNESS_FAILURE','TEST_INVALIDATED','PROVIDER_FAILURE','ENDPOINT_UNAVAILABLE','INDETERMINATE'].map(value => [value, attempts.filter(item => item.outcomeAttribution === value).length])) as Record<EvaluationOutcomeAttribution, number>;
  return {attempts: attempts.length, completed: completed.length, executed: executed.length, excludedAttempts: attempts.length-completed.length, attribution, passed: passed.length, reliability: completed.length ? passed.length / completed.length : null, quality: scoreKnown.length ? scoreKnown.reduce((sum, item) => sum + item.score! / item.maximumScore, 0) / scoreKnown.length : null, criticalFailures: completed.filter(item => item.criticalFailure).length, retries, inputTokens: completeSum(item => item.usage.inputTokens), freshInputTokens, cachedInputTokens: completeSum(item => item.usage.cachedInputTokens), cacheWriteTokens: completeSum(item => item.usage.cacheWriteTokens), outputTokens: completeSum(item => item.usage.outputTokens), totalTokens, cacheHitRatio: cacheKnown.length && cacheFresh + cacheRead > 0 ? cacheRead / (cacheFresh + cacheRead) : null, cacheCoverage: {knownAttempts: cacheKnown.length, totalAttempts: completed.length}, estimatedCacheSavings: completeSum(item => item.cost.estimatedCacheSavings), actualCost, calculatedCost, equivalentUncachedCost: completeSum(item => item.cost.equivalentUncached), currency: currencyValues.length === 1 ? currencyValues[0] : null, elapsedMs, costPerSuccessfulTask: divide(effectiveCost, passed.length), tokensPerSuccessfulTask: divide(totalTokens, passed.length), freshTokensPerSuccessfulTask: divide(freshInputTokens, passed.length), timePerSuccessfulTaskMs: passed.length ? elapsedMs / passed.length : null, retriesPerSuccessfulTask: passed.length ? retries / passed.length : null, resourceCoverage: {measuredAttempts: measuredResources.length, totalAttempts: completed.length}};
}

export function detectRegressions(attempts: ModelEvaluationAttempt[], at = new Date().toISOString(), options: {minimumSamples?: number; recentDays?: number; baselineDays?: number; successDrop?: number; qualityDrop?: number; inflation?: number} = {}) {
  const minimum = options.minimumSamples ?? 3, recentStart = Date.parse(at) - (options.recentDays ?? 7) * 86_400_000, baselineStart = Date.parse(at) - (options.baselineDays ?? 30) * 86_400_000, recent = attempts.filter(item => Date.parse(item.startedAt) >= recentStart), baseline = attempts.filter(item => Date.parse(item.startedAt) >= baselineStart && Date.parse(item.startedAt) < recentStart); if (recent.length < minimum || baseline.length < minimum) return [];
  const routeKey = modelRouteKey(attempts.at(-1)!.candidate), recentMetrics = aggregateModelAttempts(recent), baselineMetrics = aggregateModelAttempts(baseline), warnings: ModelRegressionWarning[] = [];
  const lower = (metric: ModelRegressionWarning['metric'], before: number | null, after: number | null, threshold: number) => { if (before === null || after === null || before - after < threshold) return; warnings.push(warning(routeKey, metric, before, after, after - before, recent, baseline, at)); };
  const higher = (metric: ModelRegressionWarning['metric'], before: number | null, after: number | null, threshold: number) => { if (before === null || after === null || before <= 0 || (after - before) / before < threshold) return; warnings.push(warning(routeKey, metric, before, after, (after - before) / before, recent, baseline, at)); };
  lower('success-rate', baselineMetrics.reliability, recentMetrics.reliability, options.successDrop ?? .15); lower('quality', baselineMetrics.quality, recentMetrics.quality, options.qualityDrop ?? .15); higher('fresh-tokens', baselineMetrics.freshTokensPerSuccessfulTask, recentMetrics.freshTokensPerSuccessfulTask, options.inflation ?? .35); higher('latency', baselineMetrics.timePerSuccessfulTaskMs, recentMetrics.timePerSuccessfulTaskMs, options.inflation ?? .35); higher('cost', baselineMetrics.costPerSuccessfulTask, recentMetrics.costPerSuccessfulTask, options.inflation ?? .35); return warnings;
}

export function modelRouteKey(identity: ModelCandidateIdentity) { return `${identity.providerId}/${identity.accountProfileId ?? 'default'}/${identity.modelId}@${identity.nodeId}/${identity.runtimeId}`; }

function leaders(routes: ModelIntelligenceProjection['routes']): ModelIntelligenceProjection['leaders'] {
  const qualified = routes.filter(item => ['QUALIFIED','PREFERRED'].includes(item.state) && item.current.completed >= defaultPolicy.minimumSamples && (item.current.reliability ?? 0) >= defaultPolicy.minimumReliability);
  const best = (selector: (route: ModelIntelligenceProjection['routes'][number]) => number | null, basis: string, order: 'max' | 'min' = 'max', sampleCount: (route: ModelIntelligenceProjection['routes'][number]) => number = route => route.current.completed) => { const ranked = qualified.map(route => ({route, value: selector(route)})).filter((item): item is {route: typeof qualified[number]; value: number} => item.value !== null).sort((left, right) => order === 'max' ? right.value - left.value : left.value - right.value); const item = ranked[0]; return item ? {routeKey: item.route.routeKey, value: item.value, sampleCount: sampleCount(item.route), basis} : null; };
  const categoryBest = (category: QualificationCategory, basis: string) => best(route => { const metrics = route.byCategory[category]; return metrics && metrics.completed >= defaultPolicy.minimumSamples && (metrics.reliability ?? 0) >= defaultPolicy.minimumReliability ? metrics.quality : null; }, basis, 'max', route => route.byCategory[category]?.completed ?? 0);
  const local = qualified.filter(item => Boolean(item.identity.localArtifact));
  return {
    bestCurrentCodingModel: categoryBest('coding', '30-day frozen-suite coding quality'),
    bestRepositoryReviewModel: categoryBest('repository-review', '30-day frozen-suite repository-review quality'),
    bestValueModel: best(item => item.current.costPerSuccessfulTask, 'lowest cost per verified successful task', 'min'),
    bestLocalModel: (() => { const item = local.filter(value => value.current.quality !== null).sort((a,b) => b.current.quality! - a.current.quality!)[0]; return item ? {routeKey: item.routeKey, value: item.current.quality!, sampleCount: item.current.completed, basis: 'local artifact verified quality'} : null; })(),
    fastestModel: best(item => item.current.timePerSuccessfulTaskMs, 'lowest elapsed time per verified successful task', 'min'),
    bestComputerUseModel: categoryBest('computer-use', '30-day verified computer-use quality'),
    mostReliableModel: best(item => item.current.reliability, 'verified completion reliability'),
    bestLargeContextModel: categoryBest('large-context', '30-day frozen-suite large-context quality'),
  };
}
function windowAttempts(attempts: ModelEvaluationAttempt[], window: 'today' | number, at: string) { const end = Date.parse(at), start = window === 'today' ? new Date(at).setUTCHours(0,0,0,0) : end - window * 86_400_000; return attempts.filter(item => { const value = Date.parse(item.startedAt); return value >= start && value <= end; }); }
function warning(routeKey: string, metric: ModelRegressionWarning['metric'], baseline: number, recent: number, change: number, recentAttempts: ModelEvaluationAttempt[], baselineAttempts: ModelEvaluationAttempt[], at: string): ModelRegressionWarning { return {id: `regression:${sha({routeKey,metric,at}).slice(0,24)}`, routeKey, category: 'overall', metric, baseline, recent, change, severity: Math.abs(change) >= .5 || metric === 'success-rate' && baseline - recent >= .3 ? 'CRITICAL' : 'WARNING', sampleCount: recentAttempts.length, baselineSampleCount: baselineAttempts.length, detectedAt: at, evidenceAttemptIds: [...recentAttempts, ...baselineAttempts].map(item => item.id)}; }
function allowedModelTransition(from: ModelLifecycleState, to: ModelLifecycleState) { const allowed: Record<ModelLifecycleState, ModelLifecycleState[]> = {CANDIDATE:['QUALIFIED','QUARANTINED','RETIRED'],QUALIFIED:['PREFERRED','DEGRADED','QUARANTINED','RETIRED'],PREFERRED:['QUALIFIED','DEGRADED','QUARANTINED','RETIRED'],DEGRADED:['QUALIFIED','QUARANTINED','RETIRED'],QUARANTINED:['CANDIDATE','RETIRED'],RETIRED:[]}; return allowed[from].includes(to); }
function classifyEvaluationFailure(error: unknown): EvaluationFailureClass { const value = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase(); return /auth|credential|login/.test(value) ? 'AUTHENTICATION_UNAVAILABLE' : /capability_observation_exists|architecture|contract|schema/.test(value) ? 'ARCHITECTURE_REGRESSION' : /capabilit|unsupported/.test(value) ? 'CAPABILITY_UNAVAILABLE' : /provider|endpoint|connection|network/.test(value) ? 'PROVIDER_UNAVAILABLE' : /timeout|timed out/.test(value) ? 'TIMEOUT' : /policy|denied|approval/.test(value) ? 'POLICY_DENIED' : 'UNKNOWN'; }
function inferAttemptAttribution(item: Pick<ModelEvaluationAttempt, 'status' | 'passed' | 'failureClass'>): EvaluationOutcomeAttribution {
  if (item.status === 'PASSED' || item.passed === true) return 'MODEL_SUCCESS';
  if (item.status === 'FAILED' && item.failureClass === 'VERIFICATION_FAILED') return 'MODEL_FAILURE';
  if (item.failureClass === 'ARCHITECTURE_REGRESSION') return 'HARNESS_FAILURE';
  if (item.failureClass === 'PROVIDER_UNAVAILABLE' || item.failureClass === 'AUTHENTICATION_UNAVAILABLE') return 'PROVIDER_FAILURE';
  if (item.failureClass === 'TIMEOUT' || item.failureClass === 'UNKNOWN') return 'INDETERMINATE';
  if (item.failureClass === 'CAPABILITY_UNAVAILABLE' || item.failureClass === 'POLICY_DENIED' || ['BLOCKED','UNAVAILABLE'].includes(item.status)) return 'TEST_INVALIDATED';
  return item.status === 'FAILED' ? 'MODEL_FAILURE' : 'INDETERMINATE';
}
function equivalentUncachedCost(observation: ModelInvocationObservation) { const pricing = observation.costAccounting?.cloud?.pricingBasis, usage = observation.usage; if (!pricing || usage.inputTokens === null) return null; return calculateVersionedApiCost({inputTokens: usage.inputTokens, freshInputTokens: usage.inputTokens, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: usage.outputTokens, reasoningTokens: usage.reasoningTokens}, pricing); }
function unavailableUsage(): EvaluationUsage { return {inputTokens:null,freshInputTokens:null,cachedInputTokens:null,cacheWriteTokens:null,outputTokens:null,reasoningTokens:null,totalTokens:null,authority:'UNAVAILABLE'}; }
function unavailableCost(): EvaluationCost { return {actual:null,calculated:null,equivalentUncached:null,estimatedCacheSavings:null,currency:null,authority:'UNAVAILABLE'}; }
function unavailableResources(): EvaluationResources { return {cpuMs:null,gpuMs:null,peakRamBytes:null,peakVramBytes:null,energyWh:null,authority:'UNAVAILABLE'}; }
function validateAttempt(item: ModelEvaluationAttempt) { if (item.schema !== 'agent-control.model-evaluation-attempt/v1' || !item.id || !item.batchId || !item.suiteSha256.match(/^[a-f0-9]{64}$/) || !['MODEL_SUCCESS','MODEL_FAILURE','HARNESS_FAILURE','TEST_INVALIDATED','PROVIDER_FAILURE','ENDPOINT_UNAVAILABLE','INDETERMINATE'].includes(item.outcomeAttribution) || item.score !== null && (item.score < 0 || item.score > item.maximumScore) || item.elapsedMs !== null && item.elapsedMs < 0 || Number.isNaN(Date.parse(item.startedAt))) throw new Error('model_evaluation_attempt_invalid'); }
function sanitizeIdentity(value: ModelCandidateIdentity): ModelCandidateIdentity { return {providerId:safeIdentifier(value.providerId),...(value.accountProfileId?{accountProfileId:safeIdentifier(value.accountProfileId)}:{}),modelId:safeIdentifier(value.modelId),providerModel:safeText(value.providerModel,256),runtimeId:safeIdentifier(value.runtimeId),runtimeVersion:value.runtimeVersion?safeText(value.runtimeVersion,128):null,modelVersion:value.modelVersion?safeText(value.modelVersion,128):null,nodeId:safeIdentifier(value.nodeId),...(value.localArtifact?{localArtifact:{sha256:value.localArtifact.sha256,bytes:value.localArtifact.bytes,format:safeText(value.localArtifact.format,128),...(value.localArtifact.quantization?{quantization:safeText(value.localArtifact.quantization,128)}:{})}}:{})}; }
function safeList(values:string[]){return[...new Set(values.map(value=>safeText(value,2_048)).filter(Boolean))];} function safeText(value:string,maximum:number){const safe=redactSensitiveText(String(value)).replace(/[\r\n]+/g,' ').trim();return safe.length<=maximum?safe:`${safe.slice(0,maximum-3)}...`;} function safeIdentifier(value:string){const safe=safeText(value,256);if(!/^[a-z0-9][a-z0-9:._/@-]*$/i.test(safe))return `sha256:${sha(safe)}`;return safe;} function divide(value:number|null,denominator:number){return value===null||denominator===0?null:value/denominator;} function sha(value:unknown){return createHash('sha256').update(stableJson(value)).digest('hex');} function stableJson(value:unknown):string{if(Array.isArray(value))return`[${value.map(stableJson).join(',')}]`;if(value&&typeof value==='object')return`{${Object.entries(value).sort(([left],[right])=>left.localeCompare(right)).map(([key,item])=>`${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;return JSON.stringify(value);}

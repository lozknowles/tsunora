import {createHash} from 'node:crypto';
import type {HarnessEscalationReason, HarnessProfileName, ModelInvocationObservation, NormalizedProviderUsage} from './harness-efficiency.js';

export type MutationTaskClass =
  | 'trivial_bounded_edit'
  | 'one_file_bug_fix'
  | 'test_addition'
  | 'type_api_correction'
  | 'two_file_coordinated_change'
  | 'configuration_and_implementation'
  | 'existing_abstraction_reuse'
  | 'cross_module_change'
  | 'architecture_documentation_contract'
  | 'shared_context_provenance'
  | 'ambiguous_repository_search_bug'
  | 'architecture_level_modification';

export interface MutationTaskFeatures {
  knownExactTargets: boolean;
  estimatedFiles: number;
  referencedModules: number;
  repositorySearchRequired: boolean;
  architecturalTerms: boolean;
  verifierComplexity: 'low' | 'medium' | 'high';
  ambiguity: number;
  risk: 'low' | 'medium' | 'high';
  sharedContextRequired: boolean;
  historicalContextRequired: boolean;
}

export interface MutationBenchmarkTask {
  id: string;
  taskClass: MutationTaskClass;
  description: string;
  allowedFiles: string[];
  requiredChangedFiles: string[];
  verifierId: string;
  acceptance: string[];
  expectedMinimumProfile: HarnessProfileName;
  timeoutMs: number;
  tokenBudget: number;
  escalationPermitted: boolean;
  expectedMutation: {minimumFiles: number; maximumFiles: number; maximumChangedLines: number};
  features: MutationTaskFeatures;
}

export interface MutationBenchmarkSuite {
  schema: 'agent-control.harness-mutation-suite/v1';
  suiteId: string;
  frozenAt: string;
  fixturePath: string;
  fixtureSha256: string;
  startingRevision: 'fixture-content-sha256';
  modelParameters: Record<string, string | number | boolean>;
  tasks: MutationBenchmarkTask[];
}

export interface PredictedContextProfile {
  profile: HarnessProfileName;
  confidence: number;
  reasons: string[];
  features: MutationTaskFeatures;
}

export type MutationStrategy = 'THIN_ONLY' | 'STANDARD_ONLY' | 'DEEP_ONLY' | 'ADAPTIVE_THIN_STANDARD_DEEP' | 'PREDICTED_ADAPTIVE';

export interface MutationVerifierCheck {
  id: string;
  passed: boolean;
  detail: string;
  durationMs: number;
  evidenceIds: string[];
}

export interface MutationRetrievalResult {
  mode: 'BUILTIN' | 'ZG';
  outcome: 'SUCCEEDED' | 'GOVERNED_FALLBACK';
  packetId: string | null;
  packetSha256: string | null;
  assessment: 'EVIDENCE_SUFFICIENT' | 'EVIDENCE_AMBIGUOUS' | 'EVIDENCE_INSUFFICIENT';
  providerId: string;
  strategy: string;
  evidenceBytes: number;
  evidenceTokens: number;
  retrievalCalls: number;
  latencyMs: number;
  rawBytesAvoided: number;
  references: string[];
  fallbackReason: string | null;
}

export interface MutationVerifierResult {
  schema: 'agent-control.mutation-verifier/v1';
  taskId: string;
  passed: boolean;
  startedAt: string;
  completedAt: string;
  checks: MutationVerifierCheck[];
  changedFiles: string[];
  addedLines: number;
  deletedLines: number;
  diffSha256: string;
  failureClass: 'NONE' | 'NO_MUTATION' | 'SCOPE_VIOLATION' | 'SYNTAX' | 'PUBLIC_TEST' | 'HIDDEN_VERIFIER' | 'SECURITY' | 'DIFF_INVALID' | 'TIMEOUT' | 'EXECUTION';
}

export interface MutationAttemptResult {
  attemptId: string;
  taskId: string;
  strategy: MutationStrategy;
  profile: HarnessProfileName;
  attemptNumber: number;
  startedAt: string;
  completedAt: string;
  elapsedMs: number;
  predictedProfile: HarnessProfileName;
  predictionConfidence: number;
  predictionReasons: string[];
  contextPacketId: string;
  contextSourceIds: string[];
  omittedContextSourceIds: string[];
  recipeId: string | null;
  invocationIds: string[];
  usage: NormalizedProviderUsage;
  initialProviderInputTokens: number | null;
  persistentEstimatedContextTokens: number | null;
  turns: number;
  toolCalls: number;
  toolIds: string[];
  repositoryReads: number;
  repositorySearches: number;
  mutationsAttempted: number;
  verifierAttempts: number;
  verifier: MutationVerifierResult;
  verifiedSuccess: boolean;
  failureReason: string | null;
  escalationReason: HarnessEscalationReason | null;
  checkpointDiffSha256: string;
  evidenceIds: string[];
  retrieval?: MutationRetrievalResult;
}

export interface MutationOutcomeResult {
  outcomeId: string;
  taskId: string;
  taskClass: MutationTaskClass;
  strategy: MutationStrategy;
  predictedContextProfile: PredictedContextProfile;
  actualSuccessfulMinimumProfile: HarnessProfileName | null;
  startingProfile: HarnessProfileName;
  attempts: MutationAttemptResult[];
  escalationCount: number;
  verifiedSuccess: boolean;
  finalProfile: HarnessProfileName;
  cumulativeUsage: NormalizedProviderUsage;
  cumulativeTurns: number;
  cumulativeToolCalls: number;
  cumulativeLatencyMs: number;
  monetaryCost: null;
  monetaryCostReason: string;
  finalVerifier: MutationVerifierResult;
  provenance: {fixtureSha256: string; startingRevision: string; attemptIds: string[]; evidenceIds: string[]};
}

export interface MutationStrategyAggregate {
  strategy: MutationStrategy;
  tasksAttempted: number;
  verifiedSuccesses: number;
  successRate: number;
  freshInputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  totalProcessedTokens: number | null;
  medianInitialProviderInputTokens: number | null;
  medianPersistentContextTokens: number | null;
  cumulativeTokensPerVerifiedOutcome: number | null;
  freshTokensPerVerifiedOutcome: number | null;
  cacheEffectiveness: number | null;
  medianLatencyMs: number | null;
  escalationCount: number;
  verifierFailures: number;
  timeoutCount: number;
  monetaryCostPerVerifiedOutcome: null;
}

export interface ProductionRoutingGate {
  qualified: boolean;
  evaluatedAt: string;
  criteria: Array<{id: string; passed: boolean; detail: string}>;
  appliedProductionMode: 'OBSERVATIONAL_STANDARD_FALLBACK';
  minimumTaskSample: number;
}

export interface MutationQualificationReport {
  schema: 'agent-control.harness-mutation-report/v1';
  benchmarkId: string;
  suiteId: string;
  generatedAt: string;
  classification: 'LIVE_SAME_MODEL_REAL_REPOSITORY_MUTATION_EXPERIMENT';
  modelControl: {model: string; provider: string; parameters: Record<string, string | number | boolean>; sameModelAcrossStrategies: true; liveModelInvoked: true};
  fixture: {path: string; sha256: string; canonicalRepositoryMutated: false; disposableWorkspaces: true};
  cache: {resetPerformed: false; condition: 'provider_observed_existing_state'; comparabilityLimitation: string};
  outcomes: MutationOutcomeResult[];
  aggregates: Record<MutationStrategy, MutationStrategyAggregate>;
  productionRoutingGate: ProductionRoutingGate;
  conclusions: {
    thinForBoundedWork: boolean;
    standardAsFallback: true;
    immediateDeepClassificationSupported: boolean;
    adaptiveEscalationSupported: boolean;
    automaticProductionRoutingSupported: boolean;
    monetaryCostPerVerifiedOutcome: null;
    monetaryCostReason: string;
  };
  governance: {routingMode: 'EXPERIMENT'; productionRoutingChanged: false; typedToolsOnly: true; unrestrictedShellExposed: false; independentVerificationRequired: true; humanTakeoverPrecedence: true};
}

const PROFILE_RANK: Record<HarnessProfileName, number> = {THIN: 0, STANDARD: 1, DEEP: 2};
const TASK_CLASSES = new Set<MutationTaskClass>(['trivial_bounded_edit', 'one_file_bug_fix', 'test_addition', 'type_api_correction', 'two_file_coordinated_change', 'configuration_and_implementation', 'existing_abstraction_reuse', 'cross_module_change', 'architecture_documentation_contract', 'shared_context_provenance', 'ambiguous_repository_search_bug', 'architecture_level_modification']);
const PROFILES = new Set<HarnessProfileName>(['THIN', 'STANDARD', 'DEEP']);

export function parseMutationBenchmarkSuite(input: unknown): MutationBenchmarkSuite {
  if (!isObject(input) || input.schema !== 'agent-control.harness-mutation-suite/v1') throw new Error('mutation_suite_schema_invalid');
  const allowed = new Set(['schema', 'suiteId', 'frozenAt', 'fixturePath', 'fixtureSha256', 'startingRevision', 'modelParameters', 'tasks']);
  if (Object.keys(input).some(key => !allowed.has(key))) throw new Error('mutation_suite_unknown_field');
  if (!string(input.suiteId, 128) || !validTimestamp(input.frozenAt) || !relativePath(input.fixturePath) || !/^[a-f0-9]{64}$/.test(String(input.fixtureSha256)) || input.startingRevision !== 'fixture-content-sha256') throw new Error('mutation_suite_identity_invalid');
  if (!isObject(input.modelParameters) || !Array.isArray(input.tasks) || input.tasks.length < 1 || input.tasks.length > 100) throw new Error('mutation_suite_content_invalid');
  const tasks = input.tasks.map(parseTask);
  if (new Set(tasks.map(task => task.id)).size !== tasks.length) throw new Error('mutation_suite_duplicate_task');
  return {schema: input.schema, suiteId: input.suiteId, frozenAt: input.frozenAt, fixturePath: input.fixturePath, fixtureSha256: input.fixtureSha256, startingRevision: input.startingRevision, modelParameters: structuredClone(input.modelParameters as Record<string, string | number | boolean>), tasks};
}

export function predictMutationContextProfile(task: MutationBenchmarkTask): PredictedContextProfile {
  const features = task.features;
  const reasons: string[] = [];
  let profile: HarnessProfileName;
  let confidence: number;
  if (features.architecturalTerms || features.sharedContextRequired || features.historicalContextRequired || features.ambiguity >= .7 || features.risk === 'high' || features.referencedModules >= 5) {
    profile = 'DEEP';
    confidence = .82;
    if (features.architecturalTerms) reasons.push('architectural_contract');
    if (features.sharedContextRequired) reasons.push('shared_context_required');
    if (features.historicalContextRequired) reasons.push('historical_context_required');
    if (features.ambiguity >= .7) reasons.push('high_ambiguity');
    if (features.risk === 'high') reasons.push('high_risk');
    if (features.referencedModules >= 5) reasons.push('broad_dependency_surface');
  } else if (features.knownExactTargets && features.estimatedFiles <= 1 && !features.repositorySearchRequired && features.verifierComplexity !== 'high' && features.ambiguity <= .2 && features.risk === 'low') {
    profile = 'THIN'; confidence = .88; reasons.push('bounded_exact_target', 'deterministic_narrow_scope');
  } else {
    profile = 'STANDARD'; confidence = .72; reasons.push('ordinary_multi_step_repository_work');
    if (features.repositorySearchRequired) reasons.push('repository_search_required');
    if (features.estimatedFiles > 1) reasons.push('coordinated_file_scope');
    if (features.verifierComplexity === 'medium') reasons.push('multi_stage_verifier');
  }
  return {profile, confidence, reasons, features: structuredClone(features)};
}

export function classifyMutationEscalation(task: MutationBenchmarkTask, profile: HarnessProfileName, verifier: MutationVerifierResult, executionError?: string | null): HarnessEscalationReason | null {
  const error = executionError ?? '';
  if (/tool_policy_denied|human_owns_execution|stale_(lease|ownership)|scope_violation|forbidden|security/i.test(error) || ['SCOPE_VIOLATION', 'SECURITY'].includes(verifier.failureClass)) return null;
  if (/cancel/i.test(error)) return null;
  if (/timeout|turn_limit|token_budget/i.test(error) || verifier.failureClass === 'TIMEOUT') return 'tool_limitation';
  if (/missing_context|insufficient_context/i.test(error) || PROFILE_RANK[profile] < PROFILE_RANK[task.expectedMinimumProfile]) return 'missing_context';
  if (verifier.failureClass === 'PUBLIC_TEST') return 'test_failure';
  if (verifier.failureClass === 'HIDDEN_VERIFIER') return task.features.repositorySearchRequired ? 'unexpected_dependency' : 'verifier_rejection';
  if (verifier.failureClass === 'NO_MUTATION') return 'model_uncertainty';
  if (verifier.failureClass === 'SYNTAX' || verifier.failureClass === 'DIFF_INVALID') return 'execution_failure';
  return verifier.passed ? null : 'execution_failure';
}

export function aggregateInvocationUsage(invocations: ModelInvocationObservation[]): NormalizedProviderUsage {
  const complete = (select: (item: ModelInvocationObservation) => number | null) => invocations.length > 0 && invocations.every(item => select(item) !== null) ? invocations.reduce((sum, item) => sum + select(item)!, 0) : null;
  return {
    inputTokens: complete(item => item.usage.inputTokens),
    freshInputTokens: complete(item => item.usage.freshInputTokens),
    cachedInputTokens: complete(item => item.usage.cachedInputTokens),
    cacheWriteTokens: complete(item => item.usage.cacheWriteTokens),
    outputTokens: complete(item => item.usage.outputTokens),
    reasoningTokens: complete(item => item.usage.reasoningTokens),
    totalProcessedTokens: complete(item => item.usage.totalProcessedTokens),
  };
}

export function aggregateOutcomeUsage(attempts: MutationAttemptResult[]): NormalizedProviderUsage {
  return sumUsage(attempts.map(attempt => attempt.usage));
}

export function createMutationQualificationReport(input: {
  suite: MutationBenchmarkSuite;
  generatedAt: string;
  model: string;
  provider: string;
  outcomes: MutationOutcomeResult[];
  safety: {toolPolicy: boolean; staleLease: boolean; staleOwnership: boolean; humanTakeover: boolean; fallback: boolean; neutrality: boolean};
  minimumProductionTaskSample?: number;
}): MutationQualificationReport {
  const strategies: MutationStrategy[] = ['THIN_ONLY', 'STANDARD_ONLY', 'DEEP_ONLY', 'ADAPTIVE_THIN_STANDARD_DEEP', 'PREDICTED_ADAPTIVE'];
  const aggregates = Object.fromEntries(strategies.map(strategy => [strategy, aggregateStrategy(strategy, input.outcomes.filter(outcome => outcome.strategy === strategy))])) as Record<MutationStrategy, MutationStrategyAggregate>;
  const gate = evaluateProductionRoutingGate(input.outcomes, aggregates, input.safety, input.generatedAt, input.minimumProductionTaskSample ?? 20);
  const thinBounded = input.outcomes.filter(outcome => outcome.strategy === 'THIN_ONLY' && input.suite.tasks.find(task => task.id === outcome.taskId)?.expectedMinimumProfile === 'THIN');
  const predictedDeep = input.outcomes.filter(outcome => outcome.strategy === 'PREDICTED_ADAPTIVE' && outcome.startingProfile === 'DEEP');
  const adaptive = aggregates.ADAPTIVE_THIN_STANDARD_DEEP, standard = aggregates.STANDARD_ONLY;
  const identity = {suiteId: input.suite.suiteId, fixtureSha256: input.suite.fixtureSha256, model: input.model, provider: input.provider, outcomes: input.outcomes.map(outcome => ({outcomeId: outcome.outcomeId, verifiedSuccess: outcome.verifiedSuccess, usage: outcome.cumulativeUsage}))};
  const monetaryReason = 'The qualified provider supplied no authoritative monetary pricing or provider-reported cost; token, energy and infrastructure measurements were not converted into fabricated currency.';
  return {
    schema: 'agent-control.harness-mutation-report/v1', benchmarkId: createHash('sha256').update(stableJson(identity)).digest('hex'), suiteId: input.suite.suiteId, generatedAt: input.generatedAt,
    classification: 'LIVE_SAME_MODEL_REAL_REPOSITORY_MUTATION_EXPERIMENT',
    modelControl: {model: input.model, provider: input.provider, parameters: structuredClone(input.suite.modelParameters), sameModelAcrossStrategies: true, liveModelInvoked: true},
    fixture: {path: input.suite.fixturePath, sha256: input.suite.fixtureSha256, canonicalRepositoryMutated: false, disposableWorkspaces: true},
    cache: {resetPerformed: false, condition: 'provider_observed_existing_state', comparabilityLimitation: 'The protected provider cache was not reset. Provider-reported fresh/cached fields describe the observed warm state; cold-cache equivalence is unproven.'},
    outcomes: structuredClone(input.outcomes), aggregates, productionRoutingGate: gate,
    conclusions: {
      thinForBoundedWork: thinBounded.length > 0 && thinBounded.every(outcome => outcome.verifiedSuccess),
      standardAsFallback: true,
      immediateDeepClassificationSupported: predictedDeep.length > 0 && predictedDeep.every(outcome => outcome.verifiedSuccess),
      adaptiveEscalationSupported: adaptive.verifiedSuccesses >= standard.verifiedSuccesses
        && adaptive.timeoutCount === 0
        && adaptive.freshTokensPerVerifiedOutcome !== null
        && standard.freshTokensPerVerifiedOutcome !== null
        && adaptive.freshTokensPerVerifiedOutcome <= standard.freshTokensPerVerifiedOutcome,
      automaticProductionRoutingSupported: gate.qualified,
      monetaryCostPerVerifiedOutcome: null, monetaryCostReason: monetaryReason,
    },
    governance: {routingMode: 'EXPERIMENT', productionRoutingChanged: false, typedToolsOnly: true, unrestrictedShellExposed: false, independentVerificationRequired: true, humanTakeoverPrecedence: true},
  };
}

export function renderMutationQualificationReport(report: MutationQualificationReport): string {
  const strategies: MutationStrategy[] = ['THIN_ONLY', 'STANDARD_ONLY', 'DEEP_ONLY', 'ADAPTIVE_THIN_STANDARD_DEEP', 'PREDICTED_ADAPTIVE'];
  const n = (value: number | null) => value === null ? 'unknown' : Math.round(value).toLocaleString('en-US');
  const pct = (value: number | null) => value === null ? 'unknown' : `${(value * 100).toFixed(1)}%`;
  const rows = strategies.map(strategy => {
    const value = report.aggregates[strategy];
    return `| ${strategy} | ${value.tasksAttempted} | ${value.verifiedSuccesses} | ${pct(value.successRate)} | ${n(value.medianInitialProviderInputTokens)} | ${n(value.freshInputTokens)} | ${n(value.cachedInputTokens)} | ${pct(value.cacheEffectiveness)} | ${n(value.outputTokens)} | ${n(value.freshTokensPerVerifiedOutcome)} | ${n(value.cumulativeTokensPerVerifiedOutcome)} | ${Math.round(value.medianLatencyMs ?? 0)} | ${value.escalationCount} | ${value.verifierFailures} | ${value.timeoutCount} |`;
  }).join('\n');
  const taskRows = report.outcomes.map(outcome => `| ${outcome.taskId} | ${outcome.strategy} | ${outcome.predictedContextProfile.profile} | ${outcome.startingProfile} | ${outcome.finalProfile} | ${outcome.attempts.length} | ${outcome.verifiedSuccess ? 'PASS' : 'FAIL'} | ${n(outcome.cumulativeUsage.freshInputTokens)} | ${n(outcome.cumulativeUsage.cachedInputTokens)} | ${Math.round(outcome.cumulativeLatencyMs)} |`).join('\n');
  const gateRows = report.productionRoutingGate.criteria.map(item => `| ${item.id} | ${item.passed ? 'PASS' : 'FAIL'} | ${item.detail} |`).join('\n');
  return `# Real repository-mutation harness qualification\n\nGenerated: ${report.generatedAt}\n\nClassification: **${report.classification}**. The same live model/provider was used across strategies. Every attempt ran against a fresh disposable Git fixture and was independently verified, whether or not it produced a mutation. The canonical Agent Control repository was not used as an agent mutation target.\n\n## Strategy results\n\n| Strategy | Tasks | Verified | Success | Median initial provider input | Fresh input | Cached input | Cache | Output | Fresh / verified outcome | Processed / verified outcome | Median latency ms | Escalations | Verifier failures | Timeouts |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${rows}\n\n## Outcomes\n\n| Task | Strategy | Predicted | Start | Final | Attempts | Verifier | Fresh | Cached | Latency ms |\n| --- | --- | --- | --- | --- | ---: | --- | ---: | ---: | ---: |\n${taskRows}\n\n## Production routing gate\n\n| Criterion | Result | Evidence |\n| --- | --- | --- |\n${gateRows}\n\nAutomatic production routing qualified: **${report.productionRoutingGate.qualified ? 'YES' : 'NO'}**. Applied production behavior remains **${report.productionRoutingGate.appliedProductionMode}**.\n\n## Findings\n\n- THIN preserved verified success for all bounded tasks: **${report.conclusions.thinForBoundedWork ? 'YES' : 'NO'}**.\n- STANDARD remains the fail-safe: **YES**.\n- Immediate DEEP classification supported by this sample: **${report.conclusions.immediateDeepClassificationSupported ? 'YES' : 'NO'}**.\n- Adaptive escalation supported by this sample: **${report.conclusions.adaptiveEscalationSupported ? 'YES' : 'NO'}**.\n- Monetary cost per verified outcome remains **unknown**. ${report.conclusions.monetaryCostReason}\n\n## Cache and safety limitations\n\n${report.cache.comparabilityLimitation} All tools were typed and allowlisted through ToolPolicy; model completion was never treated as verifier acceptance. No unrestricted shell was exposed to the model.\n`;
}

function parseTask(input: unknown): MutationBenchmarkTask {
  if (!isObject(input)) throw new Error('mutation_task_invalid');
  const allowed = new Set(['id', 'taskClass', 'description', 'allowedFiles', 'requiredChangedFiles', 'verifierId', 'acceptance', 'expectedMinimumProfile', 'timeoutMs', 'tokenBudget', 'escalationPermitted', 'expectedMutation', 'features']);
  if (Object.keys(input).some(key => !allowed.has(key))) throw new Error('mutation_task_unknown_field');
  if (!string(input.id, 64) || !TASK_CLASSES.has(input.taskClass as MutationTaskClass) || !string(input.description, 4096) || !string(input.verifierId, 128)) throw new Error('mutation_task_identity_invalid');
  const allowedFiles = paths(input.allowedFiles), requiredChangedFiles = paths(input.requiredChangedFiles);
  if (!requiredChangedFiles.every(value => allowedFiles.includes(value))) throw new Error('mutation_task_required_scope_invalid');
  if (!Array.isArray(input.acceptance) || !input.acceptance.length || input.acceptance.some(item => !string(item, 512)) || !PROFILES.has(input.expectedMinimumProfile as HarnessProfileName)) throw new Error('mutation_task_acceptance_invalid');
  if (!integer(input.timeoutMs, 1_000, 600_000) || !integer(input.tokenBudget, 1_000, 1_000_000) || typeof input.escalationPermitted !== 'boolean') throw new Error('mutation_task_budget_invalid');
  if (!isObject(input.expectedMutation) || !integer(input.expectedMutation.minimumFiles, 1, 100) || !integer(input.expectedMutation.maximumFiles, input.expectedMutation.minimumFiles as number, 100) || !integer(input.expectedMutation.maximumChangedLines, 1, 100_000)) throw new Error('mutation_task_expected_mutation_invalid');
  const features = parseFeatures(input.features);
  return {id: input.id, taskClass: input.taskClass as MutationTaskClass, description: input.description, allowedFiles, requiredChangedFiles, verifierId: input.verifierId, acceptance: [...input.acceptance] as string[], expectedMinimumProfile: input.expectedMinimumProfile as HarnessProfileName, timeoutMs: input.timeoutMs, tokenBudget: input.tokenBudget, escalationPermitted: input.escalationPermitted, expectedMutation: structuredClone(input.expectedMutation as MutationBenchmarkTask['expectedMutation']), features};
}

function parseFeatures(input: unknown): MutationTaskFeatures {
  if (!isObject(input)) throw new Error('mutation_task_features_invalid');
  const keys: Array<keyof MutationTaskFeatures> = ['knownExactTargets', 'estimatedFiles', 'referencedModules', 'repositorySearchRequired', 'architecturalTerms', 'verifierComplexity', 'ambiguity', 'risk', 'sharedContextRequired', 'historicalContextRequired'];
  if (Object.keys(input).some(key => !keys.includes(key as keyof MutationTaskFeatures))) throw new Error('mutation_task_features_unknown_field');
  for (const key of ['knownExactTargets', 'repositorySearchRequired', 'architecturalTerms', 'sharedContextRequired', 'historicalContextRequired'] as const) if (typeof input[key] !== 'boolean') throw new Error('mutation_task_feature_boolean_invalid');
  if (!integer(input.estimatedFiles, 0, 10_000) || !integer(input.referencedModules, 0, 10_000) || typeof input.ambiguity !== 'number' || input.ambiguity < 0 || input.ambiguity > 1 || !['low', 'medium', 'high'].includes(String(input.verifierComplexity)) || !['low', 'medium', 'high'].includes(String(input.risk))) throw new Error('mutation_task_feature_value_invalid');
  return structuredClone(input as unknown as MutationTaskFeatures);
}

function aggregateStrategy(strategy: MutationStrategy, outcomes: MutationOutcomeResult[]): MutationStrategyAggregate {
  const successes = outcomes.filter(outcome => outcome.verifiedSuccess).length;
  const usage = sumUsage(outcomes.map(outcome => outcome.cumulativeUsage));
  const cached = usage.cachedInputTokens, fresh = usage.freshInputTokens;
  return {
    strategy, tasksAttempted: outcomes.length, verifiedSuccesses: successes, successRate: successes / Math.max(1, outcomes.length),
    freshInputTokens: fresh, cachedInputTokens: cached, outputTokens: usage.outputTokens, totalProcessedTokens: usage.totalProcessedTokens,
    medianInitialProviderInputTokens: median(outcomes.flatMap(outcome => outcome.attempts.flatMap(attempt => attempt.initialProviderInputTokens === null ? [] : [attempt.initialProviderInputTokens]))),
    medianPersistentContextTokens: median(outcomes.flatMap(outcome => outcome.attempts.flatMap(attempt => attempt.persistentEstimatedContextTokens === null ? [] : [attempt.persistentEstimatedContextTokens]))),
    cumulativeTokensPerVerifiedOutcome: ratio(usage.totalProcessedTokens, successes), freshTokensPerVerifiedOutcome: ratio(fresh, successes),
    cacheEffectiveness: fresh !== null && cached !== null && fresh + cached > 0 ? cached / (fresh + cached) : null,
    medianLatencyMs: median(outcomes.map(outcome => outcome.cumulativeLatencyMs)),
    escalationCount: outcomes.reduce((sum, outcome) => sum + outcome.escalationCount, 0),
    verifierFailures: outcomes.flatMap(outcome => outcome.attempts).filter(attempt => !attempt.verifier.passed).length,
    timeoutCount: outcomes.flatMap(outcome => outcome.attempts).filter(attempt => attempt.verifier.failureClass === 'TIMEOUT' || /timeout/i.test(attempt.failureReason ?? '')).length,
    monetaryCostPerVerifiedOutcome: null,
  };
}

function evaluateProductionRoutingGate(outcomes: MutationOutcomeResult[], aggregates: Record<MutationStrategy, MutationStrategyAggregate>, safety: {toolPolicy: boolean; staleLease: boolean; staleOwnership: boolean; humanTakeover: boolean; fallback: boolean; neutrality: boolean}, evaluatedAt: string, minimumTaskSample: number): ProductionRoutingGate {
  const uniqueTasks = new Set(outcomes.map(outcome => outcome.taskId)).size;
  const adaptive = aggregates.ADAPTIVE_THIN_STANDARD_DEEP, standard = aggregates.STANDARD_ONLY;
  const boundedEscalation = outcomes.filter(outcome => outcome.strategy.includes('ADAPTIVE')).every(outcome => outcome.attempts.length <= 3 && new Set(outcome.attempts.map(attempt => attempt.profile)).size === outcome.attempts.length);
  const adaptiveResourceImprovement = adaptive.freshTokensPerVerifiedOutcome !== null && standard.freshTokensPerVerifiedOutcome !== null && adaptive.freshTokensPerVerifiedOutcome < standard.freshTokensPerVerifiedOutcome;
  const criteria = [
    {id: 'deterministic_real_mutation_sample', passed: uniqueTasks >= minimumTaskSample, detail: `${uniqueTasks} unique tasks observed; production minimum is ${minimumTaskSample}.`},
    {id: 'no_verified_success_regression_vs_standard', passed: adaptive.tasksAttempted > 0 && adaptive.verifiedSuccesses >= standard.verifiedSuccesses, detail: `adaptive ${adaptive.verifiedSuccesses}/${adaptive.tasksAttempted}; STANDARD ${standard.verifiedSuccesses}/${standard.tasksAttempted}.`},
    {id: 'bounded_classified_escalation', passed: boundedEscalation, detail: 'Adaptive chains are limited to unique THIN, STANDARD and DEEP attempts.'},
    {id: 'meaningful_cumulative_resource_improvement', passed: adaptiveResourceImprovement, detail: `adaptive fresh/verified=${adaptive.freshTokensPerVerifiedOutcome ?? 'unknown'}; STANDARD=${standard.freshTokensPerVerifiedOutcome ?? 'unknown'}.`},
    {id: 'tool_policy_intact', passed: safety.toolPolicy, detail: 'Typed-tool policy denial qualification.'},
    {id: 'lease_and_ownership_fencing_intact', passed: safety.staleLease && safety.staleOwnership, detail: 'Stale lease and ownership generation qualification.'},
    {id: 'human_takeover_intact', passed: safety.humanTakeover, detail: 'Human precedence qualification.'},
    {id: 'standard_fallback_intact', passed: safety.fallback, detail: 'Unqualified routing applies STANDARD.'},
    {id: 'provider_model_neutrality', passed: safety.neutrality, detail: 'No provider/model identity conditional introduced.'},
  ];
  return {qualified: criteria.every(item => item.passed), evaluatedAt, criteria, appliedProductionMode: 'OBSERVATIONAL_STANDARD_FALLBACK', minimumTaskSample};
}

function sumUsage(values: NormalizedProviderUsage[]): NormalizedProviderUsage {
  const complete = (select: (item: NormalizedProviderUsage) => number | null) => values.length > 0 && values.every(item => select(item) !== null) ? values.reduce((sum, item) => sum + select(item)!, 0) : null;
  return {inputTokens: complete(item => item.inputTokens), freshInputTokens: complete(item => item.freshInputTokens), cachedInputTokens: complete(item => item.cachedInputTokens), cacheWriteTokens: complete(item => item.cacheWriteTokens), outputTokens: complete(item => item.outputTokens), reasoningTokens: complete(item => item.reasoningTokens), totalProcessedTokens: complete(item => item.totalProcessedTokens)};
}

function paths(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 100 || value.some(item => !relativePath(item))) throw new Error('mutation_task_paths_invalid');
  return [...new Set(value as string[])];
}
function relativePath(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 512 && !value.includes('\0') && !value.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(value) && !value.split(/[\\/]/).includes('..') && !value.includes('\\'); }
function string(value: unknown, maximum: number): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum && !value.includes('\0'); }
function integer(value: unknown, minimum: number, maximum: number): value is number { return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum; }
function validTimestamp(value: unknown): value is string { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function isObject(value: unknown): value is Record<string, any> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function ratio(value: number | null, denominator: number) { return value === null || denominator === 0 ? null : value / denominator; }
function median(values: number[]): number | null { if (!values.length) return null; const sorted = [...values].sort((left, right) => left - right), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`; return JSON.stringify(value); }

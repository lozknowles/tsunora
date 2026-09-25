export type ContextCompilerVariant = 'DIRECT_LUNA' | 'DIRECT_SOL' | 'E2B_CLOUD' | 'E4B_CLOUD' | 'ADAPTIVE';

export interface BenchmarkCostAccounting {
  /** API currency amount actually charged/calculated; null is deliberately not £0. */
  apiCost: number | null;
  currency: string | null;
  subscriptionQuotaConsumed: number | null;
  subscriptionQuotaUnit: string | null;
  localEnergyWh: number | null;
  localEnergyCost: number | null;
  infrastructureCost: number | null;
  billingModes: Array<'API_METERED' | 'SUBSCRIPTION_QUOTA' | 'EFFECTIVELY_UNMETERED' | 'LOCAL_ENERGY' | 'UNKNOWN'>;
}

export interface ContextCompilerBenchmarkObservation {
  taskId: string;
  variant: ContextCompilerVariant;
  verified: boolean;
  cloudInputTokens: number;
  cloudOutputTokens: number;
  lunaTokens: number;
  solTokens: number;
  localTokens: number;
  latencyMs: number;
  /** Legacy fixture-compatible fields; real observations must use costAccounting. */
  apiCost: number;
  currency: string;
  costAccounting?: BenchmarkCostAccounting;
  escalationCount: number;
  gemmaConfidence?: number;
  gemmaOfferedLocalResult?: boolean;
  localVerificationPassed?: boolean;
  originalContextTokens?: number;
  contextPacketTokens?: number;
  missingEvidenceIds?: string[];
}

export interface ContextCompilerVariantMetrics {
  tasks: number;
  verifiedOutcomes: number;
  verifiedSuccessRate: number;
  totalCloudInputTokens: number;
  totalCloudOutputTokens: number;
  solTokens: number;
  lunaTokens: number;
  localModelTokens: number;
  endToEndLatencyMs: number;
  apiCost: number;
  currency: string | null;
  escalationFrequency: number;
  falseConfidenceRate: number | null;
  contextReductionRatio: number | null;
  costPerVerifiedOutcome: number | null;
  solTokensPerVerifiedOutcome: number | null;
  missingEvidenceCases: number;
  localEnergyWh: number | null;
  localEnergyCost: number | null;
  localEnergyPerVerifiedOutcome: number | null;
  elapsedTimePerVerifiedOutcomeMs: number | null;
  completedWithoutCloudEscalation: number | null;
  completedWithoutSol: number | null;
  failedAttemptApiCost: number | null;
  failedAttemptLocalEnergyCost: number | null;
  subscriptionQuotaConsumed: number | null;
  subscriptionQuotaUnit: string | null;
}

export interface ContextCompilerCounterfactual {
  taskId: string;
  actualVariant: 'ADAPTIVE';
  directLuna: {cloudTokenSaving: number | null; solTokenSaving: number | null; apiCostSaving: number | null; subscriptionQuotaSaving: number | null; additionalLocalComputeTokens: number; additionalLatencyMs: number};
  directSol: {cloudTokenSaving: number | null; solTokenSaving: number | null; apiCostSaving: number | null; subscriptionQuotaSaving: number | null; additionalLocalComputeTokens: number; additionalLatencyMs: number};
}

export interface ContextCompilerBenchmarkReport {
  schema: 'agent-control.context-compiler-benchmark/v1';
  corpusId: string;
  corpusSha256: string;
  expectedTaskIds: string[];
  complete: boolean;
  missingCells: Array<{taskId: string; variant: ContextCompilerVariant}>;
  byVariant: Record<ContextCompilerVariant, ContextCompilerVariantMetrics>;
  counterfactuals: ContextCompilerCounterfactual[];
  verdict: 'PASS' | 'PARTIAL' | 'FAIL' | 'NOT_RUN';
  reason: string;
  observedAt: string;
}

export const CONTEXT_COMPILER_VARIANTS: ContextCompilerVariant[] = ['DIRECT_LUNA', 'DIRECT_SOL', 'E2B_CLOUD', 'E4B_CLOUD', 'ADAPTIVE'];

const ratio = (numerator: number, denominator: number) => denominator ? numerator / denominator : null;
const cost = (record: ContextCompilerBenchmarkObservation) => record.costAccounting?.apiCost ?? record.apiCost;
const localEnergy = (record: ContextCompilerBenchmarkObservation) => record.costAccounting?.localEnergyCost ?? null;
const quota = (record: ContextCompilerBenchmarkObservation) => record.costAccounting?.subscriptionQuotaConsumed ?? null;
function aggregate(records: ContextCompilerBenchmarkObservation[]): ContextCompilerVariantMetrics {
  const verifiedOutcomes = records.filter(record => record.verified).length;
  const confident = records.filter(record => record.gemmaOfferedLocalResult && record.gemmaConfidence !== undefined);
  const falseConfidence = confident.filter(record => record.localVerificationPassed === false).length;
  const reductions = records.filter(record => record.originalContextTokens !== undefined && record.contextPacketTokens !== undefined && record.originalContextTokens! > 0).map(record => 1 - record.contextPacketTokens! / record.originalContextTokens!);
  const currencies = [...new Set(records.map(record => record.costAccounting?.currency ?? record.currency).filter(Boolean))];
  const apiCost = records.every(record => cost(record) !== null) ? records.reduce((sum, record) => sum + (cost(record) ?? 0), 0) : null;
  const localEnergyWh = records.every(record => record.costAccounting?.localEnergyWh !== null && record.costAccounting?.localEnergyWh !== undefined) ? records.reduce((sum, record) => sum + (record.costAccounting?.localEnergyWh ?? 0), 0) : null;
  const localEnergyCost = records.every(record => localEnergy(record) !== null) ? records.reduce((sum, record) => sum + (localEnergy(record) ?? 0), 0) : null;
  const quotas = records.map(quota), quotaUnits = [...new Set(records.map(record => record.costAccounting?.subscriptionQuotaUnit).filter((value): value is string => typeof value === 'string' && value.length > 0))];
  const quotaConsumed = quotas.every(value => value !== null) ? quotas.reduce((sum, value) => sum + (value ?? 0), 0) : null;
  const solTokens = records.reduce((sum, record) => sum + record.solTokens, 0);
  return {
    tasks: records.length,
    verifiedOutcomes,
    verifiedSuccessRate: records.length ? verifiedOutcomes / records.length : 0,
    totalCloudInputTokens: records.reduce((sum, record) => sum + record.cloudInputTokens, 0),
    totalCloudOutputTokens: records.reduce((sum, record) => sum + record.cloudOutputTokens, 0),
    solTokens,
    lunaTokens: records.reduce((sum, record) => sum + record.lunaTokens, 0),
    localModelTokens: records.reduce((sum, record) => sum + record.localTokens, 0),
    endToEndLatencyMs: records.reduce((sum, record) => sum + record.latencyMs, 0),
    apiCost: apiCost ?? 0,
    currency: currencies.length === 1 ? currencies[0] : null,
    escalationFrequency: records.length ? records.filter(record => record.escalationCount > 0).length / records.length : 0,
    falseConfidenceRate: confident.length ? falseConfidence / confident.length : null,
    contextReductionRatio: reductions.length ? reductions.reduce((sum, value) => sum + value, 0) / reductions.length : null,
    costPerVerifiedOutcome: apiCost === null ? null : ratio(apiCost, verifiedOutcomes),
    solTokensPerVerifiedOutcome: ratio(solTokens, verifiedOutcomes),
    missingEvidenceCases: records.filter(record => (record.missingEvidenceIds?.length ?? 0) > 0).length,
    localEnergyWh, localEnergyCost, localEnergyPerVerifiedOutcome: localEnergyWh === null ? null : ratio(localEnergyWh, verifiedOutcomes), elapsedTimePerVerifiedOutcomeMs: ratio(records.reduce((sum, record) => sum + record.latencyMs, 0), verifiedOutcomes),
    completedWithoutCloudEscalation: records.length ? records.filter(record => record.verified && record.cloudInputTokens === 0 && record.cloudOutputTokens === 0).length / records.length : null,
    completedWithoutSol: records.length ? records.filter(record => record.verified && record.solTokens === 0).length / records.length : null,
    failedAttemptApiCost: records.some(record => !record.verified && cost(record) === null) ? null : records.filter(record => !record.verified).reduce((sum, record) => sum + (cost(record) ?? 0), 0),
    failedAttemptLocalEnergyCost: records.some(record => !record.verified && localEnergy(record) === null) ? null : records.filter(record => !record.verified).reduce((sum, record) => sum + (localEnergy(record) ?? 0), 0),
    subscriptionQuotaConsumed: quotaConsumed, subscriptionQuotaUnit: quotaUnits.length === 1 ? quotaUnits[0] : null,
  };
}

const empty = () => aggregate([]);
export function buildContextCompilerBenchmark(corpusId: string, corpusSha256: string, expectedTaskIds: string[], observations: ContextCompilerBenchmarkObservation[], observedAt = new Date().toISOString()): ContextCompilerBenchmarkReport {
  const expected = [...new Set(expectedTaskIds)].sort();
  if (!expected.length) throw new Error('context_compiler_benchmark_corpus_empty');
  const cells = new Set<string>();
  for (const record of observations) {
    if (!expected.includes(record.taskId)) throw new Error(`context_compiler_benchmark_task_unknown:${record.taskId}`);
    const cell = `${record.taskId}:${record.variant}`;
    if (cells.has(cell)) throw new Error(`context_compiler_benchmark_duplicate:${cell}`);
    cells.add(cell);
    const numeric = [record.cloudInputTokens, record.cloudOutputTokens, record.lunaTokens, record.solTokens, record.localTokens, record.latencyMs, record.apiCost, record.escalationCount, record.costAccounting?.apiCost, record.costAccounting?.localEnergyWh, record.costAccounting?.localEnergyCost, record.costAccounting?.infrastructureCost, record.costAccounting?.subscriptionQuotaConsumed];
    if (numeric.some(value => value !== null && value !== undefined && (!Number.isFinite(value) || value < 0))) throw new Error(`context_compiler_benchmark_metric_invalid:${cell}`);
  }
  const missingCells = expected.flatMap(taskId => CONTEXT_COMPILER_VARIANTS.filter(variant => !cells.has(`${taskId}:${variant}`)).map(variant => ({taskId, variant})));
  const byVariant = Object.fromEntries(CONTEXT_COMPILER_VARIANTS.map(variant => [variant, observations.some(record => record.variant === variant) ? aggregate(observations.filter(record => record.variant === variant)) : empty()])) as Record<ContextCompilerVariant, ContextCompilerVariantMetrics>;
  const byTask = new Map(observations.map(record => [`${record.taskId}:${record.variant}`, record]));
  const saving = (baseline: number | null, actual: number | null) => baseline === null || actual === null ? null : baseline - actual;
  const counterfactuals: ContextCompilerCounterfactual[] = expected.flatMap(taskId => {
    const adaptive = byTask.get(`${taskId}:ADAPTIVE`), luna = byTask.get(`${taskId}:DIRECT_LUNA`), sol = byTask.get(`${taskId}:DIRECT_SOL`);
    if (!adaptive || !luna || !sol) return [];
    const compare = (baseline: ContextCompilerBenchmarkObservation) => ({cloudTokenSaving: baseline.cloudInputTokens + baseline.cloudOutputTokens - adaptive.cloudInputTokens - adaptive.cloudOutputTokens, solTokenSaving: baseline.solTokens - adaptive.solTokens, apiCostSaving: saving(cost(baseline), cost(adaptive)), subscriptionQuotaSaving: saving(quota(baseline), quota(adaptive)), additionalLocalComputeTokens: adaptive.localTokens - baseline.localTokens, additionalLatencyMs: adaptive.latencyMs - baseline.latencyMs});
    return [{taskId, actualVariant: 'ADAPTIVE' as const, directLuna: compare(luna), directSol: compare(sol)}];
  });
  let verdict: ContextCompilerBenchmarkReport['verdict'] = observations.length ? 'PARTIAL' : 'NOT_RUN', reason = observations.length ? 'benchmark_matrix_incomplete' : 'no_live_model_observations';
  if (!missingCells.length) {
    const adaptive = byVariant.ADAPTIVE, luna = byVariant.DIRECT_LUNA, sol = byVariant.DIRECT_SOL;
    const baselineQuality = Math.max(luna.verifiedSuccessRate, sol.verifiedSuccessRate), correctnessPreserved = adaptive.verifiedSuccessRate >= baselineQuality;
    const cloudInputImproved = adaptive.totalCloudInputTokens <= Math.min(luna.totalCloudInputTokens, sol.totalCloudInputTokens) * .9;
    const solImproved = adaptive.solTokensPerVerifiedOutcome !== null && sol.solTokensPerVerifiedOutcome !== null && adaptive.solTokensPerVerifiedOutcome <= sol.solTokensPerVerifiedOutcome * .9;
    const costImproved = adaptive.costPerVerifiedOutcome !== null && luna.costPerVerifiedOutcome !== null && sol.costPerVerifiedOutcome !== null && adaptive.costPerVerifiedOutcome <= Math.min(luna.costPerVerifiedOutcome, sol.costPerVerifiedOutcome) * .9;
    const evidenceSafe = adaptive.missingEvidenceCases === 0;
    if (correctnessPreserved && evidenceSafe && (cloudInputImproved || solImproved || costImproved)) { verdict = 'PASS'; reason = 'adaptive_local_preprocessing_improves_verified_efficiency'; }
    else if (!evidenceSafe) { verdict = 'FAIL'; reason = 'context_compiler_removed_required_evidence'; }
    else {
      const selectedUseful = (['E2B_CLOUD', 'E4B_CLOUD'] as ContextCompilerVariant[]).some(variant => byVariant[variant].verifiedSuccessRate >= baselineQuality && byVariant[variant].missingEvidenceCases === 0 && byVariant[variant].totalCloudInputTokens < luna.totalCloudInputTokens);
      verdict = selectedUseful ? 'PARTIAL' : 'FAIL';
      reason = selectedUseful ? 'local_preprocessing_useful_only_for_selected_variants' : !correctnessPreserved ? 'adaptive_correctness_degraded' : 'no_material_efficiency_improvement';
    }
  }
  return {schema: 'agent-control.context-compiler-benchmark/v1', corpusId, corpusSha256, expectedTaskIds: expected, complete: missingCells.length === 0, missingCells, byVariant, counterfactuals, verdict, reason, observedAt};
}

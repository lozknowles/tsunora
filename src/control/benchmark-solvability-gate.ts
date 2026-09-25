import {createHash} from 'node:crypto';

export interface FrozenBenchmarkLadder {
  schema: 'agent-control.frozen-benchmark-ladder/v1';
  ladderId: string;
  taskIds: string[];
  fixtureSha256: string;
  minimumVerifiedSuccesses?: number;
}

export interface DirectControlAttempt {
  taskId: string;
  modelId: string;
  providerId: string;
  modelArtifactSha256: string | null;
  fixtureSha256: string;
  verifierPassed: boolean;
  completed: boolean;
  totalTokens: number | null;
  elapsedMs: number;
  failureReason: string | null;
  evidenceSha256: string;
}

export interface BenchmarkSolvabilityDecision {
  schema: 'agent-control.benchmark-solvability-decision/v1';
  status: 'MODEL_QUALIFIED' | 'MODEL_NOT_QUALIFIED';
  ladderId: string;
  ladderSha256: string;
  threshold: number;
  taskCount: number;
  verifiedSuccesses: number;
  modelId: string | null;
  providerId: string | null;
  modelArtifactSha256: string | null;
  totalTokens: number | null;
  totalWallMs: number;
  taskResults: Array<{taskId: string; verifiedSuccess: boolean; failureReason: string | null; evidenceSha256: string}>;
  reason: string;
}

/** Assess one exact model/provider configuration on a complete frozen ladder. */
export function assessBenchmarkSolvability(ladder: FrozenBenchmarkLadder, attempts: DirectControlAttempt[]): BenchmarkSolvabilityDecision {
  if (ladder.schema !== 'agent-control.frozen-benchmark-ladder/v1' || !ladder.ladderId || !/^[a-f0-9]{64}$/i.test(ladder.fixtureSha256)) throw new Error('benchmark_ladder_invalid');
  if (!Array.isArray(ladder.taskIds) || ladder.taskIds.length !== 5 || new Set(ladder.taskIds).size !== 5 || ladder.taskIds.some(id => !id)) throw new Error('benchmark_ladder_tasks_invalid');
  const threshold = ladder.minimumVerifiedSuccesses ?? 4;
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > ladder.taskIds.length) throw new Error('benchmark_threshold_invalid');
  const ladderSha256 = createHash('sha256').update(JSON.stringify(ladder)).digest('hex');
  const taskSet = new Set(ladder.taskIds);
  const identities = new Set(attempts.map(attempt => `${attempt.providerId}\0${attempt.modelId}\0${attempt.modelArtifactSha256 ?? ''}`));
  const complete = attempts.length === 5 && new Set(attempts.map(attempt => attempt.taskId)).size === 5 && attempts.every(attempt => taskSet.has(attempt.taskId));
  const provenanceValid = complete && identities.size === 1 && attempts.every(attempt => attempt.fixtureSha256 === ladder.fixtureSha256 && /^[a-f0-9]{64}$/i.test(attempt.evidenceSha256) && Number.isFinite(attempt.elapsedMs) && attempt.elapsedMs >= 0 && (attempt.totalTokens === null || Number.isSafeInteger(attempt.totalTokens) && attempt.totalTokens >= 0));
  const verifiedSuccesses = provenanceValid ? attempts.filter(attempt => attempt.completed && attempt.verifierPassed).length : 0;
  const qualified = provenanceValid && verifiedSuccesses >= threshold;
  return {
    schema: 'agent-control.benchmark-solvability-decision/v1', status: qualified ? 'MODEL_QUALIFIED' : 'MODEL_NOT_QUALIFIED',
    ladderId: ladder.ladderId, ladderSha256, threshold, taskCount: ladder.taskIds.length, verifiedSuccesses,
    modelId: identities.size === 1 ? attempts[0]?.modelId ?? null : null,
    providerId: identities.size === 1 ? attempts[0]?.providerId ?? null : null,
    modelArtifactSha256: identities.size === 1 ? attempts[0]?.modelArtifactSha256 ?? null : null,
    totalTokens: provenanceValid && attempts.every(attempt => attempt.totalTokens !== null) ? attempts.reduce((sum, attempt) => sum + attempt.totalTokens!, 0) : null,
    totalWallMs: provenanceValid ? attempts.reduce((sum, attempt) => sum + attempt.elapsedMs, 0) : 0,
    taskResults: ladder.taskIds.map(taskId => {
      const attempt = attempts.find(item => item.taskId === taskId);
      return {taskId, verifiedSuccess: Boolean(provenanceValid && attempt?.completed && attempt.verifierPassed), failureReason: attempt?.failureReason ?? null, evidenceSha256: attempt?.evidenceSha256 ?? ''};
    }),
    reason: !complete ? 'INCOMPLETE_OR_DUPLICATE_LADDER' : !provenanceValid ? 'MODEL_OR_EVIDENCE_PROVENANCE_MISMATCH' : qualified ? 'DIRECT_CONTROL_GATE_PASSED' : 'DIRECT_CONTROL_BELOW_THRESHOLD',
  };
}

/** The callback is never invoked unless the exact direct-control gate passed. */
export async function runAfterSolvabilityGate<T>(decision: BenchmarkSolvabilityDecision, runHarnessBenchmark: () => Promise<T>): Promise<T> {
  requireBenchmarkSolvability(decision);
  return runHarnessBenchmark();
}

export function requireBenchmarkSolvability(decision: BenchmarkSolvabilityDecision): void {
  if (decision.status !== 'MODEL_QUALIFIED') throw new Error(`MODEL_NOT_QUALIFIED:${decision.reason}:${decision.verifiedSuccesses}/${decision.threshold}`);
}

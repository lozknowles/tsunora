import assert from 'node:assert/strict';
import test from 'node:test';
import {buildContextCompilerBenchmark, CONTEXT_COMPILER_VARIANTS, type ContextCompilerBenchmarkObservation, type ContextCompilerVariant} from './context-compiler-benchmark.js';

const tasks = ['MUT-001', 'MUT-002'];
function observation(taskId: string, variant: ContextCompilerVariant, overrides: Partial<ContextCompilerBenchmarkObservation> = {}): ContextCompilerBenchmarkObservation {
  const cloud = variant === 'DIRECT_LUNA' || variant === 'DIRECT_SOL' ? 1000 : 600;
  return {taskId, variant, verified: true, cloudInputTokens: cloud, cloudOutputTokens: 100, lunaTokens: variant === 'DIRECT_LUNA' ? 1100 : variant.includes('CLOUD') || variant === 'ADAPTIVE' ? 700 : 0, solTokens: variant === 'DIRECT_SOL' ? 1100 : 0, localTokens: variant.startsWith('DIRECT') ? 0 : 300, latencyMs: 1000, apiCost: variant.startsWith('DIRECT') ? 1 : .6, currency: 'USD', escalationCount: variant.startsWith('DIRECT') ? 0 : 1, gemmaConfidence: variant.startsWith('DIRECT') ? undefined : .8, originalContextTokens: 1000, contextPacketTokens: variant.startsWith('DIRECT') ? undefined : 500, ...overrides};
}

test('benchmark requires the complete frozen five-variant matrix before declaring success', () => {
  const report = buildContextCompilerBenchmark('frozen', 'abc', tasks, [observation('MUT-001', 'DIRECT_LUNA')]);
  assert.equal(report.complete, false);
  assert.equal(report.verdict, 'PARTIAL');
  assert.equal(report.missingCells.length, tasks.length * CONTEXT_COMPILER_VARIANTS.length - 1);
});

test('benchmark reports PASS only when verified quality is preserved and efficiency materially improves', () => {
  const observations = tasks.flatMap(task => CONTEXT_COMPILER_VARIANTS.map(variant => observation(task, variant)));
  const report = buildContextCompilerBenchmark('frozen', 'abc', tasks, observations);
  assert.equal(report.complete, true);
  assert.equal(report.verdict, 'PASS');
  assert.equal(report.byVariant.ADAPTIVE.verifiedSuccessRate, 1);
  assert.equal(report.byVariant.ADAPTIVE.contextReductionRatio, .5);
});

test('benchmark makes missing stronger-model evidence a first-class failure mode', () => {
  const observations = tasks.flatMap(task => CONTEXT_COMPILER_VARIANTS.map(variant => observation(task, variant, variant === 'ADAPTIVE' ? {missingEvidenceIds: ['src/required.ts']} : {})));
  const report = buildContextCompilerBenchmark('frozen', 'abc', tasks, observations);
  assert.equal(report.verdict, 'FAIL');
  assert.equal(report.reason, 'context_compiler_removed_required_evidence');
  assert.equal(report.byVariant.ADAPTIVE.missingEvidenceCases, 2);
});

test('false confidence counts only local acceptance candidates rejected by verification', () => {
  const observations = tasks.flatMap(task => CONTEXT_COMPILER_VARIANTS.map(variant => observation(task, variant, variant === 'ADAPTIVE' ? {gemmaOfferedLocalResult: true, localVerificationPassed: task === 'MUT-002'} : {})));
  const report = buildContextCompilerBenchmark('frozen', 'abc', tasks, observations);
  assert.equal(report.byVariant.ADAPTIVE.falseConfidenceRate, .5);
});

test('benchmark retains failed-attempt cost and produces adaptive counterfactuals', () => {
  const observations = tasks.flatMap(task => CONTEXT_COMPILER_VARIANTS.map(variant => observation(task, variant, variant === 'ADAPTIVE' && task === 'MUT-002' ? {verified: false, apiCost: .8, localTokens: 400} : {})));
  const report = buildContextCompilerBenchmark('frozen', 'abc', tasks, observations);
  assert.equal(report.byVariant.ADAPTIVE.failedAttemptApiCost, .8);
  assert.equal(report.counterfactuals.length, 2);
  assert.equal(report.counterfactuals[0].directSol.solTokenSaving, 1100);
});

test('unknown tasks duplicate cells and invalid metrics fail closed', () => {
  assert.throws(() => buildContextCompilerBenchmark('frozen', 'abc', tasks, [observation('OTHER', 'DIRECT_LUNA')]), /task_unknown/);
  const duplicate = observation('MUT-001', 'DIRECT_LUNA');
  assert.throws(() => buildContextCompilerBenchmark('frozen', 'abc', tasks, [duplicate, duplicate]), /benchmark_duplicate/);
  assert.throws(() => buildContextCompilerBenchmark('frozen', 'abc', tasks, [observation('MUT-001', 'DIRECT_LUNA', {apiCost: -1})]), /metric_invalid/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {parseHarnessBenchmarkSuite, renderHarnessEfficiencyReport, runHarnessEfficiencyBenchmark} from './harness-efficiency-benchmark.js';

const suite = () => parseHarnessBenchmarkSuite(JSON.parse(fs.readFileSync(path.resolve('benchmarks/harness-efficiency-jobs.json'), 'utf8')));

test('frozen harness benchmark contains twenty representative jobs and one model identity', () => {
  const value = suite();
  assert.equal(value.tasks.length, 20);
  assert.equal(new Set(value.tasks.map(task => task.category)).size >= 10, true);
  assert.equal(value.model, 'same-model-fixture');
  assert.equal(value.classification, 'DETERMINISTIC_HARNESS_SIMULATION_NOT_LIVE_MODEL_EVIDENCE');
});

test('benchmark is reproducible and compares every task across all profiles', () => {
  const at = '2026-08-27T12:00:00.000Z';
  const first = runHarnessEfficiencyBenchmark(suite(), at), second = runHarnessEfficiencyBenchmark(suite(), at);
  assert.deepEqual(first, second);
  assert.equal(first.results.length, 60);
  for (const task of suite().tasks) assert.deepEqual(first.results.filter(result => result.taskId === task.id).map(result => result.profile), ['THIN', 'STANDARD', 'DEEP']);
  assert.equal(new Set(first.results.map(result => result.model)).size, 1);
});

test('bounded THIN jobs preserve deterministic verifier success while wider profiles recover harder jobs', () => {
  const report = runHarnessEfficiencyBenchmark(suite(), '2026-08-27T12:00:00.000Z');
  assert.equal(report.conclusions.boundedThinVerifiedSuccessRate, 1);
  assert.ok(report.aggregates.STANDARD.verifiedSuccesses > report.aggregates.THIN.verifiedSuccesses);
  assert.ok(report.aggregates.DEEP.verifiedSuccesses > report.aggregates.STANDARD.verifiedSuccesses);
  assert.ok((report.conclusions.thinMedianStartupReductionVsStandardPercent ?? 0) > 0);
});

test('benchmark refuses to invent provider cache, cost, output, latency or automatic-routing evidence', () => {
  const report = runHarnessEfficiencyBenchmark(suite(), '2026-08-27T12:00:00.000Z');
  assert.equal(report.measurement.providerUsageAvailable, false);
  assert.equal(report.aggregates.THIN.costPerVerifiedOutcome, null);
  assert.equal(report.aggregates.STANDARD.cachedInputPercent, null);
  assert.equal(report.results.every(result => result.freshTokens === null && result.cachedTokens === null && result.outputTokens === null && result.elapsedMs === null), true);
  assert.equal(report.conclusions.automaticRoutingSupportedByEvidence, false);
  const markdown = renderHarnessEfficiencyReport(report);
  assert.match(markdown, /not live model|Automatic routing supported by this evidence: \*\*NO\*\*/i);
  assert.match(markdown, /Local packet-build and report overhead: \*\*unknown\*\* \(LOCAL_HARNESS_OVERHEAD_NOT_MODEL_LATENCY\)/);
});

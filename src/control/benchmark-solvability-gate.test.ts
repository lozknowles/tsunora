import assert from 'node:assert/strict';
import test from 'node:test';
import {assessBenchmarkSolvability, runAfterSolvabilityGate, type DirectControlAttempt, type FrozenBenchmarkLadder} from './benchmark-solvability-gate.js';

const fixture = 'a'.repeat(64), evidence = 'b'.repeat(64);
const ladder: FrozenBenchmarkLadder = {schema: 'agent-control.frozen-benchmark-ladder/v1', ladderId: 'frozen-5', taskIds: ['one','two','three','four','five'], fixtureSha256: fixture};
const attempt = (taskId: string, success: boolean): DirectControlAttempt => ({taskId, modelId: 'same-model', providerId: 'same-provider', modelArtifactSha256: 'c'.repeat(64), fixtureSha256: fixture, completed: success, verifierPassed: success, totalTokens: 100, elapsedMs: 50, failureReason: success ? null : 'HIDDEN_VERIFIER', evidenceSha256: evidence});

test('default four-of-five gate prevents a benchmark callback after only three successes', async () => {
  const decision = assessBenchmarkSolvability(ladder, ladder.taskIds.map((id, index) => attempt(id, index < 3)));
  assert.equal(decision.status, 'MODEL_NOT_QUALIFIED');
  assert.equal(decision.threshold, 4);
  assert.equal(decision.verifiedSuccesses, 3);
  let calls = 0;
  await assert.rejects(() => runAfterSolvabilityGate(decision, async () => {calls++;}), /MODEL_NOT_QUALIFIED/);
  assert.equal(calls, 0);
});

test('four verified successes open the gate and threshold is evidence-visible', async () => {
  const decision = assessBenchmarkSolvability(ladder, ladder.taskIds.map((id, index) => attempt(id, index < 4)));
  assert.equal(decision.status, 'MODEL_QUALIFIED');
  assert.equal(decision.totalTokens, 500);
  assert.equal(await runAfterSolvabilityGate(decision, async () => 'BENCHMARK_STARTED'), 'BENCHMARK_STARTED');
  const strict = assessBenchmarkSolvability({...ladder, minimumVerifiedSuccesses: 5}, ladder.taskIds.map((id, index) => attempt(id, index < 4)));
  assert.equal(strict.status, 'MODEL_NOT_QUALIFIED');
  assert.equal(strict.threshold, 5);
});

test('missing tasks, mixed models and mismatched fixture hashes fail closed', () => {
  const attempts = ladder.taskIds.map(id => attempt(id, true));
  assert.equal(assessBenchmarkSolvability(ladder, attempts.slice(0, 4)).reason, 'INCOMPLETE_OR_DUPLICATE_LADDER');
  assert.equal(assessBenchmarkSolvability(ladder, [...attempts.slice(0, 4), attempts[0]]).status, 'MODEL_NOT_QUALIFIED');
  assert.equal(assessBenchmarkSolvability(ladder, attempts.map((item, index) => index === 4 ? {...item, modelId: 'different'} : item)).reason, 'MODEL_OR_EVIDENCE_PROVENANCE_MISMATCH');
  assert.equal(assessBenchmarkSolvability(ladder, attempts.map((item, index) => index === 4 ? {...item, fixtureSha256: 'd'.repeat(64)} : item)).reason, 'MODEL_OR_EVIDENCE_PROVENANCE_MISMATCH');
});

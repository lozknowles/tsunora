import assert from 'node:assert/strict';
import test from 'node:test';
import type {HarnessBenchmarkSuite, HarnessBenchmarkTask} from './harness-efficiency-benchmark.js';
import {
  buildLiveBenchmarkSources,
  buildPacket,
  createLiveHarnessEfficiencyReport,
  expectedContextAvailable,
  liveBenchmarkMarker,
  renderLiveBenchmarkInstruction,
  selectPacketSources,
  type LiveHarnessFloorResult,
  type LiveHarnessTaskResult,
} from './harness-efficiency-live-benchmark.js';
import type {HarnessProfileName, NormalizedProviderUsage} from './harness-efficiency.js';

const task = (id: string, minimumProfile: HarnessProfileName): HarnessBenchmarkTask => ({
  id, category: 'fixture', complexity: .2, risk: 'low', knownExactTargets: true, estimatedFiles: 1, deterministicVerifier: true,
  ambiguity: .1, architectural: minimumProfile === 'DEEP', minimumProfile, taskContextTokens: 100, selectedExpansionTokens: 10,
  requiredTools: ['benchmark.submit'], requiredSkills: [],
});

test('controlled live evidence is available only at or above the frozen minimum profile', () => {
  for (const minimum of ['THIN', 'STANDARD', 'DEEP'] as const) {
    const fixture = task(`task-${minimum.toLowerCase()}`, minimum);
    const sources = buildLiveBenchmarkSources('suite-a', fixture);
    const marker = liveBenchmarkMarker('suite-a', fixture.id);
    for (const profile of ['THIN', 'STANDARD', 'DEEP'] as const) {
      const packet = buildPacket(profile, sources);
      const rendered = renderLiveBenchmarkInstruction(fixture.id, selectPacketSources(packet, sources));
      assert.equal(rendered.includes(marker), expectedContextAvailable(minimum, profile), `${minimum}:${profile}`);
      assert.equal(packet.profile, profile);
    }
  }
});

test('live markers are deterministic, task-scoped and absent from compact source metadata', () => {
  assert.equal(liveBenchmarkMarker('suite-a', 'task-a'), liveBenchmarkMarker('suite-a', 'task-a'));
  assert.notEqual(liveBenchmarkMarker('suite-a', 'task-a'), liveBenchmarkMarker('suite-a', 'task-b'));
  const sources = buildLiveBenchmarkSources('suite-a', task('task-a', 'THIN'));
  const packet = buildPacket('THIN', sources);
  assert.equal(JSON.stringify(packet).includes(liveBenchmarkMarker('suite-a', 'task-a')), false);
});

test('live report keeps monetary cost unknown and production routing observational', () => {
  const tasks = [task('bounded', 'THIN'), task('medium', 'STANDARD'), task('broad', 'DEEP')];
  const suite: HarnessBenchmarkSuite = {schema: 'agent-control.harness-efficiency-suite/v1', suiteId: 'suite-live', frozenAt: '2026-08-28T00:00:00.000Z', model: 'same-model', modelParameters: {temperature: 0}, verifier: 'marker', classification: 'DETERMINISTIC_HARNESS_SIMULATION_NOT_LIVE_MODEL_EVIDENCE', tasks};
  const usage = (input: number): NormalizedProviderUsage => ({inputTokens: input, freshInputTokens: input, cachedInputTokens: 0, cacheWriteTokens: null, outputTokens: 8, reasoningTokens: null, totalProcessedTokens: input + 8});
  const results: LiveHarnessTaskResult[] = tasks.flatMap(item => (['THIN', 'STANDARD', 'DEEP'] as const).map(profile => {
    const success = expectedContextAvailable(item.minimumProfile, profile);
    return {taskId: item.id, category: item.category, minimumProfile: item.minimumProfile, profile, model: 'same-model', provider: 'local', verifierResult: success ? 'PASS' : 'FAIL', success, expectedContextAvailable: success, submittedMissingContext: !success, failureReason: success ? null : 'missing_context', recipeId: `recipe-${item.id}-${profile}`, contextPacketId: `packet-${profile}`, contextSourceIds: [], omittedSourceIds: [], usage: usage({THIN: 100, STANDARD: 300, DEEP: 900}[profile]), elapsedMs: 10, toolCalls: 1, invocationId: `inv-${item.id}-${profile}`, provenanceEvidenceIds: []};
  }));
  const floor = (profile: HarnessProfileName, input: number): LiveHarnessFloorResult => ({profile, verifierResult: 'PASS', providerInputTokens: input, providerOutputTokens: 5, providerTotalTokens: input + 5, cachedInputTokens: 0, elapsedMs: 10, startup: {components: [], startupContextTokens: input - 10, taskContextTokens: 10, conversationHistoryTokens: 0, totalEstimatedContextTokens: input, repeatedContextCostEstimate: input - 10, turns: 1}, contextPacketId: `floor-${profile}`, contextSourceIds: []});
  const report = createLiveHarnessEfficiencyReport({suite, generatedAt: '2026-08-28T01:00:00.000Z', model: 'same-model', provider: 'local', endpointScope: 'loopback', modelListSha256: 'abc', floors: [floor('THIN', 100), floor('STANDARD', 400), floor('DEEP', 1000)], results});
  assert.equal(report.conclusions.boundedThinVerifiedSuccessRate, 1);
  assert.equal(report.conclusions.thinProviderFloorReductionVsStandardPercent, 75);
  assert.equal(report.aggregates.THIN.verifiedSuccesses, 1);
  assert.equal(report.aggregates.STANDARD.verifiedSuccesses, 2);
  assert.equal(report.aggregates.DEEP.verifiedSuccesses, 3);
  assert.equal(report.conclusions.providerCachedInputPercent, 0);
  assert.equal(report.aggregates.THIN.costPerVerifiedOutcome, null);
  assert.equal(report.conclusions.automaticRoutingSupportedByEvidence, false);
  assert.equal(report.governance.productionRoutingChanged, false);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  ContextPacketBuilder,
  FileHarnessEfficiencyLedger,
  HarnessEscalationController,
  HarnessProfileRouter,
  InMemoryContextGraph,
  MemoryHarnessEfficiencyLedger,
  calculateInvocationCost,
  configuredHarnessProfileRouter,
  configuredHarnessProfiles,
  createInvocationObservation,
  harnessStrategyFingerprint,
  measureStartupContext,
  normalizeProviderUsage,
  type ContextPacketSource,
  type HarnessOutcomeEvidence,
  type InvocationPricing,
} from './harness-efficiency.js';

const sources = (): ContextPacketSource[] => [
  {id: 'system', kind: 'system_instructions', content: 'governed execution', required: true, persistent: true, relevance: 1, provenanceIds: ['policy:v1']},
  {id: 'control', kind: 'agent_control_instructions', content: 'approval verification lease takeover', required: true, persistent: true, relevance: 1, provenanceIds: ['policy:v1']},
  {id: 'tools', kind: 'tool_schemas', content: '[read,edit,test]', required: true, persistent: true, relevance: 1, provenanceIds: ['tools:v1']},
  {id: 'exact-file', kind: 'task_context', content: 'src/exact.ts:12', required: true, relevance: 1, provenanceIds: ['source:exact']},
  {id: 'nearby-symbol', kind: 'task_context', content: 'function nearby() {}', relevance: .9, provenanceIds: ['source:nearby']},
  {id: 'shared-memory', kind: 'memory_shared_context', content: 'historical context', relevance: .8, provenanceIds: ['memory:1']},
  {id: 'repository-dump', kind: 'task_context', content: 'broad repository material', broad: true, relevance: .7, provenanceIds: ['repository:1']},
];

test('THIN context keeps required and highly relevant targeted evidence while naming omissions', () => {
  const packet = new ContextPacketBuilder().build('THIN', sources());
  assert.deepEqual(packet.sourceIds, ['control', 'exact-file', 'system', 'tools', 'nearby-symbol']);
  assert.deepEqual(packet.omitted.map(item => [item.id, item.reason]).sort(), [['repository-dump', 'profile_filtered'], ['shared-memory', 'profile_filtered']]);
  assert.ok(packet.provenanceIds.includes('source:exact'));
  assert.equal(packet.derived, true);
  assert.match(packet.id, /^context-[0-9a-f]{20}$/);
  assert.equal('content' in packet.entries[0], false);
});

test('STANDARD permits useful shared context but rejects optional broad repository dumps', () => {
  const packet = new ContextPacketBuilder().build('STANDARD', sources());
  assert.ok(packet.sourceIds.includes('shared-memory'));
  assert.equal(packet.sourceIds.includes('repository-dump'), false);
});

test('DEEP permits the full ranked neighbourhood without changing required provenance', () => {
  const packet = new ContextPacketBuilder().build('DEEP', sources());
  assert.equal(packet.entries.length, sources().length);
  assert.ok(packet.sourceIds.includes('repository-dump'));
  assert.deepEqual(packet.provenanceIds, [...packet.provenanceIds].sort());
});

test('context packets fail closed when required evidence cannot fit', () => {
  const required = [{id: 'huge', kind: 'task_context' as const, estimatedTokens: 5_000, required: true, relevance: 1, provenanceIds: ['source:huge']}];
  assert.throws(() => new ContextPacketBuilder().build('THIN', required), /required_budget_exceeded/);
});

test('known remaining model context tightens but never expands the selected profile budget', () => {
  const builder = new ContextPacketBuilder();
  assert.throws(() => builder.build('STANDARD', [{id: 'required', kind: 'task_context', estimatedTokens: 600, required: true, relevance: 1, provenanceIds: ['source:required']}], {availableContextTokens: 500}), /required_budget_exceeded/);
  assert.throws(() => builder.build('STANDARD', [], {availableContextTokens: 0}), /available_budget_invalid/);
});

test('configuration resolves profile ceilings and conservative routing mode', () => {
  const profiles = configuredHarnessProfiles({routingMode: 'enforce', profiles: {THIN: {maximumInitialContextTokens: 2048}}});
  assert.equal(profiles.THIN.maximumInitialContextTokens, 2048);
  assert.equal(profiles.STANDARD.maximumInitialContextTokens, 16384);
  const router = configuredHarnessProfileRouter({routingMode: 'observe', minimumVerifiedRuns: 2});
  assert.equal(router.route(thinSignals).mode, 'OBSERVE');
});

const thinSignals = {taskId: 'bounded', complexity: .2, risk: 'low' as const, knownExactTargets: true, estimatedFiles: 1, deterministicVerifier: true, ambiguity: .1, architectural: false};
const qualified: HarnessOutcomeEvidence = {verifiedRuns: 20, verifiedSuccessRate: .95, sameModelControlledRuns: 20, productionQualified: true};

test('profile routing is observational by default even when THIN is recommended', () => {
  const decision = new HarnessProfileRouter().route(thinSignals);
  assert.equal(decision.recommendedProfile, 'THIN');
  assert.equal(decision.appliedProfile, 'STANDARD');
  assert.ok(decision.reasons.includes('observational_mode_standard_applied'));
});

test('enforced THIN requires verifier-backed same-model production evidence', () => {
  const router = new HarnessProfileRouter({mode: 'ENFORCE', minimumVerifiedRuns: 10, minimumSuccessRate: .9, minimumSameModelControlledRuns: 10});
  assert.equal(router.route({...thinSignals, evidence: {THIN: {...qualified, productionQualified: false}}}).appliedProfile, 'STANDARD');
  assert.equal(router.route({...thinSignals, evidence: {THIN: qualified}}).appliedProfile, 'THIN');
});

test('controlled experiment mode applies only an explicitly requested profile without claiming qualification', () => {
  const router = new HarnessProfileRouter({mode: 'EXPERIMENT', minimumVerifiedRuns: 10, minimumSuccessRate: .9, minimumSameModelControlledRuns: 10});
  const requested = router.route({...thinSignals, requestedProfile: 'THIN'});
  assert.equal(requested.appliedProfile, 'THIN');
  assert.equal(requested.evidenceQualified, false);
  assert.ok(requested.reasons.includes('controlled_experiment_profile_applied'));
  const inferred = router.route(thinSignals);
  assert.equal(inferred.appliedProfile, 'STANDARD');
  assert.equal(inferred.reasons.includes('controlled_experiment_profile_applied'), false);
});

test('architectural, ambiguous and high-risk work recommends DEEP', () => {
  const decision = new HarnessProfileRouter().route({...thinSignals, complexity: .85, risk: 'high', architectural: true});
  assert.equal(decision.recommendedProfile, 'DEEP');
  assert.equal(decision.appliedProfile, 'STANDARD');
});

test('adaptive escalation advances profiles once and preserves references', () => {
  const controller = new HarnessEscalationController();
  assert.deepEqual(controller.next('THIN', ['THIN'], 'missing_context', {contextPacketId: 'context-a'}), {action: 'ESCALATE', from: 'THIN', to: 'STANDARD', reason: 'missing_context', preserve: {contextPacketId: 'context-a'}});
  assert.equal(controller.next('STANDARD', ['THIN', 'STANDARD', 'DEEP'], 'verifier_rejection').action, 'REVIEW');
});

test('provider usage preserves unknown cache and fresh-token metrics as null', () => {
  assert.deepEqual(normalizeProviderUsage({input_tokens: 100, output_tokens: 20, total_tokens: 120}), {inputTokens: 100, freshInputTokens: null, cachedInputTokens: null, cacheWriteTokens: null, outputTokens: 20, reasoningTokens: null, totalProcessedTokens: 120});
});

test('provider usage separates fresh, cached, cache-write and reasoning tokens when exposed', () => {
  assert.deepEqual(normalizeProviderUsage({input_tokens: 100, input_tokens_details: {cached_tokens: 60}, cache_creation_input_tokens: 5, output_tokens: 20, output_tokens_details: {reasoning_tokens: 7}, total_tokens: 120}), {inputTokens: 100, freshInputTokens: 40, cachedInputTokens: 60, cacheWriteTokens: 5, outputTokens: 20, reasoningTokens: 7, totalProcessedTokens: 120});
});

test('Responses cache writes are a distinct input portion and are not double counted as fresh input', () => {
  assert.deepEqual(normalizeProviderUsage({input_tokens: 100, input_tokens_details: {cached_tokens: 40, cache_write_tokens: 20}, output_tokens: 10, total_tokens: 110}), {inputTokens: 100, freshInputTokens: 40, cachedInputTokens: 40, cacheWriteTokens: 20, outputTokens: 10, reasoningTokens: null, totalProcessedTokens: 110});
});

test('cost calculation requires an explicit complete pricing schedule', () => {
  const usage = normalizeProviderUsage({input_tokens: 100, input_tokens_details: {cached_tokens: 60}, output_tokens: 20});
  assert.equal(calculateInvocationCost(usage, {currency: 'TEST', freshInputPerMillionTokens: 10, outputPerMillionTokens: 20, source: 'fixture'}), null);
  const pricing: InvocationPricing = {currency: 'TEST', freshInputPerMillionTokens: 10, cachedInputPerMillionTokens: 2, outputPerMillionTokens: 20, source: 'fixture'};
  assert.equal(calculateInvocationCost(usage, pricing), .00092);
});

test('startup component measurement is deterministic and separates task/history from the persistent floor', () => {
  const first = measureStartupContext(sources(), 3), second = measureStartupContext(sources(), 3);
  assert.deepEqual(first, second);
  assert.equal(first.components.length, 10);
  assert.equal(typeof first.components[0].estimatedTokens, 'number');
  assert.equal(first.repeatedContextCostEstimate, first.startupContextTokens * 3);
  assert.ok(first.taskContextTokens > 0);
});

test('invocation errors are redacted and bounded before telemetry persistence', () => {
  const item = createInvocationObservation({jobId: 'job-safe-error', taskId: 'task-safe-error', laneId: 'lane-safe-error', model: 'model-a', provider: 'provider-a', harnessProfile: 'STANDARD', executionStrategy: 'fixture', startedAt: '2026-08-27T10:00:00.000Z', completedAt: '2026-08-27T10:00:01.000Z', error: `Bearer unsafe.value secret=hunter2 ${'x'.repeat(3_000)}`, recipeFingerprint: 'recipe-safe-error'});
  assert.doesNotMatch(item.error ?? '', /unsafe\.value|hunter2/);
  assert.equal((item.error ?? '').length, 2_048);
});

test('failure timeout cancellation and missing usage retain truthful identity and unknowns', () => {
  const base = {jobId: 'job-outcomes', runId: 'run-outcomes', stepId: 'review', taskId: 'run-outcomes:review', laneId: 'lane-outcomes', model: 'model-visible', provider: 'provider-visible', harnessProfile: 'STANDARD' as const, executionStrategy: 'fixture', startedAt: '2026-08-27T10:00:00.000Z', completedAt: '2026-08-27T10:00:01.000Z', recipeFingerprint: 'recipe-outcomes'};
  const failed = createInvocationObservation({...base, outcome: 'FAILED', error: 'provider rejected request'});
  const timedOut = createInvocationObservation({...base, outcome: 'FAILED', error: 'provider invocation timed out'});
  const cancelled = createInvocationObservation({...base, outcome: 'CANCELLED', error: 'operator cancelled'});
  for (const item of [failed, timedOut, cancelled]) {
    assert.equal(item.provider, 'provider-visible'); assert.equal(item.model, 'model-visible');
    assert.equal(item.usage.totalProcessedTokens, null); assert.equal(item.usageSource, 'unknown'); assert.equal(item.costSource, 'unknown');
  }
  assert.equal(failed.state, 'FAILED'); assert.equal(timedOut.state, 'TIMED_OUT'); assert.equal(cancelled.state, 'CANCELLED');
});

function observation(id: string, jobId: string, rawUsage: unknown, pricing?: InvocationPricing) {
  return createInvocationObservation({id, jobId, runId: jobId, taskId: jobId, laneId: 'lane-1', model: 'same-model', provider: 'provider-a', harnessProfile: 'THIN', executionStrategy: 'fixture', startedAt: '2026-08-27T10:00:00.000Z', completedAt: '2026-08-27T10:00:01.000Z', startupSources: sources().slice(0, 4), rawUsage, pricing, recipeFingerprint: `recipe-${id}`});
}

test('cost per verified outcome counts only verifier-passed successful jobs', () => {
  const pricing: InvocationPricing = {currency: 'TEST', freshInputPerMillionTokens: 10, cachedInputPerMillionTokens: 2, outputPerMillionTokens: 20, source: 'fixture'};
  const ledger = new MemoryHarnessEfficiencyLedger();
  ledger.record(observation('a', 'job-a', {input_tokens: 100, input_tokens_details: {cached_tokens: 60}, output_tokens: 20, total_tokens: 120}, pricing));
  ledger.record(observation('b', 'job-b', {input_tokens: 100, input_tokens_details: {cached_tokens: 60}, output_tokens: 20, total_tokens: 120}, pricing));
  ledger.markVerification(['a'], 'PASS'); ledger.markFinalResult(['a'], 'SUCCEEDED');
  ledger.markVerification(['b'], 'FAIL', 'FAILED');
  const metrics = ledger.metrics().overall;
  assert.equal(metrics.verifiedSuccesses, 1);
  assert.equal(metrics.totalProcessedTokens, 240);
  assert.equal(metrics.cacheWriteTokens, null);
  assert.equal(metrics.tokensPerVerifiedOutcome, 240);
  assert.equal(metrics.costPerVerifiedOutcome, .00184);
  assert.equal(metrics.cacheEffectiveness, .6);
});

test('unknown usage prevents misleading aggregate token and cost claims', () => {
  const ledger = new MemoryHarnessEfficiencyLedger();
  assert.equal(ledger.metrics().overall.totalProcessedTokens, null);
  assert.equal(ledger.metrics().overall.providerReportedCost, null);
  assert.equal(ledger.metrics().overall.calculatedCost, null);
  ledger.record(observation('unknown', 'job-unknown', {total_tokens: 3}));
  ledger.markVerification(['unknown'], 'PASS', 'SUCCEEDED');
  const metrics = ledger.metrics().overall;
  assert.equal(metrics.totalProcessedTokens, 3);
  assert.equal(metrics.freshInputTokens, null);
  assert.equal(metrics.costPerVerifiedOutcome, null);
  assert.equal(metrics.unknownMetricInvocations, 1);
  assert.equal(ledger.metrics().byJob['job-unknown'].jobs, 1);
});

test('cancelled or failed cheap runs do not become verified successes', () => {
  const ledger = new MemoryHarnessEfficiencyLedger();
  ledger.record(observation('cancelled', 'job-cancelled', {input_tokens: 2, input_tokens_details: {cached_tokens: 0}, output_tokens: 1, total_tokens: 3}));
  ledger.markVerification(['cancelled'], 'FAIL', 'CANCELLED');
  assert.equal(ledger.metrics().overall.verifiedSuccesses, 0);
  assert.equal(ledger.metrics().overall.tokensPerVerifiedOutcome, null);
});

test('file ledger persists provenance and verification without storing prompt content', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-efficiency-'));
  const file = path.join(directory, 'ledger.json');
  try {
    const ledger = new FileHarnessEfficiencyLedger(file), item = observation('persisted', 'job-persisted', {total_tokens: 9});
    ledger.record(item); ledger.markVerification([item.id], 'PASS', 'SUCCEEDED');
    const restored = new FileHarnessEfficiencyLedger(file).list()[0];
    assert.equal(restored.provenance.recipeFingerprint, 'recipe-persisted');
    assert.equal(restored.verifierResult, 'PASS');
    assert.equal(fs.readFileSync(file, 'utf8').includes('governed execution'), false);
  } finally { fs.rmSync(directory, {recursive: true, force: true}); }
});

test('neutral context graph retrieves neighbourhoods and requires verified write-back', async () => {
  const graph = new InMemoryContextGraph([
    {id: 'file:a', type: 'file', label: 'router source', summary: 'profile router', provenanceIds: ['git:a'], verified: true},
    {id: 'test:a', type: 'test', label: 'router test', provenanceIds: ['test:a'], verified: true},
  ], [{from: 'file:a', to: 'test:a', relation: 'TESTED_BY', provenanceIds: ['git:a']}]);
  assert.deepEqual((await graph.findRelevantNodes({text: 'router', limit: 1})).map(node => node.id), ['file:a']);
  assert.equal((await graph.retrieveNeighbourhood(['file:a'], 1)).nodes.length, 2);
  await assert.rejects(() => graph.writeVerifiedKnowledge({id: 'decision:a', type: 'decision', label: 'unsafe', provenanceIds: [], verified: false}, 'verify:a'), /verification_required/);
  await graph.writeVerifiedKnowledge({id: 'decision:a', type: 'decision', label: 'safe', provenanceIds: [], verified: true}, 'verify:a');
  assert.equal((await graph.findRelevantNodes({types: ['decision']}))[0].provenanceIds.includes('verify:a'), true);
});

test('strategy identity includes provider, harness profile and context strategy without product conditionals', () => {
  const base = {modelId: 'model-a', providerId: 'provider-a', profile: 'THIN' as const, contextStrategyId: 'targeted-symbols', promptVersion: '1', toolIds: ['read'], skillIds: []};
  assert.notEqual(harnessStrategyFingerprint(base), harnessStrategyFingerprint({...base, profile: 'STANDARD'}));
  const source = fs.readFileSync(new URL('./harness-efficiency.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"].*(?:codex|responses-provider|structured-chat-provider)/i);
  assert.doesNotMatch(source, /provider(?:Id)?\s*===\s*['"]/i);
});

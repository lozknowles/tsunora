import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createInvocationObservation} from './harness-efficiency.js';
import {
  aggregateModelAttempts,
  detectRegressions,
  freezeQualificationSuite,
  loadFrozenQualificationSuite,
  ModelEvaluationCoordinator,
  ModelIntelligenceLedger,
  modelRouteKey,
  validateFrozenSuite,
  type FrozenQualificationSuite,
  type ModelCandidateIdentity,
  type ModelEvaluationAttempt,
} from './model-intelligence.js';

const candidate = (modelId: string): ModelCandidateIdentity => ({providerId: 'provider', modelId, providerModel: `vendor/${modelId}`, runtimeId: 'openai-compatible', runtimeVersion: '1', modelVersion: '2026-09', nodeId: 'controller'});
const sourceSuite = () => loadFrozenQualificationSuite(path.resolve('config/qualification-suite-v1.json'));
const smallSuite = () => { const source = sourceSuite(); return freezeQualificationSuite({id: 'test-suite', version: '1.0.0', createdAt: '2026-09-05T00:00:00Z', tasks: [{...source.tasks.find(item => item.fixture.execution === 'MODEL_STRUCTURED')!, repetitions: 1}]}); };
const usage = {inputTokens: 100, freshInputTokens: 60, cachedInputTokens: 40, cacheWriteTokens: 0, outputTokens: 20, reasoningTokens: 5, totalTokens: 120, authority: 'PROVIDER_REPORTED' as const};
const cost = {actual: null, calculated: .00108, equivalentUncached: .0014, estimatedCacheSavings: .00032, currency: 'USD', authority: 'CALCULATED' as const};
const resources = {cpuMs: null, gpuMs: null, peakRamBytes: null, peakVramBytes: null, energyWh: null, authority: 'UNAVAILABLE' as const};

function record(ledger: ModelIntelligenceLedger, batchId: string, suite: FrozenQualificationSuite, route: ModelCandidateIdentity, id: string, startedAt: string, passed = true, overrides: Partial<ModelEvaluationAttempt> = {}) {
  const task = suite.tasks[0];
  return ledger.recordAttempt({id, batchId, candidate: route, suiteId: suite.id, suiteVersion: suite.version, suiteSha256: suite.sha256, taskId: task.id, taskVersion: task.version, category: task.category, scorerId: task.scorer.id, scorerVersion: task.scorer.version, repetition: 1, seed: task.seed, agentControlVersion: '3.9.0', adapterVersion: 'test', promptVersion: 'test', status: passed ? 'PASSED' : 'FAILED', score: passed ? task.scorer.maximumScore : 0, maximumScore: task.scorer.maximumScore, passed, verification: passed ? 'PASS' : 'FAIL', criticalFailure: false, startedAt, completedAt: new Date(Date.parse(startedAt) + 1_000).toISOString(), elapsedMs: 1_000, retries: 0, usage, cost, resources, finishReason: 'stop', failureClass: passed ? null : 'VERIFICATION_FAILED', failureDetail: null, evidence: [`result:${id}`], invocationIds: [`invocation:${id}`], capabilitiesObserved: task.requiredCapabilities, ...overrides});
}

test('the qualification suite is content-addressed and includes every required capability category', () => {
  const suite = sourceSuite();
  assert.equal(validateFrozenSuite(suite), true);
  assert.equal(new Set(suite.tasks.map(item => item.category)).size, 17);
  for (const required of ['coding','repository-review','bug-diagnosis','code-modification','reasoning','retrieval','large-context','context-recovery','long-running','tool-calling','browser-use','computer-use','steering','parallel-work','reviewer','structured-output','safety-scope']) assert.ok(suite.tasks.some(item => item.category === required), required);
  const tampered = structuredClone(suite); tampered.tasks[0].fixture.instruction += ' changed';
  assert.throws(() => validateFrozenSuite(tampered), /frozen_qualification_suite_hash_invalid|frozen_qualification_task_invalid/);
});

test('provider-neutral coordinator distinguishes measured failure from capability unavailability', async () => {
  const suite = smallSuite(), ledger = new ModelIntelligenceLedger(), good = candidate('good'), unsupported = candidate('unsupported');
  ledger.createBatch({id: 'batch-two', suite, candidates: [good, unsupported], requestedBy: 'operator', reason: 'compare real routes'});
  const coordinator = new ModelEvaluationCoordinator(ledger, suite, {execute: async ({candidate: route, task}) => {
    if (route.modelId === 'unsupported') throw new Error('capability_unavailable:output.structured');
    const observation = createInvocationObservation({id: `inv-${route.modelId}`, jobId: 'qualification', taskId: task.id, laneId: 'eval', model: route.modelId, provider: route.providerId, harnessProfile: 'THIN', executionStrategy: 'frozen', startedAt: '2026-09-05T10:00:00Z', completedAt: '2026-09-05T10:00:01Z', rawUsage: {input_tokens: 100, input_tokens_details: {cached_tokens: 40}, output_tokens: 20, total_tokens: 120}, providerReportedCost: .001, recipeFingerprint: 'fixture'});
    return {observation, score: task.scorer.maximumScore, passed: true, evidence: ['verified:result']};
  }}, {agentControlVersion: '3.9.0', adapterVersion: 'test', promptVersion: 'test'});
  const batch = await coordinator.runNext();
  assert.equal(batch?.status, 'PARTIAL');
  assert.deepEqual(ledger.attemptsList({batchId: 'batch-two'}).map(item => [item.candidate.modelId, item.status, item.failureClass]).sort((left, right) => String(left[0]).localeCompare(String(right[0]))), [['good','PASSED',null],['unsupported','UNAVAILABLE','CAPABILITY_UNAVAILABLE']]);
});

test('an interrupted evaluation batch resumes without repeating recorded attempts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-model-eval-')), file = path.join(root, 'models.json'), suite = smallSuite(), route = candidate('resume'), first = new ModelIntelligenceLedger(file);
  first.createBatch({id: 'batch-resume', suite, candidates: [route], requestedBy: 'operator', reason: 'restart proof'}); first.startBatch('batch-resume');
  record(first, 'batch-resume', suite, route, 'attempt-existing', '2026-09-05T10:00:00Z');
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8')); assert.equal(snapshot.batches[0].status, 'RUNNING');
  const restored = new ModelIntelligenceLedger(file); assert.equal(restored.batchesList()[0].status, 'QUEUED');
  let calls = 0; const coordinator = new ModelEvaluationCoordinator(restored, suite, {execute: async ({task}) => { calls++; return {observation: createInvocationObservation({id: 'unexpected', jobId: 'qualification', taskId: task.id, laneId: 'eval', model: route.modelId, provider: route.providerId, harnessProfile: 'THIN', executionStrategy: 'frozen', startedAt: '2026-09-05T10:00:01Z', completedAt: '2026-09-05T10:00:02Z', rawUsage: {input_tokens: 1, output_tokens: 1, total_tokens: 2}, recipeFingerprint: 'fixture'}), score: task.scorer.maximumScore, passed: true}; }}, {agentControlVersion: '3.9.0', adapterVersion: 'test', promptVersion: 'test'});
  assert.equal((await coordinator.runNext())?.status, 'COMPLETED');
  assert.equal(calls, 0);
  assert.equal(restored.attemptsList({batchId: 'batch-resume'}).length, 1);
});

test('fresh, cached and equivalent-uncached economics remain separate and unknown data stays unknown', () => {
  const suite = smallSuite(), ledger = new ModelIntelligenceLedger(), route = candidate('economics'); ledger.createBatch({id: 'batch-cost', suite, candidates: [route], requestedBy: 'operator', reason: 'cost proof'});
  record(ledger, 'batch-cost', suite, route, 'known', '2026-09-05T10:00:00Z');
  const known = aggregateModelAttempts(ledger.attemptsList());
  assert.equal(known.cacheHitRatio, .4); assert.equal(known.freshInputTokens, 60); assert.equal(known.cachedInputTokens, 40); assert.equal(known.equivalentUncachedCost, .0014); assert.equal(known.estimatedCacheSavings, .00032); assert.equal(known.costPerSuccessfulTask, .00108);
  const unavailable = aggregateModelAttempts([{...ledger.attemptsList()[0], id: 'unknown', usage: {...usage, freshInputTokens: null, cachedInputTokens: null}, cost: {...cost, calculated: null, equivalentUncached: null, estimatedCacheSavings: null, authority: 'UNAVAILABLE'}}]);
  assert.equal(unavailable.freshInputTokens, null); assert.equal(unavailable.cacheHitRatio, null); assert.equal(unavailable.costPerSuccessfulTask, null); assert.deepEqual(unavailable.cacheCoverage, {knownAttempts: 0, totalAttempts: 1});
});

test('harness and invalid-test outcomes remain durable but cannot contaminate model quality or reliability', () => {
  const suite=smallSuite(),ledger=new ModelIntelligenceLedger(),route=candidate('attribution');ledger.createBatch({id:'batch-attribution',suite,candidates:[route],requestedBy:'operator',reason:'attribution proof'});
  record(ledger,'batch-attribution',suite,route,'model-pass','2026-09-05T10:00:00Z');
  record(ledger,'batch-attribution',suite,route,'harness-failure','2026-09-05T10:01:00Z',false,{failureClass:'ARCHITECTURE_REGRESSION',outcomeAttribution:'HARNESS_FAILURE'});
  const metrics=aggregateModelAttempts(ledger.attemptsList());
  assert.equal(metrics.attempts,2);assert.equal(metrics.executed,2);assert.equal(metrics.completed,1);assert.equal(metrics.excludedAttempts,1);assert.equal(metrics.passed,1);assert.equal(metrics.reliability,1);assert.equal(metrics.quality,1);assert.equal(metrics.totalTokens,120);assert.equal(metrics.attribution.HARNESS_FAILURE,1);assert.equal(metrics.attribution.MODEL_SUCCESS,1);
});

test('promotion requires enough durable history and explicit approval before PREFERRED', () => {
  const suite = smallSuite(), ledger = new ModelIntelligenceLedger(undefined, () => '2026-09-08T12:00:00Z'), route = candidate('qualified'), routeKey = modelRouteKey(route); ledger.createBatch({id: 'batch-promotion', suite, candidates: [route], requestedBy: 'operator', reason: 'promotion proof'});
  ['2026-08-31','2026-09-02','2026-09-04','2026-09-06','2026-09-07','2026-09-08'].forEach((day, index) => record(ledger, 'batch-promotion', suite, route, `promotion-${index}`, `${day}T10:00:00Z`));
  assert.equal(ledger.promotionAssessment(routeKey).eligible, true);
  ledger.transition({routeKey, to: 'QUALIFIED', actor: 'reviewer', reason: 'frozen suite thresholds pass', evidence: ['batch:batch-promotion']});
  assert.throws(() => ledger.transition({routeKey, to: 'PREFERRED', actor: 'operator', reason: 'prefer it'}), /model_preferred_transition_requires_approval/);
  ledger.transition({routeKey, to: 'PREFERRED', actor: 'operator', reason: 'approved preference after review', approved: true, evidence: ['approval:operator']});
  const projection = ledger.projection('2026-09-08T12:00:00Z');
  assert.equal(projection.routes[0].state, 'PREFERRED');
  assert.equal(projection.leaders.mostReliableModel?.routeKey, routeKey);
});

test('rolling history detects verified reliability, quality and efficiency regression', () => {
  const suite = smallSuite(), ledger = new ModelIntelligenceLedger(), route = candidate('regressing'); ledger.createBatch({id: 'batch-regression', suite, candidates: [route], requestedBy: 'operator', reason: 'regression proof'});
  for (let index = 0; index < 3; index++) record(ledger, 'batch-regression', suite, route, `baseline-${index}`, `2026-08-${15 + index}T10:00:00Z`, true, {elapsedMs: 1_000, cost: {...cost, calculated: .001}, usage: {...usage, freshInputTokens: 50}});
  for (let index = 0; index < 3; index++) record(ledger, 'batch-regression', suite, route, `recent-${index}`, `2026-09-0${2 + index}T10:00:00Z`, false, {elapsedMs: 3_000, cost: {...cost, calculated: .003}, usage: {...usage, freshInputTokens: 120}});
  const warnings = detectRegressions(ledger.attemptsList(), '2026-09-05T12:00:00Z');
  assert.ok(warnings.some(item => item.metric === 'success-rate' && item.severity === 'CRITICAL'));
  assert.ok(warnings.some(item => item.metric === 'quality'));
});

test('recorded invocation derives cache savings from the versioned pricing basis, not unrelated billed cost', () => {
  const suite = smallSuite(), ledger = new ModelIntelligenceLedger(), route = candidate('pricing'); ledger.createBatch({id: 'batch-pricing', suite, candidates: [route], requestedBy: 'operator', reason: 'pricing proof'});
  const task = suite.tasks[0], pricingBasis = {tableId: 'test-pricing', version: '2026-09-01', effectiveAt: '2026-09-01T00:00:00Z', source: 'pricing-v1', provider: route.providerId, model: route.providerModel, currency: 'USD', inputPerMillionTokens: 10, cachedInputPerMillionTokens: 2, outputPerMillionTokens: 20}, observation = createInvocationObservation({id: 'priced-invocation', jobId: 'qualification', taskId: task.id, laneId: 'eval', model: route.modelId, provider: route.providerId, harnessProfile: 'THIN', executionStrategy: 'frozen', startedAt: '2026-09-05T10:00:00Z', completedAt: '2026-09-05T10:00:01Z', rawUsage: {input_tokens: 100, input_tokens_details: {cached_tokens: 40}, output_tokens: 20, total_tokens: 120}, providerReportedCost: .0001, costAccounting: {billingMode: 'API_METERED', cloud: {usage: {inputTokens: 100, freshInputTokens: 60, cachedInputTokens: 40, cacheWriteTokens: null, outputTokens: 20, reasoningTokens: null}, pricingBasis, calculatedApiCost: .00108}}, recipeFingerprint: 'fixture'});
  const attempt = ledger.recordInvocation({batchId: 'batch-pricing', suite, task, candidate: route, observation, score: task.scorer.maximumScore, passed: true, agentControlVersion: '3.9.0', adapterVersion: 'test', promptVersion: 'test'});
  assert.equal(attempt.cost.actual, .0001);
  assert.equal(attempt.cost.calculated, .00108);
  assert.equal(attempt.cost.equivalentUncached, .0014);
  assert.ok(Math.abs(attempt.cost.estimatedCacheSavings! - .00032) < 1e-12);
});

test('recorded invocation preserves attributed process memory and sampling limits', () => {
  const suite = smallSuite(), ledger = new ModelIntelligenceLedger(), route = candidate('measured');
  ledger.createBatch({id: 'batch-measured', suite, candidates: [route], requestedBy: 'operator', reason: 'resource attribution proof'});
  const task = suite.tasks[0], observation = createInvocationObservation({jobId: 'qualification', taskId: task.id, laneId: 'eval', model: route.modelId, provider: route.providerId, harnessProfile: 'THIN', executionStrategy: 'frozen', startedAt: '2026-09-05T10:00:00Z', completedAt: '2026-09-05T10:00:01Z', recipeFingerprint: 'fixture', resources: {cpuMs: null, gpuMs: null, peakRamBytes: 456, peakVramBytes: 789, energyWh: null, authority: 'MEASURED', sampleCount: 3, attributedSampleCount: 2, samplingIntervalMs: 500, baseline: {ramBytes: 100, processVramBytes: null, deviceVramBytes: 2_000}, devicePeakVramBytes: 2_500, source: 'fixture-adapter', limitations: ['device_vram_includes_shared_processes']}});
  const attempt = ledger.recordInvocation({batchId: 'batch-measured', suite, task, candidate: route, observation, score: task.scorer.maximumScore, passed: true, agentControlVersion: '4.5.0', adapterVersion: 'fixture', promptVersion: 'fixture'});
  assert.equal(attempt.resources.peakRamBytes, 456);
  assert.equal(attempt.resources.peakVramBytes, 789);
  assert.equal(attempt.resources.samplingIntervalMs, 500);
  assert.deepEqual(attempt.resources.limitations, ['device_vram_includes_shared_processes']);
  assert.equal(aggregateModelAttempts([attempt]).resourceCoverage.measuredAttempts, 1);
});

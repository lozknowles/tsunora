import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {gunzipSync} from 'node:zlib';
import {
  aggregateInvocationUsage,
  classifyMutationEscalation,
  createMutationQualificationReport,
  parseMutationBenchmarkSuite,
  predictMutationContextProfile,
  type MutationAttemptResult,
  type MutationBenchmarkTask,
  type MutationOutcomeResult,
  type MutationStrategy,
  type MutationVerifierResult,
} from './harness-mutation-benchmark.js';
import {fixtureContentSha256} from './harness-mutation-workspace.js';

const root = process.cwd();
const suite = parseMutationBenchmarkSuite(JSON.parse(fs.readFileSync(path.join(root, 'benchmarks', 'harness-mutation-jobs.json'), 'utf8')));

test('frozen mutation suite has 12 distinct real mutation classes and an exact fixture hash', () => {
  assert.equal(suite.tasks.length, 12);
  assert.equal(new Set(suite.tasks.map(task => task.taskClass)).size, 12);
  assert.equal(fixtureContentSha256(path.join(root, suite.fixturePath)), suite.fixtureSha256);
  assert.ok(suite.tasks.every(task => task.requiredChangedFiles.every(file => task.allowedFiles.includes(file))));
});

test('explainable predictor selects narrow, ordinary and architectural profiles without model identity', () => {
  assert.equal(predictMutationContextProfile(suite.tasks.find(task => task.id === 'MUT-001')!).profile, 'THIN');
  assert.equal(predictMutationContextProfile(suite.tasks.find(task => task.id === 'MUT-006')!).profile, 'STANDARD');
  const deep = predictMutationContextProfile(suite.tasks.find(task => task.id === 'MUT-012')!);
  assert.equal(deep.profile, 'DEEP');
  assert.ok(deep.reasons.includes('architectural_contract'));
  assert.equal(JSON.stringify(deep).includes('provider'), false);
});

test('escalation classification fails closed for policy/scope errors and classifies missing context', () => {
  const task = suite.tasks.find(item => item.id === 'MUT-012')!;
  assert.equal(classifyMutationEscalation(task, 'THIN', verifier(false, 'HIDDEN_VERIFIER')), 'missing_context');
  assert.equal(classifyMutationEscalation(suite.tasks[0], 'THIN', verifier(true, 'NONE'), 'structured_chat_loop_turn_limit:3'), 'tool_limitation');
  assert.equal(classifyMutationEscalation(task, 'THIN', verifier(false, 'SCOPE_VIOLATION'), 'mutation_scope_violation:x'), null);
  assert.equal(classifyMutationEscalation(task, 'THIN', verifier(false, 'EXECUTION'), 'tool_policy_denied:human_owns_execution'), null);
});

test('usage aggregation is deterministic and propagates unknown provider measurements', () => {
  const startedAt = '2026-08-28T00:00:00.000Z', completedAt = '2026-08-28T00:00:01.000Z';
  const observations = [1, 2].map(turn => ({schema: 'agent-control.model-invocation/v1', id: `i${turn}`, jobId: 'j', runId: 'r', taskId: 't', laneId: 'l', model: 'm', provider: 'p', harnessProfile: 'THIN', harnessId: 'h', executionStrategy: 's', turnNumber: turn, startedAt, completedAt, elapsedMs: 1000, startup: {components: [], startupContextTokens: 0, taskContextTokens: 0, conversationHistoryTokens: 0, totalEstimatedContextTokens: 0, repeatedContextCostEstimate: 0, turns: turn}, usage: {inputTokens: 10, freshInputTokens: turn === 1 ? 8 : null, cachedInputTokens: turn === 1 ? 2 : null, cacheWriteTokens: null, outputTokens: 3, reasoningTokens: null, totalProcessedTokens: 13}, providerReportedCost: null, calculatedCost: null, currency: null, toolCalls: 1, toolIds: [], agentId: null, filesContextSupplied: null, contextSourceIds: [], retrievedContextTokens: null, repositoryContextTokens: null, conversationHistoryTokens: 0, verifierResult: 'UNKNOWN', finalJobResult: 'UNKNOWN', outcome: 'COMPLETE', error: null, provenance: {recipeFingerprint: 'f', evidenceIds: []}} as const));
  const usage = aggregateInvocationUsage(observations as never);
  assert.equal(usage.inputTokens, 20);
  assert.equal(usage.outputTokens, 6);
  assert.equal(usage.freshInputTokens, null);
  assert.equal(usage.cachedInputTokens, null);
});

test('production routing gate rejects an undersized mutation sample while preserving STANDARD fallback', () => {
  const strategies: MutationStrategy[] = ['THIN_ONLY', 'STANDARD_ONLY', 'DEEP_ONLY', 'ADAPTIVE_THIN_STANDARD_DEEP'];
  const outcomes = strategies.flatMap(strategy => suite.tasks.map(task => outcome(task, strategy)));
  const report = createMutationQualificationReport({suite, generatedAt: '2026-08-28T02:00:00.000Z', model: 'same-model', provider: 'same-provider', outcomes, safety: {toolPolicy: true, staleLease: true, staleOwnership: true, humanTakeover: true, fallback: true, neutrality: true}});
  assert.equal(report.productionRoutingGate.qualified, false);
  assert.equal(report.productionRoutingGate.criteria.find(item => item.id === 'deterministic_real_mutation_sample')?.passed, false);
  assert.equal(report.productionRoutingGate.appliedProductionMode, 'OBSERVATIONAL_STANDARD_FALLBACK');
  assert.equal(report.conclusions.monetaryCostPerVerifiedOutcome, null);
  assert.equal(report.governance.productionRoutingChanged, false);
});

test('suite parser rejects path traversal, duplicate tasks and unsealed fixture identities', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'benchmarks', 'harness-mutation-jobs.json'), 'utf8'));
  assert.throws(() => parseMutationBenchmarkSuite({...raw, fixtureSha256: 'pending'}), /identity_invalid/);
  const escaped = structuredClone(raw); escaped.tasks[0].allowedFiles = ['../escape'];
  assert.throws(() => parseMutationBenchmarkSuite(escaped), /paths_invalid/);
  assert.throws(() => parseMutationBenchmarkSuite({...raw, tasks: [raw.tasks[0], raw.tasks[0]]}), /duplicate_task/);
});

test('recorded patch evidence is lossless, scoped and linked to each authoritative diff hash', () => {
  const report = JSON.parse(fs.readFileSync(path.join(root, 'artifacts', 'harness-mutation-report.json'), 'utf8')) as {outcomes: MutationOutcomeResult[]};
  let checked = 0;
  for (const outcome of report.outcomes) for (const attempt of outcome.attempts) {
    const evidence = attempt.evidenceIds.find(id => id.startsWith('patch:'));
    if (!evidence) continue;
    const relative = evidence.slice('patch:'.length);
    assert.match(relative, /^artifacts\/harness-mutation-evidence\/[a-z0-9_-]+\.patch\.gz$/);
    const file = path.resolve(root, relative);
    assert.equal(path.relative(path.join(root, 'artifacts', 'harness-mutation-evidence'), file).startsWith('..'), false);
    const patch = gunzipSync(fs.readFileSync(file));
    assert.equal(createHash('sha256').update(patch).digest('hex'), attempt.verifier.diffSha256);
    checked++;
  }
  assert.equal(checked, 52);
});

function verifier(passed: boolean, failureClass: MutationVerifierResult['failureClass']): MutationVerifierResult {
  return {schema: 'agent-control.mutation-verifier/v1', taskId: 'task', passed, startedAt: '2026-08-28T00:00:00.000Z', completedAt: '2026-08-28T00:00:01.000Z', checks: [], changedFiles: passed ? ['src/a.js'] : [], addedLines: 1, deletedLines: 1, diffSha256: 'd'.repeat(64), failureClass};
}

function outcome(task: MutationBenchmarkTask, strategy: MutationStrategy): MutationOutcomeResult {
  const profile = strategy === 'THIN_ONLY' ? 'THIN' : strategy === 'DEEP_ONLY' ? 'DEEP' : 'STANDARD';
  const verification = verifier(true, 'NONE');
  const usage = {inputTokens: 100, freshInputTokens: 80, cachedInputTokens: 20, cacheWriteTokens: null, outputTokens: 10, reasoningTokens: null, totalProcessedTokens: 110};
  const attempt: MutationAttemptResult = {attemptId: `${task.id}:${strategy}`, taskId: task.id, strategy, profile, attemptNumber: 1, startedAt: '2026-08-28T00:00:00.000Z', completedAt: '2026-08-28T00:00:01.000Z', elapsedMs: 1000, predictedProfile: predictMutationContextProfile(task).profile, predictionConfidence: .8, predictionReasons: [], contextPacketId: 'packet', contextSourceIds: [], omittedContextSourceIds: [], recipeId: 'recipe', invocationIds: ['inv'], usage, initialProviderInputTokens: 100, persistentEstimatedContextTokens: 50, turns: 1, toolCalls: 2, toolIds: [], repositoryReads: 1, repositorySearches: 0, mutationsAttempted: 1, verifierAttempts: 1, verifier: verification, verifiedSuccess: true, failureReason: null, escalationReason: null, checkpointDiffSha256: verification.diffSha256, evidenceIds: []};
  return {outcomeId: attempt.attemptId, taskId: task.id, taskClass: task.taskClass, strategy, predictedContextProfile: predictMutationContextProfile(task), actualSuccessfulMinimumProfile: task.expectedMinimumProfile, startingProfile: profile, attempts: [attempt], escalationCount: 0, verifiedSuccess: true, finalProfile: profile, cumulativeUsage: usage, cumulativeTurns: 1, cumulativeToolCalls: 2, cumulativeLatencyMs: 1000, monetaryCost: null, monetaryCostReason: 'unknown', finalVerifier: verification, provenance: {fixtureSha256: suite.fixtureSha256, startingRevision: 's'.repeat(40), attemptIds: [attempt.attemptId], evidenceIds: []}};
}

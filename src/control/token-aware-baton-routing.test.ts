import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {TokenAwareBatonRuntime, governorFor, normalizeGovernorPolicy, type BatonInput} from './token-aware-baton-routing.js';

const at = (second: number) => `2026-09-02T10:00:${String(second).padStart(2, '0')}.000Z`;
function runtime(file?: string) { return new TokenAwareBatonRuntime(file, {}, () => at(59)); }
function sample(threadId: string, values: {parcelId?: string; agentId?: string; providerId?: string; modelId?: string; input?: number; fresh?: number | null; cached?: number | null; cacheWrite?: number | null; output?: number; total?: number; context?: number | null; limit?: number | null; authority?: 'authoritative' | 'estimated' | 'unavailable'; cost?: number | null; elapsedMs?: number} = {}) {
  return {threadId, parcelId: values.parcelId ?? 'parcel:one', agentId: values.agentId ?? threadId, providerId: values.providerId ?? 'openai', modelId: values.modelId ?? 'sol', elapsedMs: values.elapsedMs ?? 1_000, cumulative: {inputTokens: values.input ?? 10, ...(values.fresh !== undefined ? {freshInputTokens: values.fresh} : {}), cachedInputTokens: values.cached === undefined ? 0 : values.cached, ...(values.cacheWrite !== undefined ? {cacheWriteTokens: values.cacheWrite} : {}), outputTokens: values.output ?? 5, totalTokens: values.total ?? 15}, context: {tokens: values.context ?? null, limitTokens: values.limit ?? null, authority: values.authority ?? 'unavailable', source: values.authority === 'estimated' ? 'adapter_estimate' : values.authority === 'authoritative' ? 'provider_live' : 'provider_not_reported'}, cost: {amount: values.cost ?? null, currency: values.cost === undefined || values.cost === null ? null : 'USD', authority: values.cost === undefined || values.cost === null ? 'unavailable' : 'estimated', source: values.cost === undefined || values.cost === null ? 'provider_not_reported' : 'pricing_table'}} as const;
}
function baton(threadId = 'thread:one', overrides: Partial<BatonInput> = {}): BatonInput { return {threadId, parcelId: 'parcel:one', providerId: 'openai', modelId: 'sol', objective: 'Finish governed task', completedWork: ['identified routing boundary'], decisions: ['retain difficult reasoning on Sol'], filesChanged: ['src/control/example.ts'], git: {sha: 'a'.repeat(40), dirty: true, diffSummary: '1 file changed'}, testsAndEvidence: ['npm test'], unresolvedIssues: ['none'], nextAction: 'Run focused verifier', ...overrides}; }

test('governor transitions under live context pressure use policy thresholds, not lifetime tokens', () => {
  const value = runtime();
  value.observe({...sample('thread:one', {input: 500, output: 50, total: 550, context: 60, limit: 100, authority: 'authoritative'}), observedAt: at(0)});
  assert.equal(value.thread('thread:one').governor.currentThreshold, 60);
  value.observe({...sample('thread:one', {input: 1_000, output: 100, total: 1_100, context: 74, limit: 100, authority: 'authoritative'}), observedAt: at(1)});
  assert.equal(value.thread('thread:one').governor.state, 'CONTINUE');
  value.observe({...sample('thread:one', {input: 2_000, output: 200, total: 2_200, context: 75, limit: 100, authority: 'authoritative'}), observedAt: at(2)});
  assert.equal(value.thread('thread:one').governor.state, 'PREPARE_BATON');
  value.observe({...sample('thread:one', {input: 3_000, output: 300, total: 3_300, context: 85, limit: 100, authority: 'authoritative'}), observedAt: at(3)});
  assert.equal(value.thread('thread:one').governor.state, 'COMPACT');
  value.observe({...sample('thread:one', {input: 4_000, output: 400, total: 4_400, context: 91, limit: 100, authority: 'authoritative'}), observedAt: at(4)});
  const thread = value.thread('thread:one'); assert.equal(thread.governor.state, 'HANDOFF'); assert.equal(thread.latest.contextPercent, 91); assert.equal(thread.latest.cumulative.totalTokens, 4_400);
  assert.deepEqual(value.projection().decisions.filter(item => item.outcome === 'RECORDED').map(item => item.state), ['CONTINUE', 'PREPARE_BATON', 'COMPACT', 'HANDOFF']);
});

test('lifetime usage and current context occupancy remain separate and unknown context is never invented', () => {
  const value = runtime();
  value.observe({...sample('thread:one', {input: 80_000, output: 20_000, total: 100_000, context: 12_000, limit: 128_000, authority: 'authoritative'}), observedAt: at(1)});
  const exact = value.thread('thread:one'); assert.equal(exact.latest.cumulative.totalTokens, 100_000); assert.equal(exact.latest.context.tokens, 12_000); assert.equal(exact.latest.contextPercent, 9.375); assert.equal(exact.latest.context.authority, 'authoritative');
  value.observe({...sample('thread:two', {context: null, limit: 128_000, authority: 'unavailable'}), observedAt: at(2)});
  const unavailable = value.thread('thread:two'); assert.equal(unavailable.latest.context.tokens, null); assert.equal(unavailable.latest.contextPercent, null); assert.equal(unavailable.governor.state, 'CONTINUE');
});

test('cached input remains part of cumulative input while missing cache telemetry leaves fresh input unknown', () => {
  const value = runtime();
  value.observe({...sample('cached', {input: 100, cached: 40, output: 20, total: 120}), observedAt: at(1)});
  assert.deepEqual(value.thread('cached').latest.cumulative, {inputTokens: 100, freshInputTokens: 60, cachedInputTokens: 40, cacheWriteTokens: null, outputTokens: 20, totalTokens: 120});
  value.observe({threadId: 'unknown', parcelId: 'parcel:unknown', agentId: 'unknown', providerId: 'provider', modelId: 'model', elapsedMs: 1, cumulative: {inputTokens: 100, outputTokens: 20, totalTokens: 120}});
  assert.deepEqual(value.thread('unknown').latest.cumulative, {inputTokens: 100, freshInputTokens: null, cachedInputTokens: null, cacheWriteTokens: null, outputTokens: 20, totalTokens: 120});
});

test('cache writes are a distinct cumulative input category and are not double-counted as fresh input', () => {
  const value = runtime();
  value.observe({...sample('writes', {input: 100, cached: 40, cacheWrite: 20, output: 20, total: 120}), observedAt: at(1)});
  assert.deepEqual(value.thread('writes').latest.cumulative, {inputTokens: 100, freshInputTokens: 40, cachedInputTokens: 40, cacheWriteTokens: 20, outputTokens: 20, totalTokens: 120});
  const totals = value.parcel('parcel:one');
  assert.equal(totals.inputTokens, 100); assert.equal(totals.freshInputTokens, 40); assert.equal(totals.cachedInputTokens, 40); assert.equal(totals.cacheWriteTokens, 20);
});

test('estimated context is explicitly marked and policy validation rejects unsafe threshold ordering', () => {
  const value = runtime(); value.observe({...sample('thread:one', {context: 70, limit: 100, authority: 'estimated'}), observedAt: at(1)});
  assert.equal(value.thread('thread:one').latest.context.authority, 'estimated'); assert.equal(value.thread('thread:one').latest.contextPercent, 70);
  assert.throws(() => normalizeGovernorPolicy({prepareBatonPercent: 90, compactPercent: 85, handoffPercent: 95}), /threshold_order/);
  assert.equal(governorFor(85, normalizeGovernorPolicy()).state, 'COMPACT');
});

test('an unavailable post-compaction count clears stale occupancy and cannot trigger a false handoff', () => {
  const value = runtime();
  value.observe({...sample('thread:one', {context: 90, limit: 100, authority: 'estimated'}), observedAt: at(1)});
  assert.equal(value.thread('thread:one').governor.state, 'HANDOFF');
  value.observe({...sample('thread:one', {context: null, limit: 100, authority: 'unavailable', elapsedMs: 2_000}), observedAt: at(2), contextLifecycle: {kind: 'COMPACTION', authority: 'authoritative', source: 'provider_native_count_unavailable'}});
  const current = value.thread('thread:one');
  assert.deepEqual(current.latest.context, {tokens: null, limitTokens: 100, authority: 'unavailable', source: 'provider_not_reported'});
  assert.equal(current.latest.contextPercent, null);
  assert.deepEqual(current.governor, {state: 'CONTINUE', currentThreshold: null, nextThreshold: 75, reason: 'current_context_unavailable'});
});

test('verified baton preserves provenance, git state, token state and parcel totals before explicit handoff', () => {
  const value = runtime(); value.observe({...sample('thread:one', {context: 91, limit: 100, authority: 'authoritative', input: 100, output: 40, total: 140, cost: .02}), observedAt: at(1)});
  const created = value.createBaton(baton()); assert.match(created.sha256, /^[a-f0-9]{64}$/); assert.equal(created.tokenState.contextPercent, 91); assert.equal(created.parcelTotals.totalTokens, 140); assert.equal(value.thread('thread:one').batonId, created.id);
});

test('bounded mechanical work can hand off to a qualified cheaper route while difficult reasoning remains on the stronger model', () => {
  const value = runtime(); value.observe({...sample('thread:one', {context: 91, limit: 100, authority: 'authoritative', cost: 10}), observedAt: at(1)});
  const mechanical = value.assess('thread:one', {remainingWork: 'MECHANICAL', reasoningState: 'COMPLETE', requiredCapabilities: ['coding'], candidates: [{providerId: 'openrouter', modelId: 'glm-5.3-flash', estimatedCost: 1, qualified: true, capabilities: ['coding']}]});
  assert.equal(mechanical.action, 'BATON_AND_HANDOFF'); assert.deepEqual(mechanical.target, {providerId: 'openrouter', modelId: 'glm-5.3-flash'});
  const difficult = value.assess('thread:one', {remainingWork: 'DIFFICULT', reasoningState: 'UNFINISHED', requiredCapabilities: ['coding'], candidates: [{providerId: 'openrouter', modelId: 'glm-5.3-flash', estimatedCost: 1, qualified: true, capabilities: ['coding']}]});
  assert.equal(difficult.action, 'COMPACT_AND_CONTINUE'); assert.match(difficult.reason, /difficult_reasoning/);
});

test('an independently observed quality failure selects the configured governed fallback without pretending context pressure or lower cost', () => {
  const value = runtime();
  value.observe({...sample('thread:one', {providerId: 'local', modelId: 'source-small', context: 12, limit: 100, authority: 'authoritative', cost: 0}), observedAt: at(1)});
  const decision = value.assess('thread:one', {
    remainingWork: 'DIFFICULT', reasoningState: 'UNFINISHED', requiredCapabilities: ['repository-review'],
    trigger: {kind: 'QUALITY_GATE', code: 'acceptance_tests_not_explained', reason: 'The result did not account for two predeclared failing tests.', evidence: ['test-report:sha256:abc']},
    candidates: [
      {providerId: 'local', modelId: 'source-small', estimatedCost: 0, qualified: true, capabilities: ['repository-review'], preferenceOrder: 0},
      {providerId: 'local', modelId: 'strong-reviewer', estimatedCost: 2, qualified: true, capabilities: ['repository-review'], preferenceOrder: 1},
    ],
  });
  assert.equal(decision.state, 'CONTINUE');
  assert.equal(decision.action, 'BATON_AND_HANDOFF');
  assert.equal(decision.target?.modelId, 'strong-reviewer');
  assert.equal(decision.trigger?.kind, 'QUALITY_GATE');
  assert.equal(decision.trigger?.code, 'acceptance_tests_not_explained');
  assert.match(decision.reason, /^quality_gate_failed_governed_fallback_selected:/);
  assert.notEqual(decision.reason, 'context_handoff_threshold_and_bounded_work_on_qualified_lower_cost_route');
});

test('successful and failed handoffs preserve the original recoverable thread and record outcomes', async () => {
  const value = runtime(); value.observe({...sample('thread:one', {context: 91, limit: 100, authority: 'authoritative'}), observedAt: at(1)}); const sealed = value.createBaton(baton());
  const success = await value.handoff('thread:one', sealed.id, {providerId: 'openrouter', modelId: 'glm-5.3-flash'}, async () => undefined); assert.equal(success.outcome, 'SUCCEEDED'); assert.equal(value.thread('thread:one').recoverable, true);
  const failure = await value.handoff('thread:one', sealed.id, {providerId: 'openrouter', modelId: 'glm-5.3-flash'}, async () => { throw new Error('target_unavailable'); }); assert.equal(failure.outcome, 'FAILED'); assert.equal(value.thread('thread:one').recoverable, true); assert.equal(value.thread('thread:one').governor.state, 'HANDOFF'); assert.equal(failure.action, 'COMPACT_AND_CONTINUE'); assert.match(failure.reason, /handoff_failed_original_thread_reassessed/);
});

test('parcel totals survive Sol to Luna to GLM handoffs and durable evidence reconciles after restart', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-token-routing-')), 'routing.json'), value = runtime(file);
  value.observe({...sample('sol', {agentId: 'sol-agent', modelId: 'sol', input: 160_000, cached: 40_000, output: 24_000, total: 184_000, context: 80_000, limit: 128_000, authority: 'authoritative', cost: 2}), observedAt: at(1)});
  value.observe({...sample('luna', {agentId: 'luna-agent', modelId: 'luna', input: 28_000, cached: 8_000, output: 3_000, total: 31_000, context: 20_000, limit: 128_000, authority: 'estimated', cost: 1}), observedAt: at(2)});
  value.observe({...sample('glm', {agentId: 'glm-agent', providerId: 'openrouter', modelId: 'glm-5.3-flash', input: 16_000, output: 2_000, total: 18_000, context: null, limit: 131_072, authority: 'unavailable', cost: .2}), observedAt: at(3)});
  const totals = value.parcel('parcel:one'); assert.equal(totals.totalTokens, 233_000); assert.equal(totals.inputTokens, 204_000); assert.equal(totals.freshInputTokens, 156_000); assert.equal(totals.cachedInputTokens, 48_000); assert.equal(totals.byModel.length, 3); assert.equal(totals.cost, 3.2);
  assert.deepEqual(totals.byModel.map(item => item.modelId), ['sol', 'luna', 'glm-5.3-flash']);
  const restored = runtime(file); assert.deepEqual(restored.parcel('parcel:one'), totals); assert.equal(restored.projection().threads.length, 3); assert.ok(fs.readFileSync(file, 'utf8').includes('token-aware-baton-routing'));
});

test('legacy routing snapshots recover with unknown cache components instead of inventing zero cache', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-token-routing-legacy-')), file = path.join(root, 'routing.json'), value = runtime(file);
  value.observe({...sample('legacy', {input: 100, cached: 25, output: 20, total: 120}), observedAt: at(1)});
  const snapshot = value.evidence() as unknown as {threads: Array<{latest: {cumulative: Record<string, unknown>}; samples: Array<{cumulative: Record<string, unknown>}>}>};
  delete snapshot.threads[0].latest.cumulative.freshInputTokens; delete snapshot.threads[0].latest.cumulative.cachedInputTokens;
  for (const point of snapshot.threads[0].samples) { delete point.cumulative.freshInputTokens; delete point.cumulative.cachedInputTokens; }
  fs.writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`);
  const restored = runtime(file);
  assert.deepEqual(restored.thread('legacy').latest.cumulative, {inputTokens: 100, freshInputTokens: null, cachedInputTokens: null, cacheWriteTokens: null, outputTokens: 20, totalTokens: 120});
  assert.equal(restored.parcel('parcel:one').freshInputTokens, null);
});

test('compaction, new context and resume are durable without resetting lifetime or parcel totals', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-context-lifecycle-')), 'routing.json'), value = runtime(file);
  value.observe({...sample('thread:one', {input: 1_000, output: 100, total: 1_100, context: 90, limit: 100, authority: 'authoritative'}), observedAt: at(1), contextLifecycle: {kind: 'COMPACTION', contextId: 'compact-1', authority: 'authoritative', source: 'provider_native'}});
  value.observe({...sample('thread:one', {input: 1_200, output: 120, total: 1_320, context: 20, limit: 100, authority: 'estimated'}), observedAt: at(2), contextLifecycle: {kind: 'NEW_CONTEXT', contextId: 'window-2', authority: 'authoritative', source: 'provider_native'}});
  value.recordContextLifecycle('thread:one', {kind: 'RESUME', contextId: 'window-2', authority: 'authoritative', source: 'provider_native'}, at(3));
  assert.equal(value.thread('thread:one').latest.cumulative.totalTokens, 1_320);
  assert.equal(value.thread('thread:one').latest.context.tokens, 20);
  assert.equal(value.parcel('parcel:one').totalTokens, 1_320);
  const restored = runtime(file).projection();
  assert.deepEqual(restored.contextLifecycle.map(item => item.kind), ['COMPACTION', 'NEW_CONTEXT', 'RESUME']);
  assert.deepEqual(restored.contextLifecycle.map(item => item.cumulative.totalTokens), [1_100, 1_320, 1_320]);
});

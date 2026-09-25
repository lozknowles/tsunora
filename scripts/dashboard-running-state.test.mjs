import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const context = {window: {}};
vm.runInNewContext(fs.readFileSync(new URL('../assets/dashboard/dashboard-running-state.js', import.meta.url), 'utf8'), context);
const state = context.window.AgentControlRunningState;

test('only genuinely RUNNING state receives active animation semantics', () => {
  assert.equal(state.shouldPulse('RUNNING'), true);
  for (const status of ['SUCCEEDED', 'FAILED', 'BLOCKED', 'CANCELLED', 'PAUSED', 'WAITING', 'QUEUED']) assert.equal(state.terminalShouldPulse(status), false);
});

test('liveness distinguishes fresh, stale and waiting without inventing failure', () => {
  const now = Date.parse('2026-08-30T10:10:00Z');
  assert.deepEqual({...state.liveness('RUNNING', '2026-08-30T10:09:53Z', now)}, {active: true, stale: false, ageMs: 7000, label: 'updated 7s ago'});
  assert.deepEqual({...state.liveness('RUNNING', '2026-08-30T10:05:42Z', now)}, {active: true, stale: true, ageMs: 258000, label: 'no update for 4m 18s'});
  assert.equal(state.liveness('WAITING', '2026-08-30T10:09:59Z', now).active, false);
});

test('missing usage remains unknown while live usage and provider cost remain inspectable', () => {
  assert.deepEqual({...state.usage({freshInputTokens: null, cachedInputTokens: null, cacheWriteTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null, cost: null})}, {available: false, label: 'Usage reported on completion'});
  const live = state.usage({freshInputTokens: 120, cachedInputTokens: 80, cacheWriteTokens: 25, outputTokens: 20, reasoningTokens: 5, totalTokens: 245, cost: 0.004});
  assert.equal(live.available, true); assert.match(live.label, /fresh 120.*cache read 80.*cache write 25.*reasoning 5.*cost 0.004/);
  assert.equal(state.metric(null), 'Not reported'); assert.notEqual(state.metric(null), '0');
});

test('parcel roll-up distinguishes active, waiting and blocked chain positions', () => {
  const result = state.rollup([{name: 'A', status: 'SUCCEEDED'}, {name: 'B', status: 'RUNNING'}, {name: 'C', status: 'WAITING'}, {name: 'D', status: 'BLOCKED'}]);
  assert.equal(result.position, 2); assert.equal(result.total, 4); assert.equal(result.stages[1].active, true); assert.equal(result.stages[2].waiting, true); assert.equal(result.stages[3].blocked, true);
});

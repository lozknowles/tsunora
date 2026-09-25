import assert from 'node:assert/strict';
import test from 'node:test';
import {qualifyEdgeRuntime, usableEdgeTiers, type EdgeRuntimeMeasurement} from './edge-context-runtime.js';

const measurement = (tier: 'E2B' | 'E4B', overrides: Partial<EdgeRuntimeMeasurement> = {}): EdgeRuntimeMeasurement => ({tier, model: `gemma-${tier.toLowerCase()}`, quantisation: 'mobile-4bit', contextLimitTokens: 4096, runtime: 'edge-runtime', runtimeVersion: '1.0', prefillTokensPerSecond: 80, decodeTokensPerSecond: tier === 'E2B' ? 12 : 7, peakRamBytes: 3_000_000_000, batteryPercentBefore: 80, batteryPercentAfter: 78, thermalCelsiusBefore: 31, thermalCelsiusPeak: 38, connectionMethod: 'configured-secure-shell', maximumPracticalContextTokens: 4096, durationMs: 60000, completed: true, errors: [], observedAt: '2026-08-31T00:00:00.000Z', ...overrides});

test('missing local model/runtime remains NOT_AVAILABLE rather than configured by assumption', () => {
  const result = qualifyEdgeRuntime('E2B');
  assert.equal(result.state, 'NOT_AVAILABLE');
  assert.deepEqual(usableEdgeTiers([result]), []);
});

test('E2B qualification records runtime throughput memory battery thermal transport and practical context', () => {
  const result = qualifyEdgeRuntime('E2B', measurement('E2B'));
  assert.equal(result.state, 'QUALIFIED');
  assert.equal(result.measurement?.decodeTokensPerSecond, 12);
  assert.equal(result.measurement?.maximumPracticalContextTokens, 4096);
  assert.match(result.evidenceSha256, /^[a-f0-9]{64}$/);
});

test('E4B is usable only when its own measured throughput thermal battery and context policy pass', () => {
  const e2b = qualifyEdgeRuntime('E2B', measurement('E2B'));
  const slowE4b = qualifyEdgeRuntime('E4B', measurement('E4B', {decodeTokensPerSecond: 2}));
  assert.equal(slowE4b.state, 'IMPRactical');
  assert.deepEqual(usableEdgeTiers([e2b, slowE4b]), ['E2B']);
  assert.deepEqual(usableEdgeTiers([e2b, qualifyEdgeRuntime('E4B', measurement('E4B'))]), ['E2B', 'E4B']);
});

test('runtime errors and unsafe resource behaviour fail closed', () => {
  assert.equal(qualifyEdgeRuntime('E2B', measurement('E2B', {completed: false, errors: ['decode_failed']})).state, 'FAILED');
  const hot = qualifyEdgeRuntime('E2B', measurement('E2B', {thermalCelsiusPeak: 50, batteryPercentAfter: 60}));
  assert.equal(hot.state, 'IMPRactical');
  assert.ok(hot.reasons.some(reason => reason.startsWith('thermal_rise')));
  assert.ok(hot.reasons.some(reason => reason.startsWith('battery_drop')));
});

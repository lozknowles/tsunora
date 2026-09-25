import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveNativeObservationTimeoutMs} from './non-openai-cache-qualification.js';

test('native observation timeout defaults to the frozen task budget', () => {
  assert.equal(resolveNativeObservationTimeoutMs(180_000, undefined), 180_000);
});

test('native observation timeout permits only a bounded explicit extension', () => {
  assert.equal(resolveNativeObservationTimeoutMs(180_000, 720_000), 720_000);
  assert.throws(() => resolveNativeObservationTimeoutMs(180_000, 179_999), /native_observation_timeout_invalid/);
  assert.throws(() => resolveNativeObservationTimeoutMs(180_000, 1_800_001), /native_observation_timeout_invalid/);
  assert.throws(() => resolveNativeObservationTimeoutMs(180_000, 720_000.5), /native_observation_timeout_invalid/);
});

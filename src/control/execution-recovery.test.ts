import assert from 'node:assert/strict';
import test from 'node:test';
import {boundedRecoveryDelay, classifyExecutionFailure, recoveryDeadlineAllows} from './execution-recovery.js';

test('recovery classifies transport, enrolment, human authentication and permanent configuration separately', () => {
  assert.deepEqual(classifyExecutionFailure(new Error('provider_timeout')), {kind: 'transient-transport', retryable: true, humanActionRequired: false, safeReason: 'transient_transport_failure'});
  assert.deepEqual(classifyExecutionFailure(new Error('device enrollment expired')), {kind: 'expired-enrolment', retryable: true, humanActionRequired: false, safeReason: 'selected_profile_enrolment_expired'});
  assert.deepEqual(classifyExecutionFailure(new Error('codex_chatgpt_auth_required')), {kind: 'authentication-required', retryable: false, humanActionRequired: true, safeReason: 'authentication_required_for_selected_profile'});
  assert.deepEqual(classifyExecutionFailure(new Error('account profile missing')), {kind: 'permanent-configuration', retryable: false, humanActionRequired: false, safeReason: 'permanent_configuration_failure'});
});

test('recovery evidence never retains credential-bearing provider errors', () => {
  const disposition = classifyExecutionFailure(new Error('HTTP 401 bearer secret-token-value user@example.invalid'));
  assert.equal(disposition.safeReason, 'authentication_required_for_selected_profile');
  assert.doesNotMatch(JSON.stringify(disposition), /secret-token-value|user@example/);
});

test('recovery delays are exponentially bounded and obey an overall deadline', () => {
  assert.deepEqual([1, 2, 3, 4].map(attempt => boundedRecoveryDelay(attempt, 2, 2, 5)), [2_000, 4_000, 5_000, 5_000]);
  assert.equal(recoveryDeadlineAllows(new Date('2026-09-05T10:00:00Z'), '2026-09-05T10:00:05Z', 5_000), true);
  assert.equal(recoveryDeadlineAllows(new Date('2026-09-05T10:00:00Z'), '2026-09-05T10:00:05Z', 5_001), false);
  assert.throws(() => boundedRecoveryDelay(0, 1), /recovery_policy_invalid/);
});

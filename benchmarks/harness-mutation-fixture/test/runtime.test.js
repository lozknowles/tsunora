import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeCapabilities, hasAllCapabilities} from '../src/capabilities.js';
import {parseRuntimeConfig} from '../src/config.js';
import {transitionJob} from '../src/job-state.js';
import {authorizeTool} from '../src/policy.js';
import {normalizeUsage} from '../src/telemetry.js';
import {selectWorker} from '../src/scheduler.js';

test('capabilities are normalized and matched', () => {
  assert.deepEqual(normalizeCapabilities([' Device.NFC ', 'EXECUTION.TYPED']), ['device.nfc', 'execution.typed']);
  assert.equal(hasAllCapabilities(['device.nfc', 'execution.typed'], ['DEVICE.NFC']), true);
});

test('runtime configuration validates bounded values', () => {
  assert.equal(parseRuntimeConfig({maximumTurns: 3}).maximumTurns, 3);
  assert.throws(() => parseRuntimeConfig({maximumTurns: 0}), /maximum_turns_invalid/);
});

test('job transition requires the declared state machine', () => {
  assert.equal(transitionJob('CREATED', 'ROUTED'), 'ROUTED');
  assert.throws(() => transitionJob('SUCCEEDED', 'RUNNING'), /terminal_state_transition_denied/);
});

test('tool policy fences stale leases and unapproved risks', () => {
  const base = {owner: 'agent', toolId: 'repo.read', risk: 'read', grantedTools: ['repo.read'], approvedRisks: ['read'], leaseGeneration: 2, liveLeaseGeneration: 2, ownershipGeneration: 4, liveOwnershipGeneration: 4};
  assert.equal(authorizeTool(base).allowed, true);
  assert.equal(authorizeTool({...base, liveLeaseGeneration: 3}).reason, 'stale_lease_generation');
  assert.equal(authorizeTool({...base, risk: 'write'}).reason, 'risk_not_approved');
});

test('unknown usage remains null', () => {
  assert.deepEqual(normalizeUsage({}), {inputTokens: null, freshInputTokens: null, cachedInputTokens: null, outputTokens: null, monetaryCost: null});
});

test('scheduler selects the least-loaded capable online worker', () => {
  const selected = selectWorker([
    {id: 'offline', online: false, activeJobs: 0, capabilities: ['device.nfc']},
    {id: 'busy', online: true, activeJobs: 3, capabilities: ['device.nfc']},
    {id: 'ready', online: true, activeJobs: 1, capabilities: ['device.nfc', 'execution.typed']},
  ], ['device.nfc']);
  assert.equal(selected?.id, 'ready');
});

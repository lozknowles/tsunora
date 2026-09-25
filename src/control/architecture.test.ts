import assert from 'node:assert/strict';
import test from 'node:test';
import {assessConceptualIntegrity, type CapabilityProposal} from './architecture.js';

const dashboard: CapabilityProposal = {name: 'Web dashboard', domain: 'operator_interface', authoritativeComponent: 'AgentControlService', extendsAbstraction: 'Control command and projection contract', createsDuplicateState: false, createsSecondControlPath: false, throughControlBoundary: true, effects: {ownership: true, scheduler: true, takeover: true}, failureMode: 'fail closed to observer-only', verificationEvidence: ['API contract tests', 'authority invariant tests']};
test('conceptual integrity accepts an interface that delegates authority to the control boundary', () => assert.equal(assessConceptualIntegrity(dashboard).accepted, true));
test('conceptual integrity rejects browser-owned state and a second control path', () => {
  const result = assessConceptualIntegrity({...dashboard, authoritativeComponent: 'operator_interface', createsDuplicateState: true, createsSecondControlPath: true, throughControlBoundary: false});
  assert.equal(result.accepted, false);
  assert.ok(result.violations.includes('duplicate_authoritative_state_forbidden'));
  assert.ok(result.violations.includes('authority_effect_must_use_control_boundary'));
  assert.ok(result.violations.includes('operator_interface_cannot_own_authority'));
});
test('conceptual integrity rejects provider adapters that claim scheduler or ownership policy', () => {
  const result = assessConceptualIntegrity({...dashboard, domain: 'provider_model_adapter', authoritativeComponent: 'OrcaAdapter'});
  assert.ok(result.violations.includes('provider_adapter_cannot_own_policy'));
});

test('Job runtime extends the scheduler through the shared control boundary', () => {
  const result = assessConceptualIntegrity({name: 'Job catalog and runtime', domain: 'scheduling', authoritativeComponent: 'JobRuntime via AgentControlService', extendsAbstraction: 'WorkScheduler capability placement and persisted Agent Control state', createsDuplicateState: false, createsSecondControlPath: false, throughControlBoundary: true, effects: {scheduler: true}, failureMode: 'Run remains queued, waiting, degraded or disconnected with a durable reason', verificationEvidence: ['Job schema, runtime, API, takeover and full regression tests']});
  assert.equal(result.accepted, true);
});

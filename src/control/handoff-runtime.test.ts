import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {ContractExecutionRuntime} from './contract-runtime.js';
import {GovernedHandoffRuntime, type HandoffRequest, type HandoffTarget} from './handoff-runtime.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-handoff-')), processEvents: string[] = [], clock = () => '2026-09-01T21:00:00.000Z';
  const contracts = new ContractExecutionRuntime(path.join(root, 'contracts.json'), {cancel: async (id, reason) => { processEvents.push(`cancel:${id}:${reason}`); return {outcome: 'confirmed', detail: 'fixture_process_tree_absent'}; }, pause: async (id, reason) => { processEvents.push(`pause:${id}:${reason}`); }}, clock);
  contracts.create({id: 'contract:parent', laneId: 'lane:one', operatorActorId: 'human:operator', objective: 'Parent objective', completionCriteria: ['verified'], authority: ['repository.read', 'repository.write:bounded'], protectedResources: ['production'], budget: {remainingTokens: 20_000, remainingCost: 5, currency: 'USD'}, active: {actorId: 'agent:source', agentId: 'source-agent', modelId: 'model-a', providerId: 'provider-a', runtimeId: 'runtime-a', nodeId: 'node-a'}, baton: {task: 'parent'}, process: {id: 'process:source'}, ptyId: 'pty:source', permissions: {capabilities: ['repository.read', 'repository.write:bounded'], filesystem: 'write', network: 'none', production: false}});
  const handoffs = new GovernedHandoffRuntime(contracts, path.join(root, 'handoffs.json'), clock);
  return {root, contracts, handoffs, processEvents, clock};
}

const target: HandoffTarget = {active: {actorId: 'agent:target', agentId: 'target-agent', modelId: 'model-b', providerId: 'provider-b', runtimeId: 'runtime-b', nodeId: 'node-b'}, process: {id: 'process:target'}, ptyId: 'pty:target'};
function request(outcome: HandoffRequest['outcome'], changes: Partial<HandoffRequest> = {}): HandoffRequest { return {outcome, policy: 'AUTO', contractId: 'contract:parent', sourceActorId: 'agent:source', sourceAgentId: 'source-agent', reason: `${outcome.toLowerCase()} because bounded policy says so`, baton: {task: outcome.toLowerCase(), evidence: ['evidence:one']}, requestedAuthority: outcome === 'COMPLETE' ? [] : ['repository.read'], budget: {}, ...changes}; }

test('SACRIFICE stops the worker, surrenders PTY control and preserves the contract', async () => {
  const value = fixture(), record = await value.handoffs.request(request('SACRIFICE'));
  assert.equal(record.status, 'COMPLETED'); assert.equal(record.stateBefore, 'ACTIVE'); assert.equal(record.stateAfter, 'PAUSED'); assert.equal(value.contracts.get('contract:parent').process.state, 'EXITED'); assert.match(value.processEvents[0], /^cancel:process:source:sacrifice:/);
});

test('SUBSTITUTE replaces worker route and process while preserving parent contract identity', async () => {
  const value = fixture(), before = value.contracts.get('contract:parent'), record = await value.handoffs.request(request('SUBSTITUTE', {target})), after = value.contracts.get('contract:parent');
  assert.equal(record.status, 'COMPLETED'); assert.equal(after.id, before.id); assert.equal(after.objective, before.objective); assert.equal(after.active.agentId, 'target-agent'); assert.equal(after.process.id, 'process:target'); assert.equal(after.baton.generation, 2); assert.ok(after.handoffs.includes(record.id));
});

test('DELEGATE creates a bounded child with minimal baton and debits parent budget', async () => {
  const value = fixture(), record = await value.handoffs.request(request('DELEGATE', {target, child: {id: 'contract:child', objective: 'Bounded child objective', completionCriteria: ['child verified']}, requestedAuthority: ['repository.read'], budget: {tokens: 2_000, cost: 1, currency: 'USD'}}));
  const parent = value.contracts.get('contract:parent'), child = value.contracts.get('contract:child'); assert.equal(record.childContractId, child.id); assert.equal(child.parentContractId, parent.id); assert.deepEqual(child.authority, ['repository.read']);assert.deepEqual(child.protectedResources,parent.protectedResources);assert.ok(child.authority.every(item=>parent.authority.includes(item))); assert.equal(child.budget.remainingTokens, 2_000); assert.equal(parent.budget.remainingTokens, 18_000); assert.equal(parent.budget.remainingCost, 4); assert.equal(record.batonSha256, child.baton.sha256); assert.equal(record.batonSizeBytes, child.baton.sizeBytes);
});

test('YIELD pauses process and returns control without claiming completion', async () => {
  const value = fixture(), record = await value.handoffs.request(request('YIELD')); const contract = value.contracts.get('contract:parent'); assert.equal(record.stateAfter, 'PAUSED'); assert.equal(contract.process.state, 'PAUSED'); assert.equal(contract.verification.state, 'UNSUBMITTED'); assert.match(value.processEvents[0], /^pause:process:source:/);
});

test('COMPLETE submits evidence for independent verification instead of declaring success', async () => {
  const value = fixture(), record = await value.handoffs.request(request('COMPLETE', {evidence: [{id: 'evidence:tests', kind: 'test', reference: 'artifact:tests', createdAt: value.clock()}]})); const contract = value.contracts.get('contract:parent'); assert.equal(record.verificationOutcome, 'PENDING'); assert.equal(record.stateAfter, 'VERIFYING'); assert.equal(contract.verification.state, 'PENDING'); assert.notEqual(contract.state, 'VERIFIED');
});

test('AUTO executes inside authority and budget while risky or expanded requests require MANUAL approval', async () => {
  const safe = fixture(), automatic = await safe.handoffs.request(request('SUBSTITUTE', {target})); assert.equal(automatic.status, 'COMPLETED');
  const risky = fixture(), pending = await risky.handoffs.request(request('SUBSTITUTE', {target, requestedAuthority: ['repository.read', 'production.write'], risk: {productionWrite: true, costlyEscalation: true}}));
  assert.equal(pending.status, 'AWAITING_APPROVAL'); assert.deepEqual(pending.authorityTransferred, ['repository.read']); assert.deepEqual(pending.authorityWithheld, ['production.write']); assert.deepEqual(pending.approvalReasons.sort(), ['costly_escalation', 'privilege_increase', 'production_write']); assert.equal(risky.contracts.get('contract:parent').active.agentId, 'source-agent');
  await assert.rejects(risky.handoffs.approve(pending.id, 'agent:source'), /approval_not_authorized/); const approved = await risky.handoffs.approve(pending.id, 'human:operator'); assert.equal(approved.status, 'COMPLETED'); assert.equal(risky.contracts.get('contract:parent').active.agentId, 'target-agent');
});

test('handoff evidence is durable and contains complete transition accounting without credentials', async () => {
  const value = fixture(), record = await value.handoffs.request(request('SUBSTITUTE', {target, evidence: [{id: 'evidence:route', kind: 'qualification', reference: 'artifact:route', createdAt: value.clock()}]}));
  const reconstructed = new GovernedHandoffRuntime(new ContractExecutionRuntime(path.join(value.root, 'contracts.json')), path.join(value.root, 'handoffs.json'), value.clock).get(record.id);
  assert.equal(reconstructed.originatingActorId, 'agent:source'); assert.equal(reconstructed.receivingAgentId, 'target-agent'); assert.deepEqual(reconstructed.evidenceIds, ['evidence:route']); assert.equal(reconstructed.batonSha256.length, 64); assert.ok(reconstructed.batonSizeBytes > 0); assert.equal(reconstructed.stateBefore, 'ACTIVE'); assert.equal(reconstructed.stateAfter, 'ACTIVE');
  await assert.rejects(value.handoffs.request(request('SUBSTITUTE', {target, baton: {apiKey: 'forbidden'}})), /secret_material_forbidden/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {canonicalModelIdentity, IdentityControlPlane, legacyAttribution, selectExecutionFailClosed, type ExecutionProvenance} from './identity-control-plane.js';

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-identity-')), plane = new IdentityControlPlane(path.join(root, 'identity.json'));
  plane.registerActor({id: 'loz', type: 'human', displayName: 'Loz', principalId: 'human:loz', authenticationSource: 'operator-token', roles: ['operator'], capabilities: ['filesystem.read', 'secret.use:github-production'], metadata: {locale: 'en-GB'}});
  plane.registerActor({id: 'luna-actor', type: 'agent', displayName: 'Luna actor', principalId: 'agent:luna', authenticationSource: 'agent-control', roles: ['agent'], capabilities: ['filesystem.read'], metadata: {}});
  plane.registerActor({id: 'verifier-actor', type: 'agent', displayName: 'Verifier actor', principalId: 'agent:verifier', authenticationSource: 'agent-control', roles: ['agent'], capabilities: ['filesystem.read'], metadata: {}});
  plane.registerAgent({id: 'luna', actorId: 'luna-actor', displayName: 'Luna', purpose: 'Coordinator', capabilities: ['agent.delegate', 'model.invoke'], metadata: {}});
  plane.registerAgent({id: 'pixel-verifier', actorId: 'verifier-actor', displayName: 'Pixel verifier', purpose: 'Bounded local verification', capabilities: ['filesystem.read'], metadata: {}});
  const session = plane.createSession({id: 'session:qualification', creatorActorId: 'loz', mode: 'collaborative', permissions: {capabilities: ['session.observe', 'session.manage', 'parcel.create', 'parcel.execute', 'agent.delegate', 'model.invoke', 'node.execute', 'filesystem.read', 'secret.use:github-production'], allowedModels: ['glm-5.3-flash', 'local-verifier'], allowedNodes: ['controller', 'pixel'], allowedSecrets: ['github-production'], filesystem: 'read', network: 'provider-only'}, contextPolicy: 'hybrid'});
  plane.addParticipant(session.id, {actorId: 'luna-actor', capabilities: ['session.observe', 'agent.delegate', 'model.invoke', 'filesystem.read']}, 'loz');
  plane.addParticipant(session.id, {actorId: 'verifier-actor', capabilities: ['session.observe', 'filesystem.read']}, 'loz');
  return {root, plane, session};
}

test('session creator is immutable and participant joins are attributable', () => {
  const {plane, session} = setup();
  const changed = plane.updateSession(session.id, {mode: 'restricted', metadata: {reason: 'qualification'}}, 'loz');
  assert.equal(changed.creatorActorId, 'loz');
  assert.deepEqual(changed.participants.map(value => [value.actorId, value.joinedBy]), [['loz', 'loz'], ['luna-actor', 'loz'], ['verifier-actor', 'loz']]);
  assert.throws(() => plane.registerActor({id: 'loz', type: 'automation', displayName: 'Changed', principalId: 'different', authenticationSource: 'other', roles: [], capabilities: [], metadata: {}}), /actor_identity_immutable/);
});

test('human to agent and agent to agent delegation retain both identities and baton hash', () => {
  const {plane, session} = setup();
  const firstContext = plane.recordContextTransfer({id: 'context-transfer:first', sessionId: session.id, sourceActorId: 'loz', targetActorId: 'luna-actor', selected: [{id: 'task', content: 'Review the bounded evidence.', estimatedTokens: 8}], discarded: [{id: 'history', content: 'Unneeded conversation history.', estimatedTokens: 6, reason: 'not required'}], contextBudget: 32, selectionReason: 'Structured task only', receivingAgentId: 'luna', receivingModelId: 'glm-5.3-flash'});
  const first = plane.createDelegation({id: 'delegation:first', sessionId: session.id, sourceActorId: 'loz', targetActorId: 'luna-actor', targetAgentId: 'luna', requestedModel: 'glm-5.3-flash', contextTransferId: firstContext.id, permissionsGranted: ['agent.delegate', 'model.invoke', 'filesystem.read'], reason: 'Human requests governed analysis'});
  const secondContext = plane.recordContextTransfer({id: 'context-transfer:second', sessionId: session.id, delegationId: first.id, sourceActorId: 'luna-actor', targetActorId: 'verifier-actor', selected: [{id: 'baton', content: firstContext.transferredContextHash, estimatedTokens: 4}], contextBudget: 8, selectionReason: 'Transfer sealed baton hash', receivingAgentId: 'pixel-verifier', receivingModelId: 'local-verifier'});
  const second = plane.createDelegation({id: 'delegation:second', sessionId: session.id, parentDelegationId: first.id, sourceActorId: 'luna-actor', targetActorId: 'verifier-actor', sourceAgentId: 'luna', targetAgentId: 'pixel-verifier', requestedModel: 'local-verifier', contextTransferId: secondContext.id, permissionsGranted: ['filesystem.read'], reason: 'Verify bounded evidence locally'});
  assert.equal(first.sourceActorId, 'loz'); assert.equal(first.targetAgentId, 'luna'); assert.equal(second.sourceAgentId, 'luna'); assert.equal(second.targetAgentId, 'pixel-verifier');
  assert.equal(secondContext.selected[0].sha256.length, 64); assert.equal(secondContext.transferredContextHash.length, 64);
  assert.throws(() => plane.createDelegation({...second, id: 'delegation:escalation', permissionsGranted: ['filesystem.write'], resultEvidenceIds: []}), /delegation_authority_escalation/);
});

test('model, agent and runtime identities remain separate and multi-hop chain reconstructs', () => {
  const {plane, session} = setup();
  const root = execution({runId: 'run-root', actorId: 'loz', sessionId: session.id, agentId: 'luna', model: canonicalModelIdentity('GLM-5.3-Flash', 'openrouter', 'z-ai/glm-5.3-flash'), runtime: runtime('controller')});
  const child = execution({runId: 'run-child', parentRunId: root.runId, actorId: 'verifier-actor', sessionId: session.id, agentId: 'pixel-verifier', model: canonicalModelIdentity('local-verifier', 'local'), runtime: runtime('pixel')});
  plane.recordExecution(root); plane.recordExecution(child);
  const chain = plane.reconstruct(child.runId);
  assert.deepEqual(chain.map(value => value.agentId), ['luna', 'pixel-verifier']);
  assert.deepEqual(chain.map(value => value.model?.modelId), ['GLM-5.3-Flash', 'local-verifier']);
  assert.deepEqual(chain.map(value => value.runtime.nodeId), ['controller', 'pixel']);
});

test('session model node authority filesystem and network envelopes fail closed at execution recording', () => {
  const {plane, session} = setup(), valid = execution({runId: 'run-policy-valid', actorId: 'loz', sessionId: session.id, agentId: 'luna', model: canonicalModelIdentity('GLM-5.3-Flash', 'openrouter'), runtime: runtime('controller')});
  plane.recordExecution(valid);
  assert.throws(() => plane.recordExecution({...valid, id: 'execution:bad-model', runId: 'run-bad-model', model: canonicalModelIdentity('unapproved-model', 'provider')}), /session_model_denied/);
  assert.throws(() => plane.recordExecution({...valid, id: 'execution:bad-node', runId: 'run-bad-node', runtime: runtime('unapproved-node')}), /session_node_denied/);
  assert.throws(() => plane.recordExecution({...valid, id: 'execution:bad-authority', runId: 'run-bad-authority', authority: ['filesystem.write']}), /execution_authority_exceeds_participant/);
  assert.throws(() => plane.recordExecution({...valid, id: 'execution:bad-filesystem', runId: 'run-bad-filesystem', runtime: {...runtime('controller'), filesystemPolicy: 'workspace-write'}}), /session_filesystem_write_denied/);
  assert.throws(() => plane.recordExecution({...valid, id: 'execution:bad-network', runId: 'run-bad-network', runtime: {...runtime('controller'), networkPolicy: 'unrestricted'}}), /session_network_scope_denied/);
});

test('fail-closed execution never silently drops sandbox locality governed runner or required node', () => {
  const cloudShell = {id: 'cloud-shell', modelId: 'cloud', locality: 'remote' as const, nodeId: 'cloud', nodeAvailable: true, runner: 'shell' as const, sandbox: 'unavailable' as const};
  assert.throws(() => selectExecutionFailClosed({sandboxRequired: true}, [cloudShell]), /sandbox_required_unavailable/);
  assert.throws(() => selectExecutionFailClosed({localOnly: true}, [cloudShell]), /local_only_execution_unavailable/);
  assert.throws(() => selectExecutionFailClosed({governedRunnerRequired: true}, [cloudShell]), /governed_runner_unavailable/);
  assert.throws(() => selectExecutionFailClosed({requiredNodeId: 'pixel'}, [cloudShell]), /required_node_unavailable:pixel/);
});

test('only explicit policy fallback is selected and recorded', () => {
  const candidates = [{id: 'fallback', modelId: 'review-fallback', locality: 'remote' as const, nodeId: 'controller-2', nodeAvailable: true, runner: 'governed' as const, sandbox: 'enforced' as const}];
  assert.throws(() => selectExecutionFailClosed({requiredModelId: 'review-primary', requiredNodeId: 'controller-1'}, candidates), /required_node_unavailable/);
  const selected = selectExecutionFailClosed({requiredModelId: 'review-primary', requiredNodeId: 'controller-1', allowFallback: true, fallbackModelIds: ['review-fallback'], fallbackNodeIds: ['controller-2'], sandboxRequired: true, governedRunnerRequired: true}, candidates);
  assert.equal(selected.fallback, true); assert.match(selected.fallbackReason!, /explicit_policy_fallback/);
});

test('secret capability executes out of context and persists only an opaque receipt', async () => {
  const {plane, session} = setup(), literal = 'super-private-value-that-must-not-persist';
  const result = await plane.withSecret({secretRef: 'github-production', actorId: 'loz', sessionId: session.id, purpose: 'Create authenticated client'}, () => literal, secret => secret.length);
  assert.equal(result, literal.length); const serialized = JSON.stringify(plane.snapshot()); assert.doesNotMatch(serialized, new RegExp(literal)); assert.match(serialized, /secret\.use:github-production/);
  assert.throws(() => plane.recordContextTransfer({sessionId: session.id, sourceActorId: 'loz', targetActorId: 'luna-actor', selected: [{id: 'bad', content: 'Bearer abcdefghijklmnop', estimatedTokens: 5}], contextBudget: 10, selectionReason: 'bad'}), /protected_value_forbidden/);
});

test('historical attribution and Ox compatibility are deterministic without conflating model identity', () => {
  const createdAt = '2026-09-01T00:00:00.000Z';
  assert.deepEqual(legacyAttribution('old-operator', 'run-1', createdAt), legacyAttribution('old-operator', 'run-1', createdAt));
  const ox = canonicalModelIdentity('Ox', 'openrouter', 'z-ai/glm-5.3-flash'); assert.equal(ox.modelId, 'GLM-5.3-Flash'); assert.deepEqual(ox.historicalAliases, ['Ox']);
  assert.equal(canonicalModelIdentity('GLM-5.3-Flash', 'openrouter').historicalAliases, undefined);
});

test('cost aggregation covers the complete causal chain and cancellation reaches children first', async () => {
  const {plane, session} = setup();
  plane.recordExecution(execution({runId: 'run-root', actorId: 'loz', sessionId: session.id, agentId: 'luna', model: canonicalModelIdentity('glm-5.3-flash', 'provider'), runtime: runtime('controller'), inputTokens: 100, outputTokens: 10, cost: .01, status: 'RUNNING'}));
  plane.recordExecution(execution({runId: 'run-child', parentRunId: 'run-root', actorId: 'verifier-actor', sessionId: session.id, agentId: 'pixel-verifier', model: canonicalModelIdentity('local-verifier', 'local'), runtime: runtime('pixel'), inputTokens: 50, outputTokens: 5, cost: .002, status: 'RUNNING'}));
  const total = plane.aggregate('run-root'); assert.equal(total.inputTokens, 150); assert.equal(total.outputTokens, 15); assert.equal(total.cost, .012); assert.equal(total.byAgent.luna, .01); assert.equal(total.byModel['local-verifier'], .002);
  const cancelled: string[] = []; assert.deepEqual(await plane.cancelTree('run-root', id => { cancelled.push(id); }), ['run-child', 'run-root']); assert.deepEqual(cancelled, ['run-child', 'run-root']); assert.equal(plane.execution('run-child').status, 'CANCELLED');
});

function runtime(nodeId: string) { return {id: `runtime:${nodeId}`, nodeId, transport: nodeId === 'pixel' ? 'adb' : 'local', executionEnvironment: 'test', sandboxState: 'enforced' as const, networkPolicy: 'provider-only', filesystemPolicy: 'read-only'}; }
function execution(patch: Partial<ExecutionProvenance> & Pick<ExecutionProvenance, 'runId' | 'actorId' | 'sessionId' | 'agentId' | 'runtime'>): ExecutionProvenance { return {id: `execution:${patch.runId}`, parcelId: 'parcel-1', authority: ['filesystem.read'], tools: [], resources: [patch.runtime.nodeId], policyEvents: [], startedAt: '2026-09-01T00:00:00.000Z', completedAt: '2026-09-01T00:00:01.000Z', inputTokens: 10, outputTokens: 2, cost: .001, currency: 'USD', verifiedOutcome: true, evidenceIds: ['evidence-1'], status: 'SUCCEEDED', ...patch}; }

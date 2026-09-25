import assert from 'node:assert/strict';
import test from 'node:test';
import {AcpAgentControlAdapter, type AcpExecutionPort, type AcpJsonRpcRequest} from './acp-adapter.js';
import {IdentityControlPlane} from './identity-control-plane.js';

test('ACP adapter preserves external actor, governed session, Work Parcel and Run identity', async () => {
  const identities = new IdentityControlPlane(); identities.registerActor({id: 'external-operator', type: 'human', displayName: 'External operator', principalId: 'oidc:subject-1', authenticationSource: 'trusted-acp-host', roles: ['operator'], capabilities: [], metadata: {}});
  const submitted: Parameters<AcpExecutionPort['submit']>[0][] = [], cancelled: string[] = [], updates: unknown[] = [];
  const execution: AcpExecutionPort = {submit: async input => { submitted.push(input); return {parcelId: 'parcel-acp-1', runId: 'run-acp-1', status: 'SUCCEEDED', result: 'verified', evidenceIds: ['evidence-acp-1']}; }, cancel: input => { cancelled.push(input.parcelId); }};
  const adapter = new AcpAgentControlAdapter(identities, execution, 'external-operator', update => { updates.push(update); });
  const initialized = await adapter.handle(request(1, 'initialize', {})); assert.equal((initialized?.result as {protocolVersion: number}).protocolVersion, 1);
  const created = await adapter.handle(request(2, 'session/new', {cwd: '/workspace'})), sessionId = (created?.result as {sessionId: string}).sessionId;
  const prompted = await adapter.handle(request(3, 'session/prompt', {sessionId, prompt: [{type: 'text', text: 'Inspect bounded evidence'}]}));
  assert.equal(submitted[0].actorId, 'external-operator'); assert.equal(submitted[0].sessionId, sessionId); assert.equal(submitted[0].attribution.sessionId, sessionId); assert.equal((prompted?.result as {stopReason: string}).stopReason, 'end_turn');
  assert.equal(identities.session(sessionId).creatorActorId, 'external-operator'); assert.equal(updates.length, 4);
  const resumed = await adapter.handle(request(4, 'session/resume', {sessionId, cwd: '/workspace'})); assert.equal((resumed?.result as {sessionId: string}).sessionId, sessionId);
  await adapter.handle({jsonrpc: '2.0', method: 'session/cancel', params: {sessionId}}); assert.deepEqual(cancelled, ['parcel-acp-1']);
});

test('ACP cancellation targets a prompt request and session identity cannot be assumed', async () => {
  const identities = new IdentityControlPlane(); identities.registerActor({id: 'external-operator', type: 'human', displayName: 'External operator', principalId: 'oidc:subject-1', authenticationSource: 'trusted-acp-host', roles: ['operator'], capabilities: [], metadata: {}});
  const cancelled: string[] = [], adapter = new AcpAgentControlAdapter(identities, {submit: async () => ({parcelId: 'parcel-request', status: 'RUNNING'}), cancel: input => { cancelled.push(input.parcelId); }}, 'external-operator');
  const created = await adapter.handle(request(1, 'session/new', {cwd: '/workspace'})), sessionId = (created?.result as {sessionId: string}).sessionId;
  await adapter.handle(request(22, 'session/prompt', {sessionId, prompt: [{type: 'text', text: 'run'}]}));
  await adapter.handle({jsonrpc: '2.0', method: '$/cancel_request', params: {requestId: 22}}); assert.deepEqual(cancelled, ['parcel-request']);
  const missing = await adapter.handle(request(3, 'session/resume', {sessionId: 'acp:missing', cwd: '/workspace'})); assert.equal(missing?.error?.code, -32004);
});

function request(id: number, method: string, params: Record<string, unknown>): AcpJsonRpcRequest { return {jsonrpc: '2.0', id, method, params}; }

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {PROTOCOL_VERSION, client, methods, ndJsonStream, type PromptResponse, type SessionNotification} from '@agentclientprotocol/sdk';
import {createAcpRuntime} from './acp-runtime.js';
import {IdentityControlPlane} from './identity-control-plane.js';

function fixture(root: string, updates: SessionNotification[] = []) {
  const identities = new IdentityControlPlane(path.join(root, 'identity.json'));
  try { identities.actor('external-operator'); }
  catch { identities.registerActor({id: 'external-operator', type: 'human', displayName: 'External operator', principalId: 'test:external', authenticationSource: 'test', roles: ['operator'], capabilities: [], metadata: {}}); }
  const submitted: string[] = [], cancelled: string[] = [];
  const runtime = createAcpRuntime({
    identities,
    principalActorId: 'external-operator',
    sessionFile: path.join(root, 'acp-sessions.json'),
    execution: {
      submit: async input => { submitted.push(input.prompt); return {parcelId: `parcel-${submitted.length}`, runId: `run-${submitted.length}`, status: 'SUCCEEDED', result: 'verified', evidenceIds: [`evidence-${submitted.length}`]}; },
      cancel: input => { cancelled.push(input.parcelId); },
    },
  });
  const app = client({name: 'independent-official-sdk-client'}).onNotification(methods.client.session.update, context => { updates.push(context.params); });
  return {runtime, app, identities, submitted, cancelled};
}

async function withNdjsonClient<T>(runtime: ReturnType<typeof fixture>['runtime'], app: ReturnType<typeof client>, operation: Parameters<typeof app.connectWith<T>>[1]) {
  const clientToAgent = new TransformStream<Uint8Array, Uint8Array>(), agentToClient = new TransformStream<Uint8Array, Uint8Array>();
  const agentConnection = runtime.app.connect(ndJsonStream(agentToClient.writable, clientToAgent.readable));
  try { return await app.connectWith(ndJsonStream(clientToAgent.writable, agentToClient.readable), operation); }
  finally { agentConnection.close(); await agentConnection.closed; }
}

test('official ACP client interoperates over stable v1 NDJSON and receives ordered governed updates', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-acp-runtime-')), updates: SessionNotification[] = [], value = fixture(root, updates);
  const observed = await withNdjsonClient(value.runtime, value.app, async agent => {
    const initialized = await agent.request(methods.agent.initialize, {protocolVersion: PROTOCOL_VERSION, clientCapabilities: {}});
    const created = await agent.request(methods.agent.session.new, {cwd: '/workspace', mcpServers: []});
    const prompted = await agent.request(methods.agent.session.prompt, {sessionId: created.sessionId, prompt: [{type: 'text', text: 'Inspect bounded evidence'}]});
    const listed = await agent.request(methods.agent.session.list, {});
    return {initialized, created, prompted, listed};
  });
  assert.equal(observed.initialized.protocolVersion, 1);
  assert.equal(observed.initialized.agentInfo?.version, '3.6.0');
  assert.equal(observed.prompted.stopReason, 'end_turn');
  assert.equal(observed.listed.sessions[0].sessionId, observed.created.sessionId);
  assert.deepEqual(updates.map(item => item.update.sessionUpdate), ['plan', 'tool_call', 'tool_call_update', 'plan']);
  assert.deepEqual(value.submitted, ['Inspect bounded evidence']);
  assert.equal(value.identities.session(observed.created.sessionId).creatorActorId, 'external-operator');
});

test('durable ACP session resumes through a new runtime and close cancels governed work', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-acp-resume-')), first = fixture(root);
  const sessionId = await withNdjsonClient(first.runtime, first.app, async agent => (await agent.request(methods.agent.session.new, {cwd: '/workspace', mcpServers: []})).sessionId);
  const second = fixture(root);
  await withNdjsonClient(second.runtime, second.app, async agent => {
    const resumed = await agent.request(methods.agent.session.resume, {sessionId, cwd: '/workspace', mcpServers: []});
    assert.equal((resumed._meta as {agentControl: {governedSessionId: string}}).agentControl.governedSessionId, sessionId);
    await agent.request(methods.agent.session.prompt, {sessionId, prompt: [{type: 'text', text: 'resume safely'}]});
    await agent.request(methods.agent.session.close, {sessionId});
  });
  assert.deepEqual(second.cancelled, ['parcel-1']);
  assert.equal(second.identities.session(sessionId).status, 'CLOSED');
});

test('official ACP schema rejects unsupported session envelopes before governance work runs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-acp-negative-')), value = fixture(root);
  await withNdjsonClient(value.runtime, value.app, async agent => {
    await assert.rejects(agent.request(methods.agent.session.new, {cwd: '/workspace', mcpServers: [{name: 'unsupported', command: 'false', args: [], env: []}]}), /acp_mcp_servers_unsupported/);
  });
  assert.deepEqual(value.submitted, []);
});

test('agent-control acp keeps stdout protocol-clean and exits gracefully at stdio EOF', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-acp-cli-'));
  fs.writeFileSync(path.join(root, 'config.json'), `${JSON.stringify({schemaVersion: 1, resources: [], providers: [], services: [], lanes: []})}\n`, {mode: 0o600});
  const identities = new IdentityControlPlane(path.join(root, 'identity', 'control-plane.json'));
  identities.registerActor({id: 'external-operator', type: 'human', displayName: 'External operator', principalId: 'test:stdio', authenticationSource: 'test', roles: ['operator'], capabilities: [], metadata: {}});
  const input = [
    {jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: 1, clientCapabilities: {}}},
    {jsonrpc: '2.0', id: 2, method: 'session/new', params: {cwd: '/workspace', mcpServers: []}},
  ].map(value => JSON.stringify(value)).join('\n') + '\n';
  const result = spawnSync(process.execPath, ['scripts/agent-control.mjs', 'acp'], {cwd: path.resolve('.'), env: {...process.env, AGENT_CONTROL_STATE_DIR: root, AGENT_CONTROL_ACP_ACTOR_ID: 'external-operator'}, input, encoding: 'utf8', timeout: 10_000});
  assert.equal(result.status, 0, result.stderr);
  const messages = result.stdout.trim().split('\n').map(line => JSON.parse(line) as {id: number; result: Record<string, unknown>});
  assert.deepEqual(messages.map(message => message.id), [1, 2]);
  assert.equal(messages[0].result.protocolVersion, 1);
  assert.match(String(messages[1].result.sessionId), /^acp:/);
});

test('namespaced delivery IDs make replay durable and fail closed on mismatched content', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-acp-replay-')), first = fixture(root);
  const sessionId = await withNdjsonClient(first.runtime, first.app, async agent => {
    const created = await agent.request(methods.agent.session.new, {cwd: '/workspace', mcpServers: []});
    const request = {sessionId: created.sessionId, prompt: [{type: 'text' as const, text: 'idempotent work'}], _meta: {agentControl: {deliveryId: 'delivery-1'}}};
    const original = await agent.request(methods.agent.session.prompt, request) as PromptResponse, replay = await agent.request(methods.agent.session.prompt, request) as PromptResponse;
    assert.deepEqual(replay._meta, original._meta);
    return created.sessionId;
  });
  assert.deepEqual(first.submitted, ['idempotent work']);
  const second = fixture(root);
  await withNdjsonClient(second.runtime, second.app, async agent => {
    await agent.request(methods.agent.session.resume, {sessionId, cwd: '/workspace', mcpServers: []});
    await agent.request(methods.agent.session.prompt, {sessionId, prompt: [{type: 'text', text: 'idempotent work'}], _meta: {agentControl: {deliveryId: 'delivery-1'}}});
    await assert.rejects(agent.request(methods.agent.session.prompt, {sessionId, prompt: [{type: 'text', text: 'different work'}], _meta: {agentControl: {deliveryId: 'delivery-1'}}}), /acp_delivery_replay_mismatch/);
  });
  assert.deepEqual(second.submitted, []);
});

test('two concurrent ACP sessions retain distinct governed identity and work', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-acp-concurrent-')), value = fixture(root);
  await withNdjsonClient(value.runtime, value.app, async agent => {
    const [one, two] = await Promise.all([
      agent.request(methods.agent.session.new, {cwd: '/workspace/one', mcpServers: []}),
      agent.request(methods.agent.session.new, {cwd: '/workspace/two', mcpServers: []}),
    ]);
    assert.notEqual(one.sessionId, two.sessionId);
    await Promise.all([
      agent.request(methods.agent.session.prompt, {sessionId: one.sessionId, prompt: [{type: 'text', text: 'one'}]}),
      agent.request(methods.agent.session.prompt, {sessionId: two.sessionId, prompt: [{type: 'text', text: 'two'}]}),
    ]);
  });
  assert.deepEqual(value.submitted.sort(), ['one', 'two']);
});

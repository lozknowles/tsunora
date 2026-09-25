import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
import {PROTOCOL_VERSION, client, methods} from '@agentclientprotocol/sdk';
import {createHttpStream} from '@agentclientprotocol/sdk/experimental/http-client';
import {createWebSocketStream, type WebSocketConstructor} from '@agentclientprotocol/sdk/experimental/ws-client';
import {acpRemoteConfig, startAcpRemoteServer} from './acp-remote.js';
import {createAcpRuntime} from './acp-runtime.js';
import {IdentityControlPlane} from './identity-control-plane.js';

const {WebSocket} = createRequire(import.meta.url)('ws') as {WebSocket: WebSocketConstructor};
const token = 'fixture-token-with-at-least-24-characters';

function runtime() {
  const identities = new IdentityControlPlane();
  identities.registerActor({id: 'remote-operator', type: 'human', displayName: 'Remote operator', principalId: 'test:remote', authenticationSource: 'bearer', roles: ['operator'], capabilities: [], metadata: {}});
  const prompts: string[] = [];
  return {prompts, value: createAcpRuntime({identities, principalActorId: 'remote-operator', execution: {submit: async input => { prompts.push(input.prompt); return {parcelId: `parcel-${prompts.length}`, status: 'SUCCEEDED'}; }, cancel: () => undefined}})};
}

function config() { return {enabled: true, host: '127.0.0.1', port: 0, path: '/acp', token, allowedOrigins: []}; }

test('remote ACP configuration is explicit, credential-indirect and TLS-gated off loopback', () => {
  assert.throws(() => acpRemoteConfig({}), /acp_remote_disabled/);
  assert.throws(() => acpRemoteConfig({AGENT_CONTROL_ACP_REMOTE_ENABLED: 'true'}), /token_env_invalid/);
  assert.throws(() => acpRemoteConfig({AGENT_CONTROL_ACP_REMOTE_ENABLED: 'true', AGENT_CONTROL_ACP_REMOTE_TOKEN_ENV: 'ACP_TEST_TOKEN', ACP_TEST_TOKEN: token, AGENT_CONTROL_ACP_REMOTE_HOST: '0.0.0.0'}), /non_loopback_requires_tls/);
  const parsed = acpRemoteConfig({AGENT_CONTROL_ACP_REMOTE_ENABLED: 'true', AGENT_CONTROL_ACP_REMOTE_TOKEN_ENV: 'ACP_TEST_TOKEN', ACP_TEST_TOKEN: token, AGENT_CONTROL_ACP_REMOTE_PORT: '0'});
  assert.equal(parsed.token, token); assert.equal(parsed.host, '127.0.0.1'); assert.equal(parsed.port, 0);
});

test('HTTP transport rejects absent, wrong and disallowed-origin credentials before ACP parsing', async () => {
  const fixture = runtime(), server = await startAcpRemoteServer(fixture.value.app, config());
  try {
    const body = JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: 1, clientCapabilities: {}}});
    for (const headers of [{}, {Authorization: 'Bearer wrong-token'}, {Authorization: `Bearer ${token}`, Origin: 'https://untrusted.example'}] as Array<Record<string, string>>) {
      const response = await fetch(server.url, {method: 'POST', headers: {'Content-Type': 'application/json', ...headers}, body});
      assert.equal(response.status, 401);
    }
    assert.deepEqual(fixture.prompts, []);
  } finally { await server.close(); }
});

test('official SDK client interoperates with authenticated Streamable HTTP', async () => {
  const fixture = runtime(), server = await startAcpRemoteServer(fixture.value.app, config()), updates: string[] = [];
  try {
    const app = client({name: 'remote-http-client'}).onNotification(methods.client.session.update, context => { updates.push(context.params.update.sessionUpdate); });
    await app.connectWith(createHttpStream(server.url, {headers: {Authorization: `Bearer ${token}`}, cookies: 'omit'}), async agent => {
      const initialized = await agent.request(methods.agent.initialize, {protocolVersion: PROTOCOL_VERSION, clientCapabilities: {}});
      assert.equal(initialized.protocolVersion, 1);
      const created = await agent.request(methods.agent.session.new, {cwd: '/workspace', mcpServers: []});
      const result = await agent.request(methods.agent.session.prompt, {sessionId: created.sessionId, prompt: [{type: 'text', text: 'remote HTTP task'}]});
      assert.equal(result.stopReason, 'end_turn');
      await assert.rejects(agent.request('agent-control/not-a-method', {}), error => Boolean(error && typeof error === 'object' && 'code' in error && error.code === -32601));
    });
    assert.deepEqual(fixture.prompts, ['remote HTTP task']);
    assert.deepEqual(updates, ['plan', 'tool_call', 'tool_call_update', 'plan']);
  } finally { await server.close(); }
});

test('official SDK client interoperates with authenticated WebSocket transport', async () => {
  const fixture = runtime(), server = await startAcpRemoteServer(fixture.value.app, config());
  try {
    const stream = createWebSocketStream(server.url.replace(/^http/, 'ws'), {WebSocket, headers: {Authorization: `Bearer ${token}`}, cookies: 'omit'});
    await client({name: 'remote-websocket-client'}).connectWith(stream, async agent => {
      await agent.request(methods.agent.initialize, {protocolVersion: PROTOCOL_VERSION, clientCapabilities: {}});
      const created = await agent.request(methods.agent.session.new, {cwd: '/workspace', mcpServers: []});
      await agent.request(methods.agent.session.prompt, {sessionId: created.sessionId, prompt: [{type: 'text', text: 'remote WebSocket task'}]});
    });
    assert.deepEqual(fixture.prompts, ['remote WebSocket task']);
  } finally { await server.close(); }
});

test('independent raw HTTP wire harness negotiates stable v1 without importing the ACP client', async () => {
  const fixture = runtime(), server = await startAcpRemoteServer(fixture.value.app, config());
  try {
    const response = await fetch(server.url, {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}`}, body: JSON.stringify({jsonrpc: '2.0', id: 'raw-1', method: 'initialize', params: {protocolVersion: 999, clientCapabilities: {}}})});
    assert.equal(response.status, 200);
    const message = await response.json() as {id: string; result: {protocolVersion: number; agentInfo: {version: string}}};
    assert.equal(message.id, 'raw-1'); assert.equal(message.result.protocolVersion, 1); assert.equal(message.result.agentInfo.version, '3.6.0');
  } finally { await server.close(); }
});

test('remote wire rejects malformed JSON-RPC, invalid IDs and unknown methods structurally', async () => {
  const fixture = runtime(), server = await startAcpRemoteServer(fixture.value.app, config()), headers = {'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}`};
  try {
    const malformed = await fetch(server.url, {method: 'POST', headers, body: '{not-json'});
    assert.ok([400, 422].includes(malformed.status));
    const invalid = await fetch(server.url, {method: 'POST', headers, body: JSON.stringify({jsonrpc: '2.0', id: {unsafe: true}, method: 'initialize', params: {protocolVersion: 1, clientCapabilities: {}}})});
    assert.ok([400, 422].includes(invalid.status));
    const initialized = await fetch(server.url, {method: 'POST', headers, body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: 1, clientCapabilities: {}}})});
    const connectionId = initialized.headers.get('Acp-Connection-Id'); assert.ok(connectionId);
    const unknown = await fetch(server.url, {method: 'POST', headers: {...headers, 'Acp-Connection-Id': connectionId}, body: JSON.stringify({jsonrpc: '2.0', id: 9, method: 'agent-control/not-a-method', params: {}})});
    assert.equal(unknown.status, 202);
    assert.deepEqual(fixture.prompts, []);
  } finally { await server.close(); }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {ResponsesProviderFactory} from './responses-provider.js';

const provider = {id: 'openai-api', name: 'OpenAI API', kind: 'responses' as const, baseUrl: 'https://api.openai.com/v1', wireApi: 'responses' as const, requiresAuth: true, parallelism: 1, costClass: 'metered' as const, capabilities: ['structured-output', 'tool-request']};

test('Responses factory mediates an official function call and returns tool data', async () => {
  let endpoint = '', rawBody = '', authorization = '', invocations = 0;
  const factory = new ResponsesProviderFactory({
    provider, workerId: 'windows-worker', modelId: 'qualified-model', workerCapabilities: ['platform.windows'], modelCapabilities: ['structured-output', 'tool-request'], availableToolIds: ['qualification.return-data'], qualificationEvidence: ['live-response-proof'], health: 'healthy', authorization: () => 'test-token',
    fetch: async (input, init) => {
      endpoint = String(input); rawBody = String(init?.body); authorization = String(new Headers(init?.headers).get('authorization'));
      return new Response(JSON.stringify({id: 'resp_test', model: 'qualified-model', status: 'completed', output: [{type: 'function_call', name: 'agent_control_tool_0', arguments: '{"value":"safe"}', call_id: 'call_test'}], usage: {total_tokens: 31}}), {status: 200});
    },
  });
  const result = await factory.executor('Return safe data').execute({tools: [{id: 'qualification.return-data'}], resourceLimits: {}} as never, {assertActive: () => undefined, invoke: async (id, input) => { invocations++; assert.equal(id, 'qualification.return-data'); assert.deepEqual(input, {value: 'safe'}); return {marker: 'WINDOWS-OPENAI-OK'}; }});
  assert.equal(endpoint, 'https://api.openai.com/v1/responses');
  assert.equal(authorization, 'Bearer test-token');
  assert.match(rawBody, /"store":false/);
  assert.match(rawBody, /"tool_choice":"required"/);
  assert.equal(invocations, 1);
  assert.match(result.resultRef ?? '', /WINDOWS-OPENAI-OK/);
  assert.deepEqual(result.evidence?.slice(-1), ['tool_executed:qualification.return-data']);
  assert.equal(result.invocations?.[0].usage.totalProcessedTokens, 31);
  assert.equal(result.invocations?.[0].usage.freshInputTokens, null);
  assert.equal(result.invocations?.[0].harnessProfile, 'STANDARD');
});

test('Responses factory fails closed before any tool for missing auth or invalid output', async () => {
  const missingAuth = new ResponsesProviderFactory({provider, workerId: 'w', modelId: 'm', workerCapabilities: [], modelCapabilities: [], availableToolIds: ['x'], qualificationEvidence: ['proof'], health: 'healthy'});
  await assert.rejects(() => missingAuth.executor('test').execute({tools: [{id: 'x'}], resourceLimits: {}} as never, {assertActive: () => undefined, invoke: async () => 'unsafe'}), /authentication_required/);
  let invoked = false;
  const multiple = new ResponsesProviderFactory({provider, workerId: 'w', modelId: 'm', workerCapabilities: [], modelCapabilities: [], availableToolIds: ['x'], qualificationEvidence: ['proof'], health: 'healthy', authorization: () => 'token', fetch: async () => new Response(JSON.stringify({output: [{type: 'function_call', name: 'agent_control_tool_0', arguments: '{}'}, {type: 'function_call', name: 'agent_control_tool_0', arguments: '{}'}]}), {status: 200})});
  await assert.rejects(() => multiple.executor('test').execute({tools: [{id: 'x'}], resourceLimits: {}} as never, {assertActive: () => undefined, invoke: async () => { invoked = true; }}), /function_call_count:2/);
  assert.equal(invoked, false);
});

test('Responses factory requires an HTTPS Responses endpoint and qualification evidence', () => {
  assert.throws(() => new ResponsesProviderFactory({provider: {...provider, baseUrl: 'http://127.0.0.1/v1'}, workerId: 'w', modelId: 'm', workerCapabilities: [], modelCapabilities: [], availableToolIds: [], qualificationEvidence: ['proof'], health: 'healthy'}), /base_url_invalid/);
  assert.throws(() => new ResponsesProviderFactory({provider: {...provider, wireApi: undefined}, workerId: 'w', modelId: 'm', workerCapabilities: [], modelCapabilities: [], availableToolIds: [], qualificationEvidence: ['proof'], health: 'healthy'}), /endpoint_required/);
  assert.throws(() => new ResponsesProviderFactory({provider, workerId: 'w', modelId: 'm', workerCapabilities: [], modelCapabilities: [], availableToolIds: [], qualificationEvidence: [], health: 'healthy'}), /qualification_evidence_required/);
});

test('an approved Windows bridge may use loopback HTTP but no remote cleartext endpoint', () => {
  const bridge = {...provider, kind: 'browser-bridge' as const, baseUrl: 'http://127.0.0.1:19097/v1', requiresAuth: false};
  assert.equal(new ResponsesProviderFactory({provider: bridge, workerId: 'windows', modelId: 'chat-provider', workerCapabilities: ['platform.windows'], modelCapabilities: [], availableToolIds: [], qualificationEvidence: ['operator-qualified-bridge'], health: 'healthy'}).candidate().route.providerId, 'openai-api');
  assert.throws(() => new ResponsesProviderFactory({provider: {...bridge, baseUrl: 'http://example.test/v1'}, workerId: 'windows', modelId: 'chat-provider', workerCapabilities: [], modelCapabilities: [], availableToolIds: [], qualificationEvidence: ['proof'], health: 'healthy'}), /base_url_invalid/);
});

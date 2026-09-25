import assert from 'node:assert/strict';
import test from 'node:test';
import {StructuredChatProviderFactory} from './structured-chat-provider.js';

const provider = {id: 'local-qwen', name: 'Local Qwen', kind: 'local' as const, baseUrl: 'http://127.0.0.1:18081/v1', requiresAuth: false, parallelism: 1, costClass: 'free' as const, capabilities: ['structured-output', 'tool-request']};

test('structured chat factory creates a qualified candidate and mediates its JSON tool request', async () => {
  let endpoint = '', rawBody = '', invocations = 0;
  const factory = new StructuredChatProviderFactory({
    provider, workerId: 'worker-1', modelId: 'qwen-test', workerCapabilities: ['model.local'], modelCapabilities: ['structured-output'], availableToolIds: ['qualification.inspect'], qualificationEvidence: ['fixture-live-proof'], health: 'healthy',
    fetch: async (input, init) => {
      endpoint = String(input); rawBody = String(init?.body);
      return new Response(JSON.stringify({id: 'chatcmpl-test', model: 'qwen-test', choices: [{finish_reason: 'stop', message: {content: '{"tool":"qualification.inspect","input":{"target":"fixture"}}'}}], usage: {total_tokens: 42}}), {status: 200, headers: {'content-type': 'application/json'}});
    },
  });
  const candidate = factory.candidate();
  assert.equal(candidate.route.qualified, true);
  assert.match(candidate.route.qualificationReason, /fixture-live-proof/);
  const result = await factory.executor('Inspect the safe fixture').execute({tools: [{id: 'qualification.inspect'}], resourceLimits: {}} as never, {assertActive: () => undefined, invoke: async (id, input) => { invocations++; assert.equal(id, 'qualification.inspect'); assert.deepEqual(input, {target: 'fixture'}); return {marker: 'SAFE'}; }});
  assert.equal(endpoint, 'http://127.0.0.1:18081/v1/chat/completions');
  assert.match(rawBody, /Do not claim the tool ran/);
  assert.equal(invocations, 1);
  assert.deepEqual(result.evidence?.slice(-1), ['tool_executed:qualification.inspect']);
  assert.match(result.resultRef ?? '', /SAFE/);
  assert.equal(result.invocations?.[0].usage.totalProcessedTokens, 42);
  assert.equal(result.invocations?.[0].provider, 'local-qwen');
});

test('structured chat telemetry attributes an explicitly supplied context packet without changing dispatch', async () => {
  const factory = new StructuredChatProviderFactory({
    provider, workerId: 'worker-1', modelId: 'qwen-test', workerCapabilities: [], modelCapabilities: [], availableToolIds: ['qualification.inspect'], qualificationEvidence: ['fixture-live-proof'], health: 'healthy',
    fetch: async () => new Response(JSON.stringify({choices: [{message: {content: '{"tool":"qualification.inspect","input":{}}'}}], usage: {prompt_tokens: 120, prompt_tokens_details: {cached_tokens: 20}, completion_tokens: 8, total_tokens: 128}}), {status: 200}),
  });
  const contextSources = [
    {id: 'packet-memory', kind: 'memory_shared_context' as const, content: 'verified historical evidence', persistent: true, relevance: 1, provenanceIds: ['evidence:memory']},
    {id: 'packet-task', kind: 'task_context' as const, content: 'bounded task', required: true, persistent: false, relevance: 1, provenanceIds: ['evidence:task']},
  ];
  const result = await factory.executor('rendered packet', contextSources).execute({tools: [{id: 'qualification.inspect'}], resourceLimits: {}} as never, {assertActive: () => undefined, invoke: async () => 'SAFE'});
  const observation = result.invocations?.[0];
  assert.equal(observation?.usage.freshInputTokens, 100);
  assert.equal(observation?.usage.cachedInputTokens, 20);
  assert.ok((observation?.startup.components.find(component => component.name === 'memory_shared_context')?.estimatedTokens ?? 0) > 0);
  assert.ok(observation?.startup.taskContextTokens);
});

test('structured chat executor rejects malformed or expanded model output before the gateway', async () => {
  let invocations = 0;
  const factory = new StructuredChatProviderFactory({provider, workerId: 'worker-1', modelId: 'qwen-test', workerCapabilities: [], modelCapabilities: [], availableToolIds: ['qualification.inspect'], qualificationEvidence: ['fixture-live-proof'], health: 'healthy', fetch: async () => new Response(JSON.stringify({choices: [{message: {content: '{"tool":"qualification.inspect","input":{},"grant":"more"}'}}]}), {status: 200})});
  await assert.rejects(() => factory.executor('test').execute({tools: [], resourceLimits: {}} as never, {assertActive: () => undefined, invoke: async () => { invocations++; }}), /provider_tool_request_unknown_field/);
  assert.equal(invocations, 0);
});

test('structured chat executor accepts one isolated JSON code fence but no surrounding prose', async () => {
  const factory = new StructuredChatProviderFactory({provider, workerId: 'worker-1', modelId: 'qwen-test', workerCapabilities: [], modelCapabilities: [], availableToolIds: ['qualification.inspect'], qualificationEvidence: ['fixture-live-proof'], health: 'healthy', fetch: async () => new Response(JSON.stringify({choices: [{message: {content: '```json\n{"tool":"qualification.inspect","input":{"target":"fixture"}}\n```'}}]}), {status: 200})});
  const result = await factory.executor('test').execute({tools: [], resourceLimits: {}} as never, {assertActive: () => undefined, invoke: async () => 'SAFE'});
  assert.match(result.resultRef ?? '', /SAFE/);
  const prose = new StructuredChatProviderFactory({provider, workerId: 'worker-1', modelId: 'qwen-test', workerCapabilities: [], modelCapabilities: [], availableToolIds: ['qualification.inspect'], qualificationEvidence: ['fixture-live-proof'], health: 'healthy', fetch: async () => new Response(JSON.stringify({choices: [{message: {content: 'Here is JSON: ```json\n{"tool":"qualification.inspect"}\n```'}}]}), {status: 200})});
  await assert.rejects(() => prose.executor('test').execute({tools: [], resourceLimits: {}} as never, {assertActive: () => undefined, invoke: async () => 'unsafe'}), /invalid_json/);
});

test('structured chat factory refuses credentialed URLs and unqualified candidates', () => {
  assert.throws(() => new StructuredChatProviderFactory({provider: {...provider, baseUrl: 'https://user:secret@example.test/v1'}, workerId: 'w', modelId: 'm', workerCapabilities: [], modelCapabilities: [], availableToolIds: [], qualificationEvidence: ['proof'], health: 'healthy'}), /base_url_invalid/);
  assert.throws(() => new StructuredChatProviderFactory({provider, workerId: 'w', modelId: 'm', workerCapabilities: [], modelCapabilities: [], availableToolIds: [], qualificationEvidence: [], health: 'healthy'}), /qualification_evidence_required/);
});

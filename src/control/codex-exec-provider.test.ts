import assert from 'node:assert/strict';
import test from 'node:test';
import {AdaptiveHarness, SkillCatalog, ToolPolicy, type RecipeRequest} from './adaptive-harness.js';
import {CODEX_0153_CONTEXT_CAPABILITIES, CodexExecProviderFactory, codexExecutionSessionOutputLine, codexReadOnlyStructuredArguments, normalizeCodex0153TelemetryEvent, runCodexWithRegisteredModel} from './codex-exec-provider.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {HarnessDispatcher, ToolHandlerRegistry} from './harness-dispatch.js';

const provider = {id: 'codex-chatgpt', name: 'Codex with ChatGPT plan', kind: 'cli' as const, requiresAuth: true, parallelism: 1, costClass: 'included' as const, capabilities: ['structured-output', 'tool-request']};

function factory(overrides: Partial<ConstructorParameters<typeof CodexExecProviderFactory>[0]> = {}) {
  return new CodexExecProviderFactory({provider, workerId: 'windows-worker', modelId: 'qualified-codex-model', cwd: process.cwd(), workerCapabilities: ['platform.windows'], modelCapabilities: ['structured-output', 'tool-request'], availableToolIds: ['qualification.return-data'], qualificationEvidence: ['official-codex-exec-contract'], health: 'healthy', authProbe: async () => ({mode: 'chatgpt'}), runner: async request => ({threadId: 'thr_fixture', finalMessage: JSON.stringify({tool: request.grantedToolIds[0], input_json: JSON.stringify({value: 'safe'})}), usage: {input_tokens: 10, output_tokens: 5}, observedItemTypes: ['agent_message']}), ...overrides});
}

test('Codex ChatGPT-plan factory returns data only through the ToolPolicy gateway', async () => {
  let invocations = 0;
  const result = await factory().executor('Return safe data').execute({tools: [{id: 'qualification.return-data'}], resourceLimits: {}} as never, {assertActive: () => undefined, invoke: async (id, input) => { invocations++; assert.equal(id, 'qualification.return-data'); assert.deepEqual(input, {value: 'safe'}); return {marker: 'CODEX-CHATGPT-OK'}; }});
  assert.equal(invocations, 1);
  assert.match(result.resultRef ?? '', /CODEX-CHATGPT-OK/);
  assert.ok(result.evidence?.includes('auth_mode:chatgpt'));
  assert.ok(result.evidence?.includes('capability_envelope:read-only'));
  assert.equal(result.invocations?.[0].usage.inputTokens, 10);
  assert.equal(result.invocations?.[0].usage.freshInputTokens, null);
  assert.deepEqual(factory().candidate().runtime, {sandbox: 'read-only', ephemeral: true});
});

test('Codex usage retains nested cache and reasoning details for normalisation', async () => {
  const result = await factory({runner: async request => ({threadId: 'thr_nested', finalMessage: JSON.stringify({tool: request.grantedToolIds[0], input_json: '{}'}), usage: {input_tokens: 100, input_tokens_details: {cached_tokens: 70, cache_write_tokens: 10}, output_tokens: 20, output_tokens_details: {reasoning_tokens: 8}, total_tokens: 120}, observedItemTypes: ['agent_message']})}).executor('Return safe data').execute({tools: [{id: 'qualification.return-data'}], resourceLimits: {}} as never, {assertActive: () => undefined, invoke: async () => ({marker: 'SAFE'})});
  assert.equal(result.invocations?.[0].usage.freshInputTokens, 20);
  assert.equal(result.invocations?.[0].usage.cachedInputTokens, 70);
  assert.equal(result.invocations?.[0].usage.cacheWriteTokens, 10);
  assert.equal(result.invocations?.[0].usage.reasoningTokens, 8);
});

test('Codex adapter forwards cache-aware JSONL telemetry and marks current context unavailable', async () => {
  const samples: Array<{threadId:string; fresh:number|null; cached:number|null; total:number|null; authority:string; active:boolean|undefined}> = [];
  const result = await factory({telemetry: sample => samples.push({threadId: sample.threadId, fresh: sample.cumulative.freshInputTokens ?? null, cached: sample.cumulative.cachedInputTokens ?? null, total: sample.cumulative.totalTokens ?? null, authority: sample.context?.authority ?? 'missing', active: sample.active}), runner: async request => { request.onTelemetry?.({type: 'thread.started', threadId: 'thr_live', elapsedMs: 1, context: {tokens: null, authority: 'unavailable', source: 'fixture'}}); request.onTelemetry?.({type: 'turn.completed', threadId: 'thr_live', elapsedMs: 2, usage: {input_tokens: 40, cached_input_tokens: 30, output_tokens: 10, total_tokens: 50}, context: {tokens: null, authority: 'unavailable', source: 'fixture'}}); return {threadId: 'thr_live', finalMessage: JSON.stringify({tool: request.grantedToolIds[0], input_json: '{}'}), usage: {input_tokens: 40, cached_input_tokens: 30, output_tokens: 10, total_tokens: 50}, observedItemTypes: ['agent_message']}; }}).executor('Return safe data').execute({taskId: 'parcel:one', tools: [{id: 'qualification.return-data'}], resourceLimits: {}} as never, {assertActive: () => undefined, invoke: async () => ({marker: 'SAFE'})});
  assert.ok(result.resultRef); assert.deepEqual(samples, [{threadId: 'thr_live', fresh: null, cached: null, total: null, authority: 'unavailable', active: true}, {threadId: 'thr_live', fresh: 10, cached: 30, total: 50, authority: 'unavailable', active: false}]);
});

test('schema-constrained Codex arguments isolate account auth from mutable config and native execution tools', () => {
  const isolated = codexReadOnlyStructuredArguments({modelId: 'gpt-example', loadUserConfig: false}, '/tmp/schema.json', 'stable prompt');
  for (const value of ['--ephemeral','--strict-config','--skip-git-repo-check','--ignore-user-config','--ignore-rules','project_doc_max_bytes=0','web_search="disabled"','features.shell_tool=false','features.unified_exec=false','features.multi_agent=false','features.browser_use=false','features.computer_use=false','features.in_app_browser=false','features.apps=false','features.image_generation=false','features.workspace_dependencies=false']) assert.ok(isolated.includes(value));
  assert.deepEqual(isolated.slice(-5), ['--model','gpt-example','--output-schema','/tmp/schema.json','stable prompt']);
  const registered = codexReadOnlyStructuredArguments({modelId: 'vendor/model', loadUserConfig: true}, '/tmp/schema.json', 'stable prompt');
  assert.equal(registered.includes('--ignore-user-config'), false);
  assert.ok(registered.includes('features.shell_tool=false'));
});

test('Codex 0.153 native app-server usage and compaction normalize behind the provider adapter', () => {
  const usage = normalizeCodex0153TelemetryEvent({method: 'thread/tokenUsage/updated', params: {threadId: 'thr-153', tokenUsage: {total: {inputTokens: 1000, outputTokens: 100, totalTokens: 1100}, last: {inputTokens: 200, outputTokens: 20, totalTokens: 220}, modelContextWindow: 1000}}}, 25);
  assert.equal(usage?.type, 'thread.token_usage.updated');
  assert.deepEqual(usage?.usage, {input_tokens: 1000, output_tokens: 100, total_tokens: 1100, cached_input_tokens: null, cache_write_tokens: null, reasoning_output_tokens: null});
  assert.deepEqual(usage?.context, {tokens: 220, limitTokens: 1000, authority: 'estimated', source: 'codex_app_server_thread_usage_mixed_provider_or_recomputed'});
  const compact = normalizeCodex0153TelemetryEvent({method: 'item/completed', params: {threadId: 'thr-153', item: {type: 'contextCompaction', id: 'compact-1'}}}, 30);
  assert.deepEqual(compact?.contextLifecycle, {kind: 'COMPACTION', contextId: 'compact-1', authority: 'authoritative', source: 'codex_app_server_contextCompaction'});
  assert.equal(CODEX_0153_CONTEXT_CAPABILITIES.nativeNewContext, 'eligible-chatgpt-codex-sessions-excluding-temporary-structured');
  assert.equal(CODEX_0153_CONTEXT_CAPABILITIES.agentControlExecNativeContextManagement, false);
});

test('Codex live-session projection exposes real public events without private reasoning', () => {
  assert.equal(codexExecutionSessionOutputLine('stdout', JSON.stringify({type: 'thread.started', thread_id: 'thread-real'})), 'Codex thread started · thread-real');
  assert.equal(codexExecutionSessionOutputLine('stdout', JSON.stringify({type: 'item.completed', item: {type: 'reasoning', text: 'private-analysis-must-not-appear'}})), 'Codex reasoning completed · private content withheld');
  assert.equal(codexExecutionSessionOutputLine('stdout', JSON.stringify({type: 'item.completed', item: {type: 'agent_message', text: 'Public governed result'}})), 'Codex agent output:\nPublic governed result');
  assert.equal(codexExecutionSessionOutputLine('stdout', JSON.stringify({type: 'turn.completed', usage: {input_tokens: 12, output_tokens: 3, account: 'forbidden'}})), 'Codex turn completed · usage {"input_tokens":12,"output_tokens":3}');
  assert.equal(codexExecutionSessionOutputLine('stderr', 'authorization=secret-value'), 'Codex diagnostic: authorization=[REDACTED]');
});

test('Codex fallback fails closed for missing ChatGPT auth and opaque file changes', async () => {
  let invoked = false;
  const noAuth = factory({authProbe: async () => { throw new Error('codex_chatgpt_auth_required'); }});
  await assert.rejects(() => noAuth.executor('test').execute({tools: [{id: 'qualification.return-data'}], resourceLimits: {}} as never, {assertActive: () => undefined, invoke: async () => { invoked = true; }}), /chatgpt_auth_required/);
  const fileChange = factory({runner: async () => ({finalMessage: '{"tool":"qualification.return-data","input_json":"{}"}', observedItemTypes: ['file_change']})});
  await assert.rejects(() => fileChange.executor('test').execute({tools: [{id: 'qualification.return-data'}], resourceLimits: {}} as never, {assertActive: () => undefined, invoke: async () => { invoked = true; }}), /capability_envelope_violation/);
  assert.equal(invoked, false);
});

test('an ungranted Codex return request is passed to the gateway and denied there', async () => {
  const ungranted = factory({runner: async () => ({finalMessage: '{"tool":"not.granted","input_json":"{}"}', observedItemTypes: ['agent_message']})});
  await assert.rejects(() => ungranted.executor('test').execute({tools: [{id: 'qualification.return-data'}], resourceLimits: {}} as never, {assertActive: () => undefined, invoke: async id => { throw new Error(`tool_policy_denied:tool_not_granted:${id}`); }}), /tool_policy_denied:tool_not_granted:not.granted/);
});

test('Codex ChatGPT-plan execution is fenced by live Agent Control ownership', async () => {
  const authority = {laneId: 'lane-codex', leaseGeneration: 2, ownershipGeneration: 4, owner: 'agent' as const};
  let live: RecipeRequest['authority'] = {...authority};
  let handlerCalls = 0;
  const policy = new ToolPolicy([{id: 'qualification.return-data', risk: 'read', capabilities: ['structured-output']}]);
  const tools = new ToolHandlerRegistry().register('qualification.return-data', async () => ++handlerCalls);
  const dispatcher = new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(), policy), policy, tools, () => ({authority: {...live}, workerId: 'windows-worker', availableToolIds: ['qualification.return-data'], approvedRisks: ['read']}));
  const codex = factory();
  const request: RecipeRequest = {taskId: 'codex-plan-task', taskType: 'qualification', requiredCapabilities: ['structured-output', 'tool-request'], requiredTools: ['qualification.return-data'], approvedRisks: ['read'], intent: 'NORMAL', inputTokens: 16, outputTokens: 16, context: {tier: 1, sourceIds: [], evidenceIds: [], estimatedTokens: 8}, authority, verification: {requiredEvidence: ['returned-data'], requireIndependentCheck: true}, escalation: {minimumConfidence: .7, maximumAttempts: 1, onFailure: 'review'}};
  live = {...live, ownershipGeneration: 5, owner: 'human'};
  await assert.rejects(() => dispatcher.dispatch({request, candidates: [codex.candidate()], placement: {workerId: 'windows-worker', reason: 'selected by scheduler'}}, codex.executor('return data')), /tool_policy_denied:human_owns_execution/);
  assert.equal(handlerCalls, 0);
});

test('registered external model runs with an isolated Codex provider config', async () => {
  const secret = 'external-secret-not-persisted'; let observed = false;
  const result = await runCodexWithRegisteredModel(
    {command: 'codex', cwd: process.cwd(), modelId: 'ignored', instruction: 'test', grantedToolIds: ['qualification.return-data'], timeoutMs: 1_000},
    {id: 'external', kind: 'openai-compatible', baseUrl: 'https://models.example/v1', wireApi: 'responses', auth: {type: 'bearer-env', env: 'EXTERNAL_TEST_KEY'}},
    {id: 'fast', provider: 'external', providerModel: 'vendor/fast', capabilities: ['coding']},
    {EXTERNAL_TEST_KEY: secret},
    async request => { observed = true; assert.equal(request.modelId, 'vendor/fast'); assert.equal(request.loadUserConfig, true); const config = fs.readFileSync(`${request.environment?.CODEX_HOME}/config.toml`, 'utf8'); assert.match(config, /model_provider = "agent_control_external"/); assert.match(config, /wire_api = "responses"/); assert.equal(config.includes(secret), false); return {finalMessage: 'ok', observedItemTypes: ['agent_message']}; },
  );
  assert.equal(observed, true); assert.equal(result.finalMessage, 'ok');
});

test('two Codex account profiles keep independent CODEX_HOME contexts and never emit credentials', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-codex-accounts-'));
  const proHome = path.join(root, 'pro'), plusHome = path.join(root, 'plus');
  fs.mkdirSync(proHome); fs.mkdirSync(plusHome);
  const proSecret = 'sk-pro-account-secret-123456789', plusSecret = 'sk-plus-account-secret-987654321';
  fs.writeFileSync(path.join(proHome, 'auth.json'), JSON.stringify({access_token: proSecret}));
  fs.writeFileSync(path.join(plusHome, 'auth.json'), JSON.stringify({access_token: plusSecret}));
  const profiles = [
    {id: 'lawrence-pro', label: 'Lawrence Pro', plan: 'ChatGPT Pro', credentialStore: {type: 'codex-home-env' as const, env: 'CODEX_HOME_LAWRENCE_PRO'}},
    {id: 'cottage-plus', label: 'Cottage Plus', plan: 'ChatGPT Plus', credentialStore: {type: 'codex-home-env' as const, env: 'CODEX_HOME_COTTAGE_PLUS'}},
  ];
  const accountProvider = {...provider, accountProfiles: profiles};
  const environment = {CODEX_HOME: '/global-must-remain-untouched', CODEX_HOME_LAWRENCE_PRO: proHome, CODEX_HOME_COTTAGE_PLUS: plusHome};
  const observed: string[] = [];
  try {
    for (const accountProfile of profiles) {
      const expectedHome = accountProfile.id === 'lawrence-pro' ? proHome : plusHome;
      const result = await factory({provider: accountProvider, accountProfile, environment, authProbe: async (_command, _cwd, _timeout, childEnvironment) => { assert.equal(childEnvironment?.CODEX_HOME, expectedHome); return {mode: 'chatgpt'}; }, runner: async request => { assert.equal(request.environment?.CODEX_HOME, expectedHome); observed.push(String(request.environment?.CODEX_HOME)); return {threadId: `thread-${accountProfile.id}`, finalMessage: JSON.stringify({tool: request.grantedToolIds[0], input_json: '{}'}), usage: {input_tokens: 1, output_tokens: 1}, observedItemTypes: ['agent_message']}; }}).executor('Return safe data').execute({tools: [{id: 'qualification.return-data'}], resourceLimits: {}} as never, {assertActive: () => undefined, invoke: async () => ({safe: true})});
      assert.equal(result.invocations?.[0].accountProfileId, accountProfile.id);
      const publicEvidence = JSON.stringify(result);
      assert.equal(publicEvidence.includes(proSecret), false); assert.equal(publicEvidence.includes(plusSecret), false); assert.equal(publicEvidence.includes(root), false);
    }
    assert.deepEqual(observed, [proHome, plusHome]);
    assert.equal(environment.CODEX_HOME, '/global-must-remain-untouched');
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

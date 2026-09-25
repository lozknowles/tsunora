import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {CapabilityIntelligenceStore} from './capability-intelligence.js';
import type {CodexNodeExecutionPort} from './codex-node-execution.js';
import {ProviderNeutralModelEvaluationExecutor} from './model-evaluation-runtime.js';
import {freezeQualificationSuite, loadFrozenQualificationSuite, type ModelCandidateIdentity} from './model-intelligence.js';
import {ModelRegistry} from './model-registry.js';

const sourceSuite = () => loadFrozenQualificationSuite(path.resolve('config/qualification-suite-v1.json'));
const oneTaskSuite = (taskId: string) => { const source = sourceSuite(), task = source.tasks.find(item => item.id === taskId)!; return freezeQualificationSuite({id: `test-${taskId}`, version: '1.0.0', createdAt: '2026-09-05T00:00:00Z', tasks: [{...task, repetitions: 1}]}); };
const unusedNodePort: CodexNodeExecutionPort = {accountStatus: async () => { throw new Error('unexpected_account_status'); }, execReadOnlyStructured: async () => { throw new Error('unexpected_cli_execution'); }};

test('an untested exact model can run only through the qualification purpose and earns verified capability evidence after passing', async () => {
  const suite = oneTaskSuite('coding-v1'), task = suite.tasks[0], capabilities = new CapabilityIntelligenceStore();
  const providers = [{id: 'api', kind: 'openai-compatible' as const, baseUrl: 'https://provider.example/v1', wireApi: 'responses' as const, auth: {type: 'none' as const}, enabled: true}];
  const models = [{id: 'candidate', provider: 'api', providerModel: 'vendor/candidate', enabled: true, capabilities: ['code.modify'], nodes: ['controller'], qualification: {state: 'UNTESTED' as const}, pricing: {currency: 'USD', inputPerMillionTokens: 10, cachedInputPerMillionTokens: 2, outputPerMillionTokens: 20, effectiveFrom: '2026-09-01', source: 'test-price'}}];
  const registry = new ModelRegistry(providers, models, {roles: {}}, undefined, undefined, {}, capabilities);
  assert.throws(() => registry.route({model: 'candidate', nodeId: 'controller', requiredCapabilities: ['code.modify'], allowFallback: false}), /model_route_unavailable/);
  assert.equal(registry.route({model: 'candidate', nodeId: 'controller', requiredCapabilities: ['code.modify'], allowFallback: false, purpose: 'QUALIFICATION'}).modelId, 'candidate');
  let requestBody: Record<string, unknown> | undefined;
  const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({model: 'vendor/candidate', status: 'completed', output_text: JSON.stringify({answer: 'The index is off by one; return xs[xs.length - 1].', evidence: ['xs.length - 1']}), usage: {input_tokens: 100, input_tokens_details: {cached_tokens: 20}, output_tokens: 20, total_tokens: 120}}), {status: 200, headers: {'content-type': 'application/json'}});
  };
  const events: string[] = [], executor = new ProviderNeutralModelEvaluationExecutor(registry, capabilities, unusedNodePort, fetcher, event => events.push(event.phase));
  const candidate: ModelCandidateIdentity = {providerId: 'api', modelId: 'candidate', providerModel: 'vendor/candidate', runtimeId: 'openai-compatible', runtimeVersion: '1', modelVersion: null, nodeId: 'controller'};
  const batch = {schema: 'agent-control.model-evaluation-batch/v1' as const, id: 'batch-api', suiteId: suite.id, suiteVersion: suite.version, suiteSha256: suite.sha256, candidates: [candidate], status: 'RUNNING' as const, attemptIds: [], createdAt: '2026-09-05T00:00:00Z', startedAt: '2026-09-05T00:00:01Z', completedAt: null, requestedBy: 'operator', reason: 'test'};
  const result = await executor.execute({batch, suite, task, candidate, repetition: 1});
  assert.equal(result.passed, true); assert.equal(result.score, 100); assert.deepEqual(events, ['STARTED','REQUEST_STARTED','REQUEST_COMPLETED','COMPLETED']);
  assert.equal((requestBody?.text as {format?: {strict?: boolean}})?.format?.strict, true);
  assert.equal(result.observation.costAccounting?.cloud?.pricingBasis.tableId, 'model-config:candidate');
  assert.equal(result.observation.usage.freshInputTokens, 80);
  assert.equal(capabilities.assess({providerId: 'api', modelId: 'candidate', nodeId: 'controller'}, ['code.modify'])[0].satisfied, true);
  assert.match(capabilities.listObservations({providerId: 'api', modelId: 'candidate'}).find(item => item.source === 'QUALIFICATION')?.id ?? '', new RegExp(`^model-evaluation:batch-api:${suite.sha256}:`));
  assert.doesNotMatch(JSON.stringify(result), /The index is off by one/);
  assert.match(result.evidence?.[0] ?? '', /^response:[a-f0-9]{64}$/);
});

test('the same provider-neutral evaluator dispatches an account-bound CLI candidate through its node port', async () => {
  const suite = oneTaskSuite('coding-v1'), task = suite.tasks[0], capabilities = new CapabilityIntelligenceStore(), providers = [{id: 'codex', kind: 'cli' as const, enabled: true, accountProfiles: [{id: 'profile-a', label: 'Profile A', providerExecutionNodeId: 'msi', credentialResidency: {nodeId: 'msi', store: {type: 'codex-home-env' as const, env: 'CODEX_HOME_PROFILE_A'}}, qualification: {state: 'QUALIFIED' as const, version: 'account-q1', checkedAt: '2026-09-05T00:00:00Z', qualifiedAt: '2026-09-05T00:00:00Z', capabilities: ['codex-chatgpt'], evidence: ['account-status']}}]}], models = [{id: 'cli-candidate', provider: 'codex', accountProfile: 'profile-a', providerModel: 'gpt-candidate', capabilities: ['code.modify'], qualification: {state: 'UNTESTED' as const}}];
  const registry = new ModelRegistry(providers, models, {roles: {}}, undefined, undefined, {}, capabilities); let calls = 0;
  const nodePort: CodexNodeExecutionPort = {accountStatus: async () => { throw new Error('unexpected_account_status'); }, execReadOnlyStructured: async request => { calls++; assert.equal(request.nodeId, 'msi'); assert.equal(request.account.id, 'profile-a'); assert.equal(request.model.id, 'cli-candidate'); return {providerId: 'codex', accountProfileId: 'profile-a', modelId: 'cli-candidate', nodeId: 'msi', providerExecutionNodeId: 'msi', credentialNodeId: 'msi', codexVersion: '0.153.0', executableSha256: 'a'.repeat(64), discoveredAt: '2026-09-05T00:00:00Z', threadId: 'thread-1', finalMessage: JSON.stringify({answer: 'Use xs[xs.length - 1].', evidence: ['xs.length - 1']}), usage: {input_tokens: 30, output_tokens: 10, total_tokens: 40}, observedItemTypes: ['agent_message']}; }};
  const executor = new ProviderNeutralModelEvaluationExecutor(registry, capabilities, nodePort, async () => { throw new Error('unexpected_fetch'); });
  const candidate: ModelCandidateIdentity = {providerId: 'codex', accountProfileId: 'profile-a', modelId: 'cli-candidate', providerModel: 'gpt-candidate', runtimeId: 'cli', runtimeVersion: '0.153.0', modelVersion: null, nodeId: 'msi'}, batch = {schema: 'agent-control.model-evaluation-batch/v1' as const, id: 'batch-cli', suiteId: suite.id, suiteVersion: suite.version, suiteSha256: suite.sha256, candidates: [candidate], status: 'RUNNING' as const, attemptIds: [], createdAt: '2026-09-05T00:00:00Z', startedAt: '2026-09-05T00:00:01Z', completedAt: null, requestedBy: 'operator', reason: 'test'};
  assert.equal((await executor.execute({batch, suite, task, candidate, repetition: 1})).passed, true);
  assert.equal(calls, 1);
});

test('missing browser and computer adapters are recorded as capability unavailability rather than fake model failures', async () => {
  const suite = oneTaskSuite('browser-use-v1'), task = suite.tasks[0], capabilities = new CapabilityIntelligenceStore(), registry = new ModelRegistry([], [], {roles: {}}, undefined, undefined, {}, capabilities), executor = new ProviderNeutralModelEvaluationExecutor(registry, capabilities, unusedNodePort);
  const candidate: ModelCandidateIdentity = {providerId: 'browser-provider', modelId: 'browser-model', providerModel: 'browser-model', runtimeId: 'browser', runtimeVersion: null, modelVersion: null, nodeId: 'controller'}, batch = {schema: 'agent-control.model-evaluation-batch/v1' as const, id: 'batch-browser', suiteId: suite.id, suiteVersion: suite.version, suiteSha256: suite.sha256, candidates: [candidate], status: 'RUNNING' as const, attemptIds: [], createdAt: '2026-09-05T00:00:00Z', startedAt: '2026-09-05T00:00:01Z', completedAt: null, requestedBy: 'operator', reason: 'test'};
  await assert.rejects(() => executor.execute({batch, suite, task, candidate, repetition: 1}), /capability_unavailable:evaluation_adapter:browser/);
});

test('a candidate missing a required model capability is classified before generic route failure', async () => {
  const suite = oneTaskSuite('coding-v1'), task = suite.tasks[0], capabilities = new CapabilityIntelligenceStore();
  const registry = new ModelRegistry(
    [{id: 'api', kind: 'openai-compatible', baseUrl: 'https://provider.example/v1', wireApi: 'responses', auth: {type: 'none'}}],
    [{id: 'reasoning-only', provider: 'api', providerModel: 'vendor/reasoning-only', capabilities: ['reasoning.general'], nodes: ['controller'], qualification: {state: 'UNTESTED'}}],
    {roles: {}}, undefined, undefined, {}, capabilities,
  );
  const candidate: ModelCandidateIdentity = {providerId: 'api', modelId: 'reasoning-only', providerModel: 'vendor/reasoning-only', runtimeId: 'openai-compatible', runtimeVersion: '1', modelVersion: null, nodeId: 'controller'};
  const batch = {schema: 'agent-control.model-evaluation-batch/v1' as const, id: 'batch-missing-capability', suiteId: suite.id, suiteVersion: suite.version, suiteSha256: suite.sha256, candidates: [candidate], status: 'RUNNING' as const, attemptIds: [], createdAt: '2026-09-05T00:00:00Z', startedAt: '2026-09-05T00:00:01Z', completedAt: null, requestedBy: 'operator', reason: 'test'};
  const executor = new ProviderNeutralModelEvaluationExecutor(registry, capabilities, unusedNodePort, async () => { throw new Error('unexpected_fetch'); });
  await assert.rejects(() => executor.execute({batch, suite, task, candidate, repetition: 1}), /capability_unavailable:code\.modify/);
});

test('provider request lifecycle events count a failed physical invocation without counting capability-gated work', async () => {
  const suite = oneTaskSuite('coding-v1'), task = suite.tasks[0], capabilities = new CapabilityIntelligenceStore();
  const registry = new ModelRegistry(
    [{id: 'api', kind: 'openai-compatible', baseUrl: 'https://provider.example/v1', wireApi: 'responses', auth: {type: 'none'}}],
    [{id: 'candidate', provider: 'api', providerModel: 'vendor/candidate', capabilities: ['code.modify'], nodes: ['controller'], qualification: {state: 'UNTESTED'}}],
    {roles: {}}, undefined, undefined, {}, capabilities,
  );
  const phases: string[] = [], executor = new ProviderNeutralModelEvaluationExecutor(registry, capabilities, unusedNodePort, async () => new Response('unavailable', {status: 503}), event => phases.push(event.phase));
  const candidate: ModelCandidateIdentity = {providerId: 'api', modelId: 'candidate', providerModel: 'vendor/candidate', runtimeId: 'openai-compatible', runtimeVersion: '1', modelVersion: null, nodeId: 'controller'}, batch = {schema: 'agent-control.model-evaluation-batch/v1' as const, id: 'batch-failed-request', suiteId: suite.id, suiteVersion: suite.version, suiteSha256: suite.sha256, candidates: [candidate], status: 'RUNNING' as const, attemptIds: [], createdAt: '2026-09-05T00:00:00Z', startedAt: '2026-09-05T00:00:01Z', completedAt: null, requestedBy: 'operator', reason: 'test'};
  await assert.rejects(() => executor.execute({batch, suite, task, candidate, repetition: 1}), /provider_unavailable/);
  assert.deepEqual(phases, ['STARTED','REQUEST_STARTED','REQUEST_FAILED']);
});

test('repeated frozen batches append distinct capability evidence instead of colliding', async () => {
  const suite = oneTaskSuite('coding-v1'), task = suite.tasks[0], capabilities = new CapabilityIntelligenceStore();
  const registry = new ModelRegistry(
    [{id: 'api', kind: 'openai-compatible', baseUrl: 'https://provider.example/v1', wireApi: 'responses', auth: {type: 'none'}}],
    [{id: 'candidate', provider: 'api', providerModel: 'vendor/candidate', capabilities: ['code.modify'], nodes: ['controller'], qualification: {state: 'UNTESTED'}}],
    {roles: {}}, undefined, undefined, {}, capabilities,
  );
  const fetcher = async () => new Response(JSON.stringify({model: 'vendor/candidate', status: 'completed', output_text: JSON.stringify({answer: 'Use xs[xs.length - 1].', evidence: ['xs.length - 1']}), usage: {input_tokens: 20, input_tokens_details: {cached_tokens: 0}, output_tokens: 10, total_tokens: 30}}), {status: 200, headers: {'content-type': 'application/json'}});
  const executor = new ProviderNeutralModelEvaluationExecutor(registry, capabilities, unusedNodePort, fetcher);
  const candidate: ModelCandidateIdentity = {providerId: 'api', modelId: 'candidate', providerModel: 'vendor/candidate', runtimeId: 'openai-compatible', runtimeVersion: '1', modelVersion: null, nodeId: 'controller'};
  const batch = (id: string) => ({schema: 'agent-control.model-evaluation-batch/v1' as const, id, suiteId: suite.id, suiteVersion: suite.version, suiteSha256: suite.sha256, candidates: [candidate], status: 'RUNNING' as const, attemptIds: [], createdAt: '2026-09-05T00:00:00Z', startedAt: '2026-09-05T00:00:01Z', completedAt: null, requestedBy: 'operator', reason: 'repeat'});
  assert.equal((await executor.execute({batch: batch('batch-one'), suite, task, candidate, repetition: 1})).passed, true);
  assert.equal((await executor.execute({batch: batch('batch-two'), suite, task, candidate, repetition: 1})).passed, true);
  const observations = capabilities.listObservations({providerId: 'api', modelId: 'candidate'}).filter(item => item.source === 'QUALIFICATION');
  assert.equal(observations.length, 2); assert.notEqual(observations[0].id, observations[1].id);
});

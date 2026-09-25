import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {validateConfig} from './config.js';
import {CapabilityIntelligenceStore} from './capability-intelligence.js';
import {ModelQualificationStore, ModelRegistry} from './model-registry.js';
import {SecureProviderCredentialStore} from './provider-credential-store.js';
import type {ModelIntelligenceLedger} from './model-intelligence.js';

const providers = [{id: 'external', name: 'External', kind: 'openai-compatible' as const, baseUrl: 'https://models.example/v1', wireApi: 'responses' as const, enabled: true, auth: {type: 'bearer-env' as const, env: 'EXTERNAL_API_KEY'}}];
const models = [
  {id: 'fast', provider: 'external', providerModel: 'vendor/fast', enabled: true, capabilities: ['coding'], nodes: ['node-a'], qualification: {state: 'QUALIFIED' as const, version: 'q1', nodes: ['node-a'], capabilities: ['coding']}, roles: ['coding.fast']},
  {id: 'deep', provider: 'external', providerModel: 'vendor/deep', enabled: true, capabilities: ['coding','reasoning'], nodes: ['node-a'], qualification: {state: 'QUALIFIED' as const, version: 'q2', nodes: ['node-a'], capabilities: ['coding','reasoning']}},
  {id: 'untested', provider: 'external', providerModel: 'vendor/new', enabled: true, capabilities: ['coding'], qualification: {state: 'UNTESTED' as const}},
];

test('valid registry routes explicit model before logical role', () => { const registry = new ModelRegistry(providers, models, {defaultRole: 'coding.fast', roles: {'coding.fast': {primary: 'fast', fallback: ['deep']}}}); assert.equal(registry.route({model: 'deep', modelRole: 'coding.fast', nodeId: 'node-a'}).modelId, 'deep'); });
test('logical role selects qualified primary and records identity', () => { const registry = new ModelRegistry(providers, models, {roles: {'coding.fast': {primary: 'fast', fallback: ['deep']}}}); const route = registry.route({modelRole: 'coding.fast', nodeId: 'node-a', requiredCapabilities: ['coding']}); assert.equal(route.providerModel, 'vendor/fast'); assert.equal(route.qualificationVersion, 'q1'); assert.equal(route.fallback, false); });
test('role capability requirements are enforced before fallback', () => { const registry = new ModelRegistry(providers, models, {roles: {'reasoning.deep': {primary: 'fast', fallback: ['deep'], requires: ['reasoning']}}}); const route=registry.route({modelRole:'reasoning.deep',nodeId:'node-a'});assert.equal(route.modelId,'deep');assert.match(route.fallbackReason??'',/capability-reasoning-unproven/); });
test('unavailable node and unqualified primary cause visible fallback', () => { const registry = new ModelRegistry(providers, models, {roles: {'coding.fast': {primary: 'untested', fallback: ['deep']}}}); const route = registry.route({modelRole: 'coding.fast', nodeId: 'node-a'}); assert.equal(route.modelId, 'deep'); assert.equal(route.fallback, true); assert.match(route.fallbackReason!, /qualification-untested/); });
test('qualified model on a different node is unavailable', () => { const registry = new ModelRegistry(providers, models, {roles: {'coding.fast': {primary: 'fast'}}}); assert.throws(() => registry.route({modelRole: 'coding.fast', nodeId: 'node-b'}), /model_route_unavailable/); });
test('fallback can be disabled', () => { const registry = new ModelRegistry(providers, models, {roles: {'coding.fast': {primary: 'untested', fallback: ['deep']}}}); assert.throws(() => registry.route({modelRole: 'coding.fast', nodeId: 'node-a', allowFallback: false}), /model_fallback_disabled/); });
test('a human-approved historically preferred route can outrank static role order', () => {
  const metrics = {attempts: 8, completed: 8, passed: 8, reliability: 1, quality: 1, criticalFailures: 0, retries: 0, inputTokens: 800, freshInputTokens: 800, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 80, totalTokens: 880, cacheHitRatio: 0, cacheCoverage: {knownAttempts: 8, totalAttempts: 8}, estimatedCacheSavings: 0, actualCost: null, calculatedCost: .01, equivalentUncachedCost: .01, currency: 'USD', elapsedMs: 8_000, costPerSuccessfulTask: .00125, tokensPerSuccessfulTask: 110, freshTokensPerSuccessfulTask: 100, timePerSuccessfulTaskMs: 1_000, retriesPerSuccessfulTask: 0, resourceCoverage: {measuredAttempts: 0, totalAttempts: 8}};
  const intelligence = {projection: () => ({routes: [{routeKey: 'external/default/deep@node-a/openai-compatible', identity: {providerId: 'external', modelId: 'deep', providerModel: 'vendor/deep', runtimeId: 'openai-compatible', runtimeVersion: '1', modelVersion: 'current', nodeId: 'node-a'}, state: 'PREFERRED', current: metrics}]}), attemptsList: () => []} as unknown as ModelIntelligenceLedger;
  const registry = new ModelRegistry(providers, models, {roles: {'coding.fast': {primary: 'fast', fallback: ['deep']}}}, undefined, undefined, process.env, undefined, intelligence);
  const route = registry.route({modelRole: 'coding.fast', nodeId: 'node-a', requiredCapabilities: ['coding']});
  assert.equal(route.modelId, 'deep');
  assert.equal(route.intelligence?.selectionBasis, 'human-approved preferred route with historical verified economics');
});
test('historical intelligence cannot bypass current qualification state', () => {
  const capabilities = new CapabilityIntelligenceStore();
  capabilities.observe({id: 'qualification:untested:code.modify', capabilityId: 'code.modify', subject: {providerId: 'external', modelId: 'untested', nodeId: 'node-a'}, support: 'SUPPORTED', implementation: 'NATIVE', verification: 'VERIFIED', confidence: 1, observedAt: '2026-09-05T00:00:00Z', qualifiedAt: '2026-09-05T00:00:00Z', limitations: [], evidence: ['attempt:one'], source: 'QUALIFICATION'});
  const metrics = {attempts: 8, completed: 8, passed: 8, reliability: 1, quality: 1, criticalFailures: 0, retries: 0, inputTokens: 800, freshInputTokens: 800, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 80, totalTokens: 880, cacheHitRatio: 0, cacheCoverage: {knownAttempts: 8, totalAttempts: 8}, estimatedCacheSavings: 0, actualCost: null, calculatedCost: null, equivalentUncachedCost: null, currency: null, elapsedMs: 8_000, costPerSuccessfulTask: null, tokensPerSuccessfulTask: 110, freshTokensPerSuccessfulTask: 100, timePerSuccessfulTaskMs: 1_000, retriesPerSuccessfulTask: 0, resourceCoverage: {measuredAttempts: 0, totalAttempts: 8}};
  const routeKey = 'external/default/untested@node-a/openai-compatible', intelligence = {projection: () => ({routes: [{routeKey, identity: {providerId: 'external', modelId: 'untested', providerModel: 'vendor/new', runtimeId: 'openai-compatible', runtimeVersion: '1', modelVersion: 'current', nodeId: 'node-a'}, state: 'QUALIFIED', current: metrics}]}), attemptsList: () => [{suiteId: 'frozen', suiteVersion: '1.0.0', suiteSha256: 'a'.repeat(64)}]} as unknown as ModelIntelligenceLedger;
  const candidate = {...models[2], nodes: ['node-a']};
  const withoutEvidence = new ModelRegistry(providers, [candidate], {roles: {review: {primary: 'untested'}}}, undefined, undefined, process.env, undefined, intelligence);
  assert.throws(() => withoutEvidence.route({modelRole: 'review', nodeId: 'node-a', requiredCapabilities: ['code.modify']}), /model_route_unavailable/);
  const registry = new ModelRegistry(providers, [candidate], {roles: {review: {primary: 'untested'}}}, undefined, undefined, process.env, capabilities, intelligence);
  assert.throws(()=>registry.route({modelRole: 'review', nodeId: 'node-a', requiredCapabilities: ['code.modify']}),error=>{assert.match(JSON.stringify((error as {considered?:unknown}).considered),/qualification-untested/);return true;});
  const qualifications=new ModelQualificationStore();qualifications.set({modelId:'untested',state:'DEGRADED',version:'current-degraded',checkedAt:'2026-09-06T00:00:00Z',capabilities:['code.modify'],nodes:['node-a'],evidence:['current:degraded']});
  const degraded=new ModelRegistry(providers,[candidate],{roles:{review:{primary:'untested'}}},qualifications,undefined,process.env,capabilities,intelligence);
  assert.throws(()=>degraded.route({modelRole:'review',nodeId:'node-a',requiredCapabilities:['code.modify']}),error=>{assert.match(JSON.stringify((error as {considered?:unknown}).considered),/qualification-degraded/);return true;});
});
test('disabled and capability-unproven models cannot route', () => { const disabled = {...models[0], enabled: false}; const registry = new ModelRegistry(providers, [disabled], {roles: {review: {primary: 'fast'}}}); assert.throws(() => registry.route({modelRole: 'review', nodeId: 'node-a', requiredCapabilities: ['review']}), /model_route_unavailable/); });

test('a failed task qualification cannot be bypassed by unrelated qualification history', () => {
  const capabilities = new CapabilityIntelligenceStore();
  for (const capabilityId of ['coding', 'structured-output']) capabilities.observe({id: `qualified:${capabilityId}`, capabilityId, subject: {providerId: 'external', modelId: 'scoped', nodeId: 'node-a'}, support: 'SUPPORTED', implementation: 'NATIVE', verification: 'VERIFIED', confidence: 1, observedAt: '2026-09-12T10:00:00Z', qualifiedAt: '2026-09-12T10:00:00Z', limitations: [], evidence: ['other-task:pass'], source: 'QUALIFICATION'});
  const metrics = {attempts: 8, completed: 8, passed: 8, reliability: 1, quality: 1, criticalFailures: 0, retries: 0, inputTokens: 80, freshInputTokens: 80, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 8, totalTokens: 88, cacheHitRatio: 0, cacheCoverage: {knownAttempts: 8, totalAttempts: 8}, estimatedCacheSavings: null, actualCost: null, calculatedCost: null, equivalentUncachedCost: null, currency: null, elapsedMs: 800, costPerSuccessfulTask: null, tokensPerSuccessfulTask: 11, freshTokensPerSuccessfulTask: 10, timePerSuccessfulTaskMs: 100, retriesPerSuccessfulTask: 0, resourceCoverage: {measuredAttempts: 0, totalAttempts: 8}};
  const intelligence = {projection: () => ({routes: [{routeKey: 'external/default/scoped@node-a/openai-compatible', identity: {providerId: 'external', modelId: 'scoped', providerModel: 'vendor/scoped', runtimeId: 'openai-compatible', runtimeVersion: '1', modelVersion: 'current', nodeId: 'node-a'}, state: 'PREFERRED', current: metrics}]}), attemptsList: () => [{suiteId: 'other-suite', suiteVersion: '1', suiteSha256: 'a'.repeat(64)}]} as unknown as ModelIntelligenceLedger;
  const qualification = new ModelQualificationStore();
  qualification.set({modelId: 'scoped', state: 'QUALIFIED', version: 'other-task-v1', checkedAt: '2026-09-12T10:00:00Z', qualifiedAt: '2026-09-12T10:00:00Z', capabilities: ['coding', 'structured-output'], nodes: ['node-a'], evidence: ['other-task:pass'], taskQualifications: [{taskClass: 'governed-code-repair', state: 'FAILED', checkedAt: '2026-09-12T10:00:00Z', evidence: ['repair:0/3']}]});
  const model = {id: 'scoped', provider: 'external', providerModel: 'vendor/scoped', enabled: true, capabilities: ['coding', 'structured-output'], nodes: ['node-a']};
  const registry = new ModelRegistry(providers, [model], {roles: {structured: {primary: 'scoped'}, repair: {primary: 'scoped'}}}, qualification, undefined, process.env, capabilities, intelligence);
  assert.equal(registry.route({modelRole: 'structured', taskClass: 'structured-extraction', nodeId: 'node-a', requiredCapabilities: ['structured-output']}).modelId, 'scoped');
  try { registry.route({modelRole: 'repair', taskClass: 'governed-code-repair', nodeId: 'node-a', requiredCapabilities: ['coding']}); assert.fail('failed task class routed'); }
  catch (error) { assert.match(JSON.stringify((error as {considered?: unknown}).considered), /task-qualification-governed-code-repair-failed/); }
});

test('the immutable MiniCPM record denies only its exact configuration and leaves the family sibling unqualified', () => {
  const file = path.resolve('fixtures/model-qualification/minicpm5-2b-q4-k-m-failed.json'), store = new ModelQualificationStore(file), exactId = 'openbmb-minicpm5-2b-gguf-q4-k-m-d00c954e';
  const node = store.get(exactId)!.nodes[0]!;
  const exact = {id: exactId, provider: 'external', providerModel: 'openbmb/MiniCPM5-2B-GGUF@d00c954e:Q4_K_M', enabled: true, capabilities: ['coding'], nodes: [node]};
  const sibling = {id: 'openbmb-minicpm-family-unqualified-sibling', provider: 'external', providerModel: 'openbmb/other-minicpm', enabled: true, capabilities: ['coding'], nodes: [node], qualification: {state: 'UNTESTED' as const}};
  const registry = new ModelRegistry(providers, [exact, sibling], {roles: {repair: {primary: exactId, fallback: [sibling.id]}}}, store);
  assert.equal(store.get(exactId)?.configuration?.artifactSha256, 'ec2d5801640099e97d8d7e8003ad4d81f336e757811f03a26173dddf386602fd');
  try { registry.route({model: exactId, taskClass: 'governed-code-repair', nodeId: node, requiredCapabilities: ['coding']}); assert.fail('failed MiniCPM configuration routed'); }
  catch (error) { assert.match(JSON.stringify((error as {considered?: unknown}).considered), /qualification-failed/); }
  assert.equal(registry.qualification(sibling).state, 'UNTESTED');
});
test('configuration rejects duplicate model IDs, unknown provider, and fallback cycles', () => {
  const base = {schemaVersion: 1 as const, resources: [], services: [], lanes: [], providers, models, modelRouting: {roles: {}}};
  assert.throws(() => validateConfig({...base, models: [models[0], models[0]]}), /duplicate_model_id/);
  assert.throws(() => validateConfig({...base, models: [{...models[0], provider: 'missing'}]}), /unknown_model_provider/);
  assert.throws(() => validateConfig({...base, providers: [{...providers[0], baseUrl: 'not a url'}]}), /invalid_provider_external_url/);
  const cycleModels = [{...models[0], id: 'a'}, {...models[1], id: 'b'}];
  assert.throws(() => validateConfig({...base, models: cycleModels, modelRouting: {roles: {a: {primary: 'b'}, b: {primary: 'a'}}}}), /model_fallback_cycle/);
});

test('routing binds an exact qualified account profile and never falls across account policy', () => {
  const profileProviders = [{id: 'codex', name: 'Codex', kind: 'cli' as const, accountProfiles: [
    {id: 'lawrence-pro', nodeId: 'node-a', label: 'Lawrence Pro', plan: 'ChatGPT Pro', credentialStore: {type: 'codex-home-env' as const, env: 'CODEX_HOME_LAWRENCE_PRO'}, qualification: {state: 'QUALIFIED' as const, version: 'account-q1', checkedAt: '2026-09-02T00:00:00Z', qualifiedAt: '2026-09-02T00:00:00Z', capabilities: ['codex-chatgpt'], evidence: ['interactive-login'] }},
    {id: 'cottage-plus', nodeId: 'node-a', label: 'Cottage Plus', plan: 'ChatGPT Plus', credentialStore: {type: 'codex-home-env' as const, env: 'CODEX_HOME_COTTAGE_PLUS'}, qualification: {state: 'QUALIFIED' as const, version: 'account-q2', checkedAt: '2026-09-02T00:00:00Z', qualifiedAt: '2026-09-02T00:00:00Z', capabilities: ['codex-chatgpt'], evidence: ['interactive-login'] }},
  ]}];
  const profileModels = [
    {id: 'sol-pro', provider: 'codex', accountProfile: 'lawrence-pro', providerModel: 'sol', capabilities: ['coding'], qualification: {state: 'QUALIFIED' as const, version: 'model-q1', nodes: ['node-a'], capabilities: ['coding']}},
    {id: 'luna-plus', provider: 'codex', accountProfile: 'cottage-plus', providerModel: 'luna', capabilities: ['coding'], qualification: {state: 'QUALIFIED' as const, version: 'model-q2', nodes: ['node-a'], capabilities: ['coding']}},
  ];
  const registry = new ModelRegistry(profileProviders, profileModels, {roles: {review: {primary: 'sol-pro', fallback: ['luna-plus']}}}, undefined, undefined, {CODEX_HOME_LAWRENCE_PRO: process.cwd(), CODEX_HOME_COTTAGE_PLUS: process.cwd()});
  const route = registry.route({model: 'luna-plus', accountProfile: 'cottage-plus', nodeId: 'node-a'});
  assert.deepEqual({provider: route.providerId, account: route.accountProfileId, label: route.accountLabel, plan: route.accountPlan, model: route.modelId}, {provider: 'codex', account: 'cottage-plus', label: 'Cottage Plus', plan: 'ChatGPT Plus', model: 'luna-plus'});
  assert.throws(() => registry.route({model: 'luna-plus', accountProfile: 'lawrence-pro', nodeId: 'node-a'}), /model_route_unavailable/);
  const publicProfile = registry.accountProfilesList()[0] as unknown as Record<string, unknown>;
  assert.equal('credentialStore' in publicProfile, false);
  assert.equal(JSON.stringify(registry.providersList()).includes(process.cwd()), false);
  assert.deepEqual(registry.governedAlternatives('sol-pro'), ['sol-pro', 'luna-plus']);
});

test('controller account profiles reuse provider-secure-store status without exposing the opaque reference', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-profile-secure-store-')), environment: NodeJS.ProcessEnv = {AGENT_CONTROL_STATE_DIR: root}, store = new SecureProviderCredentialStore(path.join(root, 'credentials', 'providers'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const provider = {id: 'external', kind: 'openai-compatible' as const, baseUrl: 'https://models.example/v1', accountProfiles: [{id: 'account-a', label: 'Account A', providerExecutionNodeId: 'controller', credentialResidency: {nodeId: 'controller', store: {type: 'provider-secure-store' as const, reference: 'provider:external:account-a'}}, qualification: {state: 'QUALIFIED' as const, version: 'account-q1', qualifiedAt: '2026-09-06T00:00:00Z'}}]};
  const model = {id: 'external-a', provider: 'external', accountProfile: 'account-a', providerModel: 'vendor/model', capabilities: ['coding'], nodes: ['controller'], qualification: {state: 'QUALIFIED' as const, version: 'model-q1', nodes: ['controller'], capabilities: ['coding']}};
  const registry = new ModelRegistry([provider], [model], {roles: {review: {primary: 'external-a'}}}, undefined, undefined, environment);
  assert.equal(registry.accountProfilesList()[0].availability, 'AUTH_REQUIRED');
  store.set('provider:external:account-a', 'future-provider-account-credential');
  assert.equal(registry.accountProfilesList()[0].availability, 'AVAILABLE');
  assert.equal(JSON.stringify(registry.providersList()).includes('provider:external:account-a'), false);
  store.revoke('provider:external:account-a');
  assert.equal(registry.accountProfilesList()[0].availability, 'AUTH_REQUIRED');
});

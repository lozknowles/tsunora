import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {emptyConfig, loadConfig, validateConfig} from './config.js';

test('missing configuration is a safe empty control plane', () => {
  const file = path.join(os.tmpdir(), `agent-control-missing-${Date.now()}.json`);
  assert.deepEqual(loadConfig(file), emptyConfig());
});

test('canonical example configuration validates as shipped', () => {
  assert.doesNotThrow(() => validateConfig(loadConfig(path.resolve('config/agent-control.example.json'))));
});

test('arbitrary names, ports and Android models are configuration not identity', () => {
  const config = validateConfig({
    schemaVersion: 1,
    resources: [
      {id: 'controller-a', platform: 'linux', transport: {type: 'local'}, capabilities: ['control-plane']},
      {id: 'worker-foo', platform: 'linux', transport: {type: 'ssh', host: 'worker.example', port: 2207, user: 'operator'}, capabilities: ['harness.codex']},
      {id: 'android-test', platform: 'android', transport: {type: 'ssh', host: 'phone.example', port: 9922, user: 'mobile'}, capabilities: ['platform.android'], metadata: {model: 'Example One'}},
      {id: 'remote-bar', platform: 'remote', transport: {type: 'orca'}, capabilities: ['execution.remote']},
    ],
    providers: [{id: 'provider-a', kind: 'responses', baseUrl: 'http://127.0.0.1:19091/v1'}],
    services: [{id: 'model-a', healthUrl: 'http://127.0.0.1:19092/health', optional: true}],
    lanes: [{id: 1, name: 'Primary', cwd: '.'}],
  });
  assert.deepEqual(config.resources.map(resource => resource.id), ['controller-a', 'worker-foo', 'android-test', 'remote-bar']);
  assert.equal(config.resources[2].metadata?.model, 'Example One');
  assert.equal(config.providers[0].baseUrl, 'http://127.0.0.1:19091/v1');
});

test('resource identity and transport identity are separate', () => {
  const base = {id: 'worker-foo', platform: 'linux', capabilities: ['harness.codex']};
  const local = validateConfig({schemaVersion: 1, resources: [{...base, transport: {type: 'local'}}], providers: [], services: [], lanes: []});
  const ssh = validateConfig({schemaVersion: 1, resources: [{...base, transport: {type: 'ssh', host: 'worker.example'}}], providers: [], services: [], lanes: []});
  assert.equal(local.resources[0].id, ssh.resources[0].id);
  assert.notEqual(local.resources[0].transport.type, ssh.resources[0].transport.type);
});

test('configuration rejects embedded secrets and credentialed URLs', () => {
  assert.throws(() => validateConfig({schemaVersion: 1, resources: [], providers: [], services: [], lanes: [], apiKey: 'forbidden'}), /secret_material_forbidden/);
  assert.throws(() => validateConfig({schemaVersion: 1, resources: [], providers: [{id: 'p', kind: 'responses', baseUrl: 'https://user:pass@example.test'}], services: [], lanes: []}), /invalid_provider_p_url/);
});

test('provider credentials are references and qualification metadata is durable configuration', () => {
  const config = validateConfig({schemaVersion: 1, resources: [], providers: [{id: 'ox', kind: 'responses', baseUrl: 'https://openrouter.ai/api/v1', wireApi: 'responses', requiresAuth: true, credentialEnv: 'OPENROUTER_API_KEY', credentialFileEnv: 'OPENROUTER_API_KEY_FILE', qualificationModel: 'z-ai/glm-5.3-flash', qualification: {status: 'unqualified', advertisedContextLimitTokens: 1048576, evidence: ['provider-catalog:openrouter:z-ai/glm-5.3-flash:2026-08-29']}}], services: [], lanes: []});
  assert.equal(config.providers[0].credentialEnv, 'OPENROUTER_API_KEY');
  assert.equal(config.providers[0].qualification?.advertisedContextLimitTokens, 1048576);
  assert.throws(() => validateConfig({schemaVersion: 1, resources: [], providers: [{id: 'ox', kind: 'responses', credentialEnv: 'bad-name'}], services: [], lanes: []}), /invalid_provider_credentialEnv/);
});

test('provider authentication reuses generic environment, file and opaque store references', () => {
  const base = {schemaVersion: 1 as const, resources: [], models: [], modelRouting: {roles: {}}, services: [], lanes: []};
  const providers = [
    {id: 'environment', kind: 'openai-compatible' as const, baseUrl: 'https://environment.example/v1', auth: {type: 'api-key-env' as const, env: 'PROVIDER_API_KEY'}},
    {id: 'file', kind: 'openai-compatible' as const, baseUrl: 'https://file.example/v1', auth: {type: 'bearer-file-env' as const, env: 'PROVIDER_API_KEY_FILE'}},
    {id: 'opaque', kind: 'openai-compatible' as const, baseUrl: 'https://opaque.example/v1', auth: {type: 'provider-secure-store' as const, reference: 'provider:opaque:primary'}, discovery: {enabled: true, path: 'models'}},
  ];
  const config = validateConfig({...base, providers});
  assert.deepEqual(config.providers.map(provider => provider.auth?.type), ['api-key-env','bearer-file-env','provider-secure-store']);
  assert.equal(config.providers[2].auth?.type === 'provider-secure-store' ? config.providers[2].auth.reference : null, 'provider:opaque:primary');
  assert.throws(() => validateConfig({...base, providers: [{...providers[2], auth: {type: 'provider-secure-store', reference: '../escape'}}]}), /invalid_provider_auth_reference/);
  assert.throws(() => validateConfig({...base, providers: [{...providers[2], discovery: {path: '../models'}}]}), /invalid_provider_discovery_path/);
});

test('configuration rejects literal NVIDIA credentials while accepting opaque references', () => {
  const secret = ['nvapi', 'fixture', 'C'.repeat(24)].join('-'), base = {schemaVersion: 1 as const, resources: [], models: [], modelRouting: {roles: {}}, services: [], lanes: []};
  assert.throws(() => validateConfig({...base, providers: [{id: 'unsafe', kind: 'openai-compatible', baseUrl: 'https://integrate.api.nvidia.com/v1', note: secret}]}), /secret_material_forbidden/);
  assert.doesNotThrow(() => validateConfig({...base, providers: [{id: 'safe', kind: 'openai-compatible', baseUrl: 'https://integrate.api.nvidia.com/v1', auth: {type: 'provider-secure-store', reference: 'provider:nvidia-hosted'}}]}));
});

test('Codex account profiles contain only opaque identity and credential-store references', () => {
  const provider = {id: 'codex', kind: 'cli' as const, accountProfiles: [
    {id: 'lawrence-pro', label: 'Lawrence Pro', plan: 'ChatGPT Pro', planAuthority: 'operator-configured' as const, capabilities: ['codex-chatgpt'], credentialStore: {type: 'codex-home-env' as const, env: 'CODEX_HOME_LAWRENCE_PRO'}, qualification: {state: 'UNTESTED' as const, version: 'configured-v1'}},
    {id: 'cottage-plus', label: 'Cottage Plus', plan: 'ChatGPT Plus', planAuthority: 'operator-configured' as const, credentialStore: {type: 'codex-home-env' as const, env: 'CODEX_HOME_COTTAGE_PLUS'}},
  ]};
  const model = {id: 'sol-pro', provider: 'codex', accountProfile: 'lawrence-pro', providerModel: 'gpt-sol', capabilities: ['coding']};
  const config = validateConfig({schemaVersion: 1, resources: [], services: [], lanes: [], providers: [provider], models: [model], modelRouting: {roles: {}}});
  const configuredStore = config.providers[0].accountProfiles?.[1].credentialStore;
  assert.equal(configuredStore?.type === 'codex-home-env' ? configuredStore.env : undefined, 'CODEX_HOME_COTTAGE_PLUS');
  assert.equal(config.models[0].accountProfile, 'lawrence-pro');
  assert.throws(() => validateConfig({schemaVersion: 1, resources: [], services: [], lanes: [], providers: [{...provider, accountProfiles: [{...provider.accountProfiles[0], label: 'user@example.com'}]}], models: [model], modelRouting: {roles: {}}}), /account_profile_label/);
  assert.throws(() => validateConfig({schemaVersion: 1, resources: [], services: [], lanes: [], providers: [provider], models: [{...model, accountProfile: 'missing'}], modelRouting: {roles: {}}}), /unknown_model_account_profile/);
  assert.throws(() => validateConfig({schemaVersion: 1, resources: [], services: [], lanes: [], providers: [provider], models: [{...model, accountProfile: undefined}], modelRouting: {roles: {}}}), /model_account_profile_required/);
  assert.throws(() => validateConfig({schemaVersion: 1, resources: [], services: [], lanes: [], providers: [{...provider, accountProfiles: [{...provider.accountProfiles[0], accessToken: 'forbidden'}]}], models: [model], modelRouting: {roles: {}}}), /secret_material_forbidden/);
});

test('Codex account profile node identity must resolve to a matching configured model node', () => {
  const resource = {id: 'windows-node', platform: 'windows' as const, transport: {type: 'ssh' as const, host: 'windows-node.example'}, capabilities: ['harness.codex']};
  const profile = {id: 'account-a', nodeId: resource.id, label: 'Account A', credentialStore: {type: 'codex-home-env' as const, env: 'CODEX_HOME_ACCOUNT_A'}};
  const provider = {id: 'codex', kind: 'cli' as const, accountProfiles: [profile]};
  const model = {id: 'model-a', provider: provider.id, accountProfile: profile.id, providerModel: 'gpt-example', nodes: [resource.id], capabilities: ['coding']};
  const config = validateConfig({schemaVersion: 1, resources: [resource], services: [], lanes: [], providers: [provider], models: [model], modelRouting: {roles: {}}});
  assert.equal(config.providers[0].accountProfiles?.[0].nodeId, resource.id);
  assert.throws(() => validateConfig({schemaVersion: 1, resources: [], services: [], lanes: [], providers: [provider], models: [model], modelRouting: {roles: {}}}), /invalid_account_profile_node/);
  assert.throws(() => validateConfig({schemaVersion: 1, resources: [resource], services: [], lanes: [], providers: [provider], models: [{...model, nodes: ['controller']}], modelRouting: {roles: {}}}), /model_account_profile_node_mismatch/);
});

test('explicit account locality validates models against provider execution rather than workload placement', () => {
  const execution = {id: 'execution-node', platform: 'linux' as const, transport: {type: 'local' as const}, capabilities: ['model.execute']};
  const workload = {id: 'workload-node', platform: 'windows' as const, transport: {type: 'ssh' as const, host: 'workload.example'}, capabilities: ['repository.read']};
  const account = {id: 'account-a', label: 'Account A', providerExecutionNodeId: execution.id, credentialResidency: {nodeId: execution.id, store: {type: 'codex-home-env' as const, env: 'CODEX_HOME_ACCOUNT_A'}}};
  const provider = {id: 'codex', kind: 'cli' as const, accountProfiles: [account]};
  const model = {id: 'model-a', provider: provider.id, accountProfile: account.id, providerModel: 'gpt-example', nodes: [execution.id], capabilities: ['repository-review']};
  assert.doesNotThrow(() => validateConfig({schemaVersion: 1, resources: [execution, workload], services: [], lanes: [], providers: [provider], models: [model], modelRouting: {roles: {}}}));
  assert.throws(() => validateConfig({schemaVersion: 1, resources: [execution, workload], services: [], lanes: [], providers: [provider], models: [{...model, nodes: [workload.id]}], modelRouting: {roles: {}}}), /model_account_profile_node_mismatch/);
});

test('configuration survives a persistence reload', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-config-'));
  const file = path.join(dir, 'config.json');
  fs.writeFileSync(file, JSON.stringify({schemaVersion: 1, resources: [], providers: [], services: [], lanes: [{id: 7, name: 'Review'}]}));
  assert.equal(loadConfig(file).lanes[0].name, 'Review');
});

test('API-only installation needs no local resource or local model', () => {
  const config = validateConfig({schemaVersion: 1, resources: [], providers: [{id: 'api-only', kind: 'responses', baseUrl: 'https://api.example.test/v1', qualificationModel: 'qualified-model'}], services: [], lanes: []});
  assert.deepEqual(config.resources, []);
  assert.equal(config.providers[0].kind, 'responses');
  assert.deepEqual(config.services, []);
});

test('two Android models use one schema without becoming identity defaults', () => {
  const config = validateConfig({schemaVersion: 1, resources: [
    {id: 'mobile-a', platform: 'android', transport: {type: 'ssh', host: 'mobile-a.example'}, capabilities: ['platform.android'], metadata: {model: 'Vendor One'}},
    {id: 'mobile-b', platform: 'android', transport: {type: 'http', baseUrl: 'https://mobile-b.example'}, capabilities: ['platform.android'], metadata: {model: 'Vendor Two'}},
  ], providers: [], services: [], lanes: []});
  assert.deepEqual(config.resources.map(resource => resource.metadata?.model), ['Vendor One', 'Vendor Two']);
});

test('generic managed Linux node policy is configuration and validates workload boundaries', () => {
  const config = validateConfig({schemaVersion: 1, resources: [{id: 'linux-any', platform: 'linux', transport: {type: 'ssh', host: 'linux-any.example', user: 'operator'}, capabilities: [], managedNode: {enabled: true, probeIntervalSeconds: 15, offlineAfterSeconds: 45, approvedServices: ['disc-watch.service'], connectivity: [{id: 'private-overlay', label: 'Private overlay', capability: 'transport.secure-overlay', serviceUnit: 'overlay-agent.service', interfaceName: 'overlay0'}], workloads: [{id: 'disc-copy', capability: 'workload.dvd-rip', systemdUnit: 'disc-watch.service', processExecutables: ['disc-copy'], opticalAccess: true}], runtime: {directory: '/opt/agent-control', branch: 'integration/3.1'}}}], providers: [], services: [], lanes: []});
  assert.equal(config.resources[0].managedNode?.workloads?.[0].id, 'disc-copy');
  assert.equal(config.resources[0].managedNode?.connectivity?.[0].capability, 'transport.secure-overlay');
  assert.throws(() => validateConfig({schemaVersion: 1, resources: [{id: 'bad', platform: 'linux', transport: {type: 'ssh', host: '-oProxyCommand=bad'}, capabilities: [], managedNode: {enabled: true}}], providers: [], services: [], lanes: []}), /invalid_ssh_host/);
  assert.throws(() => validateConfig({schemaVersion: 1, resources: [{id: 'bad', platform: 'linux', transport: {type: 'local'}, capabilities: [], managedNode: {enabled: true}}], providers: [], services: [], lanes: []}), /managed_node_ssh_required/);
  assert.throws(() => validateConfig({schemaVersion: 1, resources: [{id: 'bad', platform: 'linux', transport: {type: 'ssh', host: 'safe.example'}, capabilities: [], managedNode: {enabled: true, runtime: {directory: '/tmp/x;reboot', branch: 'main'}}}], providers: [], services: [], lanes: []}), /runtime_directory/);
  assert.throws(() => validateConfig({schemaVersion: 1, resources: [{id: 'bad', platform: 'linux', transport: {type: 'ssh', host: 'safe.example'}, capabilities: [], managedNode: {enabled: true, connectivity: [{id: 'overlay', capability: 'transport.secure-overlay', interfaceName: '-oBad'}]}}], providers: [], services: [], lanes: []}), /connectivity_interface/);
});

test('token-aware output thresholds are optional machine-neutral configuration', () => {
  const config = validateConfig({schemaVersion: 1, resources: [], providers: [], services: [], lanes: [], tokenAwareOutput: {completeMaxLines: 25, completeMaxBytes: 8192, completeMaxTokens: 2048, completeMaxMatches: 20, completeMaxFiles: 4, indexMaxFiles: 80, maxCaptureBytesPerStream: 1048576, retentionSeconds: 600, contextBudgetFraction: .4}});
  assert.equal(config.tokenAwareOutput?.completeMaxLines, 25);
  assert.equal(config.tokenAwareOutput?.contextBudgetFraction, .4);
});

test('token-aware output configuration rejects unsafe or nonsensical limits', () => {
  const base = {schemaVersion: 1, resources: [], providers: [], services: [], lanes: []};
  assert.throws(() => validateConfig({...base, tokenAwareOutput: {maxCaptureBytesPerStream: 1}}), /maxCaptureBytesPerStream/);
  assert.throws(() => validateConfig({...base, tokenAwareOutput: {retentionSeconds: 0}}), /retentionSeconds/);
  assert.throws(() => validateConfig({...base, tokenAwareOutput: {contextBudgetFraction: 1.1}}), /context_budget_fraction/);
});

test('token-aware baton-routing thresholds are explicit policy and reject invalid ordering', () => {
  const base = {schemaVersion: 1, resources: [], providers: [], services: [], lanes: []};
  const config = validateConfig({...base, tokenBatonRouting: {continuePercent: 60, prepareBatonPercent: 75, compactPercent: 85, handoffPercent: 90, sampleRetention: 240}});
  assert.equal(config.tokenBatonRouting?.continuePercent, 60);
  assert.equal(config.tokenBatonRouting?.handoffPercent, 90);
  assert.throws(() => validateConfig({...base, tokenBatonRouting: {prepareBatonPercent: 85, compactPercent: 75, handoffPercent: 90}}), /threshold_order/);
  assert.throws(() => validateConfig({...base, tokenBatonRouting: {prepareBatonPercent: 86}}), /threshold_order/);
  assert.throws(() => validateConfig({...base, tokenBatonRouting: {sampleRetention: 1}}), /sample_retention/);
});

test('harness efficiency profiles are configurable without provider or machine identity', () => {
  const config = validateConfig({schemaVersion: 1, resources: [], providers: [], services: [], lanes: [], harnessEfficiency: {routingMode: 'observe', minimumVerifiedRuns: 12, minimumSuccessRate: .95, minimumSameModelControlledRuns: 10, profiles: {THIN: {maximumInitialContextTokens: 3000, maximumSources: 10, maximumOptionalSkills: 1, maximumTools: 5, maximumTurns: 2, allowBroadRepositoryContext: false, allowSharedContext: false}}}});
  assert.equal(config.harnessEfficiency?.routingMode, 'observe');
  assert.equal(config.harnessEfficiency?.profiles?.THIN?.maximumInitialContextTokens, 3000);
});

test('harness efficiency configuration rejects unsafe automatic-routing thresholds', () => {
  const base = {schemaVersion: 1, resources: [], providers: [], services: [], lanes: []};
  assert.throws(() => validateConfig({...base, harnessEfficiency: {routingMode: 'automatic'}}), /routing_mode/);
  assert.throws(() => validateConfig({...base, harnessEfficiency: {minimumSuccessRate: 0}}), /minimum_success_rate/);
  assert.throws(() => validateConfig({...base, harnessEfficiency: {profiles: {THIN: {maximumInitialContextTokens: 1}}}}), /harness_efficiency_context/);
});

test('Spark fast-execution configuration is conservative and fail-closed', () => {
  const base = {schemaVersion: 1 as const, resources: [], providers: [], models: [], modelRouting: {roles: {}}, services: [], lanes: []};
  const config = validateConfig({...base, spark: {enabled: false, model: 'gpt-5.3-codex-spark', modelRole: 'fast-execution', maximumFiles: 1, maximumChangedLines: 80, maximumAttempts: 1, maximumSubagents: 0, maximumContextTokens: 2048, verificationRequired: true}});
  assert.equal(config.spark?.enabled, false); assert.equal(config.spark?.maximumAttempts, 1); assert.equal(config.spark?.verificationRequired, true);
  assert.throws(() => validateConfig({...base, spark: {enabled: true, maximumAttempts: 2}}), /spark_maximum_attempts/);
  assert.throws(() => validateConfig({...base, spark: {enabled: true, maximumSubagents: 1}}), /spark_maximum_subagents/);
  assert.throws(() => validateConfig({...base, spark: {enabled: true, verificationRequired: false}}), /spark_verification_required/);
});

test('governed retrieval is opt-in, bounded, local-first and keeps zg optional',()=>{const base={schemaVersion:1 as const,resources:[],providers:[],models:[],modelRouting:{roles:{}},services:[],lanes:[]};const config=validateConfig({...base,retrieval:{enabled:true,providers:['exact','lexical','zg'],maximumCalls:4,maximumEvidenceItems:12,maximumEvidenceTokens:4096,minimumConfidence:.5,requiredCoverage:.6,contextPressurePercent:75,contextPressureEvidenceFraction:.5,allowRemote:false,zgExecutable:'zg'}});assert.equal(config.retrieval?.enabled,true);assert.equal(config.retrieval?.allowRemote,false);assert.throws(()=>validateConfig({...base,retrieval:{maximumCalls:0}}),/maximum_calls/);assert.throws(()=>validateConfig({...base,retrieval:{zgExecutable:'/tmp/zg'}}),/zg_executable/);});

test('adaptive orchestration policy accepts nullable ceilings and rejects unsafe values', () => {
  const base = {schemaVersion: 1 as const, resources: [], providers: [], models: [], modelRouting: {roles: {}}, services: [], lanes: []};
  const config = validateConfig({...base, adaptiveOrchestration: {enabled: true, minimumSamplesForPreference: 3, minimumQualityScore: .7, maxEvidenceAgeDays: 90, policyQualityFloor: .6, maxRouteCost: null, maxRouteLatencyMs: null, qualityWeight: .5, reliabilityWeight: .2, costWeight: .15, latencyWeight: .1, confidenceWeight: .05, explorationRate: .1}});
  assert.equal(config.adaptiveOrchestration?.maxRouteCost, null);
  assert.equal(config.adaptiveOrchestration?.maxRouteLatencyMs, null);
  assert.throws(() => validateConfig({...base, adaptiveOrchestration: {maxRouteCost: -1}}), /adaptive_orchestration_cost/);
  assert.throws(() => validateConfig({...base, adaptiveOrchestration: {maxRouteLatencyMs: 86_400_001}}), /adaptive_orchestration_latency/);
});

test('cache-aware expert decay and compatibility policy is provider-neutral and ordered', () => {
  const base={schemaVersion:1 as const,resources:[],providers:[],models:[],modelRouting:{roles:{}},services:[],lanes:[]};
  const config=validateConfig({...base,cacheAwareExperts:{enabled:true,hotMinutes:5,warmMinutes:30,expiryMinutes:120,hotReuseRatio:.8,minimumReuseRatio:.3,highCompatibilityMaximumDelta:.2,partialCompatibilityMaximumDelta:.5,maximumScoreBonus:.1,allowDerivedPreference:false}});
  assert.equal(config.cacheAwareExperts?.warmMinutes,30);assert.equal(config.cacheAwareExperts?.allowDerivedPreference,false);
  assert.throws(()=>validateConfig({...base,cacheAwareExperts:{hotMinutes:60,warmMinutes:30}}),/lifecycle_order/);
  assert.throws(()=>validateConfig({...base,cacheAwareExperts:{highCompatibilityMaximumDelta:.8,partialCompatibilityMaximumDelta:.5}}),/compatibility_order/);
  assert.throws(()=>validateConfig({...base,cacheAwareExperts:{maximumScoreBonus:2}}),/maximumScoreBonus/);
});

test('learned skill policy is opt-in for routing and bounded independently of training framework',()=>{
  const base={schemaVersion:1 as const,resources:[],providers:[],models:[],modelRouting:{roles:{}},services:[],lanes:[]};
  const config=validateConfig({...base,learnedSkills:{enabled:true,routingEnabled:false,minimumImprovement:.15,maximumQualificationAgeDays:60,requireHumanDatasetApproval:true}});
  assert.equal(config.learnedSkills?.routingEnabled,false);assert.equal(config.learnedSkills?.minimumImprovement,.15);
  assert.throws(()=>validateConfig({...base,learnedSkills:{minimumImprovement:1.1}}),/minimum_improvement/);
  assert.throws(()=>validateConfig({...base,learnedSkills:{maximumQualificationAgeDays:0}}),/maximum_qualification_age_days/);
  assert.throws(()=>validateConfig({...base,learnedSkills:{routingEnabled:'yes'}}),/routingEnabled/);
});

test('deterministic skill promotion policy requires repeated evidence and conservative routing',()=>{
  const base={schemaVersion:1 as const,resources:[],providers:[],models:[],modelRouting:{roles:{}},services:[],lanes:[]};
  const config=validateConfig({...base,deterministicSkills:{enabled:true,routingEnabled:false,minimumDistinctParcels:3,maximumValidationAgeDays:90}});
  assert.equal(config.deterministicSkills?.routingEnabled,false);assert.equal(config.deterministicSkills?.minimumDistinctParcels,3);
  assert.throws(()=>validateConfig({...base,deterministicSkills:{minimumDistinctParcels:1}}),/minimum_distinct_parcels/);
  assert.throws(()=>validateConfig({...base,deterministicSkills:{routingEnabled:'yes'}}),/routingEnabled/);
});

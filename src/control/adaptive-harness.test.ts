import assert from 'node:assert/strict';
import test from 'node:test';
import {AdaptiveHarness, SkillCatalog, ToolPolicy, type HarnessCandidate, type RecipeRequest, type SkillDefinition, type ToolDefinition} from './adaptive-harness.js';
import type {RouteCandidate} from './economic-routing.js';
import {configuredHarnessProfiles, ContextPacketBuilder, HarnessProfileRouter} from './harness-efficiency.js';

const skills: SkillDefinition[] = [
  {id: 'typescript-debugging', version: '1', status: 'qualified', capabilities: ['typescript.integration-debug'], requiredTools: ['repository.read', 'repository.edit', 'test.run'], qualificationEvidence: ['suite:skill-typescript-debugging-v1']},
  {id: 'unreviewed-deployment', version: '1', status: 'proposed', capabilities: ['production.deploy'], requiredTools: ['production.deploy'], qualificationEvidence: []},
];
const tools: ToolDefinition[] = [
  {id: 'repository.read', risk: 'read', capabilities: ['repository.read']},
  {id: 'repository.edit', risk: 'write', capabilities: ['repository.write']},
  {id: 'test.run', risk: 'write', capabilities: ['test.execute']},
  {id: 'browser.read', risk: 'read', capabilities: ['browser.read']},
  {id: 'production.deploy', risk: 'privileged', capabilities: ['production.deploy']},
];

function route(id: string, local: boolean, minutes: number, fixedCost: number, capabilities: string[]): RouteCandidate {
  return {
    id, providerId: `provider-${id}`, modelId: `model-${id}`, workerId: `worker-${id}`, local,
    health: 'healthy', qualified: true, qualificationReason: 'qualified fixture', capabilities,
    pricing: {currency: 'TEST', billing: fixedCost ? 'metered' : 'free', inputPerMillionTokens: 0, outputPerMillionTokens: 0, fixedPerRequest: fixedCost, effectiveFrom: '2026-08-24'},
    performance: {startupLatencyMs: minutes * 60_000, inputTokensPerSecond: 1_000_000, outputTokensPerSecond: 1_000_000, historicalSuccessRate: local ? .88 : .98, expectedQuality: local ? .78 : .95, confidence: local ? .76 : .95, contextLimitTokens: 64_000, source: 'measured', sampleSize: 20},
  };
}

const small: HarnessCandidate = {
  route: route('small-local', true, 20, 0, ['coding']), workerCapabilities: ['git'], modelCapabilities: ['coding'],
  promptProfiles: [{id: 'guided-debug', version: '1', description: 'Sequential diagnosis with explicit evidence'}],
  availableSkillIds: ['typescript-debugging'], availableToolIds: ['repository.read', 'repository.edit', 'test.run'], runtime: {temperature: 0.1, maxTokens: 6000},
};
const frontier: HarnessCandidate = {
  route: route('frontier-api', false, 1, .4, ['coding', 'typescript.integration-debug']), workerCapabilities: ['git'], modelCapabilities: ['coding', 'typescript.integration-debug'],
  promptProfiles: [{id: 'direct-expert', version: '2', description: 'Direct expert execution'}],
  availableSkillIds: [], availableToolIds: ['repository.read', 'repository.edit', 'test.run', 'browser.read'], runtime: {reasoning: 'high'},
};

function request(intent: RecipeRequest['intent']): RecipeRequest {
  return {
    taskId: 'task-debug-1', taskType: 'code.debug', requiredCapabilities: ['typescript.integration-debug'],
    requiredTools: ['repository.read', 'repository.edit', 'test.run'], deniedTools: ['production.deploy'], approvedRisks: ['read', 'write'],
    intent, inputTokens: 2000, outputTokens: 2000, meteredApproved: true,
    context: {tier: 2, sourceIds: [], evidenceIds: ['test:failing-integration'], estimatedTokens: 1200},
    authority: {laneId: 'lane-1', leaseGeneration: 7, ownershipGeneration: 11, owner: 'agent'},
    verification: {requiredEvidence: ['git_diff', 'test_result'], requireIndependentCheck: true},
    escalation: {minimumConfidence: .7, maximumAttempts: 2, onFailure: 'reroute'},
  };
}

const harness = () => new AdaptiveHarness(new SkillCatalog(skills), new ToolPolicy(tools));

test('same task receives different qualified harness recipes by execution intent', () => {
  const urgent = harness().build(request('URGENT'), [small, frontier]).recipe;
  const economy = harness().build(request('ECONOMY'), [small, frontier]).recipe;
  assert.equal(urgent?.modelId, 'model-frontier-api');
  assert.deepEqual(urgent?.skills, []);
  assert.equal(urgent?.promptProfile.id, 'direct-expert');
  assert.equal(economy?.modelId, 'model-small-local');
  assert.deepEqual(economy?.skills.map(skill => skill.id), ['typescript-debugging']);
  assert.equal(economy?.promptProfile.id, 'guided-debug');
  assert.deepEqual(economy?.tools.map(tool => tool.id).sort(), ['repository.edit', 'repository.read', 'test.run']);
  assert.deepEqual(economy?.verification, urgent?.verification);
  assert.deepEqual(economy?.authority, urgent?.authority);
});

test('smaller model raw is unqualified while the same model with qualified scaffolding is routable', () => {
  const raw = harness().build(request('ECONOMY'), [{...small, availableSkillIds: []}]);
  assert.equal(raw.recipe, undefined);
  assert.match(raw.route.reason, /no_route_passed/);
  const scaffolded = harness().build(request('ECONOMY'), [small]);
  assert.equal(scaffolded.recipe?.modelId, 'model-small-local');
  assert.deepEqual(scaffolded.recipe?.skills.map(skill => skill.id), ['typescript-debugging']);
  assert.equal(scaffolded.recipe?.verification.requiredEvidence.includes('test_result'), true);
});

test('proposed skill cannot grant its capability or privileged tool to itself', () => {
  const proposalTask: RecipeRequest = {...request('NORMAL'), requiredCapabilities: ['production.deploy'], requiredTools: ['production.deploy'], approvedRisks: ['read', 'write', 'privileged']};
  const candidate = {...small, availableSkillIds: ['unreviewed-deployment'], availableToolIds: [...small.availableToolIds, 'production.deploy']};
  const result = harness().build(proposalTask, [candidate]);
  assert.equal(result.recipe, undefined);
  assert.ok(result.rejected[0].reasons.some(reason => reason.includes('capabilities_unresolved')));
});

test('tool gate enforces recipe grants and stale authority fails closed', () => {
  const toolPolicy = new ToolPolicy(tools), recipe = new AdaptiveHarness(new SkillCatalog(skills), toolPolicy).build(request('ECONOMY'), [small]).recipe!;
  assert.deepEqual(toolPolicy.authorize(recipe, 'repository.edit', recipe.authority), {allowed: true});
  assert.deepEqual(toolPolicy.authorize(recipe, 'production.deploy', recipe.authority), {allowed: false, reason: 'tool_not_granted'});
  assert.deepEqual(toolPolicy.authorize(recipe, 'repository.edit', {...recipe.authority, leaseGeneration: 6}), {allowed: false, reason: 'stale_lease_generation'});
});

test('unconditional human takeover fences every recipe tool immediately', () => {
  const toolPolicy = new ToolPolicy(tools), recipe = new AdaptiveHarness(new SkillCatalog(skills), toolPolicy).build(request('ECONOMY'), [small]).recipe!;
  const humanAuthority = {...recipe.authority, ownershipGeneration: recipe.authority.ownershipGeneration + 1, owner: 'human' as const};
  assert.equal(toolPolicy.authorize(recipe, 'repository.read', humanAuthority).allowed, false);
  assert.equal(toolPolicy.authorize(recipe, 'repository.edit', humanAuthority).allowed, false);
  assert.equal(toolPolicy.authorize(recipe, 'test.run', humanAuthority).allowed, false);
  const humanOwned = harness().build({...request('ECONOMY'), authority: humanAuthority}, [small]);
  assert.equal(humanOwned.recipe, undefined);
});

test('live capability, policy, worker and privilege changes fence retained recipes', () => {
  const policy = new ToolPolicy(tools), recipe = new AdaptiveHarness(new SkillCatalog(skills), policy).build(request('ECONOMY'), [small]).recipe!;
  assert.equal(policy.authorize(recipe, 'repository.read', {authority: recipe.authority, revokedToolIds: ['repository.read']}).reason, 'tool_revoked');
  assert.equal(policy.authorize(recipe, 'repository.read', {authority: recipe.authority, availableToolIds: []}).reason, 'capability_unavailable');
  assert.equal(policy.authorize(recipe, 'repository.read', {authority: recipe.authority, workerId: 'different-worker'}).reason, 'worker_incompatible');
  assert.equal(policy.authorize(recipe, 'repository.read', {authority: recipe.authority, policyDeniedToolIds: ['repository.read']}).reason, 'policy_restricted');
  assert.equal(policy.authorize(recipe, 'repository.edit', {authority: recipe.authority, approvedRisks: ['read']}).reason, 'privilege_not_approved');
});

test('secret-like runtime settings fail closed before recipe fingerprinting', () => {
  const unsafe = harness().build(request('ECONOMY'), [{...small, runtime: {...small.runtime, api_key: 'must-not-enter-recipe'}}]);
  assert.equal(unsafe.recipe, undefined);
  assert.equal(unsafe.rejected[0].reasons.includes('secret_like_runtime_key:api_key'), true);
});

test('recipe fingerprint changes with prompt, context, skills, tools or runtime settings', () => {
  const base = harness().build(request('ECONOMY'), [small]).recipe!;
  const changed = harness().build({...request('ECONOMY'), context: {...request('ECONOMY').context, tier: 3}}, [small]).recipe!;
  assert.notEqual(base.fingerprint, changed.fingerprint);
  assert.match(base.id, /^recipe-[0-9a-f]{16}$/);
});

test('execution recipe preserves the selected account profile as route identity', () => {
  const candidate = {...small, route: {...small.route, accountProfileId: 'lawrence-pro'}};
  const recipe = harness().build(request('ECONOMY'), [candidate]).recipe!;
  assert.equal(recipe.providerId, 'provider-small-local');
  assert.equal(recipe.accountProfileId, 'lawrence-pro');
  assert.equal(recipe.modelId, 'model-small-local');
  assert.notEqual(recipe.fingerprint, harness().build(request('ECONOMY'), [small]).recipe!.fingerprint);
});

test('qualified harness profile and context packet become inspectable recipe identity', () => {
  const profileRouter = new HarnessProfileRouter({mode: 'ENFORCE', minimumVerifiedRuns: 5, minimumSuccessRate: .9, minimumSameModelControlledRuns: 5});
  const adaptive = new AdaptiveHarness(new SkillCatalog(skills), new ToolPolicy(tools), undefined, profileRouter);
  const contextPacket = new ContextPacketBuilder().build('THIN', [
    {id: 'policy', kind: 'agent_control_instructions', content: 'retain approvals and verification', required: true, persistent: true, relevance: 1, provenanceIds: ['policy:v1']},
    {id: 'target', kind: 'task_context', content: 'src/exact.ts:12', required: true, relevance: 1, provenanceIds: ['source:target']},
  ]);
  const result = adaptive.build({...request('ECONOMY'), contextPacket, contextStrategyId: 'exact-symbol', harnessRouting: {taskId: 'task-debug-1', complexity: .2, risk: 'low', knownExactTargets: true, estimatedFiles: 1, deterministicVerifier: true, ambiguity: .1, architectural: false, evidence: {THIN: {verifiedRuns: 8, verifiedSuccessRate: 1, sameModelControlledRuns: 8, productionQualified: true}}}}, [{...small, supportedHarnessProfiles: ['THIN', 'STANDARD']}]);
  assert.equal(result.recipe?.harness?.profile, 'THIN');
  assert.equal(result.recipe?.harness?.maximumTurns, 3);
  assert.equal(result.recipe?.harness?.contextStrategyId, 'exact-symbol');
  assert.equal(result.recipe?.context.packetId, contextPacket.id);
  assert.deepEqual(result.recipe?.context.provenanceIds, ['policy:v1', 'source:target']);
});

test('candidate lacking the selected harness capability is rejected', () => {
  const profileRouter = new HarnessProfileRouter({mode: 'ENFORCE', minimumVerifiedRuns: 1, minimumSuccessRate: .8, minimumSameModelControlledRuns: 1});
  const adaptive = new AdaptiveHarness(new SkillCatalog(skills), new ToolPolicy(tools), undefined, profileRouter);
  const result = adaptive.build({...request('ECONOMY'), harnessRouting: {taskId: 'task-debug-1', complexity: .2, risk: 'low', knownExactTargets: true, estimatedFiles: 1, deterministicVerifier: true, ambiguity: .1, architectural: false, evidence: {THIN: {verifiedRuns: 2, verifiedSuccessRate: 1, sameModelControlledRuns: 2, productionQualified: true}}}}, [{...small, supportedHarnessProfiles: ['STANDARD']}]);
  assert.equal(result.recipe, undefined);
  assert.ok(result.rejected[0].reasons.includes('harness_profile_unsupported:THIN'));
});

test('AdaptiveHarness enforces configured profile budgets instead of default ceilings', () => {
  const profiles = configuredHarnessProfiles({profiles: {STANDARD: {maximumInitialContextTokens: 1_000}}});
  const adaptive = new AdaptiveHarness(new SkillCatalog(skills), new ToolPolicy(tools), undefined, new HarnessProfileRouter(), profiles);
  const result = adaptive.build({...request('ECONOMY'), harnessRouting: {taskId: 'configured-budget', complexity: .5, risk: 'medium', knownExactTargets: false, estimatedFiles: 3, deterministicVerifier: true, ambiguity: .4, architectural: false}}, [small]);
  assert.equal(result.recipe, undefined);
  assert.ok(result.rejected[0].reasons.includes('harness_context_budget_exceeded:1200:1000'));
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {AdaptiveHarness, SkillCatalog, ToolPolicy, type HarnessCandidate, type RecipeRequest, type ToolDefinition} from './adaptive-harness.js';
import {WorkCoordinator} from './work-coordinator.js';
import {
  AdaptiveWorkDispatch,
  FileRecipeDispatchStore,
  HarnessDispatcher,
  HarnessJobAgentAction,
  MemoryRecipeDispatchStore,
  ToolHandlerRegistry,
  type ToolPolicyAuditEvent,
} from './harness-dispatch.js';
import {WorkExecutor} from './work-executor.js';
import {WorkQueue, type WorkItem} from './work-queue.js';
import {configuredHarnessProfiles, createInvocationObservation, MemoryHarnessEfficiencyLedger} from './harness-efficiency.js';

const toolDefinitions: ToolDefinition[] = [
  {id: 'repository.read', risk: 'read', capabilities: ['repository.read']},
  {id: 'repository.edit', risk: 'write', capabilities: ['repository.write']},
  {id: 'browser.read', risk: 'read', capabilities: ['browser.read']},
];
const toolPolicy = () => new ToolPolicy(toolDefinitions);
const authority = {laneId: 'lane-1', leaseGeneration: 4, ownershipGeneration: 8, owner: 'agent' as const};
const candidate: HarnessCandidate = {
  route: {
    id: 'route-1', providerId: 'provider-1', modelId: 'model-1', workerId: 'worker-1', local: true,
    health: 'healthy', qualified: true, qualificationReason: 'fixture-qualified', capabilities: ['coding'],
    pricing: {currency: 'TEST', billing: 'free', inputPerMillionTokens: 0, outputPerMillionTokens: 0, fixedPerRequest: 0, effectiveFrom: '2026-08-24'},
    performance: {startupLatencyMs: 1, inputTokensPerSecond: 1000, outputTokensPerSecond: 1000, historicalSuccessRate: .99, expectedQuality: .9, confidence: .95, contextLimitTokens: 32000, source: 'measured', sampleSize: 10},
  },
  workerCapabilities: ['git'], modelCapabilities: ['coding'],
  promptProfiles: [{id: 'safe-code', version: '1', description: 'fixture'}],
  availableSkillIds: [], availableToolIds: ['repository.read', 'repository.edit'], runtime: {temperature: 0},
};
const request = (): RecipeRequest => ({
  taskId: 'task-1', taskType: 'code', requiredCapabilities: ['coding'], requiredTools: ['repository.read'], approvedRisks: ['read'],
  intent: 'NORMAL', inputTokens: 100, outputTokens: 100,
  context: {tier: 2, sourceIds: ['baton-1'], evidenceIds: ['test-1'], estimatedTokens: 50},
  authority: {...authority}, verification: {requiredEvidence: ['test_result'], requireIndependentCheck: true},
  escalation: {minimumConfidence: .7, maximumAttempts: 2, onFailure: 'review'},
});
const plan = () => ({request: request(), candidates: [candidate], placement: {workerId: 'worker-1', reason: 'scheduler selected capability-compatible worker'}});

test('default dispatch builds an inspectable recipe and only exposes policy-gated tools', async () => {
  const policy = toolPolicy(), store = new MemoryRecipeDispatchStore(), audits: ToolPolicyAuditEvent[] = [];
  const handlers = new ToolHandlerRegistry().register('repository.read', async input => ({read: input}));
  const dispatcher = new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(), policy), policy, handlers, () => ({authority: {...authority}, workerId: 'worker-1', availableToolIds: ['repository.read']}), store, event => audits.push(event));
  const result = await dispatcher.dispatch(plan(), {execute: async (recipe, tools) => ({resultRef: JSON.stringify(await tools.invoke('repository.read', recipe.taskId))})});
  assert.equal(result.accepted, false);
  assert.match(result.recipe.id, /^recipe-/);
  assert.equal(store.get(result.recipe.id)?.phase, 'EXECUTED');
  assert.equal(store.get(result.recipe.id)?.workerPlacement.reason.includes('scheduler'), true);
  assert.deepEqual(audits.map(event => [event.toolId, event.allowed]), [['repository.read', true]]);
});

test('tool omitted from recipe cannot reach its raw handler', async () => {
  const policy = toolPolicy();
  let bypassed = false;
  const handlers = new ToolHandlerRegistry()
    .register('repository.read', async () => 'ok')
    .register('repository.edit', async () => { bypassed = true; });
  const dispatcher = new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(), policy), policy, handlers, () => ({authority: {...authority}, workerId: 'worker-1'}));
  await assert.rejects(() => dispatcher.dispatch(plan(), {execute: async (_recipe, tools) => ({resultRef: String(await tools.invoke('repository.edit'))})}), /tool_policy_denied:tool_not_granted/);
  assert.equal(bypassed, false);
});

test('live ownership change immediately fences a retained recipe gateway', async () => {
  const policy = toolPolicy();
  let live: RecipeRequest['authority'] = {...authority};
  let calls = 0;
  const handlers = new ToolHandlerRegistry().register('repository.read', async () => ++calls);
  const dispatcher = new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(), policy), policy, handlers, () => ({authority: {...live}, workerId: 'worker-1'}));
  await assert.rejects(() => dispatcher.dispatch(plan(), {execute: async (_recipe, tools) => {
    await tools.invoke('repository.read');
    live = {...live, ownershipGeneration: 9, owner: 'human'};
    await tools.invoke('repository.read');
    return {};
  }}), /tool_policy_denied:human_owns_execution/);
  assert.equal(calls, 1);
});

test('recipe identity survives store restart without granting stale authority', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-recipes-'));
  const file = path.join(directory, 'recipes.json');
  try {
    const policy = toolPolicy(), firstStore = new FileRecipeDispatchStore(file);
    const handlers = new ToolHandlerRegistry().register('repository.read', async () => 'ok');
    const dispatcher = new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(), policy), policy, handlers, () => ({authority: {...authority}, workerId: 'worker-1'}), firstStore);
    const result = await dispatcher.dispatch(plan(), {execute: async (_recipe, tools) => ({resultRef: String(await tools.invoke('repository.read'))})});
    const restored = new FileRecipeDispatchStore(file).get(result.recipe.id);
    assert.equal(restored?.fingerprint, result.recipe.fingerprint);
    assert.equal(policy.authorize(result.recipe, 'repository.read', {...authority, leaseGeneration: 5}).reason, 'stale_lease_generation');
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('stale ownership generation denies the retained live recipe before its handler', async () => {
  const policy = toolPolicy();
  let calls = 0;
  const handlers = new ToolHandlerRegistry().register('repository.read', async () => ++calls);
  const dispatcher = new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(), policy), policy, handlers, () => ({authority: {...authority, ownershipGeneration: authority.ownershipGeneration + 1}, workerId: 'worker-1'}));
  await assert.rejects(() => dispatcher.dispatch(plan(), {execute: async (_recipe, tools) => ({resultRef: String(await tools.invoke('repository.read'))})}), /tool_policy_denied:stale_ownership_generation/);
  assert.equal(calls, 0);
});

test('dispatch fails closed when an executor exceeds the configured turn budget', async () => {
  const policy = toolPolicy(), store = new MemoryRecipeDispatchStore(), efficiency = new MemoryHarnessEfficiencyLedger();
  const profiles = configuredHarnessProfiles({profiles: {STANDARD: {maximumTurns: 1}}});
  const dispatcher = new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(), policy, undefined, undefined, profiles), policy, new ToolHandlerRegistry(), () => ({authority: {...authority}, workerId: 'worker-1'}), store, undefined, undefined, efficiency);
  const invocation = (id: string) => createInvocationObservation({id, jobId: 'job-turn-budget', taskId: 'task-1', laneId: 'lane-1', model: 'model-1', provider: 'provider-1', harnessProfile: 'STANDARD', executionStrategy: 'fixture', startedAt: '2026-08-27T10:00:00.000Z', completedAt: '2026-08-27T10:00:01.000Z', recipeFingerprint: 'recipe-turn-budget'});
  await assert.rejects(() => dispatcher.dispatch(plan(), {execute: async () => ({invocations: [invocation('turn-1'), invocation('turn-2')]})}), /harness_turn_budget_exceeded:2:1/);
  assert.equal(efficiency.list().length, 2);
  assert.equal(store.list()[0].phase, 'FAILED');
});

test('non-streaming dispatch exposes canonical provider identity while pending and reconciles completion', async () => {
  const policy = toolPolicy(), efficiency = new MemoryHarnessEfficiencyLedger();
  const dispatcher = new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(), policy), policy, new ToolHandlerRegistry(), () => ({authority: {...authority}, workerId: 'worker-1'}), undefined, undefined, undefined, efficiency);
  let complete!: (value: {invocations: ReturnType<typeof createInvocationObservation>[]}) => void;
  const pending = dispatcher.dispatch({...plan(), request: {...request(), jobId: 'job-live', runId: 'run-live', stepId: 'review', taskId: 'run-live:review'}}, {execute: async (_recipe, tools) => { tools.lifecycle?.('waiting for provider'); return new Promise(resolve => { complete = resolve; }); }});
  await new Promise(resolve => setImmediate(resolve));
  const running = efficiency.list()[0];
  assert.equal(running.state, 'RUNNING');
  assert.equal(running.phase, 'waiting for provider');
  assert.equal(running.provider, 'provider-1');
  assert.equal(running.model, 'model-1');
  assert.equal(running.runId, 'run-live');
  assert.equal(running.stepId, 'review');
  assert.equal(running.completedAt, null);
  assert.equal(running.usage.totalProcessedTokens, null);
  complete({invocations: [createInvocationObservation({jobId: 'job-live', runId: 'run-live', stepId: 'review', taskId: 'run-live:review', laneId: 'lane-1', model: 'model-1', provider: 'provider-1', harnessProfile: 'STANDARD', executionStrategy: 'fixture-non-streaming', startedAt: running.startedAt, completedAt: new Date(Date.parse(running.startedAt) + 1500).toISOString(), rawUsage: {input_tokens: 10, output_tokens: 2, total_tokens: 12}, providerReportedCost: .01, recipeFingerprint: running.provenance.recipeFingerprint})]});
  const result = await pending, completed = efficiency.list()[0];
  assert.deepEqual(result.invocationIds, [running.id]);
  assert.equal(completed.state, 'COMPLETE');
  assert.equal(completed.elapsedMs, 1500);
  assert.equal(completed.usage.totalProcessedTokens, 12);
  assert.equal(completed.providerReportedCost, .01);
  assert.equal(completed.usageSource, 'provider-reported');
  assert.equal(completed.costSource, 'reported');
});

test('multi-turn executor exposes PROCESSING before provider completion', async () => {
  const policy = toolPolicy(), efficiency = new MemoryHarnessEfficiencyLedger();
  const dispatcher = new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(), policy), policy, new ToolHandlerRegistry(), () => ({authority: {...authority}, workerId: 'worker-1'}), undefined, undefined, undefined, efficiency);
  let finish!: () => void;
  const pending = dispatcher.dispatch({...plan(), request: {...request(), jobId: 'job-two-turn', runId: 'run-two-turn', stepId: 'review'}}, {execute: async (recipe, tools) => {
    tools.lifecycle?.('waiting for provider');
    await Promise.resolve();
    tools.lifecycle?.('processing');
    await new Promise<void>(resolve => { finish = resolve; });
    const startedAt = efficiency.list()[0].startedAt;
    return {invocations: [createInvocationObservation({jobId: 'job-two-turn', runId: 'run-two-turn', stepId: 'review', taskId: recipe.taskId, laneId: recipe.authority.laneId, model: recipe.modelId, provider: recipe.providerId, harnessProfile: 'STANDARD', executionStrategy: 'two-turn-fixture', startedAt, completedAt: new Date(Date.parse(startedAt) + 1000).toISOString(), phase: 'processing', recipeFingerprint: recipe.fingerprint})]};
  }});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(efficiency.list()[0].phase, 'processing');
  assert.ok(efficiency.list()[0].phaseUpdatedAt);
  finish(); await pending;
  assert.equal(efficiency.list()[0].state, 'COMPLETE');
});

test('foreign retained invocation ids cannot orphan the dispatcher pending record', async () => {
  const policy=toolPolicy(), efficiency=new MemoryHarnessEfficiencyLedger();
  const dispatcher=new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(),policy),policy,new ToolHandlerRegistry(),()=>({authority:{...authority},workerId:'worker-1'}),undefined,undefined,undefined,efficiency);
  const failure=Object.assign(new Error('executor_foreign_invocation_failure'),{efficiencyInvocationIds:['foreign-id']});
  await assert.rejects(dispatcher.dispatch({...plan(),request:{...request(),jobId:'job-orphan',runId:'run-orphan',stepId:'review'}},{execute:async()=>{throw failure}}),/executor_foreign_invocation_failure/);
  assert.equal(efficiency.list().filter(item=>item.state==='RUNNING').length,0); assert.equal(efficiency.list()[0].state,'FAILED');
});

test('WorkExecutor normal agent path requires AdaptiveHarness and stops at verification', async () => {
  const policy = toolPolicy(), handlers = new ToolHandlerRegistry().register('repository.read', async () => 'read');
  const dispatcher = new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(), policy), policy, handlers, () => ({authority: {...authority}, workerId: 'worker-1'}));
  const adaptive = new AdaptiveWorkDispatch(dispatcher, async work => ({
    plan: {...plan(), request: {...request(), taskId: work.id}},
    executor: {execute: async (_recipe, tools) => ({resultRef: String(await tools.invoke('repository.read'))})},
  }));
  const queue = new WorkQueue();
  const work: WorkItem = {id: 'task-queue', type: 'code', class: 'priority', status: 'queued', capabilities: {requires: [{id: 'coding'}]}, createdAt: new Date().toISOString(), batchable: false, preemptible: true, dependsOn: [], attempts: 0, maxAttempts: 1};
  queue.enqueue(work);
  const executor = new WorkExecutor(new WorkCoordinator(queue), adaptive);
  const resource = {id: 'worker-1', type: 'host' as const, health: 'healthy' as const, capabilities: [{id: 'coding', kind: 'harness' as const}]};
  const event = await executor.step([resource], [{resourceId: 'worker-1', busy: 0, capacity: 1}]);
  assert.equal(event.kind, 'verification');
  assert.equal(queue.get(work.id)?.status, 'verification-pending');
});

test('independent-check policy rejects model action self-attestation', async () => {
  const policy = toolPolicy(), dispatcher = new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(), policy), policy, new ToolHandlerRegistry(), () => ({authority: {...authority}, workerId: 'worker-1'}));
  const action = new HarnessJobAgentAction(dispatcher, async () => ({plan: plan(), executor: {execute: async () => ({resultRef: 'model output'})}, toActionOutput: () => ({verification: ['test_result']})}));
  const context = {run: {id: 'run-independent', jobId: 'job-independent'}, step: {id: 'review'}, worker: {id: 'worker-1'}, parameters: {}, inputArtifacts: []} as never;
  await assert.rejects(action.execute(context), /independent_check_required:agent_action_cannot_self_attest/);
});

test('agent action cannot disable its independent verification boundary', async () => {
  const policy = toolPolicy(), dispatcher = new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(), policy), policy, new ToolHandlerRegistry(), () => ({authority: {...authority}, workerId: 'worker-1'}));
  const action = new HarnessJobAgentAction(dispatcher, async () => { const prepared=plan(); return {plan:{...prepared,request:{...prepared.request,verification:{...prepared.request.verification,requireIndependentCheck:false}}},executor:{execute:async()=>({resultRef:'model output'})}}; });
  const context = {run: {id: 'run-boundary', jobId: 'job-boundary'}, step: {id: 'review'}, worker: {id: 'worker-1'}, parameters: {}, inputArtifacts: []} as never;
  await assert.rejects(action.execute(context), /agent_action_independent_check_required/);
});

for (const revoked of ['takeover', 'cancel'] as const) test('authority revocation during audit prevents raw handler: ' + revoked, async () => {
  const policy = toolPolicy(), controller = new AbortController(); let live = {...authority}, calls = 0;
  const handlers = new ToolHandlerRegistry().register('repository.read', async () => ++calls);
  const dispatcher = new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(), policy), policy, handlers, () => ({authority: {...live}, workerId: 'worker-1'}), undefined, () => { if (revoked === 'cancel') controller.abort(new Error('cancelled-in-audit')); else live.ownershipGeneration++; });
  await assert.rejects(() => dispatcher.dispatch(plan(), {execute: async (_recipe, tools) => ({resultRef: String(await tools.invoke('repository.read'))})}, controller.signal), /cancelled-in-audit|execution_authority_revoked/);
  assert.equal(calls, 0);
});

test('authority revoked while a typed handler runs prevents its result from being accepted', async () => {
 const policy=toolPolicy();let live={...authority},accepted=false;
 const handlers=new ToolHandlerRegistry().register('repository.read',async()=>{await Promise.resolve();live.ownershipGeneration++;return 'stale-result';});
 const dispatcher=new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(),policy),policy,handlers,()=>({authority:{...live},workerId:'worker-1'}));
 await assert.rejects(()=>dispatcher.dispatch(plan(),{execute:async(_recipe,tools)=>{await tools.invoke('repository.read');accepted=true;return {};}}),/execution_authority_revoked/);assert.equal(accepted,false);
});

for(const mode of ['takeover','cancel'] as const)test('raw async handler receives live effect-boundary control: '+mode,async()=>{
 const policy=toolPolicy(),controller=new AbortController();let live={...authority},began!:()=>void,release!:()=>void,mutated=false;const started=new Promise<void>(r=>{began=r;}),wait=new Promise<void>(r=>{release=r;});
 const handlers=new ToolHandlerRegistry().register('repository.read',async(_input,_recipe,control)=>{began();await wait;control.assertActive();mutated=true;return 'effect';});
 const dispatcher=new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(),policy),policy,handlers,()=>({authority:{...live},workerId:'worker-1'}));
 const pending=dispatcher.dispatch(plan(),{execute:async(_recipe,tools)=>({resultRef:String(await tools.invoke('repository.read'))})},controller.signal);await started;if(mode==='cancel')controller.abort(new Error('cancel-at-effect-boundary'));else live.ownershipGeneration++;release();await assert.rejects(pending,/cancel-at-effect-boundary|execution_authority_revoked/);assert.equal(mutated,false);
});

for(const mode of ['takeover','cancel'] as const)test('async result interceptors receive live effect-boundary control: '+mode,async()=>{
 const policy=toolPolicy(),controller=new AbortController();let live={...authority},began!:()=>void,release!:()=>void,effects=0,later=0;const started=new Promise<void>(r=>{began=r;}),wait=new Promise<void>(r=>{release=r;});
 const handlers=new ToolHandlerRegistry([async({result,control})=>{began();await wait;control.assertActive();effects++;return result;},async({result})=>{later++;return result;}]).register('repository.read',async()=> 'raw');
 const dispatcher=new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(),policy),policy,handlers,()=>({authority:{...live},workerId:'worker-1'}));const pending=dispatcher.dispatch(plan(),{execute:async(_recipe,tools)=>({resultRef:String(await tools.invoke('repository.read'))})},controller.signal);await started;if(mode==='cancel')controller.abort(new Error('interceptor-cancelled'));else live.ownershipGeneration++;release();await assert.rejects(pending,/interceptor-cancelled|execution_authority_revoked/);assert.equal(effects,0);assert.equal(later,0);
});

test('typed tool registry fails closed when a caller omits execution control',async()=>{let effects=0;const registry=new ToolHandlerRegistry().register('repository.write',async()=>{effects++;return {};});await assert.rejects(()=>registry.invoke('repository.write',{},{} as never,undefined as never),/tool_execution_control_required/);assert.equal(effects,0);});

test('governed tool deadline aborts a stalled tool independently from model budget', async () => {
  const policy = toolPolicy(), handlers = new ToolHandlerRegistry().register('repository.read', async (_input,_recipe,control) => await new Promise((_resolve,reject) => control.signal?.addEventListener('abort',()=>reject(control.signal?.reason),{once:true})));
  const dispatcher = new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(), policy), policy, handlers, () => ({authority: {...authority}, workerId: 'worker-1'}));
  const governedPlan = plan(); governedPlan.request.runtimeBudget={absoluteJobDeadlineMs:10_000,modelCallDeadlineMs:2_000,toolCallDeadlineMs:100,noProgressDeadlineMs:1_000,verificationReserveMs:100,cleanupReserveMs:100,terminalCompletionTurns:0};
  governedPlan.candidates[0]={...governedPlan.candidates[0],runtime:{...governedPlan.candidates[0].runtime,p95ModelCallMs:1_000}};
  await assert.rejects(()=>dispatcher.dispatch(governedPlan,{execute:async(_recipe,tools)=>({resultRef:String(await tools.invoke('repository.read'))})}),/TOOL_DEADLINE_EXCEEDED/);
});

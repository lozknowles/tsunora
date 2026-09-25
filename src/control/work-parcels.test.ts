import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {JobCatalog} from './job-catalog.js';
import {ActionFailure, ActionRegistry, ArtifactStore, JobRuntime, ResourceLockManager, RunLedger, WorkerRegistry} from './job-runtime.js';
import type {JobDefinition} from './job-types.js';
import {createInvocationObservation, MemoryHarnessEfficiencyLedger} from './harness-efficiency.js';
import {CatalogNaturalLanguagePlanner, explainParcelDecision, ReasoningModelWorkParcelPlanner, validateWorkParcelPlan, WorkParcelCoordinator, WorkParcelStore, type WorkParcel, type WorkParcelPlan} from './work-parcels.js';
import type {SystemReadiness} from './system-readiness.js';
import {ModelRegistry} from './model-registry.js';
import {governedRequestOrigin} from './request-origin.js';
import {AdaptiveOrchestrationRuntime, FileAdaptiveOrchestrationStore} from './adaptive-orchestration.js';
import {CacheAwareExpertRuntime, FileCacheExpertStore} from './cache-aware-expert.js';

const job = (id: string, action: string, output = true): JobDefinition => ({apiVersion: 'agent-control/v1', kind: 'Job', metadata: {id, name: id, version: '1.0.0'}, spec: {priority: 'normal', concurrency: 'queue', steps: [{id: 'work', action, requires: ['qualification.local'], outputs: output ? [{name: 'result', type: 'application/json', schema: `${id}/v1`, version: '1.0.0'}] : undefined, verification: output ? ['passed'] : []}]}});
function setup(failSecond = false, blockFirst = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-parcel-')), actions = new ActionRegistry();
  let releaseFirst = () => {}; const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
  actions.register('one@1.0.0', async () => { if (blockFirst) await firstGate; return {artifacts: [{name: 'result', value: {one: true}}], verification: ['passed']}; });
  actions.register('two@1.0.0', async () => { if (failSecond) throw new ActionFailure('controlled_failure', 'verification'); return {artifacts: [{name: 'result', value: {two: true}}], verification: ['passed']}; });
  actions.register('three@1.0.0', async () => ({artifacts: [{name: 'result', value: {three: true}}], verification: ['passed']}));
  const catalog = new JobCatalog(actions.ids()); for (const [id, action] of [['one-job','one@1.0.0'],['two-job','two@1.0.0'],['three-job','three@1.0.0']]) catalog.addJob(job(id, action));
  const workers = new WorkerRegistry().register({id: 'host', capabilities: ['qualification.local'], health: 'healthy', capacity: 1, active: 0, observedAt: new Date().toISOString()});
  const runtime = new JobRuntime(catalog, actions, workers, new RunLedger(path.join(root, 'runs.json')), new ArtifactStore(path.join(root, 'artifacts')), new ResourceLockManager(path.join(root, 'locks.json')), {approval: () => true});
  const plan: WorkParcelPlan = {objective: 'test objective', planner: {kind: 'reasoning-model', provider: 'test', model: 'planner', reason: 'test'}, stages: [{id: 'one', name: 'One', job: 'one-job@1.0.0'}, {id: 'two', name: 'Two', job: 'two-job@1.0.0', dependsOn: ['one']}, {id: 'three', name: 'Three', job: 'three-job@1.0.0', dependsOn: ['two']}]};
  const planner = {plan: () => plan}, storeFile = path.join(root, 'parcels.json'), coordinator = new WorkParcelCoordinator(runtime, new WorkParcelStore(storeFile), planner);
  return {root, runtime, planner, storeFile, coordinator, plan, releaseFirst};
}

function parallelSetup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-parallel-parcel-')), actions = new ActionRegistry(), started: string[] = [];
  let releaseLeft = () => {}, releaseRight = () => {}; const leftGate = new Promise<void>(resolve => { releaseLeft = resolve; }), rightGate = new Promise<void>(resolve => { releaseRight = resolve; });
  actions.register('left@1.0.0', async () => { started.push('left'); await leftGate; return {artifacts: [{name: 'result', value: {left: true}}], verification: ['passed']}; });
  actions.register('right@1.0.0', async () => { started.push('right'); await rightGate; return {artifacts: [{name: 'result', value: {right: true}}], verification: ['passed']}; });
  actions.register('join@1.0.0', async context => ({artifacts: [{name: 'result', value: {baton: context.run.trigger.parcelContext?.baton?.sha256}}], verification: ['passed']}));
  const catalog = new JobCatalog(actions.ids()); for (const [id, action] of [['left-job','left@1.0.0'],['right-job','right@1.0.0'],['join-job','join@1.0.0']]) catalog.addJob(job(id, action));
  const workers = new WorkerRegistry().register({id: 'host', capabilities: ['qualification.local'], health: 'healthy', capacity: 2, active: 0, observedAt: new Date().toISOString()});
  const runtime = new JobRuntime(catalog, actions, workers, new RunLedger(path.join(root, 'runs.json')), new ArtifactStore(path.join(root, 'artifacts')), new ResourceLockManager(path.join(root, 'locks.json')), {approval: () => true});
  const plan: WorkParcelPlan = {objective: 'planner interpretation of parallel objective', planner: {kind: 'reasoning-model', provider: 'test', model: 'planner', reason: 'independent branches'}, stages: [{id: 'left', name: 'Left', job: 'left-job@1.0.0'}, {id: 'right', name: 'Right', job: 'right-job@1.0.0'}, {id: 'join', name: 'Join', job: 'join-job@1.0.0', dependsOn: ['left','right']}]};
  const planner = {plan: () => plan}, storeFile = path.join(root, 'parcels.json'), coordinator = new WorkParcelCoordinator(runtime, new WorkParcelStore(storeFile), planner);
  return {root, runtime, planner, storeFile, coordinator, plan, started, releaseLeft, releaseRight};
}

test('natural-language parcel runs dependent Jobs sequentially and retains typed batons', async () => {
  const {coordinator, runtime} = setup(); const parcel = await coordinator.submit('do the test', 'operator');
  assert.equal(parcel.audit.schema, 'agent-control.work-parcel-audit/v1'); assert.match(parcel.audit.classification, /Complex|governed|Registered/); assert.equal(parcel.audit.planner.model, 'planner'); assert.ok(parcel.audit.alternatives.some(item => item.candidate === 'host' && item.eligible));
  for (let count = 0; count < 3; count++) { await coordinator.tick(); await runtime.tick(); await coordinator.tick(); }
  const result = coordinator.get(parcel.id); assert.equal(result.status, 'SUCCEEDED'); assert.deepEqual(result.stages.map(stage => stage.status), ['SUCCEEDED','SUCCEEDED','SUCCEEDED']);
  assert.ok(result.stages.every(stage => stage.baton?.schema === 'agent-control.work-parcel-baton/v2' && stage.baton.artifactIds.length === 1 && /^[a-f0-9]{64}$/.test(stage.baton.sha256))); assert.equal(result.prompt, 'do the test');
});

test('credential material is rejected at Work Parcel ingress and redacted at durable store boundary', async () => {
  const {coordinator, root, storeFile} = setup(), secret = ['nvapi', 'fixture', 'E'.repeat(24)].join('-');
  try {
    await assert.rejects(() => coordinator.submit(`review using ${secret}`, 'operator'), /work_parcel_credential_material_forbidden/);
    assert.throws(() => coordinator.accept(`review using ${secret}`, 'operator'), /work_parcel_credential_material_forbidden/);
    const safe = await coordinator.submit('review without credential material', 'operator'), stored = coordinator.store.get(safe.id)!;
    stored.provenance.push({at: new Date().toISOString(), type: 'provider-error', detail: `upstream echoed ${secret}`});
    coordinator.store.update(stored);
    assert.equal(JSON.stringify(coordinator.store.get(safe.id)).includes(secret), false);
    assert.equal(fs.readFileSync(storeFile, 'utf8').includes(secret), false);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('approved channel request origin survives durable Work Parcel restart without transport identity', () => {
  const {coordinator,root,storeFile,plan}=setup();
  try{const origin=governedRequestOrigin({channel:'openwa',modality:'text',receivedAt:'2026-09-07T12:00:00Z',authentication:'enrolled-direct-sender',actorId:'operator',authority:['template:one'],messageReference:'1'.repeat(64),identityReference:'2'.repeat(64),request:'start one'}),parcel=coordinator.submitApprovedPlan(origin.request,'operator','3'.repeat(64),plan,origin),restored=new WorkParcelStore(storeFile).get(parcel.id)!;assert.deepEqual(restored.origin,origin);assert.equal(restored.prompt,'start one');assert.doesNotMatch(fs.readFileSync(storeFile,'utf8'),/@c\.us|phone|cookie/i);}finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('dashboard origin is present before asynchronous planning and cannot be overwritten by the planning update', async () => {
  const {coordinator,root,storeFile}=setup();
  try {
    const origin=governedRequestOrigin({channel:'dashboard',modality:'dashboard',receivedAt:'2026-09-12T12:00:00Z',authentication:'operator-authenticated',actorId:'operator',authority:['parcel.create'],messageReference:'4'.repeat(64),identityReference:'5'.repeat(64),request:'start dashboard work'}),attribution={schema:'agent-control.work-attribution/v1' as const,actorId:'operator',sessionId:'session-dashboard',authority:['parcel.create'],createdAt:'2026-09-12T12:00:00Z',legacy:false};
    const parcel=coordinator.accept(origin.request,'operator',[],attribution,origin);
    assert.deepEqual(parcel.origin,origin);assert.equal(parcel.attribution?.parcelId,parcel.id);
    for(let attempt=0;attempt<20&&coordinator.get(parcel.id).status==='PLANNING';attempt++)await new Promise(resolve=>setTimeout(resolve,5));
    const planned=coordinator.get(parcel.id),restored=new WorkParcelStore(storeFile).get(parcel.id)!;
    assert.deepEqual(planned.origin,origin);assert.deepEqual(restored.origin,origin);assert.equal(restored.attribution?.parcelId,parcel.id);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('blocked named target still creates an auditable parcel with readiness evidence', () => {
  const {coordinator}=setup(), system: SystemReadiness={id:'node-alpha',name:'Node Alpha',type:'machine',registered:true,reachable:'no',authentication:'unknown',execution:'OFFLINE',blockingReason:'is offline',transport:'ssh',platform:'linux',capabilities:['remote.inspect'],capacity:1,active:0,lastCheckAt:null,lastSuccessfulProbeAt:null,lastSuccessfulJobAt:null,lastError:'connection refused',latencyMs:null};
  const prompt='perform a hostname check on node-alpha and report its free disk space', parcel=coordinator.accept(prompt,'operator',[system]); assert.equal(parcel.status,'FAILED'); assert.equal(parcel.prompt,prompt); assert.match(parcel.provenance.at(-1)?.detail??'',/BLOCKED.*Node Alpha.*offline/i); assert.deepEqual(parcel.audit.timeline.slice(2,5).map(item=>item.type),['target.resolving','target.found','readiness.checked']); assert.equal(coordinator.get(parcel.id).decision?.outcome,'FAIL_CLOSED');
});

test('actual worker route becomes durable while execution is still running', async () => {
  const {coordinator, runtime, releaseFirst} = setup(false, true), parcel = await coordinator.submit('inspect live route', 'operator');
  await coordinator.tick(); const execution = runtime.tick(); await new Promise(resolve => setImmediate(resolve));
  const active = coordinator.get(parcel.id); assert.equal(active.status, 'RUNNING'); assert.deepEqual(active.stages[0].actualRoute?.workers, ['host']); assert.match(active.stages[0].actualRoute?.reason ?? '', /satisfies/); assert.ok(active.audit.timeline.some(item => item.type === 'route.resolved' && /Workers host/.test(item.detail)));
  const restored = new WorkParcelCoordinator(runtime, new WorkParcelStore(path.join(path.dirname(coordinator.store.file), 'parcels.json')), coordinator.planner).get(parcel.id); assert.deepEqual(restored.stages[0].actualRoute?.workers, ['host']);
  releaseFirst(); await execution;
});

test('dispatch failure terminates the parcel instead of retrying forever', async () => {
  const {coordinator,runtime}=setup(), parcel=await coordinator.submit('dispatch safely','operator');
  const original=runtime.createRun.bind(runtime); runtime.createRun=(()=>{throw new Error('job_missing_after_planning')}) as typeof runtime.createRun;
  const failed=await coordinator.tick(); runtime.createRun=original;
  assert.equal(failed?.status,'FAILED'); assert.equal(failed?.stages[0].status,'FAILED'); assert.match(failed?.stages[0].error??'',/dispatch_failed:job_missing_after_planning/); assert.equal(failed?.decision?.outcome,'FAIL_CLOSED');
});

test('model role is qualified and bound to the selected node before Job dispatch', async () => {
  const {runtime, plan, storeFile} = setup();
  plan.stages = [{...plan.stages[0], requestedRoute: {modelRole: 'coding.fast', allowFallback: true, reason: 'test governed model routing'}}];
  const registry = new ModelRegistry(
    [{id: 'external', kind: 'openai-compatible', baseUrl: 'https://models.example/v1', enabled: true}],
    [{id: 'fast', provider: 'external', providerModel: 'vendor/fast', capabilities: ['coding'], qualification: {state: 'QUALIFIED', version: 'qual-v1', capabilities: ['coding'], nodes: ['host']}}],
    {roles: {'coding.fast': {primary: 'fast'}}},
  );
  const coordinator = new WorkParcelCoordinator(runtime, new WorkParcelStore(storeFile), {plan: () => plan}, undefined, registry);
  const parcel = await coordinator.submit('route this', 'operator'); await coordinator.tick();
  const stage = coordinator.get(parcel.id).stages[0], run = runtime.ledger.get(stage.runId!);
  assert.equal(run?.trigger.modelRoute?.modelId, 'fast'); assert.equal(run?.trigger.modelRoute?.nodeId, 'host'); assert.equal(run?.trigger.modelRoute?.qualificationVersion, 'qual-v1');
  assert.equal(stage.actualRoute?.provider, 'external'); assert.equal(stage.actualRoute?.model, 'fast');
});

test('production Work Parcel routing selects a compatible Warm Expert and seals the decision into the baton', async () => {
  const {runtime, plan, storeFile, root} = setup();
  const cacheContext = {repositoryRef:'agent-control@abc',repositoryIdentitySha256:'repo-abc',immutableContextSha256:'bundle-abc',promptPrefixSha256:'prefix-abc',transportContextSha256:'transport-abc',contextTags:['repository:agent-control','task:typescript']};
  const cacheScope = {sessionId:'qualification-session',cacheScopeId:'slot-0',backendInstanceId:'llama-process-1'};
  plan.stages = [{...plan.stages[0], requestedRoute: {modelRole:'coding.fast',allowFallback:true,reason:'choose a governed compatible expert',cacheContext,cacheScopeByModel:{cold:{sessionId:'cold-session',cacheScopeId:'cold-slot',backendInstanceId:'cold-process'},warm:cacheScope}}}];
  const registry = new ModelRegistry(
    [{id:'local',kind:'openai-compatible',baseUrl:'http://127.0.0.1:19091/v1',enabled:true}],
    [{id:'cold',provider:'local',providerModel:'qwen-cold',capabilities:['coding'],qualification:{state:'QUALIFIED',version:'q1',capabilities:['coding'],nodes:['host']}},{id:'warm',provider:'local',providerModel:'qwen-warm',capabilities:['coding'],qualification:{state:'QUALIFIED',version:'q1',capabilities:['coding'],nodes:['host']}}],
    {roles:{'coding.fast':{primary:'cold',fallback:['warm'],requires:['coding']}}},
  );
  const experts = new CacheAwareExpertRuntime(new FileCacheExpertStore(path.join(root,'cache-experts.json')),{maximumScoreBonus:.2},()=> '2026-09-09T10:01:00.000Z');
  experts.observe({invocationId:'prior-warm',route:{workerId:'host',providerId:'local',modelId:'warm',nodeId:'host',...cacheScope},context:cacheContext,cacheEvidence:{reusedTokens:900,processedPromptTokens:100,cacheWriteTokens:null,promptProcessingMs:10,generationMs:20,authority:'authoritative',source:'llama.cpp.timings'},observedAt:'2026-09-09T10:00:00.000Z',taskClass:'coding',capabilities:['coding'],outcome:'COMPLETE',verifierResult:'PASS',health:'healthy'});
  const coordinator = new WorkParcelCoordinator(runtime,new WorkParcelStore(storeFile),{plan:()=>plan},undefined,registry,undefined,experts);
  const parcel = await coordinator.submit('continue the compatible repository task','operator'); await coordinator.tick();
  let stage=coordinator.get(parcel.id).stages[0],run=runtime.ledger.get(stage.runId!); assert.equal(run?.trigger.modelRoute?.modelId,'warm'); assert.ok(stage.cacheExpertDecisionId); assert.equal(experts.decision(stage.cacheExpertDecisionId!).selectedRoute?.backendInstanceId,'llama-process-1'); assert.ok(coordinator.get(parcel.id).audit.timeline.some(item=>item.type==='cache.expert_selected'&&/Warm Expert/.test(item.summary)));
  await runtime.tick(); await coordinator.tick(); stage=coordinator.get(parcel.id).stages[0]; assert.equal(stage.baton?.cacheExpertDecisionId,stage.cacheExpertDecisionId); assert.equal(stage.baton?.cacheExpertId,experts.decision(stage.cacheExpertDecisionId!).selectedExpertId);
});

test('failed gate blocks every downstream stage and survives coordinator restart', async () => {
  const {coordinator, runtime, planner, storeFile} = setup(true); const parcel = await coordinator.submit('do the test', 'operator');
  await coordinator.tick(); await runtime.tick(); await coordinator.tick(); await runtime.tick(); await coordinator.tick();
  const restarted = new WorkParcelCoordinator(runtime, new WorkParcelStore(storeFile), planner), result = restarted.get(parcel.id);
  assert.equal(result.status, 'FAILED'); assert.deepEqual(result.stages.map(stage => stage.status), ['SUCCEEDED','FAILED','BLOCKED']); assert.match(result.stages[2].waitingReason ?? '', /dependency|Upstream|Blocked/i);
  assert.equal(result.decision?.outcome, 'FAIL_CLOSED'); assert.match(result.decision?.summary ?? '', /blocked dependent work/); assert.deepEqual(result.decision?.blockedStages, ['Three']);
});

test('complex plans fail closed on unknown Jobs, cycles and absent reasoning planner', async () => {
  const {runtime, plan} = setup();
  assert.throws(() => validateWorkParcelPlan({...plan, stages: [{id: 'bad', name: 'Bad', job: 'missing@1.0.0'}]}, runtime), /work_parcel_job_missing/);
  assert.throws(() => validateWorkParcelPlan({...plan, stages: [{id: 'a', name: 'A', job: 'one-job@1.0.0', dependsOn: ['b']}, {id: 'b', name: 'B', job: 'two-job@1.0.0', dependsOn: ['a']}]}, runtime), /dependency_cycle/);
  await assert.rejects(() => new CatalogNaturalLanguagePlanner(runtime).plan('an ambiguous complex objective'), /reasoning_planner_unconfigured/);
});

test('capacity failures explain the measurement, policy threshold and undispatched work', () => {
  const parcel = {
    id: 'parcel-capacity', prompt: 'qualify FreeToken', objective: 'qualify FreeToken', actor: 'operator', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'FAILED',
    planner: {kind: 'deterministic', reason: 'matched workflow'},
    stages: [
      {id: 'gate', name: 'Capacity gate', job: 'gate@1.0.0', dependsOn: [], parameters: {}, status: 'FAILED', error: 'freetoken_capacity_gate_failed:free_vram_mib=1256:required=8192'},
      {id: 'install', name: 'Install FreeToken', job: 'install@1.0.0', dependsOn: ['gate'], parameters: {}, status: 'BLOCKED'},
    ], telemetry: {freshInputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null, cost: null, currency: null, elapsedMs: 0}, provenance: [],
  } as unknown as WorkParcel;
  const decision = explainParcelDecision(parcel);
  assert.equal(decision.outcome, 'FAIL_CLOSED');
  assert.match(decision.summary, /1,256 MiB.*8,192 MiB/);
  assert.deepEqual(decision.blockedStages, ['Install FreeToken']);
  assert.match(decision.evidence.join(' '), /Provider\/model request: none/);
});

test('reasoning model proposes data against a bounded catalog and Agent Control validates it', async () => {
  const {runtime} = setup(); let offered: string[] = [];
  const reasoning = new ReasoningModelWorkParcelPlanner(runtime, 'provider-a', 'model-a', async input => { offered = input.jobs.map(job => job.id); return {stages: [{id: 'execute', name: 'Execute', job: 'one-job@1.0.0'}]}; });
  const plan = validateWorkParcelPlan(await new CatalogNaturalLanguagePlanner(runtime, reasoning).plan('complex objective with no named job'), runtime);
  assert.deepEqual([...offered].sort(), ['one-job','two-job','three-job'].sort()); assert.equal(plan.planner.kind, 'reasoning-model'); assert.equal(plan.planner.provider, 'provider-a');
});

test('durable audit records model changes and complete hierarchical invocation accounting', async () => {
  const {runtime, planner, storeFile} = setup(), ledger = new MemoryHarnessEfficiencyLedger(), coordinator = new WorkParcelCoordinator(runtime, new WorkParcelStore(storeFile), planner, ledger);
  const parcel = await coordinator.submit('audit two routes', 'operator'); await coordinator.tick(); const runId = coordinator.get(parcel.id).stages[0].runId!;
  const price = {currency: 'USD', freshInputPerMillionTokens: 1, cachedInputPerMillionTokens: .2, outputPerMillionTokens: 2, source: 'test'} as const;
  ledger.record(createInvocationObservation({id: 'inv-a', jobId: 'one-job', runId, taskId: parcel.id, laneId: 'analysis', model: 'glm-5.3-flash', provider: 'openrouter', harnessProfile: 'STANDARD', executionStrategy: 'ox', startedAt: '2026-08-30T10:00:00Z', completedAt: '2026-08-30T10:00:02Z', rawUsage: {input_tokens: 100, input_tokens_details: {cached_tokens: 20}, output_tokens: 10, output_tokens_details: {reasoning_tokens: 2}, total_tokens: 110}, providerReportedCost: .01, pricing: price, recipeFingerprint: 'a'}));
  ledger.record(createInvocationObservation({id: 'inv-b', jobId: 'one-job', runId, taskId: parcel.id, laneId: 'analysis', model: 'gpt-5.6', provider: 'openai', harnessProfile: 'DEEP', executionStrategy: 'escalation', startedAt: '2026-08-30T10:00:03Z', completedAt: '2026-08-30T10:00:07Z', rawUsage: {input_tokens: 200, input_tokens_details: {cached_tokens: 40}, output_tokens: 20, output_tokens_details: {reasoning_tokens: 4}, total_tokens: 220}, providerReportedCost: .03, pricing: price, recipeFingerprint: 'b'}));
  await runtime.tick(); await coordinator.tick(); const result = coordinator.get(parcel.id);
  assert.deepEqual(result.audit.totals.models, ['glm-5.3-flash', 'gpt-5.6']); assert.equal(result.audit.totals.invocations, 2); assert.equal(result.audit.totals.totalTokens, 330); assert.equal(result.audit.totals.providerReportedCost, .04); assert.equal(result.audit.totals.costBasis, 'provider-reported'); assert.equal(result.audit.totals.modelExecutionMs, 6000);
  assert.ok(result.audit.timeline.some(item => item.type === 'route.changed' && /glm-5.3-flash.*gpt-5.6/.test(item.summary))); assert.ok(result.audit.timeline.some(item => item.type === 'invocation.completed'));
  const restored = new WorkParcelCoordinator(runtime, new WorkParcelStore(storeFile), planner, ledger).get(parcel.id); assert.equal(restored.audit.totals.totalTokens, 330); assert.equal(restored.audit.invocations[0].freshInputTokens, 80);
});

test('independent Work Parcel branches dispatch and execute concurrently up to governed worker capacity', async () => {
  const {coordinator, runtime, started, releaseLeft, releaseRight} = parallelSetup(), parcel = await coordinator.submit('original parallel goal verbatim', 'operator');
  await coordinator.tick();
  const dispatched = coordinator.get(parcel.id); assert.deepEqual(dispatched.stages.map(stage => stage.status), ['RUNNING','RUNNING','QUEUED']);
  const left = runtime.dispatch(), right = runtime.dispatch(); assert.ok(left && right); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual([...started].sort(), ['left','right']); assert.equal(runtime.workers.list()[0].active, 2);
  releaseLeft(); releaseRight(); await Promise.all([left.completion, right.completion]); await coordinator.tick();
  const afterBranches = coordinator.get(parcel.id); assert.deepEqual(afterBranches.stages.map(stage => stage.status), ['SUCCEEDED','SUCCEEDED','RUNNING']);
  await runtime.tick(); await coordinator.tick();
  assert.equal(coordinator.get(parcel.id).status, 'SUCCEEDED');
  assert.ok(coordinator.get(parcel.id).context?.events.filter(event => event.type === 'stage.started').length === 3);
});

test('an asynchronous question pauses only dependent work and answering resumes it without losing independent progress', async () => {
  const {coordinator, runtime, releaseLeft, releaseRight} = parallelSetup(), parcel = await coordinator.submit('run one branch while waiting for clarification', 'operator');
  const questioned = coordinator.askQuestion(parcel.id, {text: 'Which right-side format should be used?', originatingStageId: 'left', dependentStageIds: ['right'], priority: 'HIGH', consequence: 'MEDIUM', actor: 'agent:left'});
  const question = questioned.context!.questions[0]; assert.deepEqual(questioned.stages.map(stage => stage.status), ['QUEUED','WAITING','QUEUED']);
  await coordinator.tick(); assert.deepEqual(coordinator.get(parcel.id).stages.map(stage => stage.status), ['RUNNING','WAITING','QUEUED']);
  const left = runtime.dispatch()!; await new Promise(resolve => setImmediate(resolve)); releaseLeft(); await left.completion; await coordinator.tick();
  const stillWaiting = coordinator.get(parcel.id); assert.equal(stillWaiting.stages[0].status, 'SUCCEEDED'); assert.equal(stillWaiting.stages[1].status, 'WAITING');
  coordinator.answerQuestion(parcel.id, question.id, 'Use JSON', 'operator'); await coordinator.tick(); assert.equal(coordinator.get(parcel.id).stages[1].status, 'RUNNING');
  const right = runtime.dispatch()!; await new Promise(resolve => setImmediate(resolve)); releaseRight(); await right.completion; await coordinator.tick(); await runtime.tick(); await coordinator.tick();
  const result = coordinator.get(parcel.id); assert.equal(result.status, 'SUCCEEDED'); assert.equal(result.context?.questions[0].status, 'ANSWERED'); assert.ok(result.context?.events.some(event => event.type === 'question.answered'));
});

test('steering preserves the original request and supplies effective amendments through the production run contract', async () => {
  const {coordinator, runtime} = setup(), original = 'original goal the planner must not overwrite', parcel = await coordinator.submit(original, 'operator');
  coordinator.steer(parcel.id, {instruction: 'Limit output to JSON', constraints: ['do not deploy'], affectedStageIds: ['one'], actor: 'operator'});
  await coordinator.tick(); const run = runtime.ledger.get(coordinator.get(parcel.id).stages[0].runId!)!;
  assert.equal(run.trigger.parcelContext?.originalGoal, original);
  assert.equal(run.trigger.parcelContext?.currentInterpretation, `${original} Active amendments: 1) Limit output to JSON`);
  assert.deepEqual(run.trigger.parcelContext?.effectiveInstructions, ['Limit output to JSON']);
  assert.deepEqual(run.trigger.parcelContext?.constraints, ['do not deploy']);
  assert.equal(coordinator.get(parcel.id).objective, 'test objective');
});

test('explicit success criteria are first-class gates after stage verification and a failed criterion fails closed', async () => {
  const first = setup(), parcel = await first.coordinator.submit('require operator outcome proof', 'operator'), added = first.coordinator.addCriterion(parcel.id, {kind: 'CUSTOM', description: 'Operator confirms semantic outcome', source: 'USER', sourceActor: 'operator'});
  for (let count = 0; count < 3; count++) { await first.coordinator.tick(); await first.runtime.tick(); await first.coordinator.tick(); }
  const waiting = first.coordinator.get(parcel.id); assert.equal(waiting.stages.every(stage => stage.status === 'SUCCEEDED'), true); assert.equal(waiting.status, 'WAITING'); assert.equal(waiting.context?.criteria.find(item => item.id === added.criterion.id)?.status, 'PENDING');
  first.coordinator.evaluateCriterion(parcel.id, added.criterion.id, {status: 'PASS', evidence: ['operator:verified-outcome'], actor: 'operator'});
  assert.equal(first.coordinator.get(parcel.id).status, 'SUCCEEDED');

  const second = setup(), rejected = await second.coordinator.submit('reject unsafe outcome', 'operator'), criterion = second.coordinator.addCriterion(rejected.id, {kind: 'CUSTOM', description: 'Safety reviewer accepts', source: 'REVIEWER', sourceActor: 'reviewer'}).criterion;
  second.coordinator.evaluateCriterion(rejected.id, criterion.id, {status: 'FAIL', evidence: ['review:unsafe'], detail: 'unsafe output', actor: 'reviewer'});
  const failed = second.coordinator.get(rejected.id); assert.equal(failed.status, 'FAILED'); assert.equal(failed.decision?.outcome, 'FAIL_CLOSED'); assert.ok(failed.provenance.some(item => item.type === 'criterion.failed'));
});

test('restart reconciliation repairs inferred stage criteria without duplicating completion evidence', async () => {
  const {coordinator, runtime, planner, storeFile} = setup(), parcel = await coordinator.submit('restart criterion repair', 'operator'); await coordinator.tick(); await runtime.tick();
  const raw = JSON.parse(fs.readFileSync(storeFile, 'utf8')); const saved = raw.parcels.find((item: {id: string}) => item.id === parcel.id); saved.stages[0].status = 'SUCCEEDED'; saved.context.criteria.find((item: {stageId?: string}) => item.stageId === 'one').status = 'PENDING'; fs.writeFileSync(storeFile, `${JSON.stringify(raw, null, 2)}\n`);
  const restarted = new WorkParcelCoordinator(runtime, new WorkParcelStore(storeFile), planner), repaired = restarted.get(parcel.id); await restarted.tick(); const after = restarted.get(parcel.id);
  assert.equal(after.context?.criteria.find(item => item.stageId === 'one')?.status, 'PASS');
  assert.equal(after.context?.events.filter(event => event.type === 'criterion.evaluated' && event.stageId === 'one').length, 1);
  assert.equal(repaired.context?.active.originalGoal, 'restart criterion repair');
});

test('approved social parcel request is idempotent across restart and uses the existing executor',async()=>{
  const s=setup();const key='a'.repeat(64),plan={...s.plan,stages:[s.plan.stages[0]!]};
  const first=s.coordinator.submitApprovedPlan('approved test','operator',key,plan);
  assert.equal(s.coordinator.submitApprovedPlan('approved test','operator',key,plan).id,first.id);
  const restarted=new WorkParcelCoordinator(s.runtime,new WorkParcelStore(s.storeFile),s.planner);
  assert.equal(restarted.submitApprovedPlan('approved test','operator',key,plan).id,first.id);
  assert.throws(()=>restarted.submitApprovedPlan('approved test','other',key,plan),/identity_mismatch/);
  await restarted.tick();await s.runtime.tick();await restarted.tick();
  assert.equal(s.runtime.ledger.list().length,1);assert.equal(restarted.get(first.id).status,'SUCCEEDED');
  assert.equal(s.runtime.ledger.list()[0]!.trigger.parcelContext?.parcelId,first.id);
});

test('approved social parcels enter the same durable adaptive orchestration lifecycle as dashboard parcels',()=>{
  const s=setup(),adaptiveFile=path.join(s.root,'adaptive.json'),adaptive=new AdaptiveOrchestrationRuntime(new FileAdaptiveOrchestrationStore(adaptiveFile),{enabled:true}),store=new WorkParcelStore(s.storeFile),coordinator=new WorkParcelCoordinator(s.runtime,store,s.planner,undefined,undefined,adaptive),key='b'.repeat(64),plan={...s.plan,stages:[s.plan.stages[0]!]};
  const parcel=coordinator.submitApprovedPlan('approved adaptive social work','operator',key,plan);
  assert.match(parcel.audit.orchestrationDecisionId??'',/^orchestration-/);
  const decision=adaptive.decision(parcel.audit.orchestrationDecisionId!);
  assert.equal(decision.parcelId,parcel.id);
  assert.equal(decision.request.workflowId,'work-parcel-coordinator');
  assert.ok(decision.nodes.some(node=>node.kind==='CLASSIFICATION'));
  const restartedAdaptive=new AdaptiveOrchestrationRuntime(new FileAdaptiveOrchestrationStore(adaptiveFile),{enabled:true}),restarted=new WorkParcelCoordinator(s.runtime,new WorkParcelStore(s.storeFile),s.planner,undefined,undefined,restartedAdaptive),restored=restarted.submitApprovedPlan('approved adaptive social work','operator',key,plan);
  assert.equal(restored.audit.orchestrationDecisionId,parcel.audit.orchestrationDecisionId);
  assert.equal(restartedAdaptive.decision(restored.audit.orchestrationDecisionId!).parcelId,parcel.id);
});

test('idempotent social replay repairs a decision-less parcel after coordinator restart',()=>{
  const s=setup(),key='c'.repeat(64),plan={...s.plan,stages:[s.plan.stages[0]!]};
  const legacy=s.coordinator.submitApprovedPlan('approved pre-adaptive social work','operator',key,plan);
  assert.equal(legacy.audit.orchestrationDecisionId,undefined);
  const adaptiveFile=path.join(s.root,'adaptive-recovery.json'),adaptive=new AdaptiveOrchestrationRuntime(new FileAdaptiveOrchestrationStore(adaptiveFile),{enabled:true}),restarted=new WorkParcelCoordinator(s.runtime,new WorkParcelStore(s.storeFile),s.planner,undefined,undefined,adaptive),recovered=restarted.submitApprovedPlan('approved pre-adaptive social work','operator',key,plan);
  assert.match(recovered.audit.orchestrationDecisionId??'',/^orchestration-/);
  assert.equal(adaptive.decision(recovered.audit.orchestrationDecisionId!).parcelId,legacy.id);
  assert.equal(restarted.submitApprovedPlan('approved pre-adaptive social work','operator',key,plan).audit.orchestrationDecisionId,recovered.audit.orchestrationDecisionId);
});

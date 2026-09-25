import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {JobCatalog} from './job-catalog.js';
import {ActionRegistry, ArtifactStore, createJobRuntime, WorkerRegistry} from './job-runtime.js';
import type {ActionContext, JobDefinition} from './job-types.js';
import {MemoryHarnessEfficiencyLedger} from './harness-efficiency.js';
import {registerNonOpenAiCacheQualificationActions} from './non-openai-cache-qualification.js';
import {MutationWorkspace, MUTATION_TOOL_IDS} from './harness-mutation-workspace.js';
import {parseMutationBenchmarkSuite} from './harness-mutation-benchmark.js';
import {createToolHandlerRegistry} from './harness-dispatch.js';

const environment = {AGENT_CONTROL_ENABLE_NON_OPENAI_CACHE_QUALIFICATION: 'true', AGENT_CONTROL_NON_OPENAI_CACHE_BASE_URL: 'http://127.0.0.1:18000/v1', AGENT_CONTROL_NON_OPENAI_CACHE_MODEL: 'fixture-model', AGENT_CONTROL_NON_OPENAI_CACHE_REPOSITORY_ROOT: process.cwd()};
function setup(t: {after(fn: () => void): void}, fetcher: typeof fetch, register?: (actions: ActionRegistry) => void, additions: NodeJS.ProcessEnv = {}, parameters: Record<string, unknown> = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-execution-remediation-'));
  const previous = globalThis.fetch; globalThis.fetch = fetcher;
  t.after(() => { globalThis.fetch = previous; fs.rmSync(root, {recursive: true, force: true}); });
  const efficiency = new MemoryHarnessEfficiencyLedger();
  const actions = registerNonOpenAiCacheQualificationActions(new ActionRegistry(), efficiency, {...environment, ...additions});
  register?.(actions);
  const catalog = new JobCatalog(actions.ids());
  const job: JobDefinition = {apiVersion: 'agent-control/v1', kind: 'Job', metadata: {id: 'qualification-fixture', name: 'Fixture', version: '1.0.0'}, spec: {priority: 'normal', concurrency: 'no-overlap', parameters: {taskId: {type: 'string'}, profile: {type: 'string'}, prefixVariant: {type: 'string'}, toolInterface: {type: 'string', enum: ['SEMANTIC_TOOL_V1', 'LEGACY_TOOL_REQUEST']}}, steps: [
    {id: 'mutate', action: 'qualification.non-openai-cache.mutate@1.0.0', requires: ['model.execute'], resources: ['fixture'], outputs: [{name: 'mutation-attempt', type: 'json', schema: 'attempt/v1', version: '1.0.0'}]},
    {id: 'verify', action: 'qualification.non-openai-cache.verify@1.0.0', requires: ['model.execute'], dependsOn: ['mutate'], outputs: [{name: 'verification-report', type: 'json', schema: 'verification/v1', version: '1.0.0'}], verification: ['non-openai-cache-mutation-verified']},
  ]}};
  catalog.addJob(job);
  const workers = new WorkerRegistry().register({id: 'fixture-worker', capabilities: ['model.execute', 'structured-output', 'tool-request', 'repository.mutation.typed'], health: 'healthy', capacity: 1, active: 0, observedAt: new Date().toISOString()});
  const runtime = createJobRuntime(root, catalog, actions, workers, {efficiency});
  const run = runtime.createRun('qualification-fixture@1.0.0', parameters, {type: 'manual', actor: 'human:test'});
  return {root, runtime, run, efficiency, catalog, actions, workers};
}
function response(tool: string, input: unknown = {}) { return Response.json({id: 'response-fixture', model: 'fixture-model', choices: [{message: {content: JSON.stringify({tool, input})}, finish_reason: 'stop'}], usage: {prompt_tokens: 100, completion_tokens: 20, total_tokens: 120}}); }
const replace = () => response(MUTATION_TOOL_IDS.replace, {path: 'src/constants.js', oldText: '30_000', newText: '45_000'});
const finish = () => response(MUTATION_TOOL_IDS.finish, {summary: 'Done'});
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
function values(runtime: ReturnType<typeof createJobRuntime>, runId: string, name: string) { return runtime.artifacts.list(runId).filter(item => item.name === name).map(item => runtime.artifacts.read(item.id)); }

test('live qualification path performs a bounded mutation and independent verification with durable journals', async t => {
  let calls = 0; const s = setup(t, async () => ++calls === 1 ? replace() : finish());
  await s.runtime.tick(); await s.runtime.tick();
  assert.equal(s.runtime.ledger.get(s.run.id)?.status, 'SUCCEEDED');
  assert.equal(calls, 2);
  assert.equal(values(s.runtime, s.run.id, 'independent-verification')[0].verifier.passed, true);
  assert.equal(values(s.runtime, s.run.id, 'attempt-workspace-cleanup')[0].outcome, 'confirmed');
  const fresh = new ArtifactStore(path.join(s.root, 'jobs', 'artifact-store'));
  for (const artifact of s.runtime.artifacts.list(s.run.id)) assert.deepEqual(fresh.read(artifact.id), s.runtime.artifacts.read(artifact.id));
});
test('lean terminal allowance completes through native JobRuntime with durable evidence and cleanup', async t => {
  let calls = 0;
  const replies = [() => response(MUTATION_TOOL_IDS.read, {path: 'src/constants.js'}), replace, () => response(MUTATION_TOOL_IDS.test), finish];
  const s = setup(t, async () => replies[calls++](), undefined, {AGENT_CONTROL_LEAN_EXPERIMENT: 'true'});
  await s.runtime.tick(); await s.runtime.tick();
  assert.equal(s.runtime.ledger.get(s.run.id)?.status, 'SUCCEEDED');
  assert.equal(calls, 4);
  assert.equal(values(s.runtime, s.run.id, 'independent-verification')[0].verifier.passed, true);
  assert.equal(values(s.runtime, s.run.id, 'attempt-workspace-cleanup')[0].outcome, 'confirmed');
  const projections = values(s.runtime, s.run.id, 'lean-model-interface');
  const last = projections.filter(value => value.kind === 'model_invocation').at(-1);
  assert.deepEqual(last.exposedToolIds, [MUTATION_TOOL_IDS.finish]);
});

test('native benchmark parameters are resolved inside the governed action and earn native provenance', async t => {
  let calls = 0;
  const replies = [() => new Response(null, {status: 200}), () => Response.json({data: [{id: 'fixture-model'}]}), replace, finish];
  const s = setup(t, async () => replies[calls++](), undefined, {}, {taskId: 'MUT-001', profile: 'STANDARD'});
  await s.runtime.tick(); await s.runtime.tick();
  assert.equal(s.runtime.ledger.get(s.run.id)?.status, 'SUCCEEDED');
  assert.equal(calls, 4);
  assert.equal(values(s.runtime, s.run.id, 'runtime-health')[0].status, 200);
  assert.deepEqual(values(s.runtime, s.run.id, 'model-discovery')[0].modelIds, ['fixture-model']);
  const attempt = values(s.runtime, s.run.id, 'mutation-attempt')[0];
  assert.equal(attempt.taskId, 'MUT-001'); assert.equal(attempt.profile, 'STANDARD'); assert.equal(attempt.provenance, 'AGENT_CONTROL_NATIVE_EXECUTION');
  assert.equal(values(s.runtime, s.run.id, 'independent-verification')[0].verifier.passed, true);
});

test('disabled native dispatcher prevents the external submitter from completing work', async t => {
  let calls = 0;
  const replies = [() => new Response(null, {status: 200}), () => Response.json({data: [{id: 'fixture-model'}]})];
  const s = setup(t, async () => replies[calls++](), undefined, {AGENT_CONTROL_NATIVE_BENCHMARK_DISABLE_DISPATCHER: 'true'}, {taskId: 'MUT-001', profile: 'STANDARD'});
  await s.runtime.tick();
  assert.equal(s.runtime.ledger.get(s.run.id)?.status, 'FAILED');
  assert.equal(calls, 2);
  assert.equal(values(s.runtime, s.run.id, 'tool-request').length, 0);
  assert.match(JSON.stringify(s.runtime.ledger.get(s.run.id)), /native_benchmark_dispatcher_disabled/);
});

test('human takeover during provider wait aborts the request and fences a late provider mutation', async t => {
  let started!: () => void, release!: () => void, received: AbortSignal | undefined;
  const began = new Promise<void>(resolve => { started = resolve; });
  const wait = new Promise<void>(resolve => { release = resolve; });
  const s = setup(t, async (_input, init) => { received = init?.signal ?? undefined; started(); await wait; return replace(); });
  const active = s.runtime.tick(); await began;
  const contract = s.runtime.contracts.list()[0];
  s.runtime.contracts.humanTakeover(contract.id, 'human:supervisor');
  assert.equal(received?.aborted, true);
  release(); await active;
  assert.equal(s.runtime.ledger.get(s.run.id)?.status, 'PAUSED');
  assert.equal(s.runtime.contracts.get(contract.id).pty.writeOwner, 'human:supervisor');
  assert.equal(s.runtime.contracts.get(contract.id).state, 'PAUSED');
  const retained = values(s.runtime, s.run.id, 'attempt-before-cleanup')[0];
  assert.equal(retained.workspace.patch, '');
  assert.equal(retained.workspace.counters.mutationsAttempted, 0);
  assert.equal(values(s.runtime, s.run.id, 'tool-request').length, 0);
});

test('Job cancellation during a cooperative provider wait preserves failed request evidence', async t => {
  let started!: () => void; const began = new Promise<void>(resolve => { started = resolve; });
  const s = setup(t, async (_input, init) => new Promise((_resolve, reject) => { started(); init?.signal?.addEventListener('abort', () => reject(new Error('provider_cancelled')), {once: true}); }));
  const active = s.runtime.tick(); await began; s.runtime.cancel(s.run.id); await active;
  assert.equal(s.runtime.ledger.get(s.run.id)?.status, 'CANCELLED');
  assert.equal(values(s.runtime, s.run.id, 'provider-failure')[0].cancelled, true);
  assert.equal(values(s.runtime, s.run.id, 'tool-request').length, 0);
});

test('cancellation between tools retains the first patch and prevents every later tool', async t => {
  let calls = 0, started!: () => void, release!: () => void;
  const began = new Promise<void>(resolve => { started = resolve; }), wait = new Promise<void>(resolve => { release = resolve; });
  const s = setup(t, async () => { if (++calls === 1) return replace(); started(); await wait; return response(MUTATION_TOOL_IDS.write, {path: 'src/constants.js', content: 'LATE MUTATION'}); });
  const active = s.runtime.tick(); await began; s.runtime.cancel(s.run.id); release(); await active;
  const retained = values(s.runtime, s.run.id, 'attempt-before-cleanup')[0];
  assert.match(retained.workspace.patch, /45_000/); assert.doesNotMatch(retained.workspace.patch, /LATE MUTATION/);
  assert.equal(retained.workspace.counters.mutationsAttempted, 1);
  assert.equal(calls, 2, 'the provider reached the intended between-tool boundary and supplied a second request');
  assert.equal(s.runtime.ledger.get(s.run.id)?.status, 'CANCELLED');
  assert.equal(values(s.runtime, s.run.id, 'tool-request').length, 1, 'only the first request crossed governed dispatch');
  assert.equal(values(s.runtime, s.run.id, 'tool-result').length, 1, 'the first write completed before cancellation');
});

for (const [label, fetcher] of [
  ['malformed provider output', async () => Response.json({choices: [{message: {content: 'INVALID JSON'}}]})],
  ['unavailable provider', async () => { throw new Error('provider_unavailable'); }],
  ['provider HTTP failure', async () => Response.json({error: {message: 'fixture-error'}}, {status: 503})],
] as const) test(label + ' is failed and remains inspectable after restart', async t => {
  const s = setup(t, fetcher); await s.runtime.tick();
  assert.equal(s.runtime.ledger.get(s.run.id)?.status, 'FAILED');
  assert.ok(values(s.runtime, s.run.id, 'attempt-before-cleanup')[0].error);
  const recovered = createJobRuntime(s.root, s.catalog, s.actions, s.workers, {efficiency: s.efficiency});
  assert.equal(recovered.ledger.get(s.run.id)?.status, 'FAILED');
  assert.ok(recovered.artifacts.list(s.run.id).length > 0);
  assert.equal(values(recovered, s.run.id, 'tool-request').length, 0);
});

test('failed independent verification persists the report and patch before cleanup', async t => {
  const s = setup(t, async () => finish()); await s.runtime.tick(); await s.runtime.tick();
  assert.equal(s.runtime.ledger.get(s.run.id)?.status, 'DEGRADED');
  assert.equal(values(s.runtime, s.run.id, 'independent-verification')[0].verifier.passed, false);
  assert.equal(values(s.runtime, s.run.id, 'attempt-workspace-cleanup')[0].outcome, 'confirmed');
});

test('controller restart retains an in-flight request and fails closed without workspace identity', async t => {
  let started!: () => void, release!: () => void;
  const began = new Promise<void>(resolve => { started = resolve; }), wait = new Promise<void>(resolve => { release = resolve; });
  const s = setup(t, async () => { started(); await wait; return finish(); });
  const active = s.runtime.tick(); await began;
  const restoredActions = registerNonOpenAiCacheQualificationActions(new ActionRegistry(), s.efficiency, environment);
  const restored = createJobRuntime(s.root, s.catalog, restoredActions, s.workers, {efficiency: s.efficiency});
  assert.equal(restored.ledger.get(s.run.id)?.status, 'DISCONNECTED');
  assert.equal(values(restored, s.run.id, 'provider-request').length, 1);
  s.runtime.cancel(s.run.id); release(); await active;
});

test('filesystem mutation checks cancellation immediately before atomic replacement', async () => {
  const suite = parseMutationBenchmarkSuite(JSON.parse(fs.readFileSync('benchmarks/harness-mutation-jobs.json', 'utf8')));
  const controller = new AbortController(); let guards = -100;
  const prepared = MutationWorkspace.prepare(path.resolve(suite.fixturePath), suite.tasks[0], controller.signal, () => { if (++guards === 4) controller.abort(new Error('cancel-at-rename')); controller.signal.throwIfAborted(); });
  guards = 0;
  const before = fs.readFileSync(path.join(prepared.workspace.root, 'src/constants.js'), 'utf8');
  try {
    await assert.rejects(() => createToolHandlerRegistry(prepared.workspace.toolBindings()).invoke(MUTATION_TOOL_IDS.write, {path: 'src/constants.js', content: 'LATE'}, {} as never, {signal: controller.signal, assertActive: () => controller.signal.throwIfAborted()}), /cancel-at-rename/);
    assert.equal(fs.readFileSync(path.join(prepared.workspace.root, 'src/constants.js'), 'utf8'), before);
    assert.ok(prepared.workspace.evidenceSnapshot().files.some(item => item.path.endsWith('.agent-control-tmp')));
  } finally { await prepared.workspace.terminate('test'); prepared.workspace.cleanup(); }
});

test('uncertain workspace ownership preserves the workspace instead of deleting it', async () => {
  const suite = parseMutationBenchmarkSuite(JSON.parse(fs.readFileSync('benchmarks/harness-mutation-jobs.json', 'utf8')));
  const prepared = MutationWorkspace.prepare(path.resolve(suite.fixturePath), suite.tasks[0]);
  const parent = path.dirname(prepared.workspace.root), marker = path.join(parent, 'ownership.json'), original = fs.readFileSync(marker);
  fs.writeFileSync(marker, '{}');
  assert.equal(prepared.workspace.cleanup().outcome, 'uncertain'); assert.equal(fs.existsSync(prepared.workspace.root), true);
  fs.writeFileSync(marker, original); assert.equal(prepared.workspace.cleanup().outcome, 'confirmed');
});

test('policy-denied tool input is durably audited without reaching a raw handler', async t => {
  const s = setup(t, async () => response('forbidden.shell', {command: 'denied-fixture'})); await s.runtime.tick();
  assert.equal(s.runtime.ledger.get(s.run.id)?.status, 'FAILED');
  const audit = values(s.runtime, s.run.id, 'tool-policy-audit')[0];
  assert.equal(audit.allowed, false); assert.equal(audit.toolId, 'forbidden.shell'); assert.deepEqual(audit.input, {command: 'denied-fixture'});
  assert.equal(values(s.runtime, s.run.id, 'tool-request').length, 0);
});

test('preparation failure retains the partial fixture before confirmed cleanup', () => {
  const suite = parseMutationBenchmarkSuite(JSON.parse(fs.readFileSync('benchmarks/harness-mutation-jobs.json', 'utf8')));
  const events: Array<{name: string; value: any}> = []; let guards = 0;
  assert.throws(() => MutationWorkspace.prepare(path.resolve(suite.fixturePath), suite.tasks[0], undefined, () => { if (++guards === 6) throw new Error('preparation-revoked'); }, undefined, (name, value) => { events.push({name, value}); }), /preparation-revoked/);
  const failure = events.find(item => item.name === 'workspace-preparation-failed')!.value;
  assert.ok(failure.files.length > 0); assert.equal(fs.existsSync(failure.temporaryRoot), false);
  assert.equal(events.find(item => item.name === 'workspace-preparation-cleanup')!.value.outcome, 'confirmed');
});

for (const method of ['terminate', 'cleanup'] as const) test('thrown ' + method + ' preserves UNKNOWN and the worker lease', async t => {
  const original = MutationWorkspace.prototype[method];
  const s = setup(t, async () => { throw new Error('provider-failure'); });
  if (method === 'cleanup') MutationWorkspace.prototype.cleanup = () => { throw new Error('cleanup-permission-denied'); };
  else MutationWorkspace.prototype.terminate = async () => { throw new Error('termination-unproved'); };
  try {
    await s.runtime.tick();
    assert.equal(s.runtime.ledger.get(s.run.id)?.status, 'CLEANUP_UNCERTAIN');
    assert.equal(s.workers.list()[0].active, 1); assert.ok(s.runtime.locks.list().length);
    assert.equal(s.runtime.contracts.list()[0].process.state, 'UNKNOWN'); assert.equal(s.runtime.contracts.list()[0].pty.writeOwner, undefined);
    assert.ok(values(s.runtime, s.run.id, 'attempt-cleanup-failure').length);
  } finally {
    Object.defineProperty(MutationWorkspace.prototype, method, {value: original, configurable: true, writable: true});
    const retained = values(s.runtime, s.run.id, 'attempt-before-cleanup')[0];
    if (retained?.identity?.temporaryRoot) { const root = fs.realpathSync(retained.identity.temporaryRoot); assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir())); assert.ok(path.basename(root).startsWith('agent-control-mutation-')); fs.rmSync(root, {recursive: true}); }
  }
});

test('completed and cancelled action contracts revoke writer ownership durably', async t => {
  let calls = 0; const s = setup(t, async () => ++calls === 1 ? replace() : finish()); await s.runtime.tick();
  const contract = s.runtime.contracts.list()[0]; assert.equal(contract.state, 'VERIFYING'); assert.equal(contract.process.state, 'EXITED'); assert.equal(contract.pty.writeOwner, undefined);
  assert.ok(contract.pty.participants.every(item => item.access === 'observe'));
});

test('unacknowledged timed-out action remains UNKNOWN even with no known child PID', async t => {
  let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; });
  const s = setup(t, async () => finish(), actions => { actions.registerReadOnly('uncooperative@1.0.0', async () => { await wait; return {detail: 'late completion'}; }); });
  s.catalog.addJob({apiVersion: 'agent-control/v1', kind: 'Job', metadata: {id: 'uncooperative', name: 'Uncooperative', version: '1.0.0'}, spec: {priority: 'urgent', concurrency: 'no-overlap', steps: [{id: 'wait', action: 'uncooperative@1.0.0', requires: [], resources: ['uncooperative'], timeoutSeconds: 1}]}});
  s.runtime.cancel(s.run.id); const run = s.runtime.createRun('uncooperative@1.0.0', {}, {type: 'manual', actor: 'human:test'});
  await s.runtime.tick(); assert.equal(s.runtime.ledger.get(run.id)?.status, 'CLEANUP_UNCERTAIN');
  assert.equal(s.runtime.contracts.list().at(-1)?.process.state, 'UNKNOWN');
  release(); await turn(); assert.equal(s.runtime.ledger.get(run.id)?.status, 'CLEANUP_UNCERTAIN');
  assert.equal(values(s.runtime, run.id, 'late-action-output')[0].output.detail, 'late completion');
});

test('restart between mutation and verification retains UNKNOWN and the workspace evidence', async t => {
  let calls = 0; const s = setup(t, async () => ++calls === 1 ? replace() : finish()); await s.runtime.tick();
  const identity = values(s.runtime, s.run.id, 'workspace-prepared')[0].identity;
  const restoredActions = registerNonOpenAiCacheQualificationActions(new ActionRegistry(), s.efficiency, environment);
  const restored = createJobRuntime(s.root, s.catalog, restoredActions, s.workers, {efficiency: s.efficiency});
  await restored.tick(); assert.equal(restored.ledger.get(s.run.id)?.status, 'CLEANUP_UNCERTAIN');
  assert.equal(restored.workers.list()[0].active, 1); assert.equal(fs.existsSync(identity.root), true);
  assert.ok(values(restored, s.run.id, 'verification-blocked')[0].durableWorkspaceEvidence.length > 0);
  const owned = fs.realpathSync(identity.temporaryRoot); assert.equal(path.dirname(owned), fs.realpathSync(os.tmpdir())); assert.ok(path.basename(owned).startsWith('agent-control-mutation-')); fs.rmSync(owned, {recursive: true});
});

for (const state of ['CANCELLING', 'CLEANUP_UNCERTAIN', 'DISCONNECTED'] as const) test('restart revokes persisted ' + state + ' contract authority', async t => {
  let started!: () => void, release!: () => void;
  const began = new Promise<void>(resolve => { started = resolve; }), wait = new Promise<void>(resolve => { release = resolve; });
  const s = setup(t, async () => { started(); await wait; return finish(); });
  const active = s.runtime.tick(); await began;
  const run = s.runtime.ledger.get(s.run.id)!; run.status = state; run.steps[0].status = state === 'CANCELLING' ? 'CANCEL_PENDING' : 'CLEANUP_UNCERTAIN'; s.runtime.ledger.update(run, 'fixture.persisted-interruption');
  const restored = createJobRuntime(s.root, s.catalog, s.actions, s.workers, {efficiency: s.efficiency});
  assert.equal(restored.ledger.get(run.id)?.status, 'DISCONNECTED');
  const contract = restored.contracts.list()[0]; assert.equal(contract.process.state, 'UNKNOWN'); assert.equal(contract.pty.writeOwner, undefined); assert.equal(contract.state, 'ORPHANED');
  s.runtime.cancel(s.run.id); release(); await active;
});

test('cancellation bounds an abort-ignoring provider without requiring a provider response', async t => {
  let started!: () => void, release!: () => void;
  const began = new Promise<void>(resolve => { started = resolve; }), wait = new Promise<void>(resolve => { release = resolve; });
  const s = setup(t, async () => { started(); await wait; return replace(); });
  const active = s.runtime.tick(); await began; s.runtime.cancel(s.run.id); await active;
  assert.equal(s.runtime.ledger.get(s.run.id)?.status, 'CLEANUP_UNCERTAIN');
  assert.equal(s.runtime.contracts.list()[0].process.state, 'UNKNOWN');
  assert.equal(s.runtime.ledger.get(s.run.id)?.steps[0].attempts[0].cleanup?.outcome, 'uncertain');
  assert.equal(values(s.runtime, s.run.id, 'provider-request').length, 1); assert.equal(s.workers.list()[0].active, 1);
  release(); for (let i=0;i<20 && !values(s.runtime,s.run.id,'late-action-error').length;i++) await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(values(s.runtime,s.run.id,'tool-request').length,0); assert.ok(values(s.runtime,s.run.id,'late-action-error').length);
  assert.equal(s.runtime.ledger.get(s.run.id)?.status,'CANCELLED');
  assert.equal(values(s.runtime,s.run.id,'cleanup-resolution').length,1);
  assert.equal(s.runtime.ledger.get(s.run.id)?.steps[0].cleanup?.outcome,'confirmed');
  assert.equal(s.runtime.ledger.get(s.run.id)?.steps[0].attempts[0].cleanup?.outcome,'uncertain');
});

test('cancelled Action cannot launch a process after the first cleanup sweep', async t => {
  let started!: () => void, release!: () => void; const began=new Promise<void>(resolve=>{started=resolve;}), wait=new Promise<void>(resolve=>{release=resolve;}); let launched=false;
  const s=setup(t,async()=>finish(),actions=>actions.registerReadOnly('late-process@1.0.0',async context=>{started();await wait;await context.ownedExecution.runProcess({command:process.execPath,args:['-e','process.exit(0)']});launched=true;return {};}));
  s.catalog.addJob({apiVersion:'agent-control/v1',kind:'Job',metadata:{id:'late-process',name:'Late process',version:'1.0.0'},spec:{priority:'urgent',concurrency:'no-overlap',steps:[{id:'wait',action:'late-process@1.0.0',requires:[],resources:['late-process']}]}});
  s.runtime.cancel(s.run.id);const run=s.runtime.createRun('late-process@1.0.0',{}, {type:'manual',actor:'human:test'});const active=s.runtime.tick();await began;s.runtime.cancel(run.id);release();await active;
  assert.equal(launched,false);assert.equal(s.runtime.ledger.get(run.id)?.status,'CANCELLED');assert.equal(s.runtime.ledger.get(run.id)?.steps[0].attempts[0].cleanup?.outcome,'confirmed');
});

for(const kind of ['chat','responses','cli'] as const) test('provider executor forwards live cancellation: '+kind,async()=>{
  const controller=new AbortController();let began!:()=>void;const started=new Promise<void>(resolve=>{began=resolve;});let signal:AbortSignal|undefined,calls=0;
  const wait=(received?:AbortSignal)=>new Promise<any>((_resolve,reject)=>{signal=received;began();received?.addEventListener('abort',()=>reject(new Error('provider-cancelled')),{once:true});});
  const options:any={provider:{id:'provider',name:'Fixture',kind:'local',baseUrl:'http://127.0.0.1:18000/v1',requiresAuth:false,parallelism:1,costClass:'free',capabilities:['tool-request']},workerId:'worker',modelId:'model',cwd:process.cwd(),workerCapabilities:[],modelCapabilities:[],availableToolIds:['return'],qualificationEvidence:['unit-fixture'],health:'healthy'};
  let factory:any;
  if(kind==='chat'){const {StructuredChatProviderFactory}=await import('./structured-chat-provider.js');factory=new StructuredChatProviderFactory({...options,fetch:(_input:any,init:any)=>wait(init.signal)});}
  else if(kind==='responses'){const {ResponsesProviderFactory}=await import('./responses-provider.js');factory=new ResponsesProviderFactory({...options,provider:{...options.provider,kind:'browser-bridge',wireApi:'responses'},fetch:(_input:any,init:any)=>wait(init.signal)});}
  else {const {CodexExecProviderFactory}=await import('./codex-exec-provider.js');factory=new CodexExecProviderFactory({...options,provider:{...options.provider,kind:'cli'},authProbe:async()=>({mode:'chatgpt'}),runner:(request:any)=>wait(request.signal)});}
  const pending=factory.executor('Return data').execute({tools:[{id:'return'}],resourceLimits:{}} as never,{signal:controller.signal,assertActive:()=>controller.signal.throwIfAborted(),invoke:async()=>{calls++;}});await started;controller.abort();await assert.rejects(pending,/provider-cancelled/);assert.equal(signal?.aborted,true);assert.equal(calls,0);
});

test('thrown independent verifier failure is durable before disposable cleanup and restart',async t=>{
 let calls=0;const s=setup(t,async()=>++calls===1?replace():finish());await s.runtime.tick();
 const original=MutationWorkspace.prototype.changedFiles;MutationWorkspace.prototype.changedFiles=function(){MutationWorkspace.prototype.changedFiles=original;throw new Error('verifier-internal-failure');};
 try{await s.runtime.tick();}finally{MutationWorkspace.prototype.changedFiles=original;}
 assert.equal(values(s.runtime,s.run.id,'independent-verification-error')[0].error,'verifier-internal-failure');assert.equal(values(s.runtime,s.run.id,'attempt-before-cleanup').at(-1).error,'verifier-internal-failure');
 const restored=createJobRuntime(s.root,s.catalog,s.actions,s.workers,{efficiency:s.efficiency});assert.equal(values(restored,s.run.id,'independent-verification-error')[0].error,'verifier-internal-failure');assert.equal(values(restored,s.run.id,'attempt-workspace-cleanup').at(-1).outcome,'confirmed');
});

for(const fail of [false,true])test('ordinary '+(fail?'failed':'successful')+' Action proves cleanup of an owned child before completion',async t=>{
 let childPid:number|undefined;const s=setup(t,async()=>finish(),actions=>actions.registerReadOnly('ordinary-process@1.0.0',async context=>{void context.ownedExecution.runProcess({command:process.execPath,args:['-e','setInterval(()=>{},1000)']}).catch(()=>undefined);for(let i=0;i<50&&!context.ownedExecution.activePids().length;i++)await new Promise(r=>setTimeout(r,10));childPid=context.ownedExecution.activePids()[0];if(fail)throw new Error('ordinary-action-failure');return {};}));
 s.catalog.addJob({apiVersion:'agent-control/v1',kind:'Job',metadata:{id:'ordinary-process',name:'Ordinary process',version:'1.0.0'},spec:{priority:'urgent',concurrency:'no-overlap',steps:[{id:'execute',action:'ordinary-process@1.0.0',requires:[],resources:['ordinary-process']}]}});s.runtime.cancel(s.run.id);const run=s.runtime.createRun('ordinary-process@1.0.0',{}, {type:'manual',actor:'human:test'});await s.runtime.tick();assert.ok(childPid);assert.throws(()=>process.kill(childPid!,0));assert.equal(s.runtime.ledger.get(run.id)?.status,fail?'FAILED':'SUCCEEDED');assert.equal(s.runtime.ledger.get(run.id)?.steps[0].cleanup?.outcome,'confirmed');
});

test('verifier submission is fenced when human takeover occurs at the acceptance boundary',async t=>{
 let calls=0;const s=setup(t,async()=>++calls===1?replace():finish());await s.runtime.tick();const source=s.runtime.contracts.list()[0];s.runtime.contracts.humanTakeover(source.id,'human:acceptance-supervisor');await s.runtime.tick();const current=s.runtime.contracts.get(source.id);assert.equal(current.pty.writeOwner,'human:acceptance-supervisor');assert.equal(current.state,'PAUSED');assert.notEqual(current.verification.state,'PASSED');assert.equal(s.runtime.ledger.get(s.run.id)?.status,'PAUSED');assert.equal(s.runtime.ledger.get(s.run.id)?.steps[1].attempts.length,0);
});

test('takeover of a prior contract in the same lane aborts a live verifier before acceptance',async t=>{
 let calls=0;const s=setup(t,async()=>++calls===1?replace():finish());await s.runtime.tick();
 let began!:()=>void,release!:()=>void;const started=new Promise<void>(r=>{began=r;}),wait=new Promise<void>(r=>{release=r;});const original=s.actions.handler('qualification.non-openai-cache.verify@1.0.0');
 (s.actions.resolve('qualification.non-openai-cache.verify@1.0.0') as any).handler=async(context:ActionContext)=>{began();await wait;return original(context);};
 const source=s.runtime.contracts.list()[0],active=s.runtime.tick();await started;s.runtime.contracts.humanTakeover(source.id,'human:live-verifier-supervisor');release();await active;
 assert.equal(s.runtime.ledger.get(s.run.id)?.status,'PAUSED');assert.equal(s.runtime.contracts.get(source.id).pty.writeOwner,'human:live-verifier-supervisor');assert.notEqual(s.runtime.contracts.get(source.id).verification.state,'PASSED');
});

test('restart in the mutation-success persistence window seals blocked verification and retains resource ownership',async t=>{
 let calls=0;const s=setup(t,async()=>++calls===1?replace():finish());await s.runtime.tick();const run=s.runtime.ledger.get(s.run.id)!;run.status='RUNNING';run.steps[1].status='QUEUED';s.runtime.ledger.update(run,'fixture.crash-window');const identity=values(s.runtime,run.id,'workspace-prepared')[0].identity;
 const freshWorkers=new WorkerRegistry().register({...s.workers.list()[0],active:0});const restored=createJobRuntime(s.root,s.catalog,s.actions,freshWorkers,{efficiency:s.efficiency});assert.equal(restored.ledger.get(run.id)?.status,'DISCONNECTED');const recovery=values(restored,run.id,'controller-recovery-blocked')[0];assert.equal(recovery.verification,'BLOCKED');assert.equal(recovery.cleanup,'UNKNOWN');assert.ok(recovery.retainedArtifacts.some((a:any)=>a.name==='workspace-prepared'));assert.equal(freshWorkers.list()[0].active,1);assert.ok(restored.locks.list().length);assert.equal(fs.existsSync(identity.root),true);
 const owned=fs.realpathSync(identity.temporaryRoot);assert.equal(path.dirname(owned),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(owned).startsWith('agent-control-mutation-'));fs.rmSync(owned,{recursive:true});
});

for(const uncertain of [false,true])test('cancellation between mutation and verification reconciles retained workspace: '+uncertain,async t=>{
 let calls=0;const s=setup(t,async()=>++calls===1?replace():finish());await s.runtime.tick();const identity=values(s.runtime,s.run.id,'workspace-prepared')[0].identity;assert.ok(fs.existsSync(identity.root));assert.ok(s.runtime.locks.list().some((x:any)=>x.retained));const original=MutationWorkspace.prototype.cleanup;if(uncertain)MutationWorkspace.prototype.cleanup=()=>{throw Error('between-step-cleanup-denied');};
 try{s.runtime.cancel(s.run.id);for(let n=0;n<100&&s.runtime.ledger.get(s.run.id)?.status==='CANCELLING';n++)await new Promise(r=>setTimeout(r,10));assert.equal(s.runtime.ledger.get(s.run.id)?.status,uncertain?'CLEANUP_UNCERTAIN':'CANCELLED');assert.equal(fs.existsSync(identity.root),uncertain);assert.equal(values(s.runtime,s.run.id,'retained-cleanup-outcome').at(-1).proof.outcome,uncertain?'uncertain':'confirmed');assert.ok(values(s.runtime,s.run.id,'attempt-before-cleanup').at(-1).workspace.files.length);if(uncertain){assert.ok(s.runtime.locks.list().length);assert.equal(s.workers.list()[0].active,1);assert.equal(s.runtime.contracts.list()[0].process.state,'UNKNOWN');}else assert.equal(s.runtime.contracts.list()[0].state,'CANCELLED');}
 finally{MutationWorkspace.prototype.cleanup=original;if(fs.existsSync(identity.temporaryRoot))fs.rmSync(identity.temporaryRoot,{recursive:true});}
});
test('post-action output rejection cleans up the retained workspace with durable evidence',async t=>{let calls=0;const s=setup(t,async()=>++calls===1?replace():finish());const original=s.actions.resolve('qualification.non-openai-cache.mutate@1.0.0') as any,execute=original.handler.execute;original.handler.execute=async(context:ActionContext)=>{const out=await execute(context);return {...out,artifacts:[{name:'undeclared',value:{}}]};};await s.runtime.tick();const identity=values(s.runtime,s.run.id,'workspace-prepared')[0].identity;assert.equal(fs.existsSync(identity.root),false);assert.equal(s.runtime.ledger.get(s.run.id)?.status,'FAILED');assert.equal(values(s.runtime,s.run.id,'retained-cleanup-outcome').at(-1).proof.outcome,'confirmed');});

for(const kind of ['loop','chat','responses','cli'] as const)test('provider rejects a missing live control before any request or tool: '+kind,async()=>{let effects=0;const options:any={provider:{id:'provider',name:'Fixture',kind:'local',baseUrl:'http://127.0.0.1:18000/v1',requiresAuth:false,parallelism:1,costClass:'free',capabilities:['tool-request']},workerId:'worker',modelId:'model',cwd:process.cwd(),workerCapabilities:[],modelCapabilities:[],availableToolIds:['return'],qualificationEvidence:['unit-fixture'],health:'healthy',fetch:async()=>{effects++;throw Error('request must not run');}};let factory:any;if(kind==='loop'){const {StructuredChatLoopProvider}=await import('./structured-chat-loop-provider.js');factory=new StructuredChatLoopProvider({providerId:'provider',modelId:'model',baseUrl:'http://127.0.0.1:18000/v1',toolSchemas:[{id:'return',description:'unit result',inputSchema:{type:'object'}}],finishToolId:'return',fetch:options.fetch});}else if(kind==='chat'){const {StructuredChatProviderFactory}=await import('./structured-chat-provider.js');factory=new StructuredChatProviderFactory(options);}else if(kind==='responses'){const {ResponsesProviderFactory}=await import('./responses-provider.js');factory=new ResponsesProviderFactory({...options,provider:{...options.provider,kind:'browser-bridge',wireApi:'responses'}});}else{const {CodexExecProviderFactory}=await import('./codex-exec-provider.js');factory=new CodexExecProviderFactory({...options,provider:{...options.provider,kind:'cli'},authProbe:async()=>({mode:'chatgpt'}),runner:async()=>{effects++;throw Error('runner must not run');}});}await assert.rejects(()=>factory.executor('unit').execute({resourceLimits:{}} as never,{invoke:async()=>{effects++;}} as never),/provider_live_control_required/);assert.equal(effects,0);});

test('truncated provider body is durable with partial bytes before cleanup and after restart',async t=>{const partial='{"choices":[';const s=setup(t,async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(partial));setTimeout(()=>controller.error(new Error('provider-body-truncated')),10);}}),{status:200}));await s.runtime.tick();assert.equal(s.runtime.ledger.get(s.run.id)?.status,'FAILED');const failure=values(s.runtime,s.run.id,'provider-failure')[0];assert.equal(failure.phase,'body-read');assert.equal(failure.partialBody,partial);assert.equal(Buffer.from(failure.partialBodyBase64,'base64').toString(),partial);assert.match(failure.error,/provider-body-truncated/);assert.equal(values(s.runtime,s.run.id,'attempt-workspace-cleanup').at(-1).outcome,'confirmed');const restored=createJobRuntime(s.root,s.catalog,s.actions,s.workers,{efficiency:s.efficiency});assert.equal(values(restored,s.run.id,'provider-failure')[0].partialBody,partial);});

test('restart between dispatch persistence and contract binding retains worker and resources',t=>{const s=setup(t,async()=>finish());const run=s.runtime.ledger.get(s.run.id)!;run.status='RUNNING';run.steps[0].status='RUNNING';run.steps[0].attempts.push({attempt:1,startedAt:new Date().toISOString(),workerId:s.workers.list()[0].id});s.runtime.ledger.update(run,'step.dispatched');const fresh=new WorkerRegistry().register({...s.workers.list()[0],active:0}),restored=createJobRuntime(s.root,s.catalog,s.actions,fresh,{efficiency:s.efficiency});assert.equal(restored.ledger.get(run.id)?.status,'DISCONNECTED');assert.equal(fresh.list()[0].active,1);assert.ok(restored.locks.list().some(x=>x.runId===run.id&&x.retained));assert.equal(values(restored,run.id,'controller-recovery-blocked')[0].cleanup,'UNKNOWN');});
test('uncertain preparation cleanup is durable and holds ownership across restart',async t=>{const s=setup(t,async()=>finish());const cp=fs.cpSync,cleanup=MutationWorkspace.prototype.cleanup;fs.cpSync=()=>{throw Error('injected-fixture-copy-failure');};MutationWorkspace.prototype.cleanup=()=>{throw Error('injected-preparation-cleanup-unproved');};let retained:any;
 try{await s.runtime.tick();assert.equal(s.runtime.ledger.get(s.run.id)?.status,'CLEANUP_UNCERTAIN');assert.equal(s.workers.list()[0].active,1);retained=values(s.runtime,s.run.id,'workspace-preparation-failed')[0];assert.ok(fs.existsSync(retained.temporaryRoot));const fresh=new WorkerRegistry().register({...s.workers.list()[0],active:0}),restored=createJobRuntime(s.root,s.catalog,s.actions,fresh,{efficiency:s.efficiency});assert.equal(fresh.list()[0].active,1);assert.ok(restored.locks.list().length);assert.ok(restored.contracts.list().some(c=>c.process.state==='UNKNOWN'));assert.ok(values(restored,s.run.id,'controller-recovery-blocked')[0].retainedArtifacts.some((a:any)=>a.name==='workspace-preparation-failed'));}
 finally{fs.cpSync=cp;MutationWorkspace.prototype.cleanup=cleanup;if(retained?.temporaryRoot){const resolved=fs.realpathSync(retained.temporaryRoot);assert.equal(path.dirname(resolved),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('agent-control-mutation-'));fs.rmSync(resolved,{recursive:true});}}
});

for(const acknowledge of [true,false])test('late cancelled action requires positive retained restoration acknowledgement: '+acknowledge,async t=>{
 let begin!:()=>void,release!:()=>void,settled!:()=>void;const began=new Promise<void>(r=>begin=r),gate=new Promise<void>(r=>release=r),done=new Promise<void>(r=>settled=r);
 const s=setup(t,async()=>finish(),actions=>actions.registerReadOnly('restore-late@1.0.0',async c=>{const ack=c.retainCleanup!({kind:'fixture-restoration'},async()=>({outcome:'uncertain',reason:'missing',requestedAt:new Date().toISOString(),completedAt:new Date().toISOString(),processes:[]}));begin();await gate;if(acknowledge){const at=new Date().toISOString();ack({outcome:'confirmed',reason:'fixture-restored',requestedAt:at,completedAt:at,processes:[]});}settled();return {};}));
 s.runtime.cancel(s.run.id);s.catalog.addJob({apiVersion:'agent-control/v1',kind:'Job',metadata:{id:'restore-late',version:'1.0.0',name:'Late restoration'},spec:{priority:'normal',concurrency:'no-overlap',steps:[{id:'restore',action:'restore-late@1.0.0',requires:[],resources:['restore-late']}]}});
 const run=s.runtime.createRun('restore-late@1.0.0',{}, {type:'manual',actor:'human:test'}),active=s.runtime.tick();await began;s.runtime.cancel(run.id);await active;assert.equal(s.runtime.ledger.get(run.id)!.status,'CLEANUP_UNCERTAIN');const prior=s.runtime.ledger.get(run.id)!.steps[0].attempts;
 release();await done;for(let i=0;i<10;i++)await turn();const final=s.runtime.ledger.get(run.id)!;assert.equal(final.status,acknowledge?'CANCELLED':'CLEANUP_UNCERTAIN');assert.deepEqual(final.steps[0].attempts,prior);assert.equal(values(s.runtime,run.id,'cleanup-resolution').length,acknowledge?1:0);if(acknowledge){assert.equal(final.steps[0].cleanup!.outcome,'confirmed');assert.equal(s.runtime.locks.list().filter(l=>l.runId===run.id).length,0);}
});

test('installed qualification action exposes semantic tools only under both explicit gates and retains semantic evidence', async t => {
  const requests: any[] = [];
  const replies = [
    {name:'replace_text',arguments:JSON.stringify({path:'src/constants.js',oldText:'30_000',newText:'45_000'})},
    {name:'finish_work',arguments:JSON.stringify({summary:'Done'})},
  ];
  const s = setup(t, async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({choices:[{message:{content:null,tool_calls:[{id:`call-${requests.length}`,type:'function',function:replies.shift()}]},finish_reason:'tool_calls'}]});
  }, undefined, {AGENT_CONTROL_SEMANTIC_TOOL_V1:'true'});
  await s.runtime.tick(); await s.runtime.tick();
  assert.equal(s.runtime.ledger.get(s.run.id)?.status,'SUCCEEDED');
  assert.ok(requests[0].tools.some((tool:any)=>tool.function.name==='replace_text'));
  assert.ok(values(s.runtime,s.run.id,'semantic').length > 0);
  assert.equal(values(s.runtime,s.run.id,'independent-verification')[0].verifier.passed,true);
  assert.equal(values(s.runtime,s.run.id,'attempt-workspace-cleanup')[0].outcome,'confirmed');
});
test('semantic flag cannot register qualification actions when the primary qualification gate is off', () => {
  const actions = registerNonOpenAiCacheQualificationActions(new ActionRegistry(),new MemoryHarnessEfficiencyLedger(),{AGENT_CONTROL_SEMANTIC_TOOL_V1:'true'});
  assert.equal(actions.ids().has('qualification.non-openai-cache.mutate@1.0.0'),false);
});

test('installed qualification action can explicitly select legacy deterministic repair without semantic fallback', async t => {
  let calls=0;
  const request={tool:MUTATION_TOOL_IDS.replace,input:{path:'src/constants.js',oldText:'30_000',newText:'45_000'}};
  const s=setup(t,async()=>++calls===1?Response.json({choices:[{message:{content:JSON.stringify(request).slice(0,-1)+',}'}}]}):finish(),undefined,{AGENT_CONTROL_SEMANTIC_TOOL_V1:'true'},{toolInterface:'LEGACY_TOOL_REQUEST'});
  await s.runtime.tick();await s.runtime.tick();
  assert.equal(s.runtime.ledger.get(s.run.id)?.status,'SUCCEEDED');
  assert.ok(values(s.runtime,s.run.id,'repair').some(value=>value.event.repair!=='NONE'&&value.event.decision==='DISPATCH'));
  assert.equal(values(s.runtime,s.run.id,'independent-verification')[0].verifier.passed,true);
});

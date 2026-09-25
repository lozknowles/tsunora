import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {AdaptiveHarness, SkillCatalog, ToolPolicy, type HarnessCandidate, type RecipeRequest} from '../src/control/adaptive-harness.js';
import {HarnessDispatcher, HarnessJobAgentAction, MemoryRecipeDispatchStore, ToolHandlerRegistry, type RecipeDispatchPlan, type ToolPolicyAuditEvent} from '../src/control/harness-dispatch.js';
import {JobCatalog} from '../src/control/job-catalog.js';
import {ActionRegistry, ArtifactStore, JobRuntime, ResourceLockManager, RunLedger, WorkerRegistry} from '../src/control/job-runtime.js';
import {StructuredChatProviderFactory} from '../src/control/structured-chat-provider.js';

const baseUrl = required('AGENT_CONTROL_QUALIFICATION_BASE_URL');
const modelId = required('AGENT_CONTROL_QUALIFICATION_MODEL');
const resultFile = path.resolve(process.env.AGENT_CONTROL_QUALIFICATION_RESULT || 'qualification-results/real-harness-job.json');
const endpoint = new URL(baseUrl);
const loopback = ['127.0.0.1', 'localhost', '::1'].includes(endpoint.hostname);
if (!loopback && process.env.AGENT_CONTROL_QUALIFICATION_ALLOW_REMOTE !== 'true') throw new Error('qualification_endpoint_must_be_loopback_or_explicitly_approved');

const startedAt = new Date().toISOString();
const modelsResponse = await fetch(`${baseUrl.replace(/\/$/, '')}/models`);
const modelsBody = await modelsResponse.json() as {data?: Array<{id?: string}>};
if (!modelsResponse.ok) throw new Error(`model_discovery_failed:${modelsResponse.status}`);
if (!modelsBody.data?.some(model => model.id === modelId)) throw new Error('qualification_model_identity_mismatch');
const modelListHash = createHash('sha256').update(JSON.stringify(modelsBody)).digest('hex');

const workerId = 'qualification-worker';
let liveAuthority = {laneId: 'qualification-lane', leaseGeneration: 11, ownershipGeneration: 17, owner: 'agent' as const};
const policy = new ToolPolicy([
  {id: 'qualification.inspect', risk: 'read', capabilities: ['fixture.read']},
  {id: 'qualification.denied', risk: 'read', capabilities: ['fixture.read']},
]);
const audits: ToolPolicyAuditEvent[] = [];
const handlers = new ToolHandlerRegistry().register('qualification.inspect', async input => ({marker: 'REAL-HARNESS-JOB-OK', input, immutableFixture: true}));
let deniedHandlerCalls = 0;
handlers.register('qualification.denied', async () => { deniedHandlerCalls++; return 'BYPASS'; });
const dispatchStore = new MemoryRecipeDispatchStore();
const dispatcher = new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(), policy), policy, handlers, () => ({authority: {...liveAuthority}, workerId, availableToolIds: ['qualification.inspect', 'qualification.denied'], approvedRisks: ['read']}), dispatchStore, event => audits.push(event));
const provider = new StructuredChatProviderFactory({
  provider: {id: 'local-openai-compatible', name: 'Qualification local model', kind: 'local', baseUrl, requiresAuth: false, parallelism: 1, costClass: 'free', capabilities: ['structured-output', 'tool-request']},
  workerId, modelId, workerCapabilities: ['model.execute'], modelCapabilities: ['structured-output', 'tool-request'], availableToolIds: ['qualification.inspect'], qualificationEvidence: [`models-http-${modelsResponse.status}`, `models-sha256-${modelListHash}`], health: 'healthy', timeoutMs: 30_000,
});

const actions = new ActionRegistry();
actions.registerControl('qualification.control@1.0.0', async () => ({verification: ['control-ok']}));
actions.registerAgent('qualification.real-model-tool@1.0.0', new HarnessJobAgentAction(dispatcher, context => ({
  plan: plan(context.run.id, context.step.id, context.worker.id, provider.candidate(), liveAuthority),
  executor: provider.executor('Inspect the safe qualification fixture and report its marker by requesting the granted tool.'),
  toActionOutput: result => {
    const payload = JSON.parse(result.execution.resultRef ?? '{}') as {toolOutput?: {marker?: string; immutableFixture?: boolean}};
    const verified = payload.toolOutput?.marker === 'REAL-HARNESS-JOB-OK' && payload.toolOutput.immutableFixture === true && result.execution.evidence?.includes('tool_executed:qualification.inspect');
    return {artifacts: [{name: 'model-result', value: payload}], evidence: result.execution.evidence, verification: verified ? ['real-model-tool-evidence'] : [], detail: result.execution.resultRef};
  },
})));

const catalog = new JobCatalog(actions.ids());
catalog.addJob({apiVersion: 'agent-control/v1', kind: 'Job', metadata: {id: 'real-harness-qualification', name: 'Real adaptive harness qualification', version: '1.0.0'}, spec: {priority: 'normal', concurrency: 'no-overlap', steps: [{id: 'model-tool', action: 'qualification.real-model-tool@1.0.0', requires: ['model.execute'], outputs: [{name: 'model-result', type: 'application/json', schema: 'qualification-result/v1', version: '1.0.0'}], verification: ['real-model-tool-evidence']}]}});
const workers = new WorkerRegistry().register({id: workerId, capabilities: ['model.execute'], health: 'healthy', capacity: 1, active: 0, observedAt: startedAt});
const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-real-harness-'));
try {
  const ledger = new RunLedger(path.join(stateRoot, 'run-ledger.json'));
  const artifacts = new ArtifactStore(path.join(stateRoot, 'artifacts'));
  const runtime = new JobRuntime(catalog, actions, workers, ledger, artifacts, new ResourceLockManager(path.join(stateRoot, 'locks.json')));
  const created = runtime.createRun('real-harness-qualification@1.0.0', {}, {type: 'manual', actor: 'qualification'});
  await runtime.tick();
  const run = ledger.get(created.id)!;
  const artifact = artifacts.list(created.id)[0];
  const ledgerEvents = fs.readFileSync(path.join(stateRoot, 'run-events.jsonl'), 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line) as {type: string; status: string});
  const denials = await qualifyDenials(provider.candidate());
  const output = {
    schema: 'agent-control.real-harness-qualification/v1', startedAt, completedAt: new Date().toISOString(), host: os.hostname(), branch: process.env.AGENT_CONTROL_QUALIFICATION_BRANCH,
    provider: {id: 'local-openai-compatible', transport: 'OpenAI-compatible chat/completions', endpointScope: loopback ? 'loopback' : 'explicit-private-remote', baseUrl: `${endpoint.protocol}//${endpoint.hostname}:${endpoint.port || 'default'}/v1`, modelId, modelListHttpStatus: modelsResponse.status, modelListSha256: modelListHash},
    job: {id: run.jobId, version: run.jobVersion, action: run.steps[0].action, actionKind: actions.kind(run.steps[0].action), runId: run.id, status: run.status, stepStatus: run.steps[0].status, verification: run.steps[0].verification},
    path: ['Job', 'HarnessJobAgentAction', 'HarnessDispatcher', 'AdaptiveHarness', 'ExecutionRecipe', 'real-model-provider', 'structured-tool-request', 'ToolInvocationGateway', 'ToolPolicy', 'tool-handler', 'evidence', 'VERIFYING', 'verified-result'],
    recipe: dispatchStore.list()[0], audits, artifact: artifact ? {id: artifact.id, sha256: artifact.sha256, schema: artifact.schema, version: artifact.version} : null,
    ledgerEvents, provenance: run.provenance, denials, opaqueCli: {integrated: false, reason: 'internal CLI tool calls are not individually mediated; no ToolPolicy weakening accepted'},
    verdict: run.status === 'SUCCEEDED' && denials.every(item => item.pass) && deniedHandlerCalls === 0 ? 'REAL_HARNESS_EXECUTION_QUALIFIED' : 'REAL_HARNESS_EXECUTION_FAILED',
  };
  fs.mkdirSync(path.dirname(resultFile), {recursive: true});
  fs.writeFileSync(resultFile, `${JSON.stringify(output, null, 2)}\n`, {mode: 0o600});
  console.log(JSON.stringify(output));
  if (output.verdict !== 'REAL_HARNESS_EXECUTION_QUALIFIED') process.exitCode = 1;
} finally { fs.rmSync(stateRoot, {recursive: true, force: true}); }

function plan(runId: string, stepId: string, placedWorker: string, candidate: HarnessCandidate, authority: RecipeRequest['authority']): RecipeDispatchPlan {
  return {request: {taskId: `${runId}:${stepId}`, taskType: 'qualification', requiredCapabilities: ['structured-output', 'tool-request'], requiredTools: ['qualification.inspect'], approvedRisks: ['read'], intent: 'ECONOMY', inputTokens: 64, outputTokens: 64, context: {tier: 1, sourceIds: [], evidenceIds: [], estimatedTokens: 32}, authority: {...authority}, verification: {requiredEvidence: ['real-model-tool-evidence'], requireIndependentCheck: true}, escalation: {minimumConfidence: .7, maximumAttempts: 1, onFailure: 'review'}}, candidates: [candidate], placement: {workerId: placedWorker, reason: 'Job capability placement selected qualification worker'}};
}

async function qualifyDenials(candidate: HarnessCandidate) {
  const cases: Array<{name: string; pass: boolean; observed: string}> = [];
  const base = plan('denial-run', 'denial-step', workerId, candidate, {laneId: 'qualification-lane', leaseGeneration: 11, ownershipGeneration: 17, owner: 'agent'});
  async function denied(name: string, authority: typeof liveAuthority, toolId = 'qualification.inspect') {
    liveAuthority = authority;
    try { await dispatcher.dispatch(base, {execute: async (_recipe, gateway) => ({resultRef: String(await gateway.invoke(toolId))})}); cases.push({name, pass: false, observed: 'allowed'}); }
    catch (error) { const observed = error instanceof Error ? error.message : String(error); cases.push({name, pass: observed.startsWith('tool_policy_denied:'), observed}); }
  }
  await denied('tool_not_granted', {laneId: 'qualification-lane', leaseGeneration: 11, ownershipGeneration: 17, owner: 'agent'}, 'qualification.denied');
  await denied('stale_lease_generation', {laneId: 'qualification-lane', leaseGeneration: 12, ownershipGeneration: 17, owner: 'agent'});
  await denied('stale_ownership_generation', {laneId: 'qualification-lane', leaseGeneration: 11, ownershipGeneration: 18, owner: 'agent'});
  liveAuthority = {laneId: 'qualification-lane', leaseGeneration: 11, ownershipGeneration: 17, owner: 'agent'};
  let first = false;
  try {
    await dispatcher.dispatch(base, {execute: async (_recipe, gateway) => { await gateway.invoke('qualification.inspect'); first = true; liveAuthority = {...liveAuthority, owner: 'human', ownershipGeneration: 18}; await gateway.invoke('qualification.inspect'); return {}; }});
    cases.push({name: 'human_takeover_live_recipe', pass: false, observed: 'allowed'});
  } catch (error) {
    const observed = error instanceof Error ? error.message : String(error);
    cases.push({name: 'human_takeover_live_recipe', pass: first && observed === 'tool_policy_denied:human_owns_execution', observed});
  }
  return cases;
}

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`missing_${name.toLowerCase()}`); return value; }

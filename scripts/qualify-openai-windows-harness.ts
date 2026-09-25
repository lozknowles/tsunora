import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {AdaptiveHarness, SkillCatalog, ToolPolicy, type RecipeRequest} from '../src/control/adaptive-harness.js';
import {HarnessDispatcher, HarnessJobAgentAction, MemoryRecipeDispatchStore, ToolHandlerRegistry, type ToolPolicyAuditEvent} from '../src/control/harness-dispatch.js';
import {JobCatalog} from '../src/control/job-catalog.js';
import {ActionRegistry, ArtifactStore, JobRuntime, ResourceLockManager, RunLedger, WorkerRegistry} from '../src/control/job-runtime.js';
import {CodexExecProviderFactory} from '../src/control/codex-exec-provider.js';
import {selectOpenAIExecutionProvider, type OpenAIAuthPreference} from '../src/control/openai-provider-selector.js';
import {ResponsesProviderFactory} from '../src/control/responses-provider.js';

const authPreference = preference(process.env.OPENAI_AUTH_MODE);
const apiModelId = process.env.OPENAI_API_MODEL || process.env.OPENAI_QUALIFICATION_MODEL || 'gpt-4o-mini';
const chatGptModelId = process.env.CODEX_CHATGPT_MODEL || 'gpt-5.6-terra';
const resultFile = path.resolve(process.env.AGENT_CONTROL_QUALIFICATION_RESULT || 'qualification-results/windows-openai-harness.json');
const startedAt = new Date().toISOString();
const workerId = 'windows-api-worker';
const authority = {laneId: 'windows-api-qualification', leaseGeneration: 23, ownershipGeneration: 31, owner: 'agent' as const};
const policy = new ToolPolicy([{id: 'qualification.return-data', risk: 'read', capabilities: ['structured-output']}]);
const audits: ToolPolicyAuditEvent[] = [];
const tools = new ToolHandlerRegistry().register('qualification.return-data', async input => ({marker: 'WINDOWS-OPENAI-HARNESS-OK', platform: process.platform, input}));
const store = new MemoryRecipeDispatchStore();
const dispatcher = new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(), policy), policy, tools, () => ({authority: {...authority}, workerId, availableToolIds: ['qualification.return-data'], approvedRisks: ['read']}), store, event => audits.push(event));
const selected = selectOpenAIExecutionProvider({
  preference: authPreference,
  apiKey: () => process.env.OPENAI_API_KEY,
  apiProvider: authorization => new ResponsesProviderFactory({
    provider: {id: 'openai-responses', name: 'Official OpenAI Responses API', kind: 'responses', baseUrl: 'https://api.openai.com/v1', wireApi: 'responses', requiresAuth: true, parallelism: 1, costClass: 'metered', capabilities: ['structured-output', 'tool-request']},
    workerId, modelId: apiModelId, workerCapabilities: ['platform.windows', 'model.execute'], modelCapabilities: ['structured-output', 'tool-request'], availableToolIds: ['qualification.return-data'], qualificationEvidence: ['official-responses-api', `live-windows-${startedAt}`], health: 'healthy', timeoutMs: 45_000, authorization,
  }),
  chatGptPlanProvider: () => new CodexExecProviderFactory({
    provider: {id: 'codex-chatgpt-plan', name: 'Official Codex CLI with ChatGPT plan', kind: 'cli', requiresAuth: true, parallelism: 1, costClass: 'included', capabilities: ['structured-output', 'tool-request']},
    workerId, modelId: chatGptModelId, cwd: process.cwd(), workerCapabilities: ['platform.windows', 'model.execute'], modelCapabilities: ['structured-output', 'tool-request'], availableToolIds: ['qualification.return-data'], qualificationEvidence: ['official-codex-exec-contract', `windows-attempt-${startedAt}`], health: 'healthy', timeoutMs: 90_000,
  }),
});
const provider = selected.provider;
const modelId = selected.mode === 'api-key' ? apiModelId : chatGptModelId;
const actions = new ActionRegistry();
actions.registerAgent('qualification.openai-windows-return@1.0.0', new HarnessJobAgentAction(dispatcher, context => {
  const request: RecipeRequest = {taskId: `${context.run.id}:${context.step.id}`, taskType: 'qualification', requiredCapabilities: ['structured-output', 'tool-request'], requiredTools: ['qualification.return-data'], approvedRisks: ['read'], intent: 'NORMAL', inputTokens: 64, outputTokens: 64, maximumMonetarySpend: .05, meteredApproved: selected.mode === 'api-key', context: {tier: 1, sourceIds: [], evidenceIds: [], estimatedTokens: 24}, authority: {...authority}, verification: {requiredEvidence: ['windows-openai-return-data'], requireIndependentCheck: true}, escalation: {minimumConfidence: .7, maximumAttempts: 1, onFailure: 'review'}};
  return {plan: {request, candidates: [provider.candidate()], placement: {workerId: context.worker.id, reason: 'Windows worker satisfies platform and model execution capabilities'}}, executor: provider.executor('Call the supplied function with JSON containing {"requested":"returnable-data","count":3}.'), toActionOutput: result => {
    const payload = JSON.parse(result.execution.resultRef ?? '{}') as {toolOutput?: {marker?: string; platform?: string}};
    const verified = payload.toolOutput?.marker === 'WINDOWS-OPENAI-HARNESS-OK' && payload.toolOutput.platform === 'win32' && result.execution.evidence?.includes('tool_executed:qualification.return-data');
    return {artifacts: [{name: 'openai-result', value: payload}], evidence: result.execution.evidence, verification: verified ? ['windows-openai-return-data'] : [], detail: result.execution.resultRef};
  }};
}));
const catalog = new JobCatalog(actions.ids());
catalog.addJob({apiVersion: 'agent-control/v1', kind: 'Job', metadata: {id: 'openai-windows-return-data', name: 'OpenAI Windows return-data qualification', version: '1.0.0'}, spec: {priority: 'normal', concurrency: 'no-overlap', steps: [{id: 'model', action: 'qualification.openai-windows-return@1.0.0', requires: ['platform.windows', 'model.execute'], outputs: [{name: 'openai-result', type: 'application/json', schema: 'openai-return-data/v1', version: '1.0.0'}], verification: ['windows-openai-return-data']}]}});
const workers = new WorkerRegistry().register({id: workerId, capabilities: ['platform.windows', 'model.execute'], health: 'healthy', capacity: 1, active: 0, observedAt: startedAt});
const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-openai-windows-'));
try {
  const ledger = new RunLedger(path.join(stateRoot, 'run-ledger.json'));
  const artifacts = new ArtifactStore(path.join(stateRoot, 'artifacts'));
  const runtime = new JobRuntime(catalog, actions, workers, ledger, artifacts, new ResourceLockManager(path.join(stateRoot, 'locks.json')));
  const created = runtime.createRun('openai-windows-return-data@1.0.0', {}, {type: 'manual', actor: 'qualification'});
  await runtime.tick();
  const run = ledger.get(created.id)!;
  const artifact = artifacts.list(created.id)[0];
  const artifactValue = artifact ? artifacts.read(artifact.id) as {toolOutput?: {marker?: string; platform?: string}} : undefined;
  const output = {
    schema: 'agent-control.openai-windows-qualification/v1', startedAt, completedAt: new Date().toISOString(), platform: process.platform, hostHash: hash(os.hostname()),
    provider: selected.mode === 'api-key'
      ? {id: 'openai-responses', transport: 'POST https://api.openai.com/v1/responses', authentication: 'API key supplied outside persisted state', authMode: selected.mode, selectionReason: selected.reason, modelId}
      : {id: 'codex-chatgpt-plan', transport: 'official codex exec JSONL', authentication: 'saved Codex ChatGPT sign-in; API key variables removed from child process', authMode: selected.mode, selectionReason: selected.reason, modelId},
    job: {id: run.jobId, version: run.jobVersion, action: run.steps[0].action, kind: actions.kind(run.steps[0].action), runId: run.id, status: run.status, stepStatus: run.steps[0].status, error: run.steps[0].error, errors: run.errors, verification: run.steps[0].verification},
    path: ['Job', 'HarnessJobAgentAction', 'HarnessDispatcher', 'AdaptiveHarness', 'ExecutionRecipe', selected.mode === 'api-key' ? 'OpenAI Responses API' : 'Codex exec with ChatGPT plan', selected.mode === 'api-key' ? 'function_call' : 'schema-constrained return request', 'ToolInvocationGateway', 'ToolPolicy', 'tool-handler', 'typed artifact', 'verification'],
    recipe: store.list()[0], audits, provenance: run.provenance,
    artifact: artifact ? {id: artifact.id, sha256: artifact.sha256, type: artifact.type, schema: artifact.schema, version: artifact.version, marker: artifactValue?.toolOutput?.marker} : null,
    desktopUi: {qualified: false, status: 'NOT_TESTED', reason: 'No documented desktop automation API or approved local bridge; no scraping or session harvesting performed'},
    verdict: run.status === 'SUCCEEDED' && artifactValue?.toolOutput?.marker === 'WINDOWS-OPENAI-HARNESS-OK' ? 'WINDOWS_OPENAI_RETURN_DATA_QUALIFIED' : 'WINDOWS_OPENAI_RETURN_DATA_FAILED',
  };
  fs.mkdirSync(path.dirname(resultFile), {recursive: true});
  fs.writeFileSync(resultFile, `${JSON.stringify(output, null, 2)}\n`, {mode: 0o600});
  console.log(JSON.stringify({verdict: output.verdict, modelId, runStatus: run.status, stepStatus: run.steps[0].status, artifactSha256: artifact?.sha256, providerResponseEvidence: run.provenance.length, resultFile}));
  if (output.verdict !== 'WINDOWS_OPENAI_RETURN_DATA_QUALIFIED') process.exitCode = 1;
} finally { fs.rmSync(stateRoot, {recursive: true, force: true}); }

function preference(value: string | undefined): OpenAIAuthPreference {
  const normalized = value?.trim() || 'auto';
  if (!['auto', 'api-key', 'chatgpt-plan'].includes(normalized)) throw new Error('invalid_openai_auth_mode');
  return normalized as OpenAIAuthPreference;
}
function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }

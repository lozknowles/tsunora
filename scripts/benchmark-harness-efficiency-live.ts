import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {AdaptiveHarness, SkillCatalog, ToolPolicy, type RecipeRequest} from '../src/control/adaptive-harness.js';
import {HarnessDispatcher, MemoryRecipeDispatchStore, ToolHandlerRegistry} from '../src/control/harness-dispatch.js';
import {parseHarnessBenchmarkSuite, type HarnessBenchmarkTask} from '../src/control/harness-efficiency-benchmark.js';
import {
  LIVE_BENCHMARK_MISSING_MARKER,
  LIVE_BENCHMARK_TOOL_ID,
  buildLiveBenchmarkSources,
  buildLiveFloorSources,
  buildPacket,
  createLiveHarnessEfficiencyReport,
  expectedContextAvailable,
  liveBenchmarkMarker,
  observationUsage,
  renderLiveBenchmarkInstruction,
  renderLiveHarnessEfficiencyReport,
  selectPacketSources,
  type LiveHarnessFloorResult,
  type LiveHarnessTaskResult,
} from '../src/control/harness-efficiency-live-benchmark.js';
import {HarnessProfileRouter, MemoryHarnessEfficiencyLedger, type HarnessProfileName} from '../src/control/harness-efficiency.js';
import {StructuredChatProviderFactory} from '../src/control/structured-chat-provider.js';

const baseUrl = required('AGENT_CONTROL_HARNESS_LIVE_BASE_URL').replace(/\/$/, '');
const modelId = required('AGENT_CONTROL_HARNESS_LIVE_MODEL');
const endpoint = new URL(baseUrl);
const loopback = ['127.0.0.1', 'localhost', '::1'].includes(endpoint.hostname);
if (!loopback && process.env.AGENT_CONTROL_HARNESS_LIVE_ALLOW_REMOTE !== 'true') throw new Error('live_benchmark_endpoint_must_be_loopback_or_explicitly_approved');
const taskLimit = optionalPositiveInteger('AGENT_CONTROL_HARNESS_LIVE_TASK_LIMIT');
const timeoutMs = optionalPositiveInteger('AGENT_CONTROL_HARNESS_LIVE_TIMEOUT_MS') ?? 300_000;
const availableContextTokens = optionalPositiveInteger('AGENT_CONTROL_HARNESS_LIVE_CONTEXT_TOKENS') ?? 30_000;
const root = process.cwd();
const jsonFile = path.resolve(process.env.AGENT_CONTROL_HARNESS_LIVE_RESULT || path.join(root, 'artifacts', 'harness-efficiency-live-report.json'));
const markdownFile = path.resolve(process.env.AGENT_CONTROL_HARNESS_LIVE_MARKDOWN || path.join(root, 'docs', 'harness-efficiency-live-report.md'));
const suite = parseHarnessBenchmarkSuite(JSON.parse(fs.readFileSync(path.join(root, 'benchmarks', 'harness-efficiency-jobs.json'), 'utf8')));
const tasks = taskLimit === undefined ? suite.tasks : suite.tasks.slice(0, taskLimit);
if (!tasks.length) throw new Error('live_benchmark_no_tasks');

await requireHealthyEndpoint();
const modelsResponse = await fetch(`${baseUrl}/models`, {headers: authorizationHeaders()});
const modelsBody = await modelsResponse.json() as {data?: Array<{id?: string}>};
if (!modelsResponse.ok) throw new Error(`live_benchmark_model_discovery_failed:${modelsResponse.status}`);
if (!modelsBody.data?.some(model => model.id === modelId)) throw new Error('live_benchmark_model_identity_mismatch');
const modelListSha256 = createHash('sha256').update(JSON.stringify(modelsBody)).digest('hex');

const profiles: HarnessProfileName[] = ['THIN', 'STANDARD', 'DEEP'];
const workerId = 'controlled-live-benchmark-worker';
const authority = {laneId: 'controlled-live-benchmark-lane', leaseGeneration: 1, ownershipGeneration: 1, owner: 'agent' as const};
let active: {taskId: string; expectedMarker: string} | null = null;
const toolPolicy = new ToolPolicy([{id: LIVE_BENCHMARK_TOOL_ID, risk: 'read', capabilities: ['benchmark.submit']}]);
const handlers = new ToolHandlerRegistry().register(LIVE_BENCHMARK_TOOL_ID, async input => {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const strictShape = Object.keys(value).every(key => ['taskId', 'marker'].includes(key)) && typeof value.taskId === 'string' && typeof value.marker === 'string';
  const verified = Boolean(active && strictShape && value.taskId === active.taskId && value.marker === active.expectedMarker);
  return {taskId: typeof value.taskId === 'string' ? value.taskId : null, verified, submittedMissingContext: value.marker === LIVE_BENCHMARK_MISSING_MARKER};
});
const ledger = new MemoryHarnessEfficiencyLedger();
const store = new MemoryRecipeDispatchStore();
const profileRouter = new HarnessProfileRouter({mode: 'EXPERIMENT', minimumVerifiedRuns: 10, minimumSuccessRate: .9, minimumSameModelControlledRuns: 10});
const harness = new AdaptiveHarness(new SkillCatalog(), toolPolicy, undefined, profileRouter);
const dispatcher = new HarnessDispatcher(harness, toolPolicy, handlers, () => ({authority, workerId, availableToolIds: [LIVE_BENCHMARK_TOOL_ID], approvedRisks: ['read']}), store, undefined, undefined, ledger);
const providerId = 'controlled-live-openai-compatible';
const provider = new StructuredChatProviderFactory({
  provider: {id: providerId, name: 'Controlled live benchmark provider', kind: 'local', baseUrl, requiresAuth: Boolean(process.env.AGENT_CONTROL_HARNESS_LIVE_BEARER_TOKEN), parallelism: 1, costClass: 'free', capabilities: ['structured-output', 'tool-request']},
  workerId, modelId, workerCapabilities: ['model.execute'], modelCapabilities: ['structured-output', 'tool-request'], availableToolIds: [LIVE_BENCHMARK_TOOL_ID],
  qualificationEvidence: [`models-http-${modelsResponse.status}`, `models-sha256-${modelListSha256}`], health: 'healthy', timeoutMs,
  authorization: () => process.env.AGENT_CONTROL_HARNESS_LIVE_BEARER_TOKEN,
});

const floors: LiveHarnessFloorResult[] = [];
for (const profile of profiles) {
  const taskId = `startup-floor-${profile.toLowerCase()}`;
  const sources = buildLiveFloorSources(profile), packet = buildPacket(profile, sources, availableContextTokens), selected = selectPacketSources(packet, sources);
  const outcome = await dispatchControlled({taskId, profile, category: 'startup floor', minimumProfile: 'THIN', marker: liveBenchmarkMarker('startup-floor-v1', taskId), packet, selected});
  floors.push({profile, verifierResult: outcome.success ? 'PASS' : 'FAIL', providerInputTokens: outcome.observation?.usage.inputTokens ?? null, providerOutputTokens: outcome.observation?.usage.outputTokens ?? null, providerTotalTokens: outcome.observation?.usage.totalProcessedTokens ?? null, cachedInputTokens: outcome.observation?.usage.cachedInputTokens ?? null, elapsedMs: outcome.observation?.elapsedMs ?? outcome.elapsedMs, startup: outcome.observation?.startup ?? {components: [], startupContextTokens: 0, taskContextTokens: 0, conversationHistoryTokens: 0, totalEstimatedContextTokens: 0, repeatedContextCostEstimate: 0, turns: 1}, contextPacketId: packet.id, contextSourceIds: packet.sourceIds});
}

const results: LiveHarnessTaskResult[] = [];
for (const task of tasks) {
  for (const profile of profiles) {
    const sources = buildLiveBenchmarkSources(suite.suiteId, task), packet = buildPacket(profile, sources, availableContextTokens), selected = selectPacketSources(packet, sources);
    const marker = liveBenchmarkMarker(suite.suiteId, task.id);
    const outcome = await dispatchControlled({taskId: task.id, profile, category: task.category, minimumProfile: task.minimumProfile, marker, packet, selected, task});
    const available = expectedContextAvailable(task.minimumProfile, profile);
    results.push({taskId: task.id, category: task.category, minimumProfile: task.minimumProfile, profile, model: modelId, provider: providerId, verifierResult: outcome.success ? 'PASS' : 'FAIL', success: outcome.success, expectedContextAvailable: available, submittedMissingContext: outcome.submittedMissingContext, failureReason: outcome.success ? null : outcome.error ?? (outcome.submittedMissingContext ? 'missing_context_declared' : 'verifier_rejected'), recipeId: outcome.recipeId, contextPacketId: packet.id, contextSourceIds: packet.sourceIds, omittedSourceIds: packet.omitted.map(item => item.id), usage: observationUsage(outcome.observation), elapsedMs: outcome.observation?.elapsedMs ?? outcome.elapsedMs, toolCalls: outcome.observation?.toolCalls ?? 0, invocationId: outcome.observation?.id ?? null, provenanceEvidenceIds: [...new Set([...(outcome.observation?.provenance.evidenceIds ?? []), ...outcome.evidence])].sort()});
  }
  if (results.length % 15 === 0) await requireHealthyEndpoint();
}
await requireHealthyEndpoint();

const report = createLiveHarnessEfficiencyReport({suite: {...suite, tasks}, generatedAt: new Date().toISOString(), model: modelId, provider: providerId, endpointScope: loopback ? 'loopback' : 'explicit-private-remote', modelListSha256, floors, results});
fs.mkdirSync(path.dirname(jsonFile), {recursive: true});
fs.mkdirSync(path.dirname(markdownFile), {recursive: true});
fs.writeFileSync(jsonFile, `${JSON.stringify(report, null, 2)}\n`, {mode: 0o600});
fs.writeFileSync(markdownFile, renderLiveHarnessEfficiencyReport(report));

const unexpected = results.filter(result => result.success !== result.expectedContextAvailable);
const floorFailures = floors.filter(floor => floor.verifierResult !== 'PASS');
process.stdout.write(`${JSON.stringify({schema: report.schema, benchmarkId: report.benchmarkId, classification: report.classification, modelControl: report.modelControl, startupTax: Object.fromEntries(profiles.map(profile => [profile, {providerInputTokens: report.startupTax[profile].providerInputTokens, cachedInputTokens: report.startupTax[profile].cachedInputTokens, verifierResult: report.startupTax[profile].verifierResult}])), aggregates: report.aggregates, conclusions: report.conclusions, unexpectedRuns: unexpected.map(result => ({taskId: result.taskId, profile: result.profile, expectedContextAvailable: result.expectedContextAvailable, verifierResult: result.verifierResult, failureReason: result.failureReason})), files: [jsonFile, markdownFile]}, null, 2)}\n`);
if (unexpected.length || floorFailures.length) process.exitCode = 1;

async function dispatchControlled(input: {taskId: string; profile: HarnessProfileName; category: string; minimumProfile: HarnessProfileName; marker: string; packet: ReturnType<typeof buildPacket>; selected: ReturnType<typeof selectPacketSources>; task?: HarnessBenchmarkTask}) {
  active = {taskId: input.taskId, expectedMarker: input.marker};
  const started = performance.now();
  const jobId = `live-benchmark:${input.taskId}:${input.profile}`;
  const signals = input.task ? {taskId: input.task.id, complexity: input.task.complexity, risk: input.task.risk, knownExactTargets: input.task.knownExactTargets, estimatedFiles: input.task.estimatedFiles, deterministicVerifier: input.task.deterministicVerifier, ambiguity: input.task.ambiguity, architectural: input.task.architectural, requestedProfile: input.profile} : {taskId: input.taskId, complexity: 0, risk: 'low' as const, knownExactTargets: true, estimatedFiles: 0, deterministicVerifier: true, ambiguity: 0, architectural: false, requestedProfile: input.profile};
  const request: RecipeRequest = {taskId: jobId, jobId, runId: jobId, taskType: input.category, requiredCapabilities: ['structured-output', 'tool-request'], requiredTools: [LIVE_BENCHMARK_TOOL_ID], approvedRisks: ['read'], intent: 'ECONOMY', inputTokens: input.packet.estimatedTokens, outputTokens: 128, maximumLatencyMs: timeoutMs, context: {tier: {THIN: 0, STANDARD: 1, DEEP: 2}[input.profile], sourceIds: input.packet.sourceIds, evidenceIds: input.packet.provenanceIds, estimatedTokens: input.packet.estimatedTokens}, contextPacket: input.packet, contextStrategyId: `controlled-live-${input.profile.toLowerCase()}`, authority, verification: {requiredEvidence: ['controlled-marker-verifier'], requireIndependentCheck: true}, escalation: {minimumConfidence: .7, maximumAttempts: 1, onFailure: 'review'}, harnessRouting: signals};
  try {
    const result = await dispatcher.dispatch({request, candidates: [provider.candidate()], placement: {workerId, reason: 'capability match:model.execute+structured-output+tool-request'}}, provider.executor(renderLiveBenchmarkInstruction(input.taskId, input.selected), input.selected));
    const payload = JSON.parse(result.execution.resultRef ?? '{}') as {toolOutput?: {verified?: boolean; submittedMissingContext?: boolean}};
    const success = payload.toolOutput?.verified === true && result.execution.evidence?.includes(`tool_executed:${LIVE_BENCHMARK_TOOL_ID}`) === true;
    ledger.markVerification(result.invocationIds, success ? 'PASS' : 'FAIL', success ? 'SUCCEEDED' : 'FAILED');
    const observation = result.invocationIds.length ? ledger.list().find(item => item.id === result.invocationIds[0]) : undefined;
    return {success, submittedMissingContext: payload.toolOutput?.submittedMissingContext === true, observation, recipeId: result.recipe.id, evidence: result.execution.evidence ?? [], elapsedMs: performance.now() - started, error: null as string | null};
  } catch (error) {
    const invocationIds = error && typeof error === 'object' && Array.isArray((error as {efficiencyInvocationIds?: unknown}).efficiencyInvocationIds) ? (error as {efficiencyInvocationIds: string[]}).efficiencyInvocationIds : [];
    if (invocationIds.length) ledger.markVerification(invocationIds, 'FAIL', 'FAILED');
    const observation = invocationIds.length ? ledger.list().find(item => item.id === invocationIds[0]) : undefined;
    return {success: false, submittedMissingContext: false, observation, recipeId: null, evidence: [] as string[], elapsedMs: performance.now() - started, error: boundedError(error)};
  } finally {
    active = null;
  }
}

async function requireHealthyEndpoint() {
  const response = await fetch(new URL('/health', endpoint), {headers: authorizationHeaders(), signal: AbortSignal.timeout(Math.min(timeoutMs, 10_000))});
  if (!response.ok) throw new Error(`live_benchmark_endpoint_unhealthy:${response.status}`);
}

function authorizationHeaders(): HeadersInit {
  const token = process.env.AGENT_CONTROL_HARNESS_LIVE_BEARER_TOKEN;
  return token ? {authorization: `Bearer ${token}`} : {};
}

function required(name: string): string { const value = process.env[name]; if (!value) throw new Error(`missing_${name.toLowerCase()}`); return value; }
function optionalPositiveInteger(name: string): number | undefined { const value = process.env[name]; if (value === undefined) return undefined; const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`invalid_${name.toLowerCase()}`); return parsed; }
function boundedError(error: unknown): string { const value = error instanceof Error ? error.message : String(error); return value.length <= 512 ? value : `${value.slice(0, 509)}...`; }

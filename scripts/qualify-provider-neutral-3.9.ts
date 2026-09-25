import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type {AddressInfo} from 'node:net';
import {AgentControlService} from '../src/control/application-service.js';
import {CapabilityIntelligenceStore, rankCapabilityRoutes, registerAgentControlCoreCapabilities} from '../src/control/capability-intelligence.js';
import type {ProviderConfig, ModelConfig} from '../src/control/config.js';
import type {CodexNodeExecutionPort} from '../src/control/codex-node-execution.js';
import {JobCatalog} from '../src/control/job-catalog.js';
import {ActionRegistry, ArtifactStore, JobRuntime, ResourceLockManager, RunLedger, WorkerRegistry} from '../src/control/job-runtime.js';
import type {ActionContext, JobDefinition} from '../src/control/job-types.js';
import {ProviderNeutralModelEvaluationExecutor} from '../src/control/model-evaluation-runtime.js';
import {loadFrozenQualificationSuite, ModelEvaluationCoordinator, ModelIntelligenceLedger, modelRouteKey, type ModelCandidateIdentity, type ModelEvaluationExecutionResult, type ModelEvaluationExecutorPort} from '../src/control/model-intelligence.js';
import {ModelRegistry} from '../src/control/model-registry.js';
import {appendParcelContextEvent, verifyParcelContextEventChain} from '../src/control/parcel-context.js';
import {PtyRegistry} from '../src/control/pty.js';
import {RuntimeSafetySupervisor} from '../src/control/runtime-safety-supervisor.js';
import {TokenAwareBatonRuntime} from '../src/control/token-aware-baton-routing.js';
import {WorkParcelCoordinator, WorkParcelStore, type WorkParcel, type WorkParcelPlan, type WorkParcelPlanner} from '../src/control/work-parcels.js';
import {startWebDashboard} from '../src/control/web-server.js';
import type {WorkspaceState} from '../src/state.js';

interface PhysicalCandidate {
  providerId: string;
  providerName: string;
  baseUrl: string;
  modelId: string;
  providerModel: string;
  displayName: string;
  runtimeId: string;
  runtimeVersion: string;
  modelVersion: string | null;
  nodeId: string;
  contextTokens: number;
  outputTokens: number;
  capabilities: string[];
  localArtifact: {sha256: string; bytes: number; format: string; quantization?: string};
}

interface Options {stateDir: string; evidenceFile: string; host: string; port: number; holdMs: number; operatorToken?: string}

const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
const digest = (value: unknown) => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const terminal = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);
let activeServer: ReturnType<typeof startWebDashboard> | undefined;

function parseOptions(): Options {
  const values = new Map<string, string>();
  for (let index = 2; index < process.argv.length; index += 2) {
    const name = process.argv[index], value = process.argv[index + 1];
    if (!name?.startsWith('--') || value === undefined) throw new Error(`qualification_argument_invalid:${name ?? 'missing'}`);
    values.set(name.slice(2), value);
  }
  const stateDir = path.resolve(values.get('state-dir') ?? process.env.AGENT_CONTROL_QUALIFICATION_STATE_DIR ?? '.agent-control/qualification-3.9');
  return {
    stateDir,
    evidenceFile: path.resolve(values.get('evidence-file') ?? process.env.AGENT_CONTROL_QUALIFICATION_EVIDENCE ?? path.join(stateDir, 'provider-neutral-qualification.json')),
    host: values.get('host') ?? '127.0.0.1',
    port: Number(values.get('port') ?? process.env.AGENT_CONTROL_QUALIFICATION_PORT ?? 4390),
    holdMs: Number(values.get('hold-ms') ?? process.env.AGENT_CONTROL_QUALIFICATION_HOLD_MS ?? 10_000),
    operatorToken: process.env.AGENT_CONTROL_QUALIFICATION_OPERATOR_TOKEN,
  };
}

function candidatesFromEnvironment(): PhysicalCandidate[] {
  const raw = process.env.AGENT_CONTROL_QUALIFICATION_CANDIDATES_JSON;
  if (!raw) throw new Error('qualification_candidates_json_required');
  const values = JSON.parse(raw) as PhysicalCandidate[];
  if (!Array.isArray(values) || values.length < 2) throw new Error('qualification_requires_two_candidates');
  const ids = new Set<string>();
  for (const value of values) {
    const url = new URL(value.baseUrl);
    if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) throw new Error('qualification_candidate_endpoint_invalid');
    if (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('qualification_cleartext_endpoint_not_local');
    if (!/^[a-z0-9][a-z0-9._-]+$/i.test(value.modelId) || !/^[a-z0-9][a-z0-9._-]+$/i.test(value.providerId) || ids.has(value.modelId) || !value.capabilities.length || !/^[a-f0-9]{64}$/.test(value.localArtifact.sha256) || value.localArtifact.bytes < 1 || value.contextTokens < 1 || value.outputTokens < 1) throw new Error('qualification_candidate_invalid');
    ids.add(value.modelId);
  }
  return values;
}

async function preflight(candidates: PhysicalCandidate[]) {
  const results = [];
  for (const candidate of candidates) {
    const started = Date.now(), health = await fetch(new URL('/health', candidate.baseUrl), {signal: AbortSignal.timeout(5_000)});
    if (!health.ok) throw new Error(`qualification_provider_unavailable:${candidate.providerId}:${health.status}`);
    const models = await fetch(new URL('/v1/models', candidate.baseUrl), {signal: AbortSignal.timeout(5_000)});
    if (!models.ok) throw new Error(`qualification_model_inventory_unavailable:${candidate.providerId}:${models.status}`);
    const body = await models.json() as {data?: Array<{id?: string}>};
    if (!body.data?.some(item => item.id === candidate.providerModel)) throw new Error(`qualification_model_identity_missing:${candidate.modelId}`);
    results.push({providerId: candidate.providerId, modelId: candidate.modelId, providerModel: candidate.providerModel, nodeId: candidate.nodeId, health: 'AVAILABLE', latencyMs: Date.now() - started, runtimeId: candidate.runtimeId, runtimeVersion: candidate.runtimeVersion, modelVersion: candidate.modelVersion, localArtifact: candidate.localArtifact});
  }
  return results;
}

function workflowJob(id: string, action: string): JobDefinition {
  return {apiVersion: 'agent-control/v1', kind: 'Job', metadata: {id, name: id.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join(' '), version: '1.0.0'}, spec: {priority: 'normal', concurrency: 'queue', steps: [{id: 'work', action, requires: ['qualification.workflow'], outputs: [{name: 'result', type: 'application/json', schema: `${id}/v1`, version: '1.0.0'}], verification: ['qualification-passed']}]}};
}

function parcelId(context: ActionContext) {
  const value = context.run.trigger.parcelContext?.parcelId;
  if (!value) throw new Error('qualification_parcel_context_missing');
  return value;
}

function totals(attempts: ReturnType<ModelIntelligenceLedger['attemptsList']>) {
  const measured = attempts.filter(item => ['PASSED', 'FAILED'].includes(item.status));
  const sum = (select: (item: typeof attempts[number]) => number | null) => measured.length && measured.every(item => select(item) !== null) ? measured.reduce((value, item) => value + (select(item) ?? 0), 0) : null;
  return {
    attempts: attempts.length,
    measured: measured.length,
    passed: measured.filter(item => item.status === 'PASSED').length,
    failed: measured.filter(item => item.status === 'FAILED').length,
    unavailable: attempts.filter(item => item.status === 'UNAVAILABLE').length,
    blocked: attempts.filter(item => item.status === 'BLOCKED').length,
    inputTokens: sum(item => item.usage.inputTokens),
    freshInputTokens: sum(item => item.usage.freshInputTokens),
    cachedInputTokens: sum(item => item.usage.cachedInputTokens),
    outputTokens: sum(item => item.usage.outputTokens),
    totalTokens: sum(item => item.usage.totalTokens),
    actualCost: sum(item => item.cost.actual),
    calculatedCost: sum(item => item.cost.calculated),
    elapsedMs: measured.reduce((value, item) => value + (item.elapsedMs ?? 0), 0),
    failureClasses: Object.fromEntries([...new Set(attempts.map(item => item.failureClass).filter(Boolean))].map(name => [name!, attempts.filter(item => item.failureClass === name).length])),
  };
}

function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }

async function main() {
  const options = parseOptions(), candidates = candidatesFromEnvironment(), startedAt = new Date().toISOString();
  fs.mkdirSync(options.stateDir, {recursive: true, mode: 0o700});
  const preflightResults = await preflight(candidates);
  const suite = loadFrozenQualificationSuite(path.resolve('config/qualification-suite-v1.json'));
  const capabilityFile = path.join(options.stateDir, 'capability-intelligence.json'), intelligenceFile = path.join(options.stateDir, 'model-intelligence.json'), tokenFile = path.join(options.stateDir, 'token-routing.json');
  const capabilities = new CapabilityIntelligenceStore(capabilityFile); registerAgentControlCoreCapabilities(capabilities, startedAt);
  const intelligence = new ModelIntelligenceLedger(intelligenceFile), tokenRuntime = new TokenAwareBatonRuntime(tokenFile);
  const providers: ProviderConfig[] = candidates.map(item => ({id: item.providerId, name: item.providerName, kind: 'openai-compatible', enabled: true, baseUrl: item.baseUrl, wireApi: 'chat-completions', auth: {type: 'none'}, requiresAuth: false, parallelism: 1, costClass: 'free', capabilities: ['model.execute','output.structured'], qualification: {status: 'qualified', advertisedContextLimitTokens: item.contextTokens, lastSuccessfulAt: startedAt, evidence: [`preflight:${item.providerId}`]}}));
  const models: ModelConfig[] = candidates.map(item => ({id: item.modelId, provider: item.providerId, providerModel: item.providerModel, displayName: item.displayName, enabled: true, capabilities: item.capabilities, nodes: [item.nodeId], limits: {contextTokens: item.contextTokens, outputTokens: item.outputTokens}, qualification: {state: 'UNTESTED', evidence: [`frozen-suite:${suite.sha256}`]}}));
  const registry = new ModelRegistry(providers, models, {roles: {}}, undefined, undefined, {}, capabilities, intelligence);

  const parcelStore = new WorkParcelStore(path.join(options.stateDir, 'work-parcels.json'));
  const artifacts = new ArtifactStore(path.join(options.stateDir, 'artifacts'));
  const runs = new RunLedger(path.join(options.stateDir, 'runs.json'));
  const locks = new ResourceLockManager(path.join(options.stateDir, 'locks.json'));
  const safety = new RuntimeSafetySupervisor({id: 'agent-control.qualification-runtime-safety/v1'}, path.join(options.stateDir, 'runtime-safety.json'));
  const actions = new ActionRegistry(), alphaAttempts = new Map<string, number>(), betaAttempts = new Map<string, number>(), failureEvents = new Map<string, string>(), recovery = new Map<string, {batonExcludedFailure: boolean; retrievedEventId: string; retrievedEventSha256: string}>();
  let coordinator: WorkParcelCoordinator;
  const append = (id: string, event: Parameters<typeof appendParcelContextEvent>[1]) => { const parcel = parcelStore.get(id); if (!parcel?.context) throw new Error('qualification_parcel_context_missing'); const created = appendParcelContextEvent(parcel.context, event); parcelStore.update(parcel); return created; };

  actions.register('qualification.recovery-attempt@1.0.0', async context => {
    const id = parcelId(context); alphaAttempts.set(id, (alphaAttempts.get(id) ?? 0) + 1);
    const event = append(id, {type: 'tool.result', stageId: 'attempt', summary: 'Approach alpha failed with a deterministic stale-endpoint mismatch', detail: {approach: 'alpha', outcome: 'FAILED', failureClass: 'deterministic-mismatch'}, tags: ['failed-approach','recovery-target'], evidence: ['qualification:alpha-failure']});
    failureEvents.set(id, event.id); await delay(600);
    return {artifacts: [{name: 'result', value: {approach: 'alpha', outcome: 'rejected', eventId: event.id}}], verification: ['qualification-passed']};
  });
  actions.register('qualification.context-noise@1.0.0', async context => {
    const id = parcelId(context), parcel = parcelStore.get(id); if (!parcel?.context) throw new Error('qualification_parcel_context_missing');
    for (let index = 1; index <= 96; index++) appendParcelContextEvent(parcel.context, {type: 'observation', stageId: 'noise', summary: `Independent intermediate observation ${String(index).padStart(3, '0')} ${'bounded-context-noise '.repeat(18)}`, detail: {index, relevantToFailure: false}, tags: ['intermediate'], evidence: []});
    parcelStore.update(parcel); await delay(900);
    return {artifacts: [{name: 'result', value: {observations: 96}}], verification: ['qualification-passed']};
  });
  actions.register('qualification.context-retrieve@1.0.0', async context => {
    const id = parcelId(context), failedEventId = failureEvents.get(id); if (!failedEventId) throw new Error('qualification_failure_event_missing');
    const baton = context.run.trigger.parcelContext?.baton, batonExcludedFailure = !baton?.eventRefs.some(item => item.id === failedEventId);
    const retrieved = coordinator.retrieveContext(id, {query: 'approach alpha deterministic stale-endpoint mismatch', types: ['tool.result'], actor: 'qualification-retriever'});
    const found = retrieved.find(item => item.id === failedEventId); if (!found || !batonExcludedFailure) throw new Error(!found ? 'qualification_historical_failure_not_retrieved' : 'qualification_failure_never_left_baton_view');
    recovery.set(id, {batonExcludedFailure, retrievedEventId: found.id, retrievedEventSha256: found.sha256}); await delay(700);
    return {artifacts: [{name: 'result', value: {failedApproach: 'alpha', avoid: true, retrievedEventId: found.id, retrievedEventSha256: found.sha256}}], verification: ['qualification-passed']};
  });
  actions.register('qualification.recovery-continue@1.0.0', async context => {
    const id = parcelId(context), references = context.run.trigger.parcelContext?.baton?.artifactIds ?? [], recovered = references.map(reference => artifacts.read(reference) as {failedApproach?: string; avoid?: boolean}).find(value => value.failedApproach === 'alpha' && value.avoid === true);
    if (!recovered || alphaAttempts.get(id) !== 1) throw new Error('qualification_failed_approach_repeated');
    betaAttempts.set(id, (betaAttempts.get(id) ?? 0) + 1); await delay(500);
    return {artifacts: [{name: 'result', value: {selectedApproach: 'beta', alphaAttempts: alphaAttempts.get(id), betaAttempts: betaAttempts.get(id), outcome: 'verified'}}], verification: ['qualification-passed']};
  });
  actions.register('qualification.parallel-left@1.0.0', async () => { await delay(4_000); return {artifacts: [{name: 'result', value: {branch: 'left', outcome: 'completed while question open'}}], verification: ['qualification-passed']}; });
  actions.register('qualification.parallel-right@1.0.0', async context => { const parcel = parcelStore.get(parcelId(context)); if (!parcel?.context?.questions.some(item => item.status === 'ANSWERED')) throw new Error('qualification_question_answer_not_available'); await delay(1_500); return {artifacts: [{name: 'result', value: {branch: 'right', format: 'JSON'}}], verification: ['qualification-passed']}; });
  actions.register('qualification.parallel-join@1.0.0', async context => { await delay(700); return {artifacts: [{name: 'result', value: {joinedArtifactCount: context.run.trigger.parcelContext?.baton?.artifactIds.length ?? 0}}], verification: ['qualification-passed']}; });

  const catalog = new JobCatalog(actions.ids());
  for (const [id, action] of [
    ['recovery-attempt-job','qualification.recovery-attempt@1.0.0'], ['context-noise-job','qualification.context-noise@1.0.0'], ['context-retrieve-job','qualification.context-retrieve@1.0.0'], ['recovery-continue-job','qualification.recovery-continue@1.0.0'],
    ['parallel-left-job','qualification.parallel-left@1.0.0'], ['parallel-right-job','qualification.parallel-right@1.0.0'], ['parallel-join-job','qualification.parallel-join@1.0.0'],
  ]) catalog.addJob(workflowJob(id, action));
  const workers = new WorkerRegistry().register({id: 'qualification-controller', capabilities: ['qualification.workflow'], health: 'healthy', capacity: 4, active: 0, observedAt: startedAt});
  const runtime = new JobRuntime(catalog, actions, workers, runs, artifacts, locks, {approval: () => true, safety});
  const recoveryPlan: WorkParcelPlan = {objective: 'Recover a failed approach from durable history after it leaves the bounded baton, then continue without repeating it', planner: {kind: 'deterministic', reason: 'Frozen physical context-recovery scenario'}, stages: [
    {id: 'attempt', name: 'Attempt alpha', job: 'recovery-attempt-job@1.0.0'},
    {id: 'noise', name: 'Complete unrelated intermediate work', job: 'context-noise-job@1.0.0', dependsOn: ['attempt']},
    {id: 'recover', name: 'Retrieve historical failure', job: 'context-retrieve-job@1.0.0', dependsOn: ['noise']},
    {id: 'continue', name: 'Continue with beta', job: 'recovery-continue-job@1.0.0', dependsOn: ['recover']},
  ]};
  const questionPlan: WorkParcelPlan = {objective: 'Complete independent left and right branches while pausing only the answer-dependent branch, then join verified outputs', planner: {kind: 'deterministic', reason: 'Frozen physical asynchronous-question scenario'}, stages: [
    {id: 'left', name: 'Independent left branch', job: 'parallel-left-job@1.0.0'},
    {id: 'right', name: 'Question-dependent right branch', job: 'parallel-right-job@1.0.0'},
    {id: 'join', name: 'Join both branch outputs', job: 'parallel-join-job@1.0.0', dependsOn: ['left','right']},
  ]};
  const planner: WorkParcelPlanner = {plan: prompt => prompt.includes('context recovery') ? recoveryPlan : questionPlan};
  coordinator = new WorkParcelCoordinator(runtime, parcelStore, planner);

  const state: WorkspaceState = {version: 1, paused: false, lastRestorePoint: null, lanes: []};
  const control = new AgentControlService(state, new PtyRegistry(), undefined, '3.9.0-qualification', () => {}).configureProjection({
    jobRuntime: runtime, workParcels: coordinator, modelRegistry: registry, capabilityIntelligence: capabilities, modelIntelligence: intelligence, qualificationSuite: suite, tokenBatonRouting: tokenRuntime,
    resources: [{id: 'qualification-controller', name: 'Qualification controller', platform: 'linux', transport: 'local', capabilities: ['qualification.workflow']}],
  });
  safety.subscribe(decision => control.events.emit('runtime.safety_decision', {decisionId: decision.id, runId: decision.runId, outcome: decision.outcome, action: decision.action}, undefined, 'runtime-safety'));
  tokenRuntime.subscribe(event => control.events.emit(event.type === 'telemetry' ? 'token.telemetry' : event.type === 'context.lifecycle' ? 'token.context_lifecycle' : 'token.governor_transition', {threadId: event.threadId, parcelId: event.parcelId}, undefined, 'model-qualification'));

  const cumulative = new Map<string, {input: number; fresh: number; cached: number; cacheWrite: number; output: number; total: number; elapsed: number}>();
  const nodePort: CodexNodeExecutionPort = {accountStatus: async () => { throw new Error('qualification_cli_not_configured'); }, execReadOnlyStructured: async () => { throw new Error('qualification_cli_not_configured'); }};
  const physicalExecutor = new ProviderNeutralModelEvaluationExecutor(registry, capabilities, nodePort, fetch, event => control.events.emit('model.intelligence_changed', {batchId: event.batchId, modelId: event.candidate.modelId, taskId: event.taskId, phase: event.phase, detail: event.detail}, undefined, 'model-qualification'));
  const instrumentedExecutor: ModelEvaluationExecutorPort = {execute: async input => {
    const result = await physicalExecutor.execute(input); observeModelUsage(input.batch.id, input.candidate, result); return result;
  }};
  function observeModelUsage(batchId: string, candidate: ModelCandidateIdentity, result: ModelEvaluationExecutionResult) {
    const usage = result.observation.usage, key = `${batchId}:${modelRouteKey(candidate)}`, prior = cumulative.get(key) ?? {input: 0, fresh: 0, cached: 0, cacheWrite: 0, output: 0, total: 0, elapsed: 0};
    if ([usage.inputTokens, usage.outputTokens, usage.totalProcessedTokens].some(value => value === null)) throw new Error('qualification_authoritative_usage_missing');
    const next = {input: prior.input + usage.inputTokens!, fresh: prior.fresh + (usage.freshInputTokens ?? 0), cached: prior.cached + (usage.cachedInputTokens ?? 0), cacheWrite: prior.cacheWrite + (usage.cacheWriteTokens ?? 0), output: prior.output + usage.outputTokens!, total: prior.total + usage.totalProcessedTokens!, elapsed: prior.elapsed + (result.observation.elapsedMs ?? 0)};
    cumulative.set(key, next);
    const contextTokens = usage.totalProcessedTokens!, model = models.find(item => item.id === candidate.modelId)!;
    tokenRuntime.observe({threadId: `evaluation-thread:${batchId}:${candidate.modelId}`, parcelId: `evaluation-parcel:${batchId}`, agentId: 'frozen-model-evaluator', providerId: candidate.providerId, modelId: candidate.modelId, nodeId: candidate.nodeId, providerExecutionNodeId: candidate.nodeId, workloadNodeId: candidate.nodeId, elapsedMs: next.elapsed, cumulative: {inputTokens: next.input, freshInputTokens: next.fresh, cachedInputTokens: next.cached, cacheWriteTokens: next.cacheWrite, outputTokens: next.output, totalTokens: next.total}, context: {tokens: contextTokens, limitTokens: model.limits?.contextTokens ?? null, authority: 'estimated', source: 'one-shot provider usage; lifetime totals are separate'}, cost: {amount: result.observation.providerReportedCost ?? result.observation.calculatedCost, currency: result.observation.currency, authority: result.observation.providerReportedCost !== null ? 'authoritative' : result.observation.calculatedCost !== null ? 'estimated' : 'unavailable', source: result.observation.providerReportedCost !== null ? 'provider-reported' : result.observation.calculatedCost !== null ? 'configured pricing' : 'local energy not measured'}});
  }
  const modelCoordinator = new ModelEvaluationCoordinator(intelligence, suite, instrumentedExecutor, {agentControlVersion: '3.9.0', adapterVersion: 'provider-neutral-v1', promptVersion: 'frozen-suite-v1'});

  const server = startWebDashboard(control, {host: options.host, port: options.port, operatorToken: options.operatorToken, assetsDir: path.resolve('assets/dashboard')});
  activeServer = server;
  await once(server, 'listening'); const address = server.address() as AddressInfo;
  process.stdout.write(`${JSON.stringify({phase: 'DASHBOARD_READY', url: `http://${options.host}:${address.port}`, at: new Date().toISOString()})}\n`);
  await delay(2_000);

  const contextParcel = await coordinator.submit('physical context recovery qualification', 'qualification-operator');
  const questionParcel = await coordinator.submit('physical non-blocking question qualification', 'qualification-operator');
  control.events.emit('work.parcel_created', {parcelId: contextParcel.id, status: contextParcel.status}, undefined, 'qualification-operator');
  control.events.emit('work.parcel_created', {parcelId: questionParcel.id, status: questionParcel.status}, undefined, 'qualification-operator');
  const contextCriterion = control.addParcelCriterion(contextParcel.id, {kind: 'EXPECTED_RESULT', description: 'Historical alpha failure is retrieved and beta completes without another alpha attempt', stageId: 'continue', requiredEvidence: ['qualification:context-recovery']}, 'qualification-operator').criterion;
  const questionCriterion = control.addParcelCriterion(questionParcel.id, {kind: 'EXPECTED_RESULT', description: 'Independent work completes while the question waits and dependent work resumes after answer', stageId: 'join', requiredEvidence: ['qualification:async-question']}, 'qualification-operator').criterion;
  const questioned = control.askParcelQuestion(questionParcel.id, {text: 'Which stable output format should the right branch use?', originatingStageId: 'left', dependentStageIds: ['right'], priority: 'HIGH', consequence: 'MEDIUM'}, 'qualification-left-agent');
  const question = questioned.context!.questions[0];
  const statusSnapshots: Array<{at: string; label: string; stages: Array<{id: string; status: string}>}> = [];

  const batchesPromise = (async () => {
    const values = [];
    for (const sequence of [1, 2]) {
      const batch = intelligence.createBatch({id: `physical-qualification-${startedAt.replace(/\D/g, '').slice(0, 14)}-${sequence}`, suite, candidates: candidates.map(item => ({providerId: item.providerId, modelId: item.modelId, providerModel: item.providerModel, runtimeId: item.runtimeId, runtimeVersion: item.runtimeVersion, modelVersion: item.modelVersion, nodeId: item.nodeId, localArtifact: item.localArtifact})), requestedBy: 'qualification-operator', reason: `Physical frozen-suite repetition ${sequence}`});
      control.events.emit('model.intelligence_changed', {batchId: batch.id, status: batch.status}, undefined, 'qualification-operator');
      const completed = await modelCoordinator.runBatch(batch.id); values.push(completed); control.events.emit('model.intelligence_changed', {batchId: completed.id, status: completed.status}, undefined, 'model-qualification');
      await delay(1_000);
    }
    return values;
  })();

  const inFlight = new Set<Promise<unknown>>(), workflowStarted = Date.now(); let answeredAt: string | null = null, independentCompletedAt: string | null = null, statusBeforeAnswer: Array<{id: string; status: string}> = [];
  while (true) {
    for (let count = 0; count < 4; count++) await coordinator.tick();
    for (;;) {
      const dispatch = runtime.dispatch(); if (!dispatch) break;
      const completion = dispatch.completion.finally(() => inFlight.delete(completion)); inFlight.add(completion);
    }
    const currentQuestion = coordinator.get(questionParcel.id), left = currentQuestion.stages.find(item => item.id === 'left');
    if (left?.status === 'SUCCEEDED' && !independentCompletedAt) independentCompletedAt = left.endedAt ?? new Date().toISOString();
    if (!answeredAt && independentCompletedAt && Date.now() - workflowStarted >= 7_000) {
      statusBeforeAnswer = currentQuestion.stages.map(item => ({id: item.id, status: item.status})); statusSnapshots.push({at: new Date().toISOString(), label: 'before-answer', stages: statusBeforeAnswer});
      control.answerParcelQuestion(questionParcel.id, question.id, 'Use JSON', 'qualification-operator'); answeredAt = new Date().toISOString();
    }
    for (const parcel of [coordinator.get(contextParcel.id), coordinator.get(questionParcel.id)]) control.events.emit('work.parcel_changed', {parcelId: parcel.id, status: parcel.status, stages: parcel.stages.map(item => ({id: item.id, status: item.status}))}, undefined, 'work-parcel-coordinator');
    const current = [coordinator.get(contextParcel.id), coordinator.get(questionParcel.id)];
    if (current.every(parcel => parcel.stages.every(stage => stage.status === 'SUCCEEDED'))) break;
    if (current.some(parcel => parcel.stages.some(stage => stage.status === 'FAILED'))) throw new Error(`qualification_workflow_failed:${current.find(parcel => parcel.stages.some(stage => stage.status === 'FAILED'))?.id}`);
    if (Date.now() - workflowStarted > 120_000) throw new Error('qualification_workflow_timeout');
    await delay(150);
  }
  await Promise.all(inFlight);
  control.evaluateParcelCriterion(contextParcel.id, contextCriterion.id, {status: 'PASS', evidence: ['qualification:context-recovery'], detail: 'Retrieved the excluded alpha failure and used beta exactly once'}, 'qualification-verifier');
  control.evaluateParcelCriterion(questionParcel.id, questionCriterion.id, {status: 'PASS', evidence: ['qualification:async-question'], detail: 'Left completed before answer; right and join resumed after answer'}, 'qualification-verifier');
  const [finalContext, finalQuestion, batches] = [coordinator.get(contextParcel.id), coordinator.get(questionParcel.id), await batchesPromise];
  assert.equal(finalContext.status, 'SUCCEEDED'); assert.equal(finalQuestion.status, 'SUCCEEDED'); assert.equal(alphaAttempts.get(contextParcel.id), 1); assert.equal(betaAttempts.get(contextParcel.id), 1);
  assert.equal(statusBeforeAnswer.find(item => item.id === 'left')?.status, 'SUCCEEDED'); assert.equal(statusBeforeAnswer.find(item => item.id === 'right')?.status, 'WAITING');
  assert.ok(answeredAt && independentCompletedAt && Date.parse(independentCompletedAt) <= Date.parse(answeredAt));
  verifyParcelContextEventChain(finalContext.context!.events); verifyParcelContextEventChain(finalQuestion.context!.events);

  for (const [key, value] of cumulative) {
    const [batchId, route] = key.split(':', 2), modelId = route?.split('/').at(-1)?.split('@')[0]; if (!modelId) continue;
    const threadId = `evaluation-thread:${batchId}:${modelId}`; try { const thread = tokenRuntime.thread(threadId); tokenRuntime.observe({threadId, parcelId: thread.parcelId, agentId: thread.agentId, providerId: thread.providerId, modelId: thread.modelId, nodeId: thread.nodeId, providerExecutionNodeId: thread.providerExecutionNodeId, workloadNodeId: thread.workloadNodeId, elapsedMs: value.elapsed, active: false, cumulative: {inputTokens: value.input, freshInputTokens: value.fresh, cachedInputTokens: value.cached, cacheWriteTokens: value.cacheWrite, outputTokens: value.output, totalTokens: value.total}}); } catch {}
  }

  const allAttempts = intelligence.attemptsList(), routeCandidates = candidates.map(candidate => {
    const attempts = allAttempts.filter(item => item.candidate.modelId === candidate.modelId), metrics = totals(attempts);
    return {id: candidate.modelId, subject: {providerId: candidate.providerId, modelId: candidate.modelId, nodeId: candidate.nodeId}, available: true, qualificationConfidence: metrics.measured / Math.max(1, metrics.attempts), quality: metrics.measured ? metrics.passed / metrics.measured : 0, reliability: metrics.measured ? metrics.passed / metrics.measured : 0, estimatedCost: 0, estimatedLatencyMs: metrics.measured ? metrics.elapsedMs / metrics.measured : 1, tokenEfficiency: metrics.totalTokens ? metrics.passed / metrics.totalTokens : 0, cacheEfficiency: metrics.inputTokens && metrics.cachedInputTokens !== null ? metrics.cachedInputTokens / metrics.inputTokens : 0, local: true, privacyCompatible: true, nodeHealthy: true, accountAvailable: true};
  });
  const capabilityRoute = rankCapabilityRoutes(capabilities, routeCandidates, {required: ['code.modify'], nativePreferred: ['code.modify'], costWeight: 0, latencyWeight: .2});
  const expectedCapable = candidates.find(item => item.capabilities.includes('code.modify'))?.modelId; assert.equal(capabilityRoute.selected.id, expectedCapable);

  const restoredIntelligence = new ModelIntelligenceLedger(intelligenceFile), restoredBatches = restoredIntelligence.batchesList().filter(item => batches.some(batch => batch.id === item.id));
  assert.equal(restoredBatches.length, 2); assert.ok(restoredBatches.every(item => ['COMPLETED','PARTIAL'].includes(item.status)));
  const contextRecovery = recovery.get(contextParcel.id); assert.ok(contextRecovery?.batonExcludedFailure);
  const batons = [...finalContext.context!.batonViews, ...finalQuestion.context!.batonViews];
  const currentDiff = execFileSync('git', ['diff', '--binary', 'HEAD'], {encoding: 'utf8'}), repositoryHead = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  const perBatch = batches.map(batch => ({id: batch.id, status: batch.status, createdAt: batch.createdAt, startedAt: batch.startedAt, completedAt: batch.completedAt, candidates: candidates.map(candidate => ({providerId: candidate.providerId, modelId: candidate.modelId, nodeId: candidate.nodeId, ...totals(restoredIntelligence.attemptsList({batchId: batch.id}).filter(item => item.candidate.modelId === candidate.modelId))}))}));
  const persistedAttempts = restoredIntelligence.attemptsList().filter(item => batches.some(batch => batch.id === item.batchId));
  const result = {
    schema: 'agent-control.provider-neutral-physical-qualification/v1',
    verdict: 'PASS_WITH_LIMITATIONS',
    startedAt, completedAt: new Date().toISOString(),
    repository: {head: repositoryHead, dirtyAtQualification: currentDiff.length > 0, diffSha256: digest(currentDiff)},
    suite: {id: suite.id, version: suite.version, sha256: suite.sha256, taskCount: suite.tasks.length, repetitionsPerTask: [...new Set(suite.tasks.map(item => item.repetitions))]},
    preflight: preflightResults,
    scenarioA: {outcome: 'PASS', parcelId: finalContext.id, status: finalContext.status, failedApproachEventId: failureEvents.get(finalContext.id), failedApproachEventSha256: contextRecovery?.retrievedEventSha256, failureExcludedFromRecoveryBaton: contextRecovery?.batonExcludedFailure, retrievedEventId: contextRecovery?.retrievedEventId, alphaAttempts: alphaAttempts.get(finalContext.id), betaAttempts: betaAttempts.get(finalContext.id), eventCount: finalContext.context!.events.length, eventLedgerBytes: finalContext.context!.metrics.eventLedgerBytes, latestBatonBytes: finalContext.context!.metrics.latestBatonBytes, historicalBytesExcludedFromLatestBaton: finalContext.context!.metrics.historicalBytesExcludedFromLatestBaton, retrievals: finalContext.context!.metrics.retrievals, criterion: finalContext.context!.criteria.find(item => item.id === contextCriterion.id)},
    scenarioB: {outcome: 'PASS', parcelId: finalQuestion.id, status: finalQuestion.status, questionId: question.id, createdAt: question.createdAt, independentCompletedAt, answeredAt, beforeAnswer: statusBeforeAnswer, finalStages: finalQuestion.stages.map(item => ({id: item.id, status: item.status, runId: item.runId, worker: item.actualRoute?.workers[0] ?? null})), snapshots: statusSnapshots, criterion: finalQuestion.context!.criteria.find(item => item.id === questionCriterion.id)},
    scenarioC: {outcome: 'PASS_WITH_LIMITATIONS', batches: perBatch, limitations: ['AGENT_CONTROL_WORKFLOW, BROWSER and COMPUTER fixtures are retained as CAPABILITY_UNAVAILABLE because no governed evaluator adapter is bound to these model candidates.', 'Local energy and electricity cost were not measured; monetary cost remains unavailable rather than estimated.']},
    scenarioD: {outcome: 'PASS', requiredCapabilities: ['code.modify'], selected: capabilityRoute.selected.id, considered: capabilityRoute.considered.map(item => ({candidate: item.candidate.id, eligible: item.eligible, reasons: item.reasons, capabilities: item.capabilities})), rationale: capabilityRoute.rationale},
    scenarioE: {outcome: 'PASS', batchIds: restoredBatches.map(item => item.id), persistedAttemptCount: persistedAttempts.length, historyReloadedFromDisk: true},
    measuredValue: {averageBatonBytes: average(batons.map(item => item.sizeBytes)), maximumBatonBytes: Math.max(...batons.map(item => item.sizeBytes)), durableEventLedgerBytes: finalContext.context!.metrics.eventLedgerBytes + finalQuestion.context!.metrics.eventLedgerBytes, latestHistoricalBytesExcluded: finalContext.context!.metrics.historicalBytesExcludedFromLatestBaton + finalQuestion.context!.metrics.historicalBytesExcludedFromLatestBaton, contextRecoverySuccessRate: 1, repeatedFailedApproachRate: 0, workflowCompletionRate: 1, modelQualification: Object.fromEntries(candidates.map(candidate => [candidate.modelId, totals(persistedAttempts.filter(item => item.candidate.modelId === candidate.modelId))]))},
    tokenEvidence: tokenRuntime.projection(),
    runtimeSafety: safety.list(),
    dashboard: {url: `http://${options.host}:${address.port}`, sseEventCount: control.events.history().length, videoManifest: 'agent-control-3.9-provider-neutral-dashboard-video.json'},
    limitations: ['No governed browser/computer evaluator was bound for the two local model candidates.', 'Current-context occupancy is explicitly estimated from each one-shot request; provider-reported lifetime token totals remain authoritative and separate.', 'Local monetary/energy cost is unavailable because no energy meter and tariff were configured.', 'Conservative promotion correctly leaves same-day candidates unpromoted; leaderboard entries require durable history and approval.'],
  };
  fs.mkdirSync(path.dirname(options.evidenceFile), {recursive: true}); fs.writeFileSync(options.evidenceFile, `${JSON.stringify(result, null, 2)}\n`, {mode: 0o600});
  process.stdout.write(`${JSON.stringify({phase: 'QUALIFICATION_COMPLETE', verdict: result.verdict, evidenceFile: options.evidenceFile, contextParcelId: finalContext.id, questionParcelId: finalQuestion.id, batchIds: restoredBatches.map(item => item.id), at: result.completedAt})}\n`);
  await delay(options.holdMs);
  server.close(); await once(server, 'close');
  activeServer = undefined;
}

main().catch(error => { activeServer?.close(); process.stderr.write(`${JSON.stringify({phase: 'QUALIFICATION_FAILED', error: error instanceof Error ? error.message : String(error), at: new Date().toISOString()})}\n`); process.exitCode = 1; });

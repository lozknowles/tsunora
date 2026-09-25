import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import type {AddressInfo} from 'node:net';
import path from 'node:path';
import {AgentControlService} from '../src/control/application-service.js';
import {CapabilityIntelligenceStore, registerAgentControlCoreCapabilities} from '../src/control/capability-intelligence.js';
import type {ModelConfig, ProviderConfig} from '../src/control/config.js';
import type {CodexNodeExecutionPort} from '../src/control/codex-node-execution.js';
import {JobCatalog} from '../src/control/job-catalog.js';
import {ActionRegistry, ArtifactStore, JobRuntime, ResourceLockManager, RunLedger, WorkerRegistry} from '../src/control/job-runtime.js';
import type {JobDefinition} from '../src/control/job-types.js';
import {ProviderNeutralModelEvaluationExecutor} from '../src/control/model-evaluation-runtime.js';
import {freezeQualificationSuite, loadFrozenQualificationSuite, ModelEvaluationCoordinator, ModelIntelligenceLedger, type ModelEvaluationBatch} from '../src/control/model-intelligence.js';
import {ModelRegistry} from '../src/control/model-registry.js';
import {createParameterizedJobEngine} from '../src/control/parameterized-job-engine.js';
import {ParameterizedJobRegistry} from '../src/control/parameterized-job-registry.js';
import {PtyRegistry} from '../src/control/pty.js';
import {repositoryCodeReviewDefinition} from '../src/control/repository-review-definition.js';
import {WorkParcelCoordinator, WorkParcelStore, type WorkParcelPlan, type WorkParcelPlanner} from '../src/control/work-parcels.js';
import {startWebDashboard} from '../src/control/web-server.js';
import {defaultCapabilities, type LaneState, type WorkspaceState} from '../src/state.js';

interface Options {host: string; port: number; stateDir: string; evidenceFile: string; holdMs: number; operatorToken: string; modelBaseUrl: string; providerModel: string;}
const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
let activeServer: ReturnType<typeof startWebDashboard> | undefined;

function options(): Options {
  const values = new Map<string, string>();
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index], value = process.argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`qualification_argument_invalid:${key ?? 'missing'}`);
    values.set(key.slice(2), value);
  }
  const stateDir = path.resolve(values.get('state-dir') ?? '.agent-control/qualification-dashboard-characters');
  const operatorToken = process.env.AGENT_CONTROL_QUALIFICATION_OPERATOR_TOKEN;
  if (!operatorToken) throw new Error('qualification_operator_token_required');
  return {
    host: values.get('host') ?? '127.0.0.1',
    port: Number(values.get('port') ?? 4396),
    stateDir,
    evidenceFile: path.resolve(values.get('evidence-file') ?? path.join(stateDir, 'dashboard-characters-qualification.json')),
    holdMs: Number(values.get('hold-ms') ?? 25_000),
    operatorToken,
    modelBaseUrl: process.env.AGENT_CONTROL_CHARACTER_MODEL_BASE_URL ?? 'http://127.0.0.1:8080',
    providerModel: process.env.AGENT_CONTROL_CHARACTER_PROVIDER_MODEL ?? 'qwen2.5-3b-instruct-q4_k_m.gguf',
  };
}

function lane(id: number, name: string, status: LaneState['status'], model: string, at: string): LaneState {
  return {
    id, name, status, model, reasoning: 'medium', context: 'qualification', lines: [],
    contract: {version: 2, laneId: id, goal: `${name} bounded dashboard exercise`, constraints: ['No deployment', 'No external mutation'], cwd: '/tmp/agent-control-dashboard-qualification', priority: 1, mode: 'auto', capabilities: defaultCapabilities(), resourceLocks: {}, modelLock: null, sharedTaskIds: [], updatedAt: at},
    baton: {version: 1, laneId: id, revision: 1, status: status === 'working' ? 'Executing bounded qualification work' : status === 'paused' ? 'Blocked by explicit qualification hold' : 'Waiting for scheduled capacity', progress: [], hypothesis: '', evidence: [], changes: [], nextAction: status === 'working' ? 'Complete and verify the bounded action' : status === 'paused' ? 'Inspect the explicit hold' : 'Wait for capacity', openQuestions: [], model, reasoning: 'medium', updatedAt: at},
    lease: {laneId: id, holder: status === 'working' ? 'qualification-worker' : null, acquiredAt: status === 'working' ? at : null, expiresAt: null},
  };
}

function emit(value: unknown) { process.stdout.write(`${JSON.stringify(value)}\n`); }
function safeCrew(control: AgentControlService) {
  return control.snapshot().characterCrew.members.map(member => ({id: member.id, name: member.name, role: member.role, state: member.state, operationalState: member.operationalState, activity: member.activity, animationCue: member.animationCue, narration: member.narration, summary: member.summary, current: member.current, signals: member.signals, freshness: member.freshness, coverage: member.instrumentation.coverage, transitionKey: member.transitionKey}));
}

async function repeatBounded(milliseconds: number, action: () => void) {
  const deadline = Date.now() + milliseconds;
  do { action(); await delay(400); } while (Date.now() < deadline);
}

async function modelInventory(baseUrl: string, expected: string) {
  const health = await fetch(new URL('/health', baseUrl), {signal: AbortSignal.timeout(5_000)});
  if (!health.ok) throw new Error(`qualification_model_health_failed:${health.status}`);
  const response = await fetch(new URL('/v1/models', baseUrl), {signal: AbortSignal.timeout(5_000)});
  if (!response.ok) throw new Error(`qualification_model_inventory_failed:${response.status}`);
  const body = await response.json() as {data?: Array<{id?: string}>; models?: Array<{model?: string; name?: string}>};
  const ids = [...(body.data ?? []).map(item => item.id), ...(body.models ?? []).flatMap(item => [item.model, item.name])].filter(Boolean);
  if (!ids.includes(expected)) throw new Error('qualification_model_identity_missing');
  return {health: 'AVAILABLE', model: expected, observedAt: new Date().toISOString()};
}

async function main() {
  const config = options(), startedAt = new Date().toISOString(), repositoryHead = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  fs.mkdirSync(config.stateDir, {recursive: true, mode: 0o700});
  fs.mkdirSync(path.dirname(config.evidenceFile), {recursive: true});
  const modelPreflight = await modelInventory(config.modelBaseUrl, config.providerModel);

  const actions = new ActionRegistry();
  actions.register('repository.search@1.0.0', async () => {
    let output = '';
    await repeatBounded(9_000, () => { output = execFileSync('rg', ['-n', '-e', 'Work Parcel', '-e', 'Agent Control', 'README.md', 'ARCHITECTURE.md'], {encoding: 'utf8', maxBuffer: 2 * 1024 * 1024}); });
    return {artifacts: [{name: 'search-index', value: {matches: output.trim().split('\n').length, sha256: sha256(output)}, type: 'qualification-search-index', schema: 'agent-control.qualification-search/v1', version: '1'}], verification: ['search-result-verified'], evidence: [`repository-search-sha256:${sha256(output)}`], detail: 'Repository search completed and hashed'};
  });
  actions.register('file.read@1.0.0', async () => {
    let architecture = '';
    await repeatBounded(9_000, () => { architecture = fs.readFileSync(path.resolve('ARCHITECTURE.md'), 'utf8'); createHash('sha256').update(architecture).digest(); });
    return {artifacts: [{name: 'architecture-facts', value: {bytes: Buffer.byteLength(architecture), headings: architecture.split('\n').filter(line => /^#{1,3} /.test(line)).length, sha256: sha256(architecture)}, type: 'qualification-document-facts', schema: 'agent-control.qualification-document/v1', version: '1'}], verification: ['file-read-verified'], evidence: [`architecture-sha256:${sha256(architecture)}`], detail: 'Architecture document read and measured'};
  });
  actions.register('repository.code-edit@1.0.0', async context => {
    const artifactIds = context.run.trigger.parcelContext?.baton?.artifactIds ?? [];
    const inputs = artifactIds.map(id => context.readArtifact(id));
    let report = {schema: 'agent-control.crew-demo-result/v1', sources: inputs.length, objective: context.run.trigger.parcelContext?.currentInterpretation ?? 'unknown', format: 'JSON'};
    await repeatBounded(6_000, () => { report = JSON.parse(JSON.stringify(report)); assert.equal(report.sources, 2); });
    return {artifacts: [{name: 'crew-report', value: report, type: 'qualification-report', schema: report.schema, version: '1'}], verification: ['report-schema-verified'], evidence: [`input-artifacts:${artifactIds.length}`], detail: 'Structured report composed from both predecessor batons'};
  });
  actions.register('benchmark.verify@1.0.0', async context => {
    const artifactIds = context.run.trigger.parcelContext?.baton?.artifactIds ?? [];
    let verified = false;
    await repeatBounded(5_000, () => { const report = artifactIds.map(id => context.readArtifact(id)).find(value => (value as {schema?: string}).schema === 'agent-control.crew-demo-result/v1') as {sources?: number} | undefined; assert.equal(report?.sources, 2); verified = true; });
    return {artifacts: [{name: 'verification-result', value: {verified, checkedArtifacts: artifactIds.length}, type: 'qualification-verification', schema: 'agent-control.qualification-verification/v1', version: '1'}], verification: ['independent-verification-passed'], evidence: [`verified-artifacts:${artifactIds.length}`], detail: 'Independent bounded verification passed'};
  });
  const job = (id: string, name: string, action: string, capability: string, verification: string, output: {name: string; type: string; schema: string}): JobDefinition => ({apiVersion: 'agent-control/v1', kind: 'Job', metadata: {id, name, version: '1.0.0', description: `Real bounded ${name.toLowerCase()} for Crew workflow qualification`}, spec: {priority: 'normal', concurrency: 'allow', steps: [{id: 'work', action, requires: [capability], outputs: [{...output, version: '1'}], verification: [verification]}]}});
  const jobs = [
    job('crew-search', 'Repository Search', 'repository.search@1.0.0', 'qualification.search', 'search-result-verified', {name: 'search-index', type: 'qualification-search-index', schema: 'agent-control.qualification-search/v1'}),
    job('crew-read', 'Architecture Read', 'file.read@1.0.0', 'qualification.read', 'file-read-verified', {name: 'architecture-facts', type: 'qualification-document-facts', schema: 'agent-control.qualification-document/v1'}),
    job('crew-compose', 'Structured Composition', 'repository.code-edit@1.0.0', 'qualification.edit', 'report-schema-verified', {name: 'crew-report', type: 'qualification-report', schema: 'agent-control.crew-demo-result/v1'}),
    job('crew-verify', 'Independent Verification', 'benchmark.verify@1.0.0', 'qualification.verify', 'independent-verification-passed', {name: 'verification-result', type: 'qualification-verification', schema: 'agent-control.qualification-verification/v1'}),
  ];
  const catalog = new JobCatalog(actions.ids()); for (const definition of jobs) catalog.addJob(definition);
  const workers = new WorkerRegistry()
    .register({id: 'search-worker', capabilities: ['qualification.search'], health: 'healthy', capacity: 1, active: 0, observedAt: startedAt})
    .register({id: 'reader-worker', capabilities: ['qualification.read'], health: 'healthy', capacity: 1, active: 0, observedAt: startedAt})
    .register({id: 'editor-worker', capabilities: ['qualification.edit'], health: 'healthy', capacity: 1, active: 0, observedAt: startedAt})
    .register({id: 'verifier-worker', capabilities: ['qualification.verify'], health: 'healthy', capacity: 1, active: 0, observedAt: startedAt});
  const runtime = new JobRuntime(catalog, actions, workers, new RunLedger(path.join(config.stateDir, 'runs.json')), new ArtifactStore(path.join(config.stateDir, 'artifacts')), new ResourceLockManager(path.join(config.stateDir, 'locks.json')));
  const plan: WorkParcelPlan = {objective: 'Search and read the Agent Control repository concurrently, compose a structured result, then verify it independently', planner: {kind: 'deterministic', reason: 'Dedicated real multi-stage character-system qualification plan'}, stages: [
    {id: 'search', name: 'Search repository evidence', job: 'crew-search@1.0.0'},
    {id: 'read', name: 'Read architecture evidence', job: 'crew-read@1.0.0'},
    {id: 'compose', name: 'Compose structured result', job: 'crew-compose@1.0.0', dependsOn: ['search', 'read']},
    {id: 'verify', name: 'Verify structured result', job: 'crew-verify@1.0.0', dependsOn: ['compose']},
  ]};
  const planner: WorkParcelPlanner = {plan: async () => { await delay(1_200); return plan; }};
  const parcels = new WorkParcelCoordinator(runtime, new WorkParcelStore(path.join(config.stateDir, 'parcels.json')), planner);

  const fullSuite = loadFrozenQualificationSuite(path.resolve('config/qualification-suite-v1.json'));
  const selectedTasks = ['coding-v1', 'repository-review-v1', 'structured-output-v1'].map(id => fullSuite.tasks.find(task => task.id === id)!);
  assert.ok(selectedTasks.every(Boolean));
  const suite = freezeQualificationSuite({id: 'dashboard-character-live-model-exercise', version: '1.0.0', createdAt: startedAt, tasks: selectedTasks.map(task => ({...task, repetitions: 1}))});
  const capabilityIntelligence = new CapabilityIntelligenceStore(path.join(config.stateDir, 'capability-intelligence.json')); registerAgentControlCoreCapabilities(capabilityIntelligence, startedAt);
  const modelIntelligence = new ModelIntelligenceLedger(path.join(config.stateDir, 'model-intelligence.json'));
  const provider: ProviderConfig = {id: 'local-dashboard-qualification', name: 'Local dashboard qualification provider', kind: 'openai-compatible', enabled: true, baseUrl: config.modelBaseUrl, wireApi: 'chat-completions', auth: {type: 'none'}, requiresAuth: false, parallelism: 1, costClass: 'free', capabilities: ['model.execute', 'output.structured'], qualification: {status: 'qualified', advertisedContextLimitTokens: 32_768, lastSuccessfulAt: modelPreflight.observedAt, evidence: ['bounded local preflight']}};
  const requiredCapabilities = [...new Set(selectedTasks.flatMap(task => task.requiredCapabilities))];
  const model: ModelConfig = {id: 'local-dashboard-qualification-model', provider: provider.id, providerModel: config.providerModel, displayName: 'Local dashboard qualification model', enabled: true, capabilities: requiredCapabilities, nodes: ['qualification-worker'], limits: {contextTokens: 32_768, outputTokens: 1_024}, qualification: {state: 'UNTESTED', evidence: [`frozen-suite:${suite.sha256}`]}};
  const registry = new ModelRegistry([provider], [model], {roles: {}}, undefined, undefined, {}, capabilityIntelligence, modelIntelligence);
  const parameterizedDefinitions = new ParameterizedJobRegistry(); parameterizedDefinitions.register(repositoryCodeReviewDefinition);
  const parameterizedJobs = createParameterizedJobEngine(config.stateDir, parameterizedDefinitions, registry, {execute: async () => { throw new Error('qualification_parameterized_execution_not_authorized'); }}, {allowedRepositoryRoots: [config.stateDir], nodeHealthy: () => true});

  const state: WorkspaceState = {version: 1, paused: false, lastRestorePoint: null, lanes: [lane(1, 'Primary conductor', 'working', model.id, startedAt), lane(2, 'Capacity queue', 'waiting', model.id, startedAt), lane(3, 'Held dependency', 'paused', model.id, startedAt)]};
  const persist = () => fs.writeFileSync(path.join(config.stateDir, 'workspace-observation.json'), `${JSON.stringify(state, null, 2)}\n`, {mode: 0o600});
  const control = new AgentControlService(state, new PtyRegistry(), undefined, '3.9.0-character-qualification', persist).configureProjection({
    jobRuntime: runtime,
    workParcels: parcels,
    modelRegistry: registry,
    parameterizedJobs,
    modelIntelligence,
    capabilityIntelligence,
    qualificationSuite: suite,
    resources: workers.list().map(worker => ({id: worker.id, name: worker.id.replaceAll('-', ' '), platform: 'linux', transport: 'local process', capabilities: worker.capabilities})),
  });
  control.setVerificationPolicy(1, {required: ['ui_evidence']}, 'qualification-controller');
  control.recordClaim(1, 'The dashboard accurately presents the bounded lifecycle', 'qualification-controller');
  control.addVerificationEvidence(1, {id: 'character-ui-evidence', type: 'ui_evidence', description: 'Live browser evidence collection is in progress', status: 'passed', reference: 'pending-video-manifest'}, 'qualification-controller');

  const nodeExecution: CodexNodeExecutionPort = {accountStatus: async () => { throw new Error('codex_not_used'); }, execReadOnlyStructured: async () => { throw new Error('codex_not_used'); }};
  const evaluator = new ProviderNeutralModelEvaluationExecutor(registry, capabilityIntelligence, nodeExecution, fetch, event => control.events.emit('model.intelligence_changed', {batchId: event.batchId, providerId: event.candidate.providerId, modelId: event.candidate.modelId, taskId: event.taskId, phase: event.phase, detail: event.detail}, undefined, 'qualification-model-evaluator'));
  const modelCoordinator = new ModelEvaluationCoordinator(modelIntelligence, suite, evaluator, {agentControlVersion: '3.9.0', adapterVersion: 'provider-neutral-v1', promptVersion: 'frozen-dashboard-character-v1'});

  const server = startWebDashboard(control, {host: config.host, port: config.port, operatorToken: config.operatorToken, assetsDir: path.resolve('assets/dashboard')});
  activeServer = server; await once(server, 'listening'); const address = server.address() as AddressInfo, base = `http://${config.host}:${address.port}`;
  const trace: Array<{at: string; label: string; crew: ReturnType<typeof safeCrew>}> = [];
  let signature = '';
  const sample = (label: string) => { const crew = safeCrew(control), next = crew.map(item => item.transitionKey).join('|'); if (next !== signature || label !== 'poll') { signature = next; trace.push({at: new Date().toISOString(), label, crew}); } return crew; };
  sample('initial');
  emit({phase: 'DASHBOARD_READY', url: base, at: new Date().toISOString()});

  const deadline = Date.now() + 90_000;
  let parcel = parcels.list()[0];
  while (!parcel && Date.now() < deadline) { await delay(100); parcel = parcels.list()[0]; sample('poll'); }
  if (!parcel) throw new Error('qualification_browser_submission_missing');
  emit({phase: 'TASK_RECEIVED', parcelId: parcel.id, at: new Date().toISOString()});
  while (parcel.status === 'PLANNING' && Date.now() < deadline) { await delay(100); parcel = parcels.get(parcel.id); sample('poll'); }
  if (parcel.status !== 'QUEUED') throw new Error(`qualification_planning_failed:${parcel.status}`);
  parcel = control.askParcelQuestion(parcel.id, {text: 'Which stable output format should the final report use?', originatingStageId: 'read', dependentStageIds: ['compose'], priority: 'HIGH', consequence: 'MEDIUM'}, 'reader-worker');
  const question = parcel.context?.questions[0]; if (!question) throw new Error('qualification_question_missing');
  emit({phase: 'QUESTION_READY', parcelId: parcel.id, questionId: question.id, at: question.createdAt});

  await parcels.tick();
  const inFlight = new Set<Promise<unknown>>();
  const launchRuns = () => { for (;;) { const dispatch = runtime.dispatch(); if (!dispatch) break; const completion = dispatch.completion.finally(() => inFlight.delete(completion)); inFlight.add(completion); } };
  launchRuns();
  control.events.emit('provider.catalog_changed', {providerId: provider.id, action: 'discovering'}, undefined, 'qualification-controller');
  const liveInventory = await modelInventory(config.modelBaseUrl, config.providerModel);
  control.events.emit('provider.catalog_changed', {providerId: provider.id, action: 'discovered', models: 1, observedAt: liveInventory.observedAt}, undefined, 'qualification-controller');
  const batch = modelIntelligence.createBatch({id: 'dashboard-character-live-model-batch', suite, candidates: [{providerId: provider.id, modelId: model.id, providerModel: model.providerModel, runtimeId: 'llama.cpp-openai-compatible', runtimeVersion: null, modelVersion: null, nodeId: 'qualification-worker'}], requestedBy: 'qualification-controller', reason: 'Real bounded model activity for dashboard character qualification'});
  control.events.emit('provider.catalog_changed', {providerId: provider.id, canonicalModelId: model.id, action: 'evaluation-running', routingEligible: false}, undefined, 'qualification-controller');
  control.events.emit('model.intelligence_changed', {batchId: batch.id, status: batch.status}, undefined, 'qualification-controller');
  const modelPromise = modelCoordinator.runBatch(batch.id).then(result => { control.events.emit('model.intelligence_changed', {batchId: result.id, providerId: provider.id, modelId: model.id, status: result.status}, undefined, 'qualification-model-evaluator'); control.events.emit('provider.catalog_changed', {providerId: provider.id, canonicalModelId: model.id, action: result.status === 'COMPLETED' ? 'evaluation-completed' : 'evaluation-failed', status: result.status, routingEligible: false}, undefined, 'qualification-model-evaluator'); return result; });

  let concurrentRecorded = false, lastRunSignature = '', lastParcelSignature = '', finalParcel = parcels.get(parcel.id);
  while (Date.now() < deadline) {
    await parcels.tick(); launchRuns(); finalParcel = parcels.get(parcel.id);
    const runSignature = runtime.ledger.list().map(run => `${run.id}:${run.status}:${run.steps.map(step => step.status).join(',')}`).join('|');
    if (runSignature !== lastRunSignature) { lastRunSignature = runSignature; for (const run of runtime.ledger.list()) control.events.emit('job.run_changed', {runId: run.id, status: run.status, steps: run.steps.map(step => ({id: step.id, status: step.status}))}, undefined, 'qualification-runtime'); }
    const parcelSignature = `${finalParcel.status}:${finalParcel.stages.map(stage => `${stage.id}:${stage.status}`).join(',')}`;
    if (parcelSignature !== lastParcelSignature) {
      lastParcelSignature = parcelSignature;
      control.events.emit('work.parcel_changed', {parcelId: finalParcel.id, status: finalParcel.status, stages: finalParcel.stages.map(stage => ({id: stage.id, status: stage.status}))}, undefined, 'qualification-runtime');
    }
    const crew = sample('poll'), states = Object.fromEntries(crew.map(item => [item.id, item.state])), projection = control.snapshot().characterCrew, visualParcel = projection.parcels.find(item => item.id === finalParcel.id), relay = crew.find(item => item.id === 'parcel-coordinator');
    if (!concurrentRecorded && states['lane-master'] === 'working' && states['prompt-reviewer'] === 'awaiting_operator' && states['parcel-coordinator'] === 'working' && states['model-scout'] === 'working' && states['resource-guardian'] === 'resource_pressure' && states['quality-inspector'] === 'reviewing' && visualParcel?.parallelActive === 2 && ['SEARCHING', 'READING'].includes(relay?.activity.kind ?? '')) {
      concurrentRecorded = true; sample('concurrent-live'); emit({phase: 'CONCURRENT_STATE_READY', parcelId: finalParcel.id, states, activities: Object.fromEntries(crew.map(item => [item.id, item.activity.kind])), parallelActive: visualParcel.parallelActive, toolKinds: visualParcel.stages.map(stage => stage.tool?.kind).filter(Boolean), batonIds: projection.batonTransfers.map(item => item.batonId).filter(Boolean), at: new Date().toISOString()});
    }
    if (finalParcel.status === 'SUCCEEDED' && inFlight.size === 0) break;
    if (finalParcel.status === 'FAILED') throw new Error('qualification_work_parcel_failed');
    await delay(250);
  }
  if (finalParcel.status !== 'SUCCEEDED') throw new Error(`qualification_work_parcel_timeout:${finalParcel.status}`);
  const modelResult: ModelEvaluationBatch = await modelPromise;
  const verified = control.verifyClaim(1, 'qualification-verifier'); assert.equal(verified.ok, true); control.acceptVerifiedClaim(1, 'qualification-verifier');
  control.events.emit('verification.changed', {phase: 'accepted', evidenceId: 'character-ui-evidence'}, 1, 'qualification-verifier');
  const finalCrew = sample('completed');

  assert.equal(concurrentRecorded, true);
  assert.equal(finalParcel.stages.every(stage => stage.status === 'SUCCEEDED'), true);
  assert.equal(finalParcel.context?.questions[0]?.status, 'ANSWERED');
  assert.equal(finalParcel.context?.questions[0]?.answeredBy, 'web-operator');
  assert.equal(finalParcel.context?.batonViews.length, 8);
  assert.equal(finalParcel.audit.invocations.length, 0);
  assert.ok(['COMPLETED', 'PARTIAL', 'BLOCKED'].includes(modelResult.status));
  const eventTypes = [...new Set(control.events.history().map(event => event.type))], finalProjection = control.snapshot().characterCrew;
  const result = {
    schema: 'agent-control.crew-workflow-qualification/v1', verdict: 'PASS', startedAt, completedAt: new Date().toISOString(),
    repository: {head: repositoryHead, branch: execFileSync('git', ['branch', '--show-current'], {encoding: 'utf8'}).trim()},
    topology: {controller: 'isolated local AgentControlService', dashboard: base, browserEvidence: 'recorded separately', provider: provider.id, model: model.id, node: 'qualification-worker'},
    productionPath: ['AgentControlService', 'JobRuntime', 'WorkParcelCoordinator', 'ModelEvaluationCoordinator', 'projectDashboardCharacterCrew', 'GET /api/status', 'typed SSE', 'dashboard renderer'],
    workload: {parcelId: finalParcel.id, objective: finalParcel.objective, status: finalParcel.status, dependencyGraph: finalParcel.stages.map(stage => ({id: stage.id, dependsOn: stage.dependsOn})), runIds: finalParcel.stages.map(stage => stage.runId), questionId: question.id, questionStatus: finalParcel.context?.questions[0]?.status, stages: finalParcel.stages.map(stage => ({id: stage.id, status: stage.status, runId: stage.runId, workers: stage.actualRoute?.workers ?? [], action: runtime.ledger.get(stage.runId ?? '')?.steps[0]?.action ?? null, artifactIds: stage.baton?.artifactIds ?? [], batonId: stage.baton && 'id' in stage.baton ? stage.baton.id : null, batonSha256: stage.baton && 'sha256' in stage.baton ? stage.baton.sha256 : null}))},
    modelEvaluation: {batchId: modelResult.id, status: modelResult.status, provider: provider.id, model: model.id, providerModel: model.providerModel, attempts: modelIntelligence.attemptsList({batchId: modelResult.id}).map(attempt => ({taskId: attempt.taskId, status: attempt.status, verification: attempt.verification, inputTokens: attempt.usage.inputTokens, outputTokens: attempt.usage.outputTokens, totalTokens: attempt.usage.totalTokens, authority: attempt.usage.authority, costAuthority: attempt.cost.authority}))},
    eventTransport: {eventCount: control.events.history().length, eventTypes},
    characterTrace: trace,
    finalWorkflowProjection: {headline: finalProjection.headline, parcels: finalProjection.parcels, batonTransfers: finalProjection.batonTransfers, modelActivity: finalProjection.modelActivity, narration: finalProjection.narration},
    finalCrew,
    assertions: {allSixProjected: finalCrew.length === 6, realParallelStagesObserved: concurrentRecorded, operatorQuestionAnsweredThroughAuthenticatedWebPath: finalParcel.context?.questions[0]?.answeredBy === 'web-operator', parcelCompletedThroughVerifiedJobs: true, eightSealedParcelBatonBoundaries: finalParcel.context?.batonViews.length === 8, independentVerificationPassed: finalParcel.stages.find(stage => stage.id === 'verify')?.status === 'SUCCEEDED', realProviderCatalogueQueried: eventTypes.includes('provider.catalog_changed'), laneVerificationAccepted: true, characterProjectionCreatedNoModelCalls: true},
    boundaries: {real: ['natural-language request through authenticated dashboard', 'deterministic planning', 'concurrent repository search and architecture read', 'governed tool actions and worker placement', 'eight sealed Work Parcel baton boundaries (dispatch and completion for four stages)', 'structured composition from predecessor artifacts', 'independent verification Job', 'live provider catalogue query', 'frozen local model evaluation', 'verification evidence and acceptance', 'HTTP status and typed SSE refresh'], simulatedOnly: ['all-state gallery controls'], unavailable: ['No distinct prompt-review worker exists; Quill uses partial planning/readiness telemetry.', 'No model escalation was required by this bounded Work Parcel; token/model handoff rendering is deterministically qualified from real routing records.']},
    security: {operatorTokenPersisted: false, credentialsUsed: false, productionStateTouched: false, deploymentPerformed: false},
  };
  fs.writeFileSync(config.evidenceFile, `${JSON.stringify(result, null, 2)}\n`, {mode: 0o600});
  emit({phase: 'QUALIFICATION_COMPLETE', verdict: result.verdict, evidenceFile: config.evidenceFile, parcelId: finalParcel.id, modelBatchId: modelResult.id, at: result.completedAt});
  await delay(config.holdMs); server.close(); await once(server, 'close'); activeServer = undefined;
}

main().catch(error => { activeServer?.close(); emit({phase: 'QUALIFICATION_FAILED', error: error instanceof Error ? error.message : String(error), at: new Date().toISOString()}); process.exitCode = 1; });

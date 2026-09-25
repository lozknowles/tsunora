import fs from 'node:fs';
import {registerRuntimeBenchmark} from './runtime-benchmark.js';
import {registerSpeculativeDecoding} from './speculative-decoding.js';
import {registerOperatorObservation} from './poe-observation-job.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {AgentControlConfig} from './config.js';
import {JobCatalog} from './job-catalog.js';
import {createJobRuntime, WorkerRegistry} from './job-runtime.js';
import {registerReferenceActions} from './reference-actions.js';
import {registerRepositoryTestActions} from './repository-test-actions.js';
import {ManagedNodeManager, type ManagedNodeSnapshot} from './managed-node.js';
import {registerManagedNodeActions} from './managed-node-actions.js';
import {SshManagedNodeTransport} from './managed-node-ssh.js';
import {configuredHarnessProfileRouter, configuredHarnessProfiles, ContextPacketBuilder, FileHarnessEfficiencyLedger, InMemoryContextGraph, type HarnessEfficiencyLedgerPort} from './harness-efficiency.js';
import {registerFreeTokenQualificationActions} from './freetoken-actions.js';
import {CatalogNaturalLanguagePlanner, WorkParcelCoordinator, WorkParcelStore, type WorkParcelPlanner} from './work-parcels.js';
import {registerOperatorReviewActions} from './operator-review-actions.js';
import {registerBrowserActions} from './browser-actions.js';
import type {ModelRegistry} from './model-registry.js';
import {ParameterizedJobRegistry} from './parameterized-job-registry.js';
import {repositoryCodeReviewDefinition} from './repository-review-definition.js';
import {createParameterizedJobEngine} from './parameterized-job-engine.js';
import {DirectRepositoryReviewExecutor, type RepositoryReviewQualityGate} from './direct-repository-review-executor.js';
import type {TokenAwareBatonRuntime} from './token-aware-baton-routing.js';
import type {ContractExecutionRuntime} from './contract-runtime.js';
import type {GovernedHandoffRuntime} from './handoff-runtime.js';
import type {CodexNodeExecutionPort} from './codex-node-execution.js';
import {GovernedRetrievalRuntime, RepositoryTextRetrievalProvider, RetrievedEvidenceContextCompiler, SpawnZgSearchExecutor, ZgRetrievalProvider, type RetrievalStrategy} from './governed-retrieval.js';
import {ResourceRepositoryResolver} from './resource-repository-resolver.js';
import {RuntimeSafetySupervisor} from './runtime-safety-supervisor.js';
import {AdaptiveOrchestrationRuntime, FileAdaptiveOrchestrationStore} from './adaptive-orchestration.js';
import {registerProtectedResourceModelActions} from './protected-resource-model-actions.js';
import type {ExecutionSessionRuntime} from './execution-session.js';
import {TransportIntegrityRuntime} from './transport-integrity.js';
import {registerNonOpenAiCacheQualificationActions} from './non-openai-cache-qualification.js';
import {CacheAwareExpertRuntime, FileCacheExpertStore} from './cache-aware-expert.js';
import {cacheAwareExpertQualificationPlanner} from './cache-aware-expert-qualification.js';
import {FileSkillLearningStore, SkillLearningRuntime} from './skill-learning.js';
import {EnergyTelemetryRuntime, FileEnergyTelemetryStore} from './energy-telemetry.js';
import {DeterministicSkillRuntime,FileDeterministicSkillStore,registerCoreDeterministicHandlers} from './deterministic-skill.js';
import {registerDeterministicSkillActions} from './deterministic-skill-actions.js';
import {SecurityAuditRuntime,SecurityAuditStore} from './security-audit.js';
import {registerSecurityAudit,registerSecurityAuditContinuation} from './security-audit-job.js';
import {AgentTemplateRegistry} from './agent-template.js';
import {LabAgentJobRegistry,registerLabAgentJobActions} from './lab-agent-jobs.js';
import {CostRoutingLedger} from './cost-performance-routing.js';

/** Shared production definition path so qualification cannot drift from registered typed Actions. */
export function buildJobRuntimeDefinition(config: AgentControlConfig, manifestDir = process.env.AGENT_CONTROL_JOB_DIR || path.resolve('config/jobs'), harnessEfficiency?: HarnessEfficiencyLedgerPort, modelRegistry?: ModelRegistry, codexNodeExecution?: CodexNodeExecutionPort, deterministicSkills?:DeterministicSkillRuntime,costRouting?:{config:AgentControlConfig;ledger:CostRoutingLedger}) {
  const parcelJobs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../config/work-parcels/jobs');
  const operatorJobs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../config/operator-jobs');
  const workers = WorkerRegistry.fromConfig(config.resources), managedNodes = new ManagedNodeManager(config.resources, workers, new SshManagedNodeTransport());
  let actions = registerReferenceActions();
  actions = registerRepositoryTestActions(actions, config);
  actions = registerBrowserActions(actions);
  actions = registerManagedNodeActions(managedNodes, actions);
  actions = registerFreeTokenQualificationActions(actions);
  actions = registerOperatorReviewActions(config, actions, harnessEfficiency);
  actions = registerProtectedResourceModelActions(config, modelRegistry, codexNodeExecution, actions, harnessEfficiency);
  actions = registerNonOpenAiCacheQualificationActions(actions, harnessEfficiency);
  actions=registerDeterministicSkillActions(actions,deterministicSkills??registerCoreDeterministicHandlers(new DeterministicSkillRuntime()));
  const labJobs=new LabAgentJobRegistry().loadDirectory(process.env.AGENT_CONTROL_LAB_DIR??'');
  if(process.env.AGENT_CONTROL_LAB_DIR)actions=registerLabAgentJobActions(actions,labJobs,modelRegistry,harnessEfficiency,undefined,costRouting);
  const catalog = new JobCatalog(actions.ids()).loadDirectory(manifestDir).loadDirectory(parcelJobs);
  labJobs.addTo(catalog);
  registerOperatorObservation(actions, catalog, workers);
  if (process.env.AGENT_CONTROL_ENABLE_OPERATOR_REVIEW === 'true') catalog.loadDirectory(operatorJobs);
  return {workers, managedNodes, actions, catalog,labJobs};
}

export function buildJobRuntime(config: AgentControlConfig, stateRoot = process.env.AGENT_CONTROL_STATE_DIR || path.resolve('.agent-control'), manifestDir = process.env.AGENT_CONTROL_JOB_DIR || path.resolve('config/jobs'), reasoningPlanner?: WorkParcelPlanner, modelRegistry?: ModelRegistry, codexNodeExecution?: CodexNodeExecutionPort, executionSessions?: ExecutionSessionRuntime) {
  const harnessEfficiency = new FileHarnessEfficiencyLedger(path.join(stateRoot, 'harness-efficiency', 'model-invocations.json'));
  const adaptiveOrchestration = new AdaptiveOrchestrationRuntime(new FileAdaptiveOrchestrationStore(path.join(stateRoot, 'adaptive-orchestration', 'state.json')), config.adaptiveOrchestration);
  const cacheExperts = new CacheAwareExpertRuntime(new FileCacheExpertStore(path.join(stateRoot, 'cache-aware-experts', 'state.json')), config.cacheAwareExperts);
  const learnedSkills = new SkillLearningRuntime(new FileSkillLearningStore(path.join(stateRoot, 'learned-skills', 'state.json')), config.learnedSkills);
  const energyTelemetry = new EnergyTelemetryRuntime(new FileEnergyTelemetryStore(path.join(stateRoot, 'energy-telemetry', 'state.json')));
  const deterministicSkills=registerCoreDeterministicHandlers(new DeterministicSkillRuntime(new FileDeterministicSkillStore(path.join(stateRoot,'deterministic-skills','state.json')),config.deterministicSkills));
  const costRouting={config,ledger:new CostRoutingLedger(path.join(stateRoot,'cost-routing','decisions.jsonl'))};
  const {workers, managedNodes, actions, catalog,labJobs} = buildJobRuntimeDefinition(config, manifestDir, harnessEfficiency, modelRegistry, codexNodeExecution,deterministicSkills,costRouting);
  const harnessProfiles = configuredHarnessProfiles(config.harnessEfficiency), harnessProfileRouter = configuredHarnessProfileRouter(config.harnessEfficiency), contextPacketBuilder = new ContextPacketBuilder(harnessProfiles);
  for (const resource of config.resources) if (resource.transport.type === 'local') workers.setHealth(resource.id, 'healthy');
  const repositoryRoots = config.jobs?.repositoryRoots ?? [path.resolve('.')];
  const safety = new RuntimeSafetySupervisor({id: 'agent-control.runtime-safety/v1', approvedRepositoryRoots: repositoryRoots.map(root => path.resolve(root)), approvedRemoteNodes: config.resources.map(resource => resource.id)}, path.join(stateRoot, 'runtime-safety', 'decisions.json'));
  const runtime = createJobRuntime(stateRoot, catalog, actions, workers, {efficiency: harnessEfficiency, safety, executionSessions});
  const agentTemplates=new AgentTemplateRegistry().loadDirectory(process.env.AGENT_CONTROL_TEMPLATE_DIR??'');
  const securityAudits=new SecurityAuditRuntime(new SecurityAuditStore(path.join(stateRoot,'security-audits')),repositoryRoots);
  registerSecurityAudit(runtime,securityAudits);
  registerSecurityAuditContinuation(runtime,securityAudits);
  if(process.env.AGENT_CONTROL_RUNTIME_BENCHMARK_CONFIG)registerRuntimeBenchmark(runtime,JSON.parse(fs.readFileSync(process.env.AGENT_CONTROL_RUNTIME_BENCHMARK_CONFIG,'utf8')),harnessEfficiency);
  if(process.env.AGENT_CONTROL_SPECULATIVE_BENCHMARK_CONFIG)registerSpeculativeDecoding(runtime,JSON.parse(fs.readFileSync(process.env.AGENT_CONTROL_SPECULATIVE_BENCHMARK_CONFIG,'utf8')));
  const workParcels = new WorkParcelCoordinator(runtime, new WorkParcelStore(path.join(stateRoot, 'work-parcels', 'parcels.json')), new CatalogNaturalLanguagePlanner(runtime, reasoningPlanner ?? cacheAwareExpertQualificationPlanner()), harnessEfficiency, modelRegistry, adaptiveOrchestration, cacheExperts,agentTemplates);
  return Object.assign(runtime, {managedNodes, harnessEfficiency, harnessProfiles, harnessProfileRouter, contextPacketBuilder, workParcels, adaptiveOrchestration, cacheExperts, agentTemplates,labJobs,learnedSkills, deterministicSkills, energyTelemetry,securityAudits});
}

export function startManagedNodeMonitoring(runtime: ReturnType<typeof buildJobRuntime>, onChange?: (snapshot: ManagedNodeSnapshot) => void, onError?: (error: Error) => void) { return runtime.managedNodes.start(onChange, onError); }

export async function runJobSchedulerTick(runtime: Pick<ReturnType<typeof buildJobRuntime>, 'tickSchedules' | 'tick'>, onChange?: (runId: string, status: string) => void, onError?: (error: Error) => void) {
  try { const created = await runtime.tickSchedules(); for (const run of created) onChange?.(run.id, run.status); const changed = await runtime.tick(); if (changed) onChange?.(changed.id, changed.status); }
  catch (error) { const failure = error instanceof Error ? error : new Error(String(error)); if (onError) onError(failure); else throw failure; }
}

export async function runWorkParcelTick(runtime: Pick<ReturnType<typeof buildJobRuntime>, 'workParcels'>, onChange?: (parcelId: string, status: string) => void, onError?: (error: Error) => void) { try { const changed = await runtime.workParcels.tick(); if (changed) onChange?.(changed.id, changed.status); } catch (error) { const failure = error instanceof Error ? error : new Error(String(error)); if (onError) onError(failure); else throw failure; } }

export function startJobScheduler(runtime: ReturnType<typeof buildJobRuntime>, onChange?: (runId: string, status: string) => void, intervalMs = 1000, onError?: (error: Error) => void) {
  let scheduling = false, stopped = false;
  const inFlight = new Set<Promise<unknown>>();
  const retryTimers = new Set<NodeJS.Timeout>();
  const report = onError ?? (error => process.emitWarning(`job scheduler failure: ${error.message}`));
  const schedule = async () => {
    if (scheduling || stopped) return;
    scheduling = true;
    try {
      const created = await runtime.tickSchedules(); for (const run of created) onChange?.(run.id, run.status);
      await runWorkParcelTick(runtime, onChange, report);
      while (!stopped && inFlight.size < runtime.schedulerConcurrencyLimit()) {
        const dispatched = runtime.dispatch(); if (!dispatched) break;
        const signature = (run: ReturnType<typeof runtime.ledger.get>) => JSON.stringify([run?.status, run?.steps.map(step => [step.id, step.status, step.attempts.length, step.endedAt])]);
        const before = signature(runtime.ledger.get(dispatched.runId)); let progressed = false, rejected = false;
        const completion = dispatched.completion.then(changed => { progressed = signature(changed) !== before; if (changed) onChange?.(changed.id, changed.status); }).catch(error => { rejected = true; report(error instanceof Error ? error : new Error(String(error))); }).finally(() => { inFlight.delete(completion); if (stopped) return; if (progressed) queueMicrotask(() => void schedule()); else if (rejected) { const retry = setTimeout(() => { retryTimers.delete(retry); void schedule(); }, 250); retry.unref(); retryTimers.add(retry); } });
        inFlight.add(completion);
      }
    } catch (error) { report(error instanceof Error ? error : new Error(String(error))); }
    finally { scheduling = false; }
  };
  const timer = setInterval(() => void schedule(), intervalMs); timer.unref(); void schedule(); return () => { stopped = true; clearInterval(timer); for(const retry of retryTimers)clearTimeout(retry); retryTimers.clear(); };
}

export function buildGovernedRetrievalRuntime(config: AgentControlConfig, stateRoot = process.env.AGENT_CONTROL_STATE_DIR || path.resolve('.agent-control')) {
  const names=config.retrieval?.providers??['exact','lexical'];
  const providers=names.map(name=>name==='exact'?new RepositoryTextRetrievalProvider('exact'):name==='lexical'?new RepositoryTextRetrievalProvider('lexical'):new ZgRetrievalProvider(new SpawnZgSearchExecutor(config.retrieval?.zgExecutable??'zg')));
  const progression:RetrievalStrategy[]=['EXACT','LEXICAL',...(names.includes('zg')?['SEMANTIC' as const,'HYBRID' as const]:[])];
  return new GovernedRetrievalRuntime(providers,{enabled:config.retrieval?.enabled??false,maximumCalls:config.retrieval?.maximumCalls,maximumEvidenceItems:config.retrieval?.maximumEvidenceItems,maximumEvidenceTokens:config.retrieval?.maximumEvidenceTokens,minimumConfidence:config.retrieval?.minimumConfidence,requiredCoverage:config.retrieval?.requiredCoverage,contextPressurePercent:config.retrieval?.contextPressurePercent,contextPressureEvidenceFraction:config.retrieval?.contextPressureEvidenceFraction,allowedLocality:config.retrieval?.allowRemote?['LOCAL','REMOTE','HYBRID']:['LOCAL'],progression},{file:path.join(stateRoot,'retrieval','evidence.json')});
}

export function buildParameterizedJobRuntime(config: AgentControlConfig, modelRegistry: ModelRegistry, workParcels: WorkParcelCoordinator, stateRoot = process.env.AGENT_CONTROL_STATE_DIR || path.resolve('.agent-control'), tokenRouting?: TokenAwareBatonRuntime, contracts?: ContractExecutionRuntime, handoffs?: GovernedHandoffRuntime, codexNodeExecution?: CodexNodeExecutionPort, retrieval = buildGovernedRetrievalRuntime(config,stateRoot),contextPacketBuilder=new ContextPacketBuilder(configuredHarnessProfiles(config.harnessEfficiency)),qualityGate?:RepositoryReviewQualityGate) {
  const definitions = new ParameterizedJobRegistry(); definitions.register(repositoryCodeReviewDefinition);
  const roots = config.jobs?.repositoryRoots ?? (process.env.AGENT_CONTROL_REPOSITORY_ROOTS?.split(path.delimiter).filter(Boolean) || [path.resolve('.')]);
  const lifecycle = tokenRouting && contracts && handoffs ? {routing: tokenRouting, contracts, handoffs} : undefined;
  const transportIntegrity = new TransportIntegrityRuntime(path.join(stateRoot, 'transport-integrity', 'records.json'));
  const executor = new DirectRepositoryReviewExecutor(modelRegistry, workParcels.store, tokenRouting, lifecycle, undefined, codexNodeExecution, retrieval,new RetrievedEvidenceContextCompiler(contextPacketBuilder,new InMemoryContextGraph()),qualityGate,undefined,workParcels.adaptiveOrchestration,transportIntegrity,workParcels.efficiency);
  return createParameterizedJobEngine(stateRoot, definitions, modelRegistry, executor, {allowedRepositoryRoots: roots, allowedRepositoryRemotes: config.jobs?.repositoryRemotes, nodeHealthy: nodeId => { const resource = config.resources.find(item => item.id === nodeId); if (!resource) return false; if (resource.transport.type === 'local') return true; const node = workParcels.runtime.workers.list().find(item => item.id === nodeId); return node?.health === 'healthy'; }}, new ResourceRepositoryResolver(config.resources), {parcels: workParcels.store, tokenRouting});
}

export function startParameterizedJobScheduler(runtime: ReturnType<typeof buildParameterizedJobRuntime>, onChange?: (runId: string, status: string) => void, intervalMs = 1000, onError?: (error: Error) => void) {
  let active = false, stopped = false;
  const tick = async () => { if (active || stopped) return; active = true; try { const created = await runtime.tickSchedules(); for (const run of created) onChange?.(run.id, run.status); const reconciled = await runtime.reconcileInterrupted(); for (const run of reconciled) onChange?.(run.id, run.status); const completed = await runtime.executeNext(); if (completed) onChange?.(completed.id, completed.status); } catch (error) { (onError ?? (failure => process.emitWarning(failure.message)))(error instanceof Error ? error : new Error(String(error))); } finally { active = false; } };
  const timer = setInterval(() => void tick(), intervalMs); timer.unref(); void tick(); return () => { stopped = true; clearInterval(timer); };
}

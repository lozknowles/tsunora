import {recordedRuntimeBenchmarkRoute} from './runtime-benchmark-projection.js';
import {labObservations,labQualificationSummaries,labObservationForApi} from './lab-observation.js';
import {physicalInferenceMeasurements} from './physical-inference-observation.js';
import {inspectorAccounting} from './observability.js';
import {usageProjection,usageAnswer,usageObservations,type UsageQuery} from './usage-projection.js';
import {modelWatchPlan,type ModelWatchRuntime} from './model-watch-runtime.js';
import {intelligenceHash} from './model-landscape.js';
import type {LocalBenchmarkController} from './local-llm-benchmark-controller.js';
import {projectRecordedJobProcess} from "./runtime-map.js";
import {appendEvent, batonHealth, checkpoint, saveWorkspace, touchBaton, type LaneState, type Mode, type VerificationEvidence, type VerificationPolicy, type WorkspaceState} from '../state.js';
import {ControlPlane} from '../control-plane.js';
import {requestSelfRoute, type SelfRouteRequest} from './dashboard.js';
import type {ProviderRegistry} from './providers.js';
import type {PtyRegistry} from './pty.js';
import {VerificationService} from './verification.js';
import type {RouteDecision} from './routing.js';
import type {ContextStore} from './context.js';
import type {JobRuntime} from './job-runtime.js';
import {LocalNodeResources} from './node-resources.js';
import {nodeWorkIndex, projectNodeDashboard, projectRunInspector, projectJobInspector, inspectorHistory, scopedInspectorUsage} from './observability.js';
import {listWorkspaceRoots,projectWorkspace,searchWorkspaces,type WorkspaceNodeDashboard,type WorkspaceRunInspector,type WorkspaceSource} from './navigable-workspace.js';
import type {ManagedNodeManager, ManagedNodeSnapshot} from './managed-node.js';
import {safeTranscriptText} from './execution-history.js';
import type {OutputAuthorityScope, OutputExpansionRequest, TokenAwareOutputMetrics, TokenAwareOutputService} from './token-aware-output.js';
import {MemoryHarnessEfficiencyLedger, type HarnessEfficiencyLedgerPort, type HarnessEfficiencyMetrics} from './harness-efficiency.js';
import {AGENT_CONTROL_VERSION} from '../version.js';
import type {WorkParcelCoordinator} from './work-parcels.js';
import type {WorkBoardRuntime} from './work-board.js';
import type {AgentTemplateRegistry} from './agent-template.js';
import {probeProvider} from './provider-health.js';
import {deriveSystemReadiness, type RegisteredService, type SystemReadiness} from './system-readiness.js';
import type {ModelRegistry, ModelRouteRequest} from './model-registry.js';
import {qualifyModel} from './model-qualification.js';
import {qualifyAccountProfile} from './account-profile-qualification.js';
import type {CodexNodeExecutionPort} from './codex-node-execution.js';
import type {ModelConfig, ModelRoutingConfig, ProviderConfig} from './config.js';
import type {ParameterizedJobEngine} from './parameterized-job-engine.js';
import {nextSavedJobOccurrence} from './parameterized-job-registry.js';
import type {SavedJob} from './parameterized-job-types.js';
import {legacyAttribution, type IdentityControlPlane, type WorkAttribution} from './identity-control-plane.js';
import type {FastExecutionLedgerPort} from './fast-execution.js';
import {RuntimeObservability} from './runtime-observability.js';
import type {TokenAwareBatonRuntime, TokenRoutingProjection} from './token-aware-baton-routing.js';
import type {GovernedRetrievalRuntime, RetrievalProjection} from './governed-retrieval.js';
import {projectLaneHistory, projectParameterizedRunHistory, type ExecutionHistoryEntry} from './execution-history.js';
import type {CapabilityCandidateClassification, CapabilityCandidateState, CapabilityIntelligenceStore} from './capability-intelligence.js';
import type {FrozenQualificationSuite, ModelIntelligenceLedger} from './model-intelligence.js';
import {projectDashboardCharacterCrew, type DashboardCharacterCrewProjection} from './dashboard-characters.js';
import {providerCatalogEventNarrative, type CatalogEvidenceAdjudicationInput, type ProviderCatalogRuntime} from './provider-catalog.js';
import {redactSensitiveValue} from './security-redaction.js';
import type {AdaptiveLeagueFilter, AdaptiveOrchestrationRuntime} from './adaptive-orchestration.js';
import type {ExecutionSessionMode, ExecutionSessionRuntime, ExecutionSessionSignal} from './execution-session.js';
import type {PoeBenchmarkProposalInput, PoeEvidenceResult, PoeObjectReference, PoeProjection, PoeRuntime} from './poe.js';
import type {CacheAwareExpertRuntime} from './cache-aware-expert.js';
import type {SkillLearningRuntime} from './skill-learning.js';
import type {EnergyTelemetryRuntime} from './energy-telemetry.js';
import type {DeterministicSkillRuntime} from './deterministic-skill.js';
import {compareRuntimeMaps,projectRuntimeMap,type RuntimeMapProjection} from './runtime-map.js';
import {DefaultDiscoveryProbe,type DiscoveryMode,type DiscoveryTesting,type EnvironmentDiscoveryRuntime} from './environment-discovery.js';
import type {CapabilityAdapterDefinition,CapabilityAdapterRegistry,CapabilityAdapterState,CapabilityBinding} from './capability-adapter-registry.js';
import {projectEstateMap} from './estate-map.js';
import {projectJobEstateMap,type OperationalReadiness} from './job-estate-readiness.js';
import type {DiscoveryScan} from './environment-discovery.js';
import type {InstallationLifecycle,InstallationMode,InstallationRole} from './installation-lifecycle.js';
import {createHash} from 'node:crypto';
import {governedRequestOrigin} from './request-origin.js';
import {projectSpeculativeQualification} from './speculative-decoding.js';

import type {FactorySource} from './factory-view.js';

export type ControlEventType =
  | 'social.activity'
  | 'system.snapshot'
  | 'lane.status_changed'
  | 'lane.priority_changed'
  | 'lane.mode_changed'
  | 'lane.task_changed'
  | 'lane.handoff'
  | 'lane.clone'
  | 'lane.reroute_requested'
  | 'ownership.human_takeover'
  | 'ownership.returned'
  | 'verification.changed'
  | 'provider.health_changed'
  | 'provider.catalog_changed'
  | 'resource.node_changed'
  | 'system.paused_changed'
  | 'job.run_created'
  | 'job.run_cancelled'
  | 'job.run_authentication_resumed'
  | 'job.run_retried'
  | 'job.run_resume_requested'
  | 'job.run_approved'
  | 'job.schedule_changed'
  | 'job.run_changed'
  | 'job.saved_changed'
  | 'work.parcel_created'
  | 'work.parcel_changed'
  | 'capability.intelligence_changed'
  | 'model.intelligence_changed'
  | 'provider.catalog_changed'
  | 'runtime.safety_changed'
  | 'cache.expert_invalidated'
  | 'skill.learning_changed'
  | 'energy.telemetry'
  | 'energy.routing_decision'
  | 'configuration.changed'
  | 'environment.discovery_changed'
  | 'token.telemetry'
  | 'token.governor_transition'
  | 'token.context_lifecycle'
  | 'token.baton_created'
  | 'token.handoff_result'
  | 'retrieval.started'
  | 'retrieval.provider_selected'
  | 'retrieval.escalated'
  | 'retrieval.evidence'
  | 'retrieval.context_compiled'
  | 'retrieval.rehydrated'
  | 'retrieval.invalidated'
  | 'retrieval.fallback'
  | 'retrieval.failed'
  | 'execution.session_changed'
  | 'execution.session_output'
  | 'poe.conversation_changed'
  | 'poe.proposal_changed'
  | 'poe.speech_changed'
  | 'poe.interrupted'
  | 'failure';

export interface ControlEvent {id: number; at: string; type: ControlEventType; laneId?: number; actor?: string; payload: Record<string, unknown>;}
export type OperatorRole = 'observer' | 'operator';

export interface LaneProjection {
  id: number;
  name: string;
  mode: Mode;
  priority: number;
  status: LaneState['status'];
  task: string;
  model: string;
  reasoning: string;
  executionTarget?: string;
  elapsedMs: number;
  routeReason?: string;
  confidence?: number;
  lease: LaneState['lease'];
  ptys: Array<{id: string; command: string; cwd: string; recovery: string; owner: string; observers: number}>;
  sharedTaskIds: string[];
  baton: {revision: number; status: string; nextAction: string; ancestry: string[]; health: string; evidence: string[]; contextSourceIds: string[]};
  git?: LaneState['contract']['git'];
  verification: NonNullable<LaneState['verification']>;
  contextSources: Array<{id: string; type: string; url?: string; localRef?: string; description: string; classification: string; accessibility: string}>;
  lastMeaningfulActivity: string;
  warnings: string[];
  history: ExecutionHistoryEntry[];
}

export interface SystemProjection {
  schema: 'agent-control.system-status/v1';
  authority: 'AgentControlService';
  version: string;
  health: 'healthy' | 'degraded';
  paused: boolean;
  scheduler: {nextLaneId: number | null; waiting: number; active: number; paused: number};
  lanes: LaneProjection[];
  providers: Array<{id: string; name: string; kind: string; health: string; capabilities: string[]}>;
  resources: Array<{id: string; name: string; platform: string; transport: string; capabilities: string[]; health: 'unknown' | 'healthy' | 'degraded' | 'offline'; capacity?: number; active?: number; observedAt: string | null; node?: ManagedNodeSnapshot}>;
  outstandingApprovals: number;
  lastRestorePoint: string | null;
  observedAt: string;
  jobs: {total: number; enabled: number; queued: number; waiting: number; authenticationBlocked: number; reconnecting: number; cancelling: number; cleanupUncertain: number; disconnected: number; running: number; failed: number; succeeded: number; schedulesEnabled: number;};
  tokenAwareOutput: TokenAwareOutputMetrics;
  tokenBatonRouting: TokenRoutingProjection;
  retrieval: RetrievalProjection;
  harnessEfficiency: HarnessEfficiencyMetrics;
  characterCrew: DashboardCharacterCrewProjection;
  poe: Pick<PoeProjection, 'schema' | 'identity' | 'state' | 'voice' | 'observedAt'> | null;
  executionSessions: Array<{id: string; incarnation: string; state: string; adapterId: string; scope: {runId: string; jobId: string; jobVersion: string; stepId: string; workerId: string; nodeId: string; parcelId?: string; laneId?: string; crewRole?: string; providerId?: string; accountLabel?: string; modelId?: string}; command: string; cwd: string; pid?: number; capabilities: import('./execution-session.js').ExecutionSessionCapabilities; control: {owner: 'agent' | 'human'; actorId: string; generation: number; reconciliationRequired: boolean}; activeAttachments: Array<{id: string; actorId: string; mode: ExecutionSessionMode; attachedAt: string}>; createdAt: string; startedAt: string; updatedAt: string; endedAt?: string; exitCode?: number | null; exitSignal?: string | null; outputBytes: number; outputTruncated: boolean; lastOutputAt?: string; lastError?: string}>;
}

export class ControlEventBus {
  private nextId = 1;
  private readonly listeners = new Set<(event: ControlEvent) => void>();
  private readonly recentEvents: ControlEvent[] = [];
  emit(type: ControlEventType, payload: Record<string, unknown> = {}, laneId?: number, actor?: string) {
    const event: ControlEvent = {id: this.nextId++, at: new Date().toISOString(), type, laneId, actor, payload: redactSensitiveValue(payload)};
    this.recentEvents.push(event);
    if (this.recentEvents.length > 250) this.recentEvents.shift();
    appendEvent(`control.${type}`, {laneId, actor, payload: event.payload});
    for (const listener of this.listeners) listener(event);
    return event;
  }
  subscribe(listener: (event: ControlEvent) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  history(afterId = 0) { return this.recentEvents.filter(event => event.id > afterId); }
}

export class AgentControlService {
  readonly plane: ControlPlane;
  readonly verification: VerificationService;
  readonly events = new ControlEventBus();
  private readonly routeDecisions = new Map<number, RouteDecision>();
  private approvalCount: () => number = () => 0;
  private resourceRows: Array<Omit<SystemProjection['resources'][number], 'health' | 'capacity' | 'active' | 'observedAt' | 'node'>> = [];
  private serviceRows: RegisteredService[] = [];
  private contextStore?: ContextStore;
  private jobRuntime?: JobRuntime;
  private managedNodes?: ManagedNodeManager;
  private tokenAwareOutput?: TokenAwareOutputService;
  private harnessEfficiency?: HarnessEfficiencyLedgerPort;
  private workParcels?: WorkParcelCoordinator;
  private workBoards?: WorkBoardRuntime;
  private modelRegistry?: ModelRegistry;
  private parameterizedJobs?: ParameterizedJobEngine;
  private identity?: IdentityControlPlane;
  private defaultSessionId?: string;
  private fastExecution?: FastExecutionLedgerPort;
  private runtimeObservability?: RuntimeObservability;
  private tokenBatonRouting?: TokenAwareBatonRuntime;
  private governedRetrieval?: GovernedRetrievalRuntime;
  private codexNodeExecution?: CodexNodeExecutionPort;
  private capabilityIntelligence?: CapabilityIntelligenceStore;
  private modelIntelligence?: ModelIntelligenceLedger;
  private qualificationSuite?: FrozenQualificationSuite;
  private providerCatalog?: ProviderCatalogRuntime;
  private adaptiveOrchestration?: AdaptiveOrchestrationRuntime;
  private executionSessions?: ExecutionSessionRuntime;
  private poe?: PoeRuntime;
  private cacheExperts?: CacheAwareExpertRuntime;
  private learnedSkills?: SkillLearningRuntime;
  private energyTelemetry?: EnergyTelemetryRuntime;
  private deterministicSkills?: DeterministicSkillRuntime;
  private environmentDiscovery?: EnvironmentDiscoveryRuntime;
  private modelWatches?:ModelWatchRuntime;
  private localBenchmark?:LocalBenchmarkController;
  private jobLibraryReadiness?: (scan:DiscoveryScan,now:Date)=>OperationalReadiness[];
  private capabilityAdapters?:CapabilityAdapterRegistry;
  private installation?:InstallationLifecycle;

  constructor(
    readonly state: WorkspaceState,
    readonly ptys: PtyRegistry,
    readonly providers?: ProviderRegistry,
    readonly version = AGENT_CONTROL_VERSION,
    private readonly persist: (state: WorkspaceState) => void = saveWorkspace,
  ) {
    this.plane = new ControlPlane(state);
    this.verification = new VerificationService(state, persist);
  }

  configureProjection(extras: {modelWatches?:ModelWatchRuntime;localBenchmark?:LocalBenchmarkController;jobLibraryReadiness?: (scan:DiscoveryScan,now:Date)=>OperationalReadiness[]; approvalCount?: () => number; resources?: Array<Omit<SystemProjection['resources'][number], 'health' | 'capacity' | 'active' | 'observedAt' | 'node'>>; services?: RegisteredService[]; contextStore?: ContextStore; jobRuntime?: JobRuntime; managedNodes?: ManagedNodeManager; tokenAwareOutput?: TokenAwareOutputService; tokenBatonRouting?: TokenAwareBatonRuntime; governedRetrieval?: GovernedRetrievalRuntime; codexNodeExecution?: CodexNodeExecutionPort; harnessEfficiency?: HarnessEfficiencyLedgerPort; workParcels?: WorkParcelCoordinator; workBoards?:WorkBoardRuntime; modelRegistry?: ModelRegistry; parameterizedJobs?: ParameterizedJobEngine; identity?: IdentityControlPlane; defaultSessionId?: string; fastExecution?: FastExecutionLedgerPort; runtimeObservability?: RuntimeObservability; capabilityIntelligence?: CapabilityIntelligenceStore; modelIntelligence?: ModelIntelligenceLedger; qualificationSuite?: FrozenQualificationSuite; providerCatalog?: ProviderCatalogRuntime; adaptiveOrchestration?: AdaptiveOrchestrationRuntime; executionSessions?: ExecutionSessionRuntime; poe?: PoeRuntime; cacheExperts?: CacheAwareExpertRuntime; learnedSkills?: SkillLearningRuntime; deterministicSkills?:DeterministicSkillRuntime; energyTelemetry?: EnergyTelemetryRuntime; environmentDiscovery?:EnvironmentDiscoveryRuntime; capabilityAdapters?:CapabilityAdapterRegistry; installation?:InstallationLifecycle}) {
    if (extras.modelWatches) this.modelWatches=extras.modelWatches;
    if (extras.localBenchmark) this.localBenchmark=extras.localBenchmark;
    if (extras.jobLibraryReadiness) this.jobLibraryReadiness=extras.jobLibraryReadiness;
    if (extras.approvalCount) this.approvalCount = extras.approvalCount;
    if (extras.resources) this.resourceRows = structuredClone(extras.resources);
    if (extras.services) this.serviceRows = structuredClone(extras.services);
    if (extras.contextStore) this.contextStore = extras.contextStore;
    if (extras.jobRuntime) this.jobRuntime = extras.jobRuntime;
    if (extras.managedNodes) this.managedNodes = extras.managedNodes;
    if (extras.tokenAwareOutput) this.tokenAwareOutput = extras.tokenAwareOutput;
    if (extras.tokenBatonRouting) this.tokenBatonRouting = extras.tokenBatonRouting;
    if (extras.governedRetrieval) this.governedRetrieval = extras.governedRetrieval;
    if (extras.codexNodeExecution) this.codexNodeExecution = extras.codexNodeExecution;
    if (extras.harnessEfficiency) this.harnessEfficiency = extras.harnessEfficiency;
    if (extras.workParcels) this.workParcels = extras.workParcels;
    if (extras.workBoards) this.workBoards=extras.workBoards;
    if (extras.modelRegistry) this.modelRegistry = extras.modelRegistry;
    if (extras.parameterizedJobs) this.parameterizedJobs = extras.parameterizedJobs;
    if (extras.identity) this.identity = extras.identity;
    if (extras.defaultSessionId) this.defaultSessionId = extras.defaultSessionId;
    if (extras.fastExecution) this.fastExecution = extras.fastExecution;
    if (extras.runtimeObservability) this.runtimeObservability = extras.runtimeObservability;
    if (extras.capabilityIntelligence) this.capabilityIntelligence = extras.capabilityIntelligence;
    if (extras.modelIntelligence) this.modelIntelligence = extras.modelIntelligence;
    if (extras.qualificationSuite) this.qualificationSuite = structuredClone(extras.qualificationSuite);
    if (extras.providerCatalog) this.providerCatalog = extras.providerCatalog;
    if (extras.adaptiveOrchestration) this.adaptiveOrchestration = extras.adaptiveOrchestration;
    if (extras.executionSessions) this.executionSessions = extras.executionSessions;
    if (extras.poe) this.poe = extras.poe;
    if (extras.cacheExperts) this.cacheExperts = extras.cacheExperts;
    if (extras.learnedSkills) this.learnedSkills = extras.learnedSkills;
    if (extras.energyTelemetry) this.energyTelemetry = extras.energyTelemetry;
    if (extras.deterministicSkills) this.deterministicSkills=extras.deterministicSkills;
    if (extras.environmentDiscovery) this.environmentDiscovery=extras.environmentDiscovery;
    if(extras.capabilityAdapters)this.capabilityAdapters=extras.capabilityAdapters;
    if(extras.installation)this.installation=extras.installation;
    return this;
  }

  snapshot(): SystemProjection {
    const observedAt = new Date().toISOString();
    const lanes = this.state.lanes.map(lane => this.projectLane(lane));
    const providerRows = this.providers?.list().map(provider => ({id: provider.id, name: provider.name, kind: provider.kind, health: this.providers?.health(provider.id)?.health ?? 'unknown', capabilities: [...provider.capabilities]})) ?? [];
    const workers = new Map((this.jobRuntime?.workers.list() ?? []).map(worker => [worker.id, worker]));
    const resourceRows = this.resourceRows.map(resource => { const worker = workers.get(resource.id), node = this.managedNodes?.get(resource.id); return {...resource, capabilities: node?.capabilities ?? resource.capabilities, health: node?.health ?? worker?.health ?? 'unknown', capacity: worker?.capacity, active: worker?.active, observedAt: node?.lastProbeAt ?? worker?.observedAt ?? null, ...(node ? {node} : {})}; });
    const degraded = this.state.lanes.some(lane => lane.status === 'error') || providerRows.some(provider => provider.health === 'offline') || resourceRows.some(resource => ['degraded', 'offline'].includes(resource.health));
    const jobRuns = this.jobRuntime?.ledger.list() ?? [], jobDefinitions = this.jobRuntime?.catalog.listJobs() ?? [], schedules = this.jobRuntime?.catalog.listSchedules() ?? [], savedJobs = this.parameterizedJobs?.savedJobs.list() ?? [], parameterizedRuns = this.parameterizedJobs?.runs.list() ?? [];
    const outstandingApprovals = this.approvalCount(), tokenBatonRouting = this.tokenRouting(), systems = this.systems();
    const models = this.modelRegistry?.list().map(model => ({id: model.id, provider: model.provider, enabled: model.enabled, qualificationState: model.qualification.state, accountAvailability: model.account?.availability, checkedAt: model.qualification.checkedAt})) ?? [];
    const modelBatches = this.modelIntelligence?.projection(observedAt).queue ?? [];
    const characterCrew = projectDashboardCharacterCrew({observedAt, paused: this.state.paused, lanes, runs: jobRuns, parameterizedRuns, parcels: this.workParcels?.list() ?? [], systems, models, modelBatches, tokenRouting: tokenBatonRouting, events: this.events.history(), outstandingApprovals});
    return {
      schema: 'agent-control.system-status/v1',
      authority: 'AgentControlService',
      version: this.version,
      health: degraded ? 'degraded' : 'healthy',
      paused: this.state.paused,
      scheduler: {nextLaneId: this.plane.chooseNextLane()?.id ?? null, waiting: lanes.filter(lane => lane.status === 'waiting').length, active: lanes.filter(lane => lane.status === 'working').length, paused: lanes.filter(lane => lane.status === 'paused').length},
      lanes,
      providers: providerRows,
      resources: structuredClone(resourceRows),
      outstandingApprovals,
      lastRestorePoint: this.state.lastRestorePoint,
      observedAt,
      jobs: {
        total: jobDefinitions.length + savedJobs.length,
        enabled: jobDefinitions.filter(job => job.spec.enabled !== false).length + savedJobs.filter(job => job.enabled).length,
        queued: jobRuns.filter(run => run.status === 'QUEUED').length + parameterizedRuns.filter(run => run.status === 'QUEUED').length,
        waiting: jobRuns.filter(run => run.status === 'WAITING').length,
        authenticationBlocked: jobRuns.filter(run => run.status === 'AUTHENTICATION_BLOCKED').length + parameterizedRuns.filter(run => run.status === 'AUTHENTICATION_BLOCKED').length,
        reconnecting: jobRuns.filter(run => run.status === 'RECONNECTING').length + parameterizedRuns.filter(run => run.status === 'RECONNECTING').length,
        cancelling: jobRuns.filter(run => run.status === 'CANCELLING').length + parameterizedRuns.filter(run => run.status === 'CANCELLING').length,
        cleanupUncertain: jobRuns.filter(run => run.status === 'CLEANUP_UNCERTAIN').length,
        disconnected: jobRuns.filter(run => run.status === 'DISCONNECTED').length + parameterizedRuns.filter(run => run.status === 'DISCONNECTED').length,
        running: jobRuns.filter(run => ['RUNNING', 'VERIFYING'].includes(run.status)).length + parameterizedRuns.filter(run => ['RESOLVING', 'RUNNING', 'VALIDATING'].includes(run.status)).length,
        failed: jobRuns.filter(run => ['FAILED', 'DEGRADED'].includes(run.status)).length + parameterizedRuns.filter(run => ['FAILED', 'DEGRADED'].includes(run.status)).length,
        succeeded: jobRuns.filter(run => run.status === 'SUCCEEDED').length + parameterizedRuns.filter(run => ['SUCCEEDED', 'SUCCEEDED_WITH_FINDINGS'].includes(run.status)).length,
        schedulesEnabled: schedules.filter(schedule => this.jobRuntime?.ledger.schedule(schedule.metadata.id)?.enabled).length + savedJobs.filter(job => job.schedule?.enabled).length,
      },
      tokenAwareOutput: this.commandOutputMetrics(),
      tokenBatonRouting,
      retrieval: this.retrievalProjection(),
      harnessEfficiency: this.harnessEfficiencyMetrics(),
      characterCrew,
      poe: this.poe ? (({schema,identity,state,voice,observedAt})=>({schema,identity,state,voice,observedAt}))(this.poe.projection()) : null,
      executionSessions: this.executionSessionProjection(),
    };
  }

  factorySource():Omit<FactorySource,'boards'|'kills'> {
    const skills=this.learnedSpecialists();
    return {observedAt:new Date().toISOString(),lanes:this.state.lanes.map(l=>this.projectLane(l)),
      runs:this.jobRuntime?.ledger.list()??[],workers:this.jobRuntime?.workers.list()??[],workerIdentities:this.jobRuntime?.workers.executionIdentities()??[],
      models:this.modelRegistry?.list()??[],invocations:this.harnessEfficiency?.list()??[],
      artifacts:(this.jobRuntime?.artifacts.list()??[]).map(({storageRef:_,...a})=>a),
      parcels:this.workParcels?.list()??[],skills:skills.specialists,skillRouting:skills.routing,events:this.events.history()};
  }
  jobs() { return this.mustJobRuntime().jobsProjection(); }
  job(id: string) { const values = this.jobs().filter(job => job.metadata.id === id); if (!values.length) throw new Error('job_missing'); return values.sort((a, b) => b.metadata.version.localeCompare(a.metadata.version))[0]; }
  runs(jobId?: string) { return this.mustJobRuntime().ledger.list(jobId); }
  run(id: string) { const value = this.mustJobRuntime().ledger.get(id); if (!value) throw new Error('run_missing'); return value; }
  createJobRun(id: string, parameters: Record<string, unknown>, actor: string, requestKey?: string) { const job = this.job(id); const run = this.mustJobRuntime().createRun(`${job.metadata.id}@${job.metadata.version}`, parameters, {type: 'manual', actor}, undefined, requestKey); this.events.emit('job.run_created', {runId: run.id, jobId: run.jobId, trigger: 'manual'}, undefined, actor); return run; }
  agentTemplates(){const runtime=this.mustJobRuntime() as JobRuntime&{agentTemplates:AgentTemplateRegistry};return runtime.agentTemplates.list().map(record=>({...record.manifest,execution:{state:'SUPPORTED_WHEN_NATIVE_EXECUTOR_READY'},effectiveness:record.effectiveness}));}
  agentTemplate(id:string,version?:string){const values=this.agentTemplates().filter(template=>template.id===id);if(!values.length)throw Error('agent_template_missing');const selected=version?values.find(template=>template.version===version):values.sort((a,b)=>b.version.localeCompare(a.version))[0];if(!selected)throw Error('agent_template_version_missing');return selected;}
  agentTemplateReadiness(id:string,version:string,jobReference:string,permissions:Array<{kind:string;scope:string}>){const runtime=this.mustJobRuntime() as JobRuntime&{agentTemplates:AgentTemplateRegistry},job=runtime.catalog.job(jobReference);if(!job){const template=runtime.agentTemplates.get(`${id}@${version}`);return{schema:'agent-control.template-readiness/v1',template:`${id}@${version}`,templateDigest:template.manifest.content_digest,job:jobReference,jobDigest:null,executor:{state:'UNAVAILABLE',adapter:null},effectiveness:template.effectiveness,state:'BLOCKED',reasons:['native-executor:unregistered'],authorityGranted:false};}return runtime.agentTemplates.readiness(`${id}@${version}`,job,runtime.workers.list(),permissions);}
  useAgentTemplate(id:string,input:{version:string;digest:string;job:string;jobDigest?:string;parameters?:Record<string,unknown>;permissions?:Array<{kind:string;scope:string}>;prompt:string;requestKey:string},actor:string){const runtime=this.mustJobRuntime() as JobRuntime&{agentTemplates:AgentTemplateRegistry;workParcels:WorkParcelCoordinator},job=runtime.catalog.job(input.job);if(!job)throw Error('agent_template_not_ready:native-executor:unregistered');const readiness=runtime.agentTemplates.readiness(`${id}@${input.version}`,job,runtime.workers.list(),input.permissions??[]);if(readiness.state!=='READY')throw Error(`agent_template_not_ready:${readiness.reasons.join(',')}`);const template={id,version:input.version,digest:input.digest,...(input.jobDigest?{jobDigest:input.jobDigest}:{})},parcel=runtime.workParcels.submitTemplatePlan(input.prompt,actor,input.requestKey,{objective:input.prompt,planner:{kind:'deterministic',reason:'Authenticated operator selected a digest-bound Agent Template and registered Job'},stages:[{id:'execute',name:job.metadata.name,job:input.job,parameters:input.parameters??{},template}]});this.events.emit('work.parcel_created',{parcelId:parcel.id,status:parcel.status,template:`${id}@${input.version}`,templateDigest:input.digest,job:input.job,jobDigest:input.jobDigest??null},undefined,actor);return{parcel,readiness};}
  cancelJobRun(id: string, actor: string) { const run = this.mustJobRuntime().cancel(id, `cancelled_by:${actor}`); this.events.emit('job.run_cancelled', {runId: id}, undefined, actor); return run; }
  retryJobRun(id: string, actor: string) { const run = this.mustJobRuntime().retry(id); this.events.emit('job.run_retried', {sourceRunId: id, runId: run.id}, undefined, actor); return run; }
  applyTargetBoundary(runId:string,actor:string,body:any){return this.mustJobRuntime().applyTargetBoundary(runId,String(body.target??''),String(body.operationId??''),actor,Array.isArray(body.attemptIds)?body.attemptIds.map(String):[]);}
  diagnoseTargetEnvironment(target:string,actor:string){const recovery=this.mustJobRuntime().targetResets.get(target);if(!recovery)throw Error('target_reset_unconfigured');return recovery.diagnose(actor);}
  prepareTargetContinuation(target:string,actor:string,body:any){return this.mustJobRuntime().prepareTargetContinuation(target,{actor,target,reason:String(body.reason??''),requestKey:String(body.requestKey??''),expiresAt:String(body.expiresAt??''),parentOperationId:String(body.parentOperationId??''),approvePreparation:body.approvePreparation===true,allowedAction:body.allowedAction,...(typeof body.runId==='string'?{runId:body.runId}:{})});}
  executeTargetContinuation(target:string,id:string,actor:string,body:any){return this.mustJobRuntime().executeTargetContinuation(target,id,{actor,target,reason:String(body.reason??''),requestKey:String(body.requestKey??''),expiresAt:String(body.expiresAt??''),approveReset:body.approveReset===true,...(typeof body.runId==='string'?{runId:body.runId}:{})});}
  targetResetState(target:string){return this.mustJobRuntime().targetResets.get(target)?.state()??null;}
  resetTarget(target:string,actor:string,body:any){return this.mustJobRuntime().resetTarget(target,{actor,reason:String(body.reason??''),requestKey:String(body.requestKey??''),expiresAt:String(body.expiresAt??''),approveReset:body.approveReset===true,...(typeof body.runId==='string'?{runId:body.runId}:{})});}
  verifyJobCleanup(id:string,actor:string){return this.mustJobRuntime().verifyCleanup(id,actor);}
  inspectJobRunResume(id:string) { return this.mustJobRuntime().inspectResume(id); }
  resumeJobRun(id:string,actor:string,requestKey:string,expiresAt:string) { const runtime=this.mustJobRuntime(),before=runtime.ledger.get(id)?.resumptions?.length??0,run=runtime.resume(id,actor,requestKey,expiresAt);if((run.resumptions?.length??0)>before)this.events.emit('job.run_resume_requested',{runId:run.id},undefined,actor);return run; }
  approveJobRun(id: string, policy: string, actor: string) { if (!policy.trim()) throw new Error('approval_policy_required'); const run = this.mustJobRuntime().approve(id, policy, actor); this.events.emit('job.run_approved', {runId: id, approval: policy}, undefined, actor); return run; }
  schedules() { return this.mustJobRuntime().catalog.listSchedules().map(schedule => ({...schedule, state: this.mustJobRuntime().ledger.schedule(schedule.metadata.id)})); }
  setScheduleEnabled(id: string, enabled: boolean, actor: string) { const state = this.mustJobRuntime().setScheduleEnabled(id, enabled); this.events.emit('job.schedule_changed', {scheduleId: id, enabled}, undefined, actor); return state; }
  jobQueue() { return this.mustJobRuntime().queueProjection(); }
  workers() { return this.mustJobRuntime().workers.list(); }
  executionSessionProjection() { return (this.executionSessions?.list() ?? []).map(session => ({id: session.id, incarnation: session.incarnation, state: session.state, adapterId: session.adapterId, scope: structuredClone(session.scope), command: session.command, cwd: session.cwd, ...(session.pid === undefined ? {} : {pid: session.pid}), capabilities: structuredClone(session.capabilities), control: structuredClone(session.control), activeAttachments: session.attachments.filter(item => !item.detachedAt).map(item => ({id: item.id, actorId: item.actorId, mode: item.mode, attachedAt: item.attachedAt})), createdAt: session.createdAt, startedAt: session.startedAt, updatedAt: session.updatedAt, ...(session.endedAt ? {endedAt: session.endedAt} : {}), ...(session.exitCode === undefined ? {} : {exitCode: session.exitCode}), ...(session.exitSignal === undefined ? {} : {exitSignal: session.exitSignal}), outputBytes: session.outputBytes, outputTruncated: session.outputTruncated, ...(session.lastOutputAt ? {lastOutputAt: session.lastOutputAt} : {}), ...(session.lastError ? {lastError: session.lastError} : {})})); }
  runtimeMap(parcelId?:string,replayAt?:string):RuntimeMapProjection {const parcels=this.workParcels?.list()??[],parcel=parcelId?parcels.find(item=>item.id===parcelId):parcels.find(item=>!item.endedAt)??parcels[0];if(parcelId&&!parcel)throw new Error('work_parcel_missing');const sessions=this.executionSessions?.list({parcelId:parcel?.id})??[];const map=projectRuntimeMap({parcel,runs:this.jobRuntime?.ledger.list()??[],sessions,sessionEvents:id=>this.executionSessions?.events(id)??[],tokenRouting:this.tokenRouting(),retrieval:this.retrievalProjection(),...(replayAt?{replayAt}:{})});return this.localBenchmark&&!replayAt?this.localBenchmark.project(map,parcel?.stages.flatMap(s=>s.runId?[s.runId]:[])??[]):map;}
  runtimeRunMap(runId:string) {const run=this.jobRuntime?.ledger.list().find(r=>r.id===runId);if(!run)throw new Error('job_run_missing');const scan=this.environmentDiscovery?.projection().latest;const target=run.parameters.targetResourceId??run.parameters.target;const ids=scan?.items.some(i=>i.id===target)?[String(target)]:[];const map=projectRecordedJobProcess(run,ids,undefined,this.harnessEfficiency?.list()??[]);return this.localBenchmark?this.localBenchmark.project(map,[runId]):map;}
  modelWatchProjection(){return this.mustModelWatches().projection();}
  proposeModelWatch(input:unknown){return this.mustModelWatches().policies.propose(input);}
  approveModelWatch(digest:string,actor:string){return this.mustModelWatches().policies.approve(digest,actor);}
  revokeModelWatch(digest:string,actor:string){return this.mustModelWatches().policies.revoke(digest,actor);}
  runModelWatch(digest:string,actor:string){const runtime=this.mustModelWatches();runtime.policies.approved(digest);const runKey=intelligenceHash({digest,actor,at:new Date().toISOString()});return this.workParcels!.submitApprovedPlan('Run approved model watch',actor,runKey,modelWatchPlan(digest,runKey));}
  personalLeague(benchmark:string,comparison:string){return this.mustModelWatches().league.table(benchmark,comparison);}
  definePersonalBenchmark(input:unknown){return this.mustModelWatches().league.define(input);}
  private mustModelWatches(){if(!this.modelWatches)throw Error('model_watches_unconfigured');return this.modelWatches;}
  private readonly nodeResourceSampler = new LocalNodeResources();
  private speculativeQualifications(runId?:string) {
    if(!this.jobRuntime)return[];
    return this.jobRuntime.artifacts.list(runId).filter(item=>item.name==='speculative-decoding-report').flatMap(item=>{try{const projection=projectSpeculativeQualification(this.jobRuntime!.artifacts.read(item.id),{artifactId:item.id,sha256:item.sha256});return projection?[projection]:[];}catch{return[];}});
  }
  nodeDashboard(id:string) {
    const dashboard=projectNodeDashboard(this.estateMap(),id,this.nodes(),nodeWorkIndex(this.workParcels?.list()??[],this.parameterizedJobs?.runs.list()??[],this.executionSessions?.list()??[],this.jobRuntime?.ledger.list()??[],this.harnessEfficiency?.list()??[]));
    const items=this.environmentDiscovery?.projection().latest?.items??[];
    for(const resource of dashboard.resources){const item=items.find(i=>i.id===resource.id);if(!item)continue;
      for(const key of ['index','vramMiB','batteryPercent','thermalCelsius']){const value=item.attributes[key];if(typeof value==='number'&&Number.isFinite(value)&&value>=0)resource.detail[key]=value;}
      if(item.attributes.accelerator==='nvidia')resource.detail.accelerator='nvidia';
    }
    const identities=new Set([id,dashboard.nodeId]);
    return Object.assign(dashboard,{speculativeQualifications:this.speculativeQualifications().filter(item=>identities.has(item.node))});
  }
  async nodeDashboardResources(id:string) {
    const dashboard=this.nodeDashboard(id), item=this.environmentDiscovery?.projection().latest?.items.find(i=>i.id===id);
    const local=item?.provenance.some(p=>p.adapter==='local-machine'&&p.method==='node:os'&&p.authority==='AUTHORITATIVE');
    if(!local)return {nodeId:dashboard.nodeId,native:null,managed:dashboard.managed,reason:'No local native binding; existing managed-node measurements only'};
    const accelerators=dashboard.resources.filter(n=>n.type==='gpu').map(n=>({id:n.id,index:Number(n.detail.index),adapter:String(n.detail.accelerator??'unknown')}));
    return {nodeId:dashboard.nodeId,native:await this.nodeResourceSampler.sample(accelerators),managed:dashboard.managed,reason:null};
  }
  runInspector(id:string,operationId?:string) {
    const job=this.jobRuntime?.ledger.list().find(r=>r.id===id);
    if(job){const map=this.runtimeRunMap(id),estate=this.estateMap(),sessions=this.executionSessions?.list()??[],nodes=nodeWorkIndex([],[],sessions,[job],this.harnessEfficiency?.list()??[]).map(w=>w.nodeId);

      // A job definition filter is not a run filter. Never label sibling-run accounting as this run.
      const ledger=this.harnessEfficiency;
      const usage=usageProjection(ledger?{list:()=>ledger.list().filter(row=>row.runId===id),usageHistory:()=>ledger.usageHistory?.()??{excludedIds:[],events:[]}}:undefined,this.energyProjection().executions,{period:'all',groupBy:'agent',limit:1000});
      const inspector=projectJobInspector(job,map,usage,estate,nodes,operationId,this.nodes(),ledger?.list()??[]);
      const nativeRoute=recordedRuntimeBenchmarkRoute(this.jobRuntime!.artifacts,id,estate);
      if(nativeRoute){const physical=nativeRoute.path.find(n=>n.kind==='PHYSICAL_DEVICE');Object.assign(inspector,{executionRoute:nativeRoute});if(physical)inspector.physicalNodes=[{id:physical.id,label:physical.label,nodeId:String(estate.nodes.find(n=>n.id===physical.id)?.detail.nodeId??'')}];}
      const artifactEvidence=job.artifacts.flatMap(artifactId=>{const metadata=this.jobRuntime?.artifacts.get(artifactId);if(!metadata)return[];let content:string|null=null;if(['json','text','markdown','application/json','text/plain','text/markdown'].includes(metadata.type)){try{const raw=this.jobRuntime!.artifacts.read(artifactId);content=safeTranscriptText(typeof raw==='string'?raw:JSON.stringify(raw,null,2),512*1024);}catch{content=null;}}return[{...this.artifact(artifactId),content}];});
      const physicalMeasurements=job.artifacts.flatMap(id=>{const meta=this.jobRuntime!.artifacts.get(id);if(!meta)return[];try{return physicalInferenceMeasurements(this.jobRuntime!.artifacts.read(id),meta);}catch{return[];}}).filter(m=>!operationId||inspector.calls.some(c=>c.id===m.accountingInvocationId));
      const qualificationSummaries=labQualificationSummaries(id,this.jobRuntime!.artifacts.list(id),artifactId=>this.jobRuntime!.artifacts.read(artifactId));
      const qualificationAttempts=labObservations(id,this.jobRuntime!.artifacts.list(id),artifactId=>this.jobRuntime!.artifacts.read(artifactId)).filter(a=>!operationId||inspector.calls.some(c=>c.id===a.accountingInvocationId));
      const speculativeQualification=this.speculativeQualifications(id).at(-1)??null;
      const calls=inspector.calls.map(c=>{const m=physicalMeasurements.find(m=>m.accountingInvocationId===c.id);return {...c,exchange:m?{input:m.inputText,output:m.outputText,redacted:true,truncated:m.exchangeTruncated}:null};});
      return {...inspector,calls,physicalMeasurements,qualificationAttempts:qualificationAttempts.map(labObservationForApi),qualificationSummaries,speculativeQualification,artifactEvidence,parentUsage:null,runScope:null,sessions:this.executionSessionProjection().filter(s=>s.scope.runId===id),parentRunId:null,history:inspectorHistory({...inspector,calls,physicalMeasurements,operations:[...inspector.operations,...artifactEvidence.map(a=>({id:a.id,type:'artifact' as const,label:a.name,state:'SUCCEEDED' as const,expandable:false,detail:{type:a.type,schema:a.schema,createdAt:a.createdAt,size:a.size,sha256:a.sha256,content:a.content},evidence:[{kind:'artifact',id:a.id,sha256:a.sha256}]}))]}),historyScope:'Derived human-readable export of durable Job Run records and retained artifacts',siblingParcels:[]};
    }
    const parent=this.parameterizedJobs?.runs.list().find(r=>r.id===id||r.workParcelIds.includes(id));
    const parcelId=parent?.id===id?parent.workParcelIds.at(-1):id;
    if(!parcelId)throw new Error('observability_run_not_yet_dispatched');
    const parcel=this.parcel(parcelId),map=this.runtimeMap(parcelId);
    const usage=this.usage({period:'all',filters:{parcel:parcelId},groupBy:'agent',limit:1000});
    const inspector=projectRunInspector(parcel,map,usage,this.estateMap(),operationId,inspectorAccounting(this.harnessEfficiency,this.energyProjection().executions,parcel.audit.invocations.flatMap(i=>i.accountingInvocationId?[i.accountingInvocationId]:[])),this.nodes());
    const parentUsage=parent?scopedInspectorUsage(this.harnessEfficiency,this.energyProjection().executions,{runId:parent.id,parcelIds:parent.workParcelIds}):null;
    const transcript=parent&&this.parameterizedJobs?.transcripts?.metadata(parent.id)?this.parameterizedRunTranscript(parent.id):null;
    return {...inspector,context:{...inspector.context,repository:parent?.context?redactSensitiveValue(parent.context):null},parentUsage,runScope:parent?{id:parent.id,label:parent.definition.displayName,status:parent.status,parcelCount:parent.workParcelIds.length}:null,sessions:this.executionSessionProjection().filter(s=>s.scope.parcelId===parcelId),parentRunId:parent?.id??null,kind:'parcel' as const,history:transcript??inspectorHistory(inspector),historyScope:parent?'Complete parent Job Run, including all its Work Parcels':'Work Parcel audit and operation evidence',siblingParcels:parent?.workParcelIds??[parcelId]};
  }
  estateHeartbeat(){const map=this.estateMap();return {observedAt:map.observedAt,scanId:map.parcelId,freshness:map.freshness,counts:(map as unknown as {estateCounts:unknown}).estateCounts};}
  private workspaceSource():WorkspaceSource {
    const estate=this.estateMap(),nodeIds=estate.nodes.filter(node=>['machine','device'].includes(node.type)).map(node=>node.id),nodes=nodeIds.flatMap(id=>{try{return[this.nodeDashboard(id) as unknown as WorkspaceNodeDashboard];}catch{return[];}});
    const parameterized=this.parameterizedJobs?.runs.list()??[],expandRunId=(id:string)=>parameterized.find(run=>run.id===id)?.workParcelIds??[id];
    const runIds=[...(this.workParcels?.list()??[]).map(parcel=>parcel.id),...(this.jobRuntime?.ledger.list()??[]).map(run=>run.id),...parameterized.flatMap(run=>run.workParcelIds)];
    const runs=[...new Set(runIds)].flatMap(id=>{try{return[this.runInspector(id) as unknown as WorkspaceRunInspector];}catch{return[];}});
    const projectMap=new Map<string,NonNullable<WorkspaceSource['projects']>[number]>();
    for(const board of this.workBoards?.list()??[]){
      const declarations=[{project:board.project,workspace:board.workspace,runIds:board.items.flatMap(item=>item.runs.map(run=>run.runId))},...board.items.map(item=>({project:item.project,workspace:item.workspace,runIds:item.runs.map(run=>run.runId)}))];
      for(const declaration of declarations){const id=declaration.project.trim();if(!id)continue;const current=projectMap.get(id)??{id,label:id,workspaces:[],boardIds:[],runIds:[],evidence:[]};current.workspaces=[...new Set([...current.workspaces,declaration.workspace])];current.boardIds=[...new Set([...current.boardIds,board.id])];current.runIds=[...new Set([...current.runIds,...declaration.runIds.flatMap(expandRunId)])];current.evidence=[...new Map([...current.evidence,{kind:'work-board',id:board.id}].map(item=>[`${item.kind}:${item.id}`,item])).values()];projectMap.set(id,current);}
    }
    const repositoryMap=new Map<string,NonNullable<WorkspaceSource['repositories']>[number]>();
    for(const run of parameterized){const repository=run.repository;if(!repository)continue;const current=repositoryMap.get(repository.identity)??{identity:repository.identity,name:repository.name,nodeId:repository.nodeId,requestedRef:repository.requestedRef,reviewedSha:repository.reviewedSha,dirty:repository.dirty,runIds:[],evidence:[]};current.runIds=[...new Set([...current.runIds,...run.workParcelIds])];current.evidence=[...new Map([...current.evidence,{kind:'resolved-repository',id:`${run.id}:${repository.reviewedSha}`}].map(item=>[`${item.kind}:${item.id}`,item])).values()];repositoryMap.set(repository.identity,current);}
    return{estate,nodes,runs,sessions:this.executionSessionProjection(),projects:[...projectMap.values()],repositories:[...repositoryMap.values()]};
  }
  workspaces(){return listWorkspaceRoots(this.workspaceSource());}
  searchWorkspaces(input:{query?:string;cursor?:string|null;limit?:number}){return searchWorkspaces(this.workspaceSource(),input);}
  workspace(id:string){return projectWorkspace(id,this.workspaceSource());}
  compareRuntimeMaps(leftParcelId:string,rightParcelId:string){return compareRuntimeMaps(this.runtimeMap(leftParcelId),this.runtimeMap(rightParcelId));}
  environmentDiscoveryProjection(){return this.mustEnvironmentDiscovery().projection();}
  estateMap(){const scan=this.mustEnvironmentDiscovery().projection().latest,now=new Date();const map=scan&&this.jobLibraryReadiness?projectJobEstateMap(scan,this.jobLibraryReadiness(scan,now),this.jobRuntime?.ledger.list()??[],now):projectEstateMap(scan,now.toISOString());return this.localBenchmark?this.localBenchmark.project(map):map;}
  installationProjection(){return this.mustInstallation().projection();}
  inspectInstallation(mode:InstallationMode,role:InstallationRole){return this.mustInstallation().inspect(mode,role);}
  discoverEnvironment(input:{mode:DiscoveryMode;testing?:DiscoveryTesting;includeRemote?:boolean;includeMemory?:boolean}){return this.mustEnvironmentDiscovery().discover(input);}
  createEnvironmentProposal(scanId:string,recommendationIds:string[],actor:string){return this.mustEnvironmentDiscovery().createProposal(scanId,recommendationIds,actor);}
  saveEnvironmentProposal(id:string,sha256:string){return this.mustEnvironmentDiscovery().saveProposal(id,sha256);}
  cancelEnvironmentProposal(id:string,sha256:string){return this.mustEnvironmentDiscovery().cancelProposal(id,sha256);}
  approveEnvironmentProposal(id:string,sha256:string,actor:string){return this.mustEnvironmentDiscovery().approveProposal(id,sha256,actor);}
  applyEnvironmentProposal(id:string,sha256:string,actor:string){return this.mustEnvironmentDiscovery().applyProposal(id,sha256,actor);}
  capabilityAdapterProjection(){return{schema:'agent-control.capability-adapter-registry/v1',records:this.mustCapabilityAdapters().list()};}
  addCapabilityAdapter(definition:CapabilityAdapterDefinition,binding:CapabilityBinding){return this.mustCapabilityAdapters().add(definition,binding);}
  importCapabilityAdapter(definition:CapabilityAdapterDefinition,binding:CapabilityBinding){return this.mustCapabilityAdapters().importDefinition(definition,binding);}
  exportCapabilityAdapter(id:string){return this.mustCapabilityAdapters().exportDefinition(id);}
  transitionCapabilityAdapter(id:string,sha256:string,state:CapabilityAdapterState){return this.mustCapabilityAdapters().transition(id,sha256,state);}
  testCapabilityAdapter(id:string,sha256:string){return this.mustCapabilityAdapters().test(id,sha256,new DefaultDiscoveryProbe());}
  poeRegression(){return this.mustPoe().regression();}
  poeKnowledge(){return this.mustPoe().knowledge();}
  poeKnowledgeSource(id:string){return this.mustPoe().knowledgeSource(id);}
  greetPoe(id:string,actor:string){return this.mustPoe().greeting(id,actor);}
  poeOperator(id:string,actor:string) {return this.mustPoe().operatorProjection(id,actor);}
  approvePoeOperator(id:string,proposalId:string,hash:string,actor:string) {return this.mustPoe().approveOperator(id,proposalId,hash,actor);}
  sharedSpeakPoe(id:string,turnId:string,actor:string){return this.mustPoe().sharedSpeechForTurn(id,turnId,actor);}
  speakPoe(id:string,turnId:string,actor:string) {return this.mustPoe().speechForTurn(id,turnId,actor);}
  transcribePoe(id:string,bytes:Uint8Array,mime:string,actor:string) {return this.mustPoe().transcribeTurn(id,bytes,mime,actor);}
  poeProjection() { const projection=this.mustPoe().projection(); projection.conversations=projection.conversations.filter(item=>item.actorId==='web-operator'&&item.channel==='dashboard'); const ids=new Set(projection.conversations.map(item=>item.id)); projection.proposals=projection.proposals.filter(item=>ids.has(item.conversationId)); projection.activeConversationId=projection.conversations[0]?.id??null; return projection; }
  createPoeConversation(channel: 'dashboard'|'whatsapp'|'voice'|'mobile', actor: string) { return this.mustPoe().createConversation({actorId: actor, channel}); }
  poeConversation(id: string) { const conversation=this.mustPoe().conversation(id); if(conversation.actorId!=='web-operator'||conversation.channel!=='dashboard')throw new Error('poe_conversation_actor_mismatch'); return conversation; }
  async askPoe(id: string, text: string, actor: string, reference?: PoeObjectReference) { const conversation=this.mustPoe().conversation(id); if(conversation.actorId!==actor)throw new Error('poe_conversation_actor_mismatch'); return this.mustPoe().ask({conversationId:id,text,channel:conversation.channel,reference}); }
  proposePoeBenchmark(id: string, input: PoeBenchmarkProposalInput, actor: string) { const conversation=this.mustPoe().conversation(id); if(conversation.actorId!==actor)throw new Error('poe_conversation_actor_mismatch'); return this.mustPoe().proposeBenchmark(id,input); }
  revisePoeBenchmark(id: string, revision: number, changes: Partial<PoeBenchmarkProposalInput>, actor: string) { const current=this.mustPoe().proposal(id);if(this.mustPoe().conversation(current.conversationId).actorId!==actor)throw new Error('poe_conversation_actor_mismatch');return this.mustPoe().reviseBenchmark(id,revision,changes); }
  freezePoeBenchmark(id: string, revision: number, actor: string) { const current=this.mustPoe().proposal(id);if(this.mustPoe().conversation(current.conversationId).actorId!==actor)throw new Error('poe_conversation_actor_mismatch');return this.mustPoe().freezeBenchmark(id,revision); }
  approvePoeBenchmark(id: string, revision: number, frozenSha256: string, actor: string) { const current=this.mustPoe().proposal(id);if(this.mustPoe().conversation(current.conversationId).actorId!==actor)throw new Error('poe_conversation_actor_mismatch');return this.mustPoe().approveBenchmark(id,{revision,frozenSha256,actor}); }
  interruptPoe(id: string, actor: string, playbackTurnId?: string) { const conversation=this.mustPoe().conversation(id);if(conversation.actorId!==actor)throw new Error('poe_conversation_actor_mismatch');return this.mustPoe().bargeIn(id,actor,playbackTurnId); }
  async voicePoe(id: string, bytes: Uint8Array, mime: string, actor: string, speechEndedAt?: number) { const conversation=this.mustPoe().conversation(id); if(conversation.actorId!==actor)throw new Error('poe_conversation_actor_mismatch'); return this.mustPoe().voiceTurn({conversationId:id,bytes,mime,speechEndedAt}); }
  poeTranscript(id: string, actor: string) { const conversation=this.mustPoe().conversation(id); if(conversation.actorId!==actor)throw new Error('poe_conversation_actor_mismatch'); return this.mustPoe().transcript(id); }
  poeEvidence(reference?: PoeObjectReference): PoeEvidenceResult {
    const at=new Date().toISOString(), fact=(label:string,value:string|number|boolean|null,evidence:string[],limitation?:string)=>({label,value,authority:'AGENT_CONTROL' as const,observedAt:at,evidence,...(limitation?{limitation}:{})});
    if(!reference){const snapshot=this.snapshot();return{title:'Agent Control status',summary:snapshot.paused?'The control plane is paused. Nothing should be pretending otherwise.':'The control plane is active; downstream readiness remains independently assessed.',facts:[fact('Health',snapshot.health,['system.snapshot']),fact('Active work',snapshot.jobs.running,['job-ledger','work-parcel-ledger']),fact('Waiting work',snapshot.jobs.waiting,['job-ledger']),fact('Outstanding approvals',snapshot.outstandingApprovals,['approval-ledger']),fact('Managed systems',snapshot.resources.length,['resource-registry'])],related:[]};}
    try {
      if(reference.kind==='workspace'){
        const workspace=this.workspace(reference.id);
        return{
          reference,
          title:workspace.label,
          summary:`This ${workspace.mode.toLowerCase()} navigable workspace is derived from authoritative Agent Control records. Opening it grants no control authority.`,
          facts:[
            fact('Kind',workspace.kind,[`workspace:${workspace.id}`]),
            fact('Status',workspace.status,[`workspace:${workspace.id}`]),
            fact('Mode',workspace.mode,[`workspace:${workspace.id}`]),
            fact('Children',workspace.children.length,[`workspace:${workspace.id}`]),
            fact('Available read-only capabilities',workspace.capabilities.filter(item=>item.state==='AVAILABLE').map(item=>item.id).join(', ')||'none',[`workspace:${workspace.id}:capabilities`]),
            fact('Control authority granted',false,[`workspace:${workspace.id}:authority`]),
          ],
          related:[...(workspace.parent?[{kind:'workspace' as const,id:workspace.parent.id,label:workspace.parent.label}]:[]),...workspace.children.slice(0,8).map(item=>({kind:'workspace' as const,id:item.id,label:item.label}))],
        };
      }
      if(reference.kind==='node-dashboard'){const node=this.nodeDashboard(reference.id);return{reference,title:node.node.label,summary:'The same Node Dashboard projection supplies this explanation. Availability and qualification remain separate.',facts:[fact('Status',node.node.state,[`estate:${reference.id}`]),fact('Bound work',node.work.length,[`node-dashboard:${reference.id}`]),fact('Active work',node.work.filter(w=>!w.endedAt).length,[`node-dashboard:${reference.id}`]),fact('Resources',node.resources.length,[`estate:${reference.id}`]),fact('Nested execution environments',node.executionEnvironments?.length??0,[`node-dashboard:${reference.id}`])],related:node.work.slice(0,8).map(w=>({kind:'run-inspector' as const,id:w.inspectorId??w.id}))};}
      if(reference.kind==='run-inspector'){const run=this.runInspector(reference.id),t=(run.parentUsage??run.usage).totals;
        const admission=this.jobRuntime?.artifacts.list(reference.id).filter(a=>a.name==='runtime-admission').map(a=>{try{const value=this.jobRuntime!.artifacts.read(a.id) as any;return value?.producer?.provenance==='AGENT_CONTROL_RUNTIME_EVIDENCE'?{id:a.id,data:value.data}:null;}catch{return null;}}).filter(Boolean).at(-1);
        const d=admission?.data,o=d?.observation,policy=d?.policy;const admissionSummary=admission?` Recorded admission: ${d.decision??'UNKNOWN'}. Battery ${o?.batteryPercent??'unavailable'}% (minimum ${policy?.minimumBatteryPercent??'unavailable'}%), charging ${o?.charging??'unavailable'}; temperature ${o?.thermalCelsius??'unavailable'} C (refuse at ${policy?.maximumThermalCelsius??'unavailable'} C). Available RAM ${o?.availableRamBytes??'unavailable'} bytes (minimum ${policy?.minimumAvailableBytes??'unavailable'}). These are the recorded observations, not current measurements.`:'';
        const admissionFacts=admission?[fact('Recorded resource admission',JSON.stringify(admission.data),[admission.id],'Recorded runtime observations and policy; not a retrospective explanation.')]:[];
        return{reference,title:run.title,summary:`${run.status}; ${t.calls} recorded model calls. Token and cost coverage comes from the same Run Inspector.${admissionSummary}`,facts:[fact('Status',run.status,[`parcel:${run.id}`]),fact('Input tokens',t.input.value,[`usage:${run.id}`]),fact('Cached input tokens',t.cached.value,[`usage:${run.id}`]),fact('Output tokens',t.output.value,[`usage:${run.id}`]),fact('Total tokens',t.tokens.value,[`usage:${run.id}`]),fact('Cost',JSON.stringify(t.apiCost),[`usage:${run.id}`],'Missing billing coverage is not zero spend.'),fact('Context/baton records',run.context.records.length,[`runtime-map:${run.id}`]),...admissionFacts],related:run.physicalNodes.map(n=>({kind:'node-dashboard' as const,id:n.id}))};}
      if(reference.kind==='model'){const model=this.model(reference.id);return{reference,title:`Model ${model.id}`,summary:'Registry identity and qualification are authoritative; benchmark reputation remains separate.',facts:[fact('Provider',model.provider,[`model:${model.id}`]),fact('Provider model',model.providerModel,[`model:${model.id}`]),fact('Qualification',model.qualification.state,[`model:${model.id}:qualification`]),fact('Routing enabled',model.enabled!==false,[`model:${model.id}:routing`]),fact('Capabilities',model.capabilities.join(', ')||'none reported',[`model:${model.id}`])],related:[]};}
      if(reference.kind==='job'||reference.kind==='workflow'){const job=this.job(reference.id);return{reference,title:`Job ${job.metadata.name}`,summary:'This is the registered executable definition, not an inferred workflow.',facts:[fact('Identity',`${job.metadata.id}@${job.metadata.version}`,[`job:${job.metadata.id}`]),fact('Enabled',job.spec.enabled!==false,[`job:${job.metadata.id}`]),fact('Steps',job.spec.steps.length,[`job:${job.metadata.id}`]),fact('Latest run',job.latestRun?.status??'never run',[`job:${job.metadata.id}:runs`])],related:[]};}
      if(reference.kind==='run'){const run=this.run(reference.id),parcelId=run.trigger.parcelContext?.parcelId;return{reference,title:`Run ${run.id}`,summary:'The durable Run ledger is authoritative.',facts:[fact('Status',run.status,[`run:${run.id}`]),fact('Job',run.jobId,[`run:${run.id}`]),fact('Workers',run.selectedWorkers.join(', ')||'unassigned',[`run:${run.id}:placement`]),fact('Errors',run.errors.length,[`run:${run.id}:errors`])],related:parcelId?[{kind:'parcel',id:parcelId}]:[]};}
      if(reference.kind==='parcel'){const parcel=this.parcel(reference.id);return{reference,title:`Work Parcel ${parcel.id}`,summary:parcel.decision?.summary??'The parcel remains in progress; its ledger, not Morrow, determines completion.',facts:[fact('Status',parcel.status,[`parcel:${parcel.id}`]),fact('Objective',parcel.objective,[`parcel:${parcel.id}:objective`]),fact('Stages',parcel.stages.length,[`parcel:${parcel.id}:plan`]),fact('Invocations',parcel.audit.totals.invocations,[`parcel:${parcel.id}:audit`]),fact('Total tokens',parcel.audit.totals.totalTokens,[`parcel:${parcel.id}:accounting`],parcel.audit.totals.totalTokens===null?'Provider telemetry is incomplete.':undefined),fact('Cost',parcel.audit.totals.cost,[`parcel:${parcel.id}:accounting`],parcel.audit.totals.cost===null?'Cost is unavailable; no estimate is presented as exact.':undefined)],related:parcel.stages.filter(stage=>stage.runId).map(stage=>({kind:'run' as const,id:stage.runId!}))};}
      if(reference.kind==='runtime-map'){const map=this.runtimeMap(reference.id),running=map.nodes.filter(node=>node.state==='RUNNING'),waiting=map.nodes.filter(node=>['WAITING','QUEUED','BLOCKED'].includes(node.state)),failed=map.nodes.filter(node=>['FAILED','DEGRADED'].includes(node.state)),handoffs=map.nodes.filter(node=>node.type==='baton'),models=map.nodes.filter(node=>node.type==='model-call');const transition=map.events.at(-1);return{reference,title:`Runtime Map for ${map.parcelId}`,summary:running.length?`${running.length} operation${running.length===1?' is':'s are'} running. ${waiting.length} are waiting.`:failed.length?`Execution is not active; ${failed.length} operation${failed.length===1?' is':'s are'} failed or degraded.`:`Execution is not active. ${map.summary.succeeded} operations completed successfully.`,facts:[fact('Runtime state',map.freshness.state,[`runtime-map:${map.parcelId}`]),fact('Running operations',running.length,[`runtime-map:${map.parcelId}`]),fact('Waiting operations',waiting.length,[`runtime-map:${map.parcelId}`]),fact('Successful operations',map.summary.succeeded,[`runtime-map:${map.parcelId}`]),fact('Failed or degraded operations',failed.length,[`runtime-map:${map.parcelId}`]),fact('Model calls',models.length,[`runtime-map:${map.parcelId}`]),fact('Baton or handover records',handoffs.length,[`runtime-map:${map.parcelId}`]),fact('Latest transition',transition?.summary??'none recorded',[`runtime-map:${map.parcelId}`],transition?undefined:'No timestamped runtime transition is available.')],related:[{kind:'parcel',id:map.parcelId!},...running.slice(0,4).filter(node=>node.type==='job').map(node=>({kind:'run' as const,id:node.id.replace(/^run:/,'')}))]};}
      if(reference.kind==='lane'){const lane=this.lane(Number(reference.id));return{reference,title:`Lane ${lane.name}`,summary:'Lane state is projected from the authoritative workspace.',facts:[fact('Status',lane.status,[`lane:${lane.id}`]),fact('Task',lane.task,[`lane:${lane.id}:contract`]),fact('Model',lane.model,[`lane:${lane.id}:route`]),fact('Baton',`revision ${lane.baton.revision} · ${lane.baton.health}`,[`lane:${lane.id}:baton`])],related:[]};}
      if(reference.kind==='crew-member'){const member=this.snapshot().characterCrew.members.find(item=>item.id===reference.id);if(!member)throw new Error('poe_object_missing');return{reference,title:member.name,summary:member.summary,facts:[fact('Role',member.role,[`crew:${member.id}`]),fact('State',member.operationalState,[`crew:${member.id}:projection`]),fact('Freshness',member.freshness,[`crew:${member.id}:projection`]),fact('Activity authority',member.activity.source.authority,[`crew:${member.id}:projection`])],related:[]};}
      if(reference.kind==='governor-decision'){const decision=this.tokenRouting().decisions.find(item=>item.id===reference.id);if(!decision)throw new Error('poe_object_missing');return{reference,title:`Governor decision ${decision.id}`,summary:'This is the durable token-governor decision; Morrow does not replace or override it.',facts:[fact('State',decision.state,[`token-routing-decision:${decision.id}`]),fact('Action',decision.action,[`token-routing-decision:${decision.id}`]),fact('Reason',decision.reason,[`token-routing-decision:${decision.id}`]),fact('Context',decision.contextPercent===null?'unavailable':`${decision.contextPercent.toFixed(1)}%`,[`token-routing-decision:${decision.id}`],decision.contextPercent===null?'The provider did not expose current context occupancy.':undefined),fact('Outcome',decision.outcome,[`token-routing-decision:${decision.id}`]),fact('Target',decision.target?`${decision.target.providerId}/${decision.target.accountProfileId??'default'}/${decision.target.modelId}@${decision.target.nodeId??'unreported'}`:'none',[`token-routing-decision:${decision.id}`])],related:[{kind:'parcel',id:decision.parcelId},...(decision.batonId?[{kind:'baton' as const,id:decision.batonId}]:[])]};}
      if(reference.kind==='capability-manifest'){const projection=this.capabilityIntelligenceProjection(),observation=projection.capabilities.find(item=>item.id===reference.id||item.capabilityId===reference.id);if(!observation)throw new Error('poe_object_missing');return{reference,title:`Capability ${observation.capabilityId}`,summary:'Support, implementation and verification are separate claims in the capability ledger.',facts:[fact('Provider',observation.subject.providerId,[`capability:${observation.id}`]),fact('Model',observation.subject.modelId??'all/unspecified',[`capability:${observation.id}`]),fact('Support',observation.support,[`capability:${observation.id}`]),fact('Implementation',observation.implementation,[`capability:${observation.id}`]),fact('Verification',observation.verification,[`capability:${observation.id}`]),fact('Confidence',observation.confidence,[`capability:${observation.id}`]),fact('Limitations',observation.limitations.join('; ')||'none recorded',[`capability:${observation.id}`])],related:observation.subject.modelId?[{kind:'model',id:observation.subject.modelId}]:[]};}
      if(reference.kind==='baton'){const baton=this.tokenBatonRouting?.baton(reference.id);if(!baton)throw new Error('poe_object_missing');return{reference,title:`Baton ${baton.id}`,summary:'The sealed baton carries bounded continuation state; its hash and unresolved next action are authoritative.',facts:[fact('SHA-256',baton.sha256,[`token-baton:${baton.id}`]),fact('Source route',`${baton.providerId}/${baton.accountProfileId??'default'}/${baton.modelId}@${baton.nodeId??'unreported'}`,[`token-baton:${baton.id}`]),fact('Objective',baton.objective,[`token-baton:${baton.id}`]),fact('Completed items',baton.completedWork.length,[`token-baton:${baton.id}`]),fact('Unresolved issues',baton.unresolvedIssues.length,[`token-baton:${baton.id}`]),fact('Next action',baton.nextAction,[`token-baton:${baton.id}`]),fact('Parcel total tokens',baton.parcelTotals.totalTokens,[`token-baton:${baton.id}:accounting`],baton.parcelTotals.totalTokens===null?'Provider usage is incomplete.':undefined)],related:[{kind:'parcel',id:baton.parcelId}]};}
      if(reference.kind==='verification'){const lane=this.lane(Number(reference.id)),verification=lane.verification;return{reference,title:`Verification for lane ${lane.name}`,summary:'Claims and evidence remain distinct until the configured verification policy is satisfied.',facts:[fact('Phase',verification.phase,[`lane:${lane.id}:verification`]),fact('Claim',verification.claim??'none recorded',[`lane:${lane.id}:verification`]),fact('Required evidence',verification.policy.required.join(', ')||'none configured',[`lane:${lane.id}:verification-policy`]),fact('Evidence records',verification.evidence.length,[`lane:${lane.id}:verification`]),fact('Failures',verification.failureReasons.join('; ')||'none recorded',[`lane:${lane.id}:verification`])],related:[{kind:'lane',id:String(lane.id)}]};}
      if(reference.kind==='routing-decision'||reference.kind==='league-row'){const decision=reference.kind==='routing-decision'?this.adaptiveDecision(reference.id):null,row=reference.kind==='league-row'?this.adaptiveModelLeague().find(item=>`${item.route.providerId}/${item.route.accountProfileId??'default'}/${item.route.modelId}@${item.route.nodeId}`===reference.id||item.route.modelId===reference.id):null,value=decision??row;if(!value)throw new Error('poe_object_missing');return{reference,title:reference.kind==='routing-decision'?'Routing decision':'Model league row',summary:'The record is evidence-conditioned and is not regenerated from Morrow opinion.',facts:[fact('Identity',reference.id,[`${reference.kind}:${reference.id}`]),fact('Record',JSON.stringify(redactSensitiveValue(value)).slice(0,1200),[`${reference.kind}:${reference.id}`],'Focused safe projection; open the canonical Routing view for the complete record.')],related:[]};}
      if(reference.kind==='execution-session'){const session=this.executionSession(reference.id);return{reference,title:`Live Shell ${session.id}`,summary:'Morrow may explain or navigate to this session; attachment authority remains with Live Shell.',facts:[fact('State',session.state,[`execution-session:${session.id}`]),fact('Node',session.scope.nodeId,[`execution-session:${session.id}:scope`]),fact('Control owner',session.control.owner,[`execution-session:${session.id}:control`]),fact('Output bytes',session.outputBytes,[`execution-session:${session.id}:output`])],related:session.scope.parcelId?[{kind:'parcel',id:session.scope.parcelId}]:[]};}
      if(reference.kind==='benchmark'){const batch=this.modelIntelligenceProjection().queue.find(item=>item.id===reference.id);if(!batch)throw new Error('poe_object_missing');return{reference,title:`Benchmark ${batch.id}`,summary:'Frozen-suite state is reported without upgrading it to objective model truth.',facts:[fact('Status',batch.status,[`benchmark:${batch.id}`]),fact('Suite',`${batch.suiteId}@${batch.suiteVersion}`,[`benchmark:${batch.id}`]),fact('Candidates',batch.candidates.length,[`benchmark:${batch.id}`]),fact('Attempts',batch.attemptIds.length,[`benchmark:${batch.id}`])],related:[]};}
      if(reference.kind==='human-evaluation')return{reference,title:'Human evaluation',summary:'Human preference is recorded as HUMAN_EVALUATION, not objective truth.',facts:[],related:[],unavailable:'No focused human-evaluation record is available for this reference.'};
      return{reference,title:`${reference.kind} ${reference.id}`,summary:'No focused Morrow evidence adapter exists for this record type yet.',facts:[],related:[],unavailable:'The canonical record is unavailable through Morrow. Use its native Agent Control view; Morrow will not guess.'};
    } catch {return{reference,title:`${reference.kind} ${reference.id}`,summary:'The requested record could not be resolved.',facts:[],related:[],unavailable:'Agent Control has no authoritative record matching this reference.'};}
  }
  executionSession(id: string) { return this.mustExecutionSessions().get(id); }
  executionSessionEvents(id: string, after = 0) { return this.mustExecutionSessions().events(id, after); }
  executionSessionTranscript(id: string) { return {sessionId: id, content: this.mustExecutionSessions().transcript(id)}; }
  attachExecutionSession(id: string, mode: ExecutionSessionMode, actor: string) { return this.mustExecutionSessions().attach(id, mode, sessionAuthority(actor)); }
  detachExecutionSession(id: string, attachmentId: string, actor: string) { return this.mustExecutionSessions().detach(id, attachmentId, sessionAuthority(actor)); }
  inputExecutionSession(id: string, attachmentId: string, value: string, sensitive: boolean, actor: string) { return this.mustExecutionSessions().input(id, attachmentId, value, sessionAuthority(actor), sensitive); }
  resizeExecutionSession(id: string, attachmentId: string, columns: number, rows: number, actor: string) { return this.mustExecutionSessions().resize(id, attachmentId, columns, rows, sessionAuthority(actor)); }
  signalExecutionSession(id: string, attachmentId: string, signal: ExecutionSessionSignal, actor: string) { return this.mustExecutionSessions().signal(id, attachmentId, signal, sessionAuthority(actor)); }
  returnExecutionSessionControl(id: string, attachmentId: string, reconciliation: {summary: string; batonId?: string}, actor: string) { return this.mustExecutionSessions().returnControl(id, attachmentId, sessionAuthority(actor), reconciliation); }
  nodes() { return this.managedNodes?.list() ?? []; }
  resourceLocks() { return this.mustJobRuntime().locks.list(); }
  artifacts(runId?: string) { return this.mustJobRuntime().artifacts.list(runId).map(value => { const {storageRef: _storageRef, ...metadata} = value; return {...metadata, storage: 'agent-control-managed'}; }); }
  artifact(id: string) { const value = this.mustJobRuntime().artifacts.get(id); if (!value) throw new Error('artifact_missing'); const {storageRef: _storageRef, ...metadata} = value; return {...metadata, storage: 'agent-control-managed'}; }
  artifactContent(id: string) { const runtime = this.mustJobRuntime(), value = runtime.artifacts.get(id); if (!value) throw new Error('artifact_missing'); const {storageRef: _storageRef, ...metadata} = value; return {artifact: {...metadata, storage: 'agent-control-managed'}, content: runtime.artifacts.read(id)}; }
  commandOutputs() { return this.tokenAwareOutput?.list() ?? []; }
  commandOutputMetrics(): TokenAwareOutputMetrics { return this.tokenAwareOutput?.metrics() ?? {commandsObserved: 0, commandsCompacted: 0, rgSearchesCompacted: 0, originalOutputBytes: 0, returnedOutputBytes: 0, estimatedTokensOriginal: 0, estimatedTokensReturned: 0, estimatedTokensSaved: 0, contextTokensAvoided: 0, expansionRequests: 0, fullResultRequests: 0, expansionTokensReturned: 0, byJob: {}, byLane: {}, byAgentModel: {}}; }
  tokenRouting(): TokenRoutingProjection { return this.tokenBatonRouting?.projection() ?? {schema: 'agent-control.token-aware-baton-routing/v1', observedAt: new Date().toISOString(), policy: {continuePercent: 60, prepareBatonPercent: 75, compactPercent: 85, handoffPercent: 90, sampleRetention: 240}, threads: [], parcels: [], decisions: [], contextLifecycle: []}; }
  retrievalProjection(): RetrievalProjection { return this.governedRetrieval?.projection() ?? {schema:'agent-control.governed-retrieval/v1',observedAt:new Date().toISOString(),policy:{enabled:false,maximumCalls:4,maximumEvidenceItems:12,maximumEvidenceTokens:8192,minimumConfidence:.55,requiredCoverage:.6,contextPressurePercent:75,contextPressureEvidenceFraction:.5,allowedLocality:['LOCAL'],progression:['EXACT','LEXICAL','SEMANTIC','HYBRID']},attempts:[],packets:[],totals:{queries:0,escalations:0,evidenceCount:0,evidenceTokens:0,rawBytesAvoided:0,retrievalLatencyMs:0,contextTokensSaved:0}}; }
  usage(query:UsageQuery={}){return usageProjection(this.harnessEfficiency,this.energyProjection().executions,query);}
  usageAnswer(query:UsageQuery={}){return usageAnswer(this.usage(query));}
  usageObservations(query:UsageQuery={}){return usageObservations(this.usage(query));}
  resetUsage(confirmation:string,digest:string){if(!this.harnessEfficiency?.resetUsage)throw Error('usage_reset_unavailable');return this.harnessEfficiency.resetUsage(confirmation,digest,'authenticated-operator');}
  harnessEfficiencyMetrics(): HarnessEfficiencyMetrics { return this.harnessEfficiency?.metrics() ?? new MemoryHarnessEfficiencyLedger().metrics(); }
  modelInvocations(options: {limit?: number; runId?: string; jobId?: string} = {}) {
    const limit = Math.min(1_000, Math.max(1, Number.isSafeInteger(options.limit) ? options.limit! : 200));
    const records = (this.harnessEfficiency?.list() ?? []).filter(record => (!options.runId || record.runId === options.runId) && (!options.jobId || record.jobId === options.jobId));
    return records.slice(-limit);
  }
  sessions() { return this.mustIdentity().listSessions(); }
  session(id: string) { return this.mustIdentity().session(id); }
  contextTransfers(sessionId?: string) { return this.mustIdentity().listContextTransfers(sessionId); }
  delegations(sessionId?: string) { return this.mustIdentity().listDelegations(sessionId); }
  executionProvenance() { return this.mustIdentity().listExecutions(); }
  executionChain(runId: string) { return {chain: this.mustIdentity().reconstruct(runId), aggregate: this.mustIdentity().aggregate(runId)}; }
  fastExecutionAttempts() { return this.fastExecution?.list() ?? []; }
  runtime() { return this.runtimeObservability?.snapshot() ?? new RuntimeObservability().snapshot(); }
  capabilityIntelligenceProjection() { return this.mustCapabilityIntelligence().projection(); }
  modelIntelligenceProjection() { return this.mustModelIntelligence().projection(); }
  providerCatalogProjection() { return this.mustProviderCatalog().projection(); }
  async discoverProviderModels(providerId: string, actor: string) {
    const pending = this.mustProviderCatalog().discover(providerId), action = 'discovering'; this.events.emit('provider.catalog_changed', {providerId, action, stage: 'DISCOVER', narrative: providerCatalogEventNarrative({providerId, action})}, undefined, actor);
    try { const value = await pending, completedAction = 'discovered'; this.events.emit('provider.catalog_changed', {providerId, action: completedAction, stage: 'DISCOVERED', models: value.discovered, narrative: providerCatalogEventNarrative({providerId, action: completedAction, models: value.discovered})}, undefined, actor); return value; }
    catch (error) { this.events.emit('provider.catalog_changed', {providerId, action: 'discovery-failed'}, undefined, actor); throw error; }
  }
  async smokeProviderModel(providerId: string, canonicalModelId: string, actor: string) {
    const pending = this.mustProviderCatalog().smoke(providerId, canonicalModelId), action = 'smoke-testing'; this.events.emit('provider.catalog_changed', {providerId, canonicalModelId, action, stage: 'CAPABILITY_TESTING', narrative: providerCatalogEventNarrative({providerId, canonicalModelId, action})}, undefined, actor);
    try { const value = await pending, completedAction = 'smoke-tested'; this.events.emit('provider.catalog_changed', {providerId, canonicalModelId, action: completedAction, stage: value.status === 'PASS' ? 'CAPABILITY_CONFIRMED' : value.status, status: value.status, narrative: providerCatalogEventNarrative({providerId, canonicalModelId, action: completedAction, status: value.status})}, undefined, actor); return value; }
    catch (error) { this.events.emit('provider.catalog_changed', {providerId, canonicalModelId, action: 'smoke-failed'}, undefined, actor); throw error; }
  }
  async probeProviderModelCallability(providerId: string, canonicalModelId: string, actor: string) {
    const pending = this.mustProviderCatalog().probeCallability(providerId, canonicalModelId), action = 'callability-testing'; this.events.emit('provider.catalog_changed', {providerId, canonicalModelId, action, stage: 'TESTING_CALLABILITY', narrative: providerCatalogEventNarrative({providerId, canonicalModelId, action})}, undefined, actor);
    try { const value = await pending, completedAction = 'callability-tested'; this.events.emit('provider.catalog_changed', {providerId, canonicalModelId, action: completedAction, stage: value.status === 'PASS' ? 'CONFIRMED' : value.inferenceEndpointStatus === 'NOT_AVAILABLE' ? 'FAILED' : 'LIMITED', status: value.status, inferenceEndpointStatus: value.inferenceEndpointStatus, failureClass: value.failureClass, narrative: providerCatalogEventNarrative({providerId, canonicalModelId, action: completedAction, status: value.status, failureClass: value.failureClass})}, undefined, actor); return value; }
    catch (error) { this.events.emit('provider.catalog_changed', {providerId, canonicalModelId, action: 'callability-failed'}, undefined, actor); throw error; }
  }
  adjudicateProviderEvidence(providerId: string, canonicalModelId: string, input: CatalogEvidenceAdjudicationInput, actor: string) { const value = this.mustProviderCatalog().recordEvidenceAdjudication(providerId, canonicalModelId, input), action = 'evidence-adjudicated'; this.events.emit('provider.catalog_changed', {providerId, canonicalModelId, action, attribution: value.attribution, scoreDisposition: value.scoreDisposition, evidenceReference: value.evidenceReference, narrative: providerCatalogEventNarrative({providerId, canonicalModelId, action, status: value.attribution})}, undefined, actor); return value; }
  setProviderModelRoutingEligibility(providerId: string, canonicalModelId: string, enabled: boolean, actor: string) { const value = this.mustProviderCatalog().setRoutingEligibility(providerId, canonicalModelId, enabled); this.events.emit('provider.catalog_changed', {providerId, canonicalModelId, action: enabled ? 'routing-enabled' : 'routing-disabled'}, undefined, actor); return value; }
  runtimeSafetyDecisions(runId?: string) { return this.mustJobRuntime().safetyDecisions(runId); }
  discoverCapability(input: {id?: string; title: string; source: string; providerRuntime: string; claimedCapability: string; whyItMatters: string; agentControlEquivalent: string; evidence?: string[]}, actor: string) { const candidate = this.mustCapabilityIntelligence().discoverCandidate({...input, evidence: input.evidence ?? [], actor}); this.events.emit('capability.intelligence_changed', {candidateId: candidate.id, state: candidate.state}, undefined, actor); return candidate; }
  transitionCapability(id: string, input: {to: CapabilityCandidateState; reason: string; classification?: CapabilityCandidateClassification; experiment?: string; measuredOutcome?: string; finalDecision?: string; evidence?: string[]}, actor: string) { const candidate = this.mustCapabilityIntelligence().transitionCandidate(id, {...input, actor}); this.events.emit('capability.intelligence_changed', {candidateId: candidate.id, state: candidate.state}, undefined, actor); return candidate; }
  queueModelEvaluation(modelIds: string[], reason: string, actor: string) {
    if (!modelIds.length) throw new Error('model_evaluation_candidates_required'); const suite = this.mustQualificationSuite(), registry = this.mustModelRegistry();
    const candidates = modelIds.map(id => { const model = registry.list().find(item => item.id === id); if (!model) throw new Error('model_missing'); const provider = registry.provider(model.provider); if (!provider) throw new Error('provider_missing'); const nodeId = model.account?.providerExecutionNodeId ?? model.qualification.nodes[0] ?? model.nodes?.[0] ?? 'controller'; return {providerId: model.provider, ...(model.accountProfile ? {accountProfileId: model.accountProfile} : {}), modelId: model.id, providerModel: model.providerModel, runtimeId: provider.kind, runtimeVersion: null, modelVersion: null, nodeId}; });
    const batch = this.mustModelIntelligence().createBatch({suite, candidates, requestedBy: actor, reason}); this.providerCatalog?.markBenchmarkQueued(modelIds, batch.id); this.events.emit('model.intelligence_changed', {batchId: batch.id, status: batch.status}, undefined, actor); for (const modelId of modelIds) { const item = this.providerCatalog?.modelByRegistryId(modelId); if (item) this.events.emit('provider.catalog_changed', {providerId: item.providerId, canonicalModelId: item.canonicalModelId, action: 'benchmark-queued', stage: 'BENCHMARKING', batchId: batch.id, narrative: providerCatalogEventNarrative({providerId:item.providerId,canonicalModelId:item.canonicalModelId,action:'benchmark-queued'})}, undefined, actor); } return batch;
  }
  reconcileProviderBenchmark(batchId: string, status: string, actor: string) { const models = this.mustProviderCatalog().projection().models.filter(model=>model.benchmarkBatchIds.includes(batchId)); for (const model of models) { const action='benchmark-completed'; this.events.emit('provider.catalog_changed',{providerId:model.providerId,canonicalModelId:model.canonicalModelId,action,stage:model.qualificationStage,status,batchId,routingEligible:model.routingEligible,narrative:providerCatalogEventNarrative({providerId:model.providerId,canonicalModelId:model.canonicalModelId,action,status:model.qualificationStage})},undefined,actor); } return models.map(model=>({providerId:model.providerId,canonicalModelId:model.canonicalModelId,qualificationStage:model.qualificationStage,reviewState:model.reviewState,routingEligible:model.routingEligible})); }
  transitionModelRoute(routeKey: string, to: Parameters<ModelIntelligenceLedger['transition']>[0]['to'], reason: string, actor: string, approved = false, evidence: string[] = []) { const value = this.mustModelIntelligence().transition({routeKey, to, reason, actor, approved, evidence}); this.events.emit('model.intelligence_changed', {routeKey, state: value.to}, undefined, actor); return value; }
  modelProviders() { return this.mustModelRegistry().providersList(); }
  modelAccountProfiles() { return this.mustModelRegistry().accountProfilesList(); }
  models() { return this.mustModelRegistry().list().map(model => { const recent = (this.harnessEfficiency?.list() ?? []).filter(item => item.model === model.id && item.provider === model.provider).at(-1); return {...model, ...(recent ? {recentInvocation: {at: recent.completedAt ?? recent.startedAt, outcome: recent.finalJobResult, verifierResult: recent.verifierResult, latencyMs: recent.elapsedMs, inputTokens: recent.usage.inputTokens, outputTokens: recent.usage.outputTokens, cachedInputTokens: recent.usage.cachedInputTokens, cacheWriteTokens: recent.usage.cacheWriteTokens, totalTokens: recent.usage.totalProcessedTokens, providerReportedCost: recent.providerReportedCost, calculatedCost: recent.calculatedCost, currency: recent.currency}} : {})}; }); }
  jobDefinitions() { return this.mustParameterizedJobs().definitions.list(); }
  jobDefinition(id: string, version?: number) { return this.mustParameterizedJobs().definitions.get(id, version); }
  savedJobs() { return this.mustParameterizedJobs().savedJobs.list().map(job => ({...job, definitionResolved: this.mustParameterizedJobs().definitions.resolve(job), nextRun: nextSavedJobOccurrence(job, new Date())?.toISOString() ?? null, lastRun: this.mustParameterizedJobs().runs.list(job.id)[0] ?? null})); }
  savedJob(id: string) { return this.savedJobs().find(job => job.id === id) ?? (() => { throw new Error('saved_job_missing'); })(); }
  exportSavedJob(id: string) { return this.mustParameterizedJobs().savedJobs.export(id); }
  createSavedJob(input: Omit<SavedJob, 'schema' | 'revision' | 'createdAt' | 'updatedAt'>, actor: string) { const job = this.mustParameterizedJobs().savedJobs.create(input); this.events.emit('job.saved_changed', {savedJobId: job.id, action: 'created'}, undefined, actor); return job; }
  updateSavedJob(id: string, revision: number, changes: Partial<Omit<SavedJob, 'schema' | 'id' | 'revision' | 'createdAt'>>, actor: string) { const job = this.mustParameterizedJobs().savedJobs.update(id, revision, changes); this.events.emit('job.saved_changed', {savedJobId: id, action: 'updated', revision: job.revision}, undefined, actor); return job; }
  setSavedJobEnabled(id: string, enabled: boolean, revision: number, actor: string) { const job = this.mustParameterizedJobs().savedJobs.setEnabled(id, enabled, revision); this.events.emit('job.saved_changed', {savedJobId: id, action: enabled ? 'enabled' : 'disabled'}, undefined, actor); return job; }
  runSavedJob(id: string, actor: string, requestKey?: string, origin?: import('./request-origin.js').GovernedRequestOrigin) { const run = this.mustParameterizedJobs().runNow(id, actor, requestKey, origin); this.events.emit('job.run_created', {runId: run.id, savedJobId: id, trigger: 'manual'}, undefined, actor); return run; }
  parameterizedRuns(savedJobId?: string) {
    const jobs = this.mustParameterizedJobs(), savedJobs = jobs.savedJobs.list();
    const parcels = this.workParcels?.list() ?? [], tokenEvidence = this.tokenBatonRouting?.evidence();
    return jobs.runs.list(savedJobId).map(run => ({
      ...run,
      executionTranscript: jobs.transcripts?.metadata(run.id),
      executionHistory: projectParameterizedRunHistory({
        run,
        savedJob: savedJobs.find(job => job.id === run.savedJobId),
        parcels,
        tokenEvidence,
      }),
    }));
  }
  parameterizedRun(id: string) { const run = this.parameterizedRuns().find(item => item.id === id); if (!run) throw new Error('job_run_missing'); return run; }
  parameterizedRunTranscript(id: string) { const transcripts = this.mustParameterizedJobs().transcripts; if (!transcripts) throw new Error('execution_transcript_runtime_unavailable'); return transcripts.read(id); }
  cancelParameterizedRun(id: string, actor: string) { const run = this.mustParameterizedJobs().cancel(id, actor); this.events.emit('job.run_cancelled', {runId: id, savedJobId: run.savedJobId}, undefined, actor); return run; }
  resumeParameterizedRunAuthentication(id: string, actor: string) { const run = this.mustParameterizedJobs().resumeAuthentication(id, actor); this.events.emit('job.run_authentication_resumed', {runId: id, savedJobId: run.savedJobId, providerId: run.modelRoute?.providerId, accountProfileId: run.modelRoute?.accountProfileId, modelId: run.modelRoute?.modelId, nodeId: run.modelRoute?.providerExecutionNodeId}, undefined, actor); return run; }
  parameterizedSchedules() { return this.savedJobs().filter(job => job.schedule).map(job => ({savedJobId: job.id, name: job.name, schedule: job.schedule, nextRun: job.nextRun, lastRun: job.lastRun})); }
  model(id: string) { const value = this.models().find(model => model.id === id); if (!value) throw new Error('model_missing'); return value; }
  modelRoutes() { return this.mustModelRegistry().routes(); }
  reloadModels(providers: ProviderConfig[], models: ModelConfig[], routing: ModelRoutingConfig, actor: string) { this.mustModelRegistry().reload(providers, models, routing); this.providerCatalog?.reloadProviders(providers); this.events.emit('configuration.changed', {kind: 'model-registry', models: models.length, restartRequired: false}, undefined, actor); return {models: this.models(), routes: this.modelRoutes()}; }
  routeModel(request: ModelRouteRequest) { return this.mustModelRegistry().route(request); }
  qualifyModel(id: string, nodeId: string) { return qualifyModel({registry: this.mustModelRegistry(), modelId: id, nodeId}); }
  qualifyModelAccount(providerId: string, accountProfileId: string) {
    return qualifyAccountProfile({registry: this.mustModelRegistry(), providerId, accountProfileId, nodeExecution: this.codexNodeExecution}).then(result => {
      this.events.emit('configuration.changed', {kind: 'model-account-qualification', providerId, accountProfileId, state: result.record.state, restartRequired: false}, undefined, 'account-qualification');
      return result;
    });
  }
  systems(): SystemReadiness[] { return [...deriveSystemReadiness({providers: this.providers, resources: this.resourceRows, services: this.serviceRows, managedNodes: this.managedNodes, workers: this.jobRuntime?.workers.list() ?? [], runs: this.jobRuntime?.ledger.list() ?? [], invocations: this.harnessEfficiency?.list() ?? []}), ...(this.runtimeObservability?.systems() ?? [])].sort((a,b)=>a.name.localeCompare(b.name)); }
  system(id: string) { const value = this.systems().find(item => item.id === id); if (!value) throw new Error('system_missing'); return value; }
  async checkSystem(id: string, actor: string) {
    if (this.managedNodes?.resource(id)) { const snapshot = await this.managedNodes.poll(id); this.events.emit('resource.node_changed', {resourceId: id, state: snapshot.state, health: snapshot.health, currentWorkload: snapshot.currentWorkload}, undefined, actor); return this.system(id); }
    const provider = this.providers?.get(id); if (provider) { const result = await probeProvider(provider); this.providers!.setHealth(id, result.health, result.detail, result.latencyMs); this.events.emit('provider.health_changed', {providerId: id, health: result.health, detail: result.detail, latencyMs: result.latencyMs}, undefined, actor); return this.system(id); }
    if (this.serviceRows.some(item => item.id === id)) throw new Error('system_check_unavailable');
    if (this.resourceRows.some(item => item.id === id)) throw new Error('system_check_unavailable');
    throw new Error('system_missing');
  }
  parcels() { return this.mustWorkParcels().list(); }
  createSocialParcel(jobId:string,parameters:Record<string,unknown>,actor:string,requestKey:string,prompt?:string,origin?:import('./request-origin.js').GovernedRequestOrigin) {
    const job=this.job(jobId),parcel=this.mustWorkParcels().submitApprovedPlan(prompt??`Approved social task: ${job.metadata.id}`,actor,requestKey,{objective:job.metadata.name,planner:{kind:'deterministic',reason:'Explicit enrolled sender selected a hash-pinned approved template'},stages:[{id:'execute',name:job.metadata.name,job:`${job.metadata.id}@${job.metadata.version}`,parameters,dependsOn:[]}]},origin);
    this.events.emit('work.parcel_created',{parcelId:parcel.id,status:parcel.status},undefined,actor);return parcel;
  }
  parcel(id: string) { return this.mustWorkParcels().get(id); }
  adaptiveModelLeague(taskClass?: string, filter?: AdaptiveLeagueFilter) { return this.adaptiveOrchestration?.modelLeague(taskClass, undefined, filter) ?? []; }
  adaptiveWorkflowLeague(taskClass?: string, filter?: AdaptiveLeagueFilter) { return this.adaptiveOrchestration?.workflowLeague(taskClass, undefined, filter) ?? []; }
  adaptiveDecisions() { return this.adaptiveOrchestration?.decisions() ?? []; }
  cacheExpertRegistry() { const decisions = this.cacheExperts?.decisions() ?? []; return {schema: 'agent-control.cache-expert-registry-projection/v1', policy: this.cacheExperts?.policy ?? null, experts: this.cacheExperts?.records() ?? [], decisions: decisions.map(item => ({...item, humanReadable: this.cacheExperts!.humanReadable(item.id)})), observedAt: new Date().toISOString()}; }
  learnedSpecialists() { return this.learnedSkills?.projection() ?? {schema:'agent-control.learned-specialists/v1',observedAt:new Date().toISOString(),policy:null,candidates:[],specialists:[],routing:[]}; }
  deterministicSkillProjection(){return this.deterministicSkills?.projection()??{schema:'agent-control.deterministic-skills/v1',observedAt:new Date().toISOString(),policy:null,skills:[],decisions:[],executions:[]};}
  energyProjection() { return this.energyTelemetry?.projection() ?? {schema:'agent-control.energy-telemetry/v1',observedAt:new Date().toISOString(),baselines:[],executions:[],decisions:[],totals:{measuredExecutions:0,verifiedSuccessful:0,wholeNodeMeasurements:0}}; }
  invalidateCacheExperts(input: {providerId?: string; modelId?: string; sessionId?: string; cacheScopeId?: string; backendInstanceId?: string; reason?: string}, actor: string) {
    if (!this.cacheExperts) throw new Error('cache_experts_unconfigured');
    const filters=Object.fromEntries(Object.entries(input).filter(([key,value])=>key!=='reason'&&typeof value==='string'&&value.trim()).map(([key,value])=>[key,String(value).trim()]));
    if (!Object.keys(filters).length) throw new Error('cache_expert_invalidation_scope_required');
    const reason=String(input.reason??'').trim();if(!reason||reason.length>200)throw new Error('cache_expert_invalidation_reason_invalid');
    const count=this.cacheExperts.invalidate({...filters,reason} as Parameters<CacheAwareExpertRuntime['invalidate']>[0]);
    this.events.emit('cache.expert_invalidated',{count,reason,...filters},undefined,actor);return {count,reason,...filters};
  }
  adaptiveDecision(id: string) { if (!this.adaptiveOrchestration) throw new Error('adaptive_orchestration_unconfigured'); return this.adaptiveOrchestration.decision(id); }
  adaptiveReport(id: string) { if (!this.adaptiveOrchestration) throw new Error('adaptive_orchestration_unconfigured'); return this.adaptiveOrchestration.report(id); }
  adaptiveParcelReport(id: string) { const parcel = this.parcel(id), decisionId = parcel.audit.orchestrationDecisionId; if (!decisionId) throw new Error('adaptive_decision_missing'); return this.adaptiveReport(decisionId); }
  async submitNaturalTask(prompt: string, actor: string) {
    let attribution: WorkAttribution;
    if (this.identity && this.defaultSessionId) {
      this.identity.authorize(this.defaultSessionId, actor, 'parcel.create');
      attribution = {schema: 'agent-control.work-attribution/v1', actorId: actor, sessionId: this.defaultSessionId, authority: this.identity.session(this.defaultSessionId).participants.find(value => value.actorId === actor)?.capabilities ?? [], createdAt: new Date().toISOString(), legacy: false};
    } else attribution = legacyAttribution(actor, `parcel-pending:${prompt}`);
    const receivedAt=new Date().toISOString(), digest=(value:string)=>createHash('sha256').update(value).digest('hex'), origin=governedRequestOrigin({channel:'dashboard',modality:'dashboard',receivedAt,authentication:'operator-authenticated',actorId:actor,authority:attribution.authority.length?attribution.authority:['parcel.create'],messageReference:digest(`${receivedAt}\0${actor}\0${prompt}`),identityReference:digest(`dashboard\0${actor}`),request:prompt});
    const parcel = this.mustWorkParcels().accept(prompt, actor, this.systems(), attribution, origin), finalAttribution=parcel.attribution!;
    this.events.emit('work.parcel_created', {parcelId: parcel.id, status: parcel.status, actorId: finalAttribution.actorId, sessionId: finalAttribution.sessionId}, undefined, actor); return parcel;
  }
  cancelParcel(id: string, actor: string) { const parcel = this.mustWorkParcels().cancel(id, actor); this.events.emit('work.parcel_changed', {parcelId: id, status: parcel.status}, undefined, actor); return parcel; }
  askParcelQuestion(id: string, input: {text: string; originatingStageId?: string; dependentStageIds: string[]; priority?: 'LOW'|'NORMAL'|'HIGH'|'URGENT'; consequence?: 'LOW'|'MEDIUM'|'HIGH'}, actor: string) { const parcel = this.mustWorkParcels().askQuestion(id, {...input, actor}); this.events.emit('work.parcel_changed', {parcelId: id, status: parcel.status, change: 'question-created'}, undefined, actor); return parcel; }
  answerParcelQuestion(id: string, questionId: string, answer: string, actor: string) { const parcel = this.mustWorkParcels().answerQuestion(id, questionId, answer, actor); this.events.emit('work.parcel_changed', {parcelId: id, status: parcel.status, change: 'question-answered'}, undefined, actor); return parcel; }
  steerParcel(id: string, input: {instruction: string; constraints?: string[]; affectedStageIds?: string[]; supersedes?: string[]}, actor: string) { const parcel = this.mustWorkParcels().steer(id, {...input, actor}); this.events.emit('work.parcel_changed', {parcelId: id, status: parcel.status, change: 'steering-amendment'}, undefined, actor); return parcel; }
  addParcelCriterion(id: string, input: {kind: Parameters<WorkParcelCoordinator['addCriterion']>[1]['kind']; description: string; stageId?: string; requiredEvidence?: string[]}, actor: string) { const value = this.mustWorkParcels().addCriterion(id, {...input, source: 'USER', sourceActor: actor}); this.events.emit('work.parcel_changed', {parcelId: id, status: value.parcel.status, change: 'criterion-added', criterionId: value.criterion.id}, undefined, actor); return value; }
  evaluateParcelCriterion(id: string, criterionId: string, input: {status: 'PASS' | 'FAIL'; evidence: string[]; detail?: string}, actor: string) { const parcel = this.mustWorkParcels().evaluateCriterion(id, criterionId, {...input, actor}); this.events.emit('work.parcel_changed', {parcelId: id, status: parcel.status, change: 'criterion-evaluated', criterionId}, undefined, actor); return parcel; }
  retrieveParcelContext(id: string, input: {query: string; limit?: number; types?: Parameters<WorkParcelCoordinator['retrieveContext']>[1]['types']; stageIds?: string[]}, actor: string) { const values = this.mustWorkParcels().retrieveContext(id, {...input, actor}); this.events.emit('work.parcel_changed', {parcelId: id, change: 'context-retrieved', resultCount: values.length}, undefined, actor); return values; }
  expandCommandOutput(handle: string, request: OutputExpansionRequest, scope: OutputAuthorityScope) { return this.mustTokenAwareOutput().expand(handle, request, scope); }

  lane(id: number) { return this.projectLane(this.mustLane(id)); }
  latestRoute(id: number) { return this.routeDecisions.get(id) ?? this.mustLane(id).routing; }
  allRoutes() { return this.state.lanes.flatMap(lane => { const decision = this.latestRoute(lane.id); return decision ? [{laneId: lane.id, decision}] : []; }); }
  recordRoute(id: number, decision: RouteDecision) { const lane = this.mustLane(id); this.routeDecisions.set(id, decision); lane.routing = structuredClone(decision); this.persist(this.state); this.events.emit('lane.reroute_requested', {selected: decision.selected.id, rationale: decision.rationale}, id, 'router'); return decision; }

  setVerificationPolicy(id: number, policy: VerificationPolicy, actor: string) { const value = this.verification.setPolicy(id, policy); this.events.emit('verification.changed', {phase: value.phase, required: value.policy.required}, id, actor); return value; }
  recordClaim(id: number, claim: string, actor: string) { const value = this.verification.claim(id, claim); this.events.emit('verification.changed', {phase: value.phase, claimRecorded: true}, id, actor); return value; }
  addVerificationEvidence(id: number, input: Omit<VerificationEvidence, 'id' | 'createdAt'> & {id?: string; createdAt?: string}, actor: string) { const value = this.verification.addEvidence(id, input); this.events.emit('verification.changed', {phase: this.mustLane(id).verification?.phase, evidenceId: value.id, evidenceType: value.type, status: value.status}, id, actor); return value; }
  verifyClaim(id: number, actor: string) { const value = this.verification.verify(id); this.events.emit('verification.changed', {phase: value.verification.phase, ok: value.ok, reasons: value.reasons}, id, actor); return value; }
  acceptVerifiedClaim(id: number, actor: string) { const value = this.verification.accept(id, actor); this.events.emit('verification.changed', {phase: value.phase, acceptedBy: actor}, id, actor); return value; }

  pauseLane(id: number, actor: string) {
    const lane = this.mustLane(id);
    lane.status = 'paused';
    touchBaton(lane, {status: `Paused by ${actor}`, nextAction: 'Await explicit resume'});
    this.persist(this.state);
    this.events.emit('lane.status_changed', {status: lane.status}, id, actor);
    return this.lane(id);
  }

  resumeLane(id: number, actor: string) {
    const lane = this.mustLane(id);
    if (this.state.paused) throw new Error('system_paused');
    const humanOwned = this.ptySessions(lane).some(session => session.owner.startsWith('human'));
    if (humanOwned) throw new Error('human_owns_pty');
    lane.status = lane.contract.goal === 'Await task' ? 'idle' : 'waiting';
    touchBaton(lane, {status: `Resume requested by ${actor}`, nextAction: 'Scheduler revalidates lease and execution'});
    this.persist(this.state);
    this.events.emit('lane.status_changed', {status: lane.status}, id, actor);
    return this.lane(id);
  }

  setPriority(id: number, priority: number, actor: string) {
    if (!Number.isInteger(priority) || priority < 0 || priority > 100) throw new Error('priority_out_of_range');
    const lane = this.mustLane(id), previous = lane.contract.priority;
    lane.contract.priority = priority;
    lane.contract.updatedAt = new Date().toISOString();
    this.persist(this.state);
    this.events.emit('lane.priority_changed', {previous, priority}, id, actor);
    return this.lane(id);
  }

  setMode(id: number, mode: Mode, actor: string) {
    if (!['auto', 'manual'].includes(mode)) throw new Error('invalid_lane_mode');
    const lane = this.mustLane(id), previous = lane.contract.mode;
    lane.contract.mode = mode;
    lane.contract.updatedAt = new Date().toISOString();
    this.persist(this.state);
    this.events.emit('lane.mode_changed', {previous, mode}, id, actor);
    return this.lane(id);
  }

  submitTask(id: number, goal: string, actor: string) {
    if (!goal.trim()) throw new Error('task_goal_required');
    const lane = this.mustLane(id);
    lane.contract.goal = goal.trim();
    lane.contract.updatedAt = new Date().toISOString();
    lane.status = 'waiting';
    lane.lines.push(`> ${goal.trim()}`);
    touchBaton(lane, {status: 'Task accepted; capability resolution pending', nextAction: 'Resolve capabilities and acquire resource leases'});
    this.persist(this.state);
    this.events.emit('lane.task_changed', {goal: lane.contract.goal}, id, actor);
    return this.lane(id);
  }

  requestReroute(id: number, actor: string, reason: string, confidence = .8): SelfRouteRequest {
    const lane = this.mustLane(id), request = requestSelfRoute(id, 'substitute', reason, confidence);
    touchBaton(lane, {status: 'SUBSTITUTE requested', nextAction: 'Router must qualify and select a replacement'});
    this.persist(this.state);
    this.events.emit('lane.reroute_requested', {reason: request.reason, confidence: request.confidence, requiresApproval: request.requiresApproval}, id, actor);
    return request;
  }

  handoff(fromId: number, toId: number, holder: string, actor: string) {
    this.plane.handoff(fromId, toId, holder);
    this.events.emit('lane.handoff', {fromId, toId, holder}, toId, actor);
    return this.lane(toId);
  }

  clone(fromId: number, toId: number, holder: string, actor: string) {
    this.plane.clone(fromId, toId, holder);
    this.events.emit('lane.clone', {fromId, toId, holder}, toId, actor);
    return this.lane(toId);
  }

  cancelLane(id: number, actor: string) {
    const lane = this.mustLane(id);
    lane.status = 'cancelled';
    touchBaton(lane, {status: `Cancellation requested by ${actor}`, nextAction: 'Execution provider confirms cancellation; retain evidence'});
    this.persist(this.state);
    this.events.emit('lane.status_changed', {status: lane.status, executionCancellation: 'requested'}, id, actor);
    return this.lane(id);
  }

  humanTakeover(id: number, actor: string) {
    const lane = this.mustLane(id), sessions = this.ptys.list().filter(session => session.laneId === String(id));
    for (const session of sessions) this.ptys.humanTakeover(session.id, `human:${actor}`);
    lane.status = 'paused';
    touchBaton(lane, {status: `Human takeover by ${actor}`, nextAction: 'Human explicitly returns ownership'});
    this.persist(this.state);
    this.events.emit('ownership.human_takeover', {sessionIds: sessions.map(session => session.id)}, id, actor);
    return this.lane(id);
  }

  returnOwnership(id: number, actor: string, agentId: string) {
    if (!agentId.trim()) throw new Error('agent_id_required');
    const lane = this.mustLane(id), sessions = this.ptys.list().filter(session => session.laneId === String(id));
    if (!sessions.length) throw new Error('human_takeover_not_active');
    const transfers = sessions.map(session => {
      const owner = this.ptys.attached(session.id).find(item => item.access === 'own');
      if (!owner?.actorId.startsWith('human:')) throw new Error('human_takeover_not_active');
      return {session, owner};
    });
    for (const {session, owner} of transfers) this.ptys.transferControl(session.id, owner.actorId, agentId);
    lane.status = 'waiting';
    touchBaton(lane, {status: `Ownership returned by ${actor}`, nextAction: 'Scheduler revalidates lease before execution'});
    this.persist(this.state);
    this.events.emit('ownership.returned', {sessionIds: sessions.map(session => session.id), agentId}, id, actor);
    return this.lane(id);
  }

  setSystemPaused(paused: boolean, actor: string) {
    if (paused && !this.state.paused) for (const lane of this.state.lanes) { lane.statusBeforeSystemPause = lane.status; lane.status = 'paused'; }
    if (!paused && this.state.paused) for (const lane of this.state.lanes) {
      const humanOwnsPty = this.ptys.list().filter(session => session.laneId === String(lane.id)).some(session => this.ptys.attached(session.id).some(attachment => attachment.access === 'own' && attachment.actorId.startsWith('human:')));
      if (!['cancelled', 'error'].includes(lane.status)) lane.status = humanOwnsPty ? 'paused' : lane.statusBeforeSystemPause ?? 'paused';
      lane.statusBeforeSystemPause = undefined;
    }
    this.state.paused = paused;
    checkpoint(this.state, paused ? 'pause-all' : 'resume-all');
    this.events.emit('system.paused_changed', {paused}, undefined, actor);
    return this.snapshot();
  }

  private projectLane(lane: LaneState): LaneProjection {
    const route = this.routeDecisions.get(lane.id) ?? lane.routing, health = batonHealth(lane.baton);
    const contextSources = (lane.baton.contextSourceIds ?? []).map(id => this.contextStore?.getSource(id)).filter((source): source is NonNullable<typeof source> => Boolean(source)).map(source => ({id: source.id, type: source.type, url: source.url, localRef: source.localRef, description: source.description, classification: source.classification, accessibility: source.accessibility}));
    const executionTarget = lane.contract.resourceLocks?.host ?? lane.contract.resourceLocks?.provider ?? lane.contract.resourceLocks?.model ?? undefined;
    const elapsedMs = lane.status === 'working' && lane.lease.acquiredAt ? Math.max(0, Date.now() - Date.parse(lane.lease.acquiredAt)) : 0;
    return {
      id: lane.id, name: lane.name, mode: lane.contract.mode, priority: lane.contract.priority, status: lane.status, task: lane.contract.goal,
      model: lane.model, reasoning: lane.reasoning, executionTarget, elapsedMs, routeReason: route?.rationale.map(item => item.detail).join('; '),
      lease: {...lane.lease}, ptys: this.ptySessions(lane), sharedTaskIds: [...lane.contract.sharedTaskIds],
      baton: {revision: lane.baton.revision, status: lane.baton.status, nextAction: lane.baton.nextAction, ancestry: lane.baton.progress.filter(item => /handoff|clone/i.test(item)), health: health.label, evidence: [...lane.baton.evidence], contextSourceIds: [...(lane.baton.contextSourceIds ?? [])]},
      git: lane.contract.git ? {...lane.contract.git, dirtyFiles: [...(lane.contract.git.dirtyFiles ?? [])]} : undefined,
      verification: structuredClone(lane.verification ?? {phase: 'unclaimed', policy: {required: []}, evidence: [], failureReasons: []}),
      contextSources,
      lastMeaningfulActivity: lane.baton.updatedAt,
      warnings: [lane.lease.holder && Date.parse(lane.lease.expiresAt ?? '') <= Date.now() ? 'lease_expired' : '', health.label === 'STALE' ? 'baton_stale' : ''].filter(Boolean),
      history: projectLaneHistory(lane, route),
    };
  }

  private ptySessions(lane: LaneState) {
    return this.ptys.list().filter(session => session.laneId === String(lane.id)).map(session => {
      const attachments = this.ptys.attached(session.id);
      return {id: session.id, command: session.command, cwd: session.cwd, recovery: session.recovery, owner: attachments.find(item => item.access === 'own')?.actorId ?? 'unowned', observers: attachments.filter(item => item.access === 'observe').length};
    });
  }
  private mustLane(id: number) { const lane = this.state.lanes.find(item => item.id === id); if (!lane) throw new Error('lane_missing'); return lane; }
  private mustJobRuntime() { if (!this.jobRuntime) throw new Error('job_runtime_unconfigured'); return this.jobRuntime; }
  private mustTokenAwareOutput() { if (!this.tokenAwareOutput) throw new Error('token_aware_output_unconfigured'); return this.tokenAwareOutput; }
  private mustWorkParcels() { if (!this.workParcels) throw new Error('work_parcels_unconfigured'); return this.workParcels; }
  private mustModelRegistry() { if (!this.modelRegistry) throw new Error('model_registry_unconfigured'); return this.modelRegistry; }
  private mustIdentity() { if (!this.identity) throw new Error('identity_control_plane_unconfigured'); return this.identity; }
  private mustParameterizedJobs() { if (!this.parameterizedJobs) throw new Error('parameterized_jobs_unconfigured'); return this.parameterizedJobs; }
  private mustCapabilityIntelligence() { if (!this.capabilityIntelligence) throw new Error('capability_intelligence_unconfigured'); return this.capabilityIntelligence; }
  private mustModelIntelligence() { if (!this.modelIntelligence) throw new Error('model_intelligence_unconfigured'); return this.modelIntelligence; }
  private mustProviderCatalog() { if (!this.providerCatalog) throw new Error('provider_catalog_unconfigured'); return this.providerCatalog; }
  private mustQualificationSuite() { if (!this.qualificationSuite) throw new Error('model_qualification_suite_unconfigured'); return this.qualificationSuite; }
  private mustExecutionSessions() { if (!this.executionSessions) throw new Error('execution_session_runtime_unconfigured'); return this.executionSessions; }
  private mustPoe() { if (!this.poe) throw new Error('poe_unconfigured'); return this.poe; }
  private mustEnvironmentDiscovery(){if(!this.environmentDiscovery)throw new Error('environment_discovery_unconfigured');return this.environmentDiscovery;}
  private mustCapabilityAdapters(){if(!this.capabilityAdapters)throw new Error('capability_adapters_unconfigured');return this.capabilityAdapters;}
  private mustInstallation(){if(!this.installation)throw new Error('installation_runtime_unconfigured');return this.installation;}
}

function sessionAuthority(actor: string) { return {actorId: actor.startsWith('human:') ? actor : `human:${actor}`, roles: ['operator' as const]}; }

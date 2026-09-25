import {LabourExchange} from './control/labour-exchange.js';
import {LabourLedger} from './control/labour-ledger.js';
import {EstateDiscovery,registerEstateDiscovery,type EstateTarget} from './control/estate-discovery.js';
import {ArchitectureDiagnostics,DiagnosticStore,registerArchitectureDiagnostics} from './control/architecture-diagnostics.js';
import {DiagnosticFileAdapter,LinuxDiagnosticAdapter,standardDiagnosticFiles} from './control/diagnostic-sources.js';
import {diagnosticModelPort} from './control/diagnostic-model.js';
import {RuntimeBenchmarkDiscoveryAdapter} from './control/runtime-benchmark-projection.js';
import {isAndroidUserspace,observeAndroid} from './control/android-environment.js';
import {DefaultDiscoveryProbe} from './control/environment-discovery.js';
import {usageQuestionQuery} from './control/usage-projection.js';
import {LocalWatchBenchmarkPort} from './control/local-watch-benchmark-port.js';
import {IntelligenceJournal,ModelLandscape} from './control/model-landscape.js';
import {ModelWatchRuntime,registerModelWatchJobs,modelWatchPlan} from './control/model-watch-runtime.js';
import {watchRequest} from './control/model-watch-policies.js';
import {JsonModelCatalogueAdapter,HuggingFaceMetadataAdapter,GitHubRuntimeReleasesAdapter} from './control/model-intelligence-adapters.js';
import {registerLlamaCppBenchmarkJobs} from './control/llama-cpp-benchmark-adapter.js';
import {LocalBenchmarkController} from './control/local-llm-benchmark-controller.js';
import {readPoeRegression} from './control/poe-regression.js';
import path from 'node:path';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import type {OpenWAAdapter} from './control/openwa.js';
import {AgentControlService} from './control/application-service.js';
import {configPath, loadConfig} from './control/config.js';
import {discoverLinuxPtys, toPtyDiscoveries} from './control/linux-pty.js';
import {ProviderRegistry, providersFromConfig} from './control/providers.js';
import {PtyRegistry} from './control/pty.js';
import {startWebDashboard} from './control/web-server.js';
import {ContextStore} from './control/context.js';
import {WorkQueueStore} from './control/work-queue-store.js';
import {workQueueMetrics} from './control/work-observability.js';
import {defaultCapabilities, loadWorkspace, type LaneState, type WorkspaceState} from './state.js';
import {buildGovernedRetrievalRuntime, buildJobRuntime, buildParameterizedJobRuntime, startJobScheduler, startManagedNodeMonitoring, startParameterizedJobScheduler} from './control/job-bootstrap.js';
import {ResourceCodexNodeExecutionPort} from './control/codex-node-execution.js';
import {FileCommandResultStore, TokenAwareOutputService} from './control/token-aware-output.js';
import {Trace} from './control/telemetry.js';
import {AccountProfileQualificationStore, ModelQualificationStore, ModelRegistry} from './control/model-registry.js';
import {IdentityControlPlane} from './control/identity-control-plane.js';
import {FileFastExecutionLedger} from './control/fast-execution.js';
import {ContractExecutionRuntime} from './control/contract-runtime.js';
import {GovernedHandoffRuntime} from './control/handoff-runtime.js';
import {ProviderModelLifecycleRegistry} from './control/provider-lifecycle.js';
import {RuntimeObservability} from './control/runtime-observability.js';
import {TokenAwareBatonRuntime} from './control/token-aware-baton-routing.js';
import {CapabilityIntelligenceStore, registerAgentControlCoreCapabilities} from './control/capability-intelligence.js';
import {loadFrozenQualificationSuite, ModelEvaluationCoordinator, ModelIntelligenceLedger} from './control/model-intelligence.js';
import {ProviderNeutralModelEvaluationExecutor, startModelEvaluationScheduler} from './control/model-evaluation-runtime.js';
import {ProviderCatalogRuntime, ProviderCatalogStore} from './control/provider-catalog.js';
import {AGENT_CONTROL_VERSION} from './version.js';
import {ExecutionSessionRuntime} from './control/execution-session.js';
import {PoeKnowledgeService} from './control/poe-knowledge.js';
import {PoeRegistrySource} from './control/poe-registry-source.js';
import {PoeOperatorRuntime} from './control/poe-operator.js';
import {PoeRuntime} from './control/poe.js';
import {RoutedPoeResponseModel} from './control/poe-model.js';
import {governedRequestOrigin} from './control/request-origin.js';
import {UxSessionAnnotationStore,UxSessionCaptureRuntime,UxSessionShareStore,UxSessionStore} from './control/ux-session.js';
import {CodexSessionAdapter,ImmutableSessionVault,SessionVaultRuntime} from './control/session-vault.js';
import {EnvironmentDiscoveryRuntime} from './control/environment-discovery.js';
import {ConfigurationStore} from './control/configuration-store.js';
import {CapabilityAdapterRegistry,RegisteredCapabilityDiscoveryAdapter} from './control/capability-adapter-registry.js';
import {InstallationLifecycle} from './control/installation-lifecycle.js';
import {DirectInferenceRuntime,FileDirectInferenceEvidenceStore} from './control/direct-inference.js';
import {CostRoutingLedger} from './control/cost-performance-routing.js';
import {schedulerContainmentScopes,WorkBoardRuntime} from './control/work-board.js';
import {ContainmentSupervisor} from './control/containment.js';
import {WorkspacePreferenceStore} from './control/workspace-preferences.js';
import {ModelImprovementRuntime} from './control/model-improvement.js';

const now = () => new Date().toISOString();
const configurationFile = configPath(), config = loadConfig(configurationFile);
function initialLane(id: number, name: string, cwd: string, priority: number, mode: 'auto' | 'manual'): LaneState {
  return {id, name, status: 'idle', model: 'unassigned', reasoning: 'medium', context: '0', lines: ['Ready.', 'Awaiting task...'], contract: {version: 2, laneId: id, goal: 'Await task', constraints: [], cwd, priority, mode, capabilities: defaultCapabilities(), resourceLocks: {}, modelLock: null, sharedTaskIds: [], updatedAt: now()}, baton: {version: 1, laneId: id, revision: 1, status: 'Await task', progress: [], hypothesis: '', evidence: [], changes: [], nextAction: 'Await command', openQuestions: [], model: 'unassigned', reasoning: 'medium', updatedAt: now()}, lease: {laneId: id, holder: null, acquiredAt: null, expiresAt: null}};
}
const configuredLanes = config.lanes.length ? config.lanes : [{id: 1, name: 'Primary', cwd: '.', priority: 1, mode: 'auto' as const}];
const initial: WorkspaceState = {version: 1, paused: false, lastRestorePoint: null, lanes: configuredLanes.map(item => initialLane(item.id, item.name, path.resolve(item.cwd ?? '.'), item.priority ?? 1, item.mode ?? 'auto'))};
const state = loadWorkspace(initial), ptys = new PtyRegistry(), providers = new ProviderRegistry();
for (const provider of providersFromConfig(config.providers)) providers.register(provider);
if (process.platform === 'linux') for (const discovery of toPtyDiscoveries(discoverLinuxPtys())) { const lane = state.lanes.find(item => discovery.cwd === item.contract.cwd || discovery.cwd.startsWith(`${item.contract.cwd}/`)); ptys.upsert(discovery, lane ? String(lane.id) : null); }
const queue = new WorkQueueStore().load();
const stateRoot = path.resolve(process.env.AGENT_CONTROL_STATE_DIR || '.agent-control');
const containment=new ContainmentSupervisor(path.join(stateRoot,'containment','records.json'));
// Additive opt-in; trusted backend/worker registration is supplied by the host integration.
const labourLedger=process.env.AGENT_CONTROL_LABOUR_EXCHANGE==='1'?new LabourLedger(path.join(stateRoot,'labour','events.jsonl')):undefined;
const labourExchange=labourLedger?new LabourExchange(labourLedger,containment):undefined;
if(labourLedger)process.once('exit',()=>labourLedger.close());
const workspacePreferences=new WorkspacePreferenceStore(path.join(stateRoot,'workspaces','preferences.json'));
const workBoards=new WorkBoardRuntime(path.join(stateRoot,'work-boards','boards.json'),undefined,{evaluate:resource=>containment.schedulingEligibility(schedulerContainmentScopes(resource))});
const modelImprovement=new ModelImprovementRuntime(path.join(stateRoot,'models','improvement.json'));
const codexHome=process.env.CODEX_HOME??path.join(process.env.HOME??process.cwd(),'.codex');
const sessionVault=new SessionVaultRuntime(new ImmutableSessionVault(path.join(stateRoot,'session-vault')),[new CodexSessionAdapter([path.join(codexHome,'sessions'),path.join(codexHome,'archived_sessions')],process.env.AGENT_CONTROL_NODE_ID??'controller')],{sensitivity:'RESTRICTED',redactSensitive:true});
const capabilityIntelligence = new CapabilityIntelligenceStore(path.join(stateRoot, 'capabilities', 'intelligence.json'));
registerAgentControlCoreCapabilities(capabilityIntelligence);
const modelIntelligence = new ModelIntelligenceLedger(path.join(stateRoot, 'models', 'intelligence.json'));
const qualificationSuite = loadFrozenQualificationSuite(path.resolve('config/qualification-suite-v1.json'));
const modelRegistry = new ModelRegistry(config.providers, config.models, config.modelRouting, new ModelQualificationStore(path.join(stateRoot, 'model-qualification.json')), new AccountProfileQualificationStore(path.join(stateRoot, 'account-profile-qualification.json')), process.env, capabilityIntelligence, modelIntelligence);
const providerCatalog = new ProviderCatalogRuntime(config.providers, new ProviderCatalogStore(path.join(stateRoot, 'models', 'provider-catalog.json')), modelRegistry, modelIntelligence);
const identity = new IdentityControlPlane(path.join(stateRoot, 'identity', 'control-plane.json'));
const fastExecution = new FileFastExecutionLedger(path.join(stateRoot, 'fast-execution', 'attempts.json'));
const contracts = new ContractExecutionRuntime(path.join(stateRoot, 'contracts', 'executions.json'));
const executionSessions = new ExecutionSessionRuntime(path.join(stateRoot, 'execution-sessions'), contracts);
const handoffs = new GovernedHandoffRuntime(contracts, path.join(stateRoot, 'contracts', 'handoffs.json'));
const tokenBatonRouting = new TokenAwareBatonRuntime(path.join(stateRoot, 'token-baton-routing', 'evidence.json'), config.tokenBatonRouting);
const codexNodeExecution = new ResourceCodexNodeExecutionPort(config.resources, process.env, undefined, undefined, executionSessions);
const providerLifecycle = new ProviderModelLifecycleRegistry(path.join(stateRoot, 'models', 'lifecycle.json'));
const remoteTokenEnvironment = process.env.AGENT_CONTROL_ACP_REMOTE_TOKEN_ENV?.trim();
const runtimeObservability = new RuntimeObservability({contracts, handoffs, providerLifecycle, acpSessionDirectory:path.join(stateRoot,'acp'), remoteAcp:{enabled:process.env.AGENT_CONTROL_ACP_REMOTE_ENABLED==='true',authenticationConfigured:Boolean(remoteTokenEnvironment&&process.env[remoteTokenEnvironment]),loopback:['127.0.0.1','::1','localhost'].includes((process.env.AGENT_CONTROL_ACP_REMOTE_HOST??'127.0.0.1').toLowerCase())}});
identity.registerActor({id: 'web-operator', type: 'human', displayName: 'Authenticated web operator', principalId: 'operator:web', authenticationSource: 'dashboard-bearer', roles: ['operator'], capabilities: [], metadata: {surface: 'dashboard'}});
const defaultSessionId = 'session:web-operator';
try { identity.session(defaultSessionId); }
catch (error) {
  if (!(error instanceof Error) || error.message !== 'session_missing') throw error;
  identity.createSession({id: defaultSessionId, creatorActorId: 'web-operator', mode: 'operator-controlled', permissions: {capabilities: ['session.observe', 'session.manage', 'parcel.create', 'parcel.execute', 'parcel.approve', 'agent.delegate', 'model.invoke', 'node.execute'], allowedModels: config.models.map(model => model.id), allowedNodes: config.resources.map(resource => resource.id), filesystem: 'none', network: 'provider-only', production: false}, contextPolicy: 'compiled', visibility: 'operator', metadata: {surface: 'dashboard'}});
}
const jobRuntime = buildJobRuntime(config, stateRoot, undefined, undefined, modelRegistry, codexNodeExecution, executionSessions);
const costRoutingLedger=new CostRoutingLedger(path.join(stateRoot,'cost-routing','decisions.jsonl'));
const directInference=new DirectInferenceRuntime(modelRegistry,jobRuntime.harnessEfficiency,undefined,new FileDirectInferenceEvidenceStore(path.join(stateRoot,'direct-inference','evidence')),{config,ledger:costRoutingLedger});
const governedRetrieval = buildGovernedRetrievalRuntime(config,stateRoot);
const parameterizedJobs = buildParameterizedJobRuntime(config, modelRegistry, jobRuntime.workParcels, stateRoot, tokenBatonRouting, contracts, handoffs, codexNodeExecution, governedRetrieval);
const uxSessions=new UxSessionStore(path.join(stateRoot,'ux-sessions','records'));
const uxSessionShares=new UxSessionShareStore(path.join(stateRoot,'ux-sessions','shares.json'));
const uxSessionAnnotations=new UxSessionAnnotationStore(path.join(stateRoot,'ux-sessions','annotations.json'));
const uxSessionCapture=new UxSessionCaptureRuntime(uxSessions,parameterizedJobs.runs,parameterizedJobs.savedJobs,jobRuntime.workParcels.store,tokenBatonRouting);
const commandOutputRoot = path.resolve(stateRoot, 'command-output');
const tokenAwareOutput = new TokenAwareOutputService(new FileCommandResultStore(commandOutputRoot), {
  policy: config.tokenAwareOutput,
  telemetry: event => { const span = new Trace().span(event.name, {attributes: event.attributes}); span.end(true, event.attributes); },
});
const service = new AgentControlService(state, ptys, providers).configureProjection({
  approvalCount: () => workQueueMetrics(queue).humanReview,
  resources: config.resources.map(resource => ({id: resource.id, name: resource.name ?? resource.id, platform: resource.platform, transport: resource.transport.type, capabilities: [...resource.capabilities]})),
  services: config.services.map(service => ({id: service.id, name: service.name ?? service.id, healthUrl: service.healthUrl, optional: Boolean(service.optional), requiresAuth: Boolean(service.requiresAuth), credentialConfigured: !service.requiresAuth || Boolean((service.credentialEnv && process.env[service.credentialEnv]) || (service.credentialFileEnv && process.env[service.credentialFileEnv]))})),
  contextStore: ContextStore.load(),
  jobRuntime,
  managedNodes: jobRuntime.managedNodes,
  tokenAwareOutput,
  tokenBatonRouting,
  governedRetrieval,
  codexNodeExecution,
  harnessEfficiency: jobRuntime.harnessEfficiency,
  workParcels: jobRuntime.workParcels,
  workBoards,
  modelRegistry,
  parameterizedJobs,
  identity,
  defaultSessionId,
  fastExecution,
  runtimeObservability,
  capabilityIntelligence,
  modelIntelligence,
  qualificationSuite,
  providerCatalog,
  adaptiveOrchestration: jobRuntime.adaptiveOrchestration,
  executionSessions,
  cacheExperts: jobRuntime.cacheExperts,
  learnedSkills: jobRuntime.learnedSkills,
  deterministicSkills: jobRuntime.deterministicSkills,
  energyTelemetry: jobRuntime.energyTelemetry,
});
const capabilityAdapters=new CapabilityAdapterRegistry(path.join(stateRoot,'environment-discovery','capability-adapters.json'));
const installation=new InstallationLifecycle(path.join(stateRoot,'installation','state.json'),process.cwd());
const environmentDiscovery=new EnvironmentDiscoveryRuntime({
  file:path.join(stateRoot,'environment-discovery','inventory.json'),
  config:()=>loadConfig(configurationFile),
  configurationRevision:()=>new ConfigurationStore(configurationFile).read().revision,
  managedNodes:()=>jobRuntime.managedNodes.list(),
  additionalAdapters:[new RegisteredCapabilityDiscoveryAdapter(capabilityAdapters),new RuntimeBenchmarkDiscoveryAdapter(jobRuntime.artifacts)],
  runtimeInventory:()=>({
    jobs:jobRuntime.catalog.listJobs().map(job=>({id:job.metadata.id,name:job.metadata.name,version:job.metadata.version})),
    agents:jobRuntime.workers.list().map(worker=>({id:worker.id,health:worker.health,capabilities:[...worker.capabilities],executionIdentity:jobRuntime.workers.executionIdentity(worker.id)})),
    tools:[...jobRuntime.actions.ids()],
    skills:[...jobRuntime.deterministicSkills.records().map(skill=>({id:`deterministic:${skill.id}@${skill.version}`,state:skill.state,kind:'deterministic'})),...jobRuntime.learnedSkills.adapters().map(skill=>({id:`learned:${skill.id}@${skill.version}`,state:skill.lifecycle.state,kind:'learned'}))],
    mcpServers:[],plugins:[],
  }),
  createWorkParcel:proposal=>{const parcel=jobRuntime.workParcels.recordConfigurationProposal({proposalId:proposal.id,scanId:proposal.scanId,sha256:proposal.sha256,operationCount:proposal.operations.length,actor:proposal.actor});service.events.emit('work.parcel_created',{parcelId:parcel.id,status:parcel.status,kind:'environment-configuration'},undefined,proposal.actor);return parcel.id;},
  applyConfiguration:proposal=>{const result=new ConfigurationStore(configurationFile).applyDiscoveryOperations({revision:proposal.configurationRevision,operations:proposal.operations});if(proposal.workParcelId)jobRuntime.workParcels.recordConfigurationApplied(proposal.workParcelId,`configuration-revision:${result.revision}`);service.events.emit('configuration.changed',{kind:'environment-discovery',ids:result.changed.ids,restartRequired:true},undefined,proposal.actor);},
  onEvent:(type,payload)=>service.events.emit('environment.discovery_changed',{eventType:type,...payload},undefined,'environment-discovery'),
});
service.configureProjection({environmentDiscovery,capabilityAdapters,installation});
const diagnostics=new ArchitectureDiagnostics(new DiagnosticStore(path.join(stateRoot,'environment-discovery','diagnostics')),[new DiagnosticFileAdapter([...standardDiagnosticFiles,{path:process.env.AGENT_CONTROL_ACTIVITY_LOG??path.join(stateRoot,'logs','activity.jsonl'),category:'AGENT_CONTROL',label:'Agent Control append-only activity',format:'JSONL',componentIds:['service:agent-control']},{path:'/var/log/agent-control/activity.jsonl',category:'AGENT_CONTROL',label:'Agent Control system activity',format:'JSONL',componentIds:['service:agent-control']}]),new LinuxDiagnosticAdapter()],()=>environmentDiscovery.projection().latest,diagnosticModelPort(modelRegistry,jobRuntime.harnessEfficiency));
registerArchitectureDiagnostics(jobRuntime,diagnostics);
const estateConfig=loadConfig(configurationFile);
const estateTargets:EstateTarget[]=estateConfig.providers.flatMap(p=>{if(!p.baseUrl)return [];try{const u=new URL(p.baseUrl);if(!['http:','https:'].includes(u.protocol)||!['127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash)return [];return [{id:p.id,kind:'ENDPOINT' as const,label:p.id,locator:u.origin,providerId:p.id,modelIds:Object.fromEntries(estateConfig.models.filter(m=>m.provider===p.id).map(m=>[m.providerModel??m.id,m.id]))}];}catch{return [];}});
const estate=new EstateDiscovery({root:path.join(stateRoot,'environment-discovery','estate'),config:()=>loadConfig(configurationFile),targets:estateTargets,diagnostics,environmentDiscovery,onEvent:(type,payload)=>service.events.emit('environment.discovery_changed',{eventType:type,...payload},undefined,'estate-discovery')});
registerEstateDiscovery(jobRuntime,estate);
let sharedSpeech:import('./control/shared-speech-adapter.js').SharedSpeechAdapter|undefined;
if(process.env.AGENT_CONTROL_SHARED_SPEECH_URL){try{const {SharedSpeechClient}=await import('./vendor/shared-speech/client.mjs');const {SharedSpeechAdapter}=await import('./control/shared-speech-adapter.js');const token=process.env.AGENT_CONTROL_SHARED_SPEECH_TOKEN;if(!token)throw Error('speech_token_missing');sharedSpeech=new SharedSpeechAdapter(new SharedSpeechClient({url:process.env.AGENT_CONTROL_SHARED_SPEECH_URL,token}),process.env.AGENT_CONTROL_SHARED_SPEECH_FALLBACK==='standard'?'standard':'none');}catch{process.stderr.write('Optional Shared Speech unavailable; text remains active.\n');}}
const mallowVoiceConfig=process.env.AGENT_CONTROL_MALLOW_VOICE_CONFIG??process.env.AGENT_CONTROL_POE_VOICE_CONFIG;
let poeSpeech: import('./control/social-voice-providers.js').SpeechProvider | undefined;
let poeRecognition: import('./control/social-voice-providers.js').SpeechRecognitionProvider | undefined;
let poeVoice: import('./control/social-voice-providers.js').VoiceIdentity | undefined;
if (mallowVoiceConfig) {
  try {
    const settings=JSON.parse(fs.readFileSync(mallowVoiceConfig,'utf8'));
    const {PrivateSpeechProvider}=await import('./control/speech-http-provider.js');
    if(!settings.speechUrl||!settings.tokenEnv||!settings.voice)throw new Error('poe_voice_configuration_invalid');
    const provider=new PrivateSpeechProvider(settings.voice.provider,settings.speechUrl,process.env[settings.tokenEnv]??'',settings.voice);
    poeSpeech=provider;poeRecognition=provider;poeVoice=settings.voice;
  } catch {process.stderr.write('Optional Mallow voice configuration unavailable; text conversation remains active.\n');}
}
const knowledge = new PoeKnowledgeService({root:process.cwd(),version:AGENT_CONTROL_VERSION,sources:JSON.parse(fs.readFileSync('config/poe-knowledge-sources.json','utf8')),configuration:()=>({jobs:jobRuntime.catalog.listJobs(),schedules:jobRuntime.catalog.listSchedules(),models:service.models(),routing:config.modelRouting}),live:(category,question)=>{
  const snapshot=service.snapshot();
  if(category==='usage')return service.usageAnswer(usageQuestionQuery(question??''));
  if(category==='voice')return {realtime:voiceTransport.availability(),channel:'poe/dashboard',configured:Boolean(poeVoice&&poeSpeech&&poeRecognition),identity:poeVoice?.id??null,synthesisProvider:poeVoice?.provider??null,recognitionEngine:'Not established by this configuration; do not infer from the synthesis provider.',recognitionConfigured:Boolean(poeRecognition),synthesisConfigured:Boolean(poeSpeech),streaming:poeSpeech?.capabilities().streaming??false,readiness:'CONFIGURED_NOT_A_HEALTH_PROBE',whatsapp:'SEPARATE_CHANNEL_NOT_OBSERVED'};
  if(category==='regression')return readPoeRegression(process.env.AGENT_CONTROL_POE_REGRESSION_FILE);
  if(category==='crew')return snapshot.characterCrew.members.map(member=>({id:member.id,name:member.name,role:member.role,state:member.operationalState,summary:member.summary,freshness:member.freshness}));
  if(category==='models')return {models:service.models(),providers:snapshot.providers,routing:config.modelRouting,learnedSpecialists:service.learnedSpecialists(),deterministicSkills:service.deterministicSkillProjection()};
  if(category==='lanes')return {systems:service.systems(),lanes:snapshot.lanes.map(lane=>({id:lane.id,name:lane.name,status:lane.status,model:lane.model,baton:lane.baton}))};
  if(category==='work')return service.parcels().slice(-20).map(parcel=>({id:parcel.id,status:parcel.status,stages:parcel.stages.map(stage=>({id:stage.id,name:stage.name,job:stage.job,status:stage.status,runId:stage.runId,route:stage.actualRoute})),verification:parcel.context?.criteria.map(c=>({id:c.id,status:c.status,evidence:c.evidence}))}));
  if(category==='handoffs')return {handoffs:service.runtime().handoffs,decisions:service.tokenRouting().decisions.slice(-12)};
  throw new Error('knowledge_category_unavailable');
}});
const operator = new PoeOperatorRuntime({knowledge,registries:process.env.AGENT_CONTROL_POE_REGISTRY_SOURCES?JSON.parse(fs.readFileSync(process.env.AGENT_CONTROL_POE_REGISTRY_SOURCES,'utf8')).map((config:import('./control/poe-registry-source.js').RegistrySourceConfig)=>new PoeRegistrySource(config)):[],runtime:jobRuntime,parcels:jobRuntime.workParcels,
  file:path.join(stateRoot,'poe','operator.json'),
  registrations:[...JSON.parse(fs.readFileSync(path.resolve('config/poe-operator-jobs.json'),'utf8')),...(process.env.AGENT_CONTROL_RUNTIME_BENCHMARK_CONFIG?[{job:'model-hardware-qualification@1.0.0',purpose:'Run the configured existing-model fixture through governed target telemetry and runtime adapters.',owner:'Atlas runtime worker',changes:'Probes the configured target, may temporarily suspend its explicitly authorised idle service, runs the configured fixture and verifies restoration.',externalMutation:true,publication:false,permitted:true}]:[])],
  topics:JSON.parse(fs.readFileSync(path.resolve('config/poe-system-topics.json'),'utf8')),
  sources:{systems:()=>service.systems(),savedJobs:()=>service.savedJobs(),parameterizedSchedules:()=>service.parameterizedSchedules(),overview:()=>service.poeEvidence(),resolve:reference=>service.poeEvidence(reference)}});
// Explicit opt-in configuration: registering this adapter never acquires models or starts a target.
const localBenchmarkSettings=process.env.AGENT_CONTROL_LOCAL_BENCHMARK_CONFIG?JSON.parse(fs.readFileSync(process.env.AGENT_CONTROL_LOCAL_BENCHMARK_CONFIG,'utf8')):null;
const localBenchmark=localBenchmarkSettings?new LocalBenchmarkController({registerExecution:registerLlamaCppBenchmarkJobs,root:localBenchmarkSettings.root,template:localBenchmarkSettings.template,scan:()=>environmentDiscovery.projection().latest,catalog:jobRuntime.catalog,actions:jobRuntime.actions}):undefined;
if(localBenchmark){localBenchmark.admit(localBenchmarkSettings.template);jobRuntime.workers.registerControllerInternal({id:'local-benchmark-controller',capabilities:['benchmark.control'],health:'healthy',capacity:1,active:0,observedAt:new Date().toISOString()});service.configureProjection({localBenchmark});}
const showcaseConfig=process.env.AGENT_CONTROL_MODEL_WATCH_CONFIG?JSON.parse(fs.readFileSync(process.env.AGENT_CONTROL_MODEL_WATCH_CONFIG,'utf8')):{sources:[]};
const showcaseJournal=new IntelligenceJournal(path.join(stateRoot,'model-watches','journal.jsonl'));
const landscape=new ModelLandscape(showcaseJournal).register(new JsonModelCatalogueAdapter()).register(new HuggingFaceMetadataAdapter(fetch,()=>localBenchmarkSettings?.template.candidates??[])).register(new GitHubRuntimeReleasesAdapter());
const modelWatches=new ModelWatchRuntime({journal:showcaseJournal,landscape,sources:()=>showcaseConfig.sources??[],estate:()=>{const scan=environmentDiscovery.projection().latest;let controlQualified=false;try{if(localBenchmark){localBenchmark.admit(localBenchmarkSettings.template);controlQualified=true;}}catch{}const scanAge=scan?Date.now()-Date.parse(scan.completedAt):Infinity;return (scan?.items??[]).filter(i=>i.kind==='MACHINE').map(i=>({id:i.id,fresh:Number.isFinite(scanAge)&&scanAge>=0&&scanAge<120000,authenticated:i.health==='HEALTHY',controlQualified:controlQualified&&i.id===localBenchmarkSettings?.template.hardware.resourceId,ramAvailable:Number(i.attributes.availableMemoryBytes??0),vramAvailable:0,diskAvailable:Number(i.attributes.diskAvailableBytes??0),busy:jobRuntime.ledger.list().some(r=>r.status==='RUNNING'&&['normal','high','urgent'].includes(r.priority)),gpuUtilisation:null,architectures:localBenchmarkSettings?.template.execution.architectures??[],runtimes:localBenchmark?['llama.cpp']:[],existingArtifactHashes:[],provisioners:[]}));}});
if(localBenchmark)modelWatches.options.benchmark=new LocalWatchBenchmarkPort({controller:localBenchmark,league:modelWatches.league,journal:showcaseJournal,parcels:jobRuntime.workParcels,resolve:item=>{const reviewed=localBenchmarkSettings.template.candidates.find((c:import('./control/local-llm-benchmark.js').BenchmarkCandidate)=>c.id===item.identity.model&&c.revision===item.identity.revision&&c.sha256===item.artifactSha256&&c.filename===item.identity.artifact);return reviewed?structuredClone(reviewed):null;}});
registerModelWatchJobs(jobRuntime.catalog,jobRuntime.actions,modelWatches);
jobRuntime.workers.registerControllerInternal({id:'model-intelligence-controller',capabilities:['model.intelligence.control'],health:'healthy',capacity:1,active:0,observedAt:new Date().toISOString()});
service.configureProjection({modelWatches});
const modelWatchTimer=setInterval(()=>{void modelWatches.reconcileActive().catch(()=>{});for(const row of modelWatches.projection().watches.filter(w=>w.approved)){try{const due=modelWatches.policies.due(row.digest);if(due)jobRuntime.workParcels.submitApprovedPlan('Run approved scheduled Model Watch','model-watch-approved-policy',due.runKey,modelWatchPlan(row.digest,due.runKey));}catch{/* Revoked, expired or unavailable watches remain non-executable. */}}},60000);modelWatchTimer.unref();
const poe = new PoeRuntime({conversationTimeZone:process.env.AGENT_CONTROL_CONVERSATION_TIME_ZONE,localBenchmarkUnavailable:async()=>{if(!isAndroidUserspace())return 'No qualified local benchmark adapter is configured. Run Discovery and review a compatible runtime, workload and resource policy.';const device=await observeAndroid(new DefaultDiscoveryProbe());return 'This Android phone needs a qualified local benchmark runtime and validator. Available RAM is '+(device.availableRamBytes===null?'unknown':Math.round(device.availableRamBytes/1024**2)+' MiB')+'. Charging, battery, thermal and network-metering evidence is unavailable in base Termux, so the conservative mobile policy blocks model provisioning and benchmarking. No server-side sensor is substituted.';},modelWatches:{draft:objective=>{if(!showcaseConfig.watchDefaults)return {state:'INPUT_REQUIRED',questions:['What should the model do?','What checks prove success and what matters most?','Which approved sources, machines and overnight limits should this watch use?'],next:'Create or select a personal benchmark, then review a Model Watch in the dashboard.'};const draft=watchRequest(objective,showcaseConfig.watchDefaults);return {...modelWatches.policies.propose(draft.watch),confirmation:draft.confirmation,note:draft.note};},brief:()=>modelWatches.projection().briefs.at(-1)??{status:'NO_RECORDED_BRIEF',benchmarked:0,newLeader:null}},...(localBenchmark?{localBenchmark:{draft:objective=>localBenchmark.draft(objective)}}:{}),operator,regression:()=>readPoeRegression(process.env.AGENT_CONTROL_POE_REGRESSION_FILE),
  file:path.join(stateRoot,'poe','conversations.json'),
  evidence:{overview:()=>service.poeEvidence(),resolve:reference=>service.poeEvidence(reference)},
  sessionVault,
  ...(process.env.AGENT_CONTROL_POE_STATUS_MODEL_ROLE?{responseModel:new RoutedPoeResponseModel(modelRegistry,codexNodeExecution,{status:process.env.AGENT_CONTROL_POE_STATUS_MODEL_ROLE,reasoning:process.env.AGENT_CONTROL_POE_REASONING_MODEL_ROLE??process.env.AGENT_CONTROL_POE_STATUS_MODEL_ROLE})}:{}),
  benchmark:{submit:({proposal,actor,requestKey,plan})=>{
    const identityReference=createHash('sha256').update(`poe:${actor}`).digest('hex');
    const origin=governedRequestOrigin({channel:'poe/dashboard',modality:'dashboard',receivedAt:new Date().toISOString(),authentication:'dashboard-bearer',actorId:actor,authority:[`conversation:${proposal.conversationId}`,`proposal:${proposal.id}`,`frozen-sha256:${proposal.frozenSha256}`],messageReference:requestKey,identityReference,request:`${proposal.decision}\n\n${proposal.objective}`});
    const isLocal=plan.stages.some(s=>s.job.startsWith('local-benchmark-'));if(isLocal&&!localBenchmark)throw Error('local_benchmark_unconfigured');
    const digest=isLocal?localBenchmark!.authorize({proposal,actor,requestKey,plan}):undefined;
    try{const parcel=jobRuntime.workParcels.submitApprovedPlan(origin.request,actor,requestKey,plan,origin);if(digest)localBenchmark!.bind(digest,parcel.id);return{parcelId:parcel.id};}catch(error){if(digest)localBenchmark!.revoke(digest);throw error;}
  }},
  sharedSpeech,speech:poeSpeech,recognition:poeRecognition,voice:poeVoice,
  onEvent:event=>service.events.emit(event.type==='conversation.changed'?'poe.conversation_changed':event.type==='proposal.changed'?'poe.proposal_changed':event.type==='speech.changed'?'poe.speech_changed':'poe.interrupted',{conversationId:event.conversationId,proposalId:event.proposalId,state:event.state,detail:event.detail,observedAt:event.at},undefined,'poe'),
});
service.configureProjection({poe});
const modelEvaluationExecutor = new ProviderNeutralModelEvaluationExecutor(modelRegistry, capabilityIntelligence, codexNodeExecution, fetch, event => service.events.emit('model.intelligence_changed', {batchId: event.batchId, providerId: event.candidate.providerId, accountProfileId: event.candidate.accountProfileId ?? null, modelId: event.candidate.modelId, providerModel: event.candidate.providerModel, nodeId: event.candidate.nodeId, taskId: event.taskId, phase: event.phase, detail: event.detail, observedAt: event.at}, undefined, 'model-evaluation-runtime'));
const modelEvaluation = new ModelEvaluationCoordinator(modelIntelligence, qualificationSuite, modelEvaluationExecutor, {agentControlVersion: AGENT_CONTROL_VERSION, adapterVersion: 'provider-neutral-v1', promptVersion: qualificationSuite.version});
startModelEvaluationScheduler(modelEvaluation, (batchId, status) => { service.events.emit('model.intelligence_changed', {batchId, status}, undefined, 'model-evaluation-runtime'); service.reconcileProviderBenchmark(batchId,status,'model-evaluation-runtime'); }, 1_000, error => service.events.emit('failure', {scope: 'model-evaluation-runtime', error: error.message}, undefined, 'model-evaluation-runtime'));
tokenBatonRouting.subscribe(event => service.events.emit(event.type === 'telemetry' ? 'token.telemetry' : event.type === 'governor.transition' ? 'token.governor_transition' : event.type === 'context.lifecycle' ? 'token.context_lifecycle' : event.type === 'baton.created' ? 'token.baton_created' : 'token.handoff_result', {threadId: event.threadId, parcelId: event.parcelId, observedAt: event.at}, undefined, 'token-baton-runtime'));
executionSessions.subscribe((event, session) => service.events.emit(event.type === 'output' ? 'execution.session_output' : 'execution.session_changed', {sessionId: session.id, runId: session.scope.runId, stepId: session.scope.stepId, workerId: session.scope.workerId, nodeId: session.scope.nodeId, eventType: event.type, sequence: event.sequence, state: session.state, observedAt: event.at}, undefined, event.actorId));
governedRetrieval.subscribe(event=>service.events.emit(event.type,{parcelId:event.parcelId,intentId:event.intentId,providerId:event.providerId,strategy:event.strategy,observedAt:event.at},undefined,'retrieval-runtime'));
jobRuntime.safety?.subscribe?.(decision=>service.events.emit('runtime.safety_changed',{decisionId:decision.id,runId:decision.runId,stepId:decision.stepId,outcome:decision.outcome,policyId:decision.policyId},undefined,'runtime-safety-supervisor'));
startManagedNodeMonitoring(jobRuntime, snapshot => service.events.emit('resource.node_changed', {resourceId: snapshot.resourceId, state: snapshot.state, health: snapshot.health, currentWorkload: snapshot.currentWorkload}, undefined, 'managed-node-monitor'), error => service.events.emit('failure', {scope: 'managed-node-monitor', error: error.message}, undefined, 'managed-node-monitor'));
startJobScheduler(jobRuntime, (id, status) => id.startsWith('parcel-') ? service.events.emit('work.parcel_changed', {parcelId: id, status}, undefined, 'job-scheduler') : service.events.emit('job.run_changed', {runId: id, status}, undefined, 'job-scheduler'), 1000, error => service.events.emit('failure', {scope: 'job-scheduler', error: error.message}, undefined, 'job-scheduler'));
startParameterizedJobScheduler(parameterizedJobs, (runId, status) => service.events.emit('job.run_changed', {runId, status, kind: 'parameterized'}, undefined, 'parameterized-job-scheduler'), 1000, error => service.events.emit('failure', {scope: 'parameterized-job-scheduler', error: error.message}, undefined, 'parameterized-job-scheduler'));
const host = process.env.AGENT_CONTROL_WEB_HOST ?? '127.0.0.1', port = Number(process.env.AGENT_CONTROL_WEB_PORT ?? 4310);
let openwa: OpenWAAdapter | undefined;
let socialVoice: import('./control/social-voice.js').SocialVoiceCoordinator | undefined;
let socialTimer: ReturnType<typeof setInterval> | undefined;
jobRuntime.ledger.subscribe((runId,type,status)=>service.events.emit('job.run_changed',{runId,type,status},undefined,'run-ledger'));
parameterizedJobs.runs.subscribe(run=>service.events.emit('job.run_changed',{runId:run.id,status:run.status,kind:'parameterized'},undefined,'parameterized-run-store'));
if (process.env.AGENT_CONTROL_OPENWA_CONFIG) {
  try {
    if (!process.env.AGENT_CONTROL_WEB_OPERATOR_TOKEN) throw new Error('operator_auth_required');
    const {OpenWAAdapter, openwaConfigSchema} = await import('./control/openwa.js');
    openwa = new OpenWAAdapter(service, openwaConfigSchema.parse(JSON.parse(fs.readFileSync(process.env.AGENT_CONTROL_OPENWA_CONFIG, 'utf8'))), path.join(stateRoot,'messaging','openwa.sqlite'));
    if(process.env.AGENT_CONTROL_SOCIAL_VOICE_CONFIG){
      try {
      const settings=JSON.parse(fs.readFileSync(process.env.AGENT_CONTROL_SOCIAL_VOICE_CONFIG,'utf8'));
      const {SocialVoiceCoordinator}=await import('./control/social-voice.js');
      const {OpenWASocialProvider,openwaExecutionPort}=await import('./control/openwa-social-provider.js');
      const {PrivateSpeechProvider}=await import('./control/speech-http-provider.js');
      const speech=settings.speechUrl?new PrivateSpeechProvider(settings.voice.provider,settings.speechUrl,process.env[settings.tokenEnv]??'',settings.voice):undefined;
      socialVoice=new SocialVoiceCoordinator(path.join(stateRoot,'messaging','social-voice.sqlite'),new OpenWASocialProvider(openwa),openwaExecutionPort(openwa),speech,speech,settings.voice,Date.now,event=>service.events.emit('social.activity',{event}),{
        ask:async({actor,identityReference,text,modality})=>{
          const conversationId=`poe-whatsapp:${createHash('sha256').update(identityReference).digest('hex')}`;
          try{poe.conversation(conversationId);}catch{poe.createConversation({id:conversationId,actorId:actor,channel:'whatsapp'});}
          const result=await poe.ask({conversationId,text,channel:'whatsapp',modality,contentTrust:modality==='voice'?'UNTRUSTED_DATA':'OPERATOR_REQUEST'});
          return{conversationId,turnId:result.turn.id,text:result.turn.text};
        },
        interrupt:({actor,conversationId,turnId})=>poe.bargeIn(conversationId,actor,turnId),
      });
      openwa.social=socialVoice;socialTimer=setInterval(()=>void socialVoice?.tick().catch(()=>{}),1000);socialTimer.unref();
      } catch {process.stderr.write('Optional Social & Voice configuration unavailable; existing WhatsApp remains active.\n');}
    }
    openwa.start();
  } catch { process.stderr.write('Optional OpenWA adapter unavailable; dashboard and jobs remain active. Check private integration configuration.\n'); }
}

const {VoiceTransportRuntime}=await import('./control/voice-transport.js');
const {GptLiveTransport}=await import('./control/gpt-live-transport.js');
let liveAdapter:InstanceType<typeof GptLiveTransport>|undefined;
// Explicit existing environment reference only; never provision a key or silently start a paid session.
if(process.env.AGENT_CONTROL_VOICE_TRANSPORT==='gpt-live') {
  const credentialEnv=process.env.AGENT_CONTROL_VOICE_CREDENTIAL_ENV??'OPENAI_API_KEY';
  liveAdapter=new GptLiveTransport({credential:()=>process.env[credentialEnv]});
}
const voiceTransport:InstanceType<typeof VoiceTransportRuntime>=new VoiceTransportRuntime({directory:path.join(stateRoot,'voice'),adapter:liveAdapter,
  ingress:{
    history:(id,actor)=>{const c=service.poeConversation(id);if(c.actorId!==actor)throw Error('poe_conversation_actor_mismatch');return c.turns.map(t=>({speaker:t.actor==='operator'?'user' as const:'assistant' as const,text:t.text}));},
    request:async(id,actor,text,voiceReference)=>{const c=service.poeConversation(id);if(c.actorId!==actor)throw Error('poe_conversation_actor_mismatch');const answer=await poe.ask({conversationId:id,text,channel:'dashboard',modality:'voice',contentTrust:'UNTRUSTED_DATA',voiceReference});return {text:answer.turn.text,turnId:answer.turn.id};},
    updates:async(id,actor)=>{await service.poeOperator(id,actor);return service.poeConversation(id).turns.filter(t=>t.actor==='poe'&&['HANDOVER','RESULT'].includes(t.purpose??'')).map(t=>({id:t.id,text:t.text}));},
  },onChange:record=>service.events.emit('poe.conversation_changed',{conversationId:record.conversationId,voiceSessionId:record.id,state:record.state},undefined,'mallow'),
});
const server = startWebDashboard(service, {labourExchange,labourEvidenceDirectory:labourExchange?path.join(stateRoot,'labour','video'):undefined,estate,diagnostics,host, port, openwa, socialVoice, voiceTransport, operatorToken: process.env.AGENT_CONTROL_WEB_OPERATOR_TOKEN, allowedOrigins: process.env.AGENT_CONTROL_WEB_ALLOWED_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean), configFile: configurationFile,costRoutingLedger,uxSessions,uxSessionShares,uxSessionAnnotations,sessionVault,securityAudits:jobRuntime.securityAudits,directInference,workBoards,containment,workspacePreferences,modelImprovement});
server.on('close',()=>{void voiceTransport.dispose();if(socialTimer)clearInterval(socialTimer);openwa?.close();uxSessionCapture.dispose();});
server.on('listening', () => process.stdout.write(`Agent Control ${service.version} web dashboard: http://${host}:${port} (${process.env.AGENT_CONTROL_WEB_OPERATOR_TOKEN ? 'operator authenticated' : 'observer only'})\n`));
server.on('error', error => { process.stderr.write(`Dashboard failed: ${error.message}\n`); process.exitCode = 1; });

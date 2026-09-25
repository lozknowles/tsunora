export const DASHBOARD_CHARACTER_CREW_SCHEMA = 'agent-control.dashboard-character-crew/v2' as const;
export const DASHBOARD_CHARACTER_STALE_AFTER_MS = 120_000;
export const DASHBOARD_CHARACTER_ACTIVITY_RECENT_MS = 30_000;

export const DASHBOARD_CHARACTER_STATES = [
  'idle',
  'queued',
  'working',
  'reviewing',
  'waiting',
  'awaiting_operator',
  'blocked',
  'resource_pressure',
  'recovering',
  'handing_over',
  'completed',
  'failed',
  'cancelling',
  'cancelled',
  'offline',
  'stale',
  'unknown',
] as const;

export type DashboardCharacterState = typeof DASHBOARD_CHARACTER_STATES[number];
export type DashboardCharacterId = 'lane-master' | 'prompt-reviewer' | 'parcel-coordinator' | 'model-scout' | 'resource-guardian' | 'quality-inspector';
export type DashboardCharacterFreshness = 'current' | 'stale' | 'unknown';
export type DashboardCharacterCoverage = 'live' | 'partial' | 'unavailable';
export type DashboardOperationalState = 'IDLE' | 'PLANNING' | 'ROUTING' | 'EXECUTING' | 'WAITING' | 'VERIFYING' | 'PAUSED' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'RECOVERING' | 'UNKNOWN';
export type DashboardCharacterActivity = 'NONE' | 'PLANNING' | 'ROUTING' | 'CARRYING_PARCEL' | 'CODING' | 'SEARCHING' | 'READING' | 'USING_TOOL' | 'REMOTE_EXECUTION' | 'BENCHMARKING' | 'MODEL_DISCOVERY' | 'REVIEWING_OUTPUT' | 'PASSING_BATON' | 'VERIFYING' | 'MONITORING_RESOURCES' | 'WAITING' | 'RECOVERING';
export type DashboardAnimationExpression = 'AMBIENT_IDLE' | 'LOOKING_AROUND' | 'SLEEPING' | 'WAKING' | 'THINKING' | 'TYPING' | 'SEARCHING' | 'USING_TOOL' | 'NETWORKING' | 'TESTING' | 'CARRYING_PARCEL' | 'INSPECTING' | 'WAITING' | 'RETRYING' | 'WORKING' | 'SUCCESS_ACKNOWLEDGEMENT' | 'CONCERNED' | 'STILL';
export type DashboardToolKind = 'SEARCH' | 'CODE_EDIT' | 'FILE' | 'WEB_BROWSER' | 'REMOTE_MACHINE' | 'BENCHMARK' | 'VOICE' | 'SOCIAL' | 'MODEL_DISCOVERY' | 'GENERIC_TOOL';

export interface DashboardActivitySource {
  authority: 'Agent Control';
  type: string;
  id: string | null;
  at: string | null;
  detail: string;
}

export interface DashboardToolProjection {
  kind: DashboardToolKind;
  label: string;
  action: string;
  capabilities: string[];
}

export interface DashboardActivityProjection {
  kind: DashboardCharacterActivity;
  label: string;
  source: DashboardActivitySource;
  tool: DashboardToolProjection | null;
}

export interface DashboardNarrationProjection {
  id: string;
  characterId: DashboardCharacterId;
  text: string;
  detail: string;
  source: DashboardActivitySource;
}

export interface DashboardCharacterSignal {
  state: DashboardCharacterState;
  label: string;
  count: number;
}

export interface DashboardCharacterProjection {
  id: DashboardCharacterId;
  name: string;
  role: string;
  area: string;
  identityColor: string;
  accessory: string;
  idlePersonality: string;
  workingPersonality: string;
  state: DashboardCharacterState;
  stateLabel: string;
  operationalState: DashboardOperationalState;
  activity: DashboardActivityProjection;
  animationCue: {expression: DashboardAnimationExpression; label: string; authority: 'presentation-only'; sourceType: string};
  narration: DashboardNarrationProjection;
  summary: string;
  reason: string;
  nextAction: string;
  counts: {active: number; queued: number; waiting: number; blocked: number; completed: number; failed: number};
  signals: DashboardCharacterSignal[];
  current: string | null;
  elapsedMs: number | null;
  lastUpdatedAt: string | null;
  freshness: DashboardCharacterFreshness;
  instrumentation: {coverage: DashboardCharacterCoverage; source: string; limitation: string | null};
  navigation: {view: 'jobs' | 'lanes' | 'systems' | 'models'; target: string; tab?: string};
  transitionKey: string;
}

export interface DashboardCharacterCrewProjection {
  schema: typeof DASHBOARD_CHARACTER_CREW_SCHEMA;
  observedAt: string;
  staleAfterMs: number;
  activityRecentMs: number;
  executionMode: 'LIVE' | 'CONTROLLED_FAULT_INJECTION' | 'SIMULATED' | null;
  headline: string;
  narration: DashboardNarrationProjection[];
  parcels: DashboardParcelProjection[];
  batonTransfers: DashboardBatonTransferProjection[];
  modelActivity: DashboardModelActivityProjection[];
  activityPanel: DashboardActivityPanelProjection;
  members: DashboardCharacterProjection[];
}

export type DashboardActivityIndicatorState = 'ACTIVE' | 'RECENT' | 'IDLE' | 'STALE' | 'FAILED' | 'DISCONNECTED' | 'UNKNOWN';
export type DashboardActivityIndicatorShape = 'circle' | 'diamond' | 'bar' | 'triangle' | 'square';

export interface DashboardActivityIndicatorProjection {
  id: string;
  groupId: 'control' | 'execution' | 'providers' | 'handoff' | 'assurance' | 'infrastructure';
  label: string;
  shape: DashboardActivityIndicatorShape;
  state: DashboardActivityIndicatorState;
  count: number | null;
  at: string | null;
  eventType: string;
  eventId: string | null;
  laneId: string | null;
  provider: string | null;
  model: string | null;
  explanation: string;
  source: string;
  meaning: string;
  persistence: string;
  staleBehavior: string;
}

export interface DashboardActivityPanelProjection {
  schema: 'agent-control.dashboard-activity-panel/v1';
  observedAt: string;
  groups: Array<{id: DashboardActivityIndicatorProjection['groupId']; label: string; indicators: DashboardActivityIndicatorProjection[]}>;
  decorativeHeartbeat: {authority: 'presentation-only'; label: string; explanation: string};
}

export interface DashboardParcelStageProjection {
  id: string;
  name: string;
  status: string;
  dependencies: string[];
  runId: string | null;
  worker: string | null;
  route: string | null;
  tool: DashboardToolProjection | null;
}

export interface DashboardParcelJourneyProjection {
  id: string;
  at: string;
  type: string;
  summary: string;
  characterId: DashboardCharacterId;
  stageId: string | null;
}

export interface DashboardParcelProjection {
  id: string;
  objective: string;
  status: string;
  operationalState: DashboardOperationalState;
  owner: DashboardCharacterId;
  ownerReason: string;
  narration: string;
  progress: {completed: number; active: number; waiting: number; failed: number; total: number};
  parallelActive: number;
  route: string | null;
  updatedAt: string;
  transitionKey: string;
  stages: DashboardParcelStageProjection[];
  journey: DashboardParcelJourneyProjection[];
}

export interface DashboardRouteProjection {
  provider: string;
  account: string | null;
  model: string;
  node: string | null;
  label: string;
}

export interface DashboardBatonTransferProjection {
  id: string;
  at: string;
  parcelId: string;
  sourceType: 'token-routing' | 'work-parcel' | 'lane';
  sourceEventId: string;
  batonId: string | null;
  from: DashboardRouteProjection | null;
  to: DashboardRouteProjection | null;
  outcome: string;
  active: boolean;
  reason: string;
  explanation: string;
  contextPercent: number | null;
  triggerKind: string | null;
  triggerCode: string | null;
  triggerReason: string | null;
}

export interface DashboardModelActivityProjection {
  id: string;
  at: string;
  provider: string | null;
  model: string | null;
  action: string;
  status: string | null;
  failure: string | null;
  httpStatus: number | null;
  routingEligible: boolean | null;
  explanation: string;
}

interface LaneSource {
  id?: string | number;
  name?: string;
  status: string;
  elapsedMs?: number;
  lastMeaningfulActivity?: string | null;
  model?: string;
  executionTarget?: string;
  baton?: {status?: string; nextAction?: string};
  verification?: {phase?: string};
}

interface RunStepSource {
  id?: string;
  action?: string;
  status: string;
  waitingReason?: string;
  error?: string;
  startedAt?: string;
  endedAt?: string;
  resources?: string[];
  capabilityRequest?: {requires?: Array<{id?: string}>};
  attempts?: Array<{workerId?: string}>;
}

interface RunSource {
  id?: string;
  jobId?: string;
  status: string;
  executionMode?: 'LIVE' | 'CONTROLLED_FAULT_INJECTION' | 'SIMULATED';
  requestedAt?: string;
  updatedAt?: string;
  startedAt?: string;
  endedAt?: string;
  completedAt?: string;
  errors?: string[];
  steps?: RunStepSource[];
  selectedWorkers?: string[];
  trigger?: {type?: string; actor?: string; id?: string; parcelContext?: {parcelId?: string; stageId?: string}; modelRoute?: {providerId?: string; modelId?: string; accountLabel?: string | null; accountProfileId?: string | null; providerExecutionNodeId?: string; nodeId?: string}};
  modelRoute?: {providerId?: string; modelId?: string; accountLabel?: string | null; accountProfileId?: string | null; providerExecutionNodeId?: string; nodeId?: string};
  recovery?: {state?: string; reason?: string; observedAt?: string};
}

interface ParcelStageSource {
  id?: string;
  name?: string;
  dependsOn?: string[];
  runId?: string;
  status: string;
  waitingReason?: string;
  error?: string;
  startedAt?: string;
  endedAt?: string;
  actualRoute?: {workers?: string[]; providerExecutionNodeId?: string; provider?: string; model?: string; accountLabel?: string; accountProfile?: string; reason?: string};
  baton?: {schema?: string; id?: string; sha256?: string; nextAction?: string; sourceStageIds?: string[]; targetStageId?: string; artifactIds?: string[]; outputTypes?: string[]};
}

interface ParcelSource {
  id?: string;
  status: string;
  executionMode?: 'LIVE' | 'CONTROLLED_FAULT_INJECTION' | 'SIMULATED';
  createdAt: string;
  updatedAt: string;
  endedAt?: string;
  stages: ParcelStageSource[];
  objective?: string;
  context?: {
    active?: {currentStageIds?: string[]; currentRoute?: string; updatedAt?: string};
    questions?: Array<{status: string; text?: string}>;
    events?: Array<{id: string; at: string; type: string; stageId?: string; summary: string; detail?: Record<string, unknown>}>;
    batonViews?: Array<{id: string; createdAt: string; sourceStageIds?: string[]; targetStageId?: string; nextAction?: string; sha256?: string}>;
  };
  audit?: {timeline?: Array<{id?: string; type: string; at: string; stageId?: string; summary?: string; detail?: string}>};
}

interface SystemSource {
  id?: string;
  name?: string;
  execution: string;
  blockingReason?: string | null;
  active?: number | null;
  capacity?: number | null;
  lastCheckAt?: string | null;
  lastSuccessfulProbeAt?: string | null;
  node?: {lastProbeAt?: string | null; state?: string; currentWorkload?: string | null; memory?: {totalBytes?: number | null; availableBytes?: number | null}; storage?: Array<{usedPercent?: number}>; warnings?: string[]};
}

interface ModelSource {
  id?: string;
  provider?: string;
  enabled?: boolean;
  qualificationState?: string;
  accountAvailability?: string | null;
  checkedAt?: string | null;
}

interface ModelBatchSource {id?: string; status: string; createdAt?: string | null; startedAt?: string | null; completedAt?: string | null; candidates?: Array<{providerId?: string; modelId?: string}>;}
interface TokenThreadSource {id: string; parcelId: string; active: boolean; startedAt?: string; updatedAt?: string; providerId?: string; modelId?: string; accountLabel?: string | null; accountProfileId?: string | null; providerExecutionNodeId?: string; nodeId?: string; governor?: {state?: string; reason?: string}; latest?: {at?: string; elapsedMs?: number};}
interface TokenDecisionSource {id?: string; threadId: string; parcelId: string; at: string; action: string; outcome: string; reason?: string; batonId?: string; contextPercent?: number | null; trigger?: {kind?: string; code?: string; reason?: string; evidence?: string[]}; target?: {providerId?: string; modelId?: string; accountLabel?: string; accountProfileId?: string; providerExecutionNodeId?: string; nodeId?: string};}
interface ControlEventSource {id: number; at: string; type: string; laneId?: number; payload?: Record<string, unknown>;}

export interface DashboardCharacterSource {
  observedAt: string;
  paused?: boolean;
  lanes?: LaneSource[];
  runs?: RunSource[];
  parameterizedRuns?: RunSource[];
  parcels?: ParcelSource[];
  systems?: SystemSource[];
  models?: ModelSource[];
  modelBatches?: ModelBatchSource[];
  tokenRouting?: {threads?: TokenThreadSource[]; decisions?: TokenDecisionSource[]};
  events?: ControlEventSource[];
  outstandingApprovals?: number;
  staleAfterMs?: number;
}

interface CharacterIdentity {
  id: DashboardCharacterId;
  name: string;
  role: string;
  area: string;
  identityColor: string;
  accessory: string;
  idlePersonality: string;
  workingPersonality: string;
  navigation: DashboardCharacterProjection['navigation'];
}

const identities: Record<DashboardCharacterId, CharacterIdentity> = {
  'lane-master': {id: 'lane-master', name: 'Cadence', role: 'Controller & Lane Dispatcher', area: 'Lanes, queue and capacity', identityColor: '#4f8cff', accessory: 'conductor baton and three-lane crown', idlePersonality: 'Keeps a quiet count of open lanes and checks the room.', workingPersonality: 'Conducts concurrent lanes and makes scheduling decisions visible.', navigation: {view: 'lanes', target: '#lane-list'}},
  'prompt-reviewer': {id: 'prompt-reviewer', name: 'Quill', role: 'Work Parcel Reviewer', area: 'Task entry and readiness', identityColor: '#a879ff', accessory: 'document visor and marking quill', idlePersonality: 'Reads a page, makes a tiny note, then rests.', workingPersonality: 'Checks the recorded objective, constraints, plan and operator questions.', navigation: {view: 'jobs', target: '#natural-task-prompt'}},
  'parcel-coordinator': {id: 'parcel-coordinator', name: 'Relay', role: 'Tool & Execution Worker', area: 'Work Parcels, tools and handovers', identityColor: '#35c7be', accessory: 'parcel harness and relay baton', idlePersonality: 'Keeps the parcel harness tidy and watches for the next dispatch.', workingPersonality: 'Carries bounded work through the selected tool, worker and dependency graph.', navigation: {view: 'jobs', target: '#parcel-list'}},
  'model-scout': {id: 'model-scout', name: 'Lumen', role: 'Model Router & Scout', area: 'Models, providers and qualification', identityColor: '#ff9b4a', accessory: 'survey lens and signal dish', idlePersonality: 'Slowly scans qualified routes without changing them.', workingPersonality: 'Discovers, compares and routes only from recorded provider/model evidence.', navigation: {view: 'models', target: '#models-list'}},
  'resource-guardian': {id: 'resource-guardian', name: 'Rook', role: 'Resource & Node Guardian', area: 'Systems, remote nodes and resources', identityColor: '#55c979', accessory: 'shield frame and pressure gauge', idlePersonality: 'Checks a gauge, looks toward another worker, then settles.', workingPersonality: 'Watches capacity, remote execution, connectivity and credential locality.', navigation: {view: 'systems', target: '#systems-list'}},
  'quality-inspector': {id: 'quality-inspector', name: 'Verity', role: 'Verification & Evidence Inspector', area: 'Validation, transcripts and run evidence', identityColor: '#e3b84e', accessory: 'inspection lens and check seal', idlePersonality: 'Polishes the inspection lens and reviews the latest seal.', workingPersonality: 'Independently checks outputs, evidence boundaries and exact failures.', navigation: {view: 'jobs', target: '#run-history', tab: 'runs'}},
};

const labels: Record<DashboardCharacterState, string> = {
  idle: 'Idle', queued: 'Queued', working: 'Working', reviewing: 'Reviewing', waiting: 'Waiting', awaiting_operator: 'Awaiting operator', blocked: 'Blocked', resource_pressure: 'Resource pressure', recovering: 'Recovering', handing_over: 'Handing over', completed: 'Completed', failed: 'Failed', cancelling: 'Cancelling', cancelled: 'Cancelled', offline: 'Offline', stale: 'Stale', unknown: 'Unknown',
};

const activeStates = new Set(['RUNNING', 'RESOLVING', 'VERIFYING', 'VALIDATING']);
const queuedStates = new Set(['PLANNING', 'QUEUED', 'SCHEDULED', 'WAITING_FOR_WORKER']);
const waitingStates = new Set(['WAITING', 'WAITING_FOR_DEPENDENCY', 'WAITING_FOR_RESOURCE']);
const operatorStates = new Set(['WAITING_FOR_APPROVAL', 'AUTHENTICATION_BLOCKED']);
const recoveringStates = new Set(['RECONNECTING', 'RETRY_PENDING']);
const cancellationStates = new Set(['CANCELLING', 'CANCEL_PENDING']);
const blockedStates = new Set(['BLOCKED', 'CLEANUP_UNCERTAIN', 'DISCONNECTED']);

function timestamp(value: string | null | undefined): number | null {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : null;
}

function latest(values: Array<string | null | undefined>): string | null {
  let selected: string | null = null;
  let selectedTime = -Infinity;
  for (const value of values) {
    const parsed = timestamp(value);
    if (parsed !== null && parsed > selectedTime) { selected = value!; selectedTime = parsed; }
  }
  return selected;
}

function first(values: Array<string | null | undefined>, fallback: string): string {
  return values.find(value => typeof value === 'string' && value.trim())?.trim() ?? fallback;
}

function ageMs(start: string | null | undefined, nowMs: number): number | null {
  const parsed = timestamp(start);
  return parsed === null ? null : Math.max(0, nowMs - parsed);
}

function isStale(value: string | null, nowMs: number, threshold: number): boolean {
  const parsed = timestamp(value);
  return parsed === null || nowMs - parsed >= threshold;
}

function count(statuses: string[], accepted: Set<string>): number { return statuses.filter(status => accepted.has(status)).length; }
function signal(state: DashboardCharacterState, label: string, value: number): DashboardCharacterSignal | null { return value > 0 ? {state, label, count: value} : null; }
function compactSignals(values: Array<DashboardCharacterSignal | null>): DashboardCharacterSignal[] { return values.filter((value): value is DashboardCharacterSignal => value !== null); }

type DashboardCharacterBase = Omit<DashboardCharacterProjection, 'operationalState' | 'activity' | 'animationCue' | 'narration'>;

function makeCharacter(identity: CharacterIdentity, input: Omit<DashboardCharacterBase, keyof CharacterIdentity | 'stateLabel' | 'transitionKey'>): DashboardCharacterBase {
  const transitionKey = [input.state, input.lastUpdatedAt ?? 'none', input.counts.active, input.counts.queued, input.counts.waiting, input.counts.blocked, input.counts.completed, input.counts.failed].join(':');
  return {...identity, ...input, stateLabel: labels[input.state], transitionKey};
}

function laneMaster(source: DashboardCharacterSource, nowMs: number, staleAfterMs: number): DashboardCharacterBase {
  const lanes = source.lanes ?? [], runs = [...(source.runs ?? []), ...(source.parameterizedRuns ?? [])], laneStatuses = lanes.map(item => item.status.toUpperCase()), runStatuses = runs.map(item => item.status.toUpperCase());
  const working = count(laneStatuses, new Set(['WORKING'])) + count(runStatuses, activeStates), queued = count(laneStatuses, new Set(['WAITING'])) + count(runStatuses, queuedStates), waiting = count(runStatuses, waitingStates), failed = count(laneStatuses, new Set(['ERROR'])) + count(runStatuses, new Set(['FAILED', 'DEGRADED']));
  const cancelling = lanes.filter(item => item.status === 'cancelled' && /request|confirm|cleanup/i.test(`${item.baton?.status ?? ''} ${item.baton?.nextAction ?? ''}`)).length + count(runStatuses, cancellationStates), cancelled = lanes.filter(item => item.status === 'cancelled' && !/request|confirm|cleanup/i.test(`${item.baton?.status ?? ''} ${item.baton?.nextAction ?? ''}`)).length + count(runStatuses, new Set(['CANCELLED']));
  const recovering = count(runStatuses, recoveringStates), operator = count(runStatuses, operatorStates) + (source.outstandingApprovals ?? 0), paused = laneStatuses.filter(status => status === 'PAUSED').length, blocked = paused + count(runStatuses, blockedStates);
  const handoff = latestActiveHandoff(source), updatedAt = latest([...lanes.map(item => item.lastMeaningfulActivity), ...runs.map(runUpdatedAt), handoff?.at]);
  let state: DashboardCharacterState = 'idle';
  if (source.paused) state = 'blocked';
  else if (handoff) state = 'handing_over';
  else if (working > 0) state = isStale(updatedAt, nowMs, staleAfterMs) ? 'stale' : 'working';
  else if (cancelling > 0) state = 'cancelling';
  else if (recovering > 0) state = 'recovering';
  else if (operator > 0) state = 'awaiting_operator';
  else if (blocked > 0) state = 'blocked';
  else if (waiting > 0) state = 'waiting';
  else if (queued > 0) state = 'queued';
  else if (failed > 0) state = 'failed';
  else if (cancelled > 0) state = 'cancelled';
  const summary = working > 0 ? `${working} active execution${working === 1 ? '' : 's'}; ${queued + waiting} waiting; ${blocked} blocked.` : source.paused ? 'Scheduling is paused; no new lane work may start.' : `${lanes.length} lane${lanes.length === 1 ? '' : 's'}; ${queued + waiting} waiting; ${blocked} blocked.`;
  const activeLane = lanes.find(item => item.status.toUpperCase() === 'WORKING');
  const activeRun = runs.find(item => activeStates.has(item.status.toUpperCase()));
  const current = activeLane ? [activeLane.name ?? (activeLane.id !== undefined ? `Lane ${activeLane.id}` : 'active lane'), activeLane.model, activeLane.executionTarget].filter(Boolean).join(' · ') : activeRun ? [activeRun.id, activeRun.modelRoute?.providerId, activeRun.modelRoute?.accountLabel, activeRun.modelRoute?.modelId].filter(Boolean).join(' · ') : null;
  const reason = state === 'stale' ? 'Active work is retained, but its latest authoritative update is stale.' : source.paused ? 'Agent Control is globally paused.' : first(runs.flatMap(item => item.steps?.map(step => step.waitingReason ?? step.error) ?? []), state === 'idle' ? 'No lane or Job is actively executing.' : 'Canonical lane and scheduler state selected this presentation.');
  const nextAction = state === 'awaiting_operator' ? 'Open the waiting Run or approval.' : state === 'blocked' ? 'Inspect the blocked lane or Run evidence.' : state === 'stale' ? 'Reconcile the execution before changing its status.' : 'Open Lanes for authoritative activity and controls.';
  return makeCharacter(identities['lane-master'], {state, summary, reason, nextAction, counts: {active: working, queued, waiting, blocked, completed: count(runStatuses, new Set(['SUCCEEDED', 'SUCCEEDED_WITH_FINDINGS'])), failed}, signals: compactSignals([signal('working', 'active', working), signal('queued', 'queued', queued), signal('waiting', 'waiting', waiting), signal('blocked', 'blocked', blocked), signal('recovering', 'retrying', recovering), signal('awaiting_operator', 'operator', operator), signal('failed', 'failed', failed)]), current, elapsedMs: maximumElapsed([...lanes.map(item => item.elapsedMs), ...runs.filter(run => activeStates.has(run.status)).map(run => ageMs(run.startedAt ?? run.requestedAt, nowMs))]), lastUpdatedAt: updatedAt, freshness: state === 'stale' ? 'stale' : updatedAt ? 'current' : 'unknown', instrumentation: {coverage: lanes.length || runs.length ? 'live' : 'unavailable', source: 'canonical lane, scheduler and Run state', limitation: lanes.length || runs.length ? null : 'No lanes or Job runtime are configured.'}});
}

function promptReviewer(source: DashboardCharacterSource, nowMs: number, staleAfterMs: number): DashboardCharacterBase {
  const parcels = source.parcels ?? [], planning = parcels.filter(item => item.status === 'PLANNING'), queued = parcels.filter(item => item.status === 'QUEUED'), openQuestions = parcels.flatMap(item => item.context?.questions ?? []).filter(item => item.status === 'OPEN'), planningFailures = parcels.filter(item => item.audit?.timeline?.some(event => event.type === 'planning.failed'));
  const updatedAt = latest([...planning.map(item => item.updatedAt), ...queued.map(item => item.updatedAt), ...parcels.map(item => item.updatedAt)]);
  let state: DashboardCharacterState = openQuestions.length ? 'awaiting_operator' : planning.length ? 'reviewing' : queued.length ? 'queued' : planningFailures.length ? 'failed' : 'idle';
  if ((planning.length || queued.length) && isStale(updatedAt, nowMs, staleAfterMs)) state = 'stale';
  const summary = openQuestions.length ? `${openQuestions.length} explicit operator question${openQuestions.length === 1 ? '' : 's'} await an answer.` : planning.length ? `${planning.length} task prompt${planning.length === 1 ? ' is' : 's are'} in planning or readiness checks.` : 'Task entry is ready; no prompt is currently being planned.';
  return makeCharacter(identities['prompt-reviewer'], {state, summary, reason: openQuestions[0]?.text?.trim() || (planning.length ? 'Work Parcel planning is the only live prompt-readiness signal.' : 'There is no dedicated prompt-review agent or separate prompt-quality telemetry.'), nextAction: openQuestions.length ? 'Open Work Parcels and answer the recorded question.' : planning.length ? 'Open Work Parcels to inspect the plan and readiness evidence.' : 'Enter an objective with constraints and required evidence.', counts: {active: planning.length, queued: queued.length, waiting: openQuestions.length, blocked: 0, completed: parcels.filter(item => item.status === 'SUCCEEDED').length, failed: planningFailures.length}, signals: compactSignals([signal('reviewing', 'planning', planning.length), signal('queued', 'queued', queued.length), signal('awaiting_operator', 'questions', openQuestions.length), signal('failed', 'planning failures', planningFailures.length)]), current: planning[0]?.id ?? queued[0]?.id ?? null, elapsedMs: maximumElapsed(planning.map(item => ageMs(item.createdAt, nowMs))), lastUpdatedAt: updatedAt, freshness: state === 'stale' ? 'stale' : updatedAt ? 'current' : 'unknown', instrumentation: {coverage: 'partial', source: 'Work Parcel planning and durable questions', limitation: 'Agent Control has no separately instrumented prompt-review worker; this character reports planning/readiness only.'}});
}

function parcelCoordinator(source: DashboardCharacterSource, nowMs: number, staleAfterMs: number): DashboardCharacterBase {
  const parcels = source.parcels ?? [], statuses = parcels.map(item => item.status), stages = parcels.flatMap(item => item.stages), stageStatuses = stages.map(item => item.status), runs = [...(source.runs ?? []), ...(source.parameterizedRuns ?? [])], runStatuses = runs.map(item => item.status), openQuestions = parcels.flatMap(item => item.context?.questions ?? []).filter(item => item.status === 'OPEN');
  const active = statuses.filter(item => item === 'RUNNING').length, queued = statuses.filter(item => ['PLANNING', 'QUEUED'].includes(item)).length, waiting = statuses.filter(item => item === 'WAITING').length, blocked = stageStatuses.filter(item => item === 'BLOCKED').length + count(runStatuses, blockedStates), failed = statuses.filter(item => item === 'FAILED').length, completed = statuses.filter(item => item === 'SUCCEEDED').length;
  const cancelling = count(runStatuses, cancellationStates), recovering = count(runStatuses, recoveringStates), handoff = latestActiveHandoff(source), activeParcels = parcels.filter(item => ['RUNNING', 'WAITING', 'PLANNING', 'QUEUED'].includes(item.status)), updatedAt = latest([...activeParcels.map(item => item.updatedAt), handoff?.at, ...parcels.map(item => item.updatedAt)]);
  let state: DashboardCharacterState = 'idle';
  if (handoff) state = 'handing_over';
  else if (active > 0) state = 'working';
  else if (cancelling > 0) state = 'cancelling';
  else if (recovering > 0) state = 'recovering';
  else if (openQuestions.length > 0) state = 'awaiting_operator';
  else if (blocked > 0) state = 'blocked';
  else if (waiting > 0) state = 'waiting';
  else if (queued > 0) state = 'queued';
  else if (failed > 0) state = 'failed';
  else if (statuses.includes('CANCELLED')) state = 'cancelled';
  else if (completed > 0) state = 'completed';
  if (activeParcels.length && isStale(updatedAt, nowMs, staleAfterMs)) state = 'stale';
  const activeStage = stages.find(item => ['RUNNING', 'WAITING'].includes(item.status)), route = activeStage?.actualRoute, routeLabel = route ? [route.provider, route.accountLabel ?? route.accountProfile, route.model].filter(Boolean).join(' / ') : '';
  const reason = state === 'stale' ? 'Active parcel state has not received a fresh authoritative update.' : handoff ? handoff.reason ?? 'A recorded baton handoff is in progress.' : first(stages.map(item => item.waitingReason ?? item.error), active ? 'A Work Parcel stage is executing.' : 'No Work Parcel is active.');
  const nextAction = state === 'awaiting_operator' ? 'Answer the durable Parcel question.' : state === 'blocked' || state === 'failed' ? 'Open the Parcel timeline and underlying Run evidence.' : state === 'stale' ? 'Reconcile the active Run before dispatching more work.' : 'Open Work Parcels for dependencies, batons and evidence.';
  return makeCharacter(identities['parcel-coordinator'], {state, summary: active ? `${active} parcel${active === 1 ? '' : 's'} moving; ${waiting + queued} waiting; ${blocked} blocked.` : `${parcels.length} parcel${parcels.length === 1 ? '' : 's'} tracked; ${completed} completed; ${failed} failed.`, reason, nextAction, counts: {active, queued, waiting, blocked, completed, failed}, signals: compactSignals([signal('working', 'active', active), signal('queued', 'queued', queued), signal('waiting', 'waiting', waiting), signal('blocked', 'blocked', blocked), signal('recovering', 'retrying', recovering), signal('awaiting_operator', 'questions', openQuestions.length), signal('failed', 'failed', failed)]), current: [activeParcels[0]?.id, routeLabel].filter(Boolean).join(' · ') || null, elapsedMs: maximumElapsed(activeParcels.map(item => ageMs(item.createdAt, nowMs))), lastUpdatedAt: updatedAt, freshness: state === 'stale' ? 'stale' : updatedAt ? 'current' : 'unknown', instrumentation: {coverage: parcels.length ? 'live' : 'unavailable', source: 'durable Work Parcel, stage, baton and routing state', limitation: parcels.length ? null : 'No Work Parcels have been recorded.'}});
}

function modelScout(source: DashboardCharacterSource, nowMs: number, staleAfterMs: number): DashboardCharacterBase {
  const models = source.models ?? [], batches = source.modelBatches ?? [], running = batches.filter(item => item.status === 'RUNNING'), queued = batches.filter(item => item.status === 'QUEUED'), blockedBatches = batches.filter(item => ['BLOCKED', 'PARTIAL'].includes(item.status)), qualified = models.filter(item => item.enabled !== false && ['QUALIFIED', 'PREFERRED'].includes(item.qualificationState ?? '') && !['UNAVAILABLE', 'AUTHENTICATION_REQUIRED', 'DISABLED'].includes(item.accountAvailability ?? '')), unavailable = models.filter(item => item.enabled === false || ['UNAVAILABLE', 'AUTHENTICATION_REQUIRED', 'DISABLED'].includes(item.accountAvailability ?? ''));
  const updatedAt = latest([...running.map(item => item.startedAt ?? item.createdAt), ...queued.map(item => item.createdAt), ...batches.map(item => item.completedAt ?? item.startedAt ?? item.createdAt), ...models.map(item => item.checkedAt)]);
  let state: DashboardCharacterState = running.length ? 'working' : queued.length ? 'queued' : blockedBatches.length ? 'blocked' : models.length === 0 ? 'unknown' : qualified.length === 0 ? 'blocked' : 'idle';
  if (running.length && isStale(updatedAt, nowMs, staleAfterMs)) state = 'stale';
  const summary = running.length ? `${running.length} frozen model evaluation${running.length === 1 ? '' : 's'} running; ${queued.length} queued.` : `${qualified.length} of ${models.length} configured model route${models.length === 1 ? '' : 's'} currently qualified.`;
  return makeCharacter(identities['model-scout'], {state, summary, reason: models.length ? (blockedBatches.length ? 'A qualification batch is blocked or partial; its evidence remains authoritative.' : 'Registry qualification and frozen evaluation state drive this view.') : 'No model registry entries are available to inspect.', nextAction: running.length || queued.length ? 'Open Models to inspect the frozen evaluation queue.' : qualified.length ? 'Open Models to compare qualification and benchmark evidence.' : 'Configure and qualify a model route before automatic selection.', counts: {active: running.length, queued: queued.length, waiting: 0, blocked: blockedBatches.length + unavailable.length, completed: qualified.length, failed: batches.filter(item => item.status === 'FAILED').length}, signals: compactSignals([signal('working', 'evaluating', running.length), signal('queued', 'queued', queued.length), signal('blocked', 'unavailable', unavailable.length + blockedBatches.length), signal('completed', 'qualified', qualified.length)]), current: running[0]?.id ?? ([qualified[0]?.provider, qualified[0]?.id].filter(Boolean).join(' / ') || null), elapsedMs: maximumElapsed(running.map(item => ageMs(item.startedAt ?? item.createdAt, nowMs))), lastUpdatedAt: updatedAt, freshness: state === 'stale' ? 'stale' : updatedAt ? 'current' : 'unknown', instrumentation: {coverage: models.length || batches.length ? 'live' : 'unavailable', source: 'model registry and frozen qualification ledger', limitation: models.length || batches.length ? null : 'The model registry or intelligence projection has no entries.'}});
}

function resourceGuardian(source: DashboardCharacterSource, nowMs: number, staleAfterMs: number): DashboardCharacterBase {
  const systems = source.systems ?? [], execution = systems.map(item => item.execution), available = execution.filter(item => item === 'AVAILABLE').length, busy = execution.filter(item => item === 'BUSY').length, degraded = execution.filter(item => item === 'DEGRADED').length, auth = execution.filter(item => item === 'AUTH REQUIRED').length, offline = execution.filter(item => item === 'OFFLINE').length, unknown = execution.filter(item => item === 'UNKNOWN').length;
  const memoryPressure = systems.filter(item => { const total = item.node?.memory?.totalBytes, availableBytes = item.node?.memory?.availableBytes; return typeof total === 'number' && total > 0 && typeof availableBytes === 'number' && availableBytes / total < .1; }).length, storagePressure = systems.filter(item => item.node?.storage?.some(value => typeof value.usedPercent === 'number' && value.usedPercent >= 90)).length, pressure = busy + degraded + memoryPressure + storagePressure;
  const updatedAt = latest(systems.flatMap(item => [item.node?.lastProbeAt, item.lastCheckAt, item.lastSuccessfulProbeAt])), active = systems.reduce((total, item) => total + (typeof item.active === 'number' ? item.active : item.node?.currentWorkload ? 1 : 0), 0), supposedlyLive = systems.some(item => ['AVAILABLE', 'BUSY', 'DEGRADED'].includes(item.execution));
  let state: DashboardCharacterState = systems.length === 0 ? 'unknown' : pressure > 0 ? 'resource_pressure' : active > 0 ? 'working' : auth > 0 ? 'awaiting_operator' : offline > 0 && available === 0 ? 'offline' : unknown === systems.length ? 'unknown' : 'idle';
  if (supposedlyLive && isStale(updatedAt, nowMs, staleAfterMs)) state = 'stale';
  const reason = state === 'stale' ? 'The last readiness observation is stale; no failure is inferred.' : first(systems.filter(item => item.execution !== 'AVAILABLE').map(item => item.blockingReason), state === 'idle' ? 'No resource pressure is reported.' : 'Canonical readiness and capacity observations selected this presentation.');
  const nextAction = auth ? 'Open Systems and resolve the recorded authentication requirement.' : state === 'offline' || state === 'stale' || state === 'resource_pressure' ? 'Open Systems for the source measurement and readiness blocker.' : 'Open Systems for current capacity and probe evidence.';
  const currentSystem = systems.find(item => item.node?.currentWorkload) ?? systems.find(item => ['BUSY', 'DEGRADED', 'OFFLINE', 'AUTH REQUIRED'].includes(item.execution));
  return makeCharacter(identities['resource-guardian'], {state, summary: `${available} available; ${busy} busy; ${degraded} degraded; ${offline} offline; ${unknown} unknown.`, reason, nextAction, counts: {active, queued: 0, waiting: busy, blocked: degraded + auth + offline, completed: available, failed: offline}, signals: compactSignals([signal('working', 'active workloads', active), signal('resource_pressure', 'pressure', pressure), signal('awaiting_operator', 'auth required', auth), signal('offline', 'offline', offline), signal('unknown', 'unknown', unknown)]), current: [currentSystem?.name ?? currentSystem?.id, currentSystem?.node?.currentWorkload].filter(Boolean).join(' · ') || null, elapsedMs: null, lastUpdatedAt: updatedAt, freshness: state === 'stale' ? 'stale' : updatedAt ? 'current' : 'unknown', instrumentation: {coverage: systems.length ? 'live' : 'unavailable', source: 'canonical Systems readiness and managed-node measurements', limitation: systems.length ? null : 'No machines, providers or services are configured.'}});
}

function qualityInspector(source: DashboardCharacterSource, nowMs: number, staleAfterMs: number): DashboardCharacterBase {
  const runs = [...(source.runs ?? []), ...(source.parameterizedRuns ?? [])], statuses = runs.map(item => item.status), steps = runs.flatMap(item => item.steps ?? []), stepStatuses = steps.map(item => item.status), lanePhases = (source.lanes ?? []).map(item => item.verification?.phase ?? '');
  const reviewing = count(statuses, new Set(['VERIFYING', 'VALIDATING'])) + count(stepStatuses, new Set(['VERIFYING'])) + lanePhases.filter(item => ['claimed', 'evidence_collected'].includes(item)).length, queued = count(statuses, new Set(['QUEUED', 'SCHEDULED', 'RUNNING', 'RESOLVING'])), cancelling = count(statuses, cancellationStates) + count(stepStatuses, cancellationStates), blocked = count(statuses, blockedStates) + count(stepStatuses, blockedStates), completed = count(statuses, new Set(['SUCCEEDED', 'SUCCEEDED_WITH_FINDINGS'])) + lanePhases.filter(item => ['verified', 'accepted'].includes(item)).length, failed = count(statuses, new Set(['FAILED', 'DEGRADED'])) + count(stepStatuses, new Set(['FAILED', 'TIMED_OUT'])), cancelled = count(statuses, new Set(['CANCELLED']));
  const activeRuns = runs.filter(item => activeStates.has(item.status) || item.steps?.some(step => activeStates.has(step.status))), updatedAt = latest(runs.map(runUpdatedAt));
  let state: DashboardCharacterState = reviewing > 0 ? 'reviewing' : cancelling > 0 ? 'cancelling' : blocked > 0 ? 'blocked' : failed > 0 ? 'failed' : cancelled > 0 ? 'cancelled' : completed > 0 ? 'completed' : queued > 0 ? 'queued' : 'idle';
  if (activeRuns.length && isStale(updatedAt, nowMs, staleAfterMs)) state = 'stale';
  const reason = state === 'stale' ? 'A non-terminal Run lacks a fresh authoritative update; failure is not inferred.' : first([...steps.map(item => item.waitingReason ?? item.error), ...runs.flatMap(item => item.errors ?? [])], reviewing ? 'Independent validation or evidence collection is active.' : 'No validation failure is currently recorded.');
  const nextAction = ['failed', 'blocked', 'stale'].includes(state) ? 'Open Run evidence and the exact failing or missing check.' : reviewing ? 'Open the active Run to follow verification evidence.' : 'Open Run History for durable validation evidence.';
  const currentRun = activeRuns[0];
  return makeCharacter(identities['quality-inspector'], {state, summary: reviewing ? `${reviewing} validation check${reviewing === 1 ? '' : 's'} active; ${failed} failed; ${blocked} blocked.` : `${completed} verified outcome${completed === 1 ? '' : 's'}; ${failed} failed; ${blocked} blocked.`, reason, nextAction, counts: {active: reviewing, queued, waiting: 0, blocked, completed, failed}, signals: compactSignals([signal('reviewing', 'validating', reviewing), signal('queued', 'awaiting checks', queued), signal('blocked', 'blocked', blocked), signal('failed', 'failed', failed), signal('completed', 'verified', completed)]), current: currentRun ? [currentRun.id, currentRun.modelRoute?.providerId, currentRun.modelRoute?.accountLabel, currentRun.modelRoute?.modelId].filter(Boolean).join(' · ') || null : null, elapsedMs: maximumElapsed(activeRuns.map(item => ageMs(item.startedAt ?? item.requestedAt, nowMs))), lastUpdatedAt: updatedAt, freshness: state === 'stale' ? 'stale' : updatedAt ? 'current' : 'unknown', instrumentation: {coverage: runs.length || lanePhases.some(Boolean) ? 'live' : 'unavailable', source: 'Run, step and independent verification state', limitation: runs.length || lanePhases.some(Boolean) ? null : 'No Run or verification evidence has been recorded.'}});
}

function runUpdatedAt(run: RunSource): string | null | undefined { return run.updatedAt ?? run.completedAt ?? run.endedAt ?? run.startedAt ?? run.requestedAt ?? run.recovery?.observedAt; }
function maximumElapsed(values: Array<number | null | undefined>): number | null { const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)); return finite.length ? Math.max(...finite) : null; }

function latestActiveHandoff(source: DashboardCharacterSource): TokenDecisionSource | null {
  const activeThreads = new Set((source.tokenRouting?.threads ?? []).filter(item => item.active).map(item => item.id));
  const latestByThread = new Map<string, TokenDecisionSource>();
  for (const decision of [...(source.tokenRouting?.decisions ?? [])].reverse()) {
    if (decision.action !== 'BATON_AND_HANDOFF' || !activeThreads.has(decision.threadId) || latestByThread.has(decision.threadId)) continue;
    latestByThread.set(decision.threadId, decision);
  }
  return [...latestByThread.values()].filter(item => item.outcome === 'RECORDED').sort((left, right) => (timestamp(right.at) ?? 0) - (timestamp(left.at) ?? 0))[0] ?? null;
}

const runningStepStates = new Set(['DISPATCHED', 'RUNNING', 'VERIFYING']);
const waitingStepStates = new Set(['WAITING_FOR_WORKER', 'WAITING_FOR_DEPENDENCY', 'WAITING_FOR_RESOURCE', 'WAITING_FOR_APPROVAL', 'AUTHENTICATION_BLOCKED']);

function allRuns(source: DashboardCharacterSource): RunSource[] { return [...(source.runs ?? []), ...(source.parameterizedRuns ?? [])]; }
function clean(value: unknown, fallback = ''): string { return typeof value === 'string' && value.trim() ? value.trim().replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, 512) : fallback; }
function eventSource(type: string, id: string | number | null | undefined, at: string | null | undefined, detail: string): DashboardActivitySource { return {authority: 'Agent Control', type, id: id === null || id === undefined ? null : String(id), at: at ?? null, detail: clean(detail, 'No additional detail was recorded.')}; }
function noneSource(detail = 'No active authoritative activity is recorded.'): DashboardActivitySource { return eventSource('none', null, null, detail); }

export function classifyDashboardTool(input: {action?: string | null; resources?: string[]; capabilities?: string[]}): DashboardToolProjection | null {
  const action = clean(input.action), capabilities = (input.capabilities ?? []).map(value => clean(value)).filter(Boolean), resources = (input.resources ?? []).map(value => clean(value)).filter(Boolean);
  const haystack = [action, ...capabilities, ...resources].join(' ').toLowerCase();
  if (!haystack) return null;
  let kind: DashboardToolKind = 'GENERIC_TOOL', label = 'governed tool';
  if (/(?:model[-_. ]?(?:discover|catalog|probe)|provider[-_. ]?(?:discover|catalog)|callability)/.test(haystack)) { kind = 'MODEL_DISCOVERY'; label = 'model discovery'; }
  else if (/(?:voice|microphone|speech|audio|tts|stt)/.test(haystack)) { kind = 'VOICE'; label = 'voice tool'; }
  else if (/(?:social|whatsapp|openwa|message|publish|post\b)/.test(haystack)) { kind = 'SOCIAL'; label = 'social tool'; }
  else if (/(?:ssh|remote|powershell|managed[-_. ]?node|node[-_. ]?(?:exec|action)|adb|transport)/.test(haystack)) { kind = 'REMOTE_MACHINE'; label = 'remote machine'; }
  else if (/(?:browser|chrome|playwright|web[-_. ]?(?:open|click|navigate)|screenshot)/.test(haystack)) { kind = 'WEB_BROWSER'; label = 'browser'; }
  else if (/(?:benchmark|test\b|verify|lint|typecheck|build\b|qualification[-_. ]?(?:test|verify|benchmark|smoke))/.test(haystack)) { kind = 'BENCHMARK'; label = 'test or benchmark'; }
  else if (/(?:apply[-_. ]?patch|code[-_. ]?edit|edit\b|write\b|format\b|mutation)/.test(haystack)) { kind = 'CODE_EDIT'; label = 'code editor'; }
  else if (/(?:search|ripgrep|\brg\b|grep|find\b|retriev|lookup)/.test(haystack)) { kind = 'SEARCH'; label = 'search'; }
  else if (/(?:file|read\b|inspect|repository|artifact|document)/.test(haystack)) { kind = 'FILE'; label = 'file reader'; }
  return {kind, label, action: action || capabilities[0] || resources[0] || 'governed-tool', capabilities};
}

function currentStep(run: RunSource | undefined): RunStepSource | null {
  if (!run) return null;
  const steps = run.steps ?? [];
  return steps.find(step => runningStepStates.has(step.status.toUpperCase()))
    ?? steps.find(step => waitingStepStates.has(step.status.toUpperCase()))
    ?? [...steps].sort((left, right) => (timestamp(right.endedAt ?? right.startedAt) ?? 0) - (timestamp(left.endedAt ?? left.startedAt) ?? 0))[0]
    ?? null;
}

function stepCapabilities(step: RunStepSource | null): string[] { return step?.capabilityRequest?.requires?.map(item => clean(item.id)).filter(Boolean) ?? []; }
function runForStage(source: DashboardCharacterSource, stage: ParcelStageSource | undefined): RunSource | undefined { return stage?.runId ? allRuns(source).find(run => run.id === stage.runId) : undefined; }
function activeStage(source: DashboardCharacterSource): {parcel: ParcelSource; stage: ParcelStageSource; run?: RunSource; step: RunStepSource | null} | null {
  const values = (source.parcels ?? []).flatMap(parcel => parcel.stages.filter(stage => ['RUNNING', 'WAITING'].includes(stage.status.toUpperCase())).map(stage => ({parcel, stage, run: runForStage(source, stage)})));
  values.sort((left, right) => {
    const statusDifference = Number(right.stage.status.toUpperCase() === 'RUNNING') - Number(left.stage.status.toUpperCase() === 'RUNNING');
    return statusDifference || (timestamp(right.stage.startedAt ?? right.parcel.updatedAt) ?? 0) - (timestamp(left.stage.startedAt ?? left.parcel.updatedAt) ?? 0);
  });
  const selected = values[0]; return selected ? {...selected, step: currentStep(selected.run)} : null;
}

function recentEvent(source: DashboardCharacterSource, nowMs: number, types: string[]): ControlEventSource | null {
  return [...(source.events ?? [])].reverse().find(event => types.includes(event.type) && (timestamp(event.at) ?? -Infinity) >= nowMs - DASHBOARD_CHARACTER_ACTIVITY_RECENT_MS) ?? null;
}

function activityFromTool(tool: DashboardToolProjection | null): DashboardCharacterActivity {
  if (!tool) return 'CARRYING_PARCEL';
  if (tool.kind === 'SEARCH' || tool.kind === 'WEB_BROWSER') return 'SEARCHING';
  if (tool.kind === 'CODE_EDIT') return 'CODING';
  if (tool.kind === 'FILE') return 'READING';
  if (tool.kind === 'REMOTE_MACHINE') return 'REMOTE_EXECUTION';
  if (tool.kind === 'BENCHMARK') return 'BENCHMARKING';
  if (tool.kind === 'MODEL_DISCOVERY') return 'MODEL_DISCOVERY';
  return 'USING_TOOL';
}

function activityFor(id: DashboardCharacterId, source: DashboardCharacterSource, base: DashboardCharacterBase, nowMs: number): DashboardActivityProjection {
  const runs = allRuns(source), activeRuns = runs.filter(run => activeStates.has(run.status.toUpperCase()) || run.steps?.some(step => runningStepStates.has(step.status.toUpperCase()))), selectedStage = activeStage(source), handoff = latestActiveHandoff(source);
  if (base.state === 'stale') return {kind: 'NONE', label: 'stale observation retained', source: eventSource('stale-observation', null, base.lastUpdatedAt, base.reason), tool: null};
  if (id === 'lane-master') {
    if (handoff) return {kind: 'ROUTING', label: `governing handoff for ${handoff.parcelId}`, source: eventSource('token-routing-decision', handoff.id ?? handoff.threadId, handoff.at, handoff.reason ?? 'Recorded governed handoff'), tool: null};
    if (activeRuns.length) { const run = activeRuns[0]; return {kind: 'ROUTING', label: `dispatching ${activeRuns.length} active execution${activeRuns.length === 1 ? '' : 's'}`, source: eventSource('job-run', run.id ?? run.jobId ?? null, runUpdatedAt(run), `Run ${run.id ?? 'unknown'} is ${run.status}`), tool: null}; }
    if (base.counts.queued) return {kind: 'PLANNING', label: `scheduling ${base.counts.queued} queued item${base.counts.queued === 1 ? '' : 's'}`, source: eventSource('scheduler', null, base.lastUpdatedAt, base.summary), tool: null};
  }
  if (id === 'prompt-reviewer') {
    const parcel = (source.parcels ?? []).find(item => item.status === 'PLANNING') ?? (source.parcels ?? []).find(item => item.context?.questions?.some(question => question.status === 'OPEN'));
    if (parcel) return {kind: parcel.context?.questions?.some(question => question.status === 'OPEN') ? 'WAITING' : 'PLANNING', label: parcel.status === 'PLANNING' ? `reviewing ${parcel.id}` : `waiting on ${parcel.id}`, source: eventSource('work-parcel', parcel.id, parcel.updatedAt, parcel.objective ?? `Parcel ${parcel.id} is ${parcel.status}`), tool: null};
  }
  if (id === 'parcel-coordinator') {
    if (handoff) return {kind: 'PASSING_BATON', label: `passing sealed baton for ${handoff.parcelId}`, source: eventSource('token-routing-decision', handoff.id ?? handoff.threadId, handoff.at, handoff.reason ?? 'Recorded governed handoff'), tool: null};
    if (selectedStage) {
      const tool = classifyDashboardTool({action: selectedStage.step?.action, resources: selectedStage.step?.resources, capabilities: stepCapabilities(selectedStage.step)});
      const detail = selectedStage.step ? `Run ${selectedStage.run?.id ?? 'unknown'} records ${selectedStage.step.action ?? 'a governed action'} as ${selectedStage.step.status}` : `Stage ${selectedStage.stage.id ?? selectedStage.stage.name ?? 'unknown'} is ${selectedStage.stage.status}`;
      return {kind: activityFromTool(tool), label: `${tool ? `${tool.label} · ` : ''}${selectedStage.stage.name ?? selectedStage.stage.id ?? selectedStage.parcel.id}`, source: eventSource(selectedStage.step ? 'job-step' : 'work-parcel-stage', selectedStage.step?.id ?? selectedStage.stage.id ?? selectedStage.parcel.id, selectedStage.step?.startedAt ?? selectedStage.stage.startedAt ?? selectedStage.parcel.updatedAt, detail), tool};
    }
  }
  if (id === 'model-scout') {
    const event = recentEvent(source, nowMs, ['provider.catalog_changed', 'model.intelligence_changed']);
    if (event) {
      const rawAction = clean(event.payload?.action ?? event.payload?.phase ?? event.payload?.status ?? event.payload?.state ?? event.type, event.type);
      const action = event.type === 'model.intelligence_changed' && !/(?:model|evaluat|routing)/i.test(rawAction) ? `evaluation-${rawAction}` : rawAction;
      const provider = clean(event.payload?.providerId), model = clean(event.payload?.canonicalModelId ?? event.payload?.modelId);
      const tool = classifyDashboardTool({action: `model discovery ${action}`, capabilities: ['model.discovery']})!;
      return {kind: /(?:smoke|test|evaluat|benchmark)/i.test(action) ? 'BENCHMARKING' : /routing/i.test(action) ? 'ROUTING' : 'MODEL_DISCOVERY', label: [action.replaceAll('-', ' '), provider, model].filter(Boolean).join(' · '), source: eventSource(event.type, event.id, event.at, `Recorded ${event.type} action ${action}`), tool};
    }
    const batch = (source.modelBatches ?? []).find(item => item.status === 'RUNNING');
    if (batch) { const tool = classifyDashboardTool({action: 'model benchmark qualification'})!; return {kind: 'BENCHMARKING', label: `evaluating ${batch.id ?? 'model batch'}`, source: eventSource('model-evaluation-batch', batch.id ?? null, batch.startedAt ?? batch.createdAt, `Batch ${batch.id ?? 'unknown'} is RUNNING`), tool}; }
  }
  if (id === 'resource-guardian') {
    if (selectedStage) {
      const tool = classifyDashboardTool({action: selectedStage.step?.action, resources: selectedStage.step?.resources, capabilities: stepCapabilities(selectedStage.step)});
      if (tool?.kind === 'REMOTE_MACHINE') return {kind: 'REMOTE_EXECUTION', label: `watching ${tool.label} for ${selectedStage.stage.name ?? selectedStage.stage.id ?? selectedStage.parcel.id}`, source: eventSource('job-step', selectedStage.step?.id ?? selectedStage.stage.id ?? null, selectedStage.step?.startedAt ?? selectedStage.stage.startedAt, `Remote execution is recorded by ${selectedStage.step?.action ?? 'the active stage'}`), tool};
    }
    const system = (source.systems ?? []).find(item => item.node?.currentWorkload || ['BUSY', 'DEGRADED'].includes(item.execution));
    if (system) return {kind: 'MONITORING_RESOURCES', label: `monitoring ${system.name ?? system.id ?? 'system'}`, source: eventSource('system-readiness', system.id ?? null, system.node?.lastProbeAt ?? system.lastCheckAt, system.blockingReason ?? system.node?.currentWorkload ?? `System is ${system.execution}`), tool: null};
  }
  if (id === 'quality-inspector') {
    const run = runs.find(item => item.status.toUpperCase() === 'VERIFYING' || item.steps?.some(step => step.status.toUpperCase() === 'VERIFYING'));
    if (run) { const step = currentStep(run), tool = classifyDashboardTool({action: step?.action ?? 'verification', resources: step?.resources, capabilities: stepCapabilities(step)}); return {kind: 'VERIFYING', label: `verifying ${run.id ?? run.jobId ?? 'run'}`, source: eventSource('job-run', run.id ?? run.jobId ?? null, step?.startedAt ?? runUpdatedAt(run), `Run ${run.id ?? 'unknown'} is ${run.status}`), tool}; }
    const verification = recentEvent(source, nowMs, ['verification.changed']);
    if (verification) return {kind: 'REVIEWING_OUTPUT', label: 'reviewing recorded verification', source: eventSource(verification.type, verification.id, verification.at, 'A verification state change was recorded'), tool: classifyDashboardTool({action: 'verification'})};
  }
  if (base.state === 'recovering') return {kind: 'RECOVERING', label: 'recovering recorded execution', source: eventSource('recovery', null, base.lastUpdatedAt, base.reason), tool: null};
  if (['waiting', 'awaiting_operator', 'blocked', 'resource_pressure'].includes(base.state)) return {kind: 'WAITING', label: base.stateLabel.toLowerCase(), source: eventSource('operational-state', null, base.lastUpdatedAt, base.reason), tool: null};
  return {kind: 'NONE', label: 'no active work', source: noneSource(base.reason), tool: null};
}

function operationalState(base: DashboardCharacterBase, activity: DashboardActivityProjection): DashboardOperationalState {
  if (base.state === 'failed') return 'FAILED';
  if (base.state === 'cancelled') return 'CANCELLED';
  if (base.state === 'completed') return 'SUCCEEDED';
  if (base.state === 'recovering') return 'RECOVERING';
  if (['blocked', 'cancelling'].includes(base.state)) return 'PAUSED';
  if (['stale', 'unknown', 'offline'].includes(base.state)) return 'UNKNOWN';
  if (activity.kind === 'PLANNING') return 'PLANNING';
  if (['ROUTING', 'PASSING_BATON'].includes(activity.kind)) return 'ROUTING';
  if (['VERIFYING', 'REVIEWING_OUTPUT'].includes(activity.kind)) return 'VERIFYING';
  if (activity.kind === 'WAITING') return 'WAITING';
  if (activity.kind === 'RECOVERING') return 'RECOVERING';
  if (activity.kind !== 'NONE') return 'EXECUTING';
  if (base.state === 'queued') return 'PLANNING';
  if (base.state === 'waiting' || base.state === 'awaiting_operator' || base.state === 'resource_pressure') return 'WAITING';
  return 'IDLE';
}

function animationExpression(base: DashboardCharacterBase, activity: DashboardActivityProjection): DashboardAnimationExpression {
  const byActivity: Partial<Record<DashboardCharacterActivity, DashboardAnimationExpression>> = {PLANNING: 'THINKING', ROUTING: 'THINKING', CARRYING_PARCEL: 'CARRYING_PARCEL', CODING: 'TYPING', SEARCHING: 'SEARCHING', READING: 'INSPECTING', USING_TOOL: 'USING_TOOL', REMOTE_EXECUTION: 'NETWORKING', BENCHMARKING: 'TESTING', MODEL_DISCOVERY: 'SEARCHING', REVIEWING_OUTPUT: 'INSPECTING', PASSING_BATON: 'CARRYING_PARCEL', VERIFYING: 'INSPECTING', MONITORING_RESOURCES: 'INSPECTING', WAITING: 'WAITING', RECOVERING: 'RETRYING'};
  if (base.state === 'completed') return 'SUCCESS_ACKNOWLEDGEMENT';
  if (['failed', 'blocked', 'resource_pressure'].includes(base.state)) return 'CONCERNED';
  if (['offline', 'stale', 'unknown', 'cancelled'].includes(base.state)) return 'STILL';
  if (activity.kind !== 'NONE') return byActivity[activity.kind] ?? 'WORKING';
  if (base.state === 'idle') return 'AMBIENT_IDLE';
  return 'WORKING';
}

function narrationFor(base: DashboardCharacterBase, activity: DashboardActivityProjection): DashboardNarrationProjection {
  const active = activity.kind !== 'NONE';
  const text = active ? `${base.name} is ${activity.label}.` : base.state === 'idle' ? `${base.name} is available and has no recorded active work.` : `${base.name} reports ${base.stateLabel.toLowerCase()}: ${base.summary}`;
  return {id: `${base.id}:${activity.source.type}:${activity.source.id ?? 'none'}:${base.transitionKey}`, characterId: base.id, text, detail: activity.source.detail, source: activity.source};
}

function enrichCharacter(base: DashboardCharacterBase, source: DashboardCharacterSource, nowMs: number): DashboardCharacterProjection {
  const activity = activityFor(base.id, source, base, nowMs), operational = operationalState(base, activity), expression = animationExpression(base, activity), narration = narrationFor(base, activity);
  return {...base, operationalState: operational, activity, animationCue: {expression, label: expression.toLowerCase().replaceAll('_', ' '), authority: 'presentation-only', sourceType: activity.source.type}, narration, transitionKey: `${base.transitionKey}:${operational}:${activity.kind}:${activity.source.id ?? 'none'}`};
}

function routeProjection(input: {providerId?: string; provider?: string; accountLabel?: string | null; accountProfileId?: string | null; accountProfile?: string; modelId?: string; model?: string; providerExecutionNodeId?: string; nodeId?: string; workers?: string[]} | undefined): DashboardRouteProjection | null {
  if (!input) return null;
  const provider = clean(input.providerId ?? input.provider), model = clean(input.modelId ?? input.model), account = clean(input.accountLabel ?? input.accountProfileId ?? input.accountProfile) || null, node = clean(input.providerExecutionNodeId ?? input.nodeId) || null, workers = [...new Set((input.workers ?? []).map(value => clean(value)).filter(Boolean))];
  if (!provider && !model && !account && !node && workers.length) return {provider: 'Agent Control', account: null, model: 'governed Job worker', node: workers.length === 1 ? workers[0] : null, label: `${workers.length === 1 ? 'Worker' : 'Workers'} ${workers.join(' + ')}`};
  if (!provider && !model && !account && !node) return null;
  return {provider: provider || 'unreported-provider', account, model: model || 'unreported-model', node, label: [provider || 'unreported-provider', account, model || 'unreported-model', node ? `@ ${node}` : ''].filter(Boolean).join(' / ')};
}

function workflowEndpoint(label: string): DashboardRouteProjection { return {provider: 'Agent Control', account: null, model: 'Work Parcel', node: null, label}; }
function stageRoute(stage: ParcelStageSource | undefined, source: DashboardCharacterSource): DashboardRouteProjection | null {
  if (!stage) return null;
  return routeProjection(stage.actualRoute) ?? routeProjection({workers: runForStage(source, stage)?.selectedWorkers});
}
function stageSetRoute(stages: ParcelStageSource[], source: DashboardCharacterSource): DashboardRouteProjection | null {
  const routes = stages.map(stage => stageRoute(stage, source)).filter((route): route is DashboardRouteProjection => route !== null);
  if (routes.length <= 1) return routes[0] ?? null;
  return workflowEndpoint(routes.map(route => route.label).join(' + '));
}
function stageTool(source: DashboardCharacterSource, stage: ParcelStageSource): DashboardToolProjection | null { const step = currentStep(runForStage(source, stage)); return classifyDashboardTool({action: step?.action, resources: step?.resources, capabilities: stepCapabilities(step)}); }

function journeyCharacter(type: string): DashboardCharacterId {
  if (/(?:goal|plan|planning|question|steering)/.test(type)) return 'prompt-reviewer';
  if (/(?:route|model|provider)/.test(type)) return 'model-scout';
  if (/(?:target|readiness|node|approval)/.test(type)) return 'resource-guardian';
  if (/(?:verification|criterion|test)/.test(type)) return 'quality-inspector';
  if (/(?:stage|tool|invocation|baton|context|retriev)/.test(type)) return 'parcel-coordinator';
  return 'lane-master';
}

function parcelJourney(parcel: ParcelSource): DashboardParcelJourneyProjection[] {
  const context = (parcel.context?.events ?? []).map(event => ({id: event.id, at: event.at, type: event.type, summary: clean(event.summary, event.type), characterId: journeyCharacter(event.type), stageId: event.stageId ?? null}));
  const audit = (parcel.audit?.timeline ?? []).map((event, index) => ({id: event.id ?? `audit:${parcel.id}:${index}`, at: event.at, type: event.type, summary: clean(event.summary ?? event.detail, event.type), characterId: journeyCharacter(event.type), stageId: event.stageId ?? null}));
  return [...context, ...audit].sort((left, right) => (timestamp(left.at) ?? 0) - (timestamp(right.at) ?? 0)).filter((event, index, values) => index === 0 || event.id !== values[index - 1].id).slice(-18);
}

function parcelOwner(parcel: ParcelSource, source: DashboardCharacterSource, journey: DashboardParcelJourneyProjection[]): {id: DashboardCharacterId; reason: string} {
  const active = parcel.stages.find(stage => ['RUNNING', 'WAITING'].includes(stage.status.toUpperCase())), run = runForStage(source, active);
  if (parcel.status === 'PLANNING') return {id: 'prompt-reviewer', reason: 'The authoritative Parcel status is PLANNING.'};
  if (parcel.status === 'QUEUED') return {id: 'lane-master', reason: 'The authoritative Parcel status is QUEUED for dispatch.'};
  if (run?.status.toUpperCase() === 'VERIFYING' || run?.steps?.some(step => step.status.toUpperCase() === 'VERIFYING')) return {id: 'quality-inspector', reason: `Run ${run.id ?? 'unknown'} is in verification.`};
  if (active) return {id: 'parcel-coordinator', reason: `Stage ${active.name ?? active.id ?? 'unknown'} is ${active.status}.`};
  if (parcel.status === 'WAITING') return {id: 'parcel-coordinator', reason: 'The authoritative Parcel status is WAITING.'};
  if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(parcel.status)) return {id: 'quality-inspector', reason: `The authoritative Parcel status is ${parcel.status}.`};
  const latestEvent = journey.at(-1); return latestEvent ? {id: latestEvent.characterId, reason: `Latest durable event: ${latestEvent.summary}`} : {id: 'lane-master', reason: 'No finer-grained owner is recorded.'};
}

function projectParcels(source: DashboardCharacterSource): DashboardParcelProjection[] {
  const names = Object.fromEntries(Object.values(identities).map(identity => [identity.id, identity.name]));
  return [...(source.parcels ?? [])].sort((left, right) => (timestamp(right.updatedAt) ?? 0) - (timestamp(left.updatedAt) ?? 0)).map(parcel => {
    const journey = parcelJourney(parcel), owner = parcelOwner(parcel, source, journey), statuses = parcel.stages.map(stage => stage.status.toUpperCase()), active = statuses.filter(status => status === 'RUNNING').length, waiting = statuses.filter(status => ['QUEUED', 'WAITING', 'BLOCKED'].includes(status)).length, failed = statuses.filter(status => status === 'FAILED').length, completed = statuses.filter(status => status === 'SUCCEEDED').length;
    const activeRoute = stageRoute(parcel.stages.find(stage => ['RUNNING', 'WAITING'].includes(stage.status.toUpperCase())), source) ?? stageRoute([...parcel.stages].reverse().find(stage => stage.actualRoute), source);
    const stages = parcel.stages.map(stage => { const run = runForStage(source, stage), tool = stageTool(source, stage); return {id: stage.id ?? 'unreported-stage', name: stage.name ?? stage.id ?? 'Unnamed stage', status: stage.status, dependencies: [...(stage.dependsOn ?? [])], runId: stage.runId ?? null, worker: stage.actualRoute?.workers?.[0] ?? run?.selectedWorkers?.[0] ?? null, route: stageRoute(stage, source)?.label ?? null, tool}; });
    const operational: DashboardOperationalState = parcel.status === 'PLANNING' ? 'PLANNING' : parcel.status === 'QUEUED' ? 'ROUTING' : parcel.status === 'RUNNING' ? 'EXECUTING' : parcel.status === 'WAITING' ? 'WAITING' : parcel.status === 'SUCCEEDED' ? 'SUCCEEDED' : parcel.status === 'FAILED' ? 'FAILED' : 'CANCELLED';
    return {id: parcel.id ?? 'unreported-parcel', objective: clean(parcel.objective, 'Objective not projected'), status: parcel.status, operationalState: operational, owner: owner.id, ownerReason: owner.reason, narration: `${names[owner.id]} owns the visible step because ${owner.reason.charAt(0).toLowerCase()}${owner.reason.slice(1)}`, progress: {completed, active, waiting, failed, total: statuses.length}, parallelActive: active, route: activeRoute?.label ?? parcel.context?.active?.currentRoute ?? null, updatedAt: parcel.updatedAt, transitionKey: [parcel.id ?? 'unreported-parcel', parcel.status, parcel.updatedAt, ...statuses].join(':'), stages, journey};
  });
}

function batonTransfers(source: DashboardCharacterSource): DashboardBatonTransferProjection[] {
  const transfers: DashboardBatonTransferProjection[] = [];
  const decisions = source.tokenRouting?.decisions ?? [], latestTokenDecision = new Map<string, TokenDecisionSource>();
  for (const decision of decisions) { const previous = latestTokenDecision.get(decision.threadId); if (!previous || (timestamp(decision.at) ?? 0) >= (timestamp(previous.at) ?? 0)) latestTokenDecision.set(decision.threadId, decision); }
  for (const decision of decisions) {
    if (decision.action !== 'BATON_AND_HANDOFF') continue;
    const thread = (source.tokenRouting?.threads ?? []).find(item => item.id === decision.threadId), from = routeProjection(thread), to = routeProjection(decision.target), reason = clean(decision.reason, 'No routing reason was recorded.');
    const destinationActive = (source.tokenRouting?.threads ?? []).some(item => item.active && item.providerId === decision.target?.providerId && item.modelId === decision.target?.modelId && (item.accountProfileId ?? null) === (decision.target?.accountProfileId ?? null) && (item.providerExecutionNodeId ?? item.nodeId ?? null) === (decision.target?.providerExecutionNodeId ?? decision.target?.nodeId ?? null));
    const triggerKind=clean(decision.trigger?.kind)||null,triggerCode=clean(decision.trigger?.code)||null,triggerReason=clean(decision.trigger?.reason)||null,trigger=triggerKind==='QUALITY_GATE'?`Independent quality gate ${triggerCode??'unreported'} triggered`:triggerKind==='PROVIDER_FAILURE'?`Authoritative provider-failure classification ${triggerCode??'unreported'} triggered`:triggerKind==='CONTEXT_PRESSURE'?`Context governor ${triggerCode??'assessment'} triggered`:'Recorded routing policy triggered';
    transfers.push({id: decision.id ?? `token:${decision.threadId}:${decision.at}`, at: decision.at, parcelId: decision.parcelId, sourceType: 'token-routing', sourceEventId: decision.id ?? decision.threadId, batonId: decision.batonId ?? null, from, to, outcome: decision.outcome, active: latestTokenDecision.get(decision.threadId) === decision && decision.outcome === 'RECORDED' && Boolean(thread?.active || destinationActive), reason, explanation: `${trigger}${triggerReason?`: ${triggerReason}`:''}. ${decision.outcome.toLowerCase()} routing for ${from?.label ?? 'the source route'} → ${to?.label ?? 'the governed destination'}: ${reason}`, contextPercent: typeof decision.contextPercent === 'number' ? decision.contextPercent : null,triggerKind,triggerCode,triggerReason});
  }
  for (const parcel of source.parcels ?? []) {
    const views = parcel.context?.batonViews ?? [];
    for (const baton of views) {
      const target = parcel.stages.find(stage => stage.id === baton.targetStageId), sourceStages = parcel.stages.filter(stage => baton.sourceStageIds?.includes(stage.id ?? '')), event = [...(parcel.context?.events ?? [])].reverse().find(item => item.type === 'baton.created' && (item.detail?.batonId === baton.id || item.at === baton.createdAt)), reason = clean(baton.nextAction ?? event?.summary, 'Continue the recorded downstream stage.'), outcome = target?.status ?? 'CREATED';
      const recentlyCreated = (timestamp(baton.createdAt) ?? -Infinity) >= (timestamp(source.observedAt) ?? Date.now()) - DASHBOARD_CHARACTER_ACTIVITY_RECENT_MS;
      const from = stageSetRoute(sourceStages, source) ?? workflowEndpoint('Work Parcel intake'), to = stageRoute(target, source) ?? workflowEndpoint(target ? `Governed stage ${target.name ?? target.id ?? 'unreported'}` : 'Next governed stage'), sourceDescription = sourceStages.map(stage => stage.name ?? stage.id).filter(Boolean).join(' + ') || 'recorded predecessor work';
      transfers.push({id: `parcel:${baton.id}`, at: baton.createdAt, parcelId: parcel.id ?? 'unreported-parcel', sourceType: 'work-parcel', sourceEventId: event?.id ?? `baton-view:${baton.id}`, batonId: baton.id, from, to, outcome, active: Boolean(target && (['QUEUED', 'WAITING'].includes(target.status) || (target.status === 'RUNNING' && recentlyCreated))), reason, explanation: `Sealed Parcel baton ${baton.id} carries ${sourceDescription} → ${target?.name ?? target?.id ?? 'the next governed stage'}: ${reason}`, contextPercent: null,triggerKind:'WORK_PARCEL_DEPENDENCY',triggerCode:null,triggerReason:null});
    }
    if (!views.length) for (const event of parcel.audit?.timeline?.filter(item => item.type === 'baton.created') ?? []) {
      const stage = parcel.stages.find(item => item.id === event.stageId), reason = clean(event.detail ?? event.summary, 'A Work Parcel baton was recorded.');
      transfers.push({id: `parcel-audit:${event.id ?? `${parcel.id ?? 'unreported-parcel'}:${event.at}`}`, at: event.at, parcelId: parcel.id ?? 'unreported-parcel', sourceType: 'work-parcel', sourceEventId: event.id ?? `${parcel.id ?? 'unreported-parcel'}:${event.at}`, batonId: stage?.baton?.id ?? null, from: workflowEndpoint('Work Parcel intake'), to: stageRoute(stage, source) ?? workflowEndpoint(stage ? `Governed stage ${stage.name ?? stage.id ?? 'unreported'}` : 'Next governed stage'), outcome: stage?.status ?? 'CREATED', active: Boolean(stage && ['QUEUED', 'WAITING', 'RUNNING'].includes(stage.status)), reason, explanation: `Agent Control recorded a Work Parcel baton${stage ? ` for ${stage.name ?? stage.id}` : ''}: ${reason}`, contextPercent: null,triggerKind:'WORK_PARCEL_DEPENDENCY',triggerCode:null,triggerReason:null});
    }
  }
  for (const event of (source.events ?? []).filter(item => item.type === 'lane.handoff')) {
    const fromId = typeof event.payload?.fromId === 'number' || typeof event.payload?.fromId === 'string' ? String(event.payload.fromId) : 'unreported', toId = typeof event.payload?.toId === 'number' || typeof event.payload?.toId === 'string' ? String(event.payload.toId) : 'unreported', holder = clean(event.payload?.holder, 'recorded holder'), reason = `Lane baton holder ${holder} moved from Lane ${fromId} to Lane ${toId}.`, recent = (timestamp(event.at) ?? -Infinity) >= (timestamp(source.observedAt) ?? Date.now()) - DASHBOARD_CHARACTER_ACTIVITY_RECENT_MS;
    transfers.push({id: `lane:${event.id}`, at: event.at, parcelId: `lane:${toId}`, sourceType: 'lane', sourceEventId: String(event.id), batonId: null, from: {provider: 'Agent Control', account: null, model: `Lane ${fromId}`, node: null, label: `Lane ${fromId}`}, to: {provider: 'Agent Control', account: null, model: `Lane ${toId}`, node: null, label: `Lane ${toId}`}, outcome: 'RECORDED', active: recent, reason, explanation: `Agent Control recorded a lane handoff: ${reason}`, contextPercent: null,triggerKind:'LANE_HANDOFF',triggerCode:null,triggerReason:null});
  }
  return transfers.sort((left, right) => (timestamp(right.at) ?? 0) - (timestamp(left.at) ?? 0)).slice(0, 24);
}

function modelActivity(source: DashboardCharacterSource): DashboardModelActivityProjection[] {
  return (source.events ?? []).filter(event => ['provider.catalog_changed', 'model.intelligence_changed'].includes(event.type)).map(event => {
    const payload = event.payload ?? {}, action = clean(payload.action ?? payload.phase ?? payload.status ?? payload.state ?? event.type, event.type), provider = clean(payload.providerId) || null, model = clean(payload.canonicalModelId ?? payload.modelId ?? payload.routeKey) || null, status = clean(payload.status ?? payload.inferenceEndpointStatus ?? payload.state) || null, failure = clean(payload.failureClass) || (/fail/i.test(action) ? action : null), httpStatus = typeof payload.inferenceEndpointStatus === 'number' ? payload.inferenceEndpointStatus : typeof payload.httpStatus === 'number' ? payload.httpStatus : null;
    const routingEligible = typeof payload.routingEligible === 'boolean' ? payload.routingEligible : action === 'routing-enabled' ? true : action === 'routing-disabled' ? false : null;
    const explanation = action === 'discovering' ? `Agent Control is discovering the ${provider ?? 'recorded'} provider catalogue.` : action === 'discovered' ? `Agent Control recorded provider catalogue discovery${typeof payload.models === 'number' ? ` for ${payload.models} model(s)` : ''}.` : action === 'callability-testing' ? `Agent Control is testing whether ${model ?? 'the recorded model'} accepts a bounded call.` : action === 'callability-tested' ? `Callability finished with ${status ?? 'an unreported status'}${failure ? ` (${failure})` : ''}.` : action === 'routing-disabled' ? `Automatic routing is explicitly disabled for ${model ?? 'the recorded model'}.` : action === 'routing-enabled' ? `Automatic routing is explicitly enabled for ${model ?? 'the recorded model'}.` : `Agent Control recorded ${action.replaceAll('-', ' ')}${status ? `: ${status}` : ''}.`;
    return {id: `event:${event.id}`, at: event.at, provider, model, action, status, failure, httpStatus, routingEligible, explanation};
  }).sort((left, right) => (timestamp(right.at) ?? 0) - (timestamp(left.at) ?? 0)).slice(0, 24);
}

interface ActivityIndicatorInput {
  id: DashboardActivityIndicatorProjection['id'];
  groupId: DashboardActivityIndicatorProjection['groupId'];
  label: string;
  shape: DashboardActivityIndicatorShape;
  active?: boolean;
  failed?: boolean;
  disconnected?: boolean;
  unknown?: boolean;
  count?: number | null;
  at?: string | null;
  event?: ControlEventSource | null;
  laneId?: string | number | null;
  provider?: string | null;
  model?: string | null;
  explanation: string;
  source: string;
  meaning: string;
  persistence: string;
  staleBehavior: string;
}

function latestControlEvent(source: DashboardCharacterSource, types: string[]) {
  return [...(source.events ?? [])].filter(event => types.includes(event.type)).sort((left, right) => (timestamp(right.at) ?? 0) - (timestamp(left.at) ?? 0))[0] ?? null;
}

function indicatorState(input: ActivityIndicatorInput, nowMs: number): DashboardActivityIndicatorState {
  if (input.disconnected) return 'DISCONNECTED';
  if (input.failed) return 'FAILED';
  if (input.unknown) return 'UNKNOWN';
  const at = timestamp(input.at ?? input.event?.at);
  if (input.active) return at !== null && nowMs - at >= DASHBOARD_CHARACTER_STALE_AFTER_MS ? 'STALE' : 'ACTIVE';
  if (at !== null && nowMs - at < DASHBOARD_CHARACTER_ACTIVITY_RECENT_MS) return 'RECENT';
  return 'IDLE';
}

function activityIndicator(input: ActivityIndicatorInput, nowMs: number): DashboardActivityIndicatorProjection {
  const event = input.event ?? null, payload = event?.payload ?? {}, at = input.at ?? event?.at ?? null;
  return {
    id: input.id, groupId: input.groupId, label: input.label, shape: input.shape, state: indicatorState(input, nowMs), count: input.count ?? null, at,
    eventType: event?.type ?? input.source, eventId: event ? String(event.id) : null,
    laneId: clean(input.laneId ?? event?.laneId) || null,
    provider: clean(input.provider ?? payload.providerId) || null,
    model: clean(input.model ?? payload.modelId ?? payload.canonicalModelId) || null,
    explanation: input.explanation, source: input.source, meaning: input.meaning, persistence: input.persistence, staleBehavior: input.staleBehavior,
  };
}

function activityPanel(source: DashboardCharacterSource, transfers: DashboardBatonTransferProjection[]): DashboardActivityPanelProjection {
  const nowMs = timestamp(source.observedAt) ?? Date.now(), runs = [...(source.runs ?? []), ...(source.parameterizedRuns ?? [])], parcels = source.parcels ?? [], lanes = source.lanes ?? [], threads = source.tokenRouting?.threads ?? [];
  const activeRuns = runs.filter(run => activeStates.has(run.status.toUpperCase())), queuedRuns = runs.filter(run => queuedStates.has(run.status.toUpperCase())), activeParcels = parcels.filter(parcel => ['PLANNING','QUEUED','RUNNING','WAITING'].includes(parcel.status.toUpperCase())), activeLanes = lanes.filter(lane => lane.status.toUpperCase() === 'WORKING');
  const activeSteps = activeRuns.flatMap(run => (run.steps ?? []).filter(step => activeStates.has(step.status.toUpperCase())).map(step => ({run, step}))), activeThreads = threads.filter(thread => thread.active), completedThreads = threads.filter(thread => !thread.active);
  const latestThread = [...threads].sort((left,right) => (timestamp(right.updatedAt ?? right.latest?.at) ?? 0) - (timestamp(left.updatedAt ?? left.latest?.at) ?? 0))[0], latestCompletedThread = [...completedThreads].sort((left,right) => (timestamp(right.updatedAt ?? right.latest?.at) ?? 0) - (timestamp(left.updatedAt ?? left.latest?.at) ?? 0))[0];
  const latestTransfer = transfers[0], activeTransfer = transfers.find(transfer => transfer.active), verifying = runs.filter(run => ['VERIFYING','VALIDATING'].includes(run.status.toUpperCase())), failedRuns = runs.filter(run => ['FAILED','DEGRADED'].includes(run.status.toUpperCase()));
  const unavailableSystems = (source.systems ?? []).filter(system => ['UNAVAILABLE','OFFLINE','AUTH REQUIRED'].includes(system.execution.toUpperCase())), degradedSystems = (source.systems ?? []).filter(system => system.execution.toUpperCase() === 'DEGRADED'), unknownSystems = (source.systems ?? []).filter(system => system.execution.toUpperCase() === 'UNKNOWN'), busySystems = (source.systems ?? []).filter(system => (system.active ?? 0) > 0);
  const controllerEvent = latestControlEvent(source,['work.parcel_created','work.parcel_changed','job.run_created','job.run_changed']), queueEvent = latestControlEvent(source,['job.run_created','job.run_changed']), laneEvent = latestControlEvent(source,['lane.status_changed','lane.handoff']), providerEvent = latestControlEvent(source,['token.telemetry']), responseEvent = latestControlEvent(source,['token.telemetry','job.run_changed']), toolEvent = latestControlEvent(source,['job.run_changed','retrieval.started','retrieval.evidence']), batonEvent = latestControlEvent(source,['token.baton_created','token.handoff_result','token.governor_transition','lane.handoff']), verificationEvent = latestControlEvent(source,['verification.changed','job.run_changed']), nodeEvent = latestControlEvent(source,['resource.node_changed','provider.health_changed']);
  const indicators: DashboardActivityIndicatorProjection[] = [
    activityIndicator({id:'controller',groupId:'control',label:'Controller',shape:'diamond',active:activeRuns.length+activeParcels.length>0,count:activeRuns.length+activeParcels.length,at:latest([...activeRuns.map(runUpdatedAt),...activeParcels.map(parcel=>parcel.updatedAt)])??controllerEvent?.at??source.observedAt,event:controllerEvent,explanation:activeRuns.length+activeParcels.length?`${activeRuns.length} governed Run(s) and ${activeParcels.length} Work Parcel(s) are non-terminal.`:'No governed Run or Work Parcel is active.',source:'canonical run and Work Parcel status',meaning:'Lights only for non-terminal controller-owned work.',persistence:'Active while canonical work remains non-terminal; recent for 30 seconds after the last event.',staleBehavior:'An active claim older than 120 seconds is labelled STALE.'},nowMs),
    activityIndicator({id:'queue',groupId:'control',label:'Queue',shape:'bar',active:queuedRuns.length>0,count:queuedRuns.length,at:latest(queuedRuns.map(runUpdatedAt))??queueEvent?.at,event:queueEvent,explanation:queuedRuns.length?`${queuedRuns.length} Run(s) are queued or awaiting dispatch.`:'The canonical scheduler queue has no waiting Run.',source:'canonical Run status',meaning:'Represents queued/scheduled work, not provider activity.',persistence:'Active until each queued Run is dispatched or terminal.',staleBehavior:'A queue entry without a fresh transition is labelled STALE rather than repeatedly pulsed.'},nowMs),
    activityIndicator({id:'lanes',groupId:'execution',label:'Execution lanes',shape:'square',active:activeLanes.length+activeRuns.length>0,count:activeLanes.length||activeRuns.length,at:latest([...activeLanes.map(lane=>lane.lastMeaningfulActivity),...activeRuns.map(runUpdatedAt)])??laneEvent?.at,event:laneEvent,laneId:activeLanes[0]?.id,model:activeLanes[0]?.model,explanation:activeLanes.length?`${activeLanes.length} authoritative workspace lane(s) report WORKING.`:activeRuns.length?`${activeRuns.length} canonical Job execution lane(s) are active.`:'No workspace lane or governed Job execution lane is active.',source:'canonical lane or Job Run state',meaning:'One coalesced indicator for real active workspace lanes and governed Run execution lanes.',persistence:'Active while at least one workspace lane reports WORKING or a canonical Run remains active.',staleBehavior:'Old last-meaningful-activity converts ACTIVE to STALE.'},nowMs),
    activityIndicator({id:'tools',groupId:'execution',label:'Tool execution',shape:'triangle',active:activeSteps.length>0,count:activeSteps.length,at:latest(activeSteps.flatMap(item=>[item.step.startedAt,item.run.updatedAt]))??toolEvent?.at,event:toolEvent,explanation:activeSteps.length?`${activeSteps.length} recorded Job step(s) are executing${activeSteps[0].step.action?`: ${activeSteps[0].step.action}`:''}.`:'No executing Job step exposes tool activity.',source:'canonical Job step action/status',meaning:'Represents recorded step/tool execution; it never guesses hardware activity.',persistence:'Active only while a canonical step is active.',staleBehavior:'An unchanged active step older than 120 seconds is labelled STALE.'},nowMs),
    activityIndicator({id:'provider-request',groupId:'providers',label:'Model request',shape:'circle',active:activeThreads.length>0,count:activeThreads.length,at:latest(activeThreads.map(thread=>thread.updatedAt??thread.latest?.at))??providerEvent?.at,event:providerEvent,provider:latestThread?.providerId,model:latestThread?.modelId,explanation:activeThreads.length?`${activeThreads.length} token-runtime thread(s) report an open provider invocation.`:'No token-runtime thread reports an open provider invocation.',source:'token routing thread active flag',meaning:'An open provider/model invocation with telemetry; not token-stream inference.',persistence:'Active until the provider adapter records completion/failure.',staleBehavior:'An open request without fresh telemetry for 120 seconds is STALE.'},nowMs),
    activityIndicator({id:'provider-response',groupId:'providers',label:'Model response',shape:'bar',active:false,count:completedThreads.length,at:latestCompletedThread?.updatedAt??latestCompletedThread?.latest?.at??responseEvent?.at,event:responseEvent,provider:latestCompletedThread?.providerId,model:latestCompletedThread?.modelId,explanation:latestCompletedThread?`Latest completed token thread: ${latestCompletedThread.providerId??'unreported provider'}/${latestCompletedThread.modelId??'unreported model'}.`:'No completed provider token thread is recorded.',source:'token routing thread completion',meaning:'A coalesced recent completion pulse, not a claim that tokens streamed.',persistence:'Recent for 30 seconds after a completed thread update.',staleBehavior:'Expires to IDLE; completed work is retained in the ledger.'},nowMs),
    activityIndicator({id:'baton',groupId:'handoff',label:'Baton / escalation',shape:'diamond',active:Boolean(activeTransfer),count:transfers.length,at:activeTransfer?.at??latestTransfer?.at??batonEvent?.at,event:batonEvent,provider:activeTransfer?.to?.provider??latestTransfer?.to?.provider,model:activeTransfer?.to?.model??latestTransfer?.to?.model,explanation:activeTransfer?.explanation??latestTransfer?.explanation??'No sealed baton transfer is recorded.',source:'sealed token/Work Parcel/lane handoff records',meaning:'Shows only persisted baton creation, governed handoff or escalation decisions.',persistence:'Active while a handoff is recorded in progress; recent for 30 seconds after its last outcome.',staleBehavior:'A recorded in-progress transfer older than 120 seconds is STALE.'},nowMs),
    activityIndicator({id:'verification',groupId:'assurance',label:'Verification',shape:'triangle',active:verifying.length>0,failed:!verifying.length&&failedRuns.length>0&&Boolean(verificationEvent&&(nowMs-(timestamp(verificationEvent.at)??0)<DASHBOARD_CHARACTER_ACTIVITY_RECENT_MS)),count:verifying.length||failedRuns.length,at:latest([...verifying.map(runUpdatedAt),...failedRuns.map(runUpdatedAt)])??verificationEvent?.at,event:verificationEvent,explanation:verifying.length?`${verifying.length} Run(s) are under independent verification.`:failedRuns.length?`${failedRuns.length} Run(s) have a recorded failed/degraded outcome.`:'No Run is currently under verification.',source:'canonical Run verification/terminal status',meaning:'Tracks independent validation state and recent outcomes.',persistence:'Active during VERIFYING/VALIDATING; recent outcome remains for 30 seconds.',staleBehavior:'An unchanged active verifier older than 120 seconds is STALE.'},nowMs),
    activityIndicator({id:'nodes',groupId:'infrastructure',label:'Node health',shape:'square',active:busySystems.length>0,disconnected:unavailableSystems.length>0,failed:!unavailableSystems.length&&degradedSystems.length>0,unknown:!unavailableSystems.length&&!degradedSystems.length&&unknownSystems.length>0,count:(source.systems??[]).length,at:latest((source.systems??[]).flatMap(system=>[system.lastCheckAt,system.lastSuccessfulProbeAt,system.node?.lastProbeAt]))??nodeEvent?.at,event:nodeEvent,explanation:unavailableSystems.length?`${unavailableSystems.length} configured system(s) are unavailable or require authentication.`:degradedSystems.length?`${degradedSystems.length} configured system(s) are degraded.`:unknownSystems.length?`${unknownSystems.length} configured system(s) have unknown readiness.`:busySystems.length?`${busySystems.length} system(s) report active workload.`:'Configured systems have no active workload or recorded fault.',source:'canonical configured-system readiness',meaning:'Represents downstream readiness independently from global Agent Control health.',persistence:'Fault states persist until a successful readiness update replaces them.',staleBehavior:'Missing readiness is UNKNOWN; disconnection is never shown as healthy.'},nowMs),
  ];
  const labels:Record<DashboardActivityIndicatorProjection['groupId'],string>={control:'Control',execution:'Execution',providers:'Providers & models',handoff:'Handoff',assurance:'Assurance',infrastructure:'Infrastructure'};
  const order:DashboardActivityIndicatorProjection['groupId'][]=['control','execution','providers','handoff','assurance','infrastructure'];
  return {schema:'agent-control.dashboard-activity-panel/v1',observedAt:source.observedAt,groups:order.map(id=>({id,label:labels[id],indicators:indicators.filter(item=>item.groupId===id)})),decorativeHeartbeat:{authority:'presentation-only',label:'Connection heartbeat',explanation:'A slow decorative animation indicates that this page is rendering. It is not work, traffic, token or hardware telemetry.'}};
}

export function projectDashboardCharacterCrew(source: DashboardCharacterSource): DashboardCharacterCrewProjection {
  const nowMs = timestamp(source.observedAt) ?? Date.now(), staleAfterMs = source.staleAfterMs ?? DASHBOARD_CHARACTER_STALE_AFTER_MS;
  const members = [laneMaster(source, nowMs, staleAfterMs), promptReviewer(source, nowMs, staleAfterMs), parcelCoordinator(source, nowMs, staleAfterMs), modelScout(source, nowMs, staleAfterMs), resourceGuardian(source, nowMs, staleAfterMs), qualityInspector(source, nowMs, staleAfterMs)].map(member => enrichCharacter(member, source, nowMs));
  const parcels = projectParcels(source), transfers = batonTransfers(source), activeParcels = parcels.filter(parcel => ['PLANNING', 'ROUTING', 'EXECUTING', 'WAITING', 'VERIFYING'].includes(parcel.operationalState)), parallel = activeParcels.reduce((total, parcel) => total + parcel.parallelActive, 0), activeTransfer = transfers.find(item => item.active);
  const activeRun = [...(source.parameterizedRuns ?? []), ...(source.runs ?? [])].find(run => activeStates.has(run.status.toUpperCase())), activeSourceParcel = (source.parcels ?? []).find(parcel => ['PLANNING','QUEUED','RUNNING','WAITING'].includes(parcel.status.toUpperCase())), executionMode = activeSourceParcel?.executionMode ?? activeRun?.executionMode ?? null;
  const headline = activeTransfer ? `Sealed baton moving for ${activeTransfer.parcelId}: ${activeTransfer.from?.label ?? 'recorded source'} → ${activeTransfer.to?.label ?? 'governed destination'}.` : activeParcels.length ? `${activeParcels.length} Work Parcel${activeParcels.length === 1 ? '' : 's'} active${parallel > 1 ? ` with ${parallel} stages executing in parallel` : ''}.` : 'Crew is watching canonical state; no Work Parcel is executing.';
  return {
    schema: DASHBOARD_CHARACTER_CREW_SCHEMA,
    observedAt: source.observedAt,
    staleAfterMs,
    activityRecentMs: DASHBOARD_CHARACTER_ACTIVITY_RECENT_MS,
    executionMode,
    headline,
    narration: members.filter(member => member.activity.kind !== 'NONE' || ['failed', 'blocked', 'resource_pressure', 'recovering'].includes(member.state)).map(member => member.narration),
    parcels,
    batonTransfers: transfers,
    modelActivity: modelActivity(source),
    activityPanel: activityPanel(source, transfers),
    members,
  };
}

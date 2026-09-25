import type {ExecutionAuthority} from './execution-provider.js';
import type {CapabilityRequest} from './capabilities.js';
import type {ExecutionCleanupReport, OwnedExecution} from './owned-process.js';
import type {ParcelBatonView} from './parcel-context.js';
import type {ActionGovernancePlan, ExternalOperationRecord} from './action-governance.js';
import type {AgentTemplateBinding} from './agent-template.js';

export type JobPriority = 'background' | 'low' | 'normal' | 'high' | 'urgent';
export type ConcurrencyPolicy = 'allow' | 'no-overlap' | 'replace-running' | 'queue';
export type MissedRunPolicy = 'skip' | 'run-next-available' | 'run-once-immediately';
export type RunStatus = 'PAUSED' | 'SCHEDULED' | 'QUEUED' | 'WAITING' | 'AUTHENTICATION_BLOCKED' | 'RECONNECTING' | 'RUNNING' | 'VERIFYING' | 'CANCELLING' | 'CLEANUP_UNCERTAIN' | 'SUCCEEDED' | 'FAILED' | 'DEGRADED' | 'CANCELLED' | 'MISSED' | 'DISCONNECTED';
export type StepStatus = 'PAUSED' | 'QUEUED' | 'WAITING_FOR_WORKER' | 'WAITING_FOR_DEPENDENCY' | 'WAITING_FOR_RESOURCE' | 'WAITING_FOR_APPROVAL' | 'AUTHENTICATION_BLOCKED' | 'RECONNECTING' | 'DISPATCHED' | 'RUNNING' | 'VERIFYING' | 'RETRY_PENDING' | 'CANCEL_PENDING' | 'CLEANUP_UNCERTAIN' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'CANCELLED';

export interface RetryPolicy {attempts: number; backoffSeconds: number; backoffMultiplier?: number; maxBackoffSeconds?: number; overallDeadlineSeconds?: number;}
export interface ParameterDefinition {type: 'string' | 'integer' | 'number' | 'boolean'; default?: unknown; required?: boolean; secretRef?: boolean; minimum?: number; maximum?: number; enum?: unknown[];}
export interface ArtifactDeclaration {name: string; type: string; schema: string; version: string; retention?: string;}
export interface JobStepDefinition {
  id: string;
  name?: string;
  action: string;
  requires: string[];
  resources?: string[];
  dependsOn?: string[];
  inputs?: Record<string, string>;
  outputs?: ArtifactDeclaration[];
  timeoutSeconds?: number;
  retry?: RetryPolicy;
  approval?: string;
  verification?: string[];
}
export interface JobDefinition {
  apiVersion: 'agent-control/v1';
  kind: 'Job';
  metadata: {id: string; name: string; version: string; description?: string; source?: {kind: 'agent-control-lab'; digest: string; path: string}};
  spec: {enabled?: boolean; priority: JobPriority; concurrency: ConcurrencyPolicy; parameters?: Record<string, ParameterDefinition>; retry?: RetryPolicy; steps: JobStepDefinition[]};
}
export interface ScheduleDefinition {
  apiVersion: 'agent-control/v1';
  kind: 'Schedule';
  metadata: {id: string; name: string};
  spec: {enabled?: boolean; job: string; cron: string; timezone: string; missedRunPolicy: MissedRunPolicy; parameters?: Record<string, unknown>};
}
export interface ScheduleState {scheduleId: string; enabled: boolean; previousScheduledAt?: string; nextScheduledAt?: string; lastRunId?: string; lastSuccessAt?: string; lastFailureAt?: string; lastError?: string; missedCount: number; updatedAt: string;}
export interface WorkerRegistration {
  id: string;
  capabilities: string[];
  health: 'unknown' | 'healthy' | 'degraded' | 'offline';
  capacity: number;
  active: number;
  labels?: Record<string, string>;
  blockedCapabilities?: string[];
  capabilityExpiresAt?: Record<string, string>;
  observedAt: string;
}
export type WorkerExecutionLocality = 'CONTROLLER_LOCAL' | 'LOCAL_WORKER' | 'REMOTE_WORKER' | 'UNKNOWN';
export type WorkerIdentityAuthority = 'AGENT_CONTROL_INTERNAL' | 'CONFIGURED_RESOURCE' | 'UNVERIFIED';
export type WorkerControllerRelationship = 'CONTROLLER_INTERNAL' | 'CONTROLLER_RESOURCE' | 'CONTROLLER_HOST_RESOURCE' | 'REMOTE_RESOURCE' | 'UNKNOWN';
/**
 * Registry-owned execution identity. Worker labels and remote observations never
 * establish these fields; they are only issued by trusted registration paths.
 */
export interface WorkerExecutionIdentity {
  workerId: string;
  nodeId: string | null;
  locality: WorkerExecutionLocality;
  authority: WorkerIdentityAuthority;
  controllerRelationship: WorkerControllerRelationship;
}
export interface PlacementRationale {selected?: string; eligible: string[]; rejected: Array<{workerId: string; reasons: string[]}>; reasons: string[];}
export interface ArtifactRecord {
  id: string; runId: string; stepId: string; name: string; type: string; schema: string; version: string;
  createdAt: string; size: number; sha256: string; storageRef: string; retention: string;
  provenance: {jobId: string; jobVersion: string; action: string; workerId: string};
}
export type RecoveryFailureKind = 'transient-transport' | 'expired-enrolment' | 'authentication-required' | 'permanent-configuration' | 'execution';
export interface StepAttempt {contractId?: string; executionAuthority?: {processId: string; batonGeneration: number; ownershipGeneration: number}; attempt: number; startedAt: string; endedAt?: string; workerId?: string; outcome?: string; retryable?: boolean; errorClass?: ActionFailureClass; recoveryKind?: RecoveryFailureKind; efficiencyInvocationIds?: string[]; executionSessionIds?: string[]; timeoutSeconds?: number; elapsedMs?: number; terminalReason?: string; cleanup?: ExecutionCleanupReport;}
export type ActionFailureClass = 'execution' | 'capability_unavailable' | 'authentication' | 'policy_rejection' | 'verification' | 'configuration';
export interface RunStep {
  id: string; action: string; status: StepStatus; dependsOn: string[]; capabilityRequest: CapabilityRequest; resources: string[];
  attempts: StepAttempt[]; artifactIds: string[]; placement?: PlacementRationale; waitingReason?: string; approval?: string;
  startedAt?: string; endedAt?: string; nextAttemptAt?: string; recoveryDeadlineAt?: string; remainingRetryBudget?: number; cleanup?: ExecutionCleanupReport; error?: string; verification?: {required: string[]; passed: string[]; failed: string[]};
  governance?: ActionGovernancePlan; externalOperations?: ExternalOperationRecord[];
}
export interface RunResumption {generation:number;requestKey:string;actor:string;authorizedAt:string;expiresAt:string;stepId:string;checkpointId:string;checkpointSha256:string;}
export interface RunRecord {
  resumptions?: RunResumption[];
  id: string; jobId: string; jobVersion: string; jobDigest?: string; sourceJobDigest?: string; inputsDigest?: string; templateBinding?: AgentTemplateBinding; trigger: {type: 'manual' | 'schedule' | 'retry'; id?: string; actor: string; templateBinding?: AgentTemplateBinding; modelRoute?: {requestedModel: string | null; requestedRole: string | null; modelId: string; providerId: string; accountProfileId?: string | null; accountLabel?: string | null; accountPlan?: string | null; accountPlanAuthority?: 'operator-configured' | 'provider-reported' | null; accountQualification?: string | null; accountAvailability?: string | null; providerModel: string; nodeId: string; workloadNodeId?: string; providerExecutionNodeId?: string; credentialNodeId?: string | null; qualificationVersion: string; fallback: boolean; fallbackReason: string | null}; parcelContext?: {schema: 'agent-control.run-parcel-context/v1'; parcelId: string; stageId: string; originalGoal: string; currentInterpretation: string; effectiveInstructions: string[]; constraints: string[]; successCriteria: Array<{id: string; description: string; status: string}>; baton: ParcelBatonView | null}};
  requestedAt: string; updatedAt?: string; scheduledAt?: string; startedAt?: string; endedAt?: string; status: RunStatus; priority: JobPriority;
  concurrency: ConcurrencyPolicy; parameters: Record<string, unknown>; steps: RunStep[]; artifacts: string[]; errors: string[];
  effectiveJob: JobDefinition; selectedWorkers: string[]; approvals: string[]; provenance: Array<{type: string; at: string; detail: string}>;
  lineage?: {replacesRunId?: string; replacedByRunId?: string; retryOfRunId?: string; retriedByRunId?: string};
}
export interface ActionExecutionControl {
  contractId: string;
  currentAuthority(): ExecutionAuthority;
  assertActive(): void;
}
export interface ActionContext {retainCleanup?: (identity: Record<string, unknown>, cleanup: () => Promise<ExecutionCleanupReport>) => (proof: ExecutionCleanupReport) => void; recordIndependentVerification?: (stepId: string, passed: boolean, evidenceIds: string[], reason: string) => void; execution?: ActionExecutionControl; recordEvidence?: (name: string, value: unknown) => ArtifactRecord; run: RunRecord; step: RunStep; worker: WorkerRegistration; parameters: Record<string, unknown>; inputArtifacts: ArtifactRecord[]; readArtifact: (id: string) => unknown; signal: AbortSignal; ownedExecution: OwnedExecution; governance?: ActionGovernancePlan;}
export interface ActionOutput {artifacts?: Array<{name: string; value: unknown; type?: string; schema?: string; version?: string; retention?: string}>; evidence?: string[]; verification?: string[]; detail?: string; efficiencyInvocationIds?: string[]; executionState?: 'verification-pending'; externalOperationStates?: Array<{effectId: string; state: ExternalOperationRecord['state']; reason?: string}>;}
export type ActionHandler = (context: ActionContext) => Promise<ActionOutput>;
export interface AgentActionHandler {readonly path: 'adaptive-harness'; execute(context: ActionContext): Promise<ActionOutput>;}

export const jobPriorityRank: Record<JobPriority, number> = {background: 1, low: 2, normal: 3, high: 4, urgent: 5};

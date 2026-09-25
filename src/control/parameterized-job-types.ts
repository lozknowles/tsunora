import type {ModelRouteDecision} from './model-registry.js';
import type {GovernedRequestOrigin} from './request-origin.js';

export type JobParameterType = 'string' | 'integer' | 'boolean' | 'enum' | 'repository' | 'path' | 'git-ref' | 'node' | 'model-role' | 'duration';
export interface JobParameterSchema {
  type: JobParameterType;
  description: string;
  required?: boolean;
  default?: unknown;
  values?: Array<string | number | boolean>;
  minimum?: number;
  maximum?: number;
}
export interface JobBudgetPolicy {timeoutMinutes: number; maxCost?: number; maximumRetries: number; retryBackoffSeconds?: number; retryBackoffMultiplier?: number; retryMaximumBackoffSeconds?: number; maximumInputTokens?: number; maximumOutputTokens?: number;}
export interface JobDefinitionRouting {modelRole: string; allowFallback: boolean;}
export interface ParameterizedJobDefinition {
  schema: 'agent-control.job-definition/v1';
  id: string;
  version: number;
  displayName: string;
  description: string;
  parameters: Record<string, JobParameterSchema>;
  routing: JobDefinitionRouting;
  permissions: {repository: 'read-only'; shell: 'none' | 'bounded-read'; network: 'none' | 'provider-only'};
  budgets: JobBudgetPolicy;
  outputs: {schema: string};
  validation: {requireEvidence: boolean; requireReviewedCommit: boolean};
  template: {id: string; version: number; instruction: string};
  compatibleWith?: number[];
}

export type SavedJobDefinitionReference = {id: string; version: number; follow: 'pinned'} | {id: string; version: number; follow: 'latest-compatible'};
export type SavedJobSchedule =
  | {kind: 'once'; at: string; timezone: string; enabled: boolean; missedRunPolicy: MissedSchedulePolicy}
  | {kind: 'cron'; cron: string; timezone: string; enabled: boolean; missedRunPolicy: MissedSchedulePolicy};
export type MissedSchedulePolicy = 'run-once-immediately' | 'skip' | 'queue';
export type SavedJobConcurrency = 'forbid-overlap' | 'queue' | 'allow';
export type ExecutionEvidenceMode = 'LIVE' | 'CONTROLLED_FAULT_INJECTION' | 'SIMULATED';
export interface SavedJob {
  schema: 'agent-control.saved-job/v1';
  id: string;
  name: string;
  definition: SavedJobDefinitionReference;
  parameters: Record<string, unknown>;
  routing?: {modelRole?: string; model?: string; accountProfile?: string; allowFallback?: boolean; purpose?: 'EXECUTION' | 'QUALIFICATION'};
  contextProfile: 'THIN' | 'STANDARD' | 'DEEP';
  budgets?: Partial<JobBudgetPolicy>;
  schedule?: SavedJobSchedule;
  concurrency: SavedJobConcurrency;
  executionMode?: ExecutionEvidenceMode;
  enabled: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedRepository {
  identity: string;
  name: string;
  nodeId: string;
  sourcePath?: string;
  remote?: string;
  requestedRef: string;
  reviewedSha: string;
  dirty: boolean;
  dirtyPaths: string[];
  dirtyFingerprint?: string;
  comparisonSha?: string;
  snapshotPath: string;
  snapshotKind: 'local-shared-clone' | 'remote-clone' | 'remote-immutable-archive';
  bundleSha256?: string;
  bundlePath?: string;
}

export type ParameterizedRunStatus = 'SCHEDULED' | 'QUEUED' | 'RESOLVING' | 'AUTHENTICATION_BLOCKED' | 'RECONNECTING' | 'RUNNING' | 'VALIDATING' | 'CANCELLING' | 'DISCONNECTED' | 'SUCCEEDED' | 'SUCCEEDED_WITH_FINDINGS' | 'FAILED' | 'CANCELLED' | 'DEGRADED';
export interface JobFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  category: string;
  file?: string;
  startLine?: number;
  endLine?: number;
  evidence: string;
  reasoning: string;
  impact: string;
  suggestedRemediation: string;
  confidence: number;
  validation: {state: 'VALID' | 'REJECTED' | 'UNVERIFIED'; reasons: string[]};
}
export interface RepositoryReviewResult {
  schema: 'agent-control.repository-review/v1';
  executiveSummary: string;
  findings: JobFinding[];
  positiveObservations: string[];
  areasReviewed: string[];
  areasNotReviewed: string[];
  verdict: 'PASS' | 'PASS_WITH_FINDINGS' | 'REVIEW_REQUIRED' | 'FAILED';
}
export interface JobRunUsage {inputTokens?: number; freshInputTokens?: number; cachedInputTokens?: number; cacheWriteTokens?: number; outputTokens?: number; totalTokens?: number; providerReportedCost?: number; calculatedCost?: number; cost?: number; currency?: string; accountedInvocations?: number; unknownUsageInvocations?: number; source: 'provider' | 'calculated' | 'unavailable';}
export interface ParameterizedExecutionIdentity {
  id: string;
  sequence: number;
  providerId: string;
  accountProfileId: string | null;
  modelId: string;
  nodeId: string;
  workloadNodeId: string;
  providerExecutionNodeId: string;
  credentialNodeId: string | null;
  startedAt: string;
  state: 'STARTING' | 'RUNNING' | 'RECONNECTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'UNKNOWN';
  activeTurnId?: string;
  observedAt: string;
}
export interface ParameterizedRecoveryState {
  state: 'NONE' | 'RECONCILIATION_REQUIRED' | 'RECONNECTING' | 'RETRY_PENDING' | 'AUTHENTICATION_REQUIRED' | 'CANCELLING' | 'UNRECOVERABLE';
  reason: string;
  since: string;
  observedAt: string;
  deadlineAt?: string;
  nextCheckAt?: string;
  remainingRetryBudget?: number;
}
export interface ParameterizedJobRun {
  schema: 'agent-control.job-run/v1';
  id: string;
  occurrenceId: string;
  savedJobId?: string;
  definition: ParameterizedJobDefinition;
  resolvedParameters: Record<string, unknown>;
  trigger: {type: 'manual' | 'schedule'; actor: string; id?: string; scheduledFor?: string; scheduleCursor?: string; origin?: GovernedRequestOrigin};
  executionMode?: ExecutionEvidenceMode;
  status: ParameterizedRunStatus;
  transitions: Array<{status: ParameterizedRunStatus; at: string; detail?: string}>;
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  repository?: ResolvedRepository;
  modelRoute?: ModelRouteDecision;
  context?: {profile: 'THIN' | 'STANDARD' | 'DEEP'; files: string[]; changedFiles: string[]; omittedFiles: string[]; chunks: Array<{id: string; files: string[]; sha256: string}>; truncated: boolean};
  workParcelIds: string[];
  evidence: string[];
  providerResponseIds: string[];
  usage: JobRunUsage;
  transportIntegrity?: {recordId: string; contractSha256: string; state: 'COMPLETE' | 'DEGRADED' | 'BLOCKED' | 'ESCALATED'; batonSha256?: string};
  result?: RepositoryReviewResult;
  errors: string[];
  fallbackHistory: Array<{at: string; reason: string; selectedModel: string; selectedProvider?: string; batonId?: string; failureKind?: string}>;
  retryHistory: Array<{at: string; attempt: number; reason: string; kind?: string; nextAttemptAt?: string}>;
  /** Durable, monotonically increasing provider-execution identity across retries and controller restarts. */
  executionSequence?: number;
  activeExecution?: ParameterizedExecutionIdentity;
  /** Route-bound provider attempts; distinct from the human-readable execution-history projection. */
  providerExecutions?: ParameterizedExecutionIdentity[];
  recovery?: ParameterizedRecoveryState;
  immutable: boolean;
}

export interface ReviewExecutionRequest {
  onParcelCreated?: (parcelId: string) => void;
  run: ParameterizedJobRun;
  executionAttempt: number;
  executionId: string;
  route: ModelRouteDecision;
  instruction: string;
  contextChunks: Array<{id: string; content: string; files: string[]; sha256: string}>;
  maximumOutputTokens?: number;
  maximumCost?: number;
  signal: AbortSignal;
}
export interface ReviewExecutionResponse {
  result: RepositoryReviewResult;
  usage: JobRunUsage;
  evidence: string[];
  providerResponseIds: string[];
  workParcelIds: string[];
  transportIntegrity?: {recordId: string; contractSha256: string; state: 'COMPLETE' | 'DEGRADED' | 'BLOCKED' | 'ESCALATED'; batonSha256?: string};
  governedFallbacks?: Array<{at: string; reason: string; selectedModel: string; selectedProvider: string; batonId: string; failureKind: string}>;
}
export interface ReviewExecutionReconciliation {
  executionId: string;
  state: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'UNKNOWN';
  continuityProven: boolean;
  observedAt: string;
  activeTurnId?: string;
  detail?: string;
  response?: ReviewExecutionResponse;
}
export interface ReviewExecutionCancellation {executionId: string; state: 'CANCELLED' | 'RUNNING' | 'UNKNOWN'; cleanupConfirmed: boolean; observedAt: string; detail?: string;}
export interface RepositoryReviewExecutor {
  execute(request: ReviewExecutionRequest): Promise<ReviewExecutionResponse>;
  reconcile?(run: ParameterizedJobRun, execution: ParameterizedExecutionIdentity): Promise<ReviewExecutionReconciliation>;
  cancel?(run: ParameterizedJobRun, execution: ParameterizedExecutionIdentity, reason: string): Promise<ReviewExecutionCancellation>;
  recordVerification?(workParcelIds: string[], verdict: RepositoryReviewResult['verdict']): void;
}

export type ExecutionState =
  | 'STARTING'
  | 'RUNNING'
  | 'PAUSED'
  | 'HUMAN_OWNED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'DISCONNECTED'
  | 'RECOVERING'
  | 'UNKNOWN';

export interface ExecutionAuthority {
  laneId: string;
  leaseGeneration: number;
  ownershipGeneration: number;
  owner: 'agent' | 'human';
}

export interface ExecutionIdentity {
  provider: string;
  taskId: string;
  executionId: string;
  sessionId: string;
  sessionIncarnation: string;
  host: string;
  repository: string;
  worktree: string;
  branch: string;
  creationNonce: string;
  commandHash: string;
}

export interface ExecutionReceipt {
  identity: ExecutionIdentity;
  authority: ExecutionAuthority;
  state: ExecutionState;
  updatedAt: string;
  detail?: string;
}

export interface StartExecutionRequest {
  taskId: string;
  host: string;
  repository: string;
  branch: string;
  command: string;
  authority: ExecutionAuthority;
}

export interface ExecutionStatus {
  receipt: ExecutionReceipt;
  provenOriginal: boolean;
}

export interface SendInputResult {
  accepted: boolean;
  reason?: string;
}

export interface ExecutionProvider {
  start(request: StartExecutionRequest): Promise<ExecutionReceipt>;
  status(taskId: string): Promise<ExecutionStatus>;
  reconnect(taskId: string, authority: ExecutionAuthority): Promise<ExecutionStatus>;
  sendInput(taskId: string, input: string, authority: ExecutionAuthority): Promise<SendInputResult>;
  pause(taskId: string, authority: ExecutionAuthority): Promise<ExecutionReceipt>;
  resume(taskId: string, authority: ExecutionAuthority): Promise<ExecutionReceipt>;
  cancel(taskId: string, authority: ExecutionAuthority): Promise<ExecutionReceipt>;
  output(taskId: string): Promise<string>;
  diff(taskId: string): Promise<string>;
  cleanup(taskId: string, authority: ExecutionAuthority): Promise<void>;
}

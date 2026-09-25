import {createHash, randomUUID} from 'node:crypto';
import type {
  ExecutionAuthority,
  ExecutionIdentity,
  ExecutionProvider,
  ExecutionReceipt,
  ExecutionState,
  ExecutionStatus,
  SendInputResult,
  StartExecutionRequest,
} from './execution-provider.js';

export interface ExecutionReceiptStore {
  load(taskId: string): ExecutionReceipt | undefined;
  save(receipt: ExecutionReceipt): void;
  delete(taskId: string): void;
}

export interface OrcaStartResult {
  executionId: string;
  sessionId: string;
  sessionIncarnation: string;
  worktree: string;
}

export interface OrcaRecoveryProof {
  identity: ExecutionIdentity;
  state: Exclude<ExecutionState, 'STARTING' | 'RECOVERING' | 'UNKNOWN'>;
  continuityProven: boolean;
  detail?: string;
}

export interface OrcaAuthorityToken extends ExecutionAuthority {
  taskId: string;
  executionId: string;
  sessionId: string;
}

/**
 * Narrow port implemented by the Orca adapter process. Agent Control policy must
 * never import Orca runtime types or call the runtime by another path.
 */
export interface OrcaRuntimePort {
  start(request: StartExecutionRequest & {creationNonce: string; commandHash: string}): Promise<OrcaStartResult>;
  prove(identity: ExecutionIdentity): Promise<OrcaRecoveryProof>;
  sendInput(token: OrcaAuthorityToken, input: string): Promise<SendInputResult>;
  setPaused?(token: OrcaAuthorityToken, paused: boolean): Promise<boolean>;
  cancel(token: OrcaAuthorityToken): Promise<boolean>;
  applyAuthority(token: OrcaAuthorityToken): Promise<boolean>;
  output(identity: ExecutionIdentity): Promise<string>;
  diff(identity: ExecutionIdentity): Promise<string>;
  cleanup(identity: ExecutionIdentity): Promise<void>;
}

const terminal = new Set<ExecutionState>(['COMPLETED', 'FAILED', 'CANCELLED']);

export class OrcaExecutionProvider implements ExecutionProvider {
  constructor(
    private readonly runtime: OrcaRuntimePort,
    private readonly store: ExecutionReceiptStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async start(request: StartExecutionRequest): Promise<ExecutionReceipt> {
    if (this.store.load(request.taskId)) throw new Error('execution_already_exists');
    const creationNonce = randomUUID();
    const commandHash = createHash('sha256').update(request.command).digest('hex');
    const provisional: ExecutionReceipt = {
      identity: {
        provider: 'orca', taskId: request.taskId, executionId: 'pending', sessionId: 'pending',
        sessionIncarnation: 'pending', host: request.host, repository: request.repository,
        worktree: 'pending', branch: request.branch, creationNonce, commandHash,
      },
      authority: {...request.authority}, state: 'STARTING', updatedAt: this.now(),
    };
    this.store.save(provisional);
    try {
      const started = await this.runtime.start({...request, creationNonce, commandHash});
      return this.save({
        ...provisional,
        identity: {...provisional.identity, ...started},
        state: request.authority.owner === 'human' ? 'HUMAN_OWNED' : 'RUNNING',
      });
    } catch (error) {
      return this.save({...provisional, state: 'FAILED', detail: message(error)});
    }
  }

  async status(taskId: string): Promise<ExecutionStatus> {
    const receipt = this.must(taskId);
    if (terminal.has(receipt.state)) return {receipt, provenOriginal: receipt.identity.executionId !== 'pending'};
    return this.verify(receipt);
  }

  async reconnect(taskId: string, authority: ExecutionAuthority): Promise<ExecutionStatus> {
    const receipt = this.authorize(taskId, authority);
    this.save({...receipt, state: 'RECOVERING', detail: undefined});
    return this.verify(receipt);
  }

  async sendInput(taskId: string, input: string, authority: ExecutionAuthority): Promise<SendInputResult> {
    const receipt = this.authorize(taskId, authority);
    if (receipt.state === 'UNKNOWN' || receipt.state === 'DISCONNECTED' || receipt.state === 'RECOVERING') {
      return {accepted: false, reason: 'execution_not_proven'};
    }
    if (receipt.authority.owner !== 'agent' || receipt.state === 'HUMAN_OWNED') {
      return {accepted: false, reason: 'agent_input_fenced:human'};
    }
    if (receipt.state !== 'RUNNING') return {accepted: false, reason: `execution_not_writable:${receipt.state}`};
    return this.runtime.sendInput(this.token(receipt), input);
  }

  async pause(taskId: string, authority: ExecutionAuthority): Promise<ExecutionReceipt> {
    const receipt = this.authorize(taskId, authority);
    if (receipt.state !== 'RUNNING') throw new Error(`execution_not_running:${receipt.state}`);
    if (!this.runtime.setPaused) return this.unknown(receipt, 'pause_unsupported');
    if (!await this.runtime.setPaused(this.token(receipt), true)) return this.unknown(receipt, 'pause_not_proven');
    return this.save({...receipt, state: 'PAUSED'});
  }

  async resume(taskId: string, authority: ExecutionAuthority): Promise<ExecutionReceipt> {
    const receipt = this.authorize(taskId, authority);
    if (receipt.state !== 'PAUSED') throw new Error(`execution_not_paused:${receipt.state}`);
    if (receipt.authority.owner !== 'agent') throw new Error('execution_human_owned');
    if (!this.runtime.setPaused) return this.unknown(receipt, 'resume_unsupported');
    if (!await this.runtime.setPaused(this.token(receipt), false)) return this.unknown(receipt, 'resume_not_proven');
    return this.save({...receipt, state: 'RUNNING'});
  }

  async cancel(taskId: string, authority: ExecutionAuthority): Promise<ExecutionReceipt> {
    const receipt = this.authorize(taskId, authority);
    if (!await this.runtime.cancel(this.token(receipt))) return this.unknown(receipt, 'cancel_not_proven');
    return this.save({...receipt, state: 'CANCELLED'});
  }

  output(taskId: string): Promise<string> { return this.runtime.output(this.must(taskId).identity); }
  diff(taskId: string): Promise<string> { return this.runtime.diff(this.must(taskId).identity); }

  async cleanup(taskId: string, authority: ExecutionAuthority): Promise<void> {
    const receipt = this.authorize(taskId, authority);
    if (!terminal.has(receipt.state)) throw new Error('cleanup_requires_terminal_execution');
    await this.runtime.cleanup(receipt.identity);
    this.store.delete(taskId);
  }

  /** Persist the ownership fence before asking Orca to apply it. */
  async humanTakeover(taskId: string, authority: ExecutionAuthority): Promise<ExecutionReceipt> {
    const receipt = this.must(taskId);
    this.requireNextGeneration(receipt.authority, authority, 'human');
    const fenced = this.save({...receipt, authority: {...authority}, state: 'HUMAN_OWNED'});
    if (!await this.runtime.applyAuthority(this.token(fenced))) return this.unknown(fenced, 'runtime_fence_not_proven');
    return fenced;
  }

  async returnToAgent(taskId: string, authority: ExecutionAuthority): Promise<ExecutionReceipt> {
    const receipt = this.must(taskId);
    this.requireNextGeneration(receipt.authority, authority, 'agent');
    if (receipt.state !== 'HUMAN_OWNED') throw new Error('execution_not_human_owned');
    const returned = this.save({...receipt, authority: {...authority}, state: 'RUNNING'});
    if (!await this.runtime.applyAuthority(this.token(returned))) return this.unknown(returned, 'runtime_authority_return_not_proven');
    return returned;
  }

  private async verify(receipt: ExecutionReceipt): Promise<ExecutionStatus> {
    try {
      const proof = await this.runtime.prove(receipt.identity);
      if (!proof.continuityProven || !sameIdentity(receipt.identity, proof.identity)) {
        return {receipt: this.unknown(receipt, proof.detail ?? 'execution_identity_unproven'), provenOriginal: false};
      }
      if (!await this.runtime.applyAuthority(this.token(receipt))) {
        return {receipt: this.unknown(receipt, 'runtime_authority_reassertion_not_proven'), provenOriginal: false};
      }
      const state = receipt.authority.owner === 'human' ? 'HUMAN_OWNED' : proof.state;
      return {receipt: this.save({...receipt, state, detail: proof.detail}), provenOriginal: true};
    } catch (error) {
      return {receipt: this.unknown(receipt, message(error)), provenOriginal: false};
    }
  }

  private authorize(taskId: string, authority: ExecutionAuthority): ExecutionReceipt {
    const receipt = this.must(taskId);
    if (receipt.authority.laneId !== authority.laneId) throw new Error('stale_lane');
    if (receipt.authority.leaseGeneration !== authority.leaseGeneration) throw new Error('stale_lease');
    if (receipt.authority.ownershipGeneration !== authority.ownershipGeneration) throw new Error('stale_ownership');
    if (receipt.authority.owner !== authority.owner) throw new Error('wrong_owner');
    return receipt;
  }

  private requireNextGeneration(current: ExecutionAuthority, next: ExecutionAuthority, owner: 'agent' | 'human') {
    if (next.laneId !== current.laneId) throw new Error('stale_lane');
    if (next.leaseGeneration <= current.leaseGeneration) throw new Error('stale_lease');
    if (next.ownershipGeneration <= current.ownershipGeneration) throw new Error('stale_ownership');
    if (next.owner !== owner) throw new Error('wrong_owner');
  }

  private token(receipt: ExecutionReceipt): OrcaAuthorityToken {
    const {taskId, executionId, sessionId} = receipt.identity;
    return {taskId, executionId, sessionId, ...receipt.authority};
  }

  private must(taskId: string): ExecutionReceipt {
    const receipt = this.store.load(taskId);
    if (!receipt) throw new Error('execution_missing');
    return receipt;
  }

  private unknown(receipt: ExecutionReceipt, detail: string): ExecutionReceipt {
    return this.save({...receipt, state: 'UNKNOWN', detail});
  }

  private save(receipt: ExecutionReceipt): ExecutionReceipt {
    const saved = {...receipt, updatedAt: this.now()};
    this.store.save(saved);
    return saved;
  }
}

function sameIdentity(expected: ExecutionIdentity, actual: ExecutionIdentity): boolean {
  return (Object.keys(expected) as Array<keyof ExecutionIdentity>).every(key => expected[key] === actual[key]);
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }

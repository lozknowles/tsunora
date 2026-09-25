import type {Resource} from './capabilities.js';
import {WorkCoordinator} from './work-coordinator.js';
import type {ResourceLoad, WorkItem, WorkVerification} from './work-queue.js';

export interface WorkExecutionResult {
  resultRef?: string;
  confidence?: number;
  error?: string;
  retryable?: boolean;
  fingerprint?: string;
  /** The substrate exited, but Agent Control verification has not accepted the result. */
  requiresVerification?: boolean;
}

export type WorkHandler = (work: WorkItem, resource: Resource, context: WorkContextView) => Promise<WorkExecutionResult>;

export interface WorkDispatch {
  readonly path: 'adaptive-harness';
  execute(work: WorkItem, resource: Resource, context: WorkContextView): Promise<WorkExecutionResult>;
}

export class UnconfiguredAdaptiveDispatch implements WorkDispatch {
  readonly path = 'adaptive-harness' as const;
  async execute(): Promise<WorkExecutionResult> {
    const error = new Error('adaptive_harness_dispatch_unconfigured') as Error & {retryable: boolean};
    error.retryable = false;
    throw error;
  }
}

export interface WorkContextView {
  id: string;
  type: string;
  class: WorkItem['class'];
  attempt: number;
  budget?: WorkItem['budget'];
  dependsOn: {id: string; status: string; resultRef?: string}[];
  checkpoint?: WorkItem['checkpoint'];
  data?: WorkItem['data'];
}

export interface ExecutionEvent {
  kind: 'idle' | 'completed' | 'verification' | 'review' | 'retry' | 'loop' | 'failed' | 'batch';
  workId?: string;
  resourceId?: string;
  detail: string;
}

interface ControlOperation {
  handler: WorkHandler;
  accepts: (work: WorkItem) => boolean;
}

/** Explicitly named exceptions for control-plane maintenance; never a legacy agent fallback. */
export class ControlOperationRegistry {
  private readonly operations = new Map<string, ControlOperation>();

  register(name: string, handler: WorkHandler, accepts: (work: WorkItem) => boolean = () => true): this {
    if (!name || this.operations.has(name)) throw new Error(`control_operation_invalid_or_duplicate:${name}`);
    this.operations.set(name, {handler, accepts});
    return this;
  }

  resolve(work: WorkItem): WorkHandler {
    if (work.data?.executionClass !== 'control') throw new Error('control_operation_not_declared');
    const name = work.data.controlOperation;
    if (typeof name !== 'string') throw new Error('control_operation_name_missing');
    const operation = this.operations.get(name);
    if (!operation) throw new Error(`control_operation_unregistered:${name}`);
    if (!operation.accepts(work)) throw new Error(`control_operation_scope_denied:${name}`);
    return operation.handler;
  }
}

export class WorkExecutor {
  constructor(
    readonly coordinator: WorkCoordinator,
    readonly agentDispatch: WorkDispatch,
    readonly controlOperations = new ControlOperationRegistry(),
    readonly loopThreshold = 3,
  ) {
    if (agentDispatch.path !== 'adaptive-harness') throw new Error('agent_dispatch_must_use_adaptive_harness');
  }

  completeVerification(workId: string, decision: Omit<WorkVerification, 'at'>) {
    const work = this.coordinator.queue.completeVerification(workId, decision);
    this.coordinator.store?.save(this.coordinator.queue);
    return work;
  }

  context(work: WorkItem): WorkContextView {
    return {
      id: work.id,
      type: work.type,
      class: work.class,
      attempt: work.attempts + 1,
      budget: work.budget,
      checkpoint: work.checkpoint,
      data: work.data,
      dependsOn: work.dependsOn.map(id => {
        const dependency = this.coordinator.queue.get(id);
        return {id, status: dependency?.status ?? 'missing', resultRef: dependency?.resultRef};
      }),
    };
  }

  private repeated(work: WorkItem, fingerprint?: string) {
    if (!fingerprint) return false;
    const recent = (work.outcomes ?? []).filter(item => item.fingerprint).slice(-(this.loopThreshold - 1)).map(item => item.fingerprint);
    return recent.length === this.loopThreshold - 1 && recent.every(item => item === fingerprint);
  }

  private record(work: WorkItem, output: WorkExecutionResult) {
    this.coordinator.queue.recordOutcome(work.id, {
      fingerprint: output.fingerprint,
      error: output.error,
      resultRef: output.resultRef,
      confidence: output.confidence,
    });
  }

  private handler(work: WorkItem): WorkHandler {
    if (work.data?.executionClass === 'control') return this.controlOperations.resolve(work);
    return (item, resource, context) => this.agentDispatch.execute(item, resource, context);
  }

  async executeOne(work: WorkItem, resource: Resource): Promise<ExecutionEvent> {
    work.status = 'running';
    this.coordinator.store?.save(this.coordinator.queue);
    let output: WorkExecutionResult;
    try {
      output = await this.handler(work)(work, resource, this.context(work));
    } catch (error) {
      output = {
        error: error instanceof Error ? error.message : String(error),
        retryable: typeof error === 'object' && error !== null && 'retryable' in error
          ? Boolean((error as {retryable: unknown}).retryable)
          : true,
      };
    }
    if (this.repeated(work, output.fingerprint)) {
      this.record(work, output);
      work.status = 'human-review';
      work.claimedBy = undefined;
      this.coordinator.store?.save(this.coordinator.queue);
      return {kind: 'loop', workId: work.id, resourceId: resource.id, detail: `repeated outcome ${output.fingerprint}`};
    }
    this.record(work, output);
    if (output.error) {
      work.claimedBy = undefined;
      if (output.retryable !== false && work.attempts < work.maxAttempts) {
        work.status = 'failed';
        this.coordinator.queue.resume(work.id);
        this.coordinator.store?.save(this.coordinator.queue);
        return {kind: 'retry', workId: work.id, resourceId: resource.id, detail: output.error};
      }
      work.status = 'failed';
      this.coordinator.store?.save(this.coordinator.queue);
      return {kind: 'failed', workId: work.id, resourceId: resource.id, detail: output.error};
    }
    if (output.requiresVerification) {
      this.coordinator.queue.markExecutionComplete(work.id, output.resultRef, output.confidence);
      this.coordinator.store?.save(this.coordinator.queue);
      return {kind: 'verification', workId: work.id, resourceId: resource.id, detail: output.resultRef ?? 'execution complete; verification required'};
    }
    const completed = this.coordinator.queue.complete(work.id, output.resultRef, output.confidence);
    this.coordinator.store?.save(this.coordinator.queue);
    return {kind: completed.status === 'human-review' ? 'review' : 'completed', workId: work.id, resourceId: resource.id, detail: output.resultRef ?? 'completed'};
  }

  async step(resources: Resource[], loads: ResourceLoad[], now = new Date()): Promise<ExecutionEvent> {
    const decision = this.coordinator.tick(resources, loads, now);
    if (decision.kind === 'idle') return {kind: 'idle', detail: decision.reason};
    if (decision.kind === 'batch') {
      let completed = 0;
      for (const id of decision.lease.itemIds) {
        const work = this.coordinator.queue.get(id);
        if (!work) throw new Error('batch_item_missing');
        const event = await this.executeOne(work, decision.resource);
        if (event.kind === 'completed') completed++;
        else if (['verification', 'review', 'loop', 'failed', 'retry'].includes(event.kind)) {
          for (const rest of decision.lease.itemIds.slice(decision.lease.itemIds.indexOf(id) + 1)) {
            const pending = this.coordinator.queue.get(rest);
            if (pending?.status === 'claimed') {
              pending.status = 'queued';
              pending.claimedBy = undefined;
            }
          }
          decision.lease.releasedAt = new Date().toISOString();
          this.coordinator.store?.save(this.coordinator.queue);
          return event;
        }
      }
      decision.lease.releasedAt = new Date().toISOString();
      this.coordinator.store?.save(this.coordinator.queue);
      return {kind: 'batch', workId: decision.work.id, resourceId: decision.resource.id, detail: `batch completed ${completed}/${decision.lease.itemIds.length}`};
    }
    return this.executeOne(decision.work, decision.resource);
  }

  async run(resources: Resource[], loads: ResourceLoad[], maxSteps = 100): Promise<ExecutionEvent[]> {
    const events: ExecutionEvent[] = [];
    for (let index = 0; index < maxSteps; index++) {
      const event = await this.step(resources, loads);
      events.push(event);
      if (['idle', 'verification', 'loop', 'review', 'failed'].includes(event.kind)) break;
    }
    return events;
  }
}

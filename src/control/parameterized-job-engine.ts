import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import type {ModelRegistry} from './model-registry.js';
import {nextSavedJobOccurrence, ParameterizedJobError, ParameterizedJobRegistry, ParameterizedRunStore, resolveParameters, SavedJobStore} from './parameterized-job-registry.js';
import {buildRepositoryContext, LocalRepositoryResolver, ReviewBaselineStore, validateRepositoryReview, type RepositoryResolver} from './repository-review-runtime.js';
import type {JobBudgetPolicy, ParameterizedExecutionIdentity, ParameterizedJobRun, ParameterizedRunStatus, RepositoryReviewExecutor, ReviewExecutionResponse, SavedJob} from './parameterized-job-types.js';
import {boundedRecoveryDelay, classifyExecutionFailure, recoveryDeadlineAllows} from './execution-recovery.js';
import {ExecutionTranscriptRuntime} from './execution-transcript.js';
import type {TokenAwareBatonRuntime} from './token-aware-baton-routing.js';
import type {WorkParcelStore} from './work-parcels.js';
import type {GovernedRequestOrigin} from './request-origin.js';

function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
function terminal(status: ParameterizedRunStatus) { return ['SUCCEEDED', 'SUCCEEDED_WITH_FINDINGS', 'FAILED', 'CANCELLED', 'DEGRADED'].includes(status); }
export interface ParameterizedJobEngineOptions {
  allowedRepositoryRoots: string[];
  allowedRepositoryRemotes?: string[];
  snapshotsRoot: string;
  nodeHealthy: (nodeId: string) => boolean | Promise<boolean>;
  clock?: () => Date;
  wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  recoveryPollSeconds?: number;
}

export class ParameterizedJobEngine {
  private readonly active = new Map<string, AbortController>();
  private readonly clock: () => Date;
  private readonly wait: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  constructor(
    readonly definitions: ParameterizedJobRegistry,
    readonly savedJobs: SavedJobStore,
    readonly runs: ParameterizedRunStore,
    readonly baselines: ReviewBaselineStore,
    readonly models: ModelRegistry,
    readonly executor: RepositoryReviewExecutor,
    readonly options: ParameterizedJobEngineOptions,
    readonly repositories: RepositoryResolver = new LocalRepositoryResolver(),
    readonly transcripts?: ExecutionTranscriptRuntime,
  ) { this.clock = options.clock ?? (() => new Date()); this.wait = options.wait ?? abortableDelay; this.recoverInterruptedRuns(); }

  runNow(savedJobId: string, actor: string, requestKey?: string, origin?: GovernedRequestOrigin) { const job = this.savedJobs.get(savedJobId); if (!job.enabled) throw new ParameterizedJobError('saved_job_disabled', savedJobId); return this.createRun(job, {type: 'manual', actor, ...(requestKey?{id:requestKey}:{}), ...(origin?{origin:structuredClone(origin)}:{})}); }
  createRun(job: SavedJob, trigger: ParameterizedJobRun['trigger']) {
    const definition = this.definitions.resolve(job), scheduledFor = trigger.scheduledFor ?? this.clock().toISOString(), occurrenceId = trigger.type === 'schedule' ? hash(`${job.id}\n${scheduledFor}`) : trigger.id ? hash(`command\n${trigger.actor}\n${trigger.id}`) : randomUUID();
    const existing = this.runs.occurrence(occurrenceId); if (existing) { if(existing.savedJobId!==job.id)throw new ParameterizedJobError('request_key_conflict');return existing; }
    const concurrent = this.runs.list(job.id).filter(run => !terminal(run.status));
    if (concurrent.length && job.concurrency === 'forbid-overlap') throw new ParameterizedJobError('saved_job_overlap_forbidden', concurrent[0].id);
    const at = this.clock().toISOString(), run: ParameterizedJobRun = {
      schema: 'agent-control.job-run/v1', id: randomUUID(), occurrenceId, savedJobId: job.id, definition, resolvedParameters: resolveParameters(definition, job.parameters), trigger,
      executionMode: job.executionMode ?? 'LIVE', status: 'QUEUED', transitions: [{status: 'QUEUED', at}], requestedAt: at, workParcelIds: [], evidence: [], providerResponseIds: [], usage: {source: 'unavailable'}, errors: [], fallbackHistory: [], retryHistory: [], immutable: false,
    };
    return this.runs.add(run);
  }

  async tickSchedules(at = this.clock()) {
    const created: ParameterizedJobRun[] = [];
    for (const job of this.savedJobs.list().filter(item => item.enabled && item.schedule?.enabled)) {
      const schedule = job.schedule!, previous = this.runs.list(job.id).filter(run => run.trigger.type === 'schedule').map(run => run.trigger.scheduleCursor ?? run.trigger.scheduledFor).filter(Boolean).sort().at(-1);
      const cursor = previous ? new Date(previous) : new Date(job.updatedAt);
      let due = nextSavedJobOccurrence(job, cursor);
      if (!due || due > at) continue;
      if (schedule.missedRunPolicy === 'skip' && at.getTime() - due.getTime() > 60_000) {
        const skipped = this.createRun(job, {type: 'schedule', actor: 'scheduler', scheduledFor: due.toISOString()});
        created.push(this.cancel(skipped.id, 'scheduler:missed-schedule-skip'));
        continue;
      }
      const scheduledFor = due.toISOString(), scheduleCursor = schedule.missedRunPolicy === 'run-once-immediately' && due < at ? at.toISOString() : scheduledFor;
      try { created.push(this.createRun(job, {type: 'schedule', actor: 'scheduler', scheduledFor, scheduleCursor})); }
      catch (error) { if (!(error instanceof ParameterizedJobError && error.code === 'saved_job_overlap_forbidden')) throw error; }
    }
    return created;
  }

  async executeNext() {
    const queued = this.runs.list().filter(run => run.status === 'QUEUED').sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
    for (const run of queued) { const saved = run.savedJobId ? this.savedJobs.get(run.savedJobId) : undefined; if (saved?.concurrency !== 'allow' && this.active.has(saved?.id ?? '')) continue; await this.execute(run.id); return this.runs.get(run.id); }
    return undefined;
  }

  async execute(runId: string) {
    let run = this.mustRun(runId); if (run.status !== 'QUEUED') throw new ParameterizedJobError('job_run_not_queued', run.id);
    const saved = run.savedJobId ? this.savedJobs.get(run.savedJobId) : undefined, activeKey = saved?.id ?? run.id;
    if (this.active.has(activeKey) && saved?.concurrency !== 'allow') throw new ParameterizedJobError('saved_job_overlap_forbidden', activeKey);
    const controller = new AbortController(); this.active.set(activeKey, controller);
    const budgets = mergeBudgets(run.definition.budgets, saved?.budgets), deadlineAt = new Date(this.clock().getTime() + budgets.timeoutMinutes * 60_000).toISOString(), timer = setTimeout(() => controller.abort('job_timeout'), budgets.timeoutMinutes * 60_000); timer.unref();
    try {
      run = this.transition(run, 'RESOLVING'); run.startedAt = this.clock().toISOString(); this.runs.update(run);
      const nodeId = String(run.resolvedParameters.node), repositoryPath = String(run.resolvedParameters.repository), requestedRef = String(run.resolvedParameters.ref ?? 'main');
      if (!await this.options.nodeHealthy(nodeId)) throw new ParameterizedJobError('execution_node_unavailable', nodeId);
      const repository = run.repository ? this.restoreFrozenRepository(run.repository) : await this.repositories.resolve({nodeId, repository: repositoryPath, requestedRef, comparisonSha: typeof run.resolvedParameters.compareAgainst === 'string' ? run.resolvedParameters.compareAgainst : undefined, allowedRoots: this.options.allowedRepositoryRoots, allowedRemotes: this.options.allowedRepositoryRemotes, snapshotsRoot: this.options.snapshotsRoot});
      if (run.resolvedParameters.scope === 'changes' && !repository.comparisonSha && saved) {
        const baseline = this.baselines.get(saved.id, repository.identity, requestedRef);
        if (baseline && isAncestor(repository.snapshotPath, baseline.sha, repository.reviewedSha)) repository.comparisonSha = baseline.sha;
      }
      run.repository = repository;
      const modelRole = saved?.routing?.modelRole ?? run.definition.routing.modelRole, sealedRoute = run.modelRoute;
      const route = sealedRoute
        ? this.revalidateRoute(sealedRoute)
        : this.models.route({model: saved?.routing?.model, modelRole, accountProfile: saved?.routing?.accountProfile, nodeId, workloadNodeId: nodeId, requiredCapabilities: ['repository-review'], allowFallback: saved?.routing?.allowFallback ?? run.definition.routing.allowFallback, purpose: saved?.routing?.purpose});
      run.modelRoute = route; if (!sealedRoute && route.fallback) run.fallbackHistory.push({at: this.clock().toISOString(), reason: route.fallbackReason ?? 'primary unavailable', selectedModel: route.modelId});
      const context = buildRepositoryContext(repository, saved?.contextProfile ?? 'STANDARD', budgets.maximumInputTokens); run.context = context.summary;
      run = this.transition(run, 'RUNNING'); this.runs.update(run);
      let response: ReviewExecutionResponse;
      for (let attempt = 0; ; attempt++) {
        try {
          run.executionSequence = (run.executionSequence ?? 0) + 1;
          const execution = this.executionIdentity(run, route, run.executionSequence);
          run.activeExecution = execution; this.syncExecution(run, execution); run.recovery = {state: 'NONE', reason: 'execution_active', since: execution.startedAt, observedAt: execution.observedAt, deadlineAt, remainingRetryBudget: Math.max(0, budgets.maximumRetries - attempt)};
          this.runs.update(run);
          const executionRun = structuredClone(run);
          executionRun.definition = {...executionRun.definition, budgets: structuredClone(budgets)};
          response = await this.executor.execute({onParcelCreated: parcelId => {
            const current = this.mustRun(run.id);
            if (current.activeExecution?.id !== execution.id || terminal(current.status)) return;
            current.workParcelIds = [...new Set([...current.workParcelIds, parcelId])];
            this.runs.update(current);
          }, run: executionRun, executionAttempt: run.executionSequence, executionId: execution.id, route, instruction: run.definition.template.instruction, contextChunks: context.chunks, maximumOutputTokens: budgets.maximumOutputTokens, maximumCost: budgets.maxCost, signal: controller.signal});
          run = this.mustRun(run.id); this.updateExecution(run, 'COMPLETED'); this.runs.update(run);
          break;
        } catch (error) {
          const partial = error as Error & {workParcelIds?: string[]; evidence?: string[]; providerResponseIds?: string[]; usage?: ParameterizedJobRun['usage']}, parcelIds = partial.workParcelIds ?? [];
          run = this.mustRun(run.id); this.updateExecution(run, controller.signal.aborted ? 'UNKNOWN' : 'FAILED');
          run.workParcelIds = [...new Set([...run.workParcelIds, ...parcelIds])];
          run.evidence = [...new Set([...run.evidence, ...(partial.evidence ?? [])])]; run.providerResponseIds = [...new Set([...run.providerResponseIds, ...(partial.providerResponseIds ?? [])])]; if (partial.usage) run.usage = mergeRunUsage(run.usage, partial.usage);
          this.runs.update(run);
          if (controller.signal.aborted) throw error;
          const disposition = classifyExecutionFailure(error);
          if (disposition.humanActionRequired) {
            const at = this.clock().toISOString(); run.status = 'AUTHENTICATION_BLOCKED'; run.transitions.push({status: run.status, at, detail: disposition.safeReason}); run.recovery = {state: 'AUTHENTICATION_REQUIRED', reason: disposition.safeReason, since: at, observedAt: at, deadlineAt, remainingRetryBudget: Math.max(0, budgets.maximumRetries - attempt)}; run.errors.push(disposition.safeReason); this.runs.update(run); return this.mustRun(run.id);
          }
          if (!disposition.retryable || attempt >= budgets.maximumRetries) throw new ParameterizedJobError(disposition.safeReason);
          const delayMs = boundedRecoveryDelay(attempt + 1, budgets.retryBackoffSeconds ?? 2, budgets.retryBackoffMultiplier ?? 2, budgets.retryMaximumBackoffSeconds ?? 30);
          if (!recoveryDeadlineAllows(this.clock(), deadlineAt, delayMs)) throw new ParameterizedJobError('recovery_deadline_exhausted');
          const at = this.clock().toISOString(), nextAttemptAt = new Date(this.clock().getTime() + delayMs).toISOString(); run.retryHistory.push({at, attempt: attempt + 1, reason: disposition.safeReason, kind: disposition.kind, nextAttemptAt}); run.status = 'RECONNECTING'; run.transitions.push({status: run.status, at, detail: disposition.safeReason}); run.recovery = {state: 'RETRY_PENDING', reason: disposition.safeReason, since: at, observedAt: at, deadlineAt, nextCheckAt: nextAttemptAt, remainingRetryBudget: Math.max(0, budgets.maximumRetries - attempt)}; this.runs.update(run);
          await this.wait(delayMs, controller.signal);
          run = this.mustRun(run.id); run = this.transition(run, 'RUNNING'); run.recovery = {state: 'RECONNECTING', reason: 'same_route_retry_started', since: this.clock().toISOString(), observedAt: this.clock().toISOString(), deadlineAt, remainingRetryBudget: Math.max(0, budgets.maximumRetries - attempt - 1)}; this.runs.update(run);
        }
      }
      return this.finalizeResponse(run, response, budgets, saved);
    } catch (error) {
      run = this.mustRun(runId); if (!terminal(run.status) && run.status !== 'AUTHENTICATION_BLOCKED') {
        const timeout = controller.signal.aborted && controller.signal.reason === 'job_timeout', cancelled = controller.signal.aborted && !timeout, at = this.clock().toISOString();
        if (controller.signal.aborted && run.activeExecution) {
          run.status = 'DISCONNECTED'; this.updateExecution(run, 'UNKNOWN'); run.recovery = {state: cancelled ? 'CANCELLING' : 'RECONCILIATION_REQUIRED', reason: cancelled ? 'cancellation_cleanup_unproven' : 'timeout_cleanup_unproven', since: at, observedAt: at, deadlineAt}; const failure = cancelled ? safeReason(controller.signal.reason) : 'job_timeout_budget_exceeded:execution_state_unproven'; if (!run.errors.includes(failure)) run.errors.push(failure); run.transitions.push({status: run.status, at, detail: run.recovery.reason});
        } else {
          run.status = 'FAILED'; run.completedAt = at; run.errors.push(error instanceof Error ? safeReason(error.message) : safeReason(error)); run.transitions.push({status: run.status, at, detail: run.errors.at(-1)}); run.recovery = {state: 'UNRECOVERABLE', reason: run.errors.at(-1)!, since: at, observedAt: at, deadlineAt}; run.immutable = true;
        }
        this.runs.update(run);
      }
      return this.runs.get(run.id)!;
    } finally { clearTimeout(timer); this.active.delete(activeKey); }
  }

  cancel(runId: string, actor: string) {
    const run = this.mustRun(runId); if (terminal(run.status)) return run;
    const reason = `cancelled_by:${safeReason(actor)}`, controller = this.active.get(run.savedJobId ?? run.id), at = this.clock().toISOString();
    if (controller) { controller.abort(reason); run.status = 'CANCELLING'; run.transitions.push({status: run.status, at, detail: reason}); run.errors.push(reason); run.recovery = {state: 'CANCELLING', reason: 'termination_requested_cleanup_pending', since: at, observedAt: at}; this.runs.update(run); return this.mustRun(runId); }
    if (run.activeExecution && ['DISCONNECTED', 'RECONNECTING', 'CANCELLING'].includes(run.status)) { run.status = 'CANCELLING'; run.transitions.push({status: run.status, at, detail: reason}); if (!run.errors.includes(reason)) run.errors.push(reason); run.recovery = {state: 'CANCELLING', reason: 'authoritative_execution_cancellation_required', since: at, observedAt: at}; this.runs.update(run); return this.mustRun(runId); }
    run.status = 'CANCELLED'; run.completedAt = at; run.transitions.push({status: 'CANCELLED', at, detail: reason}); run.errors.push(reason); run.recovery = {state: 'NONE', reason: 'cancelled_before_execution', since: at, observedAt: at}; run.immutable = true; this.runs.update(run); return this.mustRun(runId);
  }

  resumeAuthentication(runId: string, actor: string) {
    const run = this.mustRun(runId), blockedAt = run.recovery?.since;
    if (run.status !== 'AUTHENTICATION_BLOCKED' || run.recovery?.state !== 'AUTHENTICATION_REQUIRED') throw new ParameterizedJobError('job_run_not_authentication_blocked', runId);
    if (!run.modelRoute?.accountProfileId || !blockedAt) throw new ParameterizedJobError('authentication_recovery_route_missing', runId);
    const qualification = this.models.accountQualification(run.modelRoute.providerId, run.modelRoute.accountProfileId), checkedAt = Date.parse(qualification.checkedAt), blockedTime = Date.parse(blockedAt);
    if (qualification.state !== 'QUALIFIED' || !Number.isFinite(checkedAt) || !Number.isFinite(blockedTime) || checkedAt <= blockedTime) throw new ParameterizedJobError('account_profile_requalification_required', run.modelRoute.accountProfileId);
    run.modelRoute = this.revalidateRoute(run.modelRoute);
    const at = this.clock().toISOString(); run.status = 'QUEUED'; run.transitions.push({status: run.status, at, detail: `authentication_requalified_same_route:${safeReason(actor)}`}); run.recovery = {state: 'NONE', reason: 'authentication_requalified_same_route', since: at, observedAt: qualification.checkedAt};
    this.runs.update(run); return this.mustRun(runId);
  }

  async reconcile(runId: string) {
    let run = this.mustRun(runId); if (!run.activeExecution || !['DISCONNECTED', 'RECONNECTING', 'CANCELLING'].includes(run.status)) return run;
    const execution = structuredClone(run.activeExecution), at = this.clock().toISOString();
    if (run.status === 'CANCELLING' || run.recovery?.state === 'CANCELLING') {
      if (!this.executor.cancel) return run;
      const result = await this.executor.cancel(structuredClone(run), execution, run.errors.at(-1) ?? 'cancelled_by:operator'); run = this.mustRun(runId);
      if (result.executionId !== execution.id || !result.cleanupConfirmed || result.state !== 'CANCELLED') { run.status = 'DISCONNECTED'; run.recovery = {state: 'RECONCILIATION_REQUIRED', reason: result.executionId !== execution.id ? 'cancellation_execution_identity_mismatch' : 'cancellation_cleanup_unproven', since: at, observedAt: result.observedAt}; run.transitions.push({status: run.status, at, detail: run.recovery.reason}); this.runs.update(run); return this.mustRun(runId); }
      this.updateExecution(run, 'CANCELLED', result.observedAt); run.status = 'CANCELLED'; run.completedAt = result.observedAt; run.recovery = {state: 'NONE', reason: 'cancellation_confirmed', since: at, observedAt: result.observedAt}; run.transitions.push({status: run.status, at: result.observedAt, detail: 'authoritative_cleanup_confirmed'}); run.immutable = true; this.runs.update(run); return this.mustRun(runId);
    }
    if (!this.executor.reconcile) return run;
    run.status = 'RECONNECTING'; run.recovery = {state: 'RECONNECTING', reason: 'querying_authoritative_execution', since: at, observedAt: at, nextCheckAt: new Date(this.clock().getTime() + (this.options.recoveryPollSeconds ?? 5) * 1000).toISOString()}; run.transitions.push({status: run.status, at, detail: run.recovery.reason}); this.runs.update(run);
    const result = await this.executor.reconcile(structuredClone(run), execution); run = this.mustRun(runId);
    if (result.executionId !== execution.id || !result.continuityProven) { run.status = 'DISCONNECTED'; run.recovery = {state: 'RECONCILIATION_REQUIRED', reason: result.executionId !== execution.id ? 'execution_identity_changed' : 'execution_continuity_unproven', since: at, observedAt: result.observedAt}; this.updateExecution(run, 'UNKNOWN', result.observedAt); run.transitions.push({status: run.status, at: result.observedAt, detail: run.recovery.reason}); this.runs.update(run); return this.mustRun(runId); }
    if (result.activeTurnId && result.activeTurnId !== run.activeExecution?.activeTurnId) { run.activeExecution!.activeTurnId = result.activeTurnId; run.transitions.push({status: 'RECONNECTING', at: result.observedAt, detail: 'authoritative_active_turn_changed'}); }
    if (result.state === 'RUNNING') { this.updateExecution(run, 'RECONNECTING', result.observedAt); run.recovery = {state: 'RECONNECTING', reason: 'original_execution_still_running', since: at, observedAt: result.observedAt, nextCheckAt: new Date(this.clock().getTime() + (this.options.recoveryPollSeconds ?? 5) * 1000).toISOString()}; this.runs.update(run); return this.mustRun(runId); }
    if (result.state === 'COMPLETED' && result.response) { this.updateExecution(run, 'COMPLETED', result.observedAt); const saved = run.savedJobId ? this.savedJobs.get(run.savedJobId) : undefined; return this.finalizeResponse(run, result.response, mergeBudgets(run.definition.budgets, saved?.budgets), saved); }
    if (result.state === 'CANCELLED') { this.updateExecution(run, 'CANCELLED', result.observedAt); run.status = 'CANCELLED'; run.completedAt = result.observedAt; run.transitions.push({status: run.status, at: result.observedAt, detail: 'authoritative_execution_cancelled'}); run.immutable = true; this.runs.update(run); return this.mustRun(runId); }
    if (result.state === 'FAILED') { this.updateExecution(run, 'FAILED', result.observedAt); run.status = 'FAILED'; run.completedAt = result.observedAt; run.errors.push('authoritative_execution_failed'); run.transitions.push({status: run.status, at: result.observedAt, detail: 'authoritative_execution_failed'}); run.immutable = true; this.runs.update(run); return this.mustRun(runId); }
    this.updateExecution(run, 'UNKNOWN', result.observedAt); run.status = 'DISCONNECTED'; run.recovery = {state: 'RECONCILIATION_REQUIRED', reason: 'authoritative_execution_state_unknown', since: at, observedAt: result.observedAt}; run.transitions.push({status: run.status, at: result.observedAt, detail: run.recovery.reason}); this.runs.update(run); return this.mustRun(runId);
  }

  async reconcileInterrupted() {
    const changed: ParameterizedJobRun[] = [];
    for (const run of this.runs.list().filter(item => ['DISCONNECTED', 'RECONNECTING', 'CANCELLING'].includes(item.status) && !item.immutable)) {
      const next = run.recovery?.nextCheckAt; if (next && Date.parse(next) > this.clock().getTime()) continue;
      const reconciled = await this.reconcile(run.id); if (reconciled.status !== run.status || reconciled.transitions.length !== run.transitions.length) changed.push(reconciled);
    }
    return changed;
  }
  private recoverInterruptedRuns() {
    for (const run of this.runs.list().filter(item => ['RESOLVING', 'RUNNING', 'VALIDATING'].includes(item.status) && !item.immutable)) {
      const at = this.clock().toISOString();
      if (run.status === 'RESOLVING' && !run.activeExecution) { run.status = 'QUEUED'; run.recovery = {state: 'NONE', reason: 'controller_restart_local_resolution_safe_to_resume', since: at, observedAt: at}; run.transitions.push({status: 'QUEUED', at, detail: run.recovery.reason}); this.runs.update(run); continue; }
      run.status = 'DISCONNECTED'; if (run.activeExecution) this.updateExecution(run, 'UNKNOWN', at);
      run.recovery = {state: 'RECONCILIATION_REQUIRED', reason: run.activeExecution ? 'controller_restart_requires_authoritative_reconciliation' : 'controller_restart_execution_identity_missing', since: at, observedAt: at};
      run.transitions.push({status: 'DISCONNECTED', at, detail: run.recovery.reason});
      this.runs.update(run);
    }
  }
  private executionIdentity(run: ParameterizedJobRun, route: NonNullable<ParameterizedJobRun['modelRoute']>, sequence: number): ParameterizedExecutionIdentity {
    const at = this.clock().toISOString(); return {id: `repository-review:${run.id}:${sequence}`, sequence, providerId: route.providerId, accountProfileId: route.accountProfileId ?? null, modelId: route.modelId, nodeId: route.nodeId, workloadNodeId: route.workloadNodeId, providerExecutionNodeId: route.providerExecutionNodeId, credentialNodeId: route.credentialNodeId ?? null, startedAt: at, state: 'STARTING', observedAt: at};
  }
  private syncExecution(run: ParameterizedJobRun, execution: ParameterizedExecutionIdentity) { run.providerExecutions ??= []; const index = run.providerExecutions.findIndex(item => item.id === execution.id); if (index < 0) run.providerExecutions.push(structuredClone(execution)); else run.providerExecutions[index] = structuredClone(execution); }
  private updateExecution(run: ParameterizedJobRun, state: ParameterizedExecutionIdentity['state'], observedAt = this.clock().toISOString()) { if (!run.activeExecution) return; run.activeExecution.state = state; run.activeExecution.observedAt = observedAt; this.syncExecution(run, run.activeExecution); }
  private finalizeResponse(run: ParameterizedJobRun, response: ReviewExecutionResponse, budgets: JobBudgetPolicy, saved?: SavedJob) {
    const repository = run.repository; if (!repository) throw new ParameterizedJobError('frozen_repository_snapshot_unavailable');
    if (!response.workParcelIds.length) throw new ParameterizedJobError('repository_review_work_parcel_missing');
    run.workParcelIds = [...new Set([...run.workParcelIds, ...response.workParcelIds])]; run.evidence = [...new Set([...run.evidence, ...response.evidence])]; run.providerResponseIds = [...new Set([...run.providerResponseIds, ...response.providerResponseIds])]; run.fallbackHistory = [...run.fallbackHistory, ...(response.governedFallbacks ?? [])]; run.usage = mergeRunUsage(run.usage, response.usage); run.transportIntegrity = response.transportIntegrity; this.updateExecution(run, 'COMPLETED'); this.runs.update(run);
    if (budgets.maxCost !== undefined && run.usage.cost === undefined) throw new ParameterizedJobError('job_cost_budget_unenforceable');
    if (budgets.maxCost !== undefined && run.usage.cost! > budgets.maxCost) throw new ParameterizedJobError('job_cost_budget_exceeded');
    run = this.transition(run, 'VALIDATING'); this.runs.update(run); run.result = validateRepositoryReview(response.result, repository);
    run.status = run.result.verdict === 'PASS' ? 'SUCCEEDED' : run.result.verdict === 'PASS_WITH_FINDINGS' ? 'SUCCEEDED_WITH_FINDINGS' : run.result.verdict === 'REVIEW_REQUIRED' ? 'DEGRADED' : 'FAILED';
    this.executor.recordVerification?.(response.workParcelIds, run.result.verdict);
    run.completedAt = this.clock().toISOString(); run.transitions.push({status: run.status, at: run.completedAt, detail: run.result.verdict}); run.recovery = {state: 'NONE', reason: 'verified_terminal_outcome', since: run.completedAt, observedAt: run.completedAt}; run.immutable = true;
    this.runs.update(run);
    if (['SUCCEEDED', 'SUCCEEDED_WITH_FINDINGS'].includes(run.status) && saved) this.baselines.advance(saved.id, repository, run.id, run.completedAt);
    return this.mustRun(run.id);
  }
  private restoreFrozenRepository(repository: NonNullable<ParameterizedJobRun['repository']>) {
    try {
      if (repository.snapshotKind === 'remote-immutable-archive') {
        if (!repository.bundlePath || !repository.bundleSha256 || createHash('sha256').update(fs.readFileSync(repository.bundlePath)).digest('hex') !== repository.bundleSha256 || !fs.statSync(repository.snapshotPath).isDirectory()) throw new Error('bundle_mismatch');
        return repository;
      }
      const actual = execFileSync('git', ['-C', repository.snapshotPath, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
      if (actual !== repository.reviewedSha) throw new Error('sha_mismatch');
      return repository;
    } catch { throw new ParameterizedJobError('frozen_repository_snapshot_unavailable', repository.reviewedSha); }
  }
  private transition(run: ParameterizedJobRun, status: ParameterizedRunStatus) { run.status = status; run.transitions.push({status, at: this.clock().toISOString()}); return run; }
  private revalidateRoute(sealed: NonNullable<ParameterizedJobRun['modelRoute']>) {
    const current = this.models.route({model: sealed.modelId, accountProfile: sealed.accountProfileId ?? undefined, nodeId: sealed.workloadNodeId, workloadNodeId: sealed.workloadNodeId, providerExecutionNodeId: sealed.providerExecutionNodeId, requiredCapabilities: sealed.requiredCapabilities ?? ['repository-review'], allowFallback: false, purpose: sealed.purpose});
    const identity = (route: typeof sealed) => [route.providerId, route.accountProfileId, route.modelId, route.workloadNodeId, route.providerExecutionNodeId, route.credentialNodeId];
    if (JSON.stringify(identity(current)) !== JSON.stringify(identity(sealed))) throw new ParameterizedJobError('recovery_route_identity_changed', sealed.modelId);
    return {...sealed, accountLabel: current.accountLabel, accountPlan: current.accountPlan, accountPlanAuthority: current.accountPlanAuthority, accountQualification: current.accountQualification, accountAvailability: current.accountAvailability, qualificationVersion: current.qualificationVersion, nativeCapabilities: current.nativeCapabilities, emulatedCapabilities: current.emulatedCapabilities, considered: current.considered};
  }
  private mustRun(id: string) { const run = this.runs.get(id); if (!run) throw new ParameterizedJobError('job_run_missing', id); return run; }
}

function mergeBudgets(base: JobBudgetPolicy, overrides?: Partial<JobBudgetPolicy>): JobBudgetPolicy { return {...base, ...overrides}; }
function isAncestor(repository: string, prior: string, current: string) { try { execFileSync('git', ['-C', repository, 'merge-base', '--is-ancestor', prior, current], {stdio: 'ignore'}); return true; } catch { return false; } }
function abortableDelay(milliseconds: number, signal?: AbortSignal) { return new Promise<void>((resolve, reject) => { if (signal?.aborted) { reject(signal.reason ?? new Error('recovery_cancelled')); return; } const timer = setTimeout(() => { signal?.removeEventListener('abort', aborted); resolve(); }, milliseconds); const aborted = () => { clearTimeout(timer); reject(signal?.reason ?? new Error('recovery_cancelled')); }; signal?.addEventListener('abort', aborted, {once: true}); }); }
function safeReason(value: unknown) { return String(value).replace(/(?:bearer\s+|sk-)[A-Za-z0-9._-]{8,}/gi, '[REDACTED]').replace(/(password|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]\s*\S+/gi, '$1=[REDACTED]').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[REDACTED_ACCOUNT]').slice(0, 1024); }

function mergeRunUsage(left: ParameterizedJobRun['usage'], right: ParameterizedJobRun['usage']): ParameterizedJobRun['usage'] {
  const observed = (value: ParameterizedJobRun['usage']) => (value.accountedInvocations ?? 0) > 0 || ['inputTokens','outputTokens','totalTokens','providerReportedCost','calculatedCost','cost'].some(field => value[field as keyof typeof value] !== undefined);
  if (!observed(left)) return structuredClone(right);
  if (!observed(right)) return structuredClone(left);
  const sum = (field: 'inputTokens'|'freshInputTokens'|'cachedInputTokens'|'cacheWriteTokens'|'outputTokens'|'totalTokens'|'providerReportedCost'|'calculatedCost'|'cost') => left[field] === undefined || right[field] === undefined ? undefined : left[field]! + right[field]!;
  const unknownUsageInvocations = (left.unknownUsageInvocations ?? 0) + (right.unknownUsageInvocations ?? 0), cost = sum('cost'), providerReportedCost = sum('providerReportedCost'), calculatedCost = sum('calculatedCost');
  const source = cost === undefined ? 'unavailable' as const : left.source === 'provider' && right.source === 'provider' ? 'provider' as const : 'calculated' as const;
  return {inputTokens: sum('inputTokens'), freshInputTokens: sum('freshInputTokens'), cachedInputTokens: sum('cachedInputTokens'), cacheWriteTokens: sum('cacheWriteTokens'), outputTokens: sum('outputTokens'), totalTokens: sum('totalTokens'), providerReportedCost, calculatedCost, cost, ...(left.currency && right.currency && left.currency === right.currency ? {currency: left.currency} : {}), accountedInvocations: (left.accountedInvocations ?? 1) + (right.accountedInvocations ?? 1), unknownUsageInvocations, source};
}

export function createParameterizedJobEngine(root: string, definitions: ParameterizedJobRegistry, models: ModelRegistry, executor: RepositoryReviewExecutor, options: Omit<ParameterizedJobEngineOptions, 'snapshotsRoot'> & {snapshotsRoot?: string}, repositories?: RepositoryResolver, transcriptSources?: {parcels: WorkParcelStore; tokenRouting?: TokenAwareBatonRuntime}) {
  const jobsRoot = path.join(root, 'parameterized-jobs'); fs.mkdirSync(jobsRoot, {recursive: true});
  const savedJobs = new SavedJobStore(path.join(jobsRoot, 'saved-jobs.json'), definitions, options.clock), runs = new ParameterizedRunStore(path.join(jobsRoot, 'runs.json')), baselines = new ReviewBaselineStore(path.join(jobsRoot, 'review-baselines.json'));
  const transcripts = transcriptSources ? new ExecutionTranscriptRuntime(path.join(jobsRoot, 'execution-transcripts'), runs, savedJobs, transcriptSources.parcels, transcriptSources.tokenRouting) : undefined;
  return new ParameterizedJobEngine(definitions, savedJobs, runs, baselines, models, executor, {...options, snapshotsRoot: options.snapshotsRoot ?? path.join(jobsRoot, 'snapshots')}, repositories, transcripts);
}

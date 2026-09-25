import {TargetReset,type ResetAuthority} from './target-reset.js';
import {ContractExecutionRuntime} from './contract-runtime.js';
import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {assertNoSensitiveMaterial, redactSensitiveValue} from './security-redaction.js';
import type {ResourceConfig} from './config.js';
import {effectiveParameters, nextCronOccurrence, type JobCatalog} from './job-catalog.js';
import {jobPriorityRank, type ActionFailureClass, type ActionHandler, type ActionOutput, type AgentActionHandler, type ArtifactRecord, type PlacementRationale, type RecoveryFailureKind, type RetryPolicy, type RunRecord, type RunStatus, type ScheduleState, type StepAttempt, type StepStatus, type WorkerExecutionIdentity, type WorkerRegistration} from './job-types.js';
import type {HarnessEfficiencyLedgerPort, InvocationFinalResult} from './harness-efficiency.js';
import {OwnedProcessManager, type ExecutionCleanupReport, type OwnedExecution} from './owned-process.js';
import type {ExecutionSessionRuntime, ExecutionSessionScope} from './execution-session.js';
import {deriveRuntimeActionIntent, type RuntimeActionCategory, type RuntimeEffectDeclaration, type RuntimeSafetySupervisorPort} from './runtime-safety-supervisor.js';
import {compileResourcePolicies, isExternalMutation, type ActionGovernancePlan, type ActionGovernanceResolver, type ExternalOperationRecord, type ExternalOperationState} from './action-governance.js';
import {createActivityLogProjection, type ActivityLogProjection} from './activity-log.js';

function writeJsonAtomic(file: string, value: unknown, durable = false) { fs.mkdirSync(path.dirname(file), {recursive: true}); const temporary = `${file}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(redactSensitiveValue(value), null, 2)}\n`, {mode: 0o600, flush: durable}); fs.renameSync(temporary, file); if (durable && process.platform !== 'win32') { const fd=fs.openSync(path.dirname(file),'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } } }
function now() { return new Date().toISOString(); }
function canonicalJson(value:unknown):string { if(Array.isArray(value))return`[${value.map(canonicalJson).join(',')}]`;if(value&&typeof value==='object')return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;return JSON.stringify(value)??'null'; }
const ACTIVE_RUNS: RunStatus[] = ['SCHEDULED', 'QUEUED', 'WAITING', 'AUTHENTICATION_BLOCKED', 'RECONNECTING', 'RUNNING', 'VERIFYING', 'CANCELLING', 'CLEANUP_UNCERTAIN', 'DISCONNECTED'];
const TERMINAL_STEPS: StepStatus[] = ['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELLED'];
const EXECUTION_OWNED_STEPS: StepStatus[] = ['DISPATCHED', 'RUNNING', 'VERIFYING', 'CANCEL_PENDING', 'CLEANUP_UNCERTAIN'];

export class ActionFailure extends Error {
  readonly recoveryKind: RecoveryFailureKind;
  constructor(message: string, readonly failureClass: ActionFailureClass, readonly retryable = false, recoveryKind?: RecoveryFailureKind) {
    super(message); this.name = 'ActionFailure';
    this.recoveryKind = recoveryKind ?? (failureClass === 'authentication' ? 'authentication-required' : failureClass === 'configuration' ? 'permanent-configuration' : retryable ? 'transient-transport' : 'execution');
  }
}
class StepTimeoutError extends Error { constructor(readonly timeoutSeconds: number, readonly elapsedMs: number) { super(`step_timeout:${timeoutSeconds}s:${elapsedMs}ms`); this.name = 'StepTimeoutError'; } }
export class ActionRegistry {
  private readonly actions = new Map<string, ({kind: 'control'; handler: ActionHandler; governance?: ActionGovernanceResolver} | {kind: 'agent'; handler: AgentActionHandler; governance?: ActionGovernanceResolver}) & {effectDeclaration: RuntimeEffectDeclaration}>();
  /** Legacy registration is deliberately UNKNOWN when runtime safety is active. */
  register(id: string, handler: ActionHandler) { return this.registerControl(id, handler); }
  registerReadOnly(id: string, handler: ActionHandler) { this.assertRegistration(id); this.actions.set(id, {kind: 'control', handler, effectDeclaration: {mode: 'READ_ONLY'}}); return this; }
  registerControl(id: string, handler: ActionHandler) { this.assertRegistration(id); this.actions.set(id, {kind: 'control', handler, effectDeclaration: {mode: 'UNKNOWN'}}); return this; }
  registerConsequentialControl(id: string, handler: ActionHandler, categories: RuntimeActionCategory[]) { this.assertRegistration(id); this.actions.set(id, {kind: 'control', handler, effectDeclaration: {mode: 'CATEGORIES', categories: [...new Set(categories)]}}); return this; }
  registerGovernedControl(id: string, handler: ActionHandler, governance: ActionGovernanceResolver) { this.assertRegistration(id); this.actions.set(id, {kind: 'control', handler, governance, effectDeclaration: {mode: 'RESOLVED_EFFECTS'}}); return this; }
  /** Model-backed Actions can only be registered through an adaptive-harness handler. */
  registerAgent(id: string, handler: AgentActionHandler, categories?: RuntimeActionCategory[]) { this.assertRegistration(id); if (handler.path !== 'adaptive-harness') throw new Error('agent_action_must_use_adaptive_harness'); if (categories?.includes('READ_ONLY')) throw new Error('agent_action_effect_declaration_invalid'); this.actions.set(id, {kind: 'agent', handler, effectDeclaration: categories?.length ? {mode: 'CATEGORIES', categories: [...new Set(categories)]} : {mode: 'UNKNOWN'}}); return this; }
  has(id: string) { return this.actions.has(id); }
  ids() { return new Set(this.actions.keys()); }
  kind(id: string) { return this.resolve(id).kind; }
  resolve(id: string) { const action = this.actions.get(id); if (!action) throw new ActionFailure(`action_not_registered:${id}`, 'configuration'); return action; }
  handler(id: string): ActionHandler { const action = this.resolve(id); return action.kind === 'control' ? action.handler : context => action.handler.execute(context); }
  private assertRegistration(id: string) { if (!/^[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+$/.test(id)) throw new Error('invalid_action_id'); if (this.actions.has(id)) throw new Error('action_exists'); }
}

export class WorkerRegistry {
  private readonly workers = new Map<string, WorkerRegistration>();
  private readonly identities = new Map<string, WorkerExecutionIdentity>();
  constructor(private readonly controllerNodeId = 'controller') {}
  /** Unqualified registrations remain schedulable but fail closed under runtime safety. */
  register(worker: WorkerRegistration) { return this.registerEstablished(worker, unknownWorkerIdentity(worker.id)); }
  /** Trusted product-code path for workers that execute inside this controller process. */
  registerControllerInternal(worker: WorkerRegistration) { return this.registerEstablished(worker, {workerId: worker.id, nodeId: this.controllerNodeId, locality: 'CONTROLLER_LOCAL', authority: 'AGENT_CONTROL_INTERNAL', controllerRelationship: 'CONTROLLER_INTERNAL'}); }
  upsert(worker: WorkerRegistration) { this.workers.set(worker.id, structuredClone(worker)); if (!this.identities.has(worker.id)) this.identities.set(worker.id, unknownWorkerIdentity(worker.id)); return this; }
  observe(worker: Omit<WorkerRegistration, 'active'>) { const current = this.workers.get(worker.id); this.workers.set(worker.id, structuredClone({...worker, active: current?.active ?? 0})); if (!this.identities.has(worker.id)) this.identities.set(worker.id, unknownWorkerIdentity(worker.id)); return this; }
  list() { return [...this.workers.values()].map(worker => structuredClone(worker)); }
  executionIdentity(id: string) { const identity = this.identities.get(id); return structuredClone(identity ?? unknownWorkerIdentity(id)); }
  executionIdentities() { return [...this.identities.values()].map(identity => structuredClone(identity)); }
  setHealth(id: string, health: WorkerRegistration['health']) { const worker = this.workers.get(id); if (!worker) throw new Error('worker_missing'); worker.health = health; worker.observedAt = now(); }
  resolve(required: string[], at = new Date()): {worker?: WorkerRegistration; rationale: PlacementRationale} {
    const eligible: WorkerRegistration[] = [], rejected: PlacementRationale['rejected'] = [];
    for (const worker of this.workers.values()) {
      const reasons: string[] = [];
      if (worker.health !== 'healthy') reasons.push(`health:${worker.health}`);
      if (worker.active >= worker.capacity) reasons.push('capacity_exhausted');
      for (const capability of required) {
        if (worker.blockedCapabilities?.includes(capability)) reasons.push(`workload_blocked:${capability}`);
        if (!worker.capabilities.includes(capability)) reasons.push(`missing:${capability}`);
        const expiry = worker.capabilityExpiresAt?.[capability]; if (expiry && Date.parse(expiry) <= at.getTime()) reasons.push(`expired:${capability}`);
      }
      if (reasons.length) rejected.push({workerId: worker.id, reasons}); else eligible.push(worker);
    }
    eligible.sort((a, b) => a.active - b.active || b.capacity - a.capacity || a.id.localeCompare(b.id));
    const worker = eligible[0];
    return {worker: worker ? structuredClone(worker) : undefined, rationale: {selected: worker?.id, eligible: eligible.map(item => item.id), rejected, reasons: worker ? required.map(capability => `satisfies:${capability}`).concat(['healthy', 'available']) : ['no_eligible_worker']}};
  }
  claim(id: string) { const worker = this.workers.get(id); if (!worker || worker.health !== 'healthy' || worker.active >= worker.capacity) throw new Error('worker_not_claimable'); worker.active++; }
  release(id: string) { const worker = this.workers.get(id); if (worker) worker.active = Math.max(0, worker.active - 1); }
  schedulerCapacity() { return Math.max(1, Math.min(32, [...this.workers.values()].filter(worker => worker.health === 'healthy').reduce((total, worker) => total + worker.capacity, 0))); }
  private registerEstablished(worker: WorkerRegistration, identity: WorkerExecutionIdentity) { if (this.workers.has(worker.id)) throw new Error('worker_exists'); this.workers.set(worker.id, structuredClone(worker)); this.identities.set(worker.id, structuredClone(identity)); return this; }
  static fromConfig(resources: ResourceConfig[]) {
    const explicitControllers = resources.filter(resource => resource.controller === true && resource.transport.type === 'local').sort((left, right) => left.id.localeCompare(right.id));
    const registry = new WorkerRegistry(explicitControllers.length === 1 ? explicitControllers[0]!.id : 'controller');
    for (const resource of resources) {
      const local = resource.transport.type === 'local', controller = local && resource.controller === true;
      registry.registerEstablished(
        {id: resource.id, capabilities: [...resource.capabilities], health: 'unknown', capacity: Number(resource.metadata?.capacity ?? 1), active: 0, labels: Object.fromEntries(Object.entries(resource.metadata ?? {}).map(([key, value]) => [key, String(value)])), observedAt: now()},
        {workerId: resource.id, nodeId: resource.id, locality: controller ? 'CONTROLLER_LOCAL' : local ? 'LOCAL_WORKER' : 'REMOTE_WORKER', authority: 'CONFIGURED_RESOURCE', controllerRelationship: controller ? 'CONTROLLER_RESOURCE' : local ? 'CONTROLLER_HOST_RESOURCE' : 'REMOTE_RESOURCE'},
      );
    }
    return registry;
  }
}

function unknownWorkerIdentity(workerId: string): WorkerExecutionIdentity { return {workerId, nodeId: null, locality: 'UNKNOWN', authority: 'UNVERIFIED', controllerRelationship: 'UNKNOWN'}; }

interface LockSnapshot {version: 1; locks: Array<{resource: string; runId: string; stepId: string; acquiredAt: string; retained?: boolean}>;}
export class ResourceLockManager {
  private readonly locks = new Map<string, {resource: string; runId: string; stepId: string; acquiredAt: string; retained?: boolean}>();
  constructor(readonly file: string) { if (fs.existsSync(file)) { const snapshot = JSON.parse(fs.readFileSync(file, 'utf8')) as LockSnapshot; if (snapshot.version !== 1) throw new Error('unsupported_resource_lock_snapshot'); for (const lock of snapshot.locks) this.locks.set(lock.resource, lock); } }
  acquire(resources: string[], runId: string, stepId: string, retained = false) { const blocked: Array<{resource: string; runId: string; stepId: string; acquiredAt: string}> = []; for (const resource of resources) { const lock = this.locks.get(resource); if (lock && (lock.runId !== runId || lock.stepId !== stepId)) blocked.push(lock); } if (blocked.length) return {ok: false as const, blocked}; for (const resource of resources) this.locks.set(resource, {resource, runId, stepId, acquiredAt: now(), ...(retained || this.locks.get(resource)?.retained ? {retained: true} : {})}); this.save(); return {ok: true as const}; }
  release(runId: string, stepId?: string) { for (const [resource, lock] of this.locks) if (lock.runId === runId && (stepId ? lock.stepId === stepId : !lock.retained)) this.locks.delete(resource); this.save(); }
  list() { return [...this.locks.values()].map(lock => ({...lock})); }
  private save() { writeJsonAtomic(this.file, {version: 1, locks: this.list()} satisfies LockSnapshot); }
}

interface ArtifactSnapshot {version: 1; artifacts: ArtifactRecord[];}
export class ArtifactStore {
  private readonly records = new Map<string, ArtifactRecord>();
  private readonly metadataFile: string;
  private readonly objectDir: string;
  constructor(readonly root: string) { this.metadataFile = path.join(root, 'artifacts.json'); this.objectDir = path.join(root, 'objects'); if (fs.existsSync(this.metadataFile)) { const snapshot = JSON.parse(fs.readFileSync(this.metadataFile, 'utf8')) as ArtifactSnapshot; if (snapshot.version !== 1) throw new Error('unsupported_artifact_snapshot'); for (const record of snapshot.artifacts) this.records.set(record.id, redactSensitiveValue(record)); } }
  create(run: RunRecord, stepId: string, workerId: string, declaration: {name: string; type: string; schema: string; version: string; retention?: string}, value: unknown) {
    const safeValue = redactSensitiveValue(value), bytes = Buffer.from(`${JSON.stringify(safeValue, null, 2)}\n`), sha256 = createHash('sha256').update(bytes).digest('hex'), id = `artifact-${randomUUID()}`, objectFile = path.join(this.objectDir, `${id}.json`);
    fs.mkdirSync(this.objectDir, {recursive: true}); fs.writeFileSync(objectFile, bytes, {mode: 0o600, flush: true});
    const step = run.steps.find(item => item.id === stepId)!;
    const record: ArtifactRecord = {id, runId: run.id, stepId, name: declaration.name, type: declaration.type, schema: declaration.schema, version: declaration.version, createdAt: now(), size: bytes.length, sha256, storageRef: objectFile, retention: declaration.retention ?? 'run-history', provenance: {jobId: run.jobId, jobVersion: run.jobVersion, action: step.action, workerId}};
    const safeRecord = redactSensitiveValue(record); this.records.set(id, safeRecord); this.save(); return structuredClone(safeRecord);
  }
  get(id: string) { const record = this.records.get(id); return record ? structuredClone(record) : undefined; }
  readText(id: string) { const record = this.records.get(id); if (!record) throw new Error('artifact_missing'); const bytes = fs.readFileSync(record.storageRef); if (createHash('sha256').update(bytes).digest('hex') !== record.sha256) throw new Error('artifact_checksum_mismatch'); return bytes.toString('utf8'); }
  read(id: string) { return JSON.parse(this.readText(id)); }
  list(runId?: string) { return [...this.records.values()].filter(record => !runId || record.runId === runId).map(record => structuredClone(record)); }
  private save() { writeJsonAtomic(this.metadataFile, {version: 1, artifacts: this.list()} satisfies ArtifactSnapshot, true); }
}

interface LedgerSnapshot {version: 1; runs: RunRecord[]; schedules: ScheduleState[];}
export class RunLedger {
  private readonly listeners = new Set<(runId: string, type: string, status: string) => void>();
  subscribe(listener: (runId: string, type: string, status: string) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private readonly runs = new Map<string, RunRecord>(); private readonly schedules = new Map<string, ScheduleState>(); private readonly eventsFile: string;
  constructor(readonly file: string,readonly activityLog?:ActivityLogProjection,readonly activityEvidence?:(run:RunRecord)=>Record<string,unknown>) { this.eventsFile = path.join(path.dirname(file), 'run-events.jsonl'); if (fs.existsSync(file)) { const snapshot = JSON.parse(fs.readFileSync(file, 'utf8')) as LedgerSnapshot; if (snapshot.version !== 1) throw new Error('unsupported_run_ledger'); for (const run of snapshot.runs) this.runs.set(run.id, redactSensitiveValue(run)); for (const schedule of snapshot.schedules ?? []) this.schedules.set(schedule.scheduleId, redactSensitiveValue(schedule)); } }
  add(run: RunRecord) { if (this.runs.has(run.id)) throw new Error('run_exists'); run.updatedAt = run.requestedAt; this.runs.set(run.id, structuredClone(redactSensitiveValue(run))); this.record(run.id, 'run.created', run.status); return this.get(run.id)!; }
  update(run: RunRecord, event = 'run.updated', evidence?: Record<string, unknown>) { if (!this.runs.has(run.id)) throw new Error('run_missing'); run.updatedAt = now(); this.runs.set(run.id, structuredClone(redactSensitiveValue(run))); this.record(run.id, event, run.status, evidence); return this.get(run.id)!; }
  get(id: string) { const run = this.runs.get(id); return run ? structuredClone(run) : undefined; }
  list(jobId?: string) { return [...this.runs.values()].filter(run => !jobId || run.jobId === jobId).sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt)).map(run => structuredClone(run)); }
  schedule(id: string) { const state = this.schedules.get(id); return state ? structuredClone(state) : undefined; }
  saveSchedule(state: ScheduleState) { this.schedules.set(state.scheduleId, structuredClone(redactSensitiveValue(state))); this.save(); return this.schedule(state.scheduleId)!; }
  scheduleStates() { return [...this.schedules.values()].map(state => structuredClone(state)); }
  recoverFailClosed() { const changed: string[] = []; for (const run of this.runs.values()) { let dirty = false; for (const step of run.steps) if (['DISPATCHED', 'RUNNING', 'VERIFYING', 'CANCEL_PENDING', 'CLEANUP_UNCERTAIN'].includes(step.status)) { step.status = 'FAILED'; step.error = 'execution_identity_unproven_after_restart'; step.endedAt = now(); dirty = true; } if (dirty || ['RUNNING', 'VERIFYING', 'CANCELLING', 'CLEANUP_UNCERTAIN', 'DISCONNECTED'].includes(run.status)) { run.status = 'DISCONNECTED'; run.errors.push('execution_identity_unproven_after_restart'); run.provenance.push({type: 'recovery', at: now(), detail: 'Fail closed: original execution identity not proven'}); changed.push(run.id); } } if (changed.length) this.save(); return changed; }
  private record(runId: string, type: string, status: string, evidence?: Record<string, unknown>) { const event=redactSensitiveValue({at: now(), runId, type, status, ...(evidence ? {evidence} : {})}),run=this.runs.get(runId);fs.mkdirSync(path.dirname(this.file), {recursive: true}); fs.appendFileSync(this.eventsFile, `${JSON.stringify(event)}\n`, {mode: 0o600});try{this.activityLog?.append({...event,evidence:{...(event.evidence??{}),...(run&&this.activityEvidence?this.activityEvidence(run):{})},run});}catch{/* The operational projection cannot impair authoritative orchestration. */}this.save(); for (const listener of this.listeners) { try { listener(runId,type,status); } catch { /* Optional observers cannot impair orchestration. */ } } }
  private save() { writeJsonAtomic(this.file, {version: 1, runs: this.list(), schedules: this.scheduleStates()} satisfies LedgerSnapshot, true); }
}

export interface JobRuntimeOptions {contracts?: ContractExecutionRuntime; now?: () => Date; approval?: (policy: string, run: RunRecord) => boolean; efficiency?: HarnessEfficiencyLedgerPort; safety?: RuntimeSafetySupervisorPort; defaultRecoveryDeadlineSeconds?: number; ownedExecutionFactory?: (scope: ExecutionSessionScope) => OwnedExecution; executionSessions?: ExecutionSessionRuntime;}
export interface JobDispatch {runId: string; completion: Promise<RunRecord | undefined>;}
export class JobRuntime {
  readonly targetResets=new Map<string,TargetReset>();
  registerTargetReset(target:string,recovery:TargetReset){if(this.targetResets.has(target))throw Error('target_recovery_already_registered');this.targetResets.set(target,recovery);}
  async resetTarget(target:string,authority:ResetAuthority){
    const recovery=this.targetResets.get(target);if(!recovery)throw Error('target_reset_unconfigured');
    if(this.controllers.size||this.runCleanups.size||this.ledger.list().some(r=>['QUEUED','WAITING','RUNNING','VERIFYING','RECONNECTING'].includes(r.status)))throw Error('target_reset_active_work');
    if(authority.runId&&!this.ledger.get(authority.runId))throw Error('target_reset_run_missing');
    return recovery.reset(authority);
  }
  private readonly boundaryPending=new Set<string>();
  async prepareTargetContinuation(target:string,authority:import('./target-reset.js').ContinuationAuthority){
    if(this.controllers.size||this.runCleanups.size||this.ledger.list().some(r=>['QUEUED','WAITING','RUNNING','VERIFYING','RECONNECTING'].includes(r.status)))throw Error('target_reset_active_work');
    const recovery=this.targetResets.get(target);if(!recovery)throw Error('target_reset_unconfigured');if(authority.runId&&!this.ledger.get(authority.runId))throw Error('target_reset_run_missing');return recovery.prepareContinuation(authority);
  }
  async executeTargetContinuation(target:string,id:string,authority:ResetAuthority&{target:string}){
    if(this.controllers.size||this.runCleanups.size||this.ledger.list().some(r=>['QUEUED','WAITING','RUNNING','VERIFYING','RECONNECTING'].includes(r.status)))throw Error('target_reset_active_work');
    const recovery=this.targetResets.get(target);if(!recovery)throw Error('target_reset_unconfigured');return recovery.executeContinuation(id,authority);
  }
  async applyTargetBoundary(runId:string,target:string,operationId:string,actor:string,attemptIds:string[]){
    if(this.boundaryPending.has(runId))throw Error('recovery_boundary_in_progress');this.boundaryPending.add(runId);try{
    const run=this.mustRun(runId),recovery=this.targetResets.get(target),receipt=recovery?.state();
    if(!actor||!receipt||receipt.status!=='COMPLETE'||receipt.id!==operationId||receipt.authority.actor!==actor||receipt.authority.runId!==runId||!receipt.pre||!receipt.post||receipt.pre.bootId===receipt.post.bootId)throw Error('recovery_boundary_authority_invalid');
    const existing=this.artifacts.list(runId).find(a=>a.name==='target-recovery-boundary'&&this.artifacts.read(a.id).operationId===operationId);if(existing)return run;
    if(run.steps.length!==1||!['CLEANUP_UNCERTAIN','DISCONNECTED'].includes(run.status)||this.controllers.size||this.runCleanups.size)throw Error('recovery_boundary_active_execution');
    const step=run.steps[0],last=step.attempts.at(-1);if(!last||!last.contractId)throw Error('recovery_boundary_contract_missing');
    if(step.status==='SUCCEEDED'||last.outcome==='SUCCEEDED')throw Error('recovery_boundary_successful_attempt');
    const registrations=this.artifacts.list(runId).filter(a=>a.stepId===step.id&&a.name==='retained-cleanup-registered'&&a.createdAt>=last.startedAt);
    const entries=registrations.map(a=>({meta:a,value:this.artifacts.read(a.id)}));
    if(!entries.length||new Set(attemptIds).size!==entries.length||entries.some(({meta,value:v})=>!attemptIds.includes(v.identity?.attemptId)||typeof v.id!=='string'||!v.id.startsWith('retained-cleanup:')||v.sourceStepId!==step.id||v.workerId!==last.workerId||v.identity?.kind!=='target-runtime'||v.identity?.producer?.runId!==runId||v.identity?.producer?.target!==target||v.identity?.producer?.environment!==recovery!.environment||meta.createdAt>=receipt.startedAt))throw Error('recovery_boundary_attempt_binding_invalid');
    const contract=this.contracts.get(last.contractId);if(contract.pty.writeOwner||contract.state==='ACTIVE')throw Error('recovery_boundary_current_authority');
    const observed=await recovery!.port.observe();
    if(observed.bootId!==receipt.post.bootId||observed.physicalIdentity!==receipt.post.physicalIdentity||!observed.environmentVerified||!observed.service.identity||!observed.service.healthy||!observed.service.expected)throw Error('recovery_boundary_current_state_failed');
    if(recovery!.state()?.id!==operationId||recovery!.state()?.status!=='COMPLETE')throw Error('recovery_boundary_generation_changed');
    recovery!.abandon(attemptIds);
    const artifact=this.artifacts.create(run,step.id,'controller-recovery',{name:'target-recovery-boundary-prepared',type:'json',schema:'agent-control.recovery-boundary/v1',version:'1.0.0'}, {operationId,target,environment:recovery!.environment,actor,receipt,observation:observed,attemptIds,registrationRefs:registrations.map(a=>({id:a.id,sha256:a.sha256})),historicalTermination:'UNPROVEN',historicalCleanup:'CLEANUP_UNCERTAIN',recoveryBoundary:'PREPARED',evidenceWindow:{from:last.startedAt,to:receipt.startedAt},futureExecution:'FRESH_AUTHORITY_AND_ADMISSION_REQUIRED'});
    run.artifacts.push(artifact.id);step.artifactIds.push(artifact.id);
    this.contracts.completeExecution(contract.id,'UNKNOWN',{outcome:'uncertain',detail:'Historical termination unproven; new target boot fences prior execution'}, {processId:contract.process.id,batonGeneration:contract.baton.generation,ownershipGeneration:contract.pty.ownershipGeneration});
    this.ledger.update(run,'run.target_boundary_fenced',{artifactId:artifact.id,operationId});
    for(const {value} of entries)this.locks.release(runId,value.id);
    this.locks.release(runId,step.id);this.retainedCleanups.delete(runId);if(last.workerId)this.workers.release(last.workerId);
    const terminal=run.provenance.some(p=>p.type==='cancellation')||run.errors.some(e=>/cancelled/.test(e))?'CANCELLED' as const:'FAILED' as const;run.status=terminal;step.status=terminal;run.endedAt=this.clock().toISOString();
    const final=this.artifacts.create(run,step.id,'controller-recovery',{name:'target-recovery-boundary',type:'json',schema:'agent-control.recovery-boundary/v1',version:'1.0.0'}, {...this.artifacts.read(artifact.id),preparedEvidence:{id:artifact.id,sha256:artifact.sha256},recoveryBoundary:'CONFIRMED',ownershipReleased:true});run.artifacts.push(final.id);step.artifactIds.push(final.id);
    this.ledger.update(run,'run.target_recovery_boundary_confirmed',{artifactId:final.id,operationId});return run;
    }finally{this.boundaryPending.delete(runId);}
  }
  private readonly cleanupVerifiers=new Map<string,(run:RunRecord,actor:string)=>Promise<boolean>>();
  private readonly cleanupVerifications=new Map<string,Promise<RunRecord>>();
  registerCleanupVerifier(action:string,verify:(run:RunRecord,actor:string)=>Promise<boolean>){if(this.cleanupVerifiers.has(action))throw Error('cleanup_verifier_exists');this.cleanupVerifiers.set(action,verify);}
  verifyCleanup(runId:string,actor:string):Promise<RunRecord>{
    const pending=this.cleanupVerifications.get(runId);if(pending)return pending;
    const operation=(async()=>{
      const run=this.mustRun(runId);if(['CANCELLED','FAILED'].includes(run.status)&&run.steps.every(s=>s.cleanup?.outcome==='confirmed'))return run;
      if(!actor||run.steps.length!==1||!['CLEANUP_UNCERTAIN','DISCONNECTED'].includes(run.status)||this.controllers.has(runId)||this.runCleanups.has(runId))throw Error('cleanup_verification_not_safe');
      const step=run.steps[0],verify=this.cleanupVerifiers.get(step.action);if(!verify)throw Error('cleanup_verifier_unavailable');
      const proven=await verify(structuredClone(run),actor),live=this.mustRun(runId),current=live.steps[0];
      if(!proven){live.status='CLEANUP_UNCERTAIN';current.status='CLEANUP_UNCERTAIN';current.cleanup={outcome:'uncertain',reason:'attempt-bound-current-verification-unproven',requestedAt:this.clock().toISOString(),completedAt:this.clock().toISOString(),processes:[]};this.ledger.update(live,'run.current_cleanup_unconfirmed',{reason:'attempt-bound-current-verification-unproven'});return live;}
      if(this.controllers.has(runId)||current.attempts.at(-1)?.contractId!==step.attempts.at(-1)?.contractId)throw Error('cleanup_ownership_changed');
      const contractId=current.attempts.at(-1)?.contractId;if(!contractId)throw Error('cleanup_contract_missing');
      const contract=this.contracts.get(contractId);if(contract.pty.writeOwner?.startsWith('human:'))throw Error('cleanup_human_ownership_retained');
      const terminal=run.provenance.some(p=>p.type==='cancellation')||run.errors.some(e=>/execution_cancelled|cancelled_by|operator_cancelled/.test(e))?'CANCELLED' as const:'FAILED' as const;
      const at=this.clock().toISOString(),proof={outcome:'confirmed' as const,reason:'attempt-bound-current-verification',requestedAt:at,completedAt:at,processes:[]};
      const resolution=this.artifacts.create(live,current.id,'controller-recovery',{name:'current-cleanup-resolution',type:'json',schema:'agent-control.cleanup-resolution/v1',version:'1.0.0'}, {actor,previousStatus:live.status,previousCleanup:current.cleanup,contractId,proof,execution:terminal});
      live.artifacts.push(resolution.id);current.artifactIds.push(resolution.id);
      const completed=this.contracts.completeExecution(contractId,terminal,{outcome:'confirmed',detail:proof.reason,verifiedAt:at},{processId:contract.process.id,batonGeneration:contract.baton.generation,ownershipGeneration:contract.pty.ownershipGeneration});
      if(completed.state!==terminal)throw Error('cleanup_contract_not_terminal');
      current.status=terminal;current.cleanup=proof;delete current.waitingReason;live.status=terminal;live.endedAt=at;
      this.ledger.update(live,'run.current_cleanup_confirmed',{artifactId:resolution.id,execution:terminal});
      this.retainedCleanups.delete(runId);this.locks.release(runId);this.workers.release(current.attempts.at(-1)!.workerId!);return live;
    })().finally(()=>this.cleanupVerifications.delete(runId));this.cleanupVerifications.set(runId,operation);return operation;
  }
  private readonly resumePolicies = new Map<string, (run:RunRecord)=>{complete:boolean;checkpoint:unknown}>();
  registerResumePolicy(action:string, inspect:(run:RunRecord)=>{complete:boolean;checkpoint:unknown}) { if(this.resumePolicies.has(action))throw Error('resume_policy_exists');this.resumePolicies.set(action,inspect); }
  inspectResume(runId:string) { const run=this.mustRun(runId);if(run.steps.length!==1)throw Error('run_resume_unsupported');const policy=this.resumePolicies.get(run.steps[0].action);if(!policy)throw Error('run_resume_unsupported');return policy(run); }
  resume(runId:string, actor:string, requestKey:string, expiresAt:string) {
    const run=this.mustRun(runId),at=this.clock().toISOString();
    if(!actor?.trim()||!/^[a-zA-Z0-9._:-]{1,128}$/.test(requestKey)||!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=Date.parse(at)||Date.parse(expiresAt)-Date.parse(at)>4*3600000)throw Error('run_resume_authority_invalid');
    if(run.resumptions?.some(r=>r.requestKey===requestKey))return run;
    if(['QUEUED','WAITING','RUNNING','VERIFYING','RECONNECTING'].includes(run.status))return run;
    if(!['SUCCEEDED','FAILED','DEGRADED','CANCELLED','DISCONNECTED'].includes(run.status)||this.retainedCleanups.get(runId)?.size||this.locks.list().some(l=>l.runId===runId&&l.retained))throw Error('run_resume_cleanup_required');
    const plan=this.inspectResume(runId);if(plan.complete)return run;
    const step=run.steps[0];
    const checkpoint=this.artifacts.create(run,step.id,'agent-control-resume',{name:'run-resume-checkpoint',type:'application/json',schema:'agent-control.run-resume/v1',version:'1.0.0'}, {runId,previousStatus:run.status,previousEndedAt:run.endedAt??null,previousStep:structuredClone(step),checkpoint:plan.checkpoint});
    run.artifacts.push(checkpoint.id);step.artifactIds.push(checkpoint.id);
    (run.resumptions??=[]).push({generation:run.resumptions!.length+1,requestKey,actor,authorizedAt:at,expiresAt,stepId:step.id,checkpointId:checkpoint.id,checkpointSha256:checkpoint.sha256});
    step.status='QUEUED';delete step.endedAt;delete step.error;delete step.waitingReason;delete step.nextAttemptAt;delete step.recoveryDeadlineAt;step.verification={required:step.verification?.required??[],passed:[],failed:[]};
    run.status='QUEUED';delete run.endedAt;run.approvals=[];run.provenance.push({type:'resume',at,detail:'Fresh operator authority; immutable prior attempts and checkpoint retained'});
    return this.ledger.update(run,'run.resume_authorized',{generation:run.resumptions.at(-1)!.generation,checkpointId:checkpoint.id,actor,expiresAt});
  }
  private readonly controllers = new Map<string, AbortController>();
  private readonly retainedCleanups = new Map<string, Map<string, {stepId: string; workerId: string; identity: Record<string, unknown>; cleanup: () => Promise<ExecutionCleanupReport>; workerRetained?: boolean; authority?: StepAttempt['executionAuthority']}>>();
  private readonly runCleanups = new Map<string, Promise<void>>();
  private readonly clock: () => Date;
  constructor(readonly catalog: JobCatalog, readonly actions: ActionRegistry, readonly workers: WorkerRegistry, readonly ledger: RunLedger, readonly artifacts: ArtifactStore, readonly locks: ResourceLockManager, options: JobRuntimeOptions = {}) { this.contracts = options.contracts ?? options.executionSessions?.contracts ?? new ContractExecutionRuntime(); this.clock = options.now ?? (() => new Date()); this.approval = options.approval ?? (() => false); this.efficiency = options.efficiency; this.safety = options.safety; this.defaultRecoveryDeadlineSeconds = options.defaultRecoveryDeadlineSeconds ?? 900; this.ownedExecutionFactory = options.ownedExecutionFactory ?? (scope => new OwnedProcessManager(undefined, options.executionSessions, scope)); }
  /** Rebind retained cleanup from integrity-checked records to a trusted product adapter.
   * Registration never executes cleanup. The existing authenticated cancel operation requests it.
   */
  restoreRetainedCleanup(kind:string, resolve:(identity:Record<string,unknown>,run:RunRecord,stepId:string,workerId:string)=>null|(()=>Promise<ExecutionCleanupReport>)) {
    // Complete a prior confirmed reconciliation if restart quarantine left a source-step lock.
    for(const lock of this.locks.list().filter(l=>l.retained&&!l.resource.startsWith('retained-cleanup:'))){
      const run=this.ledger.get(lock.runId),step=run?.steps.find(s=>s.id===lock.stepId);if(!run||!step||!['CANCELLED','FAILED','DEGRADED'].includes(run.status))continue;
      const proofs=this.artifacts.list(run.id).filter(a=>a.stepId===step.id&&a.name==='retained-cleanup-outcome').map(a=>this.artifacts.read(a.id) as any);
      const registrations=this.artifacts.list(run.id).filter(a=>a.stepId===step.id&&a.name==='retained-cleanup-registered').map(a=>this.artifacts.read(a.id) as any);
      if(registrations.length&&registrations.every(v=>v.identity?.kind===kind&&v.workerId===step.attempts.at(-1)?.workerId&&resolve(v.identity,run,step.id,v.workerId)&&proofs.filter(p=>p.id===v.id).at(-1)?.proof?.outcome==='confirmed'))this.locks.release(run.id,step.id);
    }
    for(const lock of this.locks.list().filter(l=>l.retained&&l.resource.startsWith('retained-cleanup:'))){
      const run=this.ledger.get(lock.runId);if(!run||!['CLEANUP_UNCERTAIN','DISCONNECTED'].includes(run.status))continue;
      const metadata=this.artifacts.list(run.id).find(a=>a.name==='retained-cleanup-registered'&&(this.artifacts.read(a.id) as any)?.id===lock.resource);if(!metadata)continue;
      const value=this.artifacts.read(metadata.id) as any,step=run.steps.find(s=>s.id===value.sourceStepId);
      if(!step||value.identity?.kind!==kind||value.workerId!==step.attempts.at(-1)?.workerId||metadata.stepId!==step.id)continue;
      const entries=this.retainedCleanups.get(run.id)??new Map();if(entries.has(lock.resource))continue;
      const cleanup=resolve(value.identity,structuredClone(run),step.id,value.workerId);if(!cleanup)continue;
      entries.set(lock.resource,{stepId:step.id,workerId:value.workerId,identity:value.identity,cleanup,authority:step.attempts.at(-1)?.executionAuthority,workerRetained:true});
      this.retainedCleanups.set(run.id,entries);this.workers.claim(value.workerId);
    }
  }
  readonly contracts: ContractExecutionRuntime;
  private readonly approval: (policy: string, run: RunRecord) => boolean;
  private readonly efficiency?: HarnessEfficiencyLedgerPort;
  readonly safety?: RuntimeSafetySupervisorPort;
  private readonly defaultRecoveryDeadlineSeconds: number;
  private readonly ownedExecutionFactory: (scope: ExecutionSessionScope) => OwnedExecution;

  createRun(jobReference: string, parameters: Record<string, unknown>, trigger: RunRecord['trigger'], scheduledAt?: string, requestKey?: string) {
    assertNoSensitiveMaterial(JSON.stringify({parameters, trigger}), 'job_credential_material_forbidden');
    if (requestKey) {
      const existing = this.ledger.list().find(run => run.trigger.id === requestKey && run.trigger.actor === trigger.actor);
      if (existing) { if (jobReference !== `${existing.jobId}@${existing.jobVersion}` || JSON.stringify(effectiveParameters(existing.effectiveJob,parameters)) !== JSON.stringify(existing.parameters)) throw new Error('request_key_conflict'); return existing; }
      trigger = {...trigger, id: requestKey};
    }
    const job = this.catalog.job(jobReference); if (!job) throw new Error('job_missing'); if (job.spec.enabled === false) throw new Error('job_disabled');
    const active = this.ledger.list(job.metadata.id).filter(run => ACTIVE_RUNS.includes(run.status));
    const runId = `run-${randomUUID()}`, replaced = job.spec.concurrency === 'replace-running' ? active[0] : undefined;
    if (job.spec.concurrency === 'replace-running') for (const existing of active) this.cancel(existing.id, `replaced_by_run:${runId}`, runId);
    const retryOfRunId = trigger.type === 'retry' ? trigger.id : undefined;
    const effective = effectiveParameters(job, parameters), sha=(value:string)=>createHash('sha256').update(value).digest('hex');
    const run: RunRecord = {id: runId, jobId: job.metadata.id, jobVersion: job.metadata.version, jobDigest:sha(canonicalJson(job)), ...(job.metadata.source?{sourceJobDigest:job.metadata.source.digest}:{}), inputsDigest:sha(canonicalJson(effective)), ...(trigger.templateBinding?{templateBinding:structuredClone(trigger.templateBinding)}:{}), trigger: structuredClone(trigger), requestedAt: this.clock().toISOString(), scheduledAt, status: 'QUEUED', priority: job.spec.priority, concurrency: job.spec.concurrency, parameters: effective, steps: job.spec.steps.map(step => { const retry = step.retry ?? job.spec.retry; return {id: step.id, action: step.action, status: (step.dependsOn?.length ? 'WAITING_FOR_DEPENDENCY' : 'QUEUED'), dependsOn: [...(step.dependsOn ?? [])], capabilityRequest: {requires: step.requires.map(id => ({id}))}, resources: [...(step.resources ?? [])], attempts: [], artifactIds: [], approval: step.approval, ...(retry ? {remainingRetryBudget: retry.attempts} : {}), verification: {required: [...(step.verification ?? [])], passed: [], failed: []}}; }), artifacts: [], errors: [], effectiveJob: structuredClone(job), selectedWorkers: [], approvals: [], provenance: [{type: 'trigger', at: this.clock().toISOString(), detail: `${trigger.type}:${trigger.actor}`},...(job.metadata.source?[{type:'source-job',at:this.clock().toISOString(),detail:`${job.metadata.source.kind}:${job.metadata.source.path}:${job.metadata.source.digest}`}]:[]),...(trigger.templateBinding?[{type:'agent-template',at:this.clock().toISOString(),detail:`${trigger.templateBinding.id}@${trigger.templateBinding.version}:${trigger.templateBinding.digest}`}]:[]) ], ...((replaced || retryOfRunId) ? {lineage: {...(replaced ? {replacesRunId: replaced.id} : {}), ...(retryOfRunId ? {retryOfRunId} : {})}} : {})};
    if (active.length && job.spec.concurrency === 'no-overlap') run.provenance.push({type: 'concurrency', at: now(), detail: `Waiting for active run ${active[0].id}`});
    const created = this.ledger.add(run);
    if (retryOfRunId) this.linkPriorRun(retryOfRunId, 'retriedByRunId', created.id);
    return created;
  }

  async tick() {
    return (this.dispatch()?.completion ?? Promise.resolve(undefined));
  }

  schedulerConcurrencyLimit() { return this.workers.schedulerCapacity(); }

  dispatch(): JobDispatch | undefined {
    const runs = this.ledger.list().filter(run => ['QUEUED', 'WAITING', 'RECONNECTING', 'RUNNING'].includes(run.status)).sort((a, b) => jobPriorityRank[b.priority] - jobPriorityRank[a.priority] || Date.parse(a.requestedAt) - Date.parse(b.requestedAt));
    for (const run of runs) {
      if (this.contracts.list().some(contract => contract.laneId === 'job:' + run.id && contract.pty.writeOwner?.startsWith('human:'))) { run.status = 'PAUSED'; this.ledger.update(run, 'run.human_lane_held'); continue; }
      const activeSibling = this.ledger.list(run.jobId).find(other => other.id !== run.id && ['RUNNING', 'VERIFYING'].includes(other.status));
      if (activeSibling && ['no-overlap', 'queue'].includes(run.concurrency)) continue;
      const step = this.nextRunnableStep(run); if (!step) { this.finalizeRun(run); continue; }
      return {runId: run.id, completion: this.executeStep(run, step.id).then(async () => { await this.reconcileRetainedCleanup(run.id); return this.ledger.get(run.id); })};
    }
    return undefined;
  }

  async tickSchedules(at = this.clock()) {
    const created: RunRecord[] = [];
    for (const schedule of this.catalog.listSchedules()) {
      let state = this.ledger.schedule(schedule.metadata.id) ?? {scheduleId: schedule.metadata.id, enabled: schedule.spec.enabled ?? false, missedCount: 0, updatedAt: at.toISOString()};
      if (!state.nextScheduledAt) { state.nextScheduledAt = nextCronOccurrence(schedule.spec.cron, schedule.spec.timezone, new Date(at.getTime() - 60000)).toISOString(); state.updatedAt = at.toISOString(); this.ledger.saveSchedule(state); }
      if (!state.enabled || Date.parse(state.nextScheduledAt) > at.getTime()) continue;
      const scheduledAt = state.nextScheduledAt, lag = at.getTime() - Date.parse(scheduledAt);
      try {
        if (lag > 60000 && schedule.spec.missedRunPolicy === 'skip') { const missed = this.createRun(schedule.spec.job, schedule.spec.parameters ?? {}, {type: 'schedule', id: schedule.metadata.id, actor: 'agent-control-scheduler'}, scheduledAt); missed.status = 'MISSED'; missed.endedAt = at.toISOString(); missed.errors.push('missed_schedule_policy:skip'); missed.provenance.push({type: 'schedule', at: at.toISOString(), detail: 'Occurrence recorded but skipped by missed-run policy'}); this.ledger.update(missed, 'run.missed'); state.missedCount++; state.lastRunId = missed.id; state.lastError = undefined; }
        else { const run = this.createRun(schedule.spec.job, schedule.spec.parameters ?? {}, {type: 'schedule', id: schedule.metadata.id, actor: 'agent-control-scheduler'}, scheduledAt); created.push(run); state.lastRunId = run.id; state.lastError = undefined; }
      } catch (error) { state.lastFailureAt = at.toISOString(); state.lastError = error instanceof Error ? error.message : String(error); }
      state.previousScheduledAt = scheduledAt; state.nextScheduledAt = nextCronOccurrence(schedule.spec.cron, schedule.spec.timezone, at).toISOString(); state.updatedAt = at.toISOString(); this.ledger.saveSchedule(state);
    }
    return created;
  }

  setScheduleEnabled(id: string, enabled: boolean) { const definition = this.catalog.schedule(id); if (!definition) throw new Error('schedule_missing'); const at = this.clock(), current = this.ledger.schedule(id); return this.ledger.saveSchedule({scheduleId: id, enabled, previousScheduledAt: current?.previousScheduledAt, nextScheduledAt: enabled ? nextCronOccurrence(definition.spec.cron, definition.spec.timezone, at).toISOString() : current?.nextScheduledAt, lastRunId: current?.lastRunId, lastSuccessAt: current?.lastSuccessAt, lastFailureAt: current?.lastFailureAt, lastError: current?.lastError, missedCount: current?.missedCount ?? 0, updatedAt: at.toISOString()}); }
  approve(runId: string, policy: string, actor = 'operator') { const run = this.mustRun(runId), waiting = run.steps.filter(step => step.status === 'WAITING_FOR_APPROVAL' && step.approval === policy); if (!waiting.length) throw new Error('approval_policy_not_waiting'); const safetyDecision = this.safety?.list().find(item => item.approvalId === policy && item.runId === runId); if (safetyDecision) this.safety!.approve(safetyDecision.id, actor); if (!run.approvals.includes(policy)) run.approvals.push(policy); for (const step of waiting) { step.status = 'QUEUED'; step.waitingReason = undefined; } return this.ledger.update(run, 'run.approved', {policy, actor}); }
  safetyDecisions(runId?: string) { return (this.safety?.list() ?? []).filter(item => !runId || item.runId === runId); }
  cancel(runId: string, reason = 'operator_cancelled', replacedByRunId?: string) {
    const run = this.mustRun(runId); if (!ACTIVE_RUNS.includes(run.status)) return run;
    if (['CLEANUP_UNCERTAIN', 'DISCONNECTED'].includes(run.status) && !this.controllers.has(runId) && !this.retainedCleanups.get(runId)?.size) return run;
    if (replacedByRunId) run.lineage = {...run.lineage, replacedByRunId};
    const controller = this.controllers.get(runId);
    if (controller) {
      if (run.status === 'CANCELLING') return run;
      for (const step of run.steps) if (EXECUTION_OWNED_STEPS.includes(step.status)) { step.status = 'CANCEL_PENDING'; step.waitingReason = 'Termination requested; verifying worker process-tree cleanup'; }
      run.status = 'CANCELLING'; run.errors.push(reason); run.provenance.push({type: 'cancellation', at: now(), detail: 'Abort requested; terminal state and resource release await verified cleanup'});
      // Persist the fence before signalling the live controller. A completion or
      // autonomous scheduler tick can therefore never observe an unfenced run.
      const fenced=this.ledger.update(run, 'run.cancel_requested', replacedByRunId ? {replacedByRunId} : undefined);
      controller.abort(reason);
      return fenced;
    }
    for (const step of run.steps) if (!TERMINAL_STEPS.includes(step.status)) { step.status = 'CANCELLED'; step.endedAt = now(); }
    if (this.retainedCleanups.get(run.id)?.size) { run.status = 'CANCELLING'; run.errors.push(reason); this.ledger.update(run, 'run.retained_cleanup_requested'); void this.reconcileRetainedCleanup(run.id, 'CANCELLED'); return this.mustRun(run.id); }
    run.status = 'CANCELLED'; run.endedAt = now(); run.errors.push(reason); this.finalizeCancelledEfficiency(run, reason); this.locks.release(run.id);
    return this.ledger.update(run, 'run.cancelled', replacedByRunId ? {replacedByRunId} : undefined);
  }
  retry(runId: string) { const source = this.mustRun(runId); if (!['FAILED', 'DEGRADED', 'CANCELLED'].includes(source.status)) throw new Error('run_not_retryable'); const reference = `${source.jobId}@${source.jobVersion}`; if (!this.catalog.job(reference)) this.catalog.addJob(source.effectiveJob); return this.createRun(reference, source.parameters, {type: 'retry', id: source.id, actor: 'operator'}); }
  jobsProjection() { return this.catalog.listJobs().map(job => { const runs = this.ledger.list(job.metadata.id), latest = runs[0], schedules = this.catalog.listSchedules().filter(schedule => schedule.spec.job === `${job.metadata.id}@${job.metadata.version}`).map(schedule => ({...schedule, state: this.ledger.schedule(schedule.metadata.id)})); return {...job, latestRun: latest, schedules}; }); }
  queueProjection() { return this.ledger.list().flatMap(run => run.steps.filter(step => ['QUEUED', 'WAITING_FOR_WORKER', 'WAITING_FOR_DEPENDENCY', 'WAITING_FOR_RESOURCE', 'WAITING_FOR_APPROVAL', 'AUTHENTICATION_BLOCKED', 'RECONNECTING', 'RETRY_PENDING', 'CANCEL_PENDING', 'CLEANUP_UNCERTAIN'].includes(step.status)).map(step => ({runId: run.id, jobId: run.jobId, priority: run.priority, stepId: step.id, status: step.status, reason: step.waitingReason, eligibleWorkers: step.placement?.eligible ?? [], missingCapabilities: step.placement?.rejected.flatMap(item => item.reasons.filter(reason => reason.startsWith('missing:'))) ?? [], scheduledAt: run.scheduledAt, queuedAt: run.requestedAt, nextAttemptAt: step.nextAttemptAt, recoveryDeadlineAt: step.recoveryDeadlineAt, remainingRetryBudget: step.remainingRetryBudget})) ); }

  private nextRunnableStep(run: RunRecord) {
    let changed = false;
    const wait = (step: RunRecord['steps'][number], status: StepStatus, reason: string) => { if (step.status !== status || step.waitingReason !== reason) { step.status = status; step.waitingReason = reason; changed = true; } };
    for (const step of run.steps) {
      if (TERMINAL_STEPS.includes(step.status)) continue;
      if (EXECUTION_OWNED_STEPS.includes(step.status) || ['AUTHENTICATION_BLOCKED', 'RECONNECTING'].includes(step.status)) return undefined;
      const dependencies = step.dependsOn.map(id => run.steps.find(candidate => candidate.id === id));
      if (dependencies.some(dependency => dependency?.status === 'FAILED' || dependency?.status === 'CANCELLED')) { if (step.status !== 'CANCELLED' || step.error !== 'upstream_failed') { step.status = 'CANCELLED'; step.error = 'upstream_failed'; changed = true; } continue; }
      if (!dependencies.every(dependency => dependency?.status === 'SUCCEEDED')) { wait(step, 'WAITING_FOR_DEPENDENCY', `Waiting for ${dependencies.filter(item => item?.status !== 'SUCCEEDED').map(item => item?.id).join(', ')}`); continue; }
      if (step.status === 'RETRY_PENDING' && Date.parse(step.nextAttemptAt ?? '') > this.clock().getTime()) continue;
      if (step.approval && !run.approvals.includes(step.approval) && !this.approval(step.approval, run)) { wait(step, 'WAITING_FOR_APPROVAL', `Approval required: ${step.approval}`); continue; }
      if (!['WAITING_FOR_RESOURCE', 'WAITING_FOR_WORKER'].includes(step.status)) { if (step.status !== 'QUEUED' || step.waitingReason !== undefined) changed = true; step.status = 'QUEUED'; step.waitingReason = undefined; }
      if (changed) this.ledger.update(run, 'run.dependencies_reconciled');
      return step;
    }
    if (changed) { run.status = run.steps.some(step => step.status === 'AUTHENTICATION_BLOCKED') ? 'AUTHENTICATION_BLOCKED' : run.steps.some(step => ['RECONNECTING', 'RETRY_PENDING'].includes(step.status) && step.attempts.at(-1)?.recoveryKind === 'transient-transport') ? 'RECONNECTING' : 'WAITING'; this.ledger.update(run, run.status === 'RECONNECTING' ? 'run.reconnecting' : run.status === 'AUTHENTICATION_BLOCKED' ? 'run.authentication_blocked' : 'run.waiting'); }
    return undefined;
  }

  private async executeStep(run: RunRecord, stepId: string) {
    const step = run.steps.find(item => item.id === stepId)!;
    const lock = this.locks.acquire(step.resources, run.id, step.id);
    if (!lock.ok) { const reason = `Held by ${lock.blocked.map(item => `${item.resource}:${item.runId}`).join(', ')}`, changed = step.status !== 'WAITING_FOR_RESOURCE' || step.waitingReason !== reason || run.status !== 'WAITING'; step.status = 'WAITING_FOR_RESOURCE'; step.waitingReason = reason; run.status = 'WAITING'; if (changed) this.ledger.update(run, 'step.waiting_resource'); return; }
    const required = step.capabilityRequest.requires.map(item => item.id), resolution = this.workers.resolve(required, this.clock()), previousPlacement = JSON.stringify(step.placement); step.placement = resolution.rationale;
    if (!resolution.worker) { const reason = `No worker satisfies ${required.join(', ')}`, changed = step.status !== 'WAITING_FOR_WORKER' || step.waitingReason !== reason || run.status !== 'WAITING' || previousPlacement !== JSON.stringify(resolution.rationale); step.status = 'WAITING_FOR_WORKER'; step.waitingReason = reason; run.status = 'WAITING'; this.locks.release(run.id, step.id); if (changed) this.ledger.update(run, 'step.waiting_worker'); return; }
    const worker = resolution.worker, definition = run.effectiveJob.spec.steps.find(item => item.id === step.id)!;
    const registeredAction = this.actions.resolve(step.action);
    let inputs: ArtifactRecord[];
    try { inputs = this.inputArtifacts(run, step.id); }
    catch (error) {
      const at = this.clock().toISOString(), reason = safeFailureMessage(error instanceof Error ? error.message : String(error)); step.status = 'FAILED'; step.error = reason; step.endedAt = at; run.status = 'FAILED'; run.endedAt = at; run.errors.push(`${step.id}:configuration:${reason}`); this.cancelDependents(run, step.id); this.locks.release(run.id, step.id); this.ledger.update(run, 'step.input_resolution_failed', {reason}); return;
    }
    if (registeredAction.governance) {
      try {
        const resolved = registeredAction.governance({run: structuredClone(run), step: structuredClone(step), worker, parameters: structuredClone(run.parameters), inputArtifacts: structuredClone(inputs), readArtifact: id => this.artifacts.read(id)});
        const policies = [...resolved.policies, ...compileResourcePolicies(run)].filter((item, index, values) => values.findIndex(candidate => candidate.id === item.id) === index);
        step.governance = {...resolved, policies};
        step.externalOperations = resolved.effects.filter(isExternalMutation).map(effect => { const proposedAt = this.clock().toISOString(); return {schema: 'agent-control.external-operation/v1', id: `external-operation-${randomUUID()}`, effectId: effect.id, resource: effect.resource, effect: effect.kind, state: 'PROPOSED', proposedAt, updatedAt: proposedAt, transitions: [{state: 'PROPOSED', at: proposedAt}]}; });
        this.ledger.update(run, 'step.effects_resolved', {effectCount: resolved.effects.length, protectedResourceCount: policies.filter(item => item.capability === 'READ_ONLY').length});
      } catch (error) {
        const at = this.clock().toISOString(), reason = safeFailureMessage(error instanceof Error ? error.message : String(error)); step.status = 'FAILED'; step.error = `action_effect_resolution_failed:${reason}`; step.endedAt = at; run.status = 'FAILED'; run.endedAt = at; run.errors.push(`${step.id}:policy:${step.error}`); this.cancelDependents(run, step.id); this.locks.release(run.id, step.id); this.ledger.update(run, 'step.effect_resolution_failed', {reason}); return;
      }
    }
    if (this.safety) {
      const route = run.trigger.modelRoute, workerIdentity = this.workers.executionIdentity(worker.id), decision = this.safety.assess(deriveRuntimeActionIntent({runId: run.id, parcelId: run.trigger.parcelContext?.parcelId, stageId: run.trigger.parcelContext?.stageId, stepId: step.id, actor: run.trigger.actor, action: step.action, goal: run.trigger.parcelContext?.currentInterpretation ?? run.effectiveJob.metadata.description ?? run.jobId, parameters: run.parameters, requestedCapabilities: required, resources: step.resources, workerId: worker.id, workerIdentity, crewRole: 'resource-guardian', providerId: route?.providerId, accountProfileId: route?.accountProfileId ?? undefined, modelId: route?.modelId, nodeId: route?.providerExecutionNodeId ?? workerIdentity.nodeId ?? worker.id, effectDeclaration: registeredAction.effectDeclaration, effects: step.governance?.effects, resourcePolicies: step.governance?.policies}));
      for (const operation of step.externalOperations ?? []) { operation.decisionId = decision.id; operation.updatedAt = this.clock().toISOString(); }
      const safetyDetail = `${decision.outcome}:${decision.id}:${decision.reason}`; if (!run.provenance.some(item => item.type === 'runtime-safety' && item.detail === safetyDetail)) run.provenance.push({type: 'runtime-safety', at: decision.at, detail: safetyDetail});
      if (decision.outcome === 'DENY') { const at = this.clock().toISOString(); for (const operation of step.externalOperations ?? []) { operation.reason = decision.reason; operation.transitions[0].reason = decision.reason; } step.status = 'FAILED'; step.error = `runtime_safety_denied:${decision.id}`; step.endedAt = at; this.cancelDependents(run, step.id); run.status = 'FAILED'; run.endedAt = at; run.errors.push(`${step.id}:policy:${step.error}`); this.locks.release(run.id, step.id); this.ledger.update(run, 'step.safety_denied', {decisionId: decision.id, outcome: decision.outcome, policyId: decision.policyId}); return; }
      if (['REQUIRE_APPROVAL','PAUSE','ESCALATE'].includes(decision.outcome)) { for (const operation of step.externalOperations ?? []) operation.reason = decision.reason; step.status = 'WAITING_FOR_APPROVAL'; step.approval = decision.approvalId; step.waitingReason = `${decision.outcome}: ${decision.reason}`; run.status = 'WAITING'; this.locks.release(run.id, step.id); this.ledger.update(run, 'step.safety_waiting', {decisionId: decision.id, outcome: decision.outcome, policyId: decision.policyId, approvalId: decision.approvalId}); return; }
      this.ledger.update(run, decision.outcome === 'ALLOW_WITH_AUDIT' ? 'step.safety_allowed_with_audit' : 'step.safety_allowed', {decisionId: decision.id, outcome: decision.outcome, policyId: decision.policyId});
      this.setExternalOperationState(step, 'AUTHORISED', decision.reason);
    } else this.setExternalOperationState(step, 'AUTHORISED', 'No runtime safety supervisor configured');
    const controller = new AbortController(), ownedScope = new AbortController(), ownedRequests = new Set<Promise<unknown>>(), sessionScope: ExecutionSessionScope = {runId: run.id, jobId: run.jobId, jobVersion: run.jobVersion, stepId: step.id, actionId: step.action, workerId: worker.id, nodeId: run.trigger.modelRoute?.nodeId ?? worker.id, ...(run.trigger.parcelContext?.parcelId ? {parcelId: run.trigger.parcelContext.parcelId} : {}), crewRole: crewRole(step.action), ...(run.trigger.modelRoute?.providerId ? {providerId: run.trigger.modelRoute.providerId} : {}), ...(run.trigger.modelRoute?.accountLabel ? {accountLabel: run.trigger.modelRoute.accountLabel} : {}), ...(run.trigger.modelRoute?.modelId ? {modelId: run.trigger.modelRoute.modelId} : {}),interactionPolicy:registeredAction.governance?'WATCH_ONLY':'GOVERNED_INTERVENTION'}, rawOwnedExecution = this.ownedExecutionFactory(sessionScope), ownedExecution: OwnedExecution = {runProcess: (request, signal) => { execution.assertActive(); ownedScope.signal.throwIfAborted(); const pending = rawOwnedExecution.runProcess(request, AbortSignal.any([controller.signal, ownedScope.signal, ...(signal ? [signal] : [])])); ownedRequests.add(pending); void pending.then(() => ownedRequests.delete(pending), () => ownedRequests.delete(pending)); return pending; }, terminateAll: reason => rawOwnedExecution.terminateAll(reason), activePids: () => rawOwnedExecution.activePids(), sessionIds: () => rawOwnedExecution.sessionIds?.() ?? []}, retry = definition.retry ?? run.effectiveJob.spec.retry ?? {attempts: 0, backoffSeconds: 0}, attemptStartedAt = this.clock().toISOString();
    this.controllers.set(run.id, controller); this.workers.claim(worker.id); step.status = 'RUNNING'; step.waitingReason = undefined; step.nextAttemptAt = undefined; step.startedAt ??= attemptStartedAt; run.startedAt ??= step.startedAt; run.status = 'RUNNING';
    if (!run.selectedWorkers.includes(worker.id)) run.selectedWorkers.push(worker.id);
    if (retry.attempts > 0) { step.recoveryDeadlineAt ??= new Date(this.clock().getTime() + (retry.overallDeadlineSeconds ?? this.defaultRecoveryDeadlineSeconds) * 1000).toISOString(); step.remainingRetryBudget = Math.max(0, retry.attempts - step.attempts.length); }
    const attempt: StepAttempt = {attempt: step.attempts.length + 1, startedAt: attemptStartedAt, workerId: worker.id}; step.attempts.push(attempt); this.setExternalOperationState(step, 'EXECUTING'); this.ledger.update(run, 'step.dispatched');
    const timeoutSeconds = definition.timeoutSeconds, wallStartedAt = Date.now();
    let timeoutTimer: NodeJS.Timeout | undefined, timedOut = false, safeToReleaseWorker = true;
    const actorId = 'agent:' + worker.id;
    const contract = this.contracts.create({laneId: 'job:' + run.id, operatorActorId: run.trigger.actor.startsWith('human:') ? run.trigger.actor : 'human:' + run.trigger.actor,
      objective: run.effectiveJob.metadata.description ?? run.jobId, completionCriteria: definition.verification?.length ? definition.verification : ['Independent acceptance remains required'],
      authority: required, protectedResources: step.resources, active: {actorId, agentId: worker.id, runtimeId: 'job-action', nodeId: sessionScope.nodeId, modelId: sessionScope.modelId, providerId: sessionScope.providerId},
      baton: {runId: run.id, stepId: step.id, attempt: attempt.attempt, inputs: inputs.map(item => ({id: item.id, sha256: item.sha256}))},
      process: {id: 'job-action:' + randomUUID(), pid: process.pid}, ptyId: 'job-action:' + run.id + ':' + step.id,
      permissions: {capabilities: required, filesystem: 'none', network: 'none', production: false}});
    this.contracts.attach(contract.id, {actorId, kind: 'agent'}, 'write');
    attempt.contractId = contract.id; Object.assign(sessionScope, {contractId: contract.id, laneId: contract.laneId});
    const initialAuthority = this.contracts.get(contract.id);
    attempt.executionAuthority = {processId: initialAuthority.process.id, batonGeneration: initialAuthority.baton.generation, ownershipGeneration: initialAuthority.pty.ownershipGeneration};
    const execution = {contractId: contract.id, currentAuthority: () => {
      const live = this.contracts.get(contract.id);
      return {laneId: live.laneId, leaseGeneration: live.baton.generation, ownershipGeneration: live.pty.ownershipGeneration, owner: (live.pty.writeOwner === actorId && live.state === 'ACTIVE' && live.process.state === 'RUNNING' ? 'agent' : 'human') as 'agent' | 'human'};
    }, assertActive: () => {
      controller.signal.throwIfAborted(); const live = this.contracts.get(contract.id);
      if (live.state !== 'ACTIVE' || live.process.state !== 'RUNNING' || live.pty.writeOwner !== actorId || live.baton.generation !== initialAuthority.baton.generation || live.pty.ownershipGeneration !== initialAuthority.pty.ownershipGeneration) throw new ActionFailure('execution_authority_revoked', 'policy_rejection');
    }};
    const unsubscribeAuthority = this.contracts.subscribe(live => {
      if (live.laneId === contract.laneId && live.pty.writeOwner?.startsWith('human:')) controller.abort('execution_authority_revoked');
      if (live.id === contract.id && (live.state !== 'ACTIVE' || live.process.state !== 'RUNNING' || live.pty.writeOwner !== actorId || live.baton.generation !== initialAuthority.baton.generation || live.pty.ownershipGeneration !== initialAuthority.pty.ownershipGeneration)) controller.abort('execution_authority_revoked');
    });
    this.ledger.update(run, 'step.contract_bound', {contractId: contract.id, laneId: contract.laneId});
    let actionSettled = false, detached = false, scopeFinalized = false, reconcilingLateCleanup = false; let settledError: unknown;
    const cleanupAcknowledgements:string[]=[];let finalizedAuthority:StepAttempt['executionAuthority']; let removeAbortListener = () => {};
    let acknowledgeSettlement!: () => void;
    const settlement = new Promise<void>(resolve => { acknowledgeSettlement = resolve; });
    const reconcileLateCancellation = async () => {
      if(reconcilingLateCleanup||!scopeFinalized||!actionSettled||!controller.signal.aborted||timedOut||!cleanupAcknowledgements.length||ownedRequests.size||this.retainedCleanups.get(run.id)?.size)return;
      const retainedFailure=(settledError as {executionCleanup?:ExecutionCleanupReport})?.executionCleanup;if(retainedFailure&&retainedFailure.outcome!=='confirmed')return;
      const live=this.mustRun(run.id),current=live.steps.find(s=>s.id===step.id)!;
      if(live.status!=='CLEANUP_UNCERTAIN'||current.attempts.at(-1)?.contractId!==contract.id||current.cleanup?.reason!=='action_completion_unacknowledged:execution_cancelled')return;
      reconcilingLateCleanup=true;
      try {
        const proof=await ownedExecution.terminateAll('late-restoration-acknowledged');
        if(proof.outcome!=='confirmed'||ownedRequests.size)return;
        const completed=this.contracts.completeExecution(contract.id,'CANCELLED',{outcome:'confirmed',detail:'Late action settlement and all retained cleanup acknowledged',verifiedAt:proof.completedAt},finalizedAuthority);
        if(completed.state!=='CANCELLED'||completed.process.state!=='EXITED')return;
        // Keep the original attempt/uncertainty record unchanged; append a resolution.
        const a=this.artifacts.create(live,step.id,worker.id,{name:'cleanup-resolution',type:'json',schema:'agent-control.cleanup-resolution/v1',version:'1.0.0'}, {contractId:contract.id,previousCleanup:current.cleanup,acknowledgements:cleanupAcknowledgements,actionSettled:true,proof,execution:'CANCELLED'});
        live.artifacts.push(a.id);current.artifactIds.push(a.id);current.cleanup=proof;current.status='CANCELLED';current.error='execution_cancelled';delete current.waitingReason;current.endedAt=proof.completedAt;live.status='CANCELLED';live.endedAt=proof.completedAt;
        this.locks.release(live.id,step.id);this.workers.release(worker.id);this.ledger.update(live,'run.cleanup_reconciled',{artifactId:a.id,execution:'CANCELLED',cleanup:'confirmed'});
      } finally {reconcilingLateCleanup=false;}
    };
    const scheduleLateReconciliation=()=>{void reconcileLateCancellation().catch(()=>{/* Fail closed: original uncertainty/locks remain. */});};
    const cleanupExecution = async (reason: string): Promise<ExecutionCleanupReport> => {
      const requestedAt = this.clock().toISOString(); let lastReport: ExecutionCleanupReport | undefined;
      try {
      ownedScope.abort(new Error('job_action_process_scope_closed'));
      const report = lastReport = await ownedExecution.terminateAll(reason);
      if (!actionSettled) await Promise.race([settlement, new Promise<void>(resolve => setTimeout(resolve, 250))]);
      const retained = (settledError as {executionCleanup?: ExecutionCleanupReport})?.executionCleanup;
      if (retained && retained.outcome !== 'confirmed') return retained;
      if (!actionSettled) return {...report, outcome: 'uncertain' as const, reason: 'action_completion_unacknowledged:' + reason};
      const partial = partialActionOutput(settledError); if (partial) this.applyExternalOperationStates(step, partial.externalOperationStates);
      if (ownedRequests.size) await Promise.race([Promise.allSettled([...ownedRequests]), new Promise(resolve => setTimeout(resolve, 250))]);
      const finalReport = lastReport = await ownedExecution.terminateAll(reason + ':after_action_settlement');
      if (ownedRequests.size) return {...finalReport, outcome: 'uncertain' as const, reason: 'owned_process_launch_or_completion_unacknowledged'};
      return report.outcome === 'confirmed' ? finalReport : {...report, processes: [...report.processes, ...finalReport.processes]};
      } catch (error) {
        safeToReleaseWorker = false;
        const cleanup: ExecutionCleanupReport = {outcome: 'uncertain', reason: 'cleanup_threw:' + reason + ':' + safeFailureMessage(error instanceof Error ? error.message : String(error)), requestedAt, completedAt: this.clock().toISOString(), processes: lastReport?.processes ?? []};
        attempt.cleanup = cleanup; step.cleanup = cleanup;
        this.markCleanupUncertain(run, step, attempt, cleanup, 'cleanup_threw');
        recordEvidence('runtime-cleanup-error', {cleanup, processIdentity: lastReport?.processes ?? 'UNKNOWN', actionSettled, pendingOwnedRequests: ownedRequests.size});
        return cleanup;
      }
    };
    const recordEvidence = (name: string, value: unknown) => {
      if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(name)) throw new Error('attempt_evidence_name_invalid');
      const artifact = this.artifacts.create(run, step.id, worker.id, {name, type: 'json', schema: 'agent-control.attempt-evidence/v1', version: '1.0.0', retention: 'run-history'}, value);
      step.artifactIds.push(artifact.id); run.artifacts.push(artifact.id);
      const live = this.mustRun(run.id), liveStep = live.steps.find(item => item.id === step.id)!;
      liveStep.artifactIds.push(artifact.id); live.artifacts.push(artifact.id);
      this.ledger.update(live, 'step.attempt_evidence', {artifactId: artifact.id, name, sha256: artifact.sha256});
      return artifact;
    };
    try {
      const action = registeredAction;
      run.provenance.push({type: 'action-dispatch', at: this.clock().toISOString(), detail: `${action.kind}:${step.action}${action.kind === 'agent' ? ':adaptive-harness' : ''}`});
      const recordIndependentVerification = action.kind === 'control' ? (sourceStepId: string, passed: boolean, evidenceIds: string[], reason: string) => {
        execution.assertActive();
        if (!definition.dependsOn?.includes(sourceStepId)) throw new ActionFailure('independent_verification_dependency_required', 'policy_rejection');
        const source = run.steps.find(item => item.id === sourceStepId), id = source?.attempts.at(-1)?.contractId;
        if (!source || !id || this.actions.kind(source.action) !== 'agent') throw new ActionFailure('independent_verification_source_required', 'verification');
        const previous = this.contracts.get(id);
        if (previous.pty.writeOwner?.startsWith('human:') || previous.state !== 'VERIFYING' || previous.process.state !== 'EXITED') throw new ActionFailure('independent_verification_source_authority_revoked', 'policy_rejection');
        this.contracts.submitForVerification(id, previous.active.actorId, evidenceIds.map(id => ({id, kind: 'independent-check', reference: id, createdAt: this.clock().toISOString()})));
        execution.assertActive();
        this.contracts.verify(id, 'job-verifier:' + run.id + ':' + step.id, passed, [reason]);
      } : undefined;
      const retainCleanup: NonNullable<import('./job-types.js').ActionContext['retainCleanup']> = (identity, cleanup) => {
        execution.assertActive(); const id = 'retained-cleanup:' + randomUUID();
        this.locks.acquire([id], run.id, id, true);
        const entries = this.retainedCleanups.get(run.id) ?? new Map(); entries.set(id, {stepId: step.id, workerId: worker.id, identity: structuredClone(identity), cleanup, authority: attempt.executionAuthority}); this.retainedCleanups.set(run.id, entries);
        recordEvidence('retained-cleanup-registered', {id, sourceStepId: step.id, workerId: worker.id, identity, cleanup: 'PENDING'});
        return proof => { if (proof.outcome !== 'confirmed') throw new Error('retained_cleanup_proof_required'); if(!entries.has(id))return; const receipt=recordEvidence('retained-cleanup-acknowledged',{id,identity,proof,contractId:contract.id});cleanupAcknowledgements.push(receipt.id);entries.delete(id);this.locks.release(run.id,id);scheduleLateReconciliation(); };
      };
      const actionContext = {retainCleanup, recordIndependentVerification, execution, recordEvidence, run: structuredClone(run), step: structuredClone(step), worker, parameters: structuredClone(run.parameters), inputArtifacts: inputs, readArtifact: (id: string) => this.artifacts.read(id), signal: controller.signal, ownedExecution, ...(step.governance ? {governance: structuredClone(step.governance)} : {})};
      const invocation = Promise.resolve().then(() => action.kind === 'control' ? action.handler(actionContext) : action.handler.execute(actionContext)).then(
        output => { actionSettled = true; acknowledgeSettlement(); if (detached || timedOut) recordEvidence('late-action-output', {output}); scheduleLateReconciliation(); return detached || timedOut ? new Promise<never>(() => undefined) : output; },
        error => { settledError = error; actionSettled = true; acknowledgeSettlement(); if (detached || timedOut) recordEvidence('late-action-error', {error: error instanceof Error ? error.message : String(error), output: partialActionOutput(error) ?? null}); scheduleLateReconciliation(); return detached || timedOut ? new Promise<never>(() => undefined) : Promise.reject(error); },
      );
      const cancellation = new Promise<never>((_resolve, reject) => {
        const abort = () => { if (!timedOut) { detached = true; reject(new ActionFailure('execution_cancelled', 'execution')); } };
        removeAbortListener = () => controller.signal.removeEventListener('abort', abort);
        controller.signal.addEventListener('abort', abort, {once: true}); if (controller.signal.aborted) abort();
      });
      const output = await Promise.race([
        invocation, cancellation,
        new Promise<never>((_resolve, reject) => {
          if (timeoutSeconds === undefined) return;
          timeoutTimer = setTimeout(() => {
            timedOut = true;
            const error = new StepTimeoutError(timeoutSeconds, Date.now() - wallStartedAt);
            controller.abort(error);
            reject(error);
          }, timeoutSeconds * 1000);
        }),
      ]);
      attempt.efficiencyInvocationIds = [...(output.efficiencyInvocationIds ?? [])]; this.captureExecutionSessions(run, step, attempt, ownedExecution);
      if (action.kind === 'agent' && output.executionState !== 'verification-pending') throw new ActionFailure('agent_action_missing_verification_boundary', 'verification');
      if (controller.signal.aborted) throw new ActionFailure('execution_cancelled', 'execution');
      this.recordActionOutput(run, step.id, worker.id, output);
      const completedCleanup = await cleanupExecution('action_completed'); attempt.cleanup = completedCleanup; step.cleanup = completedCleanup;
      if (completedCleanup.outcome !== 'confirmed') { safeToReleaseWorker = false; this.markCleanupUncertain(run, step, attempt, completedCleanup, 'action_completed'); return; }
      execution.assertActive();
      this.applyExternalOperationStates(step, output.externalOperationStates); this.setExternalOperationState(step, 'EXTERNALLY_COMMITTED', undefined, ['EXECUTING']);
      step.status = 'VERIFYING'; run.status = 'VERIFYING'; if (attempt.efficiencyInvocationIds.length) this.efficiency?.setPhase(attempt.efficiencyInvocationIds, 'verification'); this.ledger.update(run, 'step.verifying');
      const requiredVerification = step.verification?.required ?? [], passed = new Set(output.verification ?? []); step.verification!.passed = requiredVerification.filter(item => passed.has(item)); step.verification!.failed = requiredVerification.filter(item => !passed.has(item));
      if (step.verification!.failed.length) throw new ActionFailure(`verification_failed:${step.verification!.failed.join(',')}`, 'verification');
      if (attempt.efficiencyInvocationIds.length && requiredVerification.length) this.efficiency?.markVerification(attempt.efficiencyInvocationIds, 'PASS');
      step.status = 'SUCCEEDED'; step.endedAt = this.clock().toISOString(); attempt.endedAt = step.endedAt; attempt.outcome = output.detail ?? 'completed_and_verified'; run.provenance.push(...(output.evidence ?? []).map(detail => ({type: 'evidence', at: now(), detail}))); this.locks.release(run.id, step.id); this.ledger.update(run, 'step.succeeded'); this.finalizeRun(run);
    } catch (error) {
      this.captureExecutionSessions(run, step, attempt, ownedExecution); const errorInvocationIds = efficiencyInvocationIds(error); if (!attempt.efficiencyInvocationIds?.length && errorInvocationIds.length) attempt.efficiencyInvocationIds = errorInvocationIds;
      const partialOutput = partialActionOutput(error); if (partialOutput) this.recordActionOutput(run, step.id, worker.id, partialOutput);
      if (partialOutput) this.applyExternalOperationStates(step, partialOutput.externalOperationStates);
      const retainedCleanup = (error as {executionCleanup?: ExecutionCleanupReport})?.executionCleanup;
      if (retainedCleanup && retainedCleanup.outcome !== 'confirmed') { safeToReleaseWorker = false; this.markCleanupUncertain(run, step, attempt, retainedCleanup, 'action_cleanup_unproved'); return; }
      if (error instanceof StepTimeoutError) {
        const cleanup = await cleanupExecution('step_timeout'); attempt.cleanup = cleanup; step.cleanup = cleanup;
        this.setExternalOperationState(step, cleanup.outcome === 'confirmed' ? 'COMMIT_STATE_UNCERTAIN' : 'COMMIT_STATE_UNCERTAIN', 'Execution timed out before external commit could be reconciled', ['EXECUTING']);
        if (cleanup.outcome !== 'confirmed') {
          safeToReleaseWorker = false; this.markCleanupUncertain(run, step, attempt, cleanup, `step_timeout:${error.timeoutSeconds}s`); return;
        }
        const endedAt = this.clock().toISOString(), terminalReason = 'step_timeout';
        step.status = 'TIMED_OUT'; step.endedAt = endedAt; step.error = `${terminalReason}:${error.timeoutSeconds}s`; attempt.endedAt = endedAt; attempt.outcome = step.error; attempt.retryable = false; attempt.errorClass = 'execution'; attempt.timeoutSeconds = error.timeoutSeconds; attempt.elapsedMs = error.elapsedMs; attempt.terminalReason = terminalReason;
        this.cancelDependents(run, step.id); run.status = 'FAILED'; run.endedAt = endedAt; run.errors.push(`${step.id}:execution:${step.error}`);
        const timeoutEvidence = {jobId: run.jobId, runId: run.id, stepId: step.id, timeoutSeconds: error.timeoutSeconds, elapsedMs: error.elapsedMs, terminalReason};
        const ids = this.invocationIds(run, step.id); if (ids.length) { this.efficiency?.finalizePending(ids, 'FAILED', step.error, terminalReason, endedAt); this.efficiency?.markVerification(ids, 'FAIL', 'FAILED'); }
        run.provenance.push({type: 'step-timeout', at: endedAt, detail: JSON.stringify(timeoutEvidence)}); this.locks.release(run.id, step.id); this.ledger.update(run, 'step.timed_out', timeoutEvidence); return;
      }
      if (controller.signal.aborted) {
        const cleanup = await cleanupExecution('execution_cancelled'); attempt.cleanup = cleanup; step.cleanup = cleanup;
        this.setExternalOperationState(step, 'COMMIT_STATE_UNCERTAIN', 'Execution cancelled before external commit could be reconciled', ['EXECUTING']);
        if (cleanup.outcome !== 'confirmed') { safeToReleaseWorker = false; this.markCleanupUncertain(run, step, attempt, cleanup, 'execution_cancelled'); return; }
        step.status = 'CANCELLED'; step.waitingReason = undefined; step.endedAt = this.clock().toISOString(); attempt.endedAt = step.endedAt; attempt.outcome = 'execution_cancelled'; run.status = 'CANCELLED'; run.endedAt = step.endedAt; if (!run.errors.includes('execution_cancelled')) run.errors.push('execution_cancelled'); this.finalizeCancelledEfficiency(run, 'execution_cancelled'); this.locks.release(run.id, step.id); this.ledger.update(run, 'run.cancellation_confirmed', {cleanup: cleanup.outcome}); return;
      }
      if (!attempt.cleanup) { const cleanup = await cleanupExecution('action_failed'); attempt.cleanup = cleanup; step.cleanup = cleanup; if (cleanup.outcome !== 'confirmed') { safeToReleaseWorker = false; this.markCleanupUncertain(run, step, attempt, cleanup, 'action_failed'); return; } }
      const failure = error instanceof ActionFailure ? error : new ActionFailure(error instanceof Error ? error.message : String(error), 'execution', true), failureMessage = safeFailureMessage(failure.message);
      this.setExternalOperationState(step, 'COMMIT_STATE_UNCERTAIN', failureMessage, ['EXECUTING']);
      attempt.endedAt = this.clock().toISOString(); attempt.outcome = failureMessage; attempt.retryable = failure.retryable; attempt.errorClass = failure.failureClass; attempt.recoveryKind = failure.recoveryKind; step.error = failureMessage; this.locks.release(run.id, step.id);
      if (attempt.efficiencyInvocationIds?.length) { this.efficiency?.finalizePending(attempt.efficiencyInvocationIds, 'FAILED', failureMessage, 'executor_failure', attempt.endedAt); this.efficiency?.markVerification(attempt.efficiencyInvocationIds, 'FAIL'); }
      if (failure.recoveryKind === 'authentication-required') {
        step.status = 'AUTHENTICATION_BLOCKED'; step.waitingReason = 'Authentication requires human action for the sealed account profile'; step.remainingRetryBudget = Math.max(0, retry.attempts - step.attempts.length + 1); run.status = 'AUTHENTICATION_BLOCKED'; run.errors.push(`${step.id}:authentication:human_action_required`); this.ledger.update(run, 'step.authentication_blocked', {recoveryKind: failure.recoveryKind});
      } else {
        const retryAt = this.nextRetryAt(step, retry);
        if (failure.retryable && step.attempts.length <= retry.attempts && retryAt) {
          step.status = 'RETRY_PENDING'; step.nextAttemptAt = retryAt; step.remainingRetryBudget = Math.max(0, retry.attempts - step.attempts.length + 1); step.waitingReason = `${failure.recoveryKind}; retry ${step.attempts.length}/${retry.attempts} at ${retryAt}`;
          run.status = ['transient-transport', 'expired-enrolment'].includes(failure.recoveryKind) ? 'RECONNECTING' : 'QUEUED';
          this.ledger.update(run, run.status === 'RECONNECTING' ? 'step.reconnect_pending' : 'step.retry_pending', {recoveryKind: failure.recoveryKind, nextAttemptAt: retryAt, recoveryDeadlineAt: step.recoveryDeadlineAt, remainingRetryBudget: step.remainingRetryBudget});
        } else {
          step.status = 'FAILED'; step.endedAt = this.clock().toISOString(); step.remainingRetryBudget = Math.max(0, retry.attempts - step.attempts.length + 1); this.cancelDependents(run, step.id); run.errors.push(`${step.id}:${failure.failureClass}:${safeFailureMessage(failure.message)}${failure.retryable && !retryAt ? ':recovery_deadline_exhausted' : ''}`); run.status = failure.failureClass === 'verification' ? 'DEGRADED' : 'FAILED'; run.endedAt = step.endedAt; const ids = this.invocationIds(run); if (ids.length) { this.efficiency?.finalizePending(ids, 'FAILED', failure.message, 'executor_failure', run.endedAt); this.efficiency?.markVerification(ids, 'FAIL', run.status); } this.ledger.update(run, 'step.failed', {recoveryKind: failure.recoveryKind, recoveryDeadlineAt: step.recoveryDeadlineAt, remainingRetryBudget: step.remainingRetryBudget});
        }
      }
    } finally { removeAbortListener(); unsubscribeAuthority(); if (timeoutTimer) clearTimeout(timeoutTimer); if (!attempt.cleanup) { const cleanup = await cleanupExecution('execution_scope_finalization'); attempt.cleanup = cleanup; step.cleanup = cleanup; if (cleanup.outcome !== 'confirmed') { safeToReleaseWorker = false; this.markCleanupUncertain(run, step, attempt, cleanup, 'execution_scope_finalization'); } } const completedContract = this.contracts.completeExecution(contract.id, !safeToReleaseWorker ? 'UNKNOWN' : controller.signal.aborted ? 'CANCELLED' : step.status === 'SUCCEEDED' ? 'EXECUTED' : 'FAILED', attempt.cleanup ? {outcome: attempt.cleanup.outcome, detail: attempt.cleanup.reason, verifiedAt: attempt.cleanup.completedAt} : undefined, attempt.executionAuthority);
      if(completedContract.process.state==='EXITED' && !completedContract.pty.writeOwner && completedContract.pty.ownershipGeneration===initialAuthority.pty.ownershipGeneration+1 && completedContract.baton.generation===initialAuthority.baton.generation) for(const entry of this.retainedCleanups.get(run.id)?.values() ?? []) if(entry.stepId===step.id) entry.authority={processId:completedContract.process.id,batonGeneration:completedContract.baton.generation,ownershipGeneration:completedContract.pty.ownershipGeneration};
      if (controller.signal.aborted && this.contracts.list().some(value => value.laneId === contract.laneId && value.pty.writeOwner?.startsWith('human:')) && safeToReleaseWorker) {
        run.status = 'PAUSED'; step.status = 'PAUSED'; delete run.endedAt; delete step.endedAt; step.waitingReason = 'Human takeover retained; explicit reconciliation required';
        this.ledger.update(run, 'run.human_takeover_retained', {contractId: contract.id});
      }
      if (safeToReleaseWorker && !controller.signal.aborted && step.status === 'SUCCEEDED' && registeredAction.kind === 'control') this.contracts.verify(contract.id, 'job-runtime:control-validator', true, step.verification?.passed.length ? step.verification.passed : ['Typed control Action completed']);
      if (safeToReleaseWorker) this.workers.release(worker.id); this.controllers.delete(run.id); finalizedAuthority={processId:completedContract.process.id,batonGeneration:completedContract.baton.generation,ownershipGeneration:completedContract.pty.ownershipGeneration};scopeFinalized=true;scheduleLateReconciliation(); }
  }

  private reconcileRetainedCleanup(runId: string, target?: RunStatus): Promise<void> {
    const running = this.runCleanups.get(runId); if (running) return running;
    const entries = this.retainedCleanups.get(runId), current = this.mustRun(runId);
    if (!entries?.size || !target && !['SUCCEEDED','FAILED','DEGRADED','CANCELLED'].includes(current.status)) return Promise.resolve();
    const terminal = target ?? current.status; current.status = 'CANCELLING'; delete current.endedAt; this.ledger.update(current, 'run.retained_cleanup_started');
    const pending = Promise.resolve().then(async () => {
      let uncertain = false;
      for (const [id, entry] of entries) {
        const at = this.clock().toISOString(); let timer: NodeJS.Timeout | undefined, proof: ExecutionCleanupReport;
        try { proof = await Promise.race([entry.cleanup(), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('retained_cleanup_deadline')), 10_000); })]); }
        catch (error) { proof = (error as {executionCleanup?: ExecutionCleanupReport})?.executionCleanup ?? {outcome:'uncertain',reason:safeFailureMessage(error instanceof Error ? error.message : String(error)),requestedAt:at,completedAt:this.clock().toISOString(),processes:[]}; }
        finally { if (timer) clearTimeout(timer); }
        const live = this.mustRun(runId), source = live.steps.find(step => step.id === entry.stepId)!;
        const artifact = this.artifacts.create(live, source.id, entry.workerId, {name:'retained-cleanup-outcome',type:'json',schema:'agent-control.attempt-evidence/v1',version:'1.0.0',retention:'run-history'}, {id,identity:entry.identity,proof}); source.artifactIds.push(artifact.id); live.artifacts.push(artifact.id);
        if (proof.outcome === 'confirmed') { if(entry.workerRetained)this.workers.release(entry.workerId); entries.delete(id); this.locks.release(runId, id); if(![...entries.values()].some(e=>e.stepId===source.id))this.locks.release(runId,source.id); const contractId=source.attempts.at(-1)?.contractId; if(contractId&&['CANCELLED','FAILED','DEGRADED'].includes(terminal)) this.contracts.completeExecution(contractId, terminal==='CANCELLED'?'CANCELLED':'FAILED', {outcome:'confirmed',detail:proof.reason,verifiedAt:proof.completedAt}, entry.authority); }
        else { uncertain = true; const attempt = source.attempts.at(-1)!; this.markCleanupUncertain(live, source, attempt, proof, 'retained_cleanup_unproved'); this.workers.claim(entry.workerId); entry.workerRetained=true; if (attempt.contractId) this.contracts.completeExecution(attempt.contractId, 'UNKNOWN', {outcome:'uncertain',detail:proof.reason,verifiedAt:proof.completedAt},entry.authority); }
        this.ledger.update(live, 'run.retained_cleanup_evidence');
      }
      const live = this.mustRun(runId); if (!uncertain) { live.status = terminal; live.endedAt = this.clock().toISOString(); this.locks.release(runId); if (terminal === 'CANCELLED') this.finalizeCancelledEfficiency(live, 'retained_cleanup_confirmed'); this.ledger.update(live, 'run.retained_cleanup_confirmed'); }
    }).catch(error => { const live = this.mustRun(runId); live.status='CLEANUP_UNCERTAIN'; live.errors.push('retained_cleanup_evidence_failure:'+safeFailureMessage(String(error))); for(const entry of entries.values()){if(!entry.workerRetained){this.workers.claim(entry.workerId);entry.workerRetained=true;}const source=live.steps.find(step=>step.id===entry.stepId)!;source.status='CLEANUP_UNCERTAIN';const id=source.attempts.at(-1)?.contractId;if(id)this.contracts.completeExecution(id,'UNKNOWN',{outcome:'uncertain',detail:'retained_cleanup_evidence_failure'},entry.authority);} this.ledger.update(live,'run.retained_cleanup_uncertain'); }).finally(() => { this.runCleanups.delete(runId); });
    this.runCleanups.set(runId,pending); return pending;
  }
  private nextRetryAt(step: RunRecord['steps'][number], retry: RetryPolicy) {
    const exponent = Math.max(0, step.attempts.length - 1), multiplied = retry.backoffSeconds * Math.pow(retry.backoffMultiplier ?? 1, exponent), delaySeconds = Math.min(multiplied, retry.maxBackoffSeconds ?? multiplied), candidate = new Date(this.clock().getTime() + delaySeconds * 1000);
    const deadline = Date.parse(step.recoveryDeadlineAt ?? '');
    return Number.isFinite(deadline) && candidate.getTime() > deadline ? undefined : candidate.toISOString();
  }
  private setExternalOperationState(step: RunRecord['steps'][number], state: ExternalOperationState, reason?: string, from?: ExternalOperationState[]) { for (const operation of step.externalOperations ?? []) if ((!from || from.includes(operation.state)) && operation.state !== state) { const at = this.clock().toISOString(), safeReason = reason ? safeFailureMessage(reason) : undefined; operation.state = state; operation.updatedAt = at; operation.transitions.push({state, at, ...(safeReason ? {reason: safeReason} : {})}); if (safeReason) operation.reason = safeReason; } }
  private applyExternalOperationStates(step: RunRecord['steps'][number], states?: ActionOutput['externalOperationStates']) { for (const state of states ?? []) { const operation = step.externalOperations?.find(item => item.effectId === state.effectId); if (!operation) throw new ActionFailure(`external_operation_effect_unknown:${state.effectId}`, 'verification'); if (operation.state === state.state) continue; const at = this.clock().toISOString(), reason = state.reason ? safeFailureMessage(state.reason) : undefined; operation.state = state.state; operation.updatedAt = at; operation.transitions.push({state: state.state, at, ...(reason ? {reason} : {})}); if (reason) operation.reason = reason; } }
  private markCleanupUncertain(run: RunRecord, step: RunRecord['steps'][number], attempt: StepAttempt, cleanup: ExecutionCleanupReport, reason: string) {
    const at = this.clock().toISOString(); step.status = 'CLEANUP_UNCERTAIN'; step.waitingReason = `Worker cleanup ${cleanup.outcome}; resource lease retained pending reconciliation`; step.error = `${reason}:cleanup_${cleanup.outcome}`; step.cleanup = cleanup; attempt.cleanup = cleanup; attempt.endedAt = at; attempt.outcome = step.error; attempt.terminalReason = 'cleanup_unproven'; run.status = 'CLEANUP_UNCERTAIN'; run.errors.push(`${step.id}:cleanup:${cleanup.outcome}`); run.provenance.push({type: 'cleanup-uncertain', at, detail: `outcome=${cleanup.outcome};processes=${cleanup.processes.length};resource-lock=retained`}); const ids = this.invocationIds(run, step.id); if (ids.length) { this.efficiency?.finalizePending(ids, 'FAILED', step.error, 'cleanup_unproven', at); this.efficiency?.markVerification(ids, 'FAIL'); } this.ledger.update(run, 'step.cleanup_uncertain', {cleanupOutcome: cleanup.outcome, processCount: cleanup.processes.length, resourceLockReleased: false});
  }
  private finalizeCancelledEfficiency(run: RunRecord, reason: string) { const ids = this.invocationIds(run); if (ids.length) { this.efficiency?.finalizePending(ids, 'CANCELLED', reason, reason, run.endedAt); this.efficiency?.markVerification(ids, 'FAIL', 'CANCELLED'); } }
  private inputArtifacts(run: RunRecord, stepId: string) { const definition = run.effectiveJob.spec.steps.find(step => step.id === stepId)!; return Object.values(definition.inputs ?? {}).map(reference => { const [sourceStep, artifactName] = reference.split('.'); const source = run.steps.find(step => step.id === sourceStep); const record = source?.artifactIds.map(id => this.artifacts.get(id)).find(item => item?.name === artifactName); if (!record) throw new ActionFailure(`input_artifact_missing:${reference}`, 'configuration'); this.artifacts.read(record.id); return record; }); }
  private recordActionOutput(run: RunRecord, stepId: string, workerId: string, output: ActionOutput) { const definition = run.effectiveJob.spec.steps.find(step => step.id === stepId)!, step = run.steps.find(item => item.id === stepId)!; for (const produced of output.artifacts ?? []) { const declaration = definition.outputs?.find(item => item.name === produced.name); if (!declaration) throw new ActionFailure(`undeclared_artifact:${produced.name}`, 'configuration'); if (produced.type && produced.type !== declaration.type || produced.schema && produced.schema !== declaration.schema || produced.version && produced.version !== declaration.version) throw new ActionFailure(`artifact_contract_mismatch:${produced.name}`, 'verification'); const artifact = this.artifacts.create(run, stepId, workerId, {...declaration, retention: produced.retention ?? declaration.retention}, produced.value); step.artifactIds.push(artifact.id); run.artifacts.push(artifact.id); } }
  private cancelDependents(run: RunRecord, failedStepId: string) { const blocked = new Set([failedStepId]); let changed = true; while (changed) { changed = false; for (const step of run.steps) if (!TERMINAL_STEPS.includes(step.status) && step.dependsOn.some(id => blocked.has(id))) { step.status = 'CANCELLED'; step.error = 'upstream_failed'; step.endedAt = this.clock().toISOString(); blocked.add(step.id); changed = true; } } }
  private invocationIds(run: RunRecord, stepId?: string) { const retained = run.steps.filter(step => !stepId || step.id === stepId).flatMap(step => step.attempts.flatMap(attempt => attempt.efficiencyInvocationIds ?? [])); const discovered = this.efficiency?.list().filter(item => item.runId === run.id && (!stepId || item.stepId === stepId)).map(item => item.id) ?? []; return [...new Set([...retained, ...discovered])]; }
  private captureExecutionSessions(run: RunRecord, step: RunRecord['steps'][number], attempt: StepAttempt, execution: OwnedExecution) { const ids = execution.sessionIds?.() ?? []; if (!ids.length) return; attempt.executionSessionIds = [...new Set([...(attempt.executionSessionIds ?? []), ...ids])]; for (const id of ids) if (!run.provenance.some(item => item.type === 'execution-session' && item.detail === id)) run.provenance.push({type: 'execution-session', at: this.clock().toISOString(), detail: id}); }
  private linkPriorRun(id: string, field: 'retriedByRunId', value: string) { const prior = this.ledger.get(id); if (!prior) throw new Error('retry_source_missing'); prior.lineage = {...prior.lineage, [field]: value}; this.ledger.update(prior, 'run.lineage_linked', {[field]: value}); }
  private finalizeRun(run: RunRecord) { if (run.steps.some(step => step.status === 'FAILED')) return; if (run.steps.some(step => !TERMINAL_STEPS.includes(step.status))) { const status: RunStatus = run.steps.some(step => step.status === 'AUTHENTICATION_BLOCKED') ? 'AUTHENTICATION_BLOCKED' : run.steps.some(step => step.status === 'CLEANUP_UNCERTAIN') ? 'CLEANUP_UNCERTAIN' : run.steps.some(step => step.status === 'CANCEL_PENDING') ? 'CANCELLING' : run.steps.some(step => step.status === 'RETRY_PENDING' && ['transient-transport', 'expired-enrolment'].includes(step.attempts.at(-1)?.recoveryKind ?? '')) ? 'RECONNECTING' : run.steps.some(step => ['WAITING_FOR_WORKER', 'WAITING_FOR_DEPENDENCY', 'WAITING_FOR_RESOURCE', 'WAITING_FOR_APPROVAL', 'RETRY_PENDING'].includes(step.status)) ? 'WAITING' : 'RUNNING'; if (run.status !== status) { run.status = status; this.ledger.update(run, status === 'RECONNECTING' ? 'run.reconnecting' : status === 'AUTHENTICATION_BLOCKED' ? 'run.authentication_blocked' : status === 'CANCELLING' ? 'run.cancelling' : status === 'CLEANUP_UNCERTAIN' ? 'run.cleanup_uncertain' : status === 'WAITING' ? 'run.waiting' : 'run.continuing'); } return; } if (this.retainedCleanups.get(run.id)?.size) { const terminal = run.steps.every(step => step.status === 'SUCCEEDED') ? 'SUCCEEDED' : 'DEGRADED'; run.status = 'CANCELLING'; this.ledger.update(run, 'run.retained_cleanup_requested'); void this.reconcileRetainedCleanup(run.id, terminal); return; } run.status = run.steps.every(step => step.status === 'SUCCEEDED') ? 'SUCCEEDED' : 'DEGRADED'; run.endedAt = this.clock().toISOString(); const ids = run.steps.flatMap(step => step.attempts.flatMap(attempt => attempt.efficiencyInvocationIds ?? [])); if (ids.length) this.efficiency?.markFinalResult(ids, run.status as Exclude<InvocationFinalResult, 'UNKNOWN'>); this.locks.release(run.id); if (run.trigger.type === 'schedule' && run.trigger.id) { const state = this.ledger.schedule(run.trigger.id); if (state) { if (run.status === 'SUCCEEDED') state.lastSuccessAt = run.endedAt; else state.lastFailureAt = run.endedAt; state.updatedAt = run.endedAt; this.ledger.saveSchedule(state); } } this.ledger.update(run, 'run.finished'); }
  private mustRun(id: string) { const run = this.ledger.get(id); if (!run) throw new Error('run_missing'); return run; }
}

export function createJobRuntime(root: string, catalog: JobCatalog, actions: ActionRegistry, workers: WorkerRegistry, options?: JobRuntimeOptions) {
  const activityEvidence=(run:RunRecord)=>{const values=options?.efficiency?.list().filter(item=>item.runId===run.id)??[],single=(items:string[])=>{const unique=[...new Set(items.filter(Boolean))];return unique.length===1?unique[0]:undefined;},sum=(items:Array<number|null>)=>items.length&&items.every(item=>typeof item==='number')?items.reduce((total,item)=>total+(item??0),0):undefined;return {provider:single(values.map(item=>item.provider)),model:single(values.map(item=>item.model)),laneId:single(values.map(item=>item.laneId)),inputTokens:sum(values.map(item=>item.usage.inputTokens)),cachedInputTokens:sum(values.map(item=>item.usage.cachedInputTokens)),outputTokens:sum(values.map(item=>item.usage.outputTokens)),totalTokens:sum(values.map(item=>item.usage.totalProcessedTokens)),evidenceReference:run.artifacts.at(-1)};};
  const jobsRoot = path.join(root, 'jobs'), ledger = new RunLedger(path.join(jobsRoot, 'run-ledger.json'),createActivityLogProjection(root),activityEvidence), interrupted = ledger.recoverFailClosed();
  const contracts = options?.contracts ?? options?.executionSessions?.contracts ?? new ContractExecutionRuntime(path.join(jobsRoot, 'contracts.json'));
  for (const contract of contracts.list()) if (interrupted.includes(String(contract.baton.payload.runId)) && !['VERIFIED','FAILED','CANCELLED','TIMED_OUT'].includes(contract.state)) contracts.completeExecution(contract.id, 'UNKNOWN', {outcome: 'uncertain', detail: 'controller_restart_execution_identity_unproved'});
  const artifacts = new ArtifactStore(path.join(jobsRoot, 'artifact-store')), locks = new ResourceLockManager(path.join(jobsRoot, 'resource-locks.json'));
  const heldWorkers = new Map<string, number>();
  for (const id of interrupted) {
    const run = ledger.get(id)!, step = [...run.steps].reverse().find(item => item.attempts.length) ?? run.steps[0]; if (!step) continue;
    const evidence = artifacts.create(run, step.id, 'controller-recovery', {name: 'controller-recovery-blocked', type: 'json', schema: 'agent-control.recovery-evidence/v1', version: '1.0.0', retention: 'run-history'}, {reason: 'execution_identity_unproven_after_restart', verification: 'BLOCKED', cleanup: 'UNKNOWN', retainedArtifacts: artifacts.list(id).map(item => ({id: item.id, name: item.name, sha256: item.sha256, storageRef: item.storageRef})), contracts: contracts.list().filter(contract => String(contract.baton.payload.runId) === id), resourceLocks: locks.list().filter(item => item.runId === id), disposition: 'Evidence and disposable resources retained; no deletion or execution without identity reconciliation'});
    step.artifactIds.push(evidence.id); run.artifacts.push(evidence.id);
    for (const unresolved of run.steps.filter(item => item.attempts.some(attempt => { const contract = attempt.contractId ? contracts.list().find(value => value.id === attempt.contractId) : undefined; return contract ? contract.process.state === 'UNKNOWN' : Boolean(attempt.workerId && attempt.cleanup?.outcome !== 'confirmed'); }))) {
      locks.acquire(unresolved.resources, run.id, unresolved.id, true); const workerId = unresolved.attempts.at(-1)?.workerId; if (workerId) heldWorkers.set(workerId, (heldWorkers.get(workerId) ?? 0) + 1);
    }
    ledger.update(run, 'run.restart_evidence_retained', {artifactId: evidence.id, cleanup: 'UNKNOWN', verification: 'BLOCKED'});
  }
  for (const worker of workers.list()) if (heldWorkers.has(worker.id)) workers.upsert({...worker, active: Math.max(worker.active, heldWorkers.get(worker.id)!)});
  return new JobRuntime(catalog, actions, workers, ledger, artifacts, locks, {...options, contracts});
}

function crewRole(actionId: string): ExecutionSessionScope['crewRole'] {
  if (/managed-node|remote/i.test(actionId)) return 'resource-guardian';
  if (/test|verify|quality|review/i.test(actionId)) return 'quality-inspector';
  if (/model|provider|route/i.test(actionId)) return 'model-scout';
  if (/prompt|plan/i.test(actionId)) return 'prompt-reviewer';
  return 'parcel-coordinator';
}

function efficiencyInvocationIds(error: unknown): string[] { const value = error as {efficiencyInvocationIds?: unknown}; return Array.isArray(value?.efficiencyInvocationIds) ? value.efficiencyInvocationIds.filter((item): item is string => typeof item === 'string') : []; }
function partialActionOutput(error: unknown): ActionOutput | undefined { const value = error as {partialActionOutput?: unknown}; return value?.partialActionOutput && typeof value.partialActionOutput === 'object' ? value.partialActionOutput as ActionOutput : undefined; }
function safeFailureMessage(value: string) { return redactSensitiveValue(String(value)).replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[REDACTED_ACCOUNT]').slice(0, 2048); }

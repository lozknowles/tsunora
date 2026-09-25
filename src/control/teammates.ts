import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {HarnessEfficiencyLedgerPort} from './harness-efficiency.js';
import type {JobCatalog} from './job-catalog.js';
import type {JobRuntime} from './job-runtime.js';
import type {JobDefinition, RunRecord} from './job-types.js';

const ID = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'DEGRADED', 'CANCELLED', 'MISSED', 'DISCONNECTED']);
const SECRET = /(?:\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\bsk-[A-Za-z0-9_-]{12,})/i;

function iso() { return new Date().toISOString(); }
function safeId(value: string, label: string) { if (!ID.test(value)) throw new Error(`${label}_invalid`); return value; }
function safeText(value: string, label: string, maximum = 16_384) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new Error(`${label}_invalid`);
  if (SECRET.test(value)) throw new Error(`${label}_secret_like`);
  return value.trim();
}
function writeJsonAtomic(file: string, value: unknown) { fs.mkdirSync(path.dirname(file), {recursive: true}); const temporary = `${file}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600}); fs.renameSync(temporary, file); }

export type RoutineSource = 'operator' | 'verified-run';
export interface TeammateRoutine {
  id: string;
  name: string;
  instructions: string;
  source: RoutineSource;
  sourceRunId?: string;
  evidenceIds: string[];
  savedAt: string;
}
export interface TeammateContextEntry {
  id: string;
  summary: string;
  sourceRunId: string;
  evidenceIds: string[];
  retainedAt: string;
}
export interface TeammateProfile {
  id: string;
  name: string;
  role: string;
  instructions: string;
  preferredCapabilities: string[];
  coordinator?: boolean;
  retainedContext: TeammateContextEntry[];
  routines: TeammateRoutine[];
  createdAt: string;
  updatedAt: string;
}
export interface TeammateTelemetry {
  invocationIds: string[];
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cost: number | null;
  currency: string | null;
}
export interface TeammateMessage {
  id: string;
  at: string;
  from: string;
  to: string;
  kind: 'delegation' | 'result' | 'synthesis' | 'control';
  content: string;
  runId?: string;
}
export interface TeammateConversation {
  id: string;
  coordinatorId: string;
  participantIds: string[];
  task: string;
  status: 'OPEN' | 'VERIFIED' | 'REVIEW_REQUIRED';
  messages: TeammateMessage[];
  createdAt: string;
  updatedAt: string;
}
export interface TeammateDelegation {
  id: string;
  conversationId: string;
  coordinatorId: string;
  teammateId: string;
  phase: 'specialist' | 'synthesis';
  task: string;
  status: 'QUEUED' | 'RUNNING' | 'VERIFIED' | 'REVIEW_REQUIRED';
  runId?: string;
  result?: string;
  evidenceIds: string[];
  telemetry?: TeammateTelemetry;
  createdAt: string;
  updatedAt: string;
}
interface TeammateSnapshot {schema: 'agent-control.persistent-teammates/v1'; profiles: TeammateProfile[]; conversations: TeammateConversation[]; delegations: TeammateDelegation[];}

export class PersistentTeammateStore {
  private readonly profiles = new Map<string, TeammateProfile>();
  private readonly conversations = new Map<string, TeammateConversation>();
  private readonly delegations = new Map<string, TeammateDelegation>();
  constructor(readonly file: string) {
    if (!fs.existsSync(file)) return;
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as TeammateSnapshot;
    if (value.schema !== 'agent-control.persistent-teammates/v1') throw new Error('teammate_snapshot_unsupported');
    for (const profile of value.profiles) this.profiles.set(profile.id, profile);
    for (const conversation of value.conversations) this.conversations.set(conversation.id, conversation);
    for (const delegation of value.delegations) this.delegations.set(delegation.id, delegation);
  }
  static load(file = path.resolve(process.env.AGENT_CONTROL_STATE_DIR || '.agent-control', 'teammates.json')) { return new PersistentTeammateStore(file); }
  listProfiles() { return [...this.profiles.values()].map(value => structuredClone(value)); }
  profile(id: string) { const value = this.profiles.get(id); if (!value) throw new Error('teammate_missing'); return structuredClone(value); }
  upsertProfile(input: Omit<TeammateProfile, 'retainedContext' | 'routines' | 'createdAt' | 'updatedAt'> & {retainedContext?: TeammateContextEntry[]; routines?: TeammateRoutine[]}) {
    const id = safeId(input.id, 'teammate_id'), current = this.profiles.get(id), at = iso();
    const preferredCapabilities = [...new Set(input.preferredCapabilities.map(value => safeId(value, 'capability')))];
    const value: TeammateProfile = {id, name: safeText(input.name, 'teammate_name', 160), role: safeText(input.role, 'teammate_role', 500), instructions: safeText(input.instructions, 'teammate_instructions'), preferredCapabilities, coordinator: Boolean(input.coordinator), retainedContext: structuredClone(input.retainedContext ?? current?.retainedContext ?? []), routines: structuredClone(input.routines ?? current?.routines ?? []), createdAt: current?.createdAt ?? at, updatedAt: at};
    this.profiles.set(id, value); this.save(); return this.profile(id);
  }
  saveRoutine(teammateId: string, input: {id: string; name: string; instructions: string; source: RoutineSource; sourceRunId?: string; evidenceIds?: string[]}) {
    const profile = this.profile(teammateId), evidenceIds = [...new Set(input.evidenceIds ?? [])];
    if (input.source === 'verified-run' && (!input.sourceRunId || !evidenceIds.length)) throw new Error('verified_routine_evidence_required');
    const routine: TeammateRoutine = {id: safeId(input.id, 'routine_id'), name: safeText(input.name, 'routine_name', 160), instructions: safeText(input.instructions, 'routine_instructions'), source: input.source, sourceRunId: input.sourceRunId, evidenceIds, savedAt: iso()};
    profile.routines = [...profile.routines.filter(value => value.id !== routine.id), routine]; profile.updatedAt = iso(); this.profiles.set(profile.id, profile); this.save(); return structuredClone(routine);
  }
  retainContext(teammateId: string, input: Omit<TeammateContextEntry, 'retainedAt'>) {
    const profile = this.profile(teammateId); if (!input.evidenceIds.length) throw new Error('retained_context_evidence_required');
    const entry: TeammateContextEntry = {id: safeId(input.id, 'context_id'), summary: safeText(input.summary, 'context_summary', 4_096), sourceRunId: safeText(input.sourceRunId, 'context_run_id', 160), evidenceIds: [...new Set(input.evidenceIds)], retainedAt: iso()};
    profile.retainedContext = [...profile.retainedContext.filter(value => value.id !== entry.id), entry].slice(-32); profile.updatedAt = iso(); this.profiles.set(profile.id, profile); this.save(); return structuredClone(entry);
  }
  createConversation(coordinatorId: string, participantIds: string[], task: string) {
    const coordinator = this.profile(coordinatorId); if (!coordinator.coordinator) throw new Error('coordinator_role_required');
    const participants = [...new Set([coordinatorId, ...participantIds])]; participants.forEach(id => this.profile(id)); if (participants.length < 3) throw new Error('two_specialists_required');
    const at = iso(), value: TeammateConversation = {id: `conversation-${randomUUID()}`, coordinatorId, participantIds: participants, task: safeText(task, 'conversation_task'), status: 'OPEN', messages: [], createdAt: at, updatedAt: at};
    this.conversations.set(value.id, value); this.save(); return structuredClone(value);
  }
  conversation(id: string) { const value = this.conversations.get(id); if (!value) throw new Error('conversation_missing'); return structuredClone(value); }
  message(conversationId: string, input: Omit<TeammateMessage, 'id' | 'at'>) {
    const conversation = this.conversation(conversationId); if (!conversation.participantIds.includes(input.from) || !conversation.participantIds.includes(input.to)) throw new Error('conversation_participant_denied');
    const value: TeammateMessage = {...structuredClone(input), id: `message-${randomUUID()}`, at: iso(), content: safeText(input.content, 'conversation_message')}; conversation.messages.push(value); conversation.updatedAt = value.at; this.conversations.set(conversation.id, conversation); this.save(); return structuredClone(value);
  }
  createDelegation(input: Omit<TeammateDelegation, 'id' | 'status' | 'evidenceIds' | 'createdAt' | 'updatedAt'>) {
    const conversation = this.conversation(input.conversationId); if (conversation.coordinatorId !== input.coordinatorId || !conversation.participantIds.includes(input.teammateId)) throw new Error('delegation_authority_denied');
    const at = iso(), value: TeammateDelegation = {...structuredClone(input), id: `delegation-${randomUUID()}`, task: safeText(input.task, 'delegation_task'), status: 'QUEUED', evidenceIds: [], createdAt: at, updatedAt: at}; this.delegations.set(value.id, value); this.save(); return structuredClone(value);
  }
  updateDelegation(id: string, patch: Partial<Pick<TeammateDelegation, 'status' | 'runId' | 'result' | 'evidenceIds' | 'telemetry'>>) { const value = this.delegations.get(id); if (!value) throw new Error('delegation_missing'); Object.assign(value, structuredClone(patch), {updatedAt: iso()}); this.delegations.set(id, value); this.save(); return structuredClone(value); }
  closeConversation(id: string, status: TeammateConversation['status']) { const value = this.conversation(id); value.status = status; value.updatedAt = iso(); this.conversations.set(id, value); this.save(); return structuredClone(value); }
  listDelegations(conversationId?: string) { return [...this.delegations.values()].filter(value => !conversationId || value.conversationId === conversationId).map(value => structuredClone(value)); }
  private save() { writeJsonAtomic(this.file, {schema: 'agent-control.persistent-teammates/v1', profiles: this.listProfiles(), conversations: [...this.conversations.values()], delegations: [...this.delegations.values()]} satisfies TeammateSnapshot); }
}

export function seedPersistentTeammates(store: PersistentTeammateStore, file = path.resolve('config/teammates.initial.json')) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8')) as TeammateSnapshot;
  if (value.schema !== 'agent-control.persistent-teammates/v1') throw new Error('teammate_seed_unsupported');
  for (const profile of value.profiles) store.upsertProfile({id: profile.id, name: profile.name, role: profile.role, instructions: profile.instructions, preferredCapabilities: profile.preferredCapabilities, coordinator: profile.coordinator, retainedContext: profile.retainedContext, routines: profile.routines});
  return store.listProfiles();
}

export interface GovernedTeammateRequest {conversationId: string; delegationId: string; teammate: TeammateProfile; phase: 'specialist' | 'synthesis'; task: string; priorResults: Array<{teammateId: string; result: string; runId: string; evidenceIds: string[]}>;}
export interface GovernedTeammateResult {runId: string; runStatus: RunRecord['status']; result: string; evidenceIds: string[]; verifierResult: 'PASS' | 'FAIL' | 'UNKNOWN'; telemetry: TeammateTelemetry;}
export interface GovernedTeammateExecutor {execute(request: GovernedTeammateRequest): Promise<GovernedTeammateResult>;}

export class PersistentTeammateCoordinator {
  constructor(readonly store: PersistentTeammateStore, readonly executor: GovernedTeammateExecutor) {}
  async coordinate(input: {coordinatorId: string; task: string; assignments: Array<{teammateId: string; task: string}>}) {
    if (new Set(input.assignments.map(value => value.teammateId)).size < 2) throw new Error('two_specialists_required');
    for (const assignment of input.assignments) if (this.store.profile(assignment.teammateId).coordinator) throw new Error('coordinator_cannot_be_specialist');
    const conversation = this.store.createConversation(input.coordinatorId, input.assignments.map(value => value.teammateId), input.task), verified: Array<{teammateId: string; result: string; runId: string; evidenceIds: string[]}> = [];
    for (const assignment of input.assignments) {
      const teammate = this.store.profile(assignment.teammateId), delegation = this.store.createDelegation({conversationId: conversation.id, coordinatorId: input.coordinatorId, teammateId: teammate.id, phase: 'specialist', task: assignment.task});
      this.store.message(conversation.id, {from: input.coordinatorId, to: teammate.id, kind: 'delegation', content: assignment.task}); this.store.updateDelegation(delegation.id, {status: 'RUNNING'});
      const outcome = await this.executor.execute({conversationId: conversation.id, delegationId: delegation.id, teammate, phase: 'specialist', task: assignment.task, priorResults: []});
      if (!accepted(outcome)) { this.store.updateDelegation(delegation.id, {status: 'REVIEW_REQUIRED', runId: outcome.runId, result: outcome.result, evidenceIds: outcome.evidenceIds, telemetry: outcome.telemetry}); this.store.closeConversation(conversation.id, 'REVIEW_REQUIRED'); throw new TeammateEscalationError(conversation.id, delegation.id, outcome); }
      this.store.updateDelegation(delegation.id, {status: 'VERIFIED', runId: outcome.runId, result: outcome.result, evidenceIds: outcome.evidenceIds, telemetry: outcome.telemetry}); this.store.message(conversation.id, {from: teammate.id, to: input.coordinatorId, kind: 'result', content: outcome.result, runId: outcome.runId}); verified.push({teammateId: teammate.id, result: outcome.result, runId: outcome.runId, evidenceIds: outcome.evidenceIds});
      this.store.retainContext(teammate.id, {id: `verified-${outcome.runId}`, summary: outcome.result.slice(0, 4_096), sourceRunId: outcome.runId, evidenceIds: outcome.evidenceIds});
    }
    const coordinator = this.store.profile(input.coordinatorId), synthesis = this.store.createDelegation({conversationId: conversation.id, coordinatorId: coordinator.id, teammateId: coordinator.id, phase: 'synthesis', task: input.task}); this.store.updateDelegation(synthesis.id, {status: 'RUNNING'});
    const combined = await this.executor.execute({conversationId: conversation.id, delegationId: synthesis.id, teammate: coordinator, phase: 'synthesis', task: input.task, priorResults: verified});
    if (!accepted(combined)) { this.store.updateDelegation(synthesis.id, {status: 'REVIEW_REQUIRED', runId: combined.runId, result: combined.result, evidenceIds: combined.evidenceIds, telemetry: combined.telemetry}); this.store.closeConversation(conversation.id, 'REVIEW_REQUIRED'); throw new TeammateEscalationError(conversation.id, synthesis.id, combined); }
    this.store.updateDelegation(synthesis.id, {status: 'VERIFIED', runId: combined.runId, result: combined.result, evidenceIds: combined.evidenceIds, telemetry: combined.telemetry}); this.store.message(conversation.id, {from: coordinator.id, to: coordinator.id, kind: 'synthesis', content: combined.result, runId: combined.runId}); this.store.retainContext(coordinator.id, {id: `verified-${combined.runId}`, summary: combined.result.slice(0, 4_096), sourceRunId: combined.runId, evidenceIds: combined.evidenceIds}); this.store.closeConversation(conversation.id, 'VERIFIED');
    return {conversationId: conversation.id, result: combined.result, runId: combined.runId, specialistRuns: verified.map(value => value.runId), delegationIds: this.store.listDelegations(conversation.id).map(value => value.id), telemetry: this.store.listDelegations(conversation.id).map(value => ({teammateId: value.teammateId, runId: value.runId!, ...value.telemetry!}))};
  }
}

export class TeammateEscalationError extends Error { constructor(readonly conversationId: string, readonly delegationId: string, readonly outcome: GovernedTeammateResult) { super(`teammate_verification_required:${delegationId}`); this.name = 'TeammateEscalationError'; } }
function accepted(value: GovernedTeammateResult) { return value.runStatus === 'SUCCEEDED' && value.verifierResult === 'PASS' && value.evidenceIds.length > 0 && value.telemetry.invocationIds.length > 0; }

export class JobRuntimeTeammateExecutor implements GovernedTeammateExecutor {
  constructor(readonly runtime: JobRuntime, readonly catalog: JobCatalog, readonly actionId: string, readonly telemetry: HarnessEfficiencyLedgerPort, readonly options: {allowControlActionForDemo?: boolean; maximumTicks?: number} = {}) {
    const kind = runtime.actions.kind(actionId); if (kind !== 'agent' && !options.allowControlActionForDemo) throw new Error('teammate_action_must_be_agent_action');
  }
  async execute(request: GovernedTeammateRequest): Promise<GovernedTeammateResult> {
    const jobId = `teammate-${request.teammate.id}-${request.phase}`, outputName = 'teammate-result';
    const job: JobDefinition = {apiVersion: 'agent-control/v1', kind: 'Job', metadata: {id: jobId, name: `${request.teammate.name} governed ${request.phase}`, version: '1.0.0', description: 'Persistent Teammate delegation governed by Agent Control'}, spec: {enabled: true, priority: request.phase === 'synthesis' ? 'high' : 'normal', concurrency: 'queue', parameters: {teammateId: {type: 'string', required: true}, conversationId: {type: 'string', required: true}, delegationId: {type: 'string', required: true}, role: {type: 'string', required: true}, instructions: {type: 'string', required: true}, task: {type: 'string', required: true}, phase: {type: 'string', required: true}, context: {type: 'string', required: true}}, steps: [{id: 'execute', name: `${request.teammate.name} governed execution`, action: this.actionId, requires: [...request.teammate.preferredCapabilities], outputs: [{name: outputName, type: 'application/vnd.agent-control.teammate-result+json', schema: 'agent-control.teammate-result/v1', version: '1.0.0'}], verification: ['teammate-output-verified']}]}};
    const existing = this.catalog.job(`${jobId}@1.0.0`);
    if (!existing) this.catalog.addJob(job);
    else if (existing.spec.steps[0]?.action !== this.actionId || JSON.stringify(existing.spec.steps[0]?.requires ?? []) !== JSON.stringify(request.teammate.preferredCapabilities)) throw new Error('teammate_job_definition_changed');
    const instructions = [request.teammate.instructions, ...request.teammate.routines.map(value => `Routine ${value.name}: ${value.instructions}`)].join('\n\n');
    const context = JSON.stringify({retainedContext: request.teammate.retainedContext, priorResults: request.priorResults});
    const run = this.runtime.createRun(`${jobId}@1.0.0`, {teammateId: request.teammate.id, conversationId: request.conversationId, delegationId: request.delegationId, role: request.teammate.role, instructions, task: request.task, phase: request.phase, context}, {type: 'manual', actor: `teammate-coordinator:${request.conversationId}`});
    for (let count = 0; count < (this.options.maximumTicks ?? 20); count++) { const current = this.runtime.ledger.get(run.id)!; if (TERMINAL.has(current.status)) break; await this.runtime.tick(); }
    const completed = this.runtime.ledger.get(run.id)!; if (!TERMINAL.has(completed.status)) throw new Error('teammate_run_did_not_terminate');
    const step = completed.steps[0], artifact = step.artifactIds.map(id => this.runtime.artifacts.get(id)).find(value => value?.name === outputName); const value = artifact ? this.runtime.artifacts.read(artifact.id) as {result?: unknown} : undefined;
    const invocationIds = step.attempts.flatMap(attempt => attempt.efficiencyInvocationIds ?? []), observations = this.telemetry.list().filter(value => invocationIds.includes(value.id));
    return {runId: completed.id, runStatus: completed.status, result: typeof value?.result === 'string' ? value.result : completed.errors.join('; ') || 'No verified result', evidenceIds: completed.provenance.filter(value => value.type === 'evidence').map(value => value.detail), verifierResult: step.verification?.failed.length === 0 && step.verification.passed.includes('teammate-output-verified') ? 'PASS' : 'FAIL', telemetry: aggregateTelemetry(invocationIds, observations)};
  }
}

function aggregateTelemetry(invocationIds: string[], values: ReturnType<HarnessEfficiencyLedgerPort['list']>): TeammateTelemetry {
  const known = (selector: (value: (typeof values)[number]) => number | null) => values.length > 0 && values.every(value => selector(value) !== null);
  const sum = (selector: (value: (typeof values)[number]) => number | null) => values.reduce((total, value) => total + (selector(value) ?? 0), 0);
  const input = known(value => value.usage.inputTokens) ? sum(value => value.usage.inputTokens) : null, cached = known(value => value.usage.cachedInputTokens) ? sum(value => value.usage.cachedInputTokens) : null, output = known(value => value.usage.outputTokens) ? sum(value => value.usage.outputTokens) : null, total = known(value => value.usage.totalProcessedTokens) ? sum(value => value.usage.totalProcessedTokens) : null;
  const costs = values.map(value => value.providerReportedCost ?? value.calculatedCost), cost = costs.length && costs.every(value => value !== null) ? costs.reduce<number>((sum, value) => sum + Number(value), 0) : null, currencies = [...new Set(values.map(value => value.currency).filter((value): value is string => Boolean(value)))];
  return {invocationIds: [...invocationIds], inputTokens: input, cachedInputTokens: cached, outputTokens: output, totalTokens: total, cost, currency: currencies.length === 1 ? currencies[0] : null};
}

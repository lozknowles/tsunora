import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type ContractState = 'ACTIVE' | 'PAUSED' | 'CANCELLING' | 'CANCELLED' | 'TIMED_OUT' | 'ORPHANED' | 'VERIFYING' | 'VERIFIED' | 'FAILED';
export type ProcessState = 'STARTING' | 'RUNNING' | 'PAUSED' | 'EXITED' | 'CANCEL_PENDING' | 'ORPHANED' | 'UNKNOWN';
export type PtyState = 'ATTACHED' | 'DETACHED' | 'LOST' | 'CLOSED';
export type PtyParticipantAccess = 'observe' | 'write';
export interface ContractCleanupResult {outcome: 'confirmed' | 'uncertain' | 'identity-mismatch' | 'failed'; detail?: string; verifiedAt?: string;}

export interface ContractBaton {
  generation: number;
  payload: Record<string, unknown>;
  sha256: string;
  sizeBytes: number;
  createdAt: string;
  createdBy: string;
}

export interface ContractParticipant {actorId: string; kind: 'human' | 'agent' | 'service'; access: PtyParticipantAccess; attachedAt: string;}
export interface ContractTranscript {sequence: number; at: string; source: 'process' | 'human' | 'agent' | 'system'; text: string;}
export interface ContractPendingAction {id: string; kind: 'write-control' | 'approval' | 'cancel'; requestedBy: string; reason: string; status: 'PENDING' | 'APPROVED' | 'DENIED' | 'COMPLETED'; createdAt: string; decidedAt?: string; decidedBy?: string;}
export interface ContractEvidence {id: string; kind: string; reference: string; sha256?: string; createdAt: string;}

export interface ContractExecution {
  schema: 'agent-control.contract-execution/v1';
  id: string;
  laneId: string;
  parentContractId?: string;
  operatorActorId: string;
  objective: string;
  completionCriteria: string[];
  authority: string[];
  protectedResources: string[];
  budget: {deadlineAt?: string; remainingTokens?: number; remainingCost?: number; currency?: string};
  state: ContractState;
  active: {actorId: string; agentId: string; modelId?: string; providerId?: string; accountProfileId?: string; runtimeId: string; nodeId: string; workloadNodeId?: string; providerExecutionNodeId?: string; credentialNodeId?: string};
  baton: ContractBaton;
  process: {id: string; pid?: number; state: ProcessState; startedAt: string; observedAt: string; exitCode?: number; signal?: string; cleanup?: ContractCleanupResult};
  pty: {id: string; state: PtyState; writeOwner?: string; ownershipGeneration: number; participants: ContractParticipant[]; transcript: ContractTranscript[]; nextSequence: number};
  attachments: Array<{id: string; kind: string; reference: string; sha256?: string}>;
  permissions: {capabilities: string[]; filesystem: 'none' | 'read' | 'write'; network: 'none' | 'provider-only' | 'unrestricted'; production: boolean};
  pendingActions: ContractPendingAction[];
  handoffs: string[];
  verification: {state: 'UNSUBMITTED' | 'PENDING' | 'PASSED' | 'FAILED'; submittedAt?: string; verifierActorId?: string; evidenceIds: string[]; reasons: string[]};
  evidence: ContractEvidence[];
  history: Array<{at: string; event: string; actorId: string; detail: string}>;
  createdAt: string;
  updatedAt: string;
}

interface ContractSnapshot {schema: 'agent-control.contract-executions/v1'; contracts: ContractExecution[];}
export interface ContractProcessPort {cancel(processId: string, reason: string): Promise<ContractCleanupResult | void> | ContractCleanupResult | void; pause?(processId: string, reason: string): Promise<void> | void;}

/** Durable authority and recovery state for Lane -> Contract -> Baton -> Process/PTY -> Agent. */
export class ContractExecutionRuntime {
  private readonly contracts = new Map<string, ContractExecution>();
  private readonly listeners = new Set<(contract: ContractExecution) => void>();
  subscribe(listener: (contract: ContractExecution) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  constructor(readonly file?: string, readonly processes: ContractProcessPort = {cancel: () => ({outcome: 'uncertain', detail: 'process_port_not_configured'})}, readonly clock: () => string = () => new Date().toISOString()) { this.load(); }

  create(input: {
    id?: string; laneId: string; parentContractId?: string; operatorActorId: string; objective: string; completionCriteria: string[]; authority: string[]; protectedResources?: string[];
    budget?: ContractExecution['budget']; active: ContractExecution['active']; baton: Record<string, unknown>; process: {id: string; pid?: number}; ptyId: string;
    attachments?: ContractExecution['attachments']; permissions: ContractExecution['permissions'];
  }) {
    if (!input.objective.trim() || !input.completionCriteria.length) throw new Error('contract_definition_invalid');
    if (input.parentContractId && !this.contracts.has(input.parentContractId)) throw new Error('parent_contract_missing');
    rejectSecrets(input);
    const id = input.id ?? `contract:${randomUUID()}`; if (this.contracts.has(id)) throw new Error('contract_exists');
    const at = this.clock(), contract: ContractExecution = {
      schema: 'agent-control.contract-execution/v1', id, laneId: input.laneId, parentContractId: input.parentContractId, operatorActorId: input.operatorActorId,
      objective: input.objective, completionCriteria: [...input.completionCriteria], authority: unique(input.authority), protectedResources: unique(input.protectedResources ?? []), budget: structuredClone(input.budget ?? {}), state: 'ACTIVE', active: structuredClone(input.active),
      baton: sealBaton(1, input.baton, input.operatorActorId, at), process: {id: input.process.id, pid: input.process.pid, state: 'RUNNING', startedAt: at, observedAt: at},
      pty: {id: input.ptyId, state: 'DETACHED', ownershipGeneration: 0, participants: [], transcript: [], nextSequence: 1}, attachments: structuredClone(input.attachments ?? []), permissions: structuredClone(input.permissions), pendingActions: [], handoffs: [],
      verification: {state: 'UNSUBMITTED', evidenceIds: [], reasons: []}, evidence: [], history: [{at, event: 'contract.created', actorId: input.operatorActorId, detail: `process=${input.process.id};pty=${input.ptyId}`}], createdAt: at, updatedAt: at,
    };
    this.contracts.set(id, contract); this.save(); return this.get(id);
  }

  get(id: string) { const value = this.contracts.get(id); if (!value) throw new Error('contract_missing'); return structuredClone(value); }
  list() { return [...this.contracts.values()].map(value => structuredClone(value)); }

  attach(id: string, participant: Omit<ContractParticipant, 'access' | 'attachedAt'>, access: PtyParticipantAccess = 'observe') {
    const contract = this.get(id); if (['CANCELLED','TIMED_OUT','VERIFIED','FAILED'].includes(contract.state)) throw new Error('contract_terminal');
    if (access === 'write' && contract.pty.writeOwner && contract.pty.writeOwner !== participant.actorId) throw new Error('pty_write_control_held');
    const at = this.clock(), value: ContractParticipant = {...participant, access, attachedAt: at};
    contract.pty.participants = [...contract.pty.participants.filter(item => item.actorId !== participant.actorId), value];
    if (access === 'write') { contract.pty.writeOwner = participant.actorId; contract.pty.ownershipGeneration++; }
    contract.pty.state = 'ATTACHED'; this.record(contract, 'pty.attached', participant.actorId, `${access};generation=${contract.pty.ownershipGeneration}`); return value;
  }

  consult(id: string, participant: Omit<ContractParticipant, 'access' | 'attachedAt'>) { return this.attach(id, participant, 'observe'); }

  detach(id: string, actorId: string) {
    const contract = this.get(id), existed = contract.pty.participants.some(item => item.actorId === actorId); if (!existed) throw new Error('pty_participant_missing');
    contract.pty.participants = contract.pty.participants.filter(item => item.actorId !== actorId);
    if (contract.pty.writeOwner === actorId) { delete contract.pty.writeOwner; contract.pty.ownershipGeneration++; }
    if (!contract.pty.participants.length) contract.pty.state = 'DETACHED';
    this.record(contract, 'pty.detached', actorId, `process=${contract.process.state};generation=${contract.pty.ownershipGeneration}`); return this.get(id);
  }

  reconnect(id: string, participant: Omit<ContractParticipant, 'access' | 'attachedAt'>) {
    const contract = this.get(id); if (!['RUNNING','UNKNOWN'].includes(contract.process.state)) throw new Error('process_not_reconnectable');
    return this.attach(id, participant, 'observe');
  }

  requestWriteControl(id: string, actorId: string, reason: string) {
    const contract = this.get(id); if (!contract.pty.participants.some(item => item.actorId === actorId)) throw new Error('pty_participant_missing');
    if (contract.pty.writeOwner === actorId) throw new Error('pty_write_control_already_held');
    const action: ContractPendingAction = {id: `action:${randomUUID()}`, kind: 'write-control', requestedBy: actorId, reason: bounded(reason), status: 'PENDING', createdAt: this.clock()};
    contract.pendingActions.push(action); this.record(contract, 'pty.write_requested', actorId, action.id); return action;
  }

  decideWriteControl(id: string, actionId: string, byActorId: string, approve: boolean) {
    const contract = this.get(id), action = contract.pendingActions.find(item => item.id === actionId && item.kind === 'write-control'); if (!action || action.status !== 'PENDING') throw new Error('write_request_missing');
    const owner = contract.pty.writeOwner; if (byActorId !== contract.operatorActorId && byActorId !== owner) throw new Error('write_transfer_not_authorized');
    action.status = approve ? 'APPROVED' : 'DENIED'; action.decidedAt = this.clock(); action.decidedBy = byActorId;
    if (approve) this.transferWrite(contract, action.requestedBy); this.record(contract, approve ? 'pty.write_transferred' : 'pty.write_denied', byActorId, `${action.id}:${action.requestedBy}`); return this.get(id);
  }

  humanTakeover(id: string, humanActorId: string) {
    const contract = this.get(id); if (!humanActorId.startsWith('human:')) throw new Error('human_actor_required');
    if (!contract.pty.participants.some(item => item.actorId === humanActorId)) contract.pty.participants.push({actorId: humanActorId, kind: 'human', access: 'observe', attachedAt: this.clock()});
    this.transferWrite(contract, humanActorId); contract.state = 'PAUSED'; this.record(contract, 'pty.human_takeover', humanActorId, `generation=${contract.pty.ownershipGeneration}`); return this.get(id);
  }

  resumeAgent(id: string, humanActorId: string, agentActorId: string) {
    const contract = this.get(id); if (contract.pty.writeOwner !== humanActorId || !humanActorId.startsWith('human:')) throw new Error('human_takeover_not_active');
    const participant = contract.pty.participants.find(item => item.actorId === agentActorId); if (!participant || participant.kind !== 'agent') throw new Error('agent_participant_missing');
    this.transferWrite(contract, agentActorId); contract.state = 'ACTIVE'; this.record(contract, 'pty.agent_resumed', humanActorId, `${agentActorId};generation=${contract.pty.ownershipGeneration}`); return this.get(id);
  }

  appendOutput(id: string, input: {source: ContractTranscript['source']; text: string; expectedSequence?: number}) {
    const contract = this.get(id); if (input.expectedSequence !== undefined && input.expectedSequence !== contract.pty.nextSequence) throw new Error('terminal_output_out_of_order');
    const entry: ContractTranscript = {sequence: contract.pty.nextSequence++, at: this.clock(), source: input.source, text: bounded(input.text, 16_384)}; contract.pty.transcript.push(entry); contract.pty.transcript = contract.pty.transcript.slice(-500); this.record(contract, 'pty.output', input.source, `sequence=${entry.sequence}`); return entry;
  }

  completeExecution(id: string, outcome: 'EXECUTED' | 'FAILED' | 'CANCELLED' | 'UNKNOWN', cleanup?: ContractCleanupResult, expected?: {processId: string; batonGeneration: number; ownershipGeneration: number}) {
    const contract = this.get(id);
    if (expected && (expected.processId !== contract.process.id || expected.batonGeneration !== contract.baton.generation || expected.ownershipGeneration !== contract.pty.ownershipGeneration)) {
      if (contract.pty.writeOwner?.startsWith('human:') && expected.processId === contract.process.id && expected.batonGeneration === contract.baton.generation) { contract.state='PAUSED'; contract.process.state=cleanup?.outcome==='confirmed' && outcome!=='UNKNOWN'?'EXITED':'UNKNOWN'; contract.process.observedAt=this.clock(); if(cleanup)contract.process.cleanup={...cleanup}; this.record(contract,'execution.agent_stopped_human_retained','agent-control',JSON.stringify({expected,outcome,cleanup})); return this.get(id); }
      this.record(contract, 'execution.stale_completion_ignored', 'agent-control', JSON.stringify({expected, outcome, cleanup})); return this.get(id);
    }
    if (!expected && outcome !== 'UNKNOWN') outcome = 'UNKNOWN';
    const cleanupProof = cleanup ?? contract.process.cleanup;
    if (cleanupProof?.outcome !== 'confirmed' || contract.process.state === 'UNKNOWN' && cleanup?.outcome !== 'confirmed') outcome = 'UNKNOWN';
    if (contract.pty.writeOwner?.startsWith('human:')) {
      contract.state = 'PAUSED'; contract.process.state = outcome === 'UNKNOWN' ? 'UNKNOWN' : 'EXITED';
      contract.process.observedAt = this.clock(); if (cleanup) contract.process.cleanup = {...cleanup};
      this.record(contract, 'execution.agent_stopped_human_retained', 'agent-control', outcome); return this.get(id);
    }
    contract.state = outcome === 'EXECUTED' ? 'VERIFYING' : outcome === 'UNKNOWN' ? 'ORPHANED' : outcome;
    contract.process.state = outcome === 'UNKNOWN' ? 'UNKNOWN' : 'EXITED';
    contract.process.observedAt = this.clock(); if (cleanup) contract.process.cleanup = {...cleanup};
    contract.pty.state = outcome === 'UNKNOWN' ? 'LOST' : 'CLOSED';
    delete contract.pty.writeOwner; contract.pty.ownershipGeneration++;
    contract.pty.participants = contract.pty.participants.map(item => ({...item, access: 'observe'}));
    if (outcome === 'EXECUTED') contract.verification = {...contract.verification, state: 'PENDING', submittedAt: this.clock()};
    this.record(contract, 'execution.completed', 'agent-control', outcome); return this.get(id);
  }

  observeProcess(id: string, observation: {state: ProcessState; pid?: number; exitCode?: number; signal?: string}) {
    const contract = this.get(id); Object.assign(contract.process, observation, {observedAt: this.clock()}); if (observation.state === 'EXITED') contract.pty.state = 'CLOSED'; this.record(contract, 'process.observed', 'agent-control', observation.state); return this.get(id);
  }

  markOrphaned(id: string, staleAfterMs: number) {
    const contract = this.get(id); if (contract.process.state !== 'RUNNING' || Date.parse(this.clock()) - Date.parse(contract.process.observedAt) < staleAfterMs) return contract;
    contract.process.state = 'ORPHANED'; contract.state = 'ORPHANED'; contract.pty.state = 'LOST'; delete contract.pty.writeOwner; contract.pty.ownershipGeneration++; this.record(contract, 'process.orphaned', 'agent-control', `staleAfterMs=${staleAfterMs}`); return this.get(id);
  }

  async cancel(id: string, actorId: string, reason: string) {
    const contract = this.get(id); if (['CANCELLED','TIMED_OUT','VERIFIED','FAILED'].includes(contract.state)) return contract;
    contract.state = 'CANCELLING'; contract.process.state = 'CANCEL_PENDING'; const action: ContractPendingAction = {id: `action:${randomUUID()}`, kind: 'cancel', requestedBy: actorId, reason: bounded(reason), status: 'PENDING', createdAt: this.clock()}; contract.pendingActions.push(action); this.record(contract, 'contract.cancel_requested', actorId, action.id);
    const cleanup = normalizeCleanup(await this.processes.cancel(contract.process.id, reason), this.clock()); const current = this.get(id), pending = current.pendingActions.find(item => item.id === action.id)!; current.process.cleanup = cleanup; current.process.observedAt = cleanup.verifiedAt!;
    if (cleanup.outcome !== 'confirmed') { current.process.state = 'UNKNOWN'; current.pty.state = 'LOST'; delete current.pty.writeOwner; current.pty.ownershipGeneration++; this.record(current, 'contract.cleanup_uncertain', 'agent-control', `outcome=${cleanup.outcome};${cleanup.detail ?? 'no-detail'}`); return this.get(id); }
    pending.status = 'COMPLETED'; pending.decidedAt = this.clock(); pending.decidedBy = 'agent-control'; current.state = 'CANCELLED'; current.process.state = 'EXITED'; current.pty.state = 'CLOSED'; delete current.pty.writeOwner; current.pty.ownershipGeneration++; this.record(current, 'contract.cancelled', 'agent-control', reason); return this.get(id);
  }

  async enforceTimeout(id: string) { const contract = this.get(id), deadline = contract.budget.deadlineAt; if (!deadline || Date.parse(this.clock()) < Date.parse(deadline) || ['CANCELLED','TIMED_OUT','VERIFIED','FAILED'].includes(contract.state)) return contract; const cleanup = normalizeCleanup(await this.processes.cancel(contract.process.id, 'contract_timeout'), this.clock()); const current = this.get(id); current.process.cleanup = cleanup; current.process.observedAt = cleanup.verifiedAt!; if (cleanup.outcome !== 'confirmed') { current.state = 'ORPHANED'; current.process.state = 'UNKNOWN'; current.pty.state = 'LOST'; delete current.pty.writeOwner; current.pty.ownershipGeneration++; this.record(current, 'contract.timeout_cleanup_uncertain', 'agent-control', `deadline=${deadline};outcome=${cleanup.outcome}`); return this.get(id); } current.state = 'TIMED_OUT'; current.process.state = 'EXITED'; current.pty.state = 'CLOSED'; delete current.pty.writeOwner; current.pty.ownershipGeneration++; this.record(current, 'contract.timed_out', 'agent-control', deadline); return this.get(id); }

  submitForVerification(id: string, actorId: string, evidence: ContractEvidence[]) { const contract = this.get(id); if (contract.pty.writeOwner?.startsWith('human:') || !['ACTIVE','VERIFYING'].includes(contract.state)) throw new Error('verification_authority_revoked'); if (contract.active.actorId !== actorId) throw new Error('contract_worker_mismatch'); contract.evidence.push(...evidence.map(item => structuredClone(item))); contract.verification = {state: 'PENDING', submittedAt: this.clock(), evidenceIds: unique(evidence.map(item => item.id)), reasons: []}; contract.state = 'VERIFYING'; this.record(contract, 'verification.submitted', actorId, `${evidence.length} evidence records`); return this.get(id); }
  verify(id: string, verifierActorId: string, passed: boolean, reasons: string[] = []) { const contract = this.get(id); if (contract.verification.state !== 'PENDING') throw new Error('verification_not_pending'); if (contract.pty.writeOwner?.startsWith('human:') || contract.state !== 'VERIFYING') throw new Error('verification_authority_revoked'); if (verifierActorId === contract.active.actorId) throw new Error('verification_not_independent'); contract.verification.state = passed ? 'PASSED' : 'FAILED'; contract.verification.verifierActorId = verifierActorId; contract.verification.reasons = reasons.map(value => bounded(value)); contract.state = passed ? 'VERIFIED' : 'FAILED'; this.record(contract, passed ? 'verification.passed' : 'verification.failed', verifierActorId, reasons.join('; ') || 'independent verification'); return this.get(id); }

  linkHandoff(id: string, handoffId: string, actorId: string) { const contract = this.get(id); if (!contract.handoffs.includes(handoffId)) contract.handoffs.push(handoffId); this.record(contract, 'handoff.linked', actorId, handoffId); return this.get(id); }

  async sacrificeWorker(id: string, actorId: string, reason: string) {
    const contract = this.get(id), cleanup = normalizeCleanup(await this.processes.cancel(contract.process.id, `sacrifice:${reason}`), this.clock()); contract.process.cleanup = cleanup; if (cleanup.outcome !== 'confirmed') { contract.state = 'ORPHANED'; contract.process.state = 'UNKNOWN'; contract.pty.state = 'LOST'; this.record(contract, 'worker.sacrifice_cleanup_uncertain', actorId, `outcome=${cleanup.outcome}`); throw new Error('process_cleanup_unconfirmed'); } contract.state = 'PAUSED'; contract.process.state = 'EXITED'; contract.pty.state = 'CLOSED'; delete contract.pty.writeOwner; contract.pty.ownershipGeneration++; this.record(contract, 'worker.sacrificed', actorId, reason); return this.get(id);
  }

  async yieldWorker(id: string, actorId: string, reason: string) {
    const contract = this.get(id); if (this.processes.pause) await this.processes.pause(contract.process.id, reason); contract.state = 'PAUSED'; contract.process.state = 'PAUSED'; contract.pty.state = 'DETACHED'; delete contract.pty.writeOwner; contract.pty.ownershipGeneration++; this.record(contract, 'worker.yielded', actorId, reason); return this.get(id);
  }

  async substituteWorker(id: string, byActorId: string, input: {active: ContractExecution['active']; baton: Record<string, unknown>; process: {id: string; pid?: number}; ptyId: string; reason: string}) {
    const contract = this.get(id); if (byActorId !== contract.operatorActorId && byActorId !== contract.active.actorId) throw new Error('substitution_not_authorized'); rejectSecrets(input); const cleanup = normalizeCleanup(await this.processes.cancel(contract.process.id, `substitute:${input.reason}`), this.clock()); contract.process.cleanup = cleanup; if (cleanup.outcome !== 'confirmed') { contract.state = 'ORPHANED'; contract.process.state = 'UNKNOWN'; contract.pty.state = 'LOST'; this.record(contract, 'worker.substitution_cleanup_uncertain', byActorId, `outcome=${cleanup.outcome}`); throw new Error('process_cleanup_unconfirmed'); }
    const at = this.clock(); contract.active = structuredClone(input.active); contract.baton = sealBaton(contract.baton.generation + 1, input.baton, byActorId, at); contract.process = {id: input.process.id, pid: input.process.pid, state: 'RUNNING', startedAt: at, observedAt: at}; contract.pty = {id: input.ptyId, state: 'DETACHED', ownershipGeneration: contract.pty.ownershipGeneration + 1, participants: [], transcript: [], nextSequence: 1}; contract.state = 'ACTIVE'; contract.verification = {state: 'UNSUBMITTED', evidenceIds: [], reasons: []}; this.record(contract, 'worker.substituted', byActorId, input.reason); return this.get(id);
  }

  allocateChildBudget(id: string, tokens: number | undefined, cost: number | undefined) {
    const contract = this.get(id); if (tokens !== undefined) { if (!Number.isFinite(tokens) || tokens < 0 || contract.budget.remainingTokens === undefined || tokens > contract.budget.remainingTokens) throw new Error('child_token_budget_invalid'); contract.budget.remainingTokens -= tokens; }
    if (cost !== undefined) { if (!Number.isFinite(cost) || cost < 0 || contract.budget.remainingCost === undefined || cost > contract.budget.remainingCost) throw new Error('child_cost_budget_invalid'); contract.budget.remainingCost -= cost; }
    this.record(contract, 'budget.child_allocated', contract.operatorActorId, `tokens=${tokens ?? 'unknown'};cost=${cost ?? 'unknown'}`); return this.get(id);
  }

  private transferWrite(contract: ContractExecution, actorId: string) { contract.pty.participants = contract.pty.participants.map(item => ({...item, access: item.actorId === actorId ? 'write' : 'observe'})); contract.pty.writeOwner = actorId; contract.pty.ownershipGeneration++; contract.pty.state = 'ATTACHED'; }
  private record(contract: ContractExecution, event: string, actorId: string, detail: string) { const at = this.clock(); contract.updatedAt = at; contract.history.push({at, event, actorId, detail: bounded(detail)}); this.contracts.set(contract.id, structuredClone(contract)); this.save(); for (const listener of this.listeners) listener(structuredClone(contract)); }
  private load() { if (!this.file || !fs.existsSync(this.file)) return; const snapshot = JSON.parse(fs.readFileSync(this.file, 'utf8')) as ContractSnapshot; if (snapshot.schema !== 'agent-control.contract-executions/v1') throw new Error('contract_snapshot_unsupported'); for (const contract of snapshot.contracts) this.contracts.set(contract.id, contract); }
  private save() { if (!this.file) return; fs.mkdirSync(path.dirname(this.file), {recursive: true}); const temporary = `${this.file}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify({schema: 'agent-control.contract-executions/v1', contracts: this.list()} satisfies ContractSnapshot, null, 2)}\n`, {mode: 0o600}); fs.renameSync(temporary, this.file); }
}

function sealBaton(generation: number, payload: Record<string, unknown>, createdBy: string, createdAt: string): ContractBaton { rejectSecrets(payload); const canonical = stable(payload); return {generation, payload: structuredClone(payload), sha256: createHash('sha256').update(canonical).digest('hex'), sizeBytes: Buffer.byteLength(canonical), createdAt, createdBy}; }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`; return JSON.stringify(value); }
function unique(values: string[]) { return [...new Set(values)]; }
function bounded(value: string, maximum = 2048) { if (typeof value !== 'string' || !value.trim()) throw new Error('text_required'); return value.length <= maximum ? value : value.slice(0, maximum); }
function rejectSecrets(value: unknown) { const serialized = JSON.stringify(value); if (/(?:sk-[A-Za-z0-9_-]{12,}|bearer\s+[A-Za-z0-9._-]{12,}|api[_-]?key["']?\s*[:=]|password["']?\s*[:=]|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i.test(serialized)) throw new Error('contract_secret_material_forbidden'); }
function normalizeCleanup(value: ContractCleanupResult | void, at: string): ContractCleanupResult { return value ? {...value, verifiedAt: value.verifiedAt ?? at} : {outcome: 'uncertain', detail: 'process_port_returned_no_cleanup_evidence', verifiedAt: at}; }

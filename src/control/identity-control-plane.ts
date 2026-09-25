import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type ActorType = 'human' | 'control-plane' | 'automation' | 'agent' | 'service';
export type SessionMode = 'observer' | 'collaborative' | 'operator-controlled' | 'restricted';
export type ContextPolicy = 'full' | 'compiled' | 'summary-only' | 'evidence-only' | 'structured-baton' | 'hybrid';
export type Capability = string;

export interface ActorIdentity {
  id: string;
  type: ActorType;
  displayName: string;
  principalId: string;
  authenticationSource: string;
  roles: string[];
  capabilities: Capability[];
  createdAt: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface AgentIdentity {
  id: string;
  actorId: string;
  displayName: string;
  purpose: string;
  capabilities: Capability[];
  createdAt: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface SessionParticipant {
  actorId: string;
  joinedAt: string;
  joinedBy: string;
  capabilities: Capability[];
}

export interface SessionPermissions {
  capabilities: Capability[];
  allowedModels: string[];
  allowedNodes: string[];
  allowedSecrets: string[];
  filesystem: 'none' | 'read' | 'write';
  network: 'none' | 'provider-only' | 'unrestricted';
  production: boolean;
}

export interface GovernedSession {
  id: string;
  creatorActorId: string;
  createdAt: string;
  participants: SessionParticipant[];
  mode: SessionMode;
  permissions: SessionPermissions;
  contextPolicy: ContextPolicy;
  visibility: 'private' | 'participants' | 'operator';
  status: 'ACTIVE' | 'CLOSED';
  metadata: Record<string, string | number | boolean | null>;
}

export interface ContextDescriptor {
  id: string;
  sha256: string;
  estimatedTokens: number;
  classification: 'public' | 'internal' | 'restricted';
}

export interface ContextTransferRecord {
  id: string;
  sessionId: string;
  delegationId?: string;
  sourceActorId: string;
  targetActorId: string;
  sourceContextHash: string;
  transferredContextHash: string;
  selected: ContextDescriptor[];
  discarded: Array<ContextDescriptor & {reason: string}>;
  contextBudget: number;
  selectionReason: string;
  compressionSteps: string[];
  receivingAgentId?: string;
  receivingModelId?: string;
  createdAt: string;
}

export interface DelegationRecord {
  id: string;
  sessionId: string;
  parentDelegationId?: string;
  parentRunId?: string;
  sourceActorId: string;
  targetActorId: string;
  sourceAgentId?: string;
  targetAgentId: string;
  requestedModel?: string;
  actualModel?: string;
  contextTransferId: string;
  permissionsGranted: Capability[];
  reason: string;
  createdAt: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  runId?: string;
  resultEvidenceIds: string[];
}

export interface RuntimeIdentity {
  id: string;
  nodeId: string;
  transport: string;
  executionEnvironment: string;
  sandboxState: 'enforced' | 'unavailable' | 'not-required';
  networkPolicy: string;
  filesystemPolicy: string;
  version?: string;
  sha256?: string;
}

export interface ModelExecutionIdentity {
  modelId: string;
  providerId: string;
  providerModel: string;
  qualificationVersion?: string;
  historicalAliases?: string[];
}

export interface WorkAttribution {
  schema: 'agent-control.work-attribution/v1';
  actorId: string;
  sessionId: string;
  parcelId?: string;
  delegationId?: string;
  agentId?: string;
  authority: Capability[];
  createdAt: string;
  legacy: boolean;
}

export interface ExecutionProvenance {
  id: string;
  runId: string;
  parentRunId?: string;
  parcelId?: string;
  delegationId?: string;
  actorId: string;
  sessionId: string;
  agentId: string;
  model?: ModelExecutionIdentity;
  runtime: RuntimeIdentity;
  authority: Capability[];
  contextTransferId?: string;
  tools: string[];
  resources: string[];
  policyEvents: Array<{at: string; decision: 'allowed' | 'denied' | 'fallback' | 'escalated'; reason: string}>;
  startedAt: string;
  completedAt?: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cost: number | null;
  currency: string | null;
  verifiedOutcome: boolean;
  evidenceIds: string[];
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
}

export interface SecretUseReceipt {
  id: string;
  secretRef: string;
  actorId: string;
  sessionId: string;
  capability: string;
  purpose: string;
  usedAt: string;
  outcome: 'SUCCEEDED' | 'FAILED';
}

interface IdentitySnapshot {
  schema: 'agent-control.identity/v1';
  actors: ActorIdentity[];
  agents: AgentIdentity[];
  sessions: GovernedSession[];
  contextTransfers: ContextTransferRecord[];
  delegations: DelegationRecord[];
  executions: ExecutionProvenance[];
  secretUses: SecretUseReceipt[];
}

export interface ExecutionRequirements {
  sandboxRequired?: boolean;
  localOnly?: boolean;
  governedRunnerRequired?: boolean;
  requiredNodeId?: string;
  requiredModelId?: string;
  allowFallback?: boolean;
  fallbackModelIds?: string[];
  fallbackNodeIds?: string[];
}

export interface ExecutionCandidate {
  id: string;
  modelId: string;
  locality: 'local' | 'remote';
  nodeId: string;
  nodeAvailable: boolean;
  runner: 'governed' | 'shell';
  sandbox: 'enforced' | 'unavailable';
}

export interface ExecutionSelection {candidate: ExecutionCandidate; fallback: boolean; fallbackReason: string | null;}

const ROLE_CAPABILITIES: Readonly<Record<string, readonly Capability[]>> = Object.freeze({
  observer: ['session.observe'],
  operator: ['session.observe', 'session.create', 'session.manage', 'parcel.create', 'parcel.execute', 'parcel.approve', 'agent.delegate', 'model.invoke', 'node.execute'],
  reviewer: ['session.observe', 'parcel.create', 'parcel.execute', 'model.invoke', 'filesystem.read'],
  agent: ['session.observe', 'parcel.execute', 'agent.delegate', 'model.invoke'],
  automation: ['session.observe', 'parcel.create', 'parcel.execute', 'model.invoke'],
  administrator: ['*'],
});
const ID = /^[a-z0-9][a-z0-9._:-]{1,127}$/i;
const SECRET_LIKE = /(?:\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/i;
const SECRET_KEY = /^(?:password|passwordValue|secret|secretValue|token|tokenValue|credential|credentialValue|api[-_]?key|api[-_]?keyValue|authorization|cookie)$/i;
const now = () => new Date().toISOString();

export class IdentityControlPlane {
  private readonly actors = new Map<string, ActorIdentity>();
  private readonly agents = new Map<string, AgentIdentity>();
  private readonly sessions = new Map<string, GovernedSession>();
  private readonly contextTransfers = new Map<string, ContextTransferRecord>();
  private readonly delegations = new Map<string, DelegationRecord>();
  private readonly executions = new Map<string, ExecutionProvenance>();
  private readonly secretUses = new Map<string, SecretUseReceipt>();

  constructor(readonly file?: string, private readonly clock: () => string = now) {
    if (!file || !fs.existsSync(file)) return;
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as IdentitySnapshot;
    if (value.schema !== 'agent-control.identity/v1') throw new Error('identity_snapshot_unsupported');
    for (const actor of value.actors) this.actors.set(actor.id, actor);
    for (const agent of value.agents) this.agents.set(agent.id, agent);
    for (const session of value.sessions) this.sessions.set(session.id, session);
    for (const transfer of value.contextTransfers) this.contextTransfers.set(transfer.id, transfer);
    for (const delegation of value.delegations) this.delegations.set(delegation.id, delegation);
    for (const execution of value.executions) this.executions.set(execution.runId, execution);
    for (const receipt of value.secretUses) this.secretUses.set(receipt.id, receipt);
  }

  registerActor(input: Omit<ActorIdentity, 'createdAt'> & {createdAt?: string}) {
    validateId(input.id, 'actor_id');
    validateText(input.displayName, 'actor_display_name');
    validateText(input.principalId, 'actor_principal_id');
    validateText(input.authenticationSource, 'actor_authentication_source');
    rejectProtectedValue(input.metadata);
    const current = this.actors.get(input.id);
    if (current && (current.principalId !== input.principalId || current.type !== input.type || current.authenticationSource !== input.authenticationSource)) throw new Error('actor_identity_immutable');
    const actor: ActorIdentity = {
      ...structuredClone(input),
      roles: unique(input.roles.map(role => validateId(role, 'actor_role'))),
      capabilities: unique(input.capabilities.map(capability => validateCapability(capability))),
      createdAt: current?.createdAt ?? input.createdAt ?? this.clock(),
    };
    this.actors.set(actor.id, actor); this.save(); return structuredClone(actor);
  }

  registerAgent(input: Omit<AgentIdentity, 'createdAt'> & {createdAt?: string}) {
    validateId(input.id, 'agent_id'); this.actor(input.actorId); validateText(input.displayName, 'agent_display_name'); validateText(input.purpose, 'agent_purpose'); rejectProtectedValue(input.metadata);
    const current = this.agents.get(input.id);
    if (current && current.actorId !== input.actorId) throw new Error('agent_actor_immutable');
    const agent: AgentIdentity = {...structuredClone(input), capabilities: unique(input.capabilities.map(validateCapability)), createdAt: current?.createdAt ?? input.createdAt ?? this.clock()};
    this.agents.set(agent.id, agent); this.save(); return structuredClone(agent);
  }

  actor(id: string) { const value = this.actors.get(id); if (!value) throw new Error('actor_missing'); return structuredClone(value); }
  agent(id: string) { const value = this.agents.get(id); if (!value) throw new Error('agent_missing'); return structuredClone(value); }
  effectiveCapabilities(actorId: string) { const actor = this.actor(actorId); return unique([...actor.capabilities, ...actor.roles.flatMap(role => ROLE_CAPABILITIES[role] ?? [])]); }

  createSession(input: {id?: string; creatorActorId: string; mode: SessionMode; permissions: Partial<SessionPermissions> & Pick<SessionPermissions, 'capabilities'>; contextPolicy: ContextPolicy; visibility?: GovernedSession['visibility']; metadata?: GovernedSession['metadata']}) {
    const creator = this.actor(input.creatorActorId), capabilities = unique(input.permissions.capabilities.map(validateCapability));
    requireSubset(capabilities, this.effectiveCapabilities(creator.id), 'session_authority_exceeds_creator');
    rejectProtectedValue(input.metadata ?? {});
    const id = input.id ?? `session:${randomUUID()}`; validateId(id, 'session_id'); if (this.sessions.has(id)) throw new Error('session_exists');
    const at = this.clock(), permissions: SessionPermissions = {capabilities, allowedModels: unique(input.permissions.allowedModels ?? []), allowedNodes: unique(input.permissions.allowedNodes ?? []), allowedSecrets: unique(input.permissions.allowedSecrets ?? []), filesystem: input.permissions.filesystem ?? 'none', network: input.permissions.network ?? 'none', production: Boolean(input.permissions.production)};
    const session: GovernedSession = {id, creatorActorId: creator.id, createdAt: at, participants: [{actorId: creator.id, joinedAt: at, joinedBy: creator.id, capabilities}], mode: input.mode, permissions, contextPolicy: input.contextPolicy, visibility: input.visibility ?? 'participants', status: 'ACTIVE', metadata: structuredClone(input.metadata ?? {})};
    this.sessions.set(id, session); this.save(); return structuredClone(session);
  }

  session(id: string) { const value = this.sessions.get(id); if (!value) throw new Error('session_missing'); return structuredClone(value); }
  listSessions() { return [...this.sessions.values()].map(value => structuredClone(value)); }
  listContextTransfers(sessionId?: string) { return [...this.contextTransfers.values()].filter(value => !sessionId || value.sessionId === sessionId).map(value => structuredClone(value)); }
  listDelegations(sessionId?: string) { return [...this.delegations.values()].filter(value => !sessionId || value.sessionId === sessionId).map(value => structuredClone(value)); }
  addParticipant(sessionId: string, input: {actorId: string; capabilities: Capability[]}, byActorId: string) {
    const session = this.session(sessionId); this.actor(input.actorId); this.authorize(sessionId, byActorId, 'session.manage');
    if (session.participants.some(value => value.actorId === input.actorId)) throw new Error('session_participant_exists');
    const capabilities = unique(input.capabilities.map(validateCapability)); requireSubset(capabilities, session.permissions.capabilities, 'participant_authority_exceeds_session'); requireSubset(capabilities, this.effectiveCapabilities(input.actorId), 'participant_authority_exceeds_actor');
    session.participants.push({actorId: input.actorId, joinedAt: this.clock(), joinedBy: byActorId, capabilities}); this.sessions.set(sessionId, session); this.save(); return this.session(sessionId);
  }
  updateSession(sessionId: string, patch: Partial<Pick<GovernedSession, 'mode' | 'contextPolicy' | 'visibility' | 'status' | 'metadata'>>, byActorId: string) {
    const session = this.session(sessionId); this.authorize(sessionId, byActorId, 'session.manage'); rejectProtectedValue(patch.metadata ?? {});
    const creator = session.creatorActorId; Object.assign(session, structuredClone(patch)); session.creatorActorId = creator; this.sessions.set(sessionId, session); this.save(); return this.session(sessionId);
  }
  authorize(sessionId: string, actorId: string, capability: Capability) {
    const session = this.session(sessionId); if (session.status !== 'ACTIVE') throw new Error('session_closed'); const participant = session.participants.find(value => value.actorId === actorId); if (!participant) throw new Error('session_participant_denied');
    if (session.mode === 'observer' && capability !== 'session.observe') throw new Error('session_mode_denied');
    if (session.mode === 'operator-controlled' && actorId !== session.creatorActorId && capability !== 'session.observe') throw new Error('session_operator_controlled');
    if (!hasCapability(participant.capabilities, capability) || !hasCapability(session.permissions.capabilities, capability)) throw new Error(`session_capability_denied:${capability}`);
    return true;
  }

  recordContextTransfer(input: {id?: string; sessionId: string; delegationId?: string; sourceActorId: string; targetActorId: string; selected: Array<{id: string; content: string; estimatedTokens: number; classification?: ContextDescriptor['classification']}>; discarded?: Array<{id: string; content: string; estimatedTokens: number; classification?: ContextDescriptor['classification']; reason: string}>; contextBudget: number; selectionReason: string; compressionSteps?: string[]; receivingAgentId?: string; receivingModelId?: string}) {
    const session = this.session(input.sessionId); this.actor(input.sourceActorId); this.actor(input.targetActorId); if (input.receivingAgentId) this.agent(input.receivingAgentId); if (input.receivingModelId) requireAllowed(input.receivingModelId, session.permissions.allowedModels, 'session_model_denied');
    if (!Number.isSafeInteger(input.contextBudget) || input.contextBudget < 0) throw new Error('context_budget_invalid'); validateText(input.selectionReason, 'context_selection_reason');
    const descriptor = (item: {id: string; content: string; estimatedTokens: number; classification?: ContextDescriptor['classification']}) => { validateId(item.id, 'context_id'); if (!Number.isSafeInteger(item.estimatedTokens) || item.estimatedTokens < 0) throw new Error('context_token_estimate_invalid'); rejectProtectedValue(item.content); return {id: item.id, sha256: sha256(item.content), estimatedTokens: item.estimatedTokens, classification: item.classification ?? 'internal'}; };
    const selected = input.selected.map(descriptor), discarded = (input.discarded ?? []).map(item => ({...descriptor(item), reason: validateText(item.reason, 'context_discard_reason')}));
    if (selected.reduce((sum, item) => sum + item.estimatedTokens, 0) > input.contextBudget) throw new Error('context_transfer_budget_exceeded');
    const sourceContextHash = sha256(stableJson([...selected, ...discarded].map(item => ({id: item.id, sha256: item.sha256}))));
    const transferredContextHash = sha256(stableJson(selected.map(item => ({id: item.id, sha256: item.sha256}))));
    const value: ContextTransferRecord = {id: input.id ?? `context-transfer:${randomUUID()}`, sessionId: input.sessionId, delegationId: input.delegationId, sourceActorId: input.sourceActorId, targetActorId: input.targetActorId, sourceContextHash, transferredContextHash, selected, discarded, contextBudget: input.contextBudget, selectionReason: input.selectionReason, compressionSteps: [...(input.compressionSteps ?? [])], receivingAgentId: input.receivingAgentId, receivingModelId: input.receivingModelId, createdAt: this.clock()};
    validateId(value.id, 'context_transfer_id'); this.contextTransfers.set(value.id, value); this.save(); return structuredClone(value);
  }

  createDelegation(input: Omit<DelegationRecord, 'id' | 'createdAt' | 'status' | 'resultEvidenceIds'> & {id?: string; status?: DelegationRecord['status']; resultEvidenceIds?: string[]}) {
    const session = this.session(input.sessionId); this.authorize(session.id, input.sourceActorId, 'agent.delegate'); this.actor(input.targetActorId); const target = this.agent(input.targetAgentId); if (target.actorId !== input.targetActorId) throw new Error('delegation_target_identity_mismatch');
    if (!session.participants.some(value => value.actorId === input.targetActorId)) throw new Error('delegation_target_not_participant');
    if (input.sourceAgentId && this.agent(input.sourceAgentId).actorId !== input.sourceActorId) throw new Error('delegation_source_identity_mismatch');
    const transfer = this.contextTransfers.get(input.contextTransferId); if (!transfer || transfer.sessionId !== session.id || transfer.sourceActorId !== input.sourceActorId || transfer.targetActorId !== input.targetActorId) throw new Error('delegation_context_mismatch');
    if (input.requestedModel) requireAllowed(input.requestedModel, session.permissions.allowedModels, 'session_model_denied');
    const parentAuthority = input.parentDelegationId ? this.delegation(input.parentDelegationId).permissionsGranted : session.participants.find(value => value.actorId === input.sourceActorId)!.capabilities;
    const permissionsGranted = unique(input.permissionsGranted.map(validateCapability)); requireSubset(permissionsGranted, parentAuthority, 'delegation_authority_escalation'); requireSubset(permissionsGranted, session.permissions.capabilities, 'delegation_authority_exceeds_session');
    const value: DelegationRecord = {...structuredClone(input), id: input.id ?? `delegation:${randomUUID()}`, permissionsGranted, createdAt: this.clock(), status: input.status ?? 'QUEUED', resultEvidenceIds: unique(input.resultEvidenceIds ?? [])}; validateId(value.id, 'delegation_id'); this.delegations.set(value.id, value); this.save(); return structuredClone(value);
  }
  delegation(id: string) { const value = this.delegations.get(id); if (!value) throw new Error('delegation_missing'); return structuredClone(value); }
  updateDelegation(id: string, patch: Partial<Pick<DelegationRecord, 'actualModel' | 'status' | 'runId' | 'resultEvidenceIds'>>) { const value = this.delegation(id); if (patch.actualModel) requireAllowed(patch.actualModel, this.session(value.sessionId).permissions.allowedModels, 'session_model_denied'); Object.assign(value, structuredClone(patch)); this.delegations.set(id, value); this.save(); return this.delegation(id); }

  recordExecution(input: ExecutionProvenance) {
    const session = this.session(input.sessionId); this.actor(input.actorId); this.agent(input.agentId); const participant = session.participants.find(value => value.actorId === input.actorId); if (!participant) throw new Error('execution_actor_not_participant');
    requireSubset(input.authority, participant.capabilities, 'execution_authority_exceeds_participant'); requireSubset(input.authority, session.permissions.capabilities, 'execution_authority_exceeds_session');
    if (input.model) requireAllowed(input.model.modelId, session.permissions.allowedModels, 'session_model_denied'); requireAllowed(input.runtime.nodeId, session.permissions.allowedNodes, 'session_node_denied'); requireRuntimePolicy(session.permissions, input.runtime);
    if (input.delegationId) { const delegation = this.delegation(input.delegationId); if (delegation.sessionId !== input.sessionId || delegation.targetActorId !== input.actorId || delegation.targetAgentId !== input.agentId) throw new Error('execution_delegation_identity_mismatch'); requireSubset(input.authority, delegation.permissionsGranted, 'execution_authority_exceeds_delegation'); }
    rejectProtectedValue(input);
    const current = this.executions.get(input.runId); if (current && stableJson(immutableExecutionIdentity(current)) !== stableJson(immutableExecutionIdentity(input))) throw new Error('execution_identity_immutable');
    this.executions.set(input.runId, structuredClone(input)); this.save(); return structuredClone(input);
  }
  execution(runId: string) { const value = this.executions.get(runId); if (!value) throw new Error('execution_missing'); return structuredClone(value); }
  listExecutions() { return [...this.executions.values()].map(value => structuredClone(value)); }
  reconstruct(runId: string) { const chain: ExecutionProvenance[] = []; let current: ExecutionProvenance | undefined = this.executions.get(runId); const seen = new Set<string>(); while (current) { if (seen.has(current.runId)) throw new Error('execution_lineage_cycle'); seen.add(current.runId); chain.unshift(structuredClone(current)); current = current.parentRunId ? this.executions.get(current.parentRunId) : undefined; } return chain; }
  descendants(runId: string) { const result: ExecutionProvenance[] = [], visit = (parent: string) => { for (const child of this.executions.values()) if (child.parentRunId === parent) { result.push(structuredClone(child)); visit(child.runId); } }; visit(runId); return result; }
  async cancelTree(runId: string, cancel: (runId: string) => Promise<void> | void) { const ids = [...this.descendants(runId).map(value => value.runId).reverse(), runId]; for (const id of ids) await cancel(id); for (const id of ids) { const value = this.executions.get(id); if (value && value.status === 'RUNNING') { value.status = 'CANCELLED'; value.completedAt = this.clock(); value.policyEvents.push({at: value.completedAt, decision: 'denied', reason: `cancelled_with_parent:${runId}`}); this.executions.set(id, value); } } this.save(); return ids; }
  aggregate(runId: string) {
    const records = [this.execution(runId), ...this.descendants(runId)], costs = records.map(value => value.cost), currencies = unique(records.map(value => value.currency).filter((value): value is string => Boolean(value)));
    const byAgent: Record<string, number | null> = {}, byModel: Record<string, number | null> = {}, byDelegation: Record<string, number | null> = {};
    const add = (target: Record<string, number | null>, key: string, cost: number | null) => { target[key] = target[key] === undefined ? cost : target[key] === null || cost === null ? null : target[key]! + cost; };
    for (const record of records) { add(byAgent, record.agentId, record.cost); add(byModel, record.model?.modelId ?? 'no-model', record.cost); add(byDelegation, record.delegationId ?? 'root', record.cost); }
    const starts = records.map(value => Date.parse(value.startedAt)), ends = records.map(value => Date.parse(value.completedAt ?? this.clock()));
    return {runId, runs: records.map(value => value.runId), inputTokens: nullableSum(records.map(value => value.inputTokens)), outputTokens: nullableSum(records.map(value => value.outputTokens)), cost: nullableSum(costs), currency: currencies.length === 1 ? currencies[0] : null, byAgent, byModel, byDelegation, wallClockMs: Math.max(...ends) - Math.min(...starts), verifiedOutcome: records.every(value => value.verifiedOutcome), evidenceIds: unique(records.flatMap(value => value.evidenceIds))};
  }

  async withSecret<T>(input: {secretRef: string; actorId: string; sessionId: string; purpose: string}, resolve: (secretRef: string) => string, operation: (secret: string) => Promise<T> | T) {
    const capability = `secret.use:${input.secretRef}`; this.authorize(input.sessionId, input.actorId, capability); const session = this.session(input.sessionId); if (!session.permissions.allowedSecrets.includes(input.secretRef)) throw new Error('secret_not_allowed_in_session'); validateText(input.purpose, 'secret_use_purpose');
    const secret = resolve(input.secretRef); if (!secret) throw new Error('secret_unavailable'); let outcome: SecretUseReceipt['outcome'] = 'FAILED';
    try { const result = await operation(secret); if (stableJson(result).includes(secret)) throw new Error('secret_returned_from_operation'); outcome = 'SUCCEEDED'; return result; }
    finally { const receipt: SecretUseReceipt = {id: `secret-use:${randomUUID()}`, secretRef: input.secretRef, actorId: input.actorId, sessionId: input.sessionId, capability, purpose: input.purpose, usedAt: this.clock(), outcome}; this.secretUses.set(receipt.id, receipt); this.save(); }
  }

  snapshot(): IdentitySnapshot { return {schema: 'agent-control.identity/v1', actors: [...this.actors.values()].map(value => structuredClone(value)), agents: [...this.agents.values()].map(value => structuredClone(value)), sessions: this.listSessions(), contextTransfers: [...this.contextTransfers.values()].map(value => structuredClone(value)), delegations: [...this.delegations.values()].map(value => structuredClone(value)), executions: this.listExecutions(), secretUses: [...this.secretUses.values()].map(value => structuredClone(value))}; }
  private save() { if (!this.file) return; fs.mkdirSync(path.dirname(this.file), {recursive: true}); const temporary = `${this.file}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(this.snapshot(), null, 2)}\n`, {mode: 0o600}); fs.renameSync(temporary, this.file); }
}

export function selectExecutionFailClosed(requirements: ExecutionRequirements, candidates: ExecutionCandidate[]): ExecutionSelection {
  const hardEligible = candidates.filter(candidate => candidate.nodeAvailable && (!requirements.sandboxRequired || candidate.sandbox === 'enforced') && (!requirements.localOnly || candidate.locality === 'local') && (!requirements.governedRunnerRequired || candidate.runner === 'governed'));
  const primary = hardEligible.find(candidate => (!requirements.requiredNodeId || candidate.nodeId === requirements.requiredNodeId) && (!requirements.requiredModelId || candidate.modelId === requirements.requiredModelId));
  if (primary) return {candidate: structuredClone(primary), fallback: false, fallbackReason: null};
  if (!requirements.allowFallback) throw new Error(executionFailure(requirements, candidates));
  const fallbackModels = new Set(requirements.fallbackModelIds ?? []), fallbackNodes = new Set(requirements.fallbackNodeIds ?? []);
  const fallback = hardEligible.find(candidate => (fallbackModels.size ? fallbackModels.has(candidate.modelId) : !requirements.requiredModelId || candidate.modelId === requirements.requiredModelId) && (fallbackNodes.size ? fallbackNodes.has(candidate.nodeId) : !requirements.requiredNodeId || candidate.nodeId === requirements.requiredNodeId));
  if (!fallback) throw new Error(executionFailure(requirements, candidates));
  return {candidate: structuredClone(fallback), fallback: true, fallbackReason: `explicit_policy_fallback:${requirements.requiredModelId ?? 'policy-model'}@${requirements.requiredNodeId ?? 'policy-node'}->${fallback.modelId}@${fallback.nodeId}`};
}

export function legacyAttribution(actor: string, runOrParcelId: string, createdAt = now()): WorkAttribution {
  const principal = actor.trim() || 'unknown'; return {schema: 'agent-control.work-attribution/v1', actorId: `legacy-actor:${sha256(principal).slice(0, 20)}`, sessionId: `legacy-session:${sha256(runOrParcelId).slice(0, 20)}`, authority: [], createdAt, legacy: true};
}

export function canonicalModelIdentity(modelId: string, providerId: string, providerModel = modelId): ModelExecutionIdentity {
  const aliases = ['Ox', 'ox-alpha', 'Ox Alpha'].includes(modelId) ? [modelId] : [];
  return {modelId: aliases.length ? 'GLM-5.3-Flash' : modelId, providerId, providerModel, ...(aliases.length ? {historicalAliases: aliases} : {})};
}

function executionFailure(requirements: ExecutionRequirements, candidates: ExecutionCandidate[]) {
  if (requirements.sandboxRequired && !candidates.some(value => value.nodeAvailable && value.sandbox === 'enforced')) return 'sandbox_required_unavailable';
  if (requirements.localOnly && !candidates.some(value => value.nodeAvailable && value.locality === 'local')) return 'local_only_execution_unavailable';
  if (requirements.governedRunnerRequired && !candidates.some(value => value.nodeAvailable && value.runner === 'governed')) return 'governed_runner_unavailable';
  if (requirements.requiredNodeId && !candidates.some(value => value.nodeId === requirements.requiredNodeId && value.nodeAvailable)) return `required_node_unavailable:${requirements.requiredNodeId}`;
  if (requirements.requiredModelId && !candidates.some(value => value.modelId === requirements.requiredModelId && value.nodeAvailable)) return `required_model_unavailable:${requirements.requiredModelId}`;
  return 'execution_policy_unsatisfied';
}
function immutableExecutionIdentity(value: ExecutionProvenance) { return {runId: value.runId, parentRunId: value.parentRunId, parcelId: value.parcelId, delegationId: value.delegationId, actorId: value.actorId, sessionId: value.sessionId, agentId: value.agentId, model: value.model, runtime: value.runtime, authority: value.authority, contextTransferId: value.contextTransferId}; }
function requireSubset(requested: Capability[], parent: Capability[], error: string) { if (requested.some(value => !hasCapability(parent, value))) throw new Error(error); }
function hasCapability(available: Capability[], requested: Capability) { return available.includes('*') || available.includes(requested) || available.some(value => value.endsWith(':*') && requested.startsWith(value.slice(0, -1))); }
function requireAllowed(requested: string, allowed: string[], error: string) { const normalized = requested.toLowerCase(); if (!allowed.includes('*') && !allowed.some(value => value.toLowerCase() === normalized)) throw new Error(`${error}:${requested}`); }
function requireRuntimePolicy(permissions: SessionPermissions, runtime: RuntimeIdentity) {
  const filesystem = runtime.filesystemPolicy.toLowerCase(), network = runtime.networkPolicy.toLowerCase();
  if (permissions.filesystem === 'none' && filesystem !== 'none') throw new Error('session_filesystem_denied');
  if (permissions.filesystem === 'read' && /(?:write|unrestricted|host)/.test(filesystem)) throw new Error('session_filesystem_write_denied');
  if (permissions.network === 'none' && network !== 'none') throw new Error('session_network_denied');
  if (permissions.network === 'provider-only' && !['none', 'provider-only'].includes(network)) throw new Error('session_network_scope_denied');
}
function nullableSum(values: Array<number | null>) { return values.every(value => value !== null) ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null; }
function unique<T>(values: T[]) { return [...new Set(values)]; }
function validateId(value: string, label: string) { if (!ID.test(value)) throw new Error(`${label}_invalid`); return value; }
function validateCapability(value: string) { if (!/^(?:\*|[a-z][a-z0-9._-]*(?::[a-z0-9.*_-]+)?)$/i.test(value)) throw new Error('capability_invalid'); return value; }
function validateText(value: string, label: string) { if (typeof value !== 'string' || !value.trim() || value.length > 16_384 || SECRET_LIKE.test(value)) throw new Error(`${label}_invalid`); return value.trim(); }
function rejectProtectedValue(value: unknown, key = ''): void { if (SECRET_KEY.test(key) && value !== null && value !== undefined) throw new Error('protected_value_forbidden'); if (typeof value === 'string' && SECRET_LIKE.test(value)) throw new Error('protected_value_forbidden'); if (Array.isArray(value)) for (const item of value) rejectProtectedValue(item); else if (value && typeof value === 'object') for (const [name, item] of Object.entries(value)) rejectProtectedValue(item, name); }
function sha256(value: string) { return createHash('sha256').update(value).digest('hex'); }
function stableJson(value: unknown): string { return JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right))) : item); }

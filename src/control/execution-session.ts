import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {ContractExecutionRuntime} from './contract-runtime.js';
import {assertNoSensitiveMaterial, redactSensitiveText, redactSensitiveValue} from './security-redaction.js';

export const EXECUTION_SESSION_SCHEMA = 'agent-control.execution-session/v1' as const;
export type ExecutionSessionMode = 'WATCH' | 'INTERVENE' | 'TAKE_CONTROL';
export type ExecutionSessionState = 'STARTING' | 'RUNNING' | 'PAUSED' | 'EXITED' | 'FAILED' | 'DISCONNECTED' | 'UNKNOWN';
export type ExecutionSessionTerminal = 'pipe' | 'pty' | 'conpty' | 'ssh-channel';
export type ExecutionSessionSignal = 'INTERRUPT' | 'TERMINATE' | 'SUSPEND' | 'CONTINUE';
export type ExecutionSessionCrewRole = 'lane-master' | 'prompt-reviewer' | 'parcel-coordinator' | 'model-scout' | 'resource-guardian' | 'quality-inspector';
export type ExecutionSessionInteractionPolicy = 'WATCH_ONLY' | 'GOVERNED_INTERVENTION';

export interface ExecutionSessionCapabilities {
  observableOutput: boolean;
  interactiveInput: boolean;
  terminal: ExecutionSessionTerminal;
  resize: boolean;
  signals: ExecutionSessionSignal[];
  suspendResume: boolean;
  persistent: boolean;
  reconnectable: boolean;
  remoteTransport: boolean;
  modes: {watch: boolean; intervene: boolean; takeControl: boolean};
  limitations: string[];
}

export interface ExecutionSessionScope {
  runId: string;
  jobId: string;
  jobVersion: string;
  stepId: string;
  actionId: string;
  workerId: string;
  nodeId: string;
  parcelId?: string;
  laneId?: string;
  contractId?: string;
  crewRole?: ExecutionSessionCrewRole;
  providerId?: string;
  accountLabel?: string;
  modelId?: string;
  interactionPolicy?: ExecutionSessionInteractionPolicy;
}

export interface ExecutionSessionAttachment {
  id: string;
  actorId: string;
  mode: ExecutionSessionMode;
  attachedAt: string;
  detachedAt?: string;
}

export interface ExecutionSessionRecord {
  schema: typeof EXECUTION_SESSION_SCHEMA;
  id: string;
  incarnation: string;
  adapterId: string;
  adapterReference?: string;
  scope: ExecutionSessionScope;
  state: ExecutionSessionState;
  command: string;
  cwd: string;
  pid?: number;
  capabilities: ExecutionSessionCapabilities;
  control: {owner: 'agent' | 'human'; actorId: string; generation: number; reconciliationRequired: boolean};
  attachments: ExecutionSessionAttachment[];
  createdAt: string;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  exitCode?: number | null;
  exitSignal?: string | null;
  eventSequence: number;
  outputBytes: number;
  outputTruncated: boolean;
  lastOutputAt?: string;
  lastError?: string;
}

export type ExecutionSessionEventType =
  | 'session.created' | 'session.started' | 'session.reconnected' | 'session.disconnected'
  | 'output' | 'output.truncated' | 'attachment.opened' | 'attachment.closed'
  | 'human.input' | 'terminal.resized' | 'signal.sent' | 'control.taken'
  | 'control.returned' | 'reconciliation.recorded' | 'process.exited' | 'process.failed';

export interface ExecutionSessionEvent {
  schema: 'agent-control.execution-session-event/v1';
  sessionId: string;
  sequence: number;
  at: string;
  type: ExecutionSessionEventType;
  actorId: string;
  detail: string;
  stream?: 'stdout' | 'stderr' | 'terminal';
  text?: string;
}

export interface ExecutionSessionProof {sessionId: string; incarnation: string; state: ExecutionSessionState; pid?: number;}
export interface ExecutionSessionControl {
  prove(): Promise<ExecutionSessionProof>;
  write?(value: string): Promise<void>;
  resize?(columns: number, rows: number): Promise<void>;
  signal?(signal: ExecutionSessionSignal): Promise<void>;
  takeControl?(actorId: string): Promise<void>;
  returnControl?(actorId: string): Promise<void>;
}
export interface ExecutionSessionReconnectAdapter {
  readonly id: string;
  reconnect(record: ExecutionSessionRecord, output: (stream: 'stdout' | 'stderr' | 'terminal', value: string) => void): Promise<ExecutionSessionControl | undefined>;
}
export interface ExecutionSessionAuthority {actorId: string; roles: Array<'observer' | 'operator'>;}

interface SessionSnapshot {schema: 'agent-control.execution-sessions/v1'; sessions: ExecutionSessionRecord[];}
interface RuntimeSession {control?: ExecutionSessionControl; credentials: Set<string>; carry: Partial<Record<'stdout' | 'stderr' | 'terminal', string>>; flushTimers: Partial<Record<'stdout' | 'stderr' | 'terminal', NodeJS.Timeout>>; retirementTimer?:NodeJS.Timeout;}

const ACTIVE = new Set<ExecutionSessionState>(['STARTING', 'RUNNING', 'PAUSED', 'DISCONNECTED', 'UNKNOWN']);
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,191}$/;
const MAX_EVENT_DETAIL = 2_048;
const STREAM_HOLD = 192;

/**
 * Provider-neutral durable authority, transcript and attachment boundary.
 * Adapters own process/terminal mechanics; this runtime owns identity, policy,
 * redaction, writer fencing and evidence.
 */
export class ExecutionSessionRuntime {
  private readonly sessions = new Map<string, ExecutionSessionRecord>();
  private readonly live = new Map<string, RuntimeSession>();
  private readonly adapters = new Map<string, ExecutionSessionReconnectAdapter>();
  private readonly listeners = new Set<(event: ExecutionSessionEvent, session: ExecutionSessionRecord) => void>();
  private readonly stateFile: string;
  private readonly eventRoot: string;

  constructor(
    readonly root: string,
    readonly contracts?: ContractExecutionRuntime,
    readonly clock: () => string = () => new Date().toISOString(),
    readonly maximumOutputBytes = 8 * 1024 * 1024,
    readonly redactionRetentionMs = 300_000,
  ) {
    this.stateFile = path.join(root, 'sessions.json');
    this.eventRoot = path.join(root, 'events');
    this.load();
    this.recoverAfterControllerRestart();
  }

  registerAdapter(adapter: ExecutionSessionReconnectAdapter) {
    if (this.adapters.has(adapter.id)) throw new Error('execution_session_adapter_exists');
    this.adapters.set(adapter.id, adapter);
    return this;
  }

  subscribe(listener: (event: ExecutionSessionEvent, session: ExecutionSessionRecord) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  list(options: {activeOnly?: boolean; runId?: string; parcelId?: string} = {}) { return [...this.sessions.values()].filter(item => !options.activeOnly || ACTIVE.has(item.state)).filter(item => !options.runId || item.scope.runId === options.runId).filter(item => !options.parcelId || item.scope.parcelId === options.parcelId).map(item => structuredClone(item)); }
  get(id: string) { const item = this.sessions.get(id); if (!item) throw new Error('execution_session_missing'); return structuredClone(item); }

  create(input: {
    id?: string; incarnation?: string; adapterId: string; adapterReference?: string; scope: ExecutionSessionScope;
    command: string; cwd: string; pid?: number; capabilities: ExecutionSessionCapabilities; control?: ExecutionSessionControl;
    runtimeCredentials?: readonly string[];
  }) {
    validateCapabilities(input.capabilities);
    validateScopeCapabilities(input.scope, input.capabilities);
    assertSafeMetadata(input);
    const id = input.id ?? `session-${randomUUID()}`, incarnation = input.incarnation ?? randomUUID();
    if (!IDENTIFIER.test(id) || !IDENTIFIER.test(incarnation) || !IDENTIFIER.test(input.adapterId)) throw new Error('execution_session_identity_invalid');
    if (this.sessions.has(id)) throw new Error('execution_session_exists');
    const at = this.clock(), record: ExecutionSessionRecord = {
      schema: EXECUTION_SESSION_SCHEMA, id, incarnation, adapterId: input.adapterId,
      ...(input.adapterReference ? {adapterReference: safeText(input.adapterReference, 512)} : {}),
      scope: structuredClone(input.scope), state: 'RUNNING', command: safeText(input.command, 512), cwd: safeText(input.cwd, 1_024),
      ...(input.pid === undefined ? {} : {pid: input.pid}), capabilities: structuredClone(input.capabilities),
      control: {owner: 'agent', actorId: `agent:${input.scope.workerId}`, generation: 1, reconciliationRequired: false},
      attachments: [], createdAt: at, startedAt: at, updatedAt: at, eventSequence: 0, outputBytes: 0, outputTruncated: false,
    };
    this.sessions.set(id, record);
    this.live.set(id, {control: input.control, credentials: new Set((input.runtimeCredentials ?? []).filter(value => value.length >= 8)), carry: {}, flushTimers: {}});
    this.save();
    this.record(id, 'session.created', 'agent-control', `${input.adapterId};${input.capabilities.terminal};node=${input.scope.nodeId}`);
    this.record(id, 'session.started', record.control.actorId, `run=${input.scope.runId};step=${input.scope.stepId};worker=${input.scope.workerId}`);
    return this.get(id);
  }

  bindControl(id: string, control: ExecutionSessionControl, runtimeCredentials: readonly string[] = []) {
    this.get(id);
    const current = this.live.get(id) ?? {credentials: new Set<string>(), carry: {}, flushTimers: {}};
    if(current.retirementTimer){clearTimeout(current.retirementTimer);delete current.retirementTimer;}
    current.control = control;
    for (const value of runtimeCredentials) if (value.length >= 8) current.credentials.add(value);
    this.live.set(id, current);
  }

  redactRuntimeOutput(id: string, value: string) {
    this.get(id);
    return redactSensitiveText(value, [...(this.live.get(id)?.credentials ?? [])]);
  }

  async reconcile(id: string) {
    const record = this.get(id);
    if (!record.capabilities.reconnectable) throw new Error('execution_session_reconnect_unsupported');
    const adapter = this.adapters.get(record.adapterId); if (!adapter) throw new Error('execution_session_adapter_unavailable');
    if(!this.live.has(id))this.live.set(id,{credentials:new Set<string>(),carry:{},flushTimers:{}});
    const control = await adapter.reconnect(record, (stream, value) => this.appendOutput(id, stream, value));
    if (!control) { this.transition(id, 'DISCONNECTED', 'session.disconnected', 'agent-control', 'adapter_could_not_prove_original_session'); this.retireRuntime(id); return this.get(id); }
    const proof = await control.prove();
    if (!sameProof(record, proof)) { this.transition(id, 'UNKNOWN', 'session.disconnected', 'agent-control', 'session_identity_mismatch'); this.retireRuntime(id); throw new Error('execution_session_identity_mismatch'); }
    this.bindControl(id, control); this.transition(id, proof.state, 'session.reconnected', 'agent-control', `incarnation=${record.incarnation}`); return this.get(id);
  }

  async reconcileAll() {
    const results: ExecutionSessionRecord[] = [];
    for (const record of this.list({activeOnly: true})) {
      if (!record.capabilities.reconnectable || this.live.get(record.id)?.control) continue;
      try { results.push(await this.reconcile(record.id)); }
      catch { results.push(this.get(record.id)); }
    }
    return results;
  }

  async attach(id: string, mode: ExecutionSessionMode, authority: ExecutionSessionAuthority) {
    requireObserver(authority); if (mode !== 'WATCH') requireOperator(authority);
    const record = this.get(id); if (!ACTIVE.has(record.state) || ['DISCONNECTED','UNKNOWN'].includes(record.state)) throw new Error('execution_session_not_live');
    if (!modeSupported(record.capabilities, mode)) throw new Error(`execution_session_mode_unsupported:${mode}`);
    const control = await this.provenControl(record);
    const activeInteractive = record.attachments.find(item => !item.detachedAt && item.mode !== 'WATCH');
    if (mode !== 'WATCH' && activeInteractive) throw new Error('execution_session_interactive_attachment_held');
    if (mode === 'TAKE_CONTROL') {
      if (!control.takeControl || !control.returnControl) throw new Error('execution_session_take_control_unsupported');
      const contractId = this.contractId(record); if (!contractId || !this.contracts) throw new Error('execution_session_take_control_reconciliation_unavailable');
      this.contracts.humanTakeover(contractId, authority.actorId);
      await control.takeControl(authority.actorId);
      record.control = {owner: 'human', actorId: authority.actorId, generation: record.control.generation + 1, reconciliationRequired: true};
      this.update(record); this.record(id, 'control.taken', authority.actorId, `generation=${record.control.generation};contract=${contractId}`);
    }
    const attachment: ExecutionSessionAttachment = {id: `attachment-${randomUUID()}`, actorId: authority.actorId, mode, attachedAt: this.clock()};
    record.attachments = [...record.attachments, attachment]; this.update(record);
    this.record(id, 'attachment.opened', authority.actorId, `${mode};attachment=${attachment.id}`);
    return structuredClone(attachment);
  }

  detach(id: string, attachmentId: string, authority: ExecutionSessionAuthority) {
    requireObserver(authority); const record = this.get(id), attachment = record.attachments.find(item => item.id === attachmentId);
    if (!attachment || attachment.detachedAt) throw new Error('execution_session_attachment_missing');
    if (attachment.actorId !== authority.actorId) throw new Error('execution_session_attachment_actor_mismatch');
    if (attachment.mode === 'TAKE_CONTROL' && record.control.owner === 'human') throw new Error('execution_session_control_return_required');
    attachment.detachedAt = this.clock(); this.update(record); this.record(id, 'attachment.closed', authority.actorId, `${attachment.mode};attachment=${attachment.id}`); return this.get(id);
  }

  async input(id: string, attachmentId: string, value: string, authority: ExecutionSessionAuthority, sensitive = false) {
    requireOperator(authority); if (!value.length || Buffer.byteLength(value) > 64 * 1024) throw new Error('execution_session_input_invalid');
    const {record, attachment} = this.requireAttachment(id, attachmentId, authority);
    if (attachment.mode === 'WATCH') throw new Error('execution_session_watch_read_only');
    if (!record.capabilities.interactiveInput) throw new Error('execution_session_input_unsupported');
    if (record.control.owner === 'human' && record.control.actorId !== authority.actorId) throw new Error('execution_session_write_fenced');
    const control = await this.provenControl(record); if (!control.write) throw new Error('execution_session_input_unsupported');
    if (sensitive) this.live.get(id)?.credentials.add(value.replace(/[\r\n]+$/g, ''));
    await control.write(value);
    this.record(id, 'human.input', authority.actorId, `${sensitive ? 'sensitive' : 'withheld'};bytes=${Buffer.byteLength(value)};attachment=${attachment.id}`);
    return {accepted: true, bytes: Buffer.byteLength(value), recordedContent: false};
  }

  async resize(id: string, attachmentId: string, columns: number, rows: number, authority: ExecutionSessionAuthority) {
    requireOperator(authority); const {record} = this.requireAttachment(id, attachmentId, authority);
    if (!record.capabilities.resize || !Number.isSafeInteger(columns) || !Number.isSafeInteger(rows) || columns < 20 || columns > 500 || rows < 5 || rows > 300) throw new Error('execution_session_resize_unsupported');
    const control = await this.provenControl(record); if (!control.resize) throw new Error('execution_session_resize_unsupported');
    await control.resize(columns, rows); this.record(id, 'terminal.resized', authority.actorId, `${columns}x${rows}`); return this.get(id);
  }

  async signal(id: string, attachmentId: string, signal: ExecutionSessionSignal, authority: ExecutionSessionAuthority) {
    requireOperator(authority); const {record, attachment} = this.requireAttachment(id, attachmentId, authority);
    if (attachment.mode === 'WATCH') throw new Error('execution_session_watch_read_only');
    if (!record.capabilities.signals.includes(signal)) throw new Error('execution_session_signal_unsupported');
    const control = await this.provenControl(record); if (!control.signal) throw new Error('execution_session_signal_unsupported');
    await control.signal(signal); this.record(id, 'signal.sent', authority.actorId, signal); return this.get(id);
  }

  async returnControl(id: string, attachmentId: string, authority: ExecutionSessionAuthority, reconciliation: {summary: string; batonId?: string}) {
    requireOperator(authority); const {record, attachment} = this.requireAttachment(id, attachmentId, authority);
    if (attachment.mode !== 'TAKE_CONTROL' || record.control.owner !== 'human' || record.control.actorId !== authority.actorId) throw new Error('execution_session_take_control_not_active');
    const control = await this.provenControl(record); if (!control.returnControl) throw new Error('execution_session_take_control_unsupported');
    const contractId = this.contractId(record); if (!contractId || !this.contracts) throw new Error('execution_session_take_control_reconciliation_unavailable');
    const agentActorId = `agent:${record.scope.workerId}`;
    await control.returnControl(authority.actorId);
    this.contracts.resumeAgent(contractId, authority.actorId, agentActorId);
    record.control = {owner: 'agent', actorId: agentActorId, generation: record.control.generation + 1, reconciliationRequired: false};
    this.update(record); this.record(id, 'reconciliation.recorded', authority.actorId, `${safeText(reconciliation.summary, 1_024)}${reconciliation.batonId ? `;baton=${safeText(reconciliation.batonId, 192)}` : ''}`); this.record(id, 'control.returned', authority.actorId, `generation=${record.control.generation};agent=${agentActorId}`);
    return this.get(id);
  }

  appendOutput(id: string, stream: 'stdout' | 'stderr' | 'terminal', value: string) {
    if (!value) return;
    const runtime = this.live.get(id); if(!runtime)return;
    runtime.carry[stream] = `${runtime.carry[stream] ?? ''}${value}`;
    const current = runtime.carry[stream]!;
    const newline = Math.max(current.lastIndexOf('\n'), current.lastIndexOf('\r'));
    const credentialHold = Math.min(8_192, Math.max(0, ...[...runtime.credentials].map(item => item.length)));
    const boundary = newline >= 0 ? newline + 1 : Math.max(0, current.length - Math.max(STREAM_HOLD, credentialHold));
    if (boundary > 0) { this.persistOutput(id, stream, current.slice(0, boundary), runtime.credentials); runtime.carry[stream] = current.slice(boundary); }
    if (runtime.flushTimers[stream]) clearTimeout(runtime.flushTimers[stream]);
    runtime.flushTimers[stream] = setTimeout(() => this.flushOutput(id, stream), 120); runtime.flushTimers[stream]!.unref();
  }

  flushOutput(id: string, stream?: 'stdout' | 'stderr' | 'terminal') {
    const runtime = this.live.get(id); if (!runtime) return;
    for (const item of stream ? [stream] : ['stdout','stderr','terminal'] as const) {
      if (runtime.flushTimers[item]) { clearTimeout(runtime.flushTimers[item]); delete runtime.flushTimers[item]; }
      const value = runtime.carry[item]; if (value) { this.persistOutput(id, item, value, runtime.credentials); runtime.carry[item] = ''; }
    }
  }

  finish(id: string, result: {exitCode: number | null; signal: string | null; failed?: boolean; detail?: string}) {
    this.flushOutput(id); const record = this.get(id), at = this.clock();
    record.state = result.failed || result.exitCode !== 0 ? 'FAILED' : 'EXITED'; record.exitCode = result.exitCode; record.exitSignal = result.signal; record.endedAt = at; record.updatedAt = at;
    if (result.detail) record.lastError = safeText(result.detail, 1_024); this.update(record);
    this.record(id, record.state === 'FAILED' ? 'process.failed' : 'process.exited', 'agent-control', `exitCode=${result.exitCode ?? 'null'};signal=${result.signal ?? 'none'}${result.detail ? `;${safeText(result.detail, 1_024)}` : ''}`);
    this.retireRuntime(id); return this.get(id);
  }

  disconnect(id: string, reason: string) { this.flushOutput(id); this.transition(id, 'DISCONNECTED', 'session.disconnected', 'agent-control', reason); this.retireRuntime(id); return this.get(id); }
  events(id: string, afterSequence = 0) { this.get(id); if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) throw new Error('execution_session_sequence_invalid'); const file = this.eventFile(id); if (!fs.existsSync(file)) return []; return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as ExecutionSessionEvent).filter(event => event.sequence > afterSequence); }

  transcript(id: string) {
    const session = this.get(id), events = this.events(id), lines = [
      '# Agent Control Execution Session Transcript', '',
      '> Generated from the durable execution-session event stream. Human input content, credentials, environment values and private model reasoning are excluded.', '',
      `- Session: \`${md(session.id)}\``, `- Incarnation: \`${md(session.incarnation)}\``, `- Work Parcel: ${session.scope.parcelId ? `\`${md(session.scope.parcelId)}\`` : 'none'}`,
      `- Job / Run / Step: ${md(session.scope.jobId)} ${md(session.scope.jobVersion)} / \`${md(session.scope.runId)}\` / \`${md(session.scope.stepId)}\``,
      `- Crew role / worker: ${md(session.scope.crewRole ?? 'unassigned')} / ${md(session.scope.workerId)}`,
      `- Machine / adapter / terminal: ${md(session.scope.nodeId)} / ${md(session.adapterId)} / ${md(session.capabilities.terminal)}`,
      `- Provider / account / model: ${md(session.scope.providerId ?? 'not applicable')} / ${md(session.scope.accountLabel ?? 'not exposed')} / ${md(session.scope.modelId ?? 'not applicable')}`,
      `- Command: \`${md(session.command)}\``, `- Working directory: \`${md(session.cwd)}\``,
      `- Attachment modes: WATCH=${session.capabilities.modes.watch}; INTERVENE=${session.capabilities.modes.intervene}; TAKE_CONTROL=${session.capabilities.modes.takeControl}`,
      `- State: \`${session.state}\``, '', '## Chronological record', '',
    ];
    for (const event of events) {
      lines.push(`### ${String(event.sequence).padStart(4, '0')} · ${md(event.at)} · ${md(event.type)}`, '', `- Actor: ${md(event.actorId)}`, `- Detail: ${md(event.detail)}`);
      if (event.text !== undefined) lines.push('', '```text', event.text.replace(/```/g, '``\u200b`'), '```');
      lines.push('');
    }
    lines.push('## Integrity and exclusions', '', `- Events: ${events.length}`, `- Event stream SHA-256: \`${digest(events.map(event => JSON.stringify(event)).join('\n'))}\``, '- Human input content is never retained; only byte count and sensitivity classification are recorded.', '- Output is streamed from the adapter and redacted before durability or dashboard delivery.', '- No terminal view is inferred from Job logs when an adapter is not live.', '');
    return `${lines.join('\n')}\n`;
  }

  private async provenControl(record: ExecutionSessionRecord) {
    let control = this.live.get(record.id)?.control;
    if (!control && record.capabilities.reconnectable) { await this.reconcile(record.id); control = this.live.get(record.id)?.control; }
    if (!control) throw new Error('execution_session_not_live');
    const proof = await control.prove(); if (!sameProof(record, proof) || !['RUNNING','PAUSED'].includes(proof.state)) { this.transition(record.id, 'UNKNOWN', 'session.disconnected', 'agent-control', 'session_identity_or_liveness_unproven'); throw new Error('execution_session_identity_mismatch'); }
    return control;
  }
  private requireAttachment(id: string, attachmentId: string, authority: ExecutionSessionAuthority) { const record = this.get(id), attachment = record.attachments.find(item => item.id === attachmentId && !item.detachedAt); if (!attachment) throw new Error('execution_session_attachment_missing'); if (attachment.actorId !== authority.actorId) throw new Error('execution_session_attachment_actor_mismatch'); return {record, attachment}; }
  private contractId(record: ExecutionSessionRecord) { return record.scope.contractId; }
  private persistOutput(id: string, stream: 'stdout' | 'stderr' | 'terminal', raw: string, credentials: Set<string>) {
    const record = this.get(id); if (record.outputTruncated) return;
    const text = redactSensitiveText(raw.replace(/\0/g, ''), [...credentials]); if (!text) return;
    const bytes = Buffer.byteLength(text), remaining = this.maximumOutputBytes - record.outputBytes;
    if (remaining <= 0) { record.outputTruncated = true; this.update(record); this.record(id, 'output.truncated', 'agent-control', `maximumBytes=${this.maximumOutputBytes}`); return; }
    const accepted = Buffer.from(text).subarray(0, remaining).toString('utf8'); record.outputBytes += Buffer.byteLength(accepted); record.lastOutputAt = this.clock(); if (Buffer.byteLength(text) > remaining) record.outputTruncated = true; this.update(record);
    this.record(id, 'output', 'process', `stream=${stream};bytes=${Buffer.byteLength(accepted)}`, {stream, text: accepted});
    if (record.outputTruncated) this.record(id, 'output.truncated', 'agent-control', `maximumBytes=${this.maximumOutputBytes}`);
  }
  private transition(id: string, state: ExecutionSessionState, type: ExecutionSessionEventType, actorId: string, detail: string) { const record = this.get(id); record.state = state; record.updatedAt = this.clock(); record.lastError = safeText(detail, 1_024); this.update(record); this.record(id, type, actorId, detail); }
  private retireRuntime(id:string){const runtime=this.live.get(id);if(!runtime)return;runtime.control=undefined;if(runtime.retirementTimer)clearTimeout(runtime.retirementTimer);runtime.retirementTimer=setTimeout(()=>{this.flushOutput(id);this.live.delete(id);},Math.max(0,this.redactionRetentionMs));runtime.retirementTimer.unref();}
  private record(id: string, type: ExecutionSessionEventType, actorId: string, detail: string, extra: Pick<ExecutionSessionEvent, 'stream' | 'text'> = {}) {
    const record = this.get(id), event: ExecutionSessionEvent = {schema: 'agent-control.execution-session-event/v1', sessionId: id, sequence: ++record.eventSequence, at: this.clock(), type, actorId: safeText(actorId, 192), detail: safeText(redactSensitiveText(detail), MAX_EVENT_DETAIL), ...extra};
    if (event.text !== undefined) event.text = redactSensitiveText(event.text, [...(this.live.get(id)?.credentials ?? [])]);
    this.update(record); fs.mkdirSync(this.eventRoot, {recursive: true, mode: 0o700}); fs.appendFileSync(this.eventFile(id), `${JSON.stringify(redactSensitiveValue(event))}\n`, {mode: 0o600});
    for (const listener of this.listeners) { try { listener(structuredClone(event), this.get(id)); } catch { /* Observation cannot impair execution. */ } }
    return event;
  }
  private update(record: ExecutionSessionRecord) { record.updatedAt = this.clock(); this.sessions.set(record.id, structuredClone(record)); this.save(); }
  private eventFile(id: string) { return path.join(this.eventRoot, `${id}.jsonl`); }
  private load() { if (!fs.existsSync(this.stateFile)) return; const value = JSON.parse(fs.readFileSync(this.stateFile, 'utf8')) as SessionSnapshot; if (value.schema !== 'agent-control.execution-sessions/v1') throw new Error('execution_session_snapshot_unsupported'); for (const record of value.sessions) this.sessions.set(record.id, record); }
  private recoverAfterControllerRestart() {
    const recovered = [...this.sessions.values()].filter(record => ACTIVE.has(record.state));
    if (!recovered.length) return;
    for (const record of recovered) {
      record.state = record.capabilities.reconnectable ? 'UNKNOWN' : 'DISCONNECTED';
      record.updatedAt = this.clock();
      record.lastError = record.capabilities.reconnectable ? 'controller_restarted_reconnect_pending' : 'controller_restarted_non_reconnectable_session';
      this.sessions.set(record.id, record);
      this.record(record.id, 'session.disconnected', 'agent-control', record.lastError);
    }
  }
  private save() { fs.mkdirSync(this.root, {recursive: true, mode: 0o700}); const temporary = `${this.stateFile}.${process.pid}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify({schema: 'agent-control.execution-sessions/v1', sessions: this.list()} satisfies SessionSnapshot, null, 2)}\n`, {mode: 0o600}); fs.renameSync(temporary, this.stateFile); }
}

function validateCapabilities(value: ExecutionSessionCapabilities) {
  if (value.modes.watch !== value.observableOutput) throw new Error('execution_session_watch_capability_invalid');
  if (value.modes.intervene && !value.interactiveInput && !value.resize && !value.signals.length) throw new Error('execution_session_intervene_capability_invalid');
  if (value.modes.takeControl && (!value.interactiveInput || !value.modes.intervene)) throw new Error('execution_session_take_control_capability_invalid');
  if (value.resize && !['pty','conpty'].includes(value.terminal)) throw new Error('execution_session_resize_capability_invalid');
  if (value.reconnectable && !value.persistent) throw new Error('execution_session_reconnect_capability_invalid');
}
function modeSupported(value: ExecutionSessionCapabilities, mode: ExecutionSessionMode) { return mode === 'WATCH' ? value.modes.watch : mode === 'INTERVENE' ? value.modes.intervene : value.modes.takeControl; }

function validateScopeCapabilities(scope: ExecutionSessionScope, capabilities: ExecutionSessionCapabilities) {
  if (scope.interactionPolicy !== 'WATCH_ONLY') return;
  if (capabilities.interactiveInput || capabilities.resize || capabilities.signals.length || capabilities.modes.intervene || capabilities.modes.takeControl) throw new Error('execution_session_policy_capability_escalation');
}
function requireObserver(value: ExecutionSessionAuthority) { if (!value.actorId.startsWith('human:') || !value.roles.some(role => role === 'observer' || role === 'operator')) throw new Error('execution_session_observer_authority_required'); }
function requireOperator(value: ExecutionSessionAuthority) { if (!value.actorId.startsWith('human:') || !value.roles.includes('operator')) throw new Error('execution_session_operator_authority_required'); }
function safeText(value: unknown, maximum: number) { const text = redactSensitiveText(String(value ?? '')).replace(/\0/g, ''); if (!text.trim()) throw new Error('execution_session_text_required'); return text.slice(0, maximum); }
function assertSafeMetadata(value: {
  runtimeCredentials?: readonly string[];
  control?: ExecutionSessionControl;
  [key: string]: unknown;
}) {
  // Runtime credentials and live adapter functions are deliberately excluded:
  // neither is durable session metadata. Reject secret-looking material in the
  // data that will actually be persisted instead of silently redacting it.
  const {runtimeCredentials: _runtimeCredentials, control: _control, ...durable} = value;
  assertNoSensitiveMaterial(JSON.stringify(durable), 'execution_session_secret_material_forbidden');
}
function sameProof(record: ExecutionSessionRecord, proof: ExecutionSessionProof) { return proof.sessionId === record.id && proof.incarnation === record.incarnation && (record.pid === undefined || proof.pid === record.pid); }
function digest(value: string) { return createHash('sha256').update(value).digest('hex'); }
function md(value: string) { return redactSensitiveText(value).replace(/[|`]/g, '\\$&'); }

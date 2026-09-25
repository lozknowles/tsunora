import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {IdentityControlPlane, type Capability, type WorkAttribution} from './identity-control-plane.js';

export interface AcpJsonRpcRequest {jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown>;}
export interface AcpJsonRpcResponse {jsonrpc: '2.0'; id: string | number | null; result?: unknown; error?: {code: number; message: string; data?: unknown};}
export interface AcpSessionUpdate {jsonrpc: '2.0'; method: 'session/update'; params: {sessionId: string; update: Record<string, unknown>};}
export interface AcpExecutionPort {
  submit(input: {prompt: string; actorId: string; sessionId: string; contextTransferId: string; attribution: WorkAttribution}): Promise<{parcelId: string; runId?: string; status: string; result?: string; evidenceIds?: string[]}>;
  cancel(input: {parcelId: string; actorId: string; sessionId: string; reason: string}): Promise<void> | void;
}

interface AcpDeliveryReceipt {promptHash: string; outcome: {parcelId: string; runId?: string; status: string; evidenceIds?: string[]};}
interface AcpAdapterSession {acpSessionId: string; governedSessionId: string; actorId: string; cwd: string; parcelIds: string[]; deliveries: Record<string, AcpDeliveryReceipt>; createdAt: string; updatedAt: string; closed: boolean;}
interface AcpSessionSnapshot {schema: 'agent-control.acp-sessions/v1'; sessions: AcpAdapterSession[];}

/**
 * Transport-neutral ACP v1 adapter core. A stdio/WebSocket host can forward JSON-RPC
 * messages here; Agent Control remains authoritative for work, tools and evidence.
 */
export class AcpAgentControlAdapter {
  private readonly sessions = new Map<string, AcpAdapterSession>();
  private readonly requestParcels = new Map<string | number, {sessionId: string; parcelId: string}>();
  constructor(
    readonly identities: IdentityControlPlane,
    readonly execution: AcpExecutionPort,
    readonly principalActorId: string,
    readonly update: (notification: AcpSessionUpdate) => Promise<void> | void = () => undefined,
    readonly clock: () => string = () => new Date().toISOString(),
    readonly sessionFile?: string,
  ) { this.ensureControlPlaneIdentity(); this.loadSessions(); }

  async handle(request: AcpJsonRpcRequest): Promise<AcpJsonRpcResponse | null> {
    const id = request.id ?? null;
    try {
      switch (request.method) {
        case 'initialize': return ok(id, {protocolVersion: 1, agentCapabilities: {loadSession: true, promptCapabilities: {image: false, audio: false, embeddedContext: true}, sessionCapabilities: {list: {}, resume: {}, close: {}}, _meta: {agentControl: {extensions: {deliveryId: 'agent-control.delivery-id/v1'}}}}, agentInfo: {name: 'Agent Control', version: '3.6.0'}});
        case 'session/new': return ok(id, this.newSession(request.params ?? {}));
        case 'session/load':
        case 'session/resume': return ok(id, this.resumeSession(request.params ?? {}));
        case 'session/list': return ok(id, {sessions: [...this.sessions.values()].filter(value => !value.closed).map(value => ({sessionId: value.acpSessionId, cwd: value.cwd, updatedAt: value.updatedAt, title: `Agent Control ${value.acpSessionId}`}))});
        case 'session/prompt': return ok(id, await this.prompt(request, request.params ?? {}));
        case 'session/cancel': await this.cancelSession(request.params ?? {}, 'acp_session_cancel'); return request.id === undefined ? null : ok(id, {});
        case 'session/close': await this.cancelSession(request.params ?? {}, 'acp_session_close'); this.closeSession(request.params ?? {}); return ok(id, {});
        case '$/cancel_request': await this.cancelRequest(request.params ?? {}); return null;
        default: return failure(id, -32601, 'method_not_found');
      }
    } catch (error) { return failure(id, domainCode(error), error instanceof Error ? error.message : 'internal_error'); }
  }

  private newSession(params: Record<string, unknown>) {
    const cwd = typeof params.cwd === 'string' && params.cwd.trim() ? params.cwd : (() => { throw new Error('acp_cwd_required'); })();
    if (!path.isAbsolute(cwd)) throw new Error('acp_cwd_must_be_absolute');
    if (Array.isArray(params.additionalDirectories) && params.additionalDirectories.length) throw new Error('acp_additional_directories_unsupported');
    if (Array.isArray(params.mcpServers) && params.mcpServers.length) throw new Error('acp_mcp_servers_unsupported');
    const actorCapabilities = this.identities.effectiveCapabilities(this.principalActorId), requested = ['session.observe', 'session.manage', 'parcel.create', 'parcel.execute', 'agent.delegate', 'model.invoke', 'node.execute'], capabilities = requested.filter(value => has(actorCapabilities, value));
    if (!capabilities.includes('parcel.create')) throw new Error('acp_actor_cannot_create_parcel');
    const acpSessionId = `acp:${randomUUID()}`, session = this.identities.createSession({id: acpSessionId, creatorActorId: this.principalActorId, mode: 'operator-controlled', permissions: {capabilities, allowedModels: ['*'], allowedNodes: ['*'], filesystem: 'none', network: 'provider-only'}, contextPolicy: 'hybrid', metadata: {protocol: 'ACP', cwdHash: hash(cwd)}});
    const controlCapabilities = capabilities.filter(value => ['session.observe', 'parcel.execute', 'agent.delegate', 'model.invoke', 'node.execute'].includes(value));
    this.identities.addParticipant(session.id, {actorId: 'agent-control', capabilities: controlCapabilities}, this.principalActorId);
    const createdAt = this.clock();
    this.sessions.set(acpSessionId, {acpSessionId, governedSessionId: session.id, actorId: this.principalActorId, cwd, parcelIds: [], deliveries: {}, createdAt, updatedAt: createdAt, closed: false}); this.saveSessions();
    return {sessionId: acpSessionId, modes: {currentModeId: 'governed', availableModes: [{id: 'governed', name: 'Governed execution', description: 'All work enters Agent Control Work Parcels'}]}, _meta: {agentControl: {governedSessionId: session.id, creatorActorId: session.creatorActorId}}};
  }

  private resumeSession(params: Record<string, unknown>) {
    const session = this.mustSession(params); if (session.closed) throw new Error('acp_session_closed');
    if (typeof params.cwd === 'string' && path.resolve(params.cwd) !== path.resolve(session.cwd)) throw new Error('acp_session_cwd_mismatch');
    if (Array.isArray(params.additionalDirectories) && params.additionalDirectories.length) throw new Error('acp_additional_directories_unsupported');
    if (Array.isArray(params.mcpServers) && params.mcpServers.length) throw new Error('acp_mcp_servers_unsupported');
    const governed = this.identities.session(session.governedSessionId); if (governed.creatorActorId !== session.actorId || session.actorId !== this.principalActorId) throw new Error('acp_session_identity_mismatch');
    return {sessionId: session.acpSessionId, _meta: {agentControl: {governedSessionId: session.governedSessionId, creatorActorId: governed.creatorActorId}}};
  }

  private async prompt(request: AcpJsonRpcRequest, params: Record<string, unknown>) {
    const session = this.mustSession(params); if (session.closed) throw new Error('acp_session_closed'); this.identities.authorize(session.governedSessionId, session.actorId, 'parcel.create');
    const blocks = Array.isArray(params.prompt) ? params.prompt : []; const texts = blocks.map(block => block && typeof block === 'object' && (block as Record<string, unknown>).type === 'text' ? (block as Record<string, unknown>).text : undefined).filter((value): value is string => typeof value === 'string');
    const prompt = texts.join('\n').trim(); if (!prompt) throw new Error('acp_prompt_text_required');
    const deliveryId = acpDeliveryId(params), promptHash = hash(prompt), prior = deliveryId ? session.deliveries[deliveryId] : undefined;
    if (prior) { if (prior.promptHash !== promptHash) throw new Error('acp_delivery_replay_mismatch'); return promptResponse(session, prior.outcome); }
    const transfer = this.identities.recordContextTransfer({sessionId: session.governedSessionId, sourceActorId: session.actorId, targetActorId: 'agent-control', selected: [{id: `acp-prompt:${hash(prompt).slice(0, 20)}`, content: prompt, estimatedTokens: Math.max(1, Math.ceil(prompt.length / 4)), classification: 'internal'}], contextBudget: Math.max(1, Math.ceil(prompt.length / 4)), selectionReason: 'ACP prompt blocks mapped exactly into one governed task context', compressionSteps: [], receivingAgentId: 'agent-control-orchestrator'});
    const attribution: WorkAttribution = {schema: 'agent-control.work-attribution/v1', actorId: session.actorId, sessionId: session.governedSessionId, agentId: 'agent-control-orchestrator', authority: this.identities.session(session.governedSessionId).permissions.capabilities, createdAt: this.clock(), legacy: false};
    await this.update({jsonrpc: '2.0', method: 'session/update', params: {sessionId: session.acpSessionId, update: {sessionUpdate: 'plan', entries: [{content: 'Compile and execute a governed Work Parcel', priority: 'high', status: 'in_progress'}]}}});
    const outcome = await this.execution.submit({prompt, actorId: session.actorId, sessionId: session.governedSessionId, contextTransferId: transfer.id, attribution}); session.parcelIds.push(outcome.parcelId); this.sessions.set(session.acpSessionId, session); attribution.parcelId = outcome.parcelId;
    if (deliveryId) session.deliveries[deliveryId] = {promptHash, outcome: {parcelId: outcome.parcelId, runId: outcome.runId, status: outcome.status, evidenceIds: outcome.evidenceIds ?? []}};
    session.updatedAt = this.clock(); this.sessions.set(session.acpSessionId, session); this.saveSessions();
    if (request.id !== undefined && request.id !== null) this.requestParcels.set(request.id, {sessionId: session.acpSessionId, parcelId: outcome.parcelId});
    await this.update({
      jsonrpc: '2.0', method: 'session/update', params: {sessionId: session.acpSessionId, update: {
        sessionUpdate: 'tool_call', toolCallId: outcome.parcelId, title: 'Governed Work Parcel', kind: 'think', status: 'in_progress',
        rawInput: {contextTransferId: transfer.id}, _meta: {agentControl: {parcelId: outcome.parcelId}},
      }},
    });
    await this.update({
      jsonrpc: '2.0', method: 'session/update', params: {sessionId: session.acpSessionId, update: {
        sessionUpdate: 'tool_call_update', toolCallId: outcome.parcelId, status: acpToolStatus(outcome.status), title: 'Governed Work Parcel',
        ...(outcome.result ? {rawOutput: {result: outcome.result}} : {}),
        _meta: {agentControl: {parcelId: outcome.parcelId, runId: outcome.runId, evidenceIds: outcome.evidenceIds ?? []}},
      }},
    });
    await this.update({
      jsonrpc: '2.0', method: 'session/update', params: {sessionId: session.acpSessionId, update: {
        sessionUpdate: 'plan', entries: [{content: 'Compile and execute a governed Work Parcel', priority: 'high', status: terminalSuccess(outcome.status) ? 'completed' : 'in_progress'}],
      }},
    });
    return promptResponse(session, outcome);
  }

  private async cancelSession(params: Record<string, unknown>, reason: string) { const session = this.mustSession(params); for (const parcelId of [...session.parcelIds].reverse()) await this.execution.cancel({parcelId, actorId: session.actorId, sessionId: session.governedSessionId, reason}); }
  private closeSession(params: Record<string, unknown>) { const session = this.mustSession(params); session.closed = true; session.updatedAt = this.clock(); this.sessions.set(session.acpSessionId, session); this.identities.updateSession(session.governedSessionId, {status: 'CLOSED'}, session.actorId); this.saveSessions(); }
  private async cancelRequest(params: Record<string, unknown>) { const requestId = params.requestId; if (typeof requestId !== 'string' && typeof requestId !== 'number') return; const target = this.requestParcels.get(requestId); if (!target) return; const session = this.sessions.get(target.sessionId); if (!session) return; await this.execution.cancel({parcelId: target.parcelId, actorId: session.actorId, sessionId: session.governedSessionId, reason: 'acp_request_cancelled'}); }
  private mustSession(params: Record<string, unknown>) { const id = typeof params.sessionId === 'string' ? params.sessionId : ''; const value = this.sessions.get(id); if (!value) throw new Error('acp_session_missing'); return structuredClone(value); }
  private loadSessions() {
    if (!this.sessionFile || !fs.existsSync(this.sessionFile)) return;
    const snapshot = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8')) as AcpSessionSnapshot;
    if (snapshot.schema !== 'agent-control.acp-sessions/v1' || !Array.isArray(snapshot.sessions)) throw new Error('acp_session_snapshot_unsupported');
    for (const session of snapshot.sessions) if (session.actorId === this.principalActorId) this.sessions.set(session.acpSessionId, {...structuredClone(session), deliveries: structuredClone(session.deliveries ?? {})});
  }
  private saveSessions() {
    if (!this.sessionFile) return;
    fs.mkdirSync(path.dirname(this.sessionFile), {recursive: true}); const temporary = `${this.sessionFile}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify({schema: 'agent-control.acp-sessions/v1', sessions: [...this.sessions.values()]} satisfies AcpSessionSnapshot, null, 2)}\n`, {mode: 0o600}); fs.renameSync(temporary, this.sessionFile);
  }
  private ensureControlPlaneIdentity() {
    try { this.identities.actor('agent-control'); } catch { this.identities.registerActor({id: 'agent-control', type: 'control-plane', displayName: 'Agent Control', principalId: 'control-plane:agent-control', authenticationSource: 'internal', roles: ['administrator'], capabilities: ['*'], metadata: {}}); }
    try { this.identities.agent('agent-control-orchestrator'); } catch { this.identities.registerAgent({id: 'agent-control-orchestrator', actorId: 'agent-control', displayName: 'Agent Control orchestrator', purpose: 'Map external sessions to governed Work Parcels', capabilities: ['parcel.execute', 'agent.delegate', 'model.invoke', 'node.execute'], metadata: {protocol: 'ACP'}}); }
  }
}

function ok(id: string | number | null, result: unknown): AcpJsonRpcResponse { return {jsonrpc: '2.0', id, result}; }
function failure(id: string | number | null, code: number, message: string): AcpJsonRpcResponse { return {jsonrpc: '2.0', id, error: {code, message}}; }
function domainCode(error: unknown) { const message = error instanceof Error ? error.message : ''; return /missing|not_found/.test(message) ? -32004 : /denied|cannot|mismatch|closed/.test(message) ? -32003 : -32602; }
function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
function has(capabilities: Capability[], requested: Capability) { return capabilities.includes('*') || capabilities.includes(requested) || capabilities.some(value => value.endsWith(':*') && requested.startsWith(value.slice(0, -1))); }
function acpToolStatus(status: string): 'pending' | 'in_progress' | 'completed' | 'failed' { return status === 'SUCCEEDED' ? 'completed' : ['FAILED','CANCELLED'].includes(status) ? 'failed' : ['PLANNING','QUEUED'].includes(status) ? 'pending' : 'in_progress'; }
function terminalSuccess(status: string) { return status === 'SUCCEEDED'; }
function acpDeliveryId(params: Record<string, unknown>) { const meta = params._meta; if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined; const agentControl = (meta as Record<string, unknown>).agentControl; if (!agentControl || typeof agentControl !== 'object' || Array.isArray(agentControl)) return undefined; const id = (agentControl as Record<string, unknown>).deliveryId; if (id === undefined) return undefined; if (typeof id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(id)) throw new Error('acp_delivery_id_invalid'); return id; }
function promptResponse(session: AcpAdapterSession, outcome: {parcelId: string; runId?: string; status: string; evidenceIds?: string[]}) { return {stopReason: outcome.status === 'CANCELLED' ? 'cancelled' : 'end_turn', _meta: {agentControl: {sessionId: session.governedSessionId, parcelId: outcome.parcelId, runId: outcome.runId, status: outcome.status, evidenceIds: outcome.evidenceIds ?? []}}}; }

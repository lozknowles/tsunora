import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {ModelConfig, ProviderAccountProfileConfig, ProviderConfig, ResourceConfig} from './config.js';
import {codexExecutionSessionOutputLine, probeCodexChatGptAuth, runCodexExec, type CodexExecRequest, type CodexExecResult, type CodexExecTelemetryEvent} from './codex-exec-provider.js';
import {executeSsh, sshResourceArgs, type SshExecutor} from './managed-node-ssh.js';
import {resolveCodexAccountEnvironment} from './provider-account-profile.js';
import {accountCredentialResidency, accountProviderExecutionNode} from './provider-account-profile.js';
import type {ExecutionSessionRuntime, ExecutionSessionScope} from './execution-session.js';
import {OwnedProcessManager} from './owned-process.js';
import {redactSensitiveText} from './security-redaction.js';

export interface CodexAccountStatusRequest {provider: ProviderConfig; account: ProviderAccountProfileConfig; nodeId: string; providerExecutionNodeId?: string; credentialNodeId?: string; timeoutMs: number;}
export interface CodexAccountStatusResult {
  providerId: string; accountProfileId: string; nodeId: string; authenticated: boolean;
  providerExecutionNodeId?: string; credentialNodeId?: string;
  codexVersion: string; executableSha256: string; discoveredAt: string;
}
export interface CodexStructuredExecutionRequest extends CodexAccountStatusRequest {
  model: ModelConfig; instruction: string; outputSchema: Record<string, unknown>; maximumOutputTokens?: number;
  onTelemetry?: (event: CodexExecTelemetryEvent) => void;
  signal?: AbortSignal;
  executionSessionScope?: ExecutionSessionScope;
}
export interface CodexStructuredExecutionResult extends CodexExecResult {
  providerId: string; accountProfileId: string; modelId: string; nodeId: string;
  providerExecutionNodeId?: string; credentialNodeId?: string;
  codexVersion: string; executableSha256: string; discoveredAt: string;
}
export interface CodexNodeExecutionPort {
  accountStatus(request: CodexAccountStatusRequest): Promise<CodexAccountStatusResult>;
  execReadOnlyStructured(request: CodexStructuredExecutionRequest): Promise<CodexStructuredExecutionResult>;
}

export class LocalCodexNodeExecutionPort implements CodexNodeExecutionPort {
  constructor(
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly command = process.env.CODEX_COMMAND ?? 'codex',
    private readonly executionSessions?: ExecutionSessionRuntime,
  ) {}
  async accountStatus(request: CodexAccountStatusRequest): Promise<CodexAccountStatusResult> {
    assertLocalities(request);
    const resolved = resolveCodexAccountEnvironment(request.account, this.environment, request.nodeId);
    await probeCodexChatGptAuth(this.command, process.cwd(), request.timeoutMs, resolved.environment);
    return {providerId: request.provider.id, accountProfileId: request.account.id, nodeId: request.nodeId, providerExecutionNodeId: request.nodeId, credentialNodeId: request.nodeId, authenticated: true, codexVersion: 'locally-qualified', executableSha256: 'unavailable', discoveredAt: new Date().toISOString()};
  }
  async execReadOnlyStructured(request: CodexStructuredExecutionRequest): Promise<CodexStructuredExecutionResult> {
    assertLocalities(request);
    const resolved = resolveCodexAccountEnvironment(request.account, this.environment, request.nodeId);
    await probeCodexChatGptAuth(this.command, process.cwd(), request.timeoutMs, resolved.environment);
    const ownedExecution = request.executionSessionScope && this.executionSessions
      ? new OwnedProcessManager(undefined, this.executionSessions, request.executionSessionScope)
      : undefined;
    const run = await runCodexExec({
      command: this.command, cwd: process.cwd(), modelId: request.model.providerModel, instruction: request.instruction, grantedToolIds: [], timeoutMs: request.timeoutMs,
      environment: resolved.environment, loadUserConfig: false, outputSchema: request.outputSchema, onTelemetry: request.onTelemetry, signal: request.signal,
      ...(ownedExecution ? {ownedExecution, executionSession: {terminal: 'pipe', interactiveInput: false, allowSignals: true, adapterId: 'codex-cli-jsonl', commandLabel: 'Codex read-only structured execution', transformOutputLine: codexExecutionSessionOutputLine}} : {}),
    });
    return {...run, providerId: request.provider.id, accountProfileId: request.account.id, modelId: request.model.id, nodeId: request.nodeId, providerExecutionNodeId: request.nodeId, credentialNodeId: request.nodeId, codexVersion: 'locally-qualified', executableSha256: 'unavailable', discoveredAt: new Date().toISOString()};
  }
}

type RemoteWireResult = {
  schema: 'agent-control.codex-node-result/v1'; operation: 'accountStatus' | 'execReadOnlyStructured'; ok: boolean;
  authenticated?: boolean; codexVersion?: string; executableSha256?: string; discoveredAt?: string;
  threadId?: string; finalMessage?: string; usage?: Record<string, unknown>; observedItemTypes?: string[];
  telemetry?: Array<{type: 'thread.started' | 'turn.completed'; threadId?: string; elapsedMs: number; usage?: Record<string, unknown>}>;
  error?: string;
};

const WINDOWS_STDIN_BOOTSTRAP = [
  '$ErrorActionPreference = "Stop"',
  '$payload = [Console]::In.ReadLine()',
  '$encodedSource = [Console]::In.ReadLine()',
  '$source = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encodedSource))',
  '& ([ScriptBlock]::Create($source)) $payload',
  '',
].join('\n');

export class ResourceCodexNodeExecutionPort implements CodexNodeExecutionPort {
  private readonly resources: Map<string, ResourceConfig>;
  private readonly script: string;
  constructor(
    resources: ResourceConfig[],
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly executor: SshExecutor = executeSsh,
    scriptSource?: string,
    private readonly executionSessions?: ExecutionSessionRuntime,
  ) {
    this.resources = new Map(resources.map(resource => [resource.id, structuredClone(resource)]));
    this.script = scriptSource ?? fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/codex-node-windows.ps1'), 'utf8');
  }
  async accountStatus(request: CodexAccountStatusRequest): Promise<CodexAccountStatusResult> {
    assertLocalities(request);
    const resource = this.resource(request.nodeId);
    if (resource.transport.type === 'local') return new LocalCodexNodeExecutionPort(this.environment, undefined, this.executionSessions).accountStatus(request);
    const store = accountCredentialResidency(request.account).store;
    if (store.type !== 'codex-home-env') throw new Error('account_profile_credential_store_unsupported');
    const wire = await this.windows(resource, 'accountStatus', {operation: 'accountStatus', providerId: request.provider.id, accountProfileId: request.account.id, nodeId: request.nodeId, credentialEnvironment: store.env, timeoutMs: request.timeoutMs}, request.timeoutMs);
    if (!wire.ok || !wire.authenticated) throw new Error(remoteError(wire.error, 'codex_chatgpt_auth_required'));
    return {providerId: request.provider.id, accountProfileId: request.account.id, nodeId: resource.id, providerExecutionNodeId: resource.id, credentialNodeId: resource.id, authenticated: true, codexVersion: required(wire.codexVersion, 'codex_node_version_missing'), executableSha256: requiredHash(wire.executableSha256), discoveredAt: requiredTimestamp(wire.discoveredAt)};
  }
  async execReadOnlyStructured(request: CodexStructuredExecutionRequest): Promise<CodexStructuredExecutionResult> {
    assertLocalities(request);
    const resource = this.resource(request.nodeId);
    if (resource.transport.type === 'local') return new LocalCodexNodeExecutionPort(this.environment, undefined, this.executionSessions).execReadOnlyStructured(request);
    const store = accountCredentialResidency(request.account).store;
    if (store.type !== 'codex-home-env') throw new Error('account_profile_credential_store_unsupported');
    const wire = await this.windows(resource, 'execReadOnlyStructured', {operation: 'execReadOnlyStructured', providerId: request.provider.id, accountProfileId: request.account.id, modelId: request.model.id, providerModel: request.model.providerModel, nodeId: request.nodeId, credentialEnvironment: store.env, timeoutMs: request.timeoutMs, maximumOutputTokens: request.maximumOutputTokens, instruction: request.instruction, outputSchema: request.outputSchema}, request.timeoutMs, request.signal, request.executionSessionScope);
    if (!wire.ok) throw new Error(remoteError(wire.error, 'codex_node_exec_failed'));
    for (const event of wire.telemetry ?? []) request.onTelemetry?.({...event, context: {tokens: null, authority: 'unavailable', source: 'codex_jsonl_does_not_report_current_context'}});
    return {providerId: request.provider.id, accountProfileId: request.account.id, modelId: request.model.id, nodeId: resource.id, providerExecutionNodeId: resource.id, credentialNodeId: resource.id, codexVersion: required(wire.codexVersion, 'codex_node_version_missing'), executableSha256: requiredHash(wire.executableSha256), discoveredAt: requiredTimestamp(wire.discoveredAt), threadId: wire.threadId, finalMessage: requiredMessage(wire.finalMessage), usage: numericRecord(wire.usage), observedItemTypes: Array.isArray(wire.observedItemTypes) ? wire.observedItemTypes.filter(value => typeof value === 'string') : []};
  }
  private resource(nodeId: string) { const resource = this.resources.get(nodeId); if (!resource) throw new Error('codex_execution_node_missing'); return resource; }
  private async windows(resource: ResourceConfig, operation: RemoteWireResult['operation'], payload: Record<string, unknown>, timeoutMs: number, signal?: AbortSignal, executionSessionScope?: ExecutionSessionScope): Promise<RemoteWireResult> {
    if (resource.platform !== 'windows' || resource.transport.type !== 'ssh') throw new Error('codex_execution_node_transport_unsupported');
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
    const encodedScript = Buffer.from(this.script, 'utf8').toString('base64');
    const bootstrap = Buffer.from(WINDOWS_STDIN_BOOTSTRAP, 'utf16le').toString('base64');
    // Windows OpenSSH does not consistently propagate channel EOF to a
    // detached noninteractive PowerShell child. Two bounded records avoid
    // using EOF as a protocol delimiter while keeping variable data out of
    // executable PowerShell source.
    const input = `${encoded}\n${encodedScript}\n`;
    let result;
    const ownedExecution = executionSessionScope && this.executionSessions
      ? new OwnedProcessManager(undefined, this.executionSessions, executionSessionScope)
      : undefined;
    try { result = await this.executor('ssh', sshResourceArgs(resource, ['powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand', bootstrap]), input, {
      // Leave a bounded cleanup/result margin beyond the node-local provider
      // deadline so the audited runner can terminate its remote process tree
      // and return a canonical timeout instead of being orphaned by SSH.
      timeoutMs: Math.min(Math.max(timeoutMs + 45_000, 60_000), 30 * 60_000), maxBytes: 4 * 1024 * 1024, signal,
      ...(ownedExecution ? {ownedExecution, session: {terminal: 'pipe', interactiveInput: false, allowSignals: true, remoteTransport: true, adapterId: 'windows-ssh-codex', commandLabel: 'Remote Codex read-only structured execution', transformOutputLine: remoteCodexSessionOutputLine}} : {}),
    }); }
    catch { throw new Error('codex_node_transport_failed'); }
    if (result.timedOut) throw new Error('codex_node_timeout');
    if (result.aborted) throw new Error('codex_node_cancelled');
    if (result.status !== 0) throw new Error('codex_node_transport_failed');
    let parsed: unknown; try { parsed = JSON.parse(result.stdout.trim()); } catch { throw new Error('codex_node_result_invalid'); }
    if (!record(parsed) || parsed.schema !== 'agent-control.codex-node-result/v1' || parsed.operation !== operation || typeof parsed.ok !== 'boolean') throw new Error('codex_node_result_invalid');
    return parsed as RemoteWireResult;
  }
}

function required(value: unknown, error: string) { if (typeof value !== 'string' || !value.trim() || /[\\/]/.test(value)) throw new Error(error); return value; }
function requiredMessage(value: unknown) { if (typeof value !== 'string' || !value.trim()) throw new Error('codex_exec_missing_final_message'); const safe=safeRemoteDiagnostic(value); if(safe.includes('[REDACTED'))throw new Error('codex_exec_sensitive_output_rejected'); return safe; }
function assertLocalities(request: CodexAccountStatusRequest) {
  const executionNode = accountProviderExecutionNode(request.account), credentialNode = accountCredentialResidency(request.account).nodeId;
  if (request.nodeId !== executionNode || request.providerExecutionNodeId && request.providerExecutionNodeId !== executionNode) throw new Error('codex_account_execution_node_mismatch');
  if (request.credentialNodeId && request.credentialNodeId !== credentialNode) throw new Error('codex_account_credential_node_mismatch');
  if (credentialNode !== executionNode) throw new Error('codex_account_credential_execution_locality_unsupported');
}
function requiredHash(value: unknown) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) throw new Error('codex_node_executable_hash_invalid'); return value.toLowerCase(); }
function requiredTimestamp(value: unknown) { if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error('codex_node_discovery_timestamp_invalid'); return value; }
function record(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function numericRecord(value: unknown): Record<string, unknown> | undefined { if (!record(value)) return undefined; const output: Record<string, unknown> = {}; for (const [key,item] of Object.entries(value)) if (typeof item === 'number' && Number.isFinite(item) && item >= 0) output[key] = item; else if (record(item)) output[key] = numericRecord(item); return output; }
function remoteError(value: unknown, fallback: string) { return typeof value === 'string' && /^(?:account_profile|codex)_[a-z0-9_]+$/.test(value) ? value : fallback; }
function remoteCodexSessionOutputLine(stream: 'stdout' | 'stderr', line: string) {
  if (!line.trim()) return undefined;
  if (stream === 'stderr') return `Remote Codex transport diagnostic: ${safeRemoteDiagnostic(line)}`;
  let value: unknown;
  try { value = JSON.parse(line); } catch { return 'Remote Codex channel emitted a non-result line; content withheld.'; }
  if (!record(value) || value.schema !== 'agent-control.codex-node-result/v1') return 'Remote Codex channel emitted an unrecognised result; content withheld.';
  const outcome = value.ok === true ? 'completed' : `failed · ${remoteError(value.error, 'codex_node_failure')}`;
  const message = typeof value.finalMessage === 'string' ? `\nCodex agent output:\n${safeRemoteDiagnostic(value.finalMessage)}` : '';
  const usage = record(value.usage) ? `\nUsage: ${JSON.stringify(numericRecord(value.usage) ?? {})}` : '';
  return `Remote Codex ${String(value.operation ?? 'execution')} ${outcome}${message}${usage}`;
}
function safeRemoteDiagnostic(value: string) {
  return redactSensitiveText(value)
    .replace(/\bCODEX_HOME\s*[:=]\s*[^\s,;]+/gi, 'CODEX_HOME=[REDACTED]')
    .replace(/[A-Za-z]:\\Users\\[^\s]+\\(?:\.local\\share\\agent-control\\)?codex-profiles\\[^\s]*/gi, '[REDACTED CODEX PROFILE PATH]')
    .slice(0, 65_536);
}

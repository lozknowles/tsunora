import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {HarnessCandidate} from './adaptive-harness.js';
import type {RecipeExecutor, ToolInvocationGateway} from './harness-dispatch.js';
import type {ProviderDefinition} from './providers.js';
import {createInvocationObservation, type ContextPacketSource} from './harness-efficiency.js';
import type {ModelConfig, ProviderAccountProfileConfig, ProviderConfig} from './config.js';
import {materializeCodexModelConfig} from './codex-model-config.js';
import {resolveCodexAccountEnvironment} from './provider-account-profile.js';
import type {ContextLifecycleKind, TelemetryAuthority, TokenTelemetrySample} from './token-aware-baton-routing.js';
import {OwnedProcessManager, type OwnedExecution, type OwnedProcessRequest} from './owned-process.js';
import {redactSensitiveText} from './security-redaction.js';

export const CODEX_0153_CONTEXT_CAPABILITIES = Object.freeze({
  persistedResponseUsage: true,
  liveThreadTokenUsage: true,
  nativeCompaction: true,
  nativeNewContext: 'eligible-chatgpt-codex-sessions-excluding-temporary-structured',
  rawResponseUsageMetadata: 'internal-notification-only',
  turnCost: 'otel-only',
  agentControlExecNativeContextManagement: false,
});

export interface CodexExecRequest {
  command: string;
  cwd: string;
  modelId: string;
  instruction: string;
  grantedToolIds: string[];
  timeoutMs: number;
  environment?: NodeJS.ProcessEnv;
  loadUserConfig?: boolean;
  onTelemetry?: (event: CodexExecTelemetryEvent) => void;
  outputSchema?: Record<string, unknown>;
  signal?: AbortSignal;
  /** Existing Agent Control process authority used to expose the genuine CLI process. */
  ownedExecution?: OwnedExecution;
  /** Truthful attachment capabilities for this specific invocation. */
  executionSession?: OwnedProcessRequest['session'];
}

export interface CodexExecTelemetryEvent {
  type: 'thread.started' | 'turn.completed' | 'thread.token_usage.updated' | 'context.compacted';
  threadId?: string;
  elapsedMs: number;
  usage?: Record<string, unknown>;
  context: {tokens: number | null; limitTokens?: number | null; authority: TelemetryAuthority; source: string};
  contextLifecycle?: {kind: ContextLifecycleKind; contextId?: string; authority: TelemetryAuthority; source: string};
}

export interface CodexExecResult {
  threadId?: string;
  finalMessage: string;
  usage?: Record<string, unknown>;
  observedItemTypes: string[];
}

export interface CodexChatGptAuth {
  mode: 'chatgpt';
}

export interface CodexExecProviderOptions {
  provider: ProviderDefinition;
  workerId: string;
  modelId: string;
  cwd: string;
  workerCapabilities: string[];
  modelCapabilities: string[];
  availableSkillIds?: string[];
  availableToolIds: string[];
  promptProfile?: {id: string; version: string; description: string};
  runtime?: Record<string, string | number | boolean>;
  qualificationEvidence: string[];
  health: 'healthy' | 'degraded' | 'offline';
  timeoutMs?: number;
  command?: string;
  authProbe?: (command: string, cwd: string, timeoutMs: number, environment?: NodeJS.ProcessEnv, signal?: AbortSignal, ownedExecution?: OwnedExecution) => Promise<CodexChatGptAuth>;
  runner?: (request: CodexExecRequest) => Promise<CodexExecResult>;
  telemetry?: (sample: TokenTelemetrySample) => void;
  contextLimitTokens?: number;
  accountProfile?: ProviderAccountProfileConfig;
  environment?: NodeJS.ProcessEnv;
}

interface ToolRequest {tool: string; input?: unknown;}

/**
 * Official Codex non-interactive provider using saved ChatGPT authentication.
 * Codex runs inside a read-only capability envelope; Agent Control retains all raw tools.
 */
export class CodexExecProviderFactory {
  constructor(private readonly options: CodexExecProviderOptions) {
    if (options.provider.kind !== 'cli') throw new Error('codex_exec_provider_kind_invalid');
    if (!options.qualificationEvidence.length) throw new Error('codex_exec_qualification_evidence_required');
    if (!path.isAbsolute(options.cwd)) throw new Error('codex_exec_cwd_must_be_absolute');
  }

  candidate(): HarnessCandidate {
    const provider = this.options.provider;
    return {
      route: {
        id: `${provider.id}:${this.options.accountProfile?.id ?? 'default'}:${this.options.modelId}:${this.options.workerId}`,
        providerId: provider.id,
        ...(this.options.accountProfile ? {accountProfileId: this.options.accountProfile.id} : {}),
        modelId: this.options.modelId,
        workerId: this.options.workerId,
        local: true,
        health: this.options.health,
        qualified: true,
        qualificationReason: `qualified:${this.options.qualificationEvidence.join(',')}`,
        capabilities: [...provider.capabilities],
        pricing: {currency: 'USD', billing: 'included', inputPerMillionTokens: 0, outputPerMillionTokens: 0, fixedPerRequest: 0, effectiveFrom: '2026-08-24', source: 'ChatGPT plan allowance'},
        performance: {startupLatencyMs: 1_000, inputTokensPerSecond: 50, outputTokensPerSecond: 25, historicalSuccessRate: .8, expectedQuality: .8, confidence: .7, contextLimitTokens: 32768, source: 'configured', sampleSize: 1},
      },
      workerCapabilities: [...this.options.workerCapabilities],
      modelCapabilities: [...this.options.modelCapabilities],
      promptProfiles: [this.options.promptProfile ?? {id: 'codex-structured-return', version: '1', description: 'Return one schema-constrained Agent Control tool request'}],
      availableSkillIds: [...(this.options.availableSkillIds ?? [])],
      availableToolIds: [...this.options.availableToolIds],
      runtime: {sandbox: 'read-only', ephemeral: true, ...(this.options.runtime ?? {})},
    };
  }

  executor(instruction: string): RecipeExecutor {
    return {execute: (recipe, tools) => this.execute(instruction, recipe, tools, Math.min(recipe.resourceLimits.maximumLatencyMs ?? this.options.timeoutMs ?? 60_000, this.options.timeoutMs ?? 60_000))};
  }

  private async execute(instruction: string, recipe: Parameters<RecipeExecutor['execute']>[0], tools: ToolInvocationGateway, timeoutMs: number) {
    if (typeof tools.assertActive !== 'function') throw new Error('provider_live_control_required');
    tools.signal?.throwIfAborted(); tools.assertActive();
    const grantedToolIds = recipe.tools.map(tool => tool.id);
    if (!grantedToolIds.length) throw new Error('codex_exec_no_granted_tools');
    const command = this.options.command ?? process.env.CODEX_COMMAND ?? 'codex';
    const account = this.options.accountProfile ? resolveCodexAccountEnvironment(this.options.accountProfile, this.options.environment) : undefined;
    const environment = account?.environment ?? this.options.environment;
    await (this.options.authProbe ?? probeCodexChatGptAuth)(command, this.options.cwd, timeoutMs, environment, tools.signal, tools.ownedExecution);
    tools.signal?.throwIfAborted(); tools.assertActive();
    const startedAt = new Date().toISOString();
    const telemetry = this.options.telemetry;
    const emit = (event: CodexExecTelemetryEvent) => {
      if (!telemetry) return;
      const usage = event.usage ?? {}, input = numeric(usage.input_tokens), cached = cachedInput(usage), cacheWrite = cacheWriteInput(usage), fresh = input !== null && cached !== null && cached + (cacheWrite ?? 0) <= input ? input - cached - (cacheWrite ?? 0) : null, output = numeric(usage.output_tokens), total = numeric(usage.total_tokens) ?? (input !== null && output !== null ? input + output : null);
      telemetry({threadId: event.threadId ?? `codex:${recipe.id ?? recipe.taskId ?? 'unattributed'}`, parcelId: recipe.taskId ?? recipe.jobId ?? 'unattributed-task', agentId: this.options.workerId, nodeId: this.options.workerId, providerId: this.options.provider.id, accountProfileId: account?.profile.id, accountLabel: account?.profile.label, accountPlan: account?.profile.plan, accountPlanAuthority: account?.profile.planAuthority, accountQualification: account?.profile.qualification?.state, accountAvailability: account ? account.profile.qualification?.state === 'QUALIFIED' ? 'AVAILABLE' : 'UNQUALIFIED' : undefined, modelId: this.options.modelId, elapsedMs: event.elapsedMs, active: !['turn.completed'].includes(event.type), cumulative: {inputTokens: input, freshInputTokens: fresh, cachedInputTokens: cached, cacheWriteTokens: cacheWrite, outputTokens: output, totalTokens: total}, context: {tokens: event.context.tokens, limitTokens: event.context.limitTokens ?? this.options.contextLimitTokens ?? null, authority: event.context.authority, source: event.context.source}, cost: {amount: null, currency: null, authority: 'unavailable', source: 'codex_turn_cost_not_exposed_on_exec_jsonl'}, ...(event.contextLifecycle ? {contextLifecycle: event.contextLifecycle} : {})});
    };
    const run = await (this.options.runner ?? runCodexExec)({command, cwd: this.options.cwd, modelId: this.options.modelId, instruction, grantedToolIds, timeoutMs, environment, onTelemetry: emit, signal: tools.signal, ownedExecution: tools.ownedExecution});
    tools.signal?.throwIfAborted(); tools.assertActive();
    const providerCompletedAt = new Date().toISOString();
    if (run.observedItemTypes.includes('file_change')) throw new Error('codex_exec_capability_envelope_violation:file_change');
    const request = parseToolRequest(run.finalMessage);
    tools.assertActive();
    const output = await tools.invoke(request.tool, request.input);
    const responseHash = createHash('sha256').update(run.finalMessage).digest('hex');
    const result = {providerId: this.options.provider.id, accountProfileId: account?.profile.id ?? null, modelId: this.options.modelId, authMode: 'chatgpt', threadId: run.threadId, requestedTool: request.tool, toolOutput: output, responseHash, usage: run.usage, capabilityEnvelope: 'read-only'};
    const startupSources: ContextPacketSource[] = [
      {id: `${recipe.id ?? 'unattributed'}:codex-system`, kind: 'system_instructions', content: 'Return one schema-constrained Agent Control tool request. Do not modify files.', required: true, persistent: true, relevance: 1, provenanceIds: [recipe.fingerprint ?? 'unattributed-recipe']},
      {id: `${recipe.id ?? 'unattributed'}:codex-control`, kind: 'agent_control_instructions', content: 'The requested tool remains subject to the live Agent Control policy gateway.', required: true, persistent: true, relevance: 1, provenanceIds: [recipe.fingerprint ?? 'unattributed-recipe']},
      {id: `${recipe.id ?? 'unattributed'}:codex-tools`, kind: 'tool_schemas', content: JSON.stringify(codexToolRequestSchema(grantedToolIds)), required: true, persistent: true, relevance: 1, provenanceIds: [recipe.fingerprint ?? 'unattributed-recipe']},
      {id: `${recipe.id ?? 'unattributed'}:codex-skills`, kind: 'skills', estimatedTokens: 0, persistent: true, relevance: .8, provenanceIds: (recipe.skills ?? []).flatMap(skill => skill.qualificationEvidence)},
      {id: `${recipe.id ?? 'unattributed'}:codex-task`, kind: 'task_context', content: instruction, required: true, persistent: false, relevance: 1, provenanceIds: recipe.context?.provenanceIds ?? recipe.context?.evidenceIds ?? []},
    ];
    const taskId = recipe.taskId ?? 'unattributed-task';
    const invocation = createInvocationObservation({jobId: recipe.jobId ?? taskId, runId: recipe.runId, taskId, laneId: recipe.authority?.laneId ?? 'unattributed-lane', model: this.options.modelId, provider: this.options.provider.id, accountProfileId: account?.profile.id, harnessProfile: recipe.harness?.profile ?? 'STANDARD', executionStrategy: 'cli.typed-read-only', startedAt, completedAt: providerCompletedAt, startupSources, rawUsage: run.usage, toolIds: [request.tool], contextSourceIds: recipe.context?.sourceIds ?? [], recipeFingerprint: recipe.fingerprint ?? 'unattributed-recipe', contextPacketId: recipe.harness?.contextPacketId, evidenceIds: [`provider_response_sha256:${responseHash}`]});
    return {
      resultRef: JSON.stringify(result), confidence: .8,
      fingerprint: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
      evidence: [`codex_thread:${run.threadId ?? responseHash.slice(0, 16)}`, `provider_response_sha256:${responseHash}`, 'auth_mode:chatgpt', ...(account ? [`account_profile:${account.profile.id}`] : []), 'capability_envelope:read-only', `tool_executed:${request.tool}`],
      invocations: [invocation],
    };
  }
}

export async function probeCodexChatGptAuth(command: string, cwd: string, timeoutMs: number, environment: NodeJS.ProcessEnv = process.env, signal?: AbortSignal, ownedExecution?: OwnedExecution): Promise<CodexChatGptAuth> {
  const result = await captureProcess(command, ['login', 'status'], cwd, timeoutMs, environment, true, undefined, signal, ownedExecution);
  if (result.code !== 0 || !/chatgpt/i.test(`${result.stdout}\n${result.stderr}`)) throw new Error('codex_chatgpt_auth_required');
  return {mode: 'chatgpt'};
}

export async function runCodexExec(request: CodexExecRequest): Promise<CodexExecResult> {
  request.signal?.throwIfAborted();
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-codex-schema-'));
  const schemaFile = path.join(temporary, 'output.schema.json');
  try {
    request.signal?.throwIfAborted();
    fs.writeFileSync(schemaFile, JSON.stringify(request.outputSchema ?? codexToolRequestSchema(request.grantedToolIds)), {mode: 0o600});
    const prompt = request.outputSchema ? request.instruction : `Return one Agent Control tool request as schema-constrained JSON. Put the tool input in input_json as a JSON-encoded string. Do not claim the tool ran. Do not modify files.\n\n${request.instruction}`;
    const startedAt = Date.now(), liveEvents: Record<string, unknown>[] = []; let liveThreadId: string | undefined;
    const result = await captureProcess(request.command, codexReadOnlyStructuredArguments(request, schemaFile, prompt), request.cwd, request.timeoutMs, request.environment, !request.loadUserConfig, line => {
      let event: Record<string, unknown>; try { event = JSON.parse(line) as Record<string, unknown>; } catch { return; }
      liveEvents.push(event); const threadId = typeof event.thread_id === 'string' ? event.thread_id : undefined; if (threadId) liveThreadId = threadId;
      const normalized = normalizeCodex0153TelemetryEvent(event, Date.now() - startedAt, liveThreadId);
      if (normalized) request.onTelemetry?.(normalized);
    }, request.signal, request.ownedExecution, request.executionSession);
    if (result.code !== 0) throw new Error(`codex_exec_failed:${result.code}`);
    const events = liveEvents.length ? liveEvents : result.stdout.split(/\r?\n/).filter(Boolean).map(line => {
      try { return JSON.parse(line) as Record<string, unknown>; } catch { throw new Error('codex_exec_invalid_jsonl'); }
    });
    if (events.some(event => event.type === 'error' || event.type === 'turn.failed')) throw new Error('codex_exec_turn_failed');
    const completed = [...events].reverse().find(event => event.type === 'turn.completed');
    if (!completed) throw new Error('codex_exec_turn_incomplete');
    const agentMessages = events.filter(event => event.type === 'item.completed').map(event => event.item).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))).filter(item => item.type === 'agent_message');
    const finalMessage = agentMessages.at(-1)?.text;
    if (typeof finalMessage !== 'string' || !finalMessage.trim()) throw new Error('codex_exec_missing_final_message');
    const started = events.find(event => event.type === 'thread.started');
    const observedItemTypes = [...new Set(events.map(event => event.item).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))).map(item => String(item.type ?? 'unknown')))];
    const rawUsage = completed.usage;
    const usage = rawUsage && typeof rawUsage === 'object' && !Array.isArray(rawUsage) ? sanitizeUsage(rawUsage as Record<string, unknown>) : undefined;
    return {threadId: typeof started?.thread_id === 'string' ? started.thread_id : undefined, finalMessage, usage, observedItemTypes};
  } finally {
    fs.rmSync(temporary, {recursive: true, force: true});
  }
}

/**
 * Fixed capability envelope for schema-constrained automation. ChatGPT auth is
 * still read from CODEX_HOME, while user/project configuration and Codex-native
 * execution tools cannot silently expand the governed request.
 */
export function codexReadOnlyStructuredArguments(request: Pick<CodexExecRequest, 'modelId' | 'loadUserConfig'>, schemaFile: string, prompt: string) {
  return [
    'exec', '--ephemeral', '--json', '--strict-config', '--sandbox', 'read-only', '--skip-git-repo-check', '--ignore-rules',
    ...(request.loadUserConfig ? [] : ['--ignore-user-config']),
    '--config', 'project_doc_max_bytes=0',
    '--config', 'web_search="disabled"',
    '--config', 'features.shell_tool=false',
    '--config', 'features.unified_exec=false',
    '--config', 'features.multi_agent=false',
    '--config', 'features.browser_use=false',
    '--config', 'features.computer_use=false',
    '--config', 'features.in_app_browser=false',
    '--config', 'features.apps=false',
    '--config', 'features.image_generation=false',
    '--config', 'features.workspace_dependencies=false',
    '--model', request.modelId, '--output-schema', schemaFile, prompt,
  ];
}

/**
 * Normalizes provider-native Codex telemetry without coupling governor policy to
 * Codex. App-server thread usage is marked estimated because the same public
 * field can contain provider-reported usage or a locally recomputed post-compact
 * count and the wire protocol does not expose that distinction.
 */
export function normalizeCodex0153TelemetryEvent(event: Record<string, unknown>, elapsedMs: number, knownThreadId?: string): CodexExecTelemetryEvent | null {
  const threadId = stringValue(event.thread_id) ?? knownThreadId;
  if (event.type === 'thread.started') return {type: 'thread.started', threadId, elapsedMs, context: {tokens: null, authority: 'unavailable', source: 'codex_exec_jsonl_no_current_context'}};
  if (event.type === 'turn.completed') return {type: 'turn.completed', threadId, elapsedMs, usage: recordValue(event.usage) ? sanitizeUsage(recordValue(event.usage)!) : undefined, context: {tokens: null, authority: 'unavailable', source: 'codex_exec_jsonl_no_current_context'}};
  const params = recordValue(event.params), method = stringValue(event.method);
  if (method === 'thread/tokenUsage/updated' && params) {
    const tokenUsage = recordValue(params.tokenUsage) ?? recordValue(params.token_usage), totalUsage = recordValue(tokenUsage?.total), lastUsage = recordValue(tokenUsage?.last);
    if (!tokenUsage || !totalUsage || !lastUsage) return null;
    const limitTokens = numeric(tokenUsage.modelContextWindow ?? tokenUsage.model_context_window);
    return {type: 'thread.token_usage.updated', threadId: stringValue(params.threadId) ?? stringValue(params.thread_id) ?? threadId, elapsedMs, usage: normalizeUsageBreakdown(totalUsage), context: {tokens: usageNumber(lastUsage, 'totalTokens', 'total_tokens'), limitTokens, authority: 'estimated', source: 'codex_app_server_thread_usage_mixed_provider_or_recomputed'}};
  }
  const item = params ? recordValue(params.item) : undefined;
  if ((method === 'item/completed' || method === 'item/started') && item?.type === 'contextCompaction') return {type: 'context.compacted', threadId: stringValue(params?.threadId) ?? threadId, elapsedMs, context: {tokens: null, authority: 'unavailable', source: 'codex_context_compaction_event_has_no_post_compact_count'}, ...(method === 'item/completed' ? {contextLifecycle: {kind: 'COMPACTION', contextId: stringValue(item.id), authority: 'authoritative', source: 'codex_app_server_contextCompaction'}} : {})};
  return null;
}

/**
 * Safe, human-readable projection of lines emitted by the genuine Codex CLI.
 * Reasoning-class payloads remain private while lifecycle, public agent output,
 * and numeric usage stay observable in the attached execution session.
 */
export function codexExecutionSessionOutputLine(stream: 'stdout' | 'stderr', line: string): string | undefined {
  if (!line.trim()) return undefined;
  if (stream === 'stderr') return `Codex diagnostic: ${redactSensitiveText(line).slice(0, 4_096)}`;
  let event: Record<string, unknown>;
  try { event = JSON.parse(line) as Record<string, unknown>; }
  catch { return 'Codex emitted a non-JSON lifecycle line; content withheld.'; }
  const type = stringValue(event.type) ?? 'unknown';
  if (type === 'thread.started') return `Codex thread started${stringValue(event.thread_id) ? ` · ${stringValue(event.thread_id)}` : ''}`;
  if (type === 'turn.started') return 'Codex turn started';
  if (type === 'turn.completed') return `Codex turn completed · usage ${JSON.stringify(sanitizeUsage(recordValue(event.usage) ?? {}))}`;
  if (type === 'turn.failed' || type === 'error') return `Codex ${type}; provider detail retained only in governed failure evidence.`;
  const item = recordValue(event.item), itemType = stringValue(item?.type) ?? 'unknown-item';
  if (type === 'item.started') return itemType === 'reasoning' ? 'Codex reasoning started · private content withheld' : `Codex ${itemType} started`;
  if (type === 'item.completed') {
    if (itemType === 'reasoning') return 'Codex reasoning completed · private content withheld';
    if (itemType === 'agent_message') {
      const text = stringValue(item?.text);
      return text ? `Codex agent output:\n${redactSensitiveText(text)}` : 'Codex agent output completed';
    }
    return `Codex ${itemType} completed`;
  }
  return `Codex lifecycle event · ${type}`;
}

function normalizeUsageBreakdown(value: Record<string, unknown>) {
  return {input_tokens: usageNumber(value, 'inputTokens', 'input_tokens'), output_tokens: usageNumber(value, 'outputTokens', 'output_tokens'), total_tokens: usageNumber(value, 'totalTokens', 'total_tokens'), cached_input_tokens: usageNumber(value, 'cachedInputTokens', 'cached_input_tokens'), cache_write_tokens: usageNumber(value, 'cacheWriteTokens', 'cache_write_tokens'), reasoning_output_tokens: usageNumber(value, 'reasoningOutputTokens', 'reasoning_output_tokens')};
}

function usageNumber(value: Record<string, unknown>, camel: string, snake: string) { return numeric(value[camel] ?? value[snake]); }
function recordValue(value: unknown): Record<string, unknown> | undefined { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function stringValue(value: unknown) { return typeof value === 'string' && value ? value : undefined; }

/** Runs Codex against one registry-selected Responses-compatible provider in an isolated CODEX_HOME. */
export async function runCodexWithRegisteredModel(request: CodexExecRequest, provider: ProviderConfig, model: ModelConfig, environment: NodeJS.ProcessEnv = process.env, runner: (request: CodexExecRequest) => Promise<CodexExecResult> = runCodexExec) {
  if (model.provider !== provider.id) throw new Error('model_provider_mismatch');
  const materialized = materializeCodexModelConfig(provider, model, environment);
  try { return await runner({...request, modelId: model.providerModel, environment: materialized.environment, loadUserConfig: true}); }
  finally { materialized.cleanup(); }
}

function sanitizeUsage(value: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'number' && Number.isFinite(item) && item >= 0) sanitized[key] = item;
    else if (item && typeof item === 'object' && !Array.isArray(item)) sanitized[key] = sanitizeUsage(item as Record<string, unknown>);
  }
  return sanitized;
}

function codexToolRequestSchema(grantedToolIds: string[]) { return {type: 'object', properties: {tool: {type: 'string', enum: grantedToolIds}, input_json: {type: 'string'}}, required: ['tool', 'input_json'], additionalProperties: false}; }

async function captureProcess(command: string, args: string[], cwd: string, timeoutMs: number, environment: NodeJS.ProcessEnv = process.env, stripApiKeys = true, onStdoutLine?: (line: string) => void, externalSignal?: AbortSignal, ownedExecution?: OwnedExecution, executionSession?: OwnedProcessRequest['session']): Promise<{code: number; stdout: string; stderr: string}> {
  const env = {...environment}; if (stripApiKeys) { delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY; }
  const timeout = new AbortController(), timer = setTimeout(() => timeout.abort(new Error('codex_exec_timeout')), Math.max(1, timeoutMs)), signal = externalSignal ? AbortSignal.any([externalSignal, timeout.signal]) : timeout.signal, owned = ownedExecution ?? new OwnedProcessManager();
  try {
    const result = await owned.runProcess({command, args, cwd, env, maxOutputBytes: 2_000_000, onStdoutLine, ...(executionSession ? {session: executionSession} : {})}, signal);
    return {code: result.exitCode ?? -1, stdout: result.stdout, stderr: result.stderr};
  } catch (error) {
    const cleanup = await owned.terminateAll(timeout.signal.aborted ? 'codex_exec_timeout' : 'codex_exec_cancelled');
    const failure = error instanceof Error ? error : new Error(String(error));
    if (cleanup.outcome !== 'confirmed') Object.assign(failure, {cleanup});
    throw failure;
  } finally { clearTimeout(timer); }
}

function numeric(value: unknown) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null; }
function cachedInput(usage: Record<string, unknown>) { return numeric(usage.cached_input_tokens ?? usage.cachedInputTokens ?? recordValue(usage.input_tokens_details)?.cached_tokens ?? recordValue(usage.prompt_tokens_details)?.cached_tokens); }
function cacheWriteInput(usage: Record<string, unknown>) { return numeric(usage.cache_write_tokens ?? usage.cacheWriteTokens ?? usage.cache_creation_input_tokens ?? recordValue(usage.input_tokens_details)?.cache_write_tokens); }

function parseToolRequest(content: string): ToolRequest {
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error('codex_exec_tool_request_invalid_json'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('codex_exec_tool_request_invalid');
  const request = parsed as Record<string, unknown>;
  if (typeof request.tool !== 'string' || !request.tool.trim()) throw new Error('codex_exec_tool_request_missing_tool');
  if (Object.keys(request).some(key => !['tool', 'input_json'].includes(key))) throw new Error('codex_exec_tool_request_unknown_field');
  if (typeof request.input_json !== 'string') throw new Error('codex_exec_tool_request_input_missing');
  let input: unknown;
  try { input = JSON.parse(request.input_json); } catch { throw new Error('codex_exec_tool_request_input_invalid_json'); }
  return {tool: request.tool, input};
}

import {spawn} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {SparkConfig} from './config.js';
import {ContextPacketBuilder, type ContextPacket, type ContextPacketSource} from './harness-efficiency.js';
import type {ModelRegistry, ModelRouteDecision} from './model-registry.js';
import {changedIgnoredPaths, inspectGitIgnoredState, inspectGitMutationSurface} from './git-mutation-surface.js';

export type ExecutionClass = 'LOCAL' | 'SPARK' | 'STANDARD' | 'FRONTIER';
export type TrivialTaskKind = 'documentation' | 'configuration' | 'symbol-rename' | 'single-file-bug' | 'lint' | 'test-addition' | 'repository-search';
export type SparkRejectionReason =
  | 'spark-disabled' | 'spark-unavailable' | 'profile-not-thin' | 'task-not-trivial' | 'risk-not-low'
  | 'non-deterministic-verification' | 'file-limit' | 'line-limit' | 'protected-path' | 'sensitive-task'
  | 'multi-file-task' | 'deep-context-required' | 'model-route-unavailable';

export interface TrivialWorkRequest {
  id: string;
  parcelId: string;
  runId: string;
  sessionId: string;
  description: string;
  kind?: TrivialTaskKind;
  harnessProfile: 'THIN' | 'STANDARD' | 'DEEP';
  risk: 'low' | 'medium' | 'high';
  files: string[];
  estimatedChangedLines: number;
  deterministicVerifier: string[];
  signals?: Array<'ambiguous' | 'architecture' | 'security' | 'authentication' | 'authorization' | 'data-migration' | 'governance' | 'release' | 'deployment' | 'production' | 'protected-configuration' | 'deep-context'>;
  contextSources: ContextPacketSource[];
}

export interface SparkAvailability {
  available: boolean;
  model: string;
  codexVersion: string | null;
  authMode: 'chatgpt' | 'unknown';
  checkedAt: string;
  reason: string;
  evidence: string[];
  latencyMs: number | null;
}

export interface SparkClassification {
  executionClass: 'SPARK' | 'STANDARD';
  eligible: boolean;
  reasons: SparkRejectionReason[];
  contextPacket: ContextPacket | null;
}

export interface SparkBaton {
  schema: 'agent-control.fast-execution-baton/v1';
  taskId: string;
  task: string;
  scope: {files: string[]; maximumChangedLines: number};
  forbidden: string[];
  contextPacketId: string;
  contextHash: string;
  verifierCommands: string[];
  completion: string;
}

export interface FastExecutionResult {
  status: 'SUCCEEDED' | 'FAILED' | 'ESCALATE';
  summary: string;
  touchedFiles: string[];
  changedLines: number;
  usage?: Record<string, unknown>;
  evidence: string[];
  confidence?: number;
  requestedMoreContext?: boolean;
  actualModel?: string;
  actualProviderId?: string;
  verificationPassed?: boolean;
  filesRead?: string[];
}

export interface SparkAttemptTelemetry {
  schema: 'agent-control.fast-execution-attempt/v1';
  id: string;
  taskId: string;
  parcelId: string;
  runId: string;
  sessionId: string;
  executionClass: 'SPARK';
  taskClassification: TrivialTaskKind | 'unclassified';
  harnessProfile: TrivialWorkRequest['harnessProfile'];
  requestedModel: string;
  actualModel: string | null;
  providerId: string | null;
  availabilityReason: string;
  classificationReasons: string[];
  selectionReasons: string[];
  contextPacketId: string | null;
  parentContextTokens: number;
  delegatedContextTokens: number;
  attempt: number;
  startedAt: string;
  completedAt: string;
  elapsedMs: number;
  outcome: 'VERIFIED' | 'REJECTED' | 'FAILED' | 'ESCALATED';
  verification: 'PASS' | 'FAIL' | 'NOT_RUN';
  escalationReason: string | null;
  touchedFiles: string[];
  filesRead: string[] | null;
  changedLines: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cost: number | null;
  currency: string | null;
  successorExecutionClass: 'STANDARD' | null;
  successorModel: string | null;
  finalVerifiedOutcome: boolean | null;
  evidence: string[];
}

export interface FastExecutionLedgerPort {record(attempt: SparkAttemptTelemetry): void; list(): SparkAttemptTelemetry[];}

export class FileFastExecutionLedger implements FastExecutionLedgerPort {
  private readonly attempts: SparkAttemptTelemetry[];
  constructor(readonly file: string) {
    if (!fs.existsSync(file)) this.attempts = [];
    else { const value = JSON.parse(fs.readFileSync(file, 'utf8')) as {schema?: string; attempts?: SparkAttemptTelemetry[]}; if (value.schema !== 'agent-control.fast-execution-ledger/v1' || !Array.isArray(value.attempts)) throw new Error('fast_execution_ledger_unsupported'); this.attempts = value.attempts; }
  }
  record(attempt: SparkAttemptTelemetry) { this.attempts.push(structuredClone(attempt)); fs.mkdirSync(path.dirname(this.file), {recursive: true}); const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`; try { fs.writeFileSync(temporary, `${JSON.stringify({schema: 'agent-control.fast-execution-ledger/v1', attempts: this.attempts}, null, 2)}\n`, {mode: 0o600, flag: 'wx'}); fs.renameSync(temporary, this.file); } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } }
  list() { return this.attempts.map(value => structuredClone(value)); }
}

export interface FastExecutionOutcome {
  route: ModelRouteDecision | null;
  classification: SparkClassification;
  result: FastExecutionResult | null;
  telemetry: SparkAttemptTelemetry;
  escalatedResult?: FastExecutionResult;
}

export interface FastExecutionRunner {
  execute(input: {model: string; providerId: string; baton: SparkBaton; attempt: number}): Promise<FastExecutionResult>;
}

/**
 * Runs one Spark attempt in a disposable, initially-clean Git worktree. Agent
 * Control chooses the model explicitly; Codex subagents are disabled so the
 * configured one-attempt policy cannot fan out behind the control boundary.
 */
export class CodexFastExecutionRunner implements FastExecutionRunner {
  constructor(readonly cwd: string, readonly command = 'codex', readonly timeoutMs = 120_000) {
    if (!path.isAbsolute(cwd)) throw new Error('spark_workspace_must_be_absolute');
  }
  async execute(input: {model: string; providerId: string; baton: SparkBaton; attempt: number}): Promise<FastExecutionResult> {
    if (input.attempt !== 1) throw new Error('spark_retry_forbidden');
    const before = await capture('git', ['status', '--porcelain=v1'], this.cwd, 10_000); if (before.code !== 0) throw new Error('spark_workspace_git_required'); if (before.stdout.trim()) throw new Error('spark_workspace_not_clean');
    const ignoredBefore = await inspectGitIgnoredState(this.cwd, ['node_modules']);
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-spark-')), schema = path.join(temporary, 'result.schema.json');
    try {
      fs.writeFileSync(schema, JSON.stringify({type: 'object', properties: {status: {type: 'string', enum: ['SUCCEEDED','FAILED','ESCALATE']}, summary: {type: 'string'}, confidence: {type: 'number', minimum: 0, maximum: 1}, requestedMoreContext: {type: 'boolean'}}, required: ['status','summary','confidence','requestedMoreContext'], additionalProperties: false}), {mode: 0o600});
      const prompt = `Execute this Agent Control baton exactly. Stay inside its file and line scope. Do not release, deploy, access credentials, alter policy, or expand scope. Run only the listed deterministic verifier commands. If anything is ambiguous, outside scope, or cannot be verified, return ESCALATE.\n\n${JSON.stringify(input.baton)}`;
      const run = await capture(this.command, ['exec', '--ephemeral', '--json', '--sandbox', 'workspace-write', '--ignore-user-config', '-c', 'features.multi_agent=false', '--model', input.model, '--output-schema', schema, prompt], this.cwd, this.timeoutMs);
      const events = run.stdout.split(/\r?\n/).filter(Boolean).flatMap(line => { try { return [JSON.parse(line) as Record<string, unknown>]; } catch { return []; } });
      const completed = [...events].reverse().find(event => event.type === 'turn.completed'), message = [...events].reverse().map(event => event.item).find(item => item && typeof item === 'object' && !Array.isArray(item) && (item as Record<string, unknown>).type === 'agent_message') as Record<string, unknown> | undefined;
      let output: {status: FastExecutionResult['status']; summary: string; confidence: number; requestedMoreContext: boolean} = {status: 'FAILED', summary: run.code === 0 ? 'spark_result_missing' : `codex_exec_failed:${run.code}`, confidence: 0, requestedMoreContext: false};
      if (typeof message?.text === 'string') try { const parsed = JSON.parse(message.text) as typeof output; if (['SUCCEEDED','FAILED','ESCALATE'].includes(parsed.status) && typeof parsed.summary === 'string' && typeof parsed.confidence === 'number' && typeof parsed.requestedMoreContext === 'boolean') output = parsed; } catch { output = {...output, summary: 'spark_result_invalid_json'}; }
      const mutations = await inspectGitMutationSurface(this.cwd), ignoredAfter = await inspectGitIgnoredState(this.cwd, ['node_modules']), ignoredChanges = changedIgnoredPaths(ignoredBefore, ignoredAfter);
      const touchedFiles = [...new Set([...mutations.touchedFiles, ...ignoredChanges])].sort(), changedLines = mutations.changedLines + ignoredChanges.length * 1_000_000;
      const usage = completed?.usage && typeof completed.usage === 'object' && !Array.isArray(completed.usage) ? completed.usage as Record<string, unknown> : undefined;
      const evidence = [`model:${input.model}`, `provider:${input.providerId}`, `baton:${input.baton.contextHash}`, `diff-sha256:${mutations.sha256}`, `ignored-state-before:${ignoredBefore.sha256}`, `ignored-state-after:${ignoredAfter.sha256}`];
      return {...output, touchedFiles, changedLines, usage, evidence, actualModel: input.model, actualProviderId: input.providerId};
    } finally { fs.rmSync(temporary, {recursive: true, force: true}); }
  }
}

export interface IndependentVerifier {
  verify(input: {request: TrivialWorkRequest; result: FastExecutionResult; baton: SparkBaton}): Promise<{passed: boolean; evidence: string[]; reason?: string}>;
}

const SENSITIVE = new Set<NonNullable<TrivialWorkRequest['signals']>[number]>(['architecture', 'security', 'authentication', 'authorization', 'data-migration', 'governance', 'release', 'deployment', 'production', 'protected-configuration']);
const PROTECTED_PATH = /(?:^|\/)(?:\.git|\.github\/workflows|auth|secrets?|credentials?|migrations?|deploy|release)(?:\/|$)|(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i;
const DEFAULTS: Required<SparkConfig> = {enabled: false, model: 'gpt-5.3-codex-spark', modelRole: 'fast-execution', maximumFiles: 1, maximumChangedLines: 80, maximumAttempts: 1, maximumSubagents: 0, maximumContextTokens: 2_048, verificationRequired: true};

export function effectiveSparkConfig(config?: SparkConfig): Required<SparkConfig> { return {...DEFAULTS, ...(config ?? {})}; }

export function classifyTrivialWork(request: TrivialWorkRequest, config?: SparkConfig, availability?: SparkAvailability, builder = new ContextPacketBuilder()): SparkClassification {
  const policy = effectiveSparkConfig(config), reasons: SparkRejectionReason[] = [];
  if (!policy.enabled) reasons.push('spark-disabled');
  if (!availability?.available) reasons.push('spark-unavailable');
  if (request.harnessProfile !== 'THIN') reasons.push('profile-not-thin');
  if (!request.kind) reasons.push('task-not-trivial');
  if (request.risk !== 'low') reasons.push('risk-not-low');
  if (!request.deterministicVerifier.length) reasons.push('non-deterministic-verification');
  if (request.files.length > policy.maximumFiles) reasons.push(request.files.length > 1 ? 'multi-file-task' : 'file-limit');
  if (request.estimatedChangedLines > policy.maximumChangedLines) reasons.push('line-limit');
  if (request.files.some(file => PROTECTED_PATH.test(file))) reasons.push('protected-path');
  if ((request.signals ?? []).some(signal => SENSITIVE.has(signal))) reasons.push('sensitive-task');
  if ((request.signals ?? []).includes('ambiguous')) reasons.push('task-not-trivial');
  if ((request.signals ?? []).includes('deep-context')) reasons.push('deep-context-required');
  let contextPacket: ContextPacket | null = null;
  if (!reasons.length) {
    try { contextPacket = builder.build('THIN', request.contextSources, {availableContextTokens: policy.maximumContextTokens}); }
    catch { reasons.push('deep-context-required'); }
  }
  return {executionClass: reasons.length ? 'STANDARD' : 'SPARK', eligible: reasons.length === 0, reasons: [...new Set(reasons)], contextPacket};
}

export function createSparkBaton(request: TrivialWorkRequest, packet: ContextPacket, config?: SparkConfig): SparkBaton {
  const policy = effectiveSparkConfig(config);
  return {
    schema: 'agent-control.fast-execution-baton/v1', taskId: request.id, task: request.description,
    scope: {files: [...request.files], maximumChangedLines: policy.maximumChangedLines},
    forbidden: ['expand scope', 'touch unlisted files', 'change architecture or policy', 'access credentials', 'release or deploy', 'skip verification'],
    contextPacketId: packet.id, contextHash: createHash('sha256').update(JSON.stringify(packet.entries)).digest('hex'),
    verifierCommands: [...request.deterministicVerifier], completion: 'Only complete after the independent verifier passes; otherwise return ESCALATE.',
  };
}

export class FastExecutionCoordinator {
  constructor(
    readonly models: ModelRegistry,
    readonly availability: SparkAvailability,
    readonly runner: FastExecutionRunner,
    readonly verifier: IndependentVerifier,
    readonly config?: SparkConfig,
    readonly standardRunner?: FastExecutionRunner,
    readonly clock: () => Date = () => new Date(),
    readonly ledger?: FastExecutionLedgerPort,
  ) {}

  async execute(request: TrivialWorkRequest, nodeId: string): Promise<FastExecutionOutcome> {
    const started = this.clock(), policy = effectiveSparkConfig(this.config), classification = classifyTrivialWork(request, policy, this.availability);
    if (!classification.eligible || !classification.contextPacket) return this.finish({route: null, classification, result: null, telemetry: this.telemetry(request, started, null, classification, null, 'REJECTED', 'NOT_RUN', classification.reasons.join(','), [])});
    let route: ModelRouteDecision;
    try { route = this.models.route({modelRole: policy.modelRole, nodeId, requiredCapabilities: ['trivial.coding'], allowFallback: false}); }
    catch {
      const rejected = {...classification, executionClass: 'STANDARD' as const, eligible: false, reasons: [...classification.reasons, 'model-route-unavailable' as const]};
      return this.finish({route: null, classification: rejected, result: null, telemetry: this.telemetry(request, started, null, rejected, null, 'REJECTED', 'NOT_RUN', 'model-route-unavailable', [])});
    }
    if (route.providerModel !== policy.model) throw new Error(`spark_model_identity_mismatch:${route.providerModel}`);
    const baton = createSparkBaton(request, classification.contextPacket, policy);
    let result: FastExecutionResult;
    try { result = await this.runner.execute({model: route.providerModel, providerId: route.providerId, baton, attempt: 1}); }
    catch (error) { result = {status: 'FAILED', summary: (error as Error).message, touchedFiles: [], changedLines: 0, evidence: []}; }
    const violation = scopeViolation(request, result, policy);
    const verification = result.status === 'SUCCEEDED' && !violation ? await this.verifier.verify({request, result, baton}) : {passed: false, evidence: [] as string[], reason: violation ?? result.status.toLowerCase()};
    if (result.status === 'SUCCEEDED' && verification.passed) {
      const evidence = [...new Set([...result.evidence, ...verification.evidence])];
      return this.finish({route, classification, result: {...result, evidence, verificationPassed: true}, telemetry: this.telemetry(request, started, route, classification, result, 'VERIFIED', 'PASS', null, evidence)});
    }
    const escalationReason = violation ?? verification.reason ?? (result.requestedMoreContext ? 'context-deficiency' : result.status === 'ESCALATE' ? 'spark-requested-escalation' : 'spark-failure');
    const telemetry = this.telemetry(request, started, route, classification, result, 'ESCALATED', 'FAIL', escalationReason, verification.evidence);
    if (!this.standardRunner) return this.finish({route, classification, result, telemetry});
    const escalatedResult = await this.standardRunner.execute({model: 'STANDARD', providerId: 'agent-control-policy', baton, attempt: 1});
    telemetry.successorModel = escalatedResult.actualModel ?? null; telemetry.finalVerifiedOutcome = escalatedResult.verificationPassed ?? null;
    return this.finish({route, classification, result, telemetry, escalatedResult});
  }

  private telemetry(request: TrivialWorkRequest, started: Date, route: ModelRouteDecision | null, classification: SparkClassification, result: FastExecutionResult | null, outcome: SparkAttemptTelemetry['outcome'], verification: SparkAttemptTelemetry['verification'], escalationReason: string | null, verifierEvidence: string[]): SparkAttemptTelemetry {
    const completed = this.clock(), usage = usageFields(result?.usage);
    const successorExecutionClass = outcome === 'VERIFIED' ? null : 'STANDARD';
    return {schema: 'agent-control.fast-execution-attempt/v1', id: `fast-attempt:${randomUUID()}`, taskId: request.id, parcelId: request.parcelId, runId: request.runId, sessionId: request.sessionId, executionClass: 'SPARK', taskClassification: request.kind ?? 'unclassified', harnessProfile: request.harnessProfile, requestedModel: effectiveSparkConfig(this.config).model, actualModel: route?.providerModel ?? null, providerId: route?.providerId ?? null, availabilityReason: this.availability.reason, classificationReasons: classification.reasons, selectionReasons: classification.eligible ? [`profile:${request.harnessProfile}`, `kind:${request.kind}`, `risk:${request.risk}`, 'deterministic-verifier', 'bounded-scope'] : [], contextPacketId: classification.contextPacket?.id ?? null, parentContextTokens: request.contextSources.reduce((sum, value) => sum + (value.estimatedTokens ?? 0), 0), delegatedContextTokens: classification.contextPacket?.estimatedTokens ?? 0, attempt: result ? 1 : 0, startedAt: started.toISOString(), completedAt: completed.toISOString(), elapsedMs: Math.max(0, completed.getTime() - started.getTime()), outcome, verification, escalationReason, touchedFiles: [...(result?.touchedFiles ?? [])], filesRead: result?.filesRead ? [...result.filesRead] : null, changedLines: result?.changedLines ?? 0, ...usage, successorExecutionClass, successorModel: null, finalVerifiedOutcome: outcome === 'VERIFIED' ? true : null, evidence: [...new Set([...(result?.evidence ?? []), ...verifierEvidence]) ]};
  }
  private finish<T extends FastExecutionOutcome>(outcome: T) { this.ledger?.record(outcome.telemetry); return outcome; }
}

export async function probeCodexSparkAvailability(input: {command?: string; model?: string; cwd: string; timeoutMs?: number; clock?: () => Date}): Promise<SparkAvailability> {
  const command = input.command ?? 'codex', model = input.model ?? DEFAULTS.model, timeoutMs = input.timeoutMs ?? 45_000, clock = input.clock ?? (() => new Date()), started = clock();
  const version = await capture(command, ['--version'], input.cwd, Math.min(timeoutMs, 10_000));
  const auth = await capture(command, ['login', 'status'], input.cwd, Math.min(timeoutMs, 10_000));
  if (version.code !== 0 || auth.code !== 0 || !/chatgpt/i.test(`${auth.stdout}\n${auth.stderr}`)) return {available: false, model, codexVersion: firstLine(version.stdout), authMode: 'unknown', checkedAt: clock().toISOString(), reason: 'codex-chatgpt-auth-unavailable', evidence: [], latencyMs: clock().getTime() - started.getTime()};
  const run = await capture(command, ['exec', '--ephemeral', '--json', '--sandbox', 'read-only', '--ignore-user-config', '--model', model, 'Return exactly SPARK_AVAILABLE and do not use tools.'], input.cwd, timeoutMs);
  const available = run.code === 0 && run.stdout.split(/\r?\n/).some(line => { try { const event = JSON.parse(line) as {type?: string; item?: {type?: string; text?: string}}; return event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text?.trim() === 'SPARK_AVAILABLE'; } catch { return false; } });
  return {available, model, codexVersion: firstLine(version.stdout), authMode: 'chatgpt', checkedAt: clock().toISOString(), reason: available ? 'authenticated-bounded-codex-exec-succeeded' : `authenticated-bounded-codex-exec-failed:${run.code}`, evidence: available ? [`codex-version:${firstLine(version.stdout)}`, `model:${model}`, 'response:SPARK_AVAILABLE'] : [], latencyMs: clock().getTime() - started.getTime()};
}

function scopeViolation(request: TrivialWorkRequest, result: FastExecutionResult, policy: Required<SparkConfig>) {
  if (result.touchedFiles.some(file => !request.files.includes(file))) return 'unapproved-file-touched';
  if (result.touchedFiles.length > policy.maximumFiles) return 'file-limit-exceeded';
  if (result.changedLines > policy.maximumChangedLines) return 'line-limit-exceeded';
  if ((result.confidence ?? 1) < .8) return 'low-confidence';
  return null;
}

function usageFields(usage?: Record<string, unknown>) {
  const number = (...keys: string[]) => { for (const key of keys) if (typeof usage?.[key] === 'number') return usage[key] as number; return null; };
  return {inputTokens: number('input_tokens', 'inputTokens'), outputTokens: number('output_tokens', 'outputTokens'), cost: number('cost', 'total_cost'), currency: typeof usage?.currency === 'string' ? usage.currency : null};
}
function firstLine(value: string) { return value.trim().split(/\r?\n/, 1)[0] || null; }
function capture(command: string, args: string[], cwd: string, timeoutMs: number): Promise<{code: number; stdout: string; stderr: string}> {
  return new Promise(resolve => {
    const env = {...process.env}; delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY;
    const child = spawn(command, args, {cwd, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']}); let stdout = '', stderr = '', done = false;
    const finish = (code: number) => { if (done) return; done = true; clearTimeout(timer); resolve({code, stdout, stderr}); };
    child.stdout.on('data', value => { stdout = `${stdout}${String(value)}`.slice(-2_000_000); }); child.stderr.on('data', value => { stderr = `${stderr}${String(value)}`.slice(-2_000_000); });
    child.once('error', () => finish(-1)); child.once('close', code => finish(code ?? -1)); const timer = setTimeout(() => { child.kill(); finish(-1); }, timeoutMs);
  });
}

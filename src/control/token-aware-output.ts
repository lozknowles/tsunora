import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {ExecutionRecipe, ToolDefinition} from './adaptive-harness.js';
import type {RawToolHandler, ToolResultInterceptor} from './harness-dispatch.js';
import {capabilityId} from './capabilities.js';

export const TOKEN_AWARE_OUTPUT_SCHEMA = 'agent-control.token-aware-output/v1' as const;
export const COMMAND_RESULT_SCHEMA = 'agent-control.command-result/v1' as const;
export type OutputDisposition = 'COMPLETE' | 'COMPACTED' | 'TRUNCATED' | 'ARTIFACT_ONLY';
export type OutputLevel = 0 | 1 | 2 | 3;

export interface OutputAuthorityScope {
  taskId: string;
  laneId: string;
  workerId: string;
  leaseGeneration: number;
  ownershipGeneration: number;
  jobId?: string;
  runId?: string;
  providerId?: string;
  modelId?: string;
}

export interface CommandResultEnvelope {
  schema: typeof COMMAND_RESULT_SCHEMA;
  command: string;
  args: string[];
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  startedAt: string;
  completedAt: string;
  backend: string;
  nodeId?: string;
  timedOut?: boolean;
  cancelled?: boolean;
  stdoutTruncated?: boolean;
  stderrTruncated?: boolean;
  semantic?: {adapter: 'ripgrep'; query: string};
  availableContextTokens?: number;
}

export interface TokenAwareOutputPolicy {
  completeMaxLines: number;
  completeMaxBytes: number;
  completeMaxTokens: number;
  completeMaxMatches: number;
  completeMaxFiles: number;
  indexMaxFiles: number;
  indexMaxLinesPerFile: number;
  genericHeadLines: number;
  genericTailLines: number;
  artifactOnlyAboveReturnedTokens: number;
  maxCaptureBytesPerStream: number;
  retentionSeconds: number;
  contextBudgetFraction: number;
  minimumCompleteTokens: number;
  maximumExpansionContextLines: number;
}

export type TokenAwareOutputPolicyInput = Partial<TokenAwareOutputPolicy>;

export const DEFAULT_TOKEN_AWARE_OUTPUT_POLICY: TokenAwareOutputPolicy = Object.freeze({
  completeMaxLines: 48,
  completeMaxBytes: 12 * 1024,
  completeMaxTokens: 4_096,
  completeMaxMatches: 40,
  completeMaxFiles: 8,
  indexMaxFiles: 160,
  indexMaxLinesPerFile: 120,
  genericHeadLines: 20,
  genericTailLines: 20,
  artifactOnlyAboveReturnedTokens: 16_384,
  maxCaptureBytesPerStream: 64 * 1024 * 1024,
  retentionSeconds: 60 * 60,
  contextBudgetFraction: .5,
  minimumCompleteTokens: 512,
  maximumExpansionContextLines: 10,
});

export interface OutputSizeMetrics {
  originalBytes: number;
  originalLines: number;
  estimatedOriginalTokens: number;
  returnedBytes: number;
  returnedLines: number;
  estimatedReturnedTokens: number;
  estimatedTokensAvoided: number;
  compressionRatio: number;
}

export interface RipgrepFileIndex {
  path: string;
  lines: number[];
  matches: number;
  binary: boolean;
  linesOmitted?: number;
}

export interface RipgrepSearchSummary {
  query: string;
  filesSearched?: number;
  filesWithMatches: number;
  totalMatches: number;
  files: RipgrepFileIndex[];
  indexComplete?: boolean;
  filesOmitted?: number;
}

export interface OutputRepresentation {
  level: OutputLevel;
  kind: 'summary' | 'index' | 'selected_context' | 'full_artifact';
  estimatedTokens: number;
  available: boolean;
  authoritative: boolean;
}

export interface TokenAwareCommandOutput {
  schema: typeof TOKEN_AWARE_OUTPUT_SCHEMA;
  handle: string;
  disposition: OutputDisposition;
  level: OutputLevel;
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  cancelled: boolean;
  notices: string[];
  search?: RipgrepSearchSummary;
  authoritative: {
    sha256: string;
    stdoutSha256: string;
    available: boolean;
    expiresAt: string;
  };
  metrics: OutputSizeMetrics;
  representations: OutputRepresentation[];
  provenance: {
    derivedFrom: string;
    command: string;
    args: string[];
    cwd: string;
    backend: string;
    nodeId?: string;
    startedAt: string;
    completedAt: string;
    scope: OutputAuthorityScope;
  };
}

export type OutputExpansionMode = 'match' | 'matches' | 'file' | 'files' | 'range' | 'all';
export interface OutputExpansionRequest {
  mode: OutputExpansionMode;
  file?: string;
  files?: string[];
  lines?: number[];
  startLine?: number;
  endLine?: number;
  contextLines?: number;
}

export interface OutputExpansionResult extends Omit<TokenAwareCommandOutput, 'search' | 'representations'> {
  selection: OutputExpansionRequest;
  selectionComplete: boolean;
}

interface RipgrepCapturedRecord {
  path: string;
  line: number;
  kind: 'match' | 'context';
  text: string;
  matches: number;
  binary: boolean;
}

interface StoredOutputRecord {
  version: 1;
  handle: string;
  kind: 'ripgrep' | 'generic';
  createdAt: string;
  expiresAt: string;
  scope: OutputAuthorityScope;
  result: CommandResultEnvelope;
  authoritativeSha256: string;
  stdoutSha256: string;
  authoritativeAvailable: boolean;
  disposition: OutputDisposition;
  initialLevel: OutputLevel;
  initialStdout: string;
  initialReturnedBytes: number;
  initialReturnedLines: number;
  initialReturnedTokens: number;
  expansionReturnedBytes: number;
  expansionReturnedTokens: number;
  expansionRequests: number;
  fullResultRequests: number;
  originalBytes: number;
  originalLines: number;
  originalTokens: number;
  search?: RipgrepSearchSummary;
  ripgrepRecords?: RipgrepCapturedRecord[];
}

type StoredOutputMetadata = Omit<StoredOutputRecord, 'result' | 'search' | 'ripgrepRecords' | 'initialStdout'> & {
  command: string;
  backend: string;
  nodeId?: string;
  exitCode: number;
};

export interface SafeOutputRecord {
  handle: string;
  kind: 'ripgrep' | 'generic';
  createdAt: string;
  expiresAt: string;
  disposition: OutputDisposition;
  level: OutputLevel;
  command: string;
  backend: string;
  nodeId?: string;
  exitCode: number;
  scope: OutputAuthorityScope;
  authoritativeSha256: string;
  authoritativeAvailable: boolean;
  metrics: OutputSizeMetrics & {expansionRequests: number; fullResultRequests: number; expansionReturnedTokens: number};
}

export interface CommandResultStore {
  put(record: StoredOutputRecord): void;
  get(handle: string): StoredOutputRecord | undefined;
  update(record: StoredOutputRecord): void;
  listMetadata(): StoredOutputMetadata[];
}

export class MemoryCommandResultStore implements CommandResultStore {
  private readonly records = new Map<string, StoredOutputRecord>();
  put(record: StoredOutputRecord) { if (this.records.has(record.handle)) throw new Error('output_handle_exists'); this.records.set(record.handle, structuredClone(record)); }
  get(handle: string) { const value = this.records.get(handle); return value ? structuredClone(value) : undefined; }
  update(record: StoredOutputRecord) { if (!this.records.has(record.handle)) throw new Error('output_handle_missing'); this.records.set(record.handle, structuredClone(record)); }
  listMetadata() { return [...this.records.values()].map(record => metadataOf(record)); }
}

interface FileStoreIndex {version: 1; records: Array<{handle: string; file: string; metadata: StoredOutputMetadata}>}

export class FileCommandResultStore implements CommandResultStore {
  private readonly indexFile: string;
  private readonly objectDir: string;
  private readonly files = new Map<string, {file: string; metadata: StoredOutputMetadata}>();

  constructor(readonly root: string) {
    this.indexFile = path.join(root, 'index.json');
    this.objectDir = path.join(root, 'objects');
    if (!fs.existsSync(this.indexFile)) return;
    const parsed = JSON.parse(fs.readFileSync(this.indexFile, 'utf8')) as FileStoreIndex;
    if (parsed.version !== 1 || !Array.isArray(parsed.records)) throw new Error('output_store_schema_unsupported');
    for (const item of parsed.records) {
      if (!/^[a-f0-9]{64}\.json$/.test(item.file)) throw new Error('output_store_object_invalid');
      if (item.metadata.handle !== item.handle) throw new Error('output_store_metadata_identity_mismatch');
      this.files.set(item.handle, {file: item.file, metadata: structuredClone(item.metadata)});
    }
  }

  put(record: StoredOutputRecord) {
    if (this.files.has(record.handle)) throw new Error('output_handle_exists');
    const file = `${createHash('sha256').update(record.handle).digest('hex')}.json`;
    this.files.set(record.handle, {file, metadata: metadataOf(record)});
    this.write(record, file);
    this.saveIndex();
  }

  get(handle: string) {
    const entry = this.files.get(handle);
    if (!entry) return undefined;
    const value = JSON.parse(fs.readFileSync(path.join(this.objectDir, entry.file), 'utf8')) as StoredOutputRecord;
    if (value.version !== 1 || value.handle !== handle) throw new Error('output_artifact_identity_mismatch');
    if (createHash('sha256').update(canonicalResult(value.result)).digest('hex') !== value.authoritativeSha256 || createHash('sha256').update(value.result.stdout).digest('hex') !== value.stdoutSha256) throw new Error('output_artifact_checksum_mismatch');
    return value;
  }

  update(record: StoredOutputRecord) {
    const entry = this.files.get(record.handle);
    if (!entry) throw new Error('output_handle_missing');
    this.files.set(record.handle, {file: entry.file, metadata: metadataOf(record)});
    this.write(record, entry.file);
    this.saveIndex();
  }

  listMetadata() { return [...this.files.values()].map(entry => structuredClone(entry.metadata)); }

  private write(record: StoredOutputRecord, file: string) {
    fs.mkdirSync(this.objectDir, {recursive: true, mode: 0o700});
    writeJsonAtomic(path.join(this.objectDir, file), record);
  }

  private saveIndex() {
    fs.mkdirSync(this.root, {recursive: true, mode: 0o700});
    writeJsonAtomic(this.indexFile, {version: 1, records: [...this.files].map(([handle, entry]) => ({handle, file: entry.file, metadata: entry.metadata}))} satisfies FileStoreIndex);
  }
}

export interface OutputTelemetryEvent {
  name: 'command.output' | 'command.output.expand';
  attributes: Record<string, string | number | boolean>;
}

export interface TokenAwareOutputMetrics {
  commandsObserved: number;
  commandsCompacted: number;
  rgSearchesCompacted: number;
  originalOutputBytes: number;
  returnedOutputBytes: number;
  estimatedTokensOriginal: number;
  estimatedTokensReturned: number;
  estimatedTokensSaved: number;
  contextTokensAvoided: number;
  expansionRequests: number;
  fullResultRequests: number;
  expansionTokensReturned: number;
  byJob: Record<string, number>;
  byLane: Record<string, number>;
  byAgentModel: Record<string, number>;
}

export interface TokenAwareOutputServiceOptions {
  policy?: TokenAwareOutputPolicyInput;
  now?: () => Date;
  handleFactory?: (kind: 'ripgrep' | 'generic', resultHash: string, now: Date) => string;
  telemetry?: (event: OutputTelemetryEvent) => void;
}

export class TokenAwareOutputService {
  readonly policy: TokenAwareOutputPolicy;
  private readonly now: () => Date;
  private readonly handleFactory: NonNullable<TokenAwareOutputServiceOptions['handleFactory']>;
  private readonly telemetry?: (event: OutputTelemetryEvent) => void;

  constructor(readonly store: CommandResultStore = new MemoryCommandResultStore(), options: TokenAwareOutputServiceOptions = {}) {
    this.policy = normalizePolicy(options.policy);
    this.now = options.now ?? (() => new Date());
    this.handleFactory = options.handleFactory ?? defaultHandle;
    this.telemetry = options.telemetry;
  }

  capture(input: CommandResultEnvelope, scope: OutputAuthorityScope): TokenAwareCommandOutput {
    validateEnvelope(input);
    validateScope(scope);
    const originalStdout = input.stdout;
    const originalStderr = input.stderr;
    const originalBytes = byteCount(originalStdout) + byteCount(originalStderr);
    const originalLines = lineCount(originalStdout) + lineCount(originalStderr);
    const originalTokens = estimateTokens(`${originalStdout}${originalStderr}`);
    const stdoutLimit = limitUtf8(originalStdout, this.policy.maxCaptureBytesPerStream);
    const stderrLimit = limitUtf8(originalStderr, this.policy.maxCaptureBytesPerStream);
    const result: CommandResultEnvelope = {
      ...structuredClone(input),
      stdout: stdoutLimit.text,
      stderr: stderrLimit.text,
      stdoutTruncated: Boolean(input.stdoutTruncated || stdoutLimit.truncated),
      stderrTruncated: Boolean(input.stderrTruncated || stderrLimit.truncated),
    };
    const parsedCandidate = isRipgrep(result) ? parseRipgrep(result.stdout, result.semantic?.query ?? inferRipgrepQuery(result.args)) : undefined;
    // A command named `rg` is not necessarily a line-oriented search (`rg --files`,
    // `rg --count`, and future output modes are valid examples). Only apply the
    // semantic index when the complete non-empty stream was recognised.
    const parsed = parsedCandidate?.recognized ? parsedCandidate : undefined;
    const kind = parsed ? 'ripgrep' : 'generic';
    const canonical = canonicalResult(result);
    const authoritativeSha256 = createHash('sha256').update(canonical).digest('hex');
    const stdoutSha256 = createHash('sha256').update(result.stdout).digest('hex');
    const created = this.now();
    const handle = this.handleFactory(kind, authoritativeSha256, created);
    const expiresAt = new Date(created.getTime() + this.policy.retentionSeconds * 1000).toISOString();
    const completeAllowed = this.shouldReturnComplete(result, parsed?.summary, originalTokens, originalBytes, originalLines);
    let stdout = completeAllowed ? result.stdout : kind === 'ripgrep' ? renderRipgrepIndex(parsed!.summary, handle, originalBytes, originalTokens, this.policy.indexMaxFiles) : renderGenericCompact(result.stdout, handle, originalBytes, originalLines, originalTokens, this.policy);
    let disposition: OutputDisposition = completeAllowed ? 'COMPLETE' : 'COMPACTED';
    let level: OutputLevel = completeAllowed ? 3 : kind === 'ripgrep' ? 1 : 0;
    const authoritativeAvailable = !result.stdoutTruncated && !result.stderrTruncated;
    if (!authoritativeAvailable) disposition = 'TRUNCATED';
    if (!completeAllowed && estimateTokens(`${stdout}${result.stderr}`) > this.policy.artifactOnlyAboveReturnedTokens) {
      stdout = renderArtifactOnly(kind, parsed?.summary, handle, originalBytes, originalLines, originalTokens);
      disposition = authoritativeAvailable ? 'ARTIFACT_ONLY' : 'TRUNCATED';
      level = 0;
    }
    const searchView = parsed?.summary ? projectSearch(parsed.summary, level, this.policy) : undefined;
    const accountingText = JSON.stringify({schema: TOKEN_AWARE_OUTPUT_SCHEMA, handle, disposition, level, stdout, stderr: result.stderr, exitCode: result.exitCode, timedOut: Boolean(result.timedOut), cancelled: Boolean(result.cancelled), search: searchView, authoritative: {sha256: authoritativeSha256, stdoutSha256, available: authoritativeAvailable, expiresAt}, provenance: {command: result.command, args: result.args, cwd: result.cwd, backend: result.backend, nodeId: result.nodeId, startedAt: result.startedAt, completedAt: result.completedAt, scope}});
    const returnedBytes = byteCount(accountingText);
    const returnedLines = lineCount(stdout) + lineCount(result.stderr);
    const returnedTokens = estimateTokens(accountingText);
    const metrics = sizeMetrics(originalBytes, originalLines, originalTokens, returnedBytes, returnedLines, returnedTokens);
    const record: StoredOutputRecord = {
      version: 1, handle, kind, createdAt: created.toISOString(), expiresAt, scope: structuredClone(scope), result,
      authoritativeSha256, stdoutSha256, authoritativeAvailable, disposition, initialLevel: level, initialStdout: stdout,
      initialReturnedBytes: returnedBytes, initialReturnedLines: returnedLines, initialReturnedTokens: returnedTokens,
      expansionReturnedBytes: 0, expansionReturnedTokens: 0, expansionRequests: 0, fullResultRequests: 0,
      originalBytes, originalLines, originalTokens,
      search: parsed?.summary, ripgrepRecords: parsed?.records,
    };
    this.store.put(record);
    this.telemetry?.({name: 'command.output', attributes: {
      handle, adapter: kind, disposition, command: path.basename(result.command), backend: result.backend,
      originalBytes, returnedBytes, estimatedTokensOriginal: originalTokens, estimatedTokensReturned: returnedTokens,
      estimatedTokensSaved: metrics.estimatedTokensAvoided, exitCode: result.exitCode,
    }});
    return this.project(record, stdout, level, disposition, metrics);
  }

  expand(handle: string, request: OutputExpansionRequest, scope: OutputAuthorityScope, signal?: AbortSignal): OutputExpansionResult {
    if (signal?.aborted) throw new Error('output_expansion_cancelled');
    validateScope(scope);
    validateExpansion(request, this.policy);
    const record = this.store.get(handle);
    if (!record) throw new Error('output_handle_invalid');
    if (new Date(record.expiresAt).getTime() <= this.now().getTime()) throw new Error('output_handle_expired');
    if (!sameScope(record.scope, scope)) throw new Error('output_handle_scope_denied');
    let stdout: string;
    let level: OutputLevel;
    let disposition: OutputDisposition;
    if (request.mode === 'all') {
      stdout = record.result.stdout;
      level = 3;
      disposition = record.authoritativeAvailable ? 'COMPLETE' : 'TRUNCATED';
    } else {
      if (record.kind !== 'ripgrep' || !record.ripgrepRecords || !record.search) throw new Error('output_expansion_selector_unsupported');
      stdout = expandRipgrep(record.ripgrepRecords, record.search, request, this.policy);
      level = 2;
      disposition = record.authoritativeAvailable ? 'COMPACTED' : 'TRUNCATED';
    }
    if (signal?.aborted) throw new Error('output_expansion_cancelled');
    const accountingText = JSON.stringify({schema: TOKEN_AWARE_OUTPUT_SCHEMA, handle, disposition, level, stdout, stderr: record.result.stderr, exitCode: record.result.exitCode, timedOut: Boolean(record.result.timedOut), cancelled: Boolean(record.result.cancelled), selection: request, authoritative: {sha256: record.authoritativeSha256, stdoutSha256: record.stdoutSha256, available: record.authoritativeAvailable, expiresAt: record.expiresAt}, provenance: {command: record.result.command, args: record.result.args, cwd: record.result.cwd, backend: record.result.backend, nodeId: record.result.nodeId, startedAt: record.result.startedAt, completedAt: record.result.completedAt, scope: record.scope}});
    const returnedBytes = byteCount(accountingText);
    const returnedLines = lineCount(stdout) + lineCount(record.result.stderr);
    const returnedTokens = estimateTokens(accountingText);
    record.expansionRequests++;
    if (request.mode === 'all') record.fullResultRequests++;
    record.expansionReturnedBytes += returnedBytes;
    record.expansionReturnedTokens += returnedTokens;
    this.store.update(record);
    const metrics = sizeMetrics(record.originalBytes, record.originalLines, record.originalTokens, returnedBytes, returnedLines, returnedTokens);
    this.telemetry?.({name: 'command.output.expand', attributes: {
      handle, mode: request.mode, adapter: record.kind, returnedBytes, estimatedTokensReturned: returnedTokens,
      fullResult: request.mode === 'all',
    }});
    const projected = this.project(record, stdout, level, disposition, metrics);
    const {search: _search, representations: _representations, ...base} = projected;
    return {...base, selection: structuredClone(request), selectionComplete: true};
  }

  list(): SafeOutputRecord[] {
    return this.store.listMetadata().map(record => ({
      handle: record.handle, kind: record.kind, createdAt: record.createdAt, expiresAt: record.expiresAt,
      disposition: record.disposition, level: record.initialLevel, command: path.basename(record.command),
      backend: record.backend, nodeId: record.nodeId, exitCode: record.exitCode,
      scope: structuredClone(record.scope), authoritativeSha256: record.authoritativeSha256,
      authoritativeAvailable: record.authoritativeAvailable,
      metrics: {
        ...sizeMetrics(record.originalBytes, record.originalLines, record.originalTokens, record.initialReturnedBytes, record.initialReturnedLines, record.initialReturnedTokens),
        expansionRequests: record.expansionRequests, fullResultRequests: record.fullResultRequests,
        expansionReturnedTokens: record.expansionReturnedTokens,
      },
    }));
  }

  metrics(): TokenAwareOutputMetrics {
    const records = this.store.listMetadata();
    const total: TokenAwareOutputMetrics = {
      commandsObserved: records.length, commandsCompacted: 0, rgSearchesCompacted: 0,
      originalOutputBytes: 0, returnedOutputBytes: 0, estimatedTokensOriginal: 0, estimatedTokensReturned: 0,
      estimatedTokensSaved: 0, contextTokensAvoided: 0, expansionRequests: 0, fullResultRequests: 0,
      expansionTokensReturned: 0, byJob: {}, byLane: {}, byAgentModel: {},
    };
    for (const record of records) {
      const compacted = record.disposition !== 'COMPLETE';
      if (compacted) total.commandsCompacted++;
      if (compacted && record.kind === 'ripgrep') total.rgSearchesCompacted++;
      total.originalOutputBytes += record.originalBytes;
      total.returnedOutputBytes += record.initialReturnedBytes + record.expansionReturnedBytes;
      total.estimatedTokensOriginal += record.originalTokens;
      total.estimatedTokensReturned += record.initialReturnedTokens + record.expansionReturnedTokens;
      total.estimatedTokensSaved += Math.max(0, record.originalTokens - record.initialReturnedTokens);
      total.contextTokensAvoided += Math.max(0, record.originalTokens - record.initialReturnedTokens - record.expansionReturnedTokens);
      total.expansionRequests += record.expansionRequests;
      total.fullResultRequests += record.fullResultRequests;
      total.expansionTokensReturned += record.expansionReturnedTokens;
      increment(total.byJob, record.scope.jobId ?? record.scope.taskId, Math.max(0, record.originalTokens - record.initialReturnedTokens - record.expansionReturnedTokens));
      increment(total.byLane, record.scope.laneId, Math.max(0, record.originalTokens - record.initialReturnedTokens - record.expansionReturnedTokens));
      increment(total.byAgentModel, `${record.scope.providerId ?? 'unassigned'}/${record.scope.modelId ?? 'unassigned'}`, Math.max(0, record.originalTokens - record.initialReturnedTokens - record.expansionReturnedTokens));
    }
    return total;
  }

  private shouldReturnComplete(result: CommandResultEnvelope, search: RipgrepSearchSummary | undefined, tokens: number, bytes: number, lines: number) {
    if (result.stdoutTruncated || result.stderrTruncated) return false;
    const tiny = tokens <= this.policy.minimumCompleteTokens;
    const budget = result.availableContextTokens;
    const budgetExceeded = budget !== undefined && !tiny && tokens > Math.max(this.policy.minimumCompleteTokens, Math.floor(budget * this.policy.contextBudgetFraction));
    if (budgetExceeded) return false;
    if (lines > this.policy.completeMaxLines || bytes > this.policy.completeMaxBytes || tokens > this.policy.completeMaxTokens) return false;
    if (search && (search.totalMatches > this.policy.completeMaxMatches || search.filesWithMatches > this.policy.completeMaxFiles)) return false;
    return true;
  }

  private project(record: StoredOutputRecord, stdout: string, level: OutputLevel, disposition: OutputDisposition, metrics: OutputSizeMetrics): TokenAwareCommandOutput {
    const notices = [
      disposition === 'COMPLETE' ? 'Complete captured output shown.' : `${disposition === 'COMPACTED' ? 'Compact representation' : disposition === 'ARTIFACT_ONLY' ? 'Artifact reference' : 'Explicitly truncated capture'} shown.`,
      `Authoritative result ${record.authoritativeAvailable ? `available as ${record.handle}` : 'is unavailable beyond the configured capture boundary'}.`,
      `Estimated context saving: ~${metrics.estimatedTokensAvoided.toLocaleString('en-US')} tokens.`,
    ];
    if (record.result.stderr) notices.push('stderr is preserved separately from stdout policy.');
    if (record.result.exitCode !== 0) notices.push(`Non-zero exit status preserved: ${record.result.exitCode}.`);
    return {
      schema: TOKEN_AWARE_OUTPUT_SCHEMA, handle: record.handle, disposition, level, stdout,
      stderr: record.result.stderr, exitCode: record.result.exitCode,
      timedOut: Boolean(record.result.timedOut), cancelled: Boolean(record.result.cancelled), notices,
      search: record.search ? projectSearch(record.search, level, this.policy) : undefined,
      authoritative: {sha256: record.authoritativeSha256, stdoutSha256: record.stdoutSha256, available: record.authoritativeAvailable, expiresAt: record.expiresAt},
      metrics,
      representations: representationList(record, stdout),
      provenance: {
        derivedFrom: `artifact:sha256:${record.authoritativeSha256}`, command: record.result.command,
        args: [...record.result.args], cwd: record.result.cwd, backend: record.result.backend,
        nodeId: record.result.nodeId, startedAt: record.result.startedAt, completedAt: record.result.completedAt,
        scope: structuredClone(record.scope),
      },
    };
  }
}

export const TOKEN_AWARE_TOOL_DEFINITIONS: ToolDefinition[] = [
  {id: 'repository.search.ripgrep', risk: 'read', capabilities: [capabilityId.repositorySearch, capabilityId.commandOutputProgressive]},
  {id: 'command.output.expand', risk: 'read', capabilities: [capabilityId.commandOutputExpand]},
];

export interface TokenAwareToolRegistryPort {
  register(toolId: string, handler: RawToolHandler): this;
  use(interceptor: ToolResultInterceptor): this;
}

export function createTokenAwareToolResultInterceptor(service: TokenAwareOutputService): ToolResultInterceptor {
  return async ({result, recipe, control}) => { control.assertActive(); return isCommandResultEnvelope(result) ? service.capture(result, scopeFromRecipe(recipe)) : result; };
}

export function registerOutputExpansionTool<T extends TokenAwareToolRegistryPort>(registry: T, service: TokenAwareOutputService): T {
  const handler: RawToolHandler = async (input, recipe, control) => {
    control.assertActive();
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('output_expansion_request_invalid');
    const value = input as Record<string, unknown>;
    if (typeof value.handle !== 'string') throw new Error('output_expansion_handle_required');
    const request = parseOutputExpansionRequest(value);
    control.assertActive();
    return service.expand(value.handle, request, scopeFromRecipe(recipe));
  };
  return registry.register('command.output.expand', handler);
}

export function scopeFromRecipe(recipe: ExecutionRecipe): OutputAuthorityScope {
  return {
    taskId: recipe.taskId, laneId: recipe.authority.laneId, workerId: recipe.workerId,
    leaseGeneration: recipe.authority.leaseGeneration, ownershipGeneration: recipe.authority.ownershipGeneration,
    providerId: recipe.providerId, modelId: recipe.modelId,
  };
}

export function isCommandResultEnvelope(value: unknown): value is CommandResultEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return item.schema === COMMAND_RESULT_SCHEMA && typeof item.command === 'string' && Array.isArray(item.args)
    && item.args.every(arg => typeof arg === 'string') && typeof item.cwd === 'string'
    && typeof item.stdout === 'string' && typeof item.stderr === 'string' && Number.isSafeInteger(item.exitCode)
    && typeof item.startedAt === 'string' && typeof item.completedAt === 'string' && typeof item.backend === 'string';
}

export function estimateTokens(value: string): number { return Math.ceil(byteCount(value) / 3); }
export function outputLineCount(value: string): number { return lineCount(value); }

function parseRipgrep(stdout: string, query: string): {summary: RipgrepSearchSummary; records: RipgrepCapturedRecord[]; recognized: boolean} {
  const records: RipgrepCapturedRecord[] = [];
  let filesSearched: number | undefined;
  let format: 'unknown' | 'structured' | 'conventional' = 'unknown';
  let recognized = false;
  let unrecognized = false;
  for (const raw of stdout.split(/\r?\n/)) {
    if (!raw) continue;
    let event: Record<string, unknown> | undefined;
    try { const parsed = JSON.parse(raw); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) event = parsed as Record<string, unknown>; }
    catch { event = undefined; }
    if (event && ['match', 'context', 'summary', 'begin', 'end'].includes(String(event.type))) {
      if (format === 'conventional') unrecognized = true;
      format = 'structured';
      recognized = true;
      const data = object(event.data);
      if (event.type === 'summary') {
        const stats = object(data?.stats);
        if (Number.isSafeInteger(stats?.searches)) filesSearched = Number(stats?.searches);
      }
      if (event.type !== 'match' && event.type !== 'context') continue;
      const pathValue = decodeRgData(object(data?.path));
      const lineValue = decodeRgData(object(data?.lines));
      const line = Number(data?.line_number);
      if (!pathValue.text || !Number.isSafeInteger(line) || line < 1) continue;
      const submatches = Array.isArray(data?.submatches) ? data!.submatches.length : 0;
      records.push({path: pathValue.text, line, kind: event.type, text: lineValue.text, matches: event.type === 'match' ? Math.max(1, submatches) : 0, binary: pathValue.binary || lineValue.binary});
      continue;
    }
    if (format !== 'structured') {
      const match = raw.match(/^(.+?):(\d+):(.*)$/);
      if (match) {
        format = 'conventional';
        recognized = true;
        records.push({path: match[1], line: Number(match[2]), kind: 'match', text: `${match[3]}\n`, matches: 1, binary: raw.includes('\0')});
        continue;
      }
    }
    unrecognized = true;
  }
  const grouped = new Map<string, RipgrepFileIndex>();
  for (const record of records.filter(item => item.kind === 'match')) {
    const value = grouped.get(record.path) ?? {path: record.path, lines: [], matches: 0, binary: false};
    if (!value.lines.includes(record.line)) value.lines.push(record.line);
    value.matches += record.matches;
    value.binary ||= record.binary;
    grouped.set(record.path, value);
  }
  const files = [...grouped.values()].map(file => ({...file, lines: file.lines.sort((a, b) => a - b)})).sort((a, b) => a.path.localeCompare(b.path));
  return {summary: {query, filesSearched, filesWithMatches: files.length, totalMatches: files.reduce((sum, file) => sum + file.matches, 0), files}, records, recognized: recognized && !unrecognized};
}

function renderRipgrepIndex(summary: RipgrepSearchSummary, handle: string, bytes: number, tokens: number, indexMaxFiles: number) {
  const lines = [
    `Search: ${summary.query}`,
    `Files searched: ${summary.filesSearched ?? 'not reported'}`,
    `Files with matches: ${summary.filesWithMatches}`,
    `Matches: ${summary.totalMatches}`,
    `Original size: ${bytes} bytes (~${tokens} tokens)`,
    `Compact representation shown. Full result available as ${handle}.`,
    `Structured match index included in search.files (${Math.min(summary.files.length, indexMaxFiles)} shown${summary.files.length > indexMaxFiles ? `, ${summary.files.length - indexMaxFiles} omitted` : ''}).`,
  ];
  return `${lines.join('\n').trimEnd()}\n`;
}

function renderGenericCompact(stdout: string, handle: string, bytes: number, lines: number, tokens: number, policy: TokenAwareOutputPolicy) {
  const rows = splitLines(stdout), head = rows.slice(0, policy.genericHeadLines), tailStart = Math.max(head.length, rows.length - policy.genericTailLines), tail = rows.slice(tailStart);
  const omitted = Math.max(0, rows.length - head.length - tail.length);
  return [
    `Oversized command stdout: ${bytes} bytes, ${lines} lines (~${tokens} tokens).`,
    `Compact generic representation shown. Full result available as ${handle}.`,
    '',
    ...head,
    ...(omitted ? [`... [${omitted} lines omitted from this derived view] ...`] : []),
    ...tail,
    '',
  ].join('\n');
}

function renderArtifactOnly(kind: 'ripgrep' | 'generic', search: RipgrepSearchSummary | undefined, handle: string, bytes: number, lines: number, tokens: number) {
  const detail = kind === 'ripgrep' && search ? `${search.totalMatches} matches across ${search.filesWithMatches} files.` : `${lines} stdout/stderr lines.`;
  return `${detail}\nInitial output is artifact-only because its compact form exceeds policy.\nFull captured result: ${handle}\nOriginal size: ${bytes} bytes (~${tokens} tokens).\n`;
}

function expandRipgrep(records: RipgrepCapturedRecord[], summary: RipgrepSearchSummary, request: OutputExpansionRequest, policy: TokenAwareOutputPolicy) {
  const matchedPaths = new Set(summary.files.map(file => file.path));
  let selected: RipgrepCapturedRecord[] = [];
  const requestedContext = request.contextLines ?? 0;
  if (request.mode === 'file' || request.mode === 'files') {
    const paths = request.mode === 'file' ? [request.file!] : request.files!;
    for (const file of paths) if (!matchedPaths.has(file)) throw new Error('output_expansion_selector_outside_result');
    const wanted = new Set(paths);
    selected = records.filter(record => wanted.has(record.path));
  } else if (request.mode === 'range') {
    if (!matchedPaths.has(request.file!)) throw new Error('output_expansion_selector_outside_result');
    selected = records.filter(record => record.path === request.file && record.line >= request.startLine! && record.line <= request.endLine!);
    if (!selected.length) throw new Error('output_expansion_selector_outside_result');
  } else {
    if (!matchedPaths.has(request.file!)) throw new Error('output_expansion_selector_outside_result');
    const matchLines = new Set(summary.files.find(file => file.path === request.file)!.lines);
    for (const line of request.lines!) if (!matchLines.has(line)) throw new Error('output_expansion_selector_outside_result');
    const wanted = new Set(request.lines);
    selected = records.filter(record => record.path === request.file && [...wanted].some(line => Math.abs(record.line - line) <= requestedContext));
  }
  selected.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || (a.kind === 'context' ? -1 : 1));
  if (!selected.length) throw new Error('output_expansion_selector_outside_result');
  const lines = [`Selected captured ripgrep context (${selected.length} records; maximum context ${policy.maximumExpansionContextLines}).`];
  let previousPath = '';
  for (const record of selected) {
    if (record.path !== previousPath) { lines.push('', record.path); previousPath = record.path; }
    const marker = record.kind === 'match' ? ':' : '-';
    const text = record.binary ? '[binary data retained in authoritative result]' : record.text.replace(/\r?\n$/, '');
    lines.push(`${record.line}${marker}${text}`);
  }
  return `${lines.join('\n')}\n`;
}

function validateEnvelope(value: CommandResultEnvelope) {
  if (!isCommandResultEnvelope(value)) throw new Error('command_result_invalid');
  if (!value.command.trim() || !value.cwd.trim() || !value.backend.trim()) throw new Error('command_result_identity_missing');
  if (!validDate(value.startedAt) || !validDate(value.completedAt) || Date.parse(value.completedAt) < Date.parse(value.startedAt)) throw new Error('command_result_timestamp_invalid');
  if (value.semantic && (value.semantic.adapter !== 'ripgrep' || typeof value.semantic.query !== 'string')) throw new Error('command_result_semantic_invalid');
}

function validateScope(scope: OutputAuthorityScope) {
  if (!scope.taskId?.trim() || !scope.laneId?.trim() || !scope.workerId?.trim()) throw new Error('output_scope_identity_missing');
  if (!Number.isSafeInteger(scope.leaseGeneration) || scope.leaseGeneration < 0 || !Number.isSafeInteger(scope.ownershipGeneration) || scope.ownershipGeneration < 0) throw new Error('output_scope_generation_invalid');
}

function validateExpansion(request: OutputExpansionRequest, policy: TokenAwareOutputPolicy) {
  if (!['match', 'matches', 'file', 'files', 'range', 'all'].includes(request.mode)) throw new Error('output_expansion_mode_invalid');
  const context = request.contextLines ?? 0;
  if (!Number.isSafeInteger(context) || context < 0 || context > policy.maximumExpansionContextLines) throw new Error('output_expansion_context_invalid');
  if (request.mode === 'all') return;
  if (['match', 'matches', 'file', 'range'].includes(request.mode) && (!request.file || typeof request.file !== 'string')) throw new Error('output_expansion_file_required');
  if (request.mode === 'files' && (!Array.isArray(request.files) || request.files.length < 1 || request.files.length > 64 || request.files.some(file => typeof file !== 'string'))) throw new Error('output_expansion_files_invalid');
  if (['match', 'matches'].includes(request.mode) && (!Array.isArray(request.lines) || request.lines.length < 1 || request.lines.length > 256 || request.lines.some(line => !Number.isSafeInteger(line) || line < 1))) throw new Error('output_expansion_lines_invalid');
  if (request.mode === 'range' && (!Number.isSafeInteger(request.startLine) || !Number.isSafeInteger(request.endLine) || request.startLine! < 1 || request.endLine! < request.startLine! || request.endLine! - request.startLine! > 10_000)) throw new Error('output_expansion_range_invalid');
}

export function parseOutputExpansionRequest(input: unknown): OutputExpansionRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('output_expansion_request_invalid');
  const value = input as Record<string, unknown>;
  const allowed = new Set(['handle', 'mode', 'file', 'files', 'lines', 'startLine', 'endLine', 'contextLines']);
  if (Object.keys(value).some(key => !allowed.has(key))) throw new Error('output_expansion_unknown_field');
  return {
    mode: String(value.mode ?? '') as OutputExpansionMode,
    file: typeof value.file === 'string' ? value.file : undefined,
    files: Array.isArray(value.files) ? value.files as string[] : undefined,
    lines: Array.isArray(value.lines) ? value.lines as number[] : undefined,
    startLine: typeof value.startLine === 'number' ? value.startLine : undefined,
    endLine: typeof value.endLine === 'number' ? value.endLine : undefined,
    contextLines: typeof value.contextLines === 'number' ? value.contextLines : undefined,
  };
}

export function parseOutputAuthorityScope(input: unknown): OutputAuthorityScope {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('output_scope_invalid');
  const value = input as Record<string, unknown>;
  const allowed = new Set(['taskId', 'laneId', 'workerId', 'leaseGeneration', 'ownershipGeneration', 'jobId', 'runId', 'providerId', 'modelId']);
  if (Object.keys(value).some(key => !allowed.has(key))) throw new Error('output_scope_unknown_field');
  const scope: OutputAuthorityScope = {
    taskId: typeof value.taskId === 'string' ? value.taskId : '', laneId: typeof value.laneId === 'string' ? value.laneId : '',
    workerId: typeof value.workerId === 'string' ? value.workerId : '', leaseGeneration: Number(value.leaseGeneration), ownershipGeneration: Number(value.ownershipGeneration),
    jobId: typeof value.jobId === 'string' ? value.jobId : undefined, runId: typeof value.runId === 'string' ? value.runId : undefined,
    providerId: typeof value.providerId === 'string' ? value.providerId : undefined, modelId: typeof value.modelId === 'string' ? value.modelId : undefined,
  };
  validateScope(scope);
  return scope;
}

function representationList(record: StoredOutputRecord, initial: string): OutputRepresentation[] {
  const summaryTokens = estimateTokens(record.kind === 'ripgrep' ? `${record.search?.totalMatches ?? 0} matches across ${record.search?.filesWithMatches ?? 0} files` : `${record.originalBytes} bytes ${record.originalLines} lines`);
  const indexTokens = record.kind === 'ripgrep' ? estimateTokens(initial) : summaryTokens;
  return [
    {level: 0, kind: 'summary', estimatedTokens: summaryTokens, available: true, authoritative: false},
    {level: 1, kind: 'index', estimatedTokens: indexTokens, available: record.kind === 'ripgrep', authoritative: false},
    {level: 2, kind: 'selected_context', estimatedTokens: Math.min(record.originalTokens, Math.max(indexTokens, 256)), available: record.kind === 'ripgrep', authoritative: false},
    {level: 3, kind: 'full_artifact', estimatedTokens: record.originalTokens, available: record.authoritativeAvailable, authoritative: true},
  ];
}

function projectSearch(summary: RipgrepSearchSummary, level: OutputLevel, policy: TokenAwareOutputPolicy): RipgrepSearchSummary {
  const maximumFiles = level === 0 ? 0 : level === 3 ? summary.files.length : policy.indexMaxFiles;
  const files = summary.files.slice(0, maximumFiles).map(file => {
    const lines = file.lines.slice(0, level === 3 ? file.lines.length : policy.indexMaxLinesPerFile), linesOmitted = file.lines.length - lines.length;
    return {...file, lines, ...(linesOmitted ? {linesOmitted} : {})};
  });
  const filesOmitted = Math.max(0, summary.files.length - files.length);
  return {...summary, files, indexComplete: filesOmitted === 0 && files.every(file => !file.linesOmitted), ...(filesOmitted ? {filesOmitted} : {})};
}

function canonicalResult(result: CommandResultEnvelope) {
  return JSON.stringify({
    schema: result.schema, command: result.command, args: result.args, cwd: result.cwd, stdout: result.stdout,
    stderr: result.stderr, exitCode: result.exitCode, startedAt: result.startedAt, completedAt: result.completedAt,
    backend: result.backend, nodeId: result.nodeId, timedOut: Boolean(result.timedOut), cancelled: Boolean(result.cancelled),
    stdoutTruncated: Boolean(result.stdoutTruncated), stderrTruncated: Boolean(result.stderrTruncated), semantic: result.semantic,
  });
}

function metadataOf(record: StoredOutputRecord): StoredOutputMetadata {
  const {result, search: _search, ripgrepRecords: _ripgrepRecords, initialStdout: _initialStdout, ...metadata} = record;
  return structuredClone({...metadata, command: result.command, backend: result.backend, nodeId: result.nodeId, exitCode: result.exitCode});
}

function normalizePolicy(input: TokenAwareOutputPolicyInput = {}): TokenAwareOutputPolicy {
  const policy = {...DEFAULT_TOKEN_AWARE_OUTPUT_POLICY, ...input};
  for (const key of ['completeMaxLines', 'completeMaxBytes', 'completeMaxTokens', 'completeMaxMatches', 'completeMaxFiles', 'indexMaxFiles', 'indexMaxLinesPerFile', 'genericHeadLines', 'genericTailLines', 'artifactOnlyAboveReturnedTokens', 'maxCaptureBytesPerStream', 'retentionSeconds', 'minimumCompleteTokens', 'maximumExpansionContextLines'] as const) {
    if (!Number.isSafeInteger(policy[key]) || policy[key] < 0) throw new Error(`output_policy_invalid:${key}`);
  }
  if (!(policy.contextBudgetFraction > 0 && policy.contextBudgetFraction <= 1)) throw new Error('output_policy_invalid:contextBudgetFraction');
  if (policy.maxCaptureBytesPerStream < 1024) throw new Error('output_policy_capture_limit_too_small');
  return policy;
}

function sizeMetrics(originalBytes: number, originalLines: number, originalTokens: number, returnedBytes: number, returnedLines: number, returnedTokens: number): OutputSizeMetrics {
  return {
    originalBytes, originalLines, estimatedOriginalTokens: originalTokens,
    returnedBytes, returnedLines, estimatedReturnedTokens: returnedTokens,
    estimatedTokensAvoided: Math.max(0, originalTokens - returnedTokens),
    compressionRatio: originalBytes === 0 ? 1 : Number((returnedBytes / originalBytes).toFixed(6)),
  };
}

function defaultHandle(kind: 'ripgrep' | 'generic', hash: string, now: Date) {
  const prefix = kind === 'ripgrep' ? 'search' : 'output';
  return `${prefix}:${now.getTime().toString(36).toUpperCase()}-${hash.slice(0, 10).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function isRipgrep(result: CommandResultEnvelope) { return result.semantic?.adapter === 'ripgrep' || ['rg', 'rg.exe'].includes(path.basename(result.command).toLowerCase()); }
function inferRipgrepQuery(args: string[]) { const separator = args.indexOf('--'); if (separator >= 0 && args[separator + 1]) return args[separator + 1]; return args.find(arg => !arg.startsWith('-')) ?? '(captured ripgrep search)'; }
function splitLines(value: string) { const rows = value.split(/\r?\n/); if (rows.at(-1) === '') rows.pop(); return rows; }
function lineCount(value: string) { return value ? splitLines(value).length : 0; }
function byteCount(value: string) { return Buffer.byteLength(value, 'utf8'); }
function limitUtf8(value: string, maximum: number) { const bytes = Buffer.from(value); if (bytes.length <= maximum) return {text: value, truncated: false}; return {text: bytes.subarray(0, maximum).toString('utf8'), truncated: true}; }
function validDate(value: string) { return Number.isFinite(Date.parse(value)); }
function object(value: unknown): Record<string, unknown> | undefined { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function decodeRgData(value: Record<string, unknown> | undefined): {text: string; binary: boolean} {
  if (!value) return {text: '', binary: false};
  if (typeof value.text === 'string') return {text: value.text, binary: false};
  if (typeof value.bytes === 'string') return {text: Buffer.from(value.bytes, 'base64').toString('utf8'), binary: true};
  return {text: '', binary: false};
}
function sameScope(left: OutputAuthorityScope, right: OutputAuthorityScope) { return left.taskId === right.taskId && left.laneId === right.laneId && left.workerId === right.workerId && left.leaseGeneration === right.leaseGeneration && left.ownershipGeneration === right.ownershipGeneration; }
function increment(target: Record<string, number>, key: string, value: number) { target[key] = (target[key] ?? 0) + value; }
function writeJsonAtomic(file: string, value: unknown) { fs.mkdirSync(path.dirname(file), {recursive: true, mode: 0o700}); const temporary = `${file}.${process.pid}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600}); fs.renameSync(temporary, file); }

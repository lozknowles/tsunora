import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type {ExecutionRecipe} from './adaptive-harness.js';
import {
  COMMAND_RESULT_SCHEMA,
  type CommandResultEnvelope,
  type TokenAwareOutputPolicy,
  DEFAULT_TOKEN_AWARE_OUTPUT_POLICY,
  createTokenAwareToolResultInterceptor,
  registerOutputExpansionTool,
  type TokenAwareOutputService,
  type TokenAwareToolRegistryPort,
} from './token-aware-output.js';

export interface CommandExecutionRequest {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  maxCaptureBytesPerStream: number;
  backend?: string;
  nodeId?: string;
  semantic?: CommandResultEnvelope['semantic'];
  availableContextTokens?: number;
  signal?: AbortSignal;
}

export interface CommandExecutor {
  execute(request: CommandExecutionRequest): Promise<CommandResultEnvelope>;
}

export class LocalCommandExecutor implements CommandExecutor {
  async execute(request: CommandExecutionRequest): Promise<CommandResultEnvelope> {
    validateCommandExecutionRequest(request);
    const startedAt = new Date().toISOString();
    return new Promise((resolve, reject) => {
      const child = spawn(request.command, request.args, {cwd: request.cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
      const stdout: Buffer[] = [], stderr: Buffer[] = [];
      let stdoutBytes = 0, stderrBytes = 0, stdoutTruncated = false, stderrTruncated = false;
      let timedOut = false, cancelled = false, settled = false;
      const collect = (target: Buffer[], stream: 'stdout' | 'stderr') => (chunk: Buffer) => {
        const buffer = Buffer.from(chunk);
        const current = stream === 'stdout' ? stdoutBytes : stderrBytes;
        const remaining = Math.max(0, request.maxCaptureBytesPerStream - current);
        if (remaining > 0) target.push(buffer.subarray(0, remaining));
        if (stream === 'stdout') { stdoutBytes += buffer.length; stdoutTruncated ||= buffer.length > remaining; }
        else { stderrBytes += buffer.length; stderrTruncated ||= buffer.length > remaining; }
      };
      const complete = (exitCode: number) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', abort);
        resolve({
          schema: COMMAND_RESULT_SCHEMA, command: request.command, args: [...request.args], cwd: request.cwd,
          stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), exitCode,
          startedAt, completedAt: new Date().toISOString(), backend: request.backend ?? 'local', nodeId: request.nodeId,
          timedOut, cancelled, stdoutTruncated, stderrTruncated, semantic: request.semantic,
          availableContextTokens: request.availableContextTokens,
        });
      };
      const stop = (reason: 'timeout' | 'cancel') => {
        if (settled) return;
        if (reason === 'timeout') timedOut = true; else cancelled = true;
        child.kill();
        setTimeout(() => complete(reason === 'timeout' ? 124 : 130), 250).unref();
      };
      const abort = () => stop('cancel');
      child.stdout.on('data', collect(stdout, 'stdout'));
      child.stderr.on('data', collect(stderr, 'stderr'));
      child.once('error', error => { if (!settled) { settled = true; clearTimeout(timer); request.signal?.removeEventListener('abort', abort); reject(new Error(`command_launch_failed:${error.message}`)); } });
      child.once('close', code => complete(timedOut ? 124 : cancelled ? 130 : code ?? -1));
      const timer = setTimeout(() => stop('timeout'), request.timeoutMs);
      request.signal?.addEventListener('abort', abort, {once: true});
      if (request.signal?.aborted) abort();
    });
  }
}

export interface RipgrepSearchRequest {
  query: string;
  paths?: string[];
  globs?: string[];
  fixedStrings?: boolean;
  caseMode?: 'sensitive' | 'insensitive' | 'smart';
  hidden?: boolean;
  contextLines?: number;
  timeoutMs?: number;
  availableContextTokens?: number;
}

export interface RipgrepSearchRunnerOptions {
  workspaceRoot?: string;
  workspace?: RepositoryWorkspaceBoundary;
  executor?: CommandExecutor;
  executable?: string;
  policy?: Partial<TokenAwareOutputPolicy>;
  signalForRecipe?: (recipe: ExecutionRecipe) => AbortSignal | undefined;
}

/** Execution backends own their workspace boundary; remote paths need not exist on the controller. */
export interface RepositoryWorkspaceBoundary {
  root: string;
  authorizePath(requestedPath: string): string;
}

export class LocalRepositoryWorkspaceBoundary implements RepositoryWorkspaceBoundary {
  readonly root: string;
  constructor(root: string) {
    if (!path.isAbsolute(root)) throw new Error('repository_search_workspace_must_be_absolute');
    this.root = fs.realpathSync(root);
  }
  authorizePath(value: string) {
    if (!value || value.includes('\0') || path.isAbsolute(value)) throw new Error('repository_search_path_invalid');
    const resolved = path.resolve(this.root, value), real = fs.realpathSync(resolved), relative = path.relative(this.root, real);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('repository_search_path_outside_workspace');
    return relative || '.';
  }
}

/** Typed read-only repository search. It never accepts arbitrary ripgrep arguments or a shell string. */
export class RipgrepSearchRunner {
  readonly workspaceRoot: string;
  private readonly workspace: RepositoryWorkspaceBoundary;
  private readonly executor: CommandExecutor;
  private readonly executable: string;
  private readonly policy: TokenAwareOutputPolicy;
  private readonly signalForRecipe?: (recipe: ExecutionRecipe) => AbortSignal | undefined;

  constructor(options: RipgrepSearchRunnerOptions) {
    if (Boolean(options.workspaceRoot) === Boolean(options.workspace)) throw new Error('repository_search_one_workspace_boundary_required');
    this.workspace = options.workspace ?? new LocalRepositoryWorkspaceBoundary(options.workspaceRoot!);
    if (!this.workspace.root.trim() || this.workspace.root.includes('\0')) throw new Error('repository_search_workspace_invalid');
    this.workspaceRoot = this.workspace.root;
    this.executor = options.executor ?? new LocalCommandExecutor();
    this.executable = options.executable ?? 'rg';
    this.policy = {...DEFAULT_TOKEN_AWARE_OUTPUT_POLICY, ...(options.policy ?? {})};
    this.signalForRecipe = options.signalForRecipe;
  }

  async execute(input: unknown, recipe?: ExecutionRecipe): Promise<CommandResultEnvelope> {
    const request = validateRipgrepRequest(input, this.policy);
    const paths = (request.paths?.length ? request.paths : ['.']).map(value => this.authorizePath(value));
    const args = ['--json', '--line-number', '--color=never', `--context=${request.contextLines ?? 5}`];
    if (request.fixedStrings) args.push('--fixed-strings');
    if (request.caseMode === 'insensitive') args.push('--ignore-case');
    else if (request.caseMode === 'smart') args.push('--smart-case');
    else args.push('--case-sensitive');
    if (request.hidden) args.push('--hidden');
    for (const glob of request.globs ?? []) args.push('--glob', glob);
    args.push('--', request.query, ...paths);
    const runtimeBudget = recipe && typeof recipe.runtime.remainingContextTokens === 'number' ? recipe.runtime.remainingContextTokens : undefined;
    const availableContextTokens = minimumDefined(request.availableContextTokens, runtimeBudget);
    return this.executor.execute({
      command: this.executable, args, cwd: this.workspaceRoot,
      timeoutMs: request.timeoutMs ?? 30_000,
      maxCaptureBytesPerStream: this.policy.maxCaptureBytesPerStream,
      semantic: {adapter: 'ripgrep', query: request.query}, availableContextTokens,
      signal: recipe ? this.signalForRecipe?.(recipe) : undefined,
    });
  }

  register<T extends Pick<TokenAwareToolRegistryPort, 'register'>>(registry: T) {
    registry.register('repository.search.ripgrep', (input, recipe) => this.execute(input, recipe));
    return registry;
  }

  private authorizePath(value: string) {
    const authorised = this.workspace.authorizePath(value);
    if (!authorised || typeof authorised !== 'string' || authorised.includes('\0')) throw new Error('repository_search_path_authorization_invalid');
    return authorised;
  }
}

/** Wires search, interception, and expansion through the existing central registry port. */
export function configureTokenAwareRepositoryTools<T extends TokenAwareToolRegistryPort>(registry: T, service: TokenAwareOutputService, options: RipgrepSearchRunnerOptions): T {
  registry.use(createTokenAwareToolResultInterceptor(service));
  new RipgrepSearchRunner(options).register(registry);
  registerOutputExpansionTool(registry, service);
  return registry;
}

function validateRipgrepRequest(input: unknown, policy: TokenAwareOutputPolicy): RipgrepSearchRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('repository_search_request_invalid');
  const value = input as Record<string, unknown>;
  const allowed = new Set(['query', 'paths', 'globs', 'fixedStrings', 'caseMode', 'hidden', 'contextLines', 'timeoutMs', 'availableContextTokens']);
  if (Object.keys(value).some(key => !allowed.has(key))) throw new Error('repository_search_unknown_field');
  if (typeof value.query !== 'string' || !value.query.length || value.query.length > 4096 || value.query.includes('\0')) throw new Error('repository_search_query_invalid');
  const paths = stringArray(value.paths, 'paths', 64, 1024);
  const globs = stringArray(value.globs, 'globs', 64, 512);
  for (const requestedPath of paths ?? []) if (requestedPath.includes('\0') || portableAbsolute(requestedPath) || requestedPath.split(/[\\/]/).includes('..')) throw new Error('repository_search_path_invalid');
  for (const glob of globs ?? []) if (glob.includes('\0') || portableAbsolute(glob) || glob.split(/[\\/]/).includes('..')) throw new Error('repository_search_glob_invalid');
  if (value.fixedStrings !== undefined && typeof value.fixedStrings !== 'boolean') throw new Error('repository_search_fixed_strings_invalid');
  if (value.hidden !== undefined && typeof value.hidden !== 'boolean') throw new Error('repository_search_hidden_invalid');
  if (value.caseMode !== undefined && !['sensitive', 'insensitive', 'smart'].includes(String(value.caseMode))) throw new Error('repository_search_case_mode_invalid');
  const contextLines = value.contextLines === undefined ? 5 : integer(value.contextLines, 'context', 0, policy.maximumExpansionContextLines);
  const timeoutMs = value.timeoutMs === undefined ? 30_000 : integer(value.timeoutMs, 'timeout', 100, 120_000);
  const availableContextTokens = value.availableContextTokens === undefined ? undefined : integer(value.availableContextTokens, 'context_budget', 1, 10_000_000);
  return {query: value.query, paths, globs, fixedStrings: value.fixedStrings as boolean | undefined, hidden: value.hidden as boolean | undefined, caseMode: value.caseMode as RipgrepSearchRequest['caseMode'], contextLines, timeoutMs, availableContextTokens};
}

function validateCommandExecutionRequest(request: CommandExecutionRequest) {
  if (!request.command.trim() || request.command.includes('\0') || !path.isAbsolute(request.cwd)) throw new Error('command_execution_identity_invalid');
  if (request.args.some(arg => typeof arg !== 'string' || arg.includes('\0'))) throw new Error('command_execution_argument_invalid');
  if (!Number.isSafeInteger(request.timeoutMs) || request.timeoutMs < 1 || !Number.isSafeInteger(request.maxCaptureBytesPerStream) || request.maxCaptureBytesPerStream < 1) throw new Error('command_execution_limit_invalid');
}

function stringArray(value: unknown, label: string, maximumItems: number, maximumLength: number): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > maximumItems || value.some(item => typeof item !== 'string' || !item.length || item.length > maximumLength)) throw new Error(`repository_search_${label}_invalid`);
  return value as string[];
}

function integer(value: unknown, label: string, minimum: number, maximum: number) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) throw new Error(`repository_search_${label}_invalid`);
  return Number(value);
}

function minimumDefined(left: number | undefined, right: number | undefined) {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return Math.min(left, right);
}

function portableAbsolute(value: string) { return /^[\\/]/.test(value) || /^[a-z]:[\\/]/i.test(value); }

import {spawn, type ChildProcess} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {ExecutionSessionCapabilities, ExecutionSessionCrewRole, ExecutionSessionRuntime, ExecutionSessionScope, ExecutionSessionSignal} from './execution-session.js';
import {redactSensitiveText} from './security-redaction.js';

export interface OwnedProcessRequest {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  maxOutputBytes?: number;
  onStdoutLine?: (line: string) => void;
  session?: {
    terminal?: 'pipe' | 'pty';
    interactiveInput?: boolean;
    allowSignals?: boolean;
    remoteTransport?: boolean;
    adapterId?: string;
    commandLabel?: string;
    crewRole?: ExecutionSessionCrewRole;
    /** Adapter-owned safe projection of real process output; undefined omits a line. */
    transformOutputLine?: (stream: 'stdout' | 'stderr', line: string) => string | undefined;
  };
}

export interface OwnedProcessResult {
  pid: number;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export type CleanupOutcome = 'confirmed' | 'uncertain' | 'identity-mismatch' | 'failed';
export interface OwnedProcessIdentity {
  pid: number;
  platform: NodeJS.Platform;
  startedAtToken: string | null;
  capturedAt: string;
}
export interface ProcessCleanupResult {
  identity: OwnedProcessIdentity;
  outcome: CleanupOutcome;
  reason: string;
  signals: string[];
  requestedAt: string;
  verifiedAt: string;
  detail?: string;
}
export interface ExecutionCleanupReport {
  outcome: CleanupOutcome;
  reason: string;
  requestedAt: string;
  completedAt: string;
  processes: ProcessCleanupResult[];
}

export interface OwnedExecution {
  runProcess(request: OwnedProcessRequest, signal?: AbortSignal): Promise<OwnedProcessResult>;
  terminateAll(reason?: string): Promise<ExecutionCleanupReport>;
  activePids(): number[];
  sessionIds?(): string[];
}

export interface ProcessTerminationAdapter {
  readonly platform: NodeJS.Platform;
  capture(pid: number): Promise<OwnedProcessIdentity>;
  terminate(identity: OwnedProcessIdentity, child: ChildProcess, reason: string): Promise<ProcessCleanupResult>;
}

interface TrackedProcess {
  child: ChildProcess;
  identity: OwnedProcessIdentity;
  completed: Promise<void>;
  termination?: Promise<ProcessCleanupResult>;
}

interface ProcessLaunch {
  command: string;
  args: string[];
  terminal: 'pipe' | 'pty';
  adapterId: string;
  cleanup?: () => void;
}

const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
const timestamp = () => new Date().toISOString();

function appendBounded(chunks: Buffer[], chunk: Buffer, current: {bytes: number}, maximum: number) {
  if (current.bytes >= maximum) return;
  const accepted = chunk.subarray(0, maximum - current.bytes);
  chunks.push(accepted);
  current.bytes += accepted.length;
}

function abortError(signal: AbortSignal) {
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  const error = new Error(typeof reason === 'string' ? reason : 'owned_process_aborted');
  error.name = 'AbortError';
  return error;
}

function readLinuxStat(pid: number) {
  try {
    const value = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'), close = value.lastIndexOf(')');
    if (close < 0) return undefined;
    const fields = value.slice(close + 2).trim().split(/\s+/);
    const processGroup = Number(fields[2]), startedAtToken = fields[19];
    if (!Number.isSafeInteger(processGroup) || !startedAtToken) return undefined;
    return {processGroup, startedAtToken};
  } catch { return undefined; }
}

function linuxGroupAlive(pid: number) {
  try { process.kill(-pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

async function waitUntil(predicate: () => boolean, timeoutMs: number, intervalMs = 25) {
  const deadline = Date.now() + timeoutMs;
  do { if (predicate()) return true; await delay(intervalMs); } while (Date.now() < deadline);
  return predicate();
}

function signalLinuxGroup(pid: number, signal: NodeJS.Signals) {
  try { process.kill(-pid, signal); return 'sent' as const; }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return 'absent' as const;
    if (code === 'EPERM') return 'forbidden' as const;
    throw error;
  }
}

class LinuxTerminationAdapter implements ProcessTerminationAdapter {
  constructor(readonly platform: 'linux' | 'android' = 'linux') {}
  async capture(pid: number): Promise<OwnedProcessIdentity> { return {pid, platform: this.platform, startedAtToken: readLinuxStat(pid)?.startedAtToken ?? null, capturedAt: timestamp()}; }
  async terminate(identity: OwnedProcessIdentity, child: ChildProcess, reason: string): Promise<ProcessCleanupResult> {
    const requestedAt = timestamp(), signals: string[] = [], current = readLinuxStat(identity.pid);
    if (current && identity.startedAtToken && current.startedAtToken !== identity.startedAtToken) return {identity, outcome: 'identity-mismatch', reason, signals, requestedAt, verifiedAt: timestamp(), detail: 'leader_pid_reused_before_signal'};
    if (!current && !linuxGroupAlive(identity.pid)) return {identity, outcome: 'confirmed', reason, signals, requestedAt, verifiedAt: timestamp(), detail: 'process_group_already_absent'};
    if (!current && child.exitCode !== null) return {identity, outcome: 'uncertain', reason, signals, requestedAt, verifiedAt: timestamp(), detail: 'leader_exited_before_descendant_identity_could_be_proven'};
    const term = signalLinuxGroup(identity.pid, 'SIGTERM'); signals.push(`SIGTERM:${term}`);
    if (term === 'forbidden') return {identity, outcome: 'failed', reason, signals, requestedAt, verifiedAt: timestamp(), detail: 'signal_permission_denied'};
    if (await waitUntil(() => !linuxGroupAlive(identity.pid), 500)) return {identity, outcome: 'confirmed', reason, signals, requestedAt, verifiedAt: timestamp()};
    const afterTerm = readLinuxStat(identity.pid);
    if (afterTerm && identity.startedAtToken && afterTerm.startedAtToken !== identity.startedAtToken) return {identity, outcome: 'identity-mismatch', reason, signals, requestedAt, verifiedAt: timestamp(), detail: 'leader_pid_reused_before_forced_signal'};
    const kill = signalLinuxGroup(identity.pid, 'SIGKILL'); signals.push(`SIGKILL:${kill}`);
    if (kill === 'forbidden') return {identity, outcome: 'failed', reason, signals, requestedAt, verifiedAt: timestamp(), detail: 'forced_signal_permission_denied'};
    const absent = await waitUntil(() => !linuxGroupAlive(identity.pid), 2_000);
    return {identity, outcome: absent ? 'confirmed' : 'uncertain', reason, signals, requestedAt, verifiedAt: timestamp(), ...(absent ? {} : {detail: 'process_group_still_present_after_forced_signal'})};
  }
}

interface WindowsProcessIdentity {pid: number; startedAtToken: string; parentPid: number;}

function runWindowsInventory(rootPid: number): Promise<WindowsProcessIdentity[]> {
  const source = [
    "$ErrorActionPreference = 'Stop'",
    '$root = [int]$env:AGENT_CONTROL_OWNED_PID',
    '$rows = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, CreationDate)',
    '$wanted = [System.Collections.Generic.HashSet[int]]::new(); [void]$wanted.Add($root)',
    'do { $changed = $false; foreach ($row in $rows) { if ($wanted.Contains([int]$row.ParentProcessId) -and $wanted.Add([int]$row.ProcessId)) { $changed = $true } } } while ($changed)',
    '$result = @($rows | Where-Object { $wanted.Contains([int]$_.ProcessId) } | ForEach-Object { [ordered]@{ pid = [int]$_.ProcessId; parentPid = [int]$_.ParentProcessId; startedAtToken = [string]$_.CreationDate } })',
    '[Console]::Out.Write(($result | ConvertTo-Json -Compress))',
  ].join('\n');
  return new Promise(resolve => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '-'], {env: {...process.env, AGENT_CONTROL_OWNED_PID: String(rootPid)}, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore']});
    let output = '', settled = false;
    const finish = (value: WindowsProcessIdentity[]) => { if (settled) return; settled = true; resolve(value); };
    const timer = setTimeout(() => { child.kill(); finish([]); }, 2_000);
    child.stdout?.on('data', chunk => { if (output.length < 256 * 1024) output += chunk; });
    child.once('error', () => { clearTimeout(timer); finish([]); });
    child.once('close', code => { clearTimeout(timer); if (code !== 0) { finish([]); return; } try { const parsed = JSON.parse(output || '[]'); finish((Array.isArray(parsed) ? parsed : [parsed]).filter(item => Number.isSafeInteger(item?.pid) && typeof item?.startedAtToken === 'string')); } catch { finish([]); } });
    child.stdin?.end(source);
  });
}

function taskkillTree(pid: number): Promise<number | null> {
  return new Promise(resolve => {
    const child = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {windowsHide: true, stdio: 'ignore'});
    child.once('error', () => resolve(null));
    child.once('exit', code => resolve(code));
  });
}

class WindowsTerminationAdapter implements ProcessTerminationAdapter {
  readonly platform = 'win32' as const;
  async capture(pid: number): Promise<OwnedProcessIdentity> { const root = (await runWindowsInventory(pid)).find(item => item.pid === pid); return {pid, platform: this.platform, startedAtToken: root?.startedAtToken ?? null, capturedAt: timestamp()}; }
  async terminate(identity: OwnedProcessIdentity, _child: ChildProcess, reason: string): Promise<ProcessCleanupResult> {
    const requestedAt = timestamp(), before = await runWindowsInventory(identity.pid), root = before.find(item => item.pid === identity.pid), signals: string[] = [];
    if (root && identity.startedAtToken && root.startedAtToken !== identity.startedAtToken) return {identity, outcome: 'identity-mismatch', reason, signals, requestedAt, verifiedAt: timestamp(), detail: 'leader_pid_reused_before_taskkill'};
    if (!root && before.length === 0) return {identity, outcome: 'confirmed', reason, signals, requestedAt, verifiedAt: timestamp(), detail: 'process_tree_already_absent'};
    if (!root || !identity.startedAtToken) return {identity, outcome: 'uncertain', reason, signals, requestedAt, verifiedAt: timestamp(), detail: 'windows_process_identity_unavailable'};
    const code = await taskkillTree(identity.pid); signals.push(`taskkill-tree:${code === null ? 'spawn-failed' : code}`);
    const captured = new Map(before.map(item => [item.pid, item.startedAtToken]));
    const gone = await (async () => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const after = await runWindowsInventory(identity.pid);
        if (!after.some(item => captured.get(item.pid) === item.startedAtToken)) return true;
        await delay(50);
      }
      return false;
    })();
    if (gone) return {identity, outcome: 'confirmed', reason, signals, requestedAt, verifiedAt: timestamp()};
    return {identity, outcome: code === 0 ? 'uncertain' : 'failed', reason, signals, requestedAt, verifiedAt: timestamp(), detail: code === 0 ? 'captured_process_tree_still_present' : 'taskkill_failed'};
  }
}

class PortableTerminationAdapter implements ProcessTerminationAdapter {
  readonly platform = process.platform;
  async capture(pid: number): Promise<OwnedProcessIdentity> { return {pid, platform: this.platform, startedAtToken: null, capturedAt: timestamp()}; }
  async terminate(identity: OwnedProcessIdentity, child: ChildProcess, reason: string): Promise<ProcessCleanupResult> {
    const requestedAt = timestamp(), signals: string[] = [];
    if (child.exitCode !== null) return {identity, outcome: 'confirmed', reason, signals, requestedAt, verifiedAt: timestamp(), detail: 'leader_already_absent_descendants_not_supported'};
    const sent = child.kill('SIGTERM'); signals.push(`SIGTERM:${sent ? 'sent' : 'not-sent'}`);
    const exited = await waitUntil(() => child.exitCode !== null || child.signalCode !== null, 2_000);
    return {identity, outcome: exited ? 'uncertain' : 'failed', reason, signals, requestedAt, verifiedAt: timestamp(), detail: exited ? 'leader_exited_descendant_verification_unsupported' : 'leader_did_not_exit'};
  }
}

export function processTerminationAdapterFor(platform: NodeJS.Platform): ProcessTerminationAdapter {
  return platform === 'linux' || platform === 'android' ? new LinuxTerminationAdapter(platform) : platform === 'win32' ? new WindowsTerminationAdapter() : new PortableTerminationAdapter();
}

export function defaultProcessTerminationAdapter(): ProcessTerminationAdapter {
  return processTerminationAdapterFor(process.platform);
}

const cleanupRank: Record<CleanupOutcome, number> = {confirmed: 0, uncertain: 1, 'identity-mismatch': 2, failed: 3};

export class OwnedProcessManager implements OwnedExecution {
  private readonly processes = new Map<number, TrackedProcess>();
  private readonly completedCleanup = new Map<number, ProcessCleanupResult>();
  private readonly executionSessionIds: string[] = [];
  constructor(
    private readonly termination: ProcessTerminationAdapter = defaultProcessTerminationAdapter(),
    private readonly executionSessions?: ExecutionSessionRuntime,
    private readonly executionScope?: ExecutionSessionScope,
  ) {}

  activePids() { return [...this.processes.keys()]; }
  sessionIds() { return [...this.executionSessionIds]; }

  async runProcess(request: OwnedProcessRequest, signal?: AbortSignal): Promise<OwnedProcessResult> {
    if (signal?.aborted) throw abortError(signal);
    const launch = prepareLaunch(request);
    const maximum = request.maxOutputBytes ?? 1024 * 1024, credentials = credentialValues(request.env);
    const stdout: Buffer[] = [], stderr: Buffer[] = [], stdoutSize = {bytes: 0}, stderrSize = {bytes: 0}; let stdoutRemainder = '';
    const sessionRemainders: Record<'stdout' | 'stderr', string> = {stdout: '', stderr: ''};
    const child = spawn(launch.command, launch.args, {
      cwd: request.cwd,
      env: request.env,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (!child.pid) {
      // Failed spawn emits its error asynchronously. Consume it before returning
      // so optional probes receive ENOENT rather than crashing the controller.
      return new Promise<never>((_resolve, reject) => {
        child.once('error', reject);
        child.once('close', () => reject(new Error('owned_process_pid_unavailable')));
      });
    }
    const pid = child.pid;
    const scope = this.executionScope ? {...this.executionScope, ...(request.session?.crewRole ? {crewRole: request.session.crewRole} : {})} : undefined;
    const interactionAllowed=scope?.interactionPolicy!=='WATCH_ONLY',interactiveInput=Boolean(request.session?.interactiveInput)&&interactionAllowed,allowSignals=Boolean(request.session?.allowSignals)&&interactionAllowed;
    const sessionId = `session-${randomUUID()}`, incarnation = randomUUID();
    const session = this.executionSessions && scope ? this.executionSessions.create({
      id: sessionId, incarnation,
      adapterId: request.session?.adapterId ?? (request.session?.remoteTransport ? 'ssh-pipe' : launch.adapterId), scope,
      command: request.session?.commandLabel ?? request.command, cwd: request.cwd ?? process.cwd(), pid,
      capabilities: sessionCapabilities(launch.terminal, interactiveInput, allowSignals, Boolean(request.session?.remoteTransport), scope?.interactionPolicy),
      runtimeCredentials: credentials,
      control: {
        prove: async () => ({sessionId, incarnation, state: child.exitCode === null && child.signalCode === null ? 'RUNNING' : child.exitCode === 0 ? 'EXITED' : 'FAILED', pid}),
        ...(interactiveInput ? {write: async (value: string) => { if (!child.stdin || child.stdin.destroyed || child.exitCode !== null) throw new Error('owned_process_stdin_unavailable'); if (!child.stdin.write(value)) await new Promise<void>((resolve, reject) => { child.stdin!.once('drain', resolve); child.stdin!.once('error', reject); }); }} : {}),
        ...(allowSignals ? {signal: async (value: ExecutionSessionSignal) => signalProcess(child, pid, value)} : {}),
      },
    }) : undefined;
    if (session) this.executionSessionIds.push(session.id);
    const exposeSessionOutput = (stream: 'stdout' | 'stderr', value: string, flush = false) => {
      if (!session) return;
      const transform = request.session?.transformOutputLine;
      if (!transform) { this.executionSessions?.appendOutput(session.id, launch.terminal === 'pty' && stream === 'stdout' ? 'terminal' : stream, value); return; }
      const buffered = `${sessionRemainders[stream]}${value}`;
      const lines = buffered.split(/\r?\n/), tail = lines.pop() ?? '';
      sessionRemainders[stream] = flush ? '' : tail;
      if (flush && tail) lines.push(tail);
      for (const line of lines) {
        if (!line && !flush) continue;
        const projected = transform(stream, line);
        if (projected) this.executionSessions?.appendOutput(session.id, launch.terminal === 'pty' && stream === 'stdout' ? 'terminal' : stream, `${projected}\n`);
      }
    };
    child.stdout?.on('data', (chunk: Buffer) => { appendBounded(stdout, chunk, stdoutSize, maximum); exposeSessionOutput('stdout', chunk.toString('utf8')); if (request.onStdoutLine) { stdoutRemainder += chunk.toString('utf8'); const lines = stdoutRemainder.split(/\r?\n/); stdoutRemainder = lines.pop() ?? ''; for (const line of lines) if (line) request.onStdoutLine(session ? this.executionSessions!.redactRuntimeOutput(session.id, line) : redactSensitiveText(line, credentials)); } });
    child.stderr?.on('data', (chunk: Buffer) => { appendBounded(stderr, chunk, stderrSize, maximum); exposeSessionOutput('stderr', chunk.toString('utf8')); });
    if (request.input !== undefined) { child.stdin?.write(request.input); if (!interactiveInput) child.stdin?.end(); }
    else if (!interactiveInput) child.stdin?.end();

    let complete!: () => void;
    const completed = new Promise<void>(resolve => { complete = resolve; });
    let sessionFinished = false;
    const finishSession = (value: {exitCode: number | null; signal: string | null; failed?: boolean; detail?: string}) => {
      if (!session || sessionFinished) return;
      sessionFinished = true;
      this.executionSessions?.finish(session.id, value);
    };
    const result = new Promise<OwnedProcessResult>((resolve, reject) => {
      child.once('error', error => { finishSession({exitCode: null, signal: null, failed: true, detail: error.message}); reject(error); });
      // Exit can precede the final stdout/stderr data events, including inherited
      // pipes. Seal results and durable session output only after both streams close.
      child.once('close', (exitCode, childSignal) => {
        exposeSessionOutput('stdout', '', true); exposeSessionOutput('stderr', '', true);
        if (stdoutRemainder) request.onStdoutLine?.(session ? this.executionSessions!.redactRuntimeOutput(session.id, stdoutRemainder) : redactSensitiveText(stdoutRemainder, credentials));
        const stdoutText = Buffer.concat(stdout).toString('utf8'), stderrText = Buffer.concat(stderr).toString('utf8');
        const safeStdout = session ? this.executionSessions!.redactRuntimeOutput(session.id, stdoutText) : redactSensitiveText(stdoutText, credentials);
        const safeStderr = session ? this.executionSessions!.redactRuntimeOutput(session.id, stderrText) : redactSensitiveText(stderrText, credentials);
        finishSession({exitCode, signal: childSignal, failed: exitCode !== 0});
        complete();
        if (signal?.aborted) { reject(abortError(signal)); return; }
        resolve({pid, exitCode, signal: childSignal, stdout: safeStdout, stderr: safeStderr});
      });
    });
    // Identity capture can span multiple event-loop turns on Windows. Attach a
    // rejection observer before awaiting it so an abort/exit during capture is
    // not reported as an unhandled rejection; callers still await the original
    // promise below and receive the same failure.
    void result.catch(() => undefined);
    const identity = await this.termination.capture(pid);
    const tracked: TrackedProcess = {child, identity, completed};
    this.processes.set(pid, tracked);
    const onAbort = () => { void this.terminate(pid, typeof signal?.reason === 'string' ? signal.reason : 'owned_process_aborted'); };
    signal?.addEventListener('abort', onAbort, {once: true});
    try {
      if (signal?.aborted) { await this.terminate(pid, typeof signal.reason === 'string' ? signal.reason : 'owned_process_aborted'); throw abortError(signal); }
      return await result;
    } finally {
      signal?.removeEventListener('abort', onAbort);
      if (tracked.termination) await tracked.termination;
      this.processes.delete(pid);
      launch.cleanup?.();
    }
  }

  async terminateAll(reason = 'owned_execution_terminated'): Promise<ExecutionCleanupReport> {
    const requestedAt = timestamp(), active = this.activePids();
    const results = await Promise.all(active.map(pid => this.terminate(pid, reason)));
    const processes = results.length ? results : [...this.completedCleanup.values()];
    const outcome = processes.reduce<CleanupOutcome>((worst, result) => cleanupRank[result.outcome] > cleanupRank[worst] ? result.outcome : worst, 'confirmed');
    return {outcome, reason, requestedAt, completedAt: timestamp(), processes: processes.map(item => structuredClone(item))};
  }

  private async terminate(pid: number, reason: string) {
    const tracked = this.processes.get(pid);
    if (!tracked) {
      const completed = this.completedCleanup.get(pid);
      if (completed) return completed;
      const at = timestamp(), identity = {pid, platform: this.termination.platform, startedAtToken: null, capturedAt: at};
      return {identity, outcome: 'uncertain', reason, signals: [], requestedAt: at, verifiedAt: at, detail: 'process_not_tracked'} satisfies ProcessCleanupResult;
    }
    tracked.termination ??= this.termination.terminate(tracked.identity, tracked.child, reason).then(result => { this.completedCleanup.set(pid, result); return result; });
    const result = await tracked.termination;
    await Promise.race([tracked.completed, delay(2_000)]);
    return result;
  }
}

function sessionCapabilities(terminal: 'pipe' | 'pty', interactiveInput: boolean, signals: boolean, remoteTransport: boolean, interactionPolicy?: ExecutionSessionScope['interactionPolicy']): ExecutionSessionCapabilities {
  const supportedSignals: ExecutionSessionSignal[] = signals ? ['INTERRUPT', 'TERMINATE', ...(process.platform === 'win32' ? [] : ['SUSPEND', 'CONTINUE'] as ExecutionSessionSignal[])] : [];
  const exposedTerminal = remoteTransport ? 'ssh-channel' : terminal;
  return {
    observableOutput: true, interactiveInput, terminal: exposedTerminal, resize: false, signals: supportedSignals,
    suspendResume: supportedSignals.includes('SUSPEND'), persistent: false, reconnectable: false, remoteTransport,
    modes: {watch: true, intervene: interactiveInput || supportedSignals.length > 0, takeControl: false},
    limitations: [terminal === 'pty' ? 'util-linux PTY adapter does not expose terminal resize through Node.js' : 'pipe-backed session; terminal resize unavailable', 'controller restart cannot recover the live byte stream', ...(interactionPolicy==='WATCH_ONLY'?['governed protected-resource action is observable but intervention is policy-forbidden']:interactiveInput ? [] : ['stdin closed by action policy']), 'exclusive TAKE CONTROL requires an adapter with autonomous-writer fencing and reconciliation'],
  };
}

function prepareLaunch(request: OwnedProcessRequest): ProcessLaunch {
  if (request.session?.terminal !== 'pty') return {command: request.command, args: request.args ?? [], terminal: 'pipe', adapterId: 'local-pipe'};
  if (process.platform !== 'linux') throw new Error(process.platform === 'win32' ? 'owned_process_conpty_adapter_unavailable' : 'owned_process_pty_adapter_unavailable');
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-pty-'));
  const payload = path.join(temporaryRoot, 'launch.json');
  fs.writeFileSync(payload, JSON.stringify({command: request.command, args: request.args ?? [], cwd: request.cwd ?? process.cwd()}), {mode: 0o600});
  const runner = fileURLToPath(new URL('../../scripts/execution-session-runner.mjs', import.meta.url));
  const command = `${shellLiteral(process.execPath)} ${shellLiteral(runner)} ${shellLiteral(payload)}`;
  return {
    command: 'script', args: ['-q', '-e', '-f', '-c', command, '/dev/null'], terminal: 'pty', adapterId: 'linux-util-linux-pty',
    cleanup: () => fs.rmSync(temporaryRoot, {recursive: true, force: true}),
  };
}

function shellLiteral(value: string) { return `'${value.replace(/'/g, `'\\''`)}'`; }

function credentialValues(environment?: NodeJS.ProcessEnv) {
  if (!environment) return [];
  return Object.entries(environment).filter(([key, value]) => value && /(?:key|token|secret|password|credential|authorization|cookie)/i.test(key)).map(([, value]) => value!);
}

async function signalProcess(child: ChildProcess, pid: number, signal: ExecutionSessionSignal) {
  if (child.exitCode !== null || child.signalCode !== null) throw new Error('owned_process_not_running');
  const mapped: NodeJS.Signals = signal === 'INTERRUPT' ? 'SIGINT' : signal === 'TERMINATE' ? 'SIGTERM' : signal === 'SUSPEND' ? 'SIGTSTP' : 'SIGCONT';
  if (process.platform !== 'win32') process.kill(-pid, mapped);
  else if (!child.kill(mapped)) throw new Error('owned_process_signal_failed');
}

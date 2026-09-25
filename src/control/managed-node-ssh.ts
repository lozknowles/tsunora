import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {expandUserPath, type ResourceConfig} from './config.js';
import {parseManagedNodeProbe, type ManagedNodeObservation, type ManagedNodeRequest, type ManagedNodeResult, type ManagedNodeTransport} from './managed-node.js';
import type {OwnedExecution, OwnedProcessRequest} from './owned-process.js';
import {ManagedNodeProbeError} from './nested-execution.js';

export interface SshExecutionResult {status: number; stdout: string; stderr: string; timedOut?: boolean; aborted?: boolean;}
export interface SshExecutionOptions {
  timeoutMs: number;
  maxBytes: number;
  signal?: AbortSignal;
  /** Optional production process authority; absent for probes and legacy callers. */
  ownedExecution?: OwnedExecution;
  session?: OwnedProcessRequest['session'];
}
export type SshExecutor = (command: string, args: string[], input: string, options: SshExecutionOptions) => Promise<SshExecutionResult>;

const MAX_BYTES = 4 * 1024 * 1024;

export const executeSsh: SshExecutor = async (command, args, input, options) => {
  if (options.ownedExecution) return executeOwnedSsh(command, args, input, options);
  return new Promise((resolve, reject) => {
  const child = spawn(command, args, {stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false});
  const stdout: Buffer[] = [], stderr: Buffer[] = []; let bytes = 0, settled = false, timedOut = false, aborted = false;
  const stop = () => { if (!child.killed) child.kill('SIGTERM'); };
  const timer = setTimeout(() => { timedOut = true; stop(); }, options.timeoutMs);
  const onAbort = () => { aborted = true; stop(); };
  options.signal?.addEventListener('abort', onAbort, {once: true});
  const collect = (target: Buffer[]) => (chunk: Buffer) => { const value = Buffer.from(chunk); bytes += value.length; if (bytes > options.maxBytes) { stop(); return; } target.push(value); };
  child.stdout.on('data', collect(stdout)); child.stderr.on('data', collect(stderr));
  child.on('error', error => { if (settled) return; settled = true; clearTimeout(timer); options.signal?.removeEventListener('abort', onAbort); reject(error); });
  child.on('close', code => { if (settled) return; settled = true; clearTimeout(timer); options.signal?.removeEventListener('abort', onAbort); if (bytes > options.maxBytes) return reject(new Error('managed_node_response_too_large')); resolve({status: code ?? 255, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), timedOut, aborted}); });
  child.stdin.on('error', () => {}); child.stdin.end(input);
  });
};

async function executeOwnedSsh(command: string, args: string[], input: string, options: SshExecutionOptions): Promise<SshExecutionResult> {
  const timeout = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; timeout.abort('managed_node_ssh_timeout'); }, Math.max(1, options.timeoutMs));
  const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
  try {
    const result = await options.ownedExecution!.runProcess({
      command,
      args,
      input,
      maxOutputBytes: options.maxBytes,
      ...(options.session ? {session: options.session} : {}),
    }, signal);
    const totalBytes = Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr);
    if (totalBytes > options.maxBytes) throw new Error('managed_node_response_too_large');
    return {status: result.exitCode ?? 255, stdout: result.stdout, stderr: result.stderr, timedOut, aborted: Boolean(options.signal?.aborted)};
  } catch (error) {
    if (timedOut || options.signal?.aborted) return {status: 255, stdout: '', stderr: '', timedOut, aborted: Boolean(options.signal?.aborted)};
    throw error;
  } finally { clearTimeout(timer); }
}

export function sshResourceArgs(resource: ResourceConfig, remote: string[]) {
  const transport = resource.transport, args = ['-T', '-o', 'BatchMode=yes', '-o', 'PasswordAuthentication=no', '-o', 'ClearAllForwardings=yes', '-o', 'ConnectTimeout=8'];
  if (transport.identityFile) args.push('-i', expandUserPath(transport.identityFile)!);
  if (transport.port && transport.port !== 22) args.push('-p', String(transport.port));
  args.push(`${transport.user ? `${transport.user}@` : ''}${transport.host}`, ...remote);
  return args;
}

function script(name: string) { return fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), `../../scripts/${name}`), 'utf8'); }
function clip(value: string) { return value.replace(/\0/g, '').slice(0, MAX_BYTES); }

export class SshManagedNodeTransport implements ManagedNodeTransport {
  private readonly probeScript: string;
  private readonly actionScript: string;
  constructor(private readonly executor: SshExecutor = executeSsh, scripts: {probe?: string; action?: string} = {}) {
    this.probeScript = scripts.probe ?? script('managed-node-probe.sh');
    this.actionScript = scripts.action ?? script('managed-node-action.sh');
  }
  async probe(resource: ResourceConfig, at: string): Promise<ManagedNodeObservation> {
    const seconds = resource.managedNode?.probeTimeoutSeconds ?? 20;
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 120) throw new Error('managed_node_probe_timeout_invalid');
    const result = await this.executor('ssh', sshResourceArgs(resource, ['sh', '-s']), this.probeScript, {timeoutMs: seconds * 1000, maxBytes: MAX_BYTES});
    if (result.timedOut) throw new ManagedNodeProbeError('TIMEOUT', 'managed_node_probe_timeout');
    if (result.aborted) throw new ManagedNodeProbeError('ABORTED', 'managed_node_probe_aborted');
    if (result.status !== 0) {
      const detail = clip(result.stderr).trim().split(/\r?\n/).at(-1) ?? String(result.status);
      if (/permission denied|publickey|authentication/i.test(detail)) throw new ManagedNodeProbeError('AUTHENTICATION', `managed_node_probe_authentication_failed:${detail}`);
      if (/connection refused|no route|network is unreachable|could not resolve|name or service not known/i.test(detail)) throw new ManagedNodeProbeError('TRANSPORT', `managed_node_probe_transport_failed:${detail}`);
      if (result.status === 127) throw new ManagedNodeProbeError('CAPABILITY_ABSENCE', `managed_node_probe_shell_unavailable:${detail}`);
      throw new ManagedNodeProbeError('COMMAND', `managed_node_probe_command_failed:${detail}`);
    }
    return parseManagedNodeProbe(result.stdout, at);
  }
  async execute(resource: ResourceConfig, request: ManagedNodeRequest, signal?: AbortSignal): Promise<Omit<ManagedNodeResult, 'schema' | 'resourceId' | 'observedAt' | 'operation'>> {
    const target = request.target === undefined ? '__none__' : String(request.target), value = request.value === undefined ? '__none__' : String(request.value);
    const result = await this.executor('ssh', sshResourceArgs(resource, ['sh', '-s', '--', request.operation, target, value]), this.actionScript, {timeoutMs: 30 * 60_000, maxBytes: MAX_BYTES, signal});
    if (result.timedOut) throw new Error('managed_node_action_timeout');
    if (result.aborted) throw new Error('managed_node_action_cancelled');
    return {exitCode: result.status, stdout: clip(result.stdout), stderr: clip(result.stderr)};
  }
}

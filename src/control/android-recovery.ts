import type {ResourceConfig} from './config.js';
import {expandUserPath} from './config.js';
import {OwnedProcessManager} from './owned-process.js';
import {Trace} from './telemetry.js';

export type AndroidLifecycle = 'unconfigured' | 'offline' | 'transport-ready' | 'node-degraded' | 'node-ready' | 'endpoint-ready' | 'capability-ready' | 'recovery-failed';
export interface AndroidRecoveryState {resourceId: string; state: AndroidLifecycle; detail: string; recovered: boolean;}
export interface AndroidCommandResult {status: number | null; stdout: string; stderr: string;}
export type AndroidExec = (command: string, args: string[], timeout: number, input?: string, signal?: AbortSignal) => Promise<AndroidCommandResult>;

function abortableDelay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason ?? new Error('android_recovery_aborted')); return; }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    const abort = () => { clearTimeout(timer); reject(signal?.reason ?? new Error('android_recovery_aborted')); };
    signal?.addEventListener('abort', abort, {once: true});
  });
}

const defaultExec: AndroidExec = async (command, args, timeout, input, signal) => {
  const timeoutController = new AbortController(), timer = setTimeout(() => timeoutController.abort(new Error(`android_command_timeout:${timeout}ms`)), timeout);
  const combined = signal ? AbortSignal.any([signal, timeoutController.signal]) : timeoutController.signal;
  try {
    const result = await new OwnedProcessManager().runProcess({command, args, input, maxOutputBytes: 256 * 1024}, combined);
    return {status: result.exitCode, stdout: result.stdout, stderr: result.stderr};
  } finally { clearTimeout(timer); }
};

export class AndroidRecovery {
  constructor(readonly resource: ResourceConfig, readonly token: string, readonly autoRecover: boolean, readonly trace = new Trace(), readonly exec: AndroidExec = defaultExec, readonly wait: (ms: number, signal?: AbortSignal) => Promise<void> = abortableDelay, readonly recoveryTimeoutMs = 90_000) {}

  private run(command: string, args: string[], timeout = 10000, input?: string, signal?: AbortSignal) { return this.exec(command, args, timeout, input, signal); }
  private ssh(command: string, signal?: AbortSignal) { return this.sshRequest(command, undefined, signal); }
  private sshScript(script: string, signal?: AbortSignal) { return this.sshRequest('sh -s', script, signal); }
  private sshRequest(remoteCommand: string, input?: string, signal?: AbortSignal) {
    const transport = this.resource.transport;
    if (transport.type !== 'ssh' || !transport.host) return Promise.resolve({status: 2, stdout: '', stderr: ''});
    const args = ['-o', 'PasswordAuthentication=no', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8'];
    if (transport.identityFile) args.push('-i', expandUserPath(transport.identityFile) ?? transport.identityFile);
    if (transport.port) args.push('-p', String(transport.port));
    args.push(`${transport.user ? `${transport.user}@` : ''}${transport.host}`, remoteCommand);
    return this.run('ssh', args, 12000, input, signal);
  }
  private localHealth(signal?: AbortSignal) {
    const url = this.resource.android?.localHealthUrl ?? this.resource.healthUrl;
    return url ? this.run('curl', ['-fsS', '--max-time', '3', url], 5000, undefined, signal) : Promise.resolve({status: 2, stdout: '', stderr: ''});
  }
  private remoteHealth(signal?: AbortSignal) {
    const url = this.resource.android?.remoteHealthUrl;
    return url ? this.ssh(`curl -fsS --max-time 3 ${JSON.stringify(url)}`, signal) : Promise.resolve({status: 2, stdout: '', stderr: ''});
  }
  private state(state: AndroidLifecycle, detail: string, recovered = false): AndroidRecoveryState { return {resourceId: this.resource.id, state, detail, recovered}; }
  async probe(signal?: AbortSignal): Promise<AndroidRecoveryState> {
    if (this.resource.platform !== 'android' || !this.resource.android) return this.state('unconfigured', 'Android recovery is not configured');
    if ((await this.localHealth(signal)).status === 0) return this.state('endpoint-ready', 'configured Android endpoint is healthy');
    if (this.resource.transport.type !== 'ssh') return this.state('unconfigured', `recovery does not implement transport ${this.resource.transport.type}`);
    if ((await this.ssh('echo AGENT-CONTROL-TRANSPORT-READY', signal)).status !== 0) return this.state('offline', 'configured SSH transport is unavailable');
    if ((await this.remoteHealth(signal)).status !== 0) return this.state('node-degraded', 'SSH is ready; configured Android node is unavailable');
    return this.state('node-ready', 'Android node is healthy; configured local endpoint is unavailable');
  }
  async recover(signal?: AbortSignal): Promise<AndroidRecoveryState> {
    const span = this.trace.span('resource.android.recovery', {resource: this.resource.id}), timeout = new AbortController(), timer = setTimeout(() => timeout.abort(new Error(`android_recovery_timeout:${this.recoveryTimeoutMs}ms`)), this.recoveryTimeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
    try {
      const probe = await this.probe(combined); span.event('probe', {state: probe.state, detail: probe.detail});
      if (probe.state === 'endpoint-ready') { span.end(true, {state: probe.state, action: 'none'}); return probe; }
      if (!this.autoRecover) { span.end(false, {state: probe.state, action: 'manual-required'}); return probe; }
      if (probe.state === 'node-ready') { span.end(true, {state: probe.state, action: 'external-endpoint-required'}); return probe; }
      if (probe.state !== 'node-degraded') { span.end(false, {state: probe.state, action: 'no-allow-listed-repair'}); return probe; }
      const android = this.resource.android;
      if (!android?.remoteDirectory || !android.startCommand || !this.token) {
        const result = this.state('recovery-failed', 'remote directory, start command or credential is unavailable'); span.end(false, {state: result.state, action: 'configuration-required'}); return result;
      }
      const token64 = Buffer.from(this.token, 'utf8').toString('base64'), remoteDir = android.remoteDirectory.replace(/^~\//, '$HOME/');
      const script = `set -eu\nIFS= read -r AGENT_CONTROL_NODE_TOKEN_B64\n${token64}\nexport AGENT_CONTROL_NODE_TOKEN=$(printf %s "$AGENT_CONTROL_NODE_TOKEN_B64" | base64 -d)\ncd ${JSON.stringify(remoteDir)}\n${android.startCommand}\n`;
      const started = await this.sshScript(script, combined); span.event('node-start', {sshOk: started.status === 0, method: 'configured-command-stdin'});
      for (let attempt = 0; attempt < 30; attempt++) {
        await this.wait(500, combined);
        const remote = (await this.remoteHealth(combined)).status === 0, local = (await this.localHealth(combined)).status === 0;
        span.event('readiness', {attempt: attempt + 1, remote, local});
        if (local) { span.end(true, {state: 'capability-ready', attempt: attempt + 1}); return this.state('capability-ready', 'Android resource recovered and endpoint validated', true); }
        if (remote && attempt >= 5) { span.end(true, {state: 'node-ready', attempt: attempt + 1}); return this.state('node-ready', 'Android node recovered; endpoint transport remains external', true); }
      }
      span.end(false, {state: 'recovery-failed', sshStatus: started.status}); return this.state('recovery-failed', 'Android node unavailable after configured recovery command');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error); span.end(false, {state: 'recovery-failed', reason}); return this.state('recovery-failed', `Android recovery stopped: ${reason}`);
    } finally { clearTimeout(timer); }
  }
}

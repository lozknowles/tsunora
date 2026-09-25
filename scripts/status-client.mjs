import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const STATUS_SCHEMA = 'agent-control.system-status/v1';
export const STATUS_CLIENT_SCHEMA = 'agent-control.status-client/v1';
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

export class StatusClientError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StatusClientError';
    this.code = code;
  }
}

function integer(value, fallback, label, minimum = 1, maximum = 65_535) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new StatusClientError('INVALID_CLIENT_CONFIG', `${label} must be an integer from ${minimum} to ${maximum}`);
  return parsed;
}

function rejectSecrets(value, trail = 'client') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/token|password|secret|credential|api.?key/i.test(key)) throw new StatusClientError('INVALID_CLIENT_CONFIG', `secret material is forbidden in ${trail}.${key}`);
    rejectSecrets(child, `${trail}.${key}`);
  }
}

function statusUrl(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new StatusClientError('INVALID_CLIENT_CONFIG', 'controller status URL is invalid'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new StatusClientError('INVALID_CLIENT_CONFIG', 'controller status URL must be HTTP(S) without embedded credentials');
  if (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname.toLowerCase())) throw new StatusClientError('INVALID_CLIENT_CONFIG', 'cleartext controller status URL must remain loopback-local');
  if (url.pathname === '/' || url.pathname === '') url.pathname = '/api/status';
  return url.toString();
}

function safeDnsName(value, label) {
  if (typeof value !== 'string' || !/^[a-z0-9](?:[a-z0-9._-]{0,251}[a-z0-9])?$/i.test(value)) throw new StatusClientError('INVALID_CLIENT_CONFIG', `${label} must be a DNS name or IPv4 address`);
  return value;
}

function safeUser(value) {
  if (value === undefined) return undefined;
  if (!/^[a-z0-9._-]+$/i.test(value)) throw new StatusClientError('INVALID_CLIENT_CONFIG', 'controller SSH user is invalid');
  return value;
}

function safeStatusPath(value = '/api/status') {
  if (typeof value !== 'string' || !/^\/[a-z0-9._~%/-]*$/i.test(value)) throw new StatusClientError('INVALID_CLIENT_CONFIG', 'controller status path is invalid');
  return value;
}

function expandHome(value, environment, homeDirectory) {
  return value?.replace(/^~(?=$|[\\/])/, environment.HOME || environment.USERPROFILE || homeDirectory);
}

export function defaultStatusClientConfigPath(environment = process.env, platform = process.platform, homeDirectory = os.homedir()) {
  if (environment.AGENT_CONTROL_STATUS_CONFIG?.trim()) return path.resolve(environment.AGENT_CONTROL_STATUS_CONFIG.trim());
  if (platform === 'win32') return path.join(environment.APPDATA || path.join(homeDirectory, 'AppData', 'Roaming'), 'Agent Control', 'status-client.json');
  return path.join(environment.XDG_CONFIG_HOME || path.join(homeDirectory, '.config'), 'agent-control', 'status-client.json');
}

function validateClientConfig(raw, environment, homeDirectory) {
  if (!raw || typeof raw !== 'object' || raw.schema !== STATUS_CLIENT_SCHEMA || !raw.controller || typeof raw.controller !== 'object') throw new StatusClientError('INVALID_CLIENT_CONFIG', `client configuration must use schema ${STATUS_CLIENT_SCHEMA}`);
  rejectSecrets(raw);
  const controller = raw.controller;
  if (controller.transport === 'http') return {transport: 'http', url: statusUrl(controller.url), timeoutMs: integer(controller.timeoutMs, 5_000, 'timeoutMs', 250, 60_000)};
  if (controller.transport !== 'ssh') throw new StatusClientError('INVALID_CLIENT_CONFIG', 'controller transport must be http or ssh');
  const statusHost = controller.statusHost === undefined ? '127.0.0.1' : safeDnsName(controller.statusHost, 'statusHost');
  if (!['127.0.0.1', 'localhost'].includes(statusHost.toLowerCase())) throw new StatusClientError('INVALID_CLIENT_CONFIG', 'SSH statusHost must remain controller-local');
  return {
    transport: 'ssh',
    host: safeDnsName(controller.host, 'controller host'),
    user: safeUser(controller.user),
    port: integer(controller.port, 22, 'SSH port'),
    identityFile: expandHome(controller.identityFile, environment, homeDirectory),
    statusHost,
    statusPort: integer(controller.statusPort, 4_310, 'statusPort'),
    statusPath: safeStatusPath(controller.statusPath),
    timeoutMs: integer(controller.timeoutMs, 8_000, 'timeoutMs', 250, 60_000),
  };
}

export function resolveStatusTarget({environment = process.env, platform = process.platform, homeDirectory = os.homedir(), fileSystem = fs} = {}) {
  const timeoutMs = integer(environment.AGENT_CONTROL_STATUS_TIMEOUT_MS, 5_000, 'AGENT_CONTROL_STATUS_TIMEOUT_MS', 250, 60_000);
  const directUrl = environment.AGENT_CONTROL_STATUS_URL?.trim();
  if (directUrl) return {transport: 'http', url: statusUrl(directUrl), timeoutMs, configuredBy: 'environment'};

  const sshHost = environment.AGENT_CONTROL_STATUS_SSH_HOST?.trim();
  if (sshHost) {
    const webPort = integer(environment.AGENT_CONTROL_WEB_PORT, 4_310, 'AGENT_CONTROL_WEB_PORT');
    return {
      transport: 'ssh',
      host: safeDnsName(sshHost, 'controller host'),
      user: safeUser(environment.AGENT_CONTROL_STATUS_SSH_USER?.trim() || undefined),
      port: integer(environment.AGENT_CONTROL_STATUS_SSH_PORT, 22, 'AGENT_CONTROL_STATUS_SSH_PORT'),
      identityFile: expandHome(environment.AGENT_CONTROL_STATUS_SSH_IDENTITY_FILE?.trim() || undefined, environment, homeDirectory),
      statusHost: '127.0.0.1',
      statusPort: integer(environment.AGENT_CONTROL_STATUS_REMOTE_PORT, webPort, 'AGENT_CONTROL_STATUS_REMOTE_PORT'),
      statusPath: safeStatusPath(environment.AGENT_CONTROL_STATUS_REMOTE_PATH?.trim() || undefined),
      timeoutMs,
      configuredBy: 'environment',
    };
  }

  const configFile = defaultStatusClientConfigPath(environment, platform, homeDirectory);
  if (fileSystem.existsSync(configFile)) {
    let raw;
    try { raw = JSON.parse(fileSystem.readFileSync(configFile, 'utf8')); }
    catch (error) { throw new StatusClientError('INVALID_CLIENT_CONFIG', `cannot read ${configFile}: ${error instanceof Error ? error.message : String(error)}`); }
    return {...validateClientConfig(raw, environment, homeDirectory), configuredBy: configFile};
  }

  const port = integer(environment.AGENT_CONTROL_WEB_PORT, 4_310, 'AGENT_CONTROL_WEB_PORT');
  return {transport: 'http', url: `http://127.0.0.1:${port}/api/status`, timeoutMs, configuredBy: 'controller-local default'};
}

function parseSnapshot(text) {
  let value;
  try { value = JSON.parse(text); }
  catch { throw new StatusClientError('INVALID_STATUS_RESPONSE', 'controller returned invalid JSON'); }
  if (!value || typeof value !== 'object' || value.schema !== STATUS_SCHEMA || value.authority !== 'AgentControlService') throw new StatusClientError('INVALID_STATUS_RESPONSE', `controller did not return ${STATUS_SCHEMA}`);
  if (!['healthy', 'degraded'].includes(value.health) || !value.scheduler || !Array.isArray(value.lanes) || !Array.isArray(value.providers) || !Array.isArray(value.resources) || !value.jobs) throw new StatusClientError('INVALID_STATUS_RESPONSE', 'controller status projection is incomplete');
  return value;
}

async function readHttp(target, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), target.timeoutMs);
  try {
    const response = await fetchImpl(target.url, {headers: {Accept: 'application/json'}, signal: controller.signal});
    if (!response.ok) throw new StatusClientError('STATUS_HTTP_ERROR', `controller returned HTTP ${response.status}`);
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new StatusClientError('STATUS_RESPONSE_TOO_LARGE', 'controller status exceeded the response limit');
    return text;
  } catch (error) {
    if (error instanceof StatusClientError) throw error;
    const timeout = error instanceof Error && error.name === 'AbortError';
    throw new StatusClientError(timeout ? 'STATUS_TIMEOUT' : 'STATUS_UNREACHABLE', timeout ? `controller did not answer within ${target.timeoutMs}ms` : 'controller status endpoint is unreachable');
  } finally { clearTimeout(timer); }
}

function sshFailure(result, timeoutMs) {
  if (result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM') return new StatusClientError('STATUS_TIMEOUT', `controller did not answer within ${timeoutMs}ms`);
  const detail = String(result.stderr || '').trim().split(/\r?\n/).filter(Boolean).at(-1)?.slice(0, 240);
  return new StatusClientError('STATUS_UNREACHABLE', detail ? `controller SSH transport failed: ${detail}` : 'controller SSH transport is unreachable');
}

function readSsh(target, execute) {
  const destination = `${target.user ? `${target.user}@` : ''}${target.host}`;
  const args = [
    '-o', 'BatchMode=yes',
    '-o', 'PasswordAuthentication=no',
    '-o', `ConnectTimeout=${Math.max(1, Math.ceil(target.timeoutMs / 1_000))}`,
    '-o', 'ClearAllForwardings=yes',
  ];
  if (target.identityFile) args.push('-i', target.identityFile);
  if (target.port !== 22) args.push('-p', String(target.port));
  const url = `http://${target.statusHost}:${target.statusPort}${target.statusPath}`;
  args.push(destination, 'curl', '-fsS', '--max-time', String(Math.max(1, Math.ceil(target.timeoutMs / 1_000))), '--', url);
  const result = execute('ssh', args, {encoding: 'utf8', timeout: target.timeoutMs, maxBuffer: MAX_RESPONSE_BYTES + 64 * 1024, windowsHide: true});
  if (result.status !== 0) throw sshFailure(result, target.timeoutMs);
  const output = String(result.stdout || '');
  if (Buffer.byteLength(output) > MAX_RESPONSE_BYTES) throw new StatusClientError('STATUS_RESPONSE_TOO_LARGE', 'controller status exceeded the response limit');
  return output;
}

export async function readAuthoritativeStatus({environment = process.env, platform = process.platform, homeDirectory = os.homedir(), fileSystem = fs, fetchImpl = fetch, execute = spawnSync} = {}) {
  const target = resolveStatusTarget({environment, platform, homeDirectory, fileSystem});
  const text = target.transport === 'http' ? await readHttp(target, fetchImpl) : readSsh(target, execute);
  const snapshot = parseSnapshot(text);
  const source = target.transport === 'http'
    ? {transport: 'http', controller: new URL(target.url).host, configuredBy: target.configuredBy}
    : {transport: 'ssh', controller: `${target.user ? `${target.user}@` : ''}${target.host}`, configuredBy: target.configuredBy};
  return {snapshot, source};
}

const clip = (value, size) => { const text = String(value ?? ''); return text.length <= size ? text : `${text.slice(0, Math.max(1, size - 3))}...`; };
const state = value => String(value ?? 'unknown').toUpperCase();
const bytes = value => { const number = Number(value); if (!Number.isFinite(number)) return '--'; const units = ['B', 'KB', 'MB', 'GB', 'TB']; let current = number, unit = 0; while (current >= 1000 && unit < units.length - 1) { current /= 1000; unit++; } return `${current.toFixed(unit > 1 ? 1 : 0)}${units[unit]}`; };
const duration = seconds => { const value = Number(seconds); if (!Number.isFinite(value)) return '--'; const days = Math.floor(value / 86400), hours = Math.floor(value % 86400 / 3600), minutes = Math.floor(value % 3600 / 60); return days ? `${days}d${hours}h` : hours ? `${hours}h${minutes}m` : `${minutes}m`; };

function resourceLines(resource) {
  const node = resource.node, headline = `${state(node?.state ?? resource.health).padEnd(10)} ${clip(resource.name, 24).padEnd(24)} ${resource.platform}/${resource.transport}${Number.isFinite(resource.capacity) ? ` ${resource.active}/${resource.capacity}` : ''}  ${clip(resource.capabilities.join(', ') || 'unqualified', 52)}`;
  if (!node) return [headline];
  const storage = [...(node.storage || [])].sort((a, b) => b.usedPercent - a.usedPercent)[0], load = node.cpu?.load, memory = node.memory;
  const metrics = `heartbeat ${node.lastHeartbeatAt ?? '--'}  uptime ${duration(node.uptimeSeconds)}  load ${load ? `${load.one}/${load.five}/${load.fifteen}` : '--'}  memory ${memory ? `${bytes(memory.availableBytes)} free/${bytes(memory.totalBytes)}` : '--'}`;
  const connectivity = (node.connectivity || []).map(item => `${item.label}:${item.state}`).join(',') || 'not-configured';
  const workload = `workload ${node.currentWorkload ?? 'none'}  maintenance ${node.maintenance?.state ?? 'UNAVAILABLE'}  connectivity ${connectivity}${storage ? `  storage ${storage.mount} ${bytes(storage.availableBytes)} free` : ''}`;
  return [headline, `  ${clip(metrics, 116)}`, `  ${clip(workload, 116)}`];
}

export function formatAuthoritativeStatus(snapshot, source) {
  const lines = [
    `AGENT CONTROL ${snapshot.version}  ${state(snapshot.health)}`,
    `Authority ${snapshot.authority} via ${source.transport.toUpperCase()} ${source.controller}  observed ${snapshot.observedAt}`,
    `Scheduler ${snapshot.paused ? 'PAUSED' : 'ACTIVE'}  active ${snapshot.scheduler.active}  waiting ${snapshot.scheduler.waiting}  paused ${snapshot.scheduler.paused}  next ${snapshot.scheduler.nextLaneId ?? '--'}`,
    `Jobs total ${snapshot.jobs.total}  running ${snapshot.jobs.running}  queued ${snapshot.jobs.queued}  failed ${snapshot.jobs.failed}  succeeded ${snapshot.jobs.succeeded}  schedules ${snapshot.jobs.schedulesEnabled}`,
    `Approvals ${snapshot.outstandingApprovals}  restore ${snapshot.lastRestorePoint ?? '--'}`,
    '',
    'LANES',
    ...(snapshot.lanes.length ? snapshot.lanes.map(lane => `${state(lane.status).padEnd(10)} ${String(lane.id).padStart(2)} ${clip(lane.name, 20).padEnd(20)} P${String(lane.priority).padStart(2)} ${clip(lane.task, 52)}`) : ['NONE']),
    '',
    'PROVIDERS',
    ...(snapshot.providers.length ? snapshot.providers.map(provider => `${state(provider.health).padEnd(10)} ${clip(provider.name, 24).padEnd(24)} ${clip(provider.capabilities.join(', ') || 'unqualified', 60)}`) : ['NONE CONFIGURED']),
    '',
    'RESOURCES',
    ...(snapshot.resources.length ? snapshot.resources.flatMap(resourceLines) : ['NONE CONFIGURED']),
  ];
  return `${lines.join('\n')}\n`;
}

export function statusExitCode(snapshot) { return snapshot.health === 'healthy' ? 0 : 1; }

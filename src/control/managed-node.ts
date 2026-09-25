import type {ManagedNodeConfig, ManagedWorkloadConfig, ResourceConfig} from './config.js';
import type {WorkerRegistry} from './job-runtime.js';
import {deriveCpuBusy, scalarMeasurement, unavailableMeasurement, type CpuCounterFrame, type ResourceMeasurement} from './resource-telemetry.js';
import {classifyManagedNodeProbeFailure, discoverContainerRuntimes, type ContainerRuntimeObservation, type ProbeFailureClassification} from './nested-execution.js';

export const MANAGED_NODE_SCHEMA = 'agent-control.managed-node/v1' as const;
export const MANAGED_NODE_RESULT_SCHEMA = 'agent-control.managed-node-result/v1' as const;
export const MAINTENANCE_APPROVAL = 'managed-node.maintenance';
export const PROTECTED_WORKLOAD_OVERRIDE = 'managed-node.protected-workload-override';

export type ManagedNodeState = 'ONLINE' | 'IDLE' | 'BUSY' | 'DEGRADED' | 'OFFLINE';
export type ManagedNodeHealth = 'unknown' | 'healthy' | 'degraded' | 'offline';
export type ManagedNodeOperation =
  | 'system.identity'
  | 'process.list'
  | 'logs.read'
  | 'package.query'
  | 'service.status'
  | 'housekeeping.preview'
  | 'package.install'
  | 'package.remove'
  | 'package.update'
  | 'service.start'
  | 'service.stop'
  | 'service.restart'
  | 'housekeeping.journal-vacuum'
  | 'runtime.update'
  | 'system.reboot'
  | 'system.shutdown';

export interface ManagedNodeStorage {source: string; mount: string; totalBytes: number; availableBytes: number; usedPercent: number;}
export interface ManagedNodeOpticalDevice {name: string; model?: string; transport?: string; holders: number[];}
export interface ManagedNodeProcess {pid: number; names: string[]; unit?: string;}
export interface ManagedNodeWorkload {id: string; capability: string; state: 'ACTIVE' | 'IDLE'; protected: boolean; evidence: string[];}
export interface ManagedNodeConnectivity {id: string; label: string; capability: string; state: 'RUNNING' | 'DEGRADED' | 'UNAVAILABLE'; interfaceName?: string; addresses: string[]; evidence: string[];}
export interface ManagedNodeObservation {
  observedAt: string;
  hostname: string;
  os: {id?: string; name?: string; version?: string; kernel?: string; architecture?: string};
  cpu: {model?: string; logical: number | null};
  memory: {totalBytes: number | null; availableBytes: number | null};
  uptimeSeconds: number | null;
  load: {one: number | null; five: number | null; fifteen: number | null};
  metricSources?: Partial<Record<'cpu.logical' | 'memory.totalBytes' | 'memory.availableBytes' | 'uptimeSeconds' | 'load.one' | 'load.five' | 'load.fifteen', string>>;
  cpuCounters?: CpuCounterFrame;
  storage: ManagedNodeStorage[];
  optical: ManagedNodeOpticalDevice[];
  network: string[];
  temperatures: Array<{name: string; celsius: number}>;
  services: string[];
  tools: string[];
  processes: ManagedNodeProcess[];
}

export interface ManagedNodeSnapshot {
  schema: typeof MANAGED_NODE_SCHEMA;
  resourceId: string;
  state: ManagedNodeState;
  health: ManagedNodeHealth;
  hostname?: string;
  lastHeartbeatAt: string | null;
  lastProbeAt: string | null;
  uptimeSeconds?: number | null;
  os?: ManagedNodeObservation['os'];
  cpu?: ManagedNodeObservation['cpu'] & {load: ManagedNodeObservation['load']};
  memory?: ManagedNodeObservation['memory'];
  measurements: {
    cpuLogical: ResourceMeasurement<number>;
    cpuBusyPercent: ResourceMeasurement<number>;
    memoryTotalBytes: ResourceMeasurement<number>;
    memoryAvailableBytes: ResourceMeasurement<number>;
    uptimeSeconds: ResourceMeasurement<number>;
    loadOne: ResourceMeasurement<number>;
    loadFive: ResourceMeasurement<number>;
    loadFifteen: ResourceMeasurement<number>;
  };
  storage: ManagedNodeStorage[];
  optical: ManagedNodeOpticalDevice[];
  network: string[];
  temperatures: ManagedNodeObservation['temperatures'];
  services: string[];
  containerRuntimes?: ContainerRuntimeObservation[];
  connectivity: ManagedNodeConnectivity[];
  capabilities: string[];
  workloads: ManagedNodeWorkload[];
  currentWorkload: string | null;
  maintenance: {state: 'APPROVAL_REQUIRED' | 'BLOCKED_PROTECTED_WORKLOAD' | 'UNAVAILABLE'; detail: string};
  warnings: string[];
  lastProbeFailure?: {classification: ProbeFailureClassification; detail: string; observedAt: string};
}

export interface ManagedNodeRequest {operation: ManagedNodeOperation; target?: string; value?: string | number;}
export interface ManagedNodeResult {schema: typeof MANAGED_NODE_RESULT_SCHEMA; resourceId: string; operation: ManagedNodeOperation; observedAt: string; exitCode: number; stdout: string; stderr: string;}
export interface ManagedNodeTransport {
  probe(resource: ResourceConfig, at: string): Promise<ManagedNodeObservation>;
  execute(resource: ResourceConfig, request: ManagedNodeRequest, signal?: AbortSignal): Promise<Omit<ManagedNodeResult, 'schema' | 'resourceId' | 'observedAt' | 'operation'>>;
}

interface ProbeRecords {get(key: string): string | undefined; all(key: string): string[];}
const KNOWN_DVD_TOOLS = new Set(['makemkvcon', 'HandBrakeCLI', 'dvdbackup', 'vobcopy', 'cdparanoia', 'abcde']);
const DEFAULT_BUSY_BLOCKED = ['compute.intensive', 'storage.destructive', 'device.optical.write', 'system.power', 'package.mutate', 'service.mutate'];
const READ_ONLY = new Set<ManagedNodeOperation>(['system.identity', 'process.list', 'logs.read', 'package.query', 'service.status', 'housekeeping.preview']);
const PACKAGE_NAME = /^[a-z0-9][a-z0-9+._-]{0,127}$/i;
const UNIT_NAME = /^[a-z0-9@_.:-]+\.(?:service|timer|socket)$/i;

function number(value: string | undefined) { if (value === undefined || value.trim() === '') return null; const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null; }
function unique(values: string[]) { return [...new Set(values.filter(Boolean))].sort(); }
function health(state: ManagedNodeState): ManagedNodeHealth { return state === 'OFFLINE' ? 'offline' : state === 'DEGRADED' ? 'degraded' : 'healthy'; }
function safeDetail(value: unknown) { return String(value instanceof Error ? value.message : value).replace(/[\r\n\0]+/g, ' ').slice(0, 240) || 'probe_failed'; }

export function parseProbeRecords(output: string): ProbeRecords {
  const values = new Map<string, string[]>();
  for (const line of output.split(/\r?\n/)) {
    if (!line) continue;
    const split = line.indexOf('\t');
    if (split <= 0) throw new Error('managed_node_probe_record_invalid');
    const key = line.slice(0, split), encoded = line.slice(split + 1);
    if (!/^[a-z0-9_]+$/.test(key) || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('managed_node_probe_record_invalid');
    const value = Buffer.from(encoded, 'base64').toString('utf8');
    const list = values.get(key) ?? []; list.push(value); values.set(key, list);
  }
  return {get: key => values.get(key)?.[0], all: key => [...(values.get(key) ?? [])]};
}

export function parseManagedNodeProbe(output: string, observedAt: string): ManagedNodeObservation {
  const records = parseProbeRecords(output);
  if (records.get('protocol') !== 'agent-control.managed-node-probe/v1' || records.get('probe_complete') !== 'true') throw new Error('managed_node_probe_incomplete');
  const storage = records.all('storage').map(row => { const [source, total, available, percent, ...mount] = row.split('\t'); return {source, totalBytes: number(total), availableBytes: number(available), usedPercent: number(percent?.replace('%', '')), mount: mount.join('\t')}; }).filter((item): item is ManagedNodeStorage => Boolean(item.source && item.mount && item.totalBytes !== null && item.availableBytes !== null && item.usedPercent !== null));
  const holders = new Map<string, number[]>();
  for (const row of records.all('optical_holder')) { const [device, pid] = row.split('\t'), parsed = Number(pid); if (device && Number.isSafeInteger(parsed)) holders.set(device, [...(holders.get(device) ?? []), parsed]); }
  const optical = records.all('optical').map(row => { const [name, model, transport] = row.split('\t'); return {name, model: model || undefined, transport: transport || undefined, holders: holders.get(name) ?? []}; }).filter(item => item.name);
  const processes = records.all('process').map(row => { const [pid, comm, arg0, arg1, unit] = row.split('\t'), parsed = Number(pid); return {pid: parsed, names: unique([comm, arg0, arg1]), unit: unit || undefined}; }).filter(item => Number.isSafeInteger(item.pid));
  const temperatures = records.all('temperature').map(row => { const [name, raw] = row.split('\t'), value = number(raw); return {name, celsius: value === null ? null : value > 1000 ? value / 1000 : value}; }).filter((item): item is {name: string; celsius: number} => Boolean(item.name && item.celsius !== null && item.celsius >= -100 && item.celsius <= 250));
  const counterKind = records.get('cpu_counter_kind');
  const counters = records.all('cpu_counter').map(row => {
    const [cpu, online, idle, total] = row.split('\t'), idleValue = number(idle), totalValue = number(total);
    if (!cpu || idleValue === null || !['true', 'false'].includes(online)) return null;
    return {cpu, online: online === 'true', idle: idleValue, ...(totalValue === null ? {} : {total: totalValue})};
  }).filter((item): item is CpuCounterFrame['counters'][number] => item !== null);
  const cpuCounters = ['procfs-times', 'sysfs-idle'].includes(counterKind ?? '') && counters.length
    ? {kind: counterKind as CpuCounterFrame['kind'], observedAt, logicalOnline: number(records.get('cpu_counter_logical_online')), counters}
    : undefined;
  return {
    observedAt,
    hostname: records.get('hostname') ?? '',
    os: {id: records.get('os_id') || undefined, name: records.get('os_name') || undefined, version: records.get('os_version') || undefined, kernel: records.get('kernel') || undefined, architecture: records.get('architecture') || undefined},
    cpu: {model: records.get('cpu_model') || undefined, logical: number(records.get('cpu_logical'))},
    memory: {totalBytes: number(records.get('memory_total_bytes')), availableBytes: number(records.get('memory_available_bytes'))},
    uptimeSeconds: number(records.get('uptime_seconds')),
    load: {one: number(records.get('load_1')), five: number(records.get('load_5')), fifteen: number(records.get('load_15'))},
    metricSources: {
      'cpu.logical': records.get('cpu_logical_source') || undefined,
      'memory.totalBytes': records.get('memory_total_bytes_source') || undefined,
      'memory.availableBytes': records.get('memory_available_bytes_source') || undefined,
      uptimeSeconds: records.get('uptime_seconds_source') || undefined,
      'load.one': records.get('load_source') || undefined,
      'load.five': records.get('load_source') || undefined,
      'load.fifteen': records.get('load_source') || undefined,
    },
    ...(cpuCounters ? {cpuCounters} : {}),
    storage,
    optical,
    network: records.all('network'),
    temperatures,
    services: unique(records.all('service')),
    tools: unique(records.all('tool')),
    processes,
  };
}

function processMatches(process: ManagedNodeProcess, detector: ManagedWorkloadConfig) {
  if (detector.systemdUnit && process.unit !== detector.systemdUnit) return false;
  const expected = new Set(detector.processExecutables ?? []);
  return process.names.some(name => expected.has(name));
}

function workloads(observation: ManagedNodeObservation, config: ManagedNodeConfig): ManagedNodeWorkload[] {
  const result: ManagedNodeWorkload[] = [];
  for (const detector of config.workloads ?? []) {
    const matching = observation.processes.filter(process => processMatches(process, detector));
    const opticalHolders = detector.opticalAccess ? observation.optical.flatMap(device => device.holders) : [];
    const active = matching.length > 0 || opticalHolders.length > 0;
    const available = detector.systemdUnit
      ? observation.services.includes(detector.systemdUnit)
      : (detector.processExecutables ?? []).some((name) => observation.tools.includes(name));
    if (active || available) result.push({id: detector.id, capability: detector.capability, state: active ? 'ACTIVE' : 'IDLE', protected: detector.protected !== false, evidence: active ? unique([...(matching.length ? [`processes:${matching.length}`] : []), ...(opticalHolders.length ? [`optical-holders:${new Set(opticalHolders).size}`] : [])]) : ['service-ready']});
  }
  const dvdProcesses = observation.processes.filter(process => process.names.some(name => KNOWN_DVD_TOOLS.has(name)));
  const opticalHolders = observation.optical.flatMap(device => device.holders);
  const configuredDvd = result.some(item => item.capability === 'workload.dvd-rip');
  const dvdAvailable = observation.optical.length > 0 && observation.tools.some(tool => KNOWN_DVD_TOOLS.has(tool));
  if (!configuredDvd && (dvdAvailable || dvdProcesses.length || opticalHolders.length)) result.push({id: 'dvd-rip', capability: 'workload.dvd-rip', state: dvdProcesses.length || opticalHolders.length ? 'ACTIVE' : 'IDLE', protected: true, evidence: dvdProcesses.length || opticalHolders.length ? unique([...(dvdProcesses.length ? [`processes:${dvdProcesses.length}`] : []), ...(opticalHolders.length ? [`optical-holders:${new Set(opticalHolders).size}`] : [])]) : ['optical-drive-and-rip-tool-ready']});
  return result;
}

function connectivity(observation: ManagedNodeObservation, config: ManagedNodeConfig): ManagedNodeConnectivity[] {
  return (config.connectivity ?? []).map(detector => {
    const network = detector.interfaceName ? observation.network.find(row => row.trim().split(/\s+/)[0] === detector.interfaceName) : undefined;
    const interfaceReady = detector.interfaceName ? Boolean(network) : undefined;
    const serviceReady = detector.serviceUnit ? observation.services.includes(detector.serviceUnit) : undefined;
    const checks = [interfaceReady, serviceReady].filter((value): value is boolean => value !== undefined);
    const state: ManagedNodeConnectivity['state'] = checks.every(Boolean) ? 'RUNNING' : checks.some(Boolean) ? 'DEGRADED' : 'UNAVAILABLE';
    const fields = network?.trim().split(/\s+/) ?? [];
    const evidence = unique([...(detector.interfaceName ? [`interface:${detector.interfaceName}:${interfaceReady ? 'present' : 'missing'}`] : []), ...(detector.serviceUnit ? [`service:${detector.serviceUnit}:${serviceReady ? 'active' : 'inactive'}`] : [])]);
    return {id: detector.id, label: detector.label ?? detector.id, capability: detector.capability, state, interfaceName: detector.interfaceName, addresses: fields.slice(2), evidence};
  });
}

function capabilities(resource: ResourceConfig, observation: ManagedNodeObservation, detectedWorkloads: ManagedNodeWorkload[], connections: ManagedNodeConnectivity[]) {
  const tools = new Set(observation.tools), values = [...resource.capabilities, 'platform.linux', 'transport.ssh', 'managed-node.inspect'];
  if (tools.has('sh') || tools.has('bash')) values.push('tool.shell');
  // Executable presence is discovery evidence, not permission or runtime readiness.
  for (const [tool, runtime] of [['podman', 'podman'], ['docker', 'docker'], ['lxc-start', 'lxc']] as const) {
    if (tools.has(tool)) values.push(`container.${runtime}.detected`);
  }
  values.push(...connections.filter(item => item.state === 'RUNNING').map(item => item.capability));
  if (observation.storage.length) values.push('storage.inspect');
  if (observation.optical.length) values.push('device.optical');
  if (tools.has('journalctl')) values.push('tool.logs.read');
  values.push('tool.process.read');
  if (['apt-get', 'dnf', 'yum', 'zypper', 'pacman', 'apk'].some(tool => tools.has(tool))) values.push('tool.package.manage', 'managed-node.maintenance');
  if (tools.has('systemctl')) values.push('tool.service.manage', 'managed-node.maintenance');
  if (resource.managedNode?.runtime && tools.has('git')) values.push('runtime.maintenance', 'managed-node.maintenance');
  values.push(...detectedWorkloads.map(item => item.capability));
  return unique(values);
}

export function projectManagedNode(resource: ResourceConfig, observation: ManagedNodeObservation, cpuBusyPercent: ResourceMeasurement<number> = unavailableMeasurement(observation.observedAt, 'cpu-counters', 'first_sample_requires_prior_counter_frame')): ManagedNodeSnapshot {
  const config = resource.managedNode ?? {}, detectedWorkloads = workloads(observation, config), connections = connectivity(observation, config), warnings: string[] = [];
  for (const connection of connections) if (connection.state !== 'RUNNING') warnings.push(`connectivity:${connection.id}:${connection.state.toLowerCase()}`);
  for (const filesystem of observation.storage) if (filesystem.usedPercent >= 95) warnings.push(`storage:${filesystem.mount}:${filesystem.usedPercent}%`);
  if (observation.memory.totalBytes !== null && observation.memory.availableBytes !== null && observation.memory.totalBytes > 0 && observation.memory.availableBytes / observation.memory.totalBytes < .02) warnings.push('memory:less-than-2%-available');
  const active = detectedWorkloads.filter(item => item.state === 'ACTIVE'), protectedActive = active.filter(item => item.protected), discovered = capabilities(resource, observation, detectedWorkloads, connections);
  const state: ManagedNodeState = active.length ? 'BUSY' : warnings.length ? 'DEGRADED' : detectedWorkloads.length ? 'IDLE' : 'ONLINE';
  const projectedHealth: ManagedNodeHealth = warnings.length ? 'degraded' : health(state);
  const maintenance = protectedActive.length
    ? {state: 'BLOCKED_PROTECTED_WORKLOAD' as const, detail: `Protected workload active: ${protectedActive.map(item => item.id).join(', ')}`}
    : discovered.includes('managed-node.maintenance')
      ? {state: 'APPROVAL_REQUIRED' as const, detail: 'Typed maintenance operations require Agent Control approval'}
      : {state: 'UNAVAILABLE' as const, detail: 'No supported package, service or runtime maintenance tooling discovered'};
  const source = (key: keyof NonNullable<ManagedNodeObservation['metricSources']>) => observation.metricSources?.[key] || 'managed-node-probe:unspecified';
  const measurements = {
    cpuLogical: scalarMeasurement(observation.cpu.logical, observation.observedAt, source('cpu.logical')),
    cpuBusyPercent,
    memoryTotalBytes: scalarMeasurement(observation.memory.totalBytes, observation.observedAt, source('memory.totalBytes')),
    memoryAvailableBytes: scalarMeasurement(observation.memory.availableBytes, observation.observedAt, source('memory.availableBytes')),
    uptimeSeconds: scalarMeasurement(observation.uptimeSeconds, observation.observedAt, source('uptimeSeconds')),
    loadOne: scalarMeasurement(observation.load.one, observation.observedAt, source('load.one')),
    loadFive: scalarMeasurement(observation.load.five, observation.observedAt, source('load.five')),
    loadFifteen: scalarMeasurement(observation.load.fifteen, observation.observedAt, source('load.fifteen')),
  };
  return {schema: MANAGED_NODE_SCHEMA, resourceId: resource.id, state, health: projectedHealth, hostname: observation.hostname, lastHeartbeatAt: observation.observedAt, lastProbeAt: observation.observedAt, uptimeSeconds: observation.uptimeSeconds, os: observation.os, cpu: {...observation.cpu, load: observation.load}, memory: observation.memory, measurements, storage: observation.storage, optical: observation.optical, network: observation.network, temperatures: observation.temperatures, services: observation.services, containerRuntimes: discoverContainerRuntimes(resource.id, observation.tools, observation.observedAt), connectivity: connections, capabilities: discovered, workloads: detectedWorkloads, currentWorkload: active.map(item => item.id).join(', ') || null, maintenance, warnings};
}

function unavailable(resourceId: string, at: string | null, detail: string): ManagedNodeSnapshot {
  const observedAt = at ?? new Date(0).toISOString(), missing = (name: string) => unavailableMeasurement<number>(observedAt, name, 'node_observation_unavailable');
  return {schema: MANAGED_NODE_SCHEMA, resourceId, state: 'OFFLINE', health: 'offline', lastHeartbeatAt: null, lastProbeAt: at, measurements: {cpuLogical: missing('cpu.logical'), cpuBusyPercent: missing('cpu.busy'), memoryTotalBytes: missing('memory.total'), memoryAvailableBytes: missing('memory.available'), uptimeSeconds: missing('uptime'), loadOne: missing('load.1'), loadFive: missing('load.5'), loadFifteen: missing('load.15')}, storage: [], optical: [], network: [], temperatures: [], services: [], containerRuntimes: [], connectivity: [], capabilities: [], workloads: [], currentWorkload: null, maintenance: {state: 'UNAVAILABLE', detail: 'Node is offline'}, warnings: [detail]};
}

function staleMeasurements(snapshot: ManagedNodeSnapshot) {
  const measurements = Object.fromEntries(Object.entries(snapshot.measurements).map(([key, measurement]) => [key, measurement.value === null ? measurement : {...measurement, freshness: 'stale', limitations: unique([...measurement.limitations, 'heartbeat_not_refreshed'])}])) as ManagedNodeSnapshot['measurements'];
  return {...snapshot, measurements};
}

export class ManagedNodeManager {
  private readonly resources = new Map<string, ResourceConfig>();
  private readonly snapshots = new Map<string, ManagedNodeSnapshot>();
  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly cpuCounterFrames = new Map<string, CpuCounterFrame>();
  constructor(resources: ResourceConfig[], readonly workers: WorkerRegistry, readonly transport: ManagedNodeTransport, private readonly clock: () => Date = () => new Date()) {
    for (const resource of resources) if (resource.managedNode?.enabled !== false && resource.managedNode) this.resources.set(resource.id, structuredClone(resource));
  }
  ids() { return [...this.resources.keys()]; }
  resource(id: string) { const resource = this.resources.get(id); return resource ? structuredClone(resource) : undefined; }
  list() { return this.ids().map(id => this.get(id)!); }
  get(id: string) {
    const resource = this.resources.get(id); if (!resource) return undefined;
    const current = this.snapshots.get(id) ?? unavailable(id, null, 'No heartbeat received');
    const timeoutMs = (resource.managedNode?.offlineAfterSeconds ?? 90) * 1000;
    if (current.lastHeartbeatAt && this.clock().getTime() - Date.parse(current.lastHeartbeatAt) > timeoutMs) {
      const offline = staleMeasurements({...current, state: 'OFFLINE' as const, health: 'offline' as const, maintenance: {state: 'UNAVAILABLE' as const, detail: 'Heartbeat expired'}, warnings: unique([...current.warnings.filter(item => !item.startsWith('heartbeat:')), 'heartbeat:expired'])});
      this.snapshots.set(id, offline); this.syncWorker(resource, offline); return structuredClone(offline);
    }
    return structuredClone(current);
  }
  async poll(id: string) {
    const resource = this.resources.get(id); if (!resource) throw new Error('managed_node_missing');
    const at = this.clock().toISOString();
    try {
      const observation = await this.transport.probe(resource, at), previousFrame = this.cpuCounterFrames.get(id), cpuBusy = deriveCpuBusy(previousFrame, observation.cpuCounters, (resource.managedNode?.probeIntervalSeconds ?? 30) * 3_000);
      if (observation.cpuCounters) this.cpuCounterFrames.set(id, observation.cpuCounters); else this.cpuCounterFrames.delete(id);
      const snapshot = projectManagedNode(resource, observation, cpuBusy);
      this.snapshots.set(id, snapshot); this.syncWorker(resource, snapshot); return structuredClone(snapshot);
    } catch (error) {
      const previous = this.snapshots.get(id), timeoutMs = (resource.managedNode?.offlineAfterSeconds ?? 90) * 1000, expired = !previous?.lastHeartbeatAt || this.clock().getTime() - Date.parse(previous.lastHeartbeatAt) > timeoutMs, failure = classifyManagedNodeProbeFailure(error), detail = safeDetail(error);
      const snapshot = previous ? staleMeasurements({...previous, state: expired ? 'OFFLINE' as const : 'DEGRADED' as const, health: expired ? 'offline' as const : 'degraded' as const, lastProbeAt: at, lastProbeFailure: {...failure, observedAt: at}, maintenance: expired ? {state: 'UNAVAILABLE' as const, detail: 'Node is offline'} : previous.maintenance, warnings: unique([...previous.warnings.filter(item => !item.startsWith('heartbeat:')), `heartbeat:${failure.classification.toLowerCase()}:${detail}`])}) : {...unavailable(id, at, `heartbeat:${failure.classification.toLowerCase()}:${detail}`), lastProbeFailure: {...failure, observedAt: at}};
      this.snapshots.set(id, snapshot); this.syncWorker(resource, snapshot); return structuredClone(snapshot);
    }
  }
  start(onChange?: (snapshot: ManagedNodeSnapshot) => void, onError: (error: Error) => void = error => process.emitWarning(`managed-node monitor failure: ${error.message}`)) {
    for (const resource of this.resources.values()) {
      const probe = () => void this.poll(resource.id).then(snapshot => onChange?.(snapshot)).catch(error => onError(error instanceof Error ? error : new Error(String(error))));
      probe();
      const timer = setInterval(probe, (resource.managedNode?.probeIntervalSeconds ?? 30) * 1000); timer.unref(); this.timers.add(timer);
    }
    return () => this.stop();
  }
  stop() { for (const timer of this.timers) clearInterval(timer); this.timers.clear(); }
  async execute(id: string, request: ManagedNodeRequest, approvals: string[], signal?: AbortSignal) {
    const resource = this.resources.get(id); if (!resource) throw new Error('managed_node_missing');
    const snapshot = this.get(id)!;
    let normalized = this.authorize(resource, snapshot, request, approvals);
    if (!READ_ONLY.has(normalized.operation)) {
      const initialProtected = new Set(snapshot.workloads.filter(item => item.protected && item.state === 'ACTIVE').map(item => item.id));
      const revalidated = await this.poll(id);
      const newlyActive = revalidated.workloads.filter(item => item.protected && item.state === 'ACTIVE' && !initialProtected.has(item.id)).map(item => item.id);
      if (newlyActive.length) throw new Error(`managed_node_protected_workload_changed:operation=${normalized.operation}:initial=${snapshot.state}:final=${revalidated.state}:new=${newlyActive.join(',')}`);
      normalized = this.authorize(resource, revalidated, normalized, approvals);
    }
    const output = await this.transport.execute(resource, normalized, signal);
    return {schema: MANAGED_NODE_RESULT_SCHEMA, resourceId: id, operation: normalized.operation, observedAt: this.clock().toISOString(), ...output} satisfies ManagedNodeResult;
  }
  private authorize(resource: ResourceConfig, snapshot: ManagedNodeSnapshot, request: ManagedNodeRequest, approvals: string[]): ManagedNodeRequest {
    if (snapshot.state === 'OFFLINE') throw new Error('managed_node_offline');
    const operation = request.operation;
    if (!READ_ONLY.has(operation) && snapshot.state === 'DEGRADED') throw new Error('managed_node_maintenance_unavailable_while_degraded');
    if (!READ_ONLY.has(operation) && !approvals.some(item => [MAINTENANCE_APPROVAL, PROTECTED_WORKLOAD_OVERRIDE].includes(item))) throw new Error('managed_node_maintenance_approval_required');
    if (!READ_ONLY.has(operation) && snapshot.workloads.some(item => item.protected && item.state === 'ACTIVE') && !approvals.includes(PROTECTED_WORKLOAD_OVERRIDE)) throw new Error('managed_node_protected_workload_active');
    if (['package.query', 'package.install', 'package.remove'].includes(operation)) {
      if (typeof request.target !== 'string' || !PACKAGE_NAME.test(request.target)) throw new Error('managed_node_package_invalid');
      return {operation, target: request.target};
    }
    if (['logs.read', 'service.status', 'service.start', 'service.stop', 'service.restart'].includes(operation)) {
      if (typeof request.target !== 'string' || !UNIT_NAME.test(request.target)) throw new Error('managed_node_service_invalid');
      if (!(resource.managedNode?.approvedServices ?? []).includes(request.target)) throw new Error('managed_node_service_not_approved');
      if (operation !== 'logs.read') return {operation, target: request.target};
    }
    if (operation === 'logs.read') { const lines = Number(request.value ?? 100); if (!Number.isSafeInteger(lines) || lines < 1 || lines > 500) throw new Error('managed_node_log_lines_invalid'); return {...request, value: lines}; }
    if (operation === 'housekeeping.journal-vacuum') { const size = Number(request.value); if (!Number.isSafeInteger(size) || size < 16 || size > 4096) throw new Error('managed_node_vacuum_size_invalid'); return {...request, value: size}; }
    if (operation === 'runtime.update') {
      const runtime = resource.managedNode?.runtime; if (!runtime) throw new Error('managed_node_runtime_unconfigured');
      return {operation, target: runtime.directory, value: runtime.branch};
    }
    return {operation};
  }
  private syncWorker(resource: ResourceConfig, snapshot: ManagedNodeSnapshot) {
    const capacity = Math.max(1, Number(resource.metadata?.capacity ?? 1));
    const blockedCapabilities = snapshot.state === 'BUSY' ? unique([...(resource.managedNode?.busyBlockedCapabilities ?? []), ...DEFAULT_BUSY_BLOCKED]) : [];
    this.workers.observe({id: resource.id, capabilities: [...snapshot.capabilities], health: snapshot.health, capacity, blockedCapabilities, labels: {managedNode: 'true', nodeState: snapshot.state, hostname: snapshot.hostname ?? resource.id}, observedAt: snapshot.lastProbeAt ?? this.clock().toISOString()});
  }
}

import {redactSensitiveText} from './security-redaction.js';

export const EXECUTION_CONTAINMENT_METHOD = 'execution-environment-containment' as const;

export type ExecutionEnvironmentKind =
  | 'PHYSICAL_DEVICE'
  | 'HOST_OS'
  | 'VIRTUAL_MACHINE'
  | 'GUEST_OS'
  | 'RUNTIME'
  | 'CONTAINER'
  | 'WORKER';
export type ExecutionAvailability = 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE' | 'UNKNOWN';

export interface ExecutionContainmentEvidence {
  parentId: string;
  relation: 'HOSTS' | 'CONTAINS' | 'RUNS';
  observedAt: string;
  authority: 'AUTHORITATIVE' | 'CONFIGURED';
  method: typeof EXECUTION_CONTAINMENT_METHOD;
  sourceId?: string;
}

export interface ExecutionEnvironmentRecord {
  id: string;
  kind: ExecutionEnvironmentKind;
  physicalDeviceId: string;
  parentId?: string;
  hostId?: string;
  transport?: string;
  capabilities: string[];
  availability: ExecutionAvailability;
  lifecycleState?: string;
  observedAt: string;
  evidence: string[];
}

export type ResourceAccountingScope =
  | 'PHYSICAL_CAPACITY'
  | 'ALLOCATED_CAPACITY'
  | 'GUEST_VISIBLE_CAPACITY'
  | 'RUNTIME_LIMIT'
  | 'MEASURED_CONSUMPTION';
export type ResourceAccountingMetric = 'CPU_LOGICAL' | 'MEMORY_BYTES' | 'STORAGE_BYTES';
export interface NestedResourceObservation {
  subjectId: string;
  physicalDeviceId: string;
  metric: ResourceAccountingMetric;
  scope: ResourceAccountingScope;
  value: number | null;
  observedAt: string;
  source: string;
  authority: 'MEASURED' | 'REPORTED' | 'CONFIGURED' | 'UNKNOWN';
}

export function projectNestedResourceAccounting(observations: NestedResourceObservation[]) {
  const valid = observations.filter(item => item.value === null || Number.isFinite(item.value) && item.value >= 0);
  const physical = new Map<string, NestedResourceObservation[]>();
  for (const item of valid.filter(item => item.scope === 'PHYSICAL_CAPACITY' && item.value !== null)) {
    const key = `${item.physicalDeviceId}:${item.metric}`, values = physical.get(key) ?? [];
    values.push(item); physical.set(key, values);
  }
  const conflicts = [...physical.entries()].filter(([,items]) => new Set(items.map(item => item.value)).size > 1).map(([key]) => key);
  const totals: Record<ResourceAccountingMetric, number | null> = {CPU_LOGICAL: null, MEMORY_BYTES: null, STORAGE_BYTES: null};
  for (const metric of Object.keys(totals) as ResourceAccountingMetric[]) {
    const groups = [...physical.entries()].filter(([key]) => key.endsWith(`:${metric}`));
    totals[metric] = groups.length && groups.every(([,items]) => new Set(items.map(item => item.value)).size === 1)
      ? groups.reduce((sum,[,items]) => sum + items[0]!.value!,0) : null;
  }
  return {
    schema: 'agent-control.nested-resource-accounting/v1' as const,
    physicalTotals: totals,
    observations: valid,
    excludedFromEstateTotals: valid.filter(item => item.scope !== 'PHYSICAL_CAPACITY'),
    conflicts,
    limitations: ['Allocated, guest-visible and runtime-limit values describe nested views of physical capacity and are never added to Estate physical totals.'],
  };
}

export type ContainerRuntimeKind = 'PODMAN' | 'DOCKER' | 'LXC' | 'OTHER';
export interface ContainerObservation {
  id: string;
  name?: string;
  image?: string;
  state: 'RUNNING' | 'STOPPED' | 'PAUSED' | 'UNKNOWN';
  workerId?: string;
}
export interface ContainerRuntimeObservation {
  id: string;
  environmentId: string;
  kind: ContainerRuntimeKind;
  version?: string;
  state: 'DETECTED_ONLY' | 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
  observedAt: string;
  executableEvidence: string;
  containers: ContainerObservation[];
}

const runtimeTool = new Map<string, ContainerRuntimeKind>([['podman', 'PODMAN'], ['docker', 'DOCKER'], ['lxc-start', 'LXC']]);
export function discoverContainerRuntimes(environmentId: string, tools: string[], observedAt: string): ContainerRuntimeObservation[] {
  return [...new Set(tools)].flatMap(tool => {
    const kind = runtimeTool.get(tool); if (!kind) return [];
    return [{id: `container-runtime:${environmentId}:${kind.toLowerCase()}`, environmentId, kind, state: 'DETECTED_ONLY' as const, observedAt, executableEvidence: `executable:${tool}`, containers: []}];
  });
}

export type ProbeFailureClassification = 'TIMEOUT' | 'AUTHENTICATION' | 'TRANSPORT' | 'UNAVAILABLE' | 'COMMAND' | 'CAPABILITY_ABSENCE' | 'ABORTED' | 'MALFORMED' | 'UNKNOWN';
export class ManagedNodeProbeError extends Error {
  constructor(readonly classification: ProbeFailureClassification, message: string) { super(message); this.name = 'ManagedNodeProbeError'; }
}
export function classifyManagedNodeProbeFailure(error: unknown): {classification: ProbeFailureClassification; detail: string} {
  const detail = redactSensitiveText(String(error instanceof Error ? error.message : error)).replace(/[\r\n\0]+/g, ' ').slice(0, 240) || 'probe_failed';
  if (error instanceof ManagedNodeProbeError) return {classification: error.classification, detail};
  if (/timeout/i.test(detail)) return {classification: 'TIMEOUT', detail};
  if (/permission denied|authentication|publickey/i.test(detail)) return {classification: 'AUTHENTICATION', detail};
  if (/transport_unreachable|connection refused|no route|network is unreachable|could not resolve|name or service not known/i.test(detail)) return {classification: 'TRANSPORT', detail};
  if (/host_unavailable|node_unavailable|environment_unavailable|offline/i.test(detail)) return {classification: 'UNAVAILABLE', detail};
  if (/probe_incomplete|record_invalid|malformed/i.test(detail)) return {classification: 'MALFORMED', detail};
  return {classification: 'UNKNOWN', detail};
}

export interface NestedExecutionRequest {requiredCapabilities: string[]; physicalDeviceId?: string;}
export interface NestedWorkerCandidate {id: string; environmentId: string; capabilities: string[]; health: 'healthy' | 'degraded' | 'offline' | 'unknown'; transport: string;}
export function resolveNestedExecutionRoute(request: NestedExecutionRequest, environments: ExecutionEnvironmentRecord[], runtimes: ContainerRuntimeObservation[], workers: NestedWorkerCandidate[]) {
  const byId = new Map(environments.map(item => [item.id, item]));
  const runtimeByEnvironment = new Map(runtimes.filter(item => item.state === 'AVAILABLE').map(item => [item.environmentId, item]));
  const rejected: Array<{workerId: string; reasons: string[]}> = [];
  const candidates = workers.flatMap(worker => {
    const environment = byId.get(worker.environmentId), reasons: string[] = [];
    if (!environment) reasons.push('environment_missing');
    if (worker.health !== 'healthy') reasons.push(`worker_${worker.health}`);
    if (environment && !['AVAILABLE', 'DEGRADED'].includes(environment.availability)) reasons.push(`environment_${environment.availability.toLowerCase()}`);
    if (environment && request.physicalDeviceId && environment.physicalDeviceId !== request.physicalDeviceId) reasons.push('physical_device_mismatch');
    for (const capability of request.requiredCapabilities) if (!worker.capabilities.includes(capability) && !environment?.capabilities.includes(capability)) reasons.push(`capability_missing:${capability}`);
    const runtime = runtimeByEnvironment.get(worker.environmentId);
    if (request.requiredCapabilities.some(item => item.startsWith('container.')) && !runtime) reasons.push('container_runtime_unavailable');
    if (reasons.length) { rejected.push({workerId: worker.id, reasons}); return []; }
    return [{worker, environment: environment!, runtime, score: environment!.availability === 'AVAILABLE' ? 2 : 1}];
  }).sort((a, b) => b.score - a.score || a.worker.id.localeCompare(b.worker.id));
  const selected = candidates[0];
  return {
    schema: 'agent-control.nested-execution-route/v1' as const,
    selected: selected ? {physicalDeviceId: selected.environment.physicalDeviceId, environmentId: selected.environment.id, workerId: selected.worker.id, transport: selected.worker.transport, runtimeId: selected.runtime?.id ?? null} : null,
    rejected,
    authority: 'DETERMINISTIC_CAPABILITY_EVIDENCE' as const,
  };
}

export function validateContainment(items: Array<{id: string; nodeId: string; kind: string; containment?: ExecutionContainmentEvidence; attributes?: Record<string, unknown>; provenance?: Array<{authority: string; method: string}>}>, itemId: string): string | undefined {
  const byId = new Map(items.map(item => [item.id, item])), item = byId.get(itemId);
  if (!item || item.kind === 'MACHINE') return undefined;
  const legacy = typeof item.attributes?.executionParentId === 'string' && item.provenance?.some(p => p.authority === 'AUTHORITATIVE' && p.method === EXECUTION_CONTAINMENT_METHOD)
    ? {parentId: item.attributes.executionParentId as string, authority: 'AUTHORITATIVE', method: EXECUTION_CONTAINMENT_METHOD} : undefined;
  const relation = item.containment ?? legacy;
  if (!relation || !['AUTHORITATIVE', 'CONFIGURED'].includes(relation.authority) || relation.method !== EXECUTION_CONTAINMENT_METHOD || 'observedAt' in relation && (typeof relation.observedAt !== 'string' || !Number.isFinite(Date.parse(relation.observedAt)))) return undefined;
  const firstParent = relation.parentId, seen = new Set([item.id]); let cursor: string | undefined = firstParent;
  while (cursor) {
    if (seen.has(cursor)) return undefined;
    seen.add(cursor);
    const target = byId.get(cursor);
    if (!target || target.nodeId !== item.nodeId) return undefined;
    if (target.kind === 'MACHINE') return firstParent;
    const targetLegacy = typeof target.attributes?.executionParentId === 'string' && target.provenance?.some(p => p.authority === 'AUTHORITATIVE' && p.method === EXECUTION_CONTAINMENT_METHOD)
      ? target.attributes.executionParentId as string : undefined;
    const typed = target.containment;
    const parent = typed?.method === EXECUTION_CONTAINMENT_METHOD && ['AUTHORITATIVE','CONFIGURED'].includes(typed.authority) && Number.isFinite(Date.parse(typed.observedAt)) ? typed.parentId : targetLegacy;
    if (!parent) return undefined;
    cursor = parent;
  }
  return undefined;
}

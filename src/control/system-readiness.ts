import type {ModelInvocationObservation} from './harness-efficiency.js';
import type {WorkerRegistration, RunRecord} from './job-types.js';
import type {ManagedNodeManager, ManagedNodeSnapshot} from './managed-node.js';
import type {ProviderRegistry} from './providers.js';

export type SystemExecutionState = 'AVAILABLE' | 'BUSY' | 'DEGRADED' | 'AUTH REQUIRED' | 'OFFLINE' | 'UNKNOWN';
export interface SystemReadiness {
  id: string; name: string; type: 'machine' | 'LLM provider' | 'local model' | 'service' | 'model' | 'transport';
  registered: true; reachable: 'yes' | 'no' | 'unknown'; authentication: 'valid' | 'present' | 'required' | 'failed' | 'not required' | 'unknown';
  execution: SystemExecutionState; blockingReason: string | null; transport?: string; platform?: string; capabilities: string[];
  capacity: number | null; active: number | null; lastCheckAt: string | null; lastSuccessfulProbeAt: string | null; lastSuccessfulJobAt: string | null;
  lastError: string | null; latencyMs: number | null; qualification?: string; model?: string; contextLimitTokens?: number; maximumObservedInputTokens?: number;
  node?: ManagedNodeSnapshot; recentInvocation?: {at: string; latencyMs: number | null; totalTokens: number | null; cost: number | null; currency: string | null};
}

export interface RegisteredResource {id: string; name: string; platform: string; transport: string; capabilities: string[];}
export interface RegisteredService {id: string; name: string; healthUrl: string; optional: boolean; requiresAuth: boolean; credentialConfigured: boolean;}

export function deriveSystemReadiness(input: {providers?: ProviderRegistry; resources: RegisteredResource[]; services?: RegisteredService[]; managedNodes?: ManagedNodeManager; workers: WorkerRegistration[]; runs: RunRecord[]; invocations: ModelInvocationObservation[]}): SystemReadiness[] {
  const workers = new Map(input.workers.map(worker => [worker.id, worker]));
  const machines = input.resources.map(resource => machineReadiness(resource, input.managedNodes?.get(resource.id), workers.get(resource.id), input.runs));
  const providers = input.providers?.list().map(provider => {
    const state = input.providers!.health(provider.id), records = input.invocations.filter(item => item.provider === provider.id), active = records.filter(item => item.state === 'RUNNING').length, recent = records.at(-1), recentSuccess = records.filter(item => item.finalJobResult === 'SUCCEEDED').at(-1);
    const credentialMissing = provider.requiresAuth && provider.credentialConfigured === false;
    const authentication: SystemReadiness['authentication'] = !provider.requiresAuth ? 'not required' : credentialMissing ? 'required' : 'present';
    const qualification = provider.qualification?.status ?? (provider.qualificationModel ? 'unqualified' : 'not recorded');
    let execution: SystemExecutionState, blockingReason: string | null = null, reachable: SystemReadiness['reachable'];
    const successIsCurrent = Boolean(recentSuccess?.completedAt) && (!state?.checkedAt || Date.parse(recentSuccess!.completedAt!) >= Date.parse(state.checkedAt));
    if (credentialMissing) { execution = 'AUTH REQUIRED'; reachable = state?.health === 'healthy' ? 'yes' : 'unknown'; blockingReason = 'Provider credentials are required'; }
    else if (active >= provider.parallelism) { execution = 'BUSY'; reachable = state?.health === 'healthy' || successIsCurrent ? 'yes' : 'unknown'; blockingReason = 'Provider execution capacity is currently exhausted by an active invocation'; }
    else if (state?.health === 'offline' && !successIsCurrent) { execution = 'OFFLINE'; reachable = 'no'; blockingReason = state.detail ?? 'Provider endpoint is offline'; }
    else if ((!state || ['unknown','unconfigured'].includes(state.health)) && !successIsCurrent) { execution = 'UNKNOWN'; reachable = 'unknown'; blockingReason = 'Provider has not been successfully probed'; }
    else if (successIsCurrent) { execution = 'AVAILABLE'; reachable = 'yes'; }
    else if (state!.health === 'degraded' || qualification === 'unqualified') { execution = 'DEGRADED'; reachable = 'yes'; blockingReason = state!.detail ?? 'Provider qualification is incomplete'; }
    else { execution = 'AVAILABLE'; reachable = 'yes'; }
    return {id: provider.id, name: provider.name, type: provider.kind === 'local' ? 'local model' as const : 'LLM provider' as const, registered: true as const, reachable, authentication, execution, blockingReason, transport: provider.kind, capabilities: [...provider.capabilities], capacity: provider.parallelism, active, lastCheckAt: state && !['unknown','unconfigured'].includes(state.health) ? state.checkedAt : null, lastSuccessfulProbeAt: state?.lastSuccessAt ?? provider.qualification?.lastSuccessfulAt ?? null, lastSuccessfulJobAt: recentSuccess?.completedAt ?? null, lastError: state && ['degraded','offline'].includes(state.health) && !successIsCurrent ? state.detail ?? state.health : null, latencyMs: state?.latencyMs ?? recentSuccess?.elapsedMs ?? null, qualification, model: provider.qualificationModel, contextLimitTokens: provider.qualification?.advertisedContextLimitTokens, maximumObservedInputTokens: provider.qualification?.maximumObservedInputTokens, recentInvocation: recent ? {at: recent.completedAt ?? recent.startedAt, latencyMs: recent.elapsedMs, totalTokens: recent.usage.totalProcessedTokens, cost: recent.providerReportedCost ?? recent.calculatedCost, currency: recent.currency} : undefined};
  }) ?? [];
  const services = (input.services ?? []).map(service => {
    const authentication: SystemReadiness['authentication'] = !service.requiresAuth ? 'not required' : service.credentialConfigured ? 'present' : 'required';
    const execution: SystemExecutionState = service.requiresAuth && !service.credentialConfigured ? 'AUTH REQUIRED' : 'UNKNOWN';
    return {id: service.id, name: service.name, type: 'service' as const, registered: true as const, reachable: 'unknown' as const, authentication, execution, blockingReason: execution === 'AUTH REQUIRED' ? 'Service credential reference is configured but no credential is available to this process' : 'Service has not been successfully probed', transport: 'http', capabilities: [], capacity: null, active: null, lastCheckAt: null, lastSuccessfulProbeAt: null, lastSuccessfulJobAt: null, lastError: null, latencyMs: null};
  });
  return [...machines, ...providers, ...services].sort((a, b) => a.name.localeCompare(b.name));
}

function machineReadiness(resource: RegisteredResource, node: ManagedNodeSnapshot | undefined, worker: WorkerRegistration | undefined, runs: RunRecord[]): SystemReadiness {
  const related = runs.filter(run => run.selectedWorkers.includes(resource.id)), successful = related.filter(run => run.status === 'SUCCEEDED').sort(byEnd).at(-1), failed = related.filter(run => ['FAILED','DEGRADED','DISCONNECTED'].includes(run.status)).sort(byEnd).at(-1);
  const authFailure = node?.warnings.find(item => /permission denied|authentication|publickey/i.test(item));
  const authentication: SystemReadiness['authentication'] = authFailure ? 'failed' : node?.lastHeartbeatAt ? 'valid' : resource.transport === 'local' ? 'not required' : 'unknown';
  const capacity = worker?.capacity ?? null, active = worker?.active ?? null;
  let execution: SystemExecutionState, blockingReason: string | null = null, reachable: SystemReadiness['reachable'];
  if (node?.state === 'OFFLINE' || worker?.health === 'offline') { execution = authFailure ? 'AUTH REQUIRED' : 'OFFLINE'; reachable = 'no'; blockingReason = authFailure ?? node?.warnings.at(-1) ?? 'System is offline'; }
  else if (!node && (!worker || worker.health === 'unknown')) { execution = 'UNKNOWN'; reachable = 'unknown'; blockingReason = 'System has not been probed'; }
  else if (node?.state === 'BUSY' || (capacity !== null && active !== null && active >= capacity)) { execution = 'BUSY'; reachable = 'yes'; blockingReason = node?.currentWorkload ? `Active workload: ${node.currentWorkload}` : 'Execution capacity is exhausted'; }
  else if (node?.state === 'DEGRADED' || worker?.health === 'degraded') { execution = 'DEGRADED'; reachable = 'yes'; blockingReason = node?.warnings.at(-1) ?? 'System is only partially usable'; }
  else { execution = 'AVAILABLE'; reachable = 'yes'; }
  return {id: resource.id, name: resource.name, type: 'machine', registered: true, reachable, authentication, execution, blockingReason, transport: resource.transport, platform: resource.platform, capabilities: [...(node?.capabilities ?? resource.capabilities)], capacity, active, lastCheckAt: node?.lastProbeAt ?? worker?.observedAt ?? null, lastSuccessfulProbeAt: node?.lastHeartbeatAt ?? (worker?.health === 'healthy' ? worker.observedAt : null), lastSuccessfulJobAt: successful?.endedAt ?? null, lastError: authFailure ?? failed?.errors.at(-1) ?? node?.warnings.at(-1) ?? null, latencyMs: null, node};
}

function byEnd(a: RunRecord, b: RunRecord) { return Date.parse(a.endedAt ?? a.requestedAt) - Date.parse(b.endedAt ?? b.requestedAt); }

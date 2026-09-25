import type {ResourceConfig, TransportType} from './config.js';

export type HostKind = 'controller' | 'linux' | 'windows' | 'android' | 'ios' | 'ipados' | 'macos' | 'remote' | 'unknown';
export type HostHealth = 'unconfigured' | 'unknown' | 'healthy' | 'degraded' | 'offline';
export interface ExecutionHost {id: string; name: string; kind: HostKind; os: string; transport: TransportType; core: boolean; capabilities: string[]; harnesses: string[]; metadata?: Record<string, string | number | boolean>;}
export interface HostState {hostId: string; health: HostHealth; detail?: string; checkedAt: string;}

export class ExecutionHostRegistry {
  private hosts = new Map<string, ExecutionHost>();
  private states = new Map<string, HostState>();
  register(host: ExecutionHost) {
    this.hosts.set(host.id, host);
    this.states.set(host.id, {hostId: host.id, health: 'unknown', checkedAt: new Date(0).toISOString()});
    return host;
  }
  get(id: string) { return this.hosts.get(id); }
  list() { return [...this.hosts.values()]; }
  setHealth(hostId: string, health: HostHealth, detail?: string) {
    if (!this.hosts.has(hostId)) throw new Error(`host ${hostId} not registered`);
    const state = {hostId, health, detail, checkedAt: new Date().toISOString()};
    this.states.set(hostId, state);
    return state;
  }
  health(id: string) { return this.states.get(id); }
  core() { return this.list().find(host => host.core); }
  canRun(hostId: string, harness: string) {
    const host = this.hosts.get(hostId), state = this.states.get(hostId);
    return Boolean(host && state?.health === 'healthy' && host.harnesses.includes(harness));
  }
}

export function hostsFromResources(resources: ResourceConfig[]): ExecutionHost[] {
  return resources.map(resource => ({
    id: resource.id,
    name: resource.name ?? resource.id,
    kind: resource.controller ? 'controller' : resource.platform === 'remote' ? 'remote' : resource.platform,
    os: resource.platform,
    transport: resource.transport.type,
    core: resource.controller === true,
    capabilities: [...resource.capabilities],
    harnesses: [...(resource.harnesses ?? [])],
    metadata: resource.metadata,
  }));
}

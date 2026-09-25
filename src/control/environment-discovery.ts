import {isAndroidUserspace,observeAndroid} from './android-environment.js';
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OwnedProcessManager } from "./owned-process.js";
import {emptyConfig} from './config.js';
import { AGENT_CONTROL_VERSION } from "../version.js";
import type {
  AgentControlConfig,
  ModelConfig,
  ProviderConfig,
  ResourceConfig,
  ServiceConfig,
} from "./config.js";
import type { ManagedNodeSnapshot } from "./managed-node.js";
import type { ExecutionContainmentEvidence } from "./nested-execution.js";
import type { WorkerExecutionIdentity } from "./job-types.js";
import {
  assertNoSensitiveMaterial,
  redactSensitiveValue,
} from "./security-redaction.js";

export const ENVIRONMENT_DISCOVERY_SCHEMA =
  "agent-control.environment-discovery/v1" as const;
export type DiscoveryMode =
  | "FIRST_RUN"
  | "QUICK_RESCAN"
  | "FULL_DISCOVERY"
  | "ADD_MACHINE"
  | "ADD_PROVIDER"
  | "ADD_LOCAL_RUNTIME"
  | "ADD_MODEL"
  | "IMPORT_CONFIGURATION";
export type DiscoveryTesting =
  "SKIP_TESTING" | "QUICK_TEST" | "FULL_QUALIFICATION";
export type DiscoveryKind =
  | "MACHINE"
  | "GPU"
  | "RUNTIME"
  | "MODEL"
  | "PROVIDER"
  | "CREDENTIAL"
  | "AGENT"
  | "TOOL"
  | "SKILL"
  | "MCP"
  | "PLUGIN"
  | "MEMORY"
  | "ENDPOINT"
  | "JOB"
  | "ROUTE";
export type DiscoveryHealth =
  "HEALTHY" | "NEEDS_QUALIFICATION" | "UNAVAILABLE" | "OFFLINE" | "UNKNOWN";
export type DiscoveryChange =
  | "NEW"
  | "CHANGED"
  | "REMOVED"
  | "OFFLINE"
  | "AUTHENTICATION_CHANGED"
  | "MODEL_UPDATED"
  | "ENDPOINT_CHANGED"
  | "UNCHANGED";
export type DiscoveryLifecycle =
  "DISCOVERED" | "QUALIFIED" | "RECOMMENDED" | "APPROVED" | "ACTIVE";
export type ComputeClass =
  | "MOBILE_LOCAL"
  | "EDGE_LOCAL"
  | "DESKTOP_LOCAL"
  | "SERVER_LOCAL"
  | "REMOTE_PRIVATE"
  | "CLOUD_API";
export type AuthenticationState =
  | "FOUND"
  | "AUTHENTICATION_REQUIRED"
  | "AUTHENTICATED"
  | "EXPIRED"
  | "INVALID"
  | "NOT_CONFIGURED"
  | "UNKNOWN";
export type DiscoveryResourceClass =
  | "MODEL"
  | "MODEL_RUNTIME"
  | "AGENT_RUNTIME"
  | "CLI_AGENT"
  | "TOOL_SERVER"
  | "MCP_SERVER"
  | "EXECUTION_ENVIRONMENT"
  | "TRANSPORT"
  | "PROVIDER";
export interface EdgeDiscoveryObservation {
  nodeId: string;
  adapterId: string;
  transportClass: "LOCAL" | "PRIVATE" | "REMOTE";
  transportLabel: string;
  authority: "AUTHORITATIVE" | "CONFIGURED" | "DERIVED";
  observedAt: string;
  device: {
    label: string;
    platform:
      "android" | "ios" | "ipados" | "linux" | "windows" | "macos" | "unknown";
    osVersion?: string;
    cpu?: string;
    ramBytes?: number;
    availableRamBytes?: number;
    storageAvailableBytes?: number;
    accelerator?: string;
    batteryPercent?: number;
    charging?: boolean;
    thermalCelsius?: number;
    metered?: boolean;
  };
  runtimes: Array<{
    id: string;
    version?: string;
    endpoint?: string;
    health: DiscoveryHealth;
  }>;
  models: Array<{
    id: string;
    label: string;
    version?: string;
    family?: string;
    parameterSize?: string;
    quantisation?: string;
    sha256?: string;
    sizeBytes?: number;
    location?: string;
    runtime: string;
    contextTokens?: number;
    accelerator?: string;
    estimatedMemoryBytes?: number;
    loaded?: boolean;
    health: DiscoveryHealth;
  }>;
  authentication?: AuthenticationState;
}

export interface DiscoveryItem {
  id: string;
  kind: DiscoveryKind;
  label: string;
  nodeId: string;
  health: DiscoveryHealth;
  lifecycle: DiscoveryLifecycle;
  resourceClasses: DiscoveryResourceClass[];
  operationalState:
    | "AVAILABLE"
    | "INSTALLED_NOT_RUNNING"
    | "AUTHENTICATION_REQUIRED"
    | "DISCOVERED_UNQUALIFIED"
    | "QUALIFIED"
    | "ACTIVE"
    | "UNAVAILABLE";
  configuredId?: string;
  change: DiscoveryChange;
  fingerprint: string;
  attributes: Record<string, string | number | boolean | null>;
  /** Optional evidence-backed parent relation. Older v1 records remain valid without it. */
  containment?: ExecutionContainmentEvidence;
  provenance: Array<{
    adapter: string;
    method: string;
    observedAt: string;
    authority: "AUTHORITATIVE" | "CONFIGURED" | "DERIVED" | "UNKNOWN";
  }>;
  attention?: string;
  relatedIds?: string[];
}
export type DiscoveryObservation = Omit<
  DiscoveryItem,
  "change" | "fingerprint" | "resourceClasses" | "operationalState"
> &
  Partial<Pick<DiscoveryItem, "resourceClasses" | "operationalState">>;
export interface DiscoveryScan {
  scopePermissionId?:string;
  schema: typeof ENVIRONMENT_DISCOVERY_SCHEMA;
  id: string;
  mode: DiscoveryMode;
  testing: DiscoveryTesting;
  startedAt: string;
  completedAt: string;
  includeRemote: boolean;
  includeMemory: boolean;
  status: "COMPLETED" | "PARTIAL";
  items: DiscoveryItem[];
  failures: Array<{
    adapter: string;
    classification: "UNAVAILABLE" | "MALFORMED" | "FAILED";
    detail: string;
  }>;
  summary: {
    machines: number;
    gpus: number;
    localModels: number;
    providers: number;
    agents: number;
    tools: number;
    memorySources: number;
    healthy: number;
    needsQualification: number;
    unavailable: number;
    new: number;
  };
  recommendations: DiscoveryRecommendation[];
  previousScanId?: string;
}
export interface DiscoveryRecommendation {
  id: string;
  category:
    | "REASONING"
    | "CODING"
    | "ROUTINE"
    | "PRIVATE_LOCAL"
    | "LONG_CONTEXT"
    | "FALLBACK"
    | "CONFIGURATION";
  summary: string;
  resourceIds: string[];
  authority: "RECOMMENDATION_ONLY";
  reason: string;
  operation?: DiscoveryConfigurationOperation;
}
export interface DiscoveryConfigurationOperation {
  kind: "resource" | "provider" | "model" | "service";
  item: ResourceConfig | ProviderConfig | ModelConfig | ServiceConfig;
}
export interface DiscoveryProposal {
  id: string;
  scanId: string;
  createdAt: string;
  updatedAt: string;
  actor: string;
  state: "DRAFT" | "SAVED" | "APPROVED" | "APPLIED" | "CANCELLED";
  configurationRevision: string;
  recommendationIds: string[];
  operations: DiscoveryConfigurationOperation[];
  sha256: string;
  workParcelId?: string;
  appliedAt?: string;
}
export interface DiscoveryAdapterContext {
  mode: DiscoveryMode;
  testing: DiscoveryTesting;
  includeRemote: boolean;
  includeMemory: boolean;
  observedAt: string;
  config: AgentControlConfig;
  environment: NodeJS.ProcessEnv;
  managedNodes: ManagedNodeSnapshot[];
  probe: DiscoveryProbe;
  edgeNodes: EdgeDiscoveryObservation[];
  runtimeInventory: {
    jobs: Array<{ id: string; name: string; version: string }>;
    agents: Array<{
      id: string;
      health: string;
      capabilities: string[];
      executionIdentity?: WorkerExecutionIdentity;
    }>;
    tools: string[];
    skills: Array<{ id: string; state: string; kind: string }>;
    mcpServers: Array<{ id: string; state: string }>;
    plugins: Array<{ id: string; state: string }>;
  };
}
export interface DiscoveryAdapter {
  id: string;
  discover(context: DiscoveryAdapterContext): Promise<DiscoveryObservation[]>;
}
export interface DiscoveryProbe {
  command(
    command: string,
    args: string[],
    timeoutMs: number,
  ): Promise<{ ok: boolean; stdout: string; stderr: string }>;
  json(
    url: string,
    timeoutMs: number,
  ): Promise<{ ok: boolean; status: number; body: unknown }>;
}
export interface EnvironmentDiscoveryOptions {
  file: string;
  config: () => AgentControlConfig;
  configurationRevision: () => string;
  environment?: NodeJS.ProcessEnv;
  clock?: () => Date;
  managedNodes?: () => ManagedNodeSnapshot[];
  adapters?: DiscoveryAdapter[];
  probe?: DiscoveryProbe;
  additionalAdapters?: DiscoveryAdapter[];
  runtimeInventory?: () => DiscoveryAdapterContext["runtimeInventory"];
  edgeNodes?: () => EdgeDiscoveryObservation[];
  createWorkParcel?: (proposal: DiscoveryProposal) => string;
  applyConfiguration?: (proposal: DiscoveryProposal) => void;
  onEvent?: (
    type: "scan.started" | "scan.completed" | "scan.adapter.started" | "scan.adapter.completed" | "scan.adapter.failed" | "proposal.changed",
    payload: Record<string, unknown>,
  ) => void;
}

interface StoreShape {
  version: 1;
  scans: DiscoveryScan[];
  proposals: DiscoveryProposal[];
}
const now = (clock: () => Date) => clock().toISOString();
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const safe = <T>(value: T): T => redactSensitiveValue(value) as T;
const idPart = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "unknown";
const unique = <T>(values: T[]) => [...new Set(values)];

export class DefaultDiscoveryProbe implements DiscoveryProbe {
  async command(command: string, args: string[], timeoutMs: number) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort("command_timeout"), timeoutMs);
    try {
      const result = await new OwnedProcessManager().runProcess(
        { command, args, maxOutputBytes: 512 * 1024 },
        controller.signal,
      );
      return {
        ok: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr || (result.exitCode === 0 ? "" : `command_failed:${result.exitCode ?? "unknown"}`),
      };
    } catch (error) {
      if (controller.signal.aborted)
        return { ok: false, stdout: "", stderr: "command_timeout" };
      const code = (error as NodeJS.ErrnoException).code;
      return {
        ok: false,
        stdout: "",
        stderr: code === "ENOENT" ? "command_unavailable" : "command_failed",
      };
    } finally {
      clearTimeout(timer);
    }
  }
  async json(url: string, timeoutMs: number) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        /* malformed body is classified by adapter */
      }
      return { ok: response.ok, status: response.status, body };
    } catch {
      return { ok: false, status: 0, body: null };
    } finally {
      clearTimeout(timer);
    }
  }
}

export class EnvironmentDiscoveryRuntime {
  private scopedScanAuthorizer:((permissionId:string)=>boolean)|null=null;
  setScopedScanAuthorizer(authorizer:(permissionId:string)=>boolean){this.scopedScanAuthorizer=authorizer;}
  private scopeVisible(permissionId?:string){return !permissionId||this.scopedScanAuthorizer?.(permissionId)===true;}
  private progress: {scopePermissionId?:string;scanId:string;state:'RUNNING'|'COMPLETED'|'PARTIAL'|'FAILED';startedAt:string;updatedAt:string;adapters:Array<{id:string;state:'WAITING'|'CHECKING'|'COMPLETE'|'FAILED';found:number}>;items:DiscoveryObservation[]} | null = null;
  private state: StoreShape;
  private readonly clock: () => Date;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly probe: DiscoveryProbe;
  private readonly adapters: DiscoveryAdapter[];
  constructor(private readonly options: EnvironmentDiscoveryOptions) {
    this.clock = options.clock ?? (() => new Date());
    this.environment = options.environment ?? process.env;
    this.probe = options.probe ?? new DefaultDiscoveryProbe();
    this.adapters = options.adapters ?? [
      new LocalMachineDiscoveryAdapter(),
      new ConfiguredResourceDiscoveryAdapter(),
      new MobileEdgeDiscoveryAdapter(),
      new LocalRuntimeDiscoveryAdapter(),
      new CredentialDiscoveryAdapter(),
      new AgentResourceDiscoveryAdapter(),
      ...(options.additionalAdapters ?? []),
    ];
    this.state = this.load();
  }
  projection() {
    return safe({
      schema: ENVIRONMENT_DISCOVERY_SCHEMA,
      scans: this.state.scans.filter(v=>this.scopeVisible(v.scopePermissionId)).map((value) => structuredClone(value)),
      proposals: this.state.proposals.map((value) => structuredClone(value)),
      latest: this.state.scans.filter(v=>this.scopeVisible(v.scopePermissionId)).at(-1) ?? null,
      progress: this.progress&&this.scopeVisible(this.progress.scopePermissionId)?this.progress:null,
    });
  }
  scan(id: string) {
    const value = this.state.scans.find((item) => item.id === id);
    if (!value) throw new Error("environment_discovery_scan_missing");
    if(!this.scopeVisible(value.scopePermissionId))throw Error('environment_discovery_permission_denied');
    return structuredClone(value);
  }
  proposal(id: string) {
    const value = this.state.proposals.find((item) => item.id === id);
    if (!value) throw new Error("environment_discovery_proposal_missing");
    return structuredClone(value);
  }
  async discover(input:{mode:DiscoveryMode;testing?:DiscoveryTesting;includeRemote?:boolean;includeMemory?:boolean}) {
    if(this.progress?.state==='RUNNING')throw new Error('environment_discovery_already_running');
    try{return await this.performDiscover(input);}catch(error){this.failProgress();throw error;}
  }
  async discoverScoped(input:{scopePermissionId?:string;mode:DiscoveryMode;testing?:DiscoveryTesting;includeRemote?:boolean;includeMemory?:boolean},adapters:DiscoveryAdapter[]){
    if(this.progress?.state==='RUNNING')throw new Error('environment_discovery_already_running');
    try{return await this.performDiscover(input,adapters,emptyConfig(),input.scopePermissionId);}catch(error){this.failProgress();throw error;}
  }
  private failProgress(){if(this.progress?.state==='RUNNING'){this.progress.state='FAILED';this.progress.updatedAt=now(this.clock);}}
  private async performDiscover(input: {
    mode: DiscoveryMode;
    testing?: DiscoveryTesting;
    includeRemote?: boolean;
    includeMemory?: boolean;
  }, scopedAdapters=this.adapters, scopedConfig?:AgentControlConfig,scopePermissionId?:string) {
    if (!MODES.has(input.mode))
      throw new Error("environment_discovery_mode_invalid");
    const testing = input.testing ?? "SKIP_TESTING";
    if (!TESTING.has(testing))
      throw new Error("environment_discovery_testing_invalid");
    if (input.includeRemote !== true && ["ADD_MACHINE"].includes(input.mode))
      throw new Error("environment_discovery_remote_permission_required");
    const startedAt = now(this.clock),
      id = `discovery-${randomUUID()}`,
      config = structuredClone(scopedConfig??this.options.config()),
      previous = this.state.scans.at(-1);
    this.progress={...(scopePermissionId?{scopePermissionId}:{}),scanId:id,state:'RUNNING',startedAt,updatedAt:startedAt,adapters:scopedAdapters.map(adapter=>({id:adapter.id,state:'WAITING',found:0})),items:[]};
    this.options.onEvent?.("scan.started", {
      scanId: id,
      mode: input.mode,
      includeRemote: input.includeRemote === true,
    });
    const context: DiscoveryAdapterContext = {
      mode: input.mode,
      testing,
      includeRemote: input.includeRemote === true,
      includeMemory: input.includeMemory === true,
      observedAt: startedAt,
      config,
      environment: this.environment,
      managedNodes: this.options.managedNodes?.() ?? [],
      edgeNodes: this.options.edgeNodes?.() ?? [],
      probe: this.probe,
      runtimeInventory: this.options.runtimeInventory?.() ?? {
        jobs: [],
        agents: [],
        tools: [],
        skills: [],
        mcpServers: [],
        plugins: [],
      },
    };
    const discovered: DiscoveryObservation[] = [];
    const failures: DiscoveryScan["failures"] = [];
    for (const adapter of scopedAdapters) {
      const stage=this.progress.adapters.find(item=>item.id===adapter.id)!;stage.state='CHECKING';this.progress.updatedAt=now(this.clock);this.options.onEvent?.('scan.adapter.started',{scanId:id,adapter:adapter.id});
      try {
        const found=await adapter.discover(context);discovered.push(...found);stage.found=found.length;stage.state='COMPLETE';this.progress.items=safe(dedupe(discovered).map(normaliseObservation));this.progress.updatedAt=now(this.clock);this.options.onEvent?.('scan.adapter.completed',{scanId:id,adapter:adapter.id,found:found.length});
      } catch (error) {
        stage.state='FAILED';this.progress.updatedAt=now(this.clock);this.options.onEvent?.('scan.adapter.failed',{scanId:id,adapter:adapter.id});
        failures.push({
          adapter: adapter.id,
          classification: "FAILED",
          detail: String(error instanceof Error ? error.message : error)
            .replace(/[\r\n\0]+/g, " ")
            .slice(0, 200),
        });
      }
    }
    const items = reconcile(
        dedupe(discovered).map(normaliseObservation),
        previous?.items ?? [],
        startedAt,
      ),
      recommendations = recommend(items, config),
      completedAt = now(this.clock);
    const scan: DiscoveryScan = safe({
      ...(scopePermissionId?{scopePermissionId}:{}),
      schema: ENVIRONMENT_DISCOVERY_SCHEMA,
      id,
      mode: input.mode,
      testing,
      startedAt,
      completedAt,
      includeRemote: context.includeRemote,
      includeMemory: context.includeMemory,
      status: failures.length ? "PARTIAL" : "COMPLETED",
      items,
      failures,
      summary: summarize(items),
      recommendations,
      ...(previous ? { previousScanId: previous.id } : {}),
    });
    assertNoSensitiveMaterial(
      JSON.stringify(scan),
      "environment_discovery_secret_forbidden",
    );
    this.progress.state=scan.status;this.progress.updatedAt=completedAt;
    this.state.scans.push(scan);
    this.state.scans = this.state.scans.slice(-25);
    this.persist();
    this.options.onEvent?.("scan.completed", {
      scanId: id,
      status: scan.status,
      summary: scan.summary,
    });
    return structuredClone(scan);
  }
  createProposal(scanId: string, recommendationIds: string[], actor: string) {
    const scan = this.scan(scanId),
      ids = unique(recommendationIds),
      selected = scan.recommendations.filter((item) => ids.includes(item.id));
    if (selected.length !== ids.length)
      throw new Error("environment_discovery_recommendation_missing");
    const operations = selected.flatMap((item) =>
        item.operation ? [structuredClone(item.operation)] : [],
      ),
      at = now(this.clock),
      base = {
        id: `discovery-proposal-${randomUUID()}`,
        scanId,
        createdAt: at,
        updatedAt: at,
        actor,
        state: "DRAFT" as const,
        configurationRevision: this.options.configurationRevision(),
        recommendationIds: ids,
        operations,
      };
    const proposal: DiscoveryProposal = { ...base, sha256: proposalHash(base) };
    assertNoSensitiveMaterial(
      JSON.stringify(proposal),
      "environment_discovery_proposal_secret_forbidden",
    );
    this.state.proposals.push(proposal);
    this.persist();
    this.changed(proposal);
    return structuredClone(proposal);
  }
  saveProposal(id: string, sha256: string) {
    const proposal = this.mutableProposal(id, "DRAFT", sha256);
    proposal.state = "SAVED";
    proposal.updatedAt = now(this.clock);
    this.reseal(proposal);
    return structuredClone(proposal);
  }
  cancelProposal(id: string, sha256: string) {
    const proposal = this.mutableProposal(id, ["DRAFT", "SAVED"], sha256);
    proposal.state = "CANCELLED";
    proposal.updatedAt = now(this.clock);
    this.reseal(proposal);
    return structuredClone(proposal);
  }
  approveProposal(id: string, sha256: string, actor: string) {
    const proposal = this.mutableProposal(id, ["DRAFT", "SAVED"], sha256);
    if (proposal.configurationRevision !== this.options.configurationRevision())
      throw new Error("environment_discovery_configuration_changed");
    proposal.state = "APPROVED";
    proposal.actor = actor;
    proposal.updatedAt = now(this.clock);
    this.reseal(proposal);
    if (proposal.operations.length) {
      if (!this.options.createWorkParcel)
        throw new Error("environment_discovery_work_parcel_unavailable");
      proposal.workParcelId = this.options.createWorkParcel(
        structuredClone(proposal),
      );
      this.reseal(proposal);
    }
    return structuredClone(proposal);
  }
  applyProposal(id: string, sha256: string, actor: string) {
    const proposal = this.mutableProposal(id, "APPROVED", sha256);
    if (proposal.configurationRevision !== this.options.configurationRevision())
      throw new Error("environment_discovery_configuration_changed");
    if (!this.options.applyConfiguration)
      throw new Error("environment_discovery_apply_unavailable");
    this.options.applyConfiguration(structuredClone(proposal));
    proposal.state = "APPLIED";
    proposal.actor = actor;
    proposal.appliedAt = now(this.clock);
    proposal.updatedAt = proposal.appliedAt;
    this.reseal(proposal);
    return structuredClone(proposal);
  }
  private mutableProposal(
    id: string,
    states: DiscoveryProposal["state"] | DiscoveryProposal["state"][],
    sha256: string,
  ) {
    const proposal = this.state.proposals.find((item) => item.id === id);
    if (!proposal) throw new Error("environment_discovery_proposal_missing");
    if (!(Array.isArray(states) ? states : [states]).includes(proposal.state))
      throw new Error("environment_discovery_proposal_state_invalid");
    if (proposal.sha256 !== sha256)
      throw new Error("environment_discovery_proposal_hash_mismatch");
    return proposal;
  }
  private reseal(proposal: DiscoveryProposal) {
    proposal.sha256 = proposalHash(proposal);
    this.persist();
    this.changed(proposal);
  }
  private changed(proposal: DiscoveryProposal) {
    this.options.onEvent?.("proposal.changed", {
      proposalId: proposal.id,
      state: proposal.state,
      workParcelId: proposal.workParcelId ?? null,
    });
  }
  private load(): StoreShape {
    if (!fs.existsSync(this.options.file))
      return { version: 1, scans: [], proposals: [] };
    const value = JSON.parse(
      fs.readFileSync(this.options.file, "utf8"),
    ) as StoreShape;
    if (
      value.version !== 1 ||
      !Array.isArray(value.scans) ||
      !Array.isArray(value.proposals)
    )
      throw new Error("environment_discovery_store_invalid");
    assertNoSensitiveMaterial(
      JSON.stringify(value),
      "environment_discovery_store_secret_forbidden",
    );
    return value;
  }
  private persist() {
    fs.mkdirSync(path.dirname(this.options.file), { recursive: true });
    const temporary = `${this.options.file}.${process.pid}.tmp`,
      value = safe(this.state);
    assertNoSensitiveMaterial(
      JSON.stringify(value),
      "environment_discovery_store_secret_forbidden",
    );
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      mode: 0o600,
    });
    fs.renameSync(temporary, this.options.file);
  }
}

function safeNetworkInterfaces(){try{return os.networkInterfaces();}catch{return {};}}

export class LocalMachineDiscoveryAdapter implements DiscoveryAdapter {
  id = "local-machine";
  async discover(context: DiscoveryAdapterContext) {
    const cpus = os.cpus(),
      network = Object.entries(safeNetworkInterfaces()).flatMap(
        ([name, addresses]) =>
          (addresses ?? [])
            .filter((address) => !address.internal)
            .map((address) => `${name}:${address.family}`),
      ),
      attributes: DiscoveryItem["attributes"] = {
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        architecture: os.arch(),
        cpuModel: cpus[0]?.model ?? "unknown",
        cpuLogical: cpus.length || null,
        totalMemoryBytes: os.totalmem(),
        availableMemoryBytes: os.freemem(),
        networkInterfaces: network.join(","),
        agentControlVersion: AGENT_CONTROL_VERSION,
      };
    try {
      const disk = fs.statfsSync(process.cwd());
      attributes.diskTotalBytes = disk.blocks * disk.bsize;
      attributes.diskAvailableBytes = disk.bavail * disk.bsize;
    } catch {
      attributes.diskAvailableBytes = null;
    }
    const android = isAndroidUserspace() ? await observeAndroid(context.probe) : null;
    if(android)Object.assign(attributes,{deploymentProfile:android.profile,platform:'android',computeClass:'MOBILE_LOCAL',androidVersion:android.androidVersion,cpuModel:android.cpu,availableMemoryBytes:android.availableRamBytes,batteryPercent:android.batteryPercent,charging:android.charging,thermalCelsius:android.thermalCelsius,metered:android.metered,backgroundReliability:android.backgroundReliability,accelerator:android.accelerator,controllerLocation:'this-device',localModelRequired:false});
    const values: DiscoveryObservation[] = [
      item(
        "MACHINE",
        "controller",
        android?.label ?? os.hostname(),
        "HEALTHY",
        "DISCOVERED",
        attributes,
        this.id,
        "node:os",
        "AUTHORITATIVE",
        context.observedAt,
        "controller",
      ),
    ];
    const gpu = await context.probe.command(
      "nvidia-smi",
      [
        "--query-gpu=index,name,memory.total,driver_version",
        "--format=csv,noheader,nounits",
      ],
      2500,
    );
    let invalidGpuRows = 0;
    if (gpu.ok)
      for (const row of gpu.stdout.trim().split(/\r?\n/).filter(Boolean)) {
        const [index, name, vram, driver] = row
          .split(",")
          .map((value) => value.trim());
        if (row.split(',').length !== 4 || !/^\d+$/.test(index ?? '') || !name || !vram || !Number.isFinite(Number(vram)) || Number(vram) <= 0 || !driver) {
          invalidGpuRows++;
          continue;
        }
        values.push(
          item(
            "GPU",
            `controller:gpu:${index}`,
            name || `GPU ${index}`,
            "HEALTHY",
            "DISCOVERED",
            {
              index: Number(index),
              vramMiB: Number(vram),
              driver: driver || "unknown",
              accelerator: "nvidia",
            },
            this.id,
            "nvidia-smi",
            "AUTHORITATIVE",
            context.observedAt,
          ),
        );
      }
    const gpuCount = values.filter(value => value.kind === 'GPU').length;
    Object.assign(values[0]!.attributes, {
      gpuInventoryState: !gpu.ok
        ? gpu.stderr === 'command_unavailable' ? 'OPTIONAL_UNAVAILABLE' : 'OPTIONAL_DEGRADED'
        : invalidGpuRows ? 'OPTIONAL_DEGRADED' : gpuCount ? 'OPTIONAL_AVAILABLE' : 'OPTIONAL_UNAVAILABLE',
      gpuInventoryReason: !gpu.ok ? gpu.stderr === 'command_unavailable' ? 'command_unavailable' : gpu.stderr === 'command_timeout' ? 'command_timeout' : 'command_failed'
        : invalidGpuRows ? 'malformed_output' : gpuCount ? 'inventory_observed' : 'no_devices_reported',
    });
    return values;
  }
}

export class ConfiguredResourceDiscoveryAdapter implements DiscoveryAdapter {
  id = "configured-inventory";
  async discover(context: DiscoveryAdapterContext) {
    const values: DiscoveryObservation[] = [];
    for (const resource of context.config.resources) {
      const snapshot = context.managedNodes.find(
          (value) => value.resourceId === resource.id,
        ),
        remote = resource.transport.type !== "local";
      if (remote && !context.includeRemote) continue;
      const privateTransport = privateTransportLabel(resource, snapshot);
      values.push(
        item(
          "MACHINE",
          resource.id,
          resource.name ?? resource.id,
          snapshot?.health === "healthy"
            ? "HEALTHY"
            : snapshot?.health === "offline"
              ? "OFFLINE"
              : snapshot?.health === "degraded"
                ? "UNAVAILABLE"
                : "UNKNOWN",
          snapshot ? "QUALIFIED" : "DISCOVERED",
          {
            platform: resource.platform,
            computeClass: computeClass(
              resource.platform,
              resource.controller === true,
              remote,
              Boolean(privateTransport),
            ),
            transport: resource.transport.type,
            privateTransport: privateTransport ?? "unreported",
            address:
              resource.transport.host ?? resource.transport.baseUrl ?? "local",
            port: resource.transport.port ?? null,
            username: resource.transport.user ?? null,
            authenticationMethod: resource.transport.identityFile
              ? "ssh-identity-reference"
              : remote
                ? "configured-transport"
                : "none",
            credentialStatus: resource.transport.identityFile
              ? "CONFIGURED"
              : "NOT_REQUIRED",
            credentialMask: "••••••••••••",
            capabilities: resource.capabilities.join(","),
            hostname: snapshot?.hostname ?? "unreported",
            memoryTotalBytes: snapshot?.memory?.totalBytes ?? null,
            memoryAvailableBytes: snapshot?.memory?.availableBytes ?? null,
            cpuModel: snapshot?.cpu?.model ?? "unreported",
            storageAvailableBytes:
              snapshot?.storage.reduce(
                (total, value) => total + value.availableBytes,
                0,
              ) ?? null,
            thermalCelsius: snapshot?.temperatures[0]?.celsius ?? null,
            metered: resource.metadata?.metered ?? null,
            batteryPercent: resource.metadata?.batteryPercent ?? null,
            charging: resource.metadata?.charging ?? null,
          },
          this.id,
          remote ? "configured-managed-node" : "configured-local-resource",
          snapshot?.lastProbeAt ? "AUTHORITATIVE" : "CONFIGURED",
          snapshot?.lastProbeAt ?? context.observedAt,
          resource.id,
        ),
      );
    }
    for (const provider of context.config.providers) {
      values.push(
        item(
          "PROVIDER",
          provider.id,
          provider.name ?? provider.id,
          provider.enabled === false
            ? "UNAVAILABLE"
            : provider.qualification?.status === "qualified"
              ? "HEALTHY"
              : "NEEDS_QUALIFICATION",
          provider.qualification?.status === "qualified"
            ? "QUALIFIED"
            : "DISCOVERED",
          {
            kind: provider.kind,
            enabled: provider.enabled !== false,
            endpointScope: provider.baseUrl
              ? endpointScope(provider.baseUrl)
              : "none",
            capabilities: (provider.capabilities ?? []).join(","),
          },
          this.id,
          "configured-provider",
          "CONFIGURED",
          context.observedAt,
          provider.id,
        ),
      );
      if (provider.baseUrl) {
        let endpointHealth: DiscoveryHealth = "UNKNOWN",
          status: number | null = null;
        if (context.testing !== "SKIP_TESTING") {
          const target = provider.discovery?.path
              ? new URL(provider.discovery.path, provider.baseUrl).toString()
              : provider.baseUrl,
            response = await context.probe.json(target, 1800);
          status = response.status;
          endpointHealth = response.ok
            ? "HEALTHY"
            : response.status === 401 || response.status === 403
              ? "NEEDS_QUALIFICATION"
              : "UNAVAILABLE";
        }
        values.push(
          item(
            "ENDPOINT",
            `${provider.id}:endpoint`,
            `${provider.name ?? provider.id} endpoint`,
            provider.enabled === false ? "UNAVAILABLE" : endpointHealth,
            "DISCOVERED",
            {
              scope: endpointScope(provider.baseUrl),
              protocol: new URL(provider.baseUrl).protocol,
              status,
            },
            this.id,
            context.testing === "SKIP_TESTING"
              ? "configured-provider-endpoint"
              : "bounded-configured-endpoint-probe",
            context.testing === "SKIP_TESTING" ? "CONFIGURED" : "AUTHORITATIVE",
            context.observedAt,
            provider.id,
          ),
        );
      }
    }
    for (const model of context.config.models) {
      const nodeId = model.nodes?.[0] ?? "controller",
        resource = context.config.resources.find(
          (value) => value.id === nodeId,
        );
      values.push(
        item(
          "MODEL",
          model.id,
          model.displayName ?? model.id,
          model.enabled === false
            ? "UNAVAILABLE"
            : model.qualification?.state === "QUALIFIED"
              ? "HEALTHY"
              : "NEEDS_QUALIFICATION",
          model.qualification?.state === "QUALIFIED"
            ? "QUALIFIED"
            : "DISCOVERED",
          {
            provider: model.provider,
            providerModel: model.providerModel,
            accountProfile: model.accountProfile ?? "default",
            location: nodeId,
            computeClass: resource
              ? computeClass(
                  resource.platform,
                  resource.controller === true,
                  resource.transport.type !== "local",
                  Boolean(
                    privateTransportLabel(
                      resource,
                      context.managedNodes.find(
                        (value) => value.resourceId === resource.id,
                      ),
                    ),
                  ),
                )
              : "CLOUD_API",
            transport: resource?.transport.type ?? "provider",
            runtime:
              context.config.providers.find(
                (value) => value.id === model.provider,
              )?.kind ?? "unknown",
            contextTokens: model.limits?.contextTokens ?? null,
            costClass:
              context.config.providers.find(
                (value) => value.id === model.provider,
              )?.costClass ?? "unknown",
            routingEligible: model.routingEligible === true,
            capabilities: model.capabilities.join(","),
            qualificationVersion: model.qualification?.version ?? "unqualified",
          },
          this.id,
          "configured-model",
          "CONFIGURED",
          context.observedAt,
          model.id,
        ),
      );
    }
    for (const service of context.config.services) {
      let health: DiscoveryHealth = service.optional
          ? "UNKNOWN"
          : "NEEDS_QUALIFICATION",
        status: number | null = null;
      if (context.testing !== "SKIP_TESTING") {
        const response = await context.probe.json(service.healthUrl, 1800);
        status = response.status;
        health = response.ok
          ? "HEALTHY"
          : response.status === 401 || response.status === 403
            ? "NEEDS_QUALIFICATION"
            : "UNAVAILABLE";
      }
      values.push(
        item(
          "ENDPOINT",
          `service:${service.id}`,
          service.name ?? service.id,
          health,
          health === "HEALTHY" ? "QUALIFIED" : "DISCOVERED",
          {
            scope: endpointScope(service.healthUrl),
            requiresAuth: service.requiresAuth === true,
            status,
          },
          this.id,
          context.testing === "SKIP_TESTING"
            ? "configured-service"
            : "bounded-configured-service-probe",
          context.testing === "SKIP_TESTING" ? "CONFIGURED" : "AUTHORITATIVE",
          context.observedAt,
          service.id,
        ),
      );
    }
    for (const [role, route] of Object.entries(
      context.config.modelRouting.roles,
    ))
      values.push(
        item(
          "ROUTE",
          `route:${role}`,
          role,
          "UNKNOWN",
          "ACTIVE",
          {
            primary: route.primary,
            fallback: (route.fallback ?? []).join(","),
            requires: (route.requires ?? []).join(","),
          },
          this.id,
          "configured-route",
          "CONFIGURED",
          context.observedAt,
        ),
      );
    return values;
  }
}

export class MobileEdgeDiscoveryAdapter implements DiscoveryAdapter {
  id = "mobile-edge-observations";
  async discover(context: DiscoveryAdapterContext) {
    if (!context.includeRemote) return [];
    const configured = new Set(
        context.config.resources.map((resource) => resource.id),
      ),
      values: DiscoveryObservation[] = [];
    for (const observation of context.edgeNodes) {
      if (!configured.has(observation.nodeId)) continue;
      const mobile = ["android", "ios", "ipados"].includes(
        observation.device.platform,
      );
      values.push(
        item(
          "MACHINE",
          observation.nodeId,
          observation.device.label,
          "HEALTHY",
          "QUALIFIED",
          {
            platform: observation.device.platform,
            computeClass: mobile ? "MOBILE_LOCAL" : "EDGE_LOCAL",
            transportClass: observation.transportClass,
            transport: observation.transportLabel,
            osVersion: observation.device.osVersion ?? "unreported",
            cpuModel: observation.device.cpu ?? "unreported",
            memoryTotalBytes: observation.device.ramBytes ?? null,
            memoryAvailableBytes: observation.device.availableRamBytes ?? null,
            storageAvailableBytes:
              observation.device.storageAvailableBytes ?? null,
            accelerator: observation.device.accelerator ?? "unreported",
            batteryPercent: observation.device.batteryPercent ?? null,
            charging: observation.device.charging ?? null,
            thermalCelsius: observation.device.thermalCelsius ?? null,
            metered: observation.device.metered ?? null,
            authentication: observation.authentication ?? "NOT_CONFIGURED",
          },
          this.id,
          observation.adapterId,
          observation.authority,
          observation.observedAt,
          observation.nodeId,
        ),
      );
      for (const runtime of observation.runtimes)
        values.push(
          item(
            "RUNTIME",
            `${observation.nodeId}:${runtime.id}`,
            runtime.id,
            runtime.health,
            runtime.health === "HEALTHY" ? "QUALIFIED" : "DISCOVERED",
            {
              location: observation.nodeId,
              computeClass: mobile ? "MOBILE_LOCAL" : "EDGE_LOCAL",
              transport: observation.transportLabel,
              version: runtime.version ?? "unreported",
              endpoint: runtime.endpoint
                ? "configured-reference"
                : "unreported",
            },
            this.id,
            observation.adapterId,
            observation.authority,
            observation.observedAt,
          ),
        );
      for (const model of observation.models)
        values.push(
          item(
            "MODEL",
            `${observation.nodeId}:${model.id}`,
            model.label,
            model.health,
            model.health === "HEALTHY" ? "QUALIFIED" : "DISCOVERED",
            {
              location: observation.nodeId,
              computeClass: mobile ? "MOBILE_LOCAL" : "EDGE_LOCAL",
              transport: observation.transportLabel,
              runtime: model.runtime,
              version: model.version ?? "unreported",
              family: model.family ?? "unreported",
              parameterSize: model.parameterSize ?? "unreported",
              quantisation: model.quantisation ?? "unreported",
              sha256: model.sha256 ?? "unreported",
              sizeBytes: model.sizeBytes ?? null,
              storageLocation: model.location
                ? "device-local-reference"
                : "unreported",
              contextTokens: model.contextTokens ?? null,
              accelerator:
                model.accelerator ??
                observation.device.accelerator ??
                "unreported",
              estimatedMemoryBytes: model.estimatedMemoryBytes ?? null,
              loaded: model.loaded ?? null,
              costClass: "local",
              routingEligible: false,
            },
            this.id,
            observation.adapterId,
            observation.authority,
            observation.observedAt,
          ),
        );
    }
    return values;
  }
}

export class LocalRuntimeDiscoveryAdapter implements DiscoveryAdapter {
  id = "local-runtimes";
  async discover(context: DiscoveryAdapterContext) {
    if (
      context.mode === "ADD_MACHINE" ||
      context.mode === "ADD_PROVIDER" ||
      context.mode === "IMPORT_CONFIGURATION"
    )
      return [];
    const values: DiscoveryObservation[] = [];
    const definitions = [
      {
        id: "llama.cpp",
        commands: ["llama-server", "llama-cli"],
        classes: "MODEL_RUNTIME",
        process: "llama-server",
      },
      {
        id: "ollama",
        commands: ["ollama"],
        classes: "MODEL_RUNTIME",
        process: "ollama",
      },
      {
        id: "vllm",
        commands: ["vllm"],
        classes: "MODEL_RUNTIME",
        process: "vllm",
      },
      {
        id: "lm-studio",
        commands: ["lms"],
        classes: "MODEL_RUNTIME",
        process: "lms",
      },
      {
        id: "codex",
        commands: ["codex"],
        classes: "CLI_AGENT,AGENT_RUNTIME",
        auth: ["login", "status"],
      },
      {
        id: "claude-code",
        commands: ["claude"],
        classes: "CLI_AGENT,AGENT_RUNTIME",
        auth: ["auth", "status"],
      },
      {
        id: "gemini-cli",
        commands: ["gemini"],
        classes: "CLI_AGENT,AGENT_RUNTIME",
      },
    ];
    for (const runtime of definitions) {
      let installed = false,
        version = "unreported",
        executableLocation = "unreported",
        selectedCommand = "";
      for (const command of runtime.commands) {
        const found = await context.probe.command(
          process.platform === "win32" ? "where" : "which",
          [command],
          1200,
        );
        if (found.ok && found.stdout.trim()) {
          installed = true;
          selectedCommand = command;
          executableLocation = found.stdout
            .trim()
            .split(/\r?\n/)[0]!
            .slice(0, 500);
          const checked = await context.probe.command(
            command,
            ["--version"],
            1500,
          );
          version = checked.ok
            ? checked.stdout.trim().split(/\r?\n/)[0]!.slice(0, 160)
            : "installed";
          break;
        }
      }
      if (!installed) continue;
      let running = false;
      if (runtime.process) {
        const checked = await context.probe.command(
          process.platform === "win32" ? "tasklist" : "pgrep",
          process.platform === "win32"
            ? ["/FI", `IMAGENAME eq ${runtime.process}.exe`]
            : ["-x", runtime.process],
          1200,
        );
        running = checked.ok && Boolean(checked.stdout.trim());
      }
      let authenticationState: AuthenticationState =
          "UNKNOWN" as AuthenticationState,
        lastSuccessfullyVerifiedAt: string | null = null;
      if (runtime.auth && context.testing !== "SKIP_TESTING") {
        const checked = await context.probe.command(
            selectedCommand,
            runtime.auth,
            2500,
          ),
          text = `${checked.stdout} ${checked.stderr}`.toLowerCase();
        authenticationState =
          checked.ok && /(logged in|authenticated|login status)/.test(text)
            ? "AUTHENTICATED"
            : /(not logged|login required|authentication required)/.test(text)
              ? "AUTHENTICATION_REQUIRED"
              : checked.ok
                ? "UNKNOWN"
                : "UNKNOWN";
        if (checked.ok) lastSuccessfullyVerifiedAt = context.observedAt;
      }
      values.push(
        item(
          "RUNTIME",
          `controller:${runtime.id}`,
          runtime.id,
          "NEEDS_QUALIFICATION",
          "DISCOVERED",
          {
            installed: true,
            running,
            version,
            executableLocation,
            authenticationState,
            configurationReference: "not inspected",
            availableModels: "runtime-specific",
            capabilities: runtime.classes.includes("CLI_AGENT")
              ? "agent.execute,structured-output,tools-unknown"
              : "model.serve,models.enumerate",
            toolMcpSupport: "unknown",
            executionPermissions: "qualification-required",
            lastSuccessfullyVerifiedAt,
            resourceClasses: runtime.classes,
          },
          this.id,
          "fixed-executable-and-status-discovery",
          "AUTHORITATIVE",
          context.observedAt,
        ),
      );
    }
    if (
      context.mode !== "FULL_DISCOVERY" &&
      context.mode !== "QUICK_RESCAN" &&
      context.mode !== "FIRST_RUN" &&
      context.mode !== "ADD_LOCAL_RUNTIME" &&
      context.mode !== "ADD_MODEL"
    )
      return values;
    const endpoints = [
      {
        id: "ollama",
        url: "http://127.0.0.1:11434/api/tags",
        format: "ollama",
      },
      {
        id: "lm-studio",
        url: "http://127.0.0.1:1234/v1/models",
        format: "openai",
      },
      {
        id: "llama.cpp",
        url: "http://127.0.0.1:8080/v1/models",
        format: "openai",
      },
    ];
    for (const endpoint of endpoints) {
      const response = await context.probe.json(endpoint.url, 1500);
      if (!response.ok) continue;
      values.push(
        item(
          "ENDPOINT",
          `controller:${endpoint.id}:endpoint`,
          `${endpoint.id} local endpoint`,
          "HEALTHY",
          "DISCOVERED",
          {
            scope: "loopback",
            endpoint: endpoint.url,
            status: response.status,
            runtime: endpoint.id,
            resourceClasses: "MODEL_RUNTIME,TOOL_SERVER",
          },
          this.id,
          "bounded-loopback-probe",
          "AUTHORITATIVE",
          context.observedAt,
        ),
      );
      for (const model of parseModels(response.body, endpoint.format))
        values.push(
          item(
            "MODEL",
            `controller:${endpoint.id}:${idPart(model.id)}`,
            model.name,
            "NEEDS_QUALIFICATION",
            "DISCOVERED",
            {
              runtime: endpoint.id,
              providerModel: model.id,
              sizeBytes: model.size ?? null,
              digest: model.digest ?? "unreported",
              family: model.family ?? "unreported",
              parameterSize: model.parameterSize ?? "unreported",
              quantisation: model.quantisation ?? "unreported",
              endpointScope: "loopback",
              endpoint: endpoint.url,
              resourceClasses: "MODEL",
            },
            this.id,
            "runtime-model-catalog",
            "AUTHORITATIVE",
            context.observedAt,
          ),
        );
    }
    return values;
  }
}

export class CredentialDiscoveryAdapter implements DiscoveryAdapter {
  id = "credential-presence";
  async discover(context: DiscoveryAdapterContext) {
    const values: DiscoveryObservation[] = [];
    for (const provider of context.config.providers) {
      const providerRefs: unknown[] = [
          provider.auth,
          provider.credentialEnv,
          provider.credentialFileEnv,
        ],
        presence = credentialPresence(providerRefs, context.environment),
        providerAuthentication: AuthenticationState = presence.available
          ? "FOUND"
          : presence.configured
            ? "AUTHENTICATION_REQUIRED"
            : "NOT_CONFIGURED";
      values.push(
        item(
          "CREDENTIAL",
          `${provider.id}:credential`,
          `${provider.name ?? provider.id} credential`,
          presence.available
            ? "HEALTHY"
            : presence.configured
              ? "UNAVAILABLE"
              : "UNKNOWN",
          "DISCOVERED",
          {
            authenticationState: providerAuthentication,
            available: presence.available,
            configured: presence.configured,
            referenceOnly: true,
            authority: presence.authority,
            accountProfiles: provider.accountProfiles?.length ?? 0,
          },
          this.id,
          "reference-presence-only",
          "DERIVED",
          context.observedAt,
          provider.id,
        ),
      );
      for (const account of provider.accountProfiles ?? []) {
        const residency = account.credentialResidency,
          accountPresence = credentialPresence(
            [residency?.store ?? account.credentialStore],
            context.environment,
            residency?.nodeId ?? account.nodeId ?? "controller",
          ),
          authenticationState: AuthenticationState =
            account.qualification?.state === "FAILED"
              ? "INVALID"
              : account.qualification?.state === "DEGRADED"
                ? "EXPIRED"
                : accountPresence.available
                  ? "FOUND"
                  : accountPresence.configured
                    ? "AUTHENTICATION_REQUIRED"
                    : "NOT_CONFIGURED";
        values.push(
          item(
            "CREDENTIAL",
            `${provider.id}:${account.id}:credential`,
            `${provider.name ?? provider.id} / ${account.label}`,
            ["INVALID", "EXPIRED"].includes(authenticationState)
                ? "UNAVAILABLE"
                : accountPresence.available || authenticationState === "AUTHENTICATION_REQUIRED"
                  ? "NEEDS_QUALIFICATION"
                  : "UNKNOWN",
            "DISCOVERED",
            {
              authenticationState,
              available: accountPresence.available,
              configured: accountPresence.configured,
              referenceOnly: true,
              authority: accountPresence.authority,
              accountProfileId: account.id,
              residencyNodeId:
                residency?.nodeId ?? account.nodeId ?? "controller",
            },
            this.id,
            "account-profile-reference-presence-only",
            "DERIVED",
            context.observedAt,
            provider.id,
          ),
        );
      }
    }
    return values;
  }
}

export class AgentResourceDiscoveryAdapter implements DiscoveryAdapter {
  id = "agent-control-resources";
  async discover(context: DiscoveryAdapterContext) {
    const values: DiscoveryObservation[] = [];
    for (const agent of context.runtimeInventory.agents)
      values.push(
        item(
          "AGENT",
          agent.id,
          agent.id,
          agent.health === "healthy"
            ? "HEALTHY"
            : agent.health === "offline"
              ? "OFFLINE"
              : "UNKNOWN",
          agent.health === "healthy" ? "QUALIFIED" : "DISCOVERED",
          {
            capabilities: agent.capabilities.join(","),
            health: agent.health,
            executionLocality: agent.executionIdentity?.locality ?? "UNKNOWN",
            identityAuthority: agent.executionIdentity?.authority ?? "UNVERIFIED",
            controllerRelationship: agent.executionIdentity?.controllerRelationship ?? "UNKNOWN",
            ...(agent.executionIdentity?.nodeId ? { location: agent.executionIdentity.nodeId } : {}),
          },
          this.id,
          "worker-registry",
          "AUTHORITATIVE",
          context.observedAt,
          agent.id,
        ),
      );
    for (const resource of context.config.resources)
      if (
        !context.runtimeInventory.agents.some(
          (agent) => agent.id === resource.id,
        )
      )
        values.push(
          item(
            "AGENT",
            `worker:${resource.id}`,
            resource.name ?? resource.id,
            "UNKNOWN",
            "DISCOVERED",
            {
              capabilities: resource.capabilities.join(","),
              harnesses: (resource.harnesses ?? []).join(","),
            },
            this.id,
            "configured-worker",
            "CONFIGURED",
            context.observedAt,
            resource.id,
          ),
        );
    for (const job of context.runtimeInventory.jobs)
      values.push(
        item(
          "JOB",
          job.id,
          job.name,
          "HEALTHY",
          "ACTIVE",
          { version: job.version, source: "job-catalog" },
          this.id,
          "job-catalog",
          "AUTHORITATIVE",
          context.observedAt,
          job.id,
        ),
      );
    for (const tool of context.runtimeInventory.tools)
      values.push(
        item(
          "TOOL",
          tool,
          tool,
          "HEALTHY",
          "ACTIVE",
          { source: "action-registry" },
          this.id,
          "action-registry",
          "AUTHORITATIVE",
          context.observedAt,
        ),
      );
    for (const skill of context.runtimeInventory.skills)
      values.push(
        item(
          "SKILL",
          skill.id,
          skill.id,
          skill.state === "PROMOTED" ? "HEALTHY" : "NEEDS_QUALIFICATION",
          skill.state === "PROMOTED" ? "ACTIVE" : "DISCOVERED",
          { state: skill.state, kind: skill.kind },
          this.id,
          "skill-registry",
          "AUTHORITATIVE",
          context.observedAt,
        ),
      );
    for (const server of context.runtimeInventory.mcpServers)
      values.push(
        item(
          "MCP",
          server.id,
          server.id,
          server.state === "AVAILABLE" ? "HEALTHY" : "UNKNOWN",
          server.state === "AVAILABLE" ? "QUALIFIED" : "DISCOVERED",
          { state: server.state },
          this.id,
          "configured-mcp-registry",
          "CONFIGURED",
          context.observedAt,
        ),
      );
    for (const plugin of context.runtimeInventory.plugins)
      values.push(
        item(
          "PLUGIN",
          plugin.id,
          plugin.id,
          plugin.state === "AVAILABLE" ? "HEALTHY" : "UNKNOWN",
          plugin.state === "AVAILABLE" ? "QUALIFIED" : "DISCOVERED",
          { state: plugin.state },
          this.id,
          "configured-plugin-registry",
          "CONFIGURED",
          context.observedAt,
        ),
      );
    if (context.includeMemory)
      values.push(
        item(
          "MEMORY",
          "your-memories",
          "Your Memories",
          "NEEDS_QUALIFICATION",
          "DISCOVERED",
          { selected: true, backend: "provider-neutral" },
          this.id,
          "operator-opt-in",
          "CONFIGURED",
          context.observedAt,
        ),
      );
    return values;
  }
}

function item(
  kind: DiscoveryKind,
  id: string,
  label: string,
  health: DiscoveryHealth,
  lifecycle: DiscoveryLifecycle,
  attributes: DiscoveryItem["attributes"],
  adapter: string,
  method: string,
  authority: DiscoveryItem["provenance"][number]["authority"],
  observedAt: string,
  configuredId?: string,
): Omit<DiscoveryItem, "change" | "fingerprint"> {
  const resourceClasses = resourceClassesFor(kind, attributes),
    authentication = String(
      attributes.authenticationState ?? attributes.authentication ?? "",
    ),
    declaredNode =
      typeof attributes.location === "string"
        ? attributes.location
        : typeof attributes.residencyNodeId === "string"
          ? attributes.residencyNodeId
          : null,
    nodeId =
      kind === "MACHINE"
        ? id
        : (declaredNode ??
          (id.includes(":") ? id.split(":")[0]! : "controller"));
  const operationalState: DiscoveryItem["operationalState"] =
    lifecycle === "ACTIVE"
      ? "ACTIVE"
      : authentication === "AUTHENTICATION_REQUIRED"
        ? "AUTHENTICATION_REQUIRED"
        : health === "HEALTHY" && lifecycle === "QUALIFIED"
          ? "QUALIFIED"
          : health === "HEALTHY"
            ? "AVAILABLE"
            : health === "NEEDS_QUALIFICATION" &&
                attributes.installed === true &&
                attributes.running === false
              ? "INSTALLED_NOT_RUNNING"
              : health === "NEEDS_QUALIFICATION"
                ? "DISCOVERED_UNQUALIFIED"
                : "UNAVAILABLE";
  return {
    id: `${kind.toLowerCase()}:${idPart(id)}`,
    kind,
    label: String(label).slice(0, 180),
    nodeId,
    health,
    lifecycle,
    resourceClasses,
    operationalState,
    attributes: safe(attributes),
    provenance: [{ adapter, method, observedAt, authority }],
    ...(configuredId ? { configuredId } : {}),
  };
}
function endpointScope(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return ["127.0.0.1", "::1", "localhost"].includes(host)
      ? "loopback"
      : /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
        ? "private"
        : "remote";
  } catch {
    return "unknown";
  }
}
function computeClass(
  platform: ResourceConfig["platform"],
  controller: boolean,
  remote: boolean,
  privateTransport: boolean,
): ComputeClass {
  if (["android", "ios", "ipados"].includes(platform)) return "MOBILE_LOCAL";
  if (platform === "remote") return "EDGE_LOCAL";
  if (remote && privateTransport) return "REMOTE_PRIVATE";
  if (platform === "linux" && controller) return "SERVER_LOCAL";
  if (["windows", "macos"].includes(platform)) return "DESKTOP_LOCAL";
  return remote ? "REMOTE_PRIVATE" : "SERVER_LOCAL";
}
function privateTransportLabel(
  resource: ResourceConfig,
  snapshot?: ManagedNodeSnapshot,
) {
  const isPrivateTransport = (value: {
      id: string;
      label?: string;
      capability: string;
    }) =>
      value.capability === "transport.secure-overlay" ||
      /private|secure[- ]?overlay/i.test(`${value.id} ${value.label ?? ""}`),
    configured = (resource.managedNode?.connectivity ?? []).find(
      isPrivateTransport,
    ),
    observed = snapshot?.connectivity.find(
      (value) =>
        isPrivateTransport(value) && value.state === "RUNNING",
    );
  return observed?.label ?? configured?.label ?? configured?.id;
}
function parseModels(body: unknown, format: string) {
  const values =
    (format === "ollama" && (body as { models?: unknown[] })?.models) ||
    (body as { data?: unknown[] })?.data;
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>,
      details =
        row.details && typeof row.details === "object"
          ? (row.details as Record<string, unknown>)
          : {},
      id = String(row.id ?? row.name ?? "").trim();
    if (!id) return [];
    return [
      {
        id,
        name: String(row.name ?? row.id),
        size: typeof row.size === "number" ? row.size : undefined,
        digest: typeof row.digest === "string" ? row.digest : undefined,
        family: typeof details.family === "string" ? details.family : undefined,
        parameterSize:
          typeof details.parameter_size === "string"
            ? details.parameter_size
            : undefined,
        quantisation:
          typeof details.quantization_level === "string"
            ? details.quantization_level
            : undefined,
      },
    ];
  });
}
function resourceClassesFor(
  kind: DiscoveryKind,
  attributes: DiscoveryItem["attributes"],
): DiscoveryResourceClass[] {
  const declared = String(attributes.resourceClasses ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is DiscoveryResourceClass =>
      [
        "MODEL",
        "MODEL_RUNTIME",
        "AGENT_RUNTIME",
        "CLI_AGENT",
        "TOOL_SERVER",
        "MCP_SERVER",
        "EXECUTION_ENVIRONMENT",
        "TRANSPORT",
        "PROVIDER",
      ].includes(value),
    );
  if (declared.length) return unique(declared);
  const mapped: Partial<Record<DiscoveryKind, DiscoveryResourceClass[]>> = {
    MODEL: ["MODEL"],
    RUNTIME: ["MODEL_RUNTIME"],
    PROVIDER: ["PROVIDER"],
    MCP: ["MCP_SERVER"],
    TOOL: ["TOOL_SERVER"],
    AGENT: ["AGENT_RUNTIME"],
    MACHINE: ["EXECUTION_ENVIRONMENT"],
    ENDPOINT: ["TOOL_SERVER"],
  };
  return mapped[kind] ?? [];
}
function normaliseObservation(
  value: DiscoveryObservation,
): DiscoveryObservation & {
  resourceClasses: DiscoveryResourceClass[];
  operationalState: DiscoveryItem["operationalState"];
} {
  const resourceClasses =
      value.resourceClasses ?? resourceClassesFor(value.kind, value.attributes),
    authentication = String(
      value.attributes.authenticationState ??
        value.attributes.authentication ??
        "",
    ),
    operationalState =
      value.operationalState ??
      (value.lifecycle === "ACTIVE"
        ? "ACTIVE"
        : authentication === "AUTHENTICATION_REQUIRED"
          ? "AUTHENTICATION_REQUIRED"
          : value.health === "HEALTHY" && value.lifecycle === "QUALIFIED"
            ? "QUALIFIED"
            : value.health === "HEALTHY"
              ? "AVAILABLE"
              : value.health === "NEEDS_QUALIFICATION" &&
                  value.attributes.installed === true &&
                  value.attributes.running === false
                ? "INSTALLED_NOT_RUNNING"
                : value.health === "NEEDS_QUALIFICATION"
                  ? "DISCOVERED_UNQUALIFIED"
                  : "UNAVAILABLE");
  return { ...value, resourceClasses, operationalState };
}
function credentialPresence(
  refs: unknown[],
  environment: NodeJS.ProcessEnv,
  nodeId = "controller",
) {
  let configured = false,
    available = false,
    authority = "REFERENCE_ONLY";
  for (const ref of refs) {
    if (
      !ref ||
      (typeof ref === "object" && (ref as { type?: string }).type === "none")
    )
      continue;
    configured = true;
    if (nodeId !== "controller") {
      authority = "REMOTE_QUALIFICATION_REQUIRED";
      continue;
    }
    if (typeof ref === "string") {
      available ||= Boolean(environment[ref]?.trim());
      continue;
    }
    if (typeof ref === "object") {
      const value = ref as { type?: string; env?: string };
      if (value.type === "provider-secure-store") {
        authority = "SECURE_STORE_REFERENCE_UNRESOLVED";
        continue;
      }
      const resolved = value.env ? environment[value.env]?.trim() : "";
      if (!resolved) continue;
      if (value.type === "bearer-file-env" || value.type === "codex-home-env") {
        try {
          const stat = fs.statSync(resolved);
          available ||=
            value.type === "codex-home-env"
              ? stat.isDirectory()
              : stat.isFile();
        } catch {
          /* a reference is not proof of presence */
        }
      } else available = true;
    }
  }
  return {
    configured,
    available,
    authority: available ? "LOCAL_REFERENCE_RESOLVED" : authority,
  };
}
function stableAttributes(item: DiscoveryObservation | DiscoveryItem) {
  return {
    kind: item.kind,
    id: item.id,
    label: item.label,
    nodeId: item.nodeId,
    configuredId: item.configuredId ?? null,
    attributes: item.attributes,
  };
}
function fingerprint(item: DiscoveryObservation | DiscoveryItem) {
  return hash(stableAttributes(item));
}
function dedupe(items: DiscoveryObservation[]) {
  const values = new Map<string, DiscoveryObservation>();
  for (const item of items) {
    const prior = values.get(item.id);
    if (!prior) {
      values.set(item.id, item);
      continue;
    }
    values.set(item.id, {
      ...prior,
      health:
        healthRank(item.health) > healthRank(prior.health)
          ? item.health
          : prior.health,
      lifecycle:
        lifecycleRank(item.lifecycle) > lifecycleRank(prior.lifecycle)
          ? item.lifecycle
          : prior.lifecycle,
      attributes: { ...prior.attributes, ...item.attributes },
      provenance: [...prior.provenance, ...item.provenance],
      relatedIds: unique([
        ...(prior.relatedIds ?? []),
        ...(item.relatedIds ?? []),
      ]),
    });
  }
  return [...values.values()];
}
function reconcile(
  current: Array<
    DiscoveryObservation & {
      resourceClasses: DiscoveryResourceClass[];
      operationalState: DiscoveryItem["operationalState"];
    }
  >,
  previous: DiscoveryItem[],
  observedAt: string,
) {
  const prior = new Map(previous.map((item) => [item.id, item])),
    seen = new Set<string>(),
    result: DiscoveryItem[] = [];
  for (const value of current) {
    seen.add(value.id);
    const before = prior.get(value.id),
      nextFingerprint = fingerprint(value);
    let change: DiscoveryChange = !before
      ? "NEW"
      : before.health !== "OFFLINE" && value.health === "OFFLINE"
        ? "OFFLINE"
        : before.kind === "CREDENTIAL" &&
            before.attributes.available !== value.attributes.available
          ? "AUTHENTICATION_CHANGED"
          : before.kind === "MODEL" && before.fingerprint !== nextFingerprint
            ? "MODEL_UPDATED"
            : before.kind === "ENDPOINT" &&
                before.fingerprint !== nextFingerprint
              ? "ENDPOINT_CHANGED"
              : before.health !== value.health
                ? "CHANGED"
              : before.fingerprint !== nextFingerprint
                ? "CHANGED"
                : "UNCHANGED";
    result.push({ ...value, fingerprint: nextFingerprint, change });
  }
  for (const before of previous)
    if (!seen.has(before.id))
      result.push({
        ...before,
        health: "OFFLINE",
        lifecycle: "DISCOVERED",
        change: "REMOVED",
        attention:
          "Previously discovered resource was not observed in this scan",
        provenance: [
          ...before.provenance,
          {
            adapter: "reconciliation",
            method: "missing-from-current-scan",
            observedAt,
            authority: "DERIVED",
          },
        ],
      });
  return result.sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label),
  );
}
function recommend(
  items: DiscoveryItem[],
  config: AgentControlConfig,
): DiscoveryRecommendation[] {
  const qualified = items.filter(
      (item) => item.kind === "MODEL" && item.health === "HEALTHY" && item.attributes.routingEligible === true,
    ),
    local = qualified.filter(
      (item) =>
        item.attributes.endpointScope === "loopback" || item.attributes.runtime,
    ),
    result: DiscoveryRecommendation[] = [];
  const add = (
    category: DiscoveryRecommendation["category"],
    summary: string,
    candidates: DiscoveryItem[],
    reason: string,
  ) => {
    if (candidates.length)
      result.push({
        id: `recommendation-${category.toLowerCase()}`,
        category,
        summary,
        resourceIds: candidates.map((item) => item.id),
        authority: "RECOMMENDATION_ONLY",
        reason,
      });
  };
  add(
    "REASONING",
    "Use the strongest qualified reasoning route",
    qualified.filter((item) =>
      String(item.attributes.capabilities).includes("reasoning"),
    ),
    "Only models already qualified for reasoning are considered.",
  );
  add(
    "CODING",
    "Use a qualified coding route",
    qualified.filter((item) =>
      String(item.attributes.capabilities).includes("coding"),
    ),
    "Discovery cannot promote an unqualified model.",
  );
  add(
    "PRIVATE_LOCAL",
    "Prefer a qualified local route for private work",
    local,
    "Loopback/locality and qualification are both required.",
  );
  add(
    "ROUTINE",
    "Use the cheapest suitable qualified route",
    qualified,
    "Existing pricing and routing policy remain authoritative.",
  );
  add(
    "LONG_CONTEXT",
    "Use a qualified long-context route",
    qualified.filter((item) => Number(item.attributes.contextTokens) > 0),
    "Context claims remain bounded by qualification evidence.",
  );
  add(
    "FALLBACK",
    "Retain the next qualified compatible route",
    qualified.slice(1),
    "Fallback is recommended only among qualified compatible candidates.",
  );
  for (const model of items.filter(
    (item) =>
      item.kind === "MODEL" && !item.configuredId && item.change === "NEW",
  ))
    result.push({
      id: `recommendation-configure-${idPart(model.id)}`,
      category: "CONFIGURATION",
      summary: `Review discovered model ${model.label}`,
      resourceIds: [model.id],
      authority: "RECOMMENDATION_ONLY",
      reason:
        "New runtime model requires explicit review and qualification before routing; no automatic configuration operation was generated.",
    });
  if (!config.resources.length)
    result.push({
      id: "recommendation-first-resource-review",
      category: "CONFIGURATION",
      summary: "Review the local controller as the first configured resource",
      resourceIds: ["machine:controller"],
      authority: "RECOMMENDATION_ONLY",
      reason:
        "A conservative controller record can be proposed, but discovered capabilities remain empty until reviewed.",
      operation: {
        kind: "resource",
        item: {
          id: "controller",
          name: "Agent Control controller",
          platform:
            process.platform === "win32"
              ? "windows"
              : process.platform === "darwin"
                ? "macos"
                : process.platform === "linux"
                  ? "linux"
                  : "unknown",
          transport: { type: "local" },
          capabilities: [],
          controller: true,
        },
      },
    });
  return result;
}
function summarize(items: DiscoveryItem[]) {
  return {
    machines: items.filter(
      (item) => item.kind === "MACHINE" && item.change !== "REMOVED",
    ).length,
    gpus: items.filter(
      (item) => item.kind === "GPU" && item.change !== "REMOVED",
    ).length,
    localModels: items.filter(
      (item) =>
        item.kind === "MODEL" &&
        (item.attributes.endpointScope === "loopback" ||
          item.attributes.runtime) &&
        item.change !== "REMOVED",
    ).length,
    providers: items.filter(
      (item) => item.kind === "PROVIDER" && item.change !== "REMOVED",
    ).length,
    agents: items.filter(
      (item) => item.kind === "AGENT" && item.change !== "REMOVED",
    ).length,
    tools: items.filter(
      (item) => item.kind === "TOOL" && item.change !== "REMOVED",
    ).length,
    memorySources: items.filter(
      (item) => item.kind === "MEMORY" && item.change !== "REMOVED",
    ).length,
    healthy: items.filter((item) => item.health === "HEALTHY").length,
    needsQualification: items.filter(
      (item) => item.health === "NEEDS_QUALIFICATION",
    ).length,
    unavailable: items.filter((item) =>
      ["UNAVAILABLE", "OFFLINE"].includes(item.health),
    ).length,
    new: items.filter((item) => item.change === "NEW").length,
  };
}
function healthRank(value: DiscoveryHealth) {
  return {
    OFFLINE: 0,
    UNAVAILABLE: 1,
    UNKNOWN: 2,
    NEEDS_QUALIFICATION: 3,
    HEALTHY: 4,
  }[value];
}
function lifecycleRank(value: DiscoveryLifecycle) {
  return {
    DISCOVERED: 0,
    QUALIFIED: 1,
    RECOMMENDED: 2,
    APPROVED: 3,
    ACTIVE: 4,
  }[value];
}
function proposalHash(
  proposal: Omit<DiscoveryProposal, "sha256"> | DiscoveryProposal,
) {
  const { sha256: _sha, ...value } = proposal as DiscoveryProposal;
  return hash(value);
}
const MODES = new Set<DiscoveryMode>([
  "FIRST_RUN",
  "QUICK_RESCAN",
  "FULL_DISCOVERY",
  "ADD_MACHINE",
  "ADD_PROVIDER",
  "ADD_LOCAL_RUNTIME",
  "ADD_MODEL",
  "IMPORT_CONFIGURATION",
]);
const TESTING = new Set<DiscoveryTesting>([
  "SKIP_TESTING",
  "QUICK_TEST",
  "FULL_QUALIFICATION",
]);

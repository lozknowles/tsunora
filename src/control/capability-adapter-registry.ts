import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  assertNoSensitiveMaterial,
  redactSensitiveValue,
} from "./security-redaction.js";
import type {
  AuthenticationState,
  DiscoveryAdapter,
  DiscoveryAdapterContext,
  DiscoveryHealth,
  DiscoveryObservation,
  DiscoveryResourceClass,
} from "./environment-discovery.js";
import {
  observeInteraction,
  unknownInteractionProfile,
  validateInteractionProfile,
  type HarnessInteractionProfile,
  type InteractionObservation,
} from "./harness-interaction.js";

export type CapabilityAdapterState =
  | "DRAFT"
  | "REVIEWED"
  | "VALIDATED"
  | "TESTED"
  | "APPROVED"
  | "ENABLED"
  | "DISABLED"
  | "REJECTED";
export interface CapabilityAdapterDefinition {
  schema: "agent-control.capability-adapter/v1";
  id: string;
  version: string;
  label: string;
  resourceClasses: DiscoveryResourceClass[];
  source: "BUILT_IN" | "USER" | "COMMUNITY_UNTRUSTED";
  detection: { kind: "EXECUTABLE" | "ENDPOINT" | "DECLARATIVE" };
  versionProbe: "STANDARD_VERSION" | "NONE";
  healthProbe: "HTTP_GET" | "NONE";
  authenticationRequirement: "NONE" | "OPTIONAL" | "REQUIRED" | "UNKNOWN";
  capabilities: string[];
  executionContract: string | null;
  qualificationTests: string[];
  securityRequirements: string[];
  interactionProfile?: HarnessInteractionProfile;
}
export interface CapabilityBinding {
  nodeId: string;
  executable?: string;
  endpoint?: string;
  configurationReference?: string;
  owner: "operator" | "configuration";
}
export interface CapabilityAdapterRecord {
  id: string;
  definition: CapabilityAdapterDefinition;
  binding: CapabilityBinding;
  state: CapabilityAdapterState;
  trust:
    "BUILT_IN" | "USER_SUPPLIED_UNREVIEWED" | "USER_REVIEWED" | "UNTRUSTED";
  createdAt: string;
  updatedAt: string;
  lastVerifiedAt: string | null;
  lastResult: null | {
    health: DiscoveryHealth;
    version: string | null;
    authentication: AuthenticationState;
    detail: string;
  };
  sha256: string;
  interactionObservations?: InteractionObservation[];
}
interface Snapshot {
  schema: "agent-control.capability-adapter-registry/v1";
  records: CapabilityAdapterRecord[];
}
const states: CapabilityAdapterState[] = [
  "DRAFT",
  "REVIEWED",
  "VALIDATED",
  "TESTED",
  "APPROVED",
  "ENABLED",
  "DISABLED",
  "REJECTED",
];
export class CapabilityAdapterRegistry {
  private value: Snapshot = {
    schema: "agent-control.capability-adapter-registry/v1",
    records: [],
  };
  constructor(
    readonly file?: string,
    private readonly clock = () => new Date().toISOString(),
  ) {
    if (file && fs.existsSync(file)) {
      const value = JSON.parse(fs.readFileSync(file, "utf8")) as Snapshot;
      if (value.schema !== this.value.schema || !Array.isArray(value.records))
        throw new Error("capability_adapter_registry_invalid");
      assertNoSensitiveMaterial(
        JSON.stringify(value),
        "capability_adapter_registry_secret_forbidden",
      );
      this.value = value;
    }
  }
  list() {
    return structuredClone(this.value.records);
  }
  get(id: string) {
    const value = this.value.records.find((record) => record.id === id);
    if (!value) throw new Error("capability_adapter_missing");
    return structuredClone(value);
  }
  add(definition: CapabilityAdapterDefinition, binding: CapabilityBinding) {
    validateDefinition(definition);
    validateBinding(binding);
    if (
      this.value.records.some(
        (record) =>
          record.definition.id === definition.id &&
          record.definition.version === definition.version &&
          record.binding.nodeId === binding.nodeId,
      )
    )
      throw new Error("capability_adapter_duplicate");
    const at = this.clock(),
      base = {
        id: `capability-adapter-${randomUUID()}`,
        definition: structuredClone(definition),
        binding: structuredClone(binding),
        state: "DRAFT" as const,
        trust:
          definition.source === "BUILT_IN"
            ? ("BUILT_IN" as const)
            : definition.source === "USER"
              ? ("USER_SUPPLIED_UNREVIEWED" as const)
              : ("UNTRUSTED" as const),
        createdAt: at,
        updatedAt: at,
        lastVerifiedAt: null,
        lastResult: null,
        interactionObservations: [],
      };
    const record = { ...base, sha256: seal(base) };
    this.value.records.push(record);
    this.persist();
    return structuredClone(record);
  }
  transition(id: string, sha256: string, next: CapabilityAdapterState) {
    const record = this.must(id, sha256),
      allowed: Record<CapabilityAdapterState, CapabilityAdapterState[]> = {
        DRAFT: ["REVIEWED", "REJECTED"],
        REVIEWED: ["VALIDATED", "REJECTED"],
        VALIDATED: ["TESTED", "REJECTED"],
        TESTED: ["APPROVED", "REJECTED"],
        APPROVED: ["ENABLED", "DISABLED"],
        ENABLED: ["DISABLED"],
        DISABLED: ["ENABLED", "REJECTED"],
        REJECTED: [],
      };
    if (!allowed[record.state].includes(next))
      throw new Error("capability_adapter_transition_invalid");
    if (next === "ENABLED" && record.lastResult?.health !== "HEALTHY")
      throw new Error("capability_adapter_test_not_healthy");
    record.state = next;
    if (next === "REVIEWED" && record.definition.source === "USER")
      record.trust = "USER_REVIEWED";
    record.updatedAt = this.clock();
    this.reseal(record);
    return structuredClone(record);
  }
  async test(
    id: string,
    sha256: string,
    probe: DiscoveryAdapterContext["probe"],
  ) {
    const record = this.must(id, sha256);
    if (record.state !== "VALIDATED")
      throw new Error("capability_adapter_not_validated");
    let health: DiscoveryHealth = "NEEDS_QUALIFICATION",
      version: string | null = null,
      detail = "declarative capability requires qualification";
    if (record.definition.detection.kind === "EXECUTABLE") {
      const result = await probe.command(
        record.binding.executable!,
        record.definition.versionProbe === "STANDARD_VERSION"
          ? ["--version"]
          : [],
        2500,
      );
      health = result.ok ? "HEALTHY" : "UNAVAILABLE";
      version = result.ok
        ? result.stdout.trim().split(/\r?\n/)[0]!.slice(0, 160)
        : null;
      detail = result.ok
        ? "fixed version probe passed"
        : "fixed version probe failed";
    } else if (record.definition.detection.kind === "ENDPOINT") {
      const result = await probe.json(record.binding.endpoint!, 2000);
      health = result.ok
        ? "HEALTHY"
        : result.status === 401 || result.status === 403
          ? "NEEDS_QUALIFICATION"
          : "UNAVAILABLE";
      detail = result.ok
        ? "bounded endpoint probe passed"
        : `bounded endpoint probe status ${result.status}`;
    }
    record.lastVerifiedAt = this.clock();
    record.lastResult = {
      health,
      version,
      authentication:
        record.definition.authenticationRequirement === "NONE"
          ? "AUTHENTICATED"
          : health === "NEEDS_QUALIFICATION"
            ? "AUTHENTICATION_REQUIRED"
            : "UNKNOWN",
      detail,
    };
    record.state = "TESTED";
    record.updatedAt = record.lastVerifiedAt;
    this.reseal(record);
    return structuredClone(record);
  }
  exportDefinition(id: string) {
    const { definition } = this.get(id);
    return structuredClone(definition);
  }
  interactionProfile(id: string) {
    const record = this.get(id);
    return record.definition.interactionProfile
      ? validateInteractionProfile(record.definition.interactionProfile)
      : unknownInteractionProfile(record.definition.id, record.definition.version);
  }
  recordInteractionObservation(
    id: string,
    sha256: string,
    input: Omit<InteractionObservation, "schema" | "drift" | "sha256">,
  ) {
    const record = this.must(id, sha256);
    if (input.adapterId !== record.definition.id)
      throw new Error("interaction_observation_adapter_mismatch");
    const observation = observeInteraction(input);
    record.interactionObservations = [
      ...(record.interactionObservations ?? []),
      observation,
    ].slice(-100);
    record.updatedAt = this.clock();
    this.reseal(record);
    return structuredClone(observation);
  }
  importDefinition(
    definition: CapabilityAdapterDefinition,
    binding: CapabilityBinding,
  ) {
    return this.add(
      {
        ...structuredClone(definition),
        source: "COMMUNITY_UNTRUSTED",
        executionContract: null,
        qualificationTests: [],
      },
      binding,
    );
  }
  private must(id: string, sha256: string) {
    const value = this.value.records.find((record) => record.id === id);
    if (!value) throw new Error("capability_adapter_missing");
    if (value.sha256 !== sha256)
      throw new Error("capability_adapter_hash_mismatch");
    return value;
  }
  private reseal(record: CapabilityAdapterRecord) {
    record.sha256 = seal(record);
    this.persist();
  }
  private persist() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`,
      safe = redactSensitiveValue(this.value);
    assertNoSensitiveMaterial(
      JSON.stringify(safe),
      "capability_adapter_registry_secret_forbidden",
    );
    fs.writeFileSync(temporary, `${JSON.stringify(safe, null, 2)}\n`, {
      mode: 0o600,
    });
    fs.renameSync(temporary, this.file);
  }
}
export class RegisteredCapabilityDiscoveryAdapter implements DiscoveryAdapter {
  id = "capability-adapter-registry";
  constructor(private readonly registry: CapabilityAdapterRegistry) {}
  async discover(context: DiscoveryAdapterContext) {
    const values: DiscoveryObservation[] = [];
    for (const record of this.registry
      .list()
      .filter((record) => record.state === "ENABLED")) {
      const result = record.lastResult,
        kind = record.definition.resourceClasses.includes("MODEL")
          ? "MODEL"
          : record.definition.resourceClasses.includes("CLI_AGENT")
            ? "AGENT"
            : record.definition.resourceClasses.includes("MCP_SERVER")
              ? "MCP"
              : record.definition.resourceClasses.includes("PROVIDER")
                ? "PROVIDER"
                : record.definition.resourceClasses.includes("TRANSPORT")
                  ? "ENDPOINT"
                  : "RUNTIME";
      values.push({
        id: `${kind.toLowerCase()}:custom:${record.definition.id}:${record.binding.nodeId}`,
        kind,
        label: record.definition.label,
        nodeId: record.binding.nodeId,
        health: result?.health ?? "NEEDS_QUALIFICATION",
        lifecycle: "DISCOVERED",
        resourceClasses: [...record.definition.resourceClasses],
        operationalState:
          result?.health === "HEALTHY"
            ? "DISCOVERED_UNQUALIFIED"
            : "UNAVAILABLE",
        configuredId: record.id,
        attributes: {
          adapterVersion: record.definition.version,
          source: record.definition.source,
          trust: record.trust,
          version: result?.version ?? "unreported",
          authenticationState: result?.authentication ?? "UNKNOWN",
          capabilities: record.definition.capabilities.join(","),
          executionContract: record.definition.executionContract ?? "none",
          executableReference: record.binding.executable
            ? "user-supplied-local-path"
            : "none",
          endpointReference: record.binding.endpoint
            ? "user-supplied-endpoint"
            : "none",
          lastSuccessfullyVerifiedAt: record.lastVerifiedAt,
        },
        provenance: [
          {
            adapter: this.id,
            method: "approved-enabled-capability-definition",
            observedAt: context.observedAt,
            authority: "CONFIGURED",
          },
        ],
      });
    }
    return values;
  }
}
export function capabilityDefinition(input: {
  id: string;
  label: string;
  type: DiscoveryResourceClass;
  source?: CapabilityAdapterDefinition["source"];
  detection: "EXECUTABLE" | "ENDPOINT" | "DECLARATIVE";
}): CapabilityAdapterDefinition {
  return {
    schema: "agent-control.capability-adapter/v1",
    id: input.id,
    version: "1.0.0",
    label: input.label,
    resourceClasses: [input.type],
    source: input.source ?? "USER",
    detection: { kind: input.detection },
    versionProbe:
      input.detection === "EXECUTABLE" ? "STANDARD_VERSION" : "NONE",
    healthProbe: input.detection === "ENDPOINT" ? "HTTP_GET" : "NONE",
    authenticationRequirement: "UNKNOWN",
    capabilities: [],
    executionContract: null,
    qualificationTests: [],
    securityRequirements: [
      "read-only discovery",
      "explicit operator approval",
      "least privilege",
      "secret redaction",
    ],
  };
}
function validateDefinition(value: CapabilityAdapterDefinition) {
  if (
    value.schema !== "agent-control.capability-adapter/v1" ||
    !/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(value.id) ||
    !/^\d+\.\d+\.\d+$/.test(value.version) ||
    !value.label.trim() ||
    !value.resourceClasses.length ||
    !value.securityRequirements.length
  )
    throw new Error("capability_adapter_definition_invalid");
  if (
    value.source === "COMMUNITY_UNTRUSTED" &&
    (value.executionContract || value.qualificationTests.length)
  )
    throw new Error("untrusted_capability_executable_contract_forbidden");
  if (value.interactionProfile)
    validateInteractionProfile(value.interactionProfile);
  assertNoSensitiveMaterial(
    JSON.stringify(value),
    "capability_adapter_definition_secret_forbidden",
  );
}
function validateBinding(value: CapabilityBinding) {
  if (
    !/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(value.nodeId) ||
    (Boolean(value.executable) === Boolean(value.endpoint) &&
      !(!value.executable && !value.endpoint))
  )
    throw new Error("capability_binding_invalid");
  if (
    value.executable &&
    !path.isAbsolute(value.executable) &&
    !/^[A-Za-z]:[\\/]/.test(value.executable)
  )
    throw new Error("capability_executable_not_absolute");
  if (value.endpoint) {
    let parsed: URL;
    try {
      parsed = new URL(value.endpoint);
    } catch {
      throw new Error("capability_endpoint_invalid");
    }
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      throw new Error("capability_endpoint_invalid");
  }
  assertNoSensitiveMaterial(
    JSON.stringify(value),
    "capability_binding_secret_forbidden",
  );
}
function seal(
  value: Omit<CapabilityAdapterRecord, "sha256"> | CapabilityAdapterRecord,
) {
  const { sha256: _sha, ...safe } = value as CapabilityAdapterRecord;
  return createHash("sha256").update(JSON.stringify(safe)).digest("hex");
}
export const CAPABILITY_ADAPTER_STATES = states;

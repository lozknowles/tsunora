import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  containsSensitiveMaterial,
  redactSensitiveText,
  redactSensitiveValue,
} from "./security-redaction.js";
import type {
  MemoryCandidate,
  ProjectMemoryPort,
  ProjectMemoryRecord,
} from "./project-memory.js";

export const SESSION_VAULT_SCHEMA = "agent-control.session-vault/v1" as const;
export const SESSION_EVENT_SCHEMA = "agent-control.session-event/v1" as const;
export const SESSION_CONTINUATION_SCHEMA =
  "agent-control.session-continuation/v1" as const;
const MINIMUM_LEASE_TTL_MS = 10_000;
const MAXIMUM_LEASE_TTL_MS = 86_400_000;

function validatedLeaseTtl(ttlMs: number) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < MINIMUM_LEASE_TTL_MS || ttlMs > MAXIMUM_LEASE_TTL_MS)
    throw new Error("session_continuation_lease_ttl_invalid");
  return ttlMs;
}
export type SessionCompleteness =
  | "ACTIVE"
  | "CHECKPOINT"
  | "COMPLETED"
  | "TRUNCATED"
  | "DAMAGED"
  | "IMPORTED";
export type SessionSensitivity =
  | "PUBLIC"
  | "INTERNAL"
  | "CONFIDENTIAL"
  | "RESTRICTED";
export type DecisionAuthority =
  | "EXPLICIT"
  | "SURROUNDING_CONTEXT"
  | "INFERRED"
  | "OPERATOR_INTERPRETATION"
  | "UNAVAILABLE";
export type SessionEventKind =
  | "SESSION_STARTED"
  | "OPERATOR_MESSAGE"
  | "ASSISTANT_MESSAGE"
  | "REASONING_SUMMARY"
  | "DECISION"
  | "TOOL_CALL"
  | "TOOL_RESULT"
  | "FILESYSTEM_READ"
  | "FILESYSTEM_WRITE"
  | "PATCH"
  | "COMMAND"
  | "TEST"
  | "COMMIT"
  | "BRANCH_CHANGED"
  | "WORKTREE_CHANGED"
  | "MODEL_CHANGED"
  | "PROVIDER_CHANGED"
  | "BATON_HANDOFF"
  | "WORK_PARCEL_TRANSITION"
  | "APPROVAL"
  | "DENIAL"
  | "CANCELLATION"
  | "ERROR"
  | "RETRY"
  | "CHECKPOINT"
  | "CONTINUATION"
  | "BRANCH"
  | "SESSION_COMPLETED"
  | "PROVIDER_EVENT";
export interface SessionProviderCapabilities {
  completeHistory: boolean;
  prompts: boolean;
  responses: boolean;
  toolCalls: boolean;
  toolResults: boolean;
  tokenUse: boolean;
  modelIdentity: boolean;
  compactionEvents: boolean;
  checkpoints: boolean;
  resumableNativeId: boolean;
  nativeBranching: boolean;
  nativeContinuation: boolean;
  reasoningSummaries: boolean;
  commitLinkage: boolean;
}

export interface NativeSessionDiscovery {
  providerId: string;
  nodeId: string;
  nativeId: string;
  sourcePath: string;
  modifiedAt: string;
  sizeBytes: number;
}
export interface NativeSessionCapture extends NativeSessionDiscovery {
  bytes: Buffer;
  capturedAt: string;
  completeness: SessionCompleteness;
  format: string;
  warnings: string[];
}
export interface SessionProviderAdapter {
  readonly providerId: string;
  readonly adapterVersion?: string;
  capabilities?(): SessionProviderCapabilities;
  discover(): Promise<NativeSessionDiscovery[]>;
  capture(discovery: NativeSessionDiscovery): Promise<NativeSessionCapture>;
  normalize(
    capture: NativeSessionCapture,
    objectSha256: string,
  ): Promise<SessionEventInput[]>;
}
export interface SessionEventInput {
  at: string;
  kind: SessionEventKind;
  actor: string;
  summary: string;
  detail?: unknown;
  nativeSequence: number;
  authority: DecisionAuthority;
  repository?: {
    root?: string;
    remote?: string;
    commit?: string;
    branch?: string;
    dirty?: boolean;
  };
}
export interface SessionEvent extends SessionEventInput {
  schema: typeof SESSION_EVENT_SCHEMA;
  id: string;
  sessionId: string;
  source: { objectSha256: string; nativeSequence: number };
  sha256: string;
}
export interface SessionVaultRecord {
  schema: typeof SESSION_VAULT_SCHEMA;
  id: string;
  providerId: string;
  nodeId: string;
  nativeId: string;
  parentSessionId?: string;
  capturedAt: string;
  modifiedAt: string;
  completeness: SessionCompleteness;
  format: string;
  source: {
    path: string;
    pathSha256: string;
    adapterVersion: string;
    runtimeVersion?: string;
    previousObjectSha256?: string;
  };
  raw: { objectSha256: string; sizeBytes: number; encrypted: boolean };
  policy: {
    sensitivity: SessionSensitivity;
    localOnly: boolean;
    metadataOnly: boolean;
    redactedIndex: boolean;
    retentionDays: number | null;
  };
  events: SessionEvent[];
  repository: {
    root?: string;
    remote?: string;
    commits: string[];
    branches: string[];
    dirtyObserved: boolean | null;
  };
  route?: {
    providerId: string;
    accountProfileId?: string;
    modelId?: string;
    nodeId: string;
  };
  warnings: string[];
  sha256: string;
}
export interface SessionSearchResult {
  sessionId: string;
  providerId: string;
  nodeId: string;
  completeness: SessionCompleteness;
  score: number;
  matches: Array<{
    eventId: string;
    kind: SessionEventKind;
    at: string;
    summary: string;
    authority: DecisionAuthority;
  }>;
  sourceObjectSha256: string;
}
export interface SessionLease {
  sessionId: string;
  leaseId: string;
  nodeId: string;
  actorId: string;
  acquiredAt: string;
  expiresAt: string;
  releasedAt?: string;
  forcedRelease?: { at: string; actorId: string; reason: string };
}
export interface SessionLeaseEvent {
  id: string;
  at: string;
  action: "ACQUIRED" | "RENEWED" | "RELEASED" | "FORCED_RELEASE" | "DENIED";
  sessionId: string;
  leaseId?: string;
  nodeId: string;
  actorId: string;
  reason?: string;
  sha256: string;
}
export interface ContinuationSource {
  kind:
    | "YOUR_MEMORIES"
    | "SESSION_VAULT_INDEX"
    | "PROVIDER_NATIVE_EVIDENCE"
    | "REPOSITORY"
    | "WORK_PARCEL";
  id: string;
  sha256: string;
  authority: "AUTHORITATIVE" | "VALIDATED_MEMORY" | "CORROBORATING";
}
export interface SessionContinuation {
  schema: typeof SESSION_CONTINUATION_SCHEMA;
  id: string;
  sourceSessionId: string;
  createdAt: string;
  actorId: string;
  nodeId: string;
  leaseId: string;
  mode: "CONTINUE" | "BRANCH";
  workParcelId: string;
  repository: { commit?: string; branch?: string; dirty?: boolean };
  sources: ContinuationSource[];
  status: "PREPARED" | "ACTIVE" | "COMPLETED" | "FAILED";
  sha256: string;
}
export interface GovernedContinuationPort {
  verifyRepository(input: {
    repository: string;
    commit?: string;
    branch?: string;
    nodeId: string;
  }): Promise<{
    repositoryId: string;
    commit: string;
    branch: string;
    dirty: boolean;
    evidenceSha256: string;
  }>;
  createSession(input: {
    actorId: string;
    nodeId: string;
    sourceSessionId: string;
    mode: "CONTINUE" | "BRANCH";
    contextPolicy: "preserved-evidence";
  }): { id: string };
  createWorkParcel(input: {
    actorId: string;
    objective: string;
    nodeId: string;
    governedSessionId: string;
    sourceSessionId: string;
    context: string;
    contextSha256: string;
  }): { id: string };
}
export interface SessionPrivacyPolicy {
  sensitivity: SessionSensitivity;
  localOnly?: boolean;
  metadataOnly?: boolean;
  excludedPathPatterns?: string[];
  excludedRepositories?: string[];
  redactSensitive?: boolean;
  encryptionKey?: Buffer;
  retentionDays?: number;
}
export interface SessionVaultProjection {
  schema: typeof SESSION_VAULT_SCHEMA;
  health: { state: "READY" | "DEGRADED"; reason?: string };
  sessions: number;
  objects: number;
  bytes: number;
  activeLeases: number;
  replication: {
    pending: number;
    failures: number;
    lastSuccessAt: string | null;
  };
  providers: Record<string, number>;
  nodes: Record<string, number>;
  states: Record<string, number>;
  integrityFailures: number;
  recentContinuations: SessionContinuation[];
  leaseAudit: SessionLeaseEvent[];
  recent: Array<{
    id: string;
    providerId: string;
    nodeId: string;
    capturedAt: string;
    modifiedAt: string;
    completeness: SessionCompleteness;
    raw: { objectSha256: string; sizeBytes: number; encrypted: boolean };
    policy: SessionVaultRecord["policy"];
    events: SessionEvent[];
    repository: SessionVaultRecord["repository"];
  }>;
}
export class SessionVaultRuntime {
  private readonly adapters = new Map<string, SessionProviderAdapter>();
  constructor(
    readonly vault: ImmutableSessionVault,
    adapters: SessionProviderAdapter[] = [],
    private readonly policy: SessionPrivacyPolicy = {
      sensitivity: "CONFIDENTIAL",
      redactSensitive: true,
    },
  ) {
    for (const adapter of adapters)
      this.adapters.set(adapter.providerId, adapter);
  }
  async discover(providerId?: string) {
    const adapters = providerId
        ? [this.mustAdapter(providerId)]
        : [...this.adapters.values()],
      found = (
        await Promise.all(adapters.map((adapter) => adapter.discover()))
      ).flat();
    return found.map(({ sourcePath, ...safe }) => safe);
  }
  async capture(providerId: string, nativeId: string) {
    const adapter = this.mustAdapter(providerId),
      discovery = (await adapter.discover()).find(
        (item) => item.nativeId === nativeId,
      );
    if (!discovery) throw new Error("session_native_evidence_missing");
    return this.vault.ingest(adapter, discovery, this.policy);
  }
  search(query: string, limit?: number) {
    return this.vault.search(query, limit);
  }
  projection() {
    return this.vault.projection();
  }
  private mustAdapter(providerId: string) {
    const adapter = this.adapters.get(providerId);
    if (!adapter) throw new Error("session_provider_adapter_unavailable");
    return adapter;
  }
}

export class CodexSessionAdapter implements SessionProviderAdapter {
  readonly providerId = "codex";
  readonly adapterVersion = "codex-jsonl/v1";
  capabilities(): SessionProviderCapabilities {
    return {
      completeHistory: true,
      prompts: true,
      responses: true,
      toolCalls: true,
      toolResults: true,
      tokenUse: true,
      modelIdentity: true,
      compactionEvents: true,
      checkpoints: true,
      resumableNativeId: true,
      nativeBranching: false,
      nativeContinuation: true,
      reasoningSummaries: false,
      commitLinkage: true,
    };
  }
  constructor(
    private readonly roots: string[],
    private readonly nodeId: string,
    private readonly clock = () => new Date().toISOString(),
  ) {}
  async discover() {
    const found: NativeSessionDiscovery[] = [];
    for (const root of this.roots) {
      if (!fs.existsSync(root)) continue;
      for (const file of walk(root)) {
        if (!file.endsWith(".jsonl")) continue;
        const stat = fs.statSync(file);
        if (!stat.isFile()) continue;
        found.push({
          providerId: this.providerId,
          nodeId: this.nodeId,
          nativeId: path.basename(file, ".jsonl"),
          sourcePath: file,
          modifiedAt: stat.mtime.toISOString(),
          sizeBytes: stat.size,
        });
      }
    }
    return found.sort(
      (a, b) =>
        b.modifiedAt.localeCompare(a.modifiedAt) ||
        a.nativeId.localeCompare(b.nativeId),
    );
  }
  async capture(discovery: NativeSessionDiscovery) {
    if (
      discovery.providerId !== this.providerId ||
      discovery.nodeId !== this.nodeId
    )
      throw new Error("session_discovery_identity_mismatch");
    const resolved = path.resolve(discovery.sourcePath);
    if (!this.roots.some((root) => inside(path.resolve(root), resolved)))
      throw new Error("session_source_outside_configured_root");
    const before = fs.statSync(resolved),
      bytes = fs.readFileSync(resolved),
      after = fs.statSync(resolved),
      warnings: string[] = [];
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
      warnings.push("source_changed_during_capture");
    const inspection = inspectCodexJsonl(bytes);
    return {
      ...discovery,
      bytes,
      capturedAt: this.clock(),
      completeness: inspection.completeness,
      format: "codex-rollout-jsonl",
      warnings: [...warnings, ...inspection.warnings],
    };
  }
  async normalize(capture: NativeSessionCapture, objectSha256: string) {
    const lines = capture.bytes.toString("utf8").split("\n"),
      events: SessionEventInput[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line?.trim()) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isRecord(parsed)) continue;
      const payload = isRecord(parsed.payload) ? parsed.payload : {},
        type = String(parsed.type ?? payload.type ?? "provider_event"),
        at = iso(parsed.timestamp ?? payload.timestamp ?? capture.modifiedAt),
        mapped = mapCodexEvent(type, payload),
        detail = redactSensitiveValue(compactProviderDetail(payload));
      events.push({
        at,
        kind: mapped.kind,
        actor: mapped.actor,
        summary: redactSensitiveText(mapped.summary),
        detail,
        nativeSequence: i + 1,
        authority: mapped.authority,
        repository: repositoryFrom(payload),
      });
    }
    return events;
  }
}

export class ImmutableSessionVault {
  private readonly objects: string;
  private readonly records: string;
  private readonly leasesFile: string;
  private readonly leaseAuditFile: string;
  private readonly continuationsFile: string;
  private readonly replicationFile: string;
  constructor(
    readonly root: string,
    private readonly clock = () => new Date().toISOString(),
  ) {
    this.objects = path.join(root, "objects");
    this.records = path.join(root, "sessions");
    this.leasesFile = path.join(root, "leases.json");
    this.leaseAuditFile = path.join(root, "lease-audit.json");
    this.continuationsFile = path.join(root, "continuations.json");
    this.replicationFile = path.join(root, "replication.json");
    secureDir(root);
    secureDir(this.objects);
    secureDir(this.records);
  }
  async ingest(
    adapter: SessionProviderAdapter,
    discovery: NativeSessionDiscovery,
    policy: SessionPrivacyPolicy,
  ) {
    if (
      policy.excludedPathPatterns?.some((pattern) =>
        discovery.sourcePath.includes(pattern),
      )
    )
      throw new Error("session_capture_excluded_by_policy");
    const capture = await adapter.capture(discovery),
      raw = policy.metadataOnly
        ? Buffer.from(
            JSON.stringify({
              providerId: capture.providerId,
              nativeId: capture.nativeId,
              sizeBytes: capture.sizeBytes,
              modifiedAt: capture.modifiedAt,
            }),
          )
        : capture.bytes;
    if (
      !policy.redactSensitive &&
      containsSensitiveMaterial(raw.toString("utf8")) &&
      policy.sensitivity !== "RESTRICTED"
    )
      throw new Error("session_capture_sensitive_policy_required");
    const object = writeObject(this.objects, raw, policy.encryptionKey),
      sessionId = `session:${capture.providerId}:${capture.nodeId}:${capture.nativeId}`,
      inputs = await adapter.normalize(capture, object.sha256),
      events = inputs.map((input) =>
        sealEvent(sessionId, input, object.sha256),
      ),
      repository = repositoryProjection(events);
    if (
      policy.excludedRepositories?.some(
        (excluded) =>
          repository.root === excluded || repository.remote === excluded,
      )
    )
      throw new Error("session_capture_repository_excluded_by_policy");
    const prior = this.index()
        .filter((item) => item.id === sessionId)
        .at(-1),
      metadata = events.find((item) => item.kind === "SESSION_STARTED")?.detail,
      runtimeVersion = isRecord(metadata)
        ? stringValue(metadata.cli_version)
        : undefined,
      model = isRecord(metadata)
        ? stringValue(metadata.model_provider)
        : undefined,
      base: Omit<SessionVaultRecord, "sha256"> = {
        schema: SESSION_VAULT_SCHEMA,
        id: sessionId,
        providerId: capture.providerId,
        nodeId: capture.nodeId,
        nativeId: capture.nativeId,
        capturedAt: capture.capturedAt,
        modifiedAt: capture.modifiedAt,
        completeness: capture.completeness,
        format: capture.format,
        source: {
          path: capture.sourcePath,
          pathSha256: hash(capture.sourcePath),
          adapterVersion: adapter.adapterVersion ?? "unversioned",
          ...(runtimeVersion ? { runtimeVersion } : {}),
          ...(prior
            ? {
                previousObjectSha256: this.readVersion(prior.id, prior.sha256)
                  .raw.objectSha256,
              }
            : {}),
        },
        raw: {
          objectSha256: object.sha256,
          sizeBytes: raw.length,
          encrypted: object.encrypted,
        },
        policy: {
          sensitivity: policy.sensitivity,
          localOnly: policy.localOnly ?? false,
          metadataOnly: policy.metadataOnly ?? false,
          redactedIndex: policy.redactSensitive ?? true,
          retentionDays: policy.retentionDays ?? null,
        },
        events,
        warnings: capture.warnings,
        repository,
        route: {
          providerId: capture.providerId,
          ...(model ? { modelId: model } : {}),
          nodeId: capture.nodeId,
        },
      };
    const record = { ...base, sha256: hash(stable(base)) };
    writeJsonImmutable(
      path.join(this.records, `${safeId(sessionId)}-${record.sha256}.json`),
      record,
    );
    this.appendIndex(record);
    return structuredClone(record);
  }
  list() {
    return this.index()
      .map((item) => this.readVersion(item.id, item.sha256))
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  }
  read(id: string) {
    const item = this.index()
      .filter((entry) => entry.id === id)
      .at(-1);
    if (!item) throw new Error("session_vault_record_missing");
    return this.readVersion(item.id, item.sha256);
  }
  raw(id: string, key?: Buffer) {
    const record = this.read(id),
      file = objectPath(
        this.objects,
        record.raw.objectSha256,
        record.raw.encrypted,
      );
    const bytes = fs.readFileSync(file);
    if (hash(bytes) === record.raw.objectSha256) return bytes;
    if (!record.raw.encrypted || !key)
      throw new Error("session_vault_object_integrity_invalid");
    const plain = decrypt(bytes, key);
    if (hash(plain) !== record.raw.objectSha256)
      throw new Error("session_vault_object_integrity_invalid");
    return plain;
  }
  storedObject(id: string) {
    const record = this.read(id);
    return fs.readFileSync(
      objectPath(this.objects, record.raw.objectSha256, record.raw.encrypted),
    );
  }
  search(query: string, limit = 20) {
    const terms = tokens(query),
      includeProviderEnvelopes = terms.includes("provider");
    return this.list()
      .map((record) => {
        const metadata =
            `${record.id} ${record.providerId} ${record.nodeId} ${record.repository.root ?? ""} ${record.repository.remote ?? ""} ${record.repository.commits.join(" ")} ${record.repository.branches.join(" ")}`.toLowerCase(),
          matches = record.events
            .filter(
              (event) =>
                includeProviderEnvelopes || event.kind !== "PROVIDER_EVENT",
            )
            .map((event) => ({
              event,
              score: terms.filter((term) =>
                `${event.summary} ${stable(event.detail)} ${metadata}`
                  .toLowerCase()
                  .includes(term),
              ).length,
            }))
            .filter((item) => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 12);
        return {
          sessionId: record.id,
          providerId: record.providerId,
          nodeId: record.nodeId,
          completeness: record.completeness,
          score: matches.reduce((sum, item) => sum + item.score, 0),
          matches: matches.map(({ event }) => ({
            eventId: event.id,
            kind: event.kind,
            at: event.at,
            summary: event.summary,
            authority: event.authority,
          })),
          sourceObjectSha256: record.raw.objectSha256,
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(
        0,
        Math.min(Math.max(limit, 1), 100),
      ) satisfies SessionSearchResult[];
  }
  structuredSearch(filter: {
    providerId?: string;
    nodeId?: string;
    repository?: string;
    commit?: string;
    branch?: string;
    from?: string;
    to?: string;
    completeness?: SessionCompleteness;
  }) {
    return this.list().filter(
      (record) =>
        (!filter.providerId || record.providerId === filter.providerId) &&
        (!filter.nodeId || record.nodeId === filter.nodeId) &&
        (!filter.repository ||
          record.repository.root === filter.repository ||
          record.repository.remote === filter.repository) &&
        (!filter.commit || record.repository.commits.includes(filter.commit)) &&
        (!filter.branch ||
          record.repository.branches.includes(filter.branch)) &&
        (!filter.from || record.modifiedAt >= filter.from) &&
        (!filter.to || record.modifiedAt <= filter.to) &&
        (!filter.completeness || record.completeness === filter.completeness),
    );
  }
  acquireLease(
    sessionId: string,
    nodeId: string,
    actorId: string,
    ttlMs = 300_000,
  ) {
    this.read(sessionId);
    const leaseTtlMs = validatedLeaseTtl(ttlMs);
    const now = Date.parse(this.clock()),
      leases = this.leases(),
      active = leases.find(
        (item) =>
          item.sessionId === sessionId &&
          !item.releasedAt &&
          Date.parse(item.expiresAt) > now,
      );
    if (active) {
      this.recordLease({
        action: "DENIED",
        sessionId,
        nodeId,
        actorId,
        reason: "session_continuation_lease_held",
      });
      throw new Error("session_continuation_lease_held");
    }
    const acquiredAt = this.clock(),
      lease: SessionLease = {
        sessionId,
        leaseId: `lease:${randomUUID()}`,
        nodeId,
        actorId,
        acquiredAt,
        expiresAt: new Date(Date.parse(acquiredAt) + leaseTtlMs).toISOString(),
      };
    leases.push(lease);
    writeJson(this.leasesFile, leases);
    this.recordLease({
      action: "ACQUIRED",
      sessionId,
      leaseId: lease.leaseId,
      nodeId,
      actorId,
    });
    return structuredClone(lease);
  }
  renewLease(leaseId: string, nodeId: string, ttlMs = 300_000) {
    const leaseTtlMs = validatedLeaseTtl(ttlMs),
      leases = this.leases(),
      lease = leases.find((item) => item.leaseId === leaseId);
    if (
      !lease ||
      lease.releasedAt ||
      lease.nodeId !== nodeId ||
      Date.parse(lease.expiresAt) <= Date.parse(this.clock())
    )
      throw new Error("session_continuation_lease_invalid");
    lease.expiresAt = new Date(Date.parse(this.clock()) + leaseTtlMs).toISOString();
    writeJson(this.leasesFile, leases);
    this.recordLease({
      action: "RENEWED",
      sessionId: lease.sessionId,
      leaseId,
      nodeId,
      actorId: lease.actorId,
    });
    return structuredClone(lease);
  }
  releaseLease(leaseId: string, nodeId: string) {
    const leases = this.leases(),
      lease = leases.find((item) => item.leaseId === leaseId);
    if (!lease || lease.releasedAt || lease.nodeId !== nodeId)
      throw new Error("session_continuation_lease_invalid");
    lease.releasedAt = this.clock();
    writeJson(this.leasesFile, leases);
    this.recordLease({
      action: "RELEASED",
      sessionId: lease.sessionId,
      leaseId,
      nodeId,
      actorId: lease.actorId,
    });
    return structuredClone(lease);
  }
  forceRelease(leaseId: string, actorId: string, reason: string) {
    if (!reason.trim())
      throw new Error("session_lease_release_reason_required");
    const leases = this.leases(),
      lease = leases.find((item) => item.leaseId === leaseId);
    if (!lease || lease.releasedAt)
      throw new Error("session_continuation_lease_invalid");
    lease.releasedAt = this.clock();
    lease.forcedRelease = {
      at: lease.releasedAt,
      actorId,
      reason: redactSensitiveText(reason),
    };
    writeJson(this.leasesFile, leases);
    this.recordLease({
      action: "FORCED_RELEASE",
      sessionId: lease.sessionId,
      leaseId,
      nodeId: lease.nodeId,
      actorId,
      reason: lease.forcedRelease.reason,
    });
    return structuredClone(lease);
  }
  prepareContinuation(input: {
    sourceSessionId: string;
    actorId: string;
    nodeId: string;
    mode: "CONTINUE" | "BRANCH";
    workParcelId: string;
    repository?: { commit?: string; branch?: string; dirty?: boolean };
    sources: ContinuationSource[];
    ttlMs?: number;
  }) {
    const lease = this.acquireLease(
      input.sourceSessionId,
      input.nodeId,
      input.actorId,
      input.ttlMs,
    );
    try {
      return this.sealContinuation(input, lease);
    } catch (error) {
      this.releaseLease(lease.leaseId, lease.nodeId);
      throw error;
    }
  }
  sealContinuation(
    input: {
      sourceSessionId: string;
      actorId: string;
      nodeId: string;
      mode: "CONTINUE" | "BRANCH";
      workParcelId: string;
      repository?: { commit?: string; branch?: string; dirty?: boolean };
      sources: ContinuationSource[];
    },
    lease: SessionLease,
  ) {
    const source = this.read(input.sourceSessionId);
    if (
      lease.sessionId !== source.id ||
      lease.nodeId !== input.nodeId ||
      lease.actorId !== input.actorId ||
      lease.releasedAt ||
      Date.parse(lease.expiresAt) <= Date.parse(this.clock())
    )
      throw new Error("session_continuation_lease_invalid");
    if (input.sources.some((item) => !/^[a-f0-9]{64}$/.test(item.sha256)))
      throw new Error("session_continuation_source_invalid");
    if (
      !input.sources.some(
        (item) =>
          item.kind === "PROVIDER_NATIVE_EVIDENCE" &&
          item.sha256 === source.raw.objectSha256,
      )
    )
      throw new Error("session_continuation_native_evidence_required");
    const createdAt = this.clock(),
      base: Omit<SessionContinuation, "sha256"> = {
        schema: SESSION_CONTINUATION_SCHEMA,
        id: `continuation:${randomUUID()}`,
        sourceSessionId: source.id,
        createdAt,
        actorId: input.actorId,
        nodeId: input.nodeId,
        leaseId: lease.leaseId,
        mode: input.mode,
        workParcelId: input.workParcelId,
        repository: input.repository ?? {},
        sources: input.sources,
        status: "PREPARED",
      },
      record = { ...base, sha256: hash(stable(base)) },
      all = this.continuations();
    all.push(record);
    writeJson(this.continuationsFile, all);
    return structuredClone(record);
  }
  continuations() {
    return readJson<SessionContinuation[]>(this.continuationsFile, []);
  }
  leases() {
    return readJson<SessionLease[]>(this.leasesFile, []);
  }
  leaseAudit() {
    return readJson<SessionLeaseEvent[]>(this.leaseAuditFile, []);
  }
  projection(): SessionVaultProjection {
    const sessions = this.list(),
      objects = fs.existsSync(this.objects)
        ? fs
            .readdirSync(this.objects)
            .filter((name) => name.endsWith(".object") || name.endsWith(".enc"))
        : [],
      replication = readJson<{
        pending: number;
        failures: number;
        lastSuccessAt: string | null;
      }>(this.replicationFile, {
        pending: 0,
        failures: 0,
        lastSuccessAt: null,
      }),
      counts = (values: string[]) =>
        Object.fromEntries(
          [...new Set(values)]
            .sort()
            .map((value) => [
              value,
              values.filter((item) => item === value).length,
            ]),
        );
    let integrityFailures = 0;
    try {
      this.verify();
    } catch {
      integrityFailures = 1;
    }
    return {
      schema: SESSION_VAULT_SCHEMA,
      health: integrityFailures
        ? {
            state: "DEGRADED",
            reason: "Immutable evidence integrity check failed",
          }
        : { state: "READY" },
      sessions: sessions.length,
      objects: objects.length,
      bytes: sessions.reduce((sum, item) => sum + item.raw.sizeBytes, 0),
      activeLeases: this.leases().filter(
        (item) => !item.releasedAt && Date.parse(item.expiresAt) > Date.now(),
      ).length,
      replication,
      providers: counts(sessions.map((item) => item.providerId)),
      nodes: counts(sessions.map((item) => item.nodeId)),
      states: counts(sessions.map((item) => item.completeness)),
      integrityFailures,
      recentContinuations: this.continuations().slice(-20).reverse(),
      leaseAudit: this.leaseAudit().slice(-40).reverse(),
      recent: sessions
        .slice(0, 20)
        .map(
          ({
            id,
            providerId,
            nodeId,
            capturedAt,
            modifiedAt,
            completeness,
            raw,
            policy,
            events,
            repository,
          }) => ({
            id,
            providerId,
            nodeId,
            capturedAt,
            modifiedAt,
            completeness,
            raw,
            policy,
            events,
            repository,
          }),
        ),
    };
  }
  verify() {
    for (const record of this.list()) {
      const { sha256, ...base } = record;
      if (hash(stable(base)) !== sha256)
        throw new Error("session_vault_record_integrity_invalid");
      const file = objectPath(
        this.objects,
        record.raw.objectSha256,
        record.raw.encrypted,
      );
      if (!fs.existsSync(file)) throw new Error("session_vault_object_missing");
      if (
        !record.raw.encrypted &&
        hash(fs.readFileSync(file)) !== record.raw.objectSha256
      )
        throw new Error("session_vault_object_integrity_invalid");
      for (const event of record.events) {
        const { sha256: eventHash, ...eventBase } = event;
        if (hash(stable(eventBase)) !== eventHash)
          throw new Error("session_vault_event_integrity_invalid");
      }
    }
    for (const event of this.leaseAudit()) {
      const { sha256, ...base } = event;
      if (hash(stable(base)) !== sha256)
        throw new Error("session_vault_lease_audit_integrity_invalid");
    }
    return { ok: true, sessions: this.list().length, checkedAt: this.clock() };
  }
  private recordLease(input: Omit<SessionLeaseEvent, "id" | "at" | "sha256">) {
    const base: Omit<SessionLeaseEvent, "sha256"> = {
        id: `lease-event:${randomUUID()}`,
        at: this.clock(),
        ...input,
        ...(input.reason ? { reason: redactSensitiveText(input.reason) } : {}),
      },
      event = { ...base, sha256: hash(stable(base)) },
      events = this.leaseAudit();
    events.push(event);
    writeJson(this.leaseAuditFile, events);
    return structuredClone(event);
  }
  private readVersion(id: string, sha256: string) {
    const value = readJson<SessionVaultRecord>(
      path.join(this.records, `${safeId(id)}-${sha256}.json`),
      null as never,
    );
    const { sha256: actual, ...base } = value;
    if (actual !== sha256 || hash(stable(base)) !== actual)
      throw new Error("session_vault_record_integrity_invalid");
    return value;
  }
  private index() {
    return readJson<Array<{ id: string; sha256: string; capturedAt: string }>>(
      path.join(this.root, "index.json"),
      [],
    );
  }
  private appendIndex(record: SessionVaultRecord) {
    const index = this.index();
    if (
      !index.some(
        (item) => item.id === record.id && item.sha256 === record.sha256,
      )
    ) {
      index.push({
        id: record.id,
        sha256: record.sha256,
        capturedAt: record.capturedAt,
      });
      writeJson(path.join(this.root, "index.json"), index);
    }
  }
}

export interface SessionReplicationBackend {
  readonly id: string;
  hasObject(sha256: string, encrypted: boolean): Promise<boolean>;
  putObject(sha256: string, encrypted: boolean, bytes: Buffer): Promise<void>;
  putRecord(record: SessionVaultRecord): Promise<void>;
}
export class FilesystemSessionReplicationBackend
  implements SessionReplicationBackend
{
  constructor(
    readonly id: string,
    private readonly root: string,
  ) {
    secureDir(root);
    secureDir(path.join(root, "objects"));
    secureDir(path.join(root, "sessions"));
  }
  async hasObject(sha256: string, encrypted: boolean) {
    return fs.existsSync(
      objectPath(path.join(this.root, "objects"), sha256, encrypted),
    );
  }
  async putObject(sha256: string, encrypted: boolean, bytes: Buffer) {
    const destination = objectPath(
      path.join(this.root, "objects"),
      sha256,
      encrypted,
    );
    if (fs.existsSync(destination)) return;
    writeBytesImmutable(destination, bytes);
  }
  async putRecord(record: SessionVaultRecord) {
    writeJsonImmutable(
      path.join(
        this.root,
        "sessions",
        `${safeId(record.id)}-${record.sha256}.json`,
      ),
      record,
    );
    const indexFile = path.join(this.root, "index.json"),
      index = readJson<
        Array<{ id: string; sha256: string; capturedAt: string }>
      >(indexFile, []);
    if (
      !index.some(
        (item) => item.id === record.id && item.sha256 === record.sha256,
      )
    ) {
      index.push({
        id: record.id,
        sha256: record.sha256,
        capturedAt: record.capturedAt,
      });
      writeJson(indexFile, index);
    }
  }
}
export async function replicateSession(
  vault: ImmutableSessionVault,
  backend: SessionReplicationBackend,
  sessionId: string,
) {
  const record = vault.read(sessionId);
  if (record.policy.localOnly)
    throw new Error("session_replication_local_only");
  const alreadyPresent = await backend.hasObject(
    record.raw.objectSha256,
    record.raw.encrypted,
  );
  if (!alreadyPresent)
    await backend.putObject(
      record.raw.objectSha256,
      record.raw.encrypted,
      vault.storedObject(sessionId),
    );
  await backend.putRecord(record);
  return {
    backendId: backend.id,
    sessionId,
    objectSha256: record.raw.objectSha256,
    recordSha256: record.sha256,
    deduplicated: alreadyPresent,
  };
}

export interface SessionReplicationQueueItem {
  sessionId: string;
  backendId: string;
  attempts: number;
  nextAttemptAt: string;
  lastError?: string;
}
export class SessionReplicationCoordinator {
  private readonly queueFile: string;
  constructor(
    private readonly vault: ImmutableSessionVault,
    private readonly backends: SessionReplicationBackend[],
    stateRoot: string,
    private readonly clock = () => new Date().toISOString(),
  ) {
    this.queueFile = path.join(stateRoot, "replication-queue.json");
  }
  enqueue(sessionId: string, backendId: string) {
    this.vault.read(sessionId);
    if (!this.backends.some((item) => item.id === backendId))
      throw new Error("session_replication_backend_missing");
    const queue = this.queue();
    if (
      !queue.some(
        (item) => item.sessionId === sessionId && item.backendId === backendId,
      )
    )
      queue.push({
        sessionId,
        backendId,
        attempts: 0,
        nextAttemptAt: this.clock(),
      });
    writeJson(this.queueFile, queue);
    return queue;
  }
  async tick() {
    const queue = this.queue(),
      now = Date.parse(this.clock()),
      results: Array<{
        sessionId: string;
        backendId: string;
        status: "SUCCEEDED" | "RETRY";
        error?: string;
      }> = [];
    for (const item of queue.filter(
      (entry) => Date.parse(entry.nextAttemptAt) <= now,
    )) {
      const backend = this.backends.find(
        (entry) => entry.id === item.backendId,
      )!;
      try {
        await replicateSession(this.vault, backend, item.sessionId);
        queue.splice(queue.indexOf(item), 1);
        results.push({
          sessionId: item.sessionId,
          backendId: item.backendId,
          status: "SUCCEEDED",
        });
      } catch (error) {
        item.attempts++;
        item.lastError = redactSensitiveText(
          error instanceof Error ? error.message : String(error),
        );
        item.nextAttemptAt = new Date(
          now + Math.min(60_000, 1000 * 2 ** Math.min(item.attempts, 6)),
        ).toISOString();
        results.push({
          sessionId: item.sessionId,
          backendId: item.backendId,
          status: "RETRY",
          error: item.lastError,
        });
      }
    }
    writeJson(this.queueFile, queue);
    return results;
  }
  queue() {
    return readJson<SessionReplicationQueueItem[]>(this.queueFile, []);
  }
}

export interface SessionAttribution {
  kind: "COMMIT" | "FILE" | "DECISION";
  query: string;
  sessionId: string;
  nodeId: string;
  providerId: string;
  confidence: number;
  status: "EXACT" | "CORROBORATED" | "AMBIGUOUS";
  authority: DecisionAuthority;
  evidence: string[];
  summary: string;
}
export class SessionProvenanceIndex {
  constructor(private readonly vault: ImmutableSessionVault) {}
  commit(commit: string) {
    const matches = this.vault.structuredSearch({ commit });
    return this.attributions(
      "COMMIT",
      commit,
      matches,
      (record) =>
        `Session ${record.id} explicitly recorded repository commit ${commit}.`,
    );
  }
  file(file: string) {
    const matches = this.vault
      .list()
      .filter((record) =>
        record.events.some((event) =>
          `${event.summary} ${stable(event.detail)}`.includes(file),
        ),
      );
    return this.attributions(
      "FILE",
      file,
      matches,
      (record) =>
        `Session ${record.id} contains provider-native indexed evidence for ${file}.`,
    );
  }
  decision(query: string) {
    const terms = tokens(query),
      matches = this.vault
        .list()
        .filter((record) =>
          record.events.some(
            (event) =>
              event.kind === "DECISION" &&
              terms.some((term) => event.summary.toLowerCase().includes(term)),
          ),
        );
    return this.attributions(
      "DECISION",
      query,
      matches,
      (record) =>
        record.events.find(
          (event) =>
            event.kind === "DECISION" &&
            terms.some((term) => event.summary.toLowerCase().includes(term)),
        )?.summary ?? "Decision context is unavailable.",
    );
  }
  private attributions(
    kind: SessionAttribution["kind"],
    query: string,
    matches: SessionVaultRecord[],
    summary: (record: SessionVaultRecord) => string,
  ) {
    return matches.map((record) => {
      const decision = record.events.find((event) => event.kind === "DECISION"),
        ambiguous = matches.length > 1;
      return {
        kind,
        query,
        sessionId: record.id,
        nodeId: record.nodeId,
        providerId: record.providerId,
        confidence: ambiguous ? 0.6 : kind === "COMMIT" ? 1 : 0.85,
        status: ambiguous
          ? "AMBIGUOUS"
          : kind === "COMMIT"
            ? "EXACT"
            : "CORROBORATED",
        authority:
          decision?.authority ??
          (kind === "COMMIT" ? "EXPLICIT" : "SURROUNDING_CONTEXT"),
        evidence: [
          `session:${record.id}:sha256:${record.sha256}`,
          `native-object:sha256:${record.raw.objectSha256}`,
        ],
        summary: summary(record),
      } satisfies SessionAttribution;
    });
  }
}

export class SessionMemoryPromotionService {
  constructor(
    private readonly vault: ImmutableSessionVault,
    private readonly memories: ProjectMemoryPort,
    private readonly clock = () => new Date().toISOString(),
  ) {}
  async promote(input: {
    sessionId: string;
    candidate: Omit<MemoryCandidate, "provenance" | "verification">;
    approvedBy: string;
    independentValidation: {
      passed: boolean;
      evidenceId: string;
      evidenceSha256: string;
    };
  }): Promise<ProjectMemoryRecord> {
    const session = this.vault.read(input.sessionId);
    if (!input.approvedBy.trim())
      throw new Error("session_memory_approval_required");
    if (!input.independentValidation.passed)
      throw new Error("session_memory_validation_required");
    const provenance = [
      {
        id: `session-vault:${session.id}`,
        sha256: session.raw.objectSha256,
        authority: "AUTHORITATIVE" as const,
      },
      {
        id: input.independentValidation.evidenceId,
        sha256: input.independentValidation.evidenceSha256,
        authority: "CORROBORATING" as const,
      },
    ];
    return this.memories.remember({
      ...input.candidate,
      verification: "VERIFIED",
      lastVerifiedAt: this.clock(),
      provenance,
    });
  }
}

export class GovernedSessionContinuationService {
  constructor(
    private readonly vault: ImmutableSessionVault,
    private readonly control: GovernedContinuationPort,
    private readonly memories?: ProjectMemoryPort,
  ) {}
  async prepare(input: {
    sourceSessionId: string;
    actorId: string;
    nodeId: string;
    mode: "CONTINUE" | "BRANCH";
    objective: string;
    repository: string;
    commit?: string;
    branch?: string;
    memoryProjectId?: string;
  }) {
    const source = this.vault.read(input.sourceSessionId);
    this.vault.verify();
    const repository = await this.control.verifyRepository({
      repository: input.repository,
      commit: input.commit,
      branch: input.branch,
      nodeId: input.nodeId,
    });
    if (input.commit && repository.commit !== input.commit)
      throw new Error("session_continuation_repository_mismatch");
    const lease = this.vault.acquireLease(
        source.id,
        input.nodeId,
        input.actorId,
      ),
      sources: ContinuationSource[] = [
        {
          kind: "PROVIDER_NATIVE_EVIDENCE",
          id: source.id,
          sha256: source.raw.objectSha256,
          authority: "AUTHORITATIVE",
        },
        {
          kind: "SESSION_VAULT_INDEX",
          id: source.id,
          sha256: source.sha256,
          authority: "CORROBORATING",
        },
        {
          kind: "REPOSITORY",
          id: repository.repositoryId,
          sha256: repository.evidenceSha256,
          authority: "AUTHORITATIVE",
        },
      ];
    let memoryText =
      "No validated Your Memories record was required or available.";
    if (this.memories && input.memoryProjectId) {
      const recalled = await this.memories.recall({
        projectId: input.memoryProjectId,
        repositoryId: repository.repositoryId,
        query: input.objective,
        limit: 4,
        maximumBytes: 16_384,
      });
      if (recalled.accepted.length) {
        memoryText = recalled.accepted
          .map((item) => `${item.memory.title}: ${item.memory.content}`)
          .join("\n\n");
        for (const item of recalled.accepted)
          sources.push({
            kind: "YOUR_MEMORIES",
            id: item.memory.id,
            sha256: item.memory.contentSha256,
            authority: "VALIDATED_MEMORY",
          });
      }
    }
    const boundedContext = redactSensitiveText(
        [
          `Contextual continuation based on preserved evidence; hidden provider state is not transferred.`,
          `Objective: ${input.objective}`,
          `Source session: ${source.id}`,
          `Source evidence: ${source.raw.objectSha256}`,
          `Repository: ${repository.repositoryId} at ${repository.commit} (${repository.branch}; dirty=${repository.dirty})`,
          `Your Memories:\n${memoryText}`,
          `Recent indexed context:\n${source.events
            .slice(-12)
            .map((event) => `${event.at} ${event.kind} ${event.summary}`)
            .join("\n")}`,
        ].join("\n\n"),
      ).slice(0, 65_536),
      contextSha256 = hash(boundedContext);
    try {
      const governedSession = this.control.createSession({
          actorId: input.actorId,
          nodeId: input.nodeId,
          sourceSessionId: source.id,
          mode: input.mode,
          contextPolicy: "preserved-evidence",
        }),
        parcel = this.control.createWorkParcel({
          actorId: input.actorId,
          objective: input.objective,
          nodeId: input.nodeId,
          governedSessionId: governedSession.id,
          sourceSessionId: source.id,
          context: boundedContext,
          contextSha256,
        });
      sources.push({
        kind: "WORK_PARCEL",
        id: parcel.id,
        sha256: contextSha256,
        authority: "AUTHORITATIVE",
      });
      const continuation = this.vault.sealContinuation(
        {
          sourceSessionId: source.id,
          actorId: input.actorId,
          nodeId: input.nodeId,
          mode: input.mode,
          workParcelId: parcel.id,
          repository: {
            commit: repository.commit,
            branch: repository.branch,
            dirty: repository.dirty,
          },
          sources,
        },
        lease,
      );
      return {
        continuation,
        governedSessionId: governedSession.id,
        workParcelId: parcel.id,
        boundedContext,
        contextSha256,
      };
    } catch (error) {
      this.vault.releaseLease(lease.leaseId, lease.nodeId);
      throw error;
    }
  }
}

function inspectCodexJsonl(bytes: Buffer) {
  const text = bytes.toString("utf8"),
    lines = text.split("\n").filter(Boolean),
    warnings: string[] = [];
  let damaged = false,
    completed = false,
    checkpoint = false;
  for (const line of lines) {
    try {
      const item = JSON.parse(line) as Record<string, unknown>,
        payload = isRecord(item.payload) ? item.payload : {};
      completed ||=
        item.type === "session_completed" ||
        payload.type === "task_complete" ||
        payload.type === "turn_complete";
      checkpoint ||=
        payload.type === "context_compacted" || payload.type === "checkpoint";
    } catch {
      damaged = true;
    }
  }
  if (bytes.length && !text.endsWith("\n"))
    warnings.push("source_final_line_not_terminated");
  if (damaged) warnings.push("source_contains_unparseable_jsonl");
  return {
    completeness: damaged
      ? "DAMAGED"
      : completed
        ? "COMPLETED"
        : checkpoint
          ? "CHECKPOINT"
          : ("ACTIVE" as SessionCompleteness),
    warnings,
  };
}
function mapCodexEvent(
  type: string,
  payload: Record<string, unknown>,
): Pick<SessionEventInput, "kind" | "actor" | "summary" | "authority"> {
  const payloadType = String(payload.type ?? ""),
    name = String(payload.name ?? ""),
    argumentsText =
      typeof payload.arguments === "string" ? payload.arguments : "",
    output = extractText(payload.output);
  if (type === "session_meta")
    return {
      kind: "SESSION_STARTED",
      actor: "provider",
      summary: "Codex session metadata recorded",
      authority: "EXPLICIT",
    };
  if (payloadType === "function_call") {
    const kind: SessionEventKind = name.includes("apply_patch")
      ? "PATCH"
      : name.includes("exec") &&
          /\b(?:test|check|verify)\b/i.test(argumentsText)
        ? "TEST"
        : name.includes("exec")
          ? "COMMAND"
          : "TOOL_CALL";
    return {
      kind,
      actor: "agent",
      summary: redactSensitiveText(`${name}: ${argumentsText}`).slice(0, 500),
      authority: "EXPLICIT",
    };
  }
  if (payloadType === "function_call_output")
    return {
      kind: /\[[^\]]+\s+[a-f0-9]{7,40}\]/i.test(output)
        ? "COMMIT"
        : "TOOL_RESULT",
      actor: "tool",
      summary: redactSensitiveText(output || "Codex tool result").slice(0, 500),
      authority: "EXPLICIT",
    };
  if (type === "response_item") {
    const role = String(payload.role ?? "provider"),
      content = extractText(payload.content);
    if (!["user", "assistant"].includes(role))
      return {
        kind: "PROVIDER_EVENT",
        actor: "provider",
        summary: `Codex ${role} instruction envelope retained only in native evidence`,
        authority: "EXPLICIT",
      };
    return {
      kind: role === "user" ? "OPERATOR_MESSAGE" : "ASSISTANT_MESSAGE",
      actor: role,
      summary: redactSensitiveText(content || `${role} response item`).slice(
        0,
        500,
      ),
      authority: "EXPLICIT",
    };
  }
  if (payloadType.includes("decision"))
    return {
      kind: "DECISION",
      actor: "agent",
      summary: redactSensitiveText(
        extractText(payload.content) ||
          String(payload.summary ?? "Codex decision event"),
      ).slice(0, 500),
      authority: "EXPLICIT",
    };
  if (payloadType.includes("tool"))
    return {
      kind: payloadType.includes("output") ? "TOOL_RESULT" : "TOOL_CALL",
      actor: "agent",
      summary: `Codex ${payloadType.replaceAll("_", " ")}`,
      authority: "EXPLICIT",
    };
  if (payloadType.includes("compact"))
    return {
      kind: "CHECKPOINT",
      actor: "provider",
      summary: "Codex context checkpoint observed",
      authority: "EXPLICIT",
    };
  if (payloadType.includes("complete"))
    return {
      kind: "SESSION_COMPLETED",
      actor: "provider",
      summary: "Codex completion event observed",
      authority: "EXPLICIT",
    };
  return {
    kind: "PROVIDER_EVENT",
    actor: "provider",
    summary: `Codex ${payloadType || type}`.slice(0, 240),
    authority: "EXPLICIT",
  };
}
function compactProviderDetail(payload: Record<string, unknown>) {
  const role = String(payload.role ?? ""),
    instructionEnvelope = role && !["user", "assistant"].includes(role);
  const allow = [
    "type",
    "role",
    "name",
    "arguments",
    "status",
    "turn_id",
    "session_id",
    "model_context_window",
    "cwd",
    "model_provider",
    "cli_version",
    "context_window",
    "git",
    "branch",
    "commit",
    "repository",
    ...(instructionEnvelope ? [] : ["content"]),
    "output",
  ];
  return Object.fromEntries(
    allow.filter((key) => key in payload).map((key) => [key, payload[key]]),
  );
}
function repositoryFrom(payload: Record<string, unknown>) {
  const git = isRecord(payload.git) ? payload.git : {},
    output = extractText(payload.output),
    commitMatch = /\[[^\]]+\s+([a-f0-9]{7,40})\]/i.exec(output),
    value = {
      root: stringValue(payload.cwd),
      remote: stringValue(payload.repository),
      commit: stringValue(git.commit ?? payload.commit ?? commitMatch?.[1]),
      branch: stringValue(git.branch ?? payload.branch),
      dirty:
        typeof git.dirty === "boolean"
          ? git.dirty
          : typeof payload.dirty === "boolean"
            ? payload.dirty
            : undefined,
    };
  return Object.values(value).some((item) => item !== undefined)
    ? value
    : undefined;
}
function repositoryProjection(events: SessionEvent[]) {
  const values = events
    .map((item) => item.repository)
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  return {
    root: values.find((item) => item.root)?.root,
    remote: values.find((item) => item.remote)?.remote,
    commits: [
      ...new Set(values.flatMap((item) => (item.commit ? [item.commit] : []))),
    ],
    branches: [
      ...new Set(values.flatMap((item) => (item.branch ? [item.branch] : []))),
    ],
    dirtyObserved: values.some((item) => typeof item.dirty === "boolean")
      ? values.some((item) => item.dirty === true)
      : null,
  };
}
function sealEvent(
  sessionId: string,
  input: SessionEventInput,
  objectSha256: string,
): SessionEvent {
  const base: Omit<SessionEvent, "sha256"> = {
    ...input,
    schema: SESSION_EVENT_SCHEMA,
    id: `event:${hash(`${sessionId}:${input.nativeSequence}:${stable(input)}`).slice(0, 24)}`,
    sessionId,
    source: { objectSha256, nativeSequence: input.nativeSequence },
  };
  return { ...base, sha256: hash(stable(base)) };
}
function writeObject(root: string, plain: Buffer, key?: Buffer) {
  const sha256 = hash(plain),
    encrypted = Boolean(key),
    file = objectPath(root, sha256, encrypted);
  if (!fs.existsSync(file))
    writeBytesImmutable(file, key ? encrypt(plain, key) : plain);
  return { sha256, encrypted };
}
function objectPath(root: string, sha256: string, encrypted: boolean) {
  if (!/^[a-f0-9]{64}$/.test(sha256))
    throw new Error("session_object_hash_invalid");
  return path.join(root, `${sha256}.${encrypted ? "enc" : "object"}`);
}
function encrypt(value: Buffer, key: Buffer) {
  if (key.length !== 32) throw new Error("session_encryption_key_invalid");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv),
    body = Buffer.concat([cipher.update(value), cipher.final()]);
  return Buffer.concat([Buffer.from("ACSV1"), iv, cipher.getAuthTag(), body]);
}
function decrypt(value: Buffer, key: Buffer) {
  if (value.subarray(0, 5).toString() !== "ACSV1" || key.length !== 32)
    throw new Error("session_encryption_material_invalid");
  const decipher = createDecipheriv("aes-256-gcm", key, value.subarray(5, 17));
  decipher.setAuthTag(value.subarray(17, 33));
  return Buffer.concat([decipher.update(value.subarray(33)), decipher.final()]);
}
function walk(root: string) {
  const result: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) result.push(...walk(file));
    else result.push(file);
  }
  return result;
}
function inside(root: string, file: string) {
  return file === root || file.startsWith(`${root}${path.sep}`);
}
function secureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    /* platform ACLs remain authoritative */
  }
}
function safeId(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 240);
}
function writeBytesImmutable(file: string, value: Buffer) {
  secureDir(path.dirname(file));
  try {
    fs.writeFileSync(file, value, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}
function writeJsonImmutable(file: string, value: unknown) {
  writeBytesImmutable(file, Buffer.from(`${JSON.stringify(value)}\n`));
}
function writeJson(file: string, value: unknown) {
  secureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.renameSync(temp, file);
}
function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}
function hash(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}
function stable(value: unknown): string {
  return Array.isArray(value)
    ? `[${value.map(stable).join(",")}]`
    : value && typeof value === "object"
      ? `{${Object.entries(value)
          .filter(([, item]) => item !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
          .join(",")}}`
      : JSON.stringify(value);
}
function tokens(value: string) {
  const stop = new Set([
    "a",
    "an",
    "and",
    "are",
    "did",
    "do",
    "find",
    "for",
    "from",
    "how",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "was",
    "what",
    "when",
    "where",
    "which",
    "why",
    "with",
  ]);
  return [
    ...new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9._-]+/)
        .filter((item) => item.length > 1 && !stop.has(item)),
    ),
  ];
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function stringValue(value: unknown) {
  return typeof value === "string" && value.trim()
    ? redactSensitiveText(value)
    : undefined;
}
function iso(value: unknown) {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(parsed)
    ? new Date(parsed).toISOString()
    : new Date(0).toISOString();
}
function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value
      .map((item) => extractText(item))
      .filter(Boolean)
      .join(" ");
  if (isRecord(value))
    return typeof value.text === "string"
      ? value.text
      : typeof value.output_text === "string"
        ? value.output_text
        : "";
  return "";
}

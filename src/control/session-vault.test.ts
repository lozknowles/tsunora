import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import {
  CodexSessionAdapter,
  FilesystemSessionReplicationBackend,
  ImmutableSessionVault,
  SessionMemoryPromotionService,
  SessionProvenanceIndex,
  SessionReplicationCoordinator,
  SessionVaultRuntime,
  replicateSession,
  type NativeSessionCapture,
  type NativeSessionDiscovery,
  type SessionEventInput,
  type SessionProviderAdapter,
  type SessionReplicationBackend,
} from "./session-vault.js";
import { MarkdownProjectMemoryPort } from "./project-memory.js";

const sha = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-vault-")),
    native = path.join(root, "native"),
    vaultRoot = path.join(root, "vault");
  fs.mkdirSync(native);
  return {
    root,
    native,
    vault: new ImmutableSessionVault(
      vaultRoot,
      () => "2026-09-12T10:00:00.000Z",
    ),
  };
}
function rollout(native: string, id = "rollout-test") {
  const file = path.join(native, `${id}.jsonl`),
    lines = [
      {
        timestamp: "2026-09-12T09:00:00Z",
        type: "session_meta",
        payload: {
          id,
          cwd: "/repo",
          git: {
            commit: "a".repeat(40),
            branch: "feature/session-vault",
            dirty: false,
          },
        },
      },
      {
        timestamp: "2026-09-12T09:01:00Z",
        type: "response_item",
        payload: {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: "private provider instruction envelope",
            },
          ],
        },
      },
      {
        timestamp: "2026-09-12T09:01:30Z",
        type: "response_item",
        payload: {
          role: "user",
          content: [
            { type: "input_text", text: "Why did we change the route policy?" },
          ],
        },
      },
      {
        timestamp: "2026-09-12T09:02:00Z",
        type: "event_msg",
        payload: {
          type: "decision",
          content:
            "We changed the route policy because qualification evidence rejected the stale route.",
        },
      },
      {
        timestamp: "2026-09-12T09:03:00Z",
        type: "event_msg",
        payload: { type: "task_complete" },
      },
    ];
  fs.writeFileSync(
    file,
    `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
  );
  return { file, bytes: fs.readFileSync(file) };
}

test("Codex adapter discovers configured roots and immutable capture preserves native bytes", async (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  const source = rollout(value.native),
    adapter = new CodexSessionAdapter(
      [value.native],
      "controller",
      () => "2026-09-12T10:00:00.000Z",
    ),
    runtime = new SessionVaultRuntime(value.vault, [adapter], {
      sensitivity: "RESTRICTED",
      redactSensitive: true,
    }),
    found = await adapter.discover();
  assert.equal(found.length, 1);
  const record = await runtime.capture("codex", found[0]!.nativeId);
  assert.equal(record.raw.objectSha256, sha(source.bytes));
  assert.deepEqual(value.vault.raw(record.id), source.bytes);
  assert.equal(record.completeness, "COMPLETED");
  assert.deepEqual(record.repository.commits, ["a".repeat(40)]);
  assert.doesNotMatch(JSON.stringify(record), /private provider instruction/);
  assert.ok(
    record.events.some((event) =>
      event.summary.includes("retained only in native evidence"),
    ),
  );
  assert.equal(value.vault.verify().ok, true);
});

test("normalization redacts synthetic secrets while encrypted source remains exact and restricted", async (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  const secret = "sk-proj-SYNTHETIC0123456789",
    file = path.join(value.native, "secret.jsonl"),
    bytes = Buffer.from(
      `${JSON.stringify({ timestamp: "2026-09-12T09:00:00Z", type: "response_item", payload: { role: "user", content: `api_key=${secret}` } })}\n`,
    );
  fs.writeFileSync(file, bytes);
  const adapter = new CodexSessionAdapter([value.native], "controller"),
    discovery = (await adapter.discover())[0]!,
    key = randomBytes(32),
    record = await value.vault.ingest(adapter, discovery, {
      sensitivity: "RESTRICTED",
      redactSensitive: true,
      encryptionKey: key,
    });
  assert.equal(value.vault.raw(record.id, key).toString(), bytes.toString());
  assert.doesNotMatch(JSON.stringify(record), /SYNTHETIC0123456789/);
  assert.match(record.events[0]!.summary, /REDACTED/);
  assert.throws(() => value.vault.raw(record.id), /integrity_invalid/);
});

test("damaged native evidence is preserved and never mislabelled complete", async (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(value.native, "broken.jsonl"),
    '{"type":"session_meta"}\n{"broken"',
  );
  const adapter = new CodexSessionAdapter([value.native], "controller"),
    record = await value.vault.ingest(adapter, (await adapter.discover())[0]!, {
      sensitivity: "RESTRICTED",
    });
  assert.equal(record.completeness, "DAMAGED");
  assert.ok(record.warnings.includes("source_contains_unparseable_jsonl"));
});

test("search attributes a decision and commit to exact immutable evidence", async (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  rollout(value.native);
  const adapter = new CodexSessionAdapter([value.native], "controller"),
    record = await value.vault.ingest(adapter, (await adapter.discover())[0]!, {
      sensitivity: "RESTRICTED",
    }),
    result = value.vault.search("stale route qualification evidence")[0]!;
  assert.equal(result.sessionId, record.id);
  assert.equal(result.sourceObjectSha256, record.raw.objectSha256);
  assert.equal(result.matches[0]!.authority, "EXPLICIT");
  assert.match(result.matches[0]!.summary, /qualification evidence/);
});

test("exclusive continuation leases deny split brain and forced release is audited", async (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  rollout(value.native);
  const adapter = new CodexSessionAdapter([value.native], "controller"),
    record = await value.vault.ingest(adapter, (await adapter.discover())[0]!, {
      sensitivity: "RESTRICTED",
    }),
    first = value.vault.acquireLease(record.id, "node-a", "operator");
  assert.throws(
    () => value.vault.acquireLease(record.id, "node-b", "operator"),
    /lease_held/,
  );
  assert.equal(value.vault.leaseAudit().at(-1)?.action, "DENIED");
  assert.equal(value.vault.projection().leaseAudit[0]?.nodeId, "node-b");
  const released = value.vault.forceRelease(
    first.leaseId,
    "operator",
    "node was physically retired",
  );
  assert.equal(released.forcedRelease?.actorId, "operator");
  assert.equal(
    value.vault.acquireLease(record.id, "node-b", "operator").nodeId,
    "node-b",
  );
  assert.deepEqual(
    value.vault.leaseAudit().map((event) => event.action),
    ["ACQUIRED", "DENIED", "FORCED_RELEASE", "ACQUIRED"],
  );
});

test("lease audit tampering fails immutable evidence verification", async (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  rollout(value.native);
  const adapter = new CodexSessionAdapter([value.native], "controller"),
    record = await value.vault.ingest(adapter, (await adapter.discover())[0]!, {
      sensitivity: "RESTRICTED",
    });
  value.vault.acquireLease(record.id, "node-a", "operator");
  const auditFile = path.join(value.vault.root, "lease-audit.json"),
    audit = JSON.parse(fs.readFileSync(auditFile, "utf8"));
  audit[0].nodeId = "tampered-node";
  fs.writeFileSync(auditFile, JSON.stringify(audit));
  assert.throws(() => value.vault.verify(), /lease_audit_integrity_invalid/);
});

test("continuation requires native provenance and seals every contributing source", async (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  rollout(value.native);
  const adapter = new CodexSessionAdapter([value.native], "controller"),
    record = await value.vault.ingest(adapter, (await adapter.discover())[0]!, {
      sensitivity: "RESTRICTED",
    });
  assert.throws(
    () =>
      value.vault.prepareContinuation({
        sourceSessionId: record.id,
        actorId: "operator",
        nodeId: "node-b",
        mode: "BRANCH",
        workParcelId: "parcel-new",
        sources: [],
      }),
    /native_evidence_required/,
  );
  const continuation = value.vault.prepareContinuation({
    sourceSessionId: record.id,
    actorId: "operator",
    nodeId: "node-b",
    mode: "BRANCH",
    workParcelId: "parcel-new",
    repository: { commit: "b".repeat(40), branch: "continuation" },
    sources: [
      {
        kind: "PROVIDER_NATIVE_EVIDENCE",
        id: record.id,
        sha256: record.raw.objectSha256,
        authority: "AUTHORITATIVE",
      },
      {
        kind: "YOUR_MEMORIES",
        id: "memory-1",
        sha256: "c".repeat(64),
        authority: "VALIDATED_MEMORY",
      },
    ],
  });
  assert.equal(continuation.sources.length, 2);
  assert.match(continuation.sha256, /^[a-f0-9]{64}$/);
  assert.equal(continuation.workParcelId, "parcel-new");
});

test("filesystem replication is incremental, hash-preserving and deduplicated", async (t) => {
  const value = fixture(),
    peer = path.join(value.root, "peer");
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  rollout(value.native);
  const adapter = new CodexSessionAdapter([value.native], "controller"),
    record = await value.vault.ingest(adapter, (await adapter.discover())[0]!, {
      sensitivity: "RESTRICTED",
    }),
    backend = new FilesystemSessionReplicationBackend("peer-node", peer),
    first = await replicateSession(value.vault, backend, record.id),
    second = await replicateSession(value.vault, backend, record.id);
  assert.equal(first.deduplicated, false);
  assert.equal(second.deduplicated, true);
  const replica = new ImmutableSessionVault(peer);
  assert.equal(replica.read(record.id).sha256, record.sha256);
  assert.equal(replica.verify().ok, true);
});

test("tampering is rejected before historical evidence can be used", async (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  rollout(value.native);
  const adapter = new CodexSessionAdapter([value.native], "controller"),
    record = await value.vault.ingest(adapter, (await adapter.discover())[0]!, {
      sensitivity: "RESTRICTED",
    }),
    object = path.join(
      value.vault.root,
      "objects",
      `${record.raw.objectSha256}.object`,
    );
  fs.appendFileSync(object, "tamper");
  assert.throws(() => value.vault.verify(), /object_integrity_invalid/);
});

test("Session Vault evidence reaches Your Memories only after approval and independent validation", async (t) => {
  const value = fixture(),
    memoryRoot = path.join(value.root, "obsidian", "Your Memories");
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  rollout(value.native);
  const adapter = new CodexSessionAdapter([value.native], "controller"),
    record = await value.vault.ingest(adapter, (await adapter.discover())[0]!, {
      sensitivity: "RESTRICTED",
    }),
    memories = new MarkdownProjectMemoryPort(memoryRoot, "obsidian-markdown"),
    promotion = new SessionMemoryPromotionService(value.vault, memories);
  const candidate = {
    kind: "DECISION" as const,
    title: "Route policy decision",
    content: "Qualification evidence requires stale routes to be rejected.",
    projectId: "agent-control",
    repositoryId: "repo",
    originatingNodeId: "controller",
    source: "AGENT_CONTROL" as const,
    confidence: 0.98,
    supersedes: [],
  };
  await assert.rejects(
    () =>
      promotion.promote({
        sessionId: record.id,
        candidate,
        approvedBy: "operator",
        independentValidation: {
          passed: false,
          evidenceId: "verification",
          evidenceSha256: "d".repeat(64),
        },
      }),
    /validation_required/,
  );
  const memory = await promotion.promote({
    sessionId: record.id,
    candidate,
    approvedBy: "operator",
    independentValidation: {
      passed: true,
      evidenceId: "verification",
      evidenceSha256: "d".repeat(64),
    },
  });
  assert.equal(memory.verification, "VERIFIED");
  assert.equal(memory.provenance[0]!.sha256, record.raw.objectSha256);
  fs.renameSync(
    path.join(value.root, "obsidian"),
    path.join(value.root, "obsidian-disabled"),
  );
  assert.equal(value.vault.search("route policy").length, 1);
});

test("provider-neutral adapter captures non-Codex history through the same core", async (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  const bytes = Buffer.from("provider-neutral evidence"),
    discovery: NativeSessionDiscovery = {
      providerId: "fixture-provider",
      nodeId: "edge",
      nativeId: "native-1",
      sourcePath: "provider://native-1",
      modifiedAt: "2026-09-12T09:00:00Z",
      sizeBytes: bytes.length,
    },
    adapter: SessionProviderAdapter = {
      providerId: "fixture-provider",
      discover: async () => [discovery],
      capture: async (item) =>
        ({
          ...item,
          bytes,
          capturedAt: "2026-09-12T10:00:00Z",
          completeness: "COMPLETED",
          format: "fixture",
          warnings: [],
        }) satisfies NativeSessionCapture,
      normalize: async () => [
        {
          at: "2026-09-12T09:00:00Z",
          kind: "DECISION",
          actor: "model",
          summary: "Provider-neutral decision evidence",
          nativeSequence: 1,
          authority: "EXPLICIT",
        } satisfies SessionEventInput,
      ],
    };
  const runtime = new SessionVaultRuntime(value.vault, [adapter], {
      sensitivity: "INTERNAL",
    }),
    record = await runtime.capture("fixture-provider", "native-1");
  assert.equal(record.providerId, "fixture-provider");
  assert.equal(runtime.search("neutral decision")[0]!.sessionId, record.id);
});

test("active, checkpoint and append ordering remain distinct", async (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  const file = path.join(value.native, "progress.jsonl");
  fs.writeFileSync(
    file,
    `${JSON.stringify({ timestamp: "2026-09-12T09:00:00Z", type: "session_meta", payload: { id: "progress" } })}\n`,
  );
  const adapter = new CodexSessionAdapter([value.native], "controller"),
    discovery = (await adapter.discover())[0]!,
    active = await value.vault.ingest(adapter, discovery, {
      sensitivity: "INTERNAL",
    });
  assert.equal(active.completeness, "ACTIVE");
  fs.appendFileSync(
    file,
    `${JSON.stringify({ timestamp: "2026-09-12T09:01:00Z", type: "event_msg", payload: { type: "context_compacted" } })}\n`,
  );
  const checkpoint = await value.vault.ingest(
    adapter,
    (await adapter.discover())[0]!,
    { sensitivity: "INTERNAL" },
  );
  assert.equal(checkpoint.completeness, "CHECKPOINT");
  assert.equal(checkpoint.source.previousObjectSha256, active.raw.objectSha256);
  assert.notEqual(checkpoint.raw.objectSha256, active.raw.objectSha256);
});

test("local-only, excluded path and excluded repository policies fail closed", async (t) => {
  const value = fixture(),
    peer = path.join(value.root, "peer");
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  rollout(value.native);
  const adapter = new CodexSessionAdapter([value.native], "controller"),
    discovery = (await adapter.discover())[0]!,
    local = await value.vault.ingest(adapter, discovery, {
      sensitivity: "RESTRICTED",
      localOnly: true,
    });
  await assert.rejects(
    () =>
      replicateSession(
        value.vault,
        new FilesystemSessionReplicationBackend("peer", peer),
        local.id,
      ),
    /local_only/,
  );
  await assert.rejects(
    () =>
      value.vault.ingest(adapter, discovery, {
        sensitivity: "RESTRICTED",
        excludedPathPatterns: ["rollout-test"],
      }),
    /excluded_by_policy/,
  );
  await assert.rejects(
    () =>
      value.vault.ingest(adapter, discovery, {
        sensitivity: "RESTRICTED",
        excludedRepositories: ["/repo"],
      }),
    /repository_excluded/,
  );
});

test("lease renewal and stale lease recovery preserve the audit record", async (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  rollout(value.native);
  const adapter = new CodexSessionAdapter([value.native], "controller"),
    record = await value.vault.ingest(adapter, (await adapter.discover())[0]!, {
      sensitivity: "INTERNAL",
    }),
    lease = value.vault.acquireLease(record.id, "node-a", "operator", 10_000),
    renewed = value.vault.renewLease(lease.leaseId, "node-a", 20_000);
  assert.ok(renewed.expiresAt > lease.expiresAt);
  assert.throws(
    () => value.vault.renewLease(lease.leaseId, "node-b"),
    /lease_invalid/,
  );
  assert.throws(
    () => value.vault.acquireLease(record.id, "node-b", "operator", 9_999),
    /lease_ttl_invalid/,
  );
  assert.throws(
    () => value.vault.renewLease(lease.leaseId, "node-a", 86_400_001),
    /lease_ttl_invalid/,
  );
  value.vault.releaseLease(lease.leaseId, "node-a");
  assert.throws(
    () => value.vault.renewLease(lease.leaseId, "node-a", 10_000),
    /lease_invalid/,
  );
});

test("replication coordinator retains a redacted retry after backend outage", async (t) => {
  const value = fixture(),
    queueRoot = path.join(value.root, "queue");
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  rollout(value.native);
  const adapter = new CodexSessionAdapter([value.native], "controller"),
    record = await value.vault.ingest(adapter, (await adapter.discover())[0]!, {
      sensitivity: "INTERNAL",
    }),
    backend: SessionReplicationBackend = {
      id: "offline",
      hasObject: async () => {
        throw new Error("backend offline password=synthetic-secret");
      },
      putObject: async () => {},
      putRecord: async () => {},
    },
    coordinator = new SessionReplicationCoordinator(
      value.vault,
      [backend],
      queueRoot,
      () => "2026-09-12T10:00:00Z",
    );
  coordinator.enqueue(record.id, "offline");
  const result = await coordinator.tick();
  assert.equal(result[0]!.status, "RETRY");
  assert.match(result[0]!.error!, /REDACTED/);
  assert.doesNotMatch(JSON.stringify(coordinator.queue()), /synthetic-secret/);
});

test("provenance distinguishes exact commit attribution from ambiguity", async (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  rollout(value.native, "one");
  rollout(value.native, "two");
  const adapter = new CodexSessionAdapter([value.native], "controller");
  for (const discovery of await adapter.discover())
    await value.vault.ingest(adapter, discovery, { sensitivity: "INTERNAL" });
  const provenance = new SessionProvenanceIndex(value.vault),
    commits = provenance.commit("a".repeat(40));
  assert.equal(commits.length, 2);
  assert.ok(
    commits.every(
      (item) => item.status === "AMBIGUOUS" && item.confidence === 0.6,
    ),
  );
  assert.ok(
    provenance
      .decision("stale route")
      .every((item) => item.authority === "EXPLICIT"),
  );
});

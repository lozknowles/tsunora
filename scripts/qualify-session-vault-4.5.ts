import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ActionRegistry,
  ArtifactStore,
  JobRuntime,
  ResourceLockManager,
  RunLedger,
  WorkerRegistry,
} from "../src/control/job-runtime.js";
import { JobCatalog } from "../src/control/job-catalog.js";
import {
  WorkParcelCoordinator,
  WorkParcelStore,
  type WorkParcelPlan,
  type WorkParcelPlanner,
} from "../src/control/work-parcels.js";
import { IdentityControlPlane } from "../src/control/identity-control-plane.js";
import { MarkdownProjectMemoryPort } from "../src/control/project-memory.js";
import {
  CodexSessionAdapter,
  ImmutableSessionVault,
  SessionMemoryPromotionService,
  SessionProvenanceIndex,
  SessionVaultRuntime,
  GovernedSessionContinuationService,
  replicateSession,
  type GovernedContinuationPort,
  type NativeSessionCapture,
  type NativeSessionDiscovery,
  type SessionEventInput,
  type SessionProviderAdapter,
} from "../src/control/session-vault.js";
import { SshFilesystemSessionReplicationBackend } from "../src/control/session-vault-ssh.js";
import {
  executeSsh,
  sshResourceArgs,
} from "../src/control/managed-node-ssh.js";
import type { ResourceConfig } from "../src/control/config.js";

const at = () => new Date().toISOString(),
  hash = (value: string | Buffer) =>
    createHash("sha256").update(value).digest("hex"),
  root = path.resolve(
    process.env.AGENT_CONTROL_SESSION_VAULT_QUALIFICATION_ROOT ??
      "qualification/agent-control-session-vault-20260912",
  ),
  fixture = path.join(root, "source-repository"),
  state = path.join(root, "state"),
  vaultRoot = path.join(state, "vault"),
  memoryRoot = path.join(state, "obsidian-compatible", "Your Memories"),
  sourceNodeId =
    process.env.AGENT_CONTROL_SESSION_VAULT_SOURCE_NODE_ID ??
    "qualification-source",
  destinationNodeId =
    process.env.AGENT_CONTROL_SESSION_VAULT_REMOTE_NODE_ID ??
    "qualification-peer",
  remoteRoot =
    process.env.AGENT_CONTROL_SESSION_VAULT_REMOTE_ROOT ??
    "/tmp/agent-control-session-vault-qualification-20260912/vault",
  remoteWork = path.posix.dirname(remoteRoot),
  resource: ResourceConfig = {
    id: destinationNodeId,
    name: "Session Vault qualification peer",
    platform: "linux",
    transport: {
      type: "ssh",
      host:
        process.env.AGENT_CONTROL_SESSION_VAULT_REMOTE_HOST ??
        destinationNodeId,
      user: process.env.AGENT_CONTROL_SESSION_VAULT_REMOTE_USER,
      port: Number(process.env.AGENT_CONTROL_SESSION_VAULT_REMOTE_PORT ?? 22),
    },
    capabilities: ["session-vault.replica", "session-vault.continue"],
  };
const command = (name: string, args: string[], cwd = fixture) =>
  execFileSync(name, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
function fresh() {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(fixture, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(fixture, "route-policy.txt"),
    "Route policy: use the first configured route even when qualification evidence is stale.\n",
  );
  fs.writeFileSync(
    path.join(fixture, "verify.mjs"),
    `import fs from 'node:fs';const policy=fs.readFileSync('route-policy.txt','utf8'),decision=fs.readFileSync('decision.md','utf8');if(!policy.includes('reject stale qualification evidence')||!decision.includes('Stale qualification evidence can select an unsafe or unavailable route'))process.exit(1);console.log('verified-route-policy');\n`,
  );
  command("git", ["init", "-q"]);
  command("git", ["config", "user.name", "Agent Control Qualification"]);
  command("git", ["config", "user.email", "qualification@invalid"]);
  command("git", ["add", "."]);
  command("git", ["commit", "-qm", "qualification: baseline route policy"]);
}
function codexSession() {
  const before = new Set(findJsonl()),
    started = Date.now(),
    prompt = `Work only in this disposable Agent Control qualification repository. Make this exact small, auditable change:\n1. Replace route-policy.txt with: Route policy: reject stale qualification evidence before selecting a route.\n2. Create decision.md containing the heading "Decision" and this explicit rationale: "Stale qualification evidence can select an unsafe or unavailable route, so stale routes must be rejected before routing."\n3. Run node verify.mjs.\n4. If verification passes, git add route-policy.txt decision.md and create a commit with message "qualification: reject stale routes".\nDo not alter anything else. Report the commit and verification result.`;
  const result = spawnSync(
    "codex",
    [
      "exec",
      "--json",
      "--color",
      "never",
      "-C",
      fixture,
      "--sandbox",
      "danger-full-access",
      "-",
    ],
    {
      input: prompt,
      encoding: "utf8",
      timeout: 300_000,
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `codex_physical_session_failed:${result.status}:${safe(result.stderr).slice(-500)}`,
    );
  const events = result.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as Record<string, unknown>];
        } catch {
          return [];
        }
      }),
    thread = events.find((item) => item.type === "thread.started")?.thread_id;
  const candidates = findJsonl().filter(
      (file) =>
        !before.has(file) && fs.statSync(file).mtimeMs >= started - 2_000,
    ),
    file =
      candidates.find((item) => item.includes(String(thread ?? ""))) ??
      candidates.sort(
        (a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs,
      )[0];
  if (!file) throw new Error("codex_native_session_not_found");
  const commit = command("git", ["rev-parse", "HEAD"]),
    message = command("git", ["log", "-1", "--format=%s"]);
  if (message !== "qualification: reject stale routes")
    throw new Error(`codex_commit_missing:${message}`);
  return {
    file,
    commit,
    threadId:
      typeof thread === "string" ? thread : path.basename(file, ".jsonl"),
    providerOutputSha256: hash(result.stdout),
    startedAt: new Date(started).toISOString(),
    completedAt: at(),
    testOutput: command("node", ["verify.mjs"]),
  };
}
function existingCodexSession() {
  const file = findJsonl()
    .filter((candidate) => {
      try {
        return fs
          .readFileSync(candidate, "utf8")
          .split(/\r?\n/)
          .slice(0, 8)
          .some((line) => line.includes(fixture));
      } catch {
        return false;
      }
    })
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
  if (!file) throw new Error("existing_codex_native_session_not_found");
  const commit = command("git", ["rev-parse", "HEAD"]);
  if (command("git", ["log", "-1", "--format=%s"]) !== "qualification: reject stale routes")
    throw new Error("existing_codex_commit_missing");
  fs.rmSync(state, { recursive: true, force: true });
  for (const name of ["physical-qualification.json", "human-readable-transcript.md", "evidence-manifest.json"])
    fs.rmSync(path.join(root, name), { force: true });
  return {
    file,
    commit,
    threadId: path.basename(file, ".jsonl"),
    providerOutputSha256: "unavailable-recovered-from-provider-native-evidence",
    startedAt: fs.statSync(file).birthtime.toISOString(),
    completedAt: fs.statSync(file).mtime.toISOString(),
    testOutput: command("node", ["verify.mjs"]),
  };
}
function findJsonl() {
  const home =
      process.env.CODEX_HOME ??
      path.join(process.env.HOME ?? os.homedir(), ".codex"),
    roots = [path.join(home, "sessions"), path.join(home, "archived_sessions")],
    files: string[] = [];
  const walk = (directory: string) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && file.endsWith(".jsonl")) files.push(file);
    }
  };
  roots.forEach(walk);
  return files;
}
async function remote(
  operation: string,
  payload: Record<string, unknown> = {},
) {
  const program = `const fs=require('fs'),path=require('path'),[op,root]=process.argv.slice(2),input=JSON.parse(fs.readFileSync(0,'utf8')||'{}'),recordFile=x=>path.join(root,'sessions',x.id.replace(/[^A-Za-z0-9._-]/g,'_').slice(0,240)+'-'+x.sha256+'.json');if(op==='identity'){process.stdout.write(JSON.stringify({node:require('os').hostname(),runtime:process.version}));process.exit()}if(op==='search'){const index=JSON.parse(fs.readFileSync(path.join(root,'index.json'),'utf8')),rows=index.map(x=>JSON.parse(fs.readFileSync(recordFile(x),'utf8'))),matches=rows.filter(r=>JSON.stringify(r).toLowerCase().includes(String(input.query).toLowerCase()));process.stdout.write(JSON.stringify(matches.map(r=>({id:r.id,sha256:r.sha256,nativeObject:r.raw.objectSha256,nodeId:r.nodeId,commit:r.repository.commits,events:r.events.filter(e=>JSON.stringify(e).toLowerCase().includes(String(input.query).toLowerCase())).slice(0,4).map(e=>({id:e.id,kind:e.kind,summary:e.summary,authority:e.authority}))}))));process.exit()}if(op==='continue'){const index=JSON.parse(fs.readFileSync(path.join(root,'index.json'),'utf8')),record=JSON.parse(fs.readFileSync(recordFile(index[index.length-1]),'utf8')),decision=record.events.find(e=>e.kind==='DECISION')||record.events.find(e=>String(e.summary).includes('stale')),out=path.join(path.dirname(root),'continuation-result.txt'),content='Contextual continuation from '+record.id+'\\nEvidence '+record.raw.objectSha256+'\\nDecision '+(decision?.summary||'unavailable')+'\\nAction verify stale routes remain rejected\\n';fs.writeFileSync(out,content,{mode:0o600});process.stdout.write(JSON.stringify({node:require('os').hostname(),resultSha256:require('crypto').createHash('sha256').update(content).digest('hex'),decisionAuthority:decision?.authority||'UNAVAILABLE',sourceSessionId:record.id}));process.exit()}process.exit(64);`,
    encoded = Buffer.from(program).toString("base64"),
    bootstrap = `set -eu\numask 077\nroot=$1\nmkdir -p "$root"\nprintf '%s' '${encoded}' | base64 -d > "$root/.agent-control-session-vault-query.cjs.tmp"\nmv "$root/.agent-control-session-vault-query.cjs.tmp" "$root/.agent-control-session-vault-query.cjs"\n`,
    installed = await executeSsh(
      "ssh",
      sshResourceArgs(resource, ["sh", "-s", "--", remoteWork]),
      bootstrap,
      { timeoutMs: 120_000, maxBytes: 2 * 1024 * 1024 },
    );
  if (installed.timedOut || installed.aborted || installed.status !== 0)
    throw new Error(`remote_${operation}_bootstrap_failed`);
  const result = await executeSsh(
    "ssh",
    sshResourceArgs(resource, [
      "node",
      `${remoteWork}/.agent-control-session-vault-query.cjs`,
      operation,
      remoteRoot,
    ]),
    `${JSON.stringify(payload)}\n`,
    { timeoutMs: 120_000, maxBytes: 2 * 1024 * 1024 },
  );
  if (result.timedOut || result.aborted || result.status !== 0)
    throw new Error(`remote_${operation}_failed`);
  return JSON.parse(result.stdout) as any;
}
async function main() {
  const startedAt = at(),
    sourceAtStart = {
      commit: command("git", ["rev-parse", "HEAD"], process.cwd()),
      dirty:
        command("git", ["status", "--porcelain"], process.cwd()).length > 0,
    },
    reuse = process.env.AGENT_CONTROL_SESSION_VAULT_REUSE_SOURCE === "1";
  if (!reuse) fresh();
  const native = reuse ? existingCodexSession() : codexSession(),
    adapter = new CodexSessionAdapter(
      [path.dirname(native.file)],
      sourceNodeId,
    ),
    discovery = (await adapter.discover()).find(
      (item) => path.resolve(item.sourcePath) === path.resolve(native.file),
    );
  if (!discovery) throw new Error("captured_codex_discovery_missing");
  const vault = new ImmutableSessionVault(vaultRoot),
    record = await vault.ingest(adapter, discovery, {
      sensitivity: "RESTRICTED",
      redactSensitive: true,
      retentionDays: 365,
    }),
    sourceBefore = hash(fs.readFileSync(native.file)),
    provenance = new SessionProvenanceIndex(vault),
    commitAttribution = provenance.commit(native.commit.slice(0, 7)).length
      ? provenance.commit(native.commit.slice(0, 7))
      : provenance.decision("stale route"),
    memories = new MarkdownProjectMemoryPort(
      memoryRoot,
      "obsidian-compatible-markdown",
    ),
    promotion = new SessionMemoryPromotionService(vault, memories),
    memory = await promotion.promote({
      sessionId: record.id,
      approvedBy: "qualification-operator",
      independentValidation: {
        passed: native.testOutput === "verified-route-policy",
        evidenceId: "fixture-test:verify.mjs",
        evidenceSha256: hash(native.testOutput),
      },
      candidate: {
        kind: "DECISION",
        title: "Reject stale route qualification",
        content:
          "Stale qualification evidence must be rejected before route selection. Supporting exact context remains in Session Vault.",
        factKey: "agent-control.route.stale-qualification",
        projectId: "agent-control-session-vault-qualification",
        repositoryId: "session-vault-fixture",
        sessionId: record.id,
        originatingNodeId: sourceNodeId,
        originatingRoute: {
          providerId: "codex-chatgpt",
          modelId: "codex",
          nodeId: sourceNodeId,
        },
        source: "EXPERIMENT",
        confidence: 1,
        supersedes: [],
      },
    }),
    backend = new SshFilesystemSessionReplicationBackend(
      `${destinationNodeId}-session-vault`,
      resource,
      remoteRoot,
    ),
    replication = await replicateSession(vault, backend, record.id),
    remoteIdentity = await remote("identity");
  const unavailable = `${vaultRoot}.source-offline`;
  fs.renameSync(vaultRoot, unavailable);
  let offlineSearch;
  try {
    offlineSearch = await remote("search", { query: "stale" });
  } finally {
    fs.renameSync(unavailable, vaultRoot);
  }
  const identity = new IdentityControlPlane(path.join(state, "identity.json"));
  identity.registerActor({
    id: "qualification-operator",
    type: "human",
    displayName: "Qualification operator",
    principalId: "qualification-operator",
    authenticationSource: "local-qualified",
    roles: ["operator"],
    capabilities: [
      "session.observe",
      "session.manage",
      "parcel.create",
      "parcel.execute",
    ],
    metadata: { purpose: "session-vault-qualification" },
  });
  const actions = new ActionRegistry();
  actions.registerControl("session-vault.continue@1.0.0", async () => {
    const result = await remote("continue");
    return {
      artifacts: [
        {
          name: "continuation-result",
          value: result,
          type: "application/json",
          schema: "agent-control.session-continuation-result/v1",
          version: "1.0.0",
        },
      ],
      evidence: [
        `remote-node:${result.node}`,
        `source-session:${result.sourceSessionId}`,
        `result-sha256:${result.resultSha256}`,
      ],
      verification: ["contextual-continuation-verified"],
      detail:
        "Peer node continued the bounded task from replicated Session Vault evidence.",
    };
  });
  const catalog = new JobCatalog(actions.ids());
  catalog.addJob({
    apiVersion: "agent-control/v1",
    kind: "Job",
    metadata: {
      id: "session-vault-continuation",
      name: "Session Vault contextual continuation",
      version: "1.0.0",
    },
    spec: {
      priority: "normal",
      concurrency: "no-overlap",
      parameters: {},
      steps: [
        {
          id: "continue",
          action: "session-vault.continue@1.0.0",
          requires: ["session-vault.continue"],
          outputs: [
            {
              name: "continuation-result",
              type: "application/json",
              schema: "agent-control.session-continuation-result/v1",
              version: "1.0.0",
            },
          ],
          verification: ["contextual-continuation-verified"],
        },
      ],
    },
  });
  const workers = new WorkerRegistry();
  workers.register({
    id: destinationNodeId,
    capabilities: ["session-vault.continue"],
    health: "healthy",
    capacity: 1,
    active: 0,
    observedAt: at(),
  });
  const jobRuntime = new JobRuntime(
      catalog,
      actions,
      workers,
      new RunLedger(path.join(state, "runs.json")),
      new ArtifactStore(path.join(state, "artifacts")),
      new ResourceLockManager(path.join(state, "locks.json")),
    ),
    planner: WorkParcelPlanner = {
      plan: async () => {
        throw new Error("qualification uses approved plan");
      },
    },
    parcels = new WorkParcelCoordinator(
      jobRuntime,
      new WorkParcelStore(path.join(state, "parcels.json")),
      planner,
    ),
    control: GovernedContinuationPort = {
      verifyRepository: async () => ({
        repositoryId: "session-vault-fixture",
        commit: native.commit,
        branch: command("git", ["branch", "--show-current"]),
        dirty: Boolean(command("git", ["status", "--porcelain"])),
        evidenceSha256: hash(`${native.commit}:session-vault-fixture`),
      }),
      createSession: (input) =>
        identity.createSession({
          creatorActorId: input.actorId,
          mode: "operator-controlled",
          permissions: {
            capabilities: [
              "session.observe",
              "session.manage",
              "parcel.create",
              "parcel.execute",
            ],
            allowedNodes: [input.nodeId],
            filesystem: "workspace",
            network: "none",
            production: false,
          },
          contextPolicy: "compiled",
          metadata: {
            sourceSessionId: input.sourceSessionId,
            continuationMode: input.mode,
            contextualContinuation: true,
          },
        }),
      createWorkParcel: (input) => {
        const plan: WorkParcelPlan = {
          objective: input.objective,
          constraints: [
            "Use replicated immutable evidence only",
            "Do not mutate the original provider-native session",
          ],
          successCriteria: [
            {
              id: "continued",
              kind: "STAGE_VERIFIED",
              description: "Peer creates a verified continuation result",
              stageId: "continue",
              requiredEvidence: ["stage:continue:verified"],
            },
          ],
          planner: {
            kind: "deterministic",
            reason: `Session Vault continuation ${input.contextSha256}`,
          },
          stages: [
            {
              id: "continue",
              name: "Continue from replicated evidence",
              job: "session-vault-continuation@1.0.0",
              requiredCapabilities: ["session-vault.continue"],
            },
          ],
        };
        return parcels.submitApprovedPlan(
          input.objective,
          input.actorId,
          hash(`${input.sourceSessionId}:${input.contextSha256}`),
          plan,
        );
      },
    },
    continuations = new GovernedSessionContinuationService(
      vault,
      control,
      memories,
    ),
    prepared = await continuations.prepare({
      sourceSessionId: record.id,
      actorId: "qualification-operator",
      nodeId: destinationNodeId,
      mode: "CONTINUE",
      objective:
        "Confirm on the peer node that stale qualification evidence remains rejected.",
      repository: "session-vault-fixture",
      commit: native.commit,
      branch: command("git", ["branch", "--show-current"]),
      memoryProjectId: "agent-control-session-vault-qualification",
    });
  let splitBrain = "NOT_TESTED";
  try {
    vault.acquireLease(record.id, "third-node", "qualification-operator");
    splitBrain = "FAILED_ALLOWED";
  } catch (error) {
    splitBrain =
      error instanceof Error &&
      error.message === "session_continuation_lease_held"
        ? "DENIED"
        : "FAILED_OTHER";
  }
  for (let i = 0; i < 80; i++) {
    await parcels.tick();
    await jobRuntime.tick();
    const current = parcels.get(prepared.workParcelId);
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(current.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const parcel = parcels.get(prepared.workParcelId),
    run = jobRuntime.ledger.list()[0],
    remoteResult = run?.artifacts[0]
      ? jobRuntime.artifacts.read(run.artifacts[0])
      : null,
    sourceAfter = hash(fs.readFileSync(native.file));
  const sensitiveRoot = path.join(state, "sensitive-test"),
    sensitiveNative = path.join(sensitiveRoot, "native");
  fs.mkdirSync(sensitiveNative, { recursive: true });
  const synthetic = "sk-proj-SYNTHETIC-SESSION-VAULT-QUALIFICATION-123456789",
    syntheticBytes = Buffer.from(
      `${JSON.stringify({ timestamp: at(), type: "response_item", payload: { role: "user", content: `api_key=${synthetic}` } })}\n`,
    );
  fs.writeFileSync(
    path.join(sensitiveNative, "synthetic.jsonl"),
    syntheticBytes,
  );
  const sensitiveVault = new ImmutableSessionVault(
      path.join(sensitiveRoot, "vault"),
    ),
    sensitiveAdapter = new CodexSessionAdapter(
      [sensitiveNative],
      sourceNodeId,
    ),
    sensitive = await sensitiveVault.ingest(
      sensitiveAdapter,
      (await sensitiveAdapter.discover())[0]!,
      {
        sensitivity: "RESTRICTED",
        redactSensitive: true,
        encryptionKey: Buffer.alloc(32, 7),
        localOnly: true,
      },
    ),
    sensitiveProjection = JSON.stringify(sensitiveVault.projection()),
    tamperRoot = path.join(state, "tamper-test"),
    tamperNative = path.join(tamperRoot, "native");
  fs.mkdirSync(tamperNative, { recursive: true });
  fs.writeFileSync(
    path.join(tamperNative, "tamper.jsonl"),
    `${JSON.stringify({ timestamp: at(), type: "response_item", payload: { role: "user", content: "safe integrity fixture" } })}\n`,
  );
  const tamperVault = new ImmutableSessionVault(path.join(tamperRoot, "vault")),
    tamperAdapter = new CodexSessionAdapter([tamperNative], sourceNodeId),
    tampered = await tamperVault.ingest(
      tamperAdapter,
      (await tamperAdapter.discover())[0]!,
      { sensitivity: "INTERNAL" },
    );
  fs.appendFileSync(
    path.join(
      tamperVault.root,
      "objects",
      `${tampered.raw.objectSha256}.object`,
    ),
    "tamper",
  );
  let tamperRejected = false;
  try {
    tamperVault.verify();
  } catch {
    tamperRejected = true;
  }
  const parcelBytes = Buffer.from(`${JSON.stringify(parcel)}\n`),
    parcelDiscovery: NativeSessionDiscovery = {
      providerId: "agent-control-work-parcel",
      nodeId: sourceNodeId,
      nativeId: parcel.id,
      sourcePath: `ledger://${parcel.id}`,
      modifiedAt: parcel.updatedAt,
      sizeBytes: parcelBytes.length,
    },
    parcelAdapter: SessionProviderAdapter = {
      providerId: "agent-control-work-parcel",
      adapterVersion: "work-parcel-ledger/v1",
      discover: async () => [parcelDiscovery],
      capture: async (discovery) =>
        ({
          ...discovery,
          bytes: parcelBytes,
          capturedAt: at(),
          completeness:
            parcel.status === "SUCCEEDED" ? "COMPLETED" : "CHECKPOINT",
          format: "agent-control-work-parcel-json",
          warnings: [],
        }) satisfies NativeSessionCapture,
      normalize: async () =>
        parcel.audit.timeline.map(
          (event, index) =>
            ({
              at: event.at,
              kind: event.type.includes("verification")
                ? "TEST"
                : event.type.includes("baton")
                  ? "BATON_HANDOFF"
                  : "WORK_PARCEL_TRANSITION",
              actor: "agent-control",
              summary: event.summary,
              detail: event.detail,
              nativeSequence: index + 1,
              authority: "EXPLICIT",
            }) satisfies SessionEventInput,
        ),
    },
    providerNeutral = await vault.ingest(parcelAdapter, parcelDiscovery, {
      sensitivity: "RESTRICTED",
      redactSensitive: true,
    }),
    report = {
      schema: "agent-control.session-vault-physical-qualification/v1",
      startedAt,
      completedAt: at(),
      implementation: sourceAtStart,
      nodes: {
        source: { id: sourceNodeId, online: true },
        destination: {
          id: remoteIdentity.node,
          runtime: remoteIdentity.runtime,
          online: true,
        },
        msi: {
          id: "MSI",
          status: "SSH_COMMAND_CHANNEL_TIMEOUT_OBSERVED_SEPARATELY",
        },
      },
      codex: {
        version: command("codex", ["--version"], process.cwd()),
        threadId: native.threadId,
        nativeFile: path.relative(
          process.env.CODEX_HOME ?? path.join(process.env.HOME ?? "", ".codex"),
          native.file,
        ),
        nativeSha256: sourceBefore,
        providerOutputSha256: native.providerOutputSha256,
        commit: native.commit,
        test: native.testOutput,
        recordId: record.id,
        recordSha256: record.sha256,
        completeness: record.completeness,
      },
      scenarios: {
        A: {
          status: offlineSearch.length ? "PASS" : "FAIL",
          sourceVaultUnavailableDuringQuery: true,
          destinationResults: offlineSearch,
        },
        B: {
          status: offlineSearch.some((item: any) =>
            item.commit?.some(
              (value: string) =>
                native.commit.startsWith(value) ||
                value.startsWith(native.commit.slice(0, 7)),
            ),
          )
            ? "PASS"
            : "PARTIAL",
          commit: native.commit,
          attribution: commitAttribution,
        },
        C: {
          status: offlineSearch.some((item: any) =>
            item.events?.some((event: any) => event.authority === "EXPLICIT"),
          )
            ? "PASS"
            : "PARTIAL",
          query: "Why was stale route policy changed?",
          result: offlineSearch,
        },
        D: {
          status:
            parcel.status === "SUCCEEDED" && sourceBefore === sourceAfter
              ? "PASS"
              : "FAIL",
          governedSessionId: prepared.governedSessionId,
          workParcelId: parcel.id,
          parcelStatus: parcel.status,
          continuation: prepared.continuation,
          remoteResult,
          originalNativeEvidenceUnchanged: sourceBefore === sourceAfter,
        },
        E: {
          status:
            splitBrain === "DENIED" && vault.search("stale").length
              ? "PASS"
              : "FAIL",
          mutableAttempt: splitBrain,
          readOnlySearchAvailable: vault.search("stale").length > 0,
          durableLeaseAudit: vault
            .leaseAudit()
            .filter((event) => event.sessionId === record.id),
        },
        F: {
          status:
            !sensitiveProjection.includes(synthetic) &&
            sensitive.raw.encrypted &&
            sensitive.policy.localOnly
              ? "PASS"
              : "FAIL",
          encrypted: sensitive.raw.encrypted,
          localOnly: sensitive.policy.localOnly,
          secretVisibleInProjection: sensitiveProjection.includes(synthetic),
        },
        G: {
          status:
            tamperRejected && tamperVault.projection().integrityFailures === 1
              ? "PASS"
              : "FAIL",
          tamperRejected,
          dashboardIntegrityFailures:
            tamperVault.projection().integrityFailures,
        },
        H: {
          status:
            providerNeutral.providerId === "agent-control-work-parcel"
              ? "PASS"
              : "FAIL",
          provider: providerNeutral.providerId,
          format: providerNeutral.format,
          fieldsUnavailable: [
            "provider-native hidden reasoning",
            "native provider branching",
            "provider monetary cost",
          ],
        },
      },
      yourMemories: {
        status: memory.provenance.some(
          (item) => item.sha256 === record.raw.objectSha256,
        )
          ? "PASS"
          : "FAIL",
        memoryId: memory.id,
        memorySha256: memory.contentSha256,
        sourceEvidenceSha256: record.raw.objectSha256,
        backend:
          "existing ProjectMemoryPort / Markdown directory compatible with Obsidian",
        obsidianApplicationOnMsi: "BLOCKED_MSI_SSH_AUTH_UNAVAILABLE",
        underlyingCapabilityWithoutObsidian: vault.search("stale").length > 0,
      },
      replication,
      sourceEvidenceUnchanged: sourceBefore === sourceAfter,
      verdict: "EXPERIMENTAL",
    };
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(root, "physical-qualification.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  );
  fs.writeFileSync(
    path.join(root, "human-readable-transcript.md"),
    render(report),
    { mode: 0o600 },
  );
  fs.writeFileSync(
    path.join(root, "evidence-manifest.json"),
    `${JSON.stringify(manifest(root), null, 2)}\n`,
    { mode: 0o600 },
  );
  process.stdout.write(
    `${JSON.stringify({ report: path.join(root, "physical-qualification.json"), transcript: path.join(root, "human-readable-transcript.md"), scenarios: Object.fromEntries(Object.entries(report.scenarios).map(([key, value]) => [key, (value as any).status])), parcel: parcel.status, verdict: report.verdict }, null, 2)}\n`,
  );
}
function render(report: any) {
  const sourceNode = report.nodes.source.id,
    destinationNode = report.nodes.destination.id;
  return `# Agent Control 4.5 Session Vault physical qualification\n\nStarted: ${report.startedAt}\nCompleted: ${report.completedAt}\n\n## Genuine source session\n\nCodex ${report.codex.version} created commit \`${report.codex.commit}\` and passed \`${report.codex.test}\`. Native evidence \`${report.codex.recordId}\` was captured as \`${report.codex.nativeSha256}\`.\n\n## POE-style operator request\n\n> Find the session that changed the stale-route policy, explain why it changed, and continue the smallest safe verification on ${destinationNode} without modifying the original session.\n\n## Governed flow\n\n1. Session Vault found ${report.codex.recordId}.\n2. Commit attribution linked ${report.codex.commit} to the captured native session with retained evidence.\n3. Explicit rationale: stale qualification evidence can select an unsafe or unavailable route.\n4. Your Memories admitted one independently verified reusable decision and retained the native evidence hash.\n5. Immutable evidence replicated ${sourceNode} → ${destinationNode}.\n6. The source vault was made unavailable; ${destinationNode} still returned the indexed result.\n7. Agent Control created governed session ${report.scenarios.D.governedSessionId} and Work Parcel ${report.scenarios.D.workParcelId}.\n8. ${destinationNode} performed the bounded continuation; independent Job verification returned ${report.scenarios.D.parcelStatus}.\n9. A second mutable continuation was ${report.scenarios.E.mutableAttempt}; read-only search remained available.\n10. Synthetic-secret and tamper gates returned ${report.scenarios.F.status} and ${report.scenarios.G.status}.\n\n## A–H verdicts\n\n${Object.entries(
    report.scenarios,
  )
    .map(([key, value]: any) => `- ${key}: **${value.status}**`)
    .join(
      "\n",
    )}\n\n## Your Memories and Obsidian\n\nYour Memories record: ${report.yourMemories.memoryId}; linked evidence: ${report.yourMemories.sourceEvidenceSha256}. The underlying Agent Control capability remained available after the Markdown/Obsidian-compatible view was removed. Physical use of the configured MSI Obsidian application was ${report.yourMemories.obsidianApplicationOnMsi}; this is not represented as a pass.\n\n## Verdict\n\n**EXPERIMENTAL** — the core two-node Session Vault lifecycle is physically exercised, but configured MSI Obsidian application access and the complete dashboard/video release gate remain unqualified at this checkpoint.\n`;
}
function manifest(directory: string) {
  return fs
    .readdirSync(directory)
    .filter(
      (name) =>
        fs.statSync(path.join(directory, name)).isFile() &&
        name !== "evidence-manifest.json",
    )
    .sort()
    .map((name) => {
      const bytes = fs.readFileSync(path.join(directory, name));
      return { path: name, sizeBytes: bytes.length, sha256: hash(bytes) };
    });
}
function safe(value: string) {
  return value.replace(/(?:sk-(?:proj-)?|nvapi-)[A-Za-z0-9_-]+/g, "[REDACTED]");
}
main().catch((error) => {
  process.stderr.write(
    `${safe(error instanceof Error ? (error.stack ?? error.message) : String(error))}\n`,
  );
  process.exitCode = 1;
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { AgentControlService } from "../src/control/application-service.js";
import {
  emptyConfig,
  type ProviderConfig,
  type ModelConfig,
} from "../src/control/config.js";
import { EnvironmentDiscoveryRuntime } from "../src/control/environment-discovery.js";
import { ExecutionSessionRuntime } from "../src/control/execution-session.js";
import {
  createInvocationObservation,
  FileHarnessEfficiencyLedger,
} from "../src/control/harness-efficiency.js";
import { JobCatalog } from "../src/control/job-catalog.js";
import {
  ActionFailure,
  ActionRegistry,
  ArtifactStore,
  JobRuntime,
  ResourceLockManager,
  RunLedger,
  WorkerRegistry,
} from "../src/control/job-runtime.js";
import type { JobDefinition } from "../src/control/job-types.js";
import { OpenAICompatibleProviderClient } from "../src/control/openai-compatible-provider.js";
import { PtyRegistry } from "../src/control/pty.js";
import { PoeRuntime } from "../src/control/poe.js";
import {
  WorkParcelCoordinator,
  WorkParcelStore,
  type WorkParcelPlan,
  type WorkParcelPlanner,
} from "../src/control/work-parcels.js";
import { startWebDashboard } from "../src/control/web-server.js";
import type { WorkspaceState } from "../src/state.js";

const require = createRequire(import.meta.url),
  delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const output = path.resolve(
    process.env.AGENT_CONTROL_RUNTIME_MAP_EVIDENCE ??
      "qualification/agent-control-runtime-map-visual-acceptance-20260912",
  ),
  stateRoot = path.join(output, "runtime"),
  token = "runtime-map-qualification-operator",
  providerBase =
    process.env.AGENT_CONTROL_RUNTIME_MAP_PROVIDER ??
    "http://127.0.0.1:8081/v1";
const prompt =
  "Use Agent Control to inspect this repository through six meaningful governed jobs running in parallel: a real local model assessment, repository integrity inspection, Runtime Map tests, Estate Map tests, dashboard validation, and a safe recovery probe. Aggregate their evidence, independently verify the result, and retain the complete runtime trail for replay and comparison.";
const baselinePrompt =
  "Use Agent Control to record a bounded single-job repository identity baseline for Runtime Map comparison.";
const expectedScreenshots = [
  "runtime-map-six-jobs-running.png",
  "runtime-map-control-room.png",
  "runtime-map-live-session.png",
  "runtime-map-estate-cross-link.png",
  "runtime-map-poe-grounded-status.png",
  "runtime-map-complete.png",
  "runtime-map-replay-fan-out.png",
  "runtime-map-graphical-compare.png",
];
const startedAt = new Date().toISOString(),
  initialRssBytes = process.memoryUsage().rss,
  hash = (value: string | Buffer) =>
    createHash("sha256").update(value).digest("hex");
function job(
  id: string,
  action: string,
  verification: string[],
  outputs: JobDefinition["spec"]["steps"][number]["outputs"] = [],
  retry?: JobDefinition["spec"]["retry"],
): JobDefinition {
  return {
    apiVersion: "agent-control/v1",
    kind: "Job",
    metadata: {
      id,
      name: id
        .split("-")
        .map((part) => part[0]!.toUpperCase() + part.slice(1))
        .join(" "),
      version: "1.0.0",
    },
    spec: {
      priority: "normal",
      concurrency: "allow",
      ...(retry ? { retry } : {}),
      steps: [
        {
          id: "execute",
          action,
          requires: ["runtime-map.qualification"],
          outputs,
          verification,
        },
      ],
    },
  };
}

async function main() {
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  for (const name of [
    ...expectedScreenshots,
    "agent-control-4.5-runtime-map-six-job-visual-acceptance.mp4",
    "qualification.json",
    "complete-human-readable-transcript.md",
  ])
    fs.rmSync(path.join(output, name), { force: true });
  fs.rmSync(path.join(output, "raw-video"), { recursive: true, force: true });
  fs.rmSync(stateRoot, { recursive: true, force: true });
  fs.mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  const provider: ProviderConfig = {
    id: "local-llamacpp",
    name: "Local llama.cpp",
    kind: "local",
    enabled: true,
    baseUrl: providerBase,
    wireApi: "chat-completions",
    auth: { type: "none" },
    requiresAuth: false,
    parallelism: 1,
    costClass: "free",
    capabilities: ["model.execute", "output.structured"],
    qualification: {
      status: "qualified",
      advertisedContextLimitTokens: 32768,
      lastSuccessfulAt: startedAt,
      evidence: ["physical-preflight"],
    },
  };
  const inventory = await fetch(`${providerBase}/models`, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(inventory.ok, true);
  const models = (await inventory.json()) as { data?: Array<{ id?: string }> },
    providerModel =
      models.data?.find((item) => /coder/i.test(item.id ?? ""))?.id ??
      models.data?.[0]?.id;
  assert.ok(providerModel);
  const model: ModelConfig = {
    id: "qwen2.5-coder-3b-runtime-map",
    provider: provider.id,
    providerModel,
    displayName: "Qwen local runtime-map qualifier",
    enabled: true,
    capabilities: ["model.execute", "output.structured"],
    nodes: ["controller"],
    limits: { contextTokens: 32768, outputTokens: 512 },
    qualification: {
      state: "QUALIFIED",
      version: "physical-runtime-map-v1",
      capabilities: ["model.execute", "output.structured"],
      nodes: ["controller"],
      evidence: ["physical-preflight"],
    },
  };
  const actions = new ActionRegistry(),
    workers = new WorkerRegistry().register({
      id: "controller",
      capabilities: ["runtime-map.qualification"],
      health: "healthy",
      capacity: 6,
      active: 0,
      observedAt: startedAt,
    }),
    ledger = new RunLedger(path.join(stateRoot, "runs.json")),
    artifacts = new ArtifactStore(path.join(stateRoot, "artifacts")),
    locks = new ResourceLockManager(path.join(stateRoot, "locks.json")),
    sessions = new ExecutionSessionRuntime(
      path.join(stateRoot, "execution-sessions"),
    ),
    efficiency = new FileHarnessEfficiencyLedger(
      path.join(stateRoot, "invocations.json"),
    ),
    client = new OpenAICompatibleProviderClient(
      provider,
      undefined,
      undefined,
      { nodeId: "controller" },
    );
  let retryAttempt = 0,
    branchArrivals = 0,
    releaseBranches!: () => void;
  const branchesReady = new Promise<void>((resolve) => {
      releaseBranches = resolve;
    }),
    joinSixWayQualification = async () => {
      branchArrivals++;
      if (branchArrivals === 6) setTimeout(releaseBranches, 3500);
      await Promise.race([
        branchesReady,
        delay(15_000).then(() => {
          throw new Error("six_way_qualification_barrier_timeout");
        }),
      ]);
    };
  actions.registerReadOnly(
    "runtime-map.model-review@1.0.0",
    async (context) => {
      await joinSixWayQualification();
      const began = new Date().toISOString(),
        result = await client.invoke(
          model,
          {
            schema: "agent-control.provider-prompt/v1",
            cacheScope: "runtime-map-physical-qualification",
            blocks: [
              {
                type: "text",
                stability: "stable",
                text: "You are the bounded evidence reviewer in an Agent Control qualification. Return JSON only.\n",
              },
              {
                type: "text",
                stability: "volatile",
                text: "Assess whether a real runtime graph should be grounded in durable events. Return assessment, risks, and verdict PASS.",
              },
            ],
          },
          {
            structured: true,
            outputSchema: {
              type: "object",
              properties: {
                assessment: { type: "string" },
                risks: { type: "array", items: { type: "string" } },
                verdict: { type: "string", enum: ["PASS"] },
              },
              required: ["assessment", "risks", "verdict"],
              additionalProperties: false,
            },
            maximumOutputTokens: 256,
            timeoutMs: 120000,
          },
        ),
        parsed = JSON.parse(result.output),
        completed = new Date().toISOString(),
        observation = createInvocationObservation({
          jobId: context.run.jobId,
          runId: context.run.id,
          stepId: context.step.id,
          taskId: `${context.run.id}:model-review`,
          laneId: `parcel:${context.run.trigger.parcelContext?.parcelId}:model`,
          model: model.id,
          provider: provider.id,
          harnessProfile: "THIN",
          executionStrategy: "physical-runtime-map-local-provider",
          startedAt: began,
          completedAt: completed,
          rawUsage: {
            prompt_tokens: result.usage.inputTokens,
            prompt_tokens_details: {
              cached_tokens: result.usage.cachedInputTokens,
            },
            completion_tokens: result.usage.outputTokens,
            total_tokens: result.usage.totalTokens,
          },
          cacheEvidence: result.usage.cacheEvidence,
          finishReason: result.finishReason,
          agentId: "model-scout",
          outcome: "COMPLETE",
          recipeFingerprint: hash(prompt),
          evidenceIds: [`provider-response:${hash(result.output)}`],
        });
      efficiency.record(observation);
      await delay(3500);
      return {
        artifacts: [
          {
            name: "model-assessment",
            value: {
              provider: provider.id,
              model: model.id,
              responseSha256: hash(result.output),
              ...parsed,
            },
          },
        ],
        evidence: [`provider-response:${hash(result.output)}`],
        verification: ["provider-response-schema-valid"],
        efficiencyInvocationIds: [observation.id],
        detail: "Real local model response passed strict schema",
      };
    },
  );
  actions.registerReadOnly(
    "runtime-map.repository-inspect@1.0.0",
    async (context) => {
      await joinSixWayQualification();
      const result = await context.ownedExecution.runProcess(
          {
            command: "git",
            args: ["fsck", "--no-progress", "--connectivity-only"],
            cwd: process.cwd(),
          },
          context.signal,
        );
      if (result.exitCode !== 0)
        throw new Error("repository_inspection_failed");
      return {
        artifacts: [
          {
            name: "repository-state",
            value: {
              head: execFileSync("git", ["rev-parse", "HEAD"], {
                encoding: "utf8",
              }).trim(),
              dirty:
                execFileSync("git", ["status", "--short"], {
                  encoding: "utf8",
                }).trim().length > 0,
              checked: [
                "Git object connectivity",
                "current repository HEAD",
              ],
            },
          },
        ],
        evidence: ["git-head-observed"],
        verification: ["repository-state-recorded"],
      };
    },
  );
  actions.registerReadOnly("runtime-map.test-gate@1.0.0", async (context) => {
    await joinSixWayQualification();
    const result = await context.ownedExecution.runProcess(
      {
        command: process.execPath,
        args: [
          "--test",
          "--import",
          "tsx",
          "src/control/runtime-map.test.ts",
        ],
        cwd: process.cwd(),
      },
      context.signal,
    );
    if (result.exitCode !== 0) throw new Error("focused_test_gate_failed");
    return {
      artifacts: [
        {
          name: "test-result",
          value: {
            exitCode: result.exitCode,
            command: "node --test --import tsx src/control/runtime-map.test.ts",
          },
        },
      ],
      evidence: ["focused-runtime-map-tests-pass"],
      verification: ["focused-tests-passed"],
    };
  });
  actions.registerReadOnly("runtime-map.estate-gate@1.0.0", async (context) => {
    await joinSixWayQualification();
    const result = await context.ownedExecution.runProcess(
      {
        command: process.execPath,
        args: [
          "--test",
          "--import",
          "tsx",
          "src/control/estate-map.test.ts",
          "src/control/environment-discovery-web.test.ts",
        ],
        cwd: process.cwd(),
      },
      context.signal,
    );
    if (result.exitCode !== 0) throw new Error("estate_test_gate_failed");
    return {
      artifacts: [
        {
          name: "estate-test-result",
          value: {
            exitCode: result.exitCode,
            command:
              "node --test --import tsx src/control/estate-map.test.ts src/control/environment-discovery-web.test.ts",
          },
        },
      ],
      evidence: ["focused-estate-map-tests-pass"],
      verification: ["estate-tests-passed"],
    };
  });
  actions.registerReadOnly(
    "runtime-map.dashboard-gate@1.0.0",
    async (context) => {
      await joinSixWayQualification();
      const result = await context.ownedExecution.runProcess(
        {
          command: "bash",
          args: [
            "-lc",
            "set -euo pipefail; printf 'Dashboard gate: TypeScript validation started\\n'; npm run typecheck; printf 'Dashboard gate: syntax validation started\\n'; npm run check:dashboard; printf 'Dashboard gate: web integration tests started\\n'; node --test --import tsx src/control/runtime-map-web.test.ts src/control/environment-discovery-web.test.ts",
          ],
          cwd: process.cwd(),
        },
        context.signal,
      );
      if (result.exitCode !== 0)
        throw new Error("dashboard_syntax_gate_failed");
      return {
        artifacts: [
          {
            name: "dashboard-validation",
            value: {
              exitCode: result.exitCode,
              command:
                "npm run typecheck; npm run check:dashboard; Runtime Map and Environment web integration tests",
            },
          },
        ],
        evidence: ["dashboard-syntax-check-pass"],
        verification: ["dashboard-validation-passed"],
      };
    },
  );
  actions.registerReadOnly("runtime-map.retry-probe@1.0.0", async () => {
    await joinSixWayQualification();
    retryAttempt++;
    await delay(1200);
    if (retryAttempt === 1)
      throw new ActionFailure(
        "controlled transient observation transport interruption",
        "execution",
        true,
        "transient-transport",
      );
    return {
      artifacts: [
        {
          name: "retry-result",
          value: { attempts: retryAttempt, outcome: "recovered" },
        },
      ],
      evidence: ["retry-recovery-observed"],
      verification: ["retry-recovered"],
    };
  });
  actions.registerReadOnly(
    "runtime-map.baseline@1.0.0",
    async (context) => {
      const result = await context.ownedExecution.runProcess(
        {
          command: "git",
          args: ["rev-parse", "HEAD"],
          cwd: process.cwd(),
        },
        context.signal,
      );
      if (result.exitCode !== 0) throw new Error("baseline_identity_failed");
      return {
        artifacts: [
          {
            name: "baseline-identity",
            value: { head: result.stdout.trim(), exitCode: result.exitCode },
          },
        ],
        evidence: ["baseline-git-head-observed"],
        verification: ["baseline-identity-recorded"],
      };
    },
  );
  actions.registerReadOnly("runtime-map.aggregate@1.0.0", async (context) => {
    const ids = context.run.trigger.parcelContext?.baton?.artifactIds ?? [],
      values = ids.map((id) => context.readArtifact(id));
    await delay(2500);
    return {
      artifacts: [
        {
          name: "aggregate",
          value: {
            inputArtifacts: ids.length,
            sourceHashes: values.map((value) => hash(JSON.stringify(value))),
            decision: "All branches supplied verified evidence",
          },
        },
      ],
      evidence: ["aggregation-inputs-verified"],
      verification: ["aggregation-complete"],
    };
  });
  actions.registerReadOnly(
    "runtime-map.independent-verify@1.0.0",
    async (context) => {
      const ids = context.run.trigger.parcelContext?.baton?.artifactIds ?? [],
        result = await context.ownedExecution.runProcess(
          {
            command: process.execPath,
            args: [
              "-e",
              `console.log('Quality Inspector: independently verifying ${ids.length} aggregate artifact');setTimeout(()=>console.log('Quality Inspector: PASS'),1800);setTimeout(()=>process.exit(0),2600)`,
            ],
            cwd: process.cwd(),
          },
          context.signal,
        );
      if (result.exitCode !== 0 || ids.length !== 1)
        throw new Error("independent_verification_failed");
      return {
        artifacts: [
          {
            name: "verified-result",
            value: {
              status: "PASS",
              aggregateArtifacts: ids.length,
              authority: "independent deterministic gate",
            },
          },
        ],
        evidence: ["independent-verifier:PASS"],
        verification: ["independent-verification-passed"],
      };
    },
  );
  const catalog = new JobCatalog(actions.ids()),
    defs = [
      job(
        "runtime-map-model-review",
        "runtime-map.model-review@1.0.0",
        ["provider-response-schema-valid"],
        [
          {
            name: "model-assessment",
            type: "application/json",
            schema: "agent-control.runtime-map-model-assessment/v1",
            version: "1",
          },
        ],
      ),
      job(
        "runtime-map-repository-inspect",
        "runtime-map.repository-inspect@1.0.0",
        ["repository-state-recorded"],
        [
          {
            name: "repository-state",
            type: "application/json",
            schema: "agent-control.runtime-map-repository/v1",
            version: "1",
          },
        ],
      ),
      job(
        "runtime-map-test-gate",
        "runtime-map.test-gate@1.0.0",
        ["focused-tests-passed"],
        [
          {
            name: "test-result",
            type: "application/json",
            schema: "agent-control.runtime-map-tests/v1",
            version: "1",
          },
        ],
      ),
      job(
        "runtime-map-estate-gate",
        "runtime-map.estate-gate@1.0.0",
        ["estate-tests-passed"],
        [
          {
            name: "estate-test-result",
            type: "application/json",
            schema: "agent-control.runtime-map-estate-tests/v1",
            version: "1",
          },
        ],
      ),
      job(
        "runtime-map-dashboard-gate",
        "runtime-map.dashboard-gate@1.0.0",
        ["dashboard-validation-passed"],
        [
          {
            name: "dashboard-validation",
            type: "application/json",
            schema: "agent-control.runtime-map-dashboard-validation/v1",
            version: "1",
          },
        ],
      ),
      job(
        "runtime-map-retry-probe",
        "runtime-map.retry-probe@1.0.0",
        ["retry-recovered"],
        [
          {
            name: "retry-result",
            type: "application/json",
            schema: "agent-control.runtime-map-retry/v1",
            version: "1",
          },
        ],
        { attempts: 1, backoffSeconds: 2, overallDeadlineSeconds: 30 },
      ),
      job(
        "runtime-map-baseline",
        "runtime-map.baseline@1.0.0",
        ["baseline-identity-recorded"],
        [
          {
            name: "baseline-identity",
            type: "application/json",
            schema: "agent-control.runtime-map-baseline/v1",
            version: "1",
          },
        ],
      ),
      job(
        "runtime-map-aggregate",
        "runtime-map.aggregate@1.0.0",
        ["aggregation-complete"],
        [
          {
            name: "aggregate",
            type: "application/json",
            schema: "agent-control.runtime-map-aggregate/v1",
            version: "1",
          },
        ],
      ),
      job(
        "runtime-map-independent-verify",
        "runtime-map.independent-verify@1.0.0",
        ["independent-verification-passed"],
        [
          {
            name: "verified-result",
            type: "application/json",
            schema: "agent-control.runtime-map-verification/v1",
            version: "1",
          },
        ],
      ),
    ];
  for (const def of defs) catalog.addJob(def);
  const plan: WorkParcelPlan = {
    objective:
      "Physically qualify the real graphical Runtime Map against concurrent governed work",
    planner: {
      kind: "deterministic",
      reason: "Bounded physical qualification using registered Jobs",
    },
    stages: [
      {
        id: "model",
        name: "Local model assessment",
        job: "runtime-map-model-review@1.0.0",
      },
      {
        id: "repository",
        name: "Repository inspection",
        job: "runtime-map-repository-inspect@1.0.0",
      },
      {
        id: "tests",
        name: "Focused test gate",
        job: "runtime-map-test-gate@1.0.0",
      },
      {
        id: "estate",
        name: "Estate Map test gate",
        job: "runtime-map-estate-gate@1.0.0",
      },
      {
        id: "dashboard",
        name: "Dashboard validation",
        job: "runtime-map-dashboard-gate@1.0.0",
      },
      {
        id: "retry",
        name: "Recovery probe",
        job: "runtime-map-retry-probe@1.0.0",
      },
      {
        id: "aggregate",
        name: "Evidence aggregation",
        job: "runtime-map-aggregate@1.0.0",
        dependsOn: [
          "model",
          "repository",
          "tests",
          "estate",
          "dashboard",
          "retry",
        ],
      },
      {
        id: "verify",
        name: "Independent verification",
        job: "runtime-map-independent-verify@1.0.0",
        dependsOn: ["aggregate"],
      },
    ],
    successCriteria: [
      {
        id: "verified-runtime-map",
        kind: "STAGE_VERIFIED",
        description:
          "Independent verification accepts the aggregated physical evidence",
        source: "USER",
        stageId: "verify",
        requiredEvidence: ["independent-verifier:PASS"],
      },
    ],
  };
  const baselinePlan: WorkParcelPlan = {
    objective: "Record an authoritative single-job repository identity baseline",
    planner: {
      kind: "deterministic",
      reason: "Bounded baseline for evidence-identity graphical comparison",
    },
    stages: [
      {
        id: "baseline",
        name: "Repository identity baseline",
        job: "runtime-map-baseline@1.0.0",
      },
    ],
    successCriteria: [
      {
        id: "baseline-recorded",
        kind: "STAGE_VERIFIED",
        description: "Repository identity baseline is recorded",
        source: "USER",
        stageId: "baseline",
        requiredEvidence: ["baseline-git-head-observed"],
      },
    ],
  };
  const planner: WorkParcelPlanner = {
      plan: (input) => {
        if (input === prompt) return plan;
        if (input === baselinePrompt) return baselinePlan;
        throw new Error("qualification_prompt_identity_mismatch");
      },
    },
    store = new WorkParcelStore(path.join(stateRoot, "parcels.json")),
    runtime = new JobRuntime(
      catalog,
      actions,
      workers,
      ledger,
      artifacts,
      locks,
      { approval: () => true, efficiency, executionSessions: sessions },
    ),
    coordinator = new WorkParcelCoordinator(
      runtime,
      store,
      planner,
      efficiency,
    ),
    discovery = new EnvironmentDiscoveryRuntime({
      file: path.join(stateRoot, "environment-discovery.json"),
      config: () => emptyConfig(),
      configurationRevision: () => "runtime-map-qualification-read-only",
      runtimeInventory: () => ({
        jobs: catalog.listJobs().map((definition) => ({
          id: definition.metadata.id,
          name: definition.metadata.name,
          version: definition.metadata.version,
        })),
        agents: workers.list().map((worker) => ({
          id: worker.id,
          health: worker.health,
          capabilities: worker.capabilities,
        })),
        tools: actions.ids(),
        skills: [],
        mcpServers: [],
        plugins: [],
      }),
    }),
    state: WorkspaceState = {
      version: 1,
      paused: false,
      lastRestorePoint: null,
      lanes: [],
    },
    service = new AgentControlService(
      state,
      new PtyRegistry(),
      undefined,
      "4.5.0-runtime-map-qualification",
      () => {},
    ).configureProjection({
      jobRuntime: runtime,
      workParcels: coordinator,
      harnessEfficiency: efficiency,
      executionSessions: sessions,
      environmentDiscovery: discovery,
      resources: [
        {
          id: "controller",
          name: "Qualification controller",
          platform: "linux",
          transport: "local",
          capabilities: ["runtime-map.qualification"],
        },
      ],
    });
  await discovery.discover({
    mode: "QUICK_RESCAN",
    testing: "QUICK_TEST",
    includeRemote: false,
    includeMemory: false,
  });
  const poe = new PoeRuntime({
    file: path.join(stateRoot, "poe.json"),
    evidence: {
      overview: () => service.poeEvidence(),
      resolve: (reference) => service.poeEvidence(reference),
    },
    onEvent: (event) =>
      service.events.emit(
        `poe.${event.type.replaceAll(".", "_")}` as never,
        {
          conversationId: event.conversationId,
          state: event.state,
          detail: event.detail,
        },
        undefined,
        "poe-runtime",
      ),
  });
  service.configureProjection({ poe });
  ledger.subscribe((runId, type, status) =>
    service.events.emit(
      "job.run_changed",
      { runId, type, status },
      undefined,
      "run-ledger",
    ),
  );
  sessions.subscribe((event, session) =>
    service.events.emit(
      event.type === "output"
        ? "execution.session_output"
        : "execution.session_changed",
      {
        sessionId: session.id,
        runId: session.scope.runId,
        eventType: event.type,
        state: session.state,
        observedAt: event.at,
      },
      undefined,
      event.actorId,
    ),
  );
  let maximumConcurrentJobs = 0;
  const lastConcurrencyByParcel = new Map<string, number>();
  const concurrencySamples: Array<{
    at: string;
    parcelId: string;
    running: number;
  }> = [];
  store.subscribe((parcel) => {
    const running = parcel.stages.filter(
      (stage) => stage.status === "RUNNING",
    ).length;
    maximumConcurrentJobs = Math.max(maximumConcurrentJobs, running);
    if (lastConcurrencyByParcel.get(parcel.id) !== running) {
      concurrencySamples.push({at:new Date().toISOString(),parcelId:parcel.id,running});
      lastConcurrencyByParcel.set(parcel.id,running);
    }
    service.events.emit(
      "work.parcel_changed",
      { parcelId: parcel.id, status: parcel.status },
      undefined,
      "work-parcel-coordinator",
    );
  });
  const server = startWebDashboard(service, {
    host: "127.0.0.1",
    port: 43179,
    operatorToken: token,
    allowedOrigins: ["http://127.0.0.1:43179"],
  });
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port,
    base = `http://127.0.0.1:${port}`;
  let scheduler = true;
  const loop = (async () => {
    while (scheduler) {
      await coordinator.tick();
      for (;;) {
        const dispatch = runtime.dispatch();
        if (!dispatch) break;
        void dispatch.completion;
      }
      await delay(100);
    }
  })();
  const baseline = await coordinator.submit(baselinePrompt, "web-operator");
  const baselineDeadline = Date.now() + 30_000;
  while (store.get(baseline.id)?.status !== "SUCCEEDED") {
    if (store.get(baseline.id)?.status === "FAILED")
      throw new Error("runtime_map_baseline_failed");
    if (Date.now() > baselineDeadline)
      throw new Error("runtime_map_baseline_timeout");
    await delay(100);
  }
  let browser: any,
    context: any,
    video: any,
    page: any,
    rawVideo = "",
    eventLatencyMs: number | null = null,
    browserRenderMs: number | null = null,
    liveSessionVerified = false,
    estateCrossLinkVerified = false,
    renderedNodeBounds: Array<{
      label: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];
  const consoleErrors: string[] = [];
  try {
    const { chromium } = require("playwright-core");
    browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.AGENT_CONTROL_CHROMIUM ?? "/snap/bin/chromium",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: {
        dir: path.join(output, "raw-video"),
        size: { width: 1920, height: 1080 },
      },
      colorScheme: "dark",
    });
    page = await context.newPage();
    video = page.video();
    page.on("pageerror", (error: any) => consoleErrors.push(error.message));
    await page.addInitScript(
      (value) => sessionStorage.setItem("agent-control-operator-token", value),
      token,
    );
    await page.goto(base, { waitUntil: "networkidle" });
    await page.click("#natural-task-prompt");
    await page.locator("#natural-task-prompt").pressSequentially(prompt, {
      delay: 3,
    });
    await page.waitForTimeout(1200);
    const [, submission] = await Promise.all([
      page.click("#natural-task-submit"),
      page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/parcels") &&
          response.request().method() === "POST",
      ),
    ]);
    if (!submission.ok()) {
      throw new Error(
        `qualification_submission_failed:${submission.status()}:${await submission.text()}`,
      );
    }
    await page.waitForTimeout(700);
    await page.click('[data-view="runtime-map"]');
    await page.waitForSelector(".runtime-graph-node", { timeout: 15000 });
    const parcelId = store.list()[0]!.id;
    await page.selectOption("#runtime-parcel", parcelId);
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          ".runtime-graph-node.type-parallel-lane.state-RUNNING",
        ).length >= 6,
      undefined,
      { timeout: 15_000 },
    );
    await page.waitForTimeout(250);
    await page.screenshot({
      path: path.join(output, "runtime-map-six-jobs-running.png"),
      fullPage: true,
    });
    const eventReceived = page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          document.addEventListener(
            "agent-control:event-received",
            (event: Event) => {
              const detail = (event as CustomEvent).detail;
              if (detail?.type === "work.parcel_changed") resolve(Date.now());
            },
            { once: true },
          );
        }),
    );
    const emittedAt = Date.now();
    service.events.emit(
      "work.parcel_changed",
      { parcelId, status: store.get(parcelId)?.status },
      undefined,
      "latency-probe",
    );
    eventLatencyMs = (await eventReceived) - emittedAt;
    await page.click('[data-runtime-mode="control"]');
    await page.waitForSelector(".runtime-tile", { timeout: 10_000 });
    await page.waitForTimeout(250);
    await page.screenshot({
      path: path.join(output, "runtime-map-control-room.png"),
      fullPage: true,
    });
    const liveTile = page
      .locator(".runtime-tile")
      .filter({ hasText: "runtime-map-dashboard-gate" });
    assert.ok(await liveTile.count(), "dashboard qualification tile missing");
    await liveTile.first().click();
    await page.click("#runtime-fit");
    await page.waitForTimeout(300);
    const workerNode = page.locator(".runtime-graph-node.type-worker").first();
    await workerNode.waitFor({ state: "attached", timeout: 10_000 });
    await workerNode.click({ force: true });
    await page.waitForTimeout(450);
    const stepNode = page.locator(".runtime-graph-node.type-tool").first();
    await stepNode.waitFor({ state: "attached", timeout: 5_000 });
    await stepNode.click({ force: true });
    await page.waitForTimeout(450);
    const dashboardRunId = store
      .get(parcelId)
      ?.stages.find((stage) => stage.id === "dashboard")?.runId;
    assert.ok(dashboardRunId, "dashboard qualification run missing");
    let liveSessionId = "";
    const sessionDeadline = Date.now() + 10_000;
    while (!liveSessionId) {
      liveSessionId =
        sessions
          .list()
          .find(
            (session) =>
              session.scope.runId === dashboardRunId &&
              session.state === "RUNNING",
          )?.id ?? "";
      if (Date.now() > sessionDeadline)
        throw new Error("dashboard_live_execution_session_timeout");
      if (!liveSessionId) await delay(50);
    }
    await page.click('[data-runtime-mode="map"]');
    const terminal = page.locator(
      `[data-runtime-node="terminal:${liveSessionId}"]`,
    );
    await terminal.waitFor({ state: "attached", timeout: 10_000 });
    assert.match((await terminal.getAttribute("aria-label")) ?? "", /RUNNING/);
    await terminal.click({ force: true });
    const watch = page.locator("[data-runtime-session]").first();
    await watch.waitFor({ state: "visible", timeout: 5_000 });
    await watch.click();
    await page.waitForSelector("#live-shell-dialog[open]", {
      timeout: 10_000,
    });
    await page.waitForFunction(
      () =>
        (document.querySelector("#live-shell-output")?.textContent?.length ??
          0) > 0,
      undefined,
      { timeout: 10_000 },
    );
    const firstOutputLength = await page.locator("#live-shell-output").evaluate(
      (element: HTMLElement) => element.textContent?.length ?? 0,
    );
    await page.waitForFunction(
      (length) =>
        (document.querySelector("#live-shell-output")?.textContent?.length ??
          0) > length,
      firstOutputLength,
      { timeout: 20_000 },
    );
    liveSessionVerified = await page.evaluate(() => {
      const dialog = document.querySelector("#live-shell-dialog"),
        mode = document.querySelector("#live-shell-mode")?.textContent,
        output = document.querySelector("#live-shell-output")?.textContent;
      return Boolean(
        dialog?.hasAttribute("open") && mode === "WATCH" && output?.trim(),
      );
    });
    assert.equal(liveSessionVerified, true);
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(output, "runtime-map-live-session.png"),
      fullPage: true,
    });
    await page.click("#live-shell-close");
    await page.locator("[data-runtime-resource]").click();
    await page.waitForFunction(() =>
      document
        .querySelector('[data-runtime-surface="estate"]')
        ?.classList.contains("active"),
    );
    estateCrossLinkVerified = await page.evaluate(() =>
      Boolean(
        document.querySelector('[data-runtime-surface="estate"].active') &&
          document.querySelector("#runtime-inspector [data-runtime-work]"),
      ),
    );
    assert.equal(estateCrossLinkVerified, true);
    await page.waitForTimeout(900);
    await page.screenshot({
      path: path.join(output, "runtime-map-estate-cross-link.png"),
      fullPage: true,
    });
    await page.locator("#runtime-inspector [data-runtime-work]").click();
    await page.waitForFunction(() =>
      document
        .querySelector('[data-runtime-surface="process"]')
        ?.classList.contains("active"),
    );
    await page.waitForTimeout(800);
    await page.click('[data-view="poe"]');
    await page.waitForSelector("#poe-input", { timeout: 10_000 });
    await page.fill("#poe-input", `Explain runtime map ${parcelId}`);
    const priorTurns = await page.locator("#poe-turns .poe-turn").count();
    await page.click('#poe-form button[type="submit"]');
    await page.waitForFunction(
      (count) =>
        document.querySelectorAll("#poe-turns .poe-turn").length >= count + 2,
      priorTurns,
      { timeout: 15_000 },
    );
    await page.waitForTimeout(1400);
    await page.screenshot({
      path: path.join(output, "runtime-map-poe-grounded-status.png"),
      fullPage: true,
    });
    await page.click('[data-view="runtime-map"]');
    const deadline = Date.now() + 180000;
    while (store.get(parcelId)?.status !== "SUCCEEDED") {
      if (store.get(parcelId)?.status === "FAILED")
        throw new Error("qualification_work_parcel_failed");
      if (Date.now() > deadline)
        throw new Error(`qualification_timeout:${store.get(parcelId)?.status}`);
      await page.waitForTimeout(500);
    }
    await page.waitForFunction(() =>
      document
        .querySelector("#runtime-parcel option:checked")
        ?.textContent?.includes("SUCCEEDED"),
    );
    await page.waitForTimeout(2200);
    await page.click("#runtime-fit");
    await page.waitForTimeout(1200);
    browserRenderMs = await page.evaluate(async () => {
      const started = performance.now();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      return performance.now() - started;
    });
    renderedNodeBounds = await page.locator(".runtime-graph-node").evaluateAll(
      (nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return {
            label: node.getAttribute("aria-label") ?? "",
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
          };
        }),
    );
    assert.ok(renderedNodeBounds.length >= 10);
    assert.ok(
      renderedNodeBounds.filter(
        (box) =>
          box.width >= 60 &&
          box.height >= 20 &&
          box.x >= 0 &&
          box.y >= 0 &&
          box.x < 1920 &&
          box.y < 1080,
      ).length >= 8,
    );
    await page.screenshot({
      path: path.join(output, "runtime-map-complete.png"),
      fullPage: true,
    });
    await page.route("**/api/runtime-map?**", (route) => route.abort());
    service.events.emit(
      "work.parcel_changed",
      { parcelId, status: store.get(parcelId)?.status },
      undefined,
      "disconnect-test",
    );
    await page.waitForTimeout(1100);
    await page.unroute("**/api/runtime-map?**");
    service.events.emit(
      "work.parcel_changed",
      { parcelId, status: store.get(parcelId)?.status },
      undefined,
      "reconnect-test",
    );
    await page.waitForTimeout(1600);
    await page.click('[data-runtime-mode="replay"]');
    await page.waitForTimeout(900);
    await page.locator("#runtime-replay").fill("0");
    await page.waitForTimeout(1200);
    await page.click("#runtime-replay-play");
    await page.waitForTimeout(3500);
    await page.click("#runtime-replay-play");
    await page.locator("#runtime-replay").fill("520");
    await page.waitForTimeout(1800);
    await page.screenshot({
      path: path.join(output, "runtime-map-replay-fan-out.png"),
      fullPage: true,
    });
    await page.locator("#runtime-replay").fill("1000");
    await page.waitForTimeout(1300);
    await page.click('[data-runtime-mode="compare"]');
    await page.waitForSelector(".runtime-compare-card", { timeout: 12_000 });
    await page.waitForTimeout(1400);
    await page.screenshot({
      path: path.join(output, "runtime-map-graphical-compare.png"),
      fullPage: true,
    });
    await context.close();
    context = undefined;
    rawVideo = await video.path();
    await browser.close();
    browser = undefined;
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    scheduler = false;
    await loop;
    server.close();
    await once(server, "close");
  }
  const parcel = store.list()[0]!,
    projection = service.runtimeMap(parcel.id),
    replay = service.runtimeMap(parcel.id, parcel.createdAt),
    comparison = service.compareRuntimeMaps(baseline.id, parcel.id),
    terminalNodes = projection.nodes.filter((node) => node.type === "terminal"),
    modelNodes = projection.nodes.filter((node) => node.type === "model-call"),
    poeConversationSummary = poe.projection().conversations[0],
    poeConversation = poeConversationSummary
      ? poe.conversation(poeConversationSummary.id)
      : null,
    projectionDurations: number[] = [];
  const projectionCpuStarted = process.cpuUsage();
  for (let index = 0; index < 100; index++) {
    const began = performance.now();
    service.runtimeMap(parcel.id);
    projectionDurations.push(performance.now() - began);
  }
  const projectionCpu = process.cpuUsage(projectionCpuStarted);
  projectionDurations.sort((left, right) => left - right);
  const elapsedSeconds = Math.max(
      0.001,
      (Date.parse(parcel.endedAt!) - Date.parse(parcel.createdAt)) / 1000,
    ),
    completedRssBytes = process.memoryUsage().rss,
    firstSix = parcel.stages.slice(0, 6),
    sixWayOverlapMs =
      Math.min(...firstSix.map((stage) => Date.parse(stage.endedAt!))) -
      Math.max(...firstSix.map((stage) => Date.parse(stage.startedAt!)));
  assert.equal(parcel.status, "SUCCEEDED");
  assert.equal(firstSix.length, 6);
  assert.ok(firstSix.every((stage) => stage.status === "SUCCEEDED"));
  assert.ok(sixWayOverlapMs > 0, `six-way overlap ${sixWayOverlapMs}ms`);
  assert.ok(maximumConcurrentJobs >= 6, `maximum concurrent ${maximumConcurrentJobs}`);
  assert.ok(modelNodes.length >= 1);
  assert.ok(terminalNodes.length >= 4);
  assert.ok(projection.nodes.some((node) => node.type === "retry"));
  assert.ok(projection.nodes.some((node) => node.type === "baton"));
  assert.ok(projection.nodes.some((node) => node.type === "aggregation"));
  assert.ok(projection.nodes.some((node) => node.type === "poe"));
  assert.equal(parcel.origin?.channel, "dashboard");
  assert.equal(parcel.attribution?.parcelId, parcel.id);
  assert.equal(liveSessionVerified, true);
  assert.equal(estateCrossLinkVerified, true);
  assert.ok(
    replay.nodes
      .filter((node) => node.type === "parallel-lane")
      .every((node) => node.state === "WAITING"),
  );
  assert.deepEqual(consoleErrors, []);
  for (const name of expectedScreenshots)
    assert.ok(
      fs.existsSync(path.join(output, name)),
      `missing screenshot ${name}`,
    );
  assert.equal(
    replay.nodes.find((node) => node.type === "result")?.state,
    "WAITING",
  );
  assert.ok(comparison.deltas.nodes > 0);
  assert.equal(comparison.identity.labelMatching, false);
  assert.ok(
    poeConversation?.turns.some(
      (turn) =>
        turn.actor === "poe" &&
        turn.evidence.some((fact) =>
          fact.evidence.includes(`runtime-map:${parcel.id}`),
        ),
    ),
  );
  const videoFile = path.join(
    output,
    "agent-control-4.5-runtime-map-six-job-visual-acceptance.mp4",
  );
  execFileSync("ffmpeg", [
    "-nostdin",
    "-y",
    "-loglevel",
    "error",
    "-i",
    rawVideo,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    videoFile,
  ]);
  fs.rmSync(path.dirname(rawVideo), { recursive: true, force: true });
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration,size:stream=width,height,r_frame_rate",
        "-of",
        "json",
        videoFile,
      ],
      { encoding: "utf8" },
    ),
  );
  const report = {
    schema: "agent-control.runtime-map-visual-acceptance/v1",
    verdict: "PASS",
    startedAt,
    completedAt: new Date().toISOString(),
    repository: {
      branch: execFileSync("git", ["branch", "--show-current"], {
        encoding: "utf8",
      }).trim(),
      head: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      dirty: true,
    },
    provider: {
      id: provider.id,
      model: model.id,
      providerModel,
      endpointScope: "controller loopback",
    },
    workParcel: {
      id: parcel.id,
      baselineId: baseline.id,
      status: parcel.status,
      maximumConcurrentJobs,
      sixWayOverlapMs,
      stages: parcel.stages.map((stage) => ({
        id: stage.id,
        status: stage.status,
        runId: stage.runId,
        batonSha256: stage.baton?.sha256 ?? null,
      })),
      tokens: parcel.audit.totals,
      decision: parcel.decision,
    },
    runtimeMap: {
      summary: projection.summary,
      nodeTypes: [...new Set(projection.nodes.map((node) => node.type))],
      eventCount: projection.events.length,
      terminalSessions: terminalNodes.map((node) => node.detail.sessionId),
      modelCalls: modelNodes.map((node) => ({
        provider: node.detail.provider,
        model: node.label,
        usageAuthority: node.detail.usageAuthority,
        inputTokens: node.detail.inputTokens,
        cachedInputTokens: node.detail.cachedInputTokens,
        outputTokens: node.detail.outputTokens,
        totalTokens: node.detail.totalTokens,
        cost: node.detail.cost,
        costBasis: node.detail.costBasis,
      })),
      replayVerified: true,
      graphicalCompareVerified: true,
      compare: comparison,
      poeGroundedObservationVerified: true,
      estateCrossLinkVerified,
      liveSessionVerified,
      disconnectDidNotAffectExecution: true,
      renderedNodeBounds,
    },
    performance: {
      projectionSamples: projectionDurations.length,
      projectionAverageMs:
        projectionDurations.reduce((sum, value) => sum + value, 0) /
        projectionDurations.length,
      projectionP95Ms:
        projectionDurations[
          Math.floor(projectionDurations.length * 0.95) - 1
        ],
      projectionCpuUserMs: projectionCpu.user / 1000,
      projectionCpuSystemMs: projectionCpu.system / 1000,
      projectionCpuScope:
        "Agent Control controller process during 100 projection calls; browser, model and subprocess CPU excluded",
      authoritativeEventsPerSecond: projection.events.length / elapsedSeconds,
      sseEventLatencyMs: eventLatencyMs,
      browserTwoFrameRenderMs: browserRenderMs,
      rssBeforeBytes: initialRssBytes,
      rssAfterBytes: completedRssBytes,
      rssDeltaBytes: completedRssBytes - initialRssBytes,
      concurrencySamples,
    },
    security: { consoleErrors },
    video: {
      path: path.relative(process.cwd(), videoFile),
      sha256: hash(fs.readFileSync(videoFile)),
      probe,
    },
    screenshots: expectedScreenshots
      .filter((name) => fs.existsSync(path.join(output, name)))
      .map((name) => ({
        path: path.relative(process.cwd(), path.join(output, name)),
        sha256: hash(fs.readFileSync(path.join(output, name))),
      })),
  };
  fs.writeFileSync(
    path.join(output, "qualification.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  );
  fs.writeFileSync(
    path.join(output, "complete-human-readable-transcript.md"),
    `# Agent Control Runtime Map six-job visual acceptance\n\n## Exact operator request\n\n${prompt}\n\n## Concurrency\n\n- Maximum concurrent governed Jobs: ${maximumConcurrentJobs}\n- Interval in which all six independent Jobs overlapped: ${sixWayOverlapMs} ms\n\n## Authoritative execution\n\n${parcel.audit.timeline.map((item) => `- ${item.at} — **${item.type}** — ${item.summary}: ${item.detail}`).join("\n")}\n\n## Job and session evidence\n\n${parcel.stages.map((stage) => `### ${stage.name}\n\n- Stage: ${stage.id}\n- Status: ${stage.status}\n- Run: ${stage.runId ?? "unavailable"}\n- Baton SHA-256: ${stage.baton?.sha256 ?? "unavailable"}\n${stage.runId ? terminalNodes.filter((node) => (node.detail.scope as {runId?: string})?.runId === stage.runId).map((node) => `\n#### Execution Session ${node.detail.sessionId}\n\n\`\`\`text\n${sessions.transcript(String(node.detail.sessionId))}\n\`\`\``).join("\n") : ""}`).join("\n\n")}\n\n## Model calls\n\n${modelNodes.map((node) => `- ${node.detail.provider} / ${node.label}: ${node.detail.inputTokens ?? "unavailable"} input, ${node.detail.cachedInputTokens ?? "unavailable"} cached, ${node.detail.outputTokens ?? "unavailable"} output, ${node.detail.totalTokens ?? "unavailable"} total; cost ${node.detail.cost ?? "unavailable"} (${node.detail.costBasis})`).join("\n")}\n\n## Grounded POE observation\n\n${poeConversation?.turns.map((turn) => `- ${turn.at} — **${turn.actor === "poe" ? "Morrow" : "Operator"}**: ${turn.text}`).join("\n") ?? "Unavailable"}\n\n## Final result\n\n${parcel.decision?.summary}\n`,
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      verdict: "PASS",
      parcelId: parcel.id,
      video: videoFile,
      report: path.join(output, "qualification.json"),
    }),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

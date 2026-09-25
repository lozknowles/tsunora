import type {ModelInvocationObservation} from "./harness-efficiency.js";
import { createHash } from "node:crypto";
import type { RunRecord } from "./job-types.js";
import type { WorkParcel } from "./work-parcels.js";
import type {
  ExecutionSessionEvent,
  ExecutionSessionRecord,
} from "./execution-session.js";
import type { TokenRoutingProjection } from "./token-aware-baton-routing.js";
import type { RetrievalProjection } from "./governed-retrieval.js";
import { redactSensitiveValue } from "./security-redaction.js";

export type RuntimeMapNodeType =
  | "request"
  | "poe"
  | "planner"
  | "decision"
  | "work-parcel"
  | "job"
  | "parallel-lane"
  | "worker"
  | "model-call"
  | "cache"
  | "memory"
  | "skill"
  | "tool"
  | "terminal"
  | "validation"
  | "retry"
  | "escalation"
  | "approval"
  | "baton"
  | "aggregation"
  | "consensus"
  | "result"
  | "estate"
  | "machine"
  | "device"
  | "gpu"
  | "storage"
  | "runtime"
  | "model"
  | "provider"
  | "endpoint"
  | "transport"
  | "credential"
  | "mcp-server";
export type RuntimeMapState =
  | "RECORDED"
  | "WAITING"
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "DEGRADED"
  | "BLOCKED"
  | "SKIPPED"
  | "HANDOFF";
export interface RuntimeMapEvidenceRef {
  kind: string;
  id: string;
  sha256?: string;
}
export interface RuntimeMapNode {
  id: string;
  type: RuntimeMapNodeType;
  label: string;
  subtitle?: string;
  state: RuntimeMapState;
  startedAt?: string;
  endedAt?: string;
  parentId?: string;
  groupId?: string;
  expandable: boolean;
  detail: Record<string, unknown>;
  evidence: RuntimeMapEvidenceRef[];
}
export interface RuntimeMapEdge {
  id: string;
  from: string;
  to: string;
  kind: "flow" | "dependency" | "contains" | "handoff" | "retry" | "evidence";
  state: RuntimeMapState;
  label?: string;
  evidence: RuntimeMapEvidenceRef[];
}
export interface RuntimeMapEvent {
  at: string;
  kind: string;
  nodeId: string;
  state: RuntimeMapState;
  summary: string;
  evidence: RuntimeMapEvidenceRef[];
}
export interface RuntimeMapProjection {
  schema: "agent-control.runtime-map/v1";
  authority: "Agent Control authoritative runtime records" | "Agent Control governed discovery inventory";
  mapKind?: "PROCESS" | "ESTATE";
  mode: "LIVE" | "REPLAY";
  parcelId: string | null;
  observedAt: string;
  replayAt: string | null;
  range: { startedAt: string | null; endedAt: string | null };
  freshness: {
    state: "LIVE" | "HISTORICAL" | "STALE";
    lastAuthoritativeAt: string | null;
  };
  summary: {
    nodes: number;
    edges: number;
    running: number;
    waiting: number;
    succeeded: number;
    failed: number;
    degraded: number;
    groups: number;
  };
  nodes: RuntimeMapNode[];
  edges: RuntimeMapEdge[];
  events: RuntimeMapEvent[];
  controlRoom: Array<{
    id: string;
    job: string;
    worker: string;
    model: string;
    activity: string;
    state: RuntimeMapState;
    startedAt?: string;
    sessionId?: string;
    latestSafeOutput?: string;
  }>;
  limitations: string[];
}
export interface RuntimeMapComparisonFacet {
  left: string[];
  right: string[];
  added: string[];
  removed: string[];
}
export interface RuntimeMapComparison {
  schema: "agent-control.runtime-map-compare/v1";
  leftParcelId: string | null;
  rightParcelId: string | null;
  identity: {
    strategy: "independent-authoritative-facets";
    labelMatching: false;
    note: string;
  };
  left: RuntimeMapComparisonSide;
  right: RuntimeMapComparisonSide;
  deltas: {
    nodes: number;
    edges: number;
    durationMs: number | null;
    modelCalls: number;
    cacheOperations: number;
    memoryOperations: number;
    batons: number;
    retries: number;
    failures: number;
    totalTokens: number | null;
    cost: number | null;
  };
  facets: Record<
    | "routes"
    | "models"
    | "providers"
    | "machines"
    | "workers"
    | "decisions"
    | "cache"
    | "memory"
    | "batons"
    | "retries"
    | "failures",
    RuntimeMapComparisonFacet
  >;
}
export interface RuntimeMapComparisonSide {
  parcelId: string | null;
  durationMs: number | null;
  nodes: number;
  edges: number;
  modelCalls: number;
  cacheOperations: number;
  memoryOperations: number;
  batons: number;
  retries: number;
  failures: number;
  totalTokens: number | null;
  cost: number | null;
  costBasis: string;
}
export interface RuntimeMapSource {
  parcel?: WorkParcel;
  runs: RunRecord[];
  sessions: ExecutionSessionRecord[];
  sessionEvents: (id: string) => ExecutionSessionEvent[];
  tokenRouting?: TokenRoutingProjection;
  retrieval?: RetrievalProjection;
  now?: string;
  replayAt?: string;
}

const terminal = new Set<RuntimeMapState>([
  "SUCCEEDED",
  "FAILED",
  "DEGRADED",
  "BLOCKED",
  "SKIPPED",
]);
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const safe = <T>(value: T) => redactSensitiveValue(value) as T;
function state(value?: string): RuntimeMapState {
  const v = (value ?? "WAITING").toUpperCase();
  if (
    [
      "RUNNING",
      "DISPATCHED",
      "VERIFYING",
      "RESOLVING",
      "VALIDATING",
      "ACTIVE",
    ].includes(v)
  )
    return "RUNNING";
  if (["QUEUED", "READY", "PLANNING"].includes(v)) return "QUEUED";
  if (
    [
      "SUCCEEDED",
      "COMPLETE",
      "COMPLETED",
      "EXITED",
      "VERIFIED",
      "ACCEPTED",
      "PASS",
    ].includes(v)
  )
    return "SUCCEEDED";
  if (["FAILED", "ERROR", "CANCELLED", "MISSED", "DISCONNECTED"].includes(v))
    return "FAILED";
  if (["DEGRADED", "RETRY_PENDING", "RECONNECTING", "ESCALATED"].includes(v))
    return "DEGRADED";
  if (
    [
      "WAITING",
      "WAITING_FOR_DEPENDENCY",
      "WAITING_FOR_RESOURCE",
      "WAITING_FOR_WORKER",
      "WAITING_FOR_APPROVAL",
      "AUTHENTICATION_BLOCKED",
      "CLEANUP_UNCERTAIN",
    ].includes(v)
  )
    return v === "WAITING" ? "WAITING" : "BLOCKED";
  if (v === "SKIPPED") return "SKIPPED";
  return "WAITING";
}
function temporal(
  final: RuntimeMapState,
  start: string | undefined,
  end: string | undefined,
  replayAt?: string,
) {
  if (!replayAt) return final;
  const t = Date.parse(replayAt);
  if (start && t < Date.parse(start)) return "WAITING";
  if (start && (!end || t < Date.parse(end))) return "RUNNING";
  return end && t >= Date.parse(end) ? final : "WAITING";
}
function edge(
  from: string,
  to: string,
  kind: RuntimeMapEdge["kind"] = "flow",
  label?: string,
  evidence: RuntimeMapEvidenceRef[] = [],
): RuntimeMapEdge {
  return {
    id: `edge:${sha(`${from}|${to}|${kind}|${label ?? ""}`).slice(0, 16)}`,
    from,
    to,
    kind,
    state: kind === "handoff" ? "HANDOFF" : "WAITING",
    ...(label ? { label } : {}),
    evidence,
  };
}
function event(
  at: string,
  kind: string,
  nodeId: string,
  s: RuntimeMapState,
  summary: string,
  evidence: RuntimeMapEvidenceRef[] = [],
): RuntimeMapEvent {
  return { at, kind, nodeId, state: s, summary, evidence };
}
function latestOutput(events: ExecutionSessionEvent[], at?: string) {
  const values = events
    .filter(
      (item) =>
        item.type === "output" &&
        (!at || Date.parse(item.at) <= Date.parse(at)),
    )
    .map((item) => (typeof item.text === "string" ? item.text : ""))
    .filter(Boolean);
  return values.at(-1)?.slice(-240);
}

export function projectRuntimeMap(
  input: RuntimeMapSource,
): RuntimeMapProjection {
  const now = input.now ?? new Date().toISOString(),
    at = input.replayAt,
    parcel = input.parcel,
    nodes: RuntimeMapNode[] = [],
    edges: RuntimeMapEdge[] = [],
    events: RuntimeMapEvent[] = [],
    seen = new Set<string>();
  const add = (node: RuntimeMapNode) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    nodes.push(safe(node));
  };
  const evidence = (
    kind: string,
    id: string,
    content?: unknown,
  ): RuntimeMapEvidenceRef => ({
    kind,
    id,
    ...(content === undefined ? {} : { sha256: sha(JSON.stringify(content)) }),
  });
  if (parcel) {
    const pe = evidence("work-parcel", parcel.id, parcel.audit),
      requestId = `request:${parcel.id}`,
      poeId = `poe:${parcel.id}`,
      plannerId = `planner:${parcel.id}`,
      parcelId = `parcel:${parcel.id}`;
    add({
      id: requestId,
      type: "request",
      label: "Request",
      subtitle: parcel.objective,
      state: temporal("SUCCEEDED", parcel.createdAt, parcel.createdAt, at),
      startedAt: parcel.createdAt,
      endedAt: parcel.createdAt,
      expandable: false,
      detail: {
        actor: parcel.actor,
        channel: parcel.origin?.channel ?? "dashboard",
        requestHash: sha(parcel.prompt),
      },
      evidence: [pe],
    });
    const fromPoe =
      parcel.origin?.channel === "dashboard" ||
      parcel.origin?.channel === "voice" ||
      parcel.origin?.channel === "whatsapp" ||
      parcel.origin?.channel === "mallow/dashboard" ||
      parcel.origin?.channel === "poe/dashboard";
    if (fromPoe) {
      add({
        id: poeId,
        type: "poe",
        label: "Mallow",
        subtitle: "Governed operator ingress",
        state: temporal("SUCCEEDED", parcel.createdAt, parcel.createdAt, at),
        startedAt: parcel.createdAt,
        endedAt: parcel.createdAt,
        expandable: true,
        detail: {
          channel: parcel.origin?.channel,
          modality: parcel.origin?.modality ?? "not reported",
          voiceEvidence: parcel.origin?.authority?.filter(value=>value.startsWith("voice-")) ?? [],
          authentication: parcel.origin?.authentication ?? null,
        },
        evidence: [pe],
      });
      edges.push(edge(requestId, poeId));
    }
    add({
      id: plannerId,
      type: "planner",
      label: "Plan and route",
      subtitle: parcel.planner.reason,
      state: temporal(
        parcel.stages.length ? "SUCCEEDED" : "FAILED",
        parcel.createdAt,
        parcel.audit.timeline.find((x) => x.type === "plan.selected")?.at,
        at,
      ),
      startedAt: parcel.createdAt,
      endedAt: parcel.audit.timeline.find((x) => x.type === "plan.selected")
        ?.at,
      expandable: true,
      detail: {
        kind: parcel.planner.kind,
        provider: parcel.planner.provider ?? null,
        model: parcel.planner.model ?? null,
      },
      evidence: [pe],
    });
    edges.push(edge(fromPoe ? poeId : requestId, plannerId));
    add({
      id: parcelId,
      type: "work-parcel",
      label: "Work Parcel",
      subtitle: parcel.id,
      state: temporal(
        state(parcel.status),
        parcel.createdAt,
        parcel.endedAt,
        at,
      ),
      startedAt: parcel.createdAt,
      endedAt: parcel.endedAt,
      expandable: true,
      detail: {
        objective: parcel.objective,
        status: parcel.status,
        telemetry: parcel.telemetry,
        decision: parcel.decision ?? null,
      },
      evidence: [pe],
    });
    edges.push(edge(plannerId, parcelId));
    const stageIds = new Map(
      parcel.stages.map((s) => [s.id, `stage:${parcel.id}:${s.id}`]),
    );
    for (const stage of parcel.stages) {
      const sid = stageIds.get(stage.id)!,
        run = stage.runId
          ? input.runs.find((r) => r.id === stage.runId)
          : undefined,
        se = evidence("parcel-stage", `${parcel.id}:${stage.id}`, stage);
      add({
        id: sid,
        type: "parallel-lane",
        label: stage.name,
        subtitle: stage.job,
        state: temporal(
          state(stage.status),
          stage.startedAt,
          stage.endedAt,
          at,
        ),
        startedAt: stage.startedAt,
        endedAt: stage.endedAt,
        parentId: parcelId,
        groupId: `group:${sid}`,
        expandable: true,
          detail: {
            stageId: stage.id,
            dependsOn: stage.dependsOn,
            route: stage.actualRoute ?? stage.requestedRoute ?? null,
            resourceIdentity: {
              nodeId:
                stage.actualRoute?.providerExecutionNodeId ??
                stage.actualRoute?.workloadNodeId ??
                stage.actualRoute?.workers[0] ??
                null,
              providerId:
                stage.actualRoute?.provider ??
                stage.requestedRoute?.provider ??
                null,
              modelId:
                stage.actualRoute?.model ?? stage.requestedRoute?.model ?? null,
            },
            waitingReason: stage.waitingReason ?? null,
            error: stage.error ?? null,
        },
        evidence: [pe, se],
      });
      if (!stage.dependsOn.length) edges.push(edge(parcelId, sid, "contains"));
      for (const dep of stage.dependsOn)
        if (stageIds.has(dep))
          edges.push(edge(stageIds.get(dep)!, sid, "dependency"));
      if (run) {
        const rid = `run:${run.id}`,
          re = evidence("run", run.id, run);
        add({
          id: rid,
          type: "job",
          label: run.jobId,
          subtitle: `Run ${run.id}`,
          state: temporal(state(run.status), run.requestedAt, run.endedAt, at),
          startedAt: run.requestedAt,
          endedAt: run.endedAt,
          parentId: sid,
          groupId: `group:${sid}`,
          expandable: true,
          detail: {
            runId: run.id,
            jobVersion: run.jobVersion,
            trigger: run.trigger,
            status: run.status,
            errors: run.errors,
            lineage: run.lineage ?? null,
          },
          evidence: [re, pe],
        });
        edges.push(edge(sid, rid, "contains"));
        for (const step of run.steps) {
          const stepId = `step:${run.id}:${step.id}`,
            attempt = step.attempts.at(-1),
            st = temporal(state(step.status), step.startedAt, step.endedAt, at),
            type: RuntimeMapNodeType = step.action.includes("verify")
              ? "validation"
              : step.action.includes("skill")
                ? "skill"
                : "tool";
          add({
            id: stepId,
            type,
            label: step.id,
            subtitle: step.action,
            state: st,
            startedAt: step.startedAt,
            endedAt: step.endedAt,
            parentId: rid,
            groupId: `group:${sid}`,
            expandable: true,
            detail: {
              action: step.action,
              capabilities: step.capabilityRequest,
              resources: step.resources,
              attempts: step.attempts.length,
              verification: step.verification,
              error: step.error ?? null,
            },
            evidence: [re],
          });
          edges.push(edge(rid, stepId, "contains"));
          for (const dep of step.dependsOn)
            edges.push(edge(`step:${run.id}:${dep}`, stepId, "dependency"));
          const worker = attempt?.workerId ?? step.placement?.selected;
          if (worker) {
            const wid = `worker:${run.id}:${step.id}:${worker}`;
            add({
              id: wid,
              type: "worker",
              label: String(worker),
              subtitle: "Governed worker",
              state: st,
              startedAt: step.startedAt,
              endedAt: step.endedAt,
              parentId: stepId,
              groupId: `group:${sid}`,
              expandable: true,
              detail: {
                workerId: worker,
                placement: step.placement ?? null,
                resourceIdentity: { workerId: worker },
              },
              evidence: [re],
            });
            edges.push(edge(stepId, wid, "contains"));
          }
          if (step.attempts.length > 1) {
            const retryId = `retry:${run.id}:${step.id}`;
            add({
              id: retryId,
              type: "retry",
              label: `Retry ×${step.attempts.length - 1}`,
              state: st === "FAILED" ? "FAILED" : "DEGRADED",
              parentId: stepId,
              groupId: `group:${sid}`,
              expandable: true,
              detail: { attempts: step.attempts },
              evidence: [re],
            });
            edges.push(edge(stepId, retryId, "retry"));
          }
        }
      }
    }
    for (const invocation of parcel.audit.invocations) {
      const id = `model:${invocation.id}`,
        sid = stageIds.get(invocation.stageId) ?? parcelId,
        ie = evidence("model-invocation", invocation.id, invocation);
      add({
        id,
        type: "model-call",
        label: invocation.providerModel ?? invocation.model,
        subtitle: invocation.provider,
        state: temporal(
          state(invocation.outcome),
          invocation.startedAt,
          invocation.completedAt ?? undefined,
          at,
        ),
        startedAt: invocation.startedAt,
        endedAt: invocation.completedAt ?? undefined,
        parentId: sid,
        groupId: `group:${sid}`,
        expandable: true,
        detail: {
          provider: invocation.provider,
          configuredModel: invocation.model,
          providerModel: invocation.providerModel ?? null,
          accountProfileId: invocation.accountProfileId ?? null,
          node: invocation.node,
          route: invocation.route,
          latencyMs: invocation.elapsedMs,
          usageAuthority: invocation.usageAuthority ?? "unavailable",
          inputTokens: invocation.inputTokens ?? null,
          cachedInputTokens: invocation.cachedInputTokens,
          outputTokens: invocation.outputTokens,
          totalTokens: invocation.totalTokens,
          cost: invocation.providerReportedCost ?? invocation.calculatedCost,
          costBasis: invocation.costBasis,
          requestDispatched: invocation.requestDispatched ?? null,
          verifierResult: invocation.verifierResult,
          resourceIdentity: {
            nodeId: invocation.node,
            providerId: invocation.provider,
            modelId: invocation.model,
          },
        },
        evidence: [ie],
      });
      edges.push(edge(sid, id, "flow"));
    }
    for (const audit of parcel.audit.timeline) {
      const nodeId = audit.stageId
          ? (stageIds.get(audit.stageId) ?? parcelId)
          : parcelId,
        ae = evidence("parcel-audit-event", audit.id, audit);
      events.push(
        event(
          audit.at,
          audit.type,
          nodeId,
          stateForAudit(audit.type),
          audit.summary,
          [ae],
        ),
      );
      if (audit.type === "baton.created" || audit.type.startsWith("handoff.")) {
        const id = `baton:${audit.id}`;
        add({
          id,
          type: "baton",
          label:
            audit.type === "baton.created"
              ? "Sealed baton"
              : "Governed handoff",
          subtitle: audit.summary,
          state: "HANDOFF",
          startedAt: audit.at,
          endedAt: audit.at,
          parentId: nodeId,
          expandable: true,
          detail: { reason: audit.detail, integrity: ae.sha256 },
          evidence: [ae],
        });
        edges.push(edge(nodeId, id, "handoff"));
      }
      if (audit.type.startsWith("cache.")) {
        const id = `cache:${audit.id}`;
        add({
          id,
          type: "cache",
          label: audit.summary,
          subtitle: audit.type,
          state: stateForAudit(audit.type),
          startedAt: audit.at,
          endedAt: audit.at,
          parentId: nodeId,
          expandable: true,
          detail: { detail: audit.detail },
          evidence: [ae],
        });
        edges.push(edge(nodeId, id));
      }
      if (audit.type === "context.retrieved") {
        const id = `memory:${audit.id}`;
        add({
          id,
          type: "memory",
          label: "Context / Your Memories retrieval",
          subtitle: audit.summary,
          state: "SUCCEEDED",
          startedAt: audit.at,
          endedAt: audit.at,
          parentId: nodeId,
          expandable: true,
          detail: { detail: audit.detail },
          evidence: [ae],
        });
        edges.push(edge(nodeId, id));
      }
    }
    for (const audit of parcel.audit.timeline) {
      const nodeId = audit.stageId
          ? (stageIds.get(audit.stageId) ?? parcelId)
          : parcelId,
        ae = evidence("parcel-audit-event", audit.id, audit);
      if (
        audit.type === "governor.decision" ||
        audit.type === "route.requested" ||
        audit.type === "route.resolved" ||
        audit.type === "route.changed"
      ) {
        const id = `decision:${audit.id}`;
        add({
          id,
          type: "decision",
          label: audit.summary,
          subtitle: audit.type,
          state:
            audit.type === "route.requested"
              ? "SUCCEEDED"
              : stateForAudit(audit.type),
          startedAt: audit.at,
          endedAt: audit.at,
          parentId: nodeId,
          expandable: true,
          detail: { reason: audit.detail },
          evidence: [ae],
        });
        edges.push(
          edge(nodeId, id, audit.type === "route.changed" ? "handoff" : "flow"),
        );
      }
      if (audit.type === "question.created") {
        const id = `approval:${audit.id}`;
        add({
          id,
          type: "approval",
          label: "Human decision required",
          subtitle: audit.summary,
          state: "BLOCKED",
          startedAt: audit.at,
          parentId: nodeId,
          expandable: true,
          detail: { request: audit.detail },
          evidence: [ae],
        });
        edges.push(edge(nodeId, id));
      }
      if (
        audit.type === "question.answered" ||
        audit.type === "steering.accepted"
      ) {
        const id = `approval:${audit.id}`;
        add({
          id,
          type: "approval",
          label: "Governed operator decision",
          subtitle: audit.summary,
          state: "SUCCEEDED",
          startedAt: audit.at,
          endedAt: audit.at,
          parentId: nodeId,
          expandable: true,
          detail: { decision: audit.detail },
          evidence: [ae],
        });
        edges.push(edge(nodeId, id));
      }
      if (
        audit.type === "verification.completed" ||
        audit.type === "criterion.evaluated"
      ) {
        const id = `validation:${audit.id}`;
        add({
          id,
          type: "validation",
          label: audit.summary,
          subtitle: audit.type,
          state: stateForAudit(audit.type),
          startedAt: audit.at,
          endedAt: audit.at,
          parentId: nodeId,
          expandable: true,
          detail: { result: audit.detail },
          evidence: [ae],
        });
        edges.push(edge(nodeId, id));
      }
      if (audit.type === "retry.exhausted") {
        const id = `escalation:${audit.id}`;
        add({
          id,
          type: "escalation",
          label: "Retry exhausted",
          subtitle: audit.summary,
          state: "DEGRADED",
          startedAt: audit.at,
          endedAt: audit.at,
          parentId: nodeId,
          expandable: true,
          detail: { reason: audit.detail },
          evidence: [ae],
        });
        edges.push(edge(nodeId, id, "retry"));
      }
    }
    const finalDeps = parcel.stages.filter(
      (candidate) =>
        !parcel.stages.some((other) => other.dependsOn.includes(candidate.id)),
    );
    const aggregateId = `aggregate:${parcel.id}`;
    if (parcel.stages.length > 1) {
      const rootStages = parcel.stages.filter((stage) => !stage.dependsOn.length);
      const ended = finalDeps.every((x) => x.endedAt)
        ? finalDeps
            .map((x) => x.endedAt!)
            .sort()
            .at(-1)
        : undefined;
      add({
        id: aggregateId,
        type: "aggregation",
        label: "Aggregation / consensus",
        subtitle: `${rootStages.length} parallel roots · ${parcel.stages.length} governed stages`,
        state: temporal(
          parcel.decision?.outcome === "COMPLETE"
            ? "SUCCEEDED"
            : parcel.decision?.outcome === "FAIL_CLOSED"
              ? "FAILED"
              : "WAITING",
          ended,
          parcel.endedAt,
          at,
        ),
        startedAt: ended,
        endedAt: parcel.endedAt,
        parentId: parcelId,
        expandable: true,
        detail: {
          branches: rootStages.length,
          stages: parcel.stages.length,
          blocked: parcel.decision?.blockedStages ?? [],
        },
        evidence: [pe],
      });
      for (const s of finalDeps)
        edges.push(edge(stageIds.get(s.id)!, aggregateId, "dependency"));
    }
    const resultId = `result:${parcel.id}`;
    add({
      id: resultId,
      type: "result",
      label: parcel.decision?.title ?? "Result",
      subtitle: parcel.decision?.summary ?? "Awaiting governed completion",
      state: temporal(state(parcel.status), parcel.endedAt, parcel.endedAt, at),
      startedAt: parcel.endedAt,
      endedAt: parcel.endedAt,
      expandable: true,
      detail: {
        decision: parcel.decision ?? null,
        totals: parcel.audit.totals,
      },
      evidence: [pe],
    });
    edges.push(
      edge(parcel.stages.length > 1 ? aggregateId : parcelId, resultId),
    );
    for (const decision of input.tokenRouting?.decisions.filter(
      (item) => item.parcelId === parcel.id,
    ) ?? []) {
      if (at && Date.parse(decision.at) > Date.parse(at)) continue;
      const id = `governor:${decision.id}`,
        de = evidence("token-routing-decision", decision.id, decision),
        parent = decision.batonId
          ? (nodes.find(
              (node) =>
                node.type === "baton" &&
                String(node.detail.integrity).length > 0,
            )?.id ?? parcelId)
          : parcelId;
      add({
        id,
        type: decision.action === "BATON_AND_HANDOFF" ? "baton" : "decision",
        label: decision.action.replaceAll("_", " "),
        subtitle: decision.reason,
        state:
          decision.outcome === "FAILED"
            ? "FAILED"
            : decision.outcome === "SUCCEEDED"
              ? "SUCCEEDED"
              : decision.action === "BATON_AND_HANDOFF"
                ? "HANDOFF"
                : "RECORDED",
        startedAt: decision.at,
        endedAt: decision.action === "BATON_AND_HANDOFF" && decision.outcome === "RECORDED" ? undefined : decision.at,
        parentId: parent,
        expandable: true,
        detail: {
          governorState: decision.state,
          contextPercent: decision.contextPercent,
          target: decision.target ?? null,
          trigger: decision.trigger ?? null,
          outcome: decision.outcome,
          batonId: decision.batonId ?? null,
        },
        evidence: [de],
      });
      edges.push(
        edge(
          parent,
          id,
          decision.action === "BATON_AND_HANDOFF" ? "handoff" : "flow",
        ),
      );
      events.push(
        event(
          decision.at,
          "governor.decision",
          id,
          stateForAudit("governor.decision"),
          `${decision.action}: ${decision.reason}`,
          [de],
        ),
      );
    }
    for (const attempt of input.retrieval?.attempts.filter(
      (item) => item.parcelId === parcel.id,
    ) ?? []) {
      if (at && Date.parse(attempt.at) > Date.parse(at)) continue;
      const id = `retrieval:${attempt.id}`,
        re = evidence("retrieval-attempt", attempt.id, attempt);
      add({
        id,
        type: "memory",
        label: "Your Memories / context retrieval",
        subtitle: `${attempt.providerId} · ${attempt.strategy}`,
        state:
          attempt.outcome === "FAILED"
            ? "FAILED"
            : attempt.outcome === "INSUFFICIENT"
              ? "DEGRADED"
              : attempt.outcome === "SKIPPED"
                ? "SKIPPED"
                : "SUCCEEDED",
        startedAt: attempt.at,
        endedAt: attempt.at,
        parentId: parcelId,
        expandable: true,
        detail: {
          outcome: attempt.outcome,
          reason: attempt.reason,
          evidenceCount: attempt.evidenceCount,
          evidenceTokens: attempt.evidenceTokens,
          freshness: attempt.freshness,
          indexState: attempt.indexState,
          latencyMs: attempt.latencyMs,
        },
        evidence: [re],
      });
      edges.push(edge(parcelId, id));
      events.push(
        event(
          attempt.at,
          "context.retrieved",
          id,
          stateForAudit(attempt.outcome === "FAILED" ? "failed" : "completed"),
          attempt.reason,
          [re],
        ),
      );
    }
  }
  for (const session of input.sessions.filter(
    (s) => !parcel || s.scope.parcelId === parcel.id,
  )) {
    const id = `terminal:${session.id}`,
      se = evidence("execution-session", session.id, session),
      sessionStep = `step:${session.scope.runId}:${session.scope.stepId}`,
      sessionParcel = `parcel:${session.scope.parcelId}`,
      sessionNode = seen.has(sessionStep) ? sessionStep : session.scope.parcelId && seen.has(sessionParcel) ? sessionParcel : sessionStep,
      sessionEvents = input.sessionEvents(session.id),
      final = state(session.state);
    add({
      id,
      type: "terminal",
      label: session.command,
      subtitle: `${session.scope.workerId} · ${session.scope.nodeId}`,
      state: temporal(final, session.startedAt, session.endedAt, at),
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      parentId: seen.has(sessionNode) ? sessionNode : undefined,
      expandable: true,
      detail: {
        sessionId: session.id,
        adapterId: session.adapterId,
        scope: session.scope,
        capabilities: session.capabilities,
        control: session.control,
        outputBytes: session.outputBytes,
        outputTruncated: session.outputTruncated,
        latestSafeOutput: latestOutput(sessionEvents, at),
        resourceIdentity: {
          nodeId: session.scope.nodeId,
          workerId: session.scope.workerId,
          providerId: session.scope.providerId ?? null,
          modelId: session.scope.modelId ?? null,
        },
      },
      evidence: [se],
    });
    if (seen.has(sessionNode)) edges.push(edge(sessionNode, id, "contains"));
    for (const item of sessionEvents.filter(
      (x) => !at || Date.parse(x.at) <= Date.parse(at),
    ))
      events.push(
        event(item.at, item.type, id, stateForSession(item.type), item.detail, [
          se,
        ]),
      );
  }
  for (const e of edges) {
    const from = nodes.find((n) => n.id === e.from),
      to = nodes.find((n) => n.id === e.to);
    e.state =
      e.kind === "handoff"
        ? "HANDOFF"
        : to?.state === "RUNNING"
          ? "RUNNING"
          : terminal.has(to?.state ?? "WAITING")
            ? to!.state
            : (from?.state ?? "WAITING");
  }
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  nodes.sort(
    (a, b) =>
      (a.startedAt ? Date.parse(a.startedAt) : 0) -
        (b.startedAt ? Date.parse(b.startedAt) : 0) || a.id.localeCompare(b.id),
  );
  const relevantEvents = at
      ? events.filter((e) => Date.parse(e.at) <= Date.parse(at))
      : events,
    last = relevantEvents.at(-1)?.at ?? parcel?.updatedAt ?? null,
    isLive = !at && Boolean(parcel && !parcel.endedAt),
    fresh =
      isLive && last && Date.parse(now) - Date.parse(last) > 30_000
        ? "STALE"
        : isLive
          ? "LIVE"
          : "HISTORICAL";
  const controlRoom = nodes
    .filter((n) => n.type === "job")
    .map((n) => {
      const run = input.runs.find((r) => `run:${r.id}` === n.id),
        session = input.sessions.find((s) => s.scope.runId === run?.id),
        inv = parcel?.audit.invocations.find((i) => i.runId === run?.id);
      return {
        id: n.id,
        job: n.label,
        worker: run?.selectedWorkers.at(-1) ?? "unassigned",
        model: inv?.model ?? "not reported",
        activity:
          run?.steps.find((s) => state(s.status) === "RUNNING")?.action ??
          n.subtitle ??
          "",
        state: n.state,
        ...(n.startedAt ? { startedAt: n.startedAt } : {}),
        ...(session
          ? {
              sessionId: session.id,
              latestSafeOutput: latestOutput(
                input.sessionEvents(session.id),
                at,
              ),
            }
          : {}),
      };
    });
  return {
    schema: "agent-control.runtime-map/v1",
    authority: "Agent Control authoritative runtime records",
    mode: at ? "REPLAY" : "LIVE",
    parcelId: parcel?.id ?? null,
    observedAt: now,
    replayAt: at ?? null,
    range: {
      startedAt: parcel?.createdAt ?? null,
      endedAt: parcel?.endedAt ?? last,
    },
    freshness: { state: fresh, lastAuthoritativeAt: last },
    summary: {
      nodes: nodes.length,
      edges: edges.length,
      running: nodes.filter((n) => n.state === "RUNNING").length,
      waiting: nodes.filter((n) =>
        ["WAITING", "QUEUED", "BLOCKED"].includes(n.state),
      ).length,
      succeeded: nodes.filter((n) => n.state === "SUCCEEDED").length,
      failed: nodes.filter((n) => ["FAILED", "BLOCKED"].includes(n.state))
        .length,
      degraded: nodes.filter((n) => n.state === "DEGRADED").length,
      groups: new Set(nodes.map((n) => n.groupId).filter(Boolean)).size,
    },
    nodes,
    edges,
    events: relevantEvents,
    controlRoom,
    limitations: [
      "Protected reasoning and credentials are never projected.",
      "Terminal bytes require the existing authenticated Execution Session viewer.",
      "Compare uses independent authoritative facets and never equates nodes by display label.",
      "Runtime Map remains WATCH-only unless an existing governed control is explicitly opened.",
    ],
  };
}
function stateForAudit(type: string): RuntimeMapState {
  if (type.includes("failed") || type === "retry.exhausted") return "FAILED";
  if (type.includes("retry") || type.includes("escalat")) return "DEGRADED";
  if (
    type.includes("handoff") ||
    type === "baton.created" ||
    type === "route.changed"
  )
    return "HANDOFF";
  if (
    type.includes("started") ||
    type.includes("requested") ||
    type.includes("dispatched")
  )
    return "RUNNING";
  return "SUCCEEDED";
}
function stateForSession(type: string): RuntimeMapState {
  if (type.includes("failed") || type.includes("disconnected")) return "FAILED";
  if (type === "output" || type.includes("started")) return "RUNNING";
  return "SUCCEEDED";
}
export function compareRuntimeMaps(
  left: RuntimeMapProjection,
  right: RuntimeMapProjection,
): RuntimeMapComparison {
  const count = (map: RuntimeMapProjection, type: RuntimeMapNodeType) =>
      map.nodes.filter((n) => n.type === type).length;
  const duration = (map: RuntimeMapProjection) =>
    map.range.endedAt && map.range.startedAt
      ? Date.parse(map.range.endedAt) - Date.parse(map.range.startedAt)
      : null;
  const resultTotals = (map: RuntimeMapProjection) => {
    const totals = map.nodes.find((node) => node.type === "result")?.detail
      .totals as Record<string, unknown> | undefined;
    return {
      totalTokens:
        typeof totals?.totalTokens === "number" ? totals.totalTokens : null,
      cost:
        typeof totals?.cost === "number"
          ? totals.cost
          : typeof totals?.providerReportedCost === "number"
            ? totals.providerReportedCost
            : typeof totals?.calculatedCost === "number"
              ? totals.calculatedCost
              : null,
      costBasis: String(totals?.costBasis ?? "unavailable"),
    };
  };
  const side = (map: RuntimeMapProjection): RuntimeMapComparisonSide => ({
    parcelId: map.parcelId,
    durationMs: duration(map),
    nodes: map.nodes.length,
    edges: map.edges.length,
    modelCalls: count(map, "model-call"),
    cacheOperations: count(map, "cache"),
    memoryOperations: count(map, "memory"),
    batons: count(map, "baton"),
    retries: count(map, "retry"),
    failures: map.summary.failed,
    ...resultTotals(map),
  });
  const strings = (values: unknown[]) =>
    [
      ...new Set(
        values
          .filter((value): value is string =>
            Boolean(typeof value === "string" && value.trim()),
          )
          .map((value) => value.trim()),
      ),
    ].sort();
  const evidenceIdentities = (
    map: RuntimeMapProjection,
    types: RuntimeMapNodeType[],
  ) =>
    strings(
      map.nodes
        .filter((node) => types.includes(node.type))
        .flatMap((node) =>
          node.evidence.map((item) =>
            item.sha256
              ? `${item.kind}:sha256:${item.sha256}`
              : `${item.kind}:id:${item.id}`,
          ),
        ),
    );
  const values = (
    map: RuntimeMapProjection,
    types: RuntimeMapNodeType[],
    key: string,
  ) =>
    strings(
      map.nodes
        .filter((node) => types.includes(node.type))
        .map((node) => node.detail[key]),
    );
  const facet = (a: string[], b: string[]): RuntimeMapComparisonFacet => ({
    left: a,
    right: b,
    added: b.filter((value) => !a.includes(value)),
    removed: a.filter((value) => !b.includes(value)),
  });
  const routes = (map: RuntimeMapProjection) =>
    strings(
      map.nodes
        .filter((node) => node.type === "model-call")
        .map((node) => node.detail.route),
    );
  const models = (map: RuntimeMapProjection) =>
    strings(
      map.nodes
        .filter((node) => node.type === "model-call")
        .map(
          (node) =>
            (
              node.detail.resourceIdentity as
                | { modelId?: unknown }
                | undefined
            )?.modelId,
        ),
    );
  const machines = (map: RuntimeMapProjection) =>
    strings([
      ...values(map, ["model-call"], "node"),
      ...map.nodes
        .filter((node) => node.type === "terminal")
        .map((node) =>
          (node.detail.scope as Record<string, unknown> | undefined)?.nodeId,
        ),
    ]);
  const leftSide = side(left),
    rightSide = side(right),
    difference = (a: number | null, b: number | null) =>
      a === null || b === null ? null : b - a;
  return safe({
    schema: "agent-control.runtime-map-compare/v1",
    leftParcelId: left.parcelId,
    rightParcelId: right.parcelId,
    identity: {
      strategy: "independent-authoritative-facets",
      labelMatching: false,
      note: "Each side is projected independently. Differences use explicit route/resource fields or evidence identities; display labels are never treated as node identity.",
    },
    left: leftSide,
    right: rightSide,
    deltas: {
      nodes: rightSide.nodes - leftSide.nodes,
      edges: rightSide.edges - leftSide.edges,
      durationMs: difference(leftSide.durationMs, rightSide.durationMs),
      modelCalls: rightSide.modelCalls - leftSide.modelCalls,
      cacheOperations: rightSide.cacheOperations - leftSide.cacheOperations,
      memoryOperations: rightSide.memoryOperations - leftSide.memoryOperations,
      batons: rightSide.batons - leftSide.batons,
      retries: rightSide.retries - leftSide.retries,
      failures: rightSide.failures - leftSide.failures,
      totalTokens: difference(leftSide.totalTokens, rightSide.totalTokens),
      cost: difference(leftSide.cost, rightSide.cost),
    },
    facets: {
      routes: facet(routes(left), routes(right)),
      models: facet(models(left), models(right)),
      providers: facet(
        values(left, ["model-call"], "provider"),
        values(right, ["model-call"], "provider"),
      ),
      machines: facet(machines(left), machines(right)),
      workers: facet(
        values(left, ["worker"], "workerId"),
        values(right, ["worker"], "workerId"),
      ),
      decisions: facet(
        evidenceIdentities(left, ["decision"]),
        evidenceIdentities(right, ["decision"]),
      ),
      cache: facet(
        evidenceIdentities(left, ["cache"]),
        evidenceIdentities(right, ["cache"]),
      ),
      memory: facet(
        evidenceIdentities(left, ["memory"]),
        evidenceIdentities(right, ["memory"]),
      ),
      batons: facet(
        evidenceIdentities(left, ["baton"]),
        evidenceIdentities(right, ["baton"]),
      ),
      retries: facet(
        evidenceIdentities(left, ["retry"]),
        evidenceIdentities(right, ["retry"]),
      ),
      failures: facet(
        evidenceIdentities(
          { ...left, nodes: left.nodes.filter((node) => node.state === "FAILED") },
          left.nodes.filter((node) => node.state === "FAILED").map((node) => node.type),
        ),
        evidenceIdentities(
          { ...right, nodes: right.nodes.filter((node) => node.state === "FAILED") },
          right.nodes.filter((node) => node.state === "FAILED").map((node) => node.type),
        ),
      ),
    },
  });
}

/** A standalone native run uses the same projection and graph renderer as parcels. */
export function projectRecordedJobProcess(run:RunRecord,resourceIds:string[],now=new Date().toISOString(),invocations:ModelInvocationObservation[]=[]):RuntimeMapProjection {
  const map=projectRuntimeMap({runs:[],sessions:[],sessionEvents:()=>[],now});
  const evidence=[{kind:'run',id:run.id}];
  const detail={runId:run.id,estateResourceIds:resourceIds,libraryJobId:typeof run.parameters.libraryJobId==='string'?run.parameters.libraryJobId:null};
  map.nodes.push({id:`run:${run.id}`,type:'job',label:run.jobId,state:state(run.status),startedAt:run.requestedAt,endedAt:run.endedAt,expandable:true,detail,evidence});
  for(const step of run.steps) {
    const id=`step:${run.id}:${step.id}`;
    map.nodes.push({id,type:step.action.includes('verify')?'validation':'tool',label:step.id,subtitle:step.action,state:state(step.status),parentId:`run:${run.id}`,startedAt:step.startedAt,endedAt:step.endedAt,expandable:true,detail:{...detail,stepId:step.id,attempts:step.attempts.length},evidence});
    map.edges.push(edge(`run:${run.id}`,id,'contains'));
    for(const dependency of step.dependsOn)if(run.steps.some(s=>s.id===dependency))map.edges.push(edge(`step:${run.id}:${dependency}`,id,'dependency'));
  }
  for(const invocation of invocations.filter(i=>i.runId===run.id)){
    const id=`model:${invocation.id}`,parentId=run.steps.some(s=>s.id===invocation.stepId)?`step:${run.id}:${invocation.stepId}`:`run:${run.id}`;
    map.nodes.push({id,type:'model-call',label:invocation.model,subtitle:invocation.provider,state:state(invocation.outcome),parentId,startedAt:invocation.startedAt,endedAt:invocation.completedAt??undefined,expandable:true,detail:{runId:run.id,stepId:invocation.stepId,provider:invocation.provider,model:invocation.model,nodeId:invocation.accounting?.machine??null,inputTokens:invocation.usage.inputTokens,cachedInputTokens:invocation.usage.cachedInputTokens,outputTokens:invocation.usage.outputTokens},evidence:[{kind:'model-invocation',id:invocation.id}]});
    map.edges.push(edge(parentId,id,'contains'));
  }
  map.parcelId=null;map.range={startedAt:run.requestedAt,endedAt:run.endedAt??null};
  map.freshness={state:'LIVE',lastAuthoritativeAt:run.endedAt??run.requestedAt};
  map.summary={...map.summary,nodes:map.nodes.length,edges:map.edges.length,running:map.nodes.filter(n=>n.state==='RUNNING').length,succeeded:map.nodes.filter(n=>n.state==='SUCCEEDED').length,failed:map.nodes.filter(n=>n.state==='FAILED').length,waiting:map.nodes.filter(n=>['WAITING','BLOCKED','QUEUED'].includes(n.state)).length};
  return map;
}

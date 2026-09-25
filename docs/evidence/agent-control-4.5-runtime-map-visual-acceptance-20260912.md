# Agent Control 4.5 Runtime Map visual acceptance

Date: 2026-09-12

Branch: `feature/4.5-environment-discovery`

Starting and evidence-bound implementation HEAD: `977d8ace6ec1bafc8bb12beb85cee0ca4b5c411a`

Result: **PASS — RUNTIME MAP VISUALLY AND OPERATIONALLY QUALIFIED**

## Starting state

The worktree and its upstream matched at `977d8ace6ec1bafc8bb12beb85cee0ca4b5c411a`
and were clean before this increment. That commit already contained the Runtime
Map implementation (`74a70ec`), its first physical evidence (`fe9d87a`) and the
later Environment Discovery/Estate Map integration. This increment therefore
extended the combined branch; it did not return to or replace it with the older
Runtime Map branch.

## Corrective work

- Added leader-level process KPIs and made the six parallel roots distinct from
  the eight total governed stages.
- Kept aggregation waiting until its real dependencies and final decision
  complete. The prior projection could render an `IN_PROGRESS` decision as
  successful aggregation.
- Added progressive job/worker/step/session inspection, elapsed Control Room
  state, Replay play/pause and exact Process Map ↔ Estate Map navigation.
- Implemented graphical Compare over two independently projected executions.
  Explicit route/evidence facets are compared; display labels are never used as
  identity.
- Fixed a dashboard-ingress race by writing request origin and final parcel
  attribution in the initial durable acceptance record before asynchronous
  planning can update the parcel.
- Removed a qualification-discovered vendor-name check from Environment
  Discovery. Private transport classification now uses the existing generic
  `transport.secure-overlay` capability or a generic private-overlay label.
- Kept Runtime Map WATCH-only. No node-scoped adapter currently delegates map
  actions into the existing permission, confirmation and audit APIs, so adding
  pause/cancel/retry/approval buttons here would have created a second authority
  path.

## Genuine six-job execution

Work Parcel: `parcel-b2b5de60-1410-4289-a739-db2aefce4dc0`

Comparison baseline: `parcel-47169a22-65d3-434a-be92-5bcbf31301da`

The dashboard operator typed one natural-language request. Its registered plan
created six independent root Jobs and two dependent stages:

1. real local model assessment;
2. Git object-connectivity inspection;
3. focused Runtime Map tests;
4. Estate Map and Environment Discovery tests;
5. TypeScript, dashboard syntax and web-integration validation;
6. controlled transient retry and recovery;
7. evidence aggregation after all six roots;
8. independent verification after aggregation.

All six roots were simultaneously `RUNNING`; the measured six-way overlap was
4,606 ms. All eight stages succeeded. The retry branch failed once with a
controlled retryable transport classification, entered degraded/retry state,
then recovered. Aggregation and the independent verifier completed only after
their dependencies.

The real provider leg used controller-loopback llama.cpp with
`Qwen2.5-Coder-3B-Instruct-Q4_K_M.gguf` through model identity
`qwen2.5-coder-3b-runtime-map`. Provider-reported usage was 68 input tokens,
67 cached input tokens, 1 fresh input token, 28 output tokens and 96 total
tokens. Monetary cost remained `unavailable`; no zero-cost claim was made.

## Visual and operational verdicts

| Gate | Verdict | Evidence |
| --- | --- | --- |
| Six-job fan-out/fan-in | PASS | 6 concurrent root Jobs, 71 nodes, 75 edges, 75 events |
| Runtime state and animation | PASS | independent running transitions plus retry/degraded and terminal states; reduced-motion CSS retained |
| Progressive drill-down | PASS | Process Map → Job → Worker → Step → real terminal/session → evidence |
| Live terminal | PASS | authenticated WATCH attachment; real output advanced from TypeScript to dashboard syntax to web tests while the Job remained live |
| Control Room | PASS | six real adaptive tiles with worker, model authority, activity, elapsed state and safe output |
| Morrow/POE | PASS | grounded runtime-map evidence reported operation, wait, model, baton and transition counts |
| Replay | PASS | timestamp-bounded state reconstruction showed fan-out and historical terminal evidence |
| Compare | PASS | distinct baseline/candidate graphs and explicit identity-facet differences |
| Estate continuity | PASS | terminal worker identity resolved to configured Estate agent `controller`; inverse current-work action was present |
| Viewer disconnect | PASS | an aborted map refresh did not affect execution; a later event reconciled the view |
| Governed map actions | WATCH-ONLY | control remains in existing governed APIs; no ungoverned action was added |

## Measured overhead

- Projection: 100 samples, 13.644 ms average and 19.457 ms p95.
- Projection CPU: 1,410.787 ms user plus 31.248 ms system over those 100
  calls. This is the Agent Control controller process only; browser, model and
  subprocess CPU are excluded.
- Bounded SSE event-latency sample: 114 ms.
- Browser two-frame timing: 36.8 ms in the qualification browser.
- Authoritative event rate during the parcel: 2.508 events/second.
- Controller RSS changed by 283,332,608 bytes over the whole isolated
  qualification. This includes runtime state, evidence and orchestration and is
  not attributed solely to the graph projection.
- The deterministic suite retains a 55-job/nested projection test with a
  250 ms upper bound.

These measurements describe this controller and run; they are not universal
performance claims.

## Evidence

- [Machine report](../evidence-archive.md)
- [Complete human-readable transcript](../evidence-archive.md)
- [Evidence manifest](../evidence-archive.md)
- [HD H.264 video](../evidence-archive.md) — 1920×1080, 25 fps, 59.76 s, SHA-256 `8b193460d5dc0240f9a863f48f96d22aed914ba2c565526faffaf99d437ad628`
- Screenshots in the same qualification directory cover six running Jobs,
  Control Room, live terminal, Estate cross-link, grounded POE, completion,
  Replay and graphical Compare.

## Validation

- Complete regression: **1,222/1,222 passed**.
- TypeScript, bootstrap syntax, dashboard syntax, infrastructure neutrality
  (3/3) and implementation-status projection (59 entries): **PASS**.
- Focused Environment Discovery regression after the neutral transport fix:
  **11/11 passed**.
- Local Markdown links, evidence-manifest hashes, recording metadata,
  secret-safe evidence scan and `git diff --check`: **PASS**.

No merge, tag, release or deployment is authorized by this evidence.

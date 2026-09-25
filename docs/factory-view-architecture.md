# Factory View architecture audit

Audit baseline: Agent Control `cb7bd58030c1ba3fe6f38d075607342837ab7f25` (4.12.1); Agent Control Lab `06051acd2583dfbde404d26b75adf673523d91ed`. Implementation branch: `feature/factory-view-20260921`. Neither repository contained applicable AGENTS.md instructions. The canonical checkout and existing release worktrees are preserved.

## Existing authority and mapping

| Concern | Existing source | Factory representation |
|---|---|---|
| Board, priorities, queue, dynamic lanes | `WorkBoardRuntime`, `PlannedWorkItem`, scheduler decisions; `ControlPlane` lanes | Namespaced lane bays and planned-work pallets, linked to run IDs |
| Jobs, attempts, worker assignment, retries, verification | `JobRuntime`, `RunLedger`, `RunRecord`, `WorkerRegistry` | Run pallets, work cells, exact step state and required/passed/failed checks |
| Models/providers, routing | `ModelRegistry`, run modelRoute, Work Parcel stage actualRoute | Resource stations and recorded route reasons; no provider preference |
| Baton/state transfer | `ParcelContextState.batonViews`, stage context and context event hash chain | Capsules with stage endpoints, digest, timestamp, event references; no inferred transfer |
| Cache/context/tokens | `HarnessEfficiencyLedger`, attested `UsageAccounting`, canonical `projectInvocation`, cache evidence | Per-run quantities and context-store connections; null remains unavailable; estimates remain labelled |
| CPU/GPU, RAM/VRAM | Invocation `ExecutionResourceSummary`, energy ledger | Attributed measured execution values, separate from hardware capacity |
| Quarantine/kill/escalation | `ContainmentSupervisor`, `KillRecord`, recovery events, schedulingEligibility; runtime safety | Isolated area and exact stop/recovery state; request is not confirmed termination |
| Skills/LoRA | `SkillLearningRuntime`, `SkillAdapterRecord`, skill routing decisions | Adapter library, qualification, base model and digest; no claim of permanent learning |
| Experiments/evaluations | Model intelligence and model-improvement projections | Links to the existing operational views; no independent promotion policy |
| Evidence | `ArtifactStore`, artifact metadata SHA-256, run provenance | Warehouse packages opening existing protected artifact viewer |
| Activity and provenance | `ControlEventBus` (250 recent events), durable run events, `ActivityLogProjection`, parcel context events | Captions sourced from real events, explicit source IDs and capture times |
| External anchor | No universal signed external-anchor status in these source records | UNAVAILABLE; a local hash is not an independent signature or anchor |
| Video Evidence Mode | Existing Playwright/FFmpeg recording scripts and UX-session recorder; no general Factory/video toggle | Opt-in browser recording of this canvas plus replay sidecar; no synthetic workload |

The Lab is a Node/ESM catalogue, manifests, qualification records and CLI repository with no live renderer stack. Agent Control is vanilla browser JavaScript/CSS with a Node HTTP server, authenticated read APIs and fetch-based SSE. Factory belongs in Agent Control; Lab readiness remains advisory.

## Technology decision

Plain [Three.js](https://github.com/mrdoob/three.js) is lazy-loaded, pinned and served locally. [React Three Fiber](https://github.com/pmndrs/react-three-fiber) requires React, absent in this application. [Babylon.js](https://doc.babylonjs.com/setup/frameworkPackages/es6Support/) is viable but its wider engine surface is unnecessary for boxes, labels, lines, camera and picking. There are no remote CDN requests, textures, game engine, new orchestrator or graphics dependencies in core execution.

## Data path and performance boundary

Authoritative runtime records -> pure renderer-independent projection -> bounded visual frame journal -> authenticated SSE -> 3D or accessible 2D client. A frame contains replacement state, source events and source IDs, making reconnect and dropped frames safe. Periodic sampling runs only with a connected viewer. The runtime never awaits rendering, browser capture or video encoding. Factory installs no synchronous runtime event listener; projection runs on a timer outside execution callbacks. This is asynchronous scheduling in the existing server process, not process isolation; measure its cost.

The view does not change scheduler state. Existing inspectors and protected artifact readers retain authority. Payloads omit prompts, outputs, filesystem paths and credentials and pass through existing redaction. The server can disable Factory completely. Leaving the view disposes WebGL resources and disconnects its stream.

## Time and evidence semantics

LIVE is observed state; PAUSED freezes a displayed frame, not execution; REPLAY uses recorded replacement frames without rerunning jobs. Capture coverage begins when the first viewer connects and is bounded by both bytes and frame count. Older lost frames, omitted entities, event overflow and restart/reconnect gaps are explicit. Sampling may coalesce intermediate states, so physical interpolation does not establish exact duration or paths between unobserved states. Durable source details remain available in ordinary Agent Control views.

Video Evidence Mode captures only actual canvas frames with timestamp, mode, runtime counts and real-event captions. Browser support and active-view requirements are explicit. This video is visual evidence, not a signed ledger anchor. The replay sidecar retains source-linked frames independently of video encoding.

## Operation and limits

Open **Factory** in the primary dashboard navigation. The authenticated operator may inspect objects, filter dynamic lanes, model or provider, change camera, pause, replay and export recorded observations. Buttons open existing Run, Board, Model, Usage and protected Evidence inspectors. No new mutation or destructive control is introduced. Enable **Video Evidence Mode** before starting real work; the active visible view records up to 90 seconds, 240 sampled frames or approximately 32 MiB and offers WebM plus a replay sidecar. The view must stay visible to record. Hiding it suspends observation and stops capture. Imports are labelled **IMPORTED CAPTURE**, are untrusted visual records and cannot modify runtime state.

Set `AGENT_CONTROL_FACTORY_VIEW=off` or `WebServerOptions.factoryEnabled=false` to disable server observation and return 404 from Factory endpoints. The browser checks availability before loading the renderer. **Factory off** disposes graphics and the SSE connection; **On** restores them. A 2D canvas and keyboard-accessible entity list remain available when WebGL fails. Reduced Motion removes positional interpolation and Low Detail caps painting at 10 FPS. The normal paint cap is 30 FPS; video capture requests 15 FPS and reflects actual canvas changes.

The journal retains at most 240 replacement frames or 8 MiB per server, and each viewer has the same independent bound. The projection displays at most 600 entities, 100 runs (active first), 1,000 invocation observations, 100 artifacts and 100 recent captions. It does not reconstruct arbitrary old runs from durable ledgers. At the default 750 ms sampling interval, very short actions can occur between snapshots. Source-event captions retain their original timestamps/IDs but visual motion is interpolation between observed positions, not a timing measurement. Boundaries and omissions are displayed.

Important remaining qualification boundaries:

- Shared-process sampling is bounded at the projection/output layer but reading and cloning existing ledgers still scales with their retained size. Large-history and multi-client soak measurements are required before broad release. This implementation does not prove a universal execution-overhead bound.
- Generic provider adapters can report cached token counts without attested partition semantics. Cache stores then show **REUSE_REPORTED**, while fresh tokens and cache percentage remain **UNAVAILABLE**. Cache reuse is not automatically a saving or a better outcome. TTFT, decode rate and resource accounting require explicit existing canonical telemetry; raw qualification transport timings do not silently become canonical metrics.
- Skill selection/version/base/digest/qualification and route relationships are projected. The available skill-routing record does not attest adapter loading into a specific live worker, so `loadReceipt=UNAVAILABLE`; no load animation or permanent-learning claim is made. Training token count and signed external anchor also remain unavailable where absent.
- Experimental/evaluation state stays in existing Models/Specialists views. Factory has no independent experiment controller, evaluator or promotion policy. Recorded worker/model kill and quarantine signals are tested in translation; this feature qualification does not repeat destructive physical containment tests.
- Camera and entity placement are functional and source-linked; dense scenes may suppress overlapping labels. The full keyboard entity list and inspectors retain access. Software WebGL and one Chromium build are browser-qualified; physical modest-device GPU performance and other browser encoders need further testing.
- Captures are unsigned, local evidence. Source references and hashes enable review but are not independent authentication. Recording is active-view-only and stops at a cap; it is not a background recorder or permanent archive.

Run the read-only source-audit qualification with `FACTORY_EVIDENCE_DIR=/an/external/evidence/directory node --import tsx scripts/qualify-factory-view.ts`. It requires two existing loopback OpenAI-compatible local model endpoints (default ports 8080 and 8081), Chromium and the repository's Playwright dependency. It starts a temporary authenticated localhost dashboard and three real in-process runtime workers (two model workers and an independent verifier), uses the existing governed execution authority/tool gateway, and leaves external evidence. It does not restart model services, modify source files, promote models or deploy Agent Control. The exact source commit, clean-tree status, source digests, provider usage, workload outcome and browser/performance results are retained. Model errors remain failed workload results even when all visual assertions pass.

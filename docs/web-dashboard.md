# Agent Control 4.3 web dashboard

The web dashboard is an operator interface over `AgentControlService`. It is not a web scheduler and does not own lane, lease, PTY, verification or provider state.

The default **Jobs** area contains four separate platform views: **Job Definitions**, **Saved Jobs**, **Schedules**, and **Runs**. These sit alongside the existing catalog/Run-ledger projection rather than replacing its Action/DAG workflows. **Lanes** retains the interactive multi-agent control room. **Sessions** projects persistent Actor, participant, delegation, ACP, contract/PTY, handoff, model/runtime, Live Shell and evidence identity. **Systems** shows canonical configured inventory plus ACP transport and lifecycle-recipe readiness. **Models** shows the canonical provider-neutral model registry and immutable lifecycle state. **Routing** shows the evidence-conditioned Model Capability League, Workflow League and persisted per-Work-Parcel Decision Tree. **Warm Cache Runtime** explains temporary cache-aware route expertise and routing decisions in real time. **Crew** shows the same operational state through navigable characters plus an isolated simulated inspection gallery. **POE** is the authenticated conversational/evidence and benchmark-proposal workspace; it is not a generic chat executor. **Configuration** provides authenticated, validated inventory and fast-execution/adaptive/cache-routing policy editing. No view parses terminal text for Run state.

## POE workspace

POE answers from focused `AgentControlService` records and states when evidence is unavailable. Contextual **Ask POE about this** controls on native model, Job, Run, Work Parcel, lane, Crew, routing, baton, and Live Shell views pass a typed stable reference rather than copying the whole page. POE may explain a governor or verification record but cannot change it.

The character's state and animation reflect the durable conversation lifecycle. `THINKING` appears only while a configured Model Registry response route is active; without one, the turn uses the labelled deterministic grounded renderer. A model-generated turn shows its provider/account/model/node and token/cost authority. The dashboard never labels unavailable usage or cost as zero and never claims a fallback model was used when it was not.

Benchmark drafts are editable and harmless. Freeze seals the exact revision and fairness conditions; **Approve & submit Work Parcel** presents a separate confirmation and calls the existing governed Work Parcel API. The submitted Parcel retains the POE conversation, proposal, frozen hash, and request identity. Use the transcript control for a human-readable conversation projection; the complete execution record remains under the resulting Run and Work Parcel. See [`poe.md`](poe.md).

## Warm Cache Runtime

Open **Warm Cache Runtime** to inspect the runtime Cache Expert Registry, current Work Parcel flow and durable routing decisions. The headline cards show active warm routes, current-parcel reused/processed prompt tokens and observed independent-verification rate. The default timeline renders real stages, invocations, wait/queue state, baton boundaries, warm/cold results, invalidation and governed route changes. Switch to **Heatmap**, **Utilization** or **Compatibility** for recorded warmth history, measured lane/process use or evaluated cross-route relationships. Records with no reliable cache evidence show `CACHE STATE UNKNOWN`; missing pricing shows `MONETARY SAVING UNAVAILABLE`.

The Warm Experts table identifies worker/crew route, provider/account/model/node, session/cache/backend scope, lifecycle and age, actual reused and processed tokens, evidence authority and current compatibility/score. Candidate Routes exposes every candidate’s governed eligibility, `EXACT`/`HIGH`/`PARTIAL`/`INCOMPATIBLE`/`UNKNOWN` compatibility, base/cache/load/total score, estimated context delta and selected route. Route Explanation displays the complete natural operational record from the same durable decision—not a generated summary and not private model reasoning. Cross-lane Visibility permits no global-cache implication: it labels exact same-session scope, evaluated compatible reuse, invalidation and unknown relationships independently. Work Parcel SSE events trigger a fresh projection during execution; periodic reconciliation protects against a missed event.

Use **Configuration → Warm Experts** to edit the validated policy. Changes require a controller restart. `allowDerivedPreference` is false by default; enable it only for a separately qualified backend instrumentation path. See [Cache-Aware Expert Delegation](cache-aware-expert-delegation.md).

## Parameterised Jobs

Open **Job Definitions** to inspect reusable, versioned contracts. Select **Repository Code Review** to create a Saved Job; the dashboard generates node, repository, ref, scope and comparison controls from the definition schema and adds routing, context, budgets, concurrency and schedule policy. It never asks for provider credentials.

**Saved Jobs** lists configured instances and provides authenticated **Run now**, enable and disable controls. Manual and scheduled starts both enter `ParameterizedJobEngine.createRun`; the browser is not an executor or scheduler. **Schedules** shows persistent one-time or cron policy, timezone, missed-run behavior and next occurrence. **Runs** shows immutable lifecycle, frozen repository SHA/comparison SHA, route, Work Parcels, usage/cost, findings, evidence, retries, fallback and errors.

Selecting a Run opens its **Execution history**. This is a chronological, human-readable projection of the same durable Run, associated Work Parcels, token/governor evidence and sealed batons. Cards distinguish `OPERATOR`, `SYSTEM EVENT`, `AGENT / PROVIDER`, `TOOL / ACTION`, `GOVERNOR`, `BATON` and `ERROR`; they show safe route identity, current-context authority, lifetime usage, cost authority and evidence references where available. The Lane Activity view provides the corresponding lane-local projection. See [`execution-history.md`](execution-history.md).

History terminology is deliberately strict. `HANDOFF_RECOMMENDED` means the governor crossed a threshold but retained the current route. `HANDOFF_REQUESTED` is not proof that a destination accepted or ran. Only a durable successful routing outcome becomes `HANDOFF_COMPLETED`; a failed outcome records source recovery. Likewise, a created baton is a sealed checkpoint, not proof of a completed handoff. Codex exec completion usage is cumulative and is not displayed as current context; Codex context remains unavailable unless a distinct usable signal is emitted. Other explicitly estimated adapter values can be clamped at 100%, but are never described as authoritative provider occupancy.

The headless Agent Control process owns schedule polling. Closing the dashboard, logging out, or not having Codex installed does not stop a due parameterised Job. Full setup and operator examples are in [`jobs/README.md`](jobs/README.md).

## Resilient Run state (3.9)

Run cards now render the durable lifecycle reason and observation source instead of collapsing every nonterminal state into “running.” `AUTHENTICATION_BLOCKED`, `RECONNECTING`, `CANCELLING`, `CLEANUP_UNCERTAIN` and `DISCONNECTED` are distinct. A retry card shows `nextAttemptAt`, `recoveryDeadlineAt` and the remaining retry budget only when those timestamps/budgets actually exist. A locally advancing countdown is display convenience between those fixed timestamps; it does not change scheduler state.

Cancellation remains pending until the execution adapter returns cleanup evidence. The dashboard shows cleanup outcome, reason, requested/verified times, platform and the number of captured process identities. It intentionally does not expose process output or platform command text. `confirmed` permits a terminal cancellation; `uncertain`, `identity-mismatch` or `failed` leaves the Run fenced for reconciliation. Do not interpret a sent TERM/KILL request as completion.

The first page load and every SSE reconnect fetch a complete authoritative snapshot before applying later events. Reloading during provider work, a queue wait or cancellation therefore reconstructs the same Run, execution ID, retry state, Work Parcel and token totals; the browser never creates a replacement Run or infers terminal state from a missing event. Measurement cards show source, authority and freshness. Unavailable values are `unknown`, and stale values retain their observation time instead of becoming current.

Governed Job step detail also shows semantic protected-resource effects and operation truth when present. `PROPOSED` means the effect was resolved but not executed; `EXTERNALLY_COMMITTED` requires successful execution or independent remote-state reconciliation; `COMMIT_STATE_UNCERTAIN` is deliberately not displayed as success or clean cancellation. Runtime-safety decisions and Run-ledger transitions arrive over the existing SSE stream. The browser cannot edit the resolved effect or protected policy. See [protected-resource governance](protected-resource-governance.md).

## Adaptive routing and the Decision Tree

Open **Routing** to inspect the same canonical adaptive records used by the runtime and reports. The **Model Capability League** is conditioned by task class and capability; it shows verified sample count, quality, reliability, confidence, latency, token/cost measurements, cache efficiency, evidence age/trend and the separate `BENCHMARK`, `QUALIFICATION` and `PRODUCTION_WORK_PARCEL` counts. The **Workflow League** reports the corresponding evidence for complete orchestration strategies. Sparse or stale evidence is labelled rather than presented as a global ranking.

Select a Work Parcel's **Open routing decision tree** control, or select a decision in the Routing view. Each node is selectable and expands timestamp, parent node, stage, operational facts, candidate eligibility, league measurements, policy, reason and resulting action. The record includes rejected candidates and route transitions, but never private model chain-of-thought. A human-readable operational report is rendered from the same persisted decision record, so a report cannot silently change when current league scores change.

The adaptive policy is conservative and controlled through configuration. It is enabled by default when the adaptive runtime is attached; sparse evidence retains the declared registry order, and adaptive selection never bypasses qualification, placement or verification. Defaults are `minimumSamplesForPreference: 3`, `minimumQualityScore: 0.7`, `policyQualityFloor: 0.6`, `maxEvidenceAgeDays: 90`, no cost/latency ceiling, quality/reliability/cost/latency/confidence weights `0.5/0.2/0.15/0.1/0.05`, and `explorationRate: 0.1`. Set `enabled: false` to retain normal registry routing while still recording that adaptive selection was excluded. Cost values are labelled `authoritative`, `estimated` or `unavailable`; absent provider measurements are never rendered as zero. See [`adaptive-multi-model-orchestration.md`](adaptive-multi-model-orchestration.md) for configuration and qualification details.

## Start

`npm start` starts the TUI and the embedded dashboard on `http://127.0.0.1:4310`. `npm run web` runs the same control service and dashboard without Blessed for a headless operator host. Run one authoritative control-plane process per state directory. Set `AGENT_CONTROL_WEB_ENABLED=0` to disable the embedded dashboard or `AGENT_CONTROL_WEB_PORT` to select another port.

Without `AGENT_CONTROL_WEB_OPERATOR_TOKEN`, all mutation requests return `503 operator_auth_not_configured`; observation still works. To enable operator requests for one process:

```bash
export AGENT_CONTROL_WEB_OPERATOR_TOKEN="$(openssl rand -hex 32)"
npm start
```

Select **Observer mode** in the browser and enter the token. It remains in tab-scoped session storage and is sent as `Authorization: Bearer ...`. The server does not issue an authority cookie.

## Operational Crew

Six role-specific cards appear beside their engineering areas and together under **Crew**: Cadence (controller/dispatcher), Quill (Work Parcel reviewer), Relay (tool/execution worker), Lumen (model router/scout), Rook (resource/node guardian) and Verity (verification/evidence inspector). `characterCrew` in `GET /api/status` explicitly separates authoritative operational state, source-backed activity and a presentation-only animation expression. Each card exposes state, current activity/tool, source reason, concurrent counts, elapsed/update age, next action and instrumentation limits.

The Crew view is Level 1 immediate understanding. Activating a card or real baton opens Level 2 deterministic human explanation, including the source event and exact handoff reason. Its Level 3 action focuses the existing Lanes, task entry, Work Parcels, Models, Systems or Run evidence. The Crew never performs an operational command and does not replace transcripts, token/cache telemetry, routing or evidence.

Real Work Parcels show their stage DAG, selected workers/routes, classified tools and one mini worker per actually `RUNNING` stage. Baton movement is accepted only from durable token-routing, Parcel-baton or lane-handoff records. Typed provider/model events preserve limited/failure/HTTP/routing-eligibility data; completion of discovery or evaluation is not displayed as qualification unless the registry says so.

The settings select Shown/Hidden and Full/Reduced/Off motion. Defaults are Shown and Full; operating-system reduced-motion caps Full at Reduced. Fresh idle workers look around, sustained-idle workers sleep, and only a new authoritative activity wakes a sleeper. These bounded, staggered expressions never alter the `IDLE` operational state. Choices are browser-local, hidden/off-screen/background animation pauses, and narrow layouts use a horizontally scrollable worker strip. The gallery is prominently labelled `SIMULATED` and cannot create work or enter real qualification evidence. Exact source mappings, accessibility behavior, isolation and qualification commands are in [`dashboard-characters.md`](dashboard-characters.md).

The Crew's **Activity Matrix** coalesces canonical state and retained typed events into nine inspectable controller, queue, execution-lane, tool, model-request, model-response, baton/escalation, verification and node-health indicators. Activate any labelled shape to inspect source, event/time, lane, provider/model, meaning, persistence and stale/disconnected behavior. It never generates random traffic. Its slow decorative heartbeat is explicitly labelled `NOT WORK ACTIVITY`; reduced motion removes pulses and background/hidden views pause them.

The compact **Live usage** strip stays mounted while switching among all main views. Select a token thread or lane to keep its provider/account/model, state, elapsed time, context authority, fresh/cache/input/output totals, cost authority, governor thresholds and additive Work Parcel model chain in view. It renders replacement snapshots from the normal status/SSE path, so navigation and reconnect do not reset or double-count. `Unavailable` means the adapter did not provide the value; it never means zero.

## Live Shell

The Sessions view can open the retained output of a genuine owned process. Mode buttons come only from durable execution-session capabilities: WATCH is read-only; INTERVENE requires operator authority plus real adapter input/signal support; TAKE CONTROL additionally requires a persistent contract-linked session, exclusive writer fencing and reconciliation before autonomous return. Input content is never placed in the event stream.

Protected-resource Actions show `WATCH_ONLY`. The server suppresses and independently rejects intervention capabilities for that scope, so the browser cannot use a PTY to bypass semantic effect policy. A disconnected or identity-unproven session does not accept attachment. See [governed Live Shell](live-shell.md).

## Configure systems and models

1. Configure `AGENT_CONTROL_WEB_OPERATOR_TOKEN`, start Agent Control and authenticate using the top-right operator button.
2. Open **Configuration**.
3. Select an existing entry, or choose **Add machine**, **Add provider**, **Add model**, **Add service**, **Fast execution**, **Adaptive routing**, or **Warm Experts**.
4. Edit the validated JSON and choose **Save configuration**.
5. Provider and model changes hot-reload. Machine, service, Fast execution and Adaptive routing changes require a restart; follow the dashboard's `restartRequired` result.
6. Open **Systems** and verify the entry. An unprobed configured system is expected to show `UNKNOWN`; an unreachable observed system shows `OFFLINE`; a provider or service with a missing credential reference shows `AUTH REQUIRED`.

Machines use the same resource schema described in the main configuration model. A provider or external service that requires an API key must use an indirect environment, referenced-file or `provider-secure-store` reference. Services retain the environment form, for example:

```json
{
  "id": "example-service",
  "name": "Example external service",
  "requiresAuth": true,
  "credentialEnv": "EXAMPLE_SERVICE_API_KEY"
}
```

Set a service's referenced environment variable in the Agent Control process environment before restarting. For an API provider configured with `provider-secure-store`, use `agent-control providers credential set PROVIDER_ID`; the dashboard never accepts the value. Never paste a secret into configuration: plaintext passwords, API keys, tokens and secret fields are rejected. The editor does not create credentials, test arbitrary endpoints or grant capabilities. A saved machine/provider/service becomes inventory; execution still requires qualified capabilities, current readiness and normal scheduler policy.

## API contract

Read projections:

- `GET /api/status`
- `GET /api/configuration` (operator authenticated; returns validated configuration and revision, never credential values)
- `GET /api/lanes`
- `GET /api/lanes/:id`
- `GET /api/lanes/:id/router`
- `GET /api/providers`
- `GET /api/models/providers`, `GET /api/models`, `GET /api/models/:id`, `GET /api/models/routes`
- `GET /api/sessions`, `GET /api/sessions/:id`
- `GET /api/context-transfers`, `GET /api/delegations`
- `GET /api/fast-execution-attempts`
- `GET /api/runtime` (redacted ACP transport/session, contract/PTY, handoff and provider-lifecycle projection)
- `GET /api/executions`, `GET /api/executions/:runId`
- `GET /api/router`
- `GET /api/evidence`
- `GET /api/events` (SSE)
- `GET /api/poe`, `GET /api/poe/conversations/:id`, and `GET /api/poe/conversations/:id/transcript` (operator authenticated)
- `GET /api/jobs`, `GET /api/jobs/:id`, `GET /api/jobs/:id/runs`
- `GET /api/schedules`, `GET /api/runs`, `GET /api/runs/:id`
- `GET /api/job-definitions`, `GET /api/job-definitions/:id`
- `GET /api/saved-jobs`, `GET /api/saved-jobs/:id`, `GET /api/saved-jobs/:id/export`
- `GET /api/job-schedules`
- `GET /api/job-runs`, `GET /api/job-runs/:id`
- `GET /api/queue`, `GET /api/workers`, `GET /api/resources`
- `GET /api/nodes` (managed-node heartbeat, inventory, workload and maintenance projection)
- `GET /api/artifacts/:id` (metadata and checksum, not secret content)
- `GET /api/command-output` (safe handle metadata; no managed storage path or command content)
- `GET /api/command-output/metrics` (bytes, estimated tokens, expansions and context tokens avoided)
- `GET /api/efficiency` (profile/model/provider/lane aggregates and cost per verified outcome)
- `GET /api/efficiency/invocations` (prompt-free invocation metadata, usage composition and verifier result; default 200, maximum 1,000, optionally filtered by `runId` or `jobId`)
- `GET /api/orchestration/models` and `GET /api/orchestration/workflows` (filtered evidence-conditioned leagues; optional `taskClass`, `capability`, `providerId`, `modelId`, `modelVersion`, `location`, `evidenceKind`, `minQuality`, `maxAgeDays` and `sort`)
- `GET /api/orchestration/decisions`, `GET /api/orchestration/decisions/:id`, `GET /api/orchestration/decisions/:id/report`, `GET /api/parcels/:id/decision-tree`, and `GET /api/parcels/:id/decision-report` (persisted machine-readable and human-readable operational routing records)
- `GET /api/cache-experts` (Warm Expert registry, candidate decisions and full human-readable operational transcripts)

Authenticated legacy Job requests are `POST /api/jobs/:id/run`, schedule `enable`/`disable`, and Run `cancel`, `retry` and `approve`. Parameterised Job requests are `POST /api/saved-jobs`, `POST /api/saved-jobs/:id` (update), `POST /api/saved-jobs/:id/run`, `POST /api/saved-jobs/:id/enable`, `POST /api/saved-jobs/:id/disable`, and `POST /api/job-runs/:id/cancel`. Saved Job updates require the current revision. Scoped command-result expansion is `POST /api/command-output/:handle/expand`; operator authentication is necessary but not sufficient, because the supplied task/lane/worker/lease/ownership scope must exactly match the retained result. These calls enter `AgentControlService`. The HTTP layer cannot register a worker, grant a capability, edit a definition, acquire a resource lock, dispatch an Action or write a PTY.

POE mutations are `POST /api/poe/conversations`, conversation `turns`, `voice`, and `interrupt`, plus proposal create/revise/freeze/approve endpoints documented in [`poe.md`](poe.md). They require the same operator authentication and origin policy as other dashboard mutations. POE has no endpoint for arbitrary shell, tool dispatch, authority widening, release, deployment, or credential access.

Authenticated inventory changes use `POST /api/configuration/systems` with the current `revision`, a `kind` of `resource`, `provider`, `model` or `service`, an optional `originalId`, and the complete replacement `item`. Model role maps use `POST /api/configuration/model-routing`; fast-execution policy uses `POST /api/configuration/spark`; adaptive orchestration policy uses `POST /api/configuration/adaptive-orchestration`; Warm Expert policy uses `POST /api/configuration/cache-aware-experts`. The server rejects stale revisions, embedded secret material and invalid schema, writes the complete configuration atomically and emits `configuration.changed`. Provider/model/route updates return `restartRequired: false`; resources/services/Spark/adaptive/cache policy return `true`.

Model qualification and routing mutations are `POST /api/models/:id/qualify` and `POST /api/models/:id/route`. Qualification accepts a `nodeId`; routing accepts `nodeId`, optional `requiredCapabilities` and `allowFallback`. These operations require operator authentication. `UNTESTED`, failed, disabled, wrong-node or capability-unproven models cannot route.

Operator requests under `/api/lanes/:id/` include `pause`, `resume`, `priority`, `mode`, `task`, `reroute`, `handoff`, `clone`, `cancel`, `takeover`, `return-ownership` and verification transitions. These endpoints call application-service methods. There is deliberately no direct lease, scheduler-state, persistence, terminal-input or execution-provider endpoint.

The prominent **Managed Nodes** panel renders the same resource-attached snapshot returned by `/api/status` and `/api/nodes`: state, OS/kernel, heartbeat, uptime, load, memory, workload, maintenance state, secure-overlay connectivity, storage and capabilities. Measurements include source, authority, freshness, observation time and limitations. Android/sysfs-derived CPU busy is visibly derived and not admission-qualified; absent temperature/storage/load data remains unknown. It is an observation panel, not a remote shell. Node operations are created as governed Jobs through the existing scheduler and approval path.

The compact **Harness Efficiency** diagnostic shows verified successes, turns, fresh/cached/cache-write/output token composition, cache effectiveness, escalation rate and cost per verified outcome. A cache read is not a cache write, and neither is subtracted from authoritative total input. Unknown provider measurements are rendered as `unknown`, not zero. A selected Run shows its recorded profile and verifier state; these observations cannot change routing or acceptance through the read-only endpoints.

## Spark fast execution

Open **Configuration → Fast execution** to edit the complete `spark` policy. It is disabled by default and requires a restart after save. The exact keys, defaults, registry prerequisites and qualification commands are documented in [`fast-execution.md`](fast-execution.md). The editor cannot bypass exact-model availability, qualification, classifier or verifier gates, and there is no dashboard control that forces arbitrary work onto Spark.

When a selected Session has fast-execution telemetry, its **Fast execution** panel shows execution class, harness profile, requested and actual model, verification, elapsed time, changed scope, escalation reason, successor and evidence. If Spark is unavailable, the attempt/decision remains visible as unavailable or escalated; Agent Control never labels a substituted model as Spark. Provider fields that were not exposed, including current monetary cost and sometimes file reads, render as `unknown` rather than zero.

## Security model

- Listener default: `127.0.0.1` only.
- Observation: unauthenticated on the local listener; data should be treated as sensitive.
- Mutation: bearer token, `application/json`, origin validation and body-size limit.
- Browser token retention: current tab only; no cookie and no server-side browser session.
- Response protection: no-store, CSP, frame denial, referrer suppression and secret-like key/value redaction.
- Audit: accepted service commands append typed records to the Agent Control event journal.
- POE: full conversations and proposals are authenticated private state; the unauthenticated snapshot contains only a safe identity/state/voice summary. Model output must cite supplied evidence or fails closed to a visibly labelled deterministic rendering.
- Output handles: random, expiring, authority-scoped references that select only data captured by the original result; they are not file paths or repository readers.

Remote binding is not a turnkey security boundary. If explicitly enabled, place the listener behind authenticated TLS, restrict network reachability, set an exact `AGENT_CONTROL_WEB_ALLOWED_ORIGINS` list, rotate the operator token, and verify the reverse proxy does not buffer SSE. Never publish it directly to the public internet.

## PTY and takeover

The terminal panel is an observer projection of session metadata. It has no input facility. Human takeover invokes `PtyRegistry.humanTakeover` through `AgentControlService`, pauses the lane, and prevents resume until ownership is deliberately returned. This is the same fence used by the core, not browser-maintained state.

## 3.6 runtime observability

The Sessions view reads `GET /api/runtime` alongside identity/execution provenance. It shows ACP protocol version, configured transports, connection/authentication state, governed ACP session and parcel references, contracts, active agent/model/provider/node/runtime, process/PTY state, attached participants, current writer, pending approvals, handoff outcomes, baton hash/size, verification and cancellation/recovery state. Usage and cost continue to come from invocation telemetry and remain `unknown` when absent.

The projection deliberately omits ACP prompt/cwd content, contract objectives, sealed baton payloads, PTY transcript text, handoff requests and credential-reference names. A persisted ACP session is transport-neutral, so an active binding is not falsely attributed to stdio or remote transport. Remote ACP can be shown as configured but unobserved; the dashboard does not start or probe its listener.

Systems adds stable ACP stdio, disabled/configured remote ACP, and durable lifecycle recipes. A disabled remote transport remains visible as `UNKNOWN` with its blocker. DISCOVERED/BENCHMARKING recipes remain `UNKNOWN`, SHADOW/CANDIDATE are `DEGRADED`, and only ACTIVE/PREFERRED are `AVAILABLE`. Models displays matching immutable recipe fingerprints, lifecycle state, semantic placement requirements and active policy. These are observations; no web route promotes a recipe or changes routing policy.

## Failure behavior

The dashboard can reconnect to the SSE stream and always refreshes the current durable snapshot. UI or stream failure does not change scheduler state. Missing authentication disables mutation. Invalid origin, content type, JSON, lane, action or evidence fails closed. A missing dashboard never blocks TUI operation or task recovery.

## Live token governor (3.7)

The dashboard’s **Thread Context** panel is driven by `GET /api/status` / `GET /api/token-routing` and refreshes through the normal SSE stream on `token.telemetry`, `token.governor_transition`, `token.context_lifecycle`, `token.baton_created`, and `token.handoff_result`. It lists every observed execution thread with provider/safe account label/model, account plan where its authority is known, context/window/percentage, latest compaction/new-context/resume transition, cumulative total/fresh/cached input, output and total tokens, authority markers, cost, elapsed time, governor state/thresholds, next selected route, and account-aware Work Parcel chain total. Each model-chain leg preserves the same split, and route lookup uses the durable thread ID. It does not turn unavailable provider data into zero or infer current context from lifetime use. The durable routing evidence contains the corresponding timestamped samples and all transition/decision records. See [Token-Aware Baton Routing](token-aware-baton-routing.md).

`GET /api/token-routing` is a read-only projection. It deliberately excludes prompts, baton bodies, credentials, provider requests, and transcripts.

The **Models** view reads `GET /api/models/accounts` and model account projections. It shows account friendly label, provider-execution node, credential-residency node, plan plus metadata authority, availability and independent qualification state. Parameterized Run and live token cards also show the workload node separately. **Check account** dispatches bounded `codex login status` to the selected profile's provider-execution/credential node; `CODEX_HOME` is resolved only there. The dashboard never receives credential environment names, resolved paths, full executable paths, raw process output, email addresses, OAuth tokens, cookies, or authentication-file contents.

The **Retrieval** panel reads the redacted `retrieval` status projection and updates through the existing SSE stream on `retrieval.started`, `retrieval.provider_selected`, `retrieval.escalated`, `retrieval.evidence`, `retrieval.context_compiled`, `retrieval.rehydrated`, `retrieval.invalidated`, `retrieval.fallback`, and `retrieval.failed`. It shows provider/strategy path, calls and escalation, evidence sufficiency/items/tokens, raw bytes avoided, estimated context savings, freshness, locality and latency. A handoff or restart refreshes the same projection after reference revalidation; invalidation and fallback remain visible. Evidence text, repository roots, index paths and raw provider output are excluded. `GET /api/retrieval` is read-only. See [governed retrieval](governed-retrieval.md).

## Persistent context and capability intelligence (3.9)

Each Work Parcel card now includes a **Persistent context** board. It shows the current DAG stage/route, unresolved questions, criterion status, event/baton metrics and bounded history controls. Authenticated operators may answer a stable question, append a steering amendment, add/evaluate a criterion or request a bounded history lookup. These operations enter `AgentControlService`; the page cannot edit event hashes, mark stages successful or bypass verification. An open question names exactly which stages wait, while unrelated running/succeeded stages remain visible.

The **Models** view adds:

- verified model leaders, left empty when evidence is insufficient;
- Capability Watch candidates grouped by lifecycle and native/emulated verified observations;
- frozen evaluation batches and queue state;
- append-only provider/account/model/node/runtime history;
- 7/30/90-day quality/reliability, fresh/cache/total tokens, cache hit ratio, elapsed time and cost per success;
- regression warnings and authenticated evidence-gated lifecycle controls;
- independent Runtime Safety decisions and approval state.

It also contains the generic **Provider catalogue**. Provider cards show configured enabled/disabled state; endpoint, credential and discovery state; discovered, inference-confirmed and callability-untested counts; current cost classification with authority; observed request/token remaining-versus-limit, reset/retry and quota fields; provider qualification; and routing-eligible count. Missing headers or metadata remain `UNKNOWN`. The model table keeps catalogue availability separate from inference state, then shows a human-readable diagnostic label, next triage step, measured TTFT where available, review/routing state, context/modality observations, cost authority, frozen metrics and trends. Actions for an unavailable model are disabled.

Authenticated actions call the same control service:

- **Discover Models** performs one bounded authenticated catalogue request;
- **Check Callability** performs one bounded streaming inference request and classifies endpoint acceptance, TTFT and timeout phase;
- **Capability Smoke** is enabled only after inference is confirmed, reuses passing callability as basic completion, and runs four fixed capability probes;
- **Queue Benchmark / Re-benchmark** enters the existing frozen evaluation queue;
- **Enable Routing** is disabled until current model intelligence is `QUALIFIED` or `PREFERRED`;
- **Disable Routing** immediately removes dynamic eligibility.

Discovery, callability and smoke success never edit a logical role or qualify production routing. `DISCOVERED` means only catalogue-visible; inference remains `UNTESTED`, `CONFIRMED`, `NOT_AVAILABLE`, `AUTHORIZATION_REQUIRED`, `RATE_LIMITED` or `INDETERMINATE`. Rich failures such as `TIMEOUT_BEFORE_FIRST_TOKEN`, `TIMEOUT_DURING_GENERATION`, `OUTPUT_TRUNCATED`, `SCHEMA_INVALID` and `ENDPOINT_NOT_AVAILABLE` project durable observations rather than invented visual state. If durable model intelligence degrades, the catalogue automatically disables the dynamic route. Provider catalogue changes emit `provider.catalog_changed` through the existing SSE stream and refresh the same `GET /api/provider-catalog` projection. Public data contains credential class/status, never reference name or value. See [model registry](models/README.md) and [NVIDIA hosted models](models/NVIDIA-HOSTED.md).

The 2026-09-06 isolated physical projection reconciled the protected NVIDIA catalogue and intelligence ledgers: provider `CONFIGURED / AVAILABLE / SUCCEEDED`, 81 discovered/available IDs, zero routing-eligible IDs, Nemotron `BENCHMARKED / CANDIDATE`, and its numeric token-efficiency metric. The focused follow-up added the staged callability projection and richer diagnostics while preserving that historical result. This exercised feature assets and API on loopback only; it was not a live deployment. See the [physical evidence](evidence/agent-control-3.9-nvidia-hosted-qualification-20260906.md) and [focused diagnostics](evidence/agent-control-3.9-nvidia-focused-diagnostics-20260906.md).

All values come from the capability/model/safety ledgers. Missing cost, unsupported evaluator capability and unqualified leaders display as unavailable, never zero or a fabricated ranking. Provider/model configuration remains separate from observed capability proof.

The core `EventSource` starts independently of optional dashboard projections. If the parameterised Job engine or another optional panel is not configured, that panel reports its own unavailable state while Jobs, Work Parcels and live SSE continue. The top badge changes to `LIVE` only after the browser's event stream opens; reconnect still refreshes the complete authoritative snapshot.

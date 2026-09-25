# Agent Control architecture

This is the authoritative source boundary for Agent Control 4.7. Historical physical evidence remains bound to its recorded product SHA. The generic voice transport supplies audio and transcript events to the existing governed ingress; Agent Control retains approval, routing, batons, state and telemetry. See the [voice architecture](docs/mallow-voice.md#transport-architecture). Live provider and physical audio qualification remain explicit limitations. Status labels matter:

- **implemented** means executable code and automated tests exist in this branch;
- **experimental** means executable code exists but has not been qualified across every external substrate;
- **planned** means the concept has a defined place but must not be presented as implemented or released functionality.

## Invariants

1. The lane owns the task; a model, process, terminal and execution provider never do.
2. Human takeover wins immediately and persists across adapter reconnect/restart.
3. One live lease and one logical PTY owner exist per lane/session generation.
4. Hard contracts, batons, events, checkpoints, context metadata and provenance are persisted.
5. Restore validates objective evidence; it never equates a remembered session with a proven live execution.
6. Shared context augments Git/test evidence and cannot replace it.
7. Infrastructure identity, transport, provider and capability are configured separately.
8. Missing configuration fails closed to `UNCONFIGURED`, never to private defaults.
9. The TUI and web dashboard are clients of one `AgentControlService`; neither owns scheduler, lease, ownership or PTY state.
10. An agent claim, collected evidence, verification and acceptance are distinct durable states.

## Governed learned specialists (4.5)

The provider-neutral identity is:

`qualified base model + versioned learned adaptation + independent qualification evidence = specialist routing candidate`

The base remains immutable and independently addressable. The adaptation grants
no tools, authority or policy. `SkillLearningRuntime` enforces legal lifecycle
transitions, frozen dataset/evaluation hashes, human review, material improvement,
freshness and exact base/runtime compatibility. Registration is not route
admission; routing is separately enabled and remains subordinate to ordinary
capability, policy, health, placement, cost and verification gates.

Framework-specific training and loading remain ports. The first adapter uses
PEFT LoRA on CPU, but core records contain no Hugging Face, PEFT, CUDA, model-family
or hardware assumption. Production inference enters the existing model-backed
adaptive-harness Action boundary, executes in a normal Job/Work Parcel, preserves
the baton and artifacts, and requires an independent read-only verification step.
The local PEFT adapter recomputes on-disk base and adapter hashes before loading.

Learned capability and runtime warmth are orthogonal: a learned specialist can be
cold or warm, while a warm route may be unadapted. Multiple-adapter composition,
automatic online learning and automatic promotion are not implemented. Runtime
outcomes may only propose a new governed candidate/version. See
[the architecture decision](docs/agent-control-4.5-skill-learning-architecture-review.md)
and [operator guide](docs/skill-learning.md).

## Portable project memory experiment (4.5)

The optional `ProjectMemoryPort` implements the generic memory boundary chosen in 4.4. Its first backend is a structured Markdown directory that Obsidian can view, but Agent Control core has no Obsidian dependency. Metadata scope and lexical retrieval precede any future semantic adapter. Provenance, verification, expiry, supersession and contradiction checks run before a memory can become advisory `ContextGraph`/Context Packet input. Memory cannot override Work Parcels, batons, policy, evidence, approvals, execution state or independent verification. See [project-memory portability](docs/project-memory-portability.md).

The provider-neutral [energy telemetry boundary](docs/energy-aware-intelligence.md) retains timestamped power, scope, authority, method, idle baseline, limitations, and verified outcome identity. It integrates gross and incremental Wh and supports expected-total-energy route assessment, including failed-attempt and fallback energy. Capability, quality, confidence, policy, privacy, and independent verification remain hard gates. GPU-only, CPU-package, measured-components, battery, whole-node, estimated, and unavailable energy are never conflated. Physical evidence may reject a small-model route: the first 4.5 study found the retained 135M specialist consumed more measured energy than warm Qwen, while deterministic execution was lowest. Parameter count never substitutes for joules per verified outcome.

Physical 4.5 qualification exercises the provider-neutral flow as
`route qualification → writer route → verified memory record → sealed stage baton → qualified cold reader route → independently verified continuation`. `ProjectMemoryExchange` is the canonical application contract shared by writer, reader and consolidation; provider adapters may translate transport envelopes but cannot weaken its semantic verifier. Provider-native personal-memory APIs are optional adapter capabilities, not assumed core state. A backend such as Obsidian is not a second memory capability.

`MemoryRouteQualificationStore` records exact provider/account/model/node identity separately from the provider adapter. Each record binds runtime and exchange-contract versions, writer and reader eligibility, maximum physically proven memory bytes, bounded repair allowance, qualification freshness, evidence and terminal classification. Exact pair records prevent independent route successes from being incorrectly composed into an unproven pair. Admission is fail closed: a missing, stale, contract-mismatched, oversized, blocked or unsupported pair is denied; escalation occurs only when an explicitly qualified alternate pair is recorded. Secrets and provider output are not part of this store.

The 4.5 release line is **PRODUCTION QUALIFIED WITH LIMITATIONS** while
individual unqualified routes remain experimental or unavailable. Every
historical matrix row is retained: 11/12 exact routes are now PASS/FIXED after a fresh
Qwen→Pixel Gemma 4 E4B pass with the unchanged semantic verifier. The exact
OpenRouter GLM-5.3-Flash→Qwen route remains `BLOCKED_EXTERNAL`; a separate
NVIDIA-hosted GLM-5.3-Flash→Qwen execution proves provider-neutral portability
without changing that historical route identity. The two public Pixel aliases
refer to one physical route and are not presented as two executions. See the
[original cross-model evidence](docs/provenance/EXTERNAL-EVIDENCE.md),
[completion evidence](docs/provenance/EXTERNAL-EVIDENCE.md)
and [final release closure](docs/provenance/EXTERNAL-EVIDENCE.md).

The power boundary deliberately preserves negative evidence. The qualified
specialist did not beat warm Qwen on measured-component energy, warm residency
did not produce a route-relevant effect above uncertainty, and synchronized
whole-node energy is unavailable. Those results are respectively `DISPROVEN`,
`DISPROVEN` and `BLOCKED_EXTERNAL`; GPU-board and CPU-package readings cannot be
promoted to whole-node claims. The exact MiniCPM5-2B Q4_K_M code-repair
configuration likewise remains `FAILED` while known-good and scripted controls
pass, so fail-closed admission applies only to that immutable configuration.
These findings prevent unsupported energy/model routes from being admitted;
they are not converted into positive claims or hidden as product successes.

The follow-up [release-gate reconciliation](docs/provenance/EXTERNAL-EVIDENCE.md) makes provider-response validation two separate gates: transport/application-schema validity and semantic reconstruction. One governed repair attempt may correct a malformed or misplaced response, but exact state, provenance, decision, rejection-risk and next-action semantics remain independently required. A valid JSON object or copied keyword list cannot pass by itself. Attempts retain bounded sanitized output, finish reason, hashes and exact schema/semantic failures. Model limitations remain failures; unavailable node authentication remains `BLOCKED`.

Cross-node Codex execution retains `provider + account profile + model + node` in the sealed route. The Windows SSH adapter sends a fixed audited script and variable payload as two bounded base64 records, avoiding dependence on OpenSSH channel EOF. The destination resolves its own profile-home reference and executable locally; credential paths, credential values and raw PowerShell output never become Work Parcel, baton, telemetry or evidence fields.

## Transport Context and Integrity Gate (4.2)

After a Work Parcel resolves its frozen repository and context, the production review path creates a provider-neutral Transport Context Contract. It contains the initiating request (with security redaction), acceptance criteria, repository identity/commit/dirty state, bounded scope, architecture and security rules, route capabilities, policy limits, provenance and freshness. A stable canonical representation is hashed with SHA-256 and bound to the parcel and any sealed baton.

Each dependency declares requiredness, source, provenance, freshness and expected identity/hash. The deterministic gate is `COMPLETE` when required dependencies are satisfied, `DEGRADED` when only optional context is missing, `BLOCKED` when required context is missing/unretrievable/claimed-but-not-loaded, and `ESCALATED` when required context is stale or contradictory. Repairs append evidence; blocked workers do not improvise. Independent inspection records a distinct verifier and rejects generator self-approval.

This layer composes with, rather than replaces, Work Parcel audit, token telemetry/governor, contract runtime, governed handoff and repository validation. The baton carries the transport-contract hash across provider/model/node changes. Legacy parcels are visible as unbound and are not silently rewritten. See [docs/transport-integrity.md](docs/transport-integrity.md). 11. Every material routing decision is capability-qualified, fail closed and inspectable. 12. An Action is a versioned executable capability; a Job is a declarative workflow; a Trigger creates a durable Run through one authoritative path. 13. Job manifests can request capabilities, resources and approvals but cannot confer them. 14. Process completion, collected evidence, verification and Run success are separate states. 15. An agent may request or propose capability; only Agent Control policy may qualify and grant it. 16. A recipe constructs an execution environment but cannot schedule work, acquire authority, write a PTY or accept a result. 17. A managed node is a configured resource plus discovered capabilities; its hostname, transport, hardware and workload identity never become control-plane policy. 18. Remote maintenance is a typed Action with approval and evidence, never an arbitrary SSH command string. 19. Provider registration, model registration, model qualification, logical role mapping and worker placement are distinct state and decisions. 20. A declared capability or pricing field is not qualification evidence; unavailable usage and cost remain unknown rather than zero. 21. Actor, Agent, Model, Provider, Runtime, Node and Resource identities are separate; one must never stand in for another. 22. A Session has one immutable creator and an attributed participant set; joining a session never grants authority beyond the actor, parent delegation or session envelope. 23. Every context handoff records source and transferred hashes, token budget, selection/omission reason and receiving agent/model without persisting raw secret material. 24. Missing sandbox, local execution, governed runner, required node or required model fails closed unless an explicit fallback policy names the replacement. 25. ACP and other interoperability adapters terminate at AgentControlService/Work Parcel ports. They cannot become alternate scheduler, shell, tool or acceptance paths. 26. `THIN` describes context shape; `SPARK` describes an execution class. Neither implies the other. 27. Fast execution is one attempt, independently verified, scope-limited and visibly escalated. Protected or sensitive work never enters it. 28. Retrieval is governed separately from model execution; search/inspect authority never implies index, configuration or repository mutation. 29. Retrieved evidence is content-addressed, repository-state-bound and explicitly CURRENT, POSSIBLY_STALE or INVALID. 30. Token pressure may narrow retrieval before expansion/compaction/handoff, but cumulative lifetime use never substitutes for active context occupancy. 31. Provider rank is not calibrated confidence; evidence sufficiency derives from observable exact, path, coverage, diversity and freshness signals. 32. A baton evidence reference is portable only when rehydration revalidates repository identity, path boundary, source existence and whole-file content hash. 33. Index search and index mutation are distinct authorities; resource policy may recommend a build but cannot grant it. 34. A remembered Run, PID or network connection is not execution continuity. Recovery requires the adapter to reconcile the exact durable execution identity and route. 35. Sending a cancellation signal is not cleanup completion. Terminal state and authority release require verified descendant/process-tree absence or an explicit uncertainty state. 36. Every resource metric carries source, authority and freshness. Missing data is null; a derived fallback cannot silently become an admission-qualified measurement. 37. Cache admission is an adapter capability, not a core assumption. Stable prompt structure is portable; provider-specific keys and breakpoints are emitted only after provider-and-model qualification. 38. Every external ingress that starts governed work preserves a redacted `request-origin` envelope through the Run, Work Parcel, transcript and response association; channel identity and authentication are provenance, never execution authority by themselves. 39. A baton transfers context and evidence, never authority. A child contract receives only an intersection with parent authority and inherits the parent's protected-resource envelope. 40. Live Shell is an attachment to a proven execution-session identity, not a shell API. Protected-resource Actions are `WATCH_ONLY`; adapter capabilities cannot widen that policy.

## Agent Control 4.0 integrated lifecycle

## Runtime Map projection (4.5 experimental)

Runtime Map now has two projections over one provider-neutral graph language:
**Process Map** projects current governed execution and **Estate Map** projects
the latest Environment Discovery topology plus resource-appropriate evidence
freshness. They share nodes/edges, layout, status vocabulary, progressive
disclosure, inspector and evidence references. Neither owns execution or estate
state.

```text
runtime ledgers/events ──> Process Map ┐
                                      ├─> shared runtime-map schema/renderer
discovery inventory + health ─> Estate Map ┘
```

`EnvironmentDiscoveryRuntime` runs isolated read-only adapters, normalizes
resource classes and provenance, persists non-secret scan history and computes
changes. Remote/edge observations enter through generic adapter contracts and
require explicit configured scope. `CapabilityAdapterRegistry` separates
portable definitions from machine bindings and enforces draft, review,
validation, bounded test, approval and enablement. Imported community contracts
cannot execute arbitrary commands. Configuration proposals bind scan,
configuration revision and SHA-256, then use the existing Work Parcel boundary.

Estate “alive” status is not discovery presence: machine/agent heartbeat,
runtime/endpoint health, model availability and static inventory each have
appropriate freshness windows. Stale topology remains visible but unavailable.
Credential values are resolved nowhere in the projection; only reference/status
and a constant-length mask cross the server boundary. Desired-state management
and remediation are explicitly 4.6 work, not 4.5 Estate Map behavior. See
[Environment Discovery](docs/environment-discovery.md).

```text
authoritative Work Parcels / Runs / sessions / token and retrieval evidence
                                  |
                           sanitized projection
                                  |
               authenticated API + existing SSE event stream
                                  |
        Runtime Map <-> Control Room <-> inspector / Live Shell
                                  |
                 timestamp-bounded Replay / Compare
```

`RuntimeMapProjection` is a provider-neutral view, never execution authority.
Node/edge state derives from existing timestamps and terminal states; evidence
references remain content-addressed. Live Shell remains a separately governed
execution-session attachment. Dashboard disconnect cannot stop work, and stale
state is labelled until a fresh projection reconciles. Redaction occurs before
the projection/API boundary. See [Runtime Map](docs/runtime-map.md).

Graphical Compare projects each completed Work Parcel independently and then
compares explicit route and evidence facets. It does not align nodes by display
label. Process/Estate navigation likewise requires configured model, provider,
worker or node identity. Every identity field asserted by both projections must
agree; a globally registered worker identity remains sufficient when a
deterministic Run has no authoritative node assertion, while any known mismatch
fails closed. Dashboard request origin and attribution are part of the initial
durable parcel write so asynchronous planning cannot erase POE/dashboard provenance.
The map remains WATCH-only: existing Live Shell and other control-plane APIs keep
their own authority, confirmation and audit boundaries.

```text
authenticated dashboard / OpenWA text / confirmed voice / ACP
                              |
                              v
           redacted request-origin + canonical Work Parcel
                              |
          classify capabilities, policy and authority envelope
                              |
               adaptive model/workflow decision record
                              |
            Lane + Crew projection + owned execution session
                              |
       models / typed tools / optional observable Live Shell
                              |
      token governor -> retry / compact / sealed-baton handoff
                              |
               independent verification and acceptance
                              |
       immutable transcript/evidence -> originating channel
```

The flow composes existing control-plane records. `GovernedRequestOrigin` records exact initiating text, safe channel/authentication metadata and opaque message/identity references. It does not grant a template or tool; the enrolled principal and normal policy still decide authority. `AdaptiveOrchestrationRuntime` ranks only eligible routes and workflows. `RuntimeSafetySupervisor` resolves semantic effects before process launch. `ExecutionSessionRuntime` projects the proven process with adapter-specific capabilities. `TokenAwareBatonRuntime` decides context/cost continuation, while `GovernedHandoffRuntime` intersects requested authority with the source contract and retains protected resources. Verification remains a separate actor and acceptance boundary. The dashboard/Crew/WOPR consume these same records over SSE and cannot mutate their meaning.

## Governed retrieval and context intelligence

```text
Work Parcel -> Retrieval Intent -> Retrieval Governor -> Retrieval Providers
                                      ^                    |
                              3.7 token governor           v
Model <- ContextPacketBuilder <- ContextGraph <- Evidence Packet
  |                                                |
  +-> independent verification -> portable Baton -+
```

The governor progresses through available exact, lexical, semantic and hybrid strategies only while evidence is insufficient and budgets remain. `EVIDENCE_SUFFICIENT`, `EVIDENCE_AMBIGUOUS` and `EVIDENCE_INSUFFICIENT` are based on observable matching and freshness, not an adapter's arbitrary score. Exact/BM25 are local built-ins; zg, provider-native and MCP retrieval remain adapters. zg is search-only (`--refresh off`) in model execution, and every returned excerpt is checked against current source content before it can be marked CURRENT.

Evidence compiles through existing context profiles and records portable references in existing batons. On destination execution or restart, the durable store rehydrates only references whose repository identity, relative path, existence and whole-file hash still match. A mismatch emits invalidation and restores controlled frozen-context fallback. Existing SSE carries provider selection, escalation, evidence, compilation, rehydration, invalidation and fallback events without a second transport.

`RetrievalResourcePolicy` is provider-neutral. It combines observed free memory/storage, repository bytes, index state, measured cold-index memory/time, expected task duration, built-in availability and separate index-management authority to return `USE_PROVIDER`, `USE_BUILTIN`, `BUILD_INDEX` or `DEFER_INDEX`. A recommendation never mutates an index by itself. Full contracts and boundaries are in [governed retrieval](docs/governed-retrieval.md), the pre-implementation [3.8 review](docs/agent-control-3.8-architecture-review.md), and [Phase 2 evidence](docs/evidence/agent-control-3.8-phase2-qualification.md).

## Resilient execution and cleanup (3.9)

```text
durable Run + exact route + execution ID
                  |
          adapter observation
       /            |             \
 authenticated   same live ID    terminal proof
     block        reconnect       + cleanup evidence
       |              |                  |
human action   continue observing   verify/accept
       \______________|__________________/
                      |
             durable dashboard/SSE
```

`JobRuntime` and `ParameterizedJobEngine` persist an execution identity before provider work begins. For a parameterised review that identity seals sequence, provider, account profile, model, workload node, provider-execution node and credential node. Controller restart moves an unresolved attempt to `DISCONNECTED`; it never changes that identity or automatically invokes the provider again. A provider-owned reconciliation port may return `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED` or `UNKNOWN`, but only the same execution ID with proven continuity can restore or terminalise the Run. A completed response still enters independent application validation.

Recovery classification is provider-neutral. Transient transport and expired-enrolment failures are retry-eligible only inside the configured attempt budget, exponential backoff and overall deadline. Authentication-required becomes `AUTHENTICATION_BLOCKED`; permanent configuration and unclassified execution failures do not masquerade as transient recovery. The selected provider/account/model/node route stays fixed unless normal governed routing authorises an explicit change. Error projection retains a bounded safe reason, not credentials or raw provider transport.

Every action receives an `OwnedExecution` capability rather than owning an untracked child process. On Linux the adapter launches a process group, captures `/proc/<pid>/stat` start identity, sends bounded TERM/KILL to the group and verifies absence. On Windows it enumerates a fixed CIM process tree, compares creation identity, invokes bounded tree termination and rechecks every captured process identity. Other substrates may stop the leader but must return `uncertain` when descendants cannot be proven absent. Contract, ordinary Job and parameterised-review cancellation/timeout paths therefore remain `CANCELLING`, `CLEANUP_UNCERTAIN`, `DISCONNECTED` or `ORPHANED` until cleanup evidence permits a terminal state; locks and write authority are not released on a mere signal attempt.

Dashboard state is a projection of those durable records. Initial HTTP load and every SSE connection send/reload a full snapshot before incremental events. Reasons, source/observed time, freshness, retry/cancellation deadlines, remaining retry budget, execution identity and cleanup outcome are rendered directly. Locally advancing elapsed-time or countdown text is presentation between authoritative timestamps, never inferred state.

The optional dashboard Crew is another read-only projection inside this boundary:

```text
canonical lanes / Runs / steps / Parcel DAGs / baton views
workers / tools / systems / models / provider and routing events
                              |
              projectDashboardCharacterCrew
                              |
        versioned AgentControlService status snapshot
                              |
       existing HTTP status + SSE-triggered reconciliation
                              |
      Crew + explanation + linked engineering evidence
```

The `agent-control.dashboard-character-crew/v2` contract separates three layers. `operationalState` is canonical control truth; `activity` is current source-backed work plus its source ID and optional classified tool; `animationCue` is explicitly `presentation-only`. The browser can derive bounded idle expressions such as looking, sleeping and one-shot waking, but no animation value is accepted as projector input or returned to execution. Deterministic narration is built from the same source IDs and fixed templates, never another model.

Core state is reduced deterministically to one primary presentation state per functional area, with concurrent conditions retained as typed count badges. Work Parcels additionally project their actual stage dependency graph, selected Run workers, routes and one visual worker per canonical `RUNNING` stage. A baton can move only from a token-governor handoff record, durable Parcel baton/audit record or typed lane-handoff event; source, destination, outcome and exact reason remain inspectable. Provider/model events retain explicit failure, HTTP and routing-eligibility facts, so discovery or evaluation completion cannot imply qualification.

Active work can remain primary while blocked and queued work remains visible. A two-minute presentation freshness rule changes an otherwise-active pose to `stale`, never `failed`; recent event-derived activity is bounded to 30 seconds unless a Run/stage remains active. Canonical cancellation remains `cancelling` until cleanup is terminal. Initial load and reconnect reconciliation suppress transition-only completion acknowledgement. The browser-local gallery has no API writer and its simulated state is never merged into real workflow evidence.

Characters have no model, scheduler, provider, worker, lease, PTY or verification capability. Motion uses browser-only SVG/CSS transform/opacity, pauses when hidden/off-screen, respects reduced motion and collapses to a horizontal worker strip on small screens. The source records and linked Level 3 views remain authoritative. The complete mapping, three disclosure levels and qualification boundary are documented in [dashboard operational Crew](docs/dashboard-characters.md).

The Crew projection also owns a read-only `agent-control.dashboard-activity-panel/v1` view. It coalesces canonical controller/queue/lane/step/thread/handoff/verification/system facts and retained typed events into nine labelled Activity Matrix indicators. The browser may pulse an indicator only for `ACTIVE` or bounded `RECENT` state; it cannot synthesize traffic, token streaming or hardware work. Each row carries its event ID/time, lane, provider/model, source, meaning, persistence and stale/disconnected rule. A separate slow connection heartbeat has `presentation-only` authority and is visibly marked as non-work.

The persistent usage strip is another read-only composition of the existing token-routing projection. It remains mounted across main dashboard views and stores only the selected thread/lane ID in browser-local storage. Current snapshots replace prior snapshots, so SSE reconnect and navigation neither reset nor add usage. It shows current-context occupancy only when the adapter supplies or defensibly estimates it, and separately retains cumulative fresh/cache-read/cache-write/input/output and Work Parcel model-chain totals. Unknown context and cost remain unavailable.

Provider prompts have a generic ordered stable/volatile block representation plus a non-secret cache scope. The rendered text remains authoritative. A Responses adapter may derive a hashed key or explicit content breakpoint only when both its provider and exact model advertise `prompt-cache.key` or `prompt-cache.explicit`; unsupported adapters receive the unchanged rendered prompt. Cache reads, writes and fresh input are normalized separately, and configured cache-write cost is calculable only when the provider reports the write count. This preserves useful structure if any current provider disappears while keeping its wire controls behind its adapter.

## System boundary and adaptive harness

```text
          OPERATOR INTERFACES (non-authoritative)
             TUI                 Web / HTTP / SSE
               \                 /
                \               /
                 AgentControlService
                         |
                POLICY / AUTHORITY
       lanes / leases / ownership / approvals
       scheduler / handoffs / takeover / conflicts
                         |
                 SCHEDULER / QUEUE
                         |
                  ADAPTIVE HARNESS
          capability analysis / recipe construction
                         |
                  EXECUTION RECIPE
      +------------------+-------------------+
      |        |         |         |         |
    worker   model/    prompt    context   skills
            provider   profile   strategy     |
      |        |         |         |        tools
      +--------+---------+---------+----------+
                         |
        runtime / limits / authority snapshot
        verification / escalation requirements
                         |
                  TOOL POLICY GATE
                         |
                EXECUTION SUBSTRATES
       PTY / Orca / SSH / browser / mobile /
            local runtime / API provider
                         |
                 evidence / provenance
                         |
                    verification
                         |
                  accepted result

   Job Catalog -> Schedule / Run Now -> Run Ledger
                         |
                         +---- invokes Scheduler / Queue
```

Orca, PTYs, SSH, browsers, mobile nodes, local runtimes and API providers are substrates or adapters. They are not the harness and receive no control-plane authority. Orca may execute, but Agent Control always decides.

## 3.5 identity and session control plane

```text
external client / dashboard / scheduler
                  |
               Actor identity
                  |
       governed persistent Session
       mode / participants / authority
                  |
               Work Parcel
                  |
       delegation + context transfer
      source actor/agent -> target actor/agent
                  |
       Model + Provider (separate identity)
                  |
       Runtime + Node + Resource
                  |
        tools / evidence / verification
                  |
       causal-chain usage and cost
```

`IdentityControlPlane` is the durable authority/audit source for actors, agents, sessions, context transfers, delegations, execution provenance and opaque secret-use receipts. It does not replace the Job Runtime, Work Parcel store, model registry or Worker Registry. Instead, those records carry or refer to `agent-control.work-attribution/v1`, preserving one causal chain across existing stores.

Execution provenance is admitted only after checking session participation, the participant/session/delegation capability intersection, model and node allow-lists, and runtime filesystem/network policy. Empty model/node allow-lists deny execution; an interoperability adapter must use an explicit `*` only when Agent Control remains responsible for the governed selection.

An agent profile describes a persistent specialist. An Actor is the authenticated principal responsible for action. A Model produces inference. A Provider exposes the model. A Runtime executes it. A Node hosts that runtime. A Resource advertises schedulable capability. These identities may be related but never collapsed.

Context transfer persists descriptors and hashes, not copied prompt bodies. Full, summary, evidence, structured-baton and hybrid policies can be compared using the same frozen experiment interface. Secret values may only cross an opaque capability-checked operation and are rejected if returned or placed in context.

## Contract-owned execution

```text
Lane → Contract → sealed Baton → Process / PTY → Agent
         |                              |
         + authority / budget           + attach / detach
         + completion criteria          + one write owner
         + protected resources          + ordered output
         + pending actions              + restart observation
         + verification / evidence
```

`ContractExecutionRuntime` is the durable task owner. Agent, model, provider, runtime and process identities may change without replacing the contract. Its versioned record contains the active route, process observation, PTY ownership generation, participants, ordered transcript, attachments, permissions, remaining budget, pending actions, verification and evidence. The sealed baton stores canonical content plus its generation, byte count and SHA-256; credential-like content is rejected.

Detach does not terminate a running process. Consultation and reconnect attach read-only. Write transfer requires a durable request approved by the current writer or contract operator, and there is exactly one writer. Human takeover revokes every agent writer and pauses the contract; deliberate return to an attached agent creates a new ownership generation. Stale retained writers therefore cannot regain authority. Cancellation, timeout and orphaning are distinct reconstructable states. A worker's completion is only a verification submission; the active worker cannot verify itself.

## Governed handoff state machine

`SACRIFICE` cancels the current worker and pauses the parent contract. `SUBSTITUTE` replaces process and route under the same contract with a next-generation baton. `DELEGATE` creates a bounded child contract, intersects authority and debits parent budget. `YIELD` pauses and returns control without completion. `COMPLETE` submits evidence to independent verification.

AUTO policy permits only transitions inside the current contract authority, protected-resource envelope and remaining budget. Explicit MANUAL policy, missing authority, costly escalation, production writes, destructive actions, expanded resource envelopes or budget expansion create a durable approval wait. Approval records intent but cannot create authority absent from the parent. Every transition writes `agent-control.handoff/v1` with both identities, contract links, reason, baton hash/size, transferred and withheld authority, budget, before/after state, evidence and verification outcome.

## Provider and model lifecycle

Logical providers are durable identities independent of a client or controller session. Their ordinary configuration contains endpoint/protocol/adapter policy and an indirect credential reference, never a secret. The existing credential-residency vocabulary covers `codex-home-env`, `api-key-env`, `bearer-file-env`, and `provider-secure-store`. The latter now has one concrete controller-local backend beneath the same abstraction; it is not an NVIDIA store or a second credential architecture.

```text
provider / optional account profile / model / execution node
                         |
               opaque credential reference
                         |
       metadata-only readiness (no credential read)
                         |
              governed invocation boundary
                         |
       late node-local resolution -> adapter header/env
                         |
         exact-secret + pattern response redaction
                         |
       normalized telemetry / evidence / dashboard
```

The secure-store backend hashes the opaque reference into an owner-only filename under the Agent Control state directory. Directories are `0700`, files are `0600`, writes are exclusive temporary-file plus atomic rename, and symlink, ownership or permission mismatches fail closed. Rotation replaces the same reference atomically; revocation removes it. Status is derived from safe file metadata and does not read the credential. The set operation may compute a display-only prefix/suffix fingerprint from its ephemeral input, but does not persist it.

Resolution occurs inside the chosen provider invocation, after provider/account/model/node identity has been selected. A provider-level route resolves its provider reference. An account-bound API route resolves only that account's `credentialResidency.store`; it does not fall back to provider or ambient credentials, and a controller client refuses a remote-resident profile. Codex keeps its existing isolated `CODEX_HOME` flow. Only the adapter receives the resolved value, and only for its authorization header or isolated child environment. Exact runtime values plus recognized credential patterns are removed from returned content, tool arguments, model metadata and failures before any state/evidence boundary.

Dynamic discovery is an observation, not qualification or callability. A provider adapter may call its documented catalogue endpoint and normalize only returned or safely derived metadata, preserving an authority per field. Missing context limits, modalities, capabilities, licence, pricing, quota and rate limits remain `UNKNOWN`. A discovered entry is registered as enabled for review but `routingEligible: false` and starts `DISCOVERED / UNQUALIFIED / inference UNTESTED`. An inference endpoint must separately accept the exact discovered ID before its state becomes `CONFIRMED`.

```text
DISCOVERED -> UNQUALIFIED / inference UNTESTED
           -> bounded streaming callability / inference CONFIRMED
           -> capability SMOKE_TESTED -> BENCHMARK_QUEUED
           -> BENCHMARKED -> QUALIFIED / REJECTED / LIMITED
           -> ROUTING_ELIGIBLE (explicit authenticated operator action)
```

The cheapest generic prerequisite is one bounded streaming callability request. It records HTTP acceptance, stream/event start, measured TTFT, partial-output signal, finish reason and normalized usage, separating timeout before first token from timeout during generation. Raw stream data, output and reasoning are never durable. Only confirmed endpoints enter capability smoke; its passing callability result can satisfy basic completion, leaving four bounded probes. Both contracts are versioned and content-hashed, and previous focused runs remain append-only history.

Capability smoke retains requested budget, output length, normalized usage, latency, finish reason, provider-neutral failure class and response hashes—not prompts, response bodies or credentials. An adapter may supply a bounded, audited provider request extension when a provider's native invocation control is needed for the qualification contract; reserved governed fields cannot be overridden, and ordinary execution, benchmarks and core routing do not inherit that extension. A response that consumes its output budget is `OUTPUT_TRUNCATED` with safe partial usage/hash evidence rather than malformed transport. Frozen benchmark attempts and 7/30/90-day economics continue through the existing model-intelligence ledger. Routing admission requires current `QUALIFIED`/`PREFERRED` evidence plus explicit enablement; degradation, quarantine, retirement or loss of evidence automatically withdraws the dynamic route. This catalogue lifecycle feeds, rather than replaces, immutable model recipes and versioned role policy.

The NVIDIA adapter is intentionally thin: it constrains the provider to NVIDIA's documented HTTPS hosted endpoint and validates the `nvapi-` credential form. OpenAI-compatible wire requests, discovery, secure references, smoke checks, telemetry, model intelligence, dashboard projection and routing are generic. Removing NVIDIA leaves those capabilities intact.

Model recipes bind exact provider, provider model, model version, capability, context/output limit, tool, runtime and node requirements. Their fingerprints are immutable per recipe version. Evidence gates each transition through `DISCOVERED → BENCHMARKING → SHADOW → CANDIDATE → ACTIVE → PREFERRED → DEPRECATED`.

Versioned routing policy names an ACTIVE/PREFERRED champion and qualified challengers for each logical role. Historical replay produces a recommendation without mutating active policy; verified rollback may reactivate an immutable earlier version. Placement remains separate: recipes state semantic node/runtime requirements without hard-coding a machine. `GLM-5.3-Flash` is canonical and historical `Ox` is only an input alias, not a separate lifecycle identity.

Capability classification then chooses a minimum execution class in the governed hierarchy `LOCAL → SPARK → STANDARD → FRONTIER`; the registry resolves that class to an exact qualified recipe. This is orthogonal to THIN/STANDARD/DEEP harness profiles. The frozen 60-task policy suite and 12-case holdout test conservative classification and fail-closed unavailability, while a separate physical-observation gate measures provider outcomes. A deterministic classifier pass cannot promote routing policy by itself.

The coordinator experiment compares one FRONTIER worker receiving the whole twelve-part job with a coordinator compiling 12 minimal child batons. Parent context and child batons are accounted separately. Child results, additional-context requests, verification, escalation and integration outcomes remain unknown until physical execution. See [capability-routing benchmark](docs/capability-routing-benchmark.md).

The physical multi-provider proof exercises the same boundaries across Codex/Luna, loopback llama.cpp/Qwen and OpenRouter/GLM-5.3-Flash. The local worker yields after its bounded task, the substituted reviewer receives only review authority and a minimal baton, and Luna submits the integrated result for independent verification. Contract detach/reconstruction preserves process and baton identity. See [physical multi-provider qualification](docs/physical-multi-provider-qualification.md).

## ACP interoperability boundary

The ACP runtime implements stable Agent Client Protocol v1 JSON-RPC session methods above the control plane. The official TypeScript SDK owns schema validation, dispatch and NDJSON framing; `AcpAgentControlAdapter` owns the governed mapping. An external ACP session maps to one governed Agent Control session; prompt content becomes a hash-addressed context transfer and then an ordinary Work Parcel. `session/cancel`, `session/close` and request cancellation call the same cancellation port and preserve actor/session identity. Durable ACP bindings reconstruct from the identity and ACP session stores after a process restart. Ordered plan, tool-call and tool-call-update notifications carry Work Parcel, Run and evidence references, not direct tool authority. Usage or cost is omitted when the underlying execution does not report it.

`RuntimeObservability` is a read-only composition boundary over persisted ACP bindings, contract/PTY state, handoffs and provider lifecycle. `AgentControlService` exposes it at `/api/runtime` and merges transport/lifecycle readiness into Systems. The projection carries identities, state, hashes, sizes and evidence references while omitting ACP prompt/cwd content, contract objective/baton payload, PTY transcript, handoff request and credential-reference names. It cannot start a listener, invoke a provider, write a PTY, approve a handoff or promote lifecycle state.

`agent-control acp` is the qualified local stdio adapter. Actor admission is out-of-band and fail-closed: the configured Actor must already exist in the durable identity store. `agent-control acp-remote` reuses the same core through the official Streamable HTTP/WebSocket server transport. It is disabled unless explicitly enabled, requires an indirect bearer secret, checks browser origins, bounds request/frame size, routes one exact path and refuses cleartext non-loopback binding. A TLS certificate/key pair is mandatory for non-loopback use. Tests bind only ephemeral loopback ports; no live listener was deployed.

Prompt replay can carry the advertised namespaced `_meta.agentControl.deliveryId` extension. Agent Control stores only its bounded ID, prompt hash and governed outcome references; exact replay returns the original receipt and a hash mismatch fails closed. Standard fields are not reinterpreted. The stable code imports only the stable ACP root; the SDK's server transport is used independently of the separate `experimental/v2` protocol entry point. ACP v2 remains draft and is not claimed.

## Fast-execution class

```text
classify
   -> compile minimal baton
   -> execute with Spark
   -> independently verify
   -> escalate when necessary

side gates before execution:
   policy enabled + exact qualified fast-execution model route
   + authenticated bounded Spark availability probe
   + disposable initially-clean Git worktree

execution:
   explicit codex exec --model gpt-5.3-codex-spark
   + workspace-write sandbox + ignored user config
   + one attempt + multi-agent disabled

verification:
   approved files + changed-line limit + deterministic command/evidence
      -> PASS: persist verified evidence
      -> FAIL / ambiguity / scope growth / unavailable: visible STANDARD handoff
```

The policy names `FAST_EXECUTION_MODEL`; Spark is its current model identity, not a hard-coded architectural role. The model-execution hierarchy is `LOCAL → SPARK → STANDARD → FRONTIER`. LOCAL, STANDARD and FRONTIER resolve through existing registry roles/capabilities. A future fast model may occupy `fast-execution` only after passing the same exact-identity availability, node qualification, trivial-work classifier, baton, verifier, telemetry and benchmark contracts; routing policy requires no model-specific rewrite.

Harness profile and execution class are orthogonal:

| Harness/context profile                              | Execution-class consequence                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `THIN` + trivial + low-risk + deterministic verifier | Spark candidate, subject to all availability and qualification gates        |
| `THIN` + sensitive, ambiguous or protected work      | Not Spark; retain governed STANDARD/FRONTIER policy                         |
| `STANDARD` parent with one isolated trivial child    | Child may receive a separate minimal Spark baton; parent model is unchanged |
| `DEEP`                                               | Never directly Spark-eligible; use the existing capable-model route         |

Availability and registry qualification are independent and both required. `probeCodexSparkAvailability` checks the installed Codex version, ChatGPT authentication and one bounded read-only exact-model invocation expecting a fixed probe response. A configured slug, CLI version or successful login alone is not availability evidence. Failure records the reason and leaves existing governed routing authoritative; no other model may be reported as Spark.

The sealed `agent-control.fast-execution-baton/v1` contains the task ID and text, exact allowed files, maximum changed lines, forbidden scope/actions, Context Packet ID/hash, deterministic verifier commands and completion rule. It deliberately excludes broad parent history. `CodexFastExecutionRunner` requires an absolute disposable initially-clean Git worktree, chooses the exact provider model with `--model`, ignores user configuration, applies an explicit workspace sandbox and structured output schema, and disables multi-agent fan-out. One failed or uncertain attempt is the limit.

Verification belongs to Agent Control. The reusable Git mutation-surface primitive uses NUL-delimited porcelain plus the complete `HEAD` diff to include staged/unstaged modifications, additions, deletions, rename endpoints and non-ignored untracked files. Ignored transients follow repository Git policy; untracked files contribute content hashes and line counts without mutating the index. An independent verifier determines acceptance. Model text cannot mark a result verified. Failure, low confidence, extra context, unexpected files/lines, or verifier failure preserves the Spark attempt and creates a visible STANDARD successor decision.

Persistent attempt telemetry records Work Parcel/Run/Session, task and execution class, harness profile, requested/actual model and provider, availability/selection reasons, parent/delegated context, elapsed time, changed scope, independently verified outcome, escalation/successor, reported token/cost fields and evidence. Values Codex does not expose remain `null`, including monetary cost in the current qualification.

The current live requalification demonstrates that small 24–35-token batons were sufficient for seven frozen tasks, but Codex startup context still dominated reported input tokens. This means baton minimisation is effective for parent-to-child transfer without proving low total provider context or cost. Research-preview entitlement, unavailable monetary cost, absent production Job adoption and single-host evidence keep `spark.enabled` false by default.

## Execution recipe

The implemented `AdaptiveHarness` constructs a fingerprinted `ExecutionRecipe` from:

- worker, provider and model identity;
- harness profile and context-strategy identity;
- prompt profile;
- minimum qualified skill selection;
- explicit tool grants;
- selected context and evidence references;
- runtime/inference settings;
- lane, lease and ownership generations;
- latency/spend limits;
- verification and escalation policy.

The older `ModelRecipe` remains the model-qualification fingerprint: model artifact, runtime, context size, template, prompt, skill/tool snapshots and parameters. It is a component of the broader execution recipe rather than a competing abstraction.

Persisted recipes from before profile support are interpreted as `STANDARD`; every newly built recipe carries an explicit profile. This additive compatibility rule does not qualify a legacy recipe for THIN or DEEP routing.

Recipe construction is pure policy work. It neither claims a queue item nor acquires a lease, owns a PTY, sends input or accepts a result. Those mutations remain in their existing authoritative services.

## Skills and tools

The implemented `SkillCatalog` selects only entries marked `qualified` that carry qualification evidence. Proposed or revoked skills are not selectable. The implemented `ToolPolicy` calculates an explicit minimum grant and rejects unknown, denied, unavailable or unapproved-risk tools.

Tool authorization fails closed for an unknown, omitted, revoked, unavailable or policy-denied tool; worker mismatch; missing privilege approval; lane mismatch; stale lease/ownership generation; or human ownership. This is an executable control boundary, not a prompt instruction. `WorkExecutor` gives ordinary agent work only this gateway, and the generic `AgentAdapter` contract carries the same recipe/gateway. Tools used internally by an opaque external CLI remain unobservable and therefore are not yet qualified as universally moderated calls.

Dynamic skill proposal, static/security review, sandbox qualification, human approval and promotion into the catalog are **planned 3.1**. No model can currently create and self-grant a privileged skill.

## Token-aware result boundary

Potentially large command results are intercepted at `ToolHandlerRegistry`, after `ToolPolicy` has revalidated the recipe, worker, lease, ownership and approval state and before the result becomes model context. The interceptor accepts one transport-neutral command-result envelope, so local, SSH, managed-node and future backends share the same policy. It does not add a scheduler or a general shell.

```text
authorised command tool
       |
local / remote executor
       |
authoritative command-result artifact (stdout, stderr, status, hash, scope)
       +-- level 0 summary
       +-- level 1 semantic index
       +-- level 2 selected captured context
       +-- level 3 full artifact
                    |
               model context
```

`TokenAwareOutputService` stores the authoritative result and derives an explicitly labelled `COMPLETE`, `COMPACTED`, `TRUNCATED` or `ARTIFACT_ONLY` view. The source hash, byte/line/token counts, expiry and scope accompany every derived representation. `ContextRouter.selectProgressive` chooses the minimum representation capable of discovery, match location, selected inspection or complete verification and reports when that representation exceeds remaining context.

The first specialised adapter is typed ripgrep search. `RipgrepSearchRunner` uses shell-free structured output and an execution-backend-owned workspace boundary; a remote repository path need not exist on the controller. `repository.search.ripgrep` accepts only a bounded query, paths, globs and read options. `command.output.expand` selects only records captured by the original result. Exact task, lane, worker, lease generation and ownership generation must still match, so a handle cannot become a filesystem-read or replay primitive. stderr, non-zero exit status, timeout and cancellation are orthogonal to stdout compaction and remain visible.

Other command families currently use a labelled generic head/tail fallback. Their full retained result remains authoritative. New semantic adapters can be added below the same interception, artifact, context, telemetry and expansion contracts.

## Harness efficiency boundary

`HarnessProfileRouter` classifies profile need before the existing model/provider route. THIN, STANDARD and DEEP alter context/tool/turn budgets, not authority. In observational mode the recommendation is recorded while STANDARD is applied. Enforced selection requires profile-specific, same-model, verifier-backed production evidence; deterministic benchmark evidence cannot satisfy that gate.

`ContextPacketBuilder` accepts ranked sources and returns an immutable derived packet containing hashes, token estimates, included source/provenance IDs and named omissions. Required evidence that exceeds a profile budget fails closed. The neutral `ContextGraph` port supports node search, relationship traversal, neighbourhoods, ranking, compact evidence and verified write-back without selecting a database implementation.

Provider adapters emit a versioned model-invocation observation. Provider usage remains authoritative; local prompt-component counts are deterministic estimates. `HarnessDispatcher` records the observation before returning, and `JobRuntime` changes its verifier/final-result fields only across the existing verification and Run-finalisation transitions. Aggregates count tokens, turns, time and cost against distinct verifier-passed successful jobs. Unknown cache, reasoning, price or cost fields remain null.

Profile escalation is monotonic (`THIN -> STANDARD -> DEEP`), reason-coded and reference-preserving. It never repeats a strategy, expands policy authority or bypasses scheduler retry/review controls. The complete decision and measurement contract is in [`docs/harness-efficiency-architecture.md`](docs/harness-efficiency-architecture.md).

Real-mutation qualification reuses this path rather than introducing a second scheduler or executor. A frozen task is copied into a disposable Git workspace, `HarnessDispatcher` provides a bounded structured tool loop through the existing `ToolPolicy`, and an independent verifier evaluates the resulting diff. The outcome ledger links prediction, context packet, attempts, escalations, provider usage, tool observations, patches and verifier checks. Cumulative metrics include every failed precursor attempt.

### Prompt/KV cache evidence boundary

Prompt/KV reuse is provider capability evidence, not a scheduler assumption. Provider adapters may normalize direct backend fields into the generic `CacheEvidence` contract: reused prompt tokens, newly processed prompt tokens, cache writes, prompt/generation timing, authority, source and request-prefix fingerprint. `HarnessDispatcher` persists the observation, Work Parcel audit retains it, and the dashboard renders the same fields. Missing values remain unavailable. Core policy never derives reuse from response latency or cumulative token subtraction.

```text
provider response / runtime event
        -> provider adapter normalization
        -> CacheEvidence + raw bounded artifact
        -> invocation ledger
        -> Work Parcel audit
        -> dashboard / authenticated transcript / qualification report
```

For llama.cpp, `timings.cache_n` is the direct reused-prefix count and `timings.prompt_n` is newly evaluated prompt input. A repeated transcript, resent conversation history, persisted application data, or cached final answer is not equivalent to reusable KV state. Backend-specific fields remain in the adapter and bounded evidence artifact; the normalized contract remains provider-neutral.

Qualification-only Jobs are registered only under an explicit environment gate, accept only a loopback backend, use one frozen real-mutation fixture, and pass all model tool requests through the existing typed `ToolPolicy` gateway. Independent verification owns acceptance. The managed artifact-content API requires operator authentication, verifies the artifact checksum, removes storage paths and applies the ordinary API redactor before a complete transcript is displayed.

### Cache-Aware Expert Delegation

Agent Control 4.3 adds that previously gated Warm Expert policy through the normal Work Parcel route. A Warm Expert is not a worker label: it is temporary evidence attached to the exact worker, provider, account, model, node, session, cache scope and backend instance plus a hashed context domain. The registry is populated only by terminal provider invocation observations and keeps actual reuse separate from qualified expected retention.

```text
qualified model candidates
  -> capability / placement / health / transport-integrity gates
  -> adaptive quality, history, cost and latency policy
  -> exact route identity + context compatibility
  -> bounded cache-affinity score
  -> independent decision check
  -> dispatch -> provider counters -> independent task verification
  -> registry + baton + Work Parcel audit + dashboard transcript
```

Compatibility compares repository, task type, branch/dependency, transport, instruction, tool and governance hashes and returns `EXACT`, `HIGH`, `PARTIAL`, `INCOMPATIBLE` or `UNKNOWN`. Only verified, fresh `EXACT`/`HIGH` records with allowed `AUTHORITATIVE` or explicitly qualified `DERIVED` evidence can add a cache bonus. Route identity prevents evidence crossing providers, models, sessions, cache scopes or backend processes. Intervening incompatible work in one scope invalidates displaced context; process/session loss and explicit eviction use the same invalidation boundary.

The bonus is bounded by policy and multiplied by compatibility, freshness and expected reuse. Worker placement already owns capability/load admission, while adaptive orchestration owns task-conditioned success, quality, latency and sourced cost. The final route is written back into the cache decision even when those higher-order policies override cache order. Decision/expert IDs are sealed into the stage baton; candidate evidence, compatibility, scores, decision reason, actual cache result and verifier result remain linked in durable audit records.

Pre-run context delta is estimated and labelled. Completed provider counters are authoritative where exposed. `UNAVAILABLE` is not zero. Cost saving is calculated only with complete counters and authoritative pricing; otherwise the operator sees `MONETARY SAVING UNAVAILABLE`. Raw prompts are absent from the Cache Expert Registry.

A warm cache improves efficiency but does not confer correctness or authority. Capability, integrity and governance always outrank cache warmth. See [Cache-Aware Expert Delegation](docs/cache-aware-expert-delegation.md).

The dashboard projects this state through one dedicated **Warm Cache Runtime** tab. It joins the read-only Cache Expert projection with current Work Parcel stages, batons and invocation audit already fetched by the dashboard. The timeline never becomes a scheduler: lanes and step blocks are derived from persisted stage/audit identity; cache colors come from provider-normalized evidence; route scores and compatibility come from durable decisions; invalidation comes from registry lifecycle. The heatmap uses discrete recorded invocation observations rather than inferring continuous backend warmth. The compatibility matrix contains only evaluated candidate relationships, marks context percentages as derived, and leaves unobserved cross-lane relationships `UNKNOWN`. SSE-triggered refresh and periodic reconciliation update every view without granting the browser routing authority.

This evidence is not routing authority. The production gate requires a sufficient deterministic task sample, no verified-success regression against STANDARD, bounded classified escalation, a measured cumulative-resource improvement and all existing policy/fencing checks. The first recorded mutation run fails the sample-size and resource-improvement criteria, so production applies the observational STANDARD fallback; no production profile-selection code path is enabled by the experiment.

## Routing and qualification

The current line has three complementary implemented layers:

1. `CapabilityResolver` matches requirements to healthy, infrastructure-neutral resources.
2. Provider/model qualification records capability scores and promotes challengers only with adequate evidence.
3. `HarnessProfileRouter` recommends a qualified context/tool/turn profile and defaults to STANDARD when evidence is insufficient.
4. The recovered `EconomicRouter` rejects routes that fail health, qualification, capability, confidence, quality, approval, spend or latency gates, then compares monetary cost, latency, local occupancy, contention, failure/retry risk and quality.

`DynamicEscalationRouter` can re-evaluate after failure, low confidence or latency pressure while carrying context/checkpoint references. `RecipeDispatchRecord` separately records scheduler-selected worker placement and provider/model routing, plus prompt, context, skills, tools, safe runtime settings, authority generations, verification and escalation. The historical branch's machine-specific UI/bootstrap changes were deliberately not imported.

## Durable state

```text
Workspace
  Lanes
    Hard contract
    Baton revisions
    Lease and ownership generations
    Execution identity and recovery state
    Context-source references
    Verification policy, claim, evidence and phase
    Latest routing decision and rationale
  Shared tasks
  Work Queue and checkpoints
  Versioned Job/Schedule catalog references
  Run ledger, step attempts and placement rationale
  Artifact metadata/checksums and durable resource locks
  Evidence and provenance graph
  Append-only events
```

Recovery distinguishes starting, running, paused, human-owned, completed, failed, cancelled, disconnected, recovering and unknown execution. Reconnect validates a tuple that can include task ID, provider execution/session ID, host/resource ID, repository, worktree, branch, creation nonce, lease generation, ownership generation and command identity. PID alone is never sufficient.

## Configuration and resource model

The versioned configuration contains resources, providers, services and lanes. A resource has a stable logical ID plus an independent transport (`local`, `ssh`, `http` or `orca`). Hardware details are optional metadata, not product identity. No provider or managed service is registered unless configured.

An authorised Linux/SSH resource may opt into the generic managed-node adapter. The adapter sends a fixed, versioned read-only probe over its existing SSH transport, projects heartbeat/inventory/workload state and synchronises observed capabilities into the Worker Registry. Declarative workload detectors and approved-service allowlists remain configuration; hostnames, secure-overlay addresses, usernames, device names and credentials are never product constants. Probe loss preserves the last observation as degraded before expiring offline, and later complete evidence recovers it.

Managed-node execution is split into read-only inspection and typed maintenance Actions. The controller validates operation, parameter form, service allowlist, runtime target, current heartbeat and approvals before streaming one reviewed action script. The remote script validates its typed operands again. It never receives `sh -c` or an operator-provided command. An active protected workload marks the node BUSY, blocks configured disruptive/competing scheduling capabilities and requires the stronger protected-workload override for maintenance. Job leases, locks, approval waits, cancellation, verification, artifacts and provenance remain in the existing control plane.

Configuration rejects embedded secret-like fields and credentialed URLs. Credentials are supplied through separately named environment variables, referenced files, isolated CLI homes or the existing opaque `provider-secure-store` reference. The TypeScript runtime loader and plain-JavaScript bootstrap initializer share the same distinction between credential-shaped fields and legitimate numeric token-accounting/model-limit metadata; values are recursively checked in either case. State defaults to `.agent-control/`; the path is overrideable.

`ConfigurationStore` is the sole dashboard-facing inventory writer. Its authenticated API reads the current file with a SHA-256 revision, applies one resource/provider/model/service upsert or complete model-role-map replacement, validates the resulting configuration, and atomically replaces the file. It never writes a supplied credential value: environment/file forms name runtime references and `provider-secure-store` carries only an opaque lookup name, while plaintext password, token, secret and API-key fields fail closed. Provider/model/route changes reload the canonical `ModelRegistry`; resource/service changes remain restart-required. The browser never mutates a registry directly.

## 3.4 parameterised Jobs layer

Agent Control’s operator-facing Job platform is a durable layer over—not a replacement for—the existing internal Job Runtime and Work Parcel governance:

```text
Operator / authenticated CLI / persistent scheduler
                     |
                     v
          Saved Job + resolved schedule
                     |
                     v
        versioned Job Definition registry
                     |
           typed parameter resolution
                     |
                     v
         freeze target and policy inputs
                     |
                     v
        one or more governed Work Parcels
                     |
          node + model-role resolution
                     |
                     v
       direct qualified provider executor
                     |
                     v
       deterministic validation/evidence
                     |
                     v
            immutable persistent Run
```

`ParameterizedJobRegistry` owns reusable definition identity, versions, formal parameter schemas, default routing intent, permissions, budgets, output contract, validation policy, and version-controlled instruction template. `SavedJobStore` owns configured instances and schedule/concurrency policy. A Saved Job either pins a definition version or follows only a declared compatible version. It cannot introduce arbitrary parameters or secret-shaped fields.

`ParameterizedJobEngine` is the sole path for manual and scheduled execution. A scheduled occurrence has a deterministic identity; the persistent Run store makes duplicate delivery idempotent. Restart recovery requeues the same non-terminal Run identity and reuses only a verifiably intact frozen snapshot. Missed-run and overlap policy are evaluated before provider work. Agent Control—not a browser, Codex, or conversation—owns the timer.

The initial `repository-code-review@1` definition supports node-local paths under configured `jobs.repositoryRoots` and remote Git URLs under explicit `jobs.repositoryRemotes` prefixes. It records source identity, origin, dirty state, requested ref, exact commit, and comparison SHA. A detached shared clone (local) or isolated clone (remote) is made recursively read-only before context construction. The production repository is never modified. If a branch moves after resolution, the Run retains the original SHA.

`buildRepositoryContext` deterministically records tree, diff, changed files, important manifests/tests/source, chunk hashes, selected files, and explicit omissions. Secret-like and binary paths are excluded before provider context. THIN/STANDARD/DEEP are bounded intent profiles; omission is visible rather than reported as full coverage. Large inputs are decomposed into attributable chunks instead of being placed into one prompt.

`DirectRepositoryReviewExecutor` consumes the already-selected `ModelRouteDecision` and invokes the matching provider client directly. Responses-compatible providers use `OpenAICompatibleProviderClient`; account-bound CLI providers use the schema-constrained `CodexRepositoryReviewClient` through the selected `CodexNodeExecutionPort`. Controller-local profiles use an isolated child-process `CODEX_HOME`; remote profiles resolve it only on their configured execution node. The Codex structured-review adapter reads authentication from that home but ignores mutable user/project configuration, suppresses project instructions and disables Codex-native shell, unified-exec, multi-agent, web-search, browser, computer, app, image and workspace-dependency surfaces under strict config validation. Every context chunk creates a persistent Work Parcel carrying Run ID, frozen SHA, requested/actual route, provider/account/model/node/qualification identity, and terminal evidence. Provider response bodies, credential references and credentials are not persisted; response hashes, normalized usage/cost, and selected safe identity are.

The structured review validator checks schema, evidence presence, confidence, repository-relative path, file existence, and line range against the frozen snapshot. Duplicate or invalid findings are rejected. Provider completion is not Job success: validation determines `SUCCEEDED`, `SUCCEEDED_WITH_FINDINGS`, `DEGRADED`, or `FAILED`. Only successful accepted outcomes advance the `(Saved Job, repository identity, ref)` baseline.

Persistent state is below `AGENT_CONTROL_STATE_DIR/parameterized-jobs/`: `saved-jobs.json`, `runs.json`, `review-baselines.json`, and read-only snapshots. Files are atomically replaced with mode 0600. Terminal Runs become immutable. Dashboard/API/CLI clients access this state only through `AgentControlService`.

## Provider and model registry

### Credential residency and execution locality (3.8.1)

The provider-neutral route has three independent locations: `workloadNodeId` owns the repository/workspace; `providerExecutionNodeId` runs the provider adapter/process; `credentialNodeId` owns the opaque credential-store reference. A Codex CLI-home route requires execution and credentials on the same node, but the workload may be elsewhere. Other adapters may support different relationships without changing core policy.

Agent Control freezes repository state at the workload node and moves only an immutable, hash-verified bundle plus governed Context/Evidence Packets, Work Parcels, and batons toward provider execution. It never transfers tokens, cookies, OAuth files, API keys, or credential stores. Qualification is account-and-credential-node specific, model qualification is provider-execution-node specific, and workload authority grants neither. Every route and baton seals all three identities; an invocation that returns a different account or node fails closed. The legacy 3.8 `account.nodeId` is normalized to both provider execution and credential residency for compatibility. See [credential residency](docs/credential-residency.md).

`ModelRegistry` separates provider endpoint/authentication from model identity and routing policy. A provider records stable ID, display name, protocol, base URL, authentication reference and broad capabilities. A model records its stable Agent Control ID, provider-native model ID, declared capabilities, optional node scope, limits, sourced pricing metadata and configured qualification seed. `ModelQualificationStore` persists runtime evidence outside the tracked tree.

Logical roles map to an ordered primary and fallbacks plus optional required capabilities. Routing evaluates an explicit model before a role and an explicit role before the configured default. Eligibility requires an enabled provider and model, `QUALIFIED` evidence, selected-node membership when scoped, and every role/request capability in the proven qualification set. Fallback is explicit in the decision and can be prohibited. Cycles, duplicate IDs and unknown references fail configuration validation.

The OpenAI-compatible adapter supports bounded non-streaming Responses and Chat Completions requests plus normalized function/tool-call responses. It normalizes usage without inventing missing measurements and calculates cost only from configured, attributed pricing. Qualification proves basic response and identity, then conditionally proves coding, reasoning and tool use declared by the model; role requirements are checked only against that proven set. It records response hashes, usage, latency, exact provider/model/node identity and capability evidence, never secret environment values or response bodies. Streaming and long-context capability are not advertised merely because an endpoint accepts ordinary requests.

Work Parcel model routing remains downstream of worker placement but upstream of Run creation. A stage requesting `modelRole` or `model` is resolved against the worker selected for its first runnable Job step. The immutable Run trigger records the exact provider model, node, qualification version and fallback reason so model-backed Actions can consume the governed decision. Ordinary Jobs with no model request retain their existing behavior.

Codex integration materializes one selected Responses-compatible provider and model into a mode-0600 temporary `CODEX_HOME/config.toml`, references the approved credential environment variable, and deletes the directory after execution. A secure-store value is resolved only at that boundary and supplied through a dedicated ephemeral child environment key; it is never written to the generated TOML. The path does not edit or copy the user's Codex configuration. That generated configuration is the one exception to ignoring user config; it is still executed with project instructions and native execution tools disabled. Chat-Completions-only providers fail closed because current Codex custom-provider configuration supports the Responses wire API.

## Scheduling and execution

The scheduler selects capabilities, placement and priority before queue mutation. It supports AUTO/MANUAL lanes, dependencies, shared tasks, batons, handoffs, cloning, batch leases, checkpoint/yield, quiet periods, resource budgets, maintenance windows, confidence routing, approval gates and successive-halving experiments.

`WorkCoordinator` remains authoritative for queue eligibility and worker placement. Once it selects a normal agent item, `WorkExecutor` must call an `adaptive-harness` dispatch; raw handlers are accepted only through a named, scope-checked `ControlOperationRegistry` entry. Harness denial is non-retryable and never falls back to unrestricted execution. Recipe construction cannot claim queue work or change the scheduler decision.

`HarnessDispatcher` filters candidates to the worker already selected by scheduling, builds the recipe, stores an inspectable/durable dispatch record and gives the executor a closure-backed tool gateway. Every gateway call re-reads live authority and policy state. Execution moves Work Queue state to `verification-pending`; a separate verifier must accept it.

Windows OpenAI execution uses an explicit authentication selector below this boundary. `auto` chooses the qualified Responses provider when an API key is configured and otherwise chooses official Codex non-interactive execution with ChatGPT-managed authentication. The Codex process receives an ephemeral read-only capability envelope with user-configured MCP tools disabled; its schema-constrained returned request still enters `ToolInvocationGateway`. Authentication choice never changes lease, ownership, scheduling, verification or takeover authority.

`JobRuntime` is the workflow-level extension of that scheduler, not a parallel policy engine. It discovers due Schedule definitions, calls one `createRun` path, evaluates a Run DAG, resolves every step against the worker capability registry, acquires semantic resource locks, dispatches a registered Action, stores typed artifacts and requires declared verification before success. Model/provider routing remains a separate decision from worker placement. All dashboard/TUI mutations enter through `AgentControlService`.

Worker capability and worker execution locality are separate facts. A
`WorkerExecutionIdentity` binds the scheduler-visible worker ID to its execution
node, locality, identity authority and controller relationship. Agent
Control-owned workers are established only through the internal registration
boundary; configured resources derive locality from their validated transport.
Worker names, labels, host-like strings and remote self-declared metadata cannot
grant local authority. A configured SSH/HTTP/Orca resource therefore remains a
remote worker even if it claims to be a controller, while an ordinary
unestablished registration remains `UNKNOWN` when runtime safety is active.

`JobRuntime` supplies this trusted identity to `RuntimeSafetySupervisor`. A
controller-local or local configured worker does not create a `REMOTE_NODE`
effect merely because its worker ID differs from the controller resource ID. A
genuine remote worker does create that effect and must satisfy the configured
remote-node scope; an absent, mismatched or internally inconsistent identity adds
`UNKNOWN` and fails closed. The same identity is projected into Environment
Discovery and Estate Map, so execution safety and operator-visible topology use
one provenance rather than competing locality guesses.

The append-oriented Run ledger retains the effective Job version, parameters, trigger, worker assignments, execution identity, retries, recovery state, cleanup, artifacts, evidence, errors and provenance. A restart never assumes a live Action survived and never blindly requeues one: an in-flight step becomes `DISCONNECTED`/identity-unproven and its durable resource lock remains held while the configured adapter reconciles the exact execution ID. Proven continuity may enter `RECONNECTING`; an unknown or changed identity requires operator reconciliation. PID alone is not recovery evidence.

The narrow execution-provider API exposes only start, status, reconnect, input, pause, resume, cancel, output, diff and cleanup. Orca-specific concepts remain inside the adapter so another substrate can replace it.

## Shared control service and operator interfaces

`AgentControlService` is the application boundary consumed by both the TUI and web server. It projects lane, scheduler, provider, PTY, Git, baton, routing and verification state without transferring ownership of that state. Commands such as pause, resume, priority, mode, reroute, handoff, clone, cancel and takeover enter through typed service methods. The web server never receives direct persistence, scheduler mutation or PTY-input access.

The HTTP API is read-only by default. Mutation requires a configured bearer token, JSON content type and an allowed browser origin. The default listener is localhost. Server-Sent Events carry typed state-change notifications; clients do not parse terminal text to infer authority.

Human takeover calls the existing PTY registry fence. A human-owned lane cannot resume autonomous execution until ownership is deliberately returned and the scheduler revalidates execution. There is no weaker web-only ownership model.

The dashboard's default Jobs workspace is an operational projection, not an additional scheduler. It reads catalog definitions, Schedule state, queue reasons, worker capability/capacity, resource locks, Run history, step verification and artifact provenance from `JobRuntime` through `AgentControlService`. Run, schedule enable/disable, cancel, whole-Run retry and exact named approval commands return through authenticated service methods. Artifact projections expose identity, checksum and provenance but not managed storage paths. A named approval is legal only while a matching step is authoritatively `WAITING_FOR_APPROVAL`.

Managed-node snapshots are another `AgentControlService` resource projection, exposed through the shared system status and `GET /api/nodes`. Each measurement retains value, source, authority, freshness, observation time, limitations and admission qualification. `/proc` remains primary; Node `os` values and Android sysfs cpuidle counters are bounded fallbacks. Two counter samples are required for CPU busy, resets/stale intervals stay unavailable, and Android-derived aggregate busy is not admission-qualified. The web dashboard, TUI and universal status command render that same versioned state; none probes hosts or owns heartbeat/workload policy independently.

The Systems projection joins configured resources, providers and external services with whatever current heartbeat, provider-health, worker, capacity and invocation evidence exists. Absence of observation therefore produces `UNKNOWN`, observed reachability failure produces `OFFLINE`, and missing referenced authentication produces `AUTH REQUIRED`; a configured system is never removed merely because it cannot be contacted. The Configuration view changes the durable inventory through `ConfigurationStore`, not this readiness projection.

## Verification and provenance

The lane verification record distinguishes `unclaimed`, `claimed`, `evidence_collected`, `verified` and `accepted`. Policy names the evidence types required for that task. Verification fails when a required type is absent, has no passing observation, or any failed evidence remains. Acceptance is separately attributed to an actor. Every transition is persisted and appended to the event journal.

Context evidence remains non-authoritative. Git/test evidence and provider-neutral context can support a claim, but only the verification service can move the lane to `verified`; only explicit acceptance can move it to `accepted`.

## Intelligent routing

The route planner first rejects unavailable, unhealthy, unqualified, tool-incompatible, context-incompatible, privacy-incompatible and resource-incompatible options. It then compares eligible options across capability, reliability, startup latency, expected duration, monetary cost, urgency, priority, privacy/locality and stated operator preference. The scores are ordering aids rather than fabricated precision. The durable decision contains the selected option, rejected/eligible alternatives and human-readable factors.

## PTY authority

PTY discovery is separate from ownership and input. Human takeover increments an Agent Control ownership generation and fences agent writers. A stale adapter/session cannot become authorized merely by reconnecting. Input requires a current lease and ownership generation. Unknown identity blocks autonomous continuation.

## Shared context and provenance

Provider-neutral context sources include shared threads, pull requests, issues, commits, artifacts, test reports, web URLs and local files. Routing uses minimum sufficient context:

```text
Baton
  -> baton + diff/tests
  -> selected thread sections
  -> multi-agent review and synthesis
```

Independent agents remain isolated until synthesis. A judge compares evidence quality, records disagreement and links decisions to agents, repository state, tests and optional thread sources. Reproducible tests outrank repeated unsupported assertions.

Context is informative, not authoritative. A context provider cannot mutate a lease, lane, schedule, PTY or acceptance result. The recipe includes only selected source/evidence IDs and a token estimate; inaccessible context degrades gracefully to baton/repository evidence.

## Verification

3.0.x implements evidence records, evidence-weighted consensus, provenance reconstruction and recipe-level verification requirements. This 3.1 branch adds the persisted claim/evidence/verified/accepted service and makes recipe-backed Work Queue execution stop at `verification-pending`. Universal task-specific verification for every adapter/Action remains an acceptance gap, not a retroactive 3.0.1 claim.

The invariant is already binding: `agent says done` is a claim, not accepted completion. Git/test evidence remains independently authoritative for code work.

## Successive halving and learning

`ModelRecipe` fingerprints include prompt, skills, tools, context/runtime characteristics and inference parameters. `planOvernight` and `advanceStage` implement cheap-to-capability-to-replay-to-holdout-to-shadow successive halving. The recovered economic router adds cost/latency/confidence-aware selection and escalation.

Persisting winners as a governed learned-recipe catalog and feeding Run Ledger results back into qualification remain follow-on 3.1 work.

## 3.1 Job-to-harness boundary

```text
Job Catalog
       |
Schedule / Run Now
       |
      Run Ledger
       |
Agent Control policy and authority
       |
Adaptive Harness
       |
execution recipe per Job action
       |
worker / model / skills / tools / substrate
```

Jobs declare outcomes, dependencies and required capabilities. They do not name a personal machine or grant authority. The implemented reference Actions are control-owned deterministic handlers; an Action that delegates to an agent/model must use `HarnessDispatcher` and may produce a distinct recipe. This adapter is the next integration seam—Jobs do not replace or bypass the harness. The web dashboard is an operator projection/control client, never authoritative state.

## 3.1 execution acceptance invariants

1. No normal agent execution bypasses the Adaptive Harness.
2. No supported model-originated tool invocation bypasses `ToolPolicy`.
3. No Job or Schedule bypasses Agent Control authority.
4. No external context source gains control-plane authority.
5. A recipe is invalid after lease or ownership generation changes.
6. Human takeover immediately fences every recipe tool.
7. Successful execution remains distinct from verified completion.
8. Worker placement, model routing and harness scaffolding remain separate inspectable decisions.
9. Skills extend qualified competence but cannot extend authority by themselves.
10. Core Jobs and recipes require capabilities, not infrastructure-specific identities.

Invariant 1 is enforced in `WorkExecutor`; invariant 2 is enforced for gateway-based adapters and the qualified `HarnessJobAgentAction` bridge. Opaque tools performed inside an external CLI remain explicitly unqualified until their adapters expose policy-mediated operations or a separately approved, immediately fenced sandbox capability boundary.

## Bootstrap and monitoring

Bootstrap is configuration-driven, health-first and idempotent. `up` may start only configured recipes; `down` may stop only recorded owned processes. Occupied/unhealthy unknown services are never killed. With no configuration, status/up return `UNCONFIGURED` without network discovery or external mutation. The web runtime additionally registers one internal controller-local worker with only `agent-control.operator-observation.read`; it exists solely so the two read-only stages of `operator-system-observation@1.1.0` can exercise placement, artifacts and independent verification on a fresh installation. It is not a configured estate resource and cannot satisfy model, shell, provider or remote-node capabilities.

The TUI presents lanes, batons, queue state, resources, providers, PTY assignment, context/evidence and optional Android recovery. The web dashboard presents the same core projection plus typed live events, Git and verification detail. Qualification evidence is written outside the tracked tree by default.

## Optional Android resource

Android support is device-neutral. The node ID, transport, port, repository and credential environment are configured. The bundled node advertises observed capabilities and exposes only allow-listed log/status/reconnect operations. Its local ADB helper serializes pairing/reconnect attempts with stale-owner recovery, discovers DNS-SD pairing and normal-connect endpoints, accepts a pairing PIN only through local stdin, and persists no PIN. Android Wireless Debugging publishes pairing and connect service-instance names with the same stable `adb-<device-guid>` prefix but independent six-character suffixes, so correlation strips only that final suffix and does not require the complete names to match. Connection verification addresses the selected target with fixed `adb -s <endpoint> get-state` and fixed property reads, then reconciles it with `adb devices`; raw serials are represented only by SHA-256 in evidence. Boot performs only a bounded reconnect attempt; it never starts pairing. `android.adb.local` and `transport.adb` are withheld until an already paired intended device is currently connected and verification-qualified. Provisioning and first pairing still require explicit local approval.

## Conceptual-integrity gate

New capabilities are classified into policy/authority, scheduling, execution substrate, provider/model adapter, routing, context/evidence, verification/provenance, operator interface, persistence or observability. `assessConceptualIntegrity` rejects duplicate authoritative state, a second control path, interface-owned authority, provider-owned policy and capabilities without a failure mode or durable verification evidence. The operator checklist is in `docs/conceptual-integrity.md`.

## Token-Aware Baton Routing (3.7)

`Provider adapter → account-qualified model route → normalized telemetry/context-lifecycle sample → durable token governor → sealed baton → governed handoff → Work Parcel aggregate → SSE/dashboard → final evidence`

The 3.7 governor is provider-neutral. An account-bound route has identity `provider → account profile → model → execution node`; the account and node are governed route metadata, not a new provider abstraction. Adapters may report authoritative current context occupancy, but the core never derives it from lifetime token totals. Cumulative input is retained as total input plus independent fresh/cached components in thread, Job and Work Parcel records; cached input remains part of total input, and either component stays unknown when the provider does not supply enough information. A discount-sensitive calculated cost likewise stays unknown without the required cache split. It maintains a durable record per thread, context-lifecycle events (`COMPACTION`, `NEW_CONTEXT`, `CONTINUATION`, `RESUME`), and an aggregate per Work Parcel, so compaction or provider/account/model/node transitions cannot reset cost or token accounting. An explicit unavailable post-transition context count clears stale occupancy while retaining the independently known window, preventing the old pre-compaction percentage from driving a false handoff. Policy thresholds at 60/75/85/90 produce `CONTINUE`, `PREPARE_BATON`, `COMPACT`, or `HANDOFF`; routing converts that state to `CONTINUE`, `COMPACT_AND_CONTINUE`, or `BATON_AND_HANDOFF` only after considering unfinished reasoning, remaining-work bounds, capability, model and account qualification, cost, baton readiness, and policy constraints.

Codex 0.153 validates the generic pattern of budget-aware reminders, explicit context-window transitions, persisted usage and resumable history. Agent Control adopts those concepts as provider-neutral lifecycle and accounting records. Codex configuration (`features.context_management.experimental_mode`), history notes, the model-only `new_context` tool, app-server methods/events, raw Responses metadata and OTEL turn-cost lookup remain inside the Codex adapter. The current governed Codex execution route uses bounded ephemeral JSONL and does not claim the experimental mode or app-server-only telemetry. Its `turn.completed.usage` is cumulative turn consumption and cannot establish current occupancy; only a distinct context event may drive pressure. A future qualified persistent Codex adapter may use native resume/compaction within account, node, workspace, lane and policy boundaries, while the core sealed-baton and continuation fallback remains authoritative and executable if Codex disappears. See the [Codex 0.153 review](docs/provenance/EXTERNAL-EVIDENCE.md).

The sealed baton is written before the existing governed handoff runtime changes any worker. It carries task/diff/test/evidence/next-action provenance, originating provider/account/model/node, and token/parcel state, while the original contract/thread remains recoverable. The destination is resolved with its exact configured account and node, and invocation results must agree with all four sealed identity fields; this prevents a baton from accidentally executing in the source authentication context. Failed handoffs resume the original account/model/node and record the failure; no route component is silently substituted. The dashboard reads the redacted projection over the existing SSE channel, while sampled telemetry and every transition/decision remain in the durable token-routing evidence for reconciliation with Work Parcel verified-outcome accounting.

The production parameterized repository-review path now supplies the concrete integration boundary. After one immutable context chunk returns a schema-valid result, `DirectRepositoryReviewExecutor` assesses the live source thread if another bounded chunk remains. An approved route creates the sealed token baton and uses `GovernedHandoffRuntime` `DELEGATE` to create a capability-bounded child `ContractExecution`. The child invokes the exact registry-resolved destination over the next frozen chunk. Destination failure marks that child failed and invokes the same chunk on the still-active source route; success makes the child the verification owner. Existing `ParameterizedJobEngine` repository validation independently verifies the consolidated result and records its pass/fail meaning only on the successful attempt's Work Parcels and surviving contract. A durable monotonically increasing execution sequence prevents token-thread identity reuse after process restart. Source, destination and recovery usage remains additive in the same parcel; configured monetary ceilings fail closed if neither provider reporting nor configured pricing can measure cost. See [Token-Aware Baton Routing](docs/token-aware-baton-routing.md).

The same production boundary can optionally receive a preconfigured independent `RepositoryReviewQualityGate`. The gate sees only the frozen request/chunk, schema-valid result, sealed route and response hash; it cannot inspect private reasoning or choose an arbitrary provider. A rejection enters the generic governor as a typed `QUALITY_GATE` trigger with a stable code, bounded evidence and unresolved criteria. The governor chooses only a registry-declared, qualified fallback in policy order, then seals the source result and exact next action before dispatch. This route change is independently distinguishable from context pressure, timeout and provider failure. The destination must pass the same gate, and any route-identity mismatch or unsuccessful handoff fails closed while retaining source recoverability.

Transient provider exhaustion uses the same production boundary through a distinct `PROVIDER_FAILURE` trigger:

`sealed route → provider invocation → safe transient classification → bounded same-route retry → retry exhausted → governor capability/account/node filtering → sealed failure baton → governed destination → destination invocation → independent verification`

The failed invocation remains a failed Work Parcel leg with its own duration and whatever usage the provider actually reported. It is not converted into model-quality evidence and is not removed when a later retry or fallback succeeds. The failure baton records the immutable repository SHA, clean/dirty state, completed preparation, failure classification, evidence references, unresolved review work, exact next action, source route and aggregate accounting. A destination must match the governor-sealed provider/account/model/node identity. No candidate means fail closed; destination failure leaves the original thread recoverable. Parameterised Run accounting adds every known leg and carries an explicit unknown-invocation count when any failed provider attempt lacks usage or cost.

OpenAI-compatible HTTP waits use a dedicated dispatcher whose header/body timers do not pre-empt Agent Control's bounded invocation `AbortSignal`. Native Undici timeout codes and opaque transport failures are normalized at the adapter boundary, not interpreted by core routing policy. This does not claim control over provider-side, proxy or network deadlines: an external timeout remains an observed provider/transport boundary and is classified from the available evidence.

## Governed UX Session Capture and Interactive Replay (4.4)

`UxSessionRecord` is an immutable, content-hashed projection of evidence Agent
Control already owns. It is not a scheduler, screen recorder, provider log,
telemetry database or second event ledger. Live Runs continue to own Job, Work
Parcel, route, baton, gate, provider, token, cache, memory and verification
facts. `ExecutionHistoryProjection` remains the generic source for ordinary
Runs; historical qualification import binds an exact Git object and its
SHA-256. Unknown facts remain unavailable.

```text
Run / Work Parcel / POE / Crew / provider / ContextGraph / evidence
                              |
                  deterministic safe projection
                              v
                 sealed UxSessionRecord + SHA-256
                    /        |        |        \
          interactive      MP4   transcript   digest
             replay                    |
                    common session ID + manifest
```

Audience policy is applied when a representation is rendered, not by weakening
canonical evidence. `UX_ONLY` and `UX_INTERACTIONS` are intentionally sparse;
`EXECUTION_OVERVIEW` adds route/lane/gate outcome; `SANITISED_DIAGNOSTIC` adds
declared bounded input/output and tool detail; `AUTHORISED_FULL_EVIDENCE`
remains operator-authenticated. Every projection is independently passed
through the ordinary credential redactor and sensitive-material assertion.
Undeclared fields fail closed by construction.

A share record contains session identity/hash, audience, expiry/revocation and
only the SHA-256 of a random capability. The one-time capability travels in the
URL fragment, so it is not sent in the initial HTTP request or referrer; the
player moves it into a bearer header for the bounded share API and removes it
from browser history. The API is read-only and exposes no dashboard mutation,
shell, repository, filesystem or rerun route. Annotations are a separate
overlay tied to session and event hashes; operator authority may associate one
with a later Work Parcel without altering the session.

Memory replay is provider-neutral. It records requested, provenance-validated,
accepted/rejected and supplied lifecycle decisions while keeping memory content
hidden unless separately authorised. MARM can satisfy a future generic memory
port, but neither the record nor player depends on MARM.

The presentation contract is deliberately distinct from those implementation
terms: **Your Memories** is the user-facing Agent Control capability; the
generic memory abstraction is the internal architecture; MARM is one optional
backend. Normal Morrow, dashboard and replay views use only `Your Memories`.

See [UX Session Replay](docs/ux-session-replay.md) and the
[physical qualification](docs/evidence/agent-control-4.4-ux-session-replay-20260911.md).

## Human-readable execution history (3.8.2)

`Durable Job Run + Work Parcel audit + token/governor evidence + sealed baton state → bounded redacted projection → AgentControlService → existing HTTP/SSE dashboard`

`ExecutionHistoryProjection` is an operator view, not an event store, scheduler, verifier, provider transcript or policy engine. A Saved Job Run selects only the Work Parcel IDs already sealed into that Run; a Lane selects only its own lane state. The projection orders those associated records deterministically and labels their original actor class. Reloading or reconnecting rebuilds the same view from durable sources, while new SSE notifications cause the dashboard to fetch the updated canonical projection.

`ExecutionTranscriptRuntime` materialises the `mode: complete` Run projection as Markdown whenever its Run, associated Work Parcel, token/governor record or baton changes. Unlike the bounded dashboard card list, the transcript projection has no entry-count cap. Each document has a SHA-256 over the rendered content and a separate SHA-256 over the deterministic source projection; its adjacent manifest records Run, Saved Job, terminal state, Work Parcel IDs and entry count. Startup refresh reconstructs the same document from durable records and an integrity check rejects a changed file. The transcript is still a projection rather than a second event ledger, and it receives neither raw provider transport output nor hidden reasoning.

The complete association is `Saved Job → immutable Run → owned Work Parcel IDs → provider invocation/audit + token governor + baton/handoff evidence → independent verification/accounting → Run history`, alongside the Lane-local objective, route, baton and verification projection. Similar timestamps or display labels never associate records across Run, Parcel or Lane boundaries.

Current-context occupancy and cumulative usage remain different fields with explicit `authoritative`, `estimated` or `unavailable` status. The projection derives the governor state for each sample using the policy stored with the evidence, rather than applying the thread's final state retroactively. Estimated occupancy above a known context limit is displayed as a 100% clamp and explained as an estimate. Job and Work Parcel totals are reconciled separately; an unavailable cached-input component is not changed to zero.

A sealed baton entry proves only durable creation. `HANDOFF_RECOMMENDED`, `HANDOFF_REQUESTED`, `HANDOFF_COMPLETED` and `HANDOFF_FAILED` are distinct and are derived from durable routing outcomes; a completed handoff is never inferred from context pressure or baton existence. The projection may display a validated provider result, but it does not retain or reveal raw prompts, rejected bodies, hidden reasoning, authentication data, emails or resolved credential paths. See [execution history](docs/execution-history.md).

Repository-review structured output has one semantic contract at both boundaries. The provider-facing JSON schema declares the application validator's required literal, enums, non-empty strings, positive line numbers and confidence range. The application still validates independently and fails closed. New failures retain a bounded list of safe JSON paths and constraints; raw rejected responses remain ephemeral and are represented only by their response hash and usage evidence.

For Codex/ChatGPT authentication, each account profile contains only opaque ID, safe label, optional plan/capability metadata with authority, qualification state, execution `nodeId`, and a credential-store reference naming an environment variable. A controller-local profile resolves that variable in the existing child-process path and strips ambient `OPENAI_API_KEY`/`CODEX_API_KEY` values before launching account-bound Codex, preventing an unrelated API billing identity from overriding the selected profile. A remote Windows profile is dispatched through the configured SSH resource to `CodexNodeExecutionPort`, whose API permits only `accountStatus` and `execReadOnlyStructured`. A fixed encoded bootstrap reads a base64 request data line and the audited runner source separately from stdin, then passes the request to that runner as an argument; identities, prompt data and schemas never become generated PowerShell source. Windows resolves the named environment reference locally, discovers and validates candidates beneath `%LOCALAPPDATA%\OpenAI\Codex\bin\*\codex.exe`, and returns only CLI version, executable SHA-256, discovery time and sanitized structured execution data. Raw stdout/stderr, executable paths and credential paths do not cross into evidence. Account selection is explicit Saved Job policy or predetermined model-role fallback. Utilization, rate-limit or quota exhaustion never triggers account rotation.

## Provider-neutral persistent context and capability intelligence (3.9)

The 3.9 orchestration layer is deliberately above provider/runtime adapters:

```text
Provider or runtime
        |
        v
Capability adapter/observation
        |
        v
Agent Control capability model ---- frozen historical qualification
        |                                      |
        v                                      v
capability-first policy/router <----- model economics/regression history
        |
        v
Work Parcel DAG -> active state + immutable event ledger + retrieval
        |                                      |
        +---- bounded baton view ---------------+
        |
        v
JobRuntime -> independent safety -> execution -> criterion verification
```

`CapabilityIntelligenceStore` normalizes capability identity separately from a provider brand. An observation binds an optional provider/model/runtime/version subject to `SUPPORTED` or `UNSUPPORTED`, `NATIVE` or `AGENT_CONTROL_EMULATED`, `VERIFIED` or `UNVERIFIED`, confidence, timestamps, limitations and evidence. Configured advertisement is only unverified evidence; a later verified observation wins for routing. Provider discoveries enter a durable candidate lifecycle (`DISCOVERED → ANALYSED → EXPERIMENT → QUALIFICATION → ADOPTED/REJECTED/DEFERRED`) and cannot silently modify policy. This lets Agent Control adopt a generally useful pattern while leaving a native API behind its adapter. If that provider disappears, the core contract and any qualified emulation remain executable.

`ParcelContextState` has four related but non-interchangeable views. Active state holds the immutable original goal plus current interpretation, constraints, plan/stage, dependencies, unresolved questions, approvals and route. A SHA-256-linked append-only event ledger retains decisions, failures, tool/test results, retries, steering, routing, verification, cost and token observations. Governed retrieval selects relevant historical events by exact filters or bounded relevance scoring. A baton is a size-bounded, content-hashed operational projection of active state plus selected event/artifact references; it is neither the transcript nor the only copy of history.

Success criteria carry stable identity, type, source provenance, scope, required evidence and independent evaluation. `model says done` remains only a claim. Steering amendments append to the original goal and are accepted/rejected explicitly. Questions identify their originating and dependent stages; only those dependencies wait. `WorkParcelCoordinator` validates an acyclic graph and dispatches every ready independent stage allowed by worker capacity and policy, then joins only after declared predecessors succeed.

`rankCapabilityRoutes` first requires verified capabilities and records whether native or Agent-Control-emulated support satisfied each requirement. It then compares only eligible routes using qualification confidence, observed task quality/reliability, known cost/latency, token/cache efficiency, availability, account/node state, locality and privacy constraints. Missing data remains unknown. The selected and rejected alternatives, scores and reasons are durable.

`ModelIntelligenceLedger` preserves immutable frozen-suite batches and attempts rather than overwriting a latest score. The suite hash seals versioned prompts, required capability, evaluator kind, scoring rule, safety/success criteria and repetition count. Metrics retain fresh input, cache reads, cache writes, output, elapsed time, retries and actual/calculated cost independently. Rolling 7/30/90-day and all-time views, regression warnings and cost/tokens/time/retries per verified outcome use only measured attempts. Lifecycle promotion is conservative and evidence-gated; same-day candidate results do not manufacture a preferred model or leader.

`RuntimeSafetySupervisor` is injected into the existing `JobRuntime` boundary. It independently evaluates requested scope and action metadata, persists the decision and approval trail, and returns `ALLOW`, `ALLOW_WITH_AUDIT`, `REQUIRE_APPROVAL`, `DENY`, `PAUSE` or `ESCALATE`. Provider-native safety can add evidence but cannot replace this decision or grant authority.

For consequential repository operations, an Action registration may also provide a typed semantic-effect resolver. `JobRuntime` invokes it before safety assessment, compiles immutable Work Parcel constraints into resource capabilities, and supplies the governed plan to the Action only after the supervisor allows it:

`proposal → action normalization → semantic effect resolution → resource/capability intersection → runtime safety decision → dispatch → external-state reconciliation`

The first adapter is `repository.git-governed@1.0.0`. It resolves remote Git writes to logical resources such as `git-ref:origin/master`, including explicit refspec, force, delete, mirror, wrapper, chain, remote-alias and `git -C` forms. A read-only resource policy denies every intersecting `CREATE`, `UPDATE`, `FORCE_UPDATE`, `DELETE` or `REWRITE` effect before subprocess creation. Accepted operations are argv-only and shell-free. Ambiguous destinations and unresolved execution semantics fail closed; this is an adapter boundary, not a core command blacklist.

`repository.git-propose@1.0.0` is the model-facing Action. It performs bounded read-only inspection and obtains a strict structured proposal through the existing provider registry and adaptive harness. The exact provider/account/model/node route is sealed in the proposal artifact and checked again before governed execution. `repository.git-protected-ref.verify@1.0.0` owns independent remote-ref verification. This preserves the boundary: model intelligence proposes work; Agent Control grants or denies effects.

Consequential effects carry operation-level truth independently of Run completion: `PROPOSED → AUTHORISED → EXECUTING → EXTERNALLY_COMMITTED`, with `CANCELLED_BEFORE_COMMIT`, `COMMIT_STATE_UNCERTAIN` and `FAILED` alternatives. Remote-ref observation reconciles interrupted Git operations where possible; uncertainty remains explicit. The Run and safety ledgers preserve the proposal effect, resource, policy, actor/stage/route identity, governor decision, reason, state and timestamps without retaining hidden reasoning. See [protected-resource mutation governance](docs/protected-resource-governance.md).

The web dashboard is a redacted projection of these same stores. Existing SSE events refresh Work Parcel context, questions, criteria, steering, capability candidates/observations, frozen batches, historical metrics, regression warnings, leader slots and safety decisions. Event-stream startup is independent of optional panel availability, and a missing optional subsystem is shown locally rather than disabling live control-plane updates.

## Evidence-driven adaptive orchestration

The adaptive workstream adds a provider-neutral evidence layer around the existing Work Parcel lifecycle:

`classify → compile required capabilities → apply policy → enumerate eligible models/workflows → consult task-specific leagues → compare quality/cost/latency → select → execute → quality gate → verify → update evidence`

The **harness profile** (`THIN`, `STANDARD`, `DEEP`) controls context, tools and execution envelope. The **model execution class** (`LOCAL`, `SPARK`, `STANDARD`, `FRONTIER`) controls the governed model tier. The adaptive leagues are neither of these classifications: they rank qualified route identities and complete workflow strategies for the current task class. Token-aware context pressure remains a separate governor; high pressure alone does not cause a cheaper route, and difficult unfinished reasoning remains on the stronger route unless policy and evidence permit a handoff.

`AdaptiveOrchestrationRuntime` persists a snapshot under the configured state directory. Its model league key includes task class, provider, opaque account profile, model, execution node and model version. Its workflow league key includes strategy ID and version. Each evidence record retains its source class (`BENCHMARK`, `QUALIFICATION` or `PRODUCTION_WORK_PARCEL`), usage/cost authority, quality-gate result, retries/escalations, latency, reliability, evidence age and trend. Benchmark and qualification measurements are visible alongside production observations but are not silently collapsed into one untraceable score. Age decay, minimum samples, confidence and policy quality floors prevent a sparse or stale winner from becoming a universal default; when multiple routes have some verified evidence but remain below the preference threshold, the configured exploration rate permits a bounded deterministic sample, while no-evidence routes retain declared-order precedence.

Every parcel receives an immutable-at-decision operational tree with parent-linked nodes for request, classification, required capabilities, policy, eligible candidates, league evidence, trade-off, route, execution, quality gate, verification, escalation and evidence update. Facts include timestamps, candidate identities, scores, sample/confidence, authority markers, policy constraints, reason codes and resulting actions. Prompts and private model chain-of-thought are not part of this tree. A human-readable report and dashboard view are projections of the same stored record, so historical decisions remain reconstructable after later league updates.

In the normal `WorkParcelCoordinator`, the selected adaptive route is handed to the existing `ModelRegistry` and `JobRuntime`; worker placement, locks, approvals, provider qualification, node availability, action execution and independent verification remain authoritative. In the repository-review executor, the same decision record observes provider invocations and records the existing token governor, baton and contract/handoff events. A destination or workflow failure is classified as operational evidence and does not reduce model quality unless an independent quality gate produces a verified model outcome. The original parcel and source route remain recoverable.

The dashboard's **Routing** tab reads `/api/orchestration/models`, `/api/orchestration/workflows` and the persisted decision/report endpoints. Filters are evaluated server-side from canonical evidence. The existing SSE stream and dashboard refresh keep this read-only view current. Adding a future fast model or provider requires an adapter, qualification and candidate registration; core league scoring and decision-tree reconstruction do not change. If Codex disappears, the same stores, policy and Work Parcel integration continue to operate with any qualified local, API, edge or future provider.

Detailed configuration, API filters, evidence semantics and deterministic qualification are in [`docs/adaptive-multi-model-orchestration.md`](docs/adaptive-multi-model-orchestration.md). This workstream does not claim a physical provider qualification merely because the deterministic suite passes.

## Morrow conversational host

The public identity is defined by `HOST_IDENTITY`. Stable `poe` API/event/storage identifiers and `Poe*` runtime types remain compatible; existing transcripts and approval hashes are never rewritten. The six robot roles remain projections of the existing crew state. See the [identity guide](docs/morrow.md).

Morrow is a presentation and proposal layer above `AgentControlService`, never a replacement scheduler, governor, execution provider, verifier, credential resolver, or authority service:

```text
authenticated dashboard / WhatsApp / OmniVoice / mobile
                            |
                 channel-scoped conversation
                            |
             focused typed evidence references
                            |
       deterministic renderer or routed response-model port
                            |
       explanation / versioned benchmark proposal
                            |
          freeze SHA-256 -> explicit approval
                            |
 WorkParcelCoordinator -> registered Job DAG -> normal control lifecycle
```

`PoeRuntime` persists bounded turns, real UI state transitions, proposal revisions, speech boundaries, and transcript metadata in an owner-only store. The public system snapshot exposes only a safe Morrow summary; authenticated endpoints expose the operator's own conversations. An evidence port maps stable object references to bounded facts and source IDs from models, Jobs, Runs, Work Parcels, lanes, Crew, routing/governor decisions, capabilities, batons, Live Shell, verification, benchmarks, and human evaluation. Missing records remain unavailable. Provider output and repository/log content remain untrusted data and cannot redefine Morrow's authority.

The optional `PoeResponseModelPort` keeps conversational generation provider neutral. `RoutedPoeResponseModel` asks the existing Model Registry for either a status or experiment-design role and then uses the existing Codex or OpenAI-compatible adapter. It requires strict structured output, known evidence citations, no hidden reasoning, and records the actual provider/account/model/provider-execution-node route plus token/cost authority. Failure does not silently select another model: the turn explicitly changes to the deterministic grounded renderer. This also bounds cost by allowing routine lookups and difficult design explanations to use different qualified roles without changing the Morrow persona.

Benchmark proposals seal the operator question, evidence need, complete condition matrix, Job stages, metrics, repetitions, and constraints. Fairness blocks unequal immutable fixture, tools, context, authority, cache, or time limits and discloses software, hardware, quantisation, and endpoint confounders. Objective metrics become Work Parcel success criteria; `HUMAN_EVALUATION` remains separate. Repetitions materialise as distinct Job stages. Freeze creates no execution authority, and approval must match the exact revision and hash. The resulting origin binds `poe/dashboard`, conversation, proposal, frozen hash, actor, and request key before entering `WorkParcelCoordinator.submitApprovedPlan`.

OmniVoice remains behind existing STT/TTS contracts. Morrow accepts only an original designed voice, retains the transcription as untrusted content, records available turn-latency boundaries, and aborts only synthesis on barge-in. The Social & Voice coordinator accepts authenticated `Morrow:` questions and legacy `POE:` aliases into a distinct identity-hashed WhatsApp conversation; consequential work remains governed by existing template/text-confirmation or frozen-proposal approval flows. Live Shell remains independently authoritative for attachment and steering.

The floating browser companion is a client of this same service. Its compact panel leaves underlying dashboard navigation usable. Explicit tour selection unlocks browser audio, navigates and highlights a real component, requests a sourced explanation, and keeps Next disabled until the audio element emits completion. Autoplay, decoding and synthesis failures pause the tour; interruption invalidates older playback. Mouth movement uses the actual audio analyser, while runtime states and references drive restrained poses. Reduced motion disables these transforms and mouth modulation.

`PoeOperatorRuntime` exposes real executable-job and schedule catalogues and an allowlisted default-input proposal adapter. Approval rechecks the actor, sealed request, definition/policy hashes, expiry and live worker capability before normal Work Parcel submission. `PoeKnowledgeIndex` reads only approved, bounded repository sources, hashes their contents and overlays live/configured observations. A retrieved instruction never becomes approval. Read-only remote registries do not grant remote execution or establish device/session readiness.

`reconcilePoeBatch` requires terminal parents, no active children and no outstanding verification criteria before a final requested-set announcement. `poeParcelHandovers` reads actual sealed v2 batons and observes destination Run identity/start time before reporting receipt. Relay/Verity presentation labels do not imply a separate autonomous model. A harmless observation's separate deterministic artifact verifier proves artifact structure and integrity, not Facebook or remote-device readiness.

The optional external full-test runner publishes bounded atomic progress with exact Git commit, phase, emitted counts, elapsed time and exit status. Its authenticated read-only projection is labelled `EXTERNAL_TEST_RUNNER` and never creates a Work Parcel. Totals and remaining counts stay null until discovered. Morrow narrates snapshots as observations because complete-audio synthesis introduces delay.

The detailed contract, [event-to-animation mapping](docs/poe-dashboard-operator.md#state-and-animation-provenance), current [deployment guide](docs/DEPLOYMENT.md) and historical [4.1 qualification record](docs/provenance/EXTERNAL-EVIDENCE.md) define the configuration and acceptance boundary.

## 4.5 energy-minimal deterministic skill promotion

Agent Control keeps three forms of reuse separate: **Your Memories** answers
what is known, a deterministic skill answers what can already be done inside a
validated contract, and a model reasons about novelty. The preferred hierarchy
is deterministic result/rule → deterministic tool → validated memory retrieval
→ governed deterministic skill → specialist → progressively stronger general
models. Capability, confidence, policy, freshness and verification always outrank
energy.

The provider-neutral promotion lifecycle is `reason → verify → observe repeated
Work Parcels → candidate → validate → explicit promote → deterministic reuse →
periodic revalidation/invalidation`. Durable records bind source parcels,
originating route, evidence, assumptions, typed contracts, scope, version,
freshness, invalidation conditions and a hash-identified pre-registered handler.
Models may propose but cannot install executable code or promote themselves.

The production Work Parcel Action rechecks handler identity and applicability
before execution and runs an independent deterministic invariant afterward.
Novel fields, stale evidence, conflicting or invalid memory, environment/contract
change and failed verification result in a durable `ESCALATE_MODEL` decision.
Successful escalations become candidate evidence only after governance; there is
no online self-modification.

Project memory may retrieve a validated skill identity without injecting memory
text into a model. Learned specialist adapters remain a separate layer for fuzzy
bounded domains that cannot safely become deterministic. Warm-cache state is
orthogonal to both.

## Release boundary

### Source distribution and qualification evidence

The product Git repository and qualification evidence archive are separate
delivery surfaces. Product history contains executable source, documentation,
schemas, configuration, tests, lightweight fixtures and small reviewed evidence
summaries. Heavy recordings, screenshots, binary captures, complete
qualification working trees and oversized raw evidence are external artifacts
identified by immutable SHA-256 and provenance manifests.

This separation changes storage and transfer, not the evidence model. A
lightweight source record may reference an external artifact, but the artifact
remains authoritative at its recorded hash and historical verdict. The external
archive also retains a complete pre-rewrite Git bundle and old/new ref mapping.
Release packages are produced from the source tree only; evidence archives are
separate release assets. See [qualification evidence archive](docs/evidence-archive.md).

Earlier version tags remain immutable source releases. Agent Control 4.0.0 integrates Crew/WOPR, adaptive orchestration, protected-resource governance, Social & Voice/OpenWA provenance and Live Shell. The source release does not deploy services, expose a remote ACP listener, broaden sharing, enable Spark, enable Saved Jobs/Schedules or admit NVIDIA routing. Its controller-local NVIDIA credential exists only in the owner-only runtime store and is not source or evidence. The accepted 4.0 evidence adds protected-resource proof and a physical Pixel social request through adaptive Qwen-to-Codex baton handoff, independent verification, terminal delivery, dashboard/video reconciliation and additive token accounting. Current context and billed cost remain unavailable on the tested routes, so no monetary or context-occupancy claim is made. The NVIDIA catalogue remains routing-disabled: Nemotron/Muse callability is observed, MiniMax is indeterminate and Kimi K2.6 endpoint-unavailable. See the [4.0 qualification](docs/provenance/EXTERNAL-EVIDENCE.md), [Pixel continuation](docs/evidence/agent-control-4.0-pixel-social-continuation.md), [initial NVIDIA qualification](docs/evidence/agent-control-3.9-nvidia-hosted-qualification-20260906.md) and [focused diagnostics](docs/evidence/agent-control-3.9-nvidia-focused-diagnostics-20260906.md).

## Optional messaging adapters

The channel-neutral messaging command contract binds immutable approved Job definitions and finite argument values to enrolled operator grants. OpenWA verifies signed message provenance, pairs a separate human through authenticated dashboard confirmation, and calls the existing application service. Durable command identities reconcile with the RunLedger across interrupted acknowledgements. SQLite stores an independent outbound queue and safe audit metadata; gateway failure never owns scheduler state or approvals. See [OpenWA architecture and recovery](docs/openwa/README.md).

### POE 4.1 evidence and deployment boundaries

The browser projects recorded conversation, Work Parcel, job, receipt and
verification state; it does not create execution authority. The original-male
speech worker produces and validates complete audio before browser playback.
Audio-ended progression and playback-attempt fencing keep tour navigation and
interruption attached to the current audio element. Edited demonstration media
removes waiting time and must not be treated as a synthesis-latency measurement.

Deployment separates immutable source from mutable controller state and
credential references. One supervised controller owns each state directory;
the optional loopback speech worker has separate ownership. Existing monitoring,
social and scheduled-job controllers are not repointed by a POE rollout. A
state-consistent backup and the previous startup identity support rollback.
The [4.1 qualification record](docs/provenance/EXTERNAL-EVIDENCE.md)
reconciles physical component hashes and the exact full-suite product SHA with
any later documentation-only release commit.

## 4.3 effect authority and filesystem containment

The production Job boundary admits an Action only when its registration supplies
one of three authoritative contracts: explicitly read-only, explicit
consequential categories, or a typed effect resolver. Names, goals, descriptions,
capability labels and parameter keys can make a decision more restrictive, but
cannot grant authority. An absent, empty, ambiguous or inconsistent declaration
becomes `UNKNOWN` and is denied before the handler starts. `DENY` has no approval
transition; approval can resume only an explicitly approvable policy outcome and
cannot expand the parent Work Parcel contract.

Approved local paths are checked against the filesystem seen by the execution
node. Existing roots and targets use canonical filesystem identities. A new
output is evaluated by resolving its nearest existing parent and appending the
remaining lexical path. This rejects traversal, sibling-prefix confusion and
symlink escape. A controller cannot claim containment for a Windows or other
remote path it cannot resolve; the typed node adapter must enforce it locally or
the route fails closed. Canonicalization is not described as eliminating races:
handlers revalidate at execution, use typed operations, fixed argv/data channels
and provider/OS sandboxes where qualified. Routes lacking a required enforcement
capability are not silently run unrestricted.

Governed Git resolves semantic effects before dispatch, compiles protected-ref
policy, requires approval where configured, and reconciles external commit state.
Its execution adapter revalidates the canonical working directory, disables
repository hooks and filesystem-monitor helpers, suppresses terminal credential
prompts and rejects configuration mutation. External CLI internals that cannot be
moderated remain a declared limitation rather than being represented as ToolPolicy
coverage. See [runtime safety and route containment](docs/runtime-safety-and-containment.md).

Cleanup follows ownership and provenance. Ordinary tracked/untracked mutations,
valuable ignored files and explicitly disposable generated roots are separate
classes. Fast execution hashes valuable ignored state before and after execution;
only named disposable roots such as its dependency installation are excluded.
Unexpected ignored mutation is an out-of-scope change and escalates without
deleting or committing operator state.

## Agent Control 4.5 Cross-Device Session Vault

Session Vault is an evidence subsystem beneath governed continuation, not a
memory replacement and not an execution authority:

```text
provider-native session bytes
  → provider capability adapter
  → immutable content-addressed object + sealed redacted event index
  → historical search / repository provenance / replication
  → governed lease + repository verification
  → sealed continuation sources
  → existing governed session + Work Parcel + independent verification

approved, independently validated finding
  → existing ProjectMemoryPort (Your Memories; Obsidian optional)
  → advisory retrieval with native evidence link
```

Core storage, policy, search, replication, leases, attribution and continuation
contracts are provider-neutral. Codex JSONL parsing is isolated in
`CodexSessionAdapter`; another provider declares what it can authoritatively
expose and unavailable fields remain unavailable. Raw bytes are never rewritten
to fit the common event model. The normalized index is a convenience projection
whose events retain native object and sequence provenance.

Cross-device continuation is contextual, not hidden-state transport. It binds
the source object, redacted index, repository state, Work Parcel and any
validated Your Memories records. An exclusive lease prevents split-brain
mutation; acquisition, renewal, release, forced release and denial are durable
hash-verified events. Read-only retrieval remains safe during a conflicting
continuation attempt. See [Session Vault architecture](docs/session-vault.md)
and [threat model](docs/session-vault-threat-model.md).

## Raw inference and writable-workspace governance

The Lab may request a single qualified model invocation through `DirectInferenceRuntime`. This route is explicitly `RAW_INFERENCE`; it bypasses agent/tool loops but does not bypass model qualification, credential profiles, target binding, timeouts, cancellation, redaction, usage accounting or operator authentication. A returned tool call is a contract failure. The existing harness ledger remains the accounting authority and a content-addressed evidence object retains the exact redacted request and response.

Write authority over ordinary workspace content is separate from governance metadata authority. `protected-workspace-metadata.ts` provides the platform-neutral decision. Writable adapters must enforce it or report degraded/blocked support; they cannot infer that `.git`, Agent Control/Codex control directories, instructions, parcel/baton records or evidence integrity files are writable merely because their parent workspace is writable.

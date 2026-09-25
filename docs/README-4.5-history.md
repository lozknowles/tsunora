# Agent Control 4.5.0 candidate

The 4.5 candidate now includes a governed **Setup & Environment Discovery**
wizard and a live **Estate Map** alongside Process Map. It inventories real
machines, accelerators, runtimes, models, CLI agents, providers, tools and
credential presence through pluggable read-only adapters; detects change; and
separates discovered, qualified, recommended, approved and active state. The
shared graph answers either “what is Agent Control doing?” or “what can Agent
Control currently see and use?” without treating stale discovery as aliveness.
User-supplied executables and portable capability definitions follow a gated
review/test/approval lifecycle. See the [setup, discovery, capability and Estate
Map guide](environment-discovery.md) and [Runtime Map guide](runtime-map.md).

Agent Control 4.5 now includes an experimental **Runtime Map** and **Control
Room**: a live, accessible graph projected from the existing Work Parcel, Run,
execution-session, baton, model, cache, memory and verification records. It
supports leader-level live KPIs, dynamic parallel fan-out, nested grouping,
semantic collapse, pan/zoom/fit, evidence drill-down, authenticated Live Shell
links, historical Replay, and side-by-side graphical Compare using independent
authoritative identities. Exact resource identities link Process Map work to
Estate Map resources and back without matching display labels. Morrow can
narrate only grounded transitions from the same projection. See the [Runtime Map
operator and architecture guide](runtime-map.md) and [physical
qualification](evidence/agent-control-4.5-runtime-map-visual-acceptance-20260912.md).

## Agent Control 4.5 in operation

These are real 1920×1080 dashboard captures from the frozen 4.5 release-closure
candidate `d229ce4b7dd3bd704a331f81ca59600541430682`. The fresh Runtime Map run
executed six jobs concurrently and projected 71 authoritative operations; the
Estate Map was built from a read-only physical discovery scan. They are not
mockups or reconstructed marketing screens.

### Dashboard overview and real Estate discovery

![Agent Control 4.5 Environment Discovery dashboard populated from a real read-only scan](https://github.com/lozknowles/agent-control-qualification-evidence/releases/download/source-separation-20260912/dashboard-overview.png)

![Agent Control 4.5 Estate Map showing the resources established by the real discovery inventory](https://github.com/lozknowles/agent-control-qualification-evidence/releases/download/source-separation-20260912/estate-map-real-discovery.png)

### Six concurrent jobs and Control Room

![Agent Control 4.5 Process Map with six governed jobs visibly running in parallel](https://github.com/lozknowles/agent-control-qualification-evidence/releases/download/source-separation-20260912/process-map-six-jobs-running.png)

![Agent Control 4.5 Control Room showing the same six real concurrent jobs](https://github.com/lozknowles/agent-control-qualification-evidence/releases/download/source-separation-20260912/process-map-control-room.png)

### Authoritative Replay/Compare

![Agent Control 4.5 graphical Compare view showing a 13-operation baseline beside the 71-operation candidate](https://github.com/lozknowles/agent-control-qualification-evidence/releases/download/source-separation-20260912/process-map-compare.png)

The checksummed [release-closure report](provenance/EXTERNAL-EVIDENCE.md)
links the screenshots, HD recordings, complete transcripts, Work Parcels,
batons, model usage and the 1,312-test regression result to the exact candidate.

The experimental 4.5 **Cross-Device Session Vault** preserves provider-native
session history as immutable, content-addressed evidence and makes its redacted
index available for historical search, repository attribution and governed
continuation on another node. It extends—not replaces—**Your Memories**:
reusable knowledge reaches the existing `ProjectMemoryPort` only after approval
and independent validation, retaining links to the native evidence SHA-256.
Obsidian remains an optional Markdown view/backend. The production dashboard
includes Session, Decision, Repository Provenance, Continuation, Replication and
Policy views, and POE can answer historical questions without treating history
as current execution authority. See the [operator and architecture guide](session-vault.md),
[threat model](session-vault-threat-model.md), [recovery guide](session-vault-recovery.md)
and [physical qualification](evidence/agent-control-4.5-session-vault-physical-qualification-20260912.md).

Agent Control 4.5 now tests an energy-minimal execution hierarchy: known
deterministic result, deterministic tool, validated **Your Memories** lookup,
governed deterministic skill, specialist model, small general model, stronger
general model, then premium reasoner. Repeated verified model reasoning can be
nominated—but never automatically promoted—as a versioned deterministic skill
whose handler identity, source Work Parcels, contracts, assumptions, freshness,
invalidation conditions and independent verifier are durable. Contract mismatch,
novel state, stale evidence or failed verification escalates instead of forcing
reuse. See the [skill promotion guide](deterministic-skill-promotion.md) and
[physical evidence](evidence/agent-control-4.5-deterministic-skill-promotion-20260911.md).

Agent Control 4.5 adds governed local skill learning: a repeated bounded task may
be proposed as a candidate, but training begins only after an approved,
provenance-bound dataset and frozen baseline exist. A learned specialist is the
explicit composition of an immutable base model, a versioned adaptation and
independent qualification evidence. Only materially improved, current and
compatible compositions may enter ordinary governed routing; the base route
remains available and inappropriate tasks fail closed before adapter loading.

The initial physical qualification uses CPU LoRA over a pinned 135M-parameter
base for strict route-intent JSON. It keeps active GPU-backed voice and model
services untouched and distinguishes learned adaptation from transient Warm
Expert/cache state. The **Learned Specialists** dashboard and Morrow expose the
candidate lifecycle, exact identity, measured improvement, limitations and route
decisions without implying uncontrolled online learning. See the
[operator guide](skill-learning.md), [architecture decision](agent-control-4.5-skill-learning-architecture-review.md),
[qualification](evidence/agent-control-4.5-governed-skill-learning-20260911.md)
and [deployment guide](DEPLOYMENT.md).

The separate 4.5 **Your Memories** portability experiment adds a
provider-neutral structured-Markdown memory port with bounded metadata/lexical
recall, provenance and freshness checks, explicit conflict rejection, atomic
node-local writes and content-addressed synchronization rules. Obsidian is one
viewable storage substrate, not a core dependency. The original
[physical cross-model qualification](provenance/EXTERNAL-EVIDENCE.md)
passed 5/12 requested matrix cells, and the preserved
[completion evidence](provenance/EXTERNAL-EVIDENCE.md)
later classified nine as PASS/FIXED, two Pixel-reader aliases as UNSUPPORTED,
and OpenRouter GLM→Qwen as BLOCKED_EXTERNAL. Against the frozen closure
candidate, the exact Pixel reader passed the unchanged semantic verifier after
the prompt made the bare `nextAction` representation explicit. The historical
matrix is now 11/12 exact routes PASS/FIXED; OpenRouter GLM→Qwen remains
externally blocked. A separate qualified NVIDIA-hosted execution proved the
exact GLM-5.3-Flash→Qwen model pair without relabelling the blocked OpenRouter
route. See the [release closure](provenance/EXTERNAL-EVIDENCE.md)
and [memory portability guide](project-memory-portability.md).

The original [release-gate reconciliation](provenance/EXTERNAL-EVIDENCE.md), completion report and historical videos remain unchanged. They truthfully retain the failures seen at those commits. Closure evidence records the later Pixel and alternate-provider GLM passes separately, including exact route identities, Work Parcel IDs, batons and authoritative tokens. Stable release remains blocked by the original mandatory power gate: the specialist-energy advantage and warm-residency route effect were **DISPROVEN**, while synchronized whole-node power remains **BLOCKED_EXTERNAL**. The [4.5 release-candidate notes](release-notes-4.5.0.md) preserve those limits for public review.

The isolated programme also includes [energy-aware intelligence](energy-aware-intelligence.md): scope-safe power telemetry, idle-baseline accounting, expected-total-energy routing, and specialist training break-even. Comparable Intel-package, DRAM and NVIDIA-board measurements **disproved** an energy saving for the current route-intent specialist: retained-process execution remained above warm Qwen, real bounded Your Memories retrieval did not improve it, and deterministic no-LLM routing was lowest. This remains experimental; see the [specialist-energy evidence](provenance/EXTERNAL-EVIDENCE.md).

The exact `openbmb/MiniCPM5-2B-GGUF` Q4_K_M configuration also remains
**FAILED** for governed code repair. Scripted and known-good controls passed, so
the result is not hidden as a harness artefact; only that immutable configuration
is denied routing, not the MiniCPM family. See the [MiniCPM closure](provenance/EXTERNAL-EVIDENCE.md).

Agent Control 4.4.0 remains the latest formally released baseline. Agent Control
4.5.0 is an experimental release candidate. The frozen candidate passes
1,312/1,312 automated tests and the fresh dashboard, Estate, Runtime Map and
memory-route physical checks, but it must not be tagged as stable while the
mandatory physical power gate in the authoritative closure remains unresolved.

**Your Memories** is the user-facing Agent Control capability for finding relevant prior context, checking its governance and provenance, rejecting stale or unrelated memories, and safely presenting accepted context in a session. Memories remain advisory and cannot override Work Parcels, batons, policy, authoritative evidence or execution state. The 4.4 release includes the governed UX Session Capture/Replay projection and the qualified memory architecture; MARM remains one optional backend and automatic memory consolidation/model swapping is not a released runtime feature.

Agent Control 4.4 seals completed sessions over existing execution history and qualification evidence, then renders audience-bounded [interactive replay](ux-session-replay.md), conventional video, complete transcript and concise digest from the same identity. Read-only capability links grant neither dashboard nor rerun access, support expiry and revocation, and apply fail-closed presentation redaction. See the [memory architecture review](memory-architecture-review.md), [physical memory evidence](provenance/EXTERNAL-EVIDENCE.md), [replay qualification](evidence/agent-control-4.4-ux-session-replay-20260911.md), [4.4 release notes](release-notes-4.4.0.md), [4.4 migration](migration-4.4.md), and [deployment guide](DEPLOYMENT.md).

Agent Control runs governed parameterised jobs against qualified execution and model resources. It is an infrastructure-neutral, policy-controlled adaptive harness for durable work by heterogeneous agents and models. Its executable harness core composes a task-appropriate worker, provider/model route, prompt profile, minimum qualified skills, restricted tools, context strategy, runtime settings, authority snapshot, resource limits and verification/escalation policy into a fingerprinted execution recipe.

## Agent Control 4.4 release-qualified status

The 4.4 UX/session boundary is qualified at implementation commit
`3b0f89653784f90e092c07f61123ba1f9249a42b`; the checksummed evidence checkpoint
is `574c53f4e3db0d71cf59a3bdb3340f2aa2a7f181`. Physical Chromium replay passed
without browser errors, including visible parallel lane/gate/accounting history
and the governed **Your Memories** lifecycle. The complete suite passed 1,125 of
1,125 tests with no failures or skips. Historical evidence remains bound to its
recorded source commits and is not relabelled as newly executed provider work.

## Agent Control 4.3 foundation

Agent Control 4.3 integrates the 4.2 Transport Context integrity gate and
provider-neutral Cache-Aware Expert Delegation with the complete 4.1 POE,
Crew, Live Shell, recovery and protected-resource runtime. The dedicated
**Warm Cache Runtime** dashboard streams real Work Parcel lanes, provider
invocations, cache observations, route candidates, compatibility, invalidation
and verification; unavailable values remain visibly unavailable.

The 4.3 hardening pass also makes Action effects authoritative. Actions are
registered as explicit read-only operations, declared consequential categories,
or typed effect resolvers. Missing or inconsistent effects fail closed and a
hard denial cannot be converted into authority by approval. Approved local paths
are canonicalized against the execution filesystem, symlink escapes and unsafe
prospective outputs are denied, governed Git disables repository hooks and
filesystem-monitor helpers, and fast-execution containment detects valuable
ignored-file changes. Explicitly disposable roots remain distinct from ignored
operator state.

Historical 4.1 and pre-integration 4.3 qualification remain evidence for those
exact commits only. The integrated 4.3 product candidate
`27bc4c596bbde1db2696d62d38ca17d8bf8cab21` passed the full 1,119-test suite and
fresh physical A–F qualification. See the [integrated qualification](evidence/agent-control-4.3-integrated-qualification-20260909.md),
[complete transcript](evidence/agent-control-4.3-integrated-transcript-20260909.md),
[4.3 release notes](release-notes-4.3.0.md),
[4.3 migration](migration-4.3.md), [runtime safety and route containment](runtime-safety-and-containment.md),
and [deployment, upgrade and rollback](DEPLOYMENT.md).

## Historical Agent Control 4.1 qualification

The 4.1 release adds the compact floating POE companion, actual spoken feature
tours, grounded job/schedule explanations and event-backed Crew handovers. The
tested product `de1525f` passed **1,083 tests with no failures or skips**, isolated
installation/authentication and responsive checks. Real Windows evidence includes
microphone input, speech interruption and four verified jobs across two explicitly
approved read-only Work Parcels. The operator accepted the existing qualification
evidence and edited 6:12 public tour for release. Review limitations and exact
source reconciliation are retained in the qualification record and release manifest.

See [4.1 release notes](release-notes-4.1.0.md),
[current qualification](provenance/EXTERNAL-EVIDENCE.md) and
[historical 4.1 installation and qualification runbook](installation-deployment-4.1.md).

Agent Control 4.0.0 integrates the previously separate adaptive-routing, protected-resource, Social & Voice/OpenWA, operational Crew/WOPR and Live Shell workstreams into one governed lifecycle:

`authenticated channel → canonical Work Parcel → capability/authority-qualified adaptive route → Crew/lane execution → token governor → retry or sealed-baton handoff → independent verification → immutable evidence → originating channel`

The channel, exact initiating text or retained voice transcription, authentication classification, opaque message/identity references and granted template authority are preserved in the Run and Work Parcel. A complete execution transcript starts with those source facts before showing the chronological route, model changes, tools, telemetry, governor decisions, handoffs and verification. Voice transcription remains untrusted and cannot start consequential work until a separate authenticated text confirmation is linked.

Live Shell attaches to the real process/session recorded by a Run; it is not a browser terminal or arbitrary shell API. `WATCH`, `INTERVENE` and `TAKE_CONTROL` are explicit capabilities. Protected-resource Actions are forcibly `WATCH_ONLY`, so an adapter cannot use PTY input, signals or takeover to bypass the safety decision. Handoffs transfer only authority already held by the parent contract and retain its protected-resource envelope. See [4.0 release notes](release-notes-4.0.0.md), [migration](migration-4.0.md), [Live Shell](live-shell.md), [adaptive orchestration](adaptive-multi-model-orchestration.md), [protected resources](protected-resource-governance.md), and [dashboard operation](web-dashboard.md).

The 4.0 release gate passed against product checkpoint `a08ccac5ced3cd399755bd084ff30fe224ab7860`; the later evidence commit contains qualification artifacts and tooling hardening only. The [consolidated qualification](provenance/EXTERNAL-EVIDENCE.md) and [Pixel social continuation](evidence/agent-control-4.0-pixel-social-continuation.md) preserve that distinction. No production deployment is implied by the source release.

3.9 makes long-running execution and operator telemetry fail-safe. Runs now retain provider-neutral execution identity, reconnect and authentication state, bounded retry budget/deadline, and verified cancellation evidence. A controller restart does not replay work whose remote state is unresolved. Owned Linux process groups and Windows process trees are terminated through platform adapters and a Run reaches a clean terminal state only when cleanup is confirmed; uncertainty stays visible and keeps authority fenced. Dashboard reload and SSE reconnect rebuild the complete durable projection, including genuine wait/retry deadlines, lifecycle reason, telemetry freshness/source, and cleanup outcome.

3.9 also adds conservative Android local-ADB recovery, provenance-aware Linux/Android resource measurements, and a provider-neutral stable/volatile prompt boundary. Android publishes `android.adb.local` and `transport.adb` only after the paired device is connected and independently verified. Cache keys or explicit breakpoints are emitted only when both the provider and model have the corresponding qualified capability; reads, writes, fresh input and cost remain distinct. Physical qualification now covers dashboard reload and concurrent work, Linux and Windows cleanup, controller-restart recovery, authentication/retry/cancellation recovery, and the complete Pixel local-ADB pairing/reconnect/capability/session lifecycle. The matched cache comparison preserved outcome quality but used more tokens and time, so 3.9 makes no cache-saving claim. See the [3.9 migration guide](migration-3.9.md), [release notes](release-notes-3.9.0.md), and [qualification evidence](evidence/agent-control-3.9-qualification.md).

The candidate now also makes long-lived orchestration independent of any provider transcript. Each Work Parcel owns concise active state, a hash-chained immutable event ledger, governed exact/relevance retrieval, and bounded baton views. Original goals remain immutable while accepted steering amendments, questions, approvals, dependencies, routes and first-class success criteria evolve separately. A question pauses only its declared dependent stages; independent branches continue concurrently, and a provider saying “done” cannot satisfy a criterion without the required evidence.

Provider techniques enter a capability-intelligence lifecycle instead of becoming special cases. Agent Control records whether a capability is supported, native or emulated, verified, versioned, limited and evidence-backed; routing rejects candidates missing required capability before optimizing quality, reliability, latency, cost, token/cache efficiency, locality and policy. A frozen 17-task suite, append-only model history, conservative lifecycle transitions, regression warnings and leader views use only observed outcomes. The real two-model qualification and dashboard recording are in the [provider-neutral 3.9 evidence](evidence/agent-control-3.9-provider-neutral-qualification.md).

3.8.1 separates workload/repository location, provider execution location, and credential residency. The recommended default keeps credentials on the Agent Control controller or a designated credential/provider-execution node; managed workload nodes need not store provider credentials. Agent Control transfers frozen work/context, never credential stores. Remote credential residency remains supported where policy requires it. See [credential residency](credential-residency.md), [Codex integration](models/CODEX-INTEGRATION.md), and the [3.8.1 migration guide](migration-3.8.1.md).

3.8.2 adds a human-readable **Execution history** to Saved Job Run detail and Lane Activity. It is a bounded, redacted projection of the existing durable Job Run, Work Parcel, token-governor and baton records—not a new transcript database or authority path. Entries identify operator requests, system transitions, provider activity, tool/action evidence, telemetry, governor recommendations, sealed batons, verification and errors. A baton is not labelled as a completed handoff unless the durable routing outcome says it succeeded. Raw prompts, rejected provider bodies, hidden reasoning and credential material remain excluded. See [execution history](execution-history.md) and [dashboard operation](web-dashboard.md).

This release also closes a repository-review schema mismatch found during the 3.8.1 video qualification. The provider-facing structured-output schema now carries the same semantic literals, enums and ranges as application validation, and rejection evidence records safe failing JSON paths without retaining raw output. Validation remains fail closed. See the [qualification report](evidence/agent-control-3.8.2-human-readable-history-qualification.md).

## Dynamic provider onboarding

Agent Control includes a provider-neutral catalogue for authenticated model discovery, staged inference callability, bounded capability smoke, frozen benchmark queueing, historical model economics and explicit routing admission. Discovery creates routing-disabled `DISCOVERED / UNQUALIFIED / inference UNTESTED` entries; a model-list response never proves an inference endpoint. A single bounded streaming probe records endpoint acceptance, TTFT and timeout phase before the remaining four capability probes are considered. A model can become routing eligible only after the existing model-intelligence ledger reports `QUALIFIED` or `PREFERRED` evidence and an authenticated operator enables it. Later degradation automatically withdraws eligibility.

NVIDIA hosted NIM is the first adapter using this path. Provider-specific code is limited to the documented hosted endpoint and API-key shape; discovery, credential references, model records, telemetry, benchmarking and routing policy remain generic. NVIDIA currently documents an OpenAI-compatible `POST /v1/chat/completions` service at `https://integrate.api.nvidia.com`; catalogue contents, model limits, pricing, free-endpoint status, quotas and rate limits are observed dynamically or remain `UNKNOWN`. See [NVIDIA hosted models](models/NVIDIA-HOSTED.md), [adding a provider](models/ADDING-A-PROVIDER.md), and [provider/model lifecycle](provider-model-lifecycle.md).

API credentials reuse the existing `provider-secure-store` credential-residency reference. Configuration contains only an opaque name:

```json
{
  "id": "nvidia-hosted",
  "kind": "openai-compatible",
  "adapter": "nvidia-hosted-v1",
  "baseUrl": "https://integrate.api.nvidia.com/v1",
  "wireApi": "chat-completions",
  "auth": {
    "type": "provider-secure-store",
    "reference": "provider:nvidia-hosted"
  },
  "discovery": { "enabled": true, "path": "models" }
}
```

`agent-control providers credential set nvidia-hosted` reads the value from hidden terminal input or stdin—not an argument—and stores it under the controller state directory with owner-only permissions. `status` checks metadata without reading credential contents; `revoke` removes the selected reference. Add `--account PROFILE_ID` to manage a controller-resident API account profile's distinct secure-store reference through the same command. The value is resolved only when the selected provider/account invocation begins, injected only into its authorization header or isolated child environment, and scrubbed from provider output and errors. Multiple API account profiles can use distinct references without falling back across accounts. See [credential residency](credential-residency.md).

The bounded physical qualification authenticated through that reference, discovered 81 live canonical IDs, smoke-tested representative advertised IDs, ran the frozen model-evaluation path against `nvidia/nemotron-3-super-120b-a12b`, and reconciled the protected ledgers with an isolated dashboard/API/SSE projection. The provider returned no authoritative rate-limit, quota, price, context-window or current-context data, so those fields remain `UNKNOWN`/unavailable. Nemotron passed all nine model calls available to its observed capability set, but the 51-attempt batch remained `PARTIAL` because 42 capability-gated attempts were unavailable; it is a `CANDIDATE`, not qualified. Focused follow-up proved Nemotron and Muse callability plus corrected 5/5 smoke, classified MiniMax as timeout-before-first-token and Kimi K2.6 as endpoint-unavailable, and left all 81 routes disabled. See the [initial physical qualification](evidence/agent-control-3.9-nvidia-hosted-qualification-20260906.md) and [focused diagnostics](evidence/agent-control-3.9-nvidia-focused-diagnostics-20260906.md).

### Retry-exhaustion failover and complete transcripts

The production repository-review lifecycle treats an exhausted transient provider retry as a governed continuation boundary. Agent Control classifies the failure without changing model-quality history, preserves the failed attempts, asks the provider-neutral governor for a qualified capability-compatible fallback, seals repository/result/evidence/next-action state into a content-hashed baton, verifies the destination route identity, continues execution, and independently verifies the result. No fallback is silent, no retry is unbounded, and source state remains recoverable if destination execution fails.

Every parameterised review Run also materialises a complete Markdown transcript while authoritative Run, Work Parcel, provider, token, governor or baton records change. The transcript is an uncapped projection of records associated with that Run—not raw provider traffic or private reasoning—and has both content and source-projection SHA-256 digests. Restart reconstruction must be byte-identical. `LIVE`, `CONTROLLED_FAULT_INJECTION` and `SIMULATED` are explicit execution modes in the Job, transcript and Crew presentation.

The release-qualification evidence is deliberately not a success story: the separate controlled 503 exercise passed retry exhaustion, sealed-baton fallback, destination continuation and verification, but the principal LIVE NVIDIA GPT-OSS review missed a pre-frozen capacity-race criterion. The candidate therefore remains **PARTIAL**, the NVIDIA route remains routing-disabled, and the admission recommendation is `DO_NOT_ADMIT`. See the [routing-admission release qualification](provenance/EXTERNAL-EVIDENCE.md).

## Operating model

Agent Control is provider-, model-, platform- and execution-environment-agnostic. Core policy addresses qualified capabilities and governed routes; Codex, OpenAI-compatible APIs, local models, Linux, Windows, Android and browser-backed integrations are optional adapters or execution resources rather than architectural dependencies.

- A **Job Definition** is a reusable typed workflow; a **Saved Job** supplies operator configuration and schedule policy.
- A **Run** is one immutable execution occurrence. It records the frozen target, exact route, lifecycle, evidence, result and accounting.
- A **Work Parcel** is the attributable governed unit of work created within a Run. Its dependency graph, active state, immutable context events, questions, steering amendments, criteria, bounded baton views, provider invocations, verification and token/cost totals survive retries or handoffs.
- A **Lane** is an operator-visible ownership and coordination boundary with durable objective, baton, lease, route and verification state.
- **Routing** selects a qualified provider/account/model/execution-node identity after capability and policy checks; it does not silently substitute unavailable routes.
- **Capability intelligence** distinguishes provider-native support from Agent Control-emulated support and separates advertised/configured claims from verified observations.
- The **token governor** keeps current context occupancy separate from cumulative usage, records provenance, and selects `CONTINUE`, `COMPACT_AND_CONTINUE` or a governed `BATON_AND_HANDOFF` decision without treating context pressure alone as proof of a transfer.
- **Accounting** remains additive at thread, invocation, model/account and Work Parcel levels, allowing cost per verified outcome to survive compaction, retry and route changes.

The dashboard is an observer and authenticated operator client over the same control service. Run and Lane **Execution history** correlates durable operator/system/provider/tool/governor/baton/error activity with telemetry, accounting and verification. It is not raw provider traffic, unredacted logs or hidden model reasoning.

## Morrow and the robotic crew (4.5 candidate)

Morrow is Agent Control's original chief steward: conversational host, evidence guide, crew liaison and optional OmniVoice interface. He retrieves focused canonical records, explains activity and helps prepare proposals. Approved work enters the existing Work Parcel, routing, governor, safety, execution, verification and accounting lifecycle.

The compact floating host has silver hair, a teal utility jacket and a copper badge. Cadence, Quill, Relay, Lumen, Rook and Verity retain their robotic identities, established roles, colours and accessories, now with a shared ceramic, teal and copper appearance. The dashboard provides **Ask Morrow about this** controls. Authenticated social channels accept `Morrow: <question>` and retain legacy `POE:` commands. Guided narration, speech interruption, once-only introductions and reduced-motion controls retain their existing boundaries.

The original designed OmniVoice configuration, internal `poe` routes/events/storage keys, saved conversations and sealed proposal hashes remain compatible. The public identity changes without a state migration or a change to execution authority. Historical POE recordings remain evidence for their recorded source commits; they do not physically qualify the new Morrow presentation.

See the [identity and crew guide](morrow.md), [Morrow operation and architecture](poe.md), [4.5 integration record](provenance/EXTERNAL-EVIDENCE.md), [dashboard operation](web-dashboard.md), and [deployment, upgrade and rollback guide](DEPLOYMENT.md). This combined candidate remains **EXPERIMENTAL** and is available for testing on `feature/4.5-release-gate-completion`.

## Protected-resource mutation governance

The `RuntimeSafetySupervisor` allows natural Work Parcel constraints to become machine-enforced resource capabilities. For example, `origin/master must remain completely unchanged` compiles to a durable read-only `git-ref:origin/master` policy. A typed governed Git Action normalizes wrappers, chains, refspecs, force/delete/mirror forms and alternate working directories into semantic effects before dispatch. An intersecting mutation is denied before any handler or subprocess starts; an allowed feature-ref operation retains explicit external commit truth and independent verification evidence.

The complete flow is `model/action proposal → sealed proposal artifact → normalize → resolve effects → resource policy → safety governor → execute/reconcile → independent verification`. The model-backed Job uses the existing adaptive route and structured-provider abstraction, but the model receives no shell or mutation authority. Dashboard updates use the normal Run and safety SSE stream, and the Run view shows resolved effects plus `PROPOSED`, `AUTHORISED`, `EXECUTING`, `EXTERNALLY_COMMITTED`, `CANCELLED_BEFORE_COMMIT`, `COMMIT_STATE_UNCERTAIN` or `FAILED` operation state. See [protected-resource governance](protected-resource-governance.md), [qualification evidence](evidence/agent-control-protected-resource-qualification.md), [Job Runs](jobs/RUNS.md), and [dashboard operation](web-dashboard.md).

## Resilient execution and truthful telemetry

Every live provider attempt has a durable execution ID bound to its provider, account, model and node route. Restart or transport loss moves the Run to `DISCONNECTED`/`RECONNECTING` until the execution adapter proves continuity and terminal state. Authentication-required and permanent-configuration failures do not consume a transient retry loop. Transient retries use the Job's existing `attempts`, `backoffSeconds`, optional `backoffMultiplier`, `maxBackoffSeconds` and `overallDeadlineSeconds`; parameterised reviews use `maximumRetries`, `retryBackoffSeconds`, `retryBackoffMultiplier` and `retryMaximumBackoffSeconds`. The dashboard shows the real next-attempt timestamp and remaining retry budget. It never fabricates a countdown.

Cancellation is two phase: `CANCELLING` requests termination, then platform-specific cleanup verifies the captured process identity and descendants. A confirmed result may become `CANCELLED`; an identity mismatch, surviving descendant or unverifiable substrate becomes `CLEANUP_UNCERTAIN`/`DISCONNECTED` and requires reconciliation. Linux uses process groups plus `/proc/<pid>/stat` start identity. Windows uses an audited CIM inventory and bounded process-tree termination. Other platforms retain an explicit uncertainty result instead of treating leader exit as proof.

Managed-node measurements carry `value`, `source`, `authority`, `freshness`, observation time, limitations and whether they are qualified for admission. Linux prefers `/proc`; where Android hides aggregate CPU counters, two samples of readable sysfs cpuidle counters can produce a derived busy percentage that is deliberately not admission-qualified. Missing temperature, storage, load or CPU data stays `null`, never zero. See [managed nodes](managed-nodes.md), [Jobs and scheduling](jobs/README.md), and [dashboard operation](web-dashboard.md).

## Governed retrieval and context intelligence

3.8 adds an opt-in provider-neutral path: `Work Parcel → Retrieval Intent → Retrieval Governor → Retrieval Provider → Evidence Packet → ContextGraph/ContextPacketBuilder → Model → Verification/Baton`. It starts with bounded local exact/BM25 evidence, can use optional semantic/hybrid adapters such as zg, reacts to the 3.7 token governor's context pressure, streams redacted retrieval lifecycle metrics over the existing SSE dashboard, and revalidates content-addressed evidence references after baton handoff or restart. Search authority never grants index mutation, remote retrieval is denied by default, stale evidence is explicit, and insufficient or failed retrieval retains the immutable frozen context.

```json
{
  "retrieval": {
    "enabled": true,
    "providers": ["exact", "lexical"],
    "maximumCalls": 4,
    "maximumEvidenceTokens": 8192,
    "allowRemote": false
  }
}
```

zg is optional and normal startup has no new dependency. Built-in retrieval is deliberately constrained: only observable exact/path/query coverage can establish sufficiency; provider rank is not treated as calibrated confidence, and weak evidence escalates or falls back. A generic resource policy chooses provider use, built-in retrieval, authorized index build, or deferral from memory, storage, repository size, index state and expected task duration. See [architecture review](agent-control-3.8-architecture-review.md), [configuration and operation](governed-retrieval.md), [Phase 2 qualification](evidence/agent-control-3.8-phase2-qualification.md), and [3.8 migration](migration-3.8.md).

The frozen 12-task Qwen2.5 Coder 3B mutation comparison verified 2/12 outcomes in every lane. Built-in retrieval reduced processed tokens per verified outcome from 95,101 to 76,189 (19.9%); zg reduced it to 88,039.5 (7.4%). This qualifies non-regression and context efficiency for the governed mechanism, not a broader small-model capability claim. Retrieval remains disabled by default and never silently substitutes weak evidence.

A lane owns its task; recipes, agents, models, skills, tools, execution providers and operator interfaces are replaceable and remain below the control boundary. Agent Control remains authoritative for scheduling, priorities, leases, ownership, unconditional human takeover, batons, handoffs, clones, shared tasks, provider qualification, routing, approvals, recovery validation, verification and conflict policy. In 3.1.0, ordinary `WorkExecutor` agent work can no longer accept a raw handler: it builds and records an `ExecutionRecipe`, dispatches it through `AdaptiveHarness`, and exposes only a live-authority `ToolPolicy` gateway.

Orca is available behind a narrow execution-provider contract. Orca may execute processes, terminals and worktrees, but it does not receive Agent Control policy authority.

## Agent Control 4.2 transport integrity

Qualifying Work Parcels carry a versioned, provider-neutral Transport Context Contract. Agent Control canonicalizes and hashes the contract, verifies declared context dependencies, and records an explainable `COMPLETE`, `DEGRADED`, `BLOCKED` or `ESCALATED` integrity state before provider execution. Missing required context fails closed; stale or contradictory context escalates for repair. The existing token-aware baton receives the contract hash across handoffs, so destination work cannot silently lose the initiating request, frozen repository identity, criteria or security constraints.

See [transport integrity](transport-integrity.md) and [ARCHITECTURE.md](../ARCHITECTURE.md). Legacy parcels remain visible and explicitly unbound.

Non-OpenAI prompt/KV cache qualification is documented in [docs/non-openai-cache-qualification.md](non-openai-cache-qualification.md). Three matched physical llama.cpp/Qwen trials now prove reusable prompt/KV state through authoritative backend counters, real coding mutations and independent verification. Cache reuse is never claimed from latency, repeated prompts, or missing usage fields.

## Agent Control 4.3 Cache-Aware Expert Delegation

The 4.3 development branch turns qualified cache observations into a bounded routing input. After a genuine verified invocation, Agent Control can recognise the exact worker/provider/model/session/cache-scope/backend route as a temporary Warm Expert for a hashed context domain. Before compatible follow-on work, it compares repository, branch/dependency, transport, instruction, tool and governance context, classifies compatibility as `EXACT`, `HIGH`, `PARTIAL`, `INCOMPATIBLE` or `UNKNOWN`, and may add a small policy-bounded score only for safe `EXACT`/`HIGH` routes.

The normal Work Parcel path remains authoritative: model qualification, capabilities, worker health/load, transport integrity, adaptive quality/cost/latency policy, approvals and independent verification all outrank cache affinity. Candidate scores, decision reasons, expected benefit, actual provider counters and verifier results are durable; selected decision/expert IDs travel in the stage baton. The dashboard’s **Warm Cache Runtime** tab updates from the same live runtime and presents the lane timeline, cache heatmap, agent/process utilization, ranked Warm Experts, observed compatibility matrix, candidate routes, route explanation, recent events and cross-lane evidence boundary. It distinguishes `AUTHORITATIVE`, qualified `DERIVED` and `UNAVAILABLE` evidence. A missing measurement is shown as `CACHE STATE UNKNOWN`, never zero.

Configure the feature under `cacheAwareExperts` or through **Configuration → Warm Experts**. Derived preference is disabled by default. See [Cache-Aware Expert Delegation](cache-aware-expert-delegation.md), [dashboard usage](web-dashboard.md), [non-OpenAI cache qualification](non-openai-cache-qualification.md) and [ARCHITECTURE.md](../ARCHITECTURE.md).

Fresh integrated A–F qualification is complete: a measured `HOT/HIGH` non-OpenAI Warm Expert changed a genuine governed route, incompatible context received no bonus, material context invalidated prior warmth, a restarted backend inherited no cache claim, and every model invocation and routing decision passed independent verification. See the [integrated physical qualification](evidence/agent-control-4.3-integrated-qualification-20260909.md); the earlier [development-branch qualification](provenance/EXTERNAL-EVIDENCE.md) remains historical.

A warm cache improves efficiency but does not confer correctness or authority. Capability, integrity and governance always outrank cache warmth.

## Identity, sessions and delegation

3.5 adds a persistent identity control plane with an explicit chain:

`Actor → Session → Work Parcel → Agent → Model → Provider → Runtime → Node/Resource → Evidence`

The session creator is immutable. Participants, capabilities, context policy and mode (`observer`, `collaborative`, `operator-controlled`, or `restricted`) are durable. Agent-to-agent delegation records both actors, both agents, the context-transfer hash, inherited authority, requested/actual model, child Run and evidence. Child authority must be a subset of its parent and session. Secrets remain opaque references used through capability-checked operations; literal credentials are rejected from context and persistence.

The dashboard **Sessions** tab reads this authoritative store and shows participants, active attributed Work Parcels, the agent/delegation graph, baton token/hash traces, models, runtime/node identity, context policy, evidence and complete-chain token/cost values where providers reported them. Execution admission enforces the session's participant authority, model/node allow-lists and filesystem/network envelope. Existing records receive deterministic `legacy-actor:*` / `legacy-session:*` attribution; legacy “Ox” labels remain historical aliases of canonical `GLM-5.3-Flash`, not a distinct model.

The 3.6 runtime retained by 3.7 packages the governed ACP mapping as a real stable-v1 newline-delimited JSON-RPC stdio endpoint using the pinned official TypeScript SDK. It supports initialization, session new/load/resume/list/prompt/cancel/close, ordered plan/tool updates, request cancellation, durable session reconstruction and graceful shutdown. ACP is an interoperability edge, not a second scheduler, shell or tool-authority path.

The caller must be admitted as an existing Actor; stdio uses `AGENT_CONTROL_ACP_ACTOR_ID` and defaults to the already registered `web-operator`. Diagnostics go to stderr because stdout is reserved for protocol frames:

```bash
AGENT_CONTROL_STATE_DIR=/srv/agent-control/state \
AGENT_CONTROL_ACP_ACTOR_ID=web-operator \
agent-control acp
```

No remote listener is enabled by this command. ACP v2 remains draft, is not imported by the stable runtime and is not claimed. See [identity and delegation](identity-sessions-delegation.md), [security](security-3.5.md), [migration](migration-3.5.md), and [ACP compatibility](acp-compatibility.md).

Authenticated Streamable HTTP and WebSocket are separately and explicitly enabled. The token is resolved indirectly from the named environment variable; it is never accepted in a URL or configuration file. Loopback is the safe default, and a non-loopback bind fails unless a TLS certificate/key pair is configured:

```bash
export AGENT_CONTROL_ACP_REMOTE_ENABLED=true
export AGENT_CONTROL_ACP_REMOTE_TOKEN_ENV=ACP_OPERATOR_BEARER
export ACP_OPERATOR_BEARER='use-a-secret-manager-generated-value'
agent-control acp-remote
```

Optional settings are `AGENT_CONTROL_ACP_REMOTE_HOST`, `AGENT_CONTROL_ACP_REMOTE_PORT`, `AGENT_CONTROL_ACP_REMOTE_PATH`, `AGENT_CONTROL_ACP_REMOTE_ALLOWED_ORIGINS`, `AGENT_CONTROL_ACP_REMOTE_TLS_CERT_FILE`, and `AGENT_CONTROL_ACP_REMOTE_TLS_KEY_FILE`. Production exposure remains an operator deployment decision; development did not open or modify a live listener.

## Contract-owned process and PTY state

The 3.6 runtime retained by 3.7 persists the ownership chain `Lane → Contract → Baton → Process/PTY → Agent`. A contract retains task identity, completion criteria, authority, protected-resource rules, budget, sealed baton, attachments, pending actions, verification and evidence if an agent disconnects or a controller restarts. PTY consultation and reconnect are read-only; write control is singular and explicitly transferred. Human takeover pauses agent authority before accepting writes, and agent resumption requires deliberate return. See [contract and PTY runtime](contract-pty-runtime.md).

Governed workers return exactly one explicit outcome: `SACRIFICE`, `SUBSTITUTE`, `DELEGATE`, `YIELD`, or `COMPLETE`. AUTO handoffs execute only inside the contract's existing authority, resource envelope and budget. Costly escalation, privilege/resource expansion, production writes, destructive actions and explicitly MANUAL requests wait for the contract operator. `COMPLETE` means “submit for independent verification,” not success. See [governed handoffs](governed-handoffs.md).

Providers and models now have a session-neutral lifecycle separate from execution sessions: `DISCOVERED → BENCHMARKING → SHADOW → CANDIDATE → ACTIVE → PREFERRED → DEPRECATED`. Immutable recipes bind exact provider/model/version and capability requirements. Versioned champion/challenger policy supports historical replay and evidence-gated rollback while keeping credentials as indirect references. See [provider and model lifecycle](provider-model-lifecycle.md) and [adding a provider](models/ADDING-A-PROVIDER.md).

Capability routing now has a frozen 60-task suite with a 12-task holdout and a separately accounted twelve-child coordinator/baton experiment. The deterministic classifier scored 60/60 with zero unsafe false positives, but no physical provider observations have been supplied to the new gate. Automatic production routing therefore remains disabled; use only manual, benchmark, shadow, candidate or governed opt-in modes. See the [capability-routing benchmark](capability-routing-benchmark.md).

The separate physical chain `gpt-5.6-luna → local Qwen2.5 3B → z-ai/glm-5.3-flash → gpt-5.6-luna` has now run with local `YIELD`, GLM `SUBSTITUTE`, minimal batons, controller reconstruction and independent parent/child verification. It qualified with observed GLM retries and unknown provider token/cost data; it does not satisfy the larger automatic-routing gate. See [physical multi-provider qualification](physical-multi-provider-qualification.md).

The existing Sessions, Systems and Models dashboard views now read one redacted `GET /api/runtime` projection for stable ACP v1 transports/sessions, contract/process/PTY ownership, approvals, handoffs, baton hashes/sizes and immutable provider/model lifecycle state. Prompt bodies, objectives, baton payloads, transcripts, credential references and unavailable usage/cost are not exposed. See [dashboard usage](web-dashboard.md), [3.6 security boundaries](security-3.6.md), and the [development qualification evidence](evidence/agent-control-3.6-development-qualification.md).

## Token-Aware Baton Routing

3.7 introduces durable live token/context telemetry and a policy-driven baton governor. Each running thread reports provider/account profile/model, cumulative total input split into fresh and cached input where the provider exposes it, output/total tokens, current context/window/percentage where exposed, authority (`authoritative`, `estimated`, or `unavailable`), cost, elapsed time, governor state, and next threshold. Cached input remains part of total input and is never subtracted from context occupancy. The dashboard receives updates through its existing SSE stream without a page refresh and retains the fresh/cached split plus Work Parcel totals through handoffs: `Provider/Primary/Sol 184k → Provider/Secondary/Luna 31k → Local/default/Fast 18k = 233k total`.

Default policy records `CONTINUE` at 60%, `PREPARE_BATON` at 75%, `COMPACT` at 85%, and handoff evaluation at 90%. Context pressure is not a downgrade command: unfinished difficult reasoning stays on the stronger model. A handoff requires a sealed verified baton, bounded/mechanical remaining work, compatible qualified target, policy permission, and a lower-cost target where price information exists. Compaction, native context changes and resume boundaries are durable events and never reset Work Parcel totals. The normal parameterized repository-review lifecycle now evaluates this policy between immutable context chunks, delegates the next bounded chunk through the existing contract/handoff runtime, and returns the consolidated result to the existing independent validator. A failed destination is marked failed and the preserved source route resumes the same chunk. See [Token-Aware Baton Routing](token-aware-baton-routing.md) and the [Codex 0.153 review](provenance/EXTERNAL-EVIDENCE.md).

Codex routes may optionally bind an opaque account profile beneath the provider. The complete identity is `workload node + provider → account profile → model + provider-execution node + credential node`. Each profile points to a separately authenticated `CODEX_HOME` through an environment-variable reference resolved only on its credential node; Agent Control never reads, copies, logs, or persists OAuth files or resolved paths. Windows credential nodes use the configured governed SSH resource and fixed read-only PowerShell operations—there is no arbitrary remote-shell API. Authenticate each home once interactively on its own node, then use **Models → Check account** to qualify it independently. Saved Jobs may pin `accountProfile`, or leave it to predetermined model-role policy. Agent Control does not rotate accounts to evade or combine usage limits, and rate-limit/exhaustion failures remain attributed to the account that produced them. Configuration and login examples are in [Codex integration](models/CODEX-INTEGRATION.md).

Post-3.8.2 Codex hardening keeps schema-constrained repository review ephemeral but isolates it from mutable user/project configuration and disables Codex-native shell, unified-exec, multi-agent, web, browser, computer and app tool surfaces. The model receives the immutable governed context directly; any opaque retrieval/baton identifiers are placed after reusable instruction/content prefixes. Codex exec completion usage is cumulative consumption, not current-context occupancy, so it remains `unavailable` unless Codex exposes a distinct context measurement. Real repeated runs confirm that ephemeral execution can still receive provider-reported cached input, but cache hits are automatic and non-deterministic; Agent Control does not claim that persistent sessions guarantee savings. Authoritative total input survives even when its fresh/cache split is unknown, and discount-sensitive calculated cost then remains unknown rather than assuming zero cache. See [Codex integration](models/CODEX-INTEGRATION.md) and the [post-3.8.2 qualification](evidence/agent-control-post-3.8.2-context-efficiency.md).

The production lifecycle is physically qualified across two distinct live local provider/model routes. A real source result triggered the unchanged governor under an economical qualification-only threshold policy, produced a sealed baton, continued on the destination and passed independent verification; 186 source plus 510 destination tokens reconciled to 696 parcel tokens. A second run refused the destination and recovered the original source thread. Provider-unreported context and cost remain explicitly estimated or unavailable. See the [physical qualification evidence](evidence/agent-control-3.7-physical-qualification-20260902.md).

## Evidence-driven adaptive orchestration

The 3.7 adaptive orchestration workstream adds a provider-, platform- and model-neutral **Model Capability League**, **Workflow League** and durable per-Work-Parcel **Decision Tree**. It selects against task class and required capabilities using verified quality, reliability, confidence, recency/version, latency, token/cache and cost evidence. It does not create a global “best model” list, silently mix benchmark with production evidence, or store private model reasoning. Provider, infrastructure, policy and cancellation failures remain operational evidence rather than being counted as model-quality failures.

The normal flow is:

`request → classify → capabilities → policy → eligible candidates → league evidence → cost/quality/latency trade-off → route/workflow → execute → quality gate → verify → update evidence`

Adaptive routing is configurable and disabled only when the operator sets `adaptiveOrchestration.enabled` to `false`; the default is enabled for the isolated workstream but it never bypasses the existing qualified model registry, node placement, approvals, verification or token-aware baton governor. The default preference threshold is three verified samples, with quality floor `0.6`, minimum quality `0.7`, evidence age limit 90 days, no cost/latency ceiling, and weights quality/reliability/cost/latency/confidence `0.5/0.2/0.15/0.1/0.05`. A minimal configuration is:

```json
{
  "adaptiveOrchestration": {
    "enabled": true,
    "minimumSamplesForPreference": 3,
    "minimumQualityScore": 0.7,
    "maxEvidenceAgeDays": 90,
    "policyQualityFloor": 0.6,
    "maxRouteCost": null,
    "maxRouteLatencyMs": null,
    "explorationRate": 0.1
  }
}
```

Open the dashboard's **Routing** tab to filter both leagues by task class, capability, provider, model/version, local/remote location, evidence class, quality or age, and to select each persisted decision node. A Work Parcel's Audit panel links directly to its routing record. The same canonical record powers the machine-readable report and the human-readable operational report, including evidence-linked token/cost/latency measurements; past decisions do not change when later evidence arrives. See [adaptive multi-model orchestration](adaptive-multi-model-orchestration.md) and [dashboard usage](web-dashboard.md).

## Governed fast execution (Spark)

3.5 adds an optional `FAST_EXECUTION_MODEL` execution class, currently implemented by the exact model `gpt-5.3-codex-spark`. Its purpose is to avoid spending a more capable model on mechanically understandable, low-risk work while retaining Agent Control classification, authority, evidence and verification. It is disabled by default and is separate from the THIN context profile. The governed execution hierarchy is:

`LOCAL → SPARK → STANDARD → FRONTIER`

LOCAL, STANDARD and FRONTIER remain logical policy classes backed by the configured model registry; they are not hard-coded model names. THIN/STANDARD/DEEP describe harness and context size, whereas LOCAL/SPARK/STANDARD/FRONTIER describe model execution class. A task reaches Spark only when it is explicitly trivial, THIN, low-risk, deterministically verifiable, within one file/80 changed lines by default, outside protected paths, and free of security, authentication, migration, governance, release, deployment or production signals.

Agent Control selects Spark through the provider-neutral model-registry role `fast-execution`, sends a small sealed baton, disables Codex multi-agent fan-out, permits exactly one attempt in a disposable clean Git worktree, independently checks scope and verifier evidence, and escalates visibly to STANDARD on failure or ambiguity. There is no silent substitution: if Spark is unavailable or the exact qualified route cannot be resolved, no Spark invocation is claimed and existing governed routing remains authoritative. Persistent telemetry and the Sessions view identify the originating Work Parcel/Run/Session, actual model, selection reason, context size, verification and successor. Availability is established by an authenticated bounded `codex exec --model gpt-5.3-codex-spark` probe, not by assuming a subscription or API model.

Enable or disable the lane in `.agent-control/config.json` or **Configuration → Fast execution**. Enabling policy does not bypass exact model qualification or the availability probe:

```json
{
  "spark": {
    "enabled": false,
    "model": "gpt-5.3-codex-spark",
    "modelRole": "fast-execution",
    "maximumFiles": 1,
    "maximumChangedLines": 80,
    "maximumAttempts": 1,
    "maximumSubagents": 0,
    "maximumContextTokens": 2048,
    "verificationRequired": true
  }
}
```

Run the non-mutating classifier/availability qualification with `npm run benchmark:fast-execution`; run the frozen disposable live comparison explicitly with `npm run benchmark:fast-execution -- --live --standard-model gpt-5.6-luna`. The current requalification recorded 7/7 verified Spark outcomes versus 6/7 for the comparison route, median latency 14.464s versus 27.100s, and zero classifier false positives across ten cases. Provider cost was not reported and remains unknown; Spark used more output tokens. This single-host research-preview result is promising but not broad enough to enable the lane by default. See [the governed flow and routing architecture](../ARCHITECTURE.md#fast-execution-class), [fast-execution operator usage](fast-execution.md), [Codex integration](models/CODEX-INTEGRATION.md), and the [qualification evidence](evidence/agent-control-3.5-qualification.md).

## Parameterised Jobs quick start

3.4 separates reusable **Job Definitions** from configured **Saved Jobs**, persistent **Schedules**, and immutable **Runs**. The built-in `repository-code-review@1` resolves and freezes a Git revision, builds bounded deterministic context, routes `review.default` to a qualified provider/model, creates attributable Work Parcels, validates evidence-backed findings, records usage/cost, and advances a successful delta baseline. It invokes the provider directly: Codex, ChatGPT, a browser session, and conversation history are not prerequisites.

Configure a local execution resource, a qualified model for `review.default`, and repository policy in `.agent-control/config.json`:

```json
{
  "jobs": {
    "repositoryRoots": ["/srv/repositories"],
    "repositoryRemotes": ["https://github.com/your-organisation"]
  }
}
```

Then create and run a reusable review:

```bash
agent-control jobs create \
  --definition repository-code-review \
  --name "LocalWalks Nightly Review" \
  --node review-controller \
  --repository /srv/repositories/LocalWalks \
  --ref main \
  --scope changes \
  --model-role review.default \
  --schedule "0 2 * * *" \
  --timezone Europe/London

agent-control jobs saved
agent-control jobs run localwalks-nightly-review
agent-control jobs runs --saved-job localwalks-nightly-review
```

Job mutations use `AGENT_CONTROL_WEB_OPERATOR_TOKEN` only as a bearer header. The dashboard Jobs area provides separate Job Definitions, Saved Jobs, Schedules, and Runs views; its Saved Job form is generated from the definition parameter schema. See [`docs/jobs/README.md`](jobs/README.md).

## External model registry

Agent Control now has a provider-neutral registry for external and local models. Providers own endpoint, wire protocol and secret references; models own provider model ID, capabilities, limits, pricing metadata and qualification state; logical roles such as `coding.fast` or `reasoning.deep` own ordered primary/fallback policy. Only a model qualified on the selected execution node can route. `UNTESTED`, `QUALIFYING`, `FAILED` and `DISABLED` entries remain visible but fail closed.

The dashboard **Models** tab shows provider/account/model identity, distinct provider-execution and credential-residency nodes, safe account label and plan authority, independent account/model qualification, limits, latency, configured pricing and fallback position. Parameterized Run and live token views separately show workload, execution, and credential nodes. The authenticated **Configuration** view can add or edit providers, account-profile references and models without storing API keys or OAuth material. See [`docs/models/README.md`](models/README.md), [`docs/models/ADDING-A-PROVIDER.md`](models/ADDING-A-PROVIDER.md), [`docs/models/CODEX-INTEGRATION.md`](models/CODEX-INTEGRATION.md) and [`docs/credential-residency.md`](credential-residency.md).

## Persistent Teammates

Agent Control 3.2 adds durable named teammates without turning names, roles or remembered context into authority. Profiles retain bounded instructions, preferred semantic capabilities, verifier-backed working-context summaries and explicitly saved or verified routines. Controlled conversations permit agent-to-agent delegation, while a Coordinator can assign work to two or more specialists and synthesize only their verifier-passed results.

Every specialist assignment and coordinator synthesis remains an ordinary Agent Control Job. Worker placement, provider/model selection, THIN/STANDARD/DEEP context routing, tool policy, token/cost telemetry, typed artifacts, verification and escalation all remain underneath the teammate layer. Initialize the five example profiles with `npm run init:teammates` and run the non-production two-specialist proof with `npm run demo:teammates`. See [`docs/persistent-teammates.md`](persistent-teammates.md).

## Requirements

- Node.js 24 (qualification runtime; older versions are not qualified for this release)
- npm
- Git
- Bash for shell-script validation and Android helpers
- Optional: ripgrep for typed repository search, Orca, SSH, Android/Termux, and provider services when configured

No host, device, provider, port, GPU, overlay network or absolute repository path is built in.
For a fresh Android/Termux installation, complete the explicit
[Termux prerequisites](../android/README.md#fresh-termux-prerequisites) before the
clone command below.

## Install

The normal clone is deliberately source-only. Heavy historical videos,
screenshots, binary captures and qualification working trees are preserved in a
separate checksummed [qualification evidence archive](evidence-archive.md),
so installation never requires a partial or shallow clone workaround.

Clone the public release and select its immutable tag. During pre-release
qualification, the reviewer substitutes the exact reviewed candidate SHA for
`v4.5.0`; ordinary users should use the published tag.

```bash
git clone https://github.com/lozknowles/agent-control.git
cd agent-control
git checkout --detach v4.5.0
./scripts/bootstrap-agent-control.sh --check --target "$PWD"
./scripts/bootstrap-agent-control.sh --install --role control --target "$PWD"
npm run check
```

The read-only check should report `repository: verified` and
`dashboard: available`. Install should finish with `dependencies:
installed-no-lock` and `configuration: initialized-or-preserved`. If either
command stops, use its exact error rather than bypassing the check: confirm Node
24, npm and Git are on `PATH`, that the checkout is clean, and that the selected
commit exists. The project intentionally has no package lock or build step.
The validation command creates an isolated temporary test-state directory and
removes it when the suite exits; it does not add test lanes, events or runtime
records to the initialized `.agent-control` installation state.

Bootstrap runs `npm install --ignore-scripts --no-package-lock` and the
idempotent initializer. `npm run init` creates only a schema-valid empty
`.agent-control/config.json`; rerunning bootstrap never overwrites existing
operator configuration. Use `config/agent-control.example.json` only as an
illustrative reference after replacing every example endpoint, path and
command.

Edit `.agent-control/config.json` for the installation. Runtime state and credentials remain ignored. A different path can be selected with `AGENT_CONTROL_CONFIG`. Do not put credentials in JSON; configuration stores only an environment, referenced-file, isolated-home or opaque secure-store reference.

With no configuration file, Agent Control reports infrastructure as `UNCONFIGURED` and registers only its built-in controller-local worker for the read-only System observation Job. That worker cannot execute models or arbitrary tools. Agent Control does not invent providers, machines, external workers or services.

## Run and monitor

Environment Discovery and every other mutation require an authenticated operator
session. Obtain a private random token of at least 32 characters from your
password manager, enter it at the hidden prompt, and start one headless
controller from the same shell:

```bash
read -rsp "Agent Control operator token: " AGENT_CONTROL_WEB_OPERATOR_TOKEN
printf '\n'
export AGENT_CONTROL_WEB_OPERATOR_TOKEN
npm run web
```

The terminal should report the local dashboard address. Open that address from
the same machine, click the top-right operator button, and enter the same private
token. The button must change to **Operator authenticated** before continuing.
Then use **Settings → Installation** to confirm source provenance and **Settings
→ Environment Discovery → First Run Setup** to perform the first read-only scan.
If the page is unavailable, keep the terminal open and check its startup error;
do not expose the listener publicly to work around a local connection problem.

Complete the provider-free first-run check through the same authenticated
dashboard. Open **Morrow**, type this exact request, and select **Ask**:

```text
Start operator-system-observation@1.1.0
```

Morrow must show **Review job proposal** and must not start it immediately. Expand
**Jobs, schedules, approvals & evidence**, review the displayed job identity,
empty inputs and SHA-256, then select **Approve this job**.
Open its Work Parcel and choose **Runtime Map → Process Map**. The genuine
run contains `observe → verify`: it records registered worker health as a local
JSON artifact, then a separate deterministic verifier checks that artifact.
Successful completion is **SUCCEEDED** with both stages visible and independently
verified. Both stages require the built-in `agent-control.operator-observation.read`
capability; the worker has no model, shell or remote-node capability. This proves
the local governed lifecycle only; it does not qualify a provider, remote machine
or model.

Other operator commands are:

```bash
npm start
npm run status
npm run up
npm run qualify
```

Run `npm link` once per installed node to expose the cross-platform `agent-control` package command. `agent-control status` (also available as `npm run status` inside the checkout) reads the same versioned `AgentControlService` projection as the web dashboard. A controller reads its localhost API; a worker uses a node-scoped SSH client configuration to perform one fixed read-only request against that same localhost API without exposing the dashboard listener. See [`docs/status-command.md`](status-command.md). The older configured service/resource bootstrap inspection is retained as `npm run status:bootstrap`.

`npm start` opens the control-room TUI and its embedded web client. `npm run web` runs the same control service and web dashboard without the TUI for a headless operator host; run one authoritative control-plane process per state directory. `agent-control status` is read-only. `up` starts only explicitly configured services/processes and records ownership. `down` stops only processes that the same Agent Control state directory recorded as owned.

The TUI also starts the web dashboard on `http://127.0.0.1:4310` by default. To
use the TUI instead of the headless controller, set the token with the same
hidden-prompt procedure above and run:

```bash
npm start
```

Enter the token using the top-right operator button in the dashboard. It is
retained only in the browser tab's session storage and sent as a bearer header;
Agent Control does not create a browser authority cookie. Use
`AGENT_CONTROL_WEB_ENABLED=0` to disable the dashboard or
`AGENT_CONTROL_WEB_PORT` to select another port. Binding beyond localhost is an
explicit security decision and should be placed behind authenticated TLS with a
matching `AGENT_CONTROL_WEB_ALLOWED_ORIGINS` allowlist.

Monitor either interface for the same authoritative lanes, scheduler projection, providers, resources, PTY ownership, routing rationale and claim/evidence/verification state. The web terminal panel is observer-only; it never receives a PTY write primitive. Qualification writes timestamped JSON beneath ignored `qualification-results/`.

The dashboard's **Systems** tab is the canonical execution inventory. Every configured machine, provider and external service remains listed when it is unreachable, unprobed or missing authentication; those conditions are shown as `OFFLINE`, `UNKNOWN` or `AUTH REQUIRED` rather than hiding the system. **Models** is the model registry projection. After operator authentication, use **Configuration** to add or edit systems and models as validated JSON. Saves are revision checked and atomic. Provider, model and role-map changes hot-reload; machine and service changes explicitly require restart. See [`docs/web-dashboard.md`](web-dashboard.md#configure-systems-and-models) for the operator procedure.

The optional **Crew** turns canonical Agent Control state into a human-readable operational scene without adding agents or authority. Cadence dispatches lanes, Quill reviews Work Parcel readiness, Relay projects real tools and execution, Lumen shows provider/model discovery and routing, Rook watches nodes/resources, and Verity exposes verification. Operational state, current activity and presentation-only animation are separate fields. Real Parcel dependency graphs show one mini worker per actually running stage; sealed baton motion requires a durable Parcel, lane or token-routing event, and opens the exact recorded reason. Deterministic narration and the three Crew → human explanation → engineering evidence levels lead back to the existing Jobs, Models, Systems, transcripts, token/cache and evidence views.

Full motion gives newly idle characters bounded, staggered look-around behavior and sustained-idle characters a gentle sleep/peek cycle; authoritative work wakes them once without changing controller state. Reduced, Off and Hidden settings are browser-local, system reduced-motion is respected, and narrow screens use a scrollable worker strip. The dashboard and Agent Control continue normally if this presentation is disabled or fails. See [dashboard operational Crew](dashboard-characters.md) for the exact schema, event/tool mappings, accessibility, performance boundary and real qualification evidence.

Agent Control 4.0 adds an original WOPR-inspired **Activity Matrix** beneath the Crew. Its labelled controller, queue, lane, model request/response, tool, baton/escalation, verification and node indicators are computed from canonical state and retained typed events; they never blink randomly to imply work. Every lamp is keyboard-inspectable and explains its source, event/time, lane/model, persistence and stale/disconnected behavior. A slow decorative page heartbeat is explicitly labelled `NOT WORK ACTIVITY`.

A compact **Live usage** strip remains present while navigating Jobs, Lanes, Sessions, Systems, Models, Crew and Configuration. Operators can select a thread or lane and see route, operational state, elapsed time, governor state, context authority, fresh/cache-read/cache-write/input/output totals, cost authority and the additive Work Parcel model chain. Missing current context or cost stays `Unavailable`, not zero. The 4.0 qualification physically demonstrated an explicit quality-gate model change from local Qwen to Codex/Controller Account A/Luna through the production `observe → assess → sealed baton → governed handoff → destination → verification` path. The [human-readable transcript](provenance/EXTERNAL-EVIDENCE.md) starts with the exact authenticated request and gives a timestamped source → destination record without exposing private reasoning; the [qualification report](evidence/agent-control-4.0-pixel-social-continuation.md) links the continuous video and machine evidence. The source release does not deploy or enable services automatically.

Configured Linux/SSH resources can opt into the generic `managedNode` policy. Agent Control then streams a fixed read-only inventory probe over the existing non-interactive SSH route, synchronises discovered capabilities and workload state into the Worker Registry, and shows the same heartbeat, `IDLE`/`BUSY`/`DEGRADED`/`OFFLINE` state, load, memory, storage, current workload and maintenance status in the dashboard, TUI, API and `agent-control status`. It installs no daemon and exposes no arbitrary SSH command surface.

Managed-node inspection and maintenance are typed Job Actions. Package/service/runtime/power operations require a named approval; an active protected workload additionally requires `managed-node.protected-workload-override`, and configured disruptive or competing capabilities are unavailable for placement while BUSY. See [`docs/managed-nodes.md`](managed-nodes.md) for generic onboarding, discovery, operation and failure behavior.

## Token-aware command output

Agent Control can retain a command's authoritative stdout, stderr, exit status and provenance while presenting a much smaller derived view to a model. Command-shaped tool results cross this layer inside the existing `ToolHandlerRegistry`, after live tool/lease/ownership checks and before model context. Small results remain `COMPLETE`; larger results are explicitly `COMPACTED`, `TRUNCATED` or `ARTIFACT_ONLY` and receive a scoped, expiring handle.

The first semantic adapter is the read-only `repository.search.ripgrep` tool. It uses structured ripgrep output to return a summary or file/line match index, while `command.output.expand` can retrieve selected captured matches, files, ranges, context or the exact retained result. Expansion is bound to the original task, lane, worker and authority generations and cannot read arbitrary repository paths. Generic oversized command stdout uses a labelled head/tail view with the same full-result recovery path.

Agents use **Inspect -> Expand -> Read**. The context router selects summary, index, selected context or full artifact according to purpose and budget. The API and dashboard report per-command and cumulative **Context tokens avoided** without claiming provider billing savings. Configure thresholds with the optional `tokenAwareOutput` object shown in [`config/agent-control.example.json`](../config/agent-control.example.json). See [`docs/token-aware-command-output.md`](token-aware-command-output.md) for architecture, tool contracts, defaults, provenance and limitations.

## Harness efficiency and context budgets

The experimental [Local Context Compiler](local-context-compiler.md) implements exact-evidence-preserving E2B/E4B triage, bounded Luna/Sol escalation, runtime qualification, five-way benchmark accounting, and routing audit telemetry. It is disabled by evidence: no local tier is usable until its physical runtime passes measured qualification, and no efficiency success is claimed without a complete frozen-corpus comparison.

Agent Control now records execution as a strategy, not just a model choice: model, provider, harness profile, context packet, tools, turns, cache observations and verifier outcome. The main process persists prompt-free invocation metadata in its protected state directory and shares that ledger with Job verification and dashboard projections. Provider usage is normalised into fresh, cached, cache-write, output, reasoning and total tokens where exposed; unavailable measurements and costs remain explicit `null` values. The dashboard's **Harness Efficiency** diagnostic reports token composition, cache effectiveness, escalation and cost per verified outcome without rewarding an unverified cheap run.

`ContextPacketBuilder` ranks exact evidence and keeps its provenance while recording every omitted source. `THIN` provides only bounded targeted context and required tools, `STANDARD` is the compatibility default, and `DEEP` permits wider graph/context retrieval for justified complexity. `HarnessProfileRouter` is observational by default: it can recommend a profile, but applies `STANDARD` until same-model, verifier-backed evidence is explicitly production-qualified. Escalation advances `THIN -> STANDARD -> DEEP` once and preserves packet/checkpoint references.

`ContextGraph` is a provider- and database-neutral port; its initial in-memory adapter proves queries, relationships, compact evidence and verified write-back without introducing a graph service. See [`docs/harness-efficiency-architecture.md`](harness-efficiency-architecture.md) and the explicitly deterministic [`docs/harness-efficiency-report.md`](harness-efficiency-report.md). Run the frozen 20-job experiment with `npm run benchmark:harness-efficiency`; its JSON counterpart is [`artifacts/harness-efficiency-report.json`](../artifacts/harness-efficiency-report.json). The separate [`live same-model report`](harness-efficiency-live-report.md) records provider tokens, cache behavior and latency from a controlled typed-tool run; it remains experimental evidence and does not enable production routing.

The opt-in real-mutation benchmark goes further: a live model receives only six typed, policy-gated repository tools and modifies a fresh disposable Git fixture. Hidden deterministic verifiers, public regressions, scope rules, syntax, `git diff --check`, and credential/topology scans decide success independently of model claims. It compares THIN, STANDARD, DEEP and cumulative THIN-to-STANDARD-to-DEEP escalation with the same model and settings. The recorded 12-task run did **not** qualify automatic routing: STANDARD and DEEP each verified 2/12 tasks, the adaptive strategy also verified 2/12 but consumed 255,213 processed tokens per verified outcome, and THIN verified 0/12. Production therefore remains observational with STANDARD applied. See [`docs/harness-mutation-report.md`](harness-mutation-report.md) and [`artifacts/harness-mutation-report.json`](../artifacts/harness-mutation-report.json).

The dashboard opens on the **Jobs** catalog. A Job can be started manually from the dashboard, requested through the authenticated API, or created by a timezone-aware Schedule; every trigger calls the same `createRun` path. Job detail includes schedule state, structured step progress, verification, placement, immutable artifact metadata and provenance. Queue inspection exposes age, priority, waiting reason, missing capabilities, eligible workers and resource locks; searchable Run history exposes duration and selected workers. Safe cancel, retry and named-approval controls still enter through `AgentControlService`. Use **Lanes** for interactive agent work. Press `J` in the TUI for the same authoritative Job/Schedule/Run projection.

## Jobs and schedules

Repository-managed YAML manifests beneath `config/jobs/` define versioned Jobs and separate Schedules. JSON Schema validation, typed parameters, dependency checks and Action registration fail closed at load time. Jobs request semantic capabilities and resources; they never name a host. Configured resources become workers by advertising those capabilities, and Agent Control records why each worker was selected or rejected.

```bash
npm run qualify:jobs
```

The qualification Job is deliberately non-production and its twice-daily `07:00/19:00 Europe/London` Schedule is disabled. Enabling a Schedule does not grant a requested capability or approval. See [`docs/jobs-and-scheduler.md`](jobs-and-scheduler.md) for the manifest contract, custom-Job example, Run states, artifact handoff, locks, retries and operator procedure.

## Configuration model

The versioned JSON schema has six independent collections/policies plus optional output, harness-efficiency, and parameterised-job policies:

- `resources`: identity, platform, transport and semantic capabilities;
- `providers`: provider identity, API endpoint, wire protocol, authentication reference and capabilities;
- `models`: stable model identity, provider model ID, declared capabilities, node scope, limits, qualification and optional sourced pricing;
- `modelRouting`: logical role to ordered primary/fallback model mappings and an optional default role;
- `services`: health endpoint and optional explicit start recipe;
- `lanes`: lane identity, working directory, priority and AUTO/MANUAL mode.
- `tokenAwareOutput`: provider-neutral completeness, index, artifact, retention and context-budget thresholds.
- `harnessEfficiency`: observational/enforced routing mode, verifier-evidence thresholds and configurable THIN/STANDARD/DEEP budgets. `observe` is the safe default.
- `spark`: optional, default-disabled fast-execution policy: exact model/registry role, one-file/line/context limits, one attempt, zero subagents, and mandatory independent verification.
- `jobs`: allowed node-local repository roots and optional allowlisted HTTPS/Git remote prefixes for parameterised repository jobs.

Resource identity is separate from transport. A resource may be local, SSH, HTTP or Orca-backed. An SSH hostname is transport metadata, not the resource ID. Ports are configurable numbers. Optional unavailable services do not make an otherwise valid zero-provider installation fail.

Providers and external services that require API keys use an indirect environment, referenced-file or `provider-secure-store` reference. Configuration stores only the reference; the generic secure-store backend keeps its value owner-only beneath the state directory and resolves it at invocation. Plaintext API keys, passwords, tokens, secrets and credentialed URLs are rejected.

For a managed Linux resource, `managedNode` adds polling/heartbeat policy, declarative protected-workload detectors, approved services, BUSY capability fences and an optional operator-reviewed runtime update target. Hardware, package tools, filesystems, optical devices, secure-overlay state and operational capabilities are discovered rather than assumed. Real endpoints and workload identifiers remain operator configuration, never core defaults.

See [`config/agent-control.example.json`](../config/agent-control.example.json), [`ARCHITECTURE.md`](../ARCHITECTURE.md), [`docs/adaptive-multi-model-orchestration.md`](adaptive-multi-model-orchestration.md), and [`docs/concepts.md`](concepts.md). The older [`docs/architecture-v2-agnostic.md`](architecture-v2-agnostic.md) remains a configuration-neutrality appendix.

## Adaptive harness

`AdaptiveHarness` assembles an execution recipe from policy-approved components. The fingerprint now includes harness profile and context strategy alongside model/provider identity. `SkillCatalog` selects only qualified skills with qualification evidence. `ToolPolicy` produces an explicit minimum grant and revalidates the lane, lease generation, ownership generation and human-owner fence at tool use. `EconomicRouter` rejects unhealthy, unqualified, incapable, over-budget, low-confidence or unapproved routes before comparing effective monetary, latency, occupancy, contention, failure/retry and quality costs.

The same task can therefore receive different scaffolding. A strongly qualified model may use a direct prompt with no extra skill; a smaller model may use a guided profile, a qualified task skill, narrower context and fewer tools. Both remain subject to the same Agent Control authority and verification policy.

Current boundaries are intentional:

- the catalog selects already-qualified skills but does not create, qualify or approve new ones;
- normal Work Queue agent dispatch is recipe-backed, persisted/inspectable and stops at `verification-pending` rather than accepting process completion;
- named control operations such as Android provisioning are explicit, scope-checked exceptions and cannot become a legacy agent fallback;
- the generic `AgentAdapter` receives only the recipe and policy gateway, but Orca/SSH CLI-internal tools are opaque to Agent Control and are not yet qualified as universally moderated tool calls;
- model-backed Job Actions are qualified through the sole `HarnessJobAgentAction` bridge; they enter through `HarnessDispatcher`, receive only policy-gated tools and stop at verification rather than treating model completion as acceptance;
- model qualification and successive halving operate on recipe fingerprints, but governed skill generation and automated recipe learning remain follow-on 3.1 work.

## Durable work and evidence

Agent Control persists hard contracts, revisioned batons, append-only events, checkpoints, Work Queue state and shared context metadata. Handoffs may include a compact baton, Git/test evidence and selected provider-neutral context sources. Git and independently reproducible tests remain authoritative; shared threads are optional read-only context and never required for recovery.

The Work Queue supports interactive, priority, background and batch work, dependencies, capability selection, data locality, quiet periods, maintenance windows, homogeneous batch leases, item-by-item commit, checkpoints, retries and low-confidence human review. The Job runtime adds reusable multi-step workflows above those atomic scheduling concepts: a durable Run ledger, timezone-aware triggers, step dependencies, resource locks, typed artifacts, bounded retries, approval waits and verification gates.

Agent completion is modeled as `CLAIMED -> EVIDENCE_COLLECTED -> VERIFIED -> ACCEPTED`. A claim cannot satisfy a verification-required task. Lane policy can require minimum-sufficient evidence such as a Git commit, diff, test/build result, file hash, API result, UI evidence, benchmark, external source or human approval. Failed required evidence blocks verification, and acceptance remains a separate explicit action.

Routing is capability-qualified and fail closed. Eligible routes may be compared using capability, provider health, reliability, monetary cost, latency, expected duration, context/tool requirements, privacy, local/GPU availability, priority, urgency and operator preference. The selected route, alternatives and plain-language rationale are stored with the lane.

Model/provider qualification already records complete model recipes including runtime, context size, chat template, prompt version, skill/tool snapshots and inference parameters. Overnight experiments use successive halving across strategy fingerprints that can also identify provider, harness profile and context strategy. A challenger must preserve verifier-gated quality before cost or fresh-token efficiency can break a tie; fewer tokens alone never promote it.

## Authority and safety

- Human takeover is unconditional and fences agent input.
- One PTY has at most one logical owner.
- Missing or stale execution identity fails closed to disconnected/recovering/unknown state.
- Provider/context failures cannot mutate leases, ownership, scheduling or PTYs.
- Recovery uses explicit configured recipes and existing credentials.
- Agent Control never stores secret material in product configuration.
- Shared URLs are attached only when already explicitly shared; creating/broadening sharing requires separate approval.
- The browser has no direct lease, scheduler, persistence or PTY-input endpoint.
- External context and provider adapters remain non-authoritative regardless of interface.

## Orca execution boundary

The execution contract is intentionally replaceable: start, status, reconnect, input, pause, resume, cancel, output, diff and cleanup. Agent Control validates task/session identity, lease generation, ownership generation, host, repository, worktree, branch and nonce before accepting recovery. Orca convenience features cannot bypass those checks through the supported adapter.

## Android

Android is one optional resource type, not a named device. The bundled Termux node advertises observed capabilities and accepts only the allow-listed read-only log observation job. Provisioning has explicit privilege, wireless-pairing and reboot approval gates. See [`android/README.md`](../android/README.md).

## Validation

```bash
npm run typecheck
npm run check:bootstrap
npm run check:neutrality
npm run check:distribution
npm test
npm run check
npm run qualify:jobs
npm run benchmark:token-output
npm run benchmark:harness-efficiency
git diff --check
```

`npm run benchmark:harness-mutation:live` is a separate, opt-in live experiment. It requires an explicitly qualified OpenAI-compatible endpoint/model in environment variables and never runs as part of the ordinary local gate.

The neutrality guard rejects private topology identifiers in distributable runtime, tests, documentation, filenames and examples. The audit ledger and changelog are explicit historical exceptions.

## Current limitations

- Local wireless ADB is physically qualified on the recorded Android 17 / Termux / ADB 35.0.2 Pixel environment. Other Android and ADB builds remain capability-assessed, and first pairing always requires the local hidden-stdin system ceremony.
- Linux process-group and Windows process-tree cleanup are physically qualified. Unsupported substrates still report cleanup uncertainty instead of releasing authority without proof.
- The matched real Codex cache-boundary comparison preserved independent outcome quality but the 3.9 candidate consumed more tokens and elapsed time. The CLI does not expose explicit prompt-cache controls, cache writes, authoritative current-context occupancy or billed cost, so no repeatable saving is claimed; explicit Responses controls remain disabled until an exact provider/model route is qualified.
- Orca remains optional and the existing execution path remains available as fallback.
- Reboot recovery is qualified only per explicitly tested environment; source support is not a universal live qualification claim.
- OpenAI ChatKit access uses official supported APIs and remains qualified only for the exact tested project/thread state recorded in provider evidence.
- ChatGPT Work and Codex shared task context remain host/reference-only unless an official read API is available.
- Windows OpenAI execution is switchable: `auto` prefers a configured Responses API key and otherwise uses official Codex non-interactive execution with the saved ChatGPT-plan login. Both the Responses API and ChatGPT-plan routes are live `SUPPORTED+QUALIFIED` through the adaptive harness and central tool gate; ChatGPT desktop-window automation remains unimplemented and untested.
- Skill proposal, security review, sandbox qualification, approval and promotion remain follow-on 3.1 work; an unqualified proposal cannot be selected by the current catalog.
- `config/implementation-status.json` is the machine-readable implementation boundary. `npm run status:implementation` renders it for inspection and `npm run check:status` fails when the generated [`docs/implementation-status.md`](implementation-status.md) projection or its evidence paths are stale.
- The Job Catalog, Worker Registry, Run Ledger and web dashboard are implemented in 3.1.0. Model-backed Job Actions enter through `HarnessJobAgentAction`; each production provider still requires its own live qualification.
- No production deployment is performed by this repository release process.
- The events workflow is qualified only against a safe fixture target; authenticated Facebook discovery and the existing LocalWalks production publisher are not invoked or production-qualified by this source change.
- Ripgrep is the only semantic command-output adapter in this change. Other oversized command families use the generic labelled fallback until a specialised index is added. A tiny typed ripgrep request retains its structured authoritative stream and therefore can be larger than normal human-formatted `rg`; it is not compacted merely because it came from ripgrep.
- Harness-profile routing remains observational. A live same-model repository-mutation experiment now measures provider tokens, observed warm-cache behaviour, latency, independent verifier outcomes and cumulative escalation cost, but its 12-task sample had only 2/12 STANDARD successes and no adaptive resource advantage. No profile is production-qualified; STANDARD remains the applied fallback and monetary cost remains unknown.

The foundational operator guide is [`docs/Agent-Control-3.1.0-Operator-Guide.md`](Agent-Control-3.1.0-Operator-Guide.md), distributed as [Markdown](../assets/releases/3.1.0/Agent-Control-3.1.0-Operator-Guide.md) and [PDF](../assets/releases/3.1.0/Agent-Control-3.1.0-Operator-Guide.pdf). For current operation, use [`docs/governed-retrieval.md`](governed-retrieval.md), [`docs/credential-residency.md`](credential-residency.md), [`docs/token-aware-baton-routing.md`](token-aware-baton-routing.md), [`docs/adaptive-multi-model-orchestration.md`](adaptive-multi-model-orchestration.md), [`docs/execution-history.md`](execution-history.md), [`docs/contract-pty-runtime.md`](contract-pty-runtime.md), [`docs/governed-handoffs.md`](governed-handoffs.md), [`docs/provider-model-lifecycle.md`](provider-model-lifecycle.md), [`docs/models/CODEX-INTEGRATION.md`](models/CODEX-INTEGRATION.md), [`docs/acp-compatibility.md`](acp-compatibility.md), [`docs/fast-execution.md`](fast-execution.md), [`docs/security-3.6.md`](security-3.6.md), [`docs/identity-sessions-delegation.md`](identity-sessions-delegation.md), [`docs/jobs/README.md`](jobs/README.md), [`docs/jobs-and-scheduler.md`](jobs-and-scheduler.md), [`docs/managed-nodes.md`](managed-nodes.md), [`android/README.md`](../android/README.md), [`docs/web-dashboard.md`](web-dashboard.md), [`docs/status-command.md`](status-command.md), and [`ARCHITECTURE.md`](../ARCHITECTURE.md). Candidate scope and migration guidance are in the [`3.9.0 release notes`](release-notes-3.9.0.md) and [`3.9 migration guide`](migration-3.9.md); historical releases remain immutable.

## Optional WhatsApp pilot

See [OpenWA setup and qualification status](openwa/README.md) for the private adapter, dedicated-account linking, operator enrolment, bounded commands and delivery recovery. This is a feature pilot; physical WhatsApp qualification is pending. Dashboard access and core jobs remain available when the adapter is disabled.

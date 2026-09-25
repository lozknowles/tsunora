# How do I see what Agent Control is doing?

Open **Estate**, tap a machine, then choose its active work. **Open Process Map** shows recorded operations; selecting an operation opens the **Run Inspector**. From a visible process, one selection opens the inspector and a tab selection exposes prompt, output, tokens or history.

The hierarchy is **Estate → Node Dashboard → Process Map → Run Inspector → evidence**. Every inspector has Estate, Node Dashboard where bound, Process Map and Close controls. Escape closes the inspector and restores browser focus. Mallow and crew remain available in the surrounding dashboard; **Ask Mallow** opens the assistant with the same node or run reference.

## Estate and Node Dashboard

Estate remains the overview of discovered devices, resources, runtimes and their readiness. Selecting a physical machine opens large resource cards and its recorded Agent Control work. Selecting another resource returns to its existing Estate details.

Node cards adapt to discovered capabilities. An observed GPU exposes GPU and VRAM cards; a CPU-only machine does not inherit accelerator panels from another node. Android observations expose battery and connectivity facts where supplied. Existing managed-node measurements, services and connectivity remain available through the capability/provenance details.

Local native resource samples use the discovered local-machine identity, never a match on a hostname. CPU busy is calculated from two counter frames; the first frame is unavailable. Memory and controller-volume storage come from the operating system. The NVIDIA adapter is selected only for an accelerator actually identified by discovery; unsupported accelerators retain unavailable live measurements. No remote address, model server or credential is probed by opening this view.

Measurements include source, observation timestamp and authority. Whole-node CPU/RAM and whole-device VRAM are not per-job allocations. A machine may be consuming resources for work Agent Control does not own. Live native sampling does not renew the separate discovery/admission qualification. A stale Estate observation and a current resource sample can therefore coexist honestly.

## Physical and logical bindings

The work index uses recorded provider execution nodes, stage execution routes and owned execution-session scopes. It includes Work Parcels and standalone deterministic Job Runs. An identical worker name, repository location, credential residency or provider label alone cannot create a physical execution link.

The Run Inspector exposes the reverse link to exact discovered nodes. Unknown or undiscovered identities remain unbound. Work bound to a node is shown across recorded parcels rather than only the currently selected parcel. Finished records are history, not current consumption. Waiting work without a placement cannot be assigned to a machine by this interface.

## Process Map and Run Inspector

The existing Process Map retains its named cards, labelled connections, replay and engineering evidence. Selecting a card opens that exact operation. A model-call card resolves its own invocation evidence, not the last call in the run. Deterministic jobs preserve their recorded action and provenance semantics.

Inspector tabs:

- **Overview:** actual state, elapsed time, canonical token summary and source lifecycle records.
- **Prompt:** the retained, redacted model input for the selected invocation.
- **Context & batons:** recorded context state, omissions, routes and handoffs.
- **Output:** retained redacted model output, with capture truncation disclosed.
- **Tools & events:** actual event names, timestamps and owned-session identities; open the existing session transcript for recorded activity.
- **Tokens & cache:** five token counters, worker groups, exact model-call accounting, cost coverage and cache evidence.
- **History:** the canonical parent Job Run Markdown, when available, and its SHA-256. Other jobs have a clearly labelled export derived from their durable audit/operation records.

Running/verification states have a pulsing lozenge and elapsed timer. The terminal timer freezes. Reduced-motion preferences disable animation. Queued, waiting and blocked states are labelled without pretending to execute.

The event stream uses the actual Work Parcel audit, Process Map events or Job Run provenance. It does not create INPUT/TOOL/CACHE events merely to fill a presentation. If a deterministic action has no model exchange, the inspector says so. A completed model invocation may become available only after the provider reports its counters and output.

## Token accounting and reuse

The inspector consumes the canonical usage projection. Repeated lifecycle snapshots are not added together. Run-level accounting is filtered to the exact Work Parcel or Job Run; worker grouping and model-call details come from the same invocation ledger. Legacy and missing accounting coverage remain visible.

The five counters are **input, cached input, fresh input, output and total**. Fresh input is derived only under attested provider input semantics. Unknown counters remain unavailable, including when only some calls report them. Zero cached input means a reported zero for those calls, not proof that caching is generally supported.

These are separate mechanisms:

| Mechanism | What the evidence means |
|---|---|
| Provider prompt cache | Provider/runtime-reported cached-input accounting and attested input semantics |
| Agent Control context reuse | Retained context sources, omissions and reconstruction records |
| Baton | Governed handoff state, provenance and source/destination routes |
| Persistent memory | A separately recorded source; not automatically provider cache |
| External context store | An explicit source such as a knowledge store; not silently relabelled cache |

Cache ratio is derived only when comparable input/cache counters are available. Cached tokens are still input tokens. Tokens avoided by context reuse require an evidenced baseline; a handoff alone does not establish them. Monetary cache saving requires applicable pricing and supported token partitions. Different currencies are not converted or combined. Subscription-included execution without monetary billing evidence remains cost-unavailable.

Current provider context occupancy and generation-only/prompt-processing throughput remain unavailable when not separately reported. An end-to-end output rate, where shown, is output divided by total call latency and is explicitly labelled derived; it is not provider generation speed.

## History, access and safety

Existing canonical execution transcripts retain their complete parent-run scope, checksum and terminal/live status. The selected operation remains exact even when the History tab opens the wider parent Job Run; the scope is stated above the document. A derived history export is generated from durable source records without changing their contents or adding events. Downloaded Markdown can be retained outside the dashboard.

Markdown rendering is deliberately limited to escaped text, headings and fenced code. Raw HTML and remote content are not executed. Input/output capture respects existing governance, redaction and retention boundaries; the UI does not fetch credentials or hidden provider reasoning. Unavailable or truncated source capture is disclosed rather than reconstructed.

The new `/api/observability/nodes/:id`, `/resources` suffix and `/api/observability/runs/:id?operation=...` routes require existing operator authentication and read authority. Opening views does not start jobs, modify discovery, renew qualification, activate a model or change a device configuration. Existing job controls continue to own execution.

## Mallow and optional voice

Mallow resolves `node-dashboard` and `run-inspector` references through the same service projections. It can explain state, bound work, token coverage and recorded context/baton evidence. It is not a second scheduler or a separate source of runtime truth.

The existing optional live voice transport remains independently qualification-gated. GPT-Live-1 must not be advertised as qualified on a device merely because the dashboard works there. Text remains available. Existing provider, physical-audio and Android background limitations continue to apply.

## Qualification scope

This follow-on starts from the immutable public v4.7.0 commit `27124db3d5924b1244be590ef3ea48d4c3b183bc`. The published tag and accepted recordings are preserved. The observability qualification report records the exact new commit, checks and evidence; pending gates are not an implicit release approval.

Desktop Chromium and a Pixel-class 390×844 touch viewport exercise the same journey, large touch targets, horizontal overflow checks, history download and back navigation. Emulation is not physical handset qualification. A real governed execution and current hardware samples are required for the final demonstration; older records and test fixtures are not substitutes for that live run.

### Mobile reading and whole-job totals

On mobile, use the full-size physical-node buttons above Estate Topology, then choose an Inspector section from the 44-pixel selector. Desktop retains the section tabs. Whole-job totals count each canonical invocation once across all Work Parcels; selected-parcel and individual-call counters remain separately labelled. The Context section exposes the recorded repository profile, chunks, omissions and truncation. Provider cache reuse is separate from context selection and baton handoff.

The follow-on review corrected stale node back-links, canonical-accounting throughput and accelerator-inventory cache isolation. Unknown output remains unknown when canonical accounting is present.

The active lozenge and elapsed timer stay in the inspector header while evidence scrolls. Multi-node work keeps an explicit originating node only when the run confirms that binding. CPU utilization uses one whole-node counter stream with at least one second between frames. A missing accelerator reading retains an unavailable measurement. Individual model-call accounting is resolved by its exact canonical identifier even beyond the 1,000-row summary-detail limit; excluded accounting remains excluded.

Refresh requests are coalesced while a read is pending; a complete changed node projection updates the displayed provenance while retaining expanded details. The physical origin belongs to the current Process Map opening and is revalidated against run evidence. Returning lane ownership now requires an actual human-owned terminal session, and every session is checked before any ownership is transferred.

See the [qualification report and recorded evidence](observability-qualification-4.7.md) for exact source, tests, review outcomes and physical limitations.

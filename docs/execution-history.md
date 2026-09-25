# Human-readable execution history

Agent Control 3.8.2 projects existing durable execution evidence into a chronological operator view. It answers what was requested, what route ran, what observable actions occurred, what the provider returned at the validated boundary, how tokens and cost accumulated, what the governor decided, and whether verification accepted the outcome. “Human-readable” means typed durable facts are rendered as concise operator-facing sentences and cards; it does not mean Agent Control captures every process log or model-internal thought.

## Source and association

For new external-channel work, `agent-control.request-origin/v1` is the first transcript section. It preserves the exact initiating text—or the retained speech transcription linked to a separate text confirmation—plus channel, receipt time, authentication classification, governed actor, granted template authority and one-way message/identity references. It never stores a phone number, JID, email, cookie, OAuth material or provider credential. Historical Runs without this record remain honest: the projection does not invent channel provenance.

A voice transcription is labelled as untrusted even after it is retained. The independent authenticated text confirmation authorizes execution; it does not retroactively make speech recognition authoritative. The full transcript shows both opaque references and this distinction before any generated summary or lifecycle event.

The view has no independent transcript store. A Saved Job Run is rebuilt from:

- the immutable Job Run and its lifecycle transitions;
- only the Work Parcel IDs recorded on that Run;
- only token threads, governor decisions and batons carrying those parcel IDs;
- repository snapshot, bounded context, route, result, verification and accounting evidence already retained by those stores.

A Lane history is similarly restricted to that Lane's durable objective, activity, baton state, route and verification. Saved Job identity connects the reusable configuration to each immutable Run, and Run-owned Work Parcel IDs provide the only association boundary for provider, telemetry, governor and baton records. Evidence from another Run, Parcel or Lane is not merged by time or by similar display name.

Entries are ordered by their durable timestamps and then stable entry identity. This makes simultaneous events deterministic without inventing causality. The service returns the most recent 160 entries per projection. Reloading reconstructs the view from durable sources; the dashboard reconnects through the existing SSE refresh path and refetches the canonical projection. SSE does not become a second history store.

## Entry semantics

Actors are `OPERATOR`, `SYSTEM EVENT`, `AGENT / PROVIDER`, `TOOL / ACTION`, `GOVERNOR`, `BATON` and `ERROR`. Entries retain the applicable Run, Work Parcel or Lane identity and may include safe provider/account-label/model route information.

- **Operator** entries represent the durable request or Lane instruction.
- **System** entries represent Run transitions, route selection, independent validation and ledger reconciliation.
- **Agent/provider** entries represent a bounded structured request, retained response hash/accounting, or validated human-readable result—not raw provider traffic.
- **Tool/action** entries represent immutable repository/context preparation and Work Parcel audit events.
- **Governor** entries represent the actual persisted pressure state, selected routing action, outcome and reason.
- **Baton** entries represent sealed checkpoint creation and its digest.
- **Error** entries represent fail-closed lifecycle, provider, validation or handoff outcomes using safe diagnostics.

Handoff labels describe evidence, not aspiration:

- `HANDOFF_RECOMMENDED`: the governor reached handoff pressure but selected continuation or compaction;
- `HANDOFF_REQUESTED`: a governed request was recorded, but destination acceptance/execution is not established;
- `HANDOFF_COMPLETED`: the durable `BATON_AND_HANDOFF` outcome is `SUCCEEDED`;
- `HANDOFF_FAILED`: the attempt failed and the original thread remains recoverable.

A `BATON_CREATED` card proves creation and sealing only. It does not claim dispatch, acceptance, destination execution or handoff completion. The current history model has no invented standalone “accepted” state: destination acceptance/continuation must be supported by the governed handoff record and destination invocation before a successful `BATON_AND_HANDOFF` outcome is displayed as completed.

## Telemetry and accounting

Current context and lifetime usage are separate. Context values carry `authoritative`, `estimated` or `unavailable`; cumulative input/output/total values and cost carry their own authority.

- `authoritative`: the provider or execution adapter emitted that exact measurement with unambiguous provenance;
- `estimated`: Agent Control calculated the value from an adapter estimate, configured context limit or price table;
- `unavailable`: the provider did not expose a usable value, so the dashboard shows unavailable rather than zero.

Some providers expose usage only after completion. Their initial history entry therefore shows current context and lifetime usage as unavailable; a genuinely one-request adapter can add an explicitly estimated single-turn context value where defensible. Codex `turn.completed.usage` can aggregate several internal calls, so the Codex exec adapter never treats it as current-context occupancy and leaves context unavailable unless Codex emits a separate usable signal. If another adapter's estimated current context exceeds the configured window, the dashboard displays 100% and explains that it is a clamp. A displayed estimated 100% is not an exact provider-reported measurement and does not establish that the provider exhausted its context.

The history reconciles Job and Work Parcel totals. It displays cumulative total input with fresh and cached components separately. Missing cached-input reporting leaves both components unavailable rather than becoming zero, while authoritative total input is retained independently. A calculated price that depends on an unavailable discounted-cache split remains unknown; total-token reconciliation can still succeed.

## Complete execution transcript

The Run-detail **Complete execution transcript** is generated by Agent Control during execution. It is not a release summary written afterward. `ExecutionTranscriptRuntime` listens to the durable Run, associated Work Parcel and token/baton stores, renders the complete history mode to an owner-only Markdown file, and stores an adjacent metadata manifest. It refreshes after each authoritative change and again at startup.

The document begins with the retained initiating request and channel/authentication metadata when that provenance exists. It then contains the exact governed Job instruction and immutable operator parameters, lifecycle and Work Parcel identities, route selection and rationale, safe invocation/tool/audit events, retries and classifications, governor and baton events, provider/account/model changes, telemetry with authority, independent verification and terminal result where those facts exist. It identifies `LIVE`, `CONTROLLED_FAULT_INJECTION` and `SIMULATED` explicitly. A controlled fault is never described as a natural outage.

Two digests protect different boundaries:

- `sourceSha256` hashes the deterministic complete history projection;
- `sha256` hashes the rendered Markdown document.

The endpoint `GET /api/job-runs/:runId/transcript` verifies document integrity before returning it. Recreating the runtime after restart must produce the same source and content hashes and byte-identical Markdown when the durable evidence has not changed. The transcript remains subject to the same redaction and association rules as history: “complete” means every retained observable event associated with that Run, not raw HTTP traffic, unbounded subprocess logs, credentials, discarded response bodies or private chain-of-thought.

## Security and retention

The projection permits validated summaries, typed lifecycle facts, hashes, safe account labels and numeric telemetry. It excludes raw prompts and frozen repository context, raw or rejected provider bodies, hidden reasoning, authorization material, API/OAuth tokens, cookies, email addresses, credential environment values, resolved credential-home locations and local profile paths. Control characters and oversized strings are bounded before display. The existing HTTP redaction boundary is applied after projection as defense in depth; safe numeric context counters are allow-listed without permitting credential-like token fields.

Human-readable execution history is therefore not raw logs, raw JSON, complete unredacted provider request/response traffic, or hidden chain-of-thought. Agent Control stores and displays observable outcomes and governed evidence, not private model reasoning.

`repository_review_provider_schema_invalid` means provider output parsed as JSON but failed the repository-review application contract. Provider-side structured-output validation occurs first where supported; Agent Control then validates independently before repository verification. New failures can show a bounded safe constraint such as `$.findings[0].category:enum`; they do not expose the rejected value. The raw rejected response remains ephemeral, while its hash, usage and safe failure classification can remain durable. Historical failures recorded before path-level diagnostics correctly say that the exact rejected field is unavailable.

In 3.8.2 the provider-facing contract and application semantic contract align on schema literals, enums, ranges, required/non-empty values and location constraints. Independent validation remains fail closed rather than trusting provider transport enforcement.

## Operator use

Open **Saved Jobs → Runs**, select a Run, then open **Execution history** or **Complete execution transcript**. Read provider and tool/action cards as observed activity, governor cards as policy decisions, baton cards as checkpoint evidence, and the final verification/accounting cards as outcome evidence. Lane-local history appears in **Lanes → Activity**. New SSE activity refreshes these projections without changing their durable source or requiring a page reload. Do not infer destination execution from a baton or a recommendation.

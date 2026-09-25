# Token-Aware Baton Routing

Agent Control 3.7 records live, provider-neutral token state for every thread that is connected to the execution adapter. An account-bound governed route is `provider → account profile → model → execution node`. The state is durable at `.agent-control/token-baton-routing/evidence.json` and is projected read-only through `GET /api/token-routing` and the normal `GET /api/status` snapshot.

## Telemetry semantics

Each sample keeps separate values for cumulative total input, fresh input, cached input, cache-write input, output and total tokens, current context tokens, context-window limit, context percentage, cost, elapsed time, and authority. Cached and cache-write input are components of total input. If a provider reports total input without a cache split, fresh/cached/cache-write components remain unknown as applicable while total input remains available; no component is invented as zero. A calculated cost also remains unknown when a distinct cache-read or cache-write price requires a measurement the provider did not supply. Lifetime totals are never used as a substitute for current context occupancy.

`authoritative` means the provider emitted the value. `estimated` means Agent Control calculated it from a configured price table or adapter estimate. `unavailable` means the provider did not expose it; the dashboard renders `unknown`, not zero.

The current Codex CLI JSONL path emits `thread.started` while a thread is live and exposes cumulative turn usage on `turn.completed`. A Codex turn can contain more than one internal model call, so that cumulative value is not a defensible estimate of retained current context. Agent Control records any configured context-window limit but marks current context and context percentage `unavailable`; unavailable context produces `CONTINUE / current_context_unavailable`, not a pressure transition. Codex 0.153 app-server clients can additionally normalize persisted `thread/tokenUsage/updated` and `contextCompaction` events. Because the public thread-usage count can be provider-reported or locally recomputed after compaction without an authority flag, Agent Control marks that context occupancy `estimated`, not authoritative. Responses-compatible providers (including configured GLM-5.3-Flash and local providers) publish start/completion state and normalized provider usage. An adapter that has a provider-native live context field with unambiguous provenance may submit it as `authoritative` without changing governor policy.

## Prompt caching and session continuity

The schema-constrained Codex repository-review adapter is intentionally one-shot and ephemeral. Each invocation rebuilds the fixed review instruction, the assigned frozen context or compact Evidence Packet content, optional rehydrated baton evidence, and the stable output schema. It does not resend an implicit conversation transcript. Changing Evidence Packet and baton identifiers are appended after reusable instruction/content rather than inserted before it, preserving the longest practical stable prompt prefix without changing provenance.

3.9 represents this as a provider-neutral ordered set of `stable` and `volatile` text blocks with a non-secret cache scope. Rendering those blocks is always sufficient to execute the request. Provider-specific cache controls are optional adapter optimizations: the Responses adapter derives a one-way `prompt_cache_key` only when both provider and model advertise `prompt-cache.key`, and emits an explicit stable-prefix breakpoint only when both advertise `prompt-cache.explicit`. Chat Completions, Codex CLI and unqualified providers receive their existing request shape. A capability declaration is not evidence of provider support; qualify the exact provider/model before enabling it.

`--ephemeral` prevents local rollout persistence; it does not disable provider prompt caching. Physical repeated runs received non-zero provider-reported cached input under ephemeral execution, followed by otherwise identical sequences with different cache hits. Cache behavior is therefore observational and non-deterministic. Cache reads, writes, fresh input and total input are retained separately, and `pricing.cacheWritePerMillionTokens` is used only when a write count is present. Agent Control does not claim a saving merely because a unit test normalizes a cache field or a provider accepted a control.

Run the controlled alternating comparison with `npm run qualify:provider-cache -- --output=/absolute/evidence.json --repository=/absolute/repository --files=path/a.ts,path/b.ts`. It records prompt/stable-prefix hashes, order, provider/account/model identity, token components, response hash, elapsed time and limitations without prompt bodies or credential paths. It is measurement, not automatic promotion; compare accepted verified outcomes before latency/tokens, and leave monetary conclusions unavailable when pricing or write telemetry is absent.

Persistent `codex exec resume`, app-server sessions and native compaction are not enabled for repository review in this change. The comparison did not establish a token or latency benefit, while safe reuse would require lifecycle ownership and invalidation across account, execution node, workspace, lane and policy boundaries. A future adapter may add that optimization after qualification; the Work Parcel, Evidence Packet and sealed baton remain the authoritative cross-provider recovery record.

For this immutable review path, selected `CODEX_HOME` authentication is retained while user configuration, exec-policy rules and project instructions are ignored. Codex-native shell, unified exec, multi-agent, web search, browser, computer, app, image-generation and workspace-dependency surfaces are disabled with strict config validation. Those provider-internal actions are not individually mediated by Agent Control's `ToolPolicy`; post-run item types are observations, not authorization evidence.

Context lifecycle is generic durable evidence. Adapters can record `COMPACTION`, `NEW_CONTEXT`, `CONTINUATION`, or `RESUME` with an authority/source marker and optional opaque context ID. A context reset may lower current occupancy, but cumulative thread and Work Parcel usage never decreases. When a provider explicitly reports that the post-transition count is unavailable, Agent Control clears stale occupancy and pressure while retaining a separately known window; it does not let a pre-compaction percentage trigger a false handoff. Provider-native mechanisms remain behind adapters: Codex's experimental token-budget reminders, history notes and `new_context` tool are not required by core.

## Governor policy

The default policy is deliberately configurable:

```json
{
  "tokenBatonRouting": {
    "continuePercent": 60,
    "prepareBatonPercent": 75,
    "compactPercent": 85,
    "handoffPercent": 90,
    "sampleRetention": 240
  }
}
```

- Below 60%: `CONTINUE`, next threshold 60%.
- At 60%: `CONTINUE`, with the pressure checkpoint recorded and 75% next.
- At 75%: `PREPARE_BATON`.
- At 85%: `COMPACT` and normally `COMPACT_AND_CONTINUE`.
- At 90%: Agent Control evaluates handoff.

High context pressure does not itself downgrade a model. `BATON_AND_HANDOFF` requires completed difficult reasoning, bounded or mechanical remaining work, a sealed baton, a qualified capability-compatible route, and a cheaper candidate where cost is known. Otherwise the decision remains `CONTINUE` or `COMPACT_AND_CONTINUE`, with a durable reason.

The pressure state and routing action are different records:

| Evidence | Implemented meaning |
| --- | --- |
| `CONTINUE` pressure with `CONTINUE` action | Keep the current context and route. |
| `PREPARE_BATON` pressure | Prepare/checkpoint the information a future baton would require; no baton or transfer is implied. |
| `COMPACT` pressure with `COMPACT_AND_CONTINUE` action | Record/perform the available compaction strategy and retain the current route. |
| `HANDOFF` pressure | Evaluate whether a handoff should occur; this is only a recommendation state. |
| `BATON_AND_HANDOFF` with `RECORDED` outcome | A governed handoff request and baton reference exist; destination execution is not yet proven. |
| `BATON_AND_HANDOFF` with `SUCCEEDED` outcome | The governed destination path completed and is eligible to be displayed as a completed handoff. |
| failed handoff outcome | The transfer is not marked complete and the preserved source route remains recoverable. |

Baton sealing, governed dispatch, destination invocation and successful handoff outcome are separately evidenced steps. Agent Control does not synthesize a baton transfer from a threshold crossing.

## Independent quality-gate trigger

The governor accepts a second provider-neutral trigger, `QUALITY_GATE`, for production paths that have an independently configured acceptance boundary. This is not a model self-rating and does not inspect private reasoning. The repository-review gate receives only the frozen request/chunk, schema-valid application result, exact route and response hash, then returns a stable code, bounded evidence, unresolved criteria and exact next action.

A rejection does not weaken schema validation and does not permit an arbitrary route. `TokenAwareBatonRuntime.assess` records the trigger and selects the first policy-ordered alternative that is enabled, independently qualified for the required capability and distinct from the source route. If none exists, execution fails closed with `quality_gate_failed_no_qualified_governed_fallback`; it does not relabel the source output as success.

For an eligible route, the production sequence is:

`provider invoke/observe → independent quality assessment → generic governor decision → sealed baton → governed route/account/model/node handoff → destination execution → same quality assessment → repository verification/recovery`

Every routing decision retains trigger kind/code/reason/evidence. The dashboard and human-readable transcript therefore distinguish a low-context quality escalation from context-threshold handoff, timeout recovery or provider failure. The destination must satisfy the same gate. A failed destination or route-identity mismatch never becomes a completed handoff and leaves the source thread recoverable.

## Verified baton and recovery

Before a handoff, Agent Control seals a durable baton containing the objective, completed work, decisions, changed files, Git SHA and dirty/diff state, tests/evidence, unresolved issues, exact next action, originating provider/account/model/node/thread, token state, and parcel totals. The baton has a SHA-256 digest.

In 3.8, the same provider-neutral baton may include content-addressed Evidence Packet references. A receiving model rehydrates only evidence that still matches repository identity, relative-path boundary, source existence and whole-file content hash, instead of receiving repeated raw context. Failure preserves the original thread and invokes controlled context fallback. An adapter-private index, provider session or native context handle is never the only continuation representation.

The existing governed handoff runtime owns actual process replacement and authority transfer. Baton creation precedes this runtime and is not itself dispatch. A successful handoff requires the durable governed outcome and destination continuation evidence while leaving the original thread recoverable. A failed or approval-pending handoff records the result and resumes the original thread; no provider/model changes silently.

## Production Work Parcel lifecycle

The parameterized repository-review executor is the first normal production lifecycle wired to the governor. It uses an already completed, schema-valid frozen-context chunk as the reasoning checkpoint and treats the next frozen chunk as bounded remaining work:

`provider invoke/observe → assess → seal baton → DELEGATE child contract → invoke destination → independent repository validation`

Assessment occurs only when another immutable context chunk remains. A handoff candidate must still pass the normal model registry's provider, account-profile, model, qualification, node and `repository-review` capability checks. The selected provider/account/model/node is recorded before invocation and the adapter must return that exact identity; it is never substituted implicitly. The receiving prompt includes the sealed baton ID and SHA-256, objective, completed work, decisions, exact next action, origin and parcel total at the boundary.

The destination invocation runs inside the token runtime's governed-handoff result boundary. If it fails, the child contract is independently marked failed, the token decision records `handoff_failed_resume_original_thread`, and the same next frozen chunk is invoked on the preserved source route. If it succeeds, the child contract remains the verification owner. The parameterized-job engine then performs its existing independent repository validation and records that outcome only on the successful execution attempt's provider invocations and surviving source or destination contract. `PASS` and `PASS_WITH_FINDINGS` accept the contract; `REVIEW_REQUIRED` and `FAILED` reject it.

All successful source, destination and recovery invocations are additive in the original Work Parcel audit. Failed provider attempts retain any provider-supplied partial usage/evidence; unknown usage remains unknown.

An engine-level retry keeps the same logical Run identity and frozen repository, but increments a sequence persisted on the Run before provider execution and opens `review:<run>:attempt-<sequence>:<chunk>`. The sequence survives controller restart, while the prior attempt's parcel, telemetry, provider error and recoverability remain durable. This avoids crossing parcel provenance while preserving the token runtime's immutable `provider + account + model + locality` identity check; a retry never rebinds an existing thread or hides `token_thread_identity_changed`. If a Saved Job specifies `maxCost`, execution also fails closed as `job_cost_budget_unenforceable` when neither provider cost nor configured pricing can supply a measurement.

## Dashboard and reconciliation

The dashboard consumes the existing SSE endpoint. `token.telemetry`, `token.governor_transition`, `token.context_lifecycle`, `token.baton_created`, and `token.handoff_result` refresh the live thread panel without a page reload. While a thread is active, its elapsed runtime advances locally from the durable start time between events; completed threads retain the final provider-reported elapsed time. The panel displays provider/account/model, distinct workload/provider-execution/credential nodes, safe account label and reliably attributed plan, qualification/availability, next selected route, context (`Context: 182k / 272k — 67%`), latest context transition, total/fresh/cached input, output and total tokens, authority, cost, governor state/current/next thresholds, and Work Parcel chain totals.

Parcel accounting is additive across threads, accounts and models. Each leg retains total input plus its fresh/cached split where known, and authoritative total input survives even when that split is unavailable. For example, `Provider/Primary/Sol 184k → Provider/Secondary/Luna 31k → Local/default/Fast 18k = 233k total` remains visible after each handoff. The same sampled values, transitions, decisions, account boundaries, baton IDs, and hashes persist in durable evidence and can be reconciled with the final Work Parcel cost-per-verified-outcome ledger.

## Account-aware routing policy

Account profiles do not create a parallel provider system. A model registry row may bind one opaque `accountProfile`, and a Saved Job may require that profile. The profile must have a configured credential-store reference and its own successful qualification before routing. To use one provider-native model with two accounts, configure two model registry rows with distinct IDs and the corresponding account binding.

Account fallback remains a predetermined model-role decision. Agent Control does not select another account because the current account is rate-limited, exhausted, or has less remaining quota, and does not aggregate account allowances. Such failures remain recorded against the selected account. Allowed selection reasons are explicit operator policy, workload ownership, capability, qualification, or a predeclared route.

Codex account setup and interactive login are documented in [Codex integration](models/CODEX-INTEGRATION.md). A profile binds provider execution and credential residency independently from workload locality; Codex CLI-home profiles execute where that home resides. Account-bound local child processes remove ambient OpenAI/Codex API-key variables before invoking the selected CLI-home identity. Public APIs and evidence contain only opaque ID, safe label, locality IDs, plan authority, qualification metadata, CLI version, executable hash and discovery timestamp—never email, OAuth/access/refresh tokens, cookies, raw process output, executable paths, credential paths, or `CODEX_HOME` contents. See [credential residency](credential-residency.md).

## Qualification

Run the focused tests with:

```bash
node --import tsx --test --test-concurrency=1 src/control/token-aware-baton-routing.test.ts src/control/direct-repository-review-executor.test.ts src/control/codex-node-execution.test.ts src/control/codex-exec-provider.test.ts src/control/account-profile-qualification.test.ts src/control/model-registry.test.ts src/control/openai-compatible-provider.test.ts src/control/web-server.test.ts
```

The full project check remains the release gate. It must include installed optional ACP and browser dependencies before its TypeScript phase can pass.

## Physical qualification

Agent Control 3.7 physically qualified this production path on 2026-09-03 across two distinct live local provider/model routes. A qualification-only threshold policy exercised the unchanged governor without an artificial high-token spend. The source observed 186 tokens, sealed a SHA-256-addressed baton, the destination continued with 510 tokens, independent verification passed, and the Work Parcel reconciled to 696 tokens. A second run refused the destination before invocation and proved that the original source thread resumed and completed with no invented destination usage.

The dashboard's `/api/token-routing` projection and SSE events reconciled with the durable evidence. The local providers exposed exact response usage but not authoritative retained-context occupancy, so the one-turn context values are marked estimated. Aggregate monetary cost remains unavailable when any leg lacks configured pricing. See the [physical qualification](evidence/agent-control-3.7-physical-qualification-20260902.md) and [machine-readable record](evidence/agent-control-3.7-physical-lifecycle-20260903.json).

The isolated post-3.9 Crew/WOPR integration candidate separately qualifies the new quality trigger through the normal parameterized repository-review lifecycle. Local Qwen returned complete schema-valid output but missed four objective acceptance-level root-cause criteria at approximately 4.3% estimated one-turn context. Agent Control explicitly recorded `QUALITY_GATE`, sealed the unresolved work, changed provider/model to Codex/Controller Account A/Luna, and the destination passed the same gate. Independent verification reconciled both model legs; neither missing current Codex context nor unavailable monetary cost was coerced to zero. See the [human-readable model-change transcript](provenance/EXTERNAL-EVIDENCE.md) and [candidate qualification report](provenance/EXTERNAL-EVIDENCE.md). This evidence does not merge, tag, release or deploy the candidate.

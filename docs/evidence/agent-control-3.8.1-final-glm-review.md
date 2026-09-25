# Agent Control 3.8.1 — Post-Fix Independent Whole-Repository Review

Reviewer basis: the supplied immutable snapshot (branch `feature/3.8.1-credential-residency`, commit `967181fd547f43a50cb26da566c6118ef7824364`, 606 tracked files) plus its deterministic test suite. This is a source-level review. I did not execute, deploy, mutate, or probe anything; the physical qualification narratives in `docs/evidence/` are treated as recorded claims that I verified against the code paths they cite, not as evidence I reproduced.

---

## Re-evaluation of the two previously reported High defects

### High 1 — Repository-review retry thread identity: **root cause fixed, no boundary weakening**

Root cause (as described): one logical Run retained across retries, but the token-thread key omitted the attempt, so the retry's Work Parcel collided with the failed attempt's thread identity (`token_thread_identity_changed`), and failed-attempt provenance crossed parcels.

Verified fix, at four independent layers:

1. **Durable, monotonic attempt identity.** `ParameterizedJobEngine.execute` (`src/control/parameterized-job-engine.ts`) increments `run.executionSequence` and persists it via `ParameterizedRunStore.update` *before* the executor is invoked, so the sequence survives controller restart. `recoverInterruptedRuns()` requeues non-terminal runs without resetting the sequence; `src/control/parameterized-jobs.test.ts` ("interrupted frozen runs resume one identity and monotonic execution sequence") proves a persisted sequence of 3 resumes as attempt 4. `ParameterizedRunStore.update` refuses mutation of immutable (terminal) runs, so the sequence cannot be rewritten after the fact.
2. **Attempt-scoped thread keys.** `DirectRepositoryReviewExecutor.invokeChunk` (`src/control/direct-repository-review-executor.ts`) defaults `threadId` to `review:<run>:attempt-<executionAttempt>:<chunk>`. The composed-path regression (`direct-repository-review-executor.test.ts`) proves attempt-1 and attempt-2 threads are distinct, keep distinct parcel provenance, and that `retryHistory` retains the original provider error.
3. **Failed-attempt durability.** The executor's failure path finalises the failed parcel (`finishParcel(..., 'FAILED', ...)`) and attaches `workParcelIds`/`evidence`/`providerResponseIds`/partial usage to the thrown error; the engine merges these into the same logical Run before retrying. Nothing is suppressed or rebound.
4. **No identity relaxation.** `TokenAwareBatonRuntime.observe` (`src/control/token-aware-baton-routing.ts`) still throws `token_thread_identity_changed` on any provider/account/model/locality change within a thread; the recovery invocation deliberately uses a fresh `:recovery` thread rather than rebinding. Route sealing is unchanged: `token_handoff_route_identity_changed`, `provider_route_identity_mismatch`, and `routeConfiguration`'s account/execution-node match all remain fail-closed. `assertLocalities` (`src/control/codex-node-execution.ts`) still enforces Codex CLI-home execution/credential co-location.

Verdict: the fix is at the true integration seam, is restart-safe, and strengthens rather than weakens thread/account/credential/baton boundaries.

### High 2 — Spark untracked-file scope containment: **root cause fixed, boundaries intact**

Verified fix:

- The new reusable primitive `inspectGitMutationSurface` (`src/control/git-mutation-surface.ts`) uses NUL-delimited `git status --porcelain=v1 -z --untracked-files=all --ignored=no` plus a complete `git diff HEAD` (binary + `-z --numstat`), correctly parsing rename source/destination pairs, staged additions, deletions, and unusual filenames (`git-mutation-surface.test.ts` covers spaces, brackets, embedded newlines via staged files). Untracked files contribute content hashes and line counts without index mutation; symlinks and binary content are forced to an effectively unbounded line count, guaranteeing escalation.
- `CodexFastExecutionRunner` (`src/control/fast-execution.ts`) now reports `touchedFiles`/`changedLines` from that surface, and `FastExecutionCoordinator.scopeViolation` rejects `unapproved-file-touched` **before** the independent verifier is invoked (the real-runner regression proves the verifier is never called when containment trips). Order of containment → verification → escalation matches the documented contract.
- Nothing else moved: Spark remains default-disabled (`DEFAULTS.enabled: false`), one attempt, zero subagents (`features.multi_agent=false`), disposable initially-clean worktree, exact-model availability probe with API-key stripping, and visible STANDARD escalation.

Residual, explicitly deferred by the repository itself (see Medium finding below): Git-ignored paths and `.git`-internal writes remain outside the mutation surface. That is a bounded, documented policy decision, not a regression introduced by this fix.

---

## Medium-findings reassessment from the prior review

| Prior finding | Status | Evidence |
|---|---|---|
| Contract-verdict integrity | **Fixed** | Run status is derived from `validateRepositoryReview`'s verdict in `parameterized-job-engine.execute`; `DirectRepositoryReviewExecutor.recordVerification` → `verifyGovernedContract` propagates that same verdict onto the surviving governed contract (destination on success, source on recovery). Terminal contracts cannot be resurrected (`verification.state` guard before submit/verify). |
| Unavailable-cost budgets | **Fixed** | Dual fail-closed enforcement: `requireWithinBudget` throws `job_cost_budget_unenforceable` when neither provider-reported nor calculated cost is complete (`direct-repository-review-executor.ts`), and the engine re-checks `response.usage.cost === undefined` against `maxCost`. Effective cost is the conservative max of available measures. Regression present (`parameterized-jobs.test.ts`). |
| Durable state permissions | **Fixed for files; Low residual** | `state.ts`, `telemetry.ts`, contract/handoff/parcel/ledger/configuration/qualification stores, ACP bindings, Spark ledger all write mode 0600; `state-v2.test.ts` asserts 0600. Residual: directories are created with umask defaults (Low finding below). |
| Account-profile executability | **Fixed** | `config/agent-control.example.json` is validated by regression (`config.test.ts`, "canonical example configuration validates as shipped"); the account-bound Spark model's `nodes: ["controller"]` matches the profiles' `providerExecutionNodeId: "controller"`; 3.8→3.8.1 migration normalisation is tested in `credential-residency.test.ts`. |
| Telemetry basis | **Sound** | Codex exec JSONL, the Codex node port, and the OpenAI-compatible client mark current context `estimated` (`ephemeral_single_turn_usage_estimate`) or `unavailable` and never derive it from lifetime totals; `mergeContext` refuses authoritative claims without values; the governor records `CONTINUE / current_context_unavailable` rather than inventing pressure. |
| Verification completeness | **Honestly open** | `verification.universal-adapter-coverage` remains PARTIAL in `config/implementation-status.json` with an accurate limitation — this is correct reporting, not a defect. |

---

## Whole-repository sweep — what I checked and found sound

- **Web authority boundary** (`src/control/web-server.ts`): every POST passes `validateMutationRequest`; bearer comparison is hashed/timing-safe; origin and content-type enforced; unknown domain errors collapse to `internal_error`; redaction key allowlist covers token-accounting fields without leaking reference values beyond the documented configuration surface.
- **ACP v1 adapter** (`acp-adapter.ts`, `acp-runtime.ts`, `acp-remote.ts`): pre-registered actor admission, cwd-absolute/session-identity checks, delivery-ID replay fail-closed on hash mismatch, secret-shaped prompt content rejected via `rejectProtectedValue`, remote transport constant-time bearer + origin + TLS-gated non-loopback + 1 MiB body bound.
- **Windows runners** (`scripts/codex-node-windows.ps1`, `scripts/repository-snapshot-windows.ps1`): fixed-purpose scripts, encoded payload line separate from audited source, operand revalidation, supervised native processes with node-local stream files and kill-on-timeout, sanitized failure classification; controller-side `ResourceCodexNodeExecutionPort`/`ResourceRepositoryResolver` validate schema, node identity, hashes, and reject symlink escape on extraction.
- **Model registry & qualification**: exact provider/model/node/account identity in routes, account qualification store refuses cross-node records, `credentialConfigured` for remote residency requires node-matching QUALIFIED/DEGRADED evidence, provider/model/route changes hot-reload while resources remain restart-required.
- **Retrieval governor**: search-only zg (`--refresh off`), post-ranking scope enforcement, whole-file source-hash freshness, symlink-after-capture rejection, persisted packet integrity hashes verified on load.
- **Scheduler/JobRuntime**: transition-driven waits without ledger churn, fail-closed restart recovery (`execution_identity_unproven_after_restart`), protected-workload revalidation immediately before maintenance execution, bounded timeouts with process-group termination.
- **ToolPolicy / HarnessDispatcher**: live lease/ownership/worker/approval re-checks per invocation, turn-budget enforcement with invocation retention on error, agent actions cannot self-attest or disable the independent check.
- **Governed handoffs/contracts**: AUTO confined to authority/budget; approval cannot manufacture withheld authority (child allocation above parent budget throws even post-approval); verification independence enforced.

**No new Critical or High defect was found.** The findings below are Medium and below.

---

## What I would delete or simplify

1. **`assets/dashboard/dashboard-enhancements.js` (76 KB monolith).** It is the single largest operator-surface maintenance risk: one file owns token routing, retrieval, parcels, systems, configuration, run controls, and liveness rendering. Split into modules mirroring the existing per-view files (`dashboard-models.js`, `dashboard-sessions.js` pattern).
2. **The ~15 duplicated atomic-write helpers** (`writeJsonAtomic`/`atomic`/`writeAtomic`/`save` in `job-runtime.ts`, `contract-runtime.ts`, `handoff-runtime.ts`, `parameterized-job-registry.ts`, `configuration-store.ts`, `work-parcels.ts`, `token-aware-baton-routing.ts`, ledgers, `state.ts`). One shared `src/control/fs.ts` with fixed 0600-file/0700-dir semantics would eliminate the directory-permission inconsistency class entirely (see findings).
3. **`ControlPlane.handoff/clone` lane-level surface** (`src/control-plane.ts`) — these concepts are now strictly better owned by contracts and `GovernedHandoffRuntime`. Keep for compatibility, but stop advertising them as a primary path.
4. **Dual routing scorers.** `routing.chooseRoute` (lane presentation) and `EconomicRouter` (recipe routing) overlap conceptually. Either consolidate or document the lane-level scorer as presentation-only in code, not just in docs.
5. **`docs/` duplication.** ARCHITECTURE.md, README.md, and `docs/token-aware-baton-routing.md`/`docs/credential-residency.md` repeat large passages. Generated summaries from the implementation-status registry would remove a whole drift class that `check:status` currently has to police manually for code claims only.
6. **Legacy attribution shims** (`legacyAttribution`, `legacyAudit`) once field data confirms no pre-3.4 state remains in supported deployments.

## CURRENT

- Both previously reported High root causes are fixed at source with focused deterministic regressions; the composed retry path and the real-runner Spark containment path are both exercised through their production seams. The physical proof records cited for them (`retry-run-EVMquh`, `scope-proof`) are host-local and not re-runnable from this snapshot (Informational finding below).
- Contract acceptance now derives from the actual validation verdict; governed contracts cannot be flipped after terminal states.
- Configured cost ceilings fail closed when cost cannot be measured, in both the executor and the engine.
- Foundational durable state (workspace, events, telemetry, checkpoints, all versioned stores) is written owner-only (0600), with a test asserting it.
- The canonical example configuration validates against the production validator, including account-bound locality.
- Telemetry authority labelling (authoritative/estimated/unavailable) is consistent across Codex, Codex-node, and OpenAI-compatible clients, and the governor never treats lifetime totals as occupancy.
- Verification coverage beyond the above remains honestly declared PARTIAL in `config/implementation-status.json`.
- Post-fix regression posture in-repo: 711 deterministic tests reported green in the qualification narrative; the snapshot's own test files corroborate the focused coverage claims I traced by hand.

## PROPOSED

1. **Close the Spark ignored-surface blind spot (Medium).** Extend `inspectGitMutationSurface` with a second observation over `--ignored=matching` taken against a pre-attempt baseline; treat any newly appearing ignored entry as `unapproved-file-touched` unless an explicit per-job ignored allowlist names it. Keep `.git` excluded but assert gitdir metadata identity. This converts a documented deferral into an executable control without changing Spark's default-disabled posture.
2. **Verify the extracted remote tree on restore (Low).** Persist a per-file manifest hash at freeze time in `ResolvedRepository` and re-verify in `restoreFrozenRepository`; or re-extract from the retained archive during restore. Today only the archive file hash is checked post-extraction.
3. **Tighten the handoff "cheaper route" rule (Low).** When the current route's cost is known, require the candidate's cost to be known and lower, or emit a distinct `cost_unknown` reason, so decisions stay truthful to the documented policy.
4. **Make account profiles CLI-only in configuration (Low).** Reject `accountProfiles` on non-`cli` providers in `validateConfig`; today such a configuration produces routes that always die at `provider_route_identity_mismatch`.
5. **Close the small concurrency window on `executionSequence` (Low).** Re-read the run after persisting the sequence (or guard per-run, not per-saved-job) so `concurrency: 'allow'` cannot double-execute a QUEUED run.
6. **Harden directory creation (Low).** Funnel all state-directory creation through one helper with mode 0700; add `chmod`-on-append to `RunLedger.record` mirroring `state.ts`.

## Quick wins

- Add `validateConfig` rejection of account profiles on non-CLI providers (one regex-level guard + one test).
- Add the extracted-tree manifest to `remote-immutable-archive` snapshots and check it in `restoreFrozenRepository`.
- `chmodSync(0o600)` after `appendFileSync` in `RunLedger.record`.
- Create `.agent-control/` and store subdirectories with mode 0700 in the shared writer; add a permission assertion to `state-v2.test.ts`.
- Distinct `cost_unknown` reason string in `TokenAwareBatonRuntime.assess`.
- Split `dashboard-enhancements.js` into per-view modules (pure refactor, no behaviour change; `check:dashboard` already enumerates files).
- Add a `parsePorcelainV1Z` test for copy (`C`) status pairs, which the parser already handles but no test pins.

## Structural improvements

- **One durable-state writer.** A single `fs` module owning atomic replace, file mode 0600, and directory mode 0700, adopted by every store. This removes an entire defect class (permission drift) and shrinks each store by dozens of lines.
- **One invocation-identity contract.** Route↔invocation identity is currently re-implemented per client shape (Codex node port, compatible client, Responses client, fake factories). Define a `ProviderInvocationIdentity` result type that every client must populate (providerId, accountProfileId|null, modelId, nodeId), and let `invokeChunk`'s check become type-driven. This is what makes finding #4 structurally impossible.
- **Per-attempt usage ledger on runs.** Replace the overwritten `run.usage` with an append-only per-attempt list (accepted attempt flagged) so retry accounting is self-describing without parcel archaeology.
- **Extract review-context assembly.** `prepareChunk`/baton prompt rendering/rehydration in `direct-repository-review-executor.ts` is the most security-adjacent string assembly in the repo; a dedicated, unit-testable module would let the injection-labelling and hash bookkeeping be pinned independently of provider plumbing.
- **Mechanical single-writer enforcement.** A lock file in the state directory (checked at startup) would convert the documented "one authoritative process per state directory" convention into a fail-closed invariant.
- **Commit release-gate machine evidence.** The decisive High-fix proofs live at host-local `/opt/qualification/...` paths; commit sanitized JSON beside the tag so the gate is auditable from the repository alone.

## Experimental ideas

- **Unified mutation-surface primitive everywhere.** The new `git-mutation-surface.ts` is a better scope oracle than the harness mutation verifier's diff-only accounting; feed it into `harness-mutation-verifier` so mutation benchmarks and Spark share one scope semantics, including observable ignored-surface deltas.
- **Provider-declared context occupancy with authority negotiation.** Extend the telemetry authority model so an adapter can *prove* occupancy provenance (e.g., signed provider field vs adapter recomputation), upgrading today's conservative `estimated` label without trusting adapters.
- **Prompt-injection canaries in frozen review chunks.** Embed deterministic marker tokens in the compiled context and validate at validation time that no finding's evidence cites a canary as if it were reviewer instruction — an executable, cheap tripwire for the review path.
- **Merkleised repository snapshots.** Version the frozen-snapshot format with a per-file merkle root so `restoreFrozenRepository` can verify selectively, and so delta reviews can prove which files changed between baselines without re-hashing everything.
- **Spark for read-only review summarisation.** Once cost telemetry exists for the fast class, a read-only, artifact-only Spark variant (no mutation surface needed) would give the containment machinery a second, cheaper consumer and more physical samples per release gate.

---

## Verdict

**No Critical or High defects remain in the supplied snapshot.** Both previously reported High root causes — repository-review retry thread identity and Spark untracked-file scope containment — are genuinely fixed at their production seams, with restart-durable identity, containment before verification, and no weakening of thread, account, credential-residency, baton, provider/model, or verification boundaries. The five reassessed Medium areas (contract-verdict integrity, unavailable-cost budgets, durable state permissions, account-profile executability, telemetry basis) are remediated or honestly documented; verification completeness remains correctly declared PARTIAL. Remaining findings are one Medium (the repository's own deferred ignored-path blind spot) and a set of Low/Informational hardening items. The release-candidate posture is appropriate; the only gate gap I would add is committing the sanitized machine evidence for the two High-fix physical proofs so the release decision is fully auditable from the repository itself.

```json
{
  "findings": [
    {
      "severity": "Medium",
      "title": "Spark mutation containment is blind to Git-ignored and .git-internal writes",
      "evidence": "src/control/git-mutation-surface.ts uses `git status --porcelain=v1 -z --untracked-files=all --ignored=no`; files created under ignored paths during an attempt contribute neither touchedFiles, changedLines, nor the mutation sha256 consumed by scopeViolation in src/control/fast-execution.ts. The repository itself defers this in docs/evidence/agent-control-3.8.1-qualification.md ('ignored-file and .git mutation-surface observation remains a bounded deferred hardening item'). Mitigations already in place: Spark default-disabled, one attempt, disposable worktree, independent verification.",
      "recommendation": "Capture an ignored-surface delta (e.g., --ignored=matching against a pre-attempt baseline) and treat new ignored entries as unapproved-file-touched unless an explicit per-job allowlist names them; keep .git excluded but assert gitdir metadata identity."
    },
    {
      "severity": "Low",
      "title": "Remote-immutable-archive restore verifies only the archive file hash",
      "evidence": "src/control/parameterized-job-engine.ts restoreFrozenRepository() checks bundleSha256 against bundlePath and that snapshotPath is a directory, but never re-verifies the extracted tree; the extraction-time chmod 0400/0500 applied in src/control/resource-repository-resolver.ts is the only integrity control afterwards.",
      "recommendation": "Persist a per-file manifest hash of the extracted tree at freeze time and re-verify on restore, or re-extract from the retained archive during restore."
    },
    {
      "severity": "Low",
      "title": "Unknown-cost handoff candidates satisfy the 'cheaper route' gate",
      "evidence": "src/control/token-aware-baton-routing.ts assess(): eligibility accepts `candidate.estimatedCost === null` even when the current route's cost is known, and records reason 'context_handoff_threshold_and_bounded_work_on_qualified_lower_cost_route' although lower cost was not established.",
      "recommendation": "When current cost is known, require the candidate cost to be known and lower, or emit a distinct cost_unknown reason so decisions match the documented 'lower-cost target where price information exists' policy."
    },
    {
      "severity": "Low",
      "title": "Account profiles on non-CLI providers create routes that always fail the invocation identity gate",
      "evidence": "src/control/config.ts does not restrict accountProfiles to providers of kind 'cli'; OpenAICompatibleProviderClient results carry neither accountProfileId nor nodeId, so DirectRepositoryReviewExecutor.invokeChunk() throws provider_route_identity_mismatch for any account-bound model on such a provider. Fail-closed, but the invalid configuration is accepted at validation time.",
      "recommendation": "Reject accountProfiles on non-'cli' providers in validateConfig, or make the compatible client echo the sealed route's account identity so the fail-closed check is satisfiable by design."
    },
    {
      "severity": "Low",
      "title": "executionSequence has a small TOCTOU window under concurrency 'allow'",
      "evidence": "src/control/parameterized-job-engine.ts execute() reads run.status before the RESOLVING transition is persisted; two concurrent execute() calls on the same QUEUED run (reachable only with saved.concurrency === 'allow') can both pass the QUEUED check before either persists RESOLVING, double-incrementing execution and interleaving parcels.",
      "recommendation": "Re-read and re-check status immediately after persisting executionSequence, or guard per-run (not per-saved-job) using the active map."
    },
    {
      "severity": "Low",
      "title": "State directories are created with default permissions while files are 0600",
      "evidence": "src/state.ts ensureDir() and most mkdirSync(recursive) call sites (contract-runtime, handoff-runtime, model-registry stores, work-parcels, ledgers, configuration store) create directories with umask defaults (typically 0755); file contents are consistently 0600 (asserted by src/control/state-v2.test.ts).",
      "recommendation": "Create the Agent Control state root and all store subdirectories with mode 0700 through a single shared durable-state writer."
    },
    {
      "severity": "Low",
      "title": "RunLedger event journal does not re-assert 0600 on append",
      "evidence": "src/control/job-runtime.ts RunLedger.record() uses appendFileSync with mode applied only at file creation; src/state.ts appendEvent() chmods on every write. A journal created by an older release keeps inherited permissions indefinitely.",
      "recommendation": "Mirror the state.ts chmod-on-append behaviour in RunLedger.record()."
    },
    {
      "severity": "Informational",
      "title": "Run-level usage reflects only the accepted attempt",
      "evidence": "src/control/parameterized-job-engine.ts overwrites run.usage with the successful response's usage; failed-attempt usage survives only in the failed attempt's Work Parcel (parcel-level accounting is additive, as documented in docs/token-aware-baton-routing.md).",
      "recommendation": "Either document run.usage as accepted-attempt usage or persist a per-attempt usage list so retry accounting is self-describing in the run record."
    },
    {
      "severity": "Informational",
      "title": "Large-context review completeness gate is heuristic and spoofable",
      "evidence": "src/control/operator-review-actions.ts isCompleteLargeContextReview() requires length, six section titles, and a refusal pattern scanned only within the first 2,000 characters; a substantively empty response that repeats the headings passes. It is consumed as a completeness signal by operator.large-context.verify before human reading.",
      "recommendation": "Keep the gate as a completeness signal only; add minimum per-section content checks and scan the full response text for refusal language."
    },
    {
      "severity": "Informational",
      "title": "Physical proofs for both High fixes are host-local rather than committed evidence",
      "evidence": "docs/evidence/agent-control-3.8.1-qualification.md cites /opt/qualification/agent-control-3.8.1-high-remediation/retry-run-EVMquh/retry-proof.json and scope-proof.json; the sanitized machine records are not present in the tracked tree.",
      "recommendation": "Commit sanitized copies of the two machine records beside the release tag so the release gate's decisive evidence is auditable from the repository alone."
    }
  ]
}
```

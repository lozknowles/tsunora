# Attempt-bound current-state cleanup verification

Base: a49abbfd359e38378f9a6182c685bee7a35a7700.

The helper abort operation selects `<attemptId>.result.json` and returns its originalServiceRestored field immediately. This is historical restoration only. TargetLlamaRuntime.recover wraps abort with an independent owned process scope; retained cleanup callbacks then consume restored as current proof. Existing receipts contain producer, runtime PID/start identity where launched, and original service configuration, but older receipts do not retain the invocation-helper process identity or boot identity. Original service health is a non-inference /health GET and identity is exact configured argv.

Add a read-only verify-cleanup target operation. It requires controller-selected run/step/target and attempt identity; distinguishes historical receipt/hash from freshly observed process identity, runtime presence, original-service identity/health and observation timestamp. Persist helper/boot/attempt identity for future invocations. Missing legacy helper identity remains UNKNOWN; do not manufacture it. PID reuse must not be mistaken for the old process. No inference, admission, memory query or service mutation is allowed in verification.

Recovery must never confirm from a saved receipt alone: verify current state after abort/restoration. Add an authenticated existing-run cleanup-verification operation backed by a registered product adapter. Select unresolved retained cleanup registrations from the last controller attempt, verify every one, retain each observation, and append a cleanup resolution only if every bound condition is positively confirmed and controller ownership is fenced. Preserve original step attempts, artifacts and scores. Idempotent confirmed verification does not repeat restoration. Uncertain verification appends observations only.

Old Smol may remain unqualified if its receipts cannot prove helper termination. This is an evidence limitation, not permission to infer absence. Same-run inference remains blocked for ambiguous failed/cancelled slots even after cleanup; recovered responses never become scored results.

No deploy/release or operational workload. Use only the isolated qualification controller for the one authorised recovery verification after tests. Reusable workflows require current attempt-bound proof, not historical restoration receipts.

## Implementation map

- `assets/runtime/llama-invocation.py`: receipt selection and restoration history; fresh helper/runtime PID plus process-start identity and boot evidence; exact expected service arguments and live `/health`; unknown legacy ownership fails closed. No telemetry/admission or inference in verify-cleanup.
- `TargetLlamaRuntime.execute`: existing target/transport adapter, independent bounded owned process for read-only verification, retained request/response evidence.
- `runtime-benchmark.ts`: derives exact unresolved target attempt registrations from the authoritative run's latest controller attempt; rejects foreign run/step/target/environment bindings; requires a fresh nonce and observation time for each.
- `JobRuntime.verifyCleanup`: authentic operator initiated, no active run controller or cleanup owner, checks unchanged execution contract and no human writer; appends resolution before clearing retained locks/worker ownership. Original StepAttempt records and benchmark results remain untouched. Unproven results retain CLEANUP_UNCERTAIN via an append-only event.
- Existing authenticated web mutation gate exposes `POST /api/runs/:id/verify-cleanup`; clients cannot supply target identity or proof.

## Boundaries

A negative probe is not cleanup proof. Process-inspection permission errors remain unknown. A healthy original service alone does not establish that the cancelled/failed helper relinquished ownership. Current verification is point-in-time, not a guarantee against later target changes. Target ownership evidence is absence of the exact helper and its exact launched runtime, combined with controller execution-contract fencing and retained lock release; this does not invent a separate remote lease protocol. Missing legacy ownership evidence prevents reconciliation.

The existing failed or cancelled execution keeps its terminal classification on positive cleanup; no result is promoted to success. The original historical uncertainty remains in retained artifacts/events. This change does not decide benchmark workload readiness, resolve an ambiguous benchmark slot, or change the 4,639,358,336-byte Smol requirement.

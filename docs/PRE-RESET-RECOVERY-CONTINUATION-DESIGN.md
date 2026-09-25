# Governed continuation of pre-disruption recovery failures

Base source: 7b2dcb5369ed0e496f031287fed9f37dede0d77f. No physical reset is authorised by this implementation/qualification parcel.

## Existing lifecycle and persisted evidence

TargetReset used a per-target current receipt, per-request hashed receipt and per-operation append-only JSONL journal. Authority bound actor, reason, request key, expiry and optional run. A failed current receipt quarantines normal execution. The previous lifecycle was: authorised -> observe/validate pre-reset identity/environment -> PRE_RESET -> expiry check -> port.reboot -> RESET_ACKNOWLEDGED -> disappearance/reconnect -> changed boot and same identity -> service restoration -> protected-state check -> COMPLETE; errors retain FAILED.

The disruptive call had no explicit pre-call persisted marker. Consequently absence of RESET_ACKNOWLEDGED alone cannot prove that no reset was issued. A transport loss may occur after dispatch and before acknowledgement.

## Exact legacy operation

Operation target-reset-6722043e-436d-48fa-bd6a-5a13eaeac7ee stopped at valid(pre). The per-request receipt contains an invalid pre observation (environmentVerified false), status FAILED and target_identity_or_environment_unverified. The matching journal has exactly RESET_AUTHORISED then RECOVERY_FAILED with that error, without PRE_RESET. The authorised event binds the receipt authority and configuration hash. The source's valid(pre) guard precedes PRE_RESET and reboot. This positive guard-rejection evidence establishes no disruptive dispatch, independently of today's boot UUID.

Legacy classification accepts only this generic recorded pre-validation rejection shape: immutable per-request/current receipt agreement; matching target/environment/config; expired authority; physical identity recorded; exact two-event sequence; matching authority/config/error; invalid retained pre observation; no post/disappearance. It is not keyed on Pixel, Android, a model, an environment bug or an installation ID. All other legacy shapes are UNKNOWN and refused. An absent acknowledgement alone is never sufficient.

## New disruption commit point

Receipts record NOT_REQUESTED, REQUESTED or ACKNOWLEDGED. Immediately before port.reboot, Agent Control synchronously persists REQUESTED in the current and per-request receipt, then appends DISRUPTION_REQUESTED, then invokes the port. Persisting REQUESTED is the conservative COMMIT POINT: from then onward disruption may have occurred even if the command never returns. Any failure at/after that marker requires stricter post-disruption reconciliation and cannot use this continuation path.

On command return, ACKNOWLEDGED is persisted and logged. Failed receipts and RECOVERY_FAILED events both carry the disruption phase. Missing/conflicting evidence refuses continuation. PENDING/uncertain states are never eligible.

## Preparation and chain identity

prepareContinuation accepts only a FAILED, positively pre-disruption parent with no executable old authority, matching target/configuration/run and recorded physical identity. A fresh bounded authority binds actor, target, parent, request identity, expiry, reason, explicit approvePreparation and allowedAction RESET_RECOVERY.

It creates a new PREPARED attempt, parentOperationId, chainId, next generation, parent physical identity and parent receipt/journal SHA-256 references. The parent journal and per-request receipt are untouched. The original per-target failed file is also left byte-for-byte unchanged; a separate continuation state file projects current chain ownership. Existing readers on the new source see PREPARED and remain quarantined. Preparation makes no target calls and does not touch benchmark state, locks or leases.

The preparation receipt has approveReset false. It authorises creation only, never physical dispatch. Same bound request replays the recorded preparation. Changed request binding is refused. A second distinct continuation cannot claim an active PREPARED chain.

A per-target exclusive filesystem lock serialises prepare/reset/execute across class instances and processes. Crash-left operation locks fail closed; this parcel adds no automatic stale-lock removal. The in-memory busy guard also prevents overlap. None of these locks are legacy benchmark resource locks.

## Future execution (not physically exercised in this parcel)

executeContinuation requires a separately supplied fresh approveReset authority, the prepared attempt ID, same operator/target/run and a new request identity. It rechecks parent evidence hashes. Expired old/preparation authority cannot dispatch. Preparation's immutable per-request receipt remains PREPARED; the new dispatch authority has its own request receipt.

The normal production recovery sequence is reused, not copied into a harness. Fresh observe must verify identity, Android/Termux components, boot identity and configured original service identity/health/expected state. Its physical identity must match the parent. Stale pre PASS is never reused. Only then may REQUESTED be persisted and the port called. Normal changed-boot, reconnect and service recovery criteria still govern success. Quarantine remains until COMPLETE. The separately authorised run-boundary reconciliation remains responsible for any future legacy lock release; neither preparation nor this task releases them.

## Interfaces

Authenticated POST /api/targets/:target/reset-continuations prepares. Authenticated POST /api/targets/:target/reset-continuations/:id/execute is the separate disruptive path. Existing JobRuntime active-work checks apply. Path target is authoritative, authenticated operator supplies actor. No endpoint creates a benchmark run or invokes admission.

Local operator preparation (OS/config/state-file authorization):

```sh
node --import tsx scripts/prepare-target-recovery-continuation.ts \
  /private/target-config.json /private/existing-target-recovery /private/preparation-authority.json
```

The target config may contain the existing target member. The command validates it and invokes the same TargetReset and configured production port as the API; it exposes no execution flag and never calls the port. Existing state must reside in the specified authoritative recovery directory. No target credentials are printed. No controller deployment/restart is necessary.

## Tests and boundaries

Synthetic tests cover legacy/new pre-disruption proof, unknown evidence, requested/acknowledged failures, immutable parent files, linked identity, invalid/expired/wrong-target authority, old authority non-reactivation, fresh prechecks, wrong identity, unhealthy service, concurrency across instances, idempotency, retained quarantine and preparation-only zero port calls. A synthetic complete recovery and failing dispatch verify the write-ahead boundary. Benchmark preservation markers and ownership remain untouched; real qualification independently hashes the actual retained run artifacts and locks.

Physical target resets, benchmark inference, fixtures, scoring and restoration are not performed here. The existing 24 valid Smol executions, quality 6/24 and original CLEANUP_UNCERTAIN/UNPROVEN evidence are preserved. The prepared continuation requires a future explicit physical-execution authority and fresh verification.

# Agent Control 4.11 promotion, rollback and limitations qualification

## Executive result

**AGENT CONTROL v4.11 CANDIDATE: RELEASE READY**

The governed prompt intervention can move the retained Qwen candidate from `AWAITING_PROMOTION_APPROVAL` through exact proposal approval, operational application, independent observation, a verified applied-effect receipt and `PROMOTED`. The durable state and effect survived disposable-controller reconstruction. Governed rollback restored the exact sealed previous state, independently verified it, created a rollback receipt and reached `ROLLED_BACK`.

Qualified implementation source: `796bc70a06e5088837116c00ab2e11ef21149150`. The final candidate adds only this report and its sanitized evidence projection to that tested implementation. No merge, tag, release or deployment occurred.

## Starting points and integration

- Model Improvement candidate: `efca0cc9013118e2ecab760db7832b2fff68c56f` (implementation `32a96b7c5b3b945c54d9d6ef4a3c082472a11fbb`).
- Limitations audit: `e1f0e425d1b304950c2d68aa47f2c01f7c474676`, integrated as candidate commit `1716ead51`.
- Reconciliation: clean; historical release reports and all 59 stable IDs were retained. No historical limitation was automatically closed.

## Intervention architecture

`PromotionProposal -> PromotionApproval -> InterventionAdapter.prepare/apply/observe -> AppliedEffectReceipt -> PROMOTED`. Rollback follows `RollbackProposal -> governed approval evidence -> rollback/observe -> RollbackReceipt -> ROLLED_BACK`. The generic contract names future intervention kinds, but only the allow-listed file-backed `PROMPT` adapter is implemented and physically qualified. The adapter accepts a fixed store and target allowlist from trusted configuration; proposals cannot supply arbitrary write paths.

Preparation verifies the sealed proposal and approval, exact candidate, current-state hash, allow-listed target, configuration reference, protected state and quarantine fence. Drift or quarantine produces `APPLY_NOT_STARTED`. Apply failure, uncertain state and failed observation are distinct and cannot produce a receipt. Restart rejects `PROMOTED` or `ROLLED_BACK` records without valid receipts.

## Physical sequence

- Existing experiment: `experiment-4f5648c9-7bf6-42f6-a148-5ac9933714dd`.
- Immutable prior baseline: **0/2**, output `ALPHA7`.
- Independently validated candidate: **2/2**, output `ALPHA|7`.
- Sealed proposal: `637e5d42058354634c0ca60accee58e91f1785039706731404daa5959d30ebf7`.
- Approval: **APPROVED**, bound to proposal `637e5d42058354634c0ca60accee58e91f1785039706731404daa5959d30ebf7` and candidate `47dbfa7e6953e7ad57008b5c2e8f115cc68e4c1780d1a4da64d73ec579e9383d`.
- Applied-effect receipt: `efa9b978e6afa3a4e1eb4debd8f4c3d79579f7958a400182bafbfaa0e141fb5e` (`VERIFIED`).
- Post-promotion frozen workload: **2/2**; outputs `ALPHA|7`, `ALPHA|7`.
- Restart persistence: **PASS**; durable lifecycle, receipt, exact route state and candidate binding all survived reconstruction.
- Rollback receipt: `324b7601ac668ecb52fe0355c9808af7508b5155e78acdef6f05144c14e7fd53` (`VERIFIED`).
- Post-rollback observational workload: **0/2**; outputs `ALPHA7`, `ALPHA7`. Exact restoration is independently established by state hash `af18e3fdabc6bbb64917e08586decd02828b6477b7fc3c24ab485d9dbb54f5b4`.

A preliminary evidence pass was retained separately and failed because it compared volatile raw health-response bytes. The final check retains those hashes as observations but compares stable protected identity: PID, command hash, port, responding state and model identity. This corrected an evidence check, not the intervention result.

## Protected services

Before and after, all three protected model services retained the same PIDs, ports, command hashes, model identities and responding state. Recorded GPU allocations were also unchanged. The qualification changed only the disposable prompt-route state above the immutable Qwen model service. It did not restart or modify a checkpoint or protected route.

## Work Board and containment

New experiments create 12 dependency-bound items covering baseline, candidate, benchmark, security, regression, proposal/approval, apply, verify, post-benchmark, receipt, rollback and restoration. Promotion and rollback occupy the serial intervention lane and require their respective approvals. The worker remains inside its execution scope and existing Work Board resource requirements. The adapter checks quarantine during preparation; tests prove stale state and quarantine prevent any write. Existing kill, ownership and scheduler fencing remain authoritative.

## Limitations ledger

The carry-forward gate accounts for all **59** inherited records and **3** append-only v4.11 records (**62 total**). It rejects silent deletion, uncontrolled status, historical wording/provenance mutation, and closure without adequate evidence. Accepted and external limitations remain visible without becoming automatic release blockers.

- `AC-LIM-0060` — only PROMPT application is physically qualified (`NEEDS_REQUALIFICATION`).
- `AC-LIM-0061` — generic canary allocation is `NOT_IMPLEMENTED` (`ACCEPTED_LIMITATION`).
- `AC-LIM-0062` — production routes beyond the disposable qualification route need target-specific proof (`NEEDS_REQUALIFICATION`).

Provider monetary cost, attributable experiment energy, tariff/sensor evidence and break-even remain unavailable under their existing IDs and classifications. No historic ID was closed or partially reclassified.

## Validation

- Focused model-improvement, API/dashboard and ledger tests: **20 passed, 0 failed, 0 skipped**.
- Complete candidate check: **1,899 passed, 0 failed, 0 skipped** in **308,019.724 ms**.
- TypeScript, JS/shell syntax, dashboard syntax, distribution, neutrality, implementation status, ledger integrity, containment, Work Board and security coverage: **PASS**.
- Virgin package installation: **PASS**, `agent-control 4.11.0-candidate.1`.
- Public v4.10.0 source to candidate upgrade: **PASS**. Configuration, Work Board, retained history, containment, usage, and model/provider configuration hashes were preserved. Model Improvement is additive and empty for v4.10; the inherited v4.11 awaiting-candidate migration is covered by focused and physical qualification.
- Candidate archive SHA-256: `ccda6d44fa05f1feae17abd28a3a47939ddad7233517198997b09846421927ea`.
- Raw physical evidence SHA-256: `b730b3f4b83919b61b7ff67775b6eac167c7290ccfe1c46c5832ec3713466355`.
- Install/upgrade receipt SHA-256: `9b73e4bcd012d588dfb9042243761b13000eed5f36920538f1c2fb60450c6504`.

## Remaining boundaries

PROMPT is the only physically qualified intervention kind. Canary routing is not implemented. Arbitrary production-route promotion is not qualified. Monetary cost, attributable energy and break-even remain unavailable when their authoritative inputs are unavailable. These are explicit ledger entries or retained historical boundaries; none invalidates the demonstrated release core.

## Release recommendation

**RELEASE READY.** Agent Control can now take this independently validated prompt improvement through a real governed effect to verified `PROMOTED`, survive restart, and restore the exact prior operational state through verified rollback. Publication remains a separate decision and was not performed.

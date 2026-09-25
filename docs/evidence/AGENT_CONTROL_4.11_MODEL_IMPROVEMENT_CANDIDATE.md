# Agent Control 4.11 Model Improvement Candidate

## Executive result

**Candidate result: PASS WITH LIMITATIONS. Release status: BLOCKED.**

This candidate adds a provider-, model-, runtime-, device-, and transport-neutral governed model-improvement lifecycle to the public v4.10.0 architecture. It creates no second orchestrator and grants no model authority over itself. Work Board remains the planning and scheduling surface; containment remains the execution boundary; model intelligence remains the historical measurement source; governed approval remains the only promotion boundary.

## Existing architecture reused

| Existing mechanism | 4.11 use |
| --- | --- |
| Model Intelligence frozen suites and append-only attempts | weakness and baseline evidence references |
| Work Board | lifecycle stages, dependencies, safe validation parallelism, resource waiting and operator control |
| Execution Scope Envelope | candidate-only write boundary and bounded resources |
| Containment/quarantine | stop uncertainty and unsafe-candidate exclusion |
| PEFT skill training port | optional adapter mechanism after lower ladder levels fail |
| Governed effects and authenticated dashboard mutations | exact-candidate promotion decision boundary |
| Provider/runtime registry | neutral model, runtime and node identities |

## Invariants

- Production baseline identities are content hashed and immutable.
- Every candidate is a separate content-hashed object tied to exactly one baseline.
- Benchmark, evaluator, governance, policy, and promotion paths are outside candidate write scope.
- Teacher models provide attributed evidence only.
- Sensitive training data cannot be accepted.
- Missing metrics remain unavailable.
- Security failure quarantines; protected regression rejects.
- Promotion requires an authenticated decision for the exact candidate hash.
- Historical model intelligence is referenced, never rewritten as improvement evidence.

## Lifecycle and restart

The durable lifecycle is `BASELINE → WEAKNESS_DETECTED → IMPROVEMENT_PROPOSED → EXPERIMENT_APPROVED → CANDIDATE_CREATING → CANDIDATE_CREATED → BENCHMARKING → SECURITY_VALIDATION → REGRESSION_VALIDATION → COMPARISON_READY → AWAITING_PROMOTION_APPROVAL → PROMOTED`, with honest `REJECTED`, `QUARANTINED`, and `INCONCLUSIVE` terminals. Restart reloads the durable state and revalidates baseline and candidate hashes before exposing it.

## Physical qualification

**PASS**, with the original overly strict service-health receipt retained and reconciled rather than rewritten.

- Source commit: `32a96b7c5b3b945c54d9d6ef4a3c082472a11fbb`
- Experiment: `experiment-4f5648c9-7bf6-42f6-a148-5ac9933714dd`
- Existing model: `qwen2.5-3b-instruct` (`626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d`)
- Intervention: `PROMPT`; no weights, runtime, service, benchmark, evaluator, policy, or route changed
- Frozen exact-match baseline: **0/2** (`ALPHA7`)
- Isolated candidate: **2/2** (`ALPHA|7`)
- Lifecycle boundary: `AWAITING_PROMOTION_APPROVAL`
- Promotion applied: **NO**
- Protected services: process identities unchanged; all three expected model identities remained HTTP healthy
- Monetary and energy break-even: **UNAVAILABLE**; the local route exposes no authoritative per-call billing or experiment energy meter

The first runner receipt reported `FAIL` because it compared raw `/v1/models` body hashes. Those bodies include mutable runtime metadata and are not service-identity invariants. That receipt remains immutable at SHA-256 `ded0ad02f57f7b53ccd4fa3422ddc01fd251684d1fab10b094db7bb6a21c4c20`. A separate reconciliation verified the unchanged process command hashes, successful endpoint status, and expected model identity without another model call. The sanitized receipt is [model-improvement-physical-qualification.json](../provenance/EXTERNAL-EVIDENCE.md).

## Verification

- Focused lifecycle/API/dashboard tests: **9 passed, 0 failed, 0 skipped**.
- Complete suite: **1,888 passed, 0 failed, 0 skipped** in **307,757 ms**, up from the v4.10.0 baseline of 1,879 tests.
- TypeScript, distribution, bootstrap/shell syntax, dashboard syntax, infrastructure neutrality, and implementation-status checks: **PASS**.
- Virgin clone/bootstrap: **PASS**; configuration created and `agent-control 4.11.0-candidate.1` reported.
- v4.10.0 (`6102d4889`) in-place source upgrade: **PASS**; configuration and representative retained history remained byte-identical, initialization reported `UNCHANGED_EMPTY`, and all focused 4.11 tests passed after upgrade.
- Qualification platform: Linux 6.8.0-139-generic x86_64, Node.js 24.21.0, npm 11.19.0.

## Qualification boundary

The candidate is physically qualified through independent comparison and `AWAITING_PROMOTION_APPROVAL`. The generic approval record binds the exact candidate and intended route references, but it does not itself apply an intervention-specific production routing or configuration effect. Therefore `PROMOTED` and rollback are tested lifecycle records, not physically demonstrated route mutation/restoration. Release remains blocked until the relevant governed route/configuration adapter commits the exact approved candidate and returns an applied-effect receipt; the runtime must enter `PROMOTED` only after that receipt. Canary routing is likewise not implemented because the current routing architecture has no honest generic allocation mechanism.

## Release boundary

This is an isolated development candidate. It is not merged, tagged, published, released, or deployed.

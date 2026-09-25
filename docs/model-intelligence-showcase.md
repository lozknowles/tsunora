# Model Intelligence showcase candidate (4.6, unreleased)

This candidate adds versioned model observations, bounded Model Watch policies, personal benchmark evidence and a dashboard entry point. The package is marked 4.6.0-rc.1; this is an untagged, unreleased candidate. This is not a declaration of complete 4.6 physical qualification.

## User flow

1. Describe a small workload, or use the Python repair example. The dashboard can create an exact-answer benchmark without requiring knowledge of control internals.
2. Select approved metadata sources, a discovered machine, the benchmark, schedule and explicit limits. Review the generated policy. Natural language produces a proposal only.
3. Approve the exact policy digest. Default watches collect intelligence and prepare plans; automatic benchmarking is disabled.
4. Review the shortlist, missing evidence and native Work Parcel. No installed target models may still mean PROVISIONABLE when the execution controls, artifact identity and estate are admitted.
5. A separately approved execution can collect objective results and independent validator evidence. League views retain raw measurements, formulas, missing metrics and historical revisions. Recommendations never change routing.

## Implementation and limits

| Area | Candidate implementation | Remaining qualification or integration |
|---|---|---|
| Intelligence | Generic source interface; normalized JSON, Hugging Face metadata and GitHub release adapters; origin-locked metadata; hash-linked history; conflict rejection; failed/partial source handling | Additional vendor/community feeds require adapters and source approval. Baseline ingestion is not an overnight-duration test. |
| Readiness | Explicit provenance, licence, hash/size, context, memory, architecture, runtime, qualified control, fresh estate and approved-machine checks | Reviewed resource estimates are labelled as estimates. They do not prove model task quality. Arbitrary new artifacts may require additional reviewed metadata. |
| Watches | Versioned approval, revocation, UTC daily/weekly/event due-key logic, persistent budget reservations, native six-phase parcels, interrupted-reservation reconciliation and cancellation port | No recurring production watch was activated. External event delivery is an integration port, not an enabled webhook. |
| Benchmarks | Versioned workloads, independent Python tests, exact text/schema execution through a local adapter; fixed settings and immutable evidence | API benchmark execution, generic runtime installation and subjective judge execution require qualified adapters. Unknown cost is not treated as free. |
| League | Complete native result rankings, incumbent comparisons, separate subjective evidence, historical results and opt-in allowlist export | No physical target-model results exist yet. Imported results cannot win a locally verified ranking. Cost/energy remain unavailable unless measured. |
| Native control | Work Parcels, jobs, POE draft hook, discovered estate, owned process activity and child parcel references | Physical model Process/Estate activity still requires approved model execution. Parent observation may report BENCHMARK_RUNNING; periodic reconciliation records completion later. |
| Rules/desired state | Typed check/condition/action/verify ports, exact event/resource checks, immutable approvals, failure escalation and no repeat of uncertain effects | Generic rules are a programmatic foundation; no full rules-builder UI or real household desired-state qualification is included. |
| Home Assistant | Optional API adapter with separate DISCOVER/OBSERVE/CONTROL/AUTOMATE permissions and scoped entities/services | No Home Assistant connection or household operation was performed. |
| Notifications/sharing | Explicit notification port and durable outbox, no retry of uncertain delivery; explicit privacy-safe result export and quarantined benchmark imports | No notification destination or community publication transport is configured. No messages were sent. |
| Retention | KEEP_ALL policy; routing is NEVER_AUTOMATIC | Top-N deletion/promotion remains a separate approval and is not implemented as an automatic effect. |

## Configuration

The existing `AGENT_CONTROL_LOCAL_BENCHMARK_CONFIG` enables the explicitly configured local execution adapter only after control qualification. `AGENT_CONTROL_MODEL_WATCH_CONFIG` supplies approved source definitions and optional natural-language draft defaults. Secrets must be supplied by credential callbacks, never source settings or journal records.

The server exposes authenticated Model Watch and personal benchmark endpoints through the existing operator authentication and mutation-origin checks. Merely opening the dashboard does not approve a policy. Source text is data, not an action registry or command.

The journal intentionally fails closed on corruption or a retained process lock; operators must investigate interrupted writes. Budget reservations are charged before dispatch and are not automatically refunded after uncertain failures. Multiple independently configured controller processes must not share one watch store as a distributed scheduler; cross-process reservation transactions are not qualified.

## Physical evidence boundary

The controlled source-observation and readiness demonstration uses the real source APIs and native jobs on an isolated workspace. It does not download model weights or execute target models. The two reviewed artifacts reach PROVISIONABLE and the proposed run reaches APPROVAL_REQUIRED. Zero league rows and no leader are correct outcomes at this boundary.

The local benchmark controller is separately checked with known-good, known-bad and malicious Python outputs inside the configured sandbox, plus owned cleanup. This validates the test harness, not a model. The completed failed MiniCPM5 qualification from earlier work remains independent immutable evidence.

## Provenance

Adapter research used official documentation:

- https://huggingface.co/docs/hub/api
- https://huggingface.co/docs/huggingface_hub/package_reference/hf_api
- https://docs.github.com/en/rest/releases
- https://developers.home-assistant.io/docs/api/rest/

The public Job Library keeps the original research traceability and the Dataiku guide's Process Automation, Worker Augmentation and Enterprise Intelligence taxonomy. No proprietary Dataiku agents or architecture are reproduced. Added jobs have small objectives; their fixtures validate contribution contracts and are explicitly not physical qualification evidence.

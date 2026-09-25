# Dynamic Work Board integration candidate qualification

## Result

**APPROVE WITH LIMITATIONS** for an isolated integration candidate. No merge, push, tag, release or deployment occurred.

## Architecture

The implementation extends the existing Agent Control planning and adapter abstractions. `WorkBoardRuntime` owns durable plan state; existing Jobs and Work Parcels own execution. `WorkBoardControlRuntime` maps a logical reorder to a physical checkpoint only when the selected capability adapter has qualified interrupt and resume semantics.

Omnigent-derived ideas were adapted as generic contracts: typed interaction profiles, declaration-versus-observation drift, hash-bound effect approvals, identifier-only W3C correlation and an experimental typed worker transport. No Omnigent code or runtime dependency was introduced.

## Containment

`ContainmentSupervisor` is scheduler-independent and invokes registered `OwnedExecution.terminateAll`, lease revocation and optional node isolation. It records the requested scope, affected ownership, shared resources preserved, cleanup reports, lease outcome, confirmation state, quarantine and recovery evidence. Execution-scope envelopes make allowed resources explicit and sealed.

## Automated evidence

- Work board behavior: persistence, optimistic concurrency, ordering, priority, dependencies, cycle rollback, approvals, resource conflicts, safe parallelism, interruption policy, supersession, run links and natural-language proposals.
- Interaction behavior: unknown defaults, per-trait drift, three distinct interruption profiles.
- Approval behavior: exact hash binding, replay/stale protection, restart persistence and uncertain commit.
- Worker transport: identity generation, replay rejection, lease revocation and stale result rejection.
- Containment: action scope enforcement, envelope integrity, job/lane/worker/node/estate scopes, shared-resource preservation, lease loss, uncertain termination, quarantine, recovery order, scheduler independence and durable restart.
- Web surface: authenticated reads, mutation authorization, board operations, containment preview and static dashboard assets.

The complete repository gate passed on 2026-09-19: **1,866 passed, 0 failed, 0 skipped** in 301.7 seconds. Type checking, bootstrap syntax, dashboard syntax, neutrality, implementation-status and source-distribution gates also passed.

## Visual evidence

Sanitized browser qualification was captured from the actual candidate dashboard with a real persisted `WorkBoardRuntime` record at desktop 1440×1000, mobile portrait 390×844 and mobile landscape 844×390. The images are retained outside normal source history at `/opt/work/agent-control-work-board-evidence-20260919` and copied to `PRIVATE_EVIDENCE_LOCATION`.

- `work-board-desktop.png` — SHA-256 `216a95fe6d9454d5dc03089bf3df6fd104cc6805aa5625a1f34cec9473beb204`
- `work-board-mobile-portrait.png` — SHA-256 `a6f28fe71bea16bbd07adc1797296030c07b33f116d3d93fd4ad3c7933a4ee07`
- `work-board-mobile-landscape.png` — SHA-256 `d1928519e43d79922c14a8903befb0db9164d9c5c12053fa7c57d9b17a308c51`

Visual review found the hierarchy readable without connector lines, controls touch-sized in portrait, the details/containment panel progressively stacked on portrait, and the persistent Mallow avatar retained. The responsive proof is browser emulation, not a physical-device claim.

## Qualification boundaries

- Browser structure and responsive CSS are implemented and syntax checked. A physical mobile device was not used for this parcel.
- The typed outbound transport is a qualified contract/state machine, not a deployed network listener.
- Real process-tree termination remains delegated to the already-existing `OwnedProcessManager`; this parcel tests supervisor integration with the owned-execution port and does not claim a new platform qualification.
- No operational worker, node, model or service was stopped.
- No production Agent Control instance was changed.

## Evidence model

The demonstration fixture in `docs/evidence/dynamic-work-board-example.json` is sanitized and explicitly synthetic architecture evidence. It is not physical execution evidence.

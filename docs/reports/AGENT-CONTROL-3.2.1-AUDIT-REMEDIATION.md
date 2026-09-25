# Agent Control 3.2.1 audit remediation

Reviewed baseline: `v3.2.0` at `beed6ee95453ef8505b4c14d224c53262e33a7b4`.

This work independently inspected the 3.2.0 implementation and used deterministic tests rather than another model review. The first focused pristine-baseline run recorded 10 failures among 52 tests after the new state-machine regressions were introduced; 42 existing tests still passed. Dashboard-specific pristine proof was run separately because 3.2.0 did not contain a Run-parameter form or its serializer.

| Finding | Verdict | Reproduced | Fix | Regression test |
| ------- | ------- | ---------- | --- | --------------- |
| AC-01 scheduler/control-plane error containment | CONFIRMED | A rejected due occurrence escaped `tickSchedules`; `startJobScheduler` discarded the rejected promise. A throwing managed-node observer had the same boundary defect. | Isolate each schedule occurrence, persist `lastError`/`lastFailureAt`, advance the occurrence, continue other schedules, and report unexpected scheduler/monitor failures through typed `failure` events. | Disabled and malformed scheduled operations advance safely; a later due schedule still launches; scheduler and managed-node observer boundaries remain callable. |
| AC-02 Work Queue verification dead end | CONFIRMED | `markExecutionComplete()` produced `verification-pending`, but no legal accept/reject transition existed. | Added evidence-bearing verifier decisions: ACCEPT completes; REJECT requires reason plus bounded retry, human-review or failed disposition. State persists before dependency reconciliation. | Acceptance persists and unblocks a dependant; each rejection disposition is explicit and retry respects the attempt ceiling. |
| AC-03 global resume destroys lane state | CONFIRMED | Resume assigned `idle` to every lane, including cancelled, error, explicitly paused and human-owned lanes. | Save pre-system-pause status once, restore it on resume, retain terminal changes made while paused, and force human-owned PTY lanes to remain paused. | Working, waiting, cancelled, error, paused and human-owned lanes are covered together. |
| AC-04 managed-node polling resets claims | CONFIRMED | A second probe replaced a capacity-one worker's `active: 1` with `active: 0`. | Added an observational registry merge that refreshes health/capabilities/labels while preserving runtime claim count. JavaScript's synchronous registry mutation keeps the merge and claim operations serialized. | Claim, poll, then resolve: active remains one and placement reports `capacity_exhausted`. |
| AC-05 waiting-run churn and false RUNNING | CONFIRMED | Resource/worker waits appended one event and rewrote the ledger per second (86,400/day); approval/dependency waits could do so twice per second (172,800/day). Runs were shown as RUNNING. | Added run-level `WAITING`; persist only status/reason/placement transitions; retry resource/worker availability without resetting the waiting state; keep restart fail-closed only for actual executing states. | Resource, worker and approval waits remain `WAITING`, add no events on identical ticks, and resume when their gate clears. |
| AC-06 ephemeral/unbounded teammate jobs | CONFIRMED | Each delegation added a sequence-named catalog job; the sequence reset and a fresh catalog could not retry the persisted run. | Use stable `teammate-<profile>-<phase>@1.0.0` jobs with conversation/delegation identity in typed parameters. Retry restores a missing catalog definition from the persisted effective job and validates its Action. | Twelve specialist delegations create one job; a recreated runtime retries the historical run and retains delegation identity. |
| AC-07 coordinator recursion/cycles | PARTIAL | Coordinator profiles could be selected as specialists, but the specialist executor never recursively invokes `coordinate()`, so no live recursive chain existed. | Added the minimum future-proof invariant: coordinator profiles fail closed before any specialist model work launches. | Coordinator-as-specialist assignment is rejected before executor invocation. |
| Dashboard numeric Run parameters | PARTIAL | Pristine 3.2.0 had no generic parameter form, so the exact claimed string serializer was not present; the dashboard instead submitted `{}` and could not operate parameterized Jobs. Input type errors were masked as `internal_error`. | Added a schema-driven form/serializer for integer, number, boolean and string values; `JobManifestError` returns HTTP 400 with safe parameter issues. | Browser-side serializer proves native types and integer rejection; web-server test proves typed persistence and safe wrong-type response. |
| Long-running invocation observability | CONFIRMED | Active runs had no live elapsed/activity display and invocation telemetry appeared only after provider reporting completed. | Added stage, provider/model, elapsed, last meaningful activity age, fresh/cached/output/reasoning/total tokens, cost and verification. A local one-second display timer updates elapsed/age without HTTP churn. Unknown provider telemetry is explicitly `Unavailable`. | Dashboard/server tests require the live fields and explicit unavailable wording; Run records expose transition-updated activity time. |

## Compatibility and remaining limits

- Existing Job, Schedule, lane and teammate snapshots remain structurally compatible; new fields are optional on read.
- Provider APIs that do not stream usage cannot supply incremental tokens or cost. The dashboard says `Unavailable` until an authoritative invocation observation exists.
- Stable teammate jobs are versioned per teammate profile so capability requirements remain enforced. A changed Action or capability definition fails closed rather than silently reinterpreting the existing version.
- Full ledger snapshots are still rewritten for real transitions. This release removes identical-wait churn but does not redesign persistence.

## Verification gates

- `npm run typecheck`
- `npm run check:bootstrap`
- `npm run check:dashboard`
- `npm run check:neutrality`
- `npm run check:status`
- `npm test`
- focused Work Queue/executor, Job runtime, managed-node, application-service/PTY, Persistent Teammates and web-server/browser regressions
- package dry run and clean-tree release checks before tagging

Final pre-release result: 405/405 repository tests passed, 3/3 infrastructure-neutrality tests passed, all 18 implementation-status entries passed, and TypeScript/bootstrap/dashboard checks passed. `npm pack --dry-run --json` produced the expected `agent-control@3.2.1` package plan with 342 files. The release commit and immutable release URL are recorded by the annotated tag and GitHub release.

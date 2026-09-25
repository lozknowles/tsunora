# Native same-run benchmark resume

Source: 3e4ccd6544c7fe08c85aa11ce2e4b00258148680. Isolated implementation; no release/deployment.

Existing mechanisms: JobRuntime scheduler/ownership/resource locks; mutable run projection with append-only event history; immutable checksum-verified ArtifactStore; subordinate StepAttempt records; frozen LabQualificationSpec and per-fixture lab-attempt/response/verdict artifacts; verifyLabContinuation; runtime-owned admission/provenance/restoration; Work Parcel context retained in run.trigger.

The current collector may be SUCCEEDED while qualification is BLOCKED. Generic retry creates a new run and cannot meet the requirement. Optional cross-run continuation changes spec identity and is not wired by native registration. Neither should be repurposed by caller-created evidence.

Small addition: an opt-in synchronous resume policy registered by the owning product action. Authenticated run resume validates fresh bounded operator authority, request idempotency, immutable checkpoint integrity and cleanup before requeueing the same step. Existing completed StepAttempts and all artifacts remain; a resume checkpoint records the previous projection. No broad new status enum or second scheduler. An additive resume record marks the latest generation and authority; run identity is independent of authority lifetime.

Cursor: iterate frozen case IDs and repetition slots, verify attempt/definition/response/verdict/native-receipt references and checksums. Reuse only completed SUCCEEDED executions, regardless of true/false quality. Retain BLOCKED executionStarted=false records without counting them complete. Reject ambiguous failed execution, duplicate completions, missing/mismatched evidence, suite/profile drift and unconfirmed cleanup. No last-number heuristic. No revalidation of old outputs.

Normal action re-entry verifies the checkpoint again, performs fresh compatibility/admission and then per-invocation admission. Failure appends refusal and executes no fixture. Successful new invocation identities include resume generation under the same run so historical refusal IDs cannot collide. Aggregate stored old scores and new scores; preserve old summaries as artifacts. Full completion makes resume a no-op. Same request key is idempotent, concurrent request cannot reset running work.

Authority renewal is a new authenticated, bounded grant scoped to the existing run/spec, not an edit to expired private configuration. It cannot change target/model/suite/resources or service-suspension permissions. Existing runtime safety/approvals still execute; previous approval projection is not reused. Work Parcel context stays bound to the same run. Browser/API/CLI share the existing run surface; no special Pixel or model branch.

Physical qualification only after focused tests: use the existing isolated qualification controller and original ledger with exclusive ownership, not a second live writer or copied evidence. Codex only submits/supervises product operation. No direct Pixel probes, inference, lifecycle, scoring or restoration. If admission refuses, stop. No code is installed on operational nodes.

Native same-run continuation is a prerequisite for robust reusable recipes. This parcel does not implement recipes or claim general recovery from uncertain side effects.

## Operator interface

Use the existing configured authenticated CLI connection:

```
agent-control benchmark resume-plan RUN-ID
agent-control benchmark resume RUN-ID --request-key UNIQUE-REQUEST-ID --expires-at ISO-TIMESTAMP
agent-control benchmark status RUN-ID
```

The expiry must be in the future and no more than four hours away. The existing authenticated mutation API is POST /api/runs/RUN-ID/resume with requestKey and expiresAt. GET on the same resource is a read-only integrity/cursor assessment, not admission. Repeating the request key returns the prior request state; another request while work is active cannot requeue it. Final completion is a no-op. Reauthorization changes neither target binding nor frozen suite; original service-suspension constraints still apply.

The endpoint records the authenticated actor, not a supplied actor string. Re-entry preserves the original trigger/Work Parcel and creates a new execution contract/step attempt. Required step approvals are reevaluated. A checkpoint retains the prior step projection and completion timestamp; prior attempts and artifacts are untouched. Fresh refusal retains a compatibility/admission artifact and an interrupted summary with the reused completion count; no synthetic model call is inserted.

Conservative recovery limit: ambiguous started-but-uncommitted inference, failed execution or unconfirmed cleanup cannot be automatically replayed. This avoids duplicate effects. The first implementation handles evidenced successful slots plus unstarted refusals and safely pre-execution authority failure; it does not claim general crash recovery from unknown execution state.

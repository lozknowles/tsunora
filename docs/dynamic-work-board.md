# Dynamic Work Board and hierarchical containment

The Dynamic Work Board is Agent Control's durable planning projection. It records planned work, order, priority, lanes, dependencies, blockers, required capabilities, approvals, assignments, acceptance criteria, interruption policy, linked Job Runs and evidence. It does not execute work. Jobs, Work Parcels, workers and their adapters remain the execution authorities.

## Data and control boundaries

- `agent-control.work-board/v1` is versioned and persisted atomically. Every mutation supplies the expected board version; stale writes fail.
- Manual order and priority are separate. Reordering does not silently increase priority.
- The scheduler selects only work whose dependencies, approvals, resource requirements and writable/exclusive scopes are compatible.
- Active reprioritisation uses the adapter's versioned Harness Interaction Profile. Declared traits are replaced by qualified observations per trait. Unknown means unknown.
- A worker with observed interrupt plus durable resume can checkpoint and pause. A non-interruptible worker continues to the next safe boundary. Unknown semantics cause no physical interruption.
- Natural-language changes produce an explicit proposal first. Ambiguous or destructive requests require clarification.

## Interaction profiles and drift

Capability adapters may carry `agent-control.harness-interaction-profile/v1`. It describes integration mode, elicitation, resume, cancellation, interrupt, streaming, steering, live queue, authentication ownership, history transfer and instruction delivery. Missing profiles project all traits as `UNKNOWN`.

Probe observations record expected and observed values, drift, probe version, time and evidence. Scheduling/control decisions consume observed values. Drift in one trait does not erase unrelated qualified traits.

## Approvals

Multi-effect changes use a sealed proposal hash. An approval binds the exact effects, actor, decision ID, expiry and evidence. Replay and stale hashes are rejected. A failed commit is retained as `COMMIT_STATE_UNCERTAIN`; it is never reported as safely rolled back without evidence.

## STOP / KILL and execution scope

Every dispatch can carry an `agent-control.execution-scope-envelope/v1` declaring filesystem, writable paths, network destinations and ports, devices, runtimes, credential references, tools, APIs, models, subprocesses, elapsed time and resource/external-effect limits. The envelope is sealed. Undeclared actions are blocked or contained deterministically.

Kill scopes are hierarchical: job, lane, worker, model, node, workspace and estate. The containment supervisor is below and independent of the scheduler and model. It operates on registered owned processes, lease revokers and node isolators. Narrow stops preserve shared infrastructure unless an estate emergency stop explicitly includes it.

The dashboard always previews affected and preserved owners before a kill request. Outcomes distinguish `STOP_REQUESTED`, `STOP_CONFIRMED`, and unconfirmed termination. Uncertain cleanup, lost lease revocation or failed isolation quarantines the owner. Return to service requires the evidenced sequence `KILLED → QUARANTINED → INSPECTED → RESET → REQUALIFIED → AVAILABLE`.

### Quarantine scheduling fence

Work Board reconciliation consumes the same persisted containment records used by the kill supervisor. A compatible resource whose stable worker or node scope has an effective quarantine record is excluded before availability, health, priority or route preference is considered. Reconnects and new session generations do not change the durable worker/node identity and therefore cannot bypass the fence. When no eligible alternative remains, the item is `BLOCKED` with `QUALIFIED WORKER QUARANTINED — NOT ELIGIBLE FOR SCHEDULING`; lower-priority independent work may still proceed.

Only the governed recovery sequence ending in `AVAILABLE` removes the fence. Health recovery, process restart, controller restart and lease acquisition do not. Scheduler decisions retain excluded resource identities and the containment reason, and the dashboard renders that exclusion. Existing active work remains controlled by the containment record; terminal killed or cancelled items are outside the reconciliation candidate set and cannot be resurrected.

## Typed outbound worker transport

The experimental transport contract accepts typed hello, lease, status, result, cancel, heartbeat and capability frames. It binds authenticated worker identity, session generation, sequence, rate/size limits and expiring leases. It is not a shell, filesystem channel, HTTP tunnel or arbitrary payload transport. Revoked, expired or previous-generation results are rejected.

## Trace correlation

Optional W3C trace correlation contains identifiers and status only. Prompt, response, environment, credential and tool payload content is excluded. Exporter failure is observable and never grants execution authority or blocks the core execution path.

## Operator workflow

1. Open **Work Board**.
2. Filter by lane or state and inspect planned work.
3. Use **Change the plan** to generate a reviewable proposal; apply it only after checking the classified effects.
4. Inspect the item for dependencies, active runs and evidence.
5. For urgent containment, select the smallest scope and enter a reason. Review the effect preview before requesting the stop.

The authenticated API exposes `GET/POST /api/work-boards`, item operations, proposal and reconcile endpoints, plus `/api/containment/preview` and `/api/containment/kill`.

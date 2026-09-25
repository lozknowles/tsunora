# Governed handoff outcomes

Agent Control 3.6 development records every worker transition as `agent-control.handoff/v1`. The parent contract—not the process—continues to own task identity, completion criteria, authority, protected resources, budget, history and verification.

## Outcomes

| Outcome | Exact transition |
| --- | --- |
| `SACRIFICE` | Cancels the current process, closes and unowns its PTY, and pauses the unchanged parent contract because further work is not justified. It does not claim completion. |
| `SUBSTITUTE` | Cancels the current process and installs a new actor/agent/model/provider/runtime/node, process, PTY and next-generation sealed baton on the same parent contract. Objective and history remain unchanged. |
| `DELEGATE` | Creates a child contract linked to the parent. Authority is the requested subset of parent authority; excess authority is withheld. Token/cost budget is debited from the parent and assigned to the child. Attachments and protected-resource policy remain governed. |
| `YIELD` | Pauses the current process when the adapter supports pause, revokes PTY write ownership and pauses the contract without a completion claim. |
| `COMPLETE` | Submits evidence and moves the parent contract to independent verification. It produces `VERIFYING`, never immediate `VERIFIED`. |

## AUTO and MANUAL policy

`AUTO` executes only within existing authority, resource envelope and available budget. A handoff waits for the contract operator when any of these applies:

- the request names authority the parent does not hold;
- costly escalation;
- production writes;
- destructive action;
- expanded resource envelope;
- token or cost budget expansion;
- explicit `MANUAL` policy.

Operator approval does not manufacture missing authority: unavailable capabilities remain in `authorityWithheld`. A child allocation above the parent's known budget still fails closed even after approval; the parent contract must be amended through its own governed policy first.

## Evidence record

Each durable handoff records:

- originating actor and agent;
- receiving actor and agent where applicable;
- parent and child contract IDs;
- reason and exact outcome;
- baton SHA-256 and byte size;
- authority transferred and withheld;
- token/cost/currency transferred where known;
- contract state before and after;
- evidence IDs and verification outcome;
- approval reasons, approver, timestamps and any bounded failure.

A governor recommendation, baton-preparation state or sealed-baton record is not an executed handoff. Dispatch and destination continuation must be represented by the governed handoff and destination execution records; only their successful durable outcome supports a completed-handoff claim. Approval-pending and failed outcomes remain visibly incomplete.

Credential-like material is rejected before persistence. The complete request is retained for deterministic recovery, but no secret references are resolved into values.

## Recovery

Handoff and contract snapshots are separate atomic mode-`0600` records. On restart, parent/child links, budget debits, process replacement, baton generation and verification state remain reconstructable. Operating-system process adapters are still responsible for proving the observed process identity before resuming it.

## Bounded context views in 3.9

A Work Parcel handoff now consumes a `agent-control.work-parcel-baton/v2` projection. The durable Parcel context ledger remains the historical source of truth; the baton contains concise active state, unresolved work, criteria, selected recent/retrieved event references, artifact IDs, exact next action, route and size/hash metadata. Creating another baton never overwrites the event history.

The receiver can use governed retrieval to recover an omitted decision or failed approach by content-hashed event identity. That retrieval is audited and does not grant new filesystem, node, provider, account or tool authority. Source and destination execution still pass the existing contract/handoff admission and route-identity checks.

Non-blocking questions are dependency state, not handoff outcomes. An unanswered question pauses only named stages; independent branches and their batons may continue. A `COMPLETE` outcome still enters independent criterion verification and cannot make a Parcel successful merely because a model claims completion.

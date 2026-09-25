# Contract-owned execution and PTY control

Agent Control 3.6 development makes the execution ownership chain explicit:

`Lane → Contract → Baton → Process/PTY → Agent`

The contract owns objective, completion criteria, authority, protected resources, remaining budget, attachments, permissions, pending actions, verification and evidence. The selected agent/model/provider/runtime and the operating-system process are replaceable execution details. A worker exit or `COMPLETE` claim is only a submission to independent verification.

## Durable record

`ContractExecutionRuntime` stores `agent-control.contract-executions/v1` atomically with mode `0600`. Each record contains:

- parent/lane identity, immutable objective and completion criteria;
- active actor, agent, model, provider, runtime and node;
- a canonical sealed baton payload, generation, byte size and SHA-256;
- process identity, PID when known, observed state and heartbeat time;
- PTY identity, participants, one write owner and ownership generation;
- ordered terminal output with a monotonic sequence;
- attachments, capability/filesystem/network/production permissions;
- pending control/approval/cancel actions and handoff references;
- verification state, evidence and a transition history;
- deadline, token and monetary budget values when known.

Credential-like values are rejected from the contract and baton. Monetary values are absent rather than zero when unavailable.

## Attach, detach and consultation

Attaching with `observe` is read-only. `consult` is an explicit read-only operation and never changes write ownership. Detaching removes the participant but does not terminate the process; when the writer detaches, the PTY becomes unowned and increments its ownership generation. Reconnect always returns as read-only, even if that actor held write control before disconnection.

A participant requests write control through a durable pending action. Only the current writer or contract operator may approve transfer. Exactly one participant is then marked `write`; all others become observers.

The 4.0 execution-session adapter projects these rules as `WATCH`, `INTERVENE` and `TAKE_CONTROL`. Process capability does not imply policy permission: protected-resource Actions are explicitly `WATCH_ONLY`, and an adapter that advertises input, signals, resize or takeover for that scope is rejected. See [governed Live Shell](live-shell.md).

## Human takeover and resumption

Human takeover is unconditional. It transfers write ownership to a `human:*` actor, increments the ownership generation and pauses the contract. Every agent becomes read-only. Agent execution resumes only when the current human owner deliberately returns control to an attached agent; this increments the generation again, so retained stale writers remain fenced.

## Process failure and recovery

Process observations are independent from PTY attachment. A detached process may continue running. A running process whose observation exceeds the configured stale interval becomes `ORPHANED`; the PTY becomes `LOST`, write ownership is revoked and no completion is invented.

Cancellation enters `CANCELLING`, records a durable pending action, calls the process cancellation port and finishes as `CANCELLED`. Deadline enforcement uses the same port but ends as `TIMED_OUT`. These states remain distinct after restart. Terminal output rejects an unexpected sequence and persists the accepted ordering.

## Verification boundary

The active worker may submit evidence, moving the contract to `VERIFYING`. It cannot verify its own submission. An independent verifier records `PASSED`/`FAILED`; only a passed verification produces contract state `VERIFIED`.

## Current boundary

The durable authority/reconstruction model, governed handoff outcomes and redacted dashboard projection are implemented. `GET /api/runtime` and Sessions expose state, identities, participants, writer, approvals, baton hash/size, handoffs and verification without objective, baton payload or transcript content. Operating-system-specific PTY creation and signal delivery remain adapters beneath this record.

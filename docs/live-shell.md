# Governed Live Shell and execution-session attachment

Agent Control 4.0 can attach an operator to the real process or terminal already owned by a governed Run. It does not expose arbitrary shell or PowerShell execution and does not infer a process from terminal text. `ExecutionSessionRuntime` stores a durable, redacted `agent-control.execution-session/v1` identity linking the exact Run, Job, step, Action, worker/node, Work Parcel, Crew role and provider/model route.

## Modes and authority

- `WATCH` streams retained output from the proven session. It never accepts input, resize, signals or writer ownership.
- `INTERVENE` is available only when the process adapter exposes a genuine input/signal capability and the attaching actor has operator authority. One interactive attachment exists at a time. Human input content is withheld; only actor, byte count and sensitivity classification are durable.
- `TAKE_CONTROL` additionally requires a persistent adapter with autonomous-writer fencing and a linked execution contract. Agent Control transfers the contract PTY owner to the human and pauses autonomous authority. Return requires an explicit reconciliation summary/baton before the agent can write again.

An attachment mode is the intersection of actor authority, durable session policy and adapter capability. The UI cannot enable a mode the record does not permit.

## Protected-resource boundary

Actions with semantic governance run under `interactionPolicy: WATCH_ONLY`. The Job runtime sets this policy only after effects and protected-resource rules have been resolved and the safety supervisor has allowed dispatch. `OwnedProcessManager` then suppresses requested interactive stdin, signals and takeover capabilities and closes action stdin after any fixed payload. `ExecutionSessionRuntime` independently rejects an adapter that advertises intervention under a `WATCH_ONLY` scope.

Consequently, a protected Git Action may be watched, but Live Shell cannot edit its command, inject another refspec, signal it through an interactive attachment or take control to bypass the pre-dispatch decision. Cancellation remains the existing governed Run operation and external commit truth remains `EXTERNALLY_COMMITTED`, `CANCELLED_BEFORE_COMMIT`, `COMMIT_STATE_UNCERTAIN` or `FAILED` according to independent reconciliation.

## Process adapters and recovery

Local pipe and Linux util-linux PTY sessions, managed-node SSH streams and bounded Codex executions use the same session boundary. Adapter capabilities remain truthful: a pipe is not called a PTY, controller restart cannot recover a nonpersistent byte stream, and reconnectable sessions must prove session/incarnation/process identity before output or control resumes. A PID alone is insufficient.

Output is bounded and redacted before persistence. Runtime credential values are held only in memory for exact-value scrubbing. Durable session metadata rejects secret-shaped content; the dashboard receives safe output/events and never raw credential, CODEX_HOME, provider transport or hidden model-reasoning material.

## Dashboard operation

Open **Sessions**, select the linked Run session, and choose only an enabled mode. The panel shows execution identity, process state, terminal kind, capabilities, limitations, current control owner, attachments and retained output. SSE announces durable changes; reconnect refetches the canonical record. Browser state is never the source of ownership or process truth.

For protected Actions, confirm the panel says `WATCH_ONLY` and that INTERVENE/TAKE CONTROL are unavailable. For an eligible disposable interactive Action, intervention should create `attachment.opened`, `human.input` (content withheld), output and `attachment.closed` records. A takeover must additionally show `control.taken`, reconciliation and `control.returned`.

## Qualification boundary

Deterministic tests cover output isolation, read-only WATCH, exclusive intervention, secret redaction, signal/resize identity checks, takeover reconciliation, restart behavior, genuine Linux PTY input and protected-policy suppression. Physical 4.0 qualification must still show a real disposable Run attachment and harmless intervention where the selected Action supports it; a WATCH-only protected Action is not falsely represented as intervention-capable.

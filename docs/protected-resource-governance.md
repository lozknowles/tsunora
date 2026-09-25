# Protected-resource mutation governance

Agent Control can turn a Work Parcel constraint such as `origin/master must remain completely unchanged` into a durable read-only resource policy. The constraint is enforced in the normal Job lifecycle before an Action handler or subprocess starts.

The production flow is:

`model/action proposal → typed Action normalization → semantic effect resolution → resource capability policy → RuntimeSafetySupervisor → allow/deny/approval → execution → external-operation reconciliation`

This is not a command-string blacklist. The `repository.git-governed@1.0.0` Action accepts a bounded proposal, removes shell wrappers and chains into individual argv operations, resolves Git push refspecs to resources such as `git-ref:origin/master`, and executes accepted operations directly with `shell: false`. Unsupported shell constructs, implicit or ambiguous push destinations, unsupported executables and unresolved effects fail closed. Mutating the protected ref name through an unqualified remote alias, path or URL is conservatively denied because the alternate name may resolve to the protected repository.

## Using the governed Git Job

The registered `governed-git-operation@1.0.0` Job requires a repository path and a proposal. A Work Parcel should carry the protected-ref constraint in its immutable objective or constraints. Example resolved parameters:

```json
{
  "repositoryPath": "/srv/repositories/project",
  "proposal": "git push origin HEAD:feature/operator-maintenance"
}
```

The repository must be within `jobs.repositoryRoots`, and a worker must expose `repository.git`. Naming the Job in natural-language task entry selects the registered Job; a reasoning planner may also select it and provide the typed parameters. The dashboard and API remain clients of the same runtime path.

For model-planned maintenance, `governed-git-model-operation@1.0.0` runs three production Actions: `repository.git-propose@1.0.0` obtains a strict structured proposal through the existing adaptive/provider path, `repository.git-governed@1.0.0` resolves and governs its effects, and `repository.git-protected-ref.verify@1.0.0` independently checks the remote state. The proposal artifact seals provider, account profile, model, node and qualification identity. The model cannot invoke a shell and cannot bypass the governed Action.

## Semantic Git effects

The resolver distinguishes local reads/writes from remote `CREATE`, `UPDATE`, `FORCE_UPDATE`, `DELETE` and `REWRITE` effects. It recognizes explicit destination refspecs, including `HEAD:master`, `branch:master`, leading `+`, `--force`, `--delete`, empty-source deletion, `--mirror`, bounded `sh -c` wrappers, command chains and `git -C`. An implicit push target is rejected because its destination cannot be proven before execution.

Read-only operations and pushes to an unprotected feature ref remain eligible for normal scope and approval policy. Any resolved write-like effect intersecting a read-only resource policy is `DENY`, even when an agent describes the operation as harmless. Provider-native policy may add evidence but cannot override this result.

## Durable operation truth

Each consequential external effect receives an `agent-control.external-operation/v1` record on its Run step:

- `PROPOSED`
- `AUTHORISED`
- `EXECUTING`
- `EXTERNALLY_COMMITTED`
- `CANCELLED_BEFORE_COMMIT`
- `COMMIT_STATE_UNCERTAIN`
- `FAILED`

A denied operation remains `PROPOSED` with the safety decision and reason; it is never presented as executed. A successful push is `EXTERNALLY_COMMITTED`. Interrupted or failed operations compare the target remote ref before and after when possible. If the external state cannot be proven, Agent Control records `COMMIT_STATE_UNCERTAIN` rather than guessing.

The safety ledger retains Run, Parcel/stage, actor, Crew role, safe provider/account/model/node identity where present, normalized effects, protected policy, decision, reason and timestamp. It excludes hidden reasoning and credential material. Run-ledger changes and `runtime.safety_changed` use the existing SSE path, so the dashboard refreshes without becoming an execution authority.

If the Action creates an execution session, its session scope is `WATCH_ONLY`. The real output may be observed through Live Shell, but requested interactive stdin, signals and takeover are removed before adapter creation and rejected again by the session runtime. Cancellation still uses the governed Run path. This prevents a human or terminal adapter from changing an already-resolved protected operation outside the safety boundary. See [governed Live Shell](live-shell.md).

## Qualification boundary

The physical qualification uses a disposable local repository and bare remote. A genuine Codex-backed Work Parcel naturally proposed and published only an isolated maintenance branch; it did not attempt the forbidden mutation. The same production boundary then denied direct, alternate-refspec, forced, mirrored, deleted, wrapped, chained, alternate-working-directory and remote-alias attempts while independently preserving the protected SHA. Allowed fetch, inspection, branch, local commit and feature-push neighbours completed normally. Restart recovered the same Run and safety evidence. Focused owned-execution coverage proves `CANCELLED_BEFORE_COMMIT`; the physical Git operations completed too quickly to force cancellation honestly.

See the [qualification report](evidence/agent-control-protected-resource-qualification.md), [complete immutable transcript](evidence/agent-control-protected-resource-transcript.md), [machine-readable evidence](evidence/agent-control-protected-resource-qualification.json), and [dashboard video manifest](evidence/agent-control-protected-resource-dashboard-video.json).

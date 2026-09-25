# Agent Control runtime safety and route containment

Agent Control 4.3 authorises effects, not persuasive text. Production Actions
must be explicitly read-only, declare consequential categories, or resolve typed
effects before dispatch. Unknown or inconsistent effects are denied and are not
approvable. Approval satisfies a pre-existing policy gate; it cannot create an
effect, widen a Work Parcel, override a protected-resource denial or bypass a
credential/node restriction.

## Filesystem rules

- Existing local roots and targets are resolved through the execution
  filesystem, including symlinks and native case semantics.
- A prospective output resolves its nearest existing parent before containment
  is decided.
- Traversal, sibling-prefix confusion, symlink escape and unresolved roots fail
  closed.
- A remote or foreign-platform path is not resolved lexically on the controller.
  A typed node adapter must enforce it on that node.
- Execution-time revalidation and the route's sandbox/capability envelope remain
  necessary. A single `realpath` check is not a race-elimination claim.

## Execution-route matrix

| Route | Directly authorised and observed | Enforcement and descendants | Unavailable enforcement behaviour | Qualification status for 4.3 candidate |
| --- | --- | --- | --- | --- |
| Typed model tools | Exact recipe grants and each ToolPolicy call | Live lease/ownership generation, capability and risk policy; tool descendants remain inside their typed handler | Tool call denied | Deterministic regression; fresh physical A–F pending |
| Fixed local Action process | Declared Action effect and fixed executable/argv | Owned process group/tree, bounded output, cancellation; handler-specific path checks | Action denied or cleanup remains uncertain/fenced | Deterministic regression; affected physical route pending |
| Governed Git | Parsed argv, semantic local/remote effects, protected refs and external operation state | Canonical cwd revalidation; hooks/fsmonitor disabled; no shell; terminal prompts disabled; owned process cleanup | Unsupported subcommand/form or unresolved cwd denied | Disposable bare-remote positive/negative tests; fresh physical gate pending |
| Managed remote node | Typed operation enum, selected node and approval | Existing managed-node transport uses fixed scripts/data channels and node-local checks | No arbitrary-shell fallback; operation fails closed | Existing historical node evidence; integrated-candidate physical recheck pending where used |
| Codex read-only CLI | Provider/account/model/node route, immutable prompt/context and final observed item types | Codex read-only sandbox, disabled known action surfaces, owned process lifecycle | Route rejected when required sandbox/capability is unavailable | Historical provider evidence; integrated-candidate A–F pending |
| Spark fast execution | One sealed baton, one attempt, explicit files/line budget | Codex workspace-write sandbox plus tracked, untracked and valuable ignored-state comparison; `node_modules` explicitly disposable | Escalates; no unrestricted retry | Deterministic positive/negative tests; not part of A–F unless selected |
| Browser Action | Declared external communication/credential use and fixed browser request schema | Browser adapter/context policy and owned lifecycle; page scripts are not represented as ToolPolicy calls | Requires approval or fails | Historical browser evidence; integrated dashboard recording pending |
| Live Shell | Attachment to an already owned, identified session; WATCH/INTERVENE/TAKE_CONTROL only | Adapter-advertised terminal/input/signal capability, stale-writer fencing, protected Actions forced WATCH_ONLY, takeover reconciliation | Attach/input/signal/takeover denied | Historical 4.0/4.1 evidence; regression retained |

Direct argv prevents shell interpretation but is not a universal process,
filesystem or network sandbox. Opaque CLI internal actions are not advertised as
individually moderated. Route admission therefore depends on a qualified adapter
capability envelope, explicit Action effects and independent verification.

## Worker identity and locality

Runtime safety receives a worker execution identity established by Agent Control,
not inferred from the worker's display name. The identity separates:

- `CONTROLLER_LOCAL` — an Agent Control-owned in-process worker or the explicit
  configured controller resource;
- `LOCAL_WORKER` — a configured local-transport worker;
- `REMOTE_WORKER` — a configured SSH, HTTP or other remote-transport worker;
- `UNKNOWN` — missing, inconsistent or untrusted provenance.

Agent Control's internal registration boundary and validated resource transport
are the only current identity authorities. Labels such as `local`, a worker named
`controller`, or a remote resource claiming controller metadata do not grant
locality. Remote workers add the `REMOTE_NODE` effect and remain subject to the
configured remote-node scope. Unknown or inconsistent identities add `UNKNOWN`
and are denied before the Action handler starts. The 4.5.1 upgrade remediation
uses this rule for the built-in read-only observation worker and projects the
same relationship into Environment Discovery and Estate Map.

## Cleanup and retained state

Mutable configuration, credentials and runtime evidence belong outside disposable
release checkouts. One controller owns a state directory. Cleanup may remove only
an execution-owned temporary root or an explicitly named disposable generated
root. Ignored files are otherwise retained and compared; unexpected changes are
reported as out-of-scope. Agent Control does not automatically commit, publish or
copy ignored data into evidence.

## Context and cache precedence

Retrieved repository content remains untrusted evidence and cannot grant Action,
tool, route or approval authority. Context/baton narrowing retains required
instructions, provenance and omission records. Repository, instruction, recipe,
route, session, cache scope and backend identity changes invalidate incompatible
warm evidence. Warm Expert score is considered only after capability, authority,
qualification, health and transport integrity; it never confers correctness.

Token records keep fresh input, provider cache reads, cache writes and output
separate when reported. Unknown values remain unavailable and no monetary saving
is inferred without authoritative billing data.

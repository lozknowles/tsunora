# Agent Control 3.1 dashboard boundary review

Date: 2026-08-24 (Europe/London)

Baseline commit: `ea02747aa059364460a0c416b301310c029369bc`

Verdict: **PARTIAL — the dashboard is integrated at the intended 3.1 control boundary; production workload qualification remains separate.**

## Authoritative boundary

```text
Web dashboard        TUI
      |                |
      +------ read projections / request commands ------+
                                                        |
                                            AgentControlService
                                                        |
                         +------------------------------+------------------+
                         |                 |             |                  |
                    lane policy        JobRuntime   verification       routing
                         |                 |
                  lease / PTY fence       +-- catalog / scheduler / ledger
                                           -- workers / locks / artifacts
                                                        |
                                              execution adapters
```

The browser has no scheduler, lease, PTY writer, ownership store or completion heuristic. It reads projections and sends authenticated requests to `AgentControlService`. The service calls the authoritative lane or Job runtime. Model/provider routing and worker capability placement remain distinct decisions.

## Continuation-brief mapping

| Requirement | 3.1 boundary | Status |
| --- | --- | --- |
| Jobs central, repository-managed catalog | Jobs is the default dashboard view; definitions remain read-only | SOURCE VERIFIED |
| Manual and scheduled invocation share one path | Both enter `JobRuntime.createRun` | EXPERIMENTALLY VERIFIED |
| Job detail | Enabled state, schedule times/policy, priority, concurrency, steps, worker, attempts, duration and verification | SOURCE VERIFIED |
| Safe operator controls | Run, schedule enable/disable, cancellation, whole-Run retry and named approval call authenticated service routes | EXPERIMENTALLY VERIFIED |
| Queue reasons | Priority, age, scheduled time, wait reason, eligible workers and missing capabilities come from `queueProjection` | SOURCE VERIFIED |
| Searchable Run history | Search covers ID, Job, status, trigger and selected worker; history remains ledger-backed | SOURCE VERIFIED |
| Live structured state | SSE refreshes typed Run/approval/schedule events; UI does not parse terminal output | EXPERIMENTALLY VERIFIED |
| Workers and resource contention | Worker health/capacity/capabilities and durable lock holder/time are visible | SOURCE VERIFIED |
| Artifacts and provenance | Collection endpoint exposes type/schema/size/SHA-256/retention/provenance while hiding managed storage paths | EXPERIMENTALLY VERIFIED |
| Approval fails closed | Only the exact policy of a currently waiting step can be approved; approval emits `job.run_approved` | EXPERIMENTALLY VERIFIED |
| Human takeover remains unconditional | Job routes expose no PTY write path and lane takeover tests remain green | EXPERIMENTALLY VERIFIED |
| One control plane | Web and TUI use the same service/runtime projection; no browser-owned scheduling state was introduced | EXPERIMENTALLY VERIFIED |
| Infrastructure neutrality | Job definitions use semantic capabilities/resources; neutrality gate remains 3/3 | EXPERIMENTALLY VERIFIED |

## Evidence

Isolated verification host: configured remote development host (the operator's SSH alias is deliberately not persisted in distributable source).

Disposable test root: `/tmp/agent-control-dashboard-boundary.z0rvvm`

Commands:

```text
npm install --ignore-scripts --no-package-lock --no-audit --no-fund
npm run check
npm run qualify:jobs
git diff --check              # run in the Windows Git worktree
```

Results:

- TypeScript: PASS.
- Bootstrap syntax: PASS.
- Dashboard JavaScript syntax: PASS.
- Infrastructure neutrality: 3/3 PASS.
- Serial test suite: 203/203 PASS, 0 failed, 0 skipped.
- Safe non-production Job qualification: `PASS_SAFE_NON_PRODUCTION`.
- Qualification Run: `run-8ce07b4e-496b-41d2-8424-0ca155ee8503`.
- Qualification evidence SHA-256: `8491a11b1ce3d51427316ef3f74afb5694d01b2da2275e85574d9d7faf9e4dc4`.
- Worktree whitespace/conflict check: PASS.

The first install attempt used `npm ci` and stopped before tests because the repository has no lockfile. The successful qualification used a disposable no-lock install with lifecycle scripts disabled; no package lock was created in the worktree.

One pre-final gate exposed that the first domain-error mapping revision redacted the established `operator_auth_not_configured` response. The authority check still denied the mutation, but the API compatibility assertion failed. The mapper was corrected to expose only deliberate HTTP/domain errors while retaining `internal_error` for unexpected failures; the complete 203/203 gate then passed.

## Security and authority findings

- Artifact collection redacts the managed storage reference. A browser receives identity, checksum and provenance, not a host path.
- Approval is now its own audit event rather than being mislabeled as Run creation.
- An empty, mismatched or no-longer-waiting approval policy does not change Run approvals.
- Operator mutations still require a configured bearer token and allowed origin. Observer reads grant no mutation authority.
- Context links accept only HTTP(S) targets in the renderer. External context remains non-authoritative.
- No Job endpoint can write to a PTY, mutate a lane lease, transfer ownership or interfere with human takeover.

## Not tested / remaining release work

- **NOT TESTED:** fresh visual browser acceptance of this expanded Jobs screen. The in-app browser rejected the localhost qualification URL under its URL policy; the restriction was not bypassed by exposing the service elsewhere. Asset delivery, syntax and API behavior are tested.
- **NOT TESTED:** authenticated Facebook discovery and LocalWalks production publishing. The reference workload remains fixture-driven and non-production.
- **NOT IMPLEMENTED:** safe selective step retry. The operator can retry an eligible historical Run only.
- **NOT IMPLEMENTED:** remote artifact transport. The local authoritative artifact contract is proven.
- **INFERRED:** the responsive layout should preserve the existing dashboard baseline, based on source/CSS inspection; a fresh rendered acceptance image is still required before `READY_FOR_3.1`.

No schedule was enabled, no production service was changed, no deployment occurred, and no Agent Control authority boundary was broadened during this review.

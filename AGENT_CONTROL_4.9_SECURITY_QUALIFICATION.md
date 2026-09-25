# Agent Control v4.9 security qualification

## Decision

The v4.9 implementation candidate passes the native security-audit, independent-verification, sandbox, regression, upgrade, dashboard, activity-log and distribution gates. Public release remains unapproved because publication requires a separate operator decision after this evidence is presented.

## Source and continuity

- Branch: `feature/security-audit-v4.9-20260917`
- Public starting revision: `b440d2c01c9cee17057a779298a421676c637be5` (`v4.8.1`)
- Original qualified implementation: `8c68b05d2181da3d6a482354ebfb408f9d8d2f86`
- Final tested implementation: `4ef42eb709b95fa9c63028bd9348f9e5addc8bd5`
- Original audit: `audit-1d773fa5-5046-4f5a-b297-f2decf3a383a`
- Original run: `run-59d69855-06b7-4c3e-8940-5997021ffed0`
- Continuation run: `run-54e2b0cf-a6e2-4564-9f1c-9af72eca3e71`

The existing audit was resumed. It was not replaced. Its original 104 unresolved findings remain in append-only `findingHistory`; the original `AGENT_CONTROL_NATIVE`, `STATIC_ONLY`, `EXECUTION_BLOCKED_BY_SANDBOX` provenance remains unchanged.

## Sandbox assurance

The generic `ExecutionSandboxAdapter` is implemented by the Linux-specific `linux-bubblewrap-systemd-v1` adapter. Bubblewrap supplies mount, PID, IPC, UTS and network namespaces. A transient user systemd service supplies cgroup CPU, memory, task-count and runtime limits. `prlimit` provides an additional process resource boundary. Agent Control owns process supervision, cancellation, redaction, evidence and cleanup.

Every required adversarial control passed with its own evidence digest:

| Control | Result |
|---|---|
| External network | PASS, denied |
| Loopback/protected local network | PASS, denied |
| Environment inheritance | PASS, allowlisted |
| Common credential locations | PASS, absent |
| Scratch write boundary | PASS |
| Audited source read-only | PASS |
| Descendant process containment | PASS |
| Timeout and descendant termination | PASS |
| Memory limit | PASS |
| CPU limit | PASS |
| Process-count limit | PASS |
| Symlink/path traversal | PASS |
| Files/process cleanup | PASS |

Qualification ID: `sandbox-5988f1eb-2293-49fb-ac54-00b33e2638ae`. Full digests are retained in `continuation-qualification.json` and `SANDBOX-ASSURANCE.md`.

## Findings and independence

- Records processed: 104/104
- Confirmed: 0
- Needs validation: 90
- Rejected: 77 total, including 14 newly rejected by the continuation
- Coverage: 12 partial units, 0 full units; schema and ledger validation passed
- Finder worker: original audit finder invocation records
- Verifier worker: `agent-control:security-verifier`
- Separate verifier invocations: 104/104
- Fresh source reconstruction: 104/104
- Independence assessment: `FULL` for 104/104

The 90 retained records are narrower application-specific unknowns. They were processed and explicitly bounded; none was promoted without evidence. No remediation was authorised or required because no candidate demonstrated a security-boundary failure and impact.

## Historical evidence

A filename and bounded content search of retained qualification evidence and the source repository found no authenticatable earlier security-review corpus. No historical claims were imported or reconstructed from narrative memory. This remains a documented limitation and does not alter the current audit.

## Dashboard diagnostics

- The unauthenticated API response is intentional and has a deterministic `401` test.
- Three inline style attributes that conflicted with the strict CSP were replaced by stylesheet classes; CSP was not weakened.
- A duplicate unauthenticated `EventSource` in the live-shell client was a product defect. It now reuses the authenticated dashboard event stream.
- The security-audit route passed in Chromium at 1440x1000 and 390x844. It shows the latest verifier, current counts, sandbox status, retained human-readable report and JSON links.
- The narrow browser harness reports 500/503 only for optional projections it deliberately does not configure. They are labelled `QUALIFICATION_HARNESS_UNCONFIGURED_PROJECTION` and do not affect the authenticated security-audit route.

## Qualification results

- Full suite: 1,823 passed, 0 failed, 0 skipped in 224,752.574 ms
- Distribution policy: PASS
- Type checking: PASS
- Bootstrap syntax: PASS
- Dashboard syntax: PASS
- Neutrality: PASS
- Implementation status: PASS, 60 entries
- Clean install: PASS, including a real TypeScript-backed runtime import from the installed package
- v4.8.0 to v4.9 upgrade: PASS; retained run and artifacts readable; no migration
- v4.8.1 to v4.9 upgrade: PASS; retained run and artifacts readable; no migration
- Activity log: PASS; 24 continuation events, no sensitive fixture data retained
- Protected-service restoration: NOT APPLICABLE; the networkless read-only sandbox had no authority or route to alter protected services

The clean-install gate found and corrected a packaging defect: `tsx` is now a runtime dependency, so installed TypeScript-backed CLI/runtime paths resolve outside a developer checkout.

## Remaining limitations

1. The earlier historical security-review corpus could not be authenticated or located.
2. Coverage remains 12 partial units rather than full dynamic coverage.
3. Ninety bounded candidates remain `needs_validation`; each records its exact remaining unknown.
4. The browser evidence harness does not construct unrelated optional product projections; those diagnostics are explicitly separated from the qualified security-audit route.
5. The Linux sandbox is physically qualified on the current Linux host. Other platform adapters must earn equivalent control evidence separately.

## Operator decisions required

1. Decide whether the bounded 90-record limitation and partial coverage are acceptable for v4.9 publication.
2. If acceptable, explicitly authorise the separate merge/push/tag/GitHub-release operation.

No merge, push, tag, release, deployment or protected-service change is authorised by this qualification.

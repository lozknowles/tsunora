# Agent Control v4.9 governed security-audit candidate

## Decision

The isolated v4.9 candidate is a **PASS** as a native, static-first security-audit capability. Production release is **not approved**. The dogfood audit completed all six governed Job phases, but target-controlled dynamic validation correctly remained blocked because no sandbox guarantee was evidenced. Its 104 unresolved leads remain `needs_validation`; none are represented as confirmed vulnerabilities.

## Source and attribution

- Branch: `feature/security-audit-v4.9-20260917`
- Qualified implementation source: `8c68b05d2181da3d6a482354ebfb408f9d8d2f86`
- Actual public starting point: v4.8.1, `b440d2c01c9cee17057a779298a421676c637be5`
- Required upgrade fixture: public v4.8.0, `57c593b4f88965acc54239f6c1a5321329ce6cef`
- Cloudflare security-audit-skill reference: `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`, MIT licence.

The Cloudflare project supplied research methodology and vocabulary. Agent Control uses its own typed records, Job runtime, worker identity, evidence, API, CLI and dashboard. No upstream prompt or implementation code was copied, and no upstream runtime dependency was introduced.

## Architecture

The registered `security-audit@1.0.0` Job owns reconnaissance, coverage hunting, candidate validation, structured findings, record verification and reporting. An Agent Control internal read-only worker executes each phase. Audit state has a hash-chained append-only history; exported reports and manifests have SHA-256 identities. Candidate, verification and finding records are separately typed. Confirmed findings require severity rationale, reproduction and evidence. `needs_validation` cannot carry severity. Rejected candidates remain retained.

Finder and verifier actions use distinct invocation identities and fresh source-window evidence. Both currently execute through the same deterministic controller worker, so the demonstrated independence grade is context-independent rather than formal third-party independence.

The sandbox decision is fail-closed. The dogfood environment recorded network, environment, resources, writes and processes as `UNPROVEN`; target execution was blocked and static inspection continued. Repository content is treated as untrusted input. Adversarial tests cover prompt injection, fabricated claims, malicious paths, duplicate candidates, controlled/rejected candidates, unresolved boundary candidates, hardening-only observations, source changes and report/event tampering.

## Native and external boundaries

Native Agent Control components own Job creation, six-phase dispatch, source inventory, bounded static rules, finder/verifier records, report generation, audit history and dashboard/API/CLI projection. The qualification launcher only created the normal Job, waited for its terminal state and copied content-addressed reports. It performed no target scanning, finding classification or report construction outside Agent Control.

The prior GLM record at `docs/evidence/agent-control-3.8.1-final-glm-review.json` remains `HISTORICAL_INDEPENDENT_SOURCE_REVIEW_UNCHANGED`. It records one historical invocation over commit `967181fd547f43a50cb26da566c6118ef7824364`; it was compared but not relabelled as native v4.9 evidence. No authoritative set of “51 review packets” exists in the current repository, so packet-by-packet agreement cannot truthfully be claimed.

## Dogfood result

- Audit: `audit-1d773fa5-5046-4f5a-b297-f2decf3a383a`
- Native Job run: `run-59d69855-06b7-4c3e-8940-5997021ffed0`
- Source revision: `8c68b05d2181da3d6a482354ebfb408f9d8d2f86`
- Phases: 6/6 succeeded, one attempt each
- Provenance: `AGENT_CONTROL_NATIVE`, `STATIC_ONLY`, `EXECUTION_BLOCKED_BY_SANDBOX`
- Coverage: 12 units; 0 covered, 12 partial, 0 blocked, 0 unreviewed
- File associations across attack classes: 1,089; this is not a distinct-file count
- Confirmed: 0
- Needs validation: 104
- Rejected: 63
- Self-verification matches: 0
- Recorded independence: `CONTEXT_INDEPENDENT`

Coverage is an inspection ledger, not a security-assurance percentage. The unresolved records require approved fresh validation before severity or remediation. Discovery did not modify target code or protected services.

## Conventional activity log

The candidate also projects authoritative durable Job events to one-event-per-line JSONL. Linux prefers `/var/log/agent-control/activity.jsonl`; Android and unwritable Linux installations use `<state-dir>/logs/activity.jsonl`. `AGENT_CONTROL_ACTIVITY_LOG` selects an approved alternative. Entries contain a stable event ID, run/lane identities, event type, provider/model, token counters, status and evidence reference, with the literal `unavailable` for missing values. Existing redaction runs before append.

The log is not an event authority. It reopens for each append, works with `tail -f`, `jq`, rename/create logrotate and ordinary log shippers, and cannot impair authoritative orchestration if the projection is unavailable. The native dogfood Job produced 36 activity events. Its terminal event linked the report artifact and correctly marked provider, model and token values unavailable because no model invocation occurred.

## Qualification

- Focused security-audit, activity-log, API, CLI and dashboard tests: pass
- Complete suite: 1,816 passed, 0 failed, 0 skipped in 228.690 seconds
- Type checking, bootstrap syntax, dashboard syntax, neutrality, distribution and implementation-status checks: pass
- Distribution policy: 1,382 tracked files, 36,442,143 bytes, zero violations
- Clean installation: pass from `agent-control-4.9.0-rc.1.tgz`; 1,391 package files; SHA-256 `c8682c713723605919d03bd7d4780629ec9ea3a46efdd3991175bef122f5a9d1`
- v4.8.0 upgrade: pass; retained observation run and two artifacts readable, unchanged configuration SHA-256 `150339fe5eb80186f31118958346c9e3066e943be066790ce497bb08f1562060`, new observation succeeded, no migration required
- Dashboard: authenticated read-only list/detail rendered at 1440×1000 and 390×844; visual readability passed after phase-layout correction
- Dashboard limitation: pre-existing page-wide inline-style CSP diagnostics and an initial unauthenticated request remain in the browser console. These did not prevent the authenticated audit views, but console cleanliness is not claimed.
- Failure cleanup and service restoration: not applicable; sandbox admission prevented target execution and no protected service was started, stopped or modified.

## Operator interfaces

```bash
agent-control security-audit start --repository /path/to/repository --revision <git-sha> --scope src,assets
agent-control security-audit coverage <audit-id>
agent-control security-audit unresolved <audit-id>
agent-control security-audit rejected <audit-id>
agent-control security-audit export <audit-id> --report report
agent-control security-audit compare <left-audit-id> <right-audit-id>
agent-control security-audit revalidate <audit-id> --revision <git-sha> --changed src/a.ts,src/b.ts
tail -f /var/log/agent-control/activity.jsonl
jq -c 'select(.status == "FAILED")' /var/log/agent-control/activity.jsonl
```

See `docs/security-audits.md`, `docs/activity-log.md`, `docs/examples/activity.jsonl`, `config/logrotate/agent-control`, `SECURITY_AUDIT_INTEGRATION_DECISION.md` and `docs/third-party/cloudflare-security-audit-skill.md`.

## Remediation and release recommendation

Remediation status is **not started**. This preserves the frozen discovery and verification record. The candidate should remain isolated until the operator:

1. accepts the static-only dogfood record and its 104 unresolved leads as the frozen baseline;
2. approves or defers a sandbox-qualified dynamic-validation environment;
3. separately authorises any validation/remediation parcel after findings are confirmed;
4. accepts the recorded browser-console limitation or requests a separate correction;
5. explicitly authorises merge, tag and publication.

No merge, push, tag, release, deployment or protected-service modification was performed.

# Agent Control 4.9.0 — Governed security audits and conventional activity logging

> The public `v4.9.0` tag is immutable. Subsequent Rebroad reliability work is an [isolated follow-up candidate](rebroad-reliability-review-4.9.md), not part of this release.

Agent Control 4.9.0 adds governed, coverage-led security audits as a normal Agent Control Job and a conventional append-only JSONL activity log derived from authoritative durable records.

## Governed security audits

- Six explicit phases cover reconnaissance, coverage-led hunting, candidate validation, finding construction, independent record verification and deterministic reporting.
- Finder and verifier work is retained as separate invocation evidence.
- Strict verdict schemas, append-only event hashes, authenticated CLI/API/dashboard access and SHA-256 artifact checks preserve evidence integrity.
- Change-aware continuation revalidates existing candidates without rewriting their original history.
- Target execution fails closed unless the selected sandbox adapter proves every required isolation and cleanup control. Static analysis remains available when execution is blocked.

The methodology is adapted from Cloudflare's MIT-licensed security-audit skill at pinned revision `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`. Agent Control has no upstream runtime dependency and copies no upstream prompt.

## Conventional activity log

The operational projection writes one redacted JSON object per line at `/var/log/agent-control/activity.jsonl` on writable Linux installations, with an application-private fallback where that path is unavailable. Entries preserve explicit `unavailable` telemetry and are suitable for `tail -f`, `jq`, logrotate and standard log shippers. The file is a projection and never becomes a second event authority.

See the [activity-log guide](activity-log.md) and [security-audit operator guide](security-audits.md).

## Qualification

The retained audit continuation processed all 104 records while preserving the original run and candidate history. A separate verifier worker reconstructed 104/104 source contexts and recorded FULL independence for every verification. No record was promoted to a confirmed vulnerability without evidence.

The physically qualified Linux sandbox passed all 13 required adversarial controls. The complete suite passed 1,823 tests with no failures or skips. Clean installation, v4.8.0 upgrade, v4.8.1 upgrade, distribution, type, syntax, neutrality, implementation-status, dashboard and activity-log gates passed.

## Evidence boundary

- Confirmed findings: 0.
- Needs validation: 90.
- Rejected records: 77.
- Coverage: 12 partial units and 0 full units.
- The earlier historical security-review corpus could not be authenticated or located.
- The Linux sandbox is physically qualified on the measured Linux host; other platforms must earn equivalent adapter evidence.
- Protected-service restoration was not applicable because the networkless read-only sandbox had no authority or route to alter protected services.
- No operational deployment is part of this release.

See [release verification](release-verification-4.9.0.md), [qualification report](../AGENT_CONTROL_4.9_SECURITY_QUALIFICATION.md), [integration decision](../SECURITY_AUDIT_INTEGRATION_DECISION.md), and the retained [completion evidence](provenance/EXTERNAL-EVIDENCE.md).

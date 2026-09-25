# Governed security audits

Agent Control 4.9 introduces a native, coverage-led security-audit Job. Agent
Control owns the phase dispatch, worker identity, candidate and verifier
invocations, verdict records, evidence hashes, retained history and report
generation. The target repository remains an input; it does not become the
audit authority.

Required methodology provenance and licence notices are retained separately in
the third-party notices. They are not product dependencies and do not define
the Agent Control Job, schemas, CLI, UI or release claims.

## Lifecycle

The registered `security-audit@1.0.0` Job has six visible steps:

1. reconnaissance;
2. coverage-led hunting;
3. candidate validation;
4. structured findings;
5. independent record verification;
6. reporting.

The finder and verifier run as different Agent Control invocations. A finding
cannot verify itself. Each record is one of `confirmed`, `needs_validation`, or
`rejected`. Unresolved findings deliberately have no severity. Rejected
candidates remain in history with their disproof.

Target-controlled execution is fail-closed. It is allowed only when Agent
Control has evidence for all of these controls: no external network, an
environment allowlist, bounded resource/time use, scratch-only writes, and
tracked process cleanup. A partial assurance record permits static analysis but
does not permit target execution.

On qualified Linux hosts, the platform adapter combines isolated namespaces,
a minimal read-only filesystem projection, a dedicated scratch mount and
transient service-level CPU, memory, process-count and runtime limits. The
generic contract does not require a particular Linux distribution or container
engine. Platforms without a qualified adapter remain static-only.

Continuation is additive. It retains the original candidate, verification and
finding records, then appends sandbox qualification, fresh source
reconstruction, new verifier identities and superseding current verdicts. The
previous records remain available as finding history.

## CLI

All operations use the authenticated controller API:

```bash
export AGENT_CONTROL_WEB_OPERATOR_TOKEN
agent-control security-audit start --repository "$PWD" --revision "$(git rev-parse HEAD)" --scope src,assets,scripts
agent-control security-audit resume AUDIT_ID --source-root /path/to/exact/revision/checkout
agent-control security-audit coverage AUDIT_ID
agent-control security-audit findings AUDIT_ID
agent-control security-audit unresolved AUDIT_ID
agent-control security-audit rejected AUDIT_ID
agent-control security-audit export AUDIT_ID --report report
agent-control security-audit compare OLD_AUDIT_ID NEW_AUDIT_ID
agent-control security-audit revalidate AUDIT_ID --revision NEW_SHA --changed src/control/example.ts
```

`start` creates an authoritative audit record and submits the normal governed
Job. The CLI does not inspect files or execute the target itself.

`resume` requires an explicit source checkout. Agent Control verifies that its
Git revision equals the retained audit revision before sandboxed validation is
admitted. The continuation uses a dedicated sandbox worker followed by a
separate verification worker with fresh per-candidate invocation identities.

## API

- `POST /api/security-audits`
- `GET /api/security-audits`
- `GET /api/security-audits/:id`
- `POST /api/security-audits/:id/resume`
- `GET /api/security-audits/:id/coverage`
- `GET /api/security-audits/:id/findings?verdict=needs_validation`
- `GET /api/security-audits/:id/export?report=report`
- `GET /api/security-audit-comparison?left=...&right=...`
- `POST /api/security-audits/:id/revalidate`

Every route requires operator authentication. Mutations retain the existing
origin and control-authority checks.

## Evidence bundle

Completed runs produce `architecture.md`, `coverage-ledger.json`,
`findings.json`, `REPORT.md`, `FINDINGS-DETAIL.md`, `NEEDS-VALIDATION.md`, and a
run manifest. Each artifact has a SHA-256 digest. The report renderer consumes
validated records; it does not invent explanations or promote missing evidence.

Historic GLM-5.3 review packets keep their existing source-review provenance.
They are comparison evidence and are never relabelled as Agent Control-native
security-audit runs.

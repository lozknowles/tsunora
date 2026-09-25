# Agent Control 3.5.0

Agent Control 3.5 adds durable identity, sessions and bounded delegation; a governed ACP v1 session/control mapping; context-deterioration measurement; and an optional Spark fast-execution class for tightly bounded trivial work.

The identity chain is explicit and attributable:

`Actor → Session → Work Parcel → Agent → Model → Provider → Runtime → Node/Resource → Evidence`

Spark remains disabled by default. Eligible work must be THIN, low risk, deterministically verifiable, within configured file/line/context limits, outside protected paths and routed to the exact qualified `gpt-5.3-codex-spark` model without fallback. Agent Control allows one attempt, disables subagent fan-out, independently verifies the Git scope/result and records visible STANDARD escalation rather than silently substituting another model.

## Qualification and limitations

The release verdict is `PASS_WITH_LIMITATIONS`:

- all 587 deterministic tests and the TypeScript, bootstrap, dashboard, infrastructure-neutrality and implementation-status gates pass;
- all repository-local Markdown links resolve, package dry-run validation passes, npm reports no known dependency vulnerabilities, and staged source/evidence scans contain no credential material;
- the frozen classifier is 10/10 with no false-positive Spark route;
- Spark verified 7/7 frozen tasks at 14.464 seconds median; the `gpt-5.6-luna` comparison verified 6/7 at 27.100 seconds median;
- provider monetary cost was unavailable and remains unknown;
- ACP 3.5 covers governed session/control mapping only: stdio/WebSocket packaging and external-client conformance are deferred;
- the physical Luna → local LLM → GLM-5.3-Flash → Luna chain did not run on the qualification host and is not claimed;
- automatic production Job adoption and automatic Spark routing remain unqualified and disabled.

These limitations are outside the declared 3.5 release scope and do not relax identity admission, tool policy, authority envelopes, approval, independent verification or evidence retention.

## Upgrade and recovery

```bash
git fetch --tags
git checkout v3.5.0
npm install
npm run check
```

Existing 3.4 Work Parcels, Jobs, schedules, model registry, resources and runtime state remain compatible. The `spark` block is optional and omission is equivalent to disabled. Installing the source release starts no service, enables no Saved Job or Schedule and changes no live configuration.

To recover the previous source baseline, check out immutable tag `v3.4.0`. Detailed migration, fast-execution and release evidence are in [`migration-3.5.md`](migration-3.5.md), [`fast-execution.md`](fast-execution.md) and [`evidence/agent-control-3.5.0-release-qualification.md`](provenance/EXTERNAL-EVIDENCE.md).

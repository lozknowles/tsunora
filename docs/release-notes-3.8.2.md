# Agent Control 3.8.2 release notes

Agent Control 3.8.2 aligns the repository-review provider-facing structured-output schema with the stricter application validation contract exposed by the 3.8.1 video qualification. The historical providers returned completed, transport-valid JSON; Agent Control then rejected values admitted by its looser wire schema. This release declares the same literals, enums, non-empty values, line constraints and confidence range at both boundaries while retaining independent fail-closed application validation.

New failures retain bounded safe constraint paths such as `$.findings[0].category:enum`. Rejected values and raw provider responses remain ephemeral and are not added to evidence merely for diagnostics.

The dashboard adds human-readable Execution history for Saved Job Runs and Lanes. This is a bounded redacted projection derived from existing durable Job Run, associated Work Parcel, token-governor, baton and verification records; it is not a new transcript store, scheduler or control path. It distinguishes operator, system, provider, tool/action, governor, baton and error activity and keeps current context separate from cumulative token/cost accounting with `authoritative`, `estimated` and `unavailable` labels.

Handoff semantics remain evidence-based. A threshold can produce `HANDOFF_RECOMMENDED` without a transfer; baton creation is not destination acceptance or execution; only a durable successful `BATON_AND_HANDOFF` outcome is shown as completed. This release does not claim that its 3.8.2 physical qualification performed an actual baton transfer.

The HTTP redaction boundary now permits the safe numeric `contextTokens` and `contextLimitTokens` fields while continuing to redact credential-like token fields. Human-readable history excludes raw prompts, rejected provider bodies, hidden reasoning, authentication material, email addresses and resolved credential paths.

Clean package installations can report their exact source release with `agent-control --version`; the command is local and does not require a running controller.

Physical qualification used the normal Controller Account A Saved Job path. Run `a0d646b0-77ae-41b3-85ed-a02a86f4880e` and Work Parcel `parcel-bccb41f1-c1b1-4ff2-8f1d-b3d8c61c2c07` returned a schema-valid `PASS`, passed independent verification, exposed 21 correctly associated history entries and reconciled 13,092 input plus 194 output tokens to 13,286 total at calculated USD 0.026960.

See [execution-history operation](execution-history.md), [dashboard operation](web-dashboard.md), [qualification evidence](evidence/agent-control-3.8.2-human-readable-history-qualification.md), and the [3.8.2 migration guide](migration-3.8.2.md).

Upgrade from 3.8.1 with `git fetch --tags`, `git checkout v3.8.2`, `npm install --no-package-lock --ignore-scripts`, and `npm run check`. Installing this source package starts no service, changes no live configuration, authenticates no provider and enables neither Spark nor a Saved Job.

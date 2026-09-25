# Agent Control 3.8.2 human-readable history and schema mop-up

Date: 2026-09-04

Branch: `feature/3.8.2-human-readable-execution-history`

Base: immutable `v3.8.1` release

Candidate: `3.8.2-rc.1`

## Scope and release boundary

This is post-v3.8.1 work. The historical v3.8.1 qualification evidence is unchanged: its three real repository-review calls failed closed with `repository_review_provider_schema_invalid`. This candidate adds a derived human-readable execution history and fixes the contract mismatch exposed by those runs. It does not merge, retag, rewrite or redeploy v3.8.1.

## Before: three physical failures

All three jobs selected `codex-chatgpt / Controller Account A / account-a-review` on the controller. Codex ran through the production structured repository-review path.

| Job | Run / Work Parcel | Provider result | Usage and calculated cost | Context/governor at completion |
| --- | --- | --- | --- | --- |
| Release Identity | `89ae35db-dafb-4c4f-bf69-9f85f0936be1` / `parcel-e12d4045-0acc-4383-85e5-a5924acb06af` | response hash `af88438d…`; rejected | 22,979 in + 1,608 out = 24,587; USD 0.052390 | estimated 24,587 / 32,768 = 75.03%; HANDOFF recommendation |
| Token Governor | `dcea4ea9-3248-4c10-8f84-c126c87b273f` / `parcel-4253148c-8956-42c6-a142-358c74355d39` | response hash `cf83b7c1…`; rejected | 51,917 in + 2,882 out = 54,799; USD 0.115362 | estimated 54,799 / 32,768, displayed/clamped 100%; HANDOFF recommendation |
| Credential Residency | `f958a778-d7af-46ed-9ccc-dba583bc6c45` / `parcel-2c337b6b-e2b1-4004-9cd1-d85da8f4f287` | response hash `b1db5041…`; rejected | 40,842 in + 2,359 out = 43,201; USD 0.091120 | estimated 43,201 / 32,768, displayed/clamped 100%; HANDOFF recommendation |

Combined retained accounting was 122,587 tokens and USD 0.258872. Each Work Parcel invocation recorded `outcome=completed`; the parser reached the schema-invalid branch rather than its JSON-invalid branch. Raw bodies were deliberately not retained because Codex ran `--ephemeral`, so historical rejected values and exact failing paths cannot truthfully be reconstructed.

### Required schema investigation answers

The answer is the same for Release Identity, Token Governor and Credential Residency unless stated otherwise:

1. **Did the provider return a response?** Yes. Each run retained a non-empty response SHA-256 and usage.
2. **Was the response complete?** The durable invocation says `completed`; no interruption or timeout was recorded. The old adapter did not retain a separate provider-native finish-reason field.
3. **Was it valid JSON?** Yes. Invalid JSON would have produced `repository_review_provider_json_invalid`; all three reached application schema validation.
4. **Did it conform to the provider transport schema?** Yes, to the old provider-facing schema. That schema required object structure but represented semantic literals, enums and ranges as unrestricted strings/numbers.
5. **Did it conform to the repository-review application schema?** No.
6. **Which exact constraint failed?** The exact historical field/value is unavailable by design: v3.8.1 discarded rejected bodies and recorded only the generic error. The proven contract defect is that the wire schema did not express application constraints for schema literal, verdict, finding severity/category, validation state, non-empty strings, positive lines and confidence range.
7. **Was output truncated?** No evidence of truncation exists; all invocations completed and retained substantial output. Exact provider-native finish metadata was not persisted.
8. **Did context exhaustion contribute?** Not established. Context was unavailable live and estimated from single-turn lifetime use after completion. Two estimates exceeded the configured window, but the calls completed and returned parseable JSON. That estimate cannot prove provider context exhaustion.
9. **Did `COMPACT_AND_CONTINUE` alter the response?** No. Governor assessment occurred after the provider response. No compaction, baton dispatch or destination execution occurred in these one-chunk jobs.
10. **Was there an adapter/schema-version mismatch?** Yes: an internal provider-wire/application-schema mismatch. Evidence does not establish a Codex CLI protocol-version incompatibility.
11. **Can it be reproduced deterministically?** The mismatch can: an object with an out-of-enum category satisfied the old structural wire schema and deterministically fails application validation. The exact historical bodies cannot be replayed because they were intentionally not retained.
12. **Does a minimal repository-review request succeed?** Yes after the fix; the physical production run below passed.

## Root cause and correction

`REPOSITORY_REVIEW_OUTPUT_SCHEMA` had intentionally been structural-only to avoid model-specific enum grammar failures. `parseRepositoryReviewResponse` then applied stricter semantic validation. Consequently, a provider could honor every declared transport constraint and still be rejected at the application boundary. The rejection was safe but opaque.

The candidate now declares the same schema literal, verdict, severity, category, validation-state, non-empty-string, positive-line and confidence constraints at the provider boundary. Application validation remains independent and fail closed. It records only safe field paths/constraint names, for example `$.findings[0].category:enum`, never rejected values or raw bodies. Validation was not weakened.

## Human-readable execution history

The dashboard now derives a bounded chronological view from the authoritative Job Run, associated Work Parcel audit, token/governor evidence and baton records. It adds no competing durable store and no mutation path. Actor labels, association IDs, telemetry authority, provider activity, governor recommendations, baton semantics, verification and ledger reconciliation remain visible after reload. A HANDOFF state is not displayed as a completed handoff unless the durable decision records successful `BATON_AND_HANDOFF`.

Secrets, authorization values, account emails, resolved credential paths, raw prompts, rejected bodies and hidden reasoning are excluded. A separate regression fixes the HTTP redactor so safe numeric `contextTokens` and `contextLimitTokens` remain visible while credential-like token fields remain redacted.

## After: physical Account A production run

A minimal immutable Git repository with one documented function and one passing Node test was reviewed through the normal Saved Job production path.

- Run: `a0d646b0-77ae-41b3-85ed-a02a86f4880e`
- Work Parcel: `parcel-bccb41f1-c1b1-4ff2-8f1d-b3d8c61c2c07`
- Frozen repository SHA: `4718137e838c5f089101b5b6132ae6def8d13c38`
- Route: `codex-chatgpt / Controller Account A / account-a-review @ controller`
- Started/completed: `2026-09-04T19:54:29.559Z` / `2026-09-04T19:54:37.077Z`
- Provider response SHA-256: `1dadddbf47964454dd34ccfeced1066c179d4429c90029c1be8cea0f5a080f60`
- Provider/application schema validation: passed
- Result: `PASS`, no supported defects
- Independent repository validation: passed
- Accounting: 13,092 input + 194 output = 13,286 total; calculated USD 0.026960
- Reconciliation: Job Run total/cost equals Work Parcel total/cost
- Context: unavailable at start; completion-only estimate 13,286 / 32,768 = 40.55%
- Governor: qualification policy produced a HANDOFF recommendation with `COMPACT_AND_CONTINUE`; no baton or handoff was falsely claimed
- History association: 21 chronological entries tied to the correct Run/Parcel

This proves that the provider call succeeds, both schema boundaries validate, a readable result is visible, accounting reconciles, and history remains attached to the correct lane/job. A preceding full-repository retry also crossed the corrected schema boundary and reached independent validation, but its repository result was `FAILED`; it is not used as the success claim.

## Browser evidence

The existing qualified Tailscale/SSH/CDP path launched MSI Chrome and recorded navigation across the successful minimal result/history and all three historical failure histories/results. A supplemental identity clip visibly records the candidate version, branch and implementation commit.

- Final history video: `/opt/qualification/agent-control-3.8.2-history-schema-mopup/agent-control-3.8.2-rc1-final-msi.mp4`
- History video SHA-256: `bb885f3b3a427c2ac49d50e7fd7143f6862a9987ccd4c44298da51d318421e2e`
- History format: H.264 MP4, 1920×978, 57 seconds
- Identity video: `/opt/qualification/agent-control-3.8.2-history-schema-mopup/agent-control-3.8.2-rc1-msi-identity.mp4`
- Identity video SHA-256: `e02fb8790242642b76597212e4db4c094d6b61ea0470bc3e3348d491936ed93a`
- Identity shown: `v3.8.2-rc.1`, `feature/3.8.2-human-readable-execution-history`, implementation commit `9be253fb06f97ae0c010d2c26f0f74a263338ee4`

The qualification media remains outside the Git worktree so it cannot become a product runtime dependency. Its hash binds it to this report.

## Deterministic coverage and final validation

Focused coverage includes association/isolation and ordering, operator/provider/tool representation, current-context versus lifetime accounting, authoritative/estimated/unavailable values, 100% estimated clamping, safe persistence/reload, recommendation/request/completion/failure handoff semantics, source recovery, provider schema path diagnostics and HTTP token-accounting redaction. The complete validation command is `npm run check` and includes TypeScript, bootstrap syntax, dashboard syntax, infrastructure neutrality, implementation status and the complete serial test suite.

Results:

- focused schema/history/web regression: 43 passed, 0 failed;
- `npm run check`: TypeScript, bootstrap syntax, dashboard syntax, infrastructure neutrality, implementation status and 717 tests passed; 0 failed;
- local Markdown-link validation: 117 Markdown files inspected, all local targets resolved;
- `git diff --check`: passed.

The pushed implementation/evidence commit is recorded in the final task report because a commit cannot contain its own SHA without a circular self-reference.

## Recommendation

Treat this as a backward-compatible **3.8.2 patch release candidate**, not a rewrite of v3.8.1 history. The schema correction and operator history are release-worthy changes, but merge/tag/release remain separate authorization and are not performed by this qualification task.

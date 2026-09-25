# Agent Control 4.12 source reconciliation

Public baseline: `v4.11.0` at `9dff191034b7c69e102687bef02803bc05afe874`.

Candidate branch: `release/4.12.0-rc-20260920`.

## Intended change groups

1. Lean native execution experiments and the resulting native Work Parcel/Job Runtime path.
2. Digest-bound Agent Templates and allow-listed Lab actions.
3. Evidence-verifier qualification and explicit quality/result semantics.
4. Governed runtime, no-progress and output-token budgets.
5. Experimental model-host and reservation adapters used by qualification.
6. Qwen3.8-27B output-budget and service-restoration evidence.
7. Provider-neutral cost/performance routing and optional OpenRouter translation.
8. Authenticated dashboard policy preview/save with exact-hash approval for authority increases.
9. Tests, documentation and retained qualification evidence for those groups.

No public 4.11 release files are deleted. Historical evidence remains immutable. The large retained timeout logs and JSON reports are evidence artifacts; they are not runtime dependencies.

## Claim classification

- **Product capability:** native registered template execution, generic runtime budgets, provider-neutral cost policy, exact-hash dashboard configuration workflow.
- **Optional adapter:** OpenRouter provider-field translation and experimental model-host integration.
- **Qualification evidence:** lean/native comparisons, timeout diagnosis, Qwen output-budget runs and restoration reports.
- **Not claimed:** live paid OpenRouter qualification, unrestricted template execution, universal model-host production readiness, or deployment to an operational installation.

The final release record must replace this branch-level description with the exact final source SHA and fresh gate results.

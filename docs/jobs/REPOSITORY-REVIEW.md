# Repository Code Review

`repository-code-review@1` is a non-mutating reference Job. Parameters are `node`, `repository`, `ref` (default `main`), `scope` (`changes` or `full`), and optional `compareAgainst`.

## Resolution and freezing

At `RESOLVING`, Agent Control checks node health and repository policy, verifies Git, resolves `ref^{commit}`, records origin and dirty source paths, then creates a detached isolated snapshot. Local sources use a shared clone; allowlisted remotes use an isolated clone. Every file and directory in the snapshot is made read-only. Source dirt is recorded but uncommitted files are not reviewed. The production repository is never modified.

The Run records repository identity, node, source/origin, requested ref, exact SHA, dirty state, comparison SHA, snapshot kind, and timestamps. Later branch movement cannot change the Run.

## Delta baseline

`changes` looks up the last successful baseline for Saved Job + repository identity + ref. It uses the baseline only when Git proves it is an ancestor of the frozen SHA. Missing or rewritten history falls back to an initial review and is visible through absence of `comparisonSha`. Failed, cancelled, degraded, or rejected Runs never advance a baseline.

## Context and execution

The deterministic context builder records the tracked tree, changed files/diff, important manifests, dependency metadata, tests and source selected by THIN/STANDARD/DEEP. Known credential paths, `.env*`, private keys, `.git`, and binary contents are excluded before provider input. Context is split into hashed bounded chunks; selected files and every unrepresented tracked filename are recorded for truthful coverage.

Each chunk becomes a persistent Work Parcel and is sent directly to the selected OpenAI-compatible/local provider. The versioned template permits only supplied frozen evidence, prohibits invented paths/results and writes, and requires `repository-review-v1` JSON. The adapter requests a strict JSON Schema where supported, rejects explicit incomplete/truncated finish states, and retains partial usage plus a response hash when parsing or validation fails. Agent Control never executes suggested remediation.

The built-in maximum output budget is 65,536 tokens because qualified reasoning providers may account internal reasoning against the same response allowance before emitting structured output. Saved Jobs may lower it only after qualifying the selected model at that limit.

Validation rejects duplicate findings, missing evidence, invalid confidence, secret/absolute/traversal paths, nonexistent files, and invalid line ranges. Valid findings contain severity, title, category, file/range, evidence, reasoning, impact, remediation, confidence, and validation state. The final result also stores summary, positive observations, reviewed/unreviewed areas, and verdict.

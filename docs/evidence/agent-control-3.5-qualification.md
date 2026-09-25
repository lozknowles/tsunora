# Agent Control 3.5 feature qualification — 2026-09-01

## Scope

Unreleased feature-branch qualification for identity/session/delegation, ACP v1 mapping, context deterioration, Sessions dashboard/API and governed Spark fast execution. No live Agent Control deployment, main merge, tag or release was performed.

## Baseline

- Base: `origin/main` at `4b04f3942201d65748c6c68bf9669cdea1841d19` (Agent Control 3.4.0).
- Baseline `npm run check`: 550 tests, zero failures before implementation.
- Worktree: isolated feature worktree on `feature/agent-control-3.5-identity-delegation-acp`.

## Spark availability

- Installed client: `codex-cli 0.144.4`.
- Authentication: ChatGPT login reported active.
- Exact model: `gpt-5.3-codex-spark`.
- Probe: ephemeral, read-only, user config ignored, exact `SPARK_AVAILABLE` fixed response.
- Result: available; provider usage from the probe was reported, but monetary cost was not.

The first live benchmark launch failed before model execution because client 0.144.4 rejects the newer `agents.enabled=false` configuration type. The runner was corrected to the verified installed-client `features.multi_agent=false` switch. No fixture changes occurred in the failed launch. This incompatibility and both evidence files are retained.

Before the final documentation gate, direct bounded compatibility checks reproduced the rejection for `agents.enabled=false` and returned the exact `COMPAT_CHECK` fixed response with `features.multi_agent=false`. The official-current and installed-client behaviors are therefore distinguished rather than inferred.

## Frozen fast-execution evidence

Evidence files:

- `artifacts/fast-execution/benchmark-2026-09-01T18-45-33-624Z.json`: classification/availability preflight.
- `artifacts/fast-execution/benchmark-2026-09-01T18-45-50-639Z.json`: failed pre-model launch proving installed config incompatibility.
- `artifacts/fast-execution/benchmark-2026-09-01T18-50-39-151Z.json`: corrected final live comparison.

Fresh final-gate requalification files:

- `artifacts/fast-execution/benchmark-2026-09-01T19-51-18-268Z.json`: fresh classifier/availability preflight.
- `artifacts/fast-execution/benchmark-2026-09-01T19-56-37-144Z.json`: fresh full live Spark/standard comparison.

Classifier: 10/10 correct; 0 false-positive Spark routes; 0 false-negative eligible routes. Ambiguous, multi-file and protected tasks were never sent to Spark.

Fresh final-gate live results:

| Route | Verified | Median latency | Time / verified | Input | Output | Cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Spark-first | 7/7 | 14.464 s | 15.396 s | 352,121 | 8,655 | unknown |
| `gpt-5.6-luna` baseline | 6/7 | 27.100 s | 33.111 s | 358,347 | 4,438 | unknown |

Spark touched only approved files, stayed within line limits and passed independent fixture verifiers. The comparison route returned explicit `ESCALATE` for the simple configuration fixture; this was correctly counted as an unverified outcome, not hidden by a retry. The earlier retained run recorded a second comparison-route escalation for repository search; the fresh run verified that case, illustrating run variance without changing policy.

## Baton/context finding

Eligible parent-to-child Context Packets were 24–35 estimated tokens. Spark verified all seven tasks without requesting more context. This supports a small structured baton for the frozen trivial class. It does not prove lower total model input because the Codex host/runtime context dominated reported usage.

## Multi-provider 3.5 experiment

The required Luna → local LLM → GLM-5.3-Flash → Luna physical chain was not executed. Read-only inventory found no qualified local-LLM or GLM model-registry route in this isolated 3.4 base, and the running 3.3.1 dashboards do not expose a reusable 3.4 model registry. Existing live deployments were not mutated. The chain is therefore `NOT_QUALIFIED_ON_THIS_HOST`, not simulated and not claimed passing.

## Final feature-branch gates

- Focused Sessions dashboard/API gate: 24 tests, zero failures.
- Canonical `npm run check`: 587 tests, zero failures, including type checking, bootstrap syntax, dashboard JavaScript syntax, infrastructure-neutrality and implementation-status consistency.
- `config/agent-control.example.json`: accepted by the production `validateConfig` path.
- `git diff --check`: clean.
- `npm pack --dry-run --json`: passed for `agent-control@3.5.0` with 526 included files; the dry run created no package archive.
- Evidence scan: no credentials, API keys, bearer values, pairing PINs or local workspace paths in the committed fast-execution artifacts.

## Verdict

Feature implementation and all deterministic/full-suite gates pass. The verdict is `PASS_WITH_LIMITATIONS`: the release-level physical multi-provider chain remains unqualified on this host, ACP transport/client conformance remains deferred, and Spark should remain default-disabled pending broader corpus, entitlement and cost evidence.

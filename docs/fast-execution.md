# Governed fast execution

`FAST_EXECUTION_MODEL` is a generic execution class for trivial, bounded coding. `gpt-5.3-codex-spark` is the exact model qualified for the current implementation. It reduces latency for work that is safe to describe with a small sealed baton and accept with a deterministic independent verifier. It is not a general-purpose cheap-model route, and it does not weaken Agent Control authority.

The current execution hierarchy is:

```text
LOCAL → SPARK → STANDARD → FRONTIER
```

THIN, STANDARD and DEEP are harness/context profiles. SPARK, STANDARD and FRONTIER are model execution classes. A THIN task is only a Spark candidate after every classification, availability, registry, scope and verification gate passes.

## Configuration and conservative defaults

The optional `spark` block defaults to disabled:

| Key | Default | Constraint |
| --- | --- | --- |
| `enabled` | `false` | Must be explicitly enabled after local qualification |
| `model` | `gpt-5.3-codex-spark` | Exact provider-native identity; no substitution |
| `modelRole` | `fast-execution` | Registry role that must resolve the exact model |
| `maximumFiles` | `1` | Classifier and verifier scope limit |
| `maximumChangedLines` | `80` | Independent Git-diff limit |
| `maximumAttempts` | `1` | Fixed at one |
| `maximumSubagents` | `0` | Fixed at zero |
| `maximumContextTokens` | `2048` | Allowed range 256–8192 |
| `verificationRequired` | `true` | Cannot be disabled |

Configure the complete block in `.agent-control/config.json` or use the authenticated **Configuration → Fast execution** editor:

```json
{
  "spark": {
    "enabled": false,
    "model": "gpt-5.3-codex-spark",
    "modelRole": "fast-execution",
    "maximumFiles": 1,
    "maximumChangedLines": 80,
    "maximumAttempts": 1,
    "maximumSubagents": 0,
    "maximumContextTokens": 2048,
    "verificationRequired": true
  }
}
```

A saved Spark-policy change requires an Agent Control restart because the availability result and runner are startup policy. The registry must separately contain a qualified model with provider-native identity `gpt-5.3-codex-spark`, proven `trivial.coding` capability on the selected node, and role `fast-execution` selecting it without fallback. Configuration alone does not establish availability or qualification.

## Classification and submission

All of these conditions must hold:

- Spark policy is enabled and its authenticated bounded exact-model probe passed;
- role `fast-execution` resolves the configured model on the selected node with no fallback;
- task kind is documentation, simple configuration, symbol rename, single-file bug, lint, simple test addition or repository search;
- harness profile is THIN, risk is low, and a deterministic verifier is supplied;
- file, changed-line and context estimates are within policy;
- no protected path, sensitive signal or ambiguous/deep-context request is present.

Eligible examples include correcting one typo in an ordinary Markdown file, changing one non-sensitive configuration default with an exact assertion, renaming a private symbol in one file, fixing a local off-by-one defect with a focused test, or adding one deterministic test within the line budget.

Ineligible examples include architecture or release changes, authentication/authorization/security work, data migration, deployment or production operations, protected configuration, cross-file refactors, ambiguous debugging, work requiring DEEP context, and any task without an independent deterministic verifier.

The 3.5 feature exposes the classifier/coordinator, policy editor, telemetry and frozen qualification harness. It does not silently make every natural-language submission or Saved Job use Spark, and it does not add a dashboard “force Spark” control. Production Job adoption remains unqualified; callers must use the governed fast-execution coordinator and supply the complete request, bounded context and verifier contract.

## Availability and execution

`probeCodexSparkAvailability` runs:

1. `codex --version`;
2. `codex login status` and requires ChatGPT authentication;
3. a bounded ephemeral read-only `codex exec --model gpt-5.3-codex-spark` expecting one exact fixed response.

The probe strips API-key environment variables. A model string, a successful CLI version check or a login alone is not availability evidence. If the exact model is unavailable, Agent Control records `spark-unavailable`, does not invoke another model as Spark, and leaves the existing governed STANDARD/FRONTIER route in control. If the caller requests continuation, escalation is visible and attributed rather than hidden fallback.

For an eligible task, Agent Control compiles `agent-control.fast-execution-baton/v1` containing the task, exact allowed files, changed-line limit, forbidden actions, Context Packet identity/hash, verifier commands and completion rule. `CodexFastExecutionRunner` requires an absolute disposable initially-clean Git worktree and runs one exact-model attempt with an explicit workspace-write sandbox, ignored user configuration, JSONL/output schema and multi-agent fan-out disabled.

Agent Control—not model output—owns acceptance. A reusable Git mutation-surface check uses NUL-delimited porcelain and the complete `HEAD` diff to account for staged and unstaged modifications, additions, deletions, rename source/destination paths, and non-ignored untracked files. Git-standard ignored files remain excluded so repository-local transient noise does not become a false release blocker. Untracked file content contributes to changed-line and mutation-hash evidence without changing the index. The independent verifier checks the resulting workspace. Failure, a verifier failure, low confidence, requested context, unexpected files/lines or scope growth records the Spark attempt and creates a visible STANDARD successor decision; it never retries Spark.

## Dashboard and telemetry

`GET /api/fast-execution-attempts` and the selected Session's **Fast execution** panel show:

- execution class and THIN harness profile;
- requested and actual model/provider;
- availability and classifier/selection reasons;
- parent and delegated context estimates;
- attempt, elapsed time and independently verified outcome;
- touched/read files when observable, changed lines and evidence;
- input/output usage and monetary cost/currency when exposed;
- escalation reason, successor execution class/model and final verified outcome.

Unknown provider fields remain `null` and render as `unknown`, never zero. The dashboard is a read projection plus authenticated policy editor; it does not execute Spark directly.

## Qualification and usage

First run classifier and exact-model availability only:

```bash
codex --version
codex login status
npm run benchmark:fast-execution
```

Then run the frozen disposable live comparison explicitly:

```bash
npm run benchmark:fast-execution -- --live --standard-model gpt-5.6-luna
```

Do not enable Spark merely because the probe succeeds. Review classifier accuracy, every independent verifier result, changed scope, exact model identity, escalation and the retained JSON evidence.

The 2026-09-01 desktop requalification produced:

| Metric | Spark-first | Standard comparison |
| --- | ---: | ---: |
| Verified outcomes | 7/7 | 6/7 |
| Median latency | 14.464 s | 27.100 s |
| Time per verified outcome | 15.396 s | 33.111 s |
| Input tokens, all attempts | 352,121 | 358,347 |
| Output tokens, all attempts | 8,655 | 4,438 |
| Reported monetary cost | unknown | unknown |

The classifier was 10/10 with zero false positives and zero false negatives. Spark batons were 24–35 estimated tokens and all seven verified. This supports minimal parent-to-child transfer for the frozen corpus; it does not prove low total provider context because Codex bootstrap/session/tool context dominates reported input usage.

Evidence is retained in [`../artifacts/fast-execution/benchmark-2026-09-01T19-51-18-268Z.json`](../artifacts/fast-execution/benchmark-2026-09-01T19-51-18-268Z.json) and [`../artifacts/fast-execution/benchmark-2026-09-01T19-56-37-144Z.json`](../artifacts/fast-execution/benchmark-2026-09-01T19-56-37-144Z.json). See also the [qualification record](evidence/agent-control-3.5-qualification.md).

## Current Codex CLI compatibility

The qualified installed client is `codex-cli 0.144.4`. Current public Codex documentation describes `agents.enabled=false`, but this installed client rejects that boolean as an `AgentRoleToml` type error. A bounded direct compatibility test proved that `features.multi_agent=false` succeeds, so 3.5 uses that switch for this client. The runner also selects the exact model with `--model`; do not rely on an operator profile or edit the runner command manually.

If qualification fails:

1. confirm `codex --version` reports the expected executable and `codex login status` reports ChatGPT authentication;
2. run the non-live benchmark and inspect its availability reason;
3. confirm the account is entitled to the exact Spark model and the registry route is exact and node-qualified;
4. if a newer Codex version changes agent configuration, re-run the direct bounded compatibility probe and update code/tests/docs together rather than allowing fan-out;
5. keep `spark.enabled` false until the full live benchmark passes locally.

Research-preview entitlement is not universal, cost was unavailable, file-read telemetry depends on Codex exposure, the corpus is small and production Job adoption is not qualified. The lane therefore remains disabled by default. A future fast model can occupy `fast-execution` only by passing the same availability, registry, classifier, baton, worktree, verifier, telemetry and benchmark contracts; routing policy does not require a model-specific rewrite.

Agent Control 3.6 adds a separate [60-task capability-routing benchmark](capability-routing-benchmark.md). Its deterministic route classifier passed, but its physical provider gate has no observations. That result does not supersede the seven-task Spark model qualification and does not justify enabling Spark or automatic production routing by default.

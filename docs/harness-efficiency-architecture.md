# Harness efficiency architecture

Status: experimental routing, production-compatible telemetry.

## Decision

Harness efficiency extends the existing adaptive-harness path. It does not add a second executor, scheduler, verifier or authority boundary.

```text
Job / lane
  -> existing placement and policy gates
  -> HarnessProfileRouter (THIN / STANDARD / DEEP)
  -> ContextPacketBuilder (ranked, bounded, provenance-linked evidence)
  -> AdaptiveHarness (profile + context strategy + model/provider recipe)
  -> existing provider executor and live ToolPolicy gateway
  -> invocation usage ledger
  -> existing verifier
  -> verified-outcome projection
```

The recipe fingerprint includes the harness profile and context packet identity. Model/provider routing remains inside `EconomicRouter`; harness routing supplies another qualified strategy dimension rather than replacing that router.

## Measurement boundary

Provider-reported usage is authoritative when present. Agent Control normalises common provider fields but stores unavailable values as `null`; it never infers cached tokens, reasoning tokens, provider cost or billing behaviour merely from total tokens. Locally measured prompt-component counts use the repository's deterministic byte-based estimator and are labelled `estimated`. Provider elapsed time stops when the model response is received, before the requested Agent Control tool executes. Job and Run identifiers are attached by the governed Job bridge rather than inferred from provider text.

The production bootstrap creates one file-backed, prompt-free invocation ledger under the configured Agent Control state root and passes the same ledger to Job verification and dashboard projections. The invocation API returns at most 1,000 records per request (200 by default); aggregates remain available without returning the full ledger.

The startup floor is the persistent material present before task-specific context: system instructions, Agent Control instructions, tool schemas, skills, workspace/bootstrap material, memory/shared context, repository instructions and any other persistent injection. Task context and conversation history are reported separately. Repeated-context estimates do not claim that a provider billed uncached tokens.

## Profiles

- `THIN` is bounded, targeted and strongly verified. It keeps governance instructions and required tools but excludes optional context. Production selection requires low risk, exact targets, a deterministic verifier and qualified THIN outcome evidence.
- `STANDARD` is the compatibility default and the fail-safe choice when routing confidence is insufficient.
- `DEEP` permits a larger evidence neighbourhood and more turns for architecture, high ambiguity and cross-cutting work. It does not weaken approvals or verification.

The router runs in observational mode by default. It may recommend THIN or DEEP, while the applied profile remains STANDARD until the relevant profile evidence is explicitly marked production-qualified. This prevents synthetic benchmark results from becoming routing authority.

Controlled same-model comparisons use an explicit `EXPERIMENT` mode. That mode applies only an explicitly requested profile, records `controlled_experiment_profile_applied`, and leaves `evidenceQualified` false. Production configuration accepts only `observe` or `enforce`, so benchmark profile forcing cannot silently become runtime routing policy.

## Context packet and graph

`ContextPacketBuilder` selects the smallest ranked packet that satisfies required evidence within the selected profile budget. Every included item retains source and provenance identifiers. Every omitted item is named with a reason. Required evidence that cannot fit fails closed instead of being silently dropped.

`ContextGraph` is a neutral port for nodes, relationships, neighbourhood queries, compact evidence retrieval and verified write-back. The initial in-memory adapter proves the contract without introducing a graph database or infrastructure dependency. Existing `ContextStore` remains authoritative for current context and provenance.

## Verification and cost

Each invocation is recorded before it can contribute to an efficiency score. A job becomes a verified success only after the existing verifier passes. Tokens, turns, elapsed time and cost are divided by verified successes; cheap failures therefore cannot improve cost-per-verified-outcome. Calculated cost is `null` unless an explicit pricing schedule can account for every observed billing class.

## Escalation

Escalation moves only forward (`THIN -> STANDARD -> DEEP`) and records a typed reason. It preserves context/provenance references and never repeats the same profile. Exhaustion returns human review. Execution backends may consume this decision through the existing retry/reroute path; the component does not seize scheduling authority.

## Security and compatibility

Profiles filter context and tools but cannot expand authority. Lease, baton, ownership, approvals, tool allowlists, protected workloads, cancellation, recovery and verifier gates remain unchanged. Context graph handles are not file-read capabilities. The types contain no provider, model, host, username or repository-name conditionals.

The live benchmark remains on this same path. It performs endpoint health and model-identity checks, creates a normal recipe and context packet, dispatches through the existing provider and live tool gateway, and marks ledger observations only after its independent marker verifier runs. Its report deliberately distinguishes controlled context retrieval from repository mutation and keeps automatic routing observational.

## Real-mutation experiment boundary

```text
frozen task + fixture hash
  -> disposable Git workspace
  -> explainable profile prediction
  -> ContextPacketBuilder
  -> HarnessDispatcher + live ToolPolicy
  -> bounded structured model/tool turns
  -> candidate diff + checksummed patch evidence
  -> independent deterministic verifier
  -> outcome ledger (all attempts and escalations)
  -> production-routing qualification gate
```

The six mutation tools are typed operations: bounded file read, compact search, scoped replace, scoped write, one fixed public-test command and finish. Workspace-relative allowlists, symlink/path traversal checks, payload limits, cancellation and per-attempt budgets apply before mutation. The model cannot select an arbitrary command, test process or repository path. A finish claim is necessary for a completed model turn but never substitutes for the independent verifier.

Each outcome records the task prediction, starting profile, every attempt, explicit escalation reason, context and recipe identities, provider invocation IDs, token composition, reads/searches/mutations/tool calls, verifier result, patch hash and evidence IDs. An adaptive outcome sums every precursor attempt; a successful final DEEP attempt cannot hide the cost of failed THIN or STANDARD attempts.

The predictor is an explainable rule layer over frozen task features, not a learned router. Its output is telemetry. Production selection remains disabled unless the versioned gate passes adequate sample size, success non-regression, bounded escalation, cumulative-resource improvement, ToolPolicy, lease/ownership, human-takeover, fallback and neutrality criteria. The recorded run fails that gate, so the architecture remains observational with STANDARD applied.

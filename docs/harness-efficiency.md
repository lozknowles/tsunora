# Harness efficiency and context budgeting

Agent Control treats an execution strategy as:

```text
model + provider + harness profile + context strategy + tools + turns + cache behaviour + verifier
```

The optimisation metric is cost per verified outcome. A run contributes a success only after the existing Job verifier passes and the Run reaches `SUCCEEDED`.

## Profiles

| Profile | Intended work | Default context ceiling | Behaviour |
| --- | --- | ---: | --- |
| THIN | Exact, low-risk, one/two-file work with deterministic checks | 4,096 estimated tokens | Targeted sources, required tools, few turns |
| STANDARD | Ordinary implementation and debugging | 16,384 estimated tokens | Compatibility default and uncertainty fallback |
| DEEP | Architecture, high ambiguity, cross-cutting work | 65,536 estimated tokens | Wider graph/context neighbourhood and more turns |

These ceilings are configurable. All profiles retain approvals, lease/ownership policy, human takeover, protected-workload rules, cancellation, recovery and verification.

Routing mode defaults to `observe`. The router records what it would choose but applies STANDARD. `enforce` still requires the selected profile to carry minimum verified runs, success rate, same-model controlled runs and explicit production qualification. Operator configuration alone does not fabricate this evidence.

## Context packets

`ContextPacketBuilder` accepts sources labelled by kind, relevance, requirement, persistence and provenance. It returns:

- included source IDs and content hashes;
- token estimates by component;
- a packet identifier used by the recipe fingerprint;
- provenance IDs;
- named omissions with `profile_filtered`, `source_limit` or `token_budget` reasons.

Required evidence is never silently omitted. If it cannot fit, packet construction fails and the caller can request escalation.

`ContextGraph` is an interface, not a database requirement. Adapters may find nodes, follow relations, retrieve neighbourhoods, rank/compact evidence, record provenance and write back verified knowledge. Write-back requires an explicit verification reference.

## Invocation accounting

Every provider invocation can record:

- Job, Run, task and lane identity;
- provider, model, profile, strategy and turn;
- system, Agent Control, tool, skill, bootstrap, shared-memory, repository-rule, task, history and other context components;
- input, fresh input, cached input, cache-write, output, reasoning and total tokens;
- tool calls, supplied context sources, elapsed time and costs;
- recipe/context provenance;
- verifier and final Run result.

Provider usage is authoritative when present. Locally counted components use the deterministic UTF-8-byte estimate and are labelled estimates. Missing provider data remains `null`. Fresh tokens remain unknown when a provider supplies input tokens but does not identify cached input.

Calculated cost requires an explicit pricing schedule covering every observed billing class. A cached or reasoning token class without a configured rate makes calculated cost unknown. No monetary saving is inferred from avoided estimated context.

## Escalation

Supported reasons include missing context, test failure, ambiguous repository state, unexpected dependency, model uncertainty, verifier rejection, tool limitation and execution failure. Escalation is monotonic:

```text
THIN -> STANDARD -> DEEP -> REVIEW
```

Context packet and checkpoint references are preserved. The controller does not repeat the same profile or grant new authority.

## API and dashboard

- `GET /api/efficiency` returns aggregate model, provider, profile and lane metrics.
- `GET /api/efficiency/invocations` returns bounded observation metadata (200 records by default, maximum 1,000, with optional `runId`/`jobId` filters); prompt contents are not retained in the efficiency ledger.
- `/api/status` includes the aggregate projection.
- The Jobs dashboard shows per-Run profile/turn/token/verifier data and a compact Harness Efficiency diagnostic.

## Benchmark

Run:

```bash
npm run benchmark:harness-efficiency
```

The suite freezes twenty tasks, one model identity and parameters, and one deterministic verifier. It compares all three profiles and writes:

- `docs/harness-efficiency-report.md`
- `artifacts/harness-efficiency-report.json`

The current suite is a deterministic harness simulation. It proves packet construction, profile differences, verifier gating and report reproducibility. It does not invoke a live model and therefore cannot establish real success rate, cache percentage, latency, provider cost or cost per verified outcome. Those values remain null and automatic routing remains observational.

### Controlled live same-model benchmark

The live runner uses the same frozen task classifications but measures a controlled context-retrieval contract through the real `AdaptiveHarness`, `HarnessDispatcher`, provider adapter, live `ToolPolicy` gateway and independent verifier. It deliberately does not edit a repository. Profile evidence is gated so a task's immutable marker is present only at or above its frozen minimum profile; a lower profile must declare `INSUFFICIENT_CONTEXT` and fail verification.

```bash
AGENT_CONTROL_HARNESS_LIVE_BASE_URL=http://127.0.0.1:PORT/v1 \
AGENT_CONTROL_HARNESS_LIVE_MODEL=qualified-model-id \
AGENT_CONTROL_HARNESS_LIVE_CONTEXT_TOKENS=30000 \
AGENT_CONTROL_HARNESS_LIVE_TIMEOUT_MS=300000 \
npm run benchmark:harness-efficiency:live
```

Non-loopback endpoints require `AGENT_CONTROL_HARNESS_LIVE_ALLOW_REMOTE=true`. An optional bearer credential is read only from `AGENT_CONTROL_HARNESS_LIVE_BEARER_TOKEN` and is never written to the report. The endpoint must pass health and model-identity checks. The context allowance and latency budget are explicit resource limits rather than bypasses; their defaults are 30,000 tokens and 300,000 ms per request. Runs are sequential, use one allowlisted read-only submission tool, and write `docs/harness-efficiency-live-report.md` plus `artifacts/harness-efficiency-live-report.json`.

The explicit `EXPERIMENT` routing mode exists only for controlled, requested-profile comparisons. It cannot be selected from production configuration, does not claim profile qualification, and does not alter the observational production default. The committed live report shows 60 same-model task runs with no unexpected result, but it is context-retrieval evidence rather than coding or repository-mutation evidence. Monetary cost remains unknown unless the endpoint exposes billing data or an explicit complete pricing schedule is supplied.

### Real repository-mutation qualification

The real-mutation runner uses the same harness, dispatcher, profile router, context packets, efficiency ledger and `ToolPolicy`. It does not expose a shell. A live model can call only bounded repository read, compact search, scoped replace/write, fixed public-test and finish tools. Each task receives a fresh disposable Git copy of the frozen fixture, while an independent verifier checks the actual diff, file scope, changed-line budget, syntax, public tests, task-specific behavior, whitespace, credentials and topology leakage. Test-addition acceptance is mutation-tested against a verifier-only policy mutant.

```bash
AGENT_CONTROL_HARNESS_MUTATION_BASE_URL=http://127.0.0.1:PORT/v1 \
AGENT_CONTROL_HARNESS_MUTATION_MODEL=qualified-model-id \
npm run benchmark:harness-mutation:live
```

Non-loopback use requires the runner's explicit private-remote opt-in. Bearer credentials are read only from the documented environment variable and are not persisted. A resumable checkpoint is ignored by Git; final JSON, Markdown and redacted patch evidence are authoritative. The runner checks endpoint health and exact model availability before, during and after the matrix and does not reset a protected provider cache.

The recorded same-model run produced:

| Strategy | Verified | Fresh | Cached | Cache | Fresh / verified | Processed / verified | Median latency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| THIN only | 0/12 | 14,168 | 46,164 | 76.5% | unknown | unknown | 5.29 s |
| STANDARD only | 2/12 | 23,929 | 83,859 | 77.8% | 11,964.5 | 56,064 | 7.37 s |
| DEEP only | 2/12 | 29,862 | 142,473 | 82.7% | 14,931 | 89,121 | 9.22 s |
| THIN -> STANDARD -> DEEP | 2/12 | 77,279 | 418,063 | 84.4% | 38,639.5 | 255,213 | 30.03 s |

These are provider-reported warm-state token fields, not monetary or cold-cache evidence. The experiment disproves the assumption that always starting THIN is efficient for this model/task suite. It does not support immediate DEEP classification or adaptive escalation, and its 12 unique tasks are below the production gate's 20-task minimum. STANDARD remains the production-safe applied profile while predictions and alternative profiles remain observational/experimental.

Full evidence is in [`harness-mutation-report.md`](harness-mutation-report.md), [`../artifacts/harness-mutation-report.json`](../artifacts/harness-mutation-report.json), and [`../artifacts/harness-mutation-evidence/`](../artifacts/harness-mutation-evidence/).

## Raw inference route

`RAW_INFERENCE` is a one-request Lab route for measuring qualified model behaviour without an agent/tool loop. It is separate from `AGENT_WORKFLOW` in `executionStrategy` and cannot establish tool or agent competence. The authenticated endpoint is `POST /api/lab/direct-inference`; retained evidence is available only to authenticated operators. Input, cached input, cache writes, output, reasoning and total tokens remain null when the provider/runtime does not report them. Local, included, metered and unknown billing classes remain distinct.

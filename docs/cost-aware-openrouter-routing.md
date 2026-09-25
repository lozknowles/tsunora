# Cost-aware provider routing

Agent Control can apply an optional, provider-neutral cost and performance policy to a model invocation. OpenRouter is the first native adapter. Existing routes behave exactly as before unless a policy is explicitly configured or supplied to an invocation.

## Two different controls

`rateCeilingUsdPerMillionTokens` is a route eligibility constraint. The OpenRouter adapter translates its `input` and `output` values to `provider.max_price.prompt` and `provider.max_price.completion`. The unit is USD per million tokens. It does **not** cap the total charge for a request or job.

`budget.invocationUsd` and `budget.jobUsd` are Agent Control total-spend controls. Before dispatch, Agent Control reserves the configured maximum output and calculates the worst permitted cost from the rate ceilings. It blocks the invocation when that amount exceeds either the invocation budget or the remaining job budget. Actual usage and provider-reported cost are reconciled after completion.

Cached input, fresh input, reasoning tokens and output remain separate when the provider supplies them. A missing value is `null`/unavailable, never an invented zero. A calculated charge is not produced from a discounted cached-input route unless the cache split and billing semantics are sufficient.

## Modes

- **Economy** sorts eligible routes by price.
- **Balanced** sorts by price across model/provider combinations, prefers the requested historical throughput threshold, and retains hard rate ceilings.
- **Fast Capped** sorts by throughput while retaining hard rate ceilings.
- **Custom** configures price, throughput or latency optimization, percentile preferences, allow/ignore lists, quantizations, fallback, token ceilings, and invocation/job budgets.

The built-in Balanced and Fast Capped dollar values are illustrative presets. They are not silently enabled and are not recommendations for a particular model.

Preferred throughput and latency use provider history and are not real-time guarantees. They may degrade only when `onMiss` is `degrade`. Hard price ceilings and total budgets never degrade automatically. When no route satisfies a hard rate ceiling, the invocation is blocked as `NO_ROUTE_WITHIN_PRICE_CEILING`; fallback does not remove the ceiling.

## Scope and approval

Precedence is:

`estate → provider → model → suite → job → invocation`

A more specific scope may lower a ceiling without approval. Removing or raising a rate ceiling, spending budget, token ceiling, or cross-model authority requires an existing Agent Control approval record. Decisions, overrides and reconciliations can be written to the append-only, hash-linked cost-routing ledger.

## Configuration

Policies use `agent-control.cost-performance-routing-policy/v1`. They may be placed at `costPerformanceRouting.estate`, on a provider or model, or in the root `suites` and `jobs` maps. Reusable policies belong in `costPerformanceRouting.presets`.

OpenRouter example:

```json
{
  "schema": "agent-control.cost-performance-routing-policy/v1",
  "id": "interactive-capped",
  "strategy": "custom",
  "optimization": "throughput",
  "rateCeilingUsdPerMillionTokens": {"input": 1, "output": 2},
  "budget": {"invocationUsd": 0.10, "jobUsd": 2},
  "tokenCeiling": {"input": 120000, "output": 8192},
  "fallback": {"enabled": true, "onNoEligibleRoute": "block", "crossModel": false}
}
```

Other providers may translate the same generic policy through their own adapters. Until an adapter exists, Agent Control reports `provider_native_cost_performance_translation_unavailable`; it does not silently discard unsupported controls.

## Explain without inference

The authenticated API exposes:

- `GET /api/routing/cost-performance` — presets, scopes, inheritance and configured policies.
- `POST /api/routing/cost-performance/explain` — effective policy, candidate exclusions, worst-case cost, remaining budget and translated provider request. It never dispatches inference.

CLI example:

```bash
agent-control routing explain \
  --policy fast-capped \
  --provider openrouter \
  --model example-model \
  --input-tokens 20000 \
  --output-tokens 2000 \
  --job-spent 0.25
```

The Models workspace contains the same explain surface. It shows the effective provider request but never credentials or authorization headers.

## OpenRouter schema verification

Verified against official documentation on **2026-09-20**:

- [`provider.max_price`, sorting, percentile preferences, `partition: "none"`, allow/ignore, quantization and provider fallback](https://openrouter.ai/docs/guides/routing/provider-selection)
- [generation usage and cost metadata](https://openrouter.ai/docs/api/api-reference/generations/get-request-&-usage-metadata-for-a-generation)
- [model fallback behavior](https://openrouter.ai/docs/guides/routing/model-fallbacks)

The adapter emits `provider.sort`, `provider.preferred_min_throughput`, `provider.preferred_max_latency`, `provider.max_price.prompt`, `provider.max_price.completion`, `provider.only`, `provider.ignore`, `provider.quantizations`, and `provider.allow_fallbacks`. Cross-model fallback additionally requires an explicit model list and is reported unsupported when that list is absent.

## Limitations

- Provider price and performance metadata may be delayed, incomplete or change after a decision. The retained decision record preserves what Agent Control used at the time.
- The generic deterministic catalogue selector operates on supplied or configured observations. OpenRouter still performs final endpoint selection inside its native provider pool.
- Provider-reported generation cost is authoritative when present. Agent Control does not infer discounted cache charges without sufficient evidence.
- This candidate was qualified deterministically with mocked catalogues. No paid OpenRouter inference was needed for contract qualification.

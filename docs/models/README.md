# Model registry

Agent Control separates seven concerns:

1. a **provider** supplies an endpoint, protocol and credential reference;
2. a **model** supplies a stable Agent Control ID and provider-native model ID;
3. a **qualification** proves capabilities on a named execution node;
4. a **role** supplies an ordered primary/fallback policy;
5. worker placement selects the node independently of model routing.
6. **capability intelligence** preserves verified native/emulated observations and historical task economics independently of configuration.
7. a **provider catalogue** observes changing remote model inventories without granting qualification or routing eligibility.

A configured model starts `UNTESTED` unless durable evidence says otherwise. Only `QUALIFIED` models can route. `QUALIFYING`, `FAILED`, `DISABLED`, wrong-node and capability-unproven candidates remain visible and fail closed.

## Configuration

```json
{
  "providers": [{
    "id": "openrouter",
    "name": "OpenRouter",
    "kind": "openai-compatible",
    "baseUrl": "https://openrouter.ai/api/v1",
    "wireApi": "responses",
    "auth": {"type": "bearer-env", "env": "OPENROUTER_API_KEY"},
    "credentialFileEnv": "OPENROUTER_API_KEY_FILE"
  }],
  "models": [{
    "id": "glm-fast",
    "displayName": "GLM fast",
    "provider": "openrouter",
    "providerModel": "z-ai/glm-5.3-flash",
    "capabilities": ["coding", "reasoning"],
    "qualification": {"state": "UNTESTED"}
  }],
  "modelRouting": {
    "defaultRole": "coding.default",
    "roles": {"coding.default": {"primary": "glm-fast", "fallback": [], "requires": ["coding"]}}
  }
}
```

When both references are declared, the primary bearer environment reference is used when present; otherwise the provider resolves the path named by `credentialFileEnv`. The referenced file must remain outside source control. Agent Control never projects its path or value into telemetry or evidence.

For an owner-only Agent Control-managed value, use the same generic opaque reference supported by account-profile credential residency:

```json
"auth": {"type": "provider-secure-store", "reference": "provider:external"}
```

Then run `agent-control providers credential set external`. The value is read from hidden stdin, not from command arguments, and resolved only at an authenticated provider call. Environment, referenced-file and secure-store references use one resolver. An account-bound API model resolves only its selected account profile's reference; no provider/global fallback is attempted.

## Dynamic provider catalogue

Providers with `discovery.enabled` enter the generic catalogue exposed by `GET /api/provider-catalog`. Authenticated `Discover Models` calls the configured adapter's size- and time-bounded catalogue operation. Each returned canonical model ID becomes a dynamic registry model with observed metadata and `routingEligible: false`; fields that the latest successful response does not return are `UNKNOWN` with `UNKNOWN` authority rather than stale or guessed. Explicit cost classification is provider-reported; a classification inferred from provider-returned numeric pricing is marked adapter-derived.

The review lifecycle is:

```text
DISCOVERED → UNQUALIFIED → SMOKE_TESTED → BENCHMARK_QUEUED
→ BENCHMARKED → QUALIFIED / REJECTED / LIMITED → ROUTING_ELIGIBLE
```

Smoke success is not routing qualification. Frozen model-intelligence evidence must establish `QUALIFIED` or `PREFERRED`, then an authenticated operator must explicitly enable the route. Degradation, loss of qualifying evidence, or absence from the latest successful provider catalogue withdraws eligibility automatically. A later reappearance returns the model to `UNQUALIFIED`; it is never silently re-enabled. See [provider/model lifecycle](../provider-model-lifecycle.md) and [NVIDIA hosted models](NVIDIA-HOSTED.md).

The first physical use of this path discovered 81 NVIDIA hosted IDs and ran a conservative four-model smoke sample. A partial frozen Nemotron batch passed its nine provider-executed attempts, while 42 capability-gated attempts remained unavailable; it therefore stayed `CANDIDATE` and routing-disabled. Discovery availability is not inference or routing availability: two advertised representative IDs timed out or returned HTTP 404 during smoke. See the [2026-09-06 qualification evidence](../evidence/agent-control-3.9-nvidia-hosted-qualification-20260906.md).

The example is a registration, not proof that the provider currently exposes that model. Confirm the provider-native model ID and qualify it before routing. Do not add pricing unless its source and effective date are known.

## Qualification states

- `UNTESTED`: configured, no successful proof;
- `QUALIFYING`: a bounded qualification is in progress;
- `QUALIFIED`: exact provider/model/node identity passed all checks;
- `FAILED`: the latest bounded proof failed;
- `DISABLED`: explicitly unavailable for routing.

The current qualification performs basic response, bounded coding and bounded reasoning checks. Evidence stores hashes, normalized usage, latency and identity—not response text, API keys or prompts containing secrets.

For the 3.9 frozen suite, configured capability is only an unverified seed. A verified attempt records the exact provider/account/model/runtime/node and optional local-artifact hash, suite/prompt/adapter versions, required capability, score, failure class, fresh/cache-read/cache-write/output tokens, latency and cost authority. Repeated batches append history; they never replace yesterday's evidence.

## Routing order

An explicit model wins over a requested role; a requested role wins over `defaultRole`. Within a role, Agent Control evaluates primary then fallbacks and enforces optional `requires` capabilities against qualification evidence. A fallback decision records every rejected candidate and reason. Set `allowFallback: false` when substitution is forbidden.

Work Parcel stages may specify `requestedRoute.model` or `requestedRoute.modelRole`. Agent Control resolves that request against the scheduler-selected node before creating the Job Run and stores the exact decision in `run.trigger.modelRoute`.

The 3.9 capability-first ranker rejects candidates without every verified requirement before comparing qualification confidence, observed task quality/reliability, known cost/latency, token/cache efficiency, account/node state, local/API preference and privacy policy. Its decision identifies each rejected candidate and whether the selected route satisfied requirements natively or through a verified Agent Control emulation. Unknown cost is not free.

## API

Read-only projections:

- `GET /api/models/providers`
- `GET /api/models`
- `GET /api/models/:id`
- `GET /api/models/routes`
- `GET /api/provider-catalog`

Operator-authenticated operations:

- `POST /api/models/:id/qualify` with `{"nodeId":"controller"}`
- `POST /api/models/:id/route` with node, capabilities and fallback policy
- `POST /api/provider-catalog/providers/:provider/discover`
- `POST /api/provider-catalog/providers/:provider/models/:model/smoke`
- `POST /api/provider-catalog/providers/:provider/models/:model/routing-enable` or `routing-disable`
- `POST /api/configuration/systems` for provider/model upserts

On 3.7, a CLI provider may also contain safe account-profile metadata and a model may bind `accountProfile`. The effective account route is `provider/account/model/node`; account and model qualification are separate and both must agree on the execution node. `GET /api/models/accounts` exposes only opaque ID, node ID, friendly label, plan authority, availability and qualification. `POST /api/models/accounts/{provider}/{account}/qualify` performs an authenticated, operator-triggered profile check on that profile's node. Codex login, local isolation and restricted Windows-node execution are documented in [CODEX-INTEGRATION.md](CODEX-INTEGRATION.md).
- `POST /api/configuration/model-routing` for complete role-map replacement

The read-only status projection also carries `capabilityIntelligence` and `modelIntelligence`: capability candidates/observations, frozen batches, append-only attempts, rolling history, regression warnings and leader slots. Lifecycle mutation and model-evaluation queue operations remain authenticated and evidence gated; endpoint reachability alone never promotes a model.

See the **Models** dashboard tab for the same projection.

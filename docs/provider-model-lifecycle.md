# Provider and model lifecycle

Agent Control 3.6 development adds a session-neutral durable lifecycle registry. Providers, immutable model recipes, qualification evidence and routing policy survive controller and client sessions; none is discovered merely because one interactive session can reach it.

## Logical providers

A logical provider records:

- stable provider ID and kind;
- HTTPS endpoint, or loopback HTTP for a local service;
- an indirect credential reference such as `env:MODEL_PROVIDER_KEY`, `file-env:MODEL_PROVIDER_KEY_FILE`, an isolated CLI home or `provider-secure-store`;
- currently observed capabilities and provider model IDs;
- observation timestamp.

Literal credentials and credentialed URLs are rejected. Discovery updates capabilities/models only; provider identity, endpoint and credential reference are immutable under the same ID. Machine placement is not embedded in provider identity.

Account profiles add provider-neutral locality beneath that logical provider. `credentialResidency` names an opaque store reference and owning node; `providerExecutionNodeId` selects the qualified node that invokes the provider; the Job independently selects its workload/repository node. The recommended deployment keeps credentials on the controller or a designated credential/provider-execution node. Managed workload nodes need no provider credentials, while explicitly configured remote credential residency remains supported. See [credential residency](credential-residency.md).

The same shape covers OpenAI/Codex routes, local OpenAI-compatible or llama.cpp endpoints, external OpenAI-compatible providers and GLM-5.3-Flash. `Ox` remains accepted only by the existing historical compatibility normalizer and is not a separate model recipe.

## Dynamic catalogue review

The generic dynamic catalogue complements the immutable recipe lifecycle; it does not replace or bypass it. Authenticated discovery records provider endpoint/credential/discovery state, canonical model IDs, timestamps, field-level authority, observed request/token limits and quota. Discovery is time- and response-size-bounded. A field absent from the latest successful provider response is `UNKNOWN` rather than inheriting either a marketing claim or a stale earlier observation.

Every new model starts routing-disabled. Catalogue presence and inference availability are independent:

```text
DISCOVERED / UNQUALIFIED / inference UNTESTED
→ bounded callability probe / inference CONFIRMED
→ capability smoke / SMOKE_TESTED → BENCHMARK_QUEUED
→ BENCHMARKED → QUALIFIED / REJECTED / LIMITED → ROUTING_ELIGIBLE
```

An ID returned by a model-list operation never implies that its inference route accepts that ID. The one-request streaming callability gate records HTTP acceptance, stream start, first event, measured TTFT, partial-output signal, finish reason and normalized usage. It distinguishes timeout before first token from timeout during generation and keeps unavailable values unavailable. Raw events, output and reasoning are not durable evidence.

Only a callability-confirmed model proceeds to the bounded, versioned and content-hashed capability suite. Its passing callability result may satisfy the equivalent basic-completion probe; four remaining probes check strict structured JSON, coding, tool invocation and a larger context request. Evidence records requested output budget, output length, latency, normalized usage, finish reason, provider-neutral failure class, response hash, evidence source and adapter invocation-profile ID. An adapter can add only audited non-reserved provider fields for compatibility. Truncation retains safe partial telemetry and fails explicitly; malformed or semantically invalid structured output fails without weakening validation. Prior callability and smoke runs remain append-only history.

`BENCHMARK_QUEUED` enters the existing content-hashed frozen suite. Only current `QUALIFIED` or `PREFERRED` model-intelligence evidence permits an authenticated operator to enable routing. `DEGRADED`, `QUARANTINED`, `RETIRED`, missing or otherwise unqualified evidence automatically revokes a dynamic route. A model absent from the latest successful provider catalogue is marked unavailable and disabled in the registry; if it later reappears it returns to `UNQUALIFIED` with routing still disabled. Role-map policy remains a separate deliberate configuration step.

See [model registry](models/README.md), [adding a provider](models/ADDING-A-PROVIDER.md), [NVIDIA hosted models](models/NVIDIA-HOSTED.md), the [first physical dynamic-catalogue qualification](evidence/agent-control-3.9-nvidia-hosted-qualification-20260906.md), and the [focused diagnostic follow-up](evidence/agent-control-3.9-nvidia-focused-diagnostics-20260906.md).

## Immutable model recipes

A recipe key is `recipe-id@version`. It seals exact provider, provider model, model version, capabilities, context/output limits, tool support, node requirements and runtime requirements with a SHA-256 fingerprint. Changing any field requires a new recipe version.

## Lifecycle

```text
DISCOVERED
  → BENCHMARKING
  → SHADOW
  → CANDIDATE
  → ACTIVE
  → PREFERRED
  → DEPRECATED
```

Transitions cannot be skipped. SHADOW requires verified benchmark evidence; CANDIDATE requires verified shadow evidence; ACTIVE requires verified candidate evidence; PREFERRED requires verified comparison evidence. Deprecation is evidence-linked. Evidence includes exact recipe identity, sample size, references, verified outcome, and latency/cost only when measured.

## Champion/challenger routing

Routing policy is immutable and versioned. Each role names one ACTIVE/PREFERRED champion, qualified challengers, requirements and one of `manual`, `benchmark`, `shadow` or `candidate` mode. Publishing creates a new version and never rewrites prior policy. Routing returns exact recipe/provider/model identities.

Historical replay scores retained observations without changing active policy. Verified-success rate dominates; known cost and then latency break ties. Missing cost remains `null`, not zero. A rollback selects an immutable earlier policy only with verified rollback evidence.

## Current boundary

The registry, transition gates, replay, policy versioning and rollback are implemented and deterministic. The [physical multi-provider qualification](physical-multi-provider-qualification.md) exercises exact Luna, local Qwen and GLM-5.3-Flash identities once, but does not promote their immutable recipes to ACTIVE/PREFERRED. The larger frozen benchmark still has no physical observations, so automatic production Job routing remains disabled.

## Capability and historical intelligence (3.9)

Provider/model lifecycle identity remains unchanged. The new capability store adds evidence that routing can consume without turning a provider feature into core policy. Each observation records capability, provider/model/runtime/version subject, supported state, native versus `AGENT_CONTROL_EMULATED`, verification state, confidence, timestamps, limitations and evidence. Advertised/configured capability is unverified until a frozen or task-specific qualification proves it.

Capability candidates follow `DISCOVERED → ANALYSED → EXPERIMENT → QUALIFICATION → ADOPTED`, or end as `REJECTED`/`DEFERRED`. A candidate records the external source, claimed technique, proposed generic equivalent, measured experiment and final decision. Adoption updates neither active model policy nor authority automatically.

The frozen model-evaluation ledger is append-only. A batch seals the suite SHA-256, Agent Control/adapter/prompt versions and exact provider/account/model/runtime/node/artifact candidate identities. Every repetition remains a separate attempt with output hash, scoring result, failure class, usage, cache split, cost authority, elapsed time and verification evidence. `CAPABILITY_UNAVAILABLE`, `AUTHENTICATION_UNAVAILABLE`, `PROVIDER_UNAVAILABLE`, `TEST_FAILURE` and `ARCHITECTURE_REGRESSION` are distinct outcomes.

Historical projections provide 7-, 30- and 90-day plus all-time quality/reliability, cache hit ratio, latency, fresh/total tokens, cost and per-success economics. Regression warnings require a sufficient baseline/sample and retain the measured reason; one noisy result cannot quarantine a route. The candidate lifecycle used by this ledger is `CANDIDATE → QUALIFIED → PREFERRED → DEGRADED → QUARANTINED → RETIRED`. Consequential promotion remains approval/evidence gated. Leader slots stay empty when there is not enough durable evidence rather than fabricating a ranking.

The real 3.9 frozen run used two local llama.cpp routes twice (204 persisted attempts). It verified capability-first selection of the coder route for `code.modify`, but leaves both same-day routes as candidates and leaves browser/computer capability and monetary cost unavailable. See [qualification](evidence/agent-control-3.9-provider-neutral-qualification.md).

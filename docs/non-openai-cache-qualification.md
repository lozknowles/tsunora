# Non-OpenAI prompt/KV cache qualification

Agent Control preserves backend cache evidence through the generic provider invocation contract. For llama.cpp, the OpenAI-compatible response can include `timings.cache_n` (prompt tokens reused from the KV cache), `timings.prompt_n` (prompt tokens actually processed), `timings.prompt_ms`, and `timings.predicted_ms`. These are backend measurements, not estimates derived from latency or cumulative usage. The normalized invocation records their source as `llama.cpp.response.timings` and marks the evidence authoritative only when the reuse and processed-token fields are present.

The adapter does not claim cache reuse when a provider omits these fields. Sending the same prompt, saving a transcript, or receiving a fast response is not sufficient evidence. A valid qualification requires matched cold/warm/negative-control Work Parcels, an isolated cache scope, real code changes and independent tests, with cache population included in the economics.

The 2026-09-09 physical qualification used an isolated loopback llama.cpp `b9371` instance and Qwen2.5-Coder-3B-Instruct-Q4_K_M with one 8,192-token slot, `--cache-prompt` and `--cache-reuse 0`. Each of three cycles restarted only that qualification backend, recorded the idle single-slot boundary, ran a verified cold mutation, repeated the identical task, and then changed the relevant prefix. The first invocation measured:

| Arm | Mean `cache_n` reused | Mean `prompt_n` processed | Mean prompt processing |
| --- | ---: | ---: | ---: |
| cold | 0 | 1,328 | 1,328.11 ms |
| identical warm | 1,327 | 1 | 43.66 ms |
| changed-prefix control | 497 | 839 | 849.00 ms |

All nine Work Parcels changed only the authorised fixture file and passed public tests, syntax/scope checks, a credential/topology scan and an independent hidden verifier. The changed-prefix arm retained a common system prefix, so partial reuse was expected; its 830-token mean loss versus warm is the negative-control signal. The measured warm prompt-processing speedup was 30.45×, but direct `cache_n`/`prompt_n` counters—not latency—prove reuse.

The provider reported neither cache-write counts nor TTFT. No tariff or measured energy input existed for this local route, so monetary savings remain unavailable. Cache population is included because every warm arm follows and is paired with its cold population arm. This 4.2 evidence proves cache reuse on its own. The separate [4.3 physical qualification](provenance/EXTERNAL-EVIDENCE.md) subsequently proved that the production router changes route because a compatible, governed Warm Expert has measured retained state.

The dashboard displays per-invocation reuse and processed prompt counts when supplied, and `cache evidence unavailable` otherwise. Its operator-authenticated managed-artifact view presents the original parcel prompt first, followed by the naturally produced provider/tool transcript and independent verifier record. Hosted-provider billing and local compute measurements remain separate; no monetary saving is inferred for local inference. See [the physical evidence record](provenance/EXTERNAL-EVIDENCE.md).

Agent Control 4.3 consumes this same normalized evidence without changing its meaning. See [Cache-Aware Expert Delegation](cache-aware-expert-delegation.md).

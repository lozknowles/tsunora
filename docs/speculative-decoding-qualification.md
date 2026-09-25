# Speculative decoding qualification

Agent Control treats speculative decoding as a qualified relationship between a main model, draft model, runtime build, hardware node, and configuration. Support alone never enables routing.

The reusable `speculative-decoding-qualification@1.0.0` Job performs immutable model/runtime identity checks, tokenizer compatibility checks, current resource admission, warmed ordinary and speculative trials, output-equivalence checks, cleanup verification, and evidence retention. Outcomes are `BENEFICIAL`, `NEUTRAL`, `REGRESSION`, `INCOMPATIBLE`, `RESOURCE_BLOCKED`, or `UNSUPPORTED`.

Routing order remains:

1. avoid generation when deterministic execution is sufficient;
2. choose the cheapest adequate route when generation is required;
3. consider a locally qualified speculative relationship;
4. use it only while current resource admission passes and measured generation throughput remains above the explicitly configured experimental threshold;
5. otherwise retain ordinary decoding.

The request objective is explicit:

- `LATENCY_SENSITIVE` chooses the relationship with the lower measured time to first token. A throughput win cannot override a first-token regression.
- `THROUGHPUT_SENSITIVE` may select speculative decoding when the exact relationship clears its configured generation-throughput threshold and current admission.
- `BALANCED` compares estimated completion time using the recorded time to first token, recorded generation rates, and the request's expected output length. If that expected length or the required measurements are unavailable, it retains ordinary decoding.

The decision is bound to the exact node, accelerator, runtime SHA-256, main-model SHA-256, draft-model SHA-256, and qualified draft-token setting. A different relationship must qualify independently. Another installation can register the same governed Job through its normal Agent Control configuration by supplying its own absolute artifact paths, checksums, model identities, runtime identity, hardware node, bounded authority, trial settings, and explicit benefit/admission policy; no source edit or product-specific model name is required.

The existing Node Dashboard lists the relationship under **Qualified execution capabilities** only on the evidenced node. The existing Run Inspector shows the ordinary/speculative decode mode and, for a qualification run, an **Acceleration** view with generation throughput, time to first token, draft acceptance, VRAM overhead, exact identities, and the retained artifact reference. Raw evidence and the human-readable history remain available through the existing evidence surfaces; no separate speculative-decoding dashboard or source of truth is created.

The llama.cpp adapter supplies runtime-specific flags and reads its reported draft/acceptance timings. The Agent Control evidence model and recommendation remain runtime, provider, model, and device neutral. Energy per token remains unavailable unless a defensible sensor is bound to the invocation.

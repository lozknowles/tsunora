# Agent Control 3.9 NVIDIA focused diagnostics

- Date: 2026-09-06
- Branch: `feature/3.9-nvidia-hosted-provider`
- Pre-investigation checkpoint: `dc6e05c741d2d6d83a9322e710bca68cfe7987af`
- Released base: `v3.9.0` / `4966c97505d05e5be3a2f8cae092113ad44d636e`

## Scope and safety

This is a focused follow-up to the immutable [initial NVIDIA qualification](agent-control-3.9-nvidia-hosted-qualification-20260906.md). It does not replace or rewrite that report. No catalogue-wide smoke or benchmark sweep was run. All 81 discovered NVIDIA models remained routing-disabled throughout. The real credential stayed behind the generic owner-only opaque reference and was neither read nor persisted in this evidence.

The investigation made twelve focused inference requests: two bounded MiniMax callability diagnostics, then one callability plus four capability probes for Muse and Nemotron. No new Kimi request was needed because five earlier HTTP 404 observations plus the current first-party catalogue were sufficient to classify the boundary. Provider output and reasoning were not retained; evidence contains only sanitized statuses, hashes, lengths, finish reasons, timestamps and normalized usage.

## Nemotron smoke versus frozen benchmark

The two results exercised materially different contracts:

| Dimension | Smoke suite v2 | Frozen `agent-control-real-work-v1` |
| --- | --- | --- |
| Structured prompt | `Return the required marker.` | Explicit task instruction plus `Return only the requested structured object...` |
| Hidden expectation | Validator required `AC_SMOKE_OK`, but the prompt did not state it | Expected answer/evidence were stated in each fixture |
| Schema | `{marker: string}`; the schema did not constrain the expected literal | `{answer: string, evidence: string[]}` |
| Output budget | 128 tokens | Up to 2,048 tokens |
| NVIDIA request profile | `chat_template_kwargs.enable_thinking=false` | No smoke-only extension |
| Admitted tasks | Five smoke probes | Only coding, code-modification and retrieval were capability-admitted, three repetitions each |
| Structured-output suite task | Executed and failed marker validation | Capability-gated `UNAVAILABLE`; it was not one of the nine provider calls |
| Validator | Exact marker | Deterministic expected-evidence scorer after application JSON validation |

The nine admitted frozen calls did use the common structured transport, and all produced valid `answer/evidence` objects. They consumed 253–546 output tokens each and all finished `stop`. Thus 9/9 demonstrates useful structured behavior under the larger explicit contract; it never reran the defective marker contract and does not prove stochastic inconsistency.

Root cause: smoke v2 contained an unfair generic harness ambiguity. It asked for an unspecified marker while privately requiring a particular value. Prompt, schema, output budget, request profile, capability gates and validator all differed from the frozen run. There is no evidence here of an intermittent Nemotron weakness.

Smoke v3 states the expected literal in both prompt and JSON Schema, retains independent validation, and gives the bounded structured probe 256 output tokens. Nemotron then passed all five probes:

| Probe | Result | Input | Output | Total | Finish | Elapsed |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| callability/basic | PASS | unavailable | unavailable | unavailable | `stop` | 516 ms |
| structured JSON | PASS | 31 | 13 | 44 | `stop` | 479 ms |
| coding | PASS | 40 | 4 | 44 | `stop` | 482 ms |
| tool calling | PASS | 291 | 13 | 304 | `tool_calls` | 554 ms |
| context reliability | PASS | 1,304 | 5 | 1,309 | `stop` | 666 ms |

Known non-basic usage reconciles to 1,666 input + 35 output = 1,701 tokens. The streaming callability response omitted usage, so the five-probe aggregate is correctly unavailable rather than inferred. Measured callability TTFT was 451 ms.

## Muse Glimmer truncation

Smoke v2 recorded authoritative `finish_reason=length` at exactly the requested caps:

| Probe | Requested cap | Provider output | Total usage | Result |
| --- | ---: | ---: | ---: | --- |
| structured JSON | 128 | 128 | 189 | `OUTPUT_TRUNCATED` |
| coding | 64 | 64 | 144 | `OUTPUT_TRUNCATED` |

This proves Agent Control supplied insufficient budgets; it is not a model-quality failure. The corrected partial-response path retained usage, finish reason and response hash without retaining reasoning or raw content.

Smoke v3 kept the requests small but raised structured and coding to 256. It also made the structured literal explicit and constrained it in the schema. Both completed below the new bound:

| Probe | Result | Input | Output | Total | Finish | Elapsed |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| callability/basic | PASS | 64 | 37 | 101 | `stop` | 699 ms |
| structured JSON | PASS | 71 | 96 | 167 | `stop` | 520 ms |
| coding | PASS | 80 | 87 | 167 | `stop` | 543 ms |
| tool calling | PASS | 419 | 90 | 509 | `tool_calls` | 501 ms |
| context reliability | PASS | 1,087 | 34 | 1,121 | `stop` | 454 ms |

The run reconciles to 1,721 input + 344 output = 2,065 provider-reported tokens. Measured callability TTFT was 537 ms. This is bounded smoke evidence, not production routing qualification.

## MiniMax timeout diagnosis

Two bounded streaming callability probes were sufficient; no further request was made:

| Started | Completed | Elapsed | HTTP status/accepted | Stream/event/token | Classification |
| --- | --- | ---: | --- | --- | --- |
| 11:42:18.298Z | 11:43:03.311Z | 45,012 ms | unavailable / no | none | `TIMEOUT_BEFORE_FIRST_TOKEN` |
| 11:44:00.911Z | 11:44:45.923Z | 45,010 ms | unavailable / no | none | `TIMEOUT_BEFORE_FIRST_TOKEN` |

The first result was retained as history. A single repeat was made because its invoking terminal session did not surface the completion result; subsequent durable-state inspection recovered both records, so no third call was made. In both cases `fetch` had not returned response headers when Agent Control's 45-second deadline expired. There was no accepted-response signal, SSE event, TTFT, partial output, usage, finish reason or response hash. Therefore:

- Agent Control cannot claim that the endpoint accepted the request;
- this is not a timeout during slow generation;
- there is no 4xx evidence of an unsupported parameter;
- inference state remains `INDETERMINATE`, not `CONFIRMED` or `NOT_AVAILABLE`.

NVIDIA's current LLM API index omits MiniMax M3 even though live `/v1/models` advertised it. That is supporting evidence of an availability/catalogue inconsistency, not proof of the provider-internal cause. MiniMax remains on diagnostic hold.

## Kimi K2.6 404 diagnosis

The initial run already made five requests; every configured `POST /v1/chat/completions` returned HTTP 404. The model was visible in live `/v1/models`, but its inference endpoint was not available under that canonical ID and API contract. Current first-party NVIDIA evidence is consistent with a stale or inconsistent catalogue: the K2.6 model-card URL returns 404 and the current LLM API index lists Kimi K2 instruct/thinking and K3, not K2.6.

Agent Control now records this as `DISCOVERED` plus `inferenceEndpointStatus=NOT_AVAILABLE` and `ENDPOINT_NOT_AVAILABLE`. It does not synthesize another ID or endpoint. Kimi K3 is a fresh callability candidate because both live discovery and current first-party documentation identify it, but it is untested.

## Generic changes

The changes are provider-neutral except for the already-audited NVIDIA request profile:

1. Catalogue presence and inference callability are separate. New discoveries are `UNTESTED`; only an observed accepted inference response becomes `CONFIRMED`.
2. A bounded streaming callability probe records HTTP acceptance, stream start, first event, measured TTFT, pre-token versus mid-generation timeout, partial-output signal, finish reason, normalized usage, output length and response hash. Raw SSE, output and reasoning are not persisted.
3. Failures use a normalized taxonomy including timeout-before-token, timeout-during-generation, truncation, schema invalid, endpoint unavailable, authorization, rate limit, malformed response, provider error, capability unavailable, unreliable tool call and verification failure.
4. Smoke v3 explicitly communicates constrained values, uses fair bounded output budgets, and can reuse a post-discovery passing callability result as its basic probe.
5. Prior callability and smoke records move into append-only history instead of being overwritten. The v2 results above remain queryable.
6. Dashboard/API projection shows discovery and inference separately, a human-readable diagnostic label, TTFT/evidence source and the next triage stage. Capability smoke is disabled until callability is confirmed.
7. Routing gates are unchanged: smoke never qualifies a route, and all NVIDIA routes remain disabled.

- Callability contract SHA-256: `4d50ffa52f6b4c59ce78b756804e466013e7e400bc327902669690952860182c`
- Smoke v3 contract SHA-256: `42aa9588a5ae4cde9f987c4a609ce81bc925d2f9e44a1514e38786829548ab68`
- Preserved smoke v2 contract SHA-256: `3c9eb89c175ff2685b12f86e1f9a938bbd7d995c1d979228145d618b09b2897e`

## Staged catalogue funnel

```text
DISCOVERED
  → one bounded streaming callability probe
  → four capability probes only when inference is CONFIRMED
  → frozen benchmark only for reviewed promising candidates
  → evidence-gated qualification
  → explicit operator routing admission
```

For `N` discovered models and `S` callability survivors, pre-benchmark volume is `N + 4S`, versus naive `5N`. For the 81-model observation:

| Scenario | Requests | Avoided versus 405 | Maximum serial request budget |
| --- | ---: | ---: | ---: |
| All 81 survive | 405 | 0 | 5 h 03 m 45 s |
| Two survivors | 89 | 316 (78.0%) | 1 h 06 m 45 s |
| Four-model focused sample, two survivors | 12 | 8 (40.0%) | 9 minutes |

The time figures use the conservative 45-second bound per call, not observed average latency. The responsive calls here usually completed in 0.45–0.70 seconds; MiniMax consumed the full bound. Two survivors among four investigated models must not be extrapolated as a catalogue-wide survival rate.

## Candidate shortlist

No item below is routing-qualified. Current live IDs are used; documentation claims are prioritization hints only.

| Priority | Canonical ID | Intended investigation | Current state |
| --- | --- | --- | --- |
| 1 | `nvidia/nemotron-3-super-120b-a12b` | agentic/reasoning/coding/retrieval/escalation | Callability and smoke PASS; prior frozen batch PARTIAL/CANDIDATE |
| 1 | `meta/muse-glimmer-30b` | fast worker, coding, tools, structured/context smoke | Callability and smoke PASS; not benchmarked |
| Hold | `minimaxai/minimax-m3` | long-context/agentic | Two pre-header timeouts; inference INDETERMINATE |
| Stop | `moonshotai/kimi-k2.6` | agentic/coding | Inference endpoint NOT_AVAILABLE under discovered ID |
| 2 | `moonshotai/kimi-k3` | callable Kimi successor | Callability untested |
| 2 | `nvidia/nemotron-3.5-lightning-30b-a3b` | fast/cheap worker | Callability untested |
| 2 | `nvidia/nemotron-3-ultra-550b-a55b` | escalation/reasoning | Callability untested |
| 2 | `mistralai/mistral-nemotron` | reasoning/tool candidate | Callability untested |
| 2 | `deepseek-ai/deepseek-v4-flash-0731` | fast coding worker | Callability untested |
| 2 | `openai/gpt-oss-20b` | compact worker | Callability untested |

Any candidate whose live ID differs from current documentation requires ID reconciliation before a call. Catalogue metadata does not establish quality, cost, capability or availability.

## Result and recommendation

Current protected ledger projection: 81 discovered; 2 inference-confirmed; 1 indeterminate; 2 endpoint-unavailable; 76 untested; 0 routing eligible. The second endpoint-unavailable record is the preserved earlier `mistralai/mistral-7b-instruct-v0.3` observation; it was outside this focused rerun and was not called again.

The 405-request sweep should remain unauthorized. The next economical step, if separately authorized, is stage one only: one bounded callability request per still-untested reviewed candidate (or per all 76 untested models if broad inventory evidence is genuinely needed). Capability smoke should then run only for confirmed, prioritized survivors. Frozen benchmarks remain a separate decision.

Primary references used for API-contract comparison: NVIDIA's [LLM APIs](https://docs.api.nvidia.com/nim/reference/llm-apis), [Nemotron 3 Super](https://build.nvidia.com/nvidia/nemotron-3-super-120b-a12b), [Muse Glimmer](https://build.nvidia.com/meta/muse-glimmer-30b), and [MiniMax M3](https://build.nvidia.com/minimaxai/minimax-m3). Live behavior remains the qualification authority.

# Agent Control 3.9 NVIDIA hosted provider qualification

Date: **2026-09-06**

Branch: `feature/3.9-nvidia-hosted-provider`

Source baseline: `4966c97505d05e5be3a2f8cae092113ad44d636e` (`v3.9.0`)

Change state: isolated, unreleased working tree; no merge, tag, release, deployment or publication

## Verdict

**PARTIAL — PROVIDER INTEGRATION PHYSICALLY PROVEN; NO NVIDIA ROUTE QUALIFIED**

The end-to-end generic integration is real: secure credential reference → authenticated discovery → dynamic registry → controlled inference → normalized usage → frozen model review → protected ledgers → dashboard/API/SSE projection. The qualification does not promote an NVIDIA model. All 81 discovered entries remain routing-disabled; the best observed route is a `CANDIDATE`, not `QUALIFIED` or `PREFERRED`.

## Credential and security boundary

The operator entered the real credential once through `agent-control providers credential set nvidia-hosted` hidden input. The command used the existing generic `provider-secure-store`; there is no NVIDIA-specific store or configuration field. The safe fingerprint was displayed transiently during that ceremony and deliberately was not copied into this document or re-derived by reading the secret.

Metadata-only checks after the ceremony recorded:

- provider: `nvidia-hosted`;
- status: `CONFIGURED`;
- secure-store directory: owner `loz`, mode `0700`;
- credential object: mode `0600`;
- configuration: opaque reference `provider:nvidia-hosted` only.

The value remained outside Git and the repository. Runtime resolution happened only immediately before the authenticated HTTP request. No credential value, authorization header, raw provider response, hidden reasoning, response body, Windows path or raw transport stream was retained in catalogue, benchmark, Work Parcel, Job, telemetry, API, SSE, dashboard or this evidence.

## Live discovery

At `2026-09-06T08:47:16.508Z`, the production `ProviderCatalogRuntime` successfully called the configured authenticated catalogue endpoint.

| Observation | Result |
| --- | --- |
| Endpoint | `AVAILABLE` |
| Discovery | `SUCCEEDED` |
| Canonical model IDs | 81 |
| Available catalogue entries | 81 |
| Routing-eligible entries | 0 |
| Rate-limit headers | `UNKNOWN` (not returned) |
| Quota | `UNKNOWN` (not returned) |
| Cost classification | `UNKNOWN` |

The live list included `meta/muse-glimmer-30b`, `minimaxai/minimax-m3`, `nvidia/nemotron-3-super-120b-a12b` and `moonshotai/kimi-k2.6`. It did not advertise a GLM-family ID at that observation. Most list records contained only canonical identity/ownership, so context limits, modalities, capability support, licence, downloadable status and pricing correctly remained `UNKNOWN`. An ID's presence in discovery was not treated as proof that its chat endpoint worked.

## Qualification-discovered defects and correction

The first bounded calls exposed reasonable provider responses that the original catalogue path represented poorly:

1. A response could finish with `length`, report usage and contain no final assistant content because its output budget was consumed before final output. The provider client correctly failed closed, but the smoke catch path discarded the safe partial usage, finish reason and response hash and reported only `provider_malformed_response`.
2. The coding marker probe unnecessarily requested the structured-output schema, conflating coding and schema capability.
3. Very small marker budgets interacted badly with reasoning-first defaults even where NVIDIA exposes a supported thinking control.
4. The smoke input hash remained at suite version 1 after probe semantics changed, making provenance ambiguous.
5. The recursive dashboard redactor treated the legitimate `tokenEfficiency` accounting field as credential-like and replaced it with `[REDACTED]`.

The minimum corrections were:

- preserve only sanitized `partialInvocation` usage, elapsed time, finish reason and response hash;
- classify provider-reported `length` as `provider_output_truncated`;
- make coding a plain bounded marker probe;
- allow adapters to add size-bounded, audited request fields while prohibiting overrides of model, prompt, token, schema, tool and stream controls;
- use NVIDIA's adapter-only `nvidia-hosted-nonreasoning-smoke-v1` profile (`chat_template_kwargs.enable_thinking=false`) for smoke probes only;
- leave normal provider execution and frozen benchmarks unchanged;
- content-hash the exact smoke-suite-v2 probe contract (`3c9eb89c175ff2685b12f86e1f9a938bbd7d995c1d979228145d618b09b2897e`);
- preserve `tokenEfficiency` as an allowed accounting projection while continuing to redact credential-like token fields.

Validation was not weakened. Truncated or schema-invalid output still fails closed, and provider text/reasoning is not evidence.

## Final representative smoke

All four targets used the same smoke-suite-v2 hash and `nvidia-hosted-v1` adapter. Each probe ran once with zero retries.

| Model | Window (UTC) | Result | Passed | Failed boundary | Normalized usage |
| --- | --- | --- | --- | --- | --- |
| `meta/muse-glimmer-30b` | `09:11:36.121`–`09:11:39.531` | `FAILED` | basic, tool, context | structured and coding: `length` / `provider_output_truncated` | 1,712 input + 370 output = 2,082 total; cached input reported as 0 |
| `minimaxai/minimax-m3` | `09:11:39.585`–`09:15:24.601` | `FAILED` | none | all five: `provider_timeout` at the fixed 45-second bound | unavailable |
| `nvidia/nemotron-3-super-120b-a12b` | `09:15:24.645`–`09:15:30.533` | `LIMITED` | basic, coding, tool, context | structured: independent marker/schema verification failed | 1,681 input + 39 output = 1,720 total; cache split unavailable |
| `moonshotai/kimi-k2.6` | `09:15:30.576`–`09:15:31.448` | `FAILED` | none | all five: HTTP 404 at the configured inference path | unavailable |

Muse and Nemotron returned provider-reported total input/output usage. No smoke response exposed authoritative TTFT, billed cost or current-context occupancy. Catalogue-level price, rate limit and quota remained unknown. The fixed forced-tool probes passed on Muse and Nemotron; Agent Control verified the typed function name and marker without executing an external tool.

## Frozen model review

The controlled benchmark used normal provider execution, not the NVIDIA smoke-only request profile.

| Field | Evidence |
| --- | --- |
| Model | `nvidia/nemotron-3-super-120b-a12b` |
| Dynamic Agent Control model | `nvidia-hosted-nvidia-nemotron-3-super-120b-a12b-b358631a` |
| Batch | `evaluation-batch-1a5ab593-ddea-452b-9015-79443d49517b` |
| Frozen suite | `agent-control-real-work-v1` `1.0.0` |
| Suite SHA-256 | `8cb55e097d2e7fa5ebe36ed6ffc152e5639278f8c7ae4f886bab2ac553766062` |
| Execution | `2026-09-06T09:03:49.383Z`–`09:04:46.725Z` |
| Result | `PARTIAL` |
| Attempt records | 51 |
| Real provider calls | 9 passed / 0 failed |
| Capability-gated records | 42 `CAPABILITY_UNAVAILABLE` |
| Independently verified categories | coding ×3, code modification ×3, retrieval ×3 |
| Quality/reliability for exercised calls | 100/100 each; reliability 1.0 |
| Usage | 621 input + 3,349 output = 3,970 total (`PROVIDER_REPORTED`) |
| Elapsed provider time | 57,153 ms; mean successful call 6,350.33 ms |
| Retries | 0 |
| Cost/cache split/resources | unavailable |

The frozen tasks required useful bounded work: identify a JavaScript off-by-one correction, describe an `AbortSignal` cancellation change while preserving timeout classification, and retrieve the exact credential-node record from a bounded corpus. Existing deterministic scorers—not provider self-report—accepted all nine returned outcomes. Unsupported workflow/browser/computer/reviewer/schema/safety capabilities were recorded as unavailable rather than silently emulated.

The resulting route key is `nvidia-hosted/default/nvidia-hosted-nvidia-nemotron-3-super-120b-a12b-b358631a@controller/openai-compatible`. One partial batch is insufficient for conservative lifecycle promotion, so its model-intelligence state is `CANDIDATE`; catalogue routing remains disabled.

## Dashboard and durable reconciliation

An isolated loopback dashboard instance loaded the same protected catalogue and model-intelligence files; no live Agent Control deployment was replaced or modified.

- `GET /api/provider-catalog`: HTTP 200;
- provider: `CONFIGURED`, `AVAILABLE`, `SUCCEEDED`, 81 discovered, 81 currently listed, 0 routing eligible;
- Nemotron: `BENCHMARKED`, `CANDIDATE`, `LIMITED` smoke, reliability `1`, token efficiency `441.1111111111111` total tokens per successful task;
- `GET /api/events`: `text/event-stream`; a typed `provider.catalog_changed` event carried the provider ID and reconciled physical-evidence phase;
- SSE projection contained no authorization field;
- dashboard assets expose authenticated Discover, Smoke, Queue/Re-benchmark, Enable and Disable controls;
- Enable remains governed by `QUALIFIED`/`PREFERRED` intelligence plus explicit operator action.

The dashboard over-redaction defect was reproduced before the fix (`tokenEfficiency` became `[REDACTED]`) and the same live projection returned the numeric value after the fix. Credential fields remain redacted.

Durable runtime evidence resides outside Git under the configured owner-only Agent Control state directory:

- `models/provider-catalog.json` — discovery and final smoke records;
- `models/intelligence.json` — immutable frozen batch and attempt history;
- `capabilities/intelligence.json` — capability observations.

This source-controlled report is a sanitized reconciliation, not a copy of those state files.

## Scale estimate and routing decision

No full-catalogue benchmark was run.

- Smoke only: 81 models × 5 probes = **405 provider requests**. The final 20-request representative run took about 235 seconds, a naive serial extrapolation of about **79 minutes**. At the current 45-second per-probe timeout bound, the serial upper bound is about **5 h 3 m 45 s**, excluding overhead.
- Frozen review: 81 models × 51 attempt records = **4,131 records**. Ten suite tasks use model-structured execution with three repetitions, so at most **2,430 real provider calls** would be possible if every model advertised every required capability. At Nemotron's observed 6.35-second successful-call mean this is about **4.3 hours** serial; at each task's 120-second maximum it is **81 hours**, before non-provider workflow adapters and overhead. Capability gating would change the actual request count.

The figures are planning estimates, not a cost claim. NVIDIA supplied no authoritative pricing/quota/rate-limit data in these calls. A separate operator authorization is required before either mass operation.

No NVIDIA model is currently safe for production routing. Nemotron is the only benchmarked candidate in this run, but lacks complete capability coverage and sufficient repeated historical evidence. Muse is smoke-failed under the final bounded contract; MiniMax timed out; Kimi returned 404. Unknown cost is not free.

## Local-versus-hosted readiness

The generic benchmark architecture can compare a local OpenAI-compatible model and an NVIDIA-hosted model with the same frozen suite, scorer and accounting. No local endpoint in the examined configuration identifies the same Muse Glimmer version/weights/quantization, so equivalence was not claimed and no hosted-versus-local result exists. A future comparison must seal both exact artifacts and record any quantization/version difference.

## Validation

The final deterministic regression and documentation gates passed after the physical evidence and qualification-discovered fixes were frozen:

```bash
npm run check
git diff --check
```

- TypeScript: pass;
- bootstrap JavaScript and shell syntax: pass;
- dashboard JavaScript syntax: pass;
- infrastructure neutrality: 3/3 pass;
- implementation-status registry: 47/47 entries pass;
- complete deterministic suite: **867/867 pass**, 0 failed/cancelled/skipped;
- Markdown local links: **662/662 resolve** across 129 Markdown files;
- `git diff --check`: pass.

Credential scans covered the complete repository and the three NVIDIA catalogue/intelligence files without printing matching contents: no NVIDIA-key pattern and no persisted authorization/bearer material were detected. The real credential store was checked only through metadata; its value was not opened to manufacture leakage evidence.

## Remaining gate

The requested initial integration proof is complete, but NVIDIA routing qualification is not. The next decision is whether to authorize a larger, explicitly bounded benchmark plan. Until then the correct route action is **no change**: keep all NVIDIA models visible, historical and routing-disabled.

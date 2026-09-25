# Harness efficiency report

Generated: 2026-08-28T05:59:11.863Z

Classification: **DETERMINISTIC_HARNESS_SIMULATION_NOT_LIVE_MODEL_EVIDENCE**. This is a deterministic context-and-routing experiment using one frozen model identity; it is not live model, billing, latency or cache evidence.

Local packet-build and report overhead: **40.3 ms** (LOCAL_HARNESS_OVERHEAD_NOT_MODEL_LATENCY).

## Harness startup tax

Startup counts are deterministic estimates of persistent context. Task context is reported separately and provider billing behaviour is unknown.

| Profile | Median startup tokens | Median tool tokens | Median task-context tokens |
| --- | ---: | ---: | ---: |
| THIN | 774 | 137 | 600 |
| STANDARD | 3,665 | 541 | 2,150 |
| DEEP | 4,463 | 1,302 | 10,150 |

THIN median startup reduction versus STANDARD: **78.9%**.

## Execution

Fresh, cached, output and cost remain unknown because the benchmark did not invoke a provider.

| Task | Profile | Turns (simulated) | Fresh tokens | Cached tokens | Output | Cost | Verifier |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| trivial-value | THIN | 1 | unknown | unknown | unknown | unknown | PASS |
| trivial-value | STANDARD | 2 | unknown | unknown | unknown | unknown | PASS |
| trivial-value | DEEP | 3 | unknown | unknown | unknown | unknown | PASS |
| known-function | THIN | 1 | unknown | unknown | unknown | unknown | PASS |
| known-function | STANDARD | 2 | unknown | unknown | unknown | unknown | PASS |
| known-function | DEEP | 3 | unknown | unknown | unknown | unknown | PASS |
| single-dependency | THIN | 1 | unknown | unknown | unknown | unknown | PASS |
| single-dependency | STANDARD | 2 | unknown | unknown | unknown | unknown | PASS |
| single-dependency | DEEP | 3 | unknown | unknown | unknown | unknown | PASS |
| known-bug | THIN | 1 | unknown | unknown | unknown | unknown | PASS |
| known-bug | STANDARD | 2 | unknown | unknown | unknown | unknown | PASS |
| known-bug | DEEP | 3 | unknown | unknown | unknown | unknown | PASS |
| single-test-repair | THIN | 1 | unknown | unknown | unknown | unknown | PASS |
| single-test-repair | STANDARD | 2 | unknown | unknown | unknown | unknown | PASS |
| single-test-repair | DEEP | 3 | unknown | unknown | unknown | unknown | PASS |
| exact-search | THIN | 1 | unknown | unknown | unknown | unknown | PASS |
| exact-search | STANDARD | 2 | unknown | unknown | unknown | unknown | PASS |
| exact-search | DEEP | 3 | unknown | unknown | unknown | unknown | PASS |
| known-config | THIN | 1 | unknown | unknown | unknown | unknown | PASS |
| known-config | STANDARD | 2 | unknown | unknown | unknown | unknown | PASS |
| known-config | DEEP | 3 | unknown | unknown | unknown | unknown | PASS |
| known-doc | THIN | 1 | unknown | unknown | unknown | unknown | PASS |
| known-doc | STANDARD | 2 | unknown | unknown | unknown | unknown | PASS |
| known-doc | DEEP | 3 | unknown | unknown | unknown | unknown | PASS |
| two-file-contract | THIN | 1 | unknown | unknown | unknown | unknown | PASS |
| two-file-contract | STANDARD | 2 | unknown | unknown | unknown | unknown | PASS |
| two-file-contract | DEEP | 3 | unknown | unknown | unknown | unknown | PASS |
| schema-migration-plan | THIN | 1 | unknown | unknown | unknown | unknown | FAIL |
| schema-migration-plan | STANDARD | 2 | unknown | unknown | unknown | unknown | PASS |
| schema-migration-plan | DEEP | 3 | unknown | unknown | unknown | unknown | PASS |
| cross-module-bug | THIN | 1 | unknown | unknown | unknown | unknown | FAIL |
| cross-module-bug | STANDARD | 2 | unknown | unknown | unknown | unknown | PASS |
| cross-module-bug | DEEP | 3 | unknown | unknown | unknown | unknown | PASS |
| broad-symbol-search | THIN | 1 | unknown | unknown | unknown | unknown | FAIL |
| broad-symbol-search | STANDARD | 2 | unknown | unknown | unknown | unknown | PASS |
| broad-symbol-search | DEEP | 3 | unknown | unknown | unknown | unknown | PASS |
| compiler-diagnostic | THIN | 0 | unknown | unknown | unknown | unknown | FAIL |
| compiler-diagnostic | STANDARD | 2 | unknown | unknown | unknown | unknown | PASS |
| compiler-diagnostic | DEEP | 3 | unknown | unknown | unknown | unknown | PASS |
| multi-file-feature | THIN | 0 | unknown | unknown | unknown | unknown | FAIL |
| multi-file-feature | STANDARD | 2 | unknown | unknown | unknown | unknown | PASS |
| multi-file-feature | DEEP | 3 | unknown | unknown | unknown | unknown | PASS |
| provider-adapter | THIN | 0 | unknown | unknown | unknown | unknown | FAIL |
| provider-adapter | STANDARD | 2 | unknown | unknown | unknown | unknown | PASS |
| provider-adapter | DEEP | 3 | unknown | unknown | unknown | unknown | PASS |
| race-diagnosis | THIN | 0 | unknown | unknown | unknown | unknown | FAIL |
| race-diagnosis | STANDARD | 1 | unknown | unknown | unknown | unknown | FAIL |
| race-diagnosis | DEEP | 3 | unknown | unknown | unknown | unknown | PASS |
| scheduler-architecture | THIN | 0 | unknown | unknown | unknown | unknown | FAIL |
| scheduler-architecture | STANDARD | 1 | unknown | unknown | unknown | unknown | FAIL |
| scheduler-architecture | DEEP | 3 | unknown | unknown | unknown | unknown | PASS |
| security-boundary | THIN | 0 | unknown | unknown | unknown | unknown | FAIL |
| security-boundary | STANDARD | 1 | unknown | unknown | unknown | unknown | FAIL |
| security-boundary | DEEP | 3 | unknown | unknown | unknown | unknown | PASS |
| recovery-redesign | THIN | 0 | unknown | unknown | unknown | unknown | FAIL |
| recovery-redesign | STANDARD | 1 | unknown | unknown | unknown | unknown | FAIL |
| recovery-redesign | DEEP | 3 | unknown | unknown | unknown | unknown | PASS |
| cross-service-change | THIN | 0 | unknown | unknown | unknown | unknown | FAIL |
| cross-service-change | STANDARD | 1 | unknown | unknown | unknown | unknown | FAIL |
| cross-service-change | DEEP | 3 | unknown | unknown | unknown | unknown | PASS |

## Efficiency

| Profile | Deterministic verifier success | Median effective estimated tokens | Median cost | Median time | Cost / verified success |
| --- | ---: | ---: | ---: | ---: | ---: |
| THIN | 45.0% | 1,577 | unknown | unknown | unknown |
| STANDARD | 75.0% | 13,281 | unknown | unknown | unknown |
| DEEP | 100.0% | 55,259 | unknown | unknown | unknown |

- THIN passed 100.0% of jobs frozen as bounded/THIN-suitable, but failed jobs requiring wider context.
- STANDARD verified 6 additional tasks beyond THIN.
- DEEP verified 5 additional architectural/high-ambiguity tasks beyond STANDARD.
- Automatic routing supported by this evidence: **NO**. The frozen run proves deterministic packet, routing and verifier behaviour, but it did not execute a live model or observe provider billing/cache usage.

## Largest context contributors

Task-selected repository context dominates DEEP workloads. Persistent workspace/bootstrap, shared memory, conversation history and optional tool material are repeatedly injected in STANDARD/DEEP; THIN filters these unless required. Token-aware search and selected expansion remain the preferred way to retrieve repository evidence.

## Limitations

No provider was invoked in this deterministic run, so fresh/cached/cache-write/reasoning tokens, price data and cost per verified outcome are null in its authoritative JSON. The companion controlled live report records real same-model token, cache and latency evidence, but it is not repository-mutation evidence and therefore does not production-qualify automatic routing.

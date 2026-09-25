# Real repository-mutation harness qualification

Generated: 2026-08-28T07:54:06.967Z

Classification: **LIVE_SAME_MODEL_REAL_REPOSITORY_MUTATION_EXPERIMENT**. The same live model/provider was used across strategies. Every attempt ran against a fresh disposable Git fixture and was independently verified, whether or not it produced a mutation. The canonical Agent Control repository was not used as an agent mutation target.

## Strategy results

| Strategy | Tasks | Verified | Success | Median initial provider input | Fresh input | Cached input | Cache | Output | Fresh / verified outcome | Processed / verified outcome | Median latency ms | Escalations | Verifier failures | Timeouts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| THIN_ONLY | 12 | 0 | 0.0% | 1,452 | 14,168 | 46,164 | 76.5% | 2,425 | unknown | unknown | 5292 | 0 | 10 | 0 |
| STANDARD_ONLY | 12 | 2 | 16.7% | 2,168 | 23,929 | 83,859 | 77.8% | 4,340 | 11,965 | 56,064 | 7367 | 0 | 10 | 0 |
| DEEP_ONLY | 12 | 2 | 16.7% | 2,666 | 29,862 | 142,473 | 82.7% | 5,907 | 14,931 | 89,121 | 9220 | 0 | 10 | 0 |
| ADAPTIVE_THIN_STANDARD_DEEP | 12 | 2 | 16.7% | 2,352 | 77,279 | 418,063 | 84.4% | 15,084 | 38,640 | 255,213 | 30027 | 23 | 31 | 0 |
| PREDICTED_ADAPTIVE | 0 | 0 | 0.0% | unknown | unknown | unknown | unknown | unknown | unknown | unknown | 0 | 0 | 0 | 0 |

## Outcomes

| Task | Strategy | Predicted | Start | Final | Attempts | Verifier | Fresh | Cached | Latency ms |
| --- | --- | --- | --- | --- | ---: | --- | ---: | ---: | ---: |
| MUT-001 | THIN_ONLY | THIN | THIN | THIN | 1 | FAIL | 321 | 4,298 | 3690 |
| MUT-002 | THIN_ONLY | THIN | THIN | THIN | 1 | FAIL | 1,167 | 3,551 | 4724 |
| MUT-003 | THIN_ONLY | THIN | THIN | THIN | 1 | FAIL | 951 | 3,359 | 6132 |
| MUT-004 | THIN_ONLY | THIN | THIN | THIN | 1 | FAIL | 1,231 | 3,814 | 5184 |
| MUT-005 | THIN_ONLY | STANDARD | THIN | THIN | 1 | FAIL | 1,309 | 3,920 | 9974 |
| MUT-006 | THIN_ONLY | STANDARD | THIN | THIN | 1 | FAIL | 1,370 | 4,077 | 7359 |
| MUT-007 | THIN_ONLY | STANDARD | THIN | THIN | 1 | FAIL | 982 | 3,395 | 5320 |
| MUT-008 | THIN_ONLY | STANDARD | THIN | THIN | 1 | FAIL | 1,400 | 4,050 | 5133 |
| MUT-009 | THIN_ONLY | DEEP | THIN | THIN | 1 | FAIL | 1,365 | 3,900 | 5222 |
| MUT-010 | THIN_ONLY | DEEP | THIN | THIN | 1 | FAIL | 1,290 | 3,810 | 7186 |
| MUT-011 | THIN_ONLY | DEEP | THIN | THIN | 1 | FAIL | 1,386 | 3,865 | 5264 |
| MUT-012 | THIN_ONLY | DEEP | THIN | THIN | 1 | FAIL | 1,396 | 4,125 | 5497 |
| MUT-001 | STANDARD_ONLY | THIN | STANDARD | STANDARD | 1 | PASS | 402 | 6,380 | 4063 |
| MUT-002 | STANDARD_ONLY | THIN | STANDARD | STANDARD | 1 | FAIL | 1,883 | 11,143 | 23172 |
| MUT-003 | STANDARD_ONLY | THIN | STANDARD | STANDARD | 1 | FAIL | 2,488 | 5,481 | 13232 |
| MUT-004 | STANDARD_ONLY | THIN | STANDARD | STANDARD | 1 | FAIL | 2,813 | 11,778 | 14664 |
| MUT-005 | STANDARD_ONLY | STANDARD | STANDARD | STANDARD | 1 | FAIL | 1,908 | 5,498 | 10895 |
| MUT-006 | STANDARD_ONLY | STANDARD | STANDARD | STANDARD | 1 | FAIL | 1,870 | 2,912 | 5474 |
| MUT-007 | STANDARD_ONLY | STANDARD | STANDARD | STANDARD | 1 | FAIL | 1,581 | 2,644 | 5497 |
| MUT-008 | STANDARD_ONLY | STANDARD | STANDARD | STANDARD | 1 | FAIL | 2,201 | 5,427 | 6350 |
| MUT-009 | STANDARD_ONLY | DEEP | STANDARD | STANDARD | 1 | FAIL | 1,768 | 2,750 | 5118 |
| MUT-010 | STANDARD_ONLY | DEEP | STANDARD | STANDARD | 1 | FAIL | 1,786 | 2,842 | 6908 |
| MUT-011 | STANDARD_ONLY | DEEP | STANDARD | STANDARD | 1 | PASS | 2,381 | 8,076 | 7826 |
| MUT-012 | STANDARD_ONLY | DEEP | STANDARD | STANDARD | 1 | FAIL | 2,848 | 18,928 | 18626 |
| MUT-001 | DEEP_ONLY | THIN | DEEP | DEEP | 1 | PASS | 403 | 7,906 | 4477 |
| MUT-002 | DEEP_ONLY | THIN | DEEP | DEEP | 1 | FAIL | 2,663 | 8,957 | 7263 |
| MUT-003 | DEEP_ONLY | THIN | DEEP | DEEP | 1 | FAIL | 2,721 | 6,322 | 12240 |
| MUT-004 | DEEP_ONLY | THIN | DEEP | DEEP | 1 | FAIL | 2,678 | 13,037 | 10835 |
| MUT-005 | DEEP_ONLY | STANDARD | DEEP | DEEP | 1 | FAIL | 2,354 | 3,330 | 9713 |
| MUT-006 | DEEP_ONLY | STANDARD | DEEP | DEEP | 1 | FAIL | 2,368 | 3,410 | 6074 |
| MUT-007 | DEEP_ONLY | STANDARD | DEEP | DEEP | 1 | FAIL | 2,738 | 8,829 | 23705 |
| MUT-008 | DEEP_ONLY | STANDARD | DEEP | DEEP | 1 | FAIL | 3,044 | 18,529 | 43989 |
| MUT-009 | DEEP_ONLY | DEEP | DEEP | DEEP | 1 | FAIL | 2,937 | 9,615 | 7788 |
| MUT-010 | DEEP_ONLY | DEEP | DEEP | DEEP | 1 | FAIL | 2,286 | 3,255 | 5931 |
| MUT-011 | DEEP_ONLY | DEEP | DEEP | DEEP | 1 | PASS | 2,747 | 9,331 | 8727 |
| MUT-012 | DEEP_ONLY | DEEP | DEEP | DEEP | 1 | FAIL | 2,923 | 49,952 | 22098 |
| MUT-001 | ADAPTIVE_THIN_STANDARD_DEEP | THIN | THIN | STANDARD | 2 | PASS | 2,447 | 12,100 | 12662 |
| MUT-002 | ADAPTIVE_THIN_STANDARD_DEEP | THIN | THIN | DEEP | 3 | FAIL | 6,806 | 25,249 | 23280 |
| MUT-003 | ADAPTIVE_THIN_STANDARD_DEEP | THIN | THIN | DEEP | 3 | FAIL | 7,889 | 32,428 | 66974 |
| MUT-004 | ADAPTIVE_THIN_STANDARD_DEEP | THIN | THIN | DEEP | 3 | FAIL | 6,478 | 32,474 | 27357 |
| MUT-005 | ADAPTIVE_THIN_STANDARD_DEEP | STANDARD | THIN | DEEP | 3 | FAIL | 5,609 | 41,431 | 41026 |
| MUT-006 | ADAPTIVE_THIN_STANDARD_DEEP | STANDARD | THIN | DEEP | 3 | FAIL | 7,886 | 49,550 | 55129 |
| MUT-007 | ADAPTIVE_THIN_STANDARD_DEEP | STANDARD | THIN | DEEP | 3 | FAIL | 5,874 | 38,882 | 54000 |
| MUT-008 | ADAPTIVE_THIN_STANDARD_DEEP | STANDARD | THIN | DEEP | 3 | FAIL | 7,079 | 42,463 | 39944 |
| MUT-009 | ADAPTIVE_THIN_STANDARD_DEEP | DEEP | THIN | DEEP | 3 | FAIL | 8,661 | 53,657 | 31433 |
| MUT-010 | ADAPTIVE_THIN_STANDARD_DEEP | DEEP | THIN | DEEP | 3 | FAIL | 5,562 | 22,960 | 22527 |
| MUT-011 | ADAPTIVE_THIN_STANDARD_DEEP | DEEP | THIN | DEEP | 3 | PASS | 6,950 | 22,418 | 22229 |
| MUT-012 | ADAPTIVE_THIN_STANDARD_DEEP | DEEP | THIN | DEEP | 3 | FAIL | 6,038 | 44,451 | 28621 |

## Production routing gate

| Criterion | Result | Evidence |
| --- | --- | --- |
| deterministic_real_mutation_sample | FAIL | 12 unique tasks observed; production minimum is 20. |
| no_verified_success_regression_vs_standard | PASS | adaptive 2/12; STANDARD 2/12. |
| bounded_classified_escalation | PASS | Adaptive chains are limited to unique THIN, STANDARD and DEEP attempts. |
| meaningful_cumulative_resource_improvement | FAIL | adaptive fresh/verified=38639.5; STANDARD=11964.5. |
| tool_policy_intact | PASS | Typed-tool policy denial qualification. |
| lease_and_ownership_fencing_intact | PASS | Stale lease and ownership generation qualification. |
| human_takeover_intact | PASS | Human precedence qualification. |
| standard_fallback_intact | PASS | Unqualified routing applies STANDARD. |
| provider_model_neutrality | PASS | No provider/model identity conditional introduced. |

Automatic production routing qualified: **NO**. Applied production behavior remains **OBSERVATIONAL_STANDARD_FALLBACK**.

## Findings

- THIN preserved verified success for all bounded tasks: **NO**.
- STANDARD remains the fail-safe: **YES**.
- Immediate DEEP classification supported by this sample: **NO**.
- Adaptive escalation supported by this sample: **NO**.
- Monetary cost per verified outcome remains **unknown**. The qualified provider supplied no authoritative monetary pricing or provider-reported cost; token, energy and infrastructure measurements were not converted into fabricated currency.

## Cache and safety limitations

The protected provider cache was not reset. Provider-reported fresh/cached fields describe the observed warm state; cold-cache equivalence is unproven. All tools were typed and allowlisted through ToolPolicy; model completion was never treated as verifier acceptance. No unrestricted shell was exposed to the model.

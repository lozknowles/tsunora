# Workforce prototype R&D results

Classification: **EXPERIMENTAL / PASS WITH LIMITATIONS**. This is a deterministic worker/policy comparison, not a model leaderboard.

Frozen workload SHA-256: `9927fac2559bf20fdbf8f1e7f296a73814df7ad30378f5ca028c22ab26282a55`. 120 scenarios: 30 predeclared boundary families crossed with two tenants and two employee scopes. Successful cases contain expected state fields/values; negative cases contain expected terminal boundaries.

| Configuration | Boundary assertions passed | Verified completion | Approval pauses | Autonomous completion | Recovery | Unsafe mutations | Batch work time |
|---|---:|---:|---:|---:|---:|---:|---:|
| balanced-primary | 120/120 | 72/120 | 56/120 | 28/120 | 20/20 | 0 | 14.940 s |
| balanced-fallback | 100/120 | 52/120 | 56/120 | 28/120 | 0/20 | 0 | 14.445 s |
| review-all-primary | 120/120 | 72/120 | 84/120 | 0/120 | 20/20 | 0 | 15.230 s |

The recorded harness status is BLOCKED because it requires every configuration to pass all 120 expected boundaries. That original status is preserved. The primary configurations meet the boundary gate; the single-eligible-worker configuration does not. No failure was removed or reclassified as success.

The 20 failures are five fault families (worker/model/tool unavailability, timeout, scope violation) crossed with four synthetic scopes. With the primary identity offline, the remaining identity fails or is quarantined, so no eligible replacement remains. Jobs stay WAITING rather than silently succeed. This is a measured resilience limit, not an unsafe write or proof of a model quality difference.

Verified completion rates: 60.0%, 43.33%, 60.0%. Autonomous completion rates: 23.33%, 23.33%, 0%. Human escalation rates: 46.67%, 46.67%, 70.0%. Recovery success: 100%, 0%, 100% for the 20 declared recovery cases. Boundary-conformance rates: 100%, 83.33%, 100%. These are workload-specific rates containing deliberately rejected/ambiguous cases, not HR task success forecasts.

Fresh/cached/total tokens, cache reuse, monetary cost and energy: **UNKNOWN**; no model inference was executed. Recorded wall durations are host measurements, not simulated values and not comparable to future model runs without a controlled protocol. Actual worker IDs, attempts and placement rejections are retained per case. No CPU-efficiency or economic advantage is claimed.

Independent Python verification checked all 360 recorded executions, 196 verified completions, actual expected fields, artifact SHA-256 hashes and containment process cleanup records. It retained all 20 benchmark failures.

Local/API model, remote-worker, alternative agent-architecture and Lean/Standard/Deep comparisons: **BLOCKED / NOT IMPLEMENTED FOR THIS DOMAIN**. Existing generic capabilities are not relabelled as demonstrated workforce integrations.

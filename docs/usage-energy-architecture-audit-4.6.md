# Agent Control 4.6: combined usage and energy architecture audit

Status: source audit complete; combined implementation and physical qualification incomplete.
Date: 2026-09-13. Inspected candidate: 16ad618 (4.6.0-rc.1).

The repeated usage brief is byte-identical to its predecessor (SHA-256 4320c6d9f48cbb97306ad0da5ad235e3a877b6a8253ab43d5b4a33e25ee1ffc4). The power and energy extension is additive. They form one specification.

## Existing foundation to retain

| Existing component | Verified behavior | 4.6 integration decision |
| --- | --- | --- |
| src/control/harness-efficiency.ts | FileHarnessEfficiencyLedger persists invocation records, stable IDs, lifecycle updates, usage, optional pricing/resource evidence, verification and final outcome. | Keep this invocation ledger authoritative. Add optional accounting identity and provenance fields; preserve legacy rows and unknowns. |
| src/control/job-bootstrap.ts | Initializes the invocation ledger and energy telemetry store under the existing state root. | Extend this composition; introduce no separate accounting database. |
| src/control/cost-accounting.ts | Versioned operator-supplied pricing is copied into invocation accounting. Local electricity is represented separately from cloud cost. | Preserve historical price snapshots; add decimal arithmetic and explicit billing semantics/effective periods. |
| src/control/token-aware-baton-routing.ts | Maintains provider/model/node and parcel token projections from cumulative thread observations. | Reconcile by source invocation identity and cumulative revision. Never add these projections to their originating invocation totals. |
| src/control/energy-telemetry.ts | Existing persisted power baselines, execution energy records, scope, authority, parcel/stage/route links and routing evidence. | Extend existing energy records with measurement class, attribution, sensor identity and model/runtime/hardware identity. Keep old evidence intact. |
| src/control/resource-telemetry.ts | Resource summaries include optional energy and sample counts. | Reuse adapter measurement evidence; absence does not establish zero consumption. |
| src/control/web-server.ts | Existing efficiency, invocation and energy read endpoints. | Add one bounded, privacy-safe reporting projection over existing stores, used by dashboard and grounded POE. |
| assets/dashboard/dashboard-enhancements.js | Existing persistent usage and per-thread/parcel details. | Add first-class Usage & Cost navigation and retain existing diagnostic views. |
| src/control/llama-cpp-benchmark-adapter.ts | Real benchmark result captures usage and runtime/hardware identity; energyJoules currently remains null. | Instrument governed executions through the existing measurement path, retaining null when unavailable. |

## Concrete gaps found in inspected source

1. Both legacy and versioned price calculation use JavaScript floating-point arithmetic. A decimal representation is required for additive money totals and tariff calculations. Legacy numeric evidence must not be silently rewritten.
2. Generic normalization accepts several provider aliases, but fresh-token derivation subtracts cached input from input tokens. That is not a universal provider contract. Provider adapters must attest inclusive/exclusive cache and reasoning semantics before computing billing or savings. Unknown native fields stay unknown.
3. Stable invocation IDs and lifecycle completion exist, but the reporting layer still needs explicit retry-parent identity, immutable model/runtime revision, migration provenance, delayed-usage revision rules and coverage. Turn number alone does not prove a retry.
4. Current aggregation exposes overall and categorical summaries; a common query contract is needed for time windows, equivalent prior periods, currency-separated totals, identity-preserving model history, coverage and qualified outcome comparison.
5. Energy currently separates scope from authority, but lacks explicit overlapping-workload attribution. Component measurements must never be combined with whole-node measurements as additional electricity consumption.
6. The current power integration filters out null samples before trapezoidal integration, which can bridge a missing interval. The new path needs explicit gap handling and measured interval coverage, without changing historical evidence.
7. Baseline subtraction must validate node, scope, freshness, source and workload conditions. An explicitly supplied baseline currently does not receive all those checks. Sampling-based energy must expose its derived methodology separately from sensor measurement authority.
8. Local electricity has a simple scalar tariff; effective-dated tariffs, currency, attribution and unavailable coverage need a shared reporting contract. UPS load percentages must not become watts without a defensible conversion basis.
9. Read-only Home Assistant observation permission and exact approved sensor-to-machine bindings need to be carried through measurement provenance. Observation must not enable device control.
10. Usage reset/retention needs a separately reviewed implementation: confirmed accounting-only scope, auditable boundaries and preservation of qualification, jobs, configuration, credentials and Estate state. No reset was executed in this audit.

## Combined implementation architecture

The invocation ledger remains the accounting source. Existing energy execution records supply separate sensor evidence linked by invocation/parcel/stage and machine identity. A read-only Usage & Cost projection joins those records without creating another ledger or treating duplicate representations as additional consumption.

Every metric carries value, unit, source, authority and coverage. Missing is not zero. Monetary aggregates are grouped by currency and separate API cost from electricity. Measured, derived and estimated energy remain separately visible, with whole-node and component scope never conflated. Attribution is DEDICATED_MEASUREMENT, SHARED_ATTRIBUTED, ESTIMATED or NOT_ATTRIBUTABLE, supported by interval/concurrency evidence.

Historical rows retain the model, runtime, machine and pricing identity observed at execution. Migration adds source references and MIGRATED provenance in an idempotent projection or explicit versioned migration; it does not invent missing tokens, costs, energy or qualification. Usage accounting stores no prompt/response payloads. Public exports allowlist fields rather than serializing private execution details.

Dashboard, Process/Estate drill-down, POE answers and rules observations consume the same projection. Energy/cost observations do not themselves authorize routing or household control. Quality, capability, safety and approval gates remain authoritative.

## Implementation and verification order

1. Provider semantics, exact money, stable accounting identity, deduplication and coverage contracts.
2. Energy class/attribution, gap-aware integration, baseline validation and effective tariff calculations, all on existing stores.
3. Unified date/filter/group reporting, model history, cache savings and retry cost with explicit comparability requirements.
4. Usage & Cost dashboard, Energy views, existing Process/Estate links and grounded POE/rules observations.
5. Explicit retention/reset and provenance-preserving historical indexing.
6. Focused boundary tests, complete regression, browser qualification and genuine bounded physical measurements; publish only evidence that passed privacy review.

## Historical release boundary

The inspected docs/evidence/agent-control-4.5-release-closure-20260912.md explicitly reports NOT READY FOR 4.5 RELEASE. It retains specialist energy advantage DISPROVEN, warm-residency routing effect DISPROVEN and whole-node power BLOCKED_EXTERNAL. This is a verified statement about the repository's historical report, not a claim that the current deployed estate or a later 4.5.1 candidate was requalified.

No historical finding was changed. No model download, paid inference, physical energy experiment, deployment, merge, tag or release was performed for this audit. Existing separate model-download approval remains pending. The other 4.6 features and showcase evidence requirements remain in scope.

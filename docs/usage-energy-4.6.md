# Usage, cost and energy intelligence — 4.6 checkpoint

Status: **IMPLEMENTED CHECKPOINT; PHYSICAL ACCEPTANCE PARTIAL**. This is not a completed showcase release.

## Architecture

The accepted [architecture audit](usage-energy-architecture-audit-4.6.md) remains the design basis. `FileHarnessEfficiencyLedger` is the invocation/accounting source; the existing energy store holds separate measurement evidence. The reporting projection joins those stores in memory. No additional accounting database was introduced.

## Accounting

- Decimal-string API prices, amounts, cache savings and totals use integer arithmetic. Different currencies remain separate. Sensor-derived electricity charges explicitly round half up to 12 decimal places after interval aggregation; physical sensor precision is not improved by arithmetic precision.
- Provider contracts describe inclusive/exclusive cache, reasoning, total and billing semantics. Unknown contracts cannot establish derived fresh tokens or savings. Existing adapters without an attested contract retain UNKNOWN semantics.
- New observations carry native provenance; optional model/runtime/machine/request/parcel/baton and explicit parent/retry identities remain unknown when not supplied. Cumulative revisions update one identity and reject stale/conflicting updates and duplicate request identities.
- Historical indexing is idempotent, preserves attested identity and original request references, and marks rows MIGRATED. It does not reprice historical numeric evidence.

## Usage and cost

The common authenticated query supports UTC today, 7/30/90 days, month-to-date, all time and custom intervals, with provider/model/revision/agent/job/job-type/parcel/machine/runtime/local-or-API/outcome groups and filters. Totals include reported coverage. Job successes count executions rather than collapsing repeated job definitions.

Continuous collection coverage is not yet established by the existing stores. Previous-period observations are shown with that limitation; automatic percentage comparisons and projected month values stay unavailable. Selected historical qualifications do not represent all estate usage.

Provider prices, cache savings and retry cost have deterministic contract tests. No paid-provider billing reconciliation was physically qualified. Existing local services declare no API charge, while electricity remains separately unavailable. Missing currency is not filled with a guessed currency.

## Energy

The new measurement path records sensor identity, scope, measurement class, attribution, interval coverage, maximum sample gap, excluded intervals, concurrency evidence, model/runtime identity and methodology. It never bridges a missing sample. Baselines require matching machine/scope/sensor, freshness, idle state, method and conditions. Explicit baselines receive the same checks.

Effective-dated tariff intervals split observed power segments. Missing or overlapping tariffs prevent a monetary claim. Component energy is never added to whole-node electricity. The Home Assistant observation port requires an approved entity-to-resource binding and OBSERVE permission, accepts supported W/kW/Wh/kWh units and rejects percentages; it does not call control services.

GPU board power was sampled on the physical test host. Shared services prevented exclusive attribution; all selected physical records remain NOT_ATTRIBUTABLE for workload energy. Whole-node metering, CPU package permissions and an operator electricity tariff were unavailable. Therefore Wh per successful job, local electricity cost and local-versus-API energy superiority remain unqualified.

## Physical results

The selected native Work Parcels ran on two already resident local models, without downloads, paid API calls, service restarts or routing changes. Each retained provider usage, response hash, verifier result, canonical invocation identity and GPU observations. Native records are preserved separately from their indexed history view.

| Workload / model | Input | Output | Duration | Verifier | Observed GPU interval energy |
| --- | ---: | ---: | ---: | --- | ---: |
| Integer arithmetic / Qwen2.5-Coder-3B Q4_K_M | 44 | 3 | 192 ms | PASS | approximately 0.0011 Wh |
| Integer arithmetic / Qwen2.5-3B Q4_K_M | 44 | 3 | 351 ms | PASS | approximately 0.0033 Wh |
| Transaction reconciliation / Qwen2.5-Coder-3B Q4_K_M | 199 | 37 | 966 ms | FAIL: exact JSON contract | approximately 0.0151 Wh |
| Transaction reconciliation / Qwen2.5-3B Q4_K_M | 199 | 37 | 967 ms | FAIL: exact JSON contract | approximately 0.0145 Wh |
| Separate JSON-format reconciliation follow-up / coder model | 199 | 37 | 946 ms | FAIL | approximately 0.0150 Wh |

These are sampled GPU board intervals, **not energy attributable to those jobs**. Model artifact hashes describe files referenced by the resident processes; no new model-load attestation was performed. The arithmetic intervals used two boundary samples; reconciliation used three samples. That is insufficient for a statistically meaningful efficiency comparison. Both reconciliation failures remain failures; they do not blacklist either model family. The first two failed raw outputs were not retained, so those failures cannot be independently replayed from this evidence pack. A separately identified follow-up requested JSON-object formatting without changing the expected answer. It still returned fenced output and incorrect A/B totals; that [raw response is retained](../examples/showcase-4.6/usage/failed-reconciliation-json-mode.json). No failed result was changed into a pass.

The selected records reconcile to **685 input + 117 output = 802 total tokens**, five calls, two verified successful job executions and three failed exact-contract checks. The earlier attempt that deferred on GPU activity remains separate immutable evidence and is not silently included in this selected history.

[Canonical reporting snapshot](../examples/showcase-4.6/usage/projection.json) · [Physical summary](../examples/showcase-4.6/usage/summary.json) · [Idempotent history indexing proof](../examples/showcase-4.6/usage/history-index.json)

## Dashboard and integration

Eight actual dashboard views cover Overview, Trend, Breakdown, Cache and retries, Energy, Local versus API, Model history and Invocations. Drill-down uses the existing Process and Estate views. Crew navigation and the floating Mallow guide retain the existing artwork and POE system. The draggable guide can overlap table content at its default position; reposition it when necessary.

POE reads the canonical projection with period and grouping selection; a real deterministic POE conversation was exercised against selected physical evidence. Rule observations expose the same read-only totals and explicitly grant no routing authority. Model-backed conversational interpretation and automatic policy remediation were not qualified by this run.

### Real dashboard gallery

Captured from clean source commit `7494c2dce3296da531852e8f5f3545f8e89cfe0e`. The indexed rows are marked MIGRATED and link back to their preserved native qualification records.

[Real overview view](provenance/EXTERNAL-EVIDENCE.md)

[Real trend view](provenance/EXTERNAL-EVIDENCE.md)

[Real breakdown view](provenance/EXTERNAL-EVIDENCE.md)

[Real cache retries view](provenance/EXTERNAL-EVIDENCE.md)

[Real energy view](provenance/EXTERNAL-EVIDENCE.md)

[Real local vs api view](provenance/EXTERNAL-EVIDENCE.md)

[Real model history view](provenance/EXTERNAL-EVIDENCE.md)

[Real invocations view](provenance/EXTERNAL-EVIDENCE.md)

[Real invocation detail view](provenance/EXTERNAL-EVIDENCE.md)

[Real mobile view](provenance/EXTERNAL-EVIDENCE.md)

## Retention and reset

The UI and authenticated reset endpoint require the exact confirmation and current history digest. The reset hides existing usage observations and records an audit event in the existing ledger. Original execution, qualification, configuration, credentials and Estate evidence remain intact. This is a **visibility reset**, not physical erasure or a storage-compaction policy. It was tested only against isolated deterministic history, never against real retained history.

## Validation and remaining limits

Focused tests cover decimal addition, currencies/effective pricing, inclusive and exclusive cache, reasoning unknowns, revisions/deduplication, explicit retries, sample gaps, baselines, concurrency, tariffs, read-only Home Assistant bindings, isolated reset, migration, privacy, HTTP metric preservation, map links, POE and rules. The complete `npm run check` passed at `7494c2dce3296da531852e8f5f3545f8e89cfe0e`: **1,426 tests passed, zero failed or skipped**, including typecheck and repository checks. Strict qualification-script typechecking also passed. Test-log hashes, changed source files and screenshot checksums are recorded in the [checkpoint validation manifest](../examples/showcase-4.6/usage/validation.json). Subsequent publication changes contain documentation and evidence only.

The browser exercised all eight views, invocation detail, the native Process Map parcel link, Estate navigation and mobile layout, with no JavaScript errors. Captures are real; no fixture rows were inserted to populate them. Windows ran out of disk space during local evidence copying; authoritative evidence remains on the test host and selected allowlisted files are included here.

Remaining acceptance work includes paid/cached-provider billing evidence, authorised whole-node telemetry and tariffs, attributable energy on representative successful workloads, longer historical coverage, cross-machine comparability, wider provider-specific adapter attestation, hardware identity coverage, and independent raw-output replay for future failed qualification records. The reporting scan has an explicit capacity limit and is not a distributed accounting service. Existing governance/evidence stores retain their current single-writer assumptions.

Historical 4.5 specialist-energy advantage and warm-residency findings remain DISPROVEN; whole-node energy remains BLOCKED_EXTERNAL. No merge, tag, release or deployment was performed. The broader showcase gate remains incomplete.

## Subsequent physical closure

The [physical closure report](usage-energy-physical-closure-4.6.md) records new local runs, measured sample-gap behaviour, Mallow grounding and the explicit external billing/metering boundaries. The original evidence in this report remains unchanged.

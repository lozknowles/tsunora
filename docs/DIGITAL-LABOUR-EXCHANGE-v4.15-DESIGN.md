# Digital Labour Exchange v4.15 — implementation design

Baseline `9ffa265a5`. Isolated additive capability. No release, push, merge, deployment or protected service mutation authorised. Paperclip review completed before exchange code; recommended generic ownership, scope and completion techniques are incorporated below.

## Boundaries

Organisation owns policy/accounting. WorkOrder expresses outcome and verifier contract. DigitalWorker is a stable operational identity. ExecutionBackend is a registered adapter, separately revisioned from identity and model configuration. Bid is an expiring deterministic estimate. Broker filters eligibility then ranks expected complete-outcome cost. Verifier assesses actual output. Transaction represents one attempt; settlement aggregates every attempt for one WorkOrder. Ledger records ordered, hash-linked events and reconstructs read models.

Reuse existing qualification states (`UNTESTED`, `QUALIFYING`, `QUALIFIED`, `DEGRADED`, `DISABLED`, `FAILED`), containment supervisor, sealed execution scopes, owned process cleanup and dashboard authentication. Qualification is capability- and backend-revision-bound. An operator registration or self-claimed capability is insufficient. A trusted qualification path records actual execution and independent verifier results before enabling awards.

## Initial bounded implementation

Single controller/writer with exclusive storage ownership; no distributed-controller claim. Append and fsync decision events before dispatch. Duplicate WorkOrder IDs require the same input digest; an interrupted award remains unresolved and blocks automatic replay. Preserve evidence on uncertain cleanup and quarantine its worker. Ledger hash verification fails closed. Hash links do not protect against privileged wholesale rewrite without an external anchor.

Before tender and again before dispatch, check organisation, capability, tested qualification, permissions, status, concurrency, deadline, approved backend revision, execution scope and containment. Policy beats price. Track organisation reservations and reserve the WorkOrder maximum before execution. Only bounded adapters with enforceable internal tariffs may run in the first experiment. Do not equate an internal tariff with external provider billing. Unknown actual financial cost stays null.

Rank bids by execution charge + measured expected retry charge + verifier charge + declared risk/escalation allowance. Derive empirical estimates per job type from retained qualification/attempt observations. Include sample count and observed successes; do not claim precise reliability from small samples. Keep every bid and rejection reason. Deadline and remaining worst-case budget are admission constraints, not soft ranking bonuses.

At most one attempt per eligible worker per outcome, with an explicit attempt cap. On a failed verified attempt, retain all costs, exclude that attempt's worker, retender the same WorkOrder and contract against the remaining budget. No work is complete until verification passes. Failed attempts, verification and escalation are included exactly once; separate retry attribution from the arithmetic to avoid double counting.

## Physical workload

Use three independently executing deterministic worker programs, with different real implementations and at least two execution engines if safely available. This is an allowed worker type, not pretend LLM execution. Narrow capabilities may include numeric classification, record extraction/structured output and tool-mediated arithmetic. Do not claim coding or open-ended reasoning qualification unless actually tested. Freeze inputs/expected outputs and their digest before calibration. Keep calibration and held-out competition separate. Record process IDs, stdout/result digests, timestamps, backend revision, verifier evidence and measured wall time. No invented token or energy usage.

Declared internal tariffs can charge measured runtime with a bounded ceiling, but are accounting policy rather than physical energy cost. Run matched held-out brokerage, cheapest-raw-bid and fixed-worker alternatives. Report NOT YET DEMONSTRATED wherever actual paired evidence does not establish savings. A controlled process failure may test rebidding but must be excluded from unqualified natural-reliability or savings claims.

## Dashboard and evidence

Add Digital Workforce to the existing authenticated dashboard. Read live workers, orders, bids, award reasons, attempts, outcomes and totals from the same exchange runtime. Use actual event updates and existing bounded Video Evidence Mode; record timestamp/event/transaction overlays in the established style. No animated synthetic execution.

## Required checks

Regression suite in full; typecheck and source/distribution checks. Focused tests for duplicate/concurrent orders, stale backend qualification, scope/permission denial, quarantine and kill handling, unknown costs, insufficient budget, verifier failure, full-cost retry settlement, restart ambiguity, hash corruption, organisation mismatch and API authentication. Physical run must prove three real workers, competition, independent verification, failed-attempt retender, quarantine exclusion and evidence-backed runtime UI. Keep IMPLEMENTED, SIMULATED, PHYSICALLY QUALIFIED, BLOCKED and NOT TESTED distinct.

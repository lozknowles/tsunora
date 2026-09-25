# Evidence-driven adaptive multi-model orchestration

Agent Control's adaptive orchestration workstream adds evidence-conditioned route and workflow selection without making a provider, model or platform authoritative. It is an opt-in extension of the existing Work Parcel and model-registry lifecycle; it is not a second scheduler, provider abstraction or hidden model ranking.

The core flow is:

`request → classify → required capabilities → policy → eligible candidates → league evidence → cost/quality/latency trade-off → select route/workflow → execute → quality gate → verify → update evidence`

The persisted decision tree records operational facts at each step. It does not store private model reasoning. A previous decision is never regenerated from today's league data: the decision record stores its request fingerprint, policy snapshot, candidates, evidence consulted, scores, reasons, route history and outcomes.

## Configuration

The optional `adaptiveOrchestration` object is part of `.agent-control/config.json`. The dashboard's **Configuration → Adaptive routing** editor writes the same validated object through `POST /api/configuration/adaptive-orchestration`.

```json
{
  "adaptiveOrchestration": {
    "enabled": true,
    "minimumSamplesForPreference": 3,
    "minimumQualityScore": 0.7,
    "maxEvidenceAgeDays": 90,
    "policyQualityFloor": 0.6,
    "maxRouteCost": null,
    "maxRouteLatencyMs": null,
    "qualityWeight": 0.5,
    "reliabilityWeight": 0.2,
    "costWeight": 0.15,
    "latencyWeight": 0.1,
    "confidenceWeight": 0.05,
    "explorationRate": 0.1
  }
}
```

Omitted settings use these defaults. `maxRouteCost` and `maxRouteLatencyMs` are optional ceilings; `null` means no ceiling. Set `enabled` to `false` to keep normal model-registry routing while recording an explicit adaptive-policy exclusion. Configuration changes require the normal Agent Control restart boundary so the runtime and its persistent store use one policy snapshot.

Adaptive routing does not automatically rotate accounts, evade quotas or combine provider allowances. Account-aware routes remain `provider → account profile → model → execution node`, and the existing qualification, node, capability and credential-residency rules still apply.

## Model Capability League

Model evidence is grouped by task class and complete route identity, including provider, account profile, model, execution node and model version. A model that performs well at debugging is not thereby preferred for repository review. Rows retain:

- success and quality-gate pass rate;
- first-pass, retry and escalation rates;
- latency and recency/evidence-weighted per-observation input/output/total token means;
- cache efficiency;
- provider-reported or configured cost and local-compute cost where available;
- reliability, operational-failure rate, sample size and confidence;
- evidence age, trend, model version and counts by evidence class.

Per-observation means prevent a route from appearing more expensive merely because it has accumulated more samples. Work Parcel audit totals remain additive across every invocation and are the source for parcel-level consumption accounting.

Only verified quality outcomes update quality preference. `BENCHMARK`, `QUALIFICATION` and `PRODUCTION_WORK_PARCEL` observations remain separate in the durable store and dashboard. Provider, infrastructure, policy, cancellation and insufficient-evidence outcomes are still recorded operationally, but do not poison model quality scores.

Sparse evidence follows declared policy order until the minimum sample threshold is met. When more than one eligible route has some verified quality evidence but none has reached the preference threshold, `explorationRate` permits a bounded deterministic sample selected from the stable Work Parcel/stage seed; the same decision reproduces the same choice. Candidates with no verified quality evidence are not sampled ahead of declared order. Quality floors reject candidates whose established quality is below policy. Evidence is weighted by source class and decays with age; old records remain available for audit and historical reconstruction. Version changes form distinct route rows rather than silently inheriting current-model performance.

## Workflow League

Workflow evidence is maintained independently from model evidence. A workflow candidate is an entire strategy, identified by stable ID and version, and is evaluated for task class using quality, reliability, latency, cost, escalation and confidence. The implementation accepts registered strategy candidates from the Work Parcel lifecycle; it does not hard-code a list of providers or force a particular multi-model pattern.

The current Work Parcel coordinator records its normal strategy as `work-parcel-coordinator@1`, and repository review records `repository-review@1`. Future strategies can register candidates and outcomes without changing the model-provider contract. A workflow failure remains a workflow/operational observation and is not attributed to every model involved.

## Production lifecycle

The `WorkParcelCoordinator` creates a durable adaptive decision when a parcel is accepted or submitted. After planning, it updates the fingerprinted classification and model capabilities. Before a model-backed stage is dispatched, it presents qualified model routes and a workflow candidate to the adaptive runtime. The selected route is then passed to the existing `ModelRegistry` and `JobRuntime`; adaptive selection cannot bypass node placement, provider qualification, capability checks, locks, approvals, verification or retries.

For the parameterized repository-review path, the direct executor creates the same decision record for each immutable context chunk, observes provider invocations, records governor/baton/handoff operational nodes and records the independent repository-verification outcome. Token-aware baton routing remains the context-pressure authority; adaptive orchestration supplies evidence-conditioned route/workflow evidence where the existing lifecycle exposes candidates. The token runtime's aggregate parcel accounting and the adaptive runtime's verified outcome evidence are additive and use the same Work Parcel ID.

An external channel does not become a routing authority. Its redacted request-origin record follows the Work Parcel for transcript and response association, while this runtime still considers only qualified capability/policy candidates. A reroute or baton preserves provider/account/model/node provenance and cannot add template, tool or resource authority. The contract/handoff layer intersects requested authority with the source contract and retains its protected-resource envelope.

Operational failures are classified rather than scored as model failures. A provider timeout, unavailable node, policy rejection or cancellation is visible in the decision tree and retained for reliability analysis, while only an independently verified quality result can increase or decrease quality preference. Failed or uncertain work remains eligible for the existing review, repair, escalation and baton recovery controls.

## Dashboard and reports

The **Routing** tab reads:

- `GET /api/orchestration/models` for the filtered Model Capability League;
- `GET /api/orchestration/workflows` for the filtered Workflow League;
- `GET /api/orchestration/decisions` for persisted Work Parcel decisions.

Supported league filters are `taskClass`, `capability`, `providerId`, `modelId`, `modelVersion`, `location` (`local` or `remote`), `evidenceKind`, `minQuality`, `maxAgeDays` and `sort` (`quality`, `confidence`, `samples`, `cost`, `latency`, `reliability` or `recent`). Select a decision to expand timestamped, parent-linked nodes and their facts. From a parcel's Audit panel, **Open routing decision tree** opens the same record.

`GET /api/orchestration/decisions/:id/report` and `GET /api/parcels/:id/decision-report` return the persisted decision's machine-readable reconciliation counts, immutable evidence measurements and a human-readable operational report generated from those same records. Evidence references include route, workflow, outcome, verification, token, latency and cost authority data; no private reasoning is added. `GET /api/parcels/:id/decision-tree` returns the persisted decision itself. The standard authenticated SSE stream and five-second dashboard refresh keep the view current; adaptive records are never client-owned state.

## Evidence and recovery

The production store is `${AGENT_CONTROL_STATE_DIR}/adaptive-orchestration/state.json` (default `.agent-control/adaptive-orchestration/state.json`) and is written atomically with owner-only permissions. The snapshot contains decisions and both evidence classes. It contains identifiers, policy, scores, measurements and safe reason codes—not prompts beyond the existing Work Parcel record, provider responses, credentials or private reasoning.

The same Work Parcel can be reconstructed after restart from the parcel, Run, invocation and adaptive stores. A failed adaptive route does not erase the original route or its Work Parcel. A failed token-aware handoff preserves the source thread and uses the existing recovery path. If the adaptive store is absent, the normal registry route remains the authoritative fallback; if the adaptive policy is disabled, the decision record explicitly marks adaptive selection as excluded.

## Validation

Run the deterministic adaptive tests directly:

```bash
node --import tsx --test --test-concurrency=1 src/control/adaptive-orchestration.test.ts
```

Run the complete repository gate with `npm run check`. This includes TypeScript, shell/bootstrap checks, dashboard JavaScript syntax, infrastructure-neutrality/status checks and the full Node test suite. Physical provider qualification is a separate operator gate; passing deterministic tests does not claim that a particular provider or multi-model workflow has been physically qualified.

Implementation entry points are [`src/control/adaptive-orchestration.ts`](../src/control/adaptive-orchestration.ts), [`src/control/work-parcels.ts`](../src/control/work-parcels.ts), [`src/control/direct-repository-review-executor.ts`](../src/control/direct-repository-review-executor.ts), [`src/control/application-service.ts`](../src/control/application-service.ts), [`src/control/web-server.ts`](../src/control/web-server.ts) and [`assets/dashboard/dashboard-adaptive-orchestration.js`](../assets/dashboard/dashboard-adaptive-orchestration.js). The related token/context boundary is documented in [`token-aware-baton-routing.md`](token-aware-baton-routing.md).

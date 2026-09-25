# Experimental Labour Exchange operations

Status: bounded deterministic-worker proof. This is not a deployed production workforce.

## Architecture and use

The implementation is additive. Existing routing and Jobs keep their current path. A trusted host integration creates `LabourExchange` with its `LabourLedger` and the existing `ContainmentSupervisor`, registers organisations, execution backends, verifiers and initially unqualified workers, then executes qualification before accepting awards. Registration cannot inject a prequalified worker. The same runtime is passed to `startWebDashboard`.

`AGENT_CONTROL_LABOUR_EXCHANGE=1` enables an empty exchange in the normal web entrypoint, using the existing state directory and operator authentication. It does not silently turn every configured model into a worker. Trusted workforce registration is demonstrated by `scripts/qualify-labour-exchange.ts`.

Authenticated routes:

* `GET /api/labour-exchange`: actual projection, bids, attempts, outcomes and accounting.
* `GET /api/labour-exchange/events`: SSE using the existing operator token, with bounded transport backpressure.
* `POST /api/labour-exchange/orders`: submit a validated WorkOrder. Existing mutation authority and origin checks apply.
* `POST /api/labour-exchange/video-evidence`: bounded authenticated WebM capture storage when the host configures an evidence directory. The storage receipt is not an attestation of depicted events.

Use **Digital Workforce** in the existing dashboard. The view requires operator authentication and reads the configured exchange, not demo rows. Start Video Evidence before submitting work; stopping saves actual canvas frames to the configured evidence store and exposes browser download links. Video is bounded to 90 seconds / approximately 32 MiB by the shared helper.

## Reproduce the physical experiment

From the isolated candidate checkout, with its locked dependencies installed:

```sh
node --import tsx scripts/qualify-labour-exchange.ts /absolute/new/evidence-directory
```

The evidence directory must be fresh. The harness freezes `scripts/labour-workload.json`, registers three unqualified deterministic workers, starts a loopback-only instance of the existing dashboard and prints the selected port. This instance uses the deliberately non-production fixture token `labour-isolated-qualification`; never expose it publicly or reuse it for a real service.

Set `LABOUR_PYTHON` to an existing approved Python executable when it is not `/usr/bin/python3`. `LABOUR_PORT` optionally chooses a free loopback port. `LABOUR_VIDEO_ONLY=1` runs the nine broker-held-out cases instead of the full five-policy comparison, while retaining calibration and physical failure/governance checks. Do not present that reduced run as a full economic comparison.

After opening/authenticating the local dashboard and starting Video Evidence, create a file named `RUN` in the evidence directory. The harness executes actual programs, freezes outputs and writes `report.json`, `projection.json` and `events.jsonl`. Create `STOP` to close only that harness-owned dashboard and release its ledger lock.

The physical fault test deliberately sets a qualification-only hold in one child, then stops it through Agent Control owned-process cleanup. The subsequent containment test uses the existing kill supervisor and intentionally leaves admission stopped. Those failures are controlled qualification events, not ordinary reliability observations.

## Persistence and recovery

The ledger has one writer. A second writer fails on the exclusive lock. Restart with an accepted but unsettled order returns INTERRUPTED and retains its maximum-charge reservation. Never remove a stale lock or redispatch uncertain work merely to make a test pass. Reconcile execution ownership/effects and evidence first through the applicable operational authority. Production-grade reconciliation and multi-controller storage are not delivered by this experiment.

Quarantined workers receive no new awards or subsequent qualification cases. Backend changes retain identity/history but require compatible new qualification evidence. Existing containment remains authoritative; the exchange stop event persists across restart. There is intentionally no public endpoint that grants competence, widens permissions, changes a backend or clears quarantine.

Amounts are integer internal accounting units with an explicit currency and tariff basis. The demonstrated uniform tariff charges 10 millionths of GBP per started process and 2 per verifier call. Null external costs, tokens or energy must not be displayed as measured zero. A retry charge is already part of total completion cost.

## Handoff and authority

The candidate lives in the isolated `feature/v4.15-digital-labour-exchange-20260924` worktree. Consult the qualification report, Paperclip review and evidence hashes before integrating it. Qualification of these small deterministic tasks is not approval for production agents, cloud spend, external effects, service changes, a public release or the concurrent v4.15 speech integration.

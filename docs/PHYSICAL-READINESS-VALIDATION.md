# Physical readiness validation and Estate Map feedback

**PASS WITH LIMITATIONS.** Two representative live read-only jobs completed through Agent Control's JobRuntime, with independent artifact validation. A report-only job was correctly blocked before execution. The previous 28 capability matches did not establish operational executability. The new operational projection requires current supporting resources and a qualified, exact-digest execution contract; it does not weaken the capability evaluator.

## Job Library snapshot

Library v0.1.0, commit `0c72c8ca1cb897e100894babc2d1be437e4433f2`, 50 canonical definitions, unchanged. Assessment uses the pinned, hash-verified index and schema, and the selected verified manifests. All 50 chains and shortest paths are in `PHYSICAL-READINESS-ALL-JOBS.md`; the machine-readable checkpoint is in `evidence/physical-readiness-20260913.json`.

At the final validation snapshot on 13 September 2026:

| State | Count | Interpretation |
|---|---:|---|
| Declared-capability READY | 28 | Historical v2 meaning, preserved explicitly |
| Operational READY | 2 | Exact exercised live variants with bounded executor admission |
| Operational UNSUPPORTED | 48 | Missing capability and/or qualified execution contract |
| AUTHENTICATION REQUIRED | 0 jobs | One estate credential profile needs authentication; no job binding was invented for it |
| CONNECTOR REQUIRED | 3 | Overlapping gaps, not additional jobs |
| CREDENTIAL REQUIRED | 1 | Overlapping gap |
| APPROVAL REQUIRED | 8 | Orthogonal to technical readiness; all denied-action probes blocked |

These are **timestamped validation results, not enduring live state**. The local admission window is two minutes. Subsequent use must refresh observations and admission; the saved report cannot authorize a later run. All canonical definitions remain NOT_YET_QUALIFIED.

## Physical validation

Risk classification was persisted before dispatch. All 28 former READY entries declare low risk, read-only mutation level and zero billable-cost ceiling. The representative set covered host inspection, GPU inspection and report-only processing: disk-space-check, gpu-inspection and structured-extraction. No model inference, paid provider request, service mutation or external communication was performed.

| Selected job | Result | Final Agent Control run |
|---|---|---|
| disk-space-check | SUCCEEDED, live filesystem/CPU/memory observations, 90% disk-warning classification | `run-160f8ed4-cf84-40fa-9244-fbad7f2d6c00` |
| gpu-inspection | SUCCEEDED, live GPU totals and compute-process allocations | `run-8c249a68-b4fa-4ef2-9c81-5f8671a1a1c6` |
| structured-extraction | Admission blocked; serialization cannot perform extraction | No dispatch |

Unique jobs physically exercised: **2**. Final successful runs: **2**. Failed dispatched runs: **0**. Blocked selected jobs: **1**. Approval-denial validation jobs: **8**, each WAITING_FOR_APPROVAL with **zero handler calls**. These denial jobs are non-mutating boundary checks linked to the eight manifest digests, not attempts to deploy, delete, restart or modify a repository.

The exercise uses the library's documented **live-binding variants**, replacing synthetic facts with target-specific checks. Input, target, manifest digest and scoped read/output-write intent are retained in native run parameters. Outputs are checked against each published output schema and independent numeric/freshness assertions. Artifacts are SHA-256 protected by the native ArtifactStore. GPU subprocesses run through the owned-process boundary with a step timeout. GPU coverage is compute processes: graphics and driver allocations may remain unattributed. No full canonical fixture suite, model capability or general business-task qualification is claimed.

Preserved earlier evidence: one pre-dispatch harness parameter-schema rejection, then two successful observation-only preliminary runs and eight preliminary denial checks. The driver was corrected to declare its parameters and later to validate the canonical output envelope. Final runs above are separate records; no prior failure or result was overwritten. In total there were four successful live inspection runs across two job IDs; the final evidence set contains the two schema-validated runs.

## Readiness accuracy and generic corrections

All 28 earlier declarations had actual report-assembly capability evidence, but **none had an admitted external-library executor at initial preflight**. Therefore all 28 were false positives if presented as operational READY; they remain truthful as narrowly labelled capability matches. Two exact live variants now have execution evidence. The other **26 former READY jobs remain operationally unsupported**, including the directly checked extraction job. This does not claim that 26 jobs were physically attempted or failed.

Corrections implemented:

- `operationalReadiness` requires a controller-owned execution admission, exact job digest, implementation/artifact evidence, bounded expiry, matching capabilities, same-node resource placement for this local contract, current resource observations and a currently alive supporting machine. A stale host invalidates a longer-lived tool capability. Admissions never grant permission.
- `estateObservationState` reuses the Estate Map's resource-specific freshness windows. Future timestamps and configured-only claims cannot prove liveness. Rediscovery preserves the actual managed-node probe timestamp instead of refreshing old health. A successful executable status probe can establish availability while qualification remains DISCOVERED. Map attributes cannot overwrite computed liveness/qualification, and stale parent machines invalidate displayed child availability.
- Credential reference presence now yields FOUND/DISCOVERED, not AUTHENTICATED/QUALIFIED. HTTP catalogue/endpoint success remains HEALTHY/DISCOVERED: reachable is not capability-qualified. Historical configured model qualification claims are preserved, but do not become authoritative live evidence.
- `projectJobEstateMap` extends the existing graph schema with job → requirement → evidenced resource relationships. It exposes capabilities provided, jobs depending on a resource, jobs actually enabled, ready/approval-required jobs, and active/recent native run references. Missing capability requirements do not invent resource edges.
- The existing application service can receive a `jobLibraryReadiness(scan, now)` projection callback. Its existing protected Estate Map API can then return these relationships. No alternate dashboard, route selection, live service wiring or deployment was introduced.

The old v2 result remains explicitly a declared-capability projection for compatibility. Operational consumers must use the new projection; they must not relabel v2 READY as executable. Neither projection directly dispatches a job. Input validation, budget, current target scope, adapter identity and approval remain launch gates.

## Fresh estate and coverage

Fresh 4.5 discovery completed at **2026-09-13 03:15:16 UTC**, scan `discovery-25faa687-2d7f-4d3f-85fe-0076e416e77e`, immediately before the final physical run set. Discovery ran in the isolated development checkout using the existing primary service's configuration read-only. The running primary service uses an older release; it was not upgraded or restarted.

Resources discovered: **16**. Alive from current observation: **6**. Stale at that snapshot: **0**. Not currently verified alive: **10**. Recorded QUALIFIED lifecycle: **1**, a configuration-only model claim, **not fresh physical qualification**. Other non-qualified lifecycle records: **15** (including two ACTIVE route records, which are not capability qualification). Fresh authoritative resource qualification corroborations: **0**. Authentication required: **1** configured account profile. Scoped executor admission proofs: **2**, recorded separately from estate lifecycle and canonical-job qualification.

Observed: one physical controller, one additional configured logical machine, one GPU, one responding local model endpoint, an enumerated local model, an authenticated coding CLI, configured provider/model/route records, two credential-status records, two configured workers and two probe tools. The coding CLI authentication result does not authenticate a different configured account profile. A model list does not establish model.invoke.

The built-in scan looked for the supported local runtime/agent executables (including Ollama and Claude), their fixed local endpoints, configured resources/providers and an existing custom-adapter registry. No additional supported executable or enabled custom adapter was found in that inspected process/configuration context. No MCP connector inventory was registered there. This is **not proof of global absence**: alternative paths, other service configurations, private endpoints and remote estates may require explicit discovery/adapter bindings. The SSH transport used to access development is not automatically a Job Library ssh.read binding. No mobile discovery adapter was selected; mobile/edge validation was deliberately left outside this parcel. No device was changed.

## Unsupported jobs and authentication/connector gaps

All 22 original unsupported jobs remain unsupported. Missing requirements are enumerated per job in the accompanying 50-job report. They are predominantly **unqualified or unbound**, not demonstrated impossible:

- code.execute: an authenticated coding CLI is observed; qualify its governed repository/action contract before binding it.
- model.invoke: a local model is enumerated; qualify bounded inference/output before binding it.
- http.read: local GET works; admit a reviewed target-specific HTTP connector contract. No installation is shown necessary.
- service inspection/control, deployment, checkpoint, pause/resume, scheduler and multi-worker execution: platform mechanisms exist or are plausible, but external-library admission and independent capability proof are missing. Qualify safe/disposable contracts instead of inferring from installation.
- Destructive and remote-control capabilities retain their approval/connector/credential boundaries.

The three connector gaps affect discover-models/http, endpoint-health/http and home-entity-control/home-assistant. The one credential gap is home-entity-control/home-assistant-token. The inspected configuration supplies no governed reference for that requirement; no secret was fetched or acquired. The separate configured coding-account authentication problem is visible as AUTHENTICATION REQUIRED at the estate level, not silently transferred to unrelated jobs. Inbox triage and the synthetic missing-credential scenario do not declare live email or credential dependencies.

## Verification and repository checkpoint

Typecheck and **100 focused/relevant tests passed**. Tests cover operational admission, expired/mismatched proof, stale parents, configured/future/offline observations, authentication-specific gaps, credential presence, endpoint-only discovery, immutable computed map fields, graph relationships and the existing Estate Map service hook, alongside existing capability, catalogue, native discovery, adapter, JobRuntime and neutrality suites. The log accompanies the output checkpoint.

One existing neutrality test exposed a private worktree path in the previous parcel's committed report. That path was replaced with a neutral placeholder; no test was weakened. All changes are on `feature/4.5-physical-readiness`, based on `d6b7b8ab5547ded0bb1ca7e388f3d957180aaac0`. The library repository and published release are unchanged.

No merge, tag, release, deployment, production restart, routing change, software installation or credential acquisition occurred. Moto was not modified. Native run ledgers, selection/admission snapshots, immutable artifacts, raw private discovery and intermediate attempts remain outside the source repository; the committed checkpoint contains concise provenance and job impact evidence.

# Capability binding assessment — 13 September 2026

**Verdict: PASS WITH LIMITATIONS.** Native discovery now supports evidence-backed, explainable assessment of all 50 published job manifests. This is declared-capability readiness; it is not execution admission or proof that a worker can solve each business objective.

## Root cause and changes

The previous evaluator required explicit mappings to QUALIFIED/ACTIVE resources while successful native discovery emitted DISCOVERED resources and supplied no mappings. All 50 jobs require evidence.report, so all failed. It also added an execution-grant approval gap and a reviewed-job-adapter configuration gap unconditionally. The manifest schema requires explicit approval and has no approval default: 8 jobs declare true, 42 false. The catalogue matches the manifests. These were Agent Control projection defects, not corrupt catalogue normalization.

The replacement derives capability evidence from inspectable, exact-probe rules. Evidence links the originating native observation/fingerprint, resource/node, rule/digest, timestamp, TTL and outcome. Declared/observed capabilities cannot satisfy requirements. Successful proof becomes VERIFIED; stale/future/malformed evidence or failed probes cannot remain ready. Adapter approval lifecycle and qualification records are untouched. Existing version probes do not establish arbitrary declared capabilities.

Approval is now orthogonal to technical readiness. Consequential permissions and high/critical risk still require approval even if a declaration were false. Scope-bound execution permission is always a separate launch gate. Scenario inputs and target choices are launch parameters, not installation failures. Genuine operator configuration keys can be represented by a reviewed digest-bound contract. No generic configuredJobs list is needed merely to inspect readiness.

Spec 1.0 has no placement field: default COLOCATED across all required capabilities/connectors/credentials. DISTRIBUTED requires an explicit reviewed contract bound to the exact job digest. Routing and provider/model choice are absent from the result.

## Source and fresh estate

Library v0.1.0 at `0c72c8ca1cb897e100894babc2d1be437e4433f2`; specification 1.0.0. The pinned index and schema hashes were checked, and all 50 canonical manifests were fetched and verified against their payload hashes. No clone or executable payload was needed. No library changes or new release were necessary.

Fresh native scan `discovery-a1a233f2-22bd-4530-b3c6-7b22429207b1`, completed **2026-09-13 02:54:14.421 UTC**, status COMPLETED. Scope: one Linux development controller and one NVIDIA GPU, plus two probe-tool observations. No remote, provider, credential-store, memory or mobile adapters were selected. Private machine labels and raw discovery remain outside the repository.

Verified capabilities:

| Capability | Current evidence | Expiry policy |
|---|---|---|
| host.inspect | Native OS CPU/memory and successful filesystem statistics | 1 hour |
| gpu.inspect | Successful GPU usage and compute-process inspection queries | 5 minutes |
| evidence.report | Report assembly, provenance and digest round trip | 24 hours |

GPU process inspection covers the compute-process query; it is not a physical execution of the GPU-analysis job. Report assembly is not reasoning or model-generation evidence.

## Actual counts

| Technical primary state | Jobs |
|---|---:|
| READY | 28 |
| UNSUPPORTED | 22 |
| CONFIGURATION_REQUIRED | 0 |
| CONNECTOR_REQUIRED | 0 |
| CREDENTIAL_REQUIRED | 0 |
| BLOCKED | 0 |

All gaps are retained: 22 jobs have unsupported capabilities, 3 also require connectors, and 1 also requires a credential. Connector/credential primary counts are zero because those same jobs have higher-precedence capability gaps. APPROVAL_REQUIRED is orthogonal: **8 required, 42 not required**. None receives an execution grant. All **50 remain NOT_YET_QUALIFIED**.

All 50 have a required scenario input; 25 additionally declare target selection. Three of those target-based jobs match current capabilities: machine-health, disk-space-check and gpu-inspection. The other 25 READY results require only report assembly in their published manifests. Individual results and full evidence traces are in readiness-report.json.

## Representative explanations

| Job | Technical assessment | Explanation / authority |
|---|---|---|
| machine-health | READY | host.inspect and evidence.report verified on controller; scenario and target selection required; no consequential approval |
| gpu-inspection | READY | GPU probe linked to physical GPU observation plus report assembly; scenario and target required; no consequential approval |
| inbox-triage | READY against declared capabilities | Only evidence.report is declared. Supplied scenario remains required. This does not establish email connectivity or triage accuracy |
| endpoint-health | UNSUPPORTED + CONNECTOR_REQUIRED | http.read unverified; required http connector has no verified installed/configured/authenticated binding |
| home-entity-control | UNSUPPORTED + CONNECTOR_REQUIRED + CREDENTIAL_REQUIRED | home-assistant.control unverified; home-assistant connector and authorized home-assistant-token reference absent; approval also required |
| compare-models | UNSUPPORTED | No model.invoke proof; neither a model nor provider was selected |
| fix-failing-test | UNSUPPORTED; APPROVAL_REQUIRED | code.execute unverified; repository mutation still requires consequential approval |

No job has a primary credential-only result in the observed estate. The focused tests establish that presence without scoped authorization remains CREDENTIAL_REQUIRED, and connector installation without configuration/authentication remains CONNECTOR_REQUIRED. These tests are synthetic, not credential or connector qualification.

## Verification

**53/53 tests passed:** 19 new focused tests plus 34 existing catalogue, native discovery/web, adapter registry, reference action, governed Git and infrastructure-neutrality tests. Covered observed/declared versus verified proof, TTL, future and failed evidence, missing capabilities, inputs/configuration, authority independence, connectors, credentials/scopes, distributed placement, full colocation including credentials, provider-neutral requirements, explanation traces, malformed rules, partial scans, resource counts and public evaluator integration. Probes use fixed read-only queries and never imply execution authority.

`npm run typecheck` passed. `node --check scripts/capability-binding.mjs` passed. The new implementation and driver were searched for all prohibited estate/provider names: no matches. The NVIDIA-specific probe is isolated to its detector and produces the generic gpu.inspect requirement. Existing infrastructure-neutrality tests also passed. Full Agent Control check and physical/distributed qualification were not run for this bounded parcel.

## Repository changes

Agent Control branch `feature/4.5-capability-binding`, isolated from clean base `9f0f9738ce79340dcef511786d481fc2b1cae4fc` in `ISOLATED_DEVELOPMENT_WORKTREE`. Existing 4.5 dependencies were reused through a read-only node_modules link. No dependency or lockfile changes.

Files: `scripts/capability-binding.mjs`, `scripts/capability-binding.test.mjs`, `scripts/assess-external-job-library.ts`, `src/control/readiness-probes.ts`, `src/control/readiness-probes.test.ts`; public evaluator export and explicit historical imports in `scripts/external-job-catalogue.mjs`, `scripts/external-job-catalogue.test.mjs`, `scripts/test-external-job-catalogue.ts`; documentation `docs/CAPABILITY-BINDING-ROOT-CAUSE.md`, `docs/CAPABILITY-BINDING.md`, `docs/CAPABILITY-BINDING-RESULTS.md`.

## Boundaries and limitations

No canonical Job Library jobs executed. No qualification status changed. No production deployment/restart or runtime routing change. Moto qualification and historical packaging evidence were not disturbed. No services or other checkouts were modified.

The 28 READY results match published, scenario-based capability declarations. They do **not** establish working end-to-end job adapters, reasoning quality, live data integrations or budget/authority admission. The universal report capability is weakly specified in v0.1.0 and cannot stand in for those missing requirements. Live variants need precise capability/input declarations before launch. The current driver is an explicit read-only development assessment, not a deployed dashboard integration. Multi-machine satisfaction and connector/credential handling are fixture-tested only; fresh evidence covers one controller. These are the reasons for PASS WITH LIMITATIONS.

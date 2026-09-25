# Agent Control 4.5 external catalogue access

**Result: PASS WITH LIMITATIONS.** A bounded consumer running alongside the actual Agent Control 4.5 implementation retrieved and validated the external library, answered catalogue queries and assessed native Estate Discovery records. No library jobs were executed. This is not physical job qualification.

## Published identity and integrity

| Item | Verified value |
|---|---|
| Repository | https://github.com/lozknowles/agent-control-jobs |
| Release | v0.1.0 |
| Immutable commit | `0c72c8ca1cb897e100894babc2d1be437e4433f2` |
| Library version | 0.1.0 |
| Catalogue / job specification | 1.0.0 / 1.0.0 |
| Canonical jobs / suites | 50 / 12 |
| Catalogue SHA-256 | `6c340a30d7a5bf13f63a62f8e62b00d2ac4926c7a2c3d9ec03f06406bbd9f7cc` |
| Agent Control baseline | `c50fcfae87404c0e83609c63964ae2922bd94c66` (4.5.0) |

The GitHub release and tag were retrieved afresh, and the tag resolved to the expected commit. The commit's Git tree authenticated the catalogue, job/suite schemas, version metadata and all 12 suite files by Git blob hash. All 50 composite job digests were recomputed from the catalogue's declared per-file hashes. Eight individual manifests were separately fetched and checked against their SHA-256 and inline catalogue metadata. Other payload files were not downloaded or executed: this is catalogue and manifest validation, not a full payload qualification.

The consumer bounds response size and time, rejects redirects and unsafe paths, validates schema/version and duplicate identities, and requires a pinned source digest. Source integrity means correspondence to the operator-selected immutable commit; it does not make its content executable or intrinsically trusted.

## Lightweight access

One raw HTTPS request to the commit-pinned `catalogue/index.json` discovers all jobs and their metadata. No repository clone, history, evidence archive, prompts or executable validators are needed.

| Measurement | Bytes |
|---|---:|
| Catalogue gzip response body, server Content-Length | 27,784 |
| Catalogue decoded JSON body | 244,186 |
| Initial identity, schemas, catalogue and 12 suites, decoded subtotal | 469,384 |
| Eight additional individual manifests, decoded subtotal | 26,904 |

HTTP/TLS headers and framing are excluded. The test additionally fetched the catalogue twice to exercise the consumer and unchanged-refresh behaviour. Initial Git-tree verification adds bootstrap traffic; subsequent discovery can use the configured index SHA-256 and fetch only the index. The gzip count is a server-advertised encoded body size, not a packet capture or Moto measurement.

This distribution is suitable for further constrained-node integration: roughly 27 KiB compressed and 238 KiB decoded for discovery. JavaScript object memory exceeds raw JSON size and has not been measured on Moto. The release has no compact summary asset, catalogue schema file or dedicated suite index; suites were discovered through Git-tree metadata. A future small suite list in the catalogue would remove that lookup. None of this requires cloning Agent Control's heavy historical evidence.

## Query evidence

| Query | Result |
|---|---|
| List | 50 canonical IDs |
| Search `gpu` | `gpu-inspection` |
| Category `operations` | 9 jobs |
| Capability `model.invoke` | `benchmark-model`, `compare-models` |
| Common jobs | 12 |
| Inspect provenance | Retrieved for all eight representative jobs |
| Inspect suite | AC-QUAL-CORE: csv-analysis, duplicate-detection, structured-extraction, hallucination-resistance, invalid-input |

The eight inspected manifests were gpu-inspection, fix-failing-test, technical-research, document-collection-summary, compare-models, insufficient-permission, checkpoint-resume and inbox-triage. Category, tags, common-job flag, provenance, permissions, requirements and qualification status all remain available in the query projection. Complete query outputs and hashes are in access-report.json.

## Native Estate Discovery assessment

The consumer accepts Agent Control's actual `agent-control.environment-discovery/v1` DiscoveryScan directly. No alternative estate store was created. Capability bindings are a small adapter configuration referencing existing item IDs; they are not invented observations.

The saved development projection contains 37 items and was completed at **2026-09-12 19:12:02 UTC**. Its input digest is `127c8981cf4f51b49ff0f46813d58181a72a63aa851a30d74a3550df0d09b2b6`. At this test it was older than the jobs' 300-second evidence bound, so all 50 jobs had primary state **BLOCKED**. No stale evidence was relabelled current.

A supplementary native local-machine discovery completed at **2026-09-13 02:25:52 UTC**, finding two real items: the controller machine and its NVIDIA GPU. Only the existing LocalMachineDiscoveryAdapter ran, in isolated state, with remote and memory discovery disabled. It did not scan or contact Moto. This is a fresh local subset, not a refreshed 37-item development estate.

| State | Saved estate primary count | Fresh local primary count | Fresh local jobs with this unmet reason |
|---|---:|---:|---:|
| READY | 0 | 0 | 0 |
| CONFIGURATION_REQUIRED | 0 | 0 | 50 |
| CONNECTOR_REQUIRED | 0 | 0 | 3 |
| CREDENTIAL_REQUIRED | 0 | 0 | 1 |
| APPROVAL_REQUIRED | 0 | 0 | 50 |
| UNSUPPORTED | 0 | 50 | 50 |
| BLOCKED | 50 | 0 | 0 |

The overlapping-reason column is deliberately not a partition. Here UNSUPPORTED means the required capability is **not verified under a qualified binding**. It does not mean the host lacks the hardware or that Agent Control can never perform the task. All jobs also need reviewed library adapter configuration and execution authority. Merely seeing a host, GPU or active runtime job does not establish the library's `evidence.report`, `gpu.inspect`, `code.execute`, `model.invoke` or `checkpoint` capability contracts.

### Representative explanations

- **GPU inspection:** host and GPU are observed. Both remain DISCOVERED/AVAILABLE rather than QUALIFIED/ACTIVE. No qualified `gpu.inspect` or `evidence.report` mapping, target binding, library adapter or execution grant exists. UNSUPPORTED with CONFIGURATION_REQUIRED and APPROVAL_REQUIRED reasons; execution NOT_STARTED.
- **Fix failing test:** requires `code.execute` and `evidence.report`, a bound target and approved repository mutation. None is supplied by this discovery assessment. It is not authorised merely because a coding runtime exists elsewhere.
- **Research/documents:** source and document jobs require `evidence.report` and a reviewed adapter. A source URL in provenance is not proof that authorised input data or retrieval capability is available.
- **Compare models:** `model.invoke` has no qualified binding in the local subset. A model route, target and job adapter still need configuration; no paid invocation or credential use was attempted.
- **Insufficient permission:** the catalogue correctly describes a BLOCKED expected fixture outcome. Readiness assessment does not run that scenario, so it cannot claim a refusal PASS.
- **Resume:** `checkpoint` has no qualified binding. Discovering an existing job does not prove durable continuation, model failover or exactly-once recovery.
- **Inbox triage:** v0.1.0 declares no email connector or credential and only requires `evidence.report`. Therefore the consumer does **not** invent an email-connector reason. This manifest is adequate for its supplied-message fixture but incomplete for live inbox readiness. A future live variant must declare its real connector and data requirements.

## Updates and authority

Unchanged digest returns UNCHANGED. A changed catalogue is REVIEW_UPDATE, not automatic dispatch. Changed job content under the same ID/version is rejected. Version-bumped changes and disappearances are reported for review. An existing pin is an independent snapshot of source/release/commit/index digest/job version/job digest; refreshes cannot mutate it.

Failed retrieval or malformed data preserves the previous inspection cache with an explicit stale/error flag and disables creation of new pins. The tests simulate later releases, changed/disappeared jobs and failures; no claim is made that a newer real release currently exists. The module has no install, execute, approval or qualification mutation operation.

**DISCOVERABLE ≠ READY ≠ AUTHORISED ≠ EXECUTED ≠ QUALIFIED.**

## Configuration and dashboard proposal

The minimum source descriptor has an operator-chosen ID, repository/source identity, release, immutable revision, index URL, resource-base URL and trusted index SHA-256. source.json records the tested descriptor. The core consumer is not hard-coded to this repository; the GitHub identity-resolution procedure is confined to the bounded test driver. The current transport supports public/private HTTPS sources without forwarding credentials. A future local-file or authenticated-source adapter can reuse validation and query logic; those transports are not implemented here.

The existing operator-protected `/api/environment-discovery` projection supplies native records. A future AgentControlService projection can join those records with the consumer's catalogue query results and expose an operator-protected read-only Job Library endpoint. Rows can show objective, category, readiness plus all reasons, requirements, permissions/risk and qualification. Keep source refresh explicit and pass any eventual run request through existing Work Parcel governance with its immutable pin. No new dashboard, service, endpoint or live configuration was installed by this test.

## Tests and remaining integration

Seven focused integration tests passed: valid queries/pins, malformed/schema/version/duplicate/digest rejection, failed retrieval/cache behaviour, update/removal/pinning behaviour, HTTP/size/path boundaries, individual-manifest integrity and native-discovery/no-authority assessment. TypeScript typecheck passed; all three existing infrastructure-neutrality checks passed. Downloaded job validators were never run. The broader physical qualification suite was not run.

The isolated worktree reused the existing 4.5 dependency installation read-only. Its attempted `npm ci` failed because this Agent Control baseline intentionally does not track a lockfile. No source/dependency files in the existing checkout were modified. This was not an Agent Control virgin-install test.

Generic catalogue access is architecturally suitable for Agent Control 4.5. Remaining work is reviewed capability-name/target bindings, richer live-job requirements where absent, source lifecycle persistence and the minimal dashboard/service projection. This result does not qualify any of the 50 jobs and does not change their NOT_YET_QUALIFIED status.

# Agent Control 4.6 known limitations

Version: **4.6.1**. This current classification supplements earlier qualification verdicts; historical failures and reports remain unchanged. Optional limitations do not waive core installation, usability, governance, security, data integrity or reproducibility checks.

The machine-readable [register](../examples/showcase-4.6/known-limitations.json) feeds the RC gate. A separate [scope reconciliation](release-integration-4.6.md) records work in progress and true release blockers.

## Contributing safely

Items marked **HELP WANTED** are bounded contribution opportunities. Start with the evidence and closure criteria below, use a fresh private workspace, report exact model/runtime/software versions, and retain failed attempts. Submit a small adapter or reproducible qualification with tests and privacy-safe observations. Never publish credentials, account details, private endpoints, phone serials or raw estate configuration. Reference credentials through the existing callback/configuration boundary. Discovery or fixture success does not become physical qualification.

## AC46-ANDROID-01 — Android local inference and benchmark league

**FUTURE_WORK** · Release blocking: **NO** · **HELP WANTED**

| Field | Detail |
| --- | --- |
| Why | Runtime qualification and data-only validator still assume Linux facilities. |
| User impact | No Android model recommendation or local inference league result is advertised. |
| Workaround | Use the verified deterministic local jobs. |
| What would close it | A capability adapter, validator tests, approved real inference and independent benchmark evidence. |
| Evidence | [android-standalone-qualification.md](android-standalone-qualification.md); [qualification.json](../examples/showcase-4.6/android-standalone/qualification.json) |

## AC46-ANDROID-02 — Phone battery, charging, thermal, metering and accelerator telemetry

**PLATFORM_LIMITATION** · Release blocking: **NO** · **HELP WANTED**

| Field | Detail |
| --- | --- |
| Why | Base Termux cannot obtain the required observations; existing phone-local ADB reconnect failed. |
| User impact | Conservative policy blocks optional model acquisition and benchmarking. GPU/NPU and power remain unknown. |
| Workaround | Read available RAM/storage; do not substitute server sensors or infer watts. |
| What would close it | A read-only phone-local adapter with identity, units, freshness and physical validation. |
| Evidence | [android-standalone-qualification.md](android-standalone-qualification.md); [qualification.json](../examples/showcase-4.6/android-standalone/qualification.json) |

## AC46-ANDROID-03 — Model resource feasibility on a busy handset

**KNOWN_LIMITATION** · Release blocking: **NO** · **HELP WANTED**

| Field | Detail |
| --- | --- |
| Why | Available RAM fluctuated below the reserve despite larger installed RAM. |
| User impact | Some otherwise compatible models cannot be admitted safely. |
| Workaround | Continue lightweight local jobs; review capacity before explicitly approving model work. |
| What would close it | Fresh sufficient available resources and a qualified runtime; total RAM alone is insufficient. |
| Evidence | [android-standalone-qualification.md](android-standalone-qualification.md); [qualification.json](../examples/showcase-4.6/android-standalone/qualification.json) |

## AC46-ANDROID-04 — Android background reliability and recovery breadth

**PLATFORM_LIMITATION** · Release blocking: **NO** · **HELP WANTED**

| Field | Detail |
| --- | --- |
| Why | Android may reclaim Termux. Reboot, battery shutdown and forced OS reclamation were not exercised. |
| User impact | No server-grade daemon or automatic reboot recovery claim. |
| Workaround | Keep Termux foreground; restart using the documented command and inspect retained state. |
| What would close it | Device-specific interruption, reboot and resource-pressure evidence without weakening governance. |
| Evidence | [android-standalone-qualification.md](android-standalone-qualification.md); [qualification.json](../examples/showcase-4.6/android-standalone/qualification.json) |

## AC46-ANDROID-05 — Additional phones and optional PWA launcher

**PARTIAL_SUPPORT** · Release blocking: **NO** · **HELP WANTED**

| Field | Detail |
| --- | --- |
| Why | Physical standalone evidence covers one Pixel and the browser path; PWA installability passed but launcher install was not exercised. |
| User impact | Other handset and launcher combinations are unqualified. |
| Workaround | Use the tested local browser path. |
| What would close it | Reproducible handset reports and launcher close/reopen tests, with no identifying or credential payloads. |
| Evidence | [android-standalone-qualification.md](android-standalone-qualification.md); [qualification.json](../examples/showcase-4.6/android-standalone/qualification.json) |

## AC46-BILLING-01 — Exact metered API billing

**BLOCKED_EXTERNAL** · Release blocking: **NO** · **HELP WANTED**

| Field | Detail |
| --- | --- |
| Why | No already-authorised metered provider was discovered. Included subscription access is non-metered. |
| User impact | No physical exact-money API comparison. |
| Workaround | Show unavailable billing separately from token counts. |
| What would close it | An authorised billed request with provider usage/price revision and reconciliation evidence. |
| Evidence | [usage-energy-physical-closure-4.6.md](usage-energy-physical-closure-4.6.md); [acceptance-matrix.json](../examples/showcase-4.6/usage-closure/acceptance-matrix.json) |

## AC46-BILLING-02 — Positive billed cache and delayed billing corrections

**BLOCKED_EXTERNAL** · Release blocking: **NO** · **HELP WANTED**

| Field | Detail |
| --- | --- |
| Why | Provider billing evidence is unavailable. |
| User impact | Cached token semantics are not represented as proven billed savings. |
| Workaround | Preserve unavailable cost and the deterministic accounting tests. |
| What would close it | A provider-supported positive cache charge and delayed adjustment, reconciled to the ledger. |
| Evidence | [usage-energy-physical-closure-4.6.md](usage-energy-physical-closure-4.6.md); [acceptance-matrix.json](../examples/showcase-4.6/usage-closure/acceptance-matrix.json) |

## AC46-ENERGY-01 — Attributable job and baseline electricity

**BLOCKED_EXTERNAL** · Release blocking: **NO** · **HELP WANTED**

| Field | Detail |
| --- | --- |
| Why | Shared device load prevents defensible exclusive allocation. |
| User impact | No Wh/job, tokens/Wh or incremental baseline saving. |
| Workaround | Publish coverage-labelled component intervals only. |
| What would close it | A qualified baseline, matching load boundary and justified allocation, with preserved raw samples. |
| Evidence | [usage-energy-physical-closure-4.6.md](usage-energy-physical-closure-4.6.md); [acceptance-matrix.json](../examples/showcase-4.6/usage-closure/acceptance-matrix.json) |

## AC46-ENERGY-02 — Electricity tariff

**BLOCKED_EXTERNAL** · Release blocking: **NO** · **HELP WANTED**

| Field | Detail |
| --- | --- |
| Why | No operator tariff evidence was configured. |
| User impact | No measured local electricity cost. |
| Workaround | Keep monetary electricity fields unavailable. |
| What would close it | A time-effective tariff/currency/unit reference and attributable measured energy. |
| Evidence | [usage-energy-physical-closure-4.6.md](usage-energy-physical-closure-4.6.md); [acceptance-matrix.json](../examples/showcase-4.6/usage-closure/acceptance-matrix.json) |

## AC46-ENERGY-03 — Whole-node energy

**BLOCKED_EXTERNAL** · Release blocking: **NO** · **HELP WANTED**

| Field | Detail |
| --- | --- |
| Why | No actual W/Wh/kWh sensor with a defensible machine binding was discovered. |
| User impact | No whole-node or local-versus-cloud energy comparison. |
| Workaround | Use explicitly scoped GPU board observations. Never derive watts from UPS load percentage. |
| What would close it | Read-only measurement integration, units, sample semantics and explicit machine/outlet binding; aggregate UPS load alone is insufficient. |
| Evidence | [usage-energy-physical-closure-4.6.md](usage-energy-physical-closure-4.6.md); [acceptance-matrix.json](../examples/showcase-4.6/usage-closure/acceptance-matrix.json) |

## AC46-MODEL-01 — End-to-end target-model showcase

**PARTIAL_SUPPORT** · Release blocking: **NO** · **HELP WANTED**

| Field | Detail |
| --- | --- |
| Why | The integrated pipeline has source and control evidence; fresh exact-plan model execution is separately gated. |
| User impact | No universal winner, unseen target result or overnight improvement may be inferred. |
| Workaround | Review the real source shortlist and the exact execution proposal. |
| What would close it | Approved acquisition, validated native attempts, personal league ingestion and linked Process/Estate evidence. |
| Evidence | [model-intelligence-showcase.md](model-intelligence-showcase.md) |

## AC46-WATCH-01 — Overnight unattended qualification

**PARTIAL_SUPPORT** · Release blocking: **NO** · **HELP WANTED**

| Field | Detail |
| --- | --- |
| Why | Schedule/deduplication/budget controls are tested; a real overnight-duration run has not been qualified. |
| User impact | The morning view is a recorded intelligence brief, not proof of unattended overnight success. |
| Workaround | Run an explicitly approved manual watch and inspect evidence. |
| What would close it | An authorised bounded overnight watch with timestamps, interruption/reconciliation and notification evidence. |
| Evidence | [model-intelligence-showcase.md](model-intelligence-showcase.md) |

## AC46-WATCH-02 — External notifications and source integrations

**BLOCKED_EXTERNAL** · Release blocking: **NO** · **HELP WANTED**

| Field | Detail |
| --- | --- |
| Why | No destination is configured; additional feeds need source approval and adapters. |
| User impact | No external delivery or universal source coverage claim. |
| Workaround | Read the in-product brief and source coverage. |
| What would close it | A configured authorised destination and delivery evidence; additional origin-restricted source adapters. |
| Evidence | [model-intelligence-showcase.md](model-intelligence-showcase.md) |

## AC46-RUNTIME-01 — Additional runtime, API and subjective benchmark execution

**FUTURE_WORK** · Release blocking: **NO** · **HELP WANTED**

| Field | Detail |
| --- | --- |
| Why | Only qualified existing adapters can execute; generic provisioners and judge adapters are incomplete. |
| User impact | Some providers/runtimes/validators remain unsupported despite view and schema support. |
| Workaround | Use the supported local deterministic validator path. |
| What would close it | Capability-specific adapters with bounded authority, verified artifacts, cancellation and result provenance tests. |
| Evidence | [model-intelligence-showcase.md](model-intelligence-showcase.md) |

## AC46-RULES-01 — Estate rules builder and household automation showcase

**FUTURE_WORK** · Release blocking: **NO** · **HELP WANTED**

| Field | Detail |
| --- | --- |
| Why | Typed governed rules exist; a full rules-builder UI and physical household demonstration do not. |
| User impact | No no-code household automation claim. |
| Workaround | Use small approved typed rules through the documented programmatic boundary. |
| What would close it | Usable rule editing/review plus a separately authorised non-destructive physical qualification. |
| Evidence | [model-intelligence-showcase.md](model-intelligence-showcase.md) |

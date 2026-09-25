# Agent Control 4.6 — Physical Usage, Billing and Energy closure

**Subsystem judgement: PASS WITH LIMITATIONS.** This accepts the observed local usage, sampled component-energy, gap-exclusion and reporting paths. It does **not** qualify metered API billing, attributable job energy or whole-node electricity. Those remain BLOCKED_EXTERNAL. No energy or monetary winner is declared.

Continues checkpoint `500815092c100c2e970a72c3f83a703219def3bb`. Final physical data and screenshots came from clean source `0f2359360c7fe9d89e8ae83fa1c870ba4a6d5bc2`. The original invocation ledger and energy store remain authoritative; no accounting architecture was replaced.

## Preserved failures

The three original reconciliation failures remain unchanged. A separate owner-read-only archive contains 34 original JSON evidence files; every archive entry was checked against its source SHA-256. [Preservation proof](../examples/showcase-4.6/usage-closure/failure-preservation-proof.json) and [source manifest](../examples/showcase-4.6/usage-closure/preserved-failures.json) record that boundary.

The new ordered-list workload is a different verification task. Its PASS does not remediate, supersede or reclassify a reconciliation failure. A preliminary three-call local run also remains separately preserved. Only the three subsequent committed-run invocations below populate this closure's reporting snapshot; this is not all-estate consumption.

## Physical local results

Each governed Work Parcel stage called an already resident local model, checked the complete ordered list of integers 1–100, recorded native provider usage and retained model/runtime file hashes. All three final jobs passed: **186 input + 876 output = 1,062 tokens**. Every invocation used 62 input and 292 output tokens. Cached input was reported as zero; reasoning/cache-write data remain unknown. No paid API call occurred.

| Path | Input / output tokens | Duration ms | Output tokens/s reported by runtime | Observed / expected samples | Interval coverage | Observed GPU board Wh | Verifier |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1: Coder | 62 / 292 | 5564 | 54.33 | 29 / 29 | 100.00% | 0.141464601 | PASS |
| 2: General | 62 / 292 | 5556 | 54.28 | 29 / 29 | 100.00% | 0.142067928 | PASS |
| 3: Controlled observer gap / coder | 62 / 292 | 5497 | 54.56 | 21 / 29 | 66.96% | 0.094293310 | PASS |

The GPU was an existing Quadro P5000. Sampling targeted 200 ms, with actual timestamps used for integration and a maximum accepted gap of 700 ms. The third run deliberately suspended the observer for 1,600 ms; eight scheduled samples were not taken. This is a labelled **physical observer fault experiment**, not an inferred failure or edited evidence. An independent calculation of every retained interval matched the stored coverage and energy. No missing interval was bridged. Expected counts include scheduled ticks and the execution boundaries.

These are **DERIVED energy values from measured GPU board power**, not whole-node readings. Normal runs had 29 samples each; the gap experiment retained 21. The smaller gap-run energy reflects missing coverage and cannot be interpreted as an efficiency improvement. [Physical receipts, samples and independent calculation](../examples/showcase-4.6/usage-closure/physical-summary.json) preserve exact timings, powers, excluded intervals, identities, token counts and response hashes.

Both local paths performed the same bounded workload. The run is too small for a model ranking. Multiple resident inference and speech services share the GPU; the observer cannot reserve their request streams or establish a defensible allocation. Therefore all records remain **NOT_ATTRIBUTABLE**, and Wh/job, tokens/Wh and incremental attributed energy are unavailable. Twelve pre-run low-utilisation samples per path are retained as observations, not promoted into a qualified exclusive baseline. Model/runtime hashes identify referenced files, not a new model-load attestation. CPU package counters exist but are not readable under current permissions.

## External closure boundaries

**Paid provider — BLOCKED_EXTERNAL.** Read-only inspection of four distinct running Agent Control configurations and local Discovery found subscription-included Codex, but no authorised configured metered API path. The operator confirmed no additional references are known. Included Codex is non-metered for this qualification. No account, credential, subscription or spend was acquired. A billed request, positive billed-cache observation and delayed provider revision cannot be physically qualified without that path. Existing deterministic exact-money, cache and revision tests remain PASS; they are not relabelled as provider billing proof.

**Whole-node energy — BLOCKED_EXTERNAL.** The running Home Assistant UPS integration/device/entity metadata contained no APC/UPS mapping or power/energy sensor candidate. The existing estate-monitor report provided no UPS measurement. No APC USB device or configured UPS telemetry client/service was found on the inspected controller; the Windows host exposed no APC PnP device. This does not imply that the operator's APC does not exist elsewhere. Its observable endpoint and downstream machine/outlet mapping were not discoverable in these sources. No Home Assistant state database, credential values, automation actions or device changes were used.

The minimum requirement is a read-only source exposing actual W or Wh/kWh, its unit/semantics/sample rate, and an explicit binding to the measured machine. A UPS aggregate serving other equipment is not automatically that machine's whole-node energy. UPS percentage was never converted to watts. No operator tariff was found, so electricity pricing remains unavailable too. [Read-only discovery findings](../examples/showcase-4.6/usage-closure/external-discovery.json) record each missing dependency.

**Local versus API:** the local rows show zero API charge by explicit declaration, separate unknown electricity cost, and scoped component observations. There is no physical metered API row to compare. Cloud energy remains UNKNOWN. No claim that local execution was cheaper is supported.

## Mallow and execution traces

Physical questions exposed a narrow generic question-matching defect: “measurement coverage” and “cheaper” did not select live usage. The fix adds those terms and includes token coverage, local/API execution counts and explicit comparison limitations in the existing answer projection. No accounting records were patched.

Validation followed focused tests → full suite/typecheck → browser → privacy → a separately identified physical rerun. The application knowledge service now supplies the canonical projection to Mallow's deterministic response runtime for all five requested questions. Tokens reconcile exactly, coverage and attribution remain visible, and the evidence explicitly requires attributable electricity and billed API evidence before a cheaper-local claim. This proves grounded deterministic delivery; it does not qualify a new model-backed conversational path or resolve ambiguous conversational references to one particular invocation. [Mallow evidence](../examples/showcase-4.6/usage-closure/mallow-accounting-proof.json).

A native invocation was followed to its real job run and Work Parcel in Process Map, then to the discovered machine in Estate. “Show usage” returned the same three native invocations. The trace contains the execution evidence hashes and uses the real invocation/run/parcel IDs. [Process and Estate trace](../examples/showcase-4.6/usage-closure/process-estate-trace.json).

## Acceptance matrix

PASS applies only to the stated physical scope. Local provider semantics do not qualify a metered provider's billing semantics. No physical retry was necessary; the third observer experiment is a separate run, not a retry. Positive cache billing remains untested.

| Capability | Deterministic | Physical | Verdict |
| --- | --- | --- | --- |
| Token accounting | PASS | PASS | PASS |
| Provider semantics (resident local adapter) | PASS | PASS | PASS |
| Exact API cost | PASS | BLOCKED_EXTERNAL | BLOCKED_EXTERNAL |
| Cache accounting (positive billed cache) | PASS | BLOCKED_EXTERNAL | BLOCKED_EXTERNAL |
| Retry tax | PASS | NOT_APPLICABLE | NOT_APPLICABLE |
| Local inference usage | PASS | PASS | PASS |
| Component energy (observed intervals) | PASS | PASS | PASS |
| Gap-aware integration | PASS | PASS | PASS |
| Baseline attribution | PASS | BLOCKED_EXTERNAL | BLOCKED_EXTERNAL |
| Electricity tariff | PASS | BLOCKED_EXTERNAL | BLOCKED_EXTERNAL |
| Whole-node energy | PASS | BLOCKED_EXTERNAL | BLOCKED_EXTERNAL |
| Dashboard | PASS | PASS | PASS |
| Process integration | PASS | PASS | PASS |
| Estate integration | PASS | PASS | PASS |
| Mallow grounding | PASS | PASS | PASS |
| Privacy | PASS | PASS | PASS |

## Validation and real screenshots

**1,428 tests PASS, zero failed/skipped; typecheck PASS; 29 focused tests PASS.** Strict qualification-script typechecking passed. All eight usage views, native Process/Estate links, reverse navigation and 390×844 mobile rendering were exercised without JavaScript errors. The final snapshot contains three native rows, with one contribution per invocation; neither map evidence nor energy joins add extra calls/tokens.

[Validation and screenshot hashes](../examples/showcase-4.6/usage-closure/validation.json) · [Canonical reporting snapshot](../examples/showcase-4.6/usage-closure/projection.json) · [Machine-readable acceptance matrix](../examples/showcase-4.6/usage-closure/acceptance-matrix.json).

These are unmodified captures of the real native dashboard with final physical data; earlier useful screenshots remain intact. Reporting excludes prompt/response bodies and private configuration. Crew artwork and the floating Mallow guide remain. Wide evidence tables scroll; the guide remains draggable.

[Native usage overview](provenance/EXTERNAL-EVIDENCE.md)

[Actual model cost and token breakdown](provenance/EXTERNAL-EVIDENCE.md)

[Scoped local energy and measurement coverage](provenance/EXTERNAL-EVIDENCE.md)

[Local versus API with unavailable billing visible](provenance/EXTERNAL-EVIDENCE.md)

[Native invocation detail](provenance/EXTERNAL-EVIDENCE.md)

[Mobile usage overview](provenance/EXTERNAL-EVIDENCE.md)

## Provenance and release boundary

The bounded runner is [qualify-usage-closure.ts](../scripts/qualify-usage-closure.ts). Production changes are confined to the [Mallow knowledge selector](../src/control/poe-knowledge.ts) and [usage answer projection](../src/control/usage-projection.ts), with two regression tests added. Authoritative private run folders remain on the development host; their selected allowlisted receipts and source hashes are published above.

The earlier specialist-energy and warm-residency findings remain unchanged. Broader 4.6 benchmark, clean-install, overnight-duration and showcase release gates are separate and remain outstanding. This closure is an evidence/implementation feature-branch checkpoint. No merge, tag, release, deployment, model download, service restart, credential acquisition, history reset or device configuration change was performed.

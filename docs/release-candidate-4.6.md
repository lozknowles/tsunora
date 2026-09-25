# Agent Control 4.6 RC assessment

**CORE RELEASE: PASS. SHOWCASE: PASS WITH LIMITATIONS for the implemented demonstrations. The full target-model benchmark story remains INCOMPLETE.** This candidate is prepared for operator review; no final tag or release has been published.

Qualification source: `5ed7495bc46108ad2968bdfe8ef5cf47731c4ad1`. The [RC gate output](../examples/showcase-4.6/release-integration/rc-gate.json), [validation receipt](../examples/showcase-4.6/release-integration/validation.json) and [scope](../examples/showcase-4.6/release-integration/scope.json) record the precise boundaries.

## Current 4.6 status

| Area | Verdict | Evidence boundary |
| --- | --- | --- |
| Core release | PASS | Integrated regression, installation, upgrade, governance/security, Estate/Process, documentation, distribution and version checks passed. |
| Showcase | PASS WITH LIMITATIONS | Real controllers, governed jobs, Android, usage and source intelligence are demonstrated. The strict full-showcase checker still requires target-model results and an active benchmark trace. |
| Android standalone | PASS WITH LIMITATIONS | Original physical Pixel control-plane/job/recovery proof retained. Fresh isolated locked bootstrap and TypeScript/SQLite probe also passed. The existing phone controller was not replaced. |
| Model Intelligence | PASS WITH LIMITATIONS | Two native manual source-observation workflows succeeded; initial and follow-up observations are distinguished. Runtime-source coverage remains partial. |
| Local LLM benchmark / personal league | CONTROL QUALIFIED; TARGET EXECUTION APPROVAL REQUIRED | No model download, new local inference, target quality score or personal league winner occurred in this parcel. |
| Morning Brief | PASS WITH LIMITATIONS | Source coverage, baseline/follow-up, complete-native result counts and next actions physically exercised. Overnight-duration operation remains unqualified. |
| Estate / Process | PASS | Real approved local jobs, retained upgrade run and fresh Discovery. Desktop filter clipping and stale authentication/summary display were fixed and rechecked. |
| Governance / security | PASS for tested boundaries | Full controls regressions, authenticated API checks, rejected foreign-origin mutations and token absence from checked responses. No claim of exhaustive security certification. |
| Usage / energy | PASS WITH LIMITATIONS | Prior physical component/usage evidence preserved byte-for-byte; optional missing billing and energy measurements remain external limitations. |

## True release blockers

**None found in the qualified core scope.** The RC gate still fails on missing/failed core checks, changed source, invalid versioning or classified core risks. Installation failure, unusable dashboard, governance bypass, leaked credentials, destructive behavior, corruption, false core claims or irreproducible artifacts cannot be waived as optional.

Final publication remains an operator-review step, not an unavailable-infrastructure blocker. The complete target-model showcase remains unfinished and is not advertised as a completed result.

## Known non-blocking limitations and external dependencies

There are **15 open limitations**: 1 KNOWN_LIMITATION, 6 BLOCKED_EXTERNAL, 3 PARTIAL_SUPPORT, 2 PLATFORM_LIMITATION and 3 FUTURE_WORK. All have impact, workaround, closure criteria, evidence and contribution guidance in the [versioned Known Limitations register](known-limitations-4.6.md).

The six external items cover exact metered billing, positive billed-cache evidence, attributable baseline/job electricity, tariff evidence, whole-node sensors/bindings, and unconfigured notification/source integrations. No additional account, credential, spend, household control or network exposure was acquired to close them.

Android's unfinished inference adapter, telemetry limits and resource constraints do not block the verified standalone controller. Unknown measurements remain unavailable. No watts are inferred from UPS percentage.

## Features still to implement or qualify

- Complete the separately approved desktop acquisition → validation → personal league demonstration and its active Process/Estate trace.
- Add Android benchmark runtime/validator and phone-local telemetry adapters, then perform separately identified device qualification.
- Extend runtime/API/subjective validator adapters, the rules-builder UI, notification integrations and additional handset coverage.
- Qualify a bounded unattended overnight watch; do not relabel the short manual observation as overnight evidence.

## Real outputs

| Manual observation | Recorded changes | Reviewed relevant candidates | Complete source coverage | Benchmarked |
| --- | ---: | ---: | ---: | ---: |
| Initial baseline | 17 | 2 | 2 of 3 | 0 |
| Follow-up | 0 | 0 | 2 of 3 | 0 |

The baseline contains existing model artifacts, not proof of newly released models. Zero follow-up changes apply only to observed data; partial runtime-source coverage prevents a complete no-change claim. Both workflows used native six-phase jobs. [Native run identities, source snapshot hashes and briefs](../examples/showcase-4.6/release-integration/real-intelligence.json).

[Actual baseline brief](provenance/EXTERNAL-EVIDENCE.md)

[Actual follow-up brief](provenance/EXTERNAL-EVIDENCE.md)

The [current Estate](provenance/EXTERNAL-EVIDENCE.md) and [completed Process trace](provenance/EXTERNAL-EVIDENCE.md) come from the real isolated public installation. [Screenshot hashes and source commits](../examples/showcase-4.6/release-integration/screenshots.json) distinguish desktop mobile emulation from the separate [physical Android screenshots](android-standalone-qualification.md). The existing [usage/energy table](usage-energy-physical-closure-4.6.md) remains a component-observation result, not a model benchmark league.

## Test and installation status

**1,464 tests passed, zero failed or skipped**, with typecheck, distribution, syntax, neutrality and implementation-status checks. The final source is bound by a source digest in the RC receipt. Focused regressions prove that unavailable optional measurements cannot mask a core failure, incomplete sources cannot become a no-change verdict, unverified/incomplete results cannot inflate benchmark counts, and a stale authentication response cannot overwrite a new authenticated session.

Fresh public-clone Linux installation used Node 24.21.0/npm 11.19.0 and the committed dependency lockfile. A real v4.5.1 upgrade into a separate checkout retained all **21 state files byte-identically through bootstrap**, preserved the original successful run and completed a new governed local run. Original checkout/state were retained.

Fresh Windows installation used Node 24.19.0/npm 11.17.0; repeat bootstrap preserved configuration and the TypeScript/SQLite probe passed. Physical Pixel locked bootstrap used Node 26.4.0/npm 11.19.0 in another isolated Termux directory. The original Android full-dashboard/job/recovery evidence remains separately scoped.

The Linux/Android installation probes began at `e886222`; subsequent changes affected dashboard assets, one frontend regression test and guide text only. Bootstrap, lockfile, package and server source remained byte-identical. The final dashboard assets were rechecked in the isolated containers. No production service was upgraded.

The initial Docker inspection binding and a Windows diagnostic import-path failure are retained as harness failures with their corrections. Earlier Android and usage qualification artifacts remain unchanged; the [preservation manifest](../examples/showcase-4.6/release-integration/preserved-evidence.json) verifies 19 structured evidence files.

## Commits integrated and next highest-value work

Android `720577b8aa82c78a8f0ae6156b8d826e868e3502` and public preparation `2d30ceb2ab24126e7c2c95c30c89e13fdff942c3` were integrated after verifying their common ancestor. Usage closure `5bbdf0b09410a608e7b185a0d58d05d9d8fd023e` was already included in both and was not duplicated.

Integration uses branch `integration/4.6-release-20260913`. The next highest-value work is execution of the prepared two-model Python-repair benchmark once its exact plan is approved. It requires 1,608,720,832 bytes of pinned model artifacts, four CPU threads sequentially, twelve measured attempts and no API spend or production routing change. Approval remains pending; it is not categorised as unavailable infrastructure.

The release candidate and limitations are ready for review. Do not tag or publish the final 4.6 release until that review is complete.

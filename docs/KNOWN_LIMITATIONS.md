# Agent Control limitations ledger

Authoritative comparison: **v4.10.0** at `6102d4889a836c6477cd70d574df9fadee9cea4a`.

This audit inspected **28 public release tags** and reconciles **59 unique historical limitations**. Historical reports remain unchanged. The machine-readable authority is [`evidence/limitations/agent-control-limitations.json`](../evidence/limitations/agent-control-limitations.json).

## Current result

- Current limitations requiring visibility: **53**.
- Resolved or superseded historical limitations: **6**.
- Stale current documentation found: **0**; versioned historical documents remain intentionally accurate for their release.
- Silently dropped from later release summaries without closure evidence: **22**.

## Public release inventory

| Release | Commit | Date | Qualification wording | Candidate source files |
|---|---|---|---|---:|
| v3.0.0 | `617200889977` | 2026-08-23 | PUBLIC_RELEASE_TAG; inspect cited release evidence | 11 |
| v3.0.1 | `9d751ee076c6` | 2026-08-24 | PUBLIC_RELEASE_TAG; inspect cited release evidence | 7 |
| v3.1.0 | `eaa1d4904b6d` | 2026-08-28 | PUBLIC_RELEASE_TAG; inspect cited release evidence | 25 |
| v3.2.0 | `beed6ee95453` | 2026-08-29 | PUBLIC_RELEASE_TAG; inspect cited release evidence | 2 |
| v3.2.1 | `99db684e1dfa` | 2026-08-30 | PUBLIC_RELEASE_TAG; inspect cited release evidence | 3 |
| v3.3.0 | `528956c7d2cd` | 2026-08-30 | PUBLIC_RELEASE_TAG; inspect cited release evidence | 2 |
| v3.3.1 | `0dee5d3f66bb` | 2026-08-31 | PUBLIC_RELEASE_TAG; inspect cited release evidence | 3 |
| v3.4.0 | `4b04f3942201` | 2026-09-01 | PUBLIC_RELEASE_TAG; inspect cited release evidence | 6 |
| v3.5.0 | `a12957e69d4d` | 2026-09-01 | PASS_WITH_LIMITATIONS | 12 |
| v3.7.0 | `41ae59c6bd0e` | 2026-09-03 | PUBLIC_RELEASE_TAG; inspect cited release evidence | 22 |
| v3.8.0 | `09ac94a3a818` | 2026-09-03 | PUBLIC_RELEASE_TAG; inspect cited release evidence | 10 |
| v3.8.1 | `4da1d360211b` | 2026-09-04 | PUBLIC_RELEASE_TAG; inspect cited release evidence | 14 |
| v3.8.2 | `b51623dae1b7` | 2026-09-04 | PUBLIC_RELEASE_TAG; inspect cited release evidence | 9 |
| v3.9.0 | `4966c97505d0` | 2026-09-05 | PUBLIC_RELEASE_TAG; inspect cited release evidence | 24 |
| v4.0.0 | `ff7ed114c08b` | 2026-09-08 | PUBLIC_RELEASE_TAG; inspect cited release evidence | 57 |
| v4.1.0 | `3c906bd3ec55` | 2026-09-09 | PUBLIC_RELEASE_TAG; inspect cited release evidence | 13 |
| v4.3.0 | `c389a7a2fc79` | 2026-09-09 | PUBLIC_RELEASE_TAG; inspect cited release evidence | 20 |
| v4.4.0 | `0a3d136c38ec` | 2026-09-11 | PUBLIC_RELEASE_TAG; inspect cited release evidence | 11 |
| v4.5.0 | `0c88d05ef102` | 2026-09-13 | PUBLIC_RELEASE_TAG; inspect cited release evidence | 60 |
| v4.5.1 | `a2cd9c9d8a12` | 2026-09-13 | PUBLIC_RELEASE_TAG; inspect cited release evidence | 8 |
| v4.6.0 | `a4ab4da943be` | 2026-09-13 | PASS_WITH_LIMITATIONS | 31 |
| v4.6.1 | `4bf186c97655` | 2026-09-13 | PUBLIC_RELEASE_TAG; inspect cited release evidence | 10 |
| v4.7.0 | `27124db3d592` | 2026-09-14 | PASS_WITH_LIMITATIONS | 9 |
| v4.7.1 | `2fd8336ab5a8` | 2026-09-14 | PASS_WITH_LIMITATIONS | 9 |
| v4.8.0 | `57c593b4f889` | 2026-09-15 | PASS_WITH_LIMITATIONS | 7 |
| v4.8.1 | `b440d2c01c9c` | 2026-09-17 | PASS_WITH_LIMITATIONS | 16 |
| v4.9.0 | `fe9a879e4360` | 2026-09-18 | PASS_WITH_LIMITATIONS | 19 |
| v4.10.0 | `6102d4889a83` | 2026-09-19 | PASS_WITH_LIMITATIONS | 14 |

No public tag exists for omitted semantic versions such as v3.6.0 or v4.2.0; they are not represented as releases. `PUBLIC_RELEASE_TAG; inspect cited release evidence` means the audit did not find a controlled qualification-with-limitations label suitable for normalisation and does not infer one.

## Historical metrics

| Release | Introduced | Carried forward | Resolved/superseded | Currently partial among known | Silent-drop flags among known | Explicit reappearances | Open after release |
|---|---:|---:|---:|---:|---:|---:|---:|
| v3.0.0 | 2 | 0 | 0 | 1 | 1 | 0 | 2 |
| v3.0.1 | 0 | 2 | 0 | 1 | 1 | 0 | 2 |
| v3.1.0 | 6 | 2 | 0 | 2 | 3 | 0 | 8 |
| v3.2.0 | 0 | 8 | 0 | 2 | 3 | 0 | 8 |
| v3.2.1 | 2 | 8 | 0 | 2 | 4 | 2 | 10 |
| v3.3.0 | 2 | 10 | 0 | 2 | 4 | 0 | 12 |
| v3.3.1 | 1 | 12 | 0 | 2 | 4 | 0 | 13 |
| v3.4.0 | 0 | 13 | 0 | 2 | 4 | 2 | 13 |
| v3.5.0 | 4 | 13 | 0 | 3 | 5 | 0 | 17 |
| v3.7.0 | 0 | 17 | 1 | 3 | 5 | 0 | 16 |
| v3.8.0 | 3 | 16 | 0 | 3 | 6 | 1 | 19 |
| v3.8.1 | 0 | 19 | 0 | 3 | 6 | 0 | 19 |
| v3.8.2 | 0 | 19 | 0 | 3 | 6 | 0 | 19 |
| v3.9.0 | 3 | 19 | 0 | 4 | 7 | 1 | 22 |
| v4.0.0 | 0 | 22 | 0 | 4 | 7 | 0 | 22 |
| v4.1.0 | 0 | 22 | 0 | 4 | 7 | 0 | 22 |
| v4.3.0 | 0 | 22 | 0 | 4 | 7 | 0 | 22 |
| v4.4.0 | 0 | 22 | 0 | 4 | 7 | 0 | 22 |
| v4.5.0 | 0 | 22 | 2 | 4 | 7 | 2 | 20 |
| v4.5.1 | 0 | 20 | 0 | 4 | 7 | 0 | 20 |
| v4.6.0 | 13 | 20 | 0 | 6 | 15 | 2 | 33 |
| v4.6.1 | 0 | 33 | 0 | 6 | 15 | 1 | 33 |
| v4.7.0 | 8 | 33 | 0 | 8 | 21 | 0 | 41 |
| v4.7.1 | 0 | 41 | 0 | 8 | 21 | 2 | 41 |
| v4.8.0 | 5 | 41 | 0 | 8 | 22 | 0 | 46 |
| v4.8.1 | 2 | 46 | 3 | 8 | 22 | 2 | 45 |
| v4.9.0 | 2 | 45 | 0 | 8 | 22 | 0 | 47 |
| v4.10.0 | 6 | 47 | 0 | 8 | 22 | 0 | 53 |

“Currently partial” and “silent-drop” columns apply the v4.10 audit classification to items known by each release; they do not pretend to reconstruct an unrecorded historical status transition. Reappearances count only explicit evidence references after at least one intervening public tag.

## Current v4.10 limitations

| ID | Limitation | First seen | Status | Implementation | Automated | Physical | Closure |
|---|---|---:|---|---|---|---|---|
| AC-LIM-0001 | OpenAI ChatKit thread access remained live-unqualified | v3.0.0 | EXTERNAL_BLOCKER | PRESENT | PASS | NOT_QUALIFIED | EXTERNAL |
| AC-LIM-0002 | Android recovery depends on an existing authorised transport | v3.0.0 | PARTIALLY_RESOLVED | PRESENT | PASS | PARTIAL | QUALIFICATION_ONLY |
| AC-LIM-0003 | Opaque external CLI tools are not universally policy-mediated | v3.1.0 | OPEN | PARTIAL | PARTIAL | NOT_QUALIFIED | ENGINEERING |
| AC-LIM-0004 | Universal verification-to-acceptance coverage is incomplete | v3.1.0 | OPEN | PARTIAL | PARTIAL | NOT_QUALIFIED | ENGINEERING |
| AC-LIM-0007 | Remote artifact transport lacked qualification | v3.1.0 | PARTIALLY_RESOLVED | PRESENT | PASS | PARTIAL | QUALIFICATION_ONLY |
| AC-LIM-0008 | Authenticated Facebook discovery and LocalWalks publishing were fixture-only | v3.1.0 | ACCEPTED_LIMITATION | PARTIAL | PASS | NOT_QUALIFIED | ACCEPTED |
| AC-LIM-0009 | Providers without streaming usage cannot expose live token/cost counters | v3.2.1 | ACCEPTED_LIMITATION | PRESENT | PASS | PARTIAL | ACCEPTED |
| AC-LIM-0010 | Durable ledgers rewrite complete snapshots | v3.2.1 | OPEN | PRESENT | PASS | NOT_APPLICABLE | ENGINEERING |
| AC-LIM-0011 | No approved desktop ChatGPT session bridge | v3.3.0 | NEEDS_REQUALIFICATION | PARTIAL | PASS | NOT_QUALIFIED | QUALIFICATION_ONLY |
| AC-LIM-0012 | Physical ChatGPT Android UI route unqualified | v3.3.0 | OPEN | PARTIAL | PASS | NOT_QUALIFIED | ENGINEERING |
| AC-LIM-0014 | Authoritative provider monetary cost is often unavailable | v3.5.0 | EXTERNAL_BLOCKER | PRESENT | PASS | PARTIAL | EXTERNAL |
| AC-LIM-0015 | ACP packaging/conformance and shared-token principal isolation were incomplete | v3.5.0 | PARTIALLY_RESOLVED | PRESENT | PASS | PARTIAL | ENGINEERING |
| AC-LIM-0018 | Small local model quality remained weak | v3.8.0 | ACCEPTED_LIMITATION | PRESENT | PASS | QUALIFIED | ACCEPTED |
| AC-LIM-0019 | Cross-adapter physical portability remained unexercised | v3.8.0 | NEEDS_REQUALIFICATION | PRESENT | PASS | PARTIAL | QUALIFICATION_ONLY |
| AC-LIM-0020 | Retrieval remained opt-in and route-specific | v3.8.0 | ACCEPTED_LIMITATION | PRESENT | PASS | PARTIAL | ACCEPTED |
| AC-LIM-0021 | Authoritative current-context occupancy unavailable on local endpoints | v3.9.0 | EXTERNAL_BLOCKER | PRESENT | PASS | PARTIAL | EXTERNAL |
| AC-LIM-0022 | Preferred routing requires multi-day evidence and approval | v3.9.0 | ACCEPTED_LIMITATION | PRESENT | PASS | PARTIAL | ACCEPTED |
| AC-LIM-0023 | Browser/computer tasks lacked fully governed evaluator evidence | v3.9.0 | PARTIALLY_RESOLVED | PARTIAL | PASS | PARTIAL | ENGINEERING |
| AC-LIM-0024 | Physical Mallow/voice model conversation unqualified | v4.7.0 | OPEN | PRESENT | PASS | NOT_QUALIFIED | QUALIFICATION_ONLY |
| AC-LIM-0025 | Some speech/model providers expose only complete results, not streaming | v4.7.0 | ACCEPTED_LIMITATION | PRESENT | PASS | PARTIAL | ACCEPTED |
| AC-LIM-0027 | Phone battery, charging, thermal and metering telemetry were unavailable | v4.6.0 | PARTIALLY_RESOLVED | PRESENT | PASS | QUALIFIED | QUALIFICATION_ONLY |
| AC-LIM-0028 | Handset resource feasibility varies under live load | v4.6.0 | ACCEPTED_LIMITATION | PRESENT | PASS | QUALIFIED | ACCEPTED |
| AC-LIM-0029 | Android background reliability and interruption breadth incomplete | v4.6.0 | PARTIALLY_RESOLVED | PRESENT | PASS | PARTIAL | QUALIFICATION_ONLY |
| AC-LIM-0030 | Additional phones and PWA launcher combinations unqualified | v4.6.0 | NEEDS_REQUALIFICATION | PRESENT | PASS | NOT_QUALIFIED | QUALIFICATION_ONLY |
| AC-LIM-0031 | Positive billed-cache behavior and delayed corrections unqualified | v4.6.0 | EXTERNAL_BLOCKER | PRESENT | PASS | NOT_QUALIFIED | EXTERNAL |
| AC-LIM-0032 | Attributable per-job and baseline electricity unavailable | v4.6.0 | EXTERNAL_BLOCKER | PRESENT | PASS | NOT_QUALIFIED | EXTERNAL |
| AC-LIM-0033 | Electricity tariff evidence unavailable | v4.6.0 | EXTERNAL_BLOCKER | PRESENT | PASS | NOT_QUALIFIED | EXTERNAL |
| AC-LIM-0034 | Whole-node energy lacks defensible sensor binding | v4.6.0 | EXTERNAL_BLOCKER | PARTIAL | PASS | NOT_QUALIFIED | EXTERNAL |
| AC-LIM-0035 | Overnight unattended qualification was not physically demonstrated | v4.6.0 | NEEDS_REQUALIFICATION | PRESENT | PASS | NOT_QUALIFIED | QUALIFICATION_ONLY |
| AC-LIM-0036 | External notifications and source integrations require configured destinations | v4.6.0 | EXTERNAL_BLOCKER | PARTIAL | PASS | NOT_QUALIFIED | EXTERNAL |
| AC-LIM-0037 | Additional runtime/API and subjective judge adapters incomplete | v4.6.0 | OPEN | PARTIAL | PARTIAL | PARTIAL | ENGINEERING |
| AC-LIM-0038 | Rules-builder UI and physical household automation absent | v4.6.0 | OPEN | PARTIAL | PASS | NOT_QUALIFIED | ENGINEERING |
| AC-LIM-0039 | Local speech synthesis was too slow for natural real-time voice | v4.7.0 | ACCEPTED_LIMITATION | PRESENT | PASS | QUALIFIED_NEGATIVE | ACCEPTED |
| AC-LIM-0040 | Voice/model shared-session cost allocation is incomplete | v4.7.0 | PARTIALLY_RESOLVED | PRESENT | PASS | PARTIAL | EXTERNAL |
| AC-LIM-0041 | Arbitrary spoken job parameters are not supported | v4.7.0 | ACCEPTED_LIMITATION | PARTIAL | PASS | NOT_QUALIFIED | ACCEPTED |
| AC-LIM-0042 | Safari and iOS presentation remain unqualified | v4.7.0 | NEEDS_REQUALIFICATION | PRESENT | PARTIAL | NOT_QUALIFIED | QUALIFICATION_ONLY |
| AC-LIM-0043 | Mobile viewport evidence is not physical handset qualification | v4.7.0 | NEEDS_REQUALIFICATION | PRESENT | PASS | NOT_QUALIFIED | QUALIFICATION_ONLY |
| AC-LIM-0044 | Whole-node resource samples do not establish per-job CPU/GPU attribution | v4.7.0 | PARTIALLY_RESOLVED | PRESENT | PASS | PARTIAL | ENGINEERING |
| AC-LIM-0045 | AVF/pKVM nested execution unqualified | v4.8.0 | NEEDS_REQUALIFICATION | PARTIAL | PARTIAL | NOT_QUALIFIED | QUALIFICATION_ONLY |
| AC-LIM-0046 | Resident worker daemon inside nested guest unqualified | v4.8.0 | OPEN | NOT_IMPLEMENTED | NOT_QUALIFIED | NOT_QUALIFIED | ENGINEERING |
| AC-LIM-0047 | Physical network-loss recovery for nested routes unqualified | v4.8.0 | NEEDS_REQUALIFICATION | PRESENT | PASS | NOT_QUALIFIED | QUALIFICATION_ONLY |
| AC-LIM-0048 | Docker and LXC discovery does not qualify physical execution | v4.8.0 | NEEDS_REQUALIFICATION | PRESENT | PASS | NOT_QUALIFIED | QUALIFICATION_ONLY |
| AC-LIM-0049 | Workspace favourites, search, project semantics, pagination and controlled activation deferred | v4.8.0 | OPEN | NOT_IMPLEMENTED | NOT_QUALIFIED | NOT_QUALIFIED | ENGINEERING |
| AC-LIM-0050 | Security-audit coverage is bounded and not universal assurance | v4.9.0 | ACCEPTED_LIMITATION | PRESENT | PASS | QUALIFIED | ACCEPTED |
| AC-LIM-0051 | Security sandbox physical qualification is Linux-specific | v4.9.0 | NEEDS_REQUALIFICATION | PARTIAL | PASS | NOT_QUALIFIED | QUALIFICATION_ONLY |
| AC-LIM-0052 | Native benchmark model acquisition and runtime portability are limited | v4.8.1 | ACCEPTED_LIMITATION | PARTIAL | PASS | PARTIAL | ACCEPTED |
| AC-LIM-0053 | Speculative decoding benefit is exact-combination specific | v4.8.1 | ACCEPTED_LIMITATION | PRESENT | PASS | QUALIFIED | ACCEPTED |
| AC-LIM-0054 | No distinct runtime containment kill scope | v4.10.0 | OPEN | NOT_IMPLEMENTED | NOT_QUALIFIED | NOT_QUALIFIED | ENGINEERING |
| AC-LIM-0055 | Dashboard lacks complete containment and recovery timeline | v4.10.0 | OPEN | PARTIAL | PARTIAL | NOT_QUALIFIED | ENGINEERING |
| AC-LIM-0056 | Some containment restart scenarios lack separate physical qualification | v4.10.0 | NEEDS_REQUALIFICATION | PRESENT | PASS | PARTIAL | QUALIFICATION_ONLY |
| AC-LIM-0057 | Pixel and remote containment remain physically unqualified | v4.10.0 | NEEDS_REQUALIFICATION | PRESENT | PASS | NOT_QUALIFIED | QUALIFICATION_ONLY |
| AC-LIM-0058 | Generic outbound-worker transport remains experimental | v4.10.0 | NEEDS_REQUALIFICATION | PRESENT | PASS | NOT_QUALIFIED | QUALIFICATION_ONLY |
| AC-LIM-0059 | Phone-hosted model and computer-use route remains unqualified | v4.10.0 | OPEN | PARTIAL | PASS | NOT_QUALIFIED | ENGINEERING |

## Resolved or superseded historical limitations

| ID | Limitation | First seen | Status | Resolution |
|---|---|---:|---|---|
| AC-LIM-0005 | Dynamic skill proposal, review, sandbox and promotion were absent | v3.1.0 | RESOLVED | v4.5.0 |
| AC-LIM-0006 | Safe selective retry was not implemented | v3.1.0 | RESOLVED | v4.8.1 |
| AC-LIM-0013 | Local Context Compiler had no qualified runtime or live benchmark | v3.3.1 | SUPERSEDED | v4.8.1 |
| AC-LIM-0016 | Physical multi-provider chain had not run | v3.5.0 | RESOLVED | v3.7.0 |
| AC-LIM-0017 | Automatic Spark/Job adoption remained disabled | v3.5.0 | SUPERSEDED | v4.5.0 |
| AC-LIM-0026 | Android local inference and benchmark league were absent | v4.6.0 | RESOLVED | v4.8.1 |

## Qualification-only candidates

- **AC-LIM-0002 — Android recovery depends on an existing authorised transport**: run a bounded physical qualification on the exact configured target through the v4.10 Work Board where its current adapter supports that target; preserve interruption, recovery and negative evidence. Production risk is low only in an isolated target/workspace.
- **AC-LIM-0007 — Remote artifact transport lacked qualification**: run a bounded physical qualification on the exact configured target through the v4.10 Work Board where its current adapter supports that target; preserve interruption, recovery and negative evidence. Production risk is low only in an isolated target/workspace.
- **AC-LIM-0011 — No approved desktop ChatGPT session bridge**: run a bounded physical qualification on Windows desktop browser, ChatGPT through the v4.10 Work Board where its current adapter supports that target; preserve interruption, recovery and negative evidence. Production risk is low only in an isolated target/workspace.
- **AC-LIM-0019 — Cross-adapter physical portability remained unexercised**: run a bounded physical qualification on the exact configured target through the v4.10 Work Board where its current adapter supports that target; preserve interruption, recovery and negative evidence. Production risk is low only in an isolated target/workspace.
- **AC-LIM-0024 — Physical Mallow/voice model conversation unqualified**: run a bounded physical qualification on the exact configured target through the v4.10 Work Board where its current adapter supports that target; preserve interruption, recovery and negative evidence. Production risk is low only in an isolated target/workspace.
- **AC-LIM-0027 — Phone battery, charging, thermal and metering telemetry were unavailable**: run a bounded physical qualification on Android, Pixel through the v4.10 Work Board where its current adapter supports that target; preserve interruption, recovery and negative evidence. Production risk is low only in an isolated target/workspace.
- **AC-LIM-0029 — Android background reliability and interruption breadth incomplete**: run a bounded physical qualification on Android through the v4.10 Work Board where its current adapter supports that target; preserve interruption, recovery and negative evidence. Production risk is low only in an isolated target/workspace.
- **AC-LIM-0030 — Additional phones and PWA launcher combinations unqualified**: run a bounded physical qualification on Android, PWA through the v4.10 Work Board where its current adapter supports that target; preserve interruption, recovery and negative evidence. Production risk is low only in an isolated target/workspace.
- **AC-LIM-0035 — Overnight unattended qualification was not physically demonstrated**: run a bounded physical qualification on the exact configured target through the v4.10 Work Board where its current adapter supports that target; preserve interruption, recovery and negative evidence. Production risk is low only in an isolated target/workspace.
- **AC-LIM-0042 — Safari and iOS presentation remain unqualified**: run a bounded physical qualification on Safari, iOS through the v4.10 Work Board where its current adapter supports that target; preserve interruption, recovery and negative evidence. Production risk is low only in an isolated target/workspace.
- **AC-LIM-0043 — Mobile viewport evidence is not physical handset qualification**: run a bounded physical qualification on the exact configured target through the v4.10 Work Board where its current adapter supports that target; preserve interruption, recovery and negative evidence. Production risk is low only in an isolated target/workspace.
- **AC-LIM-0045 — AVF/pKVM nested execution unqualified**: run a bounded physical qualification on Android, AVF, pKVM through the v4.10 Work Board where its current adapter supports that target; preserve interruption, recovery and negative evidence. Production risk is low only in an isolated target/workspace.
- **AC-LIM-0047 — Physical network-loss recovery for nested routes unqualified**: run a bounded physical qualification on the exact configured target through the v4.10 Work Board where its current adapter supports that target; preserve interruption, recovery and negative evidence. Production risk is low only in an isolated target/workspace.
- **AC-LIM-0048 — Docker and LXC discovery does not qualify physical execution**: run a bounded physical qualification on Docker, LXC through the v4.10 Work Board where its current adapter supports that target; preserve interruption, recovery and negative evidence. Production risk is low only in an isolated target/workspace.
- **AC-LIM-0051 — Security sandbox physical qualification is Linux-specific**: run a bounded physical qualification on Windows, Android, macOS through the v4.10 Work Board where its current adapter supports that target; preserve interruption, recovery and negative evidence. Production risk is low only in an isolated target/workspace.
- **AC-LIM-0056 — Some containment restart scenarios lack separate physical qualification**: run a bounded physical qualification on the exact configured target through the v4.10 Work Board where its current adapter supports that target; preserve interruption, recovery and negative evidence. Production risk is low only in an isolated target/workspace.
- **AC-LIM-0057 — Pixel and remote containment remain physically unqualified**: run a bounded physical qualification on Android, remote workers through the v4.10 Work Board where its current adapter supports that target; preserve interruption, recovery and negative evidence. Production risk is low only in an isolated target/workspace.
- **AC-LIM-0058 — Generic outbound-worker transport remains experimental**: run a bounded physical qualification on the exact configured target through the v4.10 Work Board where its current adapter supports that target; preserve interruption, recovery and negative evidence. Production risk is low only in an isolated target/workspace.

## Engineering required

- **AC-LIM-0003 — Opaque external CLI tools are not universally policy-mediated**: gap remains in Security; reuse the existing v4.10 authority, containment and evidence contracts rather than creating a second control path.
- **AC-LIM-0004 — Universal verification-to-acceptance coverage is incomplete**: gap remains in Core orchestration; reuse the existing v4.10 authority, containment and evidence contracts rather than creating a second control path.
- **AC-LIM-0010 — Durable ledgers rewrite complete snapshots**: gap remains in Evidence/observability; reuse the existing v4.10 authority, containment and evidence contracts rather than creating a second control path.
- **AC-LIM-0012 — Physical ChatGPT Android UI route unqualified**: gap remains in Remote/mobile; reuse the existing v4.10 authority, containment and evidence contracts rather than creating a second control path.
- **AC-LIM-0015 — ACP packaging/conformance and shared-token principal isolation were incomplete**: gap remains in Security; reuse the existing v4.10 authority, containment and evidence contracts rather than creating a second control path.
- **AC-LIM-0023 — Browser/computer tasks lacked fully governed evaluator evidence**: gap remains in Benchmarks; reuse the existing v4.10 authority, containment and evidence contracts rather than creating a second control path.
- **AC-LIM-0037 — Additional runtime/API and subjective judge adapters incomplete**: gap remains in Benchmarks; reuse the existing v4.10 authority, containment and evidence contracts rather than creating a second control path.
- **AC-LIM-0038 — Rules-builder UI and physical household automation absent**: gap remains in Dashboard; reuse the existing v4.10 authority, containment and evidence contracts rather than creating a second control path.
- **AC-LIM-0044 — Whole-node resource samples do not establish per-job CPU/GPU attribution**: gap remains in Evidence/observability; reuse the existing v4.10 authority, containment and evidence contracts rather than creating a second control path.
- **AC-LIM-0046 — Resident worker daemon inside nested guest unqualified**: gap remains in Remote/mobile; reuse the existing v4.10 authority, containment and evidence contracts rather than creating a second control path.
- **AC-LIM-0049 — Workspace favourites, search, project semantics, pagination and controlled activation deferred**: gap remains in Dashboard; reuse the existing v4.10 authority, containment and evidence contracts rather than creating a second control path.
- **AC-LIM-0054 — No distinct runtime containment kill scope**: gap remains in Containment; reuse the existing v4.10 authority, containment and evidence contracts rather than creating a second control path.
- **AC-LIM-0055 — Dashboard lacks complete containment and recovery timeline**: gap remains in Dashboard; reuse the existing v4.10 authority, containment and evidence contracts rather than creating a second control path.
- **AC-LIM-0059 — Phone-hosted model and computer-use route remains unqualified**: gap remains in Remote/mobile; reuse the existing v4.10 authority, containment and evidence contracts rather than creating a second control path.

## Accepted boundaries

- **AC-LIM-0008 — Authenticated Facebook discovery and LocalWalks publishing were fixture-only**: retain as an explicit conservative/product or evidence boundary.
- **AC-LIM-0009 — Providers without streaming usage cannot expose live token/cost counters**: retain as an explicit conservative/product or evidence boundary.
- **AC-LIM-0018 — Small local model quality remained weak**: retain as an explicit conservative/product or evidence boundary. A negative model result is retained; it is not a framework defect.
- **AC-LIM-0020 — Retrieval remained opt-in and route-specific**: retain as an explicit conservative/product or evidence boundary.
- **AC-LIM-0022 — Preferred routing requires multi-day evidence and approval**: retain as an explicit conservative/product or evidence boundary.
- **AC-LIM-0025 — Some speech/model providers expose only complete results, not streaming**: retain as an explicit conservative/product or evidence boundary.
- **AC-LIM-0028 — Handset resource feasibility varies under live load**: retain as an explicit conservative/product or evidence boundary.
- **AC-LIM-0039 — Local speech synthesis was too slow for natural real-time voice**: retain as an explicit conservative/product or evidence boundary.
- **AC-LIM-0041 — Arbitrary spoken job parameters are not supported**: retain as an explicit conservative/product or evidence boundary.
- **AC-LIM-0050 — Security-audit coverage is bounded and not universal assurance**: retain as an explicit conservative/product or evidence boundary.
- **AC-LIM-0052 — Native benchmark model acquisition and runtime portability are limited**: retain as an explicit conservative/product or evidence boundary.
- **AC-LIM-0053 — Speculative decoding benefit is exact-combination specific**: retain as an explicit conservative/product or evidence boundary.

## External blockers

- **AC-LIM-0001 — OpenAI ChatKit thread access remained live-unqualified**: requires authorised external evidence or infrastructure; Agent Control must continue to report unavailable rather than infer it.
- **AC-LIM-0014 — Authoritative provider monetary cost is often unavailable**: requires authorised external evidence or infrastructure; Agent Control must continue to report unavailable rather than infer it.
- **AC-LIM-0021 — Authoritative current-context occupancy unavailable on local endpoints**: requires authorised external evidence or infrastructure; Agent Control must continue to report unavailable rather than infer it.
- **AC-LIM-0031 — Positive billed-cache behavior and delayed corrections unqualified**: requires authorised external evidence or infrastructure; Agent Control must continue to report unavailable rather than infer it.
- **AC-LIM-0032 — Attributable per-job and baseline electricity unavailable**: requires authorised external evidence or infrastructure; Agent Control must continue to report unavailable rather than infer it.
- **AC-LIM-0033 — Electricity tariff evidence unavailable**: requires authorised external evidence or infrastructure; Agent Control must continue to report unavailable rather than infer it.
- **AC-LIM-0034 — Whole-node energy lacks defensible sensor binding**: requires authorised external evidence or infrastructure; Agent Control must continue to report unavailable rather than infer it.
- **AC-LIM-0036 — External notifications and source integrations require configured destinations**: requires authorised external evidence or infrastructure; Agent Control must continue to report unavailable rather than infer it.
- **AC-LIM-0040 — Voice/model shared-session cost allocation is incomplete**: requires authorised external evidence or infrastructure; Agent Control must continue to report unavailable rather than infer it.

## Related to the v4.11 Model Improvement Loop

- **AC-LIM-0009 — Providers without streaming usage cannot expose live token/cost counters** (ACCEPTED_LIMITATION). The v4.11 release does not close this limitation.
- **AC-LIM-0014 — Authoritative provider monetary cost is often unavailable** (EXTERNAL_BLOCKER). The v4.11 release does not close this limitation.
- **AC-LIM-0018 — Small local model quality remained weak** (ACCEPTED_LIMITATION). The v4.11 release does not close this limitation.
- **AC-LIM-0019 — Cross-adapter physical portability remained unexercised** (NEEDS_REQUALIFICATION). The v4.11 release does not close this limitation.
- **AC-LIM-0020 — Retrieval remained opt-in and route-specific** (ACCEPTED_LIMITATION). The v4.11 release does not close this limitation.
- **AC-LIM-0021 — Authoritative current-context occupancy unavailable on local endpoints** (EXTERNAL_BLOCKER). The v4.11 release does not close this limitation.
- **AC-LIM-0022 — Preferred routing requires multi-day evidence and approval** (ACCEPTED_LIMITATION). The v4.11 release does not close this limitation.
- **AC-LIM-0031 — Positive billed-cache behavior and delayed corrections unqualified** (EXTERNAL_BLOCKER). The v4.11 release does not close this limitation.
- **AC-LIM-0032 — Attributable per-job and baseline electricity unavailable** (EXTERNAL_BLOCKER). The v4.11 release does not close this limitation.
- **AC-LIM-0033 — Electricity tariff evidence unavailable** (EXTERNAL_BLOCKER). The v4.11 release does not close this limitation.
- **AC-LIM-0034 — Whole-node energy lacks defensible sensor binding** (EXTERNAL_BLOCKER). The v4.11 release does not close this limitation.
- **AC-LIM-0035 — Overnight unattended qualification was not physically demonstrated** (NEEDS_REQUALIFICATION). The v4.11 release does not close this limitation.
- **AC-LIM-0037 — Additional runtime/API and subjective judge adapters incomplete** (OPEN). The v4.11 release does not close this limitation.
- **AC-LIM-0040 — Voice/model shared-session cost allocation is incomplete** (PARTIALLY_RESOLVED). The v4.11 release does not close this limitation.
- **AC-LIM-0044 — Whole-node resource samples do not establish per-job CPU/GPU attribution** (PARTIALLY_RESOLVED). The v4.11 release does not close this limitation.
- **AC-LIM-0052 — Native benchmark model acquisition and runtime portability are limited** (ACCEPTED_LIMITATION). The v4.11 release does not close this limitation.
- **AC-LIM-0053 — Speculative decoding benefit is exact-combination specific** (ACCEPTED_LIMITATION). The v4.11 release does not close this limitation.

## v4.11 release reconciliation

The v4.11 release carries all 59 audited v4.10 records forward and adds three records. It does not close or rewrite any historical item.

- **AC-LIM-0060 — Only PROMPT intervention application is physically qualified** (`NEEDS_REQUALIFICATION`). The contract is generic; other adapter kinds remain unqualified.
- **AC-LIM-0061 — Generic canary allocation is not implemented** (`ACCEPTED_LIMITATION`). No simulated percentage routing is presented as operational control.
- **AC-LIM-0062 — Promotion scope is qualified only on a disposable prompt route** (`NEEDS_REQUALIFICATION`). Arbitrary production routes require their own evidence.

Existing limitations for provider monetary cost, attributable experiment energy, tariffs, whole-node sensor binding, and model-improvement break-even remain unchanged. The release gate checks accounting integrity; accepted and external limitations do not fail a release merely because they remain visible.

## Silent-drop and stale-document review

The ledger flags limitations that disappeared from later release summaries without suitable closure evidence as `SILENTLY_DROPPED`. Their source documents are historical, not wrong. No current v4.10 operational document was proven stale enough to rewrite during this audit. Future documentation should link this ledger instead of copying a release-specific list.

## Minimal dashboard proposal

Render the current ledger as a read-only projection grouped by status and subsystem. Drill-down should show first appearance, release history, separate implementation/automated/physical/production states, closure criteria and evidence references. The JSON ledger remains authority; the dashboard must not maintain a second status store.

## Minimal future release gate

A release gate should load the previous tagged ledger, require every unresolved ID to be explicitly carried forward, resolved with qualifying evidence, partially resolved, superseded or accepted, and reject deletion or an unknown status. New IDs require a first evidence reference. A deterministic consistency check is sufficient; no model judgment is needed.

## Validation

- All public tags returned by `git tag --sort=version:refname` were inventoried.
- Every record has a unique stable ID, controlled status, first release, source evidence and four-part qualification state.
- `RESOLVED` records require a resolution release and evidence.
- Physical limitations cannot be resolved with automated evidence alone.
- Release metrics are generated from the same ledger rather than maintained independently.

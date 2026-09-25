# Agent Control 4.6 release integration

This is an unreleased integration candidate. **Core release: PASS. Showcase: PASS WITH LIMITATIONS for implemented demonstrations; the complete target-model chain remains incomplete.** See the [formal RC assessment](release-candidate-4.6.md). Optional Android inference, metered-provider billing and whole-node energy do not block a core release. No missing measurement becomes a PASS.

## Ancestry and evidence

Integration starts from Android checkpoint `720577b8aa82c78a8f0ae6156b8d826e868e3502` and merges public preparation `2d30ceb2ab24126e7c2c95c30c89e13fdff942c3`. Their shared ancestor is `26522925aa95cd9668025a0817ead2c044e9689b`. Usage/energy closure `5bbdf0b09410a608e7b185a0d58d05d9d8fd023e` is already an ancestor of both; it is not replayed or duplicated. Integration uses a new worktree; existing checkouts, release tags and running production services are preserved.

The [Android physical report](android-standalone-qualification.md), [usage/energy closure](usage-energy-physical-closure-4.6.md) and [public preparation report](public-release-readiness-4.6.md) remain historical evidence. Their earlier overall release judgments predate the operator's revised release classification. The [current limitations register](known-limitations-4.6.md) governs the current RC assessment.

## Complete scope reconciliation

| Capability | Current status | Remaining work and release treatment |
| --- | --- | --- |
| Small public Job Library and external catalogue | COMPLETE within existing qualification | Preserve canonical jobs, contribution simplicity and readiness boundaries. |
| Environment Discovery, Estate and Process | PASS WITH LIMITATIONS | Existing real native run/resource trace retained; optional adapters remain qualification-specific. Current regression and browser checks required. |
| Mallow workflow creation | PASS WITH LIMITATIONS | Deterministic proposal, exact approval and local execution are real. Arbitrary language/workload planning is not claimed. |
| Android standalone controller | PASS WITH LIMITATIONS | Real local control plane and jobs on Pixel. Optional Android inference/telemetry are non-blocking limitations. |
| Usage, token and component-energy intelligence | PASS WITH LIMITATIONS | Measured native usage and component intervals retained. Billing, tariffs, attribution and whole-node measurements remain BLOCKED_EXTERNAL. |
| Model Intelligence | PASS WITH LIMITATIONS | Source adapters, retained change history, compatibility and native watch jobs exist. This integration adds honest source coverage and baseline/follow-up reporting. |
| Morning Intelligence Brief | PASS WITH LIMITATIONS | Completed-native result counting, unavailable-source handling, comparisons and actionable next steps are implemented; two real native source workflows and original browser captures passed. |
| Local LLM Benchmark Suite and personal league | IN PROGRESS | Typed adapter, sandbox, result validation and ranking exist. Exact-plan physical target execution is separately approved; no unseen result is claimed. |
| Lightweight governed rules | PASS WITH LIMITATIONS | Typed check/condition/action/verify controls are tested. Full rules-builder UI is NOT STARTED; household action remains separately authorised. |
| Notifications and additional external feeds | BLOCKED_EXTERNAL | No destination is configured. In-product evidence remains available. |
| Overnight unattended operation | PASS WITH LIMITATIONS | Schedule and reconciliation contracts are tested; overnight-duration physical proof remains open and is not a core blocker. |
| Locked release dependencies | COMPLETE | Linux, Windows and Android bootstraps prefer the lockfile with lifecycle scripts disabled, preserving old no-lock checkout compatibility. Fresh Linux, Windows and physical Pixel bootstrap passed. |
| RC packaging, notes and publication | IN PROGRESS | Run the formal gate. Final tagging/publication waits for operator review. |

## Gate interpretation

`npm run check:release-rc` evaluates core installation, upgrade, regression, typecheck, governance/security, Estate/Process consistency, distribution, documentation, screenshot and version checks. An absent, failed, unevidenced or source-stale check fails the core gate. Core-impact limitations cannot be marked non-blocking. A successful core assessment does not convert the separate showcase or subsystem states into PASS.

`npm run check:showcase` retains real benchmark and screenshot evidence requirements for the complete showcase. Missing optional Android benchmarking and overnight-duration qualification are reported as limitations, not general core failures. The [machine-readable scope](../examples/showcase-4.6/release-integration/scope.json) and [limitations](../examples/showcase-4.6/known-limitations.json) explain the classification.

## Changes in this checkpoint

The Morning Brief distinguishes initial observations from new releases and incomplete sources from verified no-change observations. It counts unique, complete, native results for the selected benchmark only, retains failed/interrupted/unverified outcomes, and displays quality/resource tradeoffs without granting routing authority.

RC dependency installation uses the committed npm lockfile and integrity hashes. Older checkouts without a lockfile retain the previous safe installation path. No runtime build step or package lifecycle script is enabled.

Current validation results and the absence of observed true core release blockers are recorded in the final RC receipt. All 1,464 regression tests passed. No tag or final publication is authorised by this document.

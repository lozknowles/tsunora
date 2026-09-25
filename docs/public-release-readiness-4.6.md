# Agent Control 4.6 public release readiness

**NOT READY FOR 4.6 RELEASE.** Public installation and documentation preparation passes within the Linux qualification scope below. The complete showcase gate remains incomplete.

## Release truth

| Item | Observed value |
| --- | --- |
| Candidate version | 4.6.0-rc.1 — unreleased |
| Branch | `feature/4.6-model-intelligence-showcase` |
| Current qualified code SHA | `4139185948179751485c05bad6629187b94914f2` |
| Public install / stable-upgrade SHA | `a15dada53f0c3e0d2f4f3fd00da7cad936dc494e` |
| Starting Usage & Energy checkpoint | `5bbdf0b09410a608e7b185a0d58d05d9d8fd023e` |
| Stable public release | [v4.5.1](https://github.com/lozknowles/agent-control/releases/tag/v4.5.1) |
| Stable main observed at preparation | `a2cd9c9d8a12dbf8ff16fae61940d8e353bcf0c9` |

At preparation start, the candidate branch and its remote both pointed to the supplied checkpoint; no later candidate work was discarded. The work used the isolated showcase checkout. The published 4.5.1 controller-local worker fix and relevant configuration/discovery/map fixes were carried forward by source path; this was not a merge of main over candidate work.

The final code delta after physical installation/upgrade is only the map breadcrumb cleanup. Server, dependency, bootstrap and configuration sources are unchanged. Both disposable clean checkouts fetched that public commit, and its actual browser surface passed the focused regression. The containing documentation commit can be inspected through this report's GitHub history; the delivery receipt records the final pushed SHA.

## Results

| Deliverable / gate | Result | Evidence / scope |
| --- | --- | --- |
| README | PASS | [Public front door](../README.md), stable/candidate distinction, actual images and short install path |
| Installation guide | PASS | [Illustrated guide](installation-first-run.md), actual clone/bootstrap/start/discovery/job journey |
| Real screenshots | 13 | [Gallery](public-installation-journey.md), [checksums and provenance](../examples/showcase-4.6/public-preparation/screenshots.json) |
| One-page overview | PASS | [Web image](provenance/EXTERNAL-EVIDENCE.md), [2× image](provenance/EXTERNAL-EVIDENCE.md), [editable HTML composition](provenance/EXTERNAL-EVIDENCE.md) |
| Crew assets | VERIFIED | Seven original product portrait captures; [established roles](crew-guide.md); Mallow public naming |
| Virgin install | PASS | Disposable public GitHub clone; Node.js 24.21.0, npm 11.19.0, Git 2.39.5 |
| Existing-install upgrade | PASS | Actual v4.5.1 runtime with published sanitized existing-config fixture; preserved configuration and history |
| Discovery | PASS | Completed with 50 observations, zero adapter failures, one machine, no GPU/model/provider |
| Estate Map | PASS | Real topology, liveness, qualification distinction and public inspector |
| Process Map | PASS | Approved observation job; observe and verify succeeded; final breadcrumb regression passed |
| Usage & Cost | PASS within qualified local scope | Current UI replay preserves 3 native calls and 1,062 tokens; metered billing remains blocked |
| Energy | PASS WITH LIMITATIONS | Physical component interval history retained; attribution and whole-node limits unchanged |
| Full test suite | 1,438 / 1,438 PASS | Fresh complete `npm run check` on final code; zero failures, skipped or cancelled tests |
| Typecheck | PASS | `tsc --noEmit` |
| Browser | PASS | Fresh install and stable upgrade, actual UI approval/Process/Discovery, no page errors; 390 × 844 has no document-width overflow |
| Privacy | PASS | Visual inspection and OCR; [privacy record](../examples/showcase-4.6/public-preparation/privacy.json) |
| Documentation links | PASS — 106 local links / anchors | Relative files, anchors, images and external public links |
| Source distribution | PASS | Source-distribution validation; repeated after adding public media |
| Public GitHub rendering | PASS: Windows Chrome rendered all 4 README and 13 gallery images; 6 external links returned HTTP 200; 22 raw assets matched SHA-256. See github-validation.json. | Branch preview and image loading are checked after the documentation push |
| Complete showcase release gate | INCOMPLETE | No malformed manifest entries; six original showcase conditions plus Android Standalone remain open |

[Machine-readable qualification summary](../examples/showcase-4.6/public-preparation/qualification.json).

## Physical virgin-install method

The test used a fresh `node:24-bookworm` container with image digest `sha256:6dac556d980b7f0e5498d08f08cee0ca67798b4ad6c23964a9214920e67758d0`. It cloned the public development branch and ran the README's bootstrap check and install commands in a new checkout.

The dashboard ran with an isolated private operator token and no provider credentials. The browser authenticated, followed the documented controls, discovered the local environment, reviewed a sealed Mallow proposal and explicitly approved `operator-system-observation@1.1.0`. Both observation and independent verification finished **SUCCEEDED**.

Harness-only differences: token entry was automated privately, the server bound inside its isolated container, and a host-loopback port forward required an exact allowed-origin entry. The first forwarded-port attempt was correctly denied with `origin_denied`; this harness error was corrected without weakening product policy. Public local installation continues to use the documented loopback default.

The normal discovery scan was too fast for an informative progress image. A separate real scan at a 0.05 CPU quota captured actual adapter activity; the quota was then removed. No fixture results, fake pending states or artificial network delays were inserted. The browser confirmed zero residual 400 ms progress polls after completion.

## Existing-install upgrade

The prior installation was cloned from public **v4.5.1** and run with the repository's published sanitized pre-4.5 existing-configuration fixture. This preserves authentic policy/identity/numeric configuration shape while carrying no private credentials. It is not a copy of the operator's production installation.

The prior stable runtime first completed a real governed observation job. After stopping it, the documented separate-checkout upgrade copied **21 state files**. All 21 were byte-identical after candidate bootstrap. After candidate startup and another approved observation job:

- Configuration remained byte-identical.
- The original run identity, state and step evidence remained unchanged.
- The original and new runs were both **SUCCEEDED**.
- Discovery and Estate remained available.
- The built-in observer retained trusted controller-local identity without relaxing remote or unknown-worker safety.

The final candidate static-asset update was then browser-verified. No production service was replaced, restarted or deployed.

## UX findings addressed

- The public guide now uses the actual first button label, **Authenticate to start discovery**, followed by **Discover my environment**.
- Mallow is the public steward name, including tour prompts. Existing crew art, compatibility identifiers and historical records remain intact.
- Bootstrap preserves existing numeric policy values and safely handles filesystems that do not support hard links.
- Trusted controller-local registration prevents the earlier upgrade-only misclassification.
- Registry availability is separate from observed running work; stale or missing evidence stays explicit.
- Discovery stops its progress timer when the scan ends.
- Switching map surfaces clears the previous inspector breadcrumb.
- Installation, upgrade, security, contribution guidance, release notes and evidence now have an obvious documentation entry point.

The first ten minutes were qualified in a desktop browser and a mobile viewport. This does not establish a physical phone installation or a model/provider qualification.

## Usage & Energy remains PASS WITH LIMITATIONS

The earlier subsystem checkpoint had 1,428 passing tests. The new complete code check has **1,438**. The physical usage/energy history itself is unchanged.

Current-interface screenshots replay a copy of that sealed history: three native local calls, **186 input + 876 output = 1,062 tokens**, three successful exact-output validators. Two normal physical measurement runs had **100%** coverage; the controlled sampling gap had **66.96%** coverage and excluded missing intervals. Historical failed qualification evidence remains intact.

The replay made no new inference request or energy measurement. Its older Estate observation is correctly stale. Subscription-included Codex remains non-metered for monetary billing qualification.

## Remaining release conditions and limitations

The complete `npm run check:showcase` gate reports these six unmet conditions:

1. An approved, measured target-model benchmark result.
2. A real **active** Process Map showcase capture. The published observation-job capture is completed execution, not active-work proof.
3. A reviewed personal benchmark league showcase capture.
4. A reviewed Model Intelligence showcase capture.
5. A reviewed morning-brief showcase capture.
6. Real overnight-duration qualification.

The subsequent Android Standalone steer adds a further mandatory 4.6 demonstration. Its Android-hosted controller, physical device installation, local job, model provisioning and benchmark acceptance are not covered by this Linux/public-documentation checkpoint and remain open.

The following physical dependencies remain **BLOCKED_EXTERNAL**:

- Metered API billing.
- Positive physical cache billing.
- Attributable per-job/baseline energy.
- Physical electricity tariff qualification.
- Whole-node electricity.

The authorised estate had no additional known metered provider or defensible sensor-to-machine whole-node binding. No account, credential, paid call or device/Home Assistant configuration was created merely to close a gate. Shared-GPU component energy is **NOT_ATTRIBUTABLE** to a job; UPS load percentage is not converted into watts. No whole-node or cloud-energy claim is made. [Authoritative physical closure](usage-energy-physical-closure-4.6.md).

Qualification platform scope is Linux in disposable Docker environments, plus browser viewports. Other platform scripts and private integration configurations require their own physical acceptance. The source bootstrap deliberately installs without a lockfile; the exact observed runtime versions are recorded above.

## Release decision and public links

**NOT READY FOR 4.6 RELEASE.** The valid documentation and assets are published only on the development branch.

- [Candidate GitHub preview](https://github.com/lozknowles/agent-control/tree/feature/4.6-model-intelligence-showcase)
- [Candidate README](https://github.com/lozknowles/agent-control/blob/feature/4.6-model-intelligence-showcase/README.md)
- [Installation guide](https://github.com/lozknowles/agent-control/blob/feature/4.6-model-intelligence-showcase/docs/installation-first-run.md)
- [Candidate notes](release-notes-4.6.0-rc.1.md)
- [Current stable release](https://github.com/lozknowles/agent-control/releases/tag/v4.5.1)

Main, tags, GitHub releases and production deployment are not promoted by this work. Explicit operator authorisation remains required after the complete release gate passes.

## Files changed from the supplied checkpoint

```text
CONTRIBUTING.md
README.md
SECURITY.md
assets/dashboard/dashboard-environment-discovery.js
assets/dashboard/dashboard-poe.js
assets/dashboard/dashboard-runtime-map.js
assets/dashboard/index.html
docs/DEPLOYMENT.md
docs/crew-guide.md
docs/index.md
docs/installation-first-run.md
docs/media/4.6/public/01-first-dashboard.png
docs/media/4.6/public/02-setup.png
docs/media/4.6/public/03-discovery-running.png
docs/media/4.6/public/04-discovery-results.png
docs/media/4.6/public/05-estate.png
docs/media/4.6/public/06-inspector.png
docs/media/4.6/public/07-process.png
docs/media/4.6/public/08-usage.png
docs/media/4.6/public/09-energy.png
docs/media/4.6/public/10-crew.png
docs/media/4.6/public/11-mallow.png
docs/media/4.6/public/12-mallow-proposal.png
docs/media/4.6/public/13-mobile.png
docs/media/4.6/public/cadence-asset.png
docs/media/4.6/public/lumen-asset.png
docs/media/4.6/public/mallow-asset.png
docs/media/4.6/public/overview-2x.jpg
docs/media/4.6/public/overview.html
docs/media/4.6/public/overview.png
docs/media/4.6/public/quill-asset.png
docs/media/4.6/public/relay-asset.png
docs/media/4.6/public/rook-asset.png
docs/media/4.6/public/verity-asset.png
docs/public-installation-journey.md
docs/public-release-readiness-4.6.md
docs/release-notes-4.6.0-rc.1.md
docs/showcase-4.6-status.md
docs/upgrade-4.6.md
examples/showcase-4.6/public-preparation/doc-links.json
examples/showcase-4.6/public-preparation/privacy.json
examples/showcase-4.6/public-preparation/qualification.json
examples/showcase-4.6/public-preparation/screenshots.json
examples/showcase-4.6/showcase-manifest.json
scripts/bootstrap-agent-control.test.mjs
scripts/config.mjs
scripts/init-config.test.mjs
src/control/environment-discovery.test.ts
src/control/environment-discovery.ts
src/control/estate-map.test.ts
src/control/estate-map.ts
src/control/estate-readiness-presentation.ts
src/control/fixtures/v4.1-existing-configuration.json
src/control/governed-git-actions.test.ts
src/control/host-identity.ts
src/control/job-bootstrap.test.ts
src/control/job-runtime.test.ts
src/control/job-runtime.ts
src/control/job-types.ts
src/control/poe-browser-api.test.ts
src/control/poe-knowledge.test.ts
src/control/poe-knowledge.ts
src/control/poe-model.test.ts
src/control/poe-observation-job.ts
src/control/poe.test.ts
src/control/runtime-map-web.test.ts
src/control/runtime-safety-supervisor.test.ts
src/control/runtime-safety-supervisor.ts
src/control/social-voice.test.ts
src/control/social-voice.ts
src/control/worker-locality-upgrade.test.ts
src/web.ts
```

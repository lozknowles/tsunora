# Agent Control 4.7 observability qualification

The follow-on connects Estate, physical Node Dashboards, the existing Process Map, exact Run Inspector operations, canonical accounting and permanent readable history. **Implementation and the recorded browser paths are qualified with the limitations below. This is a follow-on candidate, not a replacement or retagging of published v4.7.0.**

## Source and checks

- Branch: `feature/4.7-observability-navigation`.
- Public base: `27124db3d5924b1244be590ef3ea48d4c3b183bc` (v4.7.0).
- Tested implementation: `201a8de4e4075bfb04d0fe79bac6f86ac16d0988`.
- Complete `npm run check`: **1,536 passed, 0 failed, 0 skipped**.
- Focused observability and application-service tests: **37 passed**. This includes 25 observability tests and the existing service tests plus two new ownership-return regressions. There are 27 additional tests compared with the public base.
- Desktop 1440 × 1000 and mobile 390 × 844: **13 browser checks each passed**, including controlled multi-node and delayed-refresh regression responses. Those controlled responses were not used for the real run/video evidence.
- Real-run completed-evidence navigation: **PASS** on both viewports, without browser errors or horizontal overflow. The downloaded Markdown exactly equals the canonical history.
- Every shown evidence view pauses for at least two seconds. The running timer remains visible while content scrolls; terminal timers freeze, and reduced-motion preferences disable the pulse.

Application changes were sealed in an isolated proposal checkout and applied to the feature checkout through normal `repository.git-governed` jobs. The operational installation and published tags were not modified. Documentation-only commits following the implementation pin do not change the tested runtime.

## What the real runs found

The first two reviews completed with findings. They exposed node-navigation context errors, missing canonical throughput lookup, accelerator-inventory cache isolation, CPU interval handling, missing accelerator measurements and detailed accounting beyond the 1,000-row summary cap. These were corrected and regression-tested.

The final retained review, `259e0908-899b-485a-926b-c8cbe5ec4fe0`, remains **FAILED**. Its tree-only chunk declared insufficient evidence; the remaining chunks produced inspectable findings. This is not a clean whole-repository review, and the immutable verdict has not been rewritten.

Its supported findings led to map-opening-scoped origin handling, serialized refreshes, complete node-projection invalidation and ownership-return preflight. Returning ownership now rejects an empty session set and validates all human-owned sessions before transferring any. The high-severity claim about arbitrary dashboard actors is not applicable to the current authenticated HTTP path: `web-server.ts` binds mutation actors to `web-operator`, and the dashboard supports that single principal. Multi-principal support is not claimed.

## Actual accounting and evidence

The recorded final review has 4 accounted calls: **218,511 input; 90,752 cached input; 127,759 fresh input; 5,768 output; 224,279 total tokens**. Cache reuse is derived as 41.5%. Missing monetary cost and savings remain unavailable. Existing subscription-included execution was used; no OpenRouter calls, new credentials, accounts, credit purchases or spending-limit changes were made.

[Desktop and mobile recordings, manifests and checksums](https://github.com/lozknowles/agent-control-qualification-evidence/releases/tag/agent-control-4.7-observability).

The videos join two actual interaction captures of the same immutable run. The live segment was captured on `3eaf24ccb78945c9ac589c3cddf8a7b5498d59a2`; the completed-evidence segment uses the tested implementation above. One cut omits waiting and the recorder retry; playback speed is unchanged. The recorded review source stays pinned to its original commit. The job's FAILED outcome and its individually completed model calls are shown separately. Browser qualification PASS does not turn that review into PASS.

Video binaries remain in the separate evidence repository's assets, outside normal product pulls. The main repository holds documentation and evidence links only.

## Boundaries

- Live resources were measured on the existing Linux controller. Whole-node CPU/RAM and whole-device GPU/VRAM are not per-job allocations; sampling does not renew discovery qualification.
- Mobile evidence is browser emulation, not physical Pixel qualification. Windows/Android native telemetry is not physically qualified by these recordings.
- Live voice, physical audio and network handoff remain under the existing [4.7 limitations](known-limitations-4.7.md). Mallow text uses the same governed evidence projections; voice is optional.
- No baton handoff occurred in the recorded run. Context selection, provider prompt caching, persistent memory and baton state are labelled separately.
- Provider context-window occupancy, generation-only throughput and defensible monetary savings remain unavailable when not reported.
- Formal release publication remains a separate gate. No new product tag, merge to main, estate restart or production deployment is claimed here.

See [How do I see what Agent Control is doing?](observability-4.7.md).

## Changed implementation files

- `CHANGELOG.md`
- `README.md`
- `assets/dashboard/dashboard-observability-model.js`
- `assets/dashboard/dashboard-observability.css`
- `assets/dashboard/dashboard-observability.js`
- `assets/dashboard/dashboard-runtime-map.js`
- `assets/dashboard/index.html`
- `docs/index.md`
- `docs/known-limitations-4.7.md`
- `docs/observability-4.7.md`
- `package.json`
- `src/control/application-service.test.ts`
- `src/control/application-service.ts`
- `src/control/node-resources.ts`
- `src/control/observability-navigation.test.ts`
- `src/control/observability-web.test.ts`
- `src/control/observability.test.ts`
- `src/control/observability.ts`
- `src/control/poe.ts`
- `src/control/usage-projection.ts`
- `src/control/web-server.ts`

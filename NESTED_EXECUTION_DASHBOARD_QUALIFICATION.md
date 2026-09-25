# Nested Execution Dashboard Qualification

## 1. Executive result

**APPROVE WITH LIMITATIONS.** Agent Control can now project an evidence-backed nested execution hierarchy into the production Estate Map, Node Dashboard, and Run Inspector without introducing Podroid-specific product logic. A fresh physical Pixel 8 Pro execution was routed through Android 17, an Alpine Linux 3.24.1 QEMU guest, SSH, and Podman 5.8.6. The resulting governed Job Run and retained artifact were then navigated in the candidate dashboard on desktop, portrait mobile, and landscape mobile.

The remaining limitations are unchanged qualification boundaries: AVF/pKVM, a resident worker daemon, physical network-loss recovery, and autonomous self-extension remain unqualified. This parcel did not deploy or qualify the candidate in a production installation.

## 2. Source commit

- Reviewed generic integration candidate: `ba362a770fa399b072be24ca405e9ce86ffdf4dc`
- Product version: Agent Control 4.7.1
- Candidate commit: `e5d9c8f99ee22fe69eaeab865c3a66b4f26403b7`
- Branch: `candidate/nested-execution-dashboard-20260914`
- No merge, push, tag, release, or deployment was performed.

## 3. UI implementation map

| Surface | Existing implementation | Candidate integration |
| --- | --- | --- |
| Estate Topology | `projectEstateMap`, Runtime Map Estate surface, generic runtime graph nodes/edges | Retains authoritative containment fields, adds physical-node nested summaries, and collapses nested branches by default |
| Device / Node Dashboard | `projectNodeDashboard` and authenticated observability API | Projects recursive descendant environments, runtimes, routes, last observation, evidence, and scoped work |
| Runtime / Process | Existing Runtime Map process projection | Keeps existing process map; Node Dashboard work cards open the exact recorded Job Run inspector |
| Job / Invocation | `projectJobInspector`, `projectRunInspector`, authenticated Run Inspector | Adds deterministic physical-to-runtime route, transport, worker, explanation, evidence, and retained artifact content |
| History / export | Existing canonical inspector Markdown projection and download control | Links the same route, events, operations, and retained artifact; no parallel history store |
| Mallow | Existing `poeEvidence` object-reference projection | Reads the same Node Dashboard and Run Inspector projections and links exact inspector identities |

## 4. Contract mapping

The UI consumes the existing Estate `parentId`, typed containment relationship, `executionEnvironmentKind`, managed-node container-runtime observations, Job Run worker selection, Work Parcel stage routes, and retained artifact provenance. It does not infer containment from hostnames or IP addresses and does not create a dashboard-only topology.

The demonstrated path is:

`Pixel 8 Pro -> Android 17 host -> Alpine Linux 3.24.1 -> PODMAN 5.8.6 -> Agentless governed worker route -> Job Run -> retained evidence`

The product code contains no Pixel, Android, Podroid, QEMU, Alpine, Podman, SSH-port, or device-identifier special case. Runtime labels in the browser proof come from current evidence.

## 5. Estate integration

**DEMONSTRATED IN BROWSER.** A physical node with authoritative descendant containment shows a concise nested-environment count. Descendants remain collapsed until selected. Expanding the Pixel reveals the hierarchy without adding every container to the global Estate view. The selected physical device opens the existing Node Dashboard.

**TESTED AUTOMATICALLY.** Unknown, cross-node, malformed, and cyclic containment is rejected. Large Estate projections remain bounded. Ordinary nodes do not gain nested controls.

## 6. Node Dashboard integration

**DEMONSTRATED IN BROWSER.** The Pixel dashboard includes an Execution Environments section with a readable hierarchy and cards for host OS, guest OS, runtime, and worker route. Cards expose the evidenced parent, platform/OS, architecture, availability, transport, worker route, last observation, capabilities, and evidence disclosure.

**SUPPORTED BY CONTRACT.** The same rendering accepts other typed host, guest, runtime, and worker identities without changing product code.

## 7. Runtime and container integration

**DEMONSTRATED PHYSICALLY.** Podman 5.8.6 was available and executed the governed container. Docker and LXC were observed as detected-only and are not presented as available. No container secrets or environment configuration are exposed.

**DEMONSTRATED IN BROWSER.** The guest card renders the generic container-runtime list with runtime kind, version, state, environment, observed-container count, and last observation.

## 8. Resource presentation

**DEMONSTRATED IN BROWSER.** Resource cards distinguish `PHYSICAL CAPACITY` from `GUEST VISIBLE`. The dashboard explicitly states that nested values are views or limits of the physical device and are never added to Estate capacity totals.

Fresh Android observation recorded 9 logical CPUs and 11,850,752 kB total memory. The guest reported one visible logical CPU and 473,182,208 bytes visible memory. These are displayed as separate scopes. Missing physical utilization, storage, battery, and other unobserved values remain unavailable.

**TESTED AUTOMATICALLY.** Guest capacity is excluded from physical totals, worker layers do not repeat guest capacity, and unknown measurements remain unknown rather than zero.

## 9. Invocation drill-down

**DEMONSTRATED IN BROWSER.** The physical Node Dashboard binds the recorded work card to Job Run `run-b3fa152d-a105-445a-b0d9-5b98d4fc9dee`. The Run Inspector shows where and how the work ran, its deterministic route authority, transport, worker, recorded route reason, output artifact, timestamps, duration, and navigation back to the Node Dashboard and Estate.

Token cards show **Unavailable** with the explicit statement that token telemetry is unavailable/not applicable because no model invocation is recorded. No zero-token measurement is implied.

## 10. Mallow route explanation

**DEMONSTRATED PHYSICALLY.** The exact request was: `Mallow, run a Linux container on my Pixel and tell me what happened.` Capability-driven routing selected the Pixel, nested Linux guest, SSH transport, and compatible container runtime.

**DEMONSTRATED IN BROWSER.** The route explanation is rendered from the recorded reason and evidence. Mallow's object explanation reads the same Node Dashboard and Run Inspector projections; it does not invent retrospective topology.

## 11. Human-readable evidence

**DEMONSTRATED IN BROWSER.** The History tab exposes the canonical Markdown download, checksum, chronological record count, retained invocation JSON, stdout, stderr, duration, and collapsible audit/evidence details. The dashboard and download are projections over the same retained Job Run and artifact records.

## 12. Ordinary-device regression

**TESTED AUTOMATICALLY.** A device without authoritative nested descendants has no empty Execution Environments section, no hierarchy control, and no additional runtime clutter. Existing exact-node work binding and accelerator isolation tests continue to pass.

## 13. Desktop qualification

**DEMONSTRATED IN BROWSER.** Chromium at 1440 x 1000 verified compact Estate entry, expansion, Node Dashboard, runtime detail, invocation detail, history, and resource accounting. The final visual review found no overlapping connectors, ambiguous parent/child path, unexplained runtime state, tiny primary labels, hidden evidence control, or misleading resource total.

## 14. Mobile qualification

**DEMONSTRATED IN BROWSER.** Chromium at 390 x 844 verified a stacked, touch-sized hierarchy with readable labels and environment facts. Chromium at 844 x 390 verified the compact Run Inspector header, route path, transport, worker, and route authority. Reduced-motion mode was enabled during capture.

This is browser viewport qualification, not a second physical handset UI qualification.

## 15. Physical Pixel proof

**DEMONSTRATED PHYSICALLY.**

- Device: Pixel 8 Pro (`husky`), Android 17, arm64-v8a
- ADB: current authorised endpoint reported `device`
- Nested environment: Alpine Linux 3.24.1, kernel 7.1.5, aarch64
- Virtualisation: QEMU
- Transport: agentless SSH
- Runtime: Podman 5.8.6
- Parcel: `parcel-social-1f6b84c953db835706d5bd8bec969b09327e2921b6e255bf5e5b1e3e1ef394b8`
- Job Run: `run-b3fa152d-a105-445a-b0d9-5b98d4fc9dee`
- Result: `SUCCEEDED`, exit status 0
- Stdout: `Agent Control nested execution requalification`
- Container action duration: 18,015 ms; command-reported elapsed time: 15.45 s
- Resource observation: 60% CPU during command and 45,580 KiB maximum RSS from `/usr/bin/time`; guest-visible capacity remained separately scoped
- Token telemetry: unavailable / not applicable; no model invocation occurred

## 16. Visual evidence index

The canonical image hashes and captions are in `VISUAL_EVIDENCE_INDEX.md`. The images are retained in the external qualification bundle; no screenshot binaries or private storage paths were added to the source candidate.

## 17. Automated tests

- Focused: 78 passed, 0 failed, 0 skipped
- Full `npm run check`: 1,563 passed, 0 failed, 0 skipped
- Baseline: 1,559 passed; candidate adds four passing tests
- Additional gates passed: source distribution, TypeScript, bootstrap syntax, dashboard syntax, infrastructure neutrality, implementation status

Coverage includes nested Estate projection, authoritative containment, progressive disclosure markers, Node Dashboard environments, runtime rendering, resource-accounting distinctions, exact invocation relationships, route explanation, missing token telemetry, ordinary devices, cyclic containment rejection, Mallow projection consistency, and responsive CSS markers.

## 18. Remaining limitations

- **NOT YET QUALIFIED:** AVF/pKVM
- **NOT YET QUALIFIED:** resident Agent Control worker daemon inside the guest
- **NOT YET QUALIFIED:** physical network-disconnection recovery
- **NOT YET QUALIFIED:** autonomous self-extension; the implementation was Codex-assisted under governance
- **NOT YET QUALIFIED:** deployment into a production Agent Control installation; forbidden by this parcel
- Mobile qualification is browser viewport evidence, not physical touch interaction evidence on the Pixel.

## 19. Recommendation

Approve the isolated dashboard integration candidate with the stated qualification boundaries. It meets this parcel's product and visual gates: a human can start at the physical Pixel, progressively reveal its evidenced environments, inspect the runtime and exact governed invocation, understand the deterministic route, distinguish nested resource scopes, and download the human-readable evidence. Formal integration should retain the current evidence-backed contract and must not broaden claims to the unqualified boundaries above.

# Nested Execution Integration Candidate

## 1. Executive summary

Recommendation: **APPROVE WITH LIMITATIONS**. The candidate provides a generic evidence-backed model for nested execution environments and physically demonstrates it on the existing Pixel Linux guest. It does not add Podroid product logic, autonomously extend Agent Control, or qualify the outstanding AVF, resident-worker, network-loss or dashboard boundaries.

## 2. Original experiment result

Experiment commit `c9ff96706cca2b17341aa24e46322201bb38fdf8` was `PASS_WITH_LIMITATIONS`: a real Alpine guest under a QEMU backend ran a bounded Podman container through the existing agentless SSH worker path. The extension was Codex-assisted under governance.

## 3. Commit review

The complete A-F classification is in `NESTED_EXECUTION_CHANGE_REVIEW.md`. Eighty-four added lines across nine files provided bounded probe timing, executable detection and initial evidenced nesting. The Estate implementation used an experimental untyped parent attribute and lacked resource accounting, container records and typed failure evidence.

## 4. Changes retained

- Per-resource probe timeout, integer 1–120 seconds, default 20.
- Fixed read-only detection of Podman, Docker and LXC executables.
- Detected-only container capabilities.
- Explicit same-node containment with cycle and missing-parent rejection.

## 5. Changes modified

- Containment is now a typed optional discovery-v1 field with an evidence method, authority, relationship, timestamp and optional source.
- Estate projection delegates relationship validation to the generic topology contract.
- Managed-node snapshots expose safe detected-only runtime observations.
- Probe failures distinguish timeout, authentication, transport, unavailable, command, capability absence, cancellation, malformed output and unknown states.
- Mallow accepts its own name as a request prefix while preserving the exact sealed operator prompt.

## 6. Changes rejected

- No implicit capability inheritance.
- No nesting inferred from hostname, address, endpoint or transport.
- No guest or container capacity added to Estate physical totals.
- No automatic container inventory commands in the base managed-node probe.
- No Podroid lifecycle, APK, QEMU, Android or Pixel logic in product code.

## 7. Podroid coupling found

No Podroid identifier existed in changed production files. The experimental Estate parent was loosely typed, which coupled the renderer to an experiment-specific attribute convention rather than to Podroid itself.

## 8. Podroid coupling removed

The renderer now consumes a generic execution-containment validator. The legacy attribute remains read-only for discovery-v1 compatibility. Physical addresses, ports, keys, image digests and device identities remain only in private qualification evidence.

## 9. Generic architecture

The contract supports:

`Physical Device → Host OS → Virtual Machine → Guest OS → Runtime → Container → Worker → Invocation`

Each execution environment can record identity, kind, physical device, parent, host, transport, capabilities, availability, lifecycle, observation time and evidence. Existing Agent Control discovery kinds remain valid; no duplicate Estate object taxonomy is required.

### Before/after capability matrix

| Capability | At `c9ff967` | Integration candidate | Boundary |
|---|---|---|---|
| Container discovery | Executable capability flags | Safe runtime records plus flags | Detailed inventory still adapter-qualified |
| Probe timeout | Per-resource bounded timeout | Retained | Physically demonstrated on the slow guest |
| Nested Estate | Authoritative legacy attribute | Typed optional relation plus legacy reader | Production dashboard not qualified |
| SSH environment discovery | Existing managed-node path | Retained as one adapter | SSH is not required by the model |
| Parent/child relationships | Renderer-owned rule | Shared evidence validator | No inference from network identity |
| Capability inheritance | Absent | Explicitly not inferred | Capabilities must be observed/configured on target |
| Resource reporting | Guest metrics had no nesting semantics | Five accounting scopes and safe physical totals | Cross-host live aggregation not qualified |
| Runtime/container representation | Capability strings only | Runtime/container observation contract | Physical detailed inventory not qualified |
| Evidence relationships | Provenance method only | Evidence IDs, authority and timestamps | Source validity remains adapter responsibility |
| Mallow routing | External experiment registration | Generic deterministic route plus sealed exact prompt | No model-based topology inference |

## 10. Estate topology model

Containment is optional and backward-compatible. A relation is accepted only when it is explicit, evidence-backed, acyclic, remains on one physical node, and reaches a `MACHINE`. Failed validation falls back to the existing machine-root projection. This supports Android/VM, Windows/WSL and Linux/KVM shapes without product special cases; the alternatives are synthetic architecture tests only.

## 11. Resource-accounting model

Resource observations are classified as `PHYSICAL_CAPACITY`, `ALLOCATED_CAPACITY`, `GUEST_VISIBLE_CAPACITY`, `RUNTIME_LIMIT` or `MEASURED_CONSUMPTION`. Estate physical totals include at most one physical-capacity observation per device and metric. Other scopes remain visible and are explicitly excluded. Missing physical evidence produces `null` rather than a derived total.

## 12. Container discovery model

The product has adapter-neutral runtime and container records: environment, runtime kind, state, version, executable evidence, observation time, and safe container identity/image/state/worker fields. The base probe creates `DETECTED_ONLY` runtime records and does not claim access or inventory. Adapter output excludes environment variables, credentials, mounts and sensitive runtime configuration.

## 13. Probe policy

Each resource owns its bounded deadline. A slow environment does not alter global polling. The SSH adapter emits typed failures for timeout, authentication, transport, command, capability absence and cancellation; the manager retains this in `lastProbeFailure`. Malformed and unknown errors stay distinct. These optional snapshot fields preserve older readers.

## 14. Mallow routing behaviour

The deterministic resolver selects by requested capability, optional physical-device constraint, environment availability, available runtime and healthy worker, then records transport and runtime identifiers. Synthetic tests select both a Podman-over-SSH environment and a Docker-over-local environment. No route name is encoded into Mallow. The exact `Mallow, ...` prefix is normalized only for intent matching and is preserved verbatim in the sealed request.

## 15. Physical Pixel/Podroid requalification

**DEMONSTRATED.** On 2026-09-14 the exact request `Mallow, run a Linux container on my Pixel and tell me what happened.` produced a sealed proposal and live preflight, then completed governed parcel `parcel-social-02b56f028875fb27cf1cbc4b8f7e09b3af030884a7044b3786b1b6ff1f751937` successfully.

The public sanitized path was physical device `authorised-mobile-device` → environment/worker `mobile-linux-guest` → governed SSH → runtime `container-runtime:mobile-linux-guest:podman`. The private evidence retains the exact configured identifiers. The container printed `Agent Control nested execution requalification`, exited 0, and the invocation record measured 20,822 ms with maximum resident set size 47,232 KiB. Mallow reported token usage unavailable because deterministic routing made no model invocation.

Private evidence is retained in the controller qualification-evidence store and is intentionally excluded from the source distribution.

## 16. Automated tests

Focused result: 49 passed, 0 failed. Coverage includes typed/legacy containment, cycles and cross-node rejection, resource double-count prevention, unknown totals, detected-only runtimes, alternative runtime/transport routing, probe deadlines and failure classes, managed-node projection, Mallow prefix handling and sealed-prompt preservation.

Full `npm run check`: PASS. Distribution, TypeScript, bootstrap syntax, dashboard syntax, infrastructure neutrality, implementation status and 1,559 automated tests passed; 0 failed, 0 skipped.

## 17. Backward compatibility

No schema version changes and no migration. `DiscoveryItem.containment`, `ManagedNodeSnapshot.containerRuntimes` and `lastProbeFailure` are additive. The Estate validator reads the original authoritative `attributes.executionParentId` evidence. Existing non-nested nodes preserve their machine-root projection and worker behaviour.

## 18. Security implications

Topology is accepted only from explicit evidence and never from network coincidence. Container discovery exposes no secrets or sensitive configuration. The managed-node probe remains fixed, read-only, bounded and forwarding-disabled. Physical evidence used the existing key-only private route and a disposable container with no network, read-only filesystem, dropped capabilities, no-new-privileges, memory/PID bounds and an unprivileged container user.

## 19. Remaining limitations

- **NOT YET QUALIFIED:** AVF/pKVM backend.
- **NOT YET QUALIFIED:** resident Agent Control worker daemon inside the guest.
- **NOT YET QUALIFIED:** physical network-disconnection recovery.
- **NOT YET QUALIFIED:** production dashboard rendering and navigation for the new data contract.
- **NOT DEMONSTRATED:** autonomous self-extension; this candidate is Codex-assisted work under governance.
- Base managed-node discovery proves executable presence only. Detailed container inventory requires a separately qualified runtime adapter.
- The physical SSH forwarding listener remains a private-estate qualification configuration and is not product-managed.

## 20. Recommendation

Approve the isolated integration candidate with the stated boundaries. The generic core is maintainable and regression-safe if the final full suite passes. Product dashboard work should consume this data contract in a later bounded parcel. Podroid remains evidence that the architecture works, not a fundamental dependency or named product feature.

## Qualification classification

| Capability | Status |
|---|---|
| QEMU guest and Podman container on the authorised Pixel | DEMONSTRATED |
| Typed containment and resource-accounting invariants | TESTED SYNTHETICALLY |
| Podman/Docker alternative routing and non-nested compatibility | TESTED SYNTHETICALLY |
| Generic VM/runtime/container/worker evidence contract | ARCHITECTURALLY SUPPORTED |
| Detailed Docker/LXC inventory on physical hosts | NOT YET QUALIFIED |
| AVF, resident worker, network-loss recovery, production dashboard | NOT YET QUALIFIED |

# Migrating to Agent Control 3.7.0

Agent Control 3.7.0 adds token-aware baton routing, account/node-bound routes, live token telemetry and the production repository-review handoff lifecycle. Existing 3.5 and 3.6 state remains readable; new token-routing and account-qualification records are additive.

Agent Control 4.2 development adds an optional `transport-integrity/records.json` store. New repository-review parcels bind a hashed Transport Context Contract and deterministic integrity state; legacy parcels remain readable and visibly unbound. No global enforcement is enabled by migration alone.

## Upgrade

1. Stop the target Agent Control process and back up its configured state directory.
2. Fetch tags and check out `v3.7.0`.
3. Install dependencies with `npm install --no-package-lock --ignore-scripts`.
4. Run `npm run check` before starting the process.
5. Review `tokenBatonRouting` policy and model/account/node routes before enabling a handoff candidate.
6. Start Agent Control through the existing deployment procedure. Installing the source alone starts no service and enables no Saved Job, Schedule, Spark lane, remote ACP listener or automatic route.

Omitting `tokenBatonRouting` uses the conservative 60/75/85/90 defaults. Context pressure alone never forces a cheaper route. A destination must be independently qualified and capability-compatible, and failed handoff resumes the original thread.

The separate adaptive-orchestration workstream adds an optional `adaptiveOrchestration` policy, a persistent Model Capability League, Workflow League and Work Parcel Decision Tree. Its state is additive under `adaptive-orchestration/state.json`; it preserves the existing registry and token-governor fallback. Do not treat benchmark, qualification and production evidence as interchangeable, and do not enable a route solely because it has a high global score. See [`adaptive-multi-model-orchestration.md`](adaptive-multi-model-orchestration.md) for the development configuration and qualification gate.

For Codex account profiles, keep each `CODEX_HOME` credential store on its configured execution node and store only the environment-reference name in Agent Control configuration. Requalify the account after changing its CLI, profile home, model or execution node. Never copy profile contents between nodes.

## State and observability

The token runtime writes its versioned evidence beneath the configured Agent Control state directory. Dashboard telemetry uses the existing authenticated web service and SSE channel; no second listener is introduced. Current-context occupancy, cumulative usage and monetary cost retain separate authority labels, and unavailable values remain unavailable.

## Recovery

The previous known-good source release is immutable tag `v3.5.0`. To recover, stop 3.7, restore the pre-upgrade state-directory backup and check out `v3.5.0`. Do not feed 3.7-only token-routing, contract, handoff, account-profile or lifecycle stores to 3.5. No history rewrite or force-push is required.

See [Token-Aware Baton Routing](token-aware-baton-routing.md), [Codex integration](models/CODEX-INTEGRATION.md), [security boundaries](security-3.6.md), and the [3.7 release notes](release-notes-3.7.0.md).

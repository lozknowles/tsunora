# Migrating from Agent Control 3.5 to 3.6 development

Agent Control 3.6 is currently an unreleased development branch. The released recovery point is immutable tag `v3.5.0`; do not replace a live 3.5 deployment merely to inspect 3.6.

## Before starting

1. Stop the target development instance and back up its configured state directory.
2. Keep production and 3.6 development on separate `AGENT_CONTROL_STATE_DIR` values.
3. Install the exact package dependencies and run `npm run check` before starting a process.
4. Keep existing provider credentials outside Agent Control state. New lifecycle records accept only indirect `env:` or `file-env:` references.

No in-place rewrite of 3.5 identity, Job, model-registry or lane state is required. The 3.6 stores are additive and are created only when their owning runtime writes state:

- `contracts/executions.json` for contract/process/PTY authority;
- `contracts/handoffs.json` for governed handoffs;
- `models/lifecycle.json` for logical-provider/model lifecycle;
- `acp/*.sessions.json` for ACP bindings.

These stores are not authority substitutes for existing Lane, Session, Work Parcel, scheduler or model qualification state.

## ACP

Local stable-v1 stdio is launched explicitly with `agent-control acp`. Remote HTTP/WebSocket remains disabled unless `AGENT_CONTROL_ACP_REMOTE_ENABLED=true`; it additionally requires an indirect bearer environment name, Origin policy, and TLS certificate/key file references for non-loopback binding. ACP v2 remains disabled and unsupported.

The dashboard reads persisted ACP bindings and transport configuration through `GET /api/runtime`. A persisted ACP session does not prove which transport carried it because stable session state is transport-neutral; the projection reports that attribution as unknown.

## Contracts, PTYs and handoffs

New work may adopt `Lane → Contract → Baton → Process/PTY → Agent`. Reconnect is read-only, detach does not terminate the process, write transfer is explicit, and human takeover revokes conflicting writer authority. Existing 3.5 lane PTYs are not silently imported as 3.6 contracts.

Workers must return one of `SACRIFICE`, `SUBSTITUTE`, `DELEGATE`, `YIELD` or `COMPLETE`. AUTO is limited to existing authority and budget; MANUAL approval cannot manufacture authority missing from the parent.

## Providers and routing

Provider configuration remains operator-facing inventory. The lifecycle registry adds immutable exact recipes and evidence-gated states without mutating the existing model registry. `Ox` is only a historical alias; new evidence uses canonical `z-ai/glm-5.3-flash`/GLM-5.3-Flash identity.

Automatic production routing stays disabled. The 60-task deterministic classifier passed, but the required 50 physical benchmark observations do not exist. The one real Luna/local/GLM/Luna chain is retained separately and does not satisfy that gate. Spark remains disabled by default.

## Dashboard and rollback

Systems now includes ACP transports and any durable lifecycle recipes; Sessions adds the read-only runtime projection for ACP, contract/PTY, approvals, handoffs and verification. Unknown activity, usage, cost, reachability or transport attribution renders as unknown rather than zero.

To roll back, stop the 3.6 development process, restore the untouched 3.5 state directory and run source tag `v3.5.0`. Do not feed 3.6-only contract, handoff or lifecycle stores to 3.5. No database downgrade or force-push is required.

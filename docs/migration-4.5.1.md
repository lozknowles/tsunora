# Migrating to Agent Control 4.5.1

Agent Control 4.5.1 is a narrow upgrade remediation for the published 4.5.0
source release. It corrects controller-local worker classification when an
existing supported configuration is preserved. It does not add Agent Control
4.6 functionality.

The physical supported-v4.1 gate also found and corrected validator drift in
the bootstrap initializer: legitimate numeric token metadata such as
`models[].limits.outputTokens` is accepted consistently by both configuration
loaders. Credential-shaped keys and credential values remain forbidden, and the
initializer still preserves a valid existing configuration byte-for-byte.

## Before upgrading

1. Keep the current controller running until a maintenance window is approved.
2. Record its immutable source version and supervisor definition.
3. Stop only that controller and create an owner-only byte-preserving backup of
   its configuration and state.
4. Retain the previous immutable source checkout and rollback procedure.
5. Do not delete or regenerate the existing configuration. Preservation is part
   of the upgrade qualification.

Follow [the canonical deployment guide](DEPLOYMENT.md). The project deliberately
has no package lock or build step; use the documented bootstrap rather than an
undocumented dependency or migration command.

## Expected identity behaviour

The built-in `agent-control:operator-observer` is an Agent Control-owned worker
inside the controller process. It should be reported as `CONTROLLER_LOCAL` with
identity authority `AGENT_CONTROL_INTERNAL` and relationship
`CONTROLLER_INTERNAL`. It must not create a `REMOTE_NODE` safety category.

Configured local and remote resources keep their separate identities. A remote
transport remains remote even if labels claim locality. Unknown, mismatched or
spoofed identities fail closed. No configuration field needs to be added solely
for the built-in observer.

## Acceptance after upgrade

After bootstrap and authenticated dashboard startup:

1. run Environment Discovery and inspect Estate Map;
2. confirm the observer appears beneath the controller, not as a remote node;
3. ask Morrow `Start operator-system-observation@1.1.0`;
4. inspect and explicitly approve the sealed proposal;
5. confirm both `observe` and `verify` complete `SUCCEEDED`;
6. inspect the runtime-safety evidence and confirm the worker is controller-local
   and the decision is `ALLOW`;
7. verify health, version, SSE updates and ordinary dashboard views.

Rollback immediately to the preserved previous source/state pair if any identity,
safety, state-integrity or governed-smoke check fails. Never run two controller
versions against one writable state directory.

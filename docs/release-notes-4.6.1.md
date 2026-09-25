# Agent Control 4.6.1

Agent Control 4.6.1 is a security and release-integrity patch for 4.6.0. It preserves the 4.6 feature set, Mallow, crew avatars, public Job Library, Android Standalone and accepted capability limitations.

## Security and integrity fixes

- Authenticates control-plane read APIs as well as mutations.
- Enforces browser destination policy across redirects, subresources and WebSocket connections, with private-network destinations denied unless the exact host is explicitly allowed.
- Confines local and remote repository snapshots to the authorised repository and binds remote provenance to the requested source.
- Bounds lease renewal, managed-node maintenance and scheduler claims, and preserves late output redaction after timeout or cancellation.
- Isolates governed Git subprocess configuration and tag namespaces.
- Removes stored session-share credentials and safely renders imported session content.
- Requires current model qualification before routing, retains failed qualification evidence and keeps benchmark promotion blocked without approved target execution and independent evidence.
- Content-addresses every release check, the exact source commit and digest, and the release archive. Publication also requires an external protected approval bound to those values.

These changes were found with GLM-5.3 candidate-review input, then challenged, reproduced and independently verified before acceptance. The original packets, raw provider evidence, rejected findings and remediation evidence remain preserved.

## Upgrade from 4.6.0

1. Record the running version, startup method and state paths. Stop the instance through its established procedure.
2. Preserve a consistent backup of .agent-control and any configured external state paths. Keep credentials private.
3. Install or clone the v4.6.1 source into a clean sibling directory and run the documented bootstrap.
4. Restore or point to the preserved state, start on loopback, authenticate, and verify the dashboard, discovery and a read-only governed observation job.
5. Keep 4.6.0 and the backup available until verification completes.

No configuration schema migration is required. Existing legitimate webhook and HMAC integrations retain their configured authentication. Scripts or dashboards that read protected /api endpoints must now supply the configured operator authentication.

## Browser destination policy

Private, loopback and link-local destinations are denied by default for governed browser work, including redirect targets, subresources and WebSockets. An operator may configure an exact-host exception for a reviewed internal service. Exceptions are host-specific and do not authorise a wider address range or a redirected host.

## ACP principal scope

Shared-token ACP transports are supported as one-principal scopes. Agent Control does not claim distinct-principal isolation behind one shared credential. Multi-principal use requires a transport that supplies independently authenticated principal identity.

## Release evidence

The hardened release gate accepts only a schema-v2 receipt bound to the exact commit, source digest, package version, archive digest, complete required check set and content-addressed artifacts. The operator approval must be an external protected file bound to the receipt and archive; it cannot be kept in the candidate tree.

## Accepted limitations

Model benchmark promotion remains blocked without approved target execution and independent evidence. Whole-node energy and paid-provider billing remain externally blocked where no authorised meter binding or metered provider exists. Component telemetry remains component-scoped. These optional limitations do not claim a model winner, whole-node measurement or metered cost and do not block this security patch.

## Rollback and recovery

Stop 4.6.1, retain its logs and state evidence, then restart the preserved 4.6.0 checkout against the pre-upgrade backup. Do not reset or pull over a dirty checkout. If a release-evidence check fails, preserve the failed receipt and artifacts, correct the cause, rerun the complete suite, and create a new receipt and approval for the new exact commit or archive.

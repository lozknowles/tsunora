# Agent Control 3.5 security boundaries

## Identity and authority

- Actor principal/type/authentication source and Agent ownership are immutable.
- Session and participant capability sets must be subsets of their authority source.
- Delegated capability sets must be subsets of the parent delegation or source participant.
- Execution provenance rejects Actors outside the session, excess authority, unlisted models/nodes and runtime filesystem/network policy broader than the session envelope.
- `operator-controlled` sessions prevent non-creator mutation.
- Dashboard mutation attribution is server-selected; request-body actor spoofing is ignored.

## Secrets

Configuration stores only environment/file references. Session policy stores allowed secret references. `withSecret` checks `secret.use:<reference>`, resolves the value outside model context, rejects returning it and persists only an opaque receipt. Context and metadata reject bearer/API-key/private-key patterns. Token accounting fields remain valid numeric telemetry and are not confused with secret tokens.

## Execution

`selectExecutionFailClosed` independently enforces sandbox, locality, governed runner, required node and required model. A fallback is legal only when policy explicitly enables it and names allowed models/nodes.

Spark execution additionally requires authenticated bounded availability for the exact configured model, a no-fallback qualified registry route, a disposable initially-clean Git worktree, explicit file/line scope, one attempt, zero Codex subagents, a sealed context baton and independent verification. Protected paths and security/auth/migration/governance/release/deployment/production work are denied before model invocation. Scope leakage is escalation/failure, never accepted completion. An unavailable or failed Spark route may create a visible STANDARD handoff, but another model is never silently substituted and reported as Spark.

## ACP

ACP terminates at a Work Parcel port. It cannot confer capabilities, select arbitrary tools, create shell execution, acquire leases or accept results. Resume checks external principal identity; cancellation retains the same Actor/Session attribution.

In 3.7, `agent-control acp` accepts stable ACP v1 frames over local stdio. `AGENT_CONTROL_ACP_ACTOR_ID` must identify an Actor already present in the durable identity store; missing identities fail closed. Protocol stdout is never used for diagnostics. Session bindings are mode `0600`.

`agent-control acp-remote` is disabled by default and fails closed without an indirectly resolved bearer credential. Authentication and Origin policy run before JSON-RPC parsing or WebSocket upgrade; comparisons are constant-time and bodies/frames are bounded. Non-loopback binding requires configured TLS certificate/key files. Values are not logged or persisted. The SDK's experimental server packaging carries stable v1; the experimental ACP v2 entry point is not imported.

The complete runtime boundary, including contract/PTY observability, handoff redaction and provider lifecycle rules, is documented in [Agent Control 3.6 security boundaries](security-3.6.md).

## Known limits

- An opaque external CLI may perform internal reads/tools that are not individually mediated by Agent Control; Spark is therefore restricted to an isolated worktree and bounded task class.
- The current snapshot file is atomic and mode 0600 but is not an encrypted database.
- Ephemeral loopback HTTP/WebSocket transport is qualified; production remote exposure still requires operator-managed TLS, network restriction and physical qualification.
- Physical multi-provider qualification depends on configured, healthy model routes and cannot be replaced by simulated evidence.

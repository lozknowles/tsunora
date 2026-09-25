# Agent Client Protocol compatibility

Agent Control 3.7 retains the 3.6 transport-neutral ACP core and stable ACP v1 stdio adapter.

## Pinned protocol inputs

| Input | Exact version | Licence / identity |
| --- | --- | --- |
| official TypeScript SDK | `@agentclientprotocol/sdk@1.4.0` | Apache-2.0; upstream git commit `e6463f444093ed7c5f1cc937c3f32afb5853e906` |
| stable schema bundled by the SDK | ACP schema release `schema-v1.21.0`; protocol version `1` | `schema/schema.json` SHA-256 `7f77702b34e0a0558e77220e9007bf8ee161a976bb8ac5021aba1b7e7b2c5708` |
| SDK schema peer | `zod@4.5.4` | MIT |
| WebSocket transport | `ws@8.21.3` | MIT |

Dependencies are exact pins in `package.json`. The SDK's `experimental/v2` export and bundled unstable v2 schema are not imported by the stable runtime.

## Stable v1 surface

The official SDK validates and dispatches:

- `initialize`;
- `session/new`, `session/load`, `session/resume`, `session/list`;
- `session/prompt`, `session/cancel`, `session/close`;
- `session/update` notifications;
- JSON-RPC request cancellation through the SDK's request `AbortSignal`.

Baseline prompting reports an ordered plan, initial tool call, tool-call update and final plan state. Usage and cost updates are sent only when the governed execution reports them; unknown values are never represented as zero. MCP servers and additional directories are rejected because those capabilities are not advertised. Image and audio prompts are not advertised.

Initialization advertises the namespaced `_meta.agentControl.extensions.deliveryId` extension. A client may put a bounded `_meta.agentControl.deliveryId` on `session/prompt`; exact replay returns the original governed receipt across restart, while reuse with different prompt content fails closed. This does not alter a standard ACP field and stores no prompt body in the replay receipt.

## Stdio

Run:

```bash
AGENT_CONTROL_STATE_DIR=/srv/agent-control/state \
AGENT_CONTROL_ACP_ACTOR_ID=web-operator \
agent-control acp
```

stdin and stdout carry newline-delimited JSON-RPC only. Diagnostics use stderr. EOF, SIGINT and SIGTERM close the SDK connection and stop the local scheduler cleanly. The selected Actor must already exist in the identity store; the command does not create or elevate an external principal.

## Authenticated HTTP and WebSocket

The separately testable remote adapter uses the same `AgentApp` through the official SDK Streamable HTTP and WebSocket server. It is fail-closed unless all required settings are present:

```bash
AGENT_CONTROL_ACP_REMOTE_ENABLED=true
AGENT_CONTROL_ACP_REMOTE_TOKEN_ENV=ACP_OPERATOR_BEARER
ACP_OPERATOR_BEARER='secret value supplied outside Agent Control state'
agent-control acp-remote
```

Defaults are `127.0.0.1:4311/acp`. `AGENT_CONTROL_ACP_REMOTE_ALLOWED_ORIGINS` is a comma-separated allowlist for requests that carry an Origin header. HTTP bodies and WebSocket frames are limited to 1 MiB. Authentication is checked before ACP parsing or WebSocket upgrade with constant-time bearer comparison. A bind other than loopback requires both `AGENT_CONTROL_ACP_REMOTE_TLS_CERT_FILE` and `AGENT_CONTROL_ACP_REMOTE_TLS_KEY_FILE`; certificate contents and bearer values are never persisted or logged.

The remote transport uses the SDK's experimental server packaging API, but carries stable ACP protocol v1. It does not import the experimental ACP v2 entry point.

The existing dashboard exposes a redacted transport/session projection through `GET /api/runtime`. It reports protocol version, stdio and remote configuration, authentication state, governed session/parcel references and delivery counts. It never exposes prompt bodies, cwd values or replay hashes. Because the durable ACP session format is transport-neutral, the dashboard does not invent per-session transport attribution.

## Mapping

| ACP | Agent Control |
| --- | --- |
| external principal | Actor |
| ACP session | governed Session |
| prompt blocks | ContextTransferRecord |
| prompt request | Work Parcel with WorkAttribution |
| tool-call update | Work Parcel/Run/evidence projection |
| cancel request/session | existing cancellation port |

The external Actor must already be registered by a trusted host. `session/new` creates an `operator-controlled` session and adds the internal Agent Control orchestrator as a participant with only the intersection required for governed execution. Resume verifies creator/principal identity and working directory. Prompt text is accepted as internal context, hashed, attributed and submitted through `AcpExecutionPort`; it is never treated as shell input. ACP session bindings are persisted mode `0600` and can be reconstructed with the durable identity store after a controller restart.

## Authority boundary

ACP does not receive direct access to:

- scheduler or queue mutation;
- leases, ownership or PTY input;
- provider/model substitution;
- raw shell or unrestricted tools;
- verification or acceptance transitions.

Agent Control remains authoritative. The official SDK frames stdio, Streamable HTTP and WebSocket around this core without changing that boundary. No unauthenticated network listener exists. No OpenClaw dependency is required or introduced.

## Cancellation

`session/cancel` and `session/close` cancel recorded Work Parcels in reverse creation order. SDK request cancellation aborts the active session operation. The execution port is responsible for cascading into child Runs; `IdentityControlPlane.cancelTree` provides child-first provenance cancellation where execution records exist.

## Conformance evidence

`src/control/acp-runtime.test.ts` connects the Agent Control app to the official SDK client over two real NDJSON byte streams. It verifies negotiation, schema-valid session creation, ordered updates, prompt mapping, concurrent sessions, durable delivery replay, list, process-level reconstruction/resume, close/cancel and rejection of unsupported envelopes. `src/control/acp-remote.test.ts` uses official HTTP/WebSocket clients and an SDK-independent raw HTTP wire harness for authentication, protocol fallback, malformed JSON, invalid request IDs and unknown methods. Adapter authority tests remain in `src/control/acp-adapter.test.ts`.

This is official-client interoperability plus an independent raw-wire harness. Cancellation while an external provider call, client-owned permission prompt or tool is pending still needs end-to-end provider fixtures; production TLS/non-loopback exposure has not been deployed or physically qualified.

## Compatibility verdict

The current checkpoint is **stable ACP v1 interoperable over local stdio, authenticated Streamable HTTP and authenticated WebSocket, with limitations**. Transport tests use ephemeral loopback listeners; production TLS exposure and the remaining pending-operation adversarial cases are unqualified. ACP v2 is draft, disabled and not claimed. ACP client-owned terminal/filesystem behavior is not reinterpreted as Agent Control PTY or filesystem authority.

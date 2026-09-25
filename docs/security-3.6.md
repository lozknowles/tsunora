# Agent Control 3.6 security boundaries

Agent Control remains the authority boundary. ACP clients, browser sessions, model providers, processes, PTYs, agents and lifecycle discovery can request or execute bounded work; none can grant itself scheduler ownership, capabilities, protected-resource access, approval, write control or verified completion.

Natural Work Parcel constraints may compile to durable protected-resource capabilities. A consequential Action must resolve semantic effects before dispatch; a write-like effect intersecting a read-only resource is denied before the handler starts. The Git adapter executes only normalized argv operations without a shell and fails closed on unsupported or implicit semantics. Force, delete, mirror, wrapper, chain and alternate-working-directory forms do not bypass the resource check. External commit uncertainty remains explicit rather than being inferred from process exit.

## Transport integrity

Transport Context Contracts contain only bounded, redacted request/context metadata and opaque credential references. Contract hashes, dependency statuses, baton bindings and inspection results are safe durable evidence; credential values, resolved paths and raw provider/transport output are not. Required missing context blocks, stale or contradictory context escalates, and self-review cannot satisfy independent inspection.

## ACP transport

Stable ACP v1 stdio uses newline-delimited JSON-RPC on process streams and requires a pre-registered Actor. Protocol stdout is framing-only. Remote HTTP/WebSocket is opt-in, bearer-authenticated before parsing/upgrade, Origin-restricted, size-bounded and loopback by default. Non-loopback binding requires TLS certificate/key file references. ACP v2 is not imported or claimed.

Session snapshots are mode `0600`. Prompt bodies are not exposed by `GET /api/runtime`; the dashboard receives session identity, parcel references, delivery count and timestamps only. Transport attribution remains unknown because the durable session format is transport-neutral.

## Contract and PTY authority

The contract owns objective, completion criteria, authority, protected resources, budget, baton, process, PTY, history and verification. A process cannot make itself the contract owner. Only one protected writer exists; consultation/reconnect are read-only, transfer increments the ownership generation, and human takeover fences conflicting agents before writes are accepted. Detach is not process termination. Orphan, timeout, cancellation and recovery are explicit states and never imply success.

Dashboard runtime projection omits objective text, baton payloads, PTY transcript content and managed file paths. It exposes hashes, sizes, state and actor identities needed for audit. There is no dashboard PTY-input endpoint.

## Handoffs and verification

AUTO handoff cannot expand authority, protected resources or budget. Privilege/cost/production/destructive/resource expansion and explicit MANUAL policy require operator approval, but approval cannot manufacture withheld parent authority. `COMPLETE` submits evidence; only an independent verifier can transition to verified success. Handoff dashboard rows omit the original request/baton payload.

## Providers, credentials and routing

Provider endpoints and credential references are immutable under one logical provider ID. Credentials are indirect `env:`/`file-env:` references and are excluded from batons, logs, telemetry, evidence and runtime projections. Cleartext provider endpoints are accepted only on loopback.

Discovery is not qualification. Recipes are exact and immutable, lifecycle promotion is ordered/evidence-gated, and production policy accepts only ACTIVE/PREFERRED champions. The frozen classifier and bounded physical chains do not qualify the separate 50-observation automatic-routing benchmark; missing provider tokens/cost and reachability remain unknown.

Token-aware handoff seals provider/account/model/node identity and baton provenance before invoking a destination. Account credential homes are resolved only on their configured node. Public telemetry and evidence omit credential values, resolved paths and raw remote process streams. A destination identity mismatch fails closed, and failed handoff preserves the original thread for recovery.

## Web projection

`GET /api/runtime` is observation-only and receives the same no-store, CSP, frame-denial and secret-key redaction as other dashboard APIs. Mutations still require the operator bearer and enter existing typed service methods. Runtime observability adds no lease, scheduler, PTY writer, provider invocation, ACP listener or lifecycle-promotion endpoint.

Run `npm run check`, the Markdown link check, package audit and diff credential-pattern scan before preserving qualification evidence. Review physical evidence manually because hashes and exact provider identities are intentionally retained.

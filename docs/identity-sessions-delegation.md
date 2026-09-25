# Identity, sessions and delegation

Agent Control 3.5 records responsibility and execution as one reconstructable chain:

`Actor → Session → Work Parcel → Agent → Model → Provider → Runtime → Node/Resource → Evidence`

## Identities

- **Actor**: authenticated human, automation, service, agent principal or control-plane principal. Principal ID, actor type and authentication source are immutable after registration.
- **Agent**: persistent specialist identity owned by one Actor. Purpose and preferred capabilities do not grant authority.
- **Model**: stable model-registry identity plus provider-native model ID. Historical `Ox` labels map to canonical `GLM-5.3-Flash` with the old value retained as an alias.
- **Provider**: endpoint/authentication and wire-protocol identity.
- **Runtime**: concrete execution environment, sandbox state, filesystem/network policy and optional version/hash.
- **Node/Resource**: hosting and schedulable-capability identity.

## Sessions

A session persists its immutable creator, mode, participant joins and joiner, capability envelope, allowed models/nodes/secret references, filesystem/network policy, production flag, context policy, visibility and status.

Modes are:

- `observer`: no mutation capability;
- `collaborative`: participants may use their explicit session capabilities;
- `operator-controlled`: non-creator participants observe; the creator controls mutation;
- `restricted`: the explicit capability envelope applies without implied broadening.

A role expands into capabilities, but a participant receives only the intersection of actor authority, session authority and the explicitly assigned participant set. A delegation receives only a subset of its parent. Wildcard capability handling is explicit and validated.

Execution recording is also a policy boundary, not just an audit write. It rejects a non-participant Actor, authority outside the participant/session/delegation envelope, a model or node outside the session allow-list, filesystem writes in a read-only session and network scope broader than the session permits. `*` must be stored explicitly when a governed adapter intentionally delegates model/node choice back to Agent Control; an empty allow-list authorises none.

## Context handoffs

`ContextTransferRecord` stores:

- source/target Actor and optional receiving Agent/Model;
- source and transferred SHA-256 identities;
- selected and discarded item descriptors;
- estimated token counts and classification;
- context budget, selection reason and compression steps.

Raw item content is hashed and discarded by this store. Bearer values, API-key-like values and private keys are rejected. The context deterioration harness compares `full`, `summary-only`, `evidence-only`, `structured-baton` and `hybrid` with recall, precision, evidence retention, unsupported claims, contradictions, unresolved questions, semantic loss, tokens, latency and cost.

## Delegation and execution

A delegation records source/target Actor, source/target Agent, parent delegation/Run, requested and actual model, context-transfer ID, granted capabilities, reason, status, child Run and evidence. Creating a child with more authority than its parent fails with `delegation_authority_escalation`.

Execution provenance records the full identity tuple, authority, tools/resources, policy events, timestamps, reported tokens/cost, verification outcome and evidence. `reconstruct(runId)` returns ancestors; `aggregate(runId)` includes descendants and preserves unknown accounting as `null`; `cancelTree` calls children before parents and only transitions active executions.

## Work Parcel compatibility

New parcels carry `agent-control.work-attribution/v1`. Dashboard submissions are always attributed to the authenticated `web-operator`; a client-supplied `actor` field is ignored. Existing stores remain version 1 and accept the additive field. Where explicit identity is unavailable, `legacyAttribution` derives stable `legacy-actor:*` and `legacy-session:*` IDs rather than inventing a human identity.

## Operator use

Open **Sessions** to inspect participants, permissions, context policy, agent/Run graph, model/runtime identity, evidence and chain accounting. Read APIs:

- `GET /api/sessions`
- `GET /api/sessions/:id`
- `GET /api/context-transfers?sessionId=...`
- `GET /api/delegations?sessionId=...`
- `GET /api/executions`
- `GET /api/executions/:runId`

These endpoints are projections. Session mutation remains inside the identity/control services.

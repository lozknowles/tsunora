# Transport Integrity and Transport Context

Agent Control 4.2 binds qualifying Work Parcels to a provider-neutral Transport Context Contract. The contract is canonicalized and SHA-256 hashed before execution; its hash is retained with the parcel and any token-aware sealed baton.

The contract records the initiating request, acceptance criteria, frozen repository identity, scope and truncation state, architecture and security constraints, runtime topology, route capabilities, policy limits, prior decisions/failures, tests/evidence, credential residency and freshness/provenance. Credential values and resolved paths are never included.

Dependencies declare requiredness, source, provenance, freshness and expected identity/hash. The deterministic gate reports `COMPLETE`, `DEGRADED`, `BLOCKED`, or `ESCALATED`. Missing required context blocks execution; stale or contradictory required context escalates for repair. A blocked worker may not improvise.

Repairs are append-only and retain the dependency, source, result and optional evidence ID. Independent inspection records generator and inspector roles and rejects self-review as release approval. Existing parcels without a contract remain visible as legacy/unbound records and are not silently upgraded.

Repository-review execution creates the contract after frozen repository/context resolution, before provider invocation. A destination baton carries the contract hash and destination execution remains governed by the existing route, contract and handoff runtimes. Dashboard consumers receive the same parcel state and typed events; durable records are the reconciliation authority.

# Infrastructure-neutral configuration appendix

> Historical/configuration appendix. The authoritative current system and adaptive-harness boundary is [`../ARCHITECTURE.md`](../ARCHITECTURE.md); current terminology is in [`concepts.md`](concepts.md). This document remains useful for the infrastructure-neutral resource/configuration model and does not define the complete 3.0.x product identity.

## Boundary

```text
Human operator
      |
Agent Control policy and durable authority
      |-- lanes, scheduler, leases, ownership, takeover fences
      |-- batons, handoffs, clones, shared tasks, approvals
      |-- provider routing, experiments, recovery validation
      |
ExecutionProvider interface
      |-- built-in/fallback executor
      `-- optional Orca adapter
              |
        local / SSH / HTTP / worktree / CLI agent
```

The invariant is: **execution may be delegated; authority is not**.

## Configuration

`AgentControlConfig` is versioned and persisted separately from code. It contains arrays of resources, providers, services and lanes. Empty arrays are valid. IDs must be unique and stable; transports may change without changing logical identity. Secret-like fields and credentialed URLs are rejected. Credentials are referenced only by environment-variable name.

## Resources and transports

Resources advertise semantic capabilities. The scheduler resolves requirements against those capabilities and current health/load. The transport adapter is selected from `local`, `ssh`, `http` or `orca`. Secure overlay networking can be used under SSH/HTTP but is never mandatory or inferred.

## Providers

Provider definitions are configured data. No local or remote provider exists merely because Agent Control started. Advertised health and functional qualification are distinct. A configured qualification model is required for a deterministic Responses proof.

## Recovery

Persisted work identifies the logical task and expected execution. Reconnect accepts an execution only after matching multiple identity attributes; PID alone is insufficient. Unprovable identity becomes `UNKNOWN`, and scheduling fails closed pending a deliberate recovery or human decision.

## Context and provenance

Context sources are provider-neutral references with origin, repository state, trust class and accessibility. Routing escalates from baton to repository evidence to selected thread sections, using minimum sufficient context. Consensus judges receive independent conclusions only at synthesis time and weight reproducible evidence over vote count.

## Android

Android support is generic. Hardware model is optional observed metadata. Provisioning and recovery are explicit capabilities with approval gates; device name, SSH endpoint, port, user, identity file, repository and health URLs come from configuration.

## Safe zero-configuration behavior

No configuration means no discovered remote resources, no providers and no managed services. Status/up return an `UNCONFIGURED` result without scanning ports, probing private names, starting services or changing external state.

# Migrating to Agent Control 4.3

Agent Control 4.3 combines the 4.2 Transport Context contract, Cache-Aware Expert
Delegation and the complete 4.1 runtime. Installation does not enable a provider,
Saved Job, schedule, remote listener, Warm Expert preference or production route.

Before upgrade, stop the single controller that owns the target state directory,
record its source SHA and supervisor configuration, and take an owner-only state
backup. Keep credential homes and secure-store values outside the checkout.

Action adapters must migrate legacy `register`/`registerControl` calls to one of:

- `registerReadOnly` for a bounded operation with no consequential effects;
- `registerConsequentialControl` with explicit categories; or
- `registerGovernedControl` with a typed resolver.

Legacy registrations remain source-compatible but are `UNKNOWN` and fail closed
when runtime safety is active. This is intentional. Remote paths require node-local
enforcement and cannot be approved from a controller-only lexical check.

Warm Experts remain disabled unless explicitly configured. Existing cache records
are accepted only when route/session/backend/context identity and integrity still
match; otherwise they cool, expire or invalidate. See
[Cache-Aware Expert Delegation](cache-aware-expert-delegation.md) and
[runtime containment](runtime-safety-and-containment.md).

Follow [DEPLOYMENT.md](DEPLOYMENT.md) for installation, validation, rollout and
rollback. Do not run two controller versions against one mutable state directory.

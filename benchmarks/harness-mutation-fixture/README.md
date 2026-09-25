# Frozen governed-runtime fixture

This small repository models the policy, routing, telemetry and context boundaries of a governed agent runtime. It exists only as a deterministic repository-mutation qualification fixture. Every benchmark attempt receives a fresh copy and an independent verifier; model completion is never acceptance.

Key public contracts:

- capability identifiers are trimmed, lower-case and stable-deduplicated;
- a human owner takes unconditional precedence over agent execution;
- unknown provider measurements remain `null`, never invented as zero;
- terminal job states cannot transition again;
- a derived context packet retains the provenance of both its selected evidence and its parent packet;
- production context routing requires explicit qualification and always has a STANDARD fail-safe.

Run the public regression suite with `npm test`. Hidden benchmark verifiers exercise additional task-specific contracts.

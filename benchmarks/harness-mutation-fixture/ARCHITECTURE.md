# Architecture invariants

## Authority and verification

The scheduler owns placement, leases and ownership generations. Tool authorization is checked at every invocation. A human takeover immediately fences the agent regardless of the requested tool risk. Model completion moves work to `VERIFICATION_PENDING`; only an independent verifier may move it to `SUCCEEDED`.

## Context routing

Context availability and execution authority are separate dimensions. OBSERVE records a recommendation but applies STANDARD. EXPERIMENT may apply an explicit requested profile to a controlled run. ENFORCE may apply a recommendation only when evidence for that exact strategy is production-qualified; otherwise it applies STANDARD. Escalation is bounded and moves only THIN to STANDARD to DEEP for an explicit classified reason. It never retries an already attempted profile.

## Provenance and telemetry

Derived packets retain selected source evidence and parent-packet provenance in stable order. Attempts record a caller-supplied correlation identifier across dispatch and telemetry. Unknown provider token or monetary measurements remain `null`.

## Output boundaries

Model-facing tool output is bounded by validated configuration. The authoritative result remains outside the model-facing compact representation.

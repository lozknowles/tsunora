# Governed deterministic skill promotion

Status: experimental Agent Control 4.5 candidate. This is not model training.

Agent Control may turn repeated, independently verified reasoning into a bounded
reusable procedure only when the procedure can be represented by an audited,
pre-registered deterministic handler. A model may teach or propose; it cannot
install code, grant authority or promote its own answer.

## Lifecycle and gate

`UNKNOWN → REASON → VERIFY → OBSERVE REPETITION → CANDIDATE → VALIDATE → PROMOTE → REUSE DETERMINISTICALLY → REVALIDATE/INVALIDATE`

The durable record binds distinct source Work Parcels, originating provider/model/node,
evidence, assumptions, typed contracts, verification method, scope, handler
SHA-256, version, freshness and invalidation conditions. The default requires
three distinct verified Work Parcels. Nomination, validation and promotion are
separate explicit transitions.

At execution, routing rechecks policy, task class, contract/applicability,
freshness and handler identity. Unexpected input, changed environment represented
by the contract, conflicting or expired evidence, missing handler or failed
independent verification rejects the skill and records `ESCALATE_MODEL`. A
successful escalation may become new observation evidence but never changes or
promotes a skill automatically.

## Memory, skill and model

- **Your Memories** answers what Agent Control knows.
- A **deterministic skill** answers what Agent Control can already do within a
  validated contract.
- A **model** reasons about novelty, ambiguity and exceptions.

`ProjectMemoryPort` can retrieve the identity and applicability evidence for a
skill. Retrieval does not force memory text into an LLM: Agent Control can assess
and execute the referenced promoted skill directly.

## Configuration

```json
{
  "deterministicSkills": {
    "enabled": true,
    "routingEnabled": false,
    "minimumDistinctParcels": 3,
    "maximumValidationAgeDays": 90
  }
}
```

Routing is disabled by default. Enabling the lifecycle does not promote any
candidate. The production `deterministic-skill-execution@1.0.0` Job remains
subject to ordinary Work Parcel scheduling, capability placement, artifact
retention and verification.

## Physical evidence

The 2026-09-11 experiment used three real recurring control operations and a
common Intel package + DRAM + NVIDIA board-power boundary. Each task had three
Qwen teacher executions and 15 physically distinct deterministic repetitions.
A changed repository case added an unknown `submodules` field; applicability
rejected it and Qwen handled the escalation. See the [evidence record](evidence/agent-control-4.5-deterministic-skill-promotion-20260911.md).

The measured values do not imply universal savings. If novelty probability and
failed-attempt energy are high, immediate model execution may have lower expected
energy. Specialist models remain appropriate for variable, fuzzy bounded domains
that cannot be encoded as deterministic contracts.

# Capability-routing benchmark

Agent Control 3.6 keeps harness profile separate from execution class. THIN, STANDARD and DEEP control context/execution support; `LOCAL → SPARK → STANDARD → FRONTIER` controls the minimum qualified model/risk class. An actual provider model is selected only after its immutable registry recipe and lifecycle evidence satisfy that class. A THIN task is therefore not automatically Spark or local work.

## Frozen suite and predeclared gate

The frozen `capability-routing-v1` suite contains 60 tasks: 48 development cases and a 12-case holdout. Five variants cover each of documentation, deterministic one-file edits, configuration, lint/type fixes, simple tests, repository navigation, bounded multi-file work, ambiguity, difficult debugging, architecture, security-sensitive work and protected paths.

The suite identity is SHA-256 `fb1460cbea46ca3af70049a8be26a369519c3a14ae0959f362b5895146d0fe15`. Tests pin this hash so a corpus change is explicit rather than silently changing the gate.

Before the first run, the source declares these acceptance criteria:

| Metric | Required |
| --- | ---: |
| Overall classification accuracy | at least 95% |
| Holdout classification accuracy | at least 95% |
| Unsafe false-positive routes | 0 |
| Physical attempts | at least 50 |
| Physical holdout attempts | at least 10 |
| Independently verified success | at least 90% |
| Incorrect changes | 0 |
| Unnecessary files touched | 0 |

Unsafe false-positive routing means selecting a less capable/risk-controlled class than the frozen oracle. Conservative escalation is safer and is recorded separately. Unavailability escalates in order: LOCAL to SPARK, SPARK to STANDARD and STANDARD to FRONTIER. Work that requires FRONTIER fails closed if no qualified FRONTIER recipe is available.

## Observation contract

The benchmark accepts physical observations only when each row records the exact task, strategy, execution class, provider and model, independent verification, latency, attempts, escalation, parent context, baton size, additional-context requests, incorrect changes, unnecessary files and evidence references. Provider-reported input/output tokens and monetary cost are nullable. Missing values remain `null` and are never converted to zero.

Run the deterministic routing gate:

```bash
npm run benchmark:capability-routing
```

Run it against a retained JSON array of genuine physical observations:

```bash
npm run benchmark:capability-routing -- \
  --observations /absolute/path/to/physical-observations.json \
  --output /absolute/path/to/capability-routing-report.json
```

The committed deterministic report is [capability-routing-benchmark-v1.json](evidence/capability-routing-benchmark-v1.json). It records 60/60 correct classifications, 12/12 holdout classifications and zero unsafe false positives. It contains no physical observations: verified model success, latency, attempts, tokens, monetary cost, incorrect-change counts and cost/time per verified outcome remain unknown. Consequently the physical gate fails and the recommendation is `KEEP_AUTOMATIC_PRODUCTION_ROUTING_DISABLED`.

## Coordinator/baton experiment

The same report freezes a twelve-part parent job and two strategies:

- A gives one FRONTIER worker all twelve task definitions in one 5,011-byte parent context.
- B gives a coordinator a 514-byte parent index and compiles 12 bounded child contracts. Each sealed minimal baton is 577–662 bytes; the total is 7,457 bytes, with parent and child accounting kept separate.

Every child baton records objective, exact file/line scope, transferred and withheld authority, verifier, minimum execution class and completion rule. The compiled plan does not invent worker results, context requests, verification, escalation, integration cost or latency; those fields remain `null` until the physical experiment runs.

The separate [physical multi-provider qualification](physical-multi-provider-qualification.md) proves one real Luna/local/GLM/Luna delegation and integration chain. It is not imported as 50 benchmark observations and therefore does not change this benchmark's physical gate.

## Production boundary

The deterministic classifier gate passing does not qualify providers or automatic routing. Agent Control 3.6 permits explicit/manual selection, benchmark mode, shadow observations, candidate recommendations and governed opt-in only. Scheduled and manually initiated Jobs must use the same governed contract path. Spark stays default-disabled, and no production Job route changes from this report.

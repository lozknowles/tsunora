# Persistent Teammates

Persistent Teammates is a lightweight identity and collaboration layer above the existing Agent Control Job and adaptive-harness boundaries. A teammate is retained operator state, not a new authority domain and not a provider or model identity.

## What persists

Each teammate has a stable ID, display name, role, bounded instructions, preferred semantic capabilities, up to 32 verifier-backed working-context summaries, and reusable routines. A routine is saved either explicitly by an operator or from a Run with an evidence reference. Credentials and secret-like bearer material are rejected rather than retained.

The starter catalogue contains:

- Ask Collingham Engineer
- Infrastructure Operator
- Independent Auditor
- Researcher
- Coordinator

Initialize a state directory without altering provider, worker, lane or scheduler configuration:

```bash
npm run init:teammates
```

The canonical seed file is `config/teammates.initial.json`; mutable profiles, context, routines, conversations and delegations are written under the selected `AGENT_CONTROL_STATE_DIR` as `teammates.json`.

## Authority boundary

`preferredCapabilities` are placement requirements, never grants. `JobRuntimeTeammateExecutor` creates an ordinary versioned Job for each specialist assignment and coordinator synthesis. It then uses the existing:

1. Job Catalog and Run Ledger;
2. priority/concurrency rules;
3. capability-advertising Worker Registry;
4. Action Registry;
5. model-backed Agent Action requirement;
6. artifact contracts and SHA-256 provenance;
7. declared verification evidence;
8. invocation telemetry and final-result marking.

Production teammate execution therefore requires a registered model-backed Agent Action, which remains subject to `HarnessDispatcher`, `AdaptiveHarness`, `ToolPolicy`, live lease/ownership checks, THIN/STANDARD/DEEP routing, and normal escalation. The executor rejects a Control Action unless a deterministic demo explicitly enables that exception. A teammate cannot register its own Action, advertise worker capabilities, approve a risk, acquire a lease, choose its provider, verify its output or accept its result.

## Delegation and conversations

The Coordinator opens a bounded conversation with an explicit participant list and at least two specialists. Only declared participants can exchange delegation, result, synthesis or control messages. Each specialist assignment becomes an independently verified Run. If any Run is not `SUCCEEDED`, lacks verifier PASS evidence, or lacks linked invocation telemetry, the conversation becomes `REVIEW_REQUIRED` and synthesis stops.

Only after every specialist result verifies does the Coordinator receive those results for a separate governed synthesis Run. The combined answer is retained only after that Run also verifies. Every specialist and synthesis record retains its Run ID, evidence IDs, invocation IDs, normalized token fields, cost/currency when available, and explicit `null` values when the provider does not expose a measurement.

## Demo

```bash
npm run demo:teammates
```

The deterministic demo is provider-neutral and performs no external or production work. It creates three real Agent Control Runs:

- Researcher specialist Run;
- Independent Auditor specialist Run;
- Coordinator synthesis Run.

All three use capability placement, typed artifacts, verifier evidence and the existing telemetry ledger. The demo writes a detailed JSON artifact beneath ignored `qualification-results/` and prints a compact PASS summary. Its deterministic token and cost figures prove telemetry propagation only; they are not provider billing or model-quality evidence.

# Agent Control 3.2.0 Persistent Teammates verification

Date: 2026-08-29

## Result

PASS for the additive Persistent Teammates layer and deterministic coordinator demonstration. This evidence does not claim live provider quality, real provider billing, production routing qualification or deployment.

## Demonstrated execution

The Coordinator delegated one real Agent Control Job to Researcher and one to Independent Auditor, then created a third Job for verified synthesis. All three Runs used capability placement, the Run Ledger, typed checksummed artifacts, declared `teammate-output-verified` evidence, invocation IDs and final-result telemetry marking.

| Phase | Teammate | Run | Result |
|---|---|---|---|
| Specialist | Researcher | `run-7399b8ec-2f79-46ef-bd4c-14f6c4f396c6` | SUCCEEDED / verifier PASS |
| Specialist | Independent Auditor | `run-f08b1616-4455-4240-8748-1e887124cc70` | SUCCEEDED / verifier PASS |
| Synthesis | Coordinator | `run-c5eef9eb-7b63-4a02-8d11-dc2af0da5eec` | SUCCEEDED / verifier PASS |

Conversation `conversation-dcc85217-9095-4fb5-903e-107bc0c72c10` finished `VERIFIED`. Each profile retained exactly one result summary linked to its verified Run and evidence ID.

## Telemetry

- Delegated Jobs: 3
- Invocation records: 3
- Verified successes: 3
- Verifier failures: 0
- Deterministic processed tokens: 480 total; 300 fresh input, 60 cached input and 120 output
- Deterministic reported cost: USD 0.0006 total; USD 0.0002 per verified outcome
- Profiles exercised: THIN for specialists, STANDARD for synthesis

These values are controlled fixtures that verify propagation through the existing telemetry ledger. They are not external-provider measurements.

## Authority checks

- Preferred capabilities become Job placement requirements and never capability grants.
- The production executor rejects a Control Action; a model-backed teammate must use a registered Agent Action beneath the existing adaptive-harness boundary.
- The deterministic demo must explicitly opt into its Control Action fixture.
- An unverified specialist result changes the conversation to `REVIEW_REQUIRED` and prevents all later delegation and synthesis.
- Undeclared conversation participants cannot inject messages.
- Verified-run routines require a source Run and evidence IDs.
- Secret-like bearer or API-key text is rejected from persisted profile material.

## Repository release gate

- `npm run check`: PASS
- TypeScript typecheck: PASS
- Bootstrap, dashboard syntax and provider-neutrality checks: PASS
- Implementation-status registry: PASS, 18 entries
- Test suite: PASS, 390 tests; 0 failed, skipped or cancelled
- Initial teammate seeding: PASS, five profiles and idempotent second run
- Package dry run: PASS, `agent-control@3.2.0`
- `git diff --check`: PASS

## Raw evidence

Ignored runtime artifact:

`qualification-results/persistent-teammates-2026-08-29T20-17-07-847Z.json`

SHA-256:

`7a3217178097c83acb4a9e8125f1757d171d81fdb470801f07b21bb48581e117`

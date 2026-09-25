# Agent Control v4.12.0 release verification

Release baseline: public `v4.11.0` / `9dff191034b7c69e102687bef02803bc05afe874`.

Candidate branch: `release/4.12.0-rc-20260920`.

Qualified implementation source: `ea8ff412f5cac9514698ddbdcc132fbe0e8d6ea9`. The publication commit may add release-record documentation only; it must preserve the qualified implementation tree and pass the final checks before tagging.

| Gate | Status | Evidence |
|---|---|---|
| Source reconciliation | PASS | Public baseline and 48 candidate commits reconciled; no unexpected unrelated change was admitted |
| Architecture and provider neutrality | PASS | Typecheck, three neutrality tests, manual coupling review and implementation-status check |
| Cost-policy dashboard approval | PASS | Focused configuration/web tests; exact-hash proposal and append-only override retention |
| Security and protected resources | PASS | 62 focused security and authorization tests passed |
| Full regression suite | PASS | 2,003 passed, 0 failed, 0 skipped in 259499.471258 ms on the qualified implementation source |
| Virgin install | PASS | Exact release package installed and started in a clean isolated environment; protected status/configuration/cost-routing APIs verified |
| Upgrade from 4.11.0 | PASS | Authentic v4.11.0 state upgraded without migration; configuration and run-ledger bytes preserved |
| Desktop browser | PASS | Final-source 1440 x 1000 inspection passed |
| Mobile portrait and landscape | PASS | Final-source 390 x 844 and 844 x 390 inspections passed; the cost-policy form uses the corrected single-column portrait layout |
| Mallow narrated walkthrough | PASS | Continuous final-source H.264/AAC recording with audio-bound stages and at least 3.5 seconds settled per view |
| Documentation and links | PASS | 4.12 release notes, upgrade, feature guides, README and documentation index reconciled |
| Distribution archive and checksum | PASS | 1,541-entry archive independently inspected; SHA-256 `4c6a6143939aefbaef22023d8fd7589853bed654a4166ce4736cf6e063e5c3de` |

The release artifact built from the qualified source is `agent-control-4.12.0.tgz` (23,745,054 bytes). Publication must rebuild or independently verify the artifact from the annotated tag and publish its checksum.

## Visual evidence

The final-source narrated walkthrough is retained outside the source archive as `agent-control-4.12-final-source-narrated-dashboard.mp4`, SHA-256 `6876b2578dec50d95db6375aa4f260ad2e8cfaf2b577417f99638c969f8d8f0c`, duration 144.53 seconds. An extended parent-candidate recording is supplementary and is not final-source qualification.

## Qualification boundaries

- Live paid OpenRouter execution was not performed; the optional adapter is contract- and fixture-qualified.
- Cost values absent from provider evidence remain `unavailable`, never an invented zero.
- The experimental model host is a qualification adapter, not a general production service.
- Agent Templates execute only registered allow-listed native actions and do not gain shell, network or protected-resource authority from their manifests.
- Mallow narration is presentation over deterministic evidence and cannot create execution facts.
- Operational Agent Control installations are not deployed by this release task.

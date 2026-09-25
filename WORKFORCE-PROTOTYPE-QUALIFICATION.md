# Workforce prototype qualification

Overall prototype status: **EXPERIMENTAL**. Governed synthetic workflow demonstration: **PASS WITH LIMITATIONS**. This is a research candidate, not a production HR product or a Kinfolk integration.

## Identity and boundaries

Research branch: `research/workforce-ops`. Base: `2915a630db0ead1333cc9657ef44af9e953cc19b`. Exact candidate commit is recorded in the sealed evidence `candidate.json` to avoid a self-referential commit hash. Only new domain, UI, scripts, tests and documents were added; existing core source and tests were not altered. Protected publication lineage and production installations were not changed. Nothing was pushed, published or deployed externally.

Execution used the real Agent Control JobRuntime, capability registry, approval transition, ledger, artifacts, retry selection, scope assessment, containment supervisor and owned-process cleanup. Enterprise systems and all workforce records are synthetic. Workers are deterministic code; no local or API model inference was performed.

## Tests and physical results

- Frozen workload: 120 cases; SHA-256 `9927fac2559bf20fdbf8f1e7f296a73814df7ad30378f5ca028c22ab26282a55`.
- Focused balanced-primary boundary suite: **120/120 PASS**.
- Full repository regression: **2,480/2,480 PASS**, 0 failures/skips/cancellations; 294.403 seconds.
- Initial 118/120 focused run exposed a fault-injector target defect; retained, corrected and rerun.
- Initial full regression 2,478/2,480 exposed shared-theme integration defects; retained and corrected without weakening tests.
- Five additional security groups PASS: stale-state overwrite prevention; cross-tenant/replay approval denial; expired qualification/capacity rerouting; raw-text non-retention; HTTP session/origin/role boundaries.
- Three Chromium-driven live hero demonstrations PASS: autonomous document request; high-risk approval pause/resume; wrong-target block, actual process stop/quarantine, same-job retry and verification. Unauthorized employee approval was denied. No browser page errors; 390-pixel mobile layout checked.
- Independent Python inspection validated 360 recorded executions, 196 verified completions, expected state and artifact hashes. This validates evidence consistency, not 360 successful workflows.

## Acceptance criteria

| # | Requirement | Result and evidence boundary |
|---|---|---|
| 1 | Natural language becomes governed job | PASS WITH LIMITATIONS: bounded deterministic recognition, actual ledger job; ambiguous text fails closed. |
| 2 | Specialist cooperation | PASS: intake, policy, specialist action and verification workers; real capability selection. |
| 3 | Autonomous low-risk work | PASS: live document hero and frozen cases. |
| 4 | High-risk approval boundary | PASS: actual WAITING_FOR_APPROVAL; no pre-approval mutation. |
| 5 | State survives pause | PASS: retained plan/artifacts; reconstructed-runtime approval restart case. |
| 6 | Approved work resumes | PASS: exact current approval, retained before-state and verified mutation. |
| 7 | Unauthorized action blocked | PASS: wrong employee scope rejected before mutation; unrelated record unchanged. |
| 8 | Contain/quarantine offender | PASS WITH LIMITATIONS: actual owned Node process stopped; core quarantine and worker exclusion. Trusted controller handler is not a hostile-code sandbox. |
| 9 | Reroute/recover original job | PASS WITH LIMITATIONS: primary configuration recovers 20/20; single eligible worker configuration 0/20 and safely waits. |
| 10 | Independently verify state | PASS: separate verification step plus Python retained-evidence verifier. |
| 11 | Useful evidence | PASS: ledger events, immutable artifact hashes, before/after, scope and containment records; clickable UI. |
| 12 | Compare models/worker strategies | PASS WITH LIMITATIONS: three deterministic worker/approval configurations, same frozen workload. Model, architecture and Lean/Standard/Deep comparisons BLOCKED/not implemented for this domain. |
| 13 | Agnostic architecture | PASS WITH LIMITATIONS: no provider dependency added; real multi-provider workforce execution not qualified. |
| 14 | Existing behaviour intact | PASS: full regression and additive diff; no production claim beyond tests. |
| 15 | Evidence-calibrated claims | PASS: all failures retained and mock, physical, deterministic and untested dimensions distinguished. |

## R&D benchmark

Balanced-primary: 120/120 expected boundaries; 72 verified completions; 20/20 recoveries. Balanced-fallback: 100/120 expected boundaries; 52 completions; 0/20 recoveries. Review-all-primary: 120/120 expected boundaries; 72 completions; 20/20 recoveries. Each configuration attempts all 120 cases, including deliberate rejection/ambiguity cases. Unsafe mutations: 0 observed. The original aggregate harness classification **BLOCKED** is preserved because 20 single-worker resilience cases lack a replacement and remain WAITING. See WORKFORCE-PROTOTYPE-RD-RESULTS.md for denominators and timing.

Token/cache/cost/energy metrics: UNKNOWN. No model workload or economic benefit is claimed. Backend/model unavailability and tool faults are controlled injected conditions, not evidence of a physical model outage.

## Video

Delivery: `D:\Downloads\agent-control-workforce-lab-live.mp4`. Duration 29.88 seconds; SHA-256 `72da4b8b3e0ef2fa0d7a69e9a30e4847b973473d2199e9ea6d1a5aab4387406a`. Three genuine live browser recordings started before job submission, concatenated without invented overlays; no audio. All individual videos and combined export passed full decode. Final frames inspected. Raw WebM captures, runtime projections, screenshots and video-verification.json retained. This is execution evidence, not an explanation-length narrated film.

## Security and limitations

Synthetic fixtures exclusively. Raw employee text is normalized rather than persisted; session capabilities are random, ephemeral and omitted from evidence. Loopback-only research launcher provides synthetic employee/HR roles, not production SSO. Filesystem owner remains trusted. New-source secret scan returned no findings; final evidence scanner results are sealed separately.

No universal prompt-injection resistance is claimed. Pattern-based rejection covers frozen cases. Real HRIS/payroll/identity APIs, real bank/salary mutation, remote workers, model reasoning and production identity are unqualified. High-risk case preparation does not implement a complete international employment or termination workflow. Incorrect-output cases retain failed synthetic state rather than claiming atomic rollback. Multi-resource atomicity/power-loss recovery are not provided. Active-run crash recovery is fail-closed, not an exactly-once guarantee. R&D UI displays CLI-generated results; it does not launch arbitrary model configurations. Exchange remains optional/EXPERIMENTAL and is not instantiated by this prototype.

Reproduction commands are in WORKFORCE-PROTOTYPE-DEMO-GUIDE.md. Source archive, candidate identity, raw runs, scanner outputs and per-file SHA-256 manifest are supplied in the evidence bundle. The evidence is local review material, not permission to publish infrastructure paths or historical source.

## Recommendation

Retain as an isolated research workload. The smallest credible proposition is demonstrated: existing governance can run synthetic workforce tasks, stop for approval, block a wrong-target action and recover with retained evidence. Do not promote it to production readiness. Next qualification should bind real authentication and a disposable enterprise API contract, then add a separately authorized model adapter and frozen model comparison without weakening these boundaries.

# Agent Control 3.4.0 release qualification

Date: 2026-09-01

Implementation candidate: `2417b2189c99f97d902ee467facdb96f1bdc71c2`

Branch: `feature/3.4-parameterized-jobs`

This evidence contains no provider credential, repository secret, provider response body, or uncommitted source content. The final release commit is a descendant of the implementation candidate containing only release evidence/status updates and is identified authoritatively by tag `v3.4.0`.

## Automated gates

- `npm run check`: PASS; typecheck, bootstrap syntax, dashboard syntax, infrastructure-neutrality, implementation-status and 550 serial tests all passed with zero failures.
- Focused parameterised Job coverage: PASS for definition validation/versioning, repository resolution and frozen SHA, read-only snapshots, model routing/fallback, lifecycle, budgets, cancellation, restart recovery, immutable Runs, delta baselines, schedules, deterministic occurrence identity, missed-run policy and overlap protection.
- Packaging was exercised with `npm pack` followed by a disposable `npm install --ignore-scripts`; the installed package reported version `3.4.0`. The formal release artefact hash is recorded in the GitHub Release after the final evidence commit.

## Real Repository Code Review

The final candidate was executed by the Agent Control Job engine, not Codex and not an interactive model session.

| Field | Qualified value |
| --- | --- |
| Saved Job | `localwalks-qualification-review` |
| Run | `a25479c7-d969-464f-846e-943092c3122d` |
| Status | `SUCCEEDED_WITH_FINDINGS` |
| Source repository | `/opt/repos/LocalWalks` on execution resource `controller-host` |
| Requested ref | `main` |
| Frozen/reviewed SHA | `7f99b664a90c887fdf7c310ce465de1ee94f1bcc` |
| Source state | dirty; uncommitted state was recorded but not included in the frozen review |
| Snapshot | isolated local shared clone, read-only review authority |
| Context | `THIN`; one represented source file plus complete repository tree; 722 omissions explicitly recorded; one attributable chunk |
| Logical route | `review.default` |
| Selected registry model | `glm-5.3-flash` |
| Provider/model | `openrouter` / `z-ai/glm-5.3-flash` |
| Fallback | false |
| Work Parcel | `parcel-6f800779-414d-4583-b438-3a00346e66e2` |
| Runtime | 128.858 seconds (`10:22:04.510Z` to `10:24:13.368Z`) |
| Usage | 4,776 input; 12,802 output; 17,578 total tokens |
| Cost | provider reported/effective USD 0.00711668826; configured-price calculation USD 0.00355870 |
| Result | `PASS_WITH_FINDINGS`; eight findings accepted by file/range validation |
| Sanitized evidence | `provider_response_sha256:8cddb09daea6014b4d3371f40829465385b73ac2c36d792637b5b25e6795f6c9` |

The successful baseline now identifies the frozen SHA and this Run. A previous provider-malformed response failed closed and did not advance the baseline. The candidate adds retention of sanitized usage, finish-reason and response-hash evidence when a provider returns a valid envelope without usable output.

## Real delta qualification

A controlled clean repository established baseline `821560d64a52b9e7956ed75ec5a291fd77cf4348`, then advanced to `cfd5168f5710d18c8d32cfe1a1e1f9d8647e5a3d` with one harmless committed test change in `src/value.test.ts`.

- Baseline Run `b00d6a48-69e8-4b81-b621-a7af56ef4adf`: `SUCCEEDED_WITH_FINDINGS`; 507 input / 8,680 output / 9,187 total tokens; Work Parcel `parcel-85b977bc-40ba-4bb7-8ef3-2e837a575103`.
- Delta Run `969ec74d-3024-42a7-ac29-34eb981a9a9d`: `SUCCEEDED_WITH_FINDINGS`; comparison and current SHA were exact; the changed-file context contained `src/value.test.ts`; 724 input / 6,132 output / 6,856 total tokens; Work Parcel `parcel-e8effcc0-102a-4668-b1c2-7320f295a3c1`.
- The successful delta advanced the baseline to the second SHA. Tests separately prove that failed results and rewritten non-ancestor history do not advance it.

## Scheduled execution and idempotency

The committed candidate's deterministic one-time scheduler proof is Run `04c64879-7b84-4043-a374-e8a4dbfe80b1`.

- Scheduled occurrence: `2026-09-01T10:12:42.815Z`.
- Durable request: `10:12:42.824Z`; actual start: `10:12:42.828Z`; completion: `10:14:03.264Z`.
- The trigger retained the exact scheduled occurrence separately from its scheduler cursor.
- Result: `SUCCEEDED_WITH_FINDINGS`; Work Parcel `parcel-441d52a6-4271-496f-8369-edd4a3d26bfd`; 576 input / 8,466 output / 9,042 total tokens.
- The unchanged current/baseline SHA was represented explicitly, the one-time occurrence had no next recurrence, and the temporary Saved Job was disabled after completion. No recurring qualification cost remains enabled.
- Tests prove restart persistence, duplicate-occurrence prevention, missed-run skip/run-once behaviour, one-Run retry identity and overlap exclusion.

## Dashboard visibility

An isolated observer-only 3.4 dashboard was started on loopback against the qualification state and then stopped. Its Jobs page exposed distinct Job Definitions, Saved Jobs, Schedules and Runs views. `GET /api/job-runs/a25479c7-d969-464f-846e-943092c3122d` returned the terminal status, exact SHA, selected provider model, Work Parcel and eight findings. No live deployment was changed.

## Release gate

The implementation candidate satisfies the mandatory real repository, delta, scheduled, direct-provider, persistent-evidence, dashboard and regression gates. The formal tag and GitHub Release may be created only after the generated implementation status, final full gate, package installation, clean-tree and remote-state checks pass.

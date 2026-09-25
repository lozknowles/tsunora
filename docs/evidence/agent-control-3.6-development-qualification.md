# Agent Control 3.6 development qualification

Date: 2026-09-01

This evidence closes the eighth development checkpoint on `feature/agent-control-3.6-acp-runtime-routing`. Agent Control 3.6 remains unreleased: this checkpoint was not merged, tagged, released or deployed. The immutable recovery baseline is Agent Control 3.5.0 tag `v3.5.0`.

## Qualified implementation

- Stable ACP protocol v1 uses exact `@agentclientprotocol/sdk@1.4.0`, schema release `schema-v1.21.0`, Zod `4.5.4` and WebSocket transport `ws@8.21.3`. Official SDK clients qualify NDJSON stdio plus authenticated Streamable HTTP and WebSocket on ephemeral loopback. An SDK-independent raw-wire harness covers malformed JSON, invalid request IDs and unknown methods.
- Contract-owned execution retains the sealed baton, replaceable route, process/PTY authority, approvals, evidence and verification across substitution, detach and controller reconstruction.
- `SACRIFICE`, `SUBSTITUTE`, `DELEGATE`, `YIELD` and `COMPLETE` have durable transitions. AUTO is bounded by existing authority/budget; risky or expanding requests wait for MANUAL approval.
- Logical providers, immutable exact model recipes, evidence-gated lifecycle transitions, champion/challenger policy, replay and rollback are durable and session-neutral.
- The frozen capability-routing suite contains 60 tasks and a 12-task holdout at SHA-256 `fb1460cbea46ca3af70049a8be26a369519c3a14ae0959f362b5895146d0fe15`.
- The physical `gpt-5.6-luna → qwen2.5-3b-instruct-q4_k_m.gguf → z-ai/glm-5.3-flash → gpt-5.6-luna` chain genuinely ran, including YIELD, SUBSTITUTE, detach/reconstruction and independent child/parent verification.
- `GET /api/runtime` and the existing Sessions, Systems and Models views expose one redacted ACP/contract/PTY/handoff/lifecycle projection without creating browser mutation authority.

## Validation results

| Gate | Result |
| --- | --- |
| `npm run status:implementation -- --write` | PASS; generated 29 claims |
| `npm run check` | PASS; TypeScript, bootstrap/shell syntax, dashboard syntax, neutrality, implementation status and 628/628 tests |
| Focused runtime/dashboard tests | PASS; 26/26 |
| `npm run benchmark:capability-routing -- --output ...` | PASS deterministic gate; 60/60 overall, 12/12 holdout, 0 unsafe false positives |
| `npm run qualify` | PASS local release gate; configured infrastructure truthfully skipped because the isolated worktree has no deployment configuration |
| Repository-local Markdown link check | PASS; 93 Markdown files and 310 local links |
| `git diff --check` | PASS |
| `npm install --no-package-lock --ignore-scripts` | PASS; 19 packages audited, 0 vulnerabilities reported |
| `npm pack --dry-run --json` and temporary package install/CLI launch | PASS |
| Changed-source credential-pattern and staged-evidence review | PASS; no credential values or private-key material retained |

The repository intentionally has no npm lockfile, so standalone `npm audit` cannot construct an audit tree. The installation gate's built-in npm audit reported zero known vulnerabilities. Exact production dependency versions remain pinned in `package.json`.

## Honest limitations

- ACP v2 is draft, disabled, not imported and not claimed.
- Remote ACP qualification is ephemeral authenticated loopback only. Production TLS/non-loopback deployment has not been performed.
- Cancellation while provider work, a client-owned permission request or client-owned tool work is pending still needs end-to-end fixtures.
- The durable PTY authority model is qualified, but operating-system-specific PTY creation and signal-delivery adapters remain unfinished.
- The coordinator experiment currently proves deterministic decomposition and sealed-baton accounting only; it has no physical worker/integration outcome comparison.
- The routing benchmark contains no physical observation rows. Verified success, latency, tokens, cost, incorrect-change and cost/time-per-verified-outcome metrics therefore remain unknown.
- One physical multi-provider contract does not satisfy the predeclared 50-attempt routing gate. Automatic production capability routing and Spark-by-default remain disabled.

## Verdict

`PASS_WITH_LIMITATIONS`

This result is sufficient to preserve the isolated 3.6 development checkpoint. It is not a 3.6 merge or release decision.

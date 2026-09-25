Historical pre-linking checkpoint. Superseded for live results by [live qualification](live-qualification.md). The pending statements below describe the earlier HTTP-only stage.

# OpenWA pilot qualification — 2026-09-05

Result: automated and isolated HTTP pilot checks passed; physical WhatsApp qualification is pending. This is not a release or a production deployment.

Baseline was verified over SSH port 2222 on the verified Linux pilot host. The canonical checkout remained clean at `e7fe5c010bbea75e41f8ec875aab08caaa738104` on `feature/3.7-token-aware-baton-routing`. PR #6 was already merged. The isolated feature worktree was created from current `origin/main`, `4966c97`, on `feature/openwa-whatsapp-20260905`. Existing worktrees and qualification evidence were preserved.

## Automated checks

- `npm run check`: PASS, 846/846 tests. Typecheck, bootstrap syntax, dashboard syntax, infrastructure-neutrality and implementation-status checks passed.
- Focused OpenWA adapter suite: 16/16 passed, included in the total above. It covers two-step enrolment, unauthorized senders, HMAC rejection, groups, self/edited/forwarded/quoted/media events, stale messages, finite argument validation, budgets, ownership, cancellation, disconnect/disable isolation, queue persistence/backoff/uncertain sends, terminal suppression, natural-language proposals, HTTP authentication/origins, and delivery acknowledgements.
- Runtime crash test actually kills a child writer with SIGKILL after persistence, reloads the ledger and proves the same request creates no second job. A separate test reconstructs the adapter's interrupted-acknowledgement state and reconciles the committed run.
- OpenWA 0.23.4 at `1bfebfe57232bcb20ddd0975560d3f4bc994fb36`, with the retained pilot patch: build PASS; 123 upstream webhook/idempotency/message-mapping tests PASS; 2 additional forwarding-provenance tests PASS.
- Chromium rendered the private dashboard on desktop and 390px mobile: no page errors, no mobile overflow, selected real run visible. QR material and credentials were not captured.

An initial regression exposed the optional test manifest in the default reference catalogue. The manifest now lives under `docs/openwa/jobs` and the pilot uses its own manifest directory. The final full gate passed. A visual assertion was corrected to account for uppercase display of run IDs; the dashboard deep link was verified against the actual rendered run.

## Chronological isolated pilot transcript (UTC)

This transcript describes actual gateway and controller HTTP operations, not messages sent from a phone.

| Time | Observation |
| --- | --- |
| 15:06:51 | Controller setup: adapter enabled, gateway session created, zero human operators. |
| 15:06:51 | With adapter disabled, dashboard API accepted `run-1c5b8b4c-2521-4cbd-87ac-2a796fc70161` as QUEUED. |
| 15:06:52 | Same liveness job reached RUNNING. Cancellation API returned CANCELLING. |
| 15:06:52 | Runtime reached CANCELLED with cleanup confirmed. |
| 15:06:52 | Adapter re-enabled; fixed repository typecheck accepted as `run-154f2a84-a844-4193-a722-dededa9869e0`. |
| 15:07:08 | Typecheck job SUCCEEDED with `tests-passed` and artifact `artifact-cc981de3-756a-4b07-8be6-a67b03c09521`. |
| 15:16:44 | Real OpenWA signed test webhook reached the controller with HTTP 200. Session-scoped API key received HTTP 403 for gateway-wide key management. |
| 15:18 | Desktop/mobile setup and selected completed run rendered successfully. |
| 15:18:25 | New dedicated pilot session reached QR_READY, QR available privately, linked phone null, zero enrolled operators. |

Only the new pilot services were started/restarted: `agent-control-openwa-gateway-pilot` and `agent-control-openwa-controller-pilot`. The listener inventory verified `127.0.0.1:19190` and `127.0.0.1:19191`; protected model listeners 8080/8081 remained present. Default Docker composition was not used. Redis/cache/queue and built-in Docker services were disabled. The API's Docker destination points to an unused loopback port, and no Docker daemon operation was performed.

Private raw pilot evidence/configuration lives under `[private qualification path]`. Sanitized user deliverables include `http-qualification.json`, `gateway-qualification.json`, `automated-check.log`, `dashboard-setup.png`, `dashboard-setup-mobile.png` and `dashboard-test-result.png`. No credentials/session/QR files are committed.

## Explicit remaining gaps

The dedicated phone must scan the private linking QR. Then the separate human account must complete dashboard enrolment and be granted templates. Help/status, bounded job start, progress, cancellation, completion report and reconnect/replay must still be demonstrated through that actual conversation. A physical conversation transcript and video therefore do not exist yet.

The adapter supports legacy jobs and pinned saved repository reviews, including durable request reconciliation and history-derived model handoff notifications. Automated fixtures verify the saved-review bridge and distinguish requested and completed handoffs; they are not physical or provider qualification. The isolated pilot has no configured review provider. The existing FreeToken benchmark action is a gated stub, not qualified execution. Current context occupancy is unavailable where no reliable run-scoped source exists. These limits keep the capability registry at PARTIAL.

No merge, tag, release or production deployment occurred under this task. No other WhatsApp account was substituted and no WhatsApp recipient was contacted.

Display captured: separate headless Chromium, desktop 1440x1000 and mobile-emulated 390x844. No primary desktop or handset display was captured. No fallback interrupted the operator. Future automated interaction and video default to a dedicated virtual display; actual handset verification will identify that display explicitly.

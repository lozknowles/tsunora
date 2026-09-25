# Optional WhatsApp pilot

Status: core live WhatsApp job control qualified; overall pilot PARTIAL. Linking, separate-human enrolment, help, typecheck, status, delivered reports and cancellation with cleanup passed. See [live qualification](live-qualification.md) for reconnect/replay evidence, video provenance and remaining handset-link/provider limitations. No release or production installation is implied.

OpenWA is an unofficial WhatsApp Web gateway. The upstream project warns of account restriction risk and that send API acceptance does not prove delivery. Use a dedicated account; retain the normal Agent Control dashboard. No reserved-username capability is assumed. The gateway account number, display name and any username are not human operator credentials.

## Architecture and authority

`messaging-commands.ts` owns the channel-neutral deterministic command/proposal and immutable template contract. `openwa.ts` is an optional adapter loaded only when `AGENT_CONTROL_OPENWA_CONFIG` is set. It calls the existing application service, RunLedger, scheduler, safety policies, approvals and owned-process cancellation. It is not a job executor. A disconnected, disabled or misconfigured adapter leaves dashboard and core job operation available.

Send one command per message: `help`, `jobs`, `run <template>`, `status job 1`, `cancel job 1`, `report job 1`, `watch job 1`, `unwatch job 1`. Each operator gets persistent short job numbers, starting at 1. Acknowledgements show the number and the exact cancellation command; internal run IDs remain in dashboard links and are still accepted for compatibility. Numbers survive restart, are never recycled, and resolve only within the enrolled sender's jobs. Existing runs receive numbers chronologically on upgrade. Optional approved arguments use JSON; templates can provide useful defaults so ordinary operation needs no JSON. Cancelling an already completed job reports that nothing remains to cancel. Pause/resume are unsupported. No approval command exists; use the authenticated main dashboard.

Limited natural language (for example `please run test-execution` or `show my jobs`) produces a validated proposal without execution. The operator must send its explicit command as a new message. Ambiguity requires clarification. This works without an LLM. Templates use an exact definition SHA-256, fixed parameters and finite allowed argument values; grants, per-job concurrency and hourly run budgets are checked at submission. Definition changes require a new configured hash. Existing step timeouts, model limits and approval requirements remain in force. Monetary/token admission limits must be part of the approved job's existing policy; the adapter does not invent billing measurements.

## Upstream pin and required patch

Inspected and built: OpenWA 0.23.4, commit `1bfebfe57232bcb20ddd0975560d3f4bc994fb36` plus gateway-pilot.patch (external patch omitted; redistribution provenance unresolved). The patch binds the gateway to loopback and carries the whatsapp-web.js `isForwarded` flag into its signed message envelope. Unpatched messages with missing forwarding provenance are rejected. Only whatsapp-web.js is selected and patched; Baileys is not qualified here.

At this pin, `webhook-delivery.service.ts` signs exact serialized JSON with HMAC-SHA256 in `X-OpenWA-Signature: sha256=<hex>`. Signing is optional upstream but mandatory for Agent Control. The adapter compares signed session/event/idempotency/delivery fields to corresponding headers. Stable sender JIDs (`@c.us`, `@s.whatsapp.net`, or `@lid`) come from the signed direct-chat event; no phone mapping, username or display name grants permission. LID senderPhone is advisory and unused. A changed JID requires new enrolment. The session API's actual phone must match environment-specific `expectedPhone` while status is `ready`.

Outbound text uses `POST /sessions/:id/messages/send-text` with `{chatId, text, linkPreview:false}` and reads `messageId` from the response. Actual phone qualification exposed the earlier incorrect `to` field and phone-capitalized `Help`; both are corrected and regression-tested. A send response remains submission evidence only; signed delivery/read events provide stronger delivery evidence.

Only fresh original direct text messages with explicit non-self, non-group, non-forwarded provenance execute. Quotes, attachments, edits, acknowledgements and delivery events cannot execute. Event and message timestamps have a five-minute window. Enrolment is a five-minute random challenge created in the authenticated dashboard, observed once from a separate sender, then explicitly confirmed in the dashboard with template grants. Default grants and enrolled senders are empty.

## Durable processing and delivery

SQLite WAL with FULL synchronization stores pairing hashes, operator grants, safe command audit fields, watches and the outbox. Raw incoming message bodies are not retained. Keep its directory private (0700), including WAL/SHM files, and run one controller per state directory. Runtime request keys are persisted with runs before acknowledging commands, with durable atomic ledger snapshots. A webhook retry after an interrupted acknowledgement reconciles the existing run, without using another budget slot. Never start two controllers against the same runtime ledger.

Upstream redelivery retains an idempotency key but can issue a new delivery ID. The adapter deduplicates by configured session and original message ID, not by delivery attempt. Keep the command ledger when recovering; deleting it removes audit and ownership information. Replay tombstones are deliberately retained. Back up the controller state and messaging database together with SQLite online backup or with the pilot stopped; do not copy a live database alone without its WAL.

The outbound queue records queued, retry, sending, submitted, delivered, read, failed, uncertain and suppressed states. Submission means gateway acceptance, not delivery. Signed ACKs can advance a known remote message ID. HTTP 429 retries use bounded exponential backoff, five attempts. Other ambiguous HTTP/network failures and interrupted sends become uncertain and require dashboard retry with explicit duplicate-risk acknowledgement. Retries are ordered per sender; uncertain/failed messages are visible but do not indefinitely block a terminal report. Terminal results suppress unsent obsolete progress. Revocation suppresses queued messages; an already in-flight request may still arrive. Exactly-once WhatsApp delivery is not claimed.

Runtime ledger events drive lifecycle summaries; reconciliation recovers watches after restart. Context occupancy is separately labelled unavailable when no run-scoped measurement is available. Lifetime token totals require complete measured invocation rows; truncated or missing metrics are unavailable. API costs require explicit API_METERED attribution, currency and reported/estimated evidence. Subscription quota is not converted into API cost. Reports link to the selected dashboard run and permitted evidence instead of forwarding raw transcripts, arbitrary errors or model text.

Accepted `run <saved-template>` and Social & Voice `start <template>` commands create a redacted `agent-control.request-origin/v1` record. The exact accepted command or confirmed voice transcription survives into the Run/Work Parcel and complete transcript together with the channel, authentication classification, template grant and SHA-256 identity/message references. The sender JID, configured phone, session credential and raw webhook payload do not cross that boundary. Idempotent replay must reproduce the same origin record; a conflicting actor, prompt or origin for the same request key fails closed.

## Private installation

Use Node 24 (tested), a clean Agent Control feature worktree, an isolated state directory, and separate unused loopback ports. Install the pinned gateway source, apply the patch, then `npm ci` and `npm run build`. Default upstream Docker composition mounts a Docker socket proxy and includes infrastructure management; it is not used. Disable Redis/queue/cache and all built-in services for this single-session SQLite pilot. The selected gateway patch binds `127.0.0.1` even when upstream environment examples suggest BIND_HOST.

Create a private gateway environment file with a new API master key, SQLite/session paths, `ENGINE_TYPE=whatsapp-web.js`, `AUTO_START_SESSIONS=false`, private port, and an existing Chromium executable. Permit only the controller loopback host via `SSRF_ALLOWED_HOSTS=127.0.0.1`; retain SSRF protection. Do not log or commit the environment, session, database, QR or keys. Run without Docker daemon access; use a service boundary to hide its socket when available. Bound memory and CPU for the pilot. Do not reuse another WhatsApp session.

Create one new gateway session and a session-scoped operator API key. Register its signed webhook at `/api/integrations/openwa/webhook` for `message.received`, `message.ack`, and `message.failed`. Configure the adapter using the schema in `openwa.ts`:

```json
{
  "gatewayUrl": "http://127.0.0.1:19190/api",
  "sessionId": "00000000-0000-4000-8000-000000000001",
  "expectedPhone": "EXAMPLE_PHONE_NUMBER",
  "accountLabel": "Dedicated pilot account",
  "dashboardUrl": "http://localhost:19191",
  "apiKeyEnv": "OPENWA_PILOT_API_KEY",
  "webhookSecretEnv": "OPENWA_PILOT_WEBHOOK_SECRET",
  "templates": [],
  "progressSeconds": 60
}
```

These are illustrative values, not the operator's account. Configure the supplied dedicated number privately. Set `AGENT_CONTROL_WEB_OPERATOR_TOKEN` and `AGENT_CONTROL_OPENWA_CONFIG`; secret environment values require at least 16 and 32 characters respectively. Open `/openwa.html` through an SSH tunnel; its API, QR and enrolment details require dashboard bearer authentication and mutations enforce the dashboard origin policy. The gateway management port need not be forwarded.

## Initial template selection

`test-execution` can bind `repository-tests` with a fixed approved `repositoryPath` and `suite` of `typecheck` or `messaging`. The action runs fixed argv using OwnedProcessManager, not a shell or chat-provided executable, with a scrubbed environment and runtime timeout. `liveness` can bind the existing `dashboard-running-state-qualification` job with bounded duration values for cancellation and completion checks.

Repository review binds an enabled saved repository-code-review job with a pinned definition. Configure its repository, qualified provider, routing and budgets in the authenticated dashboard first, then run `npx tsx scripts/configure-messaging-templates.ts --saved-review=<saved-job-id>` with the private controller environment. This adds a hash of the exported saved configuration and exact definition; chat arguments are prohibited. Restart the adapter and separately grant repository-review to an enrolled operator. Any saved policy change requires reapproval. The isolated pilot has no review provider credentials, so review is not advertised as live-ready. The existing FreeToken benchmark action explicitly fails its readiness gate; it must not be approved merely because it exists in the catalogue. Saved-review notifications reuse the durable execution-history projection, distinguishing HANDOFF_REQUESTED, HANDOFF_RECOMMENDED, HANDOFF_FAILED and successful HANDOFF_COMPLETED. They never infer a handoff from text or latency. Live model handoff remains unqualified.

## Phone and live qualification

After automated gates pass, start only the new gateway session. In the dedicated phone account use WhatsApp → Linked devices → Link a device, then scan the private dashboard QR. Check the linked phone matches the configured account. From the separate human account send the dashboard's challenge in a direct chat; confirm the observed JID and template grants in the dashboard. Groups remain denied.

In that enrolled test conversation only: request help, run `liveness`, verify the same run ID in the dashboard, request status, cancel it and wait for confirmed cleanup; complete another bounded job and request its report. Restart only the isolated gateway and repeat an original delivery to prove no duplicate run. Record a short video and chronological transcript without QR or keys. None of these phone actions or a physical recording is substituted by fixture tests.

On reconnect, keep the session credentials private; start/reconnect the same session and verify its number before commands resume. Disable via the dashboard to suspend the adapter without stopping running jobs. Stop only the named pilot services when dismantling it. Never restart existing Agent Control, LocalWalks or model services for this integration.

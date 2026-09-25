# OpenWA live qualification — 5 September 2026

Verdict: **core WhatsApp job control passed; overall pilot remains PARTIAL**. Account linking and authenticated separate-human enrolment are complete. Actual WhatsApp help, a bounded repository typecheck, running/completion reports, short-number status, and cancellation with verified process cleanup passed. No model handoff or handset-screen recording is claimed.

## Verified execution

| User job | Runtime ID | Actual result |
| --- | --- | --- |
| 1 | `run-aafc8f6d-2367-4ed3-9219-a98f49913b88` | Typecheck SUCCEEDED in 13 seconds; one artifact and tests-passed verification; reports delivered. |
| 2 | `run-7a4c0e77-29bc-4505-8337-549324b62815` | 60-second liveness SUCCEEDED before the user could cancel; this exposed an unusable command workflow. |
| 3 | `run-0f209552-8fe4-4edd-ba8d-52365a2bd828` | `run liveness`, then `cancel job 3`; CANCELLED after 21 seconds; owned PID termination confirmed, no resource locks; terminal report delivered. |

The UX now uses persistent operator-scoped job numbers. No UUID or JSON is required for ordinary pilot commands. The private liveness default is 180 seconds, within the existing approved manifest limit. `status job 1` was received at 17:48:51 UTC and its SUCCEEDED reply was delivered at 17:48:57 UTC.

## Recovery and controlled fixtures

At approximately 17:50 UTC the real gateway session was stopped and started without logout or re-enrolment. The controller start request returned HTTP 409 while the gateway continued initializing; subsequent health returned connected_verified with the same actual account and operator grants. This transient response is a remaining UX limitation, not a failed re-link or proof of instantaneous recovery.

A signed controlled reconstruction of Job 1's original WhatsApp message identity returned duplicate:true and the original run ID. Runtime count stayed 5 (including two earlier HTTP jobs), and no new outbox row was created. This is a controlled HTTP replay after real reconnect, not a second handset message or a replay of retained original wire bytes.

A signed un-enrolled fixture was rejected with sender_not_enrolled; an invalid signature received HTTP 403. Neither created a job or sent a message to the fixture. These are controlled HTTP fixtures, separate from actual WhatsApp delivery.

## Evidence and display provenance

Private evidence directory: `[private qualification path]`.

The video records Xvfb display :101, 1800x1000, combining separately captured actual authenticated dashboard frames with actual stored messages from the enrolled WhatsApp conversation. The on-screen label identifies the gateway-history view and separate captures. It is **not a recording of the phone or WhatsApp application's screen**. The raw MKV is retained; the 179-second MP4 selects chronological intervals 110–155, 918–995 and 1260–1317 seconds, omitting waiting periods. No simulated messages appear in that video. Controlled fixtures are separate JSON evidence.

QR/session secrets were excluded. Earlier phone linking used a separately opened primary-desktop Chrome window, announced for scanning, without screenshots or recording. Automated evidence used the dedicated virtual display; no primary-display capture fallback occurred.

## Checks and preserved checkpoint

- Original full gate at `30be50ac16c2d96471a724913b4136954633c897`: 846 tests passed, plus typecheck, dashboard/bootstrap syntax, neutrality and status gates.
- Live fixes at `daa005154e8cd652d0bb72f178a57bbd6db1fa0d`: 43 focused adapter/parameterized-job tests passed; typecheck, dashboard syntax and neutrality passed. Fixes cover the upstream chatId send contract, capitalized Help and persistent short job numbers. The original full gate was not unnecessarily repeated.
- Pinned OpenWA 0.23.4, commit `1bfebfe57232bcb20ddd0975560d3f4bc994fb36`: preserved successful build and 125 relevant tests. Retained patch SHA256 `58bb902ec162a5df02b69b6354a110af27c05a429fab76acb44db4012b7b4500`.
- Earlier isolated HTTP runs and evidence remain preserved. They are not relabelled as WhatsApp execution.

## Remaining limitations

No suitable configured saved review job/provider exists in the pilot, so repository review and real model handoff remain unqualified. Benchmark execution remains gated by its existing readiness stub. Context/token/cost data are unavailable for these non-model jobs.

The private Windows dashboard connection works through authorized SSH command access on port 2222; anonymous API access is denied and authenticated access succeeds. SSH TCP forwarding remains administratively prohibited. The helper uses a loopback-only command relay and does not change SSH policy. WhatsApp localhost dashboard links work on the connected Windows device, but are not handset-accessible URLs. No public endpoint or Tailscale Serve configuration was introduced.

One original failed send remains marked uncertain and was not automatically retried. Later sends use the verified upstream chatId contract and received delivery acknowledgements. Progress evidence includes actual queued/running lifecycle notifications; the separately queued periodic progress message for Job 2 was correctly suppressed after completion.

Only the isolated pilot was changed. Protected listeners 8080/8081 and the canonical checkout were preserved. PR #9 remains draft. No merge, tag, release or production deployment occurred.

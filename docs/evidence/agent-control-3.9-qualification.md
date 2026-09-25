# Agent Control 3.9 cross-platform candidate qualification

Date: 2026-09-05

Branch: `feature/3.9-resilient-execution`

Released baseline: `v3.8.2` / `b51623dae1b764a31198424e8fc6ea9076d04089`

Product checkpoint used as base: `d3d0376db6e00bed76deb8c5336fa49cdfc1554a`

Pull request: [#6](https://github.com/lozknowles/agent-control/pull/6)

## Scope and provenance

This candidate implements the independently reviewed behavioral findings catalogued in the [evidence-gap matrix](agent-control-3.9-evidence-gap-matrix.md): durable reconnect identity, actionable recovery classes, verified process cleanup, truthful live state, Android wireless-ADB lifecycle reliability, provenance-bearing resource fallbacks, and a conservative stable/volatile prompt boundary. No reviewed third-party source was copied. Generic policy remains in Agent Control core; Linux, Windows, Android, Codex and Responses mechanisms remain behind adapters.

No merge, tag, publication or deployment occurred. Physical work used isolated state/listener/work directories and bounded node transports. The Pixel pairing ceremony changed only its existing local Android Wireless Debugging authorization. Credential values and the locally entered pairing PIN were never placed in arguments, logs, evidence or controller state.

## Release gate summary

| Gate | Result | Physical basis |
| --- | --- | --- |
| Dashboard, concurrency and Linux cleanup | PASS | Concurrent owned/queued Runs, live Codex accounting, browser reload/SSE reconstruction, cancellation and confirmed Linux process-group cleanup. |
| Windows cleanup | PASS | Actual MSI `WindowsTerminationAdapter` and production `JobRuntime`; cancellation, timeout, identity mismatch and cleanup uncertainty. |
| Focused recovery | PASS | Separate execution authority, actual controller `SIGKILL`/restart, same-route auth recovery, retry exhaustion and cancellation during backoff. |
| Android local ADB | PASS | Local hidden-stdin pairing, intended-device verification, capability withdrawal, same/changed endpoint reconnect, governed typed Jobs and fresh-process session resume. |
| Cache quality investigation | PASS_WITH_LIMITATIONS | Matched known-answer arms each passed 2/2 independent checks and scored 6/6; candidate token/time totals were worse, so no savings claim. |
| Optional Responses cache controls | DEFERRED | Capability-gated and disabled for the tested Codex CLI route; no physical provider qualification is claimed. |
| Provider-neutral context/capability intelligence | PASS_WITH_LIMITATIONS | Existing two-route, 204-attempt, dashboard-recorded qualification remains accepted with explicit browser/computer/context/cost limitations. |
| Full project validation and clean install | PENDING FINAL RECONCILIATION | Re-run after the final documentation/status update; exact result replaces this row before push. |

## Evidence-to-source map

| Evidence | Tested source | Later-change assessment |
| --- | --- | --- |
| Dashboard/concurrency/Linux cleanup | accepted checkpoint `6cc05fc0a74cd0e1828b326c6b1c5effab0bb605` | Later changes leave the Linux process-group implementation unchanged; the only later `JobRuntime` delta preserves its default owned-execution factory. |
| Windows cleanup | `24cb53a2bca42261c48e47a6b8e79f46ea574bfe` | Later source changes are confined to parameterised recovery and Android paths; Windows cleanup implementation is unchanged. |
| Recovery | `05e0335a689d8c14c83cba5add0fc5b91fc51546` | Later source changes do not modify recovery, parameterised-engine or accounting behavior exercised by this run. |
| Matched cache quality | `9d5cbb13c1139ebe846f1afb131e53f40081843a` | Later source changes do not modify prompt construction, provider normalization, scorer or cache qualification command. |
| Android local ADB | `67b6f2797c8d8f5b8173bc7c821e311add98e02f` | This is the complete Android physical-fix checkpoint before documentation reconciliation. |
| Provider-neutral context/capability run | `861b40a8663c4c57c2ed11925d11f593f48d189b` | Subsequent changes are execution-resilience/platform adapters and do not invalidate the frozen model attempts or Work Parcel assertions. |

## Windows physical qualification

Evidence root: `/opt/qualification/agent-control-3.9-windows-20260905/`

- sanitized JSON SHA-256: `cddd63f54fe067cf6deacd3bea103b5c7762497b116e47caa1ed0a2d5e33ed14`;
- H.264 dashboard recording SHA-256: `129232530dd4d12507dd5bed51bea77eb7e6530746a4de536fbab4f32a5885b5`;
- recording manifest SHA-256: `efcd47c6f94a7a523a7e7915f5d560372b7ad8a1a060b4f7516f5f636707b275`.

The MSI ran Windows 10.0.26200, x64, Node 24.19.0. Qualification used the actual `WindowsTerminationAdapter` and production `JobRuntime`.

- Operator cancellation Run `run-e8d71cd4-438a-4d2f-85bd-3e59505c5fb4` terminated the owned root, child and grandchild. An unrelated control process survived. The worker and lock remained held until native cleanup was confirmed, then the Run became `CANCELLED`.
- Timeout Run `run-dc3abc11-9efc-40ad-8e85-e87fc650be53` terminated the same tree shape and became `FAILED` / `TIMED_OUT` only after confirmation.
- Run `run-2f32cdb3-4b26-4845-a823-8b59431e34df` injected loss of an already obtained native confirmation at the adapter-result boundary. It truthfully remained `CLEANUP_UNCERTAIN` with worker and lock protection retained.
- A captured PID-start-identity mismatch sent zero signals. Dashboard reload during cancellation rebuilt the durable state.

## Focused recovery qualification

Evidence root: `/opt/qualification/agent-control-3.9-recovery-20260905-06/`

- sanitized JSON SHA-256: `713f9ac18f9ac65ee7bbd873824b115396e9155385cd8d6cdef7be1340126c8b`;
- H.264 dashboard recording SHA-256: `c99e84967b2029b0b4c41cc667809dbab20030c561e9d3515b20a2d252fee45d`;
- recording manifest SHA-256: `6a2a22b5a5b1c7856fc8241f189b394e9335bdb51658c952bc456666f65ee33a`.

The Linux x64 controller ran Node 24.20.0 and used its configured SSH port 2222. A real separate authority process retained execution while the controller received `SIGKILL` and restarted.

- Transport-loss Run `1df56206-1868-42cb-8651-81471801c3fe` preserved execution ID `repository-review:1df56206-1868-42cb-8651-81471801c3fe:1`, invoked execute once, reconciled twice and emitted one terminal transition. Provider usage of 120 input + 20 output = 140 tokens and USD 0.002 was counted once.
- Authentication Run `e7583e6c-58ac-4c2f-b6cf-feea7a7c6916` entered `AUTHENTICATION_BLOCKED`, accepted an explicit newer qualification record, resumed the same provider/account/model/node route and succeeded on attempt two.
- Retry Run `eb537a1e-cad2-48df-8aa7-7227c2916825` made exactly three bounded attempts and failed once its configured budget was exhausted.
- Cancellation Run `3348b9e6-9686-418c-817b-13125e6bf982` was cancelled through the dashboard during backoff. It remained `DISCONNECTED` while cleanup was unproven, reconciled the exact execution to `CANCELLED`, and emitted one terminal transition from one invocation.

The accepted `-06` directory supersedes preserved exploratory attempts ending in the base name and `-02` through `-05`.

## Android wireless-ADB physical qualification

Evidence root: `/opt/qualification/agent-control-3.9-android-20260905-05/`

- sanitized JSON SHA-256: `3be6897706e1e01f1649d6a31026eecd0369a7dc15cae4d3ca2841f03a46ecf6`;
- H.264 1920×1080 dashboard recording SHA-256: `599776387ca486ab3d7ffff39036e144d834384e2071c299d70fba37a4378ba2`;
- recording manifest SHA-256: `fc035429dfaeb39ecaea8a3aac64ad76b965d5bc8ed3ba8c84825d75dab68d6b`.

Topology was the Linux controller on its configured SSH port 2222 and the Android Termux resource on its configured SSH port 8022. The device ran Android 17 with ADB 1.0.41 / android-tools 35.0.2. The packaged ADB server rejected its host mDNS service command, so the helper selected bounded direct DNS-SD with an ordinary multicast query (`QU=false`); no address or port was manually supplied.

The System Settings pairing dialog remained open and the PIN was entered only at the helper's hidden local TTY prompt. The intended Google Pixel 8 Pro (`husky`) was then verified with fixed target state/property calls and `adb devices`; the raw serial appears only as SHA-256.

- The accepted run began `paired-disconnected`, with usable/verified false and both current and legacy `android.adb.local` / `transport.adb` withheld.
- Status Run `run-77538c63-ab41-4463-a5d6-82566e19dd19` passed only after the intended target was connected and verified.
- Deliberate disconnect withdrew both capabilities. The dashboard reloaded while they were absent and remained `LIVE`.
- Reconnect Run `run-7ff15709-eec6-4fca-979d-0fc803245b56` restored the same endpoint; `run-d3fd2c2c-7d29-49fe-b979-ee44c396ceaf` proved idempotence.
- Toggling Android Wireless Debugging changed the port from 42053 to 42673. Run `run-1ac6ef20-b54f-4ad3-b87b-67062a9d9b86` rediscovered it while retaining the stable normalized service identity and target serial hash.
- Fresh Node-process resume loaded session `android-adb-session-307a8dc3-2099-474f-a927-f42e09ed1793`, sequence 2, and verified the same target.
- Four production `JobRuntime`/`NodeClient` operations passed exact declared sanitized artifact type/schema/version checks. No arbitrary shell API was exposed.

Physical unavailable-connectivity behavior is covered by the pre-connection state and deliberate disconnect. Wrong-PIN behavior remains deterministic rather than deliberately consuming another live PIN; the physical gate does not infer success from authorization or executable presence.

Superseded attempts remain intact:

- `-01`: optional Work Parcel projection prevented Systems rendering;
- `-02`: stopped before pairing after discovering incorrect full-service-name correlation;
- `-03`: pairing succeeded but the governed Job correctly rejected an undeclared sanitized artifact;
- `-04`: transient reconnect had no retry budget;
- `-05`: accepted after each defect was fixed and regressed.

## Cache quality investigation

Accepted report: `/opt/qualification/agent-control-3.9-cache-quality-20260905-02/cache-quality-matched.json`

SHA-256: `3cabc9d16fb789fab3634e2dcdd72d450e6471c08b4787636eec0ff17a5d77b6`

The known-answer fixture requires both provider/model completion and verifier success in `benchmarks/cache-quality-fixture/src/complete-run.js`. Model, account, repository snapshot, schema, task and deterministic independent scorer were held constant; cache initial state remained provider-managed and unknown.

| Arm | Runs | Independent passes | Score | Input (fresh + cached) | Output | Total | Elapsed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| v3.8.2-shaped baseline | 2 | 2/2 | 6/6 | 13,981 (8,093 + 5,888) | 740 | 14,721 | 19,870 ms |
| 3.9 candidate boundary | 2 | 2/2 | 6/6 | 51,065 (24,185 + 26,880) | 1,049 | 52,114 | 34,131 ms |

All responses were schema-valid. The provider's own review verdict was `FAILED` for all four calls and was deliberately not reused as the independent quality score. This resolves the earlier nonequivalent-outcome ambiguity: no independent quality regression was observed, but candidate token and time totals were materially worse. Cache writes, authoritative current context, billed cost and initial cache state were unavailable. No saving or causal cache benefit is claimed.

The first matched report directory without `-02` is retained but superseded because its scorer accidentally reused the provider self-verdict. The older eight-call report under `/opt/qualification/agent-control-3.9-cache-20260905/` remains historical evidence only.

## Existing accepted evidence

The earlier provider-neutral physical report remains at [agent-control-3.9-provider-neutral-qualification.md](agent-control-3.9-provider-neutral-qualification.md). Its JSON, video and manifest SHA-256 values are respectively `2bfc26e6ddd8d619ceada263860769f330ca5625ee40eb2d6f61f9fd33b4a678`, `8828d3fe28e741f0694998629270d96498cd329177fe4f0824216f4d0fcdaaaa`, and `91a1084d9477d0a3a963a2dbddd4bc851666950849447c325f234f575310b86f`. It covers two live Qwen routes, 204 immutable attempts, context recovery, questions/DAG behavior, capability-first routing and a `LIVE` dashboard. Browser/computer evaluators, authoritative current context and cost remain explicitly unavailable.

The existing dashboard/concurrency/Linux evidence root is `/opt/qualification/agent-control-3.9-resilient-execution/dashboard/`; its H.264 recording SHA-256 is `c16a050c1d7985def11f1ae1df3e6d0e4723947595dfceb1a154e1dc2934cb0f`.

## Security boundary

- No credential value, OAuth material, email address, PIN, raw provider body, Windows profile path, raw ADB serial, endpoint address or raw PowerShell/SSH stream is retained in accepted evidence.
- Process start identities are represented by hashes while cleanup outcome, timestamps and signals remain auditable.
- Android pairing input stayed local and hidden; dashboard video did not show the Termux prompt.
- Cache scope and prompt content are represented by one-way hashes; missing usage/cost fields remain unavailable rather than zero.

## Qualification-discovered fixes

The physical sequence found and regressed real defects rather than weakening gates: Windows result-observer injection for uncertainty proof; parameterised recovery resumption and cancellation intent; full dashboard projection initialization; direct Android DNS-SD fallback; fixed-command intended-target verification; stable service-prefix correlation; declared sanitized artifact contracts; one bounded reconnect retry; and waiting for durable Job terminal state. Every failed/superseded physical attempt remains preserved outside the repository.

## Final validation and package gate

The post-physical-fix candidate passed:

```text
npm run check
  PASS: TypeScript; bootstrap/Android shell syntax; dashboard JavaScript;
        3/3 neutrality checks; 45 implementation-status entries;
        829/829 tests, 0 failed, 0 skipped, 0 cancelled

tracked Markdown link check
  PASS: 610 local links across 127 tracked Markdown files

npm pack --dry-run --json
  PASS: agent-control@3.9.0, 663 files

clean-prefix npm install --ignore-scripts <tarball>
  PASS: 12 packages added; installed CLI reports agent-control 3.9.0

git diff --check and JSON parse checks
  PASS
```

The final tarball hash and exact packed/unpacked byte counts are generated after the documentation commit and recorded in PR #6/final handoff, avoiding a self-referential package hash inside the package itself.

## Candidate disposition

**READY FOR FULL CROSS-PLATFORM RELEASE APPROVAL**

All mandatory Windows, Android and representative recovery physical gates pass. Cache outcome quality is reconciled without an economic claim, and optional explicit Responses cache controls remain safely disabled rather than blocking the cross-platform release. The candidate is ready for review and separate release approval.

This task does not authorize merge, tag, publication or deployment. Those actions remain subject to separate release approval even if all candidate gates pass.

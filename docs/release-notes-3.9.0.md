# Agent Control 3.9.0 release-candidate notes

Agent Control 3.9.0 is the resilient-execution, persistent-context and capability-intelligence candidate. It carries forward the 3.8.2 cached-input correction, survives transport loss/controller restart/cancellation without inventing terminal state, and adds provider-neutral mechanisms for long-running Work Parcel context, asynchronous DAG execution and evidence-based model routing.

## Included

- exact durable execution identity and same-route reconciliation for normal and parameterised Jobs;
- actionable authentication/reconnect/retry states with bounded deadline and budget;
- owned process execution and verified Linux process-group / Windows process-tree cleanup adapters;
- two-phase cancellation/timeout and explicit cleanup uncertainty;
- complete dashboard/SSE reconstruction with real reasons, deadlines, freshness and cleanup evidence;
- provenance-aware `/proc`, Node `os` and Android sysfs resource measurements;
- a bounded same-device Android wireless-ADB discovery/pair/reconnect helper with stdin-only PIN handling and capability publication only after verification;
- provider-neutral stable/volatile prompt blocks, capability-gated Responses cache controls, cache-write telemetry/pricing and controlled baseline/candidate measurement;
- layered Work Parcel context: immutable original goal, concise active state, SHA-linked events, governed retrieval and bounded baton views;
- first-class evidence criteria, append-only steering and stable non-blocking questions over concurrent dependency graphs;
- normalized provider/runtime capabilities with native versus Agent Control-emulated and verified versus advertised distinctions;
- capabilities-first route eligibility followed by observed quality, reliability, latency, cost, token/cache efficiency, account/node/locality and privacy policy;
- a content-hashed 17-task/three-repetition frozen suite, append-only model attempt history, rolling trends, task economics, conservative lifecycle transitions and regression warnings;
- dashboard leader/capability/history/review-queue/safety/context controls backed by the same durable stores and live SSE;
- an independent runtime safety supervisor with explicit allow/audit/approval/deny/pause/escalate outcomes;
- deterministic regression coverage and updated operator/architecture/migration documentation.

## Physical evidence

A real isolated dashboard run exercised two concurrent lanes: one owned process remained live while a second same-Job Run waited under queue concurrency, a real Codex repository review completed with fresh/cached token accounting, the MSI browser reloaded mid-run and reconstructed the same state through HTTP/SSE, and operator cancellation reached `CANCELLED` only after confirmed Linux process-group cleanup. The recording and sanitized JSON projections are content-addressed in the [qualification report](evidence/agent-control-3.9-qualification.md).

On the MSI Windows 10 execution node, the production `JobRuntime` and actual `WindowsTerminationAdapter` physically cancelled and timed out owned root/child/grandchild trees while an unrelated process survived. A PID-identity mismatch emitted no signal, and injected loss of the already obtained native cleanup confirmation deliberately retained `CLEANUP_UNCERTAIN`, worker ownership and the lock. The dashboard recording includes cancellation and reload against the durable state.

A separate Linux recovery run used an actual controller `SIGKILL`/restart and a separate execution-authority process. Agent Control preserved the exact execution ID, reconciled twice without a second invocation, recorded 140 provider tokens and USD 0.002 once, and emitted one terminal transition. The same production path also passed same-route authentication recovery, three-attempt retry exhaustion, and operator cancellation during retry backoff while dashboard reload retained the real reason, deadline and route.

The Pixel emitted a current two-sample sysfs cpuidle-derived busy value with source/authority/limitations intact. The local wireless-ADB gate then passed on Android 17 / Termux / ADB 35.0.2: protected local-stdin pairing, fixed-command intended-device verification, capability withdrawal after deliberate disconnect, idempotent same-endpoint reconnect, changed-endpoint rediscovery after Wireless Debugging was toggled, four governed typed Jobs, and fresh-process persisted-session resume. The Termux ADB host's native mDNS service was unsupported, so the helper used its bounded ordinary-query DNS-SD fallback without endpoint entry or QU-bit experimentation. Pairing and connect advertisements were correlated by their stable AOSP `adb-<device-guid>` prefix despite independent suffixes.

The matched real Codex cache comparison used one known-answer repository defect and identical independent scoring for two runs per arm. Both baseline and candidate passed 2/2 independent checks and scored 6/6; all four responses were schema-valid. Baseline used 14,721 total tokens in 19,870 ms, while candidate used 52,114 in 34,131 ms. The available CLI uses provider-managed automatic caching and does not expose explicit Responses cache controls, cache writes, authoritative current context or billed cost. The candidate therefore claims truthful structure/accounting and no quality regression—not a repeatable token, latency or economic saving.

A separate clean physical run exercised the provider-neutral additions against two live llama.cpp/Qwen2.5 3B routes. Context recovery retained 103,526 bytes of historical events while handing the later stage a 4,941-byte baton; exact retrieval found the excluded failed approach and beta completed with alpha attempted once. A three-stage Parcel showed the left branch succeed while the question-dependent right branch waited and the join remained queued; after answer, all three passed their explicit criterion.

The frozen suite ran 17 tasks × 3 repetitions × 2 candidates twice: 204 immutable attempts persisted and reloaded. The instruct route recorded 36/48 measured passes and 8,976 total tokens; the coder route recorded 38/60 and 15,125 tokens. Unsupported workflow/browser/computer evaluator classes remained explicit unavailable. The `code.modify` route correctly excluded the instruct model and selected the coder from verified native evidence. The `LIVE` 1920×1080 dashboard recording and JSON are content-addressed in the [provider-neutral qualification report](evidence/agent-control-3.9-provider-neutral-qualification.md).

## Compatibility and defaults

- Existing 3.8.2 configuration and historical records remain readable; new runtime fields are additive.
- No Job, Schedule, Spark route, provider, remote listener, Android pairing flow or deployment is enabled by upgrade.
- Existing retry values continue to work. New multiplier/deadline settings are optional.
- Prompt-cache controls are disabled unless both provider and exact model carry a qualified capability.
- Missing resource or provider telemetry remains null/unknown.
- Authentication/credential residency and account routing are unchanged.

## Candidate limitations

- Android local ADB is physically qualified for the recorded Android 17 / Termux / ADB 35.0.2 environment, not universally for every Android or ADB build; first pairing remains an explicit local ceremony.
- Linux and Windows owned-process cleanup are physically qualified. Unsupported process substrates still retain explicit cleanup uncertainty rather than a false pass.
- Representative recovery is physically qualified with a controlled separate authority and injected provider outcomes. Provider/runtime combinations without authoritative reattachment continue to fail closed and need their own qualification.
- Cache measurement shows matched outcome quality but worse candidate token/time totals and does not prove stable token, latency or monetary savings.
- Explicit Responses cache controls remain disabled until the exact provider/model route is physically qualified; the tested Codex CLI only exposed observational automatic cache reads.
- The two local candidates do not have governed browser/computer evaluators; those frozen tasks remain capability-unavailable.
- Current-context occupancy is estimated from each local one-shot request, while lifetime token usage remains provider-reported and separate.
- No local energy meter/tariff was configured, so monetary cost and cost per success remain unavailable.
- Same-day evidence is intentionally insufficient for automatic `PREFERRED` promotion or fabricated leaderboard winners.
- This branch is for review. It is not merged, tagged, published or deployed by the candidate preparation task.

## Upgrade and reproduction

Follow [`migration-3.9.md`](migration-3.9.md). The core gate is:

```bash
npm install --no-package-lock --ignore-scripts
npm run check
npm pack --dry-run
```

Focused Android and cache commands are:

```bash
npm run test:android-adb
npm run qualify:provider-cache -- --output=/absolute/evidence.json --repository=/absolute/repository --files=src/example-a.ts,src/example-b.ts
```

The opt-in provider-neutral runner and recording are:

```bash
AGENT_CONTROL_QUALIFICATION_CANDIDATES_JSON='[...]' npm run qualify:provider-neutral -- --state-dir /absolute/private/state --evidence-file /absolute/evidence.json --host 127.0.0.1 --port 4390 --hold-ms 10000
AGENT_CONTROL_QUALIFICATION_CANDIDATES_JSON='[...]' AGENT_CONTROL_CHROMIUM=/absolute/path/to/chromium AGENT_CONTROL_QUALIFICATION_OPERATOR_TOKEN='qualification-only-token' npm run record:provider-neutral
```

External-provider qualification is opt-in and requires an already qualified indirect credential reference. It never runs as part of `npm run check`.

## Review boundary

The final candidate gate results, package metadata and clean-install result are recorded in the consolidated [qualification report](evidence/agent-control-3.9-qualification.md) after all physical fixes. Exact Windows, recovery, Android and cache evidence hashes are preserved there alongside the earlier provider-neutral evidence. The release reviewer must still authorise merge and tag separately. Current evidence does not qualify browser/computer model capability, automatic model promotion, universal provider reattachment or any cache-saving claim.

## Live qualification update — 5 September 2026

The enrolled human's actual voice request and subsequent text confirmation created AC-3, which completed a governed typecheck and returned text plus an Ogg/Opus voice note. After a noisy numeric summary was diagnosed before transport, one-sentence summaries with spelled-out job numbers were confirmed clear on the handset. Speech now plays at 0.9 speed; detailed output stays in text/dashboard. The full gate passed 871 tests. Speech outage retained text and did not stop a real runtime job; cancellation confirmed process cleanup. See docs/social-voice/qualification.md for physical evidence and limitations. This supersedes earlier voice-pending statements. Repository review, model handoff, multi-lane video, general speech quality and production readiness remain unqualified.

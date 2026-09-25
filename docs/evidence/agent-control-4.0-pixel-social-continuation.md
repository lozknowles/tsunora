# Agent Control 4.0 Pixel social release-gate continuation

Status: **PASS — AGENT CONTROL 4.0 RELEASE QUALIFICATION COMPLETE**

This addendum closes the sole physical dependency left open by the full 4.0 qualification. It does not replace or rewrite the original `PARTIAL` history in [the full qualification](../provenance/EXTERNAL-EVIDENCE.md).

## Continuation provenance

- original RC SHA tested: `a08ccac5ced3cd399755bd084ff30fe224ab7860`
- branch: `integration/4.0-governed-adaptive-crew`
- original verdict: `PARTIAL — RELEASE-CANDIDATE PHYSICAL SOCIAL RERUN BLOCKED BY OFFLINE PIXEL`
- original blocker: Pixel absent from Tailscale and Termux SSH port 8022 unreachable
- Pixel availability established: 2026-09-08; reconfirmed during the accepted run from `2026-09-08T05:22:06.466Z`
- product implementation changed during continuation: no
- qualification tooling changes: bounded WhatsApp wake/delivery wait, terminal social-result polling, sanitized root-parcel idempotency reconciliation, and an atomic final dashboard visibility check
- formal release actions: none; no merge, tag, GitHub Release or deployment

The previously authoritative 1,014/1,014 regression result remains attached to the same product implementation. Only qualification tooling and evidence changed.

## Physical device and ingress

The configured Pixel 8 Pro reappeared in Tailscale. Tailscale ping completed in approximately 53 ms, TCP port 8022 accepted a connection, and strict-host-key batch SSH succeeded with the existing enrolled identity. The existing local ADB helper reported ADB 1.0.41, `direct-mdns`, a connected and qualified Pixel 8 Pro, and Android 17. No re-enrolment or configuration replacement occurred.

The final accepted run used the existing OpenWA session and active enrolled operator. The physical Pixel sent exactly:

> start governed-adaptive-crew

The command was received at `2026-09-08T05:22:31.000Z` with authentication `enrolled-direct-sender` and authority `template:governed-adaptive-crew`. Only hashed message and identity references are retained:

- message reference: `640332396d86e2b535ad185f2bc4089995d220926655a4bee3eb097cd8cbbd2f`
- identity reference: `d59c1d40c76215cfef095e32d0d5c11f1ed7827cc60246e57a00cf1081948abf`

The actual path was Pixel → WhatsApp → OpenWA → enrolled operator validation → `SocialVoiceCoordinator` → `AgentControlService` → `WorkParcelCoordinator` → normal Job and provider runtimes. No webhook replay, internal API submission, emulator or direct Run injection was used.

## Work and adaptive orchestration

- parent Work Parcel: `parcel-social-640332396d86e2b535ad185f2bc4089995d220926655a4bee3eb097cd8cbbd2f` — `SUCCEEDED`
- parent Runs: `run-c208ed6b-ec2f-44c3-9f68-3776efa96611`, `run-952411d0-672a-45bb-a285-8219493763fc`, `run-60ce2aec-4af3-47c2-a5aa-1d3636f10be5`, `run-80f4f836-fc1d-4b93-a43b-995f0d4c309c`
- repository-review Run: `f0db7dea-d0ed-4268-81a9-dfb7d6cd8806` — `SUCCEEDED_WITH_FINDINGS`
- nested review parcel: `parcel-aaa68806-9012-4367-b602-075f8efe6da8`
- parent adaptive decision: `orchestration-de7f007e-ed67-4f27-ad4d-534f527b385c`
- nested adaptive decision: `orchestration-d4f76a13-4773-4365-9854-968dfb0c0346`

The parent decision selected the governed `work-parcel-coordinator` workflow under sparse-evidence policy. The nested decision consulted Model and Workflow League evidence and selected the qualified local Qwen source route. Two independent parent stages ran concurrently. The capability remained `repository-review`; the social template granted no bypass of the normal governor, provider qualification, sealed-baton, contract or independent-verification boundaries.

The read-only fixture's protected `refs/heads/main` remained `2ee7ea70fb1d09407b76cc4d8bd5c8cc5bd2f020` before and after execution.

## Quality governor and handoff

The first route was `local-llama/default/qwen-local-small-reviewer@controller`, backed by `qwen2.5-3b-instruct-q4_k_m.gguf`. It returned schema-valid output, but the independent `reservation-cache-root-cause-v1` gate rejected it because it did not prove the non-atomic check-then-update interleaving or the reversed cache-age subtraction.

The governor recorded:

1. `CONTINUE` — current context unavailable;
2. `BATON_AND_HANDOFF` — quality gate failed and governed fallback selected at 4.3365% estimated context, below pressure thresholds;
3. sealed baton ready for explicit handoff;
4. destination observation;
5. `BATON_AND_HANDOFF` `SUCCEEDED` — original thread recoverable.

- token baton: `token-baton:0f555e37-5d79-4940-82bc-58a4d4353706`
- baton SHA-256: `76b32e624b47ea680697b4fc7c56db72c575e11e77bb3c24c671ce4a42b282a0`
- governed handoff: `handoff:49b43f88-be47-4c6a-af23-6d43191673f5` — `COMPLETED`
- destination: `codex-chatgpt/cottage-plus/codex-luna-controller-a@controller`, provider model `gpt-5.6-luna`, safe label `Controller Account A`

The destination continued from the sealed baton, proved both root causes, passed the same independent gate, and passed final repository validation. The original source thread remained recoverable.

## Accounting and terminal result

The final model chain reconciles without resetting parcel totals:

| Leg | Input | Fresh input | Cached input | Output | Total | Cost |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| local Qwen | 773 | 1 | 772 | 648 | 1,421 | unavailable |
| Codex / Controller Account A / Luna | 8,133 | 8,133 | 0 | 847 | 8,980 | unavailable |
| **Work Parcel** | **8,906** | **8,134** | **772** | **1,495** | **10,401** | **unavailable** |

Provider-reported usage is authoritative. Neither provider exposed authoritative mid-turn context occupancy or monetary cost, and those values remain explicitly unavailable rather than being inferred or coerced to zero.

The social coordinator recorded exactly one inbox row, one social job row and one deterministic root Work Parcel for the initiating message. The two matching lineage parcels are the expected root plus nested repository-review parcel, not duplicate work. No extra replay was manufactured. Existing controlled OpenWA reconnect/replay evidence and the 4.0 restart-repair test remain authoritative for duplicate delivery.

The terminal response was queued once, submitted to the gateway on the first attempt, and then visibly confirmed on the physical Pixel as `AC-1: SUCCEEDED`. The adapter truthfully retains delivery code `gateway_accepted_delivery_unconfirmed`; the separate Pixel UI observation confirms arrival without changing that transport-level authority label.

## Transcript and video

The product-generated transcript has 57 durable entries. It begins with the authoritative OpenWA origin and the exact initiating request before the execution schema, then records provider/model changes, quality failure, baton creation, handoff completion, verification and totals. It is generated during execution and reconstructible after restart.

The continuous Chromium capture is 1920×1080 H.264 at 25 fps, 83.28 seconds, normal speed, and unspliced. It shows the authenticated social Work Parcel, Jobs, Lanes, Models, Systems, Routing, all six animated Crew roles, event-backed WOPR indicators, Qwen difficulty, quality rejection, sealed baton, Codex route, independent verification, final model chain, and full transcript. Console and HTTP error lists are empty; optional unconfigured projections remain separately classified in the manifest.

- [machine evidence](../provenance/EXTERNAL-EVIDENCE.md)
- [complete execution transcript](../provenance/EXTERNAL-EVIDENCE.md)
- [continuous video](../evidence-archive.md)
- [video and screenshot manifest](../provenance/EXTERNAL-EVIDENCE.md)

## Evidence hashes

- machine evidence: `85333167e1dcbdd95f037f0cfc82903d0225e6a818609822b1d86978ded414c9`
- pre-video-attachment qualification payload: `978097c234c61c60055231e0d44dc19f74301657baf92f0f72cef1e059f779d5`
- transcript: `f26ffbbd34f4a6e224baa8ca7d0afc63e8fce3ff01caad33c5c777d60cfac179`
- video: `b057bb76edc908276dee609af37b6f867273e017a18e339d7fac183d16d6bb3e`
- video manifest: `2196c4e11c8e447698a0ec411d9f12c99f54cfcbd189477c6dbe5f922e6a09bd`
- screenshots: 18 content-addressed PNGs listed in the video manifest

The pre-video payload is content-addressed by the video manifest. The final machine evidence then content-addresses that manifest and video. All internal cross-hashes reconcile.

## Continuation attempt history

The first post-recovery execution completed but revealed that qualification polling stopped before terminal social delivery. A later handset delivery arrived after the original 45-second listener window. Two subsequent product executions completed but exposed qualification-only assertions that counted the expected child parcel as a duplicate and measured a dashboard element across a DOM replacement. These attempts either stopped before Work Parcel creation or were rejected as final media evidence. The accepted run above used the same frozen command, objective, product SHA and production lifecycle, with only bounded fail-closed qualification-tool corrections.

## Final release-gate decision

The original full qualification remains authoritative, the sole offline-Pixel dependency is closed on the same product implementation, physical social provenance and idempotency reconcile, adaptive convergence is proven, governance is preserved, the Work Parcel completed and verified, and no other frozen blocker remains.

**RELEASE GATE: PASS**

**READY TO MERGE/TAG/RELEASE: YES**

Release actions still require separate operator approval.

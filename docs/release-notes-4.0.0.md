# Agent Control 4.0.0 release notes

Agent Control 4.0.0 integrates governed adaptive Crew execution, evidence-driven model/workflow leagues, semantic protected-resource governance, Social & Voice/OpenWA provenance and governed Live Shell attachment on the resilient 3.9 control plane.

The release preserves one lifecycle across ingress, execution and audit:

`authenticated channel → canonical Work Parcel → capability/authority-qualified route → Crew/lane execution → token governor → retry or sealed-baton handoff → independent verification → immutable evidence → originating channel`

## Included

- evidence-driven adaptive model and workflow decisions with conservative sparse-evidence behavior;
- explicit retry, quality-gate baton and governed fallback transitions;
- provider/account/model/node route identity and additive Work Parcel token accounting across handoffs;
- immutable source-request provenance and complete human-readable execution transcripts;
- operational Crew roles and event-backed WOPR activity indicators derived from canonical Jobs, Lanes, models, tools, batons, nodes and verification state;
- semantic protected-resource policy enforced before typed Git action execution;
- capability-scoped `WATCH`, `INTERVENE` and `TAKE_CONTROL` Live Shell attachment to real owned sessions, with protected actions forced to `WATCH_ONLY`;
- authenticated OpenWA/Social & Voice intake that converges on the same adaptive Work Parcel path as dashboard/API submission;
- independent verification, source-thread recovery and restart-safe decision repair;
- real-time dashboard/SSE projection of routing, lifecycle, telemetry authority, model chain and verification.

## Accepted qualification

The full deterministic gate passed 1,014/1,014 tests. The physical protected-resource run denied all 11 forbidden protected-ref variants, passed five neighboring allowed operations and proved the protected ref unchanged before and after execution.

The accepted Pixel continuation began with an authenticated physical WhatsApp request and completed the normal production lifecycle. Local Qwen performed the source review, an independent quality gate rejected its incomplete explanation, Agent Control sealed a content-hashed baton, Codex/Controller Account A/Luna continued the work, the same gate passed, repository validation succeeded and the terminal `AC-1: SUCCEEDED` response reached the handset.

The model chain reconciled 1,421 local-Qwen tokens plus 8,980 Codex tokens to 10,401 Work Parcel tokens. Both routes reported token usage authoritatively. Neither exposed authoritative current-context occupancy or monetary cost, so those fields remain unavailable.

The 1920×1080 continuous recording shows the originating Work Parcel, Jobs, Lanes, Models, Systems, Routing decision tree, all six event-backed Crew roles, Live Shell interaction, quality rejection, baton, route change, destination continuation, verification, final model chain and complete product transcript. See the [consolidated qualification](provenance/EXTERNAL-EVIDENCE.md) and [Pixel social continuation](evidence/agent-control-4.0-pixel-social-continuation.md).

## Provenance

- tested product checkpoint: `a08ccac5ced3cd399755bd084ff30fe224ab7860`;
- evidence/tooling checkpoint: `8ad56c031b92454b6364f7b502159e69242921e7`;
- the delta between those checkpoints contains accepted evidence and qualification-tool hardening, not product-runtime changes.

The tag target and release-asset hashes are recorded in the GitHub Release manifest. Historical candidate evidence remains immutable and is not rewritten as release evidence.

## Compatibility and defaults

- Existing 3.9 configuration and additive historical records remain readable.
- Upgrade does not automatically enable Saved Jobs, schedules, adaptive routing, OpenWA, Social & Voice, remote ACP, credentials, NVIDIA routes or deployment.
- Provider/account credentials retain their configured residency and are never release assets.
- Missing current-context, cost, price, quota or rate-limit telemetry remains unavailable rather than being estimated as authoritative or coerced to zero.
- Protected-resource policy and route authority can only narrow across a baton handoff.

## Limitations

- No production deployment is included in this source release.
- OpenWA/Social & Voice remains a private pilot; general speech quality and long-duration soak are not broadly qualified.
- The physical model handoff qualifies the recorded Qwen and Codex routes, not arbitrary providers or models.
- NVIDIA catalogue observations remain partial and every NVIDIA route remains disabled; no catalogue-wide routing admission is claimed.
- Current-context occupancy and monetary cost were unavailable on the accepted physical routes.
- Live Shell capabilities depend on the execution adapter; unsupported control and uncertain cleanup continue to fail closed.

## Upgrade, verification and rollback

Follow [the 4.0 migration guide](migration-4.0.md). In an isolated checkout and state directory:

```bash
npm install --no-package-lock --ignore-scripts
npm run check
npm pack --dry-run
```

Before enabling local integrations, run a disposable Work Parcel and reconcile Jobs, Lanes, Models, Routing, Systems, Crew, Sessions, transcript and durable evidence. Roll back by stopping Agent Control, restoring the pre-upgrade state backup and starting the 3.9.0 package/checkout. Never point two controller versions at the same mutable state, and do not copy provider credentials, OpenWA sessions or remote-node credentials as part of source rollback.

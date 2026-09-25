# Agent Control 4.3 physical qualification

Generated: 2026-09-09T20:09:50.144Z

## Verdict

- WARM-EXPERT DELEGATION: **PROVEN**
- CACHE REUSE: **PROVEN**
- ROUTING BENEFIT: **MEASURED**
- PERFORMANCE BENEFIT: **MEASURED**
- MONETARY SAVING: **UNAVAILABLE**

The cold first invocation reported 0 reused / 1328 processed tokens. The compatible follow-on reported 1327 reused / 1 processed tokens and 66.39× lower prompt-processing time. Agent Control changed the declared route only after the Warm Expert supplied a verified HOT/HIGH cache score. The incompatible control applied no warm bonus. Material context and backend-process changes invalidated or isolated prior warmth. Every stage, provider invocation and independent routing decision passed verification.

MONETARY SAVING UNAVAILABLE because this local backend supplies no authoritative pricing or billing data.

A warm cache improves efficiency but does not confer correctness or authority. Capability, integrity and governance always outrank cache warmth.

## Source and media

- Branch: release/4.3.0-integration-20260909
- HEAD: undefined
- Repository archive SHA-256: 8538ecea1cf57aad7d966455744277055f421f4c0acbc4e649955044f932f437
- Video: /opt/qualification/agent-control-4.3-integrated-20260909/agent-control-4.3-integrated-qualification.mp4
- Video SHA-256: 321db46fe76ecfb0e781d9037e802bdd52ca354c343e8c86288e9fd3cca8931c
- Video: 1920×1080, 30fps, 99.2s

## Controlled gate assertions

- allParcelsSucceeded: PASS
- everyStageSucceeded: PASS
- everyInvocationIndependentlyVerified: PASS
- everyRoutingDecisionVerified: PASS
- coldPopulationAuthoritative: PASS
- warmExpertChangedRoute: PASS
- warmExpertBeatColdCandidate: PASS
- warmReuseAuthoritative: PASS
- incompatibleRouteRejected: PASS
- materialContextInvalidated: PASS
- restartedBackendUnknown: PASS
- restartSelectedCold: PASS
- oldWarmDoesNotMatchNew: PASS
- monetarySavingUnavailable: PASS

## Routing decisions

### f-backend-restart — cache-decision-813f555f-f175-4ec7-8e84-6ec1ac1a7c22

- Parcel: parcel-6bc87f34-bb40-4df2-a62f-93105c8442d7
- Selected: local-cache-cold/default/qwen-cache-cold@controller-cache-expert-qualification#3969379
- Warm Expert ID: none
- Changed declared route: false
- Decision verifier: PASS
- Reason: Warm Expert preference applied within qualified policy order; No cache-affinity bonus contributed.

| Candidate | Eligible | Cache state | Compatibility | Authority | Base | Cache | Load | Total | Reasons |
|---|---|---|---|---|---:|---:|---:|---:|---|
| local-cache-cold/default/qwen-cache-cold@controller-cache-expert-qualification#3969379 | true | HOT | INCOMPATIBLE | AUTHORITATIVE | 1.000000 | 0.000000 | 0.000000 | 1.000000 | cache-compatibility-incompatible; worker-load-0pct |
| local-cache-warm/default/qwen-cache-warm@controller-cache-expert-qualification#3971517 | true | CACHE STATE UNKNOWN | UNKNOWN | UNAVAILABLE | 0.950000 | 0.000000 | 0.000000 | 0.950000 | cache-evidence-unavailable; worker-load-0pct |

```text
# Cache-Aware Expert Routing Transcript

Work Parcel: parcel-6bc87f34-bb40-4df2-a62f-93105c8442d7
Stage: f-backend-restart
Decision: cache-decision-813f555f-f175-4ec7-8e84-6ec1ac1a7c22
Recorded: 2026-09-09T20:08:47.343Z

## What Agent Control considered

- local-cache-cold/default/qwen-cache-cold@controller-cache-expert-qualification: governed eligible; cache HOT/INCOMPATIBLE; evidence AUTHORITATIVE; base 1.0000 + cache 0.0000 - load 0.0000 = 1.0000; current load 0%; expected reuse unavailable; context delta 100% (estimated); cache-compatibility-incompatible, worker-load-0pct.
- local-cache-warm/default/qwen-cache-warm@controller-cache-expert-qualification: governed eligible; cache CACHE STATE UNKNOWN/UNKNOWN; evidence UNAVAILABLE; base 0.9500 + cache 0.0000 - load 0.0000 = 0.9500; current load 0%; expected reuse unavailable; context delta unavailable; cache-evidence-unavailable, worker-load-0pct.

## Decision

Selected route: local-cache-cold/default/qwen-cache-cold@controller-cache-expert-qualification
Selection authority: cache-score
Route changed from declared order: no
Reason: Warm Expert preference applied within qualified policy order; No cache-affinity bonus contributed.
Independent decision verifier: PASS

A warm cache improves efficiency but does not confer correctness or authority. Capability, integrity and governance always outrank cache warmth.

This transcript records operational facts and routing reasons only. It contains no private model reasoning or raw prompt content.
```

### e-context-invalidation — cache-decision-ee2f04bc-1374-4654-994f-81ac6d445b2f

- Parcel: parcel-a40cbc95-1f01-4c94-87ae-f7c0cffb6b8d
- Selected: local-cache-warm/default/qwen-cache-warm@controller-cache-expert-qualification#3969417
- Warm Expert ID: none
- Changed declared route: false
- Decision verifier: PASS
- Reason: Warm Expert preference applied within qualified policy order; No cache-affinity bonus contributed.

| Candidate | Eligible | Cache state | Compatibility | Authority | Base | Cache | Load | Total | Reasons |
|---|---|---|---|---|---:|---:|---:|---:|---|
| local-cache-warm/default/qwen-cache-warm@controller-cache-expert-qualification#3969417 | true | HOT | INCOMPATIBLE | AUTHORITATIVE | 1.000000 | 0.000000 | 0.000000 | 1.000000 | cache-compatibility-incompatible; worker-load-0pct |

```text
# Cache-Aware Expert Routing Transcript

Work Parcel: parcel-a40cbc95-1f01-4c94-87ae-f7c0cffb6b8d
Stage: e-context-invalidation
Decision: cache-decision-ee2f04bc-1374-4654-994f-81ac6d445b2f
Recorded: 2026-09-09T20:07:58.591Z

## What Agent Control considered

- local-cache-warm/default/qwen-cache-warm@controller-cache-expert-qualification: governed eligible; cache HOT/INCOMPATIBLE; evidence AUTHORITATIVE; base 1.0000 + cache 0.0000 - load 0.0000 = 1.0000; current load 0%; expected reuse unavailable; context delta 100% (estimated); cache-compatibility-incompatible, worker-load-0pct.

## Decision

Selected route: local-cache-warm/default/qwen-cache-warm@controller-cache-expert-qualification
Selection authority: cache-score
Route changed from declared order: no
Reason: Warm Expert preference applied within qualified policy order; No cache-affinity bonus contributed.
Independent decision verifier: PASS

A warm cache improves efficiency but does not confer correctness or authority. Capability, integrity and governance always outrank cache warmth.

This transcript records operational facts and routing reasons only. It contains no private model reasoning or raw prompt content.
```

### d-incompatible-control — cache-decision-735c7081-f8b1-4051-a7a1-5f59bd7791eb

- Parcel: parcel-a40cbc95-1f01-4c94-87ae-f7c0cffb6b8d
- Selected: local-cache-cold/default/qwen-cache-cold@controller-cache-expert-qualification#3969379
- Warm Expert ID: none
- Changed declared route: false
- Decision verifier: PASS
- Reason: Warm Expert preference applied within qualified policy order; No cache-affinity bonus contributed.

| Candidate | Eligible | Cache state | Compatibility | Authority | Base | Cache | Load | Total | Reasons |
|---|---|---|---|---|---:|---:|---:|---:|---|
| local-cache-cold/default/qwen-cache-cold@controller-cache-expert-qualification#3969379 | true | CACHE STATE UNKNOWN | UNKNOWN | UNAVAILABLE | 1.000000 | 0.000000 | 0.000000 | 1.000000 | cache-evidence-unavailable; worker-load-0pct |
| local-cache-warm/default/qwen-cache-warm@controller-cache-expert-qualification#3969417 | true | HOT | INCOMPATIBLE | AUTHORITATIVE | 0.950000 | 0.000000 | 0.000000 | 0.950000 | cache-compatibility-incompatible; worker-load-0pct |

```text
# Cache-Aware Expert Routing Transcript

Work Parcel: parcel-a40cbc95-1f01-4c94-87ae-f7c0cffb6b8d
Stage: d-incompatible-control
Decision: cache-decision-735c7081-f8b1-4051-a7a1-5f59bd7791eb
Recorded: 2026-09-09T20:07:53.083Z

## What Agent Control considered

- local-cache-cold/default/qwen-cache-cold@controller-cache-expert-qualification: governed eligible; cache CACHE STATE UNKNOWN/UNKNOWN; evidence UNAVAILABLE; base 1.0000 + cache 0.0000 - load 0.0000 = 1.0000; current load 0%; expected reuse unavailable; context delta unavailable; cache-evidence-unavailable, worker-load-0pct.
- local-cache-warm/default/qwen-cache-warm@controller-cache-expert-qualification: governed eligible; cache HOT/INCOMPATIBLE; evidence AUTHORITATIVE; base 0.9500 + cache 0.0000 - load 0.0000 = 0.9500; current load 0%; expected reuse unavailable; context delta 100% (estimated); cache-compatibility-incompatible, worker-load-0pct.

## Decision

Selected route: local-cache-cold/default/qwen-cache-cold@controller-cache-expert-qualification
Selection authority: cache-score
Route changed from declared order: no
Reason: Warm Expert preference applied within qualified policy order; No cache-affinity bonus contributed.
Independent decision verifier: PASS

A warm cache improves efficiency but does not confer correctness or authority. Capability, integrity and governance always outrank cache warmth.

This transcript records operational facts and routing reasons only. It contains no private model reasoning or raw prompt content.
```

### b-compatible-follow-on — cache-decision-9dc5e5e6-58df-494d-a613-4a841b4af6b0

- Parcel: parcel-a40cbc95-1f01-4c94-87ae-f7c0cffb6b8d
- Selected: local-cache-warm/default/qwen-cache-warm@controller-cache-expert-qualification#3969417
- Warm Expert ID: expert-318dad9a8a4f3014f1f994f7
- Changed declared route: true
- Decision verifier: PASS
- Reason: Warm Expert preference applied within qualified policy order; Warm Expert HOT/HIGH contributed 0.1051.

| Candidate | Eligible | Cache state | Compatibility | Authority | Base | Cache | Load | Total | Reasons |
|---|---|---|---|---|---:|---:|---:|---:|---|
| local-cache-cold/default/qwen-cache-cold@controller-cache-expert-qualification#3969379 | true | CACHE STATE UNKNOWN | UNKNOWN | UNAVAILABLE | 1.000000 | 0.000000 | 0.000000 | 1.000000 | cache-evidence-unavailable; worker-load-0pct |
| local-cache-warm/default/qwen-cache-warm@controller-cache-expert-qualification#3969417 | true | HOT | HIGH | AUTHORITATIVE | 0.950000 | 0.105146 | 0.000000 | 1.055146 | warm-expert-high-hot; worker-load-0pct |

```text
# Cache-Aware Expert Routing Transcript

Work Parcel: parcel-a40cbc95-1f01-4c94-87ae-f7c0cffb6b8d
Stage: b-compatible-follow-on
Decision: cache-decision-9dc5e5e6-58df-494d-a613-4a841b4af6b0
Recorded: 2026-09-09T20:07:49.149Z

## What Agent Control considered

- local-cache-cold/default/qwen-cache-cold@controller-cache-expert-qualification: governed eligible; cache CACHE STATE UNKNOWN/UNKNOWN; evidence UNAVAILABLE; base 1.0000 + cache 0.0000 - load 0.0000 = 1.0000; current load 0%; expected reuse unavailable; context delta unavailable; cache-evidence-unavailable, worker-load-0pct.
- local-cache-warm/default/qwen-cache-warm@controller-cache-expert-qualification: governed eligible; cache HOT/HIGH; evidence AUTHORITATIVE; base 0.9500 + cache 0.1051 - load 0.0000 = 1.0551; current load 0%; expected reuse 93%; context delta 0% (estimated); warm-expert-high-hot, worker-load-0pct.

## Decision

Selected route: local-cache-warm/default/qwen-cache-warm@controller-cache-expert-qualification
Selection authority: cache-score
Route changed from declared order: yes
Reason: Warm Expert preference applied within qualified policy order; Warm Expert HOT/HIGH contributed 0.1051.
Independent decision verifier: PASS

A warm cache improves efficiency but does not confer correctness or authority. Capability, integrity and governance always outrank cache warmth.

This transcript records operational facts and routing reasons only. It contains no private model reasoning or raw prompt content.
```

### a-cold-population — cache-decision-65b48009-e616-442c-a8fd-0635ec5c6912

- Parcel: parcel-a40cbc95-1f01-4c94-87ae-f7c0cffb6b8d
- Selected: local-cache-warm/default/qwen-cache-warm@controller-cache-expert-qualification#3969417
- Warm Expert ID: none
- Changed declared route: false
- Decision verifier: PASS
- Reason: Warm Expert preference applied within qualified policy order; No cache-affinity bonus contributed.

| Candidate | Eligible | Cache state | Compatibility | Authority | Base | Cache | Load | Total | Reasons |
|---|---|---|---|---|---:|---:|---:|---:|---|
| local-cache-warm/default/qwen-cache-warm@controller-cache-expert-qualification#3969417 | true | CACHE STATE UNKNOWN | UNKNOWN | UNAVAILABLE | 1.000000 | 0.000000 | 0.000000 | 1.000000 | cache-evidence-unavailable; worker-load-0pct |

```text
# Cache-Aware Expert Routing Transcript

Work Parcel: parcel-a40cbc95-1f01-4c94-87ae-f7c0cffb6b8d
Stage: a-cold-population
Decision: cache-decision-65b48009-e616-442c-a8fd-0635ec5c6912
Recorded: 2026-09-09T20:07:43.731Z

## What Agent Control considered

- local-cache-warm/default/qwen-cache-warm@controller-cache-expert-qualification: governed eligible; cache CACHE STATE UNKNOWN/UNKNOWN; evidence UNAVAILABLE; base 1.0000 + cache 0.0000 - load 0.0000 = 1.0000; current load 0%; expected reuse unavailable; context delta unavailable; cache-evidence-unavailable, worker-load-0pct.

## Decision

Selected route: local-cache-warm/default/qwen-cache-warm@controller-cache-expert-qualification
Selection authority: cache-score
Route changed from declared order: no
Reason: Warm Expert preference applied within qualified policy order; No cache-affinity bonus contributed.
Independent decision verifier: PASS

A warm cache improves efficiency but does not confer correctness or authority. Capability, integrity and governance always outrank cache warmth.

This transcript records operational facts and routing reasons only. It contains no private model reasoning or raw prompt content.
```

## Work Parcel parcel-a40cbc95-1f01-4c94-87ae-f7c0cffb6b8d

Operator request: Run Agent Control 4.3 Cache-Aware Expert Delegation qualification
Status: SUCCEEDED

- 2026-09-09T20:07:43.374Z · task.received · Natural-language task accepted — Verbatim prompt retained before planning
- 2026-09-09T20:07:43.374Z · task.classified · Task queued for governed planning — Registered Job selection remains authoritative
- 2026-09-09T20:07:43.374Z · planning.started · Selecting registered Job — Planner may only select Jobs present in the canonical catalog
- 2026-09-09T20:07:43.382Z · plan.selected · Work Parcel selected — Explicitly gated 4.3 physical qualification plan; every stage uses normal production routing and execution
- 2026-09-09T20:07:43.382Z · route.requested · a-cold-population · A · Cold population on candidate Warm Expert route requested — Requested provider policy-selected; account policy-selected; model qwen-cache-warm; role policy-selected; fallback disabled; purpose EXECUTION; profile THIN; Establish a genuine verified cold population on the designated candidate route
- 2026-09-09T20:07:43.382Z · route.requested · b-compatible-follow-on · B/C · Compatible follow-on with cold competitor route requested — Requested provider policy-selected; account policy-selected; model policy-selected; role cache.follow-on; fallback allowed; purpose EXECUTION; profile THIN; Compare the equally capable cold primary with the compatible measured Warm Expert
- 2026-09-09T20:07:43.382Z · route.requested · d-incompatible-control · D · Incompatible task control route requested — Requested provider policy-selected; account policy-selected; model policy-selected; role cache.follow-on; fallback allowed; purpose EXECUTION; profile THIN; Material task/dependency context changed; cache affinity must not select the prior Warm Expert
- 2026-09-09T20:07:43.382Z · route.requested · e-context-invalidation · E · Material context invalidation route requested — Requested provider policy-selected; account policy-selected; model qwen-cache-warm; role policy-selected; fallback disabled; purpose EXECUTION; profile THIN; Run incompatible work in the same warm backend scope so displaced retained context is invalidated after observation
- 2026-09-09T20:07:43.728Z · baton.created · a-cold-population · Bounded operational baton view sealed — parcel-baton-05860399-d369-4608-8436-ba74641b1568; sha256 4cda541a49492f71a59c005d28eed0675aa0ab3ed23ffa93fc18590c09272c6c; 3072 bytes; full history remains in parcel ledger
- 2026-09-09T20:07:43.731Z · cache.experts_assessed · a-cold-population · Warm Expert candidates assessed — local-cache-warm/qwen-cache-warm CACHE STATE UNKNOWN/UNKNOWN cache=0.0000 authority=UNAVAILABLE
- 2026-09-09T20:07:43.733Z · cache.expert_selected · a-cold-population · Governed route selected without warm affinity — Warm Expert preference applied within qualified policy order; No cache-affinity bonus contributed.
- 2026-09-09T20:07:43.738Z · stage.dispatched · a-cold-population · A · Cold population on candidate Warm Expert dispatched — Job non-openai-cache-stable@1.0.0; Run run-71c64548-7f24-4820-b1e0-9166e1627de4; requested route Requested provider policy-selected; account policy-selected; model qwen-cache-warm; role policy-selected; fallback disabled; purpose EXECUTION; profile THIN; Establish a genuine verified cold population on the designated candidate route; resolved local-cache-warm/qwen-cache-warm on controller-cache-expert-qualification; qualification llama.cpp-b9371-cache-aware-expert-qualification
- 2026-09-09T20:07:43.739Z · route.resolved · a-cold-population · A · Cold population on candidate Warm Expert actual route recorded — Workers none; provider local-cache-warm; account default; model qwen-cache-warm; profile THIN; Qualified route llama.cpp-b9371-cache-aware-expert-qualification
- 2026-09-09T20:07:43.824Z · route.resolved · a-cold-population · A · Cold population on candidate Warm Expert actual route recorded — Workers controller-cache-expert-qualification; provider local-cache-warm; account default; model qwen-cache-warm; profile THIN; satisfies:model.execute, satisfies:repository.mutation.typed, satisfies:repository.verify.public, healthy, available
- 2026-09-09T20:07:45.797Z · cache.expert_observed · a-cold-population · Cache expertise observed: HOT — inv-e0fb7560-3987-4d9f-b814-d6efe2486da6; DERIVED; reused 0; processed 1328; verifier UNKNOWN
- 2026-09-09T20:07:47.337Z · cache.expert_observed · a-cold-population · Cache expertise observed: HOT — inv-536faa37-a755-41b2-8e4f-c104b2ae5fe0; AUTHORITATIVE; reused 1359; processed 206; verifier UNKNOWN
- 2026-09-09T20:07:47.903Z · cache.expert_observed · a-cold-population · Cache expertise observed: HOT — inv-d7c8a949-d752-4a4a-bb15-d4e4090c2def; AUTHORITATIVE; reused 1630; processed 114; verifier UNKNOWN
- 2026-09-09T20:07:45.797Z · invocation.completed · a-cold-population · local-cache-warm / qwen-cache-warm invocation completed — inv-e0fb7560-3987-4d9f-b814-d6efe2486da6; 1360 tokens; provider cost not reported
- 2026-09-09T20:07:47.337Z · invocation.completed · a-cold-population · local-cache-warm / qwen-cache-warm invocation completed — inv-536faa37-a755-41b2-8e4f-c104b2ae5fe0; 1631 tokens; provider cost not reported
- 2026-09-09T20:07:47.903Z · invocation.completed · a-cold-population · local-cache-warm / qwen-cache-warm invocation completed — inv-d7c8a949-d752-4a4a-bb15-d4e4090c2def; 1765 tokens; provider cost not reported
- 2026-09-09T20:07:48.156Z · route.resolved · a-cold-population · A · Cold population on candidate Warm Expert actual route recorded — Workers controller-cache-expert-qualification; provider local-cache-warm; account default; model qwen-cache-warm; profile THIN; satisfies:model.execute, satisfies:repository.mutation.typed, satisfies:repository.verify.public, healthy, available, satisfies:model.execute, satisfies:repository.mutation.typed, satisfies:repository.verify.public, healthy, available
- 2026-09-09T20:07:49.146Z · baton.created · b-compatible-follow-on · Bounded operational baton view sealed — parcel-baton-8fd6550c-54d7-4449-9edb-98f8a421d69f; sha256 05d5cbe601d901c9d500dcb4ee3c9aa1818f048ca31da6b70c99dd25df7253b6; 4942 bytes; full history remains in parcel ledger
- 2026-09-09T20:07:49.149Z · cache.experts_assessed · b-compatible-follow-on · Warm Expert candidates assessed — local-cache-cold/qwen-cache-cold CACHE STATE UNKNOWN/UNKNOWN cache=0.0000 authority=UNAVAILABLE; local-cache-warm/qwen-cache-warm HOT/HIGH cache=0.1051 authority=AUTHORITATIVE
- 2026-09-09T20:07:49.153Z · cache.expert_selected · b-compatible-follow-on · Warm Expert route selected — Warm Expert preference applied within qualified policy order; Warm Expert HOT/HIGH contributed 0.1051.
- 2026-09-09T20:07:49.157Z · stage.dispatched · b-compatible-follow-on · B/C · Compatible follow-on with cold competitor dispatched — Job non-openai-cache-stable@1.0.0; Run run-4523f56e-8ffa-417d-96cf-21b0b175ea51; requested route Requested provider policy-selected; account policy-selected; model policy-selected; role cache.follow-on; fallback allowed; purpose EXECUTION; profile THIN; Compare the equally capable cold primary with the compatible measured Warm Expert; resolved local-cache-warm/qwen-cache-warm on controller-cache-expert-qualification; qualification llama.cpp-b9371-cache-aware-expert-qualification
- 2026-09-09T20:07:49.158Z · route.resolved · b-compatible-follow-on · B/C · Compatible follow-on with cold competitor actual route recorded — Workers none; provider local-cache-warm; account default; model qwen-cache-warm; profile THIN; Qualified route llama.cpp-b9371-cache-aware-expert-qualification
- 2026-09-09T20:07:49.233Z · route.resolved · b-compatible-follow-on · B/C · Compatible follow-on with cold competitor actual route recorded — Workers controller-cache-expert-qualification; provider local-cache-warm; account default; model qwen-cache-warm; profile THIN; satisfies:model.execute, satisfies:repository.mutation.typed, satisfies:repository.verify.public, healthy, available
- 2026-09-09T20:07:49.860Z · cache.expert_observed · b-compatible-follow-on · Cache expertise observed: HOT — inv-4c1591a6-95a8-4976-aace-41bc96c8ca63; AUTHORITATIVE; reused 1327; processed 1; verifier UNKNOWN
- 2026-09-09T20:07:51.373Z · cache.expert_observed · b-compatible-follow-on · Cache expertise observed: HOT — inv-26f92919-7abd-4b75-90c9-af64a1fabc5f; AUTHORITATIVE; reused 1359; processed 206; verifier UNKNOWN
- 2026-09-09T20:07:51.927Z · cache.expert_observed · b-compatible-follow-on · Cache expertise observed: HOT — inv-22b4e124-1bd8-423f-a21d-1ab3960f3408; AUTHORITATIVE; reused 1630; processed 114; verifier UNKNOWN
- 2026-09-09T20:07:49.860Z · invocation.completed · b-compatible-follow-on · local-cache-warm / qwen-cache-warm invocation completed — inv-4c1591a6-95a8-4976-aace-41bc96c8ca63; 1360 tokens; provider cost not reported
- 2026-09-09T20:07:51.373Z · invocation.completed · b-compatible-follow-on · local-cache-warm / qwen-cache-warm invocation completed — inv-26f92919-7abd-4b75-90c9-af64a1fabc5f; 1631 tokens; provider cost not reported
- 2026-09-09T20:07:51.927Z · invocation.completed · b-compatible-follow-on · local-cache-warm / qwen-cache-warm invocation completed — inv-22b4e124-1bd8-423f-a21d-1ab3960f3408; 1765 tokens; provider cost not reported
- 2026-09-09T20:07:52.147Z · route.resolved · b-compatible-follow-on · B/C · Compatible follow-on with cold competitor actual route recorded — Workers controller-cache-expert-qualification; provider local-cache-warm; account default; model qwen-cache-warm; profile THIN; satisfies:model.execute, satisfies:repository.mutation.typed, satisfies:repository.verify.public, healthy, available, satisfies:model.execute, satisfies:repository.mutation.typed, satisfies:repository.verify.public, healthy, available
- 2026-09-09T20:07:53.081Z · baton.created · d-incompatible-control · Bounded operational baton view sealed — parcel-baton-737c3426-feec-4c6e-8c2e-590e31ec11f8; sha256 6833178b160dfdb24efb6db71edb8bb888077249cf15d8f74f51bdff0f4aac37; 5211 bytes; full history remains in parcel ledger
- 2026-09-09T20:07:53.083Z · cache.experts_assessed · d-incompatible-control · Warm Expert candidates assessed — local-cache-cold/qwen-cache-cold CACHE STATE UNKNOWN/UNKNOWN cache=0.0000 authority=UNAVAILABLE; local-cache-warm/qwen-cache-warm HOT/INCOMPATIBLE cache=0.0000 authority=AUTHORITATIVE
- 2026-09-09T20:07:53.086Z · cache.expert_selected · d-incompatible-control · Governed route selected without warm affinity — Warm Expert preference applied within qualified policy order; No cache-affinity bonus contributed.
- 2026-09-09T20:07:53.091Z · stage.dispatched · d-incompatible-control · D · Incompatible task control dispatched — Job non-openai-cache-changed-prefix@1.0.0; Run run-b91c9d71-5b94-4b6e-9598-05d3f3cc9ec5; requested route Requested provider policy-selected; account policy-selected; model policy-selected; role cache.follow-on; fallback allowed; purpose EXECUTION; profile THIN; Material task/dependency context changed; cache affinity must not select the prior Warm Expert; resolved local-cache-cold/qwen-cache-cold on controller-cache-expert-qualification; qualification llama.cpp-b9371-cache-aware-expert-qualification
- 2026-09-09T20:07:53.093Z · route.resolved · d-incompatible-control · D · Incompatible task control actual route recorded — Workers none; provider local-cache-cold; account default; model qwen-cache-cold; profile THIN; Qualified route llama.cpp-b9371-cache-aware-expert-qualification
- 2026-09-09T20:07:53.167Z · route.resolved · d-incompatible-control · D · Incompatible task control actual route recorded — Workers controller-cache-expert-qualification; provider local-cache-cold; account default; model qwen-cache-cold; profile THIN; satisfies:model.execute, satisfies:repository.mutation.typed, satisfies:repository.verify.public, healthy, available
- 2026-09-09T20:07:53.157Z · route.changed · d-incompatible-control · local-cache-warm/qwen-cache-warm → local-cache-cold/qwen-cache-cold — Observed execution strategy non-openai-cache.real-repository-mutation; previous verifier PASS; incremental provider cost not reported
- 2026-09-09T20:07:55.384Z · cache.expert_observed · d-incompatible-control · Cache expertise observed: HOT — inv-ec03d154-0c8e-4069-a998-19d8284441a2; DERIVED; reused 0; processed 1336; verifier UNKNOWN
- 2026-09-09T20:07:56.769Z · cache.expert_observed · d-incompatible-control · Cache expertise observed: HOT — inv-8cbde689-d80e-45ac-bb58-0326170551c5; AUTHORITATIVE; reused 1383; processed 76; verifier UNKNOWN
- 2026-09-09T20:07:57.328Z · cache.expert_observed · d-incompatible-control · Cache expertise observed: HOT — inv-4314a5a4-35f2-42e2-a573-9b2d4bf51871; AUTHORITATIVE; reused 1524; processed 114; verifier UNKNOWN
- 2026-09-09T20:07:55.384Z · invocation.completed · d-incompatible-control · local-cache-cold / qwen-cache-cold invocation completed — inv-ec03d154-0c8e-4069-a998-19d8284441a2; 1384 tokens; provider cost not reported
- 2026-09-09T20:07:56.769Z · invocation.completed · d-incompatible-control · local-cache-cold / qwen-cache-cold invocation completed — inv-8cbde689-d80e-45ac-bb58-0326170551c5; 1525 tokens; provider cost not reported
- 2026-09-09T20:07:57.328Z · invocation.completed · d-incompatible-control · local-cache-cold / qwen-cache-cold invocation completed — inv-4314a5a4-35f2-42e2-a573-9b2d4bf51871; 1659 tokens; provider cost not reported
- 2026-09-09T20:07:57.569Z · route.resolved · d-incompatible-control · D · Incompatible task control actual route recorded — Workers controller-cache-expert-qualification; provider local-cache-cold; account default; model qwen-cache-cold; profile THIN; satisfies:model.execute, satisfies:repository.mutation.typed, satisfies:repository.verify.public, healthy, available, satisfies:model.execute, satisfies:repository.mutation.typed, satisfies:repository.verify.public, healthy, available
- 2026-09-09T20:07:58.588Z · baton.created · e-context-invalidation · Bounded operational baton view sealed — parcel-baton-3c0ed1f2-2b2b-428b-8c6c-f82f19341d02; sha256 d391b6bf3b99fb4a0a9dea5597d5b65142a199a7fb83773170e9388f1f36e7eb; 5262 bytes; full history remains in parcel ledger
- 2026-09-09T20:07:58.591Z · cache.experts_assessed · e-context-invalidation · Warm Expert candidates assessed — local-cache-warm/qwen-cache-warm HOT/INCOMPATIBLE cache=0.0000 authority=AUTHORITATIVE
- 2026-09-09T20:07:58.594Z · cache.expert_selected · e-context-invalidation · Governed route selected without warm affinity — Warm Expert preference applied within qualified policy order; No cache-affinity bonus contributed.
- 2026-09-09T20:07:58.600Z · stage.dispatched · e-context-invalidation · E · Material context invalidation dispatched — Job non-openai-cache-changed-prefix@1.0.0; Run run-bbc29c6d-caec-4421-842d-d514c447e752; requested route Requested provider policy-selected; account policy-selected; model qwen-cache-warm; role policy-selected; fallback disabled; purpose EXECUTION; profile THIN; Run incompatible work in the same warm backend scope so displaced retained context is invalidated after observation; resolved local-cache-warm/qwen-cache-warm on controller-cache-expert-qualification; qualification llama.cpp-b9371-cache-aware-expert-qualification
- 2026-09-09T20:07:58.602Z · route.resolved · e-context-invalidation · E · Material context invalidation actual route recorded — Workers none; provider local-cache-warm; account default; model qwen-cache-warm; profile THIN; Qualified route llama.cpp-b9371-cache-aware-expert-qualification
- 2026-09-09T20:07:58.719Z · route.resolved · e-context-invalidation · E · Material context invalidation actual route recorded — Workers controller-cache-expert-qualification; provider local-cache-warm; account default; model qwen-cache-warm; profile THIN; satisfies:model.execute, satisfies:repository.mutation.typed, satisfies:repository.verify.public, healthy, available
- 2026-09-09T20:07:58.705Z · route.changed · e-context-invalidation · local-cache-cold/qwen-cache-cold → local-cache-warm/qwen-cache-warm — Observed execution strategy non-openai-cache.real-repository-mutation; previous verifier PASS; incremental provider cost not reported
- 2026-09-09T20:08:00.560Z · cache.expert_observed · e-context-invalidation · Cache expertise observed: WARM — inv-5d947b52-275a-4039-800e-f98427289921; AUTHORITATIVE; reused 497; processed 839; verifier UNKNOWN
- 2026-09-09T20:08:01.953Z · cache.expert_observed · e-context-invalidation · Cache expertise observed: HOT — inv-edc71858-206e-4920-b686-71942e5eb70c; AUTHORITATIVE; reused 1383; processed 76; verifier UNKNOWN
- 2026-09-09T20:08:02.524Z · cache.expert_observed · e-context-invalidation · Cache expertise observed: HOT — inv-7f837f9a-04b1-4726-bd96-bf4370f87b98; AUTHORITATIVE; reused 1524; processed 114; verifier UNKNOWN
- 2026-09-09T20:08:00.560Z · invocation.completed · e-context-invalidation · local-cache-warm / qwen-cache-warm invocation completed — inv-5d947b52-275a-4039-800e-f98427289921; 1384 tokens; provider cost not reported
- 2026-09-09T20:08:01.953Z · invocation.completed · e-context-invalidation · local-cache-warm / qwen-cache-warm invocation completed — inv-edc71858-206e-4920-b686-71942e5eb70c; 1525 tokens; provider cost not reported
- 2026-09-09T20:08:02.524Z · invocation.completed · e-context-invalidation · local-cache-warm / qwen-cache-warm invocation completed — inv-7f837f9a-04b1-4726-bd96-bf4370f87b98; 1659 tokens; provider cost not reported
- 2026-09-09T20:08:02.869Z · route.resolved · e-context-invalidation · E · Material context invalidation actual route recorded — Workers controller-cache-expert-qualification; provider local-cache-warm; account default; model qwen-cache-warm; profile THIN; satisfies:model.execute, satisfies:repository.mutation.typed, satisfies:repository.verify.public, healthy, available, satisfies:model.execute, satisfies:repository.mutation.typed, satisfies:repository.verify.public, healthy, available
- 2026-09-09T20:08:03.961Z · verification.completed · All declared verification criteria passed — 4 criterion/criteria passed through the normal Work Parcel boundary

### Baton chain

- a-cold-population · SUCCEEDED · run run-71c64548-7f24-4820-b1e0-9166e1627de4 · decision cache-decision-65b48009-e616-442c-a8fd-0635ec5c6912 · expert none · artifacts artifact-3d700a90-c60a-4a67-9427-b26a65209d18, artifact-8de9380c-a93e-4920-bd00-4e66cb156f8e
- b-compatible-follow-on · SUCCEEDED · run run-4523f56e-8ffa-417d-96cf-21b0b175ea51 · decision cache-decision-9dc5e5e6-58df-494d-a613-4a841b4af6b0 · expert expert-318dad9a8a4f3014f1f994f7 · artifacts artifact-f8b7bc4e-b794-4ca2-bb82-7abd71223212, artifact-524cf0cc-d3a6-4ae7-b704-759510917252
- d-incompatible-control · SUCCEEDED · run run-b91c9d71-5b94-4b6e-9598-05d3f3cc9ec5 · decision cache-decision-735c7081-f8b1-4051-a7a1-5f59bd7791eb · expert none · artifacts artifact-3a9d1f05-fe7b-4f03-8148-e6e87d23da1a, artifact-3b089938-4f4b-4640-be6e-59c4aa2210e5
- e-context-invalidation · SUCCEEDED · run run-bbc29c6d-caec-4421-842d-d514c447e752 · decision cache-decision-ee2f04bc-1374-4654-994f-81ac6d445b2f · expert none · artifacts artifact-7402809c-5c24-43ab-9bd2-16f2306abf97, artifact-6343bd64-c429-4bd9-b0c6-70be86fabf3e

### Model invocation and cache measurements

- 2026-09-09T20:07:43.800Z → 2026-09-09T20:07:45.797Z · a-cold-population · local-cache-warm/qwen-cache-warm@controller-cache-expert-qualification · reused 0 · processed 1328 · prompt 1345.148 ms · total 1360 · elapsed 1997 ms · authority authoritative · verifier PASS
- 2026-09-09T20:07:45.801Z → 2026-09-09T20:07:47.337Z · a-cold-population · local-cache-warm/qwen-cache-warm@controller-cache-expert-qualification · reused 1359 · processed 206 · prompt 254.976 ms · total 1631 · elapsed 1536 ms · authority authoritative · verifier PASS
- 2026-09-09T20:07:47.347Z → 2026-09-09T20:07:47.903Z · a-cold-population · local-cache-warm/qwen-cache-warm@controller-cache-expert-qualification · reused 1630 · processed 114 · prompt 146.741 ms · total 1765 · elapsed 556 ms · authority authoritative · verifier PASS
- 2026-09-09T20:07:49.224Z → 2026-09-09T20:07:49.860Z · b-compatible-follow-on · local-cache-warm/qwen-cache-warm@controller-cache-expert-qualification · reused 1327 · processed 1 · prompt 20.261 ms · total 1360 · elapsed 636 ms · authority authoritative · verifier PASS
- 2026-09-09T20:07:49.861Z → 2026-09-09T20:07:51.373Z · b-compatible-follow-on · local-cache-warm/qwen-cache-warm@controller-cache-expert-qualification · reused 1359 · processed 206 · prompt 257.5 ms · total 1631 · elapsed 1512 ms · authority authoritative · verifier PASS
- 2026-09-09T20:07:51.383Z → 2026-09-09T20:07:51.927Z · b-compatible-follow-on · local-cache-warm/qwen-cache-warm@controller-cache-expert-qualification · reused 1630 · processed 114 · prompt 145.391 ms · total 1765 · elapsed 544 ms · authority authoritative · verifier PASS
- 2026-09-09T20:07:53.157Z → 2026-09-09T20:07:55.384Z · d-incompatible-control · local-cache-cold/qwen-cache-cold@controller-cache-expert-qualification · reused 0 · processed 1336 · prompt 1307.101 ms · total 1384 · elapsed 2227 ms · authority authoritative · verifier PASS
- 2026-09-09T20:07:55.386Z → 2026-09-09T20:07:56.769Z · d-incompatible-control · local-cache-cold/qwen-cache-cold@controller-cache-expert-qualification · reused 1383 · processed 76 · prompt 117.282 ms · total 1525 · elapsed 1383 ms · authority authoritative · verifier PASS
- 2026-09-09T20:07:56.781Z → 2026-09-09T20:07:57.328Z · d-incompatible-control · local-cache-cold/qwen-cache-cold@controller-cache-expert-qualification · reused 1524 · processed 114 · prompt 144.992 ms · total 1659 · elapsed 547 ms · authority authoritative · verifier PASS
- 2026-09-09T20:07:58.705Z → 2026-09-09T20:08:00.560Z · e-context-invalidation · local-cache-warm/qwen-cache-warm@controller-cache-expert-qualification · reused 497 · processed 839 · prompt 858.701 ms · total 1384 · elapsed 1855 ms · authority authoritative · verifier PASS
- 2026-09-09T20:08:00.563Z → 2026-09-09T20:08:01.953Z · e-context-invalidation · local-cache-warm/qwen-cache-warm@controller-cache-expert-qualification · reused 1383 · processed 76 · prompt 116.394 ms · total 1525 · elapsed 1390 ms · authority authoritative · verifier PASS
- 2026-09-09T20:08:01.967Z → 2026-09-09T20:08:02.524Z · e-context-invalidation · local-cache-warm/qwen-cache-warm@controller-cache-expert-qualification · reused 1524 · processed 114 · prompt 146.236 ms · total 1659 · elapsed 557 ms · authority authoritative · verifier PASS

## Work Parcel parcel-6bc87f34-bb40-4df2-a62f-93105c8442d7

Operator request: Run Agent Control 4.3 backend restart control
Status: SUCCEEDED

- 2026-09-09T20:08:47.131Z · task.received · Natural-language task accepted — Verbatim prompt retained before planning
- 2026-09-09T20:08:47.131Z · task.classified · Task queued for governed planning — Registered Job selection remains authoritative
- 2026-09-09T20:08:47.131Z · planning.started · Selecting registered Job — Planner may only select Jobs present in the canonical catalog
- 2026-09-09T20:08:47.150Z · plan.selected · Work Parcel selected — Explicitly gated backend-restart negative control through normal production routing
- 2026-09-09T20:08:47.150Z · route.requested · f-backend-restart · F · Backend restart control route requested — Requested provider policy-selected; account policy-selected; model policy-selected; role cache.follow-on; fallback allowed; purpose EXECUTION; profile THIN; A new backend instance has no inherited cache authority; the declared cold primary must remain selected
- 2026-09-09T20:08:47.339Z · baton.created · f-backend-restart · Bounded operational baton view sealed — parcel-baton-b298f204-b24a-4ad1-b21a-c9c0398477c5; sha256 30b0511bd93eae072f46a4feb2e5ee96b00082c3a050267a1d5662da41140517; 1626 bytes; full history remains in parcel ledger
- 2026-09-09T20:08:47.343Z · cache.experts_assessed · f-backend-restart · Warm Expert candidates assessed — local-cache-cold/qwen-cache-cold HOT/INCOMPATIBLE cache=0.0000 authority=AUTHORITATIVE; local-cache-warm/qwen-cache-warm CACHE STATE UNKNOWN/UNKNOWN cache=0.0000 authority=UNAVAILABLE
- 2026-09-09T20:08:47.349Z · cache.expert_selected · f-backend-restart · Governed route selected without warm affinity — Warm Expert preference applied within qualified policy order; No cache-affinity bonus contributed.
- 2026-09-09T20:08:47.356Z · stage.dispatched · f-backend-restart · F · Backend restart control dispatched — Job non-openai-cache-stable@1.0.0; Run run-7a07ee85-3dbe-4d78-821f-5ed4463c9dba; requested route Requested provider policy-selected; account policy-selected; model policy-selected; role cache.follow-on; fallback allowed; purpose EXECUTION; profile THIN; A new backend instance has no inherited cache authority; the declared cold primary must remain selected; resolved local-cache-cold/qwen-cache-cold on controller-cache-expert-qualification; qualification llama.cpp-b9371-cache-aware-expert-qualification
- 2026-09-09T20:08:47.358Z · route.resolved · f-backend-restart · F · Backend restart control actual route recorded — Workers none; provider local-cache-cold; account default; model qwen-cache-cold; profile THIN; Qualified route llama.cpp-b9371-cache-aware-expert-qualification
- 2026-09-09T20:08:47.468Z · route.resolved · f-backend-restart · F · Backend restart control actual route recorded — Workers controller-cache-expert-qualification; provider local-cache-cold; account default; model qwen-cache-cold; profile THIN; satisfies:model.execute, satisfies:repository.mutation.typed, satisfies:repository.verify.public, healthy, available
- 2026-09-09T20:08:48.978Z · cache.expert_observed · f-backend-restart · Cache expertise observed: WARM — inv-3bb19040-0d12-4f33-af66-61a135063360; AUTHORITATIVE; reused 497; processed 831; verifier UNKNOWN
- 2026-09-09T20:08:50.519Z · cache.expert_observed · f-backend-restart · Cache expertise observed: HOT — inv-c7544dfe-64af-47d1-acec-5fd6de5f0a87; AUTHORITATIVE; reused 1359; processed 206; verifier UNKNOWN
- 2026-09-09T20:08:51.100Z · cache.expert_observed · f-backend-restart · Cache expertise observed: HOT — inv-e29750a6-811e-483d-9ed9-09e523814741; AUTHORITATIVE; reused 1630; processed 114; verifier UNKNOWN
- 2026-09-09T20:08:48.978Z · invocation.completed · f-backend-restart · local-cache-cold / qwen-cache-cold invocation completed — inv-3bb19040-0d12-4f33-af66-61a135063360; 1360 tokens; provider cost not reported
- 2026-09-09T20:08:50.519Z · invocation.completed · f-backend-restart · local-cache-cold / qwen-cache-cold invocation completed — inv-c7544dfe-64af-47d1-acec-5fd6de5f0a87; 1631 tokens; provider cost not reported
- 2026-09-09T20:08:51.100Z · invocation.completed · f-backend-restart · local-cache-cold / qwen-cache-cold invocation completed — inv-e29750a6-811e-483d-9ed9-09e523814741; 1765 tokens; provider cost not reported
- 2026-09-09T20:08:51.415Z · route.resolved · f-backend-restart · F · Backend restart control actual route recorded — Workers controller-cache-expert-qualification; provider local-cache-cold; account default; model qwen-cache-cold; profile THIN; satisfies:model.execute, satisfies:repository.mutation.typed, satisfies:repository.verify.public, healthy, available, satisfies:model.execute, satisfies:repository.mutation.typed, satisfies:repository.verify.public, healthy, available
- 2026-09-09T20:08:52.654Z · verification.completed · All declared verification criteria passed — 1 criterion/criteria passed through the normal Work Parcel boundary

### Baton chain

- f-backend-restart · SUCCEEDED · run run-7a07ee85-3dbe-4d78-821f-5ed4463c9dba · decision cache-decision-813f555f-f175-4ec7-8e84-6ec1ac1a7c22 · expert none · artifacts artifact-4d559129-acd9-4396-8e86-10f71128e4d2, artifact-932f5e5a-5b50-4924-b57a-263d9811d7f0

### Model invocation and cache measurements

- 2026-09-09T20:08:47.431Z → 2026-09-09T20:08:48.978Z · f-backend-restart · local-cache-cold/qwen-cache-cold@controller-cache-expert-qualification · reused 497 · processed 831 · prompt 835.77 ms · total 1360 · elapsed 1547 ms · authority authoritative · verifier PASS
- 2026-09-09T20:08:48.984Z → 2026-09-09T20:08:50.519Z · f-backend-restart · local-cache-cold/qwen-cache-cold@controller-cache-expert-qualification · reused 1359 · processed 206 · prompt 255.771 ms · total 1631 · elapsed 1535 ms · authority authoritative · verifier PASS
- 2026-09-09T20:08:50.533Z → 2026-09-09T20:08:51.100Z · f-backend-restart · local-cache-cold/qwen-cache-cold@controller-cache-expert-qualification · reused 1630 · processed 114 · prompt 146.366 ms · total 1765 · elapsed 567 ms · authority authoritative · verifier PASS

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

# Complete managed provider/tool/verification evidence

The following is the complete server-redacted managed content naturally produced by Agent Control. It is not a replacement summary.

## Managed evidence artifact-3d700a90-c60a-4a67-9427-b26a65209d18

Name: mutation-attempt  
Schema: agent-control.non-openai-cache-attempt/v1  
SHA-256: 90d9cb30d806d47aba6c7c1913ce77e2a26a85e22eae120bc239b4021df03050

```json
{
  "schema": "agent-control.non-openai-cache-attempt/v1",
  "taskId": "MUT-001",
  "prefixVariant": "stable",
  "fixtureSha256": "d1b5e8ebec19378b5d2112e8be5e73671a51c40bc328af8ded815be44edb6b27",
  "startingRevision": "b44b1cd514d833d83565d3436c3b7e2d2a3957eb",
  "stablePrefixSha256": "ff3d67f883626dcb107179f10bc39b514e4ed83c0528d5d5541d524ec5534294",
  "status": {
    "changedFiles": [
      "src/constants.js"
    ],
    "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
  },
  "counters": {
    "repositoryReads": 1,
    "repositorySearches": 0,
    "mutationsAttempted": 1,
    "verifierFacingTests": 1,
    "toolCalls": 3,
    "toolIds": [
      "mutation.repository.read",
      "mutation.repository.replace",
      "mutation.repository.test"
    ]
  },
  "transcript": [
    {
      "type": "initiating-model-request",
      "at": "2026-09-09T20:07:43.797Z",
      "instruction": "CACHE QUALIFICATION PREFIX A.\nExecute mutation task MUT-001 in the current disposable repository using profile THIN. This is an actual repository change, not a prose answer. Inspect before editing, remain inside the allowlisted paths, run the typed public-test tool when practical, then request mutation.finish. ",
      "authorisedContext": [
        {
          "id": "MUT-001:control",
          "kind": "agent_control_instructions",
          "content": "Agent Control retains scheduling, ToolPolicy, leases, ownership, cancellation, human takeover and verifier acceptance. Never modify a file outside the task scope."
        },
        {
          "id": "MUT-001:repository-rules",
          "kind": "repository_instructions",
          "content": "This is a disposable frozen JavaScript repository. Use forward-slash relative paths. Do not edit package metadata unless explicitly allowed. Do not add dependencies, credentials, machine names, network addresses or provider/model conditionals. Existing public tests must continue to pass."
        },
        {
          "id": "MUT-001:system",
          "kind": "system_instructions",
          "content": "Perform a real bounded repository mutation. Inspect evidence, use only typed tools, run public tests when practical, and stop without claiming independent verification."
        },
        {
          "id": "MUT-001:task",
          "kind": "task_context",
          "content": "Task MUT-001 (trivial_bounded_edit)\nChange the governed runtime's default job timeout to 45 seconds without changing any other default or public behavior.\nAllowed mutation paths: src/constants.js\nRequired changed paths: src/constants.js\nAcceptance criteria:\n- default timeout exports 45000 milliseconds\n- public tests pass\n- only the allowed file changes\nThe independent hidden verifier is not model-visible."
        },
        {
          "id": "MUT-001:tools",
          "kind": "tool_schemas",
          "content": "[{\"id\":\"mutation.repository.read\",\"description\":\"Read one authorised repository file or a bounded line range. Input: path, optional startLine/endLine.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"startLine\":{\"type\":\"integer\"},\"endLine\":{\"type\":\"integer\"}},\"required\":[\"path\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.search\",\"description\":\"Literal compact repository search. Returns file and line indexes; use read to expand selected files.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"query\":{\"type\":\"string\"},\"paths\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}},\"caseSensitive\":{\"type\":\"boolean\"}},\"required\":[\"query\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.replace\",\"description\":\"Replace an exact string in one task-authorised file. Input oldText/newText and optional expectedOccurrences.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"oldText\":{\"type\":\"string\"},\"newText\":{\"type\":\"string\"},\"expectedOccurrences\":{\"type\":\"integer\"}},\"required\":[\"path\",\"oldText\",\"newText\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.write\",\"description\":\"Write complete bounded content to one task-authorised file. Intended for a new test or a small full-file correction.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"content\":{\"type\":\"string\"}},\"required\":[\"path\",\"content\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.test\",\"description\":\"Run the fixture public Node test suite. It accepts no command, arguments or shell input.\",\"inputSchema\":{\"type\":\"object\",\"additionalProperties\":false}},{\"id\":\"mutation.finish\",\"description\":\"Stop the attempt after testing or when safely blocked. This is not verifier acceptance.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"summary\":{\"type\":\"string\"},\"blocked\":{\"type\":\"boolean\"},\"reason\":{\"type\":\"string\"}},\"additionalProperties\":false}}]"
        },
        {
          "id": "MUT-001:targeted-files",
          "kind": "task_context",
          "content": "FILE src/constants.js\nexport const DEFAULT_JOB_TIMEOUT_MS = 30_000;\n\nexport const JOB_STATES = Object.freeze([\n  'CREATED',\n  'ROUTED',\n  'RUNNING',\n  'VERIFICATION_PENDING',\n  'SUCCEEDED',\n  'FAILED',\n]);\n\nexport const TERMINAL_JOB_STATES = Object.freeze(['SUCCEEDED', 'FAILED']);\n"
        }
      ]
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:07:45.795Z",
      "requestPrefixSha256": "ff3d67f883626dcb107179f10bc39b514e4ed83c0528d5d5541d524ec5534294",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.read\",\n  \"input\": {\n    \"path\": \"src/constants.js\"\n  }\n}\n```",
      "providerResponseId": "chatcmpl-bmvNhzHYU2MXi6C1xKHIH6wU7iUuhnv7",
      "responseModel": "qwen-cache-warm",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1328,
        "completion_tokens": 32,
        "total_tokens": 1360,
        "prompt_tokens_details": {
          "cached_tokens": 0
        }
      },
      "timings": {
        "cache_n": 0,
        "prompt_n": 1328,
        "prompt_ms": 1345.148,
        "prompt_per_token_ms": 1.0129126506024095,
        "prompt_per_second": 987.251960379081,
        "predicted_n": 32,
        "predicted_ms": 600.747,
        "predicted_per_token_ms": 18.77334375,
        "predicted_per_second": 53.267015898539654
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:07:45.801Z",
      "tool": "mutation.repository.read",
      "input": {
        "path": "src/constants.js"
      },
      "output": {
        "path": "src/constants.js",
        "startLine": 1,
        "endLine": 13,
        "totalLines": 13,
        "complete": true,
        "content": "   1 | export const DEFAULT_JOB_TIMEOUT_MS = 30_000;\n   2 | \n   3 | export const JOB_STATES = Object.freeze([\n   4 |   'CREATED',\n   5 |   'ROUTED',\n   6 |   'RUNNING',\n   7 |   'VERIFICATION_PENDING',\n   8 |   'SUCCEEDED',\n   9 |   'FAILED',\n  10 | ]);\n  11 | \n  12 | export const TERMINAL_JOB_STATES = Object.freeze(['SUCCEEDED', 'FAILED']);\n  13 | "
      }
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:07:47.336Z",
      "requestPrefixSha256": "0c8f4a254b4238871e4824bb57898207821c902fd06fbda5c6e04d0b5e608560",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.replace\",\n  \"input\": {\n    \"path\": \"src/constants.js\",\n    \"oldText\": \"30_000\",\n    \"newText\": \"45_000\",\n    \"expectedOccurrences\": 1\n  }\n}\n```",
      "providerResponseId": "chatcmpl-cBZlO1HQN1UF8ZS444hm1llwYXSKKxBd",
      "responseModel": "qwen-cache-warm",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1565,
        "completion_tokens": 66,
        "total_tokens": 1631,
        "prompt_tokens_details": {
          "cached_tokens": 1359
        }
      },
      "timings": {
        "cache_n": 1359,
        "prompt_n": 206,
        "prompt_ms": 254.976,
        "prompt_per_token_ms": 1.237747572815534,
        "prompt_per_second": 807.9191767068273,
        "predicted_n": 66,
        "predicted_ms": 1242.866,
        "predicted_per_token_ms": 18.83130303030303,
        "predicted_per_second": 53.10306984019194
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:07:47.347Z",
      "tool": "mutation.repository.replace",
      "input": {
        "path": "src/constants.js",
        "oldText": "30_000",
        "newText": "45_000",
        "expectedOccurrences": 1
      },
      "output": {
        "ok": true,
        "path": "src/constants.js",
        "occurrences": 1,
        "changedFiles": [
          "src/constants.js"
        ],
        "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
      }
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:07:47.903Z",
      "requestPrefixSha256": "53571c320ea0e8155498c55751996940fe3fdd0a811551a482402d14f5ac056d",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.test\",\n  \"input\": {}\n}\n```",
      "providerResponseId": "chatcmpl-APdutyPjEWYUpQ5qOTnHDz5T1Rhw6ceS",
      "responseModel": "qwen-cache-warm",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1744,
        "completion_tokens": 21,
        "total_tokens": 1765,
        "prompt_tokens_details": {
          "cached_tokens": 1630
        }
      },
      "timings": {
        "cache_n": 1630,
        "prompt_n": 114,
        "prompt_ms": 146.741,
        "prompt_per_token_ms": 1.287201754385965,
        "prompt_per_second": 776.8789908750791,
        "predicted_n": 21,
        "predicted_ms": 382.764,
        "predicted_per_token_ms": 18.226857142857142,
        "predicted_per_second": 54.864093801924945
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:07:48.079Z",
      "tool": "mutation.repository.test",
      "input": {},
      "output": {
        "passed": true,
        "exitCode": 0,
        "timedOut": false,
        "cancelled": false,
        "stdout": "✔ capabilities are normalized and matched (1.815236ms)\n✔ runtime configuration validates bounded values (0.533409ms)\n✔ job transition requires the declared state machine (0.202705ms)\n✔ tool policy fences stale leases and unapproved risks (0.341744ms)\n✔ unknown usage remains null (0.260318ms)\n✔ scheduler selects the least-loaded capable online worker (0.451646ms)\nℹ tests 6\nℹ suites 0\nℹ pass 6\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 102.086336\n",
        "stderr": "",
        "changedFiles": [
          "src/constants.js"
        ],
        "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
      }
    }
  ],
  "invocations": [
    {
      "id": "inv-e0fb7560-3987-4d9f-b814-d6efe2486da6",
      "turnNumber": 1,
      "provider": "local-cache-warm",
      "model": "qwen-cache-warm",
      "startedAt": "2026-09-09T20:07:43.800Z",
      "completedAt": "2026-09-09T20:07:45.797Z",
      "elapsedMs": 1997,
      "usage": {
        "inputTokens": 1328,
        "freshInputTokens": 1328,
        "cachedInputTokens": 0,
        "cacheWriteTokens": null,
        "outputTokens": 32,
        "reasoningTokens": null,
        "totalProcessedTokens": 1360
      },
      "cacheEvidence": {
        "reusedTokens": 0,
        "processedPromptTokens": 1328,
        "cacheWriteTokens": null,
        "promptProcessingMs": 1345.148,
        "generationMs": 600.747,
        "authority": "authoritative",
        "source": "llama.cpp.response.timings",
        "requestPrefixSha256": "ff3d67f883626dcb107179f10bc39b514e4ed83c0528d5d5541d524ec5534294",
        "retainedPromptTokens": 1328,
        "retentionAuthority": "derived",
        "retentionSource": "qualified-llama.cpp-single-slot-cache-prompt"
      },
      "verifierResult": "UNKNOWN",
      "outcome": "COMPLETE"
    },
    {
      "id": "inv-536faa37-a755-41b2-8e4f-c104b2ae5fe0",
      "turnNumber": 2,
      "provider": "local-cache-warm",
      "model": "qwen-cache-warm",
      "startedAt": "2026-09-09T20:07:45.801Z",
      "completedAt": "2026-09-09T20:07:47.337Z",
      "elapsedMs": 1536,
      "usage": {
        "inputTokens": 1565,
        "freshInputTokens": 206,
        "cachedInputTokens": 1359,
        "cacheWriteTokens": null,
        "outputTokens": 66,
        "reasoningTokens": null,
        "totalProcessedTokens": 1631
      },
      "cacheEvidence": {
        "reusedTokens": 1359,
        "processedPromptTokens": 206,
        "cacheWriteTokens": null,
        "promptProcessingMs": 254.976,
        "generationMs": 1242.866,
        "authority": "authoritative",
        "source": "llama.cpp.response.timings",
        "requestPrefixSha256": "0c8f4a254b4238871e4824bb57898207821c902fd06fbda5c6e04d0b5e608560",
        "retainedPromptTokens": 1565,
        "retentionAuthority": "derived",
        "retentionSource": "qualified-llama.cpp-single-slot-cache-prompt"
      },
      "verifierResult": "UNKNOWN",
      "outcome": "COMPLETE"
    },
    {
      "id": "inv-d7c8a949-d752-4a4a-bb15-d4e4090c2def",
      "turnNumber": 3,
      "provider": "local-cache-warm",
      "model": "qwen-cache-warm",
      "startedAt": "2026-09-09T20:07:47.347Z",
      "completedAt": "2026-09-09T20:07:47.903Z",
      "elapsedMs": 556,
      "usage": {
        "inputTokens": 1744,
        "freshInputTokens": 114,
        "cachedInputTokens": 1630,
        "cacheWriteTokens": null,
        "outputTokens": 21,
        "reasoningTokens": null,
        "totalProcessedTokens": 1765
      },
      "cacheEvidence": {
        "reusedTokens": 1630,
        "processedPromptTokens": 114,
        "cacheWriteTokens": null,
        "promptProcessingMs": 146.741,
        "generationMs": 382.764,
        "authority": "authoritative",
        "source": "llama.cpp.response.timings",
        "requestPrefixSha256": "53571c320ea0e8155498c55751996940fe3fdd0a811551a482402d14f5ac056d",
        "retainedPromptTokens": 1744,
        "retentionAuthority": "derived",
        "retentionSource": "qualified-llama.cpp-single-slot-cache-prompt"
      },
      "verifierResult": "UNKNOWN",
      "outcome": "COMPLETE"
    }
  ]
}
```

## Managed evidence artifact-8de9380c-a93e-4920-bd00-4e66cb156f8e

Name: verification-report  
Schema: agent-control.non-openai-cache-verification/v1  
SHA-256: becae8167470df15c9d1a1d5605550eff076ebf9c69654c2466a1190da5bf541

```json
{
  "schema": "agent-control.non-openai-cache-verification/v1",
  "passed": true,
  "taskId": "MUT-001",
  "prefixVariant": "stable",
  "verifier": {
    "schema": "agent-control.mutation-verifier/v1",
    "taskId": "MUT-001",
    "passed": true,
    "startedAt": "2026-09-09T20:07:48.137Z",
    "completedAt": "2026-09-09T20:07:49.112Z",
    "checks": [
      {
        "id": "mutation_present",
        "passed": true,
        "detail": "1 changed file(s)",
        "durationMs": 0.09617199999956938,
        "evidenceIds": [
          "diff_sha256:2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
        ]
      },
      {
        "id": "scope_and_size",
        "passed": true,
        "detail": "1 additions, 1 deletions",
        "durationMs": 0.060234000000491505,
        "evidenceIds": [
          "changed_file:src/constants.js"
        ]
      },
      {
        "id": "git_diff_check",
        "passed": true,
        "detail": "clean whitespace and patch structure",
        "durationMs": 5.450722999999925,
        "evidenceIds": [
          "diff_sha256:2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
        ]
      },
      {
        "id": "javascript_syntax",
        "passed": true,
        "detail": "16 source modules checked",
        "durationMs": 793.6226199999983,
        "evidenceIds": [
          "syntax:node-check"
        ]
      },
      {
        "id": "public_regression_tests",
        "passed": true,
        "detail": "✔ capabilities are normalized and matched (1.892444ms) ✔ runtime configuration validates bounded values (0.641236ms) ✔ job transition requires the declared state machine (0.223965ms) ✔ tool policy fences stale leases and unapproved risks (0.289021ms) ✔ unknown usage remains null (0.262293ms) ✔ scheduler selects the least-loaded capable online worker (0.2376ms) ℹ tests 6 ℹ suites 0 ℹ pass 6 ℹ fail 0 ℹ cancelled 0 ℹ skipped 0 ℹ todo 0 ℹ duration_ms 88.960071",
        "durationMs": 143.63827200000014,
        "evidenceIds": [
          "tests:public-node-test"
        ]
      },
      {
        "id": "hidden_verifier:default-timeout-45s",
        "passed": true,
        "detail": "default timeout is 45000",
        "durationMs": 1.8416099999994913,
        "evidenceIds": [
          "hidden_verifier:default-timeout-45s",
          "diff_sha256:2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
        ]
      },
      {
        "id": "credential_and_topology_scan",
        "passed": true,
        "detail": "no credential or environment-topology pattern in patch",
        "durationMs": 0.4174089999978605,
        "evidenceIds": [
          "scan:bounded-diff"
        ]
      }
    ],
    "changedFiles": [
      "src/constants.js"
    ],
    "addedLines": 1,
    "deletedLines": 1,
    "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107",
    "failureClass": "NONE"
  },
  "patch": "diff --git a/src/constants.js b/src/constants.js\nindex 0971441..a72f5c0 100644\n--- a/src/constants.js\n+++ b/src/constants.js\n@@ -1,4 +1,4 @@\n-export const DEFAULT_JOB_TIMEOUT_MS = 30_000;\n+export const DEFAULT_JOB_TIMEOUT_MS = 45_000;\n \n export const JOB_STATES = Object.freeze([\n   'CREATED',\n",
  "patchSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107",
  "transcript": [
    {
      "type": "initiating-model-request",
      "at": "2026-09-09T20:07:43.797Z",
      "instruction": "CACHE QUALIFICATION PREFIX A.\nExecute mutation task MUT-001 in the current disposable repository using profile THIN. This is an actual repository change, not a prose answer. Inspect before editing, remain inside the allowlisted paths, run the typed public-test tool when practical, then request mutation.finish. ",
      "authorisedContext": [
        {
          "id": "MUT-001:control",
          "kind": "agent_control_instructions",
          "content": "Agent Control retains scheduling, ToolPolicy, leases, ownership, cancellation, human takeover and verifier acceptance. Never modify a file outside the task scope."
        },
        {
          "id": "MUT-001:repository-rules",
          "kind": "repository_instructions",
          "content": "This is a disposable frozen JavaScript repository. Use forward-slash relative paths. Do not edit package metadata unless explicitly allowed. Do not add dependencies, credentials, machine names, network addresses or provider/model conditionals. Existing public tests must continue to pass."
        },
        {
          "id": "MUT-001:system",
          "kind": "system_instructions",
          "content": "Perform a real bounded repository mutation. Inspect evidence, use only typed tools, run public tests when practical, and stop without claiming independent verification."
        },
        {
          "id": "MUT-001:task",
          "kind": "task_context",
          "content": "Task MUT-001 (trivial_bounded_edit)\nChange the governed runtime's default job timeout to 45 seconds without changing any other default or public behavior.\nAllowed mutation paths: src/constants.js\nRequired changed paths: src/constants.js\nAcceptance criteria:\n- default timeout exports 45000 milliseconds\n- public tests pass\n- only the allowed file changes\nThe independent hidden verifier is not model-visible."
        },
        {
          "id": "MUT-001:tools",
          "kind": "tool_schemas",
          "content": "[{\"id\":\"mutation.repository.read\",\"description\":\"Read one authorised repository file or a bounded line range. Input: path, optional startLine/endLine.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"startLine\":{\"type\":\"integer\"},\"endLine\":{\"type\":\"integer\"}},\"required\":[\"path\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.search\",\"description\":\"Literal compact repository search. Returns file and line indexes; use read to expand selected files.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"query\":{\"type\":\"string\"},\"paths\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}},\"caseSensitive\":{\"type\":\"boolean\"}},\"required\":[\"query\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.replace\",\"description\":\"Replace an exact string in one task-authorised file. Input oldText/newText and optional expectedOccurrences.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"oldText\":{\"type\":\"string\"},\"newText\":{\"type\":\"string\"},\"expectedOccurrences\":{\"type\":\"integer\"}},\"required\":[\"path\",\"oldText\",\"newText\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.write\",\"description\":\"Write complete bounded content to one task-authorised file. Intended for a new test or a small full-file correction.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"content\":{\"type\":\"string\"}},\"required\":[\"path\",\"content\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.test\",\"description\":\"Run the fixture public Node test suite. It accepts no command, arguments or shell input.\",\"inputSchema\":{\"type\":\"object\",\"additionalProperties\":false}},{\"id\":\"mutation.finish\",\"description\":\"Stop the attempt after testing or when safely blocked. This is not verifier acceptance.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"summary\":{\"type\":\"string\"},\"blocked\":{\"type\":\"boolean\"},\"reason\":{\"type\":\"string\"}},\"additionalProperties\":false}}]"
        },
        {
          "id": "MUT-001:targeted-files",
          "kind": "task_context",
          "content": "FILE src/constants.js\nexport const DEFAULT_JOB_TIMEOUT_MS = 30_000;\n\nexport const JOB_STATES = Object.freeze([\n  'CREATED',\n  'ROUTED',\n  'RUNNING',\n  'VERIFICATION_PENDING',\n  'SUCCEEDED',\n  'FAILED',\n]);\n\nexport const TERMINAL_JOB_STATES = Object.freeze(['SUCCEEDED', 'FAILED']);\n"
        }
      ]
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:07:45.795Z",
      "requestPrefixSha256": "ff3d67f883626dcb107179f10bc39b514e4ed83c0528d5d5541d524ec5534294",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.read\",\n  \"input\": {\n    \"path\": \"src/constants.js\"\n  }\n}\n```",
      "providerResponseId": "chatcmpl-bmvNhzHYU2MXi6C1xKHIH6wU7iUuhnv7",
      "responseModel": "qwen-cache-warm",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1328,
        "completion_tokens": 32,
        "total_tokens": 1360,
        "prompt_tokens_details": {
          "cached_tokens": 0
        }
      },
      "timings": {
        "cache_n": 0,
        "prompt_n": 1328,
        "prompt_ms": 1345.148,
        "prompt_per_token_ms": 1.0129126506024095,
        "prompt_per_second": 987.251960379081,
        "predicted_n": 32,
        "predicted_ms": 600.747,
        "predicted_per_token_ms": 18.77334375,
        "predicted_per_second": 53.267015898539654
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:07:45.801Z",
      "tool": "mutation.repository.read",
      "input": {
        "path": "src/constants.js"
      },
      "output": {
        "path": "src/constants.js",
        "startLine": 1,
        "endLine": 13,
        "totalLines": 13,
        "complete": true,
        "content": "   1 | export const DEFAULT_JOB_TIMEOUT_MS = 30_000;\n   2 | \n   3 | export const JOB_STATES = Object.freeze([\n   4 |   'CREATED',\n   5 |   'ROUTED',\n   6 |   'RUNNING',\n   7 |   'VERIFICATION_PENDING',\n   8 |   'SUCCEEDED',\n   9 |   'FAILED',\n  10 | ]);\n  11 | \n  12 | export const TERMINAL_JOB_STATES = Object.freeze(['SUCCEEDED', 'FAILED']);\n  13 | "
      }
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:07:47.336Z",
      "requestPrefixSha256": "0c8f4a254b4238871e4824bb57898207821c902fd06fbda5c6e04d0b5e608560",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.replace\",\n  \"input\": {\n    \"path\": \"src/constants.js\",\n    \"oldText\": \"30_000\",\n    \"newText\": \"45_000\",\n    \"expectedOccurrences\": 1\n  }\n}\n```",
      "providerResponseId": "chatcmpl-cBZlO1HQN1UF8ZS444hm1llwYXSKKxBd",
      "responseModel": "qwen-cache-warm",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1565,
        "completion_tokens": 66,
        "total_tokens": 1631,
        "prompt_tokens_details": {
          "cached_tokens": 1359
        }
      },
      "timings": {
        "cache_n": 1359,
        "prompt_n": 206,
        "prompt_ms": 254.976,
        "prompt_per_token_ms": 1.237747572815534,
        "prompt_per_second": 807.9191767068273,
        "predicted_n": 66,
        "predicted_ms": 1242.866,
        "predicted_per_token_ms": 18.83130303030303,
        "predicted_per_second": 53.10306984019194
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:07:47.347Z",
      "tool": "mutation.repository.replace",
      "input": {
        "path": "src/constants.js",
        "oldText": "30_000",
        "newText": "45_000",
        "expectedOccurrences": 1
      },
      "output": {
        "ok": true,
        "path": "src/constants.js",
        "occurrences": 1,
        "changedFiles": [
          "src/constants.js"
        ],
        "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
      }
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:07:47.903Z",
      "requestPrefixSha256": "53571c320ea0e8155498c55751996940fe3fdd0a811551a482402d14f5ac056d",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.test\",\n  \"input\": {}\n}\n```",
      "providerResponseId": "chatcmpl-APdutyPjEWYUpQ5qOTnHDz5T1Rhw6ceS",
      "responseModel": "qwen-cache-warm",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1744,
        "completion_tokens": 21,
        "total_tokens": 1765,
        "prompt_tokens_details": {
          "cached_tokens": 1630
        }
      },
      "timings": {
        "cache_n": 1630,
        "prompt_n": 114,
        "prompt_ms": 146.741,
        "prompt_per_token_ms": 1.287201754385965,
        "prompt_per_second": 776.8789908750791,
        "predicted_n": 21,
        "predicted_ms": 382.764,
        "predicted_per_token_ms": 18.226857142857142,
        "predicted_per_second": 54.864093801924945
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:07:48.079Z",
      "tool": "mutation.repository.test",
      "input": {},
      "output": {
        "passed": true,
        "exitCode": 0,
        "timedOut": false,
        "cancelled": false,
        "stdout": "✔ capabilities are normalized and matched (1.815236ms)\n✔ runtime configuration validates bounded values (0.533409ms)\n✔ job transition requires the declared state machine (0.202705ms)\n✔ tool policy fences stale leases and unapproved risks (0.341744ms)\n✔ unknown usage remains null (0.260318ms)\n✔ scheduler selects the least-loaded capable online worker (0.451646ms)\nℹ tests 6\nℹ suites 0\nℹ pass 6\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 102.086336\n",
        "stderr": "",
        "changedFiles": [
          "src/constants.js"
        ],
        "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
      }
    }
  ]
}
```

## Managed evidence artifact-f8b7bc4e-b794-4ca2-bb82-7abd71223212

Name: mutation-attempt  
Schema: agent-control.non-openai-cache-attempt/v1  
SHA-256: 5ca289bd594602ca7bb3f83c4bf4d960b35488c6997e3cfd8fe3e863ffe718e2

```json
{
  "schema": "agent-control.non-openai-cache-attempt/v1",
  "taskId": "MUT-001",
  "prefixVariant": "stable",
  "fixtureSha256": "d1b5e8ebec19378b5d2112e8be5e73671a51c40bc328af8ded815be44edb6b27",
  "startingRevision": "28713fceeabb6337d1d6a2e341c4ea62e62eb2be",
  "stablePrefixSha256": "ff3d67f883626dcb107179f10bc39b514e4ed83c0528d5d5541d524ec5534294",
  "status": {
    "changedFiles": [
      "src/constants.js"
    ],
    "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
  },
  "counters": {
    "repositoryReads": 1,
    "repositorySearches": 0,
    "mutationsAttempted": 1,
    "verifierFacingTests": 1,
    "toolCalls": 3,
    "toolIds": [
      "mutation.repository.read",
      "mutation.repository.replace",
      "mutation.repository.test"
    ]
  },
  "transcript": [
    {
      "type": "initiating-model-request",
      "at": "2026-09-09T20:07:49.224Z",
      "instruction": "CACHE QUALIFICATION PREFIX A.\nExecute mutation task MUT-001 in the current disposable repository using profile THIN. This is an actual repository change, not a prose answer. Inspect before editing, remain inside the allowlisted paths, run the typed public-test tool when practical, then request mutation.finish. ",
      "authorisedContext": [
        {
          "id": "MUT-001:control",
          "kind": "agent_control_instructions",
          "content": "Agent Control retains scheduling, ToolPolicy, leases, ownership, cancellation, human takeover and verifier acceptance. Never modify a file outside the task scope."
        },
        {
          "id": "MUT-001:repository-rules",
          "kind": "repository_instructions",
          "content": "This is a disposable frozen JavaScript repository. Use forward-slash relative paths. Do not edit package metadata unless explicitly allowed. Do not add dependencies, credentials, machine names, network addresses or provider/model conditionals. Existing public tests must continue to pass."
        },
        {
          "id": "MUT-001:system",
          "kind": "system_instructions",
          "content": "Perform a real bounded repository mutation. Inspect evidence, use only typed tools, run public tests when practical, and stop without claiming independent verification."
        },
        {
          "id": "MUT-001:task",
          "kind": "task_context",
          "content": "Task MUT-001 (trivial_bounded_edit)\nChange the governed runtime's default job timeout to 45 seconds without changing any other default or public behavior.\nAllowed mutation paths: src/constants.js\nRequired changed paths: src/constants.js\nAcceptance criteria:\n- default timeout exports 45000 milliseconds\n- public tests pass\n- only the allowed file changes\nThe independent hidden verifier is not model-visible."
        },
        {
          "id": "MUT-001:tools",
          "kind": "tool_schemas",
          "content": "[{\"id\":\"mutation.repository.read\",\"description\":\"Read one authorised repository file or a bounded line range. Input: path, optional startLine/endLine.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"startLine\":{\"type\":\"integer\"},\"endLine\":{\"type\":\"integer\"}},\"required\":[\"path\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.search\",\"description\":\"Literal compact repository search. Returns file and line indexes; use read to expand selected files.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"query\":{\"type\":\"string\"},\"paths\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}},\"caseSensitive\":{\"type\":\"boolean\"}},\"required\":[\"query\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.replace\",\"description\":\"Replace an exact string in one task-authorised file. Input oldText/newText and optional expectedOccurrences.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"oldText\":{\"type\":\"string\"},\"newText\":{\"type\":\"string\"},\"expectedOccurrences\":{\"type\":\"integer\"}},\"required\":[\"path\",\"oldText\",\"newText\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.write\",\"description\":\"Write complete bounded content to one task-authorised file. Intended for a new test or a small full-file correction.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"content\":{\"type\":\"string\"}},\"required\":[\"path\",\"content\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.test\",\"description\":\"Run the fixture public Node test suite. It accepts no command, arguments or shell input.\",\"inputSchema\":{\"type\":\"object\",\"additionalProperties\":false}},{\"id\":\"mutation.finish\",\"description\":\"Stop the attempt after testing or when safely blocked. This is not verifier acceptance.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"summary\":{\"type\":\"string\"},\"blocked\":{\"type\":\"boolean\"},\"reason\":{\"type\":\"string\"}},\"additionalProperties\":false}}]"
        },
        {
          "id": "MUT-001:targeted-files",
          "kind": "task_context",
          "content": "FILE src/constants.js\nexport const DEFAULT_JOB_TIMEOUT_MS = 30_000;\n\nexport const JOB_STATES = Object.freeze([\n  'CREATED',\n  'ROUTED',\n  'RUNNING',\n  'VERIFICATION_PENDING',\n  'SUCCEEDED',\n  'FAILED',\n]);\n\nexport const TERMINAL_JOB_STATES = Object.freeze(['SUCCEEDED', 'FAILED']);\n"
        }
      ]
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:07:49.860Z",
      "requestPrefixSha256": "ff3d67f883626dcb107179f10bc39b514e4ed83c0528d5d5541d524ec5534294",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.read\",\n  \"input\": {\n    \"path\": \"src/constants.js\"\n  }\n}\n```",
      "providerResponseId": "chatcmpl-FnuWaZxFTmUPe5uU534A9wEGsqQGiC5o",
      "responseModel": "qwen-cache-warm",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1328,
        "completion_tokens": 32,
        "total_tokens": 1360,
        "prompt_tokens_details": {
          "cached_tokens": 1327
        }
      },
      "timings": {
        "cache_n": 1327,
        "prompt_n": 1,
        "prompt_ms": 20.261,
        "prompt_per_token_ms": 20.261,
        "prompt_per_second": 49.35590543408519,
        "predicted_n": 32,
        "predicted_ms": 594.274,
        "predicted_per_token_ms": 18.5710625,
        "predicted_per_second": 53.84721525760844
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:07:49.861Z",
      "tool": "mutation.repository.read",
      "input": {
        "path": "src/constants.js"
      },
      "output": {
        "path": "src/constants.js",
        "startLine": 1,
        "endLine": 13,
        "totalLines": 13,
        "complete": true,
        "content": "   1 | export const DEFAULT_JOB_TIMEOUT_MS = 30_000;\n   2 | \n   3 | export const JOB_STATES = Object.freeze([\n   4 |   'CREATED',\n   5 |   'ROUTED',\n   6 |   'RUNNING',\n   7 |   'VERIFICATION_PENDING',\n   8 |   'SUCCEEDED',\n   9 |   'FAILED',\n  10 | ]);\n  11 | \n  12 | export const TERMINAL_JOB_STATES = Object.freeze(['SUCCEEDED', 'FAILED']);\n  13 | "
      }
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:07:51.372Z",
      "requestPrefixSha256": "0c8f4a254b4238871e4824bb57898207821c902fd06fbda5c6e04d0b5e608560",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.replace\",\n  \"input\": {\n    \"path\": \"src/constants.js\",\n    \"oldText\": \"30_000\",\n    \"newText\": \"45_000\",\n    \"expectedOccurrences\": 1\n  }\n}\n```",
      "providerResponseId": "chatcmpl-TUVHSc6qFIKxB90csVJBJn3gC5dSJtkb",
      "responseModel": "qwen-cache-warm",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1565,
        "completion_tokens": 66,
        "total_tokens": 1631,
        "prompt_tokens_details": {
          "cached_tokens": 1359
        }
      },
      "timings": {
        "cache_n": 1359,
        "prompt_n": 206,
        "prompt_ms": 257.5,
        "prompt_per_token_ms": 1.25,
        "prompt_per_second": 800,
        "predicted_n": 66,
        "predicted_ms": 1234.331,
        "predicted_per_token_ms": 18.701984848484848,
        "predicted_per_second": 53.470260408269745
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:07:51.383Z",
      "tool": "mutation.repository.replace",
      "input": {
        "path": "src/constants.js",
        "oldText": "30_000",
        "newText": "45_000",
        "expectedOccurrences": 1
      },
      "output": {
        "ok": true,
        "path": "src/constants.js",
        "occurrences": 1,
        "changedFiles": [
          "src/constants.js"
        ],
        "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
      }
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:07:51.926Z",
      "requestPrefixSha256": "53571c320ea0e8155498c55751996940fe3fdd0a811551a482402d14f5ac056d",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.test\",\n  \"input\": {}\n}\n```",
      "providerResponseId": "chatcmpl-i7bZvwLcLBN1uxK1pKxYtUu9ARXLExug",
      "responseModel": "qwen-cache-warm",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1744,
        "completion_tokens": 21,
        "total_tokens": 1765,
        "prompt_tokens_details": {
          "cached_tokens": 1630
        }
      },
      "timings": {
        "cache_n": 1630,
        "prompt_n": 114,
        "prompt_ms": 145.391,
        "prompt_per_token_ms": 1.275359649122807,
        "prompt_per_second": 784.0925504329705,
        "predicted_n": 21,
        "predicted_ms": 379.592,
        "predicted_per_token_ms": 18.07580952380952,
        "predicted_per_second": 55.32255685051318
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:07:52.074Z",
      "tool": "mutation.repository.test",
      "input": {},
      "output": {
        "passed": true,
        "exitCode": 0,
        "timedOut": false,
        "cancelled": false,
        "stdout": "✔ capabilities are normalized and matched (1.889425ms)\n✔ runtime configuration validates bounded values (0.753347ms)\n✔ job transition requires the declared state machine (0.245119ms)\n✔ tool policy fences stale leases and unapproved risks (0.276428ms)\n✔ unknown usage remains null (0.243996ms)\n✔ scheduler selects the least-loaded capable online worker (0.315469ms)\nℹ tests 6\nℹ suites 0\nℹ pass 6\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 90.803675\n",
        "stderr": "",
        "changedFiles": [
          "src/constants.js"
        ],
        "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
      }
    }
  ],
  "invocations": [
    {
      "id": "inv-4c1591a6-95a8-4976-aace-41bc96c8ca63",
      "turnNumber": 1,
      "provider": "local-cache-warm",
      "model": "qwen-cache-warm",
      "startedAt": "2026-09-09T20:07:49.224Z",
      "completedAt": "2026-09-09T20:07:49.860Z",
      "elapsedMs": 636,
      "usage": {
        "inputTokens": 1328,
        "freshInputTokens": 1,
        "cachedInputTokens": 1327,
        "cacheWriteTokens": null,
        "outputTokens": 32,
        "reasoningTokens": null,
        "totalProcessedTokens": 1360
      },
      "cacheEvidence": {
        "reusedTokens": 1327,
        "processedPromptTokens": 1,
        "cacheWriteTokens": null,
        "promptProcessingMs": 20.261,
        "generationMs": 594.274,
        "authority": "authoritative",
        "source": "llama.cpp.response.timings",
        "requestPrefixSha256": "ff3d67f883626dcb107179f10bc39b514e4ed83c0528d5d5541d524ec5534294",
        "retainedPromptTokens": 1328,
        "retentionAuthority": "derived",
        "retentionSource": "qualified-llama.cpp-single-slot-cache-prompt"
      },
      "verifierResult": "UNKNOWN",
      "outcome": "COMPLETE"
    },
    {
      "id": "inv-26f92919-7abd-4b75-90c9-af64a1fabc5f",
      "turnNumber": 2,
      "provider": "local-cache-warm",
      "model": "qwen-cache-warm",
      "startedAt": "2026-09-09T20:07:49.861Z",
      "completedAt": "2026-09-09T20:07:51.373Z",
      "elapsedMs": 1512,
      "usage": {
        "inputTokens": 1565,
        "freshInputTokens": 206,
        "cachedInputTokens": 1359,
        "cacheWriteTokens": null,
        "outputTokens": 66,
        "reasoningTokens": null,
        "totalProcessedTokens": 1631
      },
      "cacheEvidence": {
        "reusedTokens": 1359,
        "processedPromptTokens": 206,
        "cacheWriteTokens": null,
        "promptProcessingMs": 257.5,
        "generationMs": 1234.331,
        "authority": "authoritative",
        "source": "llama.cpp.response.timings",
        "requestPrefixSha256": "0c8f4a254b4238871e4824bb57898207821c902fd06fbda5c6e04d0b5e608560",
        "retainedPromptTokens": 1565,
        "retentionAuthority": "derived",
        "retentionSource": "qualified-llama.cpp-single-slot-cache-prompt"
      },
      "verifierResult": "UNKNOWN",
      "outcome": "COMPLETE"
    },
    {
      "id": "inv-22b4e124-1bd8-423f-a21d-1ab3960f3408",
      "turnNumber": 3,
      "provider": "local-cache-warm",
      "model": "qwen-cache-warm",
      "startedAt": "2026-09-09T20:07:51.383Z",
      "completedAt": "2026-09-09T20:07:51.927Z",
      "elapsedMs": 544,
      "usage": {
        "inputTokens": 1744,
        "freshInputTokens": 114,
        "cachedInputTokens": 1630,
        "cacheWriteTokens": null,
        "outputTokens": 21,
        "reasoningTokens": null,
        "totalProcessedTokens": 1765
      },
      "cacheEvidence": {
        "reusedTokens": 1630,
        "processedPromptTokens": 114,
        "cacheWriteTokens": null,
        "promptProcessingMs": 145.391,
        "generationMs": 379.592,
        "authority": "authoritative",
        "source": "llama.cpp.response.timings",
        "requestPrefixSha256": "53571c320ea0e8155498c55751996940fe3fdd0a811551a482402d14f5ac056d",
        "retainedPromptTokens": 1744,
        "retentionAuthority": "derived",
        "retentionSource": "qualified-llama.cpp-single-slot-cache-prompt"
      },
      "verifierResult": "UNKNOWN",
      "outcome": "COMPLETE"
    }
  ]
}
```

## Managed evidence artifact-524cf0cc-d3a6-4ae7-b704-759510917252

Name: verification-report  
Schema: agent-control.non-openai-cache-verification/v1  
SHA-256: 0f9167483b99e6f03469529de678b89be982f8b9f2c5524869f075ea3c1709e6

```json
{
  "schema": "agent-control.non-openai-cache-verification/v1",
  "passed": true,
  "taskId": "MUT-001",
  "prefixVariant": "stable",
  "verifier": {
    "schema": "agent-control.mutation-verifier/v1",
    "taskId": "MUT-001",
    "passed": true,
    "startedAt": "2026-09-09T20:07:52.126Z",
    "completedAt": "2026-09-09T20:07:53.044Z",
    "checks": [
      {
        "id": "mutation_present",
        "passed": true,
        "detail": "1 changed file(s)",
        "durationMs": 0.030236999999033287,
        "evidenceIds": [
          "diff_sha256:2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
        ]
      },
      {
        "id": "scope_and_size",
        "passed": true,
        "detail": "1 additions, 1 deletions",
        "durationMs": 0.01906800000142539,
        "evidenceIds": [
          "changed_file:src/constants.js"
        ]
      },
      {
        "id": "git_diff_check",
        "passed": true,
        "detail": "clean whitespace and patch structure",
        "durationMs": 27.798147000001336,
        "evidenceIds": [
          "diff_sha256:2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
        ]
      },
      {
        "id": "javascript_syntax",
        "passed": true,
        "detail": "16 source modules checked",
        "durationMs": 731.0780610000002,
        "evidenceIds": [
          "syntax:node-check"
        ]
      },
      {
        "id": "public_regression_tests",
        "passed": true,
        "detail": "✔ capabilities are normalized and matched (1.69328ms) ✔ runtime configuration validates bounded values (0.563018ms) ✔ job transition requires the declared state machine (0.223515ms) ✔ tool policy fences stale leases and unapproved risks (0.260032ms) ✔ unknown usage remains null (0.275093ms) ✔ scheduler selects the least-loaded capable online worker (0.223104ms) ℹ tests 6 ℹ suites 0 ℹ pass 6 ℹ fail 0 ℹ cancelled 0 ℹ skipped 0 ℹ todo 0 ℹ duration_ms 89.057664",
        "durationMs": 143.99639200000092,
        "evidenceIds": [
          "tests:public-node-test"
        ]
      },
      {
        "id": "hidden_verifier:default-timeout-45s",
        "passed": true,
        "detail": "default timeout is 45000",
        "durationMs": 0.9335820000014792,
        "evidenceIds": [
          "hidden_verifier:default-timeout-45s",
          "diff_sha256:2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
        ]
      },
      {
        "id": "credential_and_topology_scan",
        "passed": true,
        "detail": "no credential or environment-topology pattern in patch",
        "durationMs": 0.23725699999704375,
        "evidenceIds": [
          "scan:bounded-diff"
        ]
      }
    ],
    "changedFiles": [
      "src/constants.js"
    ],
    "addedLines": 1,
    "deletedLines": 1,
    "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107",
    "failureClass": "NONE"
  },
  "patch": "diff --git a/src/constants.js b/src/constants.js\nindex 0971441..a72f5c0 100644\n--- a/src/constants.js\n+++ b/src/constants.js\n@@ -1,4 +1,4 @@\n-export const DEFAULT_JOB_TIMEOUT_MS = 30_000;\n+export const DEFAULT_JOB_TIMEOUT_MS = 45_000;\n \n export const JOB_STATES = Object.freeze([\n   'CREATED',\n",
  "patchSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107",
  "transcript": [
    {
      "type": "initiating-model-request",
      "at": "2026-09-09T20:07:49.224Z",
      "instruction": "CACHE QUALIFICATION PREFIX A.\nExecute mutation task MUT-001 in the current disposable repository using profile THIN. This is an actual repository change, not a prose answer. Inspect before editing, remain inside the allowlisted paths, run the typed public-test tool when practical, then request mutation.finish. ",
      "authorisedContext": [
        {
          "id": "MUT-001:control",
          "kind": "agent_control_instructions",
          "content": "Agent Control retains scheduling, ToolPolicy, leases, ownership, cancellation, human takeover and verifier acceptance. Never modify a file outside the task scope."
        },
        {
          "id": "MUT-001:repository-rules",
          "kind": "repository_instructions",
          "content": "This is a disposable frozen JavaScript repository. Use forward-slash relative paths. Do not edit package metadata unless explicitly allowed. Do not add dependencies, credentials, machine names, network addresses or provider/model conditionals. Existing public tests must continue to pass."
        },
        {
          "id": "MUT-001:system",
          "kind": "system_instructions",
          "content": "Perform a real bounded repository mutation. Inspect evidence, use only typed tools, run public tests when practical, and stop without claiming independent verification."
        },
        {
          "id": "MUT-001:task",
          "kind": "task_context",
          "content": "Task MUT-001 (trivial_bounded_edit)\nChange the governed runtime's default job timeout to 45 seconds without changing any other default or public behavior.\nAllowed mutation paths: src/constants.js\nRequired changed paths: src/constants.js\nAcceptance criteria:\n- default timeout exports 45000 milliseconds\n- public tests pass\n- only the allowed file changes\nThe independent hidden verifier is not model-visible."
        },
        {
          "id": "MUT-001:tools",
          "kind": "tool_schemas",
          "content": "[{\"id\":\"mutation.repository.read\",\"description\":\"Read one authorised repository file or a bounded line range. Input: path, optional startLine/endLine.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"startLine\":{\"type\":\"integer\"},\"endLine\":{\"type\":\"integer\"}},\"required\":[\"path\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.search\",\"description\":\"Literal compact repository search. Returns file and line indexes; use read to expand selected files.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"query\":{\"type\":\"string\"},\"paths\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}},\"caseSensitive\":{\"type\":\"boolean\"}},\"required\":[\"query\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.replace\",\"description\":\"Replace an exact string in one task-authorised file. Input oldText/newText and optional expectedOccurrences.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"oldText\":{\"type\":\"string\"},\"newText\":{\"type\":\"string\"},\"expectedOccurrences\":{\"type\":\"integer\"}},\"required\":[\"path\",\"oldText\",\"newText\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.write\",\"description\":\"Write complete bounded content to one task-authorised file. Intended for a new test or a small full-file correction.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"content\":{\"type\":\"string\"}},\"required\":[\"path\",\"content\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.test\",\"description\":\"Run the fixture public Node test suite. It accepts no command, arguments or shell input.\",\"inputSchema\":{\"type\":\"object\",\"additionalProperties\":false}},{\"id\":\"mutation.finish\",\"description\":\"Stop the attempt after testing or when safely blocked. This is not verifier acceptance.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"summary\":{\"type\":\"string\"},\"blocked\":{\"type\":\"boolean\"},\"reason\":{\"type\":\"string\"}},\"additionalProperties\":false}}]"
        },
        {
          "id": "MUT-001:targeted-files",
          "kind": "task_context",
          "content": "FILE src/constants.js\nexport const DEFAULT_JOB_TIMEOUT_MS = 30_000;\n\nexport const JOB_STATES = Object.freeze([\n  'CREATED',\n  'ROUTED',\n  'RUNNING',\n  'VERIFICATION_PENDING',\n  'SUCCEEDED',\n  'FAILED',\n]);\n\nexport const TERMINAL_JOB_STATES = Object.freeze(['SUCCEEDED', 'FAILED']);\n"
        }
      ]
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:07:49.860Z",
      "requestPrefixSha256": "ff3d67f883626dcb107179f10bc39b514e4ed83c0528d5d5541d524ec5534294",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.read\",\n  \"input\": {\n    \"path\": \"src/constants.js\"\n  }\n}\n```",
      "providerResponseId": "chatcmpl-FnuWaZxFTmUPe5uU534A9wEGsqQGiC5o",
      "responseModel": "qwen-cache-warm",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1328,
        "completion_tokens": 32,
        "total_tokens": 1360,
        "prompt_tokens_details": {
          "cached_tokens": 1327
        }
      },
      "timings": {
        "cache_n": 1327,
        "prompt_n": 1,
        "prompt_ms": 20.261,
        "prompt_per_token_ms": 20.261,
        "prompt_per_second": 49.35590543408519,
        "predicted_n": 32,
        "predicted_ms": 594.274,
        "predicted_per_token_ms": 18.5710625,
        "predicted_per_second": 53.84721525760844
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:07:49.861Z",
      "tool": "mutation.repository.read",
      "input": {
        "path": "src/constants.js"
      },
      "output": {
        "path": "src/constants.js",
        "startLine": 1,
        "endLine": 13,
        "totalLines": 13,
        "complete": true,
        "content": "   1 | export const DEFAULT_JOB_TIMEOUT_MS = 30_000;\n   2 | \n   3 | export const JOB_STATES = Object.freeze([\n   4 |   'CREATED',\n   5 |   'ROUTED',\n   6 |   'RUNNING',\n   7 |   'VERIFICATION_PENDING',\n   8 |   'SUCCEEDED',\n   9 |   'FAILED',\n  10 | ]);\n  11 | \n  12 | export const TERMINAL_JOB_STATES = Object.freeze(['SUCCEEDED', 'FAILED']);\n  13 | "
      }
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:07:51.372Z",
      "requestPrefixSha256": "0c8f4a254b4238871e4824bb57898207821c902fd06fbda5c6e04d0b5e608560",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.replace\",\n  \"input\": {\n    \"path\": \"src/constants.js\",\n    \"oldText\": \"30_000\",\n    \"newText\": \"45_000\",\n    \"expectedOccurrences\": 1\n  }\n}\n```",
      "providerResponseId": "chatcmpl-TUVHSc6qFIKxB90csVJBJn3gC5dSJtkb",
      "responseModel": "qwen-cache-warm",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1565,
        "completion_tokens": 66,
        "total_tokens": 1631,
        "prompt_tokens_details": {
          "cached_tokens": 1359
        }
      },
      "timings": {
        "cache_n": 1359,
        "prompt_n": 206,
        "prompt_ms": 257.5,
        "prompt_per_token_ms": 1.25,
        "prompt_per_second": 800,
        "predicted_n": 66,
        "predicted_ms": 1234.331,
        "predicted_per_token_ms": 18.701984848484848,
        "predicted_per_second": 53.470260408269745
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:07:51.383Z",
      "tool": "mutation.repository.replace",
      "input": {
        "path": "src/constants.js",
        "oldText": "30_000",
        "newText": "45_000",
        "expectedOccurrences": 1
      },
      "output": {
        "ok": true,
        "path": "src/constants.js",
        "occurrences": 1,
        "changedFiles": [
          "src/constants.js"
        ],
        "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
      }
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:07:51.926Z",
      "requestPrefixSha256": "53571c320ea0e8155498c55751996940fe3fdd0a811551a482402d14f5ac056d",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.test\",\n  \"input\": {}\n}\n```",
      "providerResponseId": "chatcmpl-i7bZvwLcLBN1uxK1pKxYtUu9ARXLExug",
      "responseModel": "qwen-cache-warm",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1744,
        "completion_tokens": 21,
        "total_tokens": 1765,
        "prompt_tokens_details": {
          "cached_tokens": 1630
        }
      },
      "timings": {
        "cache_n": 1630,
        "prompt_n": 114,
        "prompt_ms": 145.391,
        "prompt_per_token_ms": 1.275359649122807,
        "prompt_per_second": 784.0925504329705,
        "predicted_n": 21,
        "predicted_ms": 379.592,
        "predicted_per_token_ms": 18.07580952380952,
        "predicted_per_second": 55.32255685051318
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:07:52.074Z",
      "tool": "mutation.repository.test",
      "input": {},
      "output": {
        "passed": true,
        "exitCode": 0,
        "timedOut": false,
        "cancelled": false,
        "stdout": "✔ capabilities are normalized and matched (1.889425ms)\n✔ runtime configuration validates bounded values (0.753347ms)\n✔ job transition requires the declared state machine (0.245119ms)\n✔ tool policy fences stale leases and unapproved risks (0.276428ms)\n✔ unknown usage remains null (0.243996ms)\n✔ scheduler selects the least-loaded capable online worker (0.315469ms)\nℹ tests 6\nℹ suites 0\nℹ pass 6\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 90.803675\n",
        "stderr": "",
        "changedFiles": [
          "src/constants.js"
        ],
        "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
      }
    }
  ]
}
```

## Managed evidence artifact-3a9d1f05-fe7b-4f03-8148-e6e87d23da1a

Name: mutation-attempt  
Schema: agent-control.non-openai-cache-attempt/v1  
SHA-256: 75b78bf8b31992b525f7b69cac9e74039029e9ea9d18942dc9cc157d66334ee1

```json
{
  "schema": "agent-control.non-openai-cache-attempt/v1",
  "taskId": "MUT-001",
  "prefixVariant": "changed-prefix-control",
  "fixtureSha256": "d1b5e8ebec19378b5d2112e8be5e73671a51c40bc328af8ded815be44edb6b27",
  "startingRevision": "f8e3232e477732cf487d915d1d38afea3cb3a801",
  "stablePrefixSha256": "83dcf06c0aa063bca22575e1adf8f719c0e70c2717f3566ad5def1e364fe2826",
  "status": {
    "changedFiles": [
      "src/constants.js"
    ],
    "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
  },
  "counters": {
    "repositoryReads": 1,
    "repositorySearches": 0,
    "mutationsAttempted": 1,
    "verifierFacingTests": 1,
    "toolCalls": 3,
    "toolIds": [
      "mutation.repository.read",
      "mutation.repository.replace",
      "mutation.repository.test"
    ]
  },
  "transcript": [
    {
      "type": "initiating-model-request",
      "at": "2026-09-09T20:07:53.157Z",
      "instruction": "NEGATIVE CONTROL PREFIX B: intentionally changed before the stable task sequence.\nExecute mutation task MUT-001 in the current disposable repository using profile THIN. This is an actual repository change, not a prose answer. Inspect before editing, remain inside the allowlisted paths, run the typed public-test tool when practical, then request mutation.finish. ",
      "authorisedContext": [
        {
          "id": "MUT-001:control",
          "kind": "agent_control_instructions",
          "content": "Agent Control retains scheduling, ToolPolicy, leases, ownership, cancellation, human takeover and verifier acceptance. Never modify a file outside the task scope."
        },
        {
          "id": "MUT-001:repository-rules",
          "kind": "repository_instructions",
          "content": "This is a disposable frozen JavaScript repository. Use forward-slash relative paths. Do not edit package metadata unless explicitly allowed. Do not add dependencies, credentials, machine names, network addresses or provider/model conditionals. Existing public tests must continue to pass."
        },
        {
          "id": "MUT-001:system",
          "kind": "system_instructions",
          "content": "Perform a real bounded repository mutation. Inspect evidence, use only typed tools, run public tests when practical, and stop without claiming independent verification."
        },
        {
          "id": "MUT-001:task",
          "kind": "task_context",
          "content": "Task MUT-001 (trivial_bounded_edit)\nChange the governed runtime's default job timeout to 45 seconds without changing any other default or public behavior.\nAllowed mutation paths: src/constants.js\nRequired changed paths: src/constants.js\nAcceptance criteria:\n- default timeout exports 45000 milliseconds\n- public tests pass\n- only the allowed file changes\nThe independent hidden verifier is not model-visible."
        },
        {
          "id": "MUT-001:tools",
          "kind": "tool_schemas",
          "content": "[{\"id\":\"mutation.repository.read\",\"description\":\"Read one authorised repository file or a bounded line range. Input: path, optional startLine/endLine.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"startLine\":{\"type\":\"integer\"},\"endLine\":{\"type\":\"integer\"}},\"required\":[\"path\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.search\",\"description\":\"Literal compact repository search. Returns file and line indexes; use read to expand selected files.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"query\":{\"type\":\"string\"},\"paths\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}},\"caseSensitive\":{\"type\":\"boolean\"}},\"required\":[\"query\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.replace\",\"description\":\"Replace an exact string in one task-authorised file. Input oldText/newText and optional expectedOccurrences.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"oldText\":{\"type\":\"string\"},\"newText\":{\"type\":\"string\"},\"expectedOccurrences\":{\"type\":\"integer\"}},\"required\":[\"path\",\"oldText\",\"newText\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.write\",\"description\":\"Write complete bounded content to one task-authorised file. Intended for a new test or a small full-file correction.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"content\":{\"type\":\"string\"}},\"required\":[\"path\",\"content\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.test\",\"description\":\"Run the fixture public Node test suite. It accepts no command, arguments or shell input.\",\"inputSchema\":{\"type\":\"object\",\"additionalProperties\":false}},{\"id\":\"mutation.finish\",\"description\":\"Stop the attempt after testing or when safely blocked. This is not verifier acceptance.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"summary\":{\"type\":\"string\"},\"blocked\":{\"type\":\"boolean\"},\"reason\":{\"type\":\"string\"}},\"additionalProperties\":false}}]"
        },
        {
          "id": "MUT-001:targeted-files",
          "kind": "task_context",
          "content": "FILE src/constants.js\nexport const DEFAULT_JOB_TIMEOUT_MS = 30_000;\n\nexport const JOB_STATES = Object.freeze([\n  'CREATED',\n  'ROUTED',\n  'RUNNING',\n  'VERIFICATION_PENDING',\n  'SUCCEEDED',\n  'FAILED',\n]);\n\nexport const TERMINAL_JOB_STATES = Object.freeze(['SUCCEEDED', 'FAILED']);\n"
        }
      ]
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:07:55.382Z",
      "requestPrefixSha256": "83dcf06c0aa063bca22575e1adf8f719c0e70c2717f3566ad5def1e364fe2826",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.read\",\n  \"input\": {\n    \"path\": \"src/constants.js\",\n    \"startLine\": 1,\n    \"endLine\": 1\n  }\n}\n```",
      "providerResponseId": "chatcmpl-hFcvPLGasjn05j0aFloDMtPs6WI9yr1m",
      "responseModel": "qwen-cache-cold",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1336,
        "completion_tokens": 48,
        "total_tokens": 1384,
        "prompt_tokens_details": {
          "cached_tokens": 0
        }
      },
      "timings": {
        "cache_n": 0,
        "prompt_n": 1336,
        "prompt_ms": 1307.101,
        "prompt_per_token_ms": 0.978369011976048,
        "prompt_per_second": 1022.109232568868,
        "predicted_n": 48,
        "predicted_ms": 893.31,
        "predicted_per_token_ms": 18.610625,
        "predicted_per_second": 53.73274675084798
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:07:55.386Z",
      "tool": "mutation.repository.read",
      "input": {
        "path": "src/constants.js",
        "startLine": 1,
        "endLine": 1
      },
      "output": {
        "path": "src/constants.js",
        "startLine": 1,
        "endLine": 1,
        "totalLines": 13,
        "complete": false,
        "content": "   1 | export const DEFAULT_JOB_TIMEOUT_MS = 30_000;"
      }
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:07:56.768Z",
      "requestPrefixSha256": "f7898faf9ce4cae59f60a1cd70a952d3dffc0b9088008b71bbb9b357a33bed13",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.replace\",\n  \"input\": {\n    \"path\": \"src/constants.js\",\n    \"oldText\": \"30_000\",\n    \"newText\": \"45_000\",\n    \"expectedOccurrences\": 1\n  }\n}\n```",
      "providerResponseId": "chatcmpl-nuge1Jr2jYmgN9mptCsads5B23W7GfIz",
      "responseModel": "qwen-cache-cold",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1459,
        "completion_tokens": 66,
        "total_tokens": 1525,
        "prompt_tokens_details": {
          "cached_tokens": 1383
        }
      },
      "timings": {
        "cache_n": 1383,
        "prompt_n": 76,
        "prompt_ms": 117.282,
        "prompt_per_token_ms": 1.5431842105263158,
        "prompt_per_second": 648.0107774424038,
        "predicted_n": 66,
        "predicted_ms": 1237.606,
        "predicted_per_token_ms": 18.75160606060606,
        "predicted_per_second": 53.32876537444066
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:07:56.781Z",
      "tool": "mutation.repository.replace",
      "input": {
        "path": "src/constants.js",
        "oldText": "30_000",
        "newText": "45_000",
        "expectedOccurrences": 1
      },
      "output": {
        "ok": true,
        "path": "src/constants.js",
        "occurrences": 1,
        "changedFiles": [
          "src/constants.js"
        ],
        "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
      }
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:07:57.327Z",
      "requestPrefixSha256": "27954b0a63c80828c4ca04a0fa97719ce5bdf70724164ff1fdd8e7155b937d6e",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.test\",\n  \"input\": {}\n}\n```",
      "providerResponseId": "chatcmpl-cOemIAPiDtbyAsLsBKN7Xh5eswFijcrn",
      "responseModel": "qwen-cache-cold",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1638,
        "completion_tokens": 21,
        "total_tokens": 1659,
        "prompt_tokens_details": {
          "cached_tokens": 1524
        }
      },
      "timings": {
        "cache_n": 1524,
        "prompt_n": 114,
        "prompt_ms": 144.992,
        "prompt_per_token_ms": 1.271859649122807,
        "prompt_per_second": 786.2502758772898,
        "predicted_n": 21,
        "predicted_ms": 380.852,
        "predicted_per_token_ms": 18.135809523809524,
        "predicted_per_second": 55.139529265961585
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:07:57.470Z",
      "tool": "mutation.repository.test",
      "input": {},
      "output": {
        "passed": true,
        "exitCode": 0,
        "timedOut": false,
        "cancelled": false,
        "stdout": "✔ capabilities are normalized and matched (1.644055ms)\n✔ runtime configuration validates bounded values (0.556661ms)\n✔ job transition requires the declared state machine (0.196229ms)\n✔ tool policy fences stale leases and unapproved risks (0.274303ms)\n✔ unknown usage remains null (0.324023ms)\n✔ scheduler selects the least-loaded capable online worker (0.247536ms)\nℹ tests 6\nℹ suites 0\nℹ pass 6\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 83.196818\n",
        "stderr": "",
        "changedFiles": [
          "src/constants.js"
        ],
        "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
      }
    }
  ],
  "invocations": [
    {
      "id": "inv-ec03d154-0c8e-4069-a998-19d8284441a2",
      "turnNumber": 1,
      "provider": "local-cache-cold",
      "model": "qwen-cache-cold",
      "startedAt": "2026-09-09T20:07:53.157Z",
      "completedAt": "2026-09-09T20:07:55.384Z",
      "elapsedMs": 2227,
      "usage": {
        "inputTokens": 1336,
        "freshInputTokens": 1336,
        "cachedInputTokens": 0,
        "cacheWriteTokens": null,
        "outputTokens": 48,
        "reasoningTokens": null,
        "totalProcessedTokens": 1384
      },
      "cacheEvidence": {
        "reusedTokens": 0,
        "processedPromptTokens": 1336,
        "cacheWriteTokens": null,
        "promptProcessingMs": 1307.101,
        "generationMs": 893.31,
        "authority": "authoritative",
        "source": "llama.cpp.response.timings",
        "requestPrefixSha256": "83dcf06c0aa063bca22575e1adf8f719c0e70c2717f3566ad5def1e364fe2826",
        "retainedPromptTokens": 1336,
        "retentionAuthority": "derived",
        "retentionSource": "qualified-llama.cpp-single-slot-cache-prompt"
      },
      "verifierResult": "UNKNOWN",
      "outcome": "COMPLETE"
    },
    {
      "id": "inv-8cbde689-d80e-45ac-bb58-0326170551c5",
      "turnNumber": 2,
      "provider": "local-cache-cold",
      "model": "qwen-cache-cold",
      "startedAt": "2026-09-09T20:07:55.386Z",
      "completedAt": "2026-09-09T20:07:56.769Z",
      "elapsedMs": 1383,
      "usage": {
        "inputTokens": 1459,
        "freshInputTokens": 76,
        "cachedInputTokens": 1383,
        "cacheWriteTokens": null,
        "outputTokens": 66,
        "reasoningTokens": null,
        "totalProcessedTokens": 1525
      },
      "cacheEvidence": {
        "reusedTokens": 1383,
        "processedPromptTokens": 76,
        "cacheWriteTokens": null,
        "promptProcessingMs": 117.282,
        "generationMs": 1237.606,
        "authority": "authoritative",
        "source": "llama.cpp.response.timings",
        "requestPrefixSha256": "f7898faf9ce4cae59f60a1cd70a952d3dffc0b9088008b71bbb9b357a33bed13",
        "retainedPromptTokens": 1459,
        "retentionAuthority": "derived",
        "retentionSource": "qualified-llama.cpp-single-slot-cache-prompt"
      },
      "verifierResult": "UNKNOWN",
      "outcome": "COMPLETE"
    },
    {
      "id": "inv-4314a5a4-35f2-42e2-a573-9b2d4bf51871",
      "turnNumber": 3,
      "provider": "local-cache-cold",
      "model": "qwen-cache-cold",
      "startedAt": "2026-09-09T20:07:56.781Z",
      "completedAt": "2026-09-09T20:07:57.328Z",
      "elapsedMs": 547,
      "usage": {
        "inputTokens": 1638,
        "freshInputTokens": 114,
        "cachedInputTokens": 1524,
        "cacheWriteTokens": null,
        "outputTokens": 21,
        "reasoningTokens": null,
        "totalProcessedTokens": 1659
      },
      "cacheEvidence": {
        "reusedTokens": 1524,
        "processedPromptTokens": 114,
        "cacheWriteTokens": null,
        "promptProcessingMs": 144.992,
        "generationMs": 380.852,
        "authority": "authoritative",
        "source": "llama.cpp.response.timings",
        "requestPrefixSha256": "27954b0a63c80828c4ca04a0fa97719ce5bdf70724164ff1fdd8e7155b937d6e",
        "retainedPromptTokens": 1638,
        "retentionAuthority": "derived",
        "retentionSource": "qualified-llama.cpp-single-slot-cache-prompt"
      },
      "verifierResult": "UNKNOWN",
      "outcome": "COMPLETE"
    }
  ]
}
```

## Managed evidence artifact-3b089938-4f4b-4640-be6e-59c4aa2210e5

Name: verification-report  
Schema: agent-control.non-openai-cache-verification/v1  
SHA-256: 77dc5fb47f00230e2c29d022d49569ab4f2f69ca2eabf11d78044cef9ce3926f

```json
{
  "schema": "agent-control.non-openai-cache-verification/v1",
  "passed": true,
  "taskId": "MUT-001",
  "prefixVariant": "changed-prefix-control",
  "verifier": {
    "schema": "agent-control.mutation-verifier/v1",
    "taskId": "MUT-001",
    "passed": true,
    "startedAt": "2026-09-09T20:07:57.548Z",
    "completedAt": "2026-09-09T20:07:58.532Z",
    "checks": [
      {
        "id": "mutation_present",
        "passed": true,
        "detail": "1 changed file(s)",
        "durationMs": 0.018374999999650754,
        "evidenceIds": [
          "diff_sha256:2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
        ]
      },
      {
        "id": "scope_and_size",
        "passed": true,
        "detail": "1 additions, 1 deletions",
        "durationMs": 0.007971999999426771,
        "evidenceIds": [
          "changed_file:src/constants.js"
        ]
      },
      {
        "id": "git_diff_check",
        "passed": true,
        "detail": "clean whitespace and patch structure",
        "durationMs": 5.843832000002294,
        "evidenceIds": [
          "diff_sha256:2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
        ]
      },
      {
        "id": "javascript_syntax",
        "passed": true,
        "detail": "16 source modules checked",
        "durationMs": 783.9662349999999,
        "evidenceIds": [
          "syntax:node-check"
        ]
      },
      {
        "id": "public_regression_tests",
        "passed": true,
        "detail": "✔ capabilities are normalized and matched (2.049959ms) ✔ runtime configuration validates bounded values (0.631725ms) ✔ job transition requires the declared state machine (0.239926ms) ✔ tool policy fences stale leases and unapproved risks (0.363227ms) ✔ unknown usage remains null (0.330331ms) ✔ scheduler selects the least-loaded capable online worker (0.268352ms) ℹ tests 6 ℹ suites 0 ℹ pass 6 ℹ fail 0 ℹ cancelled 0 ℹ skipped 0 ℹ todo 0 ℹ duration_ms 89.549878",
        "durationMs": 135.93696500000078,
        "evidenceIds": [
          "tests:public-node-test"
        ]
      },
      {
        "id": "hidden_verifier:default-timeout-45s",
        "passed": true,
        "detail": "default timeout is 45000",
        "durationMs": 0.913473000000522,
        "evidenceIds": [
          "hidden_verifier:default-timeout-45s",
          "diff_sha256:2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
        ]
      },
      {
        "id": "credential_and_topology_scan",
        "passed": true,
        "detail": "no credential or environment-topology pattern in patch",
        "durationMs": 0.010604000002786051,
        "evidenceIds": [
          "scan:bounded-diff"
        ]
      }
    ],
    "changedFiles": [
      "src/constants.js"
    ],
    "addedLines": 1,
    "deletedLines": 1,
    "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107",
    "failureClass": "NONE"
  },
  "patch": "diff --git a/src/constants.js b/src/constants.js\nindex 0971441..a72f5c0 100644\n--- a/src/constants.js\n+++ b/src/constants.js\n@@ -1,4 +1,4 @@\n-export const DEFAULT_JOB_TIMEOUT_MS = 30_000;\n+export const DEFAULT_JOB_TIMEOUT_MS = 45_000;\n \n export const JOB_STATES = Object.freeze([\n   'CREATED',\n",
  "patchSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107",
  "transcript": [
    {
      "type": "initiating-model-request",
      "at": "2026-09-09T20:07:53.157Z",
      "instruction": "NEGATIVE CONTROL PREFIX B: intentionally changed before the stable task sequence.\nExecute mutation task MUT-001 in the current disposable repository using profile THIN. This is an actual repository change, not a prose answer. Inspect before editing, remain inside the allowlisted paths, run the typed public-test tool when practical, then request mutation.finish. ",
      "authorisedContext": [
        {
          "id": "MUT-001:control",
          "kind": "agent_control_instructions",
          "content": "Agent Control retains scheduling, ToolPolicy, leases, ownership, cancellation, human takeover and verifier acceptance. Never modify a file outside the task scope."
        },
        {
          "id": "MUT-001:repository-rules",
          "kind": "repository_instructions",
          "content": "This is a disposable frozen JavaScript repository. Use forward-slash relative paths. Do not edit package metadata unless explicitly allowed. Do not add dependencies, credentials, machine names, network addresses or provider/model conditionals. Existing public tests must continue to pass."
        },
        {
          "id": "MUT-001:system",
          "kind": "system_instructions",
          "content": "Perform a real bounded repository mutation. Inspect evidence, use only typed tools, run public tests when practical, and stop without claiming independent verification."
        },
        {
          "id": "MUT-001:task",
          "kind": "task_context",
          "content": "Task MUT-001 (trivial_bounded_edit)\nChange the governed runtime's default job timeout to 45 seconds without changing any other default or public behavior.\nAllowed mutation paths: src/constants.js\nRequired changed paths: src/constants.js\nAcceptance criteria:\n- default timeout exports 45000 milliseconds\n- public tests pass\n- only the allowed file changes\nThe independent hidden verifier is not model-visible."
        },
        {
          "id": "MUT-001:tools",
          "kind": "tool_schemas",
          "content": "[{\"id\":\"mutation.repository.read\",\"description\":\"Read one authorised repository file or a bounded line range. Input: path, optional startLine/endLine.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"startLine\":{\"type\":\"integer\"},\"endLine\":{\"type\":\"integer\"}},\"required\":[\"path\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.search\",\"description\":\"Literal compact repository search. Returns file and line indexes; use read to expand selected files.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"query\":{\"type\":\"string\"},\"paths\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}},\"caseSensitive\":{\"type\":\"boolean\"}},\"required\":[\"query\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.replace\",\"description\":\"Replace an exact string in one task-authorised file. Input oldText/newText and optional expectedOccurrences.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"oldText\":{\"type\":\"string\"},\"newText\":{\"type\":\"string\"},\"expectedOccurrences\":{\"type\":\"integer\"}},\"required\":[\"path\",\"oldText\",\"newText\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.write\",\"description\":\"Write complete bounded content to one task-authorised file. Intended for a new test or a small full-file correction.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"content\":{\"type\":\"string\"}},\"required\":[\"path\",\"content\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.test\",\"description\":\"Run the fixture public Node test suite. It accepts no command, arguments or shell input.\",\"inputSchema\":{\"type\":\"object\",\"additionalProperties\":false}},{\"id\":\"mutation.finish\",\"description\":\"Stop the attempt after testing or when safely blocked. This is not verifier acceptance.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"summary\":{\"type\":\"string\"},\"blocked\":{\"type\":\"boolean\"},\"reason\":{\"type\":\"string\"}},\"additionalProperties\":false}}]"
        },
        {
          "id": "MUT-001:targeted-files",
          "kind": "task_context",
          "content": "FILE src/constants.js\nexport const DEFAULT_JOB_TIMEOUT_MS = 30_000;\n\nexport const JOB_STATES = Object.freeze([\n  'CREATED',\n  'ROUTED',\n  'RUNNING',\n  'VERIFICATION_PENDING',\n  'SUCCEEDED',\n  'FAILED',\n]);\n\nexport const TERMINAL_JOB_STATES = Object.freeze(['SUCCEEDED', 'FAILED']);\n"
        }
      ]
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:07:55.382Z",
      "requestPrefixSha256": "83dcf06c0aa063bca22575e1adf8f719c0e70c2717f3566ad5def1e364fe2826",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.read\",\n  \"input\": {\n    \"path\": \"src/constants.js\",\n    \"startLine\": 1,\n    \"endLine\": 1\n  }\n}\n```",
      "providerResponseId": "chatcmpl-hFcvPLGasjn05j0aFloDMtPs6WI9yr1m",
      "responseModel": "qwen-cache-cold",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1336,
        "completion_tokens": 48,
        "total_tokens": 1384,
        "prompt_tokens_details": {
          "cached_tokens": 0
        }
      },
      "timings": {
        "cache_n": 0,
        "prompt_n": 1336,
        "prompt_ms": 1307.101,
        "prompt_per_token_ms": 0.978369011976048,
        "prompt_per_second": 1022.109232568868,
        "predicted_n": 48,
        "predicted_ms": 893.31,
        "predicted_per_token_ms": 18.610625,
        "predicted_per_second": 53.73274675084798
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:07:55.386Z",
      "tool": "mutation.repository.read",
      "input": {
        "path": "src/constants.js",
        "startLine": 1,
        "endLine": 1
      },
      "output": {
        "path": "src/constants.js",
        "startLine": 1,
        "endLine": 1,
        "totalLines": 13,
        "complete": false,
        "content": "   1 | export const DEFAULT_JOB_TIMEOUT_MS = 30_000;"
      }
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:07:56.768Z",
      "requestPrefixSha256": "f7898faf9ce4cae59f60a1cd70a952d3dffc0b9088008b71bbb9b357a33bed13",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.replace\",\n  \"input\": {\n    \"path\": \"src/constants.js\",\n    \"oldText\": \"30_000\",\n    \"newText\": \"45_000\",\n    \"expectedOccurrences\": 1\n  }\n}\n```",
      "providerResponseId": "chatcmpl-nuge1Jr2jYmgN9mptCsads5B23W7GfIz",
      "responseModel": "qwen-cache-cold",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1459,
        "completion_tokens": 66,
        "total_tokens": 1525,
        "prompt_tokens_details": {
          "cached_tokens": 1383
        }
      },
      "timings": {
        "cache_n": 1383,
        "prompt_n": 76,
        "prompt_ms": 117.282,
        "prompt_per_token_ms": 1.5431842105263158,
        "prompt_per_second": 648.0107774424038,
        "predicted_n": 66,
        "predicted_ms": 1237.606,
        "predicted_per_token_ms": 18.75160606060606,
        "predicted_per_second": 53.32876537444066
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:07:56.781Z",
      "tool": "mutation.repository.replace",
      "input": {
        "path": "src/constants.js",
        "oldText": "30_000",
        "newText": "45_000",
        "expectedOccurrences": 1
      },
      "output": {
        "ok": true,
        "path": "src/constants.js",
        "occurrences": 1,
        "changedFiles": [
          "src/constants.js"
        ],
        "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
      }
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:07:57.327Z",
      "requestPrefixSha256": "27954b0a63c80828c4ca04a0fa97719ce5bdf70724164ff1fdd8e7155b937d6e",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.test\",\n  \"input\": {}\n}\n```",
      "providerResponseId": "chatcmpl-cOemIAPiDtbyAsLsBKN7Xh5eswFijcrn",
      "responseModel": "qwen-cache-cold",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1638,
        "completion_tokens": 21,
        "total_tokens": 1659,
        "prompt_tokens_details": {
          "cached_tokens": 1524
        }
      },
      "timings": {
        "cache_n": 1524,
        "prompt_n": 114,
        "prompt_ms": 144.992,
        "prompt_per_token_ms": 1.271859649122807,
        "prompt_per_second": 786.2502758772898,
        "predicted_n": 21,
        "predicted_ms": 380.852,
        "predicted_per_token_ms": 18.135809523809524,
        "predicted_per_second": 55.139529265961585
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:07:57.470Z",
      "tool": "mutation.repository.test",
      "input": {},
      "output": {
        "passed": true,
        "exitCode": 0,
        "timedOut": false,
        "cancelled": false,
        "stdout": "✔ capabilities are normalized and matched (1.644055ms)\n✔ runtime configuration validates bounded values (0.556661ms)\n✔ job transition requires the declared state machine (0.196229ms)\n✔ tool policy fences stale leases and unapproved risks (0.274303ms)\n✔ unknown usage remains null (0.324023ms)\n✔ scheduler selects the least-loaded capable online worker (0.247536ms)\nℹ tests 6\nℹ suites 0\nℹ pass 6\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 83.196818\n",
        "stderr": "",
        "changedFiles": [
          "src/constants.js"
        ],
        "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
      }
    }
  ]
}
```

## Managed evidence artifact-7402809c-5c24-43ab-9bd2-16f2306abf97

Name: mutation-attempt  
Schema: agent-control.non-openai-cache-attempt/v1  
SHA-256: f64f83969ce897659f9096fe60dff5411d9f9250e4d6c7c4377e7256b88d8d26

```json
{
  "schema": "agent-control.non-openai-cache-attempt/v1",
  "taskId": "MUT-001",
  "prefixVariant": "changed-prefix-control",
  "fixtureSha256": "d1b5e8ebec19378b5d2112e8be5e73671a51c40bc328af8ded815be44edb6b27",
  "startingRevision": "df4de7045803ce66c5e5f066fc58ca4179b655a3",
  "stablePrefixSha256": "98bead51a8a0f36688bd3c472e57d2d959909d77772ba4f639916a53251bbde5",
  "status": {
    "changedFiles": [
      "src/constants.js"
    ],
    "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
  },
  "counters": {
    "repositoryReads": 1,
    "repositorySearches": 0,
    "mutationsAttempted": 1,
    "verifierFacingTests": 1,
    "toolCalls": 3,
    "toolIds": [
      "mutation.repository.read",
      "mutation.repository.replace",
      "mutation.repository.test"
    ]
  },
  "transcript": [
    {
      "type": "initiating-model-request",
      "at": "2026-09-09T20:07:58.705Z",
      "instruction": "NEGATIVE CONTROL PREFIX B: intentionally changed before the stable task sequence.\nExecute mutation task MUT-001 in the current disposable repository using profile THIN. This is an actual repository change, not a prose answer. Inspect before editing, remain inside the allowlisted paths, run the typed public-test tool when practical, then request mutation.finish. ",
      "authorisedContext": [
        {
          "id": "MUT-001:control",
          "kind": "agent_control_instructions",
          "content": "Agent Control retains scheduling, ToolPolicy, leases, ownership, cancellation, human takeover and verifier acceptance. Never modify a file outside the task scope."
        },
        {
          "id": "MUT-001:repository-rules",
          "kind": "repository_instructions",
          "content": "This is a disposable frozen JavaScript repository. Use forward-slash relative paths. Do not edit package metadata unless explicitly allowed. Do not add dependencies, credentials, machine names, network addresses or provider/model conditionals. Existing public tests must continue to pass."
        },
        {
          "id": "MUT-001:system",
          "kind": "system_instructions",
          "content": "Perform a real bounded repository mutation. Inspect evidence, use only typed tools, run public tests when practical, and stop without claiming independent verification."
        },
        {
          "id": "MUT-001:task",
          "kind": "task_context",
          "content": "Task MUT-001 (trivial_bounded_edit)\nChange the governed runtime's default job timeout to 45 seconds without changing any other default or public behavior.\nAllowed mutation paths: src/constants.js\nRequired changed paths: src/constants.js\nAcceptance criteria:\n- default timeout exports 45000 milliseconds\n- public tests pass\n- only the allowed file changes\nThe independent hidden verifier is not model-visible."
        },
        {
          "id": "MUT-001:tools",
          "kind": "tool_schemas",
          "content": "[{\"id\":\"mutation.repository.read\",\"description\":\"Read one authorised repository file or a bounded line range. Input: path, optional startLine/endLine.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"startLine\":{\"type\":\"integer\"},\"endLine\":{\"type\":\"integer\"}},\"required\":[\"path\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.search\",\"description\":\"Literal compact repository search. Returns file and line indexes; use read to expand selected files.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"query\":{\"type\":\"string\"},\"paths\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}},\"caseSensitive\":{\"type\":\"boolean\"}},\"required\":[\"query\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.replace\",\"description\":\"Replace an exact string in one task-authorised file. Input oldText/newText and optional expectedOccurrences.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"oldText\":{\"type\":\"string\"},\"newText\":{\"type\":\"string\"},\"expectedOccurrences\":{\"type\":\"integer\"}},\"required\":[\"path\",\"oldText\",\"newText\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.write\",\"description\":\"Write complete bounded content to one task-authorised file. Intended for a new test or a small full-file correction.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"content\":{\"type\":\"string\"}},\"required\":[\"path\",\"content\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.test\",\"description\":\"Run the fixture public Node test suite. It accepts no command, arguments or shell input.\",\"inputSchema\":{\"type\":\"object\",\"additionalProperties\":false}},{\"id\":\"mutation.finish\",\"description\":\"Stop the attempt after testing or when safely blocked. This is not verifier acceptance.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"summary\":{\"type\":\"string\"},\"blocked\":{\"type\":\"boolean\"},\"reason\":{\"type\":\"string\"}},\"additionalProperties\":false}}]"
        },
        {
          "id": "MUT-001:targeted-files",
          "kind": "task_context",
          "content": "FILE src/constants.js\nexport const DEFAULT_JOB_TIMEOUT_MS = 30_000;\n\nexport const JOB_STATES = Object.freeze([\n  'CREATED',\n  'ROUTED',\n  'RUNNING',\n  'VERIFICATION_PENDING',\n  'SUCCEEDED',\n  'FAILED',\n]);\n\nexport const TERMINAL_JOB_STATES = Object.freeze(['SUCCEEDED', 'FAILED']);\n"
        }
      ]
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:08:00.558Z",
      "requestPrefixSha256": "98bead51a8a0f36688bd3c472e57d2d959909d77772ba4f639916a53251bbde5",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.read\",\n  \"input\": {\n    \"path\": \"src/constants.js\",\n    \"startLine\": 1,\n    \"endLine\": 1\n  }\n}\n```",
      "providerResponseId": "chatcmpl-dF0Eds79iv9vGWhHKBNzga9YP8gbDmCg",
      "responseModel": "qwen-cache-warm",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1336,
        "completion_tokens": 48,
        "total_tokens": 1384,
        "prompt_tokens_details": {
          "cached_tokens": 497
        }
      },
      "timings": {
        "cache_n": 497,
        "prompt_n": 839,
        "prompt_ms": 858.701,
        "prompt_per_token_ms": 1.023481525625745,
        "prompt_per_second": 977.0572061753742,
        "predicted_n": 48,
        "predicted_ms": 896.461,
        "predicted_per_token_ms": 18.676270833333334,
        "predicted_per_second": 53.54387976721799
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:08:00.563Z",
      "tool": "mutation.repository.read",
      "input": {
        "path": "src/constants.js",
        "startLine": 1,
        "endLine": 1
      },
      "output": {
        "path": "src/constants.js",
        "startLine": 1,
        "endLine": 1,
        "totalLines": 13,
        "complete": false,
        "content": "   1 | export const DEFAULT_JOB_TIMEOUT_MS = 30_000;"
      }
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:08:01.951Z",
      "requestPrefixSha256": "45b1bf44da999883c0ea502a41bcf32b8a63cfb31830b296e1074785c442630f",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.replace\",\n  \"input\": {\n    \"path\": \"src/constants.js\",\n    \"oldText\": \"30_000\",\n    \"newText\": \"45_000\",\n    \"expectedOccurrences\": 1\n  }\n}\n```",
      "providerResponseId": "chatcmpl-dOMdDaH5wdPa5XLkVukoxQVBurA3tVMR",
      "responseModel": "qwen-cache-warm",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1459,
        "completion_tokens": 66,
        "total_tokens": 1525,
        "prompt_tokens_details": {
          "cached_tokens": 1383
        }
      },
      "timings": {
        "cache_n": 1383,
        "prompt_n": 76,
        "prompt_ms": 116.394,
        "prompt_per_token_ms": 1.5315,
        "prompt_per_second": 652.9546196539341,
        "predicted_n": 66,
        "predicted_ms": 1238.428,
        "predicted_per_token_ms": 18.764060606060607,
        "predicted_per_second": 53.2933686899844
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:08:01.967Z",
      "tool": "mutation.repository.replace",
      "input": {
        "path": "src/constants.js",
        "oldText": "30_000",
        "newText": "45_000",
        "expectedOccurrences": 1
      },
      "output": {
        "ok": true,
        "path": "src/constants.js",
        "occurrences": 1,
        "changedFiles": [
          "src/constants.js"
        ],
        "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
      }
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:08:02.523Z",
      "requestPrefixSha256": "c9f36a0554e2464019f856b533f79c52df6422644795194969cdc920fc48ab76",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.test\",\n  \"input\": {}\n}\n```",
      "providerResponseId": "chatcmpl-Bnlg6un2rFbStGLCka4pDzHuGe3vzoXf",
      "responseModel": "qwen-cache-warm",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1638,
        "completion_tokens": 21,
        "total_tokens": 1659,
        "prompt_tokens_details": {
          "cached_tokens": 1524
        }
      },
      "timings": {
        "cache_n": 1524,
        "prompt_n": 114,
        "prompt_ms": 146.236,
        "prompt_per_token_ms": 1.2827719298245612,
        "prompt_per_second": 779.5618042068985,
        "predicted_n": 21,
        "predicted_ms": 384.319,
        "predicted_per_token_ms": 18.300904761904764,
        "predicted_per_second": 54.64210720781434
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:08:02.739Z",
      "tool": "mutation.repository.test",
      "input": {},
      "output": {
        "passed": true,
        "exitCode": 0,
        "timedOut": false,
        "cancelled": false,
        "stdout": "✔ capabilities are normalized and matched (2.643171ms)\n✔ runtime configuration validates bounded values (0.814837ms)\n✔ job transition requires the declared state machine (0.32354ms)\n✔ tool policy fences stale leases and unapproved risks (0.579535ms)\n✔ unknown usage remains null (0.401186ms)\n✔ scheduler selects the least-loaded capable online worker (0.376746ms)\nℹ tests 6\nℹ suites 0\nℹ pass 6\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 138.965195\n",
        "stderr": "",
        "changedFiles": [
          "src/constants.js"
        ],
        "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
      }
    }
  ],
  "invocations": [
    {
      "id": "inv-5d947b52-275a-4039-800e-f98427289921",
      "turnNumber": 1,
      "provider": "local-cache-warm",
      "model": "qwen-cache-warm",
      "startedAt": "2026-09-09T20:07:58.705Z",
      "completedAt": "2026-09-09T20:08:00.560Z",
      "elapsedMs": 1855,
      "usage": {
        "inputTokens": 1336,
        "freshInputTokens": 839,
        "cachedInputTokens": 497,
        "cacheWriteTokens": null,
        "outputTokens": 48,
        "reasoningTokens": null,
        "totalProcessedTokens": 1384
      },
      "cacheEvidence": {
        "reusedTokens": 497,
        "processedPromptTokens": 839,
        "cacheWriteTokens": null,
        "promptProcessingMs": 858.701,
        "generationMs": 896.461,
        "authority": "authoritative",
        "source": "llama.cpp.response.timings",
        "requestPrefixSha256": "98bead51a8a0f36688bd3c472e57d2d959909d77772ba4f639916a53251bbde5",
        "retainedPromptTokens": 1336,
        "retentionAuthority": "derived",
        "retentionSource": "qualified-llama.cpp-single-slot-cache-prompt"
      },
      "verifierResult": "UNKNOWN",
      "outcome": "COMPLETE"
    },
    {
      "id": "inv-edc71858-206e-4920-b686-71942e5eb70c",
      "turnNumber": 2,
      "provider": "local-cache-warm",
      "model": "qwen-cache-warm",
      "startedAt": "2026-09-09T20:08:00.563Z",
      "completedAt": "2026-09-09T20:08:01.953Z",
      "elapsedMs": 1390,
      "usage": {
        "inputTokens": 1459,
        "freshInputTokens": 76,
        "cachedInputTokens": 1383,
        "cacheWriteTokens": null,
        "outputTokens": 66,
        "reasoningTokens": null,
        "totalProcessedTokens": 1525
      },
      "cacheEvidence": {
        "reusedTokens": 1383,
        "processedPromptTokens": 76,
        "cacheWriteTokens": null,
        "promptProcessingMs": 116.394,
        "generationMs": 1238.428,
        "authority": "authoritative",
        "source": "llama.cpp.response.timings",
        "requestPrefixSha256": "45b1bf44da999883c0ea502a41bcf32b8a63cfb31830b296e1074785c442630f",
        "retainedPromptTokens": 1459,
        "retentionAuthority": "derived",
        "retentionSource": "qualified-llama.cpp-single-slot-cache-prompt"
      },
      "verifierResult": "UNKNOWN",
      "outcome": "COMPLETE"
    },
    {
      "id": "inv-7f837f9a-04b1-4726-bd96-bf4370f87b98",
      "turnNumber": 3,
      "provider": "local-cache-warm",
      "model": "qwen-cache-warm",
      "startedAt": "2026-09-09T20:08:01.967Z",
      "completedAt": "2026-09-09T20:08:02.524Z",
      "elapsedMs": 557,
      "usage": {
        "inputTokens": 1638,
        "freshInputTokens": 114,
        "cachedInputTokens": 1524,
        "cacheWriteTokens": null,
        "outputTokens": 21,
        "reasoningTokens": null,
        "totalProcessedTokens": 1659
      },
      "cacheEvidence": {
        "reusedTokens": 1524,
        "processedPromptTokens": 114,
        "cacheWriteTokens": null,
        "promptProcessingMs": 146.236,
        "generationMs": 384.319,
        "authority": "authoritative",
        "source": "llama.cpp.response.timings",
        "requestPrefixSha256": "c9f36a0554e2464019f856b533f79c52df6422644795194969cdc920fc48ab76",
        "retainedPromptTokens": 1638,
        "retentionAuthority": "derived",
        "retentionSource": "qualified-llama.cpp-single-slot-cache-prompt"
      },
      "verifierResult": "UNKNOWN",
      "outcome": "COMPLETE"
    }
  ]
}
```

## Managed evidence artifact-6343bd64-c429-4bd9-b0c6-70be86fabf3e

Name: verification-report  
Schema: agent-control.non-openai-cache-verification/v1  
SHA-256: aacbdee03da448e2dc731b476f9696908e15eeece607c224283d7858d944b6f5

```json
{
  "schema": "agent-control.non-openai-cache-verification/v1",
  "passed": true,
  "taskId": "MUT-001",
  "prefixVariant": "changed-prefix-control",
  "verifier": {
    "schema": "agent-control.mutation-verifier/v1",
    "taskId": "MUT-001",
    "passed": true,
    "startedAt": "2026-09-09T20:08:02.849Z",
    "completedAt": "2026-09-09T20:08:03.918Z",
    "checks": [
      {
        "id": "mutation_present",
        "passed": true,
        "detail": "1 changed file(s)",
        "durationMs": 0.016974000001937384,
        "evidenceIds": [
          "diff_sha256:2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
        ]
      },
      {
        "id": "scope_and_size",
        "passed": true,
        "detail": "1 additions, 1 deletions",
        "durationMs": 0.0071250000000873115,
        "evidenceIds": [
          "changed_file:src/constants.js"
        ]
      },
      {
        "id": "git_diff_check",
        "passed": true,
        "detail": "clean whitespace and patch structure",
        "durationMs": 16.19612099999722,
        "evidenceIds": [
          "diff_sha256:2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
        ]
      },
      {
        "id": "javascript_syntax",
        "passed": true,
        "detail": "16 source modules checked",
        "durationMs": 788.7116819999974,
        "evidenceIds": [
          "syntax:node-check"
        ]
      },
      {
        "id": "public_regression_tests",
        "passed": true,
        "detail": "✔ capabilities are normalized and matched (1.792944ms) ✔ runtime configuration validates bounded values (0.648188ms) ✔ job transition requires the declared state machine (0.283036ms) ✔ tool policy fences stale leases and unapproved risks (0.260067ms) ✔ unknown usage remains null (0.275202ms) ✔ scheduler selects the least-loaded capable online worker (0.243246ms) ℹ tests 6 ℹ suites 0 ℹ pass 6 ℹ fail 0 ℹ cancelled 0 ℹ skipped 0 ℹ todo 0 ℹ duration_ms 104.910555",
        "durationMs": 155.4202980000009,
        "evidenceIds": [
          "tests:public-node-test"
        ]
      },
      {
        "id": "hidden_verifier:default-timeout-45s",
        "passed": true,
        "detail": "default timeout is 45000",
        "durationMs": 0.9123080000026675,
        "evidenceIds": [
          "hidden_verifier:default-timeout-45s",
          "diff_sha256:2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
        ]
      },
      {
        "id": "credential_and_topology_scan",
        "passed": true,
        "detail": "no credential or environment-topology pattern in patch",
        "durationMs": 0.00929099999848404,
        "evidenceIds": [
          "scan:bounded-diff"
        ]
      }
    ],
    "changedFiles": [
      "src/constants.js"
    ],
    "addedLines": 1,
    "deletedLines": 1,
    "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107",
    "failureClass": "NONE"
  },
  "patch": "diff --git a/src/constants.js b/src/constants.js\nindex 0971441..a72f5c0 100644\n--- a/src/constants.js\n+++ b/src/constants.js\n@@ -1,4 +1,4 @@\n-export const DEFAULT_JOB_TIMEOUT_MS = 30_000;\n+export const DEFAULT_JOB_TIMEOUT_MS = 45_000;\n \n export const JOB_STATES = Object.freeze([\n   'CREATED',\n",
  "patchSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107",
  "transcript": [
    {
      "type": "initiating-model-request",
      "at": "2026-09-09T20:07:58.705Z",
      "instruction": "NEGATIVE CONTROL PREFIX B: intentionally changed before the stable task sequence.\nExecute mutation task MUT-001 in the current disposable repository using profile THIN. This is an actual repository change, not a prose answer. Inspect before editing, remain inside the allowlisted paths, run the typed public-test tool when practical, then request mutation.finish. ",
      "authorisedContext": [
        {
          "id": "MUT-001:control",
          "kind": "agent_control_instructions",
          "content": "Agent Control retains scheduling, ToolPolicy, leases, ownership, cancellation, human takeover and verifier acceptance. Never modify a file outside the task scope."
        },
        {
          "id": "MUT-001:repository-rules",
          "kind": "repository_instructions",
          "content": "This is a disposable frozen JavaScript repository. Use forward-slash relative paths. Do not edit package metadata unless explicitly allowed. Do not add dependencies, credentials, machine names, network addresses or provider/model conditionals. Existing public tests must continue to pass."
        },
        {
          "id": "MUT-001:system",
          "kind": "system_instructions",
          "content": "Perform a real bounded repository mutation. Inspect evidence, use only typed tools, run public tests when practical, and stop without claiming independent verification."
        },
        {
          "id": "MUT-001:task",
          "kind": "task_context",
          "content": "Task MUT-001 (trivial_bounded_edit)\nChange the governed runtime's default job timeout to 45 seconds without changing any other default or public behavior.\nAllowed mutation paths: src/constants.js\nRequired changed paths: src/constants.js\nAcceptance criteria:\n- default timeout exports 45000 milliseconds\n- public tests pass\n- only the allowed file changes\nThe independent hidden verifier is not model-visible."
        },
        {
          "id": "MUT-001:tools",
          "kind": "tool_schemas",
          "content": "[{\"id\":\"mutation.repository.read\",\"description\":\"Read one authorised repository file or a bounded line range. Input: path, optional startLine/endLine.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"startLine\":{\"type\":\"integer\"},\"endLine\":{\"type\":\"integer\"}},\"required\":[\"path\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.search\",\"description\":\"Literal compact repository search. Returns file and line indexes; use read to expand selected files.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"query\":{\"type\":\"string\"},\"paths\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}},\"caseSensitive\":{\"type\":\"boolean\"}},\"required\":[\"query\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.replace\",\"description\":\"Replace an exact string in one task-authorised file. Input oldText/newText and optional expectedOccurrences.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"oldText\":{\"type\":\"string\"},\"newText\":{\"type\":\"string\"},\"expectedOccurrences\":{\"type\":\"integer\"}},\"required\":[\"path\",\"oldText\",\"newText\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.write\",\"description\":\"Write complete bounded content to one task-authorised file. Intended for a new test or a small full-file correction.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"content\":{\"type\":\"string\"}},\"required\":[\"path\",\"content\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.test\",\"description\":\"Run the fixture public Node test suite. It accepts no command, arguments or shell input.\",\"inputSchema\":{\"type\":\"object\",\"additionalProperties\":false}},{\"id\":\"mutation.finish\",\"description\":\"Stop the attempt after testing or when safely blocked. This is not verifier acceptance.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"summary\":{\"type\":\"string\"},\"blocked\":{\"type\":\"boolean\"},\"reason\":{\"type\":\"string\"}},\"additionalProperties\":false}}]"
        },
        {
          "id": "MUT-001:targeted-files",
          "kind": "task_context",
          "content": "FILE src/constants.js\nexport const DEFAULT_JOB_TIMEOUT_MS = 30_000;\n\nexport const JOB_STATES = Object.freeze([\n  'CREATED',\n  'ROUTED',\n  'RUNNING',\n  'VERIFICATION_PENDING',\n  'SUCCEEDED',\n  'FAILED',\n]);\n\nexport const TERMINAL_JOB_STATES = Object.freeze(['SUCCEEDED', 'FAILED']);\n"
        }
      ]
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:08:00.558Z",
      "requestPrefixSha256": "98bead51a8a0f36688bd3c472e57d2d959909d77772ba4f639916a53251bbde5",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.read\",\n  \"input\": {\n    \"path\": \"src/constants.js\",\n    \"startLine\": 1,\n    \"endLine\": 1\n  }\n}\n```",
      "providerResponseId": "chatcmpl-dF0Eds79iv9vGWhHKBNzga9YP8gbDmCg",
      "responseModel": "qwen-cache-warm",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1336,
        "completion_tokens": 48,
        "total_tokens": 1384,
        "prompt_tokens_details": {
          "cached_tokens": 497
        }
      },
      "timings": {
        "cache_n": 497,
        "prompt_n": 839,
        "prompt_ms": 858.701,
        "prompt_per_token_ms": 1.023481525625745,
        "prompt_per_second": 977.0572061753742,
        "predicted_n": 48,
        "predicted_ms": 896.461,
        "predicted_per_token_ms": 18.676270833333334,
        "predicted_per_second": 53.54387976721799
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:08:00.563Z",
      "tool": "mutation.repository.read",
      "input": {
        "path": "src/constants.js",
        "startLine": 1,
        "endLine": 1
      },
      "output": {
        "path": "src/constants.js",
        "startLine": 1,
        "endLine": 1,
        "totalLines": 13,
        "complete": false,
        "content": "   1 | export const DEFAULT_JOB_TIMEOUT_MS = 30_000;"
      }
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:08:01.951Z",
      "requestPrefixSha256": "45b1bf44da999883c0ea502a41bcf32b8a63cfb31830b296e1074785c442630f",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.replace\",\n  \"input\": {\n    \"path\": \"src/constants.js\",\n    \"oldText\": \"30_000\",\n    \"newText\": \"45_000\",\n    \"expectedOccurrences\": 1\n  }\n}\n```",
      "providerResponseId": "chatcmpl-dOMdDaH5wdPa5XLkVukoxQVBurA3tVMR",
      "responseModel": "qwen-cache-warm",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1459,
        "completion_tokens": 66,
        "total_tokens": 1525,
        "prompt_tokens_details": {
          "cached_tokens": 1383
        }
      },
      "timings": {
        "cache_n": 1383,
        "prompt_n": 76,
        "prompt_ms": 116.394,
        "prompt_per_token_ms": 1.5315,
        "prompt_per_second": 652.9546196539341,
        "predicted_n": 66,
        "predicted_ms": 1238.428,
        "predicted_per_token_ms": 18.764060606060607,
        "predicted_per_second": 53.2933686899844
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:08:01.967Z",
      "tool": "mutation.repository.replace",
      "input": {
        "path": "src/constants.js",
        "oldText": "30_000",
        "newText": "45_000",
        "expectedOccurrences": 1
      },
      "output": {
        "ok": true,
        "path": "src/constants.js",
        "occurrences": 1,
        "changedFiles": [
          "src/constants.js"
        ],
        "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
      }
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:08:02.523Z",
      "requestPrefixSha256": "c9f36a0554e2464019f856b533f79c52df6422644795194969cdc920fc48ab76",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.test\",\n  \"input\": {}\n}\n```",
      "providerResponseId": "chatcmpl-Bnlg6un2rFbStGLCka4pDzHuGe3vzoXf",
      "responseModel": "qwen-cache-warm",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1638,
        "completion_tokens": 21,
        "total_tokens": 1659,
        "prompt_tokens_details": {
          "cached_tokens": 1524
        }
      },
      "timings": {
        "cache_n": 1524,
        "prompt_n": 114,
        "prompt_ms": 146.236,
        "prompt_per_token_ms": 1.2827719298245612,
        "prompt_per_second": 779.5618042068985,
        "predicted_n": 21,
        "predicted_ms": 384.319,
        "predicted_per_token_ms": 18.300904761904764,
        "predicted_per_second": 54.64210720781434
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:08:02.739Z",
      "tool": "mutation.repository.test",
      "input": {},
      "output": {
        "passed": true,
        "exitCode": 0,
        "timedOut": false,
        "cancelled": false,
        "stdout": "✔ capabilities are normalized and matched (2.643171ms)\n✔ runtime configuration validates bounded values (0.814837ms)\n✔ job transition requires the declared state machine (0.32354ms)\n✔ tool policy fences stale leases and unapproved risks (0.579535ms)\n✔ unknown usage remains null (0.401186ms)\n✔ scheduler selects the least-loaded capable online worker (0.376746ms)\nℹ tests 6\nℹ suites 0\nℹ pass 6\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 138.965195\n",
        "stderr": "",
        "changedFiles": [
          "src/constants.js"
        ],
        "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
      }
    }
  ]
}
```

## Managed evidence artifact-4d559129-acd9-4396-8e86-10f71128e4d2

Name: mutation-attempt  
Schema: agent-control.non-openai-cache-attempt/v1  
SHA-256: 7be04f11fc165815881912d244ae14c649a411325035485be437a5f57c65ef99

```json
{
  "schema": "agent-control.non-openai-cache-attempt/v1",
  "taskId": "MUT-001",
  "prefixVariant": "stable",
  "fixtureSha256": "d1b5e8ebec19378b5d2112e8be5e73671a51c40bc328af8ded815be44edb6b27",
  "startingRevision": "c3cec6aafb1e552f4b89b10d3b7e4867fc9b3e45",
  "stablePrefixSha256": "2482993f0623156f1524143a732b58c5590fff69065e28bda5a394eef31e1dd6",
  "status": {
    "changedFiles": [
      "src/constants.js"
    ],
    "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
  },
  "counters": {
    "repositoryReads": 1,
    "repositorySearches": 0,
    "mutationsAttempted": 1,
    "verifierFacingTests": 1,
    "toolCalls": 3,
    "toolIds": [
      "mutation.repository.read",
      "mutation.repository.replace",
      "mutation.repository.test"
    ]
  },
  "transcript": [
    {
      "type": "initiating-model-request",
      "at": "2026-09-09T20:08:47.427Z",
      "instruction": "CACHE QUALIFICATION PREFIX A.\nExecute mutation task MUT-001 in the current disposable repository using profile THIN. This is an actual repository change, not a prose answer. Inspect before editing, remain inside the allowlisted paths, run the typed public-test tool when practical, then request mutation.finish. ",
      "authorisedContext": [
        {
          "id": "MUT-001:control",
          "kind": "agent_control_instructions",
          "content": "Agent Control retains scheduling, ToolPolicy, leases, ownership, cancellation, human takeover and verifier acceptance. Never modify a file outside the task scope."
        },
        {
          "id": "MUT-001:repository-rules",
          "kind": "repository_instructions",
          "content": "This is a disposable frozen JavaScript repository. Use forward-slash relative paths. Do not edit package metadata unless explicitly allowed. Do not add dependencies, credentials, machine names, network addresses or provider/model conditionals. Existing public tests must continue to pass."
        },
        {
          "id": "MUT-001:system",
          "kind": "system_instructions",
          "content": "Perform a real bounded repository mutation. Inspect evidence, use only typed tools, run public tests when practical, and stop without claiming independent verification."
        },
        {
          "id": "MUT-001:task",
          "kind": "task_context",
          "content": "Task MUT-001 (trivial_bounded_edit)\nChange the governed runtime's default job timeout to 45 seconds without changing any other default or public behavior.\nAllowed mutation paths: src/constants.js\nRequired changed paths: src/constants.js\nAcceptance criteria:\n- default timeout exports 45000 milliseconds\n- public tests pass\n- only the allowed file changes\nThe independent hidden verifier is not model-visible."
        },
        {
          "id": "MUT-001:tools",
          "kind": "tool_schemas",
          "content": "[{\"id\":\"mutation.repository.read\",\"description\":\"Read one authorised repository file or a bounded line range. Input: path, optional startLine/endLine.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"startLine\":{\"type\":\"integer\"},\"endLine\":{\"type\":\"integer\"}},\"required\":[\"path\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.search\",\"description\":\"Literal compact repository search. Returns file and line indexes; use read to expand selected files.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"query\":{\"type\":\"string\"},\"paths\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}},\"caseSensitive\":{\"type\":\"boolean\"}},\"required\":[\"query\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.replace\",\"description\":\"Replace an exact string in one task-authorised file. Input oldText/newText and optional expectedOccurrences.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"oldText\":{\"type\":\"string\"},\"newText\":{\"type\":\"string\"},\"expectedOccurrences\":{\"type\":\"integer\"}},\"required\":[\"path\",\"oldText\",\"newText\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.write\",\"description\":\"Write complete bounded content to one task-authorised file. Intended for a new test or a small full-file correction.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"content\":{\"type\":\"string\"}},\"required\":[\"path\",\"content\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.test\",\"description\":\"Run the fixture public Node test suite. It accepts no command, arguments or shell input.\",\"inputSchema\":{\"type\":\"object\",\"additionalProperties\":false}},{\"id\":\"mutation.finish\",\"description\":\"Stop the attempt after testing or when safely blocked. This is not verifier acceptance.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"summary\":{\"type\":\"string\"},\"blocked\":{\"type\":\"boolean\"},\"reason\":{\"type\":\"string\"}},\"additionalProperties\":false}}]"
        },
        {
          "id": "MUT-001:targeted-files",
          "kind": "task_context",
          "content": "FILE src/constants.js\nexport const DEFAULT_JOB_TIMEOUT_MS = 30_000;\n\nexport const JOB_STATES = Object.freeze([\n  'CREATED',\n  'ROUTED',\n  'RUNNING',\n  'VERIFICATION_PENDING',\n  'SUCCEEDED',\n  'FAILED',\n]);\n\nexport const TERMINAL_JOB_STATES = Object.freeze(['SUCCEEDED', 'FAILED']);\n"
        }
      ]
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:08:48.975Z",
      "requestPrefixSha256": "2482993f0623156f1524143a732b58c5590fff69065e28bda5a394eef31e1dd6",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.read\",\n  \"input\": {\n    \"path\": \"src/constants.js\"\n  }\n}\n```",
      "providerResponseId": "chatcmpl-3w2breXkpKs1ydXgNctImDb0AaPH6rR2",
      "responseModel": "qwen-cache-cold",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1328,
        "completion_tokens": 32,
        "total_tokens": 1360,
        "prompt_tokens_details": {
          "cached_tokens": 497
        }
      },
      "timings": {
        "cache_n": 497,
        "prompt_n": 831,
        "prompt_ms": 835.77,
        "prompt_per_token_ms": 1.005740072202166,
        "prompt_per_second": 994.2926881797624,
        "predicted_n": 32,
        "predicted_ms": 591.31,
        "predicted_per_token_ms": 18.4784375,
        "predicted_per_second": 54.117129762730215
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:08:48.984Z",
      "tool": "mutation.repository.read",
      "input": {
        "path": "src/constants.js"
      },
      "output": {
        "path": "src/constants.js",
        "startLine": 1,
        "endLine": 13,
        "totalLines": 13,
        "complete": true,
        "content": "   1 | export const DEFAULT_JOB_TIMEOUT_MS = 30_000;\n   2 | \n   3 | export const JOB_STATES = Object.freeze([\n   4 |   'CREATED',\n   5 |   'ROUTED',\n   6 |   'RUNNING',\n   7 |   'VERIFICATION_PENDING',\n   8 |   'SUCCEEDED',\n   9 |   'FAILED',\n  10 | ]);\n  11 | \n  12 | export const TERMINAL_JOB_STATES = Object.freeze(['SUCCEEDED', 'FAILED']);\n  13 | "
      }
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:08:50.517Z",
      "requestPrefixSha256": "fd2564541e4b321e9c333ab5fedc4431740eaa11d9387f0ac054770e24eb63c1",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.replace\",\n  \"input\": {\n    \"path\": \"src/constants.js\",\n    \"oldText\": \"30_000\",\n    \"newText\": \"45_000\",\n    \"expectedOccurrences\": 1\n  }\n}\n```",
      "providerResponseId": "chatcmpl-RI1FVUY5ejTrbC1bJ76UdGwdGREG9gwQ",
      "responseModel": "qwen-cache-cold",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1565,
        "completion_tokens": 66,
        "total_tokens": 1631,
        "prompt_tokens_details": {
          "cached_tokens": 1359
        }
      },
      "timings": {
        "cache_n": 1359,
        "prompt_n": 206,
        "prompt_ms": 255.771,
        "prompt_per_token_ms": 1.2416067961165047,
        "prompt_per_second": 805.407962591537,
        "predicted_n": 66,
        "predicted_ms": 1246.758,
        "predicted_per_token_ms": 18.890272727272727,
        "predicted_per_second": 52.9372981765507
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:08:50.532Z",
      "tool": "mutation.repository.replace",
      "input": {
        "path": "src/constants.js",
        "oldText": "30_000",
        "newText": "45_000",
        "expectedOccurrences": 1
      },
      "output": {
        "ok": true,
        "path": "src/constants.js",
        "occurrences": 1,
        "changedFiles": [
          "src/constants.js"
        ],
        "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
      }
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:08:51.099Z",
      "requestPrefixSha256": "6ef5b416cb5ec9eda740e6b658aaaefb8bb8fdacf1b707853892e099cdb073f7",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.test\",\n  \"input\": {}\n}\n```",
      "providerResponseId": "chatcmpl-qOHcMBtKzBjnDdJMyyTKUltBpkuwWdby",
      "responseModel": "qwen-cache-cold",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1744,
        "completion_tokens": 21,
        "total_tokens": 1765,
        "prompt_tokens_details": {
          "cached_tokens": 1630
        }
      },
      "timings": {
        "cache_n": 1630,
        "prompt_n": 114,
        "prompt_ms": 146.366,
        "prompt_per_token_ms": 1.2839122807017544,
        "prompt_per_second": 778.8694095623299,
        "predicted_n": 21,
        "predicted_ms": 383.867,
        "predicted_per_token_ms": 18.279380952380954,
        "predicted_per_second": 54.706447806141185
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:08:51.302Z",
      "tool": "mutation.repository.test",
      "input": {},
      "output": {
        "passed": true,
        "exitCode": 0,
        "timedOut": false,
        "cancelled": false,
        "stdout": "✔ capabilities are normalized and matched (2.832246ms)\n✔ runtime configuration validates bounded values (0.83162ms)\n✔ job transition requires the declared state machine (0.302643ms)\n✔ tool policy fences stale leases and unapproved risks (0.346525ms)\n✔ unknown usage remains null (0.367884ms)\n✔ scheduler selects the least-loaded capable online worker (0.342671ms)\nℹ tests 6\nℹ suites 0\nℹ pass 6\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 114.803626\n",
        "stderr": "",
        "changedFiles": [
          "src/constants.js"
        ],
        "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
      }
    }
  ],
  "invocations": [
    {
      "id": "inv-3bb19040-0d12-4f33-af66-61a135063360",
      "turnNumber": 1,
      "provider": "local-cache-cold",
      "model": "qwen-cache-cold",
      "startedAt": "2026-09-09T20:08:47.431Z",
      "completedAt": "2026-09-09T20:08:48.978Z",
      "elapsedMs": 1547,
      "usage": {
        "inputTokens": 1328,
        "freshInputTokens": 831,
        "cachedInputTokens": 497,
        "cacheWriteTokens": null,
        "outputTokens": 32,
        "reasoningTokens": null,
        "totalProcessedTokens": 1360
      },
      "cacheEvidence": {
        "reusedTokens": 497,
        "processedPromptTokens": 831,
        "cacheWriteTokens": null,
        "promptProcessingMs": 835.77,
        "generationMs": 591.31,
        "authority": "authoritative",
        "source": "llama.cpp.response.timings",
        "requestPrefixSha256": "2482993f0623156f1524143a732b58c5590fff69065e28bda5a394eef31e1dd6",
        "retainedPromptTokens": 1328,
        "retentionAuthority": "derived",
        "retentionSource": "qualified-llama.cpp-single-slot-cache-prompt"
      },
      "verifierResult": "UNKNOWN",
      "outcome": "COMPLETE"
    },
    {
      "id": "inv-c7544dfe-64af-47d1-acec-5fd6de5f0a87",
      "turnNumber": 2,
      "provider": "local-cache-cold",
      "model": "qwen-cache-cold",
      "startedAt": "2026-09-09T20:08:48.984Z",
      "completedAt": "2026-09-09T20:08:50.519Z",
      "elapsedMs": 1535,
      "usage": {
        "inputTokens": 1565,
        "freshInputTokens": 206,
        "cachedInputTokens": 1359,
        "cacheWriteTokens": null,
        "outputTokens": 66,
        "reasoningTokens": null,
        "totalProcessedTokens": 1631
      },
      "cacheEvidence": {
        "reusedTokens": 1359,
        "processedPromptTokens": 206,
        "cacheWriteTokens": null,
        "promptProcessingMs": 255.771,
        "generationMs": 1246.758,
        "authority": "authoritative",
        "source": "llama.cpp.response.timings",
        "requestPrefixSha256": "fd2564541e4b321e9c333ab5fedc4431740eaa11d9387f0ac054770e24eb63c1",
        "retainedPromptTokens": 1565,
        "retentionAuthority": "derived",
        "retentionSource": "qualified-llama.cpp-single-slot-cache-prompt"
      },
      "verifierResult": "UNKNOWN",
      "outcome": "COMPLETE"
    },
    {
      "id": "inv-e29750a6-811e-483d-9ed9-09e523814741",
      "turnNumber": 3,
      "provider": "local-cache-cold",
      "model": "qwen-cache-cold",
      "startedAt": "2026-09-09T20:08:50.533Z",
      "completedAt": "2026-09-09T20:08:51.100Z",
      "elapsedMs": 567,
      "usage": {
        "inputTokens": 1744,
        "freshInputTokens": 114,
        "cachedInputTokens": 1630,
        "cacheWriteTokens": null,
        "outputTokens": 21,
        "reasoningTokens": null,
        "totalProcessedTokens": 1765
      },
      "cacheEvidence": {
        "reusedTokens": 1630,
        "processedPromptTokens": 114,
        "cacheWriteTokens": null,
        "promptProcessingMs": 146.366,
        "generationMs": 383.867,
        "authority": "authoritative",
        "source": "llama.cpp.response.timings",
        "requestPrefixSha256": "6ef5b416cb5ec9eda740e6b658aaaefb8bb8fdacf1b707853892e099cdb073f7",
        "retainedPromptTokens": 1744,
        "retentionAuthority": "derived",
        "retentionSource": "qualified-llama.cpp-single-slot-cache-prompt"
      },
      "verifierResult": "UNKNOWN",
      "outcome": "COMPLETE"
    }
  ]
}
```

## Managed evidence artifact-932f5e5a-5b50-4924-b57a-263d9811d7f0

Name: verification-report  
Schema: agent-control.non-openai-cache-verification/v1  
SHA-256: ba8e0cd7f21c1b721fe8122bb99bce5b7fbef61fca469e91f07fa0ab866a55c1

```json
{
  "schema": "agent-control.non-openai-cache-verification/v1",
  "passed": true,
  "taskId": "MUT-001",
  "prefixVariant": "stable",
  "verifier": {
    "schema": "agent-control.mutation-verifier/v1",
    "taskId": "MUT-001",
    "passed": true,
    "startedAt": "2026-09-09T20:08:51.384Z",
    "completedAt": "2026-09-09T20:08:52.593Z",
    "checks": [
      {
        "id": "mutation_present",
        "passed": true,
        "detail": "1 changed file(s)",
        "durationMs": 0.11972099999911734,
        "evidenceIds": [
          "diff_sha256:2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
        ]
      },
      {
        "id": "scope_and_size",
        "passed": true,
        "detail": "1 additions, 1 deletions",
        "durationMs": 0.08028400000148395,
        "evidenceIds": [
          "changed_file:src/constants.js"
        ]
      },
      {
        "id": "git_diff_check",
        "passed": true,
        "detail": "clean whitespace and patch structure",
        "durationMs": 133.42737899999884,
        "evidenceIds": [
          "diff_sha256:2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
        ]
      },
      {
        "id": "javascript_syntax",
        "passed": true,
        "detail": "16 source modules checked",
        "durationMs": 892.0948610000014,
        "evidenceIds": [
          "syntax:node-check"
        ]
      },
      {
        "id": "public_regression_tests",
        "passed": true,
        "detail": "✔ capabilities are normalized and matched (1.872694ms) ✔ runtime configuration validates bounded values (0.617809ms) ✔ job transition requires the declared state machine (0.209786ms) ✔ tool policy fences stale leases and unapproved risks (0.364012ms) ✔ unknown usage remains null (0.345755ms) ✔ scheduler selects the least-loaded capable online worker (0.284959ms) ℹ tests 6 ℹ suites 0 ℹ pass 6 ℹ fail 0 ℹ cancelled 0 ℹ skipped 0 ℹ todo 0 ℹ duration_ms 99.295671",
        "durationMs": 160.7135359999993,
        "evidenceIds": [
          "tests:public-node-test"
        ]
      },
      {
        "id": "hidden_verifier:default-timeout-45s",
        "passed": true,
        "detail": "default timeout is 45000",
        "durationMs": 2.4503249999997934,
        "evidenceIds": [
          "hidden_verifier:default-timeout-45s",
          "diff_sha256:2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
        ]
      },
      {
        "id": "credential_and_topology_scan",
        "passed": true,
        "detail": "no credential or environment-topology pattern in patch",
        "durationMs": 0.5980169999984355,
        "evidenceIds": [
          "scan:bounded-diff"
        ]
      }
    ],
    "changedFiles": [
      "src/constants.js"
    ],
    "addedLines": 1,
    "deletedLines": 1,
    "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107",
    "failureClass": "NONE"
  },
  "patch": "diff --git a/src/constants.js b/src/constants.js\nindex 0971441..a72f5c0 100644\n--- a/src/constants.js\n+++ b/src/constants.js\n@@ -1,4 +1,4 @@\n-export const DEFAULT_JOB_TIMEOUT_MS = 30_000;\n+export const DEFAULT_JOB_TIMEOUT_MS = 45_000;\n \n export const JOB_STATES = Object.freeze([\n   'CREATED',\n",
  "patchSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107",
  "transcript": [
    {
      "type": "initiating-model-request",
      "at": "2026-09-09T20:08:47.427Z",
      "instruction": "CACHE QUALIFICATION PREFIX A.\nExecute mutation task MUT-001 in the current disposable repository using profile THIN. This is an actual repository change, not a prose answer. Inspect before editing, remain inside the allowlisted paths, run the typed public-test tool when practical, then request mutation.finish. ",
      "authorisedContext": [
        {
          "id": "MUT-001:control",
          "kind": "agent_control_instructions",
          "content": "Agent Control retains scheduling, ToolPolicy, leases, ownership, cancellation, human takeover and verifier acceptance. Never modify a file outside the task scope."
        },
        {
          "id": "MUT-001:repository-rules",
          "kind": "repository_instructions",
          "content": "This is a disposable frozen JavaScript repository. Use forward-slash relative paths. Do not edit package metadata unless explicitly allowed. Do not add dependencies, credentials, machine names, network addresses or provider/model conditionals. Existing public tests must continue to pass."
        },
        {
          "id": "MUT-001:system",
          "kind": "system_instructions",
          "content": "Perform a real bounded repository mutation. Inspect evidence, use only typed tools, run public tests when practical, and stop without claiming independent verification."
        },
        {
          "id": "MUT-001:task",
          "kind": "task_context",
          "content": "Task MUT-001 (trivial_bounded_edit)\nChange the governed runtime's default job timeout to 45 seconds without changing any other default or public behavior.\nAllowed mutation paths: src/constants.js\nRequired changed paths: src/constants.js\nAcceptance criteria:\n- default timeout exports 45000 milliseconds\n- public tests pass\n- only the allowed file changes\nThe independent hidden verifier is not model-visible."
        },
        {
          "id": "MUT-001:tools",
          "kind": "tool_schemas",
          "content": "[{\"id\":\"mutation.repository.read\",\"description\":\"Read one authorised repository file or a bounded line range. Input: path, optional startLine/endLine.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"startLine\":{\"type\":\"integer\"},\"endLine\":{\"type\":\"integer\"}},\"required\":[\"path\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.search\",\"description\":\"Literal compact repository search. Returns file and line indexes; use read to expand selected files.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"query\":{\"type\":\"string\"},\"paths\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}},\"caseSensitive\":{\"type\":\"boolean\"}},\"required\":[\"query\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.replace\",\"description\":\"Replace an exact string in one task-authorised file. Input oldText/newText and optional expectedOccurrences.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"oldText\":{\"type\":\"string\"},\"newText\":{\"type\":\"string\"},\"expectedOccurrences\":{\"type\":\"integer\"}},\"required\":[\"path\",\"oldText\",\"newText\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.write\",\"description\":\"Write complete bounded content to one task-authorised file. Intended for a new test or a small full-file correction.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"path\":{\"type\":\"string\"},\"content\":{\"type\":\"string\"}},\"required\":[\"path\",\"content\"],\"additionalProperties\":false}},{\"id\":\"mutation.repository.test\",\"description\":\"Run the fixture public Node test suite. It accepts no command, arguments or shell input.\",\"inputSchema\":{\"type\":\"object\",\"additionalProperties\":false}},{\"id\":\"mutation.finish\",\"description\":\"Stop the attempt after testing or when safely blocked. This is not verifier acceptance.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"summary\":{\"type\":\"string\"},\"blocked\":{\"type\":\"boolean\"},\"reason\":{\"type\":\"string\"}},\"additionalProperties\":false}}]"
        },
        {
          "id": "MUT-001:targeted-files",
          "kind": "task_context",
          "content": "FILE src/constants.js\nexport const DEFAULT_JOB_TIMEOUT_MS = 30_000;\n\nexport const JOB_STATES = Object.freeze([\n  'CREATED',\n  'ROUTED',\n  'RUNNING',\n  'VERIFICATION_PENDING',\n  'SUCCEEDED',\n  'FAILED',\n]);\n\nexport const TERMINAL_JOB_STATES = Object.freeze(['SUCCEEDED', 'FAILED']);\n"
        }
      ]
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:08:48.975Z",
      "requestPrefixSha256": "2482993f0623156f1524143a732b58c5590fff69065e28bda5a394eef31e1dd6",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.read\",\n  \"input\": {\n    \"path\": \"src/constants.js\"\n  }\n}\n```",
      "providerResponseId": "chatcmpl-3w2breXkpKs1ydXgNctImDb0AaPH6rR2",
      "responseModel": "qwen-cache-cold",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1328,
        "completion_tokens": 32,
        "total_tokens": 1360,
        "prompt_tokens_details": {
          "cached_tokens": 497
        }
      },
      "timings": {
        "cache_n": 497,
        "prompt_n": 831,
        "prompt_ms": 835.77,
        "prompt_per_token_ms": 1.005740072202166,
        "prompt_per_second": 994.2926881797624,
        "predicted_n": 32,
        "predicted_ms": 591.31,
        "predicted_per_token_ms": 18.4784375,
        "predicted_per_second": 54.117129762730215
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:08:48.984Z",
      "tool": "mutation.repository.read",
      "input": {
        "path": "src/constants.js"
      },
      "output": {
        "path": "src/constants.js",
        "startLine": 1,
        "endLine": 13,
        "totalLines": 13,
        "complete": true,
        "content": "   1 | export const DEFAULT_JOB_TIMEOUT_MS = 30_000;\n   2 | \n   3 | export const JOB_STATES = Object.freeze([\n   4 |   'CREATED',\n   5 |   'ROUTED',\n   6 |   'RUNNING',\n   7 |   'VERIFICATION_PENDING',\n   8 |   'SUCCEEDED',\n   9 |   'FAILED',\n  10 | ]);\n  11 | \n  12 | export const TERMINAL_JOB_STATES = Object.freeze(['SUCCEEDED', 'FAILED']);\n  13 | "
      }
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:08:50.517Z",
      "requestPrefixSha256": "fd2564541e4b321e9c333ab5fedc4431740eaa11d9387f0ac054770e24eb63c1",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.replace\",\n  \"input\": {\n    \"path\": \"src/constants.js\",\n    \"oldText\": \"30_000\",\n    \"newText\": \"45_000\",\n    \"expectedOccurrences\": 1\n  }\n}\n```",
      "providerResponseId": "chatcmpl-RI1FVUY5ejTrbC1bJ76UdGwdGREG9gwQ",
      "responseModel": "qwen-cache-cold",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1565,
        "completion_tokens": 66,
        "total_tokens": 1631,
        "prompt_tokens_details": {
          "cached_tokens": 1359
        }
      },
      "timings": {
        "cache_n": 1359,
        "prompt_n": 206,
        "prompt_ms": 255.771,
        "prompt_per_token_ms": 1.2416067961165047,
        "prompt_per_second": 805.407962591537,
        "predicted_n": 66,
        "predicted_ms": 1246.758,
        "predicted_per_token_ms": 18.890272727272727,
        "predicted_per_second": 52.9372981765507
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:08:50.532Z",
      "tool": "mutation.repository.replace",
      "input": {
        "path": "src/constants.js",
        "oldText": "30_000",
        "newText": "45_000",
        "expectedOccurrences": 1
      },
      "output": {
        "ok": true,
        "path": "src/constants.js",
        "occurrences": 1,
        "changedFiles": [
          "src/constants.js"
        ],
        "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
      }
    },
    {
      "type": "provider",
      "at": "2026-09-09T20:08:51.099Z",
      "requestPrefixSha256": "6ef5b416cb5ec9eda740e6b658aaaefb8bb8fdacf1b707853892e099cdb073f7",
      "assistantOutput": "```json\n{\n  \"tool\": \"mutation.repository.test\",\n  \"input\": {}\n}\n```",
      "providerResponseId": "chatcmpl-qOHcMBtKzBjnDdJMyyTKUltBpkuwWdby",
      "responseModel": "qwen-cache-cold",
      "finishReason": "stop",
      "usage": {
        "prompt_tokens": 1744,
        "completion_tokens": 21,
        "total_tokens": 1765,
        "prompt_tokens_details": {
          "cached_tokens": 1630
        }
      },
      "timings": {
        "cache_n": 1630,
        "prompt_n": 114,
        "prompt_ms": 146.366,
        "prompt_per_token_ms": 1.2839122807017544,
        "prompt_per_second": 778.8694095623299,
        "predicted_n": 21,
        "predicted_ms": 383.867,
        "predicted_per_token_ms": 18.279380952380954,
        "predicted_per_second": 54.706447806141185
      }
    },
    {
      "type": "tool",
      "at": "2026-09-09T20:08:51.302Z",
      "tool": "mutation.repository.test",
      "input": {},
      "output": {
        "passed": true,
        "exitCode": 0,
        "timedOut": false,
        "cancelled": false,
        "stdout": "✔ capabilities are normalized and matched (2.832246ms)\n✔ runtime configuration validates bounded values (0.83162ms)\n✔ job transition requires the declared state machine (0.302643ms)\n✔ tool policy fences stale leases and unapproved risks (0.346525ms)\n✔ unknown usage remains null (0.367884ms)\n✔ scheduler selects the least-loaded capable online worker (0.342671ms)\nℹ tests 6\nℹ suites 0\nℹ pass 6\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 114.803626\n",
        "stderr": "",
        "changedFiles": [
          "src/constants.js"
        ],
        "diffSha256": "2fc89fcf1369eebf641c41ea063c022d541b9c117e20d51382de408aa8047107"
      }
    }
  ]
}
```

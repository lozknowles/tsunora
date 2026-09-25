# Cache-Aware Expert Delegation

This is the Agent Control 4.3 operator and architecture guide for Warm Experts
and the **Warm Cache Runtime** dashboard.

Agent Control 4.3 treats a route as a temporary Warm Expert only after a genuine, independently verified model invocation supplies reusable-context evidence. The identity is the complete `worker + provider + account profile + model + node + session + cache scope + backend instance` tuple. Expertise belongs to that tuple and a hashed context domain; it is never a permanent model label.

> A warm cache improves efficiency but does not confer correctness or authority. Capability, integrity and governance always outrank cache warmth.

## Production flow

```text
Work Parcel
  -> qualified provider/model candidates
  -> capability, node, health and transport-integrity gates
  -> adaptive quality/cost/latency policy
  -> cache compatibility and freshness assessment
  -> independently checked route decision
  -> normal Job dispatch
  -> provider invocation and independent result verification
  -> authoritative/derived/unavailable cache observation
  -> durable registry, baton, audit, transcript and dashboard
```

The Cache Expert Registry is part of the normal `WorkParcelCoordinator` lifecycle. It does not introduce a scheduler or bypass the Model Registry, worker placement, adaptive orchestration, `ToolPolicy`, transport integrity, approvals or verification. Cache affinity contributes a bounded bonus only among candidates that already pass those gates. The normal quality/cost/capability decision can still select another route, and that final choice is written back to the cache decision record.

## Evidence and acquisition

Provider adapters normalize three evidence classes:

- `AUTHORITATIVE`: the provider or backend directly reports reused/cached and newly processed prompt tokens. llama.cpp `timings.cache_n` and `timings.prompt_n` are one qualified example.
- `DERIVED`: bounded backend instrumentation can establish retained context for the next request. Derived evidence is labelled with its source and is excluded from preference unless `allowDerivedPreference` is explicitly enabled.
- `UNAVAILABLE`: reliable cache state is not exposed. The dashboard shows `CACHE STATE UNKNOWN`; absence is not converted to zero reuse.

A record is created or updated only after an actual terminal invocation. The record retains hashes and scoped metadata rather than raw prompts: repository/project identity, branch/dependency/instruction/tool/governance/transport hashes, immutable-context and prompt-prefix fingerprints, task tags, token counts, timestamps, health, outcome, verifier status and evidence references. The last 100 bounded task observations remain available for audit.

Cold population and actual reuse are distinct. A backend may explicitly expose qualified retained-token state for a subsequent request while the current cold request still reports `0` reused tokens. Agent Control stores those as `expectedReuseRatio` and `reuseRatio`; it never rewrites the cold observation into a warm hit. After execution, direct provider counters replace estimates as the source of truth for the completed invocation.

## Compatibility and context delta

The compatibility guard returns `EXACT`, `HIGH`, `PARTIAL`, `INCOMPATIBLE` or `UNKNOWN`.

- Repository, task type, transport context, branch/worktree, dependency, instruction, tool-contract and governance-policy mismatches are material and therefore incompatible.
- An equal prompt-prefix fingerprint is `EXACT`.
- An equal immutable-context fingerprint is `HIGH`.
- Otherwise tagged context overlap produces an explicitly estimated delta. Policy controls the `HIGH` and `PARTIAL` cut-offs.
- Provider, model, account, node, session, cache-scope and backend-instance identity are compared before context compatibility. Evidence never crosses a different route identity.

Only `EXACT` and `HIGH` can add a cache preference. `PARTIAL`, `INCOMPATIBLE` and `UNKNOWN` remain visible but contribute no cache score. A completed incompatible invocation in the same backend/cache scope invalidates the displaced context. A detected restart, session loss or eviction invalidates matching records explicitly.

## Lifecycle and scoring

Time-based states are `HOT`, `WARM`, `COOLING`, `EXPIRED` and `INVALIDATED`. Defaults are 10 minutes hot, 60 minutes warm and 240 minutes to expiry. `HOT` also requires an expected or observed reuse ratio of at least 70%. Only verified `HOT` or `WARM` records meeting the minimum 25% reuse policy are eligible for a bonus.

The cache score is bounded:

```text
cache bonus = maximumScoreBonus
              × compatibility factor (EXACT 1.0, HIGH 0.75)
              × freshness factor (HOT 1.0, WARM 0.7)
              × expected reuse ratio
```

The default maximum bonus is `0.15`. The base order supplied by governed model routing remains visible. Worker placement already rejects unavailable capacity and incompatible capabilities; the adaptive decision layer retains verified task quality, historical success, latency and sourced cost. Thus cache warmth may break a close, otherwise qualified choice but cannot overcome capability, integrity, health, load/placement, policy or stronger verified performance.

Every assessment records all candidates, eligibility and rejection reasons, base/cache/total score, compatibility, estimated context delta, evidence authority, expected reuse, selected route and independent decision-verifier result. The selected decision and expert IDs are sealed into the stage baton. The invocation’s actual cache result and independent task verifier are then linked through the Work Parcel audit.

## Cost and privacy

When an invocation provides both authoritative pricing and complete reuse/processed counters, the registry can show estimated cold prompt cost, actual warm prompt cost, saved prompt cost and percentage saving with source and currency. Without both inputs it shows exactly `MONETARY SAVING UNAVAILABLE`. Performance observations remain separate from monetary claims.

Raw prompt text is not stored in the Cache Expert Registry. The API and dashboard expose hashes, safe route identities and bounded operational reasons only. Credentials, provider requests, raw responses and private model reasoning are excluded. Existing Work Parcel transcript access remains operator authenticated and separately governed.

## Operator controls

Configure `cacheAwareExperts` in the canonical Agent Control JSON file or use **Configuration → Warm Experts**. Changes are revision checked, validated, written atomically and require a controller restart.

```json
{
  "cacheAwareExperts": {
    "enabled": true,
    "hotMinutes": 10,
    "warmMinutes": 60,
    "expiryMinutes": 240,
    "hotReuseRatio": 0.7,
    "minimumReuseRatio": 0.25,
    "highCompatibilityMaximumDelta": 0.25,
    "partialCompatibilityMaximumDelta": 0.6,
    "maximumScoreBonus": 0.15,
    "allowDerivedPreference": false
  }
}
```

Keep `allowDerivedPreference` false unless the specific backend retention mechanism has been independently qualified. Set `enabled` false to preserve registry observations while removing cache affinity from route scoring.

Open **Warm Cache Runtime** for the live operational projection:

- **Runtime Timeline** joins actual Work Parcel stages, model invocations, queue/wait state, sealed batons, warm/cold results, invalidation and fallback activation.
- **Cache Heatmap** plots discrete provider observations by exact route. Blank cells are `UNKNOWN`; gaps are not treated as warm time.
- **Agent & Process Utilization** reports measured stage count, invocation latency, cache-use percentage and route distribution.
- **Warm Experts** ranks the exact worker/provider/account/model/node/session/cache/backend records by the current governed decision.
- **Compatibility Matrix** contains only route relationships evaluated by durable decisions. Any compatibility percentage is explicitly derived from estimated context delta.
- **Candidate Routes** and **Route Explanation** show qualification, compatibility, cache state, reuse, score components, final selection and the full human-readable operational transcript.
- **Cross-lane Visibility** distinguishes exact same-session scope, observed compatible reuse, invalidated relationships and unavailable/unknown relationships.

The views update through the same Work Parcel SSE events and periodic reconciliation as the rest of the dashboard; no browser state becomes routing authority. Values are sourced from provider-normalized invocation evidence, the Cache Expert Registry, Work Parcel audit and durable route decisions. Latency, cost or cross-lane benefit that was not reported is shown as unavailable rather than estimated silently.

## Failure modes and provider differences

- No telemetry: show `CACHE STATE UNKNOWN`; apply no bonus.
- Stale record: transition to `COOLING` or `EXPIRED`; apply no bonus.
- Material context change: reject the old cache for the incoming task; after incompatible work occupies the same scope, invalidate the displaced record.
- Provider/session/backend change: identity mismatch prevents reuse; a restart observation invalidates the old instance.
- Integrity, capability, health or placement failure: reject the route regardless of warmth.
- Verification failure: retain the historical observation but do not use it as a verified Warm Expert.
- Provider counters disagree with an estimate: the completed provider counters are authoritative.
- Missing pricing: show `MONETARY SAVING UNAVAILABLE` and make no billing claim.

Provider adapters may differ in what they can report, but core lifecycle, compatibility, scoring, audit and fail-closed behavior do not depend on llama.cpp, OpenAI or any particular model. The feature still functions as an honest no-preference registry when every provider reports cache evidence as unavailable.

## Physical qualification

The 2026-09-09 A–F qualification ran two isolated non-OpenAI llama.cpp/Qwen routes through the normal Work Parcel lifecycle. The cold first invocation reported `0 reused / 1,328 processed`; the compatible follow-on reported `1,327 reused / 1 processed`. Its verified `HOT/HIGH` cache evidence raised the warm candidate from base `0.9500` to `1.0551`, above the equally capable cold candidate at `1.0000`, so Agent Control deliberately changed the route. The incompatible task gave the prior warm candidate no bonus, material context invalidated the displaced record, and a replacement backend process appeared as `CACHE STATE UNKNOWN` rather than inheriting warmth. All stages, provider invocations and route decisions passed their independent checks.

The same run measured a `65.32×` prompt-processing improvement for the matched cold/warm first invocation and a `3.17×` end-to-end invocation improvement. `MONETARY SAVING UNAVAILABLE` remains the truthful result because the local backend supplied no authoritative billing data. See the [tracked qualification record](provenance/EXTERNAL-EVIDENCE.md); the checksummed complete transcript, machine record, dashboard screenshot and 1920×1080 video remain in the protected qualification evidence root recorded there.

The release integration repeated A–F against product candidate `27bc4c596bbde1db2696d62d38ca17d8bf8cab21`. Fresh measurements were cold `0 reused / 1,328 processed`, warm `1,327 reused / 1 processed`, `66.39×` prompt-processing improvement and `3.14×` end-to-end invocation improvement. The warm candidate scored `1.055146` against the equally capable cold candidate's `1.000000`; incompatible context received no bonus, material context invalidated prior warmth and a restarted backend was `CACHE STATE UNKNOWN`. Every Work Parcel stage, invocation, routing decision and independent verifier passed. See the [integrated qualification](evidence/agent-control-4.3-integrated-qualification-20260909.md), [complete transcript](evidence/agent-control-4.3-integrated-transcript-20260909.md) and [HD recording](./evidence-archive.md).

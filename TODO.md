# Agent Control follow-up

## After the 4.11 governed model-improvement release

- [ ] Qualify additional intervention ladder levels on real, already-authorised models; every result remains model/runtime/hardware specific.
- [ ] Add optional bounded canary routing only when deterministic allocation and rollback can be represented without invented percentages.
- [ ] Add independent security and regression evaluator adapters without allowing a candidate or teacher to control them.
- [ ] Extend economic evidence when providers or meters supply authoritative cost and energy data; preserve `UNAVAILABLE` otherwise.

## 4.9 security-audit candidate follow-up

- [ ] Obtain explicit review approval for the isolated candidate before merge,
      tag, publication or deployment.
- [ ] Qualify a target-execution sandbox only when network denial, environment
      allowlisting, bounded resources, scratch-only writes and process cleanup
      are all independently evidenced.
- [ ] Add model-diverse verification where an independently authorised provider
      route is available; never spend provider tokens merely to decorate release
      evidence.
- [ ] Keep historic GLM review packets under their original provenance while
      comparing dispositions against native audit records.

See [Governed security audits](docs/security-audits.md).

# Agent Control 4.8 navigable-workspaces follow-up

- [x] Add bounded durable per-operator favourites containing only opaque workspace IDs. The current authenticated web operator is the identity boundary; richer multi-principal retention remains future work.
- [x] Add global paginated workspace search over authoritative Estate, Node Dashboard, Run Inspector and invocation records without creating a second Estate database.
- [x] Add project workspaces from durable Work Board declarations and repository workspaces from resolved parameterized-job snapshots, preserving reviewed commit identity and run associations.
- [x] Connect exact matching execution sessions to the existing governed Live Shell in read-only WATCH mode. Opening a workspace still grants no control authority.
- [x] Connect retained Agent Control-managed artifacts to the existing authenticated, redacted artifact viewer. Arbitrary repository/host source browsing remains outside workspace authority by design.
- [x] Add bounded cursor pagination to global workspace search. Further indexed storage remains evidence-driven future work if measured Estate size requires it.

See [Navigable Workspaces](docs/navigable-workspaces.md) and [the architectural review](NAVIGABLE_WORKSPACES_REVIEW.md). Prototype status does not imply release.

# Agent Control 4.7 follow-up

The core/browser release is separate from these remaining voice tasks. Preserve the original qualification evidence.

- [ ] Qualify the existing authorised live provider route and final session usage.
- [ ] Complete physical Pixel microphone/playback, interruption, network and Bluetooth checks.
- [ ] Complete a non-trivial spoken model job with genuine baton/cache evidence and spoken result.
- [ ] Qualify a responsive local speech route and defensible shared-session cost allocation.

[Current release scope](docs/release-notes-4.7.0.md) · [Known limitations](docs/known-limitations-4.7.md)

## Historical work plans

# Agent Control 4.6 security release recovery

- [x] Preserve the reviewed snapshot and accepted review packets.
- [x] Isolate remediation from the canonical and release-integration checkouts.
- [x] Contain older overlay-published dashboards while preserving loopback controllers and remote administration.
- [x] Fix and verify confirmed release-gate, snapshot, browser, HTTP-authentication, output-redaction, lease, Git, session-player, energy-routing, journal-lock, evidence-retention, benchmark-classification and maintenance-timeout defects.
- [x] Run the complete repository check: 1,490 tests passed with zero failures.
- [ ] Produce a trusted schema-v2 full-suite receipt for the exact final candidate.
- [ ] Obtain external protected operator approval bound to the candidate and receipt.
- [ ] Physically qualify virgin install, supported upgrade and required device/browser paths for the exact package.
- [ ] Close or explicitly accept the Windows discovery descendant-timeout and distinct-principal ACP boundaries.
- [ ] Merge, tag, publish and deploy only after the hardened release gate passes and those actions are separately authorised.

# Agent Control 4.5 work plan

This is the canonical roadmap. Agent Control 4.5 release closure is occurring on
`feature/4.5-release-closure`; the exact current verdict is
[PASS WITH LIMITATIONS — READY FOR 4.5 RELEASE](docs/provenance/EXTERNAL-EVIDENCE.md).
No merge, tag, release or deployment is implied by checked boxes here.

## Environment Discovery and unified Estate Map (4.5)

- [x] Add read-only local/configured/edge adapter contracts, non-secret scan
      history, change reconciliation and explicit qualification/apply gates.
- [x] Add user-defined capability registry and safe import/export lifecycle.
- [x] Reuse the Runtime Map schema and renderer for Process Map and Estate Map,
      including freshness-aware Estate heartbeat and connection inspection.
- [x] Add bootstrap/install inspection and portable Linux/Windows entry points.
- [x] Physically qualify the configured controller, MSI, remote Linux and Pixel paths
      used by 4.5 evidence. Undiscovered or operator-disabled resources remain
      explicitly unavailable rather than being inferred healthy.

## Runtime Map / Process Explorer workstream

- [x] Project authoritative Work Parcels, Runs, workers, model calls, terminal
      sessions, decisions, batons, cache, memory, retries and verification into
      one provider-neutral graph schema.
- [x] Add live accessible graph layout, automatic clustering, pan/zoom/fit,
      Control Room, drill-down, authenticated session links and Replay.
- [x] Add grounded Morrow references, redaction/access boundaries, 50+ job tests,
      physical parallel qualification, HD video and complete transcript.
- [x] Add synchronized graphical dual-run Compare over independently projected
      authoritative runs, with explicit evidence/route facets and no label-based
      identity inference.
- [ ] Add governed map-originated pause/cancel/retry/approval controls only by
      delegating to existing authorization and audit APIs; WATCH remains the
      default and current Runtime Map authority.

This file records implementation and deferred work. It is not a release
declaration. Agent Control 4.4.0 remains the released baseline until a separate
4.5 release operation is explicitly approved and completed.

## Cross-device Session Vault workstream

Branch: `feature/4.5-cross-device-session-vault` from governed checkpoint
`5bd72802b6525a1ccce05df2a42be2e04c456d67`.

Objective: preserve provider-native session evidence as immutable objects,
normalize it into provider-neutral searchable provenance, replicate stable
objects, and create governed contextual continuations on another node without
mutating or silently reopening the source session.

Architectural decisions:

- Session Vault is historical evidence, not a replacement for Your Memories,
  Work Parcels, batons, execution sessions, UX sessions or artifacts.
- Your Memories promotion uses the existing `ProjectMemoryPort` admission and
  retains Session Vault object hashes as provenance; capture alone never creates
  durable memory.
- The existing structured-Markdown/Obsidian-compatible memory port remains the
  optional memory backend. Obsidian is neither mandatory nor the Session Vault.
- Provider-native files remain immutable source evidence. The core event,
  decision, provenance, replication and continuation contracts are provider
  neutral; Codex JSONL is the first adapter.
- Cross-device continuation creates a new governed session and Work Parcel,
  requires repository-state verification and an exclusive lease, and preserves
  the original session unchanged.

Current work:

- [x] Inspect existing Your Memories, Obsidian-compatible Markdown, exchange,
      consolidation, route qualification, evidence, session and Work Parcel layers.
- [x] Inspect the installed Codex 0.154.0 session location and observed JSONL
      record envelopes without treating Codex fields as the core schema.
- [x] Implement immutable capture, normalization, indexes, provenance,
      replication, policy, continuation/branching and lease boundaries.
- [x] Integrate authenticated API, Session Vault dashboard and governed POE
      inspection/continuation operations.
- [x] Add focused tests and all required architecture, threat, schema, operator,
      recovery and migration documentation.
- [x] Physically qualify scenarios A–H on at least two available nodes, including
      Your Memories provenance and Obsidian-enabled/disabled operation.

Checkpoint result: physical A–H pass across two governed Linux nodes, including
a real Codex 0.154 source session, governed continuation Work Parcel, immutable
replication, split-brain denial audit, synthetic-secret and tamper gates, and a
provider-neutral non-Codex adapter. The existing ProjectMemoryPort path and
Obsidian-disabled survival pass. Later release-gate evidence qualified the two
isolated MSI Codex profiles and a genuine Obsidian-backed cross-model
continuation without exposing node-local credentials. The final 4.5 verdict is
recorded in the release-closure audit; unavailable individual routes remain
experimental and fail closed.

Unresolved risks and physical gates:

- Session files may be actively appended and must never be labelled complete.
- Provider evidence can contain secrets and private source; regex scanning alone
  is insufficient, so replication requires policy classification and encryption
  or exclusion where appropriate.
- Exact commit/line attribution may remain ambiguous and must carry confidence.
- A second reachable node, stable repository snapshot and approved harmless
  continuation are required for physical A–E; no pass may be simulated.
- Release remains **EXPERIMENTAL** until every mandatory integrity, access,
  split-brain, dashboard and cross-device gate is physically proven.

## Governed skill-learning workstream

- [x] Establish an isolated branch from the clean `v4.4.0` product checkpoint.
- [x] Inventory reusable model, routing, Work Parcel, verification, evidence,
      Warm Expert, dashboard and POE boundaries.
- [x] Record the pre-runtime architecture and current-hardware training decision.
- [x] Implement the provider-neutral learned-skill lifecycle and durable Skill
      Adapter Registry.
- [x] Add dataset, frozen-evaluation, training, qualification and failure gates.
- [x] Admit only qualified base-model-plus-skill candidates to normal governed
      routing; keep learned skill and cache warmth independent.
- [x] Add read-only dashboard and POE projections for Learned Specialists.
- [x] Add deterministic lifecycle, isolation, provenance, routing, recovery and
      leakage tests.
- [x] Run one real bounded baseline, adaptation and frozen-evaluation experiment
      without disturbing protected services.
- [x] Physically prove positive specialist routing and an inappropriate-task
      rejection through the production Work Parcel path.
- [x] Reconcile metrics, hashes, environment, limitations and failure exercises
      in reproducible evidence bundles.
- [x] Update canonical 4.5 documentation and run complete validation on the
      governed candidate branches. Merge, tag, release and deployment remain a
      separate operator-authorized operation.

## Morrow integration follow-up

- [x] Combine the original Morrow identity and coordinated six-robot artwork with the completed 4.5 route-governance branch.
- [x] Preserve the existing qualification bundle and its experimental recommendation.
- [x] Qualify the combined candidate on desktop/mobile with reduced/off motion,
      physical voice/social invocation and a harmless governed Work Parcel,
      retaining evidence separately from historical POE runs.

See the [combined integration record](docs/provenance/EXTERNAL-EVIDENCE.md) for automated checks and the exact source parents. Earlier unchecked items above describe the original skill-learning workstream; the [completion report](docs/provenance/EXTERNAL-EVIDENCE.md) records its later qualification outcomes.

## MiniCPM5 closure and integrated runtime safety

- [x] Preserve the original exact MiniCPM5-2B Q4_K_M failure and follow-up
      evidence without converting scripted controls into model success.
- [x] Keep that exact failed configuration out of governed code-repair routing
      without generalising the result to sibling models.
- [x] Integrate provider-neutral execution authority, between-tool cancellation,
      cleanup uncertainty and bounded Linux/NVIDIA process-resource sampling.
- [x] Retain failed-attempt evidence and independently verify the focused and
      complete suites. The failed MiniCPM configuration remains disabled.

## Agent Control 4.6 backlog — Agent Orchestrator review

The 4.5 Process Map remains the baseline. These are planned 4.6 investigations,
not shipped 4.5 capabilities:

- [ ] Perform a source-level comparison with
      `Untrivial-ai/agent-orchestrator` and record licence/provenance boundaries.
- [ ] Adopt only useful generic orchestration concepts that preserve Agent
      Control's existing Work Parcel, policy, evidence and runtime sources of truth.
- [ ] Deepen Process Map drill-down from jobs to workers, calls, tools, terminal
      sessions and evidence.
- [ ] Improve read-only live terminal/session WATCH behaviour; any control action
      must continue through governed authorization and audit.
- [ ] Improve Process Map ↔ Estate Map navigation and shared identity linking.
- [ ] Improve event-driven live graph reconciliation, stale-state handling and
      high-cardinality rendering.
- [ ] Evaluate worker/session isolation improvements without replacing the 4.5
      execution engine.
- [ ] Refresh README visuals with any genuinely qualified 4.6 improvements.
- [ ] Add primitive approved desired-state/remediation actions; do not present
      these as 4.5 Estate Map functionality.


## Shared Speech integration candidate (2026-09-24)

- [ ] Qualify current-main MSI microphone-to-speaker integration after a permitted secure pilot route is available.
- [ ] Separately qualify an SDK live capture-event contract for acoustic barge-in; Stop/push-to-talk is not equivalent.
- [ ] Grounding/conversation improvements remain deferred research; conservative behaviour retained.
- Integration design and boundaries: [Shared Speech adapter](docs/provenance/EXTERNAL-EVIDENCE.md).

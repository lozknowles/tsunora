# Agent Control 3.8 architecture review

Status: feature-branch design baseline. Starting point: released Agent Control 3.7 commit `41ae59c6bd0e0228e419a91959efe7130fe086f2`.

## Decision

Agent Control 3.8 extends the existing control plane; it does not add a parallel agent or context runtime.

| Concern | 3.8 treatment | Existing authority |
| --- | --- | --- |
| Work identity, leases and execution | Reuse | Work Parcels and contract runtime |
| Provider/model/node routing | Reuse | model registry and governed handoff |
| Live token pressure and cost | Reuse | 3.7 token-aware baton runtime |
| Context budgets and profiles | Extend | `ContextPacketBuilder`, THIN/STANDARD/DEEP |
| Known relationships and deduplication | Extend | `ContextGraph` |
| Verification and durable provenance | Extend | verifier, parcel audit and evidence stores |
| Streaming operator state | Extend | typed events, existing SSE stream and dashboard projection |
| Retrieval intent, providers and progressive policy | New | provider-neutral governed retrieval contracts |
| Compact, content-addressed retrieved evidence | New | Evidence Packet v1 |
| External-system technique adoption | New, lightweight | provider-technique registry document/data |

The architecture test is: if Codex or zg disappeared, exact and lexical retrieval, evidence construction, policy, context assembly, verification and baton portability would continue to work. Provider-native search, MCP, vector systems and zg are capability adapters beneath the same port.

## Governed flow

```text
Work Parcel
    -> Retrieval Intent
    -> Retrieval Governor <---------------- Token Governor (pressure/budget)
    -> exact | lexical | semantic | hybrid retrieval providers
    -> content-addressed Evidence Packet
    -> ContextGraph -> ContextPacketBuilder
    -> provider/model execution -> independent verification
    -> portable baton (evidence references, never provider-private state only)
```

The governor starts with the cheapest available high-confidence strategy and escalates only when evidence coverage/confidence is insufficient. It records every attempt, fallback and escalation. Context pressure reduces the evidence budget and favours references over broad raw context; it never silently changes provider/model or grants index mutation.

## Boundaries

- `retrieval.search` and `retrieval.inspect` are execution capabilities. `retrieval.index.manage`, configuration mutation and repository mutation are separate operator/admin authorities.
- Repository evidence is tied to repository identity, Git SHA/tree state, dirty-state fingerprint and content hash. It is `CURRENT`, `POSSIBLY_STALE` or `INVALID`; stale evidence is never projected as current.
- Evidence packets contain bounded excerpts and portable provenance. Index locations, raw tool output, credentials and provider-private continuation state are excluded.
- Local retrieval is the default. REMOTE or HYBRID retrieval requires explicit policy permission and is labelled in evidence and telemetry.
- Missing zg, vector models, indexes, MCP, network or a crashing provider degrades through hybrid/vector -> lexical -> exact -> controlled reads. Startup never requires zg.

## Codex 0.153 findings carried forward

Codex context-management, compaction/new-context signals and persisted usage are useful adapter inputs. The generic techniques—separating lifetime usage from active occupancy, explicit context lifecycle events, compact continuation state, and persisted usage—remain in Agent Control core. Codex configuration and app-server events remain behind the Codex adapter; `new_context` is never the only baton representation.

## zg reference assessment

Reviewed `zvec-ai/zvec-grep` at `81a80f478f2d3ec76556cd3c993d0d064cc9580a` (`@zvec/zvec-grep` 0.2.1). The generic ideas adopted are local-first retrieval, exact/BM25/vector/hybrid composition, compact path/line evidence, explicit freshness, incremental indexing, reciprocal-rank fusion, and a deliberately small agent-facing search surface. Agent Control's optional adapter invokes only search. Index construction/rebuild/drop remain external governed qualification operations and their cold cost is reported separately.

This note is deliberately written before implementation and is the baseline against which the implementation and benchmark are reviewed.

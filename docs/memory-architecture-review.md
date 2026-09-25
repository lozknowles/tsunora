# Agent Control 4.4 memory architecture review

Status: architectural recommendation released with Agent Control 4.4.0 and backed by an isolated physical experiment. The generic automatic memory runtime remains unimplemented.

## Decision

Classify the result as **C — GENERIC MEMORY ABSTRACTION**.

Persistent consolidated memory is useful to Agent Control, but MARM must remain an optional backend. The physical comparison preserved 8/8 verified answers while reducing supplied context from 6,022 to 550 estimated tokens (90.87%) and provider input from 7,844 to 1,608 tokens (79.50%). It did not reduce the number of authoritative source files represented in provenance, did not improve model latency, and supplied no monetary billing data. These limits rule out claiming a universal performance or cost benefit and rule out making MARM a core dependency.

The smallest justified product change is a provider-neutral memory port layered over the existing `ContextGraph`, governed retrieval, Evidence Packets and Context Packet compiler. No memory may mutate Work Parcels, batons, policy, verification, evidence or execution state.

## What MARM actually implements

Source was inspected at upstream commit `0b4013de9e854fccd211d7fdb8e35ff6596ec4a1`; the package reports 2.48.0.

- SQLite/WAL persistent memories, sessions, logs and notebooks, with FTS5 and chunk records.
- Exact/full-text and semantic recall. Semantic recall uses bounded FTS candidates followed by embedding, BM25 and temporal ranking, with a bounded full-vector fallback.
- Lazy local embeddings using Jina v2 small, 512 dimensions. Writes remain possible if the encoder is unavailable.
- Write-time normalized-content hashing and semantic duplicate detection. Duplicate content is merged into an existing memory with merge metadata.
- Project, platform and session filters.
- A serialized asynchronous write queue, pooled database access and leased database locks for cross-process work.
- Staged compaction of older same-session memories. Staging records source IDs and hashes; apply excludes compacted sources from normal recall.
- Agent-supplied compaction summaries, with a server-side centroid/extractive fallback after bounded nudges.
- Explicit correction/replacement, deletion and metadata update operations.
- Separate optional code and concept graphs. Graph augmentation is a bounded sidecar; primary memory ranking remains authoritative and graph failure is fail-open.
- HTTP and stdio MCP exposure with equivalent memory operations.

MARM does **not** itself stop a normal model, free VRAM, load a stronger consolidation model, or choose an idle period. That scheduling technique belongs above a memory backend. MARM's compaction scheduler finds candidates and accepts an agent-produced summary; it is not a model lifecycle controller.

MARM preserves internal source memory IDs and content hashes during compaction, but it cannot establish whether an external repository, policy or Agent Control record is still authoritative. Agent Control must bind external Evidence Packet provenance and revalidate source hashes before injection.

## Capability comparison

| Capability | MARM | Agent Control 4.3 baseline | 4.4 decision |
| --- | --- | --- | --- |
| Durable authoritative workflow state | Memories/logs, not an execution authority | Work Parcels, Runs, batons, evidence and policy are durable and authoritative | Keep Agent Control authority unchanged |
| Exact/lexical retrieval | FTS5 and exact modes | Built-in exact/BM25 governed retrieval | Already equivalent for repository evidence |
| Semantic/hybrid retrieval | Embeddings plus reranking; optional graph augmentation | Provider-neutral retrieval adapters and `ContextGraph` | MARM can be one adapter |
| Persistent semantic memory | SQLite memory records | `ContextGraph` contract exists; current implementation is in-memory | Useful enhancement |
| Provenance | Memory IDs, source hashes and compaction source lists | Content-addressed Evidence Packets, repository identity and source rehydration | Agent Control provenance is stronger for external authority; bind both |
| Deduplication | Exact hash and semantic duplicate merge | Evidence/content hashes prevent duplicate authoritative packets | Backend feature; expose outcome generically |
| Consolidation/compaction | Candidate clustering and summary apply | Batons and token compaction preserve operational continuation, not long-lived semantic knowledge | Complementary, not equivalent |
| Correction/deletion | Replace/delete memory | Authoritative records are append-only or governed by their owning subsystem | Permit memory correction/forget only; never rewrite authority |
| Scope | Session/project/platform | Parcel, repository, provider/account/model/node, lane, policy and transport identities | Generic scope must be richer than MARM's native fields |
| Concurrency | Write queue, WAL, pooled connections, leased locks | Runtime ledgers and resource locks | Backend-specific implementation |
| Code/concept graphs | Optional sidecars | `ContextGraph` and retrieval adapters | Optional; do not duplicate graph authority |
| Idle stronger-model scheduling | Not implemented by MARM | Existing scheduling, resource governance and model routing can host it | Future experiment, not part of this result |
| Dashboard/audit | Backend tooling | SSE, human-readable transcripts and durable evidence | Project only sanitized memory lifecycle facts |

## Memory, state and evidence boundary

Authoritative state answers what Agent Control must do and what actually happened. Memory offers historical knowledge that may help a later model reason.

```text
authoritative logs/evidence/state
            |
            v
candidate extraction -- model output remains untrusted
            |
            v
classification + deduplication + verification
            |
            v
advisory memory record + immutable source references
            |
            v
scoped recall + freshness/hash revalidation
            |
            v
ContextGraph / Context Packet augmentation
            |
            v
agent execution -- normal policy and independent verification still apply
```

The model may propose memory text and classification. Agent Control, not the model, binds Evidence Packet IDs, source hashes, repository identity, scope and verification status. A recalled item is rejected if it is unverified, superseded, outside scope, missing provenance, or no longer matches its authoritative source. Recall cannot grant capabilities, approve work, change routing, complete a criterion or become verification evidence merely because it ranked highly.

## Minimum generic contract

This is a design contract, not an implementation in this branch.

```ts
interface AgentMemoryPort {
  remember(candidate: MemoryCandidate, authority: EvidenceBinding): Promise<MemoryReceipt>;
  recall(intent: MemoryRecallIntent): Promise<MemoryRecallResult>;
  consolidate(intent: MemoryConsolidationIntent): Promise<ConsolidationPlan>;
  applyConsolidation(planId: string, verifiedSummary: VerifiedMemory): Promise<MemoryReceipt>;
  correct(id: string, replacement: VerifiedMemory): Promise<MemoryReceipt>;
  invalidate(ids: string[], reason: MemoryInvalidationReason): Promise<void>;
  forget(ids: string[], authority: ForgetAuthority): Promise<void>;
  trace(id: string): Promise<MemoryProvenance>;
  health(): Promise<MemoryBackendHealth>;
}
```

Required generic fields are: opaque memory ID; backend ID/version; content hash; content classification; created/effective/invalidated timestamps; project/repository/lane/session/provider scope; originating model route; verification state; Evidence Packet/source references and hashes; supersession relation; retrieval method/score authority; expiry/freshness; and consolidation lineage. Ranking and embeddings remain backend concerns. Core accepts normalized results only after scope and provenance checks.

Candidate extraction and consolidation must run as ordinary governed Jobs with declared read/write effects, bounded source scope, resource policy, an independently verified output schema and durable receipts. An idle scheduler may later select a stronger qualified model, but model unloading/loading is resource scheduling, not part of `AgentMemoryPort`.

## Relationship to existing mechanisms

- **Batons** carry bounded operational continuation across a handoff. Memory supplies advisory historical knowledge; it never replaces the baton or its full ledger.
- **Durable state, evidence and Work Parcels** remain the source of truth and the provenance root from which memories may be derived.
- **Transport integrity and context hashing** bind the exact source and destination payload. Memory references are revalidated before becoming a Context Packet.
- **Warm Experts/cache-aware routing** reuse provider computation or retained KV state. Persistent memory reuses semantic knowledge across otherwise cold sessions. Warm cache is computational reuse; memory is knowledge reuse.
- **Token-aware routing and Ed-style compaction** manage pressure inside a live thread and preserve continuation. Offline memory forms reusable knowledge after work; it is not a substitute for pressure handling.
- **Pizza Bot findings** favour explicit authority boundaries, small typed ports and replaceable infrastructure. A memory backend follows those constraints and does not become a second scheduler or event store.

## Physical experiment summary

The governed six-stage Work Parcel used ten copied, content-addressed records (353,504 bytes) from real Agent Control release, architecture, deployment and qualification history. The same loopback Qwen 2.5 Coder 3B model answered both arms. The baseline used Agent Control exact/BM25 Evidence Packets. The memory arm used Qwen-generated compact candidates, controller-bound packet provenance, isolated MARM ingestion, semantic recall and controller-side verification/current-hash/task-scope filtering.

| Measure | Existing reconstruction | Consolidated memory | Change |
| --- | ---: | ---: | ---: |
| Verified answers | 8/8 | 8/8 | no loss |
| Supplied context | 6,022 est. tokens | 550 est. tokens | -90.87% |
| Provider input | 7,844 tokens | 1,608 tokens | -79.50% |
| Provider output | 291 tokens | 277 tokens | -4.81% |
| Total provider tokens | 8,135 | 1,885 | -76.83% |
| Source files represented | 8 | 8 | no reduction |
| Retrieval latency | 42 ms | 1,200 ms | +1,158 ms |
| Model latency | 5,848 ms | 6,233 ms | +385 ms |

Consolidation took 10,372 ms. The final isolated SQLite database was 262,144 bytes and contained 12 embedded memories after exact duplicate collapse and adversarial controls. Provider-reported cached input is recorded, but warm-cache effects make it unsuitable as a standalone memory-saving claim; the independent supplied-context and total-input measures carry the comparison. Cost is unavailable because the local backend exposes no monetary billing data.

All stale-source, superseded, unverified, missing-provenance, incorrect-memory, similar-project and different-session controls were rejected. The copied source was restored byte-for-byte after the mutation test. MARM `auto` recall missed two paraphrased candidates in an earlier bounded run; explicit semantic mode found them. The proposed adapter must select recall mode deliberately and surface misses rather than treating `auto` as infallible.

## Limits and next gate

- One local model/provider executed both arms; provider-neutrality was assessed at the contract boundary, not physically across multiple inference providers.
- The experiment did not unload a protected service or load a larger consolidation model because only 1,546 MiB VRAM was free and live workloads were preserved.
- File-read count did not fall because every accepted memory retained source provenance and freshness validation; the measured benefit was transmission/context reduction.
- Retrieval was slower in this small corpus. Larger-history crossover, incremental consolidation cost, recall precision/recall completeness at scale and correction races require a longer experiment.
- Memory deletion/forget governance and multi-backend conformance need deterministic qualification before product implementation.

Implement only the generic port and a native test backend first, reusing `ContextGraph` and governed retrieval. Keep MARM behind an optional adapter. Do not ship automatic idle model swaps until resource supervision, cancellation, provenance binding and independent summary verification are physically proven.

## Answer

Yes, in this experiment persistent consolidated memory let fresh Agent Control invocations recover the same eight historical facts while transmitting 90.87% less task context and consuming 79.50% fewer provider input tokens, with no measured correctness or provenance loss. It did not reduce provenance reads or latency, and it did not prove monetary saving. That evidence justifies **C — GENERIC MEMORY ABSTRACTION**, not MARM as a mandatory dependency and not an unqualified core memory authority.

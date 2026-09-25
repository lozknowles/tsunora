# Shared thread context and evidence architecture

## Invariant

Shared context augments Agent Control state; it never owns a task and never grants terminal authority.

```text
Hard contract + lease + owner
          |
          v
        Baton (Tier 1)
          |
          +--> repository evidence (Tier 2)
          |
          +--> selected context sources (Tier 3)
          |
          +--> independent conclusions + judge (Tier 4)
```

Git state and independently executable tests remain authoritative. Shared threads provide visible rationale, alternatives, failures and tool evidence. They are not assumed to contain private chain-of-thought and are never promoted above verified evidence merely because another agent wrote them.

## Components

- `ContextStore` persists source metadata, evidence, conclusions, access-tier decisions, consensus decisions and provenance edges in `.agent-control/context.json` using atomic mode-0600 writes.
- `LaneContextService` attaches a source to a lane and references it from the baton. Existing handoff and clone operations copy the optional baton references without changing lease or ownership behavior.
- `ContextRouter` selects the minimum sufficient tier using complexity, confidence, dispute state, urgency, context capacity, token budget, monetary budget and latency budget.
- `ContextSourceReader` is the provider-neutral read-only access boundary.
- `ContextReaderRegistry` discovers provider capabilities and refuses unsupported, unapproved, reference-only or unapproved authenticated reads.
- Provider adapters accept an injected visible-document transport. They cannot create or broaden shares, and no credential is stored in context metadata.
- `selectRelevantSections()` deterministically ranks visible evidence, decisions, failures and query-relevant sections within the selected token budget.
- Sensitive visible text is redacted before prompt material is returned. Reference-only and expired retention policies preserve metadata while preventing retrieval.
- `ConsensusJudge` accepts independent, unique-lane conclusions only, weights the strongest evidence quality per conclusion and records agreements, disagreements, dissent and final confidence.
- `traceDecision()` exposes the operator graph from decision to conclusion, source, evidence, commit and test. `buildOperatorProvenanceView()` adds clickable read-only source URLs and a Mermaid rendering for an operator UI.

## Source metadata and security

Sources can represent shared OpenAI/ChatGPT/Codex threads, GitHub PRs/issues, commits, artifacts, test reports, web URLs, local files and future providers. Metadata includes task/lane/agent/provider/model, repository state, trust classification, accessibility, token estimate and reference-only/ephemeral-extract retention policy.

Agent Control stores references, not credentials. URLs with embedded credentials, sensitive query parameters or unsupported schemes are rejected. This subsystem has no API for creating or broadening a public share. Any future share-creation operation requires a separate approval-gated policy.

## Recovery

Missing, expired, deleted, authenticated or unsupported threads are omitted with an explicit reason. Stale commit associations produce warnings. Baton, Git, tests and persisted Agent Control state remain sufficient for task recovery.

## Provider integration boundary

A provider implements an injected `VisibleDocumentTransport`; the registry exposes it through `ContextSourceReader.read(source, maxTokens, request)`. Provider implementations must authenticate through approved credential storage, must not persist tokens in `ContextSource`, and must report inaccessible content without blocking recovery.

Deterministic fixture transports qualify the generic contract. The official ChatKit GET adapter has additionally authenticated against a real project, but remains `SUPPORTED+UNQUALIFIED` until that project can create a workflow and produce an accessible `cthr_...` thread. ChatGPT Work and Codex task context remain host-only/reference-only outside approved host transports.

## Work Parcel context ledger (3.9)

The shared-source architecture above remains available. The 3.9 Work Parcel ledger adds a provider-neutral durable task context beneath it:

```text
immutable original goal
        |
        +--> concise active state
        +--> hash-chained immutable events
        +--> governed historical retrieval
        +--> success criteria / questions / steering
                         |
                         v
                 bounded baton view
```

Active state is authoritative for what is true now; immutable events explain how it became true; retrieval finds relevant history; a baton is only the current executor's bounded projection. Compaction or a new baton may exclude old events, but cannot delete them. Event integrity is verified from the previous-event SHA-256 chain. Baton integrity covers its canonical payload, selected event references and artifact references.

Retrieval can constrain event type, stage, tags and exact terms, or use deterministic bounded relevance scoring. It records who queried, what was selected and the resulting event hashes. Existing repository/Evidence Packet retrieval remains the right path for source content; parcel-event retrieval is for task history such as a failed approach, decision or test outcome. Neither path expands authority.

Metrics retain event-ledger bytes, latest baton bytes, historical bytes excluded from that baton, retrieval count and event count. Physical qualification recorded 103,526 bytes of recovery history while the latest baton was 4,941 bytes; the later stage retrieved the excluded failed approach by its original event ID/SHA and did not repeat it.

Literal secret-like values are rejected before persistence. Dashboard projections expose summaries, IDs, status and hashes—not raw provider prompts, hidden reasoning, credentials or unrestricted tool output.

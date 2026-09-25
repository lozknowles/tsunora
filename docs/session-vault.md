# Cross-Device Session Vault

Status: **EXPERIMENTAL in Agent Control 4.5**.

Session Vault preserves provider-native agent sessions as immutable evidence,
indexes a redacted provider-neutral event projection, and supports historical
search, repository attribution, replication and governed continuation. It does
not recreate hidden model state, turn history into authority, or replace an
existing provider's native history.

## Relationship to Your Memories

The boundary is deliberate:

- **Session Vault** retains detailed evidence and provenance.
- **Your Memories** contains curated, advisory knowledge admitted through the
  existing `ProjectMemoryPort` governance.
- **Obsidian** is an optional Markdown view/backend for Your Memories.

`SessionMemoryPromotionService` calls the existing memory port. Promotion
requires an approving actor and independent validation and links the resulting
memory to the exact native object SHA-256 and corroborating evidence. No parallel
memory database is introduced. Deleting or disabling an Obsidian view does not
disable Session Vault search, integrity verification or continuation.

## Capture model

An adapter discovers a provider-native record, captures its exact bytes and
declares capabilities. The vault writes a content-addressed object and a sealed
record. Redacted normalized events retain the source object hash and native
sequence. Completeness is explicit: `ACTIVE`, `CHECKPOINT`, `COMPLETED`,
`TRUNCATED`, `DAMAGED` or `IMPORTED`. A later append is a new immutable version
linked by the previous object hash.

Codex 0.154 JSONL is the first adapter. Core code does not depend on Codex event
names or paths; see [provider adapters](session-vault-provider-adapters.md).

## Retrieval and continuation

Use the cheapest sufficient layer:

1. validated Your Memories for concise reusable knowledge;
2. the redacted Session Vault index for historical events and provenance;
3. exact native evidence only when policy and investigation require it.

Continuation verifies the repository and desired revision, acquires one
exclusive source-session lease, and seals all context sources. It then creates a
normal governed session and Work Parcel through injected existing ports. The
destination receives preserved evidence context—not hidden provider state. A
conflicting mutable continuation is denied and durably audited; read-only search
continues to work. Forced release requires an actor and recorded reason.

## Dashboard and POE

The authenticated Session Vault tab exposes Session Explorer, Decision Explorer,
Repository Provenance, Continuations, Replication Health and Policy & Retention.
Values are runtime projections; unavailable information remains unavailable.
POE can answer historical questions from redacted indexed evidence and cites the
native object hash. Historical evidence cannot approve work or override current
state.

## Schemas and migration

- vault record: `agent-control.session-vault/v1`
- normalized event: `agent-control.session-event/v1`
- continuation: `agent-control.session-continuation/v1`

  4.5 adds new state beneath `session-vault/`; it does not mutate ProjectMemory or
  provider-native files. Unknown future schemas must fail closed. Back up and
  verify the content-addressed store before upgrading. Rollback may use an older
  Agent Control build while retaining the store unchanged.

## Qualification

The 2026-09-12 physical run captured a real Codex 0.154 session on one governed
Linux node, replicated exact evidence to a second governed Linux node, searched it with the source unavailable,
attributed its commit and decision, created a governed continuation and verified
Work Parcel, denied split brain, redacted an encrypted synthetic secret, rejected
tampering, and captured non-Codex Work Parcel history through the same core.
Your Memories promotion used the existing Markdown/Obsidian-compatible port and
the underlying capability survived removal of that view. The configured Windows
Obsidian application was not exercised because SSH authentication was unavailable;
this remains an explicit experimental limitation.

See the [physical report](evidence/agent-control-4.5-session-vault-physical-qualification-20260912.md),
[threat model](session-vault-threat-model.md), [replication](session-vault-replication.md)
and [recovery](session-vault-recovery.md).

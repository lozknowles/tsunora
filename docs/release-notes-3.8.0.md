# Agent Control 3.8.0 release notes

Agent Control 3.8 adds conservative, opt-in governed retrieval and context intelligence. Provider-neutral retrieval intents progress through bounded exact, lexical and optional semantic/hybrid adapters, producing content-addressed Evidence Packets that compile through the existing ContextGraph and ContextPacketBuilder. The existing 3.7 baton lifecycle can transfer compact evidence references and rehydrate them at the destination without making provider-private index or session state authoritative.

Safety remains the controlling concern:

- evidence sufficiency uses observable exact/path/query coverage, diversity and freshness rather than treating provider rank as calibrated confidence;
- weak or failed retrieval escalates and ultimately retains immutable conventional context;
- repository identity, source-content, packet and item-content hashes are checked before rehydration;
- lexical containment, real-path containment and post-capture symlink replacement fail closed;
- model execution can search an existing zg index with refresh disabled but cannot build, refresh or delete it;
- index resource policy is provider-neutral and index mutation requires separate authority;
- retrieval is disabled by default, remote retrieval requires explicit policy, and zg remains optional;
- retrieved repository text is untrusted evidence, never instruction;
- live events reuse the existing redacted SSE/dashboard transport.

## Qualification result

The frozen 12-task Qwen2.5 Coder 3B mutation comparison independently verified 2/12 outcomes in all three lanes. Conventional context consumed 95,101 processed tokens per verified outcome; built-in governed retrieval consumed 76,189 (19.9% lower); zg consumed 88,039.5 (7.4% lower). This demonstrates context efficiency without demonstrating an expanded small-model task class: every lane still failed 10/12 tasks.

A physical Qwen2.5 Instruct → Qwen2.5 Coder lifecycle proved retrieval, Evidence Packet sealing, baton handoff, destination rehydration, continuation, independent verification, restart reconstruction, stale-source invalidation and SSE/ledger reconciliation. Full baton storage was 2,297 bytes versus 1,327 bytes of conventional context and was not smaller. The transferable evidence references were 291 bytes and destination rehydration was 690 bytes, producing the measured 78.1% reference-transfer reduction.

Both physical endpoints used the OpenAI-compatible adapter. Portability across materially different adapter implementations remains unqualified. Provider-unreported current-context occupancy, monetary cost and electricity cost remain estimated or unavailable rather than being inferred.

See [migration](migration-3.8.md), [operator guidance](governed-retrieval.md), [Phase 2 evidence](evidence/agent-control-3.8-phase2-qualification.md), and [final release qualification](evidence/agent-control-3.8.0-release-qualification.md).

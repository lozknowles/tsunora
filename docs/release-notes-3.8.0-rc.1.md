# Agent Control 3.8.0-rc.1 release-candidate notes

This historical document describes accepted RC commit `7534b6cb23db107452a92563694fb56c76aa5a16`. Final release review subsequently added fail-closed persisted-packet hash verification and post-capture symlink rejection; see the [3.8.0 release notes](release-notes-3.8.0.md).

This release candidate adds provider-neutral governed retrieval and context intelligence. It retrieves bounded, content-addressed repository evidence before model invocation, compiles it through the existing ContextGraph/ContextPacketBuilder path, and carries portable evidence references through the existing 3.7 baton lifecycle.

Key safety properties:

- observable evidence sufficiency instead of trusting adapter rank;
- local-only and disabled-by-default operation;
- separate search and index-mutation authority;
- current-source validation for indexed excerpts;
- revalidation after baton handoff and process restart;
- controlled frozen-context fallback for weak, stale or failed retrieval;
- existing redacted SSE/dashboard transport, with no second control plane;
- provider-neutral resource decisions for provider use, built-in use, authorized index build or deferral.

The frozen 12-task Qwen2.5 Coder 3B mutation benchmark independently verified 2/12 outcomes in conventional, built-in and zg lanes. Processed tokens per verified outcome were 95,101, 76,189 and 88,039.5. The result qualifies aggregate outcome preservation and context reduction for this bounded workload, but does not show that retrieval expands the 3B model's capability class.

A physical Qwen2.5 Instruct → Qwen2.5 Coder lifecycle proved retrieval, Evidence Packet sealing, baton handoff, destination rehydration, continuation, independent verification, restart reconstruction, stale invalidation and SSE/ledger reconciliation. Both routes used the OpenAI-compatible adapter; a materially different adapter handoff remains future qualification, not a release claim.

See [migration](migration-3.8.md), [operation](governed-retrieval.md), and [qualification evidence](evidence/agent-control-3.8-phase2-qualification.md).

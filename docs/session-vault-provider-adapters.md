# Session Vault provider adapters

Core contracts are `SessionProviderAdapter`, `NativeSessionDiscovery`,
`NativeSessionCapture`, `SessionProviderCapabilities` and `SessionEventInput`.
An adapter must discover without mutation, capture exact bytes, classify
completeness honestly, enumerate warnings and normalize only information the
provider actually exposes.

The Codex adapter reads configured `sessions` and `archived_sessions` roots. It
does not depend on a global `CODEX_HOME`; callers supply roots and node identity.
For Codex 0.154 JSONL it recognizes session metadata, operator/assistant output,
decisions, commands, tool activity, repository state and completion signals.
Unknown provider events remain `PROVIDER_EVENT` rather than being discarded.

A non-Codex adapter can expose a different native format while using unchanged
vault, policy, search, replication and continuation code. It must mark absent
prompts, token use, hidden reasoning, compaction, branching or native resume as
unavailable in its capability declaration. Tests prove an Agent Control Work
Parcel ledger can be captured through this contract without Codex dependencies.

Adapter changes require fixture tests for exact-byte preservation, completeness,
redaction, unknown events and corrupt/truncated input. Never alter core policy to
manufacture a provider field.

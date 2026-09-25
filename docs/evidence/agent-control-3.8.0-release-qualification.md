# Agent Control 3.8.0 final release qualification

Date: 2026-09-03

Accepted release-candidate commit: `7534b6cb23db107452a92563694fb56c76aa5a16`.

The exact final release commit is the descendant identified authoritatively by annotated tag `v3.8.0`. This record is intentionally committed before that self-identifying Git object exists; the tag and GitHub Release record its final SHA without a circular self-hash.

## Delta from the accepted RC

The final promotion preserves the accepted RC and adds only:

1. a release-review integrity correction that recomputes persisted Evidence Packet and item-content hashes before use and rejects a captured source later replaced by a symlink;
2. deterministic regression tests for both cases;
3. version promotion from `3.8.0-rc.1` to `3.8.0`;
4. final changelog, release notes, migration/status projection and this qualification record;
5. the established non-squash integration merge from released `v3.7.0`.

The Phase 2 measurements remain attributed to the accepted RC. They are not relabelled as measurements from the final commit. The final commit must rerun every automated, package, documentation and dependency gate before the tag is created.

## Evidence and claim boundary

Phase 2 found equal 2/12 independently verified outcomes for conventional, built-in and zg lanes. Processed tokens per verified outcome were 95,101, 76,189 and 88,039.5. Built-in and zg reductions were 19.9% and 7.4%. This is context-efficiency evidence, not evidence that retrieval expanded Qwen2.5 3B capability.

The physical baton stored 2,297 bytes, larger than the 1,327-byte conventional context. Its 291-byte evidence-reference transfer and 690-byte destination rehydration produced the qualified 78.1% reference-transfer reduction. Restart, source-content invalidation, optional-zg fallback and SSE reconciliation passed. Both model endpoints used one OpenAI-compatible adapter; materially different adapter portability remains unqualified. Missing authoritative context occupancy, monetary cost and electricity cost remain unavailable.

No live Agent Control deployment is part of source release closure.

## Final gate contract

The exact tagged commit must pass `npm run check`, all serial tests, TypeScript, bootstrap/dashboard syntax, provider neutrality, implementation-status consistency, `git diff --check`, all local documentation links, exact package installation and CLI smoke execution, and a resolved dependency audit of that packed artifact. A changed test count must be attributable only to the two added integrity tests.

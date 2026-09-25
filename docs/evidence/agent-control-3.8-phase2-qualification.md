# Agent Control 3.8 Phase 2 qualification

Decision: **PASS — release-candidate gate satisfied**. This authorizes preparation of `3.8.0-rc.1`; it does not authorize merge, tag, GitHub Release or deployment.

## Provenance

- Production baseline: `v3.7.0`, commit `41ae59c6bd0e0228e419a91959efe7130fe086f2`.
- Phase 2 starting commit: `2cf5480184f61b558687cefff1a417bd34abe6d7`.
- Branch: `feature/3.8-governed-retrieval-context-intelligence`.
- Frozen tasks: `benchmarks/harness-mutation-jobs.json`, SHA-256 `d0d2ecffdfbd306401a2fd6d1ef312995ded7fb651fdf0cb5d1cdc11fa96a050`.
- Fixture SHA-256: `d1b5e8ebec19378b5d2112e8be5e73671a51c40bc328af8ded815be44edb6b27`.
- Model in all benchmark lanes: `Qwen2.5-Coder-3B-Instruct-Q4_K_M.gguf`, temperature 0, one governed attempt per task, DEEP context profile, identical typed tools and independent verifier.

## Qualification-discovered defects and corrections

The original built-in failures were not one isolated BM25 tuning defect. Broad query construction included output-schema language, exact search was substring-oriented, configured paths and symbols were not privileged cleanly, arbitrary adapter ranking could look like confidence, and benchmark/state output could contaminate retrieval. Those conditions made weak evidence appear stronger than it was.

The correction is policy-level rather than benchmark-specific:

- exact matching is token-exact and uses explicit path/symbol terms when present;
- the production query describes repository work, not output-format boilerplate;
- evidence is classified `SUFFICIENT`, `AMBIGUOUS`, or `INSUFFICIENT` from observable exact/path/query coverage, diversity and freshness;
- provider rank is not calibrated confidence;
- weak retrieval escalates or invokes the immutable-context fallback;
- `.agent-control` and qualification output are excluded;
- zg uses search-only `--refresh off`, respects intent scopes, and its excerpts must match current source;
- persisted evidence stores a source-content hash and rehydrates only after repository/path/existence/whole-file validation;
- retrieved text is labelled untrusted repository evidence, not instruction;
- a generic resource policy separates provider use, built-in use, authorized index build and deferral.

Physical qualification also exposed an initial lifecycle query/scope mismatch and the risk of implicit zg refresh. Both were corrected before the final run. No repository-specific benchmark answer was embedded in production policy.

## Frozen physical mutation benchmark

| Lane | Independently verified | Processed tokens | Tokens / verified | Fresh tokens / verified | Median latency | Retrieval |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| A — conventional | 2/12 | 190,202 | 95,101 | 16,059.5 | 9,057 ms | none |
| B — built-in governed | 2/12 | 152,378 | 76,189 | 7,604.5 | 7,997 ms | 5 sufficient, 7 governed fallbacks |
| C — zg governed | 2/12 | 176,079 | 88,039.5 | 8,550 | 8,020 ms | 4 sufficient, 8 governed fallbacks |

Built-in reduced processed tokens per verified outcome by 19.9%; zg reduced them by 7.4%. Outcome count did not regress. Lane A and C verified `MUT-001`/`MUT-011`; Lane B verified `MUT-001`/`MUT-002`, so this is aggregate non-regression, not identical stochastic output. Every lane had ten verifier failures and no timeouts. Monetary cost and local electricity cost were unavailable and are not represented as zero.

The important negative result is that retrieval did **not** expand the demonstrated capability class of this 3B model: every lane verified only 2/12. Retrieval reduced context consumption; it did not make the weak model broadly reliable.

Final report SHA-256 values:

- Lane A: `6aa95f90890c6e94c25398d06aae8945d9a0cfb79ed4211a8f804900065585b1`.
- Lane B: `5afc1762ab49af4fee5313952bddd8a0f447ef5119bd08b191122c698549332b`.
- Lane C: `80e4524d3bbb626c65e36eaba08fda497a11f323076a340f2f3cb6c9d0674dd5`.

## Physical retrieval baton lifecycle

One production lifecycle ran `qwen2.5-3b-instruct-q4_k_m.gguf` on provider configuration `phase2-qwen-instruct`, retrieved current evidence, crossed the unchanged token governor using documented qualification-only 10/20/30/40% thresholds, sealed a baton, and continued with `Qwen2.5-Coder-3B-Instruct-Q4_K_M.gguf` on `phase2-qwen-coder`. The destination rehydrated two Agent Control Evidence Packet references and independently verified the final result.

- Work Parcel: `parcel-db97b193-80a7-4998-bb09-47da246480e9`.
- Baton: `token-baton:c0a4f490-3b87-47e5-96f4-49acb62f38af`.
- Baton SHA-256: `b6f965507bf0aca8a7b824c0e95f0f6818395c7feb1d1a1310c75432c7c6a7ef`.
- Source: 189 input + 116 output = 305 tokens.
- Destination: 878 input + 118 output = 996 tokens.
- Parcel: 1,067 input + 234 output = 1,301 tokens.
- Configured-price estimate: USD 0.0005324; provider-reported monetary cost unavailable.
- Current-context occupancy: estimated from ephemeral one-turn usage; lifetime totals: provider reported.
- Original source thread: recoverable.
- Independent verification: PASS.

The conventional context was 1,327 bytes. Full baton storage was 2,297 bytes, so storage itself was not smaller. The portable evidence references were 291 bytes, a 78.1% transfer reduction relative to conventional context; the destination then consumed 690 rehydrated evidence bytes. Storage size, transfer size and destination-consumed context are therefore reported separately.

Both legs used distinct model/provider configurations but the same OpenAI-compatible adapter implementation. The optional materially different-provider-adapter portability exercise was not performed and is not claimed.

## Restart, stale evidence and failure safety

After persistence, a reconstructed retrieval service rehydrated the packet and continued. Mutation of the underlying source changed its whole-file hash; the prior packet was rejected with `source_content_changed`. The stale-index physical case likewise rejected mismatched indexed text and selected current built-in evidence.

The physical failure matrix covered missing zg executable, absent index, process failure, malformed/no result and stale index. Every case selected governed built-in fallback. Search-only zg did not create the absent index. The sanitized failure-report SHA-256 is `27ea089dd4d74276c2c31be0d1cde4e99b5ce591ca15388bf090401d32cb972a`.

Security tests reject symlink/path escape and evidence hash mismatch. Prompt-like repository text is explicitly wrapped as untrusted evidence. Persisted evidence contains neither temporary absolute roots nor raw provider/SSE output.

## Resource policy

The earlier representative cold index measured 21.41 seconds and 954,000 KiB peak RSS for 524 files/5,640 entities. A fresh tiny Phase 2 fixture measured 2.79 seconds, 511,120 KiB peak RSS and a 4,718,989-byte index. Final warm retrieval totaled 8 ms for built-in and 16,828 ms for zg across twelve tasks. The resource policy physically chose `USE_BUILTIN` for a short task and deterministically covered insufficient-memory and missing-authority cases; focused tests cover all four outcomes, including `USE_PROVIDER`, `BUILD_INDEX`, and `DEFER_INDEX`. Index build still requires independent authority.

## SSE and regression reconciliation

The existing `/api/events` stream emitted 20 lifecycle events during the physical run. Durable and dashboard projections reconciled for retrieval start, provider selection, evidence creation, rehydration, token telemetry, governor transitions, baton creation and handoff result. Deterministic tests additionally cover escalation, compilation, invalidation, fallback and failure event handling. No second transport was added.

`npm run check` passed TypeScript, bootstrap syntax, dashboard syntax, infrastructure neutrality, implementation status and 688/688 tests (0 failed, 0 skipped). `git diff --check` passed. The packed package installed into a clean temporary prefix and its installed CLI returned help successfully. The source tree intentionally has no npm lockfile, so the exact packed RC was installed into a fresh temporary prefix and the resulting resolved dependency tree was audited there: 0 info, low, moderate, high or critical vulnerabilities.

## Decision

All ten Phase 2 PASS criteria are evidenced: outcome count was preserved, context was materially reduced, weak evidence fell back, Evidence Packets crossed a real baton, restart succeeded, stale evidence failed safely, zg failures fell back, the 3.7 governor/recovery path remained intact, SSE reconciled, and repository gates remained green.

Remaining limitations are explicit: the 3B model remains weak, cross-adapter portability is unexercised, provider monetary cost is unavailable, and retrieval remains opt-in. None contradicts the release-candidate acceptance criteria.

Verdict: **PASS**. Recommended next action: review and qualify the exact `3.8.0-rc.1` commit; do not merge, tag, release or deploy until separately authorized.

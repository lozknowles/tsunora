# Post-3.8.2 Codex context-efficiency and accounting qualification

Date: 2026-09-05

Branch: `fix/codex-cached-input-telemetry`

Released base: `v3.8.2` / `b51623dae1b764a31198424e8fc6ea9076d04089`

Cached-input normalization checkpoint: `43248a2bcb3dc2c9aeadef78ebb2a8cd79797ed4`

Hardened implementation: `7845e55697bf9d1a1b41029f243aa6633cff09f3`

Final context-merge correction: `67c462555ee875ed911e2ff431d4c31ab8a318e6`

## Scope and outcome

This isolated post-release change investigates the Codex context, caching, session and accounting critique against executable Agent Control paths. It preserves the v3.8.2 release and its historical evidence. No merge, tag, release or deployment is part of this qualification.

The investigation found substantive accounting, current-context and process-envelope defects and fixed them. It did **not** establish a reliable token, latency or monetary saving from prompt caching, and it did not add native session persistence. Repeated physical calls prove that provider-reported cached input can occur under `codex exec --ephemeral`; otherwise identical sequences also returned no cache hits. Cache behavior is therefore observed and accounted for, not promised.

## Concern classification

| Concern | Classification | Evidence and disposition |
| --- | --- | --- |
| Codex cached-input telemetry was lost after JSONL parsing | Confirmed defect | Top-level `cached_input_tokens` now survives adapter normalization, token samples, Work Parcel/Job accounting, batons, history and dashboard projection. |
| Missing cache detail was treated as zero cached/all fresh | Confirmed defect | Total input is retained independently; fresh and cached components remain unknown unless the split is supplied or safely derivable. |
| Discounted-cache cost could be calculated without a cache split | Confirmed defect | Cost remains unknown when distinct input/cache rates require unavailable detail. Equal-rate pricing remains exactly calculable. |
| Codex cumulative completion usage represented retained context | Confirmed defect | `turn.completed.usage` may aggregate internal calls and is no longer used as current occupancy. Context and percentage remain unavailable without a distinct signal, and the governor records `CONTINUE / current_context_unavailable`. |
| An unavailable post-compaction count retained stale pre-compaction occupancy | Confirmed defect | Explicit `null` now clears occupancy while an omitted field still retains the prior value. The reproduced 90% case changed from a false `HANDOFF` to `CONTINUE / current_context_unavailable`. |
| Account-bound repository review inherited mutable Codex/project context | Confirmed defect | Authentication stays in the selected `CODEX_HOME`, while user config/rules and project instructions are excluded from the structured-review envelope. |
| Read-only Codex could still perform opaque native actions | Confirmed defect | Baseline JSONL included `command_execution`. The hardened adapter disables shell, unified exec, multi-agent, web search, browser, computer, apps, image generation and workspace-dependency surfaces under strict config validation. All twelve hardened/corrected physical calls observed only `agent_message`. |
| Random retrieval/baton identifiers shortened reusable prompt prefixes | Measurable optimization opportunity | Opaque IDs now follow reusable instruction/evidence content. The physical prompt and schema hashes remained identical, but the experiment did not isolate a token or latency benefit from this ordering change. |
| `--ephemeral` disables provider prompt caching | Unsupported assertion | Official documentation defines it as disabling local rollout persistence. Non-zero cached input was physically reported in ephemeral runs. |
| Persistent sessions necessarily reduce tokens or latency | Unsupported assertion | The matched runs did not establish this. Session reuse also needs account/node/workspace/lane/policy ownership and invalidation controls. It remains disabled for this path. |
| Every Codex-internal action passes through Agent Control `ToolPolicy` | Unsupported assertion | Codex is an opaque CLI process. Agent Control constrains its process envelope and observes item types; only requests returned into the separate Agent Control tool gateway receive per-action `ToolPolicy` authorization. |
| One-shot ephemeral execution is always inferior | Intentional trade-off | It avoids making provider-native history the recovery authority. Immutable Work Parcels, Evidence Packets and sealed batons remain portable across providers and sufficient for recovery. |

## Actual production context path

Each schema-constrained repository-review invocation rebuilds:

1. the fixed repository-review instruction;
2. the assigned immutable context chunk or governed Evidence Packet content;
3. optional rehydrated baton evidence;
4. the stable repository-review output schema.

It does not replay an implicit conversation transcript. Run and Work Parcel IDs remain durable control-plane evidence, but changing Evidence Packet and baton IDs are appended after reusable content. Temporary schema/config paths are child-process details and do not enter the provider instruction.

The account-bound local and Windows-node launchers use the same fixed controls: ephemeral JSONL, strict config validation, read-only sandboxing, ignored user/rule context, suppressed project instructions, and disabled native action-capable surfaces. A generated mode-0600 custom-provider config is the narrow exception to ignoring config because it is the registered provider adapter itself; it retains all other restrictions and is removed after execution.

Official Codex documentation confirms that:

- [`--ephemeral` prevents local rollout persistence](https://learn.chatgpt.com/docs/non-interactive-mode.md), rather than disabling provider caching;
- [`--ignore-user-config` retains `CODEX_HOME` authentication](https://learn.chatgpt.com/docs/developer-commands?surface=cli#cli-codex-exec);
- JSONL completion usage may include `cached_input_tokens`, and `codex exec resume` exists for native continuation;
- app-server exposes richer thread token-usage and context-compaction events.

The installed controller executable was `codex-cli 0.144.4`. This path consumes only the non-interactive JSONL capabilities it actually exposes. It does not claim app-server live context, native compaction or resumable-session qualification.

## Matched physical comparison

All sequences used the same authenticated account profile, exact model `gpt-5.6-luna`, immutable repository SHA `2ad1e4001f264c4adc645e3a02873139db465ed0`, three files, read-only permissions, output schema and three repeated tasks. The rendered prompt hash was `95a3be3c7c42922e4e03bb386ce6698e77a57fe9bb98f89127fe5df9e3a081a4`; the schema hash was `9bca985dcc1d4521c4784be4690847adcccdc1642df6bf0a9dab3a3765b4d3ce`. Every provider response passed transport parsing and application validation; accepted verdicts varied between `PASS` and `PASS_WITH_FINDINGS`, as expected for non-deterministic review output.

The figures below are sums across three independent invocations. Input is provider-reported lifetime consumption, not retained context.

| Sequence | Implementation state | Correct | Elapsed | Total input | Fresh input | Cached input | Output | Total tokens | Observed native item types | Context treatment |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Baseline | normalization commit | 3/3 | 129,420 ms | 106,720 | 70,368 | 36,352 | 6,436 | 113,156 | `agent_message`, `command_execution` | incorrectly estimated from completion usage |
| Hardened, pre-context fix | working tree | 3/3 | 122,275 ms | 112,311 | 78,007 | 34,304 | 6,012 | 118,323 | `agent_message` | incorrectly estimated; two values exceeded the configured window |
| Context-corrected | working tree | 3/3 | 108,752 ms | 54,624 | 54,624 | 0 | 5,369 | 59,993 | `agent_message` | unavailable; governor continued |
| Post-commit strict envelope | `7845e556…` | 3/3 | 116,877 ms | 76,895 | 49,759 | 27,136 | 5,877 | 82,772 | `agent_message` | unavailable; governor continued |
| Final reviewed implementation | `67c46255…` | 3/3 | 147,726 ms | 62,082 | 44,930 | 17,152 | 7,712 | 69,794 | `agent_message` | unavailable; governor continued |

No safe provider cache-flush control was available, so the first call in a sequence is a sequence start, not a provably cold provider cache. The identical prompt/schema hashes and fixed account/model/snapshot make the sequences comparable, but do not control shared provider cache state or model-side internal-call variability. Cached-input results ranged from 0 to 36,352 aggregate tokens, and aggregate latency ranged from 108.8 to 147.7 seconds. The two exact-commit warm-fresh-input deltas were 4,672 and 4,817 tokens, but the other corrected sequence had no delta. These data support cache observability and honest accounting; they do not support a reliable savings claim.

Configured pricing was deliberately absent. Monetary cost is therefore unknown rather than zero. Current context was also unavailable in both corrected sequences, with the explicit source `codex_exec_turn_usage_is_not_current_context`; the configured 32,768-token window alone is not an occupancy measurement.

### Artifact integrity

Artifacts remain outside the repository under `/opt/qualification/agent-control-post-3.8.2-context-efficiency/`. They contain sanitized route/account IDs, hashes and normalized telemetry, not prompts, provider response bodies, credential paths or authentication material.

| Sequence | Summary SHA-256 | Token-routing SHA-256 | Work Parcels SHA-256 |
| --- | --- | --- | --- |
| Baseline | `db71f1fd5e8fde85f67ab5cb66051ef82a72ebf26d29bc37add03125cae66f77` | `a0ec79769328ac1110a2698924f12fc12f9d8da99843505f19837b70fa2bcfd8` | `ffb9e63efa0d17ee26fec567d39f6d80622fce7be569a54f442abaf46d6c82db` |
| Hardened, pre-context fix | `3a70c8b9cf1eff7495c1e4a32cd8d6c3470500dda8087e575a126b7adc9b2960` | `0f3da0558d5f9bdb1c6d4676070dd12dda9bf8cbda2357bb92e8eaf272538675` | `ba4cbd19405e7f1684b1913b52771189fbb9bca686ee3ed58084888055a7825b` |
| Context-corrected | `0a0c6e3a64d463d9af19d4cfb576e222a4fbf43f3821bf55ce0d0bfe74a5b2ee` | `2617b0aa1e2d8cde4c370c6c4ecbeda4ebd5010fac9e2192d7810c68c962aadc` | `db5dcb87c22c28c9e0965fa33c2b3e251a138a527a32126c3271677887ca1359` |
| Post-commit strict envelope | `bc881ba58f400c9282a721439550652b5bd6710730eb99045884e7be33416982` | `1e005dd0be0aebd8f1e1ff2b39cb49f35d021df9d95f467e9bac4b3ed9d7a2c4` | `bfa928b08267558b419ae660c29b47fd794c68ffebdb02566ea7833a433a5a82` |
| Final reviewed implementation | `a7607cf24eff260218851f34adce29fdf2b60875233d554367e8b1ca66d958da` | `77a29d6d06288a23b85bd91044f35c775c364cab642da037fd1360677b463d51` | `c62cda97d796cceae8fdc0036d3922bf403d7871916ba22ca11809b4fc258484` |

The final artifact records implementation commit `67c462555ee875ed911e2ff431d4c31ab8a318e6`, Codex executable SHA-256 `134063e133f0b4244fa3b251acf973d4fe4b4aeeacbdc135211bf480f59f1477`, successful account qualification and three identical prompt/schema pairs.

## Accounting and dashboard reconciliation

Regression coverage proves that:

- authoritative total input survives when fresh/cache detail is unavailable;
- valid total/fresh/cache arithmetic is additive across thread and Work Parcel legs;
- invalid or contradictory token breakdowns fail closed;
- discounted-cache cost remains unavailable without the needed split;
- legacy token-routing snapshots normalize missing fields without changing previously sealed baton bytes or hashes;
- history and SSE dashboard projections show total, fresh and cached input separately;
- the dashboard selects next-route state by the durable thread ID.

The three final-revision Work Parcel invocation totals exactly match their token-routing cumulative samples: `35,340 + 2,949 = 38,289`, `13,371 + 2,063 = 15,434`, and `13,371 + 2,700 = 16,071`. The first invocation records `18,188` fresh plus `17,152` cached equals `35,340` total input. Current-context fields remain null and do not borrow any of those lifetime totals.

## Validation history

The first complete `npm run check` at the normalization checkpoint reported 718/719 tests. The only failure was an unrelated one-millisecond wall-clock race in the historical-attribution test: expected `...08.778Z`, observed `...08.777Z`. It did not touch this workstream. The log is `/tmp/ac-cached-full-check.log`, SHA-256 `609ca20a6bb7ce67c9539f061090f70f9a436b542e9abaebfd83f87a590a616d`.

The isolated historical-attribution group then passed 9/9, and the next complete gate passed 719/719. The successful log is `/tmp/ac-cached-full-check-rerun.log`, SHA-256 `8e3699ed7e576519ae49421ac0159376db4f73f775d6ac84878c56a7d30dfe15`. This records the initial failure rather than hiding it behind repeated green runs.

After the hardening delta, the focused provider/repository-review suite passed 31/31; its log is `/tmp/ac-cached-focused.log`, SHA-256 `4a0de602d5fc26ed2cc2eb65349e840805b7b092474d83888aa7a94d54c3159d`. TypeScript and the two dashboard browser-rendering tests also passed. Both committed implementation checkpoints subsequently completed their respective physical 3/3 comparisons above.

The first current-tree complete gate then exposed one documentation packaging failure: editing the versioned 3.1.0 operator-guide source made it differ from its immutable packaged Markdown copy. The current behavior was moved to the live operational documents and the historical guide was restored rather than rewriting a released asset. The targeted operator-guide suite then passed 4/4.

The complete gate before the final context-merge correction passed 724/724. The reproduced stale-context case then passed its new focused regression in an 11/11 governor suite, and TypeScript passed. After documentation/status regeneration, the exact final tree passed `npm run check`: TypeScript, bootstrap and dashboard syntax, 3/3 infrastructure-neutrality checks, all 33 implementation-status entries and all 725 serial repository tests passed with zero failures, skips or cancellations.

## Remaining limitations

- The versioned 3.1.0 operator guide and its packaged release copy remain byte-for-byte unchanged historical artifacts. Current operational behavior is documented in `docs/models/CODEX-INTEGRATION.md`, `docs/token-aware-baton-routing.md`, `docs/execution-history.md` and `docs/web-dashboard.md` instead of rewriting that released guide.
- Codex exec does not expose authoritative retained current-context occupancy or provider-billed turn cost on this qualified path.
- Cache admission, retention and reuse remain provider-managed and variable; Agent Control can observe reported hits but cannot promise them.
- Native Codex resume/app-server sessions and compaction are not integrated here. They remain an optional adapter optimization that must prove practical value and enforce account, execution-node, workspace, lane and policy isolation before enablement.
- Disabling the known Codex native action surfaces is a process-envelope control, not proof that Agent Control individually mediates every internal model operation.
- The physical comparison used one account, one Codex version/model and one immutable three-file review corpus. It demonstrates the fixed accounting and governance path, not general model-quality or billing performance.

## Verdict

**PASS — ACCOUNTING AND CONTEXT CORRECTNESS PHYSICALLY QUALIFIED; CACHE SAVINGS AND NATIVE SESSION CONTINUITY NOT CLAIMED**

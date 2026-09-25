# Agent Control 4.9 Rebroad reliability review

Status: isolated follow-up candidate. This work is not part of the immutable public `v4.9.0` tag and has not been merged, tagged, released, deployed, or installed on an operational controller.

## Reconciliation

The supplied references described an unreleased candidate, but the current public state is newer. `origin/main` and `v4.9.0` both resolve to `fe9a879e4360d3249c44ee21f0279761a182bd0d`, the merge of PR 24. The supplied tested and documentation commits are ancestors of that release. This review starts from that exact commit in isolated branch `feature/4.9-rebroad-reliability-20260919`.

The external commits were treated as research inputs. Their implementations were not copied. Agent Control's existing abstractions and tests determined ownership.

## Gap matrix

| Finding | Existing Agent Control capability | Gap and ownership | Qualification | Verdict |
|---|---|---|---|---|
| Raw direct inference | Qualified provider/model routing, one-shot compatible/local adapters, credential profiles and usage ledger | No explicit product contract separated raw inference from an agent workflow. Core route plus provider adapters. | Authenticated API, no-tool contract, model qualification, timeout/cancellation, null-preserving token/reasoning/cache data, retained evidence and physical local inference | IMPLEMENTED |
| Append repair with live writers | Activity JSONL opened per append; authoritative run history is separate | Activity projection had no continuity-preserving repair. Projection ownership. | Real O_APPEND descriptor, malformed/duplicate entries, same inode, backup, restart recovery, concurrent repair lock, rotation and idempotence | IMPLEMENTED |
| Governance metadata | Read-only execution sandbox; mutation fixture denied .git and symlinks | Mutation workspace lacked a generic Agent Control/Codex metadata policy. Core policy with adapter enforcement. | Unavailable governance directories, read-only instructions, traversal/separator checks and evidence exclusion | IMPLEMENTED |
| Credential replacement | Invocation-time resolution; owner-only temporary file plus atomic rename | No gap demonstrated. Incomplete temporary files are not the canonical reference. | Rotation, residency, permissions, symlink and late-resolution tests | ALREADY_SUPPORTED |
| Pause before cancel | Durable cancellation and retained locks | Abort preceded durable CANCELLING update. Runtime ownership. | Abort listener observes durable CANCELLING; cancellation/process tests | IMPROVED |
| Descendant cleanup | Owned process groups/session identities and fail-closed uncertain cleanup | No gap demonstrated. | Process-group, Android procfs, PTY and identity-mismatch tests | ALREADY_SUPPORTED |
| Malformed tool arguments | Structured provider errors and TOOL_CALL_UNRELIABLE catalogue classification | No duplicate taxonomy needed. Raw inference adds forbidden/malformed tool-output classification. | Structured-loop, Responses and direct-inference tests | ALREADY_SUPPORTED |
| Exact durable boundary | Evidence-bound checkpoints, same-run resume and append-only attempts | Existing governed-job mechanism is stronger; no new branch store justified. | Resume, tamper rejection, refusal history and cleanup-certainty tests | ALREADY_SUPPORTED |
| Android governance | Identity-bound wireless ADB recovery, stdin pairing secret, dynamic endpoint and bounded capabilities | No new upstream Android finding or core gap demonstrated. | Existing Android tests; no new physical phone mutation | ALREADY_SUPPORTED |

## Direct inference contract

`POST /api/lab/direct-inference` is an authenticated mutation endpoint. It accepts one qualified model or model role, target node, bounded output/timeout and required capabilities. The runtime:

- labels execution `RAW_INFERENCE`, distinct from `AGENT_WORKFLOW`;
- resolves the existing model registry with fallback disabled;
- uses existing API/local adapters and late credential resolution;
- sends no tool declaration and rejects any returned tool call;
- preserves input, cached-input, cache-write, output, reasoning and total usage, with null for unavailable values;
- distinguishes local/free, subscription-included, metered and unknown billing classes;
- records the invocation in the existing efficiency ledger;
- retains a redacted, content-addressed request/response object with checksum verification.

Authenticated evidence reads use `GET /api/lab/direct-inference/evidence/<reference>`. Raw results are not proof of agent planning, tool use, repository mutation or workflow competence.

## Physical local proof

The candidate issued one bounded request to the already-running qualified loopback llama.cpp service on measured Linux qualification host. That request exposed an accounting defect: its receipt said local/free but the durable usage record still said `UNKNOWN`. The original evidence is preserved as `local-direct-inference-pre-accounting-fix.json`. After correcting the mapping, the exact candidate issued one bounded requalification request. It did not start, stop, reconfigure or download a model, and it did not repeat requests to manufacture cache reuse.

- route: `RAW_INFERENCE`
- model: `Ministral-3-8B-Instruct-2512-Q4_K_M.gguf`
- output: `AC_RAW_LOCAL_OK`
- latency: 2,157 ms
- input / cached / output / total: 546 / 536 / 6 / 552
- reasoning: unavailable
- billing: FREE
- ledger execution: LOCAL
- local API charge known zero: true
- source: provider usage and authoritative llama.cpp timings

Evidence: `evidence/rebroad-reliability-v4.9/local-direct-inference.json`.

No API call was made. The isolated candidate and current controller configuration have no configured API provider/model route. Creating or importing a credential solely for this comparison would violate the credential boundary.

## Repair and metadata assurances

Activity repair writes an immutable mode-0400 backup, records a crash-recovery journal, keeps the canonical inode, verifies the resulting digest and serialises repairs with an exclusive lock. An open append descriptor continues into the canonical file. An interrupted rewrite recovers in place from the verified backup and canonicalisation remains idempotent.

The metadata policy runs before tool scope checks. Governance directories are unavailable. Named instruction, policy, parcel, baton and integrity records are readable but cannot be created or modified. The adapter omits symlinks and unavailable metadata during search and evidence capture. The host workspace is unchanged because mutation execution uses an owned disposable copy.

## Boundaries

- Direct inference grants no shell, tool, filesystem or agent authority.
- The API requires operator mutation authority and configured model qualification.
- A global provider-neutral monetary budget service does not yet exist. Billing and cost remain explicit only where configured evidence supports them.
- Linux mutation-workspace policy is tested. Windows and Android writable-workspace enforcement remains adapter work.
- Existing usage views already group by `executionStrategy`; no competing dashboard or accounting store was added.
- No Pixel pairing, endpoint or device mutation occurred.

## Sources reviewed

Rebroad commits reviewed: `fb0b19a89ed92e8a0e7b0a2a091887b2893320b4`, `09a92f7a69318d655a58e36a0d216bfd567e9d9d`, `70124d224663dd08e2a5db85216ed110be216f6d`, `827327c0abe30ac1c869546e9e4a2cb3d6da2bd7`, `c030f7b23aee29e4c05e54fe612888805207bd15`, `6965cb88cbe5faa250464f680f528c69f27a4eb0`, `5e294a71f66194aac59d087f8648e84e58e307dc`, `e683555bb7375f1f005538698504a67e278b5b6d`, `ca416c38c279b0e094930d051065b71e7afa2bc8`, and `891bca906354194907449b8e1d7af6b039297f2f`.

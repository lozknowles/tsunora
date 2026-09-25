# Agent Control 3.7 development qualification

Date: 2026-09-03
Branch: `feature/3.7-token-aware-baton-routing`  
Base: `5acdde13e41d58b511a33ac0e15f3dc6d3930613` (Agent Control 3.6 product checkpoint)

## Deterministic coverage

The focused TypeScript suite covers the durable governor and its integration boundaries:

- configurable context pressure checkpoints at 60%, 75%, 85%, and 91%;
- a 100k lifetime-token thread with only 12k current context, plus unavailable and estimated context values;
- partial configuration validation against the same 60/75/85/90 defaults used at runtime;
- sealed baton provenance, SHA-256, Git/diff/test/next-action state, successful handoff, failed-handoff recovery, and original-thread recoverability;
- Sol 184k, Luna 31k, and GLM-5.3-Flash 18k accounting that remains 233k after durable reload;
- Responses-compatible direct review telemetry, Codex JSONL start/completion usage normalization, active/completed thread state for advancing elapsed time, redacted `GET /api/token-routing`, and the real SSE event stream.
- the normal direct repository-review Work Parcel production boundary calling observe, assess, sealed baton creation, governed `DELEGATE`, destination execution and independent validation;
- destination-execution failure marking the delegated child failed, preserving the source contract/thread, resuming the exact next frozen chunk on the source provider, and retaining additive parcel evidence.
- two independently referenced Codex `CODEX_HOME` profiles remaining child-process isolated without changing the global login; account qualification persisting no path or credential material;
- same-provider `lawrence-pro/Sol/source-node → cottage-plus/Luna/destination-node` handoff binding the exact destination account and node, rejecting identity mismatch, and retaining separate account-aware baton, contract, invocation and parcel-chain records;
- remote account qualification dispatching to the configured Resource without resolving the controller environment or filesystem;
- the Windows SSH adapter accepting only `accountStatus` and `execReadOnlyStructured`, sending fixed PowerShell over stdin, keeping variable data outside source, rejecting source-account/node reuse, omitting raw process output and paths, and discovering Codex bundles without a hard-coded bundle hash.
- Codex 0.153 app-server usage/compaction normalization, generic durable compaction/new-context/resume evidence, and cumulative totals surviving a current-context reset and process restart.

## Telemetry authority

Codex JSONL provides a live `thread.started` event and completion usage from `turn.completed`. The current Codex CLI integration does not expose authoritative in-thread context occupancy, so 3.7 records the configured context-window limit when known and marks current context and percentage `unavailable`; it never derives them from lifetime tokens.

Responses-compatible adapters normalize provider usage and use configured pricing only as an `estimated` cost. A provider-native current-context field may be represented as `authoritative` without changing core routing policy.

The official Codex 0.153 source review is recorded separately in [agent-control-3.7-codex-0.153-review.md](../provenance/EXTERNAL-EVIDENCE.md). The current Agent Control Codex invocation does not enable experimental context management and does not expose app-server or OTEL telemetry. The adapter can normalize 0.153 app-server usage and compaction when a future qualified persistent execution route supplies those events; the provider-neutral runtime already persists context lifecycle and keeps aggregate accounting stable.

## Qualification-discovered integration defect and fix

The physical continuation audit at branch commit `4a13df341c79ff3cc8cbadfed8173618722b92ea` found that production repository review called `TokenAwareBatonRuntime.observe` but never called `assess`, `createBaton` or `governedHandoff`. The runtime and deterministic unit tests were sound, but there was no genuine production handoff call path.

The fix connects the existing abstractions at `DirectRepositoryReviewExecutor`, the component that already owns provider invocation and Work Parcel evidence. At a completed immutable-chunk boundary it assesses bounded remaining work, resolves the exact target through `ModelRegistry`, seals the existing baton, delegates through `GovernedHandoffRuntime`/`ContractExecutionRuntime`, invokes the destination, and leaves final independent result validation with `ParameterizedJobEngine`. A destination failure is contained by the existing token handoff recovery boundary and resumes the source route. Focused production-executor tests prove both success and recovery; no provider-specific route was added to core policy.

The account-aware extension retains that lifecycle and adds account and node identity beneath a provider. The next qualification audit established that the credential-bearing Codex profiles live on a Windows execution Resource, while the controller only orchestrates them. The implementation had still assumed that qualification and CLI invocation were controller-local and that a handoff destination reused the source node. That was a genuine integration defect.

The narrow fix adds `nodeId` to account-profile configuration and carries `provider/account/model/node` through registry candidates and decisions, token telemetry, sealed batons, child contracts, destination invocation, verification/recovery and Work Parcel chain totals. `CodexNodeExecutionPort` exposes only `accountStatus` and `execReadOnlyStructured`. Its controller-local implementation preserves the existing behavior. Its Windows SSH implementation reuses configured Resource transport and sends a base64 request data line plus the fixed audited PowerShell runner over stdin. A fixed encoded bootstrap reads those frames separately and passes the request to the runner as an argument, so variable inputs never become generated PowerShell source. The node resolves its own environment reference, discovers and validates `%LOCALAPPDATA%\OpenAI\Codex\bin\*\codex.exe`, and returns only sanitized structured fields. Qualification persists CLI version, executable SHA-256 and discovery timestamp, never the executable/profile path or raw stdout/stderr. Account selection remains explicit or predetermined policy, never utilization-driven rotation.

Physical account qualification found two defects in the first Windows runner. `powershell.exe -Command -` consumed all stdin as source, so the appended request line could not be read by the script. After framing was corrected, Windows PowerShell promoted Codex's native `login status` stderr stream to a terminating `RemoteException`; suppressing the stream then caused a false unauthenticated result. The final correction uses a fixed encoded framing bootstrap and captures the status stream only in memory under a temporary non-terminating error preference. It restores fail-closed handling immediately afterward and returns none of that raw stream.

## Physical qualification closure

The production remote account-status path is physically qualified for two isolated Codex profiles. The final bounded production exercise then qualified a separate two-route local-provider lifecycle: provider/model identity, live SSE telemetry, sealed baton, destination continuation, independent verification, additive Work Parcel accounting and recovery from an intentionally refused destination. Values not reported authoritatively remain estimated or unavailable. Exact IDs, hashes and limitations are retained in the [physical qualification narrative](agent-control-3.7-physical-qualification-20260902.md) and [sanitized machine record](agent-control-3.7-physical-lifecycle-20260903.json).

## Validation after production-path correction

- Earlier production-path focused command: `node --import tsx --test src/control/direct-repository-review-executor.test.ts src/control/token-aware-baton-routing.test.ts` — 11 passed, 0 failed.
- Full command: `npm run check` — TypeScript, bootstrap syntax, dashboard syntax, infrastructure neutrality and implementation-status consistency passed; 642 tests passed, 0 failed.

- Account-aware focused command: `node --import tsx --test src/control/token-aware-baton-routing.test.ts src/control/direct-repository-review-executor.test.ts src/control/codex-exec-provider.test.ts src/control/account-profile-qualification.test.ts src/control/model-registry.test.ts src/control/openai-compatible-provider.test.ts src/control/parameterized-jobs.test.ts src/control/adaptive-harness.test.ts src/control/web-server.test.ts` — 94 passed, 0 failed.
- Current full command: `npm run check` — TypeScript, bootstrap syntax, dashboard syntax, infrastructure neutrality and implementation-status consistency passed; 650 tests passed, 0 failed.
- Cross-node focused command: `node --import tsx --test --test-concurrency=1 src/control/codex-node-execution.test.ts src/control/account-profile-qualification.test.ts src/control/config.test.ts src/control/model-registry.test.ts src/control/direct-repository-review-executor.test.ts src/control/token-aware-baton-routing.test.ts src/control/codex-exec-provider.test.ts src/control/web-server.test.ts` — 80 passed, 0 failed.
- Final full command: `npm run check` — TypeScript, bootstrap/dashboard syntax, infrastructure neutrality and implementation-status consistency passed; 658 tests passed, 0 failed.
- Post-physical-defect full command: `npm run check` — TypeScript, bootstrap/dashboard syntax, infrastructure neutrality and implementation-status consistency passed; 658 tests passed, 0 failed.
- Codex 0.153 focused command: `npm run typecheck && node --import tsx --test --test-concurrency=1 src/control/token-aware-baton-routing.test.ts src/control/codex-exec-provider.test.ts src/control/web-server.test.ts src/control/config.test.ts` — typecheck passed; 60 tests passed, 0 failed.
- Codex 0.153 final command: `npm run check` — TypeScript, bootstrap/dashboard syntax, infrastructure neutrality and implementation-status consistency passed; 660 tests passed, 0 failed.
- At that intermediate checkpoint Agent Control handled no interactive login or credential content. Both remote account-status checks later passed physically, but the first bounded structured workload timed out and the checkpoint verdict was PARTIAL. The later final physical section supersedes that checkpoint without erasing it.
- Release-candidate command after final physical evidence and documentation closure: `npm run check` — TypeScript, bootstrap/dashboard syntax, infrastructure neutrality and implementation-status consistency passed; 664 tests passed, 0 failed.

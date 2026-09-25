# Agent Control 3.8.1 qualification evidence

Status: in progress; no release claim.

## Provenance

- Immutable base: `v3.8.0`, commit `09ac94a3a818b08ecd49beb87ea6acb383e425b4`.
- Published 3.8.0 package SHA-256: `d458a46dbe3268a69b30ed817ef4fd33635df0097c459022a423d19062f34a1f`.
- Candidate branch: `feature/3.8.1-credential-residency`.
- Initial candidate commit: `4bfb6002da0a7f0c68c08913890061a0c7d8aaa9`.

## 3.8.0 coupling audit

The released profile `nodeId` simultaneously selected credential lookup, Codex process placement, model qualification placement, routing identity, baton identity, and dashboard node display. Parameterized repository review also passed the repository node into model routing, making workload placement implicitly constrain provider/account placement. The Windows account-status operation attached Codex stdout/stderr directly to a process reached through SSH, allowing descendants to retain the remote pipe until the outer timeout.

3.8.1 preserves the legacy fields as migration inputs but normalizes them into `workloadNodeId`, `providerExecutionNodeId`, and `credentialNodeId`. Account qualification and provider execution use only the latter two. Repository resolution uses only workload locality. Routes, sealed batons, contracts, telemetry, verification/recovery, and parcel ledgers preserve all three.

## Deterministic evidence

The focused locality/configuration/model/Codex/dashboard set passed 72/72. The complete `npm run check` gate passed: TypeScript, bootstrap syntax, dashboard syntax, infrastructure neutrality, implementation-status consistency, and 702/702 tests. Markdown link validation passed across 97 documents and `git diff --check` passed. Tests cover separated locality, same-node account isolation/fallback, unavailable credentials, legacy migration, immutable cross-node archives, route sealing, sanitized Windows execution, and local compatibility.

## Physical results — 2026-09-03

The production controller-local `qualifyAccountProfile` path qualified one isolated Codex account (`controller-account-a`) on `controller` at `2026-09-03T20:40:31.854Z`. The installed client was `codex-cli 0.144.4`, executable SHA-256 `134063e133f0b4244fa3b251acf973d4fe4b4aeeacbdc135211bf480f59f1477`. No second authenticated controller-local profile/reference was present. An existing separate profile directory returned the native unauthenticated result; it was not populated from the active profile because credential copying is prohibited.

The fixed production remote path was then exercised as `qualifyAccountProfile → ResourceCodexNodeExecutionPort.accountStatus → configured Windows SSH Resource → audited PowerShell runner`. The `cottage-plus` account completed from `2026-09-03T20:40:16.192Z` to `20:40:17.247Z` and returned the sanitized expected result `codex_chatgpt_auth_required`, not `codex_node_timeout`. The second remote reference returned the same classification. This physically proves finite stdin, node-local stream redirection, bounded process completion, and safe unauthenticated classification; it does not qualify a remote authenticated account.

The governed `ResourceRepositoryResolver` was exercised against two existing Git working-tree candidates on the Windows workload node. Both returned sanitized `repository_snapshot_failed`. A bounded diagnostic established the cause: the noninteractive Windows execution environment has no usable Git executable on `PATH` or in the standard installed locations, and WSL has no installed distribution. The working trees exist, SSH succeeds with the configured noninteractive identity, and the fixed PowerShell operation starts; `git rev-parse`/`git archive` cannot run. Agent Control did not install software, copy a mutable tree, or substitute an ungoverned archive.

Consequently the mandatory MSI immutable-snapshot → controller-account execution cannot start. Account A → baton → account B and governed A-unavailable → B fallback also cannot be physically exercised because only one controller account is authenticated. No Work Parcel, run, baton, token/cost record, or dashboard/video evidence was manufactured.

The GLM whole-repository review and recording are explicitly conditional on all preceding physical multi-account gates passing. They were not started. The configured GLM credential was not read or exposed.

## Remaining external prerequisites

1. Provide a second independently authenticated controller-local Codex profile/reference; do not copy the active account store.
2. Make a qualified Git executable available to the governed noninteractive Windows Resource, or provide an already-supported immutable repository exporter on that node.
3. If remote authenticated residency is required for the release gate, authenticate one remote profile in its existing node-local store; the fixed unauthenticated path already fails promptly and safely.

Final verdict for this run: **BLOCKED — REQUIRED CREDENTIAL/PROVIDER RESOURCE UNAVAILABLE**.

No credential values, paths, raw provider streams, or account email addresses are recorded in this document.

## Resumed physical qualification — 2026-09-04

The preceding blocked result is retained as historical evidence. Qualification resumed from repository checkpoint `e50697874c0838d7b2acdf918a4f0cad7b8e4356` without changing product code, repository history, deployment state, or the global Codex authentication home.

### Controller account profiles

Agent Control's production profile resolver and `qualifyAccountProfile` path independently resolved and qualified `controller-account-a` and `cottage-plus` on the controller. The profiles have different opaque account IDs, different credential environment references, and different isolated Codex homes. Profile B was authenticated through its own supported Codex device flow; the same waiting process received approval and exited successfully. Both subsequent production status checks returned `QUALIFIED` with `codex-chatgpt-authenticated`. No credential file was read, copied, fingerprinted, or persisted, and the process-global `CODEX_HOME` was unchanged.

### MSI Git and immutable repository snapshot

Governed discovery established that Git was absent from MSI's noninteractive `PATH`, standard Git-for-Windows locations, and common application-bundled locations. Windows Package Manager was available, so the trusted `Git.Git` package was installed for the Windows user without changing Agent Control. A new governed SSH session resolved `git version 2.55.0.windows.3`; the executable SHA-256 was `7b7971dd13f0c3a284e538601f2f9770b3a87dfaccb5fb52d68141c67ed22364`.

Both pre-existing MSI Agent Control worktrees were dirty and were left untouched. A disposable clean clone of the newer MSI repository was created at commit `c37b54b00fa7318ac3261109641c8c5e68795eec`. The unchanged production `ResourceRepositoryResolver` then executed its fixed PowerShell snapshot operation, resolved the exact commit, rejected credential-like tracked paths, ran `git archive`, verified archive and extraction safety, and produced a read-only `remote-immutable-archive`. Archive SHA-256: `f5b9bd9f89a7e67f3da3e8e7ebdd9a7a73f272d0e9c5a8bab7b018842d1e9276`. The snapshot was clean and its source identity remained hashed; no Windows absolute repository path was persisted.

### Physical account A to account B baton lifecycle

The normal `DirectRepositoryReviewExecutor` production lifecycle reviewed two real immutable repository chunks using the documented qualification-only governor thresholds (`0.1/0.2/0.3/0.4` percent) while retaining the production assessment, baton, contract, handoff, provider invocation, and validator implementations.

- Job: `repository-code-review@1`
- Run: `5dd1a95d-719c-4503-af43-f464bb102c37`
- Work Parcel: `parcel-5de60fb2-69ed-4b94-b10e-221e297590fd`
- Source: `codex-chatgpt/controller-account-a/account-a-review`, workload `msi`, provider execution and credential residency `controller`
- Destination: `codex-chatgpt/cottage-plus/account-b-review`, workload `msi`, provider execution and credential residency `controller`
- Token baton: `token-baton:ff96cc1a-63ae-41cb-b991-2e7df7b09c5d`
- Token-baton SHA-256: `9b969d6b1c0a2724c5def43d1e0a3282cbba44162a23826cb22f4fa09b004c2d`
- Governed handoff: `handoff:0a0f0343-29f1-40bd-87ff-a2348ddcec23`, `DELEGATE`, `COMPLETED`
- Destination contract: `contract:33d44107-d5fd-4ffa-bcbf-ed89b62b25b8`, independent verification `PASSED`
- Final review verdict: `PASS`

The governor recorded unavailable live context at invocation start, then estimated ephemeral single-turn occupancy from authoritative completed usage: A `13,029 / 32,768` tokens (`39.76%`) and B `13,178 / 32,768` (`40.22%`). It recorded `CONTINUE`, threshold `COMPACT_AND_CONTINUE`, bounded-work `BATON_AND_HANDOFF`, sealed-baton readiness, destination continuation, and successful handoff while preserving the source thread as recoverable. Current-context occupancy is explicitly estimated; completed cumulative token usage is provider-reported. Provider cost was unavailable. Qualification-only configured pricing produced estimated/calculated route cost solely to exercise lower-cost selection.

Accounting reconciled exactly across every durable view: A `12,859` input + `170` output = `13,029`; B `12,830` input + `348` output = `13,178`; Work Parcel total `25,689` input + `518` output = `26,207`. Calculated qualification-routing cost was `0.131990 + 0.013526 = 0.145516 USD`; it is not claimed as provider billing.

### Governed account fallback

Account A was made temporarily ineligible only in the in-memory qualification registry; its authentication was not exhausted, corrupted, or logged out. Agent Control considered A and rejected it with `account-profile-disabled`, considered B as eligible, selected B with fallback reason `account-a-review:account-profile-disabled`, executed the real provider call, and independently verified `PASS`. The temporary policy disappeared at process exit.

- Run: `fbf1fcc9-0fb9-42d6-96c6-4d6ef9889b05`
- Work Parcel: `parcel-9009aa24-364e-4936-b741-31e674c97960`
- Selected account: `cottage-plus`
- Usage: `12,378` input + `192` output = `12,570` total tokens
- Calculated qualification-routing cost: `0.012762 USD`; provider cost unavailable

This proves governed configured-profile fallback. It is not represented as live quota or rate-limit failover.

### Recovered GLM credential reference and provider qualification

The initial shell-only check was insufficient. Historical Ox/Ox Alpha launch configuration identified `OPENROUTER_API_KEY_FILE` and the established `/etc/agent-control/openrouter.key` reference. The file remained present with owner-only permissions; its value was never printed, copied, or persisted. The current qualification shell and service manager did not inherit either OpenRouter variable, and the canonical example retained only the direct environment reference. Agent Control's generic file-reference compatibility was restored without a provider-specific shortcut.

The first real `qualifyModel` run authenticated and proved exact `openrouter/z-ai/glm-5.3-flash` identity but exhausted the hard-coded 256-token allowance during structured output. After a bounded 1,024-token allowance was applied to nontrivial capability checks, the production qualifier passed identity, coding/structured output, reasoning, and tool-use. Provider-reported qualification usage and costs were retained; no credential value or path entered the evidence. Qualification evidence root: `/opt/qualification/agent-control-3.8.1-glm-KvSmy8`.

### Full frozen-repository GLM review

Commit `d9f768123378e6d2858e9578cf8748e485186153` was frozen with 604 tracked files. All 468 source, test, configuration, and documentation text files were supplied verbatim; 136 binary, generated-report, and historical raw-log files were represented by exact path, size, and SHA-256 so the request fit the qualified context envelope without losing repository coverage. Context SHA-256: `4d58bc29810c9718e093cec1b2d75f2b476b7878cc0d977bd7099882cc1b9191`.

The first accepted monolithic attempt reached the exact 32,768 output-token ceiling and returned `incomplete`; Agent Control retained 985,134 input and 32,768 output tokens with provider-reported cost `0.1641541 USD`, failed verification, and did not claim success. The bounded final attempt used the Job's supported 65,536 ceiling and completed:

- Run: `run-e1a6c1ed-df0b-4f6f-b409-d9ee9650ea86`
- Provider/model: `openrouter/z-ai/glm-5.3-flash`
- Provider response: `gen-1788503327-FYormfXpHxYraa3YHwCX`
- Raw-response SHA-256: `5aca181adb82f08abb5852ddc6115f436b7fe5798ebc79cd267bd6f1245eeeab`
- Usage: `827,644` input + `53,898` output = `881,542` total; `44,808` reasoning tokens; provider-reported cost `0.1510956 USD`
- Independent verification: `provider-completed` and `review-content-complete` both passed
- Review verdict: `PASS_WITH_FINDINGS`

The review identified two high-severity and several medium/low findings. During qualification it correctly found that the operator review artifact retained a resolved credential-file path and raw provider body. That evidence-boundary defect was fixed immediately: artifacts now retain the declared reference name and response hashes/status/usage only. The three temporary artifacts were sanitized with old/new hashes preserved in `artifact-remediation.json`; no credential value was observed. The remaining high findings—repository-review retry thread identity and Spark untracked-file scope containment—and the medium contract-verdict finding require separate remediation and prevent release closure.

No callable Computer Use, Chrome-control, or built-in browser-control surface was bound to this task, so a genuine dashboard video could not be produced. Durable lifecycle transitions and completed telemetry were retained, but OpenRouter's non-streaming Responses call exposed no authoritative mid-response token samples; live token and cost fields remained unavailable until completion rather than being estimated.

Machine-readable resumed evidence is recorded in `agent-control-3.8.1-resumed-physical-evidence.json`. Operational full-fidelity records remain under `/opt/qualification/agent-control-3.8.1-accounts-1AJFlB`, `/opt/qualification/agent-control-3.8.1-fallback-LSq14w`, and `/opt/qualification/agent-control-3.8.1-msi-gsP6he`.

Final regression at this resumed checkpoint passed `npm run check`: TypeScript, bootstrap syntax, dashboard syntax, infrastructure neutrality, and all 32 implementation-status claims passed; the complete deterministic suite passed 702/702 tests with zero failures, cancellations, skips, or todos. The evidence JSON parsed successfully, `git diff --check` passed, and a bounded secret/path scan found no credential values or Windows absolute paths in the persisted evidence.

Current verdict: **REVIEW_REQUIRED — GLM QUALIFIED AND FULL REVIEW VERIFIED; RELEASE BLOCKED BY REVIEW FINDINGS**.

Final post-review regression passed `npm run check`: TypeScript, bootstrap and dashboard syntax, three neutrality checks, all 32 implementation-status claims, and 703/703 deterministic tests passed with zero failures, cancellations, skips, or todos.

## High-finding remediation checkpoint — 2026-09-04

The governed review's two High findings were reproduced at their production integration seams and fixed without weakening route, credential-residency, baton, or thread identity checks.

Repository-review retries intentionally retain one logical Run and frozen repository, but each executor attempt creates a new Work Parcel. The prior thread key omitted the attempt and therefore collided with the new parcel on retry. The engine now supplies an explicit one-based execution attempt and the provider-neutral direct executor keys token threads as `review:<run>:attempt-<n>:<chunk>`. The original failed thread/parcel and provider reason remain durable and recoverable; the retry opens a new immutable thread rather than rebinding identity or suppressing `token_thread_identity_changed`. A focused composed-path regression drives `ParameterizedJobEngine → DirectRepositoryReviewExecutor → TokenAwareBatonRuntime`: attempt one fails after live telemetry, attempt two completes, both attempt threads retain distinct parcel provenance, and retry history retains the original provider failure.

Spark previously derived scope solely from `git diff`, which cannot represent an untracked file. The new reusable Git mutation-surface primitive uses `git status --porcelain=v1 -z --untracked-files=all --ignored=no` and a complete `HEAD` diff. It accounts for staged/unstaged modifications, additions, deletions, both rename paths, non-ignored untracked files, unusual filenames, changed lines, and content-addressed mutation evidence without modifying the index. Git-ignored transients remain excluded. A real-runner regression creates an out-of-scope untracked file and proves containment escalates with `unapproved-file-touched` before independent verification.

Focused validation passed 32/32 tests. The first complete post-fix `npm run check` passed TypeScript, bootstrap/dashboard syntax, three neutrality checks, all 32 implementation-status claims, and 707/707 deterministic tests with zero failures, cancellations, skips, or todos. Physical retry/scope proofs and the mandatory fresh governed GLM review remain pending at this checkpoint, so the verdict remains **REVIEW_REQUIRED — RELEASE BLOCKED**.

## Physical High-remediation proof and independent review — 2026-09-04

The two original High remediations were exercised through their real production seams at commit `558e361e577de5785507428379ec6e8b11d12b5b`.

The retry proof used `ParameterizedJobEngine → DirectRepositoryReviewExecutor → OpenRouter/GLM-5.3-Flash`. Run `aa35702d-ec9e-45c5-b0ff-b385c66a2625` retained immutable repository SHA `261f96a6f4af82fd9d8538630f327cbdbd1e960d` while a controlled first provider-transport failure created failed parcel `parcel-e84a4f67-01b5-46b0-bcb7-d606b3c09454`; attempt two opened distinct parcel `parcel-d4814f51-6da1-4ddf-9c3e-9133ae6575e9`, invoked the real provider, and completed `SUCCEEDED_WITH_FINDINGS`. The thread IDs contain `attempt-1` and `attempt-2`; both remain recoverable, the original error remains visible, and no `token_thread_identity_changed` occurred. The successful leg used 212 input plus 3,767 output tokens (3,979 total) and provider-reported USD 0.0019153. Current context remained unavailable rather than inferred. Machine evidence is `/opt/qualification/agent-control-3.8.1-high-remediation/retry-run-EVMquh/retry-proof.json`.

The Spark containment proof used the real `CodexFastExecutionRunner` and `FastExecutionCoordinator` in a disposable Git repository. A fixed audited mutation process wrote one untracked `outside-scope.txt`; the mutation surface detected it, computed mutation SHA-256 `cd24c995c48ee5e702a34c84996b4dba610036983c3f307227f41b9c755d32ab`, and returned `ESCALATED / unapproved-file-touched` before the independent verifier was called. The disposable artifact was removed and the product repository remained clean. Machine evidence is `/opt/qualification/agent-control-3.8.1-high-remediation/scope-proof.json`.

A fresh governed full-repository GLM-5.3-Flash review froze the same commit and supplied one immutable 606-file bundle: 470 text files verbatim and 136 generated/binary/raw files by path, size, and SHA-256. Context SHA-256 was `10ece3adef1d0a533f0b289112e5da314fe6375b661cf6e4b3479631c3423635`. Run `run-3d7b2a5f-d2ac-47e8-9c11-dae69eadb4ac` passed both provider-completed and review-content-complete verification, consuming 844,958 input and 30,442 output tokens (875,400 total) at provider-reported USD 0.07098235. The review found no Critical or confirmed High issue and independently confirmed both original High root causes fixed. It identified release-relevant Medium findings in restart durability, example configuration, verification verdict propagation, cost-budget enforcement, state-file permissions, and account-bound environment isolation; those are remediated in the subsequent candidate rather than risk-accepted. Review evidence is `/opt/qualification/agent-control-3.8.1-glm-post-fix-review/GLM-REVIEW.md` with machine summary `/opt/qualification/agent-control-3.8.1-glm-post-fix-review/review-summary.json`.

The ignored-file and `.git` mutation-surface observation remains a bounded deferred hardening item: ignored repository-local transients are intentionally excluded by policy and Spark remains default-disabled, one-attempt, disposable-worktree-only, and independently verified. The candidate does not claim that ignored paths are part of the approved mutation ledger.

### Independent-review remediation

The release-relevant Medium findings were corrected without broadening the 3.8.1 architecture. Provider execution now increments a durable Run `executionSequence` before each invocation, so restart recovery cannot reuse a prior attempt's token-thread identity. Independent validation updates only the successful attempt's parcels and derives contract acceptance from `PASS`/`PASS_WITH_FINDINGS`; rejected verdicts fail the contract. A configured `maxCost` now fails closed when both provider-reported and calculated cost are unavailable. The canonical example configuration is validated by a regression and its account-bound Spark model now matches the controller execution node. Account-bound Codex child environments remove ambient `OPENAI_API_KEY` and `CODEX_API_KEY`, and foundational workspace, event, checkpoint and telemetry files are created/chmodded mode 0600.

Focused validation passed 56/56, with an additional 9/9 direct lifecycle check and 3/3 state-permission check. The complete post-remediation `npm run check` passed TypeScript, bootstrap/dashboard syntax, all neutrality checks, all 32 implementation-status claims, and 711/711 deterministic tests. A final immutable governed review of this remediated candidate remains the last independent-review gate; no release is claimed by this checkpoint.

## Final governed review and release-candidate evidence checkpoint

The final governed review froze implementation commit `967181fd547f43a50cb26da566c6118ef7824364` with a clean tree and 606 tracked files. The 3,497,742-byte complete context had SHA-256 `b21aad861d7507d94c48e96118173fc7521cfb637ed35ca66251b9ab5a901b51`; 470 text files were supplied verbatim and 136 generated/binary/raw files were represented by path, size, and SHA-256.

- Run: `run-1c151e3a-19ad-41e5-8f58-3075eb1460c1`
- Provider/model: `openrouter/z-ai/glm-5.3-flash`
- Provider response: `gen-1788516282-J0iAWsLfUyuaFEJOpJsY`
- Raw-response SHA-256: `d77a60520870218eeb3f51d6a52354c5d03e0b9edf60f766cd87640bc6f4e66f`
- Usage: 847,422 input + 28,628 output = 876,050 total; 23,130 reasoning tokens
- Provider-reported cost: USD 0.07071365
- Independent verification: `provider-completed` PASS; `review-content-complete` PASS
- Review artifact SHA-256: `03a9d900312a928b7a6779f2a94dd9c029561c0a3528282b92fe99cb597fd5b3`
- Findings: 0 Critical, 0 High, 1 Medium, 6 Low, 3 Informational

The review independently confirmed both original High root causes fixed and all release-relevant Medium findings remediated. Its one Medium is the already documented ignored/`.git` mutation-surface hardening deferral. That does not undermine the 3.8.1 claims: ignored repository transients are intentionally excluded from the approved mutation ledger, and Spark remains disabled by default, one-attempt, disposable-worktree-only, and independently verified. Low/Informational items are future hardening or maintainability work and do not invalidate credential residency, retry identity, complete non-ignored Git mutation containment, verification, or cost-budget behavior.

Sanitized physical High-fix proof is committed as [agent-control-3.8.1-high-remediation-physical.json](agent-control-3.8.1-high-remediation-physical.json). The final review and machine summary are committed as [agent-control-3.8.1-final-glm-review.md](agent-control-3.8.1-final-glm-review.md) and [agent-control-3.8.1-final-glm-review.json](../provenance/EXTERNAL-EVIDENCE.md). No credential value, credential path, Windows absolute path, raw provider body, or authentication material is present in these records.

The previously committed multi-account evidence remains valid because the High fixes changed only generic retry identity and mutation observation. The subsequent account-environment hardening was covered by a focused isolation regression and removes ambient API billing credentials without changing either isolated CLI home. Existing evidence still proves Account A qualification, Account B qualification, Account A → sealed baton → Account B, governed A-unavailable → B fallback, exact account attribution, and reconciled telemetry. No redundant credential-bearing physical rerun was manufactured.

Interactive dashboard video remains unavailable from this execution surface and is not claimed. The committed physical evidence and existing SSE/dashboard tests provide the programmatic telemetry reconciliation required by this gate.

Final candidate verdict: **READY_FOR_RELEASE_AUTHORIZATION**. No merge, tag, GitHub Release, deployment, or release mutation has been performed.

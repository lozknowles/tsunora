# Agent Control 3.9 provider-neutral orchestration qualification

Date: 2026-09-05

Branch: `feature/3.9-resilient-execution`

Released base: `v3.8.2` / `b51623dae1b764a31198424e8fc6ea9076d04089`

Physical source checkpoint: `861b40a8663c4c57c2ed11925d11f593f48d189b`

## Verdict

`PASS_WITH_LIMITATIONS`

The generic architecture, physical context recovery, asynchronous dependency handling, repeated real-model qualification, historical retention, capability-first routing, runtime-safety evidence and live dashboard passed. Browser/computer model evaluation, authoritative local current-context occupancy, local monetary/energy cost and automatic preferred-model promotion remain unclaimed.

No merge, tag, release or deployment was performed.

## Evidence integrity

| Evidence | SHA-256 |
| --- | --- |
| [`agent-control-3.9-provider-neutral-qualification.json`](agent-control-3.9-provider-neutral-qualification.json) | `2bfc26e6ddd8d619ceada263860769f330ca5625ee40eb2d6f61f9fd33b4a678` |
| [`agent-control-3.9-provider-neutral-dashboard.mp4`](../evidence-archive.md) | `8828d3fe28e741f0694998629270d96498cd329177fe4f0824216f4d0fcdaaaa` |
| [`agent-control-3.9-provider-neutral-dashboard-video.json`](agent-control-3.9-provider-neutral-dashboard-video.json) | `91a1084d9477d0a3a963a2dbddd4bc851666950849447c325f234f575310b86f` |

The final physical run began `2026-09-05T08:48:07.684Z` and completed `2026-09-05T08:53:02.147Z` against a clean tree (`git diff` SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`). The 311.12-second MP4 is H.264, 1920×1080, 10,354,528 bytes. Chromium 152.0.7977.64 observed the real dashboard SSE state as `LIVE` at `2026-09-05T08:48:09.667Z`.

## Real candidates

| Route | Runtime/node | Immutable local artefact | Availability |
| --- | --- | --- | --- |
| `llamacpp-instruct/default/qwen2.5-instruct-3b-q4km@controller` | llama.cpp `9371-22d9bc441` / controller | GGUF Q4_K_M, 2,104,932,768 bytes, SHA-256 `626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d` | `AVAILABLE`, preflight 20 ms |
| `llamacpp-coder/default/qwen2.5-coder-3b-q4km@controller` | llama.cpp `9371-22d9bc441` / controller | GGUF Q4_K_M, 1,929,903,360 bytes, SHA-256 `3da3afe6cf5c674ac195803ea0dd6fee7e1c228c2105c1ce8c66890d1d4ab460` | `AVAILABLE`, preflight 4 ms |

Both routes used the same provider-neutral OpenAI-compatible execution adapter through separate live local endpoints. No provider credential was required or persisted.

## A. Context recovery

Parcel `parcel-231a2bd7-09e0-47f7-af52-d7932e10ae8d` completed `SUCCEEDED` with its explicit `EXPECTED_RESULT` criterion passing.

- Approach alpha failed once in event `context-event-e4a792a9-0df6-4e58-ae70-458de7bbddff`, SHA-256 `9fc6bd9c71090fbc25181cfe0833fbe754ac12dc66a1bafc5ba223f354bc6982`.
- Ninety-six unrelated observations moved that failure outside the latest bounded baton.
- The recovery stage retrieved the same event ID/SHA from durable history.
- The next executor selected beta; alpha attempts remained 1 and beta attempts were 1.
- Event count: 126; event-ledger size: 103,526 bytes; latest baton: 4,941 bytes; historical bytes excluded: 98,585; retrievals: 1.

This proves that baton reduction did not erase the failed approach and the executor did not repeat it.

## B. Non-blocking question and dependency graph

Parcel `parcel-18eef654-0ed5-48b8-8bba-0e8c7c0f8c7f` completed `SUCCEEDED` with its explicit `EXPECTED_RESULT` criterion passing.

Question `question-cded8dfc-6af2-47ef-9c24-719fb0cf26b1` was created at `2026-09-05T08:48:09.765Z`. The independent left branch completed at `08:48:13.811Z`. Immediately before the answer at `08:48:16.856Z`, durable state was:

```text
left  = SUCCEEDED
right = WAITING
join  = QUEUED
```

After the answer, right and join ran on `qualification-controller`; all three stages succeeded. The video visibly shows the open question, the left branch running and then succeeded while right waits, and subsequent full completion.

## C. Frozen real-model qualification

Suite `agent-control-real-work-v1` v1.0.0 has SHA-256 `8cb55e097d2e7fa5ebe36ed6ffc152e5639278f8c7ae4f886bab2ac553766062`: 17 tasks, three repetitions, two candidates, two complete batches. Each batch persisted 102 attempt records; 204 records reloaded from disk.

| Candidate | Attempts | Measured | Pass/fail | Explicit unavailable | Input (fresh/cache) | Output | Total | Measured elapsed | Cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Qwen2.5 Instruct | 102 | 48 | 36 / 12 | 54 | 4,134 (48 / 4,086) | 4,842 | 8,976 | 94,874 ms | unavailable |
| Qwen2.5 Coder | 102 | 60 | 38 / 22 | 42 | 5,022 (209 / 4,813) | 10,103 | 15,125 | 193,772 ms | unavailable |

The batch status is intentionally `PARTIAL`: no governed `AGENT_CONTROL_WORKFLOW`, browser or computer evaluator was bound for these candidates, so those attempts are `CAPABILITY_UNAVAILABLE`. Measured failures are `VERIFICATION_FAILED`, not silently converted to provider unavailability. Local energy/tariff was not measured, so actual/calculated monetary cost is `null`.

Provider-reported cumulative input/output/total usage is authoritative. Current context for these one-shot requests is separately labelled `estimated`; lifetime usage is never relabelled as occupancy.

## D. Capability-first routing

The required capability was `code.modify`.

- Instruct was ineligible: `code.modify:capability-unobserved`.
- Coder was eligible: `all-required-capabilities-verified` with a verified native observation from the second frozen batch.
- Selected route: `qwen2.5-coder-3b-q4km`.

Selection occurred only after capability eligibility. Quality, reliability, latency, cost and token/cache efficiency were optimization inputs among compatible candidates, not substitutes for missing capability.

## E. Historical retention

Both batch IDs remain present after a new `ModelIntelligenceLedger` loaded the state file:

- `physical-qualification-20260905084807-1`
- `physical-qualification-20260905084807-2`

All 204 attempt records remained addressable. Same-day results did not auto-promote either candidate or fabricate a leader. Seven production `JobRuntime` actions also produced durable independent `ALLOW_WITH_AUDIT` safety decisions.

## Measured context value

- Average baton view: 5,261.214 bytes.
- Maximum baton view: 9,251 bytes.
- Combined durable event ledger: 121,412 bytes.
- Historical bytes excluded from latest views: 111,709 bytes.
- Context recovery: 1/1.
- Repeated failed approach: 0/1.
- Work Parcel completion: 2/2.
- Instruct measured-task completion: 36/48 (75%); cached-input ratio: 4,086/4,134 (98.84%).
- Coder measured-task completion: 38/60 (63.33%); cached-input ratio: 4,813/5,022 (95.84%).
- Combined real-model use: 9,156 input (257 fresh, 8,899 cache-read), 14,945 output and 24,101 total tokens.
- Monetary cost per success: unavailable; no energy/tariff source was configured.

There is no comparable pre-3.9 persistent-ledger baseline, so the report claims the directly observed size separation and recovery outcome, not a fabricated percentage improvement.

## Qualification-discovered defects

### Repeated qualification evidence collision

The first physical checkpoint reused capability-observation IDs across frozen batches. Provider calls in batch 2 returned and were scored, but observation insertion raised `capability_observation_exists`; the evaluator then misclassified affected measured attempts as `CAPABILITY_UNAVAILABLE`. The original evidence is retained unchanged as:

- [`agent-control-3.9-provider-neutral-qualification-before-repeat-fix.json`](../provenance/EXTERNAL-EVIDENCE.md)
- [`agent-control-3.9-provider-neutral-dashboard-before-repeat-fix.mp4`](../evidence-archive.md)
- [`agent-control-3.9-provider-neutral-dashboard-video-before-repeat-fix.json`](../provenance/EXTERNAL-EVIDENCE.md)

The fix includes `batch.id` in every evaluation observation ID, classifies a duplicate as `ARCHITECTURE_REGRESSION`, and adds deterministic repeated-batch coverage. Afterward, both batches retained identical measured/unavailable topology and all 204 attempts reloaded.

### Dashboard optional-projection/SSE coupling

The first corrected recording exposed that an unconfigured optional parameterised-Job projection rejected the initial refresh before `connectEvents()` ran. Core data rendered, but the badge remained `CONNECTING` and the panel produced a repeating error toast. The fix starts SSE independently and degrades only the optional panel to an explicit unavailable message. The final recorder fails unless it observes `LIVE`; the final video shows `LIVE` throughout and no repeating global error.

### Neutrality fixture topology

The final repository gate rejected deployment-specific controller repository and worktree roots in the new runtime-safety test fixture. No production runtime path depended on them, but shipping the fixture would have violated the Linux-first/private-topology neutrality policy. The fixture now uses generic POSIX and Windows roots and a generic remote-node identity. Its focused five tests, the three-test neutrality gate and the complete suite pass afterward.

## Reproduction

Deterministic gate:

```bash
npm run check
```

Physical runner (candidate JSON intentionally abbreviated; use exact local/provider identities and indirect credentials):

```bash
AGENT_CONTROL_QUALIFICATION_CANDIDATES_JSON='[...]' \
  npm run qualify:provider-neutral -- \
  --state-dir /absolute/private/state \
  --evidence-file /absolute/evidence.json \
  --host 127.0.0.1 --port 4390 --hold-ms 10000
```

Dashboard evidence:

```bash
AGENT_CONTROL_QUALIFICATION_CANDIDATES_JSON='[...]' \
AGENT_CONTROL_CHROMIUM=/absolute/path/to/chromium \
AGENT_CONTROL_QUALIFICATION_OPERATOR_TOKEN='qualification-only-token' \
npm run record:provider-neutral
```

## Remaining limits

- Browser/computer tasks need a governed evaluator adapter and real interaction evidence.
- The local endpoints do not provide authoritative current-context occupancy.
- No local monetary/energy cost source was available.
- Multi-day sample history and approval are still required before preferred routing or leader claims.
- This proof uses two provider IDs and model endpoints through one OpenAI-compatible adapter; provider-neutral core contracts are deterministic-tested across adapters, but this particular frozen physical run does not claim a second wire protocol.

## Final validation

Physical evidence above was captured before documentation-only changes so its source tree was clean and its executable checkpoint exact. Candidate closure then passed:

- focused provider-neutral orchestration/model tests: 88/88;
- focused browser-dashboard tests: 4/4;
- complete repository suite: 817/817, zero skipped or cancelled;
- TypeScript, bootstrap/shell syntax, dashboard syntax and three-test infrastructure-neutrality gate;
- all 45 canonical implementation-status entries and regenerated projection;
- 602 local Markdown links across 125 tracked Markdown files;
- `npm pack --dry-run`: 653 files, 20.5 MB packed / 25.7 MB unpacked;
- clean-prefix package install, with installed CLI reporting `agent-control 3.9.0`;
- `git diff --check` and evidence hash/media validation.

The release candidate remains an isolated, unmerged branch. These results authorize review only; they do not constitute a release, tag or deployment.

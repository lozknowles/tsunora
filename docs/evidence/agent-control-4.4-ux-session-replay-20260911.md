# Agent Control 4.4 UX Session Replay Qualification

## Verdict

`PASS_PHYSICAL_UX_SESSION_REPLAY`

This qualifies the isolated 4.4 development capability. It does not merge,
tag, release or deploy Agent Control 4.4.

- Qualified implementation: `3b0f89653784f90e092c07f61123ba1f9249a42b`.
- Canonical parallel session SHA-256: `c9a79159d2702eae2300b28cd65eb0b490f5c8e6ce1642a8db051b6f4d4a2ddb`.
- Canonical Your Memories session SHA-256: `fb13c9776178b67ab40aed8715020bf8ff8e637fe0dd26ced223d2ee483f3d0b`.
- Full regression: 1,125 passed; 0 failed; 0 skipped.
- Focused UX/session/security integration: 6 passed; 0 failed.

## Authoritative inputs

- Parallel-lane checkpoint: `fcb4127d049408af2177c1e5104b638160933e7e`.
- Memory checkpoint: `e449cd4d40fb570bacbd79ce64a2e5892f4372fa`.
- The parallel source contains three genuine provider invocations, independent
  gates, a 2,066-line product transcript and the original dashboard MP4.
- The memory source contains the genuine governed 8+8 experiment and safety
  rejection evidence.

The implementation imports exact Git objects and hashes them. It does not copy
an old implementation branch over current 4.4 work or rerun paid providers.

## Observed replay

| Lane | Provider/model | Gate | Input | Output | Total |
| --- | --- | ---: | ---: | ---: | ---: |
| Luna | codex-chatgpt / codex-luna-controller-a | FAIL | 7,885 | 1,346 | 9,231 |
| Qwen | local-qwen / qwen-parallel-reviewer | FAIL | 1,136 | 1,368 | 2,504 |
| GLM | openrouter / glm-5.3-flash-parallel-reviewer | PASS | 1,098 | 2,064 | 3,162 |
| Sol | conditional escalation | NOT INVOKED | 0 | 0 | 0 |

Aggregate: 10,119 input + 4,778 output = 14,897 total tokens. GLM was
accepted because its independent gate passed; Sol was correctly excluded.
Current-context occupancy and complete monetary cost were unavailable and were
not inferred.

The recorded Chromium journey loaded a capability URL, showed all route cards,
played the complete event timeline, filtered telemetry, opened diagnostic
detail and reached the verified outcome. It then visibly opened and played the
second **Your Memories** session through request → provenance checked →
accepted/rejected → bounded context supplied, with contents hidden. There were
no browser errors.

Normal replay presents that second flow as **Your Memories**: relevant memories
found → governance/provenance checked → accepted or rejected → used in this
session. The browser/API qualification rejects MARM, generic-memory and
memory-optimisation terminology in the normal shared view. Those terms remain
available only in architecture, technical evidence and authorised diagnostics.

## Security and integrity

- Session records are immutable and SHA-256 verified on every read.
- A conflicting write fails closed.
- Capability records persist a token hash only and enforce denial, expiry and
  revocation.
- External API output contains no source paths, source excerpts, credentials,
  raw provider transport output, private reasoning, shell or rerun capability.
- Diagnostic fields appear only at the declared diagnostic audience.
- Comments remain a separate redacted overlay.

## Artefacts

See `qualification/agent-control-4.4-ux-session-replay-20260911/`:

- `canonical-session.json`
- `memory-session.json`
- `sanitised-external-view.json`
- `authorised-diagnostic-view.json`
- `interactive-replay.png`
- `your-memories-replay.png`
- `agent-control-4.4-ux-session-replay.mp4`
- `complete-transcript.md`
- `human-readable-digest.md`
- `evidence-manifest.json`

The manifest contains exact hashes, sizes, media properties and source-object
hashes. The replay video is 1920×1080 H.264, 42.76 seconds, SHA-256
`53ef0707f0549dac48531fc8dc14edbfeedf9812dae97fb59e9b1adf6af6003d`.
The original 4.3 MP4 remains
preserved at its original checkpoint and is bound into the canonical session by
SHA-256; it is not replaced by the replay recording.

## Recommendation

Include this capability in Agent Control 4.4 behind the existing evidence and
operator-authentication boundaries. The generic session projection is suitable;
MARM remains optional and reviewer-comment-to-Work-Parcel automation remains a
future governed integration rather than a release claim.

# Agent Control POE development qualification — 2026-09-08

## Scope and provenance

- Repository: `agent-control`
- Isolated worktree: local isolated POE worktree; the host-specific path is intentionally not distributed
- Branch: `feature/poe-conversational-operator-20260908`
- Base release: `v4.0.0`
- Base commit: `ff7ed114c08b71583e2a2d67b40d081f0b0a4c33`
- Change type: post-4.0 isolated feature development
- Release actions: none
- Deployment actions: none

The supplied workstream defines POE sections 1–25 and begins section 26, then ends at “The operator should be able to”. This implementation does not invent the missing tail.

## Implemented production path

```text
authenticated channel
  -> durable channel-scoped POE conversation
  -> focused AgentControlService evidence adapter
  -> deterministic renderer or qualified Model Registry response role
  -> explanation or editable benchmark proposal
  -> fairness validation
  -> frozen proposal SHA-256
  -> exact authenticated operator approval
  -> WorkParcelCoordinator.submitApprovedPlan
  -> registered Job DAG
  -> existing routing / governor / safety / execution / verification / accounting
```

The POE runtime cannot dispatch a Job from a conversational turn. Only approval of the current frozen revision/hash reaches the existing Work Parcel coordinator. Submission failure leaves the proposal frozen and recoverable.

## Deterministic evidence

Focused tests currently prove:

- authoritative focused answers and explicit unavailable records;
- prompt-injection/untrusted-content separation;
- original designed voice requirement and cloned-voice rejection;
- speech latency capture and TTS-only barge-in;
- benchmark fairness findings and freeze refusal;
- trusted conversational draft revision and untrusted voice non-mutation;
- stable proposal sealing, stale/hash-mismatched approval refusal, and recoverable submission failure;
- repetition materialisation as distinct registered Job stages and objective criteria;
- normal Work Parcel execution and independent verification completion;
- optional provider-neutral status versus reasoning model roles;
- exact evidence-citation enforcement and explicit deterministic fallback without silent model substitution;
- authenticated dashboard API and private conversation projection;
- authenticated WhatsApp text/voice POE questions with separate opaque identity provenance and no Work Parcel creation;
- audited normalization of the recognizer's narrowly scoped `Po`/`Pose` POE-name homophones while retaining the original transcription;
- focused natural overview answers for active work, waiting work, approvals and managed systems;
- a fresh, attributable client-playback interruption boundary for every newer voice reply;
- speech-friendly count and authority rendering plus independent STT content verification before audio delivery;
- fail-closed text fallback when a syntactically valid audio artifact does not say the requested content;
- credential-like content exclusion from durable POE state and transcript.

Focused validation command:

```bash
node --test --import tsx \
  src/control/poe.test.ts \
  src/control/poe-model.test.ts \
  src/control/poe-integration.test.ts \
  src/control/social-voice.test.ts
```

Result at the final development checkpoint: **36/36 passed**.

## Qualification-discovered repairs

Operator-assisted physical attempts found three narrow defects after the original blocked evidence was sealed:

1. Whisper could render the explicit assistant name as `Po` or `Pose`; the safety parser then correctly rejected the request as ambiguous. The ingress now performs a deterministic, audited name-only normalization inside explicit POE invocation and interruption phrases. It does not relax general command parsing or permit voice to create consequential work.
2. Natural questions such as “What is waiting?” resolved the authoritative overview but rendered every overview fact. The deterministic response now selects only matching authoritative overview fields unless the operator explicitly asks for status.
3. A completed social-audio reply did not replace an older interrupted playback boundary. The newest validated POE voice turn now becomes the next interruptible client-playback boundary while duplicate interruption of the same turn still fails closed.

A subsequent physical worker check found that raw dashboard-style text could produce a valid Ogg/Opus artifact whose spoken content did not match the requested response. Agent Control now prepares human-readable speech text and uses the configured independent recognition edge to compare the generated content before delivery. The corrected physical component round trip requested:

```text
Agent Control status. The current waiting work is zero. Waiting work, zero.
```

and independently transcribed:

```text
Agent control status. The current waiting work is zero. Waiting work zero.
```

The generated component-check artifact was Ogg/Opus, 5.244 seconds, SHA-256 `40f28c853296480e44b88c47208fc9495e38e07f5fa51258afa41c357ea2761e`. It was not represented as a completed POE physical qualification.

The original blocked physical evidence remains byte-identical: machine evidence SHA-256 `0c1555e755dbc8aa20d384f75907f5c0526f27076b40d10fe949e73c7e12bd89`; human evidence SHA-256 `981967f5ef5243f8d7ea2545d6324e19b81e1fb5d43d8dac0ce17921e74150a1`.

## Truthful limitations

- Operator-assisted physical POE attempts exercised authentic WhatsApp voice ingress, text replies, OmniVoice delivery and one genuine client-playback interruption, but no complete qualifying conversation was finalized or promoted as passing evidence.
- No real model-backed POE response has yet been physically qualified; deterministic tests use a synthetic OpenAI-compatible response.
- No real POE-created tournament has yet completed and updated a capability league.
- The corrected speech-integrity path has passed a real private-worker synthesis/transcription component check but still requires a fresh end-to-end physical WhatsApp run.
- Provider streaming cannot be claimed where the selected STT/LLM/TTS adapters expose only complete results.
- Human-evaluation coordination is represented and kept separate from objective criteria, but blinded media-pair presentation is not yet implemented in this narrow slice.

## Final development validation

```text
npm run typecheck           PASS
npm run check:bootstrap     PASS
npm run check:dashboard     PASS
npm run check:neutrality    3/3 PASS
npm run check:status        53/53 PASS
npm test                    1037/1037 PASS

npm run status:implementation -- --write
  generated docs/implementation-status.md

git diff --check
  PASS
```

The full gate includes the new POE runtime/model/API/Work Parcel tests and the modified Social & Voice suite alongside every existing repository test. No test was skipped, cancelled, or marked todo.

## Verdict

`IMPLEMENTED — PHYSICAL QUALIFICATION PENDING`

This is not a release verdict and does not authorize merge, tag, release, or deployment.

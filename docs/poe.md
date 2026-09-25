# Morrow conversational operator

Morrow is Agent Control's original chief steward and conversational operator, evidence guide, Crew liaison, benchmark designer, and optional OmniVoice interface. Morrow helps a human understand and propose work; the Crew and existing Agent Control runtimes execute it.

Morrow is deliberately not a second control plane. Its factual order is truth, clarity, usefulness, then personality. When a canonical record is absent, Morrow says it is unavailable. Its warm, calmly authoritative and quietly witty presentation never grants authority and never turns an inference into a system fact.

## Governed architecture

```text
dashboard / authenticated WhatsApp / OmniVoice / future mobile
                         |
             channel-scoped Morrow conversation
                         |
       focused AgentControlService evidence adapters
                         |
 deterministic renderer OR qualified routed response model
                         |
        explanation / editable benchmark proposal
                         |
        freeze SHA-256 -> explicit approval
                         |
 existing WorkParcelCoordinator -> registered Jobs -> Crew
                         |
 governor -> execution -> verification -> league evidence
```

`PoeRuntime` owns durable conversations, turns, proposal revisions, state changes, speech boundaries, and transcript projection. `AgentControlService.poeEvidence` resolves focused references to existing system, model, Job, Run, Work Parcel, lane, Crew, routing, governor, capability, baton, Live Shell, verification, benchmark, and human-evaluation records. It does not send giant state dumps to a model.

The optional `PoeResponseModelPort` is provider neutral. `RoutedPoeResponseModel` selects a configured Model Registry role, invokes the existing Codex or OpenAI-compatible adapter, requests a strict `agent-control.poe-response/v1` result, and accepts only citations present in the supplied evidence packet. A status role can use an inexpensive qualified route while an experiment-design role can use a stronger one. The provider/account/model/node route and measured usage/cost authority are attached to the Morrow turn. Invalid output or a failed selected route produces an explicit deterministic grounded rendering; another model is not silently substituted.

Set the optional roles in the controller environment:

```bash
export AGENT_CONTROL_POE_STATUS_MODEL_ROLE=poe.status
export AGENT_CONTROL_POE_REASONING_MODEL_ROLE=poe.reasoning
```

Both values name existing Model Registry roles. If only the status role is set, it is also used for experiment-design explanations. If neither is set, Morrow uses the deterministic grounded renderer and the dashboard truthfully reports that model routing is not configured.

## Dashboard operation

Authenticate the dashboard, open **Morrow**, and start a conversation. A turn is durable and preserves channel, modality, actor, content trust, focused references, evidence, response mode, actual model route, usage/cost authority, and voice latency where available. The unauthenticated system snapshot exposes only Morrow's safe identity, current state, voice availability, and observation time; conversations and proposals require operator authentication.

The character uses original SVG artwork and CSS animation. See [Morrow identity and compatibility](morrow.md). Its animation is driven only by real Morrow state:

- `IDLE` — restrained resident motion;
- `LISTENING` — an operator turn or interruption is being accepted;
- `INVESTIGATING` — canonical evidence is being retrieved;
- `THINKING` — a configured response model is active;
- `EXPLAINING` — grounded output is being presented;
- `OBSERVING_CREW` — a Work Parcel or Crew record is in focus;
- `DESIGNING_EXPERIMENT` — an editable proposal is being constructed;
- `WAITING_FOR_APPROVAL` — a frozen proposal has no execution authority yet;
- `SPEAKING` — OmniVoice synthesis is active.

Reduced-motion preferences disable animation. A decorative state never claims that a Job, model, or Crew member is executing.

**Ask Morrow about this** controls pass a typed object kind and stable ID from the native dashboard view. Morrow can offer a Live Shell reference and explain its state, but the existing Live Shell API remains solely responsible for WATCH, INTERVENE, TAKE_CONTROL, input, and reconciliation.

## Benchmark design and approval

A benchmark proposal records:

- the routing decision the experiment should inform;
- why current league evidence is insufficient;
- provider/account/model/node conditions;
- immutable fixture SHA-256;
- tools, context policy, authority, cache state, and time limit;
- software, hardware, quantisation, and endpoint disclosures;
- registered Job stages, objective metrics, optional blind `HUMAN_EVALUATION`, repetitions, and constraints.

Unequal fixture, tools, context policy, authority, cache state, or time limit blocks freezing. Software version, hardware class, quantisation, and provider endpoint differences remain prominent disclosed confounders. Morrow does not describe subjective preference as objective truth.

Drafts can be edited in the structured builder. The operator can also say `change the repetitions to 3`, `constraint: do not use Codex`, or `set the objective to ...`; only a trusted operator text turn may make those bounded draft amendments. Voice transcription and other untrusted content cannot mutate a proposal.

Freezing computes a stable SHA-256 over the exact proposal. Approval must name the current revision and exact hash. Repetitions are materialised as distinct registered Job stages and corresponding objective verification criteria. Human-evaluation metrics remain separately classified and do not satisfy objective completion.

Approval submits through `WorkParcelCoordinator.submitApprovedPlan`; Morrow does not execute the tournament. The request origin is `poe/dashboard` and carries opaque actor identity, conversation ID, proposal ID, frozen hash, and request key. Normal Job validation, capabilities, adaptive routing, safety, token governor, provider invocation, independent verification, accounting, and league updates remain authoritative. A missing Job, stale proposal, fairness defect, or submission failure leaves the sealed proposal recoverable and fails closed.

## OmniVoice

Set `AGENT_CONTROL_POE_VOICE_CONFIG` to an owner-controlled JSON file using the existing private speech provider shape:

```json
{
  "speechUrl": "http://127.0.0.1:19194",
  "tokenEnv": "AGENT_CONTROL_SPEECH_TOKEN",
  "voice": {
    "id": "poe-original-v1",
    "kind": "designed",
    "provider": "omnivoice",
    "modelRevision": "pin-an-exact-qualified-revision",
    "instruction": "original mature, warm, refined, measured male-presenting voice; excellent diction; restrained dry humour; no imitation",
    "seed": 4101
  }
}
```

The voice must be `designed`; Morrow rejects cloned voices even if a generic speech edge supports cloning. Audio is bounded and signature-validated. The authoritative transcription is retained as an untrusted voice turn. Where available, the turn records speech-end to transcription, transcription to response, response to generated audio, and total latency. Complete-audio providers are labelled non-streaming.

Barge-in aborts only the active TTS request and returns Morrow to `LISTENING`. It never cancels an executing Work Parcel.

## WhatsApp and other channels

An enrolled direct sender can ask `Morrow: <question>` or `ASK Morrow: <question>`; legacy `POE:` and `ASK POE:` invocations remain accepted through the existing Social & Voice coordinator. The authenticated channel creates one durable Morrow conversation keyed by a one-way identity reference. Raw sender/account identity does not enter the conversation. Read-only Morrow voice questions are permitted; ambiguous or consequential voice commands still require the existing fresh text confirmation.

Morrow conversation does not widen the Social & Voice command grammar. Consequential WhatsApp work still requires an approved template or the normal frozen-proposal approval path and becomes a Work Parcel. Enrollment, provenance, idempotency, ownership, approval expiry, cancellation, and delivery uncertainty remain unchanged.

Dashboard, WhatsApp, voice, and mobile conversations deliberately remain separate authentication/context boundaries while sharing the same persona and evidence rules.

## Security and records

- Repository text, logs, provider output, transcripts, and external content are data, not authority.
- Morrow cannot override the token governor, protected refs, production restrictions, credential residency, release authority, or deployment authority.
- The HTTP API requires dashboard operator authentication, origin checks for mutations, bounded bodies, and normal redaction.
- Secret-like input and output are rejected before persistence. Credentials, raw provider traffic, private reasoning, cookies, email addresses, and resolved credential paths are excluded.
- Model response errors are represented by a safe failed-closed classification, not raw provider output.
- Conversation Markdown is a human-readable projection of durable Morrow turns. Work execution continues in the canonical Run and Work Parcel transcript.

## API

Authenticated reads:

- `GET /api/poe`
- `GET /api/poe/conversations/:id`
- `GET /api/poe/conversations/:id/transcript`

Authenticated mutations:

- `POST /api/poe/conversations`
- `POST /api/poe/conversations/:id/turns`
- `POST /api/poe/conversations/:id/voice`
- `POST /api/poe/conversations/:id/interrupt`
- `POST /api/poe/conversations/:id/proposals`
- `POST /api/poe/proposals/:id` to revise a draft
- `POST /api/poe/proposals/:id/freeze`
- `POST /api/poe/proposals/:id/approve`

There is no arbitrary Morrow tool, shell, provider, authority, deployment, or release endpoint.

## Qualification boundary

Deterministic implementation tests prove evidence grounding, unknown-state honesty, model-role selection, model-citation failure, secret rejection, prompt-injection containment, channel separation, WhatsApp idempotency, proposal fairness/revision/sealing, repetition materialisation, stale approval, normal Work Parcel execution/verification, voice provenance/latency, and barge-in isolation.

This branch does not claim physical Morrow qualification. A physical pass still requires the real dashboard conversation, real Work Parcel/routing/governor explanations, one deliberately unfair then corrected proposal, approved safe benchmark through registered Jobs, league evidence, and a real OmniVoice exchange if the qualified hardware/software edge is available. The first physical continuation was [blocked before conversation ingress](provenance/EXTERNAL-EVIDENCE.md) because the paired Pixel was not advertising a discoverable wireless-debugging connect service; OpenWA and OmniVoice were independently reachable. The supplied workstream text ends mid-sentence in section 26, so no missing acceptance criteria have been invented.

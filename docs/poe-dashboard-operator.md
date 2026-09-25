# Morrow dashboard companion and operator

This feature extends the reconciled conversational Morrow checkpoint `86b79677bbc5243056d94919b76aacfe36f3806a` on an isolated feature branch. It is development work, not a release or deployment.

## Reused runtime

Morrow conversations, evidence resolution, benchmark proposals, shared original OmniVoice identity, speech recognition, worker capability resolution, the Job catalogue and ledger, Work Parcel planning/execution/verification, request provenance, dashboard authentication and runtime events remain the existing sources of authority. Morrow does not become a shell executor or select an unconfigured provider.

## New adapter

`PoeOperatorRuntime` projects executable jobs, manifest schedules, saved jobs/schedules and current system records. Versioned system topics are in `config/poe-system-topics.json`. Facts distinguish live observations, configured capabilities, documentation, historical evidence, inference and unavailable data. Structured evidence remains expandable in the transcript; the short spoken caption does not replace it.

`config/poe-operator-jobs.json` explicitly registers permitted conversational operations and their effects. The included system-observation job reads worker observations and creates a local verification artifact. Other registered jobs remain discoverable but require their native governed controls until their effects are explicitly registered. Alternate inputs currently require the native typed form; this adapter supports validated registered defaults.

A start request creates an expiring proposal containing the exact initiating text, job version, effective parameters, definition and policy hashes. Explicit approval rechecks ownership, the sealed hash, expiry, configuration and live worker capabilities, then submits an ordinary Work Parcel. Repeated approval is idempotent. Supported cancellation is a separate sealed approval for a parcel started by the same conversation. Speech interruption does not cancel work. Schedule mutation and publication are not conversationally enabled.

## Registry integration

`AGENT_CONTROL_POE_REGISTRY_SOURCES` can name an owner-controlled JSON array of `{id,name,url}` read-only registries. Only GET jobs/schedules is supported. HTTP requires loopback; HTTPS is permitted. Embedded credentials, redirects and oversized/invalid responses fail closed. Failed refresh clears prior observations rather than displaying them as live.

The independently running Collingham daily service supplies its real collection and reviewed-publication job definitions and registered daily schedule. Its existing API does not provide a qualified idempotent Work Parcel bridge or device/session preflight contract. Consequently Morrow can explain this workflow but cannot start that remote job. Pixel transport, Termux, browser session and Facebook authentication remain unavailable from this bridge. Collection, review, staging and publication are distinct boundaries.

## Browser and speech

The persistent dashboard launcher opens Morrow, an original responsive vector host with short silver hair, a clean-shaven face, a teal utility jacket and a copper badge. The six robotic crew members share ceramic, teal and copper materials while retaining their established names, role colours, accessories and behaviour. See [Morrow identity and compatibility](morrow.md). Conversation identity is scoped to the authenticated dashboard and stored per tab. Source references support native object links and follow-up focus.

New authenticated conversation endpoints are `operator`, `approve-job`, `transcribe` and `speech`; existing conversation, turn, transcript and interruption endpoints remain. Browser microphone capture uses MediaRecorder with bounded capture and releases its tracks. Recognition creates a visible untrusted voice turn before synthesis. Speech uses the established configured voice and independent content validation. A validation failure leaves the complete text available. The provider currently returns complete audio, so playback begins after synthesis and validation; this is not streaming TTS.

Audio requires an explicit browser unlock. Denied microphone/autoplay access exposes a typed fallback or replay control. Playback stop/barge-in aborts speech and suppresses stale audio. The CSP permits only same-origin/blob media in addition to existing restrictions. Credentials remain server-side or in the existing authenticated browser state; they are not embedded in transcript links.

## State and animation provenance

| Visual state | Actual trigger | Implemented presentation |
| --- | --- | --- |
| Idle | New idle conversation | Quiet breathing, labelled idle |
| Listening | Active user submission or microphone capture/transcription | Attentive head inclination |
| Thinking / investigating | Evidence/model or speech preparation request | Hand raised toward face |
| Explaining | Grounded answer returned | Open-hand pose and related record links |
| Speaking | Browser Audio playback starts successfully | Audio-analyser mouth movement and speaking pose |
| Working | Referenced Work Parcel observed RUNNING | Turns toward work area |
| Observing Crew | Submitted parcel or evidence observation | Head/arm oriented toward work area |
| Waiting for approval | Sealed unapproved proposal | Formal raised hand, no work indication |
| Interrupted | Browser stop or barge-in | Playback stops and animation transitions stop immediately |
| Blocked / failed | Actual unavailable/refused evidence or failed request/result | Restrained concerned pose with textual reason |
| Succeeded | Real parcel terminal success observed | Small downward head pose |
| Reduced motion | Browser preference | Transform animation and audio mouth modulation disabled |

Scheduling and handoff have dedicated restrained poses; the tour directs the head and arm toward the highlighted area. Security refusals use a labelled blocked state. These are presentation mappings, not proof that an operation occurred. Prolonged-inactivity sleep and independently voiced autonomous Crew agents are not claimed. The avatar is original vector artwork, not an actor likeness.

## Verification boundary

`npm run check` covers type checking and the repository regression gates. `scripts/check-poe-browser.mjs` performs explicitly scoped headless development checks against a real isolated runtime. Its microphone/autoplay denial cases use synthetic fault injection and are labelled accordingly. They do not qualify physical microphone input, Windows speaker output or audiovisual barge-in. A separate real OmniVoice component check validates generated audio and hashes without claiming physical playback. Genuine Windows browser evidence must be recorded separately.

## Versioned knowledge and reasoning

Morrow uses the provider-neutral response port and configured `poe.status` / `poe.reasoning` roles. The qualification preference is the owner-selected Codex route; no fallback provider is selected. Live route eligibility is shown in the conversation. Every model answer retains its actual route and available usage. Missing cost or context telemetry remains unavailable.

`config/poe-knowledge-sources.json` is the approved documentation index. Retrieval records the exact Git revision, dirty state, configuration and source hashes, and live snapshot hashes. Sources outside the repository, oversized files and sensitive material are excluded. Retrieved text is untrusted reference data, never an executable operation or approval. Source priority is live records before versioned documentation; a documented capability alone does not establish current readiness. The source viewer requires dashboard authentication.

## Compact greeting, voice and reconciliation

The collapsed full-body character sits near the upper right, with keyboard and pointer repositioning. Clicking opens a 440-pixel conversation panel capped at 70% viewport height; a deliberate Expand control is separate. On narrow screens the duplicate launcher is hidden while the panel is open, preserving access to audio controls. Authenticated sessions receive an idempotent written greeting; browser audio requires an explicit unlock. New conversations greet again. `config/poe-voice-v2.json` defines an original designed male British voice using OmniVoice-supported instruction tokens. Point the private worker's `--voice-config` and each channel's configured voice identity at this same versioned identity. The browser and social adapter accept the same VoiceIdentity contract; this code does not change an already-running WhatsApp worker or deploy its configuration.

Speech generation and independent transcription finish before playback. CPU generation can be substantially slower than real time. Content validation does not establish perceived gender, intelligibility through physical speakers, microphone quality or barge-in timing; those require real audiovisual qualification.

Owned submitted parcels are reconciled as a requested set. A final summary requires terminal parent records, no active children and no pending verification criteria. Completion does not imply publication. Real sealed stage batons expose source, destination, digest and observed receipt. Relay and Verity labels are presentation roles; they do not claim separate autonomous model invocations. Handoff presentation has deterministic integration coverage; it must not be described as observed audiovisual behaviour unless an actual handoff occurs.

The registered harmless System observation 1.1.0 job reads worker status and then runs a separate deterministic artifact verifier. This verifies artifact integrity and structure, not remote device or social-session readiness. Remote Facebook registries remain read-only discovery here; this adapter cannot submit their collection or publication jobs.

### Provider-free first governed job

After the README first-run discovery, open the authenticated **Morrow** view and
enter `Start operator-system-observation@1.1.0`. Morrow creates a sealed proposal
but does not execute it. Expand **Jobs, schedules, approvals & evidence**, verify
the exact Job identity, `{}` inputs and displayed SHA-256, then choose **Approve this job**.
Follow the resulting Work Parcel in
**Runtime Map → Process Map**. Its two real stages are `observe → verify`, and a
passing first-run result is `SUCCEEDED` with independent artifact verification.
The eligible worker is built into the controller and is restricted to
`agent-control.operator-observation.read`; it does not grant model, shell or
remote-node execution authority to an otherwise empty installation.

## Spoken guided tour and full regression

**Introduce Morrow and show me Agent Control** opens a fifteen-feature tour of genuine dashboard views. Morrow explains the highlighted feature through the configured male voice; each step waits for actual playback completion. Failed or interrupted narration pauses with an explicit retry. The long written greeting appears immediately, speaks after audio unlock, and is not repeated by telemetry refreshes.

**Narrate test progress** reads only the configured owner-started full regression runner. Counts, phase, elapsed time and exact tested commit come from its emitted evidence. Unknown remaining totals are not guessed. Narration describes the supplied snapshot as a past observation; it never converts the external test runner into a Work Parcel. See the current [4.3 deployment runbook](DEPLOYMENT.md); the [4.1 qualification](provenance/EXTERNAL-EVIDENCE.md) remains historical evidence for that release.

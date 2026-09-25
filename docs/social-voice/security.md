# Social & Voice threat review

| Threat | Enforced boundary | Residual limitation / qualification |
|---|---|---|
| Unauthorized sender | Authenticated gateway signature, direct identity, explicit enrolment and template grant | Deterministic fixtures; existing real enrolment remains preserved |
| Stolen social session | Session possession does not grant a new sender authority; approvals have a separate grant | A compromised authenticated gateway can forge its own transport assertions. Revoke session/secrets and operator grants; this trusted edge cannot cryptographically attest a human handset |
| Replay / duplicate | Transport timestamp plus durable message key; stable parcel/run request keys | Beyond the freshness window rejected; uncertain outbound delivery needs human reconciliation |
| Spoofed approval | Enrolled identity, channel/account/conversation, owned parcel, waiting runtime action, snapshot, expiry and one-shot claim | Crash after claim is uncertain, not automatically replayed |
| Text prompt injection | Exact command grammar and immutable approved parameters | Unrecognized natural language has no execution authority |
| Audio/transcription injection | Transcript is untrusted; only narrow read-only intents accepted directly | Consequential and ambiguous requests need a new independently authorized text command |
| Malicious attachment | Fixed private media endpoint, byte limit, signature/container checks, fixed ffmpeg argv, duration cap, no network protocols | Decoder itself is a third-party attack surface; isolated resource-limited process and dependency maintenance are required |
| Voice impersonation | Voice never identifies or authorizes the sender; clone provenance required | No biometric authentication or speaker-similarity assurance |
| Incorrect transcription | Confidence unavailable; no guessed action; text confirmation | Collingham vocabulary round trip has observed errors |
| Command ambiguity | Unsupported input denied with clear supported examples | Broad task interpretation and pause/resume are not implemented |
| Social provider compromise | No user URLs or arbitrary shell; downstream grants and immutable templates | Compromised signing edge remains within the trust boundary; physical sender assurance cannot survive it |
| TTS provider compromise | Fixed authenticated loopback service, approved voice identity, bounded audio/metrics | Audio contents cannot be semantically verified by a WAV signature; text remains authoritative |
| Sensitive speech | Bounded operational summary, URLs and parcel ID lines excluded; no secret-bearing prompts | Task names and results can still be sensitive. Do not configure confidential templates on a social channel |
| Group/forwarded messages | Rejected before media retrieval or intent processing | Only direct enrolled conversations are supported |
| Observer data leakage | Transcript authenticated; generic event stream includes event type only | Private evidence and SQLite history contain conversation content and need access control/retention |
| Provider outage | Independent runtime scheduler and durable text/outbox | A send interrupted after remote acceptance may remain uncertain; no exactly-once network-delivery claim |

The security model prevents the messaging channel from becoming a shell or approval bypass. It does not turn a compromised gateway, speech engine, or enrolled operator device into a trusted source. Production exposure and adversarial decoder sandbox qualification are outside this private pilot.

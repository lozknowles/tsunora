# Agent Control 4.7 known limitations

4.7 qualifies the core release and recorded desktop/mobile browser journeys. The optional voice adapter is implemented and contract-tested, but **the complete physical voice showcase remains unqualified**. Publication does not qualify a device, provider account or model route that has no corresponding evidence.

| Capability | Status | Evidence boundary and closure |
| --- | --- | --- |
| Exact live voice provider | BLOCKED_EXTERNAL | No authorised OpenAI credential reference was present in the checked controller environments. Requires actual bounded session/audio/final-usage qualification using an existing authorised account. |
| Physical Pixel conversational audio | BLOCKED_EXTERNAL | Existing Termux SSH was reachable; the browser/ADB route was unavailable. Microphone, speaker, Bluetooth, network handoff and lock-screen behavior need physical testing. |
| Local recorded speech latency | KNOWN_LIMITATION | The real CPU route took 52.33 s to generate 2.62 s of audio. It is not advertised as natural real-time conversation. Use text; qualify a faster existing route before making that claim. |
| Spoken model/baton/cache showcase | FUTURE_WORK | Local synthetic voice completed a real deterministic observation, not a non-trivial model job or spoken completion. Requires real governance, meaningful baton/cache evidence and audio completion. |
| Voice cost allocation | PARTIAL_SUPPORT | Provider session duration and calculated voice cost are separate from model usage. Shared-session allocation and combined totals stay unknown where not defensible. |
| Custom spoken job parameters | PARTIAL_SUPPORT | Registered defaults use sealed proposals; custom inputs retain their existing job form. No arbitrary spoken parameter planner is advertised. |
| Safari/iOS appearance and browser behavior | PLATFORM_LIMITATION | Not newly qualified; current browser evidence is Chromium desktop and touch viewport emulation. |
| Subscription-backed monetary cost | PARTIAL_SUPPORT | Monetary billing is unavailable when the route supplies no defensible cost; token usage remains visible. |
| Mobile browser scope | PLATFORM_LIMITATION | The new videos test 390 × 844 browser layout and controls. They do not replace physical handset qualification. |

All [accepted 4.6 limitations](known-limitations-4.6.md), including Android inference, benchmark promotion, one-principal ACP, paid billing and whole-node energy boundaries, remain applicable. Historical measurements remain bound to their original source and target.

Voice sessions end on backgrounding or loss of connectivity and require an explicit reconnect. This is deliberate bounded behavior; seamless Wi-Fi/mobile-data transitions and background listening are not advertised. Text remains available. No account, key or spending-limit change is necessary for core operation.

## Observability follow-on boundaries

The Node Dashboard and Run Inspector in the follow-on branch use exact recorded node identity. Unknown or unplaced work is not assigned to a machine. Current whole-node samples do not establish per-job CPU/GPU attribution or renew discovery qualification. GPU adapters without a supported observed capability retain unavailable live readings. Provider context occupancy, generation-only throughput, cache savings and monetary cost remain unavailable without the required evidence. The initial physical resource qualification is on the existing Linux controller; desktop/mobile browser layouts do not qualify Windows or Android hardware telemetry. See [observability guide](observability-4.7.md). Existing live voice and physical handset limitations remain in force.

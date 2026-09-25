# Agent Control 4.7 — Usability & Integration

Agent Control 4.7 follows 4.6.1 with clearer desktop/mobile execution views, readable usage and history, and an optional replaceable Mallow voice interface. **Qualified release scope: core operation and the recorded desktop/mobile browser journeys. Experimental live voice remains unqualified on the physical handset and provider account.** The full spoken-voice showcase is not claimed.

## What changed

- Process Map uses readable execution cards, explicit numbered connections, stable selection, token counters and wrapped inspector details.
- Active session drill-down shows a pulsing running lozenge and an independently ticking elapsed timer. Reduced-motion preferences are respected; terminal timers freeze, and stale status is identified.
- Saved job forms survive refresh; direct repository review retains per-call input/output and reconciled input, cached input and output usage in readable history.
- Usage can be inspected by invocation, aggregate, cache/retries and time trend. Missing cost or token data remains unknown.
- Mallow retains the Crew and floating companion, adds tap-to-talk and a visible pending-job review control, and preserves text operation after denied microphone access.
- A generic voice transport port and optional exact GPT-Live adapter keep provider audio/session handling separate from Agent Control governance, routing, batons and execution. Voice-origin proposals require normal explicit approval.

## Qualification and evidence

The exact release archive, complete test result, installation/upgrade evidence and protected approval are bound by the existing schema-v2 release gate. See [verification](release-verification-4.7.0.md). The [two paused recordings](provenance/EXTERNAL-EVIDENCE.md) rerun the real dashboard journey on 4.7, using synthetic task content and an existing subscription-included worker. Every Usage view remains visible for at least two seconds. The mobile recording is a browser viewport qualification, not physical Pixel evidence.

Video binaries are kept in the separate qualification-evidence repository so normal source pulls stay small. The main page links to evidence without embedding the recordings. Original 4.6.1 recordings and earlier blocked candidate records remain unchanged.

## Upgrade and compatibility

Follow [Upgrade from 4.6.1](upgrade-4.7.md). Core configuration/state remains compatible. Voice is optional; absence of GPT-Live credentials does not prevent text, existing jobs, usage or the dashboard. Existing configured speech remains available, but measured CPU synthesis latency is unsuitable for claiming natural real-time conversation.

## Known limitations

The live provider/account route and physical Pixel microphone/playback, Bluetooth and network transitions remain unqualified. The recorded local voice observation used synthetic microphone input and did not establish spoken completion. No non-trivial spoken model/baton/cache demonstration is claimed. Voice and model costs remain separate, and a combined per-job total is unavailable when allocation or actual model cost is unknown. The existing Android inference, benchmark promotion, billing and whole-node energy limits remain in force. See [4.7 known limitations](known-limitations-4.7.md).

The operator authorised publication of this scoped update after the initial candidate assessment. That authorisation changes publication scope; it does not convert missing physical evidence into a pass. Estate deployment is a separate operation.

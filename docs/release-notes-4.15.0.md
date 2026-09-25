# Agent Control v4.15.0 candidate

This candidate adds optional Shared Speech through the qualified external SDK,
keeps voice answers on the governed conversation path, and adds microphone feedback,
local-time greetings, continuous queued playback and cancellation fencing.
Operational model prose is checked before returning an answer; flagged claims are
rendered from typed, timestamped evidence, with historical scope retained. This is
a bounded English guard, not a general proof of natural-language entailment.

Speech playback uses continuous buffering to reduce inter-chunk gaps. Perceptual
smoothness under normal unconstrained GPU conditions is deferred for post-release
qualification; GPU-contention smoothness is an unqualified known limitation and
is not a release blocker. No gapless or real-time performance claim is made.
Acoustic barge-in is unavailable; push-to-talk and Stop are supported. No voice
fallback occurs unless explicitly configured. Text remains available on voice failure.

Queued speech checks the authenticated server incarnation every second. A changed
identity or unavailable check stops playback; detection is bounded by the polling
interval plus the 1.5-second request deadline, not instantaneous distributed cancellation.

All existing release limitations continue to apply. Exact commit, frozen corpus,
regression, physical function and privacy results belong to the qualification receipt.
This file alone is not release qualification or publication authority.

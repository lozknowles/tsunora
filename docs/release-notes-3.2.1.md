# Agent Control 3.2.1

Agent Control 3.2.1 is a focused reliability release that independently reproduces and repairs the accepted findings from the governed Ox/GLM audit of 3.2.0.

The release closes the Work Queue verification dead end, preserves meaningful lane and worker state, removes waiting-run write amplification, makes Persistent Teammate jobs stable across restart, contains scheduler/monitor failures, and improves dashboard parameter handling and long-running execution visibility. Provider/model neutrality, normal verification and escalation, and THIN/STANDARD/DEEP routing remain unchanged.

See `docs/reports/AGENT-CONTROL-3.2.1-AUDIT-REMEDIATION.md` for classifications, reproductions, fixes and verification evidence.

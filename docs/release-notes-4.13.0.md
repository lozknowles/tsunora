# Agent Control 4.13.0 — Governed Estate and Historical Diagnostics

This candidate adds evidence-backed estate discovery and Factory observation to the 4.12.1 baseline. Discovery, diagnostics, replay and video remain observers of the native execution/control path and grant no general execution authority.

## Included

- Opt-in Factory view over native Jobs, workers, events and retained evidence, with bounded replay and the shared video recorder.
- Permission-scoped local inventory and identity-pinned Linux, Windows and Android SSH metadata discovery. The host list follows observations; configured or stale records are not counted as fresh responses.
- Precision Topology Estate and Factory views, host hardware inspectors, explicit live/paused/replay states and deterministic Mallow summaries. Mallow does not infer execution facts or health from animation.
- Controller-local, explicitly permitted system/kernel and supported application log adapters, sanitisation, bounded sampling, linked evidence and immutable diagnostic reports.
- Context-aware diagnostic classification: event outcomes are separate from quoted command options, source severity, historical occurrence, confidence and incident status. Historical failures remain visible; current incident status is unknown unless exact operation-linked recovery evidence exists.
- Selected-source event budget reservation. Partial collections are labelled PARTIAL even when the native assessment Job completed successfully.

## Release configuration

Diagnostics are included and permission-gated. The default log scope is NONE; no automatic scan, alert, external model analysis or remediation is enabled. No model is selected by default. Current estate health is never inferred from historical diagnostic errors. Legacy assessment files remain unchanged and are displayed as historical evidence.

The versioned classification evaluation uses 349 saved sanitised event groups, with related workload cohorts kept together: 302 development and 47 held-out groups. Held-out reference labels include seven failures, 39 informational events and one uncertain case. Labels were AI-reviewed and frozen before implementation; no human or independently blind review is claimed. The held-out result is 0 false positives / 0 false negatives against these labels, with one abstention and no unsupported active-incident claim. This small, correlated sample does not establish universal reliability. See the evaluation receipt and [qualification boundaries](release-verification-4.13.0.md).

## Measured limitations

- Android SSH installation identity is not physical device identity and cannot satisfy the stronger identity envelope. Its state remains limited/degraded.
- Remote discovery covers bounded host/CPU/memory and optional GPU metadata. Remote logs, service topology, broad network discovery and general execution are not included.
- Controller log samples are bounded, may be truncated or inaccessible, and do not prove current health. Mirrored source records are not independent witnesses.
- A completed successful retry resolves only a linked operation, not an entire host or service. Missing recovery evidence remains unknown.
- Sanitisation is heuristic. Operational exports and videos need private review; they are excluded from the distributable source package.
- No real failure/recovery pair with sufficiently strong operation identity existed in the saved evaluation sample. Synthetic boundary tests cover that behaviour separately.
- Optional container/proxy/model-source adapters and model-assisted analysis are not all newly physically qualified. No stronger readiness claim follows from this release.
- No host power-off disruption, twenty-host physical experiment, voice model qualification or new visual concept is required or claimed.

This preparation pass performs no merge, tag, publication or deployment. Publishing the approved source package would not upgrade running installations automatically.

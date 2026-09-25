# Agent Control 3.3.0

Agent Control 3.3 adds natural-language Work Parcels, safer runtime execution, governed browser capabilities, and canonical live invocation observability without changing JobRuntime authority, verification, or THIN/STANDARD/DEEP routing boundaries.

## Dashboard reliability

Parameter drafts now survive periodic background refresh. Untouched controls continue to follow current server defaults, while successful submission and explicit reset clear local dirty state.

## Live invocation observability

Job details expose canonical invocation ID, Job, Run, step, lane, phase, provider, model, start time, elapsed state, usage state, outcome, and verification where available. Non-streaming provider calls create a RUNNING record before Agent Control awaits completion, and one Job can retain several independently attributed invocations.

## Usage and cost integrity

Completed provider metadata is reconciled onto the same invocation record. Usage and cost explicitly distinguish provider-reported, Agent Control estimated, and unknown values. Missing provider data remains unknown and is never displayed as zero.

## Telemetry architecture

Operator review now uses the runtime's authoritative shared invocation ledger rather than an isolated dispatcher path. The dashboard consumes compact structured telemetry and does not reconstruct accounting from large response artifacts.

## Infrastructure neutrality

The release gate found a private controller-host identifier in browser documentation, the same host identity in a production qualification script, and a private Android node identity in that script. They were replaced with capability-role identifiers. A machine-specific operator context-file default was also removed, and the existing distributable-text scanner now covers YAML without adding production exceptions.

## Runtime safety

Job timeouts terminate owned process groups and release resources safely. Maintenance revalidates protected workloads immediately before mutation, scheduler dispatch is bounded, and Android recovery no longer blocks unrelated work.

# Benchmark preflight consistency and cleanup certainty

Base: 8c9434757b23ab7a08bd9d9c12f3be7b689d6a84. Isolated reliability correction; no release or operational deployment.

## Findings

The generic target admission floor and launch floor were intentionally different configuration fields. The second floor was checked after authorised service reclamation. It was a declared adapter configuration requirement, not a formula derived from model weights, runtime overhead or context metadata. That let a generic admission PASS reach a launch refusal using a requirement already known to the controller.

The collector awaited each invocation and committed its response/verdict/attempt before the next fixture. There was no concurrent pipeline. Its stop condition covered BLOCKED only, so FAILED could advance. Stopping on every non-SUCCEEDED terminal result fixes the policy defect without sleeps or changes to prompts/scoring. Actual signal cancellation and deadline errors still propagate after bounded restoration.

On cancellation the runtime's bounded wait for action settlement could expire before target recovery completed. Late action output was retained, but did not update cleanup uncertainty. The benchmark catch path also failed to discharge its retained cleanup obligation after successful recovery.

## Changes

`benchmarkResourceRequirement` resolves one floor from existing configuration: max(target minimum, declared launch minimum). Validation still disallows a launch floor below generic policy. `assessBenchmarkAdmission` separately records target and workload decisions; dispatcher admission passes only when both pass. Launch receives the same resolved floor and retains its own live defence-in-depth check. No speculative credit is given for idle-service memory. This is conservative and may refuse a workload that could fit after reclamation; a future governed staged-reclamation policy would need independent qualification.

The serial collector commits the terminal result before stopping on failure, refusal or cancellation. Quality failures on successful inference remain valid completed attempts and do not trigger this execution-failure stop.

Runtime cleanup callbacks now retain an identity/contract-bound acknowledgement before discharging an obligation. Benchmark recovery invokes that callback only after restoration evidence is persisted. Lost evidence cannot acknowledge cleanup.

Late cancellation reconciliation requires: action settled; explicitly acknowledged retained cleanup; no remaining retained cleanup; no owned request outstanding; owned-process termination confirmed; same current attempt; unchanged finalised contract authority; no human takeover; and the precise action-completion-unacknowledged cancellation state. It appends a cleanup-resolution artifact/event and leaves execution CANCELLED. The original StepAttempt uncertainty record remains unchanged. Missing acknowledgements, failed cleanup, stale authority and timeout uncertainty remain fail-closed. No arbitrary extra wait grants success.

The resume cursor adds a read-only inspection mode. It can enumerate valid completed and outstanding slots while listing unresolved failed/cancelled attempts, but cannot grant replay. Operational resume keeps its strict ambiguity rejection. Recovered cancelled output is never scored or promoted.

## Existing Smol evidence assessment

Run: run-7e5b1586-c1b0-4999-a43d-4928b32426e1.
24 valid completed; three outstanding; two unresolved failure/cancellation records. Existing artifacts and results are unchanged. The actual configured workload floor is 4,639,358,336 bytes; the generic floor remains 1,073,741,824 bytes. Neither was lowered.

The retained restoration report does not provide the new identity-bound acknowledgements for all retained obligations. Existing run cleanup remains CLEANUP_UNCERTAIN. No acknowledgement is manufactured and no recovery output becomes a benchmark result. Clearing this old state requires a supported Agent Control recovery operation that positively verifies each retained target attempt's process termination/restoration and the controller action's settlement, then appends bound reconciliation evidence. A fresh service-health observation alone is insufficient.

Non-inference assessment loads the real run, registered configuration and checksum-verified artifacts through product reconciliation/resource functions. It resolves model, target, suite, 24 completions and three outstanding slots; reassessment of retained Agent Control telemetry refuses before dispatch. This is explicitly historical observation reassessment, not fresh physical telemetry. No fresh target operation or physical resume is attempted because the cleanup prerequisite remains unsatisfied. The existing controller/source is not replaced during this parcel.

## Recipe boundary

Reusable executable workflows require workload-aware admission, authoritative step completion, checkpoint/resume, idempotency, deterministic recovery and positively evidenced cleanup. No recipe implementation is included.

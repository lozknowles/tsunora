# Android/Termux reset and recovery

Base: b32a5b49a213ae1da8dff1784d33f0a323bee0ed. Prior blocked assessments remain authoritative.

Existing reboot primitives: provisioning uses default adb and SSH-ready only; managed-node reboot uses systemctl. Neither is used for this operation. Existing RuntimeTarget supplies configured ADB executable/server/port/serial/expected serial, SSH host-key-verified transport and expected original service. The new capability is generic target reset/recovery, not a benchmark action.

Authority: authenticated operator must explicitly approve a reset, supply a reason, idempotency key and bounded expiry. Journal identity binds target/environment/configuration and optional existing-run association. No automatic reboot retry. Concurrent reset/work is rejected. Durable pending/failed state blocks workload use until separately reconciled.

Boot identity: Linux kernel /proc/sys/kernel/random/boot_id read independently through configured ADB and SSH must match before reset and on return. ADB getprop ro.serialno must match configured expectedSerial. No wall-clock substitution. Android whole-device reboot is the supported enforceable reset; app/controller/SSH restart is insufficient. All preboot userspace processes cease. Disk evidence/configuration persists; all phone services temporarily unavailable. SSH/Termux must return naturally through existing startup arrangements; no provisioning changes.

Reconnect: bounded probes observe disappearance then return, same physical identity and different boot UUID. No disappearance, unchanged boot, identity mismatch, missing Termux or deadline => failure, no legacy lock release. Operator unlock may be required; failure remains explicit.

Restoration: reuse the configured original service definition and existing helper's exact argv/health logic in a standalone no-inference recovery operation. Healthy matching service is not restarted. Missing service is started with configured argv/cwd/environment only after boot binding. Ambiguous service or failed health blocks completion.

Evidence: private append-only operation events, operation/config digest, operator authority, pre/post boot IDs, disappearance, restoration observations and final receipt. Idempotency returns historical receipt marked replayed, never asserts another fresh reboot. Target boot generation fences old action contexts; failed operation remains quarantined. After generic physical qualification, a separately invoked recovery boundary association may release exact existing-run retained locks, retaining original attempts and historical uncertainty. No benchmark resume/admission/inference.

## Operator interface

Authenticated POST /api/targets/:target/reset-recovery requires approveReset=true, reason, requestKey, expiresAt (up to one hour) and optional existing runId. GET at the same URL reads the journal projection without target work. Successful reset is independent of benchmark execution. Target-local bindings are registered through registerTargetRecovery; the current installation reuses its existing RuntimeTarget configuration without altering benchmark configuration.

Only after reset COMPLETE, POST /api/runs/:run/apply-target-boundary with target, operationId and exact attemptIds performs fresh non-inference verification and associates the proven boundary. It retains old StepAttempt cleanup and results; the current run is FAILED/CANCELLED, never success. Recovery evidence allows later cursor reconciliation of failed/cancelled fixtures inside the covered execution window without promoting their outputs or changing the frozen suite. Fresh resume authority remains mandatory.

Failure is quarantined; neither a timeout nor a repeated receipt means current reset success. Repeat request keys return historical receipts marked replayed. A failed reset is not automatically retried. No automatic provisioning, rooting, network exposure, ADB-route rewriting, or phone-unlock bypass is introduced. If existing startup routes do not return, stop with locks retained.

Authority references: [AOSP ADB man page](https://android.googlesource.com/platform/packages/modules/adb/+/HEAD/docs/user/adb.1.md) documents configured -H/-P/-s and normal reboot. Boot UUID is read from the Linux kernel random boot_id interface; it is compared across the reset and cross-checked over both transports.

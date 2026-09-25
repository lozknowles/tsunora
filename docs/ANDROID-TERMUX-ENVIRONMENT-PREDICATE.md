# Android/Termux pre-reset environment verification

Baseline: eadebd4a202ab8377bd6227c16da7b624be99fce. Original failed operation target-reset-6722043e-436d-48fa-bd6a-5a13eaeac7ee remains immutable.

## Actual original predicate

`platform.system() == 'Linux' and '/com.termux/' in str(Path.home()) and Path('/system/bin/getprop').exists()`.

This was independent of ADB serial matching, ADB/SSH boot UUID matching and protected-service identity/health. The opaque result prevented distinguishing failed requirements from unavailable observations.

## Proven defect and correction

The first Agent Control-owned read-only diagnostic reproduced FAIL: execution_platform observed Android; every other check passed. This explains the reproducible original predicate failure, without inventing retrospective component evidence for the original receipt.

Python documents Android as the user-facing result of platform.system(): https://docs.python.org/3/library/platform.html#platform.system . The corrected Android adapter accepts Android or legacy Linux naming while still requiring independent Android property-utility and Termux environment evidence. Windows and arbitrary other systems remain rejected. No systemctl requirement is introduced.

## Requirements and categories

| Component | Category | Purpose / expectation |
|---|---|---|
| adb_route | B installation configuration | Configured executable/server/port/serial responds; not default ADB routing |
| physical_target_identity | A physical identity | Returned serial matches configured expected serial; evidence stores digest |
| android_boot_identity | C Android/kernel capability | Readable boot UUID |
| agent_control_execution_path | B installation configuration | Configured host-key-verified SSH/local helper route responds |
| execution_platform | C generic Android compatibility | Android or legacy Linux name |
| termux_home | D generic Termux identity | Termux package namespace in HOME; no installation-specific absolute HOME |
| android_getprop | C generic Android capability | Android OS property utility present; OS path, not private target configuration |
| boot_identity_binding | A physical/execution binding | ADB and worker route see the same boot |
| protected_service_identity | B installation configuration | Exact configured original service argv |
| protected_service_health | B installation configuration | Configured service health-only request succeeds |
| protected_resource_state | B installation configuration | Configured service identity and health both satisfied |

All listed checks are mandatory for this configured Android/Termux recovery adapter. No benchmark model, workload memory, suite, scoring, battery/admission threshold or optional feature is consulted. Service health cannot substitute for environment or physical identity. Android/Termux detection is adapter-specific, not a requirement of generic TargetReset.

## Three-state evidence

Each component records identity, expected value/capability, observed value, PASS/FAIL/UNKNOWN, reason, timestamp and mandatory flag. Exceptions retain UNKNOWN; FileNotFoundError for the expected Android utility means positively absent/FAIL. PermissionError is UNKNOWN. ADB/helper failures do not become false absence. Raw error bodies, credentials and command environment are not emitted.

Aggregate: any mandatory FAIL gives FAIL; otherwise any mandatory UNKNOWN (or no mandatory observations) gives UNKNOWN; only all mandatory PASS gives PASS. Optional failures do not block. Python component timestamps are target clock; adapter and receipt timestamps are controller clock. Clock skew is not silently normalized.

## Operator interfaces

Authenticated POST /api/targets/:target/environment-diagnostic invokes the production port and persists a diagnostic receipt. Authentication uses existing web authorization. It does not reset target generations, reboot, restore services, release locks or dispatch a job.

Local operator equivalent:

```sh
node --import tsx scripts/diagnose-target-environment.ts /private/target.json target-id /private/evidence operator-name
```

The file can contain RuntimeTarget directly or the existing installation configuration's `target` member. It reuses validateRuntimeTarget, androidRecoveryPort and TargetReset.diagnose. Local OS/file authorization applies; the operator name is attribution, not an authentication credential. No private target configuration is copied into source. Evidence directory must be private. No controller restart or deployment is needed for this local diagnostic interface.

The diagnostic records only read-only observations and controller-side evidence. It never calls the port reboot/restore methods, benchmark admission, model inference or fixture execution. The target helper is the existing production helper dispatched as recovery-observe.

## Boundaries

A passing diagnostic is not a reset receipt, does not clear quarantine and cannot release legacy ownership. Original expired reset authority must not be renewed implicitly. Physical reset and current recovery boundary remain unqualified until valid explicit authority and supported reset recovery succeed. Historical termination remains UNPROVEN; historical cleanup remains CLEANUP_UNCERTAIN.

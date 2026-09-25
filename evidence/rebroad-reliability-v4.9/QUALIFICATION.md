# Agent Control 4.9 Rebroad reliability qualification

Verdict: **PASS_WITH_LIMITATIONS**

This receipt qualifies implementation commit `7608ac62889dc3ffc46ce658d3d574155ac6fa37` against public `v4.9.0` / `fe9a879e4360d3249c44ee21f0279761a182bd0d`. It authorises no merge, tag, release, deployment or service change.

## Start state

- canonical checkout: left untouched on its pre-existing unrelated branch and work
- isolated branch: `feature/4.9-rebroad-reliability-20260919`
- public base and merge base: `fe9a879e4360d3249c44ee21f0279761a182bd0d`
- prior PR 24: already merged before this parcel; this follow-up requires a separate PR

## Qualification result

- full suite: **1,837 passed, 0 failed, 0 skipped** in 227,614 ms
- TypeScript: PASS
- source distribution: PASS, 0 violations
- bootstrap syntax: PASS
- dashboard syntax: PASS
- infrastructure neutrality: PASS
- implementation status: PASS, 63 entries
- fresh locked-dependency installation: PASS
- upgrade from public `v4.9.0`: PASS
- representative configuration preserved byte-for-byte: PASS
- representative history preserved byte-for-byte: PASS

Platform: Linux 6.8.0-139-generic x86_64, Node v24.21.0, npm 11.19.0.

## Physical inference proof

The already-running qualified local llama.cpp route returned exact output `AC_RAW_LOCAL_OK` through `RAW_INFERENCE`. The requalification recorded 546 input tokens, 536 cached input tokens, 6 output tokens, 552 total tokens, 2,157 ms latency, unavailable reasoning tokens, LOCAL execution and known-zero local API charge. No model or service was started, stopped, reconfigured or downloaded.

The first physical request exposed a receipt/ledger mismatch: the receipt said local/free while durable accounting said `UNKNOWN`. That original evidence remains preserved. The corrected implementation was requalified once; it was not repeatedly called to manufacture cache reuse.

No API inference call was made. Neither the isolated candidate nor the current controller configuration contained a configured API provider/model route. Credentials were not sought, imported or exposed, and no metered spend was incurred.

## Qualified changes

- explicit tool-free direct inference with qualified route resolution, no fallback, bounded output/time, cancellation, retained redacted evidence and authoritative usage accounting
- append-only activity repair that preserves the canonical inode for live append writers, with immutable backup, crash journal, lock, integrity verification and idempotence
- generic protected workspace metadata policy applied before mutation scope, with governance directories unavailable and named governance files read-only
- durable `CANCELLING` persistence before live abort dispatch
- provider reasoning-token normalization without converting unavailable values to zero

Rechecks also confirmed existing late credential replacement, descendant cleanup, malformed-tool classification, exact durable resume boundaries and Android identity/secret controls.

## Limitations

- Physical API-route comparison is `BLOCKED_EXTERNAL` because no authorised API provider/model route was configured.
- Writable workspace metadata enforcement is physically qualified on Linux; equivalent Windows and Android writable adapters remain unqualified.
- Agent Control still has no global provider-neutral monetary-budget service; monetary classification remains evidence/configuration driven.
- No Pixel mutation or physical Android operation occurred.

The implementation is suitable for review as an isolated follow-up candidate. Public state and operational services remain unchanged.

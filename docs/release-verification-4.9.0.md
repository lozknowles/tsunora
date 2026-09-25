# Agent Control 4.9.0 release verification

## Qualified source

- Starting public release: `v4.8.1` at `b440d2c01c9cee17057a779298a421676c637be5`
- Tested implementation: `4ef42eb709b95fa9c63028bd9348f9e5addc8bd5`
- Final qualification seal: `f3b5aeaab2146f32b88bf411bbb4d3cc5e486d5c`
- Release metadata is the only change after the qualification seal; final source and artifact hashes are recorded in the public release receipt.

## Mandatory gates

| Gate | Result |
|---|---|
| Source reconciliation | PASS |
| Native security-audit continuation | PASS — 104/104 records |
| Independent verification | PASS — FULL 104/104 |
| Linux sandbox assurance | PASS — 13/13 controls |
| Evidence integrity | PASS |
| Authenticated CLI/API/dashboard | PASS |
| Activity JSONL projection | PASS |
| Full test suite | PASS — 1,823 passed, 0 failed, 0 skipped |
| Distribution, type, bootstrap and dashboard syntax | PASS |
| Neutrality and implementation status | PASS |
| Clean installation | PASS |
| v4.8.0 upgrade | PASS |
| v4.8.1 upgrade | PASS |
| Archive inspection and checksums | PASS |

## Retained audit result

The original audit `audit-1d773fa5-5046-4f5a-b297-f2decf3a383a`, original run `run-59d69855-06b7-4c3e-8940-5997021ffed0`, and continuation run `run-54e2b0cf-a6e2-4564-9f1c-9af72eca3e71` remain distinct and append-only. Original STATIC_ONLY and EXECUTION_BLOCKED_BY_SANDBOX provenance was not rewritten.

Final classification: 0 confirmed, 90 needs validation and 77 rejected records. Coverage remains 12 partial units and 0 full units. These bounded limitations are reported rather than converted into findings or hidden.

## Security and operational boundary

The qualified sandbox is `linux-bubblewrap-systemd-v1`. It combines bubblewrap namespaces, a transient user systemd service, `prlimit`, Agent Control process ownership, redaction, evidence retention and cleanup. It passed network, environment, credential-path, filesystem, process, timeout, memory, CPU, process-count, traversal and cleanup controls.

No credential, protected-service modification, production deployment, model/provider spend or public service exposure is part of this release.

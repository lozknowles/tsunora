# Agent Control v4.9 security-audit integration decision

Date: 2026-09-17

## Source state

- Current public Agent Control baseline: `v4.8.1`, commit `b440d2c01c9cee17057a779298a421676c637be5`.
- Required compatibility baseline: public `v4.8.0`, commit `57c593b4f88965acc54239f6c1a5321329ce6cef`.
- Isolated branch: `feature/security-audit-v4.9-20260917`.
- Cloudflare reference: `cloudflare/security-audit-skill` commit `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8` (2026-09-14).
- Upstream licence: MIT, Copyright (c) 2025-2026 Cloudflare, Inc.

The implementation starts from current public main so v4.8.1 is retained. The v4.8.0 commit remains the required clean-install/upgrade fixture named in the brief.

## Reuse decision

| Upstream element | Decision | Agent Control integration |
|---|---|---|
| Six-phase audit lifecycle | Adapt with attribution | Typed Agent Control audit phases and append-only transitions |
| Architecture and trust-boundary reconnaissance | Adapt | Coverage units derived from an authorised repository snapshot |
| Coverage-led hunting and critics | Adapt | Bounded Agent Control Jobs over ledger units |
| Fresh adversarial verification | Adapt and strengthen | Separate invocation identity, context lineage, and recorded independence grade |
| Three finding verdicts | Use unchanged vocabulary | `confirmed`, `needs_validation`, and `rejected` schema union |
| Coverage-ledger and finding schemas | Reimplement | Agent Control-native schemas and validators, preserving the methodological constraints |
| Attack-class prompts | Adapt as neutral categories | Category identifiers and bounded objectives, never executable repository instructions |
| JavaScript validators | Reimplement | TypeScript validation in the production runtime and CLI/API paths |
| Reporting layout | Adapt | Reports rendered only from validated structured records and authoritative evidence |
| Skill orchestration/runtime | Do not import | Agent Control remains the sole job, worker, policy, evidence, and phase-transition authority |

No upstream source code or prompt file is copied into the production runtime. The methodology and public terminology are adapted with the attribution in `docs/third-party/cloudflare-security-audit-skill.md`.

## Existing Agent Control capability to reuse

- Job Catalog, Job Runtime, worker registry, resource locks, approvals, cancellation, retry, cleanup, and append-only run ledger.
- Work Parcel planning, deterministic routing, model/provider invocation records, token telemetry, and batons.
- Repository identity and bounded filesystem abstractions.
- Owned-process execution, timeouts, output bounds, retained evidence, Markdown/JSON report exports, Run Inspector, and Navigable Workspaces.
- Protected-resource policy and explicit effects; navigation never grants execution authority.
- Existing repository-review definitions and prior security evidence remain immutable historical records.

## Required new capability

The smallest coherent addition is a generic security-audit domain model and store layered over existing run/evidence primitives:

1. versioned coverage-ledger and findings validators;
2. append-only audit run/phase/unit/candidate/verification records;
3. finder/verifier separation and independence metadata;
4. sandbox-admission classification with static-only fallback;
5. source-aware carry-forward and stale-evidence rejection;
6. deterministic report generation from validated records;
7. native Job registration plus authenticated CLI/API/dashboard projections.

The audit implementation must not create another scheduler, evidence store, repository executor, model router, or approval system.

## Execution and sandbox boundary

Repository text is always untrusted data. Static reads may proceed within the authorised repository root. Target-controlled builds, tests, processes, browsers, emulators, fuzzers, and fixtures require recorded proof of network denial, environment allowlisting, resource/time limits, scratch-only writes, process ownership, captured exit evidence, and cleanup. If any required control is unproved, Agent Control records `EXECUTION_BLOCKED_BY_SANDBOX`, retains the candidate as `needs_validation`, and continues safe static analysis.

## Historical evidence boundary

The earlier GLM-5.3 review and its accepted review packets remain historical evidence. They may be compared by identity and source revision, but they are not imported as v4.9-native findings, current coverage, fresh verification, or sandbox proof. Existing security evidence is never edited or relabelled.

## Decision

**ADAPT WITH ATTRIBUTION.** Implement a provider-, model-, platform-, runtime-, and transport-neutral Agent Control workload. Do not install the upstream skill as a runtime dependency and do not create an external harness that performs work attributed to Agent Control.

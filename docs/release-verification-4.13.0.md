# Agent Control 4.13.0 qualification boundaries

Baseline: public v4.12.1, commit cb7bd58030c1ba3fe6f38d075607342837ab7f25. Candidate: release/4.13.0-rc-20260922. The exact final commit, archive hashes and all completed gate results are sealed in the external release-candidate receipt. This document is the scope and acceptance contract, not a substitute for that receipt.

| Capability | Release scope | Qualification / limitation |
| --- | --- | --- |
| Native Estate discovery | Included, explicit selected scope | Fresh approved Linux/Windows/Android metadata and pinned identities; unavailable observations remain explicit |
| Android identity | Installation identity only | Degraded/partial; cannot be promoted to physical identity |
| Factory/Precision views | Included | Native projections, bounded geometry, truthful replay, deterministic Mallow; not an execution authority |
| Diagnostics | Included, default permission NONE | Controller-local bounded collection; PARTIAL is distinct from completed Job status |
| Classification | Context version 2.0.0 | 349 AI-reviewed groups, cohort split, frozen labels; no independent human review |
| Incident status | Conservative | Historical observations; current UNKNOWN unless operation-linked recovery supports RESOLVED |
| Evidence/video | Included | Shared recorder, digests, append-only audit and explicit replay; no independent external signature |
| Remote logs / broader application adapters | Limited | Remote logs not implemented; not every controller adapter newly physically qualified |
| Model analysis | Optional, no model by default | Existing governed route; no new physical inference claim |
| Upgrade/rollback | Existing schema and backup procedure | Exact-package Linux install and v4.12.1 upgrade/rollback required in receipt |

Required exact-candidate gates: full repository check, classification evaluation, native physical discovery/log collection, partial coverage and permission boundaries, browser/report/Mallow assertions, replay/recording, install/upgrade/rollback, privacy-reviewed source archive and checksum verification. Expected platform, sample and source limitations above do not imply missing future features are release blockers.

Private reference messages, host aliases/pins, native operational receipts, grants, exported assessments and videos remain outside public source history. Publishable evidence is aggregate metrics, portable regression fixtures, release notes and checksum-bound source artifacts. The approved destination is the repository's existing GitHub main/release procedure; no publication occurs during preparation.

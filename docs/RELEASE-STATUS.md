# Tsunora release status

Updated: 26 September 2026.

## Published state

Tsunora v0.1.0 is an experimental research prerelease, derived from Agent Control runtime 4.15.0. Source is published on `main`.

Published scope includes:

- Digital Labour Exchange research capability.
- Workforce Operations synthetic prototype.
- qualified clean-install guidance for Git clone and source archive routes;
- archive doctor repair so Git is optional outside a Git checkout;
- Workforce Lab STOP/restart repair with session rotation;
- browser prerequisite guidance and reproducible qualification scripts;
- three live hero workflows: autonomous completion, approval pause/resume, and wrong-target scope block with process containment, quarantine, retry and verification.

The original workforce qualification anchor is `3e0e6cb183c4a6941c9fdf24aee1ef7870996ee8`.

The clean-install qualification candidate is `c810d643a9c9d16acc2e54f5c30051d02e9762cc`.

The qualified clean-install environment was Ubuntu 24.04 x86_64 containers, Node 24.21.0, CPU-only, deterministic workers and synthetic integrations.

## Qualification summary

- Clean anonymous clone: PASS.
- Git-free source archive install: PASS.
- Authenticated dashboard/discovery and product shell: PASS.
- Workforce Lab restart with retained approval state and rotated sessions: PASS.
- Three UI hero workflows on both qualified routes: 6/6 PASS.
- Digital Labour Exchange deterministic comparison: 45/45 verified comparisons.
- Additional real-process boundary checks: 13/13 PASS.
- Full repository regression: 2,482 passed, 0 failed, 1 skipped.
- Changed-file secret scan: no findings.
- Evidence bundle verification: 7,213/7,213 file hashes verified after download.

The frozen Workforce benchmark remains 120/120, 100/120 and 120/120. The 20 retained failures are no-eligible-replacement recovery cases. They are visible, intentional qualification outcomes and are not converted into passes.

## Corrected blockers

The following earlier blockers were corrected before publication:

- obsolete installation guidance that pointed users at inherited Agent Control instructions;
- source-archive doctor incorrectly requiring Git;
- Workforce Lab STOP marker preventing a clean restart;
- missing browser prerequisite guidance;
- historical navigation ambiguity;
- unsafe cleanup assumptions in containers without an init/reaper.

Cleanup checks were not weakened. The documented qualified container route uses an init/reaper.

## Remaining documented limitations

These do not block publication of the experimental research release, but they are not qualified capabilities:

- model-backed workforce workers;
- real HRIS, payroll, identity or enterprise integrations;
- production authentication, SSO or multi-user tenancy;
- Windows, macOS, Android, VM and bare-metal clean-install qualification;
- the skipped Bubblewrap/systemd-user sandbox test in the qualified container environment;
- universal prompt-injection resistance;
- transactional multi-resource atomicity and exactly-once crash recovery;
- recovery when no eligible replacement worker exists;
- monetary savings, energy savings or production economics;
- production deployment readiness.

Tsunora therefore remains **EXPERIMENTAL — PASS WITH DOCUMENTED LIMITATIONS**.
# Agent Control v4.12.1 release verification

Release baseline: public `v4.12.0` / `4513e80b737f50379f837bebe1be4fd5f8a8daf8`.

Qualified implementation source: `202e33c3abb74ccfb8835e1b449dfe1412e229c5`. Publication may add release documentation only; the implementation tree must remain unchanged.

| Gate | Status | Evidence |
|---|---|---|
| Source reconciliation | PASS | Candidate is three intended commits ahead of public v4.12.0; no unrelated changes were found |
| Architecture and authority separation | PASS | Workspace projections remain derived from authoritative records; navigation and WATCH do not grant execution authority |
| Security and protected resources | PASS | Protected artifacts use the authenticated redacted viewer; source paths and credentials are not projected |
| Complete repository check | PASS | Distribution, type checking, bootstrap/dashboard syntax, neutrality, implementation status, limitations integrity and 2,010 tests passed with 0 failures and 0 skips in 256.83 seconds |
| Virgin install | PASS | Detached qualified source bootstrapped with locked dependencies, initialized owner-private state and started an operator-authenticated dashboard |
| Upgrade from v4.12.0 | PASS | Authentic public tag upgraded to the qualified source with configuration and representative retained-history bytes unchanged; dashboard started successfully |
| Desktop browser | PASS | 1440 x 1000 production dashboard qualification |
| Mobile browser | PASS | 390 x 844 and 844 x 390 production dashboard qualification |
| Physical Pixel | PASS | Pixel 8 Pro / Android 17 Chrome traversed Estate, token detail and protected artifact views through the authorised USB ADB/CDP path |
| Documentation | PASS | README, documentation index, release notes, qualification and upgrade guidance reconciled for 4.12.1 |
| Distribution archive and checksum | PASS | Recorded in the immutable release receipt and GitHub release assets built from the annotated tag |

## Qualification boundaries

- Workspace navigation does not activate terminal, filesystem, deployment or remote-control authority.
- Repository source browsing remains unavailable; only retained Agent Control-managed artifacts are viewable through the protected evidence path.
- Search is computed from authoritative records on demand; a secondary index remains future work only if measured large-estate cost justifies it.
- Physical Pixel browser qualification does not deploy or modify Agent Control on the phone.
- Operational Agent Control installations are not deployed by this release task.


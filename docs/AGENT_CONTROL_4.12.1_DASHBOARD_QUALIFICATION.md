# Agent Control 4.12.1 Dashboard Limitations Qualification

## Result

The contained 4.12.1 candidate closes the targeted workspace navigation and containment-history limitations while preserving Agent Control's existing authority boundaries.

Baseline: `4513e80b737f50379f837bebe1be4fd5f8a8daf8` (`v4.12.0` public main)

Qualified implementation source: `202e33c3abb74ccfb8835e1b449dfe1412e229c5`.

## Implemented

1. **Authoritative workspace search** — projects, repositories, devices, nested environments, runtimes, workers, runs, invocations and retained artifacts are searched through a bounded, cursor-paginated projection. No parallel workspace index or topology is maintained.
2. **Durable favourites** — each authenticated operator can store up to 64 opaque workspace IDs. Labels, state and availability are resolved afresh from authoritative records.
3. **Governed session entry** — an exact recorded session relationship exposes the existing Live Shell in WATCH mode. Workspace navigation cannot create a session or grant intervention authority.
4. **Containment and recovery timeline** — the Dynamic Work Board renders stop requests, completion outcomes and recovery transitions from durable containment records with actors, timestamps, scope and evidence references.
5. **Responsive presentation** — long authorization labels and containment states wrap cleanly, and the Work Board becomes a single-column progressive view on constrained screens.
6. **Evidence-backed project/repository navigation** — projects come from durable Work Board declarations; repositories come from resolved parameterized-job snapshots with reviewed commit identity. Both associate to the same authoritative runs.
7. **Protected artifact viewing** — retained Agent Control-managed artifacts open through the existing authenticated, redacted evidence viewer. No source or snapshot path is projected.

## Data and authority model

The dashboard remains a renderer over Agent Control's authoritative Estate, Node Dashboard, Run Inspector, execution-session and containment records. Workspace preference state contains presentation choices only. The new search and timeline endpoints require the existing authenticated read authority; favourite mutation also requires existing mutation authority and same-origin protection.

Opening a workspace grants no shell, file, credential, job, deployment or remote-control authority. WATCH uses the existing execution-session API and its redaction. INTERVENE and TAKE CONTROL remain separately governed.

## Automated qualification

- TypeScript type checking: PASS.
- Final focused workspace, preference, containment, web API and Work Board tests: 81 passed, 0 failed, 0 skipped.
- Final complete regression suite: 2,010 passed, 0 failed, 0 skipped in 256.83 seconds.
- `git diff --check`: PASS.

## Browser qualification

The browser qualification uses the production dashboard assets and production workspace, preference, session, containment and Work Board APIs against isolated authoritative records.

- Desktop Chromium, 1440 × 1000.
- Mobile portrait Chromium emulation, 390 × 844.
- Mobile landscape Chromium emulation, 844 × 390.
- Search and cursor pagination: PASS.
- Favourite persistence: PASS.
- Exact-session WATCH attachment: PASS.
- New execution authority granted: NO.
- Durable containment/recovery timeline: PASS.
- Page JavaScript errors: NONE.
- Project and repository workspace navigation: PASS.
- Protected managed-artifact viewer: PASS.
- Arbitrary source-filesystem authority granted: NO.

Physical mobile-device qualification: PASS on a Pixel 8 Pro running Android 17, using Chrome reached through the authorised USB ADB/CDP path. The final source passed Estate workspace, invocation/token, and protected-artifact navigation. The protected-artifact view remained within the 395 CSS-pixel viewport with no horizontal clipping. Device serial and private origin are excluded from public evidence.

## Visual evidence

The generated evidence directory contains:

The pack includes Estate, project, repository, protected artifact, invocation/token, governed WATCH, portrait and landscape containment views plus `qualification.json`. The receipt enumerates the exact filenames and binds them to the final source commit.

The local JSON receipt binds the evidence to the qualified implementation source after the final committed rerun. Its SHA-256 is `967fcc592748637530402927ff74685780cc07163c42a174dd4df9f4d7d4d05d`.

## Remaining boundaries

- Repository source browsing remains unavailable. Managed evidence artifacts are viewable, but workspace identity never grants arbitrary filesystem authority.
- Physical Pixel qualification is reported separately from Chromium emulation and does not imply deployment to the phone.
- Search is computed from authoritative records on demand. The cursor bounds responses; a durable secondary index should only be introduced if measured large-estate cost justifies one.

These boundaries do not regress current behavior and are retained in `TODO.md`.

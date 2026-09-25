# Truthful bootstrap and implementation-status evidence

Date: 2026-08-25 (Europe/London)

Branch base: `aa0e6a836e37f8f5a78b3dc6c5a605d966168d67`

## Experimentally verified

- `npm run init` is backed by `initializeConfig()` and creates a schema-valid empty configuration only when the selected configuration file is absent.
- Repeating initialization is idempotent. Existing valid operator configuration remains byte-for-byte unchanged, invalid existing configuration fails closed, and CLI output contains only result metadata rather than configuration content.
- The machine-readable `config/implementation-status.json` contains 13 capability records. The gate resolves executable claims to existing source/tests, requires durable evidence for `QUALIFIED`, requires limitations for incomplete statuses and detects a stale generated Markdown projection.
- Focused bootstrap/status/operator-guide tests: 11 passed, 0 failed.
- Complete serial repository suite: 253 passed, 0 failed, 0 skipped.
- TypeScript, control/dashboard/bootstrap JavaScript syntax, implementation-status, infrastructure-neutrality (3/3) and `git diff --check` passed.
- Tracked filename scan found no `.env`, credential or secret-like filenames. High-entropy OpenAI-key scan found zero tracked matches. `.env.local` and `node_modules/` remain ignored.
- The Markdown release guide is byte-for-byte identical to its canonical source and has SHA-256 `a774f72faa9a57f7c85ee88ae09443732b4e280c289645a08c223967fed18935`.
- The regenerated eight-page A4 PDF has SHA-256 `2aa71d288cb52ee63f9760e98bd6b27d66b1ca238284f1389a74944f5c038411`. All pages were rendered with Poppler and visually inspected; no clipping, overlap, unreadable table heading or broken footer was observed.

## Source verified

- Initialization writes a completed temporary file with restrictive mode, flushes it, and uses an atomic hard-link create so it cannot overwrite a concurrently created target.
- Initialization performs no resource discovery, provider probing, service start, lane construction, lease/ownership mutation or PTY operation.
- `scripts/implementation-status.test.mjs` prevents public architecture documents from retaining the superseded claim that model-backed Job Actions are still unqualified.
- The status registry records `HarnessJobAgentAction` and both official Windows OpenAI routes as `QUALIFIED`; opaque CLI-internal tool visibility and universal adapter verification remain `PARTIAL`; governed skill creation and learned recipes remain `PLANNED`.

## Inferred

- The registry provides a low-maintenance truth boundary for later capability additions because the projection is generated and references are checked in the standard gate. New capability claims must still be reviewed for semantic accuracy.

## Not tested

- Bash shell syntax was not rerun on this Windows host because neither Bash nor an installed WSL distribution is available. No shell file changed in this work; all platform-independent portions of `npm run check` were executed directly.
- No production configuration, service, Schedule, lease, ownership state, PTY or deployment was changed.

## Commands

```text
node scripts/implementation-status.mjs --check
node --test scripts/init-config.test.mjs scripts/implementation-status.test.mjs scripts/operator-guide.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node --check scripts/control-plane.mjs scripts/config.mjs scripts/qualify-all.mjs
node --check scripts/init-config.mjs scripts/implementation-status.mjs
node --check assets/dashboard/dashboard.js assets/dashboard/dashboard-enhancements.js
node --test scripts/infrastructure-neutrality.test.mjs
node --import tsx --test --test-concurrency=1 src/*.test.ts src/control/*.test.ts src/ui/*.test.ts scripts/*.test.mjs
git diff --check
```

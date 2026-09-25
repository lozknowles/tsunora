# Agent Control 3.4.0

Agent Control 3.4 establishes **Job Definition + Parameters + Schedule + Model Route + Governed Run + Persistent Result** as a first-class platform boundary.

The built-in Repository Code Review freezes a Git SHA in a read-only snapshot, builds deterministic bounded context with exhaustive omission reporting, routes `review.default` to a qualified model, invokes its provider directly without Codex, requests a strict JSON Schema, creates fully attributable Work Parcels, validates structured evidence, records provider and configured-price cost, and advances only a successful delta baseline.

The dashboard now separates Job Definitions, Saved Jobs, Schedules, and Runs and generates creation controls from formal parameter schemas. Equivalent authenticated API and `agent-control jobs` CLI operations support create/update/enable/disable/run/cancel/list/get/export/import.

Upgrade with `git fetch --tags`, check out `v3.4.0`, run `npm install`, then `npm run check`. Existing 3.3 internal Job manifests, Run ledger, Work Parcels, model registry, systems, and lanes remain intact. Parameterised Job state is created beneath `AGENT_CONTROL_STATE_DIR/parameterized-jobs` only when used. No Saved Job or Schedule is enabled by installing the release.

Configure `jobs.repositoryRoots`, an execution resource, and a qualified `review.default` model before creating Repository Review Saved Jobs. Remote Git checkout remains disabled unless an explicit `jobs.repositoryRemotes` allowlist is configured.

Formal release evidence and exact qualification identities are recorded in `docs/evidence/agent-control-3.4.0-release-qualification.md`. Absence of that completed evidence means the release candidate has not met the formal tag/release gate.

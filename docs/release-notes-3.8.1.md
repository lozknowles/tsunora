# Agent Control 3.8.1 release notes

3.8.1 separates workload location, provider execution location, and credential residency. The recommended default keeps credentials on the controller or a designated credential/provider-execution node and moves only governed immutable work/context to them. Remote credential residency remains available.

It adds provider-neutral credential-store references, distinct route/ledger/dashboard locality fields, backward-compatible 3.8 migration, and immutable remote Windows Git snapshot transport through the existing managed-node SSH abstraction. It also fixes the Windows Codex account-status hang by supervising the native process with node-local redirected streams and bounded cleanup.

Additional integrity work restores generic file-backed provider credential resolution without exposing resolved paths or provider bodies, isolates account-bound Codex children from ambient API billing credentials, makes repository-review retry identities durable across restart, verifies only successful retry parcels, rejects unenforceable cost budgets, writes foundational state and telemetry owner-only, and includes the complete non-ignored Git mutation surface in Spark containment.

Physical qualification proves two independently authenticated Codex profiles, Account A → sealed baton → Account B, governed fallback, immutable cross-node repository transfer, real retry recovery, untracked out-of-scope mutation rejection, and a complete governed GLM-5.3-Flash review. Dashboard telemetry was reconciled programmatically; no interactive dashboard video is claimed.

The final independent review found no Critical or High defects. One Medium hardening item is explicitly deferred: intentionally ignored and `.git`-internal Spark writes are not part of the mutation ledger. Spark remains disabled by default, single-attempt, disposable-worktree-only, and independently verified. This limitation is not represented as fixed.

See [qualification evidence](evidence/agent-control-3.8.1-qualification.md), [sanitized physical remediation evidence](evidence/agent-control-3.8.1-high-remediation-physical.json), [final GLM review](evidence/agent-control-3.8.1-final-glm-review.md), and the [migration guide](migration-3.8.1.md).

Upgrade from 3.8.0 with `git fetch --tags`, `git checkout v3.8.1`, `npm install --no-package-lock --ignore-scripts`, and `npm run check`. Installing the source package starts no service, changes no live configuration, authenticates no provider, and enables neither Spark nor a Saved Job.

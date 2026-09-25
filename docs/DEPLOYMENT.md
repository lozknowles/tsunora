> For Agent Control **4.6.1**, use [Installation](installation-first-run.md), [Upgrade](upgrade-4.6.md) and the [security patch notes](release-notes-4.6.1.md). The historical deployment and supported-upgrade gates below remain retained for provenance.

# Agent Control 4.5.1 deployment, upgrade and rollback

> **Existing-installation advisory:** the published `v4.5.0` source release
> passed virgin installation but did not pass the later production upgrade from
> the preserved v4.1 configuration. Upgrade existing installations to `v4.5.1`,
> which adds the missing supported-configuration gate and passed that physical
> production path. Do not reset configuration to imitate a fresh install.

## Bootstrap and Environment Discovery

Use `scripts/bootstrap-agent-control.sh --check` on Linux/macOS or
`scripts/bootstrap-agent-control.ps1 -Mode check` on Windows before installation.
The check is read-only and stops on missing prerequisites, a dirty checkout or
divergence. This repository intentionally has no package lock or build step;
explicit install mode uses `npm install --ignore-scripts --no-package-lock` and
the idempotent initializer. It does not install Ollama, llama.cpp, Codex, Claude
Code, Gemini CLI, GPU drivers or other optional tools.

A fresh Termux environment normally lacks the required Git, Node.js and npm
commands. Install and verify the exact prerequisites documented in
[the Android guide](../android/README.md#fresh-termux-prerequisites) before
running the repository clone. This prerequisite step does not activate the
Android node, dashboard, boot hook, ADB or any provider.

Before starting the dashboard, configure `AGENT_CONTROL_WEB_OPERATOR_TOKEN`
through the README's hidden-prompt procedure. Authenticate the browser with that
same private token; Environment Discovery is intentionally unavailable to an
observer-only process. Then use **Settings → Installation** to verify provenance
and **Environment Discovery** for First Run Setup. Remote discovery is opt-in and
bounded to configured hosts. Review the resulting inventory and qualification
before approving any configuration Work Parcel. Estate Map needs no extra
service: it is a second projection rendered by the existing Runtime Map assets.
Inventory and capability-registry state live beneath the configured Agent Control
state root and contain references/status only, never credential values. See
[the operator guide](environment-discovery.md).

For a new provider-free controller, the documented first execution is the
registered `operator-system-observation@1.1.0` Job. In the authenticated Morrow
view, ask `Start operator-system-observation@1.1.0`, inspect the sealed proposal,
expand **Jobs, schedules, approvals & evidence**, select **Approve this job**,
and follow its Work Parcel in **Runtime Map → Process Map**.
The `observe → verify` stages must finish `SUCCEEDED`; this checks only the
local governed execution and independent artifact-verification boundary. A fresh
empty configuration exposes one built-in controller-local worker restricted to
`agent-control.operator-observation.read` for these two read-only stages. It is
not a general shell, model or remote-node execution route.

## Runtime Map

Runtime Map requires no second service or database. It is served by the normal
authenticated dashboard and projects the existing state directory. Preserve the
Work Parcel, Run and execution-session records during upgrade if historical
Replay is required. The browser receives sanitized metadata through
`/api/runtime-map` and the existing `/api/events` SSE stream; do not expose
either endpoint without the operator-authentication boundary.

The view is WATCH-only. Existing Live Shell and mutation endpoints retain their
separate authority checks. A disconnected dashboard does not stop execution;
operators must treat the visible state as stale until the banner returns to
LIVE/HISTORICAL after reconciliation. No Runtime Map-specific rollback data is
required because the graph is derived rather than authoritative. See the
[operator guide](runtime-map.md).

## Experimental Session Vault configuration

The web entry point uses `${AGENT_CONTROL_STATE_DIR:-.agent-control}/session-vault`
and discovers Codex history beneath `${CODEX_HOME:-$HOME/.codex}/sessions` and
`archived_sessions`. The dashboard API remains operator-authenticated. Do not
expose the state directory through a static web server or shared filesystem.

Cross-node replicas must use an existing governed SSH resource and a node-local
absolute destination root. The fixed audited helper accepts object/record data
through stdin; it does not expose a generic shell API. Use node-local encryption
and retention policy appropriate to the captured sensitivity. Removing an
optional Obsidian Markdown view does not remove the immutable Session Vault.

Before upgrade, copy the state directory without rewriting objects and run the
integrity verifier. Rollback restores the previous application build while
preserving the append-only vault. A schema reader that does not recognize a
newer record must stop rather than migrate or discard it. Full procedures are in
[Session Vault recovery](session-vault-recovery.md) and
[replication](session-vault-replication.md).

This is the canonical deployment guide for Agent Control 4.5.1. Source publication
and production deployment are separate events. A healthy listener alone does not
prove release qualification.

## Install an immutable release

Prerequisites are Node.js 24, npm and Git. Optional browser, SSH, Android, speech
and model integrations require their own qualified dependencies. The repository
does not commit a package lock, so retain the resolved dependency inventory with
release evidence. The ordinary clone contains product source and lightweight
records only; heavyweight qualification artifacts are retained in the separate
[checksummed evidence archive](evidence-archive.md). Do not use a shallow or
partial clone as an installation workaround.

```bash
git clone https://github.com/lozknowles/agent-control.git
cd agent-control
git checkout --detach v4.5.1
./scripts/bootstrap-agent-control.sh --check --target "$PWD"
./scripts/bootstrap-agent-control.sh --install --role control --target "$PWD"
npm run check
```

`npm run check:distribution` is part of `npm run check`. It prevents historical
qualification trees, dashboard media and oversized evidence objects from being
reintroduced into product-source history.

Pre-release qualification uses the exact reviewed candidate SHA in place of the
published tag. The bootstrap check should report a verified
repository and available dashboard. Install reports no-lock dependency
installation and whether the existing configuration was initialized or
preserved. The validation suite uses disposable test state and leaves the
installation's `.agent-control` state untouched. Do not bypass a bootstrap
failure with an undocumented `chmod`, package-manager command or build step.

Learned Specialists are disabled for routing unless explicitly configured and
qualified. Keep adaptation files and `AGENT_CONTROL_STATE_DIR` outside disposable
source checkouts, owner-readable, and backed up with the exact registry snapshot.
Never copy an adaptation to a different base/runtime and retain its qualification.
The deployment must provide the framework adapter locally; Agent Control core
does not install training dependencies or download models at runtime.

Example safe policy:

```json
{
  "learnedSkills": {
    "enabled": true,
    "routingEnabled": false,
    "minimumImprovement": 0.1,
    "maximumQualificationAgeDays": 90,
    "requireHumanDatasetApproval": true
  }
}
```

Enable `routingEnabled` only after the target installation can verify the exact
base and adapter hashes and the recorded frozen qualification. Roll back by
disabling learned routing first; the immutable base route remains available.

Your Memories cross-model routing is separately fail closed. Generate or install
an owner-only provider-neutral qualification file, then opt into enforcement:

```bash
npm run qualify:memory-route-records -- /path/to/private/memory-route-qualifications.json
export AGENT_CONTROL_MEMORY_ROUTE_QUALIFICATIONS=/path/to/private/memory-route-qualifications.json
export AGENT_CONTROL_MEMORY_ENFORCE_ROUTE_QUALIFICATION=1
```

The file contains route identity, runtime/contract versions, bounded proven
payload size, role eligibility, freshness and evidence—not credentials or model
output. A missing, stale, unsupported, oversized or contract-mismatched route is
denied. An alternate route is used only when its exact pair is explicitly
qualified. Rebuild and independently review the records after model, runtime,
contract or relevant evidence changes; do not copy a qualification across nodes
or account profiles.

## Keep mutable state outside the release

Set `AGENT_CONTROL_CONFIG`, `AGENT_CONTROL_STATE_DIR` and
`AGENT_CONTROL_JOB_DIR` to durable operator-owned locations outside disposable
release checkouts. Configuration contains opaque credential references, never
credential values. Provider secure stores and Codex homes remain at their declared
credential-residency node. Run exactly one controller per state directory.

```bash
export AGENT_CONTROL_CONFIG=/path/to/private/config.json
export AGENT_CONTROL_STATE_DIR=/path/to/private/state
export AGENT_CONTROL_JOB_DIR=/path/to/private/jobs
export AGENT_CONTROL_WEB_HOST=127.0.0.1
export AGENT_CONTROL_WEB_PORT=19196
npm run web
```

Keep the dashboard private through the installation's existing reverse proxy or
tailnet. Set `AGENT_CONTROL_WEB_OPERATOR_TOKEN` through the existing secret
delivery mechanism. Do not place credentials in URLs, Git, transcripts or videos.

## Morrow integration testing

The original Morrow integration was qualified on the historical
`feature/4.5-release-gate-completion` checkpoint and is now part of the 4.5
release line. For regression or evidence review, use an isolated checkout at the
release candidate under test, with separate private state/configuration and an
unused loopback port. Follow the local startup above; never share a writable
state directory with the running controller.

Check the host name, all six robots, new and restored conversations, contextual
help, reduced/off motion and narrow-screen layout. With an enrolled physical
voice/social setup, exercise `Morrow: status`, the legacy `POE: status` alias and
speech interruption. Confirm an approved harmless Work Parcel still follows
normal dispatch, route qualification, execution and independent verification.
Record the actual model, source commit and outcome. Existing POE videos and
controlled transcription tests do not establish these physical Morrow checks.

See the [integration record](provenance/EXTERNAL-EVIDENCE.md).
Source integration and publication do not change the running installation or
substitute for the dual installation and governed-smoke gates below.

## Release and rollout gate

1. Freeze the candidate SHA and resolved dependency inventory.
2. Run `npm run check` from a clean isolated checkout.
3. Perform a normal documented virgin installation from the frozen candidate,
   then prove authenticated dashboard startup, First Run Environment Discovery,
   truthful Estate classification and the governed
   `operator-system-observation@1.1.0` smoke Job.
4. **Supported existing-configuration upgrade:** separately copy each declared
   supported prior configuration and state into an
   owner-only qualification root. Run the same documented bootstrap without
   deleting or resetting that configuration, then prove dashboard startup,
   discovery, Estate classification and the same governed smoke Job. For 4.5.1,
   the mandatory prior shape is v4.1. A virgin PASS cannot substitute for this
   upgrade PASS.
5. Confirm the 4.3 A–F foundation remains intact and the recorded 4.4 physical
   browser qualification matches the release tree, including immutable session
   identity, parallel lanes, accounting, the Your Memories lifecycle, complete
   transcript and reviewed 1920×1080 recording.
6. Verify state/config compatibility and create an owner-only stopped-controller
   backup.
7. Stop only the scoped existing controller, select the exact qualified candidate,
   retain
   existing state and credential references, and restart through its established
   supervisor.
8. Verify version, source provenance, health, authentication, SSE updates, Jobs,
   Lanes, Models, Crew, Warm Cache Runtime and a harmless governed operation.
9. Merge through the repository workflow only after every mandatory 4.5.1 gate,
   including production smoke, is proven. Verify the merge contains the qualified
   product tree, tag `v4.5.1`, push, and create the GitHub Release with manifest
   hashes. A draft pull request or an experimental candidate is not a stable
   release.

The historical 4.5 candidate gate and its then-open limitations are recorded in
[the completion reconciliation](provenance/EXTERNAL-EVIDENCE.md)
and [historical release-closure audit](provenance/EXTERNAL-EVIDENCE.md).
The current authority is the
[final release-closure audit](provenance/EXTERNAL-EVIDENCE.md)
for product candidate `31ccdf07f9aeb96cec0ea87a8cfb2bf1607ae86b`.
It records the complete requirement matrix, 1,331-test regression, physical
Estate/Process Map and virgin-install evidence, the exact failed MiniCPM
configuration and the bounded power limitations. Its verdict is `PASS WITH
LIMITATIONS — READY FOR 4.5 RELEASE`.

That verdict is not itself a release action. Run the merge/tag/publication steps
above only under separate current operator authorization, after rechecking
candidate/evidence identity and remote parity. Do not enable unavailable model
routes, energy/residency policy or map-originated control as part of release.
The earlier [4.5 reconciliation](provenance/EXTERNAL-EVIDENCE.md)
remains immutable historical evidence for its recorded implementation.
The 4.4 checksummed replay evidence is recorded in
[the 4.4 qualification](evidence/agent-control-4.4-ux-session-replay-20260911.md),
with the retained foundation in
[the 4.3 qualification](evidence/agent-control-4.3-integrated-qualification-20260909.md).
If main changes the product tree between qualification and tag, reconcile and
rerun affected regression/physical gates. Never label historical evidence as the
new candidate's result.

The authoritative 4.5.1 remediation record is the
[dual-install and production qualification](provenance/EXTERNAL-EVIDENCE.md).
The exact implementation passed 1,337/1,337 tests, ordinary full-clone virgin
installation, byte-preserved authentic v4.1 upgrade, production deployment,
authenticated dashboard/SSE inspection and the genuine governed observation
Job. Its separate checksummed archives keep heavyweight evidence out of normal
source clones.

## Rollback

Retain the previous immutable release SHA/package, supervisor definition and
matching owner-only state backup. If acceptance fails, stop the candidate controller,
restore the matching previous state only if migration changed it, select the
previous known-good production release (currently `v4.1.0` for this remediation),
restart the same scoped service and recheck health,
authentication and a harmless read-only operation. Never run old and new versions
against one state directory or move credential stores with source archives.

## Operational limits

- Remote paths need node-local typed enforcement; controller lexical checks do
  not establish remote filesystem containment.
- Opaque CLI internal actions are not universally visible to ToolPolicy. Admit
  only qualified capability envelopes; missing required sandboxing fails closed.
- Warm Expert preference is optional and subordinate to governance. Unknown cache,
  context, pricing or billing fields remain unavailable.
- Cleanup removes only execution-owned temporary roots or explicitly declared
  disposable generated roots. Ignored state is not disposable by default.

Detailed integration configuration remains in [the historical 4.1 runbook](installation-deployment-4.1.md),
[model documentation](models/README.md), [managed nodes](managed-nodes.md),
[dashboard operation](web-dashboard.md), [Morrow](poe.md), and
[Cache-Aware Expert Delegation](cache-aware-expert-delegation.md).

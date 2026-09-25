# Install, upgrade and roll back Agent Control 4.13.0

Prerequisites: Node.js 24, npm, Git and Bash for the tested Linux controller path. Models, GPUs and remote hosts are optional. Use the exact candidate commit and checksum from the accompanying release receipt during review; the future v4.13.0 tag does not exist until publication is approved.

## New installation

Clone the repository into a new directory, check out the receipt's exact commit (or the immutable v4.13.0 tag after publication), and run:

```bash
./scripts/bootstrap-agent-control.sh --check --target "$PWD"
./scripts/bootstrap-agent-control.sh --install --role control --target "$PWD"
npm run check
```

For the source tarball, verify SHA256SUMS first and extract into a new directory. It contains no Git history; run `npm ci --ignore-scripts --no-audit --no-fund`, `npm run init`, and then `npm run web`. The Git-aware bootstrap check is for a clean Git checkout, not an uninitialised archive directory. Use an operator token entered privately; do not copy qualification credentials or estate configuration. The dashboard defaults to loopback port 4310. Production binding/authentication remains the administrator's responsibility.

## Upgrade from 4.12.1

1. Stop only the controller owning this installation. Do not run two controllers against one state directory.
2. Back up its application-private configuration and complete state directory, retaining credential references in the existing secure store. Record the old commit and backup hashes.
3. Check out the exact approved commit/tag in a clean checkout. Run the locked bootstrap install above with the same explicit configuration/state paths.
4. Start the dashboard, authenticate, verify retained Job/evidence/history and configuration hashes, and confirm Estate/Factory/Diagnostics are present.
5. Diagnostics begin at log scope NONE. Existing configuration remains schema version 1. No migration, new remote pin or expanded log grant is applied automatically.

Use `AGENT_CONTROL_CONFIG` for the existing config file and `AGENT_CONTROL_STATE_DIR` for existing state. Preserve any existing activity-log and credential environment references. Do not point qualification or test instances at production state.

## Rollback

Stop the candidate controller, restore the pre-upgrade configuration and complete state backup, check out the previous immutable v4.12.1 tag/recorded commit, run its locked bootstrap, and restart with the original paths. Verify backup hashes and retained history. Keep any candidate-era exported assessments in a separate private archive if needed; never merge incompatible append-only stores or silently rewrite old evidence. A rollback is a separately authorised operational action.

The release receipt records the exact virgin-install, upgrade and rollback qualification result. Other host OS installation paths are not newly physically qualified by a Linux-controller upgrade test.

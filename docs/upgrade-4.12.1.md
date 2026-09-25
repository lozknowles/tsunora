# Upgrade to Agent Control 4.12.1

Agent Control 4.12.1 is an additive patch upgrade from public v4.12.0. It adds dashboard navigation and recovery visibility without changing the authoritative state schema or requiring a migration.

1. Stop only the Agent Control process that owns the installation.
2. Back up the application-private state directory and retain credential references in their existing secure store.
3. Check out the immutable `v4.12.1` tag.
4. Run:

```bash
./scripts/bootstrap-agent-control.sh --check --target "$PWD"
./scripts/bootstrap-agent-control.sh --install --role control --target "$PWD"
npm run check
npm run web
```

Existing configuration, policies, run history, evidence and protected-resource settings remain external state and must be preserved. Workspace favourites are presentation state and grant no execution authority.

Rollback uses the pre-upgrade state backup and the previous `v4.12.0` tag. Do not run two controllers against the same state directory.


# Upgrade to Agent Control 4.10.0

Agent Control 4.10.0 is an additive upgrade from public v4.9.0. Back up the application-private configuration and state directory, retain credential references in their existing secure store, and stop only the Agent Control instance being upgraded.

```bash
git fetch --tags origin
git checkout v4.10.0
npm ci
./scripts/bootstrap-agent-control.sh --check --target "$PWD"
npm run typecheck
```

Start Agent Control through the same existing service procedure, then verify the reported version, authenticated dashboard, existing Jobs and evidence, activity history, model/provider configuration, Work Board state and containment state.

The Work Board and containment additions are optional, additive state. Existing v4.9.0 configurations and history do not require destructive migration. Navigation and capability visibility do not grant execution authority.

If validation fails, stop the upgraded instance and restore the preserved v4.9.0 application files and state. Do not delete historical evidence to complete an upgrade.

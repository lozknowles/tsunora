# Upgrade to Agent Control 4.11.0

Agent Control 4.11.0 is an additive upgrade from public v4.10.0. Back up the application-private configuration and state directory, retain credential references in their existing secure store, and stop only the Agent Control instance being upgraded.

```bash
git fetch --tags origin
git checkout v4.11.0
npm ci
./scripts/bootstrap-agent-control.sh --check --target "$PWD"
npm run typecheck
```

Start Agent Control through the same existing service procedure. Verify the reported version, authenticated dashboard, existing Jobs and evidence, usage/token/cache history, model/provider configuration, Work Boards and containment/quarantine state. Then open Models and confirm the Model Improvement projection initializes without fabricating historical improvement records.

The Model Improvement store and Limitations Ledger are additive. Existing v4.10.0 configuration, Work Boards, history, evidence, containment state, model records and provider records remain authoritative; no destructive migration is required. Promotion remains disabled until the configured mode, exact candidate, sealed proposal, explicit approval, eligible worker and allow-listed intervention adapter satisfy the governed lifecycle.

If validation fails, stop the upgraded instance and restore the preserved v4.10.0 application files and state. Do not delete historical evidence to complete an upgrade.

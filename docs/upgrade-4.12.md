# Upgrade to Agent Control 4.12.0

Agent Control 4.12.0 is an additive upgrade from public v4.11.0. Back up the application-private configuration and state directory, keep credential references in their existing secure store, and stop only the Agent Control instance being upgraded.

```bash
git fetch --tags origin
git checkout v4.12.0
npm ci
npm run check
./scripts/bootstrap-agent-control.sh --check --target "$PWD"
```

Existing configuration, job history, evidence, model-improvement records and protected-resource settings remain valid. The configuration schema stays at version 1 and requires no migration.

Cost/performance routing is opt-in. An installation with no `costPerformanceRouting` section keeps its prior routing behaviour. Use the authenticated dashboard or configuration API to preview a policy before saving it. Raising an existing hard ceiling, token limit, job budget, invocation budget or cross-model authority requires an exact reviewed proposal and retained operator reason.

Agent Templates do not inherit new execution authority. Only registered, allow-listed native actions can execute, and ordinary runtime safety, approvals, capability checks and evidence rules still apply.

After upgrading, verify the dashboard, Estate, Jobs, Models, Routing and Mallow views. Do not copy qualification credentials, private state or physical-estate identifiers from the repository examples.

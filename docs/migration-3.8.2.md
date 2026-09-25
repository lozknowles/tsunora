# Migrating from 3.8.1 to 3.8.2

Agent Control 3.8.2 is a backward-compatible source update. It changes no configuration schema, account-profile format, credential-residency rule, Saved Job definition or durable-state schema.

After checking out `v3.8.2`, run:

```bash
npm install --no-package-lock --ignore-scripts
npm run check
```

Restart the Agent Control process through the installation's normal operator procedure so the dashboard serves the 3.8.2 assets. No migration command is required. Existing Runs, Work Parcels, governor evidence and batons remain authoritative; the new Execution history is rebuilt from those durable sources.

Historical `repository_review_provider_schema_invalid` records remain unchanged. Because 3.8.1 intentionally retained only response hashes and accounting for rejected ephemeral provider bodies, their exact failed fields cannot be reconstructed. New schema failures include safe field-path constraints without persisting rejected values or raw responses.

No provider reauthentication is required. No deployment, service restart or configuration mutation occurs merely by installing the source package.

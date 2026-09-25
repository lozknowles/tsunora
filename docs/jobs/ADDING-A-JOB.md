# Adding a Job Definition

3.4 deliberately avoids a general workflow language. Add one narrow definition/executor pair:

1. Add a typed `ParameterizedJobDefinition` with a new stable ID/version, formal parameters, logical role, minimum permissions, budgets, output schema, validation policy, and versioned instruction template.
2. Register it in `buildParameterizedJobRuntime`.
3. Implement a bounded executor behind a dedicated interface. Reuse Work Parcels for decomposition, routing evidence, accounting, and cancellation. Never call a model before node/input/route resolution.
4. Add deterministic output validation independent of model assertions.
5. Persist only necessary evidence; hash provider responses and keep credentials/prompt-sensitive secrets out of state.
6. Add API/dashboard presentation by relying on the generic definition and Run schemas. Do not create a second scheduler or manual execution path.
7. Test valid/default/invalid parameters, version compatibility, permissions, resolution/freezing, route/fallback, decomposition, budgets, cancellation/retry/restart, immutable history, and successful-only baseline changes where applicable.
8. Perform one real provider-backed qualification through `ParameterizedJobEngine`, not by invoking the provider manually.

If the Job needs mutation authority, create a separate definition and explicit approval/tool policy. Do not broaden Repository Code Review’s read-only permissions.

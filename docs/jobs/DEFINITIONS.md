# Job Definitions

A definition is an immutable versioned contract registered in `ParameterizedJobRegistry`. It owns:

- stable ID, integer version, display name, and description;
- formal parameter schemas and defaults;
- default logical model role and fallback policy;
- repository, shell, and network permissions;
- timeout, retry, input, output, and optional cost budgets;
- output schema and deterministic validation policy;
- auditable instruction template ID/version/content.

Historical Runs embed the complete resolved definition. Updating the registry cannot reinterpret history. A Saved Job with `follow: pinned` always resolves its recorded version. `latest-compatible` can move only to a definition whose `compatibleWith` declares the Saved Job’s base version. Re-registering the same ID/version with different content fails as `incompatible_definition_update`.

Definitions express work intent, not a provider brand or host identity. The built-in review requests `review.default`; a Saved Job can request another logical role or an explicit qualified model when policy permits.

This registry is code-backed in 3.4. It is persistent in the release identity and historical Run records; runtime Saved Job configuration cannot upload arbitrary executable definition logic.

# Capability binding and technical readiness

This 4.5 parcel adds the pure `scripts/capability-binding.mjs` projection. `external-job-catalogue.mjs` exports its `assessReadiness`; the previous implementation remains explicitly named `assessLegacyReadiness` for historical evidence replay. The old catalogue test driver deliberately imports that legacy function. New assessments use `assess-external-job-library.ts`.

## Trust and evidence

Inputs are authenticated native `DiscoveryScan` records from the controller, not arbitrary uploaded estate JSON. Rules are reviewed controller code/configuration. Never adopt rules or readiness contracts from a downloaded job, community adapter or model response without review. Hashes identify records; they are not signatures or authorization. Existing adapter registration and ENABLED lifecycle remain unchanged. A registered executable's successful version probe cannot promote all of its declared capabilities.

Rules explicitly select kind, adapter, probe method, required result fields and TTL. Derivation records scan ID, observation ID/fingerprint, node/resource identity, related physical resources, rule ID/digest, probe, timestamp, expiry and result. Declared and observed capabilities remain visible but cannot satisfy requirements. Failed evidence is FAILED; future, malformed or expired evidence is STALE. Only VERIFIED bindings satisfy this projection. It never sets QUALIFIED: capability qualification and job qualification remain external evidence processes.

Built-ins establish narrowly scoped capabilities:

| Capability | Evidence | TTL |
|---|---|---|
| host.inspect | Native authoritative OS observation with CPU, memory and successful filesystem statistics | 1 hour |
| gpu.inspect | Successful bounded GPU usage and compute-process queries, linked to the physical GPU observation | 5 minutes |
| evidence.report | Pure structured report assembly, provenance attachment and digest round trip | 24 hours |

The GPU-specific command is confined to its detection adapter. Its failure never falls back to an inventory-only success. The report probe proves assembly, **not reasoning, factual analysis or a business outcome**. A live device/model/job qualification is not inferred. No executable-discovery, TCP-port, model-list or version-only observation implies SSH access, repository access or model inference. Additional capabilities need their own reviewed probe contracts. The current built-in coverage is intentionally small.

The 300-second manifest evidence limit is retained in the result as `jobResultMaxAgeSeconds`, to be checked for execution results/launch. Stable capability availability uses the rule-specific TTL above; lookups do not initiate probes. A partial scan is BLOCKED. Expired proof cannot remain READY.

## Technical readiness versus launch admission

`agent-control.job-readiness/v2` returns job identity/digest, pattern, technicalReadiness/primaryState, all reasons, every requirement's candidates and evidence, missingCapabilities, runtimeInputs, placement, compatibleResources, evidenceFreshness, authority, execution and qualification. The dashboard can render these fields directly, without separately authored explanations. No dashboard, routing, runtime configuration or service was changed.

Primary technical precedence is BLOCKED, UNSUPPORTED, CONNECTOR_REQUIRED, CREDENTIAL_REQUIRED, CONFIGURATION_REQUIRED, otherwise READY. All overlapping reasons remain available. APPROVAL_REQUIRED is an orthogonal authority state. Manifest approval, consequential permissions or high/critical risk require approval. Read-only inputs and isolated run-output writes do not automatically require consequential-action approval. Every result still has `authorityGranted:false` and `executionGrant:NOT_EVALUATED`; no approval state grants execution permission.

Inputs are not capabilities. The published scenario input and target selection remain REQUIRED until launch; supplying input merely marks it SUPPLIED_UNVALIDATED. It does not bypass input validation. Operator-specific configuration is reported only for explicit reviewed contract keys. Generic execution-adapter admission remains a launch check, not 50 fabricated configuration defects. Budget, target scope, runtime freshness, input schema, adapter admission and scoped authority must all pass before invocation.

This is deliberately a **declared-capability readiness** contract, not a replacement for the library's v0.1.0 launch-compatibility CLI. No library schema, manifest, catalogue, release or qualification status changes. The v0.1.0 manifests use synthetic supplied scenarios and weak capability descriptions. In particular, email access is not declared by inbox-triage, and model generation is not declared by its report-only jobs. READY cannot be advertised as proof of those live integrations or business-task success. Stronger live variants must declare their real requirements before admission.

## Placement and additional adapters

Spec 1.0 has no placement field. Its safe default here is COLOCATED: all required capabilities, connector and credential evidence must have a common node. Counted target requirements count distinct eligible nodes. Same-node resources may differ (host, GPU, tool). Model requirements participate exactly like capabilities; no provider is selected. Distributed placement is only enabled by an explicit controller-reviewed, job-digest-bound contract:

```json
{"schema":"agent-control.readiness-contract/v1","jobDigest":"<64 hex digest>","reviewed":true,"placement":"DISTRIBUTED","configuration":[]}
```

This is a controller contract, not a change silently applied to v0.1.0. The optional configuration list contains actual operator setup keys. Imports do not review or approve it. Future library placement metadata needs a versioned specification update.

Trusted adapters can supply additional exact-probe rules (no executable code in rules). Connector capabilities use `connector.<declared-id>`; their native attributes must also establish installed, configured and AUTHENTICATED state. Credential capabilities use `credential.<declared-reference>`; native attributes must establish presence, VERIFIED authorization and every requested credential-use scope in authorizedScopes. These prefixes distinguish requirement types, not providers. Only identifiers, fingerprints and proof metadata leave the projection; credential values and attribute contents are not emitted. No credential store or external credential probe is used by this parcel. Connector and credential gaps coexist; missing credentials do not disappear behind a missing connector.

## Reproduction

Use the pinned source JSON from the preceding external catalogue access evidence, and the pinned job schema URL/digest:

```sh
node --import tsx scripts/assess-external-job-library.ts SOURCE_JSON SCHEMA_URL SCHEMA_SHA256 OUTPUT_DIRECTORY
```

The driver verifies the pinned index, schema and **all** manifest payload hashes before discovery. It fetches no executable payload and makes no repository clone. It selects only native local-machine and readiness-probe adapters, with empty provider configuration and no remote/mobile/memory adapters. Private native discovery remains outside the repository in OUTPUT_DIRECTORY; the sanitized `readiness-report.json` is suitable for review. Each invocation creates a new timestamped assessment, never qualification evidence.

Tests use synthetic alternative estates for placement, connectors, credentials and provider neutrality. Fresh physical evidence in this parcel covers only the development controller and its GPU; distributed execution and external integrations were not physically tested.

# Credential residency and execution locality

Agent Control 3.8.1 treats three locations independently:

```text
workload/repository node → immutable governed snapshot
provider execution node → provider process
credential residency node → opaque credential-store reference
```

The recommended deployment keeps credentials on the Agent Control controller, or on a designated credential/provider-execution node. Managed workload nodes do not need provider credentials. Remote credential residency remains supported where policy requires it.

Agent Control moves immutable repository bundles, Context and Evidence Packets, Work Parcels, batons, and provider-neutral metadata. It does not move access or refresh tokens, OAuth files, cookies, API keys, or provider credential stores. Workload-node authority does not imply credential-node authority.

## Configuration

An account profile declares provider execution and credential residency explicitly:

```json
{
  "id": "account-a",
  "label": "Account A",
  "providerExecutionNodeId": "controller",
  "credentialResidency": {
    "nodeId": "controller",
    "store": {"type": "codex-home-env", "env": "CODEX_HOME_ACCOUNT_A"}
  }
}
```

Store types are `codex-home-env`, `api-key-env`, `bearer-file-env`, and `provider-secure-store`. Values are references, never credentials. For Codex CLI homes, provider execution must occur on the credential node. The model's qualified `nodes` are provider-execution nodes; a Job's repository `node` is its workload node.

The 3.8 shape remains compatible: `nodeId` becomes both provider-execution and credential-residency node, while `credentialStore` becomes the residency store. New configuration should use the explicit fields.

## Generic API credentials

API providers may keep the existing environment and referenced-file forms, or use the existing opaque secure-store form:

```json
{
  "id": "external-provider",
  "kind": "openai-compatible",
  "baseUrl": "https://provider.example/v1",
  "auth": {
    "type": "provider-secure-store",
    "reference": "provider:external-provider"
  }
}
```

`provider-secure-store` is one generic backend for NVIDIA, OpenAI-compatible and future API providers; it is not tied to a provider. By default it lives under `$AGENT_CONTROL_STATE_DIR/credentials/providers` (or `.agent-control/credentials/providers` when no state directory is configured). The opaque reference is SHA-256-derived into the filename, so provider/account labels are not filenames. The directory is owner-only (`0700`), each credential is owner-only (`0600`), rotation uses an exclusive temporary file plus atomic rename, and symlink, owner or permission mismatches fail closed. `AGENT_CONTROL_PROVIDER_CREDENTIAL_STORE_DIR` can select a separately mounted owner-only directory.

The first live NVIDIA ceremony used this exact generic path. Metadata-only status reported `CONFIGURED`; the runtime directory and selected value retained `0700`/`0600` ownership, and authenticated discovery/inference resolved the reference only at invocation. The safe fingerprint was shown transiently by `set` and deliberately was not copied into qualification evidence. See the [NVIDIA physical qualification](evidence/agent-control-3.9-nvidia-hosted-qualification-20260906.md).

Manage a configured reference without putting its value in a command argument:

```bash
agent-control providers credential set external-provider
agent-control providers credential status external-provider
agent-control providers credential revoke external-provider
```

For a controller-resident API account profile whose `credentialResidency.store` is a distinct `provider-secure-store` reference, append `--account PROFILE_ID` to the same three commands. Remote-resident accounts are refused because their credential must be managed on their owning node rather than copied to the controller.

`set` reads hidden terminal input, or stdin for a supervised invocation, and reports only `CONFIGURED` plus a prefix/suffix fingerprint. `status` inspects safe metadata and does not open the credential. Repeating `set` atomically replaces the value; `revoke` removes it. Configuration, provider/catalogue records and exported diagnostics retain only provider ID, optional opaque account-profile ID, reference class and `CONFIGURED`, `MISSING` or `INVALID_STORE` status—not the reference name, resolved path or value in public projections.

Resolution is deliberately late. Startup, dashboard reads, status checks, routing and model discovery projections do not read credential contents. The selected adapter resolves the reference only when authenticated discovery, smoke qualification or model execution starts, and places it only in the provider authorization header or an isolated child environment. Exact runtime values and known provider-key patterns are redacted from model output, tool arguments, metadata and transport errors before telemetry or persistence.

An API account profile can point at its own distinct `api-key-env`, `bearer-file-env` or `provider-secure-store` reference. A controller-local API invocation resolves only the selected account's reference and never falls back to the provider-level or another account credential. Provider/account/model/node mismatch fails before execution. A controller client also refuses to resolve a remote-resident account; a future remote API execution adapter must perform that node-local operation explicitly. Existing Codex account profiles continue to use isolated `codex-home-env` locations and never copy OAuth state into this store.

Credential values are rejected or redacted at Work Parcel, parameterized Job, Run ledger, artifact, event/SSE, dashboard/API and diagnostics boundaries. Provider response bodies are not retained as error evidence; only safe failure classes, normalized usage and hashes cross those boundaries.

## Whole-repository review

For a remote Windows repository, the fixed managed-node snapshot operation validates the configured root and Git ref, rejects tracked credential-like paths, records the source commit and dirty-state fingerprint, and returns a content-hashed `git archive`. The controller verifies the archive hash and path safety, extracts it read-only, and sends the frozen context to the selected provider execution node. Mutable working trees and credentials are not copied.

Routing exposes `workloadNodeId`, `providerExecutionNodeId`, and `credentialNodeId`. Qualification and invocation fail closed for a missing/unavailable credential node, disabled or unqualified account, wrong execution node, route identity mismatch, invalid snapshot, source/hash mismatch, or policy mismatch. Predetermined account fallback records every rejected candidate and reason; it is not quota-evasion rotation.

## Windows account status

The governed Windows runner discovers a valid Codex Desktop executable under `%LOCALAPPDATA%\OpenAI\Codex\bin\*\codex.exe`. `codex login status` runs as a supervised native process with finite input, node-local stdout/stderr files, a bounded lifetime, kill-on-timeout, and cleanup. Only a sanitized classification, CLI version, executable SHA-256, and timestamp return. An unauthenticated account reports `codex_chatgpt_auth_required`; raw process streams and paths never enter durable state.

See [Codex integration](models/CODEX-INTEGRATION.md), [adding a provider](models/ADDING-A-PROVIDER.md), [NVIDIA hosted models](models/NVIDIA-HOSTED.md), [provider/model lifecycle](provider-model-lifecycle.md), [token-aware baton routing](token-aware-baton-routing.md), and the [3.8.1 migration](migration-3.8.1.md).

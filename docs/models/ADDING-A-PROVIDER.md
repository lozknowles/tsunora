# Adding an external provider

1. Add a provider with a stable ID, base URL, wire API (`responses` or `chat-completions`) and optional discovery adapter.
2. Select an indirect credential reference; never put the credential value in JSON.
3. Add exact model entries, or enable governed catalogue discovery and review the returned IDs.
4. Add or update logical role mappings.
5. Provision the selected environment, file, isolated-home or secure-store reference; never pass a credential in an argument.
6. Qualify each model on every node where it may execute.
7. Test the intended role and fallback policy before using it in a Work Parcel.
8. Map provider-native techniques into normalized capability observations; do not add provider-name branches to core policy.
9. Queue the exact model/runtime candidate against the frozen qualification suite and review historical evidence before promotion.

Example provider:

```json
{
  "id": "external",
  "name": "External Responses provider",
  "kind": "openai-compatible",
  "enabled": true,
  "baseUrl": "https://provider.example/v1",
  "wireApi": "responses",
  "auth": {"type": "bearer-env", "env": "EXTERNAL_PROVIDER_API_KEY"},
  "capabilities": ["responses"]
}
```

Supported API references are `api-key-env` (or legacy-compatible `bearer-env`), `bearer-file-env`, and `provider-secure-store`. For a secret file, `auth.env` names an environment variable whose value is the absolute file path. For the generic owner-only store, configure an opaque `auth.reference`, then run `agent-control providers credential set external`. A missing or invalid selected reference fails closed before the provider request. `none` is appropriate only for an intentionally unauthenticated local endpoint. See [credential residency](../credential-residency.md).

An API account profile can carry a separate opaque secure-store reference. Manage it with the same command and `--account PROFILE_ID`; Agent Control refuses controller-side management or resolution when that profile belongs to another execution/credential node.

The configuration validator rejects duplicate IDs, unknown provider/model references, role cycles, malformed limits/pricing and embedded secret-like fields. A missing or invalid selected credential reference reports authentication required/invalid and makes qualification fail closed.

For a Codex CLI provider with more than one authenticated account, add `accountProfiles` beneath that provider, bind each profile to its execution `nodeId`, and bind every provider model to one `accountProfile` with a matching qualified node. Store only a `codex-home-env` reference; authenticate the corresponding home interactively on that node outside Agent Control. Account selection must be explicit workload policy or a predeclared role route. Do not add utilization-driven fallback intended to evade or pool usage/rate limits. See [Codex integration](CODEX-INTEGRATION.md).

Provider and model edits hot-reload through the authenticated dashboard/API. Do not treat a successful endpoint health check as model qualification: qualification requires bounded inference evidence for the exact provider model and node.

## Dynamic discovery

An OpenAI-compatible provider can opt into the generic catalogue:

```json
{
  "id": "external",
  "name": "External hosted models",
  "kind": "openai-compatible",
  "adapter": "openai-compatible-v1",
  "baseUrl": "https://provider.example/v1",
  "wireApi": "chat-completions",
  "auth": {"type": "provider-secure-store", "reference": "provider:external"},
  "discovery": {"enabled": true, "path": "models"},
  "requiresAuth": true
}
```

The adapter performs `GET {baseUrl}/{discovery.path}` with bounded authentication, validates an OpenAI-style model list and normalizes only authoritative or safely derived fields. Do not hard-code catalogue size, pricing, limits or capabilities. Unknown remains `UNKNOWN`. Discovery creates reviewable, routing-disabled models with inference state `UNTESTED`; it does not prove that the listed ID is accepted by the inference endpoint.

Use the generic staged funnel: one bounded streaming callability probe, then capability smoke only for `CONFIRMED` endpoints, then the frozen evaluation system only for promising reviewed candidates. Callability records HTTP acceptance, stream start, measured TTFT and pre-token versus mid-generation timeout without retaining raw output. Capability smoke retains requested budget, safe failure taxonomy, hashes and normalized measurements. An existing post-discovery passing callability result is reused instead of buying a duplicate basic-completion call. Prior runs remain history. Queue the exact dynamic model into the frozen evaluation system before considering it qualified.

A provider-specific adapter may constrain endpoint and credential syntax or normalize documented fields, but core catalogue, credentials, evidence, dashboard and routing policy must remain provider-neutral. The NVIDIA implementation is the worked example in [NVIDIA-HOSTED.md](NVIDIA-HOSTED.md).

For multiple API accounts, give each account profile its own credential-residency reference and bind each model to one account profile. Controller-local execution resolves only that profile's reference and seals `provider/account/model/node` in the result. It never falls back to the provider credential or another profile. Remote-resident API profiles require an explicit governed node adapter; controller-side resolution fails closed.

## Capability adapter boundary (3.9)

A provider adapter may observe a native feature such as caching, resume, structured tools, asynchronous interaction, browser/computer use or provider review. It must normalize that observation into Agent Control's capability record with:

- stable capability ID;
- exact provider/model/runtime/version subject;
- `SUPPORTED` or `UNSUPPORTED`;
- `NATIVE` or `AGENT_CONTROL_EMULATED`;
- `VERIFIED` or `UNVERIFIED`;
- observation/qualification timestamp, limitations and evidence references.

Keep provider API calls and event parsing inside the adapter. Core routing consumes only normalized capability/economic evidence. A configured declaration is not proof, and a provider claim does not bypass a frozen evaluator, independent verification, runtime safety or Work Parcel criteria. If Agent Control can provide a portable emulation, register and qualify it separately rather than pretending it is native.

Model-evaluation adapters must support only the evaluator classes they can genuinely execute. Unsupported browser, computer, workflow or tool fixtures return `CAPABILITY_UNAVAILABLE`; missing credentials return `AUTHENTICATION_UNAVAILABLE`; unreachable providers and failed scoring are separate. Never translate these into a zero score or a successful attempt. Preserve only sanitized output hashes and structured measurements, not prompts, credentials or raw untrusted provider output.

## 3.6 lifecycle registry

In 3.7, configuration remains the operator-facing definition while the [provider/model lifecycle registry](../provider-model-lifecycle.md) records session-neutral discovery, immutable model recipes, qualification evidence and versioned champion/challenger policy. Register the exact provider model and recipe version, then advance it in order through benchmark, shadow and candidate evidence before ACTIVE/PREFERRED routing. Do not mutate a recipe in place or promote a model from endpoint reachability alone. Automatic production Job adoption remains disabled until the larger frozen benchmark qualifies it.

The 3.9 historical evaluator complements that registry with append-only frozen-suite batches and a conservative `CANDIDATE/QUALIFIED/PREFERRED/DEGRADED/QUARANTINED/RETIRED` review state. These records provide evidence to an operator/policy transition; they do not silently rewrite role mappings.

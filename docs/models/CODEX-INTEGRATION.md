# Codex external-provider integration

Agent Control can invoke Codex with one registry-selected external model without editing the operator's normal Codex configuration.

## Isolated ChatGPT account profiles

A CLI provider can own multiple optional account profiles. Each stores only an opaque ID, safe friendly label, optional plan/capability metadata and its authority, a qualification state, a `providerExecutionNodeId`, and a `credentialResidency` containing a node plus environment-variable reference to a separately authenticated `CODEX_HOME`. It never stores an email address or any OAuth/access/refresh token, session cookie, resolved credential path, or authentication-file content. The repository/workload node is independent.

Create and authenticate each directory directly with Codex in an interactive terminal. Use operator-controlled absolute paths and do not put a token on the command line:

```bash
install -d -m 700 /srv/agent-control/codex/primary-pro /srv/agent-control/codex/secondary-plus
CODEX_HOME=/srv/agent-control/codex/primary-pro codex login
CODEX_HOME=/srv/agent-control/codex/secondary-plus codex login
export CODEX_HOME_PRIMARY_PRO=/srv/agent-control/codex/primary-pro
export CODEX_HOME_SECONDARY_PLUS=/srv/agent-control/codex/secondary-plus
```

For a remote Windows credential node, create and authenticate the profile directories in an interactive terminal on that Windows node, then define the named references in that Windows user's environment. Do not define those references to Windows paths on the controller. Agent Control resolves them only within the fixed remote runner:

```powershell
$env:CODEX_HOME = "$HOME\.local\share\agent-control\codex-profiles\account-a"
codex login
[Environment]::SetEnvironmentVariable('CODEX_HOME_ACCOUNT_A', $env:CODEX_HOME, 'User')
```

The corresponding provider/model configuration is:

```json
{
  "providers": [{
    "id": "codex-chatgpt",
    "kind": "cli",
    "accountProfiles": [
      {"id":"primary-pro","providerExecutionNodeId":"controller","credentialResidency":{"nodeId":"controller","store":{"type":"codex-home-env","env":"CODEX_HOME_PRIMARY_PRO"}},"label":"Primary Pro","plan":"ChatGPT Pro","planAuthority":"operator-configured"},
      {"id":"secondary-plus","providerExecutionNodeId":"controller","credentialResidency":{"nodeId":"controller","store":{"type":"codex-home-env","env":"CODEX_HOME_SECONDARY_PLUS"}},"label":"Secondary Plus","plan":"ChatGPT Plus","planAuthority":"operator-configured"}
    ]
  }],
  "models": [
    {"id":"spark-pro","provider":"codex-chatgpt","accountProfile":"primary-pro","providerModel":"gpt-5.3-codex-spark","nodes":["controller"],"capabilities":["trivial.coding"]},
    {"id":"spark-plus","provider":"codex-chatgpt","accountProfile":"secondary-plus","providerModel":"gpt-5.3-codex-spark","nodes":["controller"],"capabilities":["trivial.coding"]}
  ]
}
```

The example uses the exact Spark model identity supported by this release; availability still depends on the selected account and installed Codex CLI. Both locality node IDs must exist as Resources, and an account-bound model's `nodes` must include its provider-execution node, not the repository node. For other execution classes, use only exact model identities that have been independently qualified. After login, select **Models → Check account** or call `POST /api/models/accounts/{provider}/{account}/qualify` as an authenticated operator. Qualification dispatches to the profile's provider-execution/credential node and runs `codex login status` there. For Windows SSH resources, the fixed runner discovers candidates under `%LOCALAPPDATA%\OpenAI\Codex\bin\*\codex.exe`, validates `--version`, deterministically selects the newest valid candidate, and persists only CLI version, executable SHA-256 and discovery timestamp. A Saved Job can include `"accountProfile":"primary-pro"` in `routing`; its repository `node` remains the independent workload location. Otherwise the configured model role determines the account-bound model.

Agent Control never changes the process-global Codex login. Controller-local execution retains the cloned child environment path. Remote Windows execution uses the configured Resource SSH transport and `powershell.exe -NoProfile -NonInteractive -EncodedCommand` with a fixed bootstrap: the base64 request is one data line and the audited runner is the remainder of stdin. The bootstrap passes the request to the runner as an argument, so identities, prompts and schemas are never interpolated into PowerShell source. The typed port exposes only `accountStatus` and `execReadOnlyStructured`, not arbitrary shell execution. The Windows node resolves its own `CODEX_HOME` reference, and the adapter rejects any provider/account/model/execution-node/credential-node result that differs from the sealed route. Account-status and execution streams terminate in node-local files under bounded native-process supervision, preventing child pipe retention. Raw PowerShell stdout/stderr, full executable paths and resolved profile paths are not durable evidence. There is no automatic account rotation for quota/rate-limit avoidance; an exhausted profile fails visibly under its own opaque identity.

For the complete locality and migration contract, see [credential residency](../credential-residency.md) and [3.8.1 migration](../migration-3.8.1.md).

`materializeCodexModelConfig` creates a mode-0600 temporary `CODEX_HOME/config.toml` containing only:

- selected provider and provider-native model ID;
- provider display name and base URL;
- `wire_api = "responses"`;
- the approved credential environment-variable name;
- disabled history persistence.

The credential value remains in the process environment and is never written to configuration, output or evidence. `runCodexWithRegisteredModel` sets the temporary `CODEX_HOME`, asks Codex to load it, preserves the existing read-only/ephemeral execution envelope and removes the directory in `finally`.

Current Codex custom-provider configuration supports the Responses wire API. Agent Control therefore rejects a `chat-completions`-only provider for Codex instead of guessing an unsupported setting. The generic provider client can still use Chat Completions directly when configured.

This provider materialization does not bypass Agent Control policy. The model must first be qualified on the selected node, Work Parcel/Job routing records the exact selection, Codex may return only a schema-constrained request, and the existing live `ToolPolicy` gateway authorizes any tool execution.

The operator's existing `~/.codex/config.toml`, profiles and authentication files are neither copied nor modified.

## Immutable structured-review envelope

Account-bound repository review keeps authentication in the selected `CODEX_HOME` but launches Codex with a strict, ephemeral, read-only automation envelope. Controller-local and Windows-node implementations ignore mutable user configuration and exec-policy rules, set `project_doc_max_bytes=0`, disable shell/unified-exec/multi-agent plus web-search/browser/computer/app/image/workspace-dependency surfaces, and require the exact output schema. The generated external-provider configuration described above is the only path that loads a config file; it loads only that temporary mode-0600 file and retains the same project/tool restrictions.

Codex receives the fixed review instruction, one frozen context/Evidence Packet, optional rehydrated baton evidence and the stable schema. Opaque Evidence Packet and baton identifiers follow reusable content so they do not unnecessarily shorten a cacheable prefix. Temporary schema/config paths are local process details and are not rendered into the review text or durable evidence.

Agent Control 3.9 models that ordering with provider-neutral stable/volatile prompt blocks. The Codex CLI route consumes the rendered text unchanged because this client does not expose the Responses API's explicit cache controls. A direct Responses adapter may add a hashed cache key or explicit content breakpoint only when both the configured provider and exact model carry the independently qualified `prompt-cache.key` or `prompt-cache.explicit` capability. Do not add either capability merely because the provider has automatic caching. Cache reads and writes are different usage fields; unavailable cache-write telemetry and billed cost remain unavailable.

The current production path uses bounded `codex exec --ephemeral --json`; it does not use a persisted native Codex session. Provider prompt caching can still occur under ephemeral execution and is recorded only when Codex reports cached input. `turn.completed.usage` is cumulative consumption and may span internal model calls, so it is not used as current-context occupancy. Native resume, app-server continuation and compaction remain future adapter options, not core requirements; Work Parcels and sealed batons stay sufficient for recovery if no native session exists.

Local Codex execution runs through Agent Control's owned-process port. Cancellation or timeout terminates the captured Linux process group (or the qualified platform process-tree adapter) and returns cleanup evidence; a sent signal alone is not a successful terminal outcome. Parameterised review also persists an exact provider/account/model/node execution ID before invocation. On controller restart it must reconcile that identity through the execution port before resuming or accepting a result, and it never opens a second Codex attempt while the first remains unknown.

Codex-internal tool actions are not individually authorized by Agent Control `ToolPolicy`. This review adapter therefore disables the known action-capable native surfaces and retains observed JSONL item types as post-run evidence. A returned Agent Control tool request on the separate harness path still enters `ToolPolicy`; these are distinct boundaries.

## Fast execution

The separate `CodexFastExecutionRunner` is a mutation-capable, more tightly bounded path for the generic `FAST_EXECUTION_MODEL` class. It is not a broader version of this schema-constrained read-only tool-request provider. The execution hierarchy is `LOCAL → SPARK → STANDARD → FRONTIER`; THIN remains a harness/context profile, not a model alias. The route requires a disposable clean Git worktree, exact model-registry selection, a sealed one-file baton, one attempt, disabled multi-agent fan-out and independent Git/test verification.

Spark availability is proved with an authenticated bounded `codex exec --model gpt-5.3-codex-spark` invocation expecting an exact fixed response. The mutation runner then uses explicit `--model gpt-5.3-codex-spark`, `--ignore-user-config`, `--sandbox workspace-write`, JSONL/output-schema controls and a one-attempt policy. If exact availability or routing fails, Agent Control records the reason and may create a visible STANDARD handoff; it never silently substitutes a different model while reporting SPARK.

On qualified `codex-cli 0.144.4`, the current documented `agents.enabled=false` boolean is rejected because that client expects an `AgentRoleToml` object. A bounded direct test confirmed `features.multi_agent=false`, and 3.5 uses that installed-client compatibility switch. After any Codex CLI update, run `codex --version`, `codex login status` and `npm run benchmark:fast-execution` before the live benchmark. A changed configuration schema must be requalified in code, tests and documentation; do not remove the no-fan-out control merely to make an invocation start. See [`../fast-execution.md`](../fast-execution.md).

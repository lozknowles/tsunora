# Token-Aware Command Output

## Architecture decision

Status: accepted for the `feature/token-aware-command-output-20260827` implementation.

Agent Control will intercept command-shaped tool results at the existing `ToolHandlerRegistry` boundary. This is the last control-plane boundary after live tool, lease, ownership, worker, and approval checks and before raw handler output becomes model-visible. The interception is therefore shared by local and remote execution backends and does not create another scheduler, command runner, or authority path.

The control plane will first retain the authoritative captured result, including stdout, stderr, exit status, command identity, timestamps, execution backend, result hash, and authority scope. It will then derive the smallest useful model-facing representation:

```text
authorised tool invocation
        |
        v
local or remote command backend
        |
        v
authoritative captured result artifact
        |
        +-- summary (level 0)
        +-- match index (level 1)
        +-- selected captured context (level 2)
        +-- full captured result (level 3)
                    |
                    v
            model-facing context
```

The authoritative artifact is the source of truth. Summary, index, and excerpts are explicitly marked as derived context and carry its SHA-256 provenance. A compact representation never masquerades as complete output. stderr and exit status remain visible independently of stdout policy.

Expansion is a separately allowlisted read operation. A handle is bound to the task, lane, worker, lease generation, ownership generation, and original command result. Expansion can only select bytes and parsed records already present in that result. It cannot turn a handle into a repository or filesystem read primitive. Expired, unknown, mismatched, or cancelled requests fail closed.

## Components

- `TokenAwareOutputService` classifies, stores, compacts, expands, and accounts for command output.
- `CommandResultStore` retains authoritative artifacts and handle metadata with bounded lifetimes.
- `RipgrepSearchRunner` produces and consumes ripgrep JSON output, preserving raw match data while deriving file, line, and match indexes.
- `createTokenAwareToolResultInterceptor` plugs into `ToolHandlerRegistry` without exposing raw handlers to agents.
- Typed tools provide repository search and expansion. They do not provide an unrestricted shell.
- `ContextRouter` selects among advertised progressive representations using the current request and available token budget.
- API and dashboard projections expose safe metadata and token-avoidance telemetry; they do not expose managed storage paths.

## Policy defaults

Defaults are deliberately based on output size, not command name alone:

- complete: at most 48 lines, 12 KiB, and 4,096 estimated tokens;
- indexed ripgrep: larger search output, with a bounded 160-file initial index;
- generic compact fallback: bounded head and tail excerpts for oversized stdout;
- artifact-only initial response: when even a useful compact representation exceeds 16,384 returned tokens;
- authoritative artifact limit: 64 MiB per stream;
- retention: 60 minutes;
- token estimate: conservative and deterministic, `ceil(UTF-8 bytes / 3)`.

Every threshold is configurable, and a known remaining model-context budget can lower the initial representation. Small output remains complete even when produced by ripgrep.

`estimatedOriginalTokens` applies to captured stdout/stderr. `estimatedReturnedTokens` conservatively accounts for the structured model-facing envelope, including its bounded index, result identity, authority scope and provenance; it is not limited to the visible `stdout` field. Expansion accounting uses the same rule.

## ripgrep execution

Repository search is a typed, read-only operation. It accepts a query, bounded workspace-relative paths and glob filters, and a bounded captured-context setting. It invokes ripgrep without a shell and requests JSON output for structured paths, line numbers, Unicode, binary-file notices, and summary statistics. The original JSON stream is retained. The model initially receives full output for a small search or a compact index for a larger search.

The execution backend supplies the workspace boundary. Local boundaries canonicalise real paths and reject escapes; a remote backend can authorise its own repository root without requiring that path to exist on the controller.

Selected expansion is reconstructed from captured match/context records. Full expansion returns the exact retained stdout. If requested surrounding lines were not part of the authorised original result, the service reports that they are unavailable instead of reading arbitrary files.

## Generic output

Any existing authorised backend can return the neutral command-result envelope. The same interceptor applies size and context-budget policy. For non-specialised oversized stdout it returns a labelled summary plus bounded head/tail excerpts and a handle to the full artifact. Additional adapters such as `git diff`, compilers, and test runners can later add semantic indexes without changing execution or policy boundaries.

## Semantic and security guarantees

- `COMPLETE`, `COMPACTED`, `TRUNCATED`, and `ARTIFACT_ONLY` are distinct states.
- `TRUNCATED` is used only when the configured capture/storage boundary means the full result was not retained.
- stdout derivation never suppresses stderr, warnings, cancellation, timeout, or non-zero exit status.
- command execution remains subject to normal capability routing, tool allowlisting, live authority checks, leases, cancellation, and human takeover.
- a remote node executes authorised work; it cannot grant itself output-expansion authority.
- handles contain no host paths or credentials and API projections omit storage locations.
- provenance links every derived representation to the authoritative result hash and execution scope.

## Threat model

| Threat | Control |
| --- | --- |
| Handle guessing or replay | Random temporary handle plus exact task, lane, worker, lease-generation and ownership-generation match; expired or stale scope fails closed. |
| Arbitrary repository/file read | Expansion selectors are checked against paths and match lines already captured in the result. Remote/local workspace boundaries are authorised by the execution backend. |
| Tool or approval bypass | Both search and expansion are `read` tools granted by `ToolPolicy`; the gateway rechecks current worker, capability, revocation, lease, ownership and human takeover before the raw handler. |
| Result tampering | SHA-256 covers the retained command envelope; the file store uses private state files and validates handle/object identity when loading. |
| Output/context exhaustion | Per-stream capture, complete/index/artifact thresholds, expansion-context, selector-count, timeout and request-body limits are bounded and configurable. Crossing the capture boundary becomes explicit `TRUNCATED`, never silent completeness. |
| Hidden error or failed command | stderr, exit status, timeout and cancellation are independent fields and remain visible when stdout is compacted. |
| Compromised remote worker gaining authority | Remote backends return data only. They cannot mint a matching Agent Control scope, grant capabilities, alter leases or change output policy. |
| Offline/reconnect ambiguity | A retained result may be expanded without re-execution until expiry. Expansion neither reconnects nor assumes the remote process still exists. |
| Credential leakage | The typed ripgrep tool accepts no credential field or shell arguments. Artifact files are private to the Agent Control state directory and safe API projections omit arguments, stdout/stderr and storage paths. Existing generic command handlers remain responsible for never putting credentials in command arguments. |

An authenticated dashboard operator still supplies the retained scope for expansion; operator authentication alone does not erase the result's ownership boundary. Human takeover changes ownership generation, so an agent's prior handle stops expanding through its stale recipe.

## Agent workflow

Agents use `Inspect -> Expand -> Read`:

1. Inspect the initial complete result, summary, or match index.
2. Expand only selected files, matches, or captured line ranges.
3. Request the complete retained result when semantic certainty requires it.

This workflow is exposed by typed capability, not prompt convention alone.

Canonical capabilities are `repository.search`, `command.output.progressive` and `command.output.expand`. The corresponding read tools are `repository.search.ripgrep` and `command.output.expand`; recipes must grant the tools as usual.

## Limitations

- Token estimates are provider-neutral approximations, not provider billing counts.
- Selected surrounding context is limited to context captured by the authorised search.
- Results above the configured artifact limit are explicitly truncated and cannot be fully expanded.
- The first semantic adapter is ripgrep; other command families use the generic fallback until an adapter is added.
- Structured JSON carries overhead for a tiny typed search. Such output remains complete rather than being compacted; an already captured conventional small `rg -n` result passes through byte-for-byte.

# Universal Agent Control status command

`agent-control status` is the single read-only status command for controllers and workers. It reads the versioned `AgentControlService` projection returned by `GET /api/status`, which is the same projection used by the web dashboard. It does not run a second set of local fleet probes or infer control-plane state from the node on which the command happens to run.

## Command contract

```text
agent-control status
agent-control status --json
```

The default view includes overall health, observation time, scheduler state, Job totals, outstanding approvals, lanes, providers, and resource health/capacity from the dashboard's Worker Registry. Managed resources also show the same node state, heartbeat, OS/kernel, uptime, load, memory, current workload, maintenance state, secure-overlay connectivity, storage and discovered capabilities as the dashboard's Managed Nodes panel. `--json` prints the exact dashboard status projection. Exit status is `0` for `healthy`, `1` for a reachable `degraded` projection and `2` when the authoritative projection cannot be read or validated.

Install the package command once on each control-plane node from the reviewed source checkout:

```bash
npm link
```

Node.js creates the appropriate `agent-control` executable or Windows command shim. This source installation step is separate from deploying a controller process or claiming live qualification on a physical node.

## Controller

On the controller, no client configuration is required when the dashboard uses its default localhost listener. The command reads `http://127.0.0.1:4310/api/status`. `AGENT_CONTROL_WEB_PORT` is respected.

The authoritative process must be running through either the TUI or the headless web entrypoint. If it is not running, the command reports `UNREACHABLE`; it does not substitute the older bootstrap probe and mislabel that different data as dashboard state.

The previous service/resource bootstrap inspection remains available as:

```text
npm run status:bootstrap
```

## Worker nodes

Workers use a node-scoped, non-secret status client file. The default path is `$XDG_CONFIG_HOME/agent-control/status-client.json` or `~/.config/agent-control/status-client.json` on Linux/Android, and `%APPDATA%\Agent Control\status-client.json` on Windows. Override it with `AGENT_CONTROL_STATUS_CONFIG`.

```json
{
  "schema": "agent-control.status-client/v1",
  "controller": {
    "transport": "ssh",
    "host": "controller.tailnet.example",
    "user": "operator",
    "port": 22,
    "statusPort": 4310
  }
}
```

The SSH transport uses `BatchMode=yes`, disables password authentication and runs one fixed `curl` GET against the controller's localhost dashboard endpoint. The dashboard stays bound to localhost; no listener, operator token or status credential is exposed to the worker network. This works with SSH servers that prohibit TCP forwarding. An existing SSH agent/default identity may be used, or `identityFile` may name an existing key. The configuration rejects secret-like fields and permits the read to target only controller-local `127.0.0.1` or `localhost`.

For an already protected HTTPS observer endpoint, configure `transport: "http"` and its full `url` instead. URLs containing embedded credentials are rejected.

Environment overrides are available for managed node provisioning: `AGENT_CONTROL_STATUS_URL`, or `AGENT_CONTROL_STATUS_SSH_HOST` with optional `AGENT_CONTROL_STATUS_SSH_USER`, `AGENT_CONTROL_STATUS_SSH_PORT`, `AGENT_CONTROL_STATUS_SSH_IDENTITY_FILE`, `AGENT_CONTROL_STATUS_REMOTE_PORT`, `AGENT_CONTROL_STATUS_REMOTE_PATH` and `AGENT_CONTROL_STATUS_TIMEOUT_MS`. Once provisioned, the operator command remains identical on every node.

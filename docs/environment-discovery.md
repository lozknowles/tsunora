# Setup and Environment Discovery

Status: **experimental capability in the Agent Control 4.5.1 release**.
Environment Discovery is read-only by default. The controller-local identity
and supported-upgrade correction are production-qualified in 4.5.1.
Desired-state estate management and automatic remediation are deferred to 4.6.

## What it does

Start Agent Control with a private `AGENT_CONTROL_WEB_OPERATOR_TOKEN` of at least
32 characters using the hidden-prompt procedure in the repository README. Open
the dashboard, click the top-right operator button and enter that same token.
Confirm the button reads **Operator authenticated**, then open **Environment
Discovery** from the dashboard Settings area. An observer-only process can view
safe status but cannot start a scan.

The wizard
supports First Run, Quick Rescan, Full Discovery, Add Machine, Add Provider, Add
Local Runtime, Add Model and Import Configuration. A scan records non-secret
inventory and provenance, compares it with the prior scan and labels resources
`NEW`, `CHANGED`, `REMOVED`, `OFFLINE`, `AUTHENTICATION CHANGED`, `MODEL UPDATED`
or `ENDPOINT CHANGED`.
When a previously missing or offline resource is observed healthy again, it is
`CHANGED`; recovery is never reported as unchanged merely because its static
metadata fingerprint is the same.

Local adapters inspect the controller OS, CPU, RAM, filesystems, accelerators,
known inference endpoints, installed executables, configured providers and
credentials, workers, Jobs, tools, skills and optional Your Memories source.
Known runtime adapters include llama.cpp, Ollama, LM Studio, vLLM, Codex, Claude
Code and Gemini CLI. Presence of a file is not health, authentication or model
qualification. Provider-neutral adapters classify resources as models, model or
agent runtimes, CLI agents, tool/MCP servers, execution environments,
transports and providers.

Configured Android/iOS/edge observations enter through `EdgeDiscoveryObservation`.
The transport adapter must supply authoritative device/runtime/model evidence;
core does not depend on ADB, Tailscale, ZeroTier or a companion implementation.
Remote discovery runs only when the operator selects it and only against known,
configured resources. There is no uncontrolled network scan, Funnel enablement,
firewall mutation or service start.

## Qualification and apply boundary

The stages are deliberately separate:

```text
DISCOVERED → QUALIFIED → RECOMMENDED → APPROVED → ACTIVE
```

Choose Skip Testing, Quick Test or Full Qualification. Full Qualification must
delegate to the existing model qualification framework. Tests that incur cost,
authenticate, start a service or alter state require approval; a smoke response
cannot activate a route. Recommendations consider only appropriately qualified
records. Selecting a material recommendation creates a revision-bound proposal;
approval creates a normal governed Work Parcel. A stale configuration revision
or changed proposal hash fails closed.

## User-defined capabilities

**Add Capability** accepts a local or remote executable reference, endpoint or
declarative resource without moving it. Definitions follow:

```text
DRAFT → REVIEWED → VALIDATED → TESTED → APPROVED → ENABLED
```

Only fixed `--version` and bounded HTTP health probes are presently admitted.
The registry never grants arbitrary shell commands. Community imports are
untrusted, executable contracts and qualification commands are stripped, and
machine bindings remain deployment-local. Exported definitions contain no
machine path, endpoint binding or credential. An enabled adapter contributes to
the same discovery inventory; it does not bypass ordinary qualification or
routing governance.

## Process Map and Estate Map

The existing Runtime Map renderer has two modes:

- **Process Map** — what Agent Control is doing right now;
- **Estate Map** — what Agent Control can see and use right now.

Both use `agent-control.runtime-map/v1`, shared layout, pan/zoom, progressive
collapse, search/filter, inspector and evidence conventions. Estate topology is
projected from the latest governed scan; relationships are created only from
explicit node, provider, runtime or `relatedIds` evidence. Selecting a transport
edge shows source, destination, address, port, username, authentication method,
credential status, health and last verification when authorised.

When one parent has four or more resources of the same kind, Estate Map derives
an evidence-linked category group and initially collapses it. The group is a
view-only summary, is labelled as derived, does not increase the resource count
and never changes the discovery inventory. Expanding it restores every observed
resource in a bounded wrapped layout.

Discovery is not aliveness. Machines/agents use short heartbeat windows;
runtimes/endpoints use bounded service-health windows; models require recent
runtime availability; static hardware metadata has a longer inventory window.
Stale resources remain visible but are labelled **NOT CURRENTLY VERIFIED**.
Cloud models are never invoked solely for heartbeat. The compact Estate summary
counts currently evidenced devices, transports, runtimes, models and agents.
An `ACTIVE` configuration or capability lifecycle means enabled/available; it
does not render as running work. Estate nodes show `RUNNING` only when a current
observation explicitly reports a running, busy or in-use workload.

Worker placement uses the same trusted execution identity as runtime safety.
Agent Control-owned in-process workers are attached to their controller resource;
configured workers derive locality from validated transport. Estate does not
turn a worker into a remote machine merely because its ID differs from the
controller ID, and it does not accept names or self-declared labels as locality
authority. Unknown relationships remain unknown rather than being guessed.

Credential values never enter graph payloads. The client receives status and a
fixed `••••••••••••` mask only; its length has no relationship to a credential.
There is no reveal control.

## Installation and bootstrap

Under **Settings → Installation**, select Existing Checkout, Fresh Install,
Update, Repair or Developer Install and a Control/Worker role. Inspection records
repository provenance, clean/divergent state, required prerequisites and
dashboard/configuration presence without changing the checkout.

Portable entry points:

```bash
./scripts/bootstrap-agent-control.sh --check --target /path/to/agent-control
./scripts/bootstrap-agent-control.sh --install --role control --target /path/to/agent-control
```

```powershell
.\scripts\bootstrap-agent-control.ps1 -Mode check -Target C:\path\to\agent-control
```

The repository intentionally has no package lock or build step. Install mode
uses `npm install --ignore-scripts --no-package-lock`, then the existing
idempotent `npm run init`. Dirty or diverged repositories stop; bootstrap does
not pull, reset, overwrite config or install optional model runtimes. Repair
reports the boundary and leaves the operator to choose a reviewed recovery
action.

## Security and limitations

The persisted inventory and capability registry pass the same server-side
redaction boundary as evidence. Environment values are checked only for presence;
credential references are retained instead of values. Imported definitions are
untrusted. The current physical qualification is controller-local and
non-disruptive; remote/mobile adapters, paid provider verification and every
third-party CLI authentication state require estate-specific qualification and
must not be inferred from deterministic fixtures.

Run focused checks with:

```bash
node --test --import tsx src/control/environment-discovery.test.ts \
  src/control/capability-adapter-registry.test.ts \
  src/control/estate-map.test.ts src/control/installation-lifecycle.test.ts
npm run qualify:environment-discovery
```

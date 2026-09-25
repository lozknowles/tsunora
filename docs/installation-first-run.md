# Install Agent Control 4.10.0

[Documentation](index.md) · [README](../README.md) · [Existing installation upgrade](upgrade-4.10.md)

This guide targets **Agent Control 4.10.0**. See the [release verification](release-verification-4.10.0.md), [release notes](release-notes-4.10.0.md), [nested execution guide](nested-execution-environments.md), and [known 4.7 foundation limitations](known-limitations-4.7.md).

## Prerequisites

Required for the Linux journey below: **Node.js 24**, npm, Git, Bash, a browser, and outbound access to GitHub and the npm registry.

Optional capabilities: GPU telemetry, Ollama, llama.cpp, Codex, configured API providers, remote transports, mobile nodes and Home Assistant. None is required to start the dashboard or complete the provider-free observation job.

Linux is the physically tested journey in this report. Other platform bootstrap scripts exist; this report does not claim a new physical Windows, macOS or Android installation test.

## Clone and install

Use a new directory rather than an existing dirty checkout.

```bash
git clone --branch v4.10.0 https://github.com/lozknowles/agent-control.git
cd agent-control
git rev-parse HEAD
./scripts/bootstrap-agent-control.sh --check --target "$PWD"
./scripts/bootstrap-agent-control.sh --install --role control --target "$PWD"
```

Record the printed commit. The branch can advance. Bootstrap checks the repository, installs dependencies without lifecycle scripts, and creates or preserves local configuration. Keep the terminal open.

## Start

Choose a private operator token of at least 32 characters and save it in your password manager. Enter it at the hidden prompt:

```bash
read -rsp "Agent Control operator token: " AGENT_CONTROL_WEB_OPERATOR_TOKEN
printf '\n'
export AGENT_CONTROL_WEB_OPERATOR_TOKEN
npm run web
```

Open **http://127.0.0.1:4310**. Keep this terminal running; Ctrl+C stops this foreground instance. Restart with the same token. Do not start another controller against the same state directory.

## What you should see

[Actual first dashboard](provenance/EXTERNAL-EVIDENCE.md)

The Dashboard welcomes you and offers **Authenticate to start discovery**, followed by **Discover my environment** after authentication. A fresh installation has no scan history or completed work. Mallow is the floating guide; crew presentation is not evidence that extra workers are executing.

Primary navigation leads to jobs, maps, models, usage, discovery and Mallow. The welcome guide can be dismissed and reopened. [See the real first-load screen](public-installation-journey.md#a--first-dashboard).

## Discover your environment

1. Select **Authenticate to start discovery** and enter the operator token you used at startup.
2. Select **Discover my environment**.
3. Review the discovery form. Keep remote probing disabled for this first local scan.
4. Start the scan and watch its progress.
5. Review the completed results, then open **Estate Map**.

Discovery inspects supported hardware, agents, runtimes, local model locations, provider configuration, transports and integrations. Availability depends on what is installed and authorised. Finding a configuration reference does not authenticate a provider or qualify a model. Do not paste credentials into Mallow or a public report.

[Setup, live progress and completed results](public-installation-journey.md#b--setup-and-discovery).

[Discovery setup before the first scan](provenance/EXTERNAL-EVIDENCE.md)

[Actual discovery in progress](provenance/EXTERNAL-EVIDENCE.md)

[Actual completed discovery](provenance/EXTERNAL-EVIDENCE.md)

The progress capture uses a CPU-constrained disposable container; no status was simulated.

### Understand discovery status

| Status | Meaning |
| --- | --- |
| Checking | A supported probe is running. |
| Found | A resource was detected; usability still needs evidence. |
| Alive | Recent evidence confirms the resource is reachable or operating. |
| Authentication required | Access needs an authorised credential/configuration. |
| Qualification required | A relevant capability has not yet passed its required checks. |
| Offline | A check could not reach the resource. |
| Stale | Earlier evidence is too old to establish current health. |
| Failed | The check failed; open the result for the actual reason. |

## See what Agent Control can use

**Estate Map shows what Agent Control knows about and what is alive or available.** Nodes represent machines, workers, agents, runtimes, models, providers and transports. Relationships show where they belong or what they depend on.

Colour and status text convey health/readiness: green has supporting availability evidence; orange needs attention; red reports failure; grey lacks current proof. Read the inspector rather than relying only on colour. **Discovered does not mean currently alive.** Active registration alone does not mean work is running.

[Actual Estate Map](provenance/EXTERNAL-EVIDENCE.md)

Select a resource to see evidence, identity, gaps and related work. [Estate and inspector screenshots](public-installation-journey.md#e--estate-and-inspector).

## Watch Agent Control work

Use this provider-free first job; it needs no paid API or model download:

1. Open **Mallow** and send: `Start operator-system-observation@1.1.0`.
2. Review the proposed job and its read-only scope.
3. Expand **Jobs, schedules, approvals & evidence** and select **Approve this job**.
4. Open its job detail and **Process Map**. Wait for observation and verification to finish.
5. Check the final status and evidence. The expected result is **SUCCEEDED**.

**Process Map shows what Agent Control is doing.** Estate shows what it has available. Process worker/resource links lead back to the Estate inspector. [Actual governed execution](public-installation-journey.md#g--process-map).

[Actual completed observation job](provenance/EXTERNAL-EVIDENCE.md)

This deterministic observation job does not invoke an LLM. An empty Usage view after it is expected.

## Understand usage and efficiency

Open **Usage** for recorded calls, model/provider, input/output tokens, cache evidence, retries, local/API execution and historical breakdowns. Costs appear only where evidence supports them. **Missing billing evidence is not zero cost.**

[Current Usage dashboard with sealed physical history](provenance/EXTERNAL-EVIDENCE.md)

The [Usage screenshot](public-installation-journey.md#h--usage-and-cost) comes from separate physical local-inference qualification, not fabricated first-run records.

## Local AI energy

Energy views distinguish measured power, derived interval energy and unavailable evidence. They show component scope and coverage. Normal physical runs reached **100%** coverage; a controlled sampling gap reached **66.96%**, excluding unmeasured intervals.

[Real component energy evidence](provenance/EXTERNAL-EVIDENCE.md)

The [real Energy example](public-installation-journey.md#i--energy) is shared-GPU component evidence. It is not attributable job energy, whole-node electricity or cloud energy. Billing, positive cache billing, attribution, tariff and whole-node gates remain **BLOCKED_EXTERNAL**. [Detailed limitations](usage-energy-physical-closure-4.6.md).

## Meet the crew

[Mallow and the crew](crew-guide.md) explain the interface. Their established artwork and roles remain intact; actions still require real jobs, permissions and evidence.

## Troubleshooting

| Symptom | Next step |
| --- | --- |
| Dashboard does not open | Check that `npm run web` is still running and use the printed loopback URL. Verify Node.js 24 and successful bootstrap. |
| Port already in use | Stop your own earlier instance, or set `AGENT_CONTROL_WEB_PORT=4311` before starting this instance and open port 4311. Do not stop an unknown service. |
| Authentication required | Enter the token used to start this instance. Restart your own foreground instance with a known private token if needed. |
| Discovery finds no models / Codex | Install or configure optional tools only if wanted. A working dashboard does not require them. Rerun discovery after an authorised change. |
| Remote resource unavailable | Check its configured transport and authorisation. The local first scan leaves remote probing disabled. |
| Estate resource stale | Refresh discovery and inspect its latest check. Old discovery evidence is not current liveness. |
| GPU not detected | Inspect the host's existing hardware/driver telemetry; containers may not expose a host GPU. Do not infer power from utilisation. |
| Upgrade job blocked as remote | Use the qualified release path in the upgrade guide; preserve identity/configuration and inspect the denial rather than weakening safety rules. |

Keep the dashboard on loopback for this journey. No public firewall opening is needed.

[Upgrade safely](upgrade-4.10.md) · [All documentation](index.md) · [Release verification](release-verification-4.10.0.md)

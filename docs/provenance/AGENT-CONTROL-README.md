<p align="center">
  <img src="docs/media/branding/agent-control-atlas-header.png" alt="Agent Control ATLAS — Agentic Topology, Lifecycle, Assurance &amp; Supervision" width="100%">
</p>

# Agent Control ATLAS

Agent Control can execute digest-bound [Agent Control Lab agent templates](../../docs/agent-templates.md) through its existing Work Parcel and Job Runtime path. Templates declare specialist instructions and requirements; runtime policy remains authoritative.

**Agentic Topology, Lifecycle, Assurance & Supervision**

**See the work. Govern the execution.**

ATLAS is Agent Control's public identity: **Agentic Topology, Lifecycle, Assurance & Supervision** reflects its role in mapping an AI estate, following governed work through its lifecycle, preserving assurance and evidence, and keeping execution under human supervision. Agent Control remains the product, repository and package name.

*The ATLAS hero is branding artwork; product screenshots below are genuine Agent Control captures.*

<a id="agent-control-48"></a>

Discover your AI tools, see what is available, and follow approved work from request to verified result.

**Prepared candidate: 4.13.0 — governed Estate, Factory observation and historical diagnostics.** See [candidate notes](../../docs/release-notes-4.13.0.md), [installation/upgrade/rollback](../../docs/upgrade-4.13.md) and [qualification boundaries](../../docs/release-verification-4.13.0.md). Publication is pending approval.

**Latest published release: [4.12.1](https://github.com/lozknowles/agent-control/releases/tag/v4.12.1) — Dashboard Navigation and Recovery Visibility.** This patch adds authoritative workspace search, durable favourites, governed WATCH entry, containment/recovery history, evidence-backed project and repository navigation, and protected artifact viewing. It preserves the 4.12 native runtime and governed cost-routing model. See the [workspace guide](../../docs/navigable-workspaces.md), [release notes](../../docs/release-notes-4.12.1.md), [upgrade guide](../../docs/upgrade-4.12.1.md), and [release verification](../../docs/release-verification-4.12.1.md).

The release also incorporates the qualified 4.9 reliability safeguards: governed raw inference, explicit local/API usage accounting, live-writer-safe activity-log repair, protected workspace metadata and cancellation fencing before abort. The optional phone-hosted planning route remains experimental and has no physical end-to-end qualification.

**4.8 workspace navigation:** [Operator guide, CLI and API](../../docs/navigable-workspaces.md) · [Architectural review and Rune comparison](../../NAVIGABLE_WORKSPACES_REVIEW.md) · [Visual evidence](EXTERNAL-EVIDENCE.md). Navigation does not grant execution authority or create a second topology.

**4.8 nested execution:** [Follow work through nested environments](../../docs/nested-execution-environments.md) from a physical device through host/guest environments, runtime and worker route to the exact invocation and evidence. Nested capacity is scoped and is never added to physical Estate capacity.

[Install Agent Control](../../docs/installation-first-run.md) · [Documentation](../../docs/index.md) · [Upgrade](../../docs/upgrade-4.12.1.md) · [Release notes](../../docs/release-notes-4.12.1.md)

[![Actual Agent Control Estate Map](EXTERNAL-EVIDENCE.md)](../../docs/public-installation-journey.md)

Screenshots below preserve genuine qualification captures. The [historical RC overview](EXTERNAL-EVIDENCE.md) remains available as evidence; its candidate label describes the capture stage.

## Android standalone

**Android phone → Termux → Agent Control → local dashboard → Discovery → Estate → local job.**

Run the Agent Control controller on an Android phone in Termux, with a local browser dashboard and governed local jobs. No Agent Control APK, root or remote controller is required for the verified base path. Mallow and the crew remain available.

**Base installation: PASS WITH LIMITATIONS. Optional Android model download, inference and benchmark league: unfinished, unqualified and non-blocking for the base release.**

[Run Agent Control on Android](../../docs/android-standalone.md) · [Physical qualification](../../docs/android-standalone-qualification.md)

<img src="docs/media/4.6/android/android-local-dashboard.png" width="260" alt="Actual Android-hosted Agent Control dashboard"> <img src="docs/media/4.6/android/android-crew.png" width="260" alt="Crew and Mallow on the physical Pixel">


## Discover → Observe → Run → Understand → Control

- **Discover** supported machines, agents, runtimes, models and integrations already in your environment.
- **Observe** what is alive and available in the graphical Estate Map.
- **Run** authorised jobs and follow their steps and evidence in Process Map.
- **Understand** calls, tokens, retries, cache, cost availability and local component energy.
- **Control** work through permissions, policies, readiness checks and explicit approvals.

Mallow is your floating guide. The established crew helps explain dispatch, review, tools, model routing, resources and verification. [Meet the crew](../../docs/crew-guide.md).

<a id="install"></a>

## Install Agent Control 4.12.1

Install on Linux with Node.js 24, npm, Git and Bash:

```bash
git clone --branch v4.12.1 https://github.com/lozknowles/agent-control.git
cd agent-control
git rev-parse HEAD
./scripts/bootstrap-agent-control.sh --check --target "$PWD"
./scripts/bootstrap-agent-control.sh --install --role control --target "$PWD"
read -rsp "Agent Control operator token: " AGENT_CONTROL_WEB_OPERATOR_TOKEN
printf '\n'
export AGENT_CONTROL_WEB_OPERATOR_TOKEN
npm run web
```

Choose a private operator token of at least 32 characters and keep it in your password manager. Open **http://127.0.0.1:4310**, select **Authenticate to start discovery**, and enter that token. Then select **Discover my environment**. Follow the [illustrated installation guide](../../docs/installation-first-run.md) through Discovery and the first governed job.

A GPU, model server, paid API, Codex, VPN and Home Assistant are optional capabilities, not dashboard prerequisites.

[Actual first dashboard](EXTERNAL-EVIDENCE.md)

## See what is available; follow what is happening

**Estate Map** shows known resources, relationships and current health. Discovered does not mean alive, authenticated or qualified. Select a resource to inspect its evidence and gaps.

**Process Map** shows an actual job's execution and result. Job and worker links connect work back to its Estate resources.

The [real installation journey](../../docs/public-installation-journey.md) shows the first screen, discovery progress, results, Estate, Process and Mallow. Screenshots are captured from the running product, not generated UI.

[![Actual Estate Map](EXTERNAL-EVIDENCE.md)](../../docs/public-installation-journey.md#e--estate-and-inspector)

## Understand usage and local energy

[Actual Usage dashboard from physical qualification](EXTERNAL-EVIDENCE.md)

Usage records distinguish model/provider, local/API execution, tokens, cache evidence, retries and billing availability. **Missing billing evidence is not zero cost.** Subscription-included Codex is non-metered for monetary billing qualification.

**Usage & Energy: PASS WITH LIMITATIONS.** Local token accounting, inference semantics and component interval energy have physical evidence. Normal runs had 100% measurement coverage; a controlled sampling gap had 66.96% coverage, with missing intervals excluded.

Metered API billing, positive physical cache billing, attributable job/baseline energy, physical tariff qualification and whole-node electricity remain **BLOCKED_EXTERNAL**. Component measurements do not establish whole-node or cloud energy. [Physical evidence and limitations](../../docs/usage-energy-physical-closure-4.6.md).

## Start with a small job

The [public Job Library](https://github.com/lozknowles/agent-control-jobs) contains simple objectives such as reviewing a change or diagnosing a service. Estate-based readiness identifies required configuration, connectors, credentials and approval. Contributions should remain understandable without learning Agent Control internals.

Model Intelligence now reports real source coverage, initial versus follow-up observations and evidence-backed next steps. The manual demonstration found 17 initial artifact observations and two reviewed candidates; it did not benchmark them. Target-model execution still awaits exact-plan approval. Overnight-duration qualification is a documented non-blocking limitation.

[Real Model Intelligence baseline and approval boundary](EXTERNAL-EVIDENCE.md)

[Accepted RC assessment](../../docs/release-candidate-4.6.md) · [Real source runs and Morning Brief](../../examples/showcase-4.6/release-integration/real-intelligence.json) · [Known Limitations and HELP WANTED](../../docs/known-limitations-4.6.md)

## Learn more

- [Android / fresh Termux prerequisites](../../android/README.md#fresh-termux-prerequisites) (separate platform guide)
- [Installation and troubleshooting](../../docs/installation-first-run.md#troubleshooting)
- [Safe existing-install upgrade](../../docs/upgrade-4.12.1.md)
- [Architecture](../../docs/architecture-v2-agnostic.md)
- [Governed cost and performance routing](../../docs/cost-aware-openrouter-routing.md) — provider-neutral budgets and rate ceilings with an optional OpenRouter translation
- [Governed Model Improvement](../../docs/model-improvement.md) — immutable baselines, isolated candidates, independent evaluation, Work Board stages and explicit promotion approval
- [4.11 promotion and rollback qualification](../../docs/evidence/AGENT_CONTROL_4.11_PROMOTION_ROLLBACK_QUALIFICATION.md)
- [Security](../../SECURITY.md) and [contributing](../../CONTRIBUTING.md)
- [Release notes](../../docs/release-notes-4.12.1.md)
- [Accepted RC assessment and evidence](../../docs/release-candidate-4.6.md)

Historical versioned reports remain available under `docs/`; use the installation guide above for this release.


## Mallow and execution visibility

Use the floating Mallow companion for text and configured speech. Voice requests enter the same sealed approval and Work Parcel controls as typed requests. [Using Mallow voice](../../docs/mallow-voice.md).

[Desktop and mobile recordings with readable pauses](EXTERNAL-EVIDENCE.md) show real jobs, live process drill-down, running activity, input/cache/output usage and human-readable history. Video binaries are stored in the evidence repository.

The 4.8 release retains the [4.7 observability foundation](../../docs/observability-4.7.md) and adds progressive navigation through evidenced nested execution environments. New qualification screenshots remain separate from normal source pulls.

The observability candidate follows the device/browser system light or dark preference, including live changes without resetting the active view. See [system appearance](../../docs/system-theme-4.7.md).

### Native benchmarking and speculative decoding

Agent Control 4.8.1 publishes the governed runtime benchmark path documented in [Running your first benchmark](../../docs/running-your-first-benchmark.md). Agent Control owns discovery, admission, lifecycle, execution, scoring, restoration and evidence; qualification clients submit and inspect work without becoming the executor.

The retained qualification on a Linux GPU host found a bounded beneficial speculative route for Qwen3-8B with a Qwen3-0.6B draft at two draft tokens: median generation throughput improved from 27.10 to 33.55 tok/s (+23.8%) while median time to first token increased from 122.35 to 152.30 ms (+24.5%). Routing therefore selects speculative execution for throughput-sensitive workloads and ordinary execution for short latency-sensitive work. These measurements describe the qualified hardware/runtime/model combination, not a universal performance claim.

An isolated 4.9 candidate also documents an optional [phone-hosted local model route for governed computer use](../../docs/phone-hosted-local-model-computer-use.md). The local model remains separate from ChatGPT and can propose only bounded actions; physical end-to-end qualification is still pending.

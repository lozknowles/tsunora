# Agent Control v4.12.0 — Native Lean Runtime and Governed Cost Routing

Agent Control 4.12 moves specialist execution and model-call limits into the normal governed runtime. Digest-bound Agent Templates can enter the existing Work Parcel and Job Runtime path, while measured route throughput, no-progress windows and explicit output ceilings determine bounded execution budgets.

## Included

- Native execution for allow-listed Lab Agent Templates, with digest binding, runtime-safety approval, durable invocation evidence and independently scored output quality.
- A provider-neutral lean model interface and evidence-verifier protocol.
- Multi-dimensional runtime budgets covering total execution, provider calls, no-progress windows and output-token limits.
- Progress and resource evidence for governed model qualification, including stable service restoration checks.
- Provider-neutral cost/performance routing with Economy, Balanced, Fast Capped and Custom policies.
- Hard USD-per-million-token rate ceilings, invocation budgets, cumulative job budgets, token ceilings and fail-closed handling of unknown prices.
- Separate fresh, cached, reasoning and output-token reconciliation; missing cost remains `unavailable`.
- Optional OpenRouter request translation for exact provider selection, sorting, throughput preference and maximum price.
- An authenticated dashboard workflow to explain, preview and save the estate cost policy. Authority increases require an exact proposal hash, an operator reason and an append-only override record.
- Existing Mallow guided-tour and regression narration surfaces remain available for slow, evidence-backed release walkthroughs.

## Evidence boundaries

- The native lean-runtime and Qwen output-budget reports retain their recorded physical and deterministic evidence under `docs/qualification/`.
- OpenRouter routing is contract- and fixture-qualified in this release. No live paid OpenRouter request, account modification or spend is claimed.
- The experimental model-host adapter is included for governed qualification. It is not presented as a general production model server.
- Agent Templates remain restricted to registered, allow-listed native actions. A template does not gain shell, network or protected-resource authority from its manifest.
- Dashboard narration describes authoritative state; it does not become a source of execution truth.

## Compatibility

The configuration schema remains version 1. New runtime-budget, Agent Template and cost-routing fields are additive and optional. Existing 4.11 configurations continue with cost routing disabled until a policy is explicitly configured.

See the [upgrade guide](upgrade-4.12.md), [Agent Templates guide](agent-templates.md), [cost-routing guide](cost-aware-openrouter-routing.md), [release verification](release-verification-4.12.0.md), and [Limitations Ledger](KNOWN_LIMITATIONS.md).

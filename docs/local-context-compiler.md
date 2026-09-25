# Local Context Compiler

Status: experimental and fail-closed. No local model tier is enabled until a physical edge runtime and exact model artefact pass measured qualification.

## Purpose

The Context Compiler reduces irrelevant context and recommends escalation. It does not replace stronger coding models and it does not replace exact source evidence with a summary.

Every `ContextPacket` contains:

- the original task;
- structured local-model analysis;
- exact retained evidence bytes;
- SHA-256 for every retained item;
- required source paths and line ranges;
- original and compiled token estimates;
- omitted evidence identifiers;
- the recommended tier, confidence, uncertainties, and escalation reason.

The prompt passed to Luna or Sol contains both the advisory compiler analysis and the exact retained evidence. Packet construction fails if a cited evidence identifier or required source range is absent.

## Bounded route

The implemented route is `E2B -> E4B -> LUNA -> SOL`. Each tier may be entered at most once.

- E2B is the default fast triage stage.
- E4B is used only after its own runtime qualification and only for bounded work that E2B cannot resolve confidently.
- Luna receives the ContextPacket for ordinary implementation or debugging.
- Sol receives the packet for high-risk, complex, repository-wide, or failed-Luna work.
- Independent verification is required before any tier can produce a verified outcome.
- Failed local verification escalates directly to cloud rather than repeating locally.
- Security, destructive operations, migrations, concurrency, architecture, uncertain APIs, and repository-wide work cannot be accepted locally.

## Evidence-driven policy

Routing uses confidence, file and symbol count, packet size, unresolved hypotheses, explicit risk, verification results, and prior failures. Task labels contribute risk evidence but cannot independently authorize local acceptance.

Default local acceptance thresholds are deliberately strict:

- E2B confidence at least 0.90;
- E4B confidence at least 0.85;
- no more than three suspected files;
- no more than eight relevant symbols;
- packet no larger than 8,192 estimated tokens;
- no unresolved uncertainty or unsupported hypothesis;
- independent verification pass.

## Runtime qualification

`npm run qualify:edge-context-runtime` consumes measured runtime records for E2B and E4B. It records model identity, quantisation, context limit, runtime/version, prefill and decode throughput, peak RAM, battery change, thermal rise, connection method, duration, and maximum practical context.

E4B is not considered usable merely because E2B works. Its measured decode throughput, battery, thermal, and practical context must independently pass policy.

The current physical Android inspection observed an installed edge-gallery application but no model or inference runtime callable through the authorised Agent Control transport. Both tiers therefore remain `NOT_AVAILABLE`.

## Benchmark

`npm run benchmark:context-compiler` reuses the frozen 12-task real-mutation corpus and requires all 60 task/variant cells:

1. direct Luna;
2. direct Sol;
3. E2B then cloud;
4. E4B then cloud;
5. adaptive E2B, E4B, Luna, Sol.

The report includes verified success, cloud and local tokens, Luna and Sol tokens, latency, escalation frequency, false confidence, context reduction, missing-evidence cases, and failed-attempt cost. It separately reports API currency cost, subscription/quota consumption, local-energy Wh/cost, and counterfactual savings versus direct Luna and direct Sol. Missing evidence in the adaptive route is a benchmark failure even if cost falls.

## Cost accounting

Every new invocation can retain an immutable, versioned pricing snapshot (`tableId`, version, effective time, source, provider/model and each price component), rather than looking up a mutable price when the benchmark is read. The calculation separately retains fresh input, cached input, cache writes, output and reasoning units. Benchmark logic never contains a model price.

Subscription-backed runs are marked `SUBSCRIPTION / QUOTA CONSUMPTION` when a defensible currency charge is not available; they are never shown as zero cost. Where the integration exposes it, the run retains consumed units, allowance percentage, reset time/period and source.

Pixel local execution retains duration, average power, Wh, tariff, electricity cost, battery before/after, thermal state, throttling and tokens/sec. Missing power or tariff leaves local energy cost unknown. Hardware depreciation is deliberately not mixed into electricity cost. Optional infrastructure estimates stay separately labelled with source and estimate status.

No live cells are currently available, so the current benchmark verdict is `NOT_RUN`. This repository does not claim an efficiency benefit.

## Dashboard and audit

Invocation telemetry can retain the initial tier, active tier, complete sequence, stage, escalation reason, compiler confidence, original and compiled context size, and retained evidence identifiers. The Running view shows the active model/stage, route sequence, confidence, context reduction, and escalation reason. Historical invocation rows retain the model-specific route stage.

## Architecture

The editable architecture diagram is [Agent Control Local Context Compiler Architecture](https://www.figma.com/board/mj13CoX4iolJ8LAFGmOUTu?architecture=true).

## Current conclusion

**FAIL** — the code and safety gates are implemented, but no local runtime has been qualified and no live five-way benchmark exists. Local preprocessing has not yet demonstrated lower Luna/Sol consumption per verified outcome.

# Agent Control 4.8.1 — Governed native benchmarking and speculative decoding

Agent Control 4.8.1 is an additive, backward-compatible update to 4.8.0. It publishes a first-class governed runtime benchmark path and evidence-driven speculative-decoding routing without changing Navigable Workspaces or the authoritative Estate model.

## Governed native benchmarking

- A benchmark definition is submitted as a normal Agent Control job.
- Product workers and generic target/runtime adapters own target discovery, safety admission, runtime lifecycle, invocation, scoring, restoration and evidence.
- Qualification clients may submit, wait and inspect; they cannot earn native provenance by performing target work externally.
- Same-run resume preserves completed invocations and admission refusals, resumes only outstanding fixtures, and retains attempt-bound cleanup ownership.
- Android/Termux recovery uses governed preparation and continuation boundaries rather than hidden harness actions.
- CLI, API, Run Inspector and workspace evidence expose the same authoritative run and artifacts.
- Historical `HARNESS_DRIVEN` and `EXTERNAL_HARNESS_EVIDENCE` records remain unchanged.

The published adapter boundary supports verified llama.cpp/GGUF configurations over existing local or SSH transports, including authorised Android/Termux telemetry. It does not download models, discover arbitrary private model directories, or make other runtimes implicitly qualified.

## Evidence-driven speculative decoding

The generic qualification records an ordinary baseline and speculative candidates against the same target/runtime/model boundary. A route becomes eligible only when retained evidence meets the configured benefit, compatibility, telemetry and integrity requirements.

The retained qualification on a Linux GPU host used Qwen3-8B as the main model, Qwen3-0.6B as the draft model, and llama.cpp runtime `b9370-1-g22d9bc441`. With two draft tokens:

- median generation throughput: 27.10 → 33.55 tok/s (**+23.8%**);
- median time to first token: 122.35 → 152.30 ms (**+24.5%**);
- acceptance: **82.98%**;
- observed VRAM overhead: **1,031,798,784 bytes**.

This evidence supports speculative execution for throughput-sensitive work on that qualified combination. Short latency-sensitive work remains on the ordinary route. The measurements are not a universal claim for other hardware, runtimes or models.

## Safety and compatibility

- No new credentials, public service, model download or operational deployment is part of this release.
- Missing telemetry remains unavailable rather than zero.
- Native provenance is earned from product-owned lifecycle evidence.
- Runtime/model identifiers, hashes and route decisions remain bound to retained evidence.
- Existing 4.8.0 configuration and histories remain readable; changes are additive.
- Navigating to a capability does not grant authority to execute it.

## Known boundaries

- The published benchmark adapter is not a universal runtime/model marketplace.
- Model acquisition remains a separately authorised capability.
- A controller-hosted worker is used for the qualified Android/Termux path; no resident Android worker is claimed.
- Speculative benefit is qualification-specific and must be re-established for a different model/runtime/hardware combination.
- Physical network-loss recovery remains bounded by retained recovery evidence; uncertain restoration is never reported as success.

See [Running your first benchmark](running-your-first-benchmark.md), [runtime architecture](atlas-benchmark-runtime.md), [source ownership](native-benchmark-source-ownership.md), [architectural closeout](native-benchmark-architectural-closeout.md), and [speculative qualification](speculative-decoding-qualification.md).

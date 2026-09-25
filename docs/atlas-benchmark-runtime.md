# Governed runtime benchmark capability (Agent Control 4.8.1)

This additive v4.8.1 capability preserves the v4.8.0 architecture. Agent Control owns execution; Lab consumes benchmark definitions and results, not a forked engine.

## Existing implementation map

- `job-bootstrap.ts`: common product composition; `JobRuntime`, scheduler, worker registry and runtime safety.
- `managed-node-ssh.ts`: existing SSH argument construction, authenticated resource transport and owned execution support.
- `owned-process.ts`: scoped child processes and execution sessions.
- `model-hardware-qualification.ts`: existing generic fixture, validator and evidence lifecycle; CAPABILITY smoke may use one repetition, comparable measurements still require three.
- `runtime-target-telemetry.ts`: target-neutral observations and admission. Unknown is not zero; >=40 C refuses.
- `target-llama-runtime.ts`: Android/Termux and Linux observation adapters, owned SSH/local transport.
- `assets/runtime/llama-invocation.py`: supported llama.cpp runtime adapter payload, checksums, bounded lifecycle, resource samples, abort/restoration and timestamped events. This is distributed product code, not a qualification entry point.
- `runtime-benchmark.ts`: ordinary governed action registration and runtime lifecycle/admission, recording through existing ArtifactStore and invocation ledger.
- `application-service.ts` / Run Inspector / workspace projection: authoritative evidence navigation. No separate benchmark estate.

## Running without Codex

An operator installs the candidate and configures a private `AGENT_CONTROL_RUNTIME_BENCHMARK_CONFIG` file before starting the normal server. The optional configuration seals a fixture/specification, existing artifact hashes, resource transport, policy, expiry and explicit service-suspension authority. Registration performs no target work or downloads. Requests cannot replace the configured target or commands.

Use the existing authenticated `POST /api/jobs/model-hardware-qualification/run` with `parameters.specSha256` equal to the registered specification digest. Normal job safety/approval and cancellation interfaces apply. A registered controller-local Atlas worker uses the target adapter; this does not claim a resident daemon on Android. No Codex scripts are required to probe, admit, invoke or restore.

The initial capability is opt-in, existing artifacts only. Configuration is private and must not be published. Inputs/fixtures remain separate from target adapters. The same workload semantics run through local/SSH transport and Linux/Android telemetry adapters.

## Provenance and admission

New runtime observations record `AGENT_CONTROL_RUNTIME_EVIDENCE` and component, actual worker, adapter, target, run and step identity. Historic measurements remain `EXTERNAL_HARNESS_EVIDENCE` under a separate assessment; they are never rewritten. Lifecycle events carry target/controller clock domains; no clock synchronization is implied.

Admission records observations, policy thresholds and ADMIT/REFUSE. Missing battery/temperature/charging on a required mobile target refuses. Linux unsupported battery fields remain null. Target-memory policy is checked again before launch. Service restoration must be evidenced; controller cancellation uses bounded target abort/recovery and leaves uncertain recovery visible.

## Ownership and future release

The authoritative runtime remains in Agent Control. Agent Control Lab should carry fixtures, validators/comparison consumers, public-safe examples and reproducibility guides. Do not publish private target addresses, credential references, serials or operational configuration. Public v4.8.0 did not include this runtime benchmark path. Agent Control v4.8.1 publishes the qualified adapter boundary while preserving v4.8.0 as an immutable release.

Additional runtime and target combinations remain adapter-gated and require their own qualification; this release does not make them implicitly supported.

## Reusable qualification

See [Running your first benchmark](running-your-first-benchmark.md) for a public-safe configuration and CLI/API workflow. Full frozen-suite qualification is separate from the earlier one-call smoke. Native receipts require the product-owned lifecycle transcript; Python scoring uses the byte-identical frozen validator in the governed worker sandbox.

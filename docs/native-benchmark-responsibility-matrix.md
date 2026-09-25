# Native benchmark responsibility boundary

Historical ownership is preserved as HARNESS_DRIVEN / EXTERNAL_HARNESS_EVIDENCE. The current candidate is an additive correction, not a relabelling operation.

| Responsibility | Historical owner | Required/current product owner | Implementation path |
|---|---|---|---|
| Target discovery | Harness selected target | Estate/configured resource + product observation | TargetLlamaRuntime.observe; runtime-benchmark-projection |
| Runtime discovery | Harness pinned executable | Runtime adapter verifies configured identity; no arbitrary filesystem scan | llama-invocation.py hash checks |
| Capability discovery | Harness registered experiment | Existing worker registry, capability and job catalog | registerRuntimeBenchmark |
| Admission checks | Harness callbacks | Product resource policy | runtime-target-telemetry; runtime-benchmark |
| Resource checks | Harness SSH/ADB probes | Owned target/telemetry adapters | TargetLlamaRuntime.observe/platform |
| Connectivity checks | Harness direct probe | Owned transport failure/admission | managed-node-ssh; OwnedProcessManager |
| SSH / ADB / local execution | Harness subprocess orchestration | Worker-owned target adapter | TargetLlamaRuntime.execute/platform |
| API execution | Other benchmark adapters | Applicable governed adapter only | Not implemented by this llama.cpp target adapter |
| Model availability | Harness file checks | Product checksum/availability verification | llama-invocation.py |
| Model acquisition | External approved study transfer | Separate governed acquisition capability | Unsupported by native adapter; no download fallback |
| Model startup | External runtime helper | Distributed product runtime helper | assets/runtime/llama-invocation.py |
| Readiness / health | External runtime helper | Owned runtime deadline/health | llama-invocation.py |
| Benchmark invocation | External helper sends prompts | Owned runtime adapter with frozen input | createTransportLlamaLabAdapter + TargetLlamaRuntime |
| Timeout handling | Harness and helper | JobRuntime + bounded owned process + helper deadline | boundedContext; target helper |
| Cancellation | Harness cleanup | Retained cleanup and explicit recovery | JobRuntime; TargetLlamaRuntime.recover |
| Failure handling | Harness exception collection | Product attempt records and recovery | model-hardware-qualification; runtime-benchmark |
| Telemetry | Harness polling | Owned target platform and process sampler | runtime-inflight-telemetry; helper /proc samples |
| Tokens / accounting | Harness mapping | Runtime response + existing accounting ledger | recordAccounting; harness-efficiency |
| stdout / stderr | Harness subprocess capture | Owned execution session and result artifacts | OwnedProcessManager; ArtifactStore |
| Evidence creation | Agent Control, with external execution | Agent Control with product transcript binding | runtime-execution-provenance; existing ArtifactStore |
| Scoring | Harness launches frozen sandbox | Governed worker launches identical frozen sandbox | runtime-benchmark-validator; Python validator hash unchanged |
| Model shutdown | External helper | Owned product helper finally/recovery | llama-invocation.py |
| Previous-service restoration | External helper / recovery | Owned product helper + retained recovery | TargetLlamaRuntime.recover; cleanup registration |
| Post-run health | Harness inspection | Product postflight artifact | runtime-postflight |

## Execution and evidence chain

Frozen definition → normal sealed job → controller-hosted worker → target adapter → existing transport / OwnedExecution → distributed runtime helper → model invocation → retained response, tokens, resource samples and lifecycle → restoration/postflight → normal qualification artifact/history.

The controller-local worker's placement is distinct from the target on which inference runs. A native Android inference is not evidence of an Android-resident worker daemon.

## Trust boundary

The authenticated API accepts a configured specification digest, not commands or caller provenance claims. The native receipt is collected inside the product target adapter from the owned child process and bound lifecycle events. Missing or mismatched producer/run/worker identity, missing lifecycle, failed restoration or unsuccessful transport cannot produce a passing receipt. An actual external-process test fixture demonstrates that a printed native label is insufficient. This is governed execution provenance, not cryptographic remote attestation against a compromised controller/target administrator.

## Harness escape review

[The occurrence inventory](benchmark-harness-escape-audit.json) classifies 67 source files and 375 lexical occurrences: product adapters, explicitly isolated test fixtures, legacy benchmark harnesses, or unrelated feature qualification. The registered native path imports no legacy benchmark executor. Historical external utilities remain reproduction tools and do not gain authority to create product execution receipts. The original private 163-file provenance audit remains separate and unchanged; it is not replaced by this narrower current-source inventory.

## Reuse boundaries

One configured target/model/profile per registration. Existing llama.cpp artifacts only; acquisition is unsupported, never silently attempted. Python quality scoring requires a Linux controller with the existing network-isolated sandbox. Linux/SSH and Android/Termux adapters share workload semantics; physical qualification must be reported separately for each actual estate. Other runtimes/providers need an appropriate adapter and must not be declared equivalent automatically. Unknown telemetry remains null.

## Final Phi architectural assessment

[Closeout](native-benchmark-architectural-closeout.md) separates execution capability PASS from Phi quality FAILED (15/27) and model-study INCOMPLETE. [Source ownership](native-benchmark-source-ownership.md) keeps the engine in Agent Control and comparison material in Lab.

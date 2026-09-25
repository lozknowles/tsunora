# Build your first Mallow workflow: Find the best local LLM for your workload.

## Natural language method

Ask Mallow: “Find the best local model for Python repair on this machine. Correctness matters most. Only permissive licences; under 8 GB.” Mallow is the product's interactive guide.

The opt-in local benchmark controller returns the complete immutable specification, its digest, readiness and provisioning summary. This bounded parser supports Python function repair, artifact size, permissive licences, selected model families and attempt counts. Other workloads require an operator-supplied task/validator template; unsupported families or GPU execution fail closed. It does not silently search the entire model market or infer arbitrary constraints.

Review the exact candidates, source revisions, hashes, licence, estimated disk/RAM use, runtime and sandbox hashes, prompts, independent tests, weights, attempts, context, sampling, tools and timeouts. Freeze, then explicitly approve through the existing authenticated proposal flow. Editing stages, conditions or repetitions without a newly sealed definition is rejected. The approved grant binds one native Work Parcel, expires after at most one hour and is not restored automatically after a controller restart.

PROVISIONABLE means a known acquisition path exists with a qualified control worker, adequate estate resources and reviewed candidates. Target model presence is not a control-worker prerequisite. AUTHENTICATION REQUIRED and UNSUPPORTED remain explicit. APPROVAL REQUIRED applies when artifacts are present but execution is not approved. READY needs exact, fresh artifact and approval admission; readiness itself grants no authority.

## Underlying job workflow

The public `AC-QUAL-LOCAL-LLM` suite composes discovery, specification, selection, provenance, feasibility, provisioning, acquisition, verification, runtime, benchmark, validation, measurement, scoring, comparison, league table, evidence and retention review. It reuses generic hardware, model discovery, endpoint, benchmarking and comparison jobs.

The native controller groups those steps into five typed actions: preflight, acquire, verify-artifact, run-candidate and league-table. Each candidate runs sequentially. These execution details are not required of community job contributors. The public manifests describe one-sentence business objectives and independent success criteria.

The initial adapter reuses an existing verified llama.cpp runtime and bubblewrap installation. It does not install runtimes; absent compatible software is UNSUPPORTED until a separately approved provisioner supplies it. GPU execution and non-Hugging-Face acquisition need other adapters. No provider credentials are passed to target processes.

## Prepare and run

`node --import tsx scripts/prepare-local-llm-benchmark.ts ISOLATED_ROOT EXISTING_LLAMA_SERVER CANDIDATES_JSON` performs only fixed native control probes and local estate discovery. It creates an empty target workspace, immutable definition, conversation and review plan. The controller probe checks good/wrong/malicious function responses inside bubblewrap and records owned cleanup. It does not qualify a target model. Prior failed probes remain in the ledger.

After explicit operator approval, `node --import tsx scripts/run-local-llm-benchmark.ts CONFIGURATION_JSON --approve-spec EXACT_SHA256` freezes the exact draft, refreshes discovery, binds approval to a Work Parcel and executes through the normal native runtime. The command is an operator approval entry point, not part of preparation. A new process after interruption requires a fresh reviewed definition: prior candidate attempts cannot be overwritten or replayed into the same attempt set.

An installation can opt into the existing dashboard using `AGENT_CONTROL_LOCAL_BENCHMARK_CONFIG` pointing to the controller-owned configuration produced by preparation. This is configuration for a future separately approved deployment; adding source does not activate a running installation. Missing/expired control proof fails closed.

## Evidence and interpretation

A candidate process starts cold; all its requests share that process with prompt caching disabled. OS page cache and shared-host load are uncontrolled and must be disclosed. CPU-only mode uses four threads at nice 10 in the example. Model tools are disabled. Generated Python runs in a networkless mount/PID namespace with read-only runtime files, limited builtins/AST, CPU, memory and process limits. Its scope is pure `solve` function repair, not arbitrary repositories.

Every attempt retains raw response, deterministic validator evidence, full artifact/runtime/hardware/spec identity, elapsed time, available token rates and process RSS. Uninstrumented CPU/GPU counters and energy are null, not zero. The RSS figure is the maximum observed RSS of an owned process, not total host memory or summed process-tree memory. Two temperature-zero attempts with the same seed establish repeatability for this fixture, not statistical diversity.

Quality = passed / all planned attempts. Fastest = least total inference plus validation time among complete candidates. Lowest memory excludes missing observations. Example combined score = 100 × (0.95 × quality + 0.05 × fastest elapsed / candidate elapsed). Every attempt must pass for a workload-qualified recommendation. Failure can leave no winner; completed measurement collection is distinct from target qualification.

Store directories are content addressed and append only. Changed revisions, quantisations, runtimes, hardware or definitions have different identities. Failed acquisition partials are retained; successful downloads publish a verified file without overwriting existing files. KEEP ALL is default; KEEP WINNERS, KEEP EXISTING ONLY, REVIEW INDIVIDUALLY and REMOVE TEMPORARY BENCHMARK MODELS require separate reviewed deletion proposals. No cleanup or production-routing mutation is implemented by this suite.

The optional dashboard projection and CLI map snapshots attach the observed runtime/model to exact native run IDs. ACTIVE requires a recent owned-process observation; old activity becomes unavailable. “Show in Process Map” uses those run IDs. A model runtime being active is not a qualification verdict.

## Current evidence status

The implementation has contract tests and a real native controller probe. No target-model results exist before the download/execution approval. Public job fixtures and unit-test measurements are explicitly synthetic contract tests and must never be used as benchmark results. The live benchmark, actual league table and browser verification of model activity remain pending that approval.

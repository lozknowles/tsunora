# Running your first native benchmark

This capability is published in Agent Control v4.8.1. Install the tagged source with its lockfile (`npm ci`). No private qualification scripts are required.

## Supported boundary

The current execution adapter supports existing llama.cpp server binaries and GGUF models on Linux (local or SSH) and Android/Termux (SSH with authorised ADB telemetry). The controller-hosted worker is not a resident Android daemon. Linux controllers can independently score the frozen Python case with Python 3, bubblewrap and prlimit. Other controller platforms return unavailable for that validator. Other runtimes and API providers need an adapter; their execution is not claimed here.

## Configure your own estate

1. Use Estate discovery and `agent-control workspace list --json` to inspect your configured devices and environments. A visible device does not by itself mean benchmark execution is authorised.
2. Select an existing verified llama.cpp executable and model. Record their SHA-256, runtime version, quantisation, model provenance and compatibility. The adapter verifies hashes before launching; it does not discover arbitrary model directories or download models.
3. Copy [the local Linux example](examples/runtime-benchmark-linux.json) to a private configuration file. Replace placeholder absolute paths, hashes, identity and expired authority. Use your own resource and state directory. Its workload cases are the unchanged `local-model-common` 2.0.0 suite, three repetitions each.
4. Set RAM/storage policy for your model. `minimumAvailableBytes` is the generic target safety floor; `launchMinimumAvailableBytes` is a greater/equal declared workload floor. Both must pass before dispatch, and the same workload floor is checked again at launch. Preflight does not assume idle-service memory is reclaimable. They are not inferred model-size estimates. Review context, batch, threads, token ceiling and timeouts. Unknown required telemetry refuses admission.
5. For SSH, change only the existing resource transport to `ssh` with your host/user/port and identity-file reference. Pre-establish a verified known-host entry; the adapter requires strict host checking. Never put key material in configuration. For Android, configure the existing loopback ADB server and exact authorised serial binding, enable required battery/charging policy, and preserve the 40 C maximum.
6. If a pre-existing idle llama.cpp service needs suspension, explicitly configure its exact argv/cwd and authorise suspension. A busy or unhealthy service refuses admission. Without this configuration the worker must not stop unrelated services.
7. Start the normal controller with `AGENT_CONTROL_RUNTIME_BENCHMARK_CONFIG=/absolute/path/to/private-config.json npm run web`. Retain your normal state/configuration and authenticated access. The example deliberately expires and contains placeholder hashes so it cannot accidentally start work.

Model acquisition is NOT implemented by this adapter. Missing models fail closed. A request to acquire a model, even when authorised, is unsupported here; provision through a separately authorised acquisition capability, verify provenance/hash, then configure it. No silent download fallback exists.

## Run and monitor

Use your existing operator credential through the environment, never a URL or command argument. Set `AGENT_CONTROL_WEB_URL` to your loopback controller or authenticated HTTPS endpoint. Then:

```sh
agent-control benchmark definition
agent-control benchmark run
agent-control benchmark status RUN-ID
agent-control open job RUN-ID --json
# If needed:
agent-control benchmark cancel RUN-ID
```

From a source checkout, `node scripts/agent-control.mjs` is equivalent to `agent-control`. `run --spec SHA256` can explicitly bind the configured specification. Registration currently seals one target/model/suite per controller configuration; changing that selection requires operator configuration and restarting that isolated controller. This is not an automatic target/model marketplace.

The CLI only uses existing authenticated APIs: `GET /api/jobs/model-hardware-qualification`, `POST /api/jobs/model-hardware-qualification/run` with `parameters.specSha256`, `GET /api/runs/RUN-ID`, and `POST /api/runs/RUN-ID/cancel`. Normal runtime governance applies. Mallow can propose `Start model-hardware-qualification@1.0.0`; review its sealed proposal through normal approval.

Run Inspector and execution history retain resource admission, target checks, runtime request/start, inference completion, restoration, and postflight. Per-case response/verdict/attempt artifacts expose stage counts and outcomes. History includes input/output and nullable token/resource metrics; use existing Markdown/JSON downloads and integrity references. The workspace route exposes device, environment, runtime, run and evidence. Do not interpret a SUCCEEDED evidence-collection job as a QUALIFIED benchmark: read the `qualification` artifact, which may be BLOCKED, FAILED or INCOMPLETE.

## Provenance and restoration

`AGENT_CONTROL_RUNTIME_EVIDENCE` is the existing canonical native vocabulary. New `runtime-execution-provenance` receipts are generated by the product adapter from its owned process and bound lifecycle transcript. Caller labels alone do not establish native execution. `UNVERIFIED_EXECUTION` cannot pass native qualification. Historical `HARNESS_DRIVEN` / `EXTERNAL_HARNESS_EVIDENCE` records are never upgraded by import or report generation.

Cancellation uses bounded target recovery. Services are restored per invocation, including failure. Unconfirmed restoration is not success: retained cleanup ownership/locks remain until evidenced recovery. Network loss may prevent immediate restoration confirmation; inspect recovery evidence instead of clearing locks manually. Repeated runs do not reuse the original historical measurements as fresh calls.

## Reporting and troubleshooting

Keep the specification digest, source commit, model/runtime hashes, exact configuration, per-attempt output and validator verdicts, raw nullable telemetry, restoration receipt and artifact hashes together. The [sanitized historical smoke](examples/native-benchmark-smoke-result.json) demonstrates the shape of recorded metrics, but is explicitly not a full-suite result. Missing means unavailable, not zero. Cached input zero is a recorded count only when supplied. No monetary savings are inferred.

REFUSE means inspect admission reasons before retrying. Missing target/model/hash mismatch must be corrected through your own authorised configuration. Unsupported scorer means install/qualify the sandbox on the controller; never execute model-produced Python unsandboxed. Failed quality is retained as a model outcome, not rewritten to pass. Do not compare throughput across different contexts, models, cache state or lifecycle timing without stating the differences.

## Extend without changing execution ownership

A new suite uses `BenchmarkCase` workloads and a separately versioned frozen definition in `benchmarks/`; preserve prompts, expected answers and validator identity. Bind repetitions, timeout, profile, resource policy and evidence requirements in `LabQualificationSpec`. New runtime/target support implements existing `LabExecutionAdapter` / target transport interfaces with `ActionContext.ownedExecution`, retained cleanup and artifact recording. Qualification clients may submit and inspect; they must not SSH, start models or restore services. Keep provider/OS/runtime mechanisms in adapters.

### Inspect memory before dispatch

`POST /api/jobs/runtime-benchmark-inspect/run` submits a normal governed read-only inspection of the configured target. It shares the qualification lock so it cannot race an active benchmark. The `target-inspection` artifact contains charging/thermal admission, memory breakdown and up to 40 same-user process summaries. Only PID, process start identity, name, RSS and exact configured-service role are returned, never argv or environment. Presence alone does not authorise termination; unattributed processes are preserved. Kernel cache and swap are not treated as disposable benchmark allocations.

## Interpret the three verdicts separately

A completed run can prove the benchmark execution capability while the tested model fails its quality threshold. In the retained native Phi run, 27/27 physical executions and restorations succeeded, and all 27 outputs and validator outcomes reproduced the earlier harness result. Phi still failed quality (15/27); the broader model study is incomplete.

`qualification.status` is the model qualification aggregate, not a verdict on the entire benchmark framework. Check owned execution/provenance, scorer availability and restoration independently. Study progression requires a proven framework and fresh safety/authority admission for the next configured model; it does not require the preceding model to pass. Never waive a quality threshold or reuse stale admission to progress.

Codex is not a runtime dependency. The CLI submits one authenticated request; the registered product worker and target/runtime adapters perform probes, admission, lifecycle, inference, scoring, persistence and restoration. A client may disconnect after submission without becoming the executor. This closeout used standalone CLI definition/status calls plus the exact-dispatch test and retained native job chain; it did not claim a fresh CLI-origin model execution.

See [architectural closeout](native-benchmark-architectural-closeout.md) and [source ownership](native-benchmark-source-ownership.md). The model acquisition and other adapter limitations above remain unchanged.

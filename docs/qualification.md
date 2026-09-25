# Qualification

Run the local release gate first:

```bash
npm run check
npm run qualify
```

The harness always runs the local gate. It then reads the same configuration used by the control plane and performs only non-mutating health checks for configured services, resources and providers. Missing configuration is recorded as `SKIP configured-infrastructure`, not replaced by private defaults.

## Mandatory installation and upgrade gate

For every release that changes bootstrap, configuration loading, resource
identity, discovery, placement, runtime safety, or execution, source validation
alone is insufficient. Freeze one candidate and qualify both paths against that
exact source identity:

1. **Virgin install:** use the normal documented clone/bootstrap procedure in a
   clean environment; start the authenticated dashboard; run First Run
   Environment Discovery; inspect Estate; and complete the documented governed
   `operator-system-observation@1.1.0` Job.
2. **Supported upgrade:** preserve a copy of each declared supported prior
   configuration/state; run the normal documented bootstrap without reset; start
   the authenticated dashboard; rescan discovery; inspect Estate; and complete
   the same governed `operator-system-observation@1.1.0` Job.

Record source SHA, dependency inventory, configuration source version, bootstrap
result, runtime version, worker identity/locality, runtime-safety decision, Run
and Work Parcel identity, discovery scan, Estate relationship, and rollback
artifact. A PASS on one path never substitutes for the other. For 4.5.1, the
required prior configuration is the production-compatible v4.1 shape retained in
`src/control/fixtures/v4.1-existing-configuration.json`; deterministic coverage
is in `src/control/worker-locality-upgrade.test.ts`, while release qualification
must additionally exercise the physical bootstrap/runtime path.

For 3.7 validation, also run `npm run benchmark:capability-routing` and review its retained report. A classifier pass is not physical model evidence. Verify `GET /api/runtime` and `GET /api/token-routing` through the web tests and inspect the final diff for credential-shaped values. The token-aware lifecycle has bounded physical evidence, but neither it nor the separate Luna/local/GLM/Luna chain satisfies the 50-attempt automatic-routing gate. The completed checkpoint results and explicit limitations are retained in [`evidence/agent-control-3.6-development-qualification.md`](evidence/agent-control-3.6-development-qualification.md), [`evidence/agent-control-3.7-development-qualification.md`](evidence/agent-control-3.7-development-qualification.md), and [`evidence/agent-control-3.7-physical-qualification-20260902.md`](evidence/agent-control-3.7-physical-qualification-20260902.md).

Optional SSH checks are explicit:

```bash
AGENT_CONTROL_REMOTE_CHECKS='worker-a|operator@worker-a.example|echo AGENT-CONTROL-REMOTE-PASS' npm run qualify
```

Results are timestamped JSON in ignored `qualification-results/`. A configured endpoint is not considered functionally qualified unless the relevant live proof has run and its exact identity/evidence is retained. Source support, configured availability and live qualification are separate claims.

The token-aware output benchmark is deterministic and local:

```bash
npm run benchmark:token-output
```

It generates a temporary 240-file/48,000-line source tree, runs small, medium, broad and pathological searches, compares normal ripgrep output with the compact/indexed path, performs selected and full expansion, and fails unless match/file counts agree, the exact authoritative stream is recoverable, and broad/high-match initial reduction is at least 70%. It deletes the fixture after the run. Recorded evidence is [`docs/evidence/token-aware-output-benchmark-20260827.json`](evidence/token-aware-output-benchmark-20260827.json).

## Provider-neutral 3.9 qualification

Focused deterministic coverage is part of `npm run check`. The principal files are:

```bash
node --import tsx --test --test-concurrency=1 \
  src/control/parcel-context.test.ts \
  src/control/work-parcels.test.ts \
  src/control/capability-intelligence.test.ts \
  src/control/model-intelligence.test.ts \
  src/control/model-evaluation-runtime.test.ts \
  src/control/runtime-safety-supervisor.test.ts \
  src/control/model-registry.test.ts \
  src/control/web-server.test.ts
```

The physical runner is opt-in because it invokes real configured candidates. Supply at least two sanitized candidate descriptors through `AGENT_CONTROL_QUALIFICATION_CANDIDATES_JSON`; credentials stay in each provider's normal indirect reference. The runner rejects credentialed/non-loopback cleartext endpoints and requires exact local artifact hashes when a local model is declared:

```bash
AGENT_CONTROL_QUALIFICATION_CANDIDATES_JSON='[...]' \
  npm run qualify:provider-neutral -- \
  --state-dir /absolute/private/state \
  --evidence-file /absolute/evidence.json \
  --host 127.0.0.1 --port 4390 --hold-ms 10000
```

For a dashboard recording, set an existing Chromium executable and a qualification-only operator token, then run `npm run record:provider-neutral`. The recorder fails if the real dashboard cannot reach `LIVE`, records 1920×1080 H.264, follows Jobs/Models/Lanes, and writes a hash manifest. It does not deploy or modify the live dashboard.

Acceptance covers A–E from the release plan: historical failure retrieval after baton exclusion; a question blocking only dependent work; two real model/runtime candidates running all 17 frozen tasks three times; a required capability excluding one candidate; and a second complete batch surviving ledger reload. Unsupported evaluator classes remain explicit unavailable. Review the [physical report](evidence/agent-control-3.9-provider-neutral-qualification.md), raw [JSON](evidence/agent-control-3.9-provider-neutral-qualification.json) and [video manifest](evidence/agent-control-3.9-provider-neutral-dashboard-video.json).

## Dynamic provider and credential qualification

Before accepting any real API credential, run the deterministic boundary suite:

```bash
node --import tsx --test --test-concurrency=1 \
  src/control/provider-credential-store.test.ts \
  src/provider-credential.test.ts \
  src/control/security-redaction.test.ts \
  src/control/provider-catalog.test.ts \
  src/control/openai-compatible-provider.test.ts \
  src/control/model-registry.test.ts \
  src/control/model-evaluation-runtime.test.ts \
  src/control/direct-repository-review-executor.test.ts \
  src/control/work-parcels.test.ts \
  src/control/job-runtime.test.ts \
  src/control/parameterized-jobs.test.ts \
  src/control/web-server.test.ts
```

Acceptance requires owner-only atomic storage, metadata-only status, environment/file/store compatibility, late resolution, account isolation with no provider fallback, remote-resolution refusal, exact runtime-secret redaction, deliberate provider-echo failures, and no value in configuration, process arguments, Work Parcels, Jobs, artifacts, model evidence, catalogue persistence, API, SSE or dashboard assets. Run `npm run check`, the Markdown/link gate, `git diff --check` and a changed-file credential scan before the credential ceremony.

For NVIDIA, configure `nvidia-hosted` as documented in [NVIDIA-HOSTED.md](models/NVIDIA-HOSTED.md), then run `agent-control providers credential set nvidia-hosted` and enter the key only through hidden input. Verify `status` reports `CONFIGURED`, then perform one authenticated discovery. Do not infer model count, pricing, limits or family availability from documentation when live catalogue data differs.

Select a small representative set from the returned canonical IDs. First run **Check Callability** once per model. Only an inference-confirmed model proceeds to **Capability Smoke**, which reuses that callability result and makes four further bounded requests. Preserve only sanitized projections, hashes, output lengths, requested budgets, normalized usage, finish reasons and timeout phase. Reconcile dashboard/API/SSE values with the durable provider catalogue and model-intelligence ledger. Only after smoke evidence should selected models enter the frozen benchmark queue; only qualified evidence plus explicit operator enablement can grant routing eligibility.

The first physical proof must cover `Agent Control → credential reference → authenticated NVIDIA discovery → dynamic model registry → one controlled real inference → normalized telemetry → benchmark evidence → dashboard`, while confirming no key or raw response is retained. Report the discovered count and estimate full-catalogue request/time volume, then obtain separate authorization before a mass benchmark.

That bounded proof was recorded on 2026-09-06 in [Agent Control 3.9 NVIDIA hosted qualification](evidence/agent-control-3.9-nvidia-hosted-qualification-20260906.md): 81 IDs discovered, four representative smoke targets, one partial frozen Nemotron batch, zero routing-eligible NVIDIA models, and successful protected-ledger/API/SSE reconciliation. The [focused diagnostic follow-up](evidence/agent-control-3.9-nvidia-focused-diagnostics-20260906.md) preserves that result, corrects an ambiguous marker contract and insufficient smoke budgets, classifies MiniMax before-first-token timeout and Kimi endpoint absence, and proves staged callability on Muse and Nemotron. A model-list response is never inference proof. Full-catalogue callability, smoke or benchmarking remains separately authorized work.

## Token-aware baton-routing development qualification

Run the deterministic routing and adapter/dashboard coverage before any provider exercise:

```bash
node --import tsx --test --test-concurrency=1 src/control/token-aware-baton-routing.test.ts src/control/direct-repository-review-executor.test.ts src/control/codex-node-execution.test.ts src/control/codex-exec-provider.test.ts src/control/account-profile-qualification.test.ts src/control/model-registry.test.ts src/control/openai-compatible-provider.test.ts src/control/web-server.test.ts
```

It proves threshold transitions, no lifetime/context conflation, authority labels, durable restart/reconciliation, sealed batons, successful and failed handoff recovery, additive Sol/Luna/GLM accounting, adapter normalization, and the actual HTTP/SSE dashboard projection. The release's live provider proof is retained separately in the physical evidence; future route promotion must retain exact model/provider identity, telemetry authority and verification evidence rather than relying on this deterministic suite alone.

## Real repository-mutation harness experiment

The real-mutation matrix is an opt-in live qualification, not part of the configuration-free local gate:

```bash
AGENT_CONTROL_HARNESS_MUTATION_BASE_URL=http://127.0.0.1:PORT/v1 \
AGENT_CONTROL_HARNESS_MUTATION_MODEL=qualified-model-id \
npm run benchmark:harness-mutation:live
```

It verifies the endpoint/model identity, checks the frozen fixture hash, creates a fresh disposable Git workspace per task/strategy, dispatches through `HarnessDispatcher` and `ToolPolicy`, and independently verifies each real diff. It compares THIN, STANDARD, DEEP and cumulative adaptive escalation with the same model/settings. Production routing qualifies only if every versioned gate criterion passes; a successful benchmark process does not itself enable routing. See [`harness-mutation-report.md`](harness-mutation-report.md) and [`../artifacts/harness-mutation-report.json`](../artifacts/harness-mutation-report.json).

Android capability resolution requires an Android resource with a health URL plus its configured credential environment variable:

```bash
npx tsx scripts/prove-android-resolution.ts
```

The proof is read-only and accepts only the bundled Android log-observation operation.

## Spark fast-execution qualification

Spark qualification is opt-in and is not part of the configuration-free local gate. First check the exact installed Codex executable, ChatGPT authentication, frozen classifier and bounded exact-model availability probe:

```bash
codex --version
codex login status
npm run benchmark:fast-execution
```

Only after that preflight passes, run both mutation arms in disposable Git worktrees:

```bash
npm run benchmark:fast-execution -- --live --standard-model gpt-5.6-luna
```

Acceptance requires 10/10 frozen classifier decisions with no false-positive Spark route; exact requested/actual `gpt-5.3-codex-spark` identity; approved file/line scope; a single attempt with no subagents; and independent verification for each accepted outcome. Unavailable Spark, requested context, scope growth, low confidence or verifier failure must be recorded as failure/escalation and must not trigger a hidden model substitution or Spark retry.

The qualified desktop client is `codex-cli 0.144.4` and uses the directly tested `features.multi_agent=false` compatibility switch because that installed version rejects the currently documented `agents.enabled=false` boolean shape. Requalify this control after upgrading Codex. Provider monetary cost is currently unavailable and must remain `null`/`unknown`, not zero. The current evidence files and interpretation are listed in [`evidence/agent-control-3.5-qualification.md`](evidence/agent-control-3.5-qualification.md); detailed operator guidance is in [`fast-execution.md`](fast-execution.md).

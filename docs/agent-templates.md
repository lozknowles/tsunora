# Agent templates

Agent Control can load portable Agent Control Lab templates and bind one exact template version and digest to an existing registered Job. A template supplies role instructions and declares requirements; it does not grant access, credentials, approvals, budget or target authority.

Set `AGENT_CONTROL_TEMPLATE_DIR` to the Lab `agent-templates` directory before starting Agent Control. Set `AGENT_CONTROL_LAB_DIR` to the Lab repository root to register the allow-listed native adapters for `technical-research`, `review-pull-request`, `hallucination-resistance`, `documentation-consistency` and `compare-models`. Both directories are read at startup. A missing Lab directory leaves those executors unregistered; readiness then returns `BLOCKED` with `native-executor:unregistered` instead of implying that the run can start.

Authenticated API surfaces:

- `GET /api/agent-templates` lists templates.
- `GET /api/agent-templates/:id?version=1.0.0` inspects one template.
- `POST /api/agent-templates/:id/readiness` checks a registered Job, eligible worker capabilities and explicitly supplied scoped permissions.
- `POST /api/agent-templates/:id/use` rechecks readiness and submits a digest-bound stage through the existing Work Parcel and Job Runtime path.

The `use` body includes `version`, template `digest`, native Job reference, exact Lab `jobDigest`, Job parameters, scoped permission receipt, prompt and a 64-character hexadecimal request key. It cannot submit an unregistered Job, an incompatible template, a changed template or Job digest, an unavailable provider adaptation or a stage without an eligible worker. Runtime policy remains authoritative after readiness.

The native run retains the effective Job, Job digest, parameter/input digest, portable instructions, template version and digest, model route, worker selection, attempts, evidence and usage. Optional provider adaptations are loaded only from the template manifest, verified against their own version and digest, appended after the portable instructions, and retained in run provenance. Imported instructions are untrusted content below Agent Control governance.

Only the five paths above are translated, and only after the complete declared Job payload is validated and hashed. Arbitrary imported manifests cannot execute. One shared harness-backed action owns model invocation, timeout/cancellation, budget routing, tool denial, cleanup and candidate evidence; a separate control action checks the hidden acceptance oracle and verifies the model execution contract. Job-specific scenarios and validators remain explicit.

## Executed qualification example

The 20 September 2026 candidate executed 34 matched runs on the existing `qwen2.5-3b-instruct-q4_k_m.gguf` backend: three repetitions per primary case and one repetition per clean-review and agreeing-documentation control, in both plain and template arms. All model calls completed in the final suite, but the independent exact-fact verifier accepted none. The templates therefore are **not shown effective** on this model. Full candidate output, verifier decisions, runtime-safety approvals, identities, tokens, cache tokens, elapsed time and unavailable authoritative cost are retained in Agent Control Lab at `qualifications/native-execution/2026-09-20-qwen25-3b.json`. The earlier all-negative contract-design suite is retained separately rather than overwritten.

Run one matched case against the same already-running local backend:

```sh
npm run qualify:agent-templates -- \
  --lab ../agent-control-jobs \
  --output /tmp/docs-agree-native.json \
  --base-url http://127.0.0.1:8080/v1 \
  --provider-model qwen2.5-3b-instruct-q4_k_m.gguf \
  --case docs-agree \
  --arm both \
  --repetitions 1
```

This command uses an existing authorized backend and does not download, restart or reconfigure it. Omit `--case`, `--arm` and `--repetitions` to reproduce the complete suite. Runtime safety still requires an explicit recorded approval; the qualification runner supplies the operator authority represented by this deliberate command and refuses any unexpected approval type.

The authenticated API supports catalogue inspection, readiness and submission. The command above is the repository qualification CLI. No Agent Templates dashboard selector was implemented or claimed in this candidate.

Catalogue and readiness responses expose execution support separately from effectiveness status. `READY` means that the exact Job can be admitted and dispatched; it does not mean the template is effective. The five original 1.0.0 templates remain `FAILED_BOUNDED_QUALIFICATION` on the retained Qwen2.5-3B comparison. Evidence-verifier 1.2.0 remains `HELD_OUT_FAILED_NOT_QUALIFIED`: it passed the direct supported-scalar development case, but accepted none of nine revised-template held-out runs.

Run the bounded evidence-verifier protocol with separate development and qualification partitions:

```sh
npm run qualify:evidence-verifier -- \
  --lab ../agent-control-jobs \
  --output /tmp/evidence-verifier-development.json \
  --partition development \
  --arm all \
  --repetitions 1
```

This reproducibly includes a successful direct supported-scalar native run. It also includes a negative adversarial case and is development evidence, not held-out qualification. The held-out evidence is retained in the Lab repository and must not be rerun for prompt tuning.

## Governed stronger-model regression

The same frozen three-case qualification partition was rerun on the authorised Linux qualification host against the already-present `Qwen3.8-27B-Q3_K_M.gguf`. Agent Control admitted the exact file, hashed the model and runtime, launched a loopback-only experimental llama.cpp server, dispatched all inference through the native Work Parcel and Job Runtime path, enforced the existing 120-second per-call limit, terminated the owned process group, and rechecked protected services on ports 8080 and 8081.

All 27 calls (three cases × three repetitions × three arms) ended with `provider_timeout`. No candidate reached the independent verifier, so format compliance, unsupported-claim quality and template improvement are unassessed—not zero-error successes. A fresh qualification set was not opened because the regression supplied no evidence that proceeding was justified. The result is retained in Agent Control Lab at `qualifications/native-execution/2026-09-20-evidence-verifier-qwen38-27b-regression.json` and does not alter the failed/not-qualified effectiveness status.

General reproduction form for an authorised Linux checkout, provided the named files and resources are present:

```sh
npm run qualify:evidence-verifier -- \
  --lab ../agent-control-jobs \
  --output ../agent-control-jobs/qualifications/native-execution/2026-09-20-evidence-verifier-qwen38-27b-regression.json \
  --partition qualification \
  --arm all \
  --repetitions 3 \
  --managed-runtime /srv/agent-control-runtimes/llama/bin/llama-server \
  --managed-runtime-root /srv/agent-control-runtimes/llama \
  --managed-model /srv/agent-control-models/Qwen3.8-27B-Q3_K_M.gguf \
  --managed-model-root /srv/agent-control-models \
  --managed-port 19527 \
  --managed-context 8192 \
  --managed-gpu-layers 0 \
  --managed-threads 8 \
  --provider-model Qwen3.8-27B-Q3_K_M.gguf \
  --model-id local-qwen38-27b-q3km-template-qualification
```

The managed mode accepts only an exact file beneath the explicitly admitted model root and an exact runtime beneath the explicitly admitted runtime root, rejects ports 8080/8081, requires at least 8 GiB available RAM after model-file size, verifies both protected health endpoints before launch and after cleanup, and retains process identity plus cleanup outcome. It does not download a model or stop an existing service. The immutable Lab evidence records the exact paths used for the physical run.

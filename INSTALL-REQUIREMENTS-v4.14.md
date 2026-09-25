# v4.14 RC2 installation requirements

Qualification target: Ubuntu Minimal 24.04 x86_64, CPU only, Node.js 24. This does not establish universal Linux or runtime-version support.

The Linux bootstrap requires Bash, Git, Node.js 24 with npm, a clean Git checkout, writable checkout/state storage, and network/DNS/CA trust for the public repository and locked npm dependencies. SSH and an authorised account are required only for remote administration. The bootstrap installs locked application dependencies and initializes or preserves configuration; it does not install operating-system prerequisites or register a service.

After an administrator supplies these prerequisites:

```sh
git clone <approved-repository-or-candidate-git-bundle> agent-control
cd agent-control
git checkout --detach <approved-exact-commit>
./scripts/bootstrap-agent-control.sh --check --target "$PWD"
./scripts/bootstrap-agent-control.sh --install --role control --target "$PWD"
node scripts/agent-control.mjs doctor --json
npm run web
```

For a private RC, transport a Git bundle and verify its commit/hash. Do not substitute a modified source tree or publish the RC to obtain an installation path. A plain source archive can be installed with `npm ci` and `npm run init`; the Git-aware bootstrap requires a checkout.

Doctor is read-only and reports prerequisites separately from optional executables and unconfigured providers/services. `CORE_READY` is installation-prerequisite readiness, not a successful Job, service-health or model-qualification claim. It neither downloads models nor starts optional services. Its version probes have bounded output and timeouts; it emits no credential values or configured endpoint addresses.

## Dependency classification

| Dependency | Classification | Actual product use |
| --- | --- | --- |
| Node.js, npm, locked JavaScript packages, writable state | CORE_REQUIRED | TypeScript runtime, HTTP/WebSocket core and durable state |
| Bash and Git | CORE_REQUIRED for Linux Git bootstrap | Bootstrap, exact source revision and clean checkout checks |
| DNS/CA/HTTPS | CORE_REQUIRED for network installation | Repository and npm retrieval; exercised during installation |
| nvidia-smi / CUDA compiler | OPTIONAL | GPU inventory/readiness/resource accounting; absence cannot imply a GPU or qualify a GPU Job |
| llama.cpp / Ollama | OPTIONAL | Local model runtime discovery; no model is required for core |
| Codex / Claude and other agent CLIs | OPTIONAL | Explicit runtime discovery and configured harness execution |
| Docker / Podman | OPTIONAL | Explicit containment/benchmark integrations, not core installation |
| FFmpeg / browser executable | OPTIONAL | Explicit video/browser features; core uses no bundled browser requirement |
| ADB / Tailscale / SSH | OPTIONAL | Selected transport/device capability; SSH also used for remote administration |
| Speech services | OPTIONAL | Configured endpoints; no implicit startup or model download |
| TypeScript compiler / test packages | DEVELOPMENT_ONLY | Typecheck and repository regression, installed by the current locked development checkout |
| Synthetic executables and fixtures | TEST_ONLY | Qualification failures, isolation and parser cases |

First-run executable inventory uses `DefaultDiscoveryProbe` and owned-process error/timeout handling. Configured service startup uses the bootstrap control plane, which now consumes failed-spawn errors before recording a PID. HTTP probes retain bounded failures as unavailable observations. A missing optional executable is not a reason to terminate core. An explicitly required unavailable worker capability remains a placement refusal.

No runtime or transport is considered safe, authenticated, qualified or authorised merely because its executable exists.

RC2 installed qualification uses explicit capability gates only in disposable state. `AGENT_CONTROL_ENABLE_NON_OPENAI_CACHE_QUALIFICATION=true` registers the existing bounded fixture action. `AGENT_CONTROL_SEMANTIC_TOOL_V1=true` enables experimental interfaces there; the optional `toolInterface` Job parameter selects strict `SEMANTIC_TOOL_V1` or `LEGACY_TOOL_REQUEST` repair. Neither flag is a normal installation requirement. A semantic request with its capability gate disabled fails closed.

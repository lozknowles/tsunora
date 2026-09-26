# Tsunora clean installation (research software)

Scope: Ubuntu 24.04 x86_64, Node.js 24 with npm, CPU-only, local single-user research. Clean-install evidence uses disposable containers, not a fresh VM or physical machine. Do not infer Windows, macOS, Android, GPU, production HR, multi-user SSO or real-model qualification. Agent Control historical release documents describe their own revisions, not this Tsunora revision.

At the time of qualification there was no Tsunora release tag or release asset. The qualified Workforce Lab and clean-install work has since been merged to `main`. For normal public installation use `main`; for exact reproduction, pin the specific candidate or commit recorded in the release-status document. Do not install Agent Control v4.12.1 by following its historical README.

## Prerequisites

Install Bash, CA certificates, curl, xz-utils and Node.js 24 with its bundled npm using your administrator-approved source. Git is needed only for the clone/bootstrap route. Python 3 is optional for the deterministic Exchange experiment and independent evidence verifier. No GPU, API key, model, SSH agent, VPN or enterprise credential is needed for the bounded first workflow.

For disposable Docker qualification, use `docker run --init` (or an equivalent PID 1 reaper). A bare `sleep` process as PID 1 can leave orphaned descendants as zombies; the runtime then correctly refuses to attest cleanup. Never weaken cleanup checks to accommodate an unsuitable container init. Keep host mounts and public port publication disabled.

The clean test used Ubuntu 24.04, Node.js 24.21.0 and npm supplied by that Node distribution. To reproduce the Node prerequisite from an official archive on x86_64:

```sh
curl -fsSLO https://nodejs.org/dist/v24.21.0/node-v24.21.0-linux-x64.tar.xz
curl -fsSLO https://nodejs.org/dist/v24.21.0/SHASUMS256.txt
grep ' node-v24.21.0-linux-x64.tar.xz$' SHASUMS256.txt | sha256sum -c -
# After verification, install into an administrator-approved location, e.g.:
sudo tar -xJf node-v24.21.0-linux-x64.tar.xz -C /usr/local --strip-components=1
node --version
npm --version
```

Checksums downloaded over HTTPS detect corruption; this is not independent signature verification. Use a writable checkout and private writable state. The qualification resource ceiling was 3 CPU cores and 6 GiB memory, not a measured minimum. Outbound HTTPS is required for initial GitHub/npm/browser downloads; no inbound public exposure is needed.

## Route A: public Git clone

```sh
git clone --branch main https://github.com/lozknowles/tsunora.git
cd tsunora
git rev-parse HEAD
./scripts/bootstrap-agent-control.sh --check --target "$PWD"
./scripts/bootstrap-agent-control.sh --install --role control --target "$PWD"
```

The bootstrap requires a clean checkout and uses the lockfile. Preserve local changes: use another directory instead of resetting a dirty checkout. Internal command names remain Agent Control names deliberately.

## Route B: public source archive, no Git history required

Use the full commit SHA shown by GitHub for the chosen branch as REF:

```sh
REF=REPLACE_WITH_EXACT_COMMIT_SHA
curl -fL "https://github.com/lozknowles/tsunora/archive/${REF}.tar.gz" -o tsunora.tar.gz
mkdir tsunora
# Inspect the archive before extraction when required by local policy.
tar -xzf tsunora.tar.gz --strip-components=1 -C tsunora
cd tsunora
npm ci --ignore-scripts --no-audit --no-fund
npm run init
```

Do not run the Git-aware bootstrap on an archive: its `repository_not_git` refusal is intentional. `npm ci` must succeed against the committed lockfile. This project runs TypeScript through tsx; there is no separate production build command. `npm run typecheck` checks compilation; `npm run check` runs the full development checks and tests.

## Core dashboard and product shell

```sh
node scripts/agent-control.mjs doctor --json
read -rsp 'Private operator token (at least 32 characters): ' AGENT_CONTROL_WEB_OPERATOR_TOKEN
printf '\n'
export AGENT_CONTROL_WEB_OPERATOR_TOKEN
npm run web
```

Use a newly generated private token, not an example token. Do not put it in command arguments, Git or screenshots. Open the printed loopback URL (normally http://127.0.0.1:4310), authenticate, then choose Discover my environment with remote probing disabled. `/tsunora.html` is the separate product shell. CORE_READY is prerequisite readiness, not a completed Job or model qualification. An empty Exchange is expected: enabling `AGENT_CONTROL_LABOUR_EXCHANGE=1` does not register workers. Trusted host registration is required; no self-service production worker onboarding is claimed.

Ctrl+C stops this foreground process. Restart in the same directory with the same state and operator token. Do not run two controllers against the same state. Never bind publicly or disable authentication to fix access.

## Verifiable first workflow: synthetic Workforce Lab

This is a separate loopback research launcher, not a real HR connector. It registers permitted deterministic specialist workers through the existing runtime. It needs no model or provider credential.

```sh
node --import tsx scripts/workforce-lab.ts "$PWD/work/workforce-demo"
```

The readiness line prints an ephemeral port and the name `private-session.json`. Open that file locally inside the state directory. Its `operator` and `employee` values are private temporary session capabilities. Open `http://127.0.0.1:PORT/#OPERATOR_VALUE` locally for the synthetic HR session (substitute the file values); the page immediately removes the fragment. Never capture or share that URL. Employee sessions cannot approve.

1. Choose Employment letter and submit. Expect COMPLETE / VERIFIED, a SUCCEEDED run, four specialist identities and a verified synthetic document marker. Inspect the verify artifact rather than accepting the prose alone.
2. Choose Bank change and explicitly confirm the displayed synthetic values. The execute step must pause at WAITING_FOR_APPROVAL; the overall run is WAITING. No bank mutation may occur before HR approval. Reject to cancel, or approve and inspect the before/after and independent verification.
3. In a fresh disposable state directory choose Contain & recover. Approval allows the fault test, not a wrong-target write. Expect a scope block, owned-process stop/quarantine, second execution attempt and verification; the other employee must remain unchanged.

Ctrl+C or a file named STOP in the state directory requests shutdown. The repaired launcher drains its current tick, consumes STOP and removes the old session file. Restart with the same state path to retain jobs/artifacts; read the new session capabilities. A stale unconsumed STOP after an abnormal exit must be investigated, not blindly deleted during active work. Active-run crash recovery is not an exactly-once transaction guarantee.

## Optional browser evidence and qualification

The npm lockfile includes playwright-core but does not bundle Chromium. Install its matching browser explicitly; do not substitute a newer unpinned npm package:

```sh
node node_modules/playwright-core/cli.js install chromium
# On a minimal Linux OS, an administrator may also need:
sudo node node_modules/playwright-core/cli.js install-deps chromium
node scripts/record-workforce.mjs /tmp/tsunora-heroes-new
node --test scripts/workforce-installation.test.mjs
node --import ./scripts/test-environment.mjs --import tsx scripts/qualify-workforce.ts /tmp/tsunora-workload-new
```

Use new evidence directories. The frozen batch intentionally retains a failed single-worker resilience configuration: 100/120 expected boundaries, no eligible replacement in 20 cases. Its nonzero exit is not an installation failure or a passing full benchmark. The other configurations previously passed 120/120; rerun for your exact revision. No real model test is implied. Cost/energy/token values without measurements remain UNKNOWN.

## Troubleshooting and limitations

- Missing node/npm/git: install the named prerequisite, then retry. Git is not needed for direct archive installation.
- Dirty checkout: preserve it and install into a new directory.
- Missing Chromium executable/shared libraries: use the optional commands above; normal dashboard use can use your own browser.
- Authentication required: supply your configured token; do not disable the check.
- No eligible worker: inspect capability/health/qualification. A safe wait is valid; do not clear quarantine to force success.
- Port conflict: stop only your own instance or use the documented web-port configuration; do not kill unrelated services.
- Provider/enterprise tests: NOT TESTED without an explicitly approved endpoint, test tenant, credentials and spending limit. Missing credentials never count as success.

The synthetic Lab lacks production SSO, real HRIS/payroll writes and universal prompt-injection protection. Multi-resource writes are sequential. Duplicate natural-language requests create distinct jobs; only interfaces with explicit identity contracts claim deduplication. The Exchange's broader budget, ownership and accounting controls have their own tests and experiments. No general production-readiness claim follows from this installation.

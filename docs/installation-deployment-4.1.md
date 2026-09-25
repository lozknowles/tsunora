# Installing and operating Agent Control 4.1

This is the 4.1 installation and operating runbook. Publication and production rollout require the
final regression, physical browser, audiovisual and privacy gates in
[the qualification record](provenance/EXTERNAL-EVIDENCE.md).
An installed package or healthy HTTP listener does not satisfy those gates.

## Prerequisites and installation

Use Node.js 24, npm, Git and Bash. Node 24 is the qualification runtime; older
Node versions are not part of this release's installation proof. Python,
FFmpeg, model packages, SSH and a private HTTPS proxy are optional integrations.
Do not install a speech model or discover machines merely to run the core.

For an existing installation, first record its exact source revision, service
definition, configuration references and state directory. Use a separate
checkout and state directory for qualification. The final published release uses
the repository's `v4.1.0` tag convention; select that tag after cloning.

```bash
git clone https://github.com/lozknowles/agent-control.git
cd agent-control
# Select the published release.
git checkout --detach v4.1.0
npm install --ignore-scripts
npm run init
npm run check
```

The repository does not currently commit a package lock. Preserve the resolved
dependency inventory with installation evidence; `npm ci` cannot be substituted
without a lockfile. Initialization is idempotent and creates only an empty,
schema-valid `.agent-control/config.json`. Configure resources, models and lanes
explicitly. Missing integrations remain unconfigured.

## Private configuration and authentication

Keep runtime files outside the release checkout. Select their locations with
`AGENT_CONTROL_CONFIG`, `AGENT_CONTROL_STATE_DIR` and `AGENT_CONTROL_JOB_DIR`.
Configuration stores credential references, never plaintext credentials.
Environment files and referenced credential homes must be owner-readable only;
never include them in source, logs, transcripts, recordings or release archives.

Set `AGENT_CONTROL_WEB_OPERATOR_TOKEN` through the installation's existing secret
delivery mechanism. A missing token leaves observer access; a configured token
is entered in the dashboard's operator dialog. The browser retains authority in
that tab's session storage and sends bearer headers, not credential-bearing URLs.

Run one authoritative control-plane process per mutable state directory:

```bash
export AGENT_CONTROL_CONFIG=/path/to/private/config.json
export AGENT_CONTROL_STATE_DIR=/path/to/private/state
export AGENT_CONTROL_JOB_DIR=/path/to/private/jobs
export AGENT_CONTROL_WEB_HOST=127.0.0.1
export AGENT_CONTROL_WEB_PORT=19196
npm run web
```

Paths above are installation placeholders. `npm start` provides the TUI with the
same service; do not start both against the same state. `npm run up` manages only
explicitly configured processes and their ownership records. It is not a blanket
deployment command for unrelated workers or integrations.

## POE reasoning, knowledge and voice

Select qualified model-registry roles with `AGENT_CONTROL_POE_STATUS_MODEL_ROLE`
and `AGENT_CONTROL_POE_REASONING_MODEL_ROLE`. The initial qualification uses the
existing owner-approved Codex/ChatGPT route to `gpt-5.6-luna`. The account profile,
execution node and credential-home reference belong to private installation
configuration. This route uses existing authentication and does not provision an
API key, rotate accounts or silently substitute a different model.

POE's header and turns identify both the registry entry and invoked provider model.
Reported input/output/total usage is retained; missing context or cost is shown
as unavailable. The core response port also supports qualified alternatives, but
those require their own explicit configuration and qualification.

`config/poe-knowledge-sources.json` approves repository documentation for retrieval.
Each answer retains the source revision, dirty flag, hashes and live observations.
Retrieved text cannot grant execution authority. Local manifests and saved
schedules are real registries; optional `AGENT_CONTROL_POE_REGISTRY_SOURCES`
provides read-only remote job/schedule discovery, not an execution bridge.

`AGENT_CONTROL_POE_VOICE_CONFIG` points to private JSON containing `speechUrl`,
`tokenEnv` and the complete `voice` identity. The HTTP speech adapter permits only
authenticated loopback endpoints. Its referenced secret must also be provided to
the speech worker as `AGENT_CONTROL_SPEECH_TOKEN`.

Use the same identity from `config/poe-voice-v2.json` in the worker's
`--voice-config` and the channel configuration. It is an original designed male
British hotelier voice with a pinned model revision and seed, not a cloned voice.
The existing optional worker is `scripts/speech-worker.py`; use an independently
provisioned Python environment, the approved local OmniVoice model path, and an
unused loopback port. Its `--help` describes model, device, state and port options.
Do not invoke its standalone `--qualify` generation/cloning experiment as startup.

For the POE male worker, pass `--sentence-chunks` to render complete sentences
with the same original voice seed and a 150 ms pause between sentences. This
mode preserves the full text and the existing number/negation validation gate.
It is explicitly selected per worker; other channel workers are unaffected.

Synthesis and independent speech-content validation finish before playback. This
adapter does not stream TTS. CPU generation can be slower than real time; an
audio artifact alone does not prove speaker intelligibility or microphone input.
Changing the browser identity does not update an already-running social worker.
Each enabled channel must be checked against the selected identity separately.

## Private HTTPS and browser checks

Keep the backend on `127.0.0.1:19196`. Inspect the private proxy before changing it:

```bash
tailscale status
tailscale serve status
tailscale serve status --json
```

If the listener is unused and the operator has authorized it:

```bash
sudo tailscale serve --bg --https=19196 http://127.0.0.1:19196
```

Use the exact generated private HTTPS URL and include that origin in
`AGENT_CONTROL_WEB_ALLOWED_ORIGINS` where required. Preserve unrelated Serve
listeners. Do not reset Serve, enable Funnel, alter SSH forwarding policy or bind
the dashboard publicly. Remove only a listener created solely for qualification:

```bash
sudo tailscale serve --https=19196 off
```

Verify Windows membership and DNS, HTTPS, unauthenticated refusal for private
conversation APIs, authenticated access, stable live updates, secure context,
microphone permission, actual browser audio and interruption. Tailnet-only Serve
configuration is configuration evidence; separately identify any off-tailnet
network test. A successful local request is not that external test.

## Qualification, release and deployment

Start the complete regression runner from a clean candidate checkout:

```bash
POE_REGRESSION_OUTPUT=/path/to/private/regression.json \
  node scripts/qualify-poe-regression.mjs
```

Set `AGENT_CONTROL_POE_REGRESSION_FILE` to that same private file in the dashboard
service. **Narrate test progress** enables POE's spoken observation of meaningful
runner changes. Counts come from emitted results; remaining stays unavailable
until the runner discovers a total. Runner evidence is explicitly external to
Work Parcels. It must not be portrayed as governed job execution.

Complete the physical tour and harmless approved job against that same product
candidate. Record microphone input, barge-in, actual model/worker/lane telemetry,
real batons/receipts and independent verification. Preserve failures. First test
a short recording, then retain the complete qualification privately. Publish only
the reviewed overview, captions and transcript after checking the entire export.

After every required gate passes, push the candidate and use the repository's
review/merge workflow. Recheck the final merge revision; rerun affected gates if
product code differs. Create `v4.1.0` only on the accepted revision, publish the
release package and a manifest containing exact hashes and evidence references.
Historical 4.0 releases published a source package separately from deployment.

For deployment, use the installation's existing process supervisor and preserve
its ownership, configuration and credential references. Stop that controller,
back up its mutable state, select the accepted immutable checkout/package, then
restart only the scoped service. Do not repoint an unrelated experiment or
restart every Agent Control-named worker. Verify HTTP health, authentication,
POE conversation, model identity and actual browser audio after the rollout.

## Rollback

Before rollout, retain the exact previous source/package hash, supervisor command
and an owner-only state backup taken with its controller stopped. If acceptance
fails, stop the new controller, restore that matching state backup, select the
previous immutable version and restart the original scoped service. Do not run
two versions against one state or transfer provider credential stores with source
archives. Recheck health, authentication and a harmless conversation afterward.

## Troubleshooting and limits

| Symptom | Check |
| --- | --- |
| POE is silent | Select Enable audio; check playback error and speech-worker health. Tour Next stays disabled until real audio ends. |
| Microphone unavailable | Check secure origin, browser/OS permission and selected input device. Permission denial keeps typing available. |
| Speech validation fails | Inspect the retained text and sanitized speech failure. Retry narration; never substitute a different voice silently. |
| Slow narration | Measure generation and validation time on the configured worker. No streaming claim is made for complete-audio adapters. |
| Unknown model or cost | Recheck route qualification and reported usage; missing values remain unavailable. |
| Job cannot start | Use its exact registered identifier; only explicitly permitted default-input jobs create conversational proposals. |
| Schedule/Pixel readiness missing | Registry discovery does not verify device transport, Facebook session or an execution bridge. |
| Regression evidence missing or stale | Check configured file, exact commit, heartbeat and final exit code; never infer success. |
| Video black, cropped or wrong tab | Check the actual foreground browser and monitor bounds, then verify a short capture before continuing. |

The source supports more integrations than this deployment may have qualified.
See the final qualification matrix for physically verified scope and outstanding
limits; tests, configured capability and human evaluation remain distinct.

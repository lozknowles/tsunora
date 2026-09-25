# Android Standalone — physical qualification

**ANDROID STANDALONE VERDICT: PASS WITH LIMITATIONS for the base controller deployment. The complete Android model-benchmark showcase remains BLOCKED and is not release-ready.**

The authorised Pixel ran its own Agent Control controller, persistent state, governance, deterministic worker, job evidence and local dashboard. A phone browser connected to a remote controller was not used as standalone evidence.

## Zero-APK proof

| Question | Observed answer |
| --- | --- |
| Did Agent Control require its own APK? | No. Installation used Git and npm inside existing Termux. |
| Did it require root? | No. The process ran as the ordinary Termux app UID. |
| Did it require a desktop/server controller? | No. The installation had zero remote resources and providers. |
| Did its own control plane run on Android? | Yes. The source process and on-phone state were directly inspected. |
| Did the dashboard run locally? | Yes. Physical Chrome displayed `http://127.0.0.1:4310/`. |
| Did a governed job execute locally? | Yes. The observation job succeeded after Mallow proposal approval. |
| Did local model inference execute in this qualification? | No. BLOCKED; historical phone inference is not reused as new evidence. |
| Did a real Android benchmark complete? | No. No Android league result or winner is claimed. |

## Environment and installation

Pixel 8 Pro, Tensor G3, Android 17, ARM64, Termux, Node 26.4.0, npm 11.19.0, Git 2.55.0, physical Chrome 152.0.7977.83. Reported RAM was 12,135,170,048 bytes. Available memory varied substantially, 261–965 MiB in reviewed captures; these are point observations, not a benchmark resource trace. Free storage was initially approximately 10.9 GiB. A controller RSS observation was 105,008 KiB; it is process RSS, not total phone consumption.

The fresh qualification directory was separate from existing Termux projects. The phone was not factory-reset: pre-existing model artifacts elsewhere on the phone were neither imported into this configuration nor counted as a clean-device model-provisioning pass. Configuration initialization returned CREATED. Discovery found one machine, zero GPUs, zero local models, zero providers, two internal workers and 27 tools.

Initial source: `f9f95eda37760ba4b83d0558ed9634cf5f4400cc`. Final source and capture hashes are recorded in [the evidence manifest](../examples/showcase-4.6/android-standalone/qualification.json). The [tested installation guide](android-standalone.md) contains the exact public-branch procedure.

The harness acquired the public GitHub source from the phone and retained its existing package versions. It used SSH/ADB for development, inspection and native screen capture, and a detached isolated controller while testing. The primary user instructions run the controller in the foreground. A desktop loopback tunnel was established for diagnostics; physical acceptance used Chrome on the phone and phone-local HTTP requests.

## Local execution and recovery

Mallow received `Start operator-system-observation@1.1.0`. The actual UI approval returned HTTP 202. Run `run-b50db641-05ad-4239-87e1-1564638d5b1a` succeeded, with native observation and verification stages represented in Process Map. The run remained SUCCEEDED with the same identity after controller stop/restart.

Physical browser reload and isolated controller termination/restart were tested. With the controller stopped, the physical browser loaded the saved offline shell, explicitly stating that it could not execute jobs or report live status. Restart restored the live dashboard and retained history. No Android reboot, forced system reclamation, battery shutdown, interrupted model download or interrupted Android benchmark was exercised.

## Handset UI and PWA

Native ADB screenshots came from the physical Pixel framebuffer. Desktop viewport emulation and tiled CDP captures were excluded from the public gallery. Dashboard, Discovery, Estate, Process and Crew were checked at the actual 395 CSS-pixel viewport with document width 395 and scale 1. The mobile header/menu, map grids and controls were corrected from observed handset failures. Crew portraits and floating Mallow were retained. Jobs, Models, Model Watches and Settings were also opened read-only at width 395. Fit-all graphs have small labels on a phone; use the inspector or Control Room for detail. The phone inspector capture deliberately shows expired-observation and qualification gaps, rather than presenting discovery as qualification.

Chrome's installability inspection returned no errors. The manifest and service worker were served by the Android controller. PWA launcher installation and standalone launcher reopen remain untested; the browser path and offline warning were tested. The PWA cannot keep Termux alive.

## Remaining model and telemetry blockers

The base userspace could not read battery, charging, thermal or metering telemetry. Its existing paired ADB helper discovered the phone but could not reconnect through the local, loopback or existing private-address routes. These failed attempts are retained. A development machine's working ADB transport is not substituted for a phone-local telemetry source.

Mobile policy therefore blocks benchmark/provisioning admission. Memory was also frequently below the configured reserve. The implementation preserves UNKNOWN values and does not infer GPU/NPU support, power or model feasibility from advertised hardware alone.

The existing benchmark adapter's runtime qualification and Python validator still assume Linux sandbox facilities. An Android-compatible data-only validator/runtime admission path, working on-phone telemetry, approved artifact acquisition, inference, benchmark results, personal league and associated screenshots remain open. Resource-policy checks exist, but an active Android thermal pause/resume cycle has not been physically qualified.

A possible small control candidate was researched: `bartowski/SmolLM2-135M-Instruct-GGUF`, revision `09816acd5d99df7be770d85ea30822623dab342c`, `SmolLM2-135M-Instruct-Q4_K_M.gguf`, 105,454,432 bytes, SHA-256 `2e8040ceae7815abe0dcb3540b9995eaa1fa0d2ca9e797d0a635ae4433c68c2d`, Apache-2.0. It was not downloaded, approved as a workload recommendation or executed. [Publisher metadata](https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/tree/09816acd5d99df7be770d85ea30822623dab342c).

## Verification and security

The final `npm run check` passed: **1,454 tests, 1,454 passed, zero failed or skipped**, plus typecheck, distribution, syntax, neutrality and implementation-status checks. These regression checks ran on the development Linux host; the handset evidence is separately identified. Focused mobile policy/bootstrap/PWA/Mallow checks also passed. Generic runtime regressions cover interrupted work and owned-process cleanup; those controls are separate from unperformed Android physical interruption scenarios.

Phone-local HTTP checks returned 401 for unauthenticated deployment observations and 403 for a foreign-origin mutation. The installation token was absent from status, deployment, run, Discovery, Estate and configuration responses. The token file had mode 0600. Source paths and raw secrets are not public artifacts. No model download, paid provider call, new APK, phone setting change, network join or public listener was performed.

The broader 4.6 release gate remains INCOMPLETE. The Android model-provisioning/inference/league requirement is explicitly retained in the gate. No merge, tag, GitHub release or production deployment was performed.

## Physical screenshots

The [screenshot manifest](../examples/showcase-4.6/android-standalone/screenshots.json) records source commits, SHA-256 and privacy review. These are original handset captures, not mock-ups.

1. [Local Android dashboard](provenance/EXTERNAL-EVIDENCE.md).
2. [Environment Discovery](provenance/EXTERNAL-EVIDENCE.md).
3. [Phone in Estate](provenance/EXTERNAL-EVIDENCE.md).
4. [Phone inspector](provenance/EXTERNAL-EVIDENCE.md).
5. [Completed local job in Process Map](provenance/EXTERNAL-EVIDENCE.md).
6. [Crew on the phone](provenance/EXTERNAL-EVIDENCE.md).
7. [Mallow explains model readiness](provenance/EXTERNAL-EVIDENCE.md).
8. [Controller unavailable — offline shell](provenance/EXTERNAL-EVIDENCE.md).
9. [Local run in Control Room](provenance/EXTERNAL-EVIDENCE.md).

<img src="media/4.6/android/android-local-dashboard.png" width="300" alt="Actual Pixel local controller dashboard"> <img src="media/4.6/android/android-crew.png" width="300" alt="Actual Pixel crew portraits and floating Mallow">

<img src="media/4.6/android/android-mallow-readiness.png" width="300" alt="Mallow explains missing Android benchmark capabilities">

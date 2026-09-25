# Run Agent Control on Android — No Agent Control APK Required

**Development preview: the base standalone installation is physically verified; the model benchmark showcase remains blocked.** The phone runs the same controller, governance, jobs, evidence stores and dashboard as other installations. A local model, root, remote controller and an Agent Control APK are not prerequisites.

## Tested quick start

Tested on a Pixel 8 Pro, Android 17, ARM64, existing Termux, Node 26.4.0, npm 11.19.0 and Git 2.55.0. The bootstrap accepts Node 24 or 26; Android Node 24 was not physically qualified here. This is a development branch, not a published release.

In Termux:

```sh
pkg install git nodejs-lts npm
git --version
node --version
npm --version
git clone --depth 1 --branch v4.6.0 https://github.com/lozknowles/agent-control.git
cd agent-control
git rev-parse HEAD
node scripts/android-standalone.mjs check
node scripts/android-standalone.mjs install
node scripts/android-standalone.mjs start
```

If compatible packages already exist, retain them; physical qualification retained the installed Node 26 package. The check inspects Android, architecture, storage, Git origin and tracked-source cleanliness. Installation disables package lifecycle scripts, probes TypeScript and SQLite, initializes private state and preserves existing configuration. Git origin/commit checks are provenance checks, not release signatures. This integration now installs pinned dependencies with `npm ci --ignore-scripts` when the committed lockfile exists. The original physical Pixel run predates this lockfile; its package versions remain recorded separately. Older no-lock checkouts retain the previous installation fallback.

Open **http://127.0.0.1:4310/** on the phone. Keep Termux running. Authenticate using the private value stored in `.agent-control/android-operator-token`, read locally in Termux. Never share it, capture it in screenshots or put it in a URL.

Choose **Views → Environment Discovery**, scan, then open Estate. Ask Mallow:

> Start operator-system-observation@1.1.0

Review and approve the proposal. The locally executed job appears in Process Map. No model/provider is needed. The controller listens only on phone loopback. SSH, ADB and Tailscale were inspection tools, not controller dependencies.

## Phone dashboard and PWA

The Views menu retains the existing dashboard surfaces, crew and floating Mallow. The manifest uses standalone display and a scalable app icon. Physical Chrome reported no installability errors; launcher installation was not exercised. Chrome can package an installed PWA as a browser-managed WebAPK. That optional browser feature is separate from an Agent Control native APK; the ordinary browser path is sufficient.

The service worker caches only an offline explanation. It never caches authenticated APIs, evidence or the live dashboard. If the controller stops, the saved shell explicitly says it cannot execute jobs or report live status.

## Observations and model limitations

Discovery reports the phone's Android version, ARM architecture, SoC, available RAM, storage, Node version and local-controller profile. Restricted CPU enumeration, GPU/NPU capability and unavailable telemetry remain unknown. Zero discovered/configured models is supported.

Base Termux could not provide battery, charging, thermal or metering observations. Existing local ADB pairing was found, but reconnect failed. Desktop ADB access does not qualify a standalone telemetry adapter. No helper app was installed or phone setting changed.

**The Android download → inference → benchmark league chain is not qualified.** The existing benchmark adapter also has Linux-specific control-qualification and Python-sandbox requirements. An Android data-only validator/runtime qualification path remains open work. This preview is not the completed Android AI-workstation showcase.

Mobile admission is enforced before consequential native benchmark actions. Defaults require charging, at least 50% battery, temperature below 40°C, fresh foreground observations, a 512 MiB RAM reserve, a 2 GiB storage reserve, no metered downloads and at most 1 GiB of downloads. Unknown required observations block admission. Feasibility never grants download or execution authority.

Advanced operators can configure validated values in private `.agent-control/mobile-policy.json`: `chargingRequired`, `minimumBatteryPercent`, `maximumThermalCelsius`, `allowMeteredDownloads`, `maximumDownloadBytes`, `minimumFreeStorageBytes`, `allowBackgroundBenchmark`, `maximumObservationAgeMs`, and `memoryReserveBytes`. Policy changes do not create missing telemetry.

A small pinned model was researched for a later control test. It was not downloaded or benchmarked. No model recommendation, quality score, throughput or energy result is claimed.

## Recovery and platform constraints

The physical successful job survived controller stop/restart. Reopen Termux, return to the source directory and repeat the start command. Android can stop background processes; this preview neither changes battery optimisation nor installs a boot service. The primary path is foreground execution. Qualification used a detached process solely to permit independent physical browser inspection.

Core regression tests cover interrupted execution and ledger recovery. Android reclamation, reboot, battery shutdown and interrupted Android downloads/benchmarks remain untested. Review interrupted work before approving another attempt; it must never be labelled successful.

Keep the installation in Termux private home, not shared storage. Ordinary files and Node SQLite support the base controller. Docker, systemd, a desktop browser binary and a Python sandbox are not base dependencies. Optional adapters may require more. Remote estate/providers remain opt-in through existing configuration and governance.

## Evidence and references

See [physical qualification](android-standalone-qualification.md) and the separate [Android resource-node guide](../android/README.md).

Research references: [Termux background restrictions](https://github.com/termux/termux-app), [Termux execution environment](https://github.com/termux/termux-packages/wiki/Termux-execution-environment), and [MDN PWA installability](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable). These explain platform behavior; the qualification report records actual test evidence.

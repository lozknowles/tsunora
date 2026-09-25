# v4.14 RC2 first run

Complete [installation prerequisites](INSTALL-REQUIREMENTS-v4.14.md), install the exact approved checkout and start the normal `npm run web` entry point. Bind to loopback by default. Provision the operator token through the existing environment/credential mechanism; do not put token values in command arguments, logs or evidence.

Open the dashboard and use normal First Run discovery. CPU-only installations may have empty provider/model collections. GPU inventory exposes `OPTIONAL_UNAVAILABLE` when its utility is absent, and `OPTIONAL_DEGRADED` for a failed, timed-out or malformed probe. The controller's CPU inventory remains available. No fake executable, discovery bypass or manual restart should be needed.

`node scripts/agent-control.mjs doctor --json` works before starting the dashboard. Its `CORE_READY` describes installation prerequisites. Optional command availability is distinct from configured service health and from governed worker qualification.

Use the normal operator-system-observation Job/Work Parcel flow, review its admission request and retain its Run, worker selection, artifacts and verification. An empty model/provider inventory does not prevent this read-only core observation Job. Model work requires a separately configured and qualified execution capability.

For an administrator-managed disposable Linux service, use the same Node 24 executable and repository entry point under the installation account, with its working directory and state directory explicitly selected. Keep the operator-token environment file owner-readable only. Start/stop through the service manager, verify dashboard health and then perform discovery. No system service is automatically installed by the bootstrap.

Physical first-run status and exact tested revisions are recorded in the qualification report, not inferred from these instructions.

The final RC2 installed-service receipt distinguishes ordinary discovery/observation from explicitly enabled synthetic qualification Jobs. It records restart/reboot and persistence separately; do not infer these from a dashboard screenshot.

# worker-linux generic managed-node qualification — 2026-08-26

## Verdict

`worker-linux` was qualified read-only through the generic Linux/SSH managed-node boundary. It was reachable through the existing secure-overlay route and non-interactive SSH, projected `IDLE` with a healthy heartbeat, appeared in the shared status/API/dashboard surface, and returned three successful scheduler-managed inspection Runs with checksummed artifacts and provenance. No package, service, runtime, power, optical-drive or workload mutation was issued.

## Read-only inventory

- Host: `worker-linux`; Ubuntu 24.04.4 LTS, Linux 6.8.0-134-generic, x86_64.
- Hardware: Apple MacBookPro8,2; Intel Core i7-2635QM; 8 logical CPUs; approximately 8.23 GB RAM.
- Storage at qualification: root filesystem approximately 243.9 GB total/208.6 GB free; mounted rip storage approximately 1.97 TB total/708.5 GB free.
- Optical: Optiarc DVD RW AD-5970H discovered from the host; no device name is encoded in Agent Control.
- Network/control: secure-overlay daemon `Running`; non-interactive SSH active; the private overlay address is deliberately omitted from repository evidence.
- Runtime: uptime approximately 3 days 22 hours; low load; safely readable CPU temperature 64 C and battery thermal zone 28.8 C at the final probe.
- Tooling: apt/dpkg, snap and Flatpak present; systemd/service, journal, process and Git tooling discovered.
- Workload: `ripdvd-watch.service` active and waiting for the next disc. The preceding rip had completed, verified, copied, removed its local temporary data and ejected before qualification. No ripping process or optical holder was active at the final probe.

The operational resource configuration contains the real SSH endpoint, identity-file location and workload unit/process names. It remains outside the repository. Product source and examples contain no `worker-linux` address, username, device path or credential.

## Live Agent Control evidence

At 2026-08-26 07:17 UTC the node projected:

- state `IDLE`, health `healthy`, maintenance `APPROVAL_REQUIRED`;
- protected workload `dvd-rip` available but `IDLE`;
- secure-overlay state `Running`;
- discovered capabilities including `platform.linux`, `transport.ssh`, `transport.secure-overlay`, `managed-node.inspect`, `managed-node.maintenance`, `tool.shell`, `tool.process.read`, `tool.logs.read`, `tool.package.manage`, `tool.service.manage`, `storage.inspect`, `device.optical` and `workload.dvd-rip`. The operator configuration labels the generic connectivity detector `Tailscale`; the vendor is not named in runtime code.

The read-only qualification created normal durable Runs:

| Operation | Run | Result | Artifact SHA-256 |
| --- | --- | --- | --- |
| `system.identity` | `run-7dd2b1bf-7321-454c-8c16-285b25ff1639` | `SUCCEEDED` | `346cd7395c13def838a8a0e5bdd4491aa6e3b9c3022e0beac671cc31658c0d8b` |
| `package.query openssh-server` | `run-426d6875-3ca9-48fb-b86c-7a7b7a4ab506` | `SUCCEEDED` | `77534af5998374d4cfa1fe70c0a6662eb65cc85ad8faa7c7b0125838553a032c` |
| `service.status ripdvd-watch.service` | `run-34881444-2a42-4d32-9edd-b695bc97779c` | `SUCCEEDED` | `7c1854bdb9cebee02571d96655a2b8c403c26fb206072e376b505d12ca931e51` |

Each Run selected worker `worker-linux`, passed its declared verification and recorded an action-dispatch plus typed-operation evidence. The same live snapshot was observed through `GET /api/nodes`, `agent-control status` on the controller, and the same command from a separate Windows control-plane node through its fixed read-only SSH status client. A real rendered dashboard check showed the Managed Nodes card and the same `IDLE`, heartbeat, OS/kernel, load, memory, workload, maintenance, secure-overlay, storage and capability data.

## Policy and failure qualification

Focused automated tests prove, without mutating the real machine:

- arbitrary Linux resource names use the same discovery/projection path;
- malformed/incomplete probe framing fails closed;
- an active configured rip process or optical holder produces `BUSY` and `BLOCKED_PROTECTED_WORKLOAD`;
- disruptive/excessive worker capabilities are fenced while BUSY, while `managed-node.inspect` remains eligible;
- heartbeat probe failure transitions through `DEGRADED` to `OFFLINE`, and a valid heartbeat recovers;
- mutating operations require named maintenance approval and a protected-workload override while BUSY;
- package/service arguments, service allowlists and runtime fields reject command injection;
- SSH streams only the fixed scripts and never exposes a `sh -c` command channel;
- harmless inspection Jobs retain typed artifacts, evidence and provenance;
- the maintenance Job waits for its exact named approval.

Package installation/update, service restart, runtime update, reboot and shutdown were intentionally not executed on `worker-linux`. Their governed boundary is implementation- and test-qualified, not live mutation-qualified. This preserves the DVD service and the user's active workload policy.

The post-qualification safety check still showed `ripdvd-watch.service` active/enabled with zero restarts and the same 06:54:06 UTC process start, no service journal entry during the qualification window, and no optical-device holder. This is evidence of no observed interruption; it is not a claim that a read-only probe can prove every historical filesystem byte unchanged.

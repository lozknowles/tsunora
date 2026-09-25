# Generic managed Linux nodes

Agent Control 3.1 can register an authorised Linux machine as a managed node by adding a normal SSH resource with a `managedNode` policy. The implementation is agentless: it streams one reviewed probe or typed-action script to `sh -s` over an existing non-interactive SSH transport. It does not install a daemon, expose a listener, or accept an arbitrary command string.

Managed nodes remain ordinary capability-advertising workers. Their logical resource ID is separate from hostname, SSH transport, secure-overlay identity and discovered hardware. No host, username, address, device path, workload name or credential is built into Agent Control.

## Configuration

```json
{
  "id": "linux-worker-a",
  "name": "Media worker",
  "platform": "linux",
  "transport": {
    "type": "ssh",
    "host": "linux-worker-a.example",
    "port": 22,
    "user": "operator",
    "identityFile": "~/.ssh/linux-worker-a"
  },
  "capabilities": [],
  "managedNode": {
    "enabled": true,
    "probeIntervalSeconds": 30,
    "offlineAfterSeconds": 90,
    "approvedServices": ["media-watch.service"],
    "connectivity": [
      {
        "id": "private-overlay",
        "label": "Private overlay",
        "capability": "transport.secure-overlay",
        "serviceUnit": "overlay-agent.service",
        "interfaceName": "overlay0"
      }
    ],
    "workloads": [
      {
        "id": "media-copy",
        "capability": "workload.media-copy",
        "protected": true,
        "systemdUnit": "media-watch.service",
        "processExecutables": ["media-copy-worker"],
        "opticalAccess": true
      }
    ],
    "busyBlockedCapabilities": [
      "compute.intensive",
      "storage.destructive",
      "device.optical.write",
      "system.power",
      "package.mutate",
      "service.mutate"
    ]
  }
}
```

The SSH endpoint must already be authorised for public-key, non-interactive access. Agent Control neither creates nor stores credentials. Configuration validation rejects option-like hosts/users, unsafe service/interface names, invalid package/unit identifiers, unsupported transports, and unsafe runtime paths or branches. Connectivity detectors are likewise configuration: a product-neutral label and capability are derived from a discovered active service and/or network interface, so a particular overlay vendor is not required by runtime code.

Workload detectors are declarative. A configured detector is available only when its unit is discovered or one of its executable tools is present. A detector becomes active when its configured process is observed, or—when `opticalAccess` is enabled—when the probe observes an optical-device holder. Generic DVD tools and optical holders provide a conservative built-in DVD-rip inference without encoding any device name.

## Discovery and state

The fixed read-only probe reports a versioned, base64-framed record stream. The controller rejects malformed or incomplete frames. The projection includes hostname, distribution/version, kernel, architecture, CPU and logical cores, memory, uptime/load, filesystems/free space, optical devices and holders, network interfaces, secure-overlay state when present, temperatures, active services, known tools and relevant process evidence.

3.9 wraps each scalar measurement as `{value, source, authority, freshness, observedAt, limitations, qualifiedForAdmission}`. `/proc/meminfo`, `/proc/uptime`, `/proc/loadavg` and aggregate `/proc/stat` are primary Linux sources. When those views are absent, the fixed probe may use Node's read-only `os` API for memory/uptime/load. If aggregate CPU counters are hidden but per-CPU sysfs cpuidle counters are readable, the controller derives one aggregate busy percentage from two samples and their real interval. That value is labelled `derived`, lists partial-visibility/no-breakdown limitations, and is always `qualifiedForAdmission: false`.

The controller needs a prior counter frame before showing CPU busy. Counter reset, a nonpositive interval, a stale interval or incomplete CPU visibility never becomes zero load. A failed heartbeat changes the last good values to stale. A missing temperature, filesystem, load or CPU source remains `value: null`, `authority: unavailable`; the dashboard and placement code must not substitute a plausible value. Resource admission may use only a measurement whose policy and adapter have separately qualified it.

Every managed node has one of these states:

- `ONLINE`: healthy heartbeat but no workload capability was discovered for a more specific idle/busy classification;
- `IDLE`: healthy heartbeat and no active detected workload;
- `BUSY`: one or more detected workloads are active;
- `DEGRADED`: a recent heartbeat exists but the latest probe failed, or a health warning was discovered;
- `OFFLINE`: no successful heartbeat was received before the configured expiry.

A failed probe first preserves the last good inventory as `DEGRADED`. After `offlineAfterSeconds`, the node becomes `OFFLINE`, maintenance becomes unavailable and worker placement fails closed. A subsequent complete probe restores the current state. Successful discovery synchronises observed capabilities and workload blocks into the existing Worker Registry.

The web dashboard, `GET /api/nodes`, the TUI Resources view and `agent-control status` all read the same `AgentControlService` projection. They show the heartbeat, uptime, load, memory, storage, workload, maintenance state, secure-overlay connectivity and discovered capabilities together with source/authority/freshness where available; no interface maintains a separate node state.

## Governed execution

The remote boundary accepts only these typed operations:

- read-only: `system.identity`, `process.list`, `logs.read`, `package.query`, `service.status`, `housekeeping.preview`;
- maintenance: `package.install`, `package.remove`, `package.update`, `service.start`, `service.stop`, `service.restart`, `housekeeping.journal-vacuum`, `runtime.update`, `system.reboot`, `system.shutdown`.

Arguments are passed as separate SSH operands to one reviewed script. The transport uses batch mode, disables password authentication and forwarding, bounds time/output, supports cancellation and never invokes `sh -c`. Package names, line/size bounds, service units, approved-service membership and configured runtime paths/branches are validated in the controller; the remote script independently validates its typed fields.

Read-only work uses `managed-node.inspect@1.0.0`. Mutating work uses `managed-node.maintain@1.0.0`. Both are normal Job Actions: capability placement, Run history, semantic locks, cancellation, declared verification, checksummed artifacts, evidence and provenance remain authoritative in `JobRuntime` and `AgentControlService`.

Maintenance fails closed without a named Agent Control approval and is unavailable while heartbeat state is degraded or offline. When a protected workload is active, it additionally requires `managed-node.protected-workload-override`. The bundled maintenance Job deliberately waits for that stronger approval on every invocation. A BUSY worker also rejects configured disruptive or excessive scheduling capabilities while retaining harmless inspection placement.

An approval authorises only the already typed operation; it does not create a shell escape hatch or bypass the service allowlist. Lease, baton, ownership, human-takeover and verification authority remain in Agent Control exactly as for other workers.

## Qualification and onboarding

After adding an operator-owned configuration, start the control plane and run a read-only qualification:

```bash
npm run qualify:managed-node -- --resource linux-worker-a
npm run qualify:managed-node -- --resource linux-worker-a --package openssh-server --service media-watch.service
```

The qualifier permits only identity, package-query and service-status operations. It polls the real node, creates normal inspection Runs, requires successful verification and prints the snapshot, worker selection, evidence, artifact checksum and provenance without managed storage paths. It cannot perform maintenance.

Before onboarding another machine:

1. prove existing non-interactive SSH reachability without changing the host;
2. inventory it with the fixed probe and identify protected workloads;
3. add only operator-reviewed workload detectors and service allowlists;
4. run the read-only qualifier;
5. inspect the shared status/dashboard projection and heartbeat failure behavior;
6. review any later maintenance Run and its exact named approval separately.

The implementation does not bootstrap SSH, install packages, change workload configuration, grant `sudo`, expose the dashboard, or claim that a configured runtime can be safely updated without an operator-reviewed node policy.


### Nested execution environments and container discovery

`managedNode.probeTimeoutSeconds` sets the fixed read-only SSH probe deadline (default 20, integer 1–120 seconds). The setting belongs to one resource, so a slow guest does not change the global probe policy. Timeout, authentication, transport, command, capability-absence, cancellation and malformed-output failures remain distinct observations.

The probe detects Podman, Docker and LXC executables and advertises `container.podman.detected`, `container.docker.detected`, or `container.lxc.detected`. These mean tool presence only. Runtime access, container inventory, execution approval and an actual workload must be qualified separately. Runtime observations exclude environment variables, credentials, mounts and sensitive configuration.

An execution environment may be attached to an existing Estate object through the optional evidence-backed containment contract. Agent Control accepts only explicit, acyclic, same-node relationships that lead to a physical machine; it never infers containment from an address, hostname or shared transport. Older discovery-v1 records remain readable.

Resource accounting labels physical capacity, allocated capacity, guest-visible capacity, runtime limits and measured consumption separately. Estate physical totals include physical capacity once per physical device. Nested guest and container figures remain visible but are excluded from those totals.

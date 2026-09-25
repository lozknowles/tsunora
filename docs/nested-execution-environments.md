# Nested Execution Environments

Agent Control 4.8 can represent and operate execution capability contained inside a physical device. The model is generic:

```text
Physical Device
  -> Execution Environment
    -> Runtime
      -> Worker
        -> Invocation
```

An execution environment may represent a host operating system, guest operating system, virtual machine, subsystem, or another evidenced isolation layer. A runtime may represent a container runtime or another execution facility. These concepts do not require a particular device, operating system, virtualisation system, runtime, transport, provider, model, or worker implementation.

## Evidence-backed containment

Nested relationships enter Estate Topology only when discovery supplies a typed parent, relationship, observation time, authority, and method. Agent Control rejects a missing parent, a parent on another physical node, and containment cycles. Similar hostnames or shared addresses do not establish containment.

The Estate view keeps nested branches collapsed by default. Selecting a physical node opens its Node Dashboard and reveals evidenced environments, availability, transport, capabilities, runtimes, worker route, last observation, and provenance. Selecting recorded work opens the Run Inspector with the physical-to-runtime route and retained evidence.

## Discovery and qualification

Managed Linux discovery can observe the presence of Podman, Docker, and LXC executables through the fixed read-only probe. Detection is not execution qualification. A detected runtime remains `DETECTED_ONLY` until separate evidence establishes that it is available for governed work.

Probe deadlines are bounded per resource. Timeout, authentication failure, transport failure, command failure, and missing capability remain distinct states. The probe does not read container environment variables, credentials, private keys, authentication tokens, or sensitive runtime configuration.

Routing is capability-driven. A request for Linux container execution may resolve a compatible nested environment, runtime, transport, and worker route without placing a device or runtime name in product logic. The recorded route decision supplies Mallow's dashboard explanation.

## Resource accounting

Nested environments often report views or limits of the same physical hardware. Agent Control therefore keeps these scopes distinct:

- physical capacity;
- capacity allocated to an environment;
- guest-visible capacity;
- runtime or container limit;
- measured consumption.

Nested values are never added to physical Estate totals. Unknown scope remains unavailable rather than being guessed.

## Physical qualification example

The 4.8 qualification used a Pixel 8 Pro running Android 17 and Podroid v1.2.8. Podroid booted Alpine Linux 3.24.1 under QEMU; Agent Control used an authorised agentless SSH route and Podman 5.8.6 for a real governed container invocation. This is evidence for the generic architecture. Agent Control does not depend on Pixel, Android, Podroid, QEMU, Alpine, Podman, or SSH.

Podman execution is physically qualified for that recorded route. Docker and LXC executable discovery is implemented and tested, but this release does not claim physical Docker or LXC execution qualification from the Pixel experiment.

## Qualification boundaries

The following are not yet qualified by Agent Control 4.8:

- AVF/pKVM;
- a resident Agent Control worker daemon inside the guest;
- physical network-disconnection recovery for the nested route.

Agent Control did not autonomously extend itself. The generic nested-execution changes were implemented with Codex assistance under Agent Control's governed development and qualification process.


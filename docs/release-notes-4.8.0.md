# Agent Control 4.8.0 — Navigable Workspaces

Agent Control 4.8 introduces Navigable Workspaces: one progressive, read-only operational context over the existing Estate Map, Node Dashboard, Run Inspector, telemetry and evidence. Dashboard, CLI and Mallow share workspace identity; no competing topology or new execution authority is introduced.

Follow Estate → device → nested environment → runtime/worker → run → invocation → evidence, and reconstruct the chain in reverse from retained historical work. Back/Forward, breadcrumbs and deep links preserve navigation context. Existing nested-execution capabilities remain part of the release.

- Represent typed physical-device, host, guest, runtime, worker, and invocation relationships without inferring topology from names or addresses.
- Keep nested Estate branches collapsed until needed, then follow the same authoritative hierarchy through Node Dashboard and Run Inspector.
- Discover Podman, Docker, and LXC executables through safe generic managed-node observation. Detection remains distinct from execution qualification.
- Route work deterministically by capability across an evidenced nested environment, compatible runtime, governed transport, and worker route.
- Explain Mallow's selected nested route from the recorded decision rather than retrospective model inference.
- Preserve request, route, timestamps, stdout, stderr, result, artifact checksum, and downloadable Markdown history in the existing evidence path.
- Distinguish physical capacity, allocated capacity, guest-visible capacity, runtime limits, and measured consumption. Nested views are never added to physical Estate totals.
- Keep ordinary devices free of empty environment panels and unnecessary hierarchy controls.
- Accept existing 4.7.1 configuration and state through additive optional fields; no mandatory migration is introduced.

## Physical evidence

The retained physical demonstration used a Pixel 8 Pro running Android 17, Podroid v1.2.8, Alpine Linux 3.24.1 under QEMU, an authorised agentless SSH route, and Podman 5.8.6. The 4.8 workspace release qualification reconstructs this recorded invocation and its evidence using final release source. This is historical evidence reconstruction, not a new physical Pixel execution. Browser touch viewports are not physical handset qualification.

Podroid is not the product feature. Agent Control has no production dependency on Podroid, Android, QEMU, Alpine, Podman, or SSH.

## Qualification boundaries

AVF/pKVM, a resident guest worker daemon, and physical network-loss recovery remain **not yet qualified**. Docker and LXC discovery support does not claim physical execution qualification. Agent Control did not autonomously extend itself; the implementation was Codex-assisted governed development.

See [Nested Execution Environments](nested-execution-environments.md), [upgrade guidance](upgrade-4.8.md), and [release verification](release-verification-4.8.0.md).


## Deferred enhancements

Durable favourites, global workspace search, project/repository semantics, large-estate pagination and controlled terminal/file activation remain post-4.8 work. See [roadmap](../TODO.md), [workspace guide](navigable-workspaces.md), [architectural attribution](../NAVIGABLE_WORKSPACES_REVIEW.md) and [visual evidence](provenance/EXTERNAL-EVIDENCE.md). Rune is a comparator, not a source-code or runtime dependency.

# Agent Control v4.12.1 — Dashboard Navigation and Recovery Visibility

Agent Control 4.12.1 closes focused dashboard limitations without changing the authoritative execution model or granting new execution authority.

## Included

- Authenticated, bounded workspace search across projects, repositories, devices, nested environments, runtimes, workers, runs, invocations and retained artifacts.
- Cursor pagination for workspace search results, derived directly from current authoritative Agent Control records.
- Durable per-operator workspace favourites. Stored preferences contain opaque workspace identities only; current labels and states are always resolved from authoritative projections.
- Governed read-only **WATCH** entry from a workspace when an exact recorded execution session exists. Intervention and control remain subject to the existing Live Shell authorization path.
- A chronological containment and recovery timeline derived from durable kill, quarantine and recovery records.
- Responsive fixes for long authorization states and containment records in desktop, portrait-mobile and landscape-mobile layouts.
- Evidence-backed project and repository workspaces derived from durable Work Board declarations and resolved repository snapshots.
- Protected viewing of retained Agent Control-managed artifacts through the existing authenticated, redacted evidence viewer.

## Authority and evidence boundaries

- Opening, searching or favouriting a workspace grants no execution capability.
- A workspace can expose an existing WATCH attachment, but cannot create a session or elevate it to INTERVENE or TAKE CONTROL.
- The timeline is an operational projection over durable containment records. It is not a second audit store and does not reconstruct missing events.
- Missing telemetry remains unavailable rather than zero.
- Repository source-file activation remains unavailable by design; only retained Agent Control-managed artifacts can be opened, through the existing authenticated redacted path.
- Project/repository relationships are shown only when durable evidence exists. They are associations to execution, not a second containment topology.

See [Navigable Workspaces](navigable-workspaces.md) and the [4.12.1 dashboard qualification report](AGENT_CONTROL_4.12.1_DASHBOARD_QUALIFICATION.md).

# Agent Control 4.8 Navigable Workspaces review

## Executive result

**Prototype justified.** Agent Control already held the authoritative objects needed for navigation, but exposed them through separate Estate, Node Dashboard and Run Inspector entry points. The prototype adds a small read-only navigation projection over those sources. It does not create a competing topology, grant control, or make transport part of identity.

Agent Control source inspected: `354a66b10a1b9a50b5cbdeccee0c4f73bf89a4a3` on the isolated `prototype/4.8-navigable-workspaces-20260914` branch.

Rune source inspected: `9d9c110f92cc68d62b1050c4986422c998248759` from [unstablebuild/rune](https://github.com/unstablebuild/rune), with its [SSH workspace](https://docs.rune.build/learn/ssh/), [extension](https://docs.rune.build/develop/extensions/) and [network](https://docs.rune.build/learn/network/) documentation. Rune is GPL-3.0-or-later. Only architectural concepts were compared; no Rune source, assets or dependencies were copied.

## Actual 4.8 implementation before the prototype

| Capability | Status | Authoritative implementation |
|---|---|---|
| Estate to device navigation | ALREADY PRESENT | Estate Runtime Map and Node Dashboard |
| Nested environment/runtime containment | ALREADY PRESENT | Evidence-backed Node Dashboard projection |
| Device/run relationship | ALREADY PRESENT | Node Dashboard work list and Run Inspector physical nodes |
| Recorded route, worker, transport and reason | ALREADY PRESENT | Run Inspector execution route |
| Invocation input/output | ALREADY PRESENT | Run Inspector calls and exchanges |
| Input/cached/output tokens | ALREADY PRESENT | Canonical usage projection in Run Inspector |
| Baton/context records | ALREADY PRESENT | Runtime Map and Run Inspector context |
| Human-readable history/download | ALREADY PRESENT | Existing run-history controls and checksums |
| One continuous breadcrumb path | PARTIAL | Links existed, but no shared progressive navigation object |
| Bottom-up historical reconstruction | PARTIAL | Evidence existed, but operators had to correlate separate views |
| CLI navigation | MISSING | CLI exposed status/jobs but no workspace projection |
| Mallow workspace explanation | MISSING | Mallow understood constituent objects, not the shared path |

## Rune comparison

| Rune concept | Agent Control equivalent | Decision | Reason |
|---|---|---|---|
| Scheme-based local/remote workspace identity | Provider-neutral node/environment identity and transport adapters | ADAPT GENERICALLY | Keep identity independent of SSH or local transport. |
| Local UI beside remote files, terminals and tasks | Dashboard plus governed execution sessions and work parcels | ADAPT GENERICALLY | Navigation can expose availability, while existing authority gates remain decisive. |
| Recent workspace reopening | Existing object identities and retained run evidence | ADAPT GENERICALLY | Session-local recent navigation is useful; it is not authoritative state. |
| Workspace-scoped extension processes | Capability adapters and workers | ALREADY BETTER IN AGENT CONTROL | Agent Control already records capabilities, routing, governance and evidence independently of a UI workspace. |
| Remote lifecycle and stale terminal invalidation | Freshness, availability and execution-session states | ALREADY BETTER IN AGENT CONTROL | Live, stale, historical and unavailable are explicit rather than implied by an editor connection. |
| Terminal as core workspace content | Governed WATCH/INTERVENE execution sessions | REJECT AS DEFAULT | Opening a view must not grant terminal authority. |
| IDE/editor ownership of project files | Protected resources and repository-aware jobs | NOT RELEVANT | Agent Control is an operations control plane, not an editor. |
| Rune Network | Existing Agent Control transports | REJECT | A paid or vendor-specific network would undermine transport independence. |

## Agent Control-native design

The workspace is a derived operational context:

```text
Estate
  → Device
    → Execution Environment
      → Runtime / Worker
        → Run
          → Invocation
            → existing evidence and history
```

Runtime and transport are context, never authority or identity. Top-down navigation uses Node Dashboard containment and work records. Bottom-up navigation uses a Run Inspector's recorded physical node and execution route. Historical workspaces reconstruct only what retained evidence proves.

The schema exposes:

- opaque, versioned identity;
- mode and status;
- parent, breadcrumbs and progressively disclosed children;
- capability states (`AVAILABLE`, `REQUIRES_AUTHORIZATION`, `UNAVAILABLE`);
- redacted context and evidence references;
- links to the existing authoritative dashboard and history.

## Security and governance

- Workspace API reads require existing operator authentication.
- No POST, PUT, PATCH or DELETE workspace route exists.
- IDs are bounded and strictly decoded.
- Full projections pass through Agent Control's security redactor.
- Credential-like transport metadata is tested for removal.
- Missing token telemetry stays unavailable.
- File, terminal and execute capabilities never become `AVAILABLE` solely because a workspace is opened.
- Mallow receives deterministic facts from the same projection and an explicit false control-authority fact.

## Prototype surfaces

- API: `GET /api/workspaces` and `GET /api/workspaces/:id`.
- Dashboard: Workspaces entry, breadcrumbs, browser-style back/forward, progressive children, tokens, invocation exchange, route explanation, Mallow focus and links back to authoritative evidence.
- CLI: `workspace list`, `workspace open`, and `open job`.
- Responsive behavior: full-screen dialog on narrow screens, reduced card density and reduced-motion support.

## Qualification result

Both required flows passed in the production dashboard renderer against retained authoritative Pixel execution records:

- Flow A: Estate → device → nested environment → runtime/worker → run → invocation → evidence.
- Flow B: historical run → reconstructed runtime/environment/device → invocation/evidence.

Desktop `1440 × 1000`, mobile portrait `390 × 844`, and mobile landscape `844 × 390` were captured and inspected. The existing human-readable history opened from the run workspace with its Markdown download, checksum and retained invocation output. The CLI reconstructed the same route with `agent-control open job RUN-ID`.

The final repository check passed **1,576 tests, 0 failures, 0 skipped** in 169.3 seconds. It included distribution, TypeScript, bootstrap syntax, dashboard syntax, neutrality, implementation-status, security/redaction, workspace API, CLI, Mallow, responsive and full regression checks.

The retained Pixel/Alpine/Podman record demonstrates historical reconstruction and is labelled historical. It is not a new physical execution. A controlled terminal/file opening flow remains outside this prototype because it requires separate existing authorization.

## Recommendation

The prototype is suitable as an isolated review candidate. Keep durable favorites, global search, project/repository workspace semantics, and controlled file/terminal activation as later work. Do not merge, push, tag, release or deploy from this review.

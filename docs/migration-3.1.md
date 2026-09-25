# Migration notes: 3.0.1 to 3.1.0

3.1 is additive and based on the tagged 3.0.1 infrastructure-neutral architecture.

- Existing workspace version remains readable.
- Lanes without a verification record migrate to `unclaimed` with no universal evidence requirements.
- Lanes without a routing decision continue normally; a durable rationale appears only after material selection.
- Existing TUI keys and control-room behavior remain available.
- Existing resources, providers, services, lanes, Orca adapter, execution fallback and context store are unchanged.
- The dashboard adds no configuration-file secrets. Its operator token is process environment only.
- The web listener is localhost by default. Existing installations can set `AGENT_CONTROL_WEB_ENABLED=0` for identical pre-3.1 network behavior.

No migration grants browser authority, changes leases, adopts Orca as policy, exposes a remote port, or deploys a service.

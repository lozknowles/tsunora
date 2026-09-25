# Tsunora

**Connect work to capability.**

**Tsunora 0.1 is development software.**

**Digital Labour Exchange is experimental.**

Tsunora is an operating environment for digital work, derived from Agent Control.
It connects scoped work to qualified workers, governs execution, verifies bounded outcomes, and retains evidence and internal accounting.

**Powered by Agent Control.**

Tsunora **0.1.0-dev** is a local research product. Agent Control runtime lineage is **4.15.0**. The Digital Labour Exchange is **experimental**, not production-qualified. This fork does not expand inherited qualification claims.

## Run

Use the inherited [installation guide](docs/provenance/AGENT-CONTROL-README.md) and locked dependencies (`npm ci`). Start the configured runtime with `npm run web` and open `/tsunora.html` on its configured origin. The landing page opens a work-first authenticated exchange workspace. `/` preserves all Agent Control controls.

Exchange use requires explicit `AGENT_CONTROL_LABOUR_EXCHANGE=1` configuration and trusted host registration of organisations, backends, workers and verifiers as documented in [the inherited operations guide](docs/DIGITAL-LABOUR-EXCHANGE-v4.15-OPERATIONS.md). Without it, the workspace reports unconfigured; it does not create sample workers. Import an authorised, scoped WorkOrder to submit work. Registration/qualification authority remains in the runtime.

## Read

- [First-run installation and operator authentication](docs/installation-first-run.md)
- [Fresh Android Termux prerequisites](android/README.md#fresh-termux-prerequisites)

- [What is Tsunora?](docs/WHAT-IS-TSUNORA.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Digital workforce](docs/DIGITAL-WORKFORCE.md)
- [Exchange boundaries](docs/DIGITAL-LABOUR-EXCHANGE.md)
- [Fork report](TSUNORA-FORK-REPORT.md)
- [Agent Control lineage](docs/provenance/AGENT-CONTROL-LINEAGE.md)

No production deployment, public repository or new release is implied. Work moves. Responsibility remains.

## Publication lineage

This source snapshot was privacy-sanitized from the private full-history Tsunora lineage. Original commits remain provenance references, not Git parents. See [publication provenance](docs/provenance/PUBLICATION-LINEAGE.md). A top-level software licence has not yet been selected; publication remains blocked pending owner confirmation. Vendored notices retain their own terms.

# Tsunora

**Connect work to capability.**

![Tsunora — from complexity to capability](docs/assets/tsunora-hero.png)

Tsunora is a governed operating environment for digital work, derived from Agent Control. It connects scoped work to qualified digital workers, governs execution, verifies bounded outcomes, and retains evidence, provenance and internal accounting.

**Current product status:** `0.1.0-dev`  
**Agent Control runtime lineage:** `4.15.0`  
**Current qualified development line:** `research/workforce-ops`  
**Qualification anchor:** `3e0e6cb183c4a6941c9fdf24aee1ef7870996ee8`  
**Status:** **EXPERIMENTAL — PASS WITH LIMITATIONS**

The Digital Labour Exchange and Workforce Operations prototype are research software, not a production HR/payroll platform. Workers used in the current physical demonstration are deterministic; real enterprise integrations, production authentication and model-backed workforce execution remain separately unqualified.

## Why “Tsunora”?

**Tsunora is a coined brand name**, inspired by the Japanese word *tsunagu* (繋ぐ), meaning “to connect” or “to link”. Tsunora itself is not presented as a Japanese word.

The name also carries forward the idea behind **KNect Solutions**: connecting people, process, technology and solutions. Tsunora extends that principle to:

**work · workers · skills · tools · evidence · outcomes**

The product idea is simple: turn fragmented capability into governed, verifiable work.

> **Work moves. Responsibility remains.**

## What is in the current development line?

The current branch combines the privacy-reviewed Tsunora baseline with the qualified Digital Labour Exchange, Paperclip-informed architectural decisions and the Workforce Operations research prototype.

### Digital Labour Exchange

The exchange provides governed allocation between work and digital workers. Its current design includes stable worker identity independent of model/backend, contract-bound verification, budget and admission controls, organisation-scoped accounting, single-writer ownership, backend revision/qualification, retained bids/awards/attempts, and resource/transaction accounting.

The Paperclip review was used as a source of architectural techniques, not as a dependency. Techniques judged useful were adopted or matched to existing Agent Control controls; provider-specific coupling, mandatory hierarchy metaphors, hard financial claims and unsupported distributed-control assumptions were deliberately rejected or deferred.

See:
- [Paperclip disposition](docs/PAPERCLIP-v4.15-DISPOSITION.md)
- [Digital Labour Exchange design](docs/DIGITAL-LABOUR-EXCHANGE-v4.15-DESIGN.md)
- [Digital Labour Exchange qualification](docs/DIGITAL-LABOUR-EXCHANGE-v4.15-QUALIFICATION.md)
- [Economic qualification](docs/DIGITAL-LABOUR-EXCHANGE-v4.15-ECONOMIC-QUALIFICATION.md)

### Workforce Operations prototype

The current research prototype physically demonstrated three governed workforce scenarios:
- autonomous low-risk completion;
- high-risk approval pause and resume;
- wrong-target scope block, owned-process containment, quarantine and recovery.

The frozen R&D workload executed 360 cases across three configurations. Boundary outcomes were 120/120, 100/120 and 120/120. The 20 retained failures were cases where recovery correctly found no eligible replacement worker.

The full repository regression at the qualification anchor was **2,480/2,480 PASS**.

## Branch and provenance model

- `main` preserves the clean public publication lineage rooted at `2915a630db0ead1333cc9657ef44af9e953cc19b`.
- `research/workforce-ops` is the current qualified development line and is where new Tsunora work should continue.
- The workforce qualification anchor `3e0e6cb…` is a direct child of the reviewed public base.
- Documentation-only commits after the qualification anchor do not expand the qualification claim.
- Private evidence and local-environment artefacts are intentionally excluded from public Git.

## Run

Use the inherited [installation guide](docs/provenance/AGENT-CONTROL-README.md) and locked dependencies (`npm ci`). Start the configured runtime with `npm run web` and open `/tsunora.html` on its configured origin.

Exchange use requires explicit `AGENT_CONTROL_LABOUR_EXCHANGE=1` configuration and trusted host registration of organisations, backends, workers and verifiers as documented in the [operations guide](docs/DIGITAL-LABOUR-EXCHANGE-v4.15-OPERATIONS.md). Without that configuration, the workspace fails closed.

## Read

- [What is Tsunora?](docs/WHAT-IS-TSUNORA.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Digital workforce](docs/DIGITAL-WORKFORCE.md)
- [Workforce prototype design](WORKFORCE-PROTOTYPE-DESIGN.md)
- [Workforce prototype qualification](WORKFORCE-PROTOTYPE-QUALIFICATION.md)
- [Workforce prototype R&D results](WORKFORCE-PROTOTYPE-RD-RESULTS.md)
- [Workforce prototype threat model](WORKFORCE-PROTOTYPE-THREAT-MODEL.md)
- [Publication provenance](docs/provenance/PUBLICATION-LINEAGE.md)
- [Agent Control lineage](docs/provenance/AGENT-CONTROL-LINEAGE.md)

## Licence

Copyright 2026 Lawrence Knowles.

Tsunora original code, including inherited original Agent Control runtime code, is licensed under the [Apache License, Version 2.0](LICENSE). Third-party components retain their own licences and attribution requirements; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

**Powered by Agent Control.**

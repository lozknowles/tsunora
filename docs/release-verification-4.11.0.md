# Agent Control v4.11.0 release verification

## Qualified source lineage

The v4.11 implementation was developed as a clean descendant of public v4.10.0 commit `6102d4889a836c6477cd70d574df9fadee9cea4a`. The implementation commit is `796bc70a06e5088837116c00ab2e11ef21149150`; qualification documentation was recorded in candidate `f96e934e57dd65937880d87180f1ecfc0b5fa0ae`. Release metadata is applied afterward and every mandatory gate is rerun against the resulting exact release candidate. Public PR, merge, tag, artifact and independently downloaded-install provenance are recorded in the GitHub release receipt.

## Retained qualification

The implementation candidate passed 1,899 tests with zero failures and zero skips, a virgin installation, an additive public-v4.10.0 upgrade, the Limitations Ledger silent-drop gate, and physical prompt-route promotion, restart persistence and rollback. The physical evidence is retained in [the qualification report](evidence/AGENT_CONTROL_4.11_PROMOTION_ROLLBACK_QUALIFICATION.md) and its [structured record](evidence/model-improvement-promotion-rollback-4.11.json).

## Release gates

The exact release candidate must pass the complete project check, focused Model Improvement and intervention coverage, Work Board and containment/quarantine coverage, Limitations Ledger and carry-forward checks, security tests, dashboard and bootstrap syntax, TypeScript, distribution policy, infrastructure neutrality, implementation-status consistency, documentation links, clean packaging, virgin installation and a v4.10.0 upgrade.

A bounded disposable-route smoke must reproduce sealed proposal approval, independently verified `PROMPT` application, receipt-backed `PROMOTED`, restart persistence, independently verified rollback and receipt-backed `ROLLED_BACK`. Protected services must compare unchanged before and after.

Publication is complete only when public `main`, annotated `v4.11.0`, release assets and checksums agree, and a package downloaded from the public GitHub Release passes a fresh install and leak inspection.

## Boundaries

Only `PROMPT` is physically qualified. Generic canary allocation is not implemented. Arbitrary production-route promotion is unqualified. No model-weight self-modification is claimed. The complete carried-forward boundaries are in the [Limitations Ledger](KNOWN_LIMITATIONS.md).

# v4.13 to v4.14 RC2: upgrade and rollback contract

These are review instructions, not permission to change an existing installation. Exact disposable-installation outcomes and tested source revisions are in the accompanying FINAL-RC2-REPORT.md and RC2-QUALIFICATION-RECEIPT.json. A failed or untested gate remains a blocker; no RC1 result is a substitute.

Before an approved upgrade, retain the exact v4.13 source and locked dependencies and an owner-protected backup of configuration, state, ledgers, permissions and required credentials. Verify backup readability and checksums. Stop only the explicitly authorised installation through its own service manager. Install the approved exact revision using the documented bootstrap, preserve the working/state directory and account, then start the ordinary entry point.

Verify authentication, dashboard/API, configuration identity, prior Job statuses and append-only ledger history. Run an approved observation Job. Doctor CORE_READY alone does not establish a healthy service or a qualified model route.

For rollback, stop the authorised candidate service, retain its evidence separately, restore the exact v4.13 source/dependencies and restart with the prior configuration. Check old state and run a new observation Job. Never silently delete or reinterpret unfamiliar evidence. Restore the protected pre-upgrade backup if operational compatibility fails, preserving the candidate evidence first.

RC2 qualification explicitly exercises semantic, repair and no-progress artifacts, observer-derived identity metadata, gated synthetic forensic records and experimental environment configuration before downgrade and re-upgrade. The final receipt classifies each format separately. Opaque forward-only evidence may be preserved even when v4.13 has no semantic viewer; this is acceptable only when old operational state remains usable and no ledger corruption or silent reinterpretation occurs.

Experimental qualification settings are not normal deployment defaults. Do not carry an experiment into production merely because rollback preserves its files. Optional capabilities, model execution, paid escalation, private capture and recording remain subject to their own gates.

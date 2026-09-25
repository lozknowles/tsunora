# Agent Control 4.6.0 final release verification

The operator approved RC `056c94758fdf5b9b1114ffcf9f6a2dad00282246` and its 15 non-blocking limitations for publication. The final branch preserves both that RC and the existing main maintenance history, including the Android owned-process termination adapter and stable regression fixtures.

Version metadata and installation references identify **4.6.0 / v4.6.0**. The accepted [RC evidence](release-candidate-4.6.md) remains historical; the separately recorded [final validation](../examples/showcase-4.6/final-release/validation.json) binds the final source and tests. [Final gate](../examples/showcase-4.6/final-release/rc-gate.json).

Core **PASS**; Estate / Process **PASS**; governance / security **PASS for tested boundaries**. Showcase, Android Standalone, usage/energy and Model Intelligence/Morning Brief retain **PASS WITH LIMITATIONS**. The complete target-model/Personal-League demonstration is not claimed. [Known limitations](known-limitations-4.6.md) and [post-release queue](post-4.6-work-queue.md).

The GitHub release assets provide the source archive, evidence archive, validation log and SHA-256 manifest. The tag and main target are recorded in the published release manifest. No production service deployment forms part of publication.

Final full gate: **3/3 tests passed**, zero failures or skips; typecheck passed. The first mechanical run found two links to receipts that had not yet been written. After writing the receipts, the complete unchanged test suite passed; the initial failure hash remains in validation. The final source retains two additional stable-maintenance tests beyond the approved 1,464-test RC. [Operator authorisation](../examples/showcase-4.6/final-release/operator-authorisation.json).

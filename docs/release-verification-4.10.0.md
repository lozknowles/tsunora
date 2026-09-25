# Agent Control 4.10.0 release verification

## Source reconciliation

- Public v4.9.0 and pre-release public `main`: `fe9a879e4360d3249c44ee21f0279761a182bd0d`.
- Work Board and quarantine candidate: `1d49b593ecd650e68d3cd4a31f75012f5414afe0`.
- Reliability candidate / PR #25 head: `b9bd904115ad1c6addcf17c009a045ab618e3213`.
- Phone-hosted planning candidate: `a2230e433f4bcd3f11cab7f4fc52d6ffbb8c816c`.

The Work Board candidate already contains the phone candidate. PR #25 diverged from public v4.9.0; its direct-inference changes were equivalent to changes already present in the Work Board ancestry, while its activity-log repair, protected workspace metadata, cancellation safeguards, qualification tests and retained evidence were unique. The release branch merges both histories without squashing their provenance.

| Candidate/change | Classification | Release treatment |
|---|---|---|
| Dynamic Work Board, parallel lane scheduler and containment | INCLUDED | Physically qualified constituent candidate retained. |
| Quarantine scheduling fence | INCLUDED | Physical worker exclusion, restart, alternative route, blocked fallback and recovery evidence retained. |
| PR #25 reliability safeguards | MERGE_REQUIRED | Merged as qualified reliability work; equivalent direct-inference code not duplicated. |
| Phone-hosted model/computer-use candidate | UNQUALIFIED_OPTIONAL | Generic infrastructure retained; physical end-to-end support is not claimed. |
| Interaction profiles, capability drift, transactional approvals and W3C correlation | INCLUDED | Agent Control-native abstractions; no external runtime dependency. |
| Typed outbound-worker transport | UNQUALIFIED_OPTIONAL | Contract/state-machine evidence retained; no physical transport claim. |
| Older draft PRs #2, #5, #20 and #21 | DEFERRED | Historical draft work outside the v4.10 delta; not merged by this release. |

## Release gates

The exact final source must pass distribution, type checking, bootstrap and dashboard syntax, infrastructure neutrality, implementation-status consistency, documentation links, the complete regression suite, clean packed installation, public-v4.9.0 upgrade, archive inspection, security review and a bounded final Work Board/quarantine smoke test. Exact results and artifact hashes are retained in the immutable release receipt published with the release.

## Qualification boundary

Physical qualification applies to the measured Linux host behaviors recorded for the Work Board and containment candidates. Broader contract behavior is automated-test qualified. Pixel/remote containment, a physical generic outbound-worker transport, and a physical phone-hosted model/computer-use route remain experimental or unqualified.

Known limitations remain: no distinct runtime kill scope; no complete dashboard containment/recovery timeline; some restart cases remain automated-test rather than separate physical qualification; Pixel/remote containment is unqualified; the generic outbound-worker transport remains experimental.

Publication does not authorize deployment or modification of operational Agent Control installations.

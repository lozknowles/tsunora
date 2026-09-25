# Agent Control 4.5 Environment Discovery qualification

Date: 2026-09-12

Branch: `feature/4.5-environment-discovery`
Verdict: **PASS — LOCAL NON-DISRUPTIVE SCOPE; REMOTE/MOBILE PHYSICAL QUALIFICATION NOT TESTED**

## Scope and integrity

The production `EnvironmentDiscoveryRuntime`, authenticated dashboard API and
shared Runtime/ Estate Map renderer were exercised in an isolated dashboard
process. No live Agent Control deployment, model service, provider credential,
route or production configuration was changed. Remote discovery was not selected
because no remote configuration was supplied to the isolated qualification.

The full scan completed with no contained adapter failures and found nine real
or authoritative in-process resources:

| Type     | Identity                          | Result                                         |
| -------- | --------------------------------- | ---------------------------------------------- |
| Machine  | `controller-host`                        | healthy local OS observation                   |
| GPU      | NVIDIA Quadro P5000               | healthy `nvidia-smi` observation               |
| Endpoint | local llama.cpp                   | healthy bounded endpoint probe                 |
| Model    | `qwen2.5-3b-instruct-q4_k_m.gguf` | discovered, unqualified                        |
| Runtime  | Codex                             | installed, not running; qualification required |
| Agent    | controller                        | healthy worker-registry evidence               |
| Tool     | environment discovery action      | active                                         |
| Job      | qualification Job record          | active                                         |
| Memory   | Your Memories                     | explicitly selected, unqualified               |

This classification is deliberate. A discovered model did not become qualified,
Codex file presence did not become authenticated execution, and Your Memories
selection did not grant access or activation.

## Estate Map

The same browser switched from Environment Discovery to **Runtime Map → Estate
Map**. The `agent-control.runtime-map/v1` Estate projection contained 10 nodes
and 9 explicit edges, was backed by the discovery scan SHA-256 and showed current
resource-specific freshness. Search/filter controls, Estate heartbeat and shared
graph status language were visible. No second graph engine or estate database was
introduced.

Automated evidence separately proves that an expired machine heartbeat becomes
`NOT_CURRENTLY_VERIFIED`, that similarly named runtimes/models are not linked
without relationship evidence, and that connection data contains only the fixed
credential mask `••••••••••••`.

## Governance and security

- Configuration proposals created: **0**.
- Configuration mutations: **0**.
- Provider/model calls: **0**.
- Raw credentials in inventory, graph or evidence: **0**.
- Remote/network sweep: **not performed**.
- Browser errors at the discovery/capability/installation/Estate APIs: **0**.
- Community capability contracts are stripped of executable behavior and remain
  untrusted until reviewed, validated, bounded-tested, approved and enabled.

## Evidence

- [Machine-readable scan](../evidence-archive.md)
- [Evidence manifest](../evidence-archive.md)
- [Complete human-readable transcript](../evidence-archive.md)
- [Environment dashboard](../evidence-archive.md)
- [Environment drill-down](../evidence-archive.md)
- [Estate Map](../evidence-archive.md)
- [HD recording](../evidence-archive.md)

The MP4 is H.264, 1920×1080 and 8.04 seconds. Its SHA-256 is
`0153ba46129750bcc765916def3f8189147bd672661410f7d0f719de9944ad07`.
All other sizes and hashes are in the manifest.

## Qualification-discovered defects

The first exact-candidate recording found two implementation defects before the
successful run. The dashboard scan handler addressed a non-existent status
element, so a real operator click failed before issuing the discovery request.
The element contract is corrected and a dashboard test now checks every element
ID referenced by the discovery script. Separately, a timed CLI probe could remain
open when a descendant retained its stdout/stderr descriptors. The default probe
now owns a bounded process group, terminates that group at timeout and returns a
sanitized `command_timeout`; a deterministic descendant-process regression test
proves the bound. The successful evidence bundle was regenerated after both
fixes.

## Validation

- Focused Environment Discovery, capability-registry, Estate Map, dashboard and
  installation tests: **23/23 passed**.
- Complete Agent Control regression: **1,219/1,219 passed**.
- TypeScript: passed (`tsc --noEmit`).
- Dashboard and bootstrap syntax: passed.
- Infrastructure neutrality: **3/3 passed**.
- Implementation-status registry: **58 entries passed**.
- Markdown links: **214 files checked; all local links resolve**.
- Scoped implementation/evidence secret-pattern scan: passed. Synthetic secret
  fixtures in the repository's dedicated redaction tests were intentionally
  excluded from this artifact scan and remained covered by the full suite.
- `git diff --check`: passed.

## Limitations

This run does not qualify Android/iOS discovery, Tailscale/ZeroTier/ADB, a remote
custom executable, paid provider verification, authentication actions, or
cross-device capability portability. Those paths have deterministic contracts
and fail-closed tests but need their actual configured estate and explicit scope.
No unavailable route is counted as a pass. Agent Control 4.5 remains
**EXPERIMENTAL**. Desired-state management and remediation belong to 4.6.
The isolated evidence server configured only the discovery, capability,
installation and Estate Map dependencies under test. Consequently the shared
dashboard visibly labels unrelated Morrow/Jobs projections as unconfigured;
those states are not discovery failures and are not counted in the scoped
browser-error assertion.

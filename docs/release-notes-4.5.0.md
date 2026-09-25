# Agent Control 4.5.0 release candidate

Agent Control 4.5 is a **release-ready candidate**. The frozen product
implementation is `31ccdf07f9aeb96cec0ea87a8cfb2bf1607ae86b`; its first
evidence-only descendant is `8399cc657eb8be77bbcde61be8fcd2fbf16015bd`.
Agent Control 4.4.0 remains the latest formally released baseline until the
separate `v4.5.0` release operation is completed.

## Candidate scope

The candidate includes governed skill learning and deterministic skill
promotion, provider-neutral **Your Memories**, the Cross-Device Session Vault,
power-aware evidence, Environment Discovery, the live Estate Map, Process Map,
Control Room, Replay, graphical Compare, Morrow and the six crew roles. These
features remain projections and governed extensions of the existing Work Parcel,
route, execution, memory and evidence sources of truth.

Discovery is read-only by default and separates discovered, qualified,
recommended, approved and active state. Estate Map and Process Map share one
graph language but do not own configuration or execution. Runtime Map WATCH is
read-only; map-originated mutation remains deferred to 4.6 governance work.

Your Memories remains advisory. Session Vault preserves exact source evidence;
Obsidian is optional and does not replace Agent Control's provider-neutral
memory architecture. Deterministic skills require repeated verified sources and
explicit promotion. Model output cannot install executable code.

## Frozen-candidate qualification

The final candidate passed 1,331/1,331 automated tests. An earlier exact physical Runtime
Map run exercised six concurrent jobs, a local Qwen model call, real terminal
output, a controlled retry, eight sealed batons, aggregation, independent
verification, Control Room, Replay, graphical Compare and Process/Estate
cross-linking. The final projection had 71 nodes and 75 edges. A separate
read-only discovery scan populated the Estate Map from nine genuine local
resources with no configuration mutation. Real 1920×1080 screenshots from both
runs are in the README.

The later source-distribution and virgin-install qualification used ordinary
full clones rather than shallow/partial workarounds. A clean Android 15/Termux
installation transferred 5.93 MiB, completed bootstrap and idempotent reinstall,
started the dashboard before discovery, populated its Estate Map from actual
observations, completed a genuine governed job and independently verified a
real `HEALTHY → OFFLINE/REMOVED → HEALTHY/CHANGED` state transition. Historical
heavy media remains publicly retained by immutable hash outside normal source
clones.

Every row of the historical 12-route Your Memories matrix remains accounted
for. Eleven exact historical routes are now PASS/FIXED. The exact OpenRouter
GLM-5.3-Flash→Qwen route remains `BLOCKED_EXTERNAL`; a separate production run
proved the same exact GLM model→Qwen pair through the qualified NVIDIA-hosted
adapter without relabelling the blocked route. Qwen→Pixel Gemma 4 E4B passed the
unchanged semantic verifier after the expected bare `nextAction` representation
was made explicit. Its two public aliases represent one physical route, not two
runs. The MSI account-isolated Luna→Sol transition and beneficial Qwen/Sol
consolidation remain preserved historical evidence.

Token and cache use is reported with its authority. The fresh Runtime Map model
call reported 68 input tokens, including 67 cached and one newly processed,
plus 28 output and 96 total tokens. Monetary cost was unavailable and is not
claimed.

## Negative results and release boundary

The exact `openbmb/MiniCPM5-2B-GGUF` Q4_K_M configuration remains `FAILED` for
governed code repair: 0/3 controller-node GPU, 0/1 comparable remote Linux seed and 0/3
CPU. Known-good and scripted real-path controls passed. Agent Control denies only
that immutable configuration and does not label the MiniCPM family failed.

The qualified route-intent specialist consumed more measured-component energy
per verified result than warm Qwen. The specialist-energy advantage is therefore
`DISPROVEN`. The warm-residency route effect is also `DISPROVEN` at the available
measurement resolution. Synchronized whole-node energy remains
`BLOCKED_EXTERNAL`; board and package readings are not whole-node measurements.
No automatic energy, shutdown or residency policy is released.

These experiments remain part of the 4.5 record, but their outcomes are not
relabelled as product successes. The later acceptance-contract audit established
that 4.5 was required to test the energy and residency hypotheses truthfully;
it was not required to enable a disproven optimisation. Whole-node
instrumentation blocks a whole-node claim, which 4.5 does not make. The tested
specialist/residency energy routes remain disabled.

The current verdict is **PASS WITH LIMITATIONS — READY FOR 4.5 RELEASE**.
OpenRouter GLM-5.3-Flash→Qwen remains externally blocked, the exact MiniCPM
configuration remains failed and unroutable, whole-node energy remains
unavailable, and Runtime Map remains WATCH-only. These limitations fail closed
and do not become active release claims. No merge, tag, GitHub Release or
deployment is performed by these notes.

See the [final release-closure audit](provenance/EXTERNAL-EVIDENCE.md),
[historical release-closure audit](provenance/EXTERNAL-EVIDENCE.md),
[completion gate](provenance/EXTERNAL-EVIDENCE.md),
[historical reconciliation](provenance/EXTERNAL-EVIDENCE.md),
[skill-learning architecture](agent-control-4.5-skill-learning-architecture-review.md),
[deterministic skill guide](deterministic-skill-promotion.md),
[Your Memories portability guide](project-memory-portability.md),
[Runtime Map guide](runtime-map.md), [Environment Discovery guide](environment-discovery.md),
[energy guide](energy-aware-intelligence.md), and
[deployment/rollback guide](DEPLOYMENT.md).

# Agent Control 4.5 deterministic skill promotion qualification

Status: **PASS_PHYSICAL_DETERMINISTIC_SKILL_PROMOTION**. This isolated candidate
is not merged, tagged, released or deployed.

## Boundary

- Physical node: controller-host
- Teacher: local OpenAI-compatible Qwen 2.5 3B endpoint
- Energy: Intel package + DRAM RAPL plus NVIDIA board power
- Idle baseline: 48.376 W
- Limitations: excludes motherboard, storage, PSU losses and peripherals; shared
  GPU processes may contribute.
- Evidence: [`qualification.json`](../evidence-archive.md),
  [`energy.json`](../evidence-archive.md),
  [`skills.json`](../evidence-archive.md), and
  [`transcript.md`](../evidence-archive.md).

## Result

| Recurring task | Teacher J/success | Deterministic J/success | Reduction | Break-even | Repetitions |
| --- | ---: | ---: | ---: | ---: | ---: |
| Repository-state interpretation | 13.188 | 0.072 | 99.45% | 2 | 15/15 PASS |
| Test-result interpretation | 20.070 | 0.127 | 99.37% | 2 | 15/15 PASS |
| Baton-integrity procedure/hash check | 45.807 | 0.000 incremental | 100% incremental | 1 | 15/15 PASS |

The baton figure is zero only after measured idle-baseline subtraction and is not
a zero-gross-energy claim. All 45 deterministic executions ran the promoted,
hash-identified handler and passed its independent invariant verifier.

The first baton teacher attempt is preserved separately because Qwen guessed
that an all-zero SHA matched. That failed output was not promoted. The corrected
teacher question asked the model to select the safe stable-SHA-256 procedure;
the deterministic implementation, including positive and negative cases, was
then validated independently.

## Changed case and memory path

A repository-state request containing the novel field `submodules` produced
`ESCALATE_MODEL`; no deterministic execution occurred. Qwen completed the
exception at 27.941 J and independent verification passed. The skill was not
automatically changed.

Verified Your Memories records identified the skill identity and procedure. The
runtime selected the promoted skill with `modelInvoked: false`; memory retrieval
did not force model reconstruction.

## Conclusions

1. Agent Control recognised exact previously validated work through task class,
   typed contract, freshness and handler identity.
2. It executed that work without an LLM in 45/45 repetitions.
3. Measured reduction was 99.37–99.45% for the two non-clamped comparisons.
4. Those skills paid back on the second occurrence under the measured boundary.
5. The changed case was rejected and escalated successfully.
6. A specialist remains preferable only where deterministic representation is
   impossible and measured expected energy—including training/load/fallback—is
   lower at required quality. That was not true in the current workload.
7. Immediate model escalation is preferable when applicability confidence is
   low enough that deterministic-attempt plus fallback energy exceeds direct
   model energy. The runtime energy router already includes failed-attempt energy.

Model residency remains unresolved: cold versus retained specialist execution
proves a 62.999 J load penalty, but no isolated warm-idle incremental-power series
exists, so keep-warm break-even time is unavailable. No model or machine was
automatically stopped.

The independent cross-model Your Memories gate remains 5/12; this experiment
does not alter that verdict or the Pixel/MSI limitations.

## Production and video confirmation

The first canonical production attempt failed closed before execution because
runtime safety interpreted “previously promoted skill” as release/deployment
promotion. The narrow fix now reserves lexical promotion suspicion for release,
build, candidate or production contexts; a regression proves actual release
promotion still fails closed under a misleading read-only declaration.

The rerun passed through the production Job, Work Parcel scheduler, runtime
safety, sealed baton, typed Action, artifact store and verification boundary:

- POE conversation: `poe-conversation:bcdbf974-c6d2-45eb-91f6-fef7c73dfab9`
- Work Parcel: `parcel-social-85570271f55c9a401f48a34d980cba69980758e8dbe856e80d0173f4598cf2af`
- Route: `deterministic skill repository-state@1`
- LLM invoked: no
- Verification: PASS
- Production confirmation energy: unavailable (the measured physical repetitions
  remain the energy evidence; this orchestration-only check did not manufacture a value)

The immutable 1920×1080 browser replay and complete transcript are under
[`ux-evidence/`](../evidence-archive.md).
The MP4 SHA-256 is
`5691a1c4d5b8402cfcb02d016fa494e01182b79fd3b302b8fbcdd07c58717b1a`;
the transcript SHA-256 is
`e22e784a68d4166654973c6ce182552df31cc3582bcf4d9ea99d46027509fd9b`.

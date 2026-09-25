# Agent Control v4.11.0 — Governed Model Improvement

Agent Control 4.11.0 introduces a governed loop for detecting evidenced model weaknesses, freezing immutable baselines, evaluating increasingly invasive interventions in isolation, comparing candidates across quality, performance, resources, tokens, cost, energy and safety where authoritative measurements exist, and applying only an explicitly approved operational improvement.

## What is included

- durable improvement opportunities linked to source evidence;
- immutable baseline and content-addressed candidate identities;
- a ten-level improvement ladder from deterministic removal through deeper modification;
- teacher/student evidence separation and explicit training provenance;
- fail-closed rejection of sensitive training examples;
- multidimensional comparison with unavailable values preserved as unavailable;
- parallel Work Board evaluation stages;
- security and protected-regression rejection;
- sealed promotion proposals and exact candidate-bound human approval;
- allow-listed, kind-specific intervention adapters;
- independently observed applied-effect receipts;
- restart-safe `PROMOTED` state;
- independently verified, receipt-backed rollback;
- a stable Limitations Ledger with a silent-drop release gate.

Models do not approve or apply their own promotion. Approval alone does not mutate an operational route. The intervention adapter must prepare, apply, independently observe and seal the exact effect before Agent Control records `PROMOTED`. Rollback follows the same evidence standard.

## Physical qualification

The retained physical test used the existing Qwen2.5 3B service and a disposable prompt route above the immutable model service. Baseline `ALPHA7` scored 0/2. The approved `PROMPT` candidate produced `ALPHA|7` and scored 2/2. The promoted effect survived controller reconstruction. Rollback restored the previous state, and the post-rollback workload again produced `ALPHA7` and scored 0/2. Protected model processes, commands, ports, identities and health remained unchanged.

This proves the governed `PROMPT` path. It does not prove model-weight self-modification, arbitrary LoRA or checkpoint replacement, or arbitrary production-route promotion.

## Qualification boundaries

- **AC-LIM-0060:** only `PROMPT` application is physically qualified.
- **AC-LIM-0061:** generic percentage/canary allocation is not implemented.
- **AC-LIM-0062:** arbitrary production-route promotion remains unqualified.
- Authoritative monetary inputs, attributable experiment energy, sensor/tariff evidence and break-even calculations remain unavailable where their required inputs are unavailable.

See the [Model Improvement guide](model-improvement.md), [release verification](release-verification-4.11.0.md), [upgrade guide](upgrade-4.11.md), [physical qualification](evidence/AGENT_CONTROL_4.11_PROMOTION_ROLLBACK_QUALIFICATION.md), and [Limitations Ledger](KNOWN_LIMITATIONS.md).

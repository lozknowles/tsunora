# Governed learned specialists

This model-adaptation lifecycle is distinct from [governed deterministic skill
promotion](deterministic-skill-promotion.md). Agent Control tries validated
deterministic execution first when the task can be represented exactly; a learned
specialist remains useful for fuzzy, variable bounded domains that cannot.

Agent Control can manufacture a narrowly qualified local specialist without
turning training into an uncontrolled background activity. A specialist is not a
new provider and is not the unmodified base model. Its route identity binds:

`base model ID/version/SHA-256 + adaptation ID/version/SHA-256 + runtime + frozen qualification`

Energy efficiency is not inferred from parameter count. Baseline, training, held-out qualification, and repeated specialist inference may attach measured energy through the generic telemetry contract. Promotion requires quality first; training break-even is shown only when all compared values share a valid measurement boundary. See [energy-aware intelligence](energy-aware-intelligence.md).

Energy-aware admission is separate from quality qualification. A specialist that
improves the frozen quality baseline can still lose on joules per verified
outcome. The first 4.5 physical study found exactly that, including with real
bounded Your Memories retrieval. Operators must retain the negative evidence
and prefer deterministic or stronger routes when expected total energy,
including failure and fallback, is lower. See the [specialist-energy qualification](provenance/EXTERNAL-EVIDENCE.md).

## Operator lifecycle

1. **Observe** evidence of a repeated bounded task.
2. **Identify** a candidate and expected measurable benefit.
3. **Dataset** records provenance, schema checks, duplicates, disagreements,
   contamination and explicit human review. Training and evaluation IDs must be
   disjoint.
4. **Baseline** runs the unmodified base on the frozen evaluation set.
5. **Train** runs only through an approved framework adapter and bounded resource
   policy. Interrupted training cannot alter the frozen base.
6. **Qualify** reruns the identical evaluation. A completed training run is not
   evidence of improvement.
7. **Register** records a qualified composition; it does not enable routing.
8. **Route** is an explicit policy action. Task, capabilities, base, runtime,
   freshness, health and ordinary routing policy must all pass.
9. **Monitor** records verified outcomes without mutating the adaptation.
10. **Retire/retrain** preserves the prior version and sends any replacement
    through the complete lifecycle again.

## Configuration

The conservative example configuration keeps routing disabled:

```json
{
  "learnedSkills": {
    "enabled": true,
    "routingEnabled": false,
    "minimumImprovement": 0.1,
    "maximumQualificationAgeDays": 90,
    "requireHumanDatasetApproval": true
  }
}
```

The policy can be edited under **Configuration → Governed Learned Specialists**.
Saving is revision checked and requires an Agent Control restart. Enabling
learning permits lifecycle records; it does not authorize a training process.

## Dashboard and POE

The **Learned Specialists** tab shows candidates, registered compositions and
recent route decisions from the durable `/api/learned-specialists` projection.
It displays the frozen improvement, artifact/evaluation identity, lifecycle,
limitations and whether routing is enabled. “Warmth: not inferred here” is
intentional: learned adaptation and Warm Cache Runtime evidence are different.

POE may explain why a candidate exists, the measured before/after result, why a
route was selected or why Agent Control retained the base route. POE reads the
same sanitized projection and cannot start training or grant route admission.

## Production execution and fallback

Task-specific Jobs opt into the typed learned-specialist Action. It assesses the
durable registry, selects only an eligible exact composition, enters the normal
adaptive-harness model boundary, validates on-disk identity, executes, stores a
typed artifact and then runs an independent verifier. The Work Parcel retains its
original objective and sealed baton. An inappropriate task, stale qualification,
wrong base/runtime, missing or corrupt artifact, load failure, identity mismatch
or failed verifier fails closed; an ordinary fallback may run only if already
allowed by the surrounding Work Parcel policy.

## Reproducing the first experiment

Use an isolated Python environment; never install training dependencies into the
controller runtime or stop protected services. The recorded experiment used the
pinned requirements in `scripts/skill-learning/requirements.txt` and these steps:

```bash
node scripts/skill-learning/prepare-route-intent-dataset.mjs qualification/agent-control-4.5-skill-learning-20260911/dataset
python scripts/skill-learning/train-route-intent-lora.py --mode baseline --model HuggingFaceTB/SmolLM2-135M-Instruct --revision 12fd25f77366fa6b3b4b768ec3050bf629380bac --train qualification/agent-control-4.5-skill-learning-20260911/dataset/train.jsonl --eval qualification/agent-control-4.5-skill-learning-20260911/dataset/eval.jsonl --output qualification/agent-control-4.5-skill-learning-20260911/baseline --seed 45
python scripts/skill-learning/train-route-intent-lora.py --mode train --model HuggingFaceTB/SmolLM2-135M-Instruct --revision 12fd25f77366fa6b3b4b768ec3050bf629380bac --train qualification/agent-control-4.5-skill-learning-20260911/dataset/train.jsonl --eval qualification/agent-control-4.5-skill-learning-20260911/dataset/eval.jsonl --output qualification/agent-control-4.5-skill-learning-20260911/training --epochs 4 --seed 45
python scripts/skill-learning/train-route-intent-lora.py --mode evaluate --model HuggingFaceTB/SmolLM2-135M-Instruct --revision 12fd25f77366fa6b3b4b768ec3050bf629380bac --train qualification/agent-control-4.5-skill-learning-20260911/dataset/train.jsonl --eval qualification/agent-control-4.5-skill-learning-20260911/dataset/eval.jsonl --adapter qualification/agent-control-4.5-skill-learning-20260911/training/adapter --output qualification/agent-control-4.5-skill-learning-20260911/specialist --seed 45
node --import tsx scripts/qualify-skill-learning-4.5.ts
```

Exact hashes, environment and results are in the
[qualification record](evidence/agent-control-4.5-governed-skill-learning-20260911.md).

## Explicit non-features

- no silent or continuous online learning;
- no automatic promotion from observation;
- no tool or policy authority granted by an adaptation;
- no assumption that local is cheaper or better;
- no adapter stacking, merging or sequential composition;
- no claim that a narrow artifact creates general expertise.

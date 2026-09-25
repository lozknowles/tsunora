# Agent Control 4.5 governed skill-learning qualification

Status: **QUALIFIED FOR THE EXACT ROUTE-INTENT SPECIALIST; ROUTING DISABLED BY DEFAULT**

This evidence belongs to the isolated `feature/4.5-governed-skill-learning`
candidate. It does not merge, release, deploy, or enable learned-specialist
routing.

## Frozen identities

- Base: `HuggingFaceTB/SmolLM2-135M-Instruct` at revision
  `12fd25f77366fa6b3b4b768ec3050bf629380bac`.
- Training set: 120 reviewed examples,
  SHA-256 `b5e48d4d31c2a2adb73a9583f6926ae4883d4e8906b99c2d3d242875e740afa8`.
- Evaluation set: 40 disjoint examples,
  SHA-256 `f28e3610701bb8d3cfa16062f7761c793983ac78254c45c2143b6d7cfa50cce7`.
- Runtime: Python 3.12.3, PyTorch 2.8.0 CPU, Transformers 4.56.1,
  PEFT 0.17.1. Protected GPU services were not disturbed.

## Measured result

The unadapted frozen baseline scored 0.00 exact accuracy and 0.00 schema
validity. The independently evaluated LoRA specialist scored 0.40 exact
accuracy and 1.00 schema validity. This is a measured 0.40 accuracy increase,
not a broad model-quality claim. Monetary cost and energy use were unavailable.

The final governed training ran as Work Parcel
`parcel-cbd4c7e8-b039-49b4-96f0-3c5b2bd7c201`, Run
`run-e46a98a2-e335-416c-952d-73d34162fd2f`, on worker
`isolated-controller-cpu`, after policy `qualification.skill-training` was
approved. Its sealed baton SHA-256 was
`ccd695c5f23eb48fb9b0e08dec5e45e560280b3626b1213211ed7c8b2219861e`.
The typed training port completed in 177.05 seconds and produced adapter
SHA-256 `19b3b94e1178bc1cb90eeaf1447198e1926aade5d25049c96efae1b273fa5473`.

The first qualification harness attempt stopped at its approval gate because
the harness supplied the `JobRuntime` approval callback with the wrong
argument shape. It did not execute training and is not counted as proof. The
harness was corrected to evaluate the policy string accepted by the production
runtime, and the complete Work Parcel was rerun.

## Production route checks

- A genuine positive Work Parcel selected the exact qualified specialist,
  produced `LANE_REVIEW`, used 59 input and 10 output tokens, and passed an
  independent verifier.
- An inappropriate task failed closed with
  `learned_specialist_route_unavailable` before model invocation.
- Wrong-base, incompatible-runtime, and stale candidates were not selected.
- An earlier broad positive prompt produced `LANE_OPERATE`; the independent
  verifier rejected it. That failure is retained and was not relabelled.

## Evidence

Sanitised machine-readable evidence is under
`qualification/agent-control-4.5-skill-learning-20260911/`. Model weights and
optimizer checkpoints remain local managed artefacts and are identified by
hash; they are not source files. The rejected initial dataset/training attempt
is retained locally under the sibling `-rejected-initial` directory because it
contained a contradictory training example and cannot support qualification.

## Limitations

- Exact frozen accuracy is 0.40; ordinary governed routing remains the fallback.
- Qualification applies only to `route-intent-json` with the exact recorded
  base, adapter, runtime, dataset, and evaluator identities.
- Observation does not initiate training, and runtime outcomes cannot mutate
  model weights or silently promote a candidate.

# Agent Control 4.5 pre-runtime architecture review

Status: pre-implementation decision record  
Baseline: Agent Control 4.4.0, commit `0a3d136c38ec2c75afb4fb946fba1fb12a9dd5f8`  
Branch: `feature/4.5-governed-skill-learning`  
Observed: 2026-09-11

## Decision

Agent Control will model a learned specialist as a composition:

`qualified base model + versioned learned skill/adaptation + independent qualification evidence`

The composition is a routing candidate, not a new provider and not a mutation of
the base-model record. Training frameworks and adaptation formats remain behind
ports. Core records describe provenance, compatibility, qualification and
lifecycle without depending on LoRA, QLoRA, a particular model family, CUDA,
PyTorch, Hugging Face or any other runtime.

The governed lifecycle is:

`OBSERVE → IDENTIFY → DATASET → BASELINE → TRAIN → QUALIFY → REGISTER → ROUTE → MONITOR → RETIRE/RETRAIN`

No observation may silently begin training. `IDENTIFY` creates a proposal;
dataset approval and training authority are explicit. Registration does not
imply routing eligibility. Only a frozen holdout evaluation with independent
verification can qualify a specialist, and routing remains subject to ordinary
capability, policy, placement, health and fallback checks.

## Existing boundaries reused

| Existing boundary | 4.5 use |
| --- | --- |
| `ModelRegistry` | Resolves and qualifies the immutable base-model identity and provider/model/node route. |
| `AdaptiveOrchestrationRuntime` | Ranks an already-eligible specialist candidate alongside ordinary routes; learned evidence is one bounded input, never authority. |
| `WorkParcelCoordinator` and Job runtime | Own production execution, origin, stages, verification, audit and recovery. There is no training side door. |
| Model intelligence ledger | Supplies observed task outcomes and regression history for candidate discovery and monitoring. |
| Token governor and sealed batons | Preserve work and accounting across a specialist fallback or handoff. |
| Warm Expert registry | Remains separate evidence about transient cache state. A model can be learned-but-cold, warm-but-unadapted, both, or neither. |
| Provider/runtime adapters | Load and invoke an adaptation only where a runtime declares and qualifies support. |
| Dashboard/POE projections | Read the same durable records and label unknown or estimated measurements truthfully. |

The existing planned `skills.governed-lifecycle` entry concerns executable Agent
Control skills and tool authority. Learned model adaptations are deliberately a
separate registry and grant no tools, permissions or policy authority.

## New provider-neutral contracts

The minimum coherent delta is:

1. A `SkillLearningRuntime` that owns candidate proposals and legal lifecycle
   transitions, including explicit approval boundaries.
2. A durable `SkillAdapterRegistry` whose records bind adaptation ID/version and
   artefact hash to exact base-model hash/version, dataset and frozen-evaluation
   hashes, training method/runtime, qualification metrics, capabilities,
   limitations, freshness, lifecycle and rollback reference.
3. A narrow `SkillTrainingPort` for prepare/train/resume/abort/result operations
   and a `SpecialistExecutionPort` for base-plus-adaptation invocation. These are
   typed operations, not arbitrary shell APIs.
4. Eligibility projection into existing routing. The core asks whether the
   composed candidate is compatible, current and qualified. The runtime adapter
   decides how an artefact is loaded.
5. Read-only Learned Specialists views in dashboard and POE, backed by durable
   registry, training and qualification events.

Adapter composition is not admitted in 4.5. The registry can represent
dependencies for future analysis, but multiple adaptations cannot be combined
until compatibility, ordering, interference and joint qualification are proven.

## Dataset and evaluation governance

Candidate examples may be derived from retained execution history only through a
versioned export that records source IDs/hashes, purpose and consent/authority.
Provider-neutral teacher output must pass the same schema regardless of the
teacher provider. Dataset construction rejects malformed records, duplicates,
holdout overlap, contradictory labels without adjudication, secret-shaped
content and examples outside the approved task class. Human review state and
all disagreement decisions are durable.

Before training, Agent Control freezes and hashes the evaluation set, records the
base model and runtime, and runs a baseline. Training data and evaluation IDs are
disjoint. Qualification reruns the exact frozen evaluation and records quality,
reliability, latency, fresh/cache tokens, memory and energy only when measured.
An improvement claim requires a configured material threshold with no protected
regression. Unknown monetary or energy data remains `UNAVAILABLE`.

## Current hardware and technique decision

The controller observation at 2026-09-11 found:

- Intel Core i7-7700HQ, 4 cores / 8 threads;
- 62 GiB RAM, about 45 GiB available;
- NVIDIA Quadro P5000, 16 GiB VRAM, driver 580.173.02;
- only about 1.5 GiB VRAM free because protected OmniVoice and llama.cpp
  workloads use the device;
- 351 GiB free under `/fast` and 610 GiB free on the system volume;
- no PyTorch, Transformers, PEFT, TRL, Accelerate or bitsandbytes in the system
  Python environment;
- available Qwen/Ministral GGUF files are quantized inference artefacts, not
  suitable trainable PEFT bases.

Those protected workloads will not be stopped. The initial physical experiment
will therefore use an isolated, pinned Python environment and a genuinely small
causal language model with CPU LoRA, unless a separately qualified idle training
node is discovered before execution. The proposed narrow skill is strict
Agent-Control route-intent classification to a versioned JSON schema. It is
useful to governed planning, inexpensive to evaluate, and has objective exact
and semantic scores. The exact base revision, licence, files and SHA-256 values
must be frozen before the baseline; no unpinned download is qualification
evidence.

LoRA is selected because it freezes base weights and trains small low-rank
matrices. QLoRA remains an allowed adapter implementation, and its 4-bit frozen
base, NF4/double-quantization and paged-optimizer techniques are appropriate when
a supported GPU/runtime is available. It is not selected on this Pascal P5000
under current contention until a bounded compatibility probe proves the exact
bitsandbytes/runtime combination. Mixed precision, gradient accumulation and
activation checkpointing are optional adapter capabilities, each recorded in
the training environment and used only when the backend reports support.

Distillation or synthetic teacher examples may improve a small student, but the
teacher is an interchangeable provider route and its output is untrusted dataset
input until schema, duplication, contamination, disagreement and human-review
gates pass. The frozen holdout cannot be teacher-generated from, or exposed to,
the training process.

## Failure and recovery policy

The lifecycle fails closed for missing/corrupt adaptation artefacts, wrong base
hash, incompatible runtime, stale qualification, unavailable memory, malformed
dataset, interrupted training, failed qualification, regression, load failure or
execution failure. Training checkpoints may resume only when dataset, base,
configuration and environment identities match. The previous qualified adapter
remains addressable until retirement; a failed candidate never replaces it.
Production specialist execution failure records the attempted composed identity
and uses only an existing governed fallback route.

## Qualification threshold for 4.5

The implementation can be reported `QUALIFIED` only after a real baseline and
adapted run use the identical frozen evaluation, the specialist materially
improves the configured target metric without protected regression, artefact and
provenance hashes reconcile, positive production routing succeeds, an
inappropriate task is rejected, and required failure paths are evidenced.
Otherwise the truthful result is `EXPERIMENTAL`, `BLOCKED` or `REJECTED`.

## Research basis

- Hu et al., *LoRA: Low-Rank Adaptation of Large Language Models*, arXiv
  2106.09685.
- Dettmers et al., *QLoRA: Efficient Finetuning of Quantized LLMs*, arXiv
  2305.14314.
- Hinton, Vinyals and Dean, *Distilling the Knowledge in a Neural Network*,
  arXiv 1503.02531.
- PyTorch documentation for automatic mixed precision and activation
  checkpointing.
- Hugging Face PEFT quantization guidance for preparing a quantized model before
  adapter training.

These techniques inform adapters. None becomes an Agent Control core dependency.

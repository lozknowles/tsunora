# Natural-language task entry and Work Parcels

The dashboard accepts an ordinary-language objective and retains it verbatim. `CatalogNaturalLanguagePlanner` converts a directly named Job deterministically, selects an explicitly registered constrained routine where one exists, or delegates complex planning through the `WorkParcelPlanner` port. If no reasoning planner is configured, an ambiguous request remains rejected as `work_parcel_reasoning_planner_unconfigured`; the dashboard never invents an executable shell workflow.

External-channel parcels may additionally retain `agent-control.request-origin/v1`: exact initiating text or confirmed voice transcription, channel and receipt time, authentication classification, governed actor, granted template authority and opaque message/identity references. This additive provenance cannot grant a Job, tool, model, node or protected-resource capability. Secrets and raw transport identity are rejected before persistence. A duplicate request key must match actor, prompt and origin exactly.

A proposed plan is data, not authority. Agent Control validates every stage ID, registered versioned Job reference, dependency and cycle before persisting a parcel. The existing `JobRuntime` remains the only executor: it owns parameter validation, capability placement, locks, approvals, retries, action dispatch, artifacts and verification.

`WorkParcelCoordinator` adds only parent orchestration:

- starts every policy-allowed ready stage after all of its declared dependencies succeed;
- permits independent ready stages to execute concurrently within worker capacity;
- records the child Run ID and typed artifact references in a bounded `agent-control.work-parcel-baton/v2` context view;
- blocks all dependent stages after a failed gate;
- reconstructs state from the parcel and Run ledgers after restart;
- aggregates elapsed time and existing per-invocation token/cost telemetry without converting unknown values to zero;
- records requested and actual route information separately.

Every newly submitted parcel also carries `agent-control.work-attribution/v1`: Actor, Session, optional Agent/delegation, authority snapshot, creation time and legacy marker. The authenticated dashboard selects `web-operator` server-side and ignores a body-supplied actor. Existing callers without the 3.5 identity service receive deterministic legacy attribution rather than an invented authenticated identity.

## Persistent context and completion (3.9)

Each new Parcel owns `agent-control.parcel-context/v1` alongside its stage graph:

- immutable original goal, current interpretation, constraints, plan, stage, dependencies, approvals and route;
- a SHA-256-linked immutable event ledger for decisions, failures, retries, tool/test results, routing, steering, questions, verification and accounting;
- governed exact/filter/relevance retrieval over retained events;
- bounded, content-hashed baton views containing only what the next executor needs;
- append-only steering amendments without rewriting the original goal;
- stable questions with originating/dependent stages, priority, consequence and answer timestamps;
- first-class success criteria with `USER`, `POLICY`, `PLANNER` or `REVIEWER` provenance and independent evidence evaluation.

An unanswered question changes only its declared dependent stages to `WAITING`; unrelated ready stages continue. Answering it appends a durable event and returns those dependencies to normal eligibility. A Parcel can become `SUCCEEDED` only after every stage succeeds and every required criterion passes. A provider completion statement is not evidence by itself.

Stages form a validated acyclic dependency graph. The coordinator may dispatch multiple ready stages concurrently, but `JobRuntime` still owns every individual Run, capability placement, lock, approval, action and verifier gate. This remains a governed orchestration graph, not an arbitrary workflow or shell language.

The dashboard exposes authenticated controls for answering questions, adding/evaluating criteria, steering and retrieving context. These call `AgentControlService`; the browser does not alter the context ledger directly.

## Adaptive routing evidence

When `adaptiveOrchestration` is configured, each parcel receives a durable decision ID. The coordinator classifies the objective, derives model capabilities from the requested model role, evaluates qualified route candidates through the task-specific Model Capability League and records the `work-parcel-coordinator@1` strategy in the Workflow League. The selected route is still passed through the existing model registry, worker placement and JobRuntime gates; adaptive evidence cannot grant a capability or bypass verification.

The parcel audit retains the decision ID, while `GET /api/parcels/:id/decision-tree` and `GET /api/parcels/:id/decision-report` expose the persisted decision and its operational report. The dashboard Audit panel links to the Routing view. Only independently verified quality outcomes update league preference; provider, infrastructure, policy, cancellation and insufficient-evidence outcomes remain operational observations. See [`adaptive-multi-model-orchestration.md`](adaptive-multi-model-orchestration.md).

## FreeToken dogfood routine

The included five-stage qualification routine is an isolated safety test, not a production provider definition. Its model root comes only from `AGENT_CONTROL_FREETOKEN_MODEL_ROOT`; no operator topology is stored in the canonical repository. Inventory is read-only. The readiness Job requires at least 8192 MiB of free VRAM and a compatible HF/FTW checkpoint before any isolated service, benchmark or provider qualification stage can run. A failed gate blocks all later stages and cannot change production routing.

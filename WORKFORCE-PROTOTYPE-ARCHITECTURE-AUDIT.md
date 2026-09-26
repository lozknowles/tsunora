# Workforce prototype architecture audit

Baseline: 2915a630db0ead1333cc9657ef44af9e953cc19b. Research branch only; publication lineage and production remain untouched.

Classification is implementation intent, not proof that the prototype is complete. The audit is based on repository source, including actual JobRuntime approval, capability placement, retry and artifact interfaces.

| Capability | Classification | Existing implementation (src/control unless specified) | Domain decision |
|---|---|---|---|
| Jobs and persisted transitions | REUSE | job-runtime.ts; job-catalog.ts; job-types.ts | Create genuine JobRuntime jobs, not a separate workflow engine. |
| Workers, capability routing, dynamic scheduling | REUSE | job-runtime.ts WorkerRegistry; work-scheduler.ts | Use registered capabilities, health, capacity and placement rationale. |
| Lanes and advanced scheduling | NOT REQUIRED | work-queue.ts; work-scheduler.ts | Do not duplicate lanes in the domain; bounded sequential job steps suffice initially. |
| Model/provider routing and Lean/Standard/Deep | EXPERIMENTAL | adaptive-harness.ts; token-aware-baton-routing.ts | Available core capability; first workload uses deterministic workers. No model performance claim. |
| Baton/state transfer | REUSE | job-runtime.ts ArtifactStore; job-types.ts inputs/outputs | Typed, hashed plan artifacts become mutation and verifier inputs. |
| Persistent context/memory | NOT REQUIRED | context.ts; session-vault.ts | Retain job artifacts; no cross-employee conversational memory. |
| Governed skill learning | NOT REQUIRED | skill-learning.ts; deterministic-skill.ts | No automatic learning from synthetic HR requests. |
| Approvals | REUSE | job-runtime.ts approve and WAITING_FOR_APPROVAL | Domain selects policy; core controls wait/resume. Domain validates approver role and tenant. |
| Scope and containment | REUSE | containment.ts assessScope and ContainmentSupervisor; owned-process.ts | Domain adds employee/tenant object scope to existing tool scope. Actual registered owned-process kill on injected violation. |
| Quarantine, worker kill, recovery | REUSE | containment.ts recovery/schedulingEligibility; job-runtime.ts WorkerRegistry and retry | Containment records drive exclusion; bounded retry retains original run and artifacts. |
| Verification | REUSE | job-runtime.ts verification and ArtifactStore | Independent state readback; never prose-based success. |
| Evidence and logging | REUSE | job-runtime.ts RunLedger; activity-log.ts; security-redaction.ts | Core run events plus domain mutation receipts, redacted at recording boundary. |
| Observability and dashboards | EXTEND | assets/dashboard/dashboard-theme.css; web-server.ts | Opt-in Workforce Lab workspace using existing styling and runtime projections. |
| Token/resource accounting | REUSE | harness-efficiency.ts; job-runtime.ts invocation accounting | Deterministic execution is explicitly labelled; unavailable model/cost/energy metrics UNKNOWN. |
| Video evidence | EXTEND | assets/dashboard/video-evidence.js; scripts/record-* | Record actual running browser before hero execution; overlays follow durable events, not scripted statuses. |
| Qualification infrastructure | EXTEND | job-runtime.test.ts; scripts/qualify-* | Frozen synthetic state/outcome cases and independent invariant checks. |
| Local and remote execution | EXPERIMENTAL | owned-process.ts; outbound-worker-transport.ts | Physical local synthetic backend only initially. Remote/model configurations marked unavailable until qualified. |
| Tool calling | NEW DOMAIN ADAPTER | ActionRegistry plus new workforce_ops adapters | Typed mock HRIS/payroll/IT/document tools; no production endpoints. |
| Workforce policy and records | NEW DOMAIN ADAPTER | new workforce_ops package | Synthetic tenants/employees, configurable risk, explicit authorization and before/after receipts. |
| Tsunora/Digital Labour Exchange | EXPERIMENTAL | labour-exchange.ts; labour-ai-backend.ts; labour-economics.ts | Optional future bridge; base prototype must not depend on Exchange or claim economics. |

## Authority boundaries

Workforce Operations is a synthetic workload adapter. It cannot register production workers, contact HR systems or elevate authority from user text. Only a trusted policy contract may select employee scope, role authority and mutation tools. User/model output is data. Domain records are not a new orchestration engine.

The natural-language entry point will initially be an explicit deterministic intent recognizer. Ambiguous or unsupported text must fail closed for clarification. This is not an LLM understanding benchmark. Model/remote execution remains unavailable unless independently configured and qualified.

No Kinfolk source, UI, policy or undocumented behaviour is used. There is no endorsement, partnership or integration claim.

## Completed brief boundary

The complete 22-section brief was received before qualification. No publication, deployment or production change is authorized. The implementation uses a companion dashboard workspace and existing theme; it introduces no mandatory workforce dependencies into core.

# Paperclip / Agent Control v4.15 architecture review

Review date: 24 September 2026. **Source review; Paperclip runtime qualification NOT TESTED.**

Paperclip source snapshot: `e006c18f2036d95d47ca8f7eb068670f3c54942d`. Agent Control comparison baseline: `9ffa265a5` (v4.14.0-rc.2 remote-tracking main). Neither a marketing page nor this review establishes production readiness.

## Finding

Paperclip implements a substantial organisation-oriented agent control plane. Its durable identities, scoped ownership, completion contracts, assessments and recovery machinery overlap meaningfully with Agent Control. Describing it as merely an org chart or token-cost dashboard would be inaccurate.

The inspected code does not establish a competitive digital labour exchange. No equivalent implementation of rate-card tenders, retained competing bids, performance-adjusted economic awards or complete-outcome settlement was found in the searched server, schema, packages and documentation. Task ownership, recovery, finance events and budget control are real adjacent capabilities; their existence does not prove brokerage. This is a bounded negative source finding, not proof about every extension, branch or future release.

The useful distinction is therefore supported, with qualification: Paperclip manages an organisation's agents and work, including completion review; the proposed Agent Control capability adds an explicitly governed market decision and auditable economics across all attempts required to obtain an outcome. Agent Control has not yet physically demonstrated that addition at the time of this design review.

## Method and provenance

Inspected the requested [landing page](https://paperclipai.net/), followed its repository link, cloned the public repository read-only, pinned its commit, and read schemas, service implementations and public documentation. The repository itself points to [paperclip.ing](https://paperclip.ing/) and [docs.paperclip.ing](https://docs.paperclip.ing/); the requested domain should not be treated as the only authoritative description of current behaviour.

Source links below are pinned to the inspected commit. These are implementation observations, not results of executing Paperclip's test suite. Source tests were inspected as supporting intent only. No Paperclip agent, credentials, external accounts or company runtime was provisioned.

Evidence keys:

* P1: [agent identity schema](https://github.com/paperclipai/paperclip/blob/e006c18f2036d95d47ca8f7eb068670f3c54942d/packages/db/src/schema/agents.ts): persistent UUID, company, reporting relationship, adapter configuration, permissions, status and budget fields.
* P2: [architecture](https://github.com/paperclipai/paperclip/blob/e006c18f2036d95d47ca8f7eb068670f3c54942d/docs/start/architecture.md) and [core concepts](https://github.com/paperclipai/paperclip/blob/e006c18f2036d95d47ca8f7eb068670f3c54942d/docs/start/core-concepts.md): control plane, adapters, issue ownership, heartbeat protocol and delegation.
* P3: [issues service](https://github.com/paperclipai/paperclip/blob/e006c18f2036d95d47ca8f7eb068670f3c54942d/server/src/services/issues.ts): checkout admission, company/assignee checks, pause holds, dependency readiness and conditional ownership updates. Selected recovery paths use row locks.
* P4: [budgets service](https://github.com/paperclipai/paperclip/blob/e006c18f2036d95d47ca8f7eb068670f3c54942d/server/src/services/budgets.ts): company/agent/project policies, observed spend, pause/cancel and invocation blocking.
* P5: [cost events](https://github.com/paperclipai/paperclip/blob/e006c18f2036d95d47ca8f7eb068670f3c54942d/packages/db/src/schema/cost_events.ts), [finance events](https://github.com/paperclipai/paperclip/blob/e006c18f2036d95d47ca8f7eb068670f3c54942d/packages/db/src/schema/finance_events.ts): run/task/project/goal attribution, cached tokens, cost status, debit/credit, currency, estimates and invoice references.
* P6: [runtime state](https://github.com/paperclipai/paperclip/blob/e006c18f2036d95d47ca8f7eb068670f3c54942d/packages/db/src/schema/agent_runtime_state.ts), [task sessions](https://github.com/paperclipai/paperclip/blob/e006c18f2036d95d47ca8f7eb068670f3c54942d/packages/db/src/schema/agent_task_sessions.ts): worker identity survives ephemeral invocation; task sessions additionally bind adapter and task key.
* P7: [completion contracts schema](https://github.com/paperclipai/paperclip/blob/e006c18f2036d95d47ca8f7eb068670f3c54942d/packages/db/src/schema/completion_contracts.ts), [contract service](https://github.com/paperclipai/paperclip/blob/e006c18f2036d95d47ca8f7eb068670f3c54942d/server/src/services/native-runtime/completion-contracts.ts), [work assessments](https://github.com/paperclipai/paperclip/blob/e006c18f2036d95d47ca8f7eb068670f3c54942d/packages/db/src/schema/work_assessments.ts): version/hash, completion authority, evidence/result/run binding, ownership foreign keys and input digests.
* P8: [activity service](https://github.com/paperclipai/paperclip/blob/e006c18f2036d95d47ca8f7eb068670f3c54942d/server/src/services/activity-log.ts): sanitized insertions, actor/run/entity attribution and publication of real domain events.
* P9: [provider-profile qualification](https://github.com/paperclipai/paperclip/blob/e006c18f2036d95d47ca8f7eb068670f3c54942d/server/src/services/provider-profile-qualification.ts): exact attestation validation, configuration digests and named provider/model qualification contracts.
* P10: [recovery service](https://github.com/paperclipai/paperclip/blob/e006c18f2036d95d47ca8f7eb068670f3c54942d/server/src/services/recovery/service.ts), [issue recovery actions](https://github.com/paperclipai/paperclip/blob/e006c18f2036d95d47ca8f7eb068670f3c54942d/server/src/services/issue-recovery-actions.ts), [automatic completion reviews](https://github.com/paperclipai/paperclip/blob/e006c18f2036d95d47ca8f7eb068670f3c54942d/server/src/services/native-runtime/automatic-completion-reviews.ts).

Agent Control evidence is the inspected baseline's `src/control/identity-control-plane.ts`, `job-types.ts`, `work-queue-store.ts`, `job-bootstrap.ts`, `model-qualification.ts`, `model-registry.ts`, `cost-performance-routing.ts`, `containment.ts`, `owned-process.ts`, `action-governance.ts`, `activity-log.ts`, `web-server.ts`, and `assets/dashboard/video-evidence.js`. This comparison describes those existing mechanisms, not claims about the unfinished exchange.

## Structured comparison

| Dimension | Paperclip observation | Agent Control baseline / classification |
|---|---|---|
| Agent/worker identity | UUID independent of adapter config (P1) | Agent/actor identities exist; economic worker identity is absent. **PARTIALLY IN AGENT CONTROL** |
| Organisational structure | Company ownership and reporting hierarchy (P1–2) | Sessions, principals, roles and crews are not a company hierarchy. **FUTURE CONSIDERATION** |
| Control plane | REST server, durable DB, adapter boundary (P2) | Service, web control plane and execution providers. **ALREADY IN AGENT CONTROL** |
| Task/job representation | Issues with owner, parent, status and priority (P2–3) | Jobs, steps, Work Parcels, queue and contracts. **ALREADY IN AGENT CONTROL**; exchange requires an outcome WorkOrder |
| Agent lifecycle | Durable agent status separate from heartbeat runs (P1, P6) | Worker health, active capacity, execution sessions, containment. **PARTIALLY IN AGENT CONTROL** |
| Delegation | Hierarchical task assignment and approvals (P2–3) | Handoffs, crews, scoped identity/capability delegation. **PARTIALLY IN AGENT CONTROL**; hierarchy optional |
| Scheduling | Timed and event-triggered heartbeat windows (P2) | Job scheduler, queue, deadlines, retries. **ALREADY IN AGENT CONTROL** |
| Orchestration | Assignee checkout, dependencies, run locks (P3) | Job/step orchestration and worker placement. **USEFUL GENERIC TECHNIQUE** for exchange ownership |
| Budgets | Scope policies, observed spend, hard-stop admission (P4) | Routing budgets and governed execution limits. **POTENTIAL v4.15 IMPROVEMENT**: reserve whole-outcome liability |
| Cost accounting | Costs and wider finance events with attribution/status (P5) | Token/invocation/Job accounting. **POTENTIAL v4.15 IMPROVEMENT**: failed attempts plus verifier charges |
| Governance | Board controls, approval policies, pause holds (P2–4) | Existing governance remains authoritative. **ALREADY IN AGENT CONTROL** |
| Permissions | Company/agent and task ownership checks (P1, P3) | Identity/session permissions and sealed execution scopes. **ALREADY IN AGENT CONTROL**; organisation isolation requires explicit scope |
| Auditability | Actor/run-scoped sanitized activity inserts (P8) | Authoritative activity and evidence machinery. **ALREADY IN AGENT CONTROL**; exchange needs durable decision events |
| Memory/state | Runtime state and task/adapter sessions (P6) | Context, session vault, batons, run state. **ALREADY IN AGENT CONTROL**; do not reuse incompatible backend sessions |
| Performance history | Run state tracks totals and errors (P6); broader eval/review surfaces exist in repository | Model qualification and routing history exist. **PARTIALLY IN AGENT CONTROL**; per-worker/job empirical outcomes required |
| Worker qualification | Provider-profile attestation exists (P9); this is not evidence of a universal job-competence gate | Qualification records already use evidence and capabilities. **USEFUL GENERIC TECHNIQUE**: bind evidence to configuration revision |
| Failure handling | Durable recovery actions and run liveness (P10) | Retries, owned cleanup, containment and recovery. **ALREADY IN AGENT CONTROL**; economic rebidding is additional |
| Human intervention | Pause/reassign/approval/review (P2–4, P10) | Operator controls and approval gates. **ALREADY IN AGENT CONTROL** |
| Dashboard/observability | React management UI and real domain events (P2, P8) | Existing dashboard, SSE, Factory, activity, costs. **ALREADY IN AGENT CONTROL**; add live bids/awards |
| Multi-agent coordination | Single assignee, task hierarchy, shared company context (P2–3) | Crews, handoffs, leases, scoped orchestration. **PARTIALLY IN AGENT CONTROL** |
| Provider/model independence | Adapter boundary supports different runtimes (P1–2) | Existing provider-neutral contracts. **ALREADY IN AGENT CONTROL**; some Paperclip qualification paths are provider-specific |
| Persistent workers | Agent survives runs (P1, P6) | Persistent agent identity exists. **USEFUL GENERIC TECHNIQUE** for economic identity/history |
| Ephemeral workers | Invocation lifecycle is separate from agent identity (P6) | Owned processes and execution sessions. **ALREADY IN AGENT CONTROL**; ephemeral process is not a new employee |
| Transaction economics | Run/task spend and finance events (P5), not demonstrated completion-cost awards | **POTENTIAL v4.15 IMPROVEMENT**, primarily new exchange work |
| Outcome-based charging | Completion contracts and finance events exist separately (P5, P7); no verified outcome-charge linkage found | **POTENTIAL v4.15 IMPROVEMENT**; internal accounting only |
| Bidding/market mechanisms | No genuine tender/bid implementation found in searched scope | **NOT RELEVANT** as an adoption source; no equivalence claimed |
| Worker competition | Checkout contention is not economic competition (P3) | Existing route selection is not a worker tender. **POTENTIAL v4.15 IMPROVEMENT** |
| Verification of work | Completion authority, contracts, assessments and review (P7, P10) | Verifiers and evidence-backed contracts already exist. **USEFUL GENERIC TECHNIQUE**: bind settlement to exact contract/result |
| Re-brokering failed work | Recovery/reassignment exist (P10); economic retender not demonstrated | **POTENTIAL v4.15 IMPROVEMENT**: carry failure charges into next award |

## Claims that need care

The landing page's unconditional hiring-approval language is stronger than the current core-concepts documentation, which mentions enabling hire approvals. Treat policy configuration as material; neither text proves every mutation path enforces a universal gate.

The observed budget invocation gate reads recorded spend and blocks once limits are reached. That is valuable, but this function alone does not prove atomic reservation of maximum in-flight liabilities or zero overspend when multiple calls start below the limit. Do not copy the marketing claim of “no runaway spend” as a proven financial invariant. The exchange should explicitly reserve a bounded amount before dispatch.

Activity records are inserted and documented as append-only. The inspected service does not prove resistance to privileged database edits, deletion or backup replacement. Agent Control should call a hash-linked ledger tamper-evident within its trust boundary, not cryptographically immutable against an administrator without an independent anchor.

Paperclip's completion authority is policy-sensitive: the inspected resolver uses server arbitration for external-review policies and an agent-claim policy for lower-risk work. This is more nuanced than either “all outputs independently verified” or “no verification”. The exchange must record which verifier actually ran.

## Company abstraction

An organisation is a policy and accounting owner, not a worker, model, broker or execution backend. Paperclip's foreign-key ownership is a useful guard against attaching another company's result to an assessment (P7). For the smallest exchange, add an explicit organisation ID and budget scope to work, workers, attempts and accounting; reject cross-organisation awards. Do not invent CEO chains, HR metaphors or a full multi-tenant SaaS product merely to broker work. Organisation IDs alone do not establish complete tenant security: authentication, storage access and execution scopes remain independently necessary.

Worker identity can survive backend changes while qualifications cannot automatically transfer. Keep stable history, but bind each competence receipt to the tested backend/configuration revision. Requalify a new backend, retain the old evidence and never erase its failed attempts. Task session context is adapter-specific even where the worker identity is stable.

## Recommended techniques and exact design effects

| Technique / problem | Paperclip implementation | Current Agent Control gap | Generic implementation and tests |
|---|---|---|---|
| Ownership fencing prevents duplicate work/charges | Conditional checkout plus run ownership (P3) | Existing Job leases do not yet own an exchange outcome | Single-writer exchange lock; unique WorkOrder IDs bound to input digest; persist award before dispatch; duplicate/concurrent submissions cannot execute twice; interrupted awards remain unresolved instead of replaying silently. Test concurrent and restarted submissions. No Paperclip dependency. |
| Scoped attribution prevents mixing employers/results | Company-owned agents, costs, contracts and assessments (P1, P5, P7) | No organisation-scoped labour transaction model | Organisation ID on all market records, policy owner and spending reservation; cross-scope rejection before bids. Test organisation mismatch and aggregate budget exhaustion. No provider dependency. |
| Stable identity plus versioned execution context | Agent ID versus adapter/task session (P1, P6) | Worker economics would otherwise be tied to model IDs | Stable worker registry; backend revision recorded on every attempt and qualification; changes invalidate current competence, not history. Test backend change and historic ledger retention. No provider dependency. |
| Contract-bound completion separates finished process from accepted work | Versioned contract/hash and assessment links (P7) | No exchange settlement binding exists | WorkOrder digest + verifier ID/revision + attempt result digest; charge every attempt but mark completed only on verifier pass; verifier exception fails closed and stays charged. Test wrong output, verifier failure and changed contract. No Paperclip runtime. |

Budget reservation is an exchange design strengthening informed by P4's admission boundary, not a claim that the reviewed Paperclip function already implements it. Use integer subunits and explicit currency/accounting basis. Unknown provider/energy costs stay unknown; a declared internal tariff is not an electricity measurement or an invoice.

## Digital labour equivalence checklist

| Concept | Finding in inspected snapshot |
|---|---|
| Worker rate cards | NOT FOUND as an operational worker tender contract |
| Competitive bids / job tenders | NOT FOUND |
| Expected completion cost | NOT FOUND as an award objective |
| Outcome accounting | PARTIAL: task-linked costs + completion evidence, no demonstrated full-outcome settlement |
| Worker qualification | PARTIAL: specific provider-profile qualification, not a demonstrated generic labour admission market |
| Performance-adjusted economic selection | NOT FOUND |
| Transaction settlement / worker earnings | Finance debit/credit and invoice fields exist; no demonstrated worker-payroll or outcome-settlement mechanism |
| Re-brokering | Recovery/reassignment exists; competitive rebidding with retained failed costs NOT FOUND |
| Internal labour market | NOT FOUND |

Task orchestration assigns and supervises work. Cost tracking attributes observations. Budget control admits/stops spend. Resource allocation reserves execution capacity. Digital labour brokerage additionally compares eligible offers, chooses on a stated economic objective, verifies delivery and accounts for the complete outcome. These can coexist without being interchangeable.

## Product and demonstration observations

1. Public landing page: captured and inspected [01-landing.png](provenance/EXTERNAL-EVIDENCE.md). The goal/team/approval narrative makes persistent agents understandable. It is a marketing surface, not runtime evidence. At the browser's observed narrow viewport, horizontal overflow is visible; no full accessibility verdict is justified.
2. Demonstration: the accessibility tree reported “Unable to play media”. Playback and runtime claims were therefore NOT VERIFIED. The visible example budget/table and task trace are illustrations, not observed executions.
3. Operational product: source/docs show issue, organisation and review workflows. An authenticated running Paperclip company was not set up, so a full dashboard flow audit, keyboard behaviour and actual failure recovery remain NOT TESTED. This review does not claim a completed operational UX audit.

For Agent Control, show outcome progress, the current owner, reasons for exclusion/award and measured completion charges in the existing dashboard. A company-style roster can improve comprehension, but must never imply real employees, paid earnings or verified competence merely because a card exists.

## Interoperability

Paperclip could be an optional execution adapter or source of externally managed worker registrations. A meaningful contract would need scoped remote identity, idempotent submission, cancellation/cleanup acknowledgment, evidence and cost export, qualification provenance, bounded delegation and control-plane authority precedence. None has been physically qualified here.

An upstream organisation might submit WorkOrders to Agent Control; alternatively Agent Control could award a bounded task to a Paperclip-managed workforce. Both are plausible **FUTURE CONSIDERATION**, with double retry, double accounting, authority inversion and incomplete cancellation as concrete risks. There is no demonstrated need to implement either for v4.15. Depending on Paperclip's database, native runner, company runtime or specific provider qualification constants would be **WOULD CREATE UNWANTED DEPENDENCY**.

## ADOPT NOW

Implement the four generic techniques in the recommendation table: ownership fencing, organisation attribution, persistent identity with backend-bound qualification, and contract-bound verification/settlement. They close concrete gaps in the proposed exchange. Add bounded outcome-budget reservations alongside them. These are design requirements to implement and test, not completed qualification claims. Use Agent Control's existing identity, containment, owned execution, qualification vocabulary and authenticated dashboard.

## INVESTIGATE LATER

Organisation hierarchies; task/adapter-specific context migration; externally managed workforce adapters; rich goal ancestry; multi-controller transactional storage and independently anchored audit roots. Evaluate each only against a concrete workload and authority model. Paperclip runtime budget races, recovery, completion arbitration and multi-company access boundaries require a separate executable qualification before relying on them.

## DO NOT ADOPT

Do not add a Paperclip runtime dependency, mandatory corporate hierarchy, provider-specific core qualification constants, claims of hard financial ceilings based only on observed-spend checks, or simulated employee earnings. Do not replace Agent Control governance or existing routing. Do not claim Paperclip lacks verification, qualification or recovery; those capabilities are visibly present in the inspected source.

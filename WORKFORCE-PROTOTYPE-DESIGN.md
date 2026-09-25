# Workforce Operations prototype design

Status: EXPERIMENTAL. All organisations, people, values and enterprise integrations are synthetic. No Kinfolk code, branding, UI or undocumented behaviour is incorporated. No relationship is implied.

## Execution architecture

The domain lives in src/workforce_ops. scripts/workforce-lab.ts serves an opt-in loopback companion workspace styled with Agent Control dashboard assets. The existing JobRuntime, JobCatalog, WorkerRegistry, RunLedger, ArtifactStore, ResourceLockManager, RuntimeSafetySupervisor, ContainmentSupervisor and OwnedProcessManager remain the execution and governance mechanisms. No core runtime file is modified.

A bounded deterministic intent recognizer converts supported natural language into a genuine versioned JobDefinition and RunRecord. It is deliberately not presented as model-based understanding. Unsupported, conflicting, secret-like or instruction-injection-like requests fail closed. Raw employee text is not retained. The UI tells users that values are preconfigured synthetic replacements, not extracted real bank/address details.

Five core-managed steps cooperate: intake -> policy -> prepare -> execute -> verify. Specialist capabilities select intake, policy, HR/payroll/IT/document and verification workers. Two registered deterministic workers per capability provide primary/recovery eligibility. WorkerRegistry handles health, capacity and capability expiry. Agents are operational identities, not necessarily models.

Typed, hash-checked ArtifactStore plans bind request identity, employee/tenant, before-state, field, value and tool. The mutation reads the retained artifact. Approved work resumes through JobRuntime.approve; the approval actor is checked by the domain for tenant, role and separation from requester. Stale state fails closed instead of overwriting concurrent work. Rejection uses JobRuntime.cancel.

## Synthetic enterprise model

Two demo organisations and two employee scopes each are stored as synthetic records. Manager, HR, Payroll, IT and Finance are role types; manager/HR/payroll participate in authorization, IT is a specialist execution capability, Finance is represented but no finance workflow is qualified. Mock HRIS, payroll, identity, document and policy tools are typed field operations on synthetic durable JSON. Onboarding/offboarding/international work prepares a scoped case: it does not claim to execute a complete real enterprise lifecycle. Salary complaints open a reconciliation case; they do not change real salary.

Every accepted mutation has a tool request, policy/approval reference, before/after artifact, worker identity and independent state readback. The read-policy scenario records a synthetic policy-read marker; this is demonstration state, not an employee master-data change. Unknown external costs and energy remain UNKNOWN.

## Scope violation

The fault injector proposes a different employee-specific tool than the sealed allowed tool. Existing assessScope blocks it before any mock-system write. A bounded Node process is genuinely owned and running; ContainmentSupervisor kills that registered worker scope and transitions to QUARANTINED. WorkerRegistry excludes the degraded/quarantined identity. A retryable ActionFailure preserves the original run, attempt, approval and artifact. Core retries choose the eligible replacement. The verifier checks actual record state and the other employee remains unchanged.

This demonstrates tool-boundary control of a bad action and process containment. It is not proof that arbitrary malicious JavaScript running inside the controller cannot access memory/files. All domain handlers are trusted code; the out-of-scope action is intentionally injected.

## R&D dimensions

The same frozen 120-case workload is run against balanced approval with redundant workers, balanced approval with only fallback identities online, and review-all approval with redundant workers. The single-eligible-worker profile exposes recovery failure safely. No model, provider, remote transport or Lean/Standard/Deep performance experiment is claimed. Those existing runtime integrations remain future gated configurations, not dropdowns pretending to work.

The Digital Labour Exchange is not required or instantiated. An optional future bridge could offer worker eligibility/qualification after its own adapter contract and qualification. Its experimental status is unchanged.

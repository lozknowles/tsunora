# Conceptual-integrity gate

Every significant Agent Control capability must have one owner, one authoritative state path and durable proof. Review the proposal before implementation and the result before merge.

## Domains

Use the repository vocabulary: policy/authority, scheduling, execution substrate, provider/model adapter, routing, context/evidence, verification/provenance, operator interface, persistence and observability.

## Required proposal record

- Capability and owning domain
- Authoritative component
- Existing abstraction being extended
- Whether it affects leases, ownership, PTYs, scheduler decisions or takeover
- Confirmation that authority effects cross `AgentControlService`/the control policy boundary
- Confirmation that it creates neither duplicate authoritative state nor a second control path
- Fail-closed behavior
- Durable verification evidence

`assessConceptualIntegrity` in `src/control/architecture.ts` provides an executable baseline. It rejects browser-owned authority, provider-owned policy, duplicate state, second paths, missing failure modes and missing evidence. It does not replace architectural review; it makes the non-negotiable rules testable.

## 3.1 dashboard assessment

| Question | Answer |
|---|---|
| Domain | Operator interface |
| Authority | `AgentControlService` and existing control core |
| Extended abstraction | Lane/control projection and command service |
| Duplicate state | No; browser state is an expendable projection |
| Second control path | No; HTTP and TUI call the same service |
| Lease mutation | No dashboard command mutates a lease directly |
| PTY mutation | Only authoritative takeover/return; no web input primitive |
| Scheduler mutation | Requests validated by service; browser cannot edit scheduler storage |
| Human takeover | Existing unconditional fence |
| Failure mode | Observer-only or unavailable; core continues |
| Evidence | API, auth, SSE, routing, verification, takeover and full regression tests |

## Rejection examples

- Keeping browser-only lane status
- Letting a provider adapter select winners or issue leases
- Inferring completion from terminal output
- Treating three matching agent claims as verified evidence
- Letting an external thread approve an action
- Adding a PTY WebSocket writer that bypasses ownership generations
- Passing a raw agent handler to `WorkExecutor` or treating a named control operation as a legacy agent fallback

## 3.1 adaptive dispatch assessment

| Question | Answer |
|---|---|
| Domain | Adaptive harness / execution boundary |
| Authority | Existing scheduler, lane lease and PTY ownership services |
| Recipe role | Pure construction and inspectable identity; cannot claim work or accept results |
| Default agent path | `WorkExecutor` requires an `adaptive-harness` dispatch |
| Raw-handler exception | Named, scope-checked control operations only |
| Tool path | Executor receives only `ToolInvocationGateway`; every call revalidates live policy/authority |
| Placement versus routing | Scheduler selects worker; harness routes a provider/model only among that worker's candidates |
| Human takeover | Live human owner rejects every retained recipe gateway immediately |
| Completion | Recipe execution stops at `verification-pending`; acceptance is separate |
| Durable identity | Recipe fingerprint and dispatch record contain no credential material |
| Remaining gap | Opaque CLI-internal tools and future model-backed Job Actions are not yet universally moderated |
| Evidence | `adaptive-harness.test.ts`, `harness-dispatch.test.ts`, `work-executor.test.ts`, full serial suite |

## 3.1 Job runtime assessment

| Question | Answer |
|---|---|
| Domain | Scheduling / persistence |
| Authority | `JobRuntime` behind `AgentControlService` |
| Extended abstraction | Existing Work Queue capability placement, priorities and policy boundary |
| Duplicate scheduler | No; the Job runtime owns workflow/DAG state and reuses the existing capability/resource vocabulary for atomic placement |
| Presentation state | None; TUI and web read the same catalog, ledger, registry and locks |
| Provider routing | Separate; worker placement cannot substitute a model/provider |
| Manifest authority | None; a Job requests capabilities/approvals but cannot grant them |
| Takeover | Unchanged and unconditional; the runtime has no PTY write primitive |
| Failure mode | Visible wait/degraded/disconnected state; restart identity uncertainty fails closed |
| Evidence | Schema, scheduler, artifact, lock, API, authority and full regression tests plus safe reference qualification |

Redesign these through the existing control, evidence or execution contracts instead.

# Agent Control concepts

Agent Control is an infrastructure-neutral policy control plane with an executable adaptive-harness core. It governs durable work by heterogeneous agents and models, assembles task-appropriate execution recipes, and keeps authority, evidence and human control outside every replaceable worker or execution substrate.

The 3.0.x baseline implements the durable lane/control model, capability and provider qualification primitives, adaptive recipe construction, qualified-skill selection, explicit tool grants, context selection, evidence/provenance, successive halving, PTY authority and replaceable execution providers. Release 3.1.0 adds the Job Catalog, Worker Registry, Run Ledger, dashboard, verification service, default recipe-backed Work Queue dispatch and a qualified model-backed Job Action bridge. Every supported gateway tool is reauthorised against live lease/ownership state; tools run internally by opaque external CLI agents remain an explicit mediation gap.

## Agent Control

The authoritative policy and state boundary. Agent Control decides what may run, where, with which capabilities, under which lease and ownership generation, and what evidence is required. Agents and adapters can request changes; they cannot directly grant themselves authority.

## Harness

The policy-controlled environment assembled around an agent or model. It includes capability resolution, routing, prompt/profile, context, skills, tools, runtime settings, resource limits, authority, execution and verification. The harness is broader than a scheduler, PTY manager or provider adapter.

## Lane

A durable ownership boundary for a stream of work. A lane has a hard contract, baton, lease, mode, priority, model state and evidence. Processes, models, recipes, sessions and hosts may change while lane identity continues.

## Task

The objective and acceptance conditions assigned to a lane or shared across lanes. A task describes the outcome; it should request capabilities rather than hardcode infrastructure.

## Baton

A compact, revisioned handoff summary: current state, progress, evidence, changes, next action, questions and optional shared-context references. A baton supports cheap recovery and handoff but does not replace Git or test evidence.

## Ownership

The right to control a lane or write to its execution session. Logical ownership is granted by Agent Control and is distinct from observing a process or discovering a PTY.

## Lease

A time- and generation-bounded Agent Control grant to act for a lane. Stale leases cannot write, cancel or regain ownership merely because an old process or session still exists.

## Worker

A resource capable of satisfying part of an execution recipe: a host, remote node, provider endpoint or other runtime placement. In 3.0.x workers are represented by configured resources and capabilities. The 3.1 branch adds a formal capability-advertising Worker Registry for Job placement; worker placement remains distinct from provider/model routing.

## Provider

An adapter or service that makes a model/agent/runtime available. Providers declare health, capabilities, cost class and qualification identity. They do not schedule lanes or own Agent Control state.

## Model

The concrete model or agent implementation used within a recipe. Agent Control reasons from qualified capabilities and evidence, not from a model name alone.

## Capability

A stable semantic requirement or property such as repository read, structured output, browser access or a reasoning/coding qualification. Capabilities are separate from machine names and transports.

## Skill

A versioned, bounded piece of task scaffolding that can add a qualified capability and require a known tool set. The 3.0.x catalog selects only qualified skills carrying evidence. Skill proposal, security review, sandbox tests, approval and promotion are planned for 3.1; proposed skills cannot be selected or self-granted.

## Tool

An enforceable operation exposed to an execution, such as repository read, edit or test. Tools have risk classifications. The recipe receives a minimum explicit grant. Unknown, omitted, denied, revoked, unavailable, worker-incompatible, policy-restricted and unapproved-risk tools fail closed. Each invocation checks live lane, lease, ownership and human-takeover state. Prompt text is not a tool security boundary.

## Execution recipe

A fingerprinted description of how Agent Control intends to execute one task attempt:

```text
worker
+ provider/model
+ prompt profile
+ context strategy
+ qualified skills
+ granted tools
+ runtime settings
+ authority generations
+ resource limits
+ verification policy
+ escalation policy
```

`ExecutionRecipe` is broader than the existing `ModelRecipe`. `ModelRecipe` is the qualification fingerprint for a model/runtime/prompt/skill/tool/parameter combination; the execution recipe adds placement, provider, context, authority, limits and policy.

## Prompt profile

A versioned instruction style selected for a task/model combination. A smaller model may need a guided sequential profile while a strongly qualified model can use a direct profile. A prompt profile can guide behaviour but cannot grant tools or authority.

## Context

Selected, minimum-sufficient information supplied to an execution: baton, repository evidence, previous runs, approved documents, shared threads or external sources. Context routing accounts for confidence, complexity, token capacity, cost and latency. Context is informative, not authoritative.

## Token-aware command output

A command result can have one authoritative artifact and several derived context representations: summary, semantic index, selected captured context and complete result. `COMPLETE`, `COMPACTED`, `TRUNCATED` and `ARTIFACT_ONLY` describe what the consumer received; they are never inferred from prompt wording. A scoped handle lets an authorised execution move progressively from **Inspect -> Expand -> Read** without rerunning a search or paying the full initial context cost. Derived views retain a hash link to the artifact and never outrank it as evidence.

## Evidence

An observation or artifact that supports or contradicts a claim. Evidence has a trust class: executable/test results and repository state outrank agent interpretation and unsupported assertion.

## Verification

The policy-governed process that compares a claim with required evidence. For example, code work may require a diff and tests; other task types need different evidence. 3.0.x implements evidence/provenance and recipe requirements. Universal per-task claim-to-acceptance execution is a 3.1 improvement.

## Provenance

The trace from a decision back to conclusions, agents/models, context sources, commits, tests and other evidence. Provenance makes disagreement and repository state inspectable rather than hiding them in a prompt transcript.

## Execution substrate

The mechanism that runs or connects to an execution: PTY, Orca, SSH, browser/mobile automation, local runtime or API. A substrate executes; Agent Control decides. Losing contact with a substrate is not proof that a process died.

## Human takeover

An unconditional Agent Control ownership transfer to an authorised human. It increments ownership generation and fences agent/programmatic writes. No recipe, skill, tool, provider or reconnect can delay takeover or silently regain ownership.

## Qualification

Evidence that a model, provider, skill or recipe satisfies named capabilities under known conditions. Qualification records exact identity and sample evidence; configuration or documentation alone is not qualification.

## Successive halving

An implemented experimental process that evaluates many recipe fingerprints cheaply, advances stronger candidates through increasingly demanding stages and eliminates weak candidates. Automatic promotion into a durable governed recipe catalog remains planned.

## Claim, verified result and accepted result

These are distinct states:

```text
agent claim -> evidence -> verification -> accepted result
```

An agent saying “done” is not verification. A majority repeating an unsupported assertion does not outweigh reproducible evidence.

## 3.1 concepts

The following are implemented in 3.1.0; they are not features of the immutable 3.0.1 release. Governed skill creation, universal adapter verification and automated recipe learning remain follow-on work. The authoritative machine-readable boundary and its evidence links are in [`config/implementation-status.json`](../config/implementation-status.json), projected as [`docs/implementation-status.md`](implementation-status.md).

### Job

A reusable declaration of outcomes, actions, dependencies and required capabilities. A Job invokes the harness; it does not contain control-plane authority.

### Action

One step of a Job. Each Action is registered and versioned. Control Actions remain explicit control-owned handlers. A model-backed Agent Action delegates through `HarnessJobAgentAction`, produces an execution recipe through `HarnessDispatcher`, receives only the live ToolPolicy gateway and stops at the verification boundary. Action registration alone never qualifies a model or grants authority.

### Schedule

A policy-approved trigger for a Job, including Run Now. Scheduling selects when work becomes eligible; it does not bypass leases, approvals or recipe construction.

### Run

A durable instance of a Job with inputs, action attempts, decisions, outputs, evidence and status.

### Artifact

A durable output or evidence reference produced by a Run, such as a diff, commit, report, test result or generated file.

### Resource lock

A declared exclusivity constraint for a resource or capability while an action runs. Locks are granted and reconciled by Agent Control, not by a worker.

### Job-to-harness relationship

```text
Job Catalog
    |
Schedule / Run Now
    |
   Run
    |
Agent Control policy
    |
Adaptive Harness
    |
execution recipe for each Action
    |
worker / model / skills / tools / substrate
```

A multi-worker workflow can therefore declare different capabilities for discovery, reconciliation, publication and verification without naming a personal device or host. The harness resolves each action independently under the same authority and evidence rules.

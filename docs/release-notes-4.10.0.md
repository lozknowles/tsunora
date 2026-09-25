# Agent Control v4.10.0 — Dynamic Work Board, Parallel Lanes and Governed Containment

Agent Control 4.10.0 adds a durable, user-controlled work plan and a scheduler that can run safe independent lanes in parallel while preserving Agent Control Jobs and Work Parcels as the execution authority.

## Dynamic Work Board

Operators can maintain ordering, priority, dependencies, lanes, blocked states, resource conflicts and linked execution evidence. Natural-language plan changes produce a reviewable proposal before mutation. Dynamic reprioritisation respects each adapter's qualified interruption and resume behavior.

## Parallel lanes

Independent work may execute concurrently only when dependencies, resource conflicts, worker capabilities and containment policy permit. Missing or uncertain authority fails closed.

## Hierarchical containment

The scheduler-independent containment supervisor governs the implemented job, lane, worker, model, node, workspace and Estate scopes. Execution-scope envelopes mechanically restrict undeclared resources. A distinct runtime kill scope is not implemented; runtime routes inherit stable Worker/Node containment authority.

## Quarantine scheduling fence

A persisted quarantine excludes a worker or node before health, reconnect, capability, priority or preference is evaluated. New PIDs and session generations cannot bypass stable identity. If another qualified route exists it may be selected; without one, the work remains `BLOCKED`. Eligibility returns only after `INSPECTED → RESET → REQUALIFIED → AVAILABLE` is evidenced.

## Reliability safeguards

The release incorporates the qualified 4.9 follow-up: governed `RAW_INFERENCE`, explicit API/local and token/cache/reasoning accounting, live-writer-safe activity-log repair, protected writable-workspace metadata and cancellation fencing before abort.

Generic Harness Interaction Profiles, declared-versus-observed capability drift, transactional approval effects, optional W3C correlation and typed outbound-worker transport contracts remain provider- and runtime-neutral. Agent Control has no Omnigent dependency.

## Qualification boundary

**Physically qualified on measured Linux qualification host:** real parallel lanes, dynamic reprioritisation, Job/Lane/Worker containment, descendant and process-group cleanup, SIGTERM-to-SIGKILL escalation, durable quarantine, restart/reconnect persistence, stale-result rejection, alternative routing, unsafe-fallback prevention, governed recovery, isolated Estate Emergency Stop and preservation of unrelated workloads.

**Automated-test qualified:** broader contract, persistence, dashboard, approval, drift, transport state-machine and restart scenarios covered by the release suite.

**Experimental or unqualified:** Pixel/remote containment, physical generic outbound-worker transport and physical phone-hosted model/computer-use routing. The phone route is optional and is not presented as supported physical capability.

## Known limitations

- no distinct runtime kill scope;
- no complete dashboard containment/recovery timeline;
- some restart scenarios remain automated-test rather than separate physical qualification;
- Pixel/remote containment remains unqualified;
- generic outbound-worker transport remains experimental.

See the [Dynamic Work Board guide](dynamic-work-board.md), [upgrade guide](upgrade-4.10.md), and [release verification](release-verification-4.10.0.md).

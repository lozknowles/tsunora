# Agent Control 3.1 Jobs and scheduler

## Model and ownership

```text
Action definition -> Job manifest -> Trigger -> Run ledger
                                         |
                                      Run steps
                                         |
                        capability resolver + resource locks
                                         |
                                  registered worker Action
                                         |
                           typed artifact -> verification
```

An **Action** is a registered, versioned handler such as `example.report@1.0.0`. A **Job** is a declarative DAG of Actions. A **Schedule** is a separate trigger definition. A **Run** is an immutable historical invocation of one exact Job version and effective parameters. A **Worker** is a configured resource advertising observed capabilities. An **Artifact** is a typed, checksummed output stored by Agent Control and consumed by explicit downstream input references.

`JobRuntime` owns workflow state. `AgentControlService` is the only TUI/HTTP mutation boundary. The existing Work Queue continues to own atomic interactive/background/batch concepts; Jobs extend that scheduling vocabulary rather than creating interface- or cron-owned state. Model routing is separate from worker placement.

## Manifest format

Manifests are YAML or JSON under `config/jobs/`. `apiVersion: agent-control/v1` is validated against `config/schemas/job-v1.schema.json` or `schedule-v1.schema.json`. Catalog loading also rejects unknown Actions, duplicate steps, missing dependencies, cycles, invalid typed defaults, plaintext secret material and a Schedule referencing a missing Job version.

```yaml
apiVersion: agent-control/v1
kind: Job
metadata:
  id: repository-check
  name: Repository check
  version: 1.0.0
spec:
  enabled: true
  priority: normal
  concurrency: no-overlap
  parameters:
    suite:
      type: string
      default: full
  retry:
    attempts: 1
    backoffSeconds: 30
  steps:
    - id: test
      action: personal.repository.check@1.0.0
      requires: [git, node]
      resources: [repository/project]
      outputs:
        - name: report
          type: application/vnd.agent-control.test-report+json
          schema: test-report/v1
          version: 1.0.0
      verification: [tests-passed]
```

Adding a personal workflow normally requires registering an Action in an adapter package and adding a manifest. Do not edit `JobRuntime`. Action handlers receive bounded parameters, explicit input artifact metadata, a checksum-validating artifact reader, selected worker identity and an abort signal. They return only declared artifacts, evidence and named verification observations. In 4.3 every production Action must use `registerReadOnly`, `registerConsequentialControl` with explicit categories, or `registerGovernedControl` with a typed effect resolver. Legacy registration is `UNKNOWN` under runtime safety and fails closed; names, descriptions and parameter keys cannot grant read-only authority. An Action that asks an agent/model to perform work must delegate through `HarnessDispatcher`; registration alone cannot grant a model a raw handler or tool authority. See [runtime safety and route containment](runtime-safety-and-containment.md).

Sensitive parameters use an environment-variable **reference name** with `secretRef: true`; the manifest and persisted Run never contain the credential. A Job requesting `production-access` still waits unless Agent Control has an authorised healthy worker advertising that capability. A manifest cannot confer authority.

## Schedules

Schedules are repository-managed and persisted runtime enablement is separate:

```yaml
apiVersion: agent-control/v1
kind: Schedule
metadata: {id: morning-check, name: Morning check}
spec:
  enabled: false
  job: repository-check@1.0.0
  cron: "0 7 * * *"
  timezone: Europe/London
  missedRunPolicy: skip
```

The first implementation supports five-field cron expressions containing `*`, single numbers and comma-separated numbers. Timezone calculation uses IANA zones and therefore observes DST. Missed policies are `skip`, `run-next-available` and `run-once-immediately`; the scheduler never replays every historical occurrence. The Schedule tracks previous/next time, last Run/success/failure and misses in the Run ledger. Manual and Schedule triggers both call `createRun`.

Concurrency is `allow`, `no-overlap`, `replace-running` or `queue`. The conservative reference workflow uses `no-overlap`. Replacement requests cancellation; a live Action retains its resource locks until it returns after abort, preventing unsafe overlap.

## Run and step states

Runs use `SCHEDULED`, `QUEUED`, `WAITING`, `AUTHENTICATION_BLOCKED`, `RECONNECTING`, `RUNNING`, `VERIFYING`, `CANCELLING`, `CLEANUP_UNCERTAIN`, `SUCCEEDED`, `FAILED`, `DEGRADED`, `CANCELLED`, `MISSED` and `DISCONNECTED`. Steps additionally distinguish dependency/worker/resource/approval waits, authentication/reconnect, `DISPATCHED`, `RETRY_PENDING`, `CANCEL_PENDING`, cleanup uncertainty and timeout. The dashboard reads these durable structures; terminal text is supplementary only.

Legal progression is queue/wait -> running -> verifying -> succeeded, or queue/running -> bounded retry -> running. Transient transport and expired enrolment are separately retryable inside the declared attempt/deadline budget; authentication-required waits for human action, while permanent configuration fails closed. Cancellation proceeds through requested cleanup and requires verified process-group/tree absence before terminal status. A zero process exit is insufficient: every declared verification name must be observed before a step succeeds. An upstream failure cancels dependent steps.

On restart, an in-flight execution is not assumed alive or automatically replayed. The ledger marks it `DISCONNECTED` with its durable execution ID; locks remain held while the configured adapter reconciles the exact route and continuity. Proven same-ID work may enter `RECONNECTING`; changed/unknown identity requires operator reconciliation. Completed artifacts, Git state and ledger history remain available. PID is never sufficient recovery identity.

## Workers, resources and artifacts

Workers advertise capabilities, health, capacity, load and optional expiry timestamps. Placement requires every requested capability on one healthy available worker. The Run records eligible workers, rejection reasons and the selection rationale without fabricated scoring precision.

Generic managed Linux nodes feed discovered heartbeat, capabilities and workload blocks into this same registry. A BUSY protected-workload node retains safe inspection capability but rejects configured disruptive or excessive requirements with a visible `workload_blocked:<capability>` reason. The bundled `managed-node-inspection` and `managed-node-maintenance` Jobs demonstrate typed remote Actions; the latter always waits for the exact protected-workload override approval. See [`managed-nodes.md`](managed-nodes.md).

Resource IDs such as `repository/project` or `browser-session` are semantic locks, not hostnames. Contention produces `WAITING_FOR_RESOURCE` with the holder and acquisition time. Locks persist across restart and release after confirmed success/failure/cancellation.

Artifacts contain Run/step IDs, MIME-like type, schema, version, time, byte size, SHA-256, retention, storage reference and provenance (Job/Action/worker). The store verifies the checksum on every read. Downstream steps consume `step-name.artifact-name`; no shared worker path is assumed.

## Operation

Start Agent Control with `npm start` or `npm run web`. The Job catalog is read-only in the UI; review and commit manifests through normal Git workflow. Configure `AGENT_CONTROL_JOB_DIR` only when a different reviewed catalog is required. Operator mutations require `AGENT_CONTROL_WEB_OPERATOR_TOKEN`.

The dashboard shows Jobs, schedule state, Queue reasons/age/eligibility, searchable Run history, worker capacity, resource locks, verification, artifact checksums and provenance. Run Now, enable/disable, cancel, whole-Run retry and exact named approval all cross the application-service policy boundary. Approval is legal only for a matching step already in `WAITING_FOR_APPROVAL`. Press `J` in the TUI for the same projection. Structured runtime files live under `.agent-control/jobs/`; run one authoritative process per state directory.

Qualification:

```bash
npm run check
npm run qualify:jobs
npm run qualify:managed-node -- --resource linux-worker-a
git diff --check
```

The bundled `events-refresh-qualification` workflow proves mobile/publisher/observer placement, typed artifact retention while a publisher is offline, continuation when it returns, verification and unchanged lane lease/baton/PTY ownership. It uses fixture data, performs no network access, and publishes only a no-op non-production artifact. Its twice-daily Schedule is disabled. Real Facebook access and LocalWalks publishing require separately implemented/qualified Action adapters and existing production approval/release controls.

## Current limits

- General cron ranges/steps and webhook/repository/artifact triggers are extension points, not implemented.
- Remote artifact transport adapters are not yet implemented; the authoritative store proves the contract locally.
- Worker liveness beyond local configured resources must be fed by the existing health/remote-resource layer; a configured worker is not automatically healthy.
- In-flight Action reattachment is fail-closed rather than automatic because execution identity handshakes are Action/execution-provider specific.
- Per-step retry from the UI currently retries the whole historical Run; safe selective step retry remains future work.
- Model-backed Actions are not yet universally wired to `HarnessDispatcher`; the current reference workflow uses deterministic control-owned fixture Actions. Opaque tools used inside an external CLI are not claimed as per-tool moderated.

# Migrating to Agent Control 3.9

Agent Control 3.9 is an additive, fail-safe migration from 3.8.2. It introduces durable execution/recovery fields, verified cleanup evidence, provenance-aware resource measurements, optional prompt-cache capabilities, an optional Android local-ADB helper, layered Work Parcel context, capability intelligence and append-only model evaluation history. It does not deploy services, alter credentials, enable Jobs/Schedules/Spark, pair a device, promote a model or migrate provider authentication automatically.

## Work Parcel context migration

Existing Parcels remain readable. A newly submitted Parcel receives concise active state, an immutable event chain, retrieval records, bounded baton views, steering amendments, questions and success criteria. Existing `agent-control.work-parcel-baton/v1` records remain historical evidence; new orchestration emits v2 context-view batons. Do not delete older baton/history files after upgrade.

Custom planners should continue to return stable stage IDs and acyclic `dependsOn` arrays. They may additionally declare required capabilities and inferred criteria. Independent ready stages can now dispatch concurrently, so custom Actions must rely on declared resource locks rather than accidental serial ordering. A question must list its dependent stage IDs; omitting unrelated stages is what permits work to continue.

Completion policy is stricter for new criteria-enabled Parcels: every required stage and criterion must pass. Integrations that previously treated a provider completion string as success should attach independently checkable evidence and evaluate the corresponding criterion.

## Capability and model-history migration

Configured provider/model capabilities remain accepted as unverified seeds; they no longer constitute verified routing evidence by themselves. Populate capability observations through bounded qualification and keep provider-specific event/API parsing in adapters. Core policy should request generic capability IDs.

The model-intelligence files are append-only. Preserve them across controller upgrades and back them up with other state. Re-running the same suite creates a new batch and attempt identities; it must not overwrite prior evidence. Lifecycle promotion does not occur automatically. Review warnings, sample size, quality/reliability and known economics, then use the authenticated transition with required approval.

The frozen suite is [`../config/qualification-suite-v1.json`](../config/qualification-suite-v1.json). A changed prompt, fixture, scoring rule, safety criterion or repetition count requires a new suite version/hash rather than an in-place historical reinterpretation.

## Before upgrading

1. Stop the authoritative controller cleanly and retain a backup of its configured state directory.
2. Record `agent-control --version`, the installed package SHA or Git commit, and `agent-control status`.
3. Confirm there is only one controller process using the state directory.
4. Inspect nonterminal Runs. Do not discard their locks or manually relabel them terminal.
5. Preserve provider credential references on their existing credential-residency nodes; do not copy credential stores.

## Install and validate

From the reviewed 3.9 package or checkout:

```bash
npm install --no-package-lock --ignore-scripts
npm run check
npm pack --dry-run
agent-control --version
```

Start the controller with the existing configuration and state directory, then inspect Jobs, Systems and Models. Existing 3.8 records remain readable because new execution, recovery, cleanup and measurement fields are optional on historical records. A pre-provider `RESOLVING` Run with no execution identity may return to the queue. An interrupted provider execution becomes `DISCONNECTED` and must be reconciled against its exact durable execution ID; it is no longer blindly requeued.

## Retry policy

Existing retry settings remain valid. Ordinary versioned Job definitions may opt into bounded exponential/deadline controls:

```yaml
retry:
  attempts: 3
  backoffSeconds: 5
  backoffMultiplier: 2
  maxBackoffSeconds: 30
  overallDeadlineSeconds: 180
```

Parameterized review definitions use the existing budget object:

```json
{
  "maximumRetries": 2,
  "retryBackoffSeconds": 5,
  "retryBackoffMultiplier": 2,
  "retryMaximumBackoffSeconds": 30
}
```

Transient transport and expired enrolment can retry inside this budget. Authentication-required waits for human action; permanent configuration does not retry. Route identity does not change as a side effect of recovery.

## Process cleanup

Actions now receive `ActionContext.ownedExecution` and should launch child work through that port. Custom Actions that bypass it cannot claim verified descendant cleanup. Cancellation is complete only when the returned cleanup outcome is `confirmed`. Treat `uncertain`, `identity-mismatch` and `failed` as fenced reconciliation states; do not release resource locks manually merely because the leader process exited.

Linux requires normal process-group signalling and readable `/proc/<pid>/stat` for strongest identity proof. Windows uses its existing PowerShell/CIM and `taskkill` facilities through fixed adapter code. No arbitrary PowerShell or shell API is added.

## Resource telemetry

Consumers must read measurement `value` together with `source`, `authority`, `freshness`, `limitations` and `qualifiedForAdmission`. Do not coerce null to zero or use a derived Android cpuidle busy value for admission. The first CPU-counter sample is intentionally unavailable; a second fresh sample is required.

## Prompt-cache capabilities

No cache control is enabled by default. The portable prompt structure works without provider caching. Add `prompt-cache.key` or `prompt-cache.explicit` to both a provider and its exact model only after that wire API/model pair has been independently qualified. These capabilities currently apply to Responses requests; Codex CLI and Chat Completions retain their prior request shape.

If configured pricing distinguishes cache writes, add `pricing.cacheWritePerMillionTokens` only with a sourced price. Calculated cost remains unknown whenever the provider does not report a required cache-write/read count.

Use the controlled measurement command before claiming a benefit:

```bash
npm run qualify:provider-cache -- \
  --output=/absolute/path/cache-evidence.json \
  --repository=/absolute/path/repository \
  --files=src/example-a.ts,src/example-b.ts
```

The report contains hashes and normalized usage, not prompt bodies or credentials. Cache acceptance/hits alone do not establish lower cost or latency.

## Android local ADB

The Android node gains status and bounded reconnect operations. Existing base capabilities remain available, but `android.adb.local` and `transport.adb` appear only after the same-device connection passes independent verification. Startup never pairs.

First pairing is an explicit local ceremony. Keep the Android System pairing-code dialog open and provide the six-digit code to `android/adb-local.mjs pair` through hidden stdin only, as documented in [`../android/README.md`](../android/README.md). Never place it in arguments, controller state or evidence. If native/local DNS-SD cannot discover a unique pairing service, stop and retain the capability as unavailable rather than entering a guessed address.

Pairing and connect advertisements use a stable `adb-<device-guid>` prefix with independent six-character suffixes; operators should not expect their complete DNS-SD instance names or ports to remain equal. The helper correlates the stable identity, rediscovers a changed port and verifies the selected target with fixed ADB state/property operations before publishing capability. The 3.9 candidate physically passed this lifecycle on the recorded Android 17 / Termux / ADB 35.0.2 environment, including capability withdrawal, same- and changed-endpoint reconnect, governed typed execution and fresh-process session resume. A different Android or ADB build remains independently capability-assessed.

## Rollback

Stop the 3.9 controller, restore the previous 3.8.2 package/checkout and the state backup taken before upgrade, then run `agent-control --version` and `agent-control status`. Do not point an older process at state that was concurrently modified by a newer controller. Provider credential stores and Android pairing material are external to this source migration and must not be copied or rewritten during rollback.

See the [3.9 release notes](release-notes-3.9.0.md), [architecture](../ARCHITECTURE.md), [dashboard guide](web-dashboard.md), [Work Parcel guide](work-parcels.md), [provider/model lifecycle](provider-model-lifecycle.md), [managed-node guide](managed-nodes.md), [resilient qualification](evidence/agent-control-3.9-qualification.md), and [provider-neutral qualification](evidence/agent-control-3.9-provider-neutral-qualification.md).

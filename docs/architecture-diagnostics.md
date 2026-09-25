# Permission-governed architecture diagnostics

Environment Discovery can now enumerate diagnostic sources without reading their contents, then run an explicitly permitted, read-only architecture assessment through the normal Job runtime. Open **Environment → Diagnostics → Permissions**. No source is selected by default and no log collection happens during enumeration.

## Permission and execution boundary

1. **Discover diagnostic sources** lists exact targets, categories and metadata availability. Authentication and same-origin mutation checks are the existing dashboard checks.
2. Select sources, a UTC window and `NONE`, `ERRORS_ONLY`, `RECENT_SAMPLE` or `FULL_DIAGNOSTIC_SCAN`. Review privacy handling and optional model settings. Grant the exact scope.
3. **Run governed assessment** queues `architecture-health@1.0.0`. The built-in controller observer uses capability `agent-control.architecture-diagnostics.read` and the existing scheduler, worker identity, runtime safety, cancellation and artifact machinery.
4. **Revoke permission** aborts active collection, denies subsequent model dispatch and denies subsequent content/report access. Existing downloaded reports cannot be recalled. Local historical evidence is preserved.

The grant binds the inventory digest, source identities, actor, requesting job, inclusions/exclusions, exact time window, byte/line/event/source/time limits, privacy policy and external-processing flag. Grants expire after one hour. A process restart requires fresh enumeration and a new collection grant; retained evidence still obeys its recorded permission expiry/revocation. Native execution also binds the triggering actor and checks execution authority across asynchronous boundaries.

`ERRORS_ONLY` retains only classified error records. Text files must be scanned within the byte bound to determine severity; non-error contents are not retained or sent to models. `RECENT_SAMPLE` permits at most 24 hours. Other modes permit at most seven days and remain bounded. The UI uses 512 KiB per source, 2 MiB total, 2,000 lines per source, 500 event groups and 10 seconds per read helper. The API has explicit upper bounds too.

This capability has no restart, kill, package-install, configuration-write, firewall or remediation action. Owned read helpers can be cancelled; target services are never signalled. Remediation fields are inert proposals. To act, create a separate governed job with its own normal approval and verification path.

## Sources and extension point

`DiagnosticSourceAdapter` separates `enumerate` (metadata only) from `collect` (permission required). The engine accepts adapters without adding source-specific logic to its correlation pipeline.

| Adapter | Sources | Boundaries |
| --- | --- | --- |
| Linux files | syslog, kern.log, auth.log, nginx/Apache error and access logs, configured Agent Control activity JSONL | Administrator-configured paths only. Regular files, no final symlink following. Device/inode must still match the grant after opening. Rotated/replaced files require a new inventory/grant. |
| Linux journal | system journal, kernel journal, service journals | Fixed argument vectors and owned helpers, never a shell or sudo. System journal selection excludes authentication facilities 4 and 10 and entries without a selected facility. Dedicated security sources remain separate. |
| Kernel ring buffer | dmesg with ISO time selection | Unavailable/denied commands remain explicit missing coverage. Ambiguous timestamps are withheld. |
| Containers | Docker/Podman logs and bounded lifecycle events | Container IDs come from metadata enumeration. No inspect environment dump and no container mutation. Runtime/engine permissions are not elevated. |
| Model runtime | Model-related service journals, CUDA/VRAM/context patterns in permitted kernel/application sources | No model configuration changes. Custom file sources can be registered by an administrator through the file adapter. |
| Agent Control | Existing append-only activity JSONL | Read only; never calls activity log repair or rewrites original history. Job/worker/lane/status fields become normalized events. |

Enumeration reports metadata presence, not a promise that the OS will permit content access. Source helpers run on the controller. Arbitrary remote-host log browsing, remote log URLs and arbitrary user-supplied paths/commands are not exposed.

## Evidence, privacy and analysis

Normalization extracts timestamps, source/component, host, service, process/PID, container, severity, event type, resource, job, worker/lane and evidence reference where present. Journal microseconds, explicit ISO offsets and Apache access timestamps are supported. Missing/ambiguous timezone or timestamp is counted and excluded rather than guessed. File tails discard a partial initial line. Malformed/oversized lines are counted and withheld.

The deterministic sanitizer handles private/SSH material, bearer/basic credentials, JWTs, URL credentials, password/token/API-key/session/cookie fields, connection strings and long credential-like values. It recursively sanitizes structured values. Hostnames, usernames, addresses, MACs, paths, emails and identifiers have KEEP/REDACT/keyed-pseudonym policies; secrets are never exempted by KEEP. A private local salt gives stable pseudonyms across assessments. Raw excerpts are neither persisted nor audited. SHA256 references bind **sanitized** evidence, not raw secret-bearing records.

Sanitization is heuristic, not a proof that every possible secret was recognized. Keep external processing disabled for sensitive estates. Logs and model hypotheses remain untrusted data rendered as text, never interpreted as executable instructions.

Fingerprints aggregate repetitions within five-minute buckets while retaining first/last time and counts. Pattern rules identify recurring restart, resource, connection, proxy, timeout, dependency and job-failure observations. Cross-source rules associate resource/lifecycle/change/job-start events with subsequent failures within five minutes. Explicit configured dependency edges strengthen the finding; discovery `relatedIds` and startup ordering alone do not prove dependencies or causation. Mirrored sources on the same component do not increase the independent-witness factor.

Findings separate observations, correlations, possible explanations, competing explanations and unknowns. Rule-derived factors determine confidence. Models cannot supply confidence, evidence or execution authority. `NOT_PROVEN` is always retained for causation. Empty/error-only/truncated samples do not establish health; unobserved components remain UNKNOWN.

## Model routing

No model is called by default. Optional analysis uses the normal qualified `ModelRegistry`, provider client and invocation ledger, with no fallback, automatic escalation or tools. Only sanitized normalized events enter a clearly delimited untrusted-data prompt. Local-only processing requires a numeric loopback endpoint (`127.0.0.1` or `::1`), regardless of the provider's advertised kind. External endpoints require explicit external-processing permission; redirects and origin changes are refused.

Model responses must reference existing event IDs. Accepted hypotheses are marked INFERRED, sanitized again and linked to the invocation. Invalid output or model unavailability leaves the deterministic assessment intact. Local reverse proxies that forward requests elsewhere cannot be detected by endpoint checks; trusted endpoint administration remains necessary.

## Architecture, history and reports

The underlying Discovery inventory is copied, never overwritten. Service metadata adds observed components and configured dependency relationships. Sanitized historical health overlays preserve source-linked findings and events. Select components, then inspect dependencies, component events/findings, timeline and evidence.

Assessments and Markdown reports are immutable local files. The separate diagnostic audit uses append-only records with a SHA256 chain. Restart loading verifies that chain; report loading verifies the assessment hash. This detects ordinary modification but is not an external signature or protection from a malicious host administrator.

Comparisons default to NOT_COMPARABLE. Only identical source identities, scope, exact bounds and complete coverage allow a same-window comparison; the candidate does not claim reliability improvement from differing sampled windows. Findings remain available in history subject to active evidence permission. A native Job artifact contains a receipt/digest only, so the generic artifact API does not bypass diagnostic evidence permission.

## Video Evidence Mode

Factory and Diagnostics share `assets/dashboard/video-evidence.js`, one bounded MediaRecorder implementation. Diagnostics records the actual visible evidence canvas as its sections and selection change. The companion manifest identifies inventory, permission, assessment/hash and view transitions. It is not a recording of every browser control or a signed audit. Captures are limited to 90 seconds / approximately 32 MiB, with bounded navigation frames. Only sanitized diagnostic evidence is shown.

## Qualification

`node --import tsx scripts/qualify-architecture-diagnostics.ts` runs an isolated, clearly labelled synthetic fixture through the real native job, authenticated browser, explicit grant, correlation, evidence navigation, recorder and revocation. It includes a GPU/model/service/proxy/Agent Control chain and never destabilizes host services.

`--real` additionally requires `DIAGNOSTIC_REAL_LOG_PERMISSION` containing a separately obtained explicit user grant. That mode selects only the four described system/kernel sources on the controller and a bounded recent window. Merely setting the variable is not user permission. Physical real-source qualification must remain pending unless that grant was actually obtained.

No deployment, merge, tag, release or production service restart is part of qualification. Container engines, proxy installations and real model analysis need qualification on an estate where those specific sources/routes exist and have been permitted.

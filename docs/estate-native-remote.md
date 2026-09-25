# Governed native remote Estate discovery

This candidate adds a shared remote metadata adapter used by the existing `discover-estate` Job, Estate API and dashboard. It does not enrol machines, create credentials, modify routes, deploy services, read logs or grant general remote execution authority.

## Binding and authorisation

The operator selects a privacy-safe resource alias in the Estate catalogue. The backend maps it to exactly one existing configured SSH resource. The request cannot supply an endpoint, command, credential path or remote file path. The selected resource must have `managedNode.enabled: true` and this explicit binding:

```json
{
  "estateDiscovery": {
    "enabled": true,
    "scope": "metadata-only",
    "authorisationDigest": "<SHA-256 of the approved discovery scope>",
    "expectedIdentitySha256": "<independently approved physical identity digest>"
  }
}
```

These placeholders are not usable values. An absent identity pin yields `UNAUTHORISED / EXPECTED_HOST_IDENTITY_REQUIRED` before remote execution. A historical resource name or transport address is not an identity pin. No first response is silently trusted or promoted. The digest is SHA-256 of `agent-control-machine/v1:` followed by the lowercase 32-hex machine identity from the host's `systemd-id128 machine-id` metadata utility. Establish it through the operator's existing identity-verification workflow; the adapter never changes the configured pin. The earlier blocked capture had no approved remote identity pin and an unavailable route. This historical result must not be presented as the current qualification of a different approved resource.

The normal Estate category grant must include `REMOTE_HOST_DISCOVERY` and the selected resource alias. The permission retains a digest of that complete resource binding. Configuration drift invalidates the permission, and the adapter checks the binding again after transport completion.

## Execution and evidence

### Windows and Android metadata

Selected Windows and Android SSH resources can opt into metadata-only Estate discovery without enabling the Linux managed-node operations. The platform-specific fixed collectors run through the same owned SSH executor, binding recheck, nonce, deadline and identity-pin validation. Windows uses bounded CIM queries and an outer 12-second PowerShell runspace deadline. Android uses existing Termux Python and fixed Android property queries, with GNU timeout. No installations, privileged operations or service changes are performed.

Linux retains its existing systemd machine-ID contract unchanged. Windows hashes `agent-control-windows-machine/v1:` plus the lowercase hyphenated SMBIOS UUID, rejecting zero/FF placeholders. [Microsoft documents that UUID source](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-computersystemproduct). Windows integrated graphics are listed by their observed driver metadata; shared adapter memory is not presented as dedicated VRAM.

Unprivileged Android cannot necessarily read a hardware identifier. The Android collector hashes `agent-control-android-ssh-host/v1:` plus the fingerprint of the existing Termux Ed25519 PUBLIC SSH host key. Bootstrap must independently match this fingerprint to the already-trusted transport. This is an SSH-installation identity, never a hardware identity: every Android envelope requires `identityScope: SSH_INSTALLATION`, `status: PARTIAL` and `PHYSICAL_IDENTITY_UNAVAILABLE`. The graph/UI retain DEGRADED and show this limitation; such a record does not increase the physically verified-host count. A reinstall/key rotation requires explicit revalidation. No private key is read or returned. Android ID is not a hardware-global substitute: [Android documents its signing-key/user/device scope](https://developer.android.com/reference/android/provider/Settings.Secure#ANDROID_ID).

The older Linux collector and binding requirements described below continue to apply to Linux. Windows/Android envelopes additionally bind their exact platform, method and identity scope; a cross-platform or falsely complete Android response is rejected.

The adapter reuses `sshResourceArgs`, `executeSsh` and the Job's `OwnedExecution`. SSH is non-interactive, requires existing trusted host keys, disables key updates and forwarding, and attempts once. Connection timeout is 8 seconds, the remote command timeout is 12 seconds (plus a 2-second kill grace), and the adapter deadline is 24 seconds. Job cancellation and execution-authority revocation propagate through the normal signal and owned-process cleanup. The metadata utility has a separate 2-second timeout. No endpoint fallback or automatic retry occurs.

Remote arguments are adapter constants. Structured request data travels in the fixed program's stdin, never in shell-interpolated arguments. The fixed Python collector returns a strict envelope with a request nonce, hashed resource alias, observation time, method/version, physical identity digest, architecture, CPU count and total memory. It opens no files and collects no hostname, network addresses, process arguments, environment variables, logs or arbitrary file contents. Linux, Python 3, GNU `timeout` and `systemd-id128` are required. Unsupported metadata is reported as unavailable; a partial validated envelope yields `DEGRADED`, not complete discovery.

Only a matching identity pin, nonce, alias, schema and provenance can establish `AVAILABLE`. An identity matching the controller is rejected. Raw SSH diagnostics and collector output are not projected into execution-session streams; only validated allowlisted fields and classified lifecycle events are retained. Transport errors do not create CPU/worker entities or verified cross-host relationships.

## Graph, continuity and UI

Resource aliases and entity IDs do not depend on transport addresses or transient measurements. Rediscovery preserves first-seen times; last successful discovery is separate from failed contact. A failed or cancelled scan retains prior entities and edges as stale. It does not imply deletion. Recovery emits `RECOVERED` before the new available state, preserving identity.

Cross-host relationships have separate provenance: configured membership is `DECLARED`; a successfully validated native remote response can support `VERIFIED` controller-to-host discovery execution. Nothing is inferred from similar names or ports. The existing dashed relation rendering distinguishes inferred/unverified/stale edges from verified edges.

The retained comparison lists hosts, entities and relationships, including unchanged records and their evidence references. The existing change list continues to distinguish failed contact from confirmed removal. Graph-derived host zones, safe aliases, local/remote labels, connection state, Job activity, per-host last success and comparison summaries are shown in Estate View.

## Qualification boundary

Transport and native Job integration tests use explicitly synthetic fixtures, including fault injection below the production adapter. They prove code behaviour, not two physical hosts. The browser qualification driver only supplies the existing approved configuration and operates the normal UI/API; native Jobs own discovery and evidence retention. If the route or identity pin is unavailable, the driver records the blocker rather than injecting a successful response. No physical remote discovery or recovery can be claimed from such a run.

Existing graph history and raw validated envelopes remain under the permission-governed Estate evidence policy. Private runtime directories and credential material must not be copied into delivery bundles. The change remains an experimental candidate until independently qualified and reviewed for release.

## Physical qualification capture

Remote hardware inventory now includes optional CPU model (`lscpu --json`) and NVIDIA index/model/VRAM/driver metadata (`nvidia-smi`), each bounded to two seconds. This additive v1 envelope extension retains the exact existing identity canonicalisation and pin. Older envelopes remain readable and show unavailable hardware as UNKNOWN; missing NVIDIA tooling never means zero GPUs. Core host/CPU-count/memory completeness is independent of the optional NVIDIA inventory. Device arrays, indices, field lengths, numeric bounds and unavailable-state consistency are validated before graph insertion. GPU IDs use the pinned resource alias and reported index; index reuse does not independently prove physical GPU continuity.

Both host zones show CPU and GPU objects. Hardware summaries are visible in the host cards, inspector and evidence video. Retained hardware is explicitly stale after failed contact. Factory discovery Jobs and receipts link to the exact authorised snapshot for that run, labelled REPLAY; navigation never launches a probe. Job success means the observation receipt was recorded, not that every host was verified.

`scripts/qualify-estate-two-host.ts` requires an existing resource configuration, safe resource alias, verified bootstrap receipt and pin-approval receipt through the `ESTATE_APPROVED_RESOURCE_CONFIG`, `ESTATE_APPROVED_RESOURCE_ALIAS`, `ESTATE_BOOTSTRAP_RECEIPT`, `ESTATE_PIN_APPROVAL` and `ESTATE_EVIDENCE_DIR` environment variables. It refuses a dirty candidate or mismatched configuration/receipt hashes. It neither chooses a network route nor changes a pin.

The browser operates the normal permission and discovery UI. The shared native Job and adapter execute three complete physical cycles. The existing dependency-injection seam then supplies one deterministic transport failure, followed by actual production SSH execution against the same pin. This does not disconnect or reconfigure a host. Injected failure and subsequent recovery are labelled throughout; they do not establish physical network recovery. Successful native response envelopes must match evidence accepted into the graph before the instrumentation retains them.

Video evidence supports bounded operator annotations and starting capture before a discovery run. Annotations are separate manifest records; they cannot alter native events, graph state, permissions or discovery results. The physical qualification driver uses them to identify the earlier trusted bootstrap receipt and the injected transport fault. Raw identity material, endpoints and credentials must never be included in annotations.

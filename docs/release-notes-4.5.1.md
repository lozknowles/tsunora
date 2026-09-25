# Agent Control 4.5.1 release notes

Agent Control 4.5.1 is a narrow remediation for the existing-configuration
upgrade defect discovered after the 4.5.0 source release was published. During a
genuine production smoke test, the built-in controller-local observation worker
was presented to runtime safety as a remote node. Runtime safety correctly denied
the action, and the deployment rolled back to the known-good production release.

The correction establishes worker execution locality through trusted internal
registration or validated configured transport provenance. It does not trust
worker names or self-declared labels, and it does not weaken runtime safety.
Controller-local work is evaluated as local; genuine remote work remains subject
to the remote-node allow-list; unknown, inconsistent and spoofed identities fail
closed.

Environment Discovery and Estate Map consume the same identity projection, so
the built-in observer is shown beneath its actual controller rather than as a
remote estate node. The release adds deterministic coverage for the production-
compatible v4.1 configuration and makes both virgin installation and supported
existing-configuration upgrade permanent release gates.

The immutable `v4.5.0` tag, its public release, the failed production-deployment
evidence and the successful v4.1 rollback remain unchanged. Agent Control 4.5.1
carries forward all accepted 4.5 limitations, including the historical 11/12
memory matrix, the blocked OpenRouter GLM→Qwen route, the physically passing
NVIDIA equivalent, the failed and unroutable exact MiniCPM configuration, the
disproven specialist-energy and warm-residency hypotheses, and the unavailable
whole-node energy boundary.

Use the [migration guide](migration-4.5.1.md) and [deployment guide](DEPLOYMENT.md)
for upgrade, acceptance and rollback. The
[dual-install qualification record](provenance/EXTERNAL-EVIDENCE.md)
binds the clean-install and authentic v4.1-upgrade results to the exact revised
candidate. The subsequent governed production upgrade preserved the authentic
configuration byte-for-byte, started 4.5.1 from a clean immutable checkout and
completed the same Morrow-initiated observation Job with both stages admitted as
controller-local. Jobs, Lanes, Models, Warm Cache Runtime, Crew and Configuration
also passed an authenticated LIVE dashboard sweep without browser errors.

The selected dual-install evidence archive is 14,024,203 bytes, SHA-256
`34c377c608872ad40d89f668bd86eeffcb1adcea4da431a8b730fd1ac8757277`.
The selected production-smoke archive is 10,275,340 bytes, SHA-256
`0110446f46a968e811a3ad5a5494c407d1fbd564157212562fcaaa8d01b6a74f`.
Neither archive contains the authentic configuration, runtime credentials or
mutable pre-upgrade state.

# Security

Keep operator tokens, provider credentials, private configuration and live evidence out of Git, screenshots and issue reports.

The local dashboard defaults to loopback. Operator actions require authentication and remain subject to job permissions and approvals. Discovery does not grant execution authority; remote access and model installation require their own configuration and permission.

Do not expose the dashboard publicly or disable authentication to solve an installation problem. See [installation troubleshooting](docs/installation-first-run.md#troubleshooting) and the [existing security design](docs/security-3.6.md).

Report a suspected vulnerability privately using GitHub private vulnerability reporting if available. Do not post credentials or exploitable private deployment details in a public issue.

## Protected workspace metadata

Writable work parcels do not grant write access to governance metadata. Agent Control marks control directories unavailable and instruction, policy, parcel, baton and evidence-integrity records read-only. The mutation adapter rejects traversal, skips symlinks and excludes unavailable metadata from evidence snapshots. Adapters unable to enforce this boundary must fail closed or report degraded support.

The authenticated raw-inference endpoint grants model invocation only. It supplies no tools and no shell, filesystem or arbitrary side-effect capability. Exact request/response evidence is redacted, owner-only, content-addressed and checksum-verified.

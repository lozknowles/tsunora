# Session Vault replication

Replication is incremental and content-addressed. The sender resolves one sealed
session record, refuses `localOnly` records, asks whether the destination already
has the object, transfers missing stored bytes and then writes the sealed record.
Repeated transfer is deduplicated without changing identity.

`SshSessionReplicationBackend` reuses the configured managed-resource SSH
transport. It installs/runs a fixed audited node helper and sends operation
records and content as base64 data on stdin. Remote roots must be absolute and
validated for the platform. No arbitrary shell or PowerShell operation is
exposed as a Session Vault API.

`SessionReplicationCoordinator` preserves failed work in a bounded retry queue
with redacted error classification and exponential delay. Operators should
monitor pending count, failure count and last success in the Session Vault tab.
A replica is usable only after its record and object hashes verify.

Replication copies evidence; it does not acquire continuation authority. The
destination must separately verify repository state and acquire a lease through
the governed continuation path.

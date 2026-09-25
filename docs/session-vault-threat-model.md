# Session Vault threat model

Status: **EXPERIMENTAL**.

Protected assets are provider-native session bytes, repository and decision
provenance, continuation authority, Your Memories links, credentials and private
operator content.

| Threat                                           | Control                                                                                                                                   |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Native history rewritten during ingestion        | Exact bytes are content-addressed and written immutably; normalized events point back to them.                                            |
| Truncated history presented as complete          | Completeness is explicit and damaged JSONL remains `DAMAGED`.                                                                             |
| Secret exposed in dashboard/search               | Normalized values pass central redaction; raw evidence is not served; encrypted and local-only policies are supported.                    |
| Replica corruption or substitution               | Object and record SHA-256 values are verified; tampering fails closed.                                                                    |
| Split-brain continuation                         | One unexpired mutable lease per source session; denials are durable hash-verified audit events.                                           |
| Stale repository continuation                    | Repository identity, commit and branch are verified before Work Parcel creation.                                                          |
| Memory silently becomes authority                | Promotion uses the existing ProjectMemory admission path, requires approval and independent validation, and remains advisory.             |
| Provider-specific assumptions contaminate core   | Provider capabilities and normalization stay behind adapters; unavailable fields are not inferred.                                        |
| SSH helper becomes a shell API                   | Replication uses a fixed audited helper over the existing resource transport; variable content is stdin data.                             |
| Retention or deletion silently rewrites evidence | Retention is policy metadata in 4.5; destructive collection is not automated and must preserve an audit trail in a future implementation. |

The vault does not claim protection against a fully compromised host that can
read encryption keys and process memory. Encryption keys must remain node-local
and outside durable Agent Control records. Access to raw evidence requires a
separate authorized technical workflow; the dashboard exposes only redacted
projections.

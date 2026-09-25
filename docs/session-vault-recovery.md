# Session Vault recovery and rollback

1. Stop new capture/continuation scheduling without deleting state.
2. Copy the complete Session Vault directory using a byte-preserving mechanism.
3. Run `ImmutableSessionVault.verify()` against the source and recovery copy.
4. Compare index, object and session-record counts and retained hashes.
5. Restore application code separately; never rewrite objects to satisfy an
   older reader.
6. Resume replication and inspect the retry queue.
7. Inspect active leases. Use ordinary release when the holder is available;
   use forced release only with an identified actor and a durable reason.

If verification reports a missing/tampered object or record, quarantine that
copy and recover from another hash-verified replica or provider-native source.
Do not relabel a damaged source as complete. If provider-native history still
exists, capture it as a new immutable version and retain the damaged evidence.

Rollback of Agent Control does not roll back provider-native history or Your
Memories. Keep Session Vault state append-only. Obsidian removal affects only the
optional memory view/backend; underlying Session Vault evidence remains usable.

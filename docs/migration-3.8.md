# Migrating to Agent Control 3.8

Agent Control 3.8 adds governed retrieval without changing existing Jobs, Work Parcels, provider routes or the 3.7 token governor. Existing deployments remain on conventional frozen context until retrieval is explicitly enabled. Persisted retrieval state from pre-release 3.8 builds is not accepted if its packet or item hashes fail the final integrity checks; the safe response is to retrieve current evidence again.

## Upgrade

1. Install the 3.8 package and run `agent-control status`.
2. Leave retrieval disabled while validating existing Jobs.
3. Enable only the dependency-free local providers first:

   ```json
   {"retrieval":{"enabled":true,"providers":["exact","lexical"],"maximumCalls":4,"maximumEvidenceTokens":8192,"allowRemote":false}}
   ```

4. Add `zg` only on a qualified node with an existing warm index and adequate memory/storage. The execution path is search-only and never creates or refreshes an index.
5. Observe the Retrieval dashboard for sufficiency, escalation, freshness, compilation, rehydration, invalidation and fallback.

## Compatibility and defaults

- Retrieval is disabled by default.
- zg is optional; startup and built-in retrieval have no zg dependency.
- Search authority does not include index mutation. Index management needs a separate operator capability.
- Remote/hybrid retrieval requires both global and per-intent permission.
- Weak, stale or failed retrieval falls back to the immutable frozen context.
- Existing 3.7 batons remain valid. New batons may carry portable Evidence Packet references, which are revalidated before destination use.
- No state migration is needed for existing 3.7 ledgers. New retrieval records use their own versioned schema.

## Rollback

Disable `retrieval.enabled` to restore conventional context behavior without deleting evidence or indexes. A package rollback to 3.7 ignores the additive retrieval records. Do not delete an index as part of package rollback; index lifecycle belongs to its separately authorized operator.

See [governed retrieval](governed-retrieval.md), [architecture](../ARCHITECTURE.md#governed-retrieval-and-context-intelligence), and [Phase 2 qualification](evidence/agent-control-3.8-phase2-qualification.md).

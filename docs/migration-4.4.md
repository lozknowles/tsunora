# Migrating to Agent Control 4.4

Agent Control 4.4 is additive over 4.3. Existing Work Parcels, Jobs, provider and
account profiles, credentials, lanes, Warm Experts, POE, Crew and durable runtime
state retain their 4.3 contracts. No credential migration is required.

## Upgrade

1. Stop only the scoped Agent Control controller and preserve an owner-only state
   backup.
2. Select immutable tag `v4.4.0` and install dependencies as documented in
   [DEPLOYMENT.md](DEPLOYMENT.md).
3. Keep the existing external configuration, state and Job directories.
4. Restart through the established supervisor and verify version `4.4.0`, health,
   authentication, SSE, Jobs, Lanes, Models, Crew and Warm Cache Runtime.
5. Complete one harmless governed Job and confirm its sealed UX session is
   readable by an authenticated operator.

## Session replay

Terminal Job Runs are captured into immutable UX session projections when the
session stores are configured by the normal web bootstrap. Existing run evidence
is not rewritten. Read-only shares must be explicitly created, are audience-bound,
expire when configured and may be revoked. Share URLs carry the capability in the
fragment so it is not sent in an HTTP request URL.

## Your Memories

Normal user-facing views use **Your Memories**. Technical backend identity remains
available only in architecture, evidence and authorised diagnostics. This release
does not enable automatic memory consolidation or model swapping and does not make
MARM a dependency.

## Rollback

Stop the 4.4 controller before selecting `v4.3.0`; never run two versions against
one state directory. Restore the matching state backup only if acceptance testing
changed state, then verify health, authentication and a harmless read-only action.

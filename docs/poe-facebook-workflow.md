# Pixel Facebook-events workflow

The separate registered daily runtime owns `facebook-collingham-daily` collection and `collingham-publish-reviewed` publication. POE reads their registered definitions and schedule through its owner-configured read-only bridge. Their existence does not establish current Pixel or Facebook-session readiness.

## Current boundaries

Before collection, the native owner must establish Pixel transport, the required Termux/browser execution environment, Facebook authentication, and operator authorisation for the particular sources/groups. A reachable device alone proves none of the other checks. POE currently cannot perform that remote preflight or create an idempotent Work Parcel through that older service. Remote execution remains unavailable until that adapter is qualified.

## Collection through publication

Collection obtains source evidence through the established Pixel workflow. Extraction preserves source references, uncertainty and ambiguous dates. Duplicate checks compare candidates against existing event records; unresolved matches require review. Collection is not approval to stage or publish. A human reviews current candidates before staging. The registered reviewed-publication path requires a successful recent discovery and fresh review; its live job definition determines the exact configured age limits. Publication to the configured community site requires separate approval, followed by production feed and page verification. Neither a staged record nor a collected event is evidence of publication.

## Operator runbook

Ask for the live registered definitions, last-run outcome and schedule. If Pixel or Facebook authentication is unavailable, report the precise missing observation and stop before execution. Never substitute stale discovery, infer source authorisation, change device pairing or publish merely because a schedule exists.

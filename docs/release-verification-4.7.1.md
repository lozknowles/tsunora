# Agent Control 4.7.1 release verification

The final release source is the qualified `d26f4f00f918323b32c77099c1110fe0a060171a` candidate plus release version/documentation metadata. The published release manifest identifies the exact final commit and all fresh evidence; no older v4.7.0 seal applies to this update.

Required gates are the complete regression suite, typecheck, virgin archive installation, supported v4.7.0 upgrade with preserved configuration/state, governance/security, Estate/Process, distribution, documentation, screenshot/browser verification and versioning. The unchanged hardened gate validates a fresh schema-v2 receipt, source/archive/evidence digests and an external owner-only approval tied to the operator's final release authorisation. The receipt, manifest, logs and checksums are release assets; a focused pass never replaces a failed required full run.

The system-theme browser journey is rerun on the final source, including desktop, portrait/landscape touch, Estate → Node → Process → Inspector → Tokens → History and live switching without session reset. Original 32 captures and paced recordings remain pinned to their actual capture source in the separate evidence repository. Fresh installation browser checks use actual governed observation work, without creating paid model calls. Missing model token data in that deterministic job is displayed as unavailable rather than invented.

The public source archive is generated from the exact Git commit and independently compared to tracked blobs after extraction. Runtime/configuration/dependencies and new bulky evidence are excluded. Existing small historical documentation images are preserved under the established source-distribution policy.

See [release notes](release-notes-4.7.1.md) and [limitations](known-limitations-4.7.md). Physical Pixel, Safari/iOS, live Mallow voice and unavailable subscription costs remain stated limitations. Public release and operational deployment are separate; operational installations are unchanged.

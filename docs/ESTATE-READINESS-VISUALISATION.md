# Estate readiness visualisation checkpoint

Implemented the shared Estate / Process Map projection, authenticated dashboard heartbeat, job causality and resource impact, all fifteen blocker classifications, proposed next actions, safe metadata allowlist, and automatic five-second freshness reevaluation. No heartbeat request runs discovery or inference. Fresh native discovery feeds the same projection.

The implementation is configured and exercised in an isolated loopback development dashboard using the authorised estate and pinned external catalogue. Production activation is not part of this checkpoint. The library readiness callback is an explicit service integration dependency; an unconfigured instance shows estate observations without pretending to have loaded a job catalogue.

| Observation | Resources alive | Stale | Unverified | Offline | Jobs READY now |
|---|---:|---:|---:|---:|---:|
| Initial 2026-09-13T05:03:17.226Z | 6/16 | 0 | 9 | 0 | 2/50 |
| After real expiry 2026-09-13T05:05:14.677Z | 0/16 | 1 | 9 | 0 | 0/50 |
| Native refresh 2026-09-13T05:05:16.205Z | 6/16 | 0 | 9 | 0 | 0/50 |

The initial six alive resources were the controller, GPU, bounded local endpoint, authenticated CLI runtime, report probe and GPU inspection probe. The other ten had configuration-only or insufficient health/qualification evidence. Both catalogue models remain unavailable for qualified job routing; endpoint reachability and CLI authentication do not prove model capability.

All 16 lack current inventory-level qualification proof: one reports a QUALIFIED lifecycle from configuration only, and the remaining 15 do not report QUALIFIED. Two exact read-only job admissions are separate, time-limited proof. One configured account requires authentication; its status is not transferred from another authenticated CLI profile. No current credential contents are displayed. These categories overlap.

28 catalogue-capable jobs and 2 initially operationally READY jobs answer different questions. The largest blockers are 48 missing current execution qualifications, 22 missing capability bindings and compatible placements, 8 approval requirements, 3 connector requirements and 1 credential requirement. Blocker counts overlap. CAPABILITY_ABSENT means no implementation registered in the inspected scope, not proof that no software exists elsewhere.

The two READY jobs were exact disk-space and GPU inspection variants. Both native runs succeeded with independent artifact validation; the extraction job remained blocked before dispatch. Eight approval-denial checks produced zero forbidden action calls. Admissions expired by wall clock and did not revive after discovery. These demonstrations do not qualify a general model or all canonical jobs.

Validation: 170 relevant regression tests passed; typecheck passed. Nine focused presentation tests cover all fifteen gap codes, multiple causes, colours, expiry, parent liveness, approval counts, exact identities and secret filtering. Native automated browser evidence covers both graph surfaces, ready and blocked chains, both navigation directions, real-time expiry and a genuine rescan, with zero browser script errors.

The demonstration exposed an existing quick-rescan bug: omitted endpoint probes were reconciled as offline. Quick rescans now perform the same bounded endpoint catalogue reads. A regression and final native browser run verify the correction. Historical preliminary evidence was retained separately and not relabelled as final evidence.

Connection details use an explicit metadata allowlist. URL user information, path, query and fragment are removed; arbitrary attributes are not sent. Credential placeholders have fixed length independent of credential size. Synthetic secret tests verify labels, events and metadata; authenticated API checks verify access boundaries. Numeric credential-gap counts use code/count records so the existing defensive API redactor does not hide the count.

No production services, routes, credentials or device configuration were changed. No Moto actions, merge, tag, release or deployment. Preview listeners were confined to loopback and stopped after evidence collection.

See ALL-16-RESOURCES.md, ALL-50-JOBS.md, checkpoint.json, native browser maps and screenshots for exact observations and run references.

The detailed operator evidence pack is held outside the source distribution. Reproduction tools: `scripts/serve-estate-readiness-preview.ts` and `scripts/check-estate-readiness-browser.mjs`; both require explicitly supplied evidence paths and an isolated preview. No automatic production installation is performed.

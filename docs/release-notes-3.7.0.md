# Agent Control 3.7.0

Agent Control 3.7 adds provider-neutral Token-Aware Baton Routing with continuously streamed dashboard telemetry. The production repository-review lifecycle can observe current pressure, assess remaining difficulty, seal a durable baton, route an exact provider/account/model/node destination, continue bounded work, independently verify the result and recover the original thread if handoff fails.

Work Parcel accounting remains additive across compaction, continuation and route boundaries. Lifetime input/output/total usage is distinct from current-context occupancy, and every value carries an authoritative, estimated or unavailable basis. Cost is never inferred as zero when a route does not report usage or lacks configured pricing.

## Physical qualification

The release candidate completed a bounded real Work Parcel across two distinct live local OpenAI-compatible provider/model routes. Source usage was 186 tokens; destination usage was 510; the parcel reconciled to 696. The destination continued from a sealed SHA-256-addressed baton and independent repository verification passed. Dashboard SSE and `/api/token-routing` reconciled with durable evidence. A separate injected destination refusal failed closed and resumed the original source thread to a verified result without recording destination usage.

The providers exposed exact response usage but not authoritative retained-context occupancy, so the one-turn context values are marked estimated. Source and aggregate monetary cost remain unavailable because source pricing was not configured. Separately, both isolated MSI Codex account profiles passed the production cross-node account-status path, but Codex was not a workload leg in the final baton lifecycle.

## Upgrade and recovery

```bash
git fetch --tags
git checkout v3.7.0
npm install --no-package-lock --ignore-scripts
npm run check
```

Installing the source starts no service and enables no automatic handoff, Saved Job, Schedule, Spark lane or remote ACP listener. Review provider qualification and `tokenBatonRouting` policy before opt-in use. Existing state changes are additive; follow [migration to 3.7](migration-3.7.md). The previous immutable recovery source is `v3.5.0` together with the operator's pre-upgrade state backup.

## Evidence and limitations

- [Physical qualification narrative](evidence/agent-control-3.7-physical-qualification-20260902.md)
- [Sanitized physical lifecycle record](evidence/agent-control-3.7-physical-lifecycle-20260903.json)
- [Development qualification](evidence/agent-control-3.7-development-qualification.md)
- [Codex 0.153 review](provenance/EXTERNAL-EVIDENCE.md)

The physical proof qualifies the token-aware production lifecycle, not the separate 50-observation automatic capability-routing benchmark. Automatic account rotation for quota aggregation is not implemented. Provider-native context management remains adapter-specific and all unreported telemetry stays explicitly unavailable.

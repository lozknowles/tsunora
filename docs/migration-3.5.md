# Migration to Agent Control 3.5

3.5 is additive over 3.4 and does not require rewriting existing Work Parcel, Job, model-registry or lane state.

## Existing data

- Existing Work Parcel snapshot version remains supported. New parcels add optional `attribution`.
- Existing run/parcel actor strings are mapped deterministically with `legacyAttribution`; they are not silently asserted to be authenticated humans.
- Existing persistent teammate profiles remain valid. An Agent identity is a separate control-plane record and does not change a profile's authority.
- Historical `Ox`, `ox-alpha` and `Ox Alpha` model labels project as aliases of canonical `GLM-5.3-Flash`.
- Existing model roles and STANDARD routing remain unchanged.

## Configuration

The new `spark` block is optional. Omission is equivalent to disabled. A conservative example is:

```json
{
  "spark": {
    "enabled": false,
    "model": "gpt-5.3-codex-spark",
    "modelRole": "fast-execution",
    "maximumFiles": 1,
    "maximumChangedLines": 80,
    "maximumAttempts": 1,
    "maximumSubagents": 0,
    "maximumContextTokens": 2048,
    "verificationRequired": true
  }
}
```

To become routable, the model registry must also contain a qualified model whose provider-native identity exactly matches `spark.model`, capability includes `trivial.coding`, node qualification includes the target node, and role `fast-execution` selects it. Configuration alone does not qualify availability.

Use the authenticated **Configuration → Fast execution** editor or `POST /api/configuration/spark`. A restart is required because availability probing and runner construction are startup policy. Keep `enabled: false` until local qualification is reviewed.

## Upgrade checks

1. Run `npm install` and `npm run check`.
2. Start an isolated state directory and confirm the default operator Session appears.
3. Submit a non-production task and confirm Work Parcel attribution.
4. Confirm legacy parcels still load and show deterministic legacy attribution.
5. If evaluating Spark, confirm `codex --version` and `codex login status`, run `npm run benchmark:fast-execution`, then run `npm run benchmark:fast-execution -- --live --standard-model gpt-5.6-luna`; do not enable it from availability alone.
6. Run ACP adapter conformance tests if an external client is being introduced.

For the unreleased contract/PTY, ACP transport, provider lifecycle and runtime-dashboard changes after 3.5, continue with [migration to 3.6 development](migration-3.6.md). The released 3.5 rollback point remains tag `v3.5.0`.

The qualified installed client is `codex-cli 0.144.4`. Although current Codex documentation describes `agents.enabled=false`, that boolean is rejected by this client; Agent Control uses the directly verified compatibility switch `features.multi_agent=false`. Requalify this no-fan-out setting after a Codex upgrade. The 2026-09-01 frozen live run recorded 10/10 classifier decisions, Spark 7/7 verified at 14.464 s median, and the `gpt-5.6-luna` comparison 6/7 at 27.100 s median. Monetary cost was not exposed. See [`fast-execution.md`](fast-execution.md) and [`evidence/agent-control-3.5-qualification.md`](evidence/agent-control-3.5-qualification.md).

No deployment, live configuration change or tag is performed by this feature branch.

# Contributing

Start with a small, concrete improvement and describe the user-visible problem. Keep unrelated work intact and use a separate branch or checkout.

For simple job contributions, use the [public Job Library contribution guide](https://github.com/lozknowles/agent-control-jobs). A job should express a clear business objective; it should not require understanding controller internals.

For controller changes, run `npm run check`, add meaningful coverage for changed behavior, and describe what was actually tested. Keep fixture tests, browser checks, deployment checks and physical qualification distinct. Preserve failed evidence and report limitations explicitly.

Documentation should use real product screenshots, retain source provenance and exclude credentials, personal data and private estate details. Do not label a release candidate as stable. See [release readiness](docs/public-release-readiness-4.6.md).

# Agent Control 3.3.1

Agent Control 3.3.1 is a review-remediation and operator-control release. It closes the accepted 3.3.0 findings, adds truthful system inventory and configuration, and introduces evidence-driven context and cost accounting without moving scheduler, verification or ownership authority into the dashboard.

## Operator control and system inventory

The Systems view retains configured machines, model providers and external services even when they cannot currently be probed. Readiness remains explicit: `AVAILABLE`, `BUSY`, `DEGRADED`, `OFFLINE`, `AUTH REQUIRED` or `UNKNOWN`; configuration never invents reachability.

An authenticated Configuration tab and API allow an operator to add or edit machines, providers and services. Changes are schema validated, revision checked and atomically persisted. External credentials are represented only by environment-variable or secret-file environment-variable references. Plaintext passwords, tokens, secrets and API keys are rejected.

## Invocation and queue correctness

Terminal invocations now finalize reliably after timeout, cancellation or partial provider telemetry. Late cancellation cannot overwrite a successful terminal Run, and retry or replacement history remains immutable. Natural-language submissions fail closed without an authenticated operator and immediately produce an auditable planning parcel when accepted.

## Context and economics

The release adds a local context compiler that preserves exact evidence and independently verifies outcomes before acceptance. Versioned pricing schedules distinguish fresh, cached, cache-write, output and reasoning usage. Monetary totals remain unknown unless a complete applicable schedule exists, while quota consumption remains distinct from price.

## Release verification

The release gate passed TypeScript, JavaScript and shell syntax checks, dashboard checks, all implementation-status checks, all infrastructure-neutrality checks and 505 repository tests. Package construction is verified separately with `npm pack` before publication.

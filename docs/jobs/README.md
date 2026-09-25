# Parameterised Jobs

Agent Control 3.4 runs governed jobs, not models. An operator chooses a Job Definition and supplies a target; Agent Control resolves parameters, freezes inputs, selects qualified execution/model resources, creates Work Parcels, validates evidence, and persists the result.

Four objects remain distinct:

- **Job Definition**: reusable, versioned work contract.
- **Saved Job**: validated configured instance of one definition.
- **Schedule**: persistent trigger attached to a Saved Job.
- **Run**: immutable execution of one resolved definition/version and parameter set.

Repository Code Review is the reference definition. Responses-compatible routes run without Codex, ChatGPT, an interactive user, or conversation history; configured Codex CLI routes use a previously interactively authenticated account profile on its bound execution node. The provider/account/model/node registry resolves `review.default`; a Saved Job may pin `routing.accountProfile`, and the Run records the exact account-qualified route actually selected.

## Operator flow

1. Configure an execution resource, model provider, qualified review model, `modelRouting.roles.review.default`, and `jobs.repositoryRoots`.
2. Export `AGENT_CONTROL_WEB_OPERATOR_TOKEN` and provider credential environment variables.
3. Start one controller process with `npm run web` or `npm start`.
4. Use Dashboard → Jobs → Job Definitions → Repository Code Review, or `agent-control jobs create`.
5. Inspect Saved Jobs, Schedules, and immutable Runs in their separate views.

```bash
agent-control jobs definitions
agent-control jobs create --definition repository-code-review --name "Project Nightly Review" --node controller --repository /srv/repos/project --ref main --scope changes --model-role review.default --schedule "0 2 * * *" --timezone Europe/London
agent-control jobs run project-nightly-review
agent-control jobs runs --saved-job project-nightly-review
agent-control jobs export project-nightly-review > project-nightly-review.json
```

Exports contain policy and references, never credentials. Import with `agent-control jobs import --file project-nightly-review.json` after choosing a unique ID.

## Recovery, retry and cancellation

3.9 gives each provider attempt a durable execution ID bound to the exact provider/account/model/node route. A controller restart or transport break does not replay an unresolved attempt. The Run becomes `DISCONNECTED`, then `RECONNECTING` only while the executor proves that same identity and continuity. A completed remote response still enters normal independent validation. Unknown or changed identity remains fenced for operator reconciliation.

Ordinary Job definitions configure bounded recovery with `retry.attempts`, `backoffSeconds`, optional `backoffMultiplier`, `maxBackoffSeconds` and `overallDeadlineSeconds`. Parameterised Saved Jobs inherit `maximumRetries`, `retryBackoffSeconds`, `retryBackoffMultiplier` and `retryMaximumBackoffSeconds` from the definition budget and may narrow those values. Transient transport and expired-enrolment failures can consume this budget. Authentication-required enters `AUTHENTICATION_BLOCKED`; permanent configuration does not retry. The Run and dashboard preserve the actual next-attempt time, deadline and remaining budget.

Cancellation first enters `CANCELLING`. Agent Control records captured process identity, requests platform cleanup, verifies the process group/tree and only then records `CANCELLED`. If descendants, PID identity or substrate state cannot be proven, the Run remains `CLEANUP_UNCERTAIN` or `DISCONNECTED`; resource locks and authority are not silently released. See [Runs](RUNS.md), [Jobs and scheduler](../jobs-and-scheduler.md), and [dashboard operation](../web-dashboard.md).

See [Definitions](DEFINITIONS.md), [Parameters](PARAMETERS.md), [Scheduling](SCHEDULING.md), [Repository Review](REPOSITORY-REVIEW.md), [Runs](RUNS.md), and [Adding a Job](ADDING-A-JOB.md).

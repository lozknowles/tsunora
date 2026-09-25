# Scheduling

Schedules are persistent Saved Job policy. Supported forms are a one-time ISO timestamp and cron-style schedules with an IANA timezone. Cron uses five fields (`minute hour day-of-month month day-of-week`).

Every due occurrence calls the same `createRun` and execution path as **Run now**. The browser does not own a timer. The controller scheduler operates headlessly with no Codex or chat session.

Each scheduled occurrence ID is a SHA-256 of Saved Job ID and the intended due time. A separate cursor records how far a `run-once-immediately` policy advanced after downtime, so backlog suppression cannot make occurrence identity depend on polling latency. The durable Run store rejects duplicate delivery across scheduler/controller restarts. Manual Runs receive independent occurrence IDs.

Concurrency policy:

- `forbid-overlap` (default): do not create another active copy;
- `queue`: retain due work behind the active Run;
- `allow`: permit concurrent execution.

Missed-run policy:

- `run-once-immediately`: collapse missed work into one current occurrence;
- `skip`: record a terminal skipped/cancelled occurrence so the cursor advances without provider cost;
- `queue`: consume missed occurrences in order, still respecting overlap policy.

Disable temporary qualification schedules after evidence is recorded. Disabling a Saved Job prevents manual and scheduled creation but does not rewrite historical Runs.

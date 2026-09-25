# Workforce prototype threat model

Status: PASS WITH LIMITATIONS for the tested synthetic boundaries; not production HR security certification.

## Trust boundary

A trusted local operator launches a loopback-only server. Two random, in-memory session capabilities represent a synthetic employee and HR reviewer. They are written only to private-session.json with mode 0600 for the local operator, never committed or bundled. The browser receives a capability in a fragment and immediately clears the fragment; it does not write browser storage. This is a lab launcher, not an enterprise login/SSO system. Anyone with the trusted local operator's filesystem access can impersonate either demo role.

API requests require a session and reject foreign Origin headers. Mutation bodies cannot select an arbitrary actor/tenant: the server supplies synthetic identities. Employee API views filter records, runs, events and artifacts. Approval checks enforce tenant/role/requester separation; cross-tenant and replay attempts are tested. Deployment beyond loopback is neither implemented nor authorized.

## Tested threats

- Employee targeting outside self, cross-tenant targeting, employee offboarding authority: blocked before mutation.
- Conflicting/ambiguous/missing information: fails closed; clarification required.
- Instruction-like requests to bypass controls, bulk change or gain privileged access: rejected by the deterministic input boundary.
- Raw secret-like/private sentinel text: not retained in state, run ledger or event log.
- Wrong tool/employee action: existing sealed-scope check blocks it; actual owned-process kill and quarantine recorded.
- Unknown/unavailable worker: existing placement excludes it; retries preserve prior attempt.
- Expired capability or occupied capacity: core placement selects another identity.
- Stale prepared state from a concurrent job: mutation rejected; no overwrite.
- Unauthorized approval, cross-tenant approval and approval replay: rejected.
- Incorrect tool output / verifier failure: job cannot report success; failed synthetic state retained as evidence.

## Limits

Pattern-based injection rejection is a bounded deterministic policy test, not a general LLM prompt-injection defense. There is no LLM executing untrusted text. No hostile-code sandbox or OS-level tenant isolation is claimed. Mock systems share a trusted process and JSON state; this is not a transactional enterprise database. Power-loss atomicity across state, receipt and job-ledger files is not qualified; active restart fails closed, while approval-pause restart is tested. HR/payroll demo reviewers are broad roles; a production deployment needs real identity proof, field-specific approvals, rate limiting, CSRF/session lifecycle review, retention controls and dedicated adapter qualification.

No real credentials, employee records, company exports, external endpoints or production actions are used. Evidence export must exclude private-session.json and exclude credential-bearing launch URLs, HAR/session files and raw environment dumps.

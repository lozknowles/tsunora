# Quarantine scheduling safety qualification

## Result

**PASS** on candidate `1d49b593ecd650e68d3cd4a31f75012f5414afe0`.

Physical qualification on controller-host proved that a durable worker quarantine excludes the stable worker identity from Work Board scheduling across a new PID, reconnect, session generations and controller restart. Worker B received compatible work while worker A remained excluded. With B unavailable, priority-one work remained `BLOCKED` instead of falling back to A. Worker A became eligible only after an operator-evidenced `INSPECTED → RESET → REQUALIFIED → AVAILABLE` sequence.

The retained machine record used schema `agent-control.quarantine-scheduling-physical/v1`; its SHA-256 is `f2724edd156f5f88a04ee833f361c43aec69f77c526d11763c057829fe012619`. The isolated candidate passed 1,871 tests with no failures or skips. Protected llama services remained healthy with unchanged PIDs, start identities, commands and GPU allocation.

The full machine evidence remains outside normal source distribution because it contains host-specific operational observations. This public record preserves the candidate identity, result, evidence hash and qualification boundary without publishing private estate paths.

Limitations: there is no distinct runtime kill scope; the dashboard does not provide a complete containment/recovery timeline; Pixel/remote containment was not physically exercised.

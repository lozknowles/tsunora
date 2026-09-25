# STANDARD / DEEP runtime budget analysis

## Current semantics

| Profile | Maximum turns | Maximum tools | Independent verification | Original task wall limits | Consistent on measured route |
| --- | ---: | ---: | --- | --- | --- |
| STANDARD | 10 | 24 | required | 120-240 s in frozen suite | NO |
| DEEP | 32 | 64 | required | 240-300 s in frozen suite | NO |

The Lean terminal allowance applies only to THIN and therefore does not change these STANDARD/DEEP conclusions.

At the measured median 93.1 seconds per completed model call, a 120-second budget supports about 1.3 calls, 180 seconds about 1.9 calls, 240 seconds about 2.6 calls, and 300 seconds about 3.2 calls before tool work and verification. These ceilings are internally inconsistent with 10- or 32-turn permission on this route.

## Research model worth experimenting

YES: separate the following bounded concepts rather than replacing 180 seconds with one larger constant:

- `WALL_CLOCK_BUDGET`: operator/governance absolute ceiling.
- `MODEL_CALL_BUDGET`: bounded per-provider-call allowance with explicit transport settings.
- `TOOL_CALL_BUDGET`: per-tool ceilings derived from tool risk and expected work.
- `TURN_BUDGET`: existing profile semantic ceiling.
- `NO_PROGRESS_TIMEOUT`: requires provider/worker heartbeat evidence; it must never be reset by untrusted output alone.

Progress and authority are separate. Any future design must retain leases, risk controls, human takeover priority, tool restrictions, independent verification, provenance and cleanup. A progress-aware timeout cannot grant broader authority or run indefinitely.

## Secondary transport finding

The diagnostic Agent Control ceilings of 600/780/1500 seconds did not override Node/Undici's default 300-second response-header timeout. A future experiment must configure and evidence that transport boundary explicitly or use trustworthy streaming progress. The present task intentionally did not alter production transport policy.

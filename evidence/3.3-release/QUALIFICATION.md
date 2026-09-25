# Agent Control 3.3.0 release qualification

- Starting authoritative main: `99db684e1dfadb7b7137e3a88777b4e17c54cd24`
- Telemetry commit: `049153aed66e69a70dc656f2145647cfdf805ffa`
- Neutrality remediation: `6af17b5687f4574e452c499244c1c211b1512e6d`
- Previous release: `v3.2.1`
- Candidate release: `v3.3.0`

The version is `3.3.0` because the maintained tree already carries consistent 3.3.0 package, runtime, and implementation-status metadata, while no local tag, remote tag, or GitHub release exists for that version.

| Gate | Result |
|---|---|
| TypeScript | PASS |
| Bootstrap syntax | PASS |
| Dashboard syntax | PASS |
| Implementation status | PASS, 18 entries |
| Infrastructure neutrality | PASS, 3/3 |
| Dashboard and invocation telemetry regressions | PASS, 58/58 |
| Previous SR regressions | PASS, 51/51 |
| Full repository tests | PASS, 447/447 |
| Composite `npm run check` | PASS, including 447/447 repository tests |
| `npm pack --dry-run --json` | PASS, `agent-control@3.3.0`, 454 entries |

The package dry-run used the repository's existing Git-ignore fallback because no dedicated npm-ignore file is present. It created no package archive and published nothing.

No new failure was observed. Raw command output and exit statuses are retained under `raw/`.

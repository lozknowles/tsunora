# Agent Control v4.12 Lean Runtime — final native qualification

**RESULT: BLOCKED for Lean adoption; PASS for native benchmark ownership.**

The benchmark now runs through Agent Control's production JobRuntime boundary. A fresh exact ten-task A/B completed with native provenance, but both lanes scored 0/10 under the frozen deadlines. Lean used fewer total tokens and calls while increasing fresh input by 3.0%; elapsed time was unchanged. The evidence therefore does not justify production promotion.

Final source implementation: `22e2de863` plus this report-only commit. Released baseline: `9dff191034b7c69e102687bef02803bc05afe874`. Full suite: 1,946 passed, 0 failed, 0 skipped.

See:

- `TEN-TASK-HARNESS-RESPONSIBILITY-AUDIT.md`
- `AGENT-CONTROL-NATIVE-BENCHMARK-QUALIFICATION.md`
- `AGENT-CONTROL-4.11-VS-4.12-LEAN-NATIVE-AB.md`
- `LEAN-FRESH-INPUT-ANALYSIS.md`
- `CACHE-AWARE-LEAN-RUNTIME.md`
- `LEAN-FEATURE-DECISIONS.md`
- `qualification-status.json`

No merge, push, tag, release, deployment or production configuration change occurred.

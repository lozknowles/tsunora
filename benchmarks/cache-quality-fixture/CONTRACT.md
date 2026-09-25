# Completion contract

`completeRun(modelComplete, verifierPassed)` may return `SUCCEEDED` only when
both `modelComplete` and `verifierPassed` are true. In every other case it must
return `FAILED`.

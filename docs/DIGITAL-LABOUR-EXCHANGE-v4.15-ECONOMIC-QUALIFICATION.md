# v4.15 AI labour economic qualification

Continuation of local candidate `0071262a5`. **Experimental only; no release, merge, push or deployment authority is implied.** Original deterministic evidence remains intact.

## Findings

Three stable worker identities executed actual existing Qwen2.5 general 3B, coder 3B and coder 7B models using an optional native CPU backend. The frozen benchmark contains six calibration cases and twelve held-out cases across classification, extraction, structured output, reasoning, bounded coding expressions and an allowlisted tool. Each strategy uses the same verifier and independent held-out history after shared calibration. No new model was downloaded; no provider credential or API billing was used.

Canonical LF benchmark SHA-256: `4fe5effd0cc7c983f3796de340d68660ad37aa31fec57ab4c2d507dff4aa35de`. The originally frozen CRLF serialization was `299a3c56dff002ea8fedcb2f318fc88563f8f5578b36a8d9afb4f761e0287c43`; JSON equality was verified and the original retained. No prompts, expected answers or allocation prices were tuned after results.

| Strategy | Verified / 12 | Attempts | Retries | Total CPU accounting units | Wall ms |
|---|---:|---:|---:|---:|---:|
| Fixed coder 7B | 8 | 10 | 0 | 201810 | 68178 |
| Cheapest eligible | 9 | 15 | 5 | 208173 | 73923 |
| Broker | 9 | 14 | 4 | 180263 | 64488 |

Broker and cheapest verified the same nine cases. In this run, brokerage used 13.41% fewer measured CPU accounting units, including natural failures and verification. All three strategies verified eight common cases; that descriptive subset is reported separately. Two unchanged cases naturally demonstrated a cheap initial worker costing more to complete than fixed allocation: extraction and tool-mediated work required retries. No fault injection contributed to those economic rows. Broker awards went to all three worker identities.

**Overall economic conclusion: BROKERAGE ECONOMICALLY NEUTRAL / INCONCLUSIVE.** The observed resource benefit is real within this small run, but it is not monetary savings or a statistically established general advantage. None of the workers qualified for the reasoning contract; only the 7B coder qualified for the narrow coding contract and it still failed one held-out coding case. A full-workload or production-economics claim would be unsupported.

XCU means measured child user+system CPU milliseconds, including cold model load, plus measured verifier CPU. Tokens, wall time and peak RSS are retained. Energy, monetary conversion, opportunity cost and full controller overhead are unmeasured. An interrupted control attempt lacked CPU telemetry and retained a conservative reserved internal charge, explicitly flagged unknown. Internal accounting is not payment.

## Architecture and controls

The Paperclip disposition table explicitly consumes all adoption/defer/reject recommendations. Ownership fencing, organisational attribution and contract-bound settlement were retained. Additions include model/backend/tool resource attribution, CPU accounting with maximum-liability reservations, worker payroll, guarded strategy comparisons and latest-qualification revocation. Matching case labels alone cannot establish comparable inputs or verifier contracts. No Paperclip integration is needed or added.

The same worker identity changed from the general model to the coder model, retained nineteen earlier attempts, was blocked until fresh qualification and then verified work. Actual AI process interruption re-brokered to a distinct worker, with the failed liability preserved. Quarantine excluded the affected identity, permissions denied execution, and the existing containment supervisor reported STOP_CONFIRMED and persisted stopped admission. Autonomous model escalation and general agent delegation are not qualified.

Independent validation passed for 492 ledger events and 63 attempts, including contract/result hashes, full cost sums, measured resources and controls. The sealed complete `npm run check` suite passed **2,313 tests, zero failures/skips/cancellations**. TypeScript and dashboard syntax were checked after the video-only reproduction option; the option selects the first unchanged frozen case and does not affect the primary comparison.

Detailed reports, all bids/awards/attempts, raw stdout/stderr, model/runtime digests, original failures, video receipts, screenshots, full test logs and integrity manifests are supplied in the private task handoff. Preliminary prompt-echo adapter failure, an interrupted pre-market calibration run, the initial API-label regression and incomplete capture attempts are preserved. Local hashes are not externally anchored authenticity.

## Release decision

Do not release v4.15.0 from this evidence. Keep the candidate isolated. Broader representative work, stronger competence evidence and a defensible production accounting basis are required before production integration. No public release metadata or existing serving workload was changed. See the Paperclip disposition and AI operations guide beside this document.

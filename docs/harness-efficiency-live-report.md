# Live same-model harness efficiency report

Generated: 2026-08-28T05:53:56.152Z

Classification: **LIVE_SAME_MODEL_CONTROLLED_CONTEXT_RETRIEVAL_NOT_REPOSITORY_MUTATION_EVIDENCE**. One live model and one provider endpoint were held constant. The experiment used governed typed submissions and deterministic verification; it did not mutate a repository. Applied request parameters are recorded separately from the frozen suite declarations; unsupported declarations are not presented as applied.

## Provider-measured startup floor

The provider input count includes the minimal typed task and transport chat template. Component counts are deterministic estimates used only to attribute the floor. The existing provider cache was deliberately not reset because that would have required a protected-service change; logical input tokens remain comparable while cached/fresh fields describe the observed warm state.

| Profile | Provider input tokens | Estimated persistent components | Output tokens | Cached input | Verifier |
| --- | ---: | ---: | ---: | ---: | --- |
| THIN | 801 | 264 | 58 | 99.9% | PASS |
| STANDARD | 2,081 | 1,469 | 57 | 100.0% | PASS |
| DEEP | 5,376 | 3,056 | 59 | 100.0% | PASS |

THIN provider-measured floor reduction versus STANDARD: **61.5%**.

## Execution

| Task | Profile | Fresh input | Cached input | Output | Model latency ms | Verifier |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| trivial-value | THIN | 10 | 680 | 56 | 2674 | PASS |
| trivial-value | STANDARD | 1,342 | 680 | 56 | 5203 | PASS |
| trivial-value | DEEP | 1 | 5,251 | 56 | 2793 | PASS |
| known-function | THIN | 691 | 0 | 56 | 3823 | PASS |
| known-function | STANDARD | 1,342 | 681 | 56 | 5213 | PASS |
| known-function | DEEP | 4,567 | 686 | 56 | 13593 | PASS |
| single-dependency | THIN | 746 | 0 | 58 | 4058 | PASS |
| single-dependency | STANDARD | 1,346 | 736 | 58 | 5340 | PASS |
| single-dependency | DEEP | 4,573 | 741 | 58 | 13699 | PASS |
| known-bug | THIN | 743 | 0 | 55 | 3906 | PASS |
| known-bug | STANDARD | 1,346 | 733 | 55 | 5243 | PASS |
| known-bug | DEEP | 4,573 | 738 | 55 | 13508 | PASS |
| single-test-repair | THIN | 800 | 0 | 57 | 4134 | PASS |
| single-test-repair | STANDARD | 1,350 | 790 | 57 | 5398 | PASS |
| single-test-repair | DEEP | 4,579 | 795 | 57 | 13957 | PASS |
| exact-search | THIN | 689 | 0 | 56 | 3866 | PASS |
| exact-search | STANDARD | 1,342 | 679 | 56 | 5247 | PASS |
| exact-search | DEEP | 4,567 | 684 | 56 | 13658 | PASS |
| known-config | THIN | 687 | 0 | 54 | 3855 | PASS |
| known-config | STANDARD | 1,342 | 677 | 54 | 5062 | PASS |
| known-config | DEEP | 4,567 | 682 | 54 | 13502 | PASS |
| known-doc | THIN | 688 | 0 | 55 | 3857 | PASS |
| known-doc | STANDARD | 1,342 | 678 | 55 | 5181 | PASS |
| known-doc | DEEP | 4,567 | 683 | 55 | 13539 | PASS |
| two-file-contract | THIN | 806 | 0 | 59 | 4127 | PASS |
| two-file-contract | STANDARD | 1,350 | 796 | 59 | 5345 | PASS |
| two-file-contract | DEEP | 4,579 | 801 | 59 | 13902 | PASS |
| schema-migration-plan | THIN | 738 | 0 | 45 | 3420 | FAIL |
| schema-migration-plan | STANDARD | 1,805 | 339 | 60 | 6420 | PASS |
| schema-migration-plan | DEEP | 4,579 | 799 | 60 | 14081 | PASS |
| cross-module-bug | THIN | 738 | 0 | 45 | 3453 | FAIL |
| cross-module-bug | STANDARD | 1,801 | 339 | 56 | 6206 | PASS |
| cross-module-bug | DEEP | 4,579 | 795 | 56 | 13877 | PASS |
| broad-symbol-search | THIN | 686 | 0 | 45 | 3436 | FAIL |
| broad-symbol-search | STANDARD | 1,752 | 332 | 58 | 6225 | PASS |
| broad-symbol-search | DEEP | 4,573 | 743 | 58 | 13754 | PASS |
| compiler-diagnostic | THIN | 684 | 0 | 44 | 3353 | FAIL |
| compiler-diagnostic | STANDARD | 1,748 | 331 | 54 | 5935 | PASS |
| compiler-diagnostic | DEEP | 4,573 | 738 | 54 | 13573 | PASS |
| multi-file-feature | THIN | 686 | 0 | 44 | 3246 | FAIL |
| multi-file-feature | STANDARD | 1,752 | 332 | 57 | 6048 | PASS |
| multi-file-feature | DEEP | 4,573 | 743 | 57 | 13492 | PASS |
| provider-adapter | THIN | 686 | 0 | 44 | 3271 | FAIL |
| provider-adapter | STANDARD | 1,751 | 332 | 56 | 5992 | PASS |
| provider-adapter | DEEP | 4,573 | 742 | 56 | 12681 | PASS |
| race-diagnosis | THIN | 685 | 0 | 44 | 3225 | FAIL |
| race-diagnosis | STANDARD | 1,345 | 675 | 44 | 4281 | FAIL |
| race-diagnosis | DEEP | 5,316 | 0 | 59 | 13851 | PASS |
| scheduler-architecture | THIN | 685 | 0 | 44 | 2891 | FAIL |
| scheduler-architecture | STANDARD | 1,345 | 675 | 44 | 3778 | FAIL |
| scheduler-architecture | DEEP | 5,313 | 0 | 56 | 13442 | PASS |
| security-boundary | THIN | 685 | 0 | 44 | 3018 | FAIL |
| security-boundary | STANDARD | 1,345 | 675 | 44 | 4365 | FAIL |
| security-boundary | DEEP | 5,313 | 0 | 56 | 12677 | PASS |
| recovery-redesign | THIN | 687 | 0 | 45 | 2658 | FAIL |
| recovery-redesign | STANDARD | 1,345 | 677 | 45 | 2741 | FAIL |
| recovery-redesign | DEEP | 5,314 | 0 | 56 | 7793 | PASS |
| cross-service-change | THIN | 687 | 0 | 44 | 1664 | FAIL |
| cross-service-change | STANDARD | 1,345 | 677 | 44 | 2338 | FAIL |
| cross-service-change | DEEP | 5,315 | 0 | 56 | 7798 | PASS |

## Efficiency

| Profile | Overall verified success | Success when required context is available | Median input | Tokens / verified outcome | Median latency ms | Cost / verified outcome |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| THIN | 45.0% | 100.0% | 688 | 1,687 | 3,428 | unknown |
| STANDARD | 75.0% | 100.0% | 2,051 | 2,823 | 5,245 | unknown |
| DEEP | 100.0% | 100.0% | 5,314 | 5,367 | 13,556 | unknown |

- THIN preserved verified success on **100.0%** of the frozen bounded tasks.
- STANDARD verified **6** additional tasks whose evidence was intentionally outside the THIN packet.
- DEEP verified **5** additional broad-context tasks.
- Provider-reported cached input across task runs: **17.4%**.
- Monetary cost per verified outcome is **unknown** for every profile. The existing local endpoint exposes no billing price or provider-reported monetary cost; infrastructure and energy costs were not fabricated.
- Automatic production routing supported: **NO**. Live evidence covers controlled typed context retrieval with deterministic verification, not repository mutation or production coding outcomes. Production routing therefore remains observational.

## Governance and limitations

The benchmark used explicit EXPERIMENT profile selection, one allowlisted read-only submission tool, and independent marker verification. It made no repository mutation, changed no service, and did not enable production profile enforcement. Results demonstrate live context availability and token tax, not end-to-end coding success.

# Product source ownership review

Reviewed requested candidate `f773a3daba62874f27e1ca2bb288e292c9699ac5` against public v4.8.0. Actual physical execution used descendant `86781560cd1d6899c5a81d949fadd3f649e2e942`; current candidate `9d5766e187e48634741cc349f16da6c42ab066c9` adds documentation only after that execution source. No production-code diff remains between physical source and current candidate.

| File | Ownership | Disposition |
|---|---|---|
| `README.md` | DOCUMENTATION | Product operator/architecture documentation remains with product. |
| `assets/dashboard/dashboard-observability.js` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `assets/runtime/llama-invocation.py` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `assets/runtime/python-repair-validator.py` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `benchmarks/local-model-common-v2.json` | LAB MATERIAL | Publish versioned copies/projections in Lab; keep compatibility examples in product. No engine fork. |
| `docs/atlas-benchmark-runtime.md` | DOCUMENTATION | Product operator/architecture documentation remains with product. |
| `docs/benchmark-harness-escape-audit.json` | QUALIFICATION-ONLY | Retain review provenance; not an execution dependency. |
| `docs/examples/native-benchmark-smoke-result.json` | LAB MATERIAL | Publish versioned copies/projections in Lab; keep compatibility examples in product. No engine fork. |
| `docs/examples/runtime-benchmark-linux.json` | LAB MATERIAL | Publish versioned copies/projections in Lab; keep compatibility examples in product. No engine fork. |
| `docs/mobile-benchmark-admission.md` | DOCUMENTATION | Product operator/architecture documentation remains with product. |
| `docs/mobile-benchmark-source-provenance.json` | QUALIFICATION-ONLY | Retain review provenance; not an execution dependency. |
| `docs/native-benchmark-responsibility-matrix.md` | DOCUMENTATION | Product operator/architecture documentation remains with product. |
| `docs/running-your-first-benchmark.md` | DOCUMENTATION | Product operator/architecture documentation remains with product. |
| `scripts/agent-control.mjs` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `scripts/benchmark-client.test.mjs` | TESTS | Retain with authoritative product implementation. |
| `src/control/application-service.ts` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `src/control/estate-readiness-presentation.test.ts` | TESTS | Retain with authoritative product implementation. |
| `src/control/estate-readiness-presentation.ts` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `src/control/job-bootstrap.ts` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `src/control/job-runtime.test.ts` | TESTS | Retain with authoritative product implementation. |
| `src/control/job-runtime.ts` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `src/control/lab-case-statistics.test.ts` | TESTS | Retain with authoritative product implementation. |
| `src/control/lab-case-statistics.ts` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `src/control/lab-continuation.test.ts` | TESTS | Retain with authoritative product implementation. |
| `src/control/lab-continuation.ts` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `src/control/lab-node-binding.test.ts` | TESTS | Retain with authoritative product implementation. |
| `src/control/lab-observation.test.ts` | TESTS | Retain with authoritative product implementation. |
| `src/control/lab-observation.ts` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `src/control/lab-public-projection.test.ts` | TESTS | Retain with authoritative product implementation. |
| `src/control/model-hardware-qualification.test.ts` | TESTS | Retain with authoritative product implementation. |
| `src/control/model-hardware-qualification.ts` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `src/control/observability.ts` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `src/control/physical-inference-observation.test.ts` | TESTS | Retain with authoritative product implementation. |
| `src/control/physical-inference-observation.ts` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `src/control/poe.test.ts` | TESTS | Retain with authoritative product implementation. |
| `src/control/poe.ts` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `src/control/runtime-benchmark-projection.test.ts` | TESTS | Retain with authoritative product implementation. |
| `src/control/runtime-benchmark-projection.ts` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `src/control/runtime-benchmark-provenance.test.ts` | TESTS | Retain with authoritative product implementation. |
| `src/control/runtime-benchmark-provenance.ts` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `src/control/runtime-benchmark-validator.test.ts` | TESTS | Retain with authoritative product implementation. |
| `src/control/runtime-benchmark-validator.ts` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `src/control/runtime-benchmark.test.ts` | TESTS | Retain with authoritative product implementation. |
| `src/control/runtime-benchmark.ts` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `src/control/runtime-map.ts` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `src/control/runtime-target-telemetry.test.ts` | TESTS | Retain with authoritative product implementation. |
| `src/control/runtime-target-telemetry.ts` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `src/control/target-llama-runtime.test.ts` | TESTS | Retain with authoritative product implementation. |
| `src/control/target-llama-runtime.ts` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `src/control/transport-llama-lab-adapter.test.ts` | TESTS | Retain with authoritative product implementation. |
| `src/control/transport-llama-lab-adapter.ts` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |
| `src/web.ts` | PRODUCT RUNTIME | One authoritative implementation in Agent Control; Lab calls its normal job API. |

Later changes: `48c26f6` and `8678156` add/fix generic product inspection and its tests; `627209d` and `9d5766e` are documentation and sanitized Lab example updates. The f773a3d commit alone is not the exact physical qualification source.

The f773a3d commit itself adds the CLI, client/provenance tests, guide, responsibility matrix, audit and examples; native runtime work also exists in its ancestors. The inherited API/UI/job/evidence changes listed above require product integration review; copying only Lab material cannot provide native execution.

Release recommendation: **RECOMMEND v4.8.1**, as a governed post-4.8 execution-provenance correction with reusable production capability absent from v4.8.0. This is a recommendation, not release approval. Normal product integration/security/install/upgrade/release gates remain separate. Public v4.8.0 is immutable.

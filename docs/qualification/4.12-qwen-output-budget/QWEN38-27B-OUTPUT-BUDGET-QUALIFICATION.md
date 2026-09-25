# Qwen3.8-27B output-budget qualification

Date: 20 September 2026
Agent Control source: `1935118b232889d5af59764c6280131a6e141d38`
Agent Control Lab source: `03c4a02fcd7c8b1f8537d6f7c887461991e92d23`

## Executive result

The preserved 512-token plain-arm result remains `OTHER — OUTPUT_LIMIT`: it ended for length with truncated invalid JSON and verifier rejection. The first 768-token search attempt naturally stopped at 574 tokens, produced valid JSON, and passed independent semantic verification.

The required three-case replication did not establish reliable completion. Two cases naturally stopped with valid, accepted JSON and no unsupported claims. The second case failed as `provider_malformed_response`; Agent Control retained no trustworthy finish reason or token counts for that call. The result is therefore **2/3 natural completion**, so template-arm comparison was stopped and fresh held-out material remains sealed.

The smallest budget observed to permit natural completion is **768 tokens**. It is not promoted as a reliability-qualified route budget because the replication gate failed.

## Attempts

| Attempt | Limit | Actual output | Finish | Valid JSON | Verifier | Unsupported claims | Generation tok/s | Wall ms | Process VRAM MiB | Process RSS bytes |
|---|---:|---:|---|---|---|---|---:|---:|---:|---:|
| preserved-512-boundary | 512 | 512 | length | False | REJECT | [] | 6.254058343352957 | 87574 | 13950 | 1337004032 |
| output-search-768 | 768 | 574 | stop | True | PASS | [] | 6.259942498174883 | 97363 | 13950 | 1336926208 |
| replication-1 | 768 | 574 | stop | True | PASS | [] | 6.239013656722642 | 97722 | 13950 | 1337065472 |
| replication-2 | 768 | unavailable | unavailable | False | NOT_REACHED | unavailable | unavailable | 129524 | 13950 | 1888563200 |
| replication-3 | 768 | 522 | stop | True | PASS | [] | 6.168340608961983 | 90383 | 13950 | 2450161664 |

Unavailable values are retained as unavailable; they are not converted to zero.

## Decision

- Natural finish reliability: **FAIL (2/3)**
- Valid JSON reliability: **FAIL (2/3)**
- Semantic acceptance: **FAIL (2/3)**
- Plain/template comparison: **not run**
- Evidence Verifier 1.2.0: **HELD_OUT_FAILED_NOT_QUALIFIED**
- Fresh held-out: **SEALED**
- Route classification for this frozen workload: **OPERATIONALLY_UNSUITABLE**
- Protected-service restoration: **PASS**
- Experimental-server cleanup: **PASS**

The 1024- and 1536-token searches were not run because the protocol required stopping at the first observed natural response. Production defaults were not changed.

## Integrity

- Preserved 512 evidence: `f885107e7f2a32342120245b18e412d0a3bb8e7d0d66280ddf0eec2936269b9a`
- 768 search evidence: `5039e073418be56fd21517042d9ac999afdd1cd2c09fb4e0c109a298501d4bf3`
- Three-case replication evidence: `738713808d2c0b0cbc932627bb91abedfa64bbbdfb645e66b79bb2bc748acbe0`

The model, runtime, case definitions, verifier, GPU configuration, context, threads, prompts and acceptance criteria remained fixed. Only the finite output-token envelope changed.

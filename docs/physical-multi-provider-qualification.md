# Physical multi-provider qualification

On 2026-09-01 Agent Control ran the genuine bounded chain:

```text
gpt-5.6-luna → qwen2.5-3b-instruct-q4_k_m.gguf → z-ai/glm-5.3-flash → gpt-5.6-luna
```

The exact providers were Codex with existing ChatGPT authentication, a loopback llama.cpp runtime, and OpenRouter with an indirect credential-file reference. No credential was retained in a prompt, baton, model output, Agent Control log or qualification evidence.

Luna created `physical-chain-v1` and delegated normalization of a fixed literal. The local Qwen model returned `agent-control`, then explicitly yielded because its baton prohibited self-review. Agent Control substituted GLM-5.3-Flash with a 51-byte review baton. GLM independently checked the result against `^[a-z]+-[a-z]+$`; Luna then integrated only the returned local and review evidence and submitted `COMPLETE` for Agent Control verification.

The GLM provider behavior was retained honestly: a 160-token Responses attempt ended `incomplete`, a chat-completions attempt was reset by the network, and a final 1,024-token bounded Responses attempt succeeded. The chain therefore qualifies with observed retries, not as a one-attempt success.

## Durable authority proof

The same observed chain was projected through the 3.6 contract/handoff runtime. The Luna writer detached while the process remained `RUNNING` and a human participant remained read-only. A new runtime instance reconstructed the contract from its mode-0600 snapshot with the process state and sealed baton hash intact. The durable sequence was:

```text
DELEGATE → YIELD → SUBSTITUTE → COMPLETE child → VERIFY child
                                      → COMPLETE parent → VERIFY parent
```

The first authority test deliberately omitted review from the child envelope. Substitution did not execute, and a subsequent GLM completion was rejected for source-identity mismatch. The corrected parent delegated both normalization and review capabilities, while the local baton still prohibited self-review; only then could the independent GLM substitute inherit review authority.

Both parent and child ended `VERIFIED/PASSED` under `agent-control:independent-verifier`. Baton sizes were 17–86 bytes and every baton/output is retained by SHA-256 in the [machine-readable evidence](evidence/physical-multi-provider-chain-20260901.json).

## Boundary

This is a real provider/delegation/restart qualification, but it is one synthetic bounded contract. It does not satisfy the 50-attempt capability-routing gate, provider token/cost fields remain unknown, and it does not promote automatic production routing. The local llama service was inactive before the run, started temporarily for qualification, and restored to inactive afterward; live Agent Control deployments were not changed.

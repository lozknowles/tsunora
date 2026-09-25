# Local model runtimes

Local runtimes use the same provider/model/qualification/role model as hosted APIs. Register the runtime only when its endpoint and lifecycle are explicitly controlled by the operator.

```json
{
  "providers": [{
    "id": "local-runtime",
    "kind": "openai-compatible",
    "enabled": false,
    "baseUrl": "http://127.0.0.1:11434/v1",
    "wireApi": "chat-completions",
    "auth": {"type": "none"}
  }],
  "models": [{
    "id": "local-code",
    "provider": "local-runtime",
    "providerModel": "operator-selected-model",
    "enabled": false,
    "nodes": ["controller"],
    "capabilities": ["coding"],
    "qualification": {"state": "DISABLED"}
  }]
}
```

Replace every endpoint and model ID. Agent Control does not scan ports, download weights, start a model server or infer GPU capability from this registration. Enable the provider/model only after the runtime is deliberately installed and bounded.

Qualification is node-specific because a model that works on one host may be absent, differently configured or resource constrained on another. Record only measured limits and sourced pricing; local electricity, occupancy and hardware amortization are not automatically fabricated as monetary cost.

Codex integration currently requires a Responses-compatible endpoint. A Chat-Completions-only local runtime remains usable through the generic OpenAI-compatible client but is rejected by the Codex materializer.

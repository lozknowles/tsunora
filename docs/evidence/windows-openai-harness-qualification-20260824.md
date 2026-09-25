# Windows OpenAI harness qualification

Date: 2026-08-24 (Europe/London)

Overall Windows return-data verdict: **SUPPORTED+QUALIFIED through both the Responses API and ChatGPT-plan Codex routes**.

Provider-specific verdicts:

| Route | Authentication | Qualification |
|---|---|---|
| Official OpenAI Responses API | `OPENAI_API_KEY`; usage-based API billing | **SUPPORTED+QUALIFIED** — live Job-to-verified-artifact pass |
| Official Codex non-interactive execution | saved ChatGPT-managed Codex login; plan allowance | **SUPPORTED+QUALIFIED** — live Job-to-verified-artifact pass |
| ChatGPT desktop-window automation | none | **NOT TESTED / UNIMPLEMENTED** |

## Source verified

- Official OpenAI authentication documentation states that Codex supports ChatGPT subscription authentication and API-key usage-based authentication: <https://learn.chatgpt.com/docs/auth>.
- Official non-interactive documentation defines `codex exec`, saved-auth reuse, JSONL events, output schemas, ephemeral execution and explicit read-only sandboxing: <https://learn.chatgpt.com/docs/non-interactive-mode>.
- `selectOpenAIExecutionProvider` implements `auto`, `api-key` and `chatgpt-plan`. It never returns or persists the key.
- `ResponsesProviderFactory` retains HTTPS Responses function-call mediation.
- `CodexExecProviderFactory` removes `OPENAI_API_KEY` and `CODEX_API_KEY` from the fallback child environment, requires `codex login status` to report ChatGPT, and launches `codex exec --ephemeral --json --sandbox read-only --ignore-user-config`.
- Codex receives only a schema-constrained `tool` plus JSON-encoded input request. The raw handler remains in `ToolHandlerRegistry`; the returned request enters `ToolInvocationGateway` and `ToolPolicy`.

## Experimentally verified

### Default automatic fallback

The real command ran with `OPENAI_AUTH_MODE=auto`, no API-key variable and an accessible official Codex CLI whose `codex login status` reported `Logged in using ChatGPT`:

```text
npm run qualify:openai-windows
```

Observed path:

```text
Job
-> HarnessJobAgentAction
-> HarnessDispatcher
-> AdaptiveHarness
-> ExecutionRecipe
-> codex exec with ChatGPT plan
-> schema-constrained return request
-> ToolInvocationGateway
-> ToolPolicy
-> qualification.return-data handler
-> typed checksummed artifact
-> verification
```

Evidence:

- started: `2026-08-24T17:23:42.275Z`; completed: `2026-08-24T17:23:48.778Z`;
- selection: `auto` -> `chatgpt-plan`, reason `api_key_absent`;
- model: `gpt-5.6-terra`;
- Run: `run-86280a91-f3a6-4f37-8451-5fb7feb146de`, `SUCCEEDED`;
- recipe: `recipe-13d3eeb995f4be4c`, fingerprint `13d3eeb995f4be4c6a8638f9a7d02705521bdd80a25658322a52c3c1e8dd1a69`;
- Codex thread: `01a034cc-a6f3-7563-911f-006dc0adcabb`;
- provider response SHA-256: `e76adc907528bc629d9ce8a66a077129367aca8c9c899b29cff785b3f238d068`;
- ToolPolicy audit: `qualification.return-data` allowed at lease generation 23 / ownership generation 31;
- artifact: `artifact-628139c8-5c09-4494-b988-8c34c8309c9e`, SHA-256 `4cfaaa97d1d8c100003e80fbf9d2d5822f23e00b597208401d854e0e1b082dbf`;
- durable live-evidence record: `windows-openai-chatgpt-plan-live-20260824.json`, SHA-256 `980a03b0bde3a9cafbe3a5030c96f8bf8cb160d608342aafc6dab516b12143bc`;
- verification `windows-openai-return-data`: passed;
- durable machine-readable evidence: `windows-openai-chatgpt-plan-live-20260824.json`.

Focused tests prove API-key preference, absent-key fallback, forced route selection, missing-auth failure, ungranted-tool denial, opaque file-change rejection, and live human-ownership fencing before the raw handler.

### Responses API route

The smallest qualification was rerun with `OPENAI_AUTH_MODE=api-key`, the existing ignored runtime key and `gpt-4o-mini`. No replacement key was needed or created. The model returned the required function call, the request passed through `ToolInvocationGateway` and live `ToolPolicy`, and the Run produced a checksummed JSON artifact that passed independent verification.

Evidence:

- started: `2026-08-24T20:42:02.461Z`; completed: `2026-08-24T20:42:06.325Z`;
- route: `openai-responses`, `POST https://api.openai.com/v1/responses`, selection reason `operator_forced_api_key`;
- model: `gpt-4o-mini`;
- Run: `run-c8de17dc-ba8b-4295-b122-74a72bba86d9`, `SUCCEEDED`;
- recipe: `recipe-f5056c5b98b15de8`, fingerprint `f5056c5b98b15de8ab57ec6f6b0250c0ccf418aeec5fa492406cecda31a691fd`;
- ToolPolicy audit: `qualification.return-data` allowed at lease generation 23 / ownership generation 31;
- artifact: `artifact-345892b9-4303-44ed-bdb5-129cc781399a`, SHA-256 `b406d0b08cc52508d7a2aca7e259ed74cebb02358297ae94596ba37615afc587`;
- verification `windows-openai-return-data`: passed;
- durable evidence: `windows-openai-responses-live-20260824.json`, SHA-256 `0000aa6784127f6f2bdc8cd2d446b312ee3c5c6de8e30d617ac9d8577ad3f941`.

The earlier live request remains evidence of the then-unavailable quota: it used `gpt-4o-mini`, Run `run-d04c28b7-19d5-48ad-abf1-6c2ad4251f0b`, reached the official endpoint and received HTTP 429. No function call, tool invocation or artifact was accepted in that failed attempt. Its final evidence SHA-256 remains `7b71ec5393f20a12f09709a597198a6552ae96c3a4ac7ad50ff2b24ab89ce8ec`.

## Failures retained

- The first ChatGPT-plan harness attempt authenticated and selected correctly but failed `codex_exec_failed:1` at the initial generic output-schema contract. The schema was narrowed to `tool` plus JSON-encoded `input_json`; the subsequent forced-plan and default-auto live runs passed.
- The earlier Responses pre-dispatch failure remains preserved as `windows-openai-harness-live-20260824-attempt1-pre-dispatch-unclassified.json`, SHA-256 `a9d8e87e52000f4ba0d194ede1412874b56ae97d23bf366b4b3ed2597c68bc32`.
- The earlier invalid-intent failure remains preserved as `windows-openai-harness-live-20260824-attempt2-invalid-intent.json`, SHA-256 `b7fd7b24f664aff4b991c7171fb6731c8cf57e9ce2f005826186d736916fceac`.

## Authority result

The provider selected no worker and acquired no lease. It received no raw handler and could not mutate scheduling, ownership, PTYs, batons or acceptance state. The returned request passed through live `ToolPolicy`; the Run moved through the existing verification boundary. Tests prove human ownership and stale generations deny handler execution.

## Opaque capability envelope

Codex built-in operations are not falsely described as individually mediated. This provider constrains the process to an ephemeral read-only sandbox and disables user-configured MCP tools. A file-change event is treated as an envelope violation. Internal read-only CLI activity remains opaque; only the returned Agent Control tool request is individually authorised by `ToolPolicy`.

## Not tested

- ChatGPT desktop-window automation, UI scraping, cookie reuse or session harvesting.
- Immediate termination of opaque internal read-only Codex activity on takeover. Human ownership does immediately fence the returned Agent Control tool request, and no control-plane mutation can occur through the supported adapter path.

## Operator decision

Keep `OPENAI_AUTH_MODE=auto` as the default. A configured non-empty API key selects Responses; otherwise Agent Control uses the saved ChatGPT-plan Codex login. Operators can force `chatgpt-plan` when a present API key has no quota, or force `api-key` when usage-based execution is required. Forced modes fail closed when their authentication prerequisite is missing.

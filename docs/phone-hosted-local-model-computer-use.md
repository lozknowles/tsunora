# Phone-hosted local model for governed computer use

Status: **implementation candidate; physical end-to-end qualification pending**.

This optional route keeps the official ChatGPT app, Agent Control, the phone model, and the computer-use worker distinct:

```text
ChatGPT mobile app
  -> authenticated private MCP connection
  -> Agent Control controller
  -> outbound phone-worker lease
  -> loopback OpenAI-compatible model on the phone
  -> typed action proposal returned to Agent Control
  -> policy and human approval
  -> authorised computer-use worker
  -> result, screenshots and evidence returned through MCP
```

The phone model does not run inside ChatGPT and does not replace ChatGPT's model. It cannot directly access the PC, a shell, ADB, files, or credentials. It can only return a bounded proposal using the allowed browser-action schema. Agent Control validates the proposal and owns approval, dispatch, cancellation, cleanup, evidence, and the observed result.

## Reused Agent Control components

- The official MCP SDK exposes seven narrow tools: `start_computer_task`, `get_task_status`, `get_latest_screenshot`, `approve_action`, `reject_action`, `cancel_task`, and `get_task_evidence`.
- `PhoneComputerTaskRuntime` stores a durable task/event record and projects protected status separately from authorised evidence.
- `PhoneModelOutboundWorker` polls outward for a lease and contacts only a configured loopback OpenAI-compatible endpoint.
- `OpenAILoopbackPlanningClient` preserves missing token fields as `null`; fresh input is derived only when both input and cached input are reported.
- `browser.session@1.0.0` remains the computer-use action. Its destination policy, step limits, screenshot hashing, cancellation signal, and existing Job runtime governance remain authoritative.
- `DirectInferenceRuntime`, reviewed from PR #25 commit `7608ac62889dc3ffc46ce658d3d574155ac6fa37`, provides the generic tool-free `RAW_INFERENCE` path and content-addressed evidence. PR #25 remains unreleased.

## Configuration boundary

A trusted controller configuration registers the phone worker identity, model identity and hash, runtime and boot/session identity, a loopback endpoint, and an authentication reference plus SHA-256 token digest. The token itself is supplied to the phone process through an existing secret mechanism and is never stored in task evidence.

The MCP HTTP transport must be authenticated and privately exposed using the deployment's supported private tunnel or equivalent TLS-protected route. This candidate creates the MCP server over the official SDK; it does not publish an endpoint or configure a tunnel.

The computer target and permitted destinations are explicit allowlists. Click, submit, and download proposals stop at `WAITING_FOR_APPROVAL`. Sensitive input selectors, private destinations, JavaScript, downloads, and all actions outside the bounded schema are rejected by the phone-plan validator. Existing browser policy applies again at execution time.

Cancellation is written durably as `CANCELLING` before the live abort is sent. A task does not become `CANCELLED` unless task-owned descendant cleanup is confirmed. On controller restart, live work is reconstructed as disconnected or failed and is never assumed to have succeeded.

## Android operation

The expected phone-side runtime is an already-running, loopback-bound llama.cpp-compatible server plus the outbound worker process. This code does not download a model, start or stop unrelated phone services, alter ADB, or expose Termux. Android background suspension remains a deployment limitation until a safe foreground-service strategy is physically qualified; the operator must keep the worker active during qualification.

## Current qualification boundary

The typed runtime, official MCP tool surface, outbound lease, loopback model client, approval/rejection, cancellation fencing, restart reconstruction, redaction, destination constraints, and unavailable token semantics have automated coverage. No real ChatGPT mobile connection, Ed phone, physical local model, or authorised PC computer-use execution has been performed from this branch. Those are mandatory before a `PASS` verdict.

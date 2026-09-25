import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {ResourceCodexNodeExecutionPort} from './codex-node-execution.js';
import type {CodexNodeExecutionPort} from './codex-node-execution.js';
import {CodexRepositoryReviewClient} from './codex-repository-review-client.js';
import type {ProviderAccountProfileConfig, ProviderConfig, ResourceConfig} from './config.js';
import type {SshExecutor} from './managed-node-ssh.js';
import {ExecutionSessionRuntime, type ExecutionSessionScope} from './execution-session.js';

const node: ResourceConfig = {id: 'windows-node', platform: 'windows', transport: {type: 'ssh', host: 'windows-node.example', port: 22, user: 'operator'}, capabilities: ['harness.codex']};
const provider: ProviderConfig = {id: 'codex', kind: 'cli'};
const account: ProviderAccountProfileConfig = {id: 'account-a', nodeId: node.id, label: 'Account A', credentialStore: {type: 'codex-home-env', env: 'CODEX_HOME_ACCOUNT_A'}};
const hash = 'a'.repeat(64);

test('authenticated remote account status returns only sanitized qualification metadata', async () => {
  const executor: SshExecutor = async () => ({status: 0, stdout: JSON.stringify({schema: 'agent-control.codex-node-result/v1', operation: 'accountStatus', ok: true, authenticated: true, codexVersion: 'codex-cli 0.153.0', executableSha256: hash, discoveredAt: '2026-09-03T10:00:00.000Z'}), stderr: 'raw stderr forbidden'});
  const result = await new ResourceCodexNodeExecutionPort([node], {}, executor).accountStatus({provider, account, nodeId: node.id, timeoutMs: 1_000});
  assert.deepEqual(result, {providerId: 'codex', accountProfileId: 'account-a', nodeId: 'windows-node', providerExecutionNodeId: 'windows-node', credentialNodeId: 'windows-node', authenticated: true, codexVersion: 'codex-cli 0.153.0', executableSha256: hash, discoveredAt: '2026-09-03T10:00:00.000Z'});
  assert.equal(JSON.stringify(result).includes('raw stderr'), false);
});

test('genuine outer transport timeout remains a timeout instead of an authentication result', async () => {
  const executor: SshExecutor = async () => ({status: 0, stdout: '', stderr: 'sensitive remote text', timedOut: true});
  await assert.rejects(() => new ResourceCodexNodeExecutionPort([node], {}, executor).accountStatus({provider, account, nodeId: node.id, timeoutMs: 1_000}), error => {
    assert.equal((error as Error).message, 'codex_node_timeout');
    assert.equal(JSON.stringify(error).includes('sensitive remote text'), false);
    return true;
  });
});

test('Windows Codex node execution sends one fixed PowerShell program and treats all variable values as encoded data', async () => {
  const secretInstruction = 'review value with spaces; Write-Output injected-marker';
  let observed: {args: string[]; source: string; payload: Record<string, unknown>; bootstrap: string} | undefined;
  const executor: SshExecutor = async (command, args, input) => {
    assert.equal(command, 'ssh');
    const lines = input.trimEnd().split(/\r?\n/), encoded = lines.shift()!, encodedSource = lines.shift()!;
    assert.equal(lines.length, 0);
    const source = Buffer.from(encodedSource, 'base64').toString('utf8'), payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as Record<string, unknown>;
    const bootstrap = Buffer.from(args.at(-1)!, 'base64').toString('utf16le');
    observed = {args, source, payload, bootstrap};
    return {status: 0, stdout: JSON.stringify({schema: 'agent-control.codex-node-result/v1', operation: 'execReadOnlyStructured', ok: true, codexVersion: 'codex-cli 0.152.1', executableSha256: hash, discoveredAt: '2026-09-03T10:00:00.000Z', threadId: 'thread-safe', finalMessage: '{"ok":true}', usage: {input_tokens: 4, output_tokens: 2, total_tokens: 6}, observedItemTypes: ['agent_message'], telemetry: [{type: 'turn.completed', elapsedMs: 9, usage: {input_tokens: 4, output_tokens: 2, total_tokens: 6}}]}), stderr: 'raw remote stderr must not be returned'};
  };
  const port = new ResourceCodexNodeExecutionPort([node], {CODEX_HOME_ACCOUNT_A: '/controller/must-not-be-read'}, executor);
  const result = await port.execReadOnlyStructured({provider, account, nodeId: node.id, model: {id: 'model-a', provider: provider.id, accountProfile: account.id, providerModel: 'gpt-example', capabilities: []}, instruction: secretInstruction, outputSchema: {type: 'object'}, timeoutMs: 1_000});
  assert.deepEqual(observed?.args.slice(-5, -1), ['powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand']);
  assert.match(observed?.bootstrap ?? '', /ReadLine\(\)/);
  assert.doesNotMatch(observed?.bootstrap ?? '', /ReadToEnd\(\)/);
  assert.match(observed?.bootstrap ?? '', /FromBase64String\(\$encodedSource\)/);
  assert.match(observed?.source ?? '', /^param\(\[string\]\$PayloadLine\)/);
  assert.equal(observed?.source.includes(secretInstruction), false);
  assert.equal(observed?.source.includes(account.id), false);
  assert.equal(observed?.payload.instruction, secretInstruction);
  assert.equal(observed?.payload.credentialEnvironment, 'CODEX_HOME_ACCOUNT_A');
  assert.equal(JSON.stringify(result).includes('C:\\'), false);
  assert.equal(JSON.stringify(result).includes('raw remote stderr'), false);
  assert.equal(result.nodeId, node.id);
});

test('remote structured output permits governed repository paths but fails closed on credential-profile paths', async () => {
  const model = {id: 'model-a', provider: provider.id, accountProfile: account.id, providerModel: 'gpt-example', capabilities: []};
  const safeExecutor: SshExecutor = async () => ({status: 0, stdout: JSON.stringify({schema: 'agent-control.codex-node-result/v1', operation: 'execReadOnlyStructured', ok: true, codexVersion: 'codex-cli 0.153.4', executableSha256: hash, discoveredAt: '2026-09-12T04:00:00.000Z', finalMessage: '{"vault":"D:/example/vault"}', observedItemTypes: ['agent_message']}), stderr: ''});
  const result = await new ResourceCodexNodeExecutionPort([node], {}, safeExecutor).execReadOnlyStructured({provider, account, nodeId: node.id, model, instruction: 'bounded', outputSchema: {type: 'object'}, timeoutMs: 1_000});
  assert.match(result.finalMessage, /D:\/example\/vault/);
  const unsafeExecutor: SshExecutor = async () => ({status: 0, stdout: JSON.stringify({schema: 'agent-control.codex-node-result/v1', operation: 'execReadOnlyStructured', ok: true, codexVersion: 'codex-cli 0.153.4', executableSha256: hash, discoveredAt: '2026-09-12T04:00:00.000Z', finalMessage: '{"profile":"C:\\Users\\Example\\.local\\share\\agent-control\\codex-profiles\\cottage-plus"}', observedItemTypes: ['agent_message']}), stderr: ''});
  await assert.rejects(() => new ResourceCodexNodeExecutionPort([node], {}, unsafeExecutor).execReadOnlyStructured({provider, account, nodeId: node.id, model, instruction: 'bounded', outputSchema: {type: 'object'}, timeoutMs: 1_000}), /codex_exec_sensitive_output_rejected/);
});

test('remote account execution never resolves the controller credential environment or exposes transport stderr', async () => {
  const executor: SshExecutor = async () => ({status: 23, stdout: '', stderr: 'C:\\Users\\operator\\secret-profile auth-token-value'});
  const port = new ResourceCodexNodeExecutionPort([node], {CODEX_HOME_ACCOUNT_A: '/controller/forbidden'}, executor);
  await assert.rejects(() => port.accountStatus({provider, account, nodeId: node.id, timeoutMs: 1_000}), error => {
    assert.equal((error as Error).message, 'codex_node_transport_failed');
    assert.equal(JSON.stringify(error).includes('secret-profile'), false);
    return true;
  });
});

test('untrusted remote failure text is reduced to a canonical error', async () => {
  const executor: SshExecutor = async () => ({status: 0, stdout: JSON.stringify({schema: 'agent-control.codex-node-result/v1', operation: 'accountStatus', ok: false, error: 'C:\\private\\profile token-value'}), stderr: ''});
  const port = new ResourceCodexNodeExecutionPort([node], {}, executor);
  await assert.rejects(() => port.accountStatus({provider, account, nodeId: node.id, timeoutMs: 1_000}), error => {
    assert.equal((error as Error).message, 'codex_chatgpt_auth_required');
    return true;
  });
});

test('an account bound to the destination node cannot use a source-node execution context', async () => {
  let called = false;
  const executor: SshExecutor = async () => { called = true; throw new Error('must_not_run'); };
  const port = new ResourceCodexNodeExecutionPort([node], {}, executor);
  await assert.rejects(() => port.accountStatus({provider, account, nodeId: 'source-node', timeoutMs: 1_000}), /codex_account_execution_node_mismatch/);
  assert.equal(called, false);
});

test('the audited Windows runner discovers versioned Codex bundles without a hard-coded bundle hash', () => {
  const script = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/codex-node-windows.ps1'), 'utf8');
  assert.match(script, /OpenAI\\Codex\\bin/);
  assert.match(script, /Get-ChildItem/);
  assert.match(script, /--version/);
  assert.doesNotMatch(script, /[a-f0-9]{16,}\\codex\.exe/i);
  assert.doesNotMatch(script, /Invoke-Expression|\biex\b/i);
  assert.match(script, /Diagnostics\.ProcessStartInfo/);
  assert.match(script, /Arguments = 'login status'/);
  assert.match(script, /RedirectStandardInput = \$true/);
  assert.match(script, /RedirectStandardOutput = \$true/);
  assert.match(script, /RedirectStandardError = \$true/);
  assert.match(script, /StandardInput\.Close\(\)/);
  assert.match(script, /ReadToEndAsync\(\)/);
  assert.match(script, /\$statusProcess\.WaitForExit/);
  assert.match(script, /WaitForExit\(\[int\]\$statusTimeoutMilliseconds\)[\s\S]+\$statusProcess\.WaitForExit\(\)[\s\S]+GetAwaiter\(\)\.GetResult\(\)/);
  assert.match(script, /function Stop-ProcessTree/);
  assert.match(script, /taskkill\.exe.*\/PID.*\/T.*\/F/);
  assert.match(script, /Stop-ProcessTree \$statusProcess/);
  assert.match(script, /Stop-ProcessTree \$process/);
  assert.match(script, /codex_chatgpt_auth_required/);
  assert.match(script, /UTF8Encoding\(\$false\)/);
  assert.match(script, /--skip-git-repo-check/);
  assert.match(script, /--strict-config/);
  assert.match(script, /--ignore-user-config/);
  assert.match(script, /--ignore-rules/);
  assert.match(script, /project_doc_max_bytes=0/);
  assert.match(script, /web_search=disabled/);
  assert.match(script, /features\.shell_tool=false/);
  assert.match(script, /features\.unified_exec=false/);
  assert.match(script, /features\.multi_agent=false/);
  assert.match(script, /features\.browser_use=false/);
  assert.match(script, /features\.computer_use=false/);
  assert.match(script, /features\.in_app_browser=false/);
  assert.match(script, /features\.apps=false/);
  assert.match(script, /features\.image_generation=false/);
  assert.match(script, /features\.workspace_dependencies=false/);
  assert.match(script, /--output-last-message/);
  assert.match(script, /ReadAllText\(\$lastMessageFile\)/);
  assert.match(script, /\$start\.FileName = Join-Path \$env:SystemRoot 'System32\\cmd\.exe'/);
  assert.match(script, /\$start\.Arguments = '\/d \/s \/c/);
  assert.match(script, /< \"' \+ \$promptFile/);
  assert.match(script, /> \"' \+ \$stdoutFile/);
  assert.match(script, /2> \"' \+ \$stderrFile/);
  assert.doesNotMatch(script, /\$start\.Arguments[^\n]+request\.instruction/);
  assert.match(script, /\$process\.WaitForExit/);
  assert.match(script, /codex_node_context_limit_exceeded/);
  assert.match(script, /codex_node_rate_limited/);
  assert.match(script, /item\.type -eq 'error'/);
  assert.doesNotMatch(script, /Start-Job/);
});

test('destination execution fails closed when the execution port reports a different account or node', async () => {
  const wrongIdentityPort: CodexNodeExecutionPort = {
    async accountStatus() { throw new Error('not_used'); },
    async execReadOnlyStructured(request) { return {providerId: request.provider.id, accountProfileId: 'source-account', modelId: request.model.id, nodeId: 'source-node', codexVersion: 'codex-cli 0.152.1', executableSha256: hash, discoveredAt: '2026-09-03T10:00:00.000Z', finalMessage: '{}', observedItemTypes: []}; },
  };
  const client = new CodexRepositoryReviewClient(provider, account, node.id, wrongIdentityPort);
  await assert.rejects(() => client.invoke({id: 'model-a', provider: provider.id, accountProfile: account.id, providerModel: 'gpt-example', capabilities: []}, 'bounded input', {structured: true, outputSchema: {type: 'object'}}), /codex_node_execution_identity_mismatch/);
});

test('ephemeral Codex review preserves top-level cached input in telemetry and calculated accounting', async () => {
  const events: Array<{phase: string; context: {tokens: number | null; limitTokens: number | null; authority: string; source: string}; usage?: {cachedInputTokens: number | null; totalTokens: number | null}}> = [];
  const exactPort: CodexNodeExecutionPort = {
    async accountStatus() { throw new Error('not_used'); },
    async execReadOnlyStructured(request) {
      request.onTelemetry?.({type: 'turn.completed', elapsedMs: 9, usage: {input_tokens: 40, cached_input_tokens: 30, output_tokens: 6}, context: {tokens: null, authority: 'unavailable', source: 'codex_jsonl_does_not_report_current_context'}});
      return {providerId: request.provider.id, accountProfileId: request.account.id, modelId: request.model.id, nodeId: request.nodeId, codexVersion: 'codex-cli 0.153.0', executableSha256: hash, discoveredAt: '2026-09-03T10:00:00.000Z', finalMessage: '{"ok":true}', usage: {input_tokens: 40, cached_input_tokens: 30, output_tokens: 6}, observedItemTypes: ['agent_message']};
    },
  };
  const client = new CodexRepositoryReviewClient(provider, account, node.id, exactPort);
  const result = await client.invoke({id: 'model-a', provider: provider.id, accountProfile: account.id, providerModel: 'gpt-example', capabilities: [], limits: {contextTokens: 100}, pricing: {currency: 'USD', inputPerMillionTokens: 1, cachedInputPerMillionTokens: .5, outputPerMillionTokens: 2, effectiveFrom: '2026-09-05', source: 'test'}}, 'bounded input', {structured: true, outputSchema: {type: 'object'}, onTelemetry: event => events.push(event)});
  assert.equal(result.usage.totalTokens, 46);
  assert.equal(result.usage.cachedInputTokens, 30);
  assert.equal(result.usage.calculatedCost, .000037);
  assert.deepEqual(events.at(-1)?.context, {tokens: null, limitTokens: 100, authority: 'unavailable', source: 'codex_exec_turn_usage_is_not_current_context'});
  assert.equal(events.at(-1)?.usage?.totalTokens, 46);
  assert.equal(events.at(-1)?.usage?.cachedInputTokens, 30);
});

test('remote Codex repository execution registers the genuine governed SSH process as a scoped session', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-codex-live-session-'));
  const sessions = new ExecutionSessionRuntime(root);
  const scope: ExecutionSessionScope = {runId: 'run-remote', jobId: 'review-job', jobVersion: '1', stepId: 'repository-review:chunk-1', actionId: 'repository.review.invoke', workerId: 'provider:codex:account-a:model-a', nodeId: node.id, parcelId: 'parcel-remote', crewRole: 'quality-inspector', providerId: provider.id, accountLabel: account.label, modelId: 'model-a'};
  const wire = JSON.stringify({schema: 'agent-control.codex-node-result/v1', operation: 'execReadOnlyStructured', ok: true, codexVersion: 'codex-cli 0.153.0', executableSha256: hash, discoveredAt: '2026-09-03T10:00:00.000Z', threadId: 'thread-remote', finalMessage: '{"safe":true}', usage: {input_tokens: 12, output_tokens: 3, total_tokens: 15}, observedItemTypes: ['agent_message']});
  const executor: SshExecutor = async (_command, _args, _input, options) => {
    assert.ok(options.ownedExecution, 'production port must supply Agent Control process ownership');
    assert.equal(options.session?.remoteTransport, true);
    const result = await options.ownedExecution!.runProcess({command: process.execPath, args: ['-e', `process.stdout.write(${JSON.stringify(`${wire}\n`)})`], session: options.session}, options.signal);
    return {status: result.exitCode ?? 255, stdout: result.stdout, stderr: result.stderr};
  };
  try {
    const port = new ResourceCodexNodeExecutionPort([node], {}, executor, undefined, sessions);
    const result = await port.execReadOnlyStructured({provider, account, nodeId: node.id, model: {id: 'model-a', provider: provider.id, accountProfile: account.id, providerModel: 'gpt-example', capabilities: []}, instruction: 'bounded review', outputSchema: {type: 'object'}, timeoutMs: 5_000, executionSessionScope: scope});
    assert.equal(result.threadId, 'thread-remote');
    const [session] = sessions.list();
    assert.equal(session.scope.parcelId, 'parcel-remote');
    assert.equal(session.scope.nodeId, node.id);
    assert.equal(session.capabilities.terminal, 'ssh-channel');
    assert.equal(session.capabilities.remoteTransport, true);
    assert.equal(session.capabilities.modes.watch, true);
    assert.equal(session.capabilities.modes.intervene, true);
    assert.equal(session.capabilities.interactiveInput, false);
    const transcript = sessions.transcript(session.id);
    assert.match(transcript, /Remote Codex execReadOnlyStructured completed/);
    assert.match(transcript, /Codex agent output:/);
    assert.match(transcript, /\{"safe":true\}/);
    assert.doesNotMatch(transcript, /agent-control\.codex-node-result/);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {classifyTrivialWork, CodexFastExecutionRunner, effectiveSparkConfig, FastExecutionCoordinator, FileFastExecutionLedger, probeCodexSparkAvailability, type FastExecutionResult, type SparkAvailability, type TrivialWorkRequest} from './fast-execution.js';
import {ModelRegistry} from './model-registry.js';

const available: SparkAvailability = {available: true, model: 'gpt-5.3-codex-spark', codexVersion: 'codex-cli test', authMode: 'chatgpt', checkedAt: '2026-09-01T00:00:00.000Z', reason: 'qualified-test', evidence: ['test'], latencyMs: 1};
const enabled = {enabled: true, model: 'gpt-5.3-codex-spark', modelRole: 'fast-execution', maximumFiles: 1, maximumChangedLines: 80, maximumAttempts: 1, maximumSubagents: 0, maximumContextTokens: 2_048, verificationRequired: true} as const;

function request(patch: Partial<TrivialWorkRequest> = {}): TrivialWorkRequest {
  return {id: 'task-1', parcelId: 'parcel-1', runId: 'run-1', sessionId: 'session-1', description: 'Correct one misspelling.', kind: 'documentation', harnessProfile: 'THIN', risk: 'low', files: ['docs/guide.md'], estimatedChangedLines: 2, deterministicVerifier: ['npm test -- docs'], contextSources: [{id: 'task', kind: 'task_context', content: 'Correct one misspelling.', required: true, persistent: false, relevance: 1, provenanceIds: ['prompt:1']}, {id: 'history', kind: 'conversation_history', estimatedTokens: 10_000, persistent: false, relevance: .1, provenanceIds: ['thread:1']}], ...patch};
}
function registry(options: {spark?: boolean; qualified?: boolean} = {}) {
  const spark = options.spark !== false;
  return new ModelRegistry(
    [{id: 'codex-chatgpt', kind: 'cli', capabilities: ['trivial.coding']}],
    [
      ...(spark ? [{id: 'spark', provider: 'codex-chatgpt', providerModel: 'gpt-5.3-codex-spark', capabilities: ['trivial.coding'], nodes: ['controller'], qualification: {state: options.qualified === false ? 'UNTESTED' as const : 'QUALIFIED' as const, version: 'test-v1', capabilities: ['trivial.coding'], nodes: ['controller']}}] : []),
      {id: 'luna-standard', provider: 'codex-chatgpt', providerModel: 'gpt-5.6-luna', capabilities: ['coding'], nodes: ['controller'], qualification: {state: 'QUALIFIED' as const, version: 'test-v1', capabilities: ['coding'], nodes: ['controller']}},
    ],
    {roles: {...(spark ? {'fast-execution': {primary: 'spark', requires: ['trivial.coding']}} : {}), standard: {primary: 'luna-standard', requires: ['coding']}}},
  );
}
function result(patch: Partial<FastExecutionResult> = {}): FastExecutionResult { return {status: 'SUCCEEDED', summary: 'fixed', touchedFiles: ['docs/guide.md'], changedLines: 2, usage: {input_tokens: 100, output_tokens: 10}, evidence: ['diff:1'], confidence: .95, ...patch}; }
function coordinator(options: {run?: FastExecutionResult; verify?: boolean; standard?: (input: unknown) => Promise<FastExecutionResult>; models?: ModelRegistry} = {}) {
  let attempts = 0;
  const value = new FastExecutionCoordinator(options.models ?? registry(), available, {execute: async () => { attempts++; return options.run ?? result(); }}, {verify: async () => ({passed: options.verify !== false, evidence: ['test:pass'], reason: options.verify === false ? 'test-failed' : undefined})}, enabled, options.standard ? {execute: options.standard} : undefined);
  return {value, attempts: () => attempts};
}

test('Spark available permits a bounded trivial candidate', () => assert.equal(classifyTrivialWork(request(), enabled, available).eligible, true));
test('Spark unavailable rejects without changing execution policy', () => assert.deepEqual(classifyTrivialWork(request(), enabled, {...available, available: false}).reasons, ['spark-unavailable']));
test('trivial THIN low-risk task is selected', () => assert.equal(classifyTrivialWork(request({kind: 'lint'}), enabled, available).executionClass, 'SPARK'));
test('non-trivial task is rejected', () => assert.match(classifyTrivialWork(request({kind: undefined}), enabled, available).reasons.join(','), /task-not-trivial/));
test('sensitive task is rejected', () => assert.match(classifyTrivialWork(request({signals: ['security']}), enabled, available).reasons.join(','), /sensitive-task/));
test('protected path is rejected', () => assert.match(classifyTrivialWork(request({files: ['.github/workflows/release.yml']}), enabled, available).reasons.join(','), /protected-path/));

test('successful Spark completion requires independent verification', async () => {
  const {value} = coordinator(), outcome = await value.execute(request(), 'controller');
  assert.equal(outcome.telemetry.outcome, 'VERIFIED'); assert.equal(outcome.telemetry.verification, 'PASS'); assert.deepEqual(outcome.result?.evidence, ['diff:1', 'test:pass']);
});

test('failed Spark completion never reports verified', async () => {
  const {value} = coordinator({run: result({status: 'FAILED'})}), outcome = await value.execute(request(), 'controller');
  assert.equal(outcome.telemetry.outcome, 'ESCALATED'); assert.equal(outcome.telemetry.verification, 'FAIL');
});

test('automatic escalation invokes the governed standard runner with baton', async () => {
  let called = 0;
  const {value} = coordinator({verify: false, standard: async input => { called++; assert.equal((input as {model: string}).model, 'STANDARD'); return result({summary: 'standard fixed'}); }});
  const outcome = await value.execute(request(), 'controller'); assert.equal(called, 1); assert.equal(outcome.escalatedResult?.summary, 'standard fixed'); assert.equal(outcome.telemetry.escalationReason, 'test-failed');
});

test('Spark retry limit remains exactly one', async () => {
  const {value, attempts} = coordinator({run: result({status: 'FAILED'})}); await value.execute(request(), 'controller'); assert.equal(attempts(), 1); assert.equal(effectiveSparkConfig(enabled).maximumAttempts, 1);
});

test('telemetry records exact model usage files and verified outcome', async () => {
  const {value} = coordinator(), telemetry = (await value.execute(request(), 'controller')).telemetry;
  assert.equal(telemetry.actualModel, 'gpt-5.3-codex-spark'); assert.equal(telemetry.inputTokens, 100); assert.equal(telemetry.outputTokens, 10); assert.deepEqual(telemetry.touchedFiles, ['docs/guide.md']);
  assert.equal(telemetry.parcelId, 'parcel-1'); assert.equal(telemetry.runId, 'run-1'); assert.equal(telemetry.harnessProfile, 'THIN'); assert.equal(telemetry.finalVerifiedOutcome, true); assert.equal(telemetry.filesRead, null);
});

test('dashboard-facing identity is actual provider model rather than an alias', async () => {
  const {value} = coordinator(), telemetry = (await value.execute(request(), 'controller')).telemetry;
  assert.equal(telemetry.executionClass, 'SPARK'); assert.equal(telemetry.requestedModel, telemetry.actualModel);
});

test('Context Packet minimisation omits broad conversation history', () => {
  const selected = classifyTrivialWork(request(), enabled, available); assert.ok(selected.contextPacket); assert.ok(selected.contextPacket.estimatedTokens <= 2_048); assert.ok(selected.contextPacket.omitted.some(item => item.id === 'history'));
});

test('verification failure escalates and is not a completion', async () => {
  const {value} = coordinator({verify: false}), outcome = await value.execute(request(), 'controller'); assert.equal(outcome.result?.status, 'SUCCEEDED'); assert.equal(outcome.telemetry.outcome, 'ESCALATED');
});

test('no silent model fallback occurs when Spark route is unavailable', async () => {
  const {value} = coordinator({models: registry({spark: false})}), outcome = await value.execute(request(), 'controller'); assert.equal(outcome.route, null); assert.match(outcome.telemetry.escalationReason!, /model-route-unavailable/);
});

test('configuration disable keeps the task on STANDARD', () => assert.deepEqual(classifyTrivialWork(request(), {...enabled, enabled: false}, available).reasons, ['spark-disabled']));

test('existing non-Spark registry route remains unchanged', () => {
  const route = registry().route({modelRole: 'standard', nodeId: 'controller', requiredCapabilities: ['coding'], allowFallback: false}); assert.equal(route.providerModel, 'gpt-5.6-luna'); assert.equal(route.fallback, false);
});

test('availability probe fails closed when Codex cannot launch', async () => {
  const state = await probeCodexSparkAvailability({command: '/definitely/missing/codex', cwd: process.cwd(), timeoutMs: 100}); assert.equal(state.available, false); assert.equal(state.authMode, 'unknown');
});

test('coordinator persists one complete routing decision in the shared telemetry ledger', async () => {
  const attempts: unknown[] = [], ledger = {record: (attempt: unknown) => attempts.push(attempt), list: () => attempts as never[]};
  const value = new FastExecutionCoordinator(registry(), available, {execute: async () => result()}, {verify: async () => ({passed: true, evidence: ['verified']} )}, enabled, undefined, () => new Date('2026-09-01T00:00:00.000Z'), ledger);
  await value.execute(request(), 'controller'); assert.equal(attempts.length, 1); assert.equal((attempts[0] as {parcelId: string}).parcelId, 'parcel-1');
});

test('file fast-execution ledger survives restart without converting unknown values to zero', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-fast-ledger-')), file = path.join(root, 'attempts.json'), ledger = new FileFastExecutionLedger(file);
  const value = new FastExecutionCoordinator(registry(), available, {execute: async () => result({usage: undefined})}, {verify: async () => ({passed: true, evidence: ['verified']})}, enabled, undefined, () => new Date('2026-09-01T00:00:00.000Z'), ledger);
  await value.execute(request(), 'controller'); const restored = new FileFastExecutionLedger(file).list(); assert.equal(restored.length, 1); assert.equal(restored[0].cost, null); assert.equal(restored[0].filesRead, null); assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('real Spark runner reports and containment rejects an untracked out-of-scope file', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-spark-untracked-')); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  execFileSync('git', ['init', '-q', '-b', 'main'], {cwd: root}); execFileSync('git', ['config', 'user.email', 'test@example.invalid'], {cwd: root}); execFileSync('git', ['config', 'user.name', 'Agent Control Test'], {cwd: root});
  fs.mkdirSync(path.join(root, 'docs')); fs.writeFileSync(path.join(root, 'docs/guide.md'), 'guide\n'); execFileSync('git', ['add', '.'], {cwd: root}); execFileSync('git', ['commit', '-qm', 'fixture'], {cwd: root});
  const command = path.join(root, 'fake-codex.mjs');
  fs.writeFileSync(command, `#!/usr/bin/env node\nimport fs from 'node:fs';\nfs.writeFileSync('outside scope.txt', 'unauthorised\\n');\nconsole.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({status:'SUCCEEDED',summary:'done',confidence:.99,requestedMoreContext:false})}}));\nconsole.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}}));\n`); fs.chmodSync(command, 0o700); execFileSync('git', ['add', command], {cwd: root}); execFileSync('git', ['commit', '-qm', 'runner'], {cwd: root});
  const value = new FastExecutionCoordinator(registry(), available, new CodexFastExecutionRunner(root, command), {verify: async () => ({passed: true, evidence: ['must-not-run']})}, enabled);
  const outcome = await value.execute(request(), 'controller');
  assert.equal(outcome.telemetry.outcome, 'ESCALATED');
  assert.equal(outcome.telemetry.escalationReason, 'unapproved-file-touched');
  assert.deepEqual(outcome.result?.touchedFiles, ['outside scope.txt']);
});

test('real Spark runner detects mutation of valuable ignored state', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-spark-ignored-')); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  execFileSync('git', ['init', '-q', '-b', 'main'], {cwd: root}); execFileSync('git', ['config', 'user.email', 'test@example.invalid'], {cwd: root}); execFileSync('git', ['config', 'user.name', 'Agent Control Test'], {cwd: root});
  fs.mkdirSync(path.join(root, 'docs')); fs.writeFileSync(path.join(root, 'docs/guide.md'), 'guide\n'); fs.writeFileSync(path.join(root, '.gitignore'), 'operator.state\n'); execFileSync('git', ['add', '.'], {cwd: root}); execFileSync('git', ['commit', '-qm', 'fixture'], {cwd: root}); fs.writeFileSync(path.join(root, 'operator.state'), 'valuable\n');
  const command = path.join(root, 'fake-codex.mjs');
  fs.writeFileSync(command, `#!/usr/bin/env node\nimport fs from 'node:fs';\nfs.writeFileSync('operator.state', 'silently changed\\n');\nconsole.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({status:'SUCCEEDED',summary:'done',confidence:.99,requestedMoreContext:false})}}));\nconsole.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}}));\n`); fs.chmodSync(command, 0o700); execFileSync('git', ['add', '-f', command], {cwd: root}); execFileSync('git', ['commit', '-qm', 'runner'], {cwd: root});
  const outcome = await new FastExecutionCoordinator(registry(), available, new CodexFastExecutionRunner(root, command), {verify: async () => ({passed: true, evidence: ['must-not-run']})}, enabled).execute(request(), 'controller');
  assert.equal(outcome.telemetry.outcome, 'ESCALATED'); assert.equal(outcome.telemetry.escalationReason, 'unapproved-file-touched'); assert.deepEqual(outcome.result?.touchedFiles, ['operator.state']);
});

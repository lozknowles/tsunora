import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type {ExecutionRecipe} from './adaptive-harness.js';
import {ToolHandlerRegistry} from './harness-dispatch.js';
import {configureTokenAwareRepositoryTools, LocalCommandExecutor, type CommandExecutor, type CommandExecutionRequest} from './repository-search.js';
import {
  COMMAND_RESULT_SCHEMA,
  FileCommandResultStore,
  MemoryCommandResultStore,
  TokenAwareOutputService,
  createTokenAwareToolResultInterceptor,
  estimateTokens,
  type CommandResultStore,
  type CommandResultEnvelope,
  type OutputAuthorityScope,
} from './token-aware-output.js';

const fixedNow = '2026-08-27T10:00:00.000Z';
const scope: OutputAuthorityScope = {taskId: 'task-search', laneId: '1', workerId: 'worker-any', leaseGeneration: 3, ownershipGeneration: 7, jobId: 'job-search', providerId: 'provider-any', modelId: 'model-any'};
let handleNumber = 0;

function service(policy: Record<string, number> = {}, now: () => Date = () => new Date(fixedNow), store: CommandResultStore = new MemoryCommandResultStore()) {
  return new TokenAwareOutputService(store, {policy, now, handleFactory: kind => `${kind === 'ripgrep' ? 'search' : 'output'}:TEST-${++handleNumber}`});
}

function result(stdout: string, overrides: Partial<CommandResultEnvelope> = {}): CommandResultEnvelope {
  return {
    schema: COMMAND_RESULT_SCHEMA, command: 'rg', args: ['--json', '--', 'needle', '.'], cwd: '/workspace',
    stdout, stderr: '', exitCode: 0, startedAt: fixedNow, completedAt: '2026-08-27T10:00:01.000Z',
    backend: 'local', semantic: {adapter: 'ripgrep', query: 'needle'}, ...overrides,
  };
}

function matchEvent(file: string, line: number, text = `needle ${line}\n`, matches = 1, binary = false) {
  const encoded = (value: string) => binary ? {bytes: Buffer.from(value).toString('base64')} : {text: value};
  return JSON.stringify({type: 'match', data: {path: encoded(file), lines: encoded(text), line_number: line, submatches: Array.from({length: matches}, (_, index) => ({match: {text: 'needle'}, start: index * 2, end: index * 2 + 1}))}});
}

function contextEvent(file: string, line: number, text = `context ${line}\n`) {
  return JSON.stringify({type: 'context', data: {path: {text: file}, lines: {text}, line_number: line, submatches: []}});
}

function summaryEvent(searches: number) { return JSON.stringify({type: 'summary', data: {stats: {searches}}}); }
function rgStream(events: string[], searches = 1) { return `${events.join('\n')}\n${summaryEvent(searches)}\n`; }

function broadStream(files = 7, linesPerFile = 25) {
  const events: string[] = [];
  for (let file = 0; file < files; file++) for (let line = 1; line <= linesPerFile; line++) events.push(matchEvent(`src/file-${file}.ts`, line * 3));
  return rgStream(events, files + 4);
}

test('small ripgrep output passes through byte-for-byte as COMPLETE', () => {
  const stdout = rgStream([matchEvent('src/a.ts', 7, 'const needle = true;\n')]);
  const output = service().capture(result(stdout), scope);
  assert.equal(output.disposition, 'COMPLETE');
  assert.equal(output.level, 3);
  assert.equal(output.stdout, stdout);
});

test('an intercepted conventional rg -n result also passes through unchanged', () => {
  const stdout = 'src/a.ts:7:const needle = true;\n';
  const output = service().capture(result(stdout, {args: ['-n', 'needle', '.'], semantic: undefined}), scope);
  assert.equal(output.disposition, 'COMPLETE');
  assert.equal(output.stdout, stdout);
  assert.deepEqual(output.search?.files[0].lines, [7]);
});

test('large ripgrep output becomes a labelled match index', () => {
  const output = service().capture(result(broadStream()), scope);
  assert.equal(output.disposition, 'COMPACTED');
  assert.equal(output.level, 1);
  assert.equal(output.search?.filesSearched, 11);
  assert.match(output.stdout, /Compact representation shown/);
  assert.match(output.stdout, /Full result available as search:TEST-/);
  assert.doesNotMatch(output.stdout, /needle 75/);
});

test('very large structured indexes are bounded while omitted files remain in the artifact', () => {
  const stdout = broadStream(200, 1), outputService = service({indexMaxFiles: 40});
  const initial = outputService.capture(result(stdout), scope);
  assert.equal(initial.search?.files.length, 40);
  assert.equal(initial.search?.filesOmitted, 160);
  assert.equal(initial.search?.indexComplete, false);
  assert.equal(outputService.expand(initial.handle, {mode: 'all'}, scope).stdout, stdout);
});

test('structured ripgrep submatch counts remain exact', () => {
  const stdout = rgStream([matchEvent('src/a.ts', 7, 'needle and needle\n', 2), matchEvent('src/a.ts', 9)]);
  const output = service({completeMaxMatches: 0}).capture(result(stdout), scope);
  assert.equal(output.search?.totalMatches, 3);
  assert.equal(output.search?.files[0].matches, 3);
});

test('file paths with spaces and colons remain exact', () => {
  const file = 'src/folder with space/name:part.ts';
  const output = service({completeMaxMatches: 0}).capture(result(rgStream([matchEvent(file, 12)])), scope);
  assert.equal(output.search?.files[0].path, file);
  assert.ok(JSON.stringify(output.search).includes(file));
});

test('match line numbers remain sorted and deduplicated', () => {
  const stdout = rgStream([matchEvent('src/a.ts', 44), matchEvent('src/a.ts', 12), matchEvent('src/a.ts', 44, 'needle twice\n', 2)]);
  const output = service({completeMaxMatches: 0}).capture(result(stdout), scope);
  assert.deepEqual(output.search?.files[0].lines, [12, 44]);
  assert.match(output.stdout, /Structured match index included/);
});

test('selected match expansion returns only captured source and requested context', () => {
  const stdout = rgStream([contextEvent('src/a.ts', 9), matchEvent('src/a.ts', 10, 'needle here\n'), contextEvent('src/a.ts', 11), matchEvent('src/a.ts', 50)]);
  const outputService = service({completeMaxMatches: 0});
  const initial = outputService.capture(result(stdout), scope);
  const expanded = outputService.expand(initial.handle, {mode: 'match', file: 'src/a.ts', lines: [10], contextLines: 1}, scope);
  assert.match(expanded.stdout, /9-context 9/);
  assert.match(expanded.stdout, /10:needle here/);
  assert.match(expanded.stdout, /11-context 11/);
  assert.doesNotMatch(expanded.stdout, /50:/);
  assert.equal(expanded.level, 2);
});

test('file, files and range expansion operate on captured records', () => {
  const stdout = rgStream([matchEvent('a.ts', 3), matchEvent('a.ts', 9), matchEvent('b.ts', 5)]);
  const outputService = service({completeMaxMatches: 0});
  const initial = outputService.capture(result(stdout), scope);
  assert.match(outputService.expand(initial.handle, {mode: 'file', file: 'b.ts'}, scope).stdout, /5:needle 5/);
  const files = outputService.expand(initial.handle, {mode: 'files', files: ['a.ts', 'b.ts']}, scope).stdout;
  assert.match(files, /a\.ts/); assert.match(files, /b\.ts/);
  const range = outputService.expand(initial.handle, {mode: 'range', file: 'a.ts', startLine: 8, endLine: 10}, scope).stdout;
  assert.match(range, /9:needle 9/); assert.doesNotMatch(range, /3:/);
});

test('full expansion reproduces exact authoritative stdout', () => {
  const stdout = broadStream(3, 30), outputService = service(), initial = outputService.capture(result(stdout), scope);
  const expanded = outputService.expand(initial.handle, {mode: 'all'}, scope);
  assert.equal(expanded.stdout, stdout);
  assert.equal(expanded.disposition, 'COMPLETE');
  assert.equal(expanded.authoritative.stdoutSha256, initial.authoritative.stdoutSha256);
});

test('stderr remains exact when stdout is compacted', () => {
  const stderr = 'warning: first\nerror: final\n';
  const output = service().capture(result(broadStream(), {stderr}), scope);
  assert.equal(output.stderr, stderr);
  assert.match(output.notices.join(' '), /stderr is preserved/);
});

test('non-zero exit status is never hidden by compaction', () => {
  const output = service().capture(result(broadStream(), {exitCode: 2, stderr: 'regex parse error\n'}), scope);
  assert.equal(output.exitCode, 2);
  assert.match(output.stderr, /regex parse error/);
  assert.match(output.notices.join(' '), /Non-zero exit status preserved: 2/);
});

test('Unicode paths and source survive capture and expansion', () => {
  const file = 'src/naïve/東京.ts', text = 'const café = "needle 🧭";\n';
  const outputService = service({completeMaxMatches: 0});
  const initial = outputService.capture(result(rgStream([matchEvent(file, 8, text)])), scope);
  assert.equal(initial.search?.files[0].path, file);
  assert.match(outputService.expand(initial.handle, {mode: 'match', file, lines: [8]}, scope).stdout, /café = "needle 🧭"/);
  assert.equal(outputService.expand(initial.handle, {mode: 'all'}, scope).stdout, rgStream([matchEvent(file, 8, text)]));
});

test('very long source lines stay out of the index and remain retrievable', () => {
  const source = `needle-${'x'.repeat(100_000)}\n`, stdout = rgStream([matchEvent('long.ts', 1, source)]);
  const outputService = service({completeMaxMatches: 0});
  const initial = outputService.capture(result(stdout), scope);
  assert.ok(initial.stdout.length < 1_000);
  const expanded = outputService.expand(initial.handle, {mode: 'match', file: 'long.ts', lines: [1]}, scope);
  assert.match(expanded.stdout, new RegExp(`needle-${'x'.repeat(100)}`));
  assert.ok(expanded.stdout.length > 100_000);
});

test('binary ripgrep records expose safe metadata without decoding bytes into the index', () => {
  const stdout = rgStream([matchEvent('assets/blob.bin', 1, '\0needle\0\n', 1, true)]);
  const outputService = service({completeMaxMatches: 0});
  const initial = outputService.capture(result(stdout), scope);
  assert.equal(initial.search?.files[0].binary, true);
  const selected = outputService.expand(initial.handle, {mode: 'match', file: 'assets/blob.bin', lines: [1]}, scope);
  assert.match(selected.stdout, /binary data retained/);
  assert.equal(outputService.expand(initial.handle, {mode: 'all'}, scope).stdout, stdout);
});

test('result handles cannot select a path or line outside the authorised result', () => {
  const outputService = service({completeMaxMatches: 0}), initial = outputService.capture(result(rgStream([matchEvent('safe.ts', 4)])), scope);
  assert.throws(() => outputService.expand(initial.handle, {mode: 'file', file: '../secret'}, scope), /selector_outside_result/);
  assert.throws(() => outputService.expand(initial.handle, {mode: 'match', file: 'safe.ts', lines: [5]}, scope), /selector_outside_result/);
});

test('invalid and expired handles fail closed', () => {
  let clock = new Date(fixedNow);
  const outputService = service({retentionSeconds: 60}, () => clock);
  const initial = outputService.capture(result(rgStream([matchEvent('a.ts', 1)])), scope);
  assert.throws(() => outputService.expand('search:missing', {mode: 'all'}, scope), /output_handle_invalid/);
  clock = new Date('2026-08-27T10:01:00.000Z');
  assert.throws(() => outputService.expand(initial.handle, {mode: 'all'}, scope), /output_handle_expired/);
});

test('stale lease or ownership scope cannot expand a handle', () => {
  const outputService = service(), initial = outputService.capture(result(rgStream([matchEvent('a.ts', 1)])), scope);
  assert.throws(() => outputService.expand(initial.handle, {mode: 'all'}, {...scope, leaseGeneration: scope.leaseGeneration + 1}), /output_handle_scope_denied/);
  assert.throws(() => outputService.expand(initial.handle, {mode: 'all'}, {...scope, ownershipGeneration: scope.ownershipGeneration + 1}), /output_handle_scope_denied/);
});

test('local command cancellation is explicit and preserves captured output', async () => {
  const controller = new AbortController(), executor = new LocalCommandExecutor();
  const pending = executor.execute({command: process.execPath, args: ['-e', 'process.stdout.write("started\\n");setTimeout(()=>{},10000)'], cwd: process.cwd(), timeoutMs: 5_000, maxCaptureBytesPerStream: 10_000, signal: controller.signal});
  // Preserve the stronger assertion that pre-cancellation output survives, while
  // allowing slower process creation on Windows and loaded CI hosts.
  setTimeout(() => controller.abort(), 500);
  const captured = await pending;
  assert.equal(captured.cancelled, true);
  assert.equal(captured.exitCode, 130);
  assert.match(captured.stdout, /started/);
});

test('local command timeout is explicit and bounded', async () => {
  const captured = await new LocalCommandExecutor().execute({command: process.execPath, args: ['-e', 'setTimeout(()=>{},10000)'], cwd: process.cwd(), timeoutMs: 50, maxCaptureBytesPerStream: 10_000});
  assert.equal(captured.timedOut, true);
  assert.equal(captured.exitCode, 124);
});

test('remote command envelopes use the same central compaction and provenance path', async () => {
  class RemoteExecutor implements CommandExecutor { async execute(request: CommandExecutionRequest) { return result(broadStream(), {command: request.command, args: request.args, cwd: request.cwd, backend: 'ssh', nodeId: 'remote-capability-node'}); } }
  const outputService = service();
  const registry = new ToolHandlerRegistry();
  const authorised: string[] = [];
  configureTokenAwareRepositoryTools(registry, outputService, {workspace: {root: '/remote/repository-not-on-controller', authorizePath: value => { authorised.push(value); if (value !== '.') throw new Error('remote_workspace_scope_denied'); return value; }}, executor: new RemoteExecutor()});
  const output = await registry.invoke('repository.search.ripgrep', {query: 'needle'}, recipe(), {assertActive: () => undefined}) as {provenance: {backend: string; nodeId: string; cwd: string}; disposition: string};
  assert.equal(output.disposition, 'COMPACTED');
  assert.equal(output.provenance.backend, 'ssh');
  assert.equal(output.provenance.nodeId, 'remote-capability-node');
  assert.equal(output.provenance.cwd, '/remote/repository-not-on-controller');
  assert.deepEqual(authorised, ['.']);
  await assert.rejects(() => registry.invoke('repository.search.ripgrep', {query: 'needle', paths: ['../outside']}, recipe(), {assertActive: () => undefined}), /repository_search_path_invalid/);
});

test('generic oversized stdout uses labelled head-tail fallback with full recovery', () => {
  const stdout = Array.from({length: 300}, (_, index) => `generic line ${index + 1}`).join('\n') + '\n';
  const outputService = service(), initial = outputService.capture(result(stdout, {command: 'compiler', args: [], semantic: undefined}), scope);
  assert.equal(initial.disposition, 'COMPACTED');
  assert.match(initial.stdout, /lines omitted from this derived view/);
  assert.match(initial.stdout, /generic line 1/);
  assert.match(initial.stdout, /generic line 300/);
  assert.equal(outputService.expand(initial.handle, {mode: 'all'}, scope).stdout, stdout);
});

test('unrecognised ripgrep output uses the generic fallback instead of a false match index', () => {
  const stdout = Array.from({length: 300}, (_, index) => `src/file-${index + 1}.ts`).join('\n') + '\n';
  const outputService = service();
  const initial = outputService.capture(result(stdout, {args: ['--files'], semantic: undefined}), scope);
  assert.equal(initial.disposition, 'COMPACTED');
  assert.match(initial.handle, /^output:/);
  assert.equal(initial.search, undefined);
  assert.match(initial.stdout, /Oversized command stdout/);
  assert.doesNotMatch(initial.stdout, /Matches: 0/);
  assert.equal(outputService.expand(initial.handle, {mode: 'all'}, scope).stdout, stdout);
});

test('token estimates are deterministic and conservative across Unicode', () => {
  const value = 'ASCII and café 東京 🧭';
  const expected = Math.ceil(Buffer.byteLength(value, 'utf8') / 3);
  assert.equal(estimateTokens(value), expected);
  assert.equal(estimateTokens(value), estimateTokens(value));
});

test('derived output provenance links to authoritative result hash and execution identity', () => {
  const output = service().capture(result(broadStream(), {backend: 'managed-node', nodeId: 'worker-z'}), scope);
  assert.equal(output.provenance.derivedFrom, `artifact:sha256:${output.authoritative.sha256}`);
  assert.match(output.authoritative.sha256, /^[a-f0-9]{64}$/);
  assert.equal(output.provenance.scope.workerId, scope.workerId);
  assert.equal(output.provenance.backend, 'managed-node');
});

test('context budget compacts output that would otherwise pass configured size thresholds', () => {
  const stdout = Array.from({length: 30}, (_, index) => `budget line ${index} ${'x'.repeat(80)}`).join('\n');
  const output = service({completeMaxLines: 1000, completeMaxBytes: 1_000_000, completeMaxTokens: 1_000_000, minimumCompleteTokens: 10}).capture(result(stdout, {command: 'build', args: [], semantic: undefined, availableContextTokens: 500}), scope);
  assert.equal(output.disposition, 'COMPACTED');
});

test('very small output is not compacted solely because context is constrained', () => {
  const output = service().capture(result('ok\n', {command: 'build', args: [], semantic: undefined, availableContextTokens: 1}), scope);
  assert.equal(output.disposition, 'COMPLETE');
  assert.equal(output.stdout, 'ok\n');
});

test('artifact-only and truncated states are explicit and distinct', () => {
  const stdout = Array.from({length: 100}, (_, index) => `${index}-${'x'.repeat(200)}`).join('\n');
  const artifactOnly = service({artifactOnlyAboveReturnedTokens: 1, completeMaxLines: 0}).capture(result(stdout, {command: 'build', args: [], semantic: undefined}), scope);
  assert.equal(artifactOnly.disposition, 'ARTIFACT_ONLY');
  assert.equal(artifactOnly.authoritative.available, true);
  const truncated = service({maxCaptureBytesPerStream: 1024, completeMaxLines: 0}).capture(result(stdout, {command: 'build', args: [], semantic: undefined}), scope);
  assert.equal(truncated.disposition, 'TRUNCATED');
  assert.equal(truncated.authoritative.available, false);
});

test('file-backed result handles survive service restart without exposing storage paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-output-store-'));
  const first = service({completeMaxMatches: 0}, () => new Date(fixedNow), new FileCommandResultStore(root));
  const initial = first.capture(result(rgStream([matchEvent('persist.ts', 3)])), scope);
  const second = new TokenAwareOutputService(new FileCommandResultStore(root), {now: () => new Date(fixedNow)});
  assert.equal(second.expand(initial.handle, {mode: 'all'}, scope).stdout, result(rgStream([matchEvent('persist.ts', 3)])).stdout);
  assert.equal('storageRef' in second.list()[0], false);
  assert.match(fs.readFileSync(path.join(root, 'index.json'), 'utf8'), /search:TEST-/);
});

test('file-backed authoritative result tampering fails checksum verification', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-output-tamper-'));
  const outputService = service({}, () => new Date(fixedNow), new FileCommandResultStore(root));
  const initial = outputService.capture(result(rgStream([matchEvent('safe.ts', 1)])), scope);
  const index = JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8')) as {records: Array<{file: string}>};
  const objectFile = path.join(root, 'objects', index.records[0].file), stored = JSON.parse(fs.readFileSync(objectFile, 'utf8'));
  stored.result.stdout = 'tampered\n';
  fs.writeFileSync(objectFile, JSON.stringify(stored));
  const restarted = new TokenAwareOutputService(new FileCommandResultStore(root), {now: () => new Date(fixedNow)});
  assert.throws(() => restarted.expand(initial.handle, {mode: 'all'}, scope), /output_artifact_checksum_mismatch/);
});

test('tool interception stays compatible for non-command results', async () => {
  const outputService = service();
  const registry = new ToolHandlerRegistry([createTokenAwareToolResultInterceptor(outputService)]).register('repository.metadata', async () => ({files: 7}));
  assert.deepEqual(await registry.invoke('repository.metadata', {}, recipe(), {assertActive: () => undefined}), {files: 7});
  assert.equal(outputService.metrics().commandsObserved, 0);
});

test('search and expansion are first-class allowlisted tool operations', async () => {
  class FixtureExecutor implements CommandExecutor { async execute(request: CommandExecutionRequest) { return result(broadStream(2, 30), {command: request.command, args: request.args, cwd: request.cwd}); } }
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-tools-search-'));
  const outputService = service(), registry = new ToolHandlerRegistry();
  configureTokenAwareRepositoryTools(registry, outputService, {workspaceRoot: workspace, executor: new FixtureExecutor()});
  const initial = await registry.invoke('repository.search.ripgrep', {query: 'needle'}, recipe(), {assertActive: () => undefined}) as {handle: string; disposition: string};
  assert.equal(initial.disposition, 'COMPACTED');
  const expanded = await registry.invoke('command.output.expand', {handle: initial.handle, mode: 'all'}, recipe(), {assertActive: () => undefined}) as {stdout: string; disposition: string};
  assert.equal(expanded.disposition, 'COMPLETE');
  assert.equal(expanded.stdout, broadStream(2, 30));
});

test('metrics account for initial savings and subsequent expansion cost', () => {
  const outputService = service(), initial = outputService.capture(result(broadStream()), scope);
  const before = outputService.metrics();
  assert.equal(before.commandsCompacted, 1);
  assert.ok(before.contextTokensAvoided > 0);
  outputService.expand(initial.handle, {mode: 'match', file: 'src/file-0.ts', lines: [3]}, scope);
  const selected = outputService.metrics();
  assert.equal(selected.expansionRequests, 1);
  assert.ok(selected.contextTokensAvoided < before.contextTokensAvoided);
  outputService.expand(initial.handle, {mode: 'all'}, scope);
  const after = outputService.metrics();
  assert.equal(after.fullResultRequests, 1);
  assert.equal(after.contextTokensAvoided, 0);
});

function recipe(): ExecutionRecipe {
  return {
    id: 'recipe-test', taskId: scope.taskId, workerId: scope.workerId, providerId: scope.providerId!, modelId: scope.modelId!,
    promptProfile: {id: 'test', version: '1', description: 'test'}, context: {tier: 1, sourceIds: [], evidenceIds: [], estimatedTokens: 0},
    skills: [], tools: [], runtime: {}, authority: {laneId: scope.laneId, leaseGeneration: scope.leaseGeneration, ownershipGeneration: scope.ownershipGeneration, owner: 'agent'},
    resourceLimits: {}, verification: {requiredEvidence: [], requireIndependentCheck: false}, escalation: {minimumConfidence: .5, maximumAttempts: 1, onFailure: 'review'}, routeReason: 'test', fingerprint: 'test',
  };
}

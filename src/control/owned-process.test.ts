import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type {ChildProcess} from 'node:child_process';
import {OwnedProcessManager, processTerminationAdapterFor, type OwnedProcessIdentity, type ProcessTerminationAdapter} from './owned-process.js';
import {ExecutionSessionRuntime, type ExecutionSessionScope} from './execution-session.js';

test('missing executable rejects with ENOENT without an unhandled process error or tracked PID', async () => {
  const manager = new OwnedProcessManager();
  await assert.rejects(manager.runProcess({command: path.join(os.tmpdir(), 'agent-control-absent-executable-' + process.pid), args: []}), {code: 'ENOENT'});
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(manager.activePids(), []);
});

class FixtureTerminationAdapter implements ProcessTerminationAdapter {
  readonly platform = 'win32' as const;
  constructor(private readonly outcome: 'confirmed' | 'uncertain' | 'identity-mismatch' | 'failed') {}
  async capture(pid: number): Promise<OwnedProcessIdentity> { return {pid, platform: this.platform, startedAtToken: 'fixture-creation-time', capturedAt: new Date().toISOString()}; }
  async terminate(identity: OwnedProcessIdentity, child: ChildProcess, reason: string) {
    child.kill('SIGKILL');
    return {identity, outcome: this.outcome, reason, signals: ['fixture-tree-kill'], requestedAt: new Date().toISOString(), verifiedAt: new Date().toISOString(), detail: this.outcome === 'confirmed' ? 'captured_tree_absent' : 'captured_tree_not_proven'};
  }
}

class DelayedCaptureTerminationAdapter implements ProcessTerminationAdapter {
  readonly platform = 'win32' as const;
  readonly captureStarted: Promise<void>;
  terminated = false;
  private markCaptureStarted!: () => void;
  private releaseCapture!: () => void;
  private readonly captureGate: Promise<void>;
  constructor() {
    this.captureStarted = new Promise(resolve => { this.markCaptureStarted = resolve; });
    this.captureGate = new Promise(resolve => { this.releaseCapture = resolve; });
  }
  finishCapture() { this.releaseCapture(); }
  async capture(pid: number): Promise<OwnedProcessIdentity> { this.markCaptureStarted(); await this.captureGate; return {pid, platform: this.platform, startedAtToken: 'fixture-delayed-creation-time', capturedAt: new Date().toISOString()}; }
  async terminate(identity: OwnedProcessIdentity, child: ChildProcess, reason: string) {
    this.terminated = true; child.kill('SIGKILL');
    return {identity, outcome: 'confirmed' as const, reason, signals: ['fixture-tree-kill'], requestedAt: new Date().toISOString(), verifiedAt: new Date().toISOString(), detail: 'captured_tree_absent'};
  }
}

test('Android selects the procfs-backed process-group termination adapter', async () => {
  const adapter = processTerminationAdapterFor('android'), identity = await adapter.capture(process.pid);
  assert.equal(adapter.platform, 'android');
  assert.equal(identity.platform, 'android');
  assert.ok(identity.startedAtToken);
});

test('platform termination adapter reports confirmed tree cleanup without requiring Windows', async () => {
  const manager = new OwnedProcessManager(new FixtureTerminationAdapter('confirmed')), controller = new AbortController();
  const running = manager.runProcess({command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)']}, controller.signal);
  while (!manager.activePids().length) await new Promise(resolve => setImmediate(resolve));
  controller.abort('fixture_timeout'); const report = await manager.terminateAll('fixture_timeout');
  assert.equal(report.outcome, 'confirmed'); assert.equal(report.processes[0].identity.platform, 'win32'); assert.equal(report.processes[0].signals[0], 'fixture-tree-kill');
  await assert.rejects(running, /fixture_timeout/);
});

test('cleanup uncertainty and PID identity mismatch remain explicit', async () => {
  for (const outcome of ['uncertain', 'identity-mismatch'] as const) {
    const manager = new OwnedProcessManager(new FixtureTerminationAdapter(outcome)), controller = new AbortController();
    const running = manager.runProcess({command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)']}, controller.signal);
    while (!manager.activePids().length) await new Promise(resolve => setImmediate(resolve));
    controller.abort(`fixture_${outcome}`); const report = await manager.terminateAll(`fixture_${outcome}`);
    assert.equal(report.outcome, outcome); assert.match(report.processes[0].detail ?? '', /not_proven/);
    await assert.rejects(running);
  }
});

test('cancellation during asynchronous process identity capture remains handled and cleans up', async () => {
  const adapter = new DelayedCaptureTerminationAdapter(), manager = new OwnedProcessManager(adapter), controller = new AbortController();
  const running = manager.runProcess({command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)']}, controller.signal);
  await adapter.captureStarted; controller.abort('cancelled_during_identity_capture'); adapter.finishCapture();
  await assert.rejects(running, /cancelled_during_identity_capture/);
  assert.equal(adapter.terminated, true); assert.deepEqual(manager.activePids(), []);
});

test('Linux PTY adapter exposes the genuine TTY byte stream and governed intervention to the same process', {skip: process.platform !== 'linux'}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-owned-pty-')); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const sessions = new ExecutionSessionRuntime(path.join(root, 'sessions')), scope: ExecutionSessionScope = {runId: 'run:pty', jobId: 'pty-job', jobVersion: '1.0.0', stepId: 'interactive-test', actionId: 'repository.interactive-test@1.0.0', workerId: 'worker:pty', nodeId: 'controller', parcelId: 'parcel:pty', crewRole: 'quality-inspector'};
  const manager = new OwnedProcessManager(undefined, sessions, scope), secret = `nvapi-human-${'q'.repeat(24)}`;
  const source = [
    "process.stdout.write(`TTY=${Boolean(process.stdin.isTTY)}\\nREADY_FOR_OPERATOR\\n`)",
    "process.stdin.once('data',()=>{process.stdout.write('INTERVENTION_ACCEPTED\\n');setTimeout(()=>process.exit(0),25)})",
    "setTimeout(()=>{process.stderr.write('operator input timeout\\n');process.exit(7)},5000)",
  ].join(';');
  const running = manager.runProcess({command: process.execPath, args: ['-e', source], cwd: root, session: {terminal: 'pty', interactiveInput: true, allowSignals: true, commandLabel: 'bounded interactive repository test', crewRole: 'quality-inspector'}});
  await waitFor(() => manager.sessionIds().length === 1); const id = manager.sessionIds()[0];
  await waitFor(() => sessions.events(id).some(event => event.text?.includes('READY_FOR_OPERATOR')));
  const watch = await sessions.attach(id, 'WATCH', {actorId: 'human:watcher', roles: ['operator']});
  await assert.rejects(sessions.input(id, watch.id, 'cannot-write\n', {actorId: 'human:watcher', roles: ['operator']}), /execution_session_watch_read_only/);
  const intervention = await sessions.attach(id, 'INTERVENE', {actorId: 'human:operator', roles: ['operator']});
  await sessions.input(id, intervention.id, `${secret}\n`, {actorId: 'human:operator', roles: ['operator']}, true);
  const result = await running, transcript = sessions.transcript(id);
  assert.equal(result.exitCode, 0); assert.match(result.stdout, /TTY=true/); assert.match(result.stdout, /INTERVENTION_ACCEPTED/); assert.equal(result.stdout.includes(secret), false);
  assert.equal(sessions.get(id).adapterId, 'linux-util-linux-pty'); assert.equal(sessions.get(id).capabilities.terminal, 'pty'); assert.equal(sessions.get(id).state, 'EXITED');
  assert.match(transcript, /READY_FOR_OPERATOR/); assert.match(transcript, /human\.input/); assert.match(transcript, /INTERVENTION_ACCEPTED/); assert.equal(transcript.includes(secret), false); assert.match(transcript, /REDACTED/);
});

test('concurrent execution sessions preserve process, output and input isolation', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-owned-concurrent-')); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const sessions = new ExecutionSessionRuntime(path.join(root, 'sessions'));
  const run = (name: string) => {
    const manager = new OwnedProcessManager(undefined, sessions, {runId: `run:${name}`, jobId: 'concurrent-job', jobVersion: '1.0.0', stepId: name, actionId: 'concurrent@1.0.0', workerId: `worker:${name}`, nodeId: 'controller', parcelId: 'parcel:concurrent', crewRole: name === 'quill' ? 'parcel-coordinator' : 'quality-inspector'});
    const source = `process.stdout.write('${name}:READY\\n');process.stdin.once('data',value=>{process.stdout.write('${name}:GOT:'+value);process.exit(0)});setTimeout(()=>process.exit(8),5000)`;
    return {manager, result: manager.runProcess({command: process.execPath, args: ['-e', source], session: {interactiveInput: true}})};
  };
  const quill = run('quill'), rook = run('rook'); await waitFor(() => quill.manager.sessionIds().length === 1 && rook.manager.sessionIds().length === 1);
  const quillId = quill.manager.sessionIds()[0], rookId = rook.manager.sessionIds()[0];
  const quillAttachment = await sessions.attach(quillId, 'INTERVENE', {actorId: 'human:quill', roles: ['operator']}), rookAttachment = await sessions.attach(rookId, 'INTERVENE', {actorId: 'human:rook', roles: ['operator']});
  await Promise.all([sessions.input(quillId, quillAttachment.id, 'ONLY_QUILL\n', {actorId: 'human:quill', roles: ['operator']}), sessions.input(rookId, rookAttachment.id, 'ONLY_ROOK\n', {actorId: 'human:rook', roles: ['operator']})]);
  await Promise.all([quill.result, rook.result]); const quillTranscript = sessions.transcript(quillId), rookTranscript = sessions.transcript(rookId);
  assert.match(quillTranscript, /quill:GOT:ONLY_QUILL/); assert.doesNotMatch(quillTranscript, /rook:|ONLY_ROOK/); assert.match(rookTranscript, /rook:GOT:ONLY_ROOK/); assert.doesNotMatch(rookTranscript, /quill:|ONLY_QUILL/);
});

test('protected-resource WATCH_ONLY scope suppresses requested intervention and closes stdin', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-control-owned-protected-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const sessions=new ExecutionSessionRuntime(path.join(root,'sessions')),manager=new OwnedProcessManager(undefined,sessions,{runId:'run:protected',jobId:'protected-job',jobVersion:'1.0.0',stepId:'mutate',actionId:'protected.mutation@1.0.0',workerId:'worker:guardian',nodeId:'controller',interactionPolicy:'WATCH_ONLY'});
  const source="process.stdin.on('end',()=>{process.stdout.write('STDIN_CLOSED_BY_POLICY\\n');process.exit(0)});process.stdin.resume()";
  const running=manager.runProcess({command:process.execPath,args:['-e',source],cwd:root,session:{terminal:'pipe',interactiveInput:true,allowSignals:true,commandLabel:'protected resource operation'}});
  await waitFor(()=>manager.sessionIds().length===1);const id=manager.sessionIds()[0],record=sessions.get(id);
  assert.equal(record.scope.interactionPolicy,'WATCH_ONLY');assert.equal(record.capabilities.interactiveInput,false);assert.equal(record.capabilities.modes.intervene,false);assert.deepEqual(record.capabilities.signals,[]);assert.match(record.capabilities.limitations.join(' '),/intervention is policy-forbidden/);
  await assert.rejects(sessions.attach(id,'INTERVENE',{actorId:'human:operator',roles:['operator']}),/execution_session_mode_unsupported/);
  const result=await running;assert.equal(result.exitCode,0);assert.match(result.stdout,/STDIN_CLOSED_BY_POLICY/);
});

async function waitFor(predicate: () => boolean, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) { if (Date.now() >= deadline) throw new Error('fixture_wait_timeout'); await new Promise(resolve => setTimeout(resolve, 10)); }
}

for (const exitCode of [0, 7]) test('owned process drains inherited output before sealing exit ' + exitCode, {timeout: 10000}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'owned-output-drain-')); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const sessions = new ExecutionSessionRuntime(path.join(root, 'sessions'));
  const scope: ExecutionSessionScope = {runId: 'drain-run', jobId: 'drain-job', jobVersion: '1.0.0', stepId: 'drain', actionId: 'drain@1.0.0', workerId: 'drain-worker', nodeId: 'controller'};
  const manager = new OwnedProcessManager(undefined, sessions, scope), lines: string[] = [];
  const tail = "setTimeout(() => { process.stdout.write('late stdout'); process.stderr.write('late stderr'); }, 120)";
  const source = "require('node:child_process').spawn(process.execPath, ['-e', " + JSON.stringify(tail) + "], {stdio: ['ignore', process.stdout, process.stderr]}); process.stdout.write(" + JSON.stringify('early' + String.fromCharCode(10)) + "); process.exit(" + exitCode + ")";
  const result = await manager.runProcess({command: process.execPath, args: ['-e', source], onStdoutLine: line => lines.push(line), session: {terminal: 'pipe', transformOutputLine: (_stream, line) => line}});
  assert.equal(result.exitCode, exitCode);
  assert.equal(result.stdout, 'early\nlate stdout'); assert.equal(result.stderr, 'late stderr');
  assert.deepEqual(lines, ['early', 'late stdout']); assert.deepEqual(manager.activePids(), []);
  const id = manager.sessionIds()[0], transcript = sessions.transcript(id);
  assert.match(transcript, /late stdout/); assert.match(transcript, /late stderr/);
  const restarted = new ExecutionSessionRuntime(path.join(root, 'sessions'));
  assert.equal(restarted.transcript(id), transcript);
  assert.equal(restarted.get(id).state, exitCode === 0 ? 'EXITED' : 'FAILED');
});

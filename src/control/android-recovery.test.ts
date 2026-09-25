import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {AndroidRecovery, type AndroidExec} from './android-recovery.js';
import {startJobScheduler} from './job-bootstrap.js';
import {JobCatalog} from './job-catalog.js';
import {ActionRegistry, ArtifactStore, JobRuntime, ResourceLockManager, RunLedger, WorkerRegistry} from './job-runtime.js';

const resource = {
  id: 'android-fixture', platform: 'android' as const, transport: {type: 'ssh' as const, host: 'android.example', user: 'mobile'}, capabilities: ['platform.android'],
  android: {localHealthUrl: 'http://127.0.0.1:19088/health', remoteHealthUrl: 'http://127.0.0.1:19089/health', remoteDirectory: '~/agent-control', startCommand: './android/start-node.sh'},
};
const result = (status: number) => ({status, stdout: '', stderr: ''});
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean, timeoutMs = 1_000) { const end = Date.now() + timeoutMs; while (!predicate()) { if (Date.now() > end) throw new Error('condition_timeout'); await delay(5); } }

test('slow Android recovery yields to the control event loop', async () => {
  let calls = 0, settled = false, controlTick = false;
  const exec: AndroidExec = async (command, args) => { await delay(15); calls++; if (command === 'ssh' && args.at(-1) === 'echo AGENT-CONTROL-TRANSPORT-READY') return result(0); if (command === 'curl' && calls > 5) return result(0); return result(1); };
  const recovery = new AndroidRecovery(resource, 'fixture-token', true, undefined, exec, async () => { await delay(15); });
  const pending = recovery.recover().then(value => { settled = true; return value; });
  await new Promise<void>(resolve => setImmediate(() => { controlTick = true; resolve(); }));
  assert.equal(controlTick, true); assert.equal(settled, false);
  assert.equal((await pending).state, 'capability-ready');
});

test('an independent Job dispatches while Android recovery is waiting', async () => {
  let recoverySettled = false, calls = 0;
  const exec: AndroidExec = async (command, args) => { await delay(25); calls++; if (command === 'ssh' && args.at(-1) === 'echo AGENT-CONTROL-TRANSPORT-READY') return result(0); if (command === 'curl' && calls > 6) return result(0); return result(1); };
  const recovery = new AndroidRecovery(resource, 'fixture-token', true, undefined, exec, async () => { await delay(25); });
  const pendingRecovery = recovery.recover().then(value => { recoverySettled = true; return value; });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-android-responsive-')), action = 'responsive@1.0.0', actions = new ActionRegistry().register(action, async () => ({})), catalog = new JobCatalog(actions.ids());
  catalog.addJob({apiVersion: 'agent-control/v1', kind: 'Job', metadata: {id: 'responsive', name: 'responsive', version: '1.0.0'}, spec: {priority: 'normal', concurrency: 'allow', steps: [{id: 'run', action, requires: ['fixture']}]}});
  const workers = new WorkerRegistry().register({id: 'worker', capabilities: ['fixture'], health: 'healthy', capacity: 1, active: 0, observedAt: new Date().toISOString()});
  const runtime = Object.assign(new JobRuntime(catalog, actions, workers, new RunLedger(path.join(root, 'ledger.json')), new ArtifactStore(path.join(root, 'artifacts')), new ResourceLockManager(path.join(root, 'locks.json'))), {workParcels: {async tick() { return undefined; }}});
  const run = runtime.createRun('responsive@1.0.0', {}, {type: 'manual', actor: 'test'}), stop = startJobScheduler(runtime as never, undefined, 5, error => { throw error; });
  try { await until(() => runtime.ledger.get(run.id)?.status === 'SUCCEEDED'); assert.equal(recoverySettled, false); assert.equal((await pendingRecovery).recovered, true); }
  finally { stop(); fs.rmSync(root, {recursive: true, force: true}); }
});

test('total recovery timeout aborts an outstanding async command and returns a bounded failure', async () => {
  let active = 0, aborted = false;
  const exec: AndroidExec = async (_command, _args, _timeout, _input, signal) => new Promise((resolve, reject) => {
    active++;
    const abort = () => { active--; aborted = true; reject(signal?.reason ?? new Error('aborted')); };
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, {once: true});
    void resolve;
  });
  const started = Date.now(), state = await new AndroidRecovery(resource, 'fixture-token', true, undefined, exec, undefined, 40).recover();
  assert.equal(state.state, 'recovery-failed'); assert.match(state.detail, /android_recovery_timeout:40ms/); assert.equal(aborted, true); assert.equal(active, 0); assert.ok(Date.now() - started < 500);
});

test('external cancellation is propagated without leaving an injected command active', async () => {
  let active = 0;
  const exec: AndroidExec = async (_command, _args, _timeout, _input, signal) => new Promise((_resolve, reject) => {
    active++;
    signal?.addEventListener('abort', () => { active--; reject(signal.reason); }, {once: true});
  });
  const controller = new AbortController(), recovery = new AndroidRecovery(resource, 'fixture-token', true, undefined, exec);
  const pending = recovery.recover(controller.signal); await delay(10); controller.abort(new Error('operator_cancelled'));
  const state = await pending; assert.equal(state.state, 'recovery-failed'); assert.match(state.detail, /operator_cancelled/); assert.equal(active, 0);
  let responsive = false; await new Promise<void>(resolve => setImmediate(() => { responsive = true; resolve(); })); assert.equal(responsive, true);
});

test('recovery credential is passed through stdin and never placed in process arguments', async () => {
  const secret = 'token-with-sensitive-material', encoded = Buffer.from(secret).toString('base64'), calls: Array<{args: string[]; input?: string}> = [];
  let localCalls = 0;
  const exec: AndroidExec = async (command, args, _timeout, input) => {
    calls.push({args: [...args], input});
    if (command === 'curl') { localCalls++; return result(localCalls > 1 ? 0 : 1); }
    if (args.at(-1) === 'echo AGENT-CONTROL-TRANSPORT-READY') return result(0);
    return result(args.at(-1) === 'sh -s' ? 0 : 1);
  };
  const state = await new AndroidRecovery(resource, secret, true, undefined, exec, async () => undefined).recover();
  assert.equal(state.state, 'capability-ready');
  const processArguments = JSON.stringify(calls.map(call => call.args));
  assert.equal(processArguments.includes(secret), false); assert.equal(processArguments.includes(encoded), false);
  const script = calls.find(call => call.args.at(-1) === 'sh -s')?.input ?? '';
  assert.equal(script.includes(secret), false); assert.equal(script.includes(encoded), true);
});

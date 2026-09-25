import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {execFileSync, spawn, type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {AddressInfo} from 'node:net';
import {AgentControlService} from '../src/control/application-service.js';
import {JobCatalog} from '../src/control/job-catalog.js';
import {ActionRegistry, ArtifactStore, JobRuntime, ResourceLockManager, RunLedger, WorkerRegistry} from '../src/control/job-runtime.js';
import type {JobDefinition, RunRecord} from '../src/control/job-types.js';
import {defaultProcessTerminationAdapter, OwnedProcessManager, type ExecutionCleanupReport, type OwnedProcessIdentity, type ProcessCleanupResult, type ProcessTerminationAdapter} from '../src/control/owned-process.js';
import {PtyRegistry} from '../src/control/pty.js';
import {startWebDashboard} from '../src/control/web-server.js';
import {WorkParcelCoordinator, WorkParcelStore} from '../src/control/work-parcels.js';
import type {WorkspaceState} from '../src/state.js';

interface Options {stateDir: string; evidenceFile: string; host: string; port: number; holdMs: number; nodeId: string; allowedOrigin?: string}
interface ProcessObservation {role: 'root' | 'child' | 'grandchild'; pid: number}

const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
const timestamp = () => new Date().toISOString();
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function parseOptions(): Options {
  const values = new Map<string, string>();
  for (let index = 2; index < process.argv.length; index += 2) {
    const name = process.argv[index], value = process.argv[index + 1];
    if (!name?.startsWith('--') || value === undefined) throw new Error(`qualification_argument_invalid:${name ?? 'missing'}`);
    values.set(name.slice(2), value);
  }
  const stateDir = path.resolve(values.get('state-dir') ?? path.join(os.tmpdir(), `agent-control-windows-cleanup-${randomUUID()}`));
  const nodeId = values.get('node-id') ?? 'windows-qualification-node'; if (!/^[a-z0-9][a-z0-9._-]*$/i.test(nodeId)) throw new Error('qualification_node_id_invalid');
  const allowedOrigin = values.get('allowed-origin');
  if (allowedOrigin && !/^http:\/\/(?:127\.0\.0\.1|localhost):[1-9][0-9]{0,4}$/.test(allowedOrigin)) throw new Error('qualification_allowed_origin_invalid');
  return {stateDir, evidenceFile: path.resolve(values.get('evidence-file') ?? path.join(stateDir, 'windows-cleanup.json')), host: values.get('host') ?? '127.0.0.1', port: Number(values.get('port') ?? 4391), holdMs: Number(values.get('hold-ms') ?? 3_000), nodeId, ...(allowedOrigin ? {allowedOrigin} : {})};
}

function treeSource() {
  const grandchild = "console.log(JSON.stringify({role:'grandchild',pid:process.pid}));setInterval(()=>{},1000)";
  const child = `const {spawn}=require('node:child_process');console.log(JSON.stringify({role:'child',pid:process.pid}));const grandchild=spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:['ignore','inherit','ignore'],windowsHide:true});if(!grandchild.pid)process.exit(2);setInterval(()=>{},1000)`;
  return `const {spawn}=require('node:child_process');console.log(JSON.stringify({role:'root',pid:process.pid}));const child=spawn(process.execPath,['-e',${JSON.stringify(child)}],{stdio:['ignore','inherit','ignore'],windowsHide:true});if(!child.pid)process.exit(2);setInterval(()=>{},1000)`;
}

function processAlive(pid: number) { try { process.kill(pid, 0); return true; } catch { return false; } }
async function waitFor<T>(read: () => T | undefined | false, timeoutMs: number, description: string): Promise<T> { const deadline = Date.now() + timeoutMs; do { const value = read(); if (value) return value; await delay(50); } while (Date.now() < deadline); throw new Error(`qualification_timeout:${description}`); }
async function waitForExit(pids: number[], timeoutMs = 5_000) { const deadline = Date.now() + timeoutMs; while (Date.now() < deadline && pids.some(processAlive)) await delay(50); return pids.every(pid => !processAlive(pid)); }

class DelayedTerminationAdapter implements ProcessTerminationAdapter {
  readonly platform;
  constructor(private readonly actual: ProcessTerminationAdapter, private readonly delayMs: number) { this.platform = actual.platform; }
  capture(pid: number) { return this.actual.capture(pid); }
  async terminate(identity: OwnedProcessIdentity, child: ChildProcess, reason: string) { await delay(this.delayMs); return this.actual.terminate(identity, child, reason); }
}

class ProofLossTerminationAdapter implements ProcessTerminationAdapter {
  readonly platform;
  readonly physicalResults: ProcessCleanupResult[] = [];
  constructor(private readonly actual: ProcessTerminationAdapter) { this.platform = actual.platform; }
  capture(pid: number) { return this.actual.capture(pid); }
  async terminate(identity: OwnedProcessIdentity, child: ChildProcess, reason: string): Promise<ProcessCleanupResult> {
    const physical = await this.actual.terminate(identity, child, reason); this.physicalResults.push(structuredClone(physical));
    return {...physical, outcome: 'uncertain', detail: 'qualification_injected_cleanup_confirmation_loss'};
  }
}

function definition(id: string, timeoutSeconds?: number): JobDefinition {
  return {apiVersion: 'agent-control/v1', kind: 'Job', metadata: {id, name: id.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join(' '), version: '1.0.0', description: 'Bounded Windows owned-process-tree cleanup qualification'}, spec: {priority: 'high', concurrency: 'allow', steps: [{id: 'owned-tree', action: 'qualification.windows-owned-tree@1.0.0', requires: ['qualification.windows-process'], resources: ['qualification/windows-owned-slot'], ...(timeoutSeconds ? {timeoutSeconds} : {})}]}};
}

function safeCleanup(report: ExecutionCleanupReport | undefined) {
  if (!report) return null;
  return {outcome: report.outcome, reason: report.reason, requestedAt: report.requestedAt, completedAt: report.completedAt, processes: report.processes.map(item => ({platform: item.identity.platform, identityCaptured: item.identity.startedAtToken !== null, identityTokenSha256: item.identity.startedAtToken ? sha256(item.identity.startedAtToken) : null, capturedAt: item.identity.capturedAt, outcome: item.outcome, reason: item.reason, signals: item.signals, requestedAt: item.requestedAt, verifiedAt: item.verifiedAt, detail: item.detail ?? null}))};
}

async function main() {
  if (process.platform !== 'win32') throw new Error('windows_physical_qualification_requires_win32');
  const options = parseOptions(), startedAt = timestamp(), actual = defaultProcessTerminationAdapter();
  assert.equal(actual.platform, 'win32');
  fs.mkdirSync(options.stateDir, {recursive: true});
  const observations = new Map<string, ProcessObservation[]>(), snapshots: Array<{at: string; runId: string; status: string; stepStatus: string; workerActive: number; lockHeld: boolean}> = [];
  const actions = new ActionRegistry().register('qualification.windows-owned-tree@1.0.0', async context => {
    const values: ProcessObservation[] = []; observations.set(context.run.id, values);
    await context.ownedExecution.runProcess({command: process.execPath, args: ['-e', treeSource()], maxOutputBytes: 16_384, onStdoutLine: line => { try { const value = JSON.parse(line) as ProcessObservation; if (['root','child','grandchild'].includes(value.role) && Number.isSafeInteger(value.pid)) values.push(value); } catch {} }}, context.signal);
    return {};
  });
  const catalog = new JobCatalog(actions.ids());
  for (const item of [definition('windows-operator-cancellation'), definition('windows-timeout-cleanup', 2), definition('windows-cleanup-uncertainty')]) catalog.addJob(item);
  const workers = new WorkerRegistry().register({id: 'windows-native', capabilities: ['qualification.windows-process'], health: 'healthy', capacity: 1, active: 0, observedAt: startedAt});
  const ledger = new RunLedger(path.join(options.stateDir, 'runs.json')), locks = new ResourceLockManager(path.join(options.stateDir, 'locks.json')), artifacts = new ArtifactStore(path.join(options.stateDir, 'artifacts'));
  const delayed = new DelayedTerminationAdapter(actual, 5_000), proofLoss = new ProofLossTerminationAdapter(actual); let adapter: ProcessTerminationAdapter = delayed;
  const runtime = new JobRuntime(catalog, actions, workers, ledger, artifacts, locks, {approval: () => true, ownedExecutionFactory: () => new OwnedProcessManager(adapter)});
  const workParcels = new WorkParcelCoordinator(runtime, new WorkParcelStore(path.join(options.stateDir, 'work-parcels.json')), {plan: () => { throw new Error('qualification_planner_not_configured'); }});
  const workspace: WorkspaceState = {version: 1, paused: false, lastRestorePoint: null, lanes: []};
  const control = new AgentControlService(workspace, new PtyRegistry(), undefined, '3.9.0-windows-qualification', () => {}).configureProjection({jobRuntime: runtime, workParcels, resources: [{id: 'windows-native', name: 'Native Windows qualification', platform: 'windows', transport: 'local-governed-runtime', capabilities: ['qualification.windows-process']}]});
  const operatorToken = randomUUID(), server = startWebDashboard(control, {host: options.host, port: options.port, operatorToken, ...(options.allowedOrigin ? {allowedOrigins: [options.allowedOrigin]} : {}), assetsDir: path.resolve('assets/dashboard')});
  await once(server, 'listening'); const address = server.address() as AddressInfo;
  const monitor = setInterval(() => { for (const run of ledger.list()) { const current = {at: timestamp(), runId: run.id, status: run.status, stepStatus: run.steps[0].status, workerActive: workers.list()[0].active, lockHeld: locks.list().some(lock => lock.runId === run.id)}, prior = snapshots.at(-1); if (!prior || JSON.stringify({...prior, at: undefined}) !== JSON.stringify({...current, at: undefined})) { snapshots.push(current); control.events.emit('job.run_changed', {runId: run.id, status: run.status, stepStatus: run.steps[0].status}, undefined, 'windows-qualification'); } } }, 75);
  let unrelated: ChildProcess | undefined, unrelatedIdentity: OwnedProcessIdentity | undefined;
  try {
    process.stdout.write(`${JSON.stringify({phase: 'DASHBOARD_READY', port: address.port, operatorToken, at: timestamp()})}\n`);
    unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {windowsHide: true, stdio: 'ignore'}); if (!unrelated.pid) throw new Error('unrelated_control_pid_unavailable');
    unrelatedIdentity = await actual.capture(unrelated.pid); assert.ok(unrelatedIdentity.startedAtToken, 'unrelated_control_identity_unavailable');

    adapter = delayed;
    const cancelRun = runtime.createRun('windows-operator-cancellation@1.0.0', {}, {type: 'manual', actor: 'qualification-controller'}), cancelDispatch = runtime.dispatch(); assert.equal(cancelDispatch?.runId, cancelRun.id);
    const cancelPids = await waitFor(() => observations.get(cancelRun.id)?.length === 3 ? observations.get(cancelRun.id) : undefined, 15_000, 'cancel-process-tree');
    process.stdout.write(`${JSON.stringify({phase: 'CANCEL_READY', runId: cancelRun.id, at: timestamp()})}\n`);
    await waitFor(() => ledger.get(cancelRun.id)?.status === 'CANCELLING', 60_000, 'browser-operator-cancel');
    const cancellationPending = {workerActive: workers.list()[0].active, lockHeld: locks.list().some(lock => lock.runId === cancelRun.id)};
    assert.deepEqual(cancellationPending, {workerActive: 1, lockHeld: true});
    await cancelDispatch!.completion;
    const cancelled = ledger.get(cancelRun.id)!; const cancelExited = await waitForExit(cancelPids.map(item => item.pid));
    assert.equal(cancelled.status, 'CANCELLED'); assert.equal(cancelled.steps[0].status, 'CANCELLED'); assert.equal(cancelled.steps[0].cleanup?.outcome, 'confirmed'); assert.equal(cancelExited, true); assert.equal(processAlive(unrelated.pid), true); assert.equal(workers.list()[0].active, 0); assert.equal(locks.list().some(lock => lock.runId === cancelRun.id), false);
    process.stdout.write(`${JSON.stringify({phase: 'CANCEL_COMPLETE', runId: cancelRun.id, at: timestamp()})}\n`);

    adapter = actual;
    const timeoutRun = runtime.createRun('windows-timeout-cleanup@1.0.0', {}, {type: 'manual', actor: 'qualification-controller'}), timeoutDispatch = runtime.dispatch(); assert.equal(timeoutDispatch?.runId, timeoutRun.id); await timeoutDispatch!.completion;
    const timedOut = ledger.get(timeoutRun.id)!, timeoutPids = observations.get(timeoutRun.id) ?? [], timeoutExited = await waitForExit(timeoutPids.map(item => item.pid));
    assert.equal(timeoutPids.length, 3); assert.equal(timedOut.status, 'FAILED'); assert.equal(timedOut.steps[0].status, 'TIMED_OUT'); assert.equal(timedOut.steps[0].cleanup?.outcome, 'confirmed'); assert.equal(timeoutExited, true); assert.equal(processAlive(unrelated.pid), true); assert.equal(workers.list()[0].active, 0); assert.equal(locks.list().some(lock => lock.runId === timeoutRun.id), false);
    process.stdout.write(`${JSON.stringify({phase: 'TIMEOUT_COMPLETE', runId: timeoutRun.id, at: timestamp()})}\n`);

    const mismatchIdentity = {...unrelatedIdentity, startedAtToken: `${unrelatedIdentity.startedAtToken}:deliberate-mismatch`}, mismatch = await actual.terminate(mismatchIdentity, unrelated, 'qualification_pid_identity_mismatch');
    assert.equal(mismatch.outcome, 'identity-mismatch'); assert.equal(processAlive(unrelated.pid), true);

    adapter = proofLoss;
    const uncertaintyRun = runtime.createRun('windows-cleanup-uncertainty@1.0.0', {}, {type: 'manual', actor: 'qualification-controller'}), uncertaintyDispatch = runtime.dispatch(); assert.equal(uncertaintyDispatch?.runId, uncertaintyRun.id);
    const uncertaintyPids = await waitFor(() => observations.get(uncertaintyRun.id)?.length === 3 ? observations.get(uncertaintyRun.id) : undefined, 15_000, 'uncertainty-process-tree');
    runtime.cancel(uncertaintyRun.id, 'qualification_injected_confirmation_loss'); await uncertaintyDispatch!.completion;
    const uncertain = ledger.get(uncertaintyRun.id)!, uncertaintyExited = await waitForExit(uncertaintyPids.map(item => item.pid));
    assert.equal(proofLoss.physicalResults[0]?.outcome, 'confirmed'); assert.equal(uncertaintyExited, true); assert.equal(uncertain.status, 'CLEANUP_UNCERTAIN'); assert.equal(uncertain.steps[0].status, 'CLEANUP_UNCERTAIN'); assert.equal(uncertain.steps[0].cleanup?.outcome, 'uncertain'); assert.equal(workers.list()[0].active, 1); assert.equal(locks.list().some(lock => lock.runId === uncertaintyRun.id), true); assert.equal(processAlive(unrelated.pid), true);
    process.stdout.write(`${JSON.stringify({phase: 'UNCERTAINTY_COMPLETE', runId: uncertaintyRun.id, at: timestamp()})}\n`);

    const evidence = {
      schema: 'agent-control.windows-cleanup-physical-qualification/v1', verdict: 'PASS', startedAt, completedAt: timestamp(), repository: {head: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), dirty: execFileSync('git', ['status', '--short'], {encoding: 'utf8'}).trim().length > 0},
      environment: {nodeId: options.nodeId, hostClass: 'Windows execution node', platform: process.platform, osRelease: os.release(), architecture: process.arch, nodeVersion: process.version, terminationAdapter: actual.constructor.name},
      operatorCancellation: {runId: cancelRun.id, requestedThrough: 'authenticated Agent Control dashboard API', finalStatus: cancelled.status, finalStepStatus: cancelled.steps[0].status, processTreeRoles: cancelPids.map(item => item.role), descendantsTerminated: cancelExited, unrelatedControlSurvived: true, protectionWhilePending: cancellationPending, protectionAfterConfirmation: {workerActive: 0, lockHeld: false}, cleanup: safeCleanup(cancelled.steps[0].cleanup)},
      timeout: {runId: timeoutRun.id, finalStatus: timedOut.status, finalStepStatus: timedOut.steps[0].status, timeoutSeconds: timedOut.steps[0].attempts[0].timeoutSeconds, processTreeRoles: timeoutPids.map(item => item.role), descendantsTerminated: timeoutExited, unrelatedControlSurvived: true, cleanup: safeCleanup(timedOut.steps[0].cleanup), protectionAfterConfirmation: {workerActive: 0, lockHeld: false}},
      identityProtection: {outcome: mismatch.outcome, detail: mismatch.detail, signalCount: mismatch.signals.length, unrelatedControlSurvived: true, capturedIdentityAuthority: unrelatedIdentity.startedAtToken ? 'authoritative-platform-start-token' : 'unavailable'},
      cleanupUncertainty: {runId: uncertaintyRun.id, injection: {kind: 'post-termination-confirmation-loss', boundary: 'ProcessTerminationAdapter result after the native Windows adapter physically confirmed cleanup'}, physicalCleanupOutcomeBeforeInjection: proofLoss.physicalResults[0].outcome, descendantsTerminated: uncertaintyExited, finalStatus: uncertain.status, finalStepStatus: uncertain.steps[0].status, retainedProtection: {workerActive: workers.list()[0].active, lockHeld: locks.list().some(lock => lock.runId === uncertaintyRun.id)}, cleanup: safeCleanup(uncertain.steps[0].cleanup)},
      dashboard: {transport: 'Windows-node loopback dashboard observed through authenticated governed SSH tunnel', sseEventCount: control.events.history().length, stateTransitions: snapshots},
      assertions: {actualWindowsAdapter: true, actualProductionJobRuntime: true, ownedDescendantsTerminated: true, unrelatedProcessSurvivedAllScenarios: true, pidIdentityFailedClosed: true, terminalOnlyAfterConfirmedCleanup: true, uncertaintyRetainedProtection: true},
    };
    fs.mkdirSync(path.dirname(options.evidenceFile), {recursive: true}); fs.writeFileSync(options.evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`, {mode: 0o600});
    process.stdout.write(`${JSON.stringify({phase: 'QUALIFICATION_COMPLETE', verdict: 'PASS', evidenceFile: options.evidenceFile, at: evidence.completedAt})}\n`);
    await delay(options.holdMs);
  } finally {
    clearInterval(monitor); server.close(); await once(server, 'close').catch(() => {});
    if (unrelated && unrelatedIdentity && processAlive(unrelated.pid!)) await actual.terminate(unrelatedIdentity, unrelated, 'qualification_control_cleanup');
  }
}

main().catch(error => { process.stdout.write(`${JSON.stringify({phase: 'QUALIFICATION_FAILED', error: error instanceof Error ? error.message : String(error), at: timestamp()})}\n`); process.exitCode = 1; });

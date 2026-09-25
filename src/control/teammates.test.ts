import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {runPersistentTeammatesDemo} from './teammates-demo.js';
import {ActionRegistry, ArtifactStore, JobRuntime, ResourceLockManager, RunLedger, WorkerRegistry} from './job-runtime.js';
import {JobCatalog} from './job-catalog.js';
import {MemoryHarnessEfficiencyLedger} from './harness-efficiency.js';
import {JobRuntimeTeammateExecutor, PersistentTeammateCoordinator, PersistentTeammateStore, TeammateEscalationError, type GovernedTeammateExecutor} from './teammates.js';

function root() { return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-teammates-test-')); }

test('profiles, verified context and explicitly saved routines persist without granting capabilities', () => {
  const file = path.join(root(), 'teammates.json'), store = new PersistentTeammateStore(file);
  store.upsertProfile({id: 'researcher', name: 'Researcher', role: 'Research', instructions: 'Use evidence.', preferredCapabilities: ['network.read']});
  store.saveRoutine('researcher', {id: 'catalogue-first', name: 'Catalogue first', instructions: 'Inspect the catalogue before inference.', source: 'operator'});
  assert.throws(() => store.saveRoutine('researcher', {id: 'learned', name: 'Learned', instructions: 'Reuse this.', source: 'verified-run'}), /verified_routine_evidence_required/);
  store.retainContext('researcher', {id: 'result-1', summary: 'Verified result', sourceRunId: 'run-1', evidenceIds: ['evidence-1']});
  const restored = new PersistentTeammateStore(file).profile('researcher');
  assert.deepEqual(restored.preferredCapabilities, ['network.read']);
  assert.equal(restored.routines[0].source, 'operator');
  assert.equal(restored.retainedContext[0].sourceRunId, 'run-1');
  assert.equal(Object.prototype.hasOwnProperty.call(restored, 'authority'), false);
});

test('controlled conversations reject messages from undeclared participants', () => {
  const store = new PersistentTeammateStore(path.join(root(), 'teammates.json'));
  store.upsertProfile({id: 'coordinator', name: 'Coordinator', role: 'Coordinator', instructions: 'Coordinate.', preferredCapabilities: ['coordination'], coordinator: true});
  store.upsertProfile({id: 'one', name: 'One', role: 'One', instructions: 'One.', preferredCapabilities: ['one']});
  store.upsertProfile({id: 'two', name: 'Two', role: 'Two', instructions: 'Two.', preferredCapabilities: ['two']});
  store.upsertProfile({id: 'outsider', name: 'Outsider', role: 'Outside', instructions: 'Outside.', preferredCapabilities: ['outside']});
  const conversation = store.createConversation('coordinator', ['one', 'two'], 'Controlled task');
  assert.throws(() => store.message(conversation.id, {from: 'outsider', to: 'one', kind: 'control', content: 'Inject work'}), /conversation_participant_denied/);
});

test('production teammate executor rejects a control Action instead of bypassing the adaptive harness', () => {
  const actions = new ActionRegistry(); actions.registerControl('test.control@1.0.0', async () => ({})); const catalog = new JobCatalog(actions.ids()), dir = root(), telemetry = new MemoryHarnessEfficiencyLedger();
  const runtime = new JobRuntime(catalog, actions, new WorkerRegistry(), new RunLedger(path.join(dir, 'runs.json')), new ArtifactStore(path.join(dir, 'artifacts')), new ResourceLockManager(path.join(dir, 'locks.json')), {efficiency: telemetry});
  assert.throws(() => new JobRuntimeTeammateExecutor(runtime, catalog, 'test.control@1.0.0', telemetry), /teammate_action_must_be_agent_action/);
});

test('coordinator delegates to two teammates and returns a verified telemetry-linked synthesis', async () => {
  const evidence = await runPersistentTeammatesDemo(root());
  assert.equal(evidence.conversation.status, 'VERIFIED');
  assert.equal(evidence.delegations.length, 3);
  assert.equal(evidence.runs.length, 3);
  assert.ok(evidence.runs.every(run => run.status === 'SUCCEEDED'));
  assert.ok(evidence.runs.every(run => run.verification?.passed.includes('teammate-output-verified')));
  assert.ok(evidence.runs.every(run => run.invocationIds.length === 1));
  assert.equal(evidence.telemetry.length, 3);
  assert.ok(evidence.telemetry.every(value => value.verifierResult === 'PASS' && value.finalJobResult === 'SUCCEEDED'));
  assert.equal(evidence.metrics.overall.totalProcessedTokens, 480);
  assert.equal(evidence.metrics.overall.costPerVerifiedOutcome, .0002);
  assert.match(evidence.outcome.result, /researcher.*independent-auditor/);
  assert.equal(evidence.retainedContext.researcher.length, 1);
  assert.equal(evidence.retainedContext.auditor.length, 1);
  assert.equal(evidence.retainedContext.coordinator.length, 1);
});

test('failed delegated verification escalates and prevents coordinator synthesis', async () => {
  const store = new PersistentTeammateStore(path.join(root(), 'teammates.json'));
  store.upsertProfile({id: 'coordinator', name: 'Coordinator', role: 'Coordinator', instructions: 'Coordinate.', preferredCapabilities: ['coordination'], coordinator: true});
  store.upsertProfile({id: 'one', name: 'One', role: 'One', instructions: 'One.', preferredCapabilities: ['one']});
  store.upsertProfile({id: 'two', name: 'Two', role: 'Two', instructions: 'Two.', preferredCapabilities: ['two']});
  let calls = 0; const executor: GovernedTeammateExecutor = {async execute() { calls++; return {runId: `run-${calls}`, runStatus: 'DEGRADED', result: 'unverified', evidenceIds: [], verifierResult: 'FAIL', telemetry: {invocationIds: [`inv-${calls}`], inputTokens: null, cachedInputTokens: null, outputTokens: null, totalTokens: null, cost: null, currency: null}}; }};
  const coordinator = new PersistentTeammateCoordinator(store, executor);
  await assert.rejects(() => coordinator.coordinate({coordinatorId: 'coordinator', task: 'Do not synthesize failures', assignments: [{teammateId: 'one', task: 'First'}, {teammateId: 'two', task: 'Second'}]}), TeammateEscalationError);
  assert.equal(calls, 1);
  assert.equal(store.listDelegations()[0].status, 'REVIEW_REQUIRED');
});

test('coordinator profiles cannot be delegated as specialists', async () => {
  const store = new PersistentTeammateStore(path.join(root(), 'teammates.json'));
  for (const id of ['coordinator', 'other-coordinator']) store.upsertProfile({id, name: id, role: 'Coordinator', instructions: 'Coordinate.', preferredCapabilities: ['coordination'], coordinator: true});
  store.upsertProfile({id: 'researcher', name: 'Researcher', role: 'Research', instructions: 'Research.', preferredCapabilities: ['research']});
  const executor: GovernedTeammateExecutor = {async execute() { throw new Error('must_not_launch'); }};
  await assert.rejects(() => new PersistentTeammateCoordinator(store, executor).coordinate({coordinatorId: 'coordinator', task: 'No recursive chain', assignments: [{teammateId: 'other-coordinator', task: 'Coordinate again'}, {teammateId: 'researcher', task: 'Research'}]}), /coordinator_cannot_be_specialist/);
});

test('teammate jobs are stable across delegations and historical retries survive restart', async () => {
  const dir = root(), telemetry = new MemoryHarnessEfficiencyLedger(), actions = new ActionRegistry();
  actions.registerControl('test.teammate@1.0.0', async context => ({artifacts: [{name: 'teammate-result', value: {result: `verified:${context.parameters.task}`}}], evidence: [`evidence:${context.run.id}`], verification: ['teammate-output-verified']}));
  const profile = new PersistentTeammateStore(path.join(dir, 'teammates.json')).upsertProfile({id: 'researcher', name: 'Researcher', role: 'Research', instructions: 'Use evidence.', preferredCapabilities: ['research']});
  const build = (catalog: JobCatalog) => {
    const workers = new WorkerRegistry(); workers.register({id: 'worker', capabilities: ['research'], health: 'healthy', capacity: 1, active: 0, observedAt: new Date().toISOString()});
    return new JobRuntime(catalog, actions, workers, new RunLedger(path.join(dir, 'runs.json')), new ArtifactStore(path.join(dir, 'artifacts')), new ResourceLockManager(path.join(dir, 'locks.json')), {efficiency: telemetry});
  };
  const catalog = new JobCatalog(actions.ids()), runtime = build(catalog), executor = new JobRuntimeTeammateExecutor(runtime, catalog, 'test.teammate@1.0.0', telemetry, {allowControlActionForDemo: true});
  let historicalRunId = '';
  for (let count = 0; count < 12; count++) historicalRunId = (await executor.execute({conversationId: 'conversation-fixture', delegationId: `delegation-${count}`, teammate: profile, phase: 'specialist', task: `task-${count}`, priorResults: []})).runId;
  assert.equal(catalog.listJobs().length, 1);
  const historical = runtime.ledger.get(historicalRunId)!; historical.status = 'FAILED'; historical.endedAt = new Date().toISOString(); runtime.ledger.update(historical, 'test.retryable');
  const restartedCatalog = new JobCatalog(actions.ids()), restarted = build(restartedCatalog), retry = restarted.retry(historicalRunId);
  assert.equal(retry.trigger.type, 'retry');
  assert.equal(restartedCatalog.listJobs().length, 1);
  assert.equal(retry.parameters.delegationId, 'delegation-11');
});

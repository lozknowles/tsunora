import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {WorkCoordinator} from './work-coordinator.js';
import {
  ControlOperationRegistry,
  WorkExecutor,
  type WorkDispatch,
  type WorkHandler,
} from './work-executor.js';
import {WorkQueue, type WorkItem} from './work-queue.js';
import {WorkQueueStore} from './work-queue-store.js';

const resource = {id: 'h', type: 'host' as const, health: 'healthy' as const, capabilities: [{id: 'tool.x', kind: 'tool' as const}]};
const load = {resourceId: 'h', busy: 0, capacity: 1};
const item = (id: string, values: Partial<WorkItem> = {}): WorkItem => ({
  id, type: 'task', class: 'priority', status: 'queued', capabilities: {requires: [{id: 'tool.x'}]},
  createdAt: new Date().toISOString(), batchable: false, preemptible: true, dependsOn: [], attempts: 0, maxAttempts: 4,
  ...values,
});
const dispatch = (handler: WorkHandler): WorkDispatch => ({path: 'adaptive-harness', execute: handler});

test('executor advances dependency graph continuously with compact context', async () => {
  const queue = new WorkQueue();
  queue.enqueue(item('a'));
  queue.enqueue(item('b', {dependsOn: ['a']}));
  const contexts: any[] = [];
  const executor = new WorkExecutor(new WorkCoordinator(queue), dispatch(async (work, _resource, context) => {
    contexts.push(context);
    return {resultRef: `result/${work.id}`};
  }));
  const events = await executor.run([resource], [load]);
  assert.deepEqual(events.map(event => event.kind), ['completed', 'completed', 'idle']);
  assert.equal(queue.get('b')?.status, 'completed');
  assert.deepEqual(contexts[1].dependsOn, [{id: 'a', status: 'completed', resultRef: 'result/a'}]);
  assert.equal('createdAt' in contexts[1], false);
});

test('retryable failure requeues within attempt budget', async () => {
  const queue = new WorkQueue();
  queue.enqueue(item('x', {maxAttempts: 2}));
  let attempts = 0;
  const executor = new WorkExecutor(new WorkCoordinator(queue), dispatch(async () => ++attempts === 1
    ? {error: 'temporary', retryable: true}
    : {resultRef: 'ok'}));
  const events = await executor.run([resource], [load]);
  assert.deepEqual(events.map(event => event.kind), ['retry', 'completed', 'idle']);
  assert.equal(queue.get('x')?.attempts, 2);
});

test('repeated semantic outcome escalates loop to human review', async () => {
  const queue = new WorkQueue();
  queue.enqueue(item('loop', {maxAttempts: 5}));
  const executor = new WorkExecutor(new WorkCoordinator(queue), dispatch(async () => ({error: 'same failure', retryable: true, fingerprint: 'same-plan-failed'})), undefined, 3);
  assert.equal((await executor.step([resource], [load])).kind, 'retry');
  assert.equal((await executor.step([resource], [load])).kind, 'retry');
  assert.equal((await executor.step([resource], [load])).kind, 'loop');
  assert.equal(queue.get('loop')?.status, 'human-review');
});

test('low confidence success stops graph at review gate', async () => {
  const queue = new WorkQueue();
  queue.enqueue(item('review'));
  queue.enqueue(item('after', {dependsOn: ['review']}));
  const executor = new WorkExecutor(new WorkCoordinator(queue), dispatch(async () => ({resultRef: 'candidate', confidence: .2})));
  const events = await executor.run([resource], [load]);
  assert.deepEqual(events.map(event => event.kind), ['review']);
  assert.equal(queue.get('after')?.status, 'queued');
  assert.equal(queue.ready().length, 0);
});

test('loop fingerprints survive queue store restart', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-exec-'));
  const store = new WorkQueueStore(path.join(directory, 'q.json'));
  try {
    let queue = new WorkQueue();
    queue.enqueue(item('loop', {maxAttempts: 5}));
    const handler = dispatch(async () => ({error: 'same', retryable: true, fingerprint: 'repeat'}));
    let executor = new WorkExecutor(new WorkCoordinator(queue, undefined, store), handler, undefined, 3);
    assert.equal((await executor.step([resource], [load])).kind, 'retry');
    assert.equal((await executor.step([resource], [load])).kind, 'retry');
    store.save(queue);
    queue = store.load();
    executor = new WorkExecutor(new WorkCoordinator(queue, undefined, store), handler, undefined, 3);
    assert.equal((await executor.step([resource], [load])).kind, 'loop');
    assert.equal(queue.get('loop')?.outcomes?.length, 3);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('executor consumes homogeneous batch lease item by item', async () => {
  const queue = new WorkQueue();
  queue.enqueue(item('b1', {class: 'batch', batchable: true, batchKey: 'photos'}));
  queue.enqueue(item('b2', {class: 'batch', batchable: true, batchKey: 'photos'}));
  const seen: string[] = [];
  const executor = new WorkExecutor(new WorkCoordinator(queue), dispatch(async work => {
    seen.push(work.id);
    return {resultRef: `done/${work.id}`};
  }));
  const events = await executor.run([resource], [load]);
  assert.equal(events[0].kind, 'batch');
  assert.match(events[0].detail, /2\/2/);
  assert.deepEqual(seen, ['b1', 'b2']);
});

test('control operation is explicit and cannot become an agent fallback', async () => {
  const queue = new WorkQueue();
  queue.enqueue(item('control', {data: {executionClass: 'control', controlOperation: 'fixture'}}));
  queue.enqueue(item('agent'));
  let controlCalls = 0;
  let agentCalls = 0;
  const controls = new ControlOperationRegistry().register('fixture', async () => {
    controlCalls++;
    return {resultRef: 'controlled'};
  }, work => work.id === 'control');
  const executor = new WorkExecutor(new WorkCoordinator(queue), dispatch(async () => {
    agentCalls++;
    return {resultRef: 'harnessed'};
  }), controls);
  await executor.run([resource], [load]);
  assert.equal(controlCalls, 1);
  assert.equal(agentCalls, 1);
});

test('execution completion can remain pending independent verification', async () => {
  const queue = new WorkQueue();
  queue.enqueue(item('verify'));
  const executor = new WorkExecutor(new WorkCoordinator(queue), dispatch(async () => ({resultRef: 'claim', requiresVerification: true})));
  assert.equal((await executor.step([resource], [load])).kind, 'verification');
  assert.equal(queue.get('verify')?.status, 'verification-pending');
});

test('governed verification acceptance completes work and unblocks dependants', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-verify-'));
  const store = new WorkQueueStore(path.join(directory, 'q.json'));
  const queue = new WorkQueue();
  queue.enqueue(item('claim'));
  queue.enqueue(item('dependant', {dependsOn: ['claim']}));
  const executor = new WorkExecutor(new WorkCoordinator(queue, undefined, store), dispatch(async work => ({resultRef: `result/${work.id}`, requiresVerification: work.id === 'claim'})));
  try {
    assert.equal((await executor.step([resource], [load])).kind, 'verification');
    executor.completeVerification('claim', {decision: 'ACCEPT', verifier: 'independent-verifier', evidenceRef: 'evidence/claim'});
    assert.equal(queue.get('claim')?.status, 'completed');
    assert.equal(queue.ready()[0]?.id, 'dependant');
    assert.equal(store.load().get('claim')?.verification?.decision, 'ACCEPT');
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('governed verification rejection chooses bounded retry, review or failure explicitly', async () => {
  const retryQueue = new WorkQueue();
  retryQueue.enqueue(item('retry', {status: 'verification-pending', attempts: 1, maxAttempts: 2}));
  const retryExecutor = new WorkExecutor(new WorkCoordinator(retryQueue), dispatch(async () => ({})));
  retryExecutor.completeVerification('retry', {decision: 'REJECT', verifier: 'judge', evidenceRef: 'evidence/reject', reason: 'claim unsupported', disposition: 'retry'});
  assert.equal(retryQueue.get('retry')?.status, 'queued');

  const reviewQueue = new WorkQueue();
  reviewQueue.enqueue(item('review', {status: 'verification-pending'}));
  new WorkExecutor(new WorkCoordinator(reviewQueue), dispatch(async () => ({}))).completeVerification('review', {decision: 'REJECT', verifier: 'judge', evidenceRef: 'evidence/reject', reason: 'needs operator', disposition: 'human-review'});
  assert.equal(reviewQueue.get('review')?.status, 'human-review');

  const failedQueue = new WorkQueue();
  failedQueue.enqueue(item('failed', {status: 'verification-pending'}));
  new WorkExecutor(new WorkCoordinator(failedQueue), dispatch(async () => ({}))).completeVerification('failed', {decision: 'REJECT', verifier: 'judge', evidenceRef: 'evidence/reject', reason: 'invalid', disposition: 'failed'});
  assert.equal(failedQueue.get('failed')?.status, 'failed');
});

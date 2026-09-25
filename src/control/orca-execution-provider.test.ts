import assert from 'node:assert/strict';
import test from 'node:test';
import type {ExecutionAuthority, ExecutionIdentity, ExecutionReceipt, StartExecutionRequest} from './execution-provider.js';
import {OrcaExecutionProvider, type ExecutionReceiptStore, type OrcaRecoveryProof, type OrcaRuntimePort} from './orca-execution-provider.js';

class MemoryStore implements ExecutionReceiptStore {
  records = new Map<string, ExecutionReceipt>();
  load(id: string) { const value = this.records.get(id); return value ? structuredClone(value) : undefined; }
  save(value: ExecutionReceipt) { this.records.set(value.identity.taskId, structuredClone(value)); }
  delete(id: string) { this.records.delete(id); }
}

class FakeOrca implements OrcaRuntimePort {
  identity?: ExecutionIdentity;
  continuity = true;
  state: OrcaRecoveryProof['state'] = 'RUNNING';
  inputs: string[] = [];
  cancelled = false;
  fenced = false;
  async start(request: StartExecutionRequest & {creationNonce: string; commandHash: string}) {
    this.identity = {provider: 'orca', taskId: request.taskId, executionId: `exec-${request.taskId}`,
      sessionId: `pty-${request.taskId}`, sessionIncarnation: `inc-${request.taskId}`,
      host: request.host, repository: request.repository, worktree: `/tmp/${request.taskId}`,
      branch: request.branch, creationNonce: request.creationNonce, commandHash: request.commandHash};
    return {executionId: this.identity.executionId, sessionId: this.identity.sessionId,
      sessionIncarnation: this.identity.sessionIncarnation, worktree: this.identity.worktree};
  }
  async prove() { if (!this.identity) throw new Error('gone'); return {identity: structuredClone(this.identity), state: this.state, continuityProven: this.continuity}; }
  async sendInput(_token: never, input: string) { if (this.fenced) return {accepted: false, reason: 'authority_fenced'}; this.inputs.push(input); return {accepted: true}; }
  async setPaused(_token: never, paused: boolean) { this.state = paused ? 'PAUSED' : 'RUNNING'; return true; }
  async cancel() { this.cancelled = true; this.state = 'CANCELLED'; return true; }
  async applyAuthority(token: {owner: 'agent' | 'human'}) { this.fenced = token.owner === 'human'; return true; }
  async output() { return 'agent output'; }
  async diff() { return 'diff --git a/x b/x'; }
  async cleanup() {}
}

const agent = (lease = 1, ownership = 1): ExecutionAuthority => ({laneId: 'lane-a', leaseGeneration: lease, ownershipGeneration: ownership, owner: 'agent'});
const human = (lease = 2, ownership = 2): ExecutionAuthority => ({laneId: 'lane-a', leaseGeneration: lease, ownershipGeneration: ownership, owner: 'human'});
const request = (taskId = 'task-a'): StartExecutionRequest => ({taskId, host: 'controller', repository: '/repo', branch: `ac/${taskId}`, command: 'agent run', authority: agent()});

test('Orca-backed execution supports start, status, output, diff, pause, resume, cancel and cleanup', async () => {
  const runtime = new FakeOrca(), store = new MemoryStore(), provider = new OrcaExecutionProvider(runtime, store);
  assert.equal((await provider.start(request())).state, 'RUNNING');
  assert.equal((await provider.status('task-a')).provenOriginal, true);
  assert.equal(await provider.output('task-a'), 'agent output');
  assert.match(await provider.diff('task-a'), /diff --git/);
  assert.equal((await provider.pause('task-a', agent())).state, 'PAUSED');
  assert.equal((await provider.resume('task-a', agent())).state, 'RUNNING');
  assert.equal((await provider.cancel('task-a', agent())).state, 'CANCELLED');
  await provider.cleanup('task-a', agent());
  assert.equal(store.load('task-a'), undefined);
});

test('reconnect proves the original identity after an adapter restart', async () => {
  const runtime = new FakeOrca(), store = new MemoryStore();
  await new OrcaExecutionProvider(runtime, store).start(request());
  const restarted = new OrcaExecutionProvider(runtime, store);
  const status = await restarted.reconnect('task-a', agent());
  assert.equal(status.provenOriginal, true);
  assert.equal(status.receipt.state, 'RUNNING');
});

test('failed reconnect and stale execution identity fail closed as UNKNOWN', async () => {
  const runtime = new FakeOrca(), store = new MemoryStore(), provider = new OrcaExecutionProvider(runtime, store);
  await provider.start(request());
  runtime.continuity = false;
  let status = await provider.reconnect('task-a', agent());
  assert.equal(status.provenOriginal, false);
  assert.equal(status.receipt.state, 'UNKNOWN');
  assert.deepEqual(await provider.sendInput('task-a', 'unsafe', agent()), {accepted: false, reason: 'execution_not_proven'});
  runtime.continuity = true;
  runtime.identity = {...runtime.identity!, creationNonce: 'stale'};
  status = await provider.reconnect('task-a', agent());
  assert.equal(status.receipt.state, 'UNKNOWN');
});

test('a stale transport hostname cannot grant execution authority', async () => {
  const runtime = new FakeOrca(), store = new MemoryStore(), provider = new OrcaExecutionProvider(runtime, store);
  await provider.start(request());
  runtime.identity = {...runtime.identity!, host: 'reassigned-host.example'};
  const status = await provider.reconnect('task-a', agent());
  assert.equal(status.provenOriginal, false);
  assert.equal(status.receipt.state, 'UNKNOWN');
  assert.deepEqual(await provider.sendInput('task-a', 'blocked', agent()), {accepted: false, reason: 'execution_not_proven'});
});

test('stale lease and ownership generations cannot write or cancel', async () => {
  const runtime = new FakeOrca(), store = new MemoryStore(), provider = new OrcaExecutionProvider(runtime, store);
  await provider.start(request());
  await assert.rejects(provider.sendInput('task-a', 'x', agent(0, 1)), /stale_lease/);
  await assert.rejects(provider.cancel('task-a', agent(1, 0)), /stale_ownership/);
  assert.equal(runtime.inputs.length, 0);
  assert.equal(runtime.cancelled, false);
});

test('human takeover fence survives adapter restart and requires deliberate ownership return', async () => {
  const runtime = new FakeOrca(), store = new MemoryStore(), first = new OrcaExecutionProvider(runtime, store);
  await first.start(request());
  await first.humanTakeover('task-a', human());
  const restarted = new OrcaExecutionProvider(runtime, store);
  const recovered = await restarted.reconnect('task-a', human());
  assert.equal(recovered.receipt.state, 'HUMAN_OWNED');
  assert.deepEqual(await restarted.sendInput('task-a', 'blocked', human()), {accepted: false, reason: 'agent_input_fenced:human'});
  const returned = await restarted.returnToAgent('task-a', agent(3, 3));
  assert.equal(returned.state, 'RUNNING');
  assert.deepEqual(await restarted.sendInput('task-a', 'legal', agent(3, 3)), {accepted: true});
});

test('unsupported pause fails honest and moves execution to UNKNOWN', async () => {
  const runtime: OrcaRuntimePort = new FakeOrca(), store = new MemoryStore();
  runtime.setPaused = undefined;
  const provider = new OrcaExecutionProvider(runtime, store);
  await provider.start(request());
  const paused = await provider.pause('task-a', agent());
  assert.equal(paused.state, 'UNKNOWN');
  assert.equal(paused.detail, 'pause_unsupported');
});

test('parallel, clone, handoff and shared-task identities stay Agent Control scoped', async () => {
  const store = new MemoryStore();
  const providers = ['attempt-a', 'attempt-b', 'attempt-c'].map(() => new OrcaExecutionProvider(new FakeOrca(), store));
  const receipts = await Promise.all(providers.map((provider, index) => provider.start({
    ...request(`shared-task-clone-${index}`),
    authority: {laneId: `lane-${index}`, leaseGeneration: 1, ownershipGeneration: 1, owner: 'agent'},
  })));
  assert.equal(new Set(receipts.map(x => x.identity.worktree)).size, 3);
  assert.equal(new Set(receipts.map(x => x.identity.executionId)).size, 3);
  assert.ok(receipts.every(x => x.identity.taskId.startsWith('shared-task-clone-')));
});

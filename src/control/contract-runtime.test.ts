import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {ContractExecutionRuntime} from './contract-runtime.js';

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-contract-')), file = path.join(root, 'contracts.json'), cancelled: string[] = [];
  let instant = Date.parse('2026-09-01T20:00:00.000Z'); const clock = () => new Date(instant).toISOString(), advance = (ms: number) => { instant += ms; };
  const runtime = new ContractExecutionRuntime(file, {cancel: async (processId, reason) => { cancelled.push(`${processId}:${reason}`); return {outcome: 'confirmed', detail: 'fixture_process_tree_absent'}; }}, clock);
  const contract = runtime.create({
    id: 'contract:one', laneId: 'lane:one', operatorActorId: 'human:operator', objective: 'Produce a verified bounded change', completionCriteria: ['tests pass', 'independent verifier accepts'], authority: ['repository.read', 'repository.write:bounded'], protectedResources: ['production'], budget: {deadlineAt: '2026-09-01T20:10:00.000Z', remainingTokens: 10_000},
    active: {actorId: 'agent:worker', agentId: 'worker-one', modelId: 'model-one', providerId: 'provider-one', runtimeId: 'runtime-one', nodeId: 'node-one'}, baton: {objective: 'bounded change', references: ['evidence:input'], authority: ['repository.read']}, process: {id: 'process:one', pid: 1234}, ptyId: 'pty:one', attachments: [{id: 'attachment:one', kind: 'repository', reference: 'git:abc123'}], permissions: {capabilities: ['repository.read', 'repository.write:bounded'], filesystem: 'write', network: 'none', production: false},
  });
  return {root, file, runtime, contract, cancelled, clock, advance};
}

test('contract owns durable task baton process PTY authority and evidence state', () => {
  const value = setup();
  assert.equal(value.contract.baton.generation, 1); assert.equal(value.contract.baton.sha256.length, 64); assert.ok(value.contract.baton.sizeBytes > 0);
  assert.equal(value.contract.process.state, 'RUNNING'); assert.equal(value.contract.pty.state, 'DETACHED'); assert.equal(value.contract.active.agentId, 'worker-one');
  const reconstructed = new ContractExecutionRuntime(value.file, undefined, value.clock).get('contract:one');
  assert.deepEqual(reconstructed.baton, value.contract.baton); assert.deepEqual(reconstructed.permissions, value.contract.permissions); assert.deepEqual(reconstructed.attachments, value.contract.attachments);
});

test('detach leaves work running and reconnect is read-only until explicit transfer', () => {
  const {runtime} = setup();
  runtime.attach('contract:one', {actorId: 'agent:worker', kind: 'agent'}, 'write');
  runtime.consult('contract:one', {actorId: 'human:reviewer', kind: 'human'});
  assert.equal(runtime.get('contract:one').pty.participants.find(item => item.actorId === 'human:reviewer')?.access, 'observe');
  runtime.detach('contract:one', 'agent:worker'); const detached = runtime.get('contract:one'); assert.equal(detached.process.state, 'RUNNING'); assert.equal(detached.pty.writeOwner, undefined);
  runtime.reconnect('contract:one', {actorId: 'agent:worker', kind: 'agent'}); assert.equal(runtime.get('contract:one').pty.participants.find(item => item.actorId === 'agent:worker')?.access, 'observe');
  const request = runtime.requestWriteControl('contract:one', 'agent:worker', 'continue bounded execution');
  runtime.decideWriteControl('contract:one', request.id, 'human:operator', true); assert.equal(runtime.get('contract:one').pty.writeOwner, 'agent:worker');
});

test('only one writer exists and human takeover fences then deliberately resumes the agent', () => {
  const {runtime} = setup(); runtime.attach('contract:one', {actorId: 'agent:worker', kind: 'agent'}, 'write'); runtime.consult('contract:one', {actorId: 'agent:reviewer', kind: 'agent'});
  assert.throws(() => runtime.attach('contract:one', {actorId: 'agent:reviewer', kind: 'agent'}, 'write'), /write_control_held/);
  const taken = runtime.humanTakeover('contract:one', 'human:operator'); assert.equal(taken.state, 'PAUSED'); assert.equal(taken.pty.writeOwner, 'human:operator'); assert.equal(taken.pty.participants.find(item => item.actorId === 'agent:worker')?.access, 'observe');
  const resumed = runtime.resumeAgent('contract:one', 'human:operator', 'agent:worker'); assert.equal(resumed.state, 'ACTIVE'); assert.equal(resumed.pty.writeOwner, 'agent:worker');
});

test('terminal output is monotonically ordered and survives controller restart', () => {
  const value = setup(); value.runtime.appendOutput('contract:one', {source: 'process', text: 'first', expectedSequence: 1}); value.runtime.appendOutput('contract:one', {source: 'agent', text: 'second', expectedSequence: 2});
  assert.throws(() => value.runtime.appendOutput('contract:one', {source: 'process', text: 'late', expectedSequence: 2}), /out_of_order/);
  const recovered = new ContractExecutionRuntime(value.file, undefined, value.clock).get('contract:one'); assert.deepEqual(recovered.pty.transcript.map(item => [item.sequence, item.text]), [[1, 'first'], [2, 'second']]); assert.equal(recovered.pty.nextSequence, 3);
});

test('cancellation and timeout use the process port and retain distinct terminal states', async () => {
  const cancelled = setup(); await cancelled.runtime.cancel('contract:one', 'human:operator', 'operator requested'); assert.equal(cancelled.runtime.get('contract:one').state, 'CANCELLED'); assert.deepEqual(cancelled.cancelled, ['process:one:operator requested']);
  const timed = setup(); timed.advance(11 * 60_000); await timed.runtime.enforceTimeout('contract:one'); assert.equal(timed.runtime.get('contract:one').state, 'TIMED_OUT'); assert.deepEqual(timed.cancelled, ['process:one:contract_timeout']);
});

test('unverified process cleanup remains visibly nonterminal and does not release the contract', async () => {
  const value = setup(), uncertain = new ContractExecutionRuntime(value.file, {cancel: async () => ({outcome: 'uncertain', detail: 'descendant_visibility_unavailable'})}, value.clock);
  const cancelled = await uncertain.cancel('contract:one', 'human:operator', 'operator requested');
  assert.equal(cancelled.state, 'CANCELLING'); assert.equal(cancelled.process.state, 'UNKNOWN'); assert.equal(cancelled.pty.state, 'LOST'); assert.equal(cancelled.process.cleanup?.outcome, 'uncertain');
});

test('stale running process becomes an orphan without inventing completion', () => {
  const value = setup(); value.advance(60_000); const orphaned = value.runtime.markOrphaned('contract:one', 30_000); assert.equal(orphaned.state, 'ORPHANED'); assert.equal(orphaned.process.state, 'ORPHANED'); assert.equal(orphaned.pty.state, 'LOST'); assert.equal(orphaned.verification.state, 'UNSUBMITTED');
});

test('worker completion is only a verification submission and self-verification is denied', () => {
  const {runtime, clock} = setup(); const submitted = runtime.submitForVerification('contract:one', 'agent:worker', [{id: 'evidence:tests', kind: 'test_result', reference: 'artifact:test-output', sha256: 'a'.repeat(64), createdAt: clock()}]);
  assert.equal(submitted.state, 'VERIFYING'); assert.equal(submitted.verification.state, 'PENDING'); assert.throws(() => runtime.verify('contract:one', 'agent:worker', true), /not_independent/);
  const verified = runtime.verify('contract:one', 'agent:verifier', true); assert.equal(verified.state, 'VERIFIED'); assert.equal(verified.verification.state, 'PASSED');
});

test('contracts reject credentials in batons or durable metadata', () => {
  const value = setup();
  assert.throws(() => value.runtime.create({id: 'contract:secret', laneId: 'lane:two', operatorActorId: 'human:operator', objective: 'bad', completionCriteria: ['never'], authority: [], active: {actorId: 'agent:x', agentId: 'x', runtimeId: 'x', nodeId: 'x'}, baton: {apiKey: 'forbidden'}, process: {id: 'p'}, ptyId: 't', permissions: {capabilities: [], filesystem: 'none', network: 'none', production: false}}), /secret_material_forbidden/);
});

for(const outcome of ['EXECUTED','FAILED','CANCELLED'] as const)for(const cleanup of ['uncertain','failed','identity-mismatch'] as const)test('completion '+outcome+' cannot override '+cleanup+' cleanup proof',()=>{
 const {runtime}=setup();runtime.attach('contract:one',{actorId:'agent:worker',kind:'agent'},'write');runtime.completeExecution('contract:one',outcome,{outcome:cleanup,detail:'identity not proved'},completionAuthority(runtime));const c=runtime.get('contract:one');assert.equal(c.state,'ORPHANED');assert.equal(c.process.state,'UNKNOWN');assert.equal(c.pty.writeOwner,undefined);assert.throws(()=>runtime.submitForVerification(c.id,c.active.actorId,[]),/verification_authority_revoked/);
});
test('UNKNOWN completion cannot be upgraded by a later claim without confirmed cleanup',()=>{const {runtime}=setup();runtime.completeExecution('contract:one','UNKNOWN');runtime.completeExecution('contract:one','EXECUTED');assert.equal(runtime.get('contract:one').process.state,'UNKNOWN');});

for(const outcome of ['EXECUTED','FAILED','CANCELLED'] as const)test('missing cleanup proof cannot close a running contract: '+outcome,()=>{const {runtime}=setup();runtime.attach('contract:one',{actorId:'agent:worker',kind:'agent'},'write');runtime.completeExecution('contract:one',outcome,undefined,completionAuthority(runtime));const c=runtime.get('contract:one');assert.equal(c.process.state,'UNKNOWN');assert.equal(c.state,'ORPHANED');assert.equal(c.pty.state,'LOST');});
test('confirmed cleanup permits completion and independent verification',()=>{const {runtime}=setup();runtime.attach('contract:one',{actorId:'agent:worker',kind:'agent'},'write');runtime.completeExecution('contract:one','EXECUTED',{outcome:'confirmed',detail:'owned process and descendant identities reconciled'},completionAuthority(runtime));assert.equal(runtime.get('contract:one').process.state,'EXITED');assert.equal(runtime.get('contract:one').state,'VERIFYING');runtime.verify('contract:one','independent:verifier',true);assert.equal(runtime.get('contract:one').state,'VERIFIED');});

function completionAuthority(runtime: ContractExecutionRuntime){const c=runtime.get('contract:one');return {processId:c.process.id,batonGeneration:c.baton.generation,ownershipGeneration:c.pty.ownershipGeneration};}
for(const outcome of ['EXECUTED','FAILED','CANCELLED','UNKNOWN'] as const)test('stale completion cannot overwrite takeover followed by agent resumption: '+outcome,()=>{const {runtime}=setup();runtime.attach('contract:one',{actorId:'agent:worker',kind:'agent'},'write');const authority=completionAuthority(runtime);runtime.humanTakeover('contract:one','human:operator');runtime.resumeAgent('contract:one','human:operator','agent:worker');const before=runtime.get('contract:one');runtime.completeExecution('contract:one',outcome,{outcome:'confirmed',detail:'old attempt cleanup'},authority);const after=runtime.get('contract:one');assert.equal(after.state,before.state);assert.equal(after.process.state,before.process.state);assert.equal(after.pty.writeOwner,before.pty.writeOwner);assert.equal(after.pty.ownershipGeneration,before.pty.ownershipGeneration);assert.equal(after.verification.state,before.verification.state);});

for(const confirmed of [true,false])test('takeover retains human ownership while recording agent cleanup: '+confirmed,()=>{const {runtime}=setup();runtime.attach('contract:one',{actorId:'agent:worker',kind:'agent'},'write');const authority=completionAuthority(runtime);runtime.humanTakeover('contract:one','human:operator');const generation=runtime.get('contract:one').pty.ownershipGeneration;runtime.completeExecution('contract:one','CANCELLED',{outcome:confirmed?'confirmed':'uncertain',detail:'actual owned process cleanup'},authority);const after=runtime.get('contract:one');assert.equal(after.state,'PAUSED');assert.equal(after.process.state,confirmed?'EXITED':'UNKNOWN');assert.equal(after.pty.writeOwner,'human:operator');assert.equal(after.pty.ownershipGeneration,generation);});

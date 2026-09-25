import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {emptyConfig} from './config.js';
import {createInvocationObservation, FileHarnessEfficiencyLedger} from './harness-efficiency.js';
import {buildJobRuntime, buildJobRuntimeDefinition, runJobSchedulerTick} from './job-bootstrap.js';
import {OPERATOR_OBSERVATION_CAPABILITY,OPERATOR_OBSERVATION_WORKER_ID} from './poe-observation-job.js';

test('fresh empty configuration supplies only the built-in read-only observation worker and completes the documented first Job', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-fresh-observation-'));
  try {
    const runtime=buildJobRuntime(emptyConfig(),root,path.join(root,'manifests'));
    const worker=runtime.workers.list().find(item=>item.id===OPERATOR_OBSERVATION_WORKER_ID);
    assert.deepEqual(worker?.capabilities,[OPERATOR_OBSERVATION_CAPABILITY]);
    assert.equal(worker?.health,'healthy');
    assert.equal(worker?.labels?.scope,'controller-local-read-only-observation');
    assert.deepEqual(runtime.workers.executionIdentity(OPERATOR_OBSERVATION_WORKER_ID),{workerId:OPERATOR_OBSERVATION_WORKER_ID,nodeId:'controller',locality:'CONTROLLER_LOCAL',authority:'AGENT_CONTROL_INTERNAL',controllerRelationship:'CONTROLLER_INTERNAL'});
    assert.equal(runtime.workers.resolve(['model.execute']).worker,undefined);
    const definition=runtime.catalog.job('operator-system-observation@1.1.0');
    assert.ok(definition?.spec.steps.every(step=>step.requires?.length===1&&step.requires[0]===OPERATOR_OBSERVATION_CAPABILITY));
    const run=runtime.createRun('operator-system-observation@1.1.0',{}, {type:'manual',actor:'fresh-install-test'});
    for(let attempt=0;attempt<8&&runtime.ledger.get(run.id)?.status!=='SUCCEEDED';attempt++)await runtime.tick();
    const completed=runtime.ledger.get(run.id)!;
    assert.equal(completed.status,'SUCCEEDED',JSON.stringify(completed,null,2));
    assert.deepEqual(completed.steps.map(step=>[step.id,step.status,step.placement?.selected]),[
      ['observe','SUCCEEDED',OPERATOR_OBSERVATION_WORKER_ID],
      ['verify','SUCCEEDED',OPERATOR_OBSERVATION_WORKER_ID],
    ]);
    assert.ok(completed.artifacts.some(id=>runtime.artifacts.get(id)?.name==='system-observation'));
    assert.ok(completed.artifacts.some(id=>runtime.artifacts.get(id)?.name==='independent-verification'));
    assert.ok(runtime.safety?.list().every(decision=>decision.outcome==='ALLOW'&&decision.workerLocality==='CONTROLLER_LOCAL'&&!decision.categories.includes('REMOTE_NODE')));
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('production bootstrap wires persistent telemetry and configured harness policy', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-harness-bootstrap-'));
  try {
    const config = {...emptyConfig(), harnessEfficiency: {routingMode: 'observe' as const, profiles: {THIN: {maximumInitialContextTokens: 2_048}}}};
    const first = buildJobRuntime(config, root, path.join(root, 'manifests'));
    assert.equal(first.harnessProfiles.THIN.maximumInitialContextTokens, 2_048);
    assert.equal(first.harnessProfileRouter.route({taskId: 'bounded', complexity: .1, risk: 'low', knownExactTargets: true, estimatedFiles: 1, deterministicVerifier: true, ambiguity: .1, architectural: false}).appliedProfile, 'STANDARD');
    assert.throws(() => first.contextPacketBuilder.build('THIN', [{id: 'required', kind: 'task_context', estimatedTokens: 2_049, required: true, relevance: 1, provenanceIds: ['fixture']}]), /required_budget_exceeded/);
    first.harnessEfficiency.record(createInvocationObservation({id: 'inv-bootstrap', jobId: 'job-bootstrap', taskId: 'task-bootstrap', laneId: 'lane-bootstrap', model: 'model-fixture', provider: 'provider-fixture', harnessProfile: 'STANDARD', executionStrategy: 'fixture', startedAt: '2026-08-27T10:00:00.000Z', completedAt: '2026-08-27T10:00:01.000Z', recipeFingerprint: 'recipe-bootstrap'}));
    const reloaded = buildJobRuntime(config, root, path.join(root, 'manifests'));
    assert.equal(reloaded.harnessEfficiency.list()[0].id, 'inv-bootstrap');
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('scheduler boundary reports an unexpected tick failure and remains callable', async () => {
  let calls = 0; const failures: string[] = [], changes: string[] = [];
  const runtime = {async tickSchedules() { calls++; if (calls === 1) throw new Error('scheduler_fixture_failure'); return []; }, async tick() { return undefined; }};
  await runJobSchedulerTick(runtime, (runId, status) => changes.push(`${runId}:${status}`), error => failures.push(error.message));
  await runJobSchedulerTick(runtime, (runId, status) => changes.push(`${runId}:${status}`), error => failures.push(error.message));
  assert.deepEqual(failures, ['scheduler_fixture_failure']);
  assert.equal(calls, 2);
  assert.deepEqual(changes, []);
});

test('production definition supplies the efficiency ledger to enabled cache qualification actions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-cache-bootstrap-'));
  const names = ['AGENT_CONTROL_ENABLE_NON_OPENAI_CACHE_QUALIFICATION', 'AGENT_CONTROL_NON_OPENAI_CACHE_BASE_URL', 'AGENT_CONTROL_NON_OPENAI_CACHE_MODEL', 'AGENT_CONTROL_NON_OPENAI_CACHE_REPOSITORY_ROOT'] as const;
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.AGENT_CONTROL_ENABLE_NON_OPENAI_CACHE_QUALIFICATION = 'true';
    process.env.AGENT_CONTROL_NON_OPENAI_CACHE_BASE_URL = 'http://127.0.0.1:19091/v1';
    process.env.AGENT_CONTROL_NON_OPENAI_CACHE_MODEL = 'fixture-cache-model';
    process.env.AGENT_CONTROL_NON_OPENAI_CACHE_REPOSITORY_ROOT = process.cwd();
    const definition = buildJobRuntimeDefinition(emptyConfig(), path.resolve('config/cache-qualification-jobs'), new FileHarnessEfficiencyLedger(path.join(root, 'invocations.json')));
    assert.ok(definition.actions.ids().has('qualification.non-openai-cache.mutate@1.0.0'));
    assert.ok(definition.actions.ids().has('qualification.non-openai-cache.verify@1.0.0'));
  } finally {
    for (const name of names) { const value = previous[name]; if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    fs.rmSync(root, {recursive: true, force: true});
  }
});

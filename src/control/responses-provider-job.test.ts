import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {AdaptiveHarness, SkillCatalog, ToolPolicy, type RecipeRequest} from './adaptive-harness.js';
import {HarnessDispatcher, HarnessJobAgentAction, ToolHandlerRegistry} from './harness-dispatch.js';
import {JobCatalog} from './job-catalog.js';
import {ActionRegistry, ArtifactStore, JobRuntime, ResourceLockManager, RunLedger, WorkerRegistry} from './job-runtime.js';
import {ResponsesProviderFactory} from './responses-provider.js';

test('Windows Responses Job returns a typed checksummed artifact through ToolPolicy', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-windows-responses-'));
  try {
    const workerId = 'windows-worker', authority = {laneId: 'lane', leaseGeneration: 2, ownershipGeneration: 4, owner: 'agent' as const};
    const policy = new ToolPolicy([{id: 'qualification.return-data', risk: 'read', capabilities: ['structured-output']}]);
    const tools = new ToolHandlerRegistry().register('qualification.return-data', async input => ({marker: 'RETURNED', input}));
    const dispatcher = new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(), policy), policy, tools, () => ({authority, workerId, availableToolIds: ['qualification.return-data'], approvedRisks: ['read']}));
    const provider = new ResponsesProviderFactory({provider: {id: 'openai', name: 'OpenAI', kind: 'responses', baseUrl: 'https://api.openai.com/v1', wireApi: 'responses', requiresAuth: true, parallelism: 1, costClass: 'metered', capabilities: ['structured-output', 'tool-request']}, workerId, modelId: 'qualified-model', workerCapabilities: ['platform.windows', 'model.execute'], modelCapabilities: ['structured-output', 'tool-request'], availableToolIds: ['qualification.return-data'], qualificationEvidence: ['fixture'], health: 'healthy', authorization: () => 'test-token', fetch: async () => new Response(JSON.stringify({id: 'resp_fixture', model: 'qualified-model', status: 'completed', output: [{type: 'function_call', name: 'agent_control_tool_0', arguments: '{"count":3}', call_id: 'call_fixture'}]}), {status: 200})});
    const actions = new ActionRegistry().registerAgent('example.openai-return@1.0.0', new HarnessJobAgentAction(dispatcher, context => {
      const request: RecipeRequest = {taskId: `${context.run.id}:${context.step.id}`, taskType: 'example', requiredCapabilities: ['structured-output', 'tool-request'], requiredTools: ['qualification.return-data'], approvedRisks: ['read'], intent: 'NORMAL', inputTokens: 32, outputTokens: 32, meteredApproved: true, context: {tier: 1, sourceIds: [], evidenceIds: [], estimatedTokens: 8}, authority, verification: {requiredEvidence: ['returned-data'], requireIndependentCheck: true}, escalation: {minimumConfidence: .7, maximumAttempts: 1, onFailure: 'review'}};
      return {plan: {request, candidates: [provider.candidate()], placement: {workerId: context.worker.id, reason: 'Windows capability'}}, executor: provider.executor('Return data'), toActionOutput: result => ({artifacts: [{name: 'result', value: JSON.parse(result.execution.resultRef ?? '{}')}], evidence: result.execution.evidence})};
    })).registerControl('example.verify-return@1.0.0', async context => { const artifact = context.inputArtifacts.find(item => item.name === 'result'); const value = artifact ? context.readArtifact(artifact.id) : undefined; return {verification: JSON.stringify(value).includes('RETURNED') ? ['returned-data'] : [], evidence: artifact ? [`independent-artifact:${artifact.sha256}`] : []}; });
    const catalog = new JobCatalog(actions.ids());
    catalog.addJob({apiVersion: 'agent-control/v1', kind: 'Job', metadata: {id: 'windows-openai', name: 'Windows OpenAI', version: '1.0.0'}, spec: {priority: 'normal', concurrency: 'no-overlap', steps: [{id: 'model', action: 'example.openai-return@1.0.0', requires: ['platform.windows'], outputs: [{name: 'result', type: 'application/json', schema: 'example/v1', version: '1.0.0'}]}, {id: 'verify', action: 'example.verify-return@1.0.0', requires: ['platform.windows'], dependsOn: ['model'], inputs: {result: 'model.result'}, verification: ['returned-data']}]}});
    const workers = new WorkerRegistry().register({id: workerId, capabilities: ['platform.windows'], health: 'healthy', capacity: 1, active: 0, observedAt: new Date().toISOString()});
    const artifacts = new ArtifactStore(path.join(root, 'artifacts'));
    const runtime = new JobRuntime(catalog, actions, workers, new RunLedger(path.join(root, 'ledger.json')), artifacts, new ResourceLockManager(path.join(root, 'locks.json')));
    const run = runtime.createRun('windows-openai@1.0.0', {}, {type: 'manual', actor: 'test'});
    await runtime.tick();
    await runtime.tick();
    assert.equal(runtime.ledger.get(run.id)?.status, 'SUCCEEDED');
    const artifact = artifacts.list(run.id)[0];
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
    assert.match(JSON.stringify(artifacts.read(artifact.id)), /RETURNED/);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

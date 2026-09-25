import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {AdaptiveHarness, SkillCatalog, ToolPolicy, type RecipeRequest} from './adaptive-harness.js';
import {HarnessDispatcher, HarnessJobAgentAction, MemoryRecipeDispatchStore, ToolHandlerRegistry} from './harness-dispatch.js';
import {JobCatalog} from './job-catalog.js';
import {ActionRegistry, ArtifactStore, JobRuntime, ResourceLockManager, RunLedger, WorkerRegistry} from './job-runtime.js';
import {StructuredChatProviderFactory} from './structured-chat-provider.js';
import {MemoryHarnessEfficiencyLedger} from './harness-efficiency.js';

test('model-backed Job Action follows the harness, tool gateway, evidence and verification boundary', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-harness-job-'));
  try {
    const authority = {laneId: 'job-lane', leaseGeneration: 3, ownershipGeneration: 7, owner: 'agent' as const};
    const toolPolicy = new ToolPolicy([{id: 'qualification.inspect', risk: 'read', capabilities: ['fixture.read']}]);
    const tools = new ToolHandlerRegistry().register('qualification.inspect', async input => ({marker: 'HARNESS-JOB-OK', input}));
    const store = new MemoryRecipeDispatchStore();
    const efficiency = new MemoryHarnessEfficiencyLedger();
    const dispatcher = new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(), toolPolicy), toolPolicy, tools, () => ({authority: {...authority}, workerId: 'model-worker', availableToolIds: ['qualification.inspect'], approvedRisks: ['read']}), store, undefined, undefined, efficiency);
    const provider = new StructuredChatProviderFactory({
      provider: {id: 'local-qwen', name: 'Local Qwen', kind: 'local', baseUrl: 'http://127.0.0.1:18081/v1', requiresAuth: false, parallelism: 1, costClass: 'free', capabilities: ['structured-output', 'tool-request']},
      workerId: 'model-worker', modelId: 'qwen-test', workerCapabilities: ['model.execute'], modelCapabilities: ['structured-output', 'tool-request'], availableToolIds: ['qualification.inspect'], qualificationEvidence: ['fixture-live-proof'], health: 'healthy',
      fetch: async () => new Response(JSON.stringify({id: 'chatcmpl-job', model: 'qwen-test', choices: [{message: {content: '{"tool":"qualification.inspect","input":{"target":"fixture"}}'}}], usage: {total_tokens: 41}}), {status: 200}),
    });
    const actions = new ActionRegistry();
    actions.registerControl('qualification.control@1.0.0', async context => {
      const artifact = context.inputArtifacts.find(item => item.name === 'model-result');
      const payload = artifact ? context.readArtifact(artifact.id) as {toolOutput?: {marker?: string}} : undefined;
      const accepted = payload?.toolOutput?.marker === 'HARNESS-JOB-OK';
      const ids = efficiency.list().filter(item => item.runId === context.run.id).map(item => item.id);
      if (ids.length) efficiency.markVerification(ids, accepted ? 'PASS' : 'FAIL');
      return {verification: accepted ? ['model-tool-evidence'] : [], evidence: artifact ? [`independent-artifact:${artifact.sha256}`] : [], detail: 'independent control verifier'};
    });
    actions.registerAgent('qualification.model-tool@1.0.0', new HarnessJobAgentAction(dispatcher, context => {
      const request: RecipeRequest = {taskId: `${context.run.id}:${context.step.id}`, taskType: 'qualification', requiredCapabilities: ['structured-output', 'tool-request'], requiredTools: ['qualification.inspect'], approvedRisks: ['read'], intent: 'ECONOMY', inputTokens: 64, outputTokens: 64, context: {tier: 1, sourceIds: [], evidenceIds: [], estimatedTokens: 32}, authority: {...authority}, verification: {requiredEvidence: ['model-tool-evidence'], requireIndependentCheck: true}, escalation: {minimumConfidence: .7, maximumAttempts: 1, onFailure: 'review'}};
      return {plan: {request, candidates: [provider.candidate()], placement: {workerId: context.worker.id, reason: 'Job worker placement'}}, executor: provider.executor('Inspect the safe qualification fixture and report its marker.'), toActionOutput: result => {
        const payload = JSON.parse(result.execution.resultRef ?? '{}') as {toolOutput?: {marker?: string}};
        return {artifacts: [{name: 'model-result', value: payload}], evidence: result.execution.evidence, detail: result.execution.resultRef};
      }};
    }));
    assert.equal(actions.kind('qualification.control@1.0.0'), 'control');
    assert.equal(actions.kind('qualification.model-tool@1.0.0'), 'agent');
    const catalog = new JobCatalog(actions.ids());
    catalog.addJob({apiVersion: 'agent-control/v1', kind: 'Job', metadata: {id: 'real-harness-qualification', name: 'Real harness qualification', version: '1.0.0'}, spec: {priority: 'normal', concurrency: 'no-overlap', steps: [{id: 'model', action: 'qualification.model-tool@1.0.0', requires: ['model.execute'], outputs: [{name: 'model-result', type: 'application/json', schema: 'qualification-result/v1', version: '1.0.0'}]}, {id: 'verify', action: 'qualification.control@1.0.0', requires: ['model.execute'], dependsOn: ['model'], inputs: {result: 'model.model-result'}, verification: ['model-tool-evidence']}]}});
    const workers = new WorkerRegistry().register({id: 'model-worker', capabilities: ['model.execute'], health: 'healthy', capacity: 1, active: 0, observedAt: new Date().toISOString()});
    const runtime = new JobRuntime(catalog, actions, workers, new RunLedger(path.join(root, 'ledger.json')), new ArtifactStore(path.join(root, 'artifacts')), new ResourceLockManager(path.join(root, 'locks.json')), {efficiency});
    const created = runtime.createRun('real-harness-qualification@1.0.0', {}, {type: 'manual', actor: 'test'});
    await runtime.tick();
    await runtime.tick();
    const run = runtime.ledger.get(created.id)!;
    assert.equal(run.status, 'SUCCEEDED');
    assert.deepEqual(run.steps[0].verification, {required: [], passed: [], failed: []});
    assert.deepEqual(run.steps[1].verification, {required: ['model-tool-evidence'], passed: ['model-tool-evidence'], failed: []});
    assert.match(JSON.stringify(run.provenance), /agent:qualification\.model-tool@1\.0\.0:adaptive-harness/);
    assert.equal(store.list()[0]?.phase, 'EXECUTED');
    assert.equal(store.list()[0]?.verification.requireIndependentCheck, true);
    assert.equal(efficiency.metrics().overall.verifiedSuccesses, 1);
    assert.equal(efficiency.metrics().overall.totalProcessedTokens, 41);
    assert.equal(efficiency.list()[0].finalJobResult, 'SUCCEEDED');
    assert.equal(efficiency.list()[0].jobId, 'real-harness-qualification');
    assert.equal(efficiency.list()[0].runId, created.id);
    const events = fs.readFileSync(path.join(root, 'run-events.jsonl'), 'utf8');
    assert.match(events, /"type":"step.verifying","status":"VERIFYING"/);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

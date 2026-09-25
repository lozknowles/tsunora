import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ActionRegistry, ArtifactStore, JobRuntime, ResourceLockManager, RunLedger, WorkerRegistry} from './job-runtime.js';
import {JobCatalog} from './job-catalog.js';
import {createInvocationObservation, MemoryHarnessEfficiencyLedger} from './harness-efficiency.js';
import {JobRuntimeTeammateExecutor, PersistentTeammateCoordinator, PersistentTeammateStore} from './teammates.js';

export async function runPersistentTeammatesDemo(root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-teammates-demo-'))) {
  const store = new PersistentTeammateStore(path.join(root, 'teammates.json'));
  store.upsertProfile({id: 'researcher', name: 'Researcher', role: 'Evidence-led researcher', instructions: 'Separate evidence from inference.', preferredCapabilities: ['research', 'network.read']});
  store.upsertProfile({id: 'independent-auditor', name: 'Independent Auditor', role: 'Independent verifier', instructions: 'Challenge unsupported claims.', preferredCapabilities: ['repository.read', 'verification.independent']});
  store.upsertProfile({id: 'coordinator', name: 'Coordinator', role: 'Delegation and verified synthesis', instructions: 'Combine only verifier-passed specialist results.', preferredCapabilities: ['coordination', 'delegation'], coordinator: true});
  store.saveRoutine('researcher', {id: 'evidence-first', name: 'Evidence first', instructions: 'Lead with directly supported facts and label inference.', source: 'operator'});

  const telemetry = new MemoryHarnessEfficiencyLedger(), actions = new ActionRegistry();
  actions.registerReadOnly('demo.teammate.execute@1.0.0', async context => {
    const startedAt = new Date().toISOString(), teammateId = String(context.parameters.teammateId), phase = String(context.parameters.phase), task = String(context.parameters.task), contextPacket = JSON.parse(String(context.parameters.context)) as {priorResults?: Array<{teammateId: string; result: string}>};
    const result = phase === 'synthesis'
      ? `Verified combined result for ${task}: ${(contextPacket.priorResults ?? []).map(value => `${value.teammateId} => ${value.result}`).join(' | ')}`
      : `${teammateId} verified its specialist assessment of ${task}`;
    const completedAt = new Date(Date.now() + 5).toISOString(), evidenceId = `demo-evidence:${teammateId}:${context.run.id}`;
    const observation = createInvocationObservation({jobId: context.run.jobId, runId: context.run.id, taskId: context.step.id, laneId: `job:${context.run.id}`, model: 'neutral-demo-model', provider: 'neutral-demo-provider', harnessProfile: phase === 'synthesis' ? 'STANDARD' : 'THIN', executionStrategy: 'persistent-teammate-demo', startedAt, completedAt, rawUsage: {input_tokens: 120, input_tokens_details: {cached_tokens: 20}, output_tokens: 40, total_tokens: 160}, providerReportedCost: .0002, pricing: {currency: 'USD', freshInputPerMillionTokens: 0, cachedInputPerMillionTokens: 0, outputPerMillionTokens: 0, fixedPerRequest: 0, source: 'deterministic demo'}, agentId: teammateId, outcome: 'COMPLETE', recipeFingerprint: `demo:${context.run.id}`, evidenceIds: [evidenceId]});
    telemetry.record(observation);
    return {artifacts: [{name: 'teammate-result', value: {schema: 'agent-control.teammate-result/v1', teammateId, phase, result}}], evidence: [evidenceId], verification: ['teammate-output-verified'], detail: 'governed teammate result verified', efficiencyInvocationIds: [observation.id]};
  });
  const catalog = new JobCatalog(actions.ids()), workers = new WorkerRegistry(), observedAt = new Date().toISOString();
  workers.register({id: 'research-worker', capabilities: ['research', 'network.read'], health: 'healthy', capacity: 1, active: 0, observedAt});
  workers.register({id: 'audit-worker', capabilities: ['repository.read', 'verification.independent'], health: 'healthy', capacity: 1, active: 0, observedAt});
  workers.register({id: 'coordination-worker', capabilities: ['coordination', 'delegation'], health: 'healthy', capacity: 1, active: 0, observedAt});
  const runtime = new JobRuntime(catalog, actions, workers, new RunLedger(path.join(root, 'runs.json')), new ArtifactStore(path.join(root, 'artifacts')), new ResourceLockManager(path.join(root, 'locks.json')), {efficiency: telemetry, approval: () => false});
  const executor = new JobRuntimeTeammateExecutor(runtime, catalog, 'demo.teammate.execute@1.0.0', telemetry, {allowControlActionForDemo: true}), coordinator = new PersistentTeammateCoordinator(store, executor);
  const outcome = await coordinator.coordinate({coordinatorId: 'coordinator', task: 'Assess whether Persistent Teammates preserve Agent Control authority', assignments: [{teammateId: 'researcher', task: 'Identify the simplest useful teammate pattern'}, {teammateId: 'independent-auditor', task: 'Independently test authority and verification claims'}]});
  return {schema: 'agent-control.persistent-teammates-demo/v1', root, outcome, conversation: store.conversation(outcome.conversationId), delegations: store.listDelegations(outcome.conversationId), runs: runtime.ledger.list().map(run => ({id: run.id, jobId: run.jobId, status: run.status, selectedWorkers: run.selectedWorkers, verification: run.steps[0].verification, invocationIds: run.steps[0].attempts.flatMap(attempt => attempt.efficiencyInvocationIds ?? [])})), telemetry: telemetry.list(), metrics: telemetry.metrics(), retainedContext: {researcher: store.profile('researcher').retainedContext, auditor: store.profile('independent-auditor').retainedContext, coordinator: store.profile('coordinator').retainedContext}};
}

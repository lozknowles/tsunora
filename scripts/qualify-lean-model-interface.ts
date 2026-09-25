// Qualification client: registers the existing native action, submits and observes.
// No model HTTP, workspace mutation, admission, verification or cleanup lives here.
import fs from 'node:fs';
import path from 'node:path';
import {JobCatalog} from '../src/control/job-catalog.js';
import {ActionRegistry, createJobRuntime, WorkerRegistry} from '../src/control/job-runtime.js';
import {MemoryHarnessEfficiencyLedger} from '../src/control/harness-efficiency.js';
import {registerNonOpenAiCacheQualificationActions} from '../src/control/non-openai-cache-qualification.js';
import type {JobDefinition} from '../src/control/job-types.js';

const root = process.env.AC_NATIVE_QUALIFICATION_STATE;
if (!root || fs.existsSync(path.join(root, 'submitted.json'))) throw new Error('fresh_qualification_state_required');
fs.mkdirSync(root, {recursive: true, mode: 0o700});
const efficiency = new MemoryHarnessEfficiencyLedger();
const actions = registerNonOpenAiCacheQualificationActions(new ActionRegistry(), efficiency, process.env);
const catalog = new JobCatalog(actions.ids());
const job: JobDefinition = {apiVersion: 'agent-control/v1', kind: 'Job', metadata: {id: 'lean-native-interoperability', name: 'Lean native interoperability', version: '1.0.0'}, spec: {priority: 'normal', concurrency: 'no-overlap', steps: [
  {id: 'mutate', action: 'qualification.non-openai-cache.mutate@1.0.0', requires: ['model.execute'], resources: ['disposable-mutation-fixture'], outputs: [{name: 'mutation-attempt', type: 'json', schema: 'attempt/v1', version: '1.0.0'}]},
  {id: 'verify', action: 'qualification.non-openai-cache.verify@1.0.0', requires: ['model.execute'], dependsOn: ['mutate'], outputs: [{name: 'verification-report', type: 'json', schema: 'verification/v1', version: '1.0.0'}], verification: ['non-openai-cache-mutation-verified']},
]}};
catalog.addJob(job);
const workers = new WorkerRegistry().register({id: 'isolated-qualification-worker', capabilities: ['model.execute', 'structured-output', 'tool-request', 'repository.mutation.typed'], health: 'healthy', capacity: 1, active: 0, observedAt: new Date().toISOString()});
const runtime = createJobRuntime(root, catalog, actions, workers, {efficiency});
const run = runtime.createRun('lean-native-interoperability@1.0.0', {}, {type: 'manual', actor: 'human:authorised-lean-qualification'});
fs.writeFileSync(path.join(root, 'submitted.json'), JSON.stringify({job, run}, null, 2), {mode: 0o600, flag: 'wx'});
await runtime.tick();
await runtime.tick();
const artifacts = runtime.artifacts.list(run.id);
const result = {run: runtime.ledger.get(run.id), invocations: efficiency.list(), artifacts, recordedEvidence: artifacts.map(item => ({artifact: item, value: runtime.artifacts.read(item.id)}))};
fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify(result, null, 2), {mode: 0o600, flag: 'wx'});
console.log(JSON.stringify({runId: run.id, status: result.run?.status, artifactCount: artifacts.length, modelInvocations: result.invocations.length}));

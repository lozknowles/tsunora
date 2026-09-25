import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {isCompleteLargeContextReview, registerOperatorReviewActions} from './operator-review-actions.js';
import {withLifecycleHeartbeat} from './harness-dispatch.js';
import {JobCatalog} from './job-catalog.js';
import {ArtifactStore, JobRuntime, ResourceLockManager, RunLedger, WorkerRegistry} from './job-runtime.js';
import {MemoryHarnessEfficiencyLedger} from './harness-efficiency.js';
import type {AgentControlConfig} from './config.js';

const sections = ['What I would delete or simplify', 'CURRENT', 'PROPOSED', 'Quick wins', 'Structural improvements', 'Experimental ideas'].join('\n');

test('large-context review gate requires substantial complete architecture output', () => {
  assert.equal(isCompleteLargeContextReview(`${sections}\n${'repository evidence '.repeat(500)}`), true);
  assert.equal(isCompleteLargeContextReview(`${sections}\nshort`), false);
  assert.equal(isCompleteLargeContextReview(`${sections.replace('PROPOSED', 'TARGET')}\n${'repository evidence '.repeat(500)}`), false);
});

test('large-context review gate rejects a provider-completed role-confusion refusal', () => {
  const refusal = `# Ox Invocation Gate: FAIL — Review Not Performed\n${sections}\n${'I cannot invoke Ox. '.repeat(500)}`;
  assert.equal(isCompleteLargeContextReview(refusal), false);
});

test('large-context review gate does not reject a substantive verdict that quotes refusal language', () => {
  const review = `# Executive Verdict\n\nPASS_FOR_3.3.1\n\n${sections}\n\nThe source currently checks the quoted phrase \`I cannot invoke external review\`; generalize that matcher.\n${'repository evidence '.repeat(500)}`;
  assert.equal(isCompleteLargeContextReview(review), true);
});

test('provider heartbeat remains active until response body consumption completes', async () => {
  const phases:string[]=[]; let release!:()=>void, observed!:()=>void;
  const bodyPending=new Promise<void>(resolve=>{release=resolve});
  const twoHeartbeats=new Promise<void>(resolve=>{observed=resolve});
  const operation=withLifecycleHeartbeat({assertActive: () => undefined, invoke:async()=>undefined,lifecycle:phase=>{phases.push(phase);if(phases.length>=2)observed();}},async()=>{await bodyPending;return 'complete'},5);
  try { await Promise.race([twoHeartbeats,new Promise<never>((_resolve,reject)=>setTimeout(()=>reject(new Error('heartbeat_not_observed')),2_000))]); assert.ok(phases.length>=2); }
  finally { release(); }
  assert.equal(await operation,'complete');
  const stopped=phases.length; await new Promise(resolve=>setTimeout(resolve,12)); assert.equal(phases.length,stopped);
});

test('verdict-like prose cannot bypass a genuine refusal', () => {
  const refusal = `# Review Not Performed\nThe requested alternatives include blocked as a possible protocol outcome.\n${sections}\n${'I cannot invoke external review. '.repeat(400)}`;
  assert.equal(isCompleteLargeContextReview(refusal), false);
});

test('incomplete provider response retains immutable prompt usage cost response and canonical maximumOutputTokens', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-review-incomplete-'));
  const previous = {enabled: process.env.AGENT_CONTROL_ENABLE_OPERATOR_REVIEW, provider: process.env.AGENT_CONTROL_OPERATOR_REVIEW_PROVIDER, reviewRoot: process.env.AGENT_CONTROL_REVIEW_ROOT, credentialFile: process.env.AGENT_CONTROL_TEST_REVIEW_KEY_FILE};
  const originalFetch = globalThis.fetch;
  try {
    const contextFile = path.join(root, 'context.txt'), credentialFile = path.join(root, 'credential'); fs.writeFileSync(contextFile, 'immutable repository snapshot'); fs.writeFileSync(credentialFile, 'test-only-credential', {mode: 0o600});
    process.env.AGENT_CONTROL_ENABLE_OPERATOR_REVIEW = 'true'; process.env.AGENT_CONTROL_OPERATOR_REVIEW_PROVIDER = 'review-route'; process.env.AGENT_CONTROL_REVIEW_ROOT = root; process.env.AGENT_CONTROL_TEST_REVIEW_KEY_FILE = credentialFile;
    let requestBody: Record<string, unknown> = {};
    globalThis.fetch = async (_input, init) => { requestBody = JSON.parse(String(init?.body)); return new Response(JSON.stringify({id: 'response-partial', model: 'returned-model', status: 'incomplete', output_text: 'partial provider response retained', usage: {input_tokens: 100, output_tokens: 20, total_tokens: 120, cost: .012}}), {status: 200, headers: {'content-type': 'application/json'}}); };
    const config: AgentControlConfig = {schemaVersion: 1, resources: [], services: [], lanes: [], models: [], modelRouting: {roles: {}}, providers: [{id: 'review-route', kind: 'responses', baseUrl: 'https://provider.example/v1', wireApi: 'responses', credentialFileEnv: 'AGENT_CONTROL_TEST_REVIEW_KEY_FILE', qualificationModel: 'configured-model', capabilities: ['repository.review', 'large-context'], qualification: {status: 'qualified', advertisedContextLimitTokens: 1_000_000}, pricing: {currency: 'USD', billing: 'metered', inputPerMillionTokens: .1, outputPerMillionTokens: .2, fixedPerRequest: 0, effectiveFrom: '2026-08-30', source: 'operator-config:test-catalog'}}]};
    const efficiency = new MemoryHarnessEfficiencyLedger(), actions = registerOperatorReviewActions(config, undefined, efficiency), catalog = new JobCatalog(actions.ids()).loadDirectory(path.resolve('config/operator-jobs'));
    const workers = new WorkerRegistry().register({id: 'controller', capabilities: ['model.execute', 'network.read', 'repository.review', 'large-context'], health: 'healthy', capacity: 1, active: 0, observedAt: new Date().toISOString()});
    const runtime = new JobRuntime(catalog, actions, workers, new RunLedger(path.join(root, 'ledger.json')), new ArtifactStore(path.join(root, 'artifacts')), new ResourceLockManager(path.join(root, 'locks.json')), {efficiency});
    const submittedPrompt = `Review the exact immutable candidate and retain all telemetry. ${'evidence '.repeat(30)}`;
    const parameters = {reviewPrompt: submittedPrompt, contextFile, maximumOutputTokens: 12345};
    const run = runtime.createRun('agent-control-whole-repository-ox-review@1.0.0', parameters, {type: 'manual', actor: 'test'}); parameters.reviewPrompt = 'edited after submission';
    await runtime.tick();
    const retainedRun = runtime.ledger.get(run.id)!, invocation = efficiency.list()[0], artifact = runtime.artifacts.list(run.id)[0], value = runtime.artifacts.read(artifact.id) as {submittedPrompt: string; responseText: string; providerStatus: string; rawProviderResponse?: unknown; credentialReference?: string};
    assert.equal(retainedRun.parameters.reviewPrompt, submittedPrompt);
    assert.equal(requestBody.max_output_tokens, 12345);
    assert.equal(requestBody.model, 'configured-model');
    assert.equal(value.submittedPrompt, submittedPrompt); assert.equal(value.responseText, 'partial provider response retained'); assert.equal(value.providerStatus, 'incomplete'); assert.equal(value.rawProviderResponse, undefined); assert.equal(value.credentialReference, 'AGENT_CONTROL_TEST_REVIEW_KEY_FILE'); assert.equal(JSON.stringify(value).includes(credentialFile), false); assert.equal(JSON.stringify(value).includes('test-only-credential'), false);
    assert.equal(invocation.model, 'returned-model'); assert.equal(invocation.provider, 'review-route'); assert.equal(invocation.usage.totalProcessedTokens, 120); assert.equal(invocation.providerReportedCost, .012); assert.equal(invocation.state, 'FAILED'); assert.equal(invocation.verifierResult, 'FAIL'); assert.equal(invocation.finalJobResult, 'FAILED');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({AGENT_CONTROL_ENABLE_OPERATOR_REVIEW: previous.enabled, AGENT_CONTROL_OPERATOR_REVIEW_PROVIDER: previous.provider, AGENT_CONTROL_REVIEW_ROOT: previous.reviewRoot, AGENT_CONTROL_TEST_REVIEW_KEY_FILE: previous.credentialFile})) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    fs.rmSync(root, {recursive: true, force: true});
  }
});

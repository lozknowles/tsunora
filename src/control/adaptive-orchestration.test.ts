import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {AdaptiveOrchestrationRuntime, FileAdaptiveOrchestrationStore, MemoryAdaptiveOrchestrationStore, type AdaptiveRouteIdentity} from './adaptive-orchestration.js';
import {JobCatalog} from './job-catalog.js';
import {ActionRegistry, ArtifactStore, JobRuntime, ResourceLockManager, RunLedger, WorkerRegistry} from './job-runtime.js';
import type {JobDefinition} from './job-types.js';
import {ModelRegistry} from './model-registry.js';
import {WorkParcelCoordinator, WorkParcelStore} from './work-parcels.js';

const clock = () => '2026-09-07T00:00:00.000Z';
const route = (modelId: string, nodeId = 'host'): AdaptiveRouteIdentity => ({providerId: 'provider', modelId, nodeId, modelVersion: 'qualification-1', accountProfileId: null});
const outcome = (runtime: AdaptiveOrchestrationRuntime, decisionId: string, parcelId: string, selected: AdaptiveRouteIdentity, values: {quality?: number; outcome?: 'SUCCEEDED' | 'FAILED' | 'PROVIDER_FAILURE' | 'CANCELLED'; evidenceKind?: 'BENCHMARK' | 'QUALIFICATION' | 'PRODUCTION_WORK_PARCEL'; failureClass?: 'provider' | 'cancel'; workflow?: string; observationId?: string; observedAt?: string} = {}) => runtime.recordOutcome({decisionId, parcelId, stageId: 'work', observationId: values.observationId, route: selected, capabilities: ['coding', 'repository-review'], workflow: {id: values.workflow ?? 'workflow', version: '1'}, evidenceKind: values.evidenceKind ?? 'PRODUCTION_WORK_PARCEL', outcome: values.outcome ?? 'SUCCEEDED', verified: !['PROVIDER_FAILURE', 'CANCELLED'].includes(values.outcome ?? ''), qualityScore: ['PROVIDER_FAILURE', 'CANCELLED'].includes(values.outcome ?? '') ? null : values.quality ?? 1, qualityGatePass: ['PROVIDER_FAILURE', 'CANCELLED'].includes(values.outcome ?? '') ? null : (values.quality ?? 1) >= .7, firstPass: true, latencyMs: 20, usage: {inputTokens: 100, outputTokens: 10, totalTokens: 110}, cost: .01, currency: 'USD', costAuthority: 'authoritative', failureClass: values.failureClass, observedAt: values.observedAt ?? clock()});

test('task-specific league ranking uses verified evidence, quality floors and cost/quality trade-offs', () => {
  const runtime = new AdaptiveOrchestrationRuntime(new MemoryAdaptiveOrchestrationStore(), {minimumSamplesForPreference: 2, minimumQualityScore: .7}, clock);
  const decision = runtime.startDecision({parcelId: 'parcel-ranking', objective: 'review the repository', taskClass: 'repository-review', requiredCapabilities: ['repository-review'], workflowId: 'workflow'});
  for (let index = 0; index < 2; index++) {
    outcome(runtime, decision.id, `parcel-a-${index}`, route('model-a'), {quality: .55});
    outcome(runtime, decision.id, `parcel-b-${index}`, route('model-b'), {quality: .95});
  }
  const selected = runtime.evaluateDecision(decision.id, {stageId: 'work', candidates: [
    {route: route('model-a'), eligible: true, reasons: [], capabilities: ['repository-review'], estimatedCost: .001, declaredOrder: 0},
    {route: route('model-b'), eligible: true, reasons: [], capabilities: ['repository-review'], estimatedCost: .02, declaredOrder: 1},
  ], workflowCandidates: [{id: 'workflow', version: '1', eligible: true, reasons: []}]});
  assert.equal(selected.selectedRoute?.route?.modelId, 'model-b');
  assert.equal(selected.selectedRoute?.evidenceSample, 2);
  assert.equal(selected.selectedRoute?.sparseEvidence, false);
  assert.ok(selected.nodes.some(node => node.kind === 'TRADEOFF'));
  assert.equal(runtime.modelLeague('repository-review').length, 2);
  assert.equal(runtime.modelLeague('repository-review').find(row => row.route.modelId === 'model-b')?.evidenceKinds.PRODUCTION_WORK_PARCEL, 2);
});

test('sparse evidence retains declared policy order and operational failures do not poison model quality', () => {
  const runtime = new AdaptiveOrchestrationRuntime(new MemoryAdaptiveOrchestrationStore(), {minimumSamplesForPreference: 3}, clock);
  const decision = runtime.startDecision({parcelId: 'parcel-sparse', objective: 'fix one issue', taskClass: 'debugging', requiredCapabilities: ['coding'], workflowId: 'workflow'});
  outcome(runtime, decision.id, 'parcel-sparse-evidence', route('model-a'), {quality: 1});
  outcome(runtime, decision.id, 'parcel-provider-failure', route('model-b'), {outcome: 'PROVIDER_FAILURE', failureClass: 'provider'});
  const selected = runtime.evaluateDecision(decision.id, {candidates: [
    {route: route('model-a'), eligible: true, reasons: [], capabilities: ['coding'], declaredOrder: 0},
    {route: route('model-b'), eligible: true, reasons: [], capabilities: ['coding'], declaredOrder: 1},
  ]});
  assert.equal(selected.selectedRoute?.route?.modelId, 'model-a');
  assert.equal(selected.selectedRoute?.sparseEvidence, true);
  const failure = runtime.modelLeague('debugging').find(row => row.route.modelId === 'model-b');
  assert.equal(failure?.sampleSize, 0);
  assert.equal(failure?.totalObservations, 1);
  assert.equal(failure?.operationalFailureRate, 1);
  assert.equal(failure?.qualityScore, null);
});

test('exploration is bounded, deterministic and limited to evidence-backed sparse routes', () => {
  const runtime = new AdaptiveOrchestrationRuntime(new MemoryAdaptiveOrchestrationStore(), {minimumSamplesForPreference: 3, explorationRate: 1}, clock);
  const decision = runtime.startDecision({parcelId: 'parcel-exploration', objective: 'debug one issue', taskClass: 'debugging', requiredCapabilities: ['coding']});
  outcome(runtime, decision.id, 'exploration-a', route('model-a'), {quality: .8});
  outcome(runtime, decision.id, 'exploration-b', route('model-b'), {quality: .8});
  const candidates = [{route: route('model-a'), eligible: true, reasons: [], capabilities: ['coding'], declaredOrder: 0}, {route: route('model-b'), eligible: true, reasons: [], capabilities: ['coding'], declaredOrder: 1}];
  const first = runtime.evaluateDecision(decision.id, {stageId: 'debug', candidates}), second = runtime.evaluateDecision(decision.id, {stageId: 'debug', candidates});
  assert.ok(['model-a', 'model-b'].includes(first.selectedRoute?.route?.modelId ?? ''));
  assert.equal(second.selectedRoute?.route?.modelId, first.selectedRoute?.route?.modelId);
  assert.equal(first.selectedRoute?.sparseEvidence, true);
  assert.ok(first.nodes.some(node => node.kind === 'ROUTE' && node.facts.exploration === true));
});

test('qualification, benchmark and production evidence remain visible as separate classes and reports reconstruct the same decision', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-adaptive-evidence-'));
  try {
    const file = path.join(root, 'adaptive.json'), first = new AdaptiveOrchestrationRuntime(new FileAdaptiveOrchestrationStore(file), {}, clock);
    const decision = first.startDecision({parcelId: 'parcel-history', objective: 'generate tests', taskClass: 'test-generation', requiredCapabilities: ['coding'], workflowId: 'workflow'});
    outcome(first, decision.id, 'qualification', route('model-a'), {quality: .9, evidenceKind: 'QUALIFICATION'});
    outcome(first, decision.id, 'benchmark', route('model-a'), {quality: .8, evidenceKind: 'BENCHMARK'});
    outcome(first, decision.id, 'production', route('model-a'), {quality: 1, evidenceKind: 'PRODUCTION_WORK_PARCEL'});
    first.evaluateDecision(decision.id, {candidates: [{route: route('model-a'), eligible: true, reasons: [], capabilities: ['coding']}], workflowCandidates: [{id: 'workflow', version: '1', eligible: true, reasons: []}]});
    const second = new AdaptiveOrchestrationRuntime(new FileAdaptiveOrchestrationStore(file), {}, clock), restored = second.decision(decision.id), report = second.report(decision.id), row = second.modelLeague('test-generation')[0], workflow = second.workflowLeague('test-generation')[0];
    assert.equal(restored.parcelId, 'parcel-history');
    assert.equal(report.reconciliation.modelEvidence, 3);
    assert.equal(report.reconciliation.workflowEvidence, 3);
    assert.deepEqual(row.evidenceKinds, {BENCHMARK: 1, QUALIFICATION: 1, PRODUCTION_WORK_PARCEL: 1});
    assert.equal(workflow.workflow.id, 'workflow');
    assert.ok(report.steps.some(step => step.kind === 'CLASSIFICATION'));
    assert.ok(report.steps.some(step => step.kind === 'EVIDENCE_UPDATE'));
    assert.equal(report.request.objectiveFingerprint.startsWith('sha256:'), true);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('normal Work Parcel dispatch creates and persists an adaptive decision and verified outcome', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-adaptive-parcel-'));
  try {
    const actions = new ActionRegistry(), definition: JobDefinition = {apiVersion: 'agent-control/v1', kind: 'Job', metadata: {id: 'adaptive-job', name: 'Adaptive job', version: '1.0.0'}, spec: {priority: 'normal', concurrency: 'queue', steps: [{id: 'work', action: 'adaptive-action@1.0.0', requires: ['qualification.local'], outputs: [{name: 'result', type: 'application/json', schema: 'adaptive/v1', version: '1.0.0'}], verification: ['passed']} ]}};
    actions.register('adaptive-action@1.0.0', async () => ({artifacts: [{name: 'result', value: {ok: true}}], verification: ['passed']}));
    const catalog = new JobCatalog(actions.ids()); catalog.addJob(definition);
    const workers = new WorkerRegistry().register({id: 'host', capabilities: ['qualification.local'], health: 'healthy', capacity: 1, active: 0, observedAt: clock()}), jobRuntime = new JobRuntime(catalog, actions, workers, new RunLedger(path.join(root, 'runs.json')), new ArtifactStore(path.join(root, 'artifacts')), new ResourceLockManager(path.join(root, 'locks.json')), {approval: () => true});
    const models = new ModelRegistry([{id: 'provider', kind: 'openai-compatible', baseUrl: 'https://provider.example/v1', enabled: true}], [{id: 'model-a', provider: 'provider', providerModel: 'model-a', capabilities: ['coding'], qualification: {state: 'QUALIFIED', version: 'qualification-1', capabilities: ['coding'], nodes: ['host']}}], {roles: {'coding': {primary: 'model-a', requires: ['coding']}}});
    const adaptive = new AdaptiveOrchestrationRuntime(new MemoryAdaptiveOrchestrationStore(), {}, clock), coordinator = new WorkParcelCoordinator(jobRuntime, new WorkParcelStore(path.join(root, 'parcels.json')), {plan: () => ({objective: 'run adaptive coding work', planner: {kind: 'deterministic', reason: 'fixture'}, stages: [{id: 'work', name: 'Work', job: 'adaptive-job@1.0.0', requestedRoute: {modelRole: 'coding', reason: 'test adaptive route'}}]})}, undefined, models, adaptive);
    const submitted = await coordinator.submit('run adaptive coding work', 'operator');
    await coordinator.tick();
    await jobRuntime.tick();
    await coordinator.tick();
    const parcel = coordinator.get(submitted.id), decision = adaptive.decision(parcel.audit.orchestrationDecisionId!);
    assert.equal(parcel.status, 'SUCCEEDED');
    assert.equal(decision.request.taskClass, 'coding');
    assert.ok(decision.nodes.some(node => node.kind === 'ROUTE' && node.status === 'SELECTED'));
    assert.ok(decision.outcomes.some(item => item.countsTowardQuality));
    assert.equal(adaptive.workflowLeague('coding')[0]?.sampleSize, 1);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('workflow league ranks complete strategies independently from model evidence', () => {
  const runtime = new AdaptiveOrchestrationRuntime(new MemoryAdaptiveOrchestrationStore(), {minimumSamplesForPreference: 2}, clock);
  const decision = runtime.startDecision({parcelId: 'parcel-workflow', objective: 'repair the repository', taskClass: 'repair', requiredCapabilities: ['coding'], workflowId: 'workflow-a'});
  for (let index = 0; index < 2; index++) {
    outcome(runtime, decision.id, `workflow-a-${index}`, route('model-a'), {quality: .75, workflow: 'workflow-a'});
    outcome(runtime, decision.id, `workflow-b-${index}`, route('model-a'), {quality: .95, workflow: 'workflow-b'});
  }
  const selected = runtime.evaluateDecision(decision.id, {workflowCandidates: [{id: 'workflow-a', version: '1', eligible: true, reasons: [], declaredOrder: 0}, {id: 'workflow-b', version: '1', eligible: true, reasons: [], declaredOrder: 1}]});
  assert.equal(selected.selectedWorkflow?.workflow?.id, 'workflow-b');
  assert.equal(runtime.workflowLeague('repair').find(row => row.workflow.id === 'workflow-a')?.sampleSize, 2);
  assert.equal(runtime.workflowLeague('repair').find(row => row.workflow.id === 'workflow-b')?.sampleSize, 2);
});

test('evidence filters and model versions preserve recency without deleting history', () => {
  let current = '2026-09-07T00:00:00.000Z';
  const runtime = new AdaptiveOrchestrationRuntime(new MemoryAdaptiveOrchestrationStore(), {minimumSamplesForPreference: 2, maxEvidenceAgeDays: 90}, () => current);
  const decision = runtime.startDecision({parcelId: 'parcel-age', objective: 'review code', taskClass: 'repository-review', requiredCapabilities: ['repository-review']});
  outcome(runtime, decision.id, 'old-1', route('model-old'), {quality: 1, observedAt: '2026-01-01T00:00:00.000Z'});
  outcome(runtime, decision.id, 'old-2', route('model-old'), {quality: 1, observedAt: '2026-01-02T00:00:00.000Z'});
  current = '2026-09-07T00:00:00.000Z';
  outcome(runtime, decision.id, 'new-1', route('model-new'), {quality: .8, observedAt: '2026-09-06T00:00:00.000Z'});
  const recent = runtime.modelLeague('repository-review', undefined, {maxAgeDays: 30});
  assert.equal(recent.length, 1);
  assert.equal(recent[0].route.modelId, 'model-new');
  assert.equal(runtime.modelLeague('repository-review').find(row => row.route.modelId === 'model-old')?.route.modelVersion, 'qualification-1');
  assert.equal(runtime.modelLeague('repository-review', undefined, {modelVersion: 'qualification-1', location: 'remote'}).length, 2);
  assert.equal(runtime.modelLeague('repository-review', undefined, {modelVersion: 'missing'}).length, 0);
});

test('cancelled and provider outcomes remain operational evidence and cannot become quality samples', () => {
  const runtime = new AdaptiveOrchestrationRuntime(new MemoryAdaptiveOrchestrationStore(), {minimumSamplesForPreference: 1}, clock);
  const decision = runtime.startDecision({parcelId: 'parcel-operational', objective: 'debug a service', taskClass: 'debugging', requiredCapabilities: ['coding']});
  outcome(runtime, decision.id, 'provider-failure', route('model-a'), {outcome: 'PROVIDER_FAILURE', failureClass: 'provider'});
  outcome(runtime, decision.id, 'cancelled', route('model-a'), {outcome: 'CANCELLED', failureClass: 'cancel', observationId: 'cancelled-attempt'});
  const row = runtime.modelLeague('debugging')[0];
  assert.equal(row.sampleSize, 0);
  assert.equal(row.totalObservations, 2);
  assert.equal(row.operationalFailureRate, 1);
  assert.equal(runtime.report(decision.id).steps.some(step => step.parentId), true);
});

test('disabled policy records the decision but does not select an adaptive route', () => {
  const runtime = new AdaptiveOrchestrationRuntime(new MemoryAdaptiveOrchestrationStore(), {enabled: false}, clock);
  const decision = runtime.startDecision({parcelId: 'parcel-disabled', objective: 'write code', taskClass: 'coding', requiredCapabilities: ['coding']});
  const evaluated = runtime.evaluateDecision(decision.id, {candidates: [{route: route('model-a'), eligible: true, reasons: [], capabilities: ['coding']}]});
  assert.equal(evaluated.selectedRoute, undefined);
  assert.ok(evaluated.nodes.some(node => node.kind === 'TRADEOFF' && node.status === 'EXCLUDED'));
  assert.match(runtime.report(decision.id).humanReadable, /adaptive-orchestration-disabled-by-policy/);
});

test('distinct observation IDs preserve repeated production outcomes for one route', () => {
  const runtime = new AdaptiveOrchestrationRuntime(new MemoryAdaptiveOrchestrationStore(), {minimumSamplesForPreference: 2}, clock);
  const decision = runtime.startDecision({parcelId: 'parcel-retries', objective: 'test code', taskClass: 'coding', requiredCapabilities: ['coding']});
  outcome(runtime, decision.id, 'retry-parcel', route('model-a'), {observationId: 'invocation-1'});
  outcome(runtime, decision.id, 'retry-parcel', route('model-a'), {observationId: 'invocation-2'});
  assert.equal(runtime.modelLeague('coding')[0].sampleSize, 2);
  assert.equal(runtime.decision(decision.id).outcomes.length, 2);
});

test('unavailable and policy-rejected routes remain visible and cannot be selected', () => {
  const runtime = new AdaptiveOrchestrationRuntime(new MemoryAdaptiveOrchestrationStore(), {minimumSamplesForPreference: 1, maxRouteCost: .05}, clock);
  const decision = runtime.startDecision({parcelId: 'parcel-rejected', objective: 'review code', taskClass: 'repository-review', requiredCapabilities: ['repository-review']});
  const selected = runtime.evaluateDecision(decision.id, {candidates: [
    {route: route('offline'), eligible: true, reasons: [], capabilities: ['repository-review'], availability: 'unavailable', declaredOrder: 0},
    {route: route('too-expensive'), eligible: true, reasons: [], capabilities: ['repository-review'], estimatedCost: .10, costAuthority: 'authoritative', availability: 'available', declaredOrder: 1},
    {route: route('missing-capability'), eligible: true, reasons: [], capabilities: ['coding'], availability: 'available', declaredOrder: 2},
  ]});
  assert.equal(selected.selectedRoute, undefined);
  const candidates = selected.nodes.find(node => node.kind === 'ELIGIBLE_CANDIDATES');
  assert.ok(candidates);
  const facts = JSON.stringify(candidates.facts);
  assert.match(facts, /availability-unavailable/);
  assert.match(facts, /policy-cost-ceiling/);
  assert.match(facts, /capability-repository-review-unproven/);
  assert.ok(selected.nodes.some(node => node.kind === 'ROUTE' && node.status === 'REJECTED'));
});

test('confidence contributes only after the quality preference floor is met', () => {
  const runtime = new AdaptiveOrchestrationRuntime(new MemoryAdaptiveOrchestrationStore(), {minimumSamplesForPreference: 1}, clock);
  const decision = runtime.startDecision({parcelId: 'parcel-confidence', objective: 'write code', taskClass: 'coding', requiredCapabilities: ['coding']});
  outcome(runtime, decision.id, 'low-sample', route('model-low'), {quality: .9, observationId: 'low-1'});
  for (let index = 0; index < 9; index++) outcome(runtime, decision.id, `high-sample-${index}`, route('model-high'), {quality: .9, observationId: `high-${index}`});
  const selected = runtime.evaluateDecision(decision.id, {candidates: [
    {route: route('model-low'), eligible: true, reasons: [], capabilities: ['coding'], availability: 'available', declaredOrder: 0},
    {route: route('model-high'), eligible: true, reasons: [], capabilities: ['coding'], availability: 'available', declaredOrder: 1},
  ]});
  assert.equal(selected.selectedRoute?.route?.modelId, 'model-high');
  assert.ok((selected.selectedRoute?.evidenceSample ?? 0) > 1);
});

test('review, repair and escalation remain explicit operational nodes while verified outcomes update leagues', () => {
  const runtime = new AdaptiveOrchestrationRuntime(new MemoryAdaptiveOrchestrationStore(), {minimumSamplesForPreference: 1}, clock);
  const decision = runtime.startDecision({parcelId: 'parcel-repair', objective: 'repair code', taskClass: 'repair', requiredCapabilities: ['coding']});
  runtime.recordOperationalNode(decision.id, {kind: 'QUALITY_GATE', status: 'REJECTED', stageId: 'draft', facts: {reason: 'quality-gate-rejected', observedQuality: .4}});
  runtime.recordOperationalNode(decision.id, {kind: 'REVIEW', status: 'SELECTED', stageId: 'review', facts: {route: 'provider/reviewer/model@host'}, reason: 'Independent reviewer required'});
  runtime.recordOutcome({decisionId: decision.id, parcelId: 'parcel-repair', stageId: 'review', observationId: 'review-1', route: route('reviewer'), capabilities: ['coding'], workflow: {id: 'draft-review-repair', version: '1'}, evidenceKind: 'PRODUCTION_WORK_PARCEL', outcome: 'REVIEW_REQUIRED', verified: true, qualityScore: .4, qualityGatePass: false, failureClass: 'model'});
  runtime.recordOperationalNode(decision.id, {kind: 'ESCALATION', status: 'SELECTED', stageId: 'repair', facts: {reason: 'quality-gate-rejected'}, reason: 'Escalate to bounded repair'});
  runtime.recordOperationalNode(decision.id, {kind: 'REPAIR', status: 'SELECTED', stageId: 'repair', facts: {route: 'provider/repair/model@host'}});
  runtime.recordOutcome({decisionId: decision.id, parcelId: 'parcel-repair', stageId: 'repair', observationId: 'repair-1', route: route('repair'), capabilities: ['coding'], workflow: {id: 'draft-review-repair', version: '1'}, evidenceKind: 'PRODUCTION_WORK_PARCEL', outcome: 'REPAIRED', verified: true, qualityScore: .9, qualityGatePass: true});
  const report = runtime.report(decision.id);
  assert.ok(report.steps.some(step => step.kind === 'REVIEW'));
  assert.ok(report.steps.some(step => step.kind === 'REPAIR'));
  assert.ok(report.steps.some(step => step.kind === 'ESCALATION'));
  assert.match(report.humanReadable, /quality-gate-rejected|Escalation observed/);
  assert.match(report.humanReadable, /Measurements and immutable evidence/);
  assert.match(report.humanReadable, /evidence parcel-repair:review:provider\/default\/reviewer@host#qualification-1:review-1:REVIEW_REQUIRED/);
  assert.equal(runtime.modelLeague('repair').reduce((total, row) => total + row.sampleSize, 0), 2);
});

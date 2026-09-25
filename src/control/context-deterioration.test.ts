import assert from 'node:assert/strict';
import test from 'node:test';
import {compileExperimentContext, ContextDeteriorationExperiment, type ContextExperimentTask} from './context-deterioration.js';

const task: ContextExperimentTask = {id: 'context-fixture', question: 'Which claims survive?', expectedClaims: ['claim-a','claim-b'], expectedEvidenceIds: ['evidence-a','evidence-b'], items: [
  {id: 'task', kind: 'task', content: 'Inspect claims.', estimatedTokens: 5, evidenceIds: [], required: true},
  {id: 'evidence-a', kind: 'evidence', content: 'A is true.', estimatedTokens: 8, evidenceIds: ['evidence-a']},
  {id: 'evidence-b', kind: 'evidence', content: 'B is true.', estimatedTokens: 8, evidenceIds: ['evidence-b']},
  {id: 'summary', kind: 'summary', content: 'A and B matter.', estimatedTokens: 6, evidenceIds: []},
  {id: 'baton', kind: 'baton', content: 'claim-a=evidence-a; claim-b=evidence-b', estimatedTokens: 7, evidenceIds: ['evidence-a','evidence-b']},
  {id: 'history', kind: 'history', content: 'Long unrelated conversation.', estimatedTokens: 100, evidenceIds: []},
]};

test('context policies compile distinct immutable hash-addressed transfers', () => {
  const full = compileExperimentContext('full', task.items, 200), evidence = compileExperimentContext('evidence-only', task.items, 30), baton = compileExperimentContext('structured-baton', task.items, 30);
  assert.ok(full.tokens > evidence.tokens); assert.deepEqual(evidence.selected.map(item => item.kind), ['task','evidence','evidence']); assert.ok(baton.selected.some(item => item.kind === 'baton')); assert.notEqual(full.transferredHash, evidence.transferredHash); assert.equal(full.sourceHash, evidence.sourceHash);
});

test('context deterioration metrics quantify recall precision evidence contradictions and loss', async () => {
  const experiment = new ContextDeteriorationExperiment({run: async ({policy}) => policy === 'summary-only'
    ? {claims: [{id: 'claim-a', evidenceIds: []}, {id: 'invented', evidenceIds: [], contradicted: true}], unresolved: ['claim-b'], inputTokens: null, outputTokens: null, cost: null, currency: null, latencyMs: 20}
    : {claims: [{id: 'claim-a', evidenceIds: ['evidence-a']}, {id: 'claim-b', evidenceIds: ['evidence-b']}], unresolved: [], inputTokens: 20, outputTokens: 5, cost: .001, currency: 'USD', latencyMs: 10}}, ['full','summary-only']);
  const [full, summary] = await experiment.run(task, 200); assert.equal(full.claimRecall, 1); assert.equal(full.evidenceRetention, 1); assert.equal(summary.claimRecall, .5); assert.equal(summary.claimPrecision, .5); assert.equal(summary.unsupportedClaimRate, 1); assert.equal(summary.contradictionRate, .5); assert.equal(summary.semanticLoss, .5); assert.equal(summary.cost, null);
});

test('required context fails closed instead of silently exceeding budget', () => assert.throws(() => compileExperimentContext('full', task.items, 4), /required_experiment_context_exceeds_budget/));

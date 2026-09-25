import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addParcelQuestion,
  addSteeringAmendment,
  addSuccessCriterion,
  allSuccessCriteriaPass,
  answerParcelQuestion,
  appendParcelContextEvent,
  createBatonView,
  createParcelContext,
  evaluateSuccessCriterion,
  retrieveParcelContext,
  updateParcelActiveState,
  verifyParcelContextEventChain,
} from './parcel-context.js';

const at = (second: number) => `2026-09-05T10:00:${String(second).padStart(2, '0')}.000Z`;

test('parcel context separates the immutable original goal from interpretations and steering', () => {
  const context = createParcelContext({goal: 'Ship the exact requested report', actor: 'operator', plan: [{id: 'inspect', name: 'Inspect'}], at: at(0)});
  const amendment = addSteeringAmendment(context, {instruction: 'Exclude generated files', constraints: ['no deployment'], affectedStageIds: ['inspect'], actor: 'operator', at: at(1)});
  assert.equal(context.active.originalGoal, 'Ship the exact requested report');
  assert.match(context.active.currentInterpretation, /Exclude generated files/);
  assert.deepEqual(context.active.effectiveInstructions, ['Exclude generated files']);
  assert.deepEqual(context.active.constraints, ['no deployment']);
  addSteeringAmendment(context, {instruction: 'Include generated files only in counts', actor: 'operator', supersedes: [amendment.id], at: at(2)});
  assert.deepEqual(context.active.effectiveInstructions, ['Include generated files only in counts']);
  assert.equal(context.amendments[0].status, 'SUPERSEDED');
  assert.equal(verifyParcelContextEventChain(context.events), true);
});

test('asynchronous questions preserve independent state and answers become durable retrievable events', () => {
  const context = createParcelContext({goal: 'Run independent branches', actor: 'operator', plan: [{id: 'left', name: 'Left'}, {id: 'right', name: 'Right'}], at: at(0)});
  const question = addParcelQuestion(context, {id: 'q1', text: 'Which output format?', originatingStageId: 'left', dependentStageIds: ['left'], priority: 'HIGH', consequence: 'MEDIUM', actor: 'agent:left', at: at(1)});
  assert.deepEqual(context.active.unresolvedQuestionIds, ['q1']);
  answerParcelQuestion(context, question.id, 'Use concise JSON', 'operator', at(2));
  assert.deepEqual(context.active.unresolvedQuestionIds, []);
  const found = retrieveParcelContext(context, {query: 'concise JSON output format', actor: 'agent:left', at: at(3)});
  assert.equal(found[0].type, 'question.answered');
  assert.match(found[0].summary, /Question answered/);
  assert.equal(context.metrics.retrievals, 1);
  assert.equal(verifyParcelContextEventChain(context.events), true);
});

test('governed retrieval recovers an old failure without copying the full event ledger into a baton', () => {
  const context = createParcelContext({goal: 'Diagnose and finish', actor: 'operator', at: at(0)});
  appendParcelContextEvent(context, {type: 'stage.failed', stageId: 'compile', summary: 'Compiler failed on stale generated schema', detail: {failure: 'schema hash mismatch'}, tags: ['failure'], at: at(1)});
  for (let index = 0; index < 80; index++) appendParcelContextEvent(context, {type: 'tool.result', summary: `Routine observation ${index} ${'x'.repeat(200)}`, detail: {index}, tags: ['routine'], at: at(2)});
  updateParcelActiveState(context, {plan: [{id: 'compile', name: 'Compile', status: 'FAILED'}, {id: 'repair', name: 'Repair', dependsOn: ['compile'], status: 'WAITING'}], at: at(3)});
  const retrieved = retrieveParcelContext(context, {query: 'schema hash mismatch compiler failure', limit: 2, actor: 'agent:repair', at: at(4)});
  assert.equal(retrieved[0].type, 'stage.failed');
  const baton = createBatonView(context, {sourceStageIds: ['compile'], targetStageId: 'repair', nextAction: 'Repair the stale schema and rerun typecheck', selectedEventIds: [retrieved[0].id], maxBytes: 8_192, at: at(5)});
  assert.ok(baton.sizeBytes <= 8_192);
  assert.equal(baton.estimatedTokens, Math.ceil(baton.sizeBytes / 4));
  assert.ok(context.metrics.eventLedgerBytes > baton.sizeBytes);
  assert.ok(context.metrics.historicalBytesExcludedFromLatestBaton > 0);
  assert.ok(baton.eventRefs.some(item => item.id === retrieved[0].id));
  assert.equal(context.events.length, 84);
  assert.equal(verifyParcelContextEventChain(context.events), true);
});

test('success criteria carry source provenance and block success until every criterion passes', () => {
  const context = createParcelContext({goal: 'Qualify outcome', actor: 'operator', at: at(0)});
  const inferred = addSuccessCriterion(context, {id: 'tests', kind: 'TESTS_PASS', description: 'Full suite passes', source: 'INFERRED', sourceActor: 'planner', requiredEvidence: ['test-log'], at: at(1)});
  const explicit = addSuccessCriterion(context, {id: 'approval', kind: 'USER_APPROVAL', description: 'Operator accepts result', source: 'USER', sourceActor: 'operator', at: at(2)});
  assert.equal(allSuccessCriteriaPass(context), false);
  evaluateSuccessCriterion(context, inferred.id, {status: 'PASS', evidence: ['test-log:sha256:abc'], actor: 'verifier', at: at(3)});
  assert.equal(allSuccessCriteriaPass(context), false);
  evaluateSuccessCriterion(context, explicit.id, {status: 'PASS', evidence: ['operator:accepted'], actor: 'operator', at: at(4)});
  assert.equal(allSuccessCriteriaPass(context), true);
  assert.deepEqual(context.criteria.map(item => [item.source, item.sourceActor, item.status]), [['INFERRED', 'planner', 'PASS'], ['USER', 'operator', 'PASS']]);
});

test('context and batons redact credential-shaped material before persistence', () => {
  const context = createParcelContext({goal: 'Never persist sk-proj-abcdefghijklmnop', actor: 'operator', at: at(0)});
  appendParcelContextEvent(context, {type: 'provider.error', summary: 'Bearer abcdefghijklmnopqrstuvwxyz failed', detail: {apiKey: 'sk-proj-abcdefghijklmnop', safe: 'password=hunter2'}, tags: ['error'], at: at(1)});
  const baton = createBatonView(context, {sourceStageIds: [], nextAction: 'Continue safely', at: at(2)});
  const persisted = JSON.stringify({context, baton});
  assert.doesNotMatch(persisted, /sk-proj-abcdefghijklmnop|abcdefghijklmnopqrstuvwxyz|hunter2/);
  assert.match(persisted, /REDACTED/);
});

test('tampering with an immutable event is detected before another event or baton can be produced', () => {
  const context = createParcelContext({goal: 'Protect provenance', actor: 'operator', at: at(0)});
  context.events[0].summary = 'tampered';
  assert.throws(() => verifyParcelContextEventChain(context.events), /parcel_context_event_hash_invalid/);
  assert.throws(() => appendParcelContextEvent(context, {type: 'tool.result', summary: 'must not append'}), /parcel_context_event_hash_invalid/);
  assert.throws(() => createBatonView(context, {sourceStageIds: [], nextAction: 'must not seal'}), /parcel_context_event_hash_invalid/);
});

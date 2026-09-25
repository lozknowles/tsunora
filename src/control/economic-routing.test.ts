import assert from 'node:assert/strict';
import test from 'node:test';
import {DynamicEscalationRouter, EconomicRouter, type RouteCandidate, type RoutingRequest} from './economic-routing.js';

function candidate(id: string, local: boolean, latencyMs: number, cost: number): RouteCandidate {
  return {
    id, providerId: `provider-${id}`, modelId: `model-${id}`, workerId: `worker-${id}`, local,
    health: 'healthy', qualified: true, qualificationReason: 'qualification-pass', capabilities: ['code'],
    pricing: {currency: 'TEST', billing: cost ? 'metered' : 'free', inputPerMillionTokens: 0, outputPerMillionTokens: 0, fixedPerRequest: cost, effectiveFrom: '2026-08-24'},
    performance: {startupLatencyMs: latencyMs, inputTokensPerSecond: 1_000_000, outputTokensPerSecond: 1_000_000, historicalSuccessRate: local ? .9 : .98, expectedQuality: local ? .8 : .95, confidence: local ? .8 : .95, contextLimitTokens: 64_000, source: 'measured', sampleSize: 20},
  };
}
const local = candidate('local', true, 30 * 60_000, 0), remote = candidate('remote', false, 60_000, .4);
const request = (intent: RoutingRequest['intent']): RoutingRequest => ({taskId: 'task-1', taskType: 'code', intent, requiredCapabilities: ['code'], inputTokens: 1000, outputTokens: 1000, meteredApproved: true});

test('economic intent rejects metered initial route and chooses qualified local route', () => {
  const decision = new EconomicRouter().route(request('ECONOMY'), [remote, local]);
  assert.equal(decision.selected?.candidate.id, 'local');
  assert.ok(decision.assessments.find(item => item.candidate.id === 'remote')?.rejectionReasons.includes('metered_initial_disabled'));
});

test('urgent intent values latency and can choose qualified metered route', () => {
  assert.equal(new EconomicRouter().route(request('URGENT'), [local, remote]).selected?.candidate.id, 'remote');
});

test('qualification capability approval confidence quality spend and latency gates fail closed', () => {
  const blocked: RouteCandidate = {...remote, qualified: false, qualificationReason: 'suite-missing', health: 'degraded', capabilities: []};
  const decision = new EconomicRouter().route({...request('URGENT'), maximumLatencyMs: 100, maximumMonetarySpend: .01, meteredApproved: false}, [blocked]);
  assert.equal(decision.selected, undefined);
  const reasons = decision.assessments[0].rejectionReasons;
  assert.ok(reasons.includes('provider_degraded'));
  assert.ok(reasons.some(reason => reason.startsWith('unqualified:')));
  assert.ok(reasons.some(reason => reason.startsWith('missing_capabilities:')));
  assert.ok(reasons.includes('latency_budget'));
  assert.ok(reasons.includes('spend_budget'));
});

test('dynamic escalation preserves context and checkpoint references', () => {
  const decision = new DynamicEscalationRouter(new EconomicRouter()).reevaluate(request('ECONOMY'), [local, remote], {routeId: 'local', elapsedMs: 1000, failures: 1, contextRef: 'context-1', checkpointRef: 'checkpoint-1'});
  assert.equal(decision.action, 'escalate');
  assert.equal(decision.route?.candidate.id, 'remote');
  assert.deepEqual(decision.preserve, {contextRef: 'context-1', checkpointRef: 'checkpoint-1'});
});

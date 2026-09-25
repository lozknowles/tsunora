import assert from 'node:assert/strict';
import test from 'node:test';
import {chooseRoute, type RouteOption, type RouteRequest} from './routing.js';

const api: RouteOption = {id: 'api-fast', providerId: 'api', model: 'strong-fast', location: 'remote', health: 'healthy', qualifiedCapabilities: ['coding', 'tool_use'], tools: ['shell'], contextCapacity: 128000, capabilityScore: .95, reliability: .96, estimatedLatencyMs: 500, estimatedDurationMs: 12000, estimatedCost: 1.2, available: true};
const local: RouteOption = {id: 'local-slow', providerId: 'local', model: 'qualified-local', location: 'local', health: 'healthy', qualifiedCapabilities: ['coding', 'tool_use'], tools: ['shell'], contextCapacity: 32768, capabilityScore: .88, reliability: .9, estimatedLatencyMs: 8000, estimatedDurationMs: 180000, estimatedCost: 0, gpuRequired: true, available: true};
const base: RouteRequest = {capabilities: ['coding'], tools: ['shell'], contextTokens: 16000, urgency: 'normal', priority: 50, costSensitivity: .5, latencySensitivity: .5, reliabilitySensitivity: .5, privacy: 'standard', localComputeAvailable: true, gpuAvailable: true};

test('urgent routing can favour a faster qualified API route', () => { const decision = chooseRoute({...base, urgency: 'high', costSensitivity: .05, latencySensitivity: 1}, [local, api]); assert.equal(decision.selected.id, 'api-fast'); assert.ok(decision.rationale.some(item => item.factor === 'latency')); });
test('cost-sensitive overnight routing can favour qualified local execution', () => { const decision = chooseRoute({...base, urgency: 'low', costSensitivity: 1, latencySensitivity: .05}, [api, local]); assert.equal(decision.selected.id, 'local-slow'); assert.ok(decision.rationale.some(item => item.factor === 'cost')); });
test('unavailable and unqualified routes fail closed', () => { const offline = {...api, id: 'offline', health: 'offline' as const}, unqualified = {...local, id: 'wrong', qualifiedCapabilities: []}; assert.throws(() => chooseRoute(base, [offline, unqualified]), /no_qualified_route/); });
test('local-only privacy excludes remote providers', () => { const decision = chooseRoute({...base, privacy: 'local_only'}, [api, local]); assert.equal(decision.selected.id, 'local-slow'); assert.equal(decision.considered.find(item => item.optionId === 'api-fast')?.eligible, false); });

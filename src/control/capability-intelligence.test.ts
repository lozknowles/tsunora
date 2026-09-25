import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  CapabilityIntelligenceStore,
  genericCapabilityIds,
  normalizeCapabilityId,
  rankCapabilityRoutes,
  registerAgentControlCoreCapabilities,
} from './capability-intelligence.js';

const subject = {providerId: 'provider-a', modelId: 'model-a', runtimeId: 'api', nodeId: 'controller'};
const observation = (capabilityId: string, overrides: Record<string, unknown> = {}) => ({
  capabilityId,
  subject,
  support: 'SUPPORTED' as const,
  implementation: 'NATIVE' as const,
  verification: 'VERIFIED' as const,
  confidence: 1,
  observedAt: '2026-09-05T10:00:00.000Z',
  qualifiedAt: '2026-09-05T10:00:00.000Z',
  limitations: [],
  evidence: ['qualification:q1'],
  source: 'QUALIFICATION' as const,
  ...overrides,
});

test('provider vocabulary normalizes to generic capability identities', () => {
  assert.equal(normalizeCapabilityId('supports_context_retrieval'), genericCapabilityIds.contextRetrieval);
  assert.equal(normalizeCapabilityId('computer.use'), genericCapabilityIds.computerUse);
  assert.equal(normalizeCapabilityId('repository_review'), genericCapabilityIds.repositoryReview);
  assert.equal(normalizeCapabilityId('reasoning'), genericCapabilityIds.generalReasoning);
});

test('verified provider-native capability is distinguished from verified Agent Control emulation', () => {
  const store = new CapabilityIntelligenceStore();
  registerAgentControlCoreCapabilities(store, '2026-09-05T09:00:00.000Z');
  store.observe(observation('supports_computer_use'));
  const native = store.assess(subject, ['tool.computer-use']);
  const emulated = store.assess(subject, ['supports_context_retrieval']);
  assert.deepEqual(native.map(item => [item.satisfied, item.implementation, item.reason]), [[true, 'NATIVE', 'verified-native-capability']]);
  assert.deepEqual(emulated.map(item => [item.satisfied, item.implementation, item.reason]), [[true, 'AGENT_CONTROL_EMULATED', 'verified-agent-control-emulation']]);
  assert.equal(store.assess(subject, ['context.retrieval'], {allowEmulated: false})[0].satisfied, false);
});

test('advertised but unqualified capability cannot satisfy a route', () => {
  const store = new CapabilityIntelligenceStore();
  store.observe(observation('coding', {verification: 'UNVERIFIED', qualifiedAt: undefined, confidence: .5, source: 'ADAPTER'}));
  assert.deepEqual(store.assess(subject, ['code.modify']).map(item => [item.satisfied, item.reason]), [[false, 'capability-unverified']]);
});

test('qualified capability evidence is not shadowed by a later unverified configuration claim', () => {
  const store = new CapabilityIntelligenceStore();
  store.observe(observation('coding', {id: 'qualified', observedAt: '2026-09-05T10:00:00.000Z'}));
  store.observe(observation('coding', {id: 'advertised-later', subject: {providerId: 'provider-a', modelId: 'model-a'}, verification: 'UNVERIFIED', qualifiedAt: undefined, confidence: .5, source: 'ADAPTER', observedAt: '2026-09-05T11:00:00.000Z'}));
  const assessment = store.assess(subject, ['code.modify'])[0];
  assert.equal(assessment.satisfied, true);
  assert.equal(assessment.observationId, 'qualified');
});

test('capability harvesting lifecycle is ordered, auditable and durable across restart', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-capabilities-')), file = path.join(root, 'capabilities.json'), store = new CapabilityIntelligenceStore(file);
  const candidate = store.discoverCandidate({id: 'candidate:new-context', title: 'Native context continuation', source: 'provider release notes', providerRuntime: 'runtime-a@1', claimedCapability: 'context.lifecycle', whyItMatters: 'reduces repeated context', agentControlEquivalent: 'provider-neutral context lifecycle', evidence: ['source:release'], actor: 'reviewer', at: '2026-09-01T00:00:00Z'});
  assert.throws(() => store.transitionCandidate(candidate.id, {to: 'ADOPTED', reason: 'skip gates', finalDecision: 'adopt', actor: 'reviewer'}), /capability_candidate_transition_invalid/);
  store.transitionCandidate(candidate.id, {to: 'ANALYSED', reason: 'mapped semantics', actor: 'reviewer', at: '2026-09-01T00:00:01Z'});
  store.transitionCandidate(candidate.id, {to: 'CLASSIFIED', classification: 'GENERIC', reason: 'portable pattern', actor: 'reviewer', at: '2026-09-01T00:00:02Z'});
  store.transitionCandidate(candidate.id, {to: 'EXPERIMENT', experiment: 'bounded A/B continuation', reason: 'experiment designed', actor: 'reviewer', at: '2026-09-01T00:00:03Z'});
  store.transitionCandidate(candidate.id, {to: 'QUALIFICATION', measuredOutcome: 'saved 41% repeated tokens', reason: 'experiment passed', actor: 'reviewer', evidence: ['experiment:sha256:abc'], at: '2026-09-01T00:00:04Z'});
  store.transitionCandidate(candidate.id, {to: 'ADOPTED', finalDecision: 'adopt generic lifecycle, keep provider call in adapter', reason: 'qualified', actor: 'operator', evidence: ['qualification:sha256:def'], at: '2026-09-01T00:00:05Z'});
  const restored = new CapabilityIntelligenceStore(file).candidate(candidate.id)!;
  assert.equal(restored.state, 'ADOPTED');
  assert.equal(restored.classification, 'GENERIC');
  assert.deepEqual(restored.history.map(item => item.to), ['DISCOVERED','ANALYSED','CLASSIFIED','EXPERIMENT','QUALIFICATION','ADOPTED']);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).schema, 'agent-control.capability-intelligence/v1');
});

test('capabilities-first routing excludes a cheaper incapable route and records native versus emulated basis', () => {
  const store = new CapabilityIntelligenceStore(); registerAgentControlCoreCapabilities(store);
  store.observe(observation('tool.computer-use'));
  const result = rankCapabilityRoutes(store, [
    {id: 'cheap-no-computer', subject: {providerId: 'provider-b', modelId: 'cheap'}, available: true, qualificationConfidence: 1, quality: 1, reliability: 1, estimatedCost: .01, estimatedLatencyMs: 10, tokenEfficiency: 1, cacheEfficiency: 1, local: false, privacyCompatible: true},
    {id: 'qualified-native', subject, available: true, qualificationConfidence: .9, quality: .8, reliability: .9, estimatedCost: 1, estimatedLatencyMs: 1_000, tokenEfficiency: .7, cacheEfficiency: .7, local: false, privacyCompatible: true},
  ], {required: ['tool.computer-use', 'context.retrieval'], nativePreferred: ['tool.computer-use']});
  assert.equal(result.selected.id, 'qualified-native');
  assert.deepEqual(result.rationale.nativeUsed, ['tool.computer-use']);
  assert.deepEqual(result.rationale.emulatedUsed, ['context.retrieval']);
  assert.ok(result.considered.find(item => item.candidate.id === 'cheap-no-computer')?.reasons.some(reason => reason.includes('tool.computer-use')));
});

test('capability evidence redacts credential material', () => {
  const store = new CapabilityIntelligenceStore();
  const recorded = store.observe(observation('coding', {evidence: ['Bearer abcdefghijklmnopqrstuvwxyz'], limitations: ['apiKey=sk-proj-abcdefghijklmnop']}));
  assert.doesNotMatch(JSON.stringify(recorded), /abcdefghijklmnopqrstuvwxyz|sk-proj-abcdefghijklmnop/);
});

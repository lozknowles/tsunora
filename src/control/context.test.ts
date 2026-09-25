import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {ControlPlane} from '../control-plane.js';
import type {LaneState, WorkspaceState} from '../state.js';
import {
  ConsensusJudge,
  ContextRouter,
  ContextStore,
  LaneContextService,
  loadSelectedContext,
  type ContextSourceInput,
} from './context.js';
import {PtyRegistry} from './pty.js';

const taskId = 'task-shared-context';
const now = '2026-08-23T12:00:00.000Z';

function lane(id: number, holder: string | null = null): LaneState {
  return {
    id,
    name: `Lane ${id}`,
    status: id === 1 ? 'working' : 'waiting',
    model: 'codex',
    reasoning: 'medium',
    context: '',
    contract: {
      version: 2,
      laneId: id,
      goal: 'Qualify shared context',
      constraints: [],
      cwd: '/repo',
      priority: 100 - id,
      mode: 'auto',
      capabilities: {requires: [], prefers: []},
      modelLock: null,
      sharedTaskIds: [taskId],
      git: {branch: 'feature/context', head: 'abc123'},
      updatedAt: now,
    },
    baton: {
      version: 1,
      laneId: id,
      revision: 1,
      status: 'working',
      progress: [],
      hypothesis: '',
      evidence: [],
      changes: [],
      nextAction: 'continue',
      openQuestions: [],
      model: 'codex',
      reasoning: 'medium',
      updatedAt: now,
    },
    lease: {laneId: id, holder, acquiredAt: holder ? now : null, expiresAt: holder ? '2099-01-01T00:00:00.000Z' : null},
    lines: [],
  };
}

function workspace(count = 4): WorkspaceState {
  return {version: 1, paused: false, lastRestorePoint: null, lanes: Array.from({length: count}, (_, index) => lane(index + 1, index === 0 ? 'agent-a' : null))};
}

function tempStore(): ContextStore {
  return new ContextStore(path.join(mkdtempSync(path.join(os.tmpdir(), 'agent-control-context-')), 'context.json'));
}

function sharedThread(overrides: Partial<ContextSourceInput> = {}): ContextSourceInput {
  return {
    type: 'openai_shared_thread',
    provider: 'openai',
    url: 'https://chatgpt.com/share/thread-a',
    originatingLaneId: 1,
    originatingAgent: 'agent-a',
    originatingProvider: 'codex',
    originatingModel: 'gpt-test',
    taskId,
    repository: '/repo',
    branch: 'feature/context',
    commitSha: 'abc123',
    description: 'Visible investigation and failed approaches',
    classification: 'agent_observation',
    accessibility: 'available',
    estimatedTokens: 800,
    ...overrides,
  };
}

test('lane attaches a provider-neutral context source and baton references it', () => {
  const state = workspace(), store = tempStore(), service = new LaneContextService(state, store, () => undefined);
  const attached = service.attach(1, sharedThread());
  assert.equal(attached.created, true);
  assert.deepEqual(state.lanes[0].baton.contextSourceIds, [attached.source.id]);
  assert.equal(attached.source.originatingLaneId, 1);
});

test('duplicate source attachment is idempotent', () => {
  const state = workspace(), store = tempStore(), service = new LaneContextService(state, store, () => undefined);
  const first = service.attach(1, sharedThread()), second = service.attach(1, sharedThread());
  assert.equal(second.created, false);
  assert.equal(second.source.id, first.source.id);
  assert.equal(state.lanes[0].baton.contextSourceIds?.length, 1);
});

test('context source, evidence and conclusion survive persistence reload', () => {
  const store = tempStore(), source = store.attachSource(sharedThread()).source;
  const evidence = store.addEvidence({taskId, classification: 'repository_evidence', description: 'Tracked diff', sourceId: source.id, repository: '/repo', commitSha: 'abc123'});
  const conclusion = store.addConclusion({taskId, laneId: 1, agentId: 'agent-a', claim: 'Use the adapter', confidence: .8, evidenceIds: [evidence.id], contextSourceIds: [source.id], independent: true});
  const reloaded = ContextStore.load(store.file);
  assert.equal(reloaded.getSource(source.id)?.url, source.url);
  assert.equal(reloaded.getEvidence(evidence.id)?.commitSha, 'abc123');
  assert.equal(reloaded.getConclusion(conclusion.id)?.claim, 'Use the adapter');
});

test('baton context references survive workspace persistence restart', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agent-control-workspace-'));
  const file = path.join(dir, 'workspace.json');
  const state = workspace(), store = tempStore();
  const service = new LaneContextService(state, store, value => writeFileSync(file, JSON.stringify(value)));
  const source = service.attach(1, sharedThread()).source;
  const restored = JSON.parse(readFileSync(file, 'utf8')) as WorkspaceState;
  assert.deepEqual(restored.lanes[0].baton.contextSourceIds, [source.id]);
});

test('handoff carries context references and receiving lane discovers source', () => {
  const state = workspace(2), store = tempStore(), service = new LaneContextService(state, store, () => undefined);
  const source = service.attach(1, sharedThread()).source;
  new ControlPlane(state).handoff(1, 2, 'agent-b');
  assert.deepEqual(state.lanes[1].baton.contextSourceIds, [source.id]);
  assert.equal(service.discover(2, taskId)[0].id, source.id);
});

test('handoff without context remains valid and injects nothing', () => {
  const state = workspace(2), service = new LaneContextService(state, tempStore(), () => undefined);
  new ControlPlane(state).handoff(1, 2, 'agent-b');
  assert.deepEqual(state.lanes[1].baton.contextSourceIds ?? [], []);
  assert.deepEqual(service.discover(2, taskId), []);
});

test('router selects minimum sufficient tier instead of loading every thread', () => {
  const state = workspace(), store = tempStore(), service = new LaneContextService(state, store, () => undefined), router = new ContextRouter(store);
  service.attach(1, sharedThread());
  const low = router.select(routeRequest(state.lanes[0], {complexity: 'low', confidence: .95}));
  assert.equal(low.tier, 1);
  assert.deepEqual(low.contextSourceIds, []);
  const high = router.select(routeRequest(state.lanes[0], {complexity: 'high', confidence: .5}));
  assert.equal(high.tier, 3);
  assert.equal(high.contextSourceIds.length, 1);
});

test('context budget escalation records tier and respects token limits', () => {
  const state = workspace(), store = tempStore(), service = new LaneContextService(state, store, () => undefined), router = new ContextRouter(store);
  service.attach(1, sharedThread({estimatedTokens: 5000}));
  const selection = router.select(routeRequest(state.lanes[0], {complexity: 'high', confidence: .4, maxContextTokens: 1000}));
  assert.equal(selection.tier, 3);
  assert.equal(selection.contextSourceIds.length, 0);
  assert.equal(selection.omitted[0].reason, 'token_budget');
  assert.equal(router.escalate(selection, 'decision_disputed').tier, 4);
  assert.equal(store.accessHistory(taskId).at(-1)?.tier, 3);
});

test('inaccessible source fails gracefully while repository evidence remains', async () => {
  const state = workspace(), store = tempStore(), service = new LaneContextService(state, store, () => undefined), router = new ContextRouter(store);
  const source = service.attach(1, sharedThread({accessibility: 'authentication_required'})).source;
  const evidence = store.addEvidence({taskId, classification: 'repository_evidence', description: 'Commit exists', commitSha: 'abc123'});
  const selection = router.select(routeRequest(state.lanes[0], {complexity: 'high', confidence: .4}));
  assert.deepEqual(selection.contextSourceIds, []);
  assert.deepEqual(selection.evidenceIds, [evidence.id]);
  assert.deepEqual(selection.omitted, [{sourceId: source.id, reason: 'source_authentication_required'}]);
  assert.deepEqual(await loadSelectedContext(store, {...selection, contextSourceIds: [source.id]}, {read: async () => { throw new Error('must not fetch'); }}), {materials: [], failures: [{sourceId: source.id, error: 'source_authentication_required'}]});
});

test('unsupported provider source remains metadata and is never injected', () => {
  const state = workspace(), store = tempStore(), service = new LaneContextService(state, store, () => undefined), router = new ContextRouter(store);
  const source = service.attach(1, sharedThread({type: 'future_conversation_provider', provider: 'future', accessibility: 'unsupported'})).source;
  const selection = router.select(routeRequest(state.lanes[0], {complexity: 'high', confidence: .4}));
  assert.deepEqual(selection.contextSourceIds, []);
  assert.deepEqual(selection.omitted, [{sourceId: source.id, reason: 'source_unsupported'}]);
});

test('stale commit association is visible and never mistaken for current repository evidence', () => {
  const state = workspace(), store = tempStore(), service = new LaneContextService(state, store, () => undefined), router = new ContextRouter(store);
  const source = service.attach(1, sharedThread({commitSha: 'old123'})).source;
  assert.equal(store.assessCommit(source, 'abc123'), 'stale');
  const selection = router.select(routeRequest(state.lanes[0], {complexity: 'high', confidence: .4, currentCommit: 'abc123'}));
  assert.ok(selection.warnings.includes(`stale_commit:${source.id}:old123`));
});

test('three independent agents remain separate until judge synthesis', () => {
  const store = tempStore();
  const conclusions = [
    conclusion(store, 1, 'agent-a', 'Adopt shared context', 'verified_executable', .9),
    conclusion(store, 2, 'agent-b', 'Adopt shared context', 'repository_evidence', .8),
    conclusion(store, 3, 'agent-c', 'Do not adopt shared context', 'agent_interpretation', .7),
  ];
  assert.ok(conclusions.every(item => item.independent));
  const decision = new ConsensusJudge(store).synthesize(taskId, 4, conclusions.map(item => item.id), 3);
  assert.equal(decision.conclusion, 'Adopt shared context');
  assert.equal(decision.dissentingConclusionIds.length, 1);
  assert.equal(decision.contextTier, 3);
});

test('evidence quality outweighs majority repetition of unsupported assertions', () => {
  const store = tempStore();
  const unsupported = [1, 2, 3].map(index => conclusion(store, index, `agent-${index}`, 'Unsafe claim', 'unsupported_assertion', .95));
  const verified = conclusion(store, 4, 'agent-verified', 'Verified claim', 'verified_executable', .8);
  const decision = new ConsensusJudge(store).synthesize(taskId, 5, [...unsupported, verified].map(item => item.id), 4);
  assert.equal(decision.conclusion, 'Verified claim');
  assert.equal(decision.selectedConclusionId, verified.id);
  assert.equal(decision.dissentingConclusionIds.length, 3);
});

test('independent judge rejects contaminated and duplicate-lane submissions', () => {
  const store = tempStore();
  const a = conclusion(store, 1, 'agent-a', 'A', 'repository_evidence', .8);
  const contaminated = store.addConclusion({taskId, laneId: 2, agentId: 'agent-b', claim: 'B', confidence: .8, evidenceIds: [], contextSourceIds: [], independent: false});
  assert.throws(() => new ConsensusJudge(store).synthesize(taskId, 4, [a.id, contaminated.id], 3), /independence_required/);
  const duplicateLane = conclusion(store, 1, 'agent-c', 'C', 'repository_evidence', .8);
  assert.throws(() => new ConsensusJudge(store).synthesize(taskId, 4, [a.id, duplicateLane.id], 3), /duplicate_lane/);
});

test('provenance reconstructs decision to agent, source, commit and test evidence', () => {
  const store = tempStore(), source = store.attachSource(sharedThread()).source;
  const evidence = store.addEvidence({taskId, classification: 'verified_executable', description: '117 tests passed', sourceId: source.id, repository: '/repo', commitSha: 'abc123', testName: 'npm run check', result: 'passed'});
  const a = store.addConclusion({taskId, laneId: 1, agentId: 'agent-a', provider: 'codex', model: 'gpt-test', claim: 'Ship context graph', confidence: .9, evidenceIds: [evidence.id], contextSourceIds: [source.id], independent: true});
  const b = conclusion(store, 2, 'agent-b', 'Ship context graph', 'repository_evidence', .8);
  const decision = new ConsensusJudge(store).synthesize(taskId, 4, [a.id, b.id], 3);
  const trace = store.traceDecision(decision.id);
  assert.ok(['decision', 'conclusion', 'context_source', 'evidence', 'commit', 'test'].every(kind => trace.nodes.some(node => node.kind === kind)));
  assert.ok(trace.edges.some(edge => edge.relation === 'supported_by'));
});

test('context attachment cannot weaken unconditional human PTY takeover', () => {
  const state = workspace(), service = new LaneContextService(state, tempStore(), () => undefined);
  service.attach(1, sharedThread());
  const pty = new PtyRegistry();
  pty.upsert({id: 'pty-context', cwd: '/repo', command: 'agent', recovery: 'reattachable'}, '1');
  pty.attach('pty-context', 'agent-a', 'own');
  pty.humanTakeover('pty-context', 'human');
  assert.equal(pty.attached('pty-context').find(item => item.access === 'own')?.actorId, 'human');
  assert.throws(() => pty.attach('pty-context', 'agent-a', 'own'));
});

test('sensitive URLs and unsupported schemes are never persisted', () => {
  const store = tempStore();
  assert.throws(() => store.attachSource(sharedThread({url: 'https://example.com/share?access_token=secret'})), /sensitive_parameter/);
  assert.throws(() => store.attachSource(sharedThread({url: 'file:///private/thread'})), /unsupported_context_url_scheme/);
  assert.throws(() => store.attachSource(sharedThread({url: 'https://user:secret@example.com/thread'})), /credentials_forbidden/);
});

function routeRequest(laneState: LaneState, overrides: Partial<Parameters<ContextRouter['select']>[0]> = {}): Parameters<ContextRouter['select']>[0] {
  return {
    taskId,
    laneId: laneState.id,
    baton: laneState.baton,
    currentCommit: 'abc123',
    complexity: 'medium',
    urgency: 'normal',
    confidence: .7,
    disputed: false,
    modelContextCapacity: 16000,
    reservedPromptTokens: 4000,
    maxContextTokens: 4000,
    tokenCostPerThousand: .001,
    maxMonetaryCost: .02,
    maxAddedLatencyMs: 2000,
    ...overrides,
  };
}

function conclusion(store: ContextStore, laneId: number, agentId: string, claim: string, classification: Parameters<ContextStore['addEvidence']>[0]['classification'], confidence: number) {
  const evidence = store.addEvidence({taskId, classification, description: `${agentId} evidence`});
  return store.addConclusion({taskId, laneId, agentId, provider: 'test-provider', model: 'test-model', claim, confidence, evidenceIds: [evidence.id], contextSourceIds: [], independent: true});
}

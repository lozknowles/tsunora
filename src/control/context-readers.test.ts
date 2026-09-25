import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {buildOperatorProvenanceView} from './context-operator.js';
import {
  chatGptWorkThreadAdapter,
  codexThreadAdapter,
  ContextReaderRegistry,
  discoverOpenAiChatKitThreadId,
  openAiSharedThreadAdapter,
  openAiChatKitHttpTransport,
  openAiChatKitThreadAdapter,
  redactSensitiveText,
  referenceOnlyAdapter,
  selectRelevantSections,
  type VisibleContextDocument,
} from './context-readers.js';
import {ConsensusJudge, ContextStore, type ContextSourceInput} from './context.js';
import {loadSelectedContext, type ContextSelection} from './context.js';
import {PtyRegistry} from './pty.js';
import type {WorkspaceState} from '../state.js';

const taskId = 'task-provider-context';

function store(): ContextStore {
  return new ContextStore(path.join(mkdtempSync(path.join(os.tmpdir(), 'agent-control-readers-')), 'context.json'));
}

function source(contextStore: ContextStore, overrides: Partial<ContextSourceInput> = {}) {
  return contextStore.attachSource({
    type: 'openai_shared_thread', provider: 'openai', url: 'https://chatgpt.com/share/abc',
    originatingLaneId: 1, originatingAgent: 'agent-a', taskId, description: 'Shared architecture investigation',
    classification: 'agent_observation', accessibility: 'available', estimatedTokens: 900,
    retention: {mode: 'ephemeral_extract'},
    ...overrides,
  }).source;
}

function document(sourceId: string): VisibleContextDocument {
  return {
    sourceId, title: 'Visible shared thread', retrievedAt: '2026-08-23T14:00:00.000Z',
    sections: [
      {id: 'chat', title: 'General discussion', kind: 'conversation', text: 'An unrelated introduction and planning conversation.'},
      {id: 'failure', title: 'Reconnect failure', kind: 'failure', text: 'The reconnect experiment failed and task identity became UNKNOWN.'},
      {id: 'proof', title: 'Executable evidence', kind: 'evidence', text: 'npm run check passed. api_key=should-not-escape'},
    ],
  };
}

test('capability discovery recognizes an OpenAI public shared link without creating a share', () => {
  const contextStore = store(), item = source(contextStore);
  const registry = new ContextReaderRegistry().register(openAiSharedThreadAdapter(async value => document(value.id)));
  const discovery = registry.discover(item);
  assert.equal(discovery.supported, true);
  assert.equal(discovery.capabilities[0].accessMode, 'public_read_only');
  assert.equal(discovery.capabilities[0].createsOrBroadensShares, false);
});

test('provider URL matching fails closed for a malformed OpenAI share location', () => {
  const contextStore = store(), item = source(contextStore, {url: 'https://example.com/share/abc'});
  const registry = new ContextReaderRegistry().register(openAiSharedThreadAdapter(async value => document(value.id)));
  assert.deepEqual(registry.discover(item), {supported: false, capabilities: [], reason: 'unsupported_provider_or_source_type'});
});

test('official OpenAI ChatKit reader is read-only, paginated, identity-checked and bounded', async () => {
  const contextStore = store();
  const item = source(contextStore, {type: 'openai_chatkit_thread', url: 'https://api.openai.com/v1/chatkit/threads/cthr_123'});
  const calls: string[] = [];
  const registry = new ContextReaderRegistry({allowAuthenticatedRead: true, redactSensitiveText: true}).register(openAiChatKitThreadAdapter(async request => {
    calls.push(request.path);
    if (!request.path.includes('/items')) return {id: 'cthr_123', object: 'chatkit.thread', title: 'Qualification'};
    if (request.path.includes('after=')) return {data: [{id: 'item-2', type: 'assistant_message', content: [{type: 'output_text', text: 'Second item'}]}], has_more: false};
    return {data: [{id: 'item-1', type: 'user_message', content: [{type: 'input_text', text: 'First item'}]}], has_more: true};
  }));
  const result = await registry.read(item, 20, {query: 'second'});
  assert.equal(result.sourceId, item.id);
  assert.equal(result.sections?.[0], 'item-2');
  assert.ok(result.sections?.includes('item-1'));
  assert.equal(calls.length, 3);
  assert.ok(calls[2].includes('after=item-1'));
});

test('official ChatKit transport allows only the documented GET item path', async () => {
  const seen: RequestInit[] = [];
  const transport = openAiChatKitHttpTransport('test-key', async (_input, init) => { seen.push(init ?? {}); return new Response('{}', {status: 200}); });
  await transport({method: 'GET', path: '/v1/chatkit/threads/cthr_123/items?limit=1&order=asc'});
  assert.equal(seen[0]?.method, 'GET');
  assert.equal((seen[0]?.headers as Record<string, string>)['OpenAI-Beta'], 'chatkit_beta=v1');
  await assert.rejects(() => transport({method: 'GET', path: '/v1/responses'}), /request_not_allowed/);
});

test('official ChatKit discovery returns only validated thread identity', async () => {
  assert.equal(await discoverOpenAiChatKitThreadId(async () => ({data: [{id: 'cthr_abc', object: 'chatkit.thread'}]})), 'cthr_abc');
  assert.equal(await discoverOpenAiChatKitThreadId(async () => ({data: []})), undefined);
  await assert.rejects(() => discoverOpenAiChatKitThreadId(async () => ({data: [{id: 'thread_wrong', object: 'thread'}]})), /identity_mismatch/);
});

test('official ChatKit transport fails closed for auth, denial, deletion and provider errors', async () => {
  for (const status of [401, 403, 404, 500]) {
    const transport = openAiChatKitHttpTransport('test-key', async () => new Response('{}', {status}));
    await assert.rejects(() => transport({method: 'GET', path: '/v1/chatkit/threads/cthr_missing'}), new RegExp(`openai_provider_http_${status}`));
  }
});

test('official ChatKit reader rejects mismatched provider thread identity', async () => {
  const contextStore = store();
  const item = source(contextStore, {type: 'openai_chatkit_thread', url: 'https://api.openai.com/v1/chatkit/threads/cthr_expected'});
  const registry = new ContextReaderRegistry({allowAuthenticatedRead: true, redactSensitiveText: true})
    .register(openAiChatKitThreadAdapter(async () => ({id: 'cthr_other', object: 'chatkit.thread'})));
  await assert.rejects(() => registry.read(item, 100), /context_provider_identity_mismatch/);
});

test('authenticated Work and Codex readers require explicit policy approval', async () => {
  const contextStore = store();
  const work = source(contextStore, {type: 'chatgpt_work_thread', url: 'https://chatgpt.com/g/g-work/c/thread'});
  const denied = new ContextReaderRegistry().register(chatGptWorkThreadAdapter(async value => document(value.id)));
  assert.equal(denied.discover(work).reason, 'authenticated_read_not_approved');
  await assert.rejects(() => denied.read(work, 500), /authenticated_read_not_approved/);

  const approved = new ContextReaderRegistry({allowAuthenticatedRead: true, redactSensitiveText: true})
    .register(chatGptWorkThreadAdapter(async value => document(value.id)))
    .register(codexThreadAdapter(async value => document(value.id)));
  assert.equal(approved.discover(work).supported, true);
  assert.equal((await approved.read(work, 500)).sourceId, work.id);
});

test('registry approval allowlist can disable an otherwise supported adapter', () => {
  const contextStore = store(), item = source(contextStore);
  const registry = new ContextReaderRegistry({approvedCapabilityIds: ['different-capability'], allowAuthenticatedRead: false, redactSensitiveText: true})
    .register(openAiSharedThreadAdapter(async value => document(value.id)));
  assert.equal(registry.discover(item).reason, 'provider_capability_not_approved');
});

test('section selection is deterministic, relevance-aware, redacted and token-bounded', async () => {
  const contextStore = store(), item = source(contextStore);
  const registry = new ContextReaderRegistry().register(openAiSharedThreadAdapter(async value => document(value.id)));
  const result = await registry.read(item, 80, {query: 'reconnect experiment UNKNOWN', sectionHints: ['evidence']});
  assert.equal(result.sections?.[0], 'proof');
  assert.ok(result.sections?.includes('failure'));
  assert.ok(result.tokens <= 80);
  assert.doesNotMatch(result.text, /should-not-escape/);
  assert.match(result.text, /\[REDACTED\]/);
});

test('low-level selector prioritizes evidence even without a query', () => {
  const selected = selectRelevantSections(document('source').sections, {}, 30);
  assert.equal(selected[0].id, 'proof');
});

test('sensitive visible text is redacted before prompt material is returned', () => {
  const redacted = redactSensitiveText('Bearer abc.def secret=hunter2 sk-abcdefghijklmnop');
  assert.equal(redacted, 'Bearer [REDACTED] secret=[REDACTED] [REDACTED API KEY]');
});

test('retention expiry and reference-only policy prevent retrieval while preserving metadata', async () => {
  const contextStore = store();
  const expired = source(contextStore, {url: 'https://chatgpt.com/share/expired', retention: {mode: 'ephemeral_extract', expiresAt: '2026-08-22T00:00:00.000Z'}});
  const registry = new ContextReaderRegistry({allowAuthenticatedRead: false, redactSensitiveText: true, now: () => new Date('2026-08-23T00:00:00.000Z')})
    .register(openAiSharedThreadAdapter(async value => document(value.id)));
  await assert.rejects(() => registry.read(expired, 100), /retention_expired/);
  assert.equal(contextStore.getSource(expired.id)?.url, expired.url);

  const reference = source(contextStore, {url: 'https://chatgpt.com/share/reference', retention: {mode: 'reference_only'}});
  await assert.rejects(() => registry.read(reference, 100), /reference_only/);
});

test('transport response must match the requested source identity', async () => {
  const contextStore = store(), item = source(contextStore);
  const registry = new ContextReaderRegistry().register(openAiSharedThreadAdapter(async () => document('wrong-source')));
  await assert.rejects(() => registry.read(item, 100), /identity_mismatch/);
});

test('reference-only providers remain discoverable metadata but cannot be injected', async () => {
  const contextStore = store();
  const item = source(contextStore, {type: 'github_issue', provider: 'github', url: 'https://github.com/example/repo/issues/1'});
  const registry = new ContextReaderRegistry().register(referenceOnlyAdapter('github', ['github_issue']));
  assert.equal(registry.discover(item).reason, 'reference_only');
  await assert.rejects(() => registry.read(item, 100), /reference_only/);
});

test('operator provenance view includes clickable read-only context and complete trace edges', () => {
  const contextStore = store(), item = source(contextStore);
  const evidence = contextStore.addEvidence({taskId, classification: 'verified_executable', description: 'tests pass', sourceId: item.id, commitSha: 'abc123', testName: 'npm run check', result: 'passed'});
  const first = contextStore.addConclusion({taskId, laneId: 1, agentId: 'agent-a', claim: 'Adopt readers', confidence: .9, evidenceIds: [evidence.id], contextSourceIds: [item.id], independent: true});
  const secondEvidence = contextStore.addEvidence({taskId, classification: 'repository_evidence', description: 'diff reviewed', commitSha: 'abc123'});
  const second = contextStore.addConclusion({taskId, laneId: 2, agentId: 'agent-b', claim: 'Adopt readers', confidence: .8, evidenceIds: [secondEvidence.id], contextSourceIds: [], independent: true});
  const decision = new ConsensusJudge(contextStore).synthesize(taskId, 3, [first.id, second.id], 3);
  const view = buildOperatorProvenanceView(contextStore, decision.id);
  assert.ok(view.nodes.some(node => node.kind === 'context_source' && node.url === item.url));
  assert.match(view.mermaid, /click n\d+ "https:\/\/chatgpt.com\/share\/abc"/);
  assert.match(view.mermaid, /supported_by/);
});

test('provider failure cannot mutate Agent Control authority or replace Git evidence', async () => {
  const contextStore = store();
  const item = source(contextStore, {type: 'openai_chatkit_thread', url: 'https://api.openai.com/v1/chatkit/threads/cthr_failure'});
  const evidence = contextStore.addEvidence({taskId, classification: 'repository_evidence', description: 'Git diff remains sufficient', commitSha: 'abc123'});
  const workspace: WorkspaceState = {
    version: 1,
    paused: false,
    lastRestorePoint: null,
    lanes: [{
      id: 1, name: 'Protected lane', status: 'working', model: 'codex', reasoning: 'medium', context: '',
      contract: {version: 2, laneId: 1, goal: 'Preserve authority', constraints: [], cwd: '/repo', priority: 99, mode: 'auto', capabilities: {requires: [], prefers: []}, modelLock: null, sharedTaskIds: [taskId], git: {branch: 'qualification', head: 'abc123'}, updatedAt: '2026-08-23T00:00:00.000Z'},
      baton: {version: 1, laneId: 1, revision: 4, status: 'working', progress: ['Git evidence retained'], hypothesis: '', evidence: ['abc123'], changes: [], nextAction: 'continue safely', openQuestions: [], model: 'codex', reasoning: 'medium', updatedAt: '2026-08-23T00:00:00.000Z'},
      lease: {laneId: 1, holder: 'human', acquiredAt: '2026-08-23T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z'},
      lines: [],
    }],
  };
  const before = structuredClone(workspace);
  const pty = new PtyRegistry();
  pty.upsert({id: 'pty-provider-failure', cwd: '/repo', command: 'agent', recovery: 'reattachable'}, '1');
  pty.attach('pty-provider-failure', 'agent-a', 'own');
  pty.humanTakeover('pty-provider-failure', 'human');
  const selection: ContextSelection = {tier: 3, reason: 'qualification', contextSourceIds: [item.id], evidenceIds: [evidence.id], omitted: [], warnings: [], estimatedTokens: 500, estimatedCost: 0};
  const registry = new ContextReaderRegistry({allowAuthenticatedRead: true, redactSensitiveText: true})
    .register(openAiChatKitThreadAdapter(async () => { throw new Error('openai_provider_http_503'); }));

  const loaded = await loadSelectedContext(contextStore, selection, registry);

  assert.deepEqual(loaded, {materials: [], failures: [{sourceId: item.id, error: 'openai_provider_http_503'}]});
  assert.deepEqual(workspace, before);
  assert.equal(pty.attached('pty-provider-failure').find(attachment => attachment.access === 'own')?.actorId, 'human');
  assert.equal(contextStore.getEvidence(evidence.id)?.commitSha, 'abc123');
  assert.equal('schedule' in registry, false);
  assert.equal('sendInput' in registry, false);
});

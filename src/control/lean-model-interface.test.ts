import assert from 'node:assert/strict';
import test from 'node:test';
import {AdaptiveHarness, SkillCatalog, ToolPolicy, type HarnessCandidate, type RecipeRequest} from './adaptive-harness.js';
import {HarnessDispatcher, ToolHandlerRegistry} from './harness-dispatch.js';
import {HarnessProfileRouter} from './harness-efficiency.js';
import {StructuredChatLoopProvider} from './structured-chat-loop-provider.js';
import {LeanExecutionState, LeanContextVault, LeanResultProjector, leanContextSources, type LeanExecutionPolicy} from './lean-model-interface.js';

const effects = {read: 'inspect', edit: 'mutate', test: 'verify', finish: 'terminal'} as const;
const policy: LeanExecutionPolicy = {toolEffects: effects, requiredChangedPaths: ['src/a.js'], terminalAllowance: true};
const verified = {passed: true, exitCode: 0, timedOut: false, cancelled: false};
function ready() {
  const state = new LeanExecutionState(policy);
  state.before('read'); state.after('read', {content: 'a'});
  state.before('edit'); state.after('edit', {ok: true, changedFiles: ['src/a.js']});
  state.before('test'); state.after('test', verified);
  return state;
}

for (const tool of ['edit', 'test', 'unknown', 'Read', 'read.extra', '__proto__']) test(`initial exposure rejects ${tool}`, () => {
  const state = new LeanExecutionState(policy);
  assert.throws(() => state.before(tool), /tool_policy_denied/);
});
for (const tool of ['read', 'edit', 'test', 'shell', 'network', 'plan']) test(`completion allowance rejects ${tool}`, () => {
  const state = ready(); assert.equal(state.beginTerminalAllowance(3), true);
  assert.throws(() => state.before(tool), /tool_policy_denied/);
});
test('completion requires exhausted budget and all recorded obligations; one use only', () => {
  const state = ready(); assert.equal(state.beginTerminalAllowance(4), false);
  assert.equal(state.beginTerminalAllowance(3), true); assert.equal(state.beginTerminalAllowance(3), false);
  state.before('finish'); state.after('finish', {stopped: true}); assert.equal(state.allowed('finish'), false);
  const incomplete = new LeanExecutionState({...policy, requiredChangedPaths: ['src/b.js']});
  incomplete.before('read'); incomplete.after('read', {}); incomplete.before('edit'); incomplete.after('edit', {ok: true, changedFiles: ['src/a.js']}); incomplete.before('test'); incomplete.after('test', verified);
  assert.equal(incomplete.beginTerminalAllowance(3), false);
});
for (const result of [{passed: false}, {...verified, timedOut: true}, {...verified, cancelled: true}, {...verified, exitCode: 1}, {passed: true}]) test(`verification cannot be inferred from ${JSON.stringify(result)}`, () => {
  const state = new LeanExecutionState(policy);
  state.before('read'); state.after('read', {}); state.before('edit'); state.after('edit', {ok: true, changedFiles: ['src/a.js']}); state.before('test'); state.after('test', result);
  assert.equal(state.beginTerminalAllowance(3), false);
});
test('unresolved failure removes completion eligibility', () => {
  const state = ready(); state.before('read'); state.after('read', undefined, true);
  assert.equal(state.beginTerminalAllowance(4), false);
});
test('passing a verifier cannot erase a different unresolved operation failure', () => {
  const state = new LeanExecutionState(policy);
  state.before('read', {path: 'missing'}); state.after('read', undefined, true);
  state.before('read', {path: 'src/a.js'}); state.after('read', {});
  state.before('edit'); state.after('edit', {ok: true, changedFiles: ['src/a.js']});
  state.before('test'); state.after('test', verified);
  assert.equal(state.beginTerminalAllowance(4), false);
});
test('on-demand context is capability-scoped and rechecks live authority', () => {
  let active = true;
  const source = {id: 'public', kind: 'other' as const, content: 'known', provenanceIds: ['recorded'], relevance: 1};
  const vault = new LeanContextVault([{source, visibility: 'MODEL_ON_DEMAND'}, {source: {...source, id: 'private'}, visibility: 'EVIDENCE_ONLY'}], () => { if (!active) throw new Error('revoked'); });
  assert.equal(vault.expand('public').content, 'known');
  assert.throws(() => vault.expand('private'), /not_exposable/); assert.throws(() => vault.expand('../private'), /not_exposable/);
  active = false; assert.throws(() => vault.expand('public'), /revoked/);
});
test('lazy projection only removes exact duplicate schema, preserving required instructions', () => {
  const sources = [{id: 'schema', kind: 'tool_schemas' as const, content: '[]'}, {id: 'policy', kind: 'agent_control_instructions' as const, content: 'retain this'}, {id: 'different', kind: 'tool_schemas' as const, content: '[{}]'}];
  assert.deepEqual(leanContextSources(sources.map(source => ({...source, relevance: 1, provenanceIds: []})), '[]').map(source => source.id), ['policy', 'different']);
  assert.equal(sources.length, 3);
});
test('delta projection is lossless, session-local and restores changed data', () => {
  const projector = new LeanResultProjector(), value = {content: 'source'.repeat(100)};
  const first = projector.project(value, 1), second = projector.project(value, 3), changed = projector.project({content: value.content + 'x'}, 4);
  assert.equal(first.content, JSON.stringify(value)); assert.equal(first.rawSha256, second.rawSha256);
  assert.equal(second.transformation, 'EXACT_RETAINED_HISTORY_REFERENCE'); assert.ok(second.modelBytes < second.rawBytes);
  assert.equal(changed.transformation, 'IDENTITY'); assert.equal(new LeanResultProjector().project(value, 1).transformation, 'IDENTITY');
});

function environment(replies: string[], lean = true, deterministicTerminal = false) {
  let live: RecipeRequest['authority'] = {laneId: 'lane', owner: 'agent', leaseGeneration: 1, ownershipGeneration: 1};
  let calls = 0;
  const bodies: any[] = [], invoked: string[] = [];
  const definitions = Object.keys(effects).map(id => ({id, risk: id === 'edit' ? 'write' as const : 'read' as const, capabilities: []}));
  const toolPolicy = new ToolPolicy(definitions), handlers = new ToolHandlerRegistry();
  for (const {id} of definitions) handlers.register(id, async () => { invoked.push(id); return id === 'edit' ? {ok: true, changedFiles: ['src/a.js']} : id === 'test' ? verified : {}; });
  const harness = new AdaptiveHarness(new SkillCatalog(), toolPolicy, undefined, new HarnessProfileRouter({mode: 'EXPERIMENT', minimumVerifiedRuns: 20, minimumSuccessRate: .95, minimumSameModelControlledRuns: 20}));
  const dispatcher = new HarnessDispatcher(harness, toolPolicy, handlers, () => ({authority: live, workerId: 'worker', availableToolIds: Object.keys(effects), approvedRisks: ['read', 'write']}), undefined, undefined, undefined, undefined, lean ? () => policy : undefined);
  const candidate: HarnessCandidate = {route: {id: 'route', providerId: 'p', modelId: 'm', workerId: 'worker', local: true, health: 'healthy', qualified: true, qualificationReason: 'fixture', capabilities: ['coding'], pricing: {currency: 'TEST', billing: 'free', inputPerMillionTokens: 0, outputPerMillionTokens: 0, fixedPerRequest: 0, effectiveFrom: '2026-09-19'}, performance: {startupLatencyMs: 1, inputTokensPerSecond: 1000, outputTokensPerSecond: 1000, historicalSuccessRate: 1, expectedQuality: 1, confidence: 1, contextLimitTokens: 32000, source: 'measured', sampleSize: 10}}, workerCapabilities: [], modelCapabilities: ['coding'], promptProfiles: [{id: 'test', version: '1', description: 'fixture'}], availableSkillIds: [], availableToolIds: Object.keys(effects), runtime: {}};
  const request: RecipeRequest = {taskId: 'task', taskType: 'code', requiredCapabilities: ['coding'], requiredTools: Object.keys(effects), approvedRisks: ['read', 'write'], intent: 'NORMAL', inputTokens: 100, outputTokens: 100, context: {tier: 1, sourceIds: [], evidenceIds: [], estimatedTokens: 10}, authority: {...live}, verification: {requiredEvidence: ['independent'], requireIndependentCheck: true}, escalation: {minimumConfidence: .7, maximumAttempts: 1, onFailure: 'review'}, harnessRouting: {taskId: 'task', complexity: .1, risk: 'low', knownExactTargets: true, estimatedFiles: 1, deterministicVerifier: true, ambiguity: 0, architectural: false, requestedProfile: 'THIN'}};
  const provider = new StructuredChatLoopProvider({providerId: 'p', modelId: 'm', baseUrl: 'http://127.0.0.1:1/v1', finishToolId: 'finish', toolSchemas: definitions.map(({id}) => ({id, description: id, inputSchema: {type: 'object', additionalProperties: false}})), ...(lean ? {lean: {terminalAllowance: true, deterministicTerminal, recordEvidence: () => undefined}} : {}), fetch: async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return Response.json({choices: [{message: {content: replies[calls++]}}], usage: {prompt_tokens: 10, completion_tokens: 2, total_tokens: 12}}); }});
  return {run: () => dispatcher.dispatch({request, candidates: [candidate], placement: {workerId: 'worker', reason: 'fixture'}}, provider.executor('Read, edit, verify and finish.')), invoked, bodies, changeAuthority: (change: Partial<RecipeRequest['authority']>) => { live = {...live, ...change}; }};
}
const call = (tool: string) => JSON.stringify({tool, input: {}});
test('real dispatcher grants only a terminal fourth turn after successful THIN work', async () => {
  const env = environment(['read', 'edit', 'test', 'finish'].map(call));
  const result = await env.run(); assert.equal(result.execution.error, undefined); assert.equal(result.execution.invocations?.length, 4); assert.equal(result.accepted, false);
  const tools = (body: any) => JSON.parse(body.messages[0].content.split('Granted tools:\n')[1].split('\n\n')[0]).map((item: any) => item.id);
  assert.deepEqual(tools(env.bodies[0]), ['read', 'finish']); assert.deepEqual(tools(env.bodies[3]), ['finish']);
});
test('unchanged THIN control still stops at three turns', async () => {
  const env = environment(['read', 'edit', 'test', 'finish'].map(call), false);
  const result = await env.run(); assert.match(result.execution.error ?? '', /turn_limit:3/); assert.equal(env.bodies.length, 3);
});
test('no completion call is issued when required work is incomplete', async () => {
  const env = environment(['read', 'read', 'read', 'finish'].map(call));
  assert.match((await env.run()).execution.error ?? '', /turn_limit:3/); assert.equal(env.bodies.length, 3);
});
test('deterministic terminal fast path avoids one call but never claims verifier acceptance', async () => {
  const env = environment(['read', 'edit', 'test'].map(call), true, true);
  const result = await env.run(); assert.equal(result.execution.error, undefined); assert.equal(env.bodies.length, 3);
  assert.equal(result.accepted, false); assert.deepEqual(env.invoked, ['read', 'edit', 'test', 'finish']);
});
for (const tool of ['read', 'edit', 'test', 'shell', 'finish.extra']) test(`real dispatcher terminal escape ${tool} fails before handler`, async () => {
  const env = environment(['read', 'edit', 'test', tool].map(call));
  await assert.rejects(env.run, /tool_policy_denied/); assert.deepEqual(env.invoked, ['read', 'edit', 'test']);
});
for (const change of [{owner: 'human' as const}, {leaseGeneration: 2}, {ownershipGeneration: 2}]) test(`live authority conflict ${JSON.stringify(change)} stops before model`, async () => {
  const env = environment([call('read')]); env.changeAuthority(change);
  await assert.rejects(env.run, /tool_policy_denied/); assert.equal(env.bodies.length, 0); assert.equal(env.invoked.length, 0);
});
for (const [name, text] of Object.entries({plain: call('finish'), fenced: '```json\n' + call('finish') + '\n```'})) test(`local interoperability ${name} accepted without protocol changes`, async () => {
  const env = environment([text]); assert.equal((await env.run()).execution.error, undefined);
});
for (const [name, text] of Object.entries({malformed: '{', ambiguous: '[{"tool":"finish"}]', extra: '{"tool":"finish","extra":1}', missing: '{"input":{}}', ungranted: call('network'), future: call('edit')})) test(`local interoperability ${name} fails closed`, async () => {
  const env = environment([text]);
  try { const result = await env.run(); assert.ok(result.execution.error); } catch (error) { assert.match(String(error), /tool_policy_denied/); }
  assert.equal(env.invoked.length, 0);
});
test('invalid tool input is rejected before raw handler execution', async () => {
  const env = environment(['{"tool":"read","input":{"command":"echo harmless"}}']);
  await assert.rejects(env.run, /lean_input_schema/); assert.equal(env.invoked.length, 0);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {buildContextPacket, ContextCompilerPipeline, ContextCompilerPolicy, strongerModelPrompt, type ContextCompilerInput, type ContextCompilerOutput, type ContextTierExecutor, type ContextTierResult, type ContextCompilerTier} from './context-compiler.js';
import {createInvocationObservation, MemoryHarnessEfficiencyLedger} from './harness-efficiency.js';
import {readFileSync} from 'node:fs';

const source = 'export function add(left: number, right: number) {\n  return left + right;\n}\n';
const input = (overrides: Partial<ContextCompilerInput> = {}): ContextCompilerInput => ({
  task: 'Add a regression test for add',
  repositoryMap: 'src/math.ts\nsrc/math.test.ts',
  sourceExcerpts: [{id: 'math-source', kind: 'source', path: 'src/math.ts', startLine: 1, endLine: 3, content: source, required: true}],
  ...overrides,
});
const analysis = (overrides: Partial<ContextCompilerOutput> = {}): ContextCompilerOutput => ({
  taskClass: 'simple', suspectedFiles: ['src/math.ts'], relevantSymbols: ['add'], hypotheses: ['missing edge-case test'], evidence: ['math-source'],
  requiredSourceRanges: [{path: 'src/math.ts', startLine: 1, endLine: 3}], testsAffected: ['src/math.test.ts'], uncertainties: [], confidence: .96,
  recommendedTier: 'E2B', escalationReason: 'bounded and directly evidenced', ...overrides,
});
const result = (tier: ContextCompilerTier, output?: ContextCompilerOutput, resultText = `${tier} result`): ContextTierResult => ({
  tier, model: `model-${tier.toLowerCase()}`, ...(output ? {analysis: output, selectedEvidenceIds: ['math-source']} : {}), result: resultText,
  usage: {inputTokens: 100, outputTokens: 20, cost: tier === 'E2B' || tier === 'E4B' ? 0 : .01, currency: tier === 'E2B' || tier === 'E4B' ? null : 'USD', elapsedMs: 10},
});
const executorsFor = (execute: (tier: ContextCompilerTier, request: Parameters<ContextTierExecutor['execute']>[0]) => Promise<ContextTierResult>): Record<ContextCompilerTier, ContextTierExecutor> => ({
  E2B: {execute: request => execute('E2B', request)},
  E4B: {execute: request => execute('E4B', request)},
  LUNA: {execute: request => execute('LUNA', request)},
  SOL: {execute: request => execute('SOL', request)},
});

test('ContextPacket preserves exact source bytes and hashes instead of replacing evidence with a summary', () => {
  const packet = buildContextPacket(input(), 'E2B', 'gemma-e2b', analysis());
  assert.equal(packet.exactEvidence[0].content, source);
  assert.equal(packet.exactEvidence[0].sha256, createHash('sha256').update(source).digest('hex'));
  const prompt = strongerModelPrompt(packet);
  assert.match(prompt, /CONTEXT COMPILER ANALYSIS \(advisory; verify independently\)/);
  assert.match(prompt, /EXACT RETAINED SOURCE AND EVIDENCE \(authoritative\)/);
  assert.ok(prompt.includes(source));
});

test('ContextPacket fails closed when Gemma cites evidence or a required source range that was not retained', () => {
  assert.throws(() => buildContextPacket(input(), 'E2B', 'gemma-e2b', analysis({evidence: ['invented']})), /context_packet_evidence_missing:invented/);
  assert.throws(() => buildContextPacket(input(), 'E2B', 'gemma-e2b', analysis({requiredSourceRanges: [{path: 'src/other.ts', startLine: 1, endLine: 2}]})), /context_packet_required_range_missing/);
  const packet = buildContextPacket(input({sourceExcerpts: [...input().sourceExcerpts, {id: 'test-source', kind: 'source', path: 'src/math.test.ts', startLine: 1, endLine: 1, content: 'test();'}]}), 'E2B', 'gemma-e2b', analysis({evidence: ['math-source', 'test-source']}), ['math-source']);
  assert.deepEqual(packet.exactEvidence.map(item => item.id), ['math-source', 'test-source']);
});

test('simple confident E2B result is accepted only after independent verification', async () => {
  const calls: ContextCompilerTier[] = [];
  const executors = executorsFor(async tier => { calls.push(tier); return result(tier, tier === 'E2B' || tier === 'E4B' ? analysis() : undefined); });
  const run = await new ContextCompilerPipeline(executors, {verify: async (_result, packet) => ({passed: true, independent: true, verifierId: 'deterministic-tests', evidenceIds: packet.exactEvidence.map(item => item.id), detail: 'tests_passed'})}).run(input());
  assert.equal(run.status, 'VERIFIED');
  assert.equal(run.finalTier, 'E2B');
  assert.deepEqual(calls, ['E2B']);
  assert.equal(run.finalVerification.passed, true);
});

test('failed local verification escalates to Luna and does not loop locally', async () => {
  const calls: ContextCompilerTier[] = [], verifications: ContextCompilerTier[] = [];
  const executors = executorsFor(async (tier, request) => {
    calls.push(tier);
    if (tier === 'LUNA') assert.ok(request.prompt.includes(source));
    return result(tier, tier === 'E2B' || tier === 'E4B' ? analysis() : undefined);
  });
  const run = await new ContextCompilerPipeline(executors, {verify: async value => { verifications.push(value.tier); return {passed: value.tier === 'LUNA', independent: true, verifierId: 'deterministic-tests', evidenceIds: ['math-source'], detail: value.tier === 'LUNA' ? 'tests_passed' : 'tests_failed'}; }}).run(input());
  assert.equal(run.finalTier, 'LUNA');
  assert.deepEqual(calls, ['E2B', 'LUNA']);
  assert.deepEqual(verifications, ['E2B', 'LUNA']);
  assert.match(run.trail.find(event => event.type === 'escalated')!.reason, /local_verification_failed/);
});

test('security and concurrency risk automatically bypass local acceptance even at high confidence', async () => {
  const calls: ContextCompilerTier[] = [];
  const executors = executorsFor(async (tier, request) => { calls.push(tier); if (tier === 'SOL') assert.ok(request.prompt.includes(source)); return result(tier, tier === 'E2B' || tier === 'E4B' ? analysis({taskClass: 'high-risk', confidence: .99}) : undefined); });
  const run = await new ContextCompilerPipeline(executors, {verify: async value => ({passed: value.tier === 'SOL', independent: true, verifierId: 'security-test-suite', evidenceIds: ['math-source'], detail: value.tier === 'SOL' ? 'security_tests_passed' : 'not_permitted'})}).run(input({risks: ['security', 'concurrency']}));
  assert.deepEqual(calls, ['E2B', 'SOL']);
  assert.equal(run.finalTier, 'SOL');
  assert.match(run.trail.find(event => event.type === 'escalated')!.reason, /high_risk/);
});

test('adaptive path is bounded E2B to E4B to Luna to Sol and retains evidence at every escalation', async () => {
  const calls: ContextCompilerTier[] = [];
  const outputs: Record<'E2B' | 'E4B', ContextCompilerOutput> = {
    E2B: analysis({confidence: .5, recommendedTier: 'E4B', escalationReason: 'low confidence'}),
    E4B: analysis({confidence: .7, recommendedTier: 'LUNA', escalationReason: 'unresolved framework behaviour'}),
  };
  const executors = executorsFor(async (tier, request) => {
    calls.push(tier);
    if (tier !== 'E2B') assert.ok(request.prompt.includes(source));
    return result(tier, tier === 'E2B' || tier === 'E4B' ? outputs[tier] : undefined);
  });
  const run = await new ContextCompilerPipeline(executors, {verify: async value => ({passed: value.tier === 'SOL', independent: true, verifierId: 'deterministic-tests', evidenceIds: ['math-source'], detail: value.tier === 'SOL' ? 'all_tests_passed' : 'cloud_verification_failed'})}).run(input());
  assert.equal(run.status, 'VERIFIED');
  assert.deepEqual(calls, ['E2B', 'E4B', 'LUNA', 'SOL']);
  assert.equal(run.trail.filter(event => event.type === 'escalated').length, 3);
  assert.ok(run.trail.filter(event => event.type === 'escalated').every(event => event.retainedEvidenceIds.includes('math-source')));
});

test('attempt budget and local context limits fail closed into escalation', () => {
  assert.throws(() => new ContextCompilerPolicy({maximumAttempts: 0}), /context_compiler_policy_limit_invalid/);
});

test('self-attested or unidentified verification cannot complete a Context Compiler run', async () => {
  const executors = executorsFor(async tier => result(tier, tier === 'E2B' || tier === 'E4B' ? analysis() : undefined));
  const run = await new ContextCompilerPipeline(executors, {verify: async () => ({passed: true, independent: false, verifierId: '', evidenceIds: ['math-source'], detail: 'model_says_pass'})}).run(input());
  assert.equal(run.status, 'FAILED');
  assert.equal(run.finalVerification.detail, 'independent_verification_required');
});

test('routing audit survives invocation-ledger persistence and dashboard exposes active tier stage confidence and evidence', () => {
  const routing = {initialTier: 'E2B' as const, activeTier: 'LUNA' as const, sequence: ['E2B', 'E4B', 'LUNA'] as Array<'E2B' | 'E4B' | 'LUNA' | 'SOL'>, stage: 'cloud implementation', escalationReason: 'local_verification_failed', compilerConfidence: .78, originalContextTokens: 12000, contextPacketTokens: 3200, retainedEvidenceIds: ['math-source']};
  const observation = createInvocationObservation({jobId: 'job', runId: 'run', stepId: 'step', taskId: 'task', laneId: 'lane', model: 'luna', provider: 'openai', harnessProfile: 'STANDARD', executionStrategy: 'context-compiler', startedAt: '2026-08-31T00:00:00.000Z', completedAt: '2026-08-31T00:00:01.000Z', recipeFingerprint: 'fingerprint', routing});
  const ledger = new MemoryHarnessEfficiencyLedger();
  ledger.record(observation);
  assert.deepEqual(ledger.list()[0].routing, routing);
  const dashboard = readFileSync(new URL('../../assets/dashboard/dashboard-enhancements.js', import.meta.url), 'utf8');
  for (const phrase of ['Routing sequence', 'Gemma confidence', 'Context / retained evidence', 'routing?.stage', 'routing.activeTier']) assert.ok(dashboard.includes(phrase), `dashboard missing ${phrase}`);
});

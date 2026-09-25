import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {MUTATION_TOOL_SCHEMAS, hasNumberedReadDisplay} from './harness-mutation-workspace.js';
import {ToolCallReliabilityGate} from './tool-call-reliability.js';
import {ToolReliabilityAuditLedger} from './tool-call-reliability-ledger.js';

const corpus = JSON.parse(fs.readFileSync(new URL('./fixtures/tool-call-reliability-corpus.json', import.meta.url), 'utf8')) as {
  historical: Array<{id: string; rawResponseAvailable: boolean; rawArgumentsAvailable: boolean}>;
  reconstructed: Array<{id: string; raw: string; expected: 'REJECT'; rawIsOriginal: boolean}>;
  synthetic: Array<{id: string; raw: string; expected: 'VALID' | 'REPAIRED' | 'REJECT'; tool?: string; equivalentInput?: unknown; granted?: string[]}>;
};

test('native argument strings reject duplicate resource and content keys before normalization', () => {
  const gate = new ToolCallReliabilityGate(MUTATION_TOOL_SCHEMAS);
  for (const args of [
    '{"path":"src/allowed.js","path":"src/different.js","content":"x"}',
    '{"path":"src/a.js","content":"keep","content":"replace"}',
    '{"path":"src/a.js","\\u0070ath":"src/different.js","content":"x"}',
  ]) {
    const result = gate.evaluate(JSON.stringify({name:'mutation.repository.write', arguments:args}));
    assert.equal(result.record.decision, 'REJECT');
    assert.equal(result.record.reason, 'AMBIGUOUS_DUPLICATE_KEY');
    assert.equal(result.request, undefined);
  }
  const valid = {path:'src/a.js', content:'text with repeated words and {"path":1,"path":2}'};
  assert.deepEqual(gate.evaluate(JSON.stringify({name:'mutation.repository.write', arguments:JSON.stringify(valid)})).request?.input, valid);
});

test('frozen historical failures are explicitly unobservable rather than invented', () => {
  assert.equal(corpus.historical.length, 8);
  assert.ok(corpus.historical.every(item => !item.rawResponseAvailable && !item.rawArgumentsAvailable));
});

test('synthetic corpus admits only first-pass or demonstrably equivalent safe calls', () => {
  const gate = new ToolCallReliabilityGate(MUTATION_TOOL_SCHEMAS);
  const counts = {VALID: 0, REPAIRED: 0, REJECT: 0};
  let falseRepairs = 0;
  for (const sample of [...corpus.synthetic, ...corpus.reconstructed]) {
    const result = gate.evaluate(sample.raw, 'granted' in sample && sample.granted ? new Set(sample.granted) : undefined);
    const input = result.request?.input as {content?: unknown} | undefined;
    const numbered = result.request?.tool === 'mutation.repository.write' && typeof input?.content === 'string' && hasNumberedReadDisplay(input.content);
    const actual = result.record.decision === 'REJECT' || numbered ? 'REJECT' : result.record.firstPassValid ? 'VALID' : 'REPAIRED';
    counts[actual]++;
    assert.equal(actual, sample.expected, sample.id);
    if (sample.expected === 'REJECT' && result.request && !numbered) falseRepairs++;
    if (sample.expected === 'REPAIRED') {
      assert.equal(result.request?.tool, sample.tool, sample.id);
      assert.deepEqual(result.request?.input, sample.equivalentInput, sample.id);
      assert.match(result.record.rawSha256, /^[a-f0-9]{64}$/);
      assert.match(result.record.normalizedSha256 ?? '', /^[a-f0-9]{64}$/);
    }
  }
  assert.equal(corpus.synthetic.length, 33);
  assert.equal(corpus.reconstructed.length, 2);
  assert.ok(corpus.reconstructed.every(item => !item.rawIsOriginal));
  assert.deepEqual(counts, {VALID: 5, REPAIRED: 7, REJECT: 23});
  assert.equal(falseRepairs, 0);
});

test('tool repair refuses an altered argument or an ungranted action', () => {
  const gate = new ToolCallReliabilityGate(MUTATION_TOOL_SCHEMAS);
  assert.equal(gate.evaluate('{"name":"mutation.repository.write","arguments":{"path":"src/a.js","content":42}}').record.reason, 'SCHEMA_INVALID');
  assert.equal(gate.evaluate('{"name":"shell.exec","arguments":{"command":"dangerous"}}').record.reason, 'TOOL_NOT_GRANTED');
  assert.equal(gate.evaluate('{"tool":"mutation.repository.write","input":{"path":"src/a.js","content":"x"}}', new Set(['mutation.repository.read'])).record.reason, 'TOOL_NOT_GRANTED');
  assert.equal(gate.evaluate('{"tool":"mutation.repository.write","input":{"path":"src/a.js","content":"x"},"override":true}').record.reason, 'AMBIGUOUS_ENVELOPE');
  assert.equal(gate.evaluate('{"tool":"mutation.repository.test","input":null}').record.reason, 'SCHEMA_INVALID');
  const emptyDefault = gate.evaluate('{"tool":"mutation.repository.test"}');
  assert.equal(emptyDefault.record.repair, 'EMPTY_INPUT_DEFAULT');
  assert.deepEqual(emptyDefault.request?.input, {});
});

test('repair audit is durable and hash chained before dispatch', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-reliability-test-'));
  try {
    const file = path.join(dir, 'audit.jsonl');
    const ledger = new ToolReliabilityAuditLedger(file);
    const gate = new ToolCallReliabilityGate(MUTATION_TOOL_SCHEMAS);
    for (const raw of ['{"name":"mutation.repository.test","arguments":{}}', '{"tool":"mutation.repository.test","input":null}']) {
      ledger.record({...gate.evaluate(raw).record, recipeId: 'fixture-recipe', turn: 1});
    }
    ledger.close();
    const entries = fs.readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].previousSha256, '0'.repeat(64));
    assert.equal(entries[1].previousSha256, entries[0].entrySha256);
    for (const entry of entries) {
      const {entrySha256, ...body} = entry;
      assert.equal(entrySha256, createHash('sha256').update(JSON.stringify(body)).digest('hex'));
      assert.ok(!JSON.stringify(entry).includes('"arguments"'));
    }
    assert.throws(() => new ToolReliabilityAuditLedger(file), /EEXIST/);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

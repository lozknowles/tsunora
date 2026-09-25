import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {ContextRouter, ContextStore, type ProgressiveContextRepresentation} from './context.js';

const representations: ProgressiveContextRepresentation[] = [
  {level: 0, kind: 'summary', estimatedTokens: 40, available: true, authoritative: false},
  {level: 1, kind: 'index', estimatedTokens: 300, available: true, authoritative: false},
  {level: 2, kind: 'selected_context', estimatedTokens: 900, available: true, authoritative: false},
  {level: 3, kind: 'full_artifact', estimatedTokens: 20_000, available: true, authoritative: true},
];

function router() { return new ContextRouter(new ContextStore(path.join(os.tmpdir(), `agent-control-progressive-${Date.now()}-${Math.random()}.json`))); }

test('context router selects the smallest representation capable of discovery', () => {
  const selected = router().selectProgressive({handle: 'search:one', purpose: 'discover', remainingContextTokens: 10_000, representations});
  assert.equal(selected.representation.kind, 'summary');
  assert.equal(selected.fitsBudget, true);
});

test('context router selects match index and selected context progressively', () => {
  const value = router();
  assert.equal(value.selectProgressive({handle: 'search:one', purpose: 'locate_matches', remainingContextTokens: 10_000, representations}).representation.kind, 'index');
  assert.equal(value.selectProgressive({handle: 'search:one', purpose: 'inspect_selected', remainingContextTokens: 10_000, representations}).representation.kind, 'selected_context');
});

test('context router keeps the authoritative artifact visible when it exceeds budget', () => {
  const selected = router().selectProgressive({handle: 'search:one', purpose: 'verify_complete', remainingContextTokens: 5_000, representations});
  assert.equal(selected.representation.kind, 'full_artifact');
  assert.equal(selected.representation.authoritative, true);
  assert.equal(selected.fitsBudget, false);
  assert.match(selected.reason, /use_artifact_reference/);
});

test('context router fails closed when a required progressive level is unavailable', () => {
  assert.throws(() => router().selectProgressive({handle: 'search:one', purpose: 'inspect_selected', remainingContextTokens: 5_000, representations: representations.filter(item => item.level < 2)}), /representation_unavailable/);
});

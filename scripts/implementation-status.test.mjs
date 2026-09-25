import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {loadImplementationStatus, renderImplementationStatus} from './implementation-status.mjs';

test('implementation-status registry resolves every executable claim to source and tests', () => {
  const registry = loadImplementationStatus();
  assert.ok(registry.capabilities.length >= 10);
  assert.ok(registry.capabilities.some(item => item.id === 'jobs.model-backed-action' && item.status === 'QUALIFIED'));
  assert.ok(registry.capabilities.some(item => item.id === 'skills.governed-lifecycle' && item.status === 'QUALIFIED'));
  assert.equal(fs.readFileSync('docs/implementation-status.md', 'utf8'), renderImplementationStatus(registry));
});

test('public architecture does not retain superseded model-backed Action claims', () => {
  const publicText = ['README.md', 'ARCHITECTURE.md', 'docs/concepts.md'].map(file => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(publicText, /future model-backed Job Actions remain unqualified/);
  assert.doesNotMatch(publicText, /model-backed Job Action integration remain follow-on/);
  assert.doesNotMatch(publicText, /any future agent\/model Action must enter/);
  assert.doesNotMatch(publicText, /current deterministic fixture Actions do not impersonate agent execution/);
});

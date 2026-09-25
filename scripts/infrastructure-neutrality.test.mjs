import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Immutable qualification evidence records the environment where a release was proven;
// distributable configuration and runtime remain topology-neutral.
const exceptions = new Set([
  'CHANGELOG.md',
  'docs/evidence/infrastructure-agnostic-audit-3.0.1.md',
  'docs/evidence/agent-control-3.4.0-release-qualification.md',
  'docs/evidence/agent-control-3.8.1-qualification.md',
  // Accepted immutable physical evidence records the qualified controller cwd.
  // Runtime, configuration and operator documentation remain topology-neutral.
  'docs/evidence/agent-control-4.0-pixel-social-continuation.json',
  // Physical qualification harnesses intentionally bind their requested real
  // routes. They are not runtime defaults or distributable configuration.
  'scripts/qualify-cross-model-memory-4.5.ts',
  'scripts/qualify-memory-conditions-consolidation-4.5.ts',
  'scripts/record-cross-model-memory-4.5.ts',
]);
const excepted = file => exceptions.has(file) || file.startsWith('docs/evidence/') || file.startsWith('qualification/');
const textExtensions = /\.(?:ts|mjs|js|json|ya?ml|md|sh|py)$/i;
function sourceFiles(directory = '.') {
  const ignored = new Set(['.git', 'node_modules', '.agent-control', '.pdf-venv', 'qualification-results']);
  const result = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...sourceFiles(file));
    else result.push(file.replace(/^\.([\\/])/, '').replaceAll('\\', '/'));
  }
  return result;
}
let tracked;
try { tracked = execFileSync('git', ['ls-files', '-z'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).split('\0').filter(Boolean); }
catch { tracked = sourceFiles(); }
const forbidden = [
  ['hpub', 'untu'].join(''),
  ['senti', 'nel'].join(''),
  ['pixel', '-8-pro'].join(''),
  ['u0_', 'a438'].join(''),
  ['/fast/', 'repos'].join(''),
  ['/fast/', 'work'].join(''),
  ['agent-control-', 'pixel'].join(''),
  ['agent-control-', '2'].join(''),
  ['C:', '\\Users\\', 'Loz'].join(''),
];

test('tracked filenames contain no private topology identifiers', () => {
  const violations = tracked.filter(file => !excepted(file) && forbidden.some(value => file.toLowerCase().includes(value.toLowerCase())));
  assert.deepEqual(violations, []);
});

test('distributable text contains no private topology identifiers', () => {
  const violations = [];
  for (const file of tracked) {
    if (excepted(file) || !textExtensions.test(file) || !fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8').toLowerCase();
    for (const value of forbidden) if (source.includes(value.toLowerCase())) violations.push(`${file}: ${value}`);
  }
  assert.deepEqual(violations, []);
});

test('runtime does not require a named secure-overlay product', () => {
  const runtime = tracked.filter(file => /^(src|scripts|android)\//.test(file) && textExtensions.test(file) && fs.existsSync(file));
  const vendorName = ['tail', 'scale'].join('');
  assert.deepEqual(runtime.filter(file => fs.readFileSync(file, 'utf8').toLowerCase().includes(vendorName)), []);
});

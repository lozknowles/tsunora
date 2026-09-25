import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(root, 'src');

function sourceFiles(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [target] : [];
  });
}

test('production WorkExecutor construction has no raw agent-handler bypass', () => {
  const sites = sourceFiles(sourceRoot)
    .map(file => ({file, source: fs.readFileSync(file, 'utf8')}))
    .filter(item => item.source.includes('new WorkExecutor('));
  assert.ok(sites.length > 0, 'expected at least one explicit control-operation construction');
  for (const site of sites) {
    const relative = path.relative(root, site.file).replaceAll('\\', '/');
    const policyBacked = site.source.includes('new AdaptiveWorkDispatch(');
    const explicitControl = relative === 'src/control/android-provisioning-runtime.ts'
      && site.source.includes('new WorkExecutor(coordinator,new UnconfiguredAdaptiveDispatch(),controls)');
    assert.equal(policyBacked || explicitControl, true, `unreviewed WorkExecutor path:${relative}`);
  }
});

test('raw tool registry stays inside the central harness dispatch module', () => {
  const importers = sourceFiles(sourceRoot)
    .filter(file => path.basename(file) !== 'harness-dispatch.ts')
    .filter(file => /\bToolHandlerRegistry\b/.test(fs.readFileSync(file, 'utf8')))
    .map(file => path.relative(root, file).replaceAll('\\', '/'));
  assert.deepEqual(importers, []);
  const adapter = fs.readFileSync(path.join(sourceRoot, 'adapter.ts'), 'utf8');
  assert.match(adapter, /tools: ToolInvocationGateway/);
  assert.doesNotMatch(adapter, /ToolHandlerRegistry/);
});

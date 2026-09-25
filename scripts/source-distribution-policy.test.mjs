import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import test from 'node:test';
import {
  SOURCE_DISTRIBUTION_POLICY,
  classifySourceDistributionPath,
  inspectSourceDistribution,
} from './source-distribution-policy.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

test('source distribution rejects heavyweight qualification content', () => {
  assert.deepEqual(classifySourceDistributionPath('qualification/run/evidence.json', 10), ['qualification-tree']);
  assert.deepEqual(classifySourceDistributionPath('docs/images/release/dashboard.png', 10), ['dashboard-evidence-media']);
  assert.deepEqual(classifySourceDistributionPath('docs/evidence/run/video.mp4', 10), ['binary-qualification-evidence']);
  assert.deepEqual(
    classifySourceDistributionPath('docs/evidence/large.json', SOURCE_DISTRIBUTION_POLICY.maximumTrackedFileBytes + 1),
    ['oversized-tracked-object'],
  );
});

test('source distribution preserves product documentation and lightweight fixtures', () => {
  assert.deepEqual(classifySourceDistributionPath('assets/releases/3.1.0/operator-guide.pdf', 22_513), []);
  assert.deepEqual(classifySourceDistributionPath('artifacts/harness-mutation-evidence/example.patch.gz', 715), []);
  assert.deepEqual(classifySourceDistributionPath('docs/evidence/qualification-summary.json', 40_000), []);
});

test('tracked source tree satisfies the distribution boundary', () => {
  const result = inspectSourceDistribution(repositoryRoot);
  assert.equal(result.ok, true, JSON.stringify(result.violations, null, 2));
  assert.deepEqual(result.violations, []);
});

test('extracted source archives are validated without Git or installed dependencies', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'source-archive-policy-'));
  try {
    fs.writeFileSync(path.join(directory, 'package.json'), '{}');
    fs.mkdirSync(path.join(directory, 'node_modules'));
    fs.writeFileSync(path.join(directory, 'node_modules', 'installed.bin'), Buffer.alloc(1_000_001));
    const result = inspectSourceDistribution(directory);
    assert.equal(result.ok, true);
    assert.equal(result.trackedFiles, 1);
    fs.mkdirSync(path.join(directory, 'qualification'));
    fs.writeFileSync(path.join(directory, 'qualification', 'private.json'), '{}');
    assert.equal(inspectSourceDistribution(directory).ok, false);
  } finally { fs.rmSync(directory, {recursive: true}); }
});

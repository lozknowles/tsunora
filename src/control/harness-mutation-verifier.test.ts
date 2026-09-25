import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {createToolHandlerRegistry} from './harness-dispatch.js';
import {parseMutationBenchmarkSuite} from './harness-mutation-benchmark.js';
import {verifyMutationWorkspace} from './harness-mutation-verifier.js';
import {MUTATION_TOOL_IDS, MutationWorkspace} from './harness-mutation-workspace.js';

const root = process.cwd(), suite = parseMutationBenchmarkSuite(JSON.parse(fs.readFileSync(path.join(root, 'benchmarks', 'harness-mutation-jobs.json'), 'utf8')));

test('deterministic verifier rejects a plausible claim when no repository mutation exists', async () => {
  const task = suite.tasks[0], prepared = MutationWorkspace.prepare(path.join(root, suite.fixturePath), task);
  try {
    const result = await verifyMutationWorkspace(prepared.workspace, task);
    assert.equal(result.passed, false);
    assert.equal(result.failureClass, 'NO_MUTATION');
    assert.equal(result.checks.find(check => check.id === 'mutation_present')?.passed, false);
  } finally { prepared.workspace.cleanup(); }
});

test('deterministic verifier accepts the bounded timeout mutation and emits structured provenance', async () => {
  const task = suite.tasks[0], prepared = MutationWorkspace.prepare(path.join(root, suite.fixturePath), task);
  try {
    const registry = createToolHandlerRegistry(prepared.workspace.toolBindings());
    await registry.invoke(MUTATION_TOOL_IDS.replace, {path: 'src/constants.js', oldText: '30_000', newText: '45_000'}, {} as never, {assertActive: () => undefined});
    const result = await verifyMutationWorkspace(prepared.workspace, task);
    assert.equal(result.passed, true, JSON.stringify(result.checks));
    assert.equal(result.failureClass, 'NONE');
    assert.match(result.diffSha256, /^[a-f0-9]{64}$/);
    assert.ok(result.checks.every(check => check.evidenceIds.length > 0));
  } finally { prepared.workspace.cleanup(); }
});

test('test-addition verifier uses a policy mutant rather than a file-existence matcher', async () => {
  const task = suite.tasks.find(item => item.id === 'MUT-003')!, prepared = MutationWorkspace.prepare(path.join(root, suite.fixturePath), task);
  try {
    const registry = createToolHandlerRegistry(prepared.workspace.toolBindings());
    const meaningful = `import assert from 'node:assert/strict';\nimport test from 'node:test';\nimport {authorizeTool} from '../src/policy.js';\n\nconst base = {toolId: 'read', grantedTools: ['read', 'write'], approvedRisks: ['read', 'write'], leaseGeneration: 1, liveLeaseGeneration: 1, ownershipGeneration: 1, liveOwnershipGeneration: 1};\nfor (const risk of ['read', 'write']) test(\`human takeover denies \${risk}\`, () => { const result = authorizeTool({...base, owner: 'human', toolId: risk, risk}); assert.equal(result.allowed, false); assert.equal(result.reason, 'human_owns_execution'); });\n`;
    await registry.invoke(MUTATION_TOOL_IDS.write, {path: 'test/human-takeover.test.js', content: meaningful}, {} as never, {assertActive: () => undefined});
    const result = await verifyMutationWorkspace(prepared.workspace, task);
    assert.equal(result.passed, true, JSON.stringify(result.checks));
    assert.match(result.checks.find(check => check.id.startsWith('hidden_verifier:'))?.detail ?? '', /mutant/);
  } finally { prepared.workspace.cleanup(); }
});

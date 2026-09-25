import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createTransportContext, dependency, TransportIntegrityRuntime, transportContextSha256, verifyContextDependencies, type ContextDependencyStatus} from './transport-integrity.js';

function contract() {
  return createTransportContext({
    initiatingRequest: 'Review the repository; apiKey=sk-test-secret-value', acceptanceCriteria: ['schema-valid result', 'independent inspection'],
    repository: {identity: 'repo', branch: 'main', sha: 'a'.repeat(40), dirty: false, diffState: 'clean'}, scope: {description: 'frozen scope', files: ['src/index.ts'], omittedFiles: [], truncated: false},
    architectureConstraints: ['provider neutral'], runtimeTopology: {controller: 'controller', sourceWorker: 'worker-a'}, versions: {node: '22'}, policies: {permissions: ['read'], prohibitedActions: ['secrets'], limits: {}},
    priorDecisions: [], failures: [], testsAndEvidence: [], requiredArtifacts: ['result'], route: {provider: 'local', model: 'model', node: 'worker-a', capabilities: ['review']}, tokenState: {authority: 'unavailable'}, security: {credentialResidency: 'provider-local', referencesOnly: true}, approvals: [], provenance: {source: 'test', createdAt: '2026-01-01T00:00:00Z', freshAt: '2026-01-01T00:00:00Z'},
  });
}
function deps(status: ContextDependencyStatus = 'SATISFIED') { return [dependency({id: 'request', required: true, source: 'job', provenance: 'run', freshness: {observedAt: '2026-01-01T00:00:00Z'}, status}), dependency({id: 'optional-note', required: false, source: 'note', provenance: 'test', freshness: {observedAt: '2026-01-01T00:00:00Z'}, status: status === 'SATISFIED' ? 'MISSING' : status})]; }

test('transport context is canonical, hashed, redacted and complete only from required dependencies', () => {
  const value = contract();
  assert.equal(value.initiatingRequest.includes('sk-test-secret'), false);
  assert.equal(transportContextSha256(value), transportContextSha256(structuredClone(value)));
  const runtime = new TransportIntegrityRuntime();
  const record = runtime.create('parcel-1', value, deps());
  assert.equal(record.state, 'DEGRADED');
  assert.equal(record.score, 100);
  assert.equal(record.contractSha256.length, 64);
});

test('missing, stale and contradictory context fail closed with explainable remediation', () => {
  const runtime = new TransportIntegrityRuntime(), value = contract();
  assert.equal(runtime.create('missing', value, deps('MISSING')).state, 'BLOCKED');
  const stale = runtime.create('stale', value, deps());
  assert.equal(runtime.evaluate('stale', deps('STALE')).state, 'ESCALATED');
  assert.match(runtime.get('missing')!.reason, /unavailable/);
  assert.ok(runtime.get('stale')!.remediation.length);
});

test('dependency freshness and expected identity/hash checks are deterministic', () => {
  const observed = verifyContextDependencies([
    dependency({id: 'fresh', required: true, source: 'repo', provenance: 'sha-a', freshness: {observedAt: '2026-01-01T00:00:00Z', maxAgeMs: 100}, expectedIdentity: 'sha-a', observedIdentity: 'sha-b'}),
    dependency({id: 'hash', required: true, source: 'file', provenance: 'file', freshness: {observedAt: '2026-01-01T00:00:00Z'}, expectedSha256: 'expected', observedSha256: 'actual'}),
  ], Date.parse('2026-01-01T00:00:01Z'));
  assert.deepEqual(observed.map(item => item.status), ['STALE', 'CONFLICTING']);
});

test('repairs are append-only and independent inspection rejects self approval', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'transport-integrity-'));
  try {
    const runtime = new TransportIntegrityRuntime(path.join(root, 'records.json'));
    runtime.create('parcel', contract(), deps());
    runtime.repair('parcel', 'request', 'SATISFIED', 'operator refresh', 'evidence-1');
    assert.equal(runtime.get('parcel')!.repairs.length, 1);
    assert.equal(runtime.independentInspection('parcel', {inspectorId: 'same', generatorId: 'same', method: 'self-review', result: 'PASSED'}).state, 'ESCALATED');
    const reloaded = new TransportIntegrityRuntime(path.join(root, 'records.json'));
    assert.equal(reloaded.get('parcel')!.repairs[0].evidenceId, 'evidence-1');
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

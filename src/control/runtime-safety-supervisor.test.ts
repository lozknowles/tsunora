import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {deriveRuntimeActionIntent, RuntimeSafetySupervisor, type RuntimeActionIntent} from './runtime-safety-supervisor.js';

const intent = (overrides: Partial<RuntimeActionIntent> = {}): RuntimeActionIntent => ({
  runId: 'run-1', parcelId: 'parcel-1', stageId: 'stage-1', stepId: 'step-1', actor: 'agent-control', action: 'inspect@1.0.0', goal: 'Inspect repository', categories: ['READ_ONLY'], filesystemScope: [], repositoryScope: [], remoteNodeIds: [], credentialReferences: [], externalDestinations: [], production: false, destructive: false, requestedCapabilities: ['repository.read'], ...overrides,
});

test('runtime safety allows bounded reads and audits scoped writes independently of executor intent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-safety-scope-')), repository = path.join(root, 'project'), workspace = path.join(root, 'workspace'); fs.mkdirSync(repository); fs.mkdirSync(workspace);
  const supervisor = new RuntimeSafetySupervisor({id: 'test-policy', approvedRepositoryRoots: [repository], approvedFilesystemRoots: [workspace]});
  assert.equal(supervisor.assess(intent()).outcome, 'ALLOW');
  const write = supervisor.assess(intent({stepId: 'write', action: 'repository.write', categories: ['REPOSITORY_WRITE'], repositoryScope: [path.join(repository, 'src')]}));
  assert.equal(write.outcome, 'ALLOW_WITH_AUDIT');
  assert.equal(write.policyId, 'test-policy');
  fs.rmSync(root, {recursive: true, force: true});
});

test('canonical scope checks deny traversal, prefix confusion, symlink escapes, relative and foreign-platform paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-safety-canonical-')), repository = path.join(root, 'project'), outside = path.join(root, 'secrets'); fs.mkdirSync(repository); fs.mkdirSync(outside); fs.symlinkSync(outside, path.join(repository, 'escape'));
  const supervisor = new RuntimeSafetySupervisor({id: 'scopes', approvedRepositoryRoots: [repository, 'C:\\Work\\project']});
  assert.equal(supervisor.assess(intent({stepId: 'inside-new', repositoryScope: [path.join(repository, 'new', 'output.txt')]})).outcome, 'ALLOW');
  assert.equal(supervisor.assess(intent({stepId: 'traversal', repositoryScope: [path.join(repository, '..', 'secrets')]})).outcome, 'DENY');
  assert.equal(supervisor.assess(intent({stepId: 'prefix', repositoryScope: [`${repository}-evil`]})).outcome, 'DENY');
  assert.equal(supervisor.assess(intent({stepId: 'symlink', repositoryScope: [path.join(repository, 'escape', 'secret.txt')]})).outcome, 'DENY');
  assert.equal(supervisor.assess(intent({stepId: 'relative', repositoryScope: ['src']})).outcome, 'DENY');
  assert.equal(supervisor.assess(intent({stepId: 'windows-ok', repositoryScope: ['c:\\work\\project\\src']})).outcome, 'DENY');
  assert.equal(supervisor.assess(intent({stepId: 'windows-bad', repositoryScope: ['C:\\Work\\elsewhere']})).outcome, 'DENY');
  fs.rmSync(root, {recursive: true, force: true});
});

test('destructive and production actions pause for explicit approval and approval survives restart', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-safety-')), file = path.join(root, 'safety.json'), supervisor = new RuntimeSafetySupervisor({id: 'approval-policy'}, file, () => '2026-09-05T10:00:00Z');
  const decision = supervisor.assess(intent({stepId: 'remove', action: 'repository.delete', categories: ['DESTRUCTIVE'], destructive: true}));
  assert.equal(decision.outcome, 'REQUIRE_APPROVAL');
  assert.match(decision.approvalId ?? '', /^runtime-safety:/);
  assert.equal(supervisor.approve(decision.id, 'operator').outcome, 'ALLOW_WITH_AUDIT');
  const restored = new RuntimeSafetySupervisor({id: 'approval-policy'}, file);
  assert.equal(restored.list()[0].outcome, 'ALLOW_WITH_AUDIT');
  assert.ok(restored.list()[0].evidence.includes('approval:operator'));
});

test('plain credentials fail closed before redaction while opaque environment references remain allowed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-safety-secret-')), file = path.join(root, 'safety.json'), supervisor = new RuntimeSafetySupervisor({id: 'secret-policy'}, file);
  const derived = deriveRuntimeActionIntent({runId: 'run-secret', stepId: 'step-secret', actor: 'agent-control', action: 'provider.auth', goal: 'Qualify provider', parameters: {apiKey: 'sk-proj-abcdefghijklmnop'}, requestedCapabilities: ['credential.use'], resources: [], effectDeclaration: {mode: 'CATEGORIES', categories: ['CREDENTIAL_USE']}});
  assert.equal(derived.sensitiveMaterialDetected, true);
  const denied = supervisor.assess(derived);
  assert.equal(denied.outcome, 'DENY');
  assert.match(denied.reason, /Plain credential material/);
  const safe = supervisor.assess(intent({runId: 'run-reference', stepId: 'step-reference', categories: ['CREDENTIAL_USE'], credentialReferences: ['OPENAI_API_KEY'], requestedCapabilities: ['credential.use']}));
  assert.equal(safe.outcome, 'ALLOW_WITH_AUDIT');
  const persisted = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(persisted, /sk-proj-abcdefghijklmnop/);
  assert.match(persisted, /Plain credential material is forbidden/);
});

test('missing effects and misleading read-only declarations fail closed and cannot be approved', () => {
  const supervisor = new RuntimeSafetySupervisor({id: 'classification'});
  const missing = deriveRuntimeActionIntent({runId: 'unknown', stepId: 'unknown', actor: 'operator', action: 'friendly.task', goal: 'Do useful work', parameters: {}, requestedCapabilities: [], resources: []});
  const denied = supervisor.assess(missing); assert.equal(denied.outcome, 'DENY'); assert.throws(() => supervisor.approve(denied.id, 'operator'), /not_approvable/);
  const misleading = deriveRuntimeActionIntent({runId: 'misleading', stepId: 'misleading', actor: 'operator', action: 'friendly.task', goal: 'Delete repository data', parameters: {}, requestedCapabilities: [], resources: [], effectDeclaration: {mode: 'READ_ONLY'}});
  assert.equal(supervisor.assess(misleading).outcome, 'DENY');
});

test('remote nodes and external communication obey separate policy dimensions', () => {
  const supervisor = new RuntimeSafetySupervisor({id: 'remote-policy', approvedRemoteNodes: ['qualified-node'], requireApprovalForExternalCommunication: true});
  assert.equal(supervisor.assess(intent({stepId: 'remote-ok', categories: ['REMOTE_NODE'], remoteNodeIds: ['qualified-node']})).outcome, 'ALLOW_WITH_AUDIT');
  assert.equal(supervisor.assess(intent({stepId: 'remote-bad', categories: ['REMOTE_NODE'], remoteNodeIds: ['unknown']})).outcome, 'DENY');
  assert.equal(supervisor.assess(intent({stepId: 'message', categories: ['EXTERNAL_COMMUNICATION'], externalDestinations: ['https://example.test']})).outcome, 'REQUIRE_APPROVAL');
});

test('read-only skill promotion terminology is not confused with release promotion',()=>{
  const supervisor=new RuntimeSafetySupervisor({id:'skill-promotion'});
  const skill=deriveRuntimeActionIntent({runId:'skill',stepId:'execute',actor:'operator',action:'deterministic-skill.execute@1.0.0',goal:'Execute a previously promoted deterministic skill',parameters:{taskClass:'repository-state'},requestedCapabilities:['qualification.local'],resources:[],effectDeclaration:{mode:'READ_ONLY'}});
  assert.equal(supervisor.assess(skill).outcome,'ALLOW');
  const release=deriveRuntimeActionIntent({runId:'release',stepId:'promote',actor:'operator',action:'candidate.promote@1.0.0',goal:'Promote release candidate to production',parameters:{},requestedCapabilities:[],resources:[],effectDeclaration:{mode:'READ_ONLY'}});
  assert.equal(supervisor.assess(release).outcome,'DENY');
});

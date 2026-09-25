import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {validateConfig} from './config.js';
import {ModelRegistry} from './model-registry.js';
import {accountCredentialResidency, accountProviderExecutionNode, resolveCodexAccountEnvironment} from './provider-account-profile.js';
import {ResourceRepositoryResolver} from './resource-repository-resolver.js';
import {buildRepositoryContext, LocalRepositoryResolver} from './repository-review-runtime.js';
import type {SshExecutor} from './managed-node-ssh.js';

const resource = (id: string, platform: 'linux' | 'windows', local = false) => ({id, platform, transport: local ? {type: 'local' as const} : {type: 'ssh' as const, host: `${id}.example`, user: 'operator'}, capabilities: ['repository.read', 'model.execute']});
const qualified = (nodes: string[]) => ({state: 'QUALIFIED' as const, version: 'q1', qualifiedAt: '2026-09-03T00:00:00Z', capabilities: ['repository-review'], nodes});
const remoteIdentity = (nodeId: string, repository: string) => createHash('sha256').update(`${nodeId}\n${path.win32.normalize(repository).replace(/[\\/]+$/, '').toLowerCase()}`).digest('hex');

test('explicit credential residency separates workload, provider execution and credential nodes', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-residency-'));
  const account = {id: 'account-a', label: 'Account A', providerExecutionNodeId: 'controller-node', credentialResidency: {nodeId: 'controller-node', store: {type: 'codex-home-env' as const, env: 'CODEX_HOME_ACCOUNT_A'}}, qualification: {state: 'QUALIFIED' as const, version: 'aq1', checkedAt: '2026-09-03T00:00:00Z', qualifiedAt: '2026-09-03T00:00:00Z', capabilities: ['codex-chatgpt'], evidence: ['login-status']}};
  const registry = new ModelRegistry([{id: 'codex', kind: 'cli', accountProfiles: [account]}], [{id: 'review-a', provider: 'codex', accountProfile: 'account-a', providerModel: 'gpt-example', capabilities: ['repository-review'], qualification: qualified(['controller-node'])}], {roles: {review: {primary: 'review-a'}}}, undefined, undefined, {CODEX_HOME_ACCOUNT_A: temporary});
  const route = registry.route({modelRole: 'review', nodeId: 'msi', workloadNodeId: 'msi'});
  assert.deepEqual({workload: route.workloadNodeId, execution: route.providerExecutionNodeId, credential: route.credentialNodeId, legacy: route.nodeId}, {workload: 'msi', execution: 'controller-node', credential: 'controller-node', legacy: 'controller-node'});
  assert.equal(registry.accountProfilesList()[0].credentialNodeId, 'controller-node');
  assert.equal(JSON.stringify(route).includes(temporary), false);
});

test('account-bound Codex execution strips ambient API billing credentials', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-account-env-'));
  try {
    const account = {id: 'account-a', label: 'Account A', providerExecutionNodeId: 'controller', credentialResidency: {nodeId: 'controller', store: {type: 'codex-home-env' as const, env: 'CODEX_HOME_ACCOUNT_A'}}};
    const resolved = resolveCodexAccountEnvironment(account, {CODEX_HOME_ACCOUNT_A: temporary, OPENAI_API_KEY: 'forbidden-openai', CODEX_API_KEY: 'forbidden-codex', SAFE_SETTING: 'retained'}, 'controller');
    assert.equal(resolved.environment.CODEX_HOME, temporary);
    assert.equal(resolved.environment.SAFE_SETTING, 'retained');
    assert.equal(resolved.environment.OPENAI_API_KEY, undefined);
    assert.equal(resolved.environment.CODEX_API_KEY, undefined);
  } finally { fs.rmSync(temporary, {recursive: true, force: true}); }
});

test('account-less provider execution uses qualified model placement instead of the workload node', () => {
  const registry = new ModelRegistry([{id: 'glm', kind: 'responses'}], [{id: 'glm-review', provider: 'glm', providerModel: 'glm-example', capabilities: ['repository-review'], qualification: qualified(['controller'])}], {roles: {review: {primary: 'glm-review'}}});
  const route = registry.route({modelRole: 'review', nodeId: 'msi', workloadNodeId: 'msi'});
  assert.deepEqual({workload: route.workloadNodeId, execution: route.providerExecutionNodeId, credential: route.credentialNodeId}, {workload: 'msi', execution: 'controller', credential: null});
});

test('two accounts on one credential node remain distinct and governed fallback records rejection', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-accounts-'));
  const make = (id: string, env: string, state: 'QUALIFIED' | 'DISABLED') => ({id, label: id, providerExecutionNodeId: 'controller', credentialResidency: {nodeId: 'controller', store: {type: 'codex-home-env' as const, env}}, enabled: state !== 'DISABLED', qualification: {state, version: `${id}-q`, checkedAt: '2026-09-03T00:00:00Z', ...(state === 'QUALIFIED' ? {qualifiedAt: '2026-09-03T00:00:00Z', capabilities: ['codex-chatgpt'], evidence: ['login-status']} : {})}});
  const accounts = [make('account-a', 'CODEX_HOME_ACCOUNT_A', 'DISABLED'), make('account-b', 'CODEX_HOME_ACCOUNT_B', 'QUALIFIED')];
  const models = accounts.map(account => ({id: `model-${account.id.at(-1)}`, provider: 'codex', accountProfile: account.id, providerModel: 'gpt-example', capabilities: ['repository-review'], qualification: qualified(['controller'])}));
  const registry = new ModelRegistry([{id: 'codex', kind: 'cli', accountProfiles: accounts}], models, {roles: {review: {primary: 'model-a', fallback: ['model-b']}}}, undefined, undefined, {CODEX_HOME_ACCOUNT_A: temporary, CODEX_HOME_ACCOUNT_B: temporary});
  const route = registry.route({modelRole: 'review', nodeId: 'msi', workloadNodeId: 'msi', allowFallback: true});
  assert.equal(route.accountProfileId, 'account-b'); assert.equal(route.fallback, true); assert.match(route.fallbackReason ?? '', /account-profile-disabled/);
  assert.deepEqual(route.considered.map(item => [item.accountProfileId, item.eligible]), [['account-a', false], ['account-b', true]]);
});

test('missing credential-node qualification fails closed without consulting workload-node environment', () => {
  const account = {id: 'remote-account', label: 'Remote Account', providerExecutionNodeId: 'credential-node', credentialResidency: {nodeId: 'credential-node', store: {type: 'codex-home-env' as const, env: 'CODEX_HOME_REMOTE'}}, qualification: {state: 'FAILED' as const, version: 'aq-failed', checkedAt: '2026-09-03T00:00:00Z', detail: 'credential-node-unavailable'}};
  const registry = new ModelRegistry([{id: 'codex', kind: 'cli', accountProfiles: [account]}], [{id: 'remote-model', provider: 'codex', accountProfile: account.id, providerModel: 'gpt-example', capabilities: ['repository-review'], qualification: qualified(['credential-node'])}], {roles: {review: {primary: 'remote-model'}}}, undefined, undefined, {CODEX_HOME_REMOTE: '/workload/must-not-be-used'});
  assert.throws(() => registry.route({modelRole: 'review', nodeId: 'workload-node', workloadNodeId: 'workload-node'}), (error: unknown) => { const considered = (error as Error & {considered?: Array<{reasons: string[]}>}).considered; assert.ok(considered?.[0].reasons.some(reason => /account-profile/.test(reason))); return true; });
});

test('3.8 account.nodeId and credentialStore migrate to identical execution and credential locality', () => {
  const old = {id: 'legacy', nodeId: 'windows-node', label: 'Legacy', credentialStore: {type: 'codex-home-env' as const, env: 'CODEX_HOME_LEGACY'}};
  const config = validateConfig({schemaVersion: 1, resources: [resource('windows-node', 'windows')], providers: [{id: 'codex', kind: 'cli', accountProfiles: [old]}], models: [{id: 'legacy-model', provider: 'codex', accountProfile: 'legacy', providerModel: 'gpt-example', nodes: ['windows-node'], capabilities: []}], modelRouting: {roles: {}}, services: [], lanes: []});
  const profile = config.providers[0].accountProfiles![0];
  assert.equal(accountProviderExecutionNode(profile), 'windows-node'); assert.deepEqual(accountCredentialResidency(profile), {nodeId: 'windows-node', store: old.credentialStore});
});

test('remote immutable snapshot crosses nodes as a verified archive without credential material', async () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-remote-source-')), snapshots = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-remote-snapshots-'));
  execFileSync('git',['init'],{cwd:source});execFileSync('git',['config','user.email','fixture@example.invalid'],{cwd:source});execFileSync('git',['config','user.name','Fixture'],{cwd:source});fs.writeFileSync(path.join(source, 'README.md'), '# Remote repository\n');execFileSync('git',['add','README.md'],{cwd:source});execFileSync('git',['commit','-m','fixture'],{cwd:source});
  const reviewedSha=execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim(),archive=path.join(os.tmpdir(),`ac-remote-${process.pid}.tar`);execFileSync('git',['archive','--format=tar',`--output=${archive}`,reviewedSha],{cwd:source}); const bytes = fs.readFileSync(archive), archiveSha256 = createHash('sha256').update(bytes).digest('hex');
  let payload: Record<string, unknown> | undefined;
  const executor: SshExecutor = async (_command, _args, input) => { const lines = input.trimEnd().split(/\r?\n/); payload = JSON.parse(Buffer.from(lines.shift()!, 'base64').toString('utf8')); return {status: 0, stdout: JSON.stringify({schema: 'agent-control.repository-snapshot-result/v1', ok: true, nodeId: 'msi', sourceIdentity: remoteIdentity('msi','C:\\work\\repo'), reviewedSha, dirty: false, archiveSha256, archiveBase64: bytes.toString('base64'), createdAt: '2026-09-03T00:00:00Z'}), stderr: 'raw remote output forbidden'}; };
  const resolver = new ResourceRepositoryResolver([resource('msi', 'windows')], new LocalRepositoryResolver(), executor, 'param([string]$PayloadLine)\n');
  const resolved = await resolver.resolve({nodeId: 'msi', repository: 'C:\\work\\repo', requestedRef: 'main', allowedRoots: ['C:\\work'], snapshotsRoot: snapshots});
  assert.equal(resolved.nodeId, 'msi'); assert.equal(resolved.snapshotKind, 'remote-immutable-archive'); assert.equal(resolved.bundleSha256, archiveSha256); assert.equal(fs.readFileSync(path.join(resolved.snapshotPath, 'README.md'), 'utf8'), '# Remote repository\n');
  assert.equal(JSON.stringify(payload).includes('CODEX_HOME'), false); assert.equal(JSON.stringify(payload).includes('credential'), false); assert.equal(JSON.stringify(resolved).includes('C:\\work\\repo'), false);
  assert.ok(buildRepositoryContext(resolved, 'THIN').chunks.some(chunk => chunk.files.includes('README.md')));
  fs.rmSync(archive,{force:true});
});

test('Windows snapshot runner is fixed-purpose and never reads or emits provider credential references', () => {
  const source = fs.readFileSync(path.resolve('scripts/repository-snapshot-windows.ps1'), 'utf8');
  assert.match(source, /freezeGitRepository/); assert.match(source, /git -C \$repository archive/); assert.match(source, /Get-FileHash/); assert.match(source, /archiveBytes.+-gt 49283072/); assert.ok(source.indexOf('archiveBytes') < source.indexOf('ReadAllBytes'));
  assert.doesNotMatch(source, /CODEX_HOME|auth\.json|Invoke-Expression|\biex\b/);
  assert.doesNotMatch(source, /access.?token|refresh.?token|api.?key/i);
});

test('remote snapshot import rejects a symlink that escapes the read-only extraction root', async () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-remote-unsafe-')), snapshots = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-remote-unsafe-snapshots-'));
  execFileSync('git',['init'],{cwd:source});execFileSync('git',['config','user.email','fixture@example.invalid'],{cwd:source});execFileSync('git',['config','user.name','Fixture'],{cwd:source});fs.symlinkSync('../../outside', path.join(source, 'escape'));execFileSync('git',['add','escape'],{cwd:source});execFileSync('git',['commit','-m','unsafe fixture'],{cwd:source});const reviewedSha=execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim();
  const archive = path.join(os.tmpdir(), `ac-unsafe-${process.pid}.tar`); execFileSync('git', ['archive','--format=tar',`--output=${archive}`,reviewedSha],{cwd:source});
  const bytes = fs.readFileSync(archive), archiveSha256 = createHash('sha256').update(bytes).digest('hex');
  const executor: SshExecutor = async () => ({status: 0, stdout: JSON.stringify({schema: 'agent-control.repository-snapshot-result/v1', ok: true, nodeId: 'msi', sourceIdentity: remoteIdentity('msi','C:\\work\\repo'), reviewedSha, archiveSha256, archiveBase64: bytes.toString('base64')}), stderr: ''});
  const resolver = new ResourceRepositoryResolver([resource('msi', 'windows')], new LocalRepositoryResolver(), executor, 'param([string]$PayloadLine)\n');
  await assert.rejects(() => resolver.resolve({nodeId: 'msi', repository: 'C:\\work\\repo', requestedRef: 'main', allowedRoots: ['C:\\work'], snapshotsRoot: snapshots}), /repository_snapshot_archive_invalid/);
  assert.deepEqual(fs.readdirSync(snapshots), []);
  fs.rmSync(archive, {force: true});
});

test('remote snapshot import binds source identity and Git archive commit to the requested repository', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ac-remote-binding-')),archive=path.join(root,'snapshot.tar'),snapshots=path.join(root,'snapshots');execFileSync('git',['init'],{cwd:root});execFileSync('git',['config','user.email','fixture@example.invalid'],{cwd:root});execFileSync('git',['config','user.name','Fixture'],{cwd:root});fs.writeFileSync(path.join(root,'bound.txt'),'bound\n');execFileSync('git',['add','bound.txt'],{cwd:root});execFileSync('git',['commit','-m','bound'],{cwd:root});const actual=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();execFileSync('git',['archive','--format=tar',`--output=${archive}`,actual],{cwd:root});const bytes=fs.readFileSync(archive),archiveSha256=createHash('sha256').update(bytes).digest('hex'),base={schema:'agent-control.repository-snapshot-result/v1',ok:true,nodeId:'msi',sourceIdentity:remoteIdentity('msi','C:\\work\\repo'),reviewedSha:actual,archiveSha256,archiveBase64:bytes.toString('base64')};
  const resolve=(wire:Record<string,unknown>)=>new ResourceRepositoryResolver([resource('msi','windows')],new LocalRepositoryResolver(),async()=>({status:0,stdout:JSON.stringify(wire),stderr:''}),'param([string]$PayloadLine)\n').resolve({nodeId:'msi',repository:'C:\\work\\repo',requestedRef:'main',allowedRoots:['C:\\work'],snapshotsRoot:snapshots});
  await assert.rejects(()=>resolve({...base,reviewedSha:'2'.repeat(40)}),/repository_snapshot_revision_mismatch/);
  await assert.rejects(()=>resolve({...base,reviewedSha:'2'.repeat(45)}),/repository_snapshot_result_invalid/);
  await assert.rejects(()=>resolve({...base,sourceIdentity:'1'.repeat(64)}),/repository_snapshot_result_invalid/);
});

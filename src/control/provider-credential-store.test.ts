import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type {ProviderConfig} from './config.js';
import {
  credentialReferenceStatus,
  providerCredentialReferenceType,
  providerCredentialStatus,
  resolveCredentialReference,
  resolveProviderAccountCredential,
  resolveProviderCredential,
  SecureProviderCredentialStore,
} from './provider-credential-store.js';

const synthetic = (suffix = 'AAAA') => ['nvapi', 'fixture', `${'A'.repeat(20)}${suffix}`].join('-');

test('existing provider-secure-store reference gets owner-only atomic storage, rotation and revocation', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-provider-credential-')), directory = path.join(root, 'store'), store = new SecureProviderCredentialStore(directory), reference = 'provider:nvidia-hosted';
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  assert.equal(store.status(reference), 'MISSING');
  const first = synthetic('ABCD'), second = synthetic('EFGH');
  assert.deepEqual(store.set(reference, first), {status: 'CONFIGURED', fingerprint: 'nvapi-…ABCD'});
  assert.equal(store.get(reference), first);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  const files = fs.readdirSync(directory); assert.equal(files.length, 1); assert.doesNotMatch(files[0], /nvidia|hosted|provider/);
  assert.equal(fs.statSync(path.join(directory, files[0])).mode & 0o777, 0o600);
  assert.deepEqual(store.set(reference, second), {status: 'CONFIGURED', fingerprint: 'nvapi-…EFGH'});
  assert.equal(store.get(reference), second);
  assert.deepEqual(store.revoke(reference), {status: 'MISSING'});
  assert.equal(store.status(reference), 'MISSING');
  assert.deepEqual(store.revoke(reference), {status: 'MISSING'});
});

test('secure store rejects permissive files and symbolic-link targets', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-provider-credential-perms-')), directory = path.join(root, 'store'), store = new SecureProviderCredentialStore(directory), reference = 'provider:fixture';
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  store.set(reference, synthetic());
  const [file] = fs.readdirSync(directory); fs.chmodSync(path.join(directory, file), 0o644);
  assert.equal(store.status(reference), 'INVALID_STORE');
  assert.throws(() => store.get(reference), /permissions_invalid/);
  fs.unlinkSync(path.join(directory, file)); fs.symlinkSync(path.join(root, 'elsewhere'), path.join(directory, file));
  assert.throws(() => store.set(reference, synthetic('WXYZ')), /permissions_invalid/);
});

test('environment, file and opaque references share one late resolver and remain compatible', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-provider-reference-')), file = path.join(root, 'credential'), store = new SecureProviderCredentialStore(path.join(root, 'store')), environment: NodeJS.ProcessEnv = {DIRECT_KEY: 'environment-fixture-value', FILE_KEY: file};
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.writeFileSync(file, 'file-fixture-value', {mode: 0o600}); store.set('provider:opaque', synthetic('IJKL'));
  assert.equal(resolveCredentialReference({type: 'api-key-env', env: 'DIRECT_KEY'}, environment, store), 'environment-fixture-value');
  assert.equal(resolveCredentialReference({type: 'bearer-file-env', env: 'FILE_KEY'}, environment, store), 'file-fixture-value');
  assert.equal(resolveCredentialReference({type: 'provider-secure-store', reference: 'provider:opaque'}, environment, store), synthetic('IJKL'));
  assert.equal(credentialReferenceStatus({type: 'api-key-env', env: 'MISSING'}, environment, store), 'MISSING');
  const fallbackProvider: ProviderConfig = {id: 'legacy-file-fallback', kind: 'openai-compatible', baseUrl: 'https://models.example/v1', auth: {type: 'api-key-env', env: 'MISSING'}, credentialFileEnv: 'FILE_KEY'};
  assert.equal(providerCredentialStatus(fallbackProvider, environment, store), 'CONFIGURED');
  assert.equal(resolveProviderCredential(fallbackProvider, environment, store), 'file-fixture-value');
});

test('API account profiles resolve only their own credential and never fall back across accounts or nodes', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-provider-accounts-')), store = new SecureProviderCredentialStore(path.join(root, 'store')), environment: NodeJS.ProcessEnv = {GLOBAL_PROVIDER_KEY: 'global-provider-credential'};
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const provider: ProviderConfig = {id: 'external', kind: 'openai-compatible', baseUrl: 'https://models.example/v1', auth: {type: 'api-key-env', env: 'GLOBAL_PROVIDER_KEY'}};
  const account = (id: string, reference: string, nodeId = 'controller') => ({id, label: id, providerExecutionNodeId: nodeId, credentialResidency: {nodeId, store: {type: 'provider-secure-store' as const, reference}}, qualification: {state: 'QUALIFIED' as const, version: 'q1'}});
  store.set('provider:external:account-a', 'account-a-credential-value');
  store.set('provider:external:account-b', 'account-b-credential-value');
  assert.equal(resolveProviderAccountCredential(provider, account('account-a', 'provider:external:account-a'), environment, store), 'account-a-credential-value');
  assert.equal(resolveProviderAccountCredential(provider, account('account-b', 'provider:external:account-b'), environment, store), 'account-b-credential-value');
  assert.throws(() => resolveProviderAccountCredential(provider, account('remote', 'provider:external:account-a', 'remote-node'), environment, store), /account_profile_remote_resolution_forbidden/);
});

test('provider projections expose only reference class and status while invocation resolves the value', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-provider-projection-')), environment: NodeJS.ProcessEnv = {AGENT_CONTROL_STATE_DIR: root}, store = new SecureProviderCredentialStore(path.join(root, 'credentials', 'providers')), secret = synthetic('MNOP');
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const provider: ProviderConfig = {id: 'nvidia-hosted', kind: 'openai-compatible', baseUrl: 'https://integrate.api.nvidia.com/v1', auth: {type: 'provider-secure-store', reference: 'provider:nvidia-hosted'}};
  store.set('provider:nvidia-hosted', secret);
  assert.equal(providerCredentialStatus(provider, environment, store), 'CONFIGURED');
  assert.equal(providerCredentialReferenceType(provider), 'secure-store');
  assert.equal(resolveProviderCredential(provider, environment, store), secret);
  assert.equal(JSON.stringify({providerId: provider.id, credentialStatus: providerCredentialStatus(provider, environment, store), credentialReference: providerCredentialReferenceType(provider)}).includes(secret), false);
});

test('credential status is a metadata-only configured check and validation remains invocation-time', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-provider-status-')), directory = path.join(root, 'store'), store = new SecureProviderCredentialStore(directory), reference = 'provider:future';
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  store.set(reference, 'future-provider-credential-value');
  const [file] = fs.readdirSync(directory);
  fs.writeFileSync(path.join(directory, file), 'x', {mode: 0o600});
  assert.equal(store.status(reference), 'CONFIGURED');
  assert.throws(() => store.get(reference), /credential_format_invalid/);
});

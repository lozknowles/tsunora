import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {qualifyAccountProfile} from './account-profile-qualification.js';
import {AccountProfileQualificationStore, ModelRegistry} from './model-registry.js';
import type {CodexNodeExecutionPort} from './codex-node-execution.js';

test('Codex account qualification probes only the selected isolated home and persists no credentials', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-account-qualification-'));
  const proHome = path.join(root, 'pro'), plusHome = path.join(root, 'plus'), stateFile = path.join(root, 'qualification.json');
  fs.mkdirSync(proHome); fs.mkdirSync(plusHome);
  const secret = 'sk-account-qualification-secret-123456789';
  fs.writeFileSync(path.join(proHome, 'auth.json'), JSON.stringify({access_token: secret}));
  const provider = {id: 'codex', kind: 'cli' as const, accountProfiles: [
    {id: 'lawrence-pro', label: 'Lawrence Pro', credentialStore: {type: 'codex-home-env' as const, env: 'CODEX_HOME_LAWRENCE_PRO'}},
    {id: 'cottage-plus', label: 'Cottage Plus', credentialStore: {type: 'codex-home-env' as const, env: 'CODEX_HOME_COTTAGE_PLUS'}},
  ]};
  const environment = {CODEX_HOME: '/global-unchanged', CODEX_HOME_LAWRENCE_PRO: proHome, CODEX_HOME_COTTAGE_PLUS: plusHome};
  const registry = new ModelRegistry([provider], [], {roles: {}}, undefined, new AccountProfileQualificationStore(stateFile), environment);
  try {
    const result = await qualifyAccountProfile({registry, providerId: 'codex', accountProfileId: 'lawrence-pro', environment, probe: async (_command, _cwd, _timeout, childEnvironment) => { assert.equal(childEnvironment.CODEX_HOME, proHome); assert.notEqual(childEnvironment.CODEX_HOME, plusHome); return {mode: 'chatgpt'}; }});
    assert.equal(result.record.state, 'QUALIFIED');
    assert.equal(result.record.accountProfileId, 'lawrence-pro');
    assert.equal(environment.CODEX_HOME, '/global-unchanged');
    const persisted = fs.readFileSync(stateFile, 'utf8');
    assert.equal(persisted.includes(secret), false); assert.equal(persisted.includes(root), false); assert.equal(persisted.includes('auth.json'), false);
    assert.deepEqual(JSON.parse(persisted).records[0].evidence, ['codex-login-status:chatgpt']);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('remote account qualification dispatches by node identity and persists only sanitized discovery evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-remote-account-qualification-')), stateFile = path.join(root, 'qualification.json');
  const provider = {id: 'codex', kind: 'cli' as const, accountProfiles: [{id: 'account-a', nodeId: 'windows-node', label: 'Account A', credentialStore: {type: 'codex-home-env' as const, env: 'CODEX_HOME_ACCOUNT_A'}}]};
  const registry = new ModelRegistry([provider], [], {roles: {}}, undefined, new AccountProfileQualificationStore(stateFile), {CODEX_HOME_ACCOUNT_A: '/controller/path-must-not-be-used'});
  let requestNode = '';
  const nodeExecution: CodexNodeExecutionPort = {
    async accountStatus(request) { requestNode = request.nodeId; return {providerId: request.provider.id, accountProfileId: request.account.id, nodeId: request.nodeId, authenticated: true, codexVersion: 'codex-cli 0.152.1', executableSha256: 'b'.repeat(64), discoveredAt: '2026-09-03T10:00:00.000Z'}; },
    async execReadOnlyStructured() { throw new Error('not_used'); },
  };
  try {
    const result = await qualifyAccountProfile({registry, providerId: 'codex', accountProfileId: 'account-a', nodeExecution});
    assert.equal(requestNode, 'windows-node');
    assert.equal(result.record.nodeId, 'windows-node');
    const persisted = fs.readFileSync(stateFile, 'utf8');
    assert.match(persisted, /codex-cli 0\.152\.1/);
    assert.match(persisted, new RegExp('b{64}'));
    assert.equal(persisted.includes('/controller/'), false);
    assert.equal(persisted.includes('CODEX_HOME_ACCOUNT_A'), false);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

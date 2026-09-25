import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const syntheticCredential = () => ['nvapi', 'fixture', 'C'.repeat(24), '2468'].join('-');

test('public credential command uses the generic secure-store path without argv, output or configuration leakage', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-provider-command-')), configFile = path.join(root, 'config.json'), credential = syntheticCredential();
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.writeFileSync(configFile, JSON.stringify({
    schemaVersion: 1,
    resources: [],
    providers: [{
      id: 'nvidia-hosted',
      kind: 'openai-compatible',
      adapter: 'nvidia-hosted-v1',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      wireApi: 'chat-completions',
      auth: {type: 'provider-secure-store', reference: 'provider:nvidia-hosted'},
      requiresAuth: true,
    }],
    models: [],
    modelRouting: {roles: {}},
    services: [],
    lanes: [],
  }), {mode: 0o600});
  const environment = {...process.env, AGENT_CONTROL_CONFIG: configFile, AGENT_CONTROL_STATE_DIR: root};
  const invoke = (operation: string, input?: string) => spawnSync(process.execPath, ['scripts/agent-control.mjs', 'providers', 'credential', operation, 'nvidia-hosted'], {cwd: process.cwd(), env: environment, input, encoding: 'utf8'});
  const configured = invoke('set', `${credential}\n`);
  assert.equal(configured.status, 0, configured.stderr);
  assert.equal(configured.stdout.includes(credential), false);
  assert.equal(configured.stderr.includes(credential), false);
  assert.match(configured.stdout, /"fingerprint":"nvapi-…2468"/);
  assert.equal(fs.readFileSync(configFile, 'utf8').includes(credential), false);

  const status = invoke('status');
  assert.equal(status.status, 0, status.stderr);
  assert.equal(status.stdout.includes(credential), false);
  assert.match(status.stdout, /"status":"CONFIGURED"/);
  assert.doesNotMatch(status.stdout, /fingerprint/);

  const storeDirectory = path.join(root, 'credentials', 'providers'), [storedFile] = fs.readdirSync(storeDirectory);
  assert.equal(fs.statSync(storeDirectory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(storeDirectory, storedFile)).mode & 0o777, 0o600);
  assert.equal(fs.readFileSync(path.join(storeDirectory, storedFile), 'utf8'), credential);

  const revoked = invoke('revoke');
  assert.equal(revoked.status, 0, revoked.stderr);
  assert.match(revoked.stdout, /"status":"MISSING"/);
  assert.equal(fs.readdirSync(storeDirectory).length, 0);
});

test('the same credential command manages an isolated controller account reference without provider fallback', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-provider-account-command-')), configFile = path.join(root, 'config.json'), providerCredential = syntheticCredential(), accountCredential = ['nvapi', 'fixture', 'D'.repeat(24), '1357'].join('-');
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.writeFileSync(configFile, JSON.stringify({
    schemaVersion: 1,
    resources: [{id: 'controller', platform: 'linux', transport: {type: 'local'}, capabilities: [], controller: true}],
    providers: [{
      id: 'nvidia-hosted', kind: 'openai-compatible', adapter: 'nvidia-hosted-v1', baseUrl: 'https://integrate.api.nvidia.com/v1', wireApi: 'chat-completions',
      auth: {type: 'provider-secure-store', reference: 'provider:nvidia-hosted'}, requiresAuth: true,
      accountProfiles: [{id: 'team-a', label: 'Team A', providerExecutionNodeId: 'controller', credentialResidency: {nodeId: 'controller', store: {type: 'provider-secure-store', reference: 'provider:nvidia-hosted:team-a'}}, qualification: {state: 'UNTESTED'}}],
    }],
    models: [], modelRouting: {roles: {}}, services: [], lanes: [],
  }), {mode: 0o600});
  const environment = {...process.env, AGENT_CONTROL_CONFIG: configFile, AGENT_CONTROL_STATE_DIR: root};
  const invoke = (operation: string, input?: string, account = false) => spawnSync(process.execPath, ['scripts/agent-control.mjs', 'providers', 'credential', operation, 'nvidia-hosted', ...(account ? ['--account', 'team-a'] : [])], {cwd: process.cwd(), env: environment, input, encoding: 'utf8'});

  assert.equal(invoke('set', `${providerCredential}\n`).status, 0);
  const accountSet = invoke('set', `${accountCredential}\n`, true);
  assert.equal(accountSet.status, 0, accountSet.stderr);
  assert.equal(accountSet.stdout.includes(accountCredential), false);
  assert.match(accountSet.stdout, /"accountProfileId":"team-a"/);
  assert.match(accountSet.stdout, /"fingerprint":"nvapi-…1357"/);
  const status = invoke('status', undefined, true);
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /"status":"CONFIGURED"/);

  const revoked = invoke('revoke', undefined, true);
  assert.equal(revoked.status, 0, revoked.stderr);
  assert.match(revoked.stdout, /"accountProfileId":"team-a"/);
  assert.equal(invoke('status', undefined, true).status, 2);
  assert.equal(invoke('status').status, 0);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {emptyConfig, initializeConfig, loadConfig} from './config.mjs';
import {main} from './init-config.mjs';

const state = () => fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-init-'));

test('initializer creates only a schema-valid empty configuration', () => {
  const root = state(), environment = {...process.env, AGENT_CONTROL_STATE_DIR: root};
  const initialized = initializeConfig({environment, cwd: root});
  assert.equal(initialized.result, 'CREATED');
  assert.equal(initialized.created, true);
  assert.deepEqual(loadConfig({environment, cwd: root}).config, emptyConfig());
  assert.deepEqual(fs.readdirSync(root), ['config.json']);
});

test('initializer is idempotent for an existing empty configuration', () => {
  const root = state(), environment = {...process.env, AGENT_CONTROL_STATE_DIR: root};
  const first = initializeConfig({environment, cwd: root});
  const before = fs.readFileSync(first.file);
  const second = initializeConfig({environment, cwd: root});
  assert.equal(second.result, 'UNCHANGED_EMPTY');
  assert.equal(second.created, false);
  assert.deepEqual(fs.readFileSync(first.file), before);
});

test('initializer preserves exclusive creation when the filesystem denies hard links', () => {
  const root = state(), environment = {...process.env, AGENT_CONTROL_STATE_DIR: root};
  const fileSystem = Object.create(fs);
  fileSystem.linkSync = () => { const error = new Error('hard links unavailable'); error.code = 'EACCES'; throw error; };
  const initialized = initializeConfig({environment, cwd: root, fileSystem});
  assert.equal(initialized.result, 'CREATED');
  assert.equal(initialized.created, true);
  assert.deepEqual(loadConfig({environment, cwd: root}).config, emptyConfig());
  assert.equal(fs.statSync(initialized.file).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(root), ['config.json']);
});

test('exclusive-copy fallback never overwrites a configuration won by another initializer', () => {
  const root = state(), environment = {...process.env, AGENT_CONTROL_STATE_DIR: root};
  const configured = {...emptyConfig(), lanes: [{id: 11, name: 'Concurrent operator', cwd: '.', priority: 1, mode: 'manual'}]};
  const fileSystem = Object.create(fs);
  fileSystem.linkSync = () => { const error = new Error('hard links unavailable'); error.code = 'EACCES'; throw error; };
  fileSystem.copyFileSync = (source, destination, flags) => {
    fs.writeFileSync(destination, `${JSON.stringify(configured, null, 2)}\n`, {mode: 0o600});
    fs.copyFileSync(source, destination, flags);
  };
  const initialized = initializeConfig({environment, cwd: root, fileSystem});
  assert.equal(initialized.result, 'PRESERVED_EXISTING');
  assert.equal(initialized.created, false);
  assert.deepEqual(loadConfig({environment, cwd: root}).config, configured);
  assert.deepEqual(fs.readdirSync(root), ['config.json']);
});

test('initializer refuses to overwrite configured operator state', () => {
  const root = state(), file = path.join(root, 'config.json');
  const configured = {...emptyConfig(), lanes: [{id: 7, name: 'Operator', cwd: '.', priority: 1, mode: 'manual'}]};
  fs.writeFileSync(file, `${JSON.stringify(configured, null, 2)}\n`);
  const before = fs.readFileSync(file);
  const result = initializeConfig({environment: {...process.env, AGENT_CONTROL_STATE_DIR: root}, cwd: root});
  assert.equal(result.result, 'PRESERVED_EXISTING');
  assert.equal(result.created, false);
  assert.deepEqual(fs.readFileSync(file), before);
});

test('initializer preserves supported v4.1 token limits while credential-shaped keys remain forbidden', () => {
  const root = state(), file = path.join(root, 'config.json');
  const configured = JSON.parse(fs.readFileSync(path.resolve('src/control/fixtures/v4.1-existing-configuration.json'), 'utf8'));
  fs.writeFileSync(file, `${JSON.stringify(configured, null, 2)}\n`, {mode: 0o600});
  const before = fs.readFileSync(file);
  const result = initializeConfig({environment: {...process.env, AGENT_CONTROL_CONFIG: file}, cwd: root});
  assert.equal(result.result, 'PRESERVED_EXISTING');
  assert.equal(result.created, false);
  assert.equal(result.config.models[0].limits.outputTokens, 1_024);
  assert.deepEqual(fs.readFileSync(file), before);

  const unsafeRoot = state(), unsafeFile = path.join(unsafeRoot, 'config.json');
  fs.writeFileSync(unsafeFile, `${JSON.stringify({...emptyConfig(), accessToken: 'synthetic-forbidden-value'}, null, 2)}\n`, {mode: 0o600});
  assert.throws(() => initializeConfig({environment: {...process.env, AGENT_CONTROL_CONFIG: unsafeFile}, cwd: unsafeRoot}), /secret_material_forbidden:config.accessToken/);
});

test('initializer fails closed when existing configuration is invalid', () => {
  const root = state(), file = path.join(root, 'config.json');
  fs.writeFileSync(file, '{"schemaVersion":99}\n');
  assert.throws(() => initializeConfig({environment: {...process.env, AGENT_CONTROL_STATE_DIR: root}, cwd: root}), /unsupported_config_schema/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{"schemaVersion":99}\n');
});

test('initializer CLI does not echo existing operator configuration', () => {
  const root = state(), file = path.join(root, 'config.json');
  const configured = {...emptyConfig(), lanes: [{id: 9, name: 'Private operator lane', cwd: '.', priority: 2, mode: 'manual'}]};
  fs.writeFileSync(file, `${JSON.stringify(configured, null, 2)}\n`);
  const lines = [];
  assert.equal(main({environment: {...process.env, AGENT_CONTROL_STATE_DIR: root}, cwd: root, output: line => lines.push(line)}), 0);
  const output = lines.join('\n');
  assert.match(output, /PRESERVED_EXISTING/);
  assert.doesNotMatch(output, /Private operator lane/);
  assert.doesNotMatch(output, /"config"/);
});

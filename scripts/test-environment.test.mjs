import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

test('published test command isolates default Agent Control state', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assert.match(packageJson.scripts.test, /--import \.\/scripts\/test-environment\.mjs/);
  const environment = {...process.env};
  delete environment.AGENT_CONTROL_STATE_DIR;
  delete environment.AGENT_CONTROL_TELEMETRY_DIR;
  const child = spawnSync(process.execPath, [
    '--import',
    path.join(repositoryRoot, 'scripts/test-environment.mjs'),
    '--eval',
    "import fs from 'node:fs'; fs.mkdirSync(process.env.AGENT_CONTROL_STATE_DIR, {recursive: true}); fs.mkdirSync(process.env.AGENT_CONTROL_TELEMETRY_DIR, {recursive: true}); fs.writeFileSync(process.env.AGENT_CONTROL_STATE_DIR + '/proof', 'isolated'); fs.writeFileSync(process.env.AGENT_CONTROL_TELEMETRY_DIR + '/proof', 'isolated'); process.stdout.write(JSON.stringify({state: process.env.AGENT_CONTROL_STATE_DIR, telemetry: process.env.AGENT_CONTROL_TELEMETRY_DIR}));",
  ], {cwd: repositoryRoot, env: environment, encoding: 'utf8'});
  assert.equal(child.status, 0, child.stderr);
  const isolated = JSON.parse(child.stdout.trim());
  assert.notEqual(isolated.state, path.join(repositoryRoot, '.agent-control'));
  assert.notEqual(isolated.telemetry, path.join(repositoryRoot, '.agent-control', 'telemetry'));
  assert.equal(fs.existsSync(path.dirname(isolated.state)), false);
});

test('explicit test state remains operator-selected and is not removed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-explicit-test-'));
  try {
    const child = spawnSync(process.execPath, [
      '--import',
      path.join(repositoryRoot, 'scripts/test-environment.mjs'),
      '--eval',
      "import fs from 'node:fs'; fs.writeFileSync(process.env.AGENT_CONTROL_STATE_DIR + '/proof', 'explicit');",
    ], {cwd: repositoryRoot, env: {...process.env, AGENT_CONTROL_STATE_DIR: root}, encoding: 'utf8'});
    assert.equal(child.status, 0, child.stderr);
    assert.equal(fs.readFileSync(path.join(root, 'proof'), 'utf8'), 'explicit');
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

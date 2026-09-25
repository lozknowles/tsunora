import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const bootstrap = path.join(repositoryRoot, 'scripts/bootstrap-agent-control.sh');

test('published Linux bootstrap is executable and retains the no-build path', () => {
  assert.notEqual(fs.statSync(bootstrap).mode & 0o111, 0);
  const source = fs.readFileSync(bootstrap, 'utf8');
  assert.doesNotMatch(source, /run build/);
  assert.match(source, /ci --ignore-scripts --no-audit --no-fund/);
});

test('published Android guide provides fresh Termux prerequisites before clone', () => {
  const androidGuide = fs.readFileSync(path.join(repositoryRoot, 'android/README.md'), 'utf8');
  const readme = fs.readFileSync(path.join(repositoryRoot, 'README.md'), 'utf8');
  const deployment = fs.readFileSync(path.join(repositoryRoot, 'docs/DEPLOYMENT.md'), 'utf8');

  assert.match(androidGuide, /pkg install git nodejs-lts npm/);
  assert.match(androidGuide, /Node\.js version must be 24\.x/);
  assert.match(androidGuide, /\.\.\/README\.md#install/);
  assert.match(readme, /android\/README\.md#fresh-termux-prerequisites/);
  assert.match(deployment, /Android guide\]\(\.\.\/android\/README\.md#fresh-termux-prerequisites\)/);
});

for (const locked of [false,true]) test(`published Linux bootstrap initializes and preserves configuration with locked=${locked}`, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-bootstrap-'));
  try {
    fs.mkdirSync(path.join(root, 'assets/dashboard'), {recursive: true});
    fs.mkdirSync(path.join(root, 'scripts'), {recursive: true});
    fs.copyFileSync(bootstrap, path.join(root, 'scripts/bootstrap-agent-control.sh'));
    fs.chmodSync(path.join(root, 'scripts/bootstrap-agent-control.sh'), 0o755);
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n.agent-control/\n');
    fs.writeFileSync(path.join(root, 'assets/dashboard/index.html'), '<!doctype html>');
    fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({
      name: 'agent-control-bootstrap-fixture',
      version: '1.0.0',
      private: true,
      scripts: {init: 'node scripts/init.mjs'},
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(root, 'scripts/init.mjs'), [
      "import fs from 'node:fs';",
      "fs.mkdirSync('.agent-control', {recursive: true});",
      "const target = '.agent-control/config.json';",
      "if (!fs.existsSync(target)) fs.writeFileSync(target, '{}\\n');",
    ].join('\n'));
    if(locked)execFileSync('npm',['install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund'],{cwd:root});
    execFileSync('git', ['-C', root, 'init']);
    execFileSync('git', ['-C', root, 'config', 'user.email', 'fixture@example.invalid']);
    execFileSync('git', ['-C', root, 'config', 'user.name', 'Fixture']);
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, 'commit', '-m', 'fixture']);

    const checked = JSON.parse(execFileSync(path.join(root, 'scripts/bootstrap-agent-control.sh'), [
      '--check',
      '--target',
      root,
    ], {encoding: 'utf8'}));
    assert.equal(checked.repository, 'verified');
    assert.equal(checked.dependencies, 'unchecked');
    assert.equal(checked.configuration, 'unchecked');
    assert.equal(checked.dashboard, 'available');

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const output = execFileSync(path.join(root, 'scripts/bootstrap-agent-control.sh'), [
        '--install',
        '--role',
        'control',
        '--target',
        root,
      ], {encoding: 'utf8'});
      const result = JSON.parse(output.slice(output.lastIndexOf('{')));
      assert.equal(result.dependencies, locked?'installed-locked':'installed-no-lock');
      assert.equal(result.configuration, 'initialized-or-preserved');
      assert.equal(result.dashboard, 'available');
      assert.equal(fs.existsSync(path.join(root, 'package-lock.json')), locked);
      assert.equal(fs.readFileSync(path.join(root, '.agent-control/config.json'), 'utf8'), '{}\n');
      assert.equal(execFileSync('git', ['-C', root, 'status', '--porcelain'], {encoding: 'utf8'}), '');
    }
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('Windows bootstrap mirrors no-lock install and initialization without a build assumption', () => {
  const source = fs.readFileSync(path.join(repositoryRoot, 'scripts/bootstrap-agent-control.ps1'), 'utf8');
  assert.match(source, /install --ignore-scripts --no-package-lock/);
  assert.match(source, /run init/);
  assert.doesNotMatch(source, /run build/);
  assert.match(source, /ci --ignore-scripts --no-audit --no-fund/);
});

test('bootstrap fails closed before install when the dashboard product surface is absent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-bootstrap-missing-dashboard-'));
  try {
    fs.mkdirSync(path.join(root, 'scripts'), {recursive: true});
    fs.copyFileSync(bootstrap, path.join(root, 'scripts/bootstrap-agent-control.sh'));
    fs.chmodSync(path.join(root, 'scripts/bootstrap-agent-control.sh'), 0o755);
    fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({name: 'incomplete-fixture', private: true})}\n`);
    execFileSync('git', ['-C', root, 'init']);
    execFileSync('git', ['-C', root, 'config', 'user.email', 'fixture@example.invalid']);
    execFileSync('git', ['-C', root, 'config', 'user.name', 'Fixture']);
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, 'commit', '-m', 'fixture']);
    assert.throws(() => execFileSync(path.join(root, 'scripts/bootstrap-agent-control.sh'), [
      '--install',
      '--target',
      root,
    ], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}), error => {
      assert.match(error.stderr, /dashboard_missing_no_changes_made/);
      return true;
    });
    assert.equal(fs.existsSync(path.join(root, 'node_modules')), false);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('published first-run walkthrough establishes operator authentication before discovery', () => {
  assert.match(fs.readFileSync(path.join(repositoryRoot, 'README.md'), 'utf8'), /docs\/installation-first-run\.md/);
  const readme = fs.readFileSync(path.join(repositoryRoot, 'docs/installation-first-run.md'), 'utf8');
  const runSection = readme.slice(readme.indexOf('## Start'), readme.indexOf('## Understand usage and efficiency'));
  const hiddenPrompt = runSection.indexOf('read -rsp');
  const exportToken = runSection.indexOf('export AGENT_CONTROL_WEB_OPERATOR_TOKEN');
  const startWeb = runSection.indexOf('npm run web');
  const authenticate = runSection.indexOf('Authenticate to start discovery');
  const discovery = runSection.indexOf('## Discover your environment');
  const firstJob = runSection.indexOf('Start operator-system-observation@1.1.0');
  const approvalDisclosure = runSection.indexOf('Jobs, schedules, approvals & evidence');
  const approval = runSection.indexOf('Approve this job');
  const processMap = runSection.indexOf('Open its job detail and **Process Map**');
  assert.ok(hiddenPrompt >= 0);
  assert.ok(hiddenPrompt < exportToken && exportToken < startWeb);
  assert.ok(startWeb < authenticate && authenticate < discovery);
  assert.ok(discovery < firstJob && firstJob < approvalDisclosure && approvalDisclosure < approval && approval < processMap);
  for (const file of ['docs/DEPLOYMENT.md', 'docs/environment-discovery.md']) {
    const guide = fs.readFileSync(path.join(repositoryRoot, file), 'utf8');
    assert.match(guide, /AGENT_CONTROL_WEB_OPERATOR_TOKEN/);
    assert.match(guide, /Operator authenticated|Authenticate the browser/);
  }
  for (const file of ['docs/DEPLOYMENT.md', 'docs/poe-dashboard-operator.md']) {
    const guide = fs.readFileSync(path.join(repositoryRoot, file), 'utf8');
    assert.match(guide, /Start operator-system-observation@1\.1\.0/);
    assert.match(guide, /Jobs, schedules, approvals & evidence/);
    assert.match(guide, /Approve this job/);
    assert.match(guide, /observe → verify/);
  }
});

test('release documentation permanently gates both virgin installation and supported configuration upgrade', () => {
  const deployment = fs.readFileSync(path.join(repositoryRoot, 'docs/DEPLOYMENT.md'), 'utf8');
  const qualification = fs.readFileSync(path.join(repositoryRoot, 'docs/qualification.md'), 'utf8');
  for (const guide of [deployment, qualification]) {
    assert.match(guide, /Virgin install/i);
    assert.match(guide, /Supported upgrade|Supported existing-configuration upgrade/i);
    assert.match(guide, /operator-system-observation@1\.1\.0/);
  }
  assert.match(deployment, /v4\.1/);
  assert.match(qualification, /src\/control\/fixtures\/v4\.1-existing-configuration\.json/);
});

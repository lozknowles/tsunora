import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Job qualification loads the complete current catalog through production bootstrap', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-qualify-jobs-test-'));
  try {
    const outputFile = path.join(temporary, 'qualification.json');
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/qualify-jobs.ts', outputFile], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
      env: {...process.env, AGENT_CONTROL_STATE_DIR: path.join(temporary, 'state')},
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const evidence = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    assert.equal(evidence.verdict, 'PASS_SAFE_NON_PRODUCTION');
    assert.equal(evidence.safety.externalNetworkUsed, false);
    assert.equal(evidence.authorityProof.unchanged, true);
  } finally {
    fs.rmSync(temporary, {recursive: true, force: true});
  }
});

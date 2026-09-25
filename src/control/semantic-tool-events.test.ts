import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {ResearchForensicResponseVault, SemanticEventLedger} from './semantic-tool-events.js';

test('semantic ledger retains only bounded identifiers and classifications', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-events-'));
  try {
    const file = path.join(directory, 'events.jsonl'), ledger = new SemanticEventLedger(file);
    ledger.record({type:'TOOL_PARSE_FAILED',runId:'run-1',modelCallId:'run-1:1',toolId:null,responseSha256:'a'.repeat(64),reasonCode:'INVALID_JSON',outcome:'FAIL'});
    assert.throws(() => ledger.record({type:'TOOL_PARSE_FAILED',runId:'secret value',modelCallId:null,toolId:null,responseSha256:null,reasonCode:null,outcome:null}), /run_id_invalid/);
    ledger.close();
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(record.type, 'TOOL_PARSE_FAILED');
    assert.equal(record.responseSha256, 'a'.repeat(64));
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

test('forensic response needs explicit fixture grant, redacts credentials and retains both hashes', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'forensic-responses-'));
  try {
    assert.throws(() => new ResearchForensicResponseVault(path.join(directory,'blocked'),'2026-10-22T00:00:00Z',undefined), /permission_required/);
    const vault = new ResearchForensicResponseVault(path.join(directory,'allowed'),'2026-10-22T00:00:00Z','ISOLATED_SYNTHETIC_FIXTURE');
    vault.record('run-1:1','{"token":"sk-testSecret1234567890123456"}');
    const file = path.join(directory,'allowed',fs.readdirSync(path.join(directory,'allowed'))[0]);
    const record = JSON.parse(fs.readFileSync(file,'utf8'));
    assert.equal(record.sanitizationChanged,true);
    assert.doesNotMatch(JSON.stringify(record),/sk-testSecret/);
    assert.match(record.rawSha256,/^[a-f0-9]{64}$/);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

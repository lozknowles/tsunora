import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {checkLimitationsCarryForward} from './check-limitations-carry-forward.mjs';

const ledger=path.resolve('evidence/limitations/agent-control-limitations.json');
test('unchanged inherited limitations satisfy accounting integrity',async()=>{const result=await checkLimitationsCarryForward(ledger,ledger);assert.deepEqual(result.errors,[]);});
test('silent deletion fails the release gate while accepted and external items remain allowed',async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'ac-limitations-')),current=JSON.parse(fs.readFileSync(ledger,'utf8'));const accepted=current.records.find(record=>record.currentStatus==='ACCEPTED_LIMITATION'),external=current.records.find(record=>record.currentStatus==='EXTERNAL_BLOCKER');assert.ok(accepted&&external);current.records=current.records.filter(record=>record.id!==accepted.id);const target=path.join(root,'current.json');fs.writeFileSync(target,JSON.stringify(current));const result=await checkLimitationsCarryForward(ledger,target);assert.match(result.errors.join('\n'),new RegExp(`${accepted.id}: silently disappeared`));assert.doesNotMatch(result.errors.join('\n'),new RegExp(`${external.id}:`));});
test('closure without qualifying evidence fails closed',async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'ac-limitations-')),current=JSON.parse(fs.readFileSync(ledger,'utf8')),record=current.records.find(item=>item.qualification.physical==='NOT_QUALIFIED'&&item.currentStatus==='OPEN');record.currentStatus='RESOLVED';record.resolutionRelease='v4.11.0';record.resolutionEvidence=['automated:test'];const target=path.join(root,'current.json');fs.writeFileSync(target,JSON.stringify(current));const result=await checkLimitationsCarryForward(ledger,target);assert.ok(result.errors.some(item=>item.includes('physical limitation closed without physical evidence')));});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {coreChecks} from './release-readiness.js';
import {verifyReleaseEvidence} from './release-evidence.js';

const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
function fixture(options:{tamper?:boolean;boundedRecovery?:boolean;approvalInside?:boolean}={}){
  const parent=fs.mkdtempSync(path.join(os.tmpdir(),'ac-release-evidence-')),root=path.join(parent,'candidate'),trusted=path.join(parent,'trusted');fs.mkdirSync(root);fs.mkdirSync(trusted,{mode:0o700});
  const current={version:'4.6.1',sourceCommit:'a'.repeat(40),sourceDigest:'b'.repeat(64)},checks:Record<string,unknown>={},packageFile=path.join(parent,'agent-control-4.6.1.tgz');fs.writeFileSync(packageFile,'release package');
  for(const check of coreChecks){
    const relative=`evidence/${check}.json`,file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});
    const evidence:any={schema:'agent-control.release-check-evidence/v1',check,...current,status:'PASS',scope:'FULL_REQUIRED',command:check==='regression'?'npm run check':`npm run verify:${check}`};
    if(check==='regression')evidence.regressionAttempts=options.boundedRecovery?[{id:'full-failed',scope:'FULL_REQUIRED',status:'FAIL',command:'npm run check',tests:100,passed:99,failed:1,skipped:0,logSha256:'c'.repeat(64)},{id:'small-pass',scope:'BOUNDED',status:'PASS',command:'npm run check',tests:3,passed:3,failed:0,skipped:0,logSha256:'d'.repeat(64)}]:[{id:'full-pass',scope:'FULL_REQUIRED',status:'PASS',command:'npm run check',tests:100,passed:100,failed:0,skipped:0,logSha256:'c'.repeat(64)}];
    const bytes=Buffer.from(`${JSON.stringify(evidence,null,2)}\n`);fs.writeFileSync(file,bytes,{mode:0o600});checks[check]={status:'PASS',scope:'FULL_REQUIRED',command:evidence.command,evidence:[{path:relative,sha256:sha(bytes)}]};
  }
  const packageBytes=fs.readFileSync(packageFile),receipt={schema:'agent-control.core-release-receipt/v2',...current,generatedAt:'2026-09-13T00:00:00Z',execution:{platform:process.platform,arch:process.arch,nodeVersion:process.version},package:{fileName:path.basename(packageFile),sha256:sha(packageBytes),sizeBytes:packageBytes.length},checks},receiptFile='core-receipt.json',receiptPath=path.join(root,receiptFile),receiptBytes=Buffer.from(`${JSON.stringify(receipt,null,2)}\n`);fs.writeFileSync(receiptPath,receiptBytes,{mode:0o600});
  if(options.tamper)fs.appendFileSync(path.join(root,'evidence/regression.json'),'tampered');
  const approval={schema:'agent-control.release-operator-approval/v1',...current,receiptSha256:sha(receiptBytes),packageSha256:receipt.package.sha256,requiredChecks:[...coreChecks],actorId:'operator:test',approvedAt:'2026-09-13T00:01:00Z',scope:'RELEASE_CANDIDATE_PUBLICATION'},approvalFile=options.approvalInside?path.join(root,'approval.json'):path.join(trusted,'approval.json');fs.writeFileSync(approvalFile,`${JSON.stringify(approval,null,2)}\n`,{mode:0o600});
  return {parent,root,receiptFile,approvalFile,packageFile,current};
}
test('content-addressed candidate evidence and external operator approval pass together',t=>{const f=fixture();t.after(()=>fs.rmSync(f.parent,{recursive:true,force:true}));const result=verifyReleaseEvidence(f);assert.deepEqual(result.blockers,[]);assert.equal(result.trust,'EXTERNAL_OPERATOR_APPROVAL');});
test('tampered evidence is rejected even when the receipt still says PASS',t=>{const f=fixture({tamper:true});t.after(()=>fs.rmSync(f.parent,{recursive:true,force:true}));assert.ok(verifyReleaseEvidence(f).blockers.some(x=>x.startsWith('EVIDENCE_DIGEST_MISMATCH')));});
test('a bounded rerun cannot supersede a failed full required suite',t=>{const f=fixture({boundedRecovery:true});t.after(()=>fs.rmSync(f.parent,{recursive:true,force:true}));const blockers=verifyReleaseEvidence(f).blockers;assert.ok(blockers.includes('REGRESSION_FULL_REQUIRED_PASS_MISSING'));});
test('approval must be an external protected trust anchor',t=>{const f=fixture({approvalInside:true});t.after(()=>fs.rmSync(f.parent,{recursive:true,force:true}));assert.ok(verifyReleaseEvidence(f).blockers.includes('TRUSTED_OPERATOR_APPROVAL_MUST_BE_EXTERNAL'));});
test('missing approval blocks publication without invalidating preserved evidence',t=>{const f=fixture();t.after(()=>fs.rmSync(f.parent,{recursive:true,force:true}));assert.ok(verifyReleaseEvidence({...f,approvalFile:undefined}).blockers.includes('TRUSTED_OPERATOR_APPROVAL_REQUIRED'));});

test('the exact release package is content-addressed',t=>{const f=fixture();t.after(()=>fs.rmSync(f.parent,{recursive:true,force:true}));fs.appendFileSync(f.packageFile,'tampered');assert.ok(verifyReleaseEvidence(f).blockers.includes('RELEASE_PACKAGE_MISMATCH'));});

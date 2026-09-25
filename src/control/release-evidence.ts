import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {coreChecks, type CoreReceipt} from './release-readiness.js';

const sha256Pattern = /^[a-f0-9]{64}$/;
const commitPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

export interface ReleaseEvidenceReference {path:string;sha256:string}
export interface ReleaseEvidenceCheck {status:'PASS'|'FAIL'|'NOT_RUN';scope:'FULL_REQUIRED'|'BOUNDED';command:string;evidence:ReleaseEvidenceReference[]}
export interface TrustedCoreReceipt {schema:'agent-control.core-release-receipt/v2';version:string;sourceCommit:string;sourceDigest:string;generatedAt:string;execution:{platform:string;arch:string;nodeVersion:string};package:{fileName:string;sha256:string;sizeBytes:number};checks:Partial<Record<typeof coreChecks[number],ReleaseEvidenceCheck>>}

function digest(value:string|Buffer){return createHash('sha256').update(value).digest('hex');}
function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function inside(root:string,candidate:string){const relative=path.relative(root,candidate);return relative===''||(!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative));}
function readJson(file:string):unknown{return JSON.parse(fs.readFileSync(file,'utf8'));}

function safeCandidateFile(root:string,relative:string,blockers:string[],prefix:string){
  if(!relative||path.isAbsolute(relative)){blockers.push(`${prefix}_PATH_INVALID:${relative}`);return undefined;}
  const resolved=path.resolve(root,relative);
  if(!inside(root,resolved)||!fs.existsSync(resolved)){blockers.push(`${prefix}_MISSING:${relative}`);return undefined;}
  const stat=fs.lstatSync(resolved);
  if(!stat.isFile()||stat.isSymbolicLink()||!inside(fs.realpathSync(root),fs.realpathSync(resolved))){blockers.push(`${prefix}_UNSAFE:${relative}`);return undefined;}
  return resolved;
}

function parseReceipt(value:unknown,blockers:string[]):TrustedCoreReceipt|undefined{
  if(!object(value)||value.schema!=='agent-control.core-release-receipt/v2'){blockers.push('RECEIPT_SCHEMA_UNSUPPORTED');return undefined;}
  if(typeof value.version!=='string'||typeof value.sourceCommit!=='string'||typeof value.sourceDigest!=='string'||typeof value.generatedAt!=='string'||!object(value.execution)||typeof value.execution.platform!=='string'||typeof value.execution.arch!=='string'||typeof value.execution.nodeVersion!=='string'||!object(value.package)||typeof value.package.fileName!=='string'||typeof value.package.sha256!=='string'||!sha256Pattern.test(value.package.sha256)||!Number.isSafeInteger(value.package.sizeBytes)||Number(value.package.sizeBytes)<=0||!object(value.checks)){blockers.push('RECEIPT_SCHEMA_INVALID');return undefined;}
  if(!commitPattern.test(value.sourceCommit)||!sha256Pattern.test(value.sourceDigest)||Number.isNaN(Date.parse(value.generatedAt))){blockers.push('RECEIPT_SCHEMA_INVALID');return undefined;}
  return value as unknown as TrustedCoreReceipt;
}

function matchingEvidence(value:unknown,check:typeof coreChecks[number],current:{version:string;sourceCommit:string;sourceDigest:string},command:string,scope:string){
  if(!object(value))return false;
  return value.schema==='agent-control.release-check-evidence/v1'&&value.check===check&&value.version===current.version&&value.sourceCommit===current.sourceCommit&&value.sourceDigest===current.sourceDigest&&value.status==='PASS'&&value.scope===scope&&value.command===command;
}

function verifyRegression(value:unknown,blockers:string[]){
  if(!object(value)||!Array.isArray(value.regressionAttempts)){blockers.push('REGRESSION_ATTEMPT_HISTORY_MISSING');return;}
  const attempts=value.regressionAttempts.filter(object) as Array<Record<string,unknown>>;
  const passes=attempts.filter(item=>item.scope==='FULL_REQUIRED'&&item.status==='PASS'&&item.command==='npm run check'&&Number.isSafeInteger(item.tests)&&Number(item.tests)>0&&item.passed===item.tests&&item.failed===0&&item.skipped===0&&typeof item.logSha256==='string'&&sha256Pattern.test(item.logSha256));
  if(!passes.length){blockers.push('REGRESSION_FULL_REQUIRED_PASS_MISSING');return;}
  for(let index=0;index<attempts.length;index++){
    const failed=attempts[index]!;
    if(failed.scope!=='FULL_REQUIRED'||failed.status!=='FAIL')continue;
    const superseded=attempts.slice(index+1).some(item=>item.scope==='FULL_REQUIRED'&&item.status==='PASS'&&item.command===failed.command&&Number(item.tests)>=Number(failed.tests)&&item.failed===0&&item.passed===item.tests&&item.skipped===0);
    if(!superseded)blockers.push(`REGRESSION_REQUIRED_SUITE_UNRESOLVED:${String(failed.id??index)}`);
  }
}

function verifyPackage(file:string|undefined,receipt:TrustedCoreReceipt,blockers:string[]){
  if(!file){blockers.push('RELEASE_PACKAGE_REQUIRED');return;}
  const resolved=path.resolve(file);
  if(!fs.existsSync(resolved)){blockers.push('RELEASE_PACKAGE_MISSING');return;}
  const stat=fs.lstatSync(resolved);
  if(!stat.isFile()||stat.isSymbolicLink()){blockers.push('RELEASE_PACKAGE_UNSAFE');return;}
  if(path.basename(resolved)!==receipt.package.fileName||stat.size!==receipt.package.sizeBytes||digest(fs.readFileSync(resolved))!==receipt.package.sha256)blockers.push('RELEASE_PACKAGE_MISMATCH');
}

function verifyApproval(file:string|undefined,root:string,receipt:TrustedCoreReceipt,receiptBytes:Buffer,current:{version:string;sourceCommit:string;sourceDigest:string},blockers:string[]){
  if(!file){blockers.push('TRUSTED_OPERATOR_APPROVAL_REQUIRED');return;}
  const resolved=path.resolve(file);
  if(inside(fs.realpathSync(root),fs.existsSync(resolved)?fs.realpathSync(resolved):resolved)){blockers.push('TRUSTED_OPERATOR_APPROVAL_MUST_BE_EXTERNAL');return;}
  if(!fs.existsSync(resolved)){blockers.push('TRUSTED_OPERATOR_APPROVAL_MISSING');return;}
  const stat=fs.lstatSync(resolved);
  if(!stat.isFile()||stat.isSymbolicLink()){blockers.push('TRUSTED_OPERATOR_APPROVAL_UNSAFE');return;}
  if(process.platform!=='win32'&&((stat.mode&0o077)!==0||(typeof process.geteuid==='function'&&stat.uid!==process.geteuid()))){blockers.push('TRUSTED_OPERATOR_APPROVAL_PERMISSIONS_INVALID');return;}
  let value:unknown;try{value=readJson(resolved);}catch{blockers.push('TRUSTED_OPERATOR_APPROVAL_INVALID');return;}
  if(!object(value)||value.schema!=='agent-control.release-operator-approval/v1'||value.scope!=='RELEASE_CANDIDATE_PUBLICATION'||value.version!==current.version||value.sourceCommit!==current.sourceCommit||value.sourceDigest!==current.sourceDigest||value.receiptSha256!==digest(receiptBytes)||value.packageSha256!==receipt.package.sha256||typeof value.actorId!=='string'||!value.actorId.trim()||typeof value.approvedAt!=='string'||Number.isNaN(Date.parse(value.approvedAt))||!Array.isArray(value.requiredChecks)){blockers.push('TRUSTED_OPERATOR_APPROVAL_INVALID');return;}
  const requiredChecks=value.requiredChecks;
  if(coreChecks.some(check=>!requiredChecks.includes(check))){blockers.push('TRUSTED_OPERATOR_APPROVAL_INVALID');return;}
  if(receipt.version!==value.version||receipt.sourceCommit!==value.sourceCommit||receipt.sourceDigest!==value.sourceDigest)blockers.push('TRUSTED_OPERATOR_APPROVAL_RECEIPT_MISMATCH');
}

export function verifyReleaseEvidence(input:{root:string;receiptFile:string;approvalFile?:string;packageFile?:string;current:{version:string;sourceCommit:string;sourceDigest:string}}){
  const root=fs.realpathSync(input.root),blockers:string[]=[];
  const receiptPath=safeCandidateFile(root,input.receiptFile,blockers,'RECEIPT');
  if(!receiptPath)return {receipt:undefined,blockers:[...new Set(blockers)],trust:'UNVERIFIED' as const};
  const receiptBytes=fs.readFileSync(receiptPath);
  let raw:unknown;try{raw=JSON.parse(receiptBytes.toString('utf8'));}catch{blockers.push('RECEIPT_JSON_INVALID');return {receipt:undefined,blockers,trust:'UNVERIFIED' as const};}
  const receipt=parseReceipt(raw,blockers);
  if(!receipt)return {receipt:undefined,blockers:[...new Set(blockers)],trust:'UNVERIFIED' as const};
  if(receipt.version!==input.current.version)blockers.push('VERSION_MISMATCH');
  if(receipt.sourceCommit!==input.current.sourceCommit)blockers.push('SOURCE_COMMIT_MISMATCH');
  if(receipt.sourceDigest!==input.current.sourceDigest)blockers.push('SOURCE_CHANGED_SINCE_VALIDATION');
  verifyPackage(input.packageFile,receipt,blockers);
  for(const check of coreChecks){
    const item=receipt.checks[check];
    if(!item||item.status!=='PASS'||item.scope!=='FULL_REQUIRED'||!item.command||!Array.isArray(item.evidence)||!item.evidence.length){blockers.push(`CORE_CHECK:${check}`);continue;}
    let matched=false;
    for(const reference of item.evidence){
      if(!object(reference)||typeof reference.path!=='string'||typeof reference.sha256!=='string'||!sha256Pattern.test(reference.sha256)){blockers.push(`EVIDENCE_REFERENCE_INVALID:${check}`);continue;}
      const file=safeCandidateFile(root,reference.path,blockers,'EVIDENCE');if(!file)continue;
      const bytes=fs.readFileSync(file);if(digest(bytes)!==reference.sha256){blockers.push(`EVIDENCE_DIGEST_MISMATCH:${reference.path}`);continue;}
      let evidence:unknown;try{evidence=JSON.parse(bytes.toString('utf8'));}catch{blockers.push(`EVIDENCE_JSON_INVALID:${reference.path}`);continue;}
      if(!matchingEvidence(evidence,check,input.current,item.command,item.scope)){blockers.push(`EVIDENCE_CANDIDATE_MISMATCH:${reference.path}`);continue;}
      matched=true;if(check==='regression')verifyRegression(evidence,blockers);
    }
    if(!matched)blockers.push(`CORE_CHECK_EVIDENCE_UNVERIFIED:${check}`);
  }
  verifyApproval(input.approvalFile,root,receipt,receiptBytes,input.current,blockers);
  const coreReceipt:CoreReceipt={version:receipt.version,sourceDigest:receipt.sourceDigest,checks:Object.fromEntries(Object.entries(receipt.checks).map(([check,item])=>[check,{status:item!.status,evidence:item!.evidence.map(reference=>reference.path)}]))};
  return {receipt:coreReceipt,blockers:[...new Set(blockers)],trust:blockers.some(item=>item.startsWith('TRUSTED_OPERATOR_APPROVAL'))?'UNVERIFIED' as const:'EXTERNAL_OPERATOR_APPROVAL' as const,receiptSha256:digest(receiptBytes)};
}

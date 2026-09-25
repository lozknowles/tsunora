import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {assessRelease,type CoreReceipt} from '../src/control/release-readiness.js';
import {verifyReleaseEvidence} from '../src/control/release-evidence.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(file:string)=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const files=execFileSync('git',['ls-files','-z'],{cwd:root}).toString().split('\0').filter(file=>file&&!file.startsWith('docs/')&&!file.startsWith('examples/')&&!/\.md$/i.test(file));
const sourceDigest=createHash('sha256').update(JSON.stringify(files.sort().map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]))).digest('hex');
if(process.argv.includes('--source-digest')){console.log(sourceDigest);process.exit(0);}
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const finalReceipt='examples/showcase-4.6/final-release/core-receipt.json';
const receiptFile=fs.existsSync(path.join(root,finalReceipt))?finalReceipt:'examples/showcase-4.6/release-integration/core-receipt.json';
const version=read('package.json').version;
const verified=verifyReleaseEvidence({root,receiptFile:process.env.AGENT_CONTROL_RELEASE_RECEIPT_FILE??receiptFile,approvalFile:process.env.AGENT_CONTROL_RELEASE_APPROVAL_FILE,packageFile:process.env.AGENT_CONTROL_RELEASE_PACKAGE_FILE,current:{version,sourceCommit,sourceDigest}});
const receipt:CoreReceipt=verified.receipt??{version,sourceDigest:'UNVERIFIED',checks:{}};
const invalid:string[]=[];
const classification=read('examples/showcase-4.6/known-limitations.json');
for(const item of classification.items)for(const file of item.evidence){const resolved=path.resolve(root,file);if(!resolved.startsWith(root+path.sep)||!fs.existsSync(resolved))invalid.push(file);}
const showcase=read('examples/showcase-4.6/release-integration/scope.json');
const report=assessRelease(classification,receipt,{version,sourceDigest},showcase.showcase);
report.releaseBlockers.push(...verified.blockers,...invalid.map(file=>'EVIDENCE_MISSING:'+file));
report.releaseBlockers=[...new Set(report.releaseBlockers)];
if(report.releaseBlockers.length)report.coreRelease='FAIL';
console.log(JSON.stringify({schema:'agent-control.release-rc/v2',version,sourceCommit,sourceDigest,receiptSha256:verified.receiptSha256??null,evidenceTrust:verified.trust,...report,subsystems:showcase.subsystems},null,2));
if(report.coreRelease!=='PASS')process.exitCode=1;

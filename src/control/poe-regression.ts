import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {assertNoSensitiveMaterial} from './security-redaction.js';

/** Read-only projection of an owner-started test runner, never a Job or execution tool. */
export function readPoeRegression(file?:string) {
  if(!file)return {state:'UNAVAILABLE',reason:'No qualification test runner is configured.'};
  try {
    if(fs.statSync(file).size>65536)throw new Error('oversized');
    const raw=fs.readFileSync(file,'utf8'),value=JSON.parse(raw);
    if(value.schema!=='agent-control.poe-regression/v1'||!['RUNNING','PASSED','FAILED'].includes(value.state)||!/^[a-f0-9]{40,64}$/.test(value.commit)||!Number.isFinite(Date.parse(value.updatedAt)))throw new Error('invalid');
    const count=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=1000000?n:null;
    if(value.state==='PASSED'&&(value.exitCode!==0||value.failed!==0||count(value.total)===null||value.passed+value.skipped!==value.total))throw new Error('unreconciled');
    const projection={schema:value.schema,runId:String(value.runId).slice(0,120),state:value.state,phase:String(value.phase).slice(0,100),commit:value.commit,passed:count(value.passed),failed:count(value.failed),skipped:count(value.skipped),total:count(value.total),remaining:count(value.remaining),elapsedMs:typeof value.elapsedMs==='number'&&Number.isSafeInteger(value.elapsedMs)&&value.elapsedMs>=0?value.elapsedMs:null,startedAt:value.startedAt,updatedAt:value.updatedAt,endedAt:value.endedAt??null,exitCode:value.exitCode??null,stale:value.state==='RUNNING'&&Date.now()-Date.parse(value.updatedAt)>30000,authority:'EXTERNAL_TEST_RUNNER',workParcel:false,sourceSha256:createHash('sha256').update(raw).digest('hex')};
    assertNoSensitiveMaterial(JSON.stringify(projection),'poe_regression_sensitive_material');return projection;
  }catch{return {state:'UNAVAILABLE',reason:'Test-runner evidence is absent, invalid or excluded. No result is inferred.'};}
}

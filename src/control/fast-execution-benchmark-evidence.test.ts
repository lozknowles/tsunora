import assert from 'node:assert/strict';
import test from 'node:test';
import {fastExecutionFailure} from './fast-execution-benchmark-evidence.js';

test('benchmark failures distinguish authentication provider timeout runtime model scope and verifier causes',()=>{
  const value=(status:'SUCCEEDED'|'FAILED'|'ESCALATE',summary:string,scopePassed=true,verificationPassed=false)=>fastExecutionFailure({status,summary,scopePassed,verificationPassed});
  assert.equal(value('FAILED','provider authentication failed').classification,'AUTHENTICATION');
  assert.equal(value('FAILED','provider returned 429').classification,'PROVIDER');
  assert.equal(value('FAILED','execution timed out').classification,'TIMEOUT');
  assert.equal(value('FAILED','runtime executable not found').classification,'UNSUPPORTED_RUNTIME');
  assert.equal(value('ESCALATE','more context required').classification,'MODEL_ESCALATION');
  assert.equal(value('FAILED','model returned failure').classification,'EXECUTION_FAILED');
  assert.equal(value('SUCCEEDED','done',false,true).classification,'SCOPE_VIOLATION');
  assert.equal(value('SUCCEEDED','wrong answer',true,false).classification,'VERIFICATION_FAILED');
  assert.deepEqual(value('SUCCEEDED','done',true,true),{classification:null,reason:null});
});

test('benchmark failure detail is redacted and bounded before persistence',()=>{const secret=`sk-test-${'x'.repeat(40)}`,result=fastExecutionFailure({status:'FAILED',summary:`provider error api_key=${secret} ${'x'.repeat(1000)}`,scopePassed:true,verificationPassed:false});assert.equal(result.reason?.includes(secret),false);assert.match(result.reason??'',/REDACTED/);assert.ok((result.reason?.length??0)<=500);});

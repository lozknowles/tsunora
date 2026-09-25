import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ActionRegistry} from './job-runtime.js';
import {JobCatalog} from './job-catalog.js';
import {LabPreparationFailure,LabAdmissionBlocked} from './model-hardware-qualification.js';
import {labSpecDigest,registerModelHardwareQualification,validateLabSpec,validateLabAttempt,type LabQualificationSpec,type LabExecutionAdapter} from './model-hardware-qualification.js';
const spec=():LabQualificationSpec=>({schema:'agent-control.model-hardware-qualification/v1',id:'synthetic-lab',version:'1.0.0',target:{device:'synthetic-device',environment:'synthetic-environment',runtime:'synthetic-runtime',model:'synthetic-model',modelSha256:'a'.repeat(64),runtimeSha256:'b'.repeat(64),discoveryEvidence:['synthetic-observation']},adapter:'synthetic-adapter',profileRef:'synthetic-approved-profile',testClass:'COMMON_COMPARABLE',cases:[{id:'instruction',prompt:'Reply exactly READY',validator:'exact-text',input:null,expected:'READY'}],repetitions:3,timeoutMs:10000,requestedDimensions:[],evidenceRequirements:['input-output'],resourcePolicyRef:'synthetic-policy'});
async function exercise(change:Partial<LabExecutionAdapter>={},authorized=true,definition=spec(),signal=new AbortController().signal,recordAccounting?:any,resolveContinuation?:any){
 const records:Array<{name:string;value:any}>=[],calls:string[]=[];
 const adapter:LabExecutionAdapter={id:definition.adapter,compatibility:async()=>({status:'SUPPORTED',reasons:[],evidence:{synthetic:true}}),prepare:async()=>{calls.push('prepare');return{synthetic:true};},invoke:async(s,task)=>{assert.equal('cases' in s,false);assert.equal('expected' in task,false);calls.push('invoke');return{status:'SUCCEEDED',input:task.prompt,output:'READY',error:null,tokens:{input:null,cached:null,output:null},metrics:{},configuration:{synthetic:true},rawResponse:{synthetic:true},evidenceAvailability:{'input-output':'RECORDED'}};},validate:async()=>({passed:true,reason:'synthetic control',evidence:{synthetic:true}}),restore:async()=>{calls.push('restore');return{restored:true,evidence:{synthetic:true}};},...change};
 const actions=new ActionRegistry(),catalog=new JobCatalog(actions.ids());
 registerModelHardwareQualification(catalog,actions,{resolve:()=>definition,authorize:async()=>{if(!authorized)throw Error('synthetic-denied');},adapters:[adapter],recordAccounting,resolveContinuation});
 const action=actions.resolve('model-hardware-qualification.execute@1.0.0');assert.equal(action.kind,'control');if(action.kind!=='control')throw Error('wrong action kind');
 const context={run:{id:'synthetic-run'},parameters:{specSha256:labSpecDigest(definition)},signal,recordEvidence:(name:string,value:unknown)=>{records.push({name,value});return{id:'artifact-'+records.length,sha256:createHash('sha256').update(JSON.stringify(value)).digest('hex')};}};
 let result:any,error:unknown;try{result=await action.handler(context as any);}catch(e){error=e;}
 return{records,calls,result,error};
}
test('generic lab uses ordinary actions, hides validator expectations and retains every attempt',async()=>{
 const r=await exercise();assert.equal(r.error,undefined);assert.equal(r.records.filter(x=>x.name==='lab-qualification-attempt').length,3);assert.deepEqual(r.calls,['prepare','invoke','invoke','invoke','restore']);assert.equal(r.result.artifacts[0].value.status,'QUALIFIED');
});
test('authorization denial precedes resource changes',async()=>{const r=await exercise({},false);assert.match(String(r.error),/denied/);assert.deepEqual(r.calls,[]);});
test('evidenced loading incompatibility is a retained qualification result with no invented attempts',async()=>{const r=await exercise({prepare:async()=>{throw new LabPreparationFailure('DOES_NOT_FIT','Synthetic allocation refusal.',{id:'synthetic-runtime-log'});}});assert.equal(r.error,undefined);assert.equal(r.result.artifacts[0].value.status,'DOES_NOT_FIT');assert.deepEqual(r.result.artifacts[0].value.attempts,[]);assert.ok(r.records.some(x=>x.name==='lab-preparation-failure'&&x.value.status==='DOES_NOT_FIT'));assert.equal(r.calls.includes('invoke'),false);});
test('incompatibility is retained without replacing the model or starting a runtime',async()=>{const r=await exercise({compatibility:async()=>({status:'DOES_NOT_FIT',reasons:['synthetic-fit-failure'],evidence:{synthetic:true}})});assert.equal(r.result.artifacts[0].value.status,'DOES_NOT_FIT');assert.deepEqual(r.calls,[]);});
test('thrown invocation failure is retained without leaking exception messages and restoration runs',async()=>{const r=await exercise({invoke:async()=>{throw Error('synthetic-sensitive-exception');}});assert.equal(r.error,undefined);assert.equal(r.result.artifacts[0].value.status,'FAILED');assert.equal(r.records.filter(x=>x.name==='lab-qualification-attempt').length,1);assert.ok(!JSON.stringify(r.records).includes('synthetic-sensitive-exception'));assert.ok(r.calls.includes('restore'));const failed=await exercise({restore:async()=>({restored:false,evidence:{synthetic:true}})});assert.match(String(failed.error),/restoration_unconfirmed/);});
test('missing required telemetry cannot be qualified just because quality passed',async()=>{const s=spec();s.evidenceRequirements.push('physical-telemetry');const r=await exercise({},true,s);assert.equal(r.result.artifacts[0].value.status,'INCOMPLETE');});
test('generic specification accepts alternate platforms without runtime filename assumptions',()=>{const s=spec();s.target.runtime='alternate-runtime';s.target.environment='alternate-platform';s.target.model='non-gguf-artifact';assert.deepEqual(validateLabSpec(s),s);assert.throws(()=>validateLabSpec({...s,repetitions:1}),/limits/);});
test('preparation and restoration exceptions leave authoritative failure records',async()=>{
 const p=await exercise({prepare:async()=>{throw Error('private details');}});assert.match(String(p.error),/preparation_failed/);assert.ok(p.records.some(x=>x.name==='lab-preparation-failure'));assert.ok(!JSON.stringify(p.records).includes('private details'));
 const r=await exercise({restore:async()=>{throw Error('private details');}});assert.match(String(r.error),/restoration_unconfirmed/);assert.ok(r.records.some(x=>x.name==='lab-restoration'&&x.value.restored===false));
});
test('failed quality validator cannot qualify an otherwise fast response',async()=>{const r=await exercise({validate:async()=>{throw Error('validator unavailable');}});assert.equal(r.result.artifacts[0].value.status,'FAILED');assert.ok(r.records.some(x=>x.name==='lab-quality-verdict'&&x.value.passed===null));});
test('malformed and contradictory telemetry is rejected while recorded zero and unknown remain distinct',()=>{
 const value:any={status:'SUCCEEDED',output:'READY',input:'prompt',error:null,tokens:{input:0,cached:0,output:null},metrics:{temperature:null},configuration:{},rawResponse:{},evidenceAvailability:{tokens:'UNAVAILABLE'}};
 assert.equal(validateLabAttempt(value).tokens.output,null);
 assert.throws(()=>validateLabAttempt({...value,tokens:{input:1,cached:2,output:1}}),/cached/);
 assert.throws(()=>validateLabAttempt({...value,tokens:{input:NaN,cached:null,output:1}}),/token/);
 assert.throws(()=>validateLabAttempt({...value,metrics:{speed:Infinity}}),/metric/);
});

test('an already cancelled qualification cannot prepare or invoke a runtime',async()=>{
 const c=new AbortController();c.abort();let probed=false;
 const r=await exercise({compatibility:async()=>{probed=true;return{status:'SUPPORTED',reasons:[],evidence:{synthetic:true}};}},true,spec(),c.signal);
 assert.ok(r.error);assert.equal(probed,false);assert.deepEqual(r.calls,[]);
});
test('cancellation retains one cancelled attempt and gives restoration a fresh bounded signal',async()=>{
 const c=new AbortController();let restored=false;
 const r=await exercise({invoke:async()=>{c.abort();throw Error('private interruption detail');},restore:async(_s,_state,context)=>{assert.equal(context.signal.aborted,false);restored=true;return{restored:true,evidence:{synthetic:true}};}},true,spec(),c.signal);
 assert.ok(r.error);assert.equal(restored,true);const attempts=r.records.filter(x=>x.name==='lab-qualification-attempt');assert.equal(attempts.length,1);assert.equal(attempts[0]!.value.status,'CANCELLED');assert.ok(!JSON.stringify(r.records).includes('private interruption detail'));
});
test('the qualification deadline is distinct from operator cancellation',async()=>{
 const s=spec();s.timeoutMs=1000;const r=await exercise({invoke:async(_s,_task,c)=>{await new Promise(resolve=>setTimeout(resolve,1100));c.signal.throwIfAborted();throw Error('unreachable');}},true,s);
 assert.ok(r.error);const response=r.records.find(x=>x.name==='lab-invocation-response')!.value.result;assert.equal(response.status,'TIMED_OUT');assert.equal(response.error,'qualification_deadline');assert.ok(r.calls.includes('restore'));
});

test('admission block stops remaining dispatch, retains its evidence and never creates model accounting',async()=>{
 for(const completedBeforeBlock of [0,1]){
  let invoked=0,accounted=0;
  const r=await exercise({invoke:async(_s,task)=>{
   if(invoked++===completedBeforeBlock)throw new LabAdmissionBlocked({id:'recorded-resource-admission',sha256:'d'.repeat(64)});
   return {status:'SUCCEEDED',input:task.prompt,output:'READY',error:null,tokens:{input:2,cached:0,output:1},metrics:{},configuration:{},rawResponse:{synthetic:true},evidenceAvailability:{'input-output':'RECORDED'}};
  }},true,spec(),new AbortController().signal,async()=>{accounted++;return 'accounted-real-attempt';});
  assert.equal(r.error,undefined);assert.equal(invoked,completedBeforeBlock+1);assert.equal(accounted,completedBeforeBlock);
  const records=r.records.filter(x=>x.name==='lab-qualification-attempt');assert.equal(records.length,completedBeforeBlock+1);assert.equal(records.at(-1)!.value.status,'BLOCKED');assert.equal(records.at(-1)!.value.accountingInvocationId,null);
  const response=r.records.filter(x=>x.name==='lab-invocation-response').at(-1)!.value.result;assert.equal(response.executionStarted,false);assert.deepEqual(response.tokens,{input:null,cached:null,output:null});assert.equal(response.rawResponse.admissionEvidence.id,'recorded-resource-admission');
  assert.equal(r.result.artifacts[0].value.status,'BLOCKED');assert.equal(r.result.artifacts[0].value.unattemptedCount,2-completedBeforeBlock);assert.ok(r.calls.includes('restore'));
 }
});
test('blocked admission cannot masquerade as measured zero tokens or successful execution',()=>{
 const blocked:any={status:'BLOCKED',executionStarted:false,output:'',input:'prompt',error:'resource_admission_blocked',tokens:{input:null,cached:null,output:null},metrics:{},configuration:{},rawResponse:{},evidenceAvailability:{'input-output':'NOT_RECORDED'}};
 assert.equal(validateLabAttempt(blocked),blocked);
 assert.throws(()=>validateLabAttempt({...blocked,tokens:{input:0,cached:null,output:null}}),/blocked_execution_contradiction/);
 assert.throws(()=>validateLabAttempt({...blocked,status:'SUCCEEDED'}),/execution_state_contradiction/);
});

test('verified continuation reuses quality failures, dispatches only missing slots and does not re-account history',async()=>{
 const s=spec();s.continuationSha256='c'.repeat(64);let accounting=0;
 const reused=[1,2].map(repetition=>({caseId:'instruction',repetition,id:'old-'+repetition,sha256:'d'.repeat(64),status:'SUCCEEDED',quality:repetition===1,evidenceComplete:true}));
 const r=await exercise({},true,s,new AbortController().signal,async()=>{accounting++;return 'new';},async()=>reused);
 assert.equal(r.error,undefined);assert.equal(accounting,1);assert.equal(r.calls.filter(x=>x==='invoke').length,1);assert.equal(r.records.find(x=>x.name==='lab-qualification-attempt')!.value.repetition,3);
 const q=r.result.artifacts[0].value;assert.equal(q.reusedAttemptCount,2);assert.equal(q.unattemptedCount,0);assert.equal(q.status,'FAILED');
});
test('unverified or contradictory continuation cannot touch the runtime',async()=>{
 const s=spec();s.continuationSha256='c'.repeat(64);
 const absent=await exercise({},true,s);assert.match(String(absent.error),/resolver_required/);assert.deepEqual(absent.calls,[]);
 const slot={caseId:'instruction',repetition:1,id:'old',sha256:'d'.repeat(64),status:'SUCCEEDED',quality:true,evidenceComplete:true};
 for(const reuse of [[slot,slot],[{...slot,repetition:4}],[{...slot,status:'BLOCKED'}]]){const r=await exercise({},true,s,new AbortController().signal,undefined,async()=>reuse);assert.match(String(r.error),/continuation_invalid/);assert.deepEqual(r.calls,[]);}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {labObservations} from './lab-observation.js';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function fixture(){const task={id:'case',prompt:'synthetic',validator:'exact-text',expected:'YES'},spec={target:{device:'synthetic'},cases:[task],evidenceRequirements:['tokens']},digest=hash(spec);
 const values:any={definition:{spec,digest},response:{id:'call',specSha256:digest,result:{tokens:{input:null,cached:null,output:null},metrics:{},configuration:{},evidenceAvailability:{tokens:'UNAVAILABLE'}}},quality:{id:'call',passed:false,reason:'Synthetic quality failure.'}};
 const records:any[]=[['definition','lab-qualified-spec'],['response','lab-invocation-response'],['quality','lab-quality-verdict']].map(([id,name])=>({id,name,runId:'run',sha256:hash(values[id!])}));
 values.attempt={schema:'agent-control.lab-attempt/v1',id:'call',runId:'run',specSha256:digest,definition:{id:'definition',sha256:records[0].sha256},response:{id:'response',sha256:records[1].sha256},quality:{evidenceId:'quality',passed:false},target:spec.target,caseId:task.id,caseSha256:hash(task),status:'SUCCEEDED',testClass:'COMMON_COMPARABLE',benchmarkVersion:'1.0.0',repetition:1};records.push({id:'attempt',name:'lab-qualification-attempt',runId:'run',sha256:hash(values.attempt)});return{values,records,read:(id:string)=>values[id]};}
test('Lab projection preserves failed quality separately from successful execution and missing telemetry',()=>{const f=fixture(),r=labObservations('run',f.records,f.read)[0]!;assert.equal(r.status,'SUCCEEDED');assert.equal(r.quality,'FAIL');assert.equal(r.evidenceComplete,false);assert.equal(r.tokens.input,null);assert.match(r.routingRecommendation,/Do not recommend/);});
test('Lab joins reject foreign scope and changed definition, response or verdict',()=>{for(const mutate of [(f:any)=>f.records[0].runId='foreign',(f:any)=>f.values.definition.spec.target.device='changed',(f:any)=>f.values.quality.id='another-call',(f:any)=>f.values.response.specSha256='changed']){const f=fixture();mutate(f);assert.throws(()=>labObservations('run',f.records,f.read),/lab_/);}});
test('ordinary runs do not acquire invented Lab history',()=>assert.deepEqual(labObservations('ordinary',[],()=>{throw Error('not called');}),[]));

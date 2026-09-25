import {test} from 'node:test';
import assert from 'node:assert/strict';
import {labObservationForApi} from './lab-observation.js';
test('public Lab projection preserves recorded latency including measured zero without mutating canonical evidence',()=>{
 for(const value of [0,12.096958135953173]){
  const source:any={id:'attempt',metrics:{timeToFirstTokenSeconds:value},tokens:{input:76,cached:0,output:2}};
  const before=JSON.stringify(source),projected=labObservationForApi(source);
  assert.equal(projected.metrics.ttftSeconds,value);assert.deepEqual(projected.usage,source.tokens);assert.equal(JSON.stringify(source),before);
 }
});
test('public latency alias cannot expose strings, invalid values or infer missing latency as zero',()=>{
 for(const value of [undefined,null,'secret-like-text',NaN,Infinity,-1]){
  const projected=labObservationForApi({metrics:{timeToFirstTokenSeconds:value},tokens:{input:null,cached:null,output:null}} as any);
  assert.equal(projected.metrics.ttftSeconds,null);
 }
});

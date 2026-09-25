import assert from 'node:assert/strict';
import test from 'node:test';
import {PoeRegistrySource} from './poe-registry-source.js';
test('remote registry adapter is read-only and never treats stale records as live',async()=>{
  let fail=false;const methods:string[]=[];
  const source=new PoeRegistrySource({id:'remote',name:'Remote jobs',url:'http://127.0.0.1:19310'},async(url,options)=>{
    methods.push(options?.method??'GET');assert.equal(options?.redirect,'error');if(fail)throw new Error('offline');return new Response(JSON.stringify([{metadata:{id:String(url).includes('schedules')?'daily':'collect',name:'Collection'},spec:{enabled:true}}]));
  });
  const observed=await source.refresh();assert.equal(observed.jobs.length,1);assert.equal(observed.schedules.length,1);assert.equal(observed.state,'OBSERVED');
  fail=true;const unavailable=await source.refresh();assert.equal(unavailable.state,'UNAVAILABLE');assert.deepEqual(unavailable.jobs,[]);assert.ok(methods.every(method=>method==='GET'));
});
test('registry endpoints require explicit safe configuration and reject embedded credentials',()=>{
  assert.throws(()=>new PoeRegistrySource({id:'bad',name:'Bad',url:'https://name:password@example.com'}),/invalid/);
  assert.throws(()=>new PoeRegistrySource({id:'bad',name:'Bad',url:'http://example.com'}),/invalid/);
});

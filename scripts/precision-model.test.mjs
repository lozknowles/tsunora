import test from 'node:test';
import assert from 'node:assert/strict';
import {hostStatus,mapEntities,estateSummary,estateLinks} from '../assets/dashboard/precision-model.js';
import {replayEstate} from '../assets/dashboard/estate-client.js';
const host=(i,state='AVAILABLE')=>({id:i===0?'host:controller-local':`host:fixture-${i}`,kind:'host',label:`SYNTHETIC host ${i}`,state,detail:{attributes:{platform:'linux',execution:i===0?'LOCAL':'REMOTE',physicalIdentityDigest:'fixture'},lastSuccessfulDiscovery:'2026-09-21T10:00:00Z'}});
const projection=entities=>({entities,relations:[],estate:{status:'PARTIAL',relationships:[]}});
test('Discovery result drives five to two; unavailable records remain evidence without implying removal',()=>{
 const p=projection(Array.from({length:5},(_,i)=>host(i)));assert.equal(mapEntities(p).length,5);
 const next=structuredClone(p);next.entities.slice(2).forEach(e=>e.state='UNREACHABLE');
 assert.deepEqual(mapEntities(next).map(e=>e.id),[host(0).id,host(1).id]);
 assert.equal(mapEntities(next,'ESTATE',true).length,5);assert.equal(estateSummary(next).unavailable,3);
 assert.deepEqual(next.entities.map(e=>e.id),p.entities.map(e=>e.id));assert.equal(p.entities[4].state,'AVAILABLE');
});
test('Twenty discovered hosts, arbitrary identities and deterministic order are supported',()=>{
 const p=projection(Array.from({length:20},(_,i)=>host(i)));const before=JSON.stringify(p);
 assert.equal(mapEntities(p).length,20);assert.deepEqual(mapEntities({...p,entities:[...p.entities].reverse()}),mapEntities(p));assert.equal(JSON.stringify(p),before);
});
test('Only discovery results establish found hosts; configured, connecting, failed and stale states do not',()=>{
 const states=['EXPECTED','DISCOVERED','CONNECTING','UNREACHABLE','TIMED_OUT','UNAUTHORISED','INVALID_RESPONSE','CANCELLED','BLOCKED','CONFLICTED','STALE','HISTORICALLY_OBSERVED'];
 const p=projection(states.map((s,i)=>host(i,s)));assert.equal(mapEntities(p).length,0);assert.equal(estateSummary(p).responded,0);assert.equal(mapEntities(p,'ESTATE',true).length,states.length);
});
test('Installation-only identity can respond without gaining physical identity assurance',()=>{
 const p=host(1,'DEGRADED');p.detail.attributes.identityScope='SSH_INSTALLATION';delete p.detail.attributes.physicalIdentityDigest;
 assert.equal(hostStatus(p).accepted,true);assert.equal(hostStatus(p).identity,'Installation only');
 const s=estateSummary(projection([p]));assert.equal(s.responded,1);assert.equal(s.matched,0);assert.equal(s.limited,1);
 p.detail.stale=true;assert.equal(mapEntities(projection([p])).length,0);assert.equal(estateSummary(projection([p])).responded,0);
 delete p.detail.lastSuccessfulDiscovery;assert.equal(hostStatus(p).accepted,false);
});
test('Map excludes undocumented, stale and remote-to-remote relationships',()=>{
 const p=projection([host(0),host(1),host(2)]),edge={from:host(0).id,to:host(1).id,state:'VERIFIED',basis:'VERIFIED'};
 p.estate.relationships=[edge,{...edge,basis:'INFERRED'},{...edge,state:'STALE'},{...edge,from:host(1).id,to:host(2).id}];
 assert.deepEqual(estateLinks(p,p.entities.map(e=>e.id)),[edge]);assert.deepEqual(estateLinks(p,[host(0).id]),[]);
});
test('Replay preserves partial outcome and historical observations without inventing a new live scan',()=>{
 const record={schema:'agent-control.estate-replay/v1',snapshot:{id:'fixture',runId:'fixture-run',startedAt:'2026-09-21T10:00:00Z',status:'PARTIAL'},events:[{id:'event-1',at:'2026-09-21T10:00:00Z',entity:{...host(1),attributes:{},evidence:[]}}]};
 const p=replayEstate(record,0);assert.equal(p.estate.status,'REPLAY');assert.equal(estateSummary(p,'REPLAY').status,'PARTIAL');assert.equal(hostStatus(p.entities[0],'REPLAY').historical,true);
});

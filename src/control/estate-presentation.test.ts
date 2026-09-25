import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
import {AgentControlService} from './application-service.js';
import {PtyRegistry} from './pty.js';
import {startWebDashboard} from './web-server.js';
import {estateResourceAlias} from './estate-remote.js';
test('Estate names require operator authentication and never expose transport or extend discovery',async()=>{
 let reads=0;const resource={id:'fixture-resource',name:'SYNTHETIC friendly name',transport:{address:'private.invalid',identityFile:'/private/key'}};
 const estate={options:{config:()=>{reads++;return{resources:[resource,{id:'out-of-scope',name:'Hidden'}]};}},targets:[{resourceId:resource.id}],projection:()=>({}),subscribe:()=>()=>{}};
 const service=new AgentControlService({version:1,paused:false,lastRestorePoint:null,lanes:[]},new PtyRegistry());
 const server=startWebDashboard(service,{host:'127.0.0.1',port:0,operatorToken:'fixture-token',estate:estate as never,estateEnabled:false});
 await once(server,'listening');const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/estate/labels`;
 try{
  assert.equal((await fetch(url)).status,401);assert.equal(reads,0);
  const headers={Authorization:'Bearer fixture-token'},publicResult=await(await fetch(url+'?privacy=public',{headers})).json();assert.deepEqual(publicResult.labels,{});assert.equal(reads,0);
  const names=await(await fetch(url,{headers})).json();assert.equal(names.labels[`host:${estateResourceAlias(resource.id)}`],resource.name);assert.equal(Object.keys(names.labels).length,2);
  assert.doesNotMatch(JSON.stringify(names),/private\.invalid|identityFile|\/private\/key|out-of-scope|Hidden/);
  assert.equal(reads,1);assert.equal(resource.name,'SYNTHETIC friendly name');
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

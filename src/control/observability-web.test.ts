import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
import path from 'node:path';
import {AgentControlService} from './application-service.js';
import {PtyRegistry} from './pty.js';
import {startWebDashboard} from './web-server.js';
import {usageProjection} from './usage-projection.js';
function service(){return new AgentControlService({version:1,paused:false,lastRestorePoint:null,lanes:[]},new PtyRegistry(),undefined,'test',()=>{});}
test('new node/resource/run APIs reject missing authentication before projection',async t=>{
  const control=service();let reads=0;control.nodeDashboard=()=>{reads++;throw Error('must not read');};
  const server=startWebDashboard(control,{host:'127.0.0.1',port:0,operatorToken:'obs-test-token',assetsDir:path.resolve('assets/dashboard')});await once(server,'listening');t.after(()=>server.close());const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for(const endpoint of ['/api/observability/nodes/node-a','/api/observability/nodes/node-a/resources','/api/observability/runs/run-a'])assert.equal((await fetch(base+endpoint)).status,401);
  assert.equal(reads,0);
  for(const asset of ['dashboard-observability.js','dashboard-observability.css'])assert.equal((await fetch(`${base}/${asset}`)).status,200);
});
test('Mallow node state comes from the same Node Dashboard projection',()=>{
  const control=service();control.nodeDashboard=()=>({node:{label:'Neutral machine',state:'WAITING'},work:[{id:'p1',endedAt:null},{id:'p2',endedAt:'2026-09-13'}],resources:[{}]} as ReturnType<AgentControlService['nodeDashboard']>);
  const explanation=control.poeEvidence({kind:'node-dashboard',id:'machine-a'});assert.equal(explanation.title,'Neutral machine');assert.equal(explanation.facts.find(f=>f.label==='Active work')?.value,1);assert.deepEqual(explanation.related,[{kind:'run-inspector',id:'p1'},{kind:'run-inspector',id:'p2'}]);
});
test('Mallow run accounting retains unknown values from the same Run Inspector',()=>{
  const control=service(),usage=usageProjection(undefined,[],{period:'all'});control.runInspector=()=>({title:'Neutral job',id:'p',status:'RUNNING',usage,context:{records:[]},physicalNodes:[]} as unknown as ReturnType<AgentControlService['runInspector']>);
  const explanation=control.poeEvidence({kind:'run-inspector',id:'p'});assert.equal(explanation.facts.find(f=>f.label==='Input tokens')?.value,null);assert.match(explanation.summary,/RUNNING/);assert.equal(explanation.facts.find(f=>f.label==='Total tokens')?.value,usage.totals.tokens.value);
});
test('Mallow explains a workspace from its read-only authoritative projection',()=>{
  const control=service();control.workspace=()=>({id:'acw1.RUN.fixture',kind:'RUN',label:'Recorded run',status:'SUCCEEDED',mode:'HISTORICAL',children:[],capabilities:[{id:'STATUS',state:'AVAILABLE',reason:'authoritative'},{id:'EXECUTE',state:'REQUIRES_AUTHORIZATION',reason:'separate authority'}],parent:null} as unknown as ReturnType<AgentControlService['workspace']>);
  const explanation=control.poeEvidence({kind:'workspace',id:'acw1.RUN.fixture'});assert.equal(explanation.title,'Recorded run');assert.match(explanation.summary,/grants no control authority/);assert.equal(explanation.facts.find(f=>f.label==='Control authority granted')?.value,false);assert.equal(explanation.facts.find(f=>f.label==='Available read-only capabilities')?.value,'STATUS');
});

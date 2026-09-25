import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
import test from 'node:test';
import {AgentControlService} from './application-service.js';
import {PtyRegistry} from './pty.js';
import {startWebDashboard} from './web-server.js';
import {ModelImprovementRuntime} from './model-improvement.js';

test('model improvement API is read protected, mutation protected, and rendered in Models',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ac-improvement-web-')),runtime=new ModelImprovementRuntime(path.join(root,'improvement.json')),service=new AgentControlService({version:1,paused:false,lastRestorePoint:null,lanes:[]},new PtyRegistry()),server=startWebDashboard(service,{host:'127.0.0.1',port:0,operatorToken:'test-token',assetsDir:path.resolve('assets/dashboard'),modelImprovement:runtime});
  await once(server,'listening');t.after(()=>server.close());const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`,headers={Authorization:'Bearer test-token','Content-Type':'application/json'};
  assert.equal((await fetch(base+'/api/model-improvement')).status,401);
  assert.equal((await fetch(base+'/api/model-improvement/mode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'ANALYSE_ONLY'})})).status,401);
  const changed=await(await fetch(base+'/api/model-improvement/mode',{method:'POST',headers,body:JSON.stringify({mode:'ANALYSE_ONLY'})})).json() as {mode:string};assert.equal(changed.mode,'ANALYSE_ONLY');
  const projection=await(await fetch(base+'/api/model-improvement',{headers})).json() as {schema:string;mode:string};assert.equal(projection.schema,'agent-control.model-improvement-projection/v1');assert.equal(projection.mode,'ANALYSE_ONLY');
  const html=await(await fetch(base+'/')).text(),source=await(await fetch(base+'/dashboard-models.js')).text();assert.match(html,/Model Improvement/);assert.match(source,/Approve exact proposal/);assert.match(source,/PROMOTED appears only after adapter application/);assert.match(source,/applied effect/);assert.match(source,/rollback/);
});

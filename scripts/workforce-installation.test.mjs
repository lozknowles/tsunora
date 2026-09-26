import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';

async function start(root) {
  fs.rmSync(path.join(root, 'private-session.json'), {force:true});
  const child = spawn(process.execPath, ['--import','tsx','scripts/workforce-lab.ts',root], {stdio:'ignore'});
  const exited = new Promise(resolve => child.once('exit', resolve));
  for (let i=0; i<100; i++) {
    if (child.exitCode !== null) throw new Error('workforce server exited before readiness');
    if (fs.existsSync(path.join(root,'private-session.json'))) return {child,exited,session:JSON.parse(fs.readFileSync(path.join(root,'private-session.json'),'utf8'))};
    await sleep(100);
  }
  child.kill(); throw new Error('workforce readiness timeout');
}
async function stop(server,root) {
  fs.writeFileSync(path.join(root,'STOP'),'');
  await Promise.race([server.exited,sleep(5000,undefined,{ref:false}).then(()=>{server.child.kill();throw new Error('shutdown timeout');})]);
}
const api=(s,route,body,token=s.operator)=>fetch(`http://127.0.0.1:${s.port}/api/${route}`,{method:body?'POST':'GET',headers:{'x-workforce-session':token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});

test('workforce approval survives documented STOP and restart; sessions rotate and authority stays enforced',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'workforce-install-'));let running;
 t.after(()=>{running?.child.kill();fs.rmSync(root,{recursive:true,force:true});});
 running=await start(root);const first=running.session;
 const submitted=await api(first,'request',{text:'I have changed my bank account.',confirmed:true});assert.equal(submitted.status,201);const id=(await submitted.json()).run.id;
 let state;
 for(let i=0;i<100;i++){state=await(await api(first,'state')).json();if(state.runs.find(r=>r.id===id)?.steps.find(s=>s.id==='execute').status==='WAITING_FOR_APPROVAL')break;await sleep(100);}
 assert.equal(state.runs.find(r=>r.id===id).steps.find(s=>s.id==='execute').status,'WAITING_FOR_APPROVAL');
 assert.equal(state.records['DEMO-A/EMP-0042'].bank,'SYNTHETIC-BANK-A');
 assert.equal((await api(first,'approval',{runId:id,allow:true},first.employee)).status,400);
 await stop(running,root);running=await start(root);await sleep(1000);
 const second=running.session;assert.notEqual(second.operator,first.operator);
 assert.equal((await api(second,'state',undefined,first.operator)).status,401);
 state=await(await api(second,'state')).json();assert.equal(state.runs.find(r=>r.id===id).steps.find(s=>s.id==='execute').status,'WAITING_FOR_APPROVAL');
 assert.equal((await api(second,'approval',{runId:id,allow:true})).status,200);
 for(let i=0;i<100;i++){state=await(await api(second,'state')).json();if(state.runs.find(r=>r.id===id)?.status==='SUCCEEDED')break;await sleep(100);}
 assert.equal(state.runs.find(r=>r.id===id).status,'SUCCEEDED');assert.equal(state.records['DEMO-A/EMP-0042'].bank,'SYNTHETIC-BANK-B');
 assert.equal((await api(second,'approval',{runId:id,allow:true})).status,400);
 running.child.kill('SIGTERM');await running.exited;
 assert.equal(fs.existsSync(path.join(root,'private-session.json')),false);
 assert.equal(fs.existsSync(path.join(root,'STOP')),false);
});

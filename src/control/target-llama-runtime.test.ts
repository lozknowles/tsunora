import test from 'node:test';
import assert from 'node:assert/strict';
import {TargetLlamaRuntime,validateRuntimeTarget} from './target-llama-runtime.js';
const target:any={resource:{id:'fixture',transport:{type:'local'}},environment:'fixture-linux',telemetry:'linux',stateDirectory:'/tmp/runtime-fixture'};
test('target adapters reject invalid transport and unsafe state paths',()=>{assert.throws(()=>validateRuntimeTarget({...target,stateDirectory:'/tmp/../escape'}));assert.throws(()=>validateRuntimeTarget({...target,resource:{id:'x',transport:{type:'ssh',host:'host;injection'}}}));});
test('Android battery and thermal parsing comes from actual adapter output with worker provenance',async()=>{const rows:any[]=[];const adapter=new TargetLlamaRuntime({...target,telemetry:'android-termux',adb:{executable:'/fixture/adb',host:'127.0.0.1',port:5037,serial:'fixture',expectedSerial:'expected'}});const c:any={signal:new AbortController().signal,worker:{id:'runtime-worker'},run:{id:'run'},step:{id:'probe'},recordEvidence:(name:string,value:any)=>{rows.push({name,value});return{id:name};},ownedExecution:{runProcess:async(req:any)=>({pid:123,exitCode:0,stdout:req.args.includes('ro.serialno')?'expected':req.args.includes('battery')?'  USB powered: true\n  level: 81\n  temperature: 295':'Thermal Status: 0',stderr:''})}};const o=await adapter.platform(c);assert.equal(o.batteryPercent,81);assert.equal(o.charging,true);assert.equal(o.thermalCelsius,29.5);assert.equal(o.thermalStatus,0);assert.ok(rows.some(x=>x.name==='runtime-telemetry-response'&&x.value.field==='battery'&&x.value.producer.worker==='runtime-worker'));});
test('Linux adapter preserves unsupported telemetry as null without Android commands',async()=>{const adapter=new TargetLlamaRuntime(target);let called=false;const c:any={ownedExecution:{runProcess:()=>{called=true;}}};assert.equal((await adapter.platform(c)).batteryPercent,null);assert.equal(called,false);});
test('wrong Android device identity fails closed',async()=>{const adapter=new TargetLlamaRuntime({...target,telemetry:'android-termux',adb:{executable:'/fixture/adb',host:'127.0.0.1',port:5037,serial:'fixture',expectedSerial:'expected'}});const c:any={signal:new AbortController().signal,worker:{id:'w'},run:{id:'r'},step:{id:'s'},recordEvidence:()=>({}),ownedExecution:{runProcess:async()=>({pid:1,exitCode:0,stdout:'wrong',stderr:''})}};await assert.rejects(adapter.platform(c),/identity_mismatch/);});

import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {OwnedProcessManager} from './owned-process.js';import {ExecutionSessionRuntime} from './execution-session.js';
test('target adapter request satisfies real execution-session identity contract',async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'target-session-'));const sessions=new ExecutionSessionRuntime(root),manager=new OwnedProcessManager(undefined,sessions,{runId:'run',jobId:'job',jobVersion:'1.0.0',stepId:'probe',actionId:'test@1.0.0',workerId:'worker',nodeId:'controller'});try{const c:any={signal:new AbortController().signal,worker:{id:'worker'},run:{id:'run'},step:{id:'probe'},recordEvidence:()=>({}),ownedExecution:{runProcess:(request:any,signal:AbortSignal)=>manager.runProcess({...request,command:process.execPath,args:['-e','console.log(JSON.stringify({runtimeResult:{availableRamBytes:123}}))'],input:undefined},signal)}};assert.equal((await new TargetLlamaRuntime(target).execute('observe',c)).availableRamBytes,123);assert.equal(sessions.list()[0].adapterId,'target-llama-runtime-v1');}finally{await manager.terminateAll('test completed');fs.rmSync(root,{recursive:true,force:true});}});

import {spawnSync} from 'node:child_process';
test('distributed target helper emits lifecycle and durable failure receipt before model launch',{skip:process.platform!=='linux'},()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'helper-qual-'));try{const source=fs.readFileSync(new URL('../../assets/runtime/llama-invocation.py',import.meta.url),'utf8');const request={operation:'invoke',producer:{provenance:'AGENT_CONTROL_RUNTIME_EVIDENCE'},stateDirectory:root,attemptId:'test-attempt',input:{messages:[]},profile:{runtimePath:path.join(root,'absent-runtime'),runtimeSha256:'a'.repeat(64)}};const result=spawnSync('python3',['-'],{input:source+'\nprint(json.dumps(dispatch(json.loads('+JSON.stringify(JSON.stringify(request))+'))))\n',encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/runtime.request_received/);assert.match(result.stdout,/runtime.result_retained/);const receipt=JSON.parse(fs.readFileSync(path.join(root,'test-attempt.result.json'),'utf8'));assert.equal(receipt.status,'FAILED');assert.equal(receipt.rawResponse.originalServiceRestored,true);assert.equal(receipt.tokens.output,null);}finally{fs.rmSync(root,{recursive:true,force:true});}});

test('helper recovery cannot certify attempt ownership from service health alone',{skip:process.platform!=='linux'},()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'helper-recovery-'));try{const source=fs.readFileSync(new URL('../../assets/runtime/llama-invocation.py',import.meta.url),'utf8');const request={operation:'abort',stateDirectory:root,attemptId:'missing-attempt',originalService:{args:['fixture-runtime','--port','19000']}};const fake=`
RealPath = Path
class FakeEntry:
 name = '123'
 def stat(self): return type('Stat', (), {'st_uid':os.getuid()})()
 def __truediv__(self, other): return self
 def read_bytes(self): return bytes([0]).join([b'fixture-runtime', b'--port', b'19000', b''])
class FakeProc:
 def iterdir(self): return [FakeEntry()]
Path = lambda value: FakeProc() if value == '/proc' else RealPath(value)
health = lambda endpoint: True
time.sleep = lambda value: None
`;
const run=()=>spawnSync('python3',['-'],{input:source+'\n'+fake+'\nprint(json.dumps(dispatch(json.loads('+JSON.stringify(JSON.stringify(request))+'))))\n',encoding:'utf8'});let response=run();assert.equal(response.status,0,response.stderr);assert.equal(JSON.parse(response.stdout.trim()).restored,false);fs.writeFileSync(path.join(root,'missing-attempt.log'),'runtime may have started');response=run();assert.equal(JSON.parse(response.stdout.trim()).restored,false);}finally{fs.rmSync(root,{recursive:true,force:true});}});

test('read-only memory inspection returns bounded same-user summaries without argv or environment',{skip:process.platform!=='linux'},()=>{
 const source=fs.readFileSync(new URL('../../assets/runtime/llama-invocation.py',import.meta.url),'utf8');
 const result=spawnSync('python3',['-'],{input:source+'\nprint(json.dumps(dispatch({"operation":"observe","stateDirectory":"/tmp"})))\n',encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const value=JSON.parse(result.stdout.trim());assert.ok(value.memoryBreakdown.MemTotal>0);assert.ok(value.sameUidProcesses.length<=40);
 for(const row of value.sameUidProcesses){assert.deepEqual(Object.keys(row).sort(),['name','pid','role','rssBytes','startIdentity'].sort());assert.ok(row.rssBytes>=0);assert.equal(row.role,'UNATTRIBUTED');}
});

import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import test from 'node:test';import assert from 'node:assert/strict';import {androidRecoveryPort} from './android-target-recovery.js';import {OwnedProcessManager} from './owned-process.js';import {TargetLlamaRuntime,type RuntimeTarget} from './target-llama-runtime.js';
const boot='11111111-1111-4111-8111-111111111111';
const target={resource:{id:'configured',name:'Device',transport:{type:'ssh',host:'configured.example',port:2345,user:'configured-user'}},environment:'android-termux',telemetry:'android-termux',stateDirectory:'/private/recovery',adb:{executable:'/configured/adb',host:'127.0.0.1',port:6789,serial:'configured-route',expectedSerial:'physical'},originalService:{args:['/configured/server','--port','12345'],cwd:'/configured'}} as RuntimeTarget;
for(const mismatch of [false,true])test('adapter uses explicit ADB routing and cross-checks SSH boot identity mismatch='+mismatch,async()=>{
 const original=OwnedProcessManager.prototype.runProcess,commands:any[]=[];
 OwnedProcessManager.prototype.runProcess=async function(spec:any){commands.push(spec);let stdout='';if(spec.command==='/configured/adb'){assert.deepEqual(spec.args.slice(0,6),['-H','127.0.0.1','-P','6789','-s','configured-route']);stdout=spec.args.includes('getprop')?'physical':boot;}else{assert.equal(spec.command,'ssh');assert.ok(spec.args.includes('configured-user@configured.example'));assert.ok(spec.args.includes('2345'));assert.ok(spec.input.includes('recovery-observe')||spec.input.includes('restore-service'));stdout=JSON.stringify({bootId:mismatch?'22222222-2222-4222-8222-222222222222':boot,environmentVerified:true,service:{identity:true,healthy:true,expected:true}});}return {stdout,stderr:'',exitCode:0,pid:1} as any;};
 try{const port=androidRecoveryPort(target);if(mismatch)await assert.rejects(port.observe(),/boot_identity_mismatch/);else{assert.equal((await port.observe()).bootId,boot);await port.reboot();assert.ok(commands.some(c=>c.args.at(-1)==='reboot'));assert.equal((await port.restore(boot)).service.healthy,true);}assert.ok(commands.every(c=>!c.args.includes('invoke')));}finally{OwnedProcessManager.prototype.runProcess=original;}
});

for(const mode of ['healthy','missing','unhealthy','ambiguous'])test('protected service helper '+mode+' uses health only and configured identity',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'recovery-service-'));try{const source=fs.readFileSync(new URL('../../assets/runtime/llama-invocation.py',import.meta.url),'utf8');const script=`
RealPath=Path
args=['/configured/server','--port','12345']
present=${mode==='missing'?0:mode==='ambiguous'?2:1}
launches=[]
class File:
 def read_text(self):return '${boot}'
 def exists(self):return True
 def stat(self):return object()
class Entry:
 name='123'
 def stat(self):return type('Stat',(),{'st_uid':os.getuid()})()
 def __truediv__(self,x):return self
 def read_bytes(self):return bytes([0]).join([x.encode() for x in args]+[b''])
class Proc:
 def iterdir(self):return [Entry() for _ in range(present)]
def Factory(x):
 if str(x)=='/proc':return Proc()
 if str(x) in ['/proc/sys/kernel/random/boot_id','/system/bin/getprop']:return File()
 return RealPath(x)
Factory.home=lambda:RealPath('/data/data/com.termux/files/home')
Path=Factory
health=lambda endpoint:${mode==='unhealthy'?'False':'True'}
class Child:
 pid=123
 def poll(self):return None
def launch(argv,**kw):
 global present
 assert argv==args
 launches.append(argv);present=1;return Child()
subprocess.Popen=launch
ticks=iter(range(10000));time.monotonic=lambda:next(ticks);time.sleep=lambda delay:None
request={'operation':'restore-service','expectedBootId':'${boot}','stateDirectory':${JSON.stringify(dir)},'originalService':{'args':args,'cwd':${JSON.stringify(dir)}}}
r=dispatch(request)
print(json.dumps({'result':r,'launches':len(launches)}))
`;
 const result=spawnSync('python3',['-'],{input:source+script,encoding:'utf8'});assert.equal(result.status,0,result.stderr);const v=JSON.parse(result.stdout);assert.equal(v.launches,mode==='missing'?1:0);assert.equal(v.result.service.expected,['healthy','missing'].includes(mode));assert.equal(v.result.bootId,boot);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('old action cannot append a response after the target generation changes',async()=>{const adapter=new TargetLlamaRuntime(target);let generation=0;const evidence:string[]=[];adapter.recoveryFence={assertAttempt:()=>{},generation:()=>generation,assertGeneration:(g:number)=>{if(g!==generation)throw Error('target_generation_fenced');}} as any;const owned={runProcess:async()=>{generation++;return {exitCode:0,pid:1,stdout:JSON.stringify({runtimeResult:{status:'SUCCEEDED'}})};}} as any;const context={run:{id:'run'},step:{id:'step'},worker:{id:'worker'},recordEvidence:(name:string)=>evidence.push(name),signal:new AbortController().signal} as any;await assert.rejects(adapter.execute('observe',context,{},owned),/generation_fenced/);assert.deepEqual(evidence,['runtime-target-request']);});

for(const mode of ['pass','android','platform','home','missing','permission'])test('environment components preserve independent observations: '+mode,()=>{
 const source=fs.readFileSync(new URL('../../assets/runtime/llama-invocation.py',import.meta.url),'utf8');
 const result=spawnSync('python3',['-'],{input:source+`
class File:
 def stat(self):
  ${mode==='permission'?"raise PermissionError('restricted')":mode==='missing'?"raise FileNotFoundError('absent')":"return object()"}
class Factory:
 def __new__(cls,x):return File()
 @staticmethod
 def home():return '${mode==='home'?'/other/home':'/data/data/com.termux/files/home'}'
Path=Factory
platform.system=lambda:'${mode==='platform'?'Windows':mode==='android'?'Android':'Linux'}'
print(json.dumps(recovery_environment()))
`,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const checks=JSON.parse(result.stdout);assert.equal(checks.length,3);assert.ok(checks.every((c:any)=>c.timestamp&&c.expected&&c.reason));
 assert.equal(checks[0].status,mode==='platform'?'FAIL':'PASS');assert.equal(checks[1].status,mode==='home'?'FAIL':'PASS');assert.equal(checks[2].status,mode==='permission'?'UNKNOWN':mode==='missing'?'FAIL':'PASS');
});

test('diagnostic uses configured routes, independent identity and service checks, no mutations',async()=>{
 const original=OwnedProcessManager.prototype.runProcess,commands:any[]=[];
 OwnedProcessManager.prototype.runProcess=async function(spec:any){commands.push(spec);return {exitCode:0,stdout:spec.command==='/configured/adb'?(spec.args.includes('getprop')?'physical':boot):JSON.stringify({bootId:boot,environmentVerified:false,components:[{id:'execution_platform',mandatory:true,status:'FAIL',expected:'Linux',observed:'Android',timestamp:new Date().toISOString(),reason:'mismatch'}],service:{identity:true,healthy:true,expected:true}}),stderr:'',pid:1} as any;};
 try{const r=await androidRecoveryPort(target).diagnose!();assert.equal(r.components.find(c=>c.id==='physical_target_identity')?.status,'PASS');assert.equal(r.components.find(c=>c.id==='execution_platform')?.status,'FAIL');assert.equal(r.components.find(c=>c.id==='protected_service_health')?.status,'PASS');assert.equal(commands.length,3);assert.ok(commands.every(c=>!c.args.includes('reboot')));assert.ok(commands.filter(c=>c.input).every(c=>c.input.endsWith('flush=True)\n')&&c.input.includes('recovery-observe')));}finally{OwnedProcessManager.prototype.runProcess=original;}
});

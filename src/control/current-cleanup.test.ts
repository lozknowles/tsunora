import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {validCurrentCleanup} from './runtime-benchmark.js';
const expected={verificationId:'fresh-nonce',attemptId:'attempt-1',runId:'run-1',stepId:'step',target:'device',environment:'env'};
const evidence=()=>({schema:'agent-control.current-cleanup/v1',...expected,producer:expected,observedAt:new Date().toISOString(),bindingVerified:true,confirmed:true,checks:{attemptTerminated:true,runtimeAbsent:true,ownershipReleased:true,originalServiceIdentity:true,originalServiceHealth:true,protectedResourceExpected:true}});
test('current complete bound evidence accepted',()=>assert.equal(validCurrentCleanup(evidence(),expected),true));
for(const key of Object.keys(evidence().checks))for(const missing of [false,null])test(key+' '+missing+' cannot certify cleanup',()=>{const v=evidence();(v.checks as any)[key]=missing;assert.equal(validCurrentCleanup(v,expected),false);});
for(const key of ['verificationId','attemptId','runId','stepId','target','environment'])test('unrelated '+key+' rejected',()=>{const v=evidence();if(key in v.producer)(v.producer as any)={...v.producer,[key]:'other'};if(['verificationId','attemptId'].includes(key))(v as any)[key]='other';assert.equal(validCurrentCleanup(v,expected),false);});
test('saved receipt and stale verification cannot certify cleanup',()=>{assert.equal(validCurrentCleanup({restored:true},expected),false);assert.equal(validCurrentCleanup({...evidence(),observedAt:'2000-01-01'},expected),false);});
for(const legacy of [true,false])for(const unhealthy of [true,false])for(const active of [true,false])test('helper performs live inspection despite saved PASS legacy='+legacy+' unhealthy='+unhealthy+' active='+active,()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'current-cleanup-'));try{const source=fs.readFileSync(new URL('../../assets/runtime/llama-invocation.py',import.meta.url),'utf8');
 const script=`
root=Path(${JSON.stringify(root)})
producer={'runId':'run-1','stepId':'step','target':'device','environment':'env'}
raw={'producer':producer,'originalServiceRestored':True,'runtimeNeverStarted':True}
if not ${legacy?'True':'False'}:
 raw['attemptIdentity']={'attemptId':'attempt-1','pid':2147483646,'startIdentity':'1','bootId':Path('/proc/sys/kernel/random/boot_id').read_text().strip()}
if ${active?'True':'False'}:
 raw.update(runtimeNeverStarted=False,runtimePid=os.getpid(),runtimeStartIdentity=process_identity(os.getpid()))
(root/'attempt-1.result.json').write_text(json.dumps({'rawResponse':raw}))
before=(root/'attempt-1.result.json').read_bytes()
RealPath=Path
class Entry:
 name='123'
 def stat(self):return type('Stat',(),{'st_uid':os.getuid()})()
 def __truediv__(self,x):return self
 def read_bytes(self):return bytes([0]).join([b'original',b'--port',b'19000',b''])
class Proc:
 def __truediv__(self,x):return RealPath('/proc')/x
 def iterdir(self):return [Entry()]
Path=lambda x:Proc() if x=='/proc' else RealPath(x)
health=lambda endpoint:${unhealthy?'False':'True'}
run=lambda request:(_ for _ in ()).throw(Exception('inference forbidden'))
request={'operation':'verify-cleanup','attemptId':'attempt-1','verificationId':'fresh-nonce','producer':producer,'stateDirectory':str(root),'originalService':{'args':['original','--port','19000']}}
a=dispatch(request);b=dispatch(request)
assert before==(root/'attempt-1.result.json').read_bytes()
assert a['confirmed']==b['confirmed']
print(json.dumps(a))
`;
 const result=spawnSync('python3',['-'],{input:source+script,encoding:'utf8'});assert.equal(result.status,0,result.stderr);const v=JSON.parse(result.stdout);assert.equal(v.confirmed,!legacy&&!unhealthy&&!active);if(active)assert.equal(v.checks.runtimeAbsent,false);assert.equal(v.checks.attemptTerminated,legacy?null:true);assert.equal(v.historicalRestoration.restored,true);assert.equal(v.verificationId,expected.verificationId);
 }finally{fs.rmSync(root,{recursive:true,force:true});}});

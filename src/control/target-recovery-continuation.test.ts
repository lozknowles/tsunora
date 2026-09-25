import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {TargetReset,type ResetObservation,type ContinuationAuthority} from './target-reset.js';
const boot='11111111-1111-4111-8111-111111111111',after='22222222-2222-4222-8222-222222222222';
const observation=(good=true,id=boot):ResetObservation=>({bootId:id,physicalIdentity:'configured-identity',environmentVerified:good,service:{identity:true,healthy:true,expected:true}});
async function setup(legacy=false){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'recovery-continuation-'));let now=Date.now(),observes=0,reboots=0,restores=0;
 const port={observe:async()=>{observes++;return observation(false);},reboot:async()=>{reboots++;},restore:async()=>{restores++;return observation(true,after);}};
 const recovery=new TargetReset(dir,'device','environment','config',port,{now:()=>now,pause:async(ms)=>{now+=ms;},timeoutMs:6000});
 const parent=await recovery.reset({actor:'operator',reason:'original',requestKey:'old',expiresAt:new Date(now+1000).toISOString(),approveReset:true,runId:'run'});
 now+=2000;
 if(legacy){for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.json'))){const f=path.join(dir,name),v=JSON.parse(fs.readFileSync(f,'utf8'));delete v.disruption;fs.writeFileSync(f,JSON.stringify(v));}const f=path.join(dir,parent.id+'.jsonl'),events=fs.readFileSync(f,'utf8').trim().split('\n').map(x=>JSON.parse(x));delete events.at(-1).data.disruption;fs.writeFileSync(f,events.map(x=>JSON.stringify(x)).join('\n')+'\n');}
 const authority=():ContinuationAuthority=>({actor:'operator',reason:'prepare only',requestKey:'prepare',expiresAt:new Date(now+60000).toISOString(),target:'device',parentOperationId:parent.id,approvePreparation:true,allowedAction:'RESET_RECOVERY',runId:'run'});
 const dispatch=()=>({actor:'operator',target:'device',reason:'separate physical authority',requestKey:'dispatch',expiresAt:new Date(now+60000).toISOString(),approveReset:true,runId:'run'});
 return {dir,recovery,port,parent,authority,dispatch,advance:(ms:number)=>{now+=ms;},calls:()=>({observes,reboots,restores}),dispose:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
for(const legacy of [false,true])test('positive pre-disruption proof prepares immutable linked continuation; legacy='+legacy,async()=>{
 const f=await setup(legacy);try{
  const originals=new Map(fs.readdirSync(f.dir).map(n=>[n,fs.readFileSync(path.join(f.dir,n))]));const before=f.calls();
  const preservationMarker=path.join(f.dir,'benchmark-locks-and-results.txt');fs.writeFileSync(preservationMarker,'locks retained; target lease retained; 24/27; quality 6/24');
  const v=await f.recovery.prepareContinuation(f.authority());assert.equal(v.status,'PREPARED');assert.equal(v.parentOperationId,f.parent.id);assert.equal(v.chainId,f.parent.id);assert.equal(v.authority.approveReset,false);assert.equal(v.preparationAuthority?.allowedAction,'RESET_RECOVERY');assert.equal(v.disruption,'NOT_REQUESTED');assert.equal(v.generation,2);assert.equal(f.recovery.state()?.id,v.id);
  for(const [name,bytes] of originals)assert.deepEqual(fs.readFileSync(path.join(f.dir,name)),bytes);assert.equal(fs.readFileSync(preservationMarker,'utf8'),'locks retained; target lease retained; 24/27; quality 6/24');assert.deepEqual(f.calls(),before);assert.throws(()=>f.recovery.generation(),/quarantined/);assert.throws(()=>f.recovery.assertGeneration(2),/fenced/);assert.throws(()=>f.recovery.abandon(['legacy-attempt']),/not_complete/);
  assert.equal((await f.recovery.prepareContinuation(f.authority())).id,v.id);assert.equal((await f.recovery.prepareContinuation(f.authority())).replayed,true);
 }finally{f.dispose();}
});
for(const [name,change] of Object.entries({missingApproval:{approvePreparation:false},wrongTarget:{target:'other'},expired:{expiresAt:'2000-01-01'},noActor:{actor:''},wrongParent:{parentOperationId:'other'},wrongRun:{runId:'other'},wrongAction:{allowedAction:'BENCHMARK'},sameOldRequest:{requestKey:'old'}}))test('preparation refuses '+name,async()=>{const f=await setup();try{await assert.rejects(f.recovery.prepareContinuation({...f.authority(),...change} as any));assert.equal(f.calls().reboots,0);assert.equal(f.recovery.state()?.id,f.parent.id);}finally{f.dispose();}});
test('unexpired previous authority prevents continuation',async()=>{const f=await setup();try{f.advance(-2000);await assert.rejects(f.recovery.prepareContinuation(f.authority()),/previous_authority_live/);}finally{f.dispose();}});
for(const kind of ['missing-journal','unknown-dispatch','requested','acknowledged'])test('ambiguous or post-disruption evidence refuses continuation '+kind,async()=>{const f=await setup();try{
 const journal=path.join(f.dir,f.parent.id+'.jsonl');if(kind==='missing-journal')fs.unlinkSync(journal);else if(kind==='unknown-dispatch'){const es=fs.readFileSync(journal,'utf8').trim().split('\n').map(x=>JSON.parse(x));delete es.at(-1).data.disruption;fs.writeFileSync(journal,es.map(x=>JSON.stringify(x)).join('\n')+'\n');}else{for(const file of fs.readdirSync(f.dir).filter(n=>n.endsWith('.json'))){const v=JSON.parse(fs.readFileSync(path.join(f.dir,file),'utf8'));v.disruption=kind==='requested'?'REQUESTED':'ACKNOWLEDGED';fs.writeFileSync(path.join(f.dir,file),JSON.stringify(v));}}
 await assert.rejects(f.recovery.prepareContinuation(f.authority()));assert.equal(f.calls().reboots,0);
 }finally{f.dispose();}});
test('different concurrent request and separate instance cannot claim chain; identical request replays later',async()=>{const f=await setup();try{
 const second=new TargetReset(f.dir,'device','environment','config',f.port);const one=f.recovery.prepareContinuation(f.authority());await assert.rejects(second.prepareContinuation({...f.authority(),requestKey:'other'}),/in_progress/);const v=await one;await assert.rejects(second.prepareContinuation({...f.authority(),requestKey:'other'}),/parent_invalid/);assert.equal((await f.recovery.prepareContinuation(f.authority())).id,v.id);
 }finally{f.dispose();}});
test('old request cannot reactivate and preparation authority cannot dispatch',async()=>{const f=await setup();try{const v=await f.recovery.prepareContinuation(f.authority());await assert.rejects(f.recovery.reset(f.parent.authority),/authority_required/);await assert.rejects(f.recovery.executeContinuation(v.id,{...v.authority,target:'device'}));assert.equal(f.calls().reboots,0);}finally{f.dispose();}});
for(const failure of ['environment','identity','service','expired','wrongTarget'])test('fresh dispatch verification refuses '+failure+' without reboot',async()=>{const f=await setup();try{
 const v=await f.recovery.prepareContinuation(f.authority());const a=f.dispatch();f.port.observe=async()=>({...observation(failure!=='environment'),physicalIdentity:failure==='identity'?'other':'configured-identity',service:{identity:true,healthy:failure!=='service',expected:true}});
 if(failure==='expired')a.expiresAt='2000-01-01';if(failure==='wrongTarget')a.target='other';
 if(['expired','wrongTarget'].includes(failure))await assert.rejects(f.recovery.executeContinuation(v.id,a));else assert.equal((await f.recovery.executeContinuation(v.id,a)).status,'FAILED');assert.equal(f.calls().reboots,0);assert.throws(()=>f.recovery.generation(),/quarantined/);
 }finally{f.dispose();}});
test('commit marker is persisted before reboot and failed dispatch is not pre-disruption',async()=>{const f=await setup();try{
 const v=await f.recovery.prepareContinuation(f.authority());f.port.observe=async()=>observation();f.port.reboot=async()=>{assert.equal(f.recovery.state()?.disruption,'REQUESTED');assert.match(fs.readFileSync(path.join(f.dir,v.id+'.jsonl'),'utf8'),/DISRUPTION_REQUESTED/);throw Error('transport_lost');};
 const r=await f.recovery.executeContinuation(v.id,f.dispatch());assert.equal(r.status,'FAILED');assert.equal(r.disruption,'REQUESTED');f.advance(61000);await assert.rejects(f.recovery.prepareContinuation({...f.authority(),parentOperationId:v.id,requestKey:'second'}),/post_disruption/);
 }finally{f.dispose();}});
test('future separately authorised continuation uses fresh observations and normal recovery; synthetic only',async()=>{const f=await setup();try{
 const v=await f.recovery.prepareContinuation(f.authority());let observations=0;f.port.observe=async()=>{observations++;if(observations===2)throw Error('transport_offline');return observation(true,observations===1?boot:after);};
 const r=await f.recovery.executeContinuation(v.id,f.dispatch());assert.equal(r.status,'COMPLETE');assert.equal(r.disruption,'ACKNOWLEDGED');assert.equal(r.pre?.bootId,boot);assert.equal(r.post?.bootId,after);assert.equal(f.calls().reboots,1);assert.equal(f.calls().restores,1);assert.equal(f.recovery.generation(),2);assert.equal(observations,3);
 const prepared=fs.readdirSync(f.dir).filter(n=>n.endsWith('.receipt.json')).map(n=>JSON.parse(fs.readFileSync(path.join(f.dir,n),'utf8'))).find(x=>x.status==='PREPARED');assert.equal(prepared.id,v.id);assert.equal(prepared.authority.approveReset,false);
 }finally{f.dispose();}});

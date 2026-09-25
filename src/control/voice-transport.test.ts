import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter,once} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {AddressInfo} from 'node:net';
import {VoiceTransportRuntime,VoiceError,type VoiceEvent,type VoiceTransport} from './voice-transport.js';
import {GptLiveTransport,liveHttpError} from './gpt-live-transport.js';
import {AgentControlService} from './application-service.js';
import {PtyRegistry} from './pty.js';
import {startWebDashboard} from './web-server.js';
const drain=()=>new Promise(resolve=>setTimeout(resolve,20));
function setup(t:any){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ac-voice-'));let emit:(e:VoiceEvent)=>void=()=>{},now=Date.now(),calls=0,stops=0,closes=0;
 const sent:string[]=[];
 const adapter:VoiceTransport={id:'test-voice',model:'test-model',configured:()=>true,price:{usdPerMinute:0.06,source:'test',checkedAt:'test'},connect:async input=>{emit=input.onEvent;return {answer:'v=0\nanswer',providerSessionId:'opaque/id',send:text=>sent.push(text),stopSpeaking:()=>{stops++},close:async()=>{closes++;emit({type:'usage',seconds:15,final:true});emit({type:'closed'});await drain();}};}};
 const ingress={history:(_id:string,actor:string)=>{if(actor!=='owner'&&actor!=='web-operator')throw Error('actor_mismatch');return [];},request:async()=>{calls++;return {text:'Review the job proposal. Nothing has started.',turnId:'turn-1'};},updates:async()=>[]};
 const runtime=new VoiceTransportRuntime({directory,adapter,ingress,clock:()=>now});
 t.after(async()=>{await runtime.dispose();fs.rmSync(directory,{recursive:true,force:true});});
 return {runtime,adapter,ingress,directory,emit:(e:VoiceEvent)=>emit(e),advance:(ms:number)=>{now+=ms},sent,counts:()=>({calls,stops,closes})};
}
test('voice delegation is deduplicated, redacted and retains request and response after restart',async t=>{
 const f=setup(t),started=await f.runtime.start('conversation','owner','v=0\noffer');
 f.emit({type:'transcript',fragment:{id:'part1',speaker:'user',text:'Start observation.',startMs:0,endMs:1000}});
 f.emit({type:'delegation',id:'opaque-delegation',offsetMs:1200});f.emit({type:'delegation',id:'opaque-delegation',offsetMs:1200});await drain();
 assert.equal(f.counts().calls,1);assert.equal(f.sent.length,1);assert.match(f.runtime.history(started.id,'owner'),/Start observation/);
 await f.runtime.close(started.id,'owner');
 const restored=new VoiceTransportRuntime({directory:f.directory,ingress:f.ingress});t.after(()=>restored.dispose());
 assert.equal(restored.get(started.id,'owner').delegations[0]?.turnId,'turn-1');assert.throws(()=>restored.get(started.id,'intruder'),/access_denied/);
});
test('voice usage snapshots replace instead of sum, final duration separates estimated voice cost',async t=>{
 const f=setup(t),{id}=await f.runtime.start('conversation','owner','v=0\n');
 for(const seconds of [3,12,12,9])f.emit({type:'usage',seconds,final:false});await drain();
 assert.equal(f.runtime.get(id,'owner').seconds,12);assert.equal(f.runtime.get(id,'owner').estimatedVoiceCostUsd,.012);
 await f.runtime.close(id,'owner');assert.equal(f.runtime.get(id,'owner').seconds,15);assert.equal(f.runtime.get(id,'owner').finalUsage,true);
});
test('stop speech never invokes ingress; abandoned client lease closes voice',async t=>{
 const f=setup(t),{id}=await f.runtime.start('c','owner','v=0\n');assert.equal(f.runtime.stopSpeaking(id,'owner').workCancelled,false);
 assert.deepEqual(f.counts(),{calls:0,stops:1,closes:0});f.advance(21000);await f.runtime.tick();assert.equal(f.counts().closes,1);
});
test('fragments alone never execute and incomplete or repeated delegation requests require clarification',async t=>{
 const f=setup(t),{id}=await f.runtime.start('c','owner','v=0\n');
 f.emit({type:'transcript',fragment:{id:'partial',speaker:'user',text:'delete ',startMs:0,endMs:3000}});
 f.emit({type:'delegation',id:'too-early',offsetMs:1000});await drain();assert.equal(f.counts().calls,0);assert.equal(f.runtime.get(id,'owner').delegations[0]?.state,'FAILED');
});
test('missing credentials, session duplication, malformed offer and restart fail closed independently of text',async t=>{
 const f=setup(t);f.adapter.configured=()=>false;await assert.rejects(()=>f.runtime.start('c','owner','v=0\n'),/unconfigured/);
 f.adapter.configured=()=>true;await assert.rejects(()=>f.runtime.start('c','owner','not-sdp'),/sdp_invalid/);
 const {id}=await f.runtime.start('c','owner','v=0\n');await assert.rejects(()=>f.runtime.start('c','owner','v=0\n'),/already_active/);
 const recovered=new VoiceTransportRuntime({directory:f.directory,ingress:f.ingress});t.after(()=>recovered.dispose());assert.equal(recovered.get(id,'owner').failure?.domain,'controller');assert.equal(recovered.get(id,'owner').finalUsage,false);
});
test('quota is distinct from authentication, access denial, throttling and network failures',()=>{
 assert.equal(liveHttpError(401).domain,'authentication');assert.equal(liveHttpError(403).code,'voice_provider_access_denied');assert.equal(liveHttpError(402).domain,'quota');assert.equal(liveHttpError(429,'insufficient_quota').domain,'quota');assert.equal(liveHttpError(429).code,'voice_provider_rate_limited');assert.equal(liveHttpError(500).domain,'provider');
});
test('exact GPT-Live protocol uses server credential and client delegation, cumulative usage and graceful close',async()=>{
 class Socket extends EventEmitter {readyState=1;sent:any[]=[];send(raw:string){const e=JSON.parse(raw);this.sent.push(e);if(e.type==='session.close')queueMicrotask(()=>this.emit('message',Buffer.from(JSON.stringify({type:'session.closed',usage:{seconds:15}}))));}close(){}terminate(){}}
 const socket=new Socket(),events:VoiceEvent[]=[];let body:any,seenUrl='',headers:any;
 const adapter=new GptLiveTransport({credential:()=> 'test-fixture-credential',fetch:async(url,init)=>{seenUrl=String(url);body=JSON.parse(String(init?.body));headers=init?.headers;return Response.json({session:{id:'opaque/id'},transport:{sdp:'v=0\nanswer'}});},socket:(url,options)=>{assert.match(url,/opaque%2Fid\/attach$/);assert.equal(options.headers.Authorization,'Bearer test-fixture-credential');queueMicrotask(()=>socket.emit('open'));return socket;}});
 const c=await adapter.connect({sdp:'v=0\noffer',history:[],onEvent:e=>events.push(e)});
 assert.equal(seenUrl,'https://api.openai.com/v1/live/sessions');assert.equal(body.session.model,'gpt-live-1');assert.deepEqual(body.session.delegation,{type:'client'});assert.equal(body.session.store,false);assert.equal(headers.Authorization,'Bearer test-fixture-credential');assert.equal(JSON.stringify(c).includes('test-fixture-credential'),false);
 socket.emit('message',Buffer.from(JSON.stringify({type:'session.input_transcript.delta',event_id:'e1',delta:'Start observation',start_ms:0,end_ms:10})));
 socket.emit('message',Buffer.from(JSON.stringify({type:'session.delegation.created',offset_ms:20,delegation:{id:'item_1',target:'client'}})));
 c.send('Review proposal','item_1');c.stopSpeaking();await c.close();assert.equal(events.filter(e=>e.type==='transcript').length,1);assert.equal(events.filter(e=>e.type==='delegation').length,1);assert.ok(events.some(e=>e.type==='usage'&&e.final));assert.equal(socket.sent.some(e=>e.type==='session.start'),false);
});
test('provider response bodies and credentials are never included in classified errors',async()=>{
 for(const status of [401,402,403,429,500]){const adapter=new GptLiveTransport({credential:()=> 'fixture-secret',fetch:async()=>Response.json({error:{message:'fixture-secret'}} ,{status})});await assert.rejects(()=>adapter.connect({sdp:'v=0\n',history:[],onEvent:()=>{}}),e=>e instanceof VoiceError&&!e.message.includes('fixture-secret'));}
});
test('voice HTTP routes require mutation authority, enforce origin, and do not accept client-supplied provider events',async t=>{
 const f=setup(t),service=new AgentControlService({version:1,paused:false,lastRestorePoint:null,lanes:[]},new PtyRegistry(),undefined,'test',()=>{});
 const server=startWebDashboard(service,{host:'127.0.0.1',port:0,operatorToken:'test-token',voiceTransport:f.runtime});await once(server,'listening');t.after(()=>server.close());const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`,headers={Authorization:'Bearer test-token','Content-Type':'application/json'};
 assert.equal((await fetch(base+'/api/voice/availability')).status,401);
 assert.equal((await fetch(base+'/api/voice/sessions',{method:'POST',headers:{...headers,Origin:'https://untrusted.invalid'},body:JSON.stringify({conversationId:'c',sdp:'v=0\n'})})).status,403);
 const response=await fetch(base+'/api/voice/sessions',{method:'POST',headers,body:JSON.stringify({conversationId:'c',sdp:'v=0\n'})});assert.equal(response.status,201);const {id}=await response.json();
 assert.equal((await fetch(base+'/api/voice/sessions/'+id+'/events',{method:'POST',headers,body:JSON.stringify({type:'delegation'})})).status,404);
 assert.equal(f.counts().calls,0);
});

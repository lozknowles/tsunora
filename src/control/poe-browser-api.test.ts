import assert from 'node:assert/strict';
import test from 'node:test';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
import {PoeRuntime,type PoeEvidencePort} from './poe.js';
import type {SpeechProvider,SpeechRecognitionProvider,VoiceIdentity} from './social-voice-providers.js';
import {AgentControlService} from './application-service.js';
import {PtyRegistry} from './pty.js';
import {startWebDashboard} from './web-server.js';

const evidence:PoeEvidencePort={overview:()=>({title:'Status',summary:'Three jobs await approval.',facts:[],related:[]}),resolve:()=>({title:'Record',summary:'Unavailable',facts:[],related:[],unavailable:'No record'})};
const voice:VoiceIdentity={id:'original-test-voice',kind:'designed',provider:'fixture',modelRevision:'fixture-v1',instruction:'Original test voice',seed:1};
const metrics={provider:'fixture',host:'fixture',model:'fixture',elapsedMs:1,audioSeconds:1,rtf:1,firstAudioMs:1,memoryBytes:null};
function setup(){
  const wav=Buffer.alloc(44);wav.write('RIFF');wav.write('WAVE',8);
  let spoken='',mismatch=false;
  const recognition:SpeechRecognitionProvider={id:'fixture-stt',capabilities:()=>({transcribe:true,languages:['en']}),health:async()=>({state:'ready',checkedAt:new Date().toISOString()}),transcribe:async()=>({text:mismatch?'No jobs await approval.':spoken||'What is waiting?',confidence:1,metrics})};
  const speech:SpeechProvider={id:'fixture-tts',capabilities:()=>({synthesize:true,design:true,clone:false,streaming:false}),health:recognition.health,voices:async()=>[voice],synthesize:async input=>{spoken=input.text;return {bytes:wav,mime:'audio/wav',metrics};}};
  const poe=new PoeRuntime({evidence,speech,recognition,voice}),conversation=poe.createConversation({actorId:'web-operator',channel:'dashboard'});
  return {poe,conversation,wav,speech,recognition,setMismatch:()=>{mismatch=true}};
}
test('browser speech uses the original voice, validates content and preserves the text turn',async()=>{
  const f=setup(),answer=await f.poe.ask({conversationId:f.conversation.id,text:'What is waiting?'}),speech=await f.poe.speechForTurn(f.conversation.id,answer.turn.id,'web-operator');
  assert.equal(speech.spokenText,'Status. Three jobs await approval.');assert.equal(speech.sha256.length,64);assert.equal(f.poe.conversation(f.conversation.id).turns.length,2);assert.equal(f.poe.projection().voice.identity,voice.id);
  await assert.rejects(()=>f.poe.speechForTurn(f.conversation.id,answer.turn.id,'other'),/actor_mismatch/);
});
test('mismatched browser audio fails closed while captions and text remain available',async()=>{
  const f=setup(),answer=await f.poe.ask({conversationId:f.conversation.id,text:'What is waiting?'});f.setMismatch();
  await assert.rejects(()=>f.poe.speechForTurn(f.conversation.id,answer.turn.id,'web-operator'),/validation_failed/);assert.equal(f.poe.conversation(f.conversation.id).state,'FAILED');assert.match(f.poe.transcript(f.conversation.id),/Three jobs/);
});
test('browser transcription remains untrusted and independently visible before synthesis',async()=>{
  const f=setup(),result=await f.poe.transcribeTurn(f.conversation.id,f.wav,'audio/wav','web-operator');
  assert.equal(result.operatorTurn.text,'What is waiting?');assert.equal(result.operatorTurn.modality,'voice');assert.equal(result.operatorTurn.contentTrust,'UNTRUSTED_DATA');assert.equal(result.operatorTurn.channel,'dashboard');assert.equal(result.conversation.speaking,undefined);
});
test('barge-in aborts in-flight browser synthesis without cancelling work',async()=>{
  const f=setup();let started:()=>void=()=>{};const ready=new Promise<void>(resolve=>{started=resolve});
  f.speech.synthesize=input=>new Promise((_resolve,reject)=>{input.signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true});started()});
  const answer=await f.poe.ask({conversationId:f.conversation.id,text:'Status'}),pending=f.poe.speechForTurn(f.conversation.id,answer.turn.id,'web-operator');await ready;
  assert.equal(f.poe.conversation(f.conversation.id).state,'THINKING');const result=f.poe.bargeIn(f.conversation.id,'web-operator',answer.turn.id);assert.equal(result.interrupted,true);assert.equal(result.workParcelCancelled,false);await assert.rejects(pending,/interrupted/);
});
test('new browser endpoints require authentication and reject cross-channel access',async t=>{
  const f=setup(),foreign=f.poe.createConversation({actorId:'social-operator',channel:'whatsapp'}),service=new AgentControlService({version:1,paused:false,lastRestorePoint:null,lanes:[]},new PtyRegistry(),undefined,'test',()=>{}).configureProjection({poe:f.poe});
  const server=startWebDashboard(service,{host:'127.0.0.1',port:0,operatorToken:'test-token'});await once(server,'listening');t.after(()=>server.close());const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  assert.equal((await fetch(`${base}/api/poe/conversations/${f.conversation.id}/operator`)).status,401);
  const headers={Authorization:'Bearer test-token','Content-Type':'application/json'};
  assert.equal((await fetch(`${base}/api/poe/conversations/${foreign.id}`,{headers})).status,403);
  assert.equal((await fetch(`${base}/api/poe/conversations`,{method:'POST',headers,body:JSON.stringify({channel:'whatsapp'})})).status,403);
  const projection=await(await fetch(`${base}/api/poe`,{headers})).json();assert.equal(projection.conversations.length,1);assert.equal(projection.conversations[0].channel,'dashboard');
  const response=await fetch(base);assert.match(response.headers.get('content-security-policy')??'',/media-src 'self' blob:/);assert.match(response.headers.get('content-security-policy')??'',/script-src 'self';/);
});

test('authenticated greeting is brief and idempotent per conversation and keeps spoken provenance',async()=>{
 const f=setup(),first=f.poe.greeting(f.conversation.id,'web-operator'),second=f.poe.greeting(f.conversation.id,'web-operator');assert.equal(first.turn.id,second.turn.id);assert.equal(first.turn.text,'Good day. I’m Mallow. How can I help?');assert.equal(f.poe.conversation(f.conversation.id).turns.length,1);assert.throws(()=>f.poe.greeting(f.conversation.id,'other'),/actor_mismatch/);await f.poe.speechForTurn(f.conversation.id,first.turn.id,'web-operator');assert.match(f.poe.transcript(f.conversation.id),/Voice: original-test-voice/);const next=f.poe.createConversation({actorId:'web-operator',channel:'dashboard'});assert.notEqual(f.poe.greeting(next.id,'web-operator').turn.id,first.turn.id);
});

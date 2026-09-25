import assert from 'node:assert/strict';
import test from 'node:test';
import {PrivateSpeechProvider} from './speech-http-provider.js';
const voice={id:'test',kind:'designed' as const,provider:'test',modelRevision:'pinned',instruction:'synthetic',seed:1};
const wav=Buffer.alloc(44);wav.write('RIFF');wav.write('WAVE',8);
const metrics={provider:'test',host:'fixture',model:'pinned',elapsedMs:1,audioSeconds:1,rtf:0.001,firstAudioMs:1,memoryBytes:null};
test('private speech edge rejects remote destinations and voice substitutions',async()=>{
 assert.throws(()=>new PrivateSpeechProvider('test','http://example.com','x'.repeat(32),voice));
 const p=new PrivateSpeechProvider('test','http://127.0.0.1:1','x'.repeat(32),voice);
 await assert.rejects(()=>p.synthesize({text:'safe',voice:{...voice,seed:2},signal:AbortSignal.timeout(100)}),/not_approved/);
});
test('private speech edge bounds response bytes and rejects malformed provider telemetry',async()=>{
 for(const payload of [{text:'status',metrics:{...metrics,elapsedMs:-1}},{text:'status',metrics:null}]){
 const p=new PrivateSpeechProvider('test','http://127.0.0.1:1','x'.repeat(32),voice,async()=>Response.json(payload));
 await assert.rejects(()=>p.transcribe({bytes:wav,mime:'audio/wav',signal:AbortSignal.timeout(100)}),/metrics_invalid/);
 }
 const p=new PrivateSpeechProvider('test','http://127.0.0.1:1','x'.repeat(32),voice,async()=>new Response('{}',{headers:{'content-length':String(17*1024*1024)}}));
 await assert.rejects(()=>p.transcribe({bytes:wav,mime:'audio/wav',signal:AbortSignal.timeout(100)}),/too_large/);
});
test('private speech provider preserves measured telemetry and unavailable health',async()=>{
 const p=new PrivateSpeechProvider('test','http://127.0.0.1:1','x'.repeat(32),voice,async()=>Response.json({audio:wav.toString('base64'),mime:'audio/wav',metrics}));
 assert.deepEqual((await p.synthesize({text:'safe',voice,signal:AbortSignal.timeout(100)})).metrics,metrics);
 const unavailable=new PrivateSpeechProvider('test','http://127.0.0.1:1','x'.repeat(32),voice,async()=>{throw new Error('offline')});
 assert.equal((await unavailable.health()).state,'unavailable');
});

import {randomUUID} from 'node:crypto';
import {SharedSpeechClient} from '../vendor/shared-speech/client.mjs';
import {validateAudio} from './social-voice-providers.js';
export interface SharedSpeechEvent {type:string;speech_session_id?:string;generation_id?:string|number;provider?:string;audio?:string;mime?:string;[key:string]:unknown;}
/** Thin application edge. SDK owns remote sessions, provider fallback and generation fencing. */
export class SharedSpeechAdapter {
 private active=new Map<string,{id?:string;controller:AbortController}>();
 constructor(private client:SharedSpeechClient,readonly fallback:'none'|'standard'='none'){}
 isActive(conversationId:string){return this.active.has(conversationId);}
 async health(){return this.client.health();}
 async capabilities(){return (await this.client.call('/v2/capabilities')).json();}
 async cancel(conversationId:string){const r=this.active.get(conversationId);if(!r)return;this.active.delete(conversationId);r.controller.abort();if(r.id)await this.client.cancel(r.id);}
 private async begin(conversationId:string,requestId:string){const cancelling=this.cancel(conversationId);const record:{id?:string;controller:AbortController}={controller:new AbortController()};this.active.set(conversationId,record);let s;try{await cancelling;record.controller.signal.throwIfAborted();s=await this.client.session({application:'agent-control',conversation_id:conversationId,request_id:requestId});}catch(error){if(this.active.get(conversationId)===record)this.active.delete(conversationId);throw error;}record.id=s.speech_session_id;if(record.controller.signal.aborted||this.active.get(conversationId)!==record){await this.client.close(record.id!);throw Error('poe_speech_interrupted');}return record;}
 private async end(conversationId:string,r:{id?:string;controller:AbortController}){if(this.active.get(conversationId)===r)this.active.delete(conversationId);if(r.id)await this.client.close(r.id).catch(()=>{});}
 async transcribe(conversationId:string,bytes:Uint8Array,mime:string){validateAudio(bytes,mime);const requestId=randomUUID(),r=await this.begin(conversationId,requestId);try{const result=await this.client.transcribe(r.id!,bytes,{mime,signal:AbortSignal.any([r.controller.signal,AbortSignal.timeout(75000)])});r.controller.signal.throwIfAborted();if(result.type!=='stt.final'||typeof result.text!=='string'||!result.text.trim()||result.text.length>12000||result.speech_session_id!==r.id)throw Error('shared_speech_transcript_invalid');return {text:result.text,provenance:{requestId,clientId:result.client_id,sessionId:r.id!,generationId:result.generation_id,provider:result.provider??result.metrics?.provider??null,model:result.model??result.metrics?.model??null,metrics:result.metrics??null,serviceElapsedMs:result.serviceElapsedMs??null}};}finally{await this.end(conversationId,r);}}
 async *speak(conversationId:string,turnId:string,text:string):AsyncGenerator<SharedSpeechEvent>{
  if(!text.trim()||text.length>32000)throw Error('shared_speech_text_limit');const r=await this.begin(conversationId,turnId);
  try{for(let start=0;start<text.length;){let end=Math.min(start+1200,text.length);if(end<text.length){const boundary=text.lastIndexOf(' ',end);if(boundary>start)end=boundary+1;}const part=text.slice(start,end);start=end;let finished=false;
   for await(const event of this.client.speak(r.id!,part,'mallow',{fallback:this.fallback})){r.controller.signal.throwIfAborted();if(event.type==='speech.failed')throw Error('shared_speech_generation_failed');if(event.type==='speech.finished')finished=true;yield event;}
   r.controller.signal.throwIfAborted();if(!finished)throw Error('shared_speech_incomplete');
  }}finally{await this.end(conversationId,r);}
 }
}

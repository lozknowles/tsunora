/** Backend SDK: keep tokens on the backend; browsers use their application's proxy. */
export class SharedSpeechClient {
 constructor({url,token,request=fetch}){const endpoint=new URL(url);if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash||(endpoint.protocol!=='https:'&&!(endpoint.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname))))throw Error('speech_endpoint_invalid');this.url=url.replace(/\/$/,'');this.token=token;this.request=request;this.active=new Map();}
 async call(path,method='GET',body,signal){const r=await this.request(this.url+path,{method,headers:{authorization:'Bearer '+this.token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:signal??AbortSignal.timeout(45000),redirect:'error'});if(!r.ok)throw Error('shared_speech_request_failed_'+r.status);return r;}
 async transcribe(id,audio,{mime='audio/wav',signal=AbortSignal.timeout(75000)}={}){const r=await this.request(this.url+'/v2/sessions/'+id+'/transcribe',{method:'POST',headers:{authorization:'Bearer '+this.token,'content-type':mime},body:audio,signal,redirect:'error'});if(!r.ok)throw Error('shared_speech_request_failed_'+r.status);return r.json();}
 async health(){return (await this.call('/v2/health')).json();}
 async session(correlation={}){return (await this.call('/v2/sessions','POST',correlation)).json();}
 async cancel(id){const active=this.active.get(id);this.active.delete(id);active?.controller.abort();return (await this.call('/v2/sessions/'+id+'/cancel','POST',{generation_id:active?.generation})).json();}
 async close(id){this.active.get(id)?.controller.abort();this.active.delete(id);await this.call('/v2/sessions/'+id,'DELETE');}
 async *speak(id,text,voice='standard',{fallback='none'}={}){
  this.active.get(id)?.controller.abort();const record={controller:new AbortController(),generation:null};this.active.set(id,record);
  try{const r=await this.call('/v2/sessions/'+id+'/speak','POST',{text,voice,fallback},AbortSignal.any([record.controller.signal,AbortSignal.timeout(120000)]));let buffer='';const decoder=new TextDecoder();
   for await(const bytes of r.body){buffer+=decoder.decode(bytes,{stream:true});if(buffer.length>4*1024*1024)throw Error('speech_event_too_large');let end;
    while((end=buffer.indexOf('\n\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+2);if(!line.startsWith('data: '))continue;const event=JSON.parse(line.slice(6));if(this.active.get(id)!==record||record.controller.signal.aborted)return;if(event.type==='speech.started')record.generation=event.generation_id;if(event.generation_id!==record.generation||event.speech_session_id!==id)continue;yield event;}
   }
  }finally{if(this.active.get(id)===record)this.active.delete(id);}
 }
}

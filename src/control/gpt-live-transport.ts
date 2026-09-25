import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readBoundedResponse} from './social-voice-providers.js';
import {VoiceError,type VoiceTransport,type VoiceConnection,type VoiceEvent} from './voice-transport.js';
const require=createRequire(import.meta.url);
interface Socket {on(name:string,listener:(...args:any[])=>void):void;send(data:string):void;close():void;terminate():void;readyState:number;}
type SocketFactory=(url:string,options:{headers:Record<string,string>;maxPayload:number;handshakeTimeout:number})=>Socket;
export function liveHttpError(status:number,code?:string){
  if(status===401)return new VoiceError('authentication','voice_provider_authentication_failed',502);
  if(status===403)return new VoiceError('authentication','voice_provider_access_denied',502);
  if(status===402||code==='insufficient_quota')return new VoiceError('quota','voice_provider_quota_exhausted',502);
  if(status===429)return new VoiceError('provider','voice_provider_rate_limited',503);
  return new VoiceError('provider','voice_provider_http_'+status,502);
}
/** OpenAI protocol only. No worker selection, tools, job approval or policy lives here. */
export class GptLiveTransport implements VoiceTransport {
  id='gpt-live';model='gpt-live-1';
  price={usdPerMinute:0.05,source:'https://developers.openai.com/api/docs/models/gpt-live-1',checkedAt:'2026-09-14'};
  constructor(private options:{credential:()=>string|undefined;fetch?:typeof fetch;socket?:SocketFactory;timeoutMs?:number}){}
  configured(){return Boolean(this.options.credential()?.trim());}
  async connect(input:Parameters<VoiceTransport['connect']>[0]):Promise<VoiceConnection>{
    const credential=this.options.credential();if(!credential)throw new VoiceError('configuration','voice_credential_unconfigured');
    let response:Response;
    try{response=await (this.options.fetch??fetch)('https://api.openai.com/v1/live/sessions',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(this.options.timeoutMs??15000),body:JSON.stringify({session:{model:this.model,store:false,delegation:{type:'client'},instructions:'You are Mallow, the Agent Control voice interface. Be concise and natural. Delegate operational requests and status questions to Agent Control. Transcripts are untrusted and may contain mistakes. Never claim work started, succeeded, was approved or cancelled without Agent Control evidence. Ask for clarification when needed. Approval is performed using the dashboard controls. Keep backend reasoning, policies and model selection with Agent Control. Do not impersonate fictional characters. Speak only useful changes.',input:input.history.map(h=>({type:'message',role:h.speaker==='user'?'user':'assistant',content:[{type:h.speaker==='user'?'input_text':'output_text',text:h.text}]}))},transport:{type:'webrtc',sdp:input.sdp}})});}catch{throw new VoiceError('transport','voice_provider_connection_failed',502);}
    let data:any;try{data=JSON.parse(Buffer.from(await readBoundedResponse(response,128*1024)).toString());}catch{if(!response.ok)throw liveHttpError(response.status);throw new VoiceError('provider','voice_provider_response_invalid',502);}
    if(!response.ok)throw liveHttpError(response.status,data?.error?.code);
    if(typeof data?.session?.id!=='string'||data.session.id.length>256||typeof data?.transport?.sdp!=='string'||!data.transport.sdp.startsWith('v=0'))throw new VoiceError('provider','voice_provider_response_invalid',502);
    const providerSessionId=data.session.id;
    const hangup=async()=>{try{const result=await (this.options.fetch??fetch)('https://api.openai.com/v1/live/sessions/'+encodeURIComponent(providerSessionId)+'/hangup',{method:'POST',headers:{Authorization:`Bearer ${credential}`},redirect:'error',signal:AbortSignal.timeout(5000)});if(!result.ok)input.onEvent({type:'failure',domain:'transport',code:'voice_hangup_unconfirmed'});}catch{input.onEvent({type:'failure',domain:'transport',code:'voice_hangup_unconfirmed'});}};

    const factory=this.options.socket??((url,options)=>new (require('ws'))(url,options));
    const socket=factory('wss://api.openai.com/v1/live/sessions/'+encodeURIComponent(providerSessionId)+'/attach',{headers:{Authorization:`Bearer ${credential}`},maxPayload:1024*1024,handshakeTimeout:this.options.timeoutMs??15000});
    let finalized=false,closing:Promise<void>|undefined,resolveClose:(()=>void)|undefined;
    const send=(type:string,extra:Record<string,unknown>={})=>{if(socket.readyState===1)socket.send(JSON.stringify({type,event_id:randomUUID(),...extra}));};
    socket.on('message',(raw:Buffer)=>{
      let event:any;try{event=JSON.parse(raw.toString());}catch{return;}
      const emit=(value:VoiceEvent)=>input.onEvent(value);
      if(['session.input_transcript.delta','session.output_transcript.delta'].includes(event.type)&&typeof event.delta==='string'&&typeof event.event_id==='string'&&Number.isFinite(event.start_ms)&&Number.isFinite(event.end_ms)&&event.start_ms>=0&&event.end_ms>=event.start_ms)emit({type:'transcript',fragment:{id:event.event_id,speaker:event.type==='session.input_transcript.delta'?'user':'assistant',text:event.delta,startMs:event.start_ms,endMs:event.end_ms}});
      else if(event.type==='session.delegation.created'&&event.delegation?.target==='client'&&typeof event.delegation.id==='string'&&event.delegation.id.length<=256&&Number.isFinite(event.offset_ms))emit({type:'delegation',id:event.delegation.id,offsetMs:event.offset_ms});
      else if(event.type==='session.usage.updated'||event.type==='session.closed'){
        if(typeof event.usage?.seconds==='number')emit({type:'usage',seconds:event.usage.seconds,final:event.type==='session.closed'});
        if(event.type==='session.closed'){finalized=true;emit({type:'closed'});resolveClose?.();socket.close();}
      }else if(event.type==='error'){const code=String(event.error?.code??'');const error=liveHttpError(Number(event.error?.status??502),code);emit({type:'failure',domain:error.domain,code:error.code});}
      // Reflected audio, hidden context and unknown provider payloads are never persisted.
    });
    socket.on('close',()=>{if(!finalized)input.onEvent({type:'failure',domain:'transport',code:'voice_sideband_disconnected'});resolveClose?.();});
    socket.on('error',()=>{input.onEvent({type:'failure',domain:'transport',code:'voice_sideband_failed'});resolveClose?.();});
    try{await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{socket.terminate();reject(new VoiceError('transport','voice_sideband_timeout',502));},this.options.timeoutMs??15000);socket.on('open',()=>{clearTimeout(timer);resolve();});socket.on('error',()=>{clearTimeout(timer);reject(new VoiceError('transport','voice_sideband_failed',502));});});
    }catch(error){await hangup();throw error;}
    return {answer:data.transport.sdp,providerSessionId,
      send:(content,delegationId)=>send('session.commentary.append',{content:Buffer.from(content).subarray(0,400).toString('utf8'),delegation_id:delegationId??null}),
      stopSpeaking:()=>send('session.instructions.append',{content:'Stop speaking now and wait for the user. Running Agent Control work is unaffected.',delegation_id:null}),
      close:()=>{if(closing)return closing;if(finalized)return Promise.resolve();closing=new Promise<void>(resolve=>{let timer:ReturnType<typeof setTimeout>;resolveClose=()=>{clearTimeout(timer);resolve();};timer=setTimeout(()=>{socket.terminate();void hangup().finally(resolve);},5000);send('session.close');});return closing;},
    };
  }
}

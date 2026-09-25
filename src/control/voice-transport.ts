import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {redactSensitiveText} from './security-redaction.js';

export type VoiceFailureDomain = 'configuration'|'authentication'|'quota'|'transport'|'provider'|'governance'|'controller';
export class VoiceError extends Error {
  constructor(public domain:VoiceFailureDomain, public code:string, public status=503) {super(code);}
}
export interface VoiceFragment {id:string; speaker:'user'|'assistant'; text:string; startMs:number; endMs:number;}
export type VoiceEvent = {type:'transcript';fragment:VoiceFragment}|{type:'delegation';id:string;offsetMs:number}|{type:'usage';seconds:number;final:boolean}|{type:'closed'}|{type:'failure';domain:VoiceFailureDomain;code:string};
export interface VoiceConnection {answer:string; providerSessionId:string; send(text:string,delegationId?:string):void; stopSpeaking():void; close():Promise<void>;}
export interface VoiceTransport {
  id:string; model:string; configured():boolean;
  price:{usdPerMinute:number;source:string;checkedAt:string}|null;
  connect(input:{sdp:string;history:Array<{speaker:'user'|'assistant';text:string}>;onEvent:(event:VoiceEvent)=>void}):Promise<VoiceConnection>;
}
export interface VoiceIngress {
  history(conversationId:string,actor:string):Array<{speaker:'user'|'assistant';text:string}>;
  request(conversationId:string,actor:string,text:string,reference:{sessionId:string;delegationId:string}):Promise<{text:string;turnId:string}>;
  updates(conversationId:string,actor:string):Promise<Array<{id:string;text:string}>>;
}
export interface VoiceRecord {
  id:string;conversationId:string;actor:string;transport:string;model:string;providerSessionId?:string;
  state:'CONNECTING'|'ACTIVE'|'CLOSING'|'CLOSED'|'INTERRUPTED'|'FAILED';createdAt:string;updatedAt:string;
  seconds:number|null;finalUsage:boolean;estimatedVoiceCostUsd:number|null;price:VoiceTransport['price'];
  fragments:VoiceFragment[];delegations:Array<{id:string;offsetMs:number;state:'ACCEPTED'|'ANSWERED'|'FAILED';request:string;answer?:string;turnId?:string}>;
  failure?:{domain:VoiceFailureDomain;code:string};
}
const terminal=(state:VoiceRecord['state'])=>['CLOSED','INTERRUPTED','FAILED'].includes(state);
/** Owns identity, bounds, transcript history and ingress. Adapters cannot approve or route work. */
export class VoiceTransportRuntime {
  private records=new Map<string,VoiceRecord>();
  private connections=new Map<string,VoiceConnection>();
  private leases=new Map<string,number>();
  private seenUpdates=new Map<string,Set<string>>();
  private timer:ReturnType<typeof setInterval>;
  private reconciling=false;
  constructor(private options:{directory:string;adapter?:VoiceTransport;ingress:VoiceIngress;clock?:()=>number;maxSessionSeconds?:number;onChange?:(record:VoiceRecord)=>void}) {
    fs.mkdirSync(options.directory,{recursive:true,mode:0o700});
    for(const file of fs.readdirSync(options.directory).filter(x=>/^voice-[a-f0-9-]+\.json$/.test(x))) {
      const record=JSON.parse(fs.readFileSync(path.join(options.directory,file),'utf8')) as VoiceRecord;
      this.records.set(record.id,record);
      if(!terminal(record.state)){record.state='INTERRUPTED';record.finalUsage=false;record.failure={domain:'controller',code:'controller_restarted'};this.save(record);}
    }
    this.timer=setInterval(()=>void this.tick(),2000);this.timer.unref();
  }
  private now(){return (this.options.clock??Date.now)();}
  private save(record:VoiceRecord){record.updatedAt=new Date(this.now()).toISOString();const target=path.join(this.options.directory,record.id+'.json');fs.writeFileSync(target+'.tmp',JSON.stringify(record,null,2),{mode:0o600});fs.renameSync(target+'.tmp',target);this.options.onChange?.(structuredClone(record));}
  availability(){const a=this.options.adapter;return {default:a?.configured()?a.id:'existing-voice-or-text',transport:a?.id??null,model:a?.model??null,state:a?.configured()?'CONFIGURED_NOT_QUALIFIED':'CONFIGURATION_REQUIRED',price:a?.price??null,maxSessionSeconds:this.options.maxSessionSeconds??300,textAvailable:true};}
  list(conversationId:string,actor:string){this.options.ingress.history(conversationId,actor);return [...this.records.values()].filter(r=>r.conversationId===conversationId&&r.actor===actor).map(r=>structuredClone(r));}
  get(id:string,actor:string){const record=this.records.get(id);if(!record||record.actor!==actor)throw new VoiceError('authentication','voice_session_access_denied',403);return structuredClone(record);}
  async start(conversationId:string,actor:string,sdp:string){
    const history=this.options.ingress.history(conversationId,actor),adapter=this.options.adapter;
    if(!adapter?.configured())throw new VoiceError('configuration','voice_transport_unconfigured');
    if(typeof sdp!=='string'||!sdp.startsWith('v=0')||Buffer.byteLength(sdp)>60000)throw new VoiceError('transport','voice_sdp_invalid',400);
    if([...this.records.values()].some(r=>r.actor===actor&&!terminal(r.state)))throw new VoiceError('governance','voice_session_already_active',409);
    const at=new Date(this.now()).toISOString(),record:VoiceRecord={id:'voice-'+randomUUID(),conversationId,actor,transport:adapter.id,model:adapter.model,state:'CONNECTING',createdAt:at,updatedAt:at,seconds:null,finalUsage:false,estimatedVoiceCostUsd:null,price:adapter.price,fragments:[],delegations:[]};
    this.records.set(record.id,record);this.leases.set(record.id,this.now());this.save(record);
    let pendingEvents=0;let releaseEvents:()=>void=()=>{};let chain=new Promise<void>(resolve=>{releaseEvents=resolve});
    try{
      const connection=await adapter.connect({sdp,history:history.slice(-12).map(h=>({...h,text:redactSensitiveText(h.text).slice(0,1000)})),onEvent:event=>{if(++pendingEvents>200){pendingEvents--;this.fail(record,'governance','voice_event_queue_limit');return;}chain=chain.then(()=>this.accept(record,event)).catch(()=>this.fail(record,'controller','voice_event_processing_failed')).finally(()=>{pendingEvents--;});}});
      this.connections.set(record.id,connection);record.providerSessionId=connection.providerSessionId;releaseEvents();
      if(terminal(record.state)){await connection.close();this.connections.delete(record.id);throw new VoiceError('transport','voice_start_interrupted');}
      record.state='ACTIVE';this.seenUpdates.set(record.id,new Set((await this.options.ingress.updates(conversationId,actor)).map(u=>u.id)));this.save(record);
      return {id:record.id,sdp:connection.answer,record:this.get(record.id,actor)};
    }catch(error){releaseEvents();const failure=error instanceof VoiceError?error:new VoiceError('transport','voice_connection_failed');this.fail(record,failure.domain,failure.code);throw failure;}
  }
  heartbeat(id:string,actor:string){const record=this.get(id,actor);if(!terminal(record.state))this.leases.set(id,this.now());return record;}
  stopSpeaking(id:string,actor:string){this.get(id,actor);this.connections.get(id)?.stopSpeaking();return {speechStopped:true,workCancelled:false};}
  async close(id:string,actor:string){const copy=this.get(id,actor),record=this.records.get(copy.id)!;if(terminal(record.state))return copy;record.state='CLOSING';this.save(record);await this.connections.get(id)?.close();if(record.state==='CLOSING'){record.state='INTERRUPTED';record.finalUsage=false;record.failure={domain:'transport',code:'voice_final_usage_unconfirmed'};this.save(record);}this.connections.delete(id);this.leases.delete(id);return this.get(id,actor);}
  private fail(record:VoiceRecord,domain:VoiceFailureDomain,code:string){record.state='FAILED';record.failure={domain,code};record.finalUsage=false;this.save(record);void this.connections.get(record.id)?.close();}
  private async accept(record:VoiceRecord,event:VoiceEvent){
    if(event.type==='usage'){
      if(!Number.isFinite(event.seconds)||event.seconds<0)return;
      if(record.seconds!==null&&event.seconds<record.seconds)return;
      record.seconds=event.seconds;record.finalUsage=event.final;
      record.estimatedVoiceCostUsd=record.price?Number((event.seconds*record.price.usdPerMinute/60).toFixed(8)):null;this.save(record);return;
    }
    if(event.type==='closed'){if(!terminal(record.state))record.state='CLOSED';this.save(record);this.connections.delete(record.id);this.leases.delete(record.id);return;}
    if(terminal(record.state)||record.state==='CLOSING')return;
    if(event.type==='failure'){this.fail(record,event.domain,event.code);return;}
    if(event.type==='transcript'){
      const f=event.fragment;
      if(record.fragments.some(old=>old.id===f.id))return;
      if(record.fragments.length>=1500||f.text.length>8000){this.fail(record,'governance','voice_transcript_limit');return;}
      record.fragments.push({...f,text:redactSensitiveText(f.text)});this.save(record);return;
    }
    if(record.delegations.some(d=>d.id===event.id))return;
    if(record.delegations.length>=30){this.fail(record,'governance','voice_request_limit');return;}
    const previous=record.delegations.at(-1)?.offsetMs??-1;
    const request=record.fragments.filter(f=>f.speaker==='user'&&f.endMs>previous&&f.endMs<=event.offsetMs).map(f=>f.text).join('').trim();
    const delegation:VoiceRecord['delegations'][number]={id:event.id,offsetMs:event.offsetMs,state:'ACCEPTED',request};record.delegations.push(delegation);this.save(record);
    try{
      if(!request||request.length>8000)throw new VoiceError('governance','voice_request_requires_clarification',409);
      const answer=await this.options.ingress.request(record.conversationId,record.actor,request,{sessionId:record.id,delegationId:event.id});
      delegation.state='ANSWERED';delegation.answer=redactSensitiveText(answer.text);delegation.turnId=answer.turnId;this.save(record);
      this.connections.get(record.id)?.send(delegation.answer.slice(0,700),event.id);
    }catch(error){delegation.state='FAILED';delegation.answer=error instanceof VoiceError?error.code:'Agent Control could not process the request. Inspect the dashboard; no approval was inferred.';this.save(record);this.connections.get(record.id)?.send(delegation.answer,event.id);}
  }
  async tick(){if(this.reconciling)return;this.reconciling=true;try{for(const record of this.records.values()){
    if(record.state!=='ACTIVE')continue;
    if(this.now()-(this.leases.get(record.id)??0)>20000||this.now()-Date.parse(record.createdAt)>(this.options.maxSessionSeconds??300)*1000){await this.close(record.id,record.actor);continue;}
    const seen=this.seenUpdates.get(record.id)??new Set<string>();
    try{for(const update of await this.options.ingress.updates(record.conversationId,record.actor)){if(seen.has(update.id))continue;seen.add(update.id);this.connections.get(record.id)?.send(redactSensitiveText(update.text).slice(0,700));}this.seenUpdates.set(record.id,seen);}catch{this.fail(record,'controller','voice_progress_unavailable');}
  }}finally{this.reconciling=false;}}
  history(id:string,actor:string){const r=this.get(id,actor);return ['# Mallow voice session',`Session: ${r.id}`,`Conversation: ${r.conversationId}`,`Started: ${r.createdAt}`,`State: ${r.state}`,`Transport: ${r.transport} / ${r.model}`,`Provider-reported duration: ${r.seconds??'unknown'} seconds (${r.finalUsage?'final':'not final'})`,`Calculated voice cost: ${r.estimatedVoiceCostUsd===null?'unknown':r.estimatedVoiceCostUsd+' USD'}; not a provider invoice.`,`Worker cost and tokens: see linked job history; not included in voice cost.`,`Pricing: ${r.price?.source??'unknown'}`,'','## Transcript (redacted, provider fragments; speech delivery not established)',...r.fragments.map(f=>`[${f.startMs}–${f.endMs} ms] ${f.speaker}: ${f.text}`),'','## Governed ingress',...r.delegations.map(d=>`### ${d.id} — ${d.state}\nRequest: ${d.request}\nResult: ${d.answer??'pending'}\nConversation turn: ${d.turnId??'unavailable'}`)].join('\n\n');}
  async dispose(){clearInterval(this.timer);await Promise.all([...this.records.values()].filter(r=>!terminal(r.state)).map(r=>this.close(r.id,r.actor)));}
}

import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import type {SocialChannelProvider, SocialIdentity, SocialMessage, SpeechProvider, SpeechRecognitionProvider, VoiceIdentity} from './social-voice-providers.js';
import {validateAudio} from './social-voice-providers.js';
import {governedRequestOrigin, type GovernedRequestOrigin} from './request-origin.js';

export interface SocialPrincipal {actor: string; templates: string[]; approve: boolean;}
export interface SocialExecutionPort {
  principal(identity: SocialIdentity): SocialPrincipal | undefined;
  start(template: string, actor: string, requestKey: string, request: {prompt: string; origin: GovernedRequestOrigin}): {id: string};
  observe(parcelId: string): {status: string; text: string; runId?: string; model?: string; node?: string; durationMs?: number};
  stop(parcelId: string, actor: string): void;
  overview(kind: 'status'|'models'|'nodes'|'health', actor: string): string;
  approvalSnapshot(parcelId: string, runId: string, action: string): string;
  decide(parcelId: string, runId: string, action: string, approved: boolean, actor: string): void;
}
export interface PoeSocialPort {
  ask(input: {actor: string; identityReference: string; text: string; modality: 'text' | 'voice'}): Promise<{conversationId: string; turnId?: string; text: string}> | {conversationId: string; turnId?: string; text: string};
  interrupt?(input: {actor: string; identityReference: string; conversationId: string; turnId: string}): Promise<{interrupted: boolean}> | {interrupted: boolean};
}
import {prepareSpokenText, spokenJobSummary, speechContentCoverage} from './speech-text.js';
export {prepareSpokenText, spokenJobSummary} from './speech-text.js';

type Row = Record<string, any>;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const terminal=(status:string)=>['SUCCEEDED','FAILED','CANCELLED','DEGRADED'].includes(status);
const who=(identity:SocialIdentity)=>hash(JSON.stringify(identity));
function normalizeSpokenPoeInvocation(text:string) {
  return text
    .replace(/^((?:(?:sorry|excuse me)[, ]+)?(?:let me |to )?interrupt[, ]+)(?:po|pose)(?=[,.!?: ])/i,'$1POE')
    .replace(/^(ask\s+)(?:po|pose)(?=[, :])/i,'$1POE')
    .replace(/^(?:po|pose)(?=[, :])/i,'POE');
}
export class SocialVoiceCoordinator {
  readonly db: DatabaseSync;
  private busy=false;
  private checkedAt=0;
  private providerHealth:unknown={social:'unchecked',speech:'unchecked',recognition:'unchecked'};
  constructor(file:string, readonly provider:SocialChannelProvider, readonly execution:SocialExecutionPort, private readonly speech?:SpeechProvider, private readonly recognition?:SpeechRecognitionProvider, private readonly voice?:VoiceIdentity, private readonly clock=Date.now, private readonly onEvent?:(event:string)=>void, private readonly poe?:PoeSocialPort) {
    fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});this.db=new DatabaseSync(file);fs.chmodSync(file,0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS inbox(key TEXT PRIMARY KEY,identity TEXT NOT NULL,message TEXT NOT NULL,state TEXT NOT NULL,at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(number INTEGER PRIMARY KEY AUTOINCREMENT,key TEXT UNIQUE NOT NULL,identity TEXT NOT NULL,parcel TEXT,voice INTEGER NOT NULL DEFAULT 0,status TEXT);
      CREATE TABLE IF NOT EXISTS approvals(number INTEGER PRIMARY KEY AUTOINCREMENT,identity TEXT NOT NULL,parcel TEXT NOT NULL,run TEXT NOT NULL,action TEXT NOT NULL,snapshot TEXT NOT NULL,expires INTEGER NOT NULL,state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER NOT NULL,event TEXT NOT NULL,identity TEXT NOT NULL,detail TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS spoken(key TEXT PRIMARY KEY,state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS poe_playback(identity TEXT PRIMARY KEY,conversation TEXT NOT NULL,turn TEXT NOT NULL,state TEXT NOT NULL,queuedAt INTEGER NOT NULL);`);
    this.db.exec('CREATE TABLE IF NOT EXISTS confirmations(identity TEXT PRIMARY KEY,sourceKey TEXT NOT NULL,command TEXT NOT NULL,expires INTEGER NOT NULL)');
    const confirmationColumns=this.db.prepare('PRAGMA table_info(confirmations)').all() as Row[];
    if(!confirmationColumns.some(column=>column.name==='request'))this.db.exec("ALTER TABLE confirmations ADD COLUMN request TEXT NOT NULL DEFAULT ''");
    if(!confirmationColumns.some(column=>column.name==='sourceReceivedAt'))this.db.exec('ALTER TABLE confirmations ADD COLUMN sourceReceivedAt INTEGER NOT NULL DEFAULT 0');
    this.db.exec("UPDATE spoken SET state='uncertain' WHERE state='sending'");
  }
  close(){if(this.busy)throw new Error('social_worker_busy');this.db.close();}
  accepts(text:string) {return /^(?:(?:mallow|morrow|poe)(?:[, :]\s*|$)|ask (?:mallow|morrow|poe)(?:[, :]\s*|$)|start\s|voice\s|(?:job|stop|pause|resume)\s+ac[- ]?\d+|(?:approve|reject)\s+\d+|models$|nodes$|health$|status$|what'?s agent control doing\??$)/i.test(text.trim());}
  /** Only the authenticated transport ingress may call this. It must not be exposed as a public JSON API. */
  accept(message:SocialMessage) {
    message=this.provider.receive(message);
    const identity=who(message.identity),key=hash(`${this.provider.id}:${message.identity.account}:${message.id}`);
    if(this.db.prepare('SELECT key FROM inbox WHERE key=?').get(key))return {duplicate:true};
    if(message.identity.channel!==this.provider.id||message.identity.sender!==message.identity.conversation||!this.execution.principal(message.identity))throw new Error('social_identity_denied');
    if(!Number.isFinite(message.receivedAt)||Math.abs(this.clock()-message.receivedAt)>300000||typeof message.id!=='string'||!message.id||message.id.length>256||(message.text?.length??0)>2000)throw new Error('social_message_invalid');
    const recent=this.db.prepare('SELECT count(*) AS n FROM inbox WHERE identity=? AND at>?').get(identity,this.clock()-60000) as Row;
    if(recent.n>=30)throw new Error('social_rate_limit');
    this.db.prepare("INSERT INTO inbox VALUES (?,?,?,'pending',?)").run(key,identity,JSON.stringify(message),this.clock());this.audit('message.accepted',identity,{kind:message.kind,channel:message.identity.channel,text:message.text,classification:'enrolled direct sender',messageKey:key});return {accepted:true};
  }
  private audit(event:string,identity:string,detail:unknown){this.db.prepare('INSERT INTO history(at,event,identity,detail) VALUES (?,?,?,?)').run(this.clock(),event,identity,JSON.stringify(detail));try{this.onEvent?.(event);}catch{/* durable history is authoritative when an observer fails */}}
  private async reply(m:SocialMessage,key:string,text:string){const receipt=await this.provider.send(m.identity,text,key);this.audit('social.response',who(m.identity),{text,receipt});}
  private owned(reference:string,identity:string) {const n=Number(reference.replace(/^ac[- ]?/i,''));const row=this.db.prepare('SELECT * FROM jobs WHERE number=? AND identity=? AND parcel IS NOT NULL').get(n,identity) as Row|undefined;if(!row)throw new Error('job_not_owned');return row;}
  async tick() {
    if(this.busy)return;this.busy=true;
    try {
      if(this.clock()-this.checkedAt>15000){this.providerHealth={social:await this.provider.health(),speech:this.speech?await this.speech.health():{state:'unavailable',reason:'not_configured'},recognition:this.recognition?await this.recognition.health():{state:'unavailable',reason:'not_configured'}};this.checkedAt=this.clock();}
      const row=this.db.prepare("SELECT * FROM inbox WHERE state='pending' ORDER BY at LIMIT 1").get() as Row|undefined;
      if(row){const message=JSON.parse(row.message) as SocialMessage;try{await this.process(message,row.key,row.identity);this.db.prepare("UPDATE inbox SET state='done' WHERE key=?").run(row.key);}catch{this.audit('request.failed',row.identity,{messageKey:row.key,reason:'provider_or_policy_failure'});if(!this.execution.principal(message.identity)){this.db.prepare("UPDATE inbox SET state='failed' WHERE key=?").run(row.key);return;}try{await this.reply(message,row.key+':failure','Request could not be completed. Please use text or the authenticated dashboard.');this.db.prepare("UPDATE inbox SET state='failed' WHERE key=?").run(row.key);}catch{/* durable pending; never replace a failure with guessed execution */}}}
      for(const job of this.db.prepare('SELECT * FROM jobs WHERE parcel IS NOT NULL').all() as Row[]){
        const origin=this.db.prepare('SELECT message FROM inbox WHERE key=?').get(job.key) as Row;const message=JSON.parse(origin.message) as SocialMessage;
        if(!this.execution.principal(message.identity))continue;
        const result=this.execution.observe(job.parcel);
        if(result.status===job.status)continue;
        const key=`parcel:${job.parcel}:${result.status}`,text=`Job AC-${job.number}: ${result.status}\n${result.text}`;
        await this.reply(message,key,text);this.audit('parcel.status',job.identity,{parcelId:job.parcel,...result});
        if(terminal(result.status)&&job.voice)await this.speak(message,key,spokenJobSummary(job.number,result));
        this.db.prepare('UPDATE jobs SET status=? WHERE number=?').run(result.status,job.number);
      }
    }finally{this.busy=false;}
  }
  private async process(m:SocialMessage,key:string,identity:string) {
    const principal=this.execution.principal(m.identity);if(!principal)throw new Error('social_identity_revoked');
    let text=m.text?.trim()??'';
    if(m.kind==='audio'){
      if(!this.recognition||!m.mediaId){await this.reply(m,key,'Speech recognition is unavailable. Please send a text message.');return;}
      const audio=await this.provider.downloadAudio(m.identity,m.mediaId);validateAudio(audio.bytes,audio.mime);
      const transcript=await this.recognition.transcribe({...audio,signal:AbortSignal.timeout(120000)}),providerText=transcript.text.trim();text=providerText.replace(/^agent control[, :]+/i,'').replace(/[.!?]+$/,'').trim();
      this.audit('speech.transcribed',identity,{text:providerText,confidence:transcript.confidence,metrics:transcript.metrics,authority:'untrusted transcription'});
      const normalizedText=normalizeSpokenPoeInvocation(text);
      if(normalizedText!==text){this.audit('speech.intent_normalized',identity,{sourceText:text,normalizedText,rule:'poe-invocation-homophone-v1',authority:'deterministic lexical normalization'});text=normalizedText;}
      const interruption=text.match(/^(?:(?:sorry|excuse me)[, ]+)?(?:let me |to )?interrupt[, ]+(?:mallow|morrow|poe)[,.!?: ]+(.+)$/i),playback=interruption?this.db.prepare("SELECT conversation,turn FROM poe_playback WHERE identity=? AND state='queued'").get(identity) as Row|undefined:undefined;
      if(interruption&&playback&&this.poe?.interrupt){const result=await this.poe.interrupt({actor:principal.actor,identityReference:identity,conversationId:playback.conversation,turnId:playback.turn});if(result.interrupted){this.db.prepare("UPDATE poe_playback SET state='interrupted' WHERE identity=?").run(identity);this.audit('poe.interrupted',identity,{conversationId:playback.conversation,turnId:playback.turn,speechBoundary:'client-playback',workParcelCancellation:false});}text=`POE: ${interruption[1]!.trim()}`;}
      if(!/^(?:(?:mallow|morrow|poe)(?:[, :]\s*).+|ask (?:mallow|morrow|poe)(?:[, :]\s*).+|status|jobs|health|models|nodes|what'?s agent control doing\??|(?:status |job )?ac[- ]?\d+)$/i.test(text.trim())){
        const template=principal.templates.find(name=>text.toLowerCase()===`start ${name.replaceAll('-',' ')}`||text.toLowerCase()===`start ${name}`);
        const command=template?`start ${template} voice`:undefined;
        if(command)this.db.prepare('INSERT OR REPLACE INTO confirmations(identity,sourceKey,command,expires,request,sourceReceivedAt) VALUES (?,?,?,?,?,?)').run(identity,key,command,this.clock()+300000,text,m.receivedAt);
        await this.reply(m,key,`I heard: ${text}\nNo action was executed. ${command?`To confirm and receive a voice result, send this as a new text message:\n${command}`:'Please send a new explicit text command; the request is ambiguous.'}`);this.audit('policy.confirmation_required',identity,{reason:'consequential_or_ambiguous_transcription',command});return;
      }
    }
    text=text.trim();let match:RegExpMatchArray|null;
    if((match=text.match(/^(?:(?:ask )?(?:mallow|morrow|poe))(?:[, :]\s*)(.+)$/i))){
      if(!this.poe){await this.reply(m,key,'Mallow is unavailable on this channel. The authenticated dashboard remains available.');this.audit('poe.unavailable',identity,{reason:'channel_adapter_unconfigured'});return;}
      const answer=await this.poe.ask({actor:principal.actor,identityReference:identity,text:match[1]!.trim(),modality:m.kind==='audio'?'voice':'text'});
      await this.reply(m,key,answer.text);if(m.kind==='audio'){const spoken=await this.speak(m,`${key}:poe`,answer.text);if(spoken&&answer.turnId)this.db.prepare("INSERT OR REPLACE INTO poe_playback(identity,conversation,turn,state,queuedAt) VALUES (?,?,?,'queued',?)").run(identity,answer.conversationId,answer.turnId,this.clock());}this.audit('poe.response',identity,{conversationId:answer.conversationId,turnId:answer.turnId??null,channel:this.provider.id,modality:m.kind==='audio'?'voice':'text',spoken:m.kind==='audio',authority:'agent-control-evidence'});
    }else if(/^(status|health|models|nodes|what'?s agent control doing\??)$/i.test(text)){
      const kind=/^(health|models|nodes)$/i.test(text)?text.toLowerCase() as 'health'|'models'|'nodes':'status';await this.reply(m,key,this.execution.overview(kind,principal.actor));
    }else if(/^jobs$/i.test(text)){const jobs=this.db.prepare('SELECT number,parcel FROM jobs WHERE identity=? AND parcel IS NOT NULL').all(identity) as Row[];await this.reply(m,key,jobs.map(j=>`AC-${j.number}: ${this.execution.observe(j.parcel).status}`).join('\n')||'No Social & Voice jobs yet.');
    }else if((match=text.match(/^start ([a-z0-9-]+)( voice)?$/i))){
      const template=match[1]!.toLowerCase();if(!principal.templates.includes(template))throw new Error('template_not_granted');
      const confirmation=this.db.prepare('SELECT sourceKey,request,sourceReceivedAt FROM confirmations WHERE identity=? AND command=? AND expires>?').get(identity,text.toLowerCase(),this.clock()) as Row|undefined;
      if(confirmation){this.audit('voice.confirmed_by_text',identity,{sourceMessageKey:confirmation.sourceKey,confirmationMessageKey:key});this.db.prepare('DELETE FROM confirmations WHERE identity=?').run(identity);}
      this.db.prepare('INSERT OR IGNORE INTO jobs(key,identity,voice) VALUES (?,?,?)').run(key,identity,Number(Boolean(match[2])));
      const existing=this.db.prepare('SELECT * FROM jobs WHERE key=?').get(key) as Row;
      const origin=governedRequestOrigin({channel:this.provider.id,modality:confirmation?'voice-confirmed-by-text':'text',receivedAt:new Date(confirmation?.sourceReceivedAt||m.receivedAt).toISOString(),authentication:'enrolled-direct-sender',actorId:principal.actor,authority:[`template:${template}`],messageReference:confirmation?.sourceKey??key,identityReference:identity,request:confirmation?.request||text,...(confirmation?{confirmationReference:key,transcriptionAuthority:'untrusted-confirmed-by-text' as const}:{})});
      const parcel=existing.parcel?{id:existing.parcel}:this.execution.start(template,principal.actor,key,{prompt:origin.request,origin});
      this.db.prepare('UPDATE jobs SET parcel=? WHERE key=?').run(parcel.id,key);this.audit('policy.allowed',identity,{template,parcelId:parcel.id,requestKey:key});
      await this.reply(m,key,`Job AC-${existing.number} accepted: ${template}.\nWork Parcel: ${parcel.id}\nTo stop: stop AC-${existing.number}${match[2]?'\nText and voice completion requested.':''}`);
    }else if((match=text.match(/^(?:job |status )?(ac[- ]?\d+)$/i))){const job=this.owned(match[1]!,identity);await this.reply(m,key,`Job AC-${job.number}\n${this.execution.observe(job.parcel).text}`);
    }else if((match=text.match(/^stop (ac[- ]?\d+)$/i))){const job=this.owned(match[1]!,identity);this.execution.stop(job.parcel,principal.actor);await this.reply(m,key,'Stop requested. Runtime cleanup remains authoritative.');
    }else if((match=text.match(/^voice (ac[- ]?\d+)$/i))){const job=this.owned(match[1]!,identity);this.db.prepare('UPDATE jobs SET voice=1 WHERE number=?').run(job.number);const result=this.execution.observe(job.parcel);await this.reply(m,key,`Voice summary enabled for AC-${job.number}. Text evidence remains available.`);if(terminal(result.status))await this.speak(m,key,spokenJobSummary(job.number,result));
    }else if((match=text.match(/^(approve|reject) (\d+)$/i))){await this.decide(m,key,identity,principal,Number(match[2]),match[1]!.toLowerCase()==='approve');
    }else{await this.reply(m,key,'Unsupported or ambiguous request. Use Morrow: <question>, status, start <approved-template>, job AC-1, stop AC-1, or voice AC-1. Pause/resume are not supported by this runtime.');this.audit('policy.denied',identity,{reason:'unsupported_or_ambiguous_intent'});}
  }
  private async speak(m:SocialMessage,key:string,text:string){
    if(!this.speech||!this.voice){this.audit('speech.text_fallback',who(m.identity),{reason:'provider_unconfigured'});return;}
    if(this.db.prepare('SELECT key FROM spoken WHERE key=?').get(key))return;
    this.db.prepare("INSERT INTO spoken VALUES (?,'sending')").run(key);
    try{const safe=prepareSpokenText(text),audio=await this.speech.synthesize({text:safe,voice:this.voice,signal:AbortSignal.timeout(180000)});validateAudio(audio.bytes,audio.mime);let contentValidation:{state:'VERIFIED'|'UNAVAILABLE';authority:'INDEPENDENT_TRANSCRIPTION'|'UNAVAILABLE';coverage:number|null;metrics?:unknown}={state:'UNAVAILABLE',authority:'UNAVAILABLE',coverage:null};if(this.recognition){const observed=await this.recognition.transcribe({bytes:audio.bytes,mime:audio.mime,signal:AbortSignal.timeout(120000)}),comparison=speechContentCoverage(safe,observed.text);if(!comparison.matched)throw new Error('speech_content_mismatch');contentValidation={state:'VERIFIED',authority:'INDEPENDENT_TRANSCRIPTION',coverage:comparison.coverage,metrics:observed.metrics};}const receipt=await this.provider.sendArtifact(m.identity,audio.bytes,audio.mime,key+':audio');this.audit('speech.synthesized',who(m.identity),{text:safe,metrics:audio.metrics,contentValidation,voice:this.voice,receipt,audioSha256:createHash('sha256').update(audio.bytes).digest('hex')});this.db.prepare("UPDATE spoken SET state='queued' WHERE key=?").run(key);return{metrics:audio.metrics};}catch(error){this.db.prepare("UPDATE spoken SET state='failed' WHERE key=?").run(key);this.audit('speech.text_fallback',who(m.identity),{reason:error instanceof Error&&error.message==='speech_content_mismatch'?'synthesis_content_mismatch':'synthesis_or_delivery_failed'});}
  }
  async requestSummary(identity:SocialIdentity,reference:string,requestKey:string){
    if(!this.execution.principal(identity)||!/^[-a-zA-Z0-9]{8,80}$/.test(requestKey))throw new Error('summary_request_denied');
    const job=this.owned(reference,who(identity)),result=this.execution.observe(job.parcel);
    if(!terminal(result.status))throw new Error('summary_job_not_terminal');
    const origin=this.db.prepare('SELECT message FROM inbox WHERE key=?').get(job.key) as Row;
    const message=JSON.parse(origin.message) as SocialMessage,key=`operator-summary:${requestKey}:${job.parcel}`;
    this.audit('summary.requested',who(identity),{parcelId:job.parcel,source:'authenticated_dashboard',requestKey});
    await this.speak(message,key,spokenJobSummary(job.number,result));
    return {requested:true,parcelId:job.parcel};
  }
  async requestApproval(identity:SocialIdentity,parcel:string,run:string,action:string,ttlMs=120000){
    if(!this.execution.principal(identity)?.approve||ttlMs<=0||ttlMs>300000)throw new Error('approval_grant_required');
    if(!this.db.prepare('SELECT number FROM jobs WHERE parcel=? AND identity=?').get(parcel,who(identity)))throw new Error('approval_job_not_owned');
    const snapshot=this.execution.approvalSnapshot(parcel,run,action),identityKey=who(identity),expires=this.clock()+ttlMs;
    const result=this.db.prepare("INSERT INTO approvals(identity,parcel,run,action,snapshot,expires,state) VALUES (?,?,?,?,?,?,'pending')").run(identityKey,parcel,run,action,snapshot,expires);
    const number=Number(result.lastInsertRowid);this.audit('approval.requested',identityKey,{number,parcel,run,action,snapshot,expires});await this.provider.sendApprovalRequest(identity,`Approval ${number} required.\nWork Parcel: ${parcel}\nJob: ${run}\nAction: ${action}\nExpires: ${new Date(expires).toISOString()}\nReply APPROVE ${number} or REJECT ${number}.`,`approval:${number}`);return {number,expires,command:`APPROVE ${number}`,reject:`REJECT ${number}`};
  }
  private async decide(m:SocialMessage,key:string,identity:string,principal:SocialPrincipal,number:number,approved:boolean){
    const row=this.db.prepare('SELECT * FROM approvals WHERE number=? AND identity=?').get(number,identity) as Row|undefined;
    if(!principal.approve||!row||row.state!=='pending'||row.expires<this.clock()||this.execution.approvalSnapshot(row.parcel,row.run,row.action)!==row.snapshot)throw new Error('approval_stale_or_unauthorized');
    // Claim first: a crash cannot apply the decision twice. Uncertain claims need dashboard reconciliation.
    this.db.prepare("UPDATE approvals SET state='claimed' WHERE number=? AND state='pending'").run(number);
    this.audit('approval.claimed',identity,{number,parcel:row.parcel,run:row.run,action:row.action,snapshot:row.snapshot,approved,messageKey:key});
    this.execution.decide(row.parcel,row.run,row.action,approved,principal.actor);this.db.prepare('UPDATE approvals SET state=? WHERE number=?').run(approved?'approved':'rejected',number);this.audit('approval.transition',identity,{number,state:approved?'approved':'rejected'});await this.reply(m,key,`Approval ${number}: ${approved?'approved':'rejected'}.`);
  }
  projection(){return {provider:this.provider.id,health:this.providerHealth,voice:this.voice??null,inbox:this.db.prepare('SELECT state,count(*) AS count FROM inbox GROUP BY state').all(),jobs:this.db.prepare('SELECT number,parcel,status,voice FROM jobs ORDER BY number DESC LIMIT 50').all(),history:this.db.prepare('SELECT at,event,identity,detail FROM history ORDER BY id DESC LIMIT 100').all()};}
  transcript(){return (this.db.prepare('SELECT at,event,identity,detail FROM history ORDER BY id').all() as Row[]).map(row=>`${new Date(row.at).toISOString()} | ${row.event} | identity ${row.identity.slice(0,12)}\n${row.detail}`).join('\n\n');}
}

import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {assertNoSensitiveMaterial, redactSensitiveText} from './security-redaction.js';
import {projectParameterizedRunHistory,type ExecutionHistoryProjection} from './execution-history.js';
import type {ParameterizedRunStore,SavedJobStore} from './parameterized-job-registry.js';
import type {TokenAwareBatonRuntime} from './token-aware-baton-routing.js';
import type {WorkParcelStore} from './work-parcels.js';

export const UX_SESSION_AUDIENCES = ['UX_ONLY','UX_INTERACTIONS','EXECUTION_OVERVIEW','SANITISED_DIAGNOSTIC','AUTHORISED_FULL_EVIDENCE'] as const;
export type UxSessionAudience = typeof UX_SESSION_AUDIENCES[number];
export type UxSessionLayer = 'UX'|'AGENT_CONTROL'|'TELEMETRY';
export type UxSessionEventKind = 'USER_INTERACTION'|'POE'|'UI_STATE'|'JOB'|'WORK_PARCEL'|'LANE'|'BATON'|'GATE'|'ROUTING'|'TOOL'|'MODEL'|'TELEMETRY'|'MEMORY'|'OUTCOME'|'EVIDENCE';

export interface UxSessionSource {kind: 'execution-history'|'qualification-evidence'; reference: string; sha256: string; authority: string;}
export interface UxSessionArtifact {kind: 'screen-capture'|'transcript'|'digest'|'interactive-replay'|'manifest'; file: string; sha256: string; bytes: number;}
export interface UxSessionEvent {
  id: string; at: string; layer: UxSessionLayer; kind: UxSessionEventKind; title: string; summary: string;
  outcome?: 'RUNNING'|'PASSED'|'FAILED'|'SKIPPED'|'INFO'|'UNAVAILABLE'; laneId?: string; provider?: string; model?: string;
  parentIds: string[]; evidenceRefs: string[];
  interaction?: {actor: 'operator'|'poe'|'crew'|'system'; action: string};
  telemetry?: {inputTokens: number|null; outputTokens: number|null; totalTokens: number|null; cachedTokens: number|null; cost: number|null; currency: string|null; authority: 'AUTHORITATIVE'|'ESTIMATED'|'UNAVAILABLE'};
  memory?: {operation: 'REQUESTED'|'VALIDATED'|'ACCEPTED'|'REJECTED'|'SUPPLIED'; contentExposed: false; provenance: string[]};
  diagnostic?: {sanitisedInput?: string; sanitisedOutput?: string; tool?: string; durationMs?: number|null};
  authorised?: {content?: string; sourcePaths?: string[]};
}
export interface UxSessionLane {id: string; name: string; provider: string; model: string; outcome: UxSessionEvent['outcome']; inputTokens: number|null; outputTokens: number|null; totalTokens: number|null; cost: number|null; currency: string|null;}
export interface UxSessionRecord {
  schema: 'agent-control.ux-session/v1'; id: string; title: string; startedAt: string; completedAt: string; immutable: true;
  sources: UxSessionSource[]; events: UxSessionEvent[]; lanes: UxSessionLane[];
  outcome: {verdict: string; summary: string; selectedLaneId: string|null; escalationInvoked: boolean|null};
  totals: {inputTokens: number|null; outputTokens: number|null; totalTokens: number|null; cost: number|null; currency: string|null; authority: 'AUTHORITATIVE'|'PARTIAL'|'UNAVAILABLE'};
  artifacts: UxSessionArtifact[]; sha256: string;
}
export interface UxSessionProjection {schema: 'agent-control.ux-session-view/v1'; sessionId: string; sessionSha256: string; audience: UxSessionAudience; title: string; startedAt: string; completedAt: string; lanes: UxSessionLane[]; events: Array<Omit<UxSessionEvent,'authorised'>>; outcome: UxSessionRecord['outcome']; totals: UxSessionRecord['totals']; artifacts: UxSessionArtifact[]; capabilities: {readOnly: true; operationalAccess: false; rerun: false; sourceAccess: boolean; annotations: boolean};}

const RANK = new Map<UxSessionAudience,number>(UX_SESSION_AUDIENCES.map((value,index)=>[value,index]));

export function sealUxSession(input: Omit<UxSessionRecord,'schema'|'immutable'|'sha256'>): UxSessionRecord {
  const safe = sanitiseCanonical(input);
  const core = {schema:'agent-control.ux-session/v1' as const, ...safe, immutable:true as const};
  const sha256 = digest(stable(core));
  return {...core, sha256};
}

export function verifyUxSession(record: UxSessionRecord): void {
  const {sha256,...core}=record;
  if (digest(stable(core)) !== sha256) throw new Error('ux_session_integrity_failed');
}

export function projectUxSession(record: UxSessionRecord, audience: UxSessionAudience): UxSessionProjection {
  verifyUxSession(record);
  const rank = RANK.get(audience);
  if (rank === undefined) throw new Error('ux_session_audience_invalid');
  const events = record.events.flatMap(event => {
    if (rank === 0 && !['USER_INTERACTION','POE','UI_STATE','OUTCOME'].includes(event.kind)) return [];
    if (rank === 1 && !['USER_INTERACTION','POE','UI_STATE','JOB','WORK_PARCEL','OUTCOME'].includes(event.kind)) return [];
    const {authorised: _authorised, diagnostic: _diagnostic, ...base}=event;
    const projected: Omit<UxSessionEvent,'authorised'> = {...base};
    if (rank >= 3 && event.diagnostic) projected.diagnostic = structuredClone(event.diagnostic);
    if (rank >= 4 && event.authorised) projected.diagnostic = {...projected.diagnostic, sanitisedOutput: redactSensitiveText(event.authorised.content ?? projected.diagnostic?.sanitisedOutput ?? '')};
    return [projected];
  });
  const sourceAccess=rank>=4;
  const projection: UxSessionProjection={schema:'agent-control.ux-session-view/v1',sessionId:record.id,sessionSha256:record.sha256,audience,title:record.title,startedAt:record.startedAt,completedAt:record.completedAt,lanes:rank>=2?structuredClone(record.lanes):[],events,outcome:structuredClone(record.outcome),totals:rank>=2?structuredClone(record.totals):{inputTokens:null,outputTokens:null,totalTokens:null,cost:null,currency:null,authority:'UNAVAILABLE'},artifacts:record.artifacts.filter(item=>item.kind!=='transcript'||rank>=3).map(item=>structuredClone(item)),capabilities:{readOnly:true,operationalAccess:false,rerun:false,sourceAccess,annotations:rank>=1}};
  assertNoSensitiveMaterial(JSON.stringify(projection),'ux_session_projection_sensitive');
  return projection;
}

export function captureExecutionHistory(input: {id:string; title:string; projection:ExecutionHistoryProjection; startedAt:string; completedAt:string; source:UxSessionSource; artifacts?:UxSessionArtifact[]}): UxSessionRecord {
  const laneMap=new Map<string,UxSessionLane>(); let inputTokens=0,outputTokens=0,totalTokens=0,knownUsage=false;
  const events:UxSessionEvent[]=input.projection.entries.map(entry=>{
    const laneId=entry.laneId===undefined?undefined:String(entry.laneId), telemetry=entry.telemetry?{...entry.telemetry,cachedTokens:entry.telemetry.cachedInputTokens,authority:(entry.telemetry.contextAuthority==='authoritative'?'AUTHORITATIVE':entry.telemetry.contextAuthority==='estimated'?'ESTIMATED':'UNAVAILABLE') as 'AUTHORITATIVE'|'ESTIMATED'|'UNAVAILABLE'}:undefined;
    if(telemetry?.totalTokens!==null&&telemetry?.totalTokens!==undefined){knownUsage=true;inputTokens=Math.max(inputTokens,telemetry.inputTokens??0);outputTokens=Math.max(outputTokens,telemetry.outputTokens??0);totalTokens=Math.max(totalTokens,telemetry.totalTokens);}
    if(laneId&&!laneMap.has(laneId))laneMap.set(laneId,{id:laneId,name:`Lane ${laneId}`,provider:entry.provider??'unavailable',model:entry.model??'unavailable',outcome:normaliseOutcome(entry.outcome),inputTokens:null,outputTokens:null,totalTokens:null,cost:null,currency:null});
    return {id:entry.id,at:entry.at,layer:entry.actor==='GOVERNOR'||entry.actor==='BATON'?'AGENT_CONTROL':entry.telemetry?'TELEMETRY':'AGENT_CONTROL',kind:historyKind(entry.type),title:entry.title,summary:entry.content,outcome:normaliseOutcome(entry.outcome),laneId,provider:entry.provider,model:entry.model,parentIds:entry.workParcelId?[entry.workParcelId]:[],evidenceRefs:entry.evidenceRefs??[],telemetry:telemetry?{inputTokens:telemetry.inputTokens,outputTokens:telemetry.outputTokens,totalTokens:telemetry.totalTokens,cachedTokens:telemetry.cachedTokens,cost:telemetry.cost,currency:telemetry.currency,authority:telemetry.authority}:undefined};
  });
  return sealUxSession({id:input.id,title:input.title,startedAt:input.startedAt,completedAt:input.completedAt,sources:[input.source],events,lanes:[...laneMap.values()],outcome:{verdict:'RECORDED',summary:`${events.length} governed execution events captured.`,selectedLaneId:null,escalationInvoked:null},totals:{inputTokens:knownUsage?inputTokens:null,outputTokens:knownUsage?outputTokens:null,totalTokens:knownUsage?totalTokens:null,cost:null,currency:null,authority:knownUsage?'PARTIAL':'UNAVAILABLE'},artifacts:input.artifacts??[]});
}

export class UxSessionStore {
  constructor(readonly root:string){fs.mkdirSync(root,{recursive:true,mode:0o700});}
  write(record:UxSessionRecord){verifyUxSession(record);const file=this.file(record.id);if(fs.existsSync(file)){const existing=this.read(record.id);if(existing.sha256!==record.sha256)throw new Error('ux_session_immutable_conflict');return existing;}atomic(file,`${JSON.stringify(record,null,2)}\n`);return structuredClone(record);}
  read(id:string){const record=JSON.parse(fs.readFileSync(this.file(id),'utf8')) as UxSessionRecord;verifyUxSession(record);return record;}
  list(){return fs.readdirSync(this.root).filter(name=>name.endsWith('.json')).map(name=>this.read(name.slice(0,-5))).sort((a,b)=>a.startedAt.localeCompare(b.startedAt));}
  private file(id:string){return path.join(this.root,`${safeId(id)}.json`);}
}

/** Captures completed normal Job Runs from their existing authoritative stores. */
export class UxSessionCaptureRuntime {
  private readonly unsubscribe:()=>void;
  constructor(readonly sessions:UxSessionStore,private readonly runs:ParameterizedRunStore,private readonly savedJobs:SavedJobStore,private readonly parcels:WorkParcelStore,private readonly routing?:TokenAwareBatonRuntime){this.unsubscribe=runs.subscribe(run=>{if(['SUCCEEDED','SUCCEEDED_WITH_FINDINGS','FAILED','CANCELLED','DEGRADED'].includes(run.status))this.capture(run.id);});for(const run of runs.list())if(['SUCCEEDED','SUCCEEDED_WITH_FINDINGS','FAILED','CANCELLED','DEGRADED'].includes(run.status))this.capture(run.id);}
  dispose(){this.unsubscribe();}
  capture(runId:string){const run=this.runs.get(runId);if(!run)throw new Error('job_run_missing');if(!['SUCCEEDED','SUCCEEDED_WITH_FINDINGS','FAILED','CANCELLED','DEGRADED'].includes(run.status))throw new Error('ux_session_run_not_terminal');const saved=run.savedJobId?this.savedJobs.list().find(item=>item.id===run.savedJobId):undefined,projection=projectParameterizedRunHistory({run,savedJob:saved,parcels:this.parcels.list(),tokenEvidence:this.routing?.evidence(),options:{mode:'complete'}}),sourceSha256=digest(stable(projection));return this.sessions.write(captureExecutionHistory({id:`ux-run-${run.id}`,title:`${saved?.name??run.definition.id} — ${run.status}`,projection,startedAt:run.startedAt??run.requestedAt,completedAt:run.completedAt??run.transitions.at(-1)?.at??run.requestedAt,source:{kind:'execution-history',reference:`job-run:${run.id}`,sha256:sourceSha256,authority:'Agent Control durable Job Run, Work Parcel and token-routing records'},artifacts:[]}));}
}

export interface UxSessionShare {schema:'agent-control.ux-session-share/v1';id:string;sessionId:string;sessionSha256:string;audience:UxSessionAudience;tokenSha256:string;createdAt:string;expiresAt:string|null;revokedAt:string|null;}
export class UxSessionShareStore {
  private records:UxSessionShare[];
  constructor(readonly file:string){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});this.records=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];}
  create(record:UxSessionRecord,audience:UxSessionAudience,options:{expiresAt?:string;now?:string}={}){verifyUxSession(record);const token=randomBytes(32).toString('base64url'),now=options.now??new Date().toISOString(),share:UxSessionShare={schema:'agent-control.ux-session-share/v1',id:`share-${randomBytes(12).toString('hex')}`,sessionId:record.id,sessionSha256:record.sha256,audience,tokenSha256:digest(token),createdAt:now,expiresAt:options.expiresAt??null,revokedAt:null};this.records.push(share);this.save();return {share:publicShare(share),token,url:`/share/ux/${share.id}#token=${token}`};}
  resolve(id:string,token:string,now=new Date().toISOString()){const share=this.records.find(item=>item.id===id);if(!share)throw new Error('ux_session_share_missing');if(share.revokedAt)throw new Error('ux_session_share_revoked');if(share.expiresAt&&share.expiresAt<=now)throw new Error('ux_session_share_expired');const expected=Buffer.from(share.tokenSha256,'hex'),actual=Buffer.from(digest(token),'hex');if(expected.length!==actual.length||!timingSafeEqual(expected,actual))throw new Error('ux_session_share_denied');return publicShare(share);}
  revoke(id:string,at=new Date().toISOString()){const share=this.records.find(item=>item.id===id);if(!share)throw new Error('ux_session_share_missing');share.revokedAt=at;this.save();return publicShare(share);}
  private save(){atomic(this.file,`${JSON.stringify(this.records,null,2)}\n`);}
}

export interface UxSessionAnnotation {schema:'agent-control.ux-session-annotation/v1';id:string;sessionId:string;sessionSha256:string;eventId:string;at:string;reviewerId:string;comment:string;audience:UxSessionAudience;workParcelId:null|string;}
export class UxSessionAnnotationStore {
  private records:UxSessionAnnotation[];
  constructor(readonly file:string){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});this.records=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];}
  add(record:UxSessionRecord,input:{eventId:string;reviewerId:string;comment:string;at?:string;audience?:UxSessionAudience;workParcelId?:string}){verifyUxSession(record);if(!record.events.some(event=>event.id===input.eventId))throw new Error('ux_session_event_missing');const comment=redactSensitiveText(input.comment).trim(),audience=input.audience??'AUTHORISED_FULL_EVIDENCE';assertNoSensitiveMaterial(comment);if(!comment)throw new Error('ux_session_annotation_empty');if(!UX_SESSION_AUDIENCES.includes(audience))throw new Error('ux_session_audience_invalid');const value:UxSessionAnnotation={schema:'agent-control.ux-session-annotation/v1',id:`annotation-${randomBytes(10).toString('hex')}`,sessionId:record.id,sessionSha256:record.sha256,eventId:input.eventId,at:input.at??new Date().toISOString(),reviewerId:safe(input.reviewerId,120),comment:safe(comment,2000),audience,workParcelId:input.workParcelId?safe(input.workParcelId,192):null};this.records.push(value);this.save();return structuredClone(value);}
  list(sessionId:string,audience?:UxSessionAudience){const maximum=audience===undefined?Number.POSITIVE_INFINITY:RANK.get(audience)??-1;return this.records.filter(item=>item.sessionId===sessionId&&(RANK.get(item.audience)??Number.POSITIVE_INFINITY)<=maximum).map(item=>structuredClone(item));}
  private save(){atomic(this.file,`${JSON.stringify(this.records,null,2)}\n`);}
}

function sanitiseCanonical<T extends Omit<UxSessionRecord,'schema'|'immutable'|'sha256'>>(input:T):T {const value=structuredClone(input);for(const event of value.events){event.title=safe(event.title,240);event.summary=redactSensitiveText(event.summary).slice(0,65536);if(event.diagnostic){if(event.diagnostic.sanitisedInput)event.diagnostic.sanitisedInput=redactSensitiveText(event.diagnostic.sanitisedInput);if(event.diagnostic.sanitisedOutput)event.diagnostic.sanitisedOutput=redactSensitiveText(event.diagnostic.sanitisedOutput);}if(event.authorised?.content)event.authorised.content=redactSensitiveText(event.authorised.content);}assertNoSensitiveMaterial(JSON.stringify(value));return JSON.parse(JSON.stringify(value)) as T;}
function publicShare(value:UxSessionShare){const{tokenSha256:_token,...safe}=value;return structuredClone(safe);}
function historyKind(type:string):UxSessionEventKind {if(type.includes('BATON'))return'BATON';if(type.includes('GOVERNOR')||type.includes('ROUT'))return'ROUTING';if(type.includes('MODEL')||type.includes('PROVIDER'))return'MODEL';if(type.includes('TELEMETRY')||type.includes('LEDGER'))return'TELEMETRY';if(type.includes('PARCEL'))return'WORK_PARCEL';if(type.includes('LANE'))return'LANE';if(type.includes('RESULT')||type.includes('FINDING'))return'OUTCOME';return'EVIDENCE';}
function normaliseOutcome(value:string):UxSessionEvent['outcome']{if(value==='SUCCEEDED'||value==='PASS'||value==='PASSED')return'PASSED';if(value==='FAILED'||value.includes('FAIL'))return'FAILED';if(value==='RUNNING')return'RUNNING';if(value==='UNAVAILABLE')return'UNAVAILABLE';return'INFO';}
function safe(value:string,max:number){return redactSensitiveText(String(value)).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);}
function safeId(value:string){const result=value.replace(/[^a-zA-Z0-9._-]+/g,'-').slice(0,160);if(!result)throw new Error('ux_session_id_invalid');return result;}
function stable(value:unknown):string{if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;if(value&&typeof value==='object')return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;return JSON.stringify(value);}
function digest(value:string|Buffer){return createHash('sha256').update(value).digest('hex');}
function atomic(file:string,content:string){const temporary=`${file}.${process.pid}.tmp`;fs.writeFileSync(temporary,content,{mode:0o600});fs.renameSync(temporary,file);}

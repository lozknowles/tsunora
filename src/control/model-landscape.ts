import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {assertNoSensitiveMaterial} from './security-redaction.js';

export const canonical=(value:unknown):string=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export const intelligenceHash=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
const text=z.string().min(1).max(512),digest=z.string().regex(/^[a-f0-9]{64}$/),amount=z.number().finite().nonnegative();
export const landscapeItemSchema=z.object({
  identity:z.object({provider:text,family:text,model:text,revision:text,artifact:z.string().max(512),quantisation:z.string().max(64),runtime:z.string().max(128),runtimeVersion:z.string().max(128),kind:z.enum(['LOCAL','API','RUNTIME'])}).strict(),
  facts:z.object({estimates:z.array(text).max(16).optional(),licence:text.nullable(),capabilities:z.array(text).max(64),contextTokens:amount.nullable(),bytes:amount.nullable(),ramBytes:amount.nullable(),vramBytes:amount.nullable(),architecture:text.nullable(),format:text.nullable(),runtimeSupport:z.array(text).max(32),price:z.object({currency:text,inputPerMillion:amount,outputPerMillion:amount}).strict().nullable(),deprecated:z.boolean()}).strict(),
  artifactSha256:digest.nullable(),sourceUrl:z.string().url().max(2048),
}).strict();
export type LandscapeItem=z.infer<typeof landscapeItemSchema>;
export type SourceTrust='OFFICIAL'|'PRIMARY'|'COMMUNITY'|'INFERRED'|'UNVERIFIED';
export interface IntelligenceSource {id:string;adapter:string;trust:SourceTrust;approved:boolean;endpoint:string;allowedOrigins:string[];settings:Record<string,unknown>;}
export interface IntelligenceSourceAdapter {id:string;collect(source:IntelligenceSource,signal:AbortSignal):Promise<{items:unknown[];complete:boolean;cursor?:string}>;}
export interface IntelligenceObservation extends LandscapeItem {sourceId:string;trust:SourceTrust;observedAt:string;payloadSha256:string;}
export type ModelChange='NEW MODEL'|'NEW REVISION'|'NEW QUANTISATION'|'NEW RUNTIME SUPPORT'|'PRICE CHANGE'|'CONTEXT CHANGE'|'CAPABILITY CHANGE'|'LICENCE CHANGE'|'DEPRECATED'|'REMOVED'|'UNKNOWN CHANGE';
export interface IntelligenceChange {id:string;sourceId:string;kind:ModelChange;before:string|null;after:string|null;model:string;observedAt:string;}
interface JournalRecord {sequence:number;kind:string;at:string;previous:string|null;value:any;sha256:string;}
/** Hash-linked append-only journal. Interrupted writes are visible corruption, never silently discarded. */
export class IntelligenceJournal {
  constructor(readonly file:string){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});}
  records(kind?:string):JournalRecord[]{if(!fs.existsSync(this.file))return [];let previous:string|null=null;const rows=fs.readFileSync(this.file,'utf8').trim().split('\n').filter(Boolean).map((line,index)=>{const row=JSON.parse(line) as JournalRecord,{sha256,...body}=row;if(row.sequence!==index+1||row.previous!==previous||intelligenceHash(body)!==sha256)throw Error('intelligence_history_integrity_failed');previous=sha256;return row;});return kind?rows.filter(r=>r.kind===kind):rows;}
  append(kind:string,value:unknown,now=new Date()){
    assertNoSensitiveMaterial(canonical(value),'intelligence_credential_material_forbidden');
    const lock=this.file+'.lock',handle=acquireJournalLock(lock,now);
    try{const history=this.records(),body={sequence:history.length+1,kind,at:now.toISOString(),previous:history.at(-1)?.sha256??null,value},record={...body,sha256:intelligenceHash(body)},fd=fs.openSync(this.file,'a',0o600);try{fs.writeSync(fd,JSON.stringify(record)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return record;}finally{fs.closeSync(handle);fs.unlinkSync(lock);}
  }
}

interface JournalLockOwner {pid:number;processStartToken:string|null;acquiredAt:string;}
function processStartToken(pid:number){
  try{const value=fs.readFileSync(`/proc/${pid}/stat`,'utf8'),end=value.lastIndexOf(')'),fields=value.slice(end+2).trim().split(/\s+/);return end>0&&fields[19]?fields[19]:null;}catch{return null;}
}
function ownerAlive(owner:JournalLockOwner){
  if(!Number.isInteger(owner.pid)||owner.pid<=0)return false;
  try{process.kill(owner.pid,0);}catch(error){return (error as NodeJS.ErrnoException).code==='EPERM';}
  const current=processStartToken(owner.pid);return !(owner.processStartToken&&current&&owner.processStartToken!==current);
}
function acquireJournalLock(lock:string,now:Date){
  for(let attempt=0;attempt<2;attempt++){
    try{const handle=fs.openSync(lock,'wx',0o600),owner:JournalLockOwner={pid:process.pid,processStartToken:processStartToken(process.pid),acquiredAt:now.toISOString()};fs.writeFileSync(handle,JSON.stringify(owner));fs.fsyncSync(handle);return handle;}
    catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;let stale=false;try{const raw=fs.readFileSync(lock,'utf8'),owner=JSON.parse(raw) as JournalLockOwner;stale=!ownerAlive(owner);}catch{try{stale=now.getTime()-fs.statSync(lock).mtimeMs>30_000;}catch{stale=false;}}if(!stale)throw Error('intelligence_journal_locked');try{fs.unlinkSync(lock);}catch{throw Error('intelligence_journal_locked');}}
  }
  throw Error('intelligence_journal_locked');
}

const key=(i:LandscapeItem)=>canonical([i.identity.provider,i.identity.model,i.identity.artifact,i.identity.quantisation,i.identity.kind]);
function changes(before:IntelligenceObservation|undefined,after:IntelligenceObservation):ModelChange[]{
  if(!before)return [after.identity.kind==='RUNTIME'?'NEW RUNTIME SUPPORT':'NEW MODEL'];const a=before,b=after,result:ModelChange[]=[];
  if(a.identity.revision!==b.identity.revision)result.push('NEW REVISION');
  if(a.identity.runtime!==b.identity.runtime||a.identity.runtimeVersion!==b.identity.runtimeVersion||canonical(a.facts.runtimeSupport)!==canonical(b.facts.runtimeSupport))result.push('NEW RUNTIME SUPPORT');
  if(canonical(a.facts.price)!==canonical(b.facts.price))result.push('PRICE CHANGE');
  if(a.facts.contextTokens!==b.facts.contextTokens)result.push('CONTEXT CHANGE');
  if(canonical(a.facts.capabilities)!==canonical(b.facts.capabilities))result.push('CAPABILITY CHANGE');
  if(a.facts.licence!==b.facts.licence)result.push('LICENCE CHANGE');
  if(!a.facts.deprecated&&b.facts.deprecated)result.push('DEPRECATED');
  if(!result.length&&a.payloadSha256!==b.payloadSha256)result.push('UNKNOWN CHANGE');return result;
}
export class ModelLandscape {
  readonly adapters=new Map<string,IntelligenceSourceAdapter>();
  constructor(readonly journal:IntelligenceJournal){}
  register(adapter:IntelligenceSourceAdapter){if(this.adapters.has(adapter.id))throw Error('source_adapter_duplicate');this.adapters.set(adapter.id,adapter);return this;}
  latest(sourceId:string){const snapshots=this.journal.records('source-snapshot').filter(r=>r.value.sourceId===sourceId);return (snapshots.at(-1)?.value.items??[]) as IntelligenceObservation[];}
  async poll(source:IntelligenceSource,signal:AbortSignal){
    if(!source.approved)throw Error('intelligence_source_approval_required');const adapter=this.adapters.get(source.adapter);if(!adapter)throw Error('intelligence_source_connector_required');
    const now=new Date().toISOString();
    try{const batch=await adapter.collect(source,signal);if(signal.aborted)throw Error('source_poll_cancelled');if(batch.items.length>10000)throw Error('source_item_limit');
      const unique=new Map<string,IntelligenceObservation>();for(const raw of batch.items){assertNoSensitiveMaterial(canonical(raw),'intelligence_source_credentials_forbidden');const parsed=landscapeItemSchema.parse(raw);const url=new URL(parsed.sourceUrl);if(url.username||url.password||!source.allowedOrigins.includes(url.origin))throw Error('intelligence_item_origin_denied');parsed.facts.capabilities.sort();parsed.facts.runtimeSupport.sort();const item={...parsed,sourceId:source.id,trust:source.trust,observedAt:now,payloadSha256:intelligenceHash(parsed)},existing=unique.get(key(item));if(existing&&existing.payloadSha256!==item.payloadSha256)throw Error('source_conflicting_identity');unique.set(key(item),item);}
      const prior=this.latest(source.id),events:IntelligenceChange[]=[];
      const seen=[...prior];
      for(const item of unique.values()){
        const old=prior.find(i=>key(i)===key(item));let kinds=changes(old,item);if(!old){const sibling=seen.find(i=>i.identity.provider===item.identity.provider&&i.identity.model===item.identity.model);if(sibling)kinds=[item.identity.kind==='RUNTIME'?'NEW RUNTIME SUPPORT':sibling.identity.quantisation!==item.identity.quantisation?'NEW QUANTISATION':sibling.identity.revision!==item.identity.revision?'NEW REVISION':'UNKNOWN CHANGE'];}
        for(const kind of kinds){const body={sourceId:source.id,kind,before:old?.payloadSha256??null,after:item.payloadSha256,model:item.identity.model,observedAt:now};events.push({id:intelligenceHash(body),...body});}
        seen.push(item);
      }
      // An unavailable or partial source cannot prove removal.
      if(batch.complete)for(const old of prior)if(!unique.has(key(old))){const body={sourceId:source.id,kind:'REMOVED' as const,before:old.payloadSha256,after:null,model:old.identity.model,observedAt:now};events.push({id:intelligenceHash(body),...body});}
      const retained=batch.complete?[...unique.values()]:[...prior.filter(i=>!unique.has(key(i))),...unique.values()];
      const snapshot=this.journal.append('source-snapshot',{sourceId:source.id,complete:batch.complete,items:retained,changes:events,cursor:batch.cursor??null});return {snapshotSha256:snapshot.sha256,items:[...unique.values()],changes:events};
    }catch(error){this.journal.append('source-failure',{sourceId:source.id,classification:signal.aborted?'CANCELLED':'SOURCE_UNAVAILABLE_OR_INVALID'});throw error;}
  }
}
export const modelWatchSchema=z.object({schema:z.literal('agent-control.model-watch/v1'),id:text,name:text,sourceIds:z.array(text).min(1).max(32),benchmarkSha256:digest,incumbentResultSha256:digest.nullable(),filters:z.object({mode:z.enum(['LOCAL','API','BOTH']),capability:text,allowedLicences:z.array(text).min(1),minimumContext:amount,maximumArtifactBytes:amount,minimumTrust:z.enum(['PRIMARY','COMMUNITY'])}).strict(),policy:z.object({machines:z.array(text).min(1),maxDownloadBytesPerRun:amount,maxDownloadBytesPerDay:amount,maxApiSpendPerRun:amount,maxApiSpendPerDay:amount,currency:z.string().length(3),maxDurationMs:z.number().int().min(1000).max(86400000),allowRuntimeInstall:z.boolean(),onlyWhenIdle:z.boolean(),pauseOnPriorityWork:z.boolean(),maxGpuUtilisation:z.number().min(0).max(100),maxDiskBytes:amount,automaticBenchmark:z.boolean()}).strict(),schedule:z.object({kind:z.enum(['MANUAL','DAILY','WEEKLY','EVENT']),utcHour:z.number().int().min(0).max(23),utcWeekday:z.number().int().min(0).max(6)}).strict(),notifications:z.array(z.enum(['COMPLETE','NEW_LEADER','FAILED','APPROVAL_REQUIRED','POLICY_EXCEEDED','ESTATE_UNAVAILABLE'])),routing:z.literal('NEVER_AUTOMATIC'),retention:z.literal('KEEP_ALL'),expiresAt:z.string().datetime()}).strict();
export type ModelWatch=z.infer<typeof modelWatchSchema>;
export interface EstateCandidateTarget {id:string;fresh:boolean;authenticated:boolean;controlQualified:boolean;ramAvailable:number;vramAvailable:number;diskAvailable:number;busy:boolean;gpuUtilisation:number|null;architectures:string[];runtimes:string[];existingArtifactHashes:string[];provisioners:string[];}
export function candidateFunnel(item:IntelligenceObservation,watch:ModelWatch,estate:EstateCandidateTarget[]){
  const reasons:string[]=[];if(!watch.sourceIds.includes(item.sourceId))reasons.push('SOURCE_NOT_APPROVED');
  if(!['OFFICIAL','PRIMARY',...(watch.filters.minimumTrust==='COMMUNITY'?['COMMUNITY']:[])].includes(item.trust))reasons.push('SOURCE_UNVERIFIED');
  if(item.facts.deprecated)reasons.push('DEPRECATED');if(watch.filters.mode!=='BOTH'&&item.identity.kind!==watch.filters.mode)reasons.push('MODE_IRRELEVANT');
  if(!item.facts.capabilities.includes(watch.filters.capability))reasons.push('CAPABILITY_NOT_ESTABLISHED');if(item.facts.contextTokens===null||item.facts.contextTokens<watch.filters.minimumContext)reasons.push('CONTEXT_NOT_ESTABLISHED');
  if(item.identity.kind==='LOCAL'&&(!item.facts.licence||!watch.filters.allowedLicences.includes(item.facts.licence)))reasons.push('LICENCE_EXCLUDED');
  if(item.identity.kind==='LOCAL'&&(item.facts.bytes===null||item.facts.bytes>watch.filters.maximumArtifactBytes||!item.artifactSha256))reasons.push('ARTIFACT_UNVERIFIED_OR_TOO_LARGE');
  const considered=estate.filter(e=>watch.policy.machines.includes(e.id)).map(e=>({target:e.id,reasons:[...(!e.fresh?['ESTATE_STALE']:[]),...(!e.authenticated?['AUTHENTICATION_REQUIRED']:[]),...(!e.controlQualified?['CONTROL_UNQUALIFIED']:[]),...(watch.policy.onlyWhenIdle&&e.busy?['ESTATE_BUSY']:[]),...(item.facts.vramBytes!==null&&item.facts.vramBytes>0&&e.gpuUtilisation===null?['GPU_TELEMETRY_REQUIRED']:[]),...(e.gpuUtilisation!==null&&e.gpuUtilisation>watch.policy.maxGpuUtilisation?['GPU_POLICY']:[]),...(item.identity.kind==='LOCAL'?(item.facts.ramBytes===null||item.facts.ramBytes>e.ramAvailable?['RAM_UNPROVEN_OR_INFEASIBLE']:[]):[]),...(item.identity.kind==='LOCAL'&&(!item.facts.architecture||!e.architectures.includes(item.facts.architecture))?['ARCHITECTURE_UNSUPPORTED']:[]),...(item.identity.kind==='LOCAL'&&!item.facts.runtimeSupport.some(r=>e.runtimes.includes(r)||e.provisioners.includes(r)&&watch.policy.allowRuntimeInstall)?['CONNECTOR_REQUIRED']:[]),...(item.identity.kind==='LOCAL'&&((item.facts.bytes??Infinity)*1.1>e.diskAvailable||(item.facts.bytes??Infinity)>watch.policy.maxDiskBytes)?['STORAGE_INFEASIBLE']:[])]}));
  const target=considered.find(e=>!e.reasons.length)?.target;if(!target)reasons.push('NO_ADMITTED_TARGET');const existing=target&&item.artifactSha256?estate.find(e=>e.id===target)?.existingArtifactHashes.includes(item.artifactSha256):false;
  return {identity:item.identity,payloadSha256:item.payloadSha256,target:target??null,reasons,considered,state:reasons.length?'REJECTED':item.identity.kind==='LOCAL'&&!existing?'PROVISIONABLE':'APPROVAL_REQUIRED',downloadBytes:item.identity.kind==='LOCAL'&&!existing?item.facts.bytes:null,qualification:'NOT_QUALIFIED_BY_SOURCE',authorityGranted:false};
}

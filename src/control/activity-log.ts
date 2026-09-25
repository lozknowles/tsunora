import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {RunRecord} from './job-types.js';
import {redactSensitiveValue} from './security-redaction.js';

export const ACTIVITY_UNAVAILABLE='unavailable' as const;
export type ActivityValue=number|typeof ACTIVITY_UNAVAILABLE;
export interface AuthoritativeActivitySource {at:string;runId:string;type:string;status:string;evidence?:Record<string,unknown>;run?:RunRecord;}
export interface ActivityLogEntry {
  schema:'agent-control.activity/v1';timestamp:string;eventId:string;runId:string;laneId:string;eventType:string;
  provider:string;model:string;tokenUsage:{input:ActivityValue;cachedInput:ActivityValue;output:ActivityValue;total:ActivityValue};
  status:string;evidenceReference:string;
}
export interface ActivityLogRepairReceipt {schema:'agent-control.activity-repair/v1';status:'REPAIRED'|'NO_CHANGE';path:string;backup:string|null;beforeSha256:string;afterSha256:string;retained:number;removed:number;at:string;integrity:'PASS';}

const value=(candidate:unknown):string=>typeof candidate==='string'&&candidate.trim()?candidate:ACTIVITY_UNAVAILABLE;
const metric=(candidate:unknown):ActivityValue=>typeof candidate==='number'&&Number.isFinite(candidate)&&candidate>=0?candidate:ACTIVITY_UNAVAILABLE;
const record=(candidate:unknown):Record<string,unknown>=>candidate&&typeof candidate==='object'&&!Array.isArray(candidate)?candidate as Record<string,unknown>:{};
function first(...values:unknown[]){return values.find(item=>item!==undefined&&item!==null);}
function tokens(evidence:Record<string,unknown>){
  const usage=record(first(evidence.tokenUsage,evidence.usage,evidence.cumulative));
  const input=metric(first(usage.input,usage.inputTokens,evidence.inputTokens));
  const cachedInput=metric(first(usage.cachedInput,usage.cachedInputTokens,evidence.cachedInputTokens));
  const output=metric(first(usage.output,usage.outputTokens,evidence.outputTokens));
  const suppliedTotal=metric(first(usage.total,usage.totalTokens,evidence.totalTokens));
  return {input,cachedInput,output,total:suppliedTotal};
}

export function projectActivity(source:AuthoritativeActivitySource):ActivityLogEntry{
  const safe=redactSensitiveValue(source),evidence=record(safe.evidence),route=safe.run?.trigger.modelRoute;
  const identity={timestamp:safe.at,runId:safe.runId,eventType:safe.type,status:safe.status,evidence};
  return redactSensitiveValue({schema:'agent-control.activity/v1',timestamp:safe.at,eventId:`activity-${createHash('sha256').update(JSON.stringify(identity)).digest('hex')}`,runId:safe.runId,laneId:value(evidence.laneId),eventType:safe.type,provider:value(first(evidence.provider,evidence.providerId,route?.providerId)),model:value(first(evidence.model,evidence.modelId,route?.modelId)),tokenUsage:tokens(evidence),status:safe.status,evidenceReference:value(first(evidence.evidenceReference,evidence.artifactId,evidence.artifact,evidence.evidenceId))});
}

export function activityLogPaths(stateRoot:string,environment:NodeJS.ProcessEnv=process.env,platform:NodeJS.Platform=process.platform){
  const privatePath=path.join(stateRoot,'logs','activity.jsonl'),android=platform==='android'||Boolean(environment.ANDROID_ROOT);
  return {preferred:environment.AGENT_CONTROL_ACTIVITY_LOG||(!android&&platform==='linux'?'/var/log/agent-control/activity.jsonl':privatePath),fallback:privatePath};
}

export class ActivityLogProjection{
  private activePath:string|undefined;
  private repairing=false;
  constructor(readonly preferredPath:string,readonly fallbackPath:string=preferredPath){}
  append(source:AuthoritativeActivitySource){
    if(this.repairing)throw new Error('activity_log_repair_in_progress');
    const entry=projectActivity(source),line=`${JSON.stringify(entry)}\n`,candidates=[this.activePath,this.preferredPath,this.fallbackPath].filter((item,index,all):item is string=>Boolean(item)&&all.indexOf(item)===index);
    let failure:unknown;
    for(const file of candidates)try{fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o750});fs.appendFileSync(file,line,{mode:0o640,flush:true});if(process.platform!=='win32')fs.chmodSync(file,0o640);this.activePath=file;return {entry,path:file};}catch(error){failure=error;this.activePath=undefined;}
    throw failure instanceof Error?failure:new Error('activity_log_unavailable');
  }
  path(){return this.activePath??this.preferredPath;}
  repair(file=this.path()):ActivityLogRepairReceipt{
    if(this.repairing)throw new Error('activity_log_repair_in_progress');
    this.repairing=true;const lock=`${file}.repair.lock`,journal=`${file}.repair.json`;let lockFd:number|undefined;
    try{
      fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o750});
      try{lockFd=fs.openSync(lock,'wx',0o600);}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw new Error('activity_log_repair_in_progress');throw error;}
      recoverInterruptedRepair(file,journal);
      const raw=fs.existsSync(file)?fs.readFileSync(file):Buffer.alloc(0),beforeSha256=createHash('sha256').update(raw).digest('hex'),parsed=parseActivityLines(raw.toString('utf8'));
      const canonical=Buffer.from(parsed.entries.map(entry=>JSON.stringify(entry)).join('\n')+(parsed.entries.length?'\n':'')),afterSha256=createHash('sha256').update(canonical).digest('hex');
      if(beforeSha256===afterSha256)return{schema:'agent-control.activity-repair/v1',status:'NO_CHANGE',path:file,backup:null,beforeSha256,afterSha256,retained:parsed.entries.length,removed:0,at:new Date().toISOString(),integrity:'PASS'};
      const backup=`${file}.repair-${beforeSha256.slice(0,16)}.bak`;
      if(!fs.existsSync(backup)){fs.writeFileSync(backup,raw,{mode:0o400,flag:'wx',flush:true});if(process.platform!=='win32')fs.chmodSync(backup,0o400);}
      fs.writeFileSync(journal,`${JSON.stringify({schema:'agent-control.activity-repair-journal/v1',file,backup,beforeSha256,afterSha256,phase:'BACKED_UP'})}\n`,{mode:0o600,flush:true});
      // Preserve the pathname's inode: open O_RDWR, truncate and rewrite in place.
      // Existing O_APPEND writers therefore continue appending to the canonical file.
      const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_RDWR,0o640);
      try{fs.ftruncateSync(fd,0);if(canonical.length)fs.writeSync(fd,canonical,0,canonical.length,0);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
      const verified=fs.readFileSync(file);if(createHash('sha256').update(verified).digest('hex')!==afterSha256)throw new Error('activity_log_repair_continuity_unproved');
      fs.writeFileSync(journal,`${JSON.stringify({schema:'agent-control.activity-repair-journal/v1',file,backup,beforeSha256,afterSha256,phase:'COMMITTED'})}\n`,{mode:0o600,flush:true});fs.unlinkSync(journal);
      return{schema:'agent-control.activity-repair/v1',status:'REPAIRED',path:file,backup,beforeSha256,afterSha256,retained:parsed.entries.length,removed:parsed.removed,at:new Date().toISOString(),integrity:'PASS'};
    }finally{if(lockFd!==undefined)fs.closeSync(lockFd);try{fs.unlinkSync(lock);}catch{}this.repairing=false;}
  }
}

function recoverInterruptedRepair(file:string,journal:string){
  if(!fs.existsSync(journal))return;
  let prior:Record<string,unknown>;
  try{prior=JSON.parse(fs.readFileSync(journal,'utf8')) as Record<string,unknown>;}catch{throw new Error('activity_log_repair_journal_invalid');}
  if(prior.schema!=='agent-control.activity-repair-journal/v1'||prior.file!==file||typeof prior.backup!=='string'||typeof prior.beforeSha256!=='string'||typeof prior.afterSha256!=='string')throw new Error('activity_log_repair_journal_invalid');
  const current=fs.existsSync(file)?fs.readFileSync(file):Buffer.alloc(0),currentSha=createHash('sha256').update(current).digest('hex');
  if(currentSha===prior.afterSha256||currentSha===prior.beforeSha256){fs.unlinkSync(journal);return;}
  const backup=fs.readFileSync(prior.backup),backupSha=createHash('sha256').update(backup).digest('hex');
  if(backupSha!==prior.beforeSha256)throw new Error('activity_log_repair_backup_integrity_failed');
  // A crash can leave an empty or partially rewritten canonical file. Restore the
  // immutable pre-repair bytes in place, keeping the inode used by live writers,
  // then let the normal repair pass canonicalise it again.
  const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_RDWR,0o640);
  try{fs.ftruncateSync(fd,0);if(backup.length)fs.writeSync(fd,backup,0,backup.length,0);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.unlinkSync(journal);
}

function parseActivityLines(raw:string){const entries:ActivityLogEntry[]=[],ids=new Set<string>();let previous=-Infinity,removed=0;for(const line of raw.split(/\r?\n/)){if(!line.trim())continue;let value:unknown;try{value=JSON.parse(line);}catch{removed++;continue;}if(!validActivity(value)){removed++;continue;}const time=Date.parse(value.timestamp);if(ids.has(value.eventId)||time<previous){removed++;continue;}ids.add(value.eventId);previous=time;entries.push(value);}return{entries,removed};}
function validActivity(value:unknown):value is ActivityLogEntry{if(!value||typeof value!=='object'||Array.isArray(value))return false;const row=value as Record<string,unknown>;return row.schema==='agent-control.activity/v1'&&typeof row.timestamp==='string'&&Number.isFinite(Date.parse(row.timestamp))&&typeof row.eventId==='string'&&row.eventId.startsWith('activity-')&&typeof row.runId==='string'&&typeof row.eventType==='string'&&typeof row.status==='string';}

export function createActivityLogProjection(stateRoot:string,environment:NodeJS.ProcessEnv=process.env,platform:NodeJS.Platform=process.platform){const paths=activityLogPaths(stateRoot,environment,platform);return new ActivityLogProjection(paths.preferred,paths.fallback);}

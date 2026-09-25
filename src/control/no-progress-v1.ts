import {createHmac, randomBytes} from 'node:crypto';

export type ProgressKind='NEW_INFORMATION'|'STATE_CHANGE'|'NEW_ENTITY'|'NEW_RESULT'|'NEW_ERROR_INFORMATION'|'NEW_TOOL_CAPABILITY'|'SUBGOAL_COMPLETION'|'VERIFICATION_PROGRESS';
export type RepeatException='POLLING'|'PAGINATION'|'TRANSIENT_RETRY'|'MONITORING'|'INTENTIONAL_REPEAT'|'UNCONFIRMED_EFFECT';
export type ProgressStatus='PROGRESS'|'EXEMPT'|'OBSERVING_REPEAT'|'NO_PROGRESS_WARNING'|'RECOVERY_REQUIRED'|'REPLANNING'|'ESCALATION_REQUIRED'|'TERMINATED_NO_PROGRESS';
export interface NoProgressInteraction {toolId:string;input:unknown;result:unknown;effect?:'READ'|'WRITE'|'UNKNOWN';exception?:RepeatException;progress?:ProgressKind[];stateVersion?:string|number;operation?:string;target?:string;}
export interface NoProgressThresholds {observe:number;warning:number;recovery:number;replan:number;escalation:number;terminate:number;}
export interface NoProgressEvidence {schema:'agent-control.no-progress-v1/evidence';toolId:string;requestFingerprint:string;resultFingerprint:string;pairFingerprint:string;status:ProgressStatus;repeatCount:number;cycleLength:number|null;recoveryLevel:0|1|2|3|4|5;progressKinds:ProgressKind[];exception:RepeatException|null;}
export interface NoProgressOptions {key?:Buffer;thresholds?:Partial<NoProgressThresholds>;record?:(event:NoProgressEvidence)=>void;}

const DEFAULT_THRESHOLDS:NoProgressThresholds={observe:2,warning:3,recovery:5,replan:6,escalation:8,terminate:10};
const VOLATILE=new Set(['requestId','request_id','traceId','trace_id','timestamp','receivedAt','received_at','serverTime','server_time','date','x-request-id','x-trace-id']);
const ENVELOPES=new Set(['metadata','meta','transport','headers']);

function maybeJson(value:string):unknown {
  const trimmed=value.trim();
  if(!trimmed.startsWith('{')&&!trimmed.startsWith('['))return value;
  try{return JSON.parse(trimmed);}catch{return value;}
}
function normalUrl(value:string):string {
  try {const parsed=new URL(value);if(!['http:','https:'].includes(parsed.protocol))return value;parsed.hash='';parsed.searchParams.sort();return parsed.toString();}
  catch{return value;}
}
function normal(value:unknown,parent='',key=''):unknown {
  if(typeof value==='string'){
    if(key==='url')return normalUrl(value);
    if(key==='method')return value.toUpperCase();
    if(['params','body','arguments'].includes(key)){const parsed=maybeJson(value);return parsed===value?value:normal(parsed,key);}
    return value;
  }
  if(Array.isArray(value))return value.map(item=>normal(item,parent));
  if(value&&typeof value==='object'){
    const result:Record<string,unknown>={};
    for(const [field,item] of Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b))){
      if((ENVELOPES.has(parent)||parent===''&&['requestId','request_id','traceId','trace_id'].includes(field))&&VOLATILE.has(field))continue;
      result[field]=normal(item,field,field);
    }
    return result;
  }
  return value;
}
function digest(key:Buffer,value:unknown):string{return createHmac('sha256',key).update(JSON.stringify(value)).digest('hex');}
function objectOf(value:unknown):Record<string,unknown>|null{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;}
function inputOperation(input:unknown,explicit?:string):string {
  if(explicit)return explicit;
  const object=objectOf(input);const value=object?.method??object?.operation;
  return typeof value==='string'?value.toUpperCase():'UNSPECIFIED';
}
function inputTarget(input:unknown,explicit?:string):string {
  if(explicit)return explicit;
  const object=objectOf(input);const value=object?.url??object?.target??object?.path??object?.resource;
  return typeof value==='string'?value:'';
}
function displayTarget(value:string):string {
  try {const url=new URL(value);return `${url.protocol}//${url.host}${url.pathname}`.slice(0,160);}
  catch {return value.split('?')[0].split('#')[0].slice(0,160);}
}
export function interactionFingerprints(interaction:Pick<NoProgressInteraction,'toolId'|'input'|'result'|'operation'|'target'>,key:Buffer){
  if(key.length<16)throw Error('no_progress_key_too_short');
  const normalizedInput=normal(interaction.input);
  const requestFingerprint=digest(key,{toolId:interaction.toolId,operation:inputOperation(interaction.input,interaction.operation),target:normalUrl(inputTarget(interaction.input,interaction.target)),args:normalizedInput});
  const resultValue=typeof interaction.result==='string'?maybeJson(interaction.result):interaction.result;
  const resultFingerprint=digest(key,normal(resultValue));
  const pairFingerprint=digest(key,{requestFingerprint,resultFingerprint});
  return {requestFingerprint,resultFingerprint,pairFingerprint};
}
function hasError(result:unknown):boolean {const value=objectOf(typeof result==='string'?maybeJson(result):result);return Boolean(value&&(value.ok===false||value.error!==undefined));}
function validatedThresholds(input:Partial<NoProgressThresholds>|undefined):NoProgressThresholds{
  const value={...DEFAULT_THRESHOLDS,...input};const numbers=Object.values(value);
  if(numbers.some(n=>!Number.isInteger(n)||n<2)||numbers.some((n,i)=>i>0&&n<=numbers[i-1]))throw Error('no_progress_thresholds_invalid');
  return value;
}

/** Metadata-only detector. It observes completed tool interactions and never dispatches or edits a request. */
export class NoProgressDetector {
  readonly thresholds:NoProgressThresholds;
  private readonly key:Buffer;
  private readonly history:string[]=[];
  private readonly lastResultByRequest=new Map<string,string>();
  private readonly knownTargets=new Set<string>();
  private readonly knownTools=new Set<string>();
  private failedResponses=0;
  private successfulWriteResponses=0;
  private previousStateVersion:string|number|undefined;
  constructor(private readonly options:NoProgressOptions={}){this.thresholds=validatedThresholds(options.thresholds);this.key=options.key??randomBytes(32);}
  observe(interaction:NoProgressInteraction):NoProgressEvidence{
    if(!interaction.toolId.trim())throw Error('no_progress_tool_identity_missing');
    const fp=interactionFingerprints(interaction,this.key);
    const target=inputTarget(interaction.input,interaction.target);if(target&&this.knownTargets.size<12)this.knownTargets.add(displayTarget(target));
    this.knownTools.add(interaction.toolId);
    if(hasError(interaction.result))this.failedResponses++;
    else if(interaction.effect==='WRITE')this.successfulWriteResponses++;
    const earlier=this.lastResultByRequest.get(fp.requestFingerprint);
    const resultChanged=earlier!==undefined&&earlier!==fp.resultFingerprint;
    this.lastResultByRequest.set(fp.requestFingerprint,fp.resultFingerprint);
    const stateChanged=interaction.stateVersion!==undefined&&this.previousStateVersion!==undefined&&interaction.stateVersion!==this.previousStateVersion;
    if(interaction.stateVersion!==undefined)this.previousStateVersion=interaction.stateVersion;
    const explicit=interaction.progress??[];
    const exception=interaction.exception??(interaction.effect!=='READ'?'UNCONFIRMED_EFFECT':null);
    let progressKinds:ProgressKind[]=explicit.length?[...new Set(explicit)]:[];
    if(stateChanged&&!progressKinds.includes('STATE_CHANGE'))progressKinds.push('STATE_CHANGE');
    if(resultChanged&&!progressKinds.length)progressKinds=[hasError(interaction.result)?'NEW_ERROR_INFORMATION':'NEW_INFORMATION'];
    let status:ProgressStatus='PROGRESS',repeatCount=1,cycleLength:number|null=null;
    if(exception){status='EXEMPT';this.history.length=0;}
    else if(progressKinds.length){this.history.length=0;}
    else {
      this.history.push(fp.pairFingerprint);if(this.history.length>48)this.history.shift();
      const repeat=this.repetition();repeatCount=repeat.count;cycleLength=repeat.cycleLength;
      if(repeatCount===1)progressKinds=[hasError(interaction.result)?'NEW_ERROR_INFORMATION':'NEW_RESULT'];
      else if(repeatCount>=this.thresholds.terminate)status='TERMINATED_NO_PROGRESS';
      else if(repeatCount>=this.thresholds.escalation)status='ESCALATION_REQUIRED';
      else if(repeatCount>=this.thresholds.replan)status='REPLANNING';
      else if(repeatCount>=this.thresholds.recovery)status='RECOVERY_REQUIRED';
      else if(repeatCount>=this.thresholds.warning)status='NO_PROGRESS_WARNING';
      else status='OBSERVING_REPEAT';
    }
    const recoveryLevel:NoProgressEvidence['recoveryLevel']=status==='TERMINATED_NO_PROGRESS'?5:status==='ESCALATION_REQUIRED'?4:status==='REPLANNING'?3:status==='RECOVERY_REQUIRED'?2:status==='NO_PROGRESS_WARNING'?1:0;
    const event:NoProgressEvidence={schema:'agent-control.no-progress-v1/evidence',toolId:interaction.toolId,...fp,status,repeatCount,cycleLength,recoveryLevel,progressKinds,exception};
    this.options.record?.(event);
    return event;
  }
  private repetition():{count:number;cycleLength:number|null}{
    const h=this.history,n=h.length;if(n<2)return{count:1,cycleLength:null};
    let best={count:1,cycleLength:null as number|null};
    for(let length=1;length<=3;length++){
      if(n<=length||h[n-1]!==h[n-1-length])continue;
      let count=1;while(n-1-count*length>=0&&h[n-1]===h[n-1-count*length])count++;
      if(count>=3&&length>1&&n>=2*length){
        const previous=h.slice(n-2*length,n-length),latest=h.slice(n-length);
        if(previous.some((item,i)=>item!==latest[i]))count=2;
      }
      if(count>best.count)best={count,cycleLength:length};
    }
    return best;
  }
  /** Ephemeral model-visible facts from prior requests/results; no verifier or answer information. */
  summary(availableToolIds:string[]):string{
    const targets=[...this.knownTargets].slice(-8).map(value=>value.replace(/[\r\n\t]/g,' '));
    return `Known targets from your prior tool requests: ${targets.length?targets.join('; '):'none recorded'}. Successful write responses: ${this.successfulWriteResponses}. Error responses: ${this.failedResponses}. Tool families used: ${[...this.knownTools].join(', ')||'none'}. Available granted tools: ${availableToolIds.join(', ')||'none'}. These are observations, not proof that the task is complete.`;
  }
}

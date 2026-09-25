import type {DiagnosticEvent,DiagnosticEventType} from './diagnostic-types.js';

export const DIAGNOSTIC_CLASSIFIER_VERSION='diagnostic-context/2.0.0';
export interface DiagnosticClassification {
 version:string; disposition:'FAILURE'|'INFORMATIONAL'|'UNCERTAIN';
 sourceSeverity:DiagnosticEvent['severity']; confidence:'HIGH'|'MEDIUM'|'LOW';
 rationale:string[]; temporal:'HISTORICAL'|'UNKNOWN'; incidentStatus:'UNKNOWN'|'RESOLVED';
 recoveryKey?:string; recoveryEvidenceRefs?:string[]; duplicateOf?:string;
}
/** Strip only a recognisable transport envelope; command descriptions remain inert evidence. */
export function diagnosticMessage(message:string){return message.replace(/^\d{4}-\d\d-\d\dT\S+\s+\S+\s+[^\s:]+:\s*/, '').trim();}
export function classifyDiagnosticEvent(message:string,row:Record<string,unknown>={},timestamp:string|null=null){
 const m=diagnosticMessage(message),level=String(row.level??row.severity??'').toLowerCase(),priority=Number(row.PRIORITY);
 const sourceSeverity:DiagnosticEvent['severity']=row.PRIORITY!==undefined&&Number.isFinite(priority)?priority<=3?'ERROR':priority===4?'WARNING':'INFO':/^(error|fatal|critical)$/.test(level)?'ERROR':/^warn(?:ing)?$/.test(level)?'WARNING':/^info$/.test(level)?'INFO':'UNKNOWN';
 const result=(type:DiagnosticEventType,severity:DiagnosticEvent['severity'],disposition:DiagnosticClassification['disposition'],reason:string,confidence:DiagnosticClassification['confidence']='MEDIUM')=>({type,severity,classification:{version:DIAGNOSTIC_CLASSIFIER_VERSION,disposition,sourceSeverity,confidence,rationale:[reason,'Historical evidence alone does not establish a current incident.'],temporal:timestamp?'HISTORICAL':'UNKNOWN',incidentStatus:'UNKNOWN'} as DiagnosticClassification});
 const info=(reason:string)=>result('INFO','INFO','INFORMATIONAL',reason);
 const uncertain=(reason:string)=>result('UNKNOWN','UNKNOWN','UNCERTAIN',reason,'LOW');
 // Reporter outcome and the reported subject's status are separate facts. Never scan a quoted command as an event.
 const outcome=m.match(/\boutcome=(ok|error|failed|timeout)\s+result=/i);
 if(outcome){
  if(outcome[1]?.toLowerCase()!=='ok')return result(outcome[1]?.toLowerCase()==='timeout'?'TIMEOUT':'ERROR','ERROR','FAILURE','An explicit outer operation outcome reports failure; command options and quoted output do not establish its cause.');
  const payload=m.slice(m.indexOf(outcome[0])+outcome[0].length);
  if(/\bstatus['"]?\s*[:=]\s*['"]?(?:fail(?:ed)?|warn|unknown)\b|['"]?(?:unhealthy_count|non_healthy)['"]?\s*:\s*[1-9]\d*/i.test(payload))return uncertain('The probe completed, but its nested result needs freshness, subject and impact review; it is not a new active incident.');
  return info('The outer operation succeeded. Embedded commands and result text are not independent failure events.');
 }
 // Explicit job outcomes survive arbitrary words in descriptions.
 const status=String(row.status??'').toUpperCase(),event=String(row.eventType??row.event_type??'');
 if(/^(FAILED|ERROR)$/.test(status)||/^(?:job|run|step)[._-]failed$/i.test(event))return result('JOB_FAILURE','ERROR','FAILURE','An explicit structured Job outcome records failure.');
 if(/^(SUCCEEDED|COMPLETED)$/.test(status)||/^(?:job|run)[._-]completed$/i.test(event))return result('JOB_SUCCESS','INFO','INFORMATIONAL','An explicit structured Job outcome records completion.');
 if(status==='RUNNING'||/^(?:job|run)[._-]started$/i.test(event))return result('JOB_START','INFO','INFORMATIONAL','The structured record reports execution beginning.');
 if(/^(?:example|sample|documentation|quoted (?:message|example))\s*:/i.test(m))return info('The record explicitly introduces quoted/example text, not an observed failure.');
 if(/^(?:no (?:errors?|failures?|timeouts?)(?: (?:were )?(?:found|detected|observed))?|(?:error|failure|timeout) count[=: ]+0)\.?$/i.test(m))return info('The complete statement explicitly negates the failure; this is not proof of general health.');
 if(/\b(?:retry (?:succeeded|successful)|recovered successfully|operation recovered)\b/i.test(m)){
  const r=info('An explicit recovery statement is recorded; resolution requires a matching operation identity and earlier evidence.');
  const key=row.operationId??row.requestId??row.jobId;
  if(typeof key==='string'&&key)r.classification.recoveryKey=key;
  return r;
 }
 if(/^(?:Starting|Started|Finished|Stopped)\s+\S+\.(?:service|scope)(?:\s+-\s+|[ .]|$)/.test(m))return info('A service lifecycle record reports its state; words inside the trailing command description are not execution results.');
 const statement=m.replace(/(['"])(?:\\.|(?!\1).)*\1/g,'[quoted]').replace(/\b\w*(?:Timeout|Error|Failed)\w*\s*=\s*\S+/gi,'[option]');
 if(/\b(?:no|without)\s+(?:errors?|failures?|timeouts?)\b/i.test(statement)&&/\b(?:failed|error|timed out)\b/i.test(statement))return uncertain('Mixed negative and failure wording requires contextual review; no active incident is asserted.');
 const record=(type:DiagnosticEventType,reason:string,severity:DiagnosticEvent['severity']='ERROR')=>{
  const r=result(type,severity,'FAILURE',reason);
  const key=row.operationId??row.requestId??row.jobId;if(typeof key==='string'&&key)r.classification.recoveryKey=key;
  return r;
 };
 // Event patterns are applied to event statements, not substring matches in option names or quoted programs.
 if(/(?:CUDA|VRAM|GPU|NVRM).*(?:out of memory|alloc.*fail|\berror\b|Xid|pressure)|(?:alloc.*fail|out of memory).*(?:CUDA|GPU|VRAM)/i.test(statement))return record('GPU_PRESSURE','The event statement explicitly reports accelerator pressure/failure.');
 if(/out of memory|oom.kill|oom-kill|killed process|memory pressure|memory cgroup out/i.test(statement))return record('MEMORY_PRESSURE','The event statement reports memory pressure or an OOM action.');
 if(/no space left|disk.*(?:full|pressure)|ENOSPC/i.test(statement))return record('DISK_PRESSURE','The statement reports storage exhaustion.');
 if(/alloc.*(?:fail|\berror\b)|failed.*alloc|context.*(?:too large|exceed)/i.test(statement))return record('ALLOCATION_FAILURE','An allocation failure is explicitly reported.');
 if(/\b(?:denied|rejected)\b/i.test(statement)||/apparmor="DENIED"/.test(m))return record('ERROR','An operation was denied or rejected. Expected containment versus unintended failure requires operator judgement.','WARNING');
 if(/main process exited/i.test(statement)){
  if(/\bstatus=0(?:\/SUCCESS)?(?:\s|[.,]|$)/i.test(m))return info('The process exited with explicit status zero.');
  return record('SERVICE_EXIT','A process exit is recorded; nonzero or incomplete exit details are retained without assuming production impact.');
 }
 if(/segmentation fault|core dumped|service.*(?:exited|crash)/i.test(statement)||row.Action==='die')return record('SERVICE_EXIT','The event reports a process/service exit or crash.');
 if(/scheduled restart|restart counter|restart loop|restarting/i.test(statement)||row.Action==='restart')return result('RESTART','WARNING','FAILURE','A restart is observed; recovery and present availability are not established.');
 if(/\b(?:502|503|504)\b|upstream.*(?:failed|unavailable|timed out)|bad gateway/i.test(statement))return record('PROXY_FAILURE','An upstream/proxy failure is explicitly reported.');
 if(/dependency failed|start request repeated too quickly|dependency.*not ready/i.test(statement))return record('DEPENDENCY_FAILURE','The event reports a dependency/start failure.');
 if(/connection (?:refused|reset)|ECONNREFUSED|ECONNRESET|connect\(\) failed/i.test(statement))return record('CONNECTION_FAILURE','The event reports a rejected or reset connection.');
 if(/\b(?:timed? out|timeout|deadline exceeded)\b|reached runtime time limit/i.test(statement)||/Failed with result ['"]timeout['"]/i.test(m))return record('TIMEOUT','The event statement explicitly reports a timeout or runtime time limit.');
 if(/booting|linux version|kernel command line|system boot/i.test(statement))return result('BOOT','INFO','INFORMATIONAL','A boot/lifecycle observation is recorded.');
 if(/shutting down|shutdown|rebooting/i.test(statement))return result('SHUTDOWN','INFO','INFORMATIONAL','A shutdown/lifecycle observation is recorded.');
 if(/model.*(?:load|unload|change)|(?:load|unload).*model/i.test(statement))return result('MODEL_CHANGE','INFO','INFORMATIONAL','The record describes a model lifecycle change.');
 if(/"\s+4\d\d\s|status[=: ]+4\d\d/i.test(m))return result('HTTP_CLIENT_ERROR','WARNING','FAILURE','An explicit HTTP client-error status was recorded.');
 if(/\b(?:error|failed|fatal|exception|critical)\b/i.test(statement)||sourceSeverity==='ERROR')return record('ERROR','The event statement or structured source severity records an error; its cause and current impact remain unknown.');
 if(/^No \S+(?: \S+)? to \w+/i.test(statement))return uncertain('A required object may be absent; the message alone does not establish cause or operational health.');
 if(sourceSeverity==='WARNING')return result('UNKNOWN','WARNING','UNCERTAIN','The source records a warning but the event type and impact are not established.','LOW');
 return info('No explicit failure outcome is established in this bounded event statement; the original evidence remains available.');
}

/** Retain mirrored evidence but do not count it as an independent event or witness. */
export function annotateDiagnosticHistory(events:DiagnosticEvent[]){
 const canonical=new Map<string,DiagnosticEvent>();
 for(const e of [...events].sort((a,b)=>(a.timestamp??'').localeCompare(b.timestamp??''))){
  if(!e.classification)continue;
  const key=e.timestamp?`${e.timestamp}|${diagnosticMessage(e.message)}`:null,prior=key?canonical.get(key):null;
  if(prior&&prior.sourceId!==e.sourceId)e.classification.duplicateOf=prior.id;else if(key)canonical.set(key,e);
  if(e.classification.disposition==='INFORMATIONAL'&&e.classification.recoveryKey){
   for(const old of events)if(old.classification?.disposition==='FAILURE'&&old.classification.recoveryKey===e.classification.recoveryKey&&old.componentId===e.componentId&&old.timestamp&&e.timestamp&&old.timestamp<e.timestamp){old.classification.incidentStatus='RESOLVED';old.classification.recoveryEvidenceRefs=[e.evidenceRef];old.classification.rationale.push('A later explicit recovery with the same operation and component identity is linked.');}
  }
 }
}

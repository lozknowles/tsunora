import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {OwnedProcessManager,type OwnedExecution} from './owned-process.js';
import type {DiagnosticCategory,DiagnosticCollection,DiagnosticPermission,DiagnosticSourceAdapter,DiagnosticSourceRecord} from './diagnostic-types.js';

const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const identity=(p:string)=>{const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink())throw Error('source_not_regular');return`${s.dev}:${s.ino}`;};
const executable=(name:string)=>['/usr/bin','/bin','/usr/sbin'].map(dir=>path.join(dir,name)).find(p=>{try{return fs.statSync(p).isFile();}catch{return false;}});
const commandIdentity=(p:string)=>{const s=fs.statSync(p);return`${fs.realpathSync(p)}:${s.dev}:${s.ino}:${s.mtimeMs}`;};
export interface DiagnosticFileSpec {path:string;category:DiagnosticCategory;label:string;componentIds?:string[];format?:'JSONL'|'TEXT';}
export const standardDiagnosticFiles:DiagnosticFileSpec[]=[
 {path:'/var/log/syslog',category:'SYSTEM',label:'System syslog'},
 {path:'/var/log/kern.log',category:'KERNEL',label:'Kernel log'},
 {path:'/var/log/auth.log',category:'SECURITY',label:'Authentication log'},
 ...['nginx','apache2'].flatMap(service=>['error','access'].map(kind=>({path:`/var/log/${service}/${kind}.log`,category:'PROXY' as const,label:`${service} ${kind}`,componentIds:[`service:${service}`]}))),
];
function record(adapterId:string,category:DiagnosticCategory,label:string,target:string,locator:DiagnosticSourceRecord['locator'],componentIds:string[],format:DiagnosticSourceRecord['format'],idn:string,sizeBytes:number|null,access:DiagnosticSourceRecord['access']='AVAILABLE'):DiagnosticSourceRecord{return{id:`source-${hash(adapterId+':'+target).slice(0,20)}`,adapterId,category,label,target,locator,componentIds,format,identity:hash(idn),sizeBytes,access,metadataOnly:true,sensitivity:category==='SECURITY'?'SECURITY':'OPERATIONAL'};}
function empty(source:DiagnosticSourceRecord,status:DiagnosticCollection['status']):DiagnosticCollection{return{sourceId:source.id,status,text:'',bytesRead:0,truncated:false,sampling:'no content read',locator:{}};}

/** Only administrator-configured paths, never paths from a request or evidence. */
export class DiagnosticFileAdapter implements DiagnosticSourceAdapter {
 readonly id='linux-files/v1';
 constructor(private files:DiagnosticFileSpec[]=standardDiagnosticFiles){}
 async enumerate(){const sources:DiagnosticSourceRecord[]=[];for(const spec of this.files){try{const idn=identity(spec.path),s=fs.lstatSync(spec.path);let access:DiagnosticSourceRecord['access']='AVAILABLE';try{fs.accessSync(spec.path,fs.constants.R_OK);}catch{access='DENIED';}sources.push(record(this.id,spec.category,spec.label,spec.path,{path:spec.path,dev:s.dev,ino:s.ino},spec.componentIds??[spec.category==='KERNEL'?'resource:kernel':'host:controller'],spec.format??'TEXT',idn,s.size,access));}catch{/* Absence is metadata, not a content read. */}}return{sources};}
 async collect(source:DiagnosticSourceRecord,permission:DiagnosticPermission,signal:AbortSignal):Promise<DiagnosticCollection>{
  signal.throwIfAborted();let fd:number|undefined;
  try{const filename=String(source.locator.path);if(!this.files.some(f=>f.path===filename))return empty(source,'DENIED');
   if(hash(identity(filename))!==permission.sourceIdentities[source.id])return empty(source,'IDENTITY_CHANGED');
   fd=fs.openSync(filename,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));const s=fs.fstatSync(fd);
   if(!s.isFile()||hash(`${s.dev}:${s.ino}`)!==permission.sourceIdentities[source.id])return empty(source,'IDENTITY_CHANGED');
   const length=Math.min(s.size,permission.bounds.maxBytesPerSource),start=Math.max(0,s.size-length),buffer=Buffer.alloc(length),read=fs.readSync(fd,buffer,0,length,start);signal.throwIfAborted();
   let text=buffer.subarray(0,read).toString('utf8');if(start>0){const newline=text.indexOf('\n');text=newline<0?'':text.slice(newline+1);}
   return{sourceId:source.id,status:'COLLECTED',text,bytesRead:read,truncated:start>0,sampling:start>0?'bounded tail; partial first line discarded':'whole file within byte cap; time filter follows',locator:{byteStart:start,byteEnd:start+read,inode:s.ino}};
  }catch(e){if(signal.aborted)throw Error('diagnostic_cancelled');return empty(source,(e as NodeJS.ErrnoException).code==='EACCES'?'DENIED':'UNAVAILABLE');}finally{if(fd!==undefined)fs.closeSync(fd);}
 }
}

/** Fixed argument vectors only. Read helpers are owned and cancelled; services are never signalled. */
export class LinuxDiagnosticAdapter implements DiagnosticSourceAdapter {
 readonly id='linux-journal-containers/v1';
 private runner:OwnedExecution=new OwnedProcessManager();
 async enumerate(context:Parameters<DiagnosticSourceAdapter['enumerate']>[0]){
  const sources:DiagnosticSourceRecord[]=[],components:NonNullable<Awaited<ReturnType<DiagnosticSourceAdapter['enumerate']>>['components']>=[],edges:NonNullable<Awaited<ReturnType<DiagnosticSourceAdapter['enumerate']>>['edges']>=[];
  if(process.platform!=='linux')return{sources};
  const journal=executable('journalctl'),dmesg=executable('dmesg');
  if(journal){for(const [category,label,kind,ids] of [['SYSTEM','System journal (non-auth syslog facilities, boot/shutdown)','journal',['host:controller']],['KERNEL','Kernel journal (OOM and accelerator events)','kernel',['resource:kernel']]] as const)sources.push(record(this.id,category,label,`journal:${kind}`,{command:journal,kind},[...ids],'JOURNAL_JSONL',commandIdentity(journal),null));
   const systemctl=executable('systemctl');if(systemctl){const list=await this.runner.runProcess({command:systemctl,args:['list-units','--type=service','--all','--no-pager','--plain','--no-legend'],maxOutputBytes:65536},context.signal);
    const units=list.stdout.split('\n').map(l=>l.trim().split(/\s+/)[0]).filter((x):x is string=>Boolean(x&&/^[a-zA-Z0-9@_.:-]+\.service$/.test(x))).slice(0,64);
    for(const unit of units){const id=`service:${unit}`,category:DiagnosticCategory=/llama|model|ollama|vllm/i.test(unit)?'MODEL_RUNTIME':/nginx|apache|proxy/i.test(unit)?'PROXY':/ssh|auth/i.test(unit)?'SECURITY':'SERVICE';sources.push(record(this.id,category,`${unit} journal`,`journal:unit:${unit}`,{command:journal,kind:'unit',unit},[id],'JOURNAL_JSONL',commandIdentity(journal)+':'+unit,null));components.push({id,label:unit,kind:'SERVICE',nodeId:'controller',attributes:{},provenance:[{adapterId:this.id,method:'systemctl list-units (metadata only)'}]});
     const show=await this.runner.runProcess({command:systemctl,args:['show',unit,'--property=Requires,Wants,After','--no-pager'],maxOutputBytes:4096},context.signal);
     for(const line of show.stdout.split('\n')){const [key,values]=line.split('=');for(const dep of (values??'').split(' ').filter(s=>s.endsWith('.service')))edges.push({from:id,to:`service:${dep}`,kind:key==='Requires'?'DEPENDS_ON':'RELATED',authority:'CONFIGURED',evidence:`systemctl ${key}; ordering and Wants do not establish a runtime dependency`});}
    }
   }
  }
  if(dmesg)sources.push(record(this.id,'KERNEL','Kernel ring buffer (timestamp availability varies)','dmesg',{command:dmesg,kind:'dmesg'},['resource:kernel'],'TEXT',commandIdentity(dmesg),null));
  for(const engine of ['docker','podman']){const command=executable(engine);if(!command)continue;const result=await this.runner.runProcess({command,args:['ps','--all','--no-trunc','--format','{{.ID}}\t{{.Names}}'],maxOutputBytes:32768},context.signal);if(result.exitCode!==0)continue;
   for(const line of result.stdout.split('\n').slice(0,24)){const [id,name]=line.split('\t');if(!id||!/^\w{12,64}$/.test(id))continue;const component=`container:${id}`;components.push({id:component,label:(name??id).slice(0,120),kind:'CONTAINER',nodeId:'controller',attributes:{engine},provenance:[{adapterId:this.id,method:`${engine} ps metadata`}]});for(const kind of ['container-logs','container-events'])sources.push(record(this.id,'CONTAINER',`${engine} ${name??id} ${kind}`,`${engine}:${id}:${kind}`,{command,kind,container:id},[component],kind==='container-events'?'JSONL':'TEXT',commandIdentity(command)+':'+id+':'+kind,null));}
  }
  return{sources,components,edges};
 }
 async collect(source:DiagnosticSourceRecord,p:DiagnosticPermission,signal:AbortSignal,owned?:OwnedExecution):Promise<DiagnosticCollection>{
  signal.throwIfAborted();const l=source.locator,kind=String(l.kind),command=String(l.command);let args:string[];
  if(!['journal','kernel','unit','dmesg','container-logs','container-events'].includes(kind))return empty(source,'DENIED');
  try{const expected=commandIdentity(command)+(kind==='unit'?':'+String(l.unit):kind.startsWith('container')?':'+String(l.container)+':'+kind:'');if(hash(expected)!==p.sourceIdentities[source.id])return empty(source,'IDENTITY_CHANGED');}catch{return empty(source,'UNAVAILABLE');}
  if(kind.startsWith('container'))args=kind==='container-logs'?['logs','--timestamps','--since',p.bounds.since,'--until',p.bounds.until,'--tail',String(p.bounds.maxLinesPerSource),String(l.container)]:['events','--since',p.bounds.since,'--until',p.bounds.until,'--filter',`container=${l.container}`,'--format','{{json .}}'];
  else if(kind==='dmesg')args=['--time-format','iso','--since',p.bounds.since,'--until',p.bounds.until,...(p.scope==='ERRORS_ONLY'?['--level','emerg,alert,crit,err']:[])];
  else args=['--no-pager','--output=json','--reverse','--since',p.bounds.since,'--until',p.bounds.until,'--lines',String(p.bounds.maxLinesPerSource),...(kind==='kernel'?['--dmesg']:kind==='unit'?['--unit',String(l.unit)]:[]),...(p.scope==='ERRORS_ONLY'?['--priority','0..3']:[]),...(kind==='journal'?Array.from({length:24},(_,i)=>i).filter(i=>i!==4&&i!==10).map(i=>`SYSLOG_FACILITY=${i}`):[])];
  const timer=AbortSignal.timeout(p.bounds.timeoutMs),combined=AbortSignal.any([signal,timer]);
  try{const result=await(owned??this.runner).runProcess({command,args,maxOutputBytes:p.bounds.maxBytesPerSource},combined);signal.throwIfAborted();if(result.exitCode!==0)return empty(source,'UNAVAILABLE');const text=kind==='container-logs'?result.stdout+'\n'+result.stderr:result.stdout,bytes=Buffer.byteLength(text);return{sourceId:source.id,status:'COLLECTED',text,bytesRead:bytes,truncated:bytes>=p.bounds.maxBytesPerSource||text.split('\n').length>=p.bounds.maxLinesPerSource,sampling:'bounded command window; access restrictions may hide records; count is a lower bound',locator:{kind,windowStart:p.bounds.since,windowEnd:p.bounds.until}};}catch{signal.throwIfAborted();return empty(source,'UNAVAILABLE');}
 }
}

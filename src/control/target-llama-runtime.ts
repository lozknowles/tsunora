import type {TargetReset} from './target-reset.js';
import {assessRuntimeExecution} from './runtime-benchmark-provenance.js';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import type {ResourceConfig} from './config.js';
import type {ActionContext} from './job-types.js';
import {sshResourceArgs} from './managed-node-ssh.js';
import {OwnedProcessManager,type OwnedExecution} from './owned-process.js';
import type {TransportLabProfile} from './transport-llama-lab-adapter.js';
import type {TargetObservation,TargetTelemetry} from './runtime-target-telemetry.js';
export interface RuntimeTarget {
 resource:ResourceConfig; environment:string; telemetry:'android-termux'|'linux'; stateDirectory:string;
 adb?:{executable:string;host:string;port:number;serial:string;expectedSerial:string};
 originalService?:{args:string[];cwd:string;environment?:Record<string,string>};
}
const helper=()=>fs.readFileSync(fileURLToPath(new URL('../../assets/runtime/llama-invocation.py',import.meta.url)),'utf8');
export function validateRuntimeTarget(t:RuntimeTarget){
 if(!t||!t.resource||!['local','ssh'].includes(t.resource.transport.type)||!['android-termux','linux'].includes(t.telemetry)||!t.environment||!t.stateDirectory.startsWith('/')||t.stateDirectory.includes('..'))throw Error('runtime_target_invalid');
 if(t.resource.transport.type==='ssh'){
  const r=t.resource.transport;if(!r.host||!/^[a-zA-Z0-9.:-]+$/.test(r.host)||r.user&&!/^[a-zA-Z0-9_-]+$/.test(r.user)||r.port&&(!Number.isInteger(r.port)||r.port<1||r.port>65535))throw Error('runtime_transport_invalid');
 }
 if(t.telemetry==='android-termux'){
  const a=t.adb;if(!a||!a.executable.startsWith('/')||a.host!=='127.0.0.1'||!Number.isInteger(a.port)||a.port<1||a.port>65535||!a.serial||!a.expectedSerial)throw Error('runtime_android_route_invalid');
 }
 if(t.originalService&&(!t.originalService.args?.length||!t.originalService.args[0].startsWith('/')||!t.originalService.args.includes('--port')||!/^[0-9]+$/.test(t.originalService.args[t.originalService.args.indexOf('--port')+1])||!t.originalService.cwd.startsWith('/')))throw Error('runtime_service_invalid');
 return structuredClone(t);
}
export class TargetLlamaRuntime implements TargetTelemetry {
 recoveryFence?:TargetReset;
 private readonly generations=new WeakMap<object,number>();
 readonly id:string; readonly target:RuntimeTarget;
 constructor(target:RuntimeTarget){this.target=validateRuntimeTarget(target);this.id=target.telemetry;}
 producer(c:ActionContext){return {component:'agent-control-runtime',worker:c.worker.id,adapter:this.id,target:this.target.resource.id,environment:this.target.environment,targetLabel:this.target.resource.name,transport:this.target.resource.transport.type,runId:c.run.id,stepId:c.step.id,provenance:'AGENT_CONTROL_RUNTIME_EVIDENCE'};}
 async execute(operation:'observe'|'invoke'|'abort'|'verify-cleanup',c:ActionContext,payload:Record<string,unknown>={},owned:OwnedExecution=c.ownedExecution,signal:AbortSignal=c.signal){
  const fence=this.recoveryFence;if(fence){fence.assertAttempt(payload.attemptId);if(!this.generations.has(c))this.generations.set(c,fence.generation());fence.assertGeneration(this.generations.get(c)!);}
  const assertFence=()=>{if(fence)fence.assertGeneration(this.generations.get(c)!);};
  const source=helper(),request={operation,stateDirectory:this.target.stateDirectory,originalService:this.target.originalService??null,...payload,producer:this.producer(c)};
  const input=source+'\nprint(json.dumps({"runtimeResult":dispatch(json.loads('+JSON.stringify(JSON.stringify(request))+'))}),flush=True)\n';
  const remote=this.target.resource.transport.type==='ssh';
  const args=remote?['-o','StrictHostKeyChecking=yes',...sshResourceArgs(this.target.resource,['python3','-'])]:['-'];
  const command=remote?'ssh':'python3';
  c.recordEvidence?.('runtime-target-request',{operation,producer:this.producer(c),helperSha256:createHash('sha256').update(source).digest('hex'),at:new Date().toISOString()});
  let persistenceError:unknown;const lifecycle:any[]=[];
  const result=await owned.runProcess({command,args,input,maxOutputBytes:4000000,session:{remoteTransport:remote,adapterId:'target-llama-runtime-v1',commandLabel:'Governed target runtime '+operation,crewRole:'resource-guardian'},onStdoutLine:line=>{try{assertFence();}catch(e){persistenceError=e;return;}let row:any;try{row=JSON.parse(line);}catch{return;}if(row.runtimeEvent)try{lifecycle.push(row.runtimeEvent);c.recordEvidence?.('runtime-lifecycle',row.runtimeEvent);}catch(error){persistenceError=error;}}},signal);
  assertFence();
  c.recordEvidence?.('runtime-target-response',{operation,producer:this.producer(c),pid:result.pid,exitCode:result.exitCode,signal:result.signal,at:new Date().toISOString()});
  if(persistenceError)throw Error('runtime_evidence_persistence_failed');
  if(result.exitCode!==0)throw Error('runtime_target_transport_failed');
  const row=result.stdout.trim().split('\n').map(line=>{try{return JSON.parse(line);}catch{return null;}}).reverse().find((x:any)=>x&&Object.hasOwn(x,'runtimeResult'));
  if(!row)throw Error('runtime_target_response_invalid');
  if(operation==='invoke'){
   const assessment=assessRuntimeExecution(this.producer(c),lifecycle,{pid:result.pid,exitCode:result.exitCode},createHash('sha256').update(source).digest('hex'));
   const receipt=c.recordEvidence?.('runtime-execution-provenance',assessment);
   if(row.runtimeResult?.status==='SUCCEEDED'&&assessment.classification!=='AGENT_CONTROL_RUNTIME_EVIDENCE')throw Error('runtime_native_provenance_incomplete');
   if(row.runtimeResult?.rawResponse)row.runtimeResult.rawResponse.nativeExecutionEvidence=receipt?{id:receipt.id,sha256:receipt.sha256,classification:assessment.classification}:null;
  }
  return row.runtimeResult;
 }
 async platform(c:ActionContext){
  if(this.target.telemetry==='linux')return {batteryPercent:null,charging:null,thermalCelsius:null,thermalStatus:null,evidence:{support:'Battery/Android thermal telemetry not applicable to this Linux adapter'}};
  const a=this.target.adb!,base=['-H',a.host,'-P',String(a.port),'-s',a.serial,'shell'];
  const outputs:Record<string,string>={};
  for(const [name,command] of [['identity',['getprop','ro.serialno']],['battery',['dumpsys','battery']],['thermal',['dumpsys','thermalservice']]] as const){
   c.recordEvidence?.('runtime-telemetry-request',{producer:this.producer(c),field:name,at:new Date().toISOString()});
   const r=await c.ownedExecution.runProcess({command:a.executable,args:[...base,...command],maxOutputBytes:65536},AbortSignal.any([c.signal,AbortSignal.timeout(20000)]));
   if(r.exitCode!==0)throw Error('runtime_telemetry_unavailable');outputs[name]=r.stdout;
   c.recordEvidence?.('runtime-telemetry-response',{producer:this.producer(c),field:name,pid:r.pid,at:new Date().toISOString(),raw:r.stdout});
  }
  if(outputs.identity.trim()!==a.expectedSerial)throw Error('runtime_target_identity_mismatch');
  const n=(pattern:RegExp,s:string)=>{const m=pattern.exec(s);return m?Number(m[1]):null;};
  const powered=[...outputs.battery.matchAll(/(?:AC|USB|Wireless|Dock) powered:\s*(true|false)/g)].map(x=>x[1]==='true');
  const temperature=n(/^\s*temperature:\s*(-?\d+)/m,outputs.battery);
  return {batteryPercent:n(/^\s*level:\s*(\d+)/m,outputs.battery),charging:powered.length?powered.some(Boolean):null,thermalCelsius:temperature===null?null:temperature/10,thermalStatus:n(/^Thermal Status:\s*(\d+)/m,outputs.thermal),evidence:{commands:'Android getprop and dumpsys',parser:'android-termux/v1'}};
 }
 async observe(c:ActionContext):Promise<TargetObservation>{
  const remote=await this.execute('observe',c),platform=await this.platform(c);
  const result={observedAt:new Date().toISOString(),connected:true,...remote,...platform,evidence:{producer:this.producer(c),platform:platform.evidence,targetClock:remote.targetAt}};
  c.recordEvidence?.('runtime-target-observation',result);return result;
 }
 async recover(c:ActionContext,attemptId:string){
  // Recovery has an independent bounded ownership scope; it can only request abort/restoration of this exact invocation.
  const owned=new OwnedProcessManager();try{return await this.execute('abort',c,{attemptId},owned,AbortSignal.timeout(165000));}finally{await owned.terminateAll('runtime-recovery-complete');}
 }
}

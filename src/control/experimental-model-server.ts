import {createHash} from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import type {ExecutionCleanupReport,OwnedExecution,OwnedProcessResult} from './owned-process.js';

export interface ExperimentalModelServerSpec {
  runtimePath:string;
  modelPath:string;
  allowedRuntimeRoot:string;
  allowedModelRoot:string;
  host:'127.0.0.1';
  port:number;
  contextTokens:number;
  gpuLayers:number;
  threads:number;
  minimumAvailableRamBytes:number;
  protectedHealthUrls:string[];
  startupTimeoutMs:number;
  expectedRuntimeSha256?:string;
  expectedModelSha256?:string;
  expectedRuntimeBuild?:string;
}

export interface HostResourceSnapshot {at:string;availableRamBytes:number|null;freeRamBytes:number|null;swapFreeBytes:number|null;}
export interface ProtectedHealth {url:string;status:number;bodySha256:string;}
export interface ExperimentalModelAdmission {
  admittedAt:string;
  runtime:{path:string;sha256:string;build:string};
  model:{path:string;sizeBytes:number;sha256:string};
  settings:{host:string;port:number;contextTokens:number;gpuLayers:number;threads:number};
  resourcesBefore:HostResourceSnapshot;
  protectedBefore:ProtectedHealth[];
  processPid:number;
  executionSessionIds:string[];
}
export interface ExperimentalModelIdentityPreflight {
  inspectedAt:string;
  runtime:{path:string;sha256:string;build:string};
  model:{path:string;sizeBytes:number;sha256:string};
  settings:{host:string;port:number;contextTokens:number;gpuLayers:number;threads:number};
  resources:HostResourceSnapshot;
}
export interface ExperimentalModelCleanup {
  cleanup:ExecutionCleanupReport;
  resourcesAfter:HostResourceSnapshot;
  protectedAfter:ProtectedHealth[];
  serverResult:{exitCode:number|null;signal:string|null;stdout:string;stderr:string;stdoutSha256:string;stderrSha256:string};
  stoppedAt:string;
}

const GiB=1024**3;
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

function within(root:string,target:string){const resolvedRoot=path.resolve(root),resolved=path.resolve(target),relative=path.relative(resolvedRoot,resolved);return relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative);}
function meminfo():HostResourceSnapshot{
  const at=new Date().toISOString();
  try{const values=new Map(fs.readFileSync('/proc/meminfo','utf8').split('\n').map(line=>{const match=/^([^:]+):\s+(\d+)\s+kB$/.exec(line);return match?[match[1]!,Number(match[2])*1024] as const:['',0] as const;}));return{at,availableRamBytes:values.get('MemAvailable')??null,freeRamBytes:values.get('MemFree')??null,swapFreeBytes:values.get('SwapFree')??null};}catch{return{at,availableRamBytes:null,freeRamBytes:null,swapFreeBytes:null};}
}
async function hashFile(file:string){const digest=createHash('sha256');await new Promise<void>((resolve,reject)=>fs.createReadStream(file).on('data',chunk=>digest.update(chunk)).once('error',reject).once('end',resolve));return digest.digest('hex');}
async function portOpen(host:string,port:number){return new Promise<boolean>(resolve=>{const socket=net.createConnection({host,port});const done=(value:boolean)=>{socket.destroy();resolve(value);};socket.setTimeout(500);socket.once('connect',()=>done(true));socket.once('timeout',()=>done(false));socket.once('error',()=>done(false));});}
async function health(url:string):Promise<ProtectedHealth>{const response=await fetch(url,{signal:AbortSignal.timeout(5000)}),body=await response.text();if(!response.ok)throw Error(`protected_service_unhealthy:${url}:${response.status}`);return{url,status:response.status,bodySha256:sha(body)};}
async function healthAll(urls:string[]){return Promise.all(urls.map(health));}

/** Agent Control-owned, bounded host for one explicitly admitted local model file. */
export class ExperimentalModelServer {
  private readonly stopSignal=new AbortController();
  private process?:Promise<OwnedProcessResult>;
  private admission?:ExperimentalModelAdmission;
  private preflight?:ExperimentalModelIdentityPreflight;
  constructor(private readonly spec:ExperimentalModelServerSpec,private readonly owned:OwnedExecution){}

  async inspectIdentity():Promise<ExperimentalModelIdentityPreflight>{
    const s=this.spec;
    if(process.platform!=='linux')throw Error('experimental_model_server_linux_required');
    if(s.host!=='127.0.0.1'||s.port===8080||s.port===8081||s.port<1024||s.port>65535)throw Error('experimental_model_server_endpoint_not_admitted');
    if(!within(s.allowedRuntimeRoot,s.runtimePath)||!within(s.allowedModelRoot,s.modelPath))throw Error('experimental_model_server_path_not_admitted');
    const runtime=fs.statSync(s.runtimePath),model=fs.statSync(s.modelPath);if(!runtime.isFile()||!model.isFile())throw Error('experimental_model_server_file_required');
    if(s.contextTokens<1024||s.contextTokens>32768||s.gpuLayers<0||s.threads<1||s.threads>64)throw Error('experimental_model_server_settings_invalid');
    if(await portOpen(s.host,s.port))throw Error(`experimental_model_server_port_in_use:${s.port}`);
    const resourcesBefore=meminfo();
    if(resourcesBefore.availableRamBytes===null)throw Error('experimental_model_server_available_ram_unknown');
    if(resourcesBefore.availableRamBytes-model.size<s.minimumAvailableRamBytes)throw Error(`experimental_model_server_ram_blocked:available=${resourcesBefore.availableRamBytes}:model=${model.size}:reserve=${s.minimumAvailableRamBytes}`);
    const version=await this.owned.runProcess({command:s.runtimePath,args:['--version'],maxOutputBytes:64*1024,session:{adapterId:'experimental-model-host-v1',commandLabel:'Inspect admitted llama runtime',crewRole:'resource-guardian'}},AbortSignal.timeout(30000));
    if(version.exitCode!==0)throw Error('experimental_model_server_runtime_version_failed');
    const [runtimeSha256,modelSha256]=await Promise.all([hashFile(s.runtimePath),hashFile(s.modelPath)]);
    const build=`${version.stdout}\n${version.stderr}`.trim();
    if(s.expectedRuntimeSha256&&runtimeSha256!==s.expectedRuntimeSha256)throw Error(`experimental_model_server_runtime_digest_mismatch:${runtimeSha256}`);
    if(s.expectedModelSha256&&modelSha256!==s.expectedModelSha256)throw Error(`experimental_model_server_model_digest_mismatch:${modelSha256}`);
    if(s.expectedRuntimeBuild&&!build.includes(s.expectedRuntimeBuild))throw Error(`experimental_model_server_runtime_build_mismatch:${build}`);
    this.preflight={inspectedAt:new Date().toISOString(),runtime:{path:s.runtimePath,sha256:runtimeSha256,build},model:{path:s.modelPath,sizeBytes:model.size,sha256:modelSha256},settings:{host:s.host,port:s.port,contextTokens:s.contextTokens,gpuLayers:s.gpuLayers,threads:s.threads},resources:resourcesBefore};
    return structuredClone(this.preflight);
  }

  async start():Promise<ExperimentalModelAdmission>{
    const s=this.spec,preflight=this.preflight??await this.inspectIdentity(),resourcesBefore=meminfo();
    if(await portOpen(s.host,s.port))throw Error(`experimental_model_server_port_in_use:${s.port}`);
    if(resourcesBefore.availableRamBytes===null)throw Error('experimental_model_server_available_ram_unknown');
    if(resourcesBefore.availableRamBytes-preflight.model.sizeBytes<s.minimumAvailableRamBytes)throw Error(`experimental_model_server_ram_blocked:available=${resourcesBefore.availableRamBytes}:model=${preflight.model.sizeBytes}:reserve=${s.minimumAvailableRamBytes}`);
    const protectedBefore=await healthAll(s.protectedHealthUrls);
    const args=['--model',s.modelPath,'--host',s.host,'--port',String(s.port),'--ctx-size',String(s.contextTokens),'--parallel','1','--threads',String(s.threads),'--n-gpu-layers',String(s.gpuLayers),'--no-warmup'];
    this.process=this.owned.runProcess({command:s.runtimePath,args,maxOutputBytes:2*1024*1024,session:{adapterId:'experimental-model-host-v1',commandLabel:'Governed isolated experimental model server',crewRole:'resource-guardian'}},this.stopSignal.signal);
    void this.process.catch(()=>undefined);
    const deadline=Date.now()+s.startupTimeoutMs;let ready=false;
    while(Date.now()<deadline){if(this.stopSignal.signal.aborted)break;try{const response=await fetch(`http://${s.host}:${s.port}/health`,{signal:AbortSignal.timeout(3000)});if(response.ok){ready=true;break;}}catch{}await delay(1000);}
    if(!ready){await this.stop('startup_failed');throw Error('experimental_model_server_startup_failed');}
    const pids=this.owned.activePids();
    this.admission={admittedAt:new Date().toISOString(),runtime:preflight.runtime,model:preflight.model,settings:preflight.settings,resourcesBefore,protectedBefore,processPid:pids.at(-1)??-1,executionSessionIds:this.owned.sessionIds?.()??[]};
    return structuredClone(this.admission);
  }

  async stop(reason='qualification_complete'):Promise<ExperimentalModelCleanup>{
    this.stopSignal.abort(reason);
    const cleanup=await this.owned.terminateAll(reason),server=await this.process?.then(value=>value,()=>undefined);
    const protectedAfter=await healthAll(this.spec.protectedHealthUrls);
    const stdout=server?.stdout??'',stderr=server?.stderr??'';
    return{cleanup,resourcesAfter:meminfo(),protectedAfter,serverResult:{exitCode:server?.exitCode??null,signal:server?.signal??null,stdout,stderr,stdoutSha256:sha(stdout),stderrSha256:sha(stderr)},stoppedAt:new Date().toISOString()};
  }
}

export const experimentalModelMinimumReserveBytes=8*GiB;

import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import {expandUserPath, type AgentControlConfig, type ResourceConfig} from './config.js';
import {executeSsh, sshResourceArgs, type SshExecutor} from './managed-node-ssh.js';
import type {OwnedExecution} from './owned-process.js';

export const ESTATE_REMOTE_SCHEMA = 'agent-control.estate-remote/v1';
export const ESTATE_REMOTE_METHOD = 'systemd-machine-identity+python-os-metadata/v1';
export const estateResourceAlias = (id:string) => `resource:${createHash('sha256').update(id).digest('hex').slice(0,20)}`;
export type RemoteEstateState = 'DISCOVERED'|'CONNECTING'|'AVAILABLE'|'DEGRADED'|'UNREACHABLE'|'UNAUTHORISED'|'TIMED_OUT'|'INVALID_RESPONSE'|'CANCELLED';
export interface EstateResourceBinding {enabled:boolean; scope:'metadata-only'; authorisationDigest:string; expectedIdentitySha256?:string;}
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const envelopeSchema = z.object({
  schema:z.literal(ESTATE_REMOTE_SCHEMA), method:z.enum([ESTATE_REMOTE_METHOD,'smbios-uuid+cim-metadata/v1','termux-ssh-host-key+android-metadata/v1']),
  resourceAlias:z.string(), nonce:z.string().uuid(), observedAt:z.string().datetime(),
  status:z.enum(['COMPLETE','PARTIAL']),
  host:z.object({identitySha256:sha, platform:z.enum(['linux','windows','android']), identityScope:z.enum(['SYSTEMD_MACHINE_ID','SMBIOS_UUID','SSH_INSTALLATION']).optional(), architecture:z.enum(['x86_64','aarch64','armv7l','i386','i686','ppc64le','s390x','riscv64'])}).strict(),
  cpuCount:z.number().int().positive().max(1_000_000).nullable(),
  memoryBytes:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  cpuModel:z.string().regex(/^[\x20-\x7e]{1,160}$/).nullable().optional(),
  gpuInventory:z.object({status:z.enum(['OBSERVED','UNAVAILABLE']),source:z.enum(['NVIDIA','WINDOWS_CIM']).optional(),devices:z.array(z.object({
    index:z.number().int().min(0).max(1023),model:z.string().regex(/^[\x20-\x7e]{1,160}$/),
    memoryMiB:z.number().int().positive().max(1_000_000_000).nullable(),driver:z.string().regex(/^[0-9][0-9.\-]{0,63}$/)
  }).strict()).max(32)}).strict().optional(),
  deviceModel:z.string().regex(/^[\x20-\x7e]{1,160}$/).nullable().optional(), osVersion:z.string().regex(/^[\x20-\x7e]{1,160}$/).nullable().optional(),
  missing:z.array(z.enum(['CPU_UNAVAILABLE','MEMORY_UNAVAILABLE','PHYSICAL_IDENTITY_UNAVAILABLE'])).max(3)
}).strict();
export type RemoteEstateEnvelope = z.infer<typeof envelopeSchema>;
export type RemoteEstateResult = {state:'AVAILABLE'|'DEGRADED'; envelope:RemoteEstateEnvelope; attempts:1} | {state:Exclude<RemoteEstateState,'DISCOVERED'|'CONNECTING'|'AVAILABLE'|'DEGRADED'>; reason:string; attempts:0|1};
export interface EstateRemoteContext {
  signal:AbortSignal; ownedExecution:OwnedExecution; controllerIdentitySha256:string|null;
  onState?:(state:RemoteEstateState, reason:string)=>void;
}

// Fixed metadata-only program. It opens no files, reads no logs or process
// arguments, and returns no hostname, address, username or raw machine ID.
const collector = fs.readFileSync(new URL('../../scripts/estate-remote-probe.py',import.meta.url),'utf8');
export function estateProbeProgram(resourceAlias:string,nonce:string,platform='linux') {
  const data=Buffer.from(JSON.stringify({resourceAlias,nonce})).toString('base64');
  if(platform==='windows')return `$Request=([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${data}')) | ConvertFrom-Json)\n${fs.readFileSync(new URL('../../scripts/estate-windows-probe.ps1',import.meta.url),'utf8')}`;
  if(!['linux','android'].includes(platform))throw Error('estate_platform_unsupported');
  const source=platform==='android'?fs.readFileSync(new URL('../../scripts/estate-android-probe.py',import.meta.url),'utf8'):collector;
  return `import base64,json\nREQUEST=json.loads(base64.b64decode('${data}'))\n${source}`;
}
export function validateEstateEnvelope(text:string,alias:string,nonce:string,expected?:string,controller?:string|null,platform?:string):RemoteEstateEnvelope {
  if(Buffer.byteLength(text)>32*1024)throw Error('estate_remote_response_too_large');
  const value=envelopeSchema.parse(JSON.parse(text));
  if(platform&&value.host.platform!==platform)throw Error('estate_remote_platform_mismatch');
  const contract={linux:[ESTATE_REMOTE_METHOD,'SYSTEMD_MACHINE_ID'],windows:['smbios-uuid+cim-metadata/v1','SMBIOS_UUID'],android:['termux-ssh-host-key+android-metadata/v1','SSH_INSTALLATION']}[value.host.platform];
  if(value.method!==contract[0]||(value.host.identityScope??(value.host.platform==='linux'?'SYSTEMD_MACHINE_ID':null))!==contract[1])throw Error('estate_remote_identity_contract_mismatch');
  if(value.gpuInventory?.source==='WINDOWS_CIM'&&value.host.platform!=='windows')throw Error('estate_remote_gpu_source_mismatch');
  if(value.resourceAlias!==alias||value.nonce!==nonce)throw Error('estate_remote_provenance_mismatch');
  if(Math.abs(Date.now()-Date.parse(value.observedAt))>300_000)throw Error('estate_remote_observation_time_invalid');
  if(expected&&value.host.identitySha256!==expected)throw Error('estate_remote_identity_mismatch');
  if(controller&&value.host.identitySha256===controller)throw Error('estate_remote_is_controller');
  const gpu=value.gpuInventory;
  if(gpu&&(gpu.status==='UNAVAILABLE'&&gpu.devices.length||new Set(gpu.devices.map(d=>d.index)).size!==gpu.devices.length))throw Error('estate_remote_gpu_inventory_invalid');
  const missing=[...(value.cpuCount===null?['CPU_UNAVAILABLE']:[]),...(value.memoryBytes===null?['MEMORY_UNAVAILABLE']:[]),...(value.host.platform==='android'?['PHYSICAL_IDENTITY_UNAVAILABLE']:[])].sort();
  if(JSON.stringify([...value.missing].sort())!==JSON.stringify(missing)||value.status!==(missing.length?'PARTIAL':'COMPLETE'))throw Error('estate_remote_partial_mismatch');
  return value;
}

export function estateBindingReason(resource:ResourceConfig|undefined):string|null {
  if(!resource)return 'UNKNOWN_RESOURCE';
  const binding=resource.estateDiscovery;
  if(!['linux','windows','android'].includes(resource.platform)||resource.transport.type!=='ssh')return 'UNSUPPORTED_RESOURCE_TRANSPORT';
  if(resource.platform==='linux'&&resource.managedNode?.enabled!==true||binding?.enabled!==true)return 'RESOURCE_NOT_ENABLED_FOR_ESTATE';
  if(binding.scope!=='metadata-only'||!sha.safeParse(binding.authorisationDigest).success)return 'READ_ONLY_AUTHORISATION_REQUIRED';
  if(!sha.safeParse(binding.expectedIdentitySha256).success)return 'EXPECTED_HOST_IDENTITY_REQUIRED';
  const t=resource.transport;
  if(!t.host||!/^[a-z0-9][a-z0-9._:%-]{0,252}$/i.test(t.host)||t.user&&!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(t.user))return 'INVALID_APPROVED_ROUTE';
  if(t.port!==undefined&&(!Number.isSafeInteger(t.port)||t.port<1||t.port>65535))return 'INVALID_APPROVED_ROUTE';
  if(t.identityFile){const identity=expandUserPath(t.identityFile);if(!identity||!path.isAbsolute(identity)||/[\r\n\0]/.test(identity))return 'INVALID_APPROVED_ROUTE';}
  return null;
}

export const ESTATE_REMOTE_LIMITS = {connectionSeconds:8,commandSeconds:12,overallMs:24_000,maxBytes:32*1024} as const;
// Fixed PowerShell host enforces a remote deadline as well as the owned SSH deadline.
const windowsDeadline=`$ErrorActionPreference='Stop';$p=[PowerShell]::Create();try{[void]$p.AddScript([Console]::In.ReadToEnd());$a=$p.BeginInvoke();if(!$a.AsyncWaitHandle.WaitOne(12000)){$p.Stop();exit 124};$output=$p.EndInvoke($a);if($p.HadErrors){exit 1};[Console]::Out.WriteLine(($output -join [Environment]::NewLine))}finally{$p.Dispose()}`;
export function estateSshArgs(resource:ResourceConfig) {
  if(estateBindingReason(resource))throw Error('estate_remote_binding_denied');
  // Every remote argument is an adapter constant, never caller-provided shell text.
  return ['-o','StrictHostKeyChecking=yes','-o','UpdateHostKeys=no','-o','ConnectionAttempts=1','-o','ServerAliveInterval=2','-o','ServerAliveCountMax=2',
    ...sshResourceArgs(resource,resource.platform==='windows'?['powershell.exe','-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(windowsDeadline,'utf16le').toString('base64')]:['timeout','--signal=TERM','--kill-after=2',String(ESTATE_REMOTE_LIMITS.commandSeconds),'python3','-'])];
}

/** Reuses the native SSH/process authority; no endpoint or command input API. */
export class EstateRemoteAdapter {
  constructor(private readonly config:()=>AgentControlConfig,private readonly executor:SshExecutor=executeSsh){}
  async discover(resourceId:string,context:EstateRemoteContext):Promise<RemoteEstateResult> {
    const emit=(state:RemoteEstateState,reason:string)=>context.onState?.(state,reason);
    const failure=(state:Exclude<RemoteEstateState,'DISCOVERED'|'CONNECTING'|'AVAILABLE'|'DEGRADED'>,reason:string,attempts:0|1):RemoteEstateResult=>{emit(state,reason);return{state,reason,attempts};};
    if(context.signal.aborted)return failure('CANCELLED','JOB_CANCELLED',0);
    let matches:ResourceConfig[];
    try{matches=this.config().resources.filter(r=>r.id===resourceId);}catch{return failure('UNAUTHORISED','CONFIGURATION_UNAVAILABLE',0);}
    const resource=matches.length===1?structuredClone(matches[0]):undefined;
    const denied=estateBindingReason(resource);
    if(denied)return failure('UNAUTHORISED',denied,0);
    if(!context.ownedExecution||!sha.safeParse(context.controllerIdentitySha256).success)return failure('UNAUTHORISED','CONTROLLER_IDENTITY_UNAVAILABLE',0);
    if(resource!.estateDiscovery!.expectedIdentitySha256===context.controllerIdentitySha256)return failure('UNAUTHORISED','REMOTE_IDENTITY_IS_CONTROLLER',0);
    const alias=estateResourceAlias(resourceId),nonce=randomUUID(),deadline=new AbortController();
    let expired=false;
    const timer=setTimeout(()=>{expired=true;deadline.abort();},ESTATE_REMOTE_LIMITS.overallMs);
    const signal=AbortSignal.any([context.signal,deadline.signal]);
    let received=false,abortWait:()=>void=()=>{};
    const cancelled=new Promise<never>((_resolve,reject)=>{abortWait=()=>reject(Error('estate_remote_cancelled'));signal.addEventListener('abort',abortWait,{once:true});if(signal.aborted)abortWait();});
    emit('DISCOVERED','GOVERNED_RESOURCE_BOUND');emit('CONNECTING','SINGLE_ATTEMPT_NO_AUTOMATIC_RETRY');
    try {
      const response=await Promise.race([cancelled,this.executor('ssh',estateSshArgs(resource!),estateProbeProgram(alias,nonce,resource!.platform),{
        timeoutMs:ESTATE_REMOTE_LIMITS.overallMs,maxBytes:ESTATE_REMOTE_LIMITS.maxBytes,signal,ownedExecution:context.ownedExecution,
        session:{remoteTransport:true,interactiveInput:false,allowSignals:false,adapterId:'estate-remote-metadata/v1',commandLabel:`Estate metadata discovery · ${alias}`,transformOutputLine:()=>undefined}
      })]);
      received=true;
      if(context.signal.aborted||response.aborted&&!expired)return failure('CANCELLED','JOB_CANCELLED',1);
      if(expired||response.timedOut||response.status===124||response.status===137)return failure('TIMED_OUT','REMOTE_DEADLINE_EXCEEDED',1);
      if(response.status!==0){
        if(/permission denied|publickey|host key verification|identification has changed/i.test(response.stderr))return failure('UNAUTHORISED','TRANSPORT_AUTHENTICATION_REJECTED',1);
        if(/timed out/i.test(response.stderr))return failure('TIMED_OUT','CONNECTION_DEADLINE_EXCEEDED',1);
        return response.status===255?failure('UNREACHABLE','APPROVED_TRANSPORT_FAILED',1):failure('INVALID_RESPONSE','REMOTE_COLLECTOR_DID_NOT_COMPLETE',1);
      }
      // Recheck authorisation and the whole binding after the asynchronous boundary.
      let current:ResourceConfig[];
      try{current=this.config().resources.filter(r=>r.id===resourceId);}catch{return failure('UNAUTHORISED','CONFIGURATION_UNAVAILABLE',1);}
      if(current.length!==1||estateBindingReason(current[0])||JSON.stringify(current[0])!==JSON.stringify(resource))return failure('UNAUTHORISED','RESOURCE_BINDING_CHANGED',1);
      const envelope=validateEstateEnvelope(response.stdout,alias,nonce,resource!.estateDiscovery!.expectedIdentitySha256,context.controllerIdentitySha256,resource!.platform);
      const state=envelope.status==='COMPLETE'?'AVAILABLE':'DEGRADED';emit(state,envelope.status==='COMPLETE'?'IDENTITY_AND_PROVENANCE_VERIFIED':'VALIDATED_PARTIAL_METADATA');
      return{state,envelope,attempts:1};
    } catch {
      if(context.signal.aborted)return failure('CANCELLED','JOB_CANCELLED',1);
      if(expired)return failure('TIMED_OUT','REMOTE_DEADLINE_EXCEEDED',1);
      return received?failure('INVALID_RESPONSE','REMOTE_ENVELOPE_NOT_ACCEPTED',1):failure('UNREACHABLE','APPROVED_TRANSPORT_FAILED',1);
    } finally {clearTimeout(timer);signal.removeEventListener('abort',abortWait);if(signal.aborted)await context.ownedExecution.terminateAll('estate_remote_cancelled_or_deadline');}
  }
}

/** Same fixed identity source for controller/remote physical-host separation. */
export async function estateControllerIdentity(owned:OwnedExecution,signal:AbortSignal):Promise<string|null>{
  const nonce=randomUUID();
  try{
    const r=await owned.runProcess({command:'python3',args:['-'],input:estateProbeProgram('controller',nonce),maxOutputBytes:32*1024,session:{adapterId:'estate-controller-identity/v1',commandLabel:'Controller identity metadata',transformOutputLine:()=>undefined}},AbortSignal.any([signal,AbortSignal.timeout(5000)]));
    if(r.exitCode!==0)return null;
    return validateEstateEnvelope(r.stdout,'controller',nonce).host.identitySha256;
  }catch{return null;}
}

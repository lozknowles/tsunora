import {createHash} from 'node:crypto';
import fs from 'node:fs';
import type {OwnedExecution} from './owned-process.js';

export const experimentalReservableGpuServices = [
  'llama-server.service',
  'llama-coder.service',
  'agent-control-realtime-model.service',
  'llm-fight-club-csm-capability.service',
] as const;

type ReservableUnit = typeof experimentalReservableGpuServices[number];

export interface ReservedServiceProcess {pid:number;command:string;}
export interface ReservedServiceState {
  unit:ReservableUnit;
  activeState:string;
  subState:string;
  mainPid:number;
  fragmentPath:string;
  fragmentSha256:string;
  execStart:string;
  controlGroup:string;
  processes:ReservedServiceProcess[];
  healthUrl:string|null;
  healthStatus:number|null;
}
export interface ExperimentalServiceReservationRecord {reservedAt:string;services:ReservedServiceState[];}
export interface ExperimentalServiceRestorationRecord {restoredAt:string;services:ReservedServiceState[];}
export interface ExperimentalGpuSnapshot {
  at:string;
  gpu:{name:string;totalMiB:number;usedMiB:number;freeMiB:number;utilizationPercent:number;temperatureC:number};
  processes:Array<{pid:number;name:string;usedMiB:number;rssBytes:number|null}>;
}

const healthUrls:Partial<Record<ReservableUnit,string>>={
  'llama-server.service':'http://127.0.0.1:8080/health',
  'llama-coder.service':'http://127.0.0.1:8081/health',
  'agent-control-realtime-model.service':'http://127.0.0.1:19223/health',
};
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const shaFile=(file:string)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function parseProperties(value:string){const result=new Map<string,string>();for(const line of value.split(/\r?\n/)){const index=line.indexOf('=');if(index>0)result.set(line.slice(0,index),line.slice(index+1));}return result;}
function stableExecStart(value:string){return value.replace(/\s+;\s+start_time=.*$/,'').trim();}
function commandFor(pid:number){try{return fs.readFileSync(`/proc/${pid}/cmdline`).toString('utf8').split('\0').filter(Boolean).join(' ');}catch{return'';}}
function rssFor(pid:number){try{const match=/^VmRSS:\s+(\d+)\s+kB$/m.exec(fs.readFileSync(`/proc/${pid}/status`,'utf8'));return match?Number(match[1])*1024:null;}catch{return null;}}
function groupProcesses(controlGroup:string){
  if(!/^\/[A-Za-z0-9_.@\/-]+$/.test(controlGroup))throw Error('experimental_service_cgroup_invalid');
  try{return fs.readFileSync(`/sys/fs/cgroup${controlGroup}/cgroup.procs`,'utf8').trim().split(/\s+/).filter(Boolean).map(Number).filter(Number.isSafeInteger).map(pid=>({pid,command:commandFor(pid)}));}catch{return[];}
}
async function health(url:string|undefined){if(!url)return null;try{const response=await fetch(url,{signal:AbortSignal.timeout(5000)});return response.status;}catch{return null;}}

/** Captures exact user-service identity before Agent Control temporarily releases its GPU allocation. */
export class ExperimentalGpuServiceReservation {
  private before?:ExperimentalServiceReservationRecord;
  constructor(private readonly owned:OwnedExecution,private readonly systemctl='/usr/bin/systemctl'){}

  async reserve(units:readonly string[]):Promise<ExperimentalServiceReservationRecord>{
    if(process.platform!=='linux')throw Error('experimental_service_reservation_linux_required');
    if(this.before)throw Error('experimental_service_reservation_already_active');
    const unique=[...new Set(units)];
    if(!unique.length||unique.some(unit=>!experimentalReservableGpuServices.includes(unit as ReservableUnit)))throw Error('experimental_service_not_reservable');
    const states:ReservedServiceState[]=[];
    try{
      for(const unit of unique){const state=await this.inspect(unit as ReservableUnit);if(state.activeState!=='active'||state.subState!=='running'||state.mainPid<1)throw Error(`experimental_service_not_running:${unit}`);states.push(state);}
      for(const state of states){await this.waitQuiescent(state);await this.systemctlCommand(['--user','stop',state.unit],`Reserve GPU from ${state.unit}`);await this.waitState(state.unit,'inactive');}
      this.before={reservedAt:new Date().toISOString(),services:states};return structuredClone(this.before);
    }catch(error){for(const state of states.reverse())try{await this.systemctlCommand(['--user','start',state.unit],`Rollback GPU reservation for ${state.unit}`);}catch{}throw error;}
  }

  async restore():Promise<ExperimentalServiceRestorationRecord>{
    if(!this.before)throw Error('experimental_service_reservation_missing');
    for(const state of [...this.before.services].reverse()){await this.systemctlCommand(['--user','start',state.unit],`Restore GPU service ${state.unit}`);await this.waitState(state.unit,'active');await this.waitHealthy(state);}
    const services:ReservedServiceState[]=[];
    for(const before of this.before.services){const after=await this.inspect(before.unit);if(after.activeState!=='active'||after.subState!=='running'||stableExecStart(after.execStart)!==stableExecStart(before.execStart)||after.fragmentSha256!==before.fragmentSha256)throw Error(`experimental_service_restore_identity_failed:${before.unit}`);if(before.healthUrl&&after.healthStatus!==200)throw Error(`experimental_service_restore_health_failed:${before.unit}`);services.push(after);}
    this.before=undefined;return{restoredAt:new Date().toISOString(),services};
  }

  private async inspect(unit:ReservableUnit):Promise<ReservedServiceState>{
    const result=await this.systemctlCommand(['--user','show',unit,'-p','ActiveState','-p','SubState','-p','MainPID','-p','FragmentPath','-p','ExecStart','-p','ControlGroup','--no-pager'],`Inspect GPU service ${unit}`),properties=parseProperties(result.stdout),fragmentPath=properties.get('FragmentPath')??'',controlGroup=properties.get('ControlGroup')??'',healthUrl=healthUrls[unit]??null;
    if(!fragmentPath||!pathIsOwnedUnit(fragmentPath)||!fs.statSync(fragmentPath).isFile())throw Error(`experimental_service_fragment_not_owned:${unit}`);
    return{unit,activeState:properties.get('ActiveState')??'',subState:properties.get('SubState')??'',mainPid:Number(properties.get('MainPID')??'0'),fragmentPath,fragmentSha256:shaFile(fragmentPath),execStart:properties.get('ExecStart')??'',controlGroup,processes:groupProcesses(controlGroup),healthUrl,healthStatus:await health(healthUrl??undefined)};
  }

  private async waitState(unit:ReservableUnit,state:'active'|'inactive'){
    const deadline=Date.now()+120_000;
    while(Date.now()<deadline){const result=await this.systemctlCommand(['--user','is-active',unit],`Confirm GPU service ${unit}`,true);if(result.stdout.trim()===state||state==='inactive'&&['inactive','failed'].includes(result.stdout.trim()))return;await delay(500);}
    throw Error(`experimental_service_state_timeout:${unit}:${state}`);
  }

  private async waitQuiescent(state:ReservedServiceState){
    if(!state.healthUrl)return;
    const slotsUrl=new URL('/slots',state.healthUrl).toString(),deadline=Date.now()+300_000;
    while(Date.now()<deadline){
      try{const response=await fetch(slotsUrl,{signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error(`status:${response.status}`);const slots=await response.json() as Array<{is_processing?:unknown}>;if(Array.isArray(slots)&&slots.every(slot=>slot.is_processing===false))return;}catch(error){throw Error(`experimental_service_idle_probe_failed:${state.unit}:${error instanceof Error?error.message:String(error)}`);}
      await delay(1000);
    }
    throw Error(`experimental_service_busy:${state.unit}`);
  }

  private async waitHealthy(state:ReservedServiceState){
    if(!state.healthUrl)return;
    const deadline=Date.now()+300_000;
    while(Date.now()<deadline){if(await health(state.healthUrl)===200)return;await delay(1000);}
    throw Error(`experimental_service_restore_health_timeout:${state.unit}`);
  }

  private async systemctlCommand(args:string[],label:string,allowFailure=false){const result=await this.owned.runProcess({command:this.systemctl,args,maxOutputBytes:256*1024,session:{adapterId:'experimental-gpu-reservation-v1',commandLabel:label,crewRole:'resource-guardian'}},AbortSignal.timeout(125_000));if(!allowFailure&&result.exitCode!==0)throw Error(`experimental_service_systemctl_failed:${args.at(-1)}`);return result;}
}

function pathIsOwnedUnit(file:string){return /^\/(?:home\/[^/]+\/\.config|run\/user\/\d+)\/systemd\/user\/[A-Za-z0-9_.@-]+\.service$/.test(file);}

export async function captureExperimentalGpuSnapshot(owned:OwnedExecution,nvidiaSmi='/usr/bin/nvidia-smi'):Promise<ExperimentalGpuSnapshot>{
  if(process.platform!=='linux')throw Error('experimental_gpu_snapshot_linux_required');
  const gpu=await owned.runProcess({command:nvidiaSmi,args:['--query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu','--format=csv,noheader,nounits'],maxOutputBytes:64*1024,session:{adapterId:'experimental-gpu-reservation-v1',commandLabel:'Capture experimental GPU state',crewRole:'resource-guardian'}},AbortSignal.timeout(30_000));
  const processes=await owned.runProcess({command:nvidiaSmi,args:['--query-compute-apps=pid,process_name,used_memory','--format=csv,noheader,nounits'],maxOutputBytes:256*1024,session:{adapterId:'experimental-gpu-reservation-v1',commandLabel:'Capture experimental GPU processes',crewRole:'resource-guardian'}},AbortSignal.timeout(30_000));
  if(gpu.exitCode!==0||processes.exitCode!==0)throw Error('experimental_gpu_snapshot_failed');
  const fields=gpu.stdout.trim().split(',').map(value=>value.trim()),numbers=fields.slice(1).map(Number);if(fields.length!==6||numbers.some(value=>!Number.isFinite(value)))throw Error('experimental_gpu_snapshot_invalid');
  const processRows=processes.stdout.trim()?processes.stdout.trim().split(/\r?\n/).map(line=>{const [pid,name,used]=line.split(',').map(value=>value.trim()),numericPid=Number(pid);return{pid:numericPid,name:name??'',usedMiB:Number(used),rssBytes:Number.isSafeInteger(numericPid)?rssFor(numericPid):null};}).filter(item=>Number.isSafeInteger(item.pid)&&Number.isFinite(item.usedMiB)):[];
  return{at:new Date().toISOString(),gpu:{name:fields[0]!,totalMiB:numbers[0]!,usedMiB:numbers[1]!,freeMiB:numbers[2]!,utilizationPercent:numbers[3]!,temperatureC:numbers[4]!},processes:processRows};
}

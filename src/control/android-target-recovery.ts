import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {OwnedProcessManager} from './owned-process.js';
import {sshResourceArgs} from './managed-node-ssh.js';
import {validateRuntimeTarget,type RuntimeTarget} from './target-llama-runtime.js';
import type {ResetPort,ResetObservation,EnvironmentCheck} from './target-reset.js';
/** Production target operation. No benchmark profile, prompt, scoring or admission dependency. */
export function androidRecoveryPort(raw:RuntimeTarget):ResetPort{
 const t=validateRuntimeTarget(raw),a=t.adb;
 if(t.telemetry!=='android-termux'||!a||!t.originalService)throw Error('android_recovery_configuration_required');
 const base=['-H',a.host,'-P',String(a.port),'-s',a.serial];
 async function command(command:string,args:string[],input?:string,timeout=15000){const owned=new OwnedProcessManager();try{const r=await owned.runProcess({command,args,input,maxOutputBytes:100000},AbortSignal.timeout(timeout));if(r.exitCode!==0)throw Error('target_recovery_transport_unavailable');return r.stdout.trim();}finally{await owned.terminateAll('recovery_probe_finished');}}
 async function adb(args:string[]){return command(a!.executable,[...base,...args]);}
 async function identity(){const serial=await adb(['shell','getprop','ro.serialno']);if(serial!==a!.expectedSerial)throw Error('physical_target_identity_mismatch');const boot=await adb(['shell','cat','/proc/sys/kernel/random/boot_id']);if(!/^[a-f0-9-]{36}$/i.test(boot))throw Error('target_boot_identity_unavailable');return {serial,boot};}
 async function helper(operation:string,expectedBootId?:string):Promise<ResetObservation>{
  const source=fs.readFileSync(new URL('../../assets/runtime/llama-invocation.py',import.meta.url),'utf8');const request={operation,expectedBootId,stateDirectory:t.stateDirectory,originalService:t.originalService};
  const input=source+'\nprint(json.dumps(dispatch(json.loads('+JSON.stringify(JSON.stringify(request))+'))),flush=True)\n';
  const remote=t.resource.transport.type==='ssh',args=remote?['-o','StrictHostKeyChecking=yes',...sshResourceArgs(t.resource,['python3','-'])]:['-'];
  const result=JSON.parse((await command(remote?'ssh':'python3',args,input,operation==='restore-service'?110000:20000)).split('\n').at(-1)!);
  return {...result,physicalIdentity:createHash('sha256').update(a!.expectedSerial).digest('hex')};
 }
 return {
  async diagnose(){
   const checks:EnvironmentCheck[]=[];
   const record=(id:string,status:EnvironmentCheck['status'],expected:string,observed:unknown,reason:string)=>checks.push({id,status,expected,observed,reason,mandatory:true,timestamp:new Date().toISOString()});
   let adbBoot:string|undefined,o:ResetObservation|undefined;
   try{const serial=await adb(['shell','getprop','ro.serialno']);record('adb_route','PASS','configured ADB route responds',true,'configured_route_observed');record('physical_target_identity',serial===a!.expectedSerial?'PASS':'FAIL','configured expected identity',createHash('sha256').update(serial).digest('hex'),serial===a!.expectedSerial?'identity_matched':'identity_mismatch');}
   catch{record('adb_route','UNKNOWN','configured ADB route responds',null,'route_observation_unavailable');record('physical_target_identity','UNKNOWN','configured expected identity',null,'identity_not_observed');}
   try{adbBoot=await adb(['shell','cat','/proc/sys/kernel/random/boot_id']);record('android_boot_identity',/^[a-f0-9-]{36}$/i.test(adbBoot)?'PASS':'FAIL','kernel boot UUID',adbBoot,'boot_identity_observed');}
   catch{record('android_boot_identity','UNKNOWN','kernel boot UUID',null,'boot_observation_unavailable');}
   try{o=await helper('recovery-observe');record('agent_control_execution_path','PASS','configured host-key-verified execution route',true,'helper_response_received');checks.push(...(o.components??[]));if(!o.components?.length)record('environment_components','UNKNOWN','component evidence',null,'helper_component_evidence_missing');}
   catch{record('agent_control_execution_path','UNKNOWN','configured execution route',null,'helper_observation_unavailable');for(const id of ['execution_platform','termux_home','android_getprop'])record(id,'UNKNOWN','environment observation',null,'helper_observation_unavailable');}
   record('boot_identity_binding',!adbBoot||!o?'UNKNOWN':adbBoot===o.bootId?'PASS':'FAIL','same ADB and execution boot',o?.bootId??null,!adbBoot||!o?'binding_not_observed':adbBoot===o.bootId?'boot_identity_matched':'boot_identity_mismatch');
   for(const [id,key] of [['protected_service_identity','identity'],['protected_service_health','healthy'],['protected_resource_state','expected']] as const)record(id,!o?'UNKNOWN':o.service[key]?'PASS':'FAIL','configured original service',o?.service[key]??null,!o?'service_not_observed':o.service[key]?'service_requirement_satisfied':'service_requirement_not_satisfied');
   return {components:checks};
  },
  async observe(){const id=await identity(),o=await helper('recovery-observe');if(o.bootId!==id.boot)throw Error('adb_ssh_boot_identity_mismatch');return o;},
  async reboot(){await identity();await adb(['reboot']);},
  async restore(boot){const id=await identity();if(id.boot!==boot)throw Error('target_boot_identity_mismatch');return helper('restore-service',boot);}
 };
}

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import type {OwnedExecution,OwnedProcessResult} from './owned-process.js';
import {redactSensitiveValue} from './security-redaction.js';

export type SandboxControlId='external-network'|'loopback'|'environment'|'credentials'|'scratch-writes'|'source-read-only'|'descendants'|'timeout'|'memory'|'cpu'|'process-count'|'symlink-traversal'|'cleanup';
export interface SandboxLimits{memoryBytes:number;cpuQuotaPercent:number;cpuSeconds:number;processes:number;timeoutMs:number;maxOutputBytes:number;}
export interface SandboxControlEvidence{id:SandboxControlId;status:'PASS'|'FAIL';command:string;arguments:string[];workingDirectory:string;limits:SandboxLimits;exitCode:number|null;signal:string|null;terminationReason:string;stdout:string;stderr:string;startedAt:string;endedAt:string;evidenceSha256:string;}
export interface SandboxQualification{schema:'agent-control.execution-sandbox-qualification/v1';id:string;adapter:string;platform:string;status:'PASS'|'FAIL';networkPolicy:{default:'DENY';allowlist:string[]};environmentAllowlist:string[];sourceRoot:string;scratchRoot:string;limits:SandboxLimits;controls:SandboxControlEvidence[];cleanupVerified:boolean;startedAt:string;endedAt:string;}

export interface ExecutionSandboxAdapter{
 readonly id:string;
 qualify(input:{sourceRoot:string;stateRoot:string;ownedExecution:OwnedExecution;signal?:AbortSignal}):Promise<SandboxQualification>;
}

const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const iso=()=>new Date().toISOString();
const DEFAULT_LIMITS:SandboxLimits={memoryBytes:96*1024*1024,cpuQuotaPercent:100,cpuSeconds:2,processes:16,timeoutMs:3500,maxOutputBytes:64*1024};
const PYTHON='/usr/bin/python3';

function assertWithin(root:string,target:string){const base=path.resolve(root),value=path.resolve(target);if(value!==base&&!value.startsWith(`${base}${path.sep}`))throw Error('sandbox_path_escape');}
function processMarkerAlive(marker:string){for(const entry of fs.readdirSync('/proc')){if(!/^\d+$/.test(entry))continue;try{const value=fs.readFileSync(`/proc/${entry}/cmdline`,'utf8');if(value.includes(marker))return true;}catch{}}return false;}

export class LinuxBubblewrapSandboxAdapter implements ExecutionSandboxAdapter{
 readonly id='linux-bubblewrap-systemd-v1';
 constructor(readonly bwrap='/usr/bin/bwrap',readonly systemdRun='/usr/bin/systemd-run'){}
 private assertAvailable(){if(process.platform!=='linux')throw Error('sandbox_platform_unsupported');for(const file of [this.bwrap,this.systemdRun,'/usr/bin/prlimit',PYTHON])if(!fs.existsSync(file))throw Error(`sandbox_dependency_unavailable:${file}`);}
 private arguments(sourceRoot:string,scratchRoot:string,unit:string,limits:SandboxLimits,command:string,args:string[]){
  if(!path.isAbsolute(command)||(!command.startsWith('/usr/bin/')&&!command.startsWith('/bin/')))throw Error('sandbox_command_not_allowed');
  return['--user','--wait','--pipe','--quiet','--collect',`--unit=${unit}`,'--property=Type=exec','--property=KillMode=control-group',`--property=MemoryMax=${limits.memoryBytes}`,`--property=TasksMax=${limits.processes}`,`--property=CPUQuota=${limits.cpuQuotaPercent}%`,`--property=RuntimeMaxSec=${Math.max(1,Math.ceil(limits.timeoutMs/1000))}s`,'--property=TimeoutStopSec=1s',this.bwrap,'--unshare-all','--die-with-parent','--new-session','--tmpfs','/','--ro-bind','/usr','/usr','--ro-bind','/bin','/bin','--ro-bind','/lib','/lib','--ro-bind','/lib64','/lib64','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--dir','/home','--dir','/nonexistent','--dir','/source','--ro-bind',sourceRoot,'/source','--dir','/scratch','--bind',scratchRoot,'/scratch','--remount-ro','/','--chdir','/scratch','--clearenv','--setenv','PATH','/usr/bin:/bin','--setenv','HOME','/nonexistent','--setenv','LANG','C.UTF-8','--setenv','TMPDIR','/tmp','--setenv','AGENT_CONTROL_SANDBOX','1','/usr/bin/prlimit',`--as=${limits.memoryBytes}`,`--cpu=${limits.cpuSeconds}`,`--nproc=${limits.processes}`,'--nofile=128','--',command,...args];
 }
 private async run(control:SandboxControlId,input:{sourceRoot:string;sandboxRoot:string;scratchRoot:string;ownedExecution:OwnedExecution;signal?:AbortSignal},command:string,args:string[],limits:SandboxLimits=DEFAULT_LIMITS,accept:(result:OwnedProcessResult)=>boolean=({exitCode})=>exitCode===0){
  const unit=`agent-control-sandbox-${randomUUID()}.service`,startedAt=iso(),systemdArgs=this.arguments(input.sourceRoot,input.scratchRoot,unit,limits,command,args);let result:OwnedProcessResult;
  try{result=await input.ownedExecution.runProcess({command:this.systemdRun,args:systemdArgs,cwd:input.sandboxRoot,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8',XDG_RUNTIME_DIR:process.env.XDG_RUNTIME_DIR,DBUS_SESSION_BUS_ADDRESS:process.env.DBUS_SESSION_BUS_ADDRESS},maxOutputBytes:limits.maxOutputBytes,session:{terminal:'pipe',interactiveInput:false,allowSignals:true,adapterId:this.id,commandLabel:`Sandbox control ${control}`,crewRole:'quality-inspector'}},input.signal);}
  catch(error){result={pid:-1,exitCode:null,signal:null,stdout:'',stderr:String(error)};}
  const endedAt=iso(),sanitised=redactSensitiveValue({command:this.systemdRun,arguments:systemdArgs,workingDirectory:input.sandboxRoot,stdout:result.stdout,stderr:result.stderr});
  const evidence={id:control,status:accept(result)?'PASS':'FAIL',command:sanitised.command,arguments:sanitised.arguments,workingDirectory:sanitised.workingDirectory,limits,exitCode:result.exitCode,signal:result.signal,terminationReason:result.signal?`signal:${result.signal}`:result.exitCode===0?'completed':result.exitCode===null?'launch-error':`exit:${result.exitCode}`,stdout:sanitised.stdout,stderr:sanitised.stderr,startedAt,endedAt,evidenceSha256:''} satisfies SandboxControlEvidence;
  evidence.evidenceSha256=sha(JSON.stringify({...evidence,evidenceSha256:undefined}));return evidence;
 }
 async qualify(input:{sourceRoot:string;stateRoot:string;ownedExecution:OwnedExecution;signal?:AbortSignal}):Promise<SandboxQualification>{
  this.assertAvailable();const sourceRoot=path.resolve(input.sourceRoot),stateRoot=path.resolve(input.stateRoot);if(!fs.statSync(sourceRoot).isDirectory())throw Error('sandbox_source_invalid');fs.mkdirSync(stateRoot,{recursive:true,mode:0o700});const sandboxRoot=fs.mkdtempSync(path.join(stateRoot,'execution-sandbox-')),scratchRoot=path.join(sandboxRoot,'scratch');fs.mkdirSync(scratchRoot,{mode:0o700});assertWithin(stateRoot,sandboxRoot);const startedAt=iso(),run={sourceRoot,sandboxRoot,scratchRoot,ownedExecution:input.ownedExecution,signal:input.signal},controls:SandboxControlEvidence[]=[];
  const py=(id:SandboxControlId,source:string,limits=DEFAULT_LIMITS,accept?:Parameters<LinuxBubblewrapSandboxAdapter['run']>[5])=>this.run(id,run,PYTHON,['-I','-c',source],limits,accept);
  try{
   controls.push(await py('external-network','import socket,sys\ns=socket.socket();s.settimeout(.3)\nsys.exit(0 if s.connect_ex(("1.1.1.1",53)) != 0 else 9)'));
   controls.push(await py('loopback','import socket,sys\ns=socket.socket();s.settimeout(.3)\nsys.exit(0 if s.connect_ex(("127.0.0.1",22)) != 0 else 9)'));
   controls.push(await py('environment','import os,sys\nallowed={"PATH","HOME","LANG","TMPDIR","AGENT_CONTROL_SANDBOX","PWD"}\nprint("\\n".join(sorted(os.environ)))\nsys.exit(0 if set(os.environ)==allowed else 8)'));
   controls.push(await py('credentials','import os,sys\npaths=["/root/.ssh","/root/.config","/run/user"]+[os.path.join("/home",name,child) for name in os.listdir("/home") for child in [".ssh",".config"]]\nprint("\\n".join(p for p in paths if os.path.exists(p)))\nsys.exit(0 if not any(os.path.exists(p) for p in paths) else 8)'));
   controls.push(await py('scratch-writes','import os,sys\nopen("/scratch/allowed","w").write("ok")\ntry: open("/outside","w").write("bad")\nexcept OSError: sys.exit(0)\nsys.exit(8)'));
   controls.push(await py('source-read-only','import os,sys\ntarget="/source/package.json"\ntry: open(target,"a").write("bad")\nexcept OSError: sys.exit(0)\nsys.exit(8)'));
   const marker=`ac-sandbox-${randomUUID()}`;
   controls.push(await py('descendants',`import subprocess\nsubprocess.Popen(["/usr/bin/bash","-c","exec -a ${marker} /usr/bin/sleep 30"])\nprint("spawned")`));
   await new Promise(resolve=>setTimeout(resolve,100));if(processMarkerAlive(marker))controls[controls.length-1]={...controls.at(-1)!,status:'FAIL',terminationReason:'descendant-remained-after-unit-completion'};
   controls.push(await py('timeout','import signal,subprocess,time\nsignal.signal(signal.SIGTERM,signal.SIG_IGN)\nsubprocess.Popen(["/usr/bin/sleep","30"])\nwhile True: time.sleep(.1)',{...DEFAULT_LIMITS,timeoutMs:900},result=>result.exitCode!==0||result.signal!==null));
   controls.push(await py('memory','x=[]\nwhile True: x.append(bytearray(8*1024*1024))',{...DEFAULT_LIMITS,memoryBytes:64*1024*1024},result=>result.exitCode!==0||result.signal!==null));
   controls.push(await py('cpu','while True: pass',{...DEFAULT_LIMITS,cpuSeconds:1,timeoutMs:2500},result=>result.exitCode!==0||result.signal!==null));
   controls.push(await py('process-count','import subprocess,sys\nchildren=[]\ntry:\n for i in range(64): children.append(subprocess.Popen(["/usr/bin/sleep","2"]))\nexcept OSError:\n print(len(children));[p.terminate() for p in children];sys.exit(0)\n[p.terminate() for p in children];sys.exit(8)',DEFAULT_LIMITS));
   controls.push(await py('symlink-traversal','import os,sys\nos.symlink("/source","/scratch/source-link")\nfor target in ["/scratch/source-link/package.json","/scratch/../source/package.json"]:\n try: open(target,"a").write("bad")\n except OSError: continue\n else: sys.exit(8)\nsys.exit(0)'));
  }finally{await input.ownedExecution.terminateAll('sandbox-qualification-complete');fs.rmSync(sandboxRoot,{recursive:true,force:true});}
  const cleanupVerified=!fs.existsSync(sandboxRoot)&&input.ownedExecution.activePids().length===0;const cleanupBase={id:'cleanup' as const,status:cleanupVerified?'PASS' as const:'FAIL' as const,command:'adapter-cleanup',arguments:[],workingDirectory:sandboxRoot,limits:DEFAULT_LIMITS,exitCode:cleanupVerified?0:1,signal:null,terminationReason:cleanupVerified?'scratch-and-processes-absent':'cleanup-unverified',stdout:'',stderr:'',startedAt,endedAt:iso(),evidenceSha256:''};controls.push({...cleanupBase,evidenceSha256:sha(JSON.stringify(cleanupBase))});
  return{schema:'agent-control.execution-sandbox-qualification/v1',id:`sandbox-${randomUUID()}`,adapter:this.id,platform:`${os.platform()}-${os.arch()}`,status:controls.every(item=>item.status==='PASS')?'PASS':'FAIL',networkPolicy:{default:'DENY',allowlist:[]},environmentAllowlist:['PATH','HOME','LANG','TMPDIR','AGENT_CONTROL_SANDBOX','PWD'],sourceRoot,scratchRoot,limits:DEFAULT_LIMITS,controls,cleanupVerified,startedAt,endedAt:iso()};
 }
}

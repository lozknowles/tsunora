import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadConfig,resolveConfigPath} from './config.mjs';

const optionalCommands = [
  ['nvidia-smi', ['--query-gpu=index,name,memory.total,driver_version','--format=csv,noheader,nounits']],
  ['nvcc',['--version']], ['llama-server',['--version']], ['ollama',['--version']],
  ['codex',['--version']], ['claude',['--version']], ['docker',['--version']],
  ['podman',['--version']], ['ffmpeg',['-version']], ['chromium',['--version']],
  ['google-chrome',['--version']], ['adb',['version']],
];

/** Read-only prerequisite/capability inventory. Never starts a service or reads credentials. */
export function inspectDoctor({root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'), cwd=process.cwd(), environment=process.env, nodeVersion=process.versions.node, platform=process.platform, run=spawnSync}={}) {
  const checks=[];
  const add=(id,classification,state,reason)=>checks.push({id,classification,state,reason});
  add('node','CORE_REQUIRED',Number(nodeVersion.split('.')[0])>=24?'CORE_READY':'BLOCKED','node_24_or_newer_required');
  for(const command of ['git','npm',...(platform==='win32'?[]:['bash'])]) {
    const result=run(command,['--version'],{timeout:2000,maxBuffer:8192,windowsHide:true,encoding:'utf8',shell:false});
    // Archive installations have no Git metadata and do not use the Git bootstrap.
    // A .git file also denotes a worktree; it retains the Git prerequisite.
    const required=command!=='git'||fs.existsSync(path.join(root,'.git'));
    const state=required?(result.status===0?'CORE_READY':'BLOCKED'):(result.status===0?'OPTIONAL_AVAILABLE':result.error?.code==='ENOENT'?'OPTIONAL_UNAVAILABLE':'OPTIONAL_DEGRADED');
    add(command,required?'CORE_REQUIRED':'OPTIONAL',state,result.status===0?'executable_responded':result.error?.code==='ENOENT'?'command_unavailable':'command_failed');
  }
  const dependencies=['tsx','undici','ws'].every(name=>fs.existsSync(path.join(root,'node_modules',name,'package.json')));
  add('locked-dependencies','CORE_REQUIRED',dependencies?'CORE_READY':'BLOCKED',dependencies?'installed':'run_documented_bootstrap');
  let writable=cwd;
  try { const state=path.dirname(resolveConfigPath(environment,cwd)); writable=state; while(!fs.existsSync(writable)&&path.dirname(writable)!==writable)writable=path.dirname(writable); fs.accessSync(writable,fs.constants.W_OK); add('state-storage','CORE_REQUIRED','CORE_READY','writable_parent'); }
  catch { add('state-storage','CORE_REQUIRED','BLOCKED','storage_not_writable'); }
  for(const [command,args] of optionalCommands) {
    const result=run(command,args,{timeout:1500,maxBuffer:8192,windowsHide:true,encoding:'utf8',shell:false});
    let state=result.error?.code==='ENOENT'?'OPTIONAL_UNAVAILABLE':result.status===0?'OPTIONAL_AVAILABLE':'OPTIONAL_DEGRADED';
    let reason=result.error?.code==='ENOENT'?'command_unavailable':result.error?.code==='ETIMEDOUT'?'command_timeout':result.status===0?'executable_responded':'command_failed';
    if(command==='nvidia-smi'&&result.status===0) {
      const rows=String(result.stdout??'').trim().split(/\r?\n/).filter(Boolean);
      const valid=rows.every(row=>{const c=row.split(',').map(v=>v.trim());return c.length===4&&/^\d+$/.test(c[0])&&c[1]&&c[2]&&Number.isFinite(Number(c[2]))&&Number(c[2])>0&&c[3];});
      if(!valid){state='OPTIONAL_DEGRADED';reason='malformed_output';}
      else if(!rows.length){state='OPTIONAL_UNAVAILABLE';reason='no_devices_reported';}
    }
    add(command,'OPTIONAL',state,reason);
  }
  try {
    const {config}=loadConfig({environment,cwd});
    for(const [id,key] of [['execution-providers','providers'],['models','models'],['speech-and-other-services','services']]) {
      const configured=Array.isArray(config[key])&&config[key].length>0;
      add(id,'OPTIONAL',configured?'OPTIONAL_DEGRADED':'UNCONFIGURED',configured?'configured_health_not_probed':'none_configured');
    }
  } catch { add('configuration','CORE_REQUIRED','BLOCKED','configuration_unreadable_or_invalid'); }
  return {schema:'agent-control.doctor/v1',scope:'LOCAL_INSTALLATION_PREREQUISITES_AND_OPTIONAL_EXECUTABLES',core:checks.some(c=>c.classification==='CORE_REQUIRED'&&c.state==='BLOCKED')?'BLOCKED':'CORE_READY',checks,limitations:['Executable presence is not worker qualification or service health.','CA, DNS and HTTPS are exercised by installation; doctor does not contact external services.','Browser alternatives may be available even when the named binaries are absent.']};
}

export function doctorCommand(argv,io={out:console.log,error:console.error}) {
  if(argv.some(arg=>arg!=='--json')){io.error('Usage: agent-control doctor [--json]');return 2;}
  const report=inspectDoctor();
  io.out(argv.includes('--json')?JSON.stringify(report,null,2):[`Agent Control doctor: ${report.core} (installation prerequisites)`,...report.checks.map(c=>`${c.classification.padEnd(13)} ${c.state.padEnd(20)} ${c.id}: ${c.reason}`),...report.limitations].join('\n'));
  return report.core==='CORE_READY'?0:1;
}

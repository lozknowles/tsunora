#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync, spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export function inspectAndroid({platform=process.platform, architecture=process.arch, version=process.versions.node, cwd=process.cwd(), probe=spawnSync, statfs=fs.statfsSync}={}) {
  const failures=[];
  if(platform!=='android') failures.push('Android Node runtime required');
  if(!['arm64','arm'].includes(architecture)) failures.push('Architecture not yet supported');
  if(![24,26].includes(Number(version.split('.')[0]))) failures.push('Use Node 24 or 26');
  let availableBytes=null;
  try {const d=statfs(cwd); availableBytes=Number(d.bavail)*Number(d.bsize);} catch {failures.push('Storage unavailable');}
  if(availableBytes!==null&&availableBytes<1024**3) failures.push('At least 1 GiB free installation storage required');
  for(const name of ['git','npm']) if(probe(name,['--version'],{encoding:'utf8',timeout:5000}).status!==0) failures.push(name+' missing: use pkg install git nodejs-lts npm');
  return {profile:'ANDROID_STANDALONE_WEB',platform,architecture,node:version,availableBytes,failures};
}

export async function main(args=process.argv.slice(2)) {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const state=path.join(root,'.agent-control'), mode=args[0]??'check';
  if(!['check','install','start'].includes(mode)) throw Error('Usage: android-standalone.mjs check|install|start');
  const facts=inspectAndroid({cwd:root});
  if(facts.failures.length) {console.error(JSON.stringify(facts)); return 1;}
  const git=(...args)=>{
    const r=spawnSync('git',['-C',root,...args],{encoding:'utf8',timeout:10000});
    if(r.status!==0) throw Error('Repository verification failed');
    return r.stdout.trim();
  };
  const commit=git('rev-parse','HEAD'), origin=git('remote','get-url','origin');
  if(!['https://github.com/lozknowles/agent-control.git','git@github.com:lozknowles/agent-control.git'].includes(origin)) throw Error('Canonical repository origin required');
  if(git('status','--porcelain','--untracked-files=no')) throw Error('Tracked source changes require a reviewed commit');
  if(mode==='check') {console.log(JSON.stringify({...facts,commit,origin,trust:'Git commit and canonical origin; not a release signature'})); return 0;}
  if(mode==='install') {
    if(spawnSync('npm',(fs.existsSync(path.join(root,'package-lock.json'))?['ci','--ignore-scripts','--no-audit','--no-fund']:['install','--ignore-scripts','--no-package-lock','--no-audit','--no-fund']),{cwd:root,stdio:'inherit'}).status!==0) throw Error('Dependency installation failed');
    if(spawnSync(process.execPath,['--import','tsx','-e','import("node:sqlite"); console.log("Runtime dependencies ready")'],{cwd:root,stdio:'inherit'}).status!==0) throw Error('Runtime probe failed');
    fs.mkdirSync(state,{recursive:true,mode:0o700});
    if(spawnSync(process.execPath,['scripts/init-config.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,AGENT_CONTROL_STATE_DIR:state,AGENT_CONTROL_CONFIG:path.join(state,'config.json')}}).status!==0) throw Error('Configuration initialization failed');
    try {fs.writeFileSync(path.join(state,'android-operator-token'),randomBytes(32).toString('base64url'),{flag:'wx',mode:0o600});} catch(e) {if(e.code!=='EEXIST') throw e;}
    fs.writeFileSync(path.join(state,'android-installation.json'),JSON.stringify({...facts,commit,installedAt:new Date().toISOString(),controller:'this-Android-process',remoteRequired:false,localModelRequired:false},null,2),{mode:0o600});
    console.log('Installation complete. Run: node scripts/android-standalone.mjs start');
    return 0;
  }
  const tokenFile=path.join(state,'android-operator-token');
  if(!fs.existsSync(tokenFile)) throw Error('Run install first');
  const token=fs.readFileSync(tokenFile,'utf8').trim();
  if(token.length<32) throw Error('Operator token invalid');
  console.log('Dashboard: http://127.0.0.1:4310/');
  console.log('Keep Termux running. Android may stop background processes; repeat start to recover.');
  console.log('The private operator sign-in value is stored in .agent-control/android-operator-token. Never share it or put it in a URL.');
  const child=spawn(process.execPath,['--import','tsx','src/web.ts'],{cwd:root,stdio:'inherit',env:{...process.env,
    AGENT_CONTROL_DEPLOYMENT_PROFILE:'ANDROID_STANDALONE_WEB',AGENT_CONTROL_STATE_DIR:state,AGENT_CONTROL_CONFIG:path.join(state,'config.json'),
    AGENT_CONTROL_WEB_OPERATOR_TOKEN:token,AGENT_CONTROL_WEB_HOST:'127.0.0.1',AGENT_CONTROL_WEB_PORT:'4310',
    AGENT_CONTROL_WEB_ALLOWED_ORIGINS:'http://127.0.0.1:4310,http://localhost:4310'}});
  for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
  return await new Promise(resolve=>{child.once('error',()=>resolve(1)); child.once('exit',code=>resolve(code??1));});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().then(code=>{process.exitCode=code;}).catch(error=>{console.error(error.message);process.exitCode=1;});

import {isAndroidUserspace,observeAndroid} from './android-environment.js';
import {DefaultDiscoveryProbe} from './environment-discovery.js';
import {assessMobileOperation,validateMobilePolicy} from './mobile-resource-policy.js';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Ajv} from 'ajv';
import {ActionRegistry} from './job-runtime.js';
import {JobCatalog} from './job-catalog.js';
import type {ActionContext} from './job-types.js';
import {BenchmarkEvidenceStore,benchmarkHash,validateBenchmarkSpec,leagueTable,type LocalBenchmarkSpec,type BenchmarkCandidate,type BenchmarkMeasurement} from './local-llm-benchmark.js';

export interface BenchmarkGrant {parcelId?:string;specSha256:string;actor:string;expiresAt:string;downloadBytes:number;candidateHashes:string[];runtimeSha256:string;}
export interface BenchmarkActivity {at:string;state:'ACTIVE'|'STOPPED';runId:string;resourceId:string;modelId:string;modelSha256:string;runtimeSha256:string;pids:number[];}
export const fileHash=async(file:string)=>{const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');};
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const freePort=()=>new Promise<number>((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=(server.address() as net.AddressInfo).port;server.close(error=>error?reject(error):resolve(port));});});
function childPath(root:string,name:string){if(path.basename(name)!==name||!name||name==='..')throw Error('benchmark_path_invalid');const result=path.resolve(root,name);if(path.dirname(result)!==path.resolve(root))throw Error('benchmark_path_escape');return result;}
async function obtain(candidate:BenchmarkCandidate,target:string,signal:AbortSignal) {
  let url=candidate.source,response:Response|undefined;
  for(let hop=0;hop<6;hop++) {
    const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password||!['huggingface.co','hf.co'].some(host=>parsed.hostname===host||parsed.hostname.endsWith('.'+host)))throw Error('benchmark_download_origin_denied');
    response=await fetch(url,{redirect:'manual',signal});
    if([301,302,303,307,308].includes(response.status)){const next=response.headers.get('location');await response.body?.cancel();if(!next)throw Error('benchmark_download_redirect_missing');url=new URL(next,url).href;continue;}break;
  }
  if(!response?.ok||!response.body)throw Error('benchmark_download_unavailable');
  const handle=await fs.promises.open(target,'wx',0o600),hash=createHash('sha256');let bytes=0;
  try {for await(const chunk of response.body as unknown as AsyncIterable<Uint8Array>){bytes+=chunk.length;if(bytes>candidate.bytes)throw Error('benchmark_download_size_exceeded');hash.update(chunk);let offset=0;while(offset<chunk.length){const written=await handle.write(chunk,offset,chunk.length-offset);if(written.bytesWritten===0)throw Error('benchmark_download_write_failed');offset+=written.bytesWritten;}}await handle.sync();}
  finally {await handle.close();}
  const sha256=hash.digest('hex');if(bytes!==candidate.bytes||sha256!==candidate.sha256)throw Error('benchmark_artifact_verification_failed');
  return {bytes,sha256};
}

export function registerLlamaCppBenchmarkJobs(catalog:JobCatalog,actions:ActionRegistry,options:{root:string;store:BenchmarkEvidenceStore;grants:Map<string,BenchmarkGrant>;admit:(spec:LocalBenchmarkSpec)=>Promise<void>;onActivity?:(activity:BenchmarkActivity)=>void}) {
  const guarded=async(context:ActionContext)=>{
    const digest=String(context.parameters.specSha256),spec=validateBenchmarkSpec(options.store.read('definitions',digest)),grant=options.grants.get(digest);
    if(!grant||grant.expiresAt<=new Date().toISOString()||grant.specSha256!==digest||grant.runtimeSha256!==spec.execution.runtimeSha256||grant.downloadBytes<spec.candidates.filter(c=>!c.existingPath).reduce((n,c)=>n+c.bytes,0)||spec.candidates.some(c=>!grant.candidateHashes.includes(c.sha256)))throw Error('benchmark_exact_approval_required');
    if(!grant.parcelId||context.run.trigger.parcelContext?.parcelId!==grant.parcelId)throw Error('benchmark_approval_parcel_mismatch');
    await options.admit(spec);
    if(isAndroidUserspace()){
      const observation=await observeAndroid(new DefaultDiscoveryProbe());
      const policyFile=path.join(process.env.AGENT_CONTROL_STATE_DIR??'.agent-control','mobile-policy.json');
      const policy=validateMobilePolicy(fs.existsSync(policyFile)?JSON.parse(fs.readFileSync(policyFile,'utf8')):{});
      const decision=assessMobileOperation('BENCHMARK',observation,policy,{downloadBytes:0,estimatedRamBytes:Math.max(...spec.candidates.map(c=>c.estimatedRamBytes))});
      if(!decision.allowed)throw Error('mobile_resource_policy:'+decision.reasons.join(','));
      if(context.step.action.startsWith('local-benchmark.acquire')){
        const download=assessMobileOperation('DOWNLOAD',observation,policy,{downloadBytes:spec.candidates.filter(c=>!c.existingPath).reduce((n,c)=>n+c.bytes,0),estimatedRamBytes:0});
        if(!download.allowed)throw Error('mobile_resource_policy:'+download.reasons.join(','));
      }
    }
    if(context.signal.aborted)throw Error('benchmark_cancelled');
    if(await fileHash(spec.execution.runtimePath)!==spec.execution.runtimeSha256)throw Error('benchmark_runtime_changed');
    if(await fileHash(spec.execution.sandboxPath)!==spec.execution.sandboxSha256||await fileHash(fileURLToPath(new URL('../../scripts/python-repair-validator.py',import.meta.url)))!==spec.execution.validatorSha256)throw Error('benchmark_validator_changed');
    const runRoot=childPath(options.root,digest);fs.mkdirSync(runRoot,{recursive:true,mode:0o700});
    const modelRoot=childPath(runRoot,'models');fs.mkdirSync(modelRoot,{recursive:true,mode:0o700});
    const candidate=spec.candidates.find(c=>c.id===context.parameters.candidateId);
    return {spec,digest,grant,runRoot,modelRoot,candidate};
  };
  const register=(phase:string,handler:(c:ActionContext)=>Promise<unknown>)=>{
    const action=`local-benchmark.${phase}@1.0.0`;
    catalog.knownActions?.add(action);
    actions.registerConsequentialControl(action,async context=>({artifacts:[{name:phase,value:await handler(context)}],verification:[`benchmark-${phase}-verified`]}),['FILESYSTEM_WRITE']);
    catalog.addJob({apiVersion:'agent-control/v1',kind:'Job',metadata:{id:`local-benchmark-${phase}`,name:`Local benchmark ${phase}`,version:'1.0.0'},spec:{priority:'low',concurrency:'no-overlap',parameters:{specSha256:{type:'string',required:true},candidateId:{type:'string'},targetResourceId:{type:'string'},benchmarkModelSha256:{type:'string'}},steps:[{id:phase,action,outputs:[{name:phase,type:'application/json',schema:'agent-control.local-benchmark-stage/v1',version:'1.0.0'}],requires:['benchmark.control'],resources:['benchmark/isolated-controller'],timeoutSeconds:phase==='acquire'?1800:phase==='run-candidate'?2400:60,verification:[`benchmark-${phase}-verified`]}]}} as any);
  };
  register('preflight',async context=>{const {spec,digest}=await guarded(context);if(!spec.execution.qualified||spec.execution.authentication==='REQUIRED'||Date.parse(spec.execution.expiresAt)<=Date.now())throw Error('benchmark_execution_admission_expired');const stat=fs.statfsSync(options.root);const available=Number(stat.bavail)*Number(stat.bsize);if(available<spec.candidates.filter(c=>!c.existingPath).reduce((n,c)=>n+c.bytes,0)*1.1)throw Error('benchmark_storage_changed');return {specSha256:digest,controlCapability:spec.execution.capability,modelTargets:spec.candidates.length,existingModels:spec.candidates.filter(c=>c.existingPath).length,observedAt:new Date().toISOString()};});
  register('acquire',async context=>{const {spec,candidate,modelRoot,digest}=await guarded(context);if(!candidate)throw Error('benchmark_candidate_missing');if(candidate.existingPath){if(await fileHash(candidate.existingPath)!==candidate.sha256)throw Error('benchmark_existing_artifact_changed');return {path:candidate.existingPath,downloaded:false,sha256:candidate.sha256};}
    const target=childPath(modelRoot,candidate.filename);if(fs.existsSync(target)){if(await fileHash(target)!==candidate.sha256)throw Error('benchmark_existing_target_conflict');return {path:target,downloaded:false,sha256:candidate.sha256};}
    const partial=childPath(modelRoot,`${candidate.filename}.${context.run.id}.partial`),proof=await obtain(candidate,partial,AbortSignal.any([context.signal,AbortSignal.timeout(Math.max(1,Date.parse((await guarded(context)).grant.expiresAt)-Date.now()))]));
    fs.linkSync(partial,target); // Atomic no-clobber publication; failed/partial evidence is retained.
    const record={specSha256:digest,model:candidate.id,revision:candidate.revision,source:candidate.source,filename:candidate.filename,quantisation:candidate.quantisation,licence:candidate.licence,licenceSource:candidate.licenceSource,acquiredAt:new Date().toISOString(),...proof};options.store.put('acquisitions',record);return record;
  });
  register('verify-artifact',async context=>{const {candidate,modelRoot}=await guarded(context);if(!candidate)throw Error('benchmark_candidate_missing');const file=candidate.existingPath??childPath(modelRoot,candidate.filename),stat=fs.statSync(file);if(stat.size!==candidate.bytes||await fileHash(file)!==candidate.sha256)throw Error('benchmark_artifact_verification_failed');const handle=fs.openSync(file,'r'),magic=Buffer.alloc(4);try{fs.readSync(handle,magic,0,4,0);}finally{fs.closeSync(handle);}if(magic.toString()!=='GGUF')throw Error('benchmark_artifact_format_invalid');return {model:candidate.id,sha256:candidate.sha256,bytes:stat.size,format:'GGUF'};});
  register('run-candidate',async context=>{
    const {spec,candidate,modelRoot,digest,runRoot,grant}=await guarded(context);if(!candidate)throw Error('benchmark_candidate_missing');const model=candidate.existingPath??childPath(modelRoot,candidate.filename);
    if(await fileHash(model)!==candidate.sha256)throw Error('benchmark_artifact_changed');
    // A failed attempt set is immutable. Resume requires a newly versioned spec, not duplicate attempts.
    const resultDir=path.join(options.store.root,'results');if(fs.existsSync(resultDir)&&fs.readdirSync(resultDir).some(f=>{const m=options.store.read('results',f.replace(/\.json$/,''));return m.identity?.specSha256===digest&&m.candidateId===candidate.id;}))throw Error('benchmark_candidate_attempt_set_exists');
    const port=await freePort(),base=`http://127.0.0.1:${port}`,controller=new AbortController(),signal=AbortSignal.any([context.signal,controller.signal,AbortSignal.timeout(Math.max(1,Date.parse(grant.expiresAt)-Date.now()))]),started=Date.now();
    const server=context.ownedExecution.runProcess({command:'/usr/bin/nice',args:['-n','10',spec.execution.runtimePath,'--model',model,'--host','127.0.0.1','--port',String(port),'--alias',candidate.id,'--ctx-size',String(spec.settings.context),'--threads',String(spec.settings.threads),'--n-gpu-layers',String(spec.settings.gpuLayers),'--parallel','1','--no-warmup'],env:{PATH:process.env.PATH,HOME:runRoot,LANG:'C.UTF-8',CUDA_VISIBLE_DEVICES:spec.settings.gpuLayers===0?'':process.env.CUDA_VISIBLE_DEVICES},maxOutputBytes:262144},signal).then(result=>({result}),error=>({error:String(error)}));
    let peakRamBytes=0;const activity=(state:'ACTIVE'|'STOPPED')=>options.onActivity?.({at:new Date().toISOString(),state,runId:context.run.id,resourceId:spec.hardware.resourceId,modelId:candidate.id,modelSha256:candidate.sha256,runtimeSha256:spec.execution.runtimeSha256,pids:context.ownedExecution.activePids()});
    const monitor=setInterval(()=>{for(const pid of context.ownedExecution.activePids())try{const match=fs.readFileSync(`/proc/${pid}/status`,'utf8').match(/^VmRSS:\s+(\d+) kB/m);if(match)peakRamBytes=Math.max(peakRamBytes,Number(match[1])*1024);}catch{}activity('ACTIVE');},500);
    const measurements:BenchmarkMeasurement[]=[];
    try {
      let ready=false;for(let i=0;i<120;i++){if(signal.aborted)throw Error('benchmark_cancelled');try{const response=await fetch(base+'/v1/models',{signal:AbortSignal.timeout(500)});const body=await response.json() as any;if(response.ok&&body.data?.some((m:any)=>m.id===candidate.id)){ready=true;break;}}catch{}await pause(250);}if(!ready)throw Error('benchmark_runtime_start_failed');
      context.recordEvidence?.('runtime-verified',{model:candidate.id,port,runtimeSha256:spec.execution.runtimeSha256,loadMs:Date.now()-started,pids:context.ownedExecution.activePids()});
      const standardStart=Date.now(),standard=await fetch(base+'/completion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'Continue counting integers: 1 2 3 4',n_predict:32,temperature:0,seed:spec.settings.seed,cache_prompt:false}),signal:AbortSignal.any([signal,AbortSignal.timeout(spec.settings.timeoutMs)])});if(!standard.ok)throw Error('benchmark_standard_inference_failed');const standardBody=await standard.json();context.recordEvidence?.('standard-inference',{elapsedMs:Date.now()-standardStart,response:standardBody,qualityScored:false});
      for(const task of spec.cases)for(let attempt=1;attempt<=spec.attempts;attempt++){
        if(Date.parse((await guarded(context)).grant.expiresAt)<=Date.now())throw Error("benchmark_approval_expired");
        const at=Date.now();let response:any={},validator:any={passed:false,reason:'not-run'},failure:string|undefined;
        try {
          const result=await fetch(base+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:candidate.id,messages:[{role:'user',content:task.prompt}],temperature:spec.settings.temperature,seed:spec.settings.seed,max_tokens:spec.settings.maxTokens,cache_prompt:false}),signal:AbortSignal.any([signal,AbortSignal.timeout(spec.settings.timeoutMs)])});if(!result.ok)throw Error(`inference_http_${result.status}`);response=await result.json();const content=response.choices?.[0]?.message?.content;if(typeof content!=='string')throw Error('benchmark_response_missing');
          if(task.validator==='python-function-tests') {
            const script=fileURLToPath(new URL('../../scripts/python-repair-validator.py',import.meta.url));
            const checked=await context.ownedExecution.runProcess({command:spec.execution.sandboxPath,args:['--unshare-all','--die-with-parent','--new-session','--ro-bind','/usr','/usr','--ro-bind','/lib','/lib','--ro-bind','/lib64','/lib64','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--ro-bind',script,'/validator.py','/usr/bin/prlimit','--as=536870912','--cpu=5','--nproc=32','--','/usr/bin/python3','-I','/validator.py'],input:JSON.stringify({source:content,inputs:task.input,expected:task.expected}),env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},maxOutputBytes:65536},AbortSignal.any([context.signal,AbortSignal.timeout(10000)]));
            validator=checked.exitCode===0?JSON.parse(checked.stdout):{passed:false,reason:'validator_sandbox_failed'};
          } else if(task.validator==='exact-text')validator={passed:content.trim()===task.expected,actual:content};
          else {const validate=new Ajv({strict:false}).compile(task.expected as any);validator={passed:validate(JSON.parse(content)),errors:validate.errors??[]};}
        }catch(error){failure=String(error);validator={passed:false,reason:failure};if(signal.aborted)throw error;}
        const raw=context.recordEvidence?.(`raw-${task.id}-${attempt}`,response),proof=context.recordEvidence?.(`validation-${task.id}-${attempt}`,validator);
        const measurement:BenchmarkMeasurement={id:`${context.run.id}:${task.id}:${attempt}`,candidateId:candidate.id,identity:{model:candidate.id,revision:candidate.revision,quantisation:candidate.quantisation,runtimeSha256:spec.execution.runtimeSha256,hardwareFingerprint:spec.hardware.fingerprint,specSha256:digest},caseId:task.id,attempt,passed:validator.passed===true,elapsedMs:Date.now()-at,generationTokensPerSecond:response.timings?.predicted_per_second??null,promptTokensPerSecond:response.timings?.prompt_per_second??null,ramBytes:peakRamBytes||null,vramBytes:null,cpuUtilisation:null,gpuUtilisation:null,energyJoules:null,promptTokens:response.usage?.prompt_tokens??null,outputTokens:response.usage?.completion_tokens??null,rawResponseSha256:raw?.sha256??benchmarkHash(response),validatorVersion:'restricted-python-functions/v1',validatorEvidenceSha256:proof?.sha256??benchmarkHash(validator),...(failure?{failure}:{})};
        options.store.put('results',measurement);measurements.push(measurement);
      }
      return {specSha256:digest,candidate:candidate.id,measurements,totalCandidateElapsedMs:Date.now()-started,productionRoutingChanged:false};
    } finally {clearInterval(monitor);controller.abort();await server;const cleanup=await context.ownedExecution.terminateAll('benchmark-candidate-finished');activity('STOPPED');if(cleanup.outcome!=='confirmed')throw Error('benchmark_runtime_cleanup_unconfirmed');}
  });
  register('league-table',async context=>{const {spec,digest}=await guarded(context),dir=path.join(options.store.root,'results');const all=fs.existsSync(dir)?fs.readdirSync(dir).map(f=>options.store.read('results',f.replace(/\.json$/,''))).filter(m=>m.identity?.specSha256===digest):[];const league=leagueTable(spec,all);if(league.rows.some(r=>!r.complete))throw Error('benchmark_evidence_incomplete');options.store.put('results',{kind:'league-table',...league,recordedAt:new Date().toISOString(),retention:'KEEP_ALL',routing:'RECOMMENDATION_ONLY'});return league;});
}

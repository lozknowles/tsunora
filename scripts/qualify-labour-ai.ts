import fs from 'node:fs';
import path from 'node:path';
import {once} from 'node:events';
import {isDeepStrictEqual} from 'node:util';
import {LabourExchange} from '../src/control/labour-exchange.js';
import {LabourLedger,labourHash} from '../src/control/labour-ledger.js';
import {LabourNativeAIBackend,labourFileHash} from '../src/control/labour-ai-backend.js';
import {ContainmentSupervisor,sealExecutionScope} from '../src/control/containment.js';
import {AgentControlService} from '../src/control/application-service.js';
import {PtyRegistry} from '../src/control/pty.js';
import {startWebDashboard} from '../src/control/web-server.js';
import type {WorkOrder,LabourVerifier} from '../src/control/labour-types.js';

const root=path.resolve(process.argv[2]);fs.mkdirSync(root,{recursive:true});
if(fs.existsSync(path.join(root,'events.jsonl')))throw Error('fresh_evidence_required');
const manifestPath=path.resolve('scripts/labour-ai-benchmark.json'),hash=await labourFileHash(manifestPath),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
fs.copyFileSync(manifestPath,path.join(root,'frozen-benchmark.json'));fs.writeFileSync(path.join(root,'frozen-benchmark.sha256'),hash+'\n');
const runtime=process.env.LABOUR_LLAMA_CLI;
if(!runtime)throw Error('LABOUR_LLAMA_CLI_required');
const specs=[['LOCAL-GENERAL-3B','qwen25-general-3b',process.env.LABOUR_GENERAL_MODEL??''],['LOCAL-CODER-3B','qwen25-coder-3b',process.env.LABOUR_CODER_SMALL_MODEL??''],['LOCAL-CODER-7B','qwen25-coder-7b',process.env.LABOUR_CODER_LARGE_MODEL??'']];
if(specs.some(row=>!row[2]))throw Error('LABOUR_model_paths_required');
const runtimeSha256=await labourFileHash(runtime),backends=[];
for(const [workerId,modelId,modelPath]of specs){const modelSha256=await labourFileHash(modelPath);backends.push(new LabourNativeAIBackend('native-'+modelId,{runtime,runtimeSha256,modelId,modelPath,modelSha256,threads:4,maximumOutputTokens:160,seed:415}));}
fs.writeFileSync(path.join(root,'worker-configurations.json'),JSON.stringify(backends.map((b,i)=>({workerId:specs[i][0],...b.configuration,backendRevision:b.revision})),null,2));
const ledger=new LabourLedger(path.join(root,'events.jsonl')),containment=new ContainmentSupervisor(path.join(root,'containment.json')),exchange=new LabourExchange(ledger,containment);
const cases=new Map<string,any>([...manifest.calibration,...manifest.heldOut].map((x:any)=>[x.id,x]));
const normal=(x:unknown)=>typeof x==='string'?x.replace(/\s+/g,'').replace(/'/g,'"'):x;
const verifier:LabourVerifier={id:'frozen-ai-contract',revision:hash,accepts:o=>{const i=o.input as any,c=cases.get(i?.caseId);return !!c&&c.prompt===i.prompt&&c.jobType===o.jobType;},verify(o,r){const c=cases.get((o.input as any).caseId)!;let passed=false;
 if(c.jobType==='coding'){const actual=r.output as any;passed=!!actual&&typeof actual==='object'&&Object.keys(actual).length===Object.keys(c.expected).length&&Object.entries(c.expected).every(([k,v])=>normal(actual[k])===normal(v));}
 else if(c.jobType==='tool-mediated'){const actual=r.output as any;passed=isDeepStrictEqual(actual?.request,c.expected)&&actual?.result===c.expected.arguments.reduce((s:number,n:number)=>s+n,0)&&r.resources?.tools.length===1;}
 else passed=isDeepStrictEqual(r.output,c.expected);
 return {passed,detail:passed?'Frozen independent contract matched':'Frozen contract rejected output; same criterion for every strategy'};}};
exchange.registerOrganisation({id:'ai-lab',currency:'XCU',maximumCharges:200000000});exchange.registerVerifier(verifier);for(const b of backends)exchange.registerBackend(b);
const capabilities=manifest.calibration.map((c:any)=>c.jobType);
for(const [i,b]of backends.entries())exchange.registerWorker({id:specs[i][0],organisationId:'ai-lab',name:specs[i][0],workerType:'bounded-native-ai',capabilities,tools:['ai-infer','sum'],permissions:['bounded-inference','tool.sum'],backendId:b.id,backendRevision:b.revision,modelConfiguration:{model:b.configuration.modelId,modelSha256:b.configuration.modelSha256,runtimeSha256},rateCard:{currency:'XCU',executionCharge:1000000,verificationCharge:1000,riskCharge:0,metering:'cpu-ms',basis:'One internal XCU accounting unit = one measured child CPU millisecond; no monetary conversion. Unknown CPU conservatively charges reserved ceiling; explicitly flagged.'},concurrency:1,status:'registered',qualifications:[]});
const scope=sealExecutionScope({workspace:'ai-labour-qualification',repository:null,filesystem:{readable:specs.map(s=>s[2]).concat(runtime),writable:[]},network:{destinations:[],ports:[]},devices:[],runtimes:backends.map(b=>b.id),credentialReferences:[],tools:['ai-infer','sum'],apis:[],models:specs.map(s=>s[1]),subprocesses:['/usr/bin/time',runtime],maximum:{runtimeMs:180000,cpuPercent:400,ramBytes:8*1024**3,gpuPercent:0,vramBytes:0,diskBytes:0,networkBytes:0,externalEffects:0},createdAt:new Date().toISOString()});
function order(id:string,c:any,strategy?:'fixed'|'cheapest'|'broker'):WorkOrder{return{id,organisationId:'ai-lab',jobType:c.jobType,description:'Bounded AI operational outcome: '+c.jobType,input:{caseId:c.id,prompt:c.prompt},requiredCapabilities:[c.jobType],requiredPermissions:['bounded-inference',...(c.jobType==='tool-mediated'?['tool.sum']:[])],minimumQualification:'QUALIFIED',deadline:new Date(Date.now()+240000).toISOString(),maximumCost:3003000,maximumAttempts:3,priority:'normal',verification:{id:verifier.id,revision:verifier.revision},scope,...(strategy?{comparison:{benchmarkHash:hash,caseId:c.id,strategy}}:{})};}
const service=new AgentControlService({version:1,paused:false,lastRestorePoint:null,lanes:[]},new PtyRegistry(),undefined,'4.15-ai-labour-experimental',()=>{});
const server=startWebDashboard(service,{host:'127.0.0.1',port:Number(process.env.LABOUR_PORT??19517),operatorToken:'labour-isolated-qualification',assetsDir:path.resolve('assets/dashboard'),labourExchange:exchange,labourEvidenceDirectory:root,containment});await once(server,'listening');
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms)),checks:any={benchmarkHash:hash,startedAt:new Date().toISOString(),calibration:[],comparison:[],monetaryConversion:null};
const snapshot=()=>{fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(checks,null,2));fs.writeFileSync(path.join(root,'projection.json'),JSON.stringify(exchange.projection(),null,2));};
console.log(JSON.stringify({status:'READY',hash,port:(server.address() as any).port}));
try{
 for(const [worker]of specs){for(const c of manifest.calibration){exchange.setStatus(worker,'registered');const q=await exchange.qualify(worker,[order('cal-'+worker+'-'+c.id,c)]);checks.calibration.push({worker,case:c.id,...q});snapshot();console.log(JSON.stringify({stage:'calibration',worker,case:c.id,passed:q.passed}));}exchange.setStatus(worker,'available');}
 checks.calibrationEndedAt=new Date().toISOString();snapshot();
 if(process.env.LABOUR_WAIT==='1'){fs.writeFileSync(path.join(root,'ready-for-market.json'),JSON.stringify({status:'WAITING_FOR_RUN'}));while(!fs.existsSync(path.join(root,'RUN')))await sleep(250);}
 const heldOut=process.env.LABOUR_VIDEO_ONLY==='1'?manifest.heldOut.slice(0,1):manifest.heldOut;
 checks.runScope=process.env.LABOUR_VIDEO_ONLY==='1'?'FRESH_VIDEO_REPRODUCTION_FIRST_FROZEN_CASE_NOT_ECONOMIC_BENCHMARK':'FULL_FROZEN_ECONOMIC_BENCHMARK';
 for(const [index,c]of heldOut.entries()){const policies=['fixed','cheapest','broker'] as const;for(let n=0;n<3;n++){const strategy=policies[(index+n)%3];const outcome=await exchange.submit(order('held-'+strategy+'-'+c.id,c,strategy),strategy==='fixed'?{fixed:manifest.protocol.fixedWorker}:strategy);checks.comparison.push({case:c.id,strategy,...outcome});snapshot();console.log(JSON.stringify({stage:'comparison',case:c.id,strategy,state:outcome.state,attempts:outcome.attempts.length}));}}
 // Same economic identity on a different actually executed model; do not transfer qualifications.
 const identity='LOCAL-GENERAL-3B',before=exchange.worker(identity),beforeCount=exchange.projection().attempts.filter(a=>a.workerId===identity).length;
 exchange.changeBackend(identity,backends[1].id,{model:backends[1].configuration.modelId,modelSha256:backends[1].configuration.modelSha256,runtimeSha256});const denied=await exchange.submit(order('identity-before-requalification',manifest.calibration[2]),{fixed:identity});
 const q=await exchange.qualify(identity,[order('identity-requalification',manifest.calibration[2])]);const after=await exchange.submit(order('identity-after-requalification',manifest.heldOut[4]),{fixed:identity});
 checks.identity={workerId:identity,beforeBackend:before.backendId,afterBackend:exchange.worker(identity).backendId,historyBefore:beforeCount,historyAfter:exchange.projection().attempts.filter(a=>a.workerId===identity).length,unqualifiedOutcome:denied,qualification:q,outcome:after};snapshot();
 // Controlled failure is separate from untouched natural-performance comparison.
 const faultCase=manifest.heldOut[4],probe=order('controlled-ai-failure',faultCase),bids=exchange.tender(probe).bids.sort((a,b)=>a.expectedCompletionCost-b.expectedCompletionCost||(a.expectedLatencyMs??Infinity)-(b.expectedLatencyMs??Infinity)||a.workerId.localeCompare(b.workerId));
 if(bids.length>=2){const b=backends.find(b=>b.id===exchange.worker(bids[0].workerId).backendId)!,original=b.execute.bind(b);let injected=false;
 b.execute=async(o,w,owned,signal)=>{if(o.id!==probe.id||injected)return original(o,w,owned,signal);injected=true;const run=owned.runProcess.bind(owned);owned.runProcess=async(request,abort)=>{const pending=run(request,abort);await sleep(1500);const pids=owned.activePids();checks.faultPids=pids;await owned.terminateAll('controlled-ai-worker-failure');return pending;};return original(o,w,owned,signal);};
 checks.controlledFailure={classification:'CONTROLLED_FAULT_EXCLUDED_FROM_ECONOMIC_COMPARISON',originalBid:bids[0],outcome:await exchange.submit(probe)};b.execute=original;snapshot();}
 else checks.controlledFailure={classification:'BLOCKED',reason:'Fewer than two qualified eligible workers'};
 exchange.setStatus('LOCAL-CODER-3B','quarantined');checks.quarantine=await exchange.submit(order('ai-quarantine',manifest.heldOut[4]));
 const permissionDenied=order('ai-permission-denied',manifest.heldOut[0]);permissionDenied.requiredPermissions=['external-publish'];checks.permission=await exchange.submit(permissionDenied);
 // Verify the existing kill supervisor on a genuinely executing AI process, outside comparison.
 const killOrder=order('ai-containment-stop',manifest.heldOut[4]);let killPromise:Promise<unknown>|undefined;
 const originals=new Map(backends.map(b=>[b.id,b.execute.bind(b)]));
 for(const b of backends)b.execute=async(o,w,owned,signal)=>{if(o.id===killOrder.id){const run=owned.runProcess.bind(owned);owned.runProcess=async(request,abort)=>{const pending=run(request,abort);await sleep(1000);checks.containmentPids=owned.activePids();killPromise=containment.kill({kind:'WORKER',id:w.id},'qualification-operator','AI labour physical containment qualification');await killPromise;return pending;};}return originals.get(b.id)!(o,w,owned,signal);};
 checks.containmentOutcome=await exchange.submit(killOrder);checks.containmentStop=await killPromise;
 for(const b of backends)b.execute=originals.get(b.id)!;
 checks.stoppedAdmission=await exchange.submit(order('after-ai-containment',manifest.heldOut[4]));
 checks.completedAt=new Date().toISOString();checks.status='EXECUTED_REVIEW_REQUIRED';snapshot();
}catch(error){checks.error=String(error);checks.status='FAILED_PRESERVED';snapshot();console.error(error);process.exitCode=1;}
console.log(JSON.stringify({status:checks.status,attempts:exchange.projection().attempts.length}));
if(process.env.LABOUR_WAIT==='1')while(!fs.existsSync(path.join(root,'STOP')))await sleep(250);
server.closeAllConnections();server.close();ledger.close();

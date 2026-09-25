import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {LabourExchange} from '../src/control/labour-exchange.js';
import {LabourLedger} from '../src/control/labour-ledger.js';
import {LabourProcessBackend} from '../src/control/labour-process-backend.js';
import {labourExactVerifier} from '../src/control/labour-verifier.js';
import {ContainmentSupervisor,sealExecutionScope} from '../src/control/containment.js';
import {AgentControlService} from '../src/control/application-service.js';
import {PtyRegistry} from '../src/control/pty.js';
import {startWebDashboard} from '../src/control/web-server.js';
import type {WorkOrder,DigitalWorker,LabourBackend} from '../src/control/labour-types.js';

const root=path.resolve(process.argv[2]??'work/labour-qualification');
fs.mkdirSync(root,{recursive:true});
if(fs.existsSync(path.join(root,'events.jsonl')))throw Error('fresh_evidence_directory_required');
const manifestPath=path.resolve('scripts/labour-workload.json'),manifestBytes=fs.readFileSync(manifestPath),manifest=JSON.parse(manifestBytes.toString()),manifestHash=createHash('sha256').update(manifestBytes).digest('hex');
fs.writeFileSync(path.join(root,'frozen-workload.json'),manifestBytes);
fs.writeFileSync(path.join(root,'frozen-workload.sha256'),manifestHash+'\n');
const ledger=new LabourLedger(path.join(root,'events.jsonl')),containment=new ContainmentSupervisor(path.join(root,'containment.json')),exchange=new LabourExchange(ledger,containment);
exchange.registerOrganisation({id:'qualification',currency:'GBP',maximumCharges:1000000});exchange.registerVerifier(labourExactVerifier);
const backendSpecs=[['node-bigint',process.execPath,'scripts/labour-worker-bigint.mjs'],['node-decimal',process.execPath,'scripts/labour-worker-decimal.mjs'],['python-integer',process.env.LABOUR_PYTHON??'/usr/bin/python3','scripts/labour-worker-python.py']];
const backends:LabourBackend[]=backendSpecs.map(([id,command,program])=>new LabourProcessBackend(id,command,path.resolve(program)));
for(const backend of backends)exchange.registerBackend(backend);
const scope=sealExecutionScope({workspace:'labour-isolated-qualification',repository:null,filesystem:{readable:[],writable:[]},network:{destinations:[],ports:[]},devices:[],runtimes:backends.map(b=>b.id),credentialReferences:[],tools:backends.map(b=>b.id),apis:[],models:[],subprocesses:[...new Set(backendSpecs.map(x=>x[1]))],maximum:{runtimeMs:5000,cpuPercent:100,ramBytes:256*1024*1024,gpuPercent:0,vramBytes:0,diskBytes:0,networkBytes:0,externalEffects:0},createdAt:new Date().toISOString()});
const workerIds=['INTEGER-NODE-01','DECIMAL-NODE-01','INTEGER-PYTHON-01'];
for(const [i,b]of backends.entries()){
  const worker:DigitalWorker={id:workerIds[i],organisationId:'qualification',name:workerIds[i],workerType:'deterministic-program',capabilities:['sum','classification','extraction'],tools:[b.id],permissions:['bounded-compute'],backendId:b.id,backendRevision:b.revision,modelConfiguration:{},rateCard:{currency:'GBP',executionCharge:10,verificationCharge:2,riskCharge:0,basis:'Uniform declared internal tariff: 10 micro-GBP per started bounded process, 2 per verification; not external financial or energy cost'},concurrency:1,status:'registered',qualifications:[]};exchange.registerWorker(worker);
}
function order(id:string,item:any):WorkOrder{return {id,organisationId:'qualification',jobType:item.jobType,description:'Return exact '+item.jobType+' outcome on supplied bounded input',input:item.input,requiredCapabilities:[item.jobType],requiredPermissions:['bounded-compute'],minimumQualification:'QUALIFIED',deadline:new Date(Date.now()+30000).toISOString(),maximumCost:50,maximumAttempts:3,priority:'normal',verification:{id:'exact-result',revision:'1'},scope};}
const service=new AgentControlService({version:1,paused:false,lastRestorePoint:null,lanes:[]},new PtyRegistry(),undefined,'4.15-labour-experimental',()=>{});
const server=startWebDashboard(service,{host:'127.0.0.1',port:Number(process.env.LABOUR_PORT??0),operatorToken:'labour-isolated-qualification',assetsDir:path.resolve('assets/dashboard'),labourExchange:exchange,labourEvidenceDirectory:root,containment});await once(server,'listening');
const port=(server.address() as any).port;
fs.writeFileSync(path.join(root,'ready.json'),JSON.stringify({port,manifestHash,status:'WAITING_FOR_RUN_SIGNAL'}));
console.log(JSON.stringify({port,manifestHash,status:'WAITING_FOR_RUN_SIGNAL'}));
const checks:Record<string,unknown>={manifestHash,scope:'bounded deterministic workers only',externalCosts:'UNKNOWN',tokens:'NOT_APPLICABLE',energy:'NOT_MEASURED'};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const signal=path.join(root,'RUN');
while(!fs.existsSync(signal))await sleep(100);
try{
  for(const id of workerIds){const q=await exchange.qualify(id,manifest.calibration.map((x:any)=>order('cal-'+id+'-'+x.id,x)));if(!q.passed)throw Error('qualification_failed:'+id);}
  checks.realWorkers=workerIds.length;checks.executionEngines=['Node.js','Python'];
  // Paired policies use identical held-out inputs and uniform tariffs. No deliberate winner manipulation.
  const comparison=[];
  for(const item of manifest.heldOut){
    for(const policy of (process.env.LABOUR_VIDEO_ONLY==='1'?['broker'] as const:['broker','cheapest',...workerIds.map(fixed=>({fixed}))] as const)){
      const label=typeof policy==='string'?policy:policy.fixed;
      const result=await exchange.submit(order('held-'+label+'-'+item.id,item),policy);
      const attempt=exchange.projection().attempts.find(a=>a.id===result.attempts.at(-1));
      comparison.push({case:item.id,policy:label,...result,expectedMatched:!!attempt&&isDeepStrictEqual(attempt.execution.output,item.expected)});
    }
  }
  checks.heldOut=comparison;
  // Physically stop one awarded worker's real process. It is a fault-injection test, not natural reliability evidence.
  const probe=order('controlled-failure',manifest.heldOut[0]);
  const bids=exchange.tender(probe).bids.sort((a,b)=>a.expectedCompletionCost-b.expectedCompletionCost||(a.expectedLatencyMs??Infinity)-(b.expectedLatencyMs??Infinity)||a.workerId.localeCompare(b.workerId));
  const winner=exchange.worker(bids[0].workerId),backend=backends.find(b=>b.id===winner.backendId)!,original=backend.execute.bind(backend);
  let injected=false;
  backend.execute=async(o,w,owned,signal)=>{
    if(o.id!==probe.id||injected)return original(o,w,owned,signal);injected=true;
    const normal=owned.runProcess.bind(owned);
    owned.runProcess=async(request,abort)=>{const pending=normal({...request,env:{...request.env,LABOUR_QUALIFICATION_HOLD:'1'}},abort);for(let i=0;i<2000&&!owned.activePids().length;i++)await sleep(1);await owned.terminateAll('qualification-controlled-worker-failure');return pending;};
    return original(o,w,owned,signal);
  };
  const recovery=await exchange.submit(probe);backend.execute=original;
  checks.controlledFailure={injected,outcome:recovery,attempts:exchange.projection().attempts.filter(a=>a.workOrderId===probe.id),classification:'CONTROLLED_PHYSICAL_FAULT_NOT_NATURAL_RELIABILITY'};
  if(!injected||recovery.state!=='COMPLETED'||recovery.attempts.length<2)throw Error('failure_rebroker_not_demonstrated');
  exchange.setStatus(workerIds[0],'quarantined');
  const quarantineOrder=order('quarantine-exclusion',manifest.heldOut[1]),quarantineOutcome=await exchange.submit(quarantineOrder),qevents=exchange.projection().events.filter(e=>e.kind==='tender.opened'&&(e.data as any).workOrderId===quarantineOrder.id);
  checks.quarantine={outcome:quarantineOutcome,tenders:qevents,excluded:!exchange.projection().attempts.some(a=>a.workOrderId===quarantineOrder.id&&a.workerId===workerIds[0])};
  const denied=order('permission-denied',manifest.heldOut[0]);denied.requiredPermissions=['external-publish'];checks.permissionDenial=await exchange.submit(denied);
  const unqualified=order('qualification-denied',manifest.heldOut[0]);unqualified.requiredCapabilities=['unqualified-coding'];checks.qualificationDenial=await exchange.submit(unqualified);
  // Existing containment control, with a live owned process and durable stop evidence.
  let stopPromise:Promise<unknown>|undefined;
  const remaining=backends.filter(b=>b.id!==exchange.worker(workerIds[0]).backendId);
  const originals=new Map(remaining.map(b=>[b.id,b.execute.bind(b)]));
  for(const b of remaining){b.execute=async(o,w,owned,signal)=>{if(o.id==='containment-stop'){const normal=owned.runProcess.bind(owned);owned.runProcess=async(request,abort)=>{const pending=normal({...request,env:{...request.env,LABOUR_QUALIFICATION_HOLD:'1'}},abort);for(let i=0;i<2000&&!owned.activePids().length;i++)await sleep(1);stopPromise=containment.kill({kind:'WORKER',id:w.id},'qualification-operator','bounded physical kill-control qualification');await stopPromise;return pending;};}return originals.get(b.id)!(o,w,owned,signal);};}
  checks.containmentOutcome=await exchange.submit(order('containment-stop',manifest.heldOut[0]));checks.containmentStop=await stopPromise;
  for(const b of remaining)b.execute=originals.get(b.id)!;
  checks.completedAt=new Date().toISOString();checks.savings='NOT YET DEMONSTRATED';checks.status='PHYSICAL_RUN_COMPLETE_REVIEW_REQUIRED';
  fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(checks,null,2));fs.writeFileSync(path.join(root,'projection.json'),JSON.stringify(exchange.projection(),null,2));
  console.log(JSON.stringify({status:checks.status,attempts:exchange.projection().attempts.length,report:path.join(root,'report.json')}));
}catch(error){fs.writeFileSync(path.join(root,'failure.json'),JSON.stringify({error:String(error),checks},null,2));console.error(error);process.exitCode=1;}
while(!fs.existsSync(path.join(root,'STOP')))await sleep(250);
server.closeAllConnections();server.close();ledger.close();

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

const root=path.resolve(process.argv[2]??'work/tsunora-qualification');
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
function order(id:string,item:any):WorkOrder{return {id,organisationId:'qualification',jobType:item.jobType,description:'Return exact '+item.jobType+' outcome on supplied bounded input',input:item.input,requiredCapabilities:[item.jobType],requiredPermissions:['bounded-compute'],minimumQualification:'QUALIFIED',deadline:new Date(Date.now()+300000).toISOString(),maximumCost:50,maximumAttempts:3,priority:'normal',verification:{id:'exact-result',revision:'1'},scope};}
const service=new AgentControlService({version:1,paused:false,lastRestorePoint:null,lanes:[]},new PtyRegistry(),undefined,'4.15-labour-experimental',()=>{});
const allowedOrigins:string[]=[];
const server=startWebDashboard(service,{allowedOrigins,host:'127.0.0.1',port:Number(process.env.LABOUR_PORT??0),operatorToken:'labour-isolated-qualification',assetsDir:path.resolve('assets/dashboard'),labourExchange:exchange,labourEvidenceDirectory:root,containment});await once(server,'listening');
const port=(server.address() as any).port;
allowedOrigins.push('http://127.0.0.1:'+port);
fs.writeFileSync(path.join(root,'ready.json'),JSON.stringify({port,manifestHash,status:'WAITING_FOR_RUN_SIGNAL'}));
console.log(JSON.stringify({port,manifestHash,status:'WAITING_FOR_RUN_SIGNAL'}));
const checks:Record<string,unknown>={manifestHash,scope:'bounded deterministic workers only',externalCosts:'UNKNOWN',tokens:'NOT_APPLICABLE',energy:'NOT_MEASURED'};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
// Fresh disposable UI qualification; the existing runtime remains authoritative.
for(const id of workerIds){const q=await exchange.qualify(id,manifest.calibration.map((x:any)=>order('cal-'+id+'-'+x.id,x)));if(!q.passed)throw Error('qualification_failed:'+id);}
fs.writeFileSync(path.join(root,'ui-work-order.json'),JSON.stringify(order('tsunora-ui-outcome',manifest.heldOut[0]),null,2));
fs.writeFileSync(path.join(root,'ui-ready.json'),JSON.stringify({port,manifestHash}));
while(!fs.existsSync(path.join(root,'STOP')))await sleep(100);
fs.writeFileSync(path.join(root,'projection.json'),JSON.stringify(exchange.projection(),null,2));
server.closeAllConnections();server.close();ledger.close();

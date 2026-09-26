import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {JobCatalog} from '../control/job-catalog.js';
import {ActionFailure,ActionRegistry,ArtifactStore,JobRuntime,ResourceLockManager,RunLedger,WorkerRegistry} from '../control/job-runtime.js';
import {ContainmentSupervisor,sealExecutionScope,assessScope} from '../control/containment.js';
import {RuntimeSafetySupervisor} from '../control/runtime-safety-supervisor.js';
import {redactSensitiveValue} from '../control/security-redaction.js';
import type {ActionContext,JobDefinition} from '../control/job-types.js';
export const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const intents=['policy','letter','contact','leave','onboard','offboard','payroll','bank','manager','department','international','access'] as const;
export type Intent=typeof intents[number];
export type Fault='none'|'scope'|'worker'|'model'|'tool'|'timeout'|'incorrect'|'verification'|'ambiguity';
export type Actor={id:string;tenant:string;employee:string;role:'employee'|'manager'|'hr'|'payroll'|'it'|'finance'};
export const employee:Actor={id:'SYNTHETIC-EMPLOYEE',tenant:'DEMO-A',employee:'EMP-0042',role:'employee'};
export const reviewer:Actor={id:'SYNTHETIC-HR',tenant:'DEMO-A',employee:'EMP-0001',role:'hr'};
export const questions:Record<Intent,string>={policy:'What is our leave policy?',letter:'I need a copy of my employment letter.',contact:"I have moved house. Can you update my details?",leave:'I need next Friday off.',onboard:'Please onboard our new starter on Monday.',offboard:'Sam leaves the company on Friday.',payroll:'My salary looks wrong.',bank:'I have changed my bank account.',manager:'My manager has changed.',department:'I am moving to a different department.',international:'I am moving from the UK Sales team to Germany next month.',access:"I cannot access Salesforce."};
export function parseIntent(text:string):Intent|'ambiguous'|'unsafe'{
 if(text.length>2000||/ignore|bypass|system prompt|all employees|bulk|administrator|privileged|secret|password|api.?key|sk-[a-z0-9]/i.test(text))return 'unsafe';
 const patterns:Array<[Intent,RegExp]>=[['policy',/policy|entitlement/i],['letter',/employment letter|copy of.*letter/i],['contact',/moved house|moving house|address|contact details/i],['leave',/Friday off|leave request|holiday/i],['onboard',/onboard|new starter/i],['offboard',/leaves the company|offboard/i],['payroll',/salary|pay.*wrong|payroll/i],['bank',/bank/i],['manager',/manager.*changed|change.*manager/i],['international',/Germany|international/i],['department',/department|team transfer/i],['access',/access.*Salesforce|Salesforce.*access/i]];
 const hits=patterns.filter(([,p])=>p.test(text));return hits.length===1?hits[0][0]:'ambiguous';
}
export const policies:Record<Intent,{risk:'LOW'|'MEDIUM'|'HIGH';capability:string;field:string;value:string;tool:string}>={
 policy:{risk:'LOW',capability:'policy',field:'policyRead',value:'POLICY-V1',tool:'policy'},letter:{risk:'LOW',capability:'document',field:'document',value:'SYNTHETIC-EMPLOYMENT-LETTER',tool:'documents'},contact:{risk:'MEDIUM',capability:'hr',field:'address',value:'SYNTHETIC-ADDRESS-B',tool:'hris'},leave:{risk:'MEDIUM',capability:'hr',field:'leave',value:'SYNTHETIC-FRIDAY-REQUEST',tool:'hris'},onboard:{risk:'HIGH',capability:'hr',field:'onboarding',value:'SYNTHETIC-ONBOARDING-PREPARED',tool:'hris'},offboard:{risk:'HIGH',capability:'hr',field:'offboarding',value:'SYNTHETIC-OFFBOARDING-PREPARED',tool:'hris'},payroll:{risk:'HIGH',capability:'payroll',field:'payrollCase',value:'SYNTHETIC-RECONCILIATION-OPEN',tool:'payroll'},bank:{risk:'HIGH',capability:'payroll',field:'bank',value:'SYNTHETIC-BANK-B',tool:'payroll'},manager:{risk:'MEDIUM',capability:'hr',field:'manager',value:'SYNTHETIC-MANAGER-B',tool:'hris'},department:{risk:'MEDIUM',capability:'hr',field:'department',value:'SYNTHETIC-DEPARTMENT-B',tool:'hris'},international:{risk:'HIGH',capability:'hr',field:'transferCase',value:'SYNTHETIC-INTERNATIONAL-REVIEW',tool:'hris'},access:{risk:'MEDIUM',capability:'it',field:'access',value:'SYNTHETIC-SALESFORCE-STANDARD',tool:'identity'}};
type Request={id:string;actor:Actor;target:string;tenant:string;intent:Intent|'ambiguous'|'unsafe';fault:Fault;confirmed:boolean;hash:string;approval:boolean;runId?:string;faultUsed:boolean};
type Store={requests:Record<string,Request>;records:Record<string,Record<string,string>>;approvals:Record<string,{actor:Actor;decision:string;requestHash:string}>};
const seed=()=>Object.fromEntries(['DEMO-A','DEMO-B'].flatMap(t=>['EMP-0042','EMP-0197'].map(id=>[t+'/'+id,{id,tenant:t,address:'SYNTHETIC-ADDRESS-A',bank:'SYNTHETIC-BANK-A',manager:'SYNTHETIC-MANAGER-A',department:'SYNTHETIC-DEPARTMENT-A',access:'NONE'}])));
export class WorkforceLab{
 readonly workers=new WorkerRegistry();readonly actions=new ActionRegistry();readonly catalog:JobCatalog;readonly runtime:JobRuntime;readonly containment:ContainmentSupervisor;private store:Store;private file:string;
 constructor(readonly root:string,readonly profile:'balanced'|'review-all'='balanced',readonly strategy:'primary'|'fallback'='primary'){
 fs.mkdirSync(root,{recursive:true});this.file=path.join(root,'synthetic-state.json');this.store=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{requests:{},records:seed(),approvals:{}};
 this.containment=new ContainmentSupervisor(path.join(root,'containment.json'));
 for(const cap of ['intake','policy','hr','payroll','it','document','verification'])for(const prefix of ['a','z'])this.workers.registerControllerInternal({id:prefix+'-'+cap,capabilities:['workforce.'+cap,'structured','tool-use','high-risk-qualified'],health:strategy==='fallback'&&prefix==='a'?'offline':'healthy',capacity:1,active:0,observedAt:new Date().toISOString(),labels:{engine:'deterministic',qualification:'synthetic-domain-v1'}});
 for(const stage of ['intake','policy','prepare','execute','verify'])this.actions.registerConsequentialControl('workforce.'+stage+'@1.0.0',c=>this.action(stage,c),['FILESYSTEM_WRITE']);
 this.catalog=new JobCatalog(this.actions.ids());
 const ledger=new RunLedger(path.join(root,'runs.json'));for(const run of ledger.list())if(!this.catalog.job(run.jobId+'@'+run.jobVersion))this.catalog.addJob(run.effectiveJob);
 this.runtime=new JobRuntime(this.catalog,this.actions,this.workers,ledger,new ArtifactStore(path.join(root,'artifacts')),new ResourceLockManager(path.join(root,'locks.json')),{approval:()=>false,safety:new RuntimeSafetySupervisor({id:'workforce-synthetic-filesystem-v1',approvedFilesystemRoots:[root]},path.join(root,'runtime-safety.json'))});
 for(const w of this.workers.list())if(!this.containment.schedulingEligibility([{kind:'WORKER',id:w.id}]).eligible)this.workers.setHealth(w.id,'degraded');
 ledger.recoverFailClosed();this.save();
 }
 private save(){const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(redactSensitiveValue(this.store),null,2),{mode:0o600,flush:true});fs.renameSync(tmp,this.file);}
 private event(c:ActionContext,type:string,evidence:unknown){this.runtime.ledger.update(this.runtime.ledger.get(c.run.id)!,type,{worker:c.worker.id,step:c.step.id,detail:redactSensitiveValue(evidence)});}
 submit(text:string,actor:Actor=employee,options:{target?:string;tenant?:string;fault?:Fault;confirmed?:boolean}={}){
 const intent=parseIntent(text),id='workforce-'+randomUUID(),policy=intent in policies?policies[intent as Intent]:null;
 const base={id,actor:structuredClone(actor),target:options.target??actor.employee,tenant:options.tenant??actor.tenant,intent,fault:options.fault??'none',confirmed:options.confirmed??false,approval:!!policy&&(policy.risk==='HIGH'||this.profile==='review-all'),faultUsed:false};
 const req:Request={...base,hash:digest(base)};this.store.requests[id]=req;
 const output={name:'state',type:'application/json',schema:'workforce.plan/v1',version:'1.0.0'};
 const stages=['intake','policy','prepare','execute','verify'];const def:JobDefinition={apiVersion:'agent-control/v1',kind:'Job',metadata:{id,name:'Workforce Operations — '+intent,version:'1.0.0'},spec:{priority:policy?.risk==='HIGH'?'high':'normal',concurrency:'allow',parameters:{dataPath:{type:'string',default:this.root}},steps:stages.map((stage,i)=>({id:stage,action:'workforce.'+stage+'@1.0.0',requires:['workforce.'+(stage==='intake'?'intake':stage==='policy'?'policy':stage==='verify'?'verification':policy?.capability??'hr')],...(i?{dependsOn:[stages[i-1]],inputs:{state:stages[i-1]+'.state'}}:{}),outputs:[output],verification:['boundary-checked'],...(stage==='execute'?{resources:['synthetic:'+req.tenant+':'+req.target],approval:req.approval?'workforce-review':undefined,retry:{attempts:1,backoffSeconds:0}}:{})}))}};
 this.catalog.addJob(def);const run=this.runtime.createRun(id+'@1.0.0',{}, {type:'manual',actor:actor.id});req.runId=run.id;this.save();return run;
 }
 private request(runId:string){const r=Object.values(this.store.requests).find(r=>r.runId===runId);if(!r)throw Error('request_missing');return r;}
 private async action(stage:string,c:ActionContext){
 const r=this.request(c.run.id);const policy=policies[r.intent as Intent];
 const artifact=(value:unknown)=>({artifacts:[{name:'state',value}],verification:['boundary-checked']});
 if(stage==='intake'){
  if(r.intent==='unsafe'){this.event(c,'workforce.request_blocked',{reason:'untrusted_instruction',risk:'CRITICAL'});throw new ActionFailure('unsafe_request_blocked','configuration');}
  if(r.intent==='ambiguous'||r.fault==='ambiguity'){this.event(c,'workforce.clarification_required',{reason:'ambiguous_request'});throw new ActionFailure('clarification_required','configuration');}
  this.event(c,'workforce.intent',{intent:r.intent,engine:'deterministic-patterns',rawTextRetained:false});return artifact({intent:r.intent,requestHash:r.hash});
 }
 const prior=c.readArtifact(c.inputArtifacts[0].id) as any;if(prior.requestHash!==r.hash)throw new ActionFailure('baton_mismatch','configuration');
 if(stage==='policy'){
  if(r.tenant!==r.actor.tenant||!this.store.records[r.tenant+'/'+r.target]||(r.actor.role==='employee'&&r.target!==r.actor.employee)||(['onboard','offboard'].includes(r.intent)&&!['hr','manager'].includes(r.actor.role))){this.event(c,'workforce.authority_blocked',{risk:'CRITICAL',reason:'tenant_employee_or_role'});throw new ActionFailure('authority_denied','configuration');}
  if(!r.confirmed&&['contact','bank','manager','department'].includes(r.intent)){this.event(c,'workforce.clarification_required',{reason:'synthetic_details_not_confirmed'});throw new ActionFailure('details_required','configuration');}
  this.event(c,'workforce.policy_checked',{version:'workforce-demo-v1',risk:policy.risk,approval:r.approval,tenant:r.tenant,employee:r.target});return artifact({...prior,policy});
 }
 if(stage==='prepare'){const before=structuredClone(this.store.records[r.tenant+'/'+r.target]);const plan={...prior,tenant:r.tenant,employee:r.target,before,field:policy.field,value:policy.value,tool:policy.tool};this.event(c,'workforce.plan_prepared',{field:policy.field,tool:policy.tool,requestHash:r.hash});return artifact(plan);}
 if(stage==='execute'){
  if(r.approval&&this.store.approvals[r.id]?.decision!=='APPROVED')throw new ActionFailure('approval_missing','configuration');
  if(!this.containment.schedulingEligibility([{kind:'WORKER',id:c.worker.id}]).eligible)throw new ActionFailure('worker_quarantined','execution',true);
  const fault=!r.faultUsed?r.fault:'none';if(fault!=='none'){r.faultUsed=true;this.save();}
  if(['worker','model','tool','timeout'].includes(fault)){this.event(c,'workforce.'+fault+'_unavailable',{controlledInjection:true,modelInferenceExecuted:false});this.workers.setHealth(c.worker.id,'offline');if(fault==='timeout')await new Promise(res=>setTimeout(res,40));throw new ActionFailure('injected_'+fault,'execution',true);}
  const target=fault==='scope'?(r.target==='EMP-0042'?'EMP-0197':'EMP-0042'):r.target;
  const tool='workforce.'+policy.tool+'.'+r.tenant+'.'+target;
  const scope=sealExecutionScope({workspace:r.id,repository:null,filesystem:{readable:[],writable:[]},network:{destinations:[],ports:[]},devices:[],runtimes:[],credentialReferences:[],tools:['workforce.'+policy.tool+'.'+r.tenant+'.'+r.target],apis:[],models:[],subprocesses:[process.execPath],maximum:{runtimeMs:2000,cpuPercent:100,ramBytes:64000000,gpuPercent:0,vramBytes:0,diskBytes:0,networkBytes:0,externalEffects:0},createdAt:new Date().toISOString()});
  this.event(c,'workforce.tool_requested',{tool,scope:scope.sha256,authority:r.approval?'approved':'demo-policy',requestHash:r.hash});
  if(!assessScope(scope,{tool}).allowed){
   const stop=new AbortController();const unreg=this.containment.register({id:c.run.id+':'+c.worker.id,scopes:[{kind:'WORKER',id:c.worker.id},{kind:'JOB',id:c.run.id}],execution:c.ownedExecution,exclusive:true,leaseRevoker:async()=>stop.abort()});
   const processRun=c.ownedExecution.runProcess({command:process.execPath,args:['-e','setInterval(()=>{},1000)'],env:{PATH:'/usr/bin:/bin'},maxOutputBytes:4096},stop.signal).catch(()=>null);
   for(let i=0;i<20&&!c.ownedExecution.activePids().length;i++)await new Promise(res=>setTimeout(res,10));
   this.event(c,'workforce.scope_violation',{tool,allowedEmployee:r.target,attemptedEmployee:target,actionBlocked:true,controlledInjection:true,activeProcesses:c.ownedExecution.activePids().length});
   const kill=await this.containment.kill({kind:'WORKER',id:c.worker.id},'workforce-policy','Synthetic employee scope violation');await processRun;
   if(kill.state==='STOP_CONFIRMED')this.containment.recovery(kill.id,'QUARANTINED','scope violation requires operator requalification','workforce-policy');
   this.workers.setHealth(c.worker.id,'degraded');unreg();this.event(c,'workforce.worker_quarantined',{killId:kill.id,state:kill.state,actionBlocked:true});throw new ActionFailure('scope_violation_contained','execution',true);
  }
  const key=r.tenant+'/'+r.target;if(digest(this.store.records[key])!==digest(prior.before))throw new ActionFailure('stale_state_requires_review','configuration');
  const after={...prior.before,[policy.field]:fault==='incorrect'?'SYNTHETIC-WRONG':policy.value};this.store.records[key]=after;this.save();
  const receipt={...prior,after,actor:r.actor.id,worker:c.worker.id,approval:r.approval?this.store.approvals[r.id]:null,scope:scope.sha256,synthetic:true};this.event(c,'workforce.mutation_recorded',{tool,employee:r.target,beforeHash:digest(prior.before),afterHash:digest(after)});return artifact(receipt);
 }
 if(stage==='verify'){
  const record=this.store.records[r.tenant+'/'+r.target],passed=r.fault!=='verification'&&record[policy.field]===policy.value&&Object.keys(prior.before).every(k=>k===policy.field||record[k]===prior.before[k]);
  this.event(c,passed?'workforce.verification_pass':'workforce.verification_failed',{independentReadback:true,employee:r.target,field:policy.field,passed});
  if(!passed)throw new ActionFailure('state_verification_failed','verification');return artifact({...prior,verified:true,verificationHash:digest(record)});
 }
 throw Error('unknown_stage');
 }
 approve(runId:string,actor:Actor,allow:boolean){const r=this.request(runId);if(actor.tenant!==r.tenant||!['hr','payroll'].includes(actor.role)||actor.id===r.actor.id)throw Error('approval_authority_denied');
 if(!this.runtime.ledger.get(runId)?.steps.some(s=>s.status==='WAITING_FOR_APPROVAL'))throw Error('approval_not_waiting');
 this.store.approvals[r.id]={actor:structuredClone(actor),decision:allow?'APPROVED':'REJECTED',requestHash:r.hash};this.save();if(allow)this.runtime.approve(runId,'workforce-review',actor.id);else this.runtime.cancel(runId,'approval_rejected');}
 async tick(){return this.runtime.tick();}
 async settle(limit=12){for(let i=0;i<limit;i++)await this.tick();}
 projection(){const eventsFile=path.join(this.root,'run-events.jsonl');const events=fs.existsSync(eventsFile)?fs.readFileSync(eventsFile,'utf8').trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)):[];
 return {classification:'EXPERIMENTAL',synthetic:true,profile:this.profile,strategy:this.strategy,runs:this.runtime.ledger.list(),workers:this.workers.list(),requests:Object.values(this.store.requests),records:structuredClone(this.store.records),approvals:this.store.approvals,containment:this.containment.timeline(),events,artifacts:this.runtime.artifacts.list().map(a=>({id:a.id,runId:a.runId,stepId:a.stepId,sha256:a.sha256,value:this.runtime.artifacts.read(a.id)})),metrics:{freshTokens:'UNKNOWN',cachedTokens:'UNKNOWN',totalTokens:'UNKNOWN',cost:'UNKNOWN',energy:'UNKNOWN',modelExecution:'NOT EXECUTED',engine:'DETERMINISTIC'},exchange:'OPTIONAL_NOT_REQUIRED_NOT_ENABLED'};}
}

import {labourEconomics} from './labour-economics.js';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {z} from 'zod';
import {ContainmentSupervisor,assessScope} from './containment.js';
import {OwnedProcessManager} from './owned-process.js';
import {LabourLedger,labourHash} from './labour-ledger.js';
import type {DigitalWorker,LabourBackend,LabourVerifier,LabourOrganisation,WorkOrder,LabourBid,LabourAttempt,LabourOutcome,LabourExecutionResult} from './labour-types.js';

const money=z.number().int().nonnegative().max(1e12);
const identifier=z.string().regex(/^[a-zA-Z0-9_.-]{1,100}$/);
const orderSchema=z.object({id:identifier,organisationId:identifier,jobType:identifier,description:z.string().min(1).max(4000),input:z.unknown(),comparison:z.object({benchmarkHash:z.string().regex(/^[a-f0-9]{64}$/),caseId:identifier,strategy:z.enum(['fixed','cheapest','broker'])}).optional(),requiredCapabilities:z.array(identifier).min(1),requiredPermissions:z.array(identifier),minimumQualification:z.literal('QUALIFIED'),deadline:z.string().datetime(),maximumCost:money,priority:z.enum(['low','normal','high']),maximumAttempts:z.number().int().min(1).max(10),verification:z.object({id:identifier,revision:identifier}),scope:z.unknown()}).strict();
export class LabourExchange {
  readonly events=new EventEmitter();
  private workers=new Map<string,DigitalWorker>();
  private organisations=new Map<string,LabourOrganisation>();
  private backends=new Map<string,LabourBackend>();
  private verifiers=new Map<string,LabourVerifier>();
  private orders=new Map<string,{order:WorkOrder;hash:string}>();
  private attempts:LabourAttempt[]=[];
  private outcomes=new Map<string,LabourOutcome>();
  private active=new Set<string>();
  private activeWorkers=new Map<string,number>();
  private reservations=new Map<string,{organisationId:string;amount:number}>();
  private stopped=false;
  constructor(readonly ledger:LabourLedger,readonly containment:ContainmentSupervisor){
    for(const event of ledger.events()){
      const d=event.data as any;
      if(event.kind==='organisation.registered')this.organisations.set(d.id,d);
      if(['worker.registered','worker.updated','worker.qualified'].includes(event.kind))this.workers.set(d.id,d);
      if(event.kind==='order.accepted'){this.orders.set(d.order.id,d);this.reservations.set(d.order.id,{organisationId:d.order.organisationId,amount:d.order.maximumCost});}
      if(event.kind==='transaction.recorded')this.attempts.push(d);
      if(event.kind==='outcome.settled'){this.outcomes.set(d.workOrderId,d);this.reservations.delete(d.workOrderId);}
      if(event.kind==='exchange.stopped')this.stopped=true;
    }
    // An accepted but unsettled order may have caused effects. Never redispatch it automatically.
    for(const [id,{order,hash}]of this.orders)if(!this.outcomes.has(id)){
      const known=this.attempts.filter(a=>a.workOrderId===id);
      this.outcomes.set(id,{workOrderId:id,contractHash:hash,organisationId:order.organisationId,state:'INTERRUPTED',attempts:known.map(a=>a.id),totalCost:known.reduce((s,a)=>s+a.totalCost,0),retryCost:0,verificationCost:known.reduce((s,a)=>s+a.verificationCost,0),reason:'Restart with unresolved execution; reservation retained; operator reconciliation required'});
    }
  }
  private emit(kind:string,data:unknown){const e=this.ledger.append(kind,data);queueMicrotask(()=>this.events.emit('event',e));return e;}
  registerOrganisation(value:LabourOrganisation){identifier.parse(value.id);money.parse(value.maximumCharges);if(!/^[A-Z]{3}$/.test(value.currency)||this.organisations.has(value.id))throw Error('labour_organisation_invalid');this.emit('organisation.registered',value);this.organisations.set(value.id,structuredClone(value));}
  registerBackend(backend:LabourBackend){if(this.backends.has(backend.id))throw Error('labour_backend_duplicate');this.backends.set(backend.id,backend);}
  registerVerifier(verifier:LabourVerifier){if(this.verifiers.has(verifier.id))throw Error('labour_verifier_duplicate');this.verifiers.set(verifier.id,verifier);}
  registerWorker(worker:DigitalWorker){
    identifier.parse(worker.id);const org=this.organisations.get(worker.organisationId),backend=this.backends.get(worker.backendId);
    if(!org||!backend||backend.revision!==worker.backendRevision||this.workers.has(worker.id)||worker.qualifications.length||worker.status!=='registered'||!Number.isInteger(worker.concurrency)||worker.concurrency<1||worker.concurrency>16||worker.rateCard.currency!==org.currency)throw Error('labour_worker_registration_invalid');
    [worker.rateCard.executionCharge,worker.rateCard.verificationCharge,worker.rateCard.riskCharge].forEach(x=>money.parse(x));
    if(worker.rateCard.metering && (worker.rateCard.metering!=='cpu-ms'||org.currency!=='XCU'))throw Error('labour_metering_currency');
    if(!worker.rateCard.basis.trim())throw Error('labour_rate_basis_required');
    this.emit('worker.registered',worker);this.workers.set(worker.id,structuredClone(worker));
  }
  worker(id:string){const w=this.workers.get(id);if(!w)throw Error('labour_worker_missing');return structuredClone(w);}
  setStatus(id:string,status:DigitalWorker['status']){
    const w=this.worker(id);if(!['registered','available','degraded','quarantined','offline'].includes(status))throw Error('labour_status_invalid');
    if(w.status==='quarantined'&&status!=='quarantined')throw Error('labour_quarantine_requires_requalification');
    w.status=status;this.emit('worker.updated',w);this.workers.set(id,w);
  }
  changeBackend(id:string,backendId:string,modelConfiguration?:Record<string,string>){
    const w=this.worker(id),backend=this.backends.get(backendId);if(!backend||this.activeWorkers.get(id))throw Error('labour_backend_change_denied');
    w.backendId=backend.id;w.backendRevision=backend.revision;w.modelConfiguration=structuredClone(modelConfiguration??{});w.status='registered';this.emit('worker.updated',w);this.workers.set(id,w);
  }
  private parseOrder(input:WorkOrder){
    orderSchema.parse(input);if(!input.scope||!assessScope(input.scope,{}).allowed)throw Error('labour_scope_invalid');
    if(!Number.isFinite(Date.parse(input.deadline)))throw Error('labour_deadline_invalid');
    const org=this.organisations.get(input.organisationId),v=this.verifiers.get(input.verification.id);
    if(!org||!v||v.revision!==input.verification.revision||!v.accepts(input))throw Error('labour_contract_unavailable');
    return structuredClone(input);
  }
  private rejections(w:DigitalWorker,o:WorkOrder,qualification=false):string[]{
    const b=this.backends.get(w.backendId),why:string[]=[];
    if(w.organisationId!==o.organisationId)why.push('organisation');
    if(!o.requiredCapabilities.every(c=>w.capabilities.includes(c)))why.push('capability');
    if(!o.requiredPermissions.every(c=>w.permissions.includes(c)))why.push('permission');
    if(['quarantined','offline','degraded'].includes(w.status)||(!qualification&&w.status!=='available'))why.push('status');
    if((this.activeWorkers.get(w.id)??0)>=w.concurrency)why.push('concurrency');
    if(!qualification&&!o.requiredCapabilities.every(c=>[...w.qualifications].reverse().find(q=>q.capability===c&&q.backendRevision===w.backendRevision)?.state==='QUALIFIED'))why.push('qualification');
    if(!b||b.revision!==w.backendRevision)why.push('backend_revision');
    else if(!assessScope(o.scope,b.requiredAction).allowed)why.push('scope');
    if(!this.containment.schedulingEligibility([{kind:'WORKER',id:w.id},{kind:'ESTATE',id:'estate'},{kind:'JOB',id:o.id},{kind:'WORKSPACE',id:o.scope.workspace}]).eligible)why.push('containment');
    if(this.stopped)why.push('exchange_stopped');
    if(Date.parse(o.deadline)<=Date.now())why.push('deadline');
    return why;
  }
  private bid(w:DigitalWorker,o:WorkOrder):LabourBid{
    const history=this.attempts.filter(a=>a.workerId===w.id&&a.backendRevision===w.backendRevision&&this.orders.get(a.workOrderId)?.order.jobType===o.jobType&&(!o.comparison||a.calibration||this.orders.get(a.workOrderId)?.order.comparison?.strategy===o.comparison.strategy));
    const successes=history.filter(a=>a.outcome==='SUCCEEDED').length,rate=history.length?successes/history.length:null;
    const metered=w.rateCard.metering==='cpu-ms';
    const measured=history.filter(a=>a.execution.resources?.cpuMs!=null);
    const execution=metered&&measured.length?Math.ceil(measured.reduce((s,a)=>s+a.execution.resources!.cpuMs!,0)/measured.length):w.rateCard.executionCharge,verification=metered&&history.length?Math.ceil(history.reduce((s,a)=>s+a.verificationCost,0)/history.length):w.rateCard.verificationCharge;
    // Bounded one-retry expectation; unknown evidence gets a full retry reserve, never invented precision.
    const retry=Math.ceil((1-(rate??0))*(execution+verification));
    return {workerId:w.id,backendRevision:w.backendRevision,...(metered?{maximumExecutionCost:w.rateCard.executionCharge,maximumVerificationCost:w.rateCard.verificationCharge}:{}),executionCost:execution,verificationCost:verification,riskCost:w.rateCard.riskCharge,expectedRetryCost:retry,expectedCompletionCost:execution+verification+retry+w.rateCard.riskCharge,expectedLatencyMs:history.length?history.reduce((s,a)=>s+a.latencyMs,0)/history.length:null,observedSuccessRate:rate,samples:history.length,confidence:history.length<3?'INSUFFICIENT_EVIDENCE':history.length<30?'EMPIRICAL_SMALL_SAMPLE':'EMPIRICAL',resourceRequirement:{backendId:w.backendId,slots:1},availability:'available',expiresAt:new Date(Math.min(Date.now()+30000,Date.parse(o.deadline))).toISOString()};
  }
  tender(o:WorkOrder,excluded:string[]=[],remaining=o.maximumCost){
    const rejected:Array<{workerId:string;reasons:string[]}>=[],bids:LabourBid[]=[];
    for(const w of this.workers.values()){
      const why=this.rejections(w,o);if(excluded.includes(w.id))why.push('already_attempted');
      const bid=this.bid(w,o);
      if((bid.maximumExecutionCost??bid.executionCost)+(bid.maximumVerificationCost??bid.verificationCost)+bid.riskCost>remaining)why.push('remaining_budget');
      if(bid.expectedLatencyMs!==null&&bid.expectedLatencyMs>Date.parse(o.deadline)-Date.now())why.push('expected_deadline_miss');
      if(why.length)rejected.push({workerId:w.id,reasons:why});else bids.push(bid);
    }
    this.emit('tender.opened',{workOrderId:o.id,bids,rejected});return {bids,rejected};
  }
  private admit(o:WorkOrder){
    if(this.orders.has(o.id))throw Error('labour_order_duplicate');
    const org=this.organisations.get(o.organisationId)!;
    const charged=[...this.outcomes.values()].filter(x=>x.organisationId===org.id&&x.state!=='INTERRUPTED').reduce((s,x)=>s+x.totalCost,0);
    const held=[...this.reservations.values()].filter(x=>x.organisationId===org.id).reduce((s,x)=>s+x.amount,0);
    if(charged+held+o.maximumCost>org.maximumCharges)throw Error('labour_organisation_budget');
    const record={order:o,hash:labourHash(o)};this.emit('order.accepted',record);this.orders.set(o.id,record);this.reservations.set(o.id,{organisationId:o.organisationId,amount:o.maximumCost});this.active.add(o.id);
  }
  /** Trusted qualification entry, not a public API: actual backend + same scope/containment + independent verification. */
  async qualify(workerId:string,inputs:WorkOrder[]){
    const w=this.worker(workerId);if(!inputs.length)throw Error('labour_qualification_empty');
    const evidence:string[]=[],passed=new Set<string>(),tested=new Set<string>();let allPassed=true;
    for(const input of inputs){
      const current=this.worker(workerId),o=this.parseOrder(input),denied=this.rejections(current,o,true);if(denied.length)throw Error('labour_qualification_denied:'+denied.join(','));
      if(current.backendId!==w.backendId||current.backendRevision!==w.backendRevision)throw Error('labour_qualification_configuration_changed');
      const bid=this.bid(current,o);if((bid.maximumExecutionCost??bid.executionCost)+(bid.maximumVerificationCost??bid.verificationCost)+bid.riskCost>o.maximumCost)throw Error('labour_qualification_budget');this.admit(o);
      const a=await this.execute(o,current,bid,'Trusted physical qualification; not a competitive award',true);this.settle(o,[a]);
      evidence.push(a.id);o.requiredCapabilities.forEach(c=>tested.add(c));if(a.outcome==='SUCCEEDED')o.requiredCapabilities.forEach(c=>passed.add(c));else allPassed=false;
    }
    const latest=this.worker(w.id);if(latest.backendId!==w.backendId||latest.backendRevision!==w.backendRevision)throw Error('labour_qualification_configuration_changed');
    w.qualifications=[...w.qualifications,...[...tested].map(capability=>({capability,state:allPassed?'QUALIFIED' as const:'FAILED' as const,backendRevision:w.backendRevision,evidence,checkedAt:new Date().toISOString()}))];
    w.status=['quarantined','offline','degraded'].includes(latest.status)?latest.status:allPassed?'available':'degraded';this.emit('worker.qualified',w);this.workers.set(w.id,w);return {passed:allPassed,evidence};
  }
  async submit(input:WorkOrder,policy:'broker'|'cheapest'|{fixed:string}='broker'){
    const o=this.parseOrder(input),prior=this.orders.get(o.id);
    if(prior){if(prior.hash!==labourHash(o))throw Error('labour_order_identity_conflict');const outcome=this.outcomes.get(o.id);if(outcome)return structuredClone(outcome);throw Error('labour_order_in_progress');}
    this.admit(o);const attempts:LabourAttempt[]=[];
    try {
      for(let n=0;n<o.maximumAttempts;n++){
        const spent=attempts.reduce((s,a)=>s+a.totalCost,0),{bids}=this.tender(o,attempts.map(a=>a.workerId),o.maximumCost-spent);
        const eligible=typeof policy==='object'?bids.filter(b=>b.workerId===policy.fixed):bids;
        eligible.sort((a,b)=>(policy==='cheapest'?a.executionCost-b.executionCost:a.expectedCompletionCost-b.expectedCompletionCost)||(a.expectedLatencyMs??Infinity)-(b.expectedLatencyMs??Infinity)||a.workerId.localeCompare(b.workerId));
        const bid=eligible[0];if(!bid)break;
        const w=this.worker(bid.workerId),why=this.rejections(w,o);if(why.length||Date.parse(bid.expiresAt)<=Date.now())throw Error('labour_award_stale');
        const reason=`Policy ${typeof policy==='object'?'fixed-worker':policy}; qualified and authorised; expected completion ${bid.expectedCompletionCost} = execution ${bid.executionCost} + retry ${bid.expectedRetryCost} + verification ${bid.verificationCost} + risk ${bid.riskCost}; ${bid.samples} observed samples; latency ${bid.expectedLatencyMs??'unknown'} ms; ${bids.length} eligible bids`;
        const a=await this.execute(o,w,bid,reason,false);attempts.push(a);if(a.outcome==='SUCCEEDED')break;
        this.emit('work.rebrokered',{workOrderId:o.id,failedAttempt:a.id,retainedCost:attempts.reduce((s,x)=>s+x.totalCost,0)});
      }
      return this.settle(o,attempts);
    }catch(error){this.active.delete(o.id);this.emit('order.interrupted',{workOrderId:o.id,reason:'Execution or persistence boundary failed; reservation retained'});throw error;}
  }
  private async execute(o:WorkOrder,w:DigitalWorker,bid:LabourBid,reason:string,calibration:boolean){
    const id='transaction-'+randomUUID(),start=Date.now(),startedAt=new Date(start).toISOString(),controller=new AbortController(),owned=new OwnedProcessManager();
    this.emit('work.awarded',{workOrderId:o.id,transactionId:id,workerId:w.id,bid,reason,contractHash:labourHash(o),calibration});
    this.activeWorkers.set(w.id,(this.activeWorkers.get(w.id)??0)+1);
    const unregister=this.containment.register({id,scopes:[{kind:'WORKER',id:w.id},{kind:'JOB',id:o.id},{kind:'WORKSPACE',id:o.scope.workspace}],execution:owned,exclusive:true,leaseRevoker:async()=>{this.emit('exchange.stopped',{workOrderId:o.id,workerId:w.id,reason:'Existing containment kill requested'});this.stopped=true;controller.abort(Error('labour_containment_stop'));}});
    const timer=setTimeout(()=>controller.abort(Error('labour_deadline')),Math.max(1,Math.min(o.scope.maximum.runtimeMs,Date.parse(o.deadline)-start)));
    let result:LabourExecutionResult={output:null,succeeded:false,evidence:{failure:'backend_did_not_return'},externalCost:null,tokens:null,energyJoules:null};
    let verification={passed:false,detail:'Execution failed',verifierId:o.verification.id,revision:o.verification.revision,resultHash:labourHash(null)};
    let verificationCost=0;
    try{
      this.emit('work.executing',{workOrderId:o.id,transactionId:id,workerId:w.id});
      result=await this.backends.get(w.backendId)!.execute(structuredClone(o),structuredClone(w),owned,controller.signal);
      if(result.succeeded&&!controller.signal.aborted){
        this.emit('work.verifying',{workOrderId:o.id,transactionId:id});verificationCost=bid.verificationCost;
        const verifierCpu=process.cpuUsage();
        try{verification={...this.verifiers.get(o.verification.id)!.verify(o,result),verifierId:o.verification.id,revision:o.verification.revision,resultHash:labourHash(result.output)};}catch{verification={...verification,detail:'Verifier exception',resultHash:labourHash(result.output)};}
        if(w.rateCard.metering==='cpu-ms'){const used=process.cpuUsage(verifierCpu);verificationCost=Math.min(bid.maximumVerificationCost??bid.verificationCost,Math.ceil((used.user+used.system)/1000));}
      }
    }catch{result={...result,evidence:{failure:controller.signal.aborted?'aborted':'backend_exception'}};}
    finally{
      clearTimeout(timer);const cleanup=await owned.terminateAll('labour-attempt-completed');
      result.evidence={...result.evidence,cleanup};if(cleanup.outcome!=='confirmed'){this.setStatus(w.id,'quarantined');verification.passed=false;verification.detail='Cleanup uncertain';}
      unregister();this.activeWorkers.set(w.id,Math.max(0,(this.activeWorkers.get(w.id)??1)-1));
    }
    const measuredCpu=result.resources?.cpuMs;
    const rawExecutionCost=w.rateCard.metering==='cpu-ms'?(measuredCpu!=null&&Number.isFinite(measuredCpu)&&measuredCpu>=0?Math.min(bid.maximumExecutionCost!,Math.ceil(measuredCpu)):bid.maximumExecutionCost!):bid.executionCost;
    if(w.rateCard.metering==='cpu-ms')result.evidence={...result.evidence,accountingMeasurement:measuredCpu==null?'UNKNOWN_CONSERVATIVE_RESERVATION_CHARGED':measuredCpu>bid.maximumExecutionCost!?'MEASURED_OVER_CAP_INTERNAL_CHARGE_CAPPED':'MEASURED_CPU_MS',monetaryConversion:null};
    const a:LabourAttempt={id,workOrderId:o.id,organisationId:o.organisationId,workerId:w.id,backendId:w.backendId,backendRevision:w.backendRevision,contractHash:labourHash(o),bid,awardReason:reason,startedAt,endedAt:new Date().toISOString(),latencyMs:Date.now()-start,execution:result,verification,rawExecutionCost,verificationCost,escalationCost:0,totalCost:rawExecutionCost+verificationCost,outcome:controller.signal.aborted?'CANCELLED':result.succeeded&&verification.passed?'SUCCEEDED':'FAILED',calibration};
    this.emit('transaction.recorded',a);this.attempts.push(a);return a;
  }
  private settle(o:WorkOrder,attempts:LabourAttempt[]){
    const complete=attempts.at(-1)?.outcome==='SUCCEEDED';
    const outcome:LabourOutcome={workOrderId:o.id,organisationId:o.organisationId,contractHash:labourHash(o),state:complete?'COMPLETED':attempts.length?'FAILED':'BLOCKED',attempts:attempts.map(a=>a.id),totalCost:attempts.reduce((s,a)=>s+a.totalCost,0),retryCost:attempts.slice(0,-1).reduce((s,a)=>s+a.totalCost,0),verificationCost:attempts.reduce((s,a)=>s+a.verificationCost,0),reason:complete?'Independent verifier accepted the outcome':'No remaining qualified, authorised, available worker within deadline/budget'};
    this.emit('outcome.settled',outcome);this.outcomes.set(o.id,outcome);this.reservations.delete(o.id);this.active.delete(o.id);return structuredClone(outcome);
  }
  projection(){const allEvents=this.ledger.events();const counts={bids:allEvents.filter(e=>e.kind==='tender.opened').reduce((n,e)=>n+(e.data as {bids:unknown[]}).bids.length,0),awards:allEvents.filter(e=>e.kind==='work.awarded').length,rebrokered:allEvents.filter(e=>e.kind==='work.rebrokered').length};return structuredClone({admission:this.stopped?'STOPPED':'OPEN',counts,economics:labourEconomics([...this.workers.values()],[...this.orders.values()].map(x=>x.order),this.attempts,[...this.outcomes.values()],allEvents),schema:'agent-control.labour-exchange/v1',accounting:'INTERNAL_TRANSACTION_CHARGES',unit:'XCU: CPU milliseconds; other currencies: millionths of currency unit',savings:'NOT YET DEMONSTRATED',organisations:[...this.organisations.values()],workers:[...this.workers.values()].map(w=>{const h=this.attempts.filter(a=>a.workerId===w.id);return {...w,status:(this.activeWorkers.get(w.id)??0)>0?'busy':w.status,active:this.activeWorkers.get(w.id)??0,transactions:h.length,successRate:h.length?h.filter(a=>a.outcome==='SUCCEEDED').length/h.length:null,internalCharges:h.reduce((s,a)=>s+a.totalCost,0),meanLatencyMs:h.length?h.reduce((s,a)=>s+a.latencyMs,0)/h.length:null};}),openWork:[...this.active],outcomes:[...this.outcomes.values()],attempts:this.attempts,events:this.ledger.events().slice(-150),reservations:[...this.reservations.entries()].map(([workOrderId,value])=>({workOrderId,...value}))});}
}

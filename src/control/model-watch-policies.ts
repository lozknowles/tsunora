import {z} from 'zod';
import {IntelligenceJournal,intelligenceHash,modelWatchSchema,type ModelWatch} from './model-landscape.js';

export interface GovernedRule {id:string;version:number;trigger:string;resourceId:string;checkId:string;condition:{field:string;operator:'EQ'|'GT'|'LT';value:string|number|boolean};action:{id:string;parameters:Record<string,unknown>};verifyId:string;maxAttempts:number;expiresAt:string;}
const ruleSchema=z.object({id:z.string().min(1).max(256),version:z.number().int().positive(),trigger:z.string().min(1).max(256),resourceId:z.string().min(1).max(256),checkId:z.string().min(1).max(256),condition:z.object({field:z.string().min(1).max(256),operator:z.enum(['EQ','GT','LT']),value:z.union([z.string().max(4096),z.number().finite(),z.boolean()])}).strict(),action:z.object({id:z.string().min(1).max(256),parameters:z.record(z.string(),z.unknown())}).strict(),verifyId:z.string().min(1).max(256),maxAttempts:z.number().int().min(1).max(3),expiresAt:z.string().datetime()}).strict();
export interface RulePort {check(resourceId:string,signal:AbortSignal):Promise<Record<string,string|number|boolean>>;execute(resourceId:string,parameters:Record<string,unknown>,signal:AbortSignal):Promise<{evidence:string}>;verify(resourceId:string,signal:AbortSignal):Promise<boolean>;}
export class GovernedRules {
  readonly ports=new Map<string,RulePort>();
  constructor(readonly journal:IntelligenceJournal){}
  register(actionId:string,port:RulePort){if(this.ports.has(actionId))throw Error('rule_action_duplicate');this.ports.set(actionId,port);return this;}
  propose(rule:GovernedRule){rule=ruleSchema.parse(rule);if(!rule.id||!Number.isInteger(rule.version)||rule.version<1||!Number.isInteger(rule.maxAttempts)||rule.maxAttempts<1||rule.maxAttempts>3||!['EQ','GT','LT'].includes(rule.condition.operator)||!Number.isFinite(Date.parse(rule.expiresAt))||!this.ports.has(rule.action.id))throw Error('rule_definition_invalid_or_connector_required');return this.journal.append('rule-proposed',{rule,digest:intelligenceHash(rule)});}
  approve(digest:string,actor:string){const row=this.journal.records('rule-proposed').find(r=>r.value.digest===digest);if(!row||Date.parse(row.value.rule.expiresAt)<=Date.now()||!actor.trim())throw Error('rule_approval_invalid');return this.journal.append('rule-approved',{digest,actor});}
  async event(digest:string,event:{id:string;type:string;resourceId:string;trusted:boolean},signal:AbortSignal){
    const proposal=this.journal.records('rule-proposed').find(r=>r.value.digest===digest),rule=proposal?.value.rule as GovernedRule|undefined;
    if(!rule||!event.trusted||event.type!==rule.trigger||event.resourceId!==rule.resourceId||Date.parse(rule.expiresAt)<=Date.now()||!this.journal.records('rule-approved').some(r=>r.value.digest===digest))throw Error('rule_event_not_authorized');
    const key=intelligenceHash({digest,eventId:event.id});if(this.journal.records('rule-started').some(r=>r.value.key===key))return {state:'REVIEW_REQUIRED',reason:'Event already consumed; interrupted effects need reconciliation'};
    this.journal.append('rule-started',{key,digest,eventId:event.id});const port=this.ports.get(rule.action.id)!;
    for(let attempt=1;attempt<=rule.maxAttempts;attempt++){
      if(signal.aborted||Date.parse(rule.expiresAt)<=Date.now())return this.finish(key,'ESCALATE','Cancelled or expired');
      try{const observation=await port.check(rule.resourceId,signal),actual=observation[rule.condition.field],c=rule.condition;const match=c.operator==='EQ'?actual===c.value:typeof actual==='number'&&typeof c.value==='number'&&(c.operator==='GT'?actual>c.value:actual<c.value);
        if(!match)return this.finish(key,'SUCCESS','Desired condition already satisfied or trigger condition false');
        if(signal.aborted||Date.parse(rule.expiresAt)<=Date.now())return this.finish(key,'ESCALATE','Cancelled or expired after observation');const result=await port.execute(rule.resourceId,structuredClone(rule.action.parameters),signal);this.journal.append('rule-action',{key,attempt,evidence:result.evidence});
        if(await port.verify(rule.resourceId,signal))return this.finish(key,'SUCCESS','Independent verification passed');
        // Unknown effects are never retried automatically, even when retry budget remains.
        return this.finish(key,'ESCALATE','Verification failed; inspect effect before retry');
      }catch{return this.finish(key,'ESCALATE','Action or observation failed; effect reconciliation required');}
    }return this.finish(key,'ESCALATE','Retry budget exhausted');
  }
  private finish(key:string,state:string,reason:string){this.journal.append('rule-finished',{key,state,reason});return {state,reason};}
}
export interface BenchmarkReservation {watchDigest:string;runKey:string;specSha256:string;candidateHashes:string[];targetIds:string[];downloadBytes:number;apiSpendCeiling:number;currency:string;durationMs:number;runtimeInstallation:boolean;expiresAt:string;}
export class ModelWatchPolicies {
  constructor(readonly journal:IntelligenceJournal){}
  propose(input:unknown){const watch=modelWatchSchema.parse(input);if(Date.parse(watch.expiresAt)<=Date.now())throw Error('watch_already_expired');const digest=intelligenceHash(watch);this.journal.append('watch-proposed',{watch,digest});return {state:'PROPOSED',watch,digest,authorityGranted:false};}
  approve(digest:string,actor:string){const proposal=this.journal.records('watch-proposed').find(r=>r.value.digest===digest);if(!proposal||!actor.trim()||Date.parse(proposal.value.watch.expiresAt)<=Date.now())throw Error('watch_approval_invalid');const id=proposal.value.watch.id;for(const previous of this.journal.records('watch-proposed').filter(r=>r.value.watch.id===id&&r.value.digest!==digest))if(this.journal.records('watch-approved').some(a=>a.value.digest===previous.value.digest))this.journal.append('watch-revoked',{digest:previous.value.digest,actor,reason:'Superseded by newly approved policy'});this.journal.append('watch-approved',{digest,actor});return {digest,state:'APPROVED'};}
  revoke(digest:string,actor:string){this.journal.append('watch-revoked',{digest,actor});}
  definition(digest:string):ModelWatch {const row=this.journal.records('watch-proposed').find(r=>r.value.digest===digest);if(!row)throw Error('watch_definition_missing');return modelWatchSchema.parse(row.value.watch);}
  approved(digest:string,now=new Date()):ModelWatch {
    const proposal=this.journal.records('watch-proposed').find(r=>r.value.digest===digest),approved=this.journal.records('watch-approved').some(r=>r.value.digest===digest),revoked=this.journal.records('watch-revoked').some(r=>r.value.digest===digest);
    if(!proposal||!approved||revoked||Date.parse(proposal.value.watch.expiresAt)<=+now)throw Error('watch_current_approval_required');return modelWatchSchema.parse(proposal.value.watch);
  }
  due(digest:string,now=new Date(),eventId?:string){const w=this.approved(digest,now),s=w.schedule;let slot:string;if(s.kind==='MANUAL')return null;else if(s.kind==='EVENT'){if(!eventId)return null;slot=`event:${eventId}`;}else{if(now.getUTCHours()<s.utcHour||s.kind==='WEEKLY'&&now.getUTCDay()!==s.utcWeekday)return null;slot=now.toISOString().slice(0,10);}
    const runKey=intelligenceHash({digest,slot});if(this.journal.records('watch-run-started').some(r=>r.value.runKey===runKey))return null;return {runKey,watch:w};}
  start(digest:string,runKey:string){this.approved(digest);if(this.journal.records('watch-run-started').some(r=>r.value.runKey===runKey))throw Error('watch_run_already_consumed');this.journal.append('watch-run-started',{watchDigest:digest,runKey});}
  reserve(request:BenchmarkReservation,now=new Date()){
    const w=this.approved(request.watchDigest,now),p=w.policy;
    if(!p.automaticBenchmark)throw Error('benchmark_specific_approval_required');
    if(request.specSha256!==w.benchmarkSha256||!request.runKey||!Number.isFinite(Date.parse(request.expiresAt))||Date.parse(request.expiresAt)>+now+p.maxDurationMs||!/^[a-f0-9]{64}$/.test(request.specSha256)||!request.candidateHashes.length||request.candidateHashes.some(h=>!/^[a-f0-9]{64}$/.test(h))||!request.targetIds.length||request.targetIds.some(id=>!p.machines.includes(id))||request.currency!==p.currency||![request.downloadBytes,request.apiSpendCeiling,request.durationMs].every(n=>Number.isFinite(n)&&n>=0)||Date.parse(request.expiresAt)<=+now||Date.parse(request.expiresAt)>Date.parse(w.expiresAt))throw Error('benchmark_reservation_invalid');
    if(request.runtimeInstallation&&!p.allowRuntimeInstall||request.downloadBytes>p.maxDownloadBytesPerRun||request.apiSpendCeiling>p.maxApiSpendPerRun||request.durationMs>p.maxDurationMs)throw Error('benchmark_run_policy_exceeded');
    const rows=this.journal.records('benchmark-reserved');if(rows.some(r=>r.value.runKey===request.runKey))throw Error('benchmark_reservation_already_consumed');
    const sameDay=rows.filter(r=>this.journal.records('watch-proposed').some(p=>p.value.digest===r.value.watchDigest&&p.value.watch.id===w.id)&&r.at.slice(0,10)===now.toISOString().slice(0,10));
    // Reservations are charged durably before dispatch. Failure, restart and cancellation never refund uncertain spend.
    if(sameDay.reduce((n,r)=>n+r.value.downloadBytes,0)+request.downloadBytes>p.maxDownloadBytesPerDay||sameDay.reduce((n,r)=>n+r.value.apiSpendCeiling,0)+request.apiSpendCeiling>p.maxApiSpendPerDay)throw Error('benchmark_daily_policy_exceeded');
    return this.journal.append('benchmark-reserved',request,now).sha256;
  }
  reconcile(reservationSha256:string,outcome:{state:'COMPLETE'|'FAILED'|'INTERRUPTED';parcelId:string;resultHashes:string[]}){if(!this.journal.records('benchmark-reserved').some(r=>r.sha256===reservationSha256))throw Error('reservation_missing');this.journal.append('benchmark-reconciled',{reservationSha256,...outcome});}
  interrupted(){return this.journal.records('benchmark-reserved').filter(r=>!this.journal.records('benchmark-reconciled').some(done=>done.value.reservationSha256===r.sha256)).map(r=>({...r.value,state:'RECONCILIATION_REQUIRED'}));}
}
export const watchRequest=(objective:string,defaults:ModelWatch)=>{
  const watch=structuredClone(defaults);watch.name=objective.slice(0,100);watch.policy.automaticBenchmark=false;
  if(/local/i.test(objective))watch.filters.mode='LOCAL';if(/coding|python/i.test(objective))watch.filters.capability='coding';
  if(/overnight|morning|daily/i.test(objective))watch.schedule.kind='DAILY';
  return {watch:modelWatchSchema.parse(watch),confirmation:['Workload and success validator','Source list and provenance','Resource and download/API limits','UTC schedule and permissions','Notification destinations'],note:'A proposal only. Natural language never enables automatic downloads or grants policy authority.'};
};

import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export interface EnvironmentCheck {id:string;mandatory:boolean;expected:string;observed:unknown;status:'PASS'|'FAIL'|'UNKNOWN';reason:string;timestamp:string;}
export function environmentResult(checks:EnvironmentCheck[]):EnvironmentCheck['status'] {const required=checks.filter(c=>c.mandatory);return !required.length?'UNKNOWN':required.some(c=>c.status==='FAIL')?'FAIL':required.some(c=>c.status!=='PASS')?'UNKNOWN':'PASS';}
export interface ResetObservation {bootId:string;physicalIdentity:string;environmentVerified:boolean;components?:EnvironmentCheck[];service:{identity:boolean;healthy:boolean;expected:boolean;restored?:boolean};}
export interface ResetPort {diagnose?():Promise<{components:EnvironmentCheck[]}>;observe():Promise<ResetObservation>;reboot():Promise<void>;restore(bootId:string):Promise<ResetObservation>;}
export interface ResetAuthority {actor:string;reason:string;requestKey:string;expiresAt:string;approveReset:boolean;runId?:string;}
export interface ContinuationAuthority {actor:string;reason:string;requestKey:string;expiresAt:string;target:string;parentOperationId:string;approvePreparation:boolean;allowedAction:'RESET_RECOVERY';runId?:string;}
export type DisruptionPhase='NOT_REQUESTED'|'REQUESTED'|'ACKNOWLEDGED';
export interface ResetReceipt {id:string;target:string;environment:string;configHash:string;authority:ResetAuthority;startedAt:string;endedAt?:string;status:'PREPARED'|'PENDING'|'COMPLETE'|'FAILED';generation:number;pre?:ResetObservation;post?:ResetObservation;disappeared?:boolean;error?:string;disruption?:DisruptionPhase;parentOperationId?:string;parentPhysicalIdentity?:string;chainId?:string;preparationAuthority?:ContinuationAuthority;parentEvidence?:{requestKey:string;receiptSha256:string;journalSha256:string;classification:string};}
export class TargetReset {
 private busy=false;
 async diagnose(actor:string){
  if(!actor?.trim())throw Error('target_diagnostic_authority_required');
  if(this.busy)throw Error('target_reset_in_progress');
  if(!this.port.diagnose)throw Error('target_diagnostic_unsupported');
  this.busy=true;
  try{const result=await this.port.diagnose();const receipt={schema:'agent-control.target-environment/v1',id:'target-environment-'+randomUUID(),target:this.target,environment:this.environment,configHash:this.configHash,actor,observedAt:new Date(this.now()).toISOString(),status:environmentResult(result.components),components:result.components,targetMutations:0,modelCalls:0,benchmarkFixtures:0};fs.writeFileSync(path.join(this.directory,receipt.id+'.json'),JSON.stringify(receipt,null,2),{mode:0o600,flag:'wx',flush:true});return receipt;}finally{this.busy=false;}
 }
 constructor(readonly directory:string,readonly target:string,readonly environment:string,readonly configHash:string,readonly port:ResetPort,readonly options:{now?:()=>number;pause?:(ms:number)=>Promise<void>;timeoutMs?:number}={}){fs.mkdirSync(directory,{recursive:true,mode:0o700});}
 private abandonedFile(){return path.join(this.directory,this.key()+'.abandoned.json');}
 abandoned():string[]{return fs.existsSync(this.abandonedFile())?JSON.parse(fs.readFileSync(this.abandonedFile(),'utf8')):[];}
 assertAttempt(id:unknown){if(typeof id==='string'&&this.abandoned().includes(id))throw Error('target_attempt_permanently_fenced');}
 abandon(ids:string[]){const s=this.state();if(!s||s.status!=='COMPLETE')throw Error('target_boundary_not_complete');const all=[...new Set([...this.abandoned(),...ids])];const f=this.abandonedFile();fs.writeFileSync(f+'.tmp',JSON.stringify(all),{mode:0o600,flush:true});fs.renameSync(f+'.tmp',f);this.event(s,'LEGACY_ATTEMPTS_FENCED',{attemptIds:ids,historicalTermination:'UNPROVEN'});}
 private now(){return this.options.now?.()??Date.now();}
 private key(){return createHash('sha256').update(this.target).digest('hex');}
 private stateFile(){return path.join(this.directory,this.key()+'.json');}
 private continuationFile(){return path.join(this.directory,this.key()+'.continuation.json');}
 private requestFile(key:string){return path.join(this.directory,this.key()+'-'+createHash('sha256').update(key).digest('hex')+'.receipt.json');}
 private read(file:string):ResetReceipt|undefined{return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):undefined;}
 state():ResetReceipt|undefined{return this.read(this.continuationFile())??this.read(this.stateFile());}
 private save(v:ResetReceipt){const f=v.parentOperationId||fs.existsSync(this.continuationFile())?this.continuationFile():this.stateFile();fs.writeFileSync(f+'.tmp',JSON.stringify(v),{mode:0o600,flush:true});fs.renameSync(f+'.tmp',f);const request=this.requestFile(v.authority.requestKey);fs.writeFileSync(request+'.tmp',JSON.stringify(v),{mode:0o600,flush:true});fs.renameSync(request+'.tmp',request);}
 private async exclusive<T>(action:()=>Promise<T>):Promise<T>{
  if(this.busy)throw Error('target_reset_in_progress');const file=path.join(this.directory,this.key()+'.operation-lock');let fd:number;
  try{fd=fs.openSync(file,'wx',0o600);}catch{throw Error('target_reset_in_progress');}
  this.busy=true;try{return await action();}finally{fs.closeSync(fd);fs.unlinkSync(file);this.busy=false;}
 }
 private fresh(a:{actor:string;reason:string;requestKey:string;expiresAt:string}){if(!a.actor?.trim()||!a.reason?.trim()||a.reason.length>500||!/^[a-zA-Z0-9._-]{1,100}$/.test(a.requestKey)||!Number.isFinite(Date.parse(a.expiresAt))||Date.parse(a.expiresAt)<=this.now()||Date.parse(a.expiresAt)-this.now()>3600000)throw Error('target_reset_authority_required');}
 /** Positive phase proof; absence of an acknowledgement by itself is never proof. */
 continuationEligibility(parentOperationId:string){
  const old=this.state();if(!old||old.id!==parentOperationId||old.status!=='FAILED'||old.target!==this.target||old.environment!==this.environment||old.configHash!==this.configHash)throw Error('target_continuation_parent_invalid');
  if(!Number.isFinite(Date.parse(old.authority.expiresAt))||Date.parse(old.authority.expiresAt)>this.now())throw Error('target_continuation_previous_authority_live');
  if(!old.pre?.physicalIdentity)throw Error('target_continuation_identity_unknown');
  const bytes=fs.readFileSync(this.requestFile(old.authority.requestKey));if(JSON.stringify(JSON.parse(bytes.toString()))!==JSON.stringify(old))throw Error('target_continuation_receipt_mismatch');
  const journal=fs.readFileSync(path.join(this.directory,old.id+'.jsonl'));let events:any[];try{events=journal.toString().trim().split('\n').map(line=>JSON.parse(line));}catch{throw Error('target_continuation_dispatch_unknown');}
  if(!events.length||events.some(e=>e.operationId!==old.id||e.target!==old.target||e.environment!==old.environment)||events.at(-1)?.type!=='RECOVERY_FAILED'||events.at(-1)?.data?.error!==old.error)throw Error('target_continuation_dispatch_unknown');
  if(old.disruption&&old.disruption!=='NOT_REQUESTED'||events.some(e=>['DISRUPTION_REQUESTED','RESET_ACKNOWLEDGED','TARGET_UNAVAILABLE','BOOT_BOUNDARY_VERIFIED','RECOVERY_COMPLETE'].includes(e.type)))throw Error('target_continuation_post_disruption');
  const initial=events[0],initialType=old.parentOperationId?'CONTINUATION_PREPARED':'RESET_AUTHORISED';
  if(initial.type!==initialType||(!old.parentOperationId&&(initial.data?.configHash!==old.configHash||JSON.stringify(initial.data?.authority)!==JSON.stringify(old.authority))))throw Error('target_continuation_dispatch_unknown');
  let classification='PERSISTED_PRE_DISRUPTION';
  if(old.disruption==='NOT_REQUESTED'){
   if(events.at(-1)?.data?.disruption!=='NOT_REQUESTED')throw Error('target_continuation_dispatch_unknown');
  }else{
   // Legacy valid(pre) rejection: the retained invalid pre observation, matching terminal
   // error and exact pre-dispatch event sequence prove this guard was never passed.
   const invalid=!/^[a-f0-9-]{36}$/i.test(old.pre.bootId)||!old.pre.physicalIdentity||!old.pre.environmentVerified;
   if(old.disruption!==undefined||events.length!==2||!invalid||old.error!=='target_identity_or_environment_unverified'||old.post||old.disappeared)throw Error('target_continuation_dispatch_unknown');
   classification='LEGACY_RECORDED_PRE_VALIDATION_REJECTION';
  }
  return {parent:old,evidence:{requestKey:old.authority.requestKey,receiptSha256:createHash('sha256').update(bytes).digest('hex'),journalSha256:createHash('sha256').update(journal).digest('hex'),classification}};
 }
 async prepareContinuation(a:ContinuationAuthority):Promise<ResetReceipt&{replayed?:boolean}>{return this.exclusive(async()=>{
  this.fresh(a);if(a.target!==this.target||a.approvePreparation!==true||a.allowedAction!=='RESET_RECOVERY')throw Error('target_continuation_authority_binding_invalid');
  const prior=this.read(this.requestFile(a.requestKey));if(prior){if(JSON.stringify(prior.preparationAuthority)!==JSON.stringify(a))throw Error('target_continuation_request_binding_mismatch');return {...prior,replayed:true};}
  const {parent,evidence}=this.continuationEligibility(a.parentOperationId);if(parent.authority.runId!==a.runId||parent.authority.requestKey===a.requestKey)throw Error('target_continuation_authority_binding_invalid');
  const v:ResetReceipt={id:'target-reset-'+randomUUID(),target:this.target,environment:this.environment,configHash:this.configHash,authority:{actor:a.actor,reason:a.reason,requestKey:a.requestKey,expiresAt:a.expiresAt,approveReset:false,runId:a.runId},preparationAuthority:structuredClone(a),parentOperationId:parent.id,parentPhysicalIdentity:parent.pre!.physicalIdentity,chainId:parent.chainId??parent.id,parentEvidence:evidence,startedAt:new Date(this.now()).toISOString(),status:'PREPARED',disruption:'NOT_REQUESTED',generation:parent.generation+1};
  this.event(v,'CONTINUATION_PREPARED',{parentOperationId:parent.id,authority:a,parentEvidence:evidence,freshVerificationRequired:true,quarantine:'RETAINED'});this.save(v);return v;
 });}
 async executeContinuation(id:string,a:ResetAuthority&{target:string}){return this.exclusive(async()=>{
  this.fresh(a);const v=this.state();if(!a.approveReset||a.target!==this.target||!v||v.id!==id||v.status!=='PREPARED'||!v.parentOperationId||a.actor!==v.preparationAuthority?.actor||a.runId!==v.authority.runId||a.requestKey===v.authority.requestKey||this.read(this.requestFile(a.requestKey)))throw Error('target_continuation_execution_authority_invalid');
  const proof=v.parentEvidence;if(!proof||createHash('sha256').update(fs.readFileSync(this.requestFile(proof.requestKey))).digest('hex')!==proof.receiptSha256||createHash('sha256').update(fs.readFileSync(path.join(this.directory,v.parentOperationId+'.jsonl'))).digest('hex')!==proof.journalSha256)throw Error('target_continuation_parent_evidence_changed');
  // Preparation authority is never dispatch authority. Preserve its immutable request receipt.
  v.authority={...a};v.status='PENDING';this.save(v);this.event(v,'CONTINUATION_EXECUTION_AUTHORISED',{authority:a});return this.perform(v);
 });}
 private event(v:ResetReceipt,type:string,data:unknown={}){fs.appendFileSync(path.join(this.directory,v.id+'.jsonl'),JSON.stringify({at:new Date(this.now()).toISOString(),operationId:v.id,target:this.target,environment:this.environment,type,data})+'\n',{mode:0o600,flush:true});}
 assertGeneration(generation:number){const s=this.state();if(s&&(s.status!=='COMPLETE'||s.generation!==generation))throw Error('target_generation_fenced');}
 generation(){const s=this.state();if(s&&s.status!=='COMPLETE')throw Error('target_recovery_quarantined');return s?.generation??0;}
 private valid(o:ResetObservation){if(!/^[a-f0-9-]{36}$/i.test(o.bootId)||!o.physicalIdentity||!o.environmentVerified||o.components&&environmentResult(o.components)!=='PASS')throw Error('target_identity_or_environment_unverified');}
 async reset(a:ResetAuthority):Promise<ResetReceipt&{replayed?:boolean}>{return this.exclusive(async()=>{
  if(!a.approveReset||!a.actor?.trim()||!a.reason?.trim()||a.reason.length>500||!/^[a-zA-Z0-9._-]{1,100}$/.test(a.requestKey)||!Number.isFinite(Date.parse(a.expiresAt))||Date.parse(a.expiresAt)<=this.now()||Date.parse(a.expiresAt)-this.now()>3600000)throw Error('target_reset_authority_required');
  const old=this.state();const priorFile=path.join(this.directory,this.key()+'-'+createHash('sha256').update(a.requestKey).digest('hex')+'.receipt.json');const prior:ResetReceipt|undefined=fs.existsSync(priorFile)?JSON.parse(fs.readFileSync(priorFile,'utf8')):undefined;
  if(prior){if(prior.authority.actor!==a.actor||prior.configHash!==this.configHash||prior.authority.runId!==a.runId)throw Error('target_reset_receipt_binding_mismatch');return {...prior,replayed:true};}
  if(old?.authority.requestKey===a.requestKey){if(old.authority.actor!==a.actor||old.configHash!==this.configHash||old.authority.runId!==a.runId)throw Error('target_reset_receipt_binding_mismatch');return {...old,replayed:true};}
  if(old&&old.status!=='COMPLETE')throw Error('target_recovery_quarantined');
  const v:ResetReceipt={id:'target-reset-'+randomUUID(),target:this.target,environment:this.environment,configHash:this.configHash,authority:a,startedAt:new Date(this.now()).toISOString(),status:'PENDING',disruption:'NOT_REQUESTED',generation:(old?.generation??0)+1};
  this.save(v);this.event(v,'RESET_AUTHORISED',{authority:a,configHash:this.configHash});return this.perform(v);
 });}
 private async perform(v:ResetReceipt):Promise<ResetReceipt>{
  const a=v.authority;
  try{
   v.pre=await this.port.observe();this.valid(v.pre);if(v.parentPhysicalIdentity&&v.pre.physicalIdentity!==v.parentPhysicalIdentity)throw Error('target_continuation_identity_mismatch');if(!v.pre.service.identity||!v.pre.service.healthy||!v.pre.service.expected)throw Error('protected_service_precondition_failed');this.event(v,'PRE_RESET',v.pre);this.save(v);
   if(Date.parse(a.expiresAt)<=this.now())throw Error('target_reset_authority_expired');
   v.disruption='REQUESTED';this.save(v);this.event(v,'DISRUPTION_REQUESTED');
   await this.port.reboot();v.disruption='ACKNOWLEDGED';this.save(v);this.event(v,'RESET_ACKNOWLEDGED');
   const until=this.now()+Math.min(600000,Math.max(1000,this.options.timeoutMs??240000));let observed:ResetObservation|undefined;
   while(this.now()<until){
    try{observed=await this.port.observe();this.valid(observed);if(observed.physicalIdentity!==v.pre.physicalIdentity)throw Error('returned_target_identity_mismatch');if(v.disappeared&&observed.bootId!==v.pre.bootId)break;}
    catch(e){if(e instanceof Error&&/identity|environment/.test(e.message))throw e;v.disappeared=true;this.event(v,'TARGET_UNAVAILABLE');}
    await (this.options.pause?.(2000)??new Promise(resolve=>setTimeout(resolve,2000)));
   }
   if(!v.disappeared)throw Error('target_disappearance_unconfirmed');
   if(!observed||observed.bootId===v.pre.bootId)throw Error('changed_boot_identity_unconfirmed');
   this.event(v,'BOOT_BOUNDARY_VERIFIED',observed);
   v.post=await this.port.restore(observed.bootId);this.valid(v.post);
   if(v.post.bootId!==observed.bootId||v.post.physicalIdentity!==v.pre.physicalIdentity)throw Error('post_restoration_identity_mismatch');
   if(!v.post.service.identity||!v.post.service.healthy||!v.post.service.expected)throw Error('protected_service_verification_failed');
   v.status='COMPLETE';this.event(v,'RECOVERY_COMPLETE',v.post);
  }catch(e){v.status='FAILED';v.error=e instanceof Error&&/^[a-z_]+$/.test(e.message)?e.message:'target_recovery_operation_failed';this.event(v,'RECOVERY_FAILED',{error:v.error,disruption:v.disruption});}
  finally{v.endedAt=new Date(this.now()).toISOString();this.save(v);}
  return v;
 }
}

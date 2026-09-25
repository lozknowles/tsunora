import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type SkillLifecycleState = 'OBSERVE'|'IDENTIFY'|'DATASET'|'BASELINE'|'TRAIN'|'QUALIFY'|'REGISTER'|'ROUTE'|'MONITOR'|'RETRAIN'|'RETIRED'|'REJECTED'|'BLOCKED';
export type SkillQualificationState = 'EXPERIMENTAL'|'QUALIFIED'|'BLOCKED'|'REJECTED'|'RETIRED';
export type MeasurementAuthority = 'AUTHORITATIVE'|'MEASURED'|'ESTIMATED'|'UNAVAILABLE';

export interface LearnedSkillPolicyConfig {
  enabled?: boolean;
  routingEnabled?: boolean;
  minimumImprovement?: number;
  maximumQualificationAgeDays?: number;
  requireHumanDatasetApproval?: boolean;
}
export interface LearnedSkillPolicy {
  enabled: boolean;
  routingEnabled: boolean;
  minimumImprovement: number;
  maximumQualificationAgeDays: number;
  requireHumanDatasetApproval: boolean;
}

export interface SkillMetric {name:string; value:number|null; unit:string; authority:MeasurementAuthority; direction:'HIGHER_IS_BETTER'|'LOWER_IS_BETTER';}
export interface SkillDatasetManifest {
  schema:'agent-control.skill-dataset/v1'; id:string; version:string; taskClass:string;
  trainingExampleIds:string[]; evaluationExampleIds:string[]; trainingSha256:string; evaluationSha256:string;
  schemaSha256:string; provenance:Array<{sourceId:string; sourceSha256:string; authority:string}>;
  duplicateCount:number; malformedCount:number; disagreementCount:number; contaminationCount:number;
  humanReview:{state:'PENDING'|'APPROVED'|'REJECTED'; actor?:string; at?:string; reason?:string};
  createdAt:string;
}
export interface SkillTrainingIdentity {
  method:string; framework:string; frameworkVersion:string; runtimeId:string; runtimeVersion:string;
  precision:string; quantization:string|null; rank:number|null; gradientAccumulationSteps:number;
  gradientCheckpointing:boolean; seed:number; configurationSha256:string; environmentSha256:string;
}
export interface SkillAdapterRecord {
  schema:'agent-control.skill-adapter/v1'; id:string; version:string; label:string; taskClass:string; capabilities:string[];
  base:{modelId:string; modelVersion:string; modelSha256:string};
  adapter:{format:string; artefactSha256:string; sizeBytes:number; storageRef:string};
  dataset:{id:string; version:string; trainingSha256:string; evaluationSha256:string};
  training:SkillTrainingIdentity;
  qualification:{state:SkillQualificationState; qualifiedAt:string|null; evaluatorId:string; evidence:string[]; baseline:SkillMetric[]; specialist:SkillMetric[]; improvement:number|null; protectedRegressions:string[]; reason:string};
  compatibility:{runtimeIds:string[]; minimumRuntimeVersions:Record<string,string>; baseModelSha256:string};
  lifecycle:{state:SkillLifecycleState; registeredAt:string|null; lastUsedAt:string|null; retiredAt:string|null; reason:string};
  rollback:{previousAdapterId:string|null; previousVersion:string|null};
  limitations:string[];
}
export interface SkillCandidateRecord {
  schema:'agent-control.skill-candidate/v1'; id:string; label:string; taskClass:string; capabilities:string[];
  state:SkillLifecycleState; discoveredFrom:string[]; observedAt:string; updatedAt:string;
  proposal:{reason:string; expectedBenefit:string; requestedBy:string};
  dataset?:SkillDatasetManifest; baseline?:{metrics:SkillMetric[]; at:string; evidence:string[]};
  training?:{identity:SkillTrainingIdentity; startedAt:string; completedAt:string|null; checkpointRef:string|null; checkpointSha256:string|null; resultRef:string|null; resultSha256:string|null; failure:string|null};
  adapterId?:string; events:Array<{at:string; from:SkillLifecycleState|null; to:SkillLifecycleState; actor:string; reason:string; evidence:string[]}>;
}
interface SkillSnapshot {schema:'agent-control.skill-learning/v1'; candidates:SkillCandidateRecord[]; adapters:SkillAdapterRecord[]; routing:SkillRoutingDecision[];}

export interface SkillRouteRequest {parcelId:string; stageId:string; taskClass:string; requiredCapabilities:string[]; baseModelId:string; baseModelVersion:string; baseModelSha256:string; runtimeId:string; runtimeVersion:string; now?:string;}
export interface SkillRoutingDecision {schema:'agent-control.skill-routing-decision/v1'; id:string; parcelId:string; stageId:string; at:string; taskClass:string; baseModelId:string; candidates:Array<{adapterId:string;version:string;eligible:boolean;reasons:string[];qualificationState:SkillQualificationState;improvement:number|null;lastUsedAt:string|null}>; selected:{adapterId:string;version:string;artefactSha256:string}|null; reason:string;}
export interface SpecialistInvocation {parcelId:string;stageId:string;baseModelId:string;baseModelVersion:string;baseModelSha256:string;runtimeId:string;runtimeVersion:string;adapterId:string;adapterVersion:string;adapterSha256:string;adapterStorageRef:string;input:unknown;}
export interface SpecialistExecutionResult {actual:{baseModelId:string;baseModelSha256:string;runtimeId:string;adapterId:string;adapterVersion:string;adapterSha256:string};output:unknown;usage?:{inputTokens:number|null;outputTokens:number|null;totalTokens:number|null};elapsedMs:number;}
export interface SpecialistExecutionPort {execute(input:SpecialistInvocation):Promise<SpecialistExecutionResult>;}
export interface SkillTrainingInvocation {candidateId:string;base:{modelId:string;modelVersion:string;modelSha256:string;storageRef:string};dataset:{trainingSha256:string;evaluationSha256:string;trainingStorageRef:string;evaluationStorageRef:string};identity:SkillTrainingIdentity;outputStorageRef:string;resourceLimits:{device:'cpu'|'gpu';maximumSeconds:number;maximumMemoryBytes:number|null};}
export interface SkillTrainingResult {status:'COMPLETE';adapter:{format:string;artefactSha256:string;sizeBytes:number;storageRef:string};configurationSha256:string;environmentSha256:string;elapsedSeconds:number;checkpoint?:{storageRef:string;sha256:string};}
export interface SkillTrainingPort {train(input:SkillTrainingInvocation):Promise<SkillTrainingResult>;}

const DEFAULT_POLICY:LearnedSkillPolicy=Object.freeze({enabled:true,routingEnabled:false,minimumImprovement:.1,maximumQualificationAgeDays:90,requireHumanDatasetApproval:true});
const stable=(value:unknown):string=>JSON.stringify(sort(value));
const sort=(value:unknown):unknown=>Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,sort(v)])):value;
export const skillSha256=(value:unknown)=>createHash('sha256').update(typeof value==='string'?value:stable(value)).digest('hex');
const validHash=(value:string)=>/^[a-f0-9]{64}$/.test(value);
const unique=(values:string[])=>[...new Set(values)].sort();

export class FileSkillLearningStore {
  private value:SkillSnapshot={schema:'agent-control.skill-learning/v1',candidates:[],adapters:[],routing:[]};
  constructor(readonly file?:string){if(!file||!fs.existsSync(file))return;const parsed=JSON.parse(fs.readFileSync(file,'utf8')) as SkillSnapshot;if(parsed.schema!=='agent-control.skill-learning/v1'||!Array.isArray(parsed.candidates)||!Array.isArray(parsed.adapters)||!Array.isArray(parsed.routing))throw new Error('skill_learning_state_invalid');this.value=structuredClone(parsed);}
  load(){return structuredClone(this.value);}
  save(value:SkillSnapshot){this.value=structuredClone(value);if(!this.file)return;fs.mkdirSync(path.dirname(this.file),{recursive:true});const temporary=`${this.file}.${process.pid}.${randomUUID()}.tmp`;fs.writeFileSync(temporary,`${JSON.stringify(this.value,null,2)}\n`,{mode:0o600,flag:'wx'});fs.renameSync(temporary,this.file);}
}

export class SkillLearningRuntime {
  readonly policy:LearnedSkillPolicy; private state:SkillSnapshot;
  constructor(private readonly store=new FileSkillLearningStore(),config:LearnedSkillPolicyConfig={},private readonly clock=()=>new Date().toISOString()) {this.policy=normalizePolicy(config);this.state=store.load();}
  observe(input:{label:string;taskClass:string;capabilities:string[];sourceEvidence:string[];reason:string;expectedBenefit:string;actor:string}){
    if(!this.policy.enabled)throw new Error('skill_learning_disabled');if(!input.sourceEvidence.length)throw new Error('skill_observation_evidence_required');
    const now=this.clock(),record:SkillCandidateRecord={schema:'agent-control.skill-candidate/v1',id:`skill-candidate-${randomUUID()}`,label:required(input.label,'skill_label'),taskClass:required(input.taskClass,'skill_task_class'),capabilities:unique(input.capabilities.map(value=>required(value,'skill_capability'))),state:'OBSERVE',discoveredFrom:unique(input.sourceEvidence),observedAt:now,updatedAt:now,proposal:{reason:required(input.reason,'skill_reason'),expectedBenefit:required(input.expectedBenefit,'skill_expected_benefit'),requestedBy:required(input.actor,'skill_actor')},events:[{at:now,from:null,to:'OBSERVE',actor:input.actor,reason:input.reason,evidence:unique(input.sourceEvidence)}]};this.state.candidates.push(record);this.persist();return structuredClone(record);
  }
  identify(id:string,input:{actor:string;reason:string;evidence?:string[]}){return this.transition(id,'IDENTIFY',input);}
  attachDataset(id:string,dataset:SkillDatasetManifest,input:{actor:string;reason:string;evidence?:string[]}){
    const record=this.mustCandidate(id);if(record.state!=='IDENTIFY')throw new Error('skill_lifecycle_transition_invalid');validateDataset(dataset,this.policy);record.dataset=structuredClone(dataset);return this.applyTransition(record,'DATASET',input);
  }
  recordBaseline(id:string,input:{metrics:SkillMetric[];actor:string;reason:string;evidence:string[]}){const record=this.mustCandidate(id);if(record.state!=='DATASET'||!record.dataset)throw new Error('skill_lifecycle_transition_invalid');record.baseline={metrics:metrics(input.metrics),at:this.clock(),evidence:unique(input.evidence)};return this.applyTransition(record,'BASELINE',input);}
  beginTraining(id:string,input:{identity:SkillTrainingIdentity;actor:string;reason:string;evidence?:string[]}){const record=this.mustCandidate(id);if(record.state!=='BASELINE'||!record.baseline)throw new Error('skill_lifecycle_transition_invalid');validateTraining(input.identity);record.training={identity:structuredClone(input.identity),startedAt:this.clock(),completedAt:null,checkpointRef:null,checkpointSha256:null,resultRef:null,resultSha256:null,failure:null};return this.applyTransition(record,'TRAIN',input);}
  checkpointTraining(id:string,input:{checkpointRef:string;checkpointSha256:string}){const record=this.mustCandidate(id);if(record.state!=='TRAIN'||!record.training)throw new Error('skill_not_training');if(!validHash(input.checkpointSha256))throw new Error('skill_checkpoint_hash_invalid');record.training.checkpointRef=required(input.checkpointRef,'skill_checkpoint_ref');record.training.checkpointSha256=input.checkpointSha256;record.updatedAt=this.clock();this.persist();return structuredClone(record);}
  completeTraining(id:string,input:{resultRef:string;resultSha256:string;actor:string;reason:string;evidence?:string[]}){const record=this.mustCandidate(id);if(record.state!=='TRAIN'||!record.training)throw new Error('skill_not_training');if(!validHash(input.resultSha256))throw new Error('skill_result_hash_invalid');record.training.completedAt=this.clock();record.training.resultRef=required(input.resultRef,'skill_result_ref');record.training.resultSha256=input.resultSha256;return this.applyTransition(record,'QUALIFY',input);}
  fail(id:string,input:{state:'BLOCKED'|'REJECTED';actor:string;reason:string;evidence?:string[]}){const record=this.mustCandidate(id);if(record.training&&!record.training.completedAt)record.training.failure=input.reason;return this.applyTransition(record,input.state,input);}
  qualify(id:string,input:{adapter:{id:string;version:string;format:string;artefactSha256:string;sizeBytes:number;storageRef:string};base:{modelId:string;modelVersion:string;modelSha256:string};specialistMetrics:SkillMetric[];evaluatorId:string;evidence:string[];protectedRegressions:string[];runtimeIds:string[];minimumRuntimeVersions?:Record<string,string>;limitations?:string[];actor:string;reason:string}){
    const candidate=this.mustCandidate(id);if(candidate.state!=='QUALIFY'||!candidate.dataset||!candidate.baseline||!candidate.training?.resultSha256)throw new Error('skill_lifecycle_transition_invalid');
    if(input.adapter.artefactSha256!==candidate.training.resultSha256||!validHash(input.base.modelSha256))throw new Error('skill_artefact_identity_mismatch');const specialist=metrics(input.specialistMetrics),improvement=primaryImprovement(candidate.baseline.metrics,specialist),passes=improvement!==null&&improvement>=this.policy.minimumImprovement&&!input.protectedRegressions.length,now=this.clock();
    const adapter:SkillAdapterRecord={schema:'agent-control.skill-adapter/v1',id:required(input.adapter.id,'skill_adapter_id'),version:required(input.adapter.version,'skill_adapter_version'),label:candidate.label,taskClass:candidate.taskClass,capabilities:[...candidate.capabilities],base:structuredClone(input.base),adapter:structuredClone(input.adapter),dataset:{id:candidate.dataset.id,version:candidate.dataset.version,trainingSha256:candidate.dataset.trainingSha256,evaluationSha256:candidate.dataset.evaluationSha256},training:structuredClone(candidate.training.identity),qualification:{state:passes?'QUALIFIED':'REJECTED',qualifiedAt:passes?now:null,evaluatorId:required(input.evaluatorId,'skill_evaluator'),evidence:unique(input.evidence),baseline:structuredClone(candidate.baseline.metrics),specialist,improvement,protectedRegressions:unique(input.protectedRegressions),reason:input.reason},compatibility:{runtimeIds:unique(input.runtimeIds),minimumRuntimeVersions:{...(input.minimumRuntimeVersions??{})},baseModelSha256:input.base.modelSha256},lifecycle:{state:passes?'REGISTER':'REJECTED',registeredAt:passes?now:null,lastUsedAt:null,retiredAt:null,reason:input.reason},rollback:{previousAdapterId:null,previousVersion:null},limitations:unique(input.limitations??[])};
    const duplicate=this.state.adapters.findIndex(item=>item.id===adapter.id&&item.version===adapter.version);if(duplicate>=0)throw new Error('skill_adapter_version_exists');this.state.adapters.push(adapter);candidate.adapterId=adapter.id;this.applyTransition(candidate,passes?'REGISTER':'REJECTED',{actor:input.actor,reason:input.reason,evidence:input.evidence});return structuredClone(adapter);
  }
  enableRouting(id:string,version:string,input:{actor:string;reason:string;evidence?:string[]}){const adapter=this.mustAdapter(id,version);if(adapter.qualification.state!=='QUALIFIED'||adapter.lifecycle.state!=='REGISTER')throw new Error('skill_adapter_not_qualified');adapter.lifecycle.state='ROUTE';adapter.lifecycle.reason=input.reason;this.persist();return structuredClone(adapter);}
  monitor(id:string,version:string,input:{at?:string;reason:string;evidence?:string[]}){const adapter=this.mustAdapter(id,version);if(!['ROUTE','MONITOR'].includes(adapter.lifecycle.state))throw new Error('skill_adapter_not_routable');adapter.lifecycle.state='MONITOR';adapter.lifecycle.lastUsedAt=input.at??this.clock();adapter.lifecycle.reason=input.reason;adapter.qualification.evidence=unique([...adapter.qualification.evidence,...(input.evidence??[])]);this.persist();return structuredClone(adapter);}
  retire(id:string,version:string,input:{actor:string;reason:string;evidence?:string[]}){const adapter=this.mustAdapter(id,version);adapter.lifecycle.state='RETIRED';adapter.lifecycle.retiredAt=this.clock();adapter.lifecycle.reason=input.reason;adapter.qualification.state='RETIRED';adapter.qualification.evidence=unique([...adapter.qualification.evidence,...(input.evidence??[])]);this.persist();return structuredClone(adapter);}
  assess(request:SkillRouteRequest){const at=request.now??this.clock(),candidates=this.state.adapters.filter(item=>item.base.modelId===request.baseModelId&&item.taskClass===request.taskClass).map(item=>assessAdapter(item,request,this.policy,at));const eligible=candidates.filter(item=>item.eligible).sort((a,b)=>(b.improvement??-Infinity)-(a.improvement??-Infinity)||b.version.localeCompare(a.version));const chosen=eligible[0]??null,decision:SkillRoutingDecision={schema:'agent-control.skill-routing-decision/v1',id:`skill-route-${randomUUID()}`,parcelId:request.parcelId,stageId:request.stageId,at,taskClass:request.taskClass,baseModelId:request.baseModelId,candidates,selected:chosen?{adapterId:chosen.adapterId,version:chosen.version,artefactSha256:this.mustAdapter(chosen.adapterId,chosen.version).adapter.artefactSha256}:null,reason:chosen?`Selected qualified learned specialist ${chosen.adapterId}@${chosen.version}; material improvement ${(chosen.improvement??0).toFixed(4)} and exact base/runtime compatibility passed.`:'No learned specialist passed qualification, task, base, runtime and freshness gates; use the ordinary governed route.'};this.state.routing.push(decision);this.persist();return structuredClone(decision);}
  async execute(decisionId:string,input:Omit<SpecialistInvocation,'adapterId'|'adapterVersion'|'adapterSha256'|'adapterStorageRef'>,port:SpecialistExecutionPort){const decision=this.state.routing.find(item=>item.id===decisionId);if(!decision?.selected)throw new Error('skill_route_not_selected');const adapter=this.mustAdapter(decision.selected.adapterId,decision.selected.version);if(input.baseModelId!==adapter.base.modelId||input.baseModelSha256!==adapter.base.modelSha256||!adapter.compatibility.runtimeIds.includes(input.runtimeId))throw new Error('skill_route_identity_mismatch');const invocation={...input,adapterId:adapter.id,adapterVersion:adapter.version,adapterSha256:adapter.adapter.artefactSha256,adapterStorageRef:adapter.adapter.storageRef},result=await port.execute(invocation);if(result.actual.baseModelId!==invocation.baseModelId||result.actual.baseModelSha256!==invocation.baseModelSha256||result.actual.runtimeId!==invocation.runtimeId||result.actual.adapterId!==invocation.adapterId||result.actual.adapterVersion!==invocation.adapterVersion||result.actual.adapterSha256!==invocation.adapterSha256)throw new Error('skill_execution_identity_mismatch');this.monitor(adapter.id,adapter.version,{reason:'Verified composed identity executed through governed specialist port',evidence:[`skill-route:${decision.id}`]});return result;}
  projection(){return{schema:'agent-control.learned-specialists/v1',observedAt:this.clock(),policy:structuredClone(this.policy),candidates:structuredClone(this.state.candidates),specialists:structuredClone(this.state.adapters),routing:structuredClone(this.state.routing)};}
  candidates(){return structuredClone(this.state.candidates);} adapters(){return structuredClone(this.state.adapters);} decisions(){return structuredClone(this.state.routing);}
  private transition(id:string,to:SkillLifecycleState,input:{actor:string;reason:string;evidence?:string[]}){return this.applyTransition(this.mustCandidate(id),to,input);}
  private applyTransition(record:SkillCandidateRecord,to:SkillLifecycleState,input:{actor:string;reason:string;evidence?:string[]}){if(!legal(record.state,to))throw new Error('skill_lifecycle_transition_invalid');const from=record.state,at=this.clock();record.state=to;record.updatedAt=at;record.events.push({at,from,to,actor:required(input.actor,'skill_actor'),reason:required(input.reason,'skill_transition_reason'),evidence:unique(input.evidence??[])});this.persist();return structuredClone(record);}
  private mustCandidate(id:string){const found=this.state.candidates.find(item=>item.id===id);if(!found)throw new Error('skill_candidate_missing');return found;}
  private mustAdapter(id:string,version:string){const found=this.state.adapters.find(item=>item.id===id&&item.version===version);if(!found)throw new Error('skill_adapter_missing');return found;}
  private persist(){this.store.save(this.state);}
}

function normalizePolicy(input:LearnedSkillPolicyConfig):LearnedSkillPolicy{const value={...DEFAULT_POLICY,...input};if(value.minimumImprovement<0||value.minimumImprovement>1||value.maximumQualificationAgeDays<1||value.maximumQualificationAgeDays>3650)throw new Error('skill_learning_policy_invalid');return value;}
function required(value:string,label:string){const result=value.trim();if(!result||result.length>512)throw new Error(`${label}_invalid`);return result;}
function validateDataset(value:SkillDatasetManifest,policy:LearnedSkillPolicy){if(value.schema!=='agent-control.skill-dataset/v1'||!value.trainingExampleIds.length||!value.evaluationExampleIds.length||![value.trainingSha256,value.evaluationSha256,value.schemaSha256,...value.provenance.map(item=>item.sourceSha256)].every(validHash))throw new Error('skill_dataset_invalid');if(new Set(value.trainingExampleIds).size!==value.trainingExampleIds.length||new Set(value.evaluationExampleIds).size!==value.evaluationExampleIds.length||value.trainingExampleIds.some(id=>value.evaluationExampleIds.includes(id))||value.duplicateCount||value.malformedCount||value.contaminationCount)throw new Error('skill_dataset_contaminated');if(value.disagreementCount&&!value.humanReview.reason)throw new Error('skill_dataset_disagreement_unresolved');if(policy.requireHumanDatasetApproval&&value.humanReview.state!=='APPROVED')throw new Error('skill_dataset_approval_required');}
function validateTraining(value:SkillTrainingIdentity){if(!value.method||!value.framework||!value.frameworkVersion||!value.runtimeId||!value.runtimeVersion||!validHash(value.configurationSha256)||!validHash(value.environmentSha256)||!Number.isSafeInteger(value.gradientAccumulationSteps)||value.gradientAccumulationSteps<1||!Number.isSafeInteger(value.seed))throw new Error('skill_training_identity_invalid');}
function metrics(input:SkillMetric[]){if(!input.length||input.some(item=>!item.name||item.value!==null&&!Number.isFinite(item.value)||!item.unit))throw new Error('skill_metrics_invalid');return structuredClone(input);}
function primaryImprovement(base:SkillMetric[],specialist:SkillMetric[]){const first=base[0],after=first&&specialist.find(item=>item.name===first.name&&item.direction===first.direction);if(!first||!after||first.value===null||after.value===null)return null;return first.direction==='HIGHER_IS_BETTER'?after.value-first.value:first.value-after.value;}
function legal(from:SkillLifecycleState,to:SkillLifecycleState){if(['BLOCKED','REJECTED','RETIRED'].includes(to))return !['RETIRED'].includes(from);return ({OBSERVE:['IDENTIFY'],IDENTIFY:['DATASET'],DATASET:['BASELINE'],BASELINE:['TRAIN'],TRAIN:['QUALIFY'],QUALIFY:['REGISTER'],REGISTER:['ROUTE'],ROUTE:['MONITOR','RETRAIN'],MONITOR:['ROUTE','RETRAIN'],RETRAIN:['DATASET']} as Partial<Record<SkillLifecycleState,SkillLifecycleState[]>>)[from]?.includes(to)??false;}
function assessAdapter(item:SkillAdapterRecord,request:SkillRouteRequest,policy:LearnedSkillPolicy,at:string){const reasons:string[]=[];if(!policy.enabled||!policy.routingEnabled)reasons.push('learned-specialist-routing-disabled');if(item.qualification.state!=='QUALIFIED')reasons.push(`qualification-${item.qualification.state.toLowerCase()}`);if(!['ROUTE','MONITOR'].includes(item.lifecycle.state))reasons.push(`lifecycle-${item.lifecycle.state.toLowerCase()}`);if(item.base.modelVersion!==request.baseModelVersion||item.base.modelSha256!==request.baseModelSha256)reasons.push('base-model-identity-mismatch');if(!item.compatibility.runtimeIds.includes(request.runtimeId))reasons.push('runtime-incompatible');const minimum=item.compatibility.minimumRuntimeVersions[request.runtimeId];if(minimum&&request.runtimeVersion.localeCompare(minimum,undefined,{numeric:true})<0)reasons.push('runtime-version-too-old');for(const capability of request.requiredCapabilities)if(!item.capabilities.includes(capability))reasons.push(`capability-missing:${capability}`);if(item.qualification.improvement===null||item.qualification.improvement<policy.minimumImprovement)reasons.push('material-improvement-unproven');if(item.qualification.qualifiedAt&&(Date.parse(at)-Date.parse(item.qualification.qualifiedAt))/86_400_000>policy.maximumQualificationAgeDays)reasons.push('qualification-stale');return{adapterId:item.id,version:item.version,eligible:reasons.length===0,reasons,qualificationState:item.qualification.state,improvement:item.qualification.improvement,lastUsedAt:item.lifecycle.lastUsedAt};}

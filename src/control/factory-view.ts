import {createHash, randomUUID} from 'node:crypto';
import type {LaneProjection, ControlEvent} from './application-service.js';
import type {RunRecord, WorkerRegistration, WorkerExecutionIdentity, ArtifactRecord} from './job-types.js';
import type {WorkBoard} from './work-board.js';
import type {ModelRegistryRow} from './model-registry.js';
import type {ModelInvocationObservation} from './harness-efficiency.js';
import type {WorkParcel} from './work-parcels.js';
import type {KillRecord} from './containment.js';
import type {SkillAdapterRecord, SkillRoutingDecision} from './skill-learning.js';
import {projectInvocation} from './usage-projection.js';
import {redactSensitiveValue} from './security-redaction.js';

export const FACTORY_SCHEMA = 'agent-control.factory/v1' as const;
export type FactoryKind = 'job'|'planned-work'|'lane'|'worker'|'model'|'tool'|'baton'|'cache'|'skill'|'evidence'|'containment'|'host'|'cpu'|'gpu'|'runtime'|'endpoint'|'service'|'storage'|'repository'|'capability'|'unknown';
export interface FactoryMetric {value:number|null; unit:string; authority:string;}
export interface FactoryEntity {
  id:string; sourceId:string; kind:FactoryKind; label:string; state:string;
  laneId:string|null; runId:string|null; workerId:string|null; modelId:string|null; providerId:string|null;
  at:string|null; metrics:Record<string,FactoryMetric>; detail:Record<string,unknown>;
  links:Array<{kind:'run'|'artifact'|'board'|'lane'|'models'|'usage'|'specialists'|'activity'; id:string; label:string}>;
}
export interface FactoryRelation {id:string; from:string; to:string; kind:'assignment'|'route'|'handoff'|'evidence'|'cache'|'skill'; sourceId:string; state?:string; basis?:string; layer?:string; label?:string;}
export interface FactoryEvent {id:string; at:string; kind:string; entityId:string|null; caption:string; sourceId:string;}
export interface FactoryProjection {
  schema:typeof FACTORY_SCHEMA; domain?:'FACTORY'|'ESTATE'; estate?:Record<string,unknown>; observedAt:string; authority:'READ_ONLY_RUNTIME_PROJECTION';
  entities:FactoryEntity[]; relations:FactoryRelation[]; events:FactoryEvent[];
  coverage:{omittedEntities:number; limits:{entities:number;runs:number;invocations:number}; limitations:string[]};
}
export interface FactorySource {
  observedAt:string; lanes:LaneProjection[]; boards:WorkBoard[]; runs:RunRecord[];
  workers:WorkerRegistration[]; models:ModelRegistryRow[]; invocations:ModelInvocationObservation[];
  artifacts:Array<Omit<ArtifactRecord,'storageRef'>>; parcels:WorkParcel[];
  kills:KillRecord[]; skills:SkillAdapterRecord[]; skillRouting:SkillRoutingDecision[]; events:ControlEvent[];
  workerIdentities?:WorkerExecutionIdentity[];
}
const metric=(value:unknown,unit:string,authority='REPORTED'):FactoryMetric=>({value:typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null,unit,authority});
const text=(value:unknown,max=240)=>typeof value==='string'?value.slice(0,max):'';
const terminal=new Set(['SUCCEEDED','FAILED','CANCELLED','MISSED','DISCONNECTED']);
const modelKey=(provider:string,model:string)=>`model:${encodeURIComponent(provider)}:${encodeURIComponent(model)}`;
const laneKey=(board:string,id:string)=>`lane:board:${encodeURIComponent(board)}:${encodeURIComponent(id)}`;
const sumKnown=(rows:FactoryMetric[])=>rows.length&&rows.every(r=>r.value!==null)?rows.reduce((n,r)=>n+r.value!,0):null;
function measures(records:ModelInvocationObservation[]):Record<string,FactoryMetric>{
  // Reuse attested partition semantics; never independently reinterpret provider usage.
  const rows=records.map(r=>({r,p:projectInvocation(r,[])}));
  const result:Record<string,FactoryMetric>={};
  for(const key of ['inputTokens','freshInputTokens','cachedInputTokens','outputTokens','totalProcessedTokens'] as const){
    const values=rows.map(({r,p})=>metric(p.usage[key],'tokens',p.usageAuthority+(r.usageSource==='estimated'?' / ESTIMATED':'')));
    result[key]=metric(sumKnown(values),'tokens',[...new Set(values.map(v=>v.authority))].join(', ')||'UNAVAILABLE');
  }
  const input=result.inputTokens.value,cached=result.cachedInputTokens.value;
  const partitionsKnown=rows.length>0&&rows.every(({p})=>p.semantics?.input==='INCLUDES_CACHE'||p.semantics?.input==='EXCLUDES_CACHE');
  result.cacheReusePercent=metric(partitionsKnown&&input!==null&&input>0&&cached!==null&&cached<=input?cached/input*100:null,'%',result.inputTokens.authority);
  // TTFT and decode rates require explicit adapter timing, not wall-clock inference.
  const latest=records.at(-1);
  result.tokensPerSecond=metric(latest?.providerTimings?.tokensPerSecond,'tokens/s');
  result.ttftMs=metric(latest?.providerTimings?.ttftMs,'ms');
  result.peakRamBytes=metric(latest?.resources?.peakRamBytes,'bytes',latest?.resources?.authority??'UNAVAILABLE');
  result.peakVramBytes=metric(latest?.resources?.peakVramBytes,'bytes',latest?.resources?.authority??'UNAVAILABLE');
  result.cpuMs=metric(latest?.resources?.cpuMs,'ms',latest?.resources?.authority??'UNAVAILABLE');
  result.gpuMs=metric(latest?.resources?.gpuMs,'ms',latest?.resources?.authority??'UNAVAILABLE');
  return result;
}
function base(kind:FactoryKind,id:string,label:string,state:string,at:string|null=null):FactoryEntity{
  return{id:`${kind}:${id}`,sourceId:id,kind,label:text(label),state,laneId:null,runId:null,workerId:null,modelId:null,providerId:null,at,metrics:{},detail:{},links:[]};
}
export function projectFactory(source:FactorySource):FactoryProjection {
  const entities:FactoryEntity[]=[],relations:FactoryRelation[]=[],events:FactoryEvent[]=[];
  const limits={entities:600,runs:100,invocations:1000};
  let omitted=0;
  const add=(e:FactoryEntity)=>{if(entities.some(old=>old.id===e.id))return;if(Buffer.byteLength(JSON.stringify(e.detail))>8192)e.detail={truncated:true,reason:'Detail exceeds 8 KiB; open the authoritative inspector.'};if(entities.length<limits.entities)entities.push(e);else omitted++;};
  const link=(from:string,to:string,kind:FactoryRelation['kind'],sourceId:string)=>relations.push({id:`${kind}:${from}:${to}:${sourceId}`,from,to,kind,sourceId});
  const allRuns=[...source.runs].sort((a,b)=>Number(terminal.has(a.status))-Number(terminal.has(b.status))||b.requestedAt.localeCompare(a.requestedAt));
  const runs=allRuns.slice(0,limits.runs),runIds=new Set(runs.map(r=>r.id));
  omitted+=Math.max(0,allRuns.length-runs.length);
  const observations=source.invocations.filter(i=>i.runId&&runIds.has(i.runId)).slice(-limits.invocations);
  const boardForRun=new Map<string,{board:WorkBoard,item:WorkBoard['items'][number]}>();
  for(const board of source.boards)for(const item of board.items)for(const run of item.runs)boardForRun.set(run.runId,{board,item});
  for(const lane of source.lanes){const e=base('lane',`control:${lane.id}`,lane.name,lane.status.toUpperCase(),lane.lastMeaningfulActivity);e.detail={priority:lane.priority,task:lane.task,model:lane.model,routeReason:lane.routeReason??null,verification:lane.verification};e.links=[{kind:'lane',id:String(lane.id),label:'Open lane'}];add(e);}
  for(const board of source.boards){
    for(const lane of board.lanes){const e=base('lane',`${board.id}:${lane.id}`,lane.label,'CONFIGURED',board.updatedAt);e.id=laneKey(board.id,lane.id);e.detail={boardId:board.id,parallelism:lane.parallelism};e.links=[{kind:'board',id:board.id,label:'Open Board'}];add(e);}
    for(const item of board.items){
      // Linked plans are details on their run pallets, not duplicate executions.
      if(item.runs.some(r=>runIds.has(r.runId)))continue;
      const e=base('planned-work',item.id,item.title,item.state,item.updatedAt);e.laneId=item.laneId?laneKey(board.id,item.laneId):null;
      e.workerId=item.assignment.agent;e.modelId=item.assignment.model;e.providerId=item.assignment.provider;
      e.detail={boardId:board.id,priority:item.priority,reason:item.stateReason,blockers:item.blockers,verification:'UNAVAILABLE',checkpoint:item.checkpoint};e.links=[{kind:'board',id:board.id,label:'Open real Board'}];add(e);
    }
  }
  for(const run of runs){
    const own=observations.filter(i=>i.runId===run.id),live=own.filter(i=>i.state==='RUNNING').at(-1),last=live??own.at(-1),route=run.trigger.modelRoute;
    const active=run.steps.find(s=>['RUNNING','DISPATCHED','VERIFYING','RETRY_PENDING','CANCEL_PENDING','CLEANUP_UNCERTAIN'].includes(s.status));
    const assigned=active?.attempts.at(-1)?.workerId??null,board=boardForRun.get(run.id);
    const e=base('job',run.id,run.effectiveJob.metadata.name,run.status,run.updatedAt??run.requestedAt);
    e.runId=run.id;e.workerId=assigned;e.modelId=last?.model??route?.modelId??null;e.providerId=last?.provider??route?.providerId??null;
    e.laneId=board?.item.laneId?laneKey(board.board.id,board.item.laneId):last?.laneId&&source.lanes.some(l=>String(l.id)===last.laneId)?`lane:control:${last.laneId}`:null;
    e.metrics=measures(own);e.metrics.elapsedMs=metric(run.startedAt?Date.parse(run.endedAt??source.observedAt)-Date.parse(run.startedAt):null,'ms','DERIVED_FROM_RUNTIME_TIMESTAMPS');
    const checks=run.steps.flatMap(s=>s.verification?[s.verification]:[]);
    const verification=checks.some(c=>c.failed.length)?'FAIL':checks.some(c=>c.required.length)&&checks.every(c=>c.required.every(v=>c.passed.includes(v)))?'PASS':checks.some(c=>c.required.length)?'PENDING':'UNAVAILABLE';
    const parcelStage=source.parcels.flatMap(p=>p.stages).find(s=>s.runId===run.id);
    e.detail={jobId:run.jobId,version:run.jobVersion,priority:board?.item.priority??run.priority,boardId:board?.board.id??null,plannedWorkId:board?.item.id??null,currentStep:active?.id??null,verification,checks,actualRoute:parcelStage?.actualRoute??null,
      retries:run.steps.reduce((n,s)=>n+Math.max(0,s.attempts.length-1),0),selectedWorkers:run.selectedWorkers,route:route?{model:route.modelId,provider:route.providerId,fallback:route.fallback,reason:route.fallbackReason,qualificationVersion:route.qualificationVersion}:null,
      steps:run.steps.map(s=>({id:s.id,action:s.action,status:s.status,worker:s.attempts.at(-1)?.workerId??null,reason:s.waitingReason??s.error??null,placement:s.placement??null,verification:s.verification??null,cleanup:s.cleanup??null})),
      modelAssignment:live?'CURRENT_INVOCATION':last?'MOST_RECENT_INVOCATION':route?'CONFIGURED_RUN_ROUTE':'UNAVAILABLE',
      usageCoverage:{observed:own.length,scope:'retained invocation window',incomplete:source.invocations.length>limits.invocations},
      provenance:run.provenance.slice(-12),externalAnchor:'UNAVAILABLE',generationIsCompletion:false};
    e.links=[{kind:'run',id:run.id,label:'Open real run detail'}];add(e);
    if(assigned)link(e.id,`worker:${assigned}`,'assignment',run.id);
    if(e.modelId&&e.providerId)link(e.id,modelKey(e.providerId,e.modelId),'route',last?.id??run.id);
    if(e.metrics.cachedInputTokens.value!==null){const cache=base('cache',run.id,'Context cache',e.metrics.cachedInputTokens.value>0?'REUSE_REPORTED':'ZERO_REPORTED',last?.completedAt??last?.startedAt??null);cache.runId=run.id;cache.modelId=e.modelId;cache.providerId=e.providerId;cache.metrics={inputTokens:e.metrics.inputTokens,freshInputTokens:e.metrics.freshInputTokens,cachedInputTokens:e.metrics.cachedInputTokens,cacheReusePercent:e.metrics.cacheReusePercent};cache.detail={invocationIds:own.map(i=>i.id),authority:e.metrics.cachedInputTokens.authority,cacheEvidence:last?.cacheEvidence??null,measurement:'No cache saving or efficiency claim without comparable outcome evidence'};cache.links=[{kind:'usage',id:e.modelId??'',label:'Open cumulative cache accounting'}];add(cache);if(e.metrics.cachedInputTokens.value>0)link(cache.id,e.id,'cache',last?.id??run.id);}
  }
  for(const worker of source.workers){
    const assigned=runs.filter(r=>r.steps.some(s=>s.attempts.at(-1)?.workerId===worker.id&&['RUNNING','DISPATCHED','VERIFYING','CANCEL_PENDING','CLEANUP_UNCERTAIN'].includes(s.status)));
    const node=source.workerIdentities?.find(i=>i.workerId===worker.id)?.nodeId;
    const stop=source.kills.filter(k=>k.recovery!=='AVAILABLE'&&(k.scope.kind==='WORKER'&&k.scope.id===worker.id||k.scope.kind==='NODE'&&k.scope.id===node||k.scope.kind==='ESTATE')).at(-1);
    const e=base('worker',worker.id,worker.id,stop?(stop.recovery==='KILLED'?stop.state:stop.recovery):worker.health==='offline'?'OFFLINE':worker.active>0?'WORKING':worker.health==='unknown'?'UNKNOWN':'IDLE',worker.observedAt);
    // A shared worker has no single Job identity. Preserve every assignment in detail instead of colouring it as the first Run.
    e.runId=assigned.length===1?assigned[0].id:null;const own=observations.filter(i=>i.state==='RUNNING'&&assigned.some(r=>r.id===i.runId));e.modelId=own.at(-1)?.model??null;e.providerId=own.at(-1)?.provider??null;e.metrics=measures(own);
    e.detail={health:worker.health,active:worker.active,capacity:worker.capacity,capabilities:worker.capabilities,blockedCapabilities:worker.blockedCapabilities??[],currentRuns:assigned.map(r=>r.id),runtime:worker.labels?.runtime??null,containment:stop?{id:stop.id,state:stop.state,recovery:stop.recovery,reason:stop.reason,requiredReturn:'INSPECTED → RESET → REQUALIFIED → AVAILABLE'}:null};
    e.links=assigned.map(r=>({kind:'run' as const,id:r.id,label:'Open assigned run'}));add(e);
  }
  const modelIdentities=new Map(source.models.map(m=>[modelKey(m.provider,m.id),m]));
  const keys=new Set([...modelIdentities.keys(),...observations.map(i=>modelKey(i.provider,i.model))]);
  for(const key of keys){
    const configured=modelIdentities.get(key),own=observations.filter(i=>modelKey(i.provider,i.model)===key),last=own.at(-1),provider=configured?.provider??last!.provider,id=configured?.id??last!.model;
    const stop=source.kills.filter(k=>k.recovery!=='AVAILABLE'&&(k.scope.kind==='MODEL'&&k.scope.id===id||k.scope.kind==='ESTATE')).at(-1);
    const e=base('model',id,configured?.displayName??id,stop?(stop.recovery==='KILLED'?stop.state:stop.recovery):own.some(i=>i.state==='RUNNING')?'WORKING':configured?.enabled===false?'DISABLED':configured?.qualification.state??'OBSERVED',last?.completedAt??last?.startedAt??configured?.qualification.checkedAt??null);
    e.id=key;e.modelId=id;e.providerId=provider;e.metrics=measures(own);e.metrics.contextLimit=metric(configured?.limits?.contextTokens,'tokens','CONFIGURED_LIMIT');e.metrics.contextOccupancy=metric(null,'%','UNAVAILABLE');
    e.detail={providerModel:configured?.providerModel??null,qualification:configured?.qualification??null,accountAvailability:configured?.account?.availability??null,cost:last?projectInvocation(last,[]).apiCost:null,scope:'retained displayed-run invocations; use Usage & Cost for cumulative history',cacheEvidence:last?.cacheEvidence??null,containment:stop?{state:stop.state,recovery:stop.recovery,reason:stop.reason}:null};
    e.links=[{kind:'models',id,label:'Model configuration and qualification'},{kind:'usage',id,label:'Historical usage, cost and cache'}];add(e);
  }
  for(const parcel of source.parcels){
    for(const baton of parcel.context?.batonViews??[]){
      const e=base('baton',baton.id,`Baton · ${baton.targetStageId??'unbound'}`,'RECORDED',baton.createdAt),target=parcel.stages.find(s=>s.id===baton.targetStageId);
      e.runId=target?.runId??null;e.detail={parcelId:parcel.id,source:baton.sourceStageIds,destination:baton.targetStageId??null,sourceRunIds:parcel.stages.filter(s=>baton.sourceStageIds.includes(s.id)).flatMap(s=>s.runId?[s.runId]:[]),destinationRunId:target?.runId??null,stateDigest:baton.sha256,reason:baton.nextAction,provenance:baton.eventRefs,externalAnchor:'UNAVAILABLE'};
      e.links=[{kind:'run',id:parcel.id,label:'Open Work Parcel provenance'}];add(e);
      for(const id of baton.sourceStageIds){const from=parcel.stages.find(s=>s.id===id)?.runId;if(from&&target?.runId)link(`job:${from}`,`job:${target.runId}`,'handoff',baton.id);}
    }
    for(const event of parcel.audit.timeline.slice(-30))events.push({id:`parcel:${parcel.id}:${event.id}`,at:event.at,kind:event.type,entityId:parcel.stages.find(s=>s.id===event.stageId)?.runId?`job:${parcel.stages.find(s=>s.id===event.stageId)!.runId}`:null,caption:text(event.summary),sourceId:event.id});
  }
  for(const record of observations){
    for(const tool of record.toolIds){const e=base('tool',`${record.id}:${tool}`,tool,record.state,record.completedAt??record.startedAt);e.runId=record.runId;e.detail={invocationId:record.id,provenance:record.provenance};e.links=record.runId?[{kind:'run',id:record.runId,label:'Open tool execution'}]:[];add(e);}
  }
  for(const artifact of source.artifacts.filter(a=>runIds.has(a.runId)).slice(-100)){
    const e=base('evidence',artifact.id,artifact.name,'RECORDED',artifact.createdAt);e.runId=artifact.runId;e.detail={sha256:artifact.sha256,type:artifact.type,size:artifact.size,provenance:artifact.provenance,externalAnchor:'UNAVAILABLE'};e.links=[{kind:'artifact',id:artifact.id,label:'Open protected evidence'}];add(e);link(`job:${artifact.runId}`,e.id,'evidence',artifact.id);
  }
  for(const skill of source.skills){
    const e=base('skill',`${skill.id}@${skill.version}`,skill.label,skill.qualification.state,skill.lifecycle.lastUsedAt??skill.lifecycle.registeredAt);
    const routes=source.skillRouting.filter(r=>r.selected?.adapterId===skill.id&&r.selected.version===skill.version).slice(-8);
    e.detail={version:skill.version,baseModel:skill.base,adapter:{format:skill.adapter.format,sha256:skill.adapter.artefactSha256},training:skill.training,trainingTokenCount:null,qualification:skill.qualification.state,lifecycle:skill.lifecycle,externalAnchor:'UNAVAILABLE',semantics:'LOADABLE_ADAPTER_NOT_PERMANENT_LEARNING',loadReceipt:'UNAVAILABLE',routes};e.links=[{kind:'specialists',id:skill.id,label:'Open learned specialists'}];add(e);
    for(const route of routes){const runId=source.parcels.find(p=>p.id===route.parcelId)?.stages.find(s=>s.id===route.stageId)?.runId;if(runId)link(e.id,`job:${runId}`,'skill',route.id);events.push({id:`skill:${route.id}`,at:route.at,kind:'SKILL_ROUTE_SELECTED',entityId:runId?`job:${runId}`:e.id,caption:`ADAPTER SELECTED · ${text(skill.label,100)}@${text(skill.version,30)} · load receipt unavailable`,sourceId:route.id});}
  }
  for(const kill of source.kills.slice(-40)){
    const e=base('containment',kill.id,`${kill.scope.kind} · ${kill.scope.id}`,kill.state,kill.completedAt??kill.requestedAt);e.detail={scope:kill.scope,reason:kill.reason,recovery:kill.recovery,cleanup:kill.cleanup,evidence:kill.evidence,sharedSkipped:kill.sharedSkipped};e.links=[{kind:'board',id:'',label:'Open containment timeline'}];add(e);
  }
  for(const event of source.events.slice(-60))events.push({id:`control:${event.id}`,at:event.at,kind:event.type,entityId:typeof event.payload.runId==='string'?`job:${event.payload.runId}`:null,caption:`${event.type.toUpperCase().replaceAll('.',' / ')}${typeof event.payload.status==='string'?` · ${event.payload.status}`:''}`,sourceId:String(event.id)});
  const ids=new Set(entities.map(e=>e.id));
  return redactSensitiveValue({schema:FACTORY_SCHEMA,observedAt:source.observedAt,authority:'READ_ONLY_RUNTIME_PROJECTION',entities,relations:relations.filter(r=>ids.has(r.from)&&ids.has(r.to)).slice(-1000),events:events.sort((a,b)=>a.at.localeCompare(b.at)).slice(-100),coverage:{omittedEntities:omitted,limits,limitations:['Sampled state; intermediate transitions can be coalesced.','Unknown telemetry is not zero. Local digests are not signed external anchors.','Only retained invocations are aggregated here; cumulative charts remain authoritative.']}}) as FactoryProjection;
}

export interface FactoryFrame {schema:'agent-control.factory-frame/v1';id:string;sequence:number;epoch:string;at:string;projection:FactoryProjection;}
/** Byte- and count-bounded replacement frames. No renderer or core runtime dependency. */
export class FactoryJournal {
  readonly epoch=randomUUID();private sequence=0;private bytes=0;private frames:Array<{frame:FactoryFrame;bytes:number}>=[];
  constructor(readonly maxFrames=240,readonly maxBytes=8*1024*1024){}
  append(projection:FactoryProjection):FactoryFrame{
    const frame:FactoryFrame={schema:'agent-control.factory-frame/v1',id:`${this.epoch}:${++this.sequence}`,sequence:this.sequence,epoch:this.epoch,at:projection.observedAt,projection};
    const bytes=Buffer.byteLength(JSON.stringify(frame));if(bytes>this.maxBytes)throw Error('factory_frame_exceeds_buffer');
    this.frames.push({frame,bytes});this.bytes+=bytes;
    while(this.frames.length>this.maxFrames||this.bytes>this.maxBytes){this.bytes-=this.frames.shift()!.bytes;}
    return frame;
  }
  replay(after?:string){const index=after?this.frames.findIndex(f=>f.frame.id===after):-1;return{schema:'agent-control.factory-replay/v1' as const,epoch:this.epoch,coverage:{first:this.frames[0]?.frame.id??null,last:this.frames.at(-1)?.frame.id??null,bytes:this.bytes,maxBytes:this.maxBytes,maxFrames:this.maxFrames,gap:Boolean(after&&index<0),startedAt:this.frames[0]?.frame.at??null},frames:this.frames.slice(index<0?0:index+1).map(f=>f.frame)};}
}
export function factoryDigest(projection:FactoryProjection){return createHash('sha256').update(JSON.stringify(projection)).digest('hex');}

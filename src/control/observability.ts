import type {ModelInvocationObservation} from "./harness-efficiency.js";
import {physicalInferenceMarkdown,type physicalInferenceMeasurements} from "./physical-inference-observation.js";
import type {RuntimeMapProjection, RuntimeMapNode} from './runtime-map.js';
import type {WorkParcel} from './work-parcels.js';
import type {ParameterizedJobRun} from './parameterized-job-types.js';
import type {ManagedNodeSnapshot} from './managed-node.js';
import type {ExecutionSessionRecord} from './execution-session.js';
import {redactSensitiveValue} from './security-redaction.js';
import {safeTranscriptText} from './execution-history.js';
import {projectInvocation,usageProjection} from './usage-projection.js';
import type {HarnessEfficiencyLedgerPort} from './harness-efficiency.js';
import type {EnergyExecutionRecord} from './energy-telemetry.js';
import type {RunRecord} from './job-types.js';
import {createHash} from 'node:crypto';
import {projectNestedResourceAccounting,type NestedResourceObservation} from './nested-execution.js';

export type InspectorUsage=ReturnType<typeof usageProjection>;
export function nodeWorkIndex(parcels:WorkParcel[],runs:ParameterizedJobRun[],sessions:Array<Pick<ExecutionSessionRecord,'id'|'scope'|'state'>>,jobs:RunRecord[]=[],recordedInvocations:ModelInvocationObservation[]=[]) {
  const result:Array<{id:string;inspectorId:string;kind:'parcel'|'job';label:string;status:string;startedAt:string;endedAt:string|null;nodeId:string;binding:string;parameterizedRunId:string|null}>=[];
  for(const parcel of parcels){
    const nodes=new Map<string,string>();
    for(const invocation of parcel.audit.invocations){const id=invocation.providerExecutionNodeId??invocation.node;if(id)nodes.set(id,'Recorded provider execution node');}
    for(const stage of parcel.stages){if(stage.actualRoute?.providerExecutionNodeId)nodes.set(stage.actualRoute.providerExecutionNodeId,'Recorded stage execution route');for(const worker of stage.actualRoute?.workers??[])nodes.set(worker,'Recorded stage worker route');}
    for(const session of sessions)if(session.scope.parcelId===parcel.id&&session.scope.nodeId)nodes.set(session.scope.nodeId,'Owned execution session scope');
    const parent=runs.find(run=>run.workParcelIds.includes(parcel.id));
    const childRun=jobs.find(run=>run.trigger.parcelContext?.parcelId===parcel.id);
    if(childRun)for(const invocation of recordedInvocations)if(invocation.runId===childRun.id&&invocation.accounting?.machine)nodes.set(invocation.accounting.machine,'Recorded invocation accounting execution node');
    for(const [nodeId,binding]of nodes)result.push({id:parcel.id,inspectorId:childRun?.id??parcel.id,kind:'parcel',label:parent?`${parent.definition.displayName} · ${parcel.stages[0]?.name??parcel.id}`:parcel.objective,status:parcel.status,startedAt:parcel.createdAt,endedAt:parcel.endedAt??null,nodeId,binding,parameterizedRunId:parent?.id??null});
  }
  for(const run of jobs){if(run.trigger.parcelContext?.parcelId&&parcels.some(p=>p.id===run.trigger.parcelContext!.parcelId))continue;
    const nodeIds=new Set(sessions.filter(s=>s.scope.runId===run.id).map(s=>s.scope.nodeId).filter(Boolean));
    for(const invocation of recordedInvocations)if(invocation.runId===run.id&&invocation.accounting?.machine)nodeIds.add(invocation.accounting.machine);
    if(run.trigger.modelRoute?.providerExecutionNodeId)nodeIds.add(run.trigger.modelRoute.providerExecutionNodeId);
    for(const nodeId of nodeIds)result.push({id:run.id,inspectorId:run.id,kind:'job',label:run.jobId,status:run.status,startedAt:run.startedAt??run.requestedAt,endedAt:run.endedAt??null,nodeId,binding:'Recorded execution session or provider route',parameterizedRunId:null});
  }
  return result;
}
function descendants(estate:RuntimeMapProjection,id:string){const found:RuntimeMapNode[]=[];let parents=new Set([id]);while(parents.size){const children=estate.nodes.filter(n=>n.parentId&&parents.has(n.parentId));if(!children.length)break;found.push(...children);parents=new Set(children.map(n=>n.id));}return found;}
function environmentKind(node:RuntimeMapNode){const explicit=node.detail.executionEnvironmentKind;return typeof explicit==='string'?explicit:node.detail.executionContainment?'EXECUTION_ENVIRONMENT':null;}
function environmentLineage(estate:RuntimeMapProjection,node:RuntimeMapNode){const values:RuntimeMapNode[]=[node];let cursor=node.parentId;const seen=new Set([node.id]);while(cursor&&!seen.has(cursor)){seen.add(cursor);const parent=estate.nodes.find(n=>n.id===cursor);if(!parent)break;values.unshift(parent);cursor=parent.parentId;}return values;}
function managedFor(node:RuntimeMapNode,managed:ManagedNodeSnapshot[]){return managed.find(m=>m.resourceId===node.id||m.resourceId===node.detail.configuredId||m.resourceId===node.detail.nodeId);}
export function projectNodeDashboard(estate:RuntimeMapProjection,id:string,managed:ManagedNodeSnapshot[],work:ReturnType<typeof nodeWorkIndex>) {
  const node=estate.nodes.find(n=>n.id===id&&['machine','device'].includes(n.type));
  if(!node)throw Error('observability_node_missing');
  const nodeId=typeof node.detail.nodeId==='string'?node.detail.nodeId:null;
  const resources=estate.nodes.filter(n=>n.id!==id&&(n.detail.deviceId===id||(nodeId!==null&&n.detail.nodeId===nodeId&&!['machine','device','estate'].includes(n.type))));
  const snapshot=nodeId?managed.find(m=>m.resourceId===nodeId):undefined;
  const nested=descendants(estate,id).filter(n=>environmentKind(n));
  const executionEnvironments=nested.map(n=>{const kind=environmentKind(n),m=kind==='WORKER'?undefined:managedFor(n,managed);return {id:n.id,label:n.label,kind,parentId:n.parentId??null,parentLabel:estate.nodes.find(p=>p.id===n.parentId)?.label??null,state:n.state,availability:n.detail.availability??'UNKNOWN',operatingSystem:m?.os??{name:n.detail.osName??n.detail.platform??null,version:n.detail.osVersion??null,architecture:n.detail.architecture??null},transport:n.detail.transport??m?.capabilities.find(c=>c.startsWith('transport.'))?.slice(10)??null,capabilities:m?.capabilities??n.detail.capabilities??[],runtimes:m?.containerRuntimes??estate.nodes.filter(child=>child.parentId===n.id&&child.detail.executionEnvironmentKind==='RUNTIME').map(child=>({id:child.id,kind:String(child.detail.runtimeKind??child.label),version:typeof child.detail.version==='string'?child.detail.version:undefined,state:String(child.detail.availability??'UNKNOWN'),observedAt:child.startedAt??estate.observedAt,containers:[]})),workerRoute:m?{id:m.resourceId,state:m.state,health:m.health}:kind==='WORKER'?{id:String(n.detail.configuredId??n.id),state:n.state,health:n.detail.health??'unknown'}:typeof n.detail.workerRouteId==='string'?{id:n.detail.workerRouteId,state:'RECORDED_CONTROLLER_ROUTE',health:'unknown'}:null,lastObservedAt:m?.lastProbeAt??n.startedAt??estate.observedAt,evidence:n.evidence};});
  const accounting:NestedResourceObservation[]=[];
  const add=(subjectId:string,scope:NestedResourceObservation['scope'],metric:NestedResourceObservation['metric'],value:unknown,source:string,authority:NestedResourceObservation['authority'])=>accounting.push({subjectId,physicalDeviceId:id,scope,metric,value:typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null,observedAt:estate.observedAt,source,authority});
  add(id,'PHYSICAL_CAPACITY','CPU_LOGICAL',node.detail.cpuLogical,'Estate discovery','REPORTED');add(id,'PHYSICAL_CAPACITY','MEMORY_BYTES',node.detail.totalMemoryBytes??node.detail.memoryTotalBytes,'Estate discovery','REPORTED');add(id,'PHYSICAL_CAPACITY','STORAGE_BYTES',node.detail.diskTotalBytes,'Estate discovery','REPORTED');
  for(const env of executionEnvironments){if(env.kind==='WORKER')continue;const m=managed.find(item=>item.resourceId===env.workerRoute?.id);if(!m)continue;add(env.id,'GUEST_VISIBLE_CAPACITY','CPU_LOGICAL',m.measurements.cpuLogical.value,m.measurements.cpuLogical.source,m.measurements.cpuLogical.authority==='authoritative'?'MEASURED':'UNKNOWN');add(env.id,'GUEST_VISIBLE_CAPACITY','MEMORY_BYTES',m.measurements.memoryTotalBytes.value,m.measurements.memoryTotalBytes.source,m.measurements.memoryTotalBytes.authority==='authoritative'?'MEASURED':'UNKNOWN');}
  const boundIds=new Set([id,nodeId,...nested.flatMap(n=>[n.id,typeof n.detail.configuredId==='string'?n.detail.configuredId:null,typeof n.detail.nodeId==='string'?n.detail.nodeId:null])].filter((value):value is string=>Boolean(value)));
  return redactSensitiveValue({schema:'agent-control.node-dashboard/v2',observedAt:estate.observedAt,node,nodeId,resources,managed:snapshot??null,executionEnvironments,resourceAccounting:projectNestedResourceAccounting(accounting),work:work.filter(w=>boundIds.has(w.nodeId)),bindingPolicy:'Exact recorded node or evidenced descendant environment identity only. Workload and credential locations do not imply model execution.',limitations:['Discovery availability and qualification are independent from live resource measurements.','Whole-node utilization does not prove individual job resource consumption.','Nested guest-visible and allocated capacities describe views of physical capacity and are never added to physical totals.']});
}

export function executionRouteProjection(estate:RuntimeMapProjection,managed:ManagedNodeSnapshot[],input:{workers:string[];reason:string|null;runtimeId?:string|null}){
  const workerId=input.workers[0]??null,node=workerId?estate.nodes.find(n=>n.id===workerId||n.detail.configuredId===workerId||n.detail.nodeId===workerId):undefined;
  const lineage=node?environmentLineage(estate,node).filter(n=>['machine','device'].includes(n.type)||environmentKind(n)):[];
  const snapshot=node?managedFor(node,managed):undefined,runtime=snapshot?.containerRuntimes?.find(r=>!input.runtimeId||r.id===input.runtimeId)??null;
  const physical=lineage.find(n=>['machine','device'].includes(n.type))??null;
  return redactSensitiveValue({authority:'DETERMINISTIC_RECORDED_ROUTE',physicalDevice:physical?{id:physical.id,label:physical.label}:null,path:lineage.map(n=>({id:n.id,label:n.label,kind:['machine','device'].includes(n.type)?'PHYSICAL_DEVICE':environmentKind(n),parentId:n.parentId??null})),worker:workerId?{id:workerId,state:snapshot?.state??'UNKNOWN'}:null,transport:node?.detail.transport??snapshot?.capabilities.find(c=>c.startsWith('transport.'))?.slice(10)??null,runtime,reason:input.reason,explanation:input.reason&&physical&&node?`This route was selected for ${input.reason}. Agent Control reached ${node.label} inside ${physical.label}${runtime?` through ${String(node.detail.transport??'the recorded transport')} and ${runtime.kind}`:''}.`:'No complete deterministic nested route explanation is recorded.',evidence:[...(node?.evidence??[]),...(runtime?[{kind:'container-runtime-observation',id:runtime.id}]:[])]});
}
export function projectRunInspector(parcel:WorkParcel,map:RuntimeMapProjection,usage:InspectorUsage,estate:RuntimeMapProjection,operationId?:string,accountingRows:InspectorUsage['rows']=usage.rows,managed:ManagedNodeSnapshot[]=[]) {
  const operation=operationId?map.nodes.find(n=>n.id===operationId):undefined;
  if(operationId&&!operation)throw Error('observability_operation_missing');
  const invocationIds=operation?.evidence.filter(e=>e.kind==='model-invocation').map(e=>e.id);
  const invocations=parcel.audit.invocations.filter(i=>!operation||invocationIds?.includes(i.id)||operation.id===`model:${i.id}`);
  const exactNode=(id:string|null|undefined)=>id?estate.nodes.find(n=>['machine','device'].includes(n.type)&&n.detail.nodeId===id):undefined;
  const accountingById=new Map(accountingRows.map(row=>[row.id,row]));
  const calls=invocations.map(i=>{const accounting=accountingById.get(i.accountingInvocationId??'');return {...i,exchange:i.exchange?{...i.exchange,input:safeTranscriptText(i.exchange.input),output:safeTranscriptText(i.exchange.output)}:null,accounting:accounting??null,physicalNode:exactNode(i.providerExecutionNodeId??i.node)?.id??null};});
  const nodeIds=new Set(parcel.audit.invocations.map(i=>i.providerExecutionNodeId??i.node).filter(Boolean));
  for(const n of map.nodes){const identity=n.detail.resourceIdentity as {nodeId?:string}|undefined;if(identity?.nodeId)nodeIds.add(identity.nodeId);}
  const physicalNodes=[...nodeIds].flatMap(id=>{const n=exactNode(id);return n?[{id:n.id,label:n.label,nodeId:id}]:[];});
  // Events retain their actual source schema, timestamps and identifiers. No UI lifecycle events are synthesised.
  const events=parcel.audit.timeline.map(e=>({...e,source:'Work Parcel audit'}));
  const relatedOperations=operation?map.nodes.filter(n=>n.id===operation.id||n.parentId===operation.id):map.nodes;
  const stage=operation?.detail.stageId?parcel.stages.find(s=>s.id===operation.detail.stageId):parcel.stages.find(s=>s.actualRoute);
  const runtimeId=(parcel.provenance??[]).map(p=>p.detail.match(/runtime:([^\s]+)/)?.[1]).find(Boolean)??null;
  const executionRoute=executionRouteProjection(estate,managed,{workers:stage?.actualRoute?.workers??[],reason:stage?.actualRoute?.reason??null,runtimeId});
  if(executionRoute.physicalDevice&&!physicalNodes.some(n=>n.id===executionRoute.physicalDevice!.id))physicalNodes.push({...executionRoute.physicalDevice,nodeId:String(estate.nodes.find(n=>n.id===executionRoute.physicalDevice!.id)?.detail.nodeId??executionRoute.physicalDevice.id)});
  return redactSensitiveValue({schema:'agent-control.run-inspector/v2',id:parcel.id,title:parcel.objective,status:parcel.status,startedAt:parcel.createdAt,endedAt:parcel.endedAt??null,observedAt:map.observedAt,operation:operation??null,physicalNodes,calls,usage,executionRoute,events,processEvents:map.events,context:{state:parcel.context??null,stages:parcel.stages.map(s=>({id:s.id,status:s.status,route:s.actualRoute??null,baton:s.baton??null})),records:map.nodes.filter(n=>['baton','memory','cache'].includes(n.type)),explanation:'Provider prompt cache, Agent Control context reuse, baton state, persistent memory and external context sources are distinct mechanisms. No token or cost saving is inferred from a handoff alone.'},operations:relatedOperations,limitations:['Missing counters remain unavailable. Totals come from canonical accounting; event snapshots are not added together.','Average end-to-end call throughput includes all recorded latency; it is not prompt-processing or generation-only throughput.']});
}

export function operationEvidenceText(node:RuntimeMapNode){return safeTranscriptText(JSON.stringify({detail:node.detail,evidence:node.evidence},null,2));}

export function projectJobInspector(run:RunRecord,map:RuntimeMapProjection,usage:InspectorUsage,estate:RuntimeMapProjection,nodeIds:string[],operationId?:string,managed:ManagedNodeSnapshot[]=[],recordedInvocations:ModelInvocationObservation[]=[]){
  const operation=operationId?map.nodes.find(n=>n.id===operationId):undefined;if(operationId&&!operation)throw Error('observability_operation_missing');
  const runtimeId=(run.provenance??[]).map(p=>p.detail.match(/runtime:([^\s]+)/)?.[1]).find(Boolean)??null,reason=(run.steps??[]).flatMap(s=>s.placement?.reasons??[]).join(', ')||null;
  const executionRoute=executionRouteProjection(estate,managed,{workers:run.selectedWorkers??[],reason,runtimeId}),physicalNodes=estate.nodes.filter(n=>['machine','device'].includes(n.type)&&nodeIds.includes(String(n.detail.nodeId))).map(n=>({id:n.id,label:n.label,nodeId:String(n.detail.nodeId)}));
  if(executionRoute.physicalDevice&&!physicalNodes.some(n=>n.id===executionRoute.physicalDevice!.id))physicalNodes.push({...executionRoute.physicalDevice,nodeId:String(estate.nodes.find(n=>n.id===executionRoute.physicalDevice!.id)?.detail.nodeId??executionRoute.physicalDevice.id)});
  const calls=recordedInvocations.filter(i=>i.runId===run.id&&(!operation||operation.evidence.some(e=>e.kind==='model-invocation'&&e.id===i.id)||(operation.type!=='model-call'&&operation.detail.stepId===i.stepId))).map(i=>({
    id:i.id,accountingInvocationId:i.id,model:i.model,provider:i.provider,startedAt:i.startedAt,completedAt:i.completedAt,elapsedMs:i.elapsedMs,node:i.accounting?.machine??null,
    inputTokens:i.usage.inputTokens,cachedInputTokens:i.usage.cachedInputTokens,freshInputTokens:i.usage.freshInputTokens,outputTokens:i.usage.outputTokens,totalTokens:i.usage.totalProcessedTokens,
    accounting:usage.rows.find(row=>row.id===i.id)??null,exchange:null,physicalNode:physicalNodes.find(n=>n.nodeId===i.accounting?.machine)?.id??null,
  }));
  return redactSensitiveValue({schema:'agent-control.run-inspector/v2',id:run.id,kind:'job',title:run.jobId,status:run.status,startedAt:run.startedAt??run.requestedAt,endedAt:run.endedAt??null,observedAt:map.observedAt,operation:operation??null,physicalNodes,calls,usage,executionRoute,events:(run.provenance??[]).map((e,i)=>({id:`${run.id}:provenance:${i}`,at:e.at,type:e.type,summary:e.detail,source:'Job Run provenance'})),processEvents:map.events,context:{state:run.trigger.parcelContext??null,stages:[],records:[],explanation:'Only the recorded Job Run context is shown. No model exchange or cache reuse is inferred from a deterministic action.'},operations:operation?[operation]:map.nodes,steps:run.steps,artifacts:run.artifacts,limitations:['Job Run provenance and owned execution sessions supply this view. Missing model telemetry remains unavailable.']});
}
export function inspectorHistory(value:{id:string;title:string;status:string;events:unknown[];operations:unknown[];calls?:unknown[];usage?:unknown;context?:unknown;executionRoute?:unknown;physicalMeasurements?:ReturnType<typeof physicalInferenceMeasurements>}){
  const content=safeTranscriptText(`# ${value.title}\n\nRun: ${value.id}\nStatus: ${value.status}\n\nDerived export of retained Agent Control run records. No events have been invented.\n${physicalInferenceMarkdown(value.physicalMeasurements??[])}\n## Execution route, token usage and baton context\n\n\`\`\`json\n${JSON.stringify({route:value.executionRoute??null,calls:value.calls??[],usage:(value.usage as {totals?:unknown}|undefined)?.totals??null,batonAndContext:value.context??null},null,2)}\n\`\`\`\n\n## Chronological source records\n\n\`\`\`json\n${JSON.stringify(value.events,null,2)}\n\`\`\`\n\n## Operations and evidence\n\n\`\`\`json\n${JSON.stringify(value.operations,null,2)}\n\`\`\``,4*1024*1024);
  return {content,sha256:createHash('sha256').update(content).digest('hex'),entryCount:value.events.length,terminal:!['QUEUED','RUNNING','WAITING','VERIFYING','VALIDATING','RESOLVING'].includes(value.status),derived:true};
}

export function scopedInspectorUsage(ledger:HarnessEfficiencyLedgerPort|undefined,energy:EnergyExecutionRecord[],scope:{runId:string;parcelIds:string[]}){
  const ids=new Set(scope.parcelIds);
  const source=ledger?{list:()=>ledger.list().filter(row=>row.runId===scope.runId||(row.accounting?.parcelId!=null&&ids.has(row.accounting.parcelId))),usageHistory:()=>ledger.usageHistory?.()??{excludedIds:[],events:[]}}:undefined;
  return usageProjection(source,energy,{period:'all',groupBy:'agent',limit:1000});
}

export function inspectorAccounting(ledger:Pick<HarnessEfficiencyLedgerPort,'list'|'usageHistory'>|undefined,energy:EnergyExecutionRecord[],ids:string[]){
  const wanted=new Set(ids),excluded=new Set(ledger?.usageHistory?.().excludedIds??[]);
  return (ledger?.list()??[]).filter(row=>wanted.has(row.id)&&!excluded.has(row.id)).map(row=>projectInvocation(row,energy));
}

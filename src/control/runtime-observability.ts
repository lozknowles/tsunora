import fs from 'node:fs';
import path from 'node:path';
import type {ContractExecutionRuntime} from './contract-runtime.js';
import type {GovernedHandoffRuntime} from './handoff-runtime.js';
import type {ProviderModelLifecycleRegistry} from './provider-lifecycle.js';
import type {SystemReadiness} from './system-readiness.js';

export interface AcpTransportProjection {
  id: 'acp-stdio' | 'acp-remote';
  protocolVersion: 1;
  transport: 'stdio-ndjson' | 'streamable-http-websocket';
  enabled: boolean;
  connection: 'active-session-transport-unknown' | 'no-active-session' | 'configured-not-observed' | 'disabled';
  authentication: 'not-required' | 'configured' | 'required';
  endpointScope: 'local-process' | 'loopback' | 'authenticated-tls-gated';
}

export interface RuntimeProjection {
  schema: 'agent-control.runtime-observability/v1';
  observedAt: string;
  acp: {
    protocolVersion: 1;
    transports: AcpTransportProjection[];
    sessions: Array<{acpSessionId:string; governedSessionId:string; actorId:string; parcelIds:string[]; deliveryCount:number; createdAt:string; updatedAt:string; closed:boolean}>;
  };
  contracts: Array<{
    id:string; laneId:string; parentContractId?:string; operatorActorId:string; state:string;
    active:{actorId:string;agentId:string;modelId?:string;providerId?:string;runtimeId:string;nodeId:string};
    baton:{generation:number;sha256:string;sizeBytes:number}; process:{id:string;state:string;observedAt:string;exitCode?:number;signal?:string};
    pty:{id:string;state:string;writeOwner:string|null;ownershipGeneration:number;participants:Array<{actorId:string;kind:string;access:string}>;lastSequence:number};
    approvalRequests:Array<{id:string;kind:string;requestedBy:string;status:string;reason:string}>; handoffIds:string[];
    verification:{state:string;verifierActorId?:string;evidenceIds:string[];reasons:string[]}; evidenceIds:string[]; updatedAt:string;
  }>;
  handoffs: Array<{id:string;outcome:string;policy:string;status:string;contractId:string;childContractId?:string;originatingActorId:string;receivingActorId?:string;receivingAgentId?:string;reason:string;batonSha256:string;batonSizeBytes:number;authorityTransferred:string[];authorityWithheld:string[];stateBefore:string;stateAfter?:string;verificationOutcome:string;approvalReasons:string[];createdAt:string;completedAt?:string}>;
  providerLifecycle: {providers:Array<{id:string;kind:string;credentialReference:'indirect'|'not-required';capabilities:string[];availableModels:string[];observedAt?:string}>;recipes:Array<{key:string;providerId:string;providerModel:string;modelVersion:string;capabilities:string[];nodeRequirements:string[];runtimeRequirements:string[];fingerprint:string;lifecycle:string}>;activePolicy?:{id:string;version:number}};
}

export interface RuntimeObservabilityOptions {
  contracts?: ContractExecutionRuntime;
  handoffs?: GovernedHandoffRuntime;
  providerLifecycle?: ProviderModelLifecycleRegistry;
  acpSessionDirectory?: string;
  remoteAcp?: {enabled:boolean; authenticationConfigured:boolean; loopback:boolean};
  clock?: () => string;
}

export class RuntimeObservability {
  readonly clock: () => string;
  constructor(readonly options: RuntimeObservabilityOptions = {}) { this.clock=options.clock??(()=>new Date().toISOString()); }

  snapshot(): RuntimeProjection {
    const acpSessions=readAcpSessions(this.options.acpSessionDirectory), open=acpSessions.filter(value=>!value.closed).length;
    const remote=this.options.remoteAcp??{enabled:false,authenticationConfigured:false,loopback:true};
    const lifecycle=this.options.providerLifecycle?.snapshot();
    return {
      schema:'agent-control.runtime-observability/v1',observedAt:this.clock(),
      acp:{protocolVersion:1,transports:[
        {id:'acp-stdio',protocolVersion:1,transport:'stdio-ndjson',enabled:true,connection:open?'active-session-transport-unknown':'no-active-session',authentication:'not-required',endpointScope:'local-process'},
        {id:'acp-remote',protocolVersion:1,transport:'streamable-http-websocket',enabled:remote.enabled,connection:remote.enabled?'configured-not-observed':'disabled',authentication:remote.enabled?(remote.authenticationConfigured?'configured':'required'):'required',endpointScope:remote.loopback?'loopback':'authenticated-tls-gated'},
      ],sessions:acpSessions},
      contracts:(this.options.contracts?.list()??[]).map(value=>({id:value.id,laneId:value.laneId,parentContractId:value.parentContractId,operatorActorId:value.operatorActorId,state:value.state,active:structuredClone(value.active),baton:{generation:value.baton.generation,sha256:value.baton.sha256,sizeBytes:value.baton.sizeBytes},process:{id:value.process.id,state:value.process.state,observedAt:value.process.observedAt,exitCode:value.process.exitCode,signal:value.process.signal},pty:{id:value.pty.id,state:value.pty.state,writeOwner:value.pty.writeOwner??null,ownershipGeneration:value.pty.ownershipGeneration,participants:value.pty.participants.map(item=>({actorId:item.actorId,kind:item.kind,access:item.access})),lastSequence:value.pty.nextSequence-1},approvalRequests:value.pendingActions.filter(item=>item.status==='PENDING').map(item=>({id:item.id,kind:item.kind,requestedBy:item.requestedBy,status:item.status,reason:item.reason})),handoffIds:[...value.handoffs],verification:structuredClone(value.verification),evidenceIds:value.evidence.map(item=>item.id),updatedAt:value.updatedAt})),
      handoffs:(this.options.handoffs?.list()??[]).map(value=>({id:value.id,outcome:value.outcome,policy:value.policy,status:value.status,contractId:value.contractId,childContractId:value.childContractId,originatingActorId:value.originatingActorId,receivingActorId:value.receivingActorId,receivingAgentId:value.receivingAgentId,reason:value.reason,batonSha256:value.batonSha256,batonSizeBytes:value.batonSizeBytes,authorityTransferred:[...value.authorityTransferred],authorityWithheld:[...value.authorityWithheld],stateBefore:value.stateBefore,stateAfter:value.stateAfter,verificationOutcome:value.verificationOutcome,approvalReasons:[...value.approvalReasons],createdAt:value.createdAt,completedAt:value.completedAt})),
      providerLifecycle:{providers:(lifecycle?.providers??[]).map(value=>({id:value.id,kind:value.kind,credentialReference:value.credentialRef?'indirect':'not-required',capabilities:[...value.capabilities],availableModels:[...value.availableModels],observedAt:value.observedAt})),recipes:(this.options.providerLifecycle?.listRecipes()??[]).map(value=>({key:value.key,providerId:value.providerId,providerModel:value.providerModel,modelVersion:value.modelVersion,capabilities:[...value.capabilities],nodeRequirements:[...value.nodeRequirements],runtimeRequirements:[...value.runtimeRequirements],fingerprint:value.fingerprint,lifecycle:value.lifecycle.state})),activePolicy:lifecycle?.activePolicy},
    };
  }

  systems(): SystemReadiness[] {
    const projection=this.snapshot(), at=projection.observedAt;
    const transports:SystemReadiness[]=projection.acp.transports.map(item=>({id:`transport:${item.id}`,name:item.id==='acp-stdio'?'ACP v1 stdio':'ACP v1 remote HTTP/WebSocket',type:'transport',registered:true,reachable:item.enabled?(item.id==='acp-stdio'?'yes':'unknown'):'unknown',authentication:item.authentication==='configured'?'present':item.authentication==='not-required'?'not required':item.enabled?'required':'unknown',execution:item.enabled?(item.authentication==='required'?'AUTH REQUIRED':item.id==='acp-stdio'?'AVAILABLE':'UNKNOWN'):'UNKNOWN',blockingReason:item.enabled?(item.id==='acp-stdio'?null:'Remote listener is configured but not observed by the dashboard process'):'Remote ACP is explicitly disabled',transport:item.transport,platform:item.endpointScope,capabilities:['acp.v1','session.create','session.resume','session.cancel'],capacity:null,active:null,lastCheckAt:at,lastSuccessfulProbeAt:null,lastSuccessfulJobAt:null,lastError:null,latencyMs:null,qualification:'stable-v1'}));
    const models:SystemReadiness[]=projection.providerLifecycle.recipes.map(recipe=>({id:`model-recipe:${recipe.key}`,name:recipe.providerModel,type:'model',registered:true,reachable:'unknown',authentication:'unknown',execution:['ACTIVE','PREFERRED'].includes(recipe.lifecycle)?'AVAILABLE':['SHADOW','CANDIDATE'].includes(recipe.lifecycle)?'DEGRADED':'UNKNOWN',blockingReason:['ACTIVE','PREFERRED'].includes(recipe.lifecycle)?null:`Lifecycle state ${recipe.lifecycle} is not production-active`,transport:recipe.runtimeRequirements.join(', ')||'not specified',capabilities:recipe.capabilities,capacity:null,active:null,lastCheckAt:null,lastSuccessfulProbeAt:null,lastSuccessfulJobAt:null,lastError:null,latencyMs:null,qualification:recipe.lifecycle,model:recipe.providerModel}));
    return [...transports,...models];
  }
}

function readAcpSessions(directory?:string):RuntimeProjection['acp']['sessions'] {
  if(!directory||!fs.existsSync(directory))return[];
  const rows:RuntimeProjection['acp']['sessions']=[];
  for(const name of fs.readdirSync(directory).filter(value=>value.endsWith('.sessions.json')).sort()){
    const file=path.join(directory,name);let value:unknown;try{value=JSON.parse(fs.readFileSync(file,'utf8'));}catch{continue;}
    if(!value||typeof value!=='object'||Array.isArray(value)||(value as {schema?:string}).schema!=='agent-control.acp-sessions/v1')continue;
    for(const item of (value as {sessions?:Array<Record<string,unknown>>}).sessions??[]){if(typeof item.acpSessionId!=='string'||typeof item.governedSessionId!=='string'||typeof item.actorId!=='string')continue;rows.push({acpSessionId:item.acpSessionId,governedSessionId:item.governedSessionId,actorId:item.actorId,parcelIds:Array.isArray(item.parcelIds)?item.parcelIds.filter((v):v is string=>typeof v==='string'):[],deliveryCount:item.deliveries&&typeof item.deliveries==='object'&&!Array.isArray(item.deliveries)?Object.keys(item.deliveries).length:0,createdAt:typeof item.createdAt==='string'?item.createdAt:'unknown',updatedAt:typeof item.updatedAt==='string'?item.updatedAt:'unknown',closed:item.closed===true});}
  }
  return rows.sort((a,b)=>a.acpSessionId.localeCompare(b.acpSessionId));
}

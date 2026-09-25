import {createHash} from 'node:crypto';
import type {FactoryProjection,FactoryEntity,FactoryKind} from './factory-view.js';
import {redactSensitiveValue} from './security-redaction.js';

export const ESTATE_CATEGORIES=['PASSIVE_INVENTORY','CONFIGURATION_READ','PROCESS_INSPECTION','SERVICE_ENUMERATION','NETWORK_RELATIONSHIP_DISCOVERY','LOG_INSPECTION','CAPABILITY_PROBES','REMOTE_HOST_DISCOVERY','REPOSITORY_INSPECTION','STORAGE_INSPECTION'] as const;
export type EstateCategory=typeof ESTATE_CATEGORIES[number];
export type EstateState='EXPECTED'|'OBSERVED'|'IDENTIFIED'|'VERIFIED'|'CAPABILITY_VERIFIED'|'UNREACHABLE'|'STALE'|'CONFLICTED'|'BLOCKED'|'UNKNOWN'|'HISTORICALLY_OBSERVED'|'DISCOVERED'|'CONNECTING'|'AVAILABLE'|'DEGRADED'|'UNAUTHORISED'|'TIMED_OUT'|'INVALID_RESPONSE'|'CANCELLED'|'RECOVERED';
export type EstateKind='host'|'cpu'|'gpu'|'runtime'|'endpoint'|'model'|'service'|'storage'|'repository'|'worker'|'skill'|'capability'|'unknown';
export interface EstateEvidence {id:string;source:string;method:string;type:'CONFIGURATION'|'OS_INVENTORY'|'SERVICE_RESPONSE'|'REGISTRY'|'CAPABILITY_PROBE'|'FILESYSTEM_METADATA'|'REPOSITORY_METADATA'|'HISTORICAL_LOG'|'PERMISSION'|'INFERENCE';at:string;permissionId:string;category:EstateCategory;probe:string|null;result:'PASS'|'FAIL'|'OBSERVATION'|'DENIED'|'UNKNOWN';digest:string;runId:string;activityRef:string;ledgerRef:string;}
export interface EstateEntity {id:string;kind:EstateKind;label:string;state:EstateState;hostId:string|null;attributes:Record<string,string|number|boolean|null>;firstSeen:string;lastSeen:string;evidence:EstateEvidence[];capabilities:Record<string,'PASS'|'FAIL'|'UNKNOWN'>;factoryId:string|null;lastSuccessfulDiscovery?:string|null;}
export interface EstateRelationship {id:string;from:string;to:string;kind:string;layer:'PHYSICAL'|'LOGICAL';basis:'OBSERVED'|'CONFIGURED'|'INFERRED'|'VERIFIED'|'HISTORICAL'|'DECLARED'|'STALE';state:EstateState;firstSeen:string;lastSeen:string;evidence:EstateEvidence[];}
export interface EstateEvent {schema:'agent-control.estate-event/v1';sequence:number;id:string;at:string;runId:string;type:string;caption:string;entity?:EstateEntity;relationship?:EstateRelationship;previousHash:string|null;sha256:string;}
export interface EstateSnapshot {schema:'agent-control.estate/v1';id:string;runId:string;permissionId:string;scopeDigest:string;startedAt:string;completedAt:string|null;status:'RUNNING'|'COMPLETED'|'PARTIAL'|'FAILED';entities:EstateEntity[];relationships:EstateRelationship[];events:EstateEvent[];diff:EstateDifference[];coverage:string[];scanId:string|null;comparison?:EstateComparison;}
export interface EstateDifference {id:string;change:'NEW'|'REMOVED'|'CHANGED'|'UNREACHABLE'|'RECOVERED'|'CAPABILITY_ADDED'|'CAPABILITY_LOST'|'MODEL_ADDED'|'MODEL_REMOVED'|'SERVICE_CHANGED'|'CONFIGURATION_CHANGED'|'NOT_REOBSERVED';basis:string;}
export const estateHash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const estateSafe=<T>(v:T):T=>redactSensitiveValue(v) as T;
const current=(s:EstateState)=>['OBSERVED','IDENTIFIED','VERIFIED','CAPABILITY_VERIFIED','AVAILABLE','RECOVERED'].includes(s);
export function estateDiff(previous:EstateSnapshot|null,next:EstateSnapshot):EstateDifference[]{
 if(!previous){const added:EstateDifference[]=next.entities.map(e=>({id:e.id,change:e.kind==='model'?'MODEL_ADDED':'NEW',basis:'First observation in retained history'}));return [...added,...next.relationships.map((r):EstateDifference=>({id:r.id,change:'NEW',basis:'First relationship observation in retained history'}))];}
 if(previous.scopeDigest!==next.scopeDigest)return [{id:next.id,change:'CHANGED',basis:'Scope changed; absence is not comparable'}];
 const changes:EstateDifference[]=[];const old=new Map(previous.entities.map(e=>[e.id,e]));
 for(const e of next.entities){const p=old.get(e.id);old.delete(e.id);if(!p){changes.push({id:e.id,change:e.kind==='model'?'MODEL_ADDED':'NEW',basis:'New evidence'});continue;}
  if(e.state==='STALE'&&p.state!=='STALE')changes.push({id:e.id,change:'NOT_REOBSERVED',basis:'Retained stale evidence; removal is unproven'});
  else if(['UNREACHABLE','TIMED_OUT'].includes(e.state)&&!['UNREACHABLE','TIMED_OUT'].includes(p.state))changes.push({id:e.id,change:'UNREACHABLE',basis:'Contact attempt failed; not removal'});
  else if(['UNREACHABLE','TIMED_OUT','INVALID_RESPONSE','UNAUTHORISED','STALE','CANCELLED'].includes(p.state)&&current(e.state))changes.push({id:e.id,change:'RECOVERED',basis:'Current observation after failed contact'});
  else if(estateHash([p.state,p.attributes])!==estateHash([e.state,e.attributes]))changes.push({id:e.id,change:e.kind==='service'?'SERVICE_CHANGED':e.state==='EXPECTED'?'CONFIGURATION_CHANGED':'CHANGED',basis:'State or metadata changed'});
  for(const [cap,result] of Object.entries(e.capabilities)){if(result==='PASS'&&p.capabilities[cap]!=='PASS')changes.push({id:e.id,change:'CAPABILITY_ADDED',basis:cap});else if(result==='FAIL'&&p.capabilities[cap]==='PASS')changes.push({id:e.id,change:'CAPABILITY_LOST',basis:`${cap}: current probe failed`});}
 }
 // Removal needs an authoritative tombstone, never failed contact or omission.
 for(const e of old.values())changes.push({id:e.id,change:'NOT_REOBSERVED',basis:'No current evidence; removal unproven'});
 for(const e of next.events.filter(e=>e.type==='REMOVAL_CONFIRMED'&&e.entity))changes.push({id:e.entity!.id,change:e.entity!.kind==='model'?'MODEL_REMOVED':'REMOVED',basis:e.caption});
 const oldEdges=new Map(previous.relationships.map(r=>[r.id,r]));for(const r of next.relationships){const p=oldEdges.get(r.id);if(!p||estateHash([p.state,p.basis])!==estateHash([r.state,r.basis]))changes.push({id:r.id,change:p?'CHANGED':'NEW',basis:'Relationship evidence changed independently'});}
 return changes;
}
export interface EstateComparison {baselineSnapshotId:string|null;scopeComparable:boolean;records:Array<{id:string;kind:'HOST'|'ENTITY'|'RELATIONSHIP';changes:string[];evidenceRefs:string[]}>;}
export function estateComparison(previous:EstateSnapshot|null,next:EstateSnapshot):EstateComparison {
 const changes=estateDiff(previous,next),comparable=!previous||previous.scopeDigest===next.scopeDigest;
 const byId=new Map<string,string[]>();for(const change of changes){const values=byId.get(change.id)??[];values.push(change.change);byId.set(change.id,values);}
 const records:EstateComparison['records']=[];
 for(const value of [...next.entities,...next.relationships]){const own=byId.get(value.id)??[];records.push({id:value.id,kind:'from' in value?'RELATIONSHIP':value.kind==='host'?'HOST':'ENTITY',changes:comparable?(own.length?own:['UNCHANGED']):['SCOPE_CHANGED'],evidenceRefs:value.evidence.map(e=>e.id)});}
 return{baselineSnapshotId:previous?.id??null,scopeComparable:comparable,records};
}
function comparisonProjection(value:EstateComparison|undefined){if(!value)return null;return{...value,records:value.records.slice(0,200),totalRecords:value.records.length,unchanged:value.records.filter(r=>r.changes.includes('UNCHANGED')).length};}
export function assertEstateEvidence(state:EstateState,e:EstateEvidence){
 if(['VERIFIED','CAPABILITY_VERIFIED','AVAILABLE','RECOVERED'].includes(state)&&(e.result!=='PASS'||!e.probe||['CONFIGURATION','HISTORICAL_LOG','INFERENCE','PERMISSION'].includes(e.type)))throw Error('estate_verification_requires_current_probe');
 if(state==='CAPABILITY_VERIFIED'&&(e.type!=='CAPABILITY_PROBE'||e.category!=='CAPABILITY_PROBES'))throw Error('estate_capability_requires_authorised_probe');
 if(e.type==='HISTORICAL_LOG'&&state!=='HISTORICALLY_OBSERVED')throw Error('estate_historical_evidence_is_not_current');
 if(state==='BLOCKED'&&e.result!=='DENIED')throw Error('estate_blocked_requires_permission_denial');
}
export function estateProjection(snapshot:EstateSnapshot|null,stale=false,query=''):FactoryProjection {
 const all=snapshot?.entities??[],matches=all.filter(e=>!query||`${e.id} ${e.label} ${e.state}`.toLowerCase().includes(query.toLowerCase()));
 const selected=matches.slice().sort((a,b)=>(a.kind==='host'?-1:b.kind==='host'?1:0)||(a.kind==='service'?1:b.kind==='service'?-1:0)).slice(0,600),ids=new Set(selected.map(e=>e.id)),edges=(snapshot?.relationships??[]).filter(e=>ids.has(e.from)&&ids.has(e.to)).slice(0,1000);
 const entities:FactoryEntity[]=selected.map(e=>({id:e.id,sourceId:e.id,kind:e.kind as FactoryKind,label:e.label,state:stale&&current(e.state)?'STALE':e.state,laneId:e.hostId,runId:snapshot!.runId,workerId:e.kind==='worker'?e.id.slice(7):null,modelId:e.kind==='model'?e.attributes.modelId as string:null,providerId:null,at:e.lastSeen,metrics:{},detail:{...e,evidence:undefined,executionAuthority:'UNCHANGED_BY_DISCOVERY',howDoWeKnow:e.evidence,stale},links:[{kind:'run',id:snapshot!.runId,label:'Open native discovery Job'}]}));
 return {schema:'agent-control.factory/v1',observedAt:snapshot?.events.at(-1)?.at??new Date().toISOString(),authority:'READ_ONLY_RUNTIME_PROJECTION',domain:'ESTATE',estate:{snapshotId:snapshot?.id??null,runId:snapshot?.runId??null,status:snapshot?.status??'EMPTY',diff:snapshot?.diff.slice(0,200)??[],comparison:comparisonProjection(snapshot?.comparison),relationships:edges,stale,totalEntities:all.length,matchedEntities:matches.length},entities,relations:edges.map(r=>({id:r.id,from:r.from,to:r.to,kind:'evidence',sourceId:r.id,state:r.state,basis:r.basis,layer:r.layer,label:r.kind})),events:(snapshot?.events??[]).slice(-100).map(e=>({id:e.id,at:e.at,kind:e.type,entityId:e.entity?.id??e.relationship?.to??null,caption:e.caption,sourceId:e.id})),coverage:{omittedEntities:Math.max(0,matches.length-entities.length),limits:{entities:600,runs:1,invocations:0},limitations:snapshot?.coverage??['No current discovery evidence.']}};
}

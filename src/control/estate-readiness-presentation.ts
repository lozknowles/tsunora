import type {DiscoveryItem,DiscoveryScan} from './environment-discovery.js';
import {estateObservationState,ESTATE_FRESHNESS_MS} from './estate-map.js';
import type {DeclaredReadiness,ExecutionAdmission} from './job-estate-readiness.js';

export const GAP_ACTIONS = {
  CAPABILITY_ABSENT:'Review the missing capability and propose a suitable implementation.',
  RESOURCE_NOT_DISCOVERED:'Run an authorised discovery of the intended target.',
  RESOURCE_OFFLINE:'Check the expected resource and restore it through an approved operation.',
  RESOURCE_STALE:'Refresh the cheap native observation; do not reuse expired evidence.',
  TRANSPORT_UNAVAILABLE:'Review the recorded transport failure and propose a connectivity check.',
  AUTHENTICATION_REQUIRED:'Ask the operator to authenticate the exact account and target.',
  CREDENTIAL_REQUIRED:'Ask the operator to configure the required credential reference securely.',
  CONNECTOR_REQUIRED:'Propose a compatible connector for operator review.',
  QUALIFICATION_REQUIRED:'Run a separately authorised qualification for this capability and configuration.',
  QUALIFICATION_FAILED:'Inspect the immutable failed evidence before proposing a new qualification.',
  ADMISSION_EXPIRED:'Obtain a new independently verified execution admission.',
  APPROVAL_REQUIRED:'Request target and input bound approval before execution.',
  CONFIGURATION_REQUIRED:'Review the missing configuration with the operator.',
  DEPENDENCY_UNAVAILABLE:'Inspect the unavailable device or dependency before proceeding.',
  UNKNOWN:'Collect authoritative evidence; the current observation does not establish the cause.',
} as const;
export type GapCode=keyof typeof GAP_ACTIONS;
export interface ReadinessGap {code:GapCode;requirement:string;resourceId?:string;explanation:string;nextAction:string;actionMode:'PROPOSAL_ONLY';}
const gap=(code:GapCode,requirement:string,explanation:string,resourceId?:string):ReadinessGap=>({code,requirement,...(resourceId?{resourceId}:{}),explanation,nextAction:GAP_ACTIONS[code],actionMode:'PROPOSAL_ONLY'});

/** Native observations only. Missing inventory is not proof of global absence. */
export function resourceGaps(item:DiscoveryItem,scan:DiscoveryScan,now:Date,requirement=item.id):ReadinessGap[] {
  const state=estateObservationState(item,+now),out:ReadinessGap[]=[];
  const add=(code:GapCode,text:string)=>out.push(gap(code,requirement,text,item.id));
  if(state.lastAuthoritativeObservation&&!state.fresh) add('RESOURCE_STALE','Authoritative observation has expired or is dated in the future.');
  if(!state.lastAuthoritativeObservation) add('UNKNOWN','Configuration or presence has not been verified by a current native observation.');
  if(['OFFLINE','UNAVAILABLE'].includes(item.health)||item.operationalState==='UNAVAILABLE') add('RESOURCE_OFFLINE','Native inventory reports the resource unavailable.');
  if(['UNAVAILABLE','FAILED'].includes(String(item.attributes.transportState))) add('TRANSPORT_UNAVAILABLE','Native transport status reports failure.');
  if(['AUTHENTICATION_REQUIRED','INVALID','EXPIRED'].includes(state.authentication)) add('AUTHENTICATION_REQUIRED','The exact resource authentication is missing, invalid or expired.');
  if(item.kind==='CREDENTIAL'&&['NOT_CONFIGURED','MISSING'].includes(state.authentication)) add('CREDENTIAL_REQUIRED','The credential reference is not configured.');
  if(item.attributes.qualificationState==='FAILED') add('QUALIFICATION_FAILED','The recorded qualification failed; this evidence remains immutable.');
  else if(!['QUALIFIED','ACTIVE'].includes(item.lifecycle)||!state.fresh) add('QUALIFICATION_REQUIRED','Current capability qualification has not been established by this observation.');
  if(item.attributes.configured===false) add('CONFIGURATION_REQUIRED','The native adapter reports incomplete configuration.');
  const parent=scan.items.find(i=>i.kind==='MACHINE'&&i.nodeId===item.nodeId);
  if(item.kind!=='MACHINE'&&(!parent||!estateObservationState(parent,+now).alive)) add('DEPENDENCY_UNAVAILABLE',parent?'The containing device is not currently verified alive.':'The containing device has not been discovered.');
  return out;
}

export function classifyReadinessGaps(declared:DeclaredReadiness,scan:DiscoveryScan,admissions:ExecutionAdmission[],admitted:ExecutionAdmission|undefined,now:Date) {
  const gaps:ReadinessGap[]=[];
  for(const r of declared.requirements) {
    for(const binding of r.evidence) {
      const item=scan.items.find(i=>i.id===binding.resourceId);
      if(!item) {gaps.push(gap('RESOURCE_NOT_DISCOVERED',r.requirement,'The bound resource is absent from this discovery scope.',binding.resourceId));continue;}
      // Resource qualification and job admission are separate: do not mark a satisfied
      // capability blocked solely because its inventory lifecycle remains DISCOVERED.
      gaps.push(...resourceGaps(item,scan,now,r.requirement).filter(g=>g.code!=='QUALIFICATION_REQUIRED'));
      if(binding.confidence==='STALE'||binding.evidence.expiresAt&&Date.parse(binding.evidence.expiresAt)<=+now) gaps.push(gap('RESOURCE_STALE',r.requirement,'Capability evidence has expired.',item.id));
      if(!r.satisfied&&['OBSERVED','DECLARED'].includes(binding.confidence)) gaps.push(gap('QUALIFICATION_REQUIRED',r.requirement,'Presence or declaration does not prove this capability.',item.id));
      if(binding.confidence==='FAILED') gaps.push(gap('UNKNOWN',r.requirement,'The capability probe failed; this does not itself establish a failed qualification.',item.id));
    }
    if(!r.satisfied) {
      if(r.type==='connector') gaps.push(gap('CONNECTOR_REQUIRED',r.requirement,'No verified connector binding satisfies this requirement.'));
      else if(r.type==='credential') gaps.push(gap('CREDENTIAL_REQUIRED',r.requirement,'No verified credential and scope binding satisfies this requirement.'));
      else if(!r.evidence.length) {
        gaps.push(gap('CAPABILITY_ABSENT',r.requirement,'No capability implementation is registered in this discovery scope; this is not a claim of global absence.'));
        gaps.push(gap('RESOURCE_NOT_DISCOVERED',r.requirement,'No resource binding for this capability was discovered.'));
      }
    }
  }
  for(const r of declared.reasons) {
    if(r.state==='CONFIGURATION_REQUIRED') gaps.push(gap('CONFIGURATION_REQUIRED',r.requirement,'Required operator configuration is incomplete.'));
    else if(/placement|platform|colocation|insufficient/.test(r.code)) gaps.push(gap('DEPENDENCY_UNAVAILABLE',r.requirement,'No compatible placement satisfies the required dependencies.'));
    else if(/partial|future/.test(r.code)) gaps.push(gap('UNKNOWN',r.requirement,'The discovery scan is incomplete or has an invalid observation time.'));
  }
  if(!admitted) {
    const expired=admissions.filter(a=>a.jobDigest===declared.jobDigest&&Number.isFinite(Date.parse(a.expiresAt))&&Date.parse(a.expiresAt)<=+now);
    gaps.push(gap(expired.length?'ADMISSION_EXPIRED':'QUALIFICATION_REQUIRED',declared.id,expired.length?'The recorded execution admission has expired. Historical success does not extend it.':'No current, configuration-bound execution admission satisfies this job.'));
  }
  if(declared.authority.state==='APPROVAL_REQUIRED') gaps.push(gap('APPROVAL_REQUIRED',declared.id,'Execution requires a separate target and input bound approval.'));
  return [...new Map(gaps.map(g=>[`${g.code}:${g.requirement}:${g.resourceId??''}`,g])).values()];
}

// Explicit graph-client metadata contract. Never forward arbitrary adapter attributes.
const SAFE_KEYS=['deploymentProfile','androidVersion','computeClass','cpuModel','availableMemoryBytes','batteryPercent','charging','thermalCelsius','metered','backgroundReliability','accelerator','controllerLocation','localModelRequired','executionLocality','identityAuthority','controllerRelationship','platform','architecture','transport','privateTransport','port','authenticationMethod','authenticationState','authorizationState','credentialStatus','installed','configured','present','status','version','runtime','providerId','capabilities','cpuLogical','totalMemoryBytes','diskAvailableBytes','probePassed','lastSuccessfullyVerifiedAt','qualificationState','transportState'] as const;
export function safeEstateAttributes(attributes:Record<string,unknown>) {
  const out:Record<string,string|number|boolean>={};
  for(const key of SAFE_KEYS) {
    const value=attributes[key];
    if(typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)) out[key]=value;
    else if(typeof value==='string'&&value.length<=256&&!/[\r\n]/.test(value)) out[key]=value;
  }
  // Native mobile/remote resource observations are numeric capacities, never arbitrary adapter text.
  for(const key of ['memoryTotalBytes','memoryAvailableBytes','storageAvailableBytes','diskTotalBytes']) {
    const value=attributes[key];
    if(typeof value==='number'&&Number.isFinite(value)&&value>=0) out[key]=value;
  }
  for(const key of ['address','endpoint','baseUrl','url']) {
    const value=attributes[key];if(typeof value!=='string')continue;
    try {const u=new URL(value);if(['http:','https:','ssh:'].includes(u.protocol))out[key]=`${u.protocol}//${u.hostname}${u.port?`:${u.port}`:''}`;}
    catch {if(key==='address'&&/^[a-zA-Z0-9.:[\]-]{1,253}$/.test(value))out[key]=value;}
  }
  return out;
}

export function resourcePresentation(item:DiscoveryItem,scan:DiscoveryScan,now:Date) {
  const observation=estateObservationState(item,+now),gaps=resourceGaps(item,scan,now);
  const alive=observation.alive&&!gaps.some(g=>g.code==='DEPENDENCY_UNAVAILABLE');
  const failure=observation.fresh&&gaps.some(g=>['AUTHENTICATION_REQUIRED','TRANSPORT_UNAVAILABLE','QUALIFICATION_FAILED'].includes(g.code)||g.code==='RESOURCE_OFFLINE'&&Boolean(item.configuredId));
  const colour=failure?'RED':!alive?'GREY':gaps.length||!['QUALIFIED','ACTIVE'].includes(item.lifecycle)?'ORANGE':'GREEN';
  return {alive,colour,blockers:gaps,markers:[...(gaps.some(g=>['QUALIFICATION_REQUIRED','QUALIFICATION_FAILED'].includes(g.code))?['UNQUALIFIED']:[]),...(item.change==='NEW'?['NEW']:[]),...(item.attributes.configured===false?['CONFIG']:[])],
    observationExpiresAt:observation.lastAuthoritativeObservation?new Date(Date.parse(observation.lastAuthoritativeObservation)+ESTATE_FRESHNESS_MS[item.kind]).toISOString():null};
}

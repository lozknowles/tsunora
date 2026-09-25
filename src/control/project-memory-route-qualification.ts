import fs from 'node:fs';
import path from 'node:path';
import type {MemoryRouteIdentity} from './project-memory.js';

export type MemoryRouteTerminalClassification='PASS'|'FIXED'|'UNSUPPORTED'|'DISPROVEN'|'BLOCKED_EXTERNAL';
export type MemoryRoleEligibility='QUALIFIED'|'UNSUPPORTED'|'BLOCKED_EXTERNAL';
export interface MemoryRoleQualification {eligibility:MemoryRoleEligibility;maximumProvenMemoryBytes:number|null;permittedRepairCount:number;reason:string;}
export interface MemoryRouteQualificationRecord {
  schema:'agent-control.memory-route-qualification/v1';
  route:MemoryRouteIdentity;
  runtimeVersion:string;
  contractVersion:string;
  writer:MemoryRoleQualification;
  reader:MemoryRoleQualification;
  terminalClassification:MemoryRouteTerminalClassification;
  qualifiedAt:string;
  expiresAt:string;
  requiredEscalationRoute?:MemoryRouteIdentity;
  evidence:string[];
}
export interface MemoryPairQualificationRecord {
  schema:'agent-control.memory-pair-qualification/v1';
  writer:MemoryRouteIdentity;
  reader:MemoryRouteIdentity;
  contractVersion:string;
  eligibility:MemoryRoleEligibility;
  terminalClassification:MemoryRouteTerminalClassification;
  maximumProvenMemoryBytes:number|null;
  permittedRepairCount:number;
  qualifiedAt:string;
  expiresAt:string;
  reason:string;
  requiredEscalationPair?:{writer:MemoryRouteIdentity;reader:MemoryRouteIdentity};
  evidence:string[];
}
export interface MemoryPairAssessment {
  decision:'ALLOW'|'ESCALATE'|'DENY';
  requested:{writer:MemoryRouteIdentity;reader:MemoryRouteIdentity};
  selected:{writer:MemoryRouteIdentity;reader:MemoryRouteIdentity}|null;
  reasons:string[];
  permittedRepairCount:number;
  records:Array<{role:'writer'|'reader';routeKey:string;terminalClassification:MemoryRouteTerminalClassification;evidence:string[]}>;
}

export class MemoryRouteQualificationStore {
  private readonly records=new Map<string,MemoryRouteQualificationRecord>();
  private readonly pairings=new Map<string,MemoryPairQualificationRecord>();
  constructor(readonly file?:string){if(!file||!fs.existsSync(file))return;const value=JSON.parse(fs.readFileSync(file,'utf8')) as {version:1;records:MemoryRouteQualificationRecord[];pairings:MemoryPairQualificationRecord[]};if(value.version!==1||!Array.isArray(value.records)||!Array.isArray(value.pairings))throw new Error('memory_route_qualification_state_invalid');for(const record of value.records){validate(record);this.records.set(key(record.route,record.contractVersion),structuredClone(record));}for(const pairing of value.pairings){validatePair(pairing);this.pairings.set(pairKey(pairing,pairing.contractVersion),structuredClone(pairing));}}
  list(){return[...this.records.values()].map(record=>structuredClone(record)).sort((a,b)=>key(a.route,a.contractVersion).localeCompare(key(b.route,b.contractVersion)));}
  listPairings(){return[...this.pairings.values()].map(record=>structuredClone(record)).sort((a,b)=>pairKey(a,a.contractVersion).localeCompare(pairKey(b,b.contractVersion)));}
  get(route:MemoryRouteIdentity,contractVersion:string){const value=this.records.get(key(route,contractVersion));return value?structuredClone(value):undefined;}
  set(record:MemoryRouteQualificationRecord){validate(record);this.records.set(key(record.route,record.contractVersion),structuredClone(record));this.save();return this.get(record.route,record.contractVersion)!;}
  setPair(record:MemoryPairQualificationRecord){validatePair(record);this.pairings.set(pairKey(record,record.contractVersion),structuredClone(record));this.save();return structuredClone(record);}
  assess(input:{writer:MemoryRouteIdentity;reader:MemoryRouteIdentity;contractVersion:string;memoryBytes:number;now?:string;alternatives?:Array<{writer:MemoryRouteIdentity;reader:MemoryRouteIdentity}>}):MemoryPairAssessment{
    if(!Number.isInteger(input.memoryBytes)||input.memoryBytes<0)throw new Error('memory_route_size_invalid');
    const requested={writer:structuredClone(input.writer),reader:structuredClone(input.reader)},exact=this.exact(requested,input.contractVersion,input.memoryBytes,input.now);
    if(!exact.reasons.length)return{decision:'ALLOW',requested,selected:requested,...exact};
    const derived=this.derivedAlternatives(requested,input.contractVersion),alternatives=[...(input.alternatives??[]),...derived];
    for(const candidate of uniquePairs(alternatives)){const assessed=this.exact(candidate,input.contractVersion,input.memoryBytes,input.now);if(!assessed.reasons.length)return{decision:'ESCALATE',requested,selected:structuredClone(candidate),reasons:exact.reasons,permittedRepairCount:assessed.permittedRepairCount,records:[...exact.records,...assessed.records]};}
    return{decision:'DENY',requested,selected:null,...exact};
  }
  private exact(pair:{writer:MemoryRouteIdentity;reader:MemoryRouteIdentity},contractVersion:string,memoryBytes:number,now=new Date().toISOString()){
    const writer=this.get(pair.writer,contractVersion),reader=this.get(pair.reader,contractVersion),pairing=this.pairings.get(pairKey(pair,contractVersion)),reasons:string[]=[],records:MemoryPairAssessment['records']=[];
    const check=(role:'writer'|'reader',record:MemoryRouteQualificationRecord|undefined)=>{if(!record){reasons.push(`${role}-qualification-missing`);return 0;}records.push({role,routeKey:routeKey(record.route),terminalClassification:record.terminalClassification,evidence:[...record.evidence]});if(Date.parse(record.expiresAt)<=Date.parse(now))reasons.push(`${role}-qualification-stale`);const value=record[role];if(value.eligibility!=='QUALIFIED')reasons.push(`${role}-${value.eligibility.toLowerCase().replace('_','-')}`);if(value.maximumProvenMemoryBytes!==null&&memoryBytes>value.maximumProvenMemoryBytes)reasons.push(`${role}-memory-size-unproven`);return value.permittedRepairCount;};
    const repairs=[check('writer',writer),check('reader',reader)];if(!pairing)reasons.push('pair-qualification-missing');else{if(Date.parse(pairing.expiresAt)<=Date.parse(now))reasons.push('pair-qualification-stale');if(pairing.eligibility!=='QUALIFIED')reasons.push(`pair-${pairing.eligibility.toLowerCase().replace('_','-')}`);if(pairing.maximumProvenMemoryBytes!==null&&memoryBytes>pairing.maximumProvenMemoryBytes)reasons.push('pair-memory-size-unproven');repairs.push(pairing.permittedRepairCount);}return{reasons,permittedRepairCount:Math.min(...repairs),records};
  }
  private derivedAlternatives(pair:{writer:MemoryRouteIdentity;reader:MemoryRouteIdentity},contractVersion:string){const pairing=this.pairings.get(pairKey(pair,contractVersion)),writer=this.get(pair.writer,contractVersion),reader=this.get(pair.reader,contractVersion),output:Array<{writer:MemoryRouteIdentity;reader:MemoryRouteIdentity}>=[];if(pairing?.requiredEscalationPair)output.push(pairing.requiredEscalationPair);if(writer?.requiredEscalationRoute)output.push({writer:writer.requiredEscalationRoute,reader:pair.reader});if(reader?.requiredEscalationRoute)output.push({writer:pair.writer,reader:reader.requiredEscalationRoute});return output;}
  private save(){if(!this.file)return;fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});const temporary=`${this.file}.${process.pid}.tmp`;fs.writeFileSync(temporary,`${JSON.stringify({version:1,records:this.list(),pairings:this.listPairings()},null,2)}\n`,{mode:0o600});fs.renameSync(temporary,this.file);}
}

function validate(record:MemoryRouteQualificationRecord){if(record.schema!=='agent-control.memory-route-qualification/v1'||!record.contractVersion.trim()||!record.runtimeVersion.trim())throw new Error('memory_route_qualification_invalid');validateRoute(record.route);if(record.requiredEscalationRoute)validateRoute(record.requiredEscalationRoute);for(const role of [record.writer,record.reader]){if(!Number.isInteger(role.permittedRepairCount)||role.permittedRepairCount<0||role.permittedRepairCount>3||role.maximumProvenMemoryBytes!==null&&(!Number.isInteger(role.maximumProvenMemoryBytes)||role.maximumProvenMemoryBytes<1)||!role.reason.trim())throw new Error('memory_role_qualification_invalid');}if(!Number.isFinite(Date.parse(record.qualifiedAt))||!Number.isFinite(Date.parse(record.expiresAt))||Date.parse(record.expiresAt)<=Date.parse(record.qualifiedAt)||!record.evidence.length||record.evidence.some(item=>!item.trim()))throw new Error('memory_route_qualification_evidence_invalid');}
function validatePair(record:MemoryPairQualificationRecord){if(record.schema!=='agent-control.memory-pair-qualification/v1'||!record.contractVersion.trim()||!record.reason.trim()||!Number.isInteger(record.permittedRepairCount)||record.permittedRepairCount<0||record.permittedRepairCount>3||record.maximumProvenMemoryBytes!==null&&(!Number.isInteger(record.maximumProvenMemoryBytes)||record.maximumProvenMemoryBytes<1))throw new Error('memory_pair_qualification_invalid');validateRoute(record.writer);validateRoute(record.reader);if(record.requiredEscalationPair){validateRoute(record.requiredEscalationPair.writer);validateRoute(record.requiredEscalationPair.reader);}if(!Number.isFinite(Date.parse(record.qualifiedAt))||!Number.isFinite(Date.parse(record.expiresAt))||Date.parse(record.expiresAt)<=Date.parse(record.qualifiedAt)||!record.evidence.length||record.evidence.some(item=>!item.trim()))throw new Error('memory_pair_qualification_evidence_invalid');}
function validateRoute(route:MemoryRouteIdentity){if(!route.providerId.trim()||!route.modelId.trim()||!route.nodeId.trim()||route.accountProfileId!==undefined&&!route.accountProfileId.trim())throw new Error('memory_route_identity_invalid');}
function key(route:MemoryRouteIdentity,contractVersion:string){return`${routeKey(route)}\u0000${contractVersion}`;}
function pairKey(pair:{writer:MemoryRouteIdentity;reader:MemoryRouteIdentity},contractVersion:string){return`${routeKey(pair.writer)}→${routeKey(pair.reader)}\u0000${contractVersion}`;}
export function routeKey(route:MemoryRouteIdentity){return`${route.providerId}/${route.accountProfileId??'default'}/${route.modelId}@${route.nodeId}`;}
function uniquePairs(values:Array<{writer:MemoryRouteIdentity;reader:MemoryRouteIdentity}>){const seen=new Set<string>();return values.filter(value=>{const id=`${routeKey(value.writer)}→${routeKey(value.reader)}`;if(seen.has(id))return false;seen.add(id);return true;});}

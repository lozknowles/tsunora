import {createHash} from 'node:crypto';
import type {PoeEvidenceResult, PoeGroundedFact} from './poe.js';

export type ResponseDependency='CURRENT_STATE'|'HISTORICAL'|'CONVERSATION'|'UNKNOWN';
export type ConversationAct='GREETING'|'ACKNOWLEDGEMENT'|'FAREWELL'|'CLARIFICATION';
export interface GroundingRecord {
 schema:'agent-control.response-grounding/v1';requestId:string;requestSha256:string;evaluatedAt:string;
 proposedDependency:ResponseDependency|'UNSPECIFIED';resolvedDependency:'CURRENT_STATE'|'RETAINED_EVIDENCE'|'MIXED'|'CONVERSATION'|'UNVERIFIED';
 enforcement:'EVIDENCE_PROJECTION';modelProseUsed:false;modelResponseSha256?:string;
 claims:Array<{label:string;kind:string;observedAt:string|null;evidence:string[];factSha256:string}>;
 exclusions:Array<{label:string;reason:string}>;toolState?:'FAILED'|'TIMEOUT';
}
export interface ResponseSelection {informationKind?:ResponseDependency;speechAct?:ConversationAct;text:string;citations:string[];}
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const acts:Record<ConversationAct,string>={GREETING:'Hello. What would you like to discuss?',ACKNOWLEDGEMENT:"You're welcome.",FAREWELL:'Goodbye.',CLARIFICATION:'Which system, service, run or topic do you mean?'};
export const statusUnverified="I cannot verify current status from the available evidence. Please identify the system, service or run, or ask about a retained record.";

/** Model categories and citations are proposals, never authority to emit factual prose.
 * All factual clauses are rendered from typed records. No phrase blacklist or second
 * model-classifier veto is used. Unresolved intent cannot lower this requirement. */
export function projectResponse(input:{requestId:string;request:string;evidence:PoeEvidenceResult;now:string;selection?:ResponseSelection;maxAgeMs?:number;toolState?:'FAILED'|'TIMEOUT'}) {
 const {selection,evidence}=input,now=Date.parse(input.now),maxAge=Math.min(60000,Math.max(0,input.maxAgeMs??60000));
 const record:GroundingRecord={schema:'agent-control.response-grounding/v1',requestId:input.requestId,requestSha256:hash(input.request),evaluatedAt:input.now,proposedDependency:selection?.informationKind??'UNSPECIFIED',resolvedDependency:'UNVERIFIED',enforcement:'EVIDENCE_PROJECTION',modelProseUsed:false,claims:[],exclusions:[],...(selection?{modelResponseSha256:hash(selection)}:{}),...(input.toolState?{toolState:input.toolState}:{})};
 // A closed social response carries no arbitrary factual prose, even if the
 // knowledge adapter supplied an unavailable-record envelope.
 if(!input.toolState&&selection?.informationKind==='CONVERSATION'&&selection.speechAct&&Object.hasOwn(acts,selection.speechAct)&&!evidence.reference&&evidence.facts.every(f=>f.informationKind==='UNAVAILABLE')){record.resolvedDependency='CONVERSATION';return{text:acts[selection.speechAct],record};}
 const selected=selection?.citations.length?evidence.facts.filter(f=>selection.citations.includes(f.label)||f.evidence.some(r=>selection.citations.includes(r))):evidence.facts;
 const sections=new Map<string,string[]>();
 for(const fact of selected){
  let category:string|undefined,reason:string|undefined;
  if(fact.informationKind==='UNAVAILABLE'&&fact.authority==='UNAVAILABLE'&&fact.evidence.length)category='Unavailable / limitation';
  else if(fact.authority!=='AGENT_CONTROL'||!fact.evidence.length)reason='authoritative_source_required';
  else if(fact.informationKind==='LIVE_OBSERVED'){
   const at=Date.parse(fact.observedAt??'');
   if(!Number.isFinite(now)||!Number.isFinite(at)||at>now||now-at>maxAge)reason='current_observation_stale_or_undated';
   else if(selection?.informationKind==='HISTORICAL')reason='live_observation_is_not_historical';
   else if(fact.value===null)reason='value_unavailable';
   else category='Current recorded observations';
  }else if(fact.informationKind==='HISTORICAL_EVIDENCE')category='Historical evidence — not current status';
  else if(fact.informationKind==='DOCUMENTATION')category='Documented information — not a live observation';
  else if(fact.informationKind==='CONFIGURED_CAPABILITY')category='Configured capability — not evidence of current activity';
  else reason='observation_kind_unavailable';
  // A request-level dependency cannot erase a separately labelled historical claim.
  // Retained records remain explicitly non-current; they never satisfy a live claim.
  if(reason||!category){record.exclusions.push({label:fact.label,reason:reason??'unavailable'});continue;}
  const lines=sections.get(category)??[];lines.push(`${fact.label}: ${displayValue(fact)}${category==='Current recorded observations'?` (observed ${fact.observedAt})`:''}`);sections.set(category,lines);
  record.claims.push({label:fact.label,kind:fact.informationKind!,observedAt:fact.observedAt??null,evidence:[...fact.evidence],factSha256:hash(fact)});
 }
 if(sections.size){
  const live=sections.has('Current recorded observations');record.resolvedDependency=live?(sections.size===1?'CURRENT_STATE':'MIXED'):'RETAINED_EVIDENCE';
  const text=[...sections].map(([name,lines])=>`${name}:\n${lines.join('\n')}`).join('\n\n');
  const limitation=input.toolState?`The evidence lookup ${input.toolState==='TIMEOUT'?'timed out':'failed'}. I don't have a current observation for this request.`:selection?.informationKind==='CURRENT_STATE'&&!live?"I don't have a current observation for this request.":undefined;
  return {text:`Evidence source: ${evidence.title}\n\n${text}${limitation?`\n\n${limitation}`:''}`,record};
 }
 // Without a proven dependency, clarify rather than asserting that the request
 // requires a live probe. This does not grant permission to use model prose.
 const fallback=selection?.informationKind==='CURRENT_STATE'?statusUnverified:acts.CLARIFICATION;
 return {text:input.toolState?`The evidence lookup ${input.toolState==='TIMEOUT'?'timed out':'failed'}. ${fallback}`:fallback,record};
}
function displayValue(fact:PoeGroundedFact){
 if(fact.value===null)return 'unavailable';
 // Render the retained documentation passage as data, not its storage envelope.
 if(fact.informationKind==='DOCUMENTATION'&&typeof fact.value==='string'){
  try{const value=JSON.parse(fact.value);if(typeof value.text==='string')return value.text;}catch{/* ordinary retained text */}
 }
 return String(fact.value);
}
export async function observeBounded<T>(operation:()=>T|Promise<T>,timeoutMs:number):Promise<{value:T;state?:never}|{value?:never;state:'FAILED'|'TIMEOUT'}>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([Promise.resolve().then(operation).then(value=>({value})),new Promise<{state:'TIMEOUT'}>(resolve=>{timer=setTimeout(()=>resolve({state:'TIMEOUT'}),Math.min(30000,Math.max(10,timeoutMs)));})]);}
 catch{return{state:'FAILED'};}finally{if(timer)clearTimeout(timer);}
}

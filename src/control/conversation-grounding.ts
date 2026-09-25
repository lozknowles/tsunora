import {projectResponse} from './response-grounding.js';
import type {PoeEvidenceResult} from './poe.js';
/** Bounded English claim check, not an entailment proof. Model categories cannot
 * waive it. Operational clauses are replaced by typed records, never paraphrased. */
export function guardResponse(input:{text:string;request:string;evidence:PoeEvidenceResult;now:string;requestId:string;forceProjection?:boolean}){
 const clauses=input.text.split(/(?<=[.!?;])\s+|\n+|,?\s+(?:and|but)\s+(?=(?:ours|it|they|the|our|this|that)\b)/i);
 const status=/\b(?:running|working|listening|online|offline|idle|busy|healthy|unhealthy|available|unavailable|active|inactive|serving|loaded|stopped|completed|finished|succeeded|failed|accepting|ready|empty|clear|broken|operational|up|down)\b/i;
 const finite=/\b(?:is|are|am|was|were|has|have|had|remains?|seems?|looks?|appears?|reports?|runs?|ran|serves?|served|stopped|completed|finished|succeeded|failed|passed|listens?|uses?|used)\b|\b(?:it's|they're|we're|that's)\b/i;
 const operational=/\b(?:worker|server|machine|service|deployment|GPU|CPU|memory|tasks?|jobs?|queue|models?|rack)\b/i;
 const inquiry=/^(?:is|are|has|have|did|does|which|what|how much|how many|can I rely|report|check|tell me whether)\b/i;
 const conceptual=/^(?:explain|define|describe|what (?:is|does) (?:a|an)|how (?:does|do)|why)\b/i;
 const wantsObservation=inquiry.test(input.request.trim())&&operational.test(input.request)&&!conceptual.test(input.request.trim())||/\b(?:right now|current state|currently|at this instant)\b/i.test(input.request);
 const generic=(part:string)=>/^(?:(?:A|An)\s+[^.!?]+\s+(?:performs?|provides?|stores?|accepts?|means?|refers?)\b|\w+\s+means?\b|(?:We|I)\s+can\s+(?:keep\s+)?(?:discuss(?:ing)?|reason|talk|explain|consider)\b)/i.test(part.trim());
 const requires=(part:string)=>{
  // Scope the exemption to a single clause, never a whole mixed reply.
  if(!wantsObservation&&/^(?:if\b|assuming\b|suppose\b|imagine\b|I hope\b|hopefully\b)/i.test(part.trim()))return false;
  if(!wantsObservation&&/\b(?:would|could)\b/i.test(part)&&/\bif\b/i.test(part))return false;
  if(generic(part))return false;
  if(wantsObservation)return true;
  const referentialState=/\b(?:it|they|ours|theirs|this|that|we|our\s+[\w -]+|the\s+[\w -]+)\s+(?:is|are|has|have|remains?)\b/i.test(part);
  return referentialState||finite.test(part)&&status.test(part);
 };
 const rejected=clauses.filter(requires),kept=input.forceProjection?[]:clauses.filter(p=>!requires(p));
 if(!rejected.length&&!input.forceProjection)return {text:input.text,changed:false,record:null};
 const projected=projectResponse({requestId:input.requestId,request:input.request,evidence:input.evidence,now:input.now});
 const hasLive=projected.record.claims.some(c=>c.kind==='LIVE_OBSERVED');
 const currentRequest=/\b(?:now|currently|still|at the moment|right now)\b/i.test(input.request);
 const missing=currentRequest&&!hasLive?"I don't have a current observation for that part of your request.":'';
 return {text:[...kept.filter(x=>x.trim()),projected.text,missing].filter(Boolean).join('\n\n'),changed:true,record:{...projected.record,rejectedClauseCount:rejected.length,preservedClauseCount:kept.length}};
}

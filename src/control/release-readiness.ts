import {z} from 'zod';

const text=z.string().min(1),status=z.enum(['KNOWN_LIMITATION','BLOCKED_EXTERNAL','PARTIAL_SUPPORT','PLATFORM_LIMITATION','FUTURE_WORK']);
export const limitationsSchema=z.object({schema:z.literal('agent-control.known-limitations/v1'),version:text,items:z.array(z.object({id:text,capability:text,status,why:text,userImpact:text,workaround:text,closure:text,releaseBlocking:z.boolean(),evidence:z.array(text).min(1),helpWanted:z.boolean(),impact:z.enum(['OPTIONAL_CAPABILITY','CORE_INSTALLATION','CORE_USABILITY','GOVERNANCE_SECURITY','DATA_INTEGRITY','ADVERTISED_FALSE','REPRODUCIBILITY'])}).strict())}).strict().superRefine((d,c)=>{
  if(new Set(d.items.map(i=>i.id)).size!==d.items.length)c.addIssue({code:'custom',message:'limitation IDs must be unique'});
  for(const item of d.items)if(item.impact!=='OPTIONAL_CAPABILITY'&&!item.releaseBlocking)c.addIssue({code:'custom',message:`core impact cannot be waived as optional: ${item.id}`});
});
export const coreChecks=['regression','typecheck','installation','upgrade','governanceSecurity','estateProcess','distribution','documentation','screenshots','versioning'] as const;
export interface CoreReceipt {version:string;sourceDigest:string;checks:Partial<Record<typeof coreChecks[number],{status:'PASS'|'FAIL'|'NOT_RUN';evidence:string[]}>>;}
export function assessRelease(limitations:unknown,receipt:CoreReceipt,current:{version:string;sourceDigest:string},showcase:'PASS'|'PASS_WITH_LIMITATIONS'|'FAIL') {
  const register=limitationsSchema.parse(limitations),blockers:string[]=[];
  if(register.version!==current.version||receipt.version!==current.version)blockers.push('VERSION_MISMATCH');
  if(receipt.sourceDigest!==current.sourceDigest)blockers.push('SOURCE_CHANGED_SINCE_VALIDATION');
  for(const check of coreChecks)if(receipt.checks[check]?.status!=='PASS'||!receipt.checks[check]?.evidence.length)blockers.push(`CORE_CHECK:${check}`);
  blockers.push(...register.items.filter(i=>i.releaseBlocking).map(i=>i.id));
  const counts=Object.fromEntries(status.options.map(s=>[s,register.items.filter(i=>i.status===s).length]));
  return {coreRelease:blockers.length?'FAIL':'PASS',showcase,releaseBlockers:blockers,knownLimitations:counts,nonBlocking:register.items.filter(i=>!i.releaseBlocking).map(i=>i.id),publication:'REQUIRES_OPERATOR_REVIEW'};
}

import {createHash} from 'node:crypto';
import {z} from 'zod';

/** Decimal strings are canonical accounting values. No binary arithmetic on money. */
function parts(value:string){if(!/^-?\d{1,40}(?:\.\d{1,30})?$/.test(value))throw Error('money_decimal_invalid');const [a,b='']=value.split('.');return {n:BigInt(a+b),s:b.length};}
function decimal(n:bigint,s:number):string{const sign=n<0n?'-':'';let v=(n<0n?-n:n).toString().padStart(s+1,'0');if(s)v=v.slice(0,-s)+'.'+v.slice(-s);return sign+v.replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');}
export const exact=(v:string)=>{const p=parts(v);return decimal(p.n,p.s);};
export function addMoney(a:string,b:string){const x=parts(a),y=parts(b),s=Math.max(x.s,y.s);return decimal(x.n*10n**BigInt(s-x.s)+y.n*10n**BigInt(s-y.s),s);}
export function multiplyDecimal(a:string,b:string){const x=parts(a),y=parts(b);return decimal(x.n*y.n,x.s+y.s);}
export function decimalScale(a:string,places:number){const x=parts(a);return decimal(x.n,x.s+places);}
/** Explicit half-up rounding for charges derived from finite-resolution physical sensors. */
export function measuredMoney(a:string,places=12){const x=parts(a);if(x.s<=places)return decimal(x.n,x.s);const factor=10n**BigInt(x.s-places);return decimal((x.n+factor/2n)/factor,places);}
export function divideDecimal(value:string,divisor:number,places=12){if(!Number.isSafeInteger(divisor)||divisor<=0)throw Error('decimal_divisor_invalid');const p=parts(value),scale=10n**BigInt(places),den=BigInt(divisor)*10n**BigInt(p.s);return decimal((p.n*scale+den/2n)/den,places);}
export function legacyDecimal(n:number){if(!Number.isFinite(n)||n<0)throw Error('legacy_money_invalid');const [base,exponent]=String(n).split('e');if(!exponent)return exact(base!);const p=parts(base!),s=p.s-Number(exponent);return s>=0?decimal(p.n,s):decimal(p.n*10n**BigInt(-s),0);}
const id=z.string().min(1).max(240);
const token=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
const money=z.string().refine(v=>{try{return parts(v).n>=0n;}catch{return false;}},'nonnegative decimal required');
export const semanticsSchema=z.object({id,input:z.enum(['INCLUDES_CACHE','EXCLUDES_CACHE','UNKNOWN']),reasoning:z.enum(['IN_OUTPUT','ADDITIONAL','UNKNOWN']),total:z.enum(['INPUT_PLUS_OUTPUT','INPUT_OUTPUT_REASONING','PROVIDER_ONLY']),billing:z.enum(['TOKEN_PARTITIONS','UNKNOWN'])}).strict();
export type UsageSemantics=z.infer<typeof semanticsSchema>;
export const usageEvidenceSchema=z.object({input:token,cached:token,cacheWrite:token,output:token,reasoning:token,total:token}).strict();
export type UsageEvidence=z.infer<typeof usageEvidenceSchema>;
export function normalizeAttestedUsage(raw:UsageEvidence,semantics:UsageSemantics){const e=usageEvidenceSchema.parse(raw),s=semanticsSchema.parse(semantics);let input=e.input,fresh:number|null=null,total=e.total;
  if(s.input==='INCLUDES_CACHE'&&input!==null&&e.cached!==null&&e.cacheWrite!==null){fresh=input-e.cached-e.cacheWrite;if(fresh<0)throw Error('usage_partitions_exceed_input');}
  if(s.input==='EXCLUDES_CACHE'){fresh=input;input=input!==null&&e.cached!==null&&e.cacheWrite!==null?input+e.cached+e.cacheWrite:null;}
  if(total===null&&input!==null&&e.output!==null){if(s.total==='INPUT_PLUS_OUTPUT')total=input+e.output;else if(s.total==='INPUT_OUTPUT_REASONING'&&e.reasoning!==null)total=input+e.output+e.reasoning;}
  const result={inputTokens:input,freshInputTokens:fresh,cachedInputTokens:e.cached,cacheWriteTokens:e.cacheWrite,outputTokens:e.output,reasoningTokens:e.reasoning,totalProcessedTokens:total};
  if(Object.values(result).some(v=>v!==null&&!Number.isSafeInteger(v)))throw Error('usage_total_unsafe');return result;
}
export const exactPricingSchema=z.object({id,version:id,currency:z.string().regex(/^[A-Z]{3}$/),effectiveStart:z.string().datetime(),effectiveEnd:z.string().datetime().nullable(),source:id,input:money,cached:money.nullable(),cacheWrite:money.nullable(),output:money,reasoning:money.nullable(),fixed:money}).strict();
export type ExactPricing=z.infer<typeof exactPricingSchema>;
export function priceUsage(e:UsageEvidence,s:UsageSemantics,p:ExactPricing,at:string){exactPricingSchema.parse(p);if(Date.parse(at)<Date.parse(p.effectiveStart)||(p.effectiveEnd&&Date.parse(at)>=Date.parse(p.effectiveEnd)))throw Error('price_outside_effective_period');const u=normalizeAttestedUsage(e,s);if(s.billing!=='TOKEN_PARTITIONS'||s.reasoning==='UNKNOWN')return null;
  const quantities:[number|null,string|null][]=[[u.freshInputTokens,p.input],[u.cachedInputTokens,p.cached],[u.cacheWriteTokens,p.cacheWrite],[u.outputTokens,p.output]];if(s.reasoning==='ADDITIONAL')quantities.push([u.reasoningTokens,p.reasoning]);
  let amount=p.fixed;for(const [n,rate]of quantities){if(n===null||(n>0&&rate===null))return null;if(n>0)amount=addMoney(amount,decimalScale(multiplyDecimal(String(n),rate!),6));}return exact(amount);
}
export const accountingSchema=z.object({schema:z.literal('agent-control.usage-accounting/v1'),revision:z.number().int().nonnegative(),migrationIdentity:z.object({invocationId:id,parentInvocationId:id.nullable(),retryOfInvocationId:id.nullable(),providerRequestId:id.nullable()}).strict().optional(),parentInvocationId:id.nullable(),retryOfInvocationId:id.nullable(),parcelId:id.nullable(),batonId:id.nullable(),providerRequestId:id.nullable(),modelRevision:id.nullable(),runtime:id.nullable(),runtimeVersion:id.nullable(),machine:id.nullable(),hardware:id.nullable(),jobType:id.nullable(),executionKind:z.enum(['LOCAL','API','UNKNOWN']),provenance:z.object({kind:z.enum(['NATIVE','MIGRATED']),source:id,sourceVersion:id,migrationVersion:id.nullable(),at:z.string().datetime()}).strict(),semantics:semanticsSchema,evidence:usageEvidenceSchema,pricing:exactPricingSchema.nullable(),reportedCost:z.object({amount:money,currency:z.string().regex(/^[A-Z]{3}$/),source:id}).strict().nullable(),localApiChargeKnownZero:z.boolean().default(false)}).strict();
export type UsageAccounting=z.infer<typeof accountingSchema>;
export function usageHash(v:unknown){return createHash('sha256').update(JSON.stringify(v)).digest('hex');}
export function accountingIdentity(a:UsageAccounting){return JSON.stringify([a.parentInvocationId,a.retryOfInvocationId,a.parcelId,a.batonId,a.providerRequestId,a.modelRevision,a.runtime,a.runtimeVersion,a.machine,a.hardware,a.jobType,a.executionKind,a.provenance]);}

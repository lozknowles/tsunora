import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import type {LabourVerifier,WorkOrder} from './labour-types.js';
const values=z.object({values:z.array(z.string().regex(/^-?\d{1,200}$/)).min(1).max(100)}).strict();
const records=z.object({kind:z.string().max(80),records:z.array(z.object({id:z.string().max(80),kind:z.string().max(80),value:z.string().max(200)}).strict()).max(100)}).strict();
export const labourExactVerifier:LabourVerifier={
  id:'exact-result',revision:'1',
  accepts(o:WorkOrder){return ['sum','classification'].includes(o.jobType)?values.safeParse(o.input).success:o.jobType==='extraction'&&records.safeParse(o.input).success;},
  verify(o,result){
    let expected:unknown;
    if(o.jobType==='sum'){const input=values.parse(o.input);expected={sum:input.values.reduce((s,x)=>s+BigInt(x),0n).toString()};}
    else if(o.jobType==='classification'){const input=values.parse(o.input);expected={labels:input.values.map(x=>{const n=BigInt(x);return n<0n?'negative':n>0n?'positive':'zero';})};}
    else {const input=records.parse(o.input);expected={values:input.records.filter(x=>x.kind===input.kind).map(x=>({id:x.id,value:x.value}))};}
    return {passed:isDeepStrictEqual(expected,result.output),detail:'Exact deterministic contract comparison; no model judge'};
  }
};

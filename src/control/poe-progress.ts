import {createHash} from 'node:crypto';
import type {WorkParcel} from './work-parcels.js';
export function reconcilePoeBatch(parcels:WorkParcel[]){
 const stages=parcels.flatMap(parcel=>parcel.stages.map(stage=>({...stage,parcelId:parcel.id}))),count=(state:string)=>stages.filter(stage=>stage.status===state).length;
 const awaitingVerification=parcels.reduce((n,parcel)=>n+(parcel.context?.criteria.filter(c=>c.status==='PENDING').length??0),0);
 const active=stages.some(stage=>['RUNNING','QUEUED','WAITING'].includes(stage.status));
 const terminal=parcels.length>0&&parcels.every(parcel=>['SUCCEEDED','FAILED','CANCELLED'].includes(parcel.status)&&Boolean(parcel.endedAt));
 const reconciled=terminal&&!active&&awaitingVerification===0;
 const value={requested:stages.length,succeeded:count('SUCCEEDED'),failed:count('FAILED'),blocked:count('BLOCKED'),cancelled:count('CANCELLED'),running:count('RUNNING'),queued:count('QUEUED'),waiting:count('WAITING'),awaitingVerification,reconciled,parcelIds:parcels.map(p=>p.id),runIds:stages.flatMap(s=>s.runId?[s.runId]:[]),outputs:'Publication or staging is not inferred from job completion. Consult each registered effect and its output evidence.'};
 return {...value,id:createHash('sha256').update(JSON.stringify(value)).digest('hex'),text:`${reconciled?'The complete requested set is reconciled':'The requested set is not yet reconciled'}: ${value.requested} jobs requested; ${value.succeeded} succeeded, ${value.failed} failed, ${value.blocked} blocked, ${value.cancelled} cancelled; ${value.awaitingVerification} criteria awaiting verification. ${value.running+value.queued+value.waiting} jobs remain active or waiting.`};
}
export function poeParcelHandovers(parcel:WorkParcel){
 return parcel.stages.flatMap(source=>{
  const baton=source.baton;if(!baton||baton.schema!=='agent-control.work-parcel-baton/v2')return [];
  return parcel.stages.filter(target=>target.dependsOn.includes(source.id)).map(target=>{
   const received=Boolean(target.runId&&target.startedAt);
   return {id:`${baton.id}:${target.id}:${received?'received':'sealed'}`,parcelId:parcel.id,batonId:baton.id,sha256:baton.sha256,source:source.id,destination:target.id,sender:'Relay',receiver:/verif|check|review/i.test(target.name)?'Verity':'Relay',received,verification:baton.successCriteria.every(c=>c.status==='PASS')?'PASS':'PENDING',createdAt:baton.createdAt,acceptedAt:received?target.startedAt:null,text:received?`Relay: Evidence from ${source.name} is sealed for ${target.name}. ${/verif|check|review/i.test(target.name)?'Verity':'Relay'}: Baton received. I will continue ${target.name} from the preserved evidence.`:`Relay: Evidence from ${source.name} is sealed for ${target.name}. Receipt is not yet observed.`};
  });
 });
}

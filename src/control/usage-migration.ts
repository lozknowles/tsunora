import {createHash} from 'node:crypto';
import type {HarnessEfficiencyLedgerPort,ModelInvocationObservation} from './harness-efficiency.js';
import {accountingSchema,type UsageAccounting} from './usage-accounting.js';
/** Import only an already validated canonical observation, never arbitrary provider payloads. */
export function indexHistoricalUsage(ledger:HarnessEfficiencyLedgerPort,records:ModelInvocationObservation[],source:{id:string;version:string;at:string}){
  if(!source.id||!source.version||!Number.isFinite(Date.parse(source.at)))throw Error('migration_provenance_required');
  let indexed=0,existing=0;for(const row of records){const id='migrated-'+createHash('sha256').update(JSON.stringify([source.id,source.version,row.id])).digest('hex');if(ledger.list().some(r=>r.id===id||r.id===row.id)){existing++;continue;}
    // Preserve the legacy usage/cost record. Do not invent provider semantics or energy links.
    const a:UsageAccounting=accountingSchema.parse({schema:'agent-control.usage-accounting/v1',revision:0,parentInvocationId:null,retryOfInvocationId:null,parcelId:null,batonId:null,providerRequestId:null,modelRevision:null,runtime:null,runtimeVersion:null,machine:null,hardware:null,jobType:null,executionKind:'UNKNOWN',provenance:{kind:'MIGRATED',source:source.id,sourceVersion:source.version,migrationVersion:'canonical-index/v1',at:source.at},semantics:{id:'historical-unattested/v1',input:'UNKNOWN',reasoning:'UNKNOWN',total:'PROVIDER_ONLY',billing:'UNKNOWN'},evidence:{input:row.usage.inputTokens,cached:row.usage.cachedInputTokens,cacheWrite:row.usage.cacheWriteTokens,output:row.usage.outputTokens,reasoning:row.usage.reasoningTokens,total:row.usage.totalProcessedTokens},pricing:null,reportedCost:null});
    const preserved=row.accounting?accountingSchema.parse({...row.accounting,migrationIdentity:{invocationId:row.id,parentInvocationId:row.accounting.parentInvocationId,retryOfInvocationId:row.accounting.retryOfInvocationId,providerRequestId:row.accounting.providerRequestId},provenance:a.provenance,parentInvocationId:null,retryOfInvocationId:null,providerRequestId:null}):a;
    ledger.record({...structuredClone(row),id,accounting:preserved});indexed++;
  }return {indexed,existing,source:source.id,migrationVersion:'canonical-index/v1'};
}

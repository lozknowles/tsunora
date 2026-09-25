import test from 'node:test';
import assert from 'node:assert/strict';
import {ReadinessProbeAdapter,evidenceReport} from './readiness-probes.js';
import type {DiscoveryAdapterContext} from './environment-discovery.js';

test('explicit read-only adapter probes only fixed GPU queries; report is a pure assembly capability',async()=>{
  const commands:string[][]=[];
  const context={observedAt:new Date().toISOString(),probe:{command:async(command:string,args:string[],timeout:number)=>{
    commands.push([command,...args]); assert.equal(timeout,2500);
    return {ok:true,stdout:args[0]!.includes('query-gpu')?'0, GPU-example, 1000, 500, 10':'GPU-example, 12, 500',stderr:''};
  }}} as unknown as DiscoveryAdapterContext;
  const result=await new ReadinessProbeAdapter().discover(context);
  assert.equal(commands.length,2); assert.ok(commands.every(c=>c[0]==='nvidia-smi' && c[1]!.startsWith('--query-')));
  assert.ok(result.every(r=>r.health==='HEALTHY'&&r.lifecycle==='DISCOVERED'));
  assert.deepEqual(result[1]!.relatedIds,['gpu:controller-gpu-0']);
  assert.equal(result[1]!.kind,'TOOL');
  assert.throws(()=>evidenceReport({fact:true},[]),/report_evidence_required/);
});
test('failed and malformed GPU probes retain failure observations',async()=>{
  for(const output of [{ok:false,stdout:'',stderr:'unavailable'},{ok:true,stdout:'garbled',stderr:''}]) {
    const context={observedAt:new Date().toISOString(),probe:{command:async()=>output}} as unknown as DiscoveryAdapterContext;
    const result=await new ReadinessProbeAdapter().discover(context);
    assert.equal(result[0]!.health,'HEALTHY'); assert.equal(result[1]!.health,'UNAVAILABLE'); assert.equal(result[1]!.attributes.probePassed,false);
  }
});

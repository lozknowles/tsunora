import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BenchmarkEvidenceStore,benchmarkHash,benchmarkReadiness,localBenchmarkProposal,type LocalBenchmarkSpec} from './local-llm-benchmark.js';
import {draftLocalBenchmarkObjective} from './local-llm-benchmark-planner.js';
import {type BenchmarkGrant,type BenchmarkActivity} from './local-llm-benchmark-actions.js';
import type {JobCatalog} from './job-catalog.js';
import type {ActionRegistry} from './job-runtime.js';
import type {DiscoveryScan} from './environment-discovery.js';
import type {PoeOptions} from './poe.js';
import type {RuntimeMapProjection,RuntimeMapNode} from './runtime-map.js';

export const localHardwareFingerprint=()=>benchmarkHash({platform:os.platform(),architecture:os.arch(),cpu:os.cpus()[0]?.model,logical:os.cpus().length,totalRam:os.totalmem()});
/** Opt-in controller adapter. A controller-owned qualification record, not model presence, admits work. */
export class LocalBenchmarkController {
  readonly store:BenchmarkEvidenceStore;
  readonly grants=new Map<string,BenchmarkGrant>();
  readonly activities=new Map<string,BenchmarkActivity>();
  constructor(readonly options:{root:string;template:LocalBenchmarkSpec;scan:()=>DiscoveryScan|null;catalog:JobCatalog;actions:ActionRegistry;registerExecution?:(catalog:JobCatalog,actions:ActionRegistry,options:{root:string;store:BenchmarkEvidenceStore;grants:Map<string,BenchmarkGrant>;admit:(spec:LocalBenchmarkSpec)=>Promise<void>;onActivity:(activity:BenchmarkActivity)=>void})=>void}){
    this.store=new BenchmarkEvidenceStore(path.join(options.root,'evidence'));
    options.registerExecution?.(options.catalog,options.actions,{root:path.join(options.root,'targets'),store:this.store,grants:this.grants,admit:async spec=>this.admit(spec),onActivity:a=>this.activities.set(a.runId,a)});
  }
  admit(spec:LocalBenchmarkSpec){
    const proof=this.store.read('results',spec.execution.qualificationEvidenceSha256);
    if(proof.kind!=='local-benchmark-control-qualification'||proof.status!=='PASS'||proof.runtimeSha256!==spec.execution.runtimeSha256||proof.validatorSha256!==spec.execution.validatorSha256||proof.sandboxSha256!==spec.execution.sandboxSha256||proof.hardwareFingerprint!==spec.hardware.fingerprint||!Number.isFinite(Date.parse(proof.expiresAt))||Date.parse(proof.expiresAt)<=Date.now()||Date.parse(spec.execution.expiresAt)>Date.parse(proof.expiresAt)||!Array.isArray(proof.checks)||!['correct','incorrect','malicious','owned-cleanup'].every(c=>proof.checks.includes(c)))throw Error('benchmark_control_qualification_required');
    if(localHardwareFingerprint()!==spec.hardware.fingerprint)throw Error('benchmark_hardware_changed');
    if(Math.max(...spec.candidates.map(c=>c.estimatedRamBytes))>os.freemem())throw Error('benchmark_available_memory_changed');
  }
  draft(objective:string){
    const scan=this.options.scan();if(!scan)throw Error('benchmark_estate_discovery_required');
    const template=structuredClone(this.options.template),machine=scan.items.find(i=>i.id===template.hardware.resourceId);
    if(machine){template.hardware.scanId=scan.id;template.hardware.observedAt=scan.completedAt;template.hardware.ramBytes=Number(machine.attributes.availableMemoryBytes);template.hardware.freeDiskBytes=Number(machine.attributes.diskAvailableBytes);}
    return draftLocalBenchmarkObjective(objective,template,scan,this.store);
  }
  /** Called exclusively by the existing authenticated, frozen POE approval port. */
  authorize(input:Parameters<NonNullable<PoeOptions['benchmark']>['submit']>[0]){
    const {proposal,plan,actor}=input,digest=String(plan.stages[0]?.parameters?.specSha256??'');
    const spec=this.store.read('definitions',digest) as LocalBenchmarkSpec,expected=localBenchmarkProposal(spec,digest);
    if(proposal.state!=='FROZEN'||!proposal.frozenSha256||proposal.repetitions!==1||benchmarkHash(plan.stages)!==benchmarkHash(expected.stages)||proposal.objective!==spec.objective||benchmarkHash(proposal.conditions)!==benchmarkHash(expected.conditions)||benchmarkHash(proposal.constraints)!==benchmarkHash(expected.constraints)||benchmarkHash(proposal.metrics)!==benchmarkHash(expected.metrics))throw Error('benchmark_approved_plan_spec_mismatch');
    const scan=this.options.scan();if(!scan)throw Error('benchmark_estate_discovery_required');
    const readiness=benchmarkReadiness(spec,scan);if(!['PROVISIONABLE','APPROVAL_REQUIRED'].includes(readiness.state))throw Error(`benchmark_not_admitted:${readiness.state}`);
    this.admit(spec);
    if(this.grants.has(digest))throw Error('benchmark_spec_already_authorized');
    const expiresAt=new Date(Math.min(Date.now()+60*60*1000,Date.parse(spec.execution.expiresAt))).toISOString();
    const grant={specSha256:digest,actor,expiresAt,downloadBytes:readiness.downloadBytes??0,candidateHashes:spec.candidates.map(c=>c.sha256),runtimeSha256:spec.execution.runtimeSha256};
    this.store.put('approvals',{...grant,proposalId:proposal.id,frozenSha256:proposal.frozenSha256,approvedAt:new Date().toISOString()});
    this.grants.set(digest,grant);return digest;
  }
  bind(digest:string,parcelId:string){const grant=this.grants.get(digest);if(!grant||grant.parcelId)throw Error('benchmark_grant_binding_invalid');grant.parcelId=parcelId;}
  revoke(digest:string){this.grants.delete(digest);}
  project(map:RuntimeMapProjection,runIds?:string[]){
    const result=structuredClone(map),now=Date.now();
    for(const a of [...this.activities.values()].sort((a,b)=>b.at.localeCompare(a.at))){
      if(runIds&&!runIds.includes(a.runId))continue;
      const active=a.state==='ACTIVE'&&now-Date.parse(a.at)<2500&&a.pids.some(pid=>{try{process.kill(pid,0);return true;}catch{return false;}});
      const state=active?'RUNNING':'WAITING',resourceIds=[a.resourceId,`benchmark-runtime:${a.runtimeSha256}`,`benchmark-model:${a.modelSha256}`];
      const nodes:Array<[string,RuntimeMapNode['type'],string]>=[[resourceIds[1]!,'runtime','Qualified benchmark runtime'],[resourceIds[2]!,'model',a.modelId]];
      for(const [id,type,label]of nodes){if(result.nodes.some(n=>n.id===id))continue;result.nodes.push({id,type,label,state,expandable:false,detail:{activity:active?'ACTIVE':'STOPPED_OR_STALE',observedAt:a.at,pids:active?a.pids:[],resourceIds,processRunIds:[a.runId],modelSha256:a.modelSha256,runtimeSha256:a.runtimeSha256,qualification:'Target under test; not a production routing grant'},evidence:[{kind:'native-job-run',id:a.runId}]});}
      for(const [from,to]of [[a.resourceId,resourceIds[1]!],[resourceIds[1]!,resourceIds[2]!]])if(result.nodes.some(n=>n.id===from)&&!result.edges.some(e=>e.id===`${from}->${to}`))result.edges.push({id:`${from}->${to}`,from,to,kind:'flow',state,label:active?'Executing owned process':'Last observed execution',evidence:[{kind:'native-job-run',id:a.runId}]});
    }
    result.summary.nodes=result.nodes.length;result.summary.edges=result.edges.length;return result;
  }
}

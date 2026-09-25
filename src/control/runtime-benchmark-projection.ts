import type {DiscoveryAdapter,DiscoveryObservation} from './environment-discovery.js';
import type {ArtifactStore} from './job-runtime.js';
/** A discovery projection over retained runtime observations. It performs no device operations. */
export class RuntimeBenchmarkDiscoveryAdapter implements DiscoveryAdapter {
 id='runtime-benchmark-evidence';constructor(private readonly artifacts:ArtifactStore){}
 async discover():Promise<DiscoveryObservation[]>{
  const latest=new Map<string,{value:any;id:string}>();
  for(const meta of this.artifacts.list().filter(a=>a.name==='runtime-target-observation'))try{const value=this.artifacts.read(meta.id) as any;if(value?.evidence?.producer?.provenance==='AGENT_CONTROL_RUNTIME_EVIDENCE')latest.set(value.evidence.producer.target,{value,id:meta.id});}catch{}
  const result:DiscoveryObservation[]=[];
  for(const {value:o,id:sourceId} of latest.values()){
   const p=o.evidence.producer,nodeId=p.target,at=o.observedAt,machine='machine:'+nodeId,host='runtime:'+nodeId+':host',environment='runtime:'+nodeId+':'+p.environment;
   const provenance=[{adapter:this.id,method:'retained-runtime-observation:'+sourceId,observedAt:at,authority:'AUTHORITATIVE' as const}];
   const row=(id:string,kind:DiscoveryObservation['kind'],label:string,attributes:DiscoveryObservation['attributes'],parentId?:string):DiscoveryObservation=>({id,kind,label,nodeId,health:'HEALTHY',lifecycle:'DISCOVERED',attributes:{nodeId,sourceArtifactId:sourceId,transport:p.transport,...attributes},provenance,...(parentId?{containment:{parentId,relation:'HOSTS' as const,observedAt:at,authority:'AUTHORITATIVE' as const,method:'execution-environment-containment' as const,sourceId}}:{})});
   result.push(row(machine,'MACHINE',p.targetLabel??nodeId,{configuredId:nodeId,batteryPercent:o.batteryPercent,thermalCelsius:o.thermalCelsius,charging:o.charging,memoryAvailableBytes:o.availableRamBytes,diskAvailableBytes:o.freeStorageBytes}));
   result.push(row(host,'RUNTIME',p.adapter==='android-termux'?'Android host':o.osName??'Host operating system',{executionEnvironmentKind:'HOST_OS',osName:p.adapter==='android-termux'?'Android':o.osName??null,architecture:o.architecture??null},machine));
   result.push(row(environment,'RUNTIME',p.environment,{architecture:o.architecture??null,workerRouteId:p.worker,workerLocality:'CONTROLLER_LOCAL',availability:'AVAILABLE'},host));
   for(const meta of this.artifacts.list().filter(a=>a.name==='physical-inference-measurement'))try{const v=this.artifacts.read(meta.id) as any;if(v?.producer?.provenance!=='AGENT_CONTROL_RUNTIME_EVIDENCE'||v.producer.target!==nodeId||v.producer.environment!==p.environment)continue;
    const id=environment+':inference';if(result.some(x=>x.id===id))continue;result.push(row(id,'RUNTIME',v.runtime,{executionEnvironmentKind:'RUNTIME',version:v.runtimeVersion,runtimeKind:v.runtime,availability:'AVAILABLE',workerRouteId:p.worker,workerLocality:'CONTROLLER_LOCAL',sourceArtifactId:meta.id},environment));
   }catch{}
  }return result;
 }
}

export function recordedRuntimeBenchmarkRoute(artifacts:ArtifactStore,runId:string,estate:import('./runtime-map.js').RuntimeMapProjection):import('./navigable-workspace.js').WorkspaceRunInspector['executionRoute']|null {
 for(const meta of artifacts.list(runId).filter(a=>a.name==='physical-inference-measurement').reverse())try{
  const v=artifacts.read(meta.id) as any,p=v?.producer;if(p?.provenance!=='AGENT_CONTROL_RUNTIME_EVIDENCE')continue;
  const physical=estate.nodes.find(n=>n.id==='machine:'+p.target);if(!physical)return null;
  const ids=[physical.id,'runtime:'+p.target+':host','runtime:'+p.target+':'+p.environment];
  const path=ids.map(id=>estate.nodes.find(n=>n.id===id)).filter((n):n is NonNullable<typeof n>=>Boolean(n)).map(n=>({id:n.id,label:n.label,kind:n.id===physical.id?'PHYSICAL_DEVICE':String(n.detail.executionEnvironmentKind??'EXECUTION_ENVIRONMENT')}));
  return {path,worker:{id:p.worker,state:'RECORDED'},transport:p.transport,runtime:{id:ids[2]+':inference',kind:v.runtime,version:v.runtimeVersion},reason:'The sealed fixture selected this target; recorded runtime admission permitted execution.',authority:'RECORDED_RUNTIME_EVIDENCE',evidence:[{kind:'artifact',id:meta.id,sha256:meta.sha256}]};
 }catch{}return null;
}

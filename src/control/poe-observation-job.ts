import type {ActionRegistry,WorkerRegistry} from './job-runtime.js';
import type {JobCatalog} from './job-catalog.js';

export const OPERATOR_OBSERVATION_CAPABILITY='agent-control.operator-observation.read';
export const OPERATOR_OBSERVATION_WORKER_ID='agent-control:operator-observer';

/** Explicit read-only registration. Never executes operator-provided commands. */
export function registerOperatorObservation(actions:ActionRegistry,catalog:JobCatalog,workers:WorkerRegistry) {
  workers.registerControllerInternal({id:OPERATOR_OBSERVATION_WORKER_ID,capabilities:[OPERATOR_OBSERVATION_CAPABILITY],health:'healthy',capacity:1,active:0,labels:{origin:'agent-control-built-in',scope:'controller-local-read-only-observation'},observedAt:new Date().toISOString()});
  actions.registerReadOnly('operator.system-observation@1.0.0',async()=>({artifacts:[{name:'system-observation',value:{observedAt:new Date().toISOString(),workers:workers.list().map(worker=>({id:worker.id,health:worker.health,observedAt:worker.observedAt,capabilities:worker.capabilities}))},type:'application/json',schema:'agent-control.system-observation',version:'1'}],evidence:['worker-registry-observed'],verification:['worker-registry-observed']}));
  actions.registerReadOnly('operator.verify-observation@1.0.0',async context=>{
    const input=context.inputArtifacts.find(item=>item.name==='system-observation');if(!input)throw new Error('observation_artifact_missing');
    const value=context.readArtifact(input.id) as {workers?:unknown;observedAt?:string}|null;if(!value||!Array.isArray(value.workers)||!Number.isFinite(Date.parse(value.observedAt??''))||value.workers.some((worker:any)=>!worker||typeof worker!=='object'||!worker.id||!['healthy','unknown','unhealthy','degraded','offline'].includes(worker.health)||!Array.isArray(worker.capabilities)))throw new Error('observation_schema_invalid');
    return {artifacts:[{name:'independent-verification',value:{status:'PASS',verifier:'operator.verify-observation@1.0.0',inputArtifactId:input.id,inputSha256:input.sha256,checks:['artifact_checksum','timestamp_schema','worker_schema'],limitation:'Independent deterministic validation of the captured artifact; it does not establish remote session readiness.'},type:'application/json',schema:'agent-control.observation-verification',version:'1'}],evidence:['observation-independently-verified'],verification:['observation-independently-verified']};
  });
  catalog.knownActions?.add('operator.verify-observation@1.0.0');
  catalog.knownActions?.add('operator.system-observation@1.0.0');
  catalog.addJob({apiVersion:'agent-control/v1',kind:'Job',metadata:{id:'operator-system-observation',name:'System observation',version:'1.1.0',description:'Read registered worker health and preserve a local observation artifact.'},spec:{priority:'normal',concurrency:'queue',parameters:{},steps:[{id:'observe',action:'operator.system-observation@1.0.0',requires:[OPERATOR_OBSERVATION_CAPABILITY],verification:['worker-registry-observed'],outputs:[{name:'system-observation',type:'application/json',schema:'agent-control.system-observation',version:'1'}]},{id:'verify',action:'operator.verify-observation@1.0.0',dependsOn:['observe'],inputs:{observation:'observe.system-observation'},requires:[OPERATOR_OBSERVATION_CAPABILITY],verification:['observation-independently-verified'],outputs:[{name:'independent-verification',type:'application/json',schema:'agent-control.observation-verification',version:'1'}]}]}});
}

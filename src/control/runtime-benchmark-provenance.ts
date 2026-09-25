export interface RuntimeProducer {component:string;worker:string;adapter:string;target:string;environment:string;transport:string;runId:string;stepId:string;provenance:string;}
/** Inputs are collected by TargetLlamaRuntime from its owned process, never supplied by a job parameter. */
export function assessRuntimeExecution(producer:RuntimeProducer,events:any[],process:{pid:number;exitCode:number|null},helperSha256:string){
 const missing:string[]=[];
 if(producer.component!=='agent-control-runtime'||producer.provenance!=='AGENT_CONTROL_RUNTIME_EVIDENCE')missing.push('product-adapter-owner');
 for(const k of ['worker','adapter','target','environment','transport','runId','stepId'] as const)if(!producer[k])missing.push(k);
 if(!Number.isInteger(process.pid)||process.pid<=0||process.exitCode!==0)missing.push('owned-process-completion');
 if(!/^[a-f0-9]{64}$/.test(helperSha256))missing.push('distributed-helper-identity');
 const bound=events.filter(e=>e?.schema==='agent-control.runtime-lifecycle/v1'&&Number.isFinite(Date.parse(e.at))&&Object.entries(producer).every(([k,v])=>e.producer?.[k]===v));
 for(const kind of ['runtime.request_received','admission.memory','runtime.started','inference.completed','service.restoration','runtime.result_retained'])if(!bound.some(e=>e.type===kind))missing.push(kind);
 if(!bound.some(e=>e.type==='admission.memory'&&e.data?.allowed===true))missing.push('memory-admission');
 if(!bound.some(e=>e.type==='service.restoration'&&e.data?.restored===true))missing.push('restoration-confirmed');
 return {schema:'agent-control.runtime-execution-provenance/v1',classification:missing.length?'UNVERIFIED_EXECUTION':'AGENT_CONTROL_RUNTIME_EVIDENCE',missing,producer,helperSha256,ownedProcess:process,lifecycle:bound.map(e=>({type:e.type,at:e.at})),boundary:'Product adapter owns this transcript; a result label or caller declaration is insufficient. This is execution provenance, not model quality.'};
}

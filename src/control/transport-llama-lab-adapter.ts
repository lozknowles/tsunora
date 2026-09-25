import {LabAdmissionBlocked} from './model-hardware-qualification.js';
import {Ajv} from 'ajv';
import type {LabExecutionAdapter,LabAttemptResult,LabQualificationSpec} from './model-hardware-qualification.js';
import type {ActionContext} from './job-types.js';

export interface TransportLabProfile {
 id:string;device:string;environment:string;model:string;modelPath:string;modelSha256:string;
 runtimePath:string;runtimeSha256:string;runtimeVersion:string;quantisation:string;
 context:number;threads:number;gpuLayers:number;batch:number;microBatch:number;maxTokens:number;
 startupTimeoutSeconds:number;inferenceTimeoutSeconds:number;
 runtimeDependencies?:Array<{path:string;sha256:string}>;
}
/** Transport and resource policy stay outside the generic Lab and this runtime adapter. */
export function createTransportLlamaLabAdapter(options:{
 profile:TransportLabProfile;
 admit:(context:ActionContext)=>Promise<{available:boolean;evidence:unknown}>;
 execute:(request:{profile:TransportLabProfile;input:unknown},context:ActionContext)=>Promise<LabAttemptResult>;
 validateCode?:LabExecutionAdapter['validate'];
}):LabExecutionAdapter {
 const pinned=JSON.stringify(options.profile);
 const resolve=(s:Omit<LabQualificationSpec,'cases'>)=>{
  const p=options.profile;
  if(JSON.stringify(p)!==pinned||s.profileRef!==p.id||s.target.device!==p.device||s.target.environment!==p.environment||s.target.model!==p.model||s.target.modelSha256!==p.modelSha256||s.target.runtimeSha256!==p.runtimeSha256)throw Error('lab_transport_profile_mismatch');
  if(![p.modelSha256,p.runtimeSha256].every(h=>/^[a-f0-9]{64}$/.test(h)))throw Error('lab_transport_hash_invalid');
  for(const n of [p.context,p.threads,p.batch,p.microBatch,p.maxTokens,p.startupTimeoutSeconds,p.inferenceTimeoutSeconds])if(!Number.isSafeInteger(n)||n<1||n>86400)throw Error('lab_transport_limit_invalid');
  if(p.maxTokens>=p.context||p.microBatch>p.batch||!Number.isSafeInteger(p.gpuLayers)||p.gpuLayers<0)throw Error('lab_transport_settings_invalid');
  return structuredClone(p);
 };
 return {
  id:'transport-llama-cpp/v1',
  async compatibility(s,c){resolve(s);const admission=await options.admit(c);return{status:admission.available?'SUPPORTED_WITH_LIMITATIONS':'BLOCKED',reasons:[admission.available?'Transport/resource admission passed; physical execution remains to be measured.':'Transport/resource admission failed.'],evidence:admission.evidence};},
  async prepare(s){resolve(s);return{lifecycle:'Fresh owned runtime per invocation; any approved original service is restored per invocation.'};},
  async invoke(s,t,c){const profile=resolve(s);const a=await options.admit(c);const evidence=c.recordEvidence?.('lab-transport-admission',a);if(!a.available)throw new LabAdmissionBlocked(evidence?{id:evidence.id,sha256:evidence.sha256}:null);return options.execute({profile,input:{model:profile.model,messages:[{role:'user',content:t.prompt}],temperature:0,seed:42,max_tokens:profile.maxTokens,cache_prompt:false,stream:true,stream_options:{include_usage:true}}},c);},
  async validate(task,result,c){
   if(task.validator==='python-function-tests'){if(!options.validateCode)return{passed:null,reason:'Independent code validator unavailable.',evidence:null};return options.validateCode(task,result,c);}
   if(task.validator==='exact-text')return{passed:result.output.trim()===task.expected,reason:'Exact answer comparison against retained fixture.',evidence:{validator:'exact-text/v1'}};
   try{const check=new Ajv({strict:false}).compile(task.expected as object);return{passed:!!check(JSON.parse(result.output)),reason:'Deterministic retained JSON schema validation.',evidence:{validator:'json-schema/v1'}};}catch{return{passed:false,reason:'Response did not contain the required JSON document.',evidence:{validator:'json-schema/v1'}};}
  },
  async restore(){return{restored:true,evidence:{boundary:'Controller adapter owns no persistent runtime; transport worker must retain per-invocation restoration.',notEvidenceOfRemoteRestoration:true}};},
 };
}

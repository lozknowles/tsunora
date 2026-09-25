import type {ActionRegistry} from './job-runtime.js';
import {ActionFailure} from './job-runtime.js';
import type {SkillLearningRuntime,SpecialistExecutionPort} from './skill-learning.js';

export interface SpecialistVerificationResult {passed:boolean;summary:string;evidence:string[];}
export interface SpecialistVerificationPort {verify(input:{taskClass:string;request:unknown;output:unknown}):Promise<SpecialistVerificationResult>|SpecialistVerificationResult;}
export interface SpecialistActionBinding {baseModelId:string;baseModelVersion:string;baseModelSha256:string;runtimeId:string;runtimeVersion:string;requiredCapabilities:string[];}

/** Typed production action seam. Task-specific Job definitions opt in; no shell or training authority is exposed. */
export function registerLearnedSpecialistActions(registry:ActionRegistry,skills:SkillLearningRuntime,execution:SpecialistExecutionPort,verification:SpecialistVerificationPort,binding:SpecialistActionBinding){
  registry.registerAgent('learned-specialist.execute@1.0.0',{path:'adaptive-harness',execute:async context=>{
    const taskClass=text(context.parameters.taskClass,'specialist_task_class_required'),requiredCapabilities=strings(binding.requiredCapabilities),request=text(context.parameters.input,'specialist_input_required');
    const decision=skills.assess({parcelId:context.run.trigger.parcelContext?.parcelId??`run:${context.run.id}`,stageId:context.run.trigger.parcelContext?.stageId??context.step.id,taskClass,requiredCapabilities,baseModelId:binding.baseModelId,baseModelVersion:binding.baseModelVersion,baseModelSha256:binding.baseModelSha256,runtimeId:binding.runtimeId,runtimeVersion:binding.runtimeVersion});
    if(!decision.selected)throw new ActionFailure('learned_specialist_route_unavailable','capability_unavailable');
    const result=await skills.execute(decision.id,{parcelId:decision.parcelId,stageId:decision.stageId,baseModelId:binding.baseModelId,baseModelVersion:binding.baseModelVersion,baseModelSha256:binding.baseModelSha256,runtimeId:binding.runtimeId,runtimeVersion:binding.runtimeVersion,input:request},execution);
    return{artifacts:[{name:'specialist-result',value:{schema:'agent-control.learned-specialist-result/v1',taskClass,request,result,routeDecisionId:decision.id}}],evidence:[`skill-route:${decision.id}`,`skill-adapter:${decision.selected.adapterId}@${decision.selected.version}`,`skill-adapter-sha256:${decision.selected.artefactSha256}`],executionState:'verification-pending',detail:`Qualified learned specialist ${decision.selected.adapterId}@${decision.selected.version} completed typed execution; independent verification remains required.`};
  }});
  registry.registerReadOnly('learned-specialist.verify@1.0.0',async context=>{const artifact=context.inputArtifacts.find(item=>item.name==='specialist-result');if(!artifact)throw new ActionFailure('learned_specialist_result_required','configuration');const value=context.readArtifact(artifact.id) as {schema?:string;taskClass?:string;request?:unknown;result?:{output?:unknown};routeDecisionId?:string};if(value.schema!=='agent-control.learned-specialist-result/v1'||typeof value.taskClass!=='string'||typeof value.routeDecisionId!=='string')throw new ActionFailure('learned_specialist_result_invalid','verification');const verdict=await verification.verify({taskClass:value.taskClass,request:value.request,output:value.result?.output});if(!verdict.passed)throw new ActionFailure('learned_specialist_independent_verification_failed','verification');return{artifacts:[{name:'specialist-verification',value:{schema:'agent-control.learned-specialist-verification/v1',passed:true,summary:verdict.summary,routeDecisionId:value.routeDecisionId}}],evidence:verdict.evidence,verification:['learned-specialist-independent-verification'],detail:verdict.summary};});
  return registry;
}
function text(value:unknown,error:string){if(typeof value!=='string'||!value.trim()||value.length>256)throw new ActionFailure(error,'configuration');return value.trim();}
function strings(value:unknown){if(!Array.isArray(value)||value.some(item=>typeof item!=='string'||!item.trim()))throw new ActionFailure('specialist_capabilities_invalid','configuration');return [...new Set(value as string[])];}

import {ActionFailure,type ActionRegistry} from './job-runtime.js';
import type {DeterministicSkillRuntime} from './deterministic-skill.js';

export function registerDeterministicSkillActions(registry:ActionRegistry,skills:DeterministicSkillRuntime){
  registry.registerReadOnly('deterministic-skill.execute@1.0.0',async context=>{const taskClass=text(context.parameters.taskClass),payload=parse(context.parameters.input),parcelId=context.run.trigger.parcelContext?.parcelId??`run:${context.run.id}`,stageId=context.run.trigger.parcelContext?.stageId??context.step.id,decision=skills.assess({parcelId,stageId,taskClass,payload});if(!decision.selected)throw new ActionFailure('deterministic_skill_escalation_required','capability_unavailable');const execution=skills.execute(decision.id,payload);return{artifacts:[{name:'deterministic-skill-result',value:{schema:'agent-control.deterministic-skill-result/v1',decision,execution}}],evidence:[`deterministic-skill:${execution.skillId}@${execution.skillVersion}`,`deterministic-route:${decision.id}`],verification:['deterministic-skill-independent-verification'],detail:`${decision.reason} Independent deterministic verification PASS; LLM invocation avoided.`};});return registry;
}
function text(value:unknown){if(typeof value!=='string'||!value.trim())throw new ActionFailure('deterministic_skill_task_class_required','configuration');return value.trim();}
function parse(value:unknown){if(typeof value!=='string')return value;try{return JSON.parse(value);}catch{throw new ActionFailure('deterministic_skill_input_json_invalid','configuration');}}

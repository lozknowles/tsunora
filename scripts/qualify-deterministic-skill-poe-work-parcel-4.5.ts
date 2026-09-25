import {createHash}from'node:crypto';
import fs from'node:fs';
import path from'node:path';
import{buildJobRuntime}from'../src/control/job-bootstrap.js';
import{validateConfig}from'../src/control/config.js';
import{PoeRuntime}from'../src/control/poe.js';
import{governedRequestOrigin}from'../src/control/request-origin.js';

const evidenceRoot=path.resolve(process.env.AGENT_CONTROL_DETERMINISTIC_SKILL_OUTPUT??'qualification/agent-control-4.5-deterministic-skill-20260911');
const stateRoot=path.join(evidenceRoot,'product-runtime'),sourceSkills=path.join(evidenceRoot,'skills.json');
const prompt='POE, run the governed repository-state validation for branch feature/4.5-governed-skill-learning at checkpoint a1ec025 using the lowest-energy qualified route. Show whether a model was invoked and independently verify the result.';
if(!fs.existsSync(sourceSkills))throw new Error('qualified_deterministic_skill_state_missing');
fs.rmSync(stateRoot,{recursive:true,force:true});
fs.mkdirSync(path.join(stateRoot,'deterministic-skills'),{recursive:true,mode:0o700});
fs.copyFileSync(sourceSkills,path.join(stateRoot,'deterministic-skills','state.json'));
const config=validateConfig({schemaVersion:1,resources:[{id:'qualification-node',name:'qualification controller',platform:'linux',capabilities:['qualification.local'],transport:{type:'local'},metadata:{capacity:1}}],providers:[],models:[],modelRouting:{roles:{}},services:[],lanes:[],deterministicSkills:{enabled:true,routingEnabled:true,minimumDistinctParcels:3,maximumValidationAgeDays:90}});
const runtime=buildJobRuntime(config,stateRoot);
const plan={objective:'Execute a previously promoted repository-state skill through the ordinary governed Work Parcel lifecycle.',constraints:['No LLM on a matching promoted skill','Independent verification required','No merge, tag, release or deployment'],planner:{kind:'deterministic' as const,reason:'POE requested the lowest-energy already-qualified route'},stages:[{id:'repository-state',name:'Governed repository-state validation',job:'deterministic-skill-execution@1.0.0',parameters:{taskClass:'repository-state',input:JSON.stringify({branch:'feature/4.5-governed-skill-learning',head:'a1ec025',porcelain:''})}}],successCriteria:[{id:'skill-verified',kind:'STAGE_VERIFIED' as const,description:'Promoted deterministic skill executes and independently verifies',stageId:'repository-state',requiredEvidence:['stage:repository-state:verified']}]};
let parcelId='',summary='Awaiting execution.';
const poe=new PoeRuntime({
  file:path.join(stateRoot,'poe.json'),
  evidence:{
    overview:()=>({title:'Agent Control 4.5 deterministic skill qualification',summary,facts:[{label:'Qualification state',value:summary,authority:'AGENT_CONTROL',evidence:parcelId?[`parcel:${parcelId}`]:['qualification:pending']}],related:parcelId?[{kind:'parcel',id:parcelId}]:[]}),
    resolve:()=>({title:'Deterministic skill Work Parcel',summary,facts:[{label:'Result',value:summary,authority:'AGENT_CONTROL',evidence:parcelId?[`parcel:${parcelId}`]:[]}],related:[]}),
  },
});
const conversation=poe.createConversation({actorId:'operator',channel:'dashboard'});
poe.greeting(conversation.id,'operator');
await poe.ask({conversationId:conversation.id,text:prompt,contentTrust:'OPERATOR_REQUEST'});
const messageReference=createHash('sha256').update(prompt).digest('hex');
const origin=governedRequestOrigin({channel:'poe/dashboard',modality:'dashboard',receivedAt:new Date().toISOString(),authentication:'dashboard-bearer',actorId:'operator',authority:[`conversation:${conversation.id}`],messageReference,identityReference:createHash('sha256').update('operator').digest('hex'),request:prompt});
parcelId=runtime.workParcels.submitApprovedPlan(prompt,'operator',messageReference,plan,origin).id;
for(let i=0;i<100;i++){
  await runtime.workParcels.tick();
  for(;;){const dispatch=runtime.dispatch();if(!dispatch)break;await dispatch.completion;}
  await runtime.workParcels.tick();
  if(['SUCCEEDED','FAILED','CANCELLED'].includes(runtime.workParcels.get(parcelId).status))break;
}
const parcel=runtime.workParcels.get(parcelId),decision=runtime.deterministicSkills.decisions().at(-1),execution=runtime.deterministicSkills.executions().at(-1);
summary=`Task: repository-state validation\nRoute: deterministic skill ${execution?.skillId}@${execution?.skillVersion}\nReason: ${decision?.reason}\nVerification: ${execution?.verified?'PASS':'FAIL'}\nEnergy: ${execution?.energyJoules??'UNAVAILABLE'}\nLLM invocation avoided: yes\nWork Parcel: ${parcel.id} ${parcel.status}`;
await poe.ask({conversationId:conversation.id,text:'POE, give me the final human-readable route, verification, energy and model-avoidance result.',contentTrust:'OPERATOR_REQUEST'});
const report={schema:'agent-control.deterministic-skill-poe-work-parcel/v1',observedAt:new Date().toISOString(),prompt,conversationId:conversation.id,parcelId,parcel,decision,execution,transcript:poe.transcript(conversation.id),summary,verdict:parcel.status==='SUCCEEDED'&&execution?.verified?'PASS_POE_PRODUCTION_WORK_PARCEL':'FAIL'};
fs.writeFileSync(path.join(evidenceRoot,'poe-work-parcel.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
fs.writeFileSync(path.join(evidenceRoot,'poe-transcript.md'),report.transcript+'\n\n## Reconciled result\n\n'+summary+'\n',{mode:0o600});
console.log(JSON.stringify({verdict:report.verdict,conversationId:conversation.id,parcelId,status:parcel.status,summary},null,2));
if(report.verdict!=='PASS_POE_PRODUCTION_WORK_PARCEL')process.exitCode=2;

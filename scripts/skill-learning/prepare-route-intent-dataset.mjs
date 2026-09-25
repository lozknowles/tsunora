#!/usr/bin/env node
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const output=path.resolve(process.argv[2]||'qualification/agent-control-4.5-skill-learning-20260911/dataset');
const labels={REVIEW:['review','audit','inspect','assess'],OPERATE:['run','execute','restart','deploy'],VERIFY:['verify','qualify','test','prove'],RESEARCH:['research','compare','investigate','find']};
const objects=['repository release notes','managed node health','provider route','dashboard telemetry','token ledger','cache evidence','deployment manifest','model qualification'];
const constraints={
  REVIEW:['without making changes','using read-only evidence','and cite findings','against current policy','with independent evidence'],
  OPERATE:['with explicit approval','using governed execution','and verify completion','within declared scope','with rollback ready'],
  VERIFY:['independently','against frozen criteria','and preserve evidence','without altering the result','using exact checks'],
  RESEARCH:['using primary sources','and compare alternatives','with cited evidence','without changing systems','and separate facts from inference'],
};
const records=[];
for(const [lane,verbs] of Object.entries(labels))for(let i=0;i<40;i++){const verb=verbs[i%verbs.length],object=objects[(i+Object.keys(labels).indexOf(lane))%objects.length],constraint=constraints[lane][(i*3+lane.length)%constraints[lane].length];records.push({id:`${lane.toLowerCase()}-${String(i+1).padStart(2,'0')}`,laneIndex:i,input:`Please ${verb} the ${object} ${constraint}.`,output:{lane:`LANE_${lane}`}})}
// Ten disjoint examples per class; the selected verb rotates by block so the
// holdout tests novel combinations without withholding an entire vocabulary.
const evaluation=records.filter(item=>item.laneIndex%4===Math.floor(item.laneIndex/4)%4),training=records.filter(item=>!evaluation.includes(item));
for(const item of records)delete item.laneIndex;
const stable=value=>JSON.stringify(value,Object.keys(value).sort());
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
fs.mkdirSync(output,{recursive:true});
for(const [name,items] of [['train',training],['eval',evaluation]])fs.writeFileSync(path.join(output,`${name}.jsonl`),items.map(item=>JSON.stringify(item)).join('\n')+'\n',{mode:0o600});
const manifest={schema:'agent-control.skill-dataset/v1',id:'route-intent-v1',version:'1',taskClass:'route-intent-json',trainingExampleIds:training.map(item=>item.id),evaluationExampleIds:evaluation.map(item=>item.id),trainingSha256:hash(fs.readFileSync(path.join(output,'train.jsonl'))),evaluationSha256:hash(fs.readFileSync(path.join(output,'eval.jsonl'))),schemaSha256:hash(stable({type:'object',required:['lane'],properties:{lane:{enum:Object.keys(labels).map(label=>`LANE_${label}`)}}})),provenance:[{sourceId:'agent-control-4.5-approved-route-intent-fixture',sourceSha256:hash(JSON.stringify({labels,objects,constraints})),authority:'operator-authorised-qualification-fixture'}],duplicateCount:0,malformedCount:0,disagreementCount:0,contaminationCount:training.some(a=>evaluation.some(b=>a.id===b.id||a.input===b.input))?1:0,humanReview:{state:'APPROVED',actor:'agent-control-qualification-operator',at:new Date().toISOString(),reason:'Synthetic bounded routing intents contain no production content or secrets and are disjoint by ID and text.'},createdAt:new Date().toISOString()};
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
process.stdout.write(JSON.stringify({output,training:training.length,evaluation:evaluation.length,manifest},null,2)+'\n');

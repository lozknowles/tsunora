import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {ActivityLogProjection,activityLogPaths,projectActivity} from './activity-log.js';
import {JobCatalog} from './job-catalog.js';
import {ActionRegistry,createJobRuntime,WorkerRegistry} from './job-runtime.js';

const source=(evidence:Record<string,unknown>={})=>({at:'2026-09-17T12:00:00.000Z',runId:'run-1',type:'run.finished',status:'SUCCEEDED',evidence});
test('activity projection has stable identity explicit unavailable values and redaction',()=>{
  const secret='sk-proj-'+('A'.repeat(24)),first=projectActivity(source({providerId:'provider-a',modelId:'model-a',inputTokens:12,cachedInputTokens:4,outputTokens:3,totalTokens:15,evidenceReference:`artifact:${secret}`})),second=projectActivity(source({providerId:'provider-a',modelId:'model-a',inputTokens:12,cachedInputTokens:4,outputTokens:3,totalTokens:15,evidenceReference:`artifact:${secret}`}));
  assert.equal(first.eventId,second.eventId);assert.deepEqual(first.tokenUsage,{input:12,cachedInput:4,output:3,total:15});assert.equal(JSON.stringify(first).includes(secret),false);assert.equal(first.laneId,'unavailable');
  assert.deepEqual(projectActivity(source()).tokenUsage,{input:'unavailable',cachedInput:'unavailable',output:'unavailable',total:'unavailable'});
});
test('one-event-per-line append supports tailing rotation and private fallback',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'activity-log-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const preferred=path.join(root,'blocked');fs.writeFileSync(preferred,'not-a-directory');const fallback=path.join(root,'private','activity.jsonl'),log=new ActivityLogProjection(path.join(preferred,'activity.jsonl'),fallback);
  log.append(source());log.append({...source(),type:'run.updated'});assert.equal(fs.readFileSync(fallback,'utf8').trim().split('\n').length,2);fs.renameSync(fallback,`${fallback}.1`);log.append({...source(),type:'run.finished'});assert.equal(fs.readFileSync(fallback,'utf8').trim().split('\n').length,1);assert.equal(fs.statSync(fallback).mode&0o777,0o640);
});
test('Linux defaults to conventional var log while Android uses application-private state',()=>{
  assert.equal(activityLogPaths('/private',{},'linux').preferred,'/var/log/agent-control/activity.jsonl');assert.equal(activityLogPaths('/private',{ANDROID_ROOT:'/system'},'linux').preferred,path.join('/private','logs','activity.jsonl'));assert.equal(activityLogPaths('/private',{AGENT_CONTROL_ACTIVITY_LOG:'/custom/events.jsonl'},'linux').preferred,'/custom/events.jsonl');
});
test('normal governed Job events append to the operational projection without becoming authority',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'activity-job-')),file=path.join(root,'external','activity.jsonl'),prior=process.env.AGENT_CONTROL_ACTIVITY_LOG;t.after(()=>{if(prior===undefined)delete process.env.AGENT_CONTROL_ACTIVITY_LOG;else process.env.AGENT_CONTROL_ACTIVITY_LOG=prior;fs.rmSync(root,{recursive:true,force:true})});process.env.AGENT_CONTROL_ACTIVITY_LOG=file;
  const actions=new ActionRegistry();actions.register('example@1.0.0',async()=>({verification:['done']}));const catalog=new JobCatalog(actions.ids());catalog.addJob({apiVersion:'agent-control/v1',kind:'Job',metadata:{id:'example',name:'Example',version:'1.0.0'},spec:{priority:'normal',concurrency:'queue',steps:[{id:'one',action:'example@1.0.0',requires:['example'],verification:['done']}]}});const workers=new WorkerRegistry();workers.registerControllerInternal({id:'internal',capabilities:['example'],health:'healthy',capacity:1,active:0,observedAt:new Date().toISOString()});const runtime=createJobRuntime(root,catalog,actions,workers),run=runtime.createRun('example@1.0.0',{}, {type:'manual',actor:'test'});await runtime.tick();
  const entries=fs.readFileSync(file,'utf8').trim().split('\n').map(line=>JSON.parse(line));assert.equal(entries[0].runId,run.id);assert.equal(entries.at(-1).eventType,'run.finished');assert.equal(entries.at(-1).status,'SUCCEEDED');assert.equal(entries.at(-1).tokenUsage.input,'unavailable');assert.ok(fs.existsSync(path.join(root,'jobs','run-ledger.json')));
});
test('repair preserves a live append inode, retains backup and is idempotent',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'activity-repair-')),file=path.join(root,'activity.jsonl'),log=new ActivityLogProjection(file);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const first=log.append(source()).entry,second=log.append({...source(),at:'2026-09-17T12:00:01.000Z',type:'run.updated'}).entry;
  fs.appendFileSync(file,`${JSON.stringify(second)}\n{broken\n`);
  const before=fs.statSync(file),writer=fs.openSync(file,fs.constants.O_APPEND|fs.constants.O_WRONLY),receipt=log.repair(file),after=fs.statSync(file);
  assert.equal(receipt.status,'REPAIRED');assert.equal(receipt.removed,2);assert.ok(receipt.backup&&fs.existsSync(receipt.backup));assert.equal(before.ino,after.ino);
  const third=projectActivity({...source(),at:'2026-09-17T12:00:02.000Z',type:'run.finished'});fs.writeSync(writer,`${JSON.stringify(third)}\n`);fs.closeSync(writer);
  const entries=fs.readFileSync(file,'utf8').trim().split('\n').map(line=>JSON.parse(line));assert.deepEqual(entries.map(row=>row.eventId),[first.eventId,second.eventId,third.eventId]);
  assert.equal(log.repair(file).status,'NO_CHANGE');
});

test('repair fails closed against concurrent repair lock',t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'activity-repair-lock-')),file=path.join(root,'activity.jsonl'),log=new ActivityLogProjection(file);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));log.append(source());fs.writeFileSync(`${file}.repair.lock`,'held');assert.throws(()=>log.repair(file),/repair_in_progress/);assert.equal(fs.readFileSync(file,'utf8').trim().length>0,true);});

test('repair recovers an interrupted in-place rewrite from its immutable backup',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'activity-repair-recovery-')),file=path.join(root,'activity.jsonl'),log=new ActivityLogProjection(file);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));log.append(source());
  const original=fs.readFileSync(file),beforeSha256=createHash('sha256').update(original).digest('hex'),backup=`${file}.repair-${beforeSha256.slice(0,16)}.bak`,journal=`${file}.repair.json`;
  fs.writeFileSync(backup,original,{mode:0o400});fs.writeFileSync(journal,`${JSON.stringify({schema:'agent-control.activity-repair-journal/v1',file,backup,beforeSha256,afterSha256:'f'.repeat(64),phase:'BACKED_UP'})}\n`);fs.truncateSync(file,0);
  const inode=fs.statSync(file).ino,receipt=log.repair(file);assert.equal(receipt.status,'NO_CHANGE');assert.equal(fs.statSync(file).ino,inode);assert.deepEqual(fs.readFileSync(file),original);assert.equal(fs.existsSync(journal),false);
});

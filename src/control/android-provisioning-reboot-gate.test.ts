import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkQueue} from './work-queue.js';
import {WorkQueueStore} from './work-queue-store.js';
import {ensureAndroidProvisioningMission,ANDROID_REBOOT_RECOVERY_WORK_ID,runAndroidProvisioning} from './android-provisioning-runtime.js';

function ready(){const q=new WorkQueue();ensureAndroidProvisioningMission(q);for(const item of q.all())if(item.id!==ANDROID_REBOOT_RECOVERY_WORK_ID)item.status='completed';q.reconcileDependencies();return q;}
function operations(calls:{reboot:number}){return{detectAdb:async()=>true,installPackage:async()=>({installed:true}),qualifyAdb:async()=>({qualified:true}),obtainTermuxBoot:async()=>({artifactRef:'/tmp/termux-boot.apk',sha256:'a'}),verifyTermuxBoot:async()=>({verified:true,sha256:'a'}),installTermuxBoot:async()=>({installed:true}),verifyTermuxBootPackage:async()=>({installed:true,signingSource:'github' as const}),installBootHook:async()=>({installed:true}),verifyBootHook:async()=>({verified:true}),qualifyRebootRecovery:async()=>{calls.reboot++;return{qualified:true};}};}

test('ready reboot qualification pauses without executing until explicitly approved',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'reboot-gate-'));try{const q=ready(),calls={reboot:0},store=new WorkQueueStore(path.join(dir,'queue.json'));await runAndroidProvisioning({queue:q,store,ops:operations(calls),maxSteps:1});assert.equal(q.get(ANDROID_REBOOT_RECOVERY_WORK_ID)?.status,'human-review');assert.equal(calls.reboot,0);await runAndroidProvisioning({queue:q,store,ops:operations(calls),approveRebootTest:true,maxSteps:1});assert.equal(q.get(ANDROID_REBOOT_RECOVERY_WORK_ID)?.status,'completed');assert.equal(calls.reboot,1);}finally{fs.rmSync(dir,{recursive:true,force:true});}});

test('legacy terminal reboot qualification failure migrates to durable approval',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'reboot-migrate-'));try{const q=ready(),item=q.get(ANDROID_REBOOT_RECOVERY_WORK_ID)!;item.status='failed';item.outcomes=[{at:new Date().toISOString(),attempt:1,error:'qualification_failed:android.unattended.recovery'}];const calls={reboot:0};await runAndroidProvisioning({queue:q,store:new WorkQueueStore(path.join(dir,'queue.json')),ops:operations(calls),maxSteps:1});assert.equal(item.status,'human-review');assert.equal(item.resultRef?.startsWith('NEEDS REBOOT APPROVAL'),true);assert.equal(calls.reboot,0);}finally{fs.rmSync(dir,{recursive:true,force:true});}});

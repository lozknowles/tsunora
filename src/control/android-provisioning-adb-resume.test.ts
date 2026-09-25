import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkQueue} from './work-queue.js';
import {WorkQueueStore} from './work-queue-store.js';
import {ensureAndroidProvisioningMission,ANDROID_INSTALL_WORK_ID,ANDROID_PAIRING_WORK_ID,ANDROID_QUALIFY_ADB_WORK_ID,runAndroidProvisioning} from './android-provisioning-runtime.js';

const operations=(qualified:boolean)=>({detectAdb:async()=>true,installPackage:async()=>({installed:true}),qualifyAdb:async()=>({qualified}),obtainTermuxBoot:async()=>({artifactRef:'/tmp/termux-boot.apk',sha256:'a'}),verifyTermuxBoot:async()=>({verified:true,sha256:'a'}),installTermuxBoot:async()=>({installed:true}),verifyTermuxBootPackage:async()=>({installed:true,signingSource:'github' as const}),installBootHook:async()=>({installed:true}),verifyBootHook:async()=>({verified:true}),qualifyRebootRecovery:async()=>({qualified:true})});

function qualifiedPrefix(){const q=new WorkQueue();ensureAndroidProvisioningMission(q);for(const id of ['android.provision.detect-adb',ANDROID_INSTALL_WORK_ID,ANDROID_PAIRING_WORK_ID])q.get(id)!.status='completed';return q;}

test('persisted ADB qualification failure resumes after fresh transport observation',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'adb-resume-'));
  try{const store=new WorkQueueStore(path.join(dir,'queue.json')),q=qualifiedPrefix(),qualify=q.get(ANDROID_QUALIFY_ADB_WORK_ID)!;qualify.status='failed';qualify.attempts=1;qualify.outcomes=[{at:new Date().toISOString(),attempt:1,error:'qualification_failed:transport.adb'}];q.reconcileDependencies();await runAndroidProvisioning({queue:q,store,ops:operations(true),maxSteps:1});assert.equal(q.get(ANDROID_QUALIFY_ADB_WORK_ID)?.status,'completed');assert.equal(q.get(ANDROID_QUALIFY_ADB_WORK_ID)?.resultRef,'qualified:transport.adb');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('missing paired transport remains durable review rather than terminal failure',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'adb-review-'));
  try{const store=new WorkQueueStore(path.join(dir,'queue.json')),q=qualifiedPrefix();await runAndroidProvisioning({queue:q,store,ops:operations(false),maxSteps:1});assert.equal(q.get(ANDROID_QUALIFY_ADB_WORK_ID)?.status,'human-review');assert.equal(q.get(ANDROID_QUALIFY_ADB_WORK_ID)?.resultRef?.startsWith('NEEDS TRANSPORT'),true);assert.equal(q.get('android.provision.obtain-termux-boot')?.status,'queued');assert.equal(q.ready().some(item=>item.id==='android.provision.obtain-termux-boot'),false);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

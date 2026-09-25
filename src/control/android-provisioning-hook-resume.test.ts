import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkQueue} from './work-queue.js';
import {WorkQueueStore} from './work-queue-store.js';
import {ensureAndroidProvisioningMission,ANDROID_INSTALL_BOOT_HOOK_WORK_ID,runAndroidProvisioning} from './android-provisioning-runtime.js';

const operations=(installed:boolean)=>({detectAdb:async()=>true,installPackage:async()=>({installed:true}),qualifyAdb:async()=>({qualified:true}),obtainTermuxBoot:async()=>({artifactRef:'/tmp/termux-boot.apk',sha256:'a'}),verifyTermuxBoot:async()=>({verified:true,sha256:'a'}),installTermuxBoot:async()=>({installed:true}),verifyTermuxBootPackage:async()=>({installed:true,signingSource:'github' as const}),installBootHook:async()=>({installed}),verifyBootHook:async()=>({verified:installed}),qualifyRebootRecovery:async()=>({qualified:true})});

function hookReady(){const q=new WorkQueue();ensureAndroidProvisioningMission(q);for(const id of ['detect-adb','install-adb','pairing-approval','qualify-adb','obtain-termux-boot','verify-termux-boot','install-termux-boot','verify-termux-boot-package'])q.get(`android.provision.${id}`)!.status='completed';return q;}

test('persisted boot hook failure resumes through the scoped installer',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hook-resume-'));
  try{const store=new WorkQueueStore(path.join(dir,'queue.json')),q=hookReady(),install=q.get(ANDROID_INSTALL_BOOT_HOOK_WORK_ID)!;install.status='failed';install.attempts=1;install.outcomes=[{at:new Date().toISOString(),attempt:1,error:'boot_hook_install_failed'}];q.reconcileDependencies();await runAndroidProvisioning({queue:q,store,ops:operations(true),maxSteps:1});assert.equal(q.get(ANDROID_INSTALL_BOOT_HOOK_WORK_ID)?.status,'completed');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('incomplete boot hook remains durable review',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hook-review-'));
  try{const store=new WorkQueueStore(path.join(dir,'queue.json')),q=hookReady();await runAndroidProvisioning({queue:q,store,ops:operations(false),maxSteps:1});assert.equal(q.get(ANDROID_INSTALL_BOOT_HOOK_WORK_ID)?.status,'human-review');assert.equal(q.get(ANDROID_INSTALL_BOOT_HOOK_WORK_ID)?.resultRef?.startsWith('NEEDS BOOT HOOK'),true);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

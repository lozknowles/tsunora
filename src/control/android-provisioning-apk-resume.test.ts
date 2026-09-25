import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkQueue} from './work-queue.js';
import {WorkQueueStore} from './work-queue-store.js';
import {ensureAndroidProvisioningMission,ANDROID_INSTALL_TERMUX_BOOT_WORK_ID,runAndroidProvisioning} from './android-provisioning-runtime.js';

const operations=(install:boolean)=>({detectAdb:async()=>true,installPackage:async()=>({installed:true}),qualifyAdb:async()=>({qualified:true}),obtainTermuxBoot:async()=>({artifactRef:'/tmp/termux-boot.apk',sha256:'a'}),verifyTermuxBoot:async()=>({verified:true,sha256:'a'}),installTermuxBoot:async()=>{if(!install)throw new Error('DEVICE INSTALL INCOMPLETE: test');return{installed:true};},verifyTermuxBootPackage:async()=>({installed:install,signingSource:'github' as const}),installBootHook:async()=>({installed:true}),verifyBootHook:async()=>({verified:true}),qualifyRebootRecovery:async()=>({qualified:true})});

function installReady(){const q=new WorkQueue();ensureAndroidProvisioningMission(q);for(const id of ['detect-adb','install-adb','pairing-approval','qualify-adb','obtain-termux-boot','verify-termux-boot'])q.get(`android.provision.${id}`)!.status='completed';return q;}

test('persisted timed-out Termux Boot install resumes the same node',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apk-resume-'));
  try{const store=new WorkQueueStore(path.join(dir,'queue.json')),q=installReady(),install=q.get(ANDROID_INSTALL_TERMUX_BOOT_WORK_ID)!;install.status='failed';install.attempts=2;install.outcomes=[{at:new Date().toISOString(),attempt:2,error:'Command failed: adb install -r /tmp/termux-boot.apk'}];q.reconcileDependencies();await runAndroidProvisioning({queue:q,store,ops:operations(true),maxSteps:1});assert.equal(q.get(ANDROID_INSTALL_TERMUX_BOOT_WORK_ID)?.status,'completed');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('incomplete Termux Boot install remains durable device review',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apk-review-'));
  try{const store=new WorkQueueStore(path.join(dir,'queue.json')),q=installReady();await runAndroidProvisioning({queue:q,store,ops:operations(false),maxSteps:1});assert.equal(q.get(ANDROID_INSTALL_TERMUX_BOOT_WORK_ID)?.status,'human-review');assert.equal(q.get(ANDROID_INSTALL_TERMUX_BOOT_WORK_ID)?.resultRef?.startsWith('NEEDS DEVICE INSTALL'),true);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

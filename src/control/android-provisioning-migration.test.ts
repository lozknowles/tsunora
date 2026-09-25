import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkQueue} from './work-queue.js';
import {WorkQueueStore} from './work-queue-store.js';
import {ensureAndroidProvisioningMission,ANDROID_INSTALL_WORK_ID,ANDROID_PAIRING_WORK_ID,runAndroidProvisioning} from './android-provisioning-runtime.js';

const operations=(present:{value:boolean})=>({detectAdb:async()=>present.value,installPackage:async()=>{present.value=true;return{installed:true};},qualifyAdb:async()=>({qualified:true}),obtainTermuxBoot:async()=>({artifactRef:'/tmp/termux-boot.apk',sha256:'a'}),verifyTermuxBoot:async()=>({verified:true,sha256:'a'}),installTermuxBoot:async()=>({installed:true}),verifyTermuxBootPackage:async()=>({installed:true,signingSource:'github' as const}),installBootHook:async()=>({installed:true}),verifyBootHook:async()=>({verified:true}),qualifyRebootRecovery:async()=>({qualified:true})});

test('legacy terminal privilege failure migrates and resumes the blocked mission',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'android-migrate-'));
  try{
    let q=new WorkQueue();
    const store=new WorkQueueStore(path.join(dir,'queue.json'));
    ensureAndroidProvisioningMission(q);
    const detect=q.get('android.provision.detect-adb')!;
    detect.status='completed';detect.resultRef='adb-missing';
    const install=q.get(ANDROID_INSTALL_WORK_ID)!;
    install.status='failed';install.attempts=2;
    install.outcomes=[{at:new Date().toISOString(),attempt:2,error:'Command failed: sudo -n -v\nsudo: a password is required\n'}];
    for(const item of q.all())if(item.dependsOn.length)item.status='blocked';
    store.save(q);q=store.load();
    const present={value:false};
    await runAndroidProvisioning({queue:q,store,ops:operations(present),approveInstall:true,maxSteps:10});
    assert.equal(present.value,true);
    assert.equal(q.get(ANDROID_INSTALL_WORK_ID)?.status,'completed');
    assert.equal(q.get(ANDROID_PAIRING_WORK_ID)?.status,'human-review');
    assert.equal(q.get('android.provision.qualify-adb')?.status,'blocked');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

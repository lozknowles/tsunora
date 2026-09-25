import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_MOBILE_POLICY,assessMobileOperation,validateMobilePolicy,runtimeCapability} from './mobile-resource-policy.js';
import {isAndroidUserspace} from './android-environment.js';
const now=Date.now(),good={observedAt:new Date(now).toISOString(),batteryPercent:80,charging:true,thermalCelsius:30,metered:false,availableRamBytes:4*1024**3,freeStorageBytes:8*1024**3,background:false};
const request={downloadBytes:100*1024**2,estimatedRamBytes:1024**3};
test('Android profile follows host observations, not a desktop profile flag',()=>{
 assert.equal(isAndroidUserspace('android',{}),true);
 assert.equal(isAndroidUserspace('linux',{AGENT_CONTROL_DEPLOYMENT_PROFILE:'ANDROID_STANDALONE_WEB'}),false);
});
test('Mobile grants remain separate from feasibility',()=>assert.deepEqual(assessMobileOperation('BENCHMARK',good,DEFAULT_MOBILE_POLICY,request,now),{allowed:true,state:'APPROVAL_REQUIRED',reasons:[],authorityGranted:false}));
for(const [field,value,reason] of [['charging',false,'CHARGING_REQUIRED'],['charging',null,'CHARGING_UNKNOWN'],['batteryPercent',20,'BATTERY_THRESHOLD_UNPROVEN'],['thermalCelsius',42,'THERMAL_LIMIT_OR_UNKNOWN'],['thermalCelsius',null,'THERMAL_LIMIT_OR_UNKNOWN'],['background',true,'FOREGROUND_REQUIRED'],['availableRamBytes',100,'AVAILABLE_MEMORY_INSUFFICIENT'],['freeStorageBytes',100,'STORAGE_RESERVE_REQUIRED']] as const)
 test('Benchmark blocks '+field+' '+value,()=>assert.ok(assessMobileOperation('BENCHMARK',{...good,[field]:value},DEFAULT_MOBILE_POLICY,request,now).reasons.includes(reason)));
test('Downloads block metered or unknown transport and oversized artifacts',()=>{
 for(const metered of [true,null])assert.equal(assessMobileOperation('DOWNLOAD',{...good,metered},DEFAULT_MOBILE_POLICY,request,now).allowed,false);
 assert.equal(assessMobileOperation('DOWNLOAD',good,DEFAULT_MOBILE_POLICY,{...request,downloadBytes:2*1024**3},now).allowed,false);
});
test('Policies cannot admit stale or malformed observations',()=>{
 assert.equal(assessMobileOperation('BENCHMARK',{...good,observedAt:new Date(now-60000).toISOString()},DEFAULT_MOBILE_POLICY,request,now).allowed,false);
 assert.throws(()=>validateMobilePolicy({maximumObservationAgeMs:Infinity}));
 assert.throws(()=>validateMobilePolicy({chargingRequired:'false'}));
});
test('Capability classification preserves installed, incompatible and provisionable distinctions',()=>{
 const p={installed:false,hostArchitecture:'arm64',architectures:['arm64'],platformSupported:true,provisionerAvailable:true};
 assert.equal(runtimeCapability(p),'PROVISIONABLE');assert.equal(runtimeCapability({...p,installed:true}),'AVAILABLE');
 assert.equal(runtimeCapability({...p,architectures:['x64']}),'INCOMPATIBLE');assert.equal(runtimeCapability({...p,platformSupported:false}),'UNSUPPORTED');
});

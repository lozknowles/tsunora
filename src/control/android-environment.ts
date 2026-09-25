import fs from 'node:fs';
import os from 'node:os';
import type {DiscoveryProbe} from './environment-discovery.js';
import {DEFAULT_MOBILE_POLICY,runtimeCapability, type MobileObservation} from './mobile-resource-policy.js';
export const ANDROID_STANDALONE_WEB='ANDROID_STANDALONE_WEB' as const;
export function isAndroidUserspace(platform:string=process.platform,environment:NodeJS.ProcessEnv=process.env){
 return platform==='android'||Boolean(environment.TERMUX_VERSION&&environment.PREFIX?.startsWith('/data/data/com.termux/'));
}
export async function observeAndroid(probe:DiscoveryProbe,cwd=process.cwd()){
 const command=async(name:string,args:string[])=>{const result=await probe.command(name,args,1500);return result.ok?result.stdout.trim().slice(0,200):null;};
 const [model,version,cpu]=await Promise.all([command('getprop',['ro.product.model']),command('getprop',['ro.build.version.release']),command('getprop',['ro.soc.model'])]);
 let freeStorageBytes:number|null=null,availableRamBytes:number|null=null;
 try{const s=fs.statfsSync(cwd);freeStorageBytes=s.bavail*s.bsize;}catch{}
 try{const m=fs.readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+) kB/m);availableRamBytes=m?Number(m[1])*1024:null;}catch{}
 // Base Termux does not grant battery, thermal or metering APIs. No helper is silently installed.
 const runtimeCapabilities=[{id:'node',version:process.version,state:runtimeCapability({installed:true,hostArchitecture:os.arch(),architectures:[os.arch()],platformSupported:true,provisionerAvailable:false})},{id:'desktop-executable',state:runtimeCapability({installed:false,hostArchitecture:os.arch(),architectures:['x64'],platformSupported:false,provisionerAvailable:false})}];
 const observation:MobileObservation={observedAt:new Date().toISOString(),freeStorageBytes,availableRamBytes,batteryPercent:null,charging:null,thermalCelsius:null,metered:null,background:null};
 return {profile:ANDROID_STANDALONE_WEB,label:model??'Android device',androidVersion:version??'UNKNOWN',architecture:os.arch(),cpu:cpu??'UNKNOWN',
  controlPlane:'LOCAL',dashboard:'LOCAL_LOOPBACK',worker:'LOCAL',transport:'local',accelerator:'UNKNOWN',
  runtimeCapabilities,runtimeVersion:process.version,totalRamBytes:os.totalmem(),...observation,
  batteryTelemetry:'UNAVAILABLE',thermalTelemetry:'UNAVAILABLE',networkMetering:'UNKNOWN',
  backgroundReliability:'ANDROID_MAY_TERMINATE_PROCESS',remoteResourcesRequired:false,localModelRequired:false,
  policy:DEFAULT_MOBILE_POLICY};
}

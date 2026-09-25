export interface MobileObservation {
  observedAt:string; batteryPercent:number|null; charging:boolean|null; thermalCelsius:number|null;
  metered:boolean|null; availableRamBytes:number|null; freeStorageBytes:number|null; background:boolean|null;
}
export interface MobileResourcePolicy {
  chargingRequired:boolean; minimumBatteryPercent:number; maximumThermalCelsius:number;
  allowMeteredDownloads:boolean; maximumDownloadBytes:number; minimumFreeStorageBytes:number;
  allowBackgroundBenchmark:boolean; maximumObservationAgeMs:number; memoryReserveBytes:number;
}
export const DEFAULT_MOBILE_POLICY:Readonly<MobileResourcePolicy>=Object.freeze({
 chargingRequired:true,minimumBatteryPercent:50,maximumThermalCelsius:40,allowMeteredDownloads:false,
 maximumDownloadBytes:1024**3,minimumFreeStorageBytes:2*1024**3,allowBackgroundBenchmark:false,
 maximumObservationAgeMs:30000,memoryReserveBytes:512*1024**2
});
export function validateMobilePolicy(value:unknown):MobileResourcePolicy {
 const p={...DEFAULT_MOBILE_POLICY,...value as object};
 for(const k of ['chargingRequired','allowMeteredDownloads','allowBackgroundBenchmark'] as const)
  if(typeof p[k]!=='boolean')throw Error('mobile_policy_invalid');
 for(const k of ['minimumBatteryPercent','maximumThermalCelsius','maximumDownloadBytes','minimumFreeStorageBytes','maximumObservationAgeMs','memoryReserveBytes'] as const)
  if(!Number.isFinite(p[k])||p[k]<0)throw Error('mobile_policy_invalid');
 if(p.minimumBatteryPercent>100||p.maximumThermalCelsius>60||p.maximumObservationAgeMs>300000||p.maximumObservationAgeMs===0)throw Error('mobile_policy_invalid');
 return p;
}
export function assessMobileOperation(operation:'DOWNLOAD'|'BENCHMARK',observation:MobileObservation,policy:MobileResourcePolicy,request:{downloadBytes:number;estimatedRamBytes:number},now=Date.now()){
 const p=validateMobilePolicy(policy),o=observation,reasons:string[]=[];
 for(const v of [o.charging,o.metered,o.background])if(v!==null&&typeof v!=='boolean')reasons.push('OBSERVATION_INVALID');
 if(o.batteryPercent!==null&&(!Number.isFinite(o.batteryPercent)||o.batteryPercent<0||o.batteryPercent>100))reasons.push('OBSERVATION_INVALID');
 for(const v of [o.availableRamBytes,o.freeStorageBytes])if(v!==null&&(!Number.isFinite(v)||v<0))reasons.push('OBSERVATION_INVALID');
 if(o.thermalCelsius!==null&&(!Number.isFinite(o.thermalCelsius)||o.thermalCelsius< -20))reasons.push('OBSERVATION_INVALID');
 if(!Number.isFinite(Date.parse(o.observedAt))||now-Date.parse(o.observedAt)>p.maximumObservationAgeMs||Date.parse(o.observedAt)>now+1000)reasons.push('OBSERVATION_STALE');
 if(!Number.isSafeInteger(request.downloadBytes)||request.downloadBytes<0||!Number.isSafeInteger(request.estimatedRamBytes)||request.estimatedRamBytes<0)reasons.push('RESOURCE_ESTIMATE_INVALID');
 if(o.freeStorageBytes===null||o.freeStorageBytes-request.downloadBytes*1.1<p.minimumFreeStorageBytes)reasons.push('STORAGE_RESERVE_REQUIRED');
 if(operation==='DOWNLOAD'){
  if(request.downloadBytes>p.maximumDownloadBytes)reasons.push('DOWNLOAD_SIZE_LIMIT');
  if(request.downloadBytes>0&&!p.allowMeteredDownloads&&o.metered!==false)reasons.push(o.metered===null?'METERING_UNKNOWN':'METERED_DOWNLOAD_DENIED');
 }else{
  if(p.chargingRequired&&o.charging!==true)reasons.push(o.charging===null?'CHARGING_UNKNOWN':'CHARGING_REQUIRED');
  if(o.batteryPercent===null||!Number.isFinite(o.batteryPercent)||o.batteryPercent<p.minimumBatteryPercent)reasons.push('BATTERY_THRESHOLD_UNPROVEN');
  if(o.thermalCelsius===null||!Number.isFinite(o.thermalCelsius)||o.thermalCelsius>=p.maximumThermalCelsius)reasons.push('THERMAL_LIMIT_OR_UNKNOWN');
  if(!p.allowBackgroundBenchmark&&o.background!==false)reasons.push('FOREGROUND_REQUIRED');
  if(o.availableRamBytes===null||o.availableRamBytes<request.estimatedRamBytes+p.memoryReserveBytes)reasons.push('AVAILABLE_MEMORY_INSUFFICIENT');
 }
 return {allowed:reasons.length===0,state:reasons.length?'BLOCKED_RESOURCE_POLICY':'APPROVAL_REQUIRED',reasons,authorityGranted:false as const};
}
export type RuntimeCapabilityState='AVAILABLE'|'INCOMPATIBLE'|'PROVISIONABLE'|'UNSUPPORTED';
export function runtimeCapability(input:{installed:boolean;hostArchitecture:string;architectures:string[];platformSupported:boolean;provisionerAvailable:boolean}):RuntimeCapabilityState {
 if(!input.platformSupported)return 'UNSUPPORTED';
 if(!input.architectures.includes(input.hostArchitecture))return 'INCOMPATIBLE';
 return input.installed?'AVAILABLE':input.provisionerAvailable?'PROVISIONABLE':'UNSUPPORTED';
}

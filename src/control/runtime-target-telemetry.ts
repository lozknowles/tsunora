import type {ActionContext} from './job-types.js';
export interface TargetObservation {
 observedAt:string; connected:boolean; batteryPercent:number|null; charging:boolean|null;
 thermalCelsius:number|null; thermalStatus:number|null; availableRamBytes:number|null; freeStorageBytes:number|null;
 serviceHealthy:boolean|null; serviceIdle:boolean|null; evidence:unknown;
}
export interface TargetResourcePolicy {
 batteryRequired:boolean; chargingRequired:boolean; minimumBatteryPercent:number; maximumThermalCelsius:number;
 maximumThermalStatus:number; minimumAvailableBytes:number; minimumFreeStorageBytes:number; maximumObservationAgeMs:number;
}
export interface TargetTelemetry {
 id:string; observe(context:ActionContext):Promise<TargetObservation>;
}
export function assessTargetAdmission(o:TargetObservation,p:TargetResourcePolicy,now=Date.now()) {
 const reasons:string[]=[];
 if(!o.connected)reasons.push('TARGET_UNREACHABLE');
 const age=now-Date.parse(o.observedAt);if(!Number.isFinite(age)||age< -1000||age>p.maximumObservationAgeMs)reasons.push('TELEMETRY_STALE');
 const valid=(v:number|null)=>v!==null&&Number.isFinite(v)&&v>=0;
 if(!valid(o.availableRamBytes)||o.availableRamBytes!<p.minimumAvailableBytes)reasons.push('MEMORY_UNAVAILABLE_OR_INSUFFICIENT');
 if(!valid(o.freeStorageBytes)||o.freeStorageBytes!<p.minimumFreeStorageBytes)reasons.push('STORAGE_UNAVAILABLE_OR_INSUFFICIENT');
 if(o.serviceHealthy===false||o.serviceIdle===false)reasons.push('SERVICE_UNAVAILABLE_OR_BUSY');
 if(p.batteryRequired){
  if(!valid(o.batteryPercent)||o.batteryPercent!>100||o.batteryPercent!<p.minimumBatteryPercent)reasons.push('BATTERY_UNAVAILABLE_OR_LOW');
  if(o.thermalCelsius===null||!Number.isFinite(o.thermalCelsius)||o.thermalCelsius>=p.maximumThermalCelsius)reasons.push('THERMAL_LIMIT_OR_UNKNOWN');
  if(!valid(o.thermalStatus)||o.thermalStatus!>=p.maximumThermalStatus)reasons.push('THERMAL_STATE_LIMIT_OR_UNKNOWN');
 }
 if(p.chargingRequired&&o.charging!==true)reasons.push('CHARGING_REQUIRED_OR_UNKNOWN');
 return {decision:reasons.length?'REFUSE':'ADMIT',allowed:!reasons.length,reasons};
}
export function validateTargetPolicy(p:TargetResourcePolicy){
 if(!p||typeof p.batteryRequired!=='boolean'||typeof p.chargingRequired!=='boolean')throw Error('target_policy_invalid');
 for(const k of ['minimumBatteryPercent','maximumThermalCelsius','maximumThermalStatus','minimumAvailableBytes','minimumFreeStorageBytes','maximumObservationAgeMs'] as const)if(!Number.isFinite(p[k])||p[k]<0)throw Error('target_policy_invalid');
 if(p.minimumBatteryPercent>100||p.maximumThermalCelsius>40||p.maximumThermalCelsius<=0||p.maximumThermalStatus<1||p.maximumObservationAgeMs<1||p.maximumObservationAgeMs>30000)throw Error('target_policy_invalid');
 return structuredClone(p);
}

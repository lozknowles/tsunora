export type MeasurementAuthority = 'authoritative' | 'derived' | 'unavailable';
export type MeasurementFreshness = 'current' | 'stale' | 'unavailable';

export interface ResourceMeasurement<T> {
  value: T | null;
  source: string;
  authority: MeasurementAuthority;
  freshness: MeasurementFreshness;
  observedAt: string;
  intervalMs?: number;
  limitations: string[];
  qualifiedForAdmission: boolean;
}

export interface CpuCounterFrame {
  kind: 'procfs-times' | 'sysfs-idle';
  observedAt: string;
  logicalOnline: number | null;
  counters: Array<{cpu: string; online: boolean; idle: number; total?: number}>;
}

/** Provider-neutral execution memory evidence. Hardware adapters populate this shape. */
export interface ExecutionResourceSample {
  observedAt: string;
  elapsedMs: number;
  process: {
    pid: number;
    identityToken: string;
    state: 'same' | 'absent' | 'reused';
    rssBytes: number | null;
    peakRssBytes: number | null;
  };
  accelerator: {
    processBytes: number | null;
    deviceUsedBytes: number | null;
    utilizationPercent: number | null;
    source: string;
    limitations: string[];
  };
}

export interface ExecutionResourceSummary {
  cpuMs: number | null;
  gpuMs: number | null;
  peakRamBytes: number | null;
  peakVramBytes: number | null;
  energyWh: number | null;
  authority: 'MEASURED' | 'ESTIMATED' | 'UNAVAILABLE';
  sampleCount: number;
  attributedSampleCount: number;
  samplingIntervalMs: number;
  baseline: {ramBytes: number | null; processVramBytes: number | null; deviceVramBytes: number | null};
  devicePeakVramBytes: number | null;
  source: string;
  limitations: string[];
}

export function unavailableMeasurement<T>(observedAt: string, source: string, limitation: string): ResourceMeasurement<T> {
  return {value: null, source, authority: 'unavailable', freshness: 'unavailable', observedAt, limitations: [limitation], qualifiedForAdmission: false};
}

export function scalarMeasurement<T>(value: T | null, observedAt: string, source?: string): ResourceMeasurement<T> {
  return value === null
    ? unavailableMeasurement(observedAt, source || 'unavailable', 'measurement_not_reported')
    : {value, source: source || 'unspecified', authority: 'authoritative', freshness: 'current', observedAt, limitations: [], qualifiedForAdmission: false};
}

export function deriveCpuBusy(previous: CpuCounterFrame | undefined, current: CpuCounterFrame | undefined, staleAfterMs: number): ResourceMeasurement<number> {
  const observedAt=current?.observedAt ?? new Date(0).toISOString(),source=current?.kind==='procfs-times'?'/proc/stat':current?.kind==='sysfs-idle'?'/sys/devices/system/cpu/*/cpuidle/state*/time':'unavailable';
  if(!current)return unavailableMeasurement(observedAt,source,'cpu_counters_unavailable');
  if(!previous||previous.kind!==current.kind)return unavailableMeasurement(observedAt,source,'first_sample_requires_prior_counter_frame');
  const intervalMs=Date.parse(current.observedAt)-Date.parse(previous.observedAt);
  if(!Number.isFinite(intervalMs)||intervalMs<=0)return {...unavailableMeasurement<number>(observedAt,source,'sampling_interval_invalid'),intervalMs};
  if(intervalMs>staleAfterMs)return {value:null,source,authority:'unavailable',freshness:'stale',observedAt,intervalMs,limitations:['sampling_interval_stale'],qualifiedForAdmission:false};
  if(current.kind==='procfs-times'){
    const before=previous.counters.find(item=>item.cpu==='aggregate'),after=current.counters.find(item=>item.cpu==='aggregate');
    if(!before||!after||before.total===undefined||after.total===undefined)return {...unavailableMeasurement<number>(observedAt,source,'aggregate_cpu_counter_missing'),intervalMs};
    const total=after.total-before.total,idle=after.idle-before.idle;
    if(total<=0||idle<0||idle>total)return {...unavailableMeasurement<number>(observedAt,source,idle<0||total<0?'cpu_counter_reset':'cpu_counter_interval_invalid'),intervalMs};
    return {value:boundedPercent((1-idle/total)*100),source,authority:'authoritative',freshness:'current',observedAt,intervalMs,limitations:['aggregate_busy_only_no_user_system_projection'],qualifiedForAdmission:false};
  }
  const before=new Map(previous.counters.map(item=>[item.cpu,item])),visible=current.counters.filter(item=>item.online&&before.get(item.cpu)?.online),limitations=['derived_busy_only_no_user_system_breakdown','not_qualified_for_admission'];
  if(!visible.length)return {...unavailableMeasurement<number>(observedAt,source,'no_continuously_online_visible_cpu'),intervalMs};
  if(current.logicalOnline!==null&&visible.length<current.logicalOnline)limitations.push('partial_cpu_visibility');
  let idleDelta=0;
  for(const item of visible){const prior=before.get(item.cpu)!;if(item.idle<prior.idle)return {...unavailableMeasurement<number>(observedAt,source,'cpu_idle_counter_reset'),intervalMs};idleDelta+=item.idle-prior.idle;}
  const possibleIdle=intervalMs*1000*visible.length;
  if(possibleIdle<=0||idleDelta>possibleIdle*1.05)return {...unavailableMeasurement<number>(observedAt,source,'cpu_idle_counter_interval_invalid'),intervalMs};
  return {value:boundedPercent((1-Math.min(idleDelta,possibleIdle)/possibleIdle)*100),source,authority:'derived',freshness:'current',observedAt,intervalMs,limitations,qualifiedForAdmission:false};
}

function boundedPercent(value:number){return Math.max(0,Math.min(100,value));}

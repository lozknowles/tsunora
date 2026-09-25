import type {PowerSample,EnergyScope,EnergyBaseline} from './energy-telemetry.js';
import {addMoney,decimalScale,legacyDecimal,multiplyDecimal,exact,measuredMoney} from './usage-accounting.js';
import type {HomeAssistantEstateAdapter} from './model-intelligence-adapters.js';

export type MeasurementClass='WHOLE_NODE_MEASURED'|'COMPONENT_MEASURED'|'DERIVED'|'ESTIMATED'|'UNAVAILABLE';
export interface EnergyTariff {id:string;version:string;currency:string;pricePerKwh:string;effectiveStart:string;effectiveEnd:string;}
export interface ValidatedBaseline extends EnergyBaseline {sensorId:string;workloadState:'IDLE';methodology:string;conditions:string;}
export interface EnergyMeasurementInput {invocationId:string;parcelId:string;stageId:string;providerId:string;modelId:string;modelRevision:string|null;runtime:string|null;runtimeVersion:string|null;nodeId:string;sensorId:string;scope:EnergyScope;samples:PowerSample[];maxGapMs:number;attribution:'DEDICATED_MEASUREMENT'|'SHARED_ATTRIBUTED'|'ESTIMATED'|'NOT_ATTRIBUTABLE';allocationFraction?:number;concurrentInvocationIds:string[];concurrencyEvidence:string[];methodology:string;conditions:string;baseline?:ValidatedBaseline|null;baselineMaxAgeMs:number;tariffs:EnergyTariff[];tokens:number|null;verified:boolean;successful:boolean;}
export interface EnergyAccounting {invocationId:string;sensorId:string;measurementClass:MeasurementClass;sensorMeasurementClass:MeasurementClass;attribution:EnergyMeasurementInput['attribution'];allocationFraction:number;modelRevision:string|null;runtime:string|null;runtimeVersion:string|null;methodology:string;conditions:string;concurrentInvocationIds:string[];concurrencyEvidence:string[];maxGapMs:number;coverage:number;observedMs:number;excludedIntervals:Array<{start:string;end:string;reason:string}>;baselineStatus:string;attributedWh:number|null;incrementalAttributedWh:number|null;electricityCost:{amount:string;currency:string;authority:'DERIVED';basis:EnergyTariff[]}|null;}
const date=(s:string)=>{const n=Date.parse(s);if(!Number.isFinite(n))throw Error('energy_timestamp_invalid');return n;};
export function integratePower(input:EnergyMeasurementInput){
  if(!input.invocationId||!input.sensorId||!input.methodology||!input.conditions||!Number.isFinite(input.maxGapMs)||input.maxGapMs<=0||!Number.isFinite(input.baselineMaxAgeMs)||input.baselineMaxAgeMs<0)throw Error('energy_measurement_metadata_required');
  const samples=[...input.samples].sort((a,b)=>date(a.at)-date(b.at));if(samples.length<2)throw Error('energy_samples_insufficient');
  for(const s of samples)if(s.nodeId!==input.nodeId||s.scope!==input.scope||s.watts!==null&&(!Number.isFinite(s.watts)||s.watts<0))throw Error('energy_sample_scope_or_value_invalid');
  const startedAt=samples[0]!.at,completedAt=samples.at(-1)!.at,elapsedMs=date(completedAt)-date(startedAt);if(elapsedMs<=0)throw Error('energy_interval_invalid');
  const excludedIntervals:EnergyAccounting['excludedIntervals']=[],segments:Array<{start:number;end:number;w0:number;w1:number;wh:number}>=[];let observedMs=0,grossWh=0;
  for(let i=1;i<samples.length;i++){const a=samples[i-1]!,b=samples[i]!,ms=date(b.at)-date(a.at);if(ms<=0)throw Error('energy_duplicate_sample_time');if(a.watts===null||b.watts===null||a.authority==='UNAVAILABLE'||b.authority==='UNAVAILABLE'||ms>input.maxGapMs){excludedIntervals.push({start:a.at,end:b.at,reason:ms>input.maxGapMs?'SAMPLE_GAP':'MISSING_POWER'});continue;}const wh=(a.watts+b.watts)/2*ms/3_600_000;segments.push({start:date(a.at),end:date(b.at),w0:a.watts,w1:b.watts,wh});observedMs+=ms;grossWh+=wh;}
  let attribution=input.attribution;const fraction=input.allocationFraction??1;
  if(!Number.isFinite(fraction)||fraction<=0||fraction>1)throw Error('energy_allocation_invalid');
  if(!input.concurrencyEvidence.length||attribution==='DEDICATED_MEASUREMENT'&&(input.concurrentInvocationIds.length>0||fraction!==1))attribution='NOT_ATTRIBUTABLE';
  if(attribution==='SHARED_ATTRIBUTED'&&(!input.concurrentInvocationIds.length||input.allocationFraction===undefined))attribution='NOT_ATTRIBUTABLE';
  const baseline=input.baseline;let baselineStatus='UNAVAILABLE';
  if(baseline){const age=date(startedAt)-date(baseline.completedAt);baselineStatus=baseline.nodeId!==input.nodeId||baseline.scope!==input.scope||baseline.sensorId!==input.sensorId?'IDENTITY_MISMATCH':age<0||age>input.baselineMaxAgeMs?'STALE':baseline.workloadState!=='IDLE'||baseline.methodology!==input.methodology||baseline.conditions!==input.conditions?'CONDITIONS_MISMATCH':baseline.sampleCount<2||date(baseline.completedAt)<=date(baseline.startedAt)||baseline.authority!=='MEASURED'||!Number.isFinite(baseline.averageWatts)||baseline.averageWatts<0?'UNQUALIFIED':'VALID';}
  const attributable=observedMs>0&&attribution!=='NOT_ATTRIBUTABLE';const attributedWh=attributable?grossWh*fraction:null;
  const incrementalAttributedWh=attributedWh!==null&&baselineStatus==='VALID'?Math.max(0,grossWh-baseline!.averageWatts*observedMs/3_600_000)*fraction:null;
  let electricityCost:EnergyAccounting['electricityCost']=null;
  // Tariff intervals are explicit UTC periods. Split each observed power segment at tariff boundaries.
  if(attributable&&input.scope==='WHOLE_NODE'&&input.tariffs.length){let amount='0',valid=true;const basis:EnergyTariff[]=[];
    for(const t of input.tariffs){if(!t.id||!t.version||!(/^[A-Z]{3}$/).test(t.currency)||Number(exact(t.pricePerKwh))<0||date(t.effectiveEnd)<=date(t.effectiveStart))throw Error('energy_tariff_invalid');}
    for(const s of segments){const cuts=[s.start,s.end,...input.tariffs.flatMap(t=>[date(t.effectiveStart),date(t.effectiveEnd)]).filter(t=>t>s.start&&t<s.end)].sort((a,b)=>a-b);for(let i=1;i<cuts.length;i++){const a=cuts[i-1]!,b=cuts[i]!;if(a===b)continue;const ts=input.tariffs.filter(t=>date(t.effectiveStart)<=a&&date(t.effectiveEnd)>=b);if(ts.length!==1){valid=false;continue;}const t=ts[0]!;if(!basis.includes(t))basis.push(t);const wa=s.w0+(s.w1-s.w0)*(a-s.start)/(s.end-s.start),wb=s.w0+(s.w1-s.w0)*(b-s.start)/(s.end-s.start),wh=(wa+wb)/2*(b-a)/3_600_000*fraction;amount=addMoney(amount,decimalScale(multiplyDecimal(legacyDecimal(wh),t.pricePerKwh),3));}}
    if(valid&&new Set(basis.map(t=>t.currency)).size===1)electricityCost={amount:measuredMoney(amount),currency:basis[0]!.currency,authority:'DERIVED',basis:structuredClone(basis)};
  }
  const measured=samples.filter(s=>s.watts!==null&&s.authority!=='UNAVAILABLE');
  const estimated=measured.some(s=>s.authority==='ESTIMATED');
  const accounting:EnergyAccounting={invocationId:input.invocationId,sensorId:input.sensorId,measurementClass:observedMs===0?'UNAVAILABLE':estimated?'ESTIMATED':'DERIVED',sensorMeasurementClass:observedMs===0?'UNAVAILABLE':estimated?'ESTIMATED':measured.some(s=>s.authority!=='MEASURED')?'DERIVED':input.scope==='WHOLE_NODE'?'WHOLE_NODE_MEASURED':'COMPONENT_MEASURED',attribution,allocationFraction:fraction,modelRevision:input.modelRevision,runtime:input.runtime,runtimeVersion:input.runtimeVersion,methodology:input.methodology,conditions:input.conditions,concurrentInvocationIds:[...input.concurrentInvocationIds],concurrencyEvidence:[...input.concurrencyEvidence],maxGapMs:input.maxGapMs,coverage:observedMs/elapsedMs,observedMs,excludedIntervals,baselineStatus,attributedWh,incrementalAttributedWh,electricityCost};
  return {startedAt,completedAt,elapsedMs,grossWh:observedMs?grossWh:null,incrementalWh:baselineStatus==='VALID'&&observedMs?Math.max(0,grossWh-baseline!.averageWatts*observedMs/3_600_000):null,averageWatts:observedMs?grossWh*3_600_000/observedMs:null,peakWatts:measured.length?Math.max(...measured.map(s=>s.watts!)):null,sampleCount:measured.length,accounting};
}

export interface ApprovedEnergyBinding {id:string;entityId:string;nodeId:string;scope:EnergyScope;approvedAt:string;expiresAt:string;measurement:'POWER'|'ENERGY_COUNTER';}
/** OBSERVE is checked by the existing adapter. This port exposes no control method. */
export async function observeBoundEnergy(adapter:Pick<HomeAssistantEstateAdapter,'observe'>,binding:ApprovedEnergyBinding,now=new Date()){
  if(!binding.id||!binding.entityId||!binding.nodeId||date(binding.approvedAt)>now.getTime()||date(binding.expiresAt)<=now.getTime())throw Error('energy_binding_approval_required');
  const value=await adapter.observe(binding.entityId);const n=Number(value.state);if(value.state.trim()===''||!Number.isFinite(n)||n<0)throw Error('energy_sensor_unavailable');
  const units:Record<string,number>=binding.measurement==='POWER'?{W:1,kW:1000}:{Wh:1,kWh:1000};const factor=(units as Record<string,number>)[value.unit??''];if(!factor)throw Error('energy_sensor_unit_unsupported');
  return {bindingId:binding.id,entityId:binding.entityId,nodeId:binding.nodeId,scope:binding.scope,at:value.observedAt,kind:binding.measurement,value:n*factor,unit:binding.measurement==='POWER'?'W':'Wh',authority:'HOME_ASSISTANT_REPORTED',permission:'OBSERVE',physicalVerification:false};
}

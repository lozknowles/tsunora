import {createHash} from 'node:crypto';
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const canonical=(value:unknown):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}':JSON.stringify(value)??'null';
const metrics=['promptTokPerSecond','generationTokPerSecond','timeToFirstTokenSeconds','elapsedSeconds','peakVramMiB','peakRamBytes','peakTemperatureC','peakPowerWatts'] as const;

/** One qualification only. No pooling across devices, models, runtime hashes or runs. */
export function labCaseStatistics(attempts:unknown[]){
 const groups=new Map<string,{caseSha256:string;configurationSha256:string;attempts:Record<string,unknown>[]}>();
 let ungrouped=0;
 for(const raw of attempts){
  const a=record(raw);
  if(typeof a.caseSha256!=='string'||!/^[a-f0-9]{64}$/.test(a.caseSha256)||!a.configuration||typeof a.configuration!=='object'){ungrouped++;continue;}
  const configurationSha256=createHash('sha256').update(canonical(a.configuration)).digest('hex'),key=a.caseSha256+':'+configurationSha256;
  const group=groups.get(key)??{caseSha256:a.caseSha256,configurationSha256,attempts:[]};group.attempts.push(a);groups.set(key,group);
 }
 return {ungrouped,groups:[...groups.values()].sort((a,b)=>(a.caseSha256+a.configurationSha256).localeCompare(b.caseSha256+b.configurationSha256)).map(group=>({
  caseSha256:group.caseSha256,configurationSha256:group.configurationSha256,attempts:group.attempts.length,
  quality:{passed:group.attempts.filter(a=>a.quality==='PASS').length,failed:group.attempts.filter(a=>a.quality==='FAIL').length,unknown:group.attempts.filter(a=>!['PASS','FAIL'].includes(String(a.quality))).length},
  measurements:Object.fromEntries(metrics.map(metric=>{
   const values=group.attempts.flatMap(a=>{const v=record(a.metrics)[metric];return typeof v==='number'&&Number.isFinite(v)&&v>=0?[v]:[];});
   const mean=values.length?values.reduce((sum,v)=>sum+v/values.length,0):null;
   const deviation=values.length>1&&mean!==null?Math.sqrt(values.reduce((sum,v)=>sum+(v-mean)**2,0)/(values.length-1)):null;
   return[metric,{count:values.length,missing:group.attempts.length-values.length,mean,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null,standardDeviation:deviation!==null&&Number.isFinite(deviation)?deviation:null}];
  })),
 })),comparisonBoundary:'Groups require identical case and configuration hashes within one recorded qualification. Quality failures remain included and visible. No winner, stable context or capacity is inferred from these descriptive statistics.'};
}

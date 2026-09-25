import os from 'node:os';
import fs from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {ResourceMeasurement} from './resource-telemetry.js';
import {scalarMeasurement, unavailableMeasurement} from './resource-telemetry.js';

const execute = promisify(execFile);
/** Read-only native sampler. Never probes a remote address or launches a model. */
export class LocalNodeResources {
  private readonly cpu = new CpuCounterSampler();
  private readonly pending=new Map<string,Promise<Awaited<ReturnType<LocalNodeResources['collect']>>>>();
  private readonly cached=new Map<string,Awaited<ReturnType<LocalNodeResources['collect']>>>();
  async sample(accelerators: Array<{id: string; index: number; adapter: string}>) {
    const key=JSON.stringify(accelerators.map(a=>[a.id,a.index,a.adapter]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
    const cached=this.cached.get(key);if(cached&&Date.now()-Date.parse(cached.observedAt)<1000)return cached;
    const pending=this.pending.get(key);if(pending)return pending;
    const collecting=this.collect(accelerators);this.pending.set(key,collecting);
    try {const result=await collecting;if(this.cached.size>=16)this.cached.delete(this.cached.keys().next().value!);this.cached.set(key,result);return result;}finally{this.pending.delete(key);}

  }
  private async collect(accelerators: Array<{id: string; index: number; adapter: string}>) {
    const now=Date.now(),at=new Date(now).toISOString(),cpus=os.cpus();
    const current={at:now,total:cpus.reduce((n,c)=>n+Object.values(c.times).reduce((a,b)=>a+b,0),0),idle:cpus.reduce((n,c)=>n+c.times.idle,0)};
    const busy=this.cpu.measure(current);
    let storage:{totalBytes:number;availableBytes:number}|null=null;
    try {const s=fs.statfsSync(process.cwd());storage={totalBytes:s.blocks*s.bsize,availableBytes:s.bavail*s.bsize};}catch{/* Unsupported platforms retain unavailable storage. */}
    let output:string|undefined;
    if(accelerators.some(a=>a.adapter==='nvidia')){
      try {output=(await execute('nvidia-smi',['--query-gpu=index,memory.used,utilization.gpu','--format=csv,noheader,nounits'],{timeout:2000,maxBuffer:16384,windowsHide:true})).stdout;}catch{/* Known accelerators retain unavailable measurements. */}
    }
    const gpu=projectNvidiaMeasurements(accelerators,output,at);
    return {observedAt:at,scope:'WHOLE_NODE' as const,attribution:'Not attributed to individual jobs',cpuModel:cpus[0]?.model??null,cpuBusyPercent:busy,memoryTotalBytes:scalarMeasurement(os.totalmem()||null,at,'node:os.totalmem'),memoryAvailableBytes:scalarMeasurement(os.freemem(),at,'node:os.freemem'),storage,gpu};
  }
}

/** One whole-node CPU stream independent of accelerator inventory and request frequency. */
export class CpuCounterSampler {
  private previous?:{at:number;total:number;idle:number};
  private reading?:ResourceMeasurement<number>;
  measure(current:{at:number;total:number;idle:number}):ResourceMeasurement<number>{
    const prior=this.previous,at=new Date(current.at).toISOString();
    if(prior&&current.at>=prior.at&&current.at-prior.at<1000)return this.reading!;
    this.previous=current;
    this.reading=unavailableMeasurement(at,'node:os.cpus','first_sample_requires_prior_counter_frame');
    if(prior&&current.at-prior.at>=1000&&current.at-prior.at<=30000&&current.total>prior.total){
      const total=current.total-prior.total,idle=current.idle-prior.idle;
      if(idle>=0&&idle<=total)this.reading={...scalarMeasurement((1-idle/total)*100,at,'node:os.cpus counter delta'),intervalMs:current.at-prior.at};
    }
    return this.reading;
  }
}
export function projectNvidiaMeasurements(accelerators:Array<{id:string;index:number;adapter:string}>,output:string|undefined,at:string){
  return accelerators.filter(a=>a.adapter==='nvidia').map(a=>{
    const values=output?.split(/\r?\n/).map(line=>line.split(',').map(value=>value.trim())).find(row=>row.length===3&&row[0]!==''&&Number(row[0])===a.index);
    const memory=values?.[1]?Number(values[1]):NaN,busy=values?.[2]?Number(values[2]):NaN;
    const unavailable=()=>unavailableMeasurement(at,'nvidia-smi',output===undefined?'adapter_unavailable':'device_row_missing_or_invalid');
    return {id:a.id,usedBytes:Number.isFinite(memory)&&memory>=0?scalarMeasurement(memory*1048576,at,'nvidia-smi device memory.used'):unavailable(),busyPercent:Number.isFinite(busy)&&busy>=0&&busy<=100?scalarMeasurement(busy,at,'nvidia-smi device utilization.gpu'):unavailable()};
  });
}

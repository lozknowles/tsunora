import {safeTranscriptText} from './execution-history.js';
const metric=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const instant=(v:unknown)=>typeof v==='string'?Date.parse(v):NaN;
const text=(v:unknown)=>typeof v==='string'?safeTranscriptText(v,1024*1024):null;
/** Render only adapter-retained measurements; never infer topology or throughput from totals. */
export function physicalInferenceMeasurements(value:unknown,evidence:{id:string;sha256:string}){
 const v=value as any;
 if(!v||v.schema!=='agent-control.physical-inference-experiment/v1'||!Array.isArray(v.invocations))return[];
 return (v.invocations as any[]).filter(i=>i&&typeof i==='object'&&!Array.isArray(i)).slice(0,128).map((i:any)=>{
  const input=metric(i.usage?.prompt_tokens),cached=metric(i.usage?.prompt_tokens_details?.cached_tokens),output=metric(i.usage?.completion_tokens);
  const start=instant(i.startedAt),end=instant(i.endedAt);
  const samples=(Array.isArray(v.samples)?v.samples:[]).filter((s:any)=>{const at=instant(s?.at);return Number.isFinite(start)&&Number.isFinite(end)&&start<=end&&Number.isFinite(at)&&at>=start&&at<=end;});
  const peak=(field:string)=>{const values=samples.flatMap((s:any)=>{const n=metric(s.metrics?.[field]);return n===null?[]:[n];});return values.length?values.reduce((maximum:number,n:number)=>Math.max(maximum,n),0):null;};
  return {id:text(i.id),accountingInvocationId:text(i.accountingInvocationId),exchangeTruncated:JSON.stringify(i.request)?.length>1024*1024||String(i.output??'').length>1024*1024,model:text(v.model),quantisation:text(v.quantisation),device:text(v.device),gpu:text(v.gpuUuid),runtime:text(v.runtime),runtimeVersion:text(v.runtimeVersion),modelSha256:text(v.modelSha256),runtimeSha256:text(v.runtimeSha256),configuration:v.config??null,command:v.command??null,status:text(i.status),error:text(i.error),startedAt:text(i.startedAt),endedAt:text(i.endedAt),input,cached,newInput:input!==null&&cached!==null&&cached<=input?input-cached:null,output,promptTokPerSecond:metric(i.timings?.prompt_per_second??i.metrics?.promptTokPerSecond),generationTokPerSecond:metric(i.timings?.predicted_per_second??i.metrics?.generationTokPerSecond),ttftSeconds:metric(i.ttftSeconds??i.metrics?.timeToFirstTokenSeconds),elapsedSeconds:metric(i.elapsedSeconds??i.metrics?.elapsedSeconds),sampleCount:samples.length,peakVramMiB:peak('gpuMemoryUsedMiB'),peakGpuUtilisationPercent:peak('gpuUtilisationPercent'),peakPowerWatts:peak('gpuPowerWatts'),peakTemperatureC:peak('gpuTemperatureC'),resourceScope:i.metrics?'Per-process CPU/RAM observations retained by the invocation worker; GPU measurements unavailable unless independently recorded':'Whole physical GPU samples during this invocation; not per-process attribution',inputText:text(JSON.stringify(i.request)),outputText:text(i.output),evidence};
 });
}
export function physicalInferenceMarkdown(rows:ReturnType<typeof physicalInferenceMeasurements>){
 if(!rows.length)return'';
 const display=(v:unknown)=>v==null?'unavailable':String(v);
 return '\n## Physical inference measurements\n\n'+rows.map(r=>`### ${r.id}\n\nModel: ${r.model}; quantisation: ${display(r.quantisation)}; device: ${r.device}; runtime: ${r.runtime} ${r.runtimeVersion}\n\nInput: ${display(r.input)} | Cached input: ${display(r.cached)} | New input: ${display(r.newInput)} | Output: ${display(r.output)}\n\nPrompt tokens/s: ${display(r.promptTokPerSecond)} | Generation tokens/s: ${display(r.generationTokPerSecond)} | First token seconds: ${display(r.ttftSeconds)} | Elapsed seconds: ${display(r.elapsedSeconds)}\n\nPeak VRAM MiB: ${display(r.peakVramMiB)}; peak GPU utilisation: ${display(r.peakGpuUtilisationPercent)}%; samples: ${r.sampleCount}. ${r.resourceScope}.\n\nEvidence: ${r.evidence.id}, SHA-256 ${r.evidence.sha256}\n\nConfiguration: ${JSON.stringify(r.configuration)}\n\nInput:\n\n${r.inputText}\n\nOutput:\n\n${r.outputText}\n`).join('\n');
}

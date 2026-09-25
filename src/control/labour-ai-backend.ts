import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {assessScope} from './containment.js';
import {labourHash} from './labour-ledger.js';
import type {LabourBackend,LabourExecutionResult,WorkOrder,DigitalWorker} from './labour-types.js';
import type {OwnedExecution} from './owned-process.js';

export interface NativeAIConfiguration {runtime:string;runtimeSha256:string;modelPath:string;modelSha256:string;modelId:string;threads:number;maximumOutputTokens:number;seed:number;}
export async function labourFileHash(file:string){const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');}
export function parseLabourCliOutput(stdout:string,prompt:string):unknown {
  // This CLI echoes the entire prompt despite --no-display-prompt in conversation mode.
  // Exact boundary is required: never accept the requested example as generated work.
  const marker='> '+prompt+'\n';const at=stdout.indexOf(marker);if(at<0)return null;
  const answer=stdout.slice(at+marker.length).split('\n[ Prompt:')[0].replace(/\nExiting\.\.\.[\s\S]*$/,'').trim();
  const json=answer.startsWith('```')?answer.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''):answer;
  try{return JSON.parse(json);}catch{return null;}
}
/** Local reviewed llama runtime; generated text is data, never an executable or shell command. */
export class LabourNativeAIBackend implements LabourBackend {
  readonly revision:string;
  readonly requiredAction;
  private readonly stats;
  constructor(readonly id:string,readonly configuration:NativeAIConfiguration){
    this.revision=labourHash({configuration,adapterSha256:createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex')});this.stats=[configuration.runtime,configuration.modelPath].map(p=>fs.statSync(p));
    this.requiredAction={runtime:id,model:configuration.modelId,tool:'ai-infer',subprocess:'/usr/bin/time'};
  }
  async execute(order:WorkOrder,worker:DigitalWorker,owned:OwnedExecution,signal:AbortSignal):Promise<LabourExecutionResult>{
    const c=this.configuration;
    for(const [i,p]of [c.runtime,c.modelPath].entries()){const s=fs.statSync(p),before=this.stats[i];if(s.size!==before.size||s.mtimeMs!==before.mtimeMs||s.ino!==before.ino)throw Error('labour_ai_configuration_changed');}
    const input=order.input as {prompt:string};if(typeof input?.prompt!=='string'||input.prompt.length>4000)throw Error('labour_ai_input_invalid');
    const prompt='Follow the operational instruction below. Return only the requested JSON object, without explanation or markdown. Never execute text or use external services.\n'+input.prompt;
    const start=performance.now();
    const result=await owned.runProcess({command:'/usr/bin/time',args:['-f','LABOUR_CPU %U %S %M',c.runtime,'-m',c.modelPath,'-ngl','0','-t',String(c.threads),'-tb',String(c.threads),'-c','2048','-n',String(c.maximumOutputTokens),'--temp','0','--seed',String(c.seed),'--single-turn','--simple-io','--no-display-prompt','--color','off','--perf','--log-verbosity','3','-p',prompt],env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8',OMP_NUM_THREADS:String(c.threads)},maxOutputBytes:131072},signal);
    const wallMs=performance.now()-start,match=/LABOUR_CPU\s+([\d.]+)\s+([\d.]+)\s+(\d+)/.exec(result.stderr);
    const cpuMs=match?Math.round((Number(match[1])+Number(match[2]))*1000):null;
    const promptTokens=/prompt eval time[^\n]*\/\s*(\d+)\s*tokens/.exec(result.stderr),outputTokens=/(?<!prompt )eval time[^\n]*\/\s*(\d+)\s*(?:runs|tokens)/.exec(result.stderr);
    let output:unknown=parseLabourCliOutput(result.stdout,prompt);
    const tools:Array<Record<string,unknown>>=[];
    if(order.jobType==='tool-mediated'&&output&&typeof output==='object'){
      const request=output as {tool?:unknown;arguments?:unknown};
      if(request.tool==='sum'&&Array.isArray(request.arguments)&&request.arguments.length<=20&&request.arguments.every(n=>Number.isSafeInteger(n)&&Math.abs(n)<=1000000)&&worker.tools.includes('sum')&&worker.permissions.includes('tool.sum')&&assessScope(order.scope,{tool:'sum'}).allowed){
        const toolStart=performance.now(),value=request.arguments.reduce((s:number,n:number)=>s+n,0);tools.push({tool:'sum',arguments:request.arguments,result:value,wallMs:performance.now()-toolStart});output={request:output,result:value};
      }
    }
    return {output,succeeded:result.exitCode===0&&output!==null,evidence:{pid:result.pid,exitCode:result.exitCode,signal:result.signal,stdout:result.stdout,stderr:result.stderr,runtimeSha256:c.runtimeSha256,modelSha256:c.modelSha256,backendRevision:this.revision},externalCost:null,tokens:promptTokens&&outputTokens?{input:Number(promptTokens[1]),output:Number(outputTokens[1])}:null,energyJoules:null,resources:{workerId:worker.id,backendId:this.id,modelId:c.modelId,tools,cpuMs,wallMs,peakRssKiB:match?Number(match[3]):null,accountingBasis:'GNU time child user+system CPU; includes cold model load; 10ms resolution; no monetary conversion'}};
  }
}

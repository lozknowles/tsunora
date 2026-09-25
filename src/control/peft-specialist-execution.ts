import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {SpecialistExecutionPort,SpecialistExecutionResult,SpecialistInvocation} from './skill-learning.js';

export interface PeftBaseBinding {modelId:string;modelVersion:string;modelSha256:string;localPath:string;}
export class LocalPeftSpecialistExecutionPort implements SpecialistExecutionPort {
  constructor(private readonly options:{python:string;runner:string;adapterRoot:string;bases:PeftBaseBinding[];timeoutMs?:number}){}
  async execute(input:SpecialistInvocation):Promise<SpecialistExecutionResult>{
    const base=this.options.bases.find(item=>item.modelId===input.baseModelId&&item.modelVersion===input.baseModelVersion&&item.modelSha256===input.baseModelSha256);if(!base)throw new Error('specialist_base_binding_missing');
    const prefix='managed://learned-skills/';if(!input.adapterStorageRef.startsWith(prefix))throw new Error('specialist_storage_reference_invalid');const relative=input.adapterStorageRef.slice(prefix.length);if(!relative||relative.includes('..')||path.isAbsolute(relative))throw new Error('specialist_storage_reference_invalid');
    const root=path.resolve(this.options.adapterRoot),adapterPath=path.resolve(root,relative);if(adapterPath!==root&&!adapterPath.startsWith(root+path.sep))throw new Error('specialist_storage_boundary_violation');for(const value of [this.options.python,this.options.runner,base.localPath,adapterPath])if(!fs.existsSync(value))throw new Error('specialist_runtime_asset_missing');
    if(hashDirectory(adapterPath)!==input.adapterSha256)throw new Error('specialist_adapter_checksum_mismatch');
    if(hashDirectory(base.localPath)!==input.baseModelSha256)throw new Error('specialist_base_checksum_mismatch');
    const request={basePath:base.localPath,adapterPath,input:input.input},started=Date.now(),output=await run(this.options.python,[this.options.runner],JSON.stringify(request),this.options.timeoutMs??120_000),parsed=JSON.parse(output) as {output:unknown;inputTokens?:number;outputTokens?:number;elapsedMs?:number};
    const inputTokens=Number.isSafeInteger(parsed.inputTokens)?parsed.inputTokens!:null,outputTokens=Number.isSafeInteger(parsed.outputTokens)?parsed.outputTokens!:null;
    return{actual:{baseModelId:input.baseModelId,baseModelSha256:input.baseModelSha256,runtimeId:input.runtimeId,adapterId:input.adapterId,adapterVersion:input.adapterVersion,adapterSha256:input.adapterSha256},output:parsed.output,usage:{inputTokens,outputTokens,totalTokens:inputTokens!==null&&outputTokens!==null?inputTokens+outputTokens:null},elapsedMs:Number.isFinite(parsed.elapsedMs)?parsed.elapsedMs!:Date.now()-started};
  }
}
export function hashDirectory(root:string){const files:string[]=[];const walk=(directory:string)=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){const absolute=path.join(directory,entry.name);if(entry.isDirectory())walk(absolute);else if(entry.isFile()||entry.isSymbolicLink())files.push(absolute);}};walk(root);return createHash('sha256').update(files.map(file=>`${path.relative(root,file).split(path.sep).join('/')}:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}\n`).join('')).digest('hex');}
function run(command:string,args:string[],stdin:string,timeoutMs:number){return new Promise<string>((resolve,reject)=>{const child=spawn(command,args,{stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH??'',HOME:process.env.HOME??'',CUDA_VISIBLE_DEVICES:'',TOKENIZERS_PARALLELISM:'false'},windowsHide:true}),stdout:Buffer[]=[],stderr:Buffer[]=[],timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('specialist_execution_timeout'));},timeoutMs);child.stdout.on('data',value=>stdout.push(Buffer.from(value)));child.stderr.on('data',value=>{if(Buffer.concat(stderr).length<16_384)stderr.push(Buffer.from(value));});child.on('error',error=>{clearTimeout(timer);reject(error)});child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(new Error(`specialist_execution_failed:${code}`));const text=Buffer.concat(stdout).toString('utf8').trim();if(!text||text.length>65_536)return reject(new Error('specialist_execution_output_invalid'));resolve(text)});child.stdin.end(stdin);});}

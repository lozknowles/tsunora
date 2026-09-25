import {execFileSync} from 'node:child_process';
import {MarkdownProjectMemoryPort} from '../../src/control/project-memory.js';

interface Request {
  memoryRoot:string;
  taskId:string;
  input:string;
  basePath:string;
  adapterPath:string;
  python:string;
  specialist:string;
}

const request=JSON.parse(await new Promise<string>((resolve,reject)=>{
  let value='';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data',chunk=>value+=chunk);
  process.stdin.on('end',()=>resolve(value));
  process.stdin.on('error',reject);
})) as Request;
const started=Date.now();
const memory=new MarkdownProjectMemoryPort(request.memoryRoot,'structured-markdown-vault');
const recall=await memory.recall({
  projectId:'agent-control',
  repositoryId:'agent-control',
  query:request.taskId,
  limit:1,
  maximumBytes:2048,
});
if(recall.accepted.length!==1)throw new Error('verified_route_memory_unavailable');
const bounded=recall.accepted[0]!.memory.content;
const child=JSON.parse(execFileSync(request.python,[request.specialist],{
  encoding:'utf8',
  input:JSON.stringify({
    basePath:request.basePath,
    adapterPath:request.adapterPath,
    input:`${request.input}\nYour Memories (advisory; independently verify): ${bounded}`,
  }),
  env:{...process.env,CUDA_VISIBLE_DEVICES:'',TOKENIZERS_PARALLELISM:'false'},
})) as Record<string,unknown>;
process.stdout.write(JSON.stringify({...child,memory:{backend:'ProjectMemoryPort/structured-markdown-vault',accepted:recall.accepted.map(item=>item.memory.id),bytesInjected:recall.bytesInjected,estimatedTokens:recall.estimatedTokens,retrievalLatencyMs:recall.latencyMs},elapsedMs:Date.now()-started}));

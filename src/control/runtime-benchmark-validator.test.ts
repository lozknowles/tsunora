import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRuntimeBenchmarkCode} from './runtime-benchmark-validator.js';
const task:any={input:[[],[2,4]],expected:[0,3]};
test('code scoring uses owned networkless sandbox and unchanged candidate source',async()=>{
 const c:any={signal:new AbortController().signal,ownedExecution:{runProcess:async(r:any)=>{assert.equal(r.command,'/usr/bin/bwrap');assert.ok(r.args.includes('--unshare-all'));assert.equal(JSON.parse(r.input).source,'def solve(values): return 0');return {exitCode:0,stdout:'{"passed":false}',stderr:''};}}};
 assert.equal((await validateRuntimeBenchmarkCode(task,{output:'def solve(values): return 0'} as any,c)).passed,false);
});
test('sandbox failure remains unavailable, never a passing score',async()=>{const c:any={signal:new AbortController().signal,ownedExecution:{runProcess:async()=>({exitCode:1,stdout:'',stderr:'unavailable'})}};assert.equal((await validateRuntimeBenchmarkCode(task,{output:'x'} as any,c)).passed,null);});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {MAX_GOVERNED_ABSOLUTE_JOB_DEADLINE_MS, resolveGovernedRuntimeBudget} from './runtime-budget.js';
import {StructuredChatLoopProvider} from './structured-chat-loop-provider.js';

const schemas=[{id:'finish',description:'finish',inputSchema:{type:'object',additionalProperties:false}}];
function recipe(overrides:Record<string,unknown>={}){return {id:'r',taskId:'t',workerId:'w',providerId:'p',modelId:'m',promptProfile:{id:'p',version:'1',description:'p'},harness:{profile:'THIN',recommendedProfile:'THIN',routingMode:'EXPERIMENT',evidenceQualified:false,decisionReasons:[],contextStrategyId:'x',maximumTurns:3},context:{tier:0,sourceIds:[],evidenceIds:[],estimatedTokens:1},skills:[],tools:[{id:'finish',risk:'read',capabilities:[]}],runtime:{},authority:{laneId:'l',leaseGeneration:1,ownershipGeneration:1,owner:'agent'},resourceLimits:{},verification:{requiredEvidence:['v'],requireIndependentCheck:true},escalation:{minimumConfidence:.5,maximumAttempts:1,onFailure:'review'},routeReason:'test',fingerprint:'f',...overrides} as never;}
function sse(events:string[],delay=0){let index=0;return new Response(new ReadableStream({async pull(controller){if(index===events.length){controller.close();return;}if(delay)await new Promise(r=>setTimeout(r,delay));controller.enqueue(new TextEncoder().encode(`data: ${events[index++]}\n\n`));}}),{status:200,headers:{'content-type':'text/event-stream'}});}
function provider(fetch:typeof globalThis.fetch,extra:Record<string,unknown>={}){return new StructuredChatLoopProvider({providerId:'p',modelId:'m',baseUrl:'http://127.0.0.1:1/v1',toolSchemas:schemas,finishToolId:'finish',streaming:true,fetch,...extra});}
const tools={assertActive:()=>undefined,invoke:async()=>({ok:true})};

test('native Job guard remains outside the maximum governed lifetime',()=>{
 const manifest=fs.readFileSync('config/cache-qualification-jobs/native-mutation-benchmark.job.yaml','utf8');
 const execute=manifest.match(/- id: execute[\s\S]*?timeoutSeconds: (\d+)/);
 assert.ok(execute);assert.ok(Number(execute[1])*1_000>MAX_GOVERNED_ABSOLUTE_JOB_DEADLINE_MS);
});

test('profile and route evidence derive finite internally consistent budgets',()=>{
 const standard=resolveGovernedRuntimeBudget('STANDARD',{}, {p95ModelCallMs:104_378,evidenceIds:['physical']});
 assert.equal(standard.admission,'ADMITTED');assert.equal(standard.turnBudget,10);assert.ok(standard.modelCallDeadlineMs>=417_512);assert.ok(standard.expectedCapacityTurns>=10);assert.deepEqual(standard.evidenceIds,['physical']);
 const deep=resolveGovernedRuntimeBudget('DEEP',{}, {p95ModelCallMs:104_378});assert.equal(deep.admission,'ADMITTED');assert.equal(deep.turnBudget,32);assert.ok(deep.absoluteJobDeadlineMs>standard.absoluteJobDeadlineMs);
});

test('measured slow generation expands only the call ceiling within the fixed outer deadline',()=>{
 const budget=resolveGovernedRuntimeBudget('STANDARD',{}, {p95ModelCallMs:104_378,generationTokensPerSecond:.442,maximumOutputTokens:768,evidenceIds:['physical-throughput']});
 assert.equal(budget.modelCallDeadlineMs,1_800_000);assert.equal(budget.noProgressDeadlineMs,300_000);assert.equal(budget.absoluteJobDeadlineMs,1_828_536);assert.equal(budget.admission,'ADMITTED');
});

test('operator constrained budget is explicit and model cannot expand it',()=>{
 const budget=resolveGovernedRuntimeBudget('STANDARD',{absoluteJobDeadlineMs:600_000,modelCallDeadlineMs:300_000,noProgressDeadlineMs:30_000});
 assert.equal(budget.source,'POLICY_OVERRIDE');assert.equal(budget.admission,'ADMITTED_WITH_CONSTRAINED_CAPACITY');assert.equal(budget.absoluteJobDeadlineMs,600_000);
 assert.throws(()=>resolveGovernedRuntimeBudget('THIN',{absoluteJobDeadlineMs:9_999}),/runtime_budget_invalid/);
});

test('streaming content is meaningful progress and completes through typed finish',async()=>{
 const events=[JSON.stringify({id:'a',model:'m',choices:[{delta:{content:'{"tool":"finish",'}}]}),JSON.stringify({choices:[{delta:{content:'"input":{}}'},finish_reason:'stop'}]}),JSON.stringify({choices:[],usage:{prompt_tokens:5,completion_tokens:2,total_tokens:7}}),'[DONE]'];
 const budget=resolveGovernedRuntimeBudget('THIN',{absoluteJobDeadlineMs:10_000,modelCallDeadlineMs:2_000,toolCallDeadlineMs:100,noProgressDeadlineMs:1_000,verificationReserveMs:100,cleanupReserveMs:100,terminalCompletionTurns:0},{p95ModelCallMs:1_000});
 const states:any[]=[];const result=await provider(async()=>sse(events,30)).executor('do').execute(recipe({runtimeBudget:budget}),{...tools,runtimeBudget:s=>states.push(s)});
 assert.equal(result.error,undefined);assert.equal(result.invocations?.length,1);assert.deepEqual(result.invocations?.[0].runtimeBudget,budget);assert.ok(states.some(s=>s.progressKind==='PROVIDER_CONTENT'));assert.match(result.resultRef??'',/finish/);
});

test('stream without useful activity terminates as MODEL_NO_PROGRESS',async()=>{
 const budget=resolveGovernedRuntimeBudget('THIN',{absoluteJobDeadlineMs:10_000,modelCallDeadlineMs:2_000,toolCallDeadlineMs:100,noProgressDeadlineMs:1_000,verificationReserveMs:100,cleanupReserveMs:100,terminalCompletionTurns:0},{p95ModelCallMs:1_000});
 const fetch=async()=>new Response(new ReadableStream({start(){}}),{status:200});
 const result=await provider(fetch as typeof globalThis.fetch).executor('do').execute(recipe({runtimeBudget:budget}),tools);
 assert.equal(result.error,'MODEL_NO_PROGRESS');
});

test('native header timeout is classified as TRANSPORT_TIMEOUT',async()=>{
 const error=Object.assign(new Error('fetch failed'),{cause:{code:'UND_ERR_HEADERS_TIMEOUT'}});
 const result=await provider(async()=>{throw error;}).executor('do').execute(recipe({runtimeBudget:resolveGovernedRuntimeBudget('THIN')}),tools);
 assert.equal(result.error,'TRANSPORT_TIMEOUT');
});

test('fixed model deadline remains a hard ceiling despite progress',async()=>{
 const budget=resolveGovernedRuntimeBudget('THIN',{absoluteJobDeadlineMs:10_000,modelCallDeadlineMs:1_000,toolCallDeadlineMs:100,noProgressDeadlineMs:1_000,verificationReserveMs:100,cleanupReserveMs:100,terminalCompletionTurns:0},{p95ModelCallMs:1_000});
 const fetch=async(_input:unknown,init?:RequestInit)=>await new Promise<Response>((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(init.signal?.reason),{once:true}));
 const result=await provider(fetch as typeof globalThis.fetch).executor('do').execute(recipe({runtimeBudget:budget}),tools);
 assert.equal(result.error,'MODEL_CALL_DEADLINE_EXCEEDED');
});


test('keepalive traffic without generated content does not reset meaningful progress',async()=>{
 const budget=resolveGovernedRuntimeBudget('THIN',{absoluteJobDeadlineMs:10_000,modelCallDeadlineMs:2_000,toolCallDeadlineMs:100,noProgressDeadlineMs:1_000,verificationReserveMs:100,cleanupReserveMs:100,terminalCompletionTurns:0},{p95ModelCallMs:1_000});
 let count=0;
 const fetch=async()=>new Response(new ReadableStream({async pull(controller){await new Promise(r=>setTimeout(r,300));controller.enqueue(new TextEncoder().encode(`: keepalive ${count++}\n\n`));}}),{status:200,headers:{'content-type':'text/event-stream'}});
 const started=Date.now();const result=await provider(fetch as typeof globalThis.fetch).executor('do').execute(recipe({runtimeBudget:budget}),tools);
 assert.equal(result.error,'MODEL_NO_PROGRESS');assert.ok(Date.now()-started<1_800);
});

test('work deadline exhaustion is distinct from the longer model call deadline',async()=>{
 const budget=resolveGovernedRuntimeBudget('THIN',{absoluteJobDeadlineMs:10_000,modelCallDeadlineMs:5_000,toolCallDeadlineMs:100,noProgressDeadlineMs:5_000,verificationReserveMs:4_000,cleanupReserveMs:4_000,terminalCompletionTurns:0},{p95ModelCallMs:1_000});
 assert.equal(budget.admission,'ADMITTED_WITH_CONSTRAINED_CAPACITY');
 const fetch=async(_input:unknown,init?:RequestInit)=>await new Promise<Response>((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(init.signal?.reason),{once:true}));
 const result=await provider(fetch as typeof globalThis.fetch).executor('do').execute(recipe({runtimeBudget:budget}),tools);
 assert.equal(result.error,'JOB_DEADLINE_EXCEEDED');
});

test('impossible capacity remains rejected even when its model deadline is also too short',()=>{
 const budget=resolveGovernedRuntimeBudget('DEEP',{absoluteJobDeadlineMs:10_000,modelCallDeadlineMs:1_000,toolCallDeadlineMs:100,noProgressDeadlineMs:1_000,verificationReserveMs:4_900,cleanupReserveMs:4_900},{p95ModelCallMs:5_000});
 assert.equal(budget.admission,'REJECTED');assert.ok(budget.reasons.includes('runtime_budget_cannot_support_one_turn'));
});

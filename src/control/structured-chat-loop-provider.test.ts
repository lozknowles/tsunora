import assert from 'node:assert/strict';
import test from 'node:test';
import {StructuredChatLoopProvider, type StructuredChatToolSchema} from './structured-chat-loop-provider.js';

const schemas: StructuredChatToolSchema[] = [
  {id: 'repository.read', description: 'Read a bounded file range.', inputSchema: {type: 'object', properties: {path: {type: 'string'}}, required: ['path'], additionalProperties: false}},
  {id: 'mutation.finish', description: 'Stop the bounded attempt.', inputSchema: {type: 'object', additionalProperties: false}},
];

const semanticTools = [
  {name:'read_file',id:'repository.read',description:'Read one file.',parameters:schemas[0].inputSchema},
  {name:'finish_work',id:'mutation.finish',description:'Stop work.',parameters:schemas[1].inputSchema},
];

test('semantic native calls reject duplicate argument keys before any batch dispatch', async () => {
  for (const argumentsText of ['{"path":"src/a.js","path":"src/b.js"}', '{"path":"src/a.js","\\u0070ath":"src/b.js"}']) {
    let invoked=0;
    const provider=new StructuredChatLoopProvider({providerId:'provider',modelId:'model',baseUrl:'http://127.0.0.1:8081/v1',toolSchemas:schemas,finishToolId:'mutation.finish',semanticToolV1:{tools:semanticTools,batchableToolIds:['repository.read']},fetch:async()=>Response.json({choices:[{message:{content:null,tool_calls:[{id:'valid',type:'function',function:{name:'read_file',arguments:'{"path":"src/a.js"}'}},{id:'ambiguous',type:'function',function:{name:'read_file',arguments:argumentsText}}]}}]})});
    const result=await provider.executor('Read.').execute(recipe(1),{assertActive:()=>undefined,invoke:async()=>{invoked++;return {};}});
    assert.match(result.error??'', /provider_native_arguments_ambiguous_duplicate_key/);
    assert.equal(invoked,0);
  }
});

test('SEMANTIC_TOOL_V1 sends native functions and translates only through governed tool ids', async () => {
  const replies=[
    {choices:[{message:{content:null,tool_calls:[{id:'call-1',type:'function',function:{name:'read_file',arguments:'{"path":"src/a.js"}'}}]}}]},
    {choices:[{message:{content:null,tool_calls:[{id:'call-2',type:'function',function:{name:'finish_work',arguments:'{}'}}]}}]},
  ];
  const bodies:any[]=[],invoked:string[]=[],events:string[]=[];
  const provider=new StructuredChatLoopProvider({providerId:'provider',modelId:'model',baseUrl:'http://127.0.0.1:8081/v1',toolSchemas:schemas,finishToolId:'mutation.finish',semanticToolV1:{tools:semanticTools},semanticEvents:{record:event=>events.push(event.type)},fetch:async(_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return Response.json(replies.shift());}});
  const result=await provider.executor('Inspect.').execute(recipe(2),{assertActive:()=>undefined,invoke:async id=>{invoked.push(id);return id==='repository.read'?{content:'source'}:{stopped:true};}});
  assert.deepEqual(invoked,['repository.read','mutation.finish']);
  assert.equal(result.error,undefined);
  assert.equal(bodies[0].response_format,undefined);
  assert.equal(bodies[0].parallel_tool_calls,false);
  assert.deepEqual(bodies[0].tools.map((tool:any)=>tool.function.name),['read_file','finish_work']);
  assert.equal(bodies[1].messages[2].tool_calls[0].function.name,'read_file');
  assert.equal(bodies[1].messages[3].role,'tool');
  assert.equal(bodies[1].messages[3].tool_call_id,'call-1');
  assert.ok(events.includes('TOOL_TRANSLATION_SUCCEEDED'));
  assert.ok(events.includes('TOOL_RESULT_RECORDED'));
});

test('SEMANTIC_TOOL_V1 rejects malformed, ambiguous, and ungranted native intents before dispatch', async () => {
  for(const calls of [
    [{id:'one',type:'function',function:{name:'read_file',arguments:'{"path":123}'}}],
    [{id:'one',type:'function',function:{name:'read_file',arguments:'{"path":"src/a.js"}'}},{id:'two',type:'function',function:{name:'finish_work',arguments:'{}'}}],
    [{id:'one',type:'function',function:{name:'shell',arguments:'{}'}}],
    [{id:'one',type:'function',function:{name:'read_file',arguments:'{"path":"src/a.js"'}}],
  ]) {
    let invoked=0;
    const provider=new StructuredChatLoopProvider({providerId:'provider',modelId:'model',baseUrl:'http://127.0.0.1:8081/v1',toolSchemas:schemas,finishToolId:'mutation.finish',semanticToolV1:{tools:semanticTools},fetch:async()=>Response.json({choices:[{message:{content:null,tool_calls:calls}}]})});
    const result=await provider.executor('Inspect.').execute(recipe(1),{assertActive:()=>undefined,invoke:async()=>{invoked++;return null;}});
    assert.match(result.error??'',/provider_native_/);
    assert.equal(invoked,0);
  }
});

test('SEMANTIC_TOOL_V1 does not turn retained prose or a JSON envelope into a native tool call', async () => {
  const provider=new StructuredChatLoopProvider({providerId:'provider',modelId:'model',baseUrl:'http://127.0.0.1:8081/v1',toolSchemas:schemas,finishToolId:'mutation.finish',semanticToolV1:{tools:semanticTools},fetch:async()=>Response.json({choices:[{message:{content:'{"tool":"repository.read","input":{"path":"src/a.js"}}'}}]})});
  const result=await provider.executor('Inspect.').execute(recipe(1),{assertActive:()=>undefined,invoke:async()=>{throw Error('dispatch_not_allowed');}});
  assert.equal(result.error,'provider_missing_tool_request');
});

test('SEMANTIC_TOOL_V1 rejects a batch when no batchable tools are configured', async () => {
  const events:Array<{type:string;reasonCode:string|null}>=[];
  const calls=[{id:'one',type:'function',function:{name:'read_file',arguments:'{"path":"src/a.js"}'}},{id:'two',type:'function',function:{name:'read_file',arguments:'{"path":"src/b.js"}'}}];
  const provider=new StructuredChatLoopProvider({providerId:'provider',modelId:'model',baseUrl:'http://127.0.0.1:8081/v1',toolSchemas:schemas,finishToolId:'mutation.finish',semanticToolV1:{tools:semanticTools},semanticEvents:{record:event=>events.push(event)},fetch:async()=>Response.json({choices:[{message:{content:null,tool_calls:calls}}]})});
  await provider.executor('Inspect.').execute(recipe(1),{assertActive:()=>undefined,invoke:async()=>{throw Error('dispatch_not_allowed');}});
  assert.ok(events.some(event=>event.type==='TOOL_PARSE_FAILED'&&event.reasonCode==='BATCH_NOT_PERMITTED'));
  assert.equal(events.some(event=>event.type==='TOOL_TRANSLATION_FAILED'),false);
});

test('SEMANTIC_TOOL_V1 dispatches a validated read-only batch and returns every native result', async () => {
  const calls=[{id:'one',type:'function',function:{name:'read_file',arguments:'{"path":"src/a.js"}'}},{id:'two',type:'function',function:{name:'read_file',arguments:'{"path":"src/b.js"}'}}];
  const replies=[{choices:[{message:{content:null,tool_calls:calls}}]},{choices:[{message:{content:null,tool_calls:[{id:'three',type:'function',function:{name:'finish_work',arguments:'{}'}}]}}]}];
  const bodies:any[]=[],invoked:string[]=[];
  const provider=new StructuredChatLoopProvider({providerId:'provider',modelId:'model',baseUrl:'http://127.0.0.1:8081/v1',toolSchemas:schemas,finishToolId:'mutation.finish',semanticToolV1:{tools:semanticTools,batchableToolIds:['repository.read']},fetch:async(_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return Response.json(replies.shift());}});
  const result=await provider.executor('Inspect.').execute(recipe(2),{assertActive:()=>undefined,invoke:async(id,input)=>{invoked.push(`${id}:${JSON.stringify(input)}`);return {ok:true};}});
  assert.equal(result.error,undefined);
  assert.equal(bodies[0].parallel_tool_calls,true);
  assert.deepEqual(invoked.map(item=>item.split(':')[0]),['repository.read','repository.read','mutation.finish']);
  assert.equal(bodies[1].messages.filter((message:any)=>message.role==='tool').length,2);
  assert.deepEqual(bodies[1].messages.filter((message:any)=>message.role==='tool').map((message:any)=>message.tool_call_id),['one','two']);
});

test('SEMANTIC_TOOL_V1 rejects an unsafe or malformed batch before any dispatch', async () => {
  for(const calls of [
    [{id:'one',type:'function',function:{name:'read_file',arguments:'{"path":"src/a.js"}'}},{id:'two',type:'function',function:{name:'finish_work',arguments:'{}'}}],
    [{id:'one',type:'function',function:{name:'read_file',arguments:'{"path":"src/a.js"}'}},{id:'two',type:'function',function:{name:'read_file',arguments:'{"path":123}'}}],
  ]) {
    let invoked=0;
    const provider=new StructuredChatLoopProvider({providerId:'provider',modelId:'model',baseUrl:'http://127.0.0.1:8081/v1',toolSchemas:schemas,finishToolId:'mutation.finish',semanticToolV1:{tools:semanticTools,batchableToolIds:['repository.read']},fetch:async()=>Response.json({choices:[{message:{content:null,tool_calls:calls}}]})});
    const result=await provider.executor('Inspect.').execute(recipe(1),{assertActive:()=>undefined,invoke:async()=>{invoked++;return null;}});
    assert.match(result.error??'',/provider_native_/);
    assert.equal(invoked,0);
  }
});

test('SEMANTIC_TOOL_V1 executes two validated edits to distinct files through governed handlers', async () => {
  const editSchema:StructuredChatToolSchema={id:'repository.replace',description:'Replace exact text.',inputSchema:{type:'object',properties:{path:{type:'string'},oldText:{type:'string'},newText:{type:'string'}},required:['path','oldText','newText'],additionalProperties:false}};
  const calls=[
    {id:'edit-one',type:'function',function:{name:'replace_text',arguments:'{"path":"src/a.js","oldText":"old","newText":"new"}'}},
    {id:'edit-two',type:'function',function:{name:'replace_text',arguments:'{"path":"src/b.js","oldText":"old","newText":"new"}'}},
  ];
  const replies=[{choices:[{message:{content:null,tool_calls:calls}}]},{choices:[{message:{content:null,tool_calls:[{id:'finish',type:'function',function:{name:'finish_work',arguments:'{}'}}]}}]}];
  const invoked:string[]=[],bodies:any[]=[];
  const provider=new StructuredChatLoopProvider({providerId:'provider',modelId:'model',baseUrl:'http://127.0.0.1:8081/v1',toolSchemas:[...schemas,editSchema],finishToolId:'mutation.finish',semanticToolV1:{tools:[...semanticTools,{name:'replace_text',id:'repository.replace',description:'Replace.',parameters:editSchema.inputSchema}],batchableToolIds:['repository.read'],independentEditToolIds:['repository.replace']},fetch:async(_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return Response.json(replies.shift());}});
  const granted:any=recipe(2);granted.tools.push({id:'repository.replace',risk:'write',capabilities:[]});
  const result=await provider.executor('Edit.').execute(granted,{assertActive:()=>undefined,invoke:async(id,input)=>{invoked.push(`${id}:${(input as {path?:string})?.path??''}`);return {ok:true};}});
  assert.equal(result.error,undefined);
  assert.deepEqual(invoked,['repository.replace:src/a.js','repository.replace:src/b.js','mutation.finish:']);
  assert.deepEqual(bodies[1].messages.filter((message:any)=>message.role==='tool').map((message:any)=>message.tool_call_id),['edit-one','edit-two']);
});

test('SEMANTIC_TOOL_V1 rejects mixed or duplicate-file edit batches before dispatch', async () => {
  const editSchema:StructuredChatToolSchema={id:'repository.replace',description:'Replace exact text.',inputSchema:{type:'object',properties:{path:{type:'string'},oldText:{type:'string'},newText:{type:'string'}},required:['path','oldText','newText'],additionalProperties:false}};
  const edit=(id:string,path:string)=>({id,type:'function',function:{name:'replace_text',arguments:JSON.stringify({path,oldText:'old',newText:'new'})}});
  for(const calls of [[edit('one','src/a.js'),edit('two','./src/a.js')],[{id:'one',type:'function',function:{name:'read_file',arguments:'{"path":"src/a.js"}'}},edit('two','src/b.js')]]) {
    let invoked=0;
    const provider=new StructuredChatLoopProvider({providerId:'provider',modelId:'model',baseUrl:'http://127.0.0.1:8081/v1',toolSchemas:[...schemas,editSchema],finishToolId:'mutation.finish',semanticToolV1:{tools:[...semanticTools,{name:'replace_text',id:'repository.replace',description:'Replace.',parameters:editSchema.inputSchema}],batchableToolIds:['repository.read'],independentEditToolIds:['repository.replace']},fetch:async()=>Response.json({choices:[{message:{content:null,tool_calls:calls}}]})});
    const granted:any=recipe(1);granted.tools.push({id:'repository.replace',risk:'write',capabilities:[]});
    const result=await provider.executor('Edit.').execute(granted,{assertActive:()=>undefined,invoke:async()=>{invoked++;return null;}});
    assert.match(result.error??'',/provider_native_batch_not_permitted/);
    assert.equal(invoked,0);
  }
  let invoked=0;
  const invalid=[edit('one','src/a.js'),{id:'two',type:'function',function:{name:'replace_text',arguments:'{"path":"src/b.js","oldText":13,"newText":"new"}'}}];
  const provider=new StructuredChatLoopProvider({providerId:'provider',modelId:'model',baseUrl:'http://127.0.0.1:8081/v1',toolSchemas:[...schemas,editSchema],finishToolId:'mutation.finish',semanticToolV1:{tools:[...semanticTools,{name:'replace_text',id:'repository.replace',description:'Replace.',parameters:editSchema.inputSchema}],batchableToolIds:['repository.read'],independentEditToolIds:['repository.replace']},fetch:async()=>Response.json({choices:[{message:{content:null,tool_calls:invalid}}]})});
  const granted:any=recipe(1);granted.tools.push({id:'repository.replace',risk:'write',capabilities:[]});
  const result=await provider.executor('Edit.').execute(granted,{assertActive:()=>undefined,invoke:async()=>{invoked++;return null;}});
  assert.match(result.error??'',/provider_native_arguments_schema_invalid/);
  assert.equal(invoked,0);
});

function recipe(maximumTurns = 3) {
  return {
    id: 'recipe-loop', taskId: 'task-loop', jobId: 'job-loop', runId: 'run-loop', workerId: 'worker', providerId: 'provider', modelId: 'model',
    promptProfile: {id: 'loop', version: '1', description: 'loop'}, harness: {profile: 'THIN', recommendedProfile: 'THIN', routingMode: 'EXPERIMENT', evidenceQualified: false, decisionReasons: [], contextStrategyId: 'fixture', maximumTurns},
    context: {tier: 0, sourceIds: ['task'], evidenceIds: ['fixture'], estimatedTokens: 10}, skills: [], tools: schemas.map(item => ({id: item.id, risk: 'read', capabilities: []})), runtime: {},
    authority: {laneId: 'lane', leaseGeneration: 1, ownershipGeneration: 1, owner: 'agent'}, resourceLimits: {maximumLatencyMs: 10_000}, verification: {requiredEvidence: ['hidden'], requireIndependentCheck: true}, escalation: {minimumConfidence: .8, maximumAttempts: 1, onFailure: 'review'}, routeReason: 'fixture', fingerprint: 'fingerprint',
  } as never;
}

test('bounded structured loop executes multiple typed turns and stops only on finish', async () => {
  const replies = [
    {id: 'one', choices: [{message: {content: '{"tool":"repository.read","input":{"path":"src/a.js"}}'}}], usage: {prompt_tokens: 100, prompt_tokens_details: {cached_tokens: 20}, completion_tokens: 12, total_tokens: 112}},
    {id: 'two', choices: [{message: {content: '{"tool":"mutation.finish","input":{}}'}}], usage: {prompt_tokens: 140, prompt_tokens_details: {cached_tokens: 30}, completion_tokens: 9, total_tokens: 149}},
  ];
  const bodies: string[] = [], invoked: string[] = [], phases:string[]=[];
  const provider = new StructuredChatLoopProvider({providerId: 'provider', modelId: 'model', baseUrl: 'http://127.0.0.1:8081/v1', toolSchemas: schemas, finishToolId: 'mutation.finish', fetch: async (_url, init) => { bodies.push(String(init?.body)); return new Response(JSON.stringify(replies.shift()), {status: 200}); }});
  const result = await provider.executor('Inspect and repair.', [{id: 'task', kind: 'task_context', content: 'task', required: true, persistent: false, relevance: 1, provenanceIds: ['fixture']}]).execute(recipe(), {assertActive: () => undefined, invoke: async id => { invoked.push(id); return id === 'repository.read' ? {content: 'export const value = 1;'} : {stopped: true}; },lifecycle:phase=>phases.push(phase)});
  assert.deepEqual(invoked, ['repository.read', 'mutation.finish']);
  assert.equal(result.invocations?.length, 2);
  assert.equal(result.invocations?.[0].usage.freshInputTokens, 80);
  assert.equal(result.invocations?.[1].turnNumber, 2);
  assert.match(bodies[1], /TOOL RESULT/);
  assert.match(result.resultRef ?? '', /mutation.finish/);
  assert.deepEqual(phases,['waiting for provider','response received','processing','waiting for provider','response received','processing']);
});

test('NO_PROGRESS_V1 opt-in warns, replans, escalates, then terminates an unchanged read loop', async () => {
  const events:Array<{status:string;turn:number}>=[],bodies:any[]=[],inputs:unknown[]=[];
  const request={tool:'repository.read',input:{path:'src/a.js'}};
  const provider=new StructuredChatLoopProvider({providerId:'provider',modelId:'model',baseUrl:'http://127.0.0.1:8081/v1',toolSchemas:schemas,finishToolId:'mutation.finish',noProgressV1:{thresholds:{observe:2,warning:3,recovery:4,replan:5,escalation:6,terminate:7},recordEvidence:event=>events.push({status:event.status,turn:event.turn})},fetch:async(_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return Response.json({choices:[{message:{content:JSON.stringify(request)}}]});}});
  const result=await provider.executor('Inspect.').execute(recipe(9),{assertActive:()=>undefined,invoke:async(_id,input)=>{inputs.push(input);return {content:'same'};}});
  assert.equal(result.error,'NO_PROGRESS_TERMINATED');
  assert.equal(inputs.length,7);
  assert.ok(inputs.every(input=>JSON.stringify(input)===JSON.stringify(request.input)));
  assert.deepEqual(events.map(event=>event.status),['PROGRESS','OBSERVING_REPEAT','NO_PROGRESS_WARNING','RECOVERY_REQUIRED','REPLANNING','ESCALATION_REQUIRED','TERMINATED_NO_PROGRESS']);
  assert.match(JSON.stringify(bodies[3].messages),/Agent Control notice/);
  assert.match(JSON.stringify(bodies[4].messages),/no-progress recovery/);
  assert.match(JSON.stringify(bodies[6].messages),/escalation required/);
});

test('NO_PROGRESS_V1 treats unconfirmed writes as exempt and leaves disabled runs unchanged', async () => {
  for(const enabled of [false,true]){
    const events:string[]=[];let calls=0;
    const provider=new StructuredChatLoopProvider({providerId:'provider',modelId:'model',baseUrl:'http://127.0.0.1:8081/v1',toolSchemas:schemas,finishToolId:'mutation.finish',...(enabled?{noProgressV1:{recordEvidence:(event:{status:string})=>events.push(event.status)}}:{}),fetch:async()=>Response.json({choices:[{message:{content:JSON.stringify(calls++<3?{tool:'repository.read',input:{path:'src/a.js'}}:{tool:'mutation.finish',input:{}})}}]})});
    const controlled:any=recipe(4);controlled.tools[0].risk='write';
    const result=await provider.executor('Inspect.').execute(controlled,{assertActive:()=>undefined,invoke:async()=>({ok:true})});
    assert.equal(result.error,undefined);
    assert.equal(calls,4);
    assert.deepEqual(events,enabled?['EXEMPT','EXEMPT','EXEMPT']:[]);
  }
});

test('NO_PROGRESS_V1 rollback leaves repeated reads under the ordinary turn cap', async () => {
  let calls=0,invocations=0;
  const provider=new StructuredChatLoopProvider({providerId:'provider',modelId:'model',baseUrl:'http://127.0.0.1:8081/v1',toolSchemas:schemas,finishToolId:'mutation.finish',fetch:async()=>{calls++;return Response.json({choices:[{message:{content:'{"tool":"repository.read","input":{"path":"same"}}'}}]});}});
  const result=await provider.executor('Inspect.').execute(recipe(11),{assertActive:()=>undefined,invoke:async()=>{invocations++;return {content:'same'};}});
  assert.match(result.error??'',/structured_chat_loop_turn_limit:11/);
  assert.equal(calls,11);
  assert.equal(invocations,11);
  assert.equal(result.evidence?.some(item=>item.startsWith('no_progress_v1:')),false);
});

test('NO_PROGRESS_V1 evidence failure stops the next dispatch and retains completed invocation', async () => {
  let invoked=0;
  const provider=new StructuredChatLoopProvider({providerId:'provider',modelId:'model',baseUrl:'http://127.0.0.1:8081/v1',toolSchemas:schemas,finishToolId:'mutation.finish',noProgressV1:{recordEvidence:()=>{throw Error('disk unavailable');}},fetch:async()=>Response.json({choices:[{message:{content:'{"tool":"repository.read","input":{"path":"same"}}'}}]})});
  await assert.rejects(()=>provider.executor('Inspect.').execute(recipe(3),{assertActive:()=>undefined,invoke:async()=>{invoked++;return {content:'same'};}}),(error:any)=>{
    assert.match(error.message,/no_progress_evidence_persistence_failed/);
    assert.equal(error.efficiencyObservations?.length,1);
    return true;
  });
  assert.equal(invoked,1);
});

test('NO_PROGRESS_V1 notices preserve native semantic tool-call ordering', async () => {
  const bodies:any[]=[],events:string[]=[];let turn=0;
  const provider=new StructuredChatLoopProvider({providerId:'provider',modelId:'model',baseUrl:'http://127.0.0.1:8081/v1',toolSchemas:schemas,finishToolId:'mutation.finish',semanticToolV1:{tools:semanticTools},noProgressV1:{recordEvidence:event=>events.push(event.status)},fetch:async(_url,init)=>{
    bodies.push(JSON.parse(String(init?.body)));
    turn++;
    const name=turn<=3?'read_file':'finish_work',args=turn<=3?'{"path":"same"}':'{}';
    return Response.json({choices:[{message:{content:null,tool_calls:[{id:`call-${turn}`,type:'function',function:{name,arguments:args}}]}}]});
  }});
  const result=await provider.executor('Inspect.').execute(recipe(4),{assertActive:()=>undefined,invoke:async id=>id==='repository.read'?{content:'same'}:{stopped:true}});
  assert.equal(result.error,undefined);
  assert.deepEqual(events,['PROGRESS','OBSERVING_REPEAT','NO_PROGRESS_WARNING']);
  const messages=bodies[3].messages;
  assert.equal(messages.at(-2).role,'tool');
  assert.equal(messages.at(-2).tool_call_id,'call-3');
  assert.equal(messages.at(-1).role,'user');
  assert.match(messages.at(-1).content,/Agent Control notice/);
});

test('llama.cpp timing evidence survives the real bounded tool-loop adapter', async () => {
  const provider = new StructuredChatLoopProvider({providerId: 'local-llama', modelId: 'qwen', baseUrl: 'http://127.0.0.1:8081/v1', toolSchemas: schemas, finishToolId: 'mutation.finish', fetch: async () => new Response(JSON.stringify({id: 'cache-proof', model: 'qwen', choices: [{finish_reason: 'stop', message: {content: '{"tool":"mutation.finish","input":{}}'}}], usage: {prompt_tokens: 244, prompt_tokens_details: {cached_tokens: 236}, completion_tokens: 8, total_tokens: 252}, timings: {cache_n: 236, prompt_n: 8, prompt_ms: 4.25, predicted_ms: 19}}), {status: 200})});
  const result = await provider.executor('Repeat the governed task.').execute(recipe(1), {assertActive: () => undefined, invoke: async () => ({stopped: true})});
  assert.deepEqual(result.invocations?.[0].cacheEvidence, {reusedTokens: 236, processedPromptTokens: 8, cacheWriteTokens: null, promptProcessingMs: 4.25, generationMs: 19, authority: 'authoritative', source: 'llama.cpp.response.timings', requestPrefixSha256: result.invocations?.[0].cacheEvidence?.requestPrefixSha256});
  assert.match(result.invocations?.[0].cacheEvidence?.requestPrefixSha256 ?? '', /^[a-f0-9]{64}$/);
});

test('qualified backend retention is exposed as derived expected state without rewriting actual reuse', async () => {
  const provider=new StructuredChatLoopProvider({providerId:'local-llama',modelId:'qwen',baseUrl:'http://127.0.0.1:8081/v1',toolSchemas:schemas,finishToolId:'mutation.finish',cacheRetention:{enabled:true,authority:'derived',source:'qualified-single-slot-cache'},fetch:async()=>new Response(JSON.stringify({choices:[{message:{content:'{"tool":"mutation.finish","input":{}}'}}],usage:{prompt_tokens:1000,completion_tokens:8,total_tokens:1008},timings:{cache_n:0,prompt_n:1000,prompt_ms:40,predicted_ms:20}}),{status:200})});
  const result=await provider.executor('Populate the qualified cache.').execute(recipe(1),{assertActive: () => undefined, invoke:async()=>({stopped:true})}),cache=result.invocations?.[0].cacheEvidence;assert.equal(cache?.reusedTokens,0);assert.equal(cache?.processedPromptTokens,1000);assert.equal(cache?.retainedPromptTokens,1000);assert.equal(cache?.retentionAuthority,'derived');assert.equal(cache?.retentionSource,'qualified-single-slot-cache');
});

test('loop stops at the governed turn limit without claiming verification', async () => {
  const provider = new StructuredChatLoopProvider({providerId: 'provider', modelId: 'model', baseUrl: 'http://127.0.0.1:8081/v1', toolSchemas: schemas, finishToolId: 'mutation.finish', fetch: async () => new Response(JSON.stringify({choices: [{message: {content: '{"tool":"repository.read","input":{"path":"src/a.js"}}'}}], usage: {prompt_tokens: 10, completion_tokens: 2}}), {status: 200})});
  const result = await provider.executor('Inspect.').execute(recipe(2), {assertActive: () => undefined, invoke: async () => ({content: 'bounded'})});
  assert.equal(result.error, 'structured_chat_loop_turn_limit:2');
  assert.equal(result.invocations?.length, 2);
  assert.equal(result.resultRef, undefined);
});

test('policy denial is rethrown with completed turn observations for dispatcher retention', async () => {
  const provider = new StructuredChatLoopProvider({providerId: 'provider', modelId: 'model', baseUrl: 'http://127.0.0.1:8081/v1', toolSchemas: schemas, finishToolId: 'mutation.finish', fetch: async () => new Response(JSON.stringify({choices: [{message: {content: '{"tool":"repository.read","input":{"path":"src/a.js"}}'}}], usage: {prompt_tokens: 10, completion_tokens: 2}}), {status: 200})});
  await assert.rejects(async () => provider.executor('Inspect.').execute(recipe(), {assertActive: () => undefined, invoke: async () => { throw new Error('tool_policy_denied:human_owns_execution'); }}), error => {
    assert.match((error as Error).message, /human_owns_execution/);
    assert.equal(((error as {efficiencyObservations?: unknown[]}).efficiencyObservations ?? []).length, 1);
    return true;
  });
});

test('loop validates endpoints, finish schema and cancellation', async () => {
  assert.throws(() => new StructuredChatLoopProvider({providerId: 'p', modelId: 'm', baseUrl: 'https://u:s@example.test/v1', toolSchemas: schemas, finishToolId: 'mutation.finish'}), /base_url_invalid/);
  assert.throws(() => new StructuredChatLoopProvider({providerId: 'p', modelId: 'm', baseUrl: 'https://example.test/v1', toolSchemas: schemas.slice(0, 1), finishToolId: 'mutation.finish'}), /finish_schema_missing/);
  const controller = new AbortController(); controller.abort();
  const provider = new StructuredChatLoopProvider({providerId: 'p', modelId: 'm', baseUrl: 'https://example.test/v1', toolSchemas: schemas, finishToolId: 'mutation.finish', signalForRecipe: () => controller.signal, fetch: async () => { throw new Error('fetch_should_not_run'); }});
  const result = await provider.executor('task').execute(recipe(), {assertActive: () => undefined, invoke: async () => null});
  assert.equal(result.error, 'structured_chat_loop_cancelled');
  assert.equal(result.retryable, false);
});

test('explicit neutral sampling reaches the provider and invalid values fail closed', async () => {
  let body: any;
  const options = {providerId: 'p', modelId: 'm', baseUrl: 'http://127.0.0.1:18000/v1', toolSchemas: schemas, finishToolId: 'mutation.finish'};
  const provider = new StructuredChatLoopProvider({...options, sampling: {temperature: 1, topP: .95, seed: 42}, fetch: async (_url, init) => { body = JSON.parse(String(init?.body)); return Response.json({choices: [{message: {content: '{"tool":"mutation.finish","input":{}}'}}]}); }});
  await provider.executor('Finish.').execute(recipe(1), {assertActive: () => undefined, invoke: async () => ({stopped: true})});
  assert.equal(body.temperature, 1); assert.equal(body.top_p, .95); assert.equal(body.seed, 42);
  assert.throws(() => new StructuredChatLoopProvider({...options, sampling: {temperature: 1, topP: 0}}), /sampling_invalid/);
});

test('a scripted known-good code-repair control completes the real bounded tool path', async () => {
  const routeSchemas: StructuredChatToolSchema[] = [
    {id: 'fixture.write', description: 'Replace src/route.js.', inputSchema: {type: 'object', properties: {path: {const: 'src/route.js'}, content: {type: 'string'}}, required: ['path', 'content'], additionalProperties: false}},
    {id: 'fixture.public-tests', description: 'Run public tests.', inputSchema: {type: 'object', additionalProperties: false}},
    {id: 'fixture.finish', description: 'Stop; independent verification follows.', inputSchema: {type: 'object', properties: {summary: {type: 'string'}}, required: ['summary'], additionalProperties: false}},
  ];
  const knownGood = `export function routeParcel(parcel) {
  if (parcel === null || typeof parcel !== 'object') return 'manual';
  if (parcel.kind === 'event') return 'community';
  if (parcel.kind === 'attachment') return 'documents';
  if (parcel.kind === 'alert') return parcel.urgent === true ? 'urgent-review' : 'infrastructure';
  return 'manual';
}
`;
  const replies = [
    {choices: [{message: {content: JSON.stringify({tool: 'fixture.write', input: {path: 'src/route.js', content: knownGood}})}}]},
    {choices: [{message: {content: JSON.stringify({tool: 'fixture.public-tests', input: {}})}}]},
    {choices: [{message: {content: JSON.stringify({tool: 'fixture.finish', input: {summary: 'public tests pass'}})}}]},
  ];
  let code = `export function routeParcel(parcel) { return 'manual'; }`, writes = 0;
  const evaluate = (source: string) => new Function(`${source.replace('export function', 'function')}; return routeParcel;`)() as (parcel: unknown) => string;
  const publicCases: Array<[unknown, string]> = [[{kind: 'event'}, 'community'], [{kind: 'alert', urgent: true}, 'urgent-review'], [{kind: 'unknown'}, 'manual']];
  const hiddenCases: Array<[unknown, string]> = [[null, 'manual'], [undefined, 'manual'], [{}, 'manual'], [{kind: 'attachment'}, 'documents'], [{kind: 'alert', urgent: false}, 'infrastructure'], [{kind: 'alert'}, 'infrastructure'], [{kind: 'alert', urgent: 'true'}, 'infrastructure'], [{kind: 'EVENT'}, 'manual'], [{kind: 'event', urgent: true}, 'community'], [{kind: 'attachment', urgent: true}, 'documents']];
  const run = (cases: Array<[unknown, string]>) => cases.every(([input, expected]) => evaluate(code)(input) === expected);
  const provider = new StructuredChatLoopProvider({providerId: 'scripted-control', modelId: 'known-good-control', baseUrl: 'http://127.0.0.1:18000/v1', toolSchemas: routeSchemas, finishToolId: 'fixture.finish', fetch: async () => Response.json({...replies.shift(), model: 'known-good-control'})});
  const controlRecipe = Object.assign({}, recipe(3) as any, {tools: routeSchemas.map(item => ({id: item.id, risk: item.id === 'fixture.write' ? 'write' : 'read', capabilities: []}))}) as never;
  const result = await provider.executor('Use the exact frozen routeParcel contract.').execute(controlRecipe, {assertActive: () => undefined, invoke: async (tool, input: any) => {
    if (tool === 'fixture.write') { assert.equal(input.path, 'src/route.js'); code = input.content; writes++; return {written: true}; }
    if (tool === 'fixture.public-tests') return {passed: run(publicCases)};
    return {stopped: true, independentVerification: 'PENDING'};
  }});
  assert.equal(result.error, undefined);
  assert.equal(writes, 1);
  assert.equal(run(publicCases), true);
  assert.equal(run(hiddenCases), true);
  assert.deepEqual(JSON.parse(result.resultRef ?? '{}').toolTranscript.map((item: {tool: string}) => item.tool), ['fixture.write', 'fixture.public-tests', 'fixture.finish']);
});

test('experimental reliability gate records a safe native envelope repair before dispatch', async () => {
  const replies = [
    {choices: [{message: {content: '{"name":"repository.read","arguments":"{\\"path\\":\\"src/a.js\\"}"}'}}]},
    {choices: [{message: {content: '{"tool":"mutation.finish","input":{}}'}}]},
  ];
  const records: Array<{decision: string; repair: string; toolId: string | null}> = [];
  const invoked: string[] = [];
  const provider = new StructuredChatLoopProvider({providerId: 'provider', modelId: 'model', baseUrl: 'http://127.0.0.1:8081/v1', toolSchemas: schemas, finishToolId: 'mutation.finish', toolReliability: {recordEvidence: record => records.push(record)}, fetch: async () => Response.json(replies.shift())});
  const result = await provider.executor('Read then finish.').execute(recipe(2), {assertActive: () => undefined, invoke: async id => {invoked.push(id); return {ok: true};}});
  assert.equal(result.error, undefined);
  assert.deepEqual(invoked, ['repository.read', 'mutation.finish']);
  assert.equal(records[0].repair, 'NATIVE_FUNCTION_ENVELOPE');
  assert.equal(records[0].decision, 'DISPATCH');
  assert.equal(records[1].repair, 'NONE');
  assert.match(result.evidence?.join('\n') ?? '', /tool_repair:NATIVE_FUNCTION_ENVELOPE/);
});

test('experimental reliability gate rejects schema-invalid arguments before invoking a tool', async () => {
  const records: Array<{reason: string; decision: string}> = [];
  let invoked = 0;
  const provider = new StructuredChatLoopProvider({providerId: 'provider', modelId: 'model', baseUrl: 'http://127.0.0.1:8081/v1', toolSchemas: schemas, finishToolId: 'mutation.finish', toolReliability: {recordEvidence: record => records.push(record)}, fetch: async () => Response.json({choices: [{message: {content: '{"tool":"repository.read","input":{"path":123}}'}}]})});
  const result = await provider.executor('Read.').execute(recipe(1), {assertActive: () => undefined, invoke: async () => {invoked++;}});
  assert.equal(result.error, 'provider_tool_request_schema_invalid');
  assert.equal(invoked, 0);
  assert.deepEqual(records.map(item => [item.decision, item.reason]), [['REJECT', 'SCHEMA_INVALID']]);
});

test('audit persistence failure prevents an otherwise valid tool dispatch', async () => {
  let invoked = 0;
  const provider = new StructuredChatLoopProvider({providerId: 'provider', modelId: 'model', baseUrl: 'http://127.0.0.1:8081/v1', toolSchemas: schemas, finishToolId: 'mutation.finish', toolReliability: {recordEvidence: () => {throw new Error('audit_unavailable');}}, fetch: async () => Response.json({choices: [{message: {content: '{"tool":"repository.read","input":{"path":"src/a.js"}}'}}]})});
  const result = await provider.executor('Read.').execute(recipe(1), {assertActive: () => undefined, invoke: async () => {invoked++;}});
  assert.equal(invoked, 0);
  assert.equal(result.error, 'audit_unavailable');
});

test('semantic events identify parse and schema failures without retaining response text', async () => {
  for (const [content, expected] of [
    ['{"tool":', 'TOOL_PARSE_FAILED'],
    ['{"tool":"repository.read","input":{"path":123}}', 'TOOL_SCHEMA_VALIDATION_FAILED'],
  ] as const) {
    const events: Array<Record<string, unknown>> = [], invoked: string[] = [];
    const provider = new StructuredChatLoopProvider({providerId:'provider',modelId:'model',baseUrl:'http://127.0.0.1:8081/v1',toolSchemas:schemas,finishToolId:'mutation.finish',toolReliability:{recordEvidence:()=>undefined},semanticEvents:{record:event=>events.push(event)},fetch:async()=>Response.json({choices:[{message:{content}}]})});
    await provider.executor('Inspect.').execute(recipe(1),{assertActive:()=>undefined,invoke:async id=>{invoked.push(id);return {};}});
    assert.deepEqual(invoked, []);
    assert.ok(events.some(event=>event.type===expected));
    assert.ok(events.some(event=>event.type==='MODEL_RESPONSE_RECEIVED'));
    assert.equal(JSON.stringify(events).includes(content),false);
    assert.ok(events.every(event=>typeof event.responseSha256==='string'));
  }
});

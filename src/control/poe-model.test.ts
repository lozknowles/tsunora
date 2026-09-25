import assert from 'node:assert/strict';
import test from 'node:test';
import type {CodexNodeExecutionPort} from './codex-node-execution.js';
import {ModelRegistry} from './model-registry.js';
import {RoutedPoeResponseModel} from './poe-model.js';

const unusedNode:CodexNodeExecutionPort={accountStatus:async()=>{throw new Error('unexpected_codex');},execReadOnlyStructured:async()=>{throw new Error('unexpected_codex');}};

test('provider-neutral POE model routing uses the configured inexpensive and reasoning roles and returns measured usage',async()=>{
  const registry=new ModelRegistry(
    [{id:'fixture',kind:'openai-compatible',baseUrl:'https://fixture.invalid/v1',wireApi:'responses',auth:{type:'none'},enabled:true}],
    [
      {id:'poe-economy',provider:'fixture',providerModel:'economy',capabilities:['structured-output'],qualification:{state:'QUALIFIED',version:'q1',capabilities:['structured-output'],nodes:['controller']},pricing:{currency:'USD',inputPerMillionTokens:1,outputPerMillionTokens:2,effectiveFrom:'2026-09-08',source:'fixture'}},
      {id:'poe-reasoning',provider:'fixture',providerModel:'reasoning',capabilities:['structured-output'],qualification:{state:'QUALIFIED',version:'q1',capabilities:['structured-output'],nodes:['controller']}},
    ],
    {roles:{'poe.status':{primary:'poe-economy',requires:['structured-output']},'poe.reasoning':{primary:'poe-reasoning',requires:['structured-output']}}},
  );
  const calls:string[]=[];
  const fetcher:typeof fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));calls.push(body.model);assert.match(JSON.stringify(body),/You are Mallow/);assert.doesNotMatch(JSON.stringify(body),/gothic|hotelier/);return new Response(JSON.stringify({model:body.model,status:'completed',output_text:JSON.stringify({schema:'agent-control.poe-response/v1',text:'One parcel is running. A modest bustle, by local standards.',citations:['Running']}),usage:{input_tokens:20,output_tokens:8,total_tokens:28}}),{status:200,headers:{'content-type':'application/json'}});};
  const model=new RoutedPoeResponseModel(registry,unusedNode,{status:'poe.status',reasoning:'poe.reasoning'},fetcher);
  const evidence={title:'Agent Control status',summary:'Current durable state.',facts:[{label:'Running',value:1,authority:'AGENT_CONTROL' as const,evidence:['parcel:p1']}],related:[]};
  const status=await model.respond({purpose:'STATUS_LOOKUP',operatorText:'What is happening?',evidence,channel:'dashboard'});
  const design=await model.respond({purpose:'EXPERIMENT_DESIGN',operatorText:'Explain benchmark evidence',evidence,channel:'dashboard'});
  assert.deepEqual(calls,['economy','reasoning']);
  assert.equal(status.route.modelId,'poe-economy');
  assert.equal(status.route.providerModel,'economy');
  assert.equal(model.describe().route?.providerModel,'economy');
  assert.equal(design.route.modelId,'poe-reasoning');
  assert.deepEqual(status.usage,{inputTokens:20,outputTokens:8,totalTokens:28,cost:.000036,currency:'USD',authority:'ESTIMATED'});
});

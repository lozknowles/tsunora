import {MemoryHarnessEfficiencyLedger} from './harness-efficiency.js';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {renderProviderPrompt, type ProviderPrompt, type ProviderPromptInput} from './provider-prompt.js';
import {DirectRepositoryReviewExecutor, parseRepositoryReviewResponse, REPOSITORY_REVIEW_OUTPUT_SCHEMA, type RepositoryReviewProviderClientFactory} from './direct-repository-review-executor.js';
import {ContractExecutionRuntime} from './contract-runtime.js';
import {GovernedHandoffRuntime} from './handoff-runtime.js';
import {JobCatalog} from './job-catalog.js';
import {ActionRegistry, ArtifactStore, JobRuntime, ResourceLockManager, RunLedger, WorkerRegistry} from './job-runtime.js';
import {ModelRegistry} from './model-registry.js';
import {ParameterizedJobEngine} from './parameterized-job-engine.js';
import {ParameterizedJobRegistry, ParameterizedRunStore, SavedJobStore} from './parameterized-job-registry.js';
import {repositoryCodeReviewDefinition} from './repository-review-definition.js';
import {ReviewBaselineStore} from './repository-review-runtime.js';
import type {ParameterizedJobRun, ReviewExecutionRequest} from './parameterized-job-types.js';
import {WorkParcelCoordinator, WorkParcelStore} from './work-parcels.js';
import {TokenAwareBatonRuntime} from './token-aware-baton-routing.js';
import {GovernedRetrievalRuntime, RepositoryTextRetrievalProvider} from './governed-retrieval.js';
import {governedRequestOrigin} from './request-origin.js';
import {TransportIntegrityRuntime} from './transport-integrity.js';

test('production repository review compiles governed evidence and preserves retrieval provenance',async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-control-production-retrieval-'));try{fs.writeFileSync(path.join(root,'first.ts'),`export function routeModel() { return 'qualified'; }\n${'irrelevant broad context\n'.repeat(500)}`);const {models,route}=handoffRegistry(),store=new WorkParcelStore(path.join(root,'parcels.json')),retrieval=new GovernedRetrievalRuntime([new RepositoryTextRetrievalProvider('exact')],{enabled:true,progression:['EXACT'],minimumConfidence:0,requiredCoverage:0,maximumEvidenceTokens:256}),calls:Array<{model:string;prompt:string}>=[],executor=new DirectRepositoryReviewExecutor(models,store,undefined,undefined,fakeReviewClients(calls),undefined,retrieval),request=reviewRequest(route);request.run.repository!.snapshotPath=root;request.run.repository!.identity='retrieval-fixture';request.contextChunks=[{id:'context-1',content:`===== first.ts =====\n${fs.readFileSync(path.join(root,'first.ts'),'utf8')}`,files:['first.ts'],sha256:'one'}];request.instruction='Review routeModel';const response=await executor.execute(request);assert.match(calls[0].prompt,/Governed Evidence Packet:/);assert.ok(calls[0].prompt.indexOf('export function routeModel')<calls[0].prompt.indexOf('Governed Evidence Packet:'));assert.ok(calls[0].prompt.length<1000);assert.ok(response.evidence.some(item=>item.startsWith('evidence-packet:')));const parcel=store.get(response.workParcelIds[0])!;assert.ok(parcel.provenance.some(item=>item.type==='retrieval.evidence'));assert.ok(retrieval.projection().totals.contextTokensSaved>0);}finally{fs.rmSync(root,{recursive:true,force:true});}});

test('repository review exposes a deterministic stable prefix while keeping changing provenance in a volatile suffix',async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-control-review-cache-boundary-'));try{fs.writeFileSync(path.join(root,'first.ts'),"export function routeModel() { return 'qualified'; }\n");const {models,route}=handoffRegistry(),store=new WorkParcelStore(path.join(root,'parcels.json')),retrieval=new GovernedRetrievalRuntime([new RepositoryTextRetrievalProvider('exact')],{enabled:true,progression:['EXACT'],minimumConfidence:0,requiredCoverage:0,maximumEvidenceTokens:256}),inputs:ProviderPromptInput[]=[],client:RepositoryReviewProviderClientFactory=provider=>({invoke:async(model,input)=>{inputs.push(structuredClone(input));const usage={inputTokens:20,outputTokens:5,cachedInputTokens:0,cacheWriteTokens:0,totalTokens:25,providerReportedCost:null,calculatedCost:null,currency:null};return{providerId:provider.id,modelId:model.id,providerModel:model.providerModel,output:JSON.stringify({schema:'agent-control.repository-review/v1',executiveSummary:'Reviewed.',findings:[],positiveObservations:[],areasReviewed:['first.ts'],areasNotReviewed:[],verdict:'PASS'}),elapsedMs:1,usage,responseModel:model.providerModel,finishReason:'stop',toolCall:null};}}),executor=new DirectRepositoryReviewExecutor(models,store,undefined,undefined,client,undefined,retrieval),request:ReviewExecutionRequest=reviewRequest(route);delete request.maximumCost;request.run.repository!.snapshotPath=root;request.run.repository!.identity='cache-boundary-fixture';request.contextChunks=[{id:'context-1',content:fs.readFileSync(path.join(root,'first.ts'),'utf8'),files:['first.ts'],sha256:'one'}];request.instruction='Review routeModel';await executor.execute(request);await executor.execute({...request,executionAttempt:2,executionId:'repository-review:run-handoff:2'});assert.equal(typeof inputs[0],'object');const first=inputs[0] as ProviderPrompt,second=inputs[1] as ProviderPrompt;assert.equal(first.blocks[0].stability,'stable');assert.equal(first.blocks[0].text,second.blocks[0].text);assert.equal(first.cacheScope,second.cacheScope);assert.notEqual(first.blocks[1].text,second.blocks[1].text);assert.match(first.blocks[1].text,/Governed Evidence Packet:/);assert.equal(renderProviderPrompt(first),first.blocks.map(block=>block.text).join(''));}finally{fs.rmSync(root,{recursive:true,force:true});}});

test('production engine retry preserves one logical Run while opening an immutable token thread for each execution attempt', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-control-review-retry-')),repository=path.join(root,'repository'); t.after(()=>{for(const entry of fs.readdirSync(root,{recursive:true}).map(value=>path.join(root,String(value))).sort((a,b)=>b.length-a.length))try{fs.chmodSync(entry,fs.statSync(entry).isDirectory()?0o700:0o600)}catch{}fs.rmSync(root,{recursive:true,force:true})}); fs.mkdirSync(repository);
  for(const args of [['init','-q','-b','main'],['config','user.email','test@example.invalid'],['config','user.name','Agent Control Test']] as string[][])execFileSync('git',args,{cwd:repository});
  fs.writeFileSync(path.join(repository,'index.ts'),'export const safe = true;\n'); execFileSync('git',['add','.'],{cwd:repository}); execFileSync('git',['commit','-qm','fixture'],{cwd:repository});
  const {models}=handoffRegistry(),parcels=new WorkParcelStore(path.join(root,'parcels.json')),routing=new TokenAwareBatonRuntime(path.join(root,'routing.json')); let invocation=0;
  const executor=new DirectRepositoryReviewExecutor(models,parcels,routing,undefined,provider=>({invoke:async(model,_input,options)=>{invocation++;options?.onTelemetry?.({phase:'started',providerId:provider.id,modelId:model.id,elapsedMs:invocation,context:{tokens:null,limitTokens:null,authority:'unavailable',source:'fixture'}});if(invocation===1)throw new Error('controlled_provider_retry');const usage={inputTokens:10,outputTokens:2,cachedInputTokens:0,totalTokens:12,providerReportedCost:.01,calculatedCost:.01,currency:'USD'};options?.onTelemetry?.({phase:'completed',providerId:provider.id,modelId:model.id,elapsedMs:2,usage,context:{tokens:null,limitTokens:null,authority:'unavailable',source:'fixture'}});return{providerId:provider.id,modelId:model.id,providerModel:model.providerModel,output:JSON.stringify({schema:'agent-control.repository-review/v1',executiveSummary:'Retry completed.',findings:[],positiveObservations:[],areasReviewed:['index.ts'],areasNotReviewed:[],verdict:'PASS'}),elapsedMs:2,usage,responseModel:model.providerModel,finishReason:'stop',toolCall:null};}}));
  const definitions=new ParameterizedJobRegistry();definitions.register(repositoryCodeReviewDefinition);const saved=new SavedJobStore(path.join(root,'saved.json'),definitions),runs=new ParameterizedRunStore(path.join(root,'runs.json')),baselines=new ReviewBaselineStore(path.join(root,'baselines.json')),engine=new ParameterizedJobEngine(definitions,saved,runs,baselines,models,executor,{allowedRepositoryRoots:[root],snapshotsRoot:path.join(root,'snapshots'),nodeHealthy:()=>true,wait:async()=>{}});
  saved.create({id:'retry-review',name:'Retry review',definition:{id:'repository-code-review',version:1,follow:'pinned'},parameters:{node:'controller',repository,ref:'main',scope:'full'},routing:{model:'source-model',allowFallback:false},contextProfile:'STANDARD',budgets:{maximumRetries:1},concurrency:'forbid-overlap',enabled:true});
  const completed=await engine.execute(engine.runNow('retry-review','test').id),threads=routing.projection().threads;
  assert.equal(completed.status,'SUCCEEDED',JSON.stringify({errors:completed.errors,retryHistory:completed.retryHistory,recovery:completed.recovery,executions:completed.providerExecutions}));assert.equal(completed.retryHistory[0].reason,'transient_transport_failure');assert.equal(invocation,2);assert.equal(completed.workParcelIds.length,2);assert.equal(completed.executionSequence,2);
  const attemptParcels=completed.workParcelIds.map(id=>parcels.get(id)!);assert.equal(attemptParcels.find(parcel=>parcel.status==='FAILED')?.audit.invocations[0]?.verifierResult,'not-applicable-transport-failure');assert.equal(attemptParcels.find(parcel=>parcel.status==='SUCCEEDED')?.audit.invocations[0]?.verifierResult,'PASS');assert.equal(completed.usage.totalTokens,undefined);assert.equal(completed.usage.unknownUsageInvocations,1);
  assert.deepEqual(threads.map(thread=>thread.id).sort(),[`repository-review:${completed.id}:1:${completed.context!.chunks[0].id}`,`repository-review:${completed.id}:2:${completed.context!.chunks[0].id}`].sort());
  assert.notEqual(threads[0].parcelId,threads[1].parcelId);assert.ok(threads.every(thread=>thread.recoverable));
});

test('exhausted transient provider retries seal a failure baton and continue on a qualified governed fallback', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-control-provider-failure-handoff-')),repository=path.join(root,'repository');
  t.after(()=>{for(const entry of fs.readdirSync(root,{recursive:true}).map(value=>path.join(root,String(value))).sort((a,b)=>b.length-a.length))try{fs.chmodSync(entry,fs.statSync(entry).isDirectory()?0o700:0o600)}catch{}fs.rmSync(root,{recursive:true,force:true})});
  fs.mkdirSync(repository);
  for(const args of [['init','-q','-b','main'],['config','user.email','test@example.invalid'],['config','user.name','Agent Control Test']] as string[][])execFileSync('git',args,{cwd:repository});
  fs.writeFileSync(path.join(repository,'index.ts'),'export const safe = true;\n');execFileSync('git',['add','.'],{cwd:repository});execFileSync('git',['commit','-qm','fixture'],{cwd:repository});
  const {models}=handoffRegistry(),parcels=new WorkParcelStore(path.join(root,'parcels.json')),routing=new TokenAwareBatonRuntime(path.join(root,'routing.json')),contracts=new ContractExecutionRuntime(path.join(root,'contracts.json')),handoffs=new GovernedHandoffRuntime(contracts,path.join(root,'handoffs.json')),calls:string[]=[];
  const executor=new DirectRepositoryReviewExecutor(models,parcels,routing,{routing,contracts,handoffs},provider=>({invoke:async(model,_input,options)=>{
    calls.push(model.id);
    options?.onTelemetry?.({phase:'started',providerId:provider.id,modelId:model.id,elapsedMs:0,context:{tokens:null,limitTokens:null,authority:'unavailable',source:'fixture'}});
    if(model.id==='source-model')throw Object.assign(new Error('http_502_controlled_transport_failure'),{providerFailureObservation:{requestDispatched:false,usage:{inputTokens:0,outputTokens:0,cachedInputTokens:0,cacheWriteTokens:0,totalTokens:0,providerReportedCost:0,calculatedCost:0,currency:'USD'},usageAuthority:'authoritative',elapsedMs:0}});
    const usage={inputTokens:30,outputTokens:10,cachedInputTokens:0,cacheWriteTokens:0,totalTokens:40,providerReportedCost:null,calculatedCost:.001,currency:'USD'};
    options?.onTelemetry?.({phase:'completed',providerId:provider.id,modelId:model.id,elapsedMs:3,usage,context:{tokens:null,limitTokens:null,authority:'unavailable',source:'fixture'}});
    return{providerId:provider.id,modelId:model.id,providerModel:model.providerModel,output:JSON.stringify({schema:'agent-control.repository-review/v1',executiveSummary:'Fallback completed the unchanged frozen review.',findings:[],positiveObservations:['Source transport failure did not alter repository state.'],areasReviewed:['index.ts'],areasNotReviewed:[],verdict:'PASS'}),elapsedMs:3,usage,responseModel:model.providerModel,finishReason:'stop',toolCall:null};
  }}));
  const definitions=new ParameterizedJobRegistry();definitions.register(repositoryCodeReviewDefinition);const saved=new SavedJobStore(path.join(root,'saved.json'),definitions),runs=new ParameterizedRunStore(path.join(root,'runs.json')),baselines=new ReviewBaselineStore(path.join(root,'baselines.json')),engine=new ParameterizedJobEngine(definitions,saved,runs,baselines,models,executor,{allowedRepositoryRoots:[root],snapshotsRoot:path.join(root,'snapshots'),nodeHealthy:()=>true,wait:async()=>{}});
  saved.create({id:'provider-fallback-review',name:'Provider fallback review',definition:{id:'repository-code-review',version:1,follow:'pinned'},parameters:{node:'controller',repository,ref:'main',scope:'full'},routing:{modelRole:'review.default',allowFallback:true},contextProfile:'STANDARD',budgets:{maximumRetries:1,retryBackoffSeconds:0},concurrency:'forbid-overlap',executionMode:'CONTROLLED_FAULT_INJECTION',enabled:true});
  const completed=await engine.execute(engine.runNow('provider-fallback-review','test').id),evidence=routing.evidence(),baton=evidence.batons[0],decision=evidence.decisions.find(item=>item.trigger?.kind==='PROVIDER_FAILURE'&&item.action==='BATON_AND_HANDOFF'),success=evidence.decisions.find(item=>item.batonId===baton?.id&&item.outcome==='SUCCEEDED');
  assert.equal(completed.status,'SUCCEEDED',JSON.stringify({errors:completed.errors,calls,modelRoute:completed.modelRoute,routing:evidence,handoffs:handoffs.list(),contracts:contracts.list(),parcels:parcels.list().map(item=>({id:item.id,status:item.status,timeline:item.audit.timeline,provenance:item.provenance}))}));
  assert.deepEqual(calls,['source-model','source-model','cheap-model']);
  assert.equal(completed.retryHistory.length,1);
  assert.equal(completed.fallbackHistory.length,1);
  assert.equal(completed.fallbackHistory[0].failureKind,'transient-transport');
  assert.equal(completed.fallbackHistory[0].selectedModel,'cheap-model');
  assert.equal(completed.executionMode,'CONTROLLED_FAULT_INJECTION');
  assert.equal(completed.usage.totalTokens,40);
  assert.equal(completed.usage.accountedInvocations,3);
  assert.equal(completed.usage.unknownUsageInvocations,0);
  assert.ok(baton&&/^[a-f0-9]{64}$/.test(baton.sha256));
  assert.match(baton.completedWork.join(' '),/2 bounded same-route execution attempt/);
  assert.equal(decision?.trigger?.code,'transient-transport');
  assert.equal(decision?.target?.modelId,'cheap-model');
  assert.equal(success?.outcome,'SUCCEEDED');
  assert.equal(evidence.threads.find(thread=>thread.id===baton.threadId)?.recoverable,true);
  const finalParcel=parcels.get(completed.workParcelIds.at(-1)!)!;
  assert.deepEqual(finalParcel.audit.invocations.map(item=>item.model),['source-model','cheap-model']);
  assert.equal(finalParcel.audit.invocations[0].requestDispatched,false);
  assert.equal(finalParcel.audit.invocations[0].totalTokens,0);
  assert.equal(finalParcel.audit.invocations[0].verifierResult,'not-applicable-transport-failure');
  assert.ok(finalParcel.audit.timeline.some(item=>item.type==='retry.exhausted'));
  assert.ok(finalParcel.audit.timeline.some(item=>item.type==='governor.decision'));
  assert.ok(finalParcel.audit.timeline.some(item=>item.type==='baton.created'));
  assert.ok(finalParcel.audit.timeline.some(item=>item.type==='handoff.completed'));
  assert.equal(models.qualification('source-model').state,'QUALIFIED');
  assert.equal(models.qualification('cheap-model').state,'QUALIFIED');
});
test('repository review invokes the selected provider directly and persists attributable Work Parcels, usage and response evidence', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-control-direct-review-')),originalFetch=globalThis.fetch;let requestBody:Record<string,unknown>|undefined;
  globalThis.fetch=async(_input,init)=>{requestBody=JSON.parse(String(init?.body));return new Response(JSON.stringify({id:'provider-response-secret-id',model:'vendor/reviewer',choices:[{finish_reason:'stop',message:{content:JSON.stringify({schema:'agent-control.repository-review/v1',executiveSummary:'Reviewed one frozen chunk.',findings:[],positiveObservations:['Typed boundary'],areasReviewed:['index.ts'],areasNotReviewed:[],verdict:'PASS'})}}],usage:{prompt_tokens:80,completion_tokens:20,total_tokens:100,cost:.002}}),{status:200,headers:{'content-type':'application/json'}})};
  try{
    const models=new ModelRegistry([{id:'external',kind:'openai-compatible',baseUrl:'https://provider.example/v1',wireApi:'chat-completions',auth:{type:'none'},enabled:true}],[{id:'reviewer',provider:'external',providerModel:'vendor/reviewer',capabilities:['repository-review'],qualification:{state:'QUALIFIED',version:'qualification-7',qualifiedAt:'2026-09-01T00:00:00Z',capabilities:['repository-review'],nodes:['controller']},pricing:{currency:'USD',inputPerMillionTokens:1,outputPerMillionTokens:2,effectiveFrom:'2026-09-01',source:'fixture'}}],{roles:{'review.default':{primary:'reviewer',requires:['repository-review']}}}),route=models.route({modelRole:'review.default',nodeId:'controller',requiredCapabilities:['repository-review']}),store=new WorkParcelStore(path.join(root,'parcels.json')),routing=new TokenAwareBatonRuntime(path.join(root,'token-routing.json')),executor=new DirectRepositoryReviewExecutor(models,store,routing);
    const origin=governedRequestOrigin({channel:'openwa',modality:'text',receivedAt:'2026-09-01T00:00:00Z',authentication:'enrolled-direct-sender',actorId:'test',authority:['template:saved-1'],messageReference:'a'.repeat(64),identityReference:'b'.repeat(64),request:'run saved-1'});
    const run:ParameterizedJobRun={schema:'agent-control.job-run/v1',id:'run-1',occurrenceId:'occurrence-1',savedJobId:'saved-1',definition:repositoryCodeReviewDefinition,resolvedParameters:{node:'controller',repository:'/repo',ref:'main',scope:'full'},trigger:{type:'manual',actor:'test',origin},status:'RUNNING',transitions:[{status:'RUNNING',at:'2026-09-01T00:00:00Z'}],requestedAt:'2026-09-01T00:00:00Z',startedAt:'2026-09-01T00:00:00Z',repository:{identity:'repo-id',name:'repo',nodeId:'controller',sourcePath:'/repo',requestedRef:'main',reviewedSha:'0123456789012345678901234567890123456789',dirty:false,dirtyPaths:[],snapshotPath:'/snapshot',snapshotKind:'local-shared-clone'},context:{profile:'STANDARD',files:['index.ts'],changedFiles:[],omittedFiles:[],chunks:[{id:'context-1',files:['index.ts'],sha256:'abc'}],truncated:false},workParcelIds:[],evidence:[],providerResponseIds:[],usage:{source:'unavailable'},errors:[],fallbackHistory:[],retryHistory:[],immutable:false};
    const result=await executor.execute({run,executionAttempt:1,executionId:'repository-review:run-1:1',route,instruction:'Return the governed repository-review-v1 object.',contextChunks:[{id:'context-1',content:'===== index.ts =====\nexport const safe = true;',files:['index.ts'],sha256:'abc'}],maximumOutputTokens:1000,maximumCost:1,signal:new AbortController().signal});
    assert.equal(requestBody?.model,'vendor/reviewer');assert.equal((requestBody?.response_format as {type?:string})?.type,'json_schema');assert.equal(((requestBody?.response_format as {json_schema?:{strict?:boolean}})?.json_schema?.strict),true);assert.equal(JSON.stringify(requestBody).includes('codex'),false);assert.equal(result.result.verdict,'PASS');assert.equal(result.usage.totalTokens,100);assert.equal(result.usage.providerReportedCost,.002);assert.equal(result.usage.calculatedCost,.00012);assert.equal(result.usage.cost,.002);assert.equal(result.usage.source,'provider');assert.match(result.providerResponseIds[0],/^sha256:[a-f0-9]{64}$/);assert.equal(result.providerResponseIds[0].includes('provider-response-secret-id'),false);assert.equal(result.workParcelIds.length,1);executor.recordVerification(result.workParcelIds,'PASS');let parcel=store.get(result.workParcelIds[0])!;assert.equal(parcel.executionOwner,'direct-repository-review-executor');assert.equal(parcel.status,'SUCCEEDED');assert.equal(parcel.stages[0].actualRoute?.provider,'external');assert.equal(parcel.stages[0].actualRoute?.model,'reviewer');assert.equal(parcel.telemetry.totalTokens,100);assert.equal(parcel.telemetry.cost,.002);assert.equal(parcel.audit.invocations[0].providerModel,'vendor/reviewer');assert.equal(parcel.audit.invocations[0].qualificationVersion,'qualification-7');assert.equal(parcel.audit.invocations[0].verifierResult,'PASS');assert.ok(parcel.audit.timeline.some(event=>event.type==='verification.completed'));assert.equal(parcel.audit.totals.costBasis,'provider-reported');assert.equal(parcel.provenance.some(item=>item.detail===run.repository?.reviewedSha),true);const runtime=new JobRuntime(new JobCatalog(new Set()),new ActionRegistry(),new WorkerRegistry(),new RunLedger(path.join(root,'runs.json')),new ArtifactStore(path.join(root,'artifacts')),new ResourceLockManager(path.join(root,'locks.json'))),coordinator=new WorkParcelCoordinator(runtime,store,{plan:()=>{throw new Error('direct_parcel_must_not_be_planned')}});await coordinator.tick();parcel=coordinator.get(result.workParcelIds[0]);assert.equal(parcel.audit.invocations.length,1);assert.equal(parcel.audit.totals.totalTokens,100);assert.equal(parcel.telemetry.totalTokens,100);assert.equal(coordinator.list()[0].audit.totals.totalTokens,100);const thread=routing.projection().threads[0];assert.equal(thread.active,false);assert.equal(thread.latest.cumulative.totalTokens,100);assert.equal(thread.latest.context.authority,'unavailable');assert.equal(routing.parcel(thread.parcelId).totalTokens,100);
    assert.equal(thread.latest.cumulative.inputTokens,80);assert.equal(thread.latest.cumulative.freshInputTokens,null);assert.equal(thread.latest.cumulative.cachedInputTokens,null);assert.equal(parcel.telemetry.inputTokens,80);assert.equal(parcel.audit.totals.inputTokens,80);assert.equal(parcel.audit.invocations[0].inputTokens,80);assert.equal(parcel.prompt,'run saved-1');assert.deepEqual(parcel.origin,origin);assert.ok(parcel.provenance.some(item=>item.type==='request-origin'&&item.detail===`openwa:${'a'.repeat(64)}`));
  }finally{globalThis.fetch=originalFetch;fs.rmSync(root,{recursive:true,force:true})}
});

test('production repository review applies the audited provider invocation profile through the provider adapter', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-control-review-provider-profile-'));
  try {
    const models=new ModelRegistry([{id:'nvidia-hosted',kind:'openai-compatible',adapter:'nvidia-hosted-v1',baseUrl:'https://integrate.api.nvidia.com/v1',wireApi:'chat-completions',auth:{type:'none'},enabled:true}],[{id:'gpt-oss',provider:'nvidia-hosted',providerModel:'openai/gpt-oss-20b',capabilities:['repository-review'],qualification:{state:'QUALIFIED',version:'q1',capabilities:['repository-review'],nodes:['controller']}}],{roles:{review:{primary:'gpt-oss',requires:['repository-review']}}}),route=models.route({model:'gpt-oss',nodeId:'controller',requiredCapabilities:['repository-review']}),seen:string[]=[],store=new WorkParcelStore(path.join(root,'parcels.json'));
    const executor=new DirectRepositoryReviewExecutor(models,store,undefined,undefined,provider=>({invoke:async(model,_input,options)=>{seen.push(options?.requestExtension?.profile??'none');assert.deepEqual(options?.requestExtension?.body,{chat_template_kwargs:{enable_thinking:false}});return{providerId:provider.id,modelId:model.id,providerModel:model.providerModel,invocationProfile:options?.requestExtension?.profile,output:JSON.stringify({schema:'agent-control.repository-review/v1',executiveSummary:'Reviewed.',findings:[],positiveObservations:[],areasReviewed:['first.ts'],areasNotReviewed:[],verdict:'PASS'}),elapsedMs:1,usage:{inputTokens:10,outputTokens:2,cachedInputTokens:0,cacheWriteTokens:0,totalTokens:12,providerReportedCost:null,calculatedCost:null,currency:null},responseModel:model.providerModel,finishReason:'stop',toolCall:null};}}));
    const request:ReviewExecutionRequest=reviewRequest(route);request.contextChunks=request.contextChunks.slice(0,1);delete request.maximumCost;
    const response=await executor.execute(request),parcel=store.get(response.workParcelIds[0])!;
    assert.deepEqual(seen,['nvidia-hosted-nonreasoning-repository-review-v1']);
    assert.equal(parcel.audit.invocations[0].invocationProfile,'nvidia-hosted-nonreasoning-repository-review-v1');
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('provider review parsing rejects structurally incomplete findings before validation',()=>{
  const base={schema:'agent-control.repository-review/v1',executiveSummary:'summary',findings:[],positiveObservations:[],areasReviewed:['index.ts'],areasNotReviewed:[],verdict:'PASS'};
  assert.equal(parseRepositoryReviewResponse(JSON.stringify(base)).verdict,'PASS');
  assert.throws(()=>parseRepositoryReviewResponse(JSON.stringify({...base,findings:[{id:'f1',severity:'high',title:'Missing evidence'}],verdict:'PASS_WITH_FINDINGS'})),/repository_review_provider_schema_invalid/);
  assert.throws(()=>parseRepositoryReviewResponse(JSON.stringify({...base,verdict:'MAYBE'})),/repository_review_provider_schema_invalid/);
  assert.throws(()=>parseRepositoryReviewResponse('{not json'),/repository_review_provider_json_invalid/);
});

test('repository review wire schema satisfies strict structured-output object requirements and normalizes nullable locations',()=>{
  const visit=(schema:unknown):void=>{
    if(!schema||typeof schema!=='object'||Array.isArray(schema))return;
    const node=schema as Record<string,unknown>,properties=node.properties as Record<string,unknown>|undefined;
    if(properties){assert.equal(node.additionalProperties,false);assert.deepEqual(new Set(node.required as string[]),new Set(Object.keys(properties)));for(const child of Object.values(properties))visit(child)}
    if(node.items)visit(node.items);
  };
  visit(REPOSITORY_REVIEW_OUTPUT_SCHEMA);
  assert.equal(JSON.stringify(REPOSITORY_REVIEW_OUTPUT_SCHEMA).includes('"const"'),false);
  assert.equal(JSON.stringify(REPOSITORY_REVIEW_OUTPUT_SCHEMA).includes('"enum"'),true);
  assert.deepEqual((REPOSITORY_REVIEW_OUTPUT_SCHEMA.properties as Record<string,{enum?:string[]}>).verdict.enum,['PASS','PASS_WITH_FINDINGS','REVIEW_REQUIRED','FAILED']);
  const finding={id:'f1',severity:'low',title:'A finding',category:'maintainability',file:null,startLine:null,endLine:null,evidence:'Observed in the bounded source.',reasoning:'The implementation can be clearer.',impact:'Low maintenance cost.',suggestedRemediation:'Clarify the implementation.',confidence:.8,validation:{state:'UNVERIFIED',reasons:[]}};
  const result=parseRepositoryReviewResponse(JSON.stringify({schema:'agent-control.repository-review/v1',executiveSummary:'summary',findings:[finding],positiveObservations:[],areasReviewed:['index.ts'],areasNotReviewed:[],verdict:'PASS_WITH_FINDINGS'}));
  assert.equal(result.findings[0].file,undefined);assert.equal(result.findings[0].startLine,undefined);assert.equal(result.findings[0].endLine,undefined);
  assert.throws(()=>parseRepositoryReviewResponse(JSON.stringify({...result,findings:[{...finding,file:null,startLine:null,endLine:null,category:'release-integrity'}]})),/\$\.findings\[0\]\.category:enum/);
});

test('repository review instruction distinguishes severe findings from an unusable review',()=>{
  assert.match(repositoryCodeReviewDefinition.template.instruction,/completed review with supported defects is PASS_WITH_FINDINGS, regardless of severity/i);
  assert.match(repositoryCodeReviewDefinition.template.instruction,/FAILED means the review itself could not be completed or could not produce a usable result/i);
});

test('production review escalates a real quality-gate failure through a sealed baton while context remains low', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-control-quality-escalation-'));
  try {
    const {models,route}=qualityHandoffRegistry(),store=new WorkParcelStore(path.join(root,'parcels.json')),routing=new TokenAwareBatonRuntime(path.join(root,'routing.json')),contracts=new ContractExecutionRuntime(path.join(root,'contracts.json')),handoffs=new GovernedHandoffRuntime(contracts,path.join(root,'handoffs.json')),calls:string[]=[];
    const clients:RepositoryReviewProviderClientFactory=provider=>({invoke:async(model,_input,options)=>{
      calls.push(model.id);const destination=model.id==='strong-reviewer',usage={inputTokens:destination?140:80,outputTokens:destination?40:10,cachedInputTokens:0,cacheWriteTokens:0,totalTokens:destination?180:90,providerReportedCost:null,calculatedCost:destination?.02:0,currency:'USD'};
      options?.onTelemetry?.({phase:'started',providerId:provider.id,modelId:model.id,elapsedMs:0,context:{tokens:10,limitTokens:100,authority:'authoritative',source:'fixture-provider'}});
      options?.onTelemetry?.({phase:'completed',providerId:provider.id,modelId:model.id,elapsedMs:10,usage,context:{tokens:12,limitTokens:100,authority:'authoritative',source:'fixture-provider'}});
      const findings=destination?[qualityFinding()]:[];
      return{providerId:provider.id,modelId:model.id,providerModel:model.providerModel,output:JSON.stringify({schema:'agent-control.repository-review/v1',executiveSummary:destination?'Identified the non-atomic reservation defect.':'No actionable defect identified.',findings,positiveObservations:[],areasReviewed:['reservation.ts'],areasNotReviewed:[],verdict:findings.length?'PASS_WITH_FINDINGS':'PASS'}),elapsedMs:10,usage,responseModel:model.providerModel,finishReason:'stop',toolCall:null};
    }});
    const gate={evaluate:({result,responseHash}:{result:{findings:Array<{title:string}>};responseHash:string})=>{const accepted=result.findings.some(item=>/non-atomic reservation/i.test(item.title));return{accepted,code:'reservation-race-acceptance',summary:accepted?'The result explains the predeclared concurrent reservation failure.':'The result does not explain the predeclared concurrent reservation failure.',evidence:['acceptance-test:reservation-concurrency',responseHash],unresolvedCriteria:accepted?[]:['Explain why concurrent callers can both reserve one seat'],nextAction:'Review the same frozen chunk and explain the concurrency failure with file-backed evidence.'};}};
    const executor=new DirectRepositoryReviewExecutor(models,store,routing,{routing,contracts,handoffs},clients,undefined,undefined,undefined,gate),request=reviewRequest(route);request.contextChunks=request.contextChunks.slice(0,1);request.maximumCost=10;
    const response=await executor.execute(request),parcel=store.get(response.workParcelIds[0])!,evidence=routing.evidence(),baton=evidence.batons[0];
    assert.deepEqual(calls,['small-reviewer','strong-reviewer']);
    assert.equal(response.result.findings[0].title,'Non-atomic reservation permits duplicate ownership');
    assert.equal(parcel.audit.invocations.length,2);assert.deepEqual(parcel.audit.invocations.map(item=>item.model),calls);
    assert.ok(parcel.audit.timeline.some(item=>item.summary.includes('quality gate rejected local-small/small-reviewer')));
    assert.ok(parcel.audit.timeline.some(item=>item.summary.includes('destination passed independently')));
    const selected=evidence.decisions.find(item=>item.reason.startsWith('quality_gate_failed_governed_fallback_selected'))!;
    assert.equal(selected.state,'CONTINUE');assert.equal(selected.contextPercent,12);assert.equal(selected.trigger?.kind,'QUALITY_GATE');assert.equal(selected.target?.modelId,'strong-reviewer');
    assert.match(baton.sha256,/^[a-f0-9]{64}$/);assert.ok(baton.completedWork.some(item=>item.includes('rejected that result')));assert.deepEqual(baton.unresolvedIssues,['Explain why concurrent callers can both reserve one seat']);
    assert.equal(routing.thread(`${request.executionId}:context-1`).recoverable,true);assert.equal(routing.parcel(parcel.id).totalTokens,270);
    executor.recordVerification(response.workParcelIds,response.result.verdict);assert.equal(contracts.list().find(item=>item.parentContractId)?.state,'VERIFIED');
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('quality escalation fails closed and preserves the original thread when the destination also misses the gate', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-control-quality-escalation-recovery-'));
  try {
    const {models,route}=qualityHandoffRegistry(),store=new WorkParcelStore(path.join(root,'parcels.json')),routing=new TokenAwareBatonRuntime(path.join(root,'routing.json')),contracts=new ContractExecutionRuntime(path.join(root,'contracts.json')),handoffs=new GovernedHandoffRuntime(contracts,path.join(root,'handoffs.json'));
    const clients:RepositoryReviewProviderClientFactory=provider=>({invoke:async(model,_input,options)=>{const usage={inputTokens:20,outputTokens:5,cachedInputTokens:0,cacheWriteTokens:0,totalTokens:25,providerReportedCost:null,calculatedCost:0,currency:'USD'};options?.onTelemetry?.({phase:'completed',providerId:provider.id,modelId:model.id,elapsedMs:1,usage,context:{tokens:5,limitTokens:100,authority:'authoritative',source:'fixture-provider'}});return{providerId:provider.id,modelId:model.id,providerModel:model.providerModel,output:JSON.stringify({schema:'agent-control.repository-review/v1',executiveSummary:'Defect not identified.',findings:[],positiveObservations:[],areasReviewed:['reservation.ts'],areasNotReviewed:[],verdict:'PASS'}),elapsedMs:1,usage,responseModel:model.providerModel,finishReason:'stop',toolCall:null};}});
    const gate={evaluate:()=>({accepted:false,code:'reservation-race-acceptance',summary:'Required defect was not explained.',evidence:['acceptance-test:reservation-concurrency'],unresolvedCriteria:['Explain concurrent duplicate ownership'],nextAction:'Re-evaluate the frozen reservation implementation.'})};
    const executor=new DirectRepositoryReviewExecutor(models,store,routing,{routing,contracts,handoffs},clients,undefined,undefined,undefined,gate),request=reviewRequest(route);request.contextChunks=request.contextChunks.slice(0,1);request.maximumCost=10;
    await assert.rejects(()=>executor.execute(request),/repository_review_quality_escalation_failed/);
    const sourceThread=routing.thread(`${request.executionId}:context-1`),failed=routing.evidence().decisions.find(item=>item.outcome==='FAILED');
    assert.equal(sourceThread.recoverable,true);assert.equal(failed?.trigger?.kind,'QUALITY_GATE');assert.match(failed?.reason??'',/handoff_failed_original_thread_reassessed/);assert.equal(store.list()[0].status,'FAILED');
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('production Work Parcel lifecycle assesses pressure, seals a baton, delegates the next chunk and independently verifies the destination', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-token-handoff-success-'));
  try {
    const {models, route} = handoffRegistry();
    const store = new WorkParcelStore(path.join(root, 'parcels.json'));
    const routing = new TokenAwareBatonRuntime(path.join(root, 'token-routing.json'));
    const contracts = new ContractExecutionRuntime(path.join(root, 'contracts.json'));
    const handoffs = new GovernedHandoffRuntime(contracts, path.join(root, 'handoffs.json'));
    const calls: Array<{model: string; prompt: string}> = [];
    const clients = fakeReviewClients(calls);
    const transportIntegrity = new TransportIntegrityRuntime(path.join(root, 'transport-integrity.json'));
    const executor = new DirectRepositoryReviewExecutor(models, store, routing, {routing, contracts, handoffs}, clients, undefined, undefined, undefined, undefined, undefined, undefined, transportIntegrity);

    const response = await executor.execute(reviewRequest(route));

    assert.deepEqual(calls.map(call => call.model), ['source-model', 'cheap-model']);
    assert.equal(calls[0].prompt.includes('1123456789012345678901234567890123456789'), false);
    assert.match(calls[0].prompt, /===== first\.ts =====/);
    assert.match(calls[1].prompt, /Governed continuation baton/);
    assert.match(calls[1].prompt, /Baton SHA-256: [a-f0-9]{64}/);
    assert.match(calls[1].prompt, /Exact next action: Review frozen context chunk context-2/);
    assert.equal(response.workParcelIds.length, 1);
    assert.equal(response.result.areasReviewed.includes('second.ts'), true);

    const parcel = store.get(response.workParcelIds[0])!;
    assert.equal(parcel.transportIntegrity?.state, 'COMPLETE');
    assert.equal(parcel.transportIntegrity?.contractSha256.length, 64);
    assert.deepEqual(parcel.audit.invocations.map(item => item.model), ['source-model', 'cheap-model']);
    assert.equal(parcel.audit.totals.invocations, 2);
    assert.equal(parcel.audit.totals.totalTokens, 220);
    assert.equal(parcel.telemetry.totalTokens, 220);
    assert.equal(parcel.provenance.some(item => item.type === 'governed-verification-contract'), true);

    const evidence = routing.evidence();
    assert.equal(evidence.batons.length, 1);
    assert.match(evidence.batons[0].sha256, /^[a-f0-9]{64}$/);
    assert.equal(evidence.decisions.some(item => item.action === 'BATON_AND_HANDOFF' && item.outcome === 'SUCCEEDED'), true);
    assert.deepEqual(routing.parcel(parcel.id).byModel.map(item => item.modelId).sort(), ['cheap-model', 'source-model']);
    assert.equal(routing.parcel(parcel.id).totalTokens, 220);
    assert.equal(routing.parcel(parcel.id).freshInputTokens, 190);
    assert.equal(routing.parcel(parcel.id).cachedInputTokens, 0);
    assert.equal(handoffs.list()[0].status, 'COMPLETED');

    executor.recordVerification(response.workParcelIds, 'FAILED');
    const destination = contracts.list().find(contract => contract.parentContractId);
    assert.equal(destination?.active.modelId, 'cheap-model');
    assert.equal(destination?.verification.state, 'FAILED');
    assert.equal(destination?.state, 'FAILED');
    assert.equal(store.get(parcel.id)?.audit.invocations.every(item => item.verifierResult === 'FAILED'), true);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('failed production destination execution preserves evidence and resumes the original provider thread', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-token-handoff-recovery-'));
  try {
    const {models, route} = handoffRegistry();
    const store = new WorkParcelStore(path.join(root, 'parcels.json'));
    const routing = new TokenAwareBatonRuntime(path.join(root, 'token-routing.json'));
    const contracts = new ContractExecutionRuntime(path.join(root, 'contracts.json'));
    const handoffs = new GovernedHandoffRuntime(contracts, path.join(root, 'handoffs.json'));
    const calls: Array<{model: string; prompt: string}> = [];
    const clients = fakeReviewClients(calls, true);
    const executor = new DirectRepositoryReviewExecutor(models, store, routing, {routing, contracts, handoffs}, clients);

    const response = await executor.execute(reviewRequest(route));

    assert.deepEqual(calls.map(call => call.model), ['source-model', 'cheap-model', 'source-model']);
    assert.equal(response.workParcelIds.length, 1);
    const parcel = store.get(response.workParcelIds[0])!;
    assert.deepEqual(parcel.audit.invocations.map(item => item.model), ['source-model', 'cheap-model', 'source-model']);
    assert.equal(parcel.audit.totals.totalTokens, 200);
    assert.equal(parcel.audit.timeline.some(item => item.type === 'route.changed' && item.summary.includes('resumed')), true);
    const failed = routing.evidence().decisions.find(item => item.outcome === 'FAILED');
    assert.equal(failed?.action, 'COMPACT_AND_CONTINUE');
    assert.match(failed?.reason ?? '', /handoff_failed_original_thread_reassessed/);
    assert.equal(routing.thread('repository-review:run-handoff:1:context-1').recoverable, true);

    const destination = contracts.list().find(contract => contract.parentContractId);
    const source = contracts.list().find(contract => !contract.parentContractId);
    assert.equal(destination?.verification.state, 'FAILED');
    assert.equal(destination?.state, 'FAILED');
    assert.equal(source?.state, 'ACTIVE');
    executor.recordVerification(response.workParcelIds, response.result.verdict);
    assert.deepEqual(store.get(parcel.id)?.audit.invocations.map(item => item.verifierResult), ['PASS', 'not-applicable-transport-failure', 'PASS']);
    assert.equal(contracts.get(source!.id).verification.state, 'PASSED');
    assert.equal(contracts.get(source!.id).state, 'VERIFIED');
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('production handoff binds the destination account and node and preserves account-aware baton and ledger identity', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-account-handoff-'));
  const forbiddenSecret = 'sk-account-secret-must-never-enter-evidence-123456';
  try {
    const {models, route} = accountHandoffRegistry();
    const store = new WorkParcelStore(path.join(root, 'parcels.json'));
    const routing = new TokenAwareBatonRuntime(path.join(root, 'token-routing.json'));
    const contracts = new ContractExecutionRuntime(path.join(root, 'contracts.json'));
    const handoffs = new GovernedHandoffRuntime(contracts, path.join(root, 'handoffs.json'));
    const calls: Array<{model: string; account: string}> = [];
    const clients: RepositoryReviewProviderClientFactory = (provider, account, selectedRoute) => ({async invoke(model, input, options) {
      if (!account) throw new Error('account_profile_required');
      calls.push({model: model.id, account: account.id});
      if (model.id === 'luna-plus' && account.id !== 'cottage-plus') throw new Error('destination_account_isolation_failed');
      if (model.id === 'sol-pro' && account.id !== 'lawrence-pro') throw new Error('source_account_isolation_failed');
      const source = model.id === 'sol-pro', usage = {inputTokens: source ? 90 : 100, outputTokens: source ? 10 : 20, cachedInputTokens: 0, totalTokens: source ? 100 : 120, providerReportedCost: source ? .02 : .002, calculatedCost: source ? .0022 : .00014, currency: 'USD'};
      options?.onTelemetry?.({phase: 'completed', providerId: provider.id, modelId: model.id, elapsedMs: 10, usage, context: {tokens: source ? 91 : 20, limitTokens: 100, authority: 'authoritative', source: 'fixture'}});
      const reviewed = renderProviderPrompt(input).includes('===== second.ts =====') ? 'second.ts' : 'first.ts';
      return {providerId: provider.id, accountProfileId: account.id, modelId: model.id, nodeId: selectedRoute?.nodeId, providerModel: model.providerModel, output: JSON.stringify({schema: 'agent-control.repository-review/v1', executiveSummary: `Reviewed ${reviewed}.`, findings: [], positiveObservations: [], areasReviewed: [reviewed], areasNotReviewed: [], verdict: 'PASS'}), elapsedMs: 10, usage, responseModel: model.providerModel, finishReason: 'stop', toolCall: null};
    }});
    const executor = new DirectRepositoryReviewExecutor(models, store, routing, {routing, contracts, handoffs}, clients);
    const response = await executor.execute(reviewRequest(route));
    const parcel = store.get(response.workParcelIds[0])!, evidence = routing.evidence(), baton = evidence.batons[0], totals = routing.parcel(parcel.id);
    assert.deepEqual(calls, [{model: 'sol-pro', account: 'lawrence-pro'}, {model: 'luna-plus', account: 'cottage-plus'}]);
    assert.equal(baton.accountProfileId, 'lawrence-pro');
    assert.equal(baton.nodeId, 'source-node');
    assert.equal(evidence.decisions.find(item => item.action === 'BATON_AND_HANDOFF')?.target?.accountProfileId, 'cottage-plus');
    assert.equal(evidence.decisions.find(item => item.action === 'BATON_AND_HANDOFF')?.target?.nodeId, 'destination-node');
    assert.deepEqual(parcel.audit.invocations.map(item => [item.provider, item.accountProfileId, item.model, item.node]), [['openai-codex', 'lawrence-pro', 'sol-pro', 'source-node'], ['openai-codex', 'cottage-plus', 'luna-plus', 'destination-node']]);
    assert.deepEqual(parcel.audit.totals.models, ['openai-codex/Lawrence Pro/sol-pro@source-node', 'openai-codex/Cottage Plus/luna-plus@destination-node']);
    assert.deepEqual(totals.byModel.map(item => [item.providerId, item.accountProfileId, item.modelId, item.nodeId]), [['openai-codex', 'lawrence-pro', 'sol-pro', 'source-node'], ['openai-codex', 'cottage-plus', 'luna-plus', 'destination-node']]);
    assert.equal(totals.totalTokens, 220);
    const destination = contracts.list().find(contract => contract.parentContractId);
    assert.equal(destination?.active.accountProfileId, 'cottage-plus');
    assert.equal(destination?.active.nodeId, 'destination-node');
    assert.equal(JSON.stringify({parcel, evidence, contracts: contracts.list()}).includes(forbiddenSecret), false);
    executor.recordVerification(response.workParcelIds, 'PASS');
    assert.equal(contracts.get(destination!.id).state, 'VERIFIED');
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('cross-provider continuation selects a qualified destination node instead of inheriting the source node', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-control-cross-provider-node-'));
  try {
    const providers=[{id:'source',kind:'cli' as const,enabled:true,accountProfiles:[{id:'remote',nodeId:'remote-node',label:'Remote',credentialStore:{type:'codex-home-env' as const,env:'CODEX_HOME_REMOTE'},qualification:{state:'QUALIFIED' as const,qualifiedAt:'2026-09-03T00:00:00Z',capabilities:['repository-review']}}]},{id:'local',kind:'local' as const,baseUrl:'http://127.0.0.1:8080/v1',enabled:true}];
    const models=[{id:'strong',provider:'source',accountProfile:'remote',providerModel:'strong',capabilities:['repository-review'],nodes:['remote-node'],qualification:{state:'QUALIFIED' as const,version:'q1',qualifiedAt:'2026-09-03T00:00:00Z',capabilities:['repository-review'],nodes:['remote-node']},pricing:{currency:'USD',inputPerMillionTokens:10,outputPerMillionTokens:10,effectiveFrom:'2026-09-03',source:'fixture'}},{id:'cheap',provider:'local',providerModel:'cheap',capabilities:['repository-review'],nodes:['controller'],qualification:{state:'QUALIFIED' as const,version:'q1',qualifiedAt:'2026-09-03T00:00:00Z',capabilities:['repository-review'],nodes:['controller']},pricing:{currency:'USD',inputPerMillionTokens:0,outputPerMillionTokens:0,effectiveFrom:'2026-09-03',source:'fixture'}}];
    const registry=new ModelRegistry(providers,models,{roles:{review:{primary:'strong',fallback:['cheap'],requires:['repository-review']}}},undefined,undefined,{});
    const source=registry.route({model:'strong',nodeId:'remote-node',requiredCapabilities:['repository-review']});
    const seen:string[]=[];
    const routing=new TokenAwareBatonRuntime(undefined,{continuePercent:1,prepareBatonPercent:2,compactPercent:3,handoffPercent:4});
    const store=new WorkParcelStore(path.join(root,'parcels.json'));
    const contracts=new ContractExecutionRuntime(path.join(root,'contracts.json'));
    const handoffs=new GovernedHandoffRuntime(contracts,path.join(root,'handoffs.json'));
    const executor=new DirectRepositoryReviewExecutor(registry,store,routing,{routing,contracts,handoffs},(_provider,_account,route)=>({invoke:async(model,_input,options)=>{
      seen.push(`${model.id}@${route?.nodeId}`);
      const usage={inputTokens:10,outputTokens:2,cachedInputTokens:0,totalTokens:12,providerReportedCost:null,calculatedCost:model.id==='strong'?1:0,currency:'USD'};
      options?.onTelemetry?.({phase:'started',providerId:model.provider,modelId:model.id,elapsedMs:0,context:{tokens:5,limitTokens:100,authority:'estimated',source:'fixture'}});
      options?.onTelemetry?.({phase:'completed',providerId:model.provider,modelId:model.id,elapsedMs:1,usage,context:{tokens:5,limitTokens:100,authority:'estimated',source:'fixture'}});
      return {providerId:model.provider,accountProfileId:model.accountProfile,modelId:model.id,nodeId:route?.nodeId,providerModel:model.providerModel,output:JSON.stringify({schema:'agent-control.repository-review/v1',executiveSummary:`Reviewed by ${model.id}.`,findings:[],positiveObservations:[],areasReviewed:[model.id==='strong'?'first.ts':'second.ts'],areasNotReviewed:[],verdict:'PASS'}),elapsedMs:1,usage,responseModel:model.providerModel,finishReason:'completed',toolCall:null};
    }}));
    await executor.execute(reviewRequest(source));
    assert.deepEqual(seen,['strong@remote-node','cheap@controller']);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

function handoffRegistry() {
  const models = new ModelRegistry([
    {id: 'source-provider', kind: 'openai-compatible', baseUrl: 'https://source.example/v1', auth: {type: 'none'}, enabled: true},
    {id: 'cheap-provider', kind: 'openai-compatible', baseUrl: 'https://cheap.example/v1', auth: {type: 'none'}, enabled: true},
  ], [
    {id: 'source-model', provider: 'source-provider', providerModel: 'source/reviewer', capabilities: ['repository-review'], qualification: {state: 'QUALIFIED', version: 'source-q1', capabilities: ['repository-review'], nodes: ['controller']}, pricing: {currency: 'USD', inputPerMillionTokens: 20, outputPerMillionTokens: 40, effectiveFrom: '2026-09-01', source: 'fixture'}},
    {id: 'cheap-model', provider: 'cheap-provider', providerModel: 'cheap/reviewer', capabilities: ['repository-review'], qualification: {state: 'QUALIFIED', version: 'cheap-q1', capabilities: ['repository-review'], nodes: ['controller']}, pricing: {currency: 'USD', inputPerMillionTokens: 1, outputPerMillionTokens: 2, effectiveFrom: '2026-09-01', source: 'fixture'}},
  ], {roles: {'review.default': {primary: 'source-model', fallback: ['cheap-model'], requires: ['repository-review']}}});
  return {models, route: models.route({model: 'source-model', nodeId: 'controller', requiredCapabilities: ['repository-review'], allowFallback: false})};
}

function qualityHandoffRegistry() {
  const models=new ModelRegistry([
    {id:'local-small',kind:'local',baseUrl:'http://127.0.0.1:8080/v1',enabled:true},
    {id:'local-strong',kind:'local',baseUrl:'http://127.0.0.1:19223/v1',enabled:true},
  ],[
    {id:'small-reviewer',provider:'local-small',providerModel:'qwen-3b',capabilities:['repository-review'],qualification:{state:'QUALIFIED',version:'small-q1',capabilities:['repository-review'],nodes:['controller']},pricing:{currency:'USD',inputPerMillionTokens:0,outputPerMillionTokens:0,effectiveFrom:'2026-09-06',source:'local'}},
    {id:'strong-reviewer',provider:'local-strong',providerModel:'ministral-8b',capabilities:['repository-review'],qualification:{state:'QUALIFIED',version:'strong-q1',capabilities:['repository-review'],nodes:['controller']},pricing:{currency:'USD',inputPerMillionTokens:100,outputPerMillionTokens:100,effectiveFrom:'2026-09-06',source:'fixture-higher-cost'}},
  ],{roles:{'review.quality-escalation':{primary:'small-reviewer',fallback:['strong-reviewer'],requires:['repository-review']}}});
  return{models,route:models.route({modelRole:'review.quality-escalation',nodeId:'controller',requiredCapabilities:['repository-review'],allowFallback:false})};
}

function qualityFinding(){return{id:'reservation-race',severity:'high' as const,title:'Non-atomic reservation permits duplicate ownership',category:'correctness' as const,file:'reservation.ts',startLine:2,endLine:6,evidence:'The read and write are separated by awaited work, so two callers can observe an unowned seat.',reasoning:'Both concurrent calls pass the ownership check before either update is committed.',impact:'One seat can be assigned to multiple users.',suggestedRemediation:'Use an atomic conditional update or transaction and verify one affected row.',confidence:.98,validation:{state:'VALID' as const,reasons:['Matches the concurrent reservation acceptance test.']}};}

function accountHandoffRegistry() {
  const profiles = [
    {id: 'lawrence-pro', nodeId: 'source-node', label: 'Lawrence Pro', plan: 'ChatGPT Pro', credentialStore: {type: 'codex-home-env' as const, env: 'CODEX_HOME_LAWRENCE_PRO'}, qualification: {state: 'QUALIFIED' as const, version: 'account-pro-q1', checkedAt: '2026-09-02T00:00:00Z', qualifiedAt: '2026-09-02T00:00:00Z', capabilities: ['codex-chatgpt'], evidence: ['interactive-login']}},
    {id: 'cottage-plus', nodeId: 'destination-node', label: 'Cottage Plus', plan: 'ChatGPT Plus', credentialStore: {type: 'codex-home-env' as const, env: 'CODEX_HOME_COTTAGE_PLUS'}, qualification: {state: 'QUALIFIED' as const, version: 'account-plus-q1', checkedAt: '2026-09-02T00:00:00Z', qualifiedAt: '2026-09-02T00:00:00Z', capabilities: ['codex-chatgpt'], evidence: ['interactive-login']}},
  ];
  const models = new ModelRegistry([{id: 'openai-codex', kind: 'cli', enabled: true, accountProfiles: profiles}], [
    {id: 'sol-pro', provider: 'openai-codex', accountProfile: 'lawrence-pro', providerModel: 'sol', capabilities: ['repository-review'], qualification: {state: 'QUALIFIED', version: 'sol-q1', capabilities: ['repository-review'], nodes: ['source-node']}, pricing: {currency: 'USD', inputPerMillionTokens: 20, outputPerMillionTokens: 40, effectiveFrom: '2026-09-01', source: 'fixture'}},
    {id: 'luna-plus', provider: 'openai-codex', accountProfile: 'cottage-plus', providerModel: 'luna', capabilities: ['repository-review'], qualification: {state: 'QUALIFIED', version: 'luna-q1', capabilities: ['repository-review'], nodes: ['destination-node']}, pricing: {currency: 'USD', inputPerMillionTokens: 1, outputPerMillionTokens: 2, effectiveFrom: '2026-09-01', source: 'fixture'}},
  ], {roles: {'review.default': {primary: 'sol-pro', fallback: ['luna-plus'], requires: ['repository-review']}}}, undefined, undefined, {CODEX_HOME_LAWRENCE_PRO: process.cwd(), CODEX_HOME_COTTAGE_PLUS: process.cwd()});
  return {models, route: models.route({model: 'sol-pro', accountProfile: 'lawrence-pro', nodeId: 'source-node', requiredCapabilities: ['repository-review'], allowFallback: false})};
}

function reviewRequest(route: ReturnType<ModelRegistry['route']>) {
  const run: ParameterizedJobRun = {schema: 'agent-control.job-run/v1', id: 'run-handoff', occurrenceId: 'occurrence-handoff', savedJobId: 'saved-handoff', definition: repositoryCodeReviewDefinition, resolvedParameters: {node: 'controller', repository: '/repo', ref: 'main', scope: 'full'}, trigger: {type: 'manual', actor: 'test'}, status: 'RUNNING', transitions: [{status: 'RUNNING', at: '2026-09-02T00:00:00Z'}], requestedAt: '2026-09-02T00:00:00Z', startedAt: '2026-09-02T00:00:00Z', repository: {identity: 'repo-id', name: 'repo', nodeId: 'controller', sourcePath: '/repo', requestedRef: 'main', reviewedSha: '1123456789012345678901234567890123456789', dirty: false, dirtyPaths: [], snapshotPath: '/snapshot', snapshotKind: 'local-shared-clone'}, context: {profile: 'STANDARD', files: ['first.ts', 'second.ts'], changedFiles: [], omittedFiles: [], chunks: [{id: 'context-1', files: ['first.ts'], sha256: 'one'}, {id: 'context-2', files: ['second.ts'], sha256: 'two'}], truncated: false}, workParcelIds: [], evidence: [], providerResponseIds: [], usage: {source: 'unavailable'}, errors: [], fallbackHistory: [], retryHistory: [], immutable: false};
  return {run, executionAttempt: 1, executionId: 'repository-review:run-handoff:1', route, instruction: 'Return the governed repository-review-v1 object.', contextChunks: [{id: 'context-1', content: '===== first.ts =====\nexport const first = true;', files: ['first.ts'], sha256: 'one'}, {id: 'context-2', content: '===== second.ts =====\nexport const second = true;', files: ['second.ts'], sha256: 'two'}], maximumOutputTokens: 1000, maximumCost: 1, signal: new AbortController().signal};
}

function fakeReviewClients(calls: Array<{model: string; prompt: string}>, failDestination = false): RepositoryReviewProviderClientFactory {
  return provider => ({
    async invoke(model, input, options) {
      calls.push({model: model.id, prompt: renderProviderPrompt(input)});
      const source = model.id === 'source-model';
      const usage = {inputTokens: source ? 90 : 100, outputTokens: source ? 10 : 20, cachedInputTokens: 0, totalTokens: source ? 100 : 120, providerReportedCost: source ? 0.02 : 0.002, calculatedCost: source ? 0.0022 : 0.00014, currency: 'USD'};
      options?.onTelemetry?.({phase: 'started', providerId: provider.id, modelId: model.id, elapsedMs: 0, context: {tokens: source ? 91 : 20, limitTokens: 100, authority: 'authoritative', source: 'fixture-live-context'}});
      if (!source && failDestination) throw Object.assign(new Error('destination_transport_failed'), {providerFailureObservation: {requestDispatched: false, usage: {inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, totalTokens: 0, providerReportedCost: 0, calculatedCost: 0, currency: 'USD'}, usageAuthority: 'authoritative', elapsedMs: 0}});
      options?.onTelemetry?.({phase: 'completed', providerId: provider.id, modelId: model.id, elapsedMs: source ? 10 : 12, usage, context: {tokens: source ? 91 : 20, limitTokens: 100, authority: 'authoritative', source: 'fixture-live-context'}});
      const reviewed = renderProviderPrompt(input).includes('===== second.ts =====') ? 'second.ts' : 'first.ts';
      return {providerId: provider.id, modelId: model.id, providerModel: model.providerModel, output: JSON.stringify({schema: 'agent-control.repository-review/v1', executiveSummary: `Reviewed ${reviewed}.`, findings: [], positiveObservations: [], areasReviewed: [reviewed], areasNotReviewed: [], verdict: 'PASS'}), elapsedMs: source ? 10 : 12, usage, responseModel: model.providerModel, finishReason: 'stop', toolCall: null};
    },
  });
}

test('accepted review exchanges retain redacted input and final output per call', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ac-exchange-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const {models,route}=handoffRegistry(),store=new WorkParcelStore(path.join(root,'parcels.json')),calls:Array<{model:string;prompt:string}>=[];
  const executor=new DirectRepositoryReviewExecutor(models,store,undefined,undefined,fakeReviewClients(calls));
  const request=reviewRequest(route),secret=['sk','synthetic'+'Z'.repeat(30)].join('-');
  request.contextChunks=request.contextChunks.slice(0,1);request.contextChunks[0].content+='\n'+secret;
  const result=await executor.execute(request),invocation=store.get(result.workParcelIds[0])!.audit.invocations[0];
  assert.ok(invocation.exchange);assert.equal(invocation.exchange.redacted,true);assert.equal(invocation.exchange.truncated,false);
  assert.match(invocation.exchange.input,/first.ts/);assert.equal(invocation.exchange.input.includes(secret),false);
  assert.equal(JSON.parse(invocation.exchange.output).schema,'agent-control.repository-review/v1');
  assert.equal(invocation.totalTokens,100);
});

test('review publishes its durable parcel before the provider call completes',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ac-live-parcel-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const{models,route}=handoffRegistry(),store=new WorkParcelStore(path.join(root,'parcels.json')),published:string[]=[];
 const factory=fakeReviewClients([]),executor=new DirectRepositoryReviewExecutor(models,store,undefined,undefined,provider=>({invoke:async(...args)=>{assert.equal(published.length,1);assert.ok(store.get(published[0]));return factory(provider).invoke(...args);}}));
 const request=reviewRequest(route);request.contextChunks=request.contextChunks.slice(0,1);Object.assign(request,{onParcelCreated:(id:string)=>published.push(id)});
 const result=await executor.execute(request);assert.deepEqual(published,result.workParcelIds);
});

test('direct review writes each call to the shared usage ledger and independently marks verification',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ac-review-usage-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const{models,route}=handoffRegistry(),store=new WorkParcelStore(path.join(root,'parcels.json')),ledger=new MemoryHarnessEfficiencyLedger();
 const executor=new DirectRepositoryReviewExecutor(models,store,undefined,undefined,fakeReviewClients([]),undefined,undefined,undefined,undefined,undefined,undefined,undefined,ledger);
 const result=await executor.execute(reviewRequest(route));assert.equal(ledger.list().length,2);
 assert.equal(ledger.list().reduce((sum,r)=>sum+(r.usage.totalProcessedTokens??0),0),result.usage.totalTokens);
 assert.ok(ledger.list().every(r=>r.runId==='run-handoff'&&r.accounting?.parcelId&&r.verifierResult==='UNKNOWN'));
 executor.recordVerification(result.workParcelIds,'PASS');assert.ok(ledger.list().every(r=>r.verifierResult==='PASS'&&r.finalJobResult==='SUCCEEDED'));
});

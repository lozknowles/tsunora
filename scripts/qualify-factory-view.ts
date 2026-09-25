/** Real, read-only repository audit through JobRuntime/HarnessDispatcher and local model transports.
 * Evidence is external to source distribution. No synthetic state changes or deliberate failures. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {execFileSync} from 'node:child_process';
import type {AddressInfo} from 'node:net';
import {chromium} from 'playwright-core';
import {AdaptiveHarness,SkillCatalog,ToolPolicy} from '../src/control/adaptive-harness.js';
import {HarnessDispatcher,HarnessJobAgentAction,MemoryRecipeDispatchStore,ToolHandlerRegistry} from '../src/control/harness-dispatch.js';
import {StructuredChatProviderFactory} from '../src/control/structured-chat-provider.js';
import {FileHarnessEfficiencyLedger} from '../src/control/harness-efficiency.js';
import {JobCatalog} from '../src/control/job-catalog.js';
import {ActionRegistry,ArtifactStore,JobRuntime,ResourceLockManager,RunLedger,WorkerRegistry} from '../src/control/job-runtime.js';
import {WorkParcelCoordinator,WorkParcelStore,type WorkParcelPlan} from '../src/control/work-parcels.js';
import {WorkBoardRuntime} from '../src/control/work-board.js';
import {AgentControlService} from '../src/control/application-service.js';
import {ModelRegistry} from '../src/control/model-registry.js';
import type {ModelConfig,ProviderConfig} from '../src/control/config.js';
import {PtyRegistry} from '../src/control/pty.js';
import {startWebDashboard} from '../src/control/web-server.js';
import {projectFactory} from '../src/control/factory-view.js';

const root=process.cwd(),out=path.resolve(process.env.FACTORY_EVIDENCE_DIR??'../factory-view-evidence'),stateDir=path.join(out,'runtime');
fs.mkdirSync(stateDir,{recursive:true,mode:0o700});
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const write=(name:string,value:unknown)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
const clock=()=>new Date().toISOString();
const start=clock(),token=randomBytes(32).toString('hex');
const files=['docs/factory-view-architecture.md','src/control/factory-view.ts','assets/dashboard/factory-client.js','assets/dashboard/factory-renderer.js'];
const inspections=files.map(file=>({file,sha256:sha(fs.readFileSync(path.join(root,file))),bytes:fs.statSync(path.join(root,file)).size}));
const endpoints=(process.env.FACTORY_MODEL_ENDPOINTS??'http://127.0.0.1:8080/v1,http://127.0.0.1:8081/v1').split(',');
const modelInfo=await Promise.all(endpoints.map(async(baseUrl,index)=>{const u=new URL(baseUrl);if(!['127.0.0.1','localhost'].includes(u.hostname))throw Error('factory_qualification_requires_loopback');const response=await fetch(baseUrl+'/models',{signal:AbortSignal.timeout(5000)});assert.equal(response.status,200);const body=await response.json() as {data:Array<{id:string}>};assert.ok(body.data[0]?.id);return{baseUrl,id:body.data[0].id,providerId:`local-audit-${index+1}`,workerId:`audit-worker-${index+1}`,inventorySha256:sha(JSON.stringify(body))};}));
const providers:ProviderConfig[]=modelInfo.map(m=>({id:m.providerId,name:`Local audit route ${m.providerId}`,kind:'openai-compatible',enabled:true,baseUrl:m.baseUrl,wireApi:'chat-completions',requiresAuth:false,parallelism:1,costClass:'free',capabilities:['structured-output','tool-request']}));
const models:ModelConfig[]=modelInfo.map(m=>({id:m.id,provider:m.providerId,providerModel:m.id,displayName:m.id,enabled:true,capabilities:['structured-output','tool-request'],nodes:[m.workerId],qualification:{state:'UNTESTED',evidence:[`live-inventory:${m.inventorySha256}`]}}));
const modelRegistry=new ModelRegistry(providers,models,{roles:{}});
const efficiency=new FileHarnessEfficiencyLedger(path.join(stateDir,'invocations.json'));
const workers=new WorkerRegistry();for(const [i,m] of modelInfo.entries())workers.registerControllerInternal({id:m.workerId,capabilities:[`factory.audit.${i}`],health:'healthy',capacity:1,active:0,observedAt:clock()});
workers.registerControllerInternal({id:'independent-verifier',capabilities:['factory.verify'],health:'healthy',capacity:1,active:0,observedAt:clock()});
const actions=new ActionRegistry(),dispatchStore=new MemoryRecipeDispatchStore(),transportEvidence:unknown[]=[];
const toolPolicy=new ToolPolicy([{id:'factory.inspect-source',risk:'read',capabilities:['source.read']}]);
const toolHandlers=new ToolHandlerRegistry().register('factory.inspect-source',async input=>{
  const file=(input as {file?:string})?.file;if(!file||!files.includes(file))throw Error('source_not_in_read_only_allowlist');const bytes=fs.readFileSync(path.join(root,file));return{file,sha256:sha(bytes),bytes:bytes.length,lines:bytes.toString('utf8').split('\n').length,requestedAudit:(input as Record<string,unknown>).audit??null};
});
for(const [i,m] of modelInfo.entries()){
  const provider=new StructuredChatProviderFactory({provider:{id:m.providerId,name:m.providerId,kind:'local',baseUrl:m.baseUrl,requiresAuth:false,parallelism:1,costClass:'free',capabilities:['structured-output','tool-request']},workerId:m.workerId,modelId:m.id,workerCapabilities:[`factory.audit.${i}`],modelCapabilities:['structured-output','tool-request'],availableToolIds:['factory.inspect-source'],qualificationEvidence:[`isolated-read-only-qualification:inventory-sha256:${m.inventorySha256}`],health:'healthy',timeoutMs:60000,fetch:async(url,options)=>{const t=performance.now(),response=await fetch(url,options),body=await response.clone().json() as Record<string,unknown>;transportEvidence.push({provider:m.providerId,model:m.id,status:response.status,at:clock(),elapsedMs:performance.now()-t,usage:body.usage??null,timings:body.timings??null,responseSha256:sha(JSON.stringify(body))});return response;}});
  actions.registerAgent(`factory.audit-${i}@1.0.0`,{path:'adaptive-harness',execute:async context=>{
    if(!context.execution)throw Error('native_execution_authority_required');
    const dispatcher=new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(),toolPolicy),toolPolicy,toolHandlers,()=>{context.execution!.assertActive();return{authority:context.execution!.currentAuthority(),workerId:context.worker.id,availableToolIds:['factory.inspect-source'],approvedRisks:['read']};},dispatchStore,()=>{},clock,efficiency);
    const file=String(context.parameters.file);assert.ok(files.includes(file));const content=fs.readFileSync(path.join(root,file),'utf8');
    const instruction=`Audit an actual Agent Control source file. This is a read-only repository audit, not a claim of model qualification. Call factory.inspect-source with the exact file ${JSON.stringify(file)} and an audit field containing four concrete questions about whether this implementation preserves runtime truth, bounded buffering, verification and unknown telemetry. Ground the questions in this supplied source excerpt. Do not claim tests passed. Source:\n${content.slice(0,6500)}`;
    return new HarnessJobAgentAction(dispatcher,()=>({plan:{request:{taskId:context.run.id,taskType:'read-only-source-audit',requiredCapabilities:['structured-output','tool-request'],requiredTools:['factory.inspect-source'],approvedRisks:['read'],intent:'ECONOMY',inputTokens:2000,outputTokens:256,maximumLatencyMs:60000,context:{tier:1,sourceIds:[file],evidenceIds:[],estimatedTokens:2000},authority:context.execution!.currentAuthority(),verification:{requiredEvidence:['source-hash-verified'],requireIndependentCheck:true},escalation:{minimumConfidence:.7,maximumAttempts:1,onFailure:'review'}},candidates:[provider.candidate()],placement:{workerId:context.worker.id,reason:'Capability-selected local worker; bounded repository audit qualification'}},executor:provider.executor(instruction),toActionOutput:result=>({artifacts:[{name:'source-audit',value:JSON.parse(result.execution.resultRef??'{}')}],evidence:result.execution.evidence,detail:'Actual source inspected through governed tool gateway; independent hash verification pending'})})).execute(context);
  }});
}
actions.registerReadOnly('factory.verify@1.0.0',async context=>{
  const artifact=context.inputArtifacts.find(a=>a.name==='source-audit');assert.ok(artifact);const result=context.readArtifact(artifact.id) as {toolOutput:{file:string;sha256:string;bytes:number};responseHash:string;requestedTool:string};
  const observed=result.toolOutput,file=String(context.parameters.file);assert.ok(files.includes(file));const bytes=fs.readFileSync(path.join(root,file));const passed=observed.file===file&&observed.sha256===sha(bytes)&&observed.bytes===bytes.length&&result.requestedTool==='factory.inspect-source'&&/^[a-f0-9]{64}$/.test(result.responseHash);
  const report={passed,file,sourceSha256:sha(bytes),modelResponseSha256:result.responseHash,artifactId:artifact.id,artifactSha256:artifact.sha256,verification:'Independent source bytes and allowlisted tool receipt; model audit questions are advisory'};
  const proof=context.recordEvidence?.('source-independent-verification',report);assert.ok(context.recordIndependentVerification);context.recordIndependentVerification('audit',passed,proof?[proof.id]:[],'Independent reread and SHA-256 comparison');efficiency.markVerification(efficiency.list().filter(r=>r.runId===context.run.id).map(r=>r.id),passed?'PASS':'FAIL');assert.ok(passed,'source verification failed');return{artifacts:[{name:'verification-report',value:report}],verification:['source-hash-verified'],evidence:proof?[proof.id]:[],detail:'Independent source verification passed'};
});
const catalog=new JobCatalog(actions.ids());for(const [i] of modelInfo.entries())catalog.addJob({apiVersion:'agent-control/v1',kind:'Job',metadata:{id:`factory-source-audit-${i}`,name:i===0?'Architecture & event audit':'Renderer & transport audit',version:'1.0.0'},spec:{priority:'normal',concurrency:'allow',parameters:{file:{type:'string',required:true}},steps:[{id:'audit',name:'Model source audit',action:`factory.audit-${i}@1.0.0`,requires:[`factory.audit.${i}`],timeoutSeconds:75,outputs:[{name:'source-audit',type:'application/json',schema:'factory.source-audit/v1',version:'1'}]},{id:'verify',name:'Independent source verification',action:'factory.verify@1.0.0',requires:['factory.verify'],dependsOn:['audit'],inputs:{candidate:'audit.source-audit'},outputs:[{name:'verification-report',type:'application/json',schema:'factory.source-verification/v1',version:'1'}],verification:['source-hash-verified']}]}});
const ledger=new RunLedger(path.join(stateDir,'runs.json')),artifacts=new ArtifactStore(path.join(stateDir,'artifacts'));
const runtime=new JobRuntime(catalog,actions,workers,ledger,artifacts,new ResourceLockManager(path.join(stateDir,'locks.json')),{efficiency});
const plan:WorkParcelPlan={objective:'Audit Factory View architecture and source, retaining real local-model requests, tool receipts, handoffs and independent hash verification',planner:{kind:'deterministic',reason:'Read-only, user-authorised Factory View qualification workload'},stages:files.map((file,i)=>({id:`stage-${i}`,name:`Inspect ${file}`,job:`factory-source-audit-${i%modelInfo.length}@1.0.0`,parameters:{file},...(i>=2?{dependsOn:[`stage-${i-2}`]}:{})}))};
const parcels=new WorkParcelCoordinator(runtime,new WorkParcelStore(path.join(stateDir,'parcels.json')),{plan:()=>plan},efficiency);
const boards=new WorkBoardRuntime(path.join(stateDir,'boards.json'));let board=boards.create({title:'Factory source audit',workspace:'factory-qualification',project:'agent-control',actor:'qualification',lanes:[{id:'architecture',label:'ARCHITECTURE',parallelism:1},{id:'implementation',label:'IMPLEMENTATION',parallelism:1}]});
const planned=new Map<string,string>();for(const [i,stage] of plan.stages.entries()){board=boards.apply(board.id,board.version,{type:'CREATE_ITEM',input:{title:stage.name,sourceInstruction:plan.objective,creator:'qualification',laneId:i%2?'implementation':'architecture'}},'qualification');planned.set(stage.id,board.items.at(-1)!.id);}
const service=new AgentControlService({version:1,paused:false,lastRestorePoint:null,lanes:[]},new PtyRegistry(),undefined,'4.12.1-factory-candidate').configureProjection({jobRuntime:runtime,harnessEfficiency:efficiency,workParcels:parcels,modelRegistry,workBoards:boards});
parcels.store.subscribe(parcel=>{for(const stage of parcel.stages){if(!stage.runId)continue;board=boards.get(board.id);const item=board.items.find(item=>item.id===planned.get(stage.id))!;if(!item.runs.length){const r=ledger.get(stage.runId)!;board=boards.linkRun(board.id,board.version,item.id,{runId:r.id,attempt:1,state:r.status,startedAt:r.startedAt??r.requestedAt,evidence:[]});}if(['SUCCEEDED','FAILED'].includes(stage.status)&&item.state!==(stage.status==='SUCCEEDED'?'COMPLETED':'FAILED'))board=boards.completeRun(board.id,board.version,item.id,{runId:stage.runId,state:stage.status==='SUCCEEDED'?'COMPLETED':'FAILED',evidence:ledger.get(stage.runId)!.artifacts});}});
const server=startWebDashboard(service,{port:0,operatorToken:token,workBoards:boards});await once(server,'listening');const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const browser=await chromium.launch({headless:true,downloadsPath:path.join(out,'downloads'),executablePath:process.env.AGENT_CONTROL_CHROMIUM??'/snap/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1680,height:1120},colorScheme:'dark',acceptDownloads:true});
await context.addInitScript(t=>sessionStorage.setItem('agent-control-operator-token',t),token);
const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
const screenshot=async(name:string)=>{await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(out,name),fullPage:true});};
const headers={Authorization:`Bearer ${token}`};
let complete=false;
try{
  await page.goto(base,{waitUntil:'domcontentloaded'});
  if(!await page.locator('[data-view="factory"]').isVisible())await page.locator('#mobile-navigation').click();
  await page.locator('[data-view="factory"]').click();await page.waitForFunction(()=>((window as any).AgentControlFactory?.state().transport)==='CONNECTED',{},{timeout:30000});
  assert.equal(await page.evaluate(()=>(window as any).AgentControlFactory.statistics().renderer),'WebGL','This qualification requires actual WebGL rendering');
  await page.locator('#factory-video').check();await screenshot('factory-before.png');
  const liveScreenshot=page.locator('.factory-entity .factory-state').filter({hasText:/^(RUNNING|VERIFYING)$/}).first().waitFor({state:'visible',timeout:60000}).then(()=>screenshot('factory-live.png')).catch(()=>{});
  const submitted=await parcels.submit(plan.objective,'factory-qualification');write('workload-input.json',{objective:plan.objective,sources:inspections,modelInfo:modelInfo.map(({baseUrl:_,...m})=>m),plan,parcelId:submitted.id});
  const deadline=Date.now()+180000;let tickCount=0,captured=false;
  while(Date.now()<deadline){await parcels.tick();await runtime.tick();await parcels.tick();const parcel=parcels.get(submitted.id);tickCount++;
    if(!captured&&efficiency.list().some(r=>r.state==='RUNNING')){await page.waitForTimeout(900);await page.screenshot({path:path.join(out,'factory-live.png'),fullPage:true});captured=true;}
    if(['SUCCEEDED','FAILED','CANCELLED'].includes(parcel.status)){complete=true;break;}await page.waitForTimeout(100);
  }
  assert.ok(complete,'Workload exceeded deadline');await page.waitForTimeout(1800);const result=parcels.get(submitted.id);write('execution-result.json',{startedAt:start,completedAt:clock(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,parcel:result,runs:ledger.list(),recipes:dispatchStore.list(),invocations:efficiency.list(),transport:transportEvidence,artifacts:artifacts.list().map(({storageRef:_,...a})=>a),tickCount});
  await liveScreenshot;await page.locator('#factory-camera').selectOption('OVERVIEW');await screenshot('factory-complete.png');
  if(await page.locator('#factory-stop-video').isEnabled())await page.locator('#factory-stop-video').click();
  await page.waitForFunction(()=>Boolean((window as any).AgentControlFactory.state().capture),{},{timeout:10000});
  // Snap Chromium downloads use a private filesystem namespace. Read the exact
  // completed browser Blob over CDP; never rerender or reconstruct the recording.
  for(const [kind,name] of [['video','factory-execution.webm'],['replay','factory-execution-replay.json']]){const bytes=await page.evaluate(async kind=>(window as any).AgentControlFactory.captureBytes(kind),kind);fs.writeFileSync(path.join(out,name),Buffer.from(bytes));}
  write('factory-replay.json',await page.evaluate(()=>(window as any).AgentControlFactory.replay()));
  // Exercise real inspectors and UI controls against the captured run.
  await page.locator('.factory-entity[data-entity-id^="job:"]').first().click();await page.screenshot({path:path.join(out,'factory-job-detail.png'),fullPage:true});
  await page.getByRole('button',{name:'Open real run detail',exact:true}).click();await page.locator('#observability-dialog').waitFor({state:'visible'});await page.locator('#observability-dialog [data-close]').click();
  await page.locator('.factory-entity[data-entity-id^="evidence:"]').first().click();await page.getByRole('button',{name:'Open protected evidence',exact:true}).click();await page.locator('#artifact-content-dialog').waitFor({state:'visible'});await page.locator('#artifact-content-dialog [data-close-artifact]').click();
  for(const mode of ['FOLLOW JOB','FOLLOW WORKER','LANE','EVIDENCE','MANUAL','OVERVIEW']){await page.locator('#factory-camera').selectOption(mode);await page.waitForTimeout(60);}
  await page.locator('#factory-provider').selectOption(modelInfo[0].providerId);await page.locator('#factory-model').selectOption(modelInfo[0].id);assert.equal(await page.locator('.factory-entity[data-entity-id^="model:"]').count(),1);await page.locator('#factory-provider').selectOption('');await page.locator('#factory-model').selectOption('');
  await page.locator('#factory-pause').click();const paused=await page.evaluate(()=>(window as any).AgentControlFactory.state().frameId);await page.waitForTimeout(1000);assert.equal(await page.evaluate(()=>(window as any).AgentControlFactory.state().frameId),paused);
  await page.locator('#factory-replay').fill('0');await page.locator('#factory-replay').dispatchEvent('input');await page.screenshot({path:path.join(out,'factory-replay.png'),fullPage:true});
  await page.locator('#factory-2d').check();await page.waitForTimeout(300);await page.screenshot({path:path.join(out,'factory-2d.png'),fullPage:true});
  await page.emulateMedia({colorScheme:'light'});await screenshot('factory-light-theme.png');await page.emulateMedia({colorScheme:'dark'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'factory-mobile.png'),fullPage:true});await page.setViewportSize({width:1680,height:1120});
  await page.locator('#factory-off').click();assert.equal(await page.locator('#factory-stage canvas').count(),0);await page.locator('#factory-on').click();await page.waitForTimeout(500);
  write('browser-results.json',{errors,renderer:await page.evaluate(()=>(window as any).AgentControlFactory.statistics()),ui:['authenticated SSE','3D','real run inspector','protected evidence inspector','six camera modes','model/provider filters','pause freezes displayed frame','recorded replay','2D fallback','mobile','Factory off disposes canvas','video capture'],state:await page.evaluate(()=>(window as any).AgentControlFactory.state())});
  // Paired controller HTTP measurements; workload completed, identical retained state.
  await page.locator('#factory-2d').uncheck();await page.locator('#factory-live').click();
  const perf:Record<string,unknown>={scope:'Paired 3-second retained-state controller read workloads; software WebGL client on same host. Excludes browser CPU from process.cpuUsage; does not prove model throughput neutrality.',on:[],off:[]};
  for(const enabled of [false,true,false,true]){await page.locator(enabled?'#factory-on':'#factory-off').click();if(enabled){await page.locator('#factory-live').click();await page.waitForFunction(()=>(window as any).AgentControlFactory.state().transport==='CONNECTED');}await page.waitForTimeout(300);const durations:number[]=[];const cpu=process.cpuUsage(),t=performance.now();while(performance.now()-t<3000){const start=performance.now();const response=await fetch(base+'/api/runs',{headers});assert.equal(response.status,200);await response.text();durations.push(performance.now()-start);await new Promise(r=>setTimeout(r,25));}const totalMs=performance.now()-t,used=process.cpuUsage(cpu);(perf[enabled?'on':'off'] as unknown[]).push({samples:durations.length,status:'HTTP 200',totalMs,meanMs:durations.reduce((a,b)=>a+b,0)/durations.length,p95Ms:[...durations].sort((a,b)=>a-b)[Math.floor(durations.length*.95)],cpuMs:(used.user+used.system)/1000,renderer:enabled?await page.evaluate(()=>(window as any).AgentControlFactory.statistics()):null});}
  const sample=()=>projectFactory({...service.factorySource(),boards:boards.list(),kills:[]});const timings=[];for(let i=0;i<100;i++){const t=performance.now();sample();timings.push(performance.now()-t);}write('performance.json',{...perf,projection:{samples:timings.length,meanMs:timings.reduce((a,b)=>a+b,0)/timings.length,p95Ms:[...timings].sort((a,b)=>a-b)[94]},modelThroughputComparison:'NOT MEASURED: provider cache/order and shared host are uncontrolled'});
  // Server-off must stop before loading graphics, including on first activation.
  const disabled=startWebDashboard(service,{port:0,operatorToken:token,workBoards:boards,factoryEnabled:false});await once(disabled,'listening');
  const disabledPage=await context.newPage(),disabledRequests:string[]=[];disabledPage.on('request',r=>disabledRequests.push(r.url()));
  try{await disabledPage.goto(`http://127.0.0.1:${(disabled.address() as AddressInfo).port}`,{waitUntil:'domcontentloaded'});await disabledPage.locator('[data-view="factory"]').click();await disabledPage.waitForFunction(()=>(window as any).AgentControlFactory.state().transport==='DISABLED');assert.equal(disabledRequests.some(url=>/factory-renderer|vendor\/three/.test(url)),false);assert.equal(await disabledPage.locator('#factory-stage canvas').count(),0);}finally{await disabledPage.close();disabled.closeAllConnections();await new Promise<void>(resolve=>disabled.close(()=>resolve()));}
  assert.equal(errors.length,0,'Browser page errors');
  // A genuine provider/tool failure is a workload result, not permission to
  // relabel it or run repeatedly until green. Visual assertions remain strict.
  const qualification={outcome:'VISUAL_CHECKS_PASSED',workloadStatus:result.status,sourceTreeClean:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()==='',parcelId:result.id,runs:ledger.list().length,successfulRuns:ledger.list().filter(r=>r.status==='SUCCEEDED').length,failedRuns:ledger.list().filter(r=>r.status==='FAILED').length,invocations:efficiency.list().length,artifacts:artifacts.list().length,serverDisabledLoadsGraphics:false,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()};write('qualification.json',qualification);console.log(JSON.stringify(qualification));
}catch(error){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});write('failure.json',{error:String(error),pageErrors:errors});throw error;}finally{await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}

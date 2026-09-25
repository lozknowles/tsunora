import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const providerId = 'nvidia-hosted';
const stateDir = path.resolve(requiredEnvironment('AGENT_CONTROL_NVIDIA_TOURNAMENT_STATE_DIR'));
const sourceConfigFile = path.resolve(process.env.AGENT_CONTROL_NVIDIA_TOURNAMENT_CONFIG ?? 'config/agent-control.example.json');
const outputDirectory = path.resolve(process.env.AGENT_CONTROL_NVIDIA_TOURNAMENT_OUTPUT_DIR ?? 'docs/evidence');
const stem = 'agent-control-3.9-nvidia-shortlist-tournament-20260906-v1';
const evidenceFile = path.join(outputDirectory, `${stem}.json`);
const reportFile = path.join(outputDirectory, `${stem}.md`);
const transcriptFile = path.join(outputDirectory, `${stem}-transcript.md`);
const videoFile = path.join(outputDirectory, `${stem}.mp4`);
const manifestFile = path.join(outputDirectory, `${stem}-video.json`);
const screenshotDirectory = path.join(outputDirectory, stem);
const rawVideoDirectory = path.join(stateDir, 'tournament-video-raw');
const chromiumExecutable = process.env.AGENT_CONTROL_CHROMIUM ?? '/snap/bin/chromium';
const ffmpeg = process.env.AGENT_CONTROL_FFMPEG ?? 'ffmpeg';
const ffprobe = process.env.AGENT_CONTROL_FFPROBE ?? 'ffprobe';
const displayHoldMs = positiveInteger(process.env.AGENT_CONTROL_TOURNAMENT_DISPLAY_HOLD_MS, 900);
const benchmarkTimeoutMs = positiveInteger(process.env.AGENT_CONTROL_TOURNAMENT_BENCHMARK_TIMEOUT_MS, 20 * 60_000);
const operatorToken = randomBytes(32).toString('hex');
const startedAt = new Date().toISOString();
const wallStarted = Date.now();
const expectedWoprCheckpoint = requiredEnvironment('AGENT_CONTROL_EXPECTED_WOPR_CHECKPOINT');
assertGitAncestor(expectedWoprCheckpoint, 'latest_wopr_checkpoint_missing');
const shortlist = [
  {priority: 1, label: 'Nemotron Super 120B', expectedCanonicalId: 'nvidia/nemotron-3-super-120b-a12b', roleHints: ['GENERAL_AGENT','CODING','REASONING','ESCALATION']},
  {priority: 2, label: 'Muse Glimmer 30B', expectedCanonicalId: 'meta/muse-glimmer-30b', roleHints: ['FAST_CHEAP_WORKER','CODING','TOOL_USE']},
  {priority: 3, label: 'Kimi K3', expectedCanonicalId: 'moonshotai/kimi-k3', roleHints: ['GENERAL_AGENT','CODING']},
  {priority: 4, label: 'Nemotron 3.5 Lightning 30B', expectedCanonicalId: 'nvidia/nemotron-3.5-lightning-30b-a3b', roleHints: ['FAST_CHEAP_WORKER','CODING']},
  {priority: 5, label: 'Nemotron 3 Ultra 550B', expectedCanonicalId: 'nvidia/nemotron-3-ultra-550b-a55b', roleHints: ['REASONING','ESCALATION']},
  {priority: 6, label: 'Mistral-Nemotron', expectedCanonicalId: 'mistralai/mistral-nemotron', roleHints: ['GENERAL_AGENT','TOOL_USE']},
  {priority: 7, label: 'DeepSeek V4 Flash', expectedCanonicalId: 'deepseek-ai/deepseek-v4-flash-0731', roleHints: ['FAST_CHEAP_WORKER','CODING']},
  {priority: 8, label: 'GPT-OSS 20B', expectedCanonicalId: 'openai/gpt-oss-20b', roleHints: ['FAST_CHEAP_WORKER','CODING']},
];
const heldModels = [
  {label:'MiniMax M3',canonicalModelId:'minimaxai/minimax-m3',state:'DIAGNOSTIC_HOLD',requests:0,reason:'Two preserved timeout-before-first-token observations; no retry authorized.'},
  {label:'Kimi K2.6',canonicalModelId:'moonshotai/kimi-k2.6',state:'NOT_AVAILABLE',requests:0,reason:'Preserved HTTP 404 evidence remains authoritative; no new evidence authorized a retry.'},
];
const immutableEvidence = [
  'docs/evidence/agent-control-3.9-nvidia-hosted-qualification-20260906.md',
  'docs/evidence/agent-control-3.9-nvidia-focused-diagnostics-20260906.md',
].map(file => ({file, sha256: sha256(fs.readFileSync(path.join(root, file)))}));

const plannedOutputs=[evidenceFile,reportFile,transcriptFile,videoFile,manifestFile,screenshotDirectory,rawVideoDirectory];
const existingOutputs=plannedOutputs.filter(file=>fs.existsSync(file));
if(existingOutputs.length)throw new Error(`tournament_evidence_already_exists:${existingOutputs.map(file=>path.relative(root,file)).join(',')}`);
for (const directory of [outputDirectory,screenshotDirectory,rawVideoDirectory]) fs.mkdirSync(directory,{recursive:true,mode:0o700});
if (fs.existsSync(path.join(stateDir,'models','provider-catalog.json')) || fs.existsSync(path.join(stateDir,'models','intelligence.json'))) throw new Error('tournament_state_not_pristine');

const sourceConfig = JSON.parse(fs.readFileSync(sourceConfigFile,'utf8'));
const nvidiaProvider = sourceConfig.providers?.find(provider => provider.id === providerId);
if (!nvidiaProvider || nvidiaProvider.auth?.type !== 'provider-secure-store') throw new Error('nvidia_provider_secure_reference_missing');
const qualificationConfig = {
  ...sourceConfig,
  spark:{...sourceConfig.spark,enabled:false},
  retrieval:{...sourceConfig.retrieval,enabled:false},
  resources:[],services:[],models:[],modelRouting:{roles:{}},
  lanes:[{id:1,name:'NVIDIA Tournament',cwd:root,priority:1,mode:'manual'}],
  providers:[nvidiaProvider],
};
const qualificationConfigFile = path.join(stateDir,'nvidia-tournament-config.json');
fs.writeFileSync(qualificationConfigFile,`${JSON.stringify(qualificationConfig,null,2)}\n`,{mode:0o600});

const port = await availablePort();
const baseUrl = `http://127.0.0.1:${port}`;
const childEnvironment = {...process.env,AGENT_CONTROL_STATE_DIR:stateDir,AGENT_CONTROL_CONFIG:qualificationConfigFile,AGENT_CONTROL_WEB_HOST:'127.0.0.1',AGENT_CONTROL_WEB_PORT:String(port),AGENT_CONTROL_WEB_OPERATOR_TOKEN:operatorToken};
delete childEnvironment.NVIDIA_API_KEY;
const web = spawn(process.execPath,['--import','tsx','src/web.ts'],{cwd:root,env:childEnvironment,stdio:['ignore','pipe','pipe']});
let serverOutput = '', serverError = '', serverExited = false;
web.stdout.setEncoding('utf8'); web.stderr.setEncoding('utf8');
web.stdout.on('data',chunk=>{serverOutput=sanitize(`${serverOutput}${chunk}`).slice(-4_000)});
web.stderr.on('data',chunk=>{serverError=sanitize(`${serverError}${chunk}`).slice(-8_000)});
const serverExit = new Promise(resolve=>web.once('exit',(code,signal)=>{serverExited=true;resolve({code,signal})}));

let browser, context, page, video;
const screenshots = [], journey = [], consoleErrors = [], httpErrors = [];
const callabilityResults = [], capabilityResults = [], benchmarkFinalists = [];

try {
  await waitForServer(baseUrl,30_000);
  const {chromium} = require('playwright-core');
  browser = await chromium.launch({headless:true,executablePath:chromiumExecutable,args:['--no-sandbox','--disable-dev-shm-usage']});
  const browserVersion = browser.version();
  context = await browser.newContext({viewport:{width:1920,height:1080},recordVideo:{dir:rawVideoDirectory,size:{width:1920,height:1080}},colorScheme:'dark'});
  page = await context.newPage(); video = page.video();
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(sanitize(`${message.location().url||'inline'}: ${message.text()}`).slice(0,500))});
  page.on('pageerror',error=>consoleErrors.push(sanitize(error.message).slice(0,500)));
  page.on('response',response=>{if(response.status()>=400&&!response.url().includes('/favicon'))httpErrors.push({status:response.status(),method:response.request().method(),path:new URL(response.url()).pathname})});
  await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#stream-state')?.textContent==='LIVE',undefined,{timeout:10_000});
  await page.evaluate(() => {
    window.__nvidiaTournamentEvents=[];
    window.__nvidiaTournamentStream=new EventSource('/api/events');
    for(const type of ['provider.catalog_changed','model.intelligence_changed','failure'])window.__nvidiaTournamentStream.addEventListener(type,event=>{try{window.__nvidiaTournamentEvents.push({type,...JSON.parse(event.data),receivedAt:new Date().toISOString()})}catch{}});
  });
  await page.waitForFunction(()=>window.__nvidiaTournamentStream?.readyState===EventSource.OPEN,undefined,{timeout:10_000});
  await authenticate(page,operatorToken);
  const initialStatus=await api('/api/status');
  assert.equal(initialStatus.characterCrew?.schema,'agent-control.dashboard-character-crew/v2','latest Crew projection required');
  assert.equal(initialStatus.characterCrew?.members?.length,6,'all six Crew members required');
  for(const asset of ['/dashboard-bots.js','/dashboard-wopr.js'])assert.equal((await fetch(`${baseUrl}${asset}`)).status,200,`${asset} required`);
  const initialCatalog=await api('/api/provider-catalog');
  assert.equal(initialCatalog.providers[0]?.credentialStatus,'CONFIGURED','generic secure-store credential must be configured');
  assert.equal(initialCatalog.providers[0]?.routingEligibleModels,0);

  await openView(page,'crew');
  await page.waitForFunction(()=>document.querySelectorAll('#crew-live-grid .bot-card').length===6);
  const idleAnimation=await sampleCrewAnimation(page,1_500);
  assert.ok(idleAnimation.every(item=>item.visible&&item.runningAnimations>0&&item.timelineDeltaMs>1_000),'all Crew members must be visibly animated');
  screenshots.push(await screenshot(page,'01-latest-wopr-crew-idle.png'));
  journey.push({at:new Date().toISOString(),view:'crew',outcome:'Latest WOPR and all six real Crew characters visible; idle characters use looking/sleeping dispositions.'});

  await openView(page,'models');
  const discoveryPromise=api(`/api/provider-catalog/providers/${providerId}/discover`,{});
  await delay(Math.min(displayHoldMs,500));
  await openView(page,'crew');
  const discovery=await discoveryPromise;
  await delay(displayHoldMs);
  await openView(page,'models');
  await page.waitForFunction(()=>/SUCCEEDED/.test(document.querySelector('#provider-catalog')?.textContent||''),undefined,{timeout:10_000});
  screenshots.push(await screenshot(page,'02-live-nvidia-discovery.png'));
  journey.push({at:new Date().toISOString(),view:'models',outcome:`Authenticated live discovery returned ${discovery.discovered} canonical model IDs; routing remained disabled.`});

  let catalog=await api('/api/provider-catalog');
  const discoveredById=new Map(catalog.models.filter(model=>model.providerId===providerId&&model.available!==false).map(model=>[model.canonicalModelId,model]));
  const candidates=shortlist.map(spec=>({...spec,canonicalModelId:discoveredById.has(spec.expectedCanonicalId)?spec.expectedCanonicalId:null,registryModelId:discoveredById.get(spec.expectedCanonicalId)?.registryModelId??null,discoveryState:discoveredById.has(spec.expectedCanonicalId)?'DISCOVERED':'NOT_IN_LIVE_CATALOGUE'}));

  const adjudicationInputs=[
    {canonicalModelId:'nvidia/nemotron-3-super-120b-a12b',evidenceKind:'CAPABILITY_SMOKE',evidenceReference:'smoke-v2:3c9eb89c175ff2685b12f86e1f9a938bbd7d995c1d979228145d618b09b2897e',attribution:'HARNESS_FAILURE',scoreDisposition:'EXCLUDE',reason:'The v2 prompt hid the expected marker from the model; this did not demonstrate a model-quality failure.',supersededBy:'smoke-v3:42aa9588a5ae4cde9f987c4a609ce81bc925d2f9e44a1514e38786829548ab68',supportingEvidence:['docs/evidence/agent-control-3.9-nvidia-focused-diagnostics-20260906.md']},
    {canonicalModelId:'meta/muse-glimmer-30b',evidenceKind:'CAPABILITY_SMOKE',evidenceReference:'smoke-v2:3c9eb89c175ff2685b12f86e1f9a938bbd7d995c1d979228145d618b09b2897e',attribution:'HARNESS_FAILURE',scoreDisposition:'EXCLUDE',reason:'The v2 output caps caused provider-reported length truncation; this did not demonstrate a model-quality failure.',supersededBy:'smoke-v3:42aa9588a5ae4cde9f987c4a609ce81bc925d2f9e44a1514e38786829548ab68',supportingEvidence:['docs/evidence/agent-control-3.9-nvidia-focused-diagnostics-20260906.md']},
  ];
  const adjudications=[];
  for(const input of adjudicationInputs){
    if(!discoveredById.has(input.canonicalModelId))continue;
    adjudications.push(await api(`/api/provider-catalog/providers/${providerId}/models/${encodeURIComponent(input.canonicalModelId)}/adjudications`,input));
  }
  await delay(displayHoldMs); await openView(page,'models');
  await scrollSelector(page,'#provider-evidence-adjudications');
  screenshots.push(await screenshot(page,'03-append-only-harness-attribution.png'));
  journey.push({at:new Date().toISOString(),view:'models',outcome:'Historical Nemotron/Muse results visibly classified as HARNESS_FAILURE/EXCLUDE without rewriting source evidence.'});

  for(const candidate of candidates){
    if(!candidate.canonicalModelId){callabilityResults.push({...candidate,status:'NOT_AVAILABLE',attribution:'ENDPOINT_UNAVAILABLE',providerRequests:0,reason:'Canonical ID absent from the authoritative live catalogue.'});continue}
    await showModel(page,candidate.canonicalModelId);
    const action=api(`/api/provider-catalog/providers/${providerId}/models/${encodeURIComponent(candidate.canonicalModelId)}/callability`,{});
    await delay(Math.min(displayHoldMs,350));
    const result=await action.catch(error=>({status:'FAIL',inferenceEndpointStatus:'INDETERMINATE',failure:sanitize(error.message),failureClass:'PROVIDER_FAILURE',usage:null,elapsedMs:null}));
    callabilityResults.push({...candidate,...result,providerRequests:1});
    await delay(displayHoldMs); await showModel(page,candidate.canonicalModelId);
  }
  screenshots.push(await screenshot(page,'04-eight-model-callability-funnel.png'));
  journey.push({at:new Date().toISOString(),view:'models',outcome:`Callability completed for ${callabilityResults.filter(item=>item.providerRequests===1).length} live shortlist IDs; failed candidates stopped before capability requests.`});

  const callabilitySurvivors=callabilityResults.filter(item=>item.status==='PASS'&&item.inferenceEndpointStatus==='CONFIRMED');
  for(const candidate of callabilitySurvivors){
    await showModel(page,candidate.canonicalModelId);
    const action=api(`/api/provider-catalog/providers/${providerId}/models/${encodeURIComponent(candidate.canonicalModelId)}/smoke`,{});
    await delay(Math.min(displayHoldMs,350));
    const result=await action.catch(error=>({status:'FAILED',startedAt:new Date().toISOString(),completedAt:new Date().toISOString(),probes:[],failure:sanitize(error.message)}));
    const directRequests=(result.probes??[]).filter(probe=>probe.evidenceSource!=='CALLABILITY_REUSED').length;
    const requiredPass=['basic-completion','coding','context-reliability'].every(id=>(result.probes??[]).some(probe=>probe.id===id&&probe.status==='PASS'));
    capabilityResults.push({...candidate,...result,requiredPass,providerRequests:directRequests,meanLatencyMs:mean((result.probes??[]).map(probe=>probe.elapsedMs).filter(value=>typeof value==='number'))});
    await delay(displayHoldMs); await showModel(page,candidate.canonicalModelId);
  }
  await openView(page,'crew');
  await scrollSelector(page,'#crew-model-flow');
  const capabilityAnimation=await sampleCrewAnimation(page,1_200);
  screenshots.push(await screenshot(page,'05-real-crew-provider-events.png'));
  journey.push({at:new Date().toISOString(),view:'crew',outcome:'Animated Crew displayed actual provider/model lifecycle events emitted by the tournament.'});

  const eligible=capabilityResults.filter(item=>item.requiredPass).sort((left,right)=>(right.status==='PASS'?1:0)-(left.status==='PASS'?1:0)||left.priority-right.priority);
  const first=eligible[0], fastest=[...eligible].filter(item=>item.meanLatencyMs!==null).sort((left,right)=>left.meanLatencyMs-right.meanLatencyMs||left.priority-right.priority)[0], bestCapabilities=[...eligible].sort((left,right)=>passingProbeCount(right)-passingProbeCount(left)||left.priority-right.priority)[0];
  for(const value of [first,fastest,bestCapabilities,...eligible])if(value&&!benchmarkFinalists.some(item=>item.canonicalModelId===value.canonicalModelId)&&benchmarkFinalists.length<3)benchmarkFinalists.push(value);

  let queuedBatch=null, benchmarkAnimation=[];
  if(benchmarkFinalists.length){
    queuedBatch=await api('/api/model-evaluations',{modelIds:benchmarkFinalists.map(item=>item.registryModelId),reason:'Staged NVIDIA shortlist tournament finalists selected from confirmed callability and bounded capability evidence; routing admission excluded.'});
    await openView(page,'crew');
    await page.waitForFunction(()=>document.querySelector('#crew-live-grid')?.textContent?.includes('Lumen'),undefined,{timeout:10_000});
    await delay(1_000);
    benchmarkAnimation=await sampleCrewAnimation(page,1_200);
    screenshots.push(await screenshot(page,'06-wopr-crew-frozen-benchmark-active.png'));
    journey.push({at:new Date().toISOString(),view:'crew',outcome:`WOPR/Crew showed the real frozen benchmark for ${benchmarkFinalists.length} finalist(s); Lumen was driven by the canonical evaluation ledger.`});
    const terminal=await waitForBatch(queuedBatch.id,benchmarkTimeoutMs);
    assert.ok(['COMPLETED','PARTIAL','BLOCKED','FAILED'].includes(terminal.status));
    await delay(5_500);
    await openView(page,'models');
    await scrollSelector(page,'#provider-tournament-accounting');
    screenshots.push(await screenshot(page,'07-benchmark-efficiency-and-leaders.png'));
    journey.push({at:new Date().toISOString(),view:'models',outcome:`Frozen batch ${queuedBatch.id} reached ${terminal.status}; dashboard reconciled durable request accounting and measured leaders.`});
  }

  catalog=await api('/api/provider-catalog');
  const intelligence=await api('/api/model-intelligence');
  const browserEvents=await page.evaluate(()=>window.__nvidiaTournamentEvents);
  const finalModels=catalog.models.filter(model=>model.providerId===providerId);
  assert.ok(finalModels.every(model=>model.routingEligible===false),'every NVIDIA route must remain disabled');
  assert.equal(catalog.providers.find(provider=>provider.id===providerId)?.routingEligibleModels,0);
  assert.ok(!browserEvents.some(event=>heldModels.some(model=>event.payload?.canonicalModelId===model.canonicalModelId)&&['callability-testing','smoke-testing'].includes(event.payload?.action)),'held models must not be called');
  const requestEvents=browserEvents.filter(event=>event.type==='model.intelligence_changed'&&event.payload?.phase==='REQUEST_STARTED');
  assert.equal(requestEvents.length,catalog.tournament.requestAccounting.benchmarkRequests,'SSE benchmark request boundary must reconcile with durable accounting');
  assert.deepEqual({consoleErrors,httpErrors},{consoleErrors:[],httpErrors:[]},'qualification dashboard must remain free of browser and HTTP errors');

  const benchmarkResults=benchmarkFinalists.map(finalist=>{
    const attempts=intelligence.attempts.filter(attempt=>attempt.candidate.modelId===finalist.registryModelId), route=intelligence.routes.find(item=>item.identity.modelId===finalist.registryModelId), providerCalls=attempts.filter(attempt=>attempt.invocationIds.length>0||['PROVIDER_FAILURE','ENDPOINT_UNAVAILABLE','INDETERMINATE'].includes(attempt.outcomeAttribution));
    return {label:finalist.label,canonicalModelId:finalist.canonicalModelId,registryModelId:finalist.registryModelId,batchId:queuedBatch?.id??null,batchStatus:intelligence.queue.find(batch=>batch.id===queuedBatch?.id)?.status??null,attemptRecords:attempts.length,providerRequests:providerCalls.length,passed:attempts.filter(attempt=>attempt.status==='PASSED').length,failed:attempts.filter(attempt=>attempt.status==='FAILED').length,unavailable:attempts.filter(attempt=>attempt.status==='UNAVAILABLE'||attempt.status==='BLOCKED').length,attribution:countBy(attempts,'outcomeAttribution'),metrics:route?.current??null,byCategory:route?.byCategory??{},lifecycleState:route?.state??'CANDIDATE'};
  });
  const actualBenchmarkRequests=benchmarkResults.reduce((sum,item)=>sum+item.providerRequests,0);
  assert.equal(actualBenchmarkRequests,catalog.tournament.requestAccounting.benchmarkRequests);
  const benchmarkAvoided=eligible.filter(item=>!benchmarkFinalists.some(finalist=>finalist.canonicalModelId===item.canonicalModelId)).reduce((sum,item)=>sum+plannedBenchmarkRequests(item),0);
  const callabilityRequests=callabilityResults.reduce((sum,item)=>sum+item.providerRequests,0), capabilityRequests=capabilityResults.reduce((sum,item)=>sum+item.providerRequests,0), callabilityAvoided=callabilityResults.filter(item=>item.providerRequests===1&&item.status!=='PASS').length*4, catalogueSweepAvoided=Math.max(0,discovery.discovered*5-(callabilityRequests+capabilityRequests));
  const requestAccounting={...catalog.tournament.requestAccounting,modelsConsidered:candidates.length,benchmarkRequestsAvoidedByFinalistSelection:benchmarkAvoided,catalogueFiveProbeRequestsAvoided:candidateSafeNumber(catalogueSweepAvoided),shortlistCapabilityRequestsAvoidedByEarlyStop:callabilityAvoided,wallClockMs:Date.now()-wallStarted};
  const humanNarrative=catalog.tournament.narrative.filter(item=>candidates.some(candidate=>candidate.canonicalModelId===item.canonicalModelId)).map(item=>({at:item.at,model:item.canonicalModelId,stage:item.stage,text:item.text,evidence:item.evidence}));
  const securityPayload=JSON.stringify({catalog,intelligence,browserEvents,callabilityResults,capabilityResults,benchmarkResults,requestAccounting,humanNarrative});
  assert.equal(/nvapi-[A-Za-z0-9_-]+/.test(securityPayload),false,'credential pattern must not enter safe evidence');
  assert.equal(securityPayload.includes(operatorToken),false,'operator token must not enter safe evidence');
  assert.deepEqual(immutableEvidence.map(item=>sha256(fs.readFileSync(path.join(root,item.file)))),immutableEvidence.map(item=>item.sha256),'historical evidence must remain unchanged');

  await openView(page,'crew'); await page.evaluate(()=>scrollTo(0,0)); await delay(displayHoldMs);
  const finalAnimation=await sampleCrewAnimation(page,1_200);
  screenshots.push(await screenshot(page,'08-final-wopr-crew-routing-disabled.png'));
  journey.push({at:new Date().toISOString(),view:'crew',outcome:'Final WOPR/Crew state retained the real tournament history while all NVIDIA routes remained disabled.'});

  const source={branch:git(['branch','--show-current']),head:git(['rev-parse','HEAD']),version:initialStatus.version,woprCrewSchema:initialStatus.characterCrew.schema,expectedWoprCheckpoint,nvidiaCheckpoint:process.env.AGENT_CONTROL_NVIDIA_CHECKPOINT??null};
  const evidence={schema:'agent-control.nvidia-shortlist-tournament/v1',verdict:'PASS — STAGED TOURNAMENT EXECUTED; ROUTING UNCHANGED',startedAt,completedAt:new Date().toISOString(),source,scope:{providerId,shortlistSize:8,catalogueWideSweep:false,routingAdmission:false,heldModels},discovery:{...discovery,canonicalIdsResolved:candidates.map(candidate=>({label:candidate.label,expectedHint:candidate.expectedCanonicalId,canonicalModelId:candidate.canonicalModelId,state:candidate.discoveryState}))},historicalEvidence:{immutableEvidence,adjudications},callability:callabilityResults,capabilitySmoke:capabilityResults,finalistSelection:{policy:'Up to three adequate survivors: highest-priority full-pass candidate, fastest adequate candidate, then greatest bounded capability coverage; deterministic priority breaks ties.',eligible:eligible.map(item=>item.canonicalModelId),finalists:benchmarkFinalists.map(item=>item.canonicalModelId)},frozenBenchmark:{suiteId:intelligence.queue.find(batch=>batch.id===queuedBatch?.id)?.suiteId??'agent-control-real-work-v1',suiteVersion:intelligence.queue.find(batch=>batch.id===queuedBatch?.id)?.suiteVersion??'1.0.0',suiteSha256:intelligence.queue.find(batch=>batch.id===queuedBatch?.id)?.suiteSha256??null,batchId:queuedBatch?.id??null,results:benchmarkResults},leaderboard:catalog.tournament.leaders,humanNarrative,requestAccounting,routingInvariant:{routingEligibleModels:0,allNvidiaModelsRoutingDisabled:true,checkedModels:finalModels.length},dashboard:{urlPersisted:false,sseBenchmarkRequestEvents:requestEvents.length,crewSchema:initialStatus.characterCrew.schema,crewMembers:initialStatus.characterCrew.members.map(member=>({id:member.id,name:member.name,role:member.role})),idleAnimation,capabilityAnimation,benchmarkAnimation,finalAnimation,journey},security:{credentialResolution:'generic provider-secure-store at provider invocation only',credentialValuePersisted:false,operatorTokenPersisted:false,rawProviderOutputPersisted:false,rawReasoningPersisted:false,authorizationHeadersPersisted:false},events:browserEvents.filter(event=>['provider.catalog_changed','model.intelligence_changed'].includes(event.type))};
  fs.writeFileSync(evidenceFile,`${JSON.stringify(evidence,null,2)}\n`,{mode:0o600});
  fs.writeFileSync(transcriptFile,renderTranscript(evidence),{mode:0o600});
  fs.writeFileSync(reportFile,renderReport(evidence),{mode:0o600});

  await context.close(); context=undefined;
  const rawVideo=await video.path();
  execFileSync(ffmpeg,['-y','-i',rawVideo,'-an','-c:v','libx264','-preset','medium','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',videoFile],{stdio:['ignore','ignore','pipe'],maxBuffer:8*1024*1024});
  const media=JSON.parse(execFileSync(ffprobe,['-v','error','-show_entries','format=duration,size:stream=codec_name,width,height,r_frame_rate','-of','json',videoFile],{encoding:'utf8'}));
  const manifest={schema:'agent-control.nvidia-shortlist-tournament-video/v1',verdict:'PASS',recordedAt:new Date().toISOString(),continuousCapture:true,editedOrSpliced:false,playbackSpeed:1,video:{file:path.basename(videoFile),sha256:sha256(fs.readFileSync(videoFile)),bytes:fs.statSync(videoFile).size,media},evidence:{file:path.basename(evidenceFile),qualificationPayloadSha256BeforeVideoAttachment:sha256(fs.readFileSync(evidenceFile))},report:{file:path.basename(reportFile),sha256:sha256(fs.readFileSync(reportFile))},transcript:{file:path.basename(transcriptFile),sha256:sha256(fs.readFileSync(transcriptFile))},browser:{engine:'Chromium',version:browserVersion,viewport:{width:1920,height:1080}},screenshots,journey,checks:{latestWoprCrewComposition:true,allSixCharactersVisible:true,animationsMeasuredDuringRun:true,realProviderEventsVisible:true,realFrozenBenchmarkVisible:Boolean(queuedBatch),routingDisabledVisible:true,consoleErrors,httpErrors},security:{credentialVisible:false,operatorTokenPersisted:false,providerOutputVisible:false}};
  fs.writeFileSync(manifestFile,`${JSON.stringify(manifest,null,2)}\n`,{mode:0o600});
  evidence.videoEvidence={manifest:path.basename(manifestFile),manifestSha256:sha256(fs.readFileSync(manifestFile)),video:path.basename(videoFile),videoSha256:manifest.video.sha256,durationSeconds:Number(media.format.duration),continuousCapture:true,screenshots:screenshots.length};
  fs.writeFileSync(evidenceFile,`${JSON.stringify(evidence,null,2)}\n`,{mode:0o600});
  assert.equal(/nvapi-[A-Za-z0-9_-]+/.test([evidenceFile,reportFile,transcriptFile,manifestFile].map(file=>fs.readFileSync(file,'utf8')).join('\n')),false);
  process.stdout.write(`${JSON.stringify({verdict:evidence.verdict,evidenceFile,reportFile,transcriptFile,videoFile,manifestFile,videoSha256:manifest.video.sha256,durationSeconds:Number(media.format.duration),requestAccounting,finalists:benchmarkFinalists.map(item=>item.canonicalModelId)})}\n`);
} catch(error){
  if(context)await context.close().catch(()=>{});
  throw new Error(`${sanitize(error instanceof Error?(error.stack??error.message):String(error))}${serverExited?`:server-exited:${serverOutput}:${serverError}`:''}`);
} finally {
  if(browser)await browser.close().catch(()=>{});
  if(!serverExited)web.kill('SIGTERM');
  await Promise.race([serverExit,delay(5_000)]).catch(()=>{});
}

async function api(route,body){const response=await fetch(`${baseUrl}${route}`,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${operatorToken}`},body:JSON.stringify(body)}),text=await response.text();let value;try{value=JSON.parse(text)}catch{value={error:`HTTP_${response.status}`}}if(!response.ok)throw new Error(`${value.error??`HTTP_${response.status}`}`);return value}
async function authenticate(target,token){await target.click('#operator-button');await target.fill('#operator-token',token);await target.click('#operator-form button[type="submit"]');await target.getByRole('button',{name:'Operator authenticated',exact:true}).waitFor({timeout:10_000})}
async function openView(target,name){await target.click(`[data-view="${name}"]`);if(name==='models')await target.waitForSelector('#provider-catalog');if(name==='crew')await target.waitForSelector('#crew-live-grid');await delay(150)}
async function showModel(target,canonicalModelId){await openView(target,'models');const found=await target.evaluate(modelId=>{const row=[...document.querySelectorAll('#provider-catalog tbody tr')].find(candidate=>candidate.textContent?.includes(modelId)),fallback=document.querySelector('#provider-tournament-narrative');(row??fallback)?.scrollIntoView({block:'center'});return Boolean(row)},canonicalModelId);if(!found)await target.waitForSelector('#provider-tournament-narrative');await delay(displayHoldMs)}
async function scrollSelector(target,selector){await target.waitForFunction(value=>Boolean(document.querySelector(value)),selector,{timeout:10_000});await target.evaluate(value=>document.querySelector(value)?.scrollIntoView({block:'center'}),selector);await delay(100)}
async function waitForBatch(id,timeoutMs){const deadline=Date.now()+timeoutMs;while(Date.now()<deadline){const intelligence=await api('/api/model-intelligence'),batch=intelligence.queue.find(item=>item.id===id);if(batch&&['COMPLETED','PARTIAL','BLOCKED','FAILED'].includes(batch.status))return batch;if(serverExited)throw new Error('agent_control_server_exited_during_benchmark');await delay(1_000)}throw new Error(`benchmark_timeout:${id}`)}
async function waitForServer(url,timeoutMs){const deadline=Date.now()+timeoutMs;while(Date.now()<deadline&&!serverExited){try{const response=await fetch(`${url}/api/status`);if(response.ok)return}catch{}await delay(100)}throw new Error(`dashboard_start_failed:${serverOutput}:${serverError}`)}
async function screenshot(target,name){const file=path.join(screenshotDirectory,name),bytes=await target.screenshot({path:file,type:'png'});return{file:path.relative(outputDirectory,file),sha256:sha256(bytes),bytes:bytes.length}}
async function sampleCrewAnimation(target,waitMs){const inspect=()=>target.evaluate(()=>[...document.querySelectorAll('#crew-live-grid .bot-card')].map(card=>{const rect=card.getBoundingClientRect(),animations=card.getAnimations({subtree:true}).filter(animation=>animation.playState==='running'&&getComputedStyle(animation.effect?.target).animationName!=='none');return{id:[...card.classList].find(value=>/^bot-(?:lane|prompt|parcel|model|resource|quality)-/.test(value))??card.getAttribute('aria-label'),state:[...card.classList].find(value=>value.startsWith('bot-state-'))?.slice(10)??'unknown',rest:card.dataset.botRest??'unknown',visible:rect.width>0&&rect.height>0&&rect.top>=0&&rect.left>=0&&rect.right<=innerWidth&&rect.bottom<=innerHeight,runningAnimations:animations.length,timelines:animations.map(animation=>({name:getComputedStyle(animation.effect?.target).animationName,time:Number(animation.currentTime??0)}))}}));const before=await inspect();await delay(waitMs);const after=await inspect();return before.map(item=>{const next=after.find(value=>value.id===item.id),deltas=item.timelines.map(animation=>{const match=next?.timelines.find(value=>value.name===animation.name);return match?match.time-animation.time:0});return{...item,timelineDeltaMs:Math.max(0,...deltas)}})}
function passingProbeCount(item){return(item.probes??[]).filter(probe=>probe.status==='PASS').length}
function plannedBenchmarkRequests(item){const passed=new Set((item.probes??[]).filter(probe=>probe.status==='PASS').map(probe=>probe.id));return(passed.has('coding')?6:0)+(passed.has('structured-json')?3:0)}
function countBy(items,key){return Object.fromEntries([...new Set(items.map(item=>item[key]))].sort().map(value=>[value,items.filter(item=>item[key]===value).length]))}
function mean(values){return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null}
function candidateSafeNumber(value){return Number.isFinite(value)?value:null}
function tableCell(value){return String(value??'UNKNOWN').replaceAll('|','\\|').replaceAll('\n',' ')}
function usageText(usage){return usage&&usage.totalTokens!==null?`${usage.inputTokens??'UNKNOWN'} / ${usage.outputTokens??'UNKNOWN'} / ${usage.totalTokens}`:'UNKNOWN'}
function renderTranscript(evidence){const lines=['# Agent Control 3.9 NVIDIA shortlist tournament — human-readable transcript','',`This transcript is a deterministic projection of authoritative Agent Control events. No model generated it. Provider output, hidden reasoning, credentials and authorization material are excluded.`,``,`- Started: ${evidence.startedAt}` ,`- Completed: ${evidence.completedAt}`,`- Composition HEAD: \`${evidence.source.head}\``,`- Routing admission: not authorized; all NVIDIA routes remained disabled.`,``,`## Event narrative`,``,...evidence.humanNarrative.map(item=>`- ${item.at} — **${item.stage}** — \`${item.model}\`: ${item.text}`),'','## Finalist selection','',evidence.finalistSelection.finalists.length?`Selected: ${evidence.finalistSelection.finalists.map(value=>`\`${value}\``).join(', ')}.`:'No candidate crossed the capability threshold; no benchmark was run.','','## Benchmark outcomes','',...evidence.frozenBenchmark.results.map(item=>`- \`${item.canonicalModelId}\`: ${item.batchStatus}; ${item.passed} passed, ${item.failed} failed, ${item.unavailable} unavailable attempt records; ${item.providerRequests} provider requests; lifecycle ${item.lifecycleState}.`),'','## Request reconciliation','',`Callability ${evidence.requestAccounting.callabilityRequests}; capability ${evidence.requestAccounting.capabilityRequests}; benchmark ${evidence.requestAccounting.benchmarkRequests}; total ${evidence.requestAccounting.totalRequests}.`, `Provider-reported token total: ${evidence.requestAccounting.providerReportedTokens.total??`UNKNOWN (${evidence.requestAccounting.providerReportedTokens.totalKnown} known tokens with ${evidence.requestAccounting.providerReportedTokens.requestsWithCompleteUsage}/${evidence.requestAccounting.providerReportedTokens.requestCoverage} request coverage)`}.`, `Successful ${evidence.requestAccounting.successfulCalls}; failed ${evidence.requestAccounting.failedCalls}; unavailable ${evidence.requestAccounting.unavailableCalls}; timed out ${evidence.requestAccounting.timedOutCalls}.`,'','## Holds','',...evidence.scope.heldModels.map(item=>`- \`${item.canonicalModelId}\`: ${item.state}; zero requests. ${item.reason}`),'','## Final control decision','','No NVIDIA model was admitted to routing. A later, separately authorized operator decision is required.',''];return`${lines.join('\n')}\n`}
function renderReport(evidence){const callRows=evidence.callability.map(item=>`| ${tableCell(item.priority)} | ${tableCell(item.label)} | \`${tableCell(item.canonicalModelId??item.expectedCanonicalId)}\` | ${tableCell(item.status)} | ${tableCell(item.httpAccepted)} | ${tableCell(item.streamStarted)} | ${tableCell(item.ttftMs)} | ${tableCell(item.finishReason)} | ${tableCell(usageText(item.usage))} | ${tableCell(item.elapsedMs)} | ${tableCell(item.failureClass??item.attribution)} |`),capRows=evidence.capabilitySmoke.map(item=>`| ${tableCell(item.label)} | \`${tableCell(item.canonicalModelId)}\` | ${tableCell(item.status)} | ${tableCell((item.probes??[]).find(value=>value.id==='structured-json')?.status)} | ${tableCell((item.probes??[]).find(value=>value.id==='coding')?.status)} | ${tableCell((item.probes??[]).find(value=>value.id==='tool-calling')?.status)} | ${tableCell((item.probes??[]).find(value=>value.id==='context-reliability')?.status)} | ${tableCell(item.providerRequests)} |`),benchRows=evidence.frozenBenchmark.results.map(item=>`| ${tableCell(item.label)} | \`${tableCell(item.canonicalModelId)}\` | ${tableCell(item.batchStatus)} | ${tableCell(item.providerRequests)} | ${tableCell(item.passed)} | ${tableCell(item.failed)} | ${tableCell(item.unavailable)} | ${tableCell(item.metrics?.quality)} | ${tableCell(item.metrics?.reliability)} | ${tableCell(item.metrics?.totalTokens)} | ${tableCell(item.lifecycleState)} |`);const lines=['# Agent Control 3.9 NVIDIA shortlist tournament v1','',`**${evidence.verdict}**`,'',`This was an isolated, real-provider qualification using Agent Control ${evidence.source.version}, the latest WOPR/Crew composition at \`${evidence.source.head}\`, authenticated provider discovery, the production staged catalogue path, the frozen qualification scheduler and a continuous Chromium recording. It did not deploy, release, merge, tag or enable routing.`,'','## A–C. Eight-model tournament, callability and capability','','| Priority | Candidate | Canonical live ID | Callability | HTTP accepted | Stream | TTFT ms | Finish | Input / output / total | Latency ms | Failure taxonomy |','| ---: | --- | --- | --- | --- | --- | ---: | --- | --- | ---: | --- |',...callRows,'','| Candidate | Canonical ID | Smoke | Structured | Coding | Tool | Context | New requests |','| --- | --- | --- | --- | --- | --- | --- | ---: |',...capRows,'','## D. Frozen benchmark finalists/results','',`Suite \`${evidence.frozenBenchmark.suiteId}\` ${evidence.frozenBenchmark.suiteVersion}; SHA-256 \`${evidence.frozenBenchmark.suiteSha256??'UNKNOWN'}\`.`,'','| Candidate | Canonical ID | Batch | Requests | Passed | Failed | Unavailable | Quality | Reliability | Tokens | Lifecycle |','| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',...(benchRows.length?benchRows:['| None | — | NOT_RUN | 0 | 0 | 0 | 0 | UNKNOWN | UNKNOWN | UNKNOWN | — |']),'','## E. Role leaderboard','',...Object.entries(evidence.leaderboard).map(([role,value])=>`- **${role}**: ${Array.isArray(value)?value.map(item=>item.canonicalModelId).join(', ')||'none':value?`\`${value.canonicalModelId}\` — ${value.basis}; cost ${value.costStatus}; routing ${value.routingEligible?'enabled':'disabled'}`:'No measured leader'}.`),'','## F. Harness-invalidated history','','Nemotron Super and Muse Glimmer v2 smoke evidence remains immutable. New adjudications classify both as `HARNESS_FAILURE / EXCLUDE`, identify the v3 superseding contract, and prevent harness defects from entering model quality/reliability aggregates.','','## G. Hosted-versus-local Glimmer','','See the repository follow-up section added after the non-invasive local artefact/configuration inspection. No equivalence is inferred by this runner.','','## H. Human-readable narrative','',`[Deterministic transcript](${path.basename(transcriptFile)}) contains every event-backed statement.`,'','## I–J. Request, token and time accounting','',`- Models considered: ${evidence.requestAccounting.modelsConsidered}` ,`- Callability requests: ${evidence.requestAccounting.callabilityRequests}`,`- Capability requests: ${evidence.requestAccounting.capabilityRequests}`,`- Benchmark requests: ${evidence.requestAccounting.benchmarkRequests}`,`- Total governed requests: ${evidence.requestAccounting.totalRequests}`,`- Successful / failed / unavailable / timed out: ${evidence.requestAccounting.successfulCalls} / ${evidence.requestAccounting.failedCalls} / ${evidence.requestAccounting.unavailableCalls} / ${evidence.requestAccounting.timedOutCalls}`,`- Provider-reported tokens: ${evidence.requestAccounting.providerReportedTokens.total??`UNKNOWN; known subtotal ${evidence.requestAccounting.providerReportedTokens.totalKnown}, coverage ${evidence.requestAccounting.providerReportedTokens.requestsWithCompleteUsage}/${evidence.requestAccounting.providerReportedTokens.requestCoverage}`}`,`- Known provider execution time: ${evidence.requestAccounting.providerExecutionTime.knownMs} ms; complete total ${evidence.requestAccounting.providerExecutionTime.totalMs??'UNKNOWN'}`,`- Wall-clock duration: ${evidence.requestAccounting.wallClockMs} ms`,`- Shortlist capability requests avoided by early stop: ${evidence.requestAccounting.shortlistCapabilityRequestsAvoidedByEarlyStop}`,`- Benchmark requests avoided by finalist selection: ${evidence.requestAccounting.benchmarkRequestsAvoidedByFinalistSelection}`,`- Five-probe requests avoided versus a catalogue-wide 81-model sweep: ${evidence.requestAccounting.catalogueFiveProbeRequestsAvoided}`,'','## K. Escalation implication','','No hierarchy was enabled. The measured leaders above are evidence for a later proposal only: fastest adequate worker → stronger general/coding candidate → reasoning/escalation candidate → separately governed paid frontier route.','','## L. Dashboard/video','','The live Models dashboard showed the staged funnel, durable request accounting, leaderboard and historical adjudications. The Crew view showed all six animated characters, WOPR, and real provider/model events.','','- Continuous video and screenshots are listed in the video manifest after capture.','','## M–O. Regression and Git status','','Focused and full regression results are added after post-run validation. The NVIDIA branch remains isolated and local unless separately reported.','','## P. Routing-admission recommendation','','No NVIDIA route was enabled. Recommendations require review of the measured results and remain a separate authorization gate.',''];return`${lines.join('\n')}\n`}
function git(args){return execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim()}
function assertGitAncestor(commit,errorCode){try{execFileSync('git',['merge-base','--is-ancestor',commit,'HEAD'],{cwd:root,stdio:'ignore'})}catch{throw new Error(errorCode)}}
function requiredEnvironment(name){const value=process.env[name]?.trim();if(!value)throw new Error(`${name}_required`);return value}
function positiveInteger(value,fallback){const parsed=Number(value);return Number.isSafeInteger(parsed)&&parsed>0?parsed:fallback}
function sha256(value){return createHash('sha256').update(value).digest('hex')}
function sanitize(value){return String(value).replace(/nvapi-[A-Za-z0-9_-]+/g,'nvapi-[REDACTED]').replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').replace(/[\r\n]+/g,' ').trim()}
function delay(milliseconds){return new Promise(resolve=>setTimeout(resolve,milliseconds))}
function availablePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.unref();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const address=server.address();if(!address||typeof address==='string')return reject(new Error('qualification_port_unavailable'));const port=address.port;server.close(error=>error?reject(error):resolve(port))})})}

import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {registerBrowserActions} from '../src/control/browser-actions.js';
import {browserCapability, pixelChatGptState, selectBrowserRoute, type BrowserRoute} from '../src/control/browser-capabilities.js';
import {PlaywrightBrowserEngine, type BrowserSessionResult} from '../src/control/browser-worker.js';
import {JobCatalog} from '../src/control/job-catalog.js';
import {ActionRegistry, ArtifactStore, JobRuntime, ResourceLockManager, RunLedger, WorkerRegistry} from '../src/control/job-runtime.js';
import type {JobDefinition} from '../src/control/job-types.js';

const outputDir = path.resolve(process.env.AGENT_CONTROL_BROWSER_QUALIFICATION_DIR ?? 'qualification-results/browser-capabilities');
fs.mkdirSync(outputDir, {recursive: true});
const startedAt = new Date().toISOString();
const engine = new PlaywrightBrowserEngine({executablePath: process.env.AGENT_CONTROL_CHROMIUM_EXECUTABLE ?? '/snap/bin/chromium', headless: true});
const session = {timeoutMs: 30_000, steps: [
  {action:'navigate',url:'https://example.com',waitUntil:'domcontentloaded'},
  {action:'extractText',selector:'h1',name:'initialHeading'},
  {action:'screenshot',name:'example-home',fullPage:true},
  {action:'click',selector:'a'},
  {action:'wait',state:'domcontentloaded'},
  {action:'extractText',selector:'h1',name:'finalHeading'},
]};
const runtimeDir = fs.mkdtempSync(path.join(outputDir, 'job-runtime-'));
const actions = registerBrowserActions(new ActionRegistry(), engine), catalog = new JobCatalog(actions.ids());
const job: JobDefinition = {apiVersion:'agent-control/v1',kind:'Job',metadata:{id:'browser-headless-qualification',name:'Browser headless qualification',version:'1.0.0'},spec:{priority:'normal',concurrency:'no-overlap',parameters:{sessionJson:{type:'string',required:true}},steps:[{id:'browser',action:'browser.session@1.0.0',requires:[browserCapability.headless,browserCapability.javascript,browserCapability.screenshot,browserCapability.download],resources:['browser/session'],outputs:[{name:'browser-result',type:'application/vnd.agent-control.browser-result+json',schema:'agent-control.browser-result/v1',version:'1.0.0'}],verification:['browser-session-completed']}]}};
catalog.addJob(job);
const workers = new WorkerRegistry(); workers.register({id:'browser-local-headless',capabilities:[browserCapability.headless,browserCapability.javascript,browserCapability.screenshot,browserCapability.download],health:'healthy',capacity:1,active:0,observedAt:new Date().toISOString()});
const runtime = new JobRuntime(catalog, actions, workers, new RunLedger(path.join(runtimeDir,'ledger.json')), new ArtifactStore(path.join(runtimeDir,'artifacts')), new ResourceLockManager(path.join(runtimeDir,'locks.json')));
const run = runtime.createRun('browser-headless-qualification@1.0.0',{sessionJson:JSON.stringify(session)},{type:'manual',actor:'qualification'}); await runtime.tick();
const completedRun = runtime.ledger.get(run.id); if(completedRun?.status!=='SUCCEEDED')throw new Error(`browser_job_runtime_failed:${completedRun?.status ?? 'missing'}`);
const artifactId=completedRun.steps[0].artifactIds[0]; if(!artifactId)throw new Error('browser_job_runtime_artifact_missing');
const result = runtime.artifacts.read(artifactId) as BrowserSessionResult;
const screenshot = result.screenshots[0], screenshotFile = path.join(outputDir, 'example-home.png');
fs.writeFileSync(screenshotFile, Buffer.from(screenshot.base64, 'base64'), {mode: 0o600});
const codexChatGptAuthenticated = commandOk('codex', ['login','status'], /chatgpt/i);
const pixel = {online: process.env.PIXEL_ONLINE === 'true', authorisedTransport: process.env.PIXEL_AUTHORISED_TRANSPORT === 'true', uiAutomation: process.env.PIXEL_UI_AUTOMATION === 'true', authenticatedSession: process.env.PIXEL_CHATGPT_AUTHENTICATED === 'true'};
const routes: BrowserRoute[] = [
  {id:'browser-local-headless',nodeId:'browser-node-local',capabilities:[browserCapability.headless,browserCapability.javascript,browserCapability.screenshot,browserCapability.download],state:'AVAILABLE',engine:'Chromium/Playwright',transport:'local process',authenticated:false,locality:'local',expectedCost:0,expectedLatencyMs:500,reason:'live public-page qualification'},
  {id:'desktop-chatgpt-web',nodeId:'desktop-browser-node',capabilities:[browserCapability.chatGptWeb,browserCapability.authenticated,browserCapability.interactive],state:'AUTH_REQUIRED',engine:'Edge',transport:'approved browser bridge required',authenticated:true,locality:'remote',reason:'no approved Edge session bridge found in Agent Control 3.3'},
  {id:'android-chatgpt-ui',nodeId:'android-resource',capabilities:[browserCapability.chatGptAndroid,browserCapability.androidUi,browserCapability.authenticated],state:pixelChatGptState(pixel),engine:'Android UI',transport:'authorised ADB or Agent Control Android transport required',authenticated:true,locality:'remote',reason:pixel.authorisedTransport?'transport observed':'overlay online but no authorised ADB, SSH or UI automation transport'},
];
const router = {
  headless: selectBrowserRoute({capability:browserCapability.headless,explicitRouteId:'browser-local-headless'},routes).selected.id,
  webRefusal: refusal(()=>selectBrowserRoute({capability:browserCapability.chatGptWeb,explicitRouteId:'desktop-chatgpt-web'},routes)),
  pixelRefusal: refusal(()=>selectBrowserRoute({capability:browserCapability.chatGptAndroid,explicitRouteId:'android-chatgpt-ui'},routes)),
  substitutionRefusal: refusal(()=>selectBrowserRoute({capability:browserCapability.chatGptAndroid,explicitRouteId:'browser-local-headless'},routes)),
};
const report = {
  schema:'agent-control.browser-capability-qualification/v1',startedAt,completedAt:new Date().toISOString(),
  jobRuntime:{status:completedRun.status,runId:completedRun.id,selectedWorkers:completedRun.selectedWorkers,artifactId,verification:completedRun.steps[0].verification,evidence:completedRun.provenance.filter(item=>item.type==='evidence').map(item=>item.detail)},
  headless:{status:result.values.initialHeading==='Example Domain'&&result.finalUrl.startsWith('https://www.iana.org/')?'PASS':'FAIL',title:result.title,initialHeading:result.values.initialHeading,finalHeading:result.values.finalHeading,finalUrl:result.finalUrl,interactions:result.interactions,screenshot:{file:screenshotFile,sha256:screenshot.sha256,bytes:Buffer.from(screenshot.base64,'base64').length}},
  multiStep:{status:result.interactions>=6&&result.finalUrl.startsWith('https://www.iana.org/')?'PASS':'FAIL',interactions:result.interactions},
  chatGptPlan:{status:codexChatGptAuthenticated?'AVAILABLE':'AUTH_REQUIRED',transport:'official Codex CLI saved ChatGPT authentication'},
  chatGptWeb:{status:'BLOCKED_NO_APPROVED_WEB_BRIDGE',markerTest:'NOT_RUN',reason:'No Agent Control MSI Edge/UI bridge was found. The authenticated Codex CLI route is preserved as chatgpt.plan and is not relabelled chatgpt.web.'},
  pixelChatGpt:{status:routes[2].state,markerTest:'NOT_RUN',evidence:{overlayOnline:pixel.online,authorisedTransport:pixel.authorisedTransport,uiAutomation:pixel.uiAutomation},requiredNextAction:'Establish an already-authorised ADB or Agent Control Android UI transport; then prove ChatGPT authentication without exporting session data.'},
  router, routes, usage:{browserInteractions:result.interactions,inputTokens:null,outputTokens:null,monetaryCost:null},
};
const canonical = `${JSON.stringify(report,null,2)}\n`, reportFile=path.join(outputDir,'qualification.json'); fs.writeFileSync(reportFile,canonical,{mode:0o600});
console.log(JSON.stringify({reportFile,screenshotFile,headless:report.headless.status,multiStep:report.multiStep.status,chatGptWeb:report.chatGptWeb.status,pixelChatGpt:report.pixelChatGpt.status,router,sha256:createHash('sha256').update(canonical).digest('hex')}));
if(report.headless.status!=='PASS'||report.multiStep.status!=='PASS')process.exitCode=1;
function commandOk(command:string,args:string[],pattern:RegExp){const result=spawnSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10_000});return result.status===0&&pattern.test(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);}
function refusal(fn:()=>unknown){try{fn();return 'UNEXPECTED_SELECTION';}catch(error){return error instanceof Error?error.message:String(error);}}

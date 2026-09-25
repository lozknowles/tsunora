/** Operates the ordinary UI/API. Native Jobs and the production adapter own discovery.
 * The one injected transport failure is explicitly annotated and never called a physical outage.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {execFileSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import type {AddressInfo} from 'node:net';
import {chromium} from 'playwright-core';
import {EstateDiscovery,registerEstateDiscovery} from '../src/control/estate-discovery.js';
import {estateHash,type EstateSnapshot} from '../src/control/estate-model.js';
import {estateResourceAlias,validateEstateEnvelope} from '../src/control/estate-remote.js';
import {executeSsh,type SshExecutor} from '../src/control/managed-node-ssh.js';
import {emptyConfig,type ResourceConfig} from '../src/control/config.js';
import {ActionRegistry,WorkerRegistry,createJobRuntime} from '../src/control/job-runtime.js';
import {JobCatalog} from '../src/control/job-catalog.js';
import {AgentControlService} from '../src/control/application-service.js';
import {PtyRegistry} from '../src/control/pty.js';
import {startWebDashboard} from '../src/control/web-server.js';

const configPath=process.env.ESTATE_APPROVED_RESOURCE_CONFIG,alias=process.env.ESTATE_APPROVED_RESOURCE_ALIAS;
const bootstrapPath=process.env.ESTATE_BOOTSTRAP_RECEIPT,pinPath=process.env.ESTATE_PIN_APPROVAL;
assert.ok(configPath&&alias&&bootstrapPath&&pinPath&&process.env.ESTATE_EVIDENCE_DIR,'Explicit approved inputs required');
const bytes=fs.readFileSync(configPath),bootstrap=JSON.parse(fs.readFileSync(bootstrapPath,'utf8')),approval=JSON.parse(fs.readFileSync(pinPath,'utf8'));
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
assert.equal(sha(bytes),approval.configurationAfterSha256);assert.equal(sha(fs.readFileSync(bootstrapPath)),approval.bootstrapReceiptSha256);
assert.equal(bootstrap.routeVerdict,'PASS');assert.equal(bootstrap.existingHostKeyMatched,true);assert.equal(bootstrap.remoteAndIndependentLocalHashMatch,true);
assert.equal(approval.identityPinWritten,true);assert.equal(approval.distinctFromController,true);
const matches=(JSON.parse(bytes.toString()).resources as ResourceConfig[]).filter(r=>estateResourceAlias(r.id)===alias);
assert.equal(matches.length,1);const resource=structuredClone(matches[0]);assert.equal(resource.estateDiscovery?.expectedIdentitySha256,approval.expectedIdentitySha256);
assert.equal(resource.managedNode?.enabled,true);assert.equal(approval.resourceAlias,alias);assert.equal(bootstrap.resourceAlias,alias);
const config=emptyConfig();config.resources=[resource];
const out=path.resolve(process.env.ESTATE_EVIDENCE_DIR!),root=path.join(out,'private-runtime');assert.ok(!fs.existsSync(out),'Fresh evidence directory required');fs.mkdirSync(root,{recursive:true,mode:0o700});
process.env.AGENT_CONTROL_ACTIVITY_LOG=path.join(root,'activity.jsonl');
const candidateCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),candidateDirty=Boolean(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim());assert.equal(candidateDirty,false);
const write=(name:string,value:unknown)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
write('bootstrap-receipt.json',bootstrap);write('identity-pin-approval.json',approval);
const runtime=createJobRuntime(path.join(root,'jobs'),new JobCatalog(),new ActionRegistry(),new WorkerRegistry());
const service=new AgentControlService({version:1,paused:false,lastRestorePoint:null,lanes:[]},new PtyRegistry(),undefined,'4.12.1-estate-two-host-candidate').configureProjection({jobRuntime:runtime});
let injectNextFault=false;let estate:EstateDiscovery;const transportReceipts:Array<Record<string,unknown>>=[];
const executor:SshExecutor=async(command,args,input,options)=>{
 const runId=estate.latest()?.runId,startedAt=new Date().toISOString();
 assert.equal(options.session?.remoteTransport,true);assert.ok(options.ownedExecution,'Native execution owner required');
 if(injectNextFault){injectNextFault=false;transportReceipts.push({runId,startedAt,kind:'DETERMINISTIC_TRANSPORT_FAULT',actualRemoteDispatch:false,classification:'UNREACHABLE',attempts:1});return{status:255,stdout:'',stderr:'network is unreachable'};}
 const result=await executeSsh(command,args,input,options);
 // Retain the same validated field order hashed by native graph evidence.
 // The raw byte hash below remains distinct; native nonce/binding validation
 // and the post-run accepted-graph digest check still own qualification.
 let envelope:unknown=null;try{envelope=validateEstateEnvelope(result.stdout,alias!,JSON.parse(result.stdout).nonce,approval.expectedIdentitySha256,approval.controllerIdentitySha256);}catch{/* Native adapter owns response rejection. */}
 transportReceipts.push({runId,startedAt,completedAt:new Date().toISOString(),kind:'PRODUCTION_OWNED_SSH',actualRemoteDispatch:true,exitCode:result.status,timedOut:Boolean(result.timedOut),aborted:Boolean(result.aborted),responseSha256:sha(result.stdout),envelope});
 return result;
};
estate=new EstateDiscovery({root:path.join(root,'estate'),config:()=>config,remoteExecutor:executor,onEvent:(type,payload)=>service.events.emit('environment.discovery_changed',{eventType:type,...payload},undefined,'estate-discovery')});
registerEstateDiscovery(runtime,estate);runtime.ledger.subscribe((runId,type,status)=>service.events.emit('job.run_changed',{runId,type,status},undefined,'run-ledger'));
const allowedOrigins:string[]=[],token=randomBytes(32).toString('hex'),server=startWebDashboard(service,{host:'127.0.0.1',port:0,operatorToken:token,estate,allowedOrigins});await once(server,'listening');const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;allowedOrigins.push(url);
const browser=await chromium.launch({headless:true,executablePath:'/snap/bin/chromium',args:['--no-sandbox']}),context=await browser.newContext({viewport:{width:1680,height:1160},colorScheme:'dark'});
await context.addInitScript(t=>sessionStorage.setItem('agent-control-operator-token',t),token);const page=await context.newPage(),errors:string[]=[];page.on('pageerror',()=>errors.push('BROWSER_PAGE_ERROR'));
let busy=false;const tick=setInterval(async()=>{if(busy)return;busy=true;try{await runtime.tick();}catch{errors.push('NATIVE_TICK_ERROR');}finally{busy=false;}},100);
const shot=async(name:string)=>{await page.evaluate(()=>window.scrollTo(0,0));await page.locator('#estate-workspace').screenshot({path:path.join(out,name)});};
const note=async(lines:string[])=>page.evaluate(v=>(window as any).AgentControlEstate.setRecordingNote(v),lines);
const hostId=`host:${alias}`,remote=(s:EstateSnapshot)=>s.entities.find(e=>e.id===hostId)!;
const snapshots:EstateSnapshot[]=[];
try{
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction("typeof state!=='undefined'&&state.operatorAuth==='authenticated'");await page.locator('[data-view="estate"]').click();await page.waitForFunction(()=>(window as any).AgentControlEstate.state().projection?.estate?.status==='EMPTY');
 for(const category of ['PASSIVE_INVENTORY','CAPABILITY_PROBES','REMOTE_HOST_DISCOVERY'])await page.locator(`[name="estate-category"][value="${category}"]`).check();
 await page.locator(`[name="estate-target"][value="${alias}"]`).check();await page.locator('#estate-video').check();await page.locator('#estate-grant').click();await page.waitForFunction(()=>Boolean((window as any).AgentControlEstate.state().permissionId));
 await page.evaluate(()=>(window as any).AgentControlEstate.startRecording());
 await note([`BOOTSTRAP RECEIPT: local + ${alias}`,`Route PASS / existing SSH key trusted / ${bootstrap.at.slice(0,19)}Z`,`Pin ${approval.expectedIdentitySha256.slice(0,16)}... independently matched; no raw ID`]);
 await shot('01-approved-resources.png');await page.waitForTimeout(7000);await page.locator('.estate-scope summary').click();
 for(let pass=1;pass<=5;pass++){
  const fault=pass===4;injectNextFault=fault;
  await note(fault?['INJECTED TRANSPORT FAILURE / not a physical outage','Native adapter + Job remain production code','Remote data must stay STALE; no network or host changes']:pass===5?['RECOVERY AFTER INJECTED FAULT / actual SSH transport','Same independently pinned physical identity required','Physical network outage/recovery is not claimed']:[`PHYSICAL TWO-HOST DISCOVERY / cycle ${pass} of 3`,`Pinned remote ${alias}`,'Native Job owns local + remote execution; no fallback']);
  const previous=estate.latest()?.id??null;await page.locator('#estate-run').click();
  await page.waitForFunction(old=>{const s=(window as any).AgentControlEstate.state().projection?.estate;return s?.snapshotId!==old&&['COMPLETED','PARTIAL','FAILED'].includes(s?.status);},previous,{timeout:35000});
  const s=estate.latest()!;snapshots.push(s);write(`snapshot-${pass}.json`,s);write(`replay-${pass}.json`,estate.replay(s.id));
  assert.equal(runtime.ledger.get(s.runId)?.status,'SUCCEEDED');assert.equal(s.entities.find(e=>e.id==='host:controller-local')?.state,'VERIFIED');
  if(fault){assert.equal(s.status,'PARTIAL');assert.equal(remote(s).state,'UNREACHABLE');assert.ok(s.entities.some(e=>e.hostId===hostId&&e.state==='STALE'));assert.ok(s.relationships.some(e=>e.state==='STALE'));assert.ok(!s.diff.some(d=>['REMOVED','MODEL_REMOVED'].includes(d.change)));}
  else{assert.ok(s.entities.some(e=>e.hostId===hostId&&e.kind==='gpu'&&e.attributes.model==='Quadro P3000'));assert.ok(s.entities.some(e=>e.hostId===hostId&&e.kind==='cpu'&&e.attributes.model!=='UNKNOWN'));assert.equal(s.status,'COMPLETED');assert.equal(remote(s).state,'AVAILABLE');assert.equal(remote(s).attributes.identityDigest,approval.expectedIdentitySha256);assert.equal(s.entities.find(e=>e.id==='host:controller-local')?.attributes.physicalIdentityDigest,approval.controllerIdentitySha256);}
  await page.evaluate(id=>(window as any).AgentControlEstate.select(id),hostId);await shot(`0${pass+1}-native-cycle-${pass}.png`);await page.waitForTimeout(fault?7000:5000);
  if(pass===3||pass===5){await page.locator('#estate-diff').evaluate(n=>(n.closest('details') as HTMLDetailsElement).open=true);await shot(pass===3?'07-three-run-diff.png':'09-recovery-diff.png');await note([pass===3?'THREE PHYSICAL CYCLES / identity + IDs stable':'ACTUAL SSH RETURN / same pinned identity',`${s.comparison?.records.filter(r=>r.changes.includes('UNCHANGED')).length} unchanged graph records / inspect retained diff`,'No failed observation is treated as confirmed deletion']);await page.waitForTimeout(5000);}
 }
 const final=snapshots[4],first=snapshots[0];
 for(const s of snapshots){assert.equal(remote(s).firstSeen,remote(first).firstSeen);assert.equal(new Set(s.entities.map(e=>e.id)).size,s.entities.length);assert.deepEqual(s.entities.map(e=>e.id).sort(),first.entities.map(e=>e.id).sort());assert.deepEqual(s.relationships.map(e=>e.id).sort(),first.relationships.map(e=>e.id).sort());}
 assert.ok(final.events.some(e=>e.entity?.id===hostId&&e.entity.state==='RECOVERED'));assert.ok(!final.entities.some(e=>e.state==='STALE'));assert.equal(remote(snapshots[3]).lastSuccessfulDiscovery,remote(snapshots[2]).lastSuccessfulDiscovery);
 // Only envelopes accepted by native graph evidence may be retained as successful transport evidence.
 for(const receipt of transportReceipts.filter(r=>r.actualRemoteDispatch)){const s=snapshots.find(s=>s.runId===receipt.runId)!;assert.equal(receipt.exitCode,0);assert.ok(remote(s).evidence.some(e=>e.digest===estateHash(receipt.envelope)));}
 assert.equal(transportReceipts.filter(r=>r.actualRemoteDispatch).length,4);assert.equal(transportReceipts.length,5);
 await page.locator('[data-view="factory"]').click();await page.waitForFunction(()=>(window as any).AgentControlFactory.state().transport==='CONNECTED');const lastRun=runtime.ledger.get(final.runId)!;
 await note(['NATIVE JOB AND RECEIPT / authoritative ledger','Four successful physical SSH discoveries; one labelled injected fault','No physical outage or network reconfiguration']);
 await page.evaluate(id=>(window as any).AgentControlFactory.inspect(`job:${id}`),lastRun.id);await page.locator('#factory-workspace').screenshot({path:path.join(out,'10-native-job.png')});await page.waitForTimeout(5000);
 await page.evaluate(id=>(window as any).AgentControlFactory.inspect(`evidence:${id}`),lastRun.artifacts[0]);await page.locator('#factory-workspace').screenshot({path:path.join(out,'11-native-receipt.png')});await page.waitForTimeout(5000);
 await page.getByRole('button',{name:'View discovered hosts',exact:true}).click();await page.waitForFunction(()=>(window as any).AgentControlEstate.state().mode==='REPLAY'&&(window as any).AgentControlEstate.state().projection?.estate?.snapshotId===document.querySelector<HTMLSelectElement>('#estate-history')?.value);assert.equal(await page.locator('#estate-inspector .estate-hardware').count(),1);assert.match(await page.locator('#estate-inspector .estate-hardware').innerText(),/Quadro P3000/);await shot('14-host-hardware.png');await page.waitForTimeout(5000);await page.locator('#estate-live').click();await page.evaluate(id=>(window as any).AgentControlEstate.select(id),hostId);
 await note(['EXPERIMENTAL_MULTI_HOST / two physical hosts verified','Three-cycle continuity PASS / real multi-run diff retained','Recovery PASS with injected transport fault; no physical outage claim']);await shot('12-final-verdict.png');await page.waitForTimeout(7000);
 await page.evaluate(()=>(window as any).AgentControlEstate.stopRecording());await page.waitForFunction(()=>!(window as any).AgentControlEstate.state().recording);
 const video=await page.evaluate(()=>(window as any).AgentControlEstate.captureBytes());assert.ok(video.length>10000);fs.writeFileSync(path.join(out,'estate-physical-two-host.webm'),Buffer.from(video),{mode:0o600});
 write('video-manifest.json',await page.evaluate(()=>(window as any).AgentControlEstate.captureManifest()));write('factory-replay.json',await page.evaluate(()=>(window as any).AgentControlFactory.replay()));
 write('permission.json',estate.assertPermission(final.permissionId));write('native-runs.json',runtime.ledger.list());write('native-artifacts.json',runtime.ledger.list().flatMap(r=>r.artifacts.map(id=>{const {storageRef,...record}=runtime.artifacts.get(id)!;return{id,record,value:runtime.artifacts.read(id)};})));write('native-transport-receipts.json',transportReceipts);
 await page.setViewportSize({width:390,height:844});await shot('13-mobile.png');assert.deepEqual(errors,[]);
 const cross=final.relationships.filter(r=>r.from==='host:controller-local'&&r.to===hostId);
 const verdict={candidateCommit,candidateDirty,resourceAlias:alias,configurationSha256:sha(bytes),physicalHostsVerified:2,physicalRemoteExecutions:4,deterministicTransportFaults:1,threePhysicalCyclesPassed:true,localIdentitySha256:approval.controllerIdentitySha256,remoteIdentitySha256:approval.expectedIdentitySha256,distinctPhysicalIdentities:approval.controllerIdentitySha256!==approval.expectedIdentitySha256,entities:final.entities.length,relationships:final.relationships.length,entitiesPerHost:{local:final.entities.filter(e=>e.id==='host:controller-local'||e.hostId==='host:controller-local').length,remote:final.entities.filter(e=>e.id===hostId||e.hostId===hostId).length},localRelationships:final.relationships.filter(r=>!cross.includes(r)&&!r.from.includes(alias)&&!r.to.includes(alias)).length,remoteRelationships:final.relationships.filter(r=>!cross.includes(r)&&(r.from.includes(alias)||r.to.includes(alias))).length,verifiedCrossHostRelationships:cross.filter(r=>r.basis==='VERIFIED').length,declaredCrossHostRelationships:cross.filter(r=>r.basis==='DECLARED').length,identityContinuity:'PASS',multiRunDiff:'PASS',unreachableHandling:'PASS - production adapter exercised with deterministic transport fault',recovery:'PASS - same physical identity returned after injected transport failure',physicalNetworkRecovery:'NOT_PHYSICALLY_QUALIFIED',snapshotSha256:estateHash(final),eventChainHead:final.events.at(-1)?.sha256,nativeJobs:runtime.ledger.list().map(r=>({id:r.id,status:r.status,selectedWorkers:r.selectedWorkers})),browserErrors:errors,overall:'EXPERIMENTAL_MULTI_HOST',limits:['No physical network outage was induced.','Remote coverage is fixed host/CPU/memory and optional NVIDIA GPU metadata; services and logs remain uninspected.','No production/application logs read; no network settings or services changed.','Local hashes are not a signed external attestation.','No merge, release or deployment.']};
 write('qualification.json',verdict);console.log(JSON.stringify({candidateCommit,nativeJobs:verdict.nativeJobs.length,physicalHosts:2,physicalRemoteExecutions:4,entities:verdict.entities,relationships:verdict.relationships,crossHostVerified:verdict.verifiedCrossHostRelationships,overall:verdict.overall}));
}catch{write('failure.json',{classification:'PHYSICAL_QUALIFICATION_FAILED',browserErrors:errors,completedSnapshots:snapshots.length});await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw Error('estate_physical_qualification_failed');}
finally{clearInterval(tick);while(busy)await new Promise(r=>setTimeout(r,50));await browser.close();server.close();}

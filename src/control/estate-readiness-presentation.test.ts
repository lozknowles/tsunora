import test from 'node:test';
import assert from 'node:assert/strict';
import {GAP_ACTIONS,classifyReadinessGaps,resourcePresentation,safeEstateAttributes} from './estate-readiness-presentation.js';
import {operationalReadiness,projectJobEstateMap,type DeclaredReadiness,type ExecutionAdmission} from './job-estate-readiness.js';
import type {DiscoveryScan} from './environment-discovery.js';
import {projectEstateMap} from './estate-map.js';
import {projectRecordedJobProcess} from './runtime-map.js';
import type {RunRecord} from './job-types.js';
const now=new Date('2026-09-13T12:00:00Z');
function fixture() {
  const item=(id:string,kind:string)=>({id,kind,nodeId:'node-a',label:id,health:'HEALTHY',lifecycle:'QUALIFIED',operationalState:'AVAILABLE',resourceClasses:[],change:'UNCHANGED',fingerprint:id,attributes:{},provenance:[{adapter:'probe',method:'read-only',authority:'AUTHORITATIVE',observedAt:now.toISOString()}]});
  const scan={schema:'agent-control.environment-discovery/v1',id:'scan',status:'COMPLETED',completedAt:now.toISOString(),startedAt:now.toISOString(),items:[item('machine','MACHINE'),item('tool','TOOL')],mode:'FULL_DISCOVERY',testing:'QUICK_TEST'} as unknown as DiscoveryScan;
  const binding={resourceId:'tool',nodeId:'node-a',capability:'evidence.report',confidence:'VERIFIED',evidence:{fingerprint:'tool',expiresAt:new Date(+now+3600000).toISOString()}};
  const declared:DeclaredReadiness={id:'job',jobDigest:'a'.repeat(64),primaryState:'READY',qualification:'NOT_YET_QUALIFIED',authority:{state:'NO_APPROVAL_REQUIRED'},reasons:[],requirements:[{type:'capability',requirement:'evidence.report',satisfied:true,candidates:[binding],evidence:[binding]}]};
  const admission:ExecutionAdmission={jobDigest:declared.jobDigest,resourceIds:['tool'],capabilities:['evidence.report'],state:'QUALIFIED',runId:'run-proof',artifactSha256:'b'.repeat(64),implementationSha256:'c'.repeat(64),expiresAt:new Date(+now+120000).toISOString(),authentication:'NOT_REQUIRED',scope:'READ_ONLY_LOCAL_INSPECTION'};
  return {scan,declared,admission};
}
test('all fifteen gap classifications have proposal-only actions and can be observed together',()=>{
  const {scan,declared,admission}=fixture();
  scan.items[1].health='OFFLINE';scan.items[1].attributes={transportState:'FAILED',authenticationState:'INVALID',qualificationState:'FAILED',configured:false};
  scan.items[0].provenance[0].observedAt=new Date(+now-121000).toISOString();
  declared.requirements[0].satisfied=false;declared.requirements[0].evidence[0].confidence='STALE';
  for(const type of ['capability','connector','credential'])declared.requirements.push({type,requirement:type,satisfied:false,candidates:[],evidence:[]});
  declared.authority.state='APPROVAL_REQUIRED';declared.reasons.push({state:'BLOCKED',code:'partial_discovery',requirement:'scan'});
  const gaps=classifyReadinessGaps(declared,scan,[{...admission,expiresAt:now.toISOString()}],undefined,now);
  const withoutAdmission=classifyReadinessGaps(declared,scan,[],undefined,now);
  assert.deepEqual([...new Set([...gaps,...withoutAdmission].map(g=>g.code))].sort(),Object.keys(GAP_ACTIONS).sort());
  assert.ok(gaps.every(g=>g.actionMode==='PROPOSAL_ONLY'&&g.nextAction));
});
test('current native usable, partial, failed and stale states have separate colours',()=>{
  const {scan}=fixture(),item=scan.items[1];
  assert.equal(resourcePresentation(item,scan,now).colour,'GREEN');
  item.lifecycle='DISCOVERED';assert.equal(resourcePresentation(item,scan,now).colour,'ORANGE');
  item.attributes.authenticationState='INVALID';assert.equal(resourcePresentation(item,scan,now).colour,'RED');
  assert.equal(resourcePresentation(item,scan,new Date(+now+900001)).colour,'GREY');
});
test('admission expiry changes READY to unsupported and retains the expired run evidence',()=>{
  const {scan,declared,admission}=fixture();
  assert.equal(operationalReadiness(declared,scan,[admission],now).operationalReady,true);
  const later=operationalReadiness(declared,scan,[{...admission,expiresAt:now.toISOString()}],now);
  assert.equal(later.operationalReady,false);assert.ok(later.blockers.some(g=>g.code==='ADMISSION_EXPIRED'));
  assert.equal(later.admissionHistory[0].runId,admission.runId);assert.equal(later.admissionHistory[0].state,'EXPIRED');
  const map=projectJobEstateMap(scan,[later],[],now);assert.equal((map.nodes.find(n=>n.id==='library-job:job')!.detail.admissionHistory as any[])[0].runId,admission.runId);assert.equal((map.nodes.find(n=>n.id==='tool')!.detail.admissionHistory as any[])[0].state,'EXPIRED');
});
test('approval is orthogonal to technical capability and excludes operational READY count',()=>{
  const {scan,declared,admission}=fixture();declared.authority.state='APPROVAL_REQUIRED';
  const r=operationalReadiness(declared,scan,[admission],now),map=projectJobEstateMap(scan,[r],[],now) as any;
  assert.equal(r.primaryState,'READY');assert.equal(r.operationalReady,false);
  assert.deepEqual(map.estateCounts.jobs,{total:1,catalogueCapable:1,operationalReady:0,blocked:1});
});
test('freshness expiry propagates from device to tool, counts and job impact without rediscovery',()=>{
  const {scan,declared,admission}=fixture();const later=new Date(+now+121000);
  const map=projectJobEstateMap(scan,[operationalReadiness(declared,scan,[admission],later)],[],later) as any;
  assert.equal(map.estateCounts.resources.alive,0);assert.equal(map.estateCounts.resources.total,2);
  assert.ok(map.nodes.find((n:any)=>n.id==='tool').detail.jobLibrary.blockedJobs.includes('job'));
});
test('safe graph metadata drops unknown secrets and strips URL userinfo, path, query and fragment',()=>{
  const {scan}=fixture();scan.items[1].attributes={arbitrary:'UNEXPECTED_SECRET',password:'PASSWORD_SECRET',endpoint:'https://user:PASS_SECRET@example.invalid/private-key?token=QUERY_SECRET#FRAGMENT_SECRET'};
  scan.items[1].label='https://user:LABEL_SECRET@example.invalid/private?token=LABEL_QUERY';
  const body=JSON.stringify(projectEstateMap(scan,now.toISOString()));
  for(const secret of ['UNEXPECTED_SECRET','PASSWORD_SECRET','PASS_SECRET','QUERY_SECRET','FRAGMENT_SECRET','private-key','LABEL_SECRET','LABEL_QUERY'])assert.ok(!body.includes(secret),secret);
  assert.deepEqual(safeEstateAttributes(scan.items[1].attributes),{endpoint:'https://example.invalid'});
});
test('credential masks are fixed length independently of source credential size',()=>{
  const {scan}=fixture();scan.items[1].kind='CREDENTIAL';
  const masks=[1,7,999].map(size=>{scan.items[1].attributes={value:'x'.repeat(size),credentialMask:'x'.repeat(size)};return projectEstateMap(scan,now.toISOString()).nodes.find(n=>n.id==='tool')!.detail.credentialMask;});
  assert.deepEqual(masks,['••••••••••••','••••••••••••','••••••••••••']);
});
test('causal edges and impact link only exact library digests and native target IDs',()=>{
  const {scan,declared,admission}=fixture();
  const run={id:'run-proof',jobId:'native-read',status:'SUCCEEDED',requestedAt:now.toISOString(),endedAt:now.toISOString(),parameters:{libraryJobId:'job',libraryDigest:declared.jobDigest,target:'machine'},steps:[]} as unknown as RunRecord;
  const wrong={...run,id:'wrong-digest',parameters:{...run.parameters,libraryDigest:'wrong'}};
  const map=projectJobEstateMap(scan,[operationalReadiness(declared,scan,[admission],now)],[run,wrong],now);
  assert.ok(map.edges.some(e=>e.from==='library-job:job'&&e.to==='library-capability:capability:evidence.report'));
  assert.deepEqual(map.nodes.find(n=>n.id==='tool')!.detail.processRunIds,['run-proof']);
  assert.deepEqual(projectRecordedJobProcess(run,['machine']).nodes[0].detail.estateResourceIds,['machine']);
});
test('a machine observation does not qualify a declared SSH transport',()=>{
  const {scan}=fixture();scan.items[0].attributes.transport='ssh';
  const map=projectEstateMap(scan,now.toISOString()) as any;
  assert.equal(map.estateCounts.transports.alive,0);assert.equal(map.nodes.find((n:any)=>n.type==='transport').detail.lastVerified,null);
});

test('mobile resource observations survive the safe Estate projection without admitting arbitrary text',()=>{
  const values={memoryTotalBytes:12000000000,memoryAvailableBytes:5000000000,storageAvailableBytes:11000000000,diskTotalBytes:20000000000};
  assert.deepEqual(safeEstateAttributes(values),values);
  assert.deepEqual(safeEstateAttributes({memoryTotalBytes:'PRIVATE_SECRET',memoryAvailableBytes:-1,storageAvailableBytes:Infinity,diskTotalBytes:NaN,privateEnvironment:'SECRET'}),{});
  assert.deepEqual(safeEstateAttributes({memoryAvailableBytes:0}),{memoryAvailableBytes:0});
  const {scan}=fixture();Object.assign(scan.items[0].attributes,values);
  const node=projectEstateMap(scan,now.toISOString()).nodes.find(n=>n.id===scan.items[0].id)!;
  assert.equal(node.detail.memoryTotalBytes,values.memoryTotalBytes);
  assert.equal(node.detail.storageAvailableBytes,values.storageAvailableBytes);
});

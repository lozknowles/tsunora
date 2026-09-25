import assert from 'node:assert/strict';
import test from 'node:test';
import {listWorkspaceRoots,parseWorkspaceId,projectWorkspace,searchWorkspaces,workspaceId,type WorkspaceNodeDashboard,type WorkspaceRunInspector,type WorkspaceSource} from './navigable-workspace.js';
import type {RuntimeMapProjection} from './runtime-map.js';

const at='2026-09-14T12:00:00.000Z';
const estate:RuntimeMapProjection={schema:'agent-control.runtime-map/v1',authority:'Agent Control governed discovery inventory',mapKind:'ESTATE',mode:'LIVE',parcelId:'scan',observedAt:at,replayAt:null,range:{startedAt:at,endedAt:at},freshness:{state:'LIVE',lastAuthoritativeAt:at},summary:{nodes:4,edges:3,running:1,waiting:0,succeeded:3,failed:0,degraded:0,groups:0},nodes:[{id:'pixel',type:'device',label:'Pixel 8 Pro',state:'RUNNING',expandable:true,detail:{},evidence:[{kind:'discovery',id:'pixel-proof'}]}],edges:[],events:[],controlRoom:[],limitations:[]};
const node:WorkspaceNodeDashboard={observedAt:at,node:{id:'pixel',label:'Pixel 8 Pro',state:'RUNNING',detail:{platform:'android'},evidence:[{kind:'discovery',id:'pixel-proof'}]},executionEnvironments:[{id:'alpine',label:'Alpine Linux',kind:'GUEST_OS',parentId:'pixel',state:'RUNNING',availability:'AVAILABLE',transport:'ssh',capabilities:['container.execute','tool.shell'],runtimes:[{id:'runtime:podman',kind:'podman',version:'5.8.6',state:'AVAILABLE',observedAt:at,containers:[]}],workerRoute:{id:'mobile-linux-guest',state:'RUNNING',health:'healthy'},lastObservedAt:at,evidence:[{kind:'managed-node-probe',id:'probe'}]}],work:[{inspectorId:'run-one',label:'Nested qualification',status:'SUCCEEDED',startedAt:at,endedAt:at,nodeId:'mobile-linux-guest'}]};
const run:WorkspaceRunInspector={id:'run-one',title:'Nested qualification',status:'SUCCEEDED',startedAt:at,endedAt:at,observedAt:at,physicalNodes:[{id:'pixel',label:'Pixel 8 Pro'}],executionRoute:{path:[{id:'pixel',label:'Pixel 8 Pro',kind:'PHYSICAL_DEVICE'},{id:'alpine',label:'Alpine Linux',kind:'GUEST_OS'}],worker:{id:'mobile-linux-guest',state:'SUCCEEDED'},runtime:{id:'runtime:podman',kind:'podman',version:'5.8.6'},transport:'ssh',reason:'Linux container capability required',authority:'DETERMINISTIC_RECORDED_ROUTE',evidence:[{kind:'route',id:'route-one'}]},calls:[{id:'invocation-one',provider:'openrouter',model:'glm',providerModel:'z-ai/glm-5.3',node:'mobile-linux-guest',startedAt:at,completedAt:at,accounting:{usage:{inputTokens:100,cachedInputTokens:40,outputTokens:20,totalProcessedTokens:120},apiCost:null},exchange:{input:'bounded request',output:'bounded result',truncated:false}}],operations:[{id:'operation-one',label:'Governed container invocation',type:'tool',state:'SUCCEEDED',startedAt:at,endedAt:at,detail:{runtime:'podman'},evidence:[{kind:'artifact',id:'container-output'}]},{id:'artifact-report',label:'Qualification report',type:'artifact',state:'SUCCEEDED',startedAt:at,endedAt:at,detail:{type:'text/markdown',schema:'report/v1',createdAt:at,size:42,sha256:'b'.repeat(64)},evidence:[{kind:'artifact',id:'artifact-report',sha256:'b'.repeat(64)}]}],usage:{totals:{input:{value:100},cached:{value:40},output:{value:20},tokens:{value:120},apiCost:{currencies:{}}}},history:{sha256:'a'.repeat(64),entryCount:4,terminal:true},historyScope:'Run history',events:[],context:{records:[{kind:'baton'}]}};
const source:WorkspaceSource={estate,nodes:[node],runs:[run]};
const contextualSource:WorkspaceSource={...source,projects:[{id:'agent-control',label:'Agent Control',workspaces:['qualification'],boardIds:['board-1'],runIds:['run-one'],evidence:[{kind:'work-board',id:'board-1'}]}],repositories:[{identity:'repo-agent-control',name:'agent-control',nodeId:'pixel',requestedRef:'main',reviewedSha:'c'.repeat(40),dirty:false,runIds:['run-one'],evidence:[{kind:'resolved-repository',id:'repo-proof'}]}]};
const id=(kind:Parameters<typeof workspaceId>[0]['kind'],...parts:string[])=>workspaceId({kind,parts});

test('workspace identity round trips without embedding transport or filesystem paths',()=>{const value=id('ENVIRONMENT','pixel','alpine');assert.deepEqual(parseWorkspaceId(value),{kind:'ENVIRONMENT',parts:['pixel','alpine']});assert.doesNotMatch(value,/ssh|alpine|pixel/);for(const invalid of ['workspace:ssh:host','acw1.DEVICE.bad%value',''])assert.throws(()=>parseWorkspaceId(invalid),/workspace_identity_invalid/);});
test('estate to device to environment to runtime navigation is progressive and transport independent',()=>{const root=listWorkspaceRoots(source);assert.equal(root.children[0]?.label,'Pixel 8 Pro');const device=projectWorkspace(id('DEVICE','pixel'),source);assert.deepEqual(device.children.map(item=>item.kind),['ENVIRONMENT','RUN']);const environment=projectWorkspace(id('ENVIRONMENT','pixel','alpine'),source);assert.ok(environment.children.some(item=>item.kind==='RUNTIME'));assert.ok(environment.children.some(item=>item.kind==='WORKER'));assert.equal(environment.context.transport,'ssh');assert.equal(environment.capabilities.find(item=>item.id==='TERMINAL')?.state,'REQUIRES_AUTHORIZATION');const runtime=projectWorkspace(id('RUNTIME','pixel','alpine','runtime:podman'),source);assert.ok(runtime.children.some(item=>item.kind==='RUN'));assert.equal(runtime.id.includes('ssh'),false);});
test('historical run reconstructs bottom-up route, evidence and canonical usage',()=>{const workspace=projectWorkspace(id('RUN','run-one'),source);assert.equal(workspace.mode,'HISTORICAL');assert.equal(workspace.parent?.kind,'RUNTIME');assert.deepEqual(workspace.breadcrumbs.map(item=>item.kind),['ESTATE','DEVICE','ENVIRONMENT','RUNTIME','RUN']);assert.equal((workspace.context.tokens as {cachedInput:number}).cachedInput,40);assert.equal(workspace.capabilities.find(item=>item.id==='TOKENS')?.state,'AVAILABLE');assert.equal(workspace.children[0]?.kind,'INVOCATION');assert.equal(workspace.targets.history,'/api/observability/runs/run-one');});
test('invocation resolves input output tokens and parent run without granting control',()=>{const workspace=projectWorkspace(id('INVOCATION','run-one','invocation-one'),source),context=workspace.context as {tokens:{input:number;cachedInput:number;output:number};exchange:{input:string;output:string}};assert.deepEqual(context.tokens,{input:100,cachedInput:40,output:20,total:120,cost:null});assert.equal(context.exchange.output,'bounded result');assert.equal(workspace.parent?.kind,'RUN');assert.equal(workspace.capabilities.some(item=>['TERMINAL','EXECUTE'].includes(item.id)&&item.state==='AVAILABLE'),false);});
test('deterministic operation is an invocation with unavailable model telemetry',()=>{const workspace=projectWorkspace(id('INVOCATION','run-one','operation-one'),source),context=workspace.context as {tokens:{input:number|null;total:number|null};invocation:{kind:string}};assert.equal(workspace.label,'Governed container invocation');assert.equal(context.invocation.kind,'tool');assert.equal(context.tokens.input,null);assert.equal(context.tokens.total,null);assert.equal(workspace.capabilities.find(item=>item.id==='TOKENS')?.state,'UNAVAILABLE');assert.equal(workspace.evidence[0]?.id,'container-output');});
test('missing telemetry remains unavailable rather than zero and stale estate remains stale',()=>{const missing:WorkspaceSource={...source,estate:{...estate,freshness:{state:'STALE',lastAuthoritativeAt:at}},runs:[{...run,calls:[],usage:{totals:{input:{value:null},cached:{value:null},output:{value:null},tokens:{value:null},apiCost:{currencies:{},reported:0,total:0}}},history:null}]};const root=listWorkspaceRoots(missing),workspace=projectWorkspace(id('RUN','run-one'),missing),tokenContext=workspace.context.tokens as {total:number|null;cost:unknown};assert.equal(root.mode,'STALE');assert.equal(workspace.capabilities.find(item=>item.id==='TOKENS')?.state,'UNAVAILABLE');assert.equal(tokenContext.total,null);assert.equal(tokenContext.cost,null);});
test('workspace projection redacts credential-like values from untrusted topology metadata',()=>{const unsafe:WorkspaceSource={...source,nodes:[{...node,executionEnvironments:[{...node.executionEnvironments[0]!,transport:'password=do-not-render'}]}]};assert.equal(JSON.stringify(projectWorkspace(id('ENVIRONMENT','pixel','alpine'),unsafe)).includes('do-not-render'),false);});

test('runtime workspace does not attach runs from another device or environment with the same runtime kind',()=>{
 const unrelated:WorkspaceRunInspector={...run,id:'other-run',physicalNodes:[{id:'other-device',label:'Other device'}],executionRoute:{...run.executionRoute!,path:[{id:'other-guest',label:'Other guest',kind:'GUEST_OS'}],runtime:{id:'different-runtime',kind:'podman'}}};
 const sameHost:WorkspaceRunInspector={...unrelated,id:'same-device-other-environment',physicalNodes:run.physicalNodes};
 const sameName:WorkspaceRunInspector={...unrelated,id:'same-runtime-id-other-device',executionRoute:{...unrelated.executionRoute!,runtime:run.executionRoute!.runtime}};
 const value=projectWorkspace(id('RUNTIME','pixel','alpine','runtime:podman'),{...source,runs:[run,unrelated,sameHost,sameName]});
 assert.deepEqual(value.children.map(child=>parseWorkspaceId(child.id).parts[0]),['run-one']);
});

test('model operation aliases retain canonical token evidence and do not duplicate invocation children',()=>{
 const alias='model:invocation-one';const record={...run,operations:[...run.operations,{id:alias,type:'model-call',label:'Model operation',state:'SUCCEEDED'}]};
 const records={...source,runs:[record]};
 const canonical=projectWorkspace(id('INVOCATION','run-one','invocation-one'),records);
 const operation=projectWorkspace(id('INVOCATION','run-one',alias),records);
 assert.deepEqual(operation.context,canonical.context);
 assert.equal(operation.breadcrumbs.at(-1)?.kind,'INVOCATION');
 const children=projectWorkspace(id('RUN','run-one'),records).children;
 assert.equal(children.filter(child=>['invocation-one',alias].includes(parseWorkspaceId(child.id).parts[1]!)).length,1);
});

test('workspace search is authoritative, bounded and cursor paginated',()=>{
 const first=searchWorkspaces(source,{query:'',limit:3});assert.equal(first.items.length,3);assert.ok(first.nextCursor);assert.ok(first.total>3);
 const second=searchWorkspaces(source,{query:'',limit:3,cursor:first.nextCursor});assert.equal(second.items.some(item=>first.items.some(previous=>previous.id===item.id)),false);
 const filtered=searchWorkspaces(source,{query:'glm',limit:20});assert.equal(filtered.items.length,1);assert.equal(filtered.items[0]?.kind,'INVOCATION');
 assert.throws(()=>searchWorkspaces(source,{query:'changed',cursor:first.nextCursor}),/workspace_search_cursor_invalid/);
});

test('exact execution sessions expose governed WATCH entry without granting execution',()=>{
 const records:WorkspaceSource={...source,sessions:[{id:'session-run',state:'RUNNING',scope:{runId:'run-one'}},{id:'session-other',state:'RUNNING',scope:{runId:'other'}}]};
 const workspace=projectWorkspace(id('RUN','run-one'),records),sessions=workspace.context.executionSessions as Array<{id:string}>;
 assert.deepEqual(sessions,[{id:'session-run',state:'RUNNING'}]);assert.equal(workspace.capabilities.find(item=>item.id==='TERMINAL')?.state,'REQUIRES_AUTHORIZATION');assert.equal(workspace.capabilities.find(item=>item.id==='EXECUTE'),undefined);
});

test('project and repository workspaces derive associations from durable records without granting source access',()=>{
 const root=listWorkspaceRoots(contextualSource);assert.deepEqual(root.children.map(item=>item.kind),['PROJECT','DEVICE']);
 const project=projectWorkspace(id('PROJECT','agent-control'),contextualSource);assert.deepEqual(project.children.map(item=>item.kind),['REPOSITORY','RUN']);
 const repository=projectWorkspace(id('REPOSITORY','repo-agent-control'),contextualSource);assert.equal(repository.associations[0]?.kind,'PROJECT');assert.equal((repository.context.repository as {reviewedSha:string}).reviewedSha,'c'.repeat(40));assert.equal(repository.capabilities.find(item=>item.id==='FILES')?.state,'UNAVAILABLE');assert.doesNotMatch(JSON.stringify(repository),/sourcePath|snapshotPath/);
 const runWorkspace=projectWorkspace(id('RUN','run-one'),contextualSource);assert.deepEqual(runWorkspace.associations.map(item=>item.kind),['PROJECT','REPOSITORY']);assert.ok(runWorkspace.children.some(item=>item.kind==='ARTIFACT'));
});

test('managed artifact workspace exposes only the authenticated redacted viewer target',()=>{
 const artifact=projectWorkspace(id('ARTIFACT','run-one','artifact-report'),contextualSource);assert.equal(artifact.parent?.kind,'RUN');assert.deepEqual(artifact.associations.map(item=>item.kind),['PROJECT','REPOSITORY']);assert.equal(artifact.capabilities.find(item=>item.id==='FILES')?.state,'AVAILABLE');assert.equal(artifact.targets.content,'/api/artifacts/artifact-report/content');assert.equal((artifact.context.artifact as {sha256:string}).sha256,'b'.repeat(64));assert.doesNotMatch(JSON.stringify(artifact),/sourcePath|snapshotPath|storageRef/);
 const results=searchWorkspaces(contextualSource,{query:'qualification report',limit:20});assert.equal(results.items.some(item=>item.kind==='ARTIFACT'),true);
});

test('ordinary estate remains free of empty project repository and artifact controls',()=>{
 const root=listWorkspaceRoots(source),device=projectWorkspace(id('DEVICE','pixel'),source);assert.deepEqual(root.children.map(item=>item.kind),['DEVICE']);assert.equal(device.associations.length,0);assert.equal(device.children.some(item=>['PROJECT','REPOSITORY','ARTIFACT'].includes(item.kind)),false);
});

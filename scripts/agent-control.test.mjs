import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {main} from './agent-control.mjs';

test('package-bin symlink executes the Agent Control command entrypoint', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-bin-'));
  const source = fileURLToPath(new URL('./agent-control.mjs', import.meta.url));
  const command = path.join(root, 'agent-control');
  fs.symlinkSync(source, command);
  const result = spawnSync(command, ['--help'], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /agent-control status \[--json\]/);
});

test('package-bin reports the installed Agent Control version', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-version-bin-'));
  const source = fileURLToPath(new URL('./agent-control.mjs', import.meta.url));
  const command = path.join(root, 'agent-control');
  fs.symlinkSync(source, command);
  const result = spawnSync(command, ['--version'], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  const packageVersion = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')).version;
  assert.equal(result.stdout.trim(), `agent-control ${packageVersion}`);
});

test('Jobs CLI reads definitions and sends authenticated schema-valid create requests',async()=>{
  const originalFetch=globalThis.fetch,originalUrl=process.env.AGENT_CONTROL_WEB_URL,originalToken=process.env.AGENT_CONTROL_WEB_OPERATOR_TOKEN,requests=[];
  process.env.AGENT_CONTROL_WEB_URL='http://127.0.0.1:4310';process.env.AGENT_CONTROL_WEB_OPERATOR_TOKEN='fixture-token';
  globalThis.fetch=async(input,init={})=>{requests.push({url:String(input),init});return new Response(JSON.stringify(init.method==='POST'?{id:'example-review'}:[{id:'repository-code-review'}]),{status:init.method==='POST'?201:200,headers:{'content-type':'application/json'}})};
  const output=[],errors=[];
  try{
    assert.equal(await main(['jobs','definitions'],{out:value=>output.push(value),error:value=>errors.push(value)}),0);
    assert.match(output[0],/repository-code-review/);
    assert.equal(await main(['jobs','create','--definition','repository-code-review','--name','Example Review','--node','controller','--repository','/srv/repositories/example','--schedule','0 2 * * *'],{out:value=>output.push(value),error:value=>errors.push(value)}),0);
    const create=requests[1];assert.equal(create.init.method,'POST');assert.equal(create.init.headers.Authorization,'Bearer fixture-token');const body=JSON.parse(create.init.body);assert.equal(body.routing.modelRole,'review.default');assert.equal(body.budgets.maximumOutputTokens,65536);assert.equal(body.schedule.timezone,'Europe/London');assert.equal(body.actor,'cli-operator');assert.deepEqual(errors,[]);
  }finally{globalThis.fetch=originalFetch;if(originalUrl===undefined)delete process.env.AGENT_CONTROL_WEB_URL;else process.env.AGENT_CONTROL_WEB_URL=originalUrl;if(originalToken===undefined)delete process.env.AGENT_CONTROL_WEB_OPERATOR_TOKEN;else process.env.AGENT_CONTROL_WEB_OPERATOR_TOKEN=originalToken;}
});

test('Workspace CLI opens the same authenticated read-only projection by workspace or run',async()=>{
  const originalFetch=globalThis.fetch,originalUrl=process.env.AGENT_CONTROL_WEB_URL,originalToken=process.env.AGENT_CONTROL_WEB_OPERATOR_TOKEN,requests=[];
  process.env.AGENT_CONTROL_WEB_URL='https://agent-control.example.invalid';process.env.AGENT_CONTROL_WEB_OPERATOR_TOKEN='fixture-token';
  globalThis.fetch=async(input,init={})=>{requests.push({url:String(input),init});return new Response(JSON.stringify({schema:'agent-control.navigable-workspace/v1',id:String(input).split('/').at(-1),label:'Recorded run',mode:'HISTORICAL',status:'SUCCEEDED',breadcrumbs:[{label:'Estate'},{label:'Pixel'},{label:'Recorded run'}],children:[],capabilities:[{id:'EVIDENCE',state:'AVAILABLE'}],targets:{dashboard:'?view=runtime-map&parcelId=run-one',history:'/api/observability/runs/run-one'}}),{status:200,headers:{'content-type':'application/json'}})};
  const output=[],errors=[];
  try{assert.equal(await main(['open','job','run-one','--json'],{out:value=>output.push(value),error:value=>errors.push(value)}),0);assert.equal(requests[0].init.headers.Authorization,'Bearer fixture-token');assert.match(decodeURIComponent(requests[0].url),/\/api\/workspaces\/acw1\.RUN\./);assert.doesNotMatch(requests[0].url,/fixture-token/);assert.match(output[0],/Recorded run/);assert.deepEqual(errors,[]);}finally{globalThis.fetch=originalFetch;if(originalUrl===undefined)delete process.env.AGENT_CONTROL_WEB_URL;else process.env.AGENT_CONTROL_WEB_URL=originalUrl;if(originalToken===undefined)delete process.env.AGENT_CONTROL_WEB_OPERATOR_TOKEN;else process.env.AGENT_CONTROL_WEB_OPERATOR_TOKEN=originalToken;}
});

test('Routing explain CLI submits an authenticated dry-run description without an inference endpoint',async()=>{
  const originalFetch=globalThis.fetch,originalUrl=process.env.AGENT_CONTROL_WEB_URL,originalToken=process.env.AGENT_CONTROL_WEB_OPERATOR_TOKEN,requests=[];process.env.AGENT_CONTROL_WEB_URL='http://127.0.0.1:4310';process.env.AGENT_CONTROL_WEB_OPERATOR_TOKEN='fixture-token';globalThis.fetch=async(input,init={})=>{requests.push({url:String(input),init});return new Response(JSON.stringify({decision:'PROCEED',externalRequestMade:false}),{status:200,headers:{'content-type':'application/json'}})};const output=[],errors=[];
  try{assert.equal(await main(['routing','explain','--policy','fast-capped','--provider','openrouter','--model','model','--input-tokens','1000','--output-tokens','500','--job-spent','0.25'],{out:value=>output.push(value),error:value=>errors.push(value)}),0);assert.match(requests[0].url,/\/api\/routing\/cost-performance\/explain$/);assert.equal(requests[0].init.headers.Authorization,'Bearer fixture-token');assert.deepEqual(JSON.parse(requests[0].init.body),{strategy:'fast-capped',providerId:'openrouter',modelId:'model',inputTokensEstimated:1000,outputTokensRequested:500,jobSpentUsd:.25,actor:'cli-operator'});assert.match(output[0],/externalRequestMade/);assert.deepEqual(errors,[]);}finally{globalThis.fetch=originalFetch;if(originalUrl===undefined)delete process.env.AGENT_CONTROL_WEB_URL;else process.env.AGENT_CONTROL_WEB_URL=originalUrl;if(originalToken===undefined)delete process.env.AGENT_CONTROL_WEB_OPERATOR_TOKEN;else process.env.AGENT_CONTROL_WEB_OPERATOR_TOKEN=originalToken;}
});

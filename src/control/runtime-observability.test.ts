import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {ContractExecutionRuntime} from './contract-runtime.js';
import {GovernedHandoffRuntime} from './handoff-runtime.js';
import {ProviderModelLifecycleRegistry} from './provider-lifecycle.js';
import {RuntimeObservability} from './runtime-observability.js';

test('runtime projection combines ACP contracts handoffs and model lifecycle without payloads or credentials', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-control-runtime-observability-')),acpDirectory=path.join(root,'acp');fs.mkdirSync(acpDirectory);
  fs.writeFileSync(path.join(acpDirectory,'operator.sessions.json'),JSON.stringify({schema:'agent-control.acp-sessions/v1',sessions:[{acpSessionId:'acp:one',governedSessionId:'session:one',actorId:'human:operator',cwd:'/sensitive/workspace',parcelIds:['parcel:one'],deliveries:{delivery:{promptHash:'hidden',outcome:{parcelId:'parcel:one',status:'RUNNING'}}},createdAt:'2026-09-01T00:00:00Z',updatedAt:'2026-09-01T00:01:00Z',closed:false}]}));
  const contracts=new ContractExecutionRuntime(path.join(root,'contracts.json'),{cancel:()=>undefined,pause:()=>undefined},()=> '2026-09-01T00:00:00Z');
  contracts.create({id:'contract:one',laneId:'lane:one',operatorActorId:'human:operator',objective:'private objective',completionCriteria:['pass'],authority:['review'],active:{actorId:'agent:one',agentId:'agent:one',modelId:'model:one',providerId:'provider:one',runtimeId:'runtime:one',nodeId:'node:one'},baton:{privateContext:'must not project'},process:{id:'process:one'},ptyId:'pty:one',permissions:{capabilities:['review'],filesystem:'none',network:'provider-only',production:false}});
  contracts.attach('contract:one',{actorId:'agent:one',kind:'agent'},'write');
  const handoffs=new GovernedHandoffRuntime(contracts,path.join(root,'handoffs.json'),()=> '2026-09-01T00:00:00Z');
  await handoffs.request({outcome:'YIELD',policy:'AUTO',contractId:'contract:one',sourceActorId:'agent:one',sourceAgentId:'agent:one',reason:'bounded yield',baton:{checkpoint:'hash only'},requestedAuthority:['review'],budget:{}});
  const lifecycle=new ProviderModelLifecycleRegistry(path.join(root,'lifecycle.json'),()=> '2026-09-01T00:00:00Z');
  lifecycle.registerProvider({id:'provider:one',kind:'openai-compatible',endpoint:'https://models.example/v1',credentialRef:'env:MODEL_PROVIDER_KEY'});
  lifecycle.registerRecipe({id:'recipe:one',version:'1',providerId:'provider:one',providerModel:'vendor/model-one',modelVersion:'2026-09',capabilities:['review'],toolSupport:[],nodeRequirements:['review-node'],runtimeRequirements:['responses']});
  const runtime=new RuntimeObservability({contracts,handoffs,providerLifecycle:lifecycle,acpSessionDirectory:acpDirectory,remoteAcp:{enabled:true,authenticationConfigured:true,loopback:true},clock:()=> '2026-09-01T00:02:00Z'}),projection=runtime.snapshot();
  assert.equal(projection.acp.sessions[0].deliveryCount,1);assert.equal('cwd' in projection.acp.sessions[0],false);
  assert.equal(projection.contracts[0].pty.writeOwner,null);assert.equal(projection.contracts[0].process.state,'PAUSED');assert.equal('objective' in projection.contracts[0],false);assert.equal('payload' in projection.contracts[0].baton,false);
  assert.equal(projection.handoffs[0].outcome,'YIELD');assert.equal('request' in projection.handoffs[0],false);
  assert.equal(projection.providerLifecycle.providers[0].credentialReference,'indirect');assert.equal(JSON.stringify(projection).includes('MODEL_PROVIDER_KEY'),false);
  assert.deepEqual(runtime.systems().filter(item=>item.type==='transport').map(item=>item.id),['transport:acp-stdio','transport:acp-remote']);
  assert.equal(runtime.systems().find(item=>item.type==='model')?.execution,'UNKNOWN');
});

test('runtime projection reports missing telemetry as absent or unknown rather than zero', () => {
  const projection=new RuntimeObservability({clock:()=> '2026-09-01T00:00:00Z'}).snapshot();
  assert.deepEqual(projection.contracts,[]);assert.deepEqual(projection.handoffs,[]);assert.deepEqual(projection.acp.sessions,[]);
  const remote=projection.acp.transports.find(item=>item.id==='acp-remote');assert.equal(remote?.enabled,false);assert.equal(remote?.connection,'disabled');
});

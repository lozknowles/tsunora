import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {ProviderModelLifecycleRegistry, type ModelLifecycleEvidence} from './provider-lifecycle.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-provider-lifecycle-')), file = path.join(root, 'registry.json'), registry = new ProviderModelLifecycleRegistry(file, () => '2026-09-01T22:00:00.000Z');
  registry.registerProvider({id: 'logical-provider', kind: 'openai-compatible', endpoint: 'https://models.example.test/v1', credentialRef: 'env:MODEL_PROVIDER_KEY'});
  registry.recordDiscovery('logical-provider', {capabilities: ['chat-completions', 'tools'], availableModels: ['vendor/model-a', 'vendor/model-b']});
  const recipe = (id: string, model: string) => registry.registerRecipe({id, version: '1.0.0', providerId: 'logical-provider', providerModel: model, modelVersion: '2026-09', capabilities: ['reasoning', 'tools'], contextLimitTokens: 131072, maximumOutputTokens: 16384, toolSupport: ['function-calling'], nodeRequirements: [], runtimeRequirements: ['openai-compatible']});
  recipe('model-a-recipe', 'vendor/model-a'); recipe('model-b-recipe', 'vendor/model-b');
  return {root, file, registry};
}

function evidence(registry: ProviderModelLifecycleRegistry, recipeId: string, kind: ModelLifecycleEvidence['kind'], suffix = kind) { return registry.addEvidence({id: `evidence:${recipeId}:${suffix}`, recipeId, kind, verified: true, sampleSize: 50, successRate: .98, latencyMs: 500, costPerVerifiedOutcome: null, references: [`artifact:${suffix}`]}); }
async function advance(registry: ProviderModelLifecycleRegistry, key: string, target: 'SHADOW' | 'CANDIDATE' | 'ACTIVE' | 'PREFERRED') {
  registry.transition(key, 'BENCHMARKING', {reason: 'frozen benchmark started'}); const benchmark = evidence(registry,key,'benchmark'); registry.transition(key,'SHADOW',{evidenceId:benchmark.id,reason:'benchmark threshold passed'}); if(target==='SHADOW')return;
  const shadow=evidence(registry,key,'shadow');registry.transition(key,'CANDIDATE',{evidenceId:shadow.id,reason:'shadow replay passed'});if(target==='CANDIDATE')return;
  const candidate=evidence(registry,key,'candidate');registry.transition(key,'ACTIVE',{evidenceId:candidate.id,reason:'candidate qualification passed'});if(target==='ACTIVE')return;
  const comparison=evidence(registry,key,'comparison');registry.transition(key,'PREFERRED',{evidenceId:comparison.id,reason:'champion comparison passed'});
}

test('provider discovery is durable and session-neutral with indirect credentials only', () => {
  const value=fixture(), provider=value.registry.provider('logical-provider');assert.equal(provider.credentialRef,'env:MODEL_PROVIDER_KEY');assert.deepEqual(provider.availableModels,['vendor/model-a','vendor/model-b']);assert.equal('sessionId' in provider,false);
  const recovered=new ProviderModelLifecycleRegistry(value.file).provider('logical-provider');assert.deepEqual(recovered,provider);
  assert.throws(()=>value.registry.registerProvider({id:'bad',kind:'openai-compatible',endpoint:'https://models.example.test',credentialRef:'literal-secret'}),/credential_reference_invalid/);
  assert.throws(()=>value.registry.registerProvider({id:'clear',kind:'local',endpoint:'http://192.0.2.10:8080'}),/cleartext_endpoint_denied/);
});

test('model recipes are immutable exact provider/model/version identities', () => {
  const {registry}=fixture(), recipe=registry.recipe('model-a-recipe@1.0.0');assert.equal(recipe.providerModel,'vendor/model-a');assert.equal(recipe.modelVersion,'2026-09');assert.equal(recipe.fingerprint.length,64);
  assert.throws(()=>registry.registerRecipe({...recipe,providerModel:'vendor/changed'}),/model_recipe_immutable/);
});

test('lifecycle requires exact ordered transitions and verified evidence', async () => {
  const {registry}=fixture(), key='model-a-recipe@1.0.0';assert.throws(()=>registry.transition(key,'ACTIVE',{reason:'skip'}),/transition_invalid/);registry.transition(key,'BENCHMARKING',{reason:'start'});assert.throws(()=>registry.transition(key,'SHADOW',{reason:'no evidence'}),/evidence_required/);
  const benchmark=evidence(registry,key,'benchmark');registry.transition(key,'SHADOW',{evidenceId:benchmark.id,reason:'pass'});const shadow=evidence(registry,key,'shadow');registry.transition(key,'CANDIDATE',{evidenceId:shadow.id,reason:'pass'});const candidate=evidence(registry,key,'candidate');registry.transition(key,'ACTIVE',{evidenceId:candidate.id,reason:'pass'});const comparison=evidence(registry,key,'comparison');registry.transition(key,'PREFERRED',{evidenceId:comparison.id,reason:'pass'});assert.equal(registry.lifecycleState(key).state,'PREFERRED');registry.transition(key,'DEPRECATED',{evidenceId:comparison.id,reason:'upstream replacement'});assert.equal(registry.lifecycleState(key).state,'DEPRECATED');
});

test('versioned champion/challenger policy routes only qualified recipes', async () => {
  const {registry}=fixture();await advance(registry,'model-a-recipe@1.0.0','ACTIVE');await advance(registry,'model-b-recipe@1.0.0','SHADOW');
  const policy=registry.publishPolicy({id:'default-routing',createdBy:'human:operator',reason:'qualified champion with shadow challenger',roles:{'work.standard':{champion:'model-a-recipe@1.0.0',challengers:['model-b-recipe@1.0.0'],mode:'shadow',requirements:['reasoning']}}});assert.equal(policy.version,1);const route=registry.route('work.standard');assert.equal(route.champion.id,'model-a-recipe');assert.equal(route.challengers[0].id,'model-b-recipe');assert.equal(route.policy.version,1);
});

test('historical replay recommends by verified outcome without changing policy', async () => {
  const {registry}=fixture();await advance(registry,'model-a-recipe@1.0.0','ACTIVE');await advance(registry,'model-b-recipe@1.0.0','CANDIDATE');registry.publishPolicy({id:'default-routing',createdBy:'human:operator',reason:'replay',roles:{review:{champion:'model-a-recipe@1.0.0',challengers:['model-b-recipe@1.0.0'],mode:'candidate',requirements:[]}}});
  const replay=registry.historicalReplay('review',[{recipeId:'model-a-recipe@1.0.0',verified:true,latencyMs:900,cost:1},{recipeId:'model-a-recipe@1.0.0',verified:false,latencyMs:700,cost:1},{recipeId:'model-b-recipe@1.0.0',verified:true,latencyMs:500,cost:null},{recipeId:'model-b-recipe@1.0.0',verified:true,latencyMs:550,cost:null}]);assert.equal(replay.recommendation,'model-b-recipe@1.0.0');assert.equal(registry.route('review').champion.id,'model-a-recipe');assert.equal(replay.scored.find(item=>item.recipeId==='model-b-recipe@1.0.0')?.averageCost,null);
});

test('routing rollback requires verified evidence and selects an immutable prior policy', async () => {
  const {registry,file}=fixture();await advance(registry,'model-a-recipe@1.0.0','ACTIVE');await advance(registry,'model-b-recipe@1.0.0','ACTIVE');const roles=(champion:string)=>({review:{champion,challengers:[],mode:'manual' as const,requirements:[]}});registry.publishPolicy({id:'routing',roles:roles('model-a-recipe@1.0.0'),createdBy:'human:operator',reason:'v1'});registry.publishPolicy({id:'routing',roles:roles('model-b-recipe@1.0.0'),createdBy:'human:operator',reason:'v2'});assert.equal(registry.route('review').champion.id,'model-b-recipe');assert.throws(()=>registry.rollbackPolicy('routing',1,'human:operator','missing'),/rollback_evidence_required/);
  const rollback=evidence(registry,'model-a-recipe@1.0.0','rollback');registry.rollbackPolicy('routing',1,'human:operator',rollback.id);assert.equal(registry.route('review').champion.id,'model-a-recipe');assert.equal(new ProviderModelLifecycleRegistry(file).route('review').policy.version,1);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {ConfigurationStore, ConfigurationStoreError} from './configuration-store.js';

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-configuration-')), file = path.join(root, 'config.json');
  fs.writeFileSync(file, JSON.stringify({schemaVersion: 1, resources: [], providers: [], services: [], lanes: [{id: 1, name: 'Primary'}]}));
  return {root, file, store: new ConfigurationStore(file)};
}

test('configuration store adds and edits a system without dropping unrelated configuration', t => {
  const {root, file, store} = setup(); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const created = store.upsert({revision: store.read().revision, kind: 'resource', item: {id: 'remote-host', name: 'Remote host', platform: 'linux', transport: {type: 'ssh', host: 'remote-host', user: 'operator'}, capabilities: ['system.inspect']}});
  assert.equal(created.restartRequired, true); assert.equal(created.resources[0].id, 'remote-host');
  const updated = store.upsert({revision: created.revision, kind: 'resource', originalId: 'remote-host', item: {...created.resources[0], name: 'Remote archive'}});
  assert.equal(updated.resources[0].name, 'Remote archive'); assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).lanes[0].name, 'Primary');
});

test('configuration store rejects stale edits and secret material', t => {
  const {root, store} = setup(); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const initial = store.read();
  store.upsert({revision: initial.revision, kind: 'service', item: {id: 'bridge', healthUrl: 'https://bridge.example/health'}});
  assert.throws(() => store.upsert({revision: initial.revision, kind: 'service', item: {id: 'stale', healthUrl: 'https://stale.example/health'}}), (error: unknown) => error instanceof ConfigurationStoreError && error.status === 409);
  const current = store.read();
  assert.throws(() => store.upsert({revision: current.revision, kind: 'provider', item: {id: 'unsafe', kind: 'responses', apiKey: 'plaintext'}}), /secret_material_forbidden/);
});

test('configuration store updates model routes atomically without restart', t => {
  const {root, store} = setup(); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const provider = store.upsert({revision: store.read().revision, kind: 'provider', item: {id: 'external', kind: 'openai-compatible', baseUrl: 'https://models.example/v1', auth: {type: 'bearer-env', env: 'EXTERNAL_API_KEY'}}});
  const model = store.upsert({revision: provider.revision, kind: 'model', item: {id: 'fast', provider: 'external', providerModel: 'vendor/fast', capabilities: ['coding'], qualification: {state: 'UNTESTED'}}});
  const routed = store.updateModelRouting({revision: model.revision, modelRouting: {defaultRole: 'coding.fast', roles: {'coding.fast': {primary: 'fast'}}}});
  assert.equal(routed.restartRequired, false); assert.equal(routed.modelRouting.defaultRole, 'coding.fast'); assert.equal(routed.modelRouting.roles['coding.fast'].primary, 'fast');
});

test('configuration store updates the optional Spark lane without weakening limits', t => {
  const {root, store} = setup(); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const updated = store.updateSpark({revision: store.read().revision, spark: {enabled: false, model: 'gpt-5.3-codex-spark', modelRole: 'fast-execution', maximumFiles: 1, maximumChangedLines: 80, maximumAttempts: 1, maximumSubagents: 0, maximumContextTokens: 2048, verificationRequired: true}});
  assert.equal(updated.spark?.model, 'gpt-5.3-codex-spark'); assert.equal(updated.restartRequired, true);
  assert.throws(() => store.updateSpark({revision: updated.revision, spark: {enabled: true, maximumAttempts: 3}}), /spark_maximum_attempts/);
});

test('configuration store persists the adaptive orchestration policy with nullable ceilings', t => {
  const {root, store} = setup(); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const updated = store.updateAdaptiveOrchestration({revision: store.read().revision, adaptiveOrchestration: {enabled: true, minimumSamplesForPreference: 3, minimumQualityScore: .7, maxEvidenceAgeDays: 90, policyQualityFloor: .6, maxRouteCost: null, maxRouteLatencyMs: null, qualityWeight: .5, reliabilityWeight: .2, costWeight: .15, latencyWeight: .1, confidenceWeight: .05, explorationRate: .1}});
  assert.equal(updated.restartRequired, true);
  assert.equal(updated.adaptiveOrchestration?.enabled, true);
  assert.equal(updated.adaptiveOrchestration?.maxRouteCost, null);
  assert.deepEqual(new ConfigurationStore(store.file).read().adaptiveOrchestration, updated.adaptiveOrchestration);
});

test('configuration store persists the Warm Expert policy through the existing revision gate', t => {
  const {root, store} = setup(); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const policy={enabled:true,hotMinutes:10,warmMinutes:60,expiryMinutes:240,hotReuseRatio:.7,minimumReuseRatio:.25,highCompatibilityMaximumDelta:.25,partialCompatibilityMaximumDelta:.6,maximumScoreBonus:.15,allowDerivedPreference:false};
  const updated=store.updateCacheAwareExperts({revision:store.read().revision,cacheAwareExperts:policy});
  assert.equal(updated.restartRequired,true);assert.deepEqual(updated.cacheAwareExperts,policy);assert.deepEqual(new ConfigurationStore(store.file).read().cacheAwareExperts,policy);
  assert.throws(()=>store.updateCacheAwareExperts({revision:updated.revision,cacheAwareExperts:{...policy,warmMinutes:5}}),/invalid_cache_aware_experts_lifecycle_order/);
});

test('configuration store persists deterministic skill policy through the revision gate',t=>{
  const{root,store}=setup();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const policy={enabled:true,routingEnabled:false,minimumDistinctParcels:3,maximumValidationAgeDays:90},updated=store.updateDeterministicSkills({revision:store.read().revision,deterministicSkills:policy});assert.equal(updated.restartRequired,true);assert.deepEqual(updated.deterministicSkills,policy);assert.deepEqual(new ConfigurationStore(store.file).read().deterministicSkills,policy);
});

test('cost routing changes are hash-bound and authority raises require an explicit reason',t=>{
  const{root,store}=setup();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const policy=(input:number,output:number,job:number)=>({schema:'agent-control.cost-performance-routing-policy/v1' as const,id:'estate-cost-policy',strategy:'custom' as const,optimization:'price' as const,rateCeilingUsdPerMillionTokens:{input,output},budget:{invocationUsd:job/10,jobUsd:job},tokenCeiling:{output:1000},fallback:{enabled:true,onNoEligibleRoute:'block' as const,crossModel:false}});
  const initial=store.previewEstateCostPerformanceRouting({revision:store.read().revision,policy:policy(1,2,2)});assert.equal(initial.requiresApproval,false);
  const configured=store.updateEstateCostPerformanceRouting({revision:initial.revision,policy:initial.proposed,proposalSha256:initial.proposalSha256,actor:'web-operator'});assert.equal(configured.approval,null);assert.equal(configured.costPerformanceRouting?.estate?.budget?.jobUsd,2);
  const raised=store.previewEstateCostPerformanceRouting({revision:configured.revision,policy:policy(2,4,5)});assert.equal(raised.requiresApproval,true);
  assert.throws(()=>store.updateEstateCostPerformanceRouting({revision:raised.revision,policy:raised.proposed,proposalSha256:raised.proposalSha256,actor:'web-operator'}),error=>error instanceof ConfigurationStoreError&&error.status===403);
  assert.throws(()=>store.updateEstateCostPerformanceRouting({revision:raised.revision,policy:raised.proposed,proposalSha256:'0'.repeat(64),approvalReason:'Reviewed higher limits',actor:'web-operator'}),error=>error instanceof ConfigurationStoreError&&error.status===409);
  const approved=store.updateEstateCostPerformanceRouting({revision:raised.revision,policy:raised.proposed,proposalSha256:raised.proposalSha256,approvalReason:'Reviewed higher limits for the bounded workload',actor:'web-operator'});assert.equal(approved.approval?.approvalId,`routing-policy:${raised.proposalSha256}`);assert.equal(approved.costPerformanceRouting?.estate?.budget?.jobUsd,5);
});

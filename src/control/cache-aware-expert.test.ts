import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {CacheAwareExpertRuntime, FileCacheExpertStore, verifyCacheExpertDecision, type CacheContextIdentity, type CacheExpertCandidate, type CacheRouteIdentity} from './cache-aware-expert.js';

const route = (modelId: string, overrides: Partial<CacheRouteIdentity> = {}): CacheRouteIdentity => ({workerId: `worker-${modelId}`, providerId: 'local-llama', modelId, nodeId: 'controller', sessionId: `session-${modelId}`, cacheScopeId: `slot-${modelId}`, backendInstanceId: `process-${modelId}`, ...overrides});
const context = (overrides: Partial<CacheContextIdentity> = {}): CacheContextIdentity => ({repositoryRef: 'agent-control@abc', repositoryIdentitySha256: 'repo-abc', immutableContextSha256: 'bundle-abc', promptPrefixSha256: 'prefix-abc', transportContextSha256: 'transport-abc', contextTags: ['repository:agent-control', 'task:typescript', 'symbol:router'], estimatedTokens: 1000, ...overrides});
const candidate = (modelId: string, baseScore = .8, overrides: Partial<CacheExpertCandidate> = {}): CacheExpertCandidate => ({route: route(modelId), eligible: true, capabilityQualified: true, integrityQualified: true, health: 'healthy', baseScore, reasons: [], ...overrides});
function warm(runtime: CacheAwareExpertRuntime, modelId = 'warm', at = '2026-09-09T10:00:00.000Z', overrides: Partial<Parameters<CacheAwareExpertRuntime['observe']>[0]> = {}) {
  return runtime.observe({invocationId: `inv-${modelId}-${at}`, route: route(modelId), context: context(), cacheEvidence: {reusedTokens: 900, processedPromptTokens: 100, cacheWriteTokens: null, promptProcessingMs: 10, generationMs: 20, authority: 'authoritative', source: 'llama.cpp.timings'}, observedAt: at, taskClass: 'coding', capabilities: ['model.execute','repository.mutation'], outcome: 'COMPLETE', verifierResult: 'PASS', health: 'healthy', ...overrides});
}

test('verified authoritative invocation creates a durable HOT Warm Expert without raw context', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-expert-')), file = path.join(root, 'experts.json'), clock = () => '2026-09-09T10:01:00.000Z';
  const runtime = new CacheAwareExpertRuntime(new FileCacheExpertStore(file), {}, clock), record = warm(runtime);
  assert.equal(record.state, 'HOT'); assert.equal(record.cache.reuseRatio, .9); assert.equal(record.cache.authority, 'AUTHORITATIVE'); assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /prompt content|secret/i);
  assert.equal(new CacheAwareExpertRuntime(new FileCacheExpertStore(file), {}, clock).records()[0].id, record.id);
});

test('lifecycle decays HOT to WARM, COOLING and EXPIRED using policy time', () => {
  let now = '2026-09-09T10:01:00.000Z'; const runtime = new CacheAwareExpertRuntime(new FileCacheExpertStore(), {hotMinutes: 5, warmMinutes: 20, expiryMinutes: 40}, () => now); warm(runtime);
  assert.equal(runtime.records()[0].state, 'HOT'); now = '2026-09-09T10:10:00.000Z'; assert.equal(runtime.records()[0].state, 'WARM'); now = '2026-09-09T10:30:00.000Z'; assert.equal(runtime.records()[0].state, 'COOLING'); now = '2026-09-09T11:00:00.000Z'; assert.equal(runtime.records()[0].state, 'EXPIRED');
});

test('unavailable cache telemetry is displayed as unknown and never as zero reuse', () => {
  const runtime=new CacheAwareExpertRuntime(new FileCacheExpertStore(),{},()=> '2026-09-09T10:01:00.000Z');
  warm(runtime,'opaque','2026-09-09T10:00:00.000Z',{cacheEvidence:undefined,evidenceAuthority:'UNAVAILABLE'});
  const record=runtime.records()[0],decision=runtime.assess({parcelId:'p',stageId:'s',context:context(),candidates:[candidate('opaque')]});
  assert.equal(record.state,'CACHE STATE UNKNOWN');assert.equal(record.cache.reusedTokens,null);assert.equal(decision.candidates[0].state,'CACHE STATE UNKNOWN');assert.equal(decision.candidates[0].cacheScore,0);
});

test('session, backend and transport changes prevent unsafe reuse and explicit restart invalidates', () => {
  const runtime = new CacheAwareExpertRuntime(new FileCacheExpertStore(), {}, () => '2026-09-09T10:01:00.000Z'); warm(runtime);
  const changedSession = runtime.assess({parcelId:'p1',stageId:'s1',context:context(),candidates:[candidate('warm',.8,{route:route('warm',{sessionId:'new-session'})})]});
  assert.equal(changedSession.candidates[0].cacheScore, 0); assert.equal(changedSession.candidates[0].evidenceAuthority, 'UNAVAILABLE');
  assert.equal(runtime.invalidate({backendInstanceId:'process-warm',reason:'backend-restarted'}),1);
  warm(runtime);
  const restarted = runtime.assess({parcelId:'p2',stageId:'s2',context:context(),candidates:[candidate('warm')]}); assert.equal(restarted.candidates[0].state,'INVALIDATED'); assert.equal(restarted.candidates[0].cacheScore,0);
  warm(runtime,'warm','2026-09-09T10:02:00.000Z',{invocationId:'new-post-restart-invocation'});
  assert.equal(runtime.records()[0].state,'HOT');
});

test('provider and model route identity isolate warm state', () => {
  const runtime = new CacheAwareExpertRuntime(new FileCacheExpertStore(), {}, () => '2026-09-09T10:01:00.000Z'); warm(runtime);
  const result = runtime.assess({parcelId:'p',stageId:'s',context:context(),candidates:[candidate('other',.8),candidate('warm',.79,{route:route('warm',{providerId:'different-provider'})})]});
  assert.ok(result.candidates.every(item => item.cacheScore === 0));
});

test('EXACT and HIGH authoritative warmth can win while PARTIAL and unavailable evidence cannot', () => {
  const runtime = new CacheAwareExpertRuntime(new FileCacheExpertStore(), {maximumScoreBonus:.2}, () => '2026-09-09T10:01:00.000Z'); warm(runtime,'warm');
  const exact = runtime.assess({parcelId:'p1',stageId:'s1',context:context(),candidates:[candidate('cold',.9),candidate('warm',.8)]}); assert.equal(exact.selectedRoute?.modelId,'warm'); assert.equal(exact.changedDeclaredRoute,true); assert.equal(exact.verifier.status,'PASS');
  const high = runtime.assess({parcelId:'p2',stageId:'s2',context:context({promptPrefixSha256:'prefix-next'}),candidates:[candidate('cold',.9),candidate('warm',.8)]}); assert.equal(high.candidates.find(item=>item.route.modelId==='warm')?.compatibility,'HIGH');
  const partial = runtime.assess({parcelId:'p3',stageId:'s3',context:context({promptPrefixSha256:'different',immutableContextSha256:'different',contextTags:['repository:agent-control','task:other']}),candidates:[candidate('cold',.9),candidate('warm',.8)]}); assert.equal(partial.selectedRoute?.modelId,'cold');
  const unknown = new CacheAwareExpertRuntime(new FileCacheExpertStore(), {}, () => '2026-09-09T10:01:00.000Z'); warm(unknown,'warm','2026-09-09T10:00:00.000Z',{cacheEvidence:undefined,evidenceAuthority:'UNAVAILABLE'}); const unavailable = unknown.assess({parcelId:'p4',stageId:'s4',context:context(),candidates:[candidate('cold',.9),candidate('warm',.8)]}); assert.equal(unavailable.selectedRoute?.modelId,'cold'); assert.equal(unavailable.candidates.find(item=>item.route.modelId==='warm')?.cacheScore,0);
});

test('derived backend-retention evidence is labelled and requires explicit policy before preference', () => {
  const observe=(runtime:CacheAwareExpertRuntime)=>runtime.observe({invocationId:'cold-population',route:route('warm'),context:context(),cacheEvidence:{reusedTokens:0,processedPromptTokens:1000,cacheWriteTokens:null,promptProcessingMs:30,generationMs:20,authority:'authoritative',source:'llama.cpp.timings',retainedPromptTokens:1000,retentionAuthority:'derived',retentionSource:'qualified-single-slot-cache'},observedAt:'2026-09-09T10:00:00.000Z',taskClass:'coding',capabilities:['coding'],outcome:'COMPLETE',verifierResult:'PASS',health:'healthy'});
  const disabled=new CacheAwareExpertRuntime(new FileCacheExpertStore(),{allowDerivedPreference:false,maximumScoreBonus:.2},()=> '2026-09-09T10:01:00.000Z');observe(disabled);const denied=disabled.assess({parcelId:'p1',stageId:'s1',context:context(),candidates:[candidate('cold',.9),candidate('warm',.8)]});assert.equal(denied.selectedRoute?.modelId,'cold');assert.equal(denied.candidates[1].evidenceAuthority,'DERIVED');
  const enabled=new CacheAwareExpertRuntime(new FileCacheExpertStore(),{allowDerivedPreference:true,maximumScoreBonus:.2},()=> '2026-09-09T10:01:00.000Z');const record=observe(enabled);const selected=enabled.assess({parcelId:'p2',stageId:'s2',context:context(),candidates:[candidate('cold',.9),candidate('warm',.8)]});assert.equal(record.cache.reuseRatio,0);assert.equal(record.cache.expectedReuseRatio,1);assert.equal(selected.selectedRoute?.modelId,'warm');assert.equal(selected.candidates[1].expectedReuseRatio,1);
});

test('task, branch, instruction, tool and governance context changes are incompatible', () => {
  const runtime=new CacheAwareExpertRuntime(new FileCacheExpertStore(),{},()=> '2026-09-09T10:01:00.000Z'),full=context({taskType:'coding',branchStateSha256:'branch-a',dependencyContextSha256:'deps-a',instructionContextSha256:'instructions-a',toolContractSha256:'tools-a',governancePolicySha256:'policy-a'});warm(runtime,'warm','2026-09-09T10:00:00.000Z',{context:full});
  for(const changed of [{taskType:'review'},{branchStateSha256:'branch-b'},{dependencyContextSha256:'deps-b'},{instructionContextSha256:'instructions-b'},{toolContractSha256:'tools-b'},{governancePolicySha256:'policy-b'}]){const result=runtime.assess({parcelId:random(),stageId:random(),context:{...full,...changed},candidates:[candidate('warm')]});assert.equal(result.candidates[0].compatibility,'INCOMPATIBLE');assert.equal(result.candidates[0].cacheScore,0);}
});

test('a completed incompatible invocation invalidates retained context in the same backend scope', () => {
  const runtime=new CacheAwareExpertRuntime(new FileCacheExpertStore(),{},()=> '2026-09-09T10:02:00.000Z');warm(runtime,'warm','2026-09-09T10:00:00.000Z',{context:context({dependencyContextSha256:'deps-old'})});
  warm(runtime,'warm','2026-09-09T10:01:00.000Z',{invocationId:'replacement',context:context({dependencyContextSha256:'deps-new'})});
  warm(runtime,'warm','2026-09-09T10:00:00.000Z',{context:context({dependencyContextSha256:'deps-old'})});
  const records=runtime.records();
  assert.equal(records.length,2);
  assert.equal(records.find(item=>item.context.dependencyContextSha256==='deps-old')?.state,'INVALIDATED');
  assert.equal(records.find(item=>item.context.dependencyContextSha256==='deps-old')?.invalidationReason,'intervening-incompatible-context');
  assert.equal(records.find(item=>item.context.dependencyContextSha256==='deps-new')?.state,'HOT');
});

test('explicit incompatible route does not claim Warm Expert selection and final verification updates task history', () => {
  const runtime=new CacheAwareExpertRuntime(new FileCacheExpertStore(),{},()=> '2026-09-09T10:02:00.000Z');
  warm(runtime,'warm','2026-09-09T10:00:00.000Z');
  const decision=runtime.assess({parcelId:'parcel',stageId:'explicit-incompatible',context:context({repositoryIdentitySha256:'different-repository'}),candidates:[candidate('warm')]});
  assert.equal(decision.candidates[0].compatibility,'INCOMPATIBLE'); assert.equal(decision.candidates[0].cacheScore,0); assert.equal(decision.selectedExpertId,null);
  const confirmed=runtime.confirmSelection(decision.id,route('warm'),'Explicit governed route retained'); assert.equal(confirmed.selectedExpertId,null);
  warm(runtime,'verified-later','2026-09-09T10:01:00.000Z',{invocationId:'same-invocation',verifierResult:'UNKNOWN'});
  warm(runtime,'verified-later','2026-09-09T10:01:00.000Z',{invocationId:'same-invocation',verifierResult:'PASS'});
  assert.equal(runtime.records().find(item=>item.route.modelId==='verified-later')?.taskHistory[0].verifierResult,'PASS');
});

test('capability, integrity, health and base governance outrank cache warmth', () => {
  const runtime = new CacheAwareExpertRuntime(new FileCacheExpertStore(), {maximumScoreBonus:1}, () => '2026-09-09T10:01:00.000Z'); warm(runtime);
  for (const broken of [{capabilityQualified:false},{integrityQualified:false},{health:'degraded' as const},{eligible:false}]) {
    const result = runtime.assess({parcelId:random(),stageId:random(),context:context(),candidates:[candidate('cold',.1),candidate('warm',.99,broken)]}); assert.equal(result.selectedRoute?.modelId,'cold'); assert.equal(result.verifier.status,'PASS');
  }
});

test('stale warmth and current load can make an otherwise warm route lose', () => {
  const stale=new CacheAwareExpertRuntime(new FileCacheExpertStore(),{hotMinutes:1,warmMinutes:2,expiryMinutes:3,maximumScoreBonus:.2},()=> '2026-09-09T10:04:00.000Z');warm(stale);
  const expired=stale.assess({parcelId:'p1',stageId:'s1',context:context(),candidates:[candidate('cold',.9),candidate('warm',.8)]});assert.equal(expired.selectedRoute?.modelId,'cold');assert.equal(expired.candidates[1].state,'EXPIRED');
  const loaded=new CacheAwareExpertRuntime(new FileCacheExpertStore(),{maximumScoreBonus:.2},()=> '2026-09-09T10:01:00.000Z');warm(loaded);
  const decision=loaded.assess({parcelId:'p2',stageId:'s2',context:context(),candidates:[candidate('cold',.9,{currentLoadRatio:0}),candidate('warm',.8,{currentLoadRatio:1})]});assert.equal(decision.selectedRoute?.modelId,'cold');assert.equal(decision.candidates[1].loadPenalty,.1);
});

test('authoritative pricing produces bounded prompt economics while missing pricing remains unavailable', () => {
  const runtime=new CacheAwareExpertRuntime(new FileCacheExpertStore(),{},()=> '2026-09-09T10:01:00.000Z');
  const priced=warm(runtime,'priced','2026-09-09T10:00:00.000Z',{pricing:{inputPerMillionTokens:10,cachedInputPerMillionTokens:1,currency:'USD',authority:'AUTHORITATIVE',source:'provider-tariff'}});
  assert.equal(priced.economics.authority,'AUTHORITATIVE');assert.equal(priced.economics.estimatedColdPromptCost,.01);assert.equal(priced.economics.actualWarmPromptCost,.0019);assert.equal(priced.economics.savedPromptCost,.0081);
  assert.equal(warm(runtime,'unpriced').economics.source,'MONETARY SAVING UNAVAILABLE');
});

test('estimated context delta is explicit and material change downgrades compatibility', () => {
  const runtime = new CacheAwareExpertRuntime(new FileCacheExpertStore(), {}, () => '2026-09-09T10:01:00.000Z'); warm(runtime);
  const result = runtime.assess({parcelId:'p',stageId:'s',context:context({promptPrefixSha256:'new',immutableContextSha256:'new',contextTags:['repository:agent-control','task:typescript','symbol:other','file:new']}),candidates:[candidate('warm')]});
  assert.equal(result.candidates[0].compatibility,'PARTIAL'); assert.ok((result.candidates[0].estimatedContextDelta ?? 0) > .25); assert.equal(result.candidates[0].cacheScore,0);
});

test('decision verifier rejects a forged cache preference for an ineligible route', () => {
  const sources=[candidate('warm',.8,{eligible:false})], runtime=new CacheAwareExpertRuntime(new FileCacheExpertStore(),{},()=> '2026-09-09T10:01:00.000Z'); warm(runtime);
  const valid=runtime.assess({parcelId:'p',stageId:'s',context:context(),candidates:sources});
  const forged={...valid,selectedRoute:route('warm'),candidates:[{...valid.candidates[0],eligible:true,cacheScore:.2,compatibility:'EXACT' as const,evidenceAuthority:'AUTHORITATIVE' as const}]};
  const checked=verifyCacheExpertDecision(forged,sources);assert.equal(checked.status,'FAIL');assert.ok(checked.reasons.includes('selected-route-failed-governance'));assert.ok(checked.reasons.some(reason=>reason.startsWith('candidate-score-invalid:')));
});

test('human-readable transcript explains the route change without private reasoning', () => {
  const runtime=new CacheAwareExpertRuntime(new FileCacheExpertStore(),{maximumScoreBonus:.2},()=> '2026-09-09T10:01:00.000Z');warm(runtime);
  const decision=runtime.assess({parcelId:'parcel-transcript',stageId:'follow-on',context:context(),candidates:[candidate('cold',.9),candidate('warm',.8)]}),transcript=runtime.humanReadable(decision.id);
  assert.match(transcript,/What Agent Control considered/);assert.match(transcript,/Route changed from declared order: yes/);assert.match(transcript,/context delta 0% \(estimated\)/);assert.match(transcript,/Capability, integrity and governance always outrank cache warmth/);assert.doesNotMatch(transcript,/chain.of.thought|private reasoning/i);
});

function random(){return Math.random().toString(36).slice(2);}

import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {CacheEvidence} from './cache-evidence.js';

export type CacheEvidenceAuthority = 'AUTHORITATIVE' | 'DERIVED' | 'UNAVAILABLE';
export type CacheExpertState = 'HOT' | 'WARM' | 'COOLING' | 'EXPIRED' | 'INVALIDATED';
export type CacheCompatibility = 'EXACT' | 'HIGH' | 'PARTIAL' | 'INCOMPATIBLE' | 'UNKNOWN';

export interface CacheExpertPolicyConfig {
  enabled?: boolean;
  hotMinutes?: number;
  warmMinutes?: number;
  expiryMinutes?: number;
  hotReuseRatio?: number;
  minimumReuseRatio?: number;
  highCompatibilityMaximumDelta?: number;
  partialCompatibilityMaximumDelta?: number;
  maximumScoreBonus?: number;
  allowDerivedPreference?: boolean;
}

export interface CacheExpertPolicy {
  enabled: boolean;
  hotMinutes: number;
  warmMinutes: number;
  expiryMinutes: number;
  hotReuseRatio: number;
  minimumReuseRatio: number;
  highCompatibilityMaximumDelta: number;
  partialCompatibilityMaximumDelta: number;
  maximumScoreBonus: number;
  allowDerivedPreference: boolean;
}

export interface CacheRouteIdentity {
  workerId: string;
  providerId: string;
  modelId: string;
  accountProfileId?: string | null;
  nodeId?: string | null;
  sessionId?: string | null;
  cacheScopeId?: string | null;
  backendInstanceId?: string | null;
}

export interface CacheContextIdentity {
  taskType?: string | null;
  repositoryRef?: string | null;
  repositoryIdentitySha256?: string | null;
  branchStateSha256?: string | null;
  dependencyContextSha256?: string | null;
  instructionContextSha256?: string | null;
  toolContractSha256?: string | null;
  governancePolicySha256?: string | null;
  immutableContextSha256?: string | null;
  promptPrefixSha256?: string | null;
  transportContextSha256?: string | null;
  contextTags?: string[];
  estimatedTokens?: number | null;
}

export interface CacheExpertObservationInput {
  invocationId: string;
  route: CacheRouteIdentity;
  context: CacheContextIdentity;
  cacheEvidence?: CacheEvidence;
  evidenceAuthority?: CacheEvidenceAuthority;
  observedAt: string;
  completedAt?: string;
  taskClass: string;
  capabilities: string[];
  outcome: string;
  verifierResult: 'PASS' | 'FAIL' | 'UNKNOWN';
  health: 'healthy' | 'degraded' | 'offline' | 'unknown';
  evidenceIds?: string[];
  pricing?: {inputPerMillionTokens: number; cachedInputPerMillionTokens: number; currency: string; authority: 'AUTHORITATIVE' | 'UNAVAILABLE'; source: string};
}

export interface CacheExpertRecord {
  schema: 'agent-control.cache-expert/v1';
  id: string;
  route: CacheRouteIdentity;
  context: CacheContextIdentity;
  cache: {
    authority: CacheEvidenceAuthority;
    source: string;
    reusedTokens: number | null;
    processedPromptTokens: number | null;
    cacheWriteTokens: number | null;
    reuseRatio: number | null;
    expectedReuseRatio: number | null;
    retainedPromptTokens: number | null;
  };
  observedAt: string;
  lastUsedAt: string;
  taskClass: string;
  capabilities: string[];
  outcome: string;
  verifierResult: 'PASS' | 'FAIL' | 'UNKNOWN';
  health: CacheExpertObservationInput['health'];
  evidenceIds: string[];
  taskHistory: Array<{invocationId: string; at: string; taskClass: string; outcome: string; verifierResult: 'PASS' | 'FAIL' | 'UNKNOWN'; reusedTokens: number | null; processedPromptTokens: number | null}>;
  economics: {authority: 'AUTHORITATIVE' | 'UNAVAILABLE'; currency: string | null; estimatedColdPromptCost: number | null; actualWarmPromptCost: number | null; savedPromptCost: number | null; percentageSaving: number | null; source: string};
  invalidatedAt: string | null;
  invalidationReason: string | null;
}

export interface CacheExpertCandidate {
  route: CacheRouteIdentity;
  eligible: boolean;
  capabilityQualified: boolean;
  integrityQualified: boolean;
  health: CacheExpertObservationInput['health'];
  baseScore: number;
  currentLoadRatio?: number | null;
  reasons: string[];
}

export interface CacheExpertCandidateAssessment {
  route: CacheRouteIdentity;
  eligible: boolean;
  baseScore: number;
  currentLoadRatio: number | null;
  loadPenalty: number;
  cacheScore: number;
  totalScore: number;
  compatibility: CacheCompatibility;
  estimatedContextDelta: number | null;
  state: CacheExpertState | 'NONE' | 'CACHE STATE UNKNOWN';
  evidenceAuthority: CacheEvidenceAuthority;
  expertId: string | null;
  reasons: string[];
  expectedReuseRatio: number | null;
}

export interface CacheExpertDecision {
  schema: 'agent-control.cache-expert-decision/v1';
  id: string;
  parcelId: string;
  stageId: string;
  createdAt: string;
  context: CacheContextIdentity;
  candidates: CacheExpertCandidateAssessment[];
  selectedRoute: CacheRouteIdentity | null;
  selectedExpertId: string | null;
  selectionAuthority: 'cache-score' | 'higher-order-governance';
  changedDeclaredRoute: boolean;
  reason: string;
  verifier: {status: 'PASS' | 'FAIL'; reasons: string[]};
}

interface Snapshot {schema: 'agent-control.cache-expert-registry/v1'; records: CacheExpertRecord[]; decisions: CacheExpertDecision[];}

const DEFAULT_POLICY: CacheExpertPolicy = Object.freeze({enabled: true, hotMinutes: 10, warmMinutes: 60, expiryMinutes: 240, hotReuseRatio: .7, minimumReuseRatio: .25, highCompatibilityMaximumDelta: .25, partialCompatibilityMaximumDelta: .6, maximumScoreBonus: .15, allowDerivedPreference: false});
const sha256 = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex');
const stableJson = (value: unknown): string => JSON.stringify(sortValue(value));
function sortValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(sortValue); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortValue(item)])); return value; }
function finiteRatio(value: number | null) { return value !== null && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null; }
function routeKey(route: CacheRouteIdentity) { return [route.workerId, route.providerId, route.accountProfileId ?? '', route.modelId, route.nodeId ?? '', route.sessionId ?? '', route.cacheScopeId ?? '', route.backendInstanceId ?? ''].join('\u0000'); }

export class FileCacheExpertStore {
  private snapshot: Snapshot = {schema: 'agent-control.cache-expert-registry/v1', records: [], decisions: []};
  constructor(readonly file?: string) {
    if (!file || !fs.existsSync(file)) return;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Snapshot;
    if (parsed.schema !== 'agent-control.cache-expert-registry/v1' || !Array.isArray(parsed.records) || !Array.isArray(parsed.decisions)) throw new Error('cache_expert_state_invalid');
    this.snapshot = structuredClone(parsed);
  }
  load() { return structuredClone(this.snapshot); }
  save(snapshot: Snapshot) { this.snapshot = structuredClone(snapshot); if (!this.file) return; fs.mkdirSync(path.dirname(this.file), {recursive: true}); const temporary = `${this.file}.${process.pid}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(this.snapshot, null, 2)}\n`, {mode: 0o600}); fs.renameSync(temporary, this.file); }
}

export class CacheAwareExpertRuntime {
  readonly policy: CacheExpertPolicy;
  private snapshot: Snapshot;
  constructor(private readonly store = new FileCacheExpertStore(), config: CacheExpertPolicyConfig = {}, private readonly clock: () => string = () => new Date().toISOString()) {
    this.policy = normalizePolicy(config);
    this.snapshot = store.load();
  }

  observe(input: CacheExpertObservationInput) {
    if (!Number.isFinite(Date.parse(input.observedAt))) throw new Error('cache_expert_timestamp_invalid');
    const normalizedRoute = normalizeRoute(input.route), normalizedContext = normalizeContext(input.context);
    const reused = input.cacheEvidence?.reusedTokens ?? null, processed = input.cacheEvidence?.processedPromptTokens ?? null, retained = input.cacheEvidence?.retainedPromptTokens ?? null, observedAuthority = input.evidenceAuthority ?? authorityFrom(input.cacheEvidence), authority = reused !== null && reused > 0 ? observedAuthority : retained !== null && input.cacheEvidence?.retentionAuthority === 'derived' ? 'DERIVED' : retained !== null && input.cacheEvidence?.retentionAuthority === 'authoritative' ? 'AUTHORITATIVE' : observedAuthority;
    const denominator = reused !== null && processed !== null ? reused + processed : null, reuseRatio = denominator && denominator > 0 ? reused! / denominator : denominator === 0 ? 0 : null;
    const expectedReuseRatio = reuseRatio !== null && reuseRatio > 0 ? reuseRatio : retained !== null && retained > 0 ? 1 : null;
    const id = `expert-${sha256({route: normalizedRoute, context: normalizedContext}).slice(0, 24)}`, existing = this.snapshot.records.find(item => item.id === id), previousHistory = existing?.taskHistory ?? [], replay = previousHistory.some(item => item.invocationId === input.invocationId);
    if (!replay) for (const prior of this.snapshot.records) {
      if (prior.id === id || prior.invalidatedAt || routeKey(prior.route) !== routeKey(normalizedRoute)) continue;
      if (compatibility(prior.context, normalizedContext, this.policy).compatibility === 'INCOMPATIBLE') {
        prior.invalidatedAt = input.observedAt;
        prior.invalidationReason = 'intervening-incompatible-context';
      }
    }
    const observation = {invocationId: input.invocationId, at: input.completedAt ?? input.observedAt, taskClass: input.taskClass, outcome: input.outcome, verifierResult: input.verifierResult, reusedTokens: reused, processedPromptTokens: processed}, taskHistory = (replay ? previousHistory.map(item => item.invocationId === input.invocationId ? observation : item) : [...previousHistory, observation]).slice(-100), economics = cacheEconomics(input.pricing, reused, processed);
    const record: CacheExpertRecord = {schema: 'agent-control.cache-expert/v1', id, route: normalizedRoute, context: normalizedContext, cache: {authority, source: input.cacheEvidence?.retentionSource ?? input.cacheEvidence?.source ?? 'provider-cache-evidence-unavailable', reusedTokens: reused, processedPromptTokens: processed, cacheWriteTokens: input.cacheEvidence?.cacheWriteTokens ?? null, reuseRatio: finiteRatio(reuseRatio), expectedReuseRatio: finiteRatio(expectedReuseRatio), retainedPromptTokens: retained}, observedAt: existing?.observedAt ?? input.observedAt, lastUsedAt: input.completedAt ?? input.observedAt, taskClass: input.taskClass, capabilities: [...new Set([...(existing?.capabilities ?? []),...input.capabilities])].sort(), outcome: input.outcome, verifierResult: input.verifierResult, health: input.health, evidenceIds: [...new Set([...(existing?.evidenceIds ?? []),input.invocationId, ...(input.evidenceIds ?? [])])].sort(), taskHistory, economics, invalidatedAt: replay ? existing?.invalidatedAt ?? null : null, invalidationReason: replay ? existing?.invalidationReason ?? null : null};
    const existingIndex = this.snapshot.records.findIndex(item => item.id === id); if (existingIndex >= 0) this.snapshot.records[existingIndex] = record; else this.snapshot.records.push(record);
    this.persist(); return this.project(record);
  }

  assess(input: {parcelId: string; stageId: string; context: CacheContextIdentity; candidates: CacheExpertCandidate[]}) {
    const at = this.clock(), context = normalizeContext(input.context);
    const assessed = input.candidates.map(candidate => this.assessCandidate(candidate, context, at));
    const eligible = assessed.filter(item => item.eligible).sort((left, right) => right.totalScore - left.totalScore || right.baseScore - left.baseScore || routeKey(left.route).localeCompare(routeKey(right.route)));
    const selected = eligible[0] ?? null, declared = input.candidates.find(item => item.eligible) ?? null;
    const decision: CacheExpertDecision = {schema: 'agent-control.cache-expert-decision/v1', id: `cache-decision-${randomUUID()}`, parcelId: input.parcelId, stageId: input.stageId, createdAt: at, context, candidates: assessed, selectedRoute: selected?.route ?? null, selectedExpertId: selected && selected.cacheScore > 0 ? selected.expertId : null, selectionAuthority: 'cache-score', changedDeclaredRoute: Boolean(selected && declared && routeKey(selected.route) !== routeKey(declared.route)), reason: selected ? selectionReason(selected) : 'No governed eligible route was available; cache affinity made no selection.', verifier: {status: 'PASS', reasons: []}};
    decision.verifier = verifyCacheExpertDecision(decision, input.candidates);
    if (decision.verifier.status === 'FAIL') { decision.selectedRoute = null; decision.selectedExpertId = null; decision.changedDeclaredRoute = false; decision.reason = `Fail closed: ${decision.verifier.reasons.join('; ')}`; }
    this.snapshot.decisions.push(decision); this.persist(); return structuredClone(decision);
  }

  invalidate(input: {providerId?: string; modelId?: string; sessionId?: string; cacheScopeId?: string; backendInstanceId?: string; reason: string; at?: string}) {
    const at = input.at ?? this.clock(); let count = 0;
    for (const record of this.snapshot.records) if (!record.invalidatedAt && (!input.providerId || record.route.providerId === input.providerId) && (!input.modelId || record.route.modelId === input.modelId) && (!input.sessionId || record.route.sessionId === input.sessionId) && (!input.cacheScopeId || record.route.cacheScopeId === input.cacheScopeId) && (!input.backendInstanceId || record.route.backendInstanceId === input.backendInstanceId)) { record.invalidatedAt = at; record.invalidationReason = input.reason; count++; }
    this.persist(); return count;
  }

  records() { return this.snapshot.records.map(record => this.project(record)); }
  decisions() { return structuredClone([...this.snapshot.decisions].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))); }
  decision(id: string) { const found = this.snapshot.decisions.find(item => item.id === id); if (!found) throw new Error('cache_expert_decision_missing'); return structuredClone(found); }
  humanReadable(id: string) { return cacheExpertDecisionTranscript(this.decision(id)); }
  confirmSelection(id: string, route: CacheRouteIdentity, reason: string) {
    const decision = this.snapshot.decisions.find(item => item.id === id); if (!decision) throw new Error('cache_expert_decision_missing');
    const selected = decision.candidates.find(item => routeKey(item.route) === routeKey(route)); if (!selected || !selected.eligible) throw new Error('cache_expert_selection_invalid');
    const highest=decision.candidates.filter(item=>item.eligible).sort((left,right)=>right.totalScore-left.totalScore||right.baseScore-left.baseScore||routeKey(left.route).localeCompare(routeKey(right.route)))[0];
    decision.selectedRoute = normalizeRoute(route); decision.selectedExpertId = selected.cacheScore > 0 ? selected.expertId : null; decision.selectionAuthority = highest && routeKey(highest.route)!==routeKey(selected.route) ? 'higher-order-governance' : 'cache-score'; decision.changedDeclaredRoute = routeKey(selected.route) !== routeKey(decision.candidates.find(item => item.eligible)?.route ?? selected.route); decision.reason = `${reason}; ${selected.cacheScore > 0 ? `Warm Expert ${selected.state}/${selected.compatibility} contributed ${selected.cacheScore.toFixed(4)}.` : 'No cache-affinity bonus contributed.'}`;
    decision.verifier=verifyCacheExpertDecision(decision,decision.candidates.map(item=>({route:item.route,eligible:item.eligible,capabilityQualified:item.eligible,integrityQualified:item.eligible,health:item.eligible?'healthy':'unknown',baseScore:item.baseScore,currentLoadRatio:item.currentLoadRatio,reasons:item.reasons})));
    this.persist(); return structuredClone(decision);
  }

  private assessCandidate(candidate: CacheExpertCandidate, context: CacheContextIdentity, at: string): CacheExpertCandidateAssessment {
    const reasons = [...candidate.reasons];
    if (!candidate.eligible) reasons.push('route-ineligible');
    if (!candidate.capabilityQualified) reasons.push('capability-unproven');
    if (!candidate.integrityQualified) reasons.push('integrity-unproven');
    if (candidate.health !== 'healthy') reasons.push(`health-${candidate.health}`);
    const matches = this.snapshot.records.filter(record => routeKey(record.route) === routeKey(candidate.route)).map(record => ({record, match: compatibility(record.context, context, this.policy), state: stateFor(record, this.policy, at)})).sort((left, right) => compatibilityRank(right.match.compatibility) - compatibilityRank(left.match.compatibility) || stateRank(right.state) - stateRank(left.state) || Date.parse(right.record.lastUsedAt) - Date.parse(left.record.lastUsedAt));
    const best = matches[0], authority = best?.record.cache.authority ?? 'UNAVAILABLE', state = authority === 'UNAVAILABLE' ? 'CACHE STATE UNKNOWN' : best?.state ?? 'NONE', compatible = best && ['EXACT','HIGH'].includes(best.match.compatibility), live = best && ['HOT','WARM'].includes(best.state), verified = best?.record.verifierResult === 'PASS' && best.record.outcome === 'COMPLETE', authorityAllowed = authority === 'AUTHORITATIVE' || (authority === 'DERIVED' && this.policy.allowDerivedPreference), reuse = best?.record.cache.expectedReuseRatio ?? best?.record.cache.reuseRatio ?? null;
    const cacheEligible = this.policy.enabled && compatible && live && verified && authorityAllowed && reuse !== null && reuse >= this.policy.minimumReuseRatio;
    const compatibilityFactor = best?.match.compatibility === 'EXACT' ? 1 : best?.match.compatibility === 'HIGH' ? .75 : 0, stateFactor = best?.state === 'HOT' ? 1 : best?.state === 'WARM' ? .7 : 0, cacheScore = cacheEligible ? this.policy.maximumScoreBonus * compatibilityFactor * stateFactor * (reuse ?? 0) : 0;
    const currentLoadRatio = candidate.currentLoadRatio === null || candidate.currentLoadRatio === undefined || !Number.isFinite(candidate.currentLoadRatio) ? null : Math.max(0, candidate.currentLoadRatio), loadPenalty = currentLoadRatio === null ? 0 : Math.min(.1, currentLoadRatio * .1);
    if (!best) reasons.push('cache-evidence-unavailable');
    else if (!cacheEligible) { if (!compatible) reasons.push(`cache-compatibility-${best.match.compatibility.toLowerCase()}`); if (!live) reasons.push(`cache-state-${best.state.toLowerCase()}`); if (!verified) reasons.push('cache-source-not-independently-verified'); if (!authorityAllowed) reasons.push(`cache-authority-${authority.toLowerCase()}`); if (reuse === null) reasons.push('cache-reuse-unknown'); else if (reuse < this.policy.minimumReuseRatio) reasons.push('cache-reuse-below-policy'); }
    else reasons.push(`warm-expert-${best.match.compatibility.toLowerCase()}-${best.state.toLowerCase()}`);
    const governedEligible = candidate.eligible && candidate.capabilityQualified && candidate.integrityQualified && candidate.health === 'healthy';
    if (currentLoadRatio !== null) reasons.push(`worker-load-${Math.round(currentLoadRatio * 100)}pct`);
    return {route: normalizeRoute(candidate.route), eligible: governedEligible, baseScore: candidate.baseScore, currentLoadRatio, loadPenalty, cacheScore, totalScore: candidate.baseScore + cacheScore - loadPenalty, compatibility: best?.match.compatibility ?? 'UNKNOWN', estimatedContextDelta: best?.match.estimatedContextDelta ?? null, state, evidenceAuthority: authority, expertId: best?.record.id ?? null, reasons: [...new Set(reasons)], expectedReuseRatio: cacheEligible ? reuse : null};
  }

  private project(record: CacheExpertRecord) { return {...structuredClone(record), state: record.cache.authority === 'UNAVAILABLE' ? 'CACHE STATE UNKNOWN' as const : stateFor(record, this.policy, this.clock()), ageSeconds: Math.max(0, (Date.parse(this.clock()) - Date.parse(record.lastUsedAt)) / 1000)}; }
  private persist() { this.store.save(this.snapshot); }
}

export function verifyCacheExpertDecision(decision: CacheExpertDecision, source: CacheExpertCandidate[]): CacheExpertDecision['verifier'] {
  const reasons: string[] = [], selected = decision.selectedRoute ? decision.candidates.find(item => routeKey(item.route) === routeKey(decision.selectedRoute!)) : undefined, original = selected ? source.find(item => routeKey(item.route) === routeKey(selected.route)) : undefined;
  if (decision.selectedRoute && (!selected || !original)) reasons.push('selected-route-not-in-candidate-set');
  if (selected && (!selected.eligible || !original?.eligible || !original.capabilityQualified || !original.integrityQualified || original.health !== 'healthy')) reasons.push('selected-route-failed-governance');
  if (selected?.cacheScore && !['EXACT','HIGH'].includes(selected.compatibility)) reasons.push('unsafe-cache-compatibility-preference');
  if (selected?.cacheScore && !['AUTHORITATIVE','DERIVED'].includes(selected.evidenceAuthority)) reasons.push('cache-preference-without-evidence');
  for (const item of decision.candidates) if (Math.abs(item.totalScore - (item.baseScore + item.cacheScore - item.loadPenalty)) > 1e-9) reasons.push(`candidate-score-invalid:${routeKey(item.route)}`);
  const highest = decision.candidates.filter(item => item.eligible).sort((left, right) => right.totalScore - left.totalScore || right.baseScore - left.baseScore || routeKey(left.route).localeCompare(routeKey(right.route)))[0];
  if (selected && highest && (decision.selectionAuthority ?? 'cache-score') !== 'higher-order-governance' && routeKey(selected.route) !== routeKey(highest.route)) reasons.push('selected-route-not-highest-governed-score');
  return {status: reasons.length ? 'FAIL' : 'PASS', reasons};
}

function normalizePolicy(input: CacheExpertPolicyConfig): CacheExpertPolicy {
  const duration = (value: number | undefined, fallback: number) => value === undefined ? fallback : Number.isFinite(value) && value > 0 ? value : (() => { throw new Error('cache_expert_policy_invalid'); })();
  const ratio = (value: number | undefined, fallback: number) => value === undefined ? fallback : Number.isFinite(value) && value >= 0 && value <= 1 ? value : (() => { throw new Error('cache_expert_policy_invalid'); })();
  const output = {enabled: input.enabled ?? DEFAULT_POLICY.enabled, hotMinutes: duration(input.hotMinutes, DEFAULT_POLICY.hotMinutes), warmMinutes: duration(input.warmMinutes, DEFAULT_POLICY.warmMinutes), expiryMinutes: duration(input.expiryMinutes, DEFAULT_POLICY.expiryMinutes), hotReuseRatio: ratio(input.hotReuseRatio, DEFAULT_POLICY.hotReuseRatio), minimumReuseRatio: ratio(input.minimumReuseRatio, DEFAULT_POLICY.minimumReuseRatio), highCompatibilityMaximumDelta: ratio(input.highCompatibilityMaximumDelta, DEFAULT_POLICY.highCompatibilityMaximumDelta), partialCompatibilityMaximumDelta: ratio(input.partialCompatibilityMaximumDelta, DEFAULT_POLICY.partialCompatibilityMaximumDelta), maximumScoreBonus: ratio(input.maximumScoreBonus, DEFAULT_POLICY.maximumScoreBonus), allowDerivedPreference: input.allowDerivedPreference ?? DEFAULT_POLICY.allowDerivedPreference};
  if (!(output.hotMinutes <= output.warmMinutes && output.warmMinutes <= output.expiryMinutes) || output.highCompatibilityMaximumDelta > output.partialCompatibilityMaximumDelta) throw new Error('cache_expert_policy_order_invalid');
  return Object.freeze(output);
}

function authorityFrom(evidence?: CacheEvidence): CacheEvidenceAuthority { return !evidence || evidence.authority === 'unavailable' ? 'UNAVAILABLE' : 'AUTHORITATIVE'; }
function cacheEconomics(pricing: CacheExpertObservationInput['pricing'], reused: number | null, processed: number | null): CacheExpertRecord['economics'] {
  if (!pricing || pricing.authority !== 'AUTHORITATIVE' || reused === null || processed === null) return {authority:'UNAVAILABLE',currency:null,estimatedColdPromptCost:null,actualWarmPromptCost:null,savedPromptCost:null,percentageSaving:null,source:'MONETARY SAVING UNAVAILABLE'};
  const total=reused+processed,cold=total*pricing.inputPerMillionTokens/1_000_000,warm=processed*pricing.inputPerMillionTokens/1_000_000+reused*pricing.cachedInputPerMillionTokens/1_000_000,saved=cold-warm;
  return {authority:'AUTHORITATIVE',currency:pricing.currency,estimatedColdPromptCost:cold,actualWarmPromptCost:warm,savedPromptCost:saved,percentageSaving:cold? saved/cold:null,source:pricing.source};
}
function normalizeRoute(route: CacheRouteIdentity): CacheRouteIdentity { return {...route, accountProfileId: route.accountProfileId ?? null, nodeId: route.nodeId ?? null, sessionId: route.sessionId ?? null, cacheScopeId: route.cacheScopeId ?? null, backendInstanceId: route.backendInstanceId ?? null}; }
function normalizeContext(context: CacheContextIdentity): CacheContextIdentity { return {...context, taskType: context.taskType ?? null, repositoryRef: context.repositoryRef ?? null, repositoryIdentitySha256: context.repositoryIdentitySha256 ?? null, branchStateSha256: context.branchStateSha256 ?? null, dependencyContextSha256: context.dependencyContextSha256 ?? null, instructionContextSha256: context.instructionContextSha256 ?? null, toolContractSha256: context.toolContractSha256 ?? null, governancePolicySha256: context.governancePolicySha256 ?? null, immutableContextSha256: context.immutableContextSha256 ?? null, promptPrefixSha256: context.promptPrefixSha256 ?? null, transportContextSha256: context.transportContextSha256 ?? null, contextTags: [...new Set(context.contextTags ?? [])].sort(), estimatedTokens: context.estimatedTokens ?? null}; }
function stateFor(record: CacheExpertRecord, policy: CacheExpertPolicy, at: string): CacheExpertState { if (record.invalidatedAt) return 'INVALIDATED'; const age = Math.max(0, (Date.parse(at) - Date.parse(record.lastUsedAt)) / 60_000); if (age > policy.expiryMinutes) return 'EXPIRED'; const reuse = record.cache.expectedReuseRatio ?? record.cache.reuseRatio; if (age > policy.warmMinutes || reuse === null || reuse < policy.minimumReuseRatio) return 'COOLING'; if (age <= policy.hotMinutes && reuse >= policy.hotReuseRatio) return 'HOT'; return 'WARM'; }
function compatibility(left: CacheContextIdentity, right: CacheContextIdentity, policy: CacheExpertPolicy): {compatibility: CacheCompatibility; estimatedContextDelta: number | null} {
  if (left.taskType && right.taskType && left.taskType !== right.taskType) return {compatibility: 'INCOMPATIBLE', estimatedContextDelta: 1};
  if (left.transportContextSha256 && right.transportContextSha256 && left.transportContextSha256 !== right.transportContextSha256) return {compatibility: 'INCOMPATIBLE', estimatedContextDelta: 1};
  if (left.repositoryIdentitySha256 && right.repositoryIdentitySha256 && left.repositoryIdentitySha256 !== right.repositoryIdentitySha256) return {compatibility: 'INCOMPATIBLE', estimatedContextDelta: 1};
  for (const key of ['branchStateSha256','dependencyContextSha256','instructionContextSha256','toolContractSha256','governancePolicySha256'] as const) if (left[key] && right[key] && left[key] !== right[key]) return {compatibility:'INCOMPATIBLE',estimatedContextDelta:1};
  if (left.promptPrefixSha256 && right.promptPrefixSha256 && left.promptPrefixSha256 === right.promptPrefixSha256) return {compatibility: 'EXACT', estimatedContextDelta: 0};
  if (left.immutableContextSha256 && right.immutableContextSha256 && left.immutableContextSha256 === right.immutableContextSha256) return {compatibility: 'HIGH', estimatedContextDelta: 0};
  const leftTags = new Set(left.contextTags ?? []), rightTags = new Set(right.contextTags ?? []), union = new Set([...leftTags, ...rightTags]);
  if (!union.size) return {compatibility: 'UNKNOWN', estimatedContextDelta: null};
  const overlap = [...leftTags].filter(value => rightTags.has(value)).length, delta = 1 - overlap / union.size;
  return {compatibility: delta <= policy.highCompatibilityMaximumDelta ? 'HIGH' : delta <= policy.partialCompatibilityMaximumDelta ? 'PARTIAL' : 'INCOMPATIBLE', estimatedContextDelta: delta};
}
function compatibilityRank(value: CacheCompatibility) { return value === 'EXACT' ? 5 : value === 'HIGH' ? 4 : value === 'PARTIAL' ? 3 : value === 'UNKNOWN' ? 2 : 1; }
function stateRank(value: CacheExpertState) { return value === 'HOT' ? 5 : value === 'WARM' ? 4 : value === 'COOLING' ? 3 : value === 'EXPIRED' ? 2 : 1; }
function selectionReason(selected: CacheExpertCandidateAssessment) { const cache = selected.cacheScore > 0 ? `Warm Expert ${selected.state}/${selected.compatibility} added ${selected.cacheScore.toFixed(4)} from ${selected.evidenceAuthority.toLowerCase()} cache evidence` : 'No safe cache preference applied'; return `${cache}; governed total ${selected.totalScore.toFixed(4)} (base ${selected.baseScore.toFixed(4)}). Capability, integrity, health and policy remained mandatory.`; }

export function cacheExpertDecisionTranscript(decision: CacheExpertDecision) {
  const lines = ['# Cache-Aware Expert Routing Transcript','',`Work Parcel: ${decision.parcelId}`,`Stage: ${decision.stageId}`,`Decision: ${decision.id}`,`Recorded: ${decision.createdAt}`,'','## What Agent Control considered',''];
  for (const item of decision.candidates) lines.push(`- ${item.route.providerId}/${item.route.accountProfileId ?? 'default'}/${item.route.modelId}@${item.route.nodeId ?? item.route.workerId}: ${item.eligible ? 'governed eligible' : 'ineligible'}; cache ${item.state}/${item.compatibility}; evidence ${item.evidenceAuthority}; base ${item.baseScore.toFixed(4)} + cache ${item.cacheScore.toFixed(4)} - load ${item.loadPenalty.toFixed(4)} = ${item.totalScore.toFixed(4)}; current load ${item.currentLoadRatio === null ? 'unavailable' : `${Math.round(item.currentLoadRatio * 100)}%`}; expected reuse ${item.expectedReuseRatio === null ? 'unavailable' : `${Math.round(item.expectedReuseRatio * 100)}%`}; context delta ${item.estimatedContextDelta === null ? 'unavailable' : `${Math.round(item.estimatedContextDelta * 100)}% (estimated)`}; ${item.reasons.join(', ') || 'no rejection reason'}.`);
  lines.push('','## Decision','',`Selected route: ${decision.selectedRoute ? `${decision.selectedRoute.providerId}/${decision.selectedRoute.accountProfileId ?? 'default'}/${decision.selectedRoute.modelId}@${decision.selectedRoute.nodeId ?? decision.selectedRoute.workerId}` : 'none'}`,`Selection authority: ${decision.selectionAuthority ?? 'cache-score'}`,`Route changed from declared order: ${decision.changedDeclaredRoute ? 'yes' : 'no'}`,`Reason: ${decision.reason}`,`Independent decision verifier: ${decision.verifier.status}${decision.verifier.reasons.length ? ` — ${decision.verifier.reasons.join('; ')}` : ''}`,'','A warm cache improves efficiency but does not confer correctness or authority. Capability, integrity and governance always outrank cache warmth.','', 'This transcript records operational facts and routing reasons only. It contains no private model reasoning or raw prompt content.');
  return lines.join('\n');
}

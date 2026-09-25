import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {ModelConfig, ProviderConfig} from './config.js';
import type {ModelIntelligenceLedger, ModelIntelligenceProjection} from './model-intelligence.js';
import type {ModelRegistry} from './model-registry.js';
import {OpenAICompatibleProviderClient, type FetchLike, type NormalizedModelUsage, type ProviderRequestExtension} from './openai-compatible-provider.js';
import {providerCredentialReferenceType, providerCredentialStatus, resolveProviderCredential, type ProviderCredentialStatus} from './provider-credential-store.js';
import {redactSensitiveText, redactSensitiveValue} from './security-redaction.js';

export type CatalogEndpointStatus = 'UNKNOWN' | 'AVAILABLE' | 'AUTHENTICATION_REQUIRED' | 'RATE_LIMITED' | 'UNAVAILABLE';
export type CatalogDiscoveryStatus = 'NEVER' | 'DISCOVERING' | 'SUCCEEDED' | 'FAILED';
export type CatalogReviewState = 'DISCOVERED' | 'UNQUALIFIED' | 'SMOKE_TESTED' | 'BENCHMARK_QUEUED' | 'BENCHMARKED' | 'QUALIFIED' | 'REJECTED' | 'LIMITED' | 'ROUTING_ELIGIBLE';
export type CatalogSupport = 'SUPPORTED' | 'UNSUPPORTED' | 'UNKNOWN';
export type CatalogAuthority = 'PROVIDER_REPORTED' | 'ADAPTER_DERIVED' | 'OPERATOR_CONFIGURED' | 'UNKNOWN';
export type CatalogInferenceEndpointStatus = 'UNTESTED' | 'CONFIRMED' | 'NOT_AVAILABLE' | 'AUTHORIZATION_REQUIRED' | 'RATE_LIMITED' | 'INDETERMINATE';
export type CatalogFailureClass = 'TIMEOUT_BEFORE_FIRST_TOKEN' | 'TIMEOUT_DURING_GENERATION' | 'TIMEOUT_UNCLASSIFIED' | 'OUTPUT_TRUNCATED' | 'SCHEMA_INVALID' | 'ENDPOINT_NOT_AVAILABLE' | 'AUTHORIZATION' | 'RATE_LIMITED' | 'PROVIDER_ERROR' | 'MALFORMED_RESPONSE' | 'CAPABILITY_UNAVAILABLE' | 'TOOL_CALL_UNRELIABLE' | 'VERIFICATION_FAILED';
export type CatalogOutcomeAttribution = 'MODEL_SUCCESS' | 'MODEL_FAILURE' | 'HARNESS_FAILURE' | 'TEST_INVALIDATED' | 'PROVIDER_FAILURE' | 'ENDPOINT_UNAVAILABLE' | 'INDETERMINATE';
export type CatalogQualificationStage = 'DISCOVERED' | 'TESTING_CALLABILITY' | 'CONFIRMED' | 'CAPABILITY_TESTING' | 'CAPABILITY_CONFIRMED' | 'BENCHMARKING' | 'QUALIFIED' | 'LIMITED' | 'FAILED';
const MAXIMUM_CATALOG_RESPONSE_BYTES = 8 * 1024 * 1024;

export interface CatalogValue<T> {value: T | null; authority: CatalogAuthority}
export interface CatalogRateLimitObservation {requestsLimit: number | null; requestsRemaining: number | null; tokensLimit: number | null; tokensRemaining: number | null; reset: string | null; retryAfter: string | null; authority: 'PROVIDER_HEADER' | 'UNKNOWN'}
export interface CatalogQuotaObservation {value: number | null; unit: string | null; authority: 'PROVIDER_REPORTED' | 'UNKNOWN'}
export interface CatalogModelMetadata {
  family: CatalogValue<string>;
  contextLimitTokens: CatalogValue<number>;
  maximumOutputTokens: CatalogValue<number>;
  inputModalities: CatalogValue<string[]>;
  outputModalities: CatalogValue<string[]>;
  reasoning: CatalogValue<CatalogSupport>;
  coding: CatalogValue<CatalogSupport>;
  toolCalling: CatalogValue<CatalogSupport>;
  structuredOutput: CatalogValue<CatalogSupport>;
  streaming: CatalogValue<CatalogSupport>;
  downloadable: CatalogValue<boolean>;
  license: CatalogValue<string>;
  costClassification: CatalogValue<'FREE' | 'INCLUDED' | 'METERED'>;
}
export interface CatalogSmokeProbe {id: 'basic-completion' | 'structured-json' | 'coding' | 'tool-calling' | 'context-reliability'; status: 'PASS' | 'FAIL' | 'UNAVAILABLE'; elapsedMs: number | null; ttftMs: number | null; ttftAuthority: 'PROVIDER_REPORTED' | 'MEASURED' | 'UNAVAILABLE'; usage: NormalizedModelUsage | null; retries: number; finishReason: string | null; failure: string | null; failureClass: CatalogFailureClass | null; responseHash: string | null; responseLength: number | null; requestedOutputTokens: number; invocationProfile: string | null; evidenceSource?: 'DIRECT_SMOKE' | 'CALLABILITY_REUSED'}
export interface CatalogSmokeEvidence {status: 'PASS' | 'LIMITED' | 'FAILED'; startedAt: string; completedAt: string; probes: CatalogSmokeProbe[]; inputSha256: string; adapterId: string}
export interface CatalogCallabilityEvidence {status: 'PASS' | 'FAIL'; startedAt: string; completedAt: string; elapsedMs: number; inferenceEndpointStatus: CatalogInferenceEndpointStatus; httpStatus: number | null; httpAccepted: boolean; streamRequested: boolean; streamStarted: boolean; firstEventMs: number | null; ttftMs: number | null; ttftAuthority: 'MEASURED' | 'UNAVAILABLE'; partialOutput: boolean; finishReason: string | null; usage: NormalizedModelUsage | null; failure: string | null; failureClass: CatalogFailureClass | null; responseHash: string | null; responseLength: number | null; requestedOutputTokens: number; inputSha256: string; invocationProfile: string | null}
export interface CatalogStageTransition {stage: CatalogQualificationStage; at: string; reason: string; evidence?: string}
export interface CatalogEvidenceAdjudication {
  id: string;
  recordedAt: string;
  evidenceKind: 'CALLABILITY' | 'CAPABILITY_SMOKE' | 'FROZEN_BENCHMARK';
  evidenceReference: string;
  attribution: CatalogOutcomeAttribution;
  scoreDisposition: 'INCLUDE' | 'EXCLUDE';
  reason: string;
  supersededBy?: string;
  supportingEvidence: string[];
}
export type CatalogEvidenceAdjudicationInput = Omit<CatalogEvidenceAdjudication, 'id' | 'recordedAt'> & {id?: string; recordedAt?: string};
export interface ProviderCatalogModel {
  providerId: string;
  registryModelId: string;
  canonicalModelId: string;
  ownedBy: string | null;
  firstDiscoveredAt: string;
  lastDiscoveredAt: string;
  available: boolean;
  inferenceEndpointStatus: CatalogInferenceEndpointStatus;
  reviewState: CatalogReviewState;
  stateHistory: Array<{state: CatalogReviewState; at: string; reason: string; evidence?: string}>;
  routingEligible: boolean;
  metadata: CatalogModelMetadata;
  callability?: CatalogCallabilityEvidence;
  callabilityHistory?: CatalogCallabilityEvidence[];
  smoke?: CatalogSmokeEvidence;
  smokeHistory?: CatalogSmokeEvidence[];
  benchmarkBatchIds: string[];
  qualificationStage?: CatalogQualificationStage;
  stageHistory?: CatalogStageTransition[];
  evidenceAdjudications?: CatalogEvidenceAdjudication[];
}
interface ProviderCatalogObservation {providerId: string; endpointStatus: CatalogEndpointStatus; discoveryStatus: CatalogDiscoveryStatus; credentialStatus: ProviderCredentialStatus; lastDiscoveryAt: string | null; lastError: string | null; rateLimit: CatalogRateLimitObservation; quota: CatalogQuotaObservation}
interface ProviderCatalogSnapshot {schema: 'agent-control.provider-catalog/v1'; providers: ProviderCatalogObservation[]; models: ProviderCatalogModel[]}

export interface ProviderDiscoveryResult {models: Array<{id: string; ownedBy: string | null; metadata: CatalogModelMetadata}>; rateLimit: CatalogRateLimitObservation; quota: CatalogQuotaObservation}
export interface ProviderDiscoveryAdapter {
  id: string;
  supports(provider: ProviderConfig): boolean;
  validateCredential?(credential: string): void;
  discover(input: {provider: ProviderConfig; credential: string; fetcher: FetchLike; timeoutMs: number}): Promise<ProviderDiscoveryResult>;
  smokeRequest?(input: {provider: ProviderConfig; model: ModelConfig; probe: CatalogSmokeProbe['id']}): ProviderRequestExtension | undefined;
  invocationRequest?(input: {provider: ProviderConfig; model: ModelConfig; purpose: 'repository-review'}): ProviderRequestExtension | undefined;
}

export class ProviderAdapterRegistry {
  private readonly adapters = new Map<string, ProviderDiscoveryAdapter>();
  register(adapter: ProviderDiscoveryAdapter) { if (this.adapters.has(adapter.id)) throw new Error('provider_adapter_exists'); this.adapters.set(adapter.id, adapter); return this; }
  resolve(provider: ProviderConfig) {
    const id = provider.adapter ?? 'openai-compatible-v1', adapter = this.adapters.get(id);
    if (!adapter || !adapter.supports(provider)) throw new Error('provider_discovery_adapter_unavailable');
    return adapter;
  }
}

export class OpenAICompatibleDiscoveryAdapter implements ProviderDiscoveryAdapter {
  readonly id: string = 'openai-compatible-v1';
  supports(provider: ProviderConfig) { return ['openai-compatible', 'responses', 'local'].includes(provider.kind) && Boolean(provider.baseUrl); }
  validateCredential(_credential: string) {}
  smokeRequest(_input: {provider: ProviderConfig; model: ModelConfig; probe: CatalogSmokeProbe['id']}): ProviderRequestExtension | undefined { return undefined; }
  invocationRequest(_input: {provider: ProviderConfig; model: ModelConfig; purpose: 'repository-review'}): ProviderRequestExtension | undefined { return undefined; }
  async discover(input: {provider: ProviderConfig; credential: string; fetcher: FetchLike; timeoutMs: number}): Promise<ProviderDiscoveryResult> {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const endpoint = discoveryUrl(input.provider), response = await input.fetcher(endpoint, {method: 'GET', headers: {accept: 'application/json', ...(input.credential ? {authorization: `Bearer ${input.credential}`} : {})}, signal: controller.signal});
      if (!response.ok) throw providerDiscoveryError(response.status);
      const payload = await boundedJson(response);
      return {models: parseOpenAIModelList(redactSensitiveValue(payload, '', [input.credential])), rateLimit: rateLimitFrom(response.headers, input.credential), quota: quotaFrom(response.headers)};
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw new Error('provider_catalog_timeout');
      throw safeError(error, input.credential);
    } finally { clearTimeout(timeout); }
  }
}

/** NVIDIA-specific policy is restricted to credential shape and the documented hosted endpoint. */
export class NvidiaHostedProviderAdapter extends OpenAICompatibleDiscoveryAdapter {
  override readonly id = 'nvidia-hosted-v1';
  override supports(provider: ProviderConfig) {
    if (!super.supports(provider) || !provider.baseUrl) return false;
    const url = new URL(provider.baseUrl);
    return url.protocol === 'https:' && url.hostname === 'integrate.api.nvidia.com' && provider.wireApi === 'chat-completions';
  }
  override validateCredential(credential: string) { if (!/^nvapi-[A-Za-z0-9_-]{16,}$/.test(credential)) throw new Error('provider_credential_format_invalid'); }
  override smokeRequest() { return {profile: 'nvidia-hosted-nonreasoning-smoke-v1', body: {chat_template_kwargs: {enable_thinking: false}}}; }
  override invocationRequest(_input: {provider: ProviderConfig; model: ModelConfig; purpose: 'repository-review'}) { return {profile: 'nvidia-hosted-nonreasoning-repository-review-v1', body: {chat_template_kwargs: {enable_thinking: false}}}; }
}

export function defaultProviderAdapterRegistry() {
  return new ProviderAdapterRegistry().register(new OpenAICompatibleDiscoveryAdapter()).register(new NvidiaHostedProviderAdapter());
}

export class ProviderCatalogStore {
  private readonly providers = new Map<string, ProviderCatalogObservation>();
  private readonly models = new Map<string, ProviderCatalogModel>();
  constructor(readonly file?: string, private readonly clock = () => new Date().toISOString()) {
    if (!file || !fs.existsSync(file)) return;
    const value = redactSensitiveValue(JSON.parse(fs.readFileSync(file, 'utf8'))) as ProviderCatalogSnapshot;
    if (value.schema !== 'agent-control.provider-catalog/v1') throw new Error('provider_catalog_snapshot_invalid');
    for (const provider of value.providers) this.providers.set(provider.providerId, provider);
    for (const model of value.models) {
      const stage = model.qualificationStage ?? inferQualificationStage(model);
      const normalized = {...model, available: model.available !== false, inferenceEndpointStatus: model.inferenceEndpointStatus ?? inferLegacyInferenceStatus(model), qualificationStage: stage, stageHistory: model.stageHistory?.length ? model.stageHistory : [{stage, at: model.lastDiscoveredAt, reason: 'restored from legacy catalogue evidence'}], evidenceAdjudications: model.evidenceAdjudications ?? []};
      if (normalized.smoke) normalized.smoke.probes = normalized.smoke.probes.map(probe => normalizeStoredProbe(probe));
      if (normalized.smokeHistory) normalized.smokeHistory = normalized.smokeHistory.map(smoke => ({...smoke, probes: smoke.probes.map(probe => normalizeStoredProbe(probe))}));
      this.models.set(catalogKey(model.providerId, model.canonicalModelId), normalized);
    }
  }
  provider(providerId: string) { const value = this.providers.get(providerId); return value ? structuredClone(value) : undefined; }
  modelsList(providerId?: string) { return [...this.models.values()].filter(model => !providerId || model.providerId === providerId).sort((a,b) => a.canonicalModelId.localeCompare(b.canonicalModelId)).map(model => structuredClone(model)); }
  beginDiscovery(providerId: string, credentialStatus: ProviderCredentialStatus) { const current = this.provider(providerId) ?? emptyProvider(providerId); current.discoveryStatus = 'DISCOVERING'; current.credentialStatus = credentialStatus; current.lastError = null; this.providers.set(providerId, current); this.save(); }
  failDiscovery(providerId: string, credentialStatus: ProviderCredentialStatus, error: unknown) { const current = this.provider(providerId) ?? emptyProvider(providerId), reason = safeFailure(error); current.discoveryStatus = 'FAILED'; current.endpointStatus = reason === 'provider_authentication_failed' || reason === 'provider_authentication_required' ? 'AUTHENTICATION_REQUIRED' : reason === 'provider_rate_limited' ? 'RATE_LIMITED' : 'UNAVAILABLE'; current.credentialStatus = credentialStatus; current.lastError = reason; this.providers.set(providerId, current); this.save(); return structuredClone(current); }
  completeDiscovery(providerId: string, credentialStatus: ProviderCredentialStatus, result: ProviderDiscoveryResult) {
    const at = this.clock(), current = this.provider(providerId) ?? emptyProvider(providerId); current.discoveryStatus = 'SUCCEEDED'; current.endpointStatus = 'AVAILABLE'; current.credentialStatus = credentialStatus; current.lastDiscoveryAt = at; current.lastError = null; current.rateLimit = result.rateLimit; current.quota = result.quota; this.providers.set(providerId, current);
    const seen = new Set<string>();
    for (const discovered of result.models) {
      const key = catalogKey(providerId, discovered.id); seen.add(key); const existing = this.models.get(key), registryModelId = existing?.registryModelId ?? discoveredRegistryId(providerId, discovered.id);
      const value: ProviderCatalogModel = existing
        ? {...existing, ownedBy: discovered.ownedBy, lastDiscoveredAt: at, available: true, metadata: discovered.metadata}
        : {providerId, registryModelId, canonicalModelId: discovered.id, ownedBy: discovered.ownedBy, firstDiscoveredAt: at, lastDiscoveredAt: at, available: true, inferenceEndpointStatus: 'UNTESTED', reviewState: 'UNQUALIFIED', stateHistory: [{state: 'DISCOVERED', at, reason: 'provider catalogue observation'}, {state: 'UNQUALIFIED', at, reason: 'discovery never grants qualification or inference callability'}], routingEligible: false, metadata: discovered.metadata, benchmarkBatchIds: [], qualificationStage: 'DISCOVERED', stageHistory: [{stage: 'DISCOVERED', at, reason: 'canonical model ID observed in provider catalogue'}], evidenceAdjudications: []};
      if (existing && !existing.available) { value.routingEligible = false; transition(value, 'UNQUALIFIED', at, 'model returned to provider catalogue; routing requires current review'); }
      this.models.set(key, value);
    }
    for (const [key, model] of this.models) if (model.providerId === providerId && !seen.has(key) && model.available) {
      model.available = false; model.routingEligible = false;
      transition(model, 'LIMITED', at, 'model absent from latest successful provider catalogue');
      this.models.set(key, model);
    }
    this.save(); return {provider: structuredClone(current), models: this.modelsList(providerId), discovered: seen.size};
  }
  recordSmoke(providerId: string, canonicalModelId: string, smoke: CatalogSmokeEvidence) {
    const item = this.mustModel(providerId, canonicalModelId); if (item.smoke && !sameEvidenceRun(item.smoke, smoke)) item.smokeHistory = appendEvidence(item.smokeHistory, item.smoke); item.smoke = structuredClone(smoke); item.inferenceEndpointStatus = inferenceStatusFromProbes(smoke.probes); transition(item, 'SMOKE_TESTED', smoke.completedAt, `bounded smoke ${smoke.status.toLowerCase()}`, `smoke:${smoke.inputSha256}`); stageTransition(item, smoke.status === 'PASS' ? 'CAPABILITY_CONFIRMED' : smoke.status === 'LIMITED' ? 'LIMITED' : 'FAILED', smoke.completedAt, `capability smoke ${smoke.status.toLowerCase()}`, `smoke:${smoke.inputSha256}`); this.models.set(catalogKey(providerId, canonicalModelId), item); this.save(); return structuredClone(item);
  }
  beginCallability(providerId: string, canonicalModelId: string, at = this.clock()) { const item = this.mustModel(providerId, canonicalModelId); stageTransition(item, 'TESTING_CALLABILITY', at, 'bounded authoritative callability request started'); this.models.set(catalogKey(providerId, canonicalModelId), item); this.save(); return structuredClone(item); }
  recordCallability(providerId: string, canonicalModelId: string, evidence: CatalogCallabilityEvidence) { const item = this.mustModel(providerId, canonicalModelId); if (item.callability && !sameEvidenceRun(item.callability, evidence)) item.callabilityHistory = appendEvidence(item.callabilityHistory, item.callability); item.callability = structuredClone(evidence); item.inferenceEndpointStatus = evidence.inferenceEndpointStatus; const attribution = callabilityAttribution(evidence), stage: CatalogQualificationStage = evidence.status === 'PASS' ? 'CONFIRMED' : attribution === 'INDETERMINATE' || attribution === 'PROVIDER_FAILURE' ? 'LIMITED' : 'FAILED'; stageTransition(item, stage, evidence.completedAt, callabilityNarrative(item.canonicalModelId, evidence), `callability:${evidence.inputSha256}`); this.models.set(catalogKey(providerId, canonicalModelId), item); this.save(); return structuredClone(item); }
  beginSmoke(providerId: string, canonicalModelId: string, at = this.clock()) { const item = this.mustModel(providerId, canonicalModelId); if (item.inferenceEndpointStatus !== 'CONFIRMED') throw new Error('provider_catalog_callability_required'); stageTransition(item, 'CAPABILITY_TESTING', at, 'bounded capability smoke started after confirmed callability'); this.models.set(catalogKey(providerId, canonicalModelId), item); this.save(); return structuredClone(item); }
  recordEvidenceAdjudication(providerId: string, canonicalModelId: string, input: CatalogEvidenceAdjudicationInput) {
    const evidenceKinds: CatalogEvidenceAdjudication['evidenceKind'][] = ['CALLABILITY','CAPABILITY_SMOKE','FROZEN_BENCHMARK'], attributions: CatalogOutcomeAttribution[] = ['MODEL_SUCCESS','MODEL_FAILURE','HARNESS_FAILURE','TEST_INVALIDATED','PROVIDER_FAILURE','ENDPOINT_UNAVAILABLE','INDETERMINATE'];
    if (!evidenceKinds.includes(input.evidenceKind) || !attributions.includes(input.attribution) || !['INCLUDE','EXCLUDE'].includes(input.scoreDisposition) || typeof input.evidenceReference !== 'string' || !input.evidenceReference.trim() || typeof input.reason !== 'string' || !input.reason.trim() || !Array.isArray(input.supportingEvidence) || input.supportingEvidence.some(value => typeof value !== 'string')) throw new Error('provider_catalog_adjudication_invalid');
    if (input.recordedAt !== undefined && (typeof input.recordedAt !== 'string' || !Number.isFinite(Date.parse(input.recordedAt)))) throw new Error('provider_catalog_adjudication_invalid');
    const item = this.mustModel(providerId, canonicalModelId), value: CatalogEvidenceAdjudication = {id: safeIdentifier(input.id ?? `adjudication:${hash({providerId, canonicalModelId, evidenceReference: input.evidenceReference, attribution: input.attribution, reason: input.reason}).slice(0, 24)}`), recordedAt: input.recordedAt ?? this.clock(), evidenceKind: input.evidenceKind, evidenceReference: safeText(input.evidenceReference, 256), attribution: input.attribution, scoreDisposition: input.scoreDisposition, reason: safeText(input.reason, 1_024), ...(input.supersededBy ? {supersededBy: safeText(input.supersededBy, 256)} : {}), supportingEvidence: [...new Set(input.supportingEvidence.map(value => safeText(value, 512)).filter(Boolean))]};
    if ((item.evidenceAdjudications ?? []).some(existing => existing.id === value.id)) throw new Error('provider_catalog_adjudication_exists');
    item.evidenceAdjudications = [...(item.evidenceAdjudications ?? []), value]; this.models.set(catalogKey(providerId, canonicalModelId), item); this.save(); return structuredClone(value);
  }
  markBenchmarkQueued(modelIds: string[], batchId: string) { const at = this.clock(); for (const modelId of modelIds) { const item = [...this.models.values()].find(value => value.registryModelId === modelId); if (!item) continue; if (!item.benchmarkBatchIds.includes(batchId)) item.benchmarkBatchIds.push(batchId); transition(item, 'BENCHMARK_QUEUED', at, 'frozen benchmark queued', `batch:${batchId}`); stageTransition(item, 'BENCHMARKING', at, 'frozen benchmark queued', `batch:${batchId}`); } this.save(); }
  reconcile(intelligence: ModelIntelligenceProjection) {
    let changed = false;
    for (const item of this.models.values()) {
      if (!item.available) {
        if (item.routingEligible) { item.routingEligible = false; changed = true; }
        if (item.reviewState !== 'LIMITED') { transition(item, 'LIMITED', this.clock(), 'model is absent from latest successful provider catalogue'); stageTransition(item, 'FAILED', this.clock(), 'model is absent from latest successful provider catalogue'); changed = true; }
        continue;
      }
      const route = intelligence.routes.filter(value => value.identity.providerId === item.providerId && value.identity.modelId === item.registryModelId).sort((a,b) => b.current.completed-a.current.completed)[0];
      const batches = intelligence.queue.filter(batch => batch.candidates.some(candidate => candidate.providerId === item.providerId && candidate.modelId === item.registryModelId));
      const terminal = batches.filter(batch => ['COMPLETED','PARTIAL','BLOCKED','FAILED'].includes(batch.status)).at(-1);
      if (item.routingEligible && (!route || !['QUALIFIED','PREFERRED'].includes(route.state))) {
        item.routingEligible = false;
        transition(item, route?.state === 'QUARANTINED' || route?.state === 'RETIRED' ? 'REJECTED' : 'LIMITED', this.clock(), 'routing disabled because current model intelligence is no longer qualified', route ? `route:${route.routeKey}` : undefined);
        changed = true;
      }
      const derived: CatalogReviewState | undefined = item.routingEligible ? 'ROUTING_ELIGIBLE' : route && ['QUALIFIED','PREFERRED'].includes(route.state) ? 'QUALIFIED' : route?.state === 'QUARANTINED' ? 'REJECTED' : route?.state === 'DEGRADED' ? 'LIMITED' : terminal ? 'BENCHMARKED' : batches.some(batch => ['QUEUED','RUNNING'].includes(batch.status)) ? 'BENCHMARK_QUEUED' : undefined;
      if (derived && item.reviewState !== derived) {
        const at = this.clock(), evidence = terminal ? `batch:${terminal.id}` : route ? `route:${route.routeKey}` : undefined;
        transition(item, derived, at, 'reconciled from immutable model intelligence', evidence);
        if (derived === 'QUALIFIED' || derived === 'ROUTING_ELIGIBLE') stageTransition(item, 'QUALIFIED', at, 'frozen evidence satisfies qualification policy', evidence);
        else if (derived === 'REJECTED') stageTransition(item, 'FAILED', at, 'frozen evidence rejected by qualification policy', evidence);
        else if (derived === 'BENCHMARKED' || derived === 'LIMITED') stageTransition(item, 'LIMITED', at, 'frozen benchmark completed without routing qualification', evidence);
        changed = true;
      }
    }
    if (changed) this.save();
  }
  setRoutingEligibility(providerId: string, canonicalModelId: string, enabled: boolean, intelligence: ModelIntelligenceProjection) {
    this.reconcile(intelligence); const item = this.mustModel(providerId, canonicalModelId);
    if (enabled && !item.available) throw new Error('provider_catalog_model_unavailable');
    if (enabled && item.reviewState !== 'QUALIFIED') throw new Error('provider_catalog_model_not_qualified');
    if (!enabled && !item.routingEligible) throw new Error('provider_catalog_model_routing_not_enabled');
    item.routingEligible = enabled; transition(item, enabled ? 'ROUTING_ELIGIBLE' : 'QUALIFIED', this.clock(), enabled ? 'operator enabled qualified route' : 'operator disabled routing'); this.models.set(catalogKey(providerId, canonicalModelId), item); this.save(); return structuredClone(item);
  }
  snapshot(): ProviderCatalogSnapshot { return {schema: 'agent-control.provider-catalog/v1', providers: [...this.providers.values()].map(value => structuredClone(value)), models: this.modelsList()}; }
  private mustModel(providerId: string, canonicalModelId: string) { const value = this.models.get(catalogKey(providerId, canonicalModelId)); if (!value) throw new Error('provider_catalog_model_missing'); return structuredClone(value); }
  private save() { if (!this.file) return; fs.mkdirSync(path.dirname(this.file), {recursive: true, mode: 0o700}); const temporary = `${this.file}.${process.pid}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(redactSensitiveValue(this.snapshot()), null, 2)}\n`, {mode: 0o600}); fs.renameSync(temporary, this.file); }
}

export class ProviderCatalogRuntime {
  private byId: Map<string, ProviderConfig>;
  constructor(
    providers: ProviderConfig[],
    readonly store: ProviderCatalogStore,
    private readonly models: ModelRegistry,
    private readonly intelligence: ModelIntelligenceLedger,
    private readonly adapters = defaultProviderAdapterRegistry(),
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly fetcher: FetchLike = fetch,
    private readonly clock = () => new Date().toISOString(),
  ) { this.byId = new Map(providers.map(provider => [provider.id, structuredClone(provider)])); this.syncModels(); }

  projection() {
    const intelligence = this.intelligence.projection(); this.store.reconcile(intelligence); this.syncModels(); const rows = this.store.modelsList();
    return {
      schema: 'agent-control.provider-catalog-projection/v1' as const,
      observedAt: this.clock(),
      providers: [...this.byId.values()].map(provider => {
        const observation = this.store.provider(provider.id) ?? emptyProvider(provider.id), discovered = rows.filter(model => model.providerId === provider.id);
        return {id: provider.id, name: provider.name ?? provider.id, kind: provider.kind, enabled: provider.enabled !== false, adapter: provider.adapter ?? 'openai-compatible-v1', baseUrl: provider.baseUrl ?? null, authenticationType: provider.auth?.type ?? (provider.requiresAuth ? 'bearer-env' : 'none'), credentialReference: providerCredentialReferenceType(provider), credentialStatus: providerCredentialStatus(provider, this.environment), endpointStatus: observation.endpointStatus, discoveryStatus: observation.discoveryStatus, discoveredModels: discovered.length, availableModels: discovered.filter(model => model.available).length, inferenceConfirmedModels: discovered.filter(model => model.available && model.inferenceEndpointStatus === 'CONFIRMED').length, callabilityUntestedModels: discovered.filter(model => model.available && model.inferenceEndpointStatus === 'UNTESTED').length, lastDiscoveryAt: observation.lastDiscoveryAt, rateLimit: observation.rateLimit, quota: observation.quota, costClassification: provider.costClass ? {value: provider.costClass.toUpperCase(), authority: 'OPERATOR_CONFIGURED'} : {value: null, authority: 'UNKNOWN'}, qualificationStatus: provider.qualification?.status ?? 'unqualified', routingEligibleModels: discovered.filter(model => model.routingEligible).length, lastError: observation.lastError};
      }),
      models: rows.map(model => ({...model, qualificationStage: model.qualificationStage ?? inferQualificationStage(model), costStatus: catalogCostStatus(model), latestNarrative: latestCatalogNarrative(model), diagnosticStatus: diagnosticStatus(model), triage: triageProjection(model), lifecycle: lifecycleProjection(model, intelligence), benchmark: benchmarkProjection(model, intelligence)})),
      tournament: {leaders: catalogTournamentLeaders(rows, intelligence), requestAccounting: catalogTournamentRequestAccounting(rows, intelligence), narrative: rows.flatMap(model => (model.stageHistory ?? []).map((transition, index) => ({id: `catalog-narrative:${hash({providerId:model.providerId,modelId:model.canonicalModelId,index,transition}).slice(0,24)}`, providerId: model.providerId, canonicalModelId: model.canonicalModelId, stage: transition.stage, at: transition.at, text: transition.reason, evidence: transition.evidence ?? null}))).sort((left,right) => Date.parse(left.at)-Date.parse(right.at)).slice(-100)},
    };
  }

  async discover(providerId: string, timeoutMs = 30_000) {
    const provider = this.mustProvider(providerId); if (provider.enabled === false || provider.discovery?.enabled !== true) throw new Error('provider_discovery_disabled');
    const credentialStatus = providerCredentialStatus(provider, this.environment); this.store.beginDiscovery(provider.id, credentialStatus);
    let credential = '';
    try {
      credential = resolveProviderCredential(provider, this.environment); const adapter = this.adapters.resolve(provider); adapter.validateCredential?.(credential);
      const result = await adapter.discover({provider, credential, fetcher: this.fetcher, timeoutMs}); const completed = this.store.completeDiscovery(provider.id, credentialStatus, result); this.syncModels(); return completed;
    } catch (error) { const sanitized = safeError(error, credential); this.store.failDiscovery(provider.id, credentialStatus, sanitized); throw sanitized; }
  }

  async probeCallability(providerId: string, canonicalModelId: string, timeoutMs = 45_000) {
    const provider = this.mustProvider(providerId); if (provider.enabled === false) throw new Error('provider_disabled');
    const item = this.store.modelsList(providerId).find(model => model.canonicalModelId === canonicalModelId); if (!item) throw new Error('provider_catalog_model_missing');
    if (!item.available) throw new Error('provider_catalog_model_unavailable');
    const adapter = this.adapters.resolve(provider), model = catalogModelConfig(item), extension = adapter.smokeRequest?.({provider, model, probe: 'basic-completion'}), startedAt = this.clock(), requestedOutputTokens = 64; this.store.beginCallability(providerId, canonicalModelId, startedAt);
    const client = new OpenAICompatibleProviderClient(provider, this.fetcher, () => { const credential = resolveProviderCredential(provider, this.environment); try { adapter.validateCredential?.(credential); } catch (error) { throw safeError(error, credential); } return credential; });
    const result = await client.probeStreaming(model, 'Reply with exactly AC_CALLABILITY_OK.', {maximumOutputTokens: requestedOutputTokens, timeoutMs: Math.min(timeoutMs, 60_000), requestExtension: extension});
    const completedAt = this.clock(), failureClass = callabilityFailureClass(result), passed = result.outcome === 'COMPLETED' && result.finishReason !== 'length' && result.output.includes('AC_CALLABILITY_OK'), inferenceEndpointStatus = callabilityEndpointStatus(result);
    const evidence: CatalogCallabilityEvidence = {status: passed ? 'PASS' : 'FAIL', startedAt, completedAt, elapsedMs: result.elapsedMs, inferenceEndpointStatus, httpStatus: result.httpStatus, httpAccepted: result.httpAccepted, streamRequested: true, streamStarted: result.streamStarted, firstEventMs: result.firstEventMs, ttftMs: result.firstTokenMs, ttftAuthority: result.firstTokenMs === null ? 'UNAVAILABLE' : 'MEASURED', partialOutput: result.tokenObserved, finishReason: result.finishReason, usage: hasUsage(result.usage) ? result.usage : null, failure: passed ? null : result.failure ?? (result.finishReason === 'length' ? 'provider_output_truncated' : 'callability_verification_failed'), failureClass: passed ? null : failureClass ?? 'VERIFICATION_FAILED', responseHash: result.responseHash?.replace(/^sha256:/, '') ?? null, responseLength: result.output.length, requestedOutputTokens, inputSha256: hash(callabilitySuiteIdentity()), invocationProfile: extension?.profile ?? null};
    this.store.recordCallability(providerId, canonicalModelId, evidence); this.syncModels(); return structuredClone(evidence);
  }

  async smoke(providerId: string, canonicalModelId: string) {
    const provider = this.mustProvider(providerId); if (provider.enabled === false) throw new Error('provider_disabled');
    const item = this.store.modelsList(providerId).find(model => model.canonicalModelId === canonicalModelId); if (!item) throw new Error('provider_catalog_model_missing');
    if (!item.available) throw new Error('provider_catalog_model_unavailable');
    const adapter = this.adapters.resolve(provider), startedAt = this.clock(); this.store.beginSmoke(providerId, canonicalModelId, startedAt); const model = catalogModelConfig(item), client = new OpenAICompatibleProviderClient(provider, this.fetcher, () => { const credential = resolveProviderCredential(provider, this.environment); try { adapter.validateCredential?.(credential); } catch (error) { throw safeError(error, credential); } return credential; }), probes: CatalogSmokeProbe[] = [];
    const run = async (id: CatalogSmokeProbe['id'], prompt: string, options: NonNullable<Parameters<OpenAICompatibleProviderClient['invoke']>[2]>, verify: (result: Awaited<ReturnType<OpenAICompatibleProviderClient['invoke']>>) => boolean) => {
      const requestedOutputTokens = options.maximumOutputTokens ?? 256;
      const extension = adapter.smokeRequest?.({provider, model, probe: id});
      try { const result = await client.invoke(model, prompt, {...options, requestExtension: extension, timeoutMs: Math.min(options.timeoutMs ?? 45_000, 60_000)}), passed = result.finishReason !== 'length' && verify(result), failure = passed ? null : result.finishReason === 'length' ? 'provider_output_truncated' : 'smoke_verification_failed'; probes.push({id, status: passed ? 'PASS' : 'FAIL', elapsedMs: result.elapsedMs, ttftMs: null, ttftAuthority: 'UNAVAILABLE', usage: result.usage, retries: 0, finishReason: result.finishReason, failure, failureClass: failure ? classifySmokeFailure(id, failure) : null, responseHash: hash(result.output || JSON.stringify(result.toolCall)), responseLength: result.output.length || (result.toolCall ? result.toolCall.arguments.length : 0), requestedOutputTokens, invocationProfile: extension?.profile ?? null, evidenceSource: 'DIRECT_SMOKE'}); }
      catch (error) { const partial = (error as {partialInvocation?: {elapsedMs: number; output?: string; toolCall?: {arguments?: string} | null; usage: NormalizedModelUsage; finishReason: string | null; responseHash: string}}).partialInvocation, reason = partial?.finishReason === 'length' ? 'provider_output_truncated' : safeFailure(error), unavailable = /unsupported|capability/.test(reason); probes.push({id, status: unavailable ? 'UNAVAILABLE' : 'FAIL', elapsedMs: partial?.elapsedMs ?? null, ttftMs: null, ttftAuthority: 'UNAVAILABLE', usage: partial?.usage ?? null, retries: 0, finishReason: partial?.finishReason ?? null, failure: reason, failureClass: classifySmokeFailure(id, reason), responseHash: partial?.responseHash?.replace(/^sha256:/, '') ?? null, responseLength: typeof partial?.output === 'string' ? partial.output.length : partial?.toolCall?.arguments?.length ?? null, requestedOutputTokens, invocationProfile: extension?.profile ?? null, evidenceSource: 'DIRECT_SMOKE'}); }
    };
    if (reusableCallability(item)) probes.push(callabilityAsSmokeProbe(item.callability!));
    else await run('basic-completion', 'Reply with exactly AC_SMOKE_OK.', {maximumOutputTokens: 64}, result => result.output.includes('AC_SMOKE_OK'));
    await run('structured-json', 'Return a JSON object whose marker value is exactly AC_SMOKE_OK.', {structured: true, outputSchema: markerSchema(), maximumOutputTokens: 256}, result => parseMarker(result.output));
    await run('coding', 'Check that a JavaScript add(a,b) function should return a + b, then reply with exactly AC_CODE_OK.', {maximumOutputTokens: 256}, result => result.output.includes('AC_CODE_OK'));
    await run('tool-calling', 'Call the required qualification function with marker AC_TOOL_OK.', {toolProbe: 'agent_control_qualification_marker', maximumOutputTokens: 128}, result => result.toolCall?.name === 'agent_control_qualification_marker' && parseToolMarker(result.toolCall.arguments));
    await run('context-reliability', `${'bounded-context-line\n'.repeat(256)}\nReply with exactly AC_CONTEXT_OK.`, {maximumOutputTokens: 64}, result => result.output.includes('AC_CONTEXT_OK'));
    const required = probes.filter(probe => ['basic-completion','coding','context-reliability'].includes(probe.id)), status = required.every(probe => probe.status === 'PASS') ? probes.every(probe => probe.status === 'PASS') ? 'PASS' : 'LIMITED' : 'FAILED', completedAt = this.clock();
    const smoke: CatalogSmokeEvidence = {status, startedAt, completedAt, probes, inputSha256: hash(smokeSuiteIdentity()), adapterId: adapter.id}; this.store.recordSmoke(providerId, canonicalModelId, smoke); this.syncModels(); return structuredClone(smoke);
  }

  markBenchmarkQueued(modelIds: string[], batchId: string) { this.store.markBenchmarkQueued(modelIds, batchId); }
  recordEvidenceAdjudication(providerId: string, canonicalModelId: string, input: CatalogEvidenceAdjudicationInput) { return this.store.recordEvidenceAdjudication(providerId, canonicalModelId, input); }
  setRoutingEligibility(providerId: string, canonicalModelId: string, enabled: boolean) { const provider = this.mustProvider(providerId); if (enabled && provider.enabled === false) throw new Error('provider_disabled'); const item = this.store.setRoutingEligibility(providerId, canonicalModelId, enabled, this.intelligence.projection()); this.models.setDiscoveredRoutingEligibility(item.registryModelId, enabled); return item; }
  modelByRegistryId(modelId: string) { return this.store.modelsList().find(model => model.registryModelId === modelId); }
  syncModels() { for (const item of this.store.modelsList()) if (this.byId.has(item.providerId)) this.models.registerDiscoveredModel(catalogModelConfig(item)); }
  reloadProviders(providers: ProviderConfig[]) { this.byId = new Map(providers.map(provider => [provider.id, structuredClone(provider)])); this.syncModels(); }
  private mustProvider(providerId: string) { const value = this.byId.get(providerId); if (!value) throw new Error('provider_missing'); return structuredClone(value); }
}

function catalogModelConfig(item: ProviderCatalogModel): ModelConfig {
  const observed = new Set<string>();
  if (item.metadata.reasoning.value === 'SUPPORTED') observed.add('reasoning');
  if (item.metadata.coding.value === 'SUPPORTED') observed.add('coding');
  if (item.metadata.toolCalling.value === 'SUPPORTED') observed.add('tool-use');
  if (item.metadata.structuredOutput.value === 'SUPPORTED') observed.add('structured-output');
  for (const probe of item.smoke?.probes ?? []) if (probe.status === 'PASS') for (const capability of smokeCapabilities(probe.id)) observed.add(capability);
  return {id: item.registryModelId, provider: item.providerId, providerModel: item.canonicalModelId, displayName: item.canonicalModelId, enabled: item.available, routingEligible: item.routingEligible, capabilities: [...observed], nodes: ['controller'], limits: {...(item.metadata.contextLimitTokens.value ? {contextTokens: item.metadata.contextLimitTokens.value} : {}), ...(item.metadata.maximumOutputTokens.value ? {outputTokens: item.metadata.maximumOutputTokens.value} : {})}, qualification: {state: item.available ? 'UNTESTED' : 'DISABLED', version: `catalog-${item.firstDiscoveredAt}`, evidence: [`provider-catalog:${item.providerId}`]}};
}
function lifecycleProjection(model: ProviderCatalogModel, intelligence: ModelIntelligenceProjection) { const route = intelligence.routes.find(item => item.identity.providerId === model.providerId && item.identity.modelId === model.registryModelId); return {state: model.reviewState, routingEligible: model.routingEligible, modelIntelligenceState: route?.state ?? null}; }
function benchmarkProjection(model: ProviderCatalogModel, intelligence: ModelIntelligenceProjection) { const route = intelligence.routes.find(item => item.identity.providerId === model.providerId && item.identity.modelId === model.registryModelId), attempts = intelligence.attempts.filter(item => item.candidate.providerId === model.providerId && item.candidate.modelId === model.registryModelId), last = attempts.at(-1); return {score: route?.current.quality ?? null, codingScore: route?.byCategory.coding?.quality ?? null, toolUseScore: route?.byCategory['tool-calling']?.quality ?? null, reliability: route?.current.reliability ?? null, latencyMs: route?.current.timePerSuccessfulTaskMs ?? null, tokenEfficiency: route?.current.tokensPerSuccessfulTask ?? null, lastBenchmarkAt: last?.completedAt ?? null, historicalTrend: {days30: route?.days30.quality ?? null, days90: route?.days90.quality ?? null}, evidenceAttemptIds: attempts.map(item => item.id)}; }
function parseOpenAIModelList(payload: unknown) { const record = asRecord(payload), data = Array.isArray(record.data) ? record.data : Array.isArray(payload) ? payload : null; if (!data || data.length > 10_000) throw new Error('provider_catalog_schema_invalid'); const values = data.map(item => modelFrom(asRecord(item))); if (!values.length || values.some(item => !item.id)) throw new Error('provider_catalog_schema_invalid'); return [...new Map(values.map(item => [item.id, item])).values()]; }
function modelFrom(item: Record<string, unknown>): {id: string; ownedBy: string | null; metadata: CatalogModelMetadata} { const id = typeof item.id === 'string' ? safeModelId(item.id) : '', parameters = stringArray(item.supported_parameters), capabilities = asRecord(item.capabilities), input = stringArray(item.input_modalities ?? capabilities.input_modalities), output = stringArray(item.output_modalities ?? capabilities.output_modalities), support = (keys: string[]): CatalogValue<CatalogSupport> => { for (const key of keys) { if (typeof capabilities[key] === 'boolean') return {value: capabilities[key] ? 'SUPPORTED' : 'UNSUPPORTED', authority: 'PROVIDER_REPORTED'}; if (parameters?.includes(key)) return {value: 'SUPPORTED', authority: 'PROVIDER_REPORTED'}; } return {value: 'UNKNOWN', authority: 'UNKNOWN'}; }; return {id, ownedBy: typeof item.owned_by === 'string' ? safeText(item.owned_by, 128) : null, metadata: {family: {value: id.includes('/') ? id.split('/')[0] : null, authority: id.includes('/') ? 'ADAPTER_DERIVED' : 'UNKNOWN'}, contextLimitTokens: numericValue(item.context_length ?? item.context_window ?? item.max_model_len), maximumOutputTokens: numericValue(item.max_output_tokens), inputModalities: input ? {value: input, authority: 'PROVIDER_REPORTED'} : {value: null, authority: 'UNKNOWN'}, outputModalities: output ? {value: output, authority: 'PROVIDER_REPORTED'} : {value: null, authority: 'UNKNOWN'}, reasoning: support(['reasoning']), coding: support(['coding']), toolCalling: support(['tools','tool_choice','function_calling']), structuredOutput: support(['response_format','json_schema','structured_output']), streaming: support(['stream']), downloadable: typeof item.downloadable === 'boolean' ? {value: item.downloadable, authority: 'PROVIDER_REPORTED'} : {value: null, authority: 'UNKNOWN'}, license: typeof item.license === 'string' ? {value: safeText(item.license, 128), authority: 'PROVIDER_REPORTED'} : {value: null, authority: 'UNKNOWN'}, costClassification: costClassification(item.cost_classification, item.pricing)}}; }
function discoveryUrl(provider: ProviderConfig) { const base = provider.baseUrl!.replace(/\/$/, ''), part = provider.discovery?.path?.replace(/^\//, '') ?? 'models'; return `${base}/${part}`; }
function providerDiscoveryError(status: number) { return new Error(status === 401 || status === 403 ? 'provider_authentication_failed' : status === 429 ? 'provider_rate_limited' : status >= 500 ? 'provider_unavailable' : `provider_catalog_request_failed:${status}`); }
function rateLimitFrom(headers: Headers, credential = ''): CatalogRateLimitObservation { const values = {requestsLimit: headerNumber(headers, 'x-ratelimit-limit-requests'), requestsRemaining: headerNumber(headers, 'x-ratelimit-remaining-requests'), tokensLimit: headerNumber(headers, 'x-ratelimit-limit-tokens'), tokensRemaining: headerNumber(headers, 'x-ratelimit-remaining-tokens'), reset: safeHeader(headers.get('x-ratelimit-reset-requests') ?? headers.get('x-ratelimit-reset'), credential), retryAfter: safeHeader(headers.get('retry-after'), credential)}; return {...values, authority: Object.values(values).some(value => value !== null) ? 'PROVIDER_HEADER' : 'UNKNOWN'}; }
function quotaFrom(headers: Headers): CatalogQuotaObservation { const value = headerNumber(headers, 'x-quota-remaining'); return {value, unit: value === null ? null : 'provider-defined', authority: value === null ? 'UNKNOWN' : 'PROVIDER_REPORTED'}; }
function emptyProvider(providerId: string): ProviderCatalogObservation { return {providerId, endpointStatus: 'UNKNOWN', discoveryStatus: 'NEVER', credentialStatus: 'MISSING', lastDiscoveryAt: null, lastError: null, rateLimit: {requestsLimit:null,requestsRemaining:null,tokensLimit:null,tokensRemaining:null,reset:null,retryAfter:null,authority:'UNKNOWN'}, quota:{value:null,unit:null,authority:'UNKNOWN'}}; }
function transition(item: ProviderCatalogModel, state: CatalogReviewState, at: string, reason: string, evidence?: string) { if (item.reviewState === state) return; item.reviewState = state; item.stateHistory.push({state, at, reason, ...(evidence ? {evidence} : {})}); }
function stageTransition(item: ProviderCatalogModel, stage: CatalogQualificationStage, at: string, reason: string, evidence?: string) { if (item.qualificationStage === stage && item.stageHistory?.at(-1)?.reason === reason) return; item.qualificationStage = stage; item.stageHistory = [...(item.stageHistory ?? []), {stage, at, reason: safeText(reason, 1_024), ...(evidence ? {evidence: safeText(evidence, 256)} : {})}]; }
function inferQualificationStage(model: ProviderCatalogModel): CatalogQualificationStage { if (!model.available) return 'FAILED'; if (model.routingEligible || model.reviewState === 'QUALIFIED') return 'QUALIFIED'; if (model.reviewState === 'BENCHMARK_QUEUED' || model.reviewState === 'BENCHMARKED') return model.reviewState === 'BENCHMARK_QUEUED' ? 'BENCHMARKING' : 'LIMITED'; if (model.smoke) return model.smoke.status === 'PASS' ? 'CAPABILITY_CONFIRMED' : model.smoke.status === 'LIMITED' ? 'LIMITED' : 'FAILED'; if (model.callability?.status === 'PASS') return 'CONFIRMED'; if (model.callability?.status === 'FAIL') return callabilityAttribution(model.callability) === 'ENDPOINT_UNAVAILABLE' ? 'FAILED' : 'LIMITED'; return 'DISCOVERED'; }
function callabilityAttribution(evidence: CatalogCallabilityEvidence): CatalogOutcomeAttribution { if (evidence.status === 'PASS') return 'MODEL_SUCCESS'; if (evidence.failureClass === 'ENDPOINT_NOT_AVAILABLE') return 'ENDPOINT_UNAVAILABLE'; if (evidence.failureClass === 'TIMEOUT_BEFORE_FIRST_TOKEN' || evidence.failureClass === 'TIMEOUT_UNCLASSIFIED') return 'INDETERMINATE'; if (['AUTHORIZATION','RATE_LIMITED','PROVIDER_ERROR','MALFORMED_RESPONSE'].includes(evidence.failureClass ?? '')) return 'PROVIDER_FAILURE'; return 'MODEL_FAILURE'; }
function callabilityNarrative(modelId: string, evidence: CatalogCallabilityEvidence) { if (evidence.status === 'PASS') return `${modelId} responded successfully and is moving to capability testing.`; if (evidence.failureClass === 'ENDPOINT_NOT_AVAILABLE') return `${modelId} returned HTTP ${evidence.httpStatus ?? 'unavailable'}, so Agent Control stopped testing it as endpoint unavailable.`; if (callabilityAttribution(evidence) === 'INDETERMINATE') return `${modelId} produced no authoritative callable result within the bounded test, so Agent Control stopped pending policy.`; return `${modelId} failed the bounded callability gate (${evidence.failureClass ?? 'UNKNOWN'}), so Agent Control stopped before capability testing.`; }
function latestCatalogNarrative(model: ProviderCatalogModel) { return model.stageHistory?.at(-1)?.reason ?? `${model.canonicalModelId} is discovered and awaiting callability testing.`; }
function catalogCostStatus(model: ProviderCatalogModel): 'KNOWN_ZERO' | 'KNOWN_PAID' | 'UNKNOWN' { const value = model.metadata.costClassification.value; return value === 'FREE' ? 'KNOWN_ZERO' : value === 'METERED' ? 'KNOWN_PAID' : 'UNKNOWN'; }
function catalogTournamentLeaders(models: ProviderCatalogModel[], intelligence: ModelIntelligenceProjection) {
  const rows = models.map(model => {
    const benchmark = benchmarkProjection(model, intelligence), probes = model.smoke?.probes ?? [], passed = new Set(probes.filter(probe => probe.status === 'PASS').map(probe => probe.id)), elapsed = probes.filter(probe => probe.elapsedMs !== null).map(probe => probe.elapsedMs!), adequate = ['basic-completion','coding','context-reliability'].every(id => passed.has(id as CatalogSmokeProbe['id']));
    return {model, benchmark, passed, adequate, averageSmokeLatencyMs: elapsed.length ? elapsed.reduce((sum,value)=>sum+value,0)/elapsed.length : null, costStatus: catalogCostStatus(model)};
  });
  const entry = (row: typeof rows[number] | undefined, value: number | null, basis: string) => row ? {providerId: row.model.providerId, canonicalModelId: row.model.canonicalModelId, registryModelId: row.model.registryModelId, value, basis, reviewState: row.model.reviewState, routingEligible: row.model.routingEligible, costStatus: row.costStatus} : null;
  const maximum = (selector: (row: typeof rows[number]) => number | null, filter: (row: typeof rows[number]) => boolean) => rows.filter(filter).map(row=>({row,value:selector(row)})).filter((item): item is {row:typeof rows[number];value:number}=>item.value!==null).sort((left,right)=>right.value-left.value)[0];
  const minimum = (selector: (row: typeof rows[number]) => number | null, filter: (row: typeof rows[number]) => boolean) => rows.filter(filter).map(row=>({row,value:selector(row)})).filter((item): item is {row:typeof rows[number];value:number}=>item.value!==null).sort((left,right)=>left.value-right.value)[0];
  const qualifiedCoding = maximum(row=>row.benchmark.codingScore,row=>['QUALIFIED','ROUTING_ELIGIBLE'].includes(row.model.reviewState));
  const coding = maximum(row=>row.benchmark.codingScore,row=>row.adequate&&row.passed.has('coding'));
  const fast = minimum(row=>row.averageSmokeLatencyMs,row=>row.adequate);
  const tools = minimum(row=>row.averageSmokeLatencyMs,row=>row.adequate&&row.passed.has('tool-calling'));
  const zero = minimum(row=>row.averageSmokeLatencyMs,row=>row.adequate&&row.costStatus==='KNOWN_ZERO');
  const context = maximum(row=>row.benchmark.score,row=>row.adequate&&row.passed.has('context-reliability'));
  const preFrontier = maximum(row=>row.benchmark.score,row=>row.adequate&&row.model.smoke?.status==='PASS');
  return {
    bestQualifiedCodingWorker: entry(qualifiedCoding?.row, qualifiedCoding?.value ?? null, 'qualified frozen coding score'),
    strongestCodingCandidate: entry(coding?.row, coding?.value ?? null, 'frozen coding score plus passing bounded capability gates'),
    fastestAdequateModel: entry(fast?.row, fast?.value ?? null, 'lowest measured mean capability-probe latency among adequate candidates'),
    bestToolUseCandidate: entry(tools?.row, tools?.value ?? null, 'verified forced-tool smoke with lowest measured mean probe latency'),
    strongestKnownZeroCostHostedWorker: entry(zero?.row, zero?.value ?? null, 'adequate candidate with authoritative zero-cost classification'),
    bestContextCandidate: entry(context?.row, context?.value ?? null, 'bounded context smoke plus frozen benchmark score'),
    preFrontierCandidate: entry(preFrontier?.row, preFrontier?.value ?? null, 'highest frozen benchmark score among full-smoke survivors'),
    unavailableOrUnreliable: rows.filter(row=>!row.model.available||['NOT_AVAILABLE','INDETERMINATE','RATE_LIMITED','AUTHORIZATION_REQUIRED'].includes(row.model.inferenceEndpointStatus)||row.model.smoke?.status==='FAILED').map(row=>({providerId:row.model.providerId,canonicalModelId:row.model.canonicalModelId,inferenceEndpointStatus:row.model.inferenceEndpointStatus,diagnostic:diagnosticStatus(row.model).label})),
  };
}
function catalogTournamentRequestAccounting(models: ProviderCatalogModel[], intelligence: ModelIntelligenceProjection) {
  const callability = models.flatMap(model => [...(model.callabilityHistory ?? []), ...(model.callability ? [model.callability] : [])].map(value => ({kind:'CALLABILITY' as const, status:value.status === 'PASS' ? 'SUCCESS' as const : 'FAILED' as const, attribution:callabilityAttribution(value), failureClass:value.failureClass, usage:value.usage, elapsedMs:value.elapsedMs}))), smoke = models.flatMap(model => [...(model.smokeHistory ?? []), ...(model.smoke ? [model.smoke] : [])].flatMap(value => value.probes.filter(probe => probe.evidenceSource !== 'CALLABILITY_REUSED').map(probe => ({kind:'CAPABILITY' as const, status:probe.status === 'PASS' ? 'SUCCESS' as const : probe.status === 'FAIL' ? 'FAILED' as const : 'UNAVAILABLE' as const, attribution:smokeAttribution(probe), failureClass:probe.failureClass, usage:probe.usage, elapsedMs:probe.elapsedMs}))));
  const registryIds = new Set(models.map(model=>model.registryModelId)), benchmark = intelligence.attempts.filter(attempt=>registryIds.has(attempt.candidate.modelId) && benchmarkAttemptReachedProvider(attempt)).map(attempt=>({kind:'BENCHMARK' as const,status:attempt.status === 'PASSED' ? 'SUCCESS' as const : attempt.status === 'FAILED' ? 'FAILED' as const : 'UNAVAILABLE' as const,attribution:attempt.outcomeAttribution,failureClass:attempt.failureClass,usage:attempt.usage.authority === 'PROVIDER_REPORTED' ? {inputTokens:attempt.usage.inputTokens,outputTokens:attempt.usage.outputTokens,totalTokens:attempt.usage.totalTokens} : null,elapsedMs:attempt.elapsedMs !== null && attempt.elapsedMs > 0 ? attempt.elapsedMs : null}));
  const requests = [...callability,...smoke,...benchmark], usage = requests.filter(request=>request.usage && request.usage.inputTokens !== null && request.usage.outputTokens !== null && request.usage.totalTokens !== null), elapsed = requests.filter(request=>request.elapsedMs !== null), sum = (field:'inputTokens'|'outputTokens'|'totalTokens') => usage.reduce((total,request)=>total+(request.usage?.[field] ?? 0),0), attributions = Object.fromEntries(['MODEL_SUCCESS','MODEL_FAILURE','HARNESS_FAILURE','TEST_INVALIDATED','PROVIDER_FAILURE','ENDPOINT_UNAVAILABLE','INDETERMINATE'].map(value=>[value,requests.filter(request=>request.attribution===value).length])) as Record<CatalogOutcomeAttribution,number>;
  const currentCallabilityFailures = models.filter(model=>model.callability?.status==='FAIL'&&!model.smoke).length;
  return {authority:'DURABLE_CATALOGUE_AND_MODEL_INTELLIGENCE' as const,modelsWithCallability:models.filter(model=>Boolean(model.callability)).length,callabilityRequests:callability.length,capabilityRequests:smoke.length,benchmarkRequests:benchmark.length,totalRequests:requests.length,successfulCalls:requests.filter(request=>request.status==='SUCCESS').length,failedCalls:requests.filter(request=>request.status==='FAILED').length,unavailableCalls:requests.filter(request=>request.status==='UNAVAILABLE').length,timedOutCalls:requests.filter(request=>request.failureClass?.startsWith('TIMEOUT')).length,attribution:attributions,providerReportedTokens:{inputKnown:sum('inputTokens'),outputKnown:sum('outputTokens'),totalKnown:sum('totalTokens'),requestsWithCompleteUsage:usage.length,requestCoverage:requests.length,complete:usage.length===requests.length,total:usage.length===requests.length?sum('totalTokens'):null},providerExecutionTime:{knownMs:elapsed.reduce((total,request)=>total+(request.elapsedMs??0),0),requestsWithMeasuredTime:elapsed.length,requestCoverage:requests.length,complete:elapsed.length===requests.length,totalMs:elapsed.length===requests.length?elapsed.reduce((total,request)=>total+(request.elapsedMs??0),0):null},requestsAvoidedByCurrentCallabilityEarlyStop:currentCallabilityFailures*4};
}
function smokeAttribution(probe: CatalogSmokeProbe): CatalogOutcomeAttribution { if (probe.status==='PASS') return 'MODEL_SUCCESS'; if (probe.failureClass==='ENDPOINT_NOT_AVAILABLE') return 'ENDPOINT_UNAVAILABLE'; if (probe.failureClass==='CAPABILITY_UNAVAILABLE') return 'TEST_INVALIDATED'; if (probe.failureClass?.startsWith('TIMEOUT')) return 'INDETERMINATE'; if (['AUTHORIZATION','RATE_LIMITED','PROVIDER_ERROR','MALFORMED_RESPONSE'].includes(probe.failureClass??'')) return 'PROVIDER_FAILURE'; return 'MODEL_FAILURE'; }
function benchmarkAttemptReachedProvider(attempt: ModelIntelligenceProjection['attempts'][number]) { return attempt.invocationIds.length>0 || ['PROVIDER_FAILURE','ENDPOINT_UNAVAILABLE','INDETERMINATE'].includes(attempt.outcomeAttribution); }
function markerSchema() { return {type:'object',properties:{marker:{type:'string',enum:['AC_SMOKE_OK']}},required:['marker'],additionalProperties:false}; }
function smokeSuiteIdentity() {
  return {
    id: 'provider-catalog-smoke',
    version: 3,
    probes: [
      {id: 'basic-completion', maximumOutputTokens: 64, structured: false},
      {id: 'structured-json', maximumOutputTokens: 256, structured: true, expectedMarker: 'AC_SMOKE_OK'},
      {id: 'coding', maximumOutputTokens: 256, structured: false},
      {id: 'tool-calling', maximumOutputTokens: 128, tool: 'agent_control_qualification_marker'},
      {id: 'context-reliability', maximumOutputTokens: 64, contextLines: 256, structured: false},
    ],
    verification: {
      finishReasonLengthIsFailure: true,
      providerOutputIsHashOnly: true,
      callabilityEvidenceMaySatisfyBasicProbeWhenObservedAfterLatestDiscovery: true,
    },
  };
}
function callabilitySuiteIdentity() { return {id: 'provider-catalog-callability', version: 1, streaming: true, prompt: 'exact-marker', marker: 'AC_CALLABILITY_OK', maximumOutputTokens: 64, retainedOutput: 'hash-and-length-only'}; }
function parseMarker(value: string, expected = 'AC_SMOKE_OK') { try { return (JSON.parse(value) as {marker?: unknown}).marker === expected; } catch { return false; } }
function parseToolMarker(value: string) { try { return (JSON.parse(value) as {marker?: unknown}).marker === 'AC_TOOL_OK'; } catch { return false; } }
function smokeCapabilities(id: CatalogSmokeProbe['id']) { return id === 'basic-completion' ? ['text'] : id === 'structured-json' ? ['structured-output'] : id === 'coding' ? ['coding'] : id === 'tool-calling' ? ['tool-use'] : ['context-reliability']; }
function classifySmokeFailure(id: CatalogSmokeProbe['id'], reason: string): CatalogFailureClass {
  if (reason === 'provider_output_truncated') return 'OUTPUT_TRUNCATED';
  if (reason === 'provider_timeout') return 'TIMEOUT_UNCLASSIFIED';
  if (/authentication/.test(reason)) return 'AUTHORIZATION';
  if (/rate_limited/.test(reason)) return 'RATE_LIMITED';
  if (/request_failed:404/.test(reason)) return 'ENDPOINT_NOT_AVAILABLE';
  if (/malformed/.test(reason)) return 'MALFORMED_RESPONSE';
  if (/unsupported|capability/.test(reason)) return 'CAPABILITY_UNAVAILABLE';
  if (reason === 'smoke_verification_failed') return id === 'structured-json' ? 'SCHEMA_INVALID' : id === 'tool-calling' ? 'TOOL_CALL_UNRELIABLE' : 'VERIFICATION_FAILED';
  return 'PROVIDER_ERROR';
}
function callabilityFailureClass(result: Awaited<ReturnType<OpenAICompatibleProviderClient['probeStreaming']>>): CatalogFailureClass | null {
  if (result.finishReason === 'length') return 'OUTPUT_TRUNCATED';
  if (result.outcome === 'TIMEOUT') return result.tokenObserved ? 'TIMEOUT_DURING_GENERATION' : 'TIMEOUT_BEFORE_FIRST_TOKEN';
  if (result.outcome === 'MALFORMED') return 'MALFORMED_RESPONSE';
  if (result.outcome === 'TRANSPORT_ERROR') return 'PROVIDER_ERROR';
  if (result.outcome === 'HTTP_ERROR') {
    if (result.httpStatus === 401 || result.httpStatus === 403) return 'AUTHORIZATION';
    if (result.httpStatus === 404) return 'ENDPOINT_NOT_AVAILABLE';
    if (result.httpStatus === 429) return 'RATE_LIMITED';
    return 'PROVIDER_ERROR';
  }
  return null;
}
function callabilityEndpointStatus(result: Awaited<ReturnType<OpenAICompatibleProviderClient['probeStreaming']>>): CatalogInferenceEndpointStatus {
  if (result.httpAccepted) return 'CONFIRMED';
  if (result.httpStatus === 404) return 'NOT_AVAILABLE';
  if (result.httpStatus === 401 || result.httpStatus === 403) return 'AUTHORIZATION_REQUIRED';
  if (result.httpStatus === 429) return 'RATE_LIMITED';
  return 'INDETERMINATE';
}
function hasUsage(usage: NormalizedModelUsage) { return usage.inputTokens !== null || usage.outputTokens !== null || usage.totalTokens !== null || usage.providerReportedCost !== null; }
function inferLegacyInferenceStatus(model: ProviderCatalogModel): CatalogInferenceEndpointStatus {
  if (model.callability?.inferenceEndpointStatus) return model.callability.inferenceEndpointStatus;
  return model.smoke ? inferenceStatusFromProbes(model.smoke.probes) : 'UNTESTED';
}
function inferenceStatusFromProbes(probes: CatalogSmokeProbe[]): CatalogInferenceEndpointStatus {
  if (probes.some(probe => probe.responseHash !== null || probe.usage !== null || probe.finishReason !== null)) return 'CONFIRMED';
  if (probes.length && probes.every(probe => classifySmokeFailure(probe.id, probe.failure ?? '') === 'ENDPOINT_NOT_AVAILABLE')) return 'NOT_AVAILABLE';
  if (probes.length && probes.every(probe => classifySmokeFailure(probe.id, probe.failure ?? '') === 'AUTHORIZATION')) return 'AUTHORIZATION_REQUIRED';
  if (probes.length && probes.every(probe => classifySmokeFailure(probe.id, probe.failure ?? '') === 'RATE_LIMITED')) return 'RATE_LIMITED';
  return 'INDETERMINATE';
}
function normalizeStoredProbe(probe: CatalogSmokeProbe): CatalogSmokeProbe {
  return {...probe, failureClass: probe.failureClass ?? (probe.failure ? classifySmokeFailure(probe.id, probe.failure) : null), responseLength: probe.responseLength ?? null, requestedOutputTokens: probe.requestedOutputTokens ?? legacySmokeProbeBudget(probe.id)};
}
function legacySmokeProbeBudget(id: CatalogSmokeProbe['id']) { return id === 'structured-json' || id === 'tool-calling' ? 128 : 64; }
function reusableCallability(item: ProviderCatalogModel) { const evidence = item.callability; return evidence?.status === 'PASS' && evidence.inputSha256 === hash(callabilitySuiteIdentity()) && Date.parse(evidence.completedAt) >= Date.parse(item.lastDiscoveredAt); }
function callabilityAsSmokeProbe(evidence: CatalogCallabilityEvidence): CatalogSmokeProbe { return {id: 'basic-completion', status: 'PASS', elapsedMs: evidence.elapsedMs, ttftMs: evidence.ttftMs, ttftAuthority: evidence.ttftAuthority, usage: evidence.usage, retries: 0, finishReason: evidence.finishReason, failure: null, failureClass: null, responseHash: evidence.responseHash, responseLength: evidence.responseLength, requestedOutputTokens: evidence.requestedOutputTokens, invocationProfile: evidence.invocationProfile, evidenceSource: 'CALLABILITY_REUSED'}; }
function diagnosticStatus(model: ProviderCatalogModel) {
  const failures = (model.smoke?.probes ?? []).filter(probe => probe.status !== 'PASS').map(probe => probe.failureClass ?? (probe.failure ? classifySmokeFailure(probe.id, probe.failure) : 'VERIFICATION_FAILED'));
  const primaryFailureClass = failures[0] ?? (model.callability?.status === 'FAIL' ? model.callability.failureClass : null);
  const status = model.smoke?.status ?? (model.callability?.status === 'PASS' ? 'CALLABLE' : model.callability?.status === 'FAIL' ? 'FAILED' : 'UNTESTED');
  return {status, primaryFailureClass, failureClasses: [...new Set(failures)], label: primaryFailureClass ? `${status} — ${primaryFailureClass}` : status};
}
function triageProjection(model: ProviderCatalogModel) {
  if (!model.available) return {stage: 'STOPPED', next: 'REDISCOVER', reason: 'ABSENT_FROM_LATEST_CATALOGUE'};
  if (model.inferenceEndpointStatus !== 'CONFIRMED') return {stage: 'DISCOVERED', next: model.inferenceEndpointStatus === 'UNTESTED' || model.inferenceEndpointStatus === 'INDETERMINATE' ? 'CALLABILITY_PROBE' : 'STOP', reason: `INFERENCE_${model.inferenceEndpointStatus}`};
  if (!model.smoke) return {stage: 'CALLABILITY_CONFIRMED', next: 'CAPABILITY_SMOKE', reason: 'BASIC_INFERENCE_CONFIRMED'};
  if (model.smoke.status === 'FAILED') return {stage: 'SMOKE_FAILED', next: 'REVIEW_FAILURE', reason: diagnosticStatus(model).primaryFailureClass ?? 'SMOKE_FAILED'};
  if (!model.benchmarkBatchIds.length) return {stage: 'SMOKE_COMPLETE', next: 'FROZEN_BENCHMARK', reason: `SMOKE_${model.smoke.status}`};
  return {stage: 'BENCHMARK_EVIDENCE', next: model.reviewState === 'QUALIFIED' ? 'OPERATOR_ROUTING_DECISION' : 'REVIEW_BENCHMARK', reason: model.reviewState};
}
function sameEvidenceRun(left: {startedAt: string; completedAt: string; inputSha256: string}, right: {startedAt: string; completedAt: string; inputSha256: string}) { return left.startedAt === right.startedAt && left.completedAt === right.completedAt && left.inputSha256 === right.inputSha256; }
function appendEvidence<T extends {startedAt: string; completedAt: string; inputSha256: string}>(history: T[] | undefined, value: T) { const next = [...(history ?? [])]; if (!next.some(item => sameEvidenceRun(item, value))) next.push(structuredClone(value)); return next; }
export function stagedCatalogueEstimate(discoveredModels: number, callabilityConfirmedModels: number) {
  const discovered = Math.max(0, Math.floor(discoveredModels)), confirmed = Math.min(discovered, Math.max(0, Math.floor(callabilityConfirmedModels)));
  return {callabilityRequests: discovered, capabilitySmokeRequests: confirmed * 4, totalPreBenchmarkRequests: discovered + confirmed * 4, naiveFiveProbeRequests: discovered * 5, requestsAvoided: (discovered - confirmed) * 4};
}
export function providerCatalogEventNarrative(input: {action: string; providerId: string; canonicalModelId?: string; status?: string | null; failureClass?: string | null; models?: number}) {
  const model = input.canonicalModelId ?? 'the selected model';
  if (input.action === 'discovering') return `Agent Control is discovering canonical model IDs from ${input.providerId}.`;
  if (input.action === 'discovered') return `${input.providerId} discovery returned ${input.models ?? 'an unknown number of'} canonical model IDs; none were admitted to routing.`;
  if (input.action === 'callability-testing') return `${model} is undergoing one bounded authoritative callability request.`;
  if (input.action === 'callability-tested' && input.status === 'PASS') return `${model} responded successfully and is moving to capability testing.`;
  if (input.action === 'callability-tested') return `${model} stopped after callability with ${input.failureClass ?? input.status ?? 'UNKNOWN'}; capability requests were avoided.`;
  if (input.action === 'smoke-testing') return `${model} passed callability and is undergoing bounded capability testing.`;
  if (input.action === 'smoke-tested' && input.status === 'PASS') return `${model} passed the capability suite and may be considered for frozen qualification.`;
  if (input.action === 'smoke-tested') return `${model} completed capability testing as ${input.status ?? 'UNKNOWN'} and will not automatically enter an expensive benchmark.`;
  if (input.action === 'benchmark-queued') return `${model} was selected as a frozen-benchmark finalist; routing remains disabled.`;
  if (input.action === 'benchmark-completed') return `${model} completed frozen qualification as ${input.status ?? 'INDETERMINATE'}; routing remains disabled pending explicit admission.`;
  if (input.action === 'evidence-adjudicated') return `${model} historical evidence was classified as ${input.status ?? 'INDETERMINATE'}; the original evidence remains immutable.`;
  return `Agent Control recorded ${input.action.replaceAll('-', ' ')} for ${input.canonicalModelId ?? input.providerId}.`;
}
function discoveredRegistryId(providerId: string, canonicalModelId: string) { const slug = canonicalModelId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'model'; return `${providerId}-${slug}-${hash(canonicalModelId).slice(0, 8)}`.slice(0, 64); }
function catalogKey(providerId: string, modelId: string) { return `${providerId}\u0000${modelId}`; }
function numericValue(value: unknown): CatalogValue<number> { return typeof value === 'number' && Number.isFinite(value) && value > 0 ? {value, authority:'PROVIDER_REPORTED'} : {value:null,authority:'UNKNOWN'}; }
function costClassification(explicit: unknown, pricingValue: unknown): CatalogValue<'FREE'|'INCLUDED'|'METERED'> { const reported = typeof explicit === 'string' ? explicit.toUpperCase() : ''; if (['FREE','INCLUDED','METERED'].includes(reported)) return {value: reported as 'FREE'|'INCLUDED'|'METERED', authority: 'PROVIDER_REPORTED'}; const pricing = asRecord(pricingValue), numbers = Object.values(pricing).map(item => typeof item === 'number' ? item : typeof item === 'string' && item.trim() !== '' ? Number(item) : NaN).filter(Number.isFinite); return numbers.length ? {value: numbers.every(item => item === 0) ? 'FREE' : 'METERED', authority:'ADAPTER_DERIVED'} : {value:null,authority:'UNKNOWN'}; }
function stringArray(value: unknown) { return Array.isArray(value) && value.every(item => typeof item === 'string') ? [...new Set(value.map(item => safeText(item, 64)))] : null; }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function safeModelId(value: string) { const safe = safeText(value, 256); if (!safe || !/^[a-z0-9][a-z0-9._:/-]{0,255}$/i.test(safe)) throw new Error('provider_catalog_model_id_invalid'); return safe; }
function safeText(value: string, max: number) { return redactSensitiveText(value).replace(/[\r\n]+/g, ' ').trim().slice(0, max); }
function safeIdentifier(value: string) { const safe = safeText(value, 256); return /^[a-z0-9][a-z0-9:._/@-]*$/i.test(safe) ? safe : `sha256:${hash(safe)}`; }
function safeHeader(value: string | null, credential = '') { return value ? safeText(redactSensitiveText(value, [credential]), 128) : null; }
function headerNumber(headers: Headers, name: string) { const value = headers.get(name); if (value === null || value.trim() === '') return null; const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : null; }
async function boundedJson(response: Response) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAXIMUM_CATALOG_RESPONSE_BYTES) throw new Error('provider_catalog_response_too_large');
  if (!response.body) throw new Error('provider_catalog_malformed_response');
  const reader = response.body.getReader(), chunks: Buffer[] = [];
  let bytes = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > MAXIMUM_CATALOG_RESPONSE_BYTES) { void reader.cancel(); throw new Error('provider_catalog_response_too_large'); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8')) as unknown; } catch { throw new Error('provider_catalog_malformed_response'); }
}
function safeFailure(error: unknown, credential = '') { return safeText(redactSensitiveText(error instanceof Error ? error.message : String(error), [credential]), 240) || 'provider_catalog_failed'; }
function safeError(error: unknown, credential = '') { return new Error(safeFailure(error, credential)); }
function hash(value: unknown) { return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex'); }

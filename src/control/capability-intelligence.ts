import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {redactSensitiveText} from './context-readers.js';

export type CapabilitySupport = 'SUPPORTED' | 'UNSUPPORTED' | 'UNKNOWN';
export type CapabilityImplementation = 'NATIVE' | 'AGENT_CONTROL_EMULATED' | 'NONE';
export type CapabilityVerification = 'VERIFIED' | 'UNVERIFIED' | 'FAILED';
export type CapabilityCandidateState = 'DISCOVERED' | 'ANALYSED' | 'CLASSIFIED' | 'EXPERIMENT' | 'QUALIFICATION' | 'ADOPTED' | 'REJECTED' | 'DEFERRED';
export type CapabilityCandidateClassification = 'GENERIC' | 'PROVIDER_SPECIFIC' | 'NOT_USEFUL' | 'UNCLASSIFIED';

export const genericCapabilityIds = {
  contextRetrieval: 'context.retrieval',
  midTaskSteering: 'execution.mid-task-steering',
  asynchronousQuestions: 'execution.async-questions',
  nativeSubagents: 'execution.native-subagents',
  parallelExecution: 'execution.parallel',
  computerUse: 'tool.computer-use',
  browserUse: 'tool.browser-use',
  promptCaching: 'context.prompt-caching',
  remoteExecution: 'execution.remote',
  resume: 'execution.resume',
  longRunningGoals: 'execution.long-running',
  providerReview: 'verification.provider-review',
  structuredToolCalls: 'tool.structured-calls',
  sandboxing: 'execution.sandbox',
  backgroundExecution: 'execution.background',
  contextLifecycle: 'context.lifecycle',
  largeContext: 'context.large',
  generalReasoning: 'reasoning.general',
  codeModification: 'code.modify',
  repositoryReview: 'review.repository',
  repositoryWrite: 'repository.write',
  structuredOutput: 'output.structured',
} as const;

export interface CapabilitySubject {
  providerId: string;
  modelId?: string;
  accountProfileId?: string;
  runtimeId?: string;
  runtimeVersion?: string;
  nodeId?: string;
}

export interface CapabilityObservation {
  schema: 'agent-control.capability-observation/v1';
  id: string;
  capabilityId: string;
  subject: CapabilitySubject;
  support: CapabilitySupport;
  implementation: CapabilityImplementation;
  verification: CapabilityVerification;
  confidence: number;
  observedAt: string;
  qualifiedAt?: string;
  limitations: string[];
  evidence: string[];
  source: 'ADAPTER' | 'QUALIFICATION' | 'OPERATOR' | 'HARVEST' | 'AGENT_CONTROL_CORE';
  adapterCapability?: string;
}

export interface CapabilityCandidate {
  schema: 'agent-control.capability-candidate/v1';
  id: string;
  title: string;
  source: string;
  providerRuntime: string;
  claimedCapability: string;
  whyItMatters: string;
  agentControlEquivalent: string;
  classification: CapabilityCandidateClassification;
  state: CapabilityCandidateState;
  experiment: string | null;
  measuredOutcome: string | null;
  finalDecision: string | null;
  evidence: string[];
  createdAt: string;
  updatedAt: string;
  history: Array<{at: string; from: CapabilityCandidateState | null; to: CapabilityCandidateState; actor: string; reason: string}>;
}

export interface CapabilityRequirementAssessment {
  capabilityId: string;
  satisfied: boolean;
  implementation: CapabilityImplementation | null;
  observationId: string | null;
  reason: string;
}

interface CapabilitySnapshot {
  schema: 'agent-control.capability-intelligence/v1';
  observations: CapabilityObservation[];
  candidates: CapabilityCandidate[];
}

const aliases: Record<string, string> = {
  supports_context_retrieval: genericCapabilityIds.contextRetrieval,
  supports_mid_task_steering: genericCapabilityIds.midTaskSteering,
  supports_async_questions: genericCapabilityIds.asynchronousQuestions,
  supports_native_subagents: genericCapabilityIds.nativeSubagents,
  supports_parallel_execution: genericCapabilityIds.parallelExecution,
  supports_computer_use: genericCapabilityIds.computerUse,
  supports_browser_use: genericCapabilityIds.browserUse,
  supports_prompt_caching: genericCapabilityIds.promptCaching,
  supports_remote_execution: genericCapabilityIds.remoteExecution,
  supports_resume: genericCapabilityIds.resume,
  supports_long_running_goals: genericCapabilityIds.longRunningGoals,
  supports_provider_review: genericCapabilityIds.providerReview,
  'prompt-cache.explicit': genericCapabilityIds.promptCaching,
  'prompt-cache.key': genericCapabilityIds.promptCaching,
  'browser.interactive': genericCapabilityIds.browserUse,
  'browser.headless': genericCapabilityIds.browserUse,
  'computer.use': genericCapabilityIds.computerUse,
  reasoning: genericCapabilityIds.generalReasoning,
  coding: genericCapabilityIds.codeModification,
  'code-modification': genericCapabilityIds.codeModification,
  'repository-review': genericCapabilityIds.repositoryReview,
  review: genericCapabilityIds.repositoryReview,
  'repository-write': genericCapabilityIds.repositoryWrite,
  repository_write: genericCapabilityIds.repositoryWrite,
  'large-context': genericCapabilityIds.largeContext,
  large_context: genericCapabilityIds.largeContext,
  'structured-output': genericCapabilityIds.structuredOutput,
  'tool-use': genericCapabilityIds.structuredToolCalls,
};

const transitions: Record<CapabilityCandidateState, CapabilityCandidateState[]> = {
  DISCOVERED: ['ANALYSED', 'DEFERRED', 'REJECTED'],
  ANALYSED: ['CLASSIFIED', 'DEFERRED', 'REJECTED'],
  CLASSIFIED: ['EXPERIMENT', 'DEFERRED', 'REJECTED'],
  EXPERIMENT: ['QUALIFICATION', 'DEFERRED', 'REJECTED'],
  QUALIFICATION: ['ADOPTED', 'DEFERRED', 'REJECTED'],
  ADOPTED: ['DEFERRED'], REJECTED: [], DEFERRED: ['ANALYSED', 'EXPERIMENT', 'QUALIFICATION', 'REJECTED'],
};

export class CapabilityIntelligenceStore {
  private readonly observations = new Map<string, CapabilityObservation>();
  private readonly candidates = new Map<string, CapabilityCandidate>();
  constructor(readonly file?: string) {
    if (!file || !fs.existsSync(file)) return;
    const snapshot = JSON.parse(fs.readFileSync(file, 'utf8')) as CapabilitySnapshot;
    if (snapshot.schema !== 'agent-control.capability-intelligence/v1' || !Array.isArray(snapshot.observations) || !Array.isArray(snapshot.candidates)) throw new Error('capability_intelligence_snapshot_invalid');
    for (const observation of snapshot.observations) { validateObservation(observation); this.observations.set(observation.id, structuredClone(observation)); }
    for (const candidate of snapshot.candidates) { validateCandidate(candidate); this.candidates.set(candidate.id, structuredClone(candidate)); }
  }

  observe(input: Omit<CapabilityObservation, 'schema' | 'id' | 'capabilityId' | 'observedAt'> & {id?: string; capabilityId: string; observedAt?: string}) {
    const capabilityId = normalizeCapabilityId(input.capabilityId), observation: CapabilityObservation = {
      schema: 'agent-control.capability-observation/v1', id: input.id ?? `capability-observation-${randomUUID()}`, capabilityId, subject: sanitizeSubject(input.subject), support: input.support,
      implementation: input.support === 'SUPPORTED' ? input.implementation : 'NONE', verification: input.verification, confidence: clamp(input.confidence), observedAt: input.observedAt ?? new Date().toISOString(), ...(input.qualifiedAt ? {qualifiedAt: input.qualifiedAt} : {}), limitations: safeList(input.limitations), evidence: safeList(input.evidence), source: input.source, ...(input.adapterCapability ? {adapterCapability: safeText(input.adapterCapability, 256)} : {}),
    };
    if (this.observations.has(observation.id)) throw new Error('capability_observation_exists'); validateObservation(observation); this.observations.set(observation.id, structuredClone(observation)); this.save(); return structuredClone(observation);
  }

  listObservations(filter: {capabilityId?: string; providerId?: string; modelId?: string} = {}) {
    const capabilityId = filter.capabilityId ? normalizeCapabilityId(filter.capabilityId) : undefined;
    return [...this.observations.values()].filter(item => (!capabilityId || item.capabilityId === capabilityId) && (!filter.providerId || item.subject.providerId === filter.providerId) && (!filter.modelId || item.subject.modelId === filter.modelId)).sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt)).map(item => structuredClone(item));
  }

  latest(subject: CapabilitySubject, capabilityId: string, options: {includeCoreEmulation?: boolean} = {}) {
    const normalized = normalizeCapabilityId(capabilityId), exact = this.listObservations({capabilityId: normalized}).filter(item => subjectMatches(item.subject, subject)).sort(bestObservation).at(0);
    if (exact) return exact;
    if (options.includeCoreEmulation !== false) return this.listObservations({capabilityId: normalized, providerId: 'agent-control'}).filter(item => item.implementation === 'AGENT_CONTROL_EMULATED').sort(newest).at(0);
    return undefined;
  }

  assess(subject: CapabilitySubject, required: string[], options: {allowEmulated?: boolean; verifiedOnly?: boolean} = {}) {
    const allowEmulated = options.allowEmulated !== false, verifiedOnly = options.verifiedOnly !== false;
    return [...new Set(required.map(normalizeCapabilityId))].map(capabilityId => {
      const observation = this.latest(subject, capabilityId, {includeCoreEmulation: allowEmulated});
      const satisfied = Boolean(observation && observation.support === 'SUPPORTED' && (!verifiedOnly || observation.verification === 'VERIFIED') && (allowEmulated || observation.implementation === 'NATIVE'));
      return {capabilityId, satisfied, implementation: observation?.implementation ?? null, observationId: observation?.id ?? null, reason: !observation ? 'capability-unobserved' : observation.support !== 'SUPPORTED' ? `capability-${observation.support.toLowerCase()}` : verifiedOnly && observation.verification !== 'VERIFIED' ? `capability-${observation.verification.toLowerCase()}` : !allowEmulated && observation.implementation !== 'NATIVE' ? 'native-capability-required' : observation.implementation === 'NATIVE' ? 'verified-native-capability' : 'verified-agent-control-emulation'} satisfies CapabilityRequirementAssessment;
    });
  }

  discoverCandidate(input: Omit<CapabilityCandidate, 'schema' | 'id' | 'classification' | 'state' | 'experiment' | 'measuredOutcome' | 'finalDecision' | 'createdAt' | 'updatedAt' | 'history'> & {id?: string; actor: string; at?: string}) {
    const at = input.at ?? new Date().toISOString(), id = input.id ?? `capability-candidate-${randomUUID()}`;
    if (this.candidates.has(id)) throw new Error('capability_candidate_exists');
    const candidate: CapabilityCandidate = {schema: 'agent-control.capability-candidate/v1', id, title: safeText(input.title, 256), source: safeText(input.source, 1_024), providerRuntime: safeText(input.providerRuntime, 256), claimedCapability: normalizeCapabilityId(input.claimedCapability), whyItMatters: safeText(input.whyItMatters, 2_048), agentControlEquivalent: safeText(input.agentControlEquivalent, 2_048), classification: 'UNCLASSIFIED', state: 'DISCOVERED', experiment: null, measuredOutcome: null, finalDecision: null, evidence: safeList(input.evidence), createdAt: at, updatedAt: at, history: [{at, from: null, to: 'DISCOVERED', actor: safeIdentifier(input.actor), reason: 'capability candidate recorded'}]};
    validateCandidate(candidate); this.candidates.set(id, structuredClone(candidate)); this.save(); return structuredClone(candidate);
  }

  transitionCandidate(id: string, input: {to: CapabilityCandidateState; actor: string; reason: string; classification?: CapabilityCandidateClassification; experiment?: string; measuredOutcome?: string; finalDecision?: string; evidence?: string[]; at?: string}) {
    const candidate = this.candidates.get(id); if (!candidate) throw new Error('capability_candidate_missing'); if (!transitions[candidate.state].includes(input.to)) throw new Error(`capability_candidate_transition_invalid:${candidate.state}:${input.to}`);
    if (input.to === 'CLASSIFIED' && !input.classification) throw new Error('capability_candidate_classification_required');
    if (['ADOPTED','REJECTED','DEFERRED'].includes(input.to) && !input.finalDecision?.trim()) throw new Error('capability_candidate_decision_required');
    const at = input.at ?? new Date().toISOString(), from = candidate.state; candidate.state = input.to; candidate.updatedAt = at; if (input.classification) candidate.classification = input.classification; if (input.experiment !== undefined) candidate.experiment = safeText(input.experiment, 4_096); if (input.measuredOutcome !== undefined) candidate.measuredOutcome = safeText(input.measuredOutcome, 4_096); if (input.finalDecision !== undefined) candidate.finalDecision = safeText(input.finalDecision, 4_096); if (input.evidence) candidate.evidence = safeList([...candidate.evidence, ...input.evidence]); candidate.history.push({at, from, to: input.to, actor: safeIdentifier(input.actor), reason: safeText(input.reason, 2_048)}); validateCandidate(candidate); this.save(); return structuredClone(candidate);
  }

  listCandidates() { return [...this.candidates.values()].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).map(item => structuredClone(item)); }
  candidate(id: string) { const item = this.candidates.get(id); return item ? structuredClone(item) : undefined; }
  projection() {
    const observations = this.listObservations(), latestByKey = new Map<string, CapabilityObservation>(); for (const item of observations) latestByKey.set(`${subjectKey(item.subject)}\u0000${item.capabilityId}`, item);
    return {schema: 'agent-control.capability-intelligence/v1' as const, observedAt: new Date().toISOString(), capabilities: [...latestByKey.values()].sort((left, right) => left.capabilityId.localeCompare(right.capabilityId)), candidates: this.listCandidates(), totals: {observations: observations.length, candidates: this.candidates.size, adopted: this.listCandidates().filter(item => item.state === 'ADOPTED').length, underTest: this.listCandidates().filter(item => ['EXPERIMENT','QUALIFICATION'].includes(item.state)).length}};
  }
  private save() { if (!this.file) return; fs.mkdirSync(path.dirname(this.file), {recursive: true}); const temporary = `${this.file}.${process.pid}.tmp`, snapshot: CapabilitySnapshot = {schema: 'agent-control.capability-intelligence/v1', observations: this.listObservations(), candidates: this.listCandidates()}; fs.writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, {mode: 0o600}); fs.renameSync(temporary, this.file); }
}

export interface CapabilityRouteCandidate {id: string; subject: CapabilitySubject; available: boolean; qualificationConfidence: number; quality: number; reliability: number; estimatedCost: number; estimatedLatencyMs: number; tokenEfficiency: number; cacheEfficiency: number; local: boolean; privacyCompatible: boolean; rateLimited?: boolean; accountAvailable?: boolean; nodeHealthy?: boolean}
export function rankCapabilityRoutes(store: CapabilityIntelligenceStore, candidates: CapabilityRouteCandidate[], input: {required: string[]; nativePreferred?: string[]; allowEmulated?: boolean; costWeight?: number; latencyWeight?: number}) {
  const nativePreferred = new Set((input.nativePreferred ?? []).map(normalizeCapabilityId)), maxCost = Math.max(.000001, ...candidates.map(item => item.estimatedCost)), maxLatency = Math.max(1, ...candidates.map(item => item.estimatedLatencyMs));
  const considered = candidates.map(candidate => {
    const capabilities = store.assess(candidate.subject, input.required, {allowEmulated: input.allowEmulated !== false}), reasons: string[] = [];
    if (!candidate.available) reasons.push('route-unavailable'); if (candidate.rateLimited) reasons.push('rate-limited'); if (candidate.accountAvailable === false) reasons.push('account-unavailable'); if (candidate.nodeHealthy === false) reasons.push('node-unhealthy'); if (!candidate.privacyCompatible) reasons.push('privacy-policy-mismatch'); for (const item of capabilities) if (!item.satisfied) reasons.push(`${item.capabilityId}:${item.reason}`);
    const eligible = reasons.length === 0, nativeAdvantage = capabilities.filter(item => item.implementation === 'NATIVE' && nativePreferred.has(item.capabilityId)).length;
    const score = eligible ? candidate.quality * 4 + candidate.reliability * 3 + candidate.qualificationConfidence * 2 + candidate.tokenEfficiency + candidate.cacheEfficiency + nativeAdvantage * .5 + (1 - candidate.estimatedCost / maxCost) * (input.costWeight ?? 1) + (1 - candidate.estimatedLatencyMs / maxLatency) * (input.latencyWeight ?? 1) + (candidate.local ? .1 : 0) : null;
    return {candidate: structuredClone(candidate), capabilities, eligible, score, reasons: eligible ? ['all-required-capabilities-verified'] : reasons};
  });
  const selected = considered.filter(item => item.eligible).sort((left, right) => (right.score ?? -Infinity) - (left.score ?? -Infinity) || left.candidate.id.localeCompare(right.candidate.id))[0]; if (!selected) throw Object.assign(new Error('capability_route_unavailable'), {considered});
  return {selected: selected.candidate, considered, rationale: {capabilitiesFirst: true, selectedScore: selected.score, nativeUsed: selected.capabilities.filter(item => item.implementation === 'NATIVE').map(item => item.capabilityId), emulatedUsed: selected.capabilities.filter(item => item.implementation === 'AGENT_CONTROL_EMULATED').map(item => item.capabilityId)}};
}

export function normalizeCapabilityId(value: string) { const normalized = String(value).trim().toLowerCase().replace(/_/g, '-'); const alias = aliases[String(value).trim().toLowerCase()] ?? aliases[normalized]; const result = alias ?? normalized; if (!/^[a-z0-9][a-z0-9.-]{1,127}$/.test(result)) throw new Error('capability_id_invalid'); return result; }
export function capabilityEvidenceId(value: unknown) { return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`; }

/** Registers portable Agent Control implementations once, without claiming provider-native support. */
export function registerAgentControlCoreCapabilities(store: CapabilityIntelligenceStore, at = new Date().toISOString()) {
  const capabilities = [
    [genericCapabilityIds.contextRetrieval, 'Governed exact/relevance history retrieval'],
    [genericCapabilityIds.midTaskSteering, 'Durable steering amendments preserve the original goal'],
    [genericCapabilityIds.asynchronousQuestions, 'Dependency-scoped questions pause only affected stages'],
    [genericCapabilityIds.parallelExecution, 'Independent Work Parcel stages dispatch concurrently'],
    [genericCapabilityIds.remoteExecution, 'Managed-node transport executes governed remote work'],
    [genericCapabilityIds.resume, 'Durable ledgers retain recoverable execution state'],
    [genericCapabilityIds.longRunningGoals, 'Persistent Work Parcels survive individual invocations'],
    [genericCapabilityIds.backgroundExecution, 'Scheduler-owned execution continues without a live UI'],
    [genericCapabilityIds.contextLifecycle, 'Active state, immutable events, retrieval and baton views are separated'],
    [genericCapabilityIds.structuredToolCalls, 'Typed registered Actions form the tool boundary'],
  ] as const;
  for (const [capabilityId, limitation] of capabilities) {
    const id = `agent-control-core:${capabilityId}`;
    if (store.listObservations().some(item => item.id === id)) continue;
    store.observe({id, capabilityId, subject: {providerId: 'agent-control', runtimeId: 'agent-control-core'}, support: 'SUPPORTED', implementation: 'AGENT_CONTROL_EMULATED', verification: 'VERIFIED', confidence: 1, observedAt: at, qualifiedAt: at, limitations: [limitation], evidence: [`implementation:${capabilityId}`], source: 'AGENT_CONTROL_CORE'});
  }
  return store.projection();
}

function validateObservation(value: CapabilityObservation) { if (value.schema !== 'agent-control.capability-observation/v1' || !value.id || normalizeCapabilityId(value.capabilityId) !== value.capabilityId || !['SUPPORTED','UNSUPPORTED','UNKNOWN'].includes(value.support) || !['NATIVE','AGENT_CONTROL_EMULATED','NONE'].includes(value.implementation) || !['VERIFIED','UNVERIFIED','FAILED'].includes(value.verification) || value.confidence < 0 || value.confidence > 1 || Number.isNaN(Date.parse(value.observedAt)) || value.qualifiedAt && Number.isNaN(Date.parse(value.qualifiedAt))) throw new Error('capability_observation_invalid'); }
function validateCandidate(value: CapabilityCandidate) { if (value.schema !== 'agent-control.capability-candidate/v1' || !value.id || !transitions[value.state] || !['GENERIC','PROVIDER_SPECIFIC','NOT_USEFUL','UNCLASSIFIED'].includes(value.classification) || !value.history.length) throw new Error('capability_candidate_invalid'); }
function subjectMatches(observed: CapabilitySubject, requested: CapabilitySubject) { return observed.providerId === requested.providerId && (!observed.modelId || observed.modelId === requested.modelId) && (!observed.accountProfileId || observed.accountProfileId === requested.accountProfileId) && (!observed.runtimeId || observed.runtimeId === requested.runtimeId) && (!observed.runtimeVersion || observed.runtimeVersion === requested.runtimeVersion) && (!observed.nodeId || observed.nodeId === requested.nodeId); }
function subjectKey(subject: CapabilitySubject) { return [subject.providerId, subject.accountProfileId ?? '', subject.modelId ?? '', subject.runtimeId ?? '', subject.runtimeVersion ?? '', subject.nodeId ?? ''].join('/'); }
function sanitizeSubject(subject: CapabilitySubject): CapabilitySubject { return {providerId: safeIdentifier(subject.providerId), ...(subject.modelId ? {modelId: safeIdentifier(subject.modelId)} : {}), ...(subject.accountProfileId ? {accountProfileId: safeIdentifier(subject.accountProfileId)} : {}), ...(subject.runtimeId ? {runtimeId: safeIdentifier(subject.runtimeId)} : {}), ...(subject.runtimeVersion ? {runtimeVersion: safeText(subject.runtimeVersion, 128)} : {}), ...(subject.nodeId ? {nodeId: safeIdentifier(subject.nodeId)} : {})}; }
function newest(left: CapabilityObservation, right: CapabilityObservation) { return Date.parse(right.observedAt) - Date.parse(left.observedAt) || right.id.localeCompare(left.id); }
function bestObservation(left: CapabilityObservation, right: CapabilityObservation) {
  const authority = (value: CapabilityObservation) => ['QUALIFICATION','AGENT_CONTROL_CORE'].includes(value.source) ? 3 : value.verification === 'VERIFIED' || value.verification === 'FAILED' ? 2 : 1;
  const specificity = (value: CapabilityObservation) => ['modelId','accountProfileId','runtimeId','runtimeVersion','nodeId'].filter(key => Boolean(value.subject[key as keyof CapabilitySubject])).length;
  return authority(right) - authority(left) || specificity(right) - specificity(left) || newest(left, right);
}
function safeList(values: string[]) { return [...new Set(values.map(value => safeText(value, 2_048)).filter(Boolean))]; }
function safeText(value: string, max: number) { const redacted = redactSensitiveText(String(value)).replace(/[\r\n]+/g, ' ').trim(); return redacted.length <= max ? redacted : `${redacted.slice(0, max - 3)}...`; }
function safeIdentifier(value: string) { const result = safeText(value, 256); if (!/^[a-z0-9][a-z0-9:._/-]*$/i.test(result)) throw new Error('capability_subject_identity_invalid'); return result; }
function clamp(value: number) { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); }
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`; return JSON.stringify(value); }

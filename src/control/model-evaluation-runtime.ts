import {createHash} from 'node:crypto';
import type {FetchLike, ModelInvocationResult} from './openai-compatible-provider.js';
import {OpenAICompatibleProviderClient} from './openai-compatible-provider.js';
import type {ModelConfig} from './config.js';
import {CodexRepositoryReviewClient} from './codex-repository-review-client.js';
import type {CodexNodeExecutionPort} from './codex-node-execution.js';
import {createInvocationObservation} from './harness-efficiency.js';
import {calculateVersionedApiCost, type InvocationCostAccounting, type TokenUsageForCost} from './cost-accounting.js';
import type {CapabilityIntelligenceStore} from './capability-intelligence.js';
import type {ModelRegistry} from './model-registry.js';
import {resolveProviderAccountCredential} from './provider-credential-store.js';
import {
  ModelEvaluationCoordinator,
  type FrozenQualificationTask,
  type ModelCandidateIdentity,
  type ModelEvaluationExecutionResult,
  type ModelEvaluationExecutorPort,
} from './model-intelligence.js';

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    answer: {type: 'string'},
    evidence: {type: 'array', items: {type: 'string'}, maxItems: 12},
  },
  required: ['answer', 'evidence'],
  additionalProperties: false,
} as const;

interface EvaluationAnswer {answer: string; evidence: string[]}
export interface ModelEvaluationRuntimeEvent {batchId: string; candidate: ModelCandidateIdentity; taskId: string; phase: 'STARTED' | 'REQUEST_STARTED' | 'REQUEST_COMPLETED' | 'REQUEST_FAILED' | 'COMPLETED' | 'UNAVAILABLE'; at: string; detail: string}

/**
 * Executes the portable, structured-response portion of the frozen suite.
 * Browser, computer-use and multi-stage workflow fixtures require their own
 * governed adapters and remain explicitly unavailable when one is not bound.
 */
export class ProviderNeutralModelEvaluationExecutor implements ModelEvaluationExecutorPort {
  constructor(
    private readonly registry: ModelRegistry,
    private readonly capabilities: CapabilityIntelligenceStore,
    private readonly nodeExecution: CodexNodeExecutionPort,
    private readonly fetcher: FetchLike = fetch,
    private readonly publish: (event: ModelEvaluationRuntimeEvent) => void = () => {},
  ) {}

  async execute(input: Parameters<ModelEvaluationExecutorPort['execute']>[0]): Promise<ModelEvaluationExecutionResult> {
    const {batch, candidate, task} = input;
    this.publish({batchId: batch.id, candidate, taskId: task.id, phase: 'STARTED', at: new Date().toISOString(), detail: task.fixture.execution});
    if (task.fixture.execution !== 'MODEL_STRUCTURED') {
      this.publish({batchId: batch.id, candidate, taskId: task.id, phase: 'UNAVAILABLE', at: new Date().toISOString(), detail: `capability_unavailable:evaluation_adapter:${task.fixture.execution.toLowerCase()}`});
      throw new Error(`capability_unavailable:evaluation_adapter:${task.fixture.execution.toLowerCase()}`);
    }
    const model = this.registry.model(candidate.modelId); if (!model) throw new Error('model_missing');
    const provider = this.registry.provider(candidate.providerId); if (!provider) throw new Error('provider_missing');
    if (model.provider !== candidate.providerId || model.providerModel !== candidate.providerModel || (model.accountProfile ?? null) !== (candidate.accountProfileId ?? null)) throw new Error('model_evaluation_candidate_identity_mismatch');
    const capabilitySubject = {providerId: candidate.providerId, modelId: candidate.modelId, ...(candidate.accountProfileId ? {accountProfileId: candidate.accountProfileId} : {}), nodeId: candidate.nodeId}, assessments = this.capabilities.assess(capabilitySubject, task.requiredCapabilities, {verifiedOnly: false});
    if (assessments.some(item => !item.satisfied)) throw new Error(`capability_unavailable:${assessments.filter(item => !item.satisfied).map(item => item.capabilityId).join(',')}`);
    const route = this.registry.route({model: model.id, accountProfile: candidate.accountProfileId, nodeId: candidate.nodeId, requiredCapabilities: task.requiredCapabilities, allowFallback: false, purpose: 'QUALIFICATION'});
    if (route.modelId !== candidate.modelId || route.providerId !== candidate.providerId || (route.accountProfileId ?? null) !== (candidate.accountProfileId ?? null) || route.nodeId !== candidate.nodeId) throw new Error('model_evaluation_route_identity_mismatch');
    const account = candidate.accountProfileId ? requiredAccount(this.registry, provider.id, candidate.accountProfileId) : undefined;
    const client = provider.kind === 'cli'
      ? new CodexRepositoryReviewClient(provider, requiredAccount(this.registry, provider.id, candidate.accountProfileId), candidate.nodeId, this.nodeExecution)
      : new OpenAICompatibleProviderClient(provider, this.fetcher, account ? () => resolveProviderAccountCredential(provider, account, process.env, undefined, candidate.nodeId) : undefined, {accountProfileId: account?.id, nodeId: candidate.nodeId});
    const instruction = `${task.fixture.instruction}\n\nReturn only the requested structured object. Put the concise result in answer and independently checkable support in evidence.`;
    this.publish({batchId: batch.id, candidate, taskId: task.id, phase: 'REQUEST_STARTED', at: new Date().toISOString(), detail: 'provider-invocation'});
    let result: ModelInvocationResult;
    try {
      result = await client.invoke(model, instruction, {structured: true, outputSchema: RESULT_SCHEMA, maximumOutputTokens: Math.min(model.limits?.outputTokens ?? 2_048, 2_048), timeoutMs: task.maximumDurationMs});
      this.publish({batchId: batch.id, candidate, taskId: task.id, phase: 'REQUEST_COMPLETED', at: new Date().toISOString(), detail: `finish:${result.finishReason ?? 'UNKNOWN'}`});
    } catch (error) {
      this.publish({batchId: batch.id, candidate, taskId: task.id, phase: 'REQUEST_FAILED', at: new Date().toISOString(), detail: 'provider-invocation-failed'});
      throw error;
    }
    const scored = score(task, result.output), observation = observationFor(batch.id, task, candidate, model, result);
    if (scored.passed) for (const capabilityId of task.requiredCapabilities) this.capabilities.observe({id: `model-evaluation:${batch.id}:${batch.suiteSha256}:${candidate.providerId}:${candidate.accountProfileId ?? 'default'}:${candidate.modelId}:${candidate.nodeId}:${task.id}:${input.repetition}:${capabilityId}`, capabilityId, subject: capabilitySubject, support: 'SUPPORTED', implementation: 'NATIVE', verification: 'VERIFIED', confidence: 1, observedAt: observation.completedAt ?? new Date().toISOString(), qualifiedAt: observation.completedAt ?? new Date().toISOString(), limitations: [], evidence: [`attempt:${batch.id}:${task.id}:${input.repetition}`, `response:${sha(result.output)}`], source: 'QUALIFICATION'});
    this.publish({batchId: batch.id, candidate, taskId: task.id, phase: 'COMPLETED', at: resultTimestamp(observation.completedAt), detail: scored.passed ? 'verified-pass' : 'verification-failed'});
    return {observation, score: scored.score, passed: scored.passed, criticalFailure: task.safetyCritical === true && !scored.passed, evidence: [`response:${sha(result.output)}`], capabilitiesObserved: scored.passed ? [...task.requiredCapabilities] : [], ...(scored.passed ? {} : {failureClass: 'VERIFICATION_FAILED'})};
  }
}

export function startModelEvaluationScheduler(coordinator: ModelEvaluationCoordinator, onChange: (batchId: string, status: string) => void, intervalMs = 1_000, onError: (error: Error) => void = () => {}) {
  let active = false, stopped = false;
  const tick = async () => {
    if (active || stopped) return;
    active = true;
    try { const result = await coordinator.runNext(); if (result) onChange(result.id, result.status); }
    catch (error) { onError(error instanceof Error ? error : new Error(String(error))); }
    finally { active = false; }
  };
  const timer = setInterval(() => void tick(), intervalMs); timer.unref();
  const initial = setTimeout(() => void tick(), 0); initial.unref();
  return () => { stopped = true; clearInterval(timer); clearTimeout(initial); };
}

function requiredAccount(registry: ModelRegistry, providerId: string, accountProfileId?: string) { if (!accountProfileId) throw new Error('account_profile_missing'); const account = registry.accountProfile(providerId, accountProfileId); if (!account) throw new Error('account_profile_missing'); return account; }
function score(task: FrozenQualificationTask, raw: string) {
  let value: EvaluationAnswer | undefined;
  try { const parsed = JSON.parse(raw) as Partial<EvaluationAnswer>; if (typeof parsed.answer === 'string' && Array.isArray(parsed.evidence) && parsed.evidence.every(item => typeof item === 'string')) value = {answer: parsed.answer, evidence: parsed.evidence}; } catch {}
  if (!value) return {score: 0, passed: false};
  const corpus = `${value.answer}\n${value.evidence.join('\n')}`.toLowerCase(), expected = task.fixture.expectedEvidence, matched = expected.filter(item => corpus.includes(item.toLowerCase())).length, forbidden = task.fixture.forbiddenEvidence.some(item => corpus.includes(item.toLowerCase()));
  const score = forbidden ? 0 : Math.round(task.scorer.maximumScore * matched / expected.length);
  return {score, passed: score >= task.scorer.passScore};
}
function observationFor(batchId: string, task: FrozenQualificationTask, candidate: ModelCandidateIdentity, model: ModelConfig, result: ModelInvocationResult) {
  const completedAt = new Date().toISOString(), startedAt = new Date(Date.parse(completedAt) - result.elapsedMs).toISOString(), usage = result.usage, rawUsage = {input_tokens: usage.inputTokens, input_tokens_details: {cached_tokens: usage.cachedInputTokens, cache_write_tokens: usage.cacheWriteTokens}, output_tokens: usage.outputTokens, total_tokens: usage.totalTokens}, costAccounting = evaluationCostAccounting(candidate, model, usage);
  return createInvocationObservation({jobId: 'model-frozen-qualification', taskId: task.id, laneId: `model-evaluation:${batchId}`, model: candidate.modelId, provider: candidate.providerId, ...(candidate.accountProfileId ? {accountProfileId: candidate.accountProfileId} : {}), harnessProfile: 'THIN', executionStrategy: `frozen-suite:${task.fixture.execution.toLowerCase()}`, startedAt, completedAt, rawUsage, ...(usage.providerReportedCost === null ? {} : {providerReportedCost: usage.providerReportedCost}), ...(costAccounting ? {costAccounting} : {}), finishReason: result.finishReason ?? undefined, outcome: 'COMPLETE', recipeFingerprint: sha({suiteTask: task.id, taskVersion: task.version, inputSha256: task.inputSha256, candidate}), evidenceIds: [`response:${sha(result.output)}`]});
}
function evaluationCostAccounting(candidate: ModelCandidateIdentity, model: ModelConfig, usage: ModelInvocationResult['usage']): InvocationCostAccounting | undefined {
  if (!model.pricing) return undefined;
  const freshInputTokens = usage.inputTokens === null || usage.cachedInputTokens === null && model.pricing.cachedInputPerMillionTokens !== undefined || usage.cacheWriteTokens == null && model.pricing.cacheWritePerMillionTokens !== undefined ? null : Math.max(0, usage.inputTokens - (usage.cachedInputTokens ?? 0) - (usage.cacheWriteTokens ?? 0));
  const normalized: TokenUsageForCost = {inputTokens: usage.inputTokens, freshInputTokens, cachedInputTokens: usage.cachedInputTokens, cacheWriteTokens: usage.cacheWriteTokens ?? null, outputTokens: usage.outputTokens, reasoningTokens: null};
  const pricingBasis = {tableId: `model-config:${model.id}`, version: sha(model.pricing).slice(0, 16), effectiveAt: new Date(model.pricing.effectiveFrom).toISOString(), source: model.pricing.source, provider: candidate.providerId, model: candidate.providerModel, currency: model.pricing.currency, inputPerMillionTokens: model.pricing.inputPerMillionTokens, ...(model.pricing.cachedInputPerMillionTokens === undefined ? {} : {cachedInputPerMillionTokens: model.pricing.cachedInputPerMillionTokens}), ...(model.pricing.cacheWritePerMillionTokens === undefined ? {} : {cacheWritePerMillionTokens: model.pricing.cacheWritePerMillionTokens}), outputPerMillionTokens: model.pricing.outputPerMillionTokens};
  return {billingMode: 'API_METERED', cloud: {usage: normalized, pricingBasis, calculatedApiCost: calculateVersionedApiCost(normalized, pricingBasis)}};
}
function resultTimestamp(value: string | null) { return value ?? new Date().toISOString(); }
function sha(value: unknown) { return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex'); }

import {legacyDecimal} from './usage-accounting.js';
import {createInvocationObservation, type HarnessEfficiencyLedgerPort} from './harness-efficiency.js';
import {safeTranscriptText} from './execution-history.js';
import {renderProviderPrompt} from './provider-prompt.js';
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import type {ModelConfig, ProviderAccountProfileConfig, ProviderConfig} from './config.js';
import {CodexRepositoryReviewClient} from './codex-repository-review-client.js';
import type {ContractExecutionRuntime} from './contract-runtime.js';
import type {GovernedHandoffRuntime} from './handoff-runtime.js';
import type {ModelRegistry, ModelRouteDecision, ModelRegistryRow} from './model-registry.js';
import {
  calculateModelUsageCost,
  OpenAICompatibleProviderClient,
  type ModelInvocationResult,
  type PartialModelInvocation,
  type ProviderFailureObservation,
  type ProviderInvocationTelemetry,
} from './openai-compatible-provider.js';
import type {RepositoryReviewExecutor, RepositoryReviewResult, ReviewExecutionRequest, ReviewExecutionResponse} from './parameterized-job-types.js';
import type {TokenAwareBatonRuntime, VerifiedBaton} from './token-aware-baton-routing.js';
import {LocalCodexNodeExecutionPort, type CodexNodeExecutionPort} from './codex-node-execution.js';
import {WorkParcelStore, type WorkParcel} from './work-parcels.js';
import {evidencePacketContextSource, evidenceReferences, type GovernedRetrievalRuntime, type RetrievedEvidenceContextCompiler} from './governed-retrieval.js';
import {accountProviderExecutionNode} from './provider-account-profile.js';
import {resolveProviderAccountCredential} from './provider-credential-store.js';
import type {ProviderPrompt, ProviderPromptInput} from './provider-prompt.js';
import {classifyExecutionFailure} from './execution-recovery.js';
import {defaultProviderAdapterRegistry, type ProviderAdapterRegistry} from './provider-catalog.js';
import type {AdaptiveOrchestrationRuntime} from './adaptive-orchestration.js';
import type {ExecutionSessionScope} from './execution-session.js';
import {createTransportContext, dependency, TransportIntegrityRuntime} from './transport-integrity.js';

type ReviewChunk = ReviewExecutionRequest['contextChunks'][number];
type PreparedReviewChunk = ReviewChunk & {evidenceReferences?: string[]; evidencePacketId?: string};
type InvocationOptions = Parameters<OpenAICompatibleProviderClient['invoke']>[2];

export interface RepositoryReviewProviderClient {
  invoke(model: ModelConfig, input: ProviderPromptInput, options?: InvocationOptions): Promise<ModelInvocationResult & {nodeId?: string}>;
}

export interface RepositoryReviewTokenLifecycle {
  routing: TokenAwareBatonRuntime;
  contracts: ContractExecutionRuntime;
  handoffs: GovernedHandoffRuntime;
}

export type RepositoryReviewProviderClientFactory = (provider: ProviderConfig, account?: ProviderAccountProfileConfig, route?: ModelRouteDecision) => RepositoryReviewProviderClient;

export interface RepositoryReviewQualityGateResult {
  accepted: boolean;
  code: string;
  summary: string;
  evidence: string[];
  unresolvedCriteria: string[];
  nextAction: string;
}

export interface RepositoryReviewQualityGateInput {
  request: ReviewExecutionRequest;
  chunk: ReviewChunk;
  result: RepositoryReviewResult;
  route: ModelRouteDecision;
  responseHash: string;
}

/** An independent, preconfigured acceptance boundary. It must not use private model reasoning. */
export interface RepositoryReviewQualityGate {
  evaluate(input: RepositoryReviewQualityGateInput): RepositoryReviewQualityGateResult | Promise<RepositoryReviewQualityGateResult>;
}

interface ExecutionTotals {
  accountedInvocations: number;
  inputTokens: number;
  freshInputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  totalTokens: number;
  providerReportedCost: number;
  calculatedCost: number;
  currency?: string;
  completeTokens: boolean;
  completeFreshInput: boolean;
  completeCachedInput: boolean;
  completeCacheWrite: boolean;
  completeProviderCost: boolean;
  completeCalculatedCost: boolean;
  unknownUsageInvocations: number;
}

export class DirectRepositoryReviewExecutor implements RepositoryReviewExecutor {
  private readonly routing?: TokenAwareBatonRuntime;
  private readonly acceptedExchanges = new WeakMap<ModelInvocationResult, NonNullable<WorkParcel["audit"]["invocations"][number]["exchange"]>>();

  constructor(
    private readonly models: ModelRegistry,
    private readonly parcels: WorkParcelStore,
    tokenRouting?: TokenAwareBatonRuntime,
    private readonly lifecycle?: RepositoryReviewTokenLifecycle,
    private readonly clients?: RepositoryReviewProviderClientFactory,
    private readonly nodeExecution: CodexNodeExecutionPort = new LocalCodexNodeExecutionPort(),
    private readonly retrieval?: GovernedRetrievalRuntime,
    private readonly evidenceCompiler?: RetrievedEvidenceContextCompiler,
    private readonly qualityGate?: RepositoryReviewQualityGate,
    private readonly providerAdapters: ProviderAdapterRegistry = defaultProviderAdapterRegistry(),
    private readonly adaptiveOrchestration?: AdaptiveOrchestrationRuntime,
    private readonly transportIntegrity?: TransportIntegrityRuntime,
    private readonly usageLedger?: HarnessEfficiencyLedgerPort,
  ) {
    this.routing = lifecycle?.routing ?? tokenRouting;
  }

  async execute(request: ReviewExecutionRequest): Promise<ReviewExecutionResponse> {
    if (!Number.isSafeInteger(request.executionAttempt) || request.executionAttempt < 1) throw new Error('repository_review_execution_attempt_invalid');
    this.routeConfiguration(request.route);
    const results: RepositoryReviewResult[] = [];
    const parcelIds: string[] = [];
    const responseIds: string[] = [];
    const retrievalEvidence: string[] = [];
    const governedFallbacks: NonNullable<ReviewExecutionResponse['governedFallbacks']> = [];
    const totals: ExecutionTotals = {
      accountedInvocations: 0,
      inputTokens: 0,
      freshInputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      providerReportedCost: 0,
      calculatedCost: 0,
      completeTokens: true,
      completeFreshInput: true,
      completeCachedInput: true,
      completeCacheWrite: true,
      completeProviderCost: true,
      completeCalculatedCost: true,
      unknownUsageInvocations: 0,
    };

    const capture = (parcel: WorkParcel, invocation: ModelInvocationResult, route: ModelRouteDecision, responseHash: string) => {
      totals.accountedInvocations++;
      responseIds.push(responseHash);
      accountUsage(totals, invocation.usage);
      this.recordInvocation(parcel, invocation, request, route, responseHash);
    };

    let chunkIndex = 0;
    while (chunkIndex < request.contextChunks.length) {
      const originalChunk = request.contextChunks[chunkIndex];
      const parcel = this.createParcel(request, originalChunk.id);
      const chunk = await this.prepareChunk(request, parcel, originalChunk, retrievalEvidence);
      parcelIds.push(parcel.id);
      request.onParcelCreated?.(parcel.id);
      try {
        const source = await this.invokeChunk(request, request.route, parcel, chunk);
        capture(parcel, source.invocation, request.route, source.responseHash);
        this.requireComplete(source.invocation);
        const sourceQuality = await this.assessQuality(request, parcel, chunk, source.result, request.route, source.responseHash);
        let acceptedResult = source.result, qualityEscalated = false;
        if (sourceQuality && !sourceQuality.accepted) {
          acceptedResult = await this.tryGovernedQualityEscalation(request, parcel, chunk, source, sourceQuality, capture, totals);
          qualityEscalated = true;
        }
        results.push(acceptedResult);
        this.requireWithinBudget(request, totals);

        const nextOriginal = request.contextChunks[chunkIndex + 1];
        const nextChunk = nextOriginal ? await this.prepareChunk(request, parcel, nextOriginal, retrievalEvidence) : undefined;
        const handoff = nextChunk && !qualityEscalated ? await this.tryGovernedContinuation(request, parcel, chunk, nextChunk, source, capture, totals, results) : false;
        if (handoff) chunkIndex += 2;
        else chunkIndex++;
        this.finishParcel(parcel, 'SUCCEEDED', handoff ? 'Governed token-aware continuation completed' : `Provider ${source.invocation.providerId}; model ${source.invocation.modelId}; structured review returned`);
      } catch (error) {
        const partial = (error as {partialInvocation?: PartialModelInvocation}).partialInvocation;
        if (partial && !responseIds.includes(partial.responseHash)) capture(parcel, partial, request.route, partial.responseHash);
        else if (!partial) this.recordFailedInvocation(parcel, error, request, request.route, totals);
        let terminalError: unknown = error;
        try {
          const fallback = await this.tryGovernedProviderFailureFallback(request, parcel, chunk, error, partial, capture, totals);
          if (fallback) {
            results.push(fallback.result);
            governedFallbacks.push(fallback.transition);
            this.requireWithinBudget(request, totals);
            chunkIndex++;
            this.finishParcel(parcel, 'SUCCEEDED', `Governed provider-failure continuation completed through ${fallback.transition.selectedProvider}/${fallback.transition.selectedModel}`);
            continue;
          }
        } catch (handoffError) { terminalError = handoffError; }
        this.finishParcel(parcel, 'FAILED', message(terminalError));
        this.recordAdaptiveFailure(parcel, request.route, message(terminalError));
        throw Object.assign(terminalError instanceof Error ? terminalError : new Error(String(terminalError)), {
          workParcelIds: [...parcelIds],
          evidence: [...responseIds.map(id => `provider_response_${id}`), ...retrievalEvidence],
          providerResponseIds: [...responseIds],
          usage: usage(totals),
        });
      }
    }

    const integrity = parcelIds.map(id => this.parcels.get(id)?.transportIntegrity).find(Boolean);
    return {
      result: consolidate(results),
      usage: usage(totals),
      evidence: [...responseIds.map(id => `provider_response_${id}`), ...retrievalEvidence],
      providerResponseIds: responseIds,
      workParcelIds: parcelIds,
      ...(governedFallbacks.length ? {governedFallbacks} : {}),
      ...(integrity ? {transportIntegrity: {recordId: integrity.id, contractSha256: integrity.contractSha256, state: integrity.state, ...(integrity.batonSha256 ? {batonSha256: integrity.batonSha256} : {})}} : {}),
    };
  }

  recordVerification(workParcelIds: string[], verdict: RepositoryReviewResult['verdict']) {
    const at = new Date().toISOString(), accepted = verdict === 'PASS' || verdict === 'PASS_WITH_FINDINGS';
    for (const id of workParcelIds) {
      const parcel = this.parcels.get(id);
      if (!parcel || parcel.executionOwner !== 'direct-repository-review-executor') continue;
      for (const invocation of parcel.audit.invocations) if (invocation.verifierResult === 'pending-repository-validation') invocation.verifierResult = verdict;
      parcel.audit.timeline.push({id: `audit-${randomUUID()}`, at, type: 'verification.completed', stageId: 'review', summary: `Independent repository validation: ${verdict}`, detail: `Parameterized Job validation ${accepted ? 'accepted' : 'rejected'} the consolidated repository-review result`});
      parcel.provenance.push({at, type: 'verification.completed', detail: verdict});
      this.parcels.update(parcel);
      const accountingIds=parcel.audit.invocations.flatMap(invocation=>invocation.accountingInvocationId?[invocation.accountingInvocationId]:[]);
      if(accountingIds.length)this.usageLedger?.markVerification(accountingIds,accepted?'PASS':'FAIL',accepted?'SUCCEEDED':'FAILED');
      this.verifyGovernedContract(parcel, verdict, at);
      if (this.transportIntegrity && parcel.transportIntegrity) {
        const integrity = this.transportIntegrity.independentInspection(parcel.id, {inspectorId: `parameterized-job-validator:${parcel.id}`, generatorId: parcel.actor, method: 'repository-review-schema-and-frozen-snapshot-validation', result: verdict === 'FAILED' ? 'FAILED' : 'PASSED'});
        parcel.transportIntegrity = integrity;
        parcel.audit.timeline.push({id: `audit-${randomUUID()}`, at, type: 'transport.inspection', stageId: 'review', summary: `Independent transport inspection ${integrity.independentInspection?.result}`, detail: integrity.verificationMethod});
        this.parcels.update(parcel);
      }
      if (this.adaptiveOrchestration && parcel.audit.orchestrationDecisionId) for (const invocation of parcel.audit.invocations) {
        this.adaptiveOrchestration.recordOutcome({
          decisionId: parcel.audit.orchestrationDecisionId,
          parcelId: parcel.id,
          observationId: invocation.id,
          stageId: 'review',
          route: {providerId: invocation.provider, modelId: invocation.model, accountProfileId: invocation.accountProfileId ?? null, nodeId: invocation.node, modelVersion: invocation.qualificationVersion ?? null},
          capabilities: this.models.qualification(invocation.registryModelId ?? invocation.model).capabilities,
          workflow: {id: 'repository-review', version: '1'},
          evidenceKind: 'PRODUCTION_WORK_PARCEL',
          outcome: verdict === 'FAILED' ? 'FAILED' : verdict === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'SUCCEEDED',
          verified: true,
          qualityScore: verdict === 'FAILED' ? 0 : verdict === 'REVIEW_REQUIRED' ? .5 : 1,
          qualityGatePass: verdict !== 'FAILED',
          firstPass: true,
          latencyMs: invocation.elapsedMs,
          usage: {inputTokens: invocation.freshInputTokens === null ? null : invocation.freshInputTokens + (invocation.cachedInputTokens ?? 0), outputTokens: invocation.outputTokens, totalTokens: invocation.totalTokens, cachedInputTokens: invocation.cachedInputTokens},
          cost: invocation.providerReportedCost ?? invocation.calculatedCost,
          currency: invocation.currency ?? null,
          costAuthority: invocation.providerReportedCost !== null ? 'authoritative' : invocation.calculatedCost !== null ? 'estimated' : 'unavailable',
        });
      }
    }
  }

  private async tryGovernedProviderFailureFallback(
    request: ReviewExecutionRequest,
    parcel: WorkParcel,
    chunk: PreparedReviewChunk,
    error: unknown,
    partial: PartialModelInvocation | undefined,
    capture: (parcel: WorkParcel, invocation: ModelInvocationResult, route: ModelRouteDecision, responseHash: string) => void,
    totals: ExecutionTotals,
  ): Promise<{result: RepositoryReviewResult; transition: NonNullable<ReviewExecutionResponse['governedFallbacks']>[number]} | undefined> {
    const failure = classifyExecutionFailure(error);
    if (!failure.retryable || request.executionAttempt <= request.run.definition.budgets.maximumRetries) return undefined;
    const at = new Date().toISOString();
    parcel.audit.timeline.push({id: `audit-${randomUUID()}`, at, type: 'retry.exhausted', stageId: 'review', summary: 'Bounded same-route retry budget exhausted', detail: `Attempt ${request.executionAttempt}; classification ${failure.kind}; ${failure.safeReason}; model quality history unchanged`});
    parcel.provenance.push({at, type: 'provider-failure-classified', detail: `${failure.kind}:${failure.safeReason}`});
    this.parcels.update(parcel);
    if (!request.route.allowFallback || !this.routing || !this.lifecycle) return undefined;

    const threadId = `${request.executionId}:${chunk.id}`;
    const decision = this.routing.assess(threadId, {
      remainingWork: 'BOUNDED',
      reasoningState: 'COMPLETE',
      requiredCapabilities: request.route.requiredCapabilities?.length ? request.route.requiredCapabilities : ['repository-review'],
      candidates: this.routingCandidates(request.route, partial),
      trigger: {kind: 'PROVIDER_FAILURE', code: failure.kind, reason: failure.safeReason, evidence: [...new Set([request.executionId, ...(partial ? [partial.responseHash] : [])])]},
    });
    parcel.audit.timeline.push({id: `audit-${randomUUID()}`, at: decision.at, type: 'governor.decision', stageId: 'review', summary: `Governor ${decision.action}`, detail: `${decision.reason}; trigger ${failure.kind}; outcome ${decision.outcome}`});
    this.parcels.update(parcel);
    if (decision.action !== 'BATON_AND_HANDOFF' || !decision.target) return undefined;

    const requiredCapabilities = request.route.requiredCapabilities?.length ? request.route.requiredCapabilities : ['repository-review'];
    const targetRoute = this.models.route({model: decision.target.modelId, nodeId: request.route.workloadNodeId, workloadNodeId: request.route.workloadNodeId, providerExecutionNodeId: decision.target.providerExecutionNodeId ?? decision.target.nodeId, requiredCapabilities, allowFallback: false, purpose: 'EXECUTION'});
    if (targetRoute.providerId !== decision.target.providerId || targetRoute.accountProfileId !== (decision.target.accountProfileId ?? null) || targetRoute.providerExecutionNodeId !== (decision.target.providerExecutionNodeId ?? decision.target.nodeId ?? request.route.providerExecutionNodeId) || targetRoute.credentialNodeId !== (decision.target.credentialNodeId ?? null)) throw new Error('provider_failure_handoff_route_identity_changed');

    const baton = this.routing.createBaton({
      threadId,
      parcelId: parcel.id,
      providerId: request.route.providerId,
      nodeId: request.route.nodeId,
      workloadNodeId: request.route.workloadNodeId,
      providerExecutionNodeId: request.route.providerExecutionNodeId,
      credentialNodeId: request.route.credentialNodeId ?? undefined,
      accountProfileId: request.route.accountProfileId ?? undefined,
      accountLabel: request.route.accountLabel ?? undefined,
      accountPlan: request.route.accountPlan ?? undefined,
      accountPlanAuthority: request.route.accountPlanAuthority ?? undefined,
      accountQualification: request.route.accountQualification ?? undefined,
      accountAvailability: request.route.accountAvailability ?? undefined,
      modelId: request.route.modelId,
      objective: `${request.instruction}\nFrozen repository: ${request.run.repository?.name ?? 'repository'} at ${request.run.repository?.reviewedSha ?? 'unknown SHA'}`,
      completedWork: [`Frozen context ${chunk.id} prepared and sealed`, `${request.executionAttempt} bounded same-route execution attempt(s) recorded`, `Failure classified as ${failure.kind}; no model-quality judgment was recorded`],
      decisions: [decision.reason, `Retry budget ${request.run.definition.budgets.maximumRetries} exhausted`, 'Continue on a separately qualified route without discarding source evidence'],
      filesChanged: [],
      git: {sha: request.run.repository?.reviewedSha ?? 'unknown', dirty: request.run.repository?.dirty ?? false, diffSummary: request.run.repository?.dirty ? `Frozen snapshot includes dirty paths: ${request.run.repository.dirtyPaths.join(', ')}` : 'Frozen repository snapshot is clean'},
      testsAndEvidence: [...new Set([`frozen-context-sha256:${chunk.sha256}`, request.executionId, ...(partial ? [partial.responseHash] : [])])],
      evidenceReferences: chunk.evidenceReferences ?? [],
      unresolvedIssues: [`Provider route ${routeLabel(request.route)} did not return a usable result for ${chunk.id}`],
      nextAction: `Continue the same frozen repository review for ${chunk.id}; return a schema-valid result and submit it to independent validation`,
    });
    parcel.audit.timeline.push({id: `audit-${randomUUID()}`, at: baton.createdAt, type: 'baton.created', stageId: 'review', summary: 'Provider-failure continuation baton sealed', detail: `${baton.id}; sha256 ${baton.sha256}; source recoverable`});
    parcel.provenance.push({at: baton.createdAt, type: 'provider-failure-baton', detail: `${baton.id}:${baton.sha256}`});
    this.parcels.update(parcel);

    const sourceContract = this.ensureSourceContract(request, parcel, partial, request.executionId);
    let destinationContractId: string | undefined, destinationResult: RepositoryReviewResult | undefined;
    const handoffDecision = await this.routing.governedHandoff(threadId, baton.id, decision.target, this.lifecycle.handoffs, {
      outcome: 'DELEGATE', policy: 'AUTO', contractId: sourceContract.id, sourceActorId: sourceContract.active.actorId, sourceAgentId: sourceContract.active.agentId,
      target: {active: {actorId: actorId(targetRoute), agentId: agentId(targetRoute), modelId: targetRoute.modelId, providerId: targetRoute.providerId, accountProfileId: targetRoute.accountProfileId ?? undefined, runtimeId: `provider:${targetRoute.providerId}`, nodeId: targetRoute.nodeId, workloadNodeId: targetRoute.workloadNodeId, providerExecutionNodeId: targetRoute.providerExecutionNodeId, credentialNodeId: targetRoute.credentialNodeId ?? undefined}, process: {id: `provider-invocation:${request.run.id}:${chunk.id}:${targetRoute.modelId}`}, ptyId: `provider-pty:${request.run.id}:${chunk.id}:${targetRoute.modelId}`},
      requestedAuthority: ['repository-review'], budget: {}, child: {objective: baton.nextAction, completionCriteria: ['Return a schema-valid review for the unchanged frozen context', 'Pass the configured independent validation boundary']},
    }, async governed => {
      destinationContractId = governed.childContractId;
      let destination: Awaited<ReturnType<DirectRepositoryReviewExecutor['invokeChunk']>>;
      try { destination = await this.invokeChunk(request, targetRoute, parcel, chunk, baton, `${threadId}:provider-failure:${targetRoute.modelId}`); }
      catch (destinationError) { const destinationPartial = (destinationError as {partialInvocation?: PartialModelInvocation}).partialInvocation; if (destinationPartial) capture(parcel, destinationPartial, targetRoute, destinationPartial.responseHash); else this.recordFailedInvocation(parcel, destinationError, request, targetRoute, totals); throw destinationError; }
      capture(parcel, destination.invocation, targetRoute, destination.responseHash);
      this.requireComplete(destination.invocation);
      const destinationQuality = await this.assessQuality(request, parcel, chunk, destination.result, targetRoute, destination.responseHash);
      if (destinationQuality && !destinationQuality.accepted) throw new Error(`repository_review_quality_gate_failed_after_provider_fallback:${destinationQuality.code}`);
      destinationResult = destination.result;
    });

    if (handoffDecision.outcome !== 'SUCCEEDED' || !destinationResult || !destinationContractId) {
      if (destinationContractId) this.failDestinationContract(destinationContractId, handoffDecision.reason);
      const failedAt = new Date().toISOString();
      parcel.audit.timeline.push({id: `audit-${randomUUID()}`, at: failedAt, type: 'handoff.failed', stageId: 'review', summary: 'Governed provider-failure handoff failed closed', detail: `${handoffDecision.reason}; source thread remains recoverable`});
      parcel.provenance.push({at: failedAt, type: 'provider-failure-handoff-recovery', detail: threadId});
      this.parcels.update(parcel);
      throw new Error('repository_review_provider_failure_handoff_failed');
    }

    this.recordContract(parcel, destinationContractId, 'governed-verification-contract', `Provider-failure fallback selected ${targetRoute.providerId}/${targetRoute.modelId}; destination returned for independent validation`);
    const completedAt = new Date().toISOString();
    parcel.audit.timeline.push({id: `audit-${randomUUID()}`, at: completedAt, type: 'handoff.completed', stageId: 'review', summary: 'Governed provider-failure continuation completed', detail: `${routeLabel(request.route)} → ${routeLabel(targetRoute)}; baton ${baton.id}`});
    this.parcels.update(parcel);
    this.requireWithinBudget(request, totals);
    return {result: destinationResult, transition: {at: completedAt, reason: decision.reason, selectedModel: targetRoute.modelId, selectedProvider: targetRoute.providerId, batonId: baton.id, failureKind: failure.kind}};
  }

  private async assessQuality(request: ReviewExecutionRequest, parcel: WorkParcel, chunk: ReviewChunk, result: RepositoryReviewResult, route: ModelRouteDecision, responseHash: string) {
    if (!this.qualityGate) return undefined;
    const assessment = normalizeQualityGateResult(await this.qualityGate.evaluate({request, chunk, result, route, responseHash}));
    const at = new Date().toISOString();
    parcel.audit.timeline.push({id: `audit-${randomUUID()}`, at, type: 'verification.completed', stageId: 'review', summary: `Independent quality gate ${assessment.accepted ? 'accepted' : 'rejected'} ${route.providerId}/${route.modelId}`, detail: `${assessment.code}; ${assessment.summary}; evidence ${assessment.evidence.join(', ') || 'none'}; unresolved ${assessment.unresolvedCriteria.join(', ') || 'none'}`});
    parcel.provenance.push({at, type: assessment.accepted ? 'quality-gate-passed' : 'quality-gate-failed', detail: `${assessment.code}:${responseHash}`});
    this.parcels.update(parcel);
    return assessment;
  }

  private async tryGovernedQualityEscalation(
    request: ReviewExecutionRequest,
    parcel: WorkParcel,
    chunk: ReviewChunk,
    source: Awaited<ReturnType<DirectRepositoryReviewExecutor['invokeChunk']>>,
    quality: RepositoryReviewQualityGateResult,
    capture: (parcel: WorkParcel, invocation: ModelInvocationResult, route: ModelRouteDecision, responseHash: string) => void,
    totals: ExecutionTotals,
  ): Promise<RepositoryReviewResult> {
    if (!this.routing || !this.lifecycle) throw new Error(`repository_review_quality_gate_failed_lifecycle_unavailable:${quality.code}`);
    const decision = this.routing.assess(source.threadId, {
      remainingWork: 'DIFFICULT',
      reasoningState: 'UNFINISHED',
      requiredCapabilities: ['repository-review'],
      candidates: this.routingCandidates(request.route, source.invocation),
      trigger: {kind: 'QUALITY_GATE', code: quality.code, reason: quality.summary, evidence: [...new Set([source.responseHash, ...quality.evidence])]},
    });
    if (decision.action !== 'BATON_AND_HANDOFF' || !decision.target) throw new Error(`repository_review_quality_gate_failed_no_governed_fallback:${quality.code}`);

    const targetRoute = this.models.route({model: decision.target.modelId, nodeId: request.route.workloadNodeId, workloadNodeId: request.route.workloadNodeId, providerExecutionNodeId: decision.target.providerExecutionNodeId ?? decision.target.nodeId, requiredCapabilities: ['repository-review'], allowFallback: false});
    if (targetRoute.providerId !== decision.target.providerId || targetRoute.accountProfileId !== (decision.target.accountProfileId ?? null) || targetRoute.providerExecutionNodeId !== (decision.target.providerExecutionNodeId ?? decision.target.nodeId ?? request.route.providerExecutionNodeId) || targetRoute.credentialNodeId !== (decision.target.credentialNodeId ?? null)) throw new Error('quality_escalation_route_identity_changed');
    const baton = this.routing.createBaton({
      threadId: source.threadId,
      parcelId: parcel.id,
      providerId: source.invocation.providerId,
      nodeId: request.route.nodeId,
      workloadNodeId: request.route.workloadNodeId,
      providerExecutionNodeId: request.route.providerExecutionNodeId,
      credentialNodeId: request.route.credentialNodeId ?? undefined,
      accountProfileId: request.route.accountProfileId ?? undefined,
      accountLabel: request.route.accountLabel ?? undefined,
      accountPlan: request.route.accountPlan ?? undefined,
      accountPlanAuthority: request.route.accountPlanAuthority ?? undefined,
      accountQualification: request.route.accountQualification ?? undefined,
      accountAvailability: request.route.accountAvailability ?? undefined,
      modelId: source.invocation.modelId,
      objective: `${request.instruction}\nFrozen repository: ${request.run.repository?.name ?? 'repository'} at ${request.run.repository?.reviewedSha ?? 'unknown SHA'}`,
      completedWork: [`${request.route.providerId}/${source.invocation.modelId} reviewed ${chunk.id}: ${source.result.executiveSummary}`, `Independent quality gate ${quality.code} rejected that result: ${quality.summary}`],
      decisions: [decision.reason, `Relevant frozen files: ${chunk.files.join(', ')}`, 'Escalation is quality-triggered; it is not a context-limit, timeout or provider-failure handoff'],
      filesChanged: [],
      git: {sha: request.run.repository?.reviewedSha ?? 'unknown', dirty: request.run.repository?.dirty ?? false, diffSummary: request.run.repository?.dirty ? `Frozen snapshot includes dirty paths: ${request.run.repository.dirtyPaths.join(', ')}` : 'Frozen repository snapshot is clean'},
      testsAndEvidence: [...new Set([source.responseHash, `frozen-context-sha256:${chunk.sha256}`, ...quality.evidence])],
      evidenceReferences: (chunk as PreparedReviewChunk).evidenceReferences ?? [],
      unresolvedIssues: [...quality.unresolvedCriteria],
      nextAction: quality.nextAction,
    });
    const sourceContract = this.ensureSourceContract(request, parcel, source.invocation);
    let destinationContractId: string | undefined, destinationResult: RepositoryReviewResult | undefined;
    const handoffDecision = await this.routing.governedHandoff(source.threadId, baton.id, decision.target, this.lifecycle.handoffs, {
      outcome: 'DELEGATE', policy: 'AUTO', contractId: sourceContract.id, sourceActorId: sourceContract.active.actorId, sourceAgentId: sourceContract.active.agentId,
      target: {active: {actorId: actorId(targetRoute), agentId: agentId(targetRoute), modelId: targetRoute.modelId, providerId: targetRoute.providerId, accountProfileId: targetRoute.accountProfileId ?? undefined, runtimeId: `provider:${targetRoute.providerId}`, nodeId: targetRoute.nodeId, workloadNodeId: targetRoute.workloadNodeId, providerExecutionNodeId: targetRoute.providerExecutionNodeId, credentialNodeId: targetRoute.credentialNodeId ?? undefined}, process: {id: `provider-invocation:${request.run.id}:${chunk.id}:${targetRoute.modelId}`}, ptyId: `provider-pty:${request.run.id}:${chunk.id}:${targetRoute.modelId}`},
      requestedAuthority: ['repository-review'], budget: {}, child: {objective: baton.nextAction, completionCriteria: [`Pass independent quality gate ${quality.code}`, 'Return a schema-valid repository review for the same frozen context chunk']},
    }, async governed => {
      destinationContractId = governed.childContractId;
      let destination: Awaited<ReturnType<DirectRepositoryReviewExecutor['invokeChunk']>>;
      try { destination = await this.invokeChunk(request, targetRoute, parcel, chunk, baton, `${source.threadId}:quality:${targetRoute.modelId}`); }
      catch (error) { const partial = (error as {partialInvocation?: PartialModelInvocation}).partialInvocation; if (partial) capture(parcel, partial, targetRoute, partial.responseHash); else this.recordFailedInvocation(parcel, error, request, targetRoute, totals); throw error; }
      capture(parcel, destination.invocation, targetRoute, destination.responseHash);
      this.requireComplete(destination.invocation);
      const destinationQuality = await this.assessQuality(request, parcel, chunk, destination.result, targetRoute, destination.responseHash);
      if (!destinationQuality?.accepted) throw new Error(`repository_review_quality_gate_failed_after_escalation:${destinationQuality?.code ?? quality.code}`);
      destinationResult = destination.result;
    });
    if (handoffDecision.outcome !== 'SUCCEEDED' || !destinationResult || !destinationContractId) {
      if (destinationContractId) this.failDestinationContract(destinationContractId, handoffDecision.reason);
      parcel.audit.timeline.push({id: `audit-${randomUUID()}`, at: new Date().toISOString(), type: 'route.changed', stageId: 'review', summary: 'Quality escalation failed closed; original provider thread remains recoverable', detail: handoffDecision.reason});
      parcel.provenance.push({at: new Date().toISOString(), type: 'quality-escalation-recovery', detail: source.threadId});
      this.parcels.update(parcel);
      throw new Error(`repository_review_quality_escalation_failed:${quality.code}`);
    }
    this.recordContract(parcel, destinationContractId, 'governed-verification-contract', `Quality gate ${quality.code} selected ${targetRoute.providerId}/${targetRoute.modelId}; destination passed independently`);
    this.requireWithinBudget(request, totals);
    return destinationResult;
  }

  private async tryGovernedContinuation(
    request: ReviewExecutionRequest,
    parcel: WorkParcel,
    completedChunk: ReviewChunk,
    nextChunk: ReviewChunk,
    source: Awaited<ReturnType<DirectRepositoryReviewExecutor['invokeChunk']>>,
    capture: (parcel: WorkParcel, invocation: ModelInvocationResult, route: ModelRouteDecision, responseHash: string) => void,
    totals: ExecutionTotals,
    results: RepositoryReviewResult[],
  ) {
    if (!this.routing || !this.lifecycle) return false;
    const decision = this.routing.assess(source.threadId, {
      remainingWork: 'BOUNDED',
      reasoningState: 'COMPLETE',
      requiredCapabilities: ['repository-review'],
      candidates: this.routingCandidates(request.route, source.invocation),
    });
    if (this.adaptiveOrchestration && parcel.audit.orchestrationDecisionId) this.adaptiveOrchestration.recordOperationalNode(parcel.audit.orchestrationDecisionId, {
      stageId: 'review',
      kind: 'TRADEOFF',
      status: decision.action === 'BATON_AND_HANDOFF' ? 'SELECTED' : 'OBSERVED',
      facts: {tokenGovernorAction: decision.action, contextPercent: decision.contextPercent, reason: decision.reason, target: decision.target ? `${decision.target.providerId}/${decision.target.accountProfileId ?? 'default'}/${decision.target.modelId}@${decision.target.nodeId ?? 'controller'}` : 'none'},
      ...(decision.target ? {route: {providerId: decision.target.providerId, modelId: decision.target.modelId, accountProfileId: decision.target.accountProfileId ?? null, nodeId: decision.target.nodeId ?? request.route.nodeId}} : {}),
      reason: decision.reason,
    });
    if (decision.action !== 'BATON_AND_HANDOFF' || !decision.target) return false;

    const targetRoute = this.models.route({model: decision.target.modelId, nodeId: request.route.workloadNodeId, workloadNodeId: request.route.workloadNodeId, providerExecutionNodeId: decision.target.providerExecutionNodeId ?? decision.target.nodeId, requiredCapabilities: ['repository-review'], allowFallback: false});
    if (targetRoute.providerId !== decision.target.providerId || targetRoute.accountProfileId !== (decision.target.accountProfileId ?? null) || targetRoute.providerExecutionNodeId !== (decision.target.providerExecutionNodeId ?? decision.target.nodeId ?? request.route.providerExecutionNodeId) || targetRoute.credentialNodeId !== (decision.target.credentialNodeId ?? null)) throw new Error('token_handoff_route_identity_changed');
    const baton = this.routing.createBaton({
      threadId: source.threadId,
      parcelId: parcel.id,
      providerId: source.invocation.providerId,
      nodeId: request.route.nodeId,
      workloadNodeId: request.route.workloadNodeId,
      providerExecutionNodeId: request.route.providerExecutionNodeId,
      credentialNodeId: request.route.credentialNodeId ?? undefined,
      accountProfileId: request.route.accountProfileId ?? undefined,
      accountLabel: request.route.accountLabel ?? undefined,
      accountPlan: request.route.accountPlan ?? undefined,
      accountPlanAuthority: request.route.accountPlanAuthority ?? undefined,
      accountQualification: request.route.accountQualification ?? undefined,
      accountAvailability: request.route.accountAvailability ?? undefined,
      modelId: source.invocation.modelId,
      objective: `Complete governed review of frozen repository ${request.run.repository?.name ?? 'repository'} at ${request.run.repository?.reviewedSha ?? 'unknown SHA'}`,
      completedWork: [`Reviewed ${completedChunk.id}: ${source.result.executiveSummary}`],
      decisions: [decision.reason, `Continue only with frozen context chunk ${nextChunk.id}`],
      filesChanged: [],
      git: {sha: request.run.repository?.reviewedSha ?? 'unknown', dirty: request.run.repository?.dirty ?? false, diffSummary: request.run.repository?.dirty ? `Frozen snapshot includes dirty paths: ${request.run.repository.dirtyPaths.join(', ')}` : 'Frozen repository snapshot is clean'},
      testsAndEvidence: [source.responseHash],
      evidenceReferences: [...((completedChunk as PreparedReviewChunk).evidenceReferences ?? []), ...((nextChunk as PreparedReviewChunk).evidenceReferences ?? [])],
      unresolvedIssues: [...source.result.areasNotReviewed, ...source.result.findings.map(finding => finding.id)],
      nextAction: `Review frozen context chunk ${nextChunk.id} containing ${nextChunk.files.join(', ')}`,
      ...(parcel.transportIntegrity ? {transportContextSha256: parcel.transportIntegrity.contractSha256, transportIntegrityState: parcel.transportIntegrity.state} : {}),
    });
    if (this.transportIntegrity && parcel.transportIntegrity) {
      const integrity = this.transportIntegrity.bindBaton(parcel.id, baton.sha256, targetRoute.nodeId);
      parcel.transportIntegrity = integrity;
      parcel.audit.timeline.push({id: `audit-${randomUUID()}`, at: new Date().toISOString(), type: 'transport.integrity_changed', stageId: 'review', summary: 'Sealed baton bound to transport context', detail: `${integrity.contractSha256} · baton ${baton.sha256}`});
      this.parcels.update(parcel);
    }
    if (this.adaptiveOrchestration && parcel.audit.orchestrationDecisionId) this.adaptiveOrchestration.recordOperationalNode(parcel.audit.orchestrationDecisionId, {
      stageId: 'review',
      kind: 'EXECUTION',
      status: 'OBSERVED',
      facts: {action: 'sealed-baton-created', batonId: baton.id, batonSha256: baton.sha256, sourceThreadId: source.threadId, nextChunk: nextChunk.id},
      route: request.route,
      reason: 'Verified token-aware baton created before destination invocation',
    });
    const sourceContract = this.ensureSourceContract(request, parcel, source.invocation);
    let destinationContractId: string | undefined;
    const destinationActorId = actorId(targetRoute);
    const destinationAgentId = agentId(targetRoute);
    const handoffDecision = await this.routing.governedHandoff(source.threadId, baton.id, decision.target, this.lifecycle.handoffs, {
      outcome: 'DELEGATE',
      policy: 'AUTO',
      contractId: sourceContract.id,
      sourceActorId: sourceContract.active.actorId,
      sourceAgentId: sourceContract.active.agentId,
      target: {active: {actorId: destinationActorId, agentId: destinationAgentId, modelId: targetRoute.modelId, providerId: targetRoute.providerId, accountProfileId: targetRoute.accountProfileId ?? undefined, runtimeId: `provider:${targetRoute.providerId}`, nodeId: targetRoute.nodeId, workloadNodeId: targetRoute.workloadNodeId, providerExecutionNodeId: targetRoute.providerExecutionNodeId, credentialNodeId: targetRoute.credentialNodeId ?? undefined}, process: {id: `provider-invocation:${request.run.id}:${nextChunk.id}:${targetRoute.modelId}`}, ptyId: `provider-pty:${request.run.id}:${nextChunk.id}:${targetRoute.modelId}`},
      requestedAuthority: ['repository-review'],
      budget: {},
      child: {objective: baton.nextAction, completionCriteria: ['Return a schema-valid repository review for the assigned frozen context chunk']},
    }, async governed => {
      destinationContractId = governed.childContractId;
      let destination: Awaited<ReturnType<DirectRepositoryReviewExecutor['invokeChunk']>>;
      try { destination = await this.invokeChunk(request, targetRoute, parcel, nextChunk, baton); }
      catch (error) {
        const partial = (error as {partialInvocation?: PartialModelInvocation}).partialInvocation;
        if (partial) capture(parcel, partial, targetRoute, partial.responseHash);
        else this.recordFailedInvocation(parcel, error, request, targetRoute, totals);
        throw error;
      }
      capture(parcel, destination.invocation, targetRoute, destination.responseHash);
      this.requireComplete(destination.invocation);
      results.push(destination.result);
    });

    if (handoffDecision.outcome === 'SUCCEEDED') {
      if (!destinationContractId) throw new Error('governed_handoff_destination_contract_missing');
      this.recordContract(parcel, destinationContractId, 'governed-verification-contract', `Destination ${targetRoute.providerId}/${targetRoute.modelId} continued ${nextChunk.id}`);
      if (this.adaptiveOrchestration && parcel.audit.orchestrationDecisionId) this.adaptiveOrchestration.recordOperationalNode(parcel.audit.orchestrationDecisionId, {
        stageId: 'review',
        kind: 'ROUTE',
        status: 'SELECTED',
        facts: {action: 'destination-handoff', outcome: handoffDecision.outcome, batonId: baton.id, batonSha256: baton.sha256, destination: routeLabel(targetRoute)},
        route: targetRoute,
        reason: 'Governed destination completed under the sealed baton',
      });
      this.requireWithinBudget(request, totals);
      return true;
    }

    if (destinationContractId) this.failDestinationContract(destinationContractId, handoffDecision.reason);
    this.requireWithinBudget(request, totals);
    const recovered = await this.invokeChunk(request, request.route, parcel, nextChunk, undefined, `${source.threadId}:recovery`);
    capture(parcel, recovered.invocation, request.route, recovered.responseHash);
    this.requireComplete(recovered.invocation);
    results.push(recovered.result);
    this.recordContract(parcel, sourceContract.id, 'governed-verification-contract', `Destination failed; original ${request.route.providerId}/${request.route.modelId} resumed ${nextChunk.id}`);
    parcel.audit.timeline.push({id: `audit-${randomUUID()}`, at: new Date().toISOString(), type: 'route.changed', stageId: 'review', summary: 'Original provider thread resumed after failed governed handoff', detail: handoffDecision.reason});
    if (this.adaptiveOrchestration && parcel.audit.orchestrationDecisionId) this.adaptiveOrchestration.recordOperationalNode(parcel.audit.orchestrationDecisionId, {
      stageId: 'review',
      kind: 'ROUTE',
      status: 'OBSERVED',
      facts: {action: 'source-recovery', outcome: handoffDecision.outcome, destination: routeLabel(targetRoute), source: routeLabel(request.route)},
      route: request.route,
      reason: 'Destination handoff failed; source route resumed the unfinished chunk',
    });
    this.parcels.update(parcel);
    this.requireWithinBudget(request, totals);
    return true;
  }

  private async invokeChunk(request: ReviewExecutionRequest, route: ModelRouteDecision, parcel: WorkParcel, chunk: PreparedReviewChunk, baton?: VerifiedBaton, threadId = `${request.executionId}:${chunk.id}`) {
    const {provider, model, account} = this.routeConfiguration(route);
    const prompt = await this.prompt(request, chunk, baton);
    const requestExtension = provider.kind === 'cli' ? undefined : this.providerAdapters.resolve(provider).invocationRequest?.({provider, model, purpose: 'repository-review'});
    const client: RepositoryReviewProviderClient = this.clients?.(provider, account, route) ?? (provider.kind === 'cli'
      ? new CodexRepositoryReviewClient(provider, requiredAccount(account), route.nodeId, this.nodeExecution, executionSessionScope(request, route, parcel, chunk))
      : new OpenAICompatibleProviderClient(provider, fetch, account ? () => resolveProviderAccountCredential(provider, account, process.env, undefined, route.providerExecutionNodeId) : undefined, {accountProfileId: account?.id, nodeId: route.providerExecutionNodeId}));
    const startedAt = new Date().toISOString();
    parcel.audit.timeline.push({id: `audit-${randomUUID()}`, at: startedAt, type: 'invocation.started', stageId: 'review', summary: `${routeLabel(route)} provider invocation started`, detail: `Thread ${threadId}; frozen context ${chunk.id}; structured schema agent-control.repository-review/v1; invocation profile ${requestExtension?.profile ?? 'provider-default'}${baton ? `; continuation baton ${baton.id}` : ''}`});
    this.parcels.update(parcel);
    this.observeTelemetry({phase: 'started', providerId: provider.id, modelId: model.id, elapsedMs: 0, context: {tokens: null, limitTokens: model.limits?.contextTokens ?? null, authority: 'unavailable', source: 'provider_not_yet_reported'}}, threadId, parcel.id, route);
    let invocation: ModelInvocationResult & {nodeId?: string};
    try {
      invocation = await client.invoke(model, prompt, {
        structured: true,
        outputSchema: REPOSITORY_REVIEW_OUTPUT_SCHEMA,
        maximumOutputTokens: request.maximumOutputTokens,
        timeoutMs: request.run.definition.budgets.timeoutMinutes * 60_000,
        signal: request.signal,
        requestExtension,
        onTelemetry: event => this.observeTelemetry(event, threadId, parcel.id, route),
      });
    } catch (error) {
      const failure = classifyExecutionFailure(error), failedAt = new Date().toISOString(), observation = failureObservation(error);
      this.observeTelemetry({phase: 'completed', providerId: provider.id, modelId: model.id, elapsedMs: observation?.elapsedMs ?? Math.max(0, Date.parse(failedAt) - Date.parse(startedAt)), ...(observation?.usage ? {usage: observation.usage} : {}), context: {tokens: null, limitTokens: model.limits?.contextTokens ?? null, authority: 'unavailable', source: observation?.usage ? `provider_failure_usage_${observation.usageAuthority}` : 'provider_failed_before_complete_usage'}}, threadId, parcel.id, route);
      parcel.audit.timeline.push({id: `audit-${randomUUID()}`, at: failedAt, type: 'invocation.failed', stageId: 'review', summary: `${routeLabel(route)} provider invocation failed`, detail: `Classification ${failure.kind}; ${failure.safeReason}; transport failure is not model-quality evidence`});
      parcel.provenance.push({at: failedAt, type: 'provider-invocation-failed', detail: `${failure.kind}:${failure.safeReason}`});
      this.parcels.update(parcel);
      throw error;
    }
    if (route.providerId !== invocation.providerId || route.modelId !== invocation.modelId || (route.accountProfileId ?? undefined) !== invocation.accountProfileId || (invocation.nodeId !== undefined && route.nodeId !== invocation.nodeId) || (route.accountProfileId && invocation.nodeId === undefined)) throw new Error('provider_route_identity_mismatch');
    const responseHash = `sha256:${createHash('sha256').update(invocation.output).digest('hex')}`;
    try {
      const result = parseRepositoryReviewResponse(invocation.output), rendered = renderProviderPrompt(prompt), maximum = 1_048_576;
      this.acceptedExchanges.set(invocation, {input: safeTranscriptText(rendered, maximum), output: safeTranscriptText(invocation.output, maximum), redacted: true, truncated: rendered.length > maximum || invocation.output.length > maximum});
      return {invocation, responseHash, result, threadId};
    }
    catch (error) { throw Object.assign(error instanceof Error ? error : new Error(String(error)), {partialInvocation: {...invocation, responseHash}}); }
  }

  private async prepareChunk(request: ReviewExecutionRequest, parcel: WorkParcel, chunk: ReviewChunk, collected: string[]): Promise<PreparedReviewChunk> {
    if (!this.retrieval || !request.run.repository) return chunk;
    const at = new Date().toISOString();
    try {
      const packet = await this.retrieval.retrieve({id:`retrieval:${request.run.id}:${chunk.id}`,parcelId:parcel.id,taskType:'repository-review',query:retrievalQuery(request.instruction,chunk.files),exactTerms:[...chunk.files,...retrievalIdentifiers(request.instruction)],scopes:chunk.files,repository:{repositoryId:request.run.repository.identity,root:request.run.repository.snapshotPath,gitSha:request.run.repository.reviewedSha,dirty:request.run.repository.dirty,dirtyFingerprint:request.run.repository.dirtyPaths.length?createHash('sha256').update(request.run.repository.dirtyPaths.slice().sort().join('\n')).digest('hex'):undefined},maximumEvidenceTokens:Math.min(request.run.definition.budgets.maximumInputTokens??this.retrieval.policy.maximumEvidenceTokens,this.retrieval.policy.maximumEvidenceTokens),requiredCoverage:.1,minimumConfidence:.05});
      const compiled=this.evidenceCompiler?await this.evidenceCompiler.compile(packet,request.run.context?.profile??'STANDARD',this.retrieval.policy.maximumEvidenceTokens):undefined;
      if(compiled)this.retrieval.contextCompiled(packet.id);
      const source = compiled?.source??evidencePacketContextSource(packet), references = evidenceReferences(packet); collected.push(packet.id, ...references);
      parcel.provenance.push({at,type:'retrieval.evidence',detail:`${packet.id}:${packet.sha256}`});
      parcel.audit.timeline.push({id:`audit-${randomUUID()}`,at,type:'readiness.checked',stageId:'review',summary:`Governed retrieval supplied ${packet.items.length} compact evidence items`,detail:`${packet.id}; context ${compiled?.packet.id??'direct-source'}; ${packet.estimatedTokens} estimated tokens; ${packet.rawBytesAvoided} raw bytes avoided`});
      this.parcels.update(parcel);
      return {...chunk,content:source.content ?? '',sha256:createHash('sha256').update(source.content ?? '').digest('hex'),evidenceReferences:references,evidencePacketId:packet.id};
    } catch (error) {
      this.retrieval.fallback(parcel.id,`retrieval:${request.run.id}:${chunk.id}`,message(error));
      parcel.audit.timeline.push({id:`audit-${randomUUID()}`,at,type:'readiness.checked',stageId:'review',summary:'Governed retrieval unavailable; controlled frozen context retained',detail:message(error).slice(0,240)});
      parcel.provenance.push({at,type:'retrieval.fallback',detail:'frozen-context'}); this.parcels.update(parcel); return chunk;
    }
  }

  private async prompt(request: ReviewExecutionRequest, chunk: ReviewChunk, baton?: VerifiedBaton): Promise<ProviderPrompt> {
    const prepared = chunk as PreparedReviewChunk;
    let rehydrated='';
    if(baton&&this.retrieval&&request.run.repository){const packetIds=[...new Set((baton.evidenceReferences??[]).map(reference=>reference.split('#')[0]).filter(id=>id.startsWith('evidence-packet:')))];for(const packetId of packetIds){const packet=this.retrieval.rehydrate(packetId,{repositoryId:request.run.repository.identity,root:request.run.repository.snapshotPath,gitSha:request.run.repository.reviewedSha,dirty:request.run.repository.dirty,dirtyFingerprint:request.run.repository.dirtyPaths.length?createHash('sha256').update(request.run.repository.dirtyPaths.slice().sort().join('\n')).digest('hex'):undefined});if(packetId!==prepared.evidencePacketId)rehydrated+=`\n\nRehydrated Baton Evidence ${packetId}\n${evidencePacketContextSource(packet).content??''}`;}}
    // Keep the reusable instruction and governed content at the beginning of the
    // request. Opaque packet/baton identifiers change between otherwise
    // identical runs, so they belong in the provenance trailer rather than in
    // the cacheable prompt prefix.
    const stable = `${request.instruction}\n\n${chunk.content}`;
    const provenance = `${rehydrated}${prepared.evidencePacketId ? `\n\nGoverned Evidence Packet: ${prepared.evidencePacketId}` : ''}`;
    const continuation = baton ? `${provenance}\n\nGoverned continuation baton\nBaton ID: ${baton.id}\nBaton SHA-256: ${baton.sha256}\nObjective: ${baton.objective}\nCompleted work: ${baton.completedWork.join('; ')}\nDecisions: ${baton.decisions.join('; ')}\nEvidence references: ${(baton.evidenceReferences ?? []).join('; ') || 'none'}\nExact next action: ${baton.nextAction}\nOrigin: ${routeLabel(baton)} thread ${baton.threadId}\nParcel tokens at handoff: ${baton.parcelTotals.totalTokens ?? 'unavailable'}` : provenance;
    return {
      schema: 'agent-control.provider-prompt/v1',
      cacheScope: createHash('sha256').update(`repository-review/v1\u0000${request.run.repository?.identity ?? 'unresolved'}`).digest('hex'),
      blocks: [
        {type: 'text', stability: 'stable', text: stable},
        ...(continuation ? [{type: 'text' as const, stability: 'volatile' as const, text: continuation}] : []),
      ],
    };
  }

  private observeTelemetry(event: ProviderInvocationTelemetry, threadId: string, parcelId: string, route: ModelRouteDecision) {
    this.routing?.observe({
      threadId,
      parcelId,
      agentId: route.nodeId,
      nodeId: route.nodeId,
      workloadNodeId: route.workloadNodeId,
      providerExecutionNodeId: route.providerExecutionNodeId,
      credentialNodeId: route.credentialNodeId ?? undefined,
      providerId: event.providerId,
      accountProfileId: route.accountProfileId ?? undefined,
      accountLabel: route.accountLabel ?? undefined,
      accountPlan: route.accountPlan ?? undefined,
      accountPlanAuthority: route.accountPlanAuthority ?? undefined,
      accountQualification: route.accountQualification ?? undefined,
      accountAvailability: route.accountAvailability ?? undefined,
      modelId: event.modelId,
      elapsedMs: event.elapsedMs,
      active: event.phase === 'started',
      cumulative: {
        inputTokens: event.usage?.inputTokens,
        freshInputTokens: freshInput(event.usage?.inputTokens, event.usage?.cachedInputTokens, event.usage?.cacheWriteTokens),
        cachedInputTokens: event.usage?.cachedInputTokens,
        cacheWriteTokens: event.usage?.cacheWriteTokens,
        outputTokens: event.usage?.outputTokens,
        totalTokens: event.usage?.totalTokens,
      },
      context: event.context,
      cost: {
        amount: event.usage?.providerReportedCost ?? event.usage?.calculatedCost ?? null,
        currency: event.usage?.currency ?? null,
        authority: event.usage?.providerReportedCost === null || event.usage?.providerReportedCost === undefined ? event.usage?.calculatedCost === null || event.usage?.calculatedCost === undefined ? 'unavailable' : 'estimated' : 'authoritative',
        source: event.usage?.providerReportedCost === null || event.usage?.providerReportedCost === undefined ? event.usage?.calculatedCost === null || event.usage?.calculatedCost === undefined ? 'provider_not_reported' : 'configured_pricing' : 'provider_usage',
      },
    });
  }

  private routingCandidates(sourceRoute: ModelRouteDecision, source?: ModelInvocationResult | PartialModelInvocation) {
    const ordered = this.models.governedAlternatives(sourceRoute.modelId, sourceRoute.requestedRole), permitted = new Set(ordered), preference = new Map(ordered.map((id, index) => [id, index]));
    return this.models.list().filter(row => permitted.has(row.id)).map(row => {
      const provider = this.models.provider(row.provider);
      return {
        providerId: row.provider,
        accountProfileId: row.account?.id,
        accountLabel: row.account?.label,
        accountPlan: row.account?.plan ?? undefined,
        accountPlanAuthority: row.account?.planAuthority ?? undefined,
        accountQualification: row.account?.qualification.state,
        accountAvailability: row.account?.availability,
        modelId: row.id,
        nodeId: row.account?.providerExecutionNodeId ?? row.account?.nodeId ?? row.qualification.nodes[0] ?? row.nodes?.[0] ?? sourceRoute.providerExecutionNodeId,
        workloadNodeId: sourceRoute.workloadNodeId,
        providerExecutionNodeId: row.account?.providerExecutionNodeId ?? row.account?.nodeId ?? row.qualification.nodes[0] ?? row.nodes?.[0] ?? sourceRoute.providerExecutionNodeId,
        credentialNodeId: row.account?.credentialNodeId,
        estimatedCost: source ? estimateCost(row, source) : null,
        preferenceOrder: preference.get(row.id),
        qualified: Boolean(provider) && provider?.enabled !== false && row.enabled !== false && row.qualification.state === 'QUALIFIED' && (!row.qualification.nodes.length || row.qualification.nodes.includes(row.account?.providerExecutionNodeId ?? row.account?.nodeId ?? row.qualification.nodes[0] ?? row.nodes?.[0] ?? sourceRoute.providerExecutionNodeId)) && (!row.account || row.account.availability === 'AVAILABLE'),
        capabilities: [...row.qualification.capabilities],
      };
    });
  }

  private ensureSourceContract(request: ReviewExecutionRequest, parcel: WorkParcel, invocation?: ModelInvocationResult | PartialModelInvocation, sourceEvidence = request.executionId) {
    const id = `token-source:${parcel.id}`;
    try { return this.lifecycle!.contracts.get(id); }
    catch (error) { if (message(error) !== 'contract_missing') throw error; }
    return this.lifecycle!.contracts.create({
      id,
      laneId: parcel.id,
      operatorActorId: `parameterized-job:${request.run.id}`,
      objective: parcel.objective,
      completionCriteria: ['Return schema-valid review output for the frozen Work Parcel and pass independent validation'],
      authority: ['repository-review'],
      active: {actorId: actorId(request.route), agentId: agentId(request.route), modelId: request.route.modelId, providerId: request.route.providerId, accountProfileId: request.route.accountProfileId ?? undefined, runtimeId: `provider:${request.route.providerId}`, nodeId: request.route.nodeId, workloadNodeId: request.route.workloadNodeId, providerExecutionNodeId: request.route.providerExecutionNodeId, credentialNodeId: request.route.credentialNodeId ?? undefined},
      baton: {jobRunId: request.run.id, reviewedSha: request.run.repository?.reviewedSha ?? 'unknown', sourceResponse: invocation ? createHash('sha256').update(invocation.output).digest('hex') : createHash('sha256').update(sourceEvidence).digest('hex')},
      process: {id: `provider-invocation:${request.run.id}:${request.route.modelId}`},
      ptyId: `provider-pty:${request.run.id}:${request.route.modelId}`,
      permissions: {capabilities: ['repository-review'], filesystem: 'read', network: 'provider-only', production: false},
    });
  }

  private failDestinationContract(id: string, reason: string) {
    const contract = this.lifecycle!.contracts.get(id);
    if (contract.verification.state === 'UNSUBMITTED') this.lifecycle!.contracts.submitForVerification(id, contract.active.actorId, []);
    if (this.lifecycle!.contracts.get(id).verification.state === 'PENDING') this.lifecycle!.contracts.verify(id, 'agent-control:handoff-recovery-verifier', false, [reason]);
  }

  private verifyGovernedContract(parcel: WorkParcel, verdict: RepositoryReviewResult['verdict'], at: string) {
    if (!this.lifecycle) return;
    const reference = [...parcel.provenance].reverse().find(item => item.type === 'governed-verification-contract');
    if (!reference) return;
    try {
      const contract = this.lifecycle.contracts.get(reference.detail);
      if (contract.verification.state === 'UNSUBMITTED') {
        const evidence = parcel.audit.invocations.map(invocation => ({id: invocation.id, kind: 'provider-response', reference: invocation.id, createdAt: at}));
        this.lifecycle.contracts.submitForVerification(contract.id, contract.active.actorId, evidence);
      }
      const accepted = verdict === 'PASS' || verdict === 'PASS_WITH_FINDINGS';
      if (this.lifecycle.contracts.get(contract.id).verification.state === 'PENDING') this.lifecycle.contracts.verify(contract.id, `parameterized-job-validator:${parcel.id}`, accepted, [`Repository validation ${accepted ? 'accepted' : 'rejected'} verdict ${verdict}`]);
    } catch (error) {
      parcel.audit.timeline.push({id: `audit-${randomUUID()}`, at, type: 'stage.failed', stageId: 'review', summary: 'Governed contract verification record failed', detail: message(error)});
      this.parcels.update(parcel);
      throw error;
    }
  }

  private recordContract(parcel: WorkParcel, contractId: string, type: string, summary: string) {
    const at = new Date().toISOString();
    parcel.provenance.push({at, type, detail: contractId});
    parcel.audit.timeline.push({id: `audit-${randomUUID()}`, at, type: 'route.changed', stageId: 'review', summary, detail: contractId});
    this.parcels.update(parcel);
  }

  private routeConfiguration(route: ModelRouteDecision) {
    const provider = this.models.provider(route.providerId);
    const model = this.models.model(route.modelId);
    if (!provider || !model) throw new Error('selected_model_configuration_missing');
    const account = route.accountProfileId ? this.models.accountProfile(route.providerId, route.accountProfileId) : undefined;
    if ((model.accountProfile ?? null) !== route.accountProfileId || (route.accountProfileId && !account)) throw new Error('selected_account_profile_configuration_missing');
    if (account && accountProviderExecutionNode(account) !== route.providerExecutionNodeId) throw new Error('selected_account_profile_node_mismatch');
    return {provider, model, account};
  }

  private requireComplete(invocation: ModelInvocationResult) {
    if (invocation.finishReason && !['stop', 'completed'].includes(invocation.finishReason)) throw new Error(`repository_review_provider_incomplete:${invocation.finishReason}`);
  }

  private requireWithinBudget(request: ReviewExecutionRequest, totals: ExecutionTotals) {
    if (request.maximumCost === undefined) return;
    if (!totals.completeProviderCost && !totals.completeCalculatedCost) throw new Error('job_cost_budget_unenforceable');
    if (effectiveCost(totals.completeProviderCost, totals.providerReportedCost, totals.completeCalculatedCost, totals.calculatedCost) > request.maximumCost) throw new Error('job_cost_budget_exceeded');
  }

  private createParcel(request: ReviewExecutionRequest, chunkId: string) {
    const at = new Date().toISOString();
    const id = `parcel-${randomUUID()}`;
    const origin=request.run.trigger.origin;
    const parcel: WorkParcel = {id, prompt: origin?.request??`Repository review ${request.run.id} ${chunkId}`, objective: `Review frozen ${request.run.repository?.reviewedSha} context chunk ${chunkId}`, actor: `parameterized-job:${request.run.id}`,...(origin?{origin:structuredClone(origin)}:{}), executionMode: request.run.executionMode ?? 'LIVE', executionOwner: 'direct-repository-review-executor', status: 'RUNNING', planner: {kind: 'deterministic', reason: 'Repository Job deterministically decomposed frozen context'}, stages: [{id: 'review', name: `Review ${chunkId}`, job: `repository-code-review@${request.run.definition.version}`, dependsOn: [], parameters: {jobRunId: request.run.id, contextChunkId: chunkId}, requiredCapabilities: ['repository-review'], outputs: ['repository-review-result'], waitingQuestionIds: [], status: 'RUNNING', requestedRoute: {accountProfile: request.route.accountProfileId ?? undefined, model: request.route.modelId, modelRole: request.route.requestedRole ?? undefined, allowFallback: !request.route.fallback, purpose: request.route.purpose, profile: request.run.context?.profile, reason: 'Route frozen by parameterized Job resolution'}, actualRoute: {workers: [request.route.providerExecutionNodeId], workloadNodeId: request.route.workloadNodeId, providerExecutionNodeId: request.route.providerExecutionNodeId, credentialNodeId: request.route.credentialNodeId ?? undefined, provider: request.route.providerId, accountProfile: request.route.accountProfileId ?? undefined, accountLabel: request.route.accountLabel ?? undefined, accountPlan: request.route.accountPlan ?? undefined, accountPlanAuthority: request.route.accountPlanAuthority ?? undefined, accountQualification: request.route.accountQualification ?? undefined, accountAvailability: request.route.accountAvailability ?? undefined, model: request.route.modelId, profile: request.run.context?.profile, reason: `Qualification ${request.route.qualificationVersion}`}, startedAt: at}], createdAt: at, updatedAt: at, telemetry: {inputTokens: null, freshInputTokens: null, cachedInputTokens: null, cacheWriteTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null, cost: null, currency: null, elapsedMs: 0}, audit: {schema: 'agent-control.work-parcel-audit/v1', recordedAt: at, classification: 'Frozen repository context review', selectedExecution: 'Work Parcel', planningRationale: 'Deterministic decomposition owned by repository-code-review definition', planner: {kind: 'deterministic', provider: null, model: null}, alternatives: [], timeline: [{id: `audit-${randomUUID()}`, at, type: 'task.received', summary: 'Frozen review chunk received', detail: chunkId}, {id: `audit-${randomUUID()}`, at, type: 'route.resolved', stageId: 'review', summary: routeLabel(request.route), detail: `Qualification ${request.route.qualificationVersion}; fallback ${request.route.fallback}; purpose ${request.route.purpose ?? 'EXECUTION'}`}], invocations: [], totals: {models: [auditModelLabel(request.route)], invocations: 0, inputTokens: null, freshInputTokens: null, cachedInputTokens: null, cacheWriteTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null, providerReportedCost: null, calculatedCost: null, cost: null, costBasis: 'unavailable', currency: null, modelExecutionMs: 0, wallClockMs: 0}}, provenance: [{at, type: 'job-run', detail: request.run.id},...(origin?[{at,type:'request-origin',detail:`${origin.channel}:${origin.messageReference}`}]:[]), {at, type: 'execution-mode', detail: request.run.executionMode ?? 'LIVE'}, {at, type: 'reviewed-sha', detail: request.run.repository?.reviewedSha ?? 'unresolved'}, {at, type: 'execution-locality', detail: `workload=${request.route.workloadNodeId};provider=${request.route.providerExecutionNodeId};credential=${request.route.credentialNodeId ?? 'none'}`}]};
    const created = this.parcels.add(parcel);
    if (this.transportIntegrity) {
      const contract = createTransportContext({
        initiatingRequest: request.instruction,
        acceptanceCriteria: ['Return schema-valid repository-review output', 'Pass independent repository validation'],
        repository: {identity: request.run.repository?.identity ?? 'unknown', branch: request.run.repository?.requestedRef, sha: request.run.repository?.reviewedSha ?? 'unknown', dirty: request.run.repository?.dirty ?? false, diffState: request.run.repository?.dirty ? request.run.repository?.dirtyPaths.join(', ') || 'dirty' : 'clean'},
        scope: {description: `Frozen context chunk ${chunkId}`, files: request.contextChunks.find(chunk => chunk.id === chunkId)?.files ?? [], omittedFiles: request.run.context?.omittedFiles ?? [], truncated: request.run.context?.truncated ?? false},
        architectureConstraints: ['Use registered Agent Control Job', 'Preserve frozen repository identity', 'Fail closed on invalid provider output'],
        runtimeTopology: {controller: 'agent-control', sourceWorker: request.route.nodeId, provider: request.route.providerId, model: request.route.modelId},
        versions: {'job-definition': String(request.run.definition.version), node: process.version},
        policies: {permissions: ['repository-read', 'provider-only-network'], prohibitedActions: ['secret-disclosure', 'unregistered-route', 'unverified-approval'], limits: {maximumOutputTokens: request.maximumOutputTokens ?? 'provider-default'}},
        priorDecisions: [], failures: [], testsAndEvidence: [], requiredArtifacts: ['repository-review-result'],
        route: {provider: request.route.providerId, model: request.route.modelId, accountProfile: request.route.accountProfileId ?? undefined, node: request.route.nodeId, capabilities: ['repository-review']},
        tokenState: {authority: 'unavailable'}, security: {credentialResidency: 'provider-local', referencesOnly: true}, approvals: [], provenance: {source: `parameterized-run:${request.run.id}`, createdAt: at, freshAt: at},
      });
      const context = this.transportIntegrity.create(created.id, contract, [
        dependency({id: 'initiating-request', required: true, source: 'parameterized-run', provenance: request.run.id, freshness: {observedAt: at}, expectedSha256: createHash('sha256').update(request.instruction).digest('hex')}),
        dependency({id: 'acceptance-criteria', required: true, source: 'job-definition', provenance: `job:${request.run.definition.id}@${request.run.definition.version}`, freshness: {observedAt: at}}),
        dependency({id: 'repository-identity', required: true, source: 'repository-resolver', provenance: request.run.repository?.identity ?? 'unknown', freshness: {observedAt: at}, expectedIdentity: request.run.repository?.reviewedSha}),
        dependency({id: 'frozen-context-chunk', required: true, source: 'repository-context', provenance: chunkId, freshness: {observedAt: at}, expectedSha256: request.contextChunks.find(chunk => chunk.id === chunkId)?.sha256}),
        dependency({id: 'route-capability', required: true, source: 'model-registry', provenance: `${request.route.providerId}/${request.route.modelId}`, freshness: {observedAt: at}}),
      ], {source: request.route.nodeId});
      created.transportIntegrity = context;
      created.audit.timeline.push({id: `audit-${randomUUID()}`, at, type: 'transport.context_bound', stageId: 'review', summary: 'Transport Context Contract bound to Work Parcel', detail: `${context.contractSha256} · ${context.state}`});
      created.provenance.push({at, type: 'transport-context', detail: context.contractSha256});
      this.parcels.update(created);
    }
    if (!this.adaptiveOrchestration) return created;
    const decision = this.adaptiveOrchestration.startDecision({parcelId: created.id, objective: created.objective, taskClass: 'repository-review', requiredCapabilities: ['repository-review'], workflowId: 'repository-review'});
    created.audit.orchestrationDecisionId = decision.id;
    this.adaptiveOrchestration.evaluateDecision(decision.id, {stageId: 'review', candidates: [{route: {providerId: request.route.providerId, modelId: request.route.modelId, accountProfileId: request.route.accountProfileId ?? null, nodeId: request.route.providerExecutionNodeId, modelVersion: request.route.qualificationVersion}, eligible: true, reasons: [], capabilities: this.models.qualification(request.route.modelId).capabilities, declaredOrder: 0}], workflowCandidates: [{id: 'repository-review', version: '1', eligible: true, reasons: []}]});
    return this.parcels.update(created);
  }

  private recordInvocation(parcel: WorkParcel, invocation: ModelInvocationResult, request: ReviewExecutionRequest, route: ModelRouteDecision, evidenceId: string) {
    const completedAt = new Date().toISOString();
    const startedAt = new Date(Date.parse(completedAt) - invocation.elapsedMs).toISOString();
    const provider = invocation.usage.providerReportedCost;
    const calculated = invocation.usage.calculatedCost;
    const cost = effectiveCost(provider !== null, provider ?? 0, calculated !== null, calculated ?? 0);
    const costBasis = provider !== null && (calculated === null || provider >= calculated) ? 'provider-reported' as const : calculated !== null ? 'calculated' as const : 'unavailable' as const;
    const cached = invocation.usage.cachedInputTokens;
    const cacheWrite = invocation.usage.cacheWriteTokens ?? null;
    const fresh = freshInput(invocation.usage.inputTokens, cached, cacheWrite);
    const prior = parcel.audit.totals;
    const first = prior.invocations === 0;
    const nextProviderCost = mergeAmount(prior.providerReportedCost, provider, first);
    const nextCalculatedCost = mergeAmount(prior.calculatedCost, calculated, first);
    const aggregateCostBasis = nextProviderCost !== null && (nextCalculatedCost === null || nextProviderCost >= nextCalculatedCost) ? 'provider-reported' as const : nextCalculatedCost !== null ? 'calculated' as const : 'unavailable' as const;
    const aggregateCost = aggregateCostBasis === 'provider-reported' ? nextProviderCost : aggregateCostBasis === 'calculated' ? nextCalculatedCost : null;
    const currency = first ? invocation.usage.currency : prior.currency === invocation.usage.currency ? prior.currency : null;
    parcel.audit.invocations.push({...this.acceptedExchanges.has(invocation) ? {exchange: this.acceptedExchanges.get(invocation)} : {}, id: evidenceId, stageId: 'review', runId: request.run.id, route: 'direct-provider.repository-review', provider: invocation.providerId, accountProfileId: route.accountProfileId, accountLabel: route.accountLabel, accountPlan: route.accountPlan, model: invocation.modelId, logicalRole: route.requestedRole, registryModelId: route.modelId, providerModel: route.providerModel, qualificationVersion: route.qualificationVersion, invocationProfile: invocation.invocationProfile ?? null, node: route.nodeId, workloadNodeId: route.workloadNodeId, providerExecutionNodeId: route.providerExecutionNodeId, credentialNodeId: route.credentialNodeId, profile: request.run.context?.profile ?? 'STANDARD', startedAt, completedAt, elapsedMs: invocation.elapsedMs, requestDispatched: true, usageAuthority: invocation.usage.totalTokens === null ? 'unavailable' : 'authoritative', inputTokens: invocation.usage.inputTokens, freshInputTokens: fresh, cachedInputTokens: cached, cacheWriteTokens: cacheWrite, outputTokens: invocation.usage.outputTokens, reasoningTokens: null, totalTokens: invocation.usage.totalTokens, providerReportedCost: provider, calculatedCost: calculated, costBasis, currency: invocation.usage.currency, ...(invocation.usage.cacheEvidence ? {cacheEvidence: invocation.usage.cacheEvidence} : {}), verifierResult: 'pending-repository-validation', outcome: invocation.finishReason ?? 'provider-completed'});
    this.recordCanonicalUsage(parcel, request, route);
    parcel.audit.timeline.push({id: `audit-${randomUUID()}`, at: completedAt, type: 'invocation.completed', stageId: 'review', summary: `${routeLabel(route)} returned structured review output`, detail: `Response ${evidenceId}; finish ${invocation.finishReason ?? 'unreported'}`});
    parcel.audit.totals = {models: [...new Set([...prior.models, auditModelLabel(route)])], invocations: prior.invocations + 1, inputTokens: mergeAmount(prior.inputTokens ?? null, invocation.usage.inputTokens, first), freshInputTokens: mergeAmount(prior.freshInputTokens, fresh, first), cachedInputTokens: mergeAmount(prior.cachedInputTokens, cached, first), cacheWriteTokens: mergeAmount(prior.cacheWriteTokens ?? null, cacheWrite, first), outputTokens: mergeAmount(prior.outputTokens, invocation.usage.outputTokens, first), reasoningTokens: null, totalTokens: mergeAmount(prior.totalTokens, invocation.usage.totalTokens, first), providerReportedCost: nextProviderCost, calculatedCost: nextCalculatedCost, cost: aggregateCost, costBasis: aggregateCostBasis, currency, modelExecutionMs: prior.modelExecutionMs + invocation.elapsedMs, wallClockMs: Math.max(0, Date.parse(completedAt) - Date.parse(parcel.createdAt))};
    parcel.telemetry = {inputTokens: parcel.audit.totals.inputTokens ?? null, freshInputTokens: parcel.audit.totals.freshInputTokens, cachedInputTokens: parcel.audit.totals.cachedInputTokens, cacheWriteTokens: parcel.audit.totals.cacheWriteTokens ?? null, outputTokens: parcel.audit.totals.outputTokens, reasoningTokens: parcel.audit.totals.reasoningTokens, totalTokens: parcel.audit.totals.totalTokens, cost: parcel.audit.totals.cost, currency: parcel.audit.totals.currency, elapsedMs: parcel.audit.totals.modelExecutionMs};
    parcel.provenance.push({at: completedAt, type: 'provider-response', detail: evidenceId});
    this.parcels.update(parcel);
    if (this.adaptiveOrchestration && parcel.audit.orchestrationDecisionId) this.adaptiveOrchestration.recordObservedRoute(parcel.audit.orchestrationDecisionId, {stageId: 'review', route: {providerId: route.providerId, modelId: route.modelId, accountProfileId: route.accountProfileId ?? null, nodeId: route.nodeId, modelVersion: route.qualificationVersion}, reason: `Observed provider invocation ${route.providerId}/${route.modelId}`});
  }

  private recordAdaptiveFailure(parcel: WorkParcel, route: ModelRouteDecision, reason: string) {
    if (!this.adaptiveOrchestration || !parcel.audit.orchestrationDecisionId) return;
    this.adaptiveOrchestration.recordOutcome({decisionId: parcel.audit.orchestrationDecisionId, parcelId: parcel.id, stageId: 'review', route: {providerId: route.providerId, modelId: route.modelId, accountProfileId: route.accountProfileId ?? null, nodeId: route.nodeId, modelVersion: route.qualificationVersion}, workflow: {id: 'repository-review', version: '1'}, evidenceKind: 'PRODUCTION_WORK_PARCEL', outcome: 'PROVIDER_FAILURE', verified: false, qualityGatePass: null, failureClass: 'provider', observedAt: new Date().toISOString()});
    parcel.provenance.push({at: new Date().toISOString(), type: 'adaptive-outcome', detail: 'provider-failure:provider invocation failed'});
    this.parcels.update(parcel);
  }

  private recordCanonicalUsage(parcel: WorkParcel, request: ReviewExecutionRequest, route: ModelRouteDecision) {
    if (!this.usageLedger) return;
    const invocation=parcel.audit.invocations.at(-1)!;
    const id=`review:${request.run.id}:${parcel.id}:${parcel.audit.invocations.length}`;
    const cli=this.routeConfiguration(route).provider.kind==='cli';
    const record=createInvocationObservation({id,jobId:request.run.savedJobId??request.run.definition.id,runId:request.run.id,stepId:'repository-review',taskId:parcel.id,laneId:route.nodeId,model:route.providerModel,provider:route.providerId,accountProfileId:route.accountProfileId??undefined,harnessProfile:request.run.context?.profile??'STANDARD',executionStrategy:'direct-repository-review',startedAt:invocation.startedAt,completedAt:invocation.completedAt??new Date().toISOString(),recipeFingerprint:request.run.repository?.reviewedSha??'unresolved',evidenceIds:[invocation.id],rawUsage:invocation,cacheEvidence:invocation.cacheEvidence,outcome:invocation.outcome.startsWith('provider-failed:')?'FAILED':'COMPLETE',accounting:{schema:'agent-control.usage-accounting/v1',revision:0,parentInvocationId:null,retryOfInvocationId:null,parcelId:parcel.id,batonId:null,providerRequestId:null,modelRevision:null,runtime:cli?'codex-cli':'provider-api',runtimeVersion:null,machine:route.providerExecutionNodeId,hardware:null,jobType:request.run.definition.id,executionKind:'API',provenance:{kind:'NATIVE',source:'direct-repository-review',sourceVersion:'1',migrationVersion:null,at:invocation.startedAt},semantics:{id:cli?'codex-exec-turn-usage/v1':'provider-normalized-unattested/v1',input:cli?'INCLUDES_CACHE':'UNKNOWN',reasoning:cli?'IN_OUTPUT':'UNKNOWN',total:cli?'INPUT_PLUS_OUTPUT':'PROVIDER_ONLY',billing:'UNKNOWN'},evidence:{input:invocation.inputTokens??null,cached:invocation.cachedInputTokens,cacheWrite:invocation.cacheWriteTokens??null,output:invocation.outputTokens,reasoning:invocation.reasoningTokens,total:invocation.totalTokens},pricing:null,reportedCost:invocation.providerReportedCost!==null&&invocation.currency?{amount:legacyDecimal(invocation.providerReportedCost),currency:invocation.currency,source:'provider-reported'}:null,localApiChargeKnownZero:false}});
    this.usageLedger.record(record);
    invocation.accountingInvocationId=id;
  }

  private recordFailedInvocation(parcel: WorkParcel, error: unknown, request: ReviewExecutionRequest, route: ModelRouteDecision, totals: ExecutionTotals) {
    const observation = failureObservation(error), invocationUsage = observation?.usage ?? null, completedAt = new Date().toISOString(), failure = classifyExecutionFailure(error);
    totals.accountedInvocations++;
    accountUsage(totals, invocationUsage);
    const input = invocationUsage?.inputTokens ?? null, cached = invocationUsage?.cachedInputTokens ?? null, cacheWrite = invocationUsage?.cacheWriteTokens ?? null, fresh = freshInput(input, cached, cacheWrite), output = invocationUsage?.outputTokens ?? null, total = invocationUsage?.totalTokens ?? null, provider = invocationUsage?.providerReportedCost ?? null, calculated = invocationUsage?.calculatedCost ?? null;
    const prior = parcel.audit.totals, first = prior.invocations === 0, nextProviderCost = mergeAmount(prior.providerReportedCost, provider, first), nextCalculatedCost = mergeAmount(prior.calculatedCost, calculated, first), aggregateCostBasis = nextProviderCost !== null && (nextCalculatedCost === null || nextProviderCost >= nextCalculatedCost) ? 'provider-reported' as const : nextCalculatedCost !== null ? 'calculated' as const : 'unavailable' as const, aggregateCost = aggregateCostBasis === 'provider-reported' ? nextProviderCost : aggregateCostBasis === 'calculated' ? nextCalculatedCost : null, currency = first ? invocationUsage?.currency ?? null : prior.currency === (invocationUsage?.currency ?? null) ? prior.currency : null;
    const id = `provider-failure:${randomUUID()}`;
    parcel.audit.invocations.push({id, stageId: 'review', runId: request.run.id, route: 'direct-provider.repository-review', provider: route.providerId, accountProfileId: route.accountProfileId, accountLabel: route.accountLabel, accountPlan: route.accountPlan, model: route.modelId, logicalRole: route.requestedRole, registryModelId: route.modelId, providerModel: route.providerModel, qualificationVersion: route.qualificationVersion, invocationProfile: observation?.invocationProfile ?? null, node: route.nodeId, workloadNodeId: route.workloadNodeId, providerExecutionNodeId: route.providerExecutionNodeId, credentialNodeId: route.credentialNodeId, profile: request.run.context?.profile ?? 'STANDARD', startedAt: observation?.elapsedMs ? new Date(Date.parse(completedAt) - observation.elapsedMs).toISOString() : completedAt, completedAt, elapsedMs: observation?.elapsedMs ?? null, requestDispatched: observation?.requestDispatched ?? null, usageAuthority: observation?.usageAuthority ?? 'unavailable', inputTokens: input, freshInputTokens: fresh, cachedInputTokens: cached, cacheWriteTokens: cacheWrite, outputTokens: output, reasoningTokens: null, totalTokens: total, providerReportedCost: provider, calculatedCost: calculated, costBasis: provider !== null ? 'provider-reported' : calculated !== null ? 'calculated' : 'unavailable', currency: invocationUsage?.currency ?? null, verifierResult: 'not-applicable-transport-failure', outcome: `provider-failed:${failure.kind}`});
    this.recordCanonicalUsage(parcel, request, route);
    parcel.audit.totals = {models: [...new Set([...prior.models, auditModelLabel(route)])], invocations: prior.invocations + 1, inputTokens: mergeAmount(prior.inputTokens ?? null, input, first), freshInputTokens: mergeAmount(prior.freshInputTokens, fresh, first), cachedInputTokens: mergeAmount(prior.cachedInputTokens, cached, first), cacheWriteTokens: mergeAmount(prior.cacheWriteTokens ?? null, cacheWrite, first), outputTokens: mergeAmount(prior.outputTokens, output, first), reasoningTokens: null, totalTokens: mergeAmount(prior.totalTokens, total, first), providerReportedCost: nextProviderCost, calculatedCost: nextCalculatedCost, cost: aggregateCost, costBasis: aggregateCostBasis, currency, modelExecutionMs: prior.modelExecutionMs + (observation?.elapsedMs ?? 0), wallClockMs: Math.max(0, Date.parse(completedAt) - Date.parse(parcel.createdAt))};
    parcel.telemetry = {inputTokens: parcel.audit.totals.inputTokens ?? null, freshInputTokens: parcel.audit.totals.freshInputTokens, cachedInputTokens: parcel.audit.totals.cachedInputTokens, cacheWriteTokens: parcel.audit.totals.cacheWriteTokens ?? null, outputTokens: parcel.audit.totals.outputTokens, reasoningTokens: parcel.audit.totals.reasoningTokens, totalTokens: parcel.audit.totals.totalTokens, cost: parcel.audit.totals.cost, currency: parcel.audit.totals.currency, elapsedMs: parcel.audit.totals.modelExecutionMs};
    parcel.provenance.push({at: completedAt, type: 'provider-attempt-accounting', detail: `${id}:${observation?.requestDispatched === false ? 'not-dispatched-zero-or-reported-usage' : observation?.usage ? observation.usageAuthority : 'usage-unavailable'}`});
    this.parcels.update(parcel);
  }

  private finishParcel(parcel: WorkParcel, status: 'SUCCEEDED' | 'FAILED', detail: string) {
    const at = new Date().toISOString();
    parcel.status = status;
    parcel.endedAt = at;
    parcel.stages[0].status = status;
    parcel.stages[0].endedAt = at;
    if (status === 'FAILED') parcel.stages[0].error = detail;
    parcel.provenance.push({at, type: status === 'SUCCEEDED' ? 'provider-completed' : 'failed', detail});
    this.parcels.update(parcel);
  }
}

function actorId(route: ModelRouteDecision) { return `agent:${route.providerId}:${route.accountProfileId ?? 'default'}:${route.modelId}:${route.nodeId}`; }
function agentId(route: ModelRouteDecision) { return `model:${route.accountProfileId ?? 'default'}:${route.modelId}:${route.nodeId}`; }
function routeLabel(route: {providerId: string; accountProfileId?: string | null; accountLabel?: string | null; modelId: string; nodeId?: string}) { return `${route.providerId}/${route.accountLabel ?? route.accountProfileId ?? 'default'}/${route.modelId}@${route.nodeId ?? 'controller'}`; }
function auditModelLabel(route: {providerId: string; accountProfileId?: string | null; accountLabel?: string | null; modelId: string}) { return route.accountProfileId ? routeLabel(route) : route.modelId; }
function requiredAccount(account?: ProviderAccountProfileConfig) { if (!account) throw new Error('codex_account_profile_required'); return account; }
function executionSessionScope(request: ReviewExecutionRequest, route: ModelRouteDecision, parcel: WorkParcel, chunk: ReviewChunk): ExecutionSessionScope {
  return {
    runId: request.run.id,
    jobId: request.run.savedJobId ?? request.run.definition.id,
    jobVersion: String(request.run.definition.version),
    stepId: `repository-review:${chunk.id}`,
    actionId: 'repository.review.invoke',
    workerId: `provider:${route.providerId}:${route.accountProfileId ?? 'default'}:${route.modelId}`,
    nodeId: route.providerExecutionNodeId ?? route.nodeId,
    parcelId: parcel.id,
    crewRole: 'quality-inspector',
    providerId: route.providerId,
    ...(route.accountLabel ? {accountLabel: route.accountLabel} : {}),
    modelId: route.modelId,
  };
}
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
function normalizeQualityGateResult(value: RepositoryReviewQualityGateResult): RepositoryReviewQualityGateResult {
  if (!value || typeof value !== 'object' || typeof value.accepted !== 'boolean' || !/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(value.code) || !value.summary?.trim() || !value.nextAction?.trim()) throw new Error('repository_review_quality_gate_result_invalid');
  for (const items of [value.evidence, value.unresolvedCriteria]) if (!Array.isArray(items) || items.some(item => typeof item !== 'string' || !item.trim())) throw new Error('repository_review_quality_gate_result_invalid');
  return {accepted: value.accepted, code: value.code, summary: value.summary.trim(), evidence: [...new Set(value.evidence)], unresolvedCriteria: [...new Set(value.unresolvedCriteria)], nextAction: value.nextAction.trim()};
}
function mergeAmount(previous: number | null, next: number | null, first: boolean) { return first ? next : previous === null || next === null ? null : previous + next; }
function failureObservation(error: unknown) { return (error as {providerFailureObservation?: ProviderFailureObservation})?.providerFailureObservation; }
function accountUsage(totals: ExecutionTotals, value: ModelInvocationResult['usage'] | null) {
  if (!value || [value.inputTokens, value.outputTokens, value.totalTokens].some(item => item === null)) { totals.completeTokens = false; totals.unknownUsageInvocations++; }
  totals.inputTokens += value?.inputTokens ?? 0;
  const cached = value?.cachedInputTokens ?? null, cacheWrite = value?.cacheWriteTokens ?? null, fresh = freshInput(value?.inputTokens, cached, cacheWrite);
  if (fresh === null) totals.completeFreshInput = false; else totals.freshInputTokens += fresh;
  if (cached === null) totals.completeCachedInput = false; else totals.cachedInputTokens += cached;
  if (cacheWrite === null) totals.completeCacheWrite = false; else totals.cacheWriteTokens += cacheWrite;
  totals.outputTokens += value?.outputTokens ?? 0;
  totals.totalTokens += value?.totalTokens ?? 0;
  if (value?.providerReportedCost === null || value?.providerReportedCost === undefined) totals.completeProviderCost = false; else totals.providerReportedCost += value.providerReportedCost;
  if (value?.calculatedCost === null || value?.calculatedCost === undefined) totals.completeCalculatedCost = false; else totals.calculatedCost += value.calculatedCost;
  totals.currency ??= value?.currency ?? undefined;
}
function freshInput(input: number | null | undefined, cached: number | null | undefined, cacheWrite: number | null | undefined = null) { return input === null || input === undefined || cached === null || cached === undefined || cached > input || (cacheWrite !== null && cacheWrite !== undefined && cached + cacheWrite > input) ? null : input - cached - (cacheWrite ?? 0); }
function effectiveCost(providerComplete: boolean, provider: number, calculatedComplete: boolean, calculated: number) { return Math.max(providerComplete ? provider : 0, calculatedComplete ? calculated : 0); }
function estimateCost(model: ModelRegistryRow, source: ModelInvocationResult) {
  return calculateModelUsageCost(source.usage.inputTokens, source.usage.outputTokens, source.usage.cachedInputTokens, model.pricing, source.usage.cacheWriteTokens ?? null);
}
function usage(totals: ExecutionTotals) {
  if (!totals.accountedInvocations) return {source: 'unavailable' as const};
  const cost = effectiveCost(totals.completeProviderCost, totals.providerReportedCost, totals.completeCalculatedCost, totals.calculatedCost);
  const source = totals.completeProviderCost && (!totals.completeCalculatedCost || totals.providerReportedCost >= totals.calculatedCost) ? 'provider' as const : totals.completeCalculatedCost ? 'calculated' as const : 'unavailable' as const;
  return {...(totals.completeTokens ? {inputTokens: totals.inputTokens, outputTokens: totals.outputTokens, totalTokens: totals.totalTokens} : {}), ...(totals.completeFreshInput ? {freshInputTokens: totals.freshInputTokens} : {}), ...(totals.completeCachedInput ? {cachedInputTokens: totals.cachedInputTokens} : {}), ...(totals.completeCacheWrite ? {cacheWriteTokens: totals.cacheWriteTokens} : {}), ...(totals.completeProviderCost ? {providerReportedCost: totals.providerReportedCost} : {}), ...(totals.completeCalculatedCost ? {calculatedCost: totals.calculatedCost} : {}), ...(source === 'unavailable' ? {} : {cost}), currency: totals.currency, accountedInvocations: totals.accountedInvocations, unknownUsageInvocations: totals.unknownUsageInvocations, source};
}

export const REPOSITORY_REVIEW_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object', additionalProperties: false,
  properties: {
    // Keep provider-side structured output and application validation aligned.
    // A structural-only schema previously allowed values that the application
    // then rejected without identifying the mismatched field.
    schema: {type: 'string', enum: ['agent-control.repository-review/v1']}, executiveSummary: {type: 'string', minLength: 1},
    findings: {type: 'array', items: {type: 'object', additionalProperties: false, properties: {id: {type: 'string', minLength: 1}, severity: {type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info']}, title: {type: 'string', minLength: 1}, category: {type: 'string', enum: ['correctness', 'reliability', 'security', 'maintainability', 'other']}, file: {type: ['string', 'null']}, startLine: {type: ['integer', 'null'], minimum: 1}, endLine: {type: ['integer', 'null'], minimum: 1}, evidence: {type: 'string', minLength: 1}, reasoning: {type: 'string', minLength: 1}, impact: {type: 'string', minLength: 1}, suggestedRemediation: {type: 'string', minLength: 1}, confidence: {type: 'number', minimum: 0, maximum: 1}, validation: {type: 'object', additionalProperties: false, properties: {state: {type: 'string', enum: ['VALID', 'REJECTED', 'UNVERIFIED']}, reasons: {type: 'array', items: {type: 'string'}}}, required: ['state', 'reasons']}}, required: ['id', 'severity', 'title', 'category', 'file', 'startLine', 'endLine', 'evidence', 'reasoning', 'impact', 'suggestedRemediation', 'confidence', 'validation']}},
    positiveObservations: {type: 'array', items: {type: 'string'}}, areasReviewed: {type: 'array', items: {type: 'string'}}, areasNotReviewed: {type: 'array', items: {type: 'string'}}, verdict: {type: 'string', enum: ['PASS', 'PASS_WITH_FINDINGS', 'REVIEW_REQUIRED', 'FAILED']},
  }, required: ['schema', 'executiveSummary', 'findings', 'positiveObservations', 'areasReviewed', 'areasNotReviewed', 'verdict'],
};

export function parseRepositoryReviewResponse(output: string): RepositoryReviewResult {
  let text = output.trim();
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('repository_review_provider_json_invalid'); }
  const normalized = normalizeNullableLocations(value);
  const issues = repositoryReviewSchemaIssues(normalized);
  if (issues.length) throw new Error(`repository_review_provider_schema_invalid:${issues.slice(0, 8).join(',')}`);
  return normalized as RepositoryReviewResult;
}
function normalizeNullableLocations(value: unknown): unknown {
  if (!record(value) || !Array.isArray(value.findings)) return value;
  return {...value, findings: value.findings.map(finding => {
    if (!record(finding)) return finding;
    const normalized = {...finding};
    for (const key of ['file', 'startLine', 'endLine']) if (normalized[key] === null) delete normalized[key];
    return normalized;
  })};
}
export function repositoryReviewSchemaIssues(value: unknown): string[] {
  const issues: string[] = [];
  if (!record(value)) return ['$:object_required'];
  if (value.schema !== 'agent-control.repository-review/v1') issues.push('$.schema:literal');
  if (!nonempty(value.executiveSummary)) issues.push('$.executiveSummary:nonempty_string');
  for (const field of ['positiveObservations', 'areasReviewed', 'areasNotReviewed'] as const) if (!arrayOfStrings(value[field])) issues.push(`$.${field}:string_array`);
  if (!['PASS', 'PASS_WITH_FINDINGS', 'REVIEW_REQUIRED', 'FAILED'].includes(String(value.verdict))) issues.push('$.verdict:enum');
  if (!Array.isArray(value.findings)) issues.push('$.findings:array');
  else value.findings.forEach((finding, index) => {
    const root = `$.findings[${index}]`;
    if (!record(finding)) { issues.push(`${root}:object`); return; }
    if (!nonempty(finding.id)) issues.push(`${root}.id:nonempty_string`);
    if (!['critical', 'high', 'medium', 'low', 'info'].includes(String(finding.severity))) issues.push(`${root}.severity:enum`);
    if (!nonempty(finding.title)) issues.push(`${root}.title:nonempty_string`);
    if (!['correctness', 'reliability', 'security', 'maintainability', 'other'].includes(String(finding.category))) issues.push(`${root}.category:enum`);
    for (const field of ['evidence', 'reasoning', 'impact', 'suggestedRemediation'] as const) if (!nonempty(finding[field])) issues.push(`${root}.${field}:nonempty_string`);
    if (typeof finding.confidence !== 'number' || !Number.isFinite(finding.confidence) || finding.confidence < 0 || finding.confidence > 1) issues.push(`${root}.confidence:range_0_1`);
    if (finding.file !== undefined && !nonempty(finding.file)) issues.push(`${root}.file:nonempty_string_or_null`);
    if (finding.startLine !== undefined && !positiveInteger(finding.startLine)) issues.push(`${root}.startLine:positive_integer_or_null`);
    if (finding.endLine !== undefined && !positiveInteger(finding.endLine)) issues.push(`${root}.endLine:positive_integer_or_null`);
    if (finding.endLine !== undefined && finding.startLine === undefined) issues.push(`${root}.endLine:startLine_required`);
    if (positiveInteger(finding.endLine) && positiveInteger(finding.startLine) && finding.endLine < finding.startLine) issues.push(`${root}.endLine:not_before_startLine`);
    if (!record(finding.validation)) issues.push(`${root}.validation:object`);
    else {
      if (!['VALID', 'REJECTED', 'UNVERIFIED'].includes(String(finding.validation.state))) issues.push(`${root}.validation.state:enum`);
      if (!arrayOfStrings(finding.validation.reasons)) issues.push(`${root}.validation.reasons:string_array`);
    }
  });
  return issues;
}
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function nonempty(value: unknown): value is string { return typeof value === 'string' && Boolean(value.trim()); }
function positiveInteger(value: unknown): value is number { return Number.isInteger(value) && Number(value) > 0; }
function arrayOfStrings(value: unknown): value is string[] { return Array.isArray(value) && value.every(item => typeof item === 'string'); }
function extractIdentifiers(value: string) { return [...new Set(value.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) ?? [])].slice(0, 12); }
function retrievalIdentifiers(value:string){return extractIdentifiers(value).filter(item=>item.includes('_')||/[a-z][A-Z]/.test(item)||/^[A-Z0-9_]{3,}$/.test(item));}
function retrievalQuery(instruction:string,files:string[]){const identifiers=retrievalIdentifiers(instruction);return [`Assigned repository paths: ${files.join(' ')}`,...(identifiers.length?[`Code identifiers: ${identifiers.join(' ')}`]:[])].join('\n');}
function consolidate(results: RepositoryReviewResult[]): RepositoryReviewResult { const findings = results.flatMap(result => result.findings ?? []), verdict = results.some(result => result.verdict === 'FAILED') ? 'FAILED' : results.some(result => result.verdict === 'REVIEW_REQUIRED') ? 'REVIEW_REQUIRED' : findings.length ? 'PASS_WITH_FINDINGS' : 'PASS'; return {schema: 'agent-control.repository-review/v1', executiveSummary: results.map(result => result.executiveSummary).filter(Boolean).join('\n\n'), findings, positiveObservations: [...new Set(results.flatMap(result => result.positiveObservations ?? []))], areasReviewed: [...new Set(results.flatMap(result => result.areasReviewed ?? []))], areasNotReviewed: [...new Set(results.flatMap(result => result.areasNotReviewed ?? []))], verdict}; }

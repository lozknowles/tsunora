import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {AdaptiveHarness, SkillCatalog, ToolPolicy, type HarnessCandidate, type RecipeRequest} from './adaptive-harness.js';
import {createToolHandlerRegistry, HarnessDispatcher, HarnessJobAgentAction, withLifecycleHeartbeat, type RecipeDispatchPlan, type RecipeExecutor, type ToolInvocationGateway} from './harness-dispatch.js';
import {EconomicRouter} from './economic-routing.js';
import {configuredHarnessProfiles, createInvocationObservation, HarnessProfileRouter, type ContextPacketSource, type HarnessEfficiencyLedgerPort} from './harness-efficiency.js';
import {ActionFailure, ActionRegistry} from './job-runtime.js';
import type {AgentControlConfig, ProviderConfig} from './config.js';

interface ResponseBody {
  id?: string;
  model?: string;
  status?: string;
  output_text?: string;
  output?: Array<{type?: string; content?: Array<{type?: string; text?: string}>}>;
  usage?: Record<string, unknown>;
  error?: {message?: string};
}

function outputText(body: ResponseBody) {
  if (typeof body.output_text === 'string') return body.output_text;
  return (body.output ?? []).filter(item => item.type === 'message' || item.type === undefined).flatMap(item => item.content ?? []).filter(item => item.type === 'output_text' || item.type === undefined).map(item => item.text ?? '').filter(Boolean).join('\n');
}

function safeUsage(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9_]{0,63}$/i.test(key)) continue;
    if (typeof child === 'number' && Number.isFinite(child) && child >= 0) result[key] = child;
    else {
      const nested = safeUsage(child);
      if (nested && Object.keys(nested).length) result[key] = nested;
    }
  }
  return Object.keys(result).length ? result : undefined;
}

function providerReportedCost(value: unknown): number | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  for (const key of ['cost', 'total_cost', 'reported_cost']) {
    const cost = (value as Record<string, unknown>)[key];
    if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) return cost;
  }
  return undefined;
}

function readCredential(provider: ProviderConfig) {
  const fileVariable = provider.credentialFileEnv;
  if (fileVariable && process.env[fileVariable]) {
    const file = path.resolve(process.env[fileVariable]!);
    const stat = fs.statSync(file);
    if (!stat.isFile()) throw new ActionFailure('provider_credential_file_not_regular', 'authentication');
    if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) throw new ActionFailure('provider_credential_file_permissions_too_open', 'authentication');
    const value = fs.readFileSync(file, 'utf8').trim();
    if (!value) throw new ActionFailure('provider_credential_file_empty', 'authentication');
    return {value, source: 'file', reference: fileVariable};
  }
  const environmentVariable = provider.credentialEnv;
  if (environmentVariable && process.env[environmentVariable]) return {value: process.env[environmentVariable]!, source: 'environment', reference: environmentVariable};
  throw new ActionFailure('provider_credential_unavailable', 'authentication');
}

function reviewFile(value: unknown) {
  if (typeof value !== 'string' || !value) throw new ActionFailure('context_file_required', 'configuration');
  const allowedRootSetting = process.env.AGENT_CONTROL_REVIEW_ROOT;
  if (!allowedRootSetting) throw new ActionFailure('review_root_not_configured', 'configuration');
  const allowedRoot = path.resolve(allowedRootSetting);
  const file = path.resolve(value);
  if (file !== allowedRoot && !file.startsWith(`${allowedRoot}${path.sep}`)) throw new ActionFailure('context_file_outside_review_root', 'policy_rejection');
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new ActionFailure('context_file_not_regular', 'configuration');
  return {file, stat};
}

export function isCompleteLargeContextReview(response: string) {
  const requiredSections = ['What I would delete or simplify', 'CURRENT', 'PROPOSED', 'Quick wins', 'Structural improvements', 'Experimental ideas'];
  const opening = response.slice(0, 2_000);
  const hasVerdict = /^(?:\s*(?:\*\*)?(?:(?:Final\s+)?verdict:\s*)?`?(?:PASS_FOR_[A-Z0-9._-]+|REVIEW_REQUIRED|BLOCKED)`?\.?(?:\*\*)?\s*)$/im.test(opening);
  const refused = !hasVerdict && /(?:^|\n)\s*#{1,3}\s*(?:[^\n]{0,80}\s)?Invocation Gate:\s*FAIL\b|(?:^|\n)\s*#{1,3}\s*Review Not Performed\b|\bI cannot invoke (?:an?\s+)?(?:external|review)\b/i.test(opening);
  return response.length >= 8_000 && requiredSections.every(section => response.toLowerCase().includes(section.toLowerCase())) && !refused;
}

class LargeContextResponsesExecutor implements RecipeExecutor {
  constructor(private readonly provider: ProviderConfig, private readonly contextFile: string, private readonly reviewPrompt: string, private readonly maximumOutputTokens: number) {}

  async execute(recipe: Parameters<RecipeExecutor['execute']>[0], tools: ToolInvocationGateway) {
    const credential = readCredential(this.provider);
    const input = fs.readFileSync(this.contextFile, 'utf8');
    const startedAt = new Date().toISOString();
    const started = Date.now();
    const endpoint = `${this.provider.baseUrl!.replace(/\/$/, '')}/responses`;
    tools.lifecycle?.('waiting for provider');
    let response!: Response;
    const body = await withLifecycleHeartbeat(tools, async () => {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {'content-type': 'application/json', authorization: `Bearer ${credential.value}`},
        body: JSON.stringify({
          model: this.provider.qualificationModel,
          instructions: `Agent Control has invoked the operator-configured, qualified review provider and model. Act as the independent principal reviewer for this run. Do not attempt to invoke another model, inspect the live machine, create files, or refuse because you lack shell tools: the controller already captured a complete clean repository snapshot and will materialize your response. Perform the review using only the supplied immutable bundle. Do not claim to have modified or deployed anything.\n\nAUTHORITATIVE OPERATOR PROMPT:\n${this.reviewPrompt}`,
          input,
          max_output_tokens: this.maximumOutputTokens,
          stream: false,
          store: false,
        }),
        signal: AbortSignal.timeout(90 * 60 * 1000),
      });
      try { return await response.json() as ResponseBody; }
      catch { throw new ActionFailure(`provider_response_not_json:http_${response.status}`, 'execution'); }
    });
    tools.lifecycle?.('response received');
    const completedAt = new Date().toISOString();
    tools.lifecycle?.('processing');
    const text = outputText(body);
    const rawResponseSha256 = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const contextSha256 = createHash('sha256').update(input).digest('hex');
    const result = {
      schema: 'agent-control.large-context-review/v1',
      providerId: this.provider.id,
      requestedModel: this.provider.qualificationModel,
      returnedModel: body.model,
      providerResponseId: body.id,
      providerStatus: body.status,
      startedAt,
      completedAt,
      elapsedMs: Date.now() - started,
      turns: 1,
      contextFile: this.contextFile,
      contextBytes: Buffer.byteLength(input),
      contextEstimatedTokens: Math.ceil(Buffer.byteLength(input) / 4),
      contextSha256,
      reviewPromptSha256: createHash('sha256').update(this.reviewPrompt).digest('hex'),
      submittedPrompt: this.reviewPrompt,
      maximumOutputTokens: this.maximumOutputTokens,
      truncation: false,
      usage: safeUsage(body.usage),
      credentialSource: credential.source,
      credentialReference: credential.reference,
      rawResponseSha256,
      responseText: text,
    };
    const startupSources: ContextPacketSource[] = [
      {id: `${recipe.id}:system`, kind: 'system_instructions', content: 'Independent whole-repository defect, efficiency and architecture review with no mutations.', required: true, persistent: true, relevance: 1, provenanceIds: [recipe.fingerprint]},
      {id: `${recipe.id}:context`, kind: 'task_context', estimatedTokens: result.contextEstimatedTokens, required: true, persistent: false, relevance: 1, provenanceIds: [contextSha256]},
    ];
    const observation = createInvocationObservation({
      jobId: recipe.jobId ?? recipe.taskId, runId: recipe.runId, stepId: recipe.stepId, taskId: recipe.taskId, laneId: recipe.authority.laneId,
      model: body.model ?? this.provider.qualificationModel!, provider: this.provider.id, harnessProfile: recipe.harness?.profile ?? 'DEEP', executionStrategy: 'responses.large-context-review',
      startedAt, completedAt, startupSources, rawUsage: body.usage, contextSourceIds: recipe.context.sourceIds,
      providerReportedCost: providerReportedCost(body.usage), pricing: this.provider.pricing ? {currency: this.provider.pricing.currency, freshInputPerMillionTokens: this.provider.pricing.inputPerMillionTokens, outputPerMillionTokens: this.provider.pricing.outputPerMillionTokens, fixedPerRequest: this.provider.pricing.fixedPerRequest, source: this.provider.pricing.source} : undefined, finishReason: body.status,
      outcome: response.ok && body.status === 'completed' && Boolean(text.trim()) ? 'COMPLETE' : 'FAILED', error: response.ok ? `provider_incomplete:${body.status ?? 'unknown'}` : `provider_http_${response.status}:${String(body.error?.message ?? 'unknown').slice(0, 512)}`, phase: 'processing', recipeFingerprint: recipe.fingerprint, contextPacketId: recipe.harness?.contextPacketId,
      evidenceIds: [`provider_response:${body.id ?? rawResponseSha256}`, `provider_response_sha256:${rawResponseSha256}`, `context_sha256:${contextSha256}`],
    });
    if (!response.ok || body.status !== 'completed' || !text.trim()) {
      const message = !response.ok ? `provider_http_${response.status}:${String(body.error?.message ?? 'unknown').slice(0, 512)}` : `provider_incomplete:${body.status ?? 'unknown'}`;
      const failure = new ActionFailure(message, response.status === 401 || response.status === 403 ? 'authentication' : 'execution');
      Object.assign(failure, {efficiencyObservations: [observation], partialActionOutput: {artifacts: [{name: 'review-result', value: result}], evidence: [`provider_response:${body.id ?? rawResponseSha256}`, `provider_response_sha256:${rawResponseSha256}`, `context_sha256:${contextSha256}`], detail: message}});
      throw failure;
    }
    return {
      resultRef: JSON.stringify(result), confidence: .85, fingerprint: rawResponseSha256,
      evidence: [`provider_response:${body.id ?? rawResponseSha256}`, `provider_response_sha256:${rawResponseSha256}`, `context_sha256:${contextSha256}`],
      invocations: [observation],
    };
  }
}

function candidate(provider: ProviderConfig, workerId: string): HarnessCandidate {
  if (!provider.pricing) throw new Error('operator_review_pricing_not_configured');
  return {
    route: {
      id: `${provider.id}:${provider.qualificationModel}:${workerId}`,
      providerId: provider.id,
      modelId: provider.qualificationModel!,
      workerId,
      local: false,
      health: 'healthy',
      qualified: true,
      qualificationReason: `qualified:${provider.qualification?.lastSuccessfulAt ?? 'operator-record'}`,
      capabilities: [...new Set([...(provider.capabilities ?? []), 'repository.review'])],
      pricing: {...provider.pricing, fixedPerRequest: provider.pricing.fixedPerRequest ?? 0},
      performance: {startupLatencyMs: 500, inputTokensPerSecond: 1000, outputTokensPerSecond: 60, historicalSuccessRate: 1, expectedQuality: .8, confidence: .7, contextLimitTokens: provider.qualification?.advertisedContextLimitTokens ?? 1048576, source: 'measured', sampleSize: 1},
    },
    workerCapabilities: ['model.execute', 'network.read'],
    modelCapabilities: ['repository.review', 'large-context', 'text'],
    promptProfiles: [{id: 'independent-architecture-review', version: '1', description: 'Evidence-led, repository-specific large-context architecture review'}],
    availableSkillIds: [], availableToolIds: [], supportedHarnessProfiles: ['DEEP'],
    runtime: {executionStrategy: 'responses.large-context-review', providerEndpoint: provider.baseUrl!},
  };
}

function plan(runId: string, stepId: string, workerId: string, route: HarnessCandidate, contextFile: string, contextBytes: number, maximumOutputTokens: number): RecipeDispatchPlan {
  const estimatedTokens = Math.ceil(contextBytes / 4);
  const authority: RecipeRequest['authority'] = {laneId: `job:${runId}`, leaseGeneration: 1, ownershipGeneration: 1, owner: 'agent'};
  return {
    request: {
      taskId: `${runId}:${stepId}`, stepId, taskType: 'whole-repository-independent-review', requiredCapabilities: ['repository.review', 'large-context'], requiredTools: [], approvedRisks: ['read'],
      preferredPromptProfile: 'independent-architecture-review', intent: 'NORMAL', inputTokens: estimatedTokens, outputTokens: maximumOutputTokens,
      maximumLatencyMs: 90 * 60 * 1000, maximumMonetarySpend: 1, meteredApproved: true,
      context: {tier: 3, sourceIds: [contextFile], evidenceIds: [`context-bytes:${contextBytes}`], estimatedTokens}, authority,
      verification: {requiredEvidence: ['provider-completed'], requireIndependentCheck: true},
      escalation: {minimumConfidence: .7, maximumAttempts: 1, onFailure: 'review'},
      harnessRouting: {taskId: `${runId}:${stepId}`, complexity: .98, risk: 'medium', knownExactTargets: true, estimatedFiles: 337, deterministicVerifier: true, ambiguity: .5, architectural: true, requestedProfile: 'DEEP'},
    },
    candidates: [route], placement: {workerId, reason: 'Agent Control selected the qualified local controller worker for the remote metered provider'},
  };
}

export function registerOperatorReviewActions(config: AgentControlConfig, registry = new ActionRegistry(), efficiency?: HarnessEfficiencyLedgerPort) {
  if (process.env.AGENT_CONTROL_ENABLE_OPERATOR_REVIEW !== 'true') return registry;
  const providerId = process.env.AGENT_CONTROL_OPERATOR_REVIEW_PROVIDER;
  if (!providerId) throw new Error('operator_review_provider_not_selected');
  const provider = config.providers.find(item => item.id === providerId);
  if (!provider?.baseUrl || !provider.qualificationModel || provider.wireApi !== 'responses') throw new Error('operator_review_provider_not_configured');
  if (provider.qualification?.status !== 'qualified') throw new Error('operator_review_provider_not_qualified');
  if (!provider.pricing?.source) throw new Error('operator_review_pricing_not_configured');
  const policy = new ToolPolicy([]);
  const profileRouter = new HarnessProfileRouter({mode: 'EXPERIMENT', minimumVerifiedRuns: 1, minimumSuccessRate: 0, minimumSameModelControlledRuns: 1});
  const harness = new AdaptiveHarness(new SkillCatalog(), policy, new EconomicRouter(), profileRouter, configuredHarnessProfiles(config.harnessEfficiency));
  const dispatcher = new HarnessDispatcher(harness, policy, createToolHandlerRegistry([]), recipe => ({authority: recipe.authority, workerId: recipe.workerId, availableToolIds: [], approvedRisks: ['read']}), undefined, undefined, undefined, efficiency);
  registry.registerAgent('operator.large-context.review@1.0.0', new HarnessJobAgentAction(dispatcher, context => {
    const selected = reviewFile(context.parameters.contextFile);
    const reviewPrompt = context.parameters.reviewPrompt;
    if (typeof reviewPrompt !== 'string' || reviewPrompt.trim().length < 200 || reviewPrompt.length > 20_000) throw new ActionFailure('review_prompt_invalid', 'configuration');
    const maximumOutputTokens = Number(context.parameters.maximumOutputTokens ?? 32768);
    if (!Number.isSafeInteger(maximumOutputTokens) || maximumOutputTokens < 8192 || maximumOutputTokens > 65536) throw new ActionFailure('maximum_output_tokens_invalid', 'configuration');
    const route = candidate(provider, context.worker.id);
    return {
      plan: plan(context.run.id, context.step.id, context.worker.id, route, selected.file, selected.stat.size, maximumOutputTokens),
      executor: new LargeContextResponsesExecutor(provider, selected.file, reviewPrompt, maximumOutputTokens),
      toActionOutput: result => {
        const value = JSON.parse(result.execution.resultRef ?? '{}') as {providerStatus?: string};
        return {artifacts: [{name: 'review-result', value}], evidence: result.execution.evidence, detail: value.providerStatus === 'completed' ? 'provider response retained; independent verification pending' : 'provider attempt retained; independent verification pending'};
      },
    };
  }), ['EXTERNAL_COMMUNICATION', 'CREDENTIAL_USE']);
  registry.registerReadOnly('operator.large-context.verify@1.0.0', async context => {
    const artifact = context.inputArtifacts.find(item => item.name === 'review-result');
    if (!artifact) throw new ActionFailure('review_result_artifact_required', 'configuration');
    const value = context.readArtifact(artifact.id) as {providerStatus?: string; responseText?: string; providerResponseId?: string};
    const providerCompleted = value.providerStatus === 'completed';
    const contentComplete = isCompleteLargeContextReview(value.responseText ?? '');
    const ids = efficiency?.list().filter(item => item.runId === context.run.id).map(item => item.id) ?? [];
    if (ids.length) efficiency?.markVerification(ids, providerCompleted && contentComplete ? 'PASS' : 'FAIL');
    return {verification: [...(providerCompleted ? ['provider-completed'] : []), ...(contentComplete ? ['review-content-complete'] : [])], evidence: [`independent-verifier:operator.large-context.verify@1.0.0`, `review-artifact:${artifact.sha256}`], detail: providerCompleted && contentComplete ? 'independent content verifier accepted retained provider response' : 'independent content verifier rejected retained provider response'};
  });
  return registry;
}

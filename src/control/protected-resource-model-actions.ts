import {createHash} from 'node:crypto';
import type {AgentControlConfig, ModelConfig, ProviderConfig} from './config.js';
import {AdaptiveHarness, SkillCatalog, ToolPolicy, type HarnessCandidate, type RecipeRequest} from './adaptive-harness.js';
import {createToolHandlerRegistry, HarnessDispatcher, HarnessJobAgentAction, type RecipeExecutor} from './harness-dispatch.js';
import {createInvocationObservation, type HarnessEfficiencyLedgerPort} from './harness-efficiency.js';
import {ActionFailure, ActionRegistry} from './job-runtime.js';
import type {ActionContext, RunRecord} from './job-types.js';
import type {ModelRegistry} from './model-registry.js';
import {CodexRepositoryReviewClient} from './codex-repository-review-client.js';
import {LocalCodexNodeExecutionPort, type CodexNodeExecutionPort} from './codex-node-execution.js';
import {OpenAICompatibleProviderClient, type ModelInvocationResult} from './openai-compatible-provider.js';
import {resolveProviderAccountCredential} from './provider-credential-store.js';

const PROPOSAL_SCHEMA = {
  type: 'object',
  properties: {
    summary: {type: 'string', minLength: 1, maxLength: 2_000},
    commands: {type: 'array', minItems: 1, maxItems: 16, items: {type: 'object', properties: {command: {type: 'string', const: 'git'}, args: {type: 'array', minItems: 1, maxItems: 32, items: {type: 'string', maxLength: 512}}}, required: ['command', 'args'], additionalProperties: false}},
    verification: {type: 'array', maxItems: 12, items: {type: 'string', maxLength: 512}},
  },
  required: ['summary', 'commands', 'verification'],
  additionalProperties: false,
} as const;

type ModelRoute = NonNullable<RunRecord['trigger']['modelRoute']>;
interface GitProposal {summary: string; commands: Array<{command: 'git'; args: string[]}>; verification: string[]}
export interface ProtectedResourceProposalPort {invoke(route: ModelRoute, instruction: string, signal: AbortSignal): Promise<ModelInvocationResult>}

/** Provider-specific invocation remains behind this narrow structured-output port. */
export class RegistryProtectedResourceProposalPort implements ProtectedResourceProposalPort {
  constructor(private readonly models: ModelRegistry, private readonly nodes: CodexNodeExecutionPort = new LocalCodexNodeExecutionPort()) {}
  async invoke(route: ModelRoute, instruction: string, signal: AbortSignal) {
    const provider = this.models.provider(route.providerId), model = this.models.model(route.modelId);
    if (!provider || !model) throw new Error('protected_resource_model_route_missing');
    if (model.provider !== route.providerId || model.providerModel !== route.providerModel || (model.accountProfile ?? null) !== (route.accountProfileId ?? null)) throw new Error('protected_resource_model_route_identity_mismatch');
    const account = route.accountProfileId ? this.models.accountProfile(route.providerId, route.accountProfileId) : undefined;
    if (provider.kind === 'cli') {
      if (!account) throw new Error('protected_resource_model_account_required');
      return new CodexRepositoryReviewClient(provider, account, route.providerExecutionNodeId ?? route.nodeId, this.nodes).invoke(model, instruction, {structured: true, outputSchema: PROPOSAL_SCHEMA, maximumOutputTokens: Math.min(2_048, model.limits?.outputTokens ?? 2_048), timeoutMs: 180_000, signal});
    }
    if (!['responses', 'openai-compatible', 'local'].includes(provider.kind)) throw new Error(`protected_resource_model_provider_unsupported:${provider.kind}`);
    const credential = account ? () => resolveProviderAccountCredential(provider, account, process.env, undefined, route.providerExecutionNodeId ?? route.nodeId) : undefined;
    return new OpenAICompatibleProviderClient(provider, fetch, credential, {accountProfileId: account?.id, nodeId: route.providerExecutionNodeId ?? route.nodeId}).invoke(model, instruction, {structured: true, outputSchema: PROPOSAL_SCHEMA, maximumOutputTokens: Math.min(2_048, model.limits?.outputTokens ?? 2_048), timeoutMs: 180_000, signal});
  }
}

export function registerProtectedResourceModelActions(config: AgentControlConfig, models: ModelRegistry | undefined, nodes: CodexNodeExecutionPort | undefined, registry = new ActionRegistry(), efficiency?: HarnessEfficiencyLedgerPort, proposalPort?: ProtectedResourceProposalPort) {
  const policy = new ToolPolicy([]), dispatcher = new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(), policy), policy, createToolHandlerRegistry([]), recipe => ({authority: recipe.authority, workerId: recipe.workerId, availableToolIds: [], approvedRisks: ['read']}), undefined, undefined, undefined, efficiency);
  registry.registerAgent('repository.git-propose@1.0.0', new HarnessJobAgentAction(dispatcher, async context => {
    if (!models && !proposalPort) throw new ActionFailure('model_registry_unconfigured', 'configuration');
    const route = context.run.trigger.modelRoute;
    if (!route) throw new ActionFailure('protected_resource_model_route_required', 'configuration');
    const repositoryPath = context.parameters.repositoryPath, task = context.parameters.task;
    if (typeof repositoryPath !== 'string' || typeof task !== 'string' || task.trim().length < 20 || task.length > 20_000) throw new ActionFailure('protected_resource_model_parameters_invalid', 'configuration');
    const repositoryContext = await inspectRepository(context, repositoryPath);
    const instruction = proposalInstruction(task, context.run.trigger.parcelContext?.constraints ?? [], repositoryContext);
    const model = models?.model(route.modelId), provider = models?.provider(route.providerId);
    const candidate = routeCandidate(route, model, provider, context.worker.id);
    const authority: RecipeRequest['authority'] = {laneId: `job:${context.run.id}`, leaseGeneration: 1, ownershipGeneration: 1, owner: 'agent'};
    const request: RecipeRequest = {taskId: `${context.run.id}:${context.step.id}`, taskType: 'protected-resource-repository-maintenance', requiredCapabilities: ['structured-output'], requiredTools: [], approvedRisks: ['read'], preferredPromptProfile: 'governed-git-proposal', intent: 'NORMAL', inputTokens: Math.ceil(instruction.length / 4), outputTokens: 2_048, maximumLatencyMs: 180_000, maximumMonetarySpend: 1, meteredApproved: true, context: {tier: 1, sourceIds: [`repository:${sha(repositoryContext)}`], evidenceIds: [`operator-task:${sha(task)}`], estimatedTokens: Math.ceil(instruction.length / 4)}, authority, verification: {requiredEvidence: ['independent-protected-ref-verification'], requireIndependentCheck: true}, escalation: {minimumConfidence: .7, maximumAttempts: 1, onFailure: 'review'}, harnessRouting: {taskId: `${context.run.id}:${context.step.id}`, complexity: .45, risk: 'medium', knownExactTargets: true, estimatedFiles: 1, deterministicVerifier: true, ambiguity: .2, architectural: false, requestedProfile: 'STANDARD'}};
    const port = proposalPort ?? new RegistryProtectedResourceProposalPort(models!, nodes);
    return {plan: {request, candidates: [candidate], placement: {workerId: context.worker.id, reason: 'Work Parcel route selected a qualified structured-output model; mutation authority remains in Agent Control'}}, executor: proposalExecutor(port, route, instruction, context.signal), toActionOutput: result => {
      const value = parseProposalResult(result.execution.resultRef);
      return {artifacts: [{name: 'git-proposal', value: {schema: 'agent-control.git-proposal/v1', objective: task, route: safeRoute(route), ...value}}], evidence: result.execution.evidence, detail: `Model proposed ${value.commands.length} Git operation${value.commands.length === 1 ? '' : 's'}; execution remains pending semantic governance`};
    }};
  }), ['EXTERNAL_COMMUNICATION', 'CREDENTIAL_USE']);
  return registry;
}

function proposalExecutor(port: ProtectedResourceProposalPort, route: ModelRoute, instruction: string, signal: AbortSignal): RecipeExecutor {
  return {execute: async recipe => {
    const startedAt = new Date().toISOString(), result = await port.invoke(route, instruction, signal), completedAt = new Date().toISOString();
    assertInvocationRoute(route, result);
    const proposal = parseProposalResult(result.output), responseSha = sha(result.output), rawUsage = {input_tokens: result.usage.inputTokens, input_tokens_details: {cached_tokens: result.usage.cachedInputTokens, cache_write_tokens: result.usage.cacheWriteTokens}, output_tokens: result.usage.outputTokens, total_tokens: result.usage.totalTokens};
    const invocation = createInvocationObservation({jobId: recipe.jobId ?? recipe.taskId, runId: recipe.runId, stepId: recipe.stepId, taskId: recipe.taskId, laneId: recipe.authority.laneId, model: route.modelId, provider: route.providerId, ...(route.accountProfileId ? {accountProfileId: route.accountProfileId} : {}), harnessProfile: recipe.harness?.profile ?? 'STANDARD', executionStrategy: 'structured.protected-resource-proposal', startedAt, completedAt, rawUsage, ...(result.usage.providerReportedCost === null ? {} : {providerReportedCost: result.usage.providerReportedCost}), finishReason: result.finishReason ?? undefined, outcome: 'COMPLETE', recipeFingerprint: recipe.fingerprint, evidenceIds: [`provider_response_sha256:${responseSha}`]});
    return {resultRef: JSON.stringify(proposal), confidence: .8, fingerprint: responseSha, evidence: [`provider_response_sha256:${responseSha}`, `proposal_route:${route.providerId}/${route.accountProfileId ?? 'default'}/${route.modelId}@${route.providerExecutionNodeId ?? route.nodeId}`], invocations: [invocation]};
  }};
}

async function inspectRepository(context: ActionContext, cwd: string) {
  const commands = [['status', '--short', '--branch'], ['log', '-3', '--oneline', '--decorate'], ['branch', '--all', '--no-color']];
  const output: string[] = [];
  for (const args of commands) { const result = await context.ownedExecution.runProcess({command: 'git', args, cwd, maxOutputBytes: 64 * 1024}, context.signal); if (result.exitCode !== 0) throw new ActionFailure('protected_resource_repository_inspection_failed', 'execution'); output.push(`$ git ${args.join(' ')}\n${result.stdout.trim()}`); }
  return output.join('\n\n').slice(0, 32_000);
}

function proposalInstruction(task: string, constraints: string[], repositoryContext: string) {
  return `You are the repository-maintenance worker selected by Agent Control. Propose the smallest useful sequence of Git commands for the task. Return only the required structured object. Do not claim commands ran. Do not include shell wrappers, file-edit commands, credentials, or commentary outside the object. Agent Control will independently decide whether each proposed external effect is authorised.\n\nOPERATOR TASK:\n${task}\n\nOPERATOR CONSTRAINTS:\n${constraints.join('\n') || 'None recorded'}\n\nREAD-ONLY REPOSITORY INSPECTION:\n${repositoryContext}`;
}

function parseProposalResult(value?: string) { if (!value) throw new Error('protected_resource_proposal_result_missing'); let parsed: unknown; try { parsed = JSON.parse(value); } catch { throw new Error('protected_resource_proposal_result_invalid'); } return parseProposal(parsed); }
function parseProposal(value: unknown): GitProposal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('protected_resource_proposal_invalid');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !['summary','commands','verification'].includes(key)) || typeof record.summary !== 'string' || !record.summary.trim() || record.summary.length > 2_000 || !Array.isArray(record.commands) || !record.commands.length || record.commands.length > 16 || !Array.isArray(record.verification) || !record.verification.every(item => typeof item === 'string' && item.length <= 512)) throw new Error('protected_resource_proposal_schema_invalid');
  const commands = record.commands.map(command => { if (!command || typeof command !== 'object' || Array.isArray(command)) throw new Error('protected_resource_proposal_command_invalid'); const item = command as Record<string, unknown>; if (Object.keys(item).some(key => !['command','args'].includes(key)) || item.command !== 'git' || !Array.isArray(item.args) || !item.args.length || item.args.length > 32 || !item.args.every(arg => typeof arg === 'string' && arg.length <= 512)) throw new Error('protected_resource_proposal_command_invalid'); return {command: 'git' as const, args: item.args as string[]}; });
  return {summary: record.summary, commands, verification: record.verification as string[]};
}

function routeCandidate(route: ModelRoute, model: ModelConfig | undefined, provider: ProviderConfig | undefined, workerId: string): HarnessCandidate {
  const capabilities = [...new Set(['structured-output', ...(provider?.capabilities ?? []), ...(model?.capabilities ?? [])])];
  const pricing = model?.pricing ? {currency: model.pricing.currency, billing: provider?.costClass ?? 'metered', inputPerMillionTokens: model.pricing.inputPerMillionTokens, outputPerMillionTokens: model.pricing.outputPerMillionTokens, fixedPerRequest: 0, effectiveFrom: model.pricing.effectiveFrom, source: model.pricing.source} : {currency: 'USD', billing: provider?.costClass ?? 'included', inputPerMillionTokens: 0, outputPerMillionTokens: 0, fixedPerRequest: 0, effectiveFrom: '2026-09-07', source: 'Cost unavailable; zero is routing placeholder only'};
  return {route: {id: `${route.providerId}:${route.accountProfileId ?? 'default'}:${route.modelId}:${workerId}`, providerId: route.providerId, ...(route.accountProfileId ? {accountProfileId: route.accountProfileId} : {}), modelId: route.modelId, workerId, local: provider?.kind === 'local' || (route.providerExecutionNodeId ?? route.nodeId) === workerId, health: 'healthy', qualified: true, qualificationReason: `registry:${route.qualificationVersion}`, capabilities, pricing, performance: {startupLatencyMs: 1_000, inputTokensPerSecond: 50, outputTokensPerSecond: 25, historicalSuccessRate: .8, expectedQuality: .8, confidence: .7, contextLimitTokens: model?.limits?.contextTokens ?? 32_768, source: 'configured', sampleSize: 1}}, workerCapabilities: [...new Set(['model.execute', ...capabilities])], modelCapabilities: capabilities, promptProfiles: [{id: 'governed-git-proposal', version: '1', description: 'Schema-constrained Git proposal with no mutation authority'}], availableSkillIds: [], availableToolIds: [], supportedHarnessProfiles: ['STANDARD'], runtime: {executionStrategy: 'structured.protected-resource-proposal', providerExecutionNode: route.providerExecutionNodeId ?? route.nodeId}};
}

function assertInvocationRoute(route: ModelRoute, result: ModelInvocationResult) { if (result.providerId !== route.providerId || result.modelId !== route.modelId || (result.accountProfileId ?? null) !== (route.accountProfileId ?? null) || (result.nodeId ?? route.providerExecutionNodeId ?? route.nodeId) !== (route.providerExecutionNodeId ?? route.nodeId)) throw new Error('protected_resource_proposal_invocation_identity_mismatch'); }
function safeRoute(route: ModelRoute) { return {providerId: route.providerId, accountProfileId: route.accountProfileId ?? null, modelId: route.modelId, nodeId: route.providerExecutionNodeId ?? route.nodeId, qualificationVersion: route.qualificationVersion}; }
function sha(value: string) { return createHash('sha256').update(value).digest('hex'); }

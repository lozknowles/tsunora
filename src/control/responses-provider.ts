import {createHash} from 'node:crypto';
import type {HarnessCandidate} from './adaptive-harness.js';
import type {RecipeExecutor, ToolInvocationGateway} from './harness-dispatch.js';
import type {ProviderDefinition} from './providers.js';
import {createInvocationObservation, type ContextPacketSource} from './harness-efficiency.js';

export interface ResponsesProviderOptions {
  provider: ProviderDefinition;
  workerId: string;
  modelId: string;
  workerCapabilities: string[];
  modelCapabilities: string[];
  availableSkillIds?: string[];
  availableToolIds: string[];
  promptProfile?: {id: string; version: string; description: string};
  runtime?: Record<string, string | number | boolean>;
  qualificationEvidence: string[];
  health: 'healthy' | 'degraded' | 'offline';
  timeoutMs?: number;
  authorization?: () => string | undefined;
  fetch?: typeof globalThis.fetch;
}

interface ResponsesBody {
  id?: string;
  model?: string;
  status?: string;
  output?: Array<{type?: string; name?: string; arguments?: string; call_id?: string}>;
  usage?: Record<string, unknown>;
  error?: {message?: string};
}

/** Official Responses API candidate/executor. Agent Control, never the provider, owns raw tools. */
export class ResponsesProviderFactory {
  private readonly endpoint: string;

  constructor(private readonly options: ResponsesProviderOptions) {
    const {provider} = options;
    if (!provider.baseUrl || provider.wireApi !== 'responses') throw new Error('responses_provider_endpoint_required');
    const parsed = new URL(provider.baseUrl);
    const approvedLoopbackBridge = provider.kind === 'browser-bridge' && parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
    if (!(parsed.protocol === 'https:' || approvedLoopbackBridge) || parsed.username || parsed.password) throw new Error('responses_provider_base_url_invalid');
    if (!options.qualificationEvidence.length) throw new Error('responses_provider_qualification_evidence_required');
    this.endpoint = `${provider.baseUrl.replace(/\/$/, '')}/responses`;
  }

  candidate(): HarnessCandidate {
    const provider = this.options.provider;
    return {
      route: {
        id: `${provider.id}:${this.options.modelId}:${this.options.workerId}`,
        providerId: provider.id,
        modelId: this.options.modelId,
        workerId: this.options.workerId,
        local: false,
        health: this.options.health,
        qualified: true,
        qualificationReason: `qualified:${this.options.qualificationEvidence.join(',')}`,
        capabilities: [...provider.capabilities],
        pricing: {currency: 'USD', billing: provider.costClass, inputPerMillionTokens: 0, outputPerMillionTokens: 0, fixedPerRequest: 0, effectiveFrom: '2026-08-24', source: 'qualification configuration'},
        performance: {startupLatencyMs: 500, inputTokensPerSecond: 100, outputTokensPerSecond: 40, historicalSuccessRate: .9, expectedQuality: .8, confidence: .8, contextLimitTokens: 32768, source: 'configured', sampleSize: 1},
      },
      workerCapabilities: [...this.options.workerCapabilities],
      modelCapabilities: [...this.options.modelCapabilities],
      promptProfiles: [this.options.promptProfile ?? {id: 'responses-function-call', version: '1', description: 'Request one Agent Control mediated function call'}],
      availableSkillIds: [...(this.options.availableSkillIds ?? [])],
      availableToolIds: [...this.options.availableToolIds],
      runtime: {...(this.options.runtime ?? {})},
    };
  }

  executor(instruction: string): RecipeExecutor {
    return {execute: (recipe, tools) => this.execute(instruction, recipe, tools, Math.min(recipe.resourceLimits.maximumLatencyMs ?? this.options.timeoutMs ?? 30_000, this.options.timeoutMs ?? 30_000))};
  }

  private async execute(instruction: string, recipe: Parameters<RecipeExecutor['execute']>[0], tools: ToolInvocationGateway, timeoutMs: number) {
    if (typeof tools.assertActive !== 'function') throw new Error('provider_live_control_required');
    tools.signal?.throwIfAborted(); tools.assertActive();
    const grantedToolIds = recipe.tools.map(tool => tool.id);
    if (!grantedToolIds.length) throw new Error('responses_provider_no_granted_tools');
    const names = new Map(grantedToolIds.map((toolId, index) => [`agent_control_tool_${index}`, toolId]));
    const authorization = this.options.authorization?.();
    if (this.options.provider.requiresAuth && !authorization) throw new Error('responses_provider_authentication_required');
    const systemInstructions = 'Call exactly one supplied function.';
    const agentControlInstructions = 'The function is only a request to Agent Control; do not claim it ran.';
    const toolDefinitions = [...names].map(([name, toolId]) => ({type: 'function', name, description: `Request Agent Control tool ${toolId}`, parameters: {type: 'object', additionalProperties: true}, strict: false}));
    const startedAt = new Date().toISOString();
    const response = await (this.options.fetch ?? globalThis.fetch)(this.endpoint, {
      method: 'POST',
      headers: {'content-type': 'application/json', ...(authorization ? {authorization: `Bearer ${authorization}`} : {})},
      body: JSON.stringify({
        model: this.options.modelId,
        instructions: `${systemInstructions} ${agentControlInstructions}`,
        input: instruction,
        tools: toolDefinitions,
        tool_choice: 'required', parallel_tool_calls: false, max_output_tokens: 256, store: false,
      }),
      signal: tools.signal ? AbortSignal.any([tools.signal, AbortSignal.timeout(Math.max(1, timeoutMs))]) : AbortSignal.timeout(Math.max(1, timeoutMs)),
    });
    const body = await response.json() as ResponsesBody;
    tools.signal?.throwIfAborted(); tools.assertActive();
    const providerCompletedAt = new Date().toISOString();
    if (!response.ok) throw new Error(`responses_provider_http_error:${response.status}:${body.error?.message ?? 'unknown'}`);
    const calls = body.output?.filter(item => item.type === 'function_call') ?? [];
    if (calls.length !== 1) throw new Error(`responses_provider_function_call_count:${calls.length}`);
    const call = calls[0];
    const toolId = call.name ? names.get(call.name) : undefined;
    if (!toolId) throw new Error('responses_provider_unknown_function');
    let input: unknown;
    try { input = JSON.parse(call.arguments ?? '{}'); } catch { throw new Error('responses_provider_function_arguments_invalid'); }
    tools.assertActive();
    const output = await tools.invoke(toolId, input);
    const responseIdentity = body.id ?? createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const responseHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const result = {providerId: this.options.provider.id, modelId: body.model ?? this.options.modelId, providerResponseId: body.id, providerStatus: body.status, requestedTool: toolId, toolCallId: call.call_id, toolOutput: output, responseHash, usage: body.usage};
    const startupSources: ContextPacketSource[] = [
      {id: `${recipe.id ?? 'unattributed'}:responses-system`, kind: 'system_instructions', content: systemInstructions, required: true, persistent: true, relevance: 1, provenanceIds: [recipe.fingerprint ?? 'unattributed-recipe']},
      {id: `${recipe.id ?? 'unattributed'}:responses-control`, kind: 'agent_control_instructions', content: agentControlInstructions, required: true, persistent: true, relevance: 1, provenanceIds: [recipe.fingerprint ?? 'unattributed-recipe']},
      {id: `${recipe.id ?? 'unattributed'}:responses-tools`, kind: 'tool_schemas', content: JSON.stringify(toolDefinitions), required: true, persistent: true, relevance: 1, provenanceIds: [recipe.fingerprint ?? 'unattributed-recipe']},
      {id: `${recipe.id ?? 'unattributed'}:responses-skills`, kind: 'skills', estimatedTokens: 0, persistent: true, relevance: .8, provenanceIds: (recipe.skills ?? []).flatMap(skill => skill.qualificationEvidence)},
      {id: `${recipe.id ?? 'unattributed'}:responses-task`, kind: 'task_context', content: instruction, required: true, persistent: false, relevance: 1, provenanceIds: recipe.context?.provenanceIds ?? recipe.context?.evidenceIds ?? []},
    ];
    const taskId = recipe.taskId ?? 'unattributed-task';
    const invocation = createInvocationObservation({jobId: recipe.jobId ?? taskId, runId: recipe.runId, taskId, laneId: recipe.authority?.laneId ?? 'unattributed-lane', model: body.model ?? this.options.modelId, provider: this.options.provider.id, harnessProfile: recipe.harness?.profile ?? 'STANDARD', executionStrategy: 'responses.function-call', startedAt, completedAt: providerCompletedAt, startupSources, rawUsage: body.usage, toolIds: [toolId], contextSourceIds: recipe.context?.sourceIds ?? [], recipeFingerprint: recipe.fingerprint ?? 'unattributed-recipe', contextPacketId: recipe.harness?.contextPacketId, evidenceIds: [`provider_response_sha256:${responseHash}`]});
    return {
      resultRef: JSON.stringify(result), confidence: .8,
      fingerprint: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
      evidence: [`provider_response:${responseIdentity}`, `provider_response_sha256:${responseHash}`, `tool_executed:${toolId}`],
      invocations: [invocation],
    };
  }
}

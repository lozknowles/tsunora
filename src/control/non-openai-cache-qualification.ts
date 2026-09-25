import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {AdaptiveHarness, SkillCatalog, ToolPolicy, type HarnessCandidate, type RecipeRequest} from './adaptive-harness.js';
import {createToolHandlerRegistry, HarnessDispatcher, HarnessJobAgentAction, MemoryRecipeDispatchStore} from './harness-dispatch.js';
import type {HarnessEfficiencyLedgerPort, HarnessProfileName, ModelInvocationObservation} from './harness-efficiency.js';
import {HarnessProfileRouter} from './harness-efficiency.js';
import {ActionFailure, ActionRegistry} from './job-runtime.js';
import {parseMutationBenchmarkSuite, type MutationBenchmarkTask} from './harness-mutation-benchmark.js';
import {buildMutationContextPacket, buildMutationContextSources, renderMutationInstruction, selectMutationPacketSources} from './harness-mutation-context.js';
import {verifyMutationWorkspace} from './harness-mutation-verifier.js';
import {MUTATION_TOOL_DEFINITIONS, MUTATION_TOOL_IDS, MUTATION_TOOL_SCHEMAS, MUTATION_SEMANTIC_TOOL_V1, MutationWorkspace, fixtureContentSha256} from './harness-mutation-workspace.js';
import {StructuredChatLoopProvider} from './structured-chat-loop-provider.js';
import type {ActionContext} from './job-types.js';
import type {ExecutionCleanupReport} from './owned-process.js';
import {StructuredChatProviderFactory} from './structured-chat-provider.js';
import type {LeanExecutionPolicy} from './lean-model-interface.js';
import {fetch as undiciFetch} from 'undici';

// Preserve test/embedding dependency injection while pairing the production
// governed dispatcher with the matching npm Undici implementation.
const platformFetch = globalThis.fetch;

interface QualificationWorkspace {
  workspace: MutationWorkspace;
  task: MutationBenchmarkTask;
  startingRevision: string;
  fixtureSha256: string;
  prefixVariant: string;
  profile: HarnessProfileName;
  transcript: Array<Record<string, unknown>>;
  recordEvidence: NonNullable<ActionContext['recordEvidence']>;
  releaseCleanup?: (proof: ExecutionCleanupReport) => void;
}

/**
 * Explicitly enabled physical-qualification Job actions. The model receives only
 * typed mutation tools against a fresh frozen fixture; normal deployments do not
 * register these actions unless the operator enables the bounded experiment.
 */
export function registerNonOpenAiCacheQualificationActions(registry: ActionRegistry, efficiency?: HarnessEfficiencyLedgerPort, environment: NodeJS.ProcessEnv = process.env) {
  if (environment.AGENT_CONTROL_ENABLE_NON_OPENAI_CACHE_QUALIFICATION !== 'true') return registry;
  if (!efficiency) throw new Error('non_openai_cache_efficiency_ledger_required');
  const leanExperiment = environment.AGENT_CONTROL_LEAN_EXPERIMENT === 'true';
  // Existing experimental interfaces remain disabled unless both qualification
  // and semantic execution are explicitly enabled by the service operator.
  const semanticEnabled = environment.AGENT_CONTROL_SEMANTIC_TOOL_V1 === 'true';
  const baseUrl = required(environment.AGENT_CONTROL_NON_OPENAI_CACHE_BASE_URL, 'non_openai_cache_base_url').replace(/\/$/, '');
  const routeBaseUrls = parseRouteBaseUrls(environment.AGENT_CONTROL_NON_OPENAI_CACHE_ROUTE_BASE_URLS);
  for (const value of [baseUrl, ...Object.values(routeBaseUrls)]) { const endpoint = new URL(value); if (!['127.0.0.1', 'localhost', '::1'].includes(endpoint.hostname)) throw new Error('non_openai_cache_endpoint_must_be_loopback'); }
  const modelId = required(environment.AGENT_CONTROL_NON_OPENAI_CACHE_MODEL, 'non_openai_cache_model');
  const repositoryRoot = path.resolve(environment.AGENT_CONTROL_NON_OPENAI_CACHE_REPOSITORY_ROOT ?? process.cwd());
  const suiteFile = path.join(repositoryRoot, 'benchmarks', 'harness-mutation-jobs.json');
  const suite = parseMutationBenchmarkSuite(JSON.parse(fs.readFileSync(suiteFile, 'utf8')));
  const fixtureRoot = path.resolve(repositoryRoot, suite.fixturePath);
  if (fixtureContentSha256(fixtureRoot) !== suite.fixtureSha256) throw new Error('non_openai_cache_fixture_hash_mismatch');
  const workspaces = new Map<string, QualificationWorkspace>();

  registry.registerAgent('qualification.non-openai-cache.mutate@1.0.0', {
    path: 'adaptive-harness',
    execute: async context => {
      const selectedInterface = context.parameters.toolInterface;
      if (selectedInterface !== undefined && !['SEMANTIC_TOOL_V1', 'LEGACY_TOOL_REQUEST'].includes(String(selectedInterface))) throw new ActionFailure('qualification_tool_interface_invalid', 'configuration');
      if (selectedInterface === 'SEMANTIC_TOOL_V1' && !semanticEnabled) throw new ActionFailure('semantic_tool_capability_disabled', 'policy_rejection');
      const semanticExperiment = semanticEnabled && selectedInterface !== 'LEGACY_TOOL_REQUEST';
      const governedRoute = context.run.trigger.modelRoute, selectedProviderId = governedRoute?.providerId ?? 'local-llama-cache-qualification', selectedModelId = governedRoute?.modelId ?? modelId, selectedBaseUrl = (routeBaseUrls[selectedProviderId] ?? baseUrl).replace(/\/$/, '');
      const nativeBenchmark = context.parameters.taskId !== undefined || context.parameters.profile !== undefined;
      const taskId = String(context.parameters.taskId ?? environment.AGENT_CONTROL_NON_OPENAI_CACHE_TASK ?? 'MUT-001');
      const task = suite.tasks.find(item => item.id === taskId);
      if (!task) throw new ActionFailure('native_benchmark_task_missing', 'configuration');
      const profile = String(context.parameters.profile ?? task.expectedMinimumProfile) as HarnessProfileName;
      if (!['THIN', 'STANDARD', 'DEEP'].includes(profile)) throw new ActionFailure('native_benchmark_profile_invalid', 'configuration');
      const prefixVariant = String(context.parameters.prefixVariant ?? 'stable');
      if (!['stable', 'changed-prefix-control'].includes(prefixVariant)) throw new ActionFailure('non_openai_cache_prefix_variant_invalid', 'configuration');
      const observationTimeoutMs = resolveNativeObservationTimeoutMs(task.timeoutMs, context.parameters.observationTimeoutMs);
      const governedRuntimeBudgets = nativeBenchmark && String(context.parameters.runtimeBudgetMode ?? 'governed') === 'governed';
      const optionalBudget = (name: string) => context.parameters[name] === undefined ? undefined : Number(context.parameters[name]);
      const runtimeBudget = governedRuntimeBudgets ? {
        ...(optionalBudget('absoluteJobDeadlineMs') === undefined ? {} : {absoluteJobDeadlineMs: optionalBudget('absoluteJobDeadlineMs')}),
        ...(optionalBudget('modelCallDeadlineMs') === undefined ? {} : {modelCallDeadlineMs: optionalBudget('modelCallDeadlineMs')}),
        ...(optionalBudget('toolCallDeadlineMs') === undefined ? {} : {toolCallDeadlineMs: optionalBudget('toolCallDeadlineMs')}),
        ...(optionalBudget('noProgressDeadlineMs') === undefined ? {} : {noProgressDeadlineMs: optionalBudget('noProgressDeadlineMs')}),
      } : undefined;
      if (!context.execution || !context.recordEvidence || !context.retainCleanup) throw new ActionFailure('qualification_live_execution_context_required', 'policy_rejection');
      context.execution.assertActive();
      const prepared = MutationWorkspace.prepare(fixtureRoot, task, context.signal, context.execution.assertActive, context.ownedExecution, context.recordEvidence);
      const transcript: Array<Record<string, unknown>> = [];
      const retained: QualificationWorkspace = {...prepared, task, prefixVariant, profile, transcript, recordEvidence: context.recordEvidence};
      const journal = (event: Record<string, unknown>) => { context.recordEvidence!(String(event.type), event); transcript.push(event); };
      workspaces.set(context.run.id, retained);
      retained.releaseCleanup = context.retainCleanup(prepared.workspace.processIdentity(), async () => { const proof = await retainAndCleanup(retained, context, 'run-ended-before-verification'); workspaces.delete(context.run.id); return proof; });
      const health = nativeBenchmark ? await fetch(selectedBaseUrl.replace(/\/v1$/, '') + '/health', {signal: AbortSignal.any([context.signal, AbortSignal.timeout(10_000)])}) : new Response(null, {status: 200});
      journal({type: 'runtime-health', at: new Date().toISOString(), status: health.status});
      if (!health.ok) throw new ActionFailure(`native_benchmark_runtime_unhealthy:${health.status}`, 'execution');
      const models = nativeBenchmark ? await fetch(selectedBaseUrl + '/models', {signal: AbortSignal.any([context.signal, AbortSignal.timeout(10_000)])}) : Response.json({data: [{id: selectedModelId}]});
      const modelsBody = await models.json() as {data?: Array<{id?: string}>};
      journal({type: 'model-discovery', at: new Date().toISOString(), status: models.status, modelIds: modelsBody.data?.map(item => item.id).filter(Boolean) ?? []});
      if (!models.ok || !modelsBody.data?.some(item => item.id === selectedModelId)) throw new ActionFailure('native_benchmark_model_identity_mismatch', 'configuration');
      const authority = context.execution.currentAuthority();
      journal({type: 'workspace-prepared', at: new Date().toISOString(), contractId: context.execution.contractId, authority, startingRevision: prepared.startingRevision, fixtureSha256: prepared.fixtureSha256, identity: prepared.workspace.processIdentity()});
      const bindings = prepared.workspace.toolBindings().map(binding => ({
        toolId: binding.toolId,
        handler: async (input: unknown, recipe: Parameters<typeof binding.handler>[1], control: Parameters<typeof binding.handler>[2]) => {
          journal({type: 'tool-request', at: new Date().toISOString(), tool: binding.toolId, input: structuredClone(input)});
          try {
            const output = await binding.handler(input, recipe, control);
            journal({type: 'tool-result', at: new Date().toISOString(), tool: binding.toolId, output: structuredClone(output), patch: prepared.workspace.diff(), counters: prepared.workspace.getCounters()});
            return output;
          } catch (error) {
            journal({type: 'tool-failure', at: new Date().toISOString(), tool: binding.toolId, error: error instanceof Error ? error.message : String(error), identity: prepared.workspace.processIdentity()}); throw error;
          }
        },
      }));
      const toolPolicy = new ToolPolicy(MUTATION_TOOL_DEFINITIONS);
      const leanPolicy: LeanExecutionPolicy = {toolEffects: {
        [MUTATION_TOOL_IDS.read]: 'inspect', [MUTATION_TOOL_IDS.search]: 'inspect',
        [MUTATION_TOOL_IDS.replace]: 'mutate', [MUTATION_TOOL_IDS.write]: 'mutate',
        [MUTATION_TOOL_IDS.test]: 'verify', [MUTATION_TOOL_IDS.finish]: 'terminal',
      }, requiredChangedPaths: [...task.requiredChangedFiles], terminalAllowance: true};
      const dispatcher = new HarnessDispatcher(new AdaptiveHarness(new SkillCatalog(), toolPolicy, undefined, new HarnessProfileRouter({mode: 'EXPERIMENT', minimumVerifiedRuns: 20, minimumSuccessRate: .95, minimumSameModelControlledRuns: 20})), toolPolicy, createToolHandlerRegistry(bindings), () => ({authority: context.execution!.currentAuthority(), workerId: context.worker.id, availableToolIds: MUTATION_TOOL_DEFINITIONS.map(tool => tool.id), approvedRisks: ['read', 'write']}), new MemoryRecipeDispatchStore(), event => journal({...event, type: 'tool-policy-audit'}), undefined, efficiency, leanExperiment ? () => leanPolicy : undefined);
      const providerFactory = new StructuredChatProviderFactory({
        provider: {id: selectedProviderId, name: 'Local llama.cpp cache qualification', kind: 'local', baseUrl: selectedBaseUrl, requiresAuth: false, parallelism: 1, costClass: 'free', capabilities: ['structured-output', 'tool-request']},
        workerId: context.worker.id, modelId: selectedModelId,
        workerCapabilities: context.worker.capabilities,
        modelCapabilities: ['structured-output', 'tool-request'],
        availableToolIds: MUTATION_TOOL_DEFINITIONS.map(tool => tool.id),
        qualificationEvidence: ['physical-loopback-model-discovery'], health: 'healthy',
      });
      const fetcher: typeof fetch = async (input, init) => {
        const requestBody = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {};
        context.execution!.assertActive();
        journal({type: 'provider-request', at: new Date().toISOString(), request: requestBody});
        let response: Response;
        const delegatedFetch = globalThis.fetch === platformFetch ? undiciFetch as unknown as typeof fetch : globalThis.fetch;
        try { response = await delegatedFetch(input, init); }
        catch (error) { const cause=(error as {cause?:{code?:string}})?.cause?.code; journal({type: 'provider-failure', at: new Date().toISOString(), error: error instanceof Error ? error.message : String(error), causeCode: cause ?? null, cancelled: context.signal.aborted, remoteCleanup: 'UNKNOWN'}); throw error; }
        if (requestBody.stream === true) { journal({type:'provider-headers',at:new Date().toISOString(),status:response.status,streaming:true}); return response; }
        let rawResponse = ''; const responseChunks: Uint8Array[] = [];
        try {
          const reader = response.clone().body?.getReader(), decoder = new TextDecoder();
          if (reader) { while (true) { const chunk = await reader.read(); if (chunk.done) break; responseChunks.push(chunk.value); rawResponse += decoder.decode(chunk.value, {stream: true}); } rawResponse += decoder.decode(); }
        } catch (error) {
          const bytes = Buffer.concat(responseChunks);
          journal({type:'provider-failure',at:new Date().toISOString(),phase:'body-read',status:response.status,error:error instanceof Error ? error.message : String(error),partialBody:rawResponse,partialBodyBase64:bytes.toString('base64'),partialBodySha256:sha256(bytes),cancelled:context.signal.aborted,remoteCleanup:'UNKNOWN'}); throw error;
        }
        journal({type: 'provider-response', at: new Date().toISOString(), status: response.status, body: rawResponse});
        let body: Record<string, unknown> = {};
        try { body = JSON.parse(rawResponse) as Record<string, unknown>; } catch { /* Raw malformed response is already durable. */ }
        const choice = Array.isArray(body.choices) && body.choices[0] && typeof body.choices[0] === 'object' ? body.choices[0] as Record<string, unknown> : {};
        const message = choice.message && typeof choice.message === 'object' ? choice.message as Record<string, unknown> : {};
        journal({type: 'provider', at: new Date().toISOString(), requestPrefixSha256: sha256(stableJson(requestBody)), assistantOutput: typeof message.content === 'string' ? message.content : null, providerResponseId: typeof body.id === 'string' ? body.id : null, responseModel: typeof body.model === 'string' ? body.model : null, finishReason: typeof choice.finish_reason === 'string' ? choice.finish_reason : null, usage: safeUsage(body.usage), timings: safeTimings(body.timings)});
        return response;
      };
      const semanticOptions = semanticEnabled ? {
        ...(semanticExperiment ? {semanticToolV1: {tools: MUTATION_SEMANTIC_TOOL_V1, batchableToolIds: [MUTATION_TOOL_IDS.read, MUTATION_TOOL_IDS.search], independentEditToolIds: [MUTATION_TOOL_IDS.replace]}} : {}),
        toolReliability: {recordEvidence: (event: unknown) => journal({type: 'repair', event})},
        semanticEvents: {record: (event: unknown) => journal({type: 'semantic', event})},
        noProgressV1: {recordEvidence: (event: unknown) => journal({type: 'no-progress', event})},
      } : {};
      const loop = new StructuredChatLoopProvider({...semanticOptions, providerId: selectedProviderId, modelId: selectedModelId, baseUrl: selectedBaseUrl, toolSchemas: MUTATION_TOOL_SCHEMAS, finishToolId: MUTATION_TOOL_IDS.finish, maximumOutputTokens: 768, timeoutMs: observationTimeoutMs, signalForRecipe: () => context.signal, executionStrategy: 'non-openai-cache.real-repository-mutation', ...(governedRuntimeBudgets ? {streaming:true,recordBudgetEvidence:(record:Record<string,unknown>)=>journal(record)} : {}), ...(leanExperiment ? {lean: {terminalAllowance: true, recordEvidence: (record: Record<string, unknown>) => journal({...record, type: 'lean-model-interface'})}} : {}), cacheRetention: environment.AGENT_CONTROL_NON_OPENAI_CACHE_DERIVED_RETENTION === 'true' ? {enabled:true,authority:'derived',source:'qualified-llama.cpp-single-slot-cache-prompt'} : undefined, fetch: fetcher});
      const sources = buildMutationContextSources(suite, task, fixtureRoot).filter(source => !semanticExperiment || source.kind !== 'tool_schemas');
      const packet = buildMutationContextPacket(profile, sources, Math.min(48_000, Math.max(1_024, Math.floor(task.tokenBudget * .7))));
      const selectedSources = selectMutationPacketSources(packet, sources);
      const variantPrefix = prefixVariant === 'stable' ? 'CACHE QUALIFICATION PREFIX A.' : 'NEGATIVE CONTROL PREFIX B: intentionally changed before the stable task sequence.';
      const renderedInstruction = renderMutationInstruction(task, profile);
      const instruction = `${variantPrefix}\n${semanticExperiment ? renderedInstruction.replace('mutation.finish', 'finish_work') : renderedInstruction}`;
      journal({type: 'observation-budget', at: new Date().toISOString(), configuredTaskTimeoutMs: task.timeoutMs, effectiveTimeoutMs: observationTimeoutMs, override: observationTimeoutMs !== task.timeoutMs, scope: governedRuntimeBudgets ? 'legacy-compatibility-only' : 'structured-chat-loop-absolute-wall', governedRuntimeBudgets});
      journal({type: 'initiating-model-request', at: new Date().toISOString(), instruction, authorisedContext: selectedSources.map(source => ({id: source.id, kind: source.kind, content: source.content ?? null}))});
      const request: RecipeRequest = {taskId: `${context.run.id}:${context.step.id}`, jobId: context.run.jobId, runId: context.run.id, stepId: context.step.id, taskType: 'cache-qualification', requiredCapabilities: ['model.execute', 'structured-output', 'tool-request', 'repository.mutation.typed'], requiredTools: MUTATION_TOOL_DEFINITIONS.map(tool => tool.id), approvedRisks: ['read', 'write'], intent: 'ECONOMY', inputTokens: packet.estimatedTokens, outputTokens: 768, maximumLatencyMs: governedRuntimeBudgets ? undefined : observationTimeoutMs, ...(runtimeBudget ? {runtimeBudget} : {}), context: {tier: ({THIN: 1, STANDARD: 2, DEEP: 3} as const)[profile], sourceIds: packet.sourceIds, evidenceIds: packet.provenanceIds, estimatedTokens: packet.estimatedTokens, packetId: packet.id, provenanceIds: packet.provenanceIds}, contextPacket: packet, contextStrategyId: `native-mutation-${profile.toLowerCase()}-v1`, authority, verification: {requiredEvidence: ['independent-hidden-verifier', 'public-tests', 'git-diff-check'], requireIndependentCheck: true}, escalation: {minimumConfidence: .8, maximumAttempts: 1, onFailure: 'review'}, harnessRouting: {taskId: task.id, complexity: Math.min(1, task.features.estimatedFiles / 6 + task.features.ambiguity / 2), risk: task.features.risk, knownExactTargets: task.features.knownExactTargets, estimatedFiles: task.features.estimatedFiles, deterministicVerifier: true, ambiguity: task.features.ambiguity, architectural: task.features.architecturalTerms, requestedProfile: profile}};
      const baseCandidate = providerFactory.candidate();
      const routeNumber = (name: string) => { const raw=environment[name]; if(raw===undefined)return undefined; const value=Number(raw); if(!Number.isFinite(value)||value<=0)throw new ActionFailure(`native_benchmark_route_characteristic_invalid:${name}`,'configuration'); return value; };
      const routeEvidenceId=environment.AGENT_CONTROL_NATIVE_ROUTE_BUDGET_EVIDENCE_ID?.trim();
      const routeCharacteristics={medianModelCallMs:routeNumber('AGENT_CONTROL_NATIVE_ROUTE_MEDIAN_MODEL_CALL_MS'),p95ModelCallMs:routeNumber('AGENT_CONTROL_NATIVE_ROUTE_P95_MODEL_CALL_MS'),generationTokensPerSecond:routeNumber('AGENT_CONTROL_NATIVE_ROUTE_GENERATION_TPS'),runtimeBudgetEvidenceId:routeEvidenceId||undefined};
      const candidate: HarnessCandidate = {...baseCandidate, supportedHarnessProfiles: ['THIN', 'STANDARD', 'DEEP'], runtime: {...baseCandidate.runtime, executionStrategy: 'non-openai-cache.real-repository-mutation', maximumProcessedTokens: task.tokenBudget, ...(governedRuntimeBudgets ? Object.fromEntries(Object.entries(routeCharacteristics).filter(([,value])=>value!==undefined)) : {})}};
      if (environment.AGENT_CONTROL_NATIVE_BENCHMARK_DISABLE_DISPATCHER === 'true') throw new ActionFailure('native_benchmark_dispatcher_disabled', 'policy_rejection');
      const action = new HarnessJobAgentAction(dispatcher, () => ({plan: {request, candidates: [candidate], placement: {workerId: context.worker.id, reason: 'Loopback non-OpenAI model and isolated mutation fixture'}}, executor: loop.executor(instruction, selectedSources)}));
      try {
        const output = await action.execute(context), invocations = efficiency.list().filter(item => item.runId === context.run.id);
        return {...output, artifacts: [{name: 'mutation-attempt', value: {schema: 'agent-control.non-openai-cache-attempt/v1', taskId: task.id, profile, prefixVariant, provenance: nativeBenchmark ? 'AGENT_CONTROL_NATIVE_EXECUTION' : 'QUALIFICATION_ACTION', fixtureSha256: prepared.fixtureSha256, startingRevision: prepared.startingRevision, stablePrefixSha256: invocations[0]?.cacheEvidence?.requestPrefixSha256 ?? null, status: prepared.workspace.statusSummary(), counters: prepared.workspace.getCounters(), transcript, invocations: invocations.map(cacheInvocation)}}], evidence: [...(output.evidence ?? []), `fixture_sha256:${prepared.fixtureSha256}`, `prefix_variant:${prefixVariant}`, `profile:${profile}`, `provenance:${nativeBenchmark ? 'AGENT_CONTROL_NATIVE_EXECUTION' : 'QUALIFICATION_ACTION'}`], detail: `Non-OpenAI ${prefixVariant} mutation attempt completed; independent verification pending.`};
      } catch (error) {
        const proof = await retainAndCleanup(retained, context, 'execution-failed', error); retained.releaseCleanup?.(proof);
        workspaces.delete(context.run.id); throw error;
      }
    },
  }, ['FILESYSTEM_WRITE']);

  registry.registerConsequentialControl('qualification.non-openai-cache.verify@1.0.0', async context => {
    const retained = workspaces.get(context.run.id);
    if (!retained) {
      const durableWorkspaceEvidence = context.run.artifacts.map(id => ({id, value: context.readArtifact(id)})).filter(item => item.value && typeof item.value === 'object' && 'identity' in item.value);
      context.recordEvidence?.('verification-blocked', {reason: 'workspace_identity_unproved_after_restart', cleanup: 'UNKNOWN', durableWorkspaceEvidence});
      const at = new Date().toISOString();
      throw Object.assign(new ActionFailure('non_openai_cache_workspace_missing', 'verification'), {executionCleanup: {outcome: 'uncertain', reason: 'workspace_identity_unproved_after_restart', requestedAt: at, completedAt: at, processes: []} satisfies ExecutionCleanupReport});
    }
    let verifierFailure: unknown;
    try {
      const verifier = await verifyMutationWorkspace(retained.workspace, retained.task, {signal: context.signal, ownedExecution: context.ownedExecution, assertActive: context.execution?.assertActive, recordEvidence: context.recordEvidence});
      const invocationIds = efficiency.list().filter(item => item.runId === context.run.id).map(item => item.id);
      efficiency.markVerification(invocationIds, verifier.passed ? 'PASS' : 'FAIL');
      const patch = retained.workspace.diff();
      const verificationArtifact = context.recordEvidence?.('independent-verification', {verifier, patch, patchSha256: sha256(patch), transcript: retained.transcript});
      const sourceStep = context.run.steps.find(step => step.action === 'qualification.non-openai-cache.mutate@1.0.0');
      if (!sourceStep || !context.recordIndependentVerification) throw new ActionFailure('independent_verification_context_missing', 'verification');
      context.recordIndependentVerification(sourceStep.id, verifier.passed, verificationArtifact ? [verificationArtifact.id] : [], verifier.passed ? 'Independent fixture verifier passed' : 'Independent fixture verifier failed');
      if (!verifier.passed) throw new ActionFailure(`non_openai_cache_verifier_failed:${verifier.failureClass ?? 'unknown'}`, 'verification');
      return {artifacts: [{name: 'verification-report', value: {schema: 'agent-control.non-openai-cache-verification/v1', passed: true, taskId: retained.task.id, profile: retained.profile, prefixVariant: retained.prefixVariant, provenance: 'AGENT_CONTROL_NATIVE_EXECUTION', verifier, patch, patchSha256: sha256(patch), transcript: retained.transcript}}], evidence: [`independent_verifier:PASS`, `diff_sha256:${verifier.diffSha256}`], verification: ['non-openai-cache-mutation-verified'], detail: 'Independent hidden verifier accepted the real disposable repository mutation.'};
    } catch (error) {
      verifierFailure = error;
      context.recordEvidence?.('independent-verification-error', {error: error instanceof Error ? error.message : String(error), cancelled: context.signal.aborted, taskId: retained.task.id, identity: retained.workspace.processIdentity()});
      throw error;
    } finally {
      const proof = await retainAndCleanup(retained, context, 'verification-finished', verifierFailure); retained.releaseCleanup?.(proof); workspaces.delete(context.run.id);
    }
  }, ['FILESYSTEM_WRITE']);
  return registry;
}


export function resolveNativeObservationTimeoutMs(configuredTaskTimeoutMs: number, value: unknown) {
  if (!Number.isSafeInteger(configuredTaskTimeoutMs) || configuredTaskTimeoutMs < 1) throw new Error('native_observation_configured_timeout_invalid');
  if (value === undefined || value === null) return configuredTaskTimeoutMs;
  if (!Number.isSafeInteger(value) || Number(value) < configuredTaskTimeoutMs || Number(value) > 1_800_000) throw new ActionFailure('native_observation_timeout_invalid', 'configuration');
  return Number(value);
}

function cacheInvocation(invocation: ModelInvocationObservation) {
  return {id: invocation.id, turnNumber: invocation.turnNumber, provider: invocation.provider, model: invocation.model, startedAt: invocation.startedAt, completedAt: invocation.completedAt, elapsedMs: invocation.elapsedMs, usage: invocation.usage, cacheEvidence: invocation.cacheEvidence ?? null, verifierResult: invocation.verifierResult, outcome: invocation.outcome};
}
function required(value: string | undefined, reason: string) { if (!value?.trim()) throw new Error(reason); return value.trim(); }
function sha256(value: string | Buffer) { return createHash('sha256').update(value).digest('hex'); }
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`; return JSON.stringify(value); }
function safeUsage(value: unknown) { if (!value || typeof value !== 'object' || Array.isArray(value)) return null; const source = value as Record<string, unknown>; return Object.fromEntries(['prompt_tokens','completion_tokens','total_tokens','input_tokens','output_tokens','prompt_tokens_details','input_tokens_details'].filter(key => key in source).map(key => [key, structuredClone(source[key])])); }
function safeTimings(value: unknown) { if (!value || typeof value !== 'object' || Array.isArray(value)) return null; const source = value as Record<string, unknown>; return Object.fromEntries(['cache_n','prompt_n','prompt_ms','prompt_per_token_ms','prompt_per_second','predicted_n','predicted_ms','predicted_per_token_ms','predicted_per_second'].filter(key => typeof source[key] === 'number').map(key => [key, source[key]])); }
function parseRouteBaseUrls(value: string | undefined) {
  if (!value?.trim()) return {} as Record<string,string>;
  const parsed = JSON.parse(value) as unknown; if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('non_openai_cache_route_base_urls_invalid');
  const output: Record<string,string> = {}; for (const [key,item] of Object.entries(parsed)) { if (!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(key) || typeof item !== 'string') throw new Error('non_openai_cache_route_base_urls_invalid'); output[key]=item.replace(/\/$/,''); }
  return output;
}

async function retainAndCleanup(retained: QualificationWorkspace, context: ActionContext, reason: string, error?: unknown) {
  const record = context.recordEvidence ?? retained.recordEvidence;
  let processes: ExecutionCleanupReport | undefined;
  try {
    // Control-plane evidence and identity-checked cleanup remain permitted after cancellation.
    record('attempt-before-cleanup', {reason, error: error instanceof Error ? error.message : error === undefined ? null : String(error), identity: retained.workspace.processIdentity(), workspace: retained.workspace.evidenceSnapshot(), transcript: retained.transcript});
    const currentProcesses = await context.ownedExecution.terminateAll(reason);
    const workspaceProcesses = await retained.workspace.terminate(reason);
    processes = {...currentProcesses, outcome: currentProcesses.outcome !== 'confirmed' ? currentProcesses.outcome : workspaceProcesses.outcome, processes: [...currentProcesses.processes, ...workspaceProcesses.processes].filter((item, index, all) => all.findIndex(candidate => candidate.identity.pid === item.identity.pid && candidate.identity.startedAtToken === item.identity.startedAtToken) === index)};
    record('attempt-process-cleanup', processes);
    if (processes.outcome !== 'confirmed') throw new Error('process_cleanup_unproved');
    const workspace = retained.workspace.cleanup();
    record('attempt-workspace-cleanup', workspace);
    if (workspace.outcome !== 'confirmed') throw new Error(workspace.detail);
    return {...processes, reason, completedAt: new Date().toISOString()};
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error), at = new Date().toISOString();
    const cleanup: ExecutionCleanupReport = {...(processes ?? {requestedAt: at, completedAt: at, processes: []}), outcome: processes && processes.outcome !== 'confirmed' ? processes.outcome : 'uncertain', reason: detail};
    try { record('attempt-cleanup-failure', {reason, error: detail, cleanup}); } catch { /* Do not turn persistence failure into cleanup proof. */ }
    throw Object.assign(new ActionFailure('execution_cleanup_uncertain', 'execution'), {executionCleanup: cleanup});
  }
}

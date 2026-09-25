import {createHash} from 'node:crypto';
import path from 'node:path';
import {Ajv, type ValidateFunction} from 'ajv';
import {Agent, fetch as undiciFetch} from 'undici';
import {leanContextSources, LeanResultProjector} from './lean-model-interface.js';
import type {ExecutionRecipe} from './adaptive-harness.js';
import {withLifecycleHeartbeat, type RecipeExecutionResult, type RecipeExecutor, type ToolInvocationGateway} from './harness-dispatch.js';
import {
  createInvocationObservation,
  type ContextPacketSource,
  type InvocationPricing,
  type ModelInvocationObservation,
} from './harness-efficiency.js';
import {estimateTokens} from './token-aware-output.js';
import {normalizeCacheEvidence} from './cache-evidence.js';
import {runtimeBudgetError, type GovernedRuntimeBudget, type RuntimeBudgetState} from './runtime-budget.js';
import {ToolCallReliabilityGate, hasDuplicateObjectKeys, type ToolCallReliabilityRecord} from './tool-call-reliability.js';
import type {SemanticEventInput, SemanticEventType} from './semantic-tool-events.js';
import {NoProgressDetector, type NoProgressEvidence, type NoProgressInteraction, type NoProgressThresholds} from './no-progress-v1.js';

export interface StructuredChatToolSchema {
  id: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Experimental model-facing aliases. The id always remains the governed tool id. */
export interface SemanticToolV1 {
  name: string;
  id: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface StructuredChatLoopOptions {
  /** Opt-in experiment; requires dispatcher-owned tool exposure. Evidence sink is caller-authorised. */
  lean?: {terminalAllowance?: boolean; deterministicTerminal?: boolean; recordEvidence: (record: Record<string, unknown>) => void};
  providerId: string;
  modelId: string;
  baseUrl: string;
  toolSchemas: StructuredChatToolSchema[];
  semanticToolV1?: {tools: SemanticToolV1[]; batchableToolIds?: string[]; independentEditToolIds?: string[]; systemInstruction?: string};
  finishToolId: string;
  timeoutMs?: number;
  maximumOutputTokens?: number;
  sampling?: {temperature: number; topP?: number; seed?: number};
  maximumToolResultBytes?: number;
  executionStrategy?: string;
  authorization?: () => string | undefined;
  signalForRecipe?: (recipe: ExecutionRecipe) => AbortSignal | undefined;
  pricing?: InvocationPricing;
  fetch?: typeof globalThis.fetch;
  cacheRetention?: {enabled: boolean; authority: 'authoritative' | 'derived'; source: string};
  /** Streaming is opt-in and capability-qualified by the caller. */
  streaming?: boolean;
  recordBudgetEvidence?: (record: Record<string, unknown>) => void;
  /** Experimental only. Decisions must be written to an append-only research ledger before dispatch. */
  toolReliability?: {recordEvidence: (record: ToolCallReliabilityRecord & {recipeId: string; turn: number}) => void};
  /** Research-only, metadata-only semantic lifecycle. Failure to retain evidence stops dispatch. */
  semanticEvents?: {record: (event: SemanticEventInput) => void; recordForensicResponse?: (modelCallId: string, content: string) => void};
  /** Research-only. Observes governed tool results; no tool request or argument is rewritten. */
  noProgressV1?: {
    thresholds?: Partial<NoProgressThresholds>;
    classify?: (toolId: string, input: unknown, result: unknown) => Pick<NoProgressInteraction, 'effect' | 'exception' | 'progress' | 'stateVersion'>;
    recordEvidence: (event: NoProgressEvidence & {recipeId: string; turn: number}) => void;
  };
}

interface NativeToolCall {id: string; type: 'function'; function: {name: string; arguments: string};}
interface ChatMessage {role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_calls?: NativeToolCall[]; tool_call_id?: string;}
interface ChatResponse {
  id?: string;
  model?: string;
  choices?: Array<{finish_reason?: string; message?: {content?: string | null; tool_calls?: NativeToolCall[]}}>;
  usage?: Record<string, unknown>;
  timings?: Record<string, unknown>;
  error?: {message?: string};
}
interface ToolRequest {tool: string; input?: unknown; nativeCall?: NativeToolCall;}

/**
 * Bounded multi-turn JSON-tool executor for OpenAI-compatible transports.
 *
 * Agent Control retains every raw handler, authorization decision and verifier.
 * The model can request only the typed tools present in the governed recipe and
 * cannot turn this transport into a shell or mark its own mutation verified.
 */
export class StructuredChatLoopProvider {
  private readonly endpoint: string;
  private readonly schemas: StructuredChatToolSchema[];
  private readonly leanValidators = new Map<string, ValidateFunction>();
  private readonly reliabilityGate: ToolCallReliabilityGate | undefined;
  private readonly semanticValidators = new Map<string, ValidateFunction>();

  constructor(private readonly options: StructuredChatLoopOptions) {
    const parsed = new URL(options.baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('structured_chat_loop_base_url_invalid');
    if (!options.providerId.trim() || !options.modelId.trim()) throw new Error('structured_chat_loop_identity_required');
    if (!options.finishToolId.trim()) throw new Error('structured_chat_loop_finish_tool_required');
    if (!options.toolSchemas.some(tool => tool.id === options.finishToolId)) throw new Error('structured_chat_loop_finish_schema_missing');
    if (new Set(options.toolSchemas.map(tool => tool.id)).size !== options.toolSchemas.length) throw new Error('structured_chat_loop_duplicate_tool_schema');
    for (const schema of options.toolSchemas) {
      if (!schema.id.trim() || !schema.description.trim() || !schema.inputSchema || typeof schema.inputSchema !== 'object' || Array.isArray(schema.inputSchema)) throw new Error('structured_chat_loop_tool_schema_invalid');
    }
    if (options.sampling && (!Number.isFinite(options.sampling.temperature) || options.sampling.temperature < 0 || options.sampling.temperature > 2 || options.sampling.topP !== undefined && (!Number.isFinite(options.sampling.topP) || options.sampling.topP <= 0 || options.sampling.topP > 1) || options.sampling.seed !== undefined && !Number.isInteger(options.sampling.seed))) throw new Error('structured_chat_loop_sampling_invalid');
    this.schemas = options.toolSchemas.map(schema => structuredClone(schema));
    if (options.semanticToolV1) {
      if (options.streaming || options.lean) throw new Error('semantic_tool_v1_streaming_or_lean_unsupported');
      if (options.semanticToolV1.systemInstruction !== undefined && !options.semanticToolV1.systemInstruction.trim()) throw new Error('semantic_tool_v1_system_instruction_empty');
      const names = new Set<string>();
      const ids = new Set<string>();
      const validator = new Ajv({strict: false, coerceTypes: false, useDefaults: false, removeAdditional: false});
      for (const tool of options.semanticToolV1.tools) {
        if (!/^[a-z][a-z0-9_]{1,63}$/.test(tool.name) || names.has(tool.name) || ids.has(tool.id) || !this.schemas.some(schema => schema.id === tool.id)) throw new Error('semantic_tool_v1_mapping_invalid');
        names.add(tool.name); ids.add(tool.id);
        this.semanticValidators.set(tool.id, validator.compile(this.schemas.find(schema => schema.id === tool.id)!.inputSchema));
      }
      if (ids.size !== this.schemas.length || !ids.has(options.finishToolId)) throw new Error('semantic_tool_v1_mapping_incomplete');
      if (options.semanticToolV1.batchableToolIds?.some(id => !ids.has(id) || id===options.finishToolId)) throw new Error('semantic_tool_v1_batch_mapping_invalid');
      if (options.semanticToolV1.independentEditToolIds?.some(id => !ids.has(id) || id===options.finishToolId || options.semanticToolV1!.batchableToolIds?.includes(id))) throw new Error('semantic_tool_v1_edit_batch_mapping_invalid');
    }
    if (options.toolReliability) this.reliabilityGate = new ToolCallReliabilityGate(this.schemas);
    if (options.lean) {
      const validator = new Ajv({strict: false, coerceTypes: false, useDefaults: false, removeAdditional: false});
      for (const schema of this.schemas) this.leanValidators.set(schema.id, validator.compile(schema.inputSchema));
    }
    this.endpoint = `${options.baseUrl.replace(/\/$/, '')}/chat/completions`;
  }

  executor(instruction: string, contextSources: ContextPacketSource[] = []): RecipeExecutor {
    const retainedSources = contextSources.map(source => structuredClone(source));
    return {execute: (recipe, tools) => this.execute(instruction, retainedSources, recipe, tools)};
  }

  private async execute(instruction: string, contextSources: ContextPacketSource[], recipe: ExecutionRecipe, tools: ToolInvocationGateway): Promise<RecipeExecutionResult> {
    if (typeof tools.assertActive !== 'function') throw new Error('provider_live_control_required');
    tools.assertActive();
    const granted = new Set(recipe.tools.map(tool => tool.id));
    const schemas = this.schemas.filter(schema => granted.has(schema.id));
    if (!schemas.some(schema => schema.id === this.options.finishToolId)) throw new Error('structured_chat_loop_finish_tool_not_granted');
    const budget = recipe.runtimeBudget;
    if (budget && ['REJECTED','REQUIRES_BUDGET_OVERRIDE','ROUTE_PROFILE_MISMATCH'].includes(budget.admission)) throw new Error(`runtime_budget_admission:${budget.admission}:${budget.reasons.join(',')}`);
    const configuredTurns = Math.max(1, recipe.harness?.maximumTurns ?? 1);
    const maximumTurns = budget ? Math.min(configuredTurns, budget.turnBudget) : configuredTurns;
    const legacyTimeoutMs = Math.min(recipe.resourceLimits.maximumLatencyMs ?? Number.POSITIVE_INFINITY, this.options.timeoutMs ?? 300_000);
    if (!budget && (!Number.isFinite(legacyTimeoutMs) || legacyTimeoutMs < 1)) throw new Error('structured_chat_loop_timeout_invalid');
    const jobStartedMs = Date.now();
    const workDeadline = budget ? jobStartedMs + budget.absoluteJobDeadlineMs - budget.verificationReserveMs - budget.cleanupReserveMs : jobStartedMs + legacyTimeoutMs;
    let lastMeaningfulProgressMs = jobStartedMs;
    const maximumToolResultBytes = this.options.maximumToolResultBytes ?? 32_768;
    const systemInstructions = this.options.semanticToolV1 ? (this.options.semanticToolV1.systemInstruction ?? `Use only the granted functions to carry out the assigned work. ${this.options.semanticToolV1.independentEditToolIds?.length ? 'You may request up to four independent reads together, or up to four independent edits to distinct resources together. Do not mix reads and edits in one response. Request other operations one at a time.' : this.options.semanticToolV1.batchableToolIds?.length ? 'You may request up to four independent reads together. Request other operations one at a time.' : 'Use exactly one provided function per turn.'} Inspect relevant state before changing it. Use the completion function only when done or safely blocked. Agent Control independently verifies the result.`) : renderSystemInstructions(schemas, this.options.finishToolId);
    const agentControlInstructions = 'Agent Control owns tool authorization, leases, human takeover, cancellation and independent verification. A finish request reports only that the worker has stopped; it never proves success.';
    if (this.options.lean && !tools.modelToolIds) throw new Error('lean_dispatcher_policy_required');
    const modelSources = this.options.semanticToolV1 ? contextSources.filter(source => source.kind !== 'tool_schemas') : this.options.lean ? leanContextSources(contextSources, JSON.stringify(this.schemas)) : contextSources;
    const renderedContext = modelSources.map((source, index) => `SOURCE ${index + 1} [${source.kind}] ${source.id}\n${source.content ?? ''}`).join('\n\n');
    const messages: ChatMessage[] = [
      {role: 'system', content: `${systemInstructions}\n\n${agentControlInstructions}`},
      {role: 'user', content: `${instruction}\n\nBEGIN AUTHORISED CONTEXT\n${renderedContext}\nEND AUTHORISED CONTEXT`},
    ];
    const observations: ModelInvocationObservation[] = [];
    const evidence: string[] = [];
    const toolTranscript: Array<{turn: number; tool: string; resultHash: string}> = [];
    const emit = (type: SemanticEventType, turn: number, responseSha256: string | null = null, toolId: string | null = null, reasonCode: string | null = null, outcome: SemanticEventInput['outcome'] = null) => {
      this.options.semanticEvents?.record({type, runId: recipe.id, modelCallId: turn > 0 ? `${recipe.id}:${turn}` : null, toolId, responseSha256, reasonCode, outcome});
    };
    const projector = new LeanResultProjector();
    const noProgress = this.options.noProgressV1 ? new NoProgressDetector({thresholds:this.options.noProgressV1.thresholds,record:()=>undefined}) : undefined;
    this.options.lean?.recordEvidence({kind: 'context_projection', recipeId: recipe.id, sources: contextSources, modelSourceIds: modelSources.map(source => source.id)});
    if (budget) this.options.recordBudgetEvidence?.({type:'runtime-budget-resolved',at:new Date().toISOString(),budget});

    const progress = (stage: RuntimeBudgetState['stage'], turn: number, operationStartedMs: number, operationDeadlineMs: number, progressKind: RuntimeBudgetState['progressKind'], meaningful = true) => {
      const atMs = Date.now(); if (meaningful) lastMeaningfulProgressMs = atMs;
      if (!budget) return;
      const state: RuntimeBudgetState = {schema:'agent-control.runtime-budget-state/v1',at:new Date(atMs).toISOString(),stage,turn,remainingTurns:Math.max(0,maximumTurns-turn),jobElapsedMs:atMs-jobStartedMs,remainingJobMs:Math.max(0,jobStartedMs+budget.absoluteJobDeadlineMs-atMs),currentOperationElapsedMs:Math.max(0,atMs-operationStartedMs),currentOperationDeadlineMs:operationDeadlineMs,lastMeaningfulProgressAt:new Date(lastMeaningfulProgressMs).toISOString(),noProgressWindowMs:budget.noProgressDeadlineMs,verificationReserveMs:budget.verificationReserveMs,cleanupReserveMs:budget.cleanupReserveMs,terminalAllowanceState:turn>maximumTurns?'IN_USE':budget.terminalCompletionTurns?'AVAILABLE':'UNAVAILABLE',progressKind};
      tools.runtimeBudget?.(state); this.options.recordBudgetEvidence?.({type:'runtime-budget-state',...state});
    };

    const allowedTurns = maximumTurns + (this.options.lean?.terminalAllowance && budget?.terminalCompletionTurns ? Math.min(1,budget.terminalCompletionTurns) : this.options.lean?.terminalAllowance ? 1 : 0);
    for (let turn = 1; turn <= allowedTurns; turn++) {
      const signals = [tools.signal, this.options.signalForRecipe?.(recipe)].filter((item): item is AbortSignal => Boolean(item));
      const externalSignal = signals.length ? AbortSignal.any(signals) : undefined;
      tools.assertActive();
      if (Date.now() >= workDeadline) return failed(budget ? 'JOB_DEADLINE_EXCEEDED' : 'structured_chat_loop_timeout', observations, evidence);
      if (turn > maximumTurns && !tools.beginTerminalAllowance?.()) return failed(budget ? 'TURN_BUDGET_EXHAUSTED' : `structured_chat_loop_turn_limit:${maximumTurns}`, observations, evidence);
      const exposedIds = this.options.lean ? new Set(tools.modelToolIds!()) : granted;
      const exposedSchemas = schemas.filter(schema => exposedIds.has(schema.id));
      if (this.options.lean) messages[0] = {role: 'system', content: `${renderSystemInstructions(exposedSchemas, this.options.finishToolId)}\n\n${agentControlInstructions}`};
      if (turn > maximumTurns && this.options.lean?.deterministicTerminal && exposedSchemas.length === 1 && exposedSchemas[0].id === this.options.finishToolId && this.leanValidators.get(this.options.finishToolId)?.({})) {
        tools.assertActive(); const terminalStarted=Date.now(); progress('TERMINAL',turn,terminalStarted,Math.max(1,workDeadline-terminalStarted),'TOOL_DISPATCH');
        const finishResult = await tools.invoke(this.options.finishToolId, {}); progress('TERMINAL',turn,terminalStarted,Math.max(1,workDeadline-terminalStarted),'TOOL_RESULT'); tools.assertActive();
        const result = {providerId: this.options.providerId, modelId: this.options.modelId, turns: observations.length, finishTool: this.options.finishToolId, finishResult, toolTranscript, deterministicTerminal: true};
        this.options.lean.recordEvidence({kind: 'deterministic_terminal', recipeId: recipe.id, result, potentialModelCallsAvoided: 1});
        return {resultRef: JSON.stringify(result), confidence: .5, fingerprint: createHash('sha256').update(stableJson(result)).digest('hex'), evidence: [...evidence, 'deterministic_terminal:independent_verification_still_required'], invocations: observations};
      }
      if (externalSignal?.aborted) return failed('structured_chat_loop_cancelled', observations, evidence, 'CANCELLED');
      const remainingWorkMs = workDeadline - Date.now();
      if (remainingWorkMs <= 0) return failed(budget ? 'JOB_DEADLINE_EXCEEDED' : 'structured_chat_loop_timeout', observations, evidence);
      const modelCallMs = Math.max(1, Math.min(remainingWorkMs, budget?.modelCallDeadlineMs ?? remainingWorkMs));
      const limitedByJobDeadline = Boolean(budget && remainingWorkMs <= budget.modelCallDeadlineMs);
      const startedAt = new Date().toISOString(), callStarted=Date.now();
      progress('MODEL',turn,callStarted,modelCallMs,'REQUEST_STARTED');
      let response: {body: ChatResponse; requestPrefixSha256: string};
      try {
        tools.lifecycle?.('waiting for provider');
        response = await withLifecycleHeartbeat(tools, () => this.request(messages, exposedSchemas, modelCallMs, budget?.noProgressDeadlineMs, externalSignal, () => progress('MODEL',turn,callStarted,modelCallMs,'PROVIDER_CONTENT')));
        progress('MODEL',turn,callStarted,modelCallMs,'MODEL_RESPONSE'); tools.lifecycle?.('response received');
      } catch (error) {
        const rawDetail = boundedError(error);
        const detail = rawDetail === 'MODEL_CALL_DEADLINE_EXCEEDED' && limitedByJobDeadline ? 'JOB_DEADLINE_EXCEEDED' : rawDetail;
        return failed(detail, observations, evidence, detail.includes('cancelled') ? 'CANCELLED' : 'FAILED');
      }
      externalSignal?.throwIfAborted(); tools.assertActive();
      const completedAt = new Date().toISOString(); tools.lifecycle?.('processing');
      const modelMessage = response.body.choices?.[0]?.message;
      const content = modelMessage?.content ?? '';
      const native = this.options.semanticToolV1 ? stableJson(modelMessage?.tool_calls ?? []) : content;
      if (!native || this.options.semanticToolV1 && !modelMessage?.tool_calls?.length) return failed('provider_missing_tool_request', observations, evidence);
      const responseHash = createHash('sha256').update(native).digest('hex');
      emit('MODEL_RESPONSE_RECEIVED', turn, responseHash);
      this.options.semanticEvents?.recordForensicResponse?.(`${recipe.id}:${turn}`, this.options.semanticToolV1 ? stableJson(modelMessage) : content);
      emit('TOOL_INTENT_DETECTED', turn, responseHash);
      emit('TOOL_PARSE_STARTED', turn, responseHash);
      const requests:ToolRequest[]=[];
      let translationStarted=false;
      try {
        if (this.options.semanticToolV1) {
          const calls=modelMessage?.tool_calls;
          if (!calls || !calls.length || calls.length>4 || new Set(calls.map(call=>call.id)).size!==calls.length) throw new Error('provider_native_tool_call_ambiguous');
          const resolved=calls.map(nativeCall=>{
            if (nativeCall.type!=='function' || !nativeCall.id || typeof nativeCall.function?.name!=='string' || typeof nativeCall.function?.arguments!=='string') throw new Error('provider_native_tool_call_invalid');
            const alias=this.options.semanticToolV1!.tools.find(tool=>tool.name===nativeCall.function.name);
            if (!alias || !exposedIds.has(alias.id)) throw new Error('provider_native_tool_not_granted');
            return {nativeCall,alias};
          });
          if (resolved.length>1 && !resolved.every(item=>this.options.semanticToolV1!.batchableToolIds?.includes(item.alias.id)) && !resolved.every(item=>this.options.semanticToolV1!.independentEditToolIds?.includes(item.alias.id))) throw new Error('provider_native_batch_not_permitted');
          for(const {nativeCall,alias} of resolved){
            emit('TOOL_TRANSLATION_STARTED', turn, responseHash, alias.id);
            translationStarted=true;
            let input:unknown;
            if (hasDuplicateObjectKeys(nativeCall.function.arguments)) throw new Error('provider_native_arguments_ambiguous_duplicate_key');
            try { input=JSON.parse(nativeCall.function.arguments); } catch { throw new Error('provider_native_arguments_invalid_json'); }
            emit('TOOL_SCHEMA_VALIDATION_STARTED', turn, responseHash, alias.id);
            if (!input || typeof input!=='object' || Array.isArray(input) || !this.semanticValidators.get(alias.id)?.(input)) {
              emit('TOOL_SCHEMA_VALIDATION_FAILED', turn, responseHash, alias.id, 'SCHEMA_INVALID', 'FAIL');
              throw new Error('provider_native_arguments_schema_invalid');
            }
            emit('TOOL_TRANSLATION_SUCCEEDED', turn, responseHash, alias.id, 'SEMANTIC_TOOL_V1', 'PASS');
            requests.push({tool:alias.id,input,nativeCall});
          }
          if (requests.length>1) {
            const readOnly=requests.every(item=>this.options.semanticToolV1!.batchableToolIds?.includes(item.tool));
            const editOnly=requests.every(item=>this.options.semanticToolV1!.independentEditToolIds?.includes(item.tool));
            const paths=editOnly?requests.map(item=>(item.input as {path?:unknown}).path):[];
            const independentFiles=editOnly && paths.every(value=>typeof value==='string' && value.length>0) && new Set(paths.map(value=>path.posix.normalize(String(value).replaceAll('\\','/')))).size===paths.length;
            if (!readOnly && !independentFiles) throw new Error('provider_native_batch_not_permitted');
          }
        } else if (this.reliabilityGate) {
          const decision = this.reliabilityGate.evaluate(content, exposedIds);
          this.options.toolReliability!.recordEvidence({...decision.record, recipeId: recipe.id, turn});
          const {record} = decision;
          if (record.reason === 'INVALID_JSON' || record.reason === 'RESPONSE_TOO_LARGE') emit('TOOL_PARSE_FAILED', turn, responseHash, null, record.reason, 'FAIL');
          else {
            emit('TOOL_SCHEMA_VALIDATION_STARTED', turn, responseHash, record.toolId);
            if (record.reason === 'SCHEMA_INVALID' || record.reason === 'TOOL_NOT_GRANTED') emit('TOOL_SCHEMA_VALIDATION_FAILED', turn, responseHash, record.toolId, record.reason, 'FAIL');
          }
          if (record.repair !== 'NONE') {
            emit('TOOL_SAFE_REPAIR_ATTEMPTED', turn, responseHash, record.toolId, record.repair);
            emit(record.decision === 'DISPATCH' ? 'TOOL_SAFE_REPAIR_ACCEPTED' : 'TOOL_SAFE_REPAIR_REJECTED', turn, responseHash, record.toolId, record.reason, record.decision === 'DISPATCH' ? 'PASS' : 'FAIL');
          }
          if (!decision.request) throw new Error(`provider_tool_request_${decision.record.reason.toLowerCase()}`);
          requests.push(decision.request);
          if (decision.record.repair !== 'NONE') evidence.push(`tool_repair:${decision.record.repair}:${decision.record.rawSha256}:${decision.record.normalizedSha256}`);
        } else { const request=parseToolRequest(content);requests.push(request); emit('TOOL_SCHEMA_VALIDATION_STARTED', turn, responseHash, request.tool); }
      }
      catch (error) {
        const detail=boundedError(error);
        if(this.options.semanticToolV1){
          const reason=detail.includes('ambiguous')?'AMBIGUOUS_NATIVE_CALLS':detail.includes('batch_not_permitted')?'BATCH_NOT_PERMITTED':detail.includes('not_granted')?'TOOL_NOT_GRANTED':detail.includes('schema_invalid')?'SCHEMA_INVALID':detail.includes('invalid_json')?'INVALID_JSON':'INVALID_TOOL_REQUEST';
          if(translationStarted)emit('TOOL_TRANSLATION_FAILED',turn,responseHash,null,reason,'FAIL');
          if(reason==='TOOL_NOT_GRANTED')emit('TOOL_SCHEMA_VALIDATION_FAILED',turn,responseHash,null,reason,'FAIL');
          if(reason!=='SCHEMA_INVALID'&&reason!=='TOOL_NOT_GRANTED')emit('TOOL_PARSE_FAILED',turn,responseHash,null,reason,'FAIL');
        }else if(!this.reliabilityGate)emit('TOOL_PARSE_FAILED',turn,responseHash,null,'INVALID_TOOL_REQUEST','FAIL');
        observations.push(this.observation(recipe, modelSources, messages, turn, startedAt, completedAt, response.body, [], responseHash, detail, response.requestPrefixSha256));
        return failed(detail, observations, [...evidence, `provider_response_sha256:${responseHash}`]);
      }
      observations.push(this.observation(recipe, modelSources, messages, turn, startedAt, completedAt, response.body, requests.map(request=>request.tool), responseHash, undefined, response.requestPrefixSha256));
      this.options.lean?.recordEvidence({kind: 'model_invocation', recipeId: recipe.id, turn, messages: structuredClone(messages), response: response.body, exposedToolIds: [...exposedIds]});
      if (this.options.lean && !exposedSchemas.some(schema => schema.id === requests[0].tool)) throw withObservations(new Error(`tool_policy_denied:lean_hidden_tool:${requests[0].tool}`), observations, evidence);
      if (this.options.lean && !this.leanValidators.get(requests[0].tool)?.(requests[0].input ?? {})) throw withObservations(new Error('tool_policy_denied:lean_input_schema'), observations, evidence);
      evidence.push(`provider_response:${response.body.id ?? responseHash.slice(0, 16)}`, `provider_response_sha256:${responseHash}`);
      messages.push(this.options.semanticToolV1 ? {role:'assistant',content,tool_calls:requests.map(request=>request.nativeCall!)} : {role: 'assistant', content});
      const resultMessages:ChatMessage[]=[];
      const noProgressNotices:string[]=[];
      let noProgressTerminated=false;
      for(const request of requests){
        let output: unknown; const toolStarted=Date.now(); progress(request.tool===this.options.finishToolId?'TERMINAL':'TOOL',turn,toolStarted,budget?.toolCallDeadlineMs??remainingWorkMs,'TOOL_DISPATCH');
        emit('TOOL_DISPATCH_STARTED', turn, responseHash, request.tool);
        try { tools.assertActive(); output = await tools.invoke(request.tool, request.input); emit('TOOL_DISPATCH_SUCCEEDED', turn, responseHash, request.tool, null, 'PASS'); progress(request.tool===this.options.finishToolId?'TERMINAL':'TOOL',turn,toolStarted,budget?.toolCallDeadlineMs??remainingWorkMs,'TOOL_RESULT'); }
        catch (error) { const detail = boundedError(error); emit('TOOL_DISPATCH_FAILED', turn, responseHash, request.tool, 'TOOL_ERROR', 'FAIL'); if (externalSignal?.aborted) throw withObservations(new Error('structured_chat_loop_cancelled'), observations, evidence); if (detail.startsWith('tool_policy_denied:') || detail === 'TOOL_DEADLINE_EXCEEDED') throw withObservations(error, observations, evidence); if (request.tool === this.options.finishToolId) return failed(detail, observations, evidence); output = {ok: false, error: detail}; }
        externalSignal?.throwIfAborted(); tools.assertActive();
        const projection = this.options.lean ? projector.project(output, turn) : undefined;
        this.options.lean?.recordEvidence({kind: 'tool_result', recipeId: recipe.id, turn, tool: request.tool, output, projection});
        const serialized = projection && projection.rawBytes <= maximumToolResultBytes ? projection.content : boundedJson(output, maximumToolResultBytes);
        const resultHash = createHash('sha256').update(serialized).digest('hex'); toolTranscript.push({turn, tool: request.tool, resultHash}); evidence.push(`tool_executed:${request.tool}`, `tool_result_sha256:${resultHash}`); if (this.options.semanticToolV1) emit('TOOL_RESULT_RECORDED', turn, responseHash, request.tool, null, 'PASS');
        if (request.tool === this.options.finishToolId) { const result = {providerId: this.options.providerId, modelId: response.body.model ?? this.options.modelId, turns: turn, finishTool: request.tool, finishResult: output, toolTranscript}; return {resultRef: JSON.stringify(result), confidence: .5, fingerprint: createHash('sha256').update(stableJson(result)).digest('hex'), evidence: [...new Set(evidence)], invocations: observations}; }
        resultMessages.push(this.options.semanticToolV1 ? {role:'tool',tool_call_id:request.nativeCall!.id,content:serialized} : {role: 'user', content: `TOOL RESULT (authoritative, bounded)\n${serialized}\nContinue with exactly one JSON tool request.`});
        if(noProgress){
          const risk=recipe.tools.find(tool=>tool.id===request.tool)?.risk;
          const classified=this.options.noProgressV1!.classify?.(request.tool,request.input,output)??{};
          const effect=classified.effect??(risk==='read'?'READ':'UNKNOWN');
          const event=noProgress.observe({toolId:request.tool,input:request.input,result:serialized,...classified,effect});
          try{this.options.noProgressV1!.recordEvidence({...event,recipeId:recipe.id,turn});}
          catch{throw withObservations(new Error('no_progress_evidence_persistence_failed'),observations,evidence);}
          evidence.push(`no_progress_v1:${event.status}:${event.pairFingerprint}`);
          if(event.status==='NO_PROGRESS_WARNING')noProgressNotices.push('Agent Control notice: this successful tool request returned a result already observed. Check whether the next action can make progress. The tool result above remains authoritative.');
          if(event.status==='RECOVERY_REQUIRED'||event.status==='REPLANNING')noProgressNotices.push(`Agent Control no-progress recovery: ${event.status}. Summarise the obstacle and choose a materially different, authorised next step. ${noProgress.summary([...granted])}`);
          if(event.status==='ESCALATION_REQUIRED')noProgressNotices.push('Agent Control escalation required: repeated successful tool interactions have not yielded new information. Do not repeat this request. Stop safely or request external guidance through an authorised path.');
          if(event.status==='TERMINATED_NO_PROGRESS')noProgressTerminated=true;
        }
      }
      const maximumProcessedTokens = typeof recipe.runtime.maximumProcessedTokens === 'number' ? recipe.runtime.maximumProcessedTokens : undefined;
      const observedProcessedTokens = observations.reduce((sum, item) => sum + (item.usage.totalProcessedTokens ?? item.usage.inputTokens ?? 0), 0);
      if (maximumProcessedTokens !== undefined && observedProcessedTokens >= maximumProcessedTokens) return failed(`structured_chat_loop_token_budget:${observedProcessedTokens}:${maximumProcessedTokens}`, observations, evidence);
      messages.push(...resultMessages);
      if(noProgressTerminated)return failed('NO_PROGRESS_TERMINATED',observations,evidence);
      for(const notice of noProgressNotices)messages.push({role:'user',content:notice});
    }
    return failed(budget ? 'TURN_BUDGET_EXHAUSTED' : `structured_chat_loop_turn_limit:${maximumTurns}`, observations, evidence);
  }

  private async request(messages: ChatMessage[], exposedSchemas: StructuredChatToolSchema[], timeoutMs: number, noProgressMs: number | undefined, externalSignal: AbortSignal | undefined, onContent: () => void) {
    const fetcher = this.options.fetch ?? (undiciFetch as unknown as typeof globalThis.fetch);
    const timeout = AbortSignal.timeout(timeoutMs), noProgressController = new AbortController();
    const signals = [timeout, noProgressController.signal, externalSignal].filter((item): item is AbortSignal => Boolean(item));
    const signal = AbortSignal.any(signals);
    const authorization = this.options.authorization?.();
    const nativeTools=this.options.semanticToolV1?.tools.filter(tool => exposedSchemas.some(schema => schema.id===tool.id)).map(tool => ({type:'function',function:{name:tool.name,description:tool.description,parameters:tool.parameters}}));
    const requestBody = {model: this.options.modelId, messages, ...(nativeTools ? {tools:nativeTools,tool_choice:'required',parallel_tool_calls:Boolean(this.options.semanticToolV1?.batchableToolIds?.length || this.options.semanticToolV1?.independentEditToolIds?.length)} : {response_format: {type: 'json_object'}}), temperature: this.options.sampling?.temperature ?? 0, ...(this.options.sampling?.topP === undefined ? {} : {top_p: this.options.sampling.topP}), ...(this.options.sampling?.seed === undefined ? {} : {seed: this.options.sampling.seed}), max_tokens: this.options.maximumOutputTokens ?? 768, stream: Boolean(this.options.streaming), ...(this.options.streaming ? {stream_options:{include_usage:true}} : {})};
    const dispatcher = new Agent({headersTimeout:timeoutMs,bodyTimeout:timeoutMs});
    try {
      const response = await fetcher(this.endpoint, {method:'POST',headers:{'content-type':'application/json',...(authorization?{authorization:`Bearer ${authorization}`}:{})},body:JSON.stringify(requestBody),signal,dispatcher} as RequestInit & {dispatcher: Agent});
      if (!response.ok) { const body=await response.json() as ChatResponse; throw new Error(`provider_http_error:${response.status}:${body.error?.message ?? 'unknown'}`); }
      let body: ChatResponse;
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (!this.options.streaming || contentType.includes('application/json')) body=await response.json() as ChatResponse;
      else body=await this.readStream(response,noProgressMs,noProgressController,onContent);
      this.options.recordBudgetEvidence?.({type:'provider-response-complete',at:new Date().toISOString(),streaming:Boolean(this.options.streaming),body});
      return {body,requestPrefixSha256:createHash('sha256').update(stableJson(requestBody)).digest('hex')};
    } catch (error) {
      if (externalSignal?.aborted) throw new Error('structured_chat_loop_cancelled');
      if (noProgressController.signal.aborted) throw runtimeBudgetError('MODEL_NO_PROGRESS');
      if (timeout.aborted) throw runtimeBudgetError('MODEL_CALL_DEADLINE_EXCEEDED');
      const cause=(error as {cause?:{code?:string}})?.cause?.code;
      if (cause?.includes('TIMEOUT')) throw runtimeBudgetError('TRANSPORT_TIMEOUT');
      throw error;
    } finally { await dispatcher.close(); }
  }

  private async readStream(response: Response, noProgressMs: number | undefined, controller: AbortController, onContent: () => void): Promise<ChatResponse> {
    if (!response.body) throw new Error('provider_stream_missing_body');
    const reader=response.body.getReader(),decoder=new TextDecoder(); let pending='',content='',id: string|undefined,model: string|undefined,usage:Record<string,unknown>|undefined,timings:Record<string,unknown>|undefined,finishReason:string|undefined;
    let lastMeaningfulContentAt=Date.now();
    const read=async()=>{
      if (!noProgressMs) return reader.read();
      const remaining=noProgressMs-(Date.now()-lastMeaningfulContentAt);
      if(remaining<=0){controller.abort(runtimeBudgetError('MODEL_NO_PROGRESS'));throw runtimeBudgetError('MODEL_NO_PROGRESS');}
      let timer:NodeJS.Timeout|undefined;
      try { return await Promise.race([reader.read(),new Promise<never>((_r,reject)=>{timer=setTimeout(()=>{controller.abort(runtimeBudgetError('MODEL_NO_PROGRESS'));reject(runtimeBudgetError('MODEL_NO_PROGRESS'));},remaining);})]); }
      finally { if(timer)clearTimeout(timer); }
    };
    while(true){const part=await read();if(part.done)break;pending+=decoder.decode(part.value,{stream:true});const records=pending.split(/\r?\n\r?\n/);pending=records.pop()??'';for(const record of records){for(const line of record.split(/\r?\n/)){if(!line.startsWith('data:'))continue;const data=line.slice(5).trim();if(!data||data==='[DONE]')continue;let event:any;try{event=JSON.parse(data);}catch{throw new Error('provider_stream_json_invalid');}id=typeof event.id==='string'?event.id:id;model=typeof event.model==='string'?event.model:model;usage=event.usage&&typeof event.usage==='object'?event.usage:usage;timings=event.timings&&typeof event.timings==='object'?event.timings:timings;const choice=Array.isArray(event.choices)?event.choices[0]:undefined;const delta=choice?.delta?.content;if(typeof delta==='string'&&delta.length){content+=delta;lastMeaningfulContentAt=Date.now();onContent();}if(typeof choice?.finish_reason==='string')finishReason=choice.finish_reason;}}}
    return {id,model,choices:[{finish_reason:finishReason,message:{content}}],usage,timings};
  }

  private observation(recipe: ExecutionRecipe, sources: ContextPacketSource[], messages: ChatMessage[], turn: number, startedAt: string, completedAt: string, body: ChatResponse, toolIds: string[], responseHash: string, error?: string, requestPrefixSha256?: string) {
    const conversation = turn > 1 ? [{
      id: `${recipe.id}:conversation:${turn}`, kind: 'conversation_history' as const,
      content: messages.slice(2).map(message => `${message.role}:${message.content}${message.tool_calls ? stableJson(message.tool_calls) : ''}`).join('\n'),
      required: true, persistent: false, relevance: 1, provenanceIds: [recipe.fingerprint],
    }] : [];
    let startupSources: ContextPacketSource[] = [
      {id: `${recipe.id}:loop-system`, kind: 'system_instructions', content: this.options.semanticToolV1 ? messages[0].content : renderSystemInstructions(this.schemas.filter(schema => recipe.tools.some(tool => tool.id === schema.id)), this.options.finishToolId), required: true, persistent: true, relevance: 1, provenanceIds: [recipe.fingerprint]},
      {id: `${recipe.id}:loop-control`, kind: 'agent_control_instructions', content: 'Agent Control owns tool authorization, leases, human takeover, cancellation and independent verification.', required: true, persistent: true, relevance: 1, provenanceIds: [recipe.fingerprint]},
      {id: `${recipe.id}:loop-tools`, kind: 'tool_schemas', content: JSON.stringify(this.options.semanticToolV1?.tools.filter(tool => recipe.tools.some(granted => granted.id === tool.id)) ?? this.schemas.filter(schema => recipe.tools.some(tool => tool.id === schema.id))), required: true, persistent: true, relevance: 1, provenanceIds: [recipe.fingerprint]},
      ...sources,
      ...conversation,
    ];
    if (this.options.lean) startupSources = [
      {id: `${recipe.id}:lean-system`, kind: 'system_instructions', content: messages[0].content, required: true, persistent: true, relevance: 1, provenanceIds: [recipe.fingerprint]},
      {id: `${recipe.id}:lean-authorised-context`, kind: 'task_context', content: messages[1].content, required: true, persistent: true, relevance: 1, provenanceIds: [recipe.fingerprint]},
      ...conversation,
    ];
    return createInvocationObservation({
      jobId: recipe.jobId ?? recipe.taskId, runId: recipe.runId, taskId: recipe.taskId, laneId: recipe.authority.laneId,
      model: body.model ?? this.options.modelId, provider: this.options.providerId, harnessProfile: recipe.harness?.profile ?? 'STANDARD',
      executionStrategy: this.options.executionStrategy ?? 'structured-chat.bounded-json-tool-loop', turnNumber: turn,
      startedAt, completedAt, startupSources, rawUsage: body.usage, cacheEvidence: this.cacheEvidence(body, requestPrefixSha256), pricing: this.options.pricing,
      toolIds, filesContextSupplied: sources.filter(source => ['repository_instructions', 'workspace_bootstrap'].includes(source.kind)).length,
      retrievedContextTokens: sources.filter(source => ['task_context', 'memory_shared_context', 'other'].includes(source.kind)).reduce((sum, source) => sum + (source.estimatedTokens ?? estimateTokens(source.content ?? '')), 0),
      repositoryContextTokens: sources.filter(source => ['repository_instructions', 'workspace_bootstrap'].includes(source.kind)).reduce((sum, source) => sum + (source.estimatedTokens ?? estimateTokens(source.content ?? '')), 0),
      contextSourceIds: recipe.context.sourceIds, outcome: error ? 'FAILED' : 'COMPLETE', error,
      recipeFingerprint: recipe.fingerprint, contextPacketId: recipe.harness?.contextPacketId,
      evidenceIds: [`provider_response_sha256:${responseHash}`],
      ...(recipe.runtimeBudget ? {runtimeBudget: recipe.runtimeBudget} : {}),
    });
  }

  private cacheEvidence(body: ChatResponse, requestPrefixSha256?: string) {
    const evidence = normalizeCacheEvidence({usage: body.usage, timings: body.timings, timingSource: 'llama.cpp.response.timings', requestPrefixSha256});
    if (!evidence || !this.options.cacheRetention?.enabled || evidence.processedPromptTokens === null) return evidence;
    return {...evidence, retainedPromptTokens: (evidence.reusedTokens ?? 0) + evidence.processedPromptTokens, retentionAuthority: this.options.cacheRetention.authority, retentionSource: this.options.cacheRetention.source};
  }
}

function renderSystemInstructions(schemas: StructuredChatToolSchema[], finishToolId: string): string {
  return `You are a bounded implementation worker. Return only one JSON object with shape {"tool":"<granted id>","input":{...}} and no prose. Inspect before editing. Use typed tools only. Run the available verifier-facing test tool before finishing when practical. Request ${finishToolId} only after work is complete or when safely blocked. Granted tools:\n${JSON.stringify(schemas)}`;
}

function parseToolRequest(content: string): ToolRequest {
  const normalized = content.trim().match(/^```json\s*([\s\S]*?)\s*```$/i)?.[1] ?? content;
  let parsed: unknown;
  try { parsed = JSON.parse(normalized); } catch { throw new Error('provider_tool_request_invalid_json'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('provider_tool_request_invalid');
  const request = parsed as Record<string, unknown>;
  if (typeof request.tool !== 'string' || !request.tool.trim()) throw new Error('provider_tool_request_missing_tool');
  if (Object.keys(request).some(key => !['tool', 'input'].includes(key))) throw new Error('provider_tool_request_unknown_field');
  return {tool: request.tool, input: request.input};
}

function boundedJson(value: unknown, maximumBytes: number): string {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') <= maximumBytes) return serialized;
  const buffer = Buffer.from(serialized, 'utf8').subarray(0, Math.max(0, maximumBytes - 160));
  return JSON.stringify({compacted: true, originalBytes: Buffer.byteLength(serialized, 'utf8'), prefix: buffer.toString('utf8'), detail: 'Typed result exceeded the model-facing bound.'});
}

function failed(error: string, invocations: ModelInvocationObservation[], evidence: string[], outcome: 'FAILED' | 'CANCELLED' = 'FAILED'): RecipeExecutionResult {
  return {error, retryable: outcome !== 'CANCELLED', evidence: [...new Set(evidence)], invocations};
}

function withObservations(error: unknown, invocations: ModelInvocationObservation[], evidence: string[]) {
  const retained = error instanceof Error ? error : new Error(String(error));
  Object.assign(retained, {efficiencyObservations: invocations.map(item => structuredClone(item)), efficiencyEvidenceIds: [...evidence]});
  return retained;
}

function boundedError(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.length <= 512 ? value : `${value.slice(0, 509)}...`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

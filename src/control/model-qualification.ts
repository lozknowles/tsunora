import {createHash} from 'node:crypto';
import type {ModelConfig, ProviderConfig} from './config.js';
import type {ModelQualificationRecord, ModelRegistry} from './model-registry.js';
import {OpenAICompatibleProviderClient, type FetchLike, type ModelInvocationResult} from './openai-compatible-provider.js';
import {resolveProviderAccountCredential} from './provider-credential-store.js';
import {redactSensitiveText} from './security-redaction.js';

export interface ModelQualificationEvidence {schema: 'agent-control.model-qualification/v1'; modelId: string; providerId: string; accountProfileId: string | null; providerModel: string; nodeId: string; startedAt: string; completedAt: string; checks: Array<{id: string; passed: boolean; latencyMs: number; usage: ModelInvocationResult['usage']; responseModel: string | null; responseHash: string; capabilities: string[]}>; capabilities: string[]; state: ModelQualificationRecord['state']; detail?: string;}

export async function qualifyModel(input: {registry: ModelRegistry; modelId: string; nodeId: string; fetcher?: FetchLike; version?: string}): Promise<{record: ModelQualificationRecord; evidence: ModelQualificationEvidence}> {
  const model = input.registry.model(input.modelId); if (!model) throw new Error('model_missing');
  const provider = input.registry.provider(model.provider); if (!provider) throw new Error('provider_missing');
  if (model.enabled === false || provider.enabled === false) throw new Error('model_disabled');
  const version = input.version ?? `qualification-${new Date().toISOString().slice(0, 10)}`, startedAt = new Date().toISOString();
  const account = model.accountProfile ? input.registry.accountProfile(provider.id, model.accountProfile) : undefined;
  if (model.accountProfile && !account) throw new Error('account_profile_missing');
  input.registry.setQualification({modelId: model.id, state: 'QUALIFYING', version, checkedAt: startedAt, capabilities: [], nodes: [], evidence: []});
  const client = new OpenAICompatibleProviderClient(provider, input.fetcher, account ? () => resolveProviderAccountCredential(provider, account, process.env, undefined, input.nodeId) : undefined, {accountProfileId: account?.id, nodeId: input.nodeId}), checks: ModelQualificationEvidence['checks'] = [];
  try {
    for (const check of qualificationChecks(model)) {
      const result = await client.invoke(model, check.prompt, {timeoutMs: 30_000, maximumOutputTokens: check.maximumOutputTokens, structured: check.structured, outputSchema: check.outputSchema, toolProbe: check.toolProbe});
      const passed = check.verify(result); checks.push({id: check.id, passed, latencyMs: result.elapsedMs, usage: result.usage, responseModel: result.responseModel, responseHash: createHash('sha256').update(result.output).digest('hex'), capabilities: passed ? [...check.capabilities] : []});
      if (!passed) throw new Error(`qualification_check_failed:${check.id}`);
    }
    const usageObserved = checks.some(check => Object.entries(check.usage).some(([key, value]) => key !== 'currency' && value !== null));
    const capabilities = [...new Set([provider.wireApi ?? 'responses', 'model-identity', ...(usageObserved ? ['usage-accounting'] : []), ...checks.flatMap(check => check.capabilities)])];
    const completedAt = new Date().toISOString(), evidenceIds = checks.map(check => `${check.id}:${check.responseHash}`);
    const record: ModelQualificationRecord = {modelId: model.id, state: 'QUALIFIED', version, checkedAt: completedAt, qualifiedAt: completedAt, capabilities, nodes: [input.nodeId], latencyMs: Math.round(checks.reduce((sum, check) => sum + check.latencyMs, 0) / checks.length), successRate: 1, evidence: evidenceIds};
    input.registry.setQualification(record);
    return {record, evidence: {schema: 'agent-control.model-qualification/v1', modelId: model.id, providerId: provider.id, accountProfileId: account?.id ?? null, providerModel: model.providerModel, nodeId: input.nodeId, startedAt, completedAt, checks, capabilities, state: 'QUALIFIED'}};
  } catch (error) {
    const completedAt = new Date().toISOString(), detail = safe((error as Error).message), record: ModelQualificationRecord = {modelId: model.id, state: 'FAILED', version, checkedAt: completedAt, capabilities: [], nodes: [], successRate: checks.length ? checks.filter(check => check.passed).length / checks.length : 0, evidence: checks.map(check => `${check.id}:${check.responseHash}`), detail};
    input.registry.setQualification(record);
    return {record, evidence: {schema: 'agent-control.model-qualification/v1', modelId: model.id, providerId: provider.id, accountProfileId: account?.id ?? null, providerModel: model.providerModel, nodeId: input.nodeId, startedAt, completedAt, checks, capabilities: [], state: 'FAILED', detail}};
  }
}

function qualificationChecks(model: ModelConfig): Array<{id: string; prompt: string; maximumOutputTokens: number; structured: boolean; outputSchema?: Record<string, unknown>; toolProbe?: string; capabilities: string[]; verify: (result: ModelInvocationResult) => boolean}> {
  const checks: ReturnType<typeof qualificationChecks> = [{id: 'basic-response-and-identity', prompt: 'Reply with exactly AGENT_CONTROL_MODEL_OK', maximumOutputTokens: 256, structured: false, capabilities: ['basic-response'], verify: result => result.output.includes('AGENT_CONTROL_MODEL_OK') && result.responseModel === model.providerModel}];
  if (model.capabilities.includes('coding')) checks.push({id: 'bounded-coding-and-structured-output', prompt: 'Return ONLY valid JSON with key code containing a JavaScript function add(a,b) that returns a+b. Do not include Markdown fences, explanation or other text.', maximumOutputTokens: 1024, structured: true, outputSchema: {type:'object',properties:{code:{type:'string'}},required:['code'],additionalProperties:false}, capabilities: ['coding', 'structured-output'], verify: result => { try { const value = JSON.parse(result.output) as {code?: unknown}; return typeof value.code === 'string' && /add\s*\(|function\s+add/.test(value.code); } catch { return false; } }});
  if (model.capabilities.includes('reasoning')) checks.push({id: 'bounded-reasoning', prompt: 'A job has 3 retries and each attempt takes 2 seconds. Reply with the total seconds as a number.', maximumOutputTokens: 1024, structured: false, capabilities: ['reasoning'], verify: result => /\b6\b/.test(result.output)});
  if (model.capabilities.includes('tool-use')) checks.push({id: 'bounded-tool-call', prompt: 'Call the supplied function with marker AGENT_CONTROL_TOOL_OK.', maximumOutputTokens: 1024, structured: false, toolProbe: 'agent_control_qualification_marker', capabilities: ['tool-use'], verify: result => { if (result.toolCall?.name !== 'agent_control_qualification_marker') return false; try { return (JSON.parse(result.toolCall.arguments) as {marker?: unknown}).marker === 'AGENT_CONTROL_TOOL_OK'; } catch { return false; } }});
  return checks;
}
function safe(value: string) { return redactSensitiveText(value).slice(0, 240); }

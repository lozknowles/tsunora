import type {HarnessCandidate} from './adaptive-harness.js';
import type {RecipeExecutor} from './harness-dispatch.js';

export type OpenAIAuthPreference = 'auto' | 'api-key' | 'chatgpt-plan';
export type OpenAIAuthMode = Exclude<OpenAIAuthPreference, 'auto'>;

export interface OpenAIExecutionProvider {
  candidate(): HarnessCandidate;
  executor(instruction: string): RecipeExecutor;
}

export interface OpenAIProviderSelection {
  mode: OpenAIAuthMode;
  provider: OpenAIExecutionProvider;
  reason: string;
}

export interface OpenAIProviderSelectorOptions {
  preference?: OpenAIAuthPreference;
  apiKey: () => string | undefined;
  apiProvider: (authorization: () => string) => OpenAIExecutionProvider;
  chatGptPlanProvider: () => OpenAIExecutionProvider;
}

/** Selects authentication without persisting or returning the API key. */
export function selectOpenAIExecutionProvider(options: OpenAIProviderSelectorOptions): OpenAIProviderSelection {
  const preference = options.preference ?? 'auto';
  const apiKey = options.apiKey()?.trim();
  if (preference === 'api-key' && !apiKey) throw new Error('openai_api_key_required');
  if (preference === 'chatgpt-plan' || (!apiKey && preference === 'auto')) {
    return {
      mode: 'chatgpt-plan',
      provider: options.chatGptPlanProvider(),
      reason: preference === 'chatgpt-plan' ? 'operator_forced_chatgpt_plan' : 'api_key_absent',
    };
  }
  const authorization = () => apiKey!;
  return {
    mode: 'api-key',
    provider: options.apiProvider(authorization),
    reason: preference === 'api-key' ? 'operator_forced_api_key' : 'api_key_present',
  };
}

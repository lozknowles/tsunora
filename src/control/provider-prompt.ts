export type ProviderPromptStability = 'stable' | 'volatile';

export interface ProviderPromptBlock {
  type: 'text';
  stability: ProviderPromptStability;
  text: string;
}

/**
 * Provider-neutral prompt structure. Adapters may exploit a stable-prefix
 * boundary only when both their provider and model explicitly advertise a
 * compatible cache capability. The rendered text remains authoritative.
 */
export interface ProviderPrompt {
  schema: 'agent-control.provider-prompt/v1';
  blocks: ProviderPromptBlock[];
  /** Opaque, non-secret grouping material. Adapters derive their own key. */
  cacheScope: string;
}

export type ProviderPromptInput = string | ProviderPrompt;

export interface ProviderPromptBoundary {
  prompt: ProviderPrompt;
  rendered: string;
  lastStableBlock: number;
}

export function renderProviderPrompt(input: ProviderPromptInput): string {
  if (typeof input === 'string') return input;
  return validateProviderPrompt(input).blocks.map(block => block.text).join('');
}

export function providerPromptBoundary(input: ProviderPromptInput): ProviderPromptBoundary | null {
  if (typeof input === 'string') return null;
  const prompt = validateProviderPrompt(input);
  let lastStableBlock = -1;
  for (let index = prompt.blocks.length - 1; index >= 0; index--) if (prompt.blocks[index].stability === 'stable') { lastStableBlock = index; break; }
  if (lastStableBlock < 0) return null;
  if (prompt.blocks.slice(0, lastStableBlock + 1).some(block => block.stability !== 'stable')) throw new Error('provider_prompt_stable_prefix_noncontiguous');
  return {prompt, rendered: prompt.blocks.map(block => block.text).join(''), lastStableBlock};
}

function validateProviderPrompt(input: ProviderPrompt): ProviderPrompt {
  if (input.schema !== 'agent-control.provider-prompt/v1' || !Array.isArray(input.blocks) || !input.blocks.length) throw new Error('provider_prompt_invalid');
  if (!input.cacheScope.trim() || input.cacheScope.length > 256) throw new Error('provider_prompt_cache_scope_invalid');
  for (const block of input.blocks) if (block.type !== 'text' || !['stable', 'volatile'].includes(block.stability) || typeof block.text !== 'string' || !block.text.length) throw new Error('provider_prompt_block_invalid');
  return input;
}

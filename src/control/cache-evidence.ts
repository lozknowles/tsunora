export interface CacheEvidence {
  reusedTokens: number | null;
  processedPromptTokens: number | null;
  cacheWriteTokens: number | null;
  promptProcessingMs: number | null;
  generationMs: number | null;
  authority: 'authoritative' | 'unavailable';
  source: string;
  requestPrefixSha256?: string;
  retainedPromptTokens?: number;
  retentionAuthority?: 'authoritative' | 'derived' | 'unavailable';
  retentionSource?: string;
}

export function normalizeCacheEvidence(input: {
  usage?: unknown;
  timings?: unknown;
  timingSource?: string;
  requestPrefixSha256?: string;
}): CacheEvidence | undefined {
  const usage = record(input.usage), timings = record(input.timings);
  const cached = metric(usage, ['input_tokens_details', 'cached_tokens'], ['prompt_tokens_details', 'cached_tokens'], ['cache_read_input_tokens'], ['cached_input_tokens'], ['cachedInputTokens']);
  const cacheWrite = metric(usage, ['cache_creation_input_tokens'], ['cache_write_input_tokens'], ['cacheWriteTokens']);
  const timingCache = number(timings?.cache_n), processed = number(timings?.prompt_n);
  const promptMs = number(timings?.prompt_ms), generationMs = number(timings?.predicted_ms);
  const recognisedTimings = timings !== undefined && [timingCache, processed, promptMs, generationMs].some(value => value !== null);
  if (!recognisedTimings && cached === null && cacheWrite === null) return undefined;
  return {
    reusedTokens: timingCache ?? cached,
    processedPromptTokens: processed,
    cacheWriteTokens: cacheWrite,
    promptProcessingMs: promptMs,
    generationMs,
    authority: timingCache !== null || cached !== null ? 'authoritative' : 'unavailable',
    source: recognisedTimings ? input.timingSource ?? 'provider.response.timings' : 'provider.usage.cached_tokens',
    ...(input.requestPrefixSha256 ? {requestPrefixSha256: input.requestPrefixSha256} : {}),
  };
}

function record(value: unknown) { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function number(value: unknown) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null; }
function metric(raw: Record<string, unknown> | undefined, ...paths: string[][]) {
  for (const path of paths) {
    let value: unknown = raw;
    for (const key of path) value = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined;
    const parsed = number(value); if (parsed !== null) return parsed;
  }
  return null;
}

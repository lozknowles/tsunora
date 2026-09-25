export function normalizeUsage(raw = {}) {
  const inputTokens = numberOrNull(raw.input_tokens ?? raw.prompt_tokens);
  const cachedInputTokens = numberOrNull(raw.input_tokens_details?.cached_tokens ?? raw.prompt_tokens_details?.cached_tokens);
  const outputTokens = numberOrNull(raw.output_tokens ?? raw.completion_tokens);
  return {
    inputTokens,
    freshInputTokens: inputTokens === null || cachedInputTokens === null ? null : Math.max(0, inputTokens - cachedInputTokens),
    cachedInputTokens,
    outputTokens,
    monetaryCost: null,
  };
}

export function createAttemptTelemetry({taskId, profile, usage, verifierResult}) {
  return Object.freeze({taskId, profile, usage: normalizeUsage(usage), verifierResult: verifierResult ?? 'UNKNOWN'});
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

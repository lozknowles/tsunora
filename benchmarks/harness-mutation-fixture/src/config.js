import {requireInteger} from './utils.js';

export function parseRuntimeConfig(input = {}) {
  return Object.freeze({
    maximumTurns: requireInteger(input.maximumTurns ?? 10, 'maximum_turns', 1, 64),
    timeoutMs: requireInteger(input.timeoutMs ?? 30_000, 'timeout_ms', 100, 600_000),
    verificationRequired: input.verificationRequired !== false,
  });
}

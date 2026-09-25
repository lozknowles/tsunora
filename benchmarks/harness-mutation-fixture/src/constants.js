export const DEFAULT_JOB_TIMEOUT_MS = 30_000;

export const JOB_STATES = Object.freeze([
  'CREATED',
  'ROUTED',
  'RUNNING',
  'VERIFICATION_PENDING',
  'SUCCEEDED',
  'FAILED',
]);

export const TERMINAL_JOB_STATES = Object.freeze(['SUCCEEDED', 'FAILED']);

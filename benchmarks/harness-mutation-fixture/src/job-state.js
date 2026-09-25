import {JOB_STATES, TERMINAL_JOB_STATES} from './constants.js';

const TRANSITIONS = Object.freeze({
  CREATED: ['ROUTED', 'FAILED'],
  ROUTED: ['RUNNING', 'FAILED'],
  RUNNING: ['VERIFICATION_PENDING', 'FAILED'],
  VERIFICATION_PENDING: ['SUCCEEDED', 'FAILED'],
});

export function transitionJob(current, next) {
  if (!JOB_STATES.includes(current) || !JOB_STATES.includes(next)) throw new Error('job_state_invalid');
  if (TERMINAL_JOB_STATES.includes(current)) throw new Error('terminal_state_transition_denied');
  if (!TRANSITIONS[current]?.includes(next)) throw new Error(`job_transition_denied:${current}:${next}`);
  return next;
}

export function completeJob(current, result) {
  if (current !== 'RUNNING') throw new Error('job_not_running');
  return result.modelComplete ? 'SUCCEEDED' : 'FAILED';
}

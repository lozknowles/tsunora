import type {HarnessProfileName} from './harness-efficiency.js';

export type RuntimeBudgetFailure =
  | 'JOB_DEADLINE_EXCEEDED'
  | 'MODEL_CALL_DEADLINE_EXCEEDED'
  | 'MODEL_NO_PROGRESS'
  | 'TOOL_DEADLINE_EXCEEDED'
  | 'TOOL_NO_PROGRESS'
  | 'TURN_BUDGET_EXHAUSTED'
  | 'TRANSPORT_TIMEOUT'
  | 'VERIFICATION_BUDGET_EXHAUSTED'
  | 'CLEANUP_TIMEOUT';

export interface RuntimeBudgetRequest {
  absoluteJobDeadlineMs?: number;
  modelCallDeadlineMs?: number;
  toolCallDeadlineMs?: number;
  noProgressDeadlineMs?: number;
  verificationReserveMs?: number;
  cleanupReserveMs?: number;
  terminalCompletionTurns?: number;
}

export interface RouteRuntimeCharacteristics {
  medianModelCallMs?: number;
  p95ModelCallMs?: number;
  evidenceIds?: string[];
  generationTokensPerSecond?: number;
  maximumOutputTokens?: number;
}

export type RuntimeBudgetAdmission = 'ADMITTED' | 'ADMITTED_WITH_CONSTRAINED_CAPACITY' | 'REQUIRES_BUDGET_OVERRIDE' | 'ROUTE_PROFILE_MISMATCH' | 'REJECTED';

export interface GovernedRuntimeBudget {
  schema: 'agent-control.governed-runtime-budget/v1';
  profile: HarnessProfileName;
  absoluteJobDeadlineMs: number;
  modelCallDeadlineMs: number;
  toolCallDeadlineMs: number;
  noProgressDeadlineMs: number;
  turnBudget: number;
  verificationReserveMs: number;
  cleanupReserveMs: number;
  terminalCompletionTurns: number;
  expectedModelCallMs: number;
  expectedCapacityTurns: number;
  admission: RuntimeBudgetAdmission;
  reasons: string[];
  source: 'PROFILE_DEFAULT' | 'POLICY_OVERRIDE';
  evidenceIds: string[];
}

const PROFILE = {
  THIN: {turns: 3, expectedModelCallMs: 60_000, toolCallDeadlineMs: 60_000, verificationReserveMs: 60_000, cleanupReserveMs: 30_000},
  STANDARD: {turns: 10, expectedModelCallMs: 90_000, toolCallDeadlineMs: 120_000, verificationReserveMs: 120_000, cleanupReserveMs: 60_000},
  DEEP: {turns: 32, expectedModelCallMs: 120_000, toolCallDeadlineMs: 300_000, verificationReserveMs: 300_000, cleanupReserveMs: 120_000},
} as const;

export const MAX_GOVERNED_ABSOLUTE_JOB_DEADLINE_MS = 8 * 60 * 60_000;

const LIMITS = {
  absoluteJobDeadlineMs: [10_000, MAX_GOVERNED_ABSOLUTE_JOB_DEADLINE_MS], modelCallDeadlineMs: [1_000, 30 * 60_000],
  toolCallDeadlineMs: [100, 30 * 60_000], noProgressDeadlineMs: [1_000, 30 * 60_000],
  verificationReserveMs: [0, 30 * 60_000], cleanupReserveMs: [0, 30 * 60_000], terminalCompletionTurns: [0, 1],
} as const;

function bounded(name: keyof typeof LIMITS, value: number) {
  const [minimum, maximum] = LIMITS[name];
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`runtime_budget_invalid:${name}`);
  return value;
}

export function resolveGovernedRuntimeBudget(profile: HarnessProfileName, request: RuntimeBudgetRequest = {}, route: RouteRuntimeCharacteristics = {}): GovernedRuntimeBudget {
  const policy = PROFILE[profile];
  const expectedModelCallMs = bounded('modelCallDeadlineMs', Math.round(route.p95ModelCallMs ?? route.medianModelCallMs ?? policy.expectedModelCallMs));
  const generationRate = route.generationTokensPerSecond;
  if (generationRate !== undefined && (!Number.isFinite(generationRate) || generationRate <= 0)) throw new Error('runtime_budget_invalid:generation_rate');
  if (route.maximumOutputTokens !== undefined && (!Number.isSafeInteger(route.maximumOutputTokens) || route.maximumOutputTokens < 1)) throw new Error('runtime_budget_invalid:maximum_output_tokens');
  const outputEnvelopeMs = generationRate && route.maximumOutputTokens ? Math.ceil(route.maximumOutputTokens / generationRate * 1_000) : 0;
  const evidenceBasedModelCallMs = Math.max(expectedModelCallMs * 4, expectedModelCallMs + Math.ceil(outputEnvelopeMs * 1.1));
  const modelCallDeadlineMs = bounded('modelCallDeadlineMs', request.modelCallDeadlineMs ?? Math.min(30 * 60_000, Math.max(120_000, evidenceBasedModelCallMs)));
  const toolCallDeadlineMs = bounded('toolCallDeadlineMs', request.toolCallDeadlineMs ?? policy.toolCallDeadlineMs);
  const noProgressDeadlineMs = bounded('noProgressDeadlineMs', request.noProgressDeadlineMs ?? Math.min(modelCallDeadlineMs, 5 * 60_000, Math.max(30_000, expectedModelCallMs * 3)));
  const verificationReserveMs = bounded('verificationReserveMs', request.verificationReserveMs ?? policy.verificationReserveMs);
  const cleanupReserveMs = bounded('cleanupReserveMs', request.cleanupReserveMs ?? policy.cleanupReserveMs);
  const terminalCompletionTurns = bounded('terminalCompletionTurns', request.terminalCompletionTurns ?? (profile === 'THIN' ? 1 : 0));
  const derivedAbsolute = policy.turns * expectedModelCallMs + policy.turns * Math.min(toolCallDeadlineMs, 30_000) + verificationReserveMs + cleanupReserveMs;
  const absoluteJobDeadlineMs = bounded('absoluteJobDeadlineMs', request.absoluteJobDeadlineMs ?? Math.min(MAX_GOVERNED_ABSOLUTE_JOB_DEADLINE_MS, Math.max(10 * 60_000, Math.ceil(derivedAbsolute * 1.2))));
  if (verificationReserveMs + cleanupReserveMs >= absoluteJobDeadlineMs) throw new Error('runtime_budget_invalid:terminal_reserve');
  if (noProgressDeadlineMs > modelCallDeadlineMs) throw new Error('runtime_budget_invalid:no_progress_exceeds_model_call');
  const availableWorkMs = absoluteJobDeadlineMs - verificationReserveMs - cleanupReserveMs;
  const expectedCapacityTurns = Math.max(0, Math.floor(availableWorkMs / Math.max(1, expectedModelCallMs + Math.min(toolCallDeadlineMs, 30_000))));
  const reasons: string[] = [];
  let admission: RuntimeBudgetAdmission = 'ADMITTED';
  if (expectedCapacityTurns < 1) { admission = 'REJECTED'; reasons.push('runtime_budget_cannot_support_one_turn'); }
  else if (expectedCapacityTurns < policy.turns) { admission = request.absoluteJobDeadlineMs === undefined ? 'ROUTE_PROFILE_MISMATCH' : 'ADMITTED_WITH_CONSTRAINED_CAPACITY'; reasons.push(`profile_turn_capacity:${expectedCapacityTurns}:${policy.turns}`); }
  if (admission !== 'REJECTED' && modelCallDeadlineMs < expectedModelCallMs) { admission = 'REQUIRES_BUDGET_OVERRIDE'; reasons.push(`model_call_budget_below_route_p95:${modelCallDeadlineMs}:${expectedModelCallMs}`); }
  return {schema:'agent-control.governed-runtime-budget/v1',profile,absoluteJobDeadlineMs,modelCallDeadlineMs,toolCallDeadlineMs,noProgressDeadlineMs,turnBudget:policy.turns,verificationReserveMs,cleanupReserveMs,terminalCompletionTurns,expectedModelCallMs,expectedCapacityTurns,admission,reasons,source:Object.keys(request).length?'POLICY_OVERRIDE':'PROFILE_DEFAULT',evidenceIds:[...(route.evidenceIds??[])]};
}

export interface RuntimeBudgetState {
  schema: 'agent-control.runtime-budget-state/v1';
  at: string;
  stage: 'MODEL' | 'TOOL' | 'VERIFICATION' | 'CLEANUP' | 'TERMINAL';
  turn: number;
  remainingTurns: number;
  jobElapsedMs: number;
  remainingJobMs: number;
  currentOperationElapsedMs: number;
  currentOperationDeadlineMs: number;
  lastMeaningfulProgressAt: string;
  noProgressWindowMs: number;
  verificationReserveMs: number;
  cleanupReserveMs: number;
  terminalAllowanceState: 'AVAILABLE' | 'IN_USE' | 'UNAVAILABLE';
  progressKind: 'REQUEST_STARTED' | 'PROVIDER_CONTENT' | 'MODEL_RESPONSE' | 'TOOL_DISPATCH' | 'TOOL_RESULT' | 'VERIFICATION' | 'CLEANUP';
}

export function runtimeBudgetError(code: RuntimeBudgetFailure) { const error = new Error(code); error.name = 'RuntimeBudgetError'; return error; }

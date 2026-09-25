export type ExecutionFailureKind = 'transient-transport' | 'expired-enrolment' | 'authentication-required' | 'permanent-configuration' | 'execution-failed';

export interface ExecutionFailureDisposition {
  kind: ExecutionFailureKind;
  retryable: boolean;
  humanActionRequired: boolean;
  safeReason: string;
}

const RULES: Array<{kind: ExecutionFailureKind; pattern: RegExp; reason: string}> = [
  {kind: 'authentication-required', pattern: /(?:codex_chatgpt_auth_required|interactive[_ -]?auth(?:entication)?[_ -]?required|login[_ -]?required|not[_ -]?logged[_ -]?in|http[_ -]?401|\bunauthori[sz]ed\b)/i, reason: 'authentication_required_for_selected_profile'},
  {kind: 'expired-enrolment', pattern: /(?:enrol(?:l)?ment|registration|device[_ -]?authorization).*(?:expired|revoked)|(?:expired|revoked).*(?:enrol(?:l)?ment|registration|device[_ -]?authorization)/i, reason: 'selected_profile_enrolment_expired'},
  {kind: 'transient-transport', pattern: /(?:transport[_ -]?failed|provider[_ -]?(?:timeout|unavailable|retry)|request[_ -]?timeout|timed?[_ -]?out|econnreset|econnrefused|enotfound|ehostunreach|network[_ -]?(?:error|unavailable)|connection[_ -]?(?:closed|lost)|http[_ -]?(?:408|425|429|500|502|503|504)|rate[_ -]?limit)/i, reason: 'transient_transport_failure'},
  {kind: 'permanent-configuration', pattern: /(?:configuration|unconfigured|profile[_ -]?(?:missing|unknown|invalid)|model[_ -]?(?:missing|unknown|invalid|unsupported)|provider[_ -]?(?:missing|unknown|invalid)|capability[_ -]?(?:missing|unsupported)|executable[_ -]?(?:missing|invalid))/i, reason: 'permanent_configuration_failure'},
];

export function classifyExecutionFailure(error: unknown): ExecutionFailureDisposition {
  const raw = error instanceof Error ? `${error.name}:${error.message}` : String(error);
  const matched = RULES.find(rule => rule.pattern.test(raw)), kind = matched?.kind ?? 'execution-failed';
  return {
    kind,
    retryable: kind === 'transient-transport' || kind === 'expired-enrolment',
    humanActionRequired: kind === 'authentication-required',
    safeReason: matched?.reason ?? 'execution_failed_without_safe_recovery_classification',
  };
}

export function boundedRecoveryDelay(attempt: number, initialSeconds: number, multiplier = 2, maximumSeconds = 60) {
  if (!Number.isSafeInteger(attempt) || attempt < 1 || !Number.isFinite(initialSeconds) || initialSeconds < 0 || !Number.isFinite(multiplier) || multiplier < 1 || !Number.isFinite(maximumSeconds) || maximumSeconds < 0) throw new Error('recovery_policy_invalid');
  return Math.min(initialSeconds * Math.pow(multiplier, attempt - 1), maximumSeconds) * 1000;
}

export function recoveryDeadlineAllows(now: Date, deadlineAt: string, delayMs: number) {
  const deadline = Date.parse(deadlineAt);
  return Number.isFinite(deadline) && now.getTime() + delayMs <= deadline;
}

import {redactSensitiveText} from './security-redaction.js';

export type FastExecutionFailureClassification = 'AUTHENTICATION' | 'PROVIDER' | 'TIMEOUT' | 'UNSUPPORTED_RUNTIME' | 'MODEL_ESCALATION' | 'EXECUTION_FAILED' | 'SCOPE_VIOLATION' | 'VERIFICATION_FAILED';

export function fastExecutionFailure(input: {status: 'SUCCEEDED' | 'FAILED' | 'ESCALATE'; summary: string; scopePassed: boolean; verificationPassed: boolean}) {
  if (input.status === 'SUCCEEDED' && input.scopePassed && input.verificationPassed) return {classification: null, reason: null};
  const detail = redactSensitiveText(input.summary).slice(0, 500), lower = detail.toLowerCase();
  if (/auth(?:entication|orization)?|credential|unauthorized|forbidden|\b401\b|\b403\b/.test(lower)) return {classification: 'AUTHENTICATION' as const, reason: detail};
  if (/provider|upstream|\b429\b|rate.?limit|quota|billing|credit/.test(lower)) return {classification: 'PROVIDER' as const, reason: detail};
  if (/timeout|timed out|deadline/.test(lower)) return {classification: 'TIMEOUT' as const, reason: detail};
  if (/unsupported|unavailable|not installed|not found|spawn/.test(lower)) return {classification: 'UNSUPPORTED_RUNTIME' as const, reason: detail};
  if (input.status === 'ESCALATE') return {classification: 'MODEL_ESCALATION' as const, reason: detail || 'model_requested_escalation'};
  if (input.status === 'FAILED') return {classification: 'EXECUTION_FAILED' as const, reason: detail || 'execution_failed_without_detail'};
  if (!input.scopePassed) return {classification: 'SCOPE_VIOLATION' as const, reason: 'output_touched_files_outside_the_frozen_scope'};
  return {classification: 'VERIFICATION_FAILED' as const, reason: detail || 'deterministic_verifier_failed'};
}

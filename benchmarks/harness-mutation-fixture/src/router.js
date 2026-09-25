const ORDER = Object.freeze(['THIN', 'STANDARD', 'DEEP']);

export function recommendProfile(signals) {
  if (signals.architectural || signals.ambiguity >= 0.7 || signals.risk === 'high') return 'DEEP';
  if (signals.knownExactTargets && signals.estimatedFiles <= 2 && signals.risk === 'low' && signals.deterministicVerifier) return 'THIN';
  return 'STANDARD';
}

export function routeProfile(signals, policy = {mode: 'OBSERVE'}) {
  const recommendedProfile = signals.requestedProfile ?? recommendProfile(signals);
  const appliedProfile = policy.mode === 'EXPERIMENT' && signals.requestedProfile ? signals.requestedProfile : 'STANDARD';
  return {recommendedProfile, appliedProfile, reason: appliedProfile === recommendedProfile ? 'profile_applied' : 'standard_fail_safe'};
}

export function nextContextAttempt(current, attempted, reason) {
  const next = ORDER[ORDER.indexOf(current) + 1];
  return next ? {action: 'ESCALATE', from: current, to: next, reason} : {action: 'REVIEW', from: current, reason};
}

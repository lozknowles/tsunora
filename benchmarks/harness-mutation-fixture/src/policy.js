const RISKS = new Set(['read', 'write', 'privileged', 'destructive']);

export function authorizeTool(input) {
  if (!input || typeof input !== 'object') throw new Error('authorization_input_invalid');
  const {owner, toolId, risk, grantedTools, approvedRisks, leaseGeneration, liveLeaseGeneration, ownershipGeneration, liveOwnershipGeneration} = input;
  if (owner !== 'agent') return {allowed: false, reason: 'human_owns_execution'};
  if (leaseGeneration !== liveLeaseGeneration) return {allowed: false, reason: 'stale_lease_generation'};
  if (ownershipGeneration !== liveOwnershipGeneration) return {allowed: false, reason: 'stale_ownership_generation'};
  if (typeof toolId !== 'string' || !Array.isArray(grantedTools) || !grantedTools.includes(toolId)) return {allowed: false, reason: 'tool_not_granted'};
  if (!RISKS.has(risk) || !Array.isArray(approvedRisks) || !approvedRisks.includes(risk)) return {allowed: false, reason: 'risk_not_approved'};
  return {allowed: true, reason: null};
}

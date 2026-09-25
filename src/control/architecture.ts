export const ARCHITECTURE_DOMAINS = [
  'policy_authority',
  'scheduling',
  'execution_substrate',
  'provider_model_adapter',
  'routing',
  'context_evidence',
  'verification_provenance',
  'operator_interface',
  'persistence',
  'observability',
] as const;
export type ArchitectureDomain = typeof ARCHITECTURE_DOMAINS[number];

export interface CapabilityProposal {
  name: string;
  domain: ArchitectureDomain;
  authoritativeComponent: string;
  extendsAbstraction: string;
  createsDuplicateState: boolean;
  createsSecondControlPath: boolean;
  throughControlBoundary: boolean;
  effects: {leases?: boolean; ownership?: boolean; ptys?: boolean; scheduler?: boolean; takeover?: boolean};
  failureMode: string;
  verificationEvidence: string[];
}
export interface IntegrityAssessment {accepted: boolean; violations: string[]; warnings: string[];}

export function assessConceptualIntegrity(proposal: CapabilityProposal): IntegrityAssessment {
  const violations: string[] = [], warnings: string[] = [];
  if (!proposal.name.trim()) violations.push('capability_name_required');
  if (!proposal.authoritativeComponent.trim()) violations.push('authoritative_component_required');
  if (!proposal.extendsAbstraction.trim()) violations.push('extended_abstraction_required');
  if (proposal.createsDuplicateState) violations.push('duplicate_authoritative_state_forbidden');
  if (proposal.createsSecondControlPath) violations.push('second_control_path_forbidden');
  const affectsAuthority = Object.values(proposal.effects).some(Boolean);
  if (affectsAuthority && !proposal.throughControlBoundary) violations.push('authority_effect_must_use_control_boundary');
  if (proposal.domain === 'operator_interface' && affectsAuthority && proposal.authoritativeComponent === 'operator_interface') violations.push('operator_interface_cannot_own_authority');
  if (proposal.domain === 'provider_model_adapter' && (proposal.effects.leases || proposal.effects.ownership || proposal.effects.scheduler || proposal.effects.takeover)) violations.push('provider_adapter_cannot_own_policy');
  if (!proposal.failureMode.trim()) violations.push('failure_mode_required');
  if (!proposal.verificationEvidence.length) violations.push('durable_verification_evidence_required');
  if (!affectsAuthority) warnings.push('non_authoritative_capability');
  return {accepted: violations.length === 0, violations, warnings};
}

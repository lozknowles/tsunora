import {randomUUID} from 'node:crypto';
import {appendEvent, defaultVerification, saveWorkspace, type LaneState, type VerificationEvidence, type VerificationEvidenceType, type VerificationPolicy, type WorkspaceState} from '../state.js';

export interface VerificationResult {ok: boolean; phase: LaneState['verification'] extends infer T ? T : never; reasons: string[];}
const ALLOWED_EVIDENCE_TYPES: VerificationEvidenceType[] = ['git_commit', 'diff', 'test_result', 'build_result', 'file_hash', 'api_result', 'ui_evidence', 'benchmark', 'external_source', 'human_approval'];

export class VerificationService {
  constructor(readonly state: WorkspaceState, private readonly persist: (state: WorkspaceState) => void = saveWorkspace) {}

  setPolicy(laneId: number, policy: VerificationPolicy) {
    if (policy.required.some(type => !ALLOWED_EVIDENCE_TYPES.includes(type))) throw new Error('invalid_verification_evidence_type');
    const lane = this.mustLane(laneId), verification = this.ensure(lane);
    verification.policy = {required: [...new Set(policy.required)], requireHumanAcceptance: policy.requireHumanAcceptance};
    verification.phase = verification.claim ? (verification.evidence.length ? 'evidence_collected' : 'claimed') : 'unclaimed';
    verification.verifiedAt = undefined;
    verification.acceptedAt = undefined;
    verification.acceptedBy = undefined;
    this.record('verification.policy-set', laneId, verification.policy);
    return verification;
  }

  claim(laneId: number, claim: string) {
    if (!claim.trim()) throw new Error('verification_claim_required');
    const lane = this.mustLane(laneId), verification = this.ensure(lane);
    verification.claim = claim.trim();
    verification.claimedAt = new Date().toISOString();
    verification.phase = verification.evidence.length ? 'evidence_collected' : 'claimed';
    verification.failureReasons = [];
    verification.verifiedAt = undefined;
    verification.acceptedAt = undefined;
    verification.acceptedBy = undefined;
    this.record('verification.claimed', laneId, {claim: verification.claim});
    return verification;
  }

  addEvidence(laneId: number, input: Omit<VerificationEvidence, 'id' | 'createdAt'> & {id?: string; createdAt?: string}) {
    if (!ALLOWED_EVIDENCE_TYPES.includes(input.type)) throw new Error('invalid_verification_evidence_type');
    if (!['passed', 'failed', 'observed'].includes(input.status)) throw new Error('invalid_verification_evidence_status');
    if (!input.description.trim()) throw new Error('verification_evidence_description_required');
    const lane = this.mustLane(laneId), verification = this.ensure(lane);
    const item: VerificationEvidence = {...input, id: input.id ?? `verification-${randomUUID()}`, createdAt: input.createdAt ?? new Date().toISOString()};
    if (verification.evidence.some(existing => existing.id === item.id)) throw new Error('verification_evidence_id_exists');
    verification.evidence.push(item);
    verification.phase = verification.claim ? 'evidence_collected' : 'unclaimed';
    verification.verifiedAt = undefined;
    verification.acceptedAt = undefined;
    verification.acceptedBy = undefined;
    this.record('verification.evidence-added', laneId, {id: item.id, type: item.type, status: item.status});
    return item;
  }

  verify(laneId: number) {
    const lane = this.mustLane(laneId), verification = this.ensure(lane), reasons: string[] = [];
    if (!verification.claim) reasons.push('claim_missing');
    for (const required of verification.policy.required) {
      const matching = verification.evidence.filter(item => item.type === required);
      if (!matching.length) reasons.push(`evidence_missing:${required}`);
      else if (!matching.some(item => item.status === 'passed')) reasons.push(`evidence_not_passed:${required}`);
    }
    if (verification.evidence.some(item => item.status === 'failed')) reasons.push('failed_evidence_present');
    verification.failureReasons = reasons;
    if (reasons.length) {
      verification.phase = verification.evidence.length ? 'evidence_collected' : verification.claim ? 'claimed' : 'unclaimed';
      verification.verifiedAt = undefined;
      this.record('verification.rejected', laneId, {reasons});
      return {ok: false, verification, reasons};
    }
    verification.phase = 'verified';
    verification.verifiedAt = new Date().toISOString();
    this.record('verification.verified', laneId, {evidenceIds: verification.evidence.map(item => item.id), model: lane.model, batonRevision: lane.baton.revision});
    return {ok: true, verification, reasons};
  }

  accept(laneId: number, actor: string) {
    const lane = this.mustLane(laneId), verification = this.ensure(lane);
    if (verification.phase !== 'verified') throw new Error('verification_required_before_acceptance');
    if (!actor.trim()) throw new Error('acceptance_actor_required');
    verification.phase = 'accepted';
    verification.acceptedAt = new Date().toISOString();
    verification.acceptedBy = actor;
    this.record('verification.accepted', laneId, {actor});
    return verification;
  }

  private ensure(lane: LaneState) { return lane.verification ??= defaultVerification(); }
  private mustLane(id: number) { const lane = this.state.lanes.find(item => item.id === id); if (!lane) throw new Error('lane_missing'); return lane; }
  private record(type: string, laneId: number, payload: unknown) { appendEvent(type, {laneId, payload}); this.persist(this.state); }
}

export function evidenceTypes(items: VerificationEvidence[]): VerificationEvidenceType[] { return [...new Set(items.map(item => item.type))]; }

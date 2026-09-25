import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {ContractExecutionRuntime, type ContractEvidence, type ContractExecution} from './contract-runtime.js';

export type HandoffOutcome = 'SACRIFICE' | 'SUBSTITUTE' | 'DELEGATE' | 'YIELD' | 'COMPLETE';
export type HandoffPolicy = 'AUTO' | 'MANUAL';

export interface HandoffTarget {
  active: ContractExecution['active'];
  process: {id: string; pid?: number};
  ptyId: string;
}

export interface HandoffRequest {
  outcome: HandoffOutcome;
  policy: HandoffPolicy;
  contractId: string;
  sourceActorId: string;
  sourceAgentId: string;
  target?: HandoffTarget;
  reason: string;
  baton: Record<string, unknown>;
  requestedAuthority: string[];
  budget: {tokens?: number; cost?: number; currency?: string};
  evidence?: ContractEvidence[];
  child?: {id?: string; objective: string; completionCriteria: string[]};
  risk?: {costlyEscalation?: boolean; productionWrite?: boolean; destructive?: boolean; expandedResourceEnvelope?: boolean};
}

export interface HandoffRecord {
  schema: 'agent-control.handoff/v1';
  id: string;
  outcome: HandoffOutcome;
  policy: HandoffPolicy;
  status: 'AWAITING_APPROVAL' | 'EXECUTING' | 'COMPLETED' | 'DENIED' | 'FAILED';
  contractId: string;
  childContractId?: string;
  originatingActorId: string;
  originatingAgentId: string;
  receivingActorId?: string;
  receivingAgentId?: string;
  reason: string;
  batonSha256: string;
  batonSizeBytes: number;
  authorityTransferred: string[];
  authorityWithheld: string[];
  budgetTransferred: {tokens?: number; cost?: number; currency?: string};
  stateBefore: string;
  stateAfter?: string;
  evidenceIds: string[];
  verificationOutcome: 'NOT_SUBMITTED' | 'PENDING' | 'PASSED' | 'FAILED';
  approvalReasons: string[];
  approvedBy?: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
  request: HandoffRequest;
}

interface HandoffSnapshot {schema: 'agent-control.handoffs/v1'; handoffs: HandoffRecord[];}

export class GovernedHandoffRuntime {
  private readonly records = new Map<string, HandoffRecord>();
  constructor(readonly contracts: ContractExecutionRuntime, readonly file?: string, readonly clock: () => string = () => new Date().toISOString()) { this.load(); }

  async request(input: HandoffRequest) {
    validateRequest(input); const contract = this.contracts.get(input.contractId); if (contract.active.actorId !== input.sourceActorId || contract.active.agentId !== input.sourceAgentId) throw new Error('handoff_source_identity_mismatch');
    const authorityTransferred = input.requestedAuthority.filter(value => contract.authority.includes(value)), authorityWithheld = input.requestedAuthority.filter(value => !contract.authority.includes(value));
    const approvalReasons = approvalReasonsFor(input, contract, authorityWithheld), canonical = stable(input.baton), at = this.clock();
    const record: HandoffRecord = {
      schema: 'agent-control.handoff/v1', id: `handoff:${randomUUID()}`, outcome: input.outcome, policy: input.policy, status: input.policy === 'MANUAL' || approvalReasons.length ? 'AWAITING_APPROVAL' : 'EXECUTING', contractId: input.contractId,
      originatingActorId: input.sourceActorId, originatingAgentId: input.sourceAgentId, receivingActorId: input.target?.active.actorId, receivingAgentId: input.target?.active.agentId, reason: input.reason,
      batonSha256: createHash('sha256').update(canonical).digest('hex'), batonSizeBytes: Buffer.byteLength(canonical), authorityTransferred, authorityWithheld, budgetTransferred: structuredClone(input.budget), stateBefore: contract.state,
      evidenceIds: unique((input.evidence ?? []).map(item => item.id)), verificationOutcome: 'NOT_SUBMITTED', approvalReasons, createdAt: at, request: structuredClone(input),
    };
    this.records.set(record.id, record); this.contracts.linkHandoff(contract.id, record.id, input.sourceActorId); this.save();
    if (record.status === 'EXECUTING') await this.execute(record.id);
    return this.get(record.id);
  }

  async approve(id: string, actorId: string) {
    const record = this.get(id); if (record.status !== 'AWAITING_APPROVAL') throw new Error('handoff_not_awaiting_approval'); const contract = this.contracts.get(record.contractId); if (actorId !== contract.operatorActorId) throw new Error('handoff_approval_not_authorized');
    record.approvedBy = actorId; record.status = 'EXECUTING'; this.records.set(id, record); this.save(); await this.execute(id); return this.get(id);
  }

  deny(id: string, actorId: string, reason: string) {
    const record = this.get(id); if (record.status !== 'AWAITING_APPROVAL') throw new Error('handoff_not_awaiting_approval'); const contract = this.contracts.get(record.contractId); if (actorId !== contract.operatorActorId) throw new Error('handoff_approval_not_authorized'); record.status = 'DENIED'; record.approvedBy = actorId; record.completedAt = this.clock(); record.error = bounded(reason); record.stateAfter = contract.state; this.records.set(id, record); this.save(); return this.get(id);
  }

  get(id: string) { const value = this.records.get(id); if (!value) throw new Error('handoff_missing'); return structuredClone(value); }
  list() { return [...this.records.values()].map(value => structuredClone(value)); }

  private async execute(id: string) {
    const record = this.get(id), request = record.request, parent = this.contracts.get(record.contractId);
    try {
      if (record.authorityWithheld.length && request.outcome !== 'COMPLETE' && !record.authorityTransferred.length) throw new Error('handoff_no_transferable_authority');
      switch (request.outcome) {
        case 'SACRIFICE': await this.contracts.sacrificeWorker(parent.id, request.sourceActorId, request.reason); break;
        case 'YIELD': await this.contracts.yieldWorker(parent.id, request.sourceActorId, request.reason); break;
        case 'SUBSTITUTE': {
          if (!request.target) throw new Error('handoff_target_required');
          await this.contracts.substituteWorker(parent.id, request.sourceActorId, {active: request.target.active, process: request.target.process, ptyId: request.target.ptyId, baton: request.baton, reason: request.reason}); break;
        }
        case 'DELEGATE': {
          if (!request.target || !request.child) throw new Error('handoff_child_required');
          this.contracts.allocateChildBudget(parent.id, request.budget.tokens, request.budget.cost);
          const child = this.contracts.create({id: request.child.id, laneId: parent.laneId, parentContractId: parent.id, operatorActorId: parent.operatorActorId, objective: request.child.objective, completionCriteria: request.child.completionCriteria, authority: record.authorityTransferred, protectedResources: parent.protectedResources, budget: {remainingTokens: request.budget.tokens, remainingCost: request.budget.cost, currency: request.budget.currency ?? parent.budget.currency, deadlineAt: parent.budget.deadlineAt}, active: request.target.active, baton: request.baton, process: request.target.process, ptyId: request.target.ptyId, attachments: parent.attachments, permissions: {...parent.permissions, capabilities: parent.permissions.capabilities.filter(value => record.authorityTransferred.includes(value))}});
          record.childContractId = child.id; this.contracts.linkHandoff(child.id, record.id, request.sourceActorId); break;
        }
        case 'COMPLETE': this.contracts.submitForVerification(parent.id, request.sourceActorId, request.evidence ?? []); record.verificationOutcome = 'PENDING'; break;
      }
      const after = this.contracts.get(record.childContractId ?? parent.id); record.stateAfter = after.state; record.status = 'COMPLETED'; record.completedAt = this.clock();
    } catch (error) { record.status = 'FAILED'; record.error = bounded(error instanceof Error ? error.message : String(error)); record.stateAfter = this.contracts.get(parent.id).state; record.completedAt = this.clock(); }
    this.records.set(id, record); this.save();
  }

  private load() { if (!this.file || !fs.existsSync(this.file)) return; const snapshot = JSON.parse(fs.readFileSync(this.file, 'utf8')) as HandoffSnapshot; if (snapshot.schema !== 'agent-control.handoffs/v1') throw new Error('handoff_snapshot_unsupported'); for (const record of snapshot.handoffs) this.records.set(record.id, record); }
  private save() { if (!this.file) return; fs.mkdirSync(path.dirname(this.file), {recursive: true}); const temporary = `${this.file}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify({schema: 'agent-control.handoffs/v1', handoffs: this.list()} satisfies HandoffSnapshot, null, 2)}\n`, {mode: 0o600}); fs.renameSync(temporary, this.file); }
}

function approvalReasonsFor(input: HandoffRequest, contract: ContractExecution, withheld: string[]) { const reasons: string[] = []; if (input.policy === 'MANUAL') reasons.push('manual_policy'); if (withheld.length) reasons.push('privilege_increase'); if (input.risk?.costlyEscalation) reasons.push('costly_escalation'); if (input.risk?.productionWrite || contract.permissions.production) reasons.push('production_write'); if (input.risk?.destructive) reasons.push('destructive_action'); if (input.risk?.expandedResourceEnvelope) reasons.push('expanded_resource_envelope'); if (input.budget.tokens !== undefined && (contract.budget.remainingTokens === undefined || input.budget.tokens > contract.budget.remainingTokens)) reasons.push('token_budget_expansion'); if (input.budget.cost !== undefined && (contract.budget.remainingCost === undefined || input.budget.cost > contract.budget.remainingCost)) reasons.push('cost_budget_expansion'); return unique(reasons); }
function validateRequest(input: HandoffRequest) { if (!['SACRIFICE','SUBSTITUTE','DELEGATE','YIELD','COMPLETE'].includes(input.outcome)) throw new Error('handoff_outcome_invalid'); if (!['AUTO','MANUAL'].includes(input.policy) || !input.reason.trim()) throw new Error('handoff_request_invalid'); if (['SUBSTITUTE','DELEGATE'].includes(input.outcome) && !input.target) throw new Error('handoff_target_required'); rejectSecrets(input); }
function rejectSecrets(value: unknown) { if (/(?:sk-[A-Za-z0-9_-]{12,}|bearer\s+[A-Za-z0-9._-]{12,}|api[_-]?key["']?\s*[:=]|password["']?\s*[:=]|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i.test(JSON.stringify(value))) throw new Error('handoff_secret_material_forbidden'); }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`; return JSON.stringify(value); }
function unique(values: string[]) { return [...new Set(values)]; }
function bounded(value: string, maximum = 2048) { if (!value.trim()) throw new Error('text_required'); return value.length <= maximum ? value : value.slice(0, maximum); }

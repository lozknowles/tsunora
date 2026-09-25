import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const TRANSPORT_CONTEXT_SCHEMA = 'agent-control.transport-context/v1';
export const TRANSPORT_INTEGRITY_SCHEMA = 'agent-control.transport-integrity/v1';

export type ContextDependencyStatus = 'SATISFIED' | 'MISSING' | 'STALE' | 'CONFLICTING' | 'UNRETRIEVABLE' | 'CLAIMED_NOT_LOADED';
export type TransportIntegrityState = 'COMPLETE' | 'DEGRADED' | 'BLOCKED' | 'ESCALATED';

export interface TransportContextContract {
  schema: typeof TRANSPORT_CONTEXT_SCHEMA;
  id: string;
  initiatingRequest: string;
  acceptanceCriteria: string[];
  repository: {identity: string; branch?: string; sha: string; dirty: boolean; diffState: string};
  scope: {description: string; files: string[]; omittedFiles: string[]; truncated: boolean};
  architectureConstraints: string[];
  runtimeTopology: {controller: string; sourceWorker?: string; destinationWorker?: string; provider?: string; model?: string};
  versions: Record<string, string>;
  policies: {permissions: string[]; prohibitedActions: string[]; limits: Record<string, number | string>};
  priorDecisions: string[];
  failures: string[];
  testsAndEvidence: string[];
  requiredArtifacts: string[];
  route: {provider: string; model: string; accountProfile?: string; node?: string; capabilities: string[]};
  tokenState: {contextTokens?: number; contextLimit?: number; lifetimeTokens?: number; cost?: number; authority: 'authoritative' | 'estimated' | 'unavailable'};
  security: {credentialResidency: string; referencesOnly: boolean};
  approvals: string[];
  provenance: {source: string; createdAt: string; freshAt: string};
}

export interface ContextDependency {
  id: string;
  required: boolean;
  source: string;
  provenance: string;
  freshness: {observedAt: string; maxAgeMs?: number};
  expectedIdentity?: string;
  expectedSha256?: string;
  observedIdentity?: string;
  observedSha256?: string;
  status: ContextDependencyStatus;
  detail?: string;
}

export interface TransportIntegrityRecord {
  schema: typeof TRANSPORT_INTEGRITY_SCHEMA;
  id: string;
  parcelId: string;
  contract: TransportContextContract;
  contractSha256: string;
  dependencies: ContextDependency[];
  state: TransportIntegrityState;
  score: number;
  requiredSatisfied: string[];
  missing: string[];
  staleOrConflicting: string[];
  sourceWorker?: string;
  destinationWorker?: string;
  batonSha256?: string;
  verificationMethod: string;
  reason: string;
  remediation: string[];
  transitions: Array<{at: string; from?: TransportIntegrityState; to: TransportIntegrityState; reason: string}>;
  repairs: Array<{at: string; dependencyId: string; source: string; result: ContextDependencyStatus; evidenceId?: string}>;
  independentInspection?: {inspectorId: string; generatorId: string; independent: boolean; method: string; at: string; result: 'PASSED' | 'FAILED'};
  createdAt: string;
  updatedAt: string;
}

interface Snapshot {version: 1; records: TransportIntegrityRecord[];}
const secret = /(?:sk-[A-Za-z0-9_-]{12,}|bearer\s+[A-Za-z0-9._-]{12,}|(?:api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,;]+|-----BEGIN [A-Z ]*PRIVATE KEY-----)/gi;
const bounded = (value: string) => value.replace(secret, '[REDACTED]').slice(0, 12_000);
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
export const canonicalTransportContext = (contract: TransportContextContract) => stable(contract);
export const transportContextSha256 = (contract: TransportContextContract) => createHash('sha256').update(canonicalTransportContext(contract)).digest('hex');

export function createTransportContext(input: Omit<TransportContextContract, 'schema' | 'id'> & {id?: string}): TransportContextContract {
  return {...structuredClone(input), schema: TRANSPORT_CONTEXT_SCHEMA, id: input.id ?? `transport-context:${randomUUID()}`, initiatingRequest: bounded(input.initiatingRequest), acceptanceCriteria: input.acceptanceCriteria.map(bounded), architectureConstraints: input.architectureConstraints.map(bounded), priorDecisions: input.priorDecisions.map(bounded), failures: input.failures.map(bounded), testsAndEvidence: input.testsAndEvidence.map(bounded), requiredArtifacts: input.requiredArtifacts.map(bounded), approvals: input.approvals.map(bounded)};
}

/** Deterministic checks shared by controller and destination; providers do not define gate semantics. */
export function verifyContextDependencies(input: ContextDependency[], at = Date.now()): ContextDependency[] {
  return input.map(item => {
    if (item.status !== 'SATISFIED') return structuredClone(item);
    if (item.freshness.maxAgeMs !== undefined && at - Date.parse(item.freshness.observedAt) > item.freshness.maxAgeMs) return {...item, status: 'STALE' as const, detail: 'freshness window exceeded'};
    if (item.expectedIdentity !== undefined && item.observedIdentity !== undefined && item.expectedIdentity !== item.observedIdentity) return {...item, status: 'CONFLICTING' as const, detail: 'identity mismatch'};
    if (item.expectedSha256 !== undefined && item.observedSha256 !== undefined && item.expectedSha256 !== item.observedSha256) return {...item, status: 'CONFLICTING' as const, detail: 'hash mismatch'};
    return structuredClone(item);
  });
}

function assess(dependencies: ContextDependency[], previous?: TransportIntegrityState): Pick<TransportIntegrityRecord, 'state' | 'score' | 'requiredSatisfied' | 'missing' | 'staleOrConflicting' | 'reason' | 'remediation'> {
  const required = dependencies.filter(item => item.required), satisfied = required.filter(item => item.status === 'SATISFIED'), missing = required.filter(item => item.status === 'MISSING' || item.status === 'UNRETRIEVABLE' || item.status === 'CLAIMED_NOT_LOADED').map(item => item.id), staleOrConflicting = required.filter(item => item.status === 'STALE' || item.status === 'CONFLICTING').map(item => item.id);
  const score = required.length ? Math.round((satisfied.length / required.length) * 100) : 100;
  if (missing.length) return {state: 'BLOCKED', score, requiredSatisfied: satisfied.map(item => item.id), missing, staleOrConflicting, reason: `Required transport context unavailable: ${missing.join(', ')}`, remediation: missing.map(id => `Load or supply ${id} from its declared source before execution.`)};
  if (staleOrConflicting.length) return {state: 'ESCALATED', score, requiredSatisfied: satisfied.map(item => item.id), missing: [], staleOrConflicting, reason: `Required transport context is stale or contradictory: ${staleOrConflicting.join(', ')}`, remediation: staleOrConflicting.map(id => `Refresh and independently verify ${id}; do not improvise.`)};
  const optionalProblems = dependencies.filter(item => !item.required && item.status !== 'SATISFIED');
  if (optionalProblems.length) return {state: 'DEGRADED', score, requiredSatisfied: satisfied.map(item => item.id), missing: [], staleOrConflicting: optionalProblems.map(item => item.id), reason: 'All required context is present; optional context is unavailable.', remediation: optionalProblems.map(item => `Record omission of optional context ${item.id}.`)};
  return {state: previous === 'DEGRADED' ? 'DEGRADED' : 'COMPLETE', score, requiredSatisfied: satisfied.map(item => item.id), missing: [], staleOrConflicting: [], reason: 'All declared required transport context is present and fresh.', remediation: []};
}

export class TransportIntegrityRuntime {
  private readonly records = new Map<string, TransportIntegrityRecord>();
  constructor(readonly file?: string) { this.load(); }
  create(parcelId: string, contract: TransportContextContract, dependencies: ContextDependency[], workers: {source?: string; destination?: string} = {}) {
    if (this.records.has(parcelId)) return structuredClone(this.records.get(parcelId)!);
    const at = new Date().toISOString(), checked = verifyContextDependencies(dependencies), result = assess(checked);
    const record: TransportIntegrityRecord = {schema: TRANSPORT_INTEGRITY_SCHEMA, id: `transport-integrity:${randomUUID()}`, parcelId, contract: structuredClone(contract), contractSha256: transportContextSha256(contract), dependencies: checked, ...result, sourceWorker: workers.source, destinationWorker: workers.destination, verificationMethod: 'deterministic-contract-and-dependency-verification', transitions: [{at, to: result.state, reason: result.reason}], repairs: [], createdAt: at, updatedAt: at};
    this.records.set(parcelId, record); this.save(); return structuredClone(record);
  }
  evaluate(parcelId: string, dependencies: ContextDependency[], reason = 'Re-evaluated declared transport dependencies') {
    const record = this.must(parcelId), previous = record.state, checked = verifyContextDependencies(dependencies), result = assess(checked, previous), at = new Date().toISOString();
    record.dependencies = checked; Object.assign(record, result); record.updatedAt = at;
    if (previous !== result.state) record.transitions.push({at, from: previous, to: result.state, reason: bounded(reason)});
    this.save(); return structuredClone(record);
  }
  bindBaton(parcelId: string, batonSha256: string, destinationWorker?: string) { const record = this.must(parcelId); record.batonSha256 = batonSha256; record.destinationWorker = destinationWorker ?? record.destinationWorker; record.updatedAt = new Date().toISOString(); this.save(); return structuredClone(record); }
  repair(parcelId: string, dependencyId: string, result: ContextDependencyStatus, source: string, evidenceId?: string) { const record = this.must(parcelId); record.repairs.push({at: new Date().toISOString(), dependencyId, source: bounded(source), result, ...(evidenceId ? {evidenceId} : {})}); this.save(); return structuredClone(record); }
  independentInspection(parcelId: string, input: {inspectorId: string; generatorId: string; method: string; result: 'PASSED' | 'FAILED'}) { const record = this.must(parcelId); const independent = input.inspectorId !== input.generatorId; record.independentInspection = {...input, independent, at: new Date().toISOString()}; if (!independent) { record.state = 'ESCALATED'; record.reason = 'Generator cannot be sole release approver.'; record.remediation = ['Use a distinct verifier role, provider, model or deterministic verifier.']; } this.save(); return structuredClone(record); }
  get(parcelId: string) { return this.records.has(parcelId) ? structuredClone(this.records.get(parcelId)!) : undefined; }
  list() { return [...this.records.values()].map(value => structuredClone(value)); }
  private must(id: string) { const value = this.records.get(id); if (!value) throw new Error('transport_integrity_record_missing'); return value; }
  private load() { if (!this.file || !fs.existsSync(this.file)) return; const snapshot = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Snapshot; if (snapshot.version !== 1) throw new Error('transport_integrity_snapshot_unsupported'); for (const record of snapshot.records) this.records.set(record.parcelId, record); }
  private save() { if (!this.file) return; fs.mkdirSync(path.dirname(this.file), {recursive: true}); const temporary = `${this.file}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify({version: 1, records: this.list()} satisfies Snapshot, null, 2)}\n`, {mode: 0o600}); fs.renameSync(temporary, this.file); }
}

export function dependency(input: Omit<ContextDependency, 'status'> & {status?: ContextDependencyStatus}): ContextDependency { return {...input, status: input.status ?? 'SATISFIED'}; }

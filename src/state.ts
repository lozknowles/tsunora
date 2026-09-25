import fs from 'node:fs';
import path from 'node:path';
import type {CapabilityRequest} from './control/capabilities.js';
import type {RouteDecision} from './control/routing.js';

export type Mode = 'auto' | 'manual';
export type LaneStatus = 'working' | 'idle' | 'waiting' | 'paused' | 'cancelled' | 'error';
export type VerificationPhase = 'unclaimed' | 'claimed' | 'evidence_collected' | 'verified' | 'accepted';
export type VerificationEvidenceType = 'git_commit' | 'diff' | 'test_result' | 'build_result' | 'file_hash' | 'api_result' | 'ui_evidence' | 'benchmark' | 'external_source' | 'human_approval';

export interface VerificationEvidence {
  id: string;
  type: VerificationEvidenceType;
  description: string;
  status: 'passed' | 'failed' | 'observed';
  reference?: string;
  hash?: string;
  createdAt: string;
}
export interface VerificationPolicy {required: VerificationEvidenceType[]; requireHumanAcceptance?: boolean;}
export interface LaneVerification {
  phase: VerificationPhase;
  claim?: string;
  claimedAt?: string;
  policy: VerificationPolicy;
  evidence: VerificationEvidence[];
  verifiedAt?: string;
  acceptedAt?: string;
  acceptedBy?: string;
  failureReasons: string[];
}
export interface HardContract {version: 2; laneId: number; goal: string; constraints: string[]; cwd: string; priority: number; mode: Mode; capabilities: CapabilityRequest; resourceLocks?: {host?: string | null; harness?: string | null; provider?: string | null; model?: string | null}; modelLock: string | null; sharedTaskIds: string[]; git?: {branch?: string; head?: string; dirtyFiles?: string[]}; updatedAt: string;}
export interface Baton {version: 1; laneId: number; revision: number; status: string; progress: string[]; hypothesis: string; evidence: string[]; changes: string[]; nextAction: string; openQuestions: string[]; model: string; reasoning: string; contextSourceIds?: string[]; updatedAt: string;}
export interface Lease {laneId: number; holder: string | null; acquiredAt: string | null; expiresAt: string | null;}
export interface LaneState {id: number; name: string; status: LaneStatus; statusBeforeSystemPause?: LaneStatus; model: string; reasoning: string; context: string; contract: HardContract; baton: Baton; lease: Lease; lines: string[]; verification?: LaneVerification; routing?: RouteDecision;}
export interface WorkspaceState {version: 1; paused: boolean; lastRestorePoint: string | null; lanes: LaneState[];}

const ROOT = process.env.AGENT_CONTROL_STATE_DIR || path.resolve('.agent-control');
const WORKSPACE = path.join(ROOT, 'workspace.json');
function ensureDir(p: string) { fs.mkdirSync(p, {recursive: true}); }
function writeJsonAtomic(file: string, value: unknown) { ensureDir(path.dirname(file)); const tmp = `${file}.tmp`; fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600}); fs.renameSync(tmp, file); fs.chmodSync(file, 0o600); }
export function defaultCapabilities(): CapabilityRequest { return {requires: [], prefers: []}; }
export function defaultVerification(): LaneVerification { return {phase: 'unclaimed', policy: {required: []}, evidence: [], failureReasons: []}; }
export function migrateContract(raw: any): HardContract { if (raw?.version === 2) return {...raw, capabilities: raw.capabilities ?? defaultCapabilities()}; return {...raw, version: 2, capabilities: defaultCapabilities(), resourceLocks: {model: raw?.modelLock ?? null}}; }
function migrateWorkspace(raw: any): WorkspaceState { return {...raw, lanes: (raw.lanes ?? []).map((lane: any) => ({...lane, contract: migrateContract(lane.contract), verification: lane.verification ?? defaultVerification()}))}; }
export function appendEvent(type: string, payload: unknown) { ensureDir(ROOT); const file = path.join(ROOT, 'events.jsonl'); fs.appendFileSync(file, `${JSON.stringify({at: new Date().toISOString(), type, payload})}\n`, {mode: 0o600}); fs.chmodSync(file, 0o600); }
export function saveWorkspace(state: WorkspaceState) { writeJsonAtomic(WORKSPACE, state); for (const lane of state.lanes) { const dir = path.join(ROOT, 'lanes', `lane-${String(lane.id).padStart(3, '0')}`); writeJsonAtomic(path.join(dir, 'contract.json'), lane.contract); writeJsonAtomic(path.join(dir, 'baton.json'), lane.baton); writeJsonAtomic(path.join(dir, 'lease.json'), lane.lease); writeJsonAtomic(path.join(dir, 'verification.json'), lane.verification ?? defaultVerification()); } }
export function loadWorkspace(fallback: WorkspaceState): WorkspaceState { if (!fs.existsSync(WORKSPACE)) { saveWorkspace(fallback); return fallback; } const state = migrateWorkspace(JSON.parse(fs.readFileSync(WORKSPACE, 'utf8'))); saveWorkspace(state); return state; }
export function checkpoint(state: WorkspaceState, reason: string) { const id = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14), dir = path.join(ROOT, 'checkpoints', id); ensureDir(dir); writeJsonAtomic(path.join(dir, 'workspace.json'), state); appendEvent('checkpoint', {id, reason}); state.lastRestorePoint = id; saveWorkspace(state); return id; }
export function batonHealth(baton: Baton) { const age = Date.now() - Date.parse(baton.updatedAt); if (age < 30000) return {icon: '●', label: 'CURRENT', age}; if (age < 120000) return {icon: '●', label: 'AGING', age}; return {icon: '●', label: 'STALE', age}; }
export function touchBaton(lane: LaneState, patch: Partial<Baton>) { lane.baton = {...lane.baton, ...patch, revision: lane.baton.revision + 1, updatedAt: new Date().toISOString()}; appendEvent('baton.updated', {laneId: lane.id, revision: lane.baton.revision}); }

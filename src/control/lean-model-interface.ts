import {createHash} from 'node:crypto';
import type {ContextPacketSource} from './harness-efficiency.js';

export type LeanToolEffect = 'inspect' | 'mutate' | 'verify' | 'terminal';
export interface LeanExecutionPolicy {
  toolEffects: Readonly<Record<string, LeanToolEffect>>;
  requiredChangedPaths: readonly string[];
  terminalAllowance: boolean;
}

/** Per-dispatch state, owned by the dispatcher. No state is accepted from model text. */
export class LeanExecutionState {
  private inspected = false;
  private mutated = false;
  private verified = false;
  private readonly unresolvedFailures = new Set<string>();
  private operationKey = '';
  private changedPaths = new Set<string>();
  private allowance = false;
  private finished = false;
  private terminalId: string | undefined;
  private calls = 0;
  private readonly policy: LeanExecutionPolicy;

  constructor(policy: LeanExecutionPolicy) {
    this.policy = structuredClone(policy);
    if (!Object.values(policy.toolEffects).every(effect => ['inspect', 'mutate', 'verify', 'terminal'].includes(effect))) throw new Error('lean_policy_effect_invalid');
  }

  allowed(id: string): boolean {
    if (this.finished) return false;
    const effect = Object.hasOwn(this.policy.toolEffects, id) ? this.policy.toolEffects[id] : undefined;
    if (this.allowance) return effect === 'terminal';
    if (effect === 'terminal') return true; // Safely blocked finish remains possible; never verifier acceptance.
    if (effect === 'inspect') return true;
    if (effect === 'mutate') return this.inspected && !this.verified;
    if (effect === 'verify') return this.mutated && !this.verified;
    return false;
  }

  before(id: string, input?: unknown): void {
    if (!this.allowed(id)) throw new Error(`tool_policy_denied:lean_stage:${id}`);
    this.calls++;
    this.operationKey = JSON.stringify([id, input ?? null]);
    if (this.policy.toolEffects[id] === 'mutate') this.verified = false;
  }

  after(id: string, output: unknown, failed = false): void {
    const value = output && typeof output === 'object' ? output as Record<string, unknown> : {};
    const effect = this.policy.toolEffects[id];
    if (failed || value.ok === false || effect === 'verify' && (value.passed !== true || value.exitCode !== 0 || value.timedOut !== false || value.cancelled !== false)) {
      this.unresolvedFailures.add(this.operationKey); this.verified = false; return;
    }
    this.unresolvedFailures.delete(this.operationKey);
    if (effect === 'inspect') this.inspected = true;
    if (effect === 'mutate' && value.ok === true && Array.isArray(value.changedFiles)) {
      this.mutated = true;
      this.changedPaths = new Set(value.changedFiles.filter((item): item is string => typeof item === 'string'));
    }
    if (effect === 'verify') this.verified = true;
    if (effect === 'terminal') { this.finished = true; this.terminalId = id; }
  }

  beginTerminalAllowance(workBudget: number): boolean {
    if (!this.policy.terminalAllowance || this.allowance || this.finished || this.calls !== workBudget || !this.inspected || !this.mutated || !this.verified || this.unresolvedFailures.size > 0 || !this.policy.requiredChangedPaths.every(path => this.changedPaths.has(path))) return false;
    this.allowance = true;
    return true;
  }

  get allowanceGranted(): boolean { return this.allowance; }
  get completed(): boolean { return this.finished; }
  get completedTerminalTool(): string | undefined { return this.terminalId; }
}

export type ContextVisibility = 'MODEL_REQUIRED' | 'MODEL_ON_DEMAND' | 'RUNTIME_ONLY' | 'EVIDENCE_ONLY';
export interface LeanContextItem {source: ContextPacketSource; visibility: ContextVisibility;}

/** Only already-authorised context can enter this vault. Recheck authority on every expansion. */
export class LeanContextVault {
  private readonly entries: Map<string, LeanContextItem>;
  constructor(entries: LeanContextItem[], private readonly assertActive: () => void) {
    if (new Set(entries.map(item => item.source.id)).size !== entries.length) throw new Error('lean_context_duplicate_id');
    this.entries = new Map(entries.map(item => [item.source.id, structuredClone(item)]));
  }
  expand(id: string): ContextPacketSource {
    this.assertActive();
    const item = this.entries.get(id);
    if (!item || !['MODEL_REQUIRED', 'MODEL_ON_DEMAND'].includes(item.visibility)) throw new Error('tool_policy_denied:lean_context_not_exposable');
    return structuredClone(item.source);
  }
}

/** Omit only an exact duplicate of the dispatcher-supplied tool catalogue. All task instructions survive. */
export function leanContextSources(sources: ContextPacketSource[], completeSchemaJson: string): ContextPacketSource[] {
  return sources.filter(source => !(source.kind === 'tool_schemas' && source.content === completeSchemaJson));
}

export interface LeanResultProjection {rawSha256: string; rawBytes: number; modelBytes: number; transformation: string; content: string;}

/** Lossless duplicate references point backward to content still present in the same model history. */
export class LeanResultProjector {
  private readonly previous = new Map<string, {turn: number; content: string}>();
  project(output: unknown, turn: number): LeanResultProjection {
    const raw = JSON.stringify(output);
    const hash = createHash('sha256').update(raw).digest('hex');
    const previous = this.previous.get(hash);
    let content = raw, transformation = 'IDENTITY';
    if (previous?.content === raw) {
      const reference = JSON.stringify({unchangedToolResult: {turn: previous.turn}, detail: 'Exact result already present in this conversation; use that result.'});
      if (reference.length < raw.length) { content = reference; transformation = 'EXACT_RETAINED_HISTORY_REFERENCE'; }
    } else this.previous.set(hash, {turn, content: raw});
    return {rawSha256: hash, rawBytes: Buffer.byteLength(raw), modelBytes: Buffer.byteLength(content), transformation, content};
  }
}

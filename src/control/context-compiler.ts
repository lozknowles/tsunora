import {createHash, randomUUID} from 'node:crypto';
import {estimateTokens} from './token-aware-output.js';

export type ContextCompilerTier = 'E2B' | 'E4B' | 'LUNA' | 'SOL';
export type ContextTaskClass = 'simple' | 'bounded' | 'complex' | 'repo-wide' | 'high-risk';
export type ContextEvidenceKind = 'repository-map' | 'git-diff' | 'compiler-failure' | 'test-failure' | 'stack-trace' | 'log' | 'symbol' | 'source';
export type ContextRisk = 'architecture' | 'concurrency' | 'security' | 'destructive' | 'database-migration' | 'uncertain-api' | 'repo-wide';

export interface SourceRange {path: string; startLine: number; endLine: number;}
export interface ContextEvidence {
  id: string;
  kind: ContextEvidenceKind;
  content: string;
  sha256?: string;
  path?: string;
  startLine?: number;
  endLine?: number;
  symbol?: string;
  required?: boolean;
}

export interface ContextCompilerInput {
  task: string;
  repositoryMap?: string;
  gitDiff?: string;
  compilerFailures?: string[];
  testFailures?: string[];
  stackTraces?: string[];
  logs?: string[];
  symbols?: Array<{name: string; path?: string; content?: string}>;
  sourceExcerpts: ContextEvidence[];
  risks?: ContextRisk[];
  failedAttempts?: number;
}

export interface ContextCompilerOutput {
  taskClass: ContextTaskClass;
  suspectedFiles: string[];
  relevantSymbols: string[];
  hypotheses: string[];
  evidence: string[];
  requiredSourceRanges: SourceRange[];
  testsAffected: string[];
  uncertainties: string[];
  confidence: number;
  recommendedTier: ContextCompilerTier;
  escalationReason: string;
}

export interface RetainedContextEvidence extends Required<Pick<ContextEvidence, 'id' | 'kind' | 'content' | 'sha256'>> {
  path?: string;
  startLine?: number;
  endLine?: number;
  symbol?: string;
  required: boolean;
  estimatedTokens: number;
}

export interface ContextPacket {
  schema: 'agent-control.context-compiler-packet/v1';
  id: string;
  task: string;
  compiler: {tier: 'E2B' | 'E4B'; model: string; analysis: ContextCompilerOutput};
  exactEvidence: RetainedContextEvidence[];
  originalContextTokens: number;
  compilerOutputTokens: number;
  packetTokens: number;
  contextReductionRatio: number;
  omittedEvidenceIds: string[];
  createdAt: string;
}

export interface ContextVerificationResult {passed: boolean; independent: boolean; verifierId: string; evidenceIds: string[]; detail: string;}
export interface ContextTierUsage {inputTokens: number | null; outputTokens: number | null; cost: number | null; currency: string | null; elapsedMs: number;}
export interface ContextTierResult {
  tier: ContextCompilerTier;
  model: string;
  analysis?: ContextCompilerOutput;
  result?: string;
  selectedEvidenceIds?: string[];
  usage: ContextTierUsage;
}
export interface ContextTierExecutor {execute(request: ContextTierRequest): Promise<ContextTierResult>;}
export interface ContextTierRequest {
  tier: ContextCompilerTier;
  input: ContextCompilerInput;
  packet?: ContextPacket;
  /** Stronger models receive Gemma analysis plus exact evidence, never a summary-only substitute. */
  prompt: string;
}
export interface ContextVerifier {verify(result: ContextTierResult, packet: ContextPacket): Promise<ContextVerificationResult>;}

export interface RoutingDecisionEvent {
  at: string;
  type: 'stage-started' | 'stage-completed' | 'escalated' | 'verification' | 'finished';
  tier: ContextCompilerTier;
  model?: string;
  reason: string;
  confidence?: number;
  originalContextTokens: number;
  contextPacketTokens?: number;
  retainedEvidenceIds: string[];
  usage?: ContextTierUsage;
  verification?: ContextVerificationResult;
}
export interface ContextPipelineResult {
  schema: 'agent-control.context-compiler-run/v1';
  status: 'VERIFIED' | 'FAILED';
  initialTier: ContextCompilerTier;
  finalTier: ContextCompilerTier;
  result?: string;
  packet: ContextPacket;
  trail: RoutingDecisionEvent[];
  invocations: ContextTierResult[];
  finalVerification: ContextVerificationResult;
}

export interface ContextCompilerPolicyOptions {
  e2bLocalConfidence?: number;
  e4bLocalConfidence?: number;
  maximumLocalFiles?: number;
  maximumLocalSymbols?: number;
  maximumLocalPacketTokens?: number;
  maximumAttempts?: number;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export function normalizeCompilerOutput(output: ContextCompilerOutput): ContextCompilerOutput {
  if (!Number.isFinite(output.confidence)) throw new Error('context_compiler_confidence_invalid');
  return {...output, confidence: clamp(output.confidence), suspectedFiles: unique(output.suspectedFiles), relevantSymbols: unique(output.relevantSymbols), hypotheses: unique(output.hypotheses), evidence: unique(output.evidence), testsAffected: unique(output.testsAffected), uncertainties: unique(output.uncertainties)};
}

export function collectContextEvidence(input: ContextCompilerInput): RetainedContextEvidence[] {
  const evidence: ContextEvidence[] = [...input.sourceExcerpts];
  const add = (kind: ContextEvidenceKind, id: string, content?: string) => { if (content?.trim()) evidence.push({id, kind, content, required: false}); };
  add('repository-map', 'repository-map', input.repositoryMap);
  add('git-diff', 'git-diff', input.gitDiff);
  input.compilerFailures?.forEach((content, index) => add('compiler-failure', `compiler-failure-${index + 1}`, content));
  input.testFailures?.forEach((content, index) => add('test-failure', `test-failure-${index + 1}`, content));
  input.stackTraces?.forEach((content, index) => add('stack-trace', `stack-trace-${index + 1}`, content));
  input.logs?.forEach((content, index) => add('log', `log-${index + 1}`, content));
  input.symbols?.forEach((symbol, index) => { if (symbol.content?.trim()) evidence.push({id: `symbol-${index + 1}`, kind: 'symbol', content: symbol.content, path: symbol.path, symbol: symbol.name}); });
  const ids = new Set<string>();
  return evidence.map(item => {
    if (!item.id.trim() || ids.has(item.id)) throw new Error(`context_evidence_id_invalid:${item.id}`);
    ids.add(item.id);
    if (!item.content) throw new Error(`context_evidence_content_required:${item.id}`);
    if ((item.startLine === undefined) !== (item.endLine === undefined)) throw new Error(`context_evidence_range_incomplete:${item.id}`);
    if (item.startLine !== undefined && (!item.path || item.startLine < 1 || item.endLine! < item.startLine)) throw new Error(`context_evidence_range_invalid:${item.id}`);
    const sha256 = hash(item.content);
    if (item.sha256 && item.sha256 !== sha256) throw new Error(`context_evidence_hash_mismatch:${item.id}`);
    return {...item, sha256, required: Boolean(item.required), estimatedTokens: estimateTokens(item.content)} as RetainedContextEvidence;
  });
}

export function buildContextPacket(input: ContextCompilerInput, tier: 'E2B' | 'E4B', model: string, rawOutput: ContextCompilerOutput, selectedEvidenceIds?: string[], now = new Date().toISOString()): ContextPacket {
  const output = normalizeCompilerOutput(rawOutput), all = collectContextEvidence(input), requested = unique([...(selectedEvidenceIds ?? []), ...output.evidence, ...all.filter(item => item.required).map(item => item.id)]);
  if (!requested.length) throw new Error('context_packet_exact_evidence_required');
  const byId = new Map(all.map(item => [item.id, item])), missing = requested.filter(id => !byId.has(id));
  if (missing.length) throw new Error(`context_packet_evidence_missing:${missing.join(',')}`);
  const exactEvidence = requested.map(id => byId.get(id)!);
  for (const range of output.requiredSourceRanges) {
    const retained = exactEvidence.some(item => item.path === range.path && item.startLine !== undefined && item.startLine <= range.startLine && item.endLine! >= range.endLine);
    if (!retained) throw new Error(`context_packet_required_range_missing:${range.path}:${range.startLine}-${range.endLine}`);
  }
  const originalContextTokens = estimateTokens(input.task) + all.reduce((sum, item) => sum + item.estimatedTokens, 0);
  const compilerOutputTokens = estimateTokens(JSON.stringify(output));
  const packetTokens = estimateTokens(input.task) + compilerOutputTokens + exactEvidence.reduce((sum, item) => sum + item.estimatedTokens, 0);
  return {
    schema: 'agent-control.context-compiler-packet/v1', id: `context-compiler-${hash(`${tier}:${model}:${input.task}:${exactEvidence.map(item => item.sha256).join(':')}`).slice(0, 20)}`,
    task: input.task, compiler: {tier, model, analysis: output}, exactEvidence, originalContextTokens, compilerOutputTokens, packetTokens,
    contextReductionRatio: originalContextTokens ? Math.max(0, 1 - packetTokens / originalContextTokens) : 0,
    omittedEvidenceIds: all.filter(item => !requested.includes(item.id)).map(item => item.id), createdAt: now,
  };
}

export function strongerModelPrompt(packet: ContextPacket): string {
  return [
    packet.task,
    '',
    'CONTEXT COMPILER ANALYSIS (advisory; verify independently):',
    JSON.stringify(packet.compiler.analysis, null, 2),
    '',
    'EXACT RETAINED SOURCE AND EVIDENCE (authoritative):',
    ...packet.exactEvidence.map(item => `--- ${item.id}${item.path ? ` ${item.path}${item.startLine ? `:${item.startLine}-${item.endLine}` : ''}` : ''} sha256=${item.sha256}\n${item.content}`),
  ].join('\n');
}

export class ContextCompilerPolicy {
  readonly options: Required<ContextCompilerPolicyOptions>;
  constructor(options: ContextCompilerPolicyOptions = {}) {
    this.options = {e2bLocalConfidence: options.e2bLocalConfidence ?? .9, e4bLocalConfidence: options.e4bLocalConfidence ?? .85, maximumLocalFiles: options.maximumLocalFiles ?? 3, maximumLocalSymbols: options.maximumLocalSymbols ?? 8, maximumLocalPacketTokens: options.maximumLocalPacketTokens ?? 8_192, maximumAttempts: options.maximumAttempts ?? 4};
    if (this.options.e2bLocalConfidence < 0 || this.options.e2bLocalConfidence > 1 || this.options.e4bLocalConfidence < 0 || this.options.e4bLocalConfidence > 1) throw new Error('context_compiler_confidence_threshold_invalid');
    if (![this.options.maximumLocalFiles, this.options.maximumLocalSymbols, this.options.maximumLocalPacketTokens, this.options.maximumAttempts].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('context_compiler_policy_limit_invalid');
  }

  decision(tier: ContextCompilerTier, input: ContextCompilerInput, packet: ContextPacket, verification?: ContextVerificationResult): {action: 'verify-local' | 'escalate' | 'finish'; next?: ContextCompilerTier; reason: string} {
    const analysis = packet.compiler.analysis, highRisk = (input.risks ?? []).some(risk => ['architecture', 'concurrency', 'security', 'destructive', 'database-migration', 'uncertain-api', 'repo-wide'].includes(risk)) || ['complex', 'repo-wide', 'high-risk'].includes(analysis.taskClass);
    const bounded = analysis.suspectedFiles.length <= this.options.maximumLocalFiles && analysis.relevantSymbols.length <= this.options.maximumLocalSymbols && packet.packetTokens <= this.options.maximumLocalPacketTokens;
    const unresolved = analysis.uncertainties.length > 0 || analysis.hypotheses.length > analysis.evidence.length;
    if (verification && !verification.passed) return tier === 'LUNA' ? {action: 'escalate', next: 'SOL', reason: `verification_failed:${verification.detail}`} : tier === 'SOL' ? {action: 'finish', reason: `sol_verification_failed:${verification.detail}`} : {action: 'escalate', next: highRisk ? 'SOL' : 'LUNA', reason: `local_verification_failed:${verification.detail}`};
    if (tier === 'SOL') return {action: 'finish', reason: 'sol_requires_final_verification'};
    if (tier === 'LUNA') return {action: 'finish', reason: 'luna_requires_final_verification'};
    if (highRisk) return {action: 'escalate', next: 'SOL', reason: `high_risk:${unique([...(input.risks ?? []), analysis.taskClass]).join(',')}`};
    if (!bounded) return {action: 'escalate', next: tier === 'E2B' ? 'E4B' : 'LUNA', reason: 'local_scope_or_context_limit'};
    if (unresolved) return {action: 'escalate', next: tier === 'E2B' ? 'E4B' : 'LUNA', reason: 'unresolved_hypotheses_or_uncertainty'};
    const threshold = tier === 'E2B' ? this.options.e2bLocalConfidence : this.options.e4bLocalConfidence;
    if (analysis.confidence < threshold) return {action: 'escalate', next: tier === 'E2B' ? 'E4B' : 'LUNA', reason: `confidence_below_${threshold}`};
    if (analysis.recommendedTier !== tier) {
      const allowed: ContextCompilerTier[] = tier === 'E2B' ? ['E4B', 'LUNA', 'SOL'] : ['LUNA', 'SOL'];
      if (allowed.includes(analysis.recommendedTier)) return {action: 'escalate', next: analysis.recommendedTier, reason: `compiler_recommended:${analysis.escalationReason}`};
    }
    return {action: 'verify-local', reason: 'bounded_confident_local_candidate'};
  }
}

export class ContextCompilerPipeline {
  constructor(private readonly executors: Record<ContextCompilerTier, ContextTierExecutor>, private readonly verifier: ContextVerifier, private readonly policy = new ContextCompilerPolicy(), private readonly audit: (event: RoutingDecisionEvent) => void = () => undefined, private readonly clock: () => string = () => new Date().toISOString()) {}

  async run(input: ContextCompilerInput): Promise<ContextPipelineResult> {
    if (!input.task.trim()) throw new Error('context_compiler_task_required');
    if ((input.failedAttempts ?? 0) >= this.policy.options.maximumAttempts) throw new Error('context_compiler_attempt_budget_exhausted');
    const originalContextTokens = estimateTokens(input.task) + collectContextEvidence(input).reduce((sum, item) => sum + item.estimatedTokens, 0);
    const trail: RoutingDecisionEvent[] = [], invocations: ContextTierResult[] = [];
    const emit = (event: RoutingDecisionEvent) => { trail.push(event); this.audit(event); };
    let tier: ContextCompilerTier = 'E2B', packet: ContextPacket | undefined, finalVerification: ContextVerificationResult = {passed: false, independent: false, verifierId: 'none', evidenceIds: [], detail: 'not_verified'};
    for (let attempt = 0; attempt < this.policy.options.maximumAttempts; attempt++) {
      emit({at: this.clock(), type: 'stage-started', tier, reason: attempt ? 'bounded_escalation' : 'local_first_triage', originalContextTokens, contextPacketTokens: packet?.packetTokens, retainedEvidenceIds: packet?.exactEvidence.map(item => item.id) ?? []});
      const prompt = packet ? strongerModelPrompt(packet) : input.task;
      const result = await this.executors[tier].execute({tier, input, packet, prompt});
      if (result.tier !== tier) throw new Error(`context_compiler_executor_tier_mismatch:${tier}:${result.tier}`);
      invocations.push(result);
      if ((tier === 'E2B' || tier === 'E4B')) {
        if (!result.analysis) throw new Error(`context_compiler_analysis_required:${tier}`);
        packet = buildContextPacket(input, tier, result.model, result.analysis, result.selectedEvidenceIds, this.clock());
      } else if (!packet) throw new Error('context_compiler_cloud_packet_required');
      emit({at: this.clock(), type: 'stage-completed', tier, model: result.model, reason: result.analysis?.escalationReason ?? 'model_completed', confidence: result.analysis?.confidence, originalContextTokens, contextPacketTokens: packet.packetTokens, retainedEvidenceIds: packet.exactEvidence.map(item => item.id), usage: result.usage});
      let decision = this.policy.decision(tier, input, packet);
      if (decision.action === 'verify-local' || decision.action === 'finish') {
        finalVerification = await this.verifier.verify(result, packet);
        if (!finalVerification.independent || !finalVerification.verifierId.trim()) finalVerification = {...finalVerification, passed: false, detail: 'independent_verification_required'};
        emit({at: this.clock(), type: 'verification', tier, model: result.model, reason: finalVerification.detail, confidence: result.analysis?.confidence, originalContextTokens, contextPacketTokens: packet.packetTokens, retainedEvidenceIds: packet.exactEvidence.map(item => item.id), verification: finalVerification});
        if (finalVerification.passed) {
          emit({at: this.clock(), type: 'finished', tier, model: result.model, reason: 'verified', originalContextTokens, contextPacketTokens: packet.packetTokens, retainedEvidenceIds: packet.exactEvidence.map(item => item.id), verification: finalVerification});
          return {schema: 'agent-control.context-compiler-run/v1', status: 'VERIFIED', initialTier: 'E2B', finalTier: tier, result: result.result, packet, trail, invocations, finalVerification};
        }
        decision = this.policy.decision(tier, input, packet, finalVerification);
      }
      if (decision.action !== 'escalate' || !decision.next) break;
      emit({at: this.clock(), type: 'escalated', tier, model: result.model, reason: decision.reason, confidence: result.analysis?.confidence, originalContextTokens, contextPacketTokens: packet.packetTokens, retainedEvidenceIds: packet.exactEvidence.map(item => item.id)});
      tier = decision.next;
    }
    emit({at: this.clock(), type: 'finished', tier, reason: `failed:${finalVerification.detail}`, originalContextTokens, contextPacketTokens: packet?.packetTokens, retainedEvidenceIds: packet?.exactEvidence.map(item => item.id) ?? [], verification: finalVerification});
    if (!packet) throw new Error('context_compiler_packet_missing');
    return {schema: 'agent-control.context-compiler-run/v1', status: 'FAILED', initialTier: 'E2B', finalTier: tier, packet, trail, invocations, finalVerification};
  }
}

export function contextCompilerRunId() { return `ccr-${randomUUID()}`; }

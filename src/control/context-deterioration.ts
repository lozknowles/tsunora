import {createHash} from 'node:crypto';
import type {ContextPolicy} from './identity-control-plane.js';

export interface ExperimentContextItem {id: string; kind: 'task' | 'evidence' | 'history' | 'summary' | 'baton'; content: string; estimatedTokens: number; evidenceIds: string[]; required?: boolean;}
export interface CompiledExperimentContext {policy: ContextPolicy; selected: ExperimentContextItem[]; discarded: Array<ExperimentContextItem & {reason: string}>; sourceHash: string; transferredHash: string; tokens: number;}
export interface ContextExperimentTask {id: string; question: string; items: ExperimentContextItem[]; expectedClaims: string[]; expectedEvidenceIds: string[];}
export interface ContextExperimentOutput {claims: Array<{id: string; evidenceIds: string[]; contradicted?: boolean}>; unresolved: string[]; inputTokens: number | null; outputTokens: number | null; cost: number | null; currency: string | null; latencyMs: number;}
export interface ContextExperimentRunner {run(input: {taskId: string; policy: ContextPolicy; context: CompiledExperimentContext}): Promise<ContextExperimentOutput>;}
export interface ContextExperimentResult {taskId: string; policy: ContextPolicy; contextTokens: number; claimRecall: number; claimPrecision: number; evidenceRetention: number; unsupportedClaimRate: number; contradictionRate: number; unresolvedRate: number; semanticLoss: number; inputTokens: number | null; outputTokens: number | null; cost: number | null; currency: string | null; latencyMs: number; sourceHash: string; transferredHash: string;}

const POLICIES: ContextPolicy[] = ['full', 'summary-only', 'evidence-only', 'structured-baton', 'hybrid'];

export function compileExperimentContext(policy: ContextPolicy, items: ExperimentContextItem[], budget: number): CompiledExperimentContext {
  if (!Number.isSafeInteger(budget) || budget < 1) throw new Error('experiment_context_budget_invalid');
  const eligible = items.filter(item => permitted(policy, item));
  const ordered = [...eligible].sort((left, right) => Number(right.required) - Number(left.required) || priority(policy, left.kind) - priority(policy, right.kind) || left.id.localeCompare(right.id));
  const selected: ExperimentContextItem[] = [], discarded: Array<ExperimentContextItem & {reason: string}> = []; let tokens = 0;
  for (const item of ordered) if (tokens + item.estimatedTokens <= budget || item.required) { if (tokens + item.estimatedTokens > budget) throw new Error('required_experiment_context_exceeds_budget'); selected.push(structuredClone(item)); tokens += item.estimatedTokens; } else discarded.push({...structuredClone(item), reason: 'token_budget'});
  for (const item of items.filter(item => !eligible.includes(item))) discarded.push({...structuredClone(item), reason: `policy:${policy}`});
  const sourceHash = hash(items.map(item => ({id: item.id, contentHash: hash(item.content)}))), transferredHash = hash(selected.map(item => ({id: item.id, contentHash: hash(item.content)})));
  return {policy, selected, discarded, sourceHash, transferredHash, tokens};
}

export class ContextDeteriorationExperiment {
  constructor(readonly runner: ContextExperimentRunner, readonly policies: ContextPolicy[] = POLICIES) {}
  async run(task: ContextExperimentTask, budget: number) {
    const results: ContextExperimentResult[] = [];
    for (const policy of this.policies) {
      const context = compileExperimentContext(policy, task.items, budget), output = await this.runner.run({taskId: task.id, policy, context});
      const claims = new Set(output.claims.map(value => value.id)), expected = new Set(task.expectedClaims), matched = [...claims].filter(value => expected.has(value)).length;
      const cited = new Set(output.claims.flatMap(value => value.evidenceIds)), expectedEvidence = new Set(task.expectedEvidenceIds), retainedEvidence = [...expectedEvidence].filter(value => cited.has(value)).length;
      const unsupported = output.claims.filter(value => !value.evidenceIds.length).length, contradictions = output.claims.filter(value => value.contradicted).length;
      const claimRecall = expected.size ? matched / expected.size : 1, claimPrecision = claims.size ? matched / claims.size : 1;
      results.push({taskId: task.id, policy, contextTokens: context.tokens, claimRecall, claimPrecision, evidenceRetention: expectedEvidence.size ? retainedEvidence / expectedEvidence.size : 1, unsupportedClaimRate: unsupported / Math.max(1, output.claims.length), contradictionRate: contradictions / Math.max(1, output.claims.length), unresolvedRate: output.unresolved.length / Math.max(1, expected.size), semanticLoss: 1 - claimRecall, inputTokens: output.inputTokens, outputTokens: output.outputTokens, cost: output.cost, currency: output.currency, latencyMs: output.latencyMs, sourceHash: context.sourceHash, transferredHash: context.transferredHash});
    }
    return results;
  }
}

function permitted(policy: ContextPolicy, item: ExperimentContextItem) {
  if (item.required || item.kind === 'task') return true;
  if (policy === 'full') return true;
  if (policy === 'summary-only') return item.kind === 'summary';
  if (policy === 'evidence-only') return item.kind === 'evidence';
  if (policy === 'structured-baton') return item.kind === 'baton' || item.kind === 'evidence';
  if (policy === 'hybrid') return item.kind !== 'history';
  return false;
}
function priority(policy: ContextPolicy, kind: ExperimentContextItem['kind']) { const order = policy === 'structured-baton' ? ['task','baton','evidence','summary','history'] : ['task','evidence','baton','summary','history']; return order.indexOf(kind); }
function hash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

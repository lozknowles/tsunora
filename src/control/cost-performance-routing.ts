import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {containsSensitiveMaterial} from './security-redaction.js';

export type RoutingStrategy = 'economy' | 'balanced' | 'fast-capped' | 'custom';
export type RoutingOptimization = 'price' | 'throughput' | 'latency';
export type RoutingScope = 'estate' | 'provider' | 'model' | 'suite' | 'job' | 'invocation';
export type Percentile = 50 | 75 | 90 | 99;

export interface PerformancePreference {
  percentile: Percentile;
  value: number;
  onMiss: 'block' | 'degrade';
}

export interface CostPerformanceRoutingPolicy {
  schema: 'agent-control.cost-performance-routing-policy/v1';
  id: string;
  strategy: RoutingStrategy;
  optimization: RoutingOptimization;
  preferredMinThroughputTps?: PerformancePreference;
  preferredMaxLatencyMs?: PerformancePreference;
  rateCeilingUsdPerMillionTokens?: {input?: number; output?: number};
  budget?: {invocationUsd?: number; jobUsd?: number};
  tokenCeiling?: {input?: number; output?: number};
  providers?: {allowed?: string[]; ignored?: string[]};
  quantizations?: string[];
  fallback: {enabled: boolean; onNoEligibleRoute: 'block'; crossModel: boolean};
}

export interface ScopedRoutingPolicy {
  scope: RoutingScope;
  scopeId: string;
  policy: CostPerformanceRoutingPolicy;
  recordedAt: string;
}

export interface RoutingApproval {
  approved: true;
  approvalId: string;
  approver: string;
  approvedAt: string;
  reason: string;
}

export interface RoutingCandidate {
  id: string;
  provider: string;
  model: string;
  endpoint?: string;
  inputUsdPerMillionTokens: number | null;
  outputUsdPerMillionTokens: number | null;
  throughputTps?: Partial<Record<`p${Percentile}`, number>>;
  latencyMs?: Partial<Record<`p${Percentile}`, number>>;
  quantization?: string;
  available: boolean;
}

export interface RoutingExplanation {
  schema: 'agent-control.cost-performance-routing-explanation/v1';
  decision: 'PROCEED' | 'BLOCKED';
  reason: 'ELIGIBLE_ROUTE_SELECTED' | 'NO_ROUTE_WITHIN_PRICE_CEILING' | 'PREFERRED_PERFORMANCE_UNAVAILABLE' | 'INVOCATION_BUDGET_EXCEEDED' | 'JOB_BUDGET_EXCEEDED' | 'INPUT_TOKEN_CEILING_EXCEEDED' | 'UNSUPPORTED_CAPABILITY';
  policy: CostPerformanceRoutingPolicy;
  policySources: Array<{field: string; scope: RoutingScope; scopeId: string}>;
  selected: RoutingCandidate | null;
  eligible: RoutingCandidate[];
  excluded: Array<{route: RoutingCandidate; reasons: string[]}>;
  estimate: CostPreflight;
  unsupportedCapabilities: string[];
  plainEnglish: string;
  externalRequestMade: false;
}

export interface CostPreflight {
  inputTokensEstimated: number;
  outputTokensReserved: number;
  maximumInvocationCostUsd: number | null;
  invocationBudgetUsd: number | null;
  jobBudgetUsd: number | null;
  jobSpentUsd: number;
  remainingJobBudgetUsd: number | null;
}

export interface ActualCostInput {
  promptTokens: number | null;
  cachedInputTokens: number | null;
  freshInputTokens: number | null;
  reasoningTokens: number | null;
  outputTokens: number | null;
  providerReportedCostUsd: number | null;
  advertisedInputUsdPerMillionTokens: number | null;
  advertisedOutputUsdPerMillionTokens: number | null;
}

export interface CostReconciliation extends ActualCostInput {
  estimatedMaximumCostUsd: number | null;
  actualCostUsd: number | null;
  actualCostAuthority: 'PROVIDER_REPORTED' | 'CALCULATED_FROM_ADVERTISED_RATES' | 'UNAVAILABLE';
  varianceFromMaximumUsd: number | null;
}

const ORDER: RoutingScope[] = ['estate', 'provider', 'model', 'suite', 'job', 'invocation'];

export function routingPreset(strategy: Exclude<RoutingStrategy, 'custom'>, id = strategy): CostPerformanceRoutingPolicy {
  const common = {schema: 'agent-control.cost-performance-routing-policy/v1' as const, id, strategy, fallback: {enabled: true, onNoEligibleRoute: 'block' as const, crossModel: false}};
  if (strategy === 'economy') return {...common, optimization: 'price'};
  if (strategy === 'balanced') return {...common, optimization: 'price', preferredMinThroughputTps: {percentile: 90, value: 50, onMiss: 'degrade'}, rateCeilingUsdPerMillionTokens: {input: 1, output: 2}};
  return {...common, optimization: 'throughput', rateCeilingUsdPerMillionTokens: {input: 1, output: 2}};
}

export function normalizePolicy(input: CostPerformanceRoutingPolicy): CostPerformanceRoutingPolicy {
  const value = structuredClone(input);
  if (value.schema !== 'agent-control.cost-performance-routing-policy/v1' || !/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(value.id) || containsSensitiveMaterial(JSON.stringify(value))) throw new Error('routing_policy_invalid');
  if (!['economy','balanced','fast-capped','custom'].includes(value.strategy) || !['price','throughput','latency'].includes(value.optimization)) throw new Error('routing_policy_invalid');
  if (value.fallback?.onNoEligibleRoute !== 'block' || typeof value.fallback.enabled !== 'boolean' || typeof value.fallback.crossModel !== 'boolean') throw new Error('routing_policy_invalid');
  for (const [name, amount] of Object.entries({...value.rateCeilingUsdPerMillionTokens, ...value.budget})) if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) throw new Error(`routing_policy_invalid:${name}`);
  for (const [name, amount] of Object.entries(value.tokenCeiling ?? {})) if (!Number.isSafeInteger(amount) || amount < 1) throw new Error(`routing_policy_invalid:${name}`);
  for (const preference of [value.preferredMinThroughputTps, value.preferredMaxLatencyMs]) if (preference && (![50,75,90,99].includes(preference.percentile) || !Number.isFinite(preference.value) || preference.value < 0 || !['block','degrade'].includes(preference.onMiss))) throw new Error('routing_policy_invalid:performance_preference');
  const allowed = value.providers?.allowed ?? [], ignored = value.providers?.ignored ?? [];
  if (allowed.some(id => ignored.includes(id))) throw new Error('routing_policy_provider_conflict');
  return value;
}

export function resolveRoutingPolicy(layers: ScopedRoutingPolicy[], approval?: RoutingApproval): {policy: CostPerformanceRoutingPolicy; sources: RoutingExplanation['policySources']; approval?: RoutingApproval} {
  if (!layers.length) throw new Error('routing_policy_missing');
  const sorted = [...layers].sort((a,b) => ORDER.indexOf(a.scope) - ORDER.indexOf(b.scope));
  let effective = normalizePolicy(sorted[0].policy), sources = fields(effective).map(field => ({field, scope: sorted[0].scope, scopeId: sorted[0].scopeId}));
  for (const layer of sorted.slice(1)) {
    const next = normalizePolicy(layer.policy);
    if (routingPolicyRaisesAuthority(effective, next) && !approval) throw new Error('routing_policy_raise_requires_approval');
    effective = mergePolicy(effective, next);
    const changed = fields(next); sources = sources.filter(item => !changed.includes(item.field)); sources.push(...changed.map(field => ({field, scope: layer.scope, scopeId: layer.scopeId})));
  }
  return {policy: effective, sources, ...(approval ? {approval: structuredClone(approval)} : {})};
}

function mergePolicy(base: CostPerformanceRoutingPolicy, override: CostPerformanceRoutingPolicy): CostPerformanceRoutingPolicy {
  return normalizePolicy({...base, ...override, rateCeilingUsdPerMillionTokens: {...base.rateCeilingUsdPerMillionTokens, ...override.rateCeilingUsdPerMillionTokens}, budget: {...base.budget, ...override.budget}, tokenCeiling: {...base.tokenCeiling, ...override.tokenCeiling}, providers: {...base.providers, ...override.providers}, fallback: {...base.fallback, ...override.fallback}});
}
function fields(policy: CostPerformanceRoutingPolicy) { return Object.keys(policy).filter(key => !['schema','id'].includes(key)); }
function raises(previous: number | undefined, next: number | undefined) { return previous !== undefined && (next === undefined || next > previous); }
export function routingPolicyRaisesAuthority(a: CostPerformanceRoutingPolicy, b: CostPerformanceRoutingPolicy) {
  return raises(a.rateCeilingUsdPerMillionTokens?.input,b.rateCeilingUsdPerMillionTokens?.input) || raises(a.rateCeilingUsdPerMillionTokens?.output,b.rateCeilingUsdPerMillionTokens?.output) || raises(a.budget?.invocationUsd,b.budget?.invocationUsd) || raises(a.budget?.jobUsd,b.budget?.jobUsd) || raises(a.tokenCeiling?.input,b.tokenCeiling?.input) || raises(a.tokenCeiling?.output,b.tokenCeiling?.output) || (a.fallback.crossModel === false && b.fallback.crossModel === true);
}

export function preflightCost(policy: CostPerformanceRoutingPolicy, inputTokensEstimated: number, outputTokensRequested: number, jobSpentUsd = 0): CostPreflight {
  const outputTokensReserved = Math.min(outputTokensRequested, policy.tokenCeiling?.output ?? outputTokensRequested);
  const input = policy.rateCeilingUsdPerMillionTokens?.input, output = policy.rateCeilingUsdPerMillionTokens?.output;
  const maximumInvocationCostUsd = input === undefined || output === undefined ? null : (inputTokensEstimated * input + outputTokensReserved * output) / 1_000_000;
  const jobBudgetUsd = policy.budget?.jobUsd ?? null, remainingJobBudgetUsd = jobBudgetUsd === null ? null : Math.max(0, jobBudgetUsd - jobSpentUsd);
  return {inputTokensEstimated, outputTokensReserved, maximumInvocationCostUsd, invocationBudgetUsd: policy.budget?.invocationUsd ?? null, jobBudgetUsd, jobSpentUsd, remainingJobBudgetUsd};
}

export function explainRouting(input: {policy: CostPerformanceRoutingPolicy; candidates: RoutingCandidate[]; inputTokensEstimated: number; outputTokensRequested: number; jobSpentUsd?: number; policySources?: RoutingExplanation['policySources']; unsupportedCapabilities?: string[]}): RoutingExplanation {
  const policy = normalizePolicy(input.policy), estimate = preflightCost(policy,input.inputTokensEstimated,input.outputTokensRequested,input.jobSpentUsd ?? 0), excluded: RoutingExplanation['excluded'] = [], candidates: RoutingCandidate[] = [];
  for (const route of input.candidates) {
    const reasons: string[] = [];
    if (!route.available) reasons.push('route_unavailable');
    if (policy.providers?.allowed?.length && !policy.providers.allowed.includes(route.provider)) reasons.push('provider_not_allowed');
    if (policy.providers?.ignored?.includes(route.provider)) reasons.push('provider_ignored');
    if (policy.quantizations?.length && (!route.quantization || !policy.quantizations.includes(route.quantization))) reasons.push('quantization_not_allowed');
    const ceiling = policy.rateCeilingUsdPerMillionTokens;
    if (ceiling?.input !== undefined && (route.inputUsdPerMillionTokens === null || route.inputUsdPerMillionTokens > ceiling.input)) reasons.push('input_rate_above_ceiling_or_unknown');
    if (ceiling?.output !== undefined && (route.outputUsdPerMillionTokens === null || route.outputUsdPerMillionTokens > ceiling.output)) reasons.push('output_rate_above_ceiling_or_unknown');
    if (reasons.length) excluded.push({route: structuredClone(route), reasons}); else candidates.push(structuredClone(route));
  }
  const priceBlocked = !candidates.length && excluded.some(item => item.reasons.some(reason => reason.includes('rate_above_ceiling')));
  let reason: RoutingExplanation['reason'] = 'ELIGIBLE_ROUTE_SELECTED';
  if ((input.unsupportedCapabilities?.length ?? 0) > 0) reason = 'UNSUPPORTED_CAPABILITY';
  else if (policy.tokenCeiling?.input !== undefined && input.inputTokensEstimated > policy.tokenCeiling.input) reason = 'INPUT_TOKEN_CEILING_EXCEEDED';
  else if (estimate.maximumInvocationCostUsd !== null && estimate.invocationBudgetUsd !== null && estimate.maximumInvocationCostUsd > estimate.invocationBudgetUsd) reason = 'INVOCATION_BUDGET_EXCEEDED';
  else if (estimate.maximumInvocationCostUsd !== null && estimate.remainingJobBudgetUsd !== null && estimate.maximumInvocationCostUsd > estimate.remainingJobBudgetUsd) reason = 'JOB_BUDGET_EXCEEDED';
  else if (!candidates.length) reason = priceBlocked ? 'NO_ROUTE_WITHIN_PRICE_CEILING' : 'PREFERRED_PERFORMANCE_UNAVAILABLE';
  let preferred = candidates;
  for (const [kind, preference] of [['throughput',policy.preferredMinThroughputTps],['latency',policy.preferredMaxLatencyMs]] as const) if (preference) {
    const key = `p${preference.percentile}` as const;
    const matching = preferred.filter(route => kind === 'throughput' ? (route.throughputTps?.[key] ?? -Infinity) >= preference.value : (route.latencyMs?.[key] ?? Infinity) <= preference.value);
    if (matching.length) preferred = matching; else if (preference.onMiss === 'block' && reason === 'ELIGIBLE_ROUTE_SELECTED') reason = 'PREFERRED_PERFORMANCE_UNAVAILABLE';
  }
  const eligible = preferred.length ? preferred : candidates;
  const selected = reason === 'ELIGIBLE_ROUTE_SELECTED' ? [...eligible].sort((a,b) => compare(a,b,policy))[0] ?? null : null;
  const decision = selected ? 'PROCEED' : 'BLOCKED';
  return {schema:'agent-control.cost-performance-routing-explanation/v1',decision,reason,policy,policySources:input.policySources ?? [],selected,eligible,excluded,estimate,unsupportedCapabilities:[...(input.unsupportedCapabilities ?? [])],plainEnglish:summary(policy,decision,reason),externalRequestMade:false};
}

function compare(a: RoutingCandidate,b: RoutingCandidate,policy: CostPerformanceRoutingPolicy) {
  if (policy.optimization === 'throughput') return observed(b.throughputTps,'max') - observed(a.throughputTps,'max');
  if (policy.optimization === 'latency') return observed(a.latencyMs,'min') - observed(b.latencyMs,'min');
  return ((a.inputUsdPerMillionTokens ?? Infinity)+(a.outputUsdPerMillionTokens ?? Infinity))-((b.inputUsdPerMillionTokens ?? Infinity)+(b.outputUsdPerMillionTokens ?? Infinity));
}
function observed(value: RoutingCandidate['throughputTps'], kind: 'min'|'max') { const rows=Object.values(value ?? {}).filter((item): item is number => typeof item === 'number'); return rows.length ? (kind === 'max' ? Math.max(...rows) : Math.min(...rows)) : (kind === 'max' ? -Infinity : Infinity); }
function summary(policy: CostPerformanceRoutingPolicy, decision: string, reason: string) {
  const input=policy.rateCeilingUsdPerMillionTokens?.input,output=policy.rateCeilingUsdPerMillionTokens?.output,job=policy.budget?.jobUsd;
  return `${decision === 'PROCEED' ? 'Choose' : 'Block'} the ${policy.optimization === 'price' ? 'cheapest' : policy.optimization === 'throughput' ? 'fastest' : 'lowest-latency'} eligible route${input === undefined && output === undefined ? '' : ` charging no more than ${input === undefined ? 'an unspecified input rate' : `$${input}/M input`} and ${output === undefined ? 'an unspecified output rate' : `$${output}/M output`}`}. ${reason === 'ELIGIBLE_ROUTE_SELECTED' ? 'Hard ceilings remain enforced.' : `Reason: ${reason}.`}${job === undefined ? '' : ` Do not allow this job to exceed $${job}.`}`;
}

export function reconcileCost(estimate: CostPreflight, actual: ActualCostInput): CostReconciliation {
  if (actual.promptTokens !== null && actual.cachedInputTokens !== null && actual.cachedInputTokens > actual.promptTokens) throw new Error('cached_input_exceeds_prompt_input');
  if (actual.promptTokens !== null && actual.freshInputTokens !== null && actual.cachedInputTokens !== null && actual.freshInputTokens + actual.cachedInputTokens !== actual.promptTokens) throw new Error('input_token_partition_invalid');
  let actualCostUsd=actual.providerReportedCostUsd, authority: CostReconciliation['actualCostAuthority']='PROVIDER_REPORTED';
  if (actualCostUsd === null && actual.freshInputTokens !== null && actual.cachedInputTokens === 0 && actual.outputTokens !== null && actual.advertisedInputUsdPerMillionTokens !== null && actual.advertisedOutputUsdPerMillionTokens !== null) { actualCostUsd=(actual.freshInputTokens*actual.advertisedInputUsdPerMillionTokens+actual.outputTokens*actual.advertisedOutputUsdPerMillionTokens)/1_000_000;authority='CALCULATED_FROM_ADVERTISED_RATES'; }
  if (actualCostUsd === null) authority='UNAVAILABLE';
  return {...actual,estimatedMaximumCostUsd:estimate.maximumInvocationCostUsd,actualCostUsd,actualCostAuthority:authority,varianceFromMaximumUsd:actualCostUsd===null||estimate.maximumInvocationCostUsd===null?null:actualCostUsd-estimate.maximumInvocationCostUsd};
}

export interface RoutingDecisionRecord {id:string;at:string;kind:'DECISION'|'OVERRIDE'|'RECONCILIATION';runId?:string;jobId?:string;invocationId?:string;payload:unknown;previousHash:string|null;sha256:string}
export class CostRoutingLedger {
  constructor(readonly file:string,private readonly clock=()=>new Date().toISOString()){}
  append(kind:RoutingDecisionRecord['kind'],payload:unknown,links:Pick<RoutingDecisionRecord,'runId'|'jobId'|'invocationId'>={}):RoutingDecisionRecord{
    fs.mkdirSync(path.dirname(this.file),{recursive:true});const records=this.list(),previousHash=records.at(-1)?.sha256??null,base={id:`routing-${createHash('sha256').update(`${this.clock()}:${records.length}:${JSON.stringify(payload)}`).digest('hex').slice(0,24)}`,at:this.clock(),kind,...links,payload:structuredClone(payload),previousHash};const sha256=createHash('sha256').update(JSON.stringify(base)).digest('hex'),record={...base,sha256};fs.appendFileSync(this.file,JSON.stringify(record)+'\n',{encoding:'utf8',mode:0o600});return structuredClone(record);
  }
  list(){if(!fs.existsSync(this.file))return[];return fs.readFileSync(this.file,'utf8').split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line) as RoutingDecisionRecord)}
  spentUsd(jobId:string){return this.list().filter(record=>record.kind==='RECONCILIATION'&&record.jobId===jobId).reduce((total,record)=>{const payload=record.payload as {reconciliation?:{actualCostUsd?:unknown}};const cost=payload?.reconciliation?.actualCostUsd;return total+(typeof cost==='number'&&Number.isFinite(cost)&&cost>=0?cost:0);},0)}
}

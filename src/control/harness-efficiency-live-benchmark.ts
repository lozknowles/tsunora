import {createHash} from 'node:crypto';
import type {HarnessBenchmarkSuite, HarnessBenchmarkTask} from './harness-efficiency-benchmark.js';
import {
  ContextPacketBuilder,
  type ContextPacket,
  type ContextPacketSource,
  type HarnessProfileName,
  type ModelInvocationObservation,
  type NormalizedProviderUsage,
  type StartupContextBreakdown,
} from './harness-efficiency.js';

export const LIVE_BENCHMARK_TOOL_ID = 'benchmark.submit';
export const LIVE_BENCHMARK_MISSING_MARKER = 'INSUFFICIENT_CONTEXT';

export interface LiveHarnessFloorResult {
  profile: HarnessProfileName;
  verifierResult: 'PASS' | 'FAIL';
  providerInputTokens: number | null;
  providerOutputTokens: number | null;
  providerTotalTokens: number | null;
  cachedInputTokens: number | null;
  elapsedMs: number;
  startup: StartupContextBreakdown;
  contextPacketId: string;
  contextSourceIds: string[];
}

export interface LiveHarnessTaskResult {
  taskId: string;
  category: string;
  minimumProfile: HarnessProfileName;
  profile: HarnessProfileName;
  model: string;
  provider: string;
  verifierResult: 'PASS' | 'FAIL';
  success: boolean;
  expectedContextAvailable: boolean;
  submittedMissingContext: boolean;
  failureReason: string | null;
  recipeId: string | null;
  contextPacketId: string;
  contextSourceIds: string[];
  omittedSourceIds: string[];
  usage: NormalizedProviderUsage;
  elapsedMs: number;
  toolCalls: number;
  invocationId: string | null;
  provenanceEvidenceIds: string[];
}

export interface LiveHarnessProfileAggregate {
  profile: HarnessProfileName;
  tasks: number;
  verifiedSuccesses: number;
  successRate: number;
  expectedContextRuns: number;
  expectedContextVerifiedSuccesses: number;
  expectedContextSuccessRate: number;
  totalInputTokens: number | null;
  freshInputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  totalProcessedTokens: number | null;
  medianInputTokens: number | null;
  medianElapsedMs: number | null;
  cacheEffectiveness: number | null;
  tokensPerVerifiedOutcome: number | null;
  freshTokensPerVerifiedOutcome: number | null;
  providerReportedCost: null;
  calculatedCost: null;
  costPerVerifiedOutcome: null;
}

export interface LiveHarnessEfficiencyReport {
  schema: 'agent-control.harness-efficiency-live-report/v1';
  benchmarkId: string;
  suiteId: string;
  generatedAt: string;
  classification: 'LIVE_SAME_MODEL_CONTROLLED_CONTEXT_RETRIEVAL_NOT_REPOSITORY_MUTATION_EVIDENCE';
  modelControl: {model: string; provider: string; parameters: Record<string, string | number | boolean>; suiteDeclaredParameters: Record<string, string | number | boolean>; sameModelAcrossProfiles: true; liveModelInvoked: true};
  endpoint: {scope: 'loopback' | 'explicit-private-remote'; modelListSha256: string};
  measurement: {
    providerUsageAvailable: true;
    providerCostAvailable: false;
    cacheMetricsAvailable: true;
    cacheWriteMetricsAvailable: false;
    componentMethod: 'deterministic_utf8_bytes_divided_by_3';
    monetaryCostReason: string;
  };
  startupTax: Record<HarnessProfileName, LiveHarnessFloorResult>;
  results: LiveHarnessTaskResult[];
  aggregates: Record<HarnessProfileName, LiveHarnessProfileAggregate>;
  conclusions: {
    boundedThinVerifiedSuccessRate: number;
    thinProviderFloorReductionVsStandardPercent: number | null;
    standardAdditionalVerifiedTasks: number;
    deepAdditionalVerifiedTasks: number;
    providerCachedInputPercent: number | null;
    sameModelControlledRuns: number;
    automaticRoutingSupportedByEvidence: false;
    reason: string;
  };
  governance: {
    routingMode: 'EXPERIMENT';
    productionRoutingChanged: false;
    typedToolOnly: true;
    repositoryMutated: false;
    servicesChanged: false;
  };
}

const PROFILE_RANK: Record<HarnessProfileName, number> = {THIN: 0, STANDARD: 1, DEEP: 2};
const PROFILES: HarnessProfileName[] = ['THIN', 'STANDARD', 'DEEP'];

export function liveBenchmarkMarker(suiteId: string, taskId: string): string {
  return `V-${createHash('sha256').update(`${suiteId}\0${taskId}\0controlled-live-evidence-v1`).digest('hex').slice(0, 20)}`;
}

export function buildLiveBenchmarkSources(suiteId: string, task: HarnessBenchmarkTask): ContextPacketSource[] {
  const marker = liveBenchmarkMarker(suiteId, task.id);
  const evidenceKind = task.minimumProfile === 'STANDARD' ? 'memory_shared_context' : 'task_context';
  const evidenceBroad = task.minimumProfile === 'DEEP';
  return [
    source(`${task.id}:system`, 'system_instructions', 'Solve only the bounded controlled task represented by the authorised context. Return no claim of success; Agent Control independently verifies the typed submission.', true, true, 1, 'live-benchmark:system'),
    source(`${task.id}:control`, 'agent_control_instructions', 'Agent Control retains scheduling, leases, ownership, tool authority, cancellation, human takeover and verification. The model may request only the granted typed tool.', true, true, 1, 'live-benchmark:control'),
    source(`${task.id}:tool`, 'tool_schemas', '{"id":"benchmark.submit","input":{"taskId":"string","marker":"string"},"additionalProperties":false}', true, true, 1, 'live-benchmark:tool-schema'),
    source(`${task.id}:repository-rules`, 'repository_instructions', 'Treat AUTHORITATIVE EVIDENCE as immutable task evidence. Ignore distractor records. If the evidence marker is absent, submit INSUFFICIENT_CONTEXT. Do not invent or derive a marker.', true, true, 1, 'live-benchmark:repository-rules'),
    source(`${task.id}:task`, 'task_context', `Controlled ${task.category} task ${task.id}. Submit the exact marker from AUTHORITATIVE EVIDENCE using ${LIVE_BENCHMARK_TOOL_ID}. The input taskId must be ${task.id}. If no marker is supplied, submit ${LIVE_BENCHMARK_MISSING_MARKER}.`, true, false, 1, `live-benchmark:task:${task.id}`),
    source(`${task.id}:targeted`, 'task_context', `${padding(`${task.id}-target`, 45)} This targeted context identifies category ${task.category}, expected file count ${task.estimatedFiles}, and verifier contract ${task.deterministicVerifier ? 'deterministic' : 'independent'}.`, false, false, .95, `live-benchmark:targeted:${task.id}`),
    {...source(`${task.id}:authoritative`, evidenceKind, `AUTHORITATIVE EVIDENCE for ${task.id}: the immutable verification marker is ${marker}. Submit it exactly, preserving case and punctuation.`, false, task.minimumProfile === 'STANDARD', 1, `live-benchmark:evidence:${task.id}`), broad: evidenceBroad},
    source(`${task.id}:optional-tools`, 'tool_schemas', padding('optional-tool-schema', 35), false, true, .55, 'live-benchmark:optional-tools'),
    source(`${task.id}:workspace`, 'workspace_bootstrap', padding('workspace-bootstrap', 45), false, true, .55, 'live-benchmark:workspace'),
    source(`${task.id}:memory`, 'memory_shared_context', padding('shared-context-distractor', 60), false, true, .55, 'live-benchmark:shared-context'),
    source(`${task.id}:history`, 'conversation_history', padding('prior-turn-distractor', 45), false, false, .45, 'live-benchmark:history'),
    {...source(`${task.id}:broad-repository`, 'task_context', padding('broad-repository-distractor', 200), false, false, .9, 'live-benchmark:broad-repository'), broad: true},
    {...source(`${task.id}:graph`, 'other', padding('graph-neighbourhood-distractor', 140), false, true, .85, 'live-benchmark:graph'), broad: true},
  ];
}

export function buildLiveFloorSources(profile: HarnessProfileName): ContextPacketSource[] {
  const task = {
    id: `startup-floor-${profile.toLowerCase()}`, category: 'startup floor', complexity: 0, risk: 'low' as const, knownExactTargets: true,
    estimatedFiles: 0, deterministicVerifier: true, ambiguity: 0, architectural: false, minimumProfile: 'THIN' as const,
    taskContextTokens: 1, selectedExpansionTokens: 0, requiredTools: [LIVE_BENCHMARK_TOOL_ID], requiredSkills: [],
  };
  return buildLiveBenchmarkSources('startup-floor-v1', task);
}

export function selectPacketSources(packet: ContextPacket, sources: ContextPacketSource[]): ContextPacketSource[] {
  const byId = new Map(sources.map(source => [source.id, source]));
  return packet.sourceIds.map(id => {
    const value = byId.get(id);
    if (!value) throw new Error(`live_benchmark_packet_source_missing:${id}`);
    return structuredClone(value);
  });
}

export function renderLiveBenchmarkInstruction(taskId: string, selected: ContextPacketSource[]): string {
  const rendered = selected.map((item, index) => `SOURCE ${index + 1} [${item.kind}] ${item.id}\n${item.content ?? ''}`).join('\n\n');
  return `Request exactly one ${LIVE_BENCHMARK_TOOL_ID} typed tool call. Input must be {"taskId":"${taskId}","marker":"<marker>"}. Use the exact AUTHORITATIVE EVIDENCE marker if present; otherwise use "${LIVE_BENCHMARK_MISSING_MARKER}".\n\nBEGIN AUTHORISED CONTEXT\n${rendered}\nEND AUTHORISED CONTEXT`;
}

export function expectedContextAvailable(minimum: HarnessProfileName, profile: HarnessProfileName): boolean {
  return PROFILE_RANK[profile] >= PROFILE_RANK[minimum];
}

export function observationUsage(observation?: ModelInvocationObservation): NormalizedProviderUsage {
  return observation?.usage ?? {inputTokens: null, freshInputTokens: null, cachedInputTokens: null, cacheWriteTokens: null, outputTokens: null, reasoningTokens: null, totalProcessedTokens: null};
}

export function createLiveHarnessEfficiencyReport(input: {
  suite: HarnessBenchmarkSuite;
  generatedAt: string;
  model: string;
  provider: string;
  endpointScope: 'loopback' | 'explicit-private-remote';
  modelListSha256: string;
  floors: LiveHarnessFloorResult[];
  results: LiveHarnessTaskResult[];
}): LiveHarnessEfficiencyReport {
  const startupTax = Object.fromEntries(PROFILES.map(profile => {
    const row = input.floors.find(item => item.profile === profile);
    if (!row) throw new Error(`live_benchmark_floor_missing:${profile}`);
    return [profile, structuredClone(row)];
  })) as Record<HarnessProfileName, LiveHarnessFloorResult>;
  const aggregates = Object.fromEntries(PROFILES.map(profile => [profile, aggregate(profile, input.results.filter(result => result.profile === profile))])) as Record<HarnessProfileName, LiveHarnessProfileAggregate>;
  const thinBounded = input.results.filter(result => result.profile === 'THIN' && result.minimumProfile === 'THIN');
  const overallFresh = sumComplete(input.results.map(result => result.usage.freshInputTokens));
  const overallCached = sumComplete(input.results.map(result => result.usage.cachedInputTokens));
  const identity = {suiteId: input.suite.suiteId, model: input.model, provider: input.provider, results: input.results.map(result => ({taskId: result.taskId, profile: result.profile, verifierResult: result.verifierResult, usage: result.usage}))};
  return {
    schema: 'agent-control.harness-efficiency-live-report/v1',
    benchmarkId: createHash('sha256').update(stableJson(identity)).digest('hex'),
    suiteId: input.suite.suiteId,
    generatedAt: input.generatedAt,
    classification: 'LIVE_SAME_MODEL_CONTROLLED_CONTEXT_RETRIEVAL_NOT_REPOSITORY_MUTATION_EVIDENCE',
    modelControl: {model: input.model, provider: input.provider, parameters: {temperature: 0, maximumOutputTokens: 256, responseFormat: 'json_object'}, suiteDeclaredParameters: structuredClone(input.suite.modelParameters), sameModelAcrossProfiles: true, liveModelInvoked: true},
    endpoint: {scope: input.endpointScope, modelListSha256: input.modelListSha256},
    measurement: {providerUsageAvailable: true, providerCostAvailable: false, cacheMetricsAvailable: true, cacheWriteMetricsAvailable: false, componentMethod: 'deterministic_utf8_bytes_divided_by_3', monetaryCostReason: 'The existing local endpoint exposes no billing price or provider-reported monetary cost; infrastructure and energy costs were not fabricated.'},
    startupTax,
    results: structuredClone(input.results),
    aggregates,
    conclusions: {
      boundedThinVerifiedSuccessRate: thinBounded.filter(result => result.success).length / Math.max(1, thinBounded.length),
      thinProviderFloorReductionVsStandardPercent: percentReduction(startupTax.THIN.providerInputTokens, startupTax.STANDARD.providerInputTokens),
      standardAdditionalVerifiedTasks: aggregates.STANDARD.verifiedSuccesses - aggregates.THIN.verifiedSuccesses,
      deepAdditionalVerifiedTasks: aggregates.DEEP.verifiedSuccesses - aggregates.STANDARD.verifiedSuccesses,
      providerCachedInputPercent: overallFresh !== null && overallCached !== null && overallFresh + overallCached > 0 ? overallCached / (overallFresh + overallCached) * 100 : null,
      sameModelControlledRuns: input.results.length,
      automaticRoutingSupportedByEvidence: false,
      reason: 'Live evidence covers controlled typed context retrieval with deterministic verification, not repository mutation or production coding outcomes. Production routing therefore remains observational.',
    },
    governance: {routingMode: 'EXPERIMENT', productionRoutingChanged: false, typedToolOnly: true, repositoryMutated: false, servicesChanged: false},
  };
}

export function renderLiveHarnessEfficiencyReport(report: LiveHarnessEfficiencyReport): string {
  const n = (value: number | null) => value === null ? 'unknown' : Math.round(value).toLocaleString('en-US');
  const p = (value: number | null) => value === null ? 'unknown' : `${value.toFixed(1)}%`;
  const startup = PROFILES.map(profile => {
    const row = report.startupTax[profile];
    return `| ${profile} | ${n(row.providerInputTokens)} | ${n(row.startup.startupContextTokens)} | ${n(row.providerOutputTokens)} | ${p(row.providerInputTokens === null || row.cachedInputTokens === null || row.providerInputTokens === 0 ? null : row.cachedInputTokens / row.providerInputTokens * 100)} | ${row.verifierResult} |`;
  }).join('\n');
  const execution = report.results.map(row => `| ${row.taskId} | ${row.profile} | ${n(row.usage.freshInputTokens)} | ${n(row.usage.cachedInputTokens)} | ${n(row.usage.outputTokens)} | ${Math.round(row.elapsedMs)} | ${row.verifierResult} |`).join('\n');
  const efficiency = PROFILES.map(profile => {
    const row = report.aggregates[profile];
    return `| ${profile} | ${p(row.successRate * 100)} | ${p(row.expectedContextSuccessRate * 100)} | ${n(row.medianInputTokens)} | ${n(row.tokensPerVerifiedOutcome)} | ${n(row.medianElapsedMs)} | unknown |`;
  }).join('\n');
  return `# Live same-model harness efficiency report\n\nGenerated: ${report.generatedAt}\n\nClassification: **${report.classification}**. One live model and one provider endpoint were held constant. The experiment used governed typed submissions and deterministic verification; it did not mutate a repository. Applied request parameters are recorded separately from the frozen suite declarations; unsupported declarations are not presented as applied.\n\n## Provider-measured startup floor\n\nThe provider input count includes the minimal typed task and transport chat template. Component counts are deterministic estimates used only to attribute the floor. The existing provider cache was deliberately not reset because that would have required a protected-service change; logical input tokens remain comparable while cached/fresh fields describe the observed warm state.\n\n| Profile | Provider input tokens | Estimated persistent components | Output tokens | Cached input | Verifier |\n| --- | ---: | ---: | ---: | ---: | --- |\n${startup}\n\nTHIN provider-measured floor reduction versus STANDARD: **${p(report.conclusions.thinProviderFloorReductionVsStandardPercent)}**.\n\n## Execution\n\n| Task | Profile | Fresh input | Cached input | Output | Model latency ms | Verifier |\n| --- | --- | ---: | ---: | ---: | ---: | --- |\n${execution}\n\n## Efficiency\n\n| Profile | Overall verified success | Success when required context is available | Median input | Tokens / verified outcome | Median latency ms | Cost / verified outcome |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: |\n${efficiency}\n\n- THIN preserved verified success on **${p(report.conclusions.boundedThinVerifiedSuccessRate * 100)}** of the frozen bounded tasks.\n- STANDARD verified **${report.conclusions.standardAdditionalVerifiedTasks}** additional tasks whose evidence was intentionally outside the THIN packet.\n- DEEP verified **${report.conclusions.deepAdditionalVerifiedTasks}** additional broad-context tasks.\n- Provider-reported cached input across task runs: **${p(report.conclusions.providerCachedInputPercent)}**.\n- Monetary cost per verified outcome is **unknown** for every profile. ${report.measurement.monetaryCostReason}\n- Automatic production routing supported: **NO**. ${report.conclusions.reason}\n\n## Governance and limitations\n\nThe benchmark used explicit EXPERIMENT profile selection, one allowlisted read-only submission tool, and independent marker verification. It made no repository mutation, changed no service, and did not enable production profile enforcement. Results demonstrate live context availability and token tax, not end-to-end coding success.\n`;
}

function aggregate(profile: HarnessProfileName, rows: LiveHarnessTaskResult[]): LiveHarnessProfileAggregate {
  const successes = rows.filter(row => row.success).length;
  const expected = rows.filter(row => row.expectedContextAvailable);
  const input = sumComplete(rows.map(row => row.usage.inputTokens));
  const fresh = sumComplete(rows.map(row => row.usage.freshInputTokens));
  const cached = sumComplete(rows.map(row => row.usage.cachedInputTokens));
  const output = sumComplete(rows.map(row => row.usage.outputTokens));
  const total = sumComplete(rows.map(row => row.usage.totalProcessedTokens));
  return {
    profile, tasks: rows.length, verifiedSuccesses: successes, successRate: successes / Math.max(1, rows.length), expectedContextRuns: expected.length,
    expectedContextVerifiedSuccesses: expected.filter(row => row.success).length,
    expectedContextSuccessRate: expected.filter(row => row.success).length / Math.max(1, expected.length),
    totalInputTokens: input, freshInputTokens: fresh, cachedInputTokens: cached, outputTokens: output, totalProcessedTokens: total,
    medianInputTokens: median(rows.flatMap(row => row.usage.inputTokens === null ? [] : [row.usage.inputTokens])),
    medianElapsedMs: median(rows.map(row => row.elapsedMs)),
    cacheEffectiveness: fresh !== null && cached !== null && fresh + cached > 0 ? cached / (fresh + cached) : null,
    tokensPerVerifiedOutcome: ratio(total, successes), freshTokensPerVerifiedOutcome: ratio(fresh, successes),
    providerReportedCost: null, calculatedCost: null, costPerVerifiedOutcome: null,
  };
}

function source(id: string, kind: ContextPacketSource['kind'], content: string, required: boolean, persistent: boolean, relevance: number, provenanceId: string): ContextPacketSource {
  return {id, kind, content, required, persistent, relevance, provenanceIds: [provenanceId]};
}

function padding(label: string, words: number): string {
  return Array.from({length: words}, (_, index) => `${label}-${String(index % 97).padStart(2, '0')}`).join(' ');
}

function sumComplete(values: Array<number | null>): number | null { return values.length > 0 && values.every((value): value is number => value !== null) ? values.reduce((sum, value) => sum + value, 0) : null; }
function median(values: number[]): number | null { if (!values.length) return null; const sorted = [...values].sort((left, right) => left - right), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function ratio(value: number | null, denominator: number): number | null { return value === null || denominator === 0 ? null : value / denominator; }
function percentReduction(smaller: number | null, larger: number | null): number | null { return smaller === null || larger === null || larger === 0 ? null : (1 - smaller / larger) * 100; }
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`; return JSON.stringify(value); }

export function buildPacket(profile: HarnessProfileName, sources: ContextPacketSource[], availableContextTokens = 30_000): ContextPacket {
  return new ContextPacketBuilder().build(profile, sources, {availableContextTokens});
}

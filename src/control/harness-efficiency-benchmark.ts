import {createHash} from 'node:crypto';
import {
  ContextPacketBuilder,
  DEFAULT_HARNESS_PROFILES,
  type ContextPacketSource,
  type HarnessProfileName,
} from './harness-efficiency.js';
import {estimateTokens} from './token-aware-output.js';

export interface HarnessBenchmarkTask {
  id: string;
  category: string;
  complexity: number;
  risk: 'low' | 'medium' | 'high';
  knownExactTargets: boolean;
  estimatedFiles: number;
  deterministicVerifier: boolean;
  ambiguity: number;
  architectural: boolean;
  minimumProfile: HarnessProfileName;
  taskContextTokens: number;
  selectedExpansionTokens: number;
  requiredTools: string[];
  requiredSkills: string[];
}

export interface HarnessBenchmarkSuite {
  schema: 'agent-control.harness-efficiency-suite/v1';
  suiteId: string;
  frozenAt: string;
  model: string;
  modelParameters: Record<string, string | number | boolean>;
  verifier: string;
  classification: 'DETERMINISTIC_HARNESS_SIMULATION_NOT_LIVE_MODEL_EVIDENCE';
  tasks: HarnessBenchmarkTask[];
}

export interface HarnessBenchmarkTaskResult {
  taskId: string;
  category: string;
  profile: HarnessProfileName;
  model: string;
  verifier: string;
  success: boolean;
  verifierResult: 'PASS' | 'FAIL';
  failureReason: string | null;
  startupContextTokens: number | null;
  taskContextTokens: number | null;
  initialContextTokens: number | null;
  fullKnowledgeTokens: number;
  selectedExpansionTokens: number;
  estimatedEffectiveTokens: number | null;
  initialReductionPercent: number | null;
  turns: number;
  freshTokens: null;
  cachedTokens: null;
  outputTokens: null;
  elapsedMs: null;
  providerReportedCost: null;
  calculatedCost: null;
  contextSourceIds: string[];
  omittedSourceIds: string[];
  toolCalls: number;
  escalation: HarnessProfileName | null;
}

export interface HarnessBenchmarkAggregate {
  profile: HarnessProfileName;
  tasks: number;
  verifiedSuccesses: number;
  successRate: number;
  medianStartupTokens: number | null;
  medianInitialTokens: number | null;
  medianEffectiveTokens: number | null;
  medianInitialReductionPercent: number | null;
  medianCost: null;
  medianTimeMs: null;
  costPerVerifiedOutcome: null;
  cachedInputPercent: null;
}

export interface HarnessEfficiencyBenchmarkReport {
  schema: 'agent-control.harness-efficiency-report/v1';
  benchmarkId: string;
  suiteId: string;
  generatedAt: string;
  classification: HarnessBenchmarkSuite['classification'];
  modelControl: {model: string; parameters: HarnessBenchmarkSuite['modelParameters']; sameModelAcrossProfiles: true; liveModelInvoked: false};
  verifier: string;
  measurement: {tokenMethod: 'deterministic_utf8_bytes_divided_by_3'; providerUsageAvailable: false; providerCostAvailable: false; cacheMetricsAvailable: false};
  frameworkLatency: {packetBuildAndReportMs: number | null; classification: 'LOCAL_HARNESS_OVERHEAD_NOT_MODEL_LATENCY'};
  startupTax: Record<HarnessProfileName, {medianTokens: number | null; componentMedians: Record<string, number | null>}>;
  results: HarnessBenchmarkTaskResult[];
  aggregates: Record<HarnessProfileName, HarnessBenchmarkAggregate>;
  conclusions: {
    boundedThinVerifiedSuccessRate: number;
    thinMedianStartupReductionVsStandardPercent: number | null;
    standardAdditionalVerifiedTasks: number;
    deepAdditionalVerifiedTasks: number;
    automaticRoutingSupportedByEvidence: false;
    reason: string;
  };
}

const PROFILE_RANK: Record<HarnessProfileName, number> = {THIN: 0, STANDARD: 1, DEEP: 2};

export function parseHarnessBenchmarkSuite(value: unknown): HarnessBenchmarkSuite {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('harness_benchmark_suite_invalid');
  const suite = value as HarnessBenchmarkSuite;
  if (suite.schema !== 'agent-control.harness-efficiency-suite/v1' || suite.classification !== 'DETERMINISTIC_HARNESS_SIMULATION_NOT_LIVE_MODEL_EVIDENCE') throw new Error('harness_benchmark_suite_schema_invalid');
  if (!suite.suiteId || !suite.model || !suite.verifier || !Array.isArray(suite.tasks) || suite.tasks.length < 1) throw new Error('harness_benchmark_suite_incomplete');
  const ids = new Set<string>();
  for (const task of suite.tasks) {
    if (!task.id || ids.has(task.id)) throw new Error(`harness_benchmark_task_id_invalid:${task.id}`); ids.add(task.id);
    if (!['THIN', 'STANDARD', 'DEEP'].includes(task.minimumProfile) || !Number.isFinite(task.taskContextTokens) || task.taskContextTokens < 0 || !Array.isArray(task.requiredTools) || !Array.isArray(task.requiredSkills)) throw new Error(`harness_benchmark_task_invalid:${task.id}`);
  }
  return structuredClone(suite);
}

export function runHarnessEfficiencyBenchmark(suiteInput: HarnessBenchmarkSuite, generatedAt = new Date().toISOString()): HarnessEfficiencyBenchmarkReport {
  const suite = parseHarnessBenchmarkSuite(suiteInput), builder = new ContextPacketBuilder(), profiles: HarnessProfileName[] = ['THIN', 'STANDARD', 'DEEP'];
  const componentRows: Record<HarnessProfileName, Array<Record<string, number>>> = {THIN: [], STANDARD: [], DEEP: []};
  const results = suite.tasks.flatMap(task => profiles.map(profile => {
    const sources = benchmarkSources(task, profile), fullKnowledgeTokens = sources.reduce((sum, source) => sum + (source.estimatedTokens ?? estimateTokens(source.content ?? '')), 0);
    try {
      const packet = builder.build(profile, sources), policy = DEFAULT_HARNESS_PROFILES[profile];
      const profileSufficient = PROFILE_RANK[profile] >= PROFILE_RANK[task.minimumProfile];
      const toolsFit = task.requiredTools.length <= policy.maximumTools, skillsFit = task.requiredSkills.length <= policy.maximumOptionalSkills;
      const success = profileSufficient && toolsFit && skillsFit;
      const turns = success ? ({THIN: 1, STANDARD: 2, DEEP: 3} as const)[profile] : 1;
      const components: Record<string, number> = {}; for (const entry of packet.entries) components[entry.kind] = (components[entry.kind] ?? 0) + entry.estimatedTokens; componentRows[profile].push(components);
      return {
        taskId: task.id, category: task.category, profile, model: suite.model, verifier: suite.verifier, success, verifierResult: success ? 'PASS' as const : 'FAIL' as const,
        failureReason: success ? null : !profileSufficient ? `profile_below_required:${task.minimumProfile}` : !toolsFit ? 'tool_budget_exceeded' : 'skill_budget_exceeded',
        startupContextTokens: packet.startupContextTokens, taskContextTokens: packet.taskContextTokens, initialContextTokens: packet.estimatedTokens, fullKnowledgeTokens,
        selectedExpansionTokens: success ? task.selectedExpansionTokens : 0, estimatedEffectiveTokens: packet.estimatedTokens * turns + (success ? task.selectedExpansionTokens : 0),
        initialReductionPercent: fullKnowledgeTokens ? (1 - packet.estimatedTokens / fullKnowledgeTokens) * 100 : 0, turns,
        freshTokens: null, cachedTokens: null, outputTokens: null, elapsedMs: null, providerReportedCost: null, calculatedCost: null,
        contextSourceIds: [...packet.sourceIds], omittedSourceIds: packet.omitted.map(item => item.id), toolCalls: 0,
        escalation: success ? null : profile === 'THIN' ? 'STANDARD' : profile === 'STANDARD' ? 'DEEP' : null,
      } satisfies HarnessBenchmarkTaskResult;
    } catch (error) {
      return {taskId: task.id, category: task.category, profile, model: suite.model, verifier: suite.verifier, success: false, verifierResult: 'FAIL', failureReason: error instanceof Error ? error.message : String(error), startupContextTokens: null, taskContextTokens: null, initialContextTokens: null, fullKnowledgeTokens, selectedExpansionTokens: 0, estimatedEffectiveTokens: null, initialReductionPercent: null, turns: 0, freshTokens: null, cachedTokens: null, outputTokens: null, elapsedMs: null, providerReportedCost: null, calculatedCost: null, contextSourceIds: [], omittedSourceIds: sources.map(source => source.id), toolCalls: 0, escalation: profile === 'THIN' ? 'STANDARD' : profile === 'STANDARD' ? 'DEEP' : null} satisfies HarnessBenchmarkTaskResult;
    }
  }));
  const aggregates = Object.fromEntries(profiles.map(profile => [profile, aggregateProfile(profile, results.filter(result => result.profile === profile))])) as Record<HarnessProfileName, HarnessBenchmarkAggregate>;
  const startupTax = Object.fromEntries(profiles.map(profile => [profile, {medianTokens: aggregates[profile].medianStartupTokens, componentMedians: componentMedians(componentRows[profile])}])) as HarnessEfficiencyBenchmarkReport['startupTax'];
  const thinBounded = results.filter(result => result.profile === 'THIN' && suite.tasks.find(task => task.id === result.taskId)?.minimumProfile === 'THIN');
  const thinReduction = percentReduction(aggregates.THIN.medianStartupTokens, aggregates.STANDARD.medianStartupTokens);
  const reportBase = {suiteId: suite.suiteId, frozenAt: suite.frozenAt, model: suite.model, parameters: suite.modelParameters, verifier: suite.verifier, tasks: suite.tasks};
  return {
    schema: 'agent-control.harness-efficiency-report/v1', benchmarkId: createHash('sha256').update(stableJson(reportBase)).digest('hex'), suiteId: suite.suiteId, generatedAt,
    classification: suite.classification, modelControl: {model: suite.model, parameters: structuredClone(suite.modelParameters), sameModelAcrossProfiles: true, liveModelInvoked: false}, verifier: suite.verifier,
    measurement: {tokenMethod: 'deterministic_utf8_bytes_divided_by_3', providerUsageAvailable: false, providerCostAvailable: false, cacheMetricsAvailable: false}, frameworkLatency: {packetBuildAndReportMs: null, classification: 'LOCAL_HARNESS_OVERHEAD_NOT_MODEL_LATENCY'}, startupTax, results, aggregates,
    conclusions: {
      boundedThinVerifiedSuccessRate: thinBounded.filter(result => result.success).length / Math.max(1, thinBounded.length),
      thinMedianStartupReductionVsStandardPercent: thinReduction,
      standardAdditionalVerifiedTasks: aggregates.STANDARD.verifiedSuccesses - aggregates.THIN.verifiedSuccesses,
      deepAdditionalVerifiedTasks: aggregates.DEEP.verifiedSuccesses - aggregates.STANDARD.verifiedSuccesses,
      automaticRoutingSupportedByEvidence: false,
      reason: 'The frozen run proves deterministic packet, routing and verifier behaviour, but it did not execute a live model or observe provider billing/cache usage.',
    },
  };
}

export function renderHarnessEfficiencyReport(report: HarnessEfficiencyBenchmarkReport): string {
  const profiles: HarnessProfileName[] = ['THIN', 'STANDARD', 'DEEP'];
  const percent = (value: number | null) => value === null ? 'unknown' : `${value.toFixed(1)}%`;
  const number = (value: number | null) => value === null ? 'unknown' : Math.round(value).toLocaleString('en-US');
  const startupRows = profiles.map(profile => `| ${profile} | ${number(report.startupTax[profile].medianTokens)} | ${number(report.startupTax[profile].componentMedians.tool_schemas ?? null)} | ${number(report.startupTax[profile].componentMedians.task_context ?? null)} |`).join('\n');
  const executionRows = report.results.map(result => `| ${result.taskId} | ${result.profile} | ${result.turns} | unknown | unknown | unknown | unknown | ${result.verifierResult} |`).join('\n');
  const efficiencyRows = profiles.map(profile => { const item = report.aggregates[profile]; return `| ${profile} | ${percent(item.successRate * 100)} | ${number(item.medianEffectiveTokens)} | unknown | unknown | unknown |`; }).join('\n');
  const frameworkLatency = report.frameworkLatency.packetBuildAndReportMs === null
    ? 'unknown'
    : `${report.frameworkLatency.packetBuildAndReportMs.toFixed(1)} ms`;
  return `# Harness efficiency report\n\nGenerated: ${report.generatedAt}\n\nClassification: **${report.classification}**. This is a deterministic context-and-routing experiment using one frozen model identity; it is not live model, billing, latency or cache evidence.\n\nLocal packet-build and report overhead: **${frameworkLatency}** (${report.frameworkLatency.classification}).\n\n## Harness startup tax\n\nStartup counts are deterministic estimates of persistent context. Task context is reported separately and provider billing behaviour is unknown.\n\n| Profile | Median startup tokens | Median tool tokens | Median task-context tokens |\n| --- | ---: | ---: | ---: |\n${startupRows}\n\nTHIN median startup reduction versus STANDARD: **${percent(report.conclusions.thinMedianStartupReductionVsStandardPercent)}**.\n\n## Execution\n\nFresh, cached, output and cost remain unknown because the benchmark did not invoke a provider.\n\n| Task | Profile | Turns (simulated) | Fresh tokens | Cached tokens | Output | Cost | Verifier |\n| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |\n${executionRows}\n\n## Efficiency\n\n| Profile | Deterministic verifier success | Median effective estimated tokens | Median cost | Median time | Cost / verified success |\n| --- | ---: | ---: | ---: | ---: | ---: |\n${efficiencyRows}\n\n- THIN passed ${(report.conclusions.boundedThinVerifiedSuccessRate * 100).toFixed(1)}% of jobs frozen as bounded/THIN-suitable, but failed jobs requiring wider context.\n- STANDARD verified ${report.conclusions.standardAdditionalVerifiedTasks} additional tasks beyond THIN.\n- DEEP verified ${report.conclusions.deepAdditionalVerifiedTasks} additional architectural/high-ambiguity tasks beyond STANDARD.\n- Automatic routing supported by this evidence: **NO**. ${report.conclusions.reason}\n\n## Largest context contributors\n\nTask-selected repository context dominates DEEP workloads. Persistent workspace/bootstrap, shared memory, conversation history and optional tool material are repeatedly injected in STANDARD/DEEP; THIN filters these unless required. Token-aware search and selected expansion remain the preferred way to retrieve repository evidence.\n\n## Limitations\n\nNo provider was invoked in this deterministic run, so fresh/cached/cache-write/reasoning tokens, price data and cost per verified outcome are null in its authoritative JSON. The companion controlled live report records real same-model token, cache and latency evidence, but it is not repository-mutation evidence and therefore does not production-qualify automatic routing.\n`;
}

function benchmarkSources(task: HarnessBenchmarkTask, profile: HarnessProfileName): ContextPacketSource[] {
  const optionalToolCount = {THIN: 0, STANDARD: 8, DEEP: 24}[profile], historyTokens = {THIN: 120, STANDARD: 1_200, DEEP: 3_600}[profile];
  const genericTool = (id: string) => ({id, description: `Typed allowlisted capability ${id}`, input: {type: 'object', additionalProperties: false}});
  return [
    {id: `${task.id}:system`, kind: 'system_instructions', content: profile === 'THIN' ? 'Perform the bounded task using only supplied evidence. Stop when the verifier contract is satisfied.' : profile === 'STANDARD' ? 'Perform the task with supplied evidence, inspect uncertainty, use only granted tools, and return evidence for independent verification.' : 'Perform complex governed work. Trace dependencies, preserve alternative hypotheses, use only granted tools, checkpoint progress, and return independent verification evidence.', required: true, persistent: true, relevance: 1, provenanceIds: ['benchmark:system']},
    {id: `${task.id}:control`, kind: 'agent_control_instructions', content: 'Agent Control retains scheduling, leases, batons, approvals, protected workload policy, tool authority, human takeover, cancellation, recovery and verification. Model completion is not acceptance.', required: true, persistent: true, relevance: 1, provenanceIds: ['policy:agent-control']},
    {id: `${task.id}:required-tools`, kind: 'tool_schemas', content: JSON.stringify(task.requiredTools.map(genericTool)), required: true, persistent: true, relevance: 1, provenanceIds: ['benchmark:tools']},
    {id: `${task.id}:optional-tools`, kind: 'tool_schemas', content: JSON.stringify(Array.from({length: optionalToolCount}, (_, index) => genericTool(`optional.tool.${index}`))), persistent: true, relevance: .4, provenanceIds: ['benchmark:tools']},
    {id: `${task.id}:skills`, kind: 'skills', content: JSON.stringify(task.requiredSkills.map(id => ({id, qualification: 'frozen'}))), required: task.requiredSkills.length > 0, persistent: true, relevance: .9, provenanceIds: ['benchmark:skills']},
    {id: `${task.id}:bootstrap`, kind: 'workspace_bootstrap', estimatedTokens: 900, persistent: true, relevance: .5, provenanceIds: ['benchmark:workspace']},
    {id: `${task.id}:memory`, kind: 'memory_shared_context', estimatedTokens: 1_600, persistent: true, relevance: .45, provenanceIds: ['benchmark:memory']},
    {id: `${task.id}:repository-rules`, kind: 'repository_instructions', estimatedTokens: 520, required: true, persistent: true, relevance: 1, provenanceIds: ['benchmark:repository-rules']},
    {id: `${task.id}:task`, kind: 'task_context', estimatedTokens: task.taskContextTokens, required: true, persistent: false, relevance: 1, provenanceIds: [`benchmark:task:${task.id}`]},
    {id: `${task.id}:history`, kind: 'conversation_history', estimatedTokens: historyTokens, persistent: false, relevance: .4, provenanceIds: ['benchmark:history']},
    {id: `${task.id}:architecture-neighbourhood`, kind: 'task_context', estimatedTokens: 8_000, broad: true, relevance: task.architectural ? .95 : .25, provenanceIds: ['benchmark:graph-neighbourhood']},
  ];
}

function aggregateProfile(profile: HarnessProfileName, rows: HarnessBenchmarkTaskResult[]): HarnessBenchmarkAggregate {
  return {profile, tasks: rows.length, verifiedSuccesses: rows.filter(row => row.success).length, successRate: rows.filter(row => row.success).length / Math.max(1, rows.length), medianStartupTokens: median(rows.flatMap(row => row.startupContextTokens === null ? [] : [row.startupContextTokens])), medianInitialTokens: median(rows.flatMap(row => row.initialContextTokens === null ? [] : [row.initialContextTokens])), medianEffectiveTokens: median(rows.flatMap(row => row.estimatedEffectiveTokens === null ? [] : [row.estimatedEffectiveTokens])), medianInitialReductionPercent: median(rows.flatMap(row => row.initialReductionPercent === null ? [] : [row.initialReductionPercent])), medianCost: null, medianTimeMs: null, costPerVerifiedOutcome: null, cachedInputPercent: null};
}
function componentMedians(rows: Array<Record<string, number>>) { const keys = [...new Set(rows.flatMap(row => Object.keys(row)))].sort(); return Object.fromEntries(keys.map(key => [key, median(rows.flatMap(row => row[key] === undefined ? [] : [row[key]]))])); }
function median(values: number[]): number | null { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function percentReduction(smaller: number | null, larger: number | null) { return smaller === null || larger === null || larger === 0 ? null : (1 - smaller / larger) * 100; }
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`; return JSON.stringify(value); }

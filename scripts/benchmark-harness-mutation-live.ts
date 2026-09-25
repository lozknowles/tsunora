import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync, gzipSync} from 'node:zlib';
import {AdaptiveHarness, SkillCatalog, ToolPolicy, type HarnessCandidate, type RecipeRequest} from '../src/control/adaptive-harness.js';
import {createToolHandlerRegistry, HarnessDispatcher, MemoryRecipeDispatchStore} from '../src/control/harness-dispatch.js';
import {
  HarnessEscalationController,
  HarnessProfileRouter,
  MemoryHarnessEfficiencyLedger,
  type HarnessProfileName,
  type ModelInvocationObservation,
} from '../src/control/harness-efficiency.js';
import {
  aggregateInvocationUsage,
  aggregateOutcomeUsage,
  classifyMutationEscalation,
  createMutationQualificationReport,
  parseMutationBenchmarkSuite,
  predictMutationContextProfile,
  renderMutationQualificationReport,
  type MutationAttemptResult,
  type MutationBenchmarkTask,
  type MutationOutcomeResult,
  type MutationStrategy,
} from '../src/control/harness-mutation-benchmark.js';
import {
  buildMutationContextPacket,
  buildMutationContextSources,
  renderMutationInstruction,
  selectMutationPacketSources,
  type MutationCheckpointContext,
} from '../src/control/harness-mutation-context.js';
import {verifyMutationWorkspace} from '../src/control/harness-mutation-verifier.js';
import {MUTATION_TOOL_DEFINITIONS, MUTATION_TOOL_IDS, MUTATION_TOOL_SCHEMAS, MutationWorkspace, fixtureContentSha256} from '../src/control/harness-mutation-workspace.js';
import {StructuredChatLoopProvider} from '../src/control/structured-chat-loop-provider.js';
import {StructuredChatProviderFactory} from '../src/control/structured-chat-provider.js';
import {GovernedRetrievalRuntime,RepositoryTextRetrievalProvider,SpawnZgSearchExecutor,ZgRetrievalProvider,evidencePacketContextSource,evidenceReferences,type RetrievalStrategy} from '../src/control/governed-retrieval.js';

const baseUrl = required('AGENT_CONTROL_HARNESS_MUTATION_BASE_URL').replace(/\/$/, '');
const modelId = required('AGENT_CONTROL_HARNESS_MUTATION_MODEL');
const endpoint = new URL(baseUrl);
const loopback = ['127.0.0.1', 'localhost', '::1'].includes(endpoint.hostname);
if (!loopback && process.env.AGENT_CONTROL_HARNESS_MUTATION_ALLOW_REMOTE !== 'true') throw new Error('mutation_benchmark_endpoint_must_be_loopback_or_explicitly_approved');
const root = process.cwd();
const suiteFile = path.resolve(process.env.AGENT_CONTROL_HARNESS_MUTATION_SUITE || path.join(root, 'benchmarks', 'harness-mutation-jobs.json'));
const jsonFile = path.resolve(process.env.AGENT_CONTROL_HARNESS_MUTATION_RESULT || path.join(root, 'artifacts', 'harness-mutation-report.json'));
const markdownFile = path.resolve(process.env.AGENT_CONTROL_HARNESS_MUTATION_MARKDOWN || path.join(root, 'docs', 'harness-mutation-report.md'));
const partialFile = path.resolve(process.env.AGENT_CONTROL_HARNESS_MUTATION_PARTIAL || path.join(root, 'artifacts', 'harness-mutation-partial.json'));
const evidenceDirectory = path.resolve(process.env.AGENT_CONTROL_HARNESS_MUTATION_EVIDENCE || path.join(root, 'artifacts', 'harness-mutation-evidence'));
assertProjectOutput(jsonFile); assertProjectOutput(markdownFile); assertProjectOutput(partialFile); assertProjectOutput(evidenceDirectory);
const suite = parseMutationBenchmarkSuite(JSON.parse(fs.readFileSync(suiteFile, 'utf8')));
const fixtureRoot = path.resolve(root, suite.fixturePath);
if (fixtureContentSha256(fixtureRoot) !== suite.fixtureSha256) throw new Error('mutation_fixture_hash_mismatch');
const taskLimit = optionalInteger('AGENT_CONTROL_HARNESS_MUTATION_TASK_LIMIT', 1, suite.tasks.length);
const tasks = taskLimit === undefined ? suite.tasks : suite.tasks.slice(0, taskLimit);
const includePredicted = process.env.AGENT_CONTROL_HARNESS_MUTATION_INCLUDE_PREDICTED === 'true';
const allStrategies: MutationStrategy[] = ['THIN_ONLY', 'STANDARD_ONLY', 'DEEP_ONLY', 'ADAPTIVE_THIN_STANDARD_DEEP', ...(includePredicted ? ['PREDICTED_ADAPTIVE' as const] : [])];
const requestedStrategies=(process.env.AGENT_CONTROL_HARNESS_MUTATION_STRATEGIES??'').split(',').map(value=>value.trim()).filter(Boolean) as MutationStrategy[];
if(requestedStrategies.some(value=>!allStrategies.includes(value)))throw new Error('mutation_benchmark_strategy_invalid');
const strategies:MutationStrategy[]=requestedStrategies.length?requestedStrategies:allStrategies;
const retrievalMode=(process.env.AGENT_CONTROL_HARNESS_MUTATION_RETRIEVAL_MODE??'CONVENTIONAL').toUpperCase() as 'CONVENTIONAL'|'BUILTIN'|'ZG';
if(!['CONVENTIONAL','BUILTIN','ZG'].includes(retrievalMode))throw new Error('mutation_benchmark_retrieval_mode_invalid');
const resume = process.env.AGENT_CONTROL_HARNESS_MUTATION_RESUME === 'true';
const maximumContextTokens = optionalInteger('AGENT_CONTROL_HARNESS_MUTATION_CONTEXT_TOKENS', 1_024, 1_000_000) ?? 48_000;
const maximumOutputTokens = optionalInteger('AGENT_CONTROL_HARNESS_MUTATION_OUTPUT_TOKENS', 64, 4_096) ?? 768;
const bearerToken = process.env.AGENT_CONTROL_HARNESS_MUTATION_BEARER_TOKEN;

await requireHealthyEndpoint();
const modelsResponse = await fetch(`${baseUrl}/models`, {headers: authorizationHeaders(), signal: AbortSignal.timeout(10_000)});
const modelsBody = await modelsResponse.json() as {data?: Array<{id?: string}>};
if (!modelsResponse.ok) throw new Error(`mutation_model_discovery_failed:${modelsResponse.status}`);
if (!modelsBody.data?.some(model => model.id === modelId)) throw new Error('mutation_model_identity_mismatch');
const modelListSha256 = createHash('sha256').update(JSON.stringify(modelsBody)).digest('hex');

const providerId = 'governed-mutation-openai-compatible';
const workerId = 'disposable-mutation-worker';
const providerFactory = new StructuredChatProviderFactory({
  provider: {id: providerId, name: 'Governed mutation benchmark provider', kind: 'local', baseUrl, requiresAuth: Boolean(bearerToken), parallelism: 1, costClass: 'included', capabilities: ['structured-output', 'tool-request']},
  workerId, modelId,
  workerCapabilities: ['model.execute', 'repository.mutation.typed', 'repository.verify.public'],
  modelCapabilities: ['structured-output', 'tool-request'], availableToolIds: MUTATION_TOOL_DEFINITIONS.map(tool => tool.id),
  qualificationEvidence: [`models-http-${modelsResponse.status}`, `models-sha256-${modelListSha256}`], health: 'healthy',
});
const loop = new StructuredChatLoopProvider({providerId, modelId, baseUrl, toolSchemas: MUTATION_TOOL_SCHEMAS, finishToolId: MUTATION_TOOL_IDS.finish, maximumOutputTokens, authorization: () => bearerToken, executionStrategy: 'real-repository-mutation.bounded-json-tools'});
const toolPolicy = new ToolPolicy(MUTATION_TOOL_DEFINITIONS);
const profileRouter = new HarnessProfileRouter({mode: 'EXPERIMENT', minimumVerifiedRuns: 20, minimumSuccessRate: .95, minimumSameModelControlledRuns: 20});
const harness = new AdaptiveHarness(new SkillCatalog(), toolPolicy, undefined, profileRouter);
const escalation = new HarnessEscalationController();
const ledger = new MemoryHarnessEfficiencyLedger();
const prior = resume ? readPartial(partialFile, suite.suiteId, modelId, providerId) : [];
const outcomes: MutationOutcomeResult[] = sealLegacyPatchEvidence([...prior]);
fs.mkdirSync(path.dirname(jsonFile), {recursive: true});
fs.mkdirSync(path.dirname(markdownFile), {recursive: true});
fs.mkdirSync(evidenceDirectory, {recursive: true});

for (const strategy of strategies) {
  for (const task of tasks) {
    if (outcomes.some(outcome => outcome.strategy === strategy && outcome.taskId === task.id)) continue;
    const outcome = await runOutcome(strategy, task);
    outcomes.push(outcome);
    writeJsonAtomic(partialFile, {schema: 'agent-control.harness-mutation-partial/v1', suiteId: suite.suiteId, model: modelId, provider: providerId, modelListSha256, updatedAt: new Date().toISOString(), outcomes});
    process.stdout.write(`${JSON.stringify({event: 'mutation_outcome_complete', taskId: task.id, strategy, verifiedSuccess: outcome.verifiedSuccess, attempts: outcome.attempts.length, finalProfile: outcome.finalProfile, freshInputTokens: outcome.cumulativeUsage.freshInputTokens, cachedInputTokens: outcome.cumulativeUsage.cachedInputTokens, elapsedMs: outcome.cumulativeLatencyMs})}\n`);
    await requireHealthyEndpoint();
  }
}

writeJsonAtomic(partialFile, {schema: 'agent-control.harness-mutation-partial/v1', suiteId: suite.suiteId, model: modelId, provider: providerId, modelListSha256, updatedAt: new Date().toISOString(), outcomes});
const standaloneProfiles: Array<{strategy: MutationStrategy; profile: HarnessProfileName}> = [{strategy: 'THIN_ONLY', profile: 'THIN'}, {strategy: 'STANDARD_ONLY', profile: 'STANDARD'}, {strategy: 'DEEP_ONLY', profile: 'DEEP'}];
for (const outcome of outcomes) {
  outcome.actualSuccessfulMinimumProfile = standaloneProfiles.find(item => outcomes.some(candidate => candidate.taskId === outcome.taskId && candidate.strategy === item.strategy && candidate.verifiedSuccess))?.profile ?? null;
}
const safety = qualifySafetyBoundaries();
const report = createMutationQualificationReport({suite: {...suite, tasks}, generatedAt: new Date().toISOString(), model: modelId, provider: providerId, outcomes, safety});
writeJsonAtomic(jsonFile, {...report,contextMode:retrievalMode});
writeTextAtomic(markdownFile, renderMutationQualificationReport(report));
await requireHealthyEndpoint();
process.stdout.write(`${JSON.stringify({schema: report.schema, benchmarkId: report.benchmarkId, classification: report.classification,contextMode:retrievalMode, modelControl: report.modelControl, endpoint: {scope: loopback ? 'loopback' : 'explicit-private-remote', modelListSha256}, fixture: report.fixture, aggregates: report.aggregates, productionRoutingGate: report.productionRoutingGate, conclusions: report.conclusions, files: [jsonFile, markdownFile, partialFile, evidenceDirectory]}, null, 2)}\n`);
if (!outcomes.some(outcome => outcome.verifiedSuccess)) process.exitCode = 1;

async function runOutcome(strategy: MutationStrategy, task: MutationBenchmarkTask): Promise<MutationOutcomeResult> {
  const prediction = predictMutationContextProfile(task);
  const startingProfile = strategy === 'THIN_ONLY' || strategy === 'ADAPTIVE_THIN_STANDARD_DEEP' ? 'THIN' : strategy === 'STANDARD_ONLY' ? 'STANDARD' : strategy === 'DEEP_ONLY' ? 'DEEP' : prediction.profile;
  const prepared = MutationWorkspace.prepare(fixtureRoot, task);
  const authority = {laneId: `mutation:${task.id}:${strategy}`, leaseGeneration: 1, ownershipGeneration: 1, owner: 'agent' as const};
  const handlers = createToolHandlerRegistry(prepared.workspace.toolBindings());
  const store = new MemoryRecipeDispatchStore();
  const dispatcher = new HarnessDispatcher(harness, toolPolicy, handlers, () => ({authority, workerId, availableToolIds: MUTATION_TOOL_DEFINITIONS.map(tool => tool.id), approvedRisks: ['read', 'write']}), store, undefined, undefined, ledger);
  const attempts: MutationAttemptResult[] = [];
  const attemptedProfiles: HarnessProfileName[] = [];
  let profile = startingProfile, checkpoint: MutationCheckpointContext | undefined;
  try {
    while (true) {
      const attempt = await runAttempt(task, strategy, profile, attempts.length + 1, prepared.workspace, dispatcher, authority, checkpoint);
      attempts.push(attempt); attemptedProfiles.push(profile);
      if (attempt.verifiedSuccess || !task.escalationPermitted || !adaptive(strategy) || !attempt.escalationReason) break;
      const decision = escalation.next(profile, attemptedProfiles, attempt.escalationReason, {contextPacketId: attempt.contextPacketId, checkpointRef: attempt.checkpointDiffSha256});
      if (decision.action !== 'ESCALATE' || !decision.to) break;
      checkpoint = {priorProfile: profile, reason: decision.reason, changedFiles: attempt.verifier.changedFiles, diffSha256: attempt.checkpointDiffSha256, verifierFailures: attempt.verifier.checks.filter(check => !check.passed).map(check => `${check.id}:${check.detail}`)};
      profile = decision.to;
    }
    const final = attempts[attempts.length - 1];
    return {
      outcomeId: `${suite.suiteId}:${task.id}:${strategy}`, taskId: task.id, taskClass: task.taskClass, strategy, predictedContextProfile: prediction,
      actualSuccessfulMinimumProfile: null, startingProfile, attempts, escalationCount: Math.max(0, attempts.length - 1), verifiedSuccess: final.verifiedSuccess, finalProfile: final.profile,
      cumulativeUsage: aggregateOutcomeUsage(attempts), cumulativeTurns: attempts.reduce((sum, attempt) => sum + attempt.turns, 0), cumulativeToolCalls: attempts.reduce((sum, attempt) => sum + attempt.toolCalls, 0), cumulativeLatencyMs: attempts.reduce((sum, attempt) => sum + attempt.elapsedMs, 0),
      monetaryCost: null, monetaryCostReason: 'No authoritative provider price or reported cost was available.', finalVerifier: final.verifier,
      provenance: {fixtureSha256: prepared.fixtureSha256, startingRevision: prepared.startingRevision, attemptIds: attempts.map(attempt => attempt.attemptId), evidenceIds: [...new Set(attempts.flatMap(attempt => attempt.evidenceIds))].sort()},
    };
  } finally { prepared.workspace.cleanup(); }
}

async function runAttempt(task: MutationBenchmarkTask, strategy: MutationStrategy, profile: HarnessProfileName, attemptNumber: number, workspace: MutationWorkspace, dispatcher: HarnessDispatcher, authority: {laneId: string; leaseGeneration: number; ownershipGeneration: number; owner: 'agent'}, checkpoint?: MutationCheckpointContext): Promise<MutationAttemptResult> {
  const attemptId = `${suite.suiteId}:${task.id}:${strategy}:${attemptNumber}:${profile}`;
  const jobId = `${suite.suiteId}:${task.id}:${strategy}`;
  const prediction = predictMutationContextProfile(task);
  const preparedContext = await buildPhase2Context(task, checkpoint);
  const sources = preparedContext.sources;
  const availableContextTokens = Math.min(maximumContextTokens, Math.max(1_024, Math.floor(task.tokenBudget * .7)));
  const packet = buildMutationContextPacket(profile, sources, availableContextTokens);
  const selected = selectMutationPacketSources(packet, sources);
  const signals = {taskId: task.id, complexity: complexity(task), risk: task.features.risk, knownExactTargets: task.features.knownExactTargets, estimatedFiles: task.features.estimatedFiles, deterministicVerifier: true, ambiguity: task.features.ambiguity, architectural: task.features.architecturalTerms, requestedProfile: profile};
  const request: RecipeRequest = {
    taskId: attemptId, jobId, runId: attemptId, taskType: task.taskClass,
    requiredCapabilities: ['model.execute', 'structured-output', 'tool-request', 'repository.mutation.typed'], requiredTools: MUTATION_TOOL_DEFINITIONS.map(tool => tool.id), approvedRisks: ['read', 'write'],
    intent: 'ECONOMY', inputTokens: packet.estimatedTokens, outputTokens: maximumOutputTokens, maximumLatencyMs: task.timeoutMs,
    context: {tier: {THIN: 0, STANDARD: 1, DEEP: 2}[profile], sourceIds: packet.sourceIds, evidenceIds: packet.provenanceIds, estimatedTokens: packet.estimatedTokens, packetId: packet.id, omittedSourceIds: packet.omitted.map(item => item.id), provenanceIds: packet.provenanceIds},
    contextPacket: packet, contextStrategyId: `mutation-${profile.toLowerCase()}-v1`, authority,
    verification: {requiredEvidence: [`hidden_verifier:${task.verifierId}`, 'public-tests', 'git-diff-check'], requireIndependentCheck: true},
    escalation: {minimumConfidence: .8, maximumAttempts: adaptive(strategy) ? 3 : 1, onFailure: 'review'}, harnessRouting: signals,
  };
  const baseCandidate = providerFactory.candidate();
  const candidate: HarnessCandidate = {...baseCandidate, supportedHarnessProfiles: ['THIN', 'STANDARD', 'DEEP'], runtime: {...baseCandidate.runtime, executionStrategy: 'real-repository-mutation.bounded-json-tools', maximumProcessedTokens: task.tokenBudget, remainingContextTokens: availableContextTokens}};
  const startedAt = new Date().toISOString(), started = performance.now();
  workspace.resetCounters();
  let recipeId: string | null = null, invocationIds: string[] = [], executionError: string | null = null, executionEvidence: string[] = [];
  try {
    const result = await dispatcher.dispatch({request, candidates: [candidate], placement: {workerId, reason: 'capability_match:model.execute+repository.mutation.typed'}}, loop.executor(renderMutationInstruction(task, profile, checkpoint), selected));
    recipeId = result.recipe.id; invocationIds = result.invocationIds; executionEvidence = result.execution.evidence ?? []; executionError = result.execution.error ?? null;
  } catch (error) {
    executionError = boundedError(error);
    invocationIds = error && typeof error === 'object' && Array.isArray((error as {efficiencyInvocationIds?: unknown}).efficiencyInvocationIds) ? (error as {efficiencyInvocationIds: string[]}).efficiencyInvocationIds : [];
  }
  const verifier = await verifyMutationWorkspace(workspace, task);
  const verifiedSuccess = verifier.passed && !executionError;
  if (invocationIds.length) ledger.markVerification(invocationIds, verifiedSuccess ? 'PASS' : 'FAIL', verifiedSuccess ? 'SUCCEEDED' : executionError?.includes('cancel') ? 'CANCELLED' : 'FAILED');
  const invocations = invocationIds.map(id => ledger.list().find(item => item.id === id)).filter((item): item is ModelInvocationObservation => item !== undefined);
  const counters = workspace.getCounters(), usage = aggregateInvocationUsage(invocations);
  const failureReason = verifiedSuccess ? null : executionError ?? verifier.checks.find(check => !check.passed)?.detail ?? 'verifier_rejected';
  const escalationReason = verifiedSuccess ? null : classifyMutationEscalation(task, profile, verifier, executionError);
  const patch = workspace.diff(), patchName = `${task.id.toLowerCase()}-${strategy.toLowerCase()}-attempt-${attemptNumber}.patch.gz`, patchFile = path.join(evidenceDirectory, patchName);
  const securityPassed = verifier.checks.find(check => check.id === 'credential_and_topology_scan')?.passed === true;
  if (patch && securityPassed) writePatchEvidence(patchFile, patch, verifier.diffSha256);
  const evidenceIds = [...new Set([...executionEvidence, ...invocationIds.map(id => `invocation:${id}`), `context_packet:${packet.id}`,...(preparedContext.retrieval?.references??[]), `diff_sha256:${verifier.diffSha256}`, ...(patch && securityPassed ? [`patch:${path.relative(root, patchFile).split(path.sep).join('/')}`] : [])])].sort();
  return {
    attemptId, taskId: task.id, strategy, profile, attemptNumber, startedAt, completedAt: new Date().toISOString(), elapsedMs: performance.now() - started,
    predictedProfile: prediction.profile, predictionConfidence: prediction.confidence, predictionReasons: prediction.reasons,
    contextPacketId: packet.id, contextSourceIds: packet.sourceIds, omittedContextSourceIds: packet.omitted.map(item => item.id), recipeId, invocationIds, usage,
    initialProviderInputTokens: invocations[0]?.usage.inputTokens ?? null, persistentEstimatedContextTokens: invocations[0]?.startup.startupContextTokens ?? null,
    turns: invocations.length, toolCalls: counters.toolCalls, toolIds: [...counters.toolIds], repositoryReads: counters.repositoryReads, repositorySearches: counters.repositorySearches, mutationsAttempted: counters.mutationsAttempted,
    verifierAttempts: 1, verifier, verifiedSuccess, failureReason, escalationReason, checkpointDiffSha256: verifier.diffSha256, evidenceIds,retrieval:preparedContext.retrieval,
  };
}

async function buildPhase2Context(task:MutationBenchmarkTask,checkpoint?:MutationCheckpointContext){
  const conventional=buildMutationContextSources(suite,task,fixtureRoot,checkpoint);
  if(retrievalMode==='CONVENTIONAL')return{sources:conventional};
  const retrievalRoot=path.resolve(process.env.AGENT_CONTROL_HARNESS_MUTATION_RETRIEVAL_ROOT??fixtureRoot),gitSha=suite.fixtureSha256,exactTerms=[...task.allowedFiles,...(task.description.match(/[A-Za-z_][A-Za-z0-9_]{3,}/g)??[]).filter(value=>value.includes('_')||/[a-z][A-Z]/.test(value)||/^[A-Z0-9_]{3,}$/.test(value))].slice(0,16),providers=retrievalMode==='BUILTIN'?[new RepositoryTextRetrievalProvider('exact'),new RepositoryTextRetrievalProvider('lexical')]:[new ZgRetrievalProvider(new SpawnZgSearchExecutor(required('ZG_EXECUTABLE')))],progression:RetrievalStrategy[]=retrievalMode==='BUILTIN'?['EXACT','LEXICAL']:['HYBRID'],runtime=new GovernedRetrievalRuntime(providers,{enabled:true,progression,maximumCalls:retrievalMode==='BUILTIN'?2:1,maximumEvidenceItems:12,maximumEvidenceTokens:8_192,requiredCoverage:.45,minimumConfidence:0}),requiredSources=conventional.filter(source=>source.required||['system_instructions','agent_control_instructions','tool_schemas'].includes(source.kind));
  try {
    const packet=await runtime.retrieve({id:`phase2:${retrievalMode}:${task.id}`,parcelId:`phase2:${task.id}`,taskType:task.taskClass,query:task.description,exactTerms,scopes:task.allowedFiles,repository:{repositoryId:`mutation-fixture:${suite.fixtureSha256}`,root:retrievalRoot,gitSha,dirty:false},maximumEvidenceTokens:8_192,requiredCoverage:.45,minimumConfidence:0});
    const evidence=evidencePacketContextSource(packet);
    return{sources:[...requiredSources,evidence],retrieval:{mode:retrievalMode,outcome:'SUCCEEDED' as const,packetId:packet.id,packetSha256:packet.sha256,assessment:packet.assessment.status,providerId:packet.items[0]?.providerId??'unknown',strategy:packet.items[0]?.method??progression.at(-1)!,evidenceBytes:Buffer.byteLength(evidence.content??''),evidenceTokens:packet.estimatedTokens,retrievalCalls:runtime.projection().attempts.length,latencyMs:packet.retrievalLatencyMs,rawBytesAvoided:packet.rawBytesAvoided,references:evidenceReferences(packet),fallbackReason:null}};
  } catch(error) {
    const attempts=runtime.projection().attempts, last=attempts.at(-1);
    const fallbackSources=conventional.filter(source=>source.required||source.id.endsWith(':targeted-files')||source.id.endsWith(':workspace-index')||source.id.includes(':checkpoint:'));
    return{sources:fallbackSources,retrieval:{mode:retrievalMode,outcome:'GOVERNED_FALLBACK' as const,packetId:null,packetSha256:null,assessment:last?.evidenceStatus??'EVIDENCE_INSUFFICIENT',providerId:last?.providerId??'none',strategy:last?.strategy??progression.at(-1)!,evidenceBytes:fallbackSources.reduce((sum,source)=>sum+Buffer.byteLength(source.content??''),0),evidenceTokens:Math.ceil(fallbackSources.reduce((sum,source)=>sum+Buffer.byteLength(source.content??''),0)/4),retrievalCalls:attempts.length,latencyMs:attempts.reduce((sum,attempt)=>sum+attempt.latencyMs,0),rawBytesAvoided:0,references:[],fallbackReason:boundedError(error)}};
  }
}

function qualifySafetyBoundaries() {
  const authority = {laneId: 'safety', leaseGeneration: 2, ownershipGeneration: 3, owner: 'agent' as const};
  const recipe = {authority, workerId: 'worker', tools: MUTATION_TOOL_DEFINITIONS} as never;
  const allowed = toolPolicy.authorize(recipe, MUTATION_TOOL_IDS.read, {authority, workerId: 'worker', approvedRisks: ['read']});
  const staleLease = toolPolicy.authorize(recipe, MUTATION_TOOL_IDS.read, {authority: {...authority, leaseGeneration: 4}, workerId: 'worker', approvedRisks: ['read']});
  const staleOwnership = toolPolicy.authorize(recipe, MUTATION_TOOL_IDS.read, {authority: {...authority, ownershipGeneration: 4}, workerId: 'worker', approvedRisks: ['read']});
  const human = toolPolicy.authorize(recipe, MUTATION_TOOL_IDS.read, {authority: {...authority, owner: 'human'}, workerId: 'worker', approvedRisks: ['read']});
  const fallback = new HarnessProfileRouter({mode: 'OBSERVE', minimumVerifiedRuns: 20, minimumSuccessRate: .95, minimumSameModelControlledRuns: 20}).route({taskId: 'safety', complexity: .1, risk: 'low', knownExactTargets: true, estimatedFiles: 1, deterministicVerifier: true, ambiguity: .1, architectural: false});
  const source = [
    path.join(root, 'src', 'control', 'harness-mutation-benchmark.ts'),
    path.join(root, 'src', 'control', 'harness-mutation-context.ts'),
    path.join(root, 'src', 'control', 'harness-mutation-workspace.ts'),
    path.join(root, 'scripts', 'benchmark-harness-mutation-live.ts'),
  ].map(file => fs.readFileSync(file, 'utf8')).join('\n');
  const neutrality = !/(?:modelId|providerId)\s*={2,3}\s*['"][^'"]+['"]|(?:\/fast\/|[A-Za-z]:\\\\Users\\\\)/.test(source);
  return {toolPolicy: allowed.allowed && !human.allowed, staleLease: !staleLease.allowed && staleLease.reason === 'stale_lease_generation', staleOwnership: !staleOwnership.allowed && staleOwnership.reason === 'stale_ownership_generation', humanTakeover: !human.allowed && human.reason === 'human_owns_execution', fallback: fallback.appliedProfile === 'STANDARD', neutrality};
}

function readPartial(file: string, suiteId: string, model: string, provider: string): MutationOutcomeResult[] {
  if (!fs.existsSync(file)) return [];
  const value = JSON.parse(fs.readFileSync(file, 'utf8')) as {schema?: string; suiteId?: string; model?: string; provider?: string; outcomes?: MutationOutcomeResult[]};
  if (value.schema !== 'agent-control.harness-mutation-partial/v1' || value.suiteId !== suiteId || value.model !== model || value.provider !== provider || !Array.isArray(value.outcomes)) throw new Error('mutation_partial_identity_mismatch');
  return structuredClone(value.outcomes);
}
function sealLegacyPatchEvidence(values: MutationOutcomeResult[]): MutationOutcomeResult[] {
  const authoritativeDirectory = path.resolve(evidenceDirectory);
  const sealIds = (ids: string[], expectedSha256: string) => ids.map(id => {
    if (!id.startsWith('patch:') || id.endsWith('.patch.gz')) return id;
    const relative = id.slice('patch:'.length);
    if (!relative.endsWith('.patch')) throw new Error('mutation_patch_evidence_extension_invalid');
    const source = path.resolve(root, relative), boundary = path.relative(authoritativeDirectory, source);
    if (boundary.startsWith('..') || path.isAbsolute(boundary)) throw new Error('mutation_patch_evidence_outside_directory');
    if (!fs.existsSync(source)) throw new Error('mutation_patch_evidence_missing');
    const content = fs.readFileSync(source), target = `${source}.gz`;
    writePatchEvidence(target, content, expectedSha256);
    fs.rmSync(source);
    return `patch:${relative}.gz`;
  });
  for (const outcome of values) {
    for (const attempt of outcome.attempts) attempt.evidenceIds = sealIds(attempt.evidenceIds, attempt.verifier.diffSha256);
    outcome.provenance.evidenceIds = outcome.provenance.evidenceIds.map(id => {
      if (!id.startsWith('patch:') || id.endsWith('.patch.gz')) return id;
      const attempt = outcome.attempts.find(item => item.evidenceIds.includes(`${id}.gz`));
      if (!attempt) throw new Error('mutation_patch_evidence_provenance_mismatch');
      return `${id}.gz`;
    });
  }
  return values;
}
function adaptive(strategy: MutationStrategy) { return strategy === 'ADAPTIVE_THIN_STANDARD_DEEP' || strategy === 'PREDICTED_ADAPTIVE'; }
function complexity(task: MutationBenchmarkTask) { return Math.min(1, task.features.estimatedFiles / 8 * .35 + task.features.referencedModules / 8 * .25 + task.features.ambiguity * .25 + (task.features.architecturalTerms ? .15 : 0)); }
async function requireHealthyEndpoint() { const response = await fetch(new URL('/health', endpoint), {headers: authorizationHeaders(), signal: AbortSignal.timeout(10_000)}); if (!response.ok) throw new Error(`mutation_benchmark_endpoint_unhealthy:${response.status}`); }
function authorizationHeaders(): HeadersInit { return bearerToken ? {authorization: `Bearer ${bearerToken}`} : {}; }
function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`missing_${name.toLowerCase()}`); return value; }
function optionalInteger(name: string, minimum: number, maximum: number) { const raw = process.env[name]; if (raw === undefined) return undefined; const value = Number(raw); if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`invalid_${name.toLowerCase()}`); return value; }
function assertProjectOutput(value: string) { const relative = path.relative(root, value); if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('mutation_output_outside_project'); }
function writePatchEvidence(file: string, patch: string | Buffer, expectedSha256: string) {
  const content = Buffer.isBuffer(patch) ? patch : Buffer.from(patch, 'utf8');
  if (createHash('sha256').update(content).digest('hex') !== expectedSha256) throw new Error('mutation_patch_evidence_hash_mismatch');
  const sealed = gzipSync(content, {level: 9});
  if (!gunzipSync(sealed).equals(content)) throw new Error('mutation_patch_evidence_round_trip_failed');
  writeBufferAtomic(file, sealed);
}
function writeJsonAtomic(file: string, value: unknown) { writeTextAtomic(file, `${JSON.stringify(value, null, 2)}\n`); }
function writeTextAtomic(file: string, value: string) { fs.mkdirSync(path.dirname(file), {recursive: true}); const temporary = `${file}.tmp`; fs.writeFileSync(temporary, value, {mode: 0o600}); fs.renameSync(temporary, file); }
function writeBufferAtomic(file: string, value: Buffer) { fs.mkdirSync(path.dirname(file), {recursive: true}); const temporary = `${file}.tmp`; fs.writeFileSync(temporary, value, {mode: 0o600}); fs.renameSync(temporary, file); }
function boundedError(error: unknown) { const value = error instanceof Error ? error.message : String(error); return value.length <= 512 ? value : `${value.slice(0, 509)}...`; }

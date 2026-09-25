import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {createToolHandlerRegistry} from './harness-dispatch.js';
import {parseMutationBenchmarkSuite, type MutationBenchmarkTask} from './harness-mutation-benchmark.js';
import {verifyMutationWorkspace} from './harness-mutation-verifier.js';
import {MUTATION_TOOL_IDS, MutationWorkspace} from './harness-mutation-workspace.js';

const root = process.cwd();
const suite = parseMutationBenchmarkSuite(JSON.parse(fs.readFileSync(path.join(root, 'benchmarks', 'harness-mutation-jobs.json'), 'utf8')));

test('all 12 hidden mutation contracts accept an independently constructed reference mutation', async t => {
  for (const task of suite.tasks) await t.test(task.id, async () => {
    const prepared = MutationWorkspace.prepare(path.join(root, suite.fixturePath), task);
    try {
      const registry = createToolHandlerRegistry(prepared.workspace.toolBindings());
      await applyReference(task, (tool, input) => registry.invoke(tool, input, {} as never, {assertActive: () => undefined}));
      const result = await verifyMutationWorkspace(prepared.workspace, task);
      assert.equal(result.passed, true, `${task.id}:${JSON.stringify(result.checks.filter(check => !check.passed))}`);
    } finally { prepared.workspace.cleanup(); }
  });
});

async function applyReference(task: MutationBenchmarkTask, invoke: (tool: string, input: unknown) => Promise<unknown>) {
  const replace = (path: string, oldText: string, newText: string, expectedOccurrences = 1) => invoke(MUTATION_TOOL_IDS.replace, {path, oldText, newText, expectedOccurrences});
  switch (task.id) {
    case 'MUT-001': await replace('src/constants.js', '30_000', '45_000'); return;
    case 'MUT-002':
      await replace('src/capabilities.js', "export function normalizeCapabilities(values) {\n  if (!Array.isArray(values) || values.some(value => typeof value !== 'string')) throw new Error('capabilities_invalid');\n  return values.map(value => value.trim().toLowerCase()).filter(Boolean);\n}", "import {stableUnique} from './utils.js';\n\nexport function normalizeCapabilities(values) {\n  if (!Array.isArray(values) || values.some(value => typeof value !== 'string')) throw new Error('capabilities_invalid');\n  return stableUnique(values.map(value => value.trim().toLowerCase()).filter(Boolean));\n}"); return;
    case 'MUT-003':
      await invoke(MUTATION_TOOL_IDS.write, {path: 'test/human-takeover.test.js', content: `import assert from 'node:assert/strict';\nimport test from 'node:test';\nimport {authorizeTool} from '../src/policy.js';\n\nconst base = {grantedTools: ['read', 'write'], approvedRisks: ['read', 'write'], leaseGeneration: 1, liveLeaseGeneration: 1, ownershipGeneration: 1, liveOwnershipGeneration: 1};\nfor (const risk of ['read', 'write']) test(\`human takeover denies \${risk}\`, () => { const result = authorizeTool({...base, owner: 'human', toolId: risk, risk}); assert.equal(result.allowed, false); assert.equal(result.reason, 'human_owns_execution'); });\n`}); return;
    case 'MUT-004':
      await replace('src/telemetry.js', "  const outputTokens = numberOrNull(raw.output_tokens ?? raw.completion_tokens);", "  const cacheWriteTokens = numberOrNull(raw.cache_creation_input_tokens ?? raw.cacheWriteTokens);\n  const outputTokens = numberOrNull(raw.output_tokens ?? raw.completion_tokens);");
      await replace('src/telemetry.js', "    cachedInputTokens,\n    outputTokens,", "    cachedInputTokens,\n    cacheWriteTokens,\n    outputTokens,"); return;
    case 'MUT-005':
      await replace('src/constants.js', "  'FAILED',\n]);", "  'FAILED',\n  'CANCELLED',\n]);");
      await replace('src/constants.js', "Object.freeze(['SUCCEEDED', 'FAILED'])", "Object.freeze(['SUCCEEDED', 'FAILED', 'CANCELLED'])");
      await replace('src/job-state.js', "  CREATED: ['ROUTED', 'FAILED'],\n  ROUTED: ['RUNNING', 'FAILED'],\n  RUNNING: ['VERIFICATION_PENDING', 'FAILED'],", "  CREATED: ['ROUTED', 'FAILED', 'CANCELLED'],\n  ROUTED: ['RUNNING', 'FAILED', 'CANCELLED'],\n  RUNNING: ['VERIFICATION_PENDING', 'FAILED', 'CANCELLED'],"); return;
    case 'MUT-006':
      await replace('src/config.js', "    timeoutMs: requireInteger(input.timeoutMs ?? 30_000, 'timeout_ms', 100, 600_000),", "    timeoutMs: requireInteger(input.timeoutMs ?? 30_000, 'timeout_ms', 100, 600_000),\n    maximumToolResultBytes: requireInteger(input.maximumToolResultBytes ?? 32_768, 'maximum_tool_result_bytes', 1_024, 131_072),");
      await replace('src/tool-output.js', "const MODEL_OUTPUT_LIMIT_BYTES = 32_768;\n\nexport function modelFacingToolResult(value, _config = {}) {", "export function modelFacingToolResult(value, config = {}) {\n  const modelOutputLimitBytes = config.maximumToolResultBytes ?? 32_768;");
      await replace('src/tool-output.js', 'MODEL_OUTPUT_LIMIT_BYTES', 'modelOutputLimitBytes', 2); return;
    case 'MUT-007':
      await invoke(MUTATION_TOOL_IDS.write, {path: 'src/scheduler.js', content: `import {rankEligibleWorkers} from './routing-helpers.js';\n\nexport function selectWorker(workers, requiredCapabilities) {\n  return rankEligibleWorkers(workers, requiredCapabilities)[0] ?? null;\n}\n`}); return;
    case 'MUT-008':
      await replace('src/telemetry.js', 'export function createAttemptTelemetry({taskId, profile, usage, verifierResult}) {', 'export function createAttemptTelemetry({taskId, profile, usage, verifierResult, correlationId}) {');
      await replace('src/telemetry.js', 'return Object.freeze({taskId, profile, usage: normalizeUsage(usage), verifierResult: verifierResult ?? \'UNKNOWN\'});', 'return Object.freeze({taskId, profile, usage: normalizeUsage(usage), verifierResult: verifierResult ?? \'UNKNOWN\', correlationId: correlationId ?? null});');
      await replace('src/dispatcher.js', '    verifierResult: input.verifierResult,', '    verifierResult: input.verifierResult,\n    correlationId: input.correlationId,'); return;
    case 'MUT-009':
      await replace('src/job-state.js', "export function completeJob(current, result) {\n  if (current !== 'RUNNING') throw new Error('job_not_running');\n  return result.modelComplete ? 'SUCCEEDED' : 'FAILED';\n}", "export function completeJob(current, result) {\n  if (current === 'RUNNING') return result.modelComplete ? 'VERIFICATION_PENDING' : 'FAILED';\n  if (current === 'VERIFICATION_PENDING') return result.verifierPassed ? 'SUCCEEDED' : 'FAILED';\n  throw new Error('job_completion_state_invalid');\n}"); return;
    case 'MUT-010':
      await replace('src/context-packet.js', 'provenanceIds: mergeEvidence(sources.flatMap(source => source.provenanceIds ?? [])),', 'provenanceIds: mergeEvidence(sources.flatMap(source => source.provenanceIds ?? []), parent?.provenanceIds ?? []),'); return;
    case 'MUT-011':
      await replace('src/queue.js', "existing.id === item.id && existing.state === 'QUEUED'", 'existing.id === item.id'); return;
    case 'MUT-012':
      await replace('src/router.js', "const ORDER = Object.freeze(['THIN', 'STANDARD', 'DEEP']);", "import {strategyQualified} from './qualification.js';\n\nconst ORDER = Object.freeze(['THIN', 'STANDARD', 'DEEP']);\nconst ESCALATION_REASONS = new Set(['missing_context', 'test_failure', 'ambiguous_repository_state', 'unexpected_dependency', 'model_uncertainty', 'verifier_rejection', 'tool_limitation', 'execution_failure']);");
      await replace('src/router.js', "  const appliedProfile = policy.mode === 'EXPERIMENT' && signals.requestedProfile ? signals.requestedProfile : 'STANDARD';", "  const appliedProfile = policy.mode === 'EXPERIMENT' && signals.requestedProfile\n    ? signals.requestedProfile\n    : policy.mode === 'ENFORCE' && strategyQualified(policy.evidence?.[recommendedProfile])\n      ? recommendedProfile\n      : 'STANDARD';");
      await replace('src/router.js', "export function nextContextAttempt(current, attempted, reason) {\n  const next = ORDER[ORDER.indexOf(current) + 1];\n  return next ? {action: 'ESCALATE', from: current, to: next, reason} : {action: 'REVIEW', from: current, reason};\n}", "export function nextContextAttempt(current, attempted, reason) {\n  if (!ESCALATION_REASONS.has(reason)) throw new Error('escalation_reason_invalid');\n  const next = ORDER.slice(ORDER.indexOf(current) + 1).find(profile => !attempted.includes(profile));\n  return next ? {action: 'ESCALATE', from: current, to: next, reason} : {action: 'REVIEW', from: current, reason};\n}"); return;
    default: throw new Error(`reference_mutation_missing:${task.id}`);
  }
}

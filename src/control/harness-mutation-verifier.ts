import {AsyncLocalStorage} from 'node:async_hooks';
import type {OwnedExecution} from './owned-process.js';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import type {MutationBenchmarkTask, MutationVerifierCheck, MutationVerifierResult} from './harness-mutation-benchmark.js';
import type {MutationWorkspace} from './harness-mutation-workspace.js';

const execute = promisify(execFile);

interface VerificationControl {signal?: AbortSignal; ownedExecution?: OwnedExecution; assertActive?: () => void; recordEvidence?: (name: string, value: unknown) => unknown;}
const verificationControl = new AsyncLocalStorage<VerificationControl>();
function verificationGuard() { const control = verificationControl.getStore(); control?.signal?.throwIfAborted(); control?.assertActive?.(); }
export async function verifyMutationWorkspace(workspace: MutationWorkspace, task: MutationBenchmarkTask, control: VerificationControl = {}): Promise<MutationVerifierResult> {
  return verificationControl.run(control, () => verifyWorkspace(workspace, task));
}
async function verifyWorkspace(workspace: MutationWorkspace, task: MutationBenchmarkTask): Promise<MutationVerifierResult> {
  verificationGuard();
  const startedAt = new Date().toISOString();
  const checks: MutationVerifierCheck[] = [];
  const changedFiles = workspace.changedFiles();
  const diff = workspace.diff();
  const diffSha256 = createHash('sha256').update(diff).digest('hex');
  const numstat = parseNumstat(await git(workspace.root, ['diff', '--numstat', 'HEAD']));
  const addedLines = numstat.reduce((sum, item) => sum + item.added, 0), deletedLines = numstat.reduce((sum, item) => sum + item.deleted, 0);

  verificationGuard(); checks.push(syncCheck('mutation_present', () => {
    if (!changedFiles.length) throw new Error('no_repository_mutation');
    for (const required of task.requiredChangedFiles) if (!changedFiles.includes(required)) throw new Error(`required_file_unchanged:${required}`);
    return `${changedFiles.length} changed file(s)`;
  }, [`diff_sha256:${diffSha256}`]));
  verificationGuard(); checks.push(syncCheck('scope_and_size', () => {
    const forbidden = changedFiles.filter(file => !task.allowedFiles.includes(file));
    if (forbidden.length) throw new Error(`forbidden_file_changed:${forbidden.join(',')}`);
    if (changedFiles.length < task.expectedMutation.minimumFiles || changedFiles.length > task.expectedMutation.maximumFiles) throw new Error(`changed_file_count:${changedFiles.length}`);
    if (addedLines + deletedLines > task.expectedMutation.maximumChangedLines) throw new Error(`changed_line_limit:${addedLines + deletedLines}`);
    return `${addedLines} additions, ${deletedLines} deletions`;
  }, changedFiles.map(file => `changed_file:${file}`)));
  verificationGuard(); checks.push(await asyncCheck('git_diff_check', async () => {
    const result = await command('git', ['diff', '--check', 'HEAD'], workspace.root, 30_000);
    if (result.exitCode !== 0) throw new Error(`git_diff_check_failed:${bounded(result.stderr || result.stdout)}`);
    return 'clean whitespace and patch structure';
  }, [`diff_sha256:${diffSha256}`]));
  verificationGuard(); checks.push(await asyncCheck('javascript_syntax', async () => {
    const files = walk(path.join(workspace.root, 'src')).filter(file => file.endsWith('.js'));
    for (const file of files) {
      const result = await command(process.execPath, ['--check', file], workspace.root, 30_000);
      if (result.exitCode !== 0) throw new Error(`syntax_failed:${path.relative(workspace.root, file)}:${bounded(result.stderr)}`);
    }
    for (const file of changedFiles.filter(item => item.startsWith('test/') && item.endsWith('.js'))) {
      const result = await command(process.execPath, ['--check', path.join(workspace.root, file)], workspace.root, 30_000);
      if (result.exitCode !== 0) throw new Error(`syntax_failed:${file}:${bounded(result.stderr)}`);
    }
    return `${files.length} source modules checked`;
  }, ['syntax:node-check']));
  verificationGuard(); checks.push(await asyncCheck('public_regression_tests', async () => {
    const tests = fs.readdirSync(path.join(workspace.root, 'test')).filter(name => name.endsWith('.test.js')).sort().map(name => path.join('test', name));
    const result = await command(process.execPath, ['--test', ...tests], workspace.root, 60_000);
    if (result.exitCode !== 0) throw new Error(`public_tests_failed:${bounded(result.stderr || result.stdout)}`);
    return bounded(result.stdout);
  }, ['tests:public-node-test']));
  verificationGuard(); checks.push(await asyncCheck(`hidden_verifier:${task.verifierId}`, () => hiddenVerifier(workspace.root, task), [`hidden_verifier:${task.verifierId}`, `diff_sha256:${diffSha256}`]));
  verificationGuard(); checks.push(syncCheck('credential_and_topology_scan', () => {
    const sensitive = /-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----|\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}|\bBearer\s+[A-Za-z0-9._-]{20,}|\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/i;
    if (sensitive.test(diff)) throw new Error('sensitive_or_topology_material_detected');
    return 'no credential or environment-topology pattern in patch';
  }, ['scan:bounded-diff']));

  const passed = checks.every(check => check.passed);
  return {
    schema: 'agent-control.mutation-verifier/v1', taskId: task.id, passed, startedAt, completedAt: new Date().toISOString(), checks,
    changedFiles, addedLines, deletedLines, diffSha256,
    failureClass: classifyFailure(checks),
  };
}

async function hiddenVerifier(root: string, task: MutationBenchmarkTask): Promise<string> {
  const load = <T = Record<string, any>>(relative: string) => { verificationGuard(); return import(`${pathToFileURL(path.join(root, relative)).href}?v=${Date.now()}-${Math.random()}`) as Promise<T>; };
  switch (task.id) {
    case 'MUT-001': {
      const value = await load<{DEFAULT_JOB_TIMEOUT_MS: number}>('src/constants.js');
      assert(value.DEFAULT_JOB_TIMEOUT_MS === 45_000, 'default_timeout_not_45000');
      return 'default timeout is 45000';
    }
    case 'MUT-002': {
      const value = await load<{normalizeCapabilities(values: string[]): string[]}>('src/capabilities.js');
      equal(value.normalizeCapabilities([' Device.NFC ', 'device.nfc', '', 'Execution.Typed', 'DEVICE.NFC']), ['device.nfc', 'execution.typed'], 'capability_order_or_deduplication');
      let rejected = false; try { value.normalizeCapabilities(['ok', 3] as never); } catch { rejected = true; }
      assert(rejected, 'invalid_capability_input_accepted');
      return 'stable normalized deduplication and invalid-input fencing';
    }
    case 'MUT-003': return mutationTestHumanTakeover(root);
    case 'MUT-004': {
      const value = await load<{normalizeUsage(raw?: any): any; createAttemptTelemetry(input: any): any}>('src/telemetry.js');
      assert(value.normalizeUsage({cache_creation_input_tokens: 12}).cacheWriteTokens === 12, 'snake_case_cache_write_missing');
      assert(value.normalizeUsage({cacheWriteTokens: 9}).cacheWriteTokens === 9, 'camel_case_cache_write_missing');
      assert(value.normalizeUsage({}).cacheWriteTokens === null, 'unknown_cache_write_not_null');
      assert(value.createAttemptTelemetry({taskId: 't', profile: 'THIN', usage: {cacheWriteTokens: 4}}).usage.cacheWriteTokens === 4, 'attempt_telemetry_cache_write_missing');
      return 'cache-write usage API preserves measured and unknown values';
    }
    case 'MUT-005': {
      const constants = await load<{JOB_STATES: string[]; TERMINAL_JOB_STATES: string[]}>('src/constants.js');
      const state = await load<{transitionJob(current: string, next: string): string}>('src/job-state.js');
      assert(constants.JOB_STATES.includes('CANCELLED') && constants.TERMINAL_JOB_STATES.includes('CANCELLED'), 'cancelled_state_not_terminal');
      for (const current of ['CREATED', 'ROUTED', 'RUNNING']) assert(state.transitionJob(current, 'CANCELLED') === 'CANCELLED', `cannot_cancel:${current}`);
      let denied = false; try { state.transitionJob('CANCELLED', 'RUNNING'); } catch { denied = true; }
      assert(denied, 'cancelled_transition_not_fenced');
      return 'active states cancel and CANCELLED is terminal';
    }
    case 'MUT-006': {
      const config = await load<{parseRuntimeConfig(input?: any): any}>('src/config.js');
      const output = await load<{modelFacingToolResult(value: unknown, config?: any): any}>('src/tool-output.js');
      assert(config.parseRuntimeConfig({}).maximumToolResultBytes === 32_768, 'output_bound_default_invalid');
      for (const invalid of [1_023, 131_073, 2.5]) { let denied = false; try { config.parseRuntimeConfig({maximumToolResultBytes: invalid}); } catch { denied = true; } assert(denied, `output_bound_accepted:${invalid}`); }
      const parsed = config.parseRuntimeConfig({maximumToolResultBytes: 1_024});
      const payload = {value: 'x'.repeat(4_096)}, result = output.modelFacingToolResult(payload, parsed);
      assert(result.state === 'COMPACTED' && result.returnedBytes <= 1_024, 'configured_output_bound_not_enforced');
      const expectedHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      assert(result.authoritativeHash === expectedHash, 'authoritative_hash_changed');
      return 'validated output bound controls model-facing compaction';
    }
    case 'MUT-007': {
      const source = fs.readFileSync(path.join(root, 'src', 'scheduler.js'), 'utf8');
      assert(/import\s*\{[^}]*rankEligibleWorkers[^}]*\}\s*from\s*['"]\.\/routing-helpers\.js['"]/.test(source), 'routing_helper_not_imported');
      const value = await load<{selectWorker(workers: any[], required: string[]): any}>('src/scheduler.js');
      const workers = [{id: 'b', online: true, activeJobs: 1, capabilities: ['x']}, {id: 'a', online: true, activeJobs: 1, capabilities: ['x']}, {id: 'z', online: false, activeJobs: 0, capabilities: ['x']}];
      assert(value.selectWorker(workers, ['x'])?.id === 'a', 'selection_behavior_changed');
      assert(value.selectWorker(workers, ['missing']) === null, 'empty_selection_not_null');
      return 'scheduler delegates to existing ranked eligibility abstraction';
    }
    case 'MUT-008': {
      const value = await load<{dispatchAttempt(input: any): any}>('src/dispatcher.js');
      const authorization = {owner: 'agent', toolId: 'read', risk: 'read', grantedTools: ['read'], approvedRisks: ['read'], leaseGeneration: 1, liveLeaseGeneration: 1, ownershipGeneration: 1, liveOwnershipGeneration: 1};
      const first = value.dispatchAttempt({taskId: 't', profile: 'STANDARD', usage: {}, verifierResult: 'UNKNOWN', correlationId: 'corr-123', authorization});
      assert(first.telemetry.correlationId === 'corr-123' && Object.isFrozen(first.telemetry), 'correlation_id_not_preserved_immutably');
      const second = value.dispatchAttempt({taskId: 't', profile: 'STANDARD', usage: {}, verifierResult: 'UNKNOWN', correlationId: null, authorization});
      assert(second.telemetry.correlationId === null, 'null_correlation_id_invented');
      return 'dispatch preserves caller correlation provenance';
    }
    case 'MUT-009': {
      const value = await load<{completeJob(current: string, result: any): string}>('src/job-state.js');
      assert(value.completeJob('RUNNING', {modelComplete: true}) === 'VERIFICATION_PENDING', 'model_completion_claimed_success');
      assert(value.completeJob('VERIFICATION_PENDING', {verifierPassed: true}) === 'SUCCEEDED', 'verifier_pass_not_accepted');
      assert(value.completeJob('VERIFICATION_PENDING', {verifierPassed: false}) === 'FAILED', 'verifier_rejection_not_failed');
      return 'independent verification is the sole success boundary';
    }
    case 'MUT-010': {
      const value = await load<{deriveContextPacket(input: any): any}>('src/context-packet.js');
      const packet = value.deriveContextPacket({id: 'child', sources: [{id: 'a', provenanceIds: ['e1', 'shared']}, {id: 'b', provenanceIds: ['e2', 'shared']}], parent: {id: 'parent', provenanceIds: ['p1', 'shared']}});
      equal(packet.provenanceIds, ['e1', 'shared', 'e2', 'p1'], 'derived_provenance_lineage');
      assert(packet.parentId === 'parent' && packet.derived === true, 'derived_packet_identity_changed');
      return 'source and parent provenance retained in stable order';
    }
    case 'MUT-011': {
      const value = await load<{WorkQueue: new () => {enqueue(item: any): void; lease(id: string): any; list(): any[]}}>('src/queue.js');
      const queue = new value.WorkQueue(); queue.enqueue({id: 'same'}); queue.lease('same');
      let denied = false; try { queue.enqueue({id: 'same'}); } catch { denied = true; }
      assert(denied, 'leased_duplicate_accepted');
      queue.enqueue({id: 'different'}); assert(queue.list().length === 2, 'distinct_identity_rejected');
      return 'queue identity is invariant across lifecycle states';
    }
    case 'MUT-012': {
      const value = await load<{routeProfile(signals: any, policy: any): any; nextContextAttempt(current: string, attempted: string[], reason: string): any}>('src/router.js');
      const signals = {requestedProfile: 'THIN', knownExactTargets: true, estimatedFiles: 1, risk: 'low', deterministicVerifier: true, ambiguity: .1};
      const qualified = {productionQualified: true, verifiedRuns: 25, successRate: .96, sameModelRuns: 25};
      assert(value.routeProfile(signals, {mode: 'OBSERVE', evidence: {THIN: qualified}}).appliedProfile === 'STANDARD', 'observe_did_not_fallback');
      assert(value.routeProfile(signals, {mode: 'EXPERIMENT'}).appliedProfile === 'THIN', 'experiment_override_broken');
      assert(value.routeProfile(signals, {mode: 'ENFORCE', evidence: {THIN: {productionQualified: false, verifiedRuns: 100, successRate: 1, sameModelRuns: 100}}}).appliedProfile === 'STANDARD', 'unqualified_enforce_applied');
      assert(value.routeProfile(signals, {mode: 'ENFORCE', evidence: {THIN: qualified}}).appliedProfile === 'THIN', 'qualified_enforce_not_applied');
      const escalated = value.nextContextAttempt('THIN', ['THIN', 'STANDARD'], 'missing_context');
      assert(escalated.action === 'ESCALATE' && escalated.to === 'DEEP', 'attempted_profile_not_skipped');
      let denied = false; try { value.nextContextAttempt('THIN', ['THIN'], 'anything'); } catch { denied = true; }
      assert(denied, 'unclassified_escalation_reason_accepted');
      assert(value.nextContextAttempt('DEEP', ['THIN', 'STANDARD', 'DEEP'], 'verifier_rejection').action === 'REVIEW', 'deep_escalation_unbounded');
      return 'qualified ENFORCE gate and bounded classified escalation';
    }
    default: throw new Error(`hidden_verifier_missing:${task.id}`);
  }
}

async function mutationTestHumanTakeover(root: string): Promise<string> {
  const testFile = path.join(root, 'test', 'human-takeover.test.js');
  if (!fs.existsSync(testFile)) throw new Error('human_takeover_test_missing');
  const original = await command(process.execPath, [path.join('test', 'human-takeover.test.js')], root, 30_000);
  if (original.exitCode !== 0) throw new Error(`new_test_does_not_pass:${bounded(original.stderr || original.stdout)}`);
  verificationGuard(); const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-verifier-mutant-'));
  try {
    const mutant = path.join(temporary, 'workspace'); verificationGuard(); fs.cpSync(root, mutant, {recursive: true, filter: source => !source.split(path.sep).includes('.git')});
    const policyFile = path.join(mutant, 'src', 'policy.js'), policy = fs.readFileSync(policyFile, 'utf8');
    const target = "if (owner !== 'agent') return {allowed: false, reason: 'human_owns_execution'};";
    if (!policy.includes(target)) throw new Error('policy_mutation_anchor_missing');
    verificationGuard(); fs.writeFileSync(policyFile, policy.replace(target, "if (owner !== 'agent') return {allowed: true, reason: null};"), 'utf8');
    const directResult = await command(process.execPath, ['--input-type=module', '--eval', "import('./src/policy.js').then(({authorizeTool}) => process.stdout.write(String(authorizeTool({owner:'human'}).allowed)))"], mutant, 30_000); const direct = directResult.stdout;
    if (direct !== 'true') throw new Error(`human_precedence_mutant_not_active:${bounded(direct)}`);
    const mutantResult = await command(process.execPath, [path.join('test', 'human-takeover.test.js')], mutant, 30_000);
    const mutantRejected = mutantResult.exitCode !== 0;
    if (!mutantRejected) throw new Error(`new_test_survived_human_precedence_mutant:${createHash('sha256').update(fs.readFileSync(path.join(mutant, 'test', 'human-takeover.test.js'))).digest('hex')}`);
    return 'new regression passes original and rejects removed-human-precedence mutant';
  } finally {
    const parent = fs.realpathSync(os.tmpdir()), resolved = fs.realpathSync(temporary), relative = path.relative(parent, resolved);
    if (!relative.startsWith('agent-control-verifier-mutant-') || relative.includes(path.sep)) throw new Error('mutant_cleanup_boundary_invalid');
    verificationControl.getStore()?.recordEvidence?.('verifier-mutant-before-cleanup', {root: resolved, files: walk(resolved).map(file => ({path: path.relative(resolved, file), content: fs.readFileSync(file, 'utf8')}))});
    fs.rmSync(resolved, {recursive: true, force: true});
  }
}

function syncCheck(id: string, action: () => string, evidenceIds: string[]): MutationVerifierCheck {
  const started = performance.now();
  try { return {id, passed: true, detail: bounded(action()), durationMs: performance.now() - started, evidenceIds}; }
  catch (error) { return {id, passed: false, detail: bounded(error instanceof Error ? error.message : String(error)), durationMs: performance.now() - started, evidenceIds}; }
}
async function asyncCheck(id: string, action: () => Promise<string>, evidenceIds: string[]): Promise<MutationVerifierCheck> {
  const started = performance.now();
  try { return {id, passed: true, detail: bounded(await action()), durationMs: performance.now() - started, evidenceIds}; }
  catch (error) { return {id, passed: false, detail: bounded(error instanceof Error ? error.message : String(error)), durationMs: performance.now() - started, evidenceIds}; }
}

function classifyFailure(checks: MutationVerifierCheck[]): MutationVerifierResult['failureClass'] {
  const failed = checks.find(check => !check.passed)?.id;
  if (!failed) return 'NONE';
  if (failed === 'mutation_present') return 'NO_MUTATION';
  if (failed === 'scope_and_size') return 'SCOPE_VIOLATION';
  if (failed === 'git_diff_check') return 'DIFF_INVALID';
  if (failed === 'javascript_syntax') return 'SYNTAX';
  if (failed === 'public_regression_tests') return 'PUBLIC_TEST';
  if (failed.startsWith('hidden_verifier:')) return 'HIDDEN_VERIFIER';
  if (failed === 'credential_and_topology_scan') return 'SECURITY';
  return 'EXECUTION';
}

async function command(file: string, args: string[], cwd: string, timeoutMs: number) {
  verificationGuard(); const control = verificationControl.getStore();
  control?.recordEvidence?.('verifier-command-request', {file, args, cwd, timeoutMs});
  try {
    let result: {exitCode: number | null; stdout: string; stderr: string; pid?: number};
    if (control?.ownedExecution) {
      const timeout = AbortSignal.timeout(timeoutMs), signal = control.signal ? AbortSignal.any([control.signal, timeout]) : timeout;
      result = await control.ownedExecution.runProcess({command: file, args, cwd, maxOutputBytes: 2_000_000}, signal);
    } else { const raw = await execute(file, args, {cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1_000_000, windowsHide: true, signal: control?.signal}); result = {exitCode: 0, stdout: raw.stdout, stderr: raw.stderr}; }
    control?.recordEvidence?.('verifier-command-result', {file, args, ...result});
    verificationGuard(); return result;
  } catch (error) {
    const value = error as {code?: number | string; stdout?: string; stderr?: string; killed?: boolean};
    const result = {exitCode: typeof value.code === 'number' ? value.code : value.killed ? 124 : 1, stdout: value.stdout ?? '', stderr: value.stderr ?? String(error)};
    control?.recordEvidence?.('verifier-command-failure', {file, args, ...result});
    verificationGuard(); return result;
  }
}
async function git(cwd: string, args: string[]) { const result = await command('git', args, cwd, 30_000); if (result.exitCode !== 0) throw new Error(`git_failed:${bounded(result.stderr)}`); return result.stdout; }
function parseNumstat(value: string) { return value.split(/\r?\n/).filter(Boolean).map(line => { const [added, deleted, file] = line.split('\t'); return {file, added: Number(added) || 0, deleted: Number(deleted) || 0}; }); }
function walk(root: string): string[] { return fs.readdirSync(root, {withFileTypes: true}).flatMap(entry => { const child = path.join(root, entry.name); return entry.isDirectory() ? walk(child) : entry.isFile() ? [child] : []; }); }
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function equal(actual: unknown, expected: unknown, message: string) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}:${JSON.stringify(actual)}`); }
function bounded(value: string) { const normalized = value.replace(/[\r\n]+/g, ' ').trim(); return normalized.length <= 1_000 ? normalized : `${normalized.slice(0, 997)}...`; }

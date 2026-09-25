import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {compileResourcePolicies, parseGovernedGitProposal, policyProtectsEffect, resolveGitEffects} from './action-governance.js';
import {governedGitEnvironment, registerGovernedGitActions} from './governed-git-actions.js';
import {ActionRegistry, ArtifactStore, JobRuntime, ResourceLockManager, RunLedger, WorkerRegistry} from './job-runtime.js';
import {JobCatalog} from './job-catalog.js';
import type {JobDefinition, RunRecord} from './job-types.js';
import {RuntimeSafetySupervisor} from './runtime-safety-supervisor.js';
import {registerProtectedResourceModelActions, type ProtectedResourceProposalPort} from './protected-resource-model-actions.js';
import type {AgentControlConfig} from './config.js';

const job: JobDefinition = {apiVersion: 'agent-control/v1', kind: 'Job', metadata: {id: 'governed-git-operation', name: 'Governed Git operation', version: '1.0.0'}, spec: {priority: 'normal', concurrency: 'queue', parameters: {repositoryPath: {type: 'string', required: true}, proposal: {type: 'string', required: true}}, steps: [{id: 'execute', action: 'repository.git-governed@1.0.0', requires: ['repository.git'], verification: ['governed-git-effects-enforced']}]}};

function git(cwd: string, ...args: string[]) { return execFileSync('git', args, {cwd, encoding: 'utf8'}).trim(); }
function controllerWorker(capabilities: string[]) {
  return new WorkerRegistry().registerControllerInternal({id: 'controller', capabilities, health: 'healthy', capacity: 1, active: 0, observedAt: '2026-09-07T10:00:00.000Z'});
}
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-protected-ref-')), remote = path.join(root, 'remote.git'), repository = path.join(root, 'repository'), state = path.join(root, 'state');
  fs.mkdirSync(repository); git(root, 'init', '--bare', remote); git(repository, 'init', '-b', 'master'); git(repository, 'config', 'user.name', 'Agent Control Test'); git(repository, 'config', 'user.email', 'agent-control@example.invalid');
  fs.writeFileSync(path.join(repository, 'README.md'), 'baseline\n'); git(repository, 'add', 'README.md'); git(repository, 'commit', '-m', 'baseline'); git(repository, 'remote', 'add', 'origin', remote); git(repository, 'push', '-u', 'origin', 'master');
  const master = git(repository, 'rev-parse', 'HEAD'); git(repository, 'switch', '-c', 'feature'); fs.writeFileSync(path.join(repository, 'feature.txt'), 'feature\n'); git(repository, 'add', 'feature.txt'); git(repository, 'commit', '-m', 'feature');
  const actions = registerGovernedGitActions(), catalog = new JobCatalog(actions.ids()); catalog.addJob(job);
  const workers = controllerWorker(['repository.git']);
  const safetyFile = path.join(state, 'safety.json'), safety = new RuntimeSafetySupervisor({id: 'protected-ref-test', approvedRepositoryRoots: [repository]}, safetyFile);
  const ledger = new RunLedger(path.join(state, 'runs.json')), runtime = new JobRuntime(catalog, actions, workers, ledger, new ArtifactStore(path.join(state, 'artifacts')), new ResourceLockManager(path.join(state, 'locks.json')), {safety});
  return {root, remote, repository, master, safetyFile, safety, ledger, runtime};
}

function trigger(): RunRecord['trigger'] { return {type: 'manual', actor: 'operator', parcelContext: {schema: 'agent-control.run-parcel-context/v1', parcelId: 'parcel-protected-ref', stageId: 'stage-maintenance', originalGoal: 'Perform repository maintenance while origin/master must remain completely unchanged.', currentInterpretation: 'Inspect and maintain the repository without changing origin/master.', effectiveInstructions: ['Use governed Git operations only.'], constraints: ['origin/master must remain completely unchanged'], successCriteria: [{id: 'protected', description: 'origin/master SHA is unchanged', status: 'PENDING'}], baton: null}}; }
function remoteRef(repository: string, ref: string) { return git(repository, 'ls-remote', '--refs', 'origin', `refs/heads/${ref}`).split(/\s+/)[0] || null; }
async function settleWithExplicitApprovals(runtime: JobRuntime, ledger: RunLedger, runId: string) { for (let count = 0; count < 12; count++) { await runtime.tick(); const run = ledger.get(runId)!; if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(run.status)) return run; const waiting = run.steps.find(step => step.status === 'WAITING_FOR_APPROVAL' && step.approval); if (waiting?.approval) runtime.approve(run.id, waiting.approval, 'qualification-operator'); } return ledger.get(runId)!; }
async function runProposal(setup: ReturnType<typeof fixture>, proposal: string) { const created = setup.runtime.createRun('governed-git-operation@1.0.0', {repositoryPath: setup.repository, proposal}, trigger()); return settleWithExplicitApprovals(setup.runtime, setup.ledger, created.id); }


test('governed Git child environment excludes controller credentials and unsafe Git overrides', () => {
  const env = governedGitEnvironment({PATH: '/usr/bin', HOME: '/home/operator', SSH_AUTH_SOCK: '/tmp/agent.sock', OPENROUTER_API_KEY: 'secret', AGENT_CONTROL_OPERATOR_TOKEN: 'secret', GIT_SSH_COMMAND: 'unsafe', GIT_ASKPASS: 'unsafe'});
  assert.deepEqual(env, {GIT_TERMINAL_PROMPT: '0', PATH: '/usr/bin', HOME: '/home/operator', SSH_AUTH_SOCK: '/tmp/agent.sock'});
});

test('tag pushes retain their namespace for external reconciliation', () => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-governed-tag-'));
  git(repository, 'init', '-b', 'master'); git(repository, 'config', 'user.name', 'Agent Control Test'); git(repository, 'config', 'user.email', 'agent-control@example.invalid');
  fs.writeFileSync(path.join(repository, 'README.md'), 'tag baseline\n'); git(repository, 'add', 'README.md'); git(repository, 'commit', '-m', 'baseline'); git(repository, 'tag', 'v1.0.0');
  const implicit = resolveGitEffects(parseGovernedGitProposal('git push origin v1.0.0', repository))[0];
  const explicit = resolveGitEffects(parseGovernedGitProposal('git push origin refs/tags/v1.0.0:refs/tags/v1.0.0', repository))[0];
  assert.equal(implicit.resource.ref, 'refs/tags/v1.0.0'); assert.equal(explicit.resource.ref, 'refs/tags/v1.0.0');
  fs.rmSync(repository, {recursive: true, force: true});
});

test('semantic Git effect resolution covers direct, refspec, force, mirror, delete, wrappers, chains and alternate cwd', () => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-governed-parse-')), run = {trigger: trigger()} as RunRecord, policy = compileResourcePolicies(run)[0];
  const proposals = [
    'git push origin master',
    'git push origin HEAD:master',
    'git push --force origin feature:master',
    'git push origin +feature:master',
    'git push --delete origin master',
    'git push origin :master',
    'git push --mirror origin',
    'sh -c "git push origin HEAD:master"',
    'git status && git push origin HEAD:master',
    `git -C ${repository} push origin HEAD:master`,
  ];
  for (const proposal of proposals) {
    const operations = parseGovernedGitProposal(proposal, repository), effects = resolveGitEffects(operations);
    assert.ok(effects.some(effect => policyProtectsEffect(policy, effect)), proposal);
  }
  fs.rmSync(repository, {recursive: true, force: true});
});

test('production JobRuntime denies every protected-ref mutation before execution and preserves durable evidence', async () => {
  const setup = fixture(); git(setup.repository, 'remote', 'add', 'review-alias', setup.remote); const proposals = [
    'git push origin feature:master', 'git push origin HEAD:master', 'git push --force origin feature:master', 'git push origin +feature:master',
    'git push --delete origin master', 'git push origin :master', 'git push --mirror origin', 'sh -c "git push origin HEAD:master"',
    'git status && git push origin HEAD:master', `git -C ${setup.repository} push origin HEAD:master`, 'git push review-alias HEAD:master',
  ];
  for (const proposal of proposals) {
    const run = await runProposal(setup, proposal);
    assert.equal(run.status, 'FAILED', proposal); assert.match(run.steps[0].error ?? '', /^runtime_safety_denied:/); assert.equal(run.steps[0].externalOperations?.every(item => item.state === 'PROPOSED'), true); assert.equal(remoteRef(setup.repository, 'master'), setup.master, proposal);
  }
  const decisions = setup.safety.list(); assert.equal(decisions.length, proposals.length); assert.equal(decisions.every(item => item.outcome === 'DENY'), true); assert.equal(decisions.every(item => item.effects?.some(effect => item.resourcePolicies?.some(policy => policyProtectsEffect(policy, effect)))), true);
  const restored = new RuntimeSafetySupervisor({id: 'protected-ref-test', approvedRepositoryRoots: [setup.repository]}, setup.safetyFile); assert.equal(restored.list().length, proposals.length); assert.equal(restored.list().every(item => item.resourcePolicies?.some(policy => policy.resourceId === 'git-ref:origin/master')), true);
});

test('production JobRuntime permits an authorised feature ref and records confirmed external commit', async () => {
  const setup = fixture(), hook = path.join(setup.repository, '.git', 'hooks', 'pre-push'), marker = path.join(setup.root, 'hook-marker'); fs.writeFileSync(hook, `#!/bin/sh\ntouch ${JSON.stringify(marker)}\nexit 0\n`); fs.chmodSync(hook, 0o700);
  const run = await runProposal(setup, 'git push origin HEAD:qualified-feature');
  assert.equal(run.status, 'SUCCEEDED'); assert.equal(remoteRef(setup.repository, 'master'), setup.master); assert.equal(remoteRef(setup.repository, 'qualified-feature'), git(setup.repository, 'rev-parse', 'HEAD')); assert.deepEqual(run.steps[0].externalOperations?.map(item => item.state), ['EXTERNALLY_COMMITTED']);
  assert.equal(fs.existsSync(marker), false); assert.ok(run.provenance.some(item => item.type === 'evidence' && item.detail === 'git-hooks:disabled'));
  const decision = setup.safety.list()[0]; assert.equal(decision.outcome, 'ALLOW_WITH_AUDIT'); assert.equal(decision.effects?.[0].resource.id, 'git-ref:origin/qualified-feature');
});

test('unsupported shell, configuration mutation and implicit push forms fail closed during effect resolution', async () => {
  const setup = fixture();
  for (const proposal of ['git config core.hooksPath /tmp/hooks', 'git push', 'git push origin HEAD', 'git push origin @', 'git push origin feature:HEAD', 'git status | git push origin HEAD:master', 'git status > /tmp/result', 'git $(echo push) origin HEAD:master']) {
    const run = await runProposal(setup, proposal); assert.equal(run.status, 'FAILED'); assert.match(run.steps[0].error ?? '', /^action_effect_resolution_failed:/); assert.equal(remoteRef(setup.repository, 'master'), setup.master);
  }
});

test('cancelled governed execution can prove cancellation before external commit', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-control-cancelled-external-')), repository = path.join(root, 'repository'); fs.mkdirSync(repository);
  const actions = new ActionRegistry().registerGovernedControl('test.external@1.0.0', async context => new Promise((_resolve, reject) => {
    context.signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), {partialActionOutput: {externalOperationStates: [{effectId: 'effect-cancel', state: 'CANCELLED_BEFORE_COMMIT'}]}})), {once: true});
  }), () => ({schema: 'agent-control.action-governance-plan/v1', operations: [{executable: 'git', args: ['push', 'origin', 'HEAD:feature'], cwd: repository, source: 'STRUCTURED', display: 'git push origin HEAD:feature'}], effects: [{id: 'effect-cancel', kind: 'UPDATE', resource: {kind: 'git-ref', id: 'git-ref:origin/feature', repositoryPath: repository, remote: 'origin', ref: 'feature'}, external: true, consequential: true, summary: 'Update origin/feature'}], policies: []}));
  const definition: JobDefinition = {...job, metadata: {...job.metadata, id: 'cancel-external'}, spec: {...job.spec, parameters: {}, steps: [{id: 'execute', action: 'test.external@1.0.0', requires: ['repository.git'], verification: []}]}};
  const catalog = new JobCatalog(actions.ids()); catalog.addJob(definition); const workers = controllerWorker(['repository.git']), ledger = new RunLedger(path.join(root, 'runs.json'));
  const runtime = new JobRuntime(catalog, actions, workers, ledger, new ArtifactStore(path.join(root, 'artifacts')), new ResourceLockManager(path.join(root, 'locks.json')), {safety: new RuntimeSafetySupervisor({id: 'cancel-policy', approvedRepositoryRoots: [repository], requireApprovalForExternalCommunication: false})});
  const created = runtime.createRun('cancel-external@1.0.0', {}, {type: 'manual', actor: 'operator'}), dispatch = runtime.dispatch(); assert.ok(dispatch); await new Promise(resolve => setImmediate(resolve)); runtime.cancel(created.id); await dispatch.completion;
  const run = ledger.get(created.id)!; assert.equal(run.status, 'CANCELLED'); assert.equal(run.steps[0].externalOperations?.[0].state, 'CANCELLED_BEFORE_COMMIT');
});

test('real model-backed Job path seals a proposal artifact before semantic governance and independent verification', async () => {
  const setup = fixture(); let invocations = 0;
  const proposalPort: ProtectedResourceProposalPort = {invoke: async route => {
    invocations++;
    return {providerId: route.providerId, accountProfileId: route.accountProfileId ?? undefined, modelId: route.modelId, nodeId: route.providerExecutionNodeId ?? route.nodeId, providerModel: route.providerModel, output: JSON.stringify({summary: 'Create and publish an isolated maintenance marker branch', commands: [{command: 'git', args: ['checkout', '-b', 'model-maintenance']}, {command: 'git', args: ['commit', '--allow-empty', '-m', 'chore: record maintenance qualification']}, {command: 'git', args: ['push', 'origin', 'HEAD:model-maintenance']}], verification: ['Inspect origin/master and model-maintenance independently']}), elapsedMs: 12, usage: {inputTokens: 100, outputTokens: 50, cachedInputTokens: 0, cacheWriteTokens: 0, totalTokens: 150, providerReportedCost: null, calculatedCost: null, currency: null}, responseModel: route.providerModel, finishReason: 'completed', toolCall: null};
  }};
  const actions = registerProtectedResourceModelActions({} as AgentControlConfig, undefined, undefined, registerGovernedGitActions(), undefined, proposalPort), catalog = new JobCatalog(actions.ids());
  catalog.addJob({apiVersion: 'agent-control/v1', kind: 'Job', metadata: {id: 'model-governed-git', name: 'Model governed Git', version: '1.0.0'}, spec: {priority: 'normal', concurrency: 'queue', parameters: {repositoryPath: {type: 'string', required: true}, task: {type: 'string', required: true}, expectedProtectedSha: {type: 'string', required: true}}, steps: [{id: 'propose', action: 'repository.git-propose@1.0.0', requires: ['repository.git', 'model.execute'], outputs: [{name: 'git-proposal', type: 'application/json', schema: 'agent-control.git-proposal/v1', version: '1.0.0'}]}, {id: 'execute', action: 'repository.git-governed@1.0.0', requires: ['repository.git'], dependsOn: ['propose'], inputs: {proposal: 'propose.git-proposal'}, verification: ['governed-git-effects-enforced']}, {id: 'verify', action: 'repository.git-protected-ref.verify@1.0.0', requires: ['repository.git'], dependsOn: ['execute'], verification: ['protected-ref-unchanged']} ]}});
  const workers = controllerWorker(['repository.git', 'model.execute']), state = path.join(setup.root, 'model-state'), ledger = new RunLedger(path.join(state, 'runs.json')), artifacts = new ArtifactStore(path.join(state, 'artifacts'));
  const runtime = new JobRuntime(catalog, actions, workers, ledger, artifacts, new ResourceLockManager(path.join(state, 'locks.json')), {safety: new RuntimeSafetySupervisor({id: 'model-protected-ref-test', approvedRepositoryRoots: [setup.repository]})});
  const modelRoute = {requestedModel: 'model-a', requestedRole: null, modelId: 'model-a', providerId: 'provider-a', accountProfileId: 'account-a', providerModel: 'provider-model-a', nodeId: 'controller', providerExecutionNodeId: 'controller', qualificationVersion: 'qualification-v1', fallback: false, fallbackReason: null};
  const created = runtime.createRun('model-governed-git@1.0.0', {repositoryPath: setup.repository, task: 'Create an isolated maintenance marker branch and publish that branch for review.', expectedProtectedSha: setup.master}, {...trigger(), modelRoute});
  const run = await settleWithExplicitApprovals(runtime, ledger, created.id); assert.equal(run.status, 'SUCCEEDED', JSON.stringify({errors: run.errors, steps: run.steps.map(step => ({id: step.id, status: step.status, error: step.error, verification: step.verification}))})); assert.equal(invocations, 1); assert.equal(remoteRef(setup.repository, 'master'), setup.master); assert.equal(remoteRef(setup.repository, 'model-maintenance'), git(setup.repository, 'rev-parse', 'HEAD'));
  const proposal = artifacts.read(run.steps[0].artifactIds[0]) as {route: Record<string, unknown>; commands: unknown[]}; assert.deepEqual(proposal.route, {providerId: 'provider-a', accountProfileId: 'account-a', modelId: 'model-a', nodeId: 'controller', qualificationVersion: 'qualification-v1'}); assert.equal(proposal.commands.length, 3);
  assert.equal(run.steps[1].governance?.effects.some(effect => effect.resource.id === 'git-ref:origin/model-maintenance'), true); assert.equal(run.steps[1].externalOperations?.[0].state, 'EXTERNALLY_COMMITTED'); assert.equal(run.steps[2].verification?.failed.length, 0); assert.match(JSON.stringify(run.provenance), /agent:repository\.git-propose@1\.0\.0:adaptive-harness/);
});

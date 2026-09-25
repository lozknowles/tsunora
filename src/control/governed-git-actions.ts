import fs from 'node:fs';
import path from 'node:path';
import {ActionFailure, ActionRegistry} from './job-runtime.js';
import {parseGovernedGitProposal, resolveGitEffects, type ActionGovernancePlan, type ExternalOperationState, type GovernedEffect} from './action-governance.js';
import type {ActionContext} from './job-types.js';

const supported = new Set(['status', 'diff', 'show', 'log', 'rev-parse', 'ls-remote', 'branch', 'remote', 'describe', 'fetch', 'checkout', 'switch', 'worktree', 'commit', 'add', 'restore', 'reset', 'merge', 'rebase', 'cherry-pick', 'tag', 'push']);

export function registerGovernedGitActions(registry = new ActionRegistry()) {
  registry.registerGovernedControl('repository.git-governed@1.0.0', async context => {
    const plan = context.governance;
    if (!plan) throw new ActionFailure('governed_git_plan_missing', 'policy_rejection');
    const hookRoot = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'agent-control-git-hooks-'));
    const states: Array<{effectId: string; state: ExternalOperationState; reason?: string}> = [];
    try {
      for (const operation of plan.operations) {
        assertExecutionCwd(operation.cwd);
        const commandEffects = plan.effects.filter(effect => effect.resource.repositoryPath === operation.cwd && effect.external);
        const before = await observeRemoteRefs(context, commandEffects);
        let result;
        try { result = await context.ownedExecution.runProcess({command: operation.executable, args: confinedGitArgs(operation.args, hookRoot), cwd: operation.cwd, env: governedGitEnvironment(), maxOutputBytes: 256 * 1024}, context.signal); }
        catch (error) {
          const after = await observeRemoteRefs(context, commandEffects);
          states.push(...reconcile(commandEffects, before, after, 'Execution interrupted before a normal exit'));
          throw Object.assign(error instanceof Error ? error : new Error(String(error)), {partialActionOutput: {externalOperationStates: states}});
        }
        if (commandEffects.length) {
          const after = await observeRemoteRefs(context, commandEffects);
          if (result.exitCode === 0) states.push(...commandEffects.map(effect => ({effectId: effect.id, state: 'EXTERNALLY_COMMITTED' as const})));
          else states.push(...reconcile(commandEffects, before, after, `Git exited ${result.exitCode ?? 'without-status'}`));
        }
        if (result.exitCode !== 0) throw Object.assign(new ActionFailure('governed_git_operation_failed', 'execution'), {partialActionOutput: {externalOperationStates: states}});
      }
      return {verification: ['governed-git-effects-enforced'], evidence: [...plan.effects.map(effect => `${effect.kind}:${effect.resource.id}`), 'git-hooks:disabled', 'git-fsmonitor:disabled', 'git-terminal-prompt:disabled'], externalOperationStates: states, detail: `Executed ${plan.operations.length} governed Git operation${plan.operations.length === 1 ? '' : 's'}`};
    } finally { fs.rmSync(hookRoot, {recursive: true, force: true}); }
  }, input => {
    const repositoryPath = input.parameters.repositoryPath;
    if (typeof repositoryPath !== 'string') throw new Error('governed_git_repository_path_required');
    const proposalArtifact = input.inputArtifacts.find(artifact => artifact.name === 'git-proposal');
    const proposalValue = proposalArtifact ? input.readArtifact(proposalArtifact.id) : undefined;
    assertProposalRoute(input.run.trigger.modelRoute, proposalValue);
    const rawProposal = input.parameters.proposal ?? proposalValue;
    const canonicalRepository = fs.realpathSync.native(repositoryPath);
    const operations = parseGovernedGitProposal(rawProposal, canonicalRepository);
    if (operations.some(operation => { const relative = path.relative(canonicalRepository, operation.cwd); return relative.startsWith('..') || path.isAbsolute(relative); })) throw new Error('governed_git_alternate_cwd_outside_repository');
    const effects = resolveGitEffects(operations);
    for (const operation of operations) { const subcommand = operation.args.find(item => !item.startsWith('-')); if (!subcommand || !supported.has(subcommand.toLowerCase())) throw new Error(`governed_git_subcommand_unsupported:${subcommand ?? 'missing'}`); }
    return {schema: 'agent-control.action-governance-plan/v1', operations, effects, policies: []} satisfies ActionGovernancePlan;
  });
  registry.registerConsequentialControl('repository.git-protected-ref.verify@1.0.0', async context => {
    const repositoryPath = context.parameters.repositoryPath, expected = context.parameters.expectedProtectedSha, expectedFeatureRef = context.parameters.expectedFeatureRef;
    if (typeof repositoryPath !== 'string' || typeof expected !== 'string' || !/^[a-f0-9]{40,64}$/i.test(expected)) throw new ActionFailure('protected_ref_verification_parameters_invalid', 'configuration');
    const result = await context.ownedExecution.runProcess({command: 'git', args: ['ls-remote', '--refs', 'origin', 'refs/heads/master'], cwd: repositoryPath, maxOutputBytes: 16 * 1024}, context.signal);
    const actual = result.exitCode === 0 ? result.stdout.trim().split(/\s+/)[0] : '';
    let featureSha = ''; if (typeof expectedFeatureRef === 'string' && expectedFeatureRef) { const feature = await context.ownedExecution.runProcess({command: 'git', args: ['ls-remote', '--refs', 'origin', `refs/heads/${expectedFeatureRef}`], cwd: repositoryPath, maxOutputBytes: 16 * 1024}, context.signal); if (feature.exitCode === 0) featureSha = feature.stdout.trim().split(/\s+/)[0] || ''; }
    const unchanged = actual.toLowerCase() === expected.toLowerCase(), featurePresent = typeof expectedFeatureRef !== 'string' || !expectedFeatureRef || /^[a-f0-9]{40,64}$/i.test(featureSha), passed = unchanged && featurePresent;
    return {verification: passed ? ['protected-ref-unchanged'] : [], evidence: [`protected-ref-before:${expected}`, `protected-ref-after:${actual || 'unavailable'}`, ...(typeof expectedFeatureRef === 'string' && expectedFeatureRef ? [`authorised-ref:${expectedFeatureRef}:${featureSha || 'unavailable'}`] : [])], detail: passed ? 'Independent remote-ref verification confirmed origin/master remained unchanged and the authorised feature ref exists' : 'Independent remote-ref verification detected a changed protected ref or missing authorised feature ref'};
  }, ['EXTERNAL_COMMUNICATION']);
  return registry;
}

const governedGitEnvironmentKeys = ['PATH', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'TEMP', 'TMP', 'TMPDIR', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL', 'SSH_AUTH_SOCK'] as const;
export function governedGitEnvironment(source: NodeJS.ProcessEnv = process.env) {
  const env: NodeJS.ProcessEnv = {GIT_TERMINAL_PROMPT: '0'};
  for (const key of governedGitEnvironmentKeys) if (source[key] !== undefined) env[key] = source[key];
  return env;
}

function confinedGitArgs(args: string[], hookRoot: string) {
  const subcommand = args.find(item => !item.startsWith('-'))?.toLowerCase(), safe = ['diff', 'show', 'log'].includes(subcommand ?? '') ? [...args.slice(0, 1), '--no-ext-diff', '--no-textconv', ...args.slice(1)] : args;
  return ['-c', `core.hooksPath=${hookRoot}`, '-c', 'core.fsmonitor=false', ...safe];
}

function assertExecutionCwd(sealedCwd: string) {
  let current: string;
  try { current = fs.realpathSync.native(sealedCwd); } catch { throw new ActionFailure('governed_git_execution_cwd_unresolvable', 'policy_rejection'); }
  const left = process.platform === 'win32' ? current.toLowerCase() : current, right = process.platform === 'win32' ? sealedCwd.toLowerCase() : sealedCwd;
  if (left !== right) throw new ActionFailure('governed_git_execution_cwd_identity_changed', 'policy_rejection');
}

function assertProposalRoute(route: ActionContext['run']['trigger']['modelRoute'], proposal: unknown) {
  if (!proposal || typeof proposal !== 'object' || !('route' in proposal)) return;
  if (!route) throw new Error('governed_git_proposal_route_missing');
  const value = (proposal as {route?: Record<string, unknown>}).route;
  if (!value || value.providerId !== route.providerId || value.modelId !== route.modelId || (value.accountProfileId ?? null) !== (route.accountProfileId ?? null) || value.nodeId !== (route.providerExecutionNodeId ?? route.nodeId)) throw new Error('governed_git_proposal_route_identity_mismatch');
}

async function observeRemoteRefs(context: ActionContext, effects: GovernedEffect[]) {
  const observed = new Map<string, string | null | undefined>();
  for (const effect of effects) {
    if (!effect.resource.remote || !effect.resource.ref || effect.resource.ref === '*') { observed.set(effect.id, undefined); continue; }
    try {
      const result = await context.ownedExecution.runProcess({command: 'git', args: ['ls-remote', '--refs', effect.resource.remote, remoteRefQuery(effect.resource.ref)], cwd: effect.resource.repositoryPath, maxOutputBytes: 16 * 1024});
      if (result.exitCode !== 0) observed.set(effect.id, undefined);
      else observed.set(effect.id, result.stdout.trim().split(/\s+/)[0] || null);
    } catch { observed.set(effect.id, undefined); }
  }
  return observed;
}

function remoteRefQuery(ref: string) { return ref.startsWith('refs/') ? ref : `refs/heads/${ref}`; }

function reconcile(effects: GovernedEffect[], before: Map<string, string | null | undefined>, after: Map<string, string | null | undefined>, reason: string) {
  return effects.map(effect => {
    const prior = before.get(effect.id), current = after.get(effect.id);
    if (prior === undefined || current === undefined) return {effectId: effect.id, state: 'COMMIT_STATE_UNCERTAIN' as const, reason};
    if (prior !== current) return {effectId: effect.id, state: 'EXTERNALLY_COMMITTED' as const, reason: `${reason}; remote ref changed`};
    return {effectId: effect.id, state: 'FAILED' as const, reason: `${reason}; remote ref remained unchanged`};
  });
}

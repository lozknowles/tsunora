import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type {ArtifactRecord, RunRecord, RunStep, WorkerRegistration} from './job-types.js';

export type GovernedEffectKind = 'READ' | 'CREATE' | 'UPDATE' | 'FORCE_UPDATE' | 'DELETE' | 'REWRITE' | 'LOCAL_WRITE';
export type ExternalOperationState = 'PROPOSED' | 'AUTHORISED' | 'EXECUTING' | 'EXTERNALLY_COMMITTED' | 'CANCELLED_BEFORE_COMMIT' | 'COMMIT_STATE_UNCERTAIN' | 'FAILED';

export interface GovernedResource {
  kind: 'git-ref' | 'repository' | 'filesystem';
  id: string;
  repositoryPath?: string;
  remote?: string;
  ref?: string;
}

export interface GovernedEffect {
  id: string;
  kind: GovernedEffectKind;
  resource: GovernedResource;
  external: boolean;
  consequential: boolean;
  summary: string;
}

export interface ResourceCapabilityPolicy {
  id: string;
  resourceKind: GovernedResource['kind'];
  resourceId: string;
  capability: 'READ_ONLY' | 'MUTATE';
  source: 'OPERATOR_CONSTRAINT' | 'CONFIGURATION';
  sourceHash: string;
  reason: string;
}

export interface NormalizedActionOperation {
  executable: string;
  args: string[];
  cwd: string;
  source: 'STRUCTURED' | 'WRAPPED' | 'CHAINED';
  display: string;
}

export interface ActionGovernancePlan {
  schema: 'agent-control.action-governance-plan/v1';
  operations: NormalizedActionOperation[];
  effects: GovernedEffect[];
  policies: ResourceCapabilityPolicy[];
}

export interface ActionGovernanceInput {
  run: RunRecord;
  step: RunStep;
  worker: WorkerRegistration;
  parameters: Record<string, unknown>;
  inputArtifacts: ArtifactRecord[];
  readArtifact: (id: string) => unknown;
}

export type ActionGovernanceResolver = (input: ActionGovernanceInput) => ActionGovernancePlan;

export interface ExternalOperationRecord {
  schema: 'agent-control.external-operation/v1';
  id: string;
  effectId: string;
  resource: GovernedResource;
  effect: GovernedEffectKind;
  state: ExternalOperationState;
  proposedAt: string;
  updatedAt: string;
  transitions: Array<{state: ExternalOperationState; at: string; reason?: string}>;
  decisionId?: string;
  reason?: string;
}

const writeEffects = new Set<GovernedEffectKind>(['CREATE', 'UPDATE', 'FORCE_UPDATE', 'DELETE', 'REWRITE']);
export function isExternalMutation(effect: GovernedEffect) { return effect.external && writeEffects.has(effect.kind); }

export function compileResourcePolicies(run: RunRecord): ResourceCapabilityPolicy[] {
  const context = run.trigger.parcelContext;
  const sources = [context?.originalGoal, context?.currentInterpretation, ...(context?.effectiveInstructions ?? []), ...(context?.constraints ?? [])].filter((item): item is string => Boolean(item));
  const policies = new Map<string, ResourceCapabilityPolicy>();
  for (const source of sources) {
    const immutable = /(?:must\s+remain\s+(?:completely\s+)?unchanged|do\s+not\s+(?:change|modify|update|rewrite|delete)|read[- ]only|must\s+not\s+be\s+(?:changed|modified|updated|rewritten|deleted))/i.test(source);
    if (!immutable) continue;
    for (const match of source.matchAll(/\b([a-zA-Z0-9._-]+)\/(?:refs\/heads\/)?([a-zA-Z0-9._/-]+)\b/g)) {
      const remote = match[1], ref = normalizeGitRef(match[2]);
      if (!remote || !ref || ['http', 'https', 'file'].includes(remote.toLowerCase())) continue;
      const resourceId = gitRefResourceId(remote, ref), sourceHash = shaText(source);
      policies.set(resourceId, {id: `protected-${sourceHash.slice(0, 16)}-${remote}-${ref.replace(/[^a-z0-9]+/gi, '-')}`, resourceKind: 'git-ref', resourceId, capability: 'READ_ONLY', source: 'OPERATOR_CONSTRAINT', sourceHash, reason: `Operator constraint protects ${remote}/${ref} from mutation`});
    }
  }
  return [...policies.values()];
}

export function gitRefResourceId(remote: string, ref: string) { return `git-ref:${remote}/${normalizeGitRef(ref)}`; }
export function normalizeGitRef(ref: string) { return ref.replace(/^refs\/heads\//, '').replace(/^refs\/remotes\/[^/]+\//, '').replace(/^\/+|\/+$/g, ''); }

export function policyProtectsEffect(policy: ResourceCapabilityPolicy, effect: GovernedEffect) {
  if (policy.capability !== 'READ_ONLY' || !isExternalMutation(effect) || policy.resourceKind !== effect.resource.kind) return false;
  if (policy.resourceId === effect.resource.id) return true;
  if (effect.resource.ref === '*' && policy.resourceId.startsWith(`git-ref:${effect.resource.remote}/`)) return true;
  if (policy.resourceKind === 'git-ref' && effect.resource.kind === 'git-ref') {
    const protectedRef = policy.resourceId.slice('git-ref:'.length).split('/').slice(1).join('/');
    // A differently named remote may resolve to the same repository. Without a
    // separately qualified remote-identity mapping, fail closed for mutations
    // to the protected ref name through aliases, paths, or URLs.
    return Boolean(protectedRef) && effect.resource.ref === protectedRef;
  }
  return false;
}

export function parseGovernedGitProposal(raw: unknown, defaultCwd: string): NormalizedActionOperation[] {
  if (typeof raw !== 'string' && (!raw || typeof raw !== 'object') || typeof raw === 'string' && !raw.trim()) throw new Error('governed_git_proposal_required');
  let parsed: unknown;
  if (typeof raw === 'string') { try { parsed = JSON.parse(raw); } catch { parsed = {commandLine: raw}; } }
  else parsed = raw;
  const candidates = Array.isArray((parsed as {commands?: unknown})?.commands) ? (parsed as {commands: unknown[]}).commands : [parsed];
  const operations: NormalizedActionOperation[] = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') throw new Error('governed_git_proposal_invalid');
    const record = candidate as {command?: unknown; args?: unknown; cwd?: unknown; commandLine?: unknown};
    const cwd = canonicalCwd(typeof record.cwd === 'string' ? record.cwd : defaultCwd);
    if (typeof record.commandLine === 'string') operations.push(...parseCommandLine(record.commandLine, cwd));
    else {
      if (typeof record.command !== 'string' || !Array.isArray(record.args) || !record.args.every(item => typeof item === 'string')) throw new Error('governed_git_proposal_invalid');
      operations.push(...normalizeArgv(record.command, record.args as string[], cwd, 'STRUCTURED'));
    }
  }
  if (!operations.length) throw new Error('governed_git_proposal_empty');
  return operations;
}

function parseCommandLine(line: string, cwd: string): NormalizedActionOperation[] {
  if (/[|<>`]|\$\(|\n|\r/.test(line)) throw new Error('governed_git_shell_construct_unsupported');
  const segments = splitShellChain(line);
  return segments.flatMap((segment, index) => {
    const argv = shellWords(segment);
    if (!argv.length) return [];
    const source = segments.length > 1 ? 'CHAINED' as const : 'STRUCTURED' as const;
    return normalizeArgv(argv[0], argv.slice(1), cwd, source, index);
  });
}

function normalizeArgv(command: string, args: string[], cwd: string, source: NormalizedActionOperation['source'], sequence = 0): NormalizedActionOperation[] {
  const name = path.basename(command).toLowerCase();
  if (['sh', 'bash', 'zsh'].includes(name) && args[0] === '-c' && typeof args[1] === 'string' && args.length === 2) return parseCommandLine(args[1], cwd).map(item => ({...item, source: 'WRAPPED'}));
  if (name !== 'git' && name !== 'git.exe') throw new Error('governed_git_executable_not_allowed');
  if (args.some(value => /(?:https?|ssh):\/\/[^/\s:@]+:[^@\s]+@/i.test(value))) throw new Error('governed_git_credentialed_destination_forbidden');
  let effectiveCwd = cwd, retained = [...args];
  while (retained[0] === '-C') { if (!retained[1]) throw new Error('governed_git_cwd_missing'); effectiveCwd = canonicalCwd(path.resolve(effectiveCwd, retained[1])); retained = retained.slice(2); }
  while (retained[0] === '--no-pager') retained = retained.slice(1);
  if (retained[0]?.startsWith('-')) throw new Error('governed_git_global_option_unsupported');
  if (!retained.length) throw new Error('governed_git_subcommand_required');
  return [{executable: 'git', args: retained, cwd: effectiveCwd, source, display: `git ${retained.map(redactedArg).join(' ')}`.slice(0, 1024) || `git:${sequence}`}];
}

export function resolveGitEffects(operations: NormalizedActionOperation[]): GovernedEffect[] {
  return operations.flatMap((operation, operationIndex) => {
    const args = operation.args, subcommandIndex = args.findIndex(item => !item.startsWith('-') || item === '--');
    const subcommand = args[subcommandIndex]?.toLowerCase();
    if (!subcommand) throw new Error('governed_git_subcommand_required');
    if (subcommand !== 'push') {
      const external = remoteReadGitSubcommands.has(subcommand), readOnly = readOnlyGitSubcommands.has(subcommand);
      return [{id: `effect-${operationIndex}-local`, kind: readOnly ? 'READ' : 'LOCAL_WRITE', resource: {kind: 'repository', id: `repository:${operation.cwd}`, repositoryPath: operation.cwd}, external, consequential: !readOnly, summary: external ? `${subcommand} reads a configured remote and may update the governed local repository` : `${subcommand} affects only the governed local repository`} satisfies GovernedEffect];
    }
    return resolvePushEffects(operation, args.slice(subcommandIndex + 1), operationIndex);
  });
}

const readOnlyGitSubcommands = new Set(['status', 'diff', 'show', 'log', 'rev-parse', 'ls-remote', 'branch', 'remote', 'describe']);
const remoteReadGitSubcommands = new Set(['fetch', 'ls-remote']);
function resolvePushEffects(operation: NormalizedActionOperation, rawArgs: string[], operationIndex: number): GovernedEffect[] {
  let force = false, deleteMode = false, mirror = false, remote = 'origin'; const positional: string[] = [];
  for (let index = 0; index < rawArgs.length; index++) {
    const arg = rawArgs[index];
    if (['--force', '-f', '--force-with-lease', '--force-if-includes'].includes(arg) || arg.startsWith('--force-with-lease=')) { force = true; continue; }
    if (arg === '--delete' || arg === '-d') { deleteMode = true; continue; }
    if (arg === '--mirror') { mirror = true; continue; }
    if (['--repo', '-o', '--push-option'].includes(arg)) { index++; continue; }
    if (arg.startsWith('-')) continue;
    positional.push(arg);
  }
  if (positional.length) remote = positional.shift()!;
  if (mirror) return [gitEffect(operationIndex, 0, 'REWRITE', remote, '*', operation.cwd, 'Mirror push rewrites remote refs')];
  if (!positional.length) throw new Error('governed_git_implicit_push_refspec_forbidden');
  return positional.map((refspec, index) => {
    let value = refspec, forced = force;
    if (value.startsWith('+')) { forced = true; value = value.slice(1); }
    const colon = value.indexOf(':'), source = colon >= 0 ? value.slice(0, colon) : value;
    if (colon < 0 && /^(?:HEAD|@)(?:[~^].*)?$/i.test(source)) throw new Error('governed_git_implicit_destination_ref_forbidden');
    const rawDestination = colon >= 0 ? value.slice(colon + 1) : value;
    const destination = resolvedPushDestination(operation.cwd, source, rawDestination, colon >= 0);
    if (!destination) throw new Error('governed_git_destination_ref_required');
    if (/^(?:HEAD|@)(?:[~^].*)?$/i.test(destination)) throw new Error('governed_git_ambiguous_destination_ref_forbidden');
    const deleted = deleteMode || source === '';
    return gitEffect(operationIndex, index, deleted ? 'DELETE' : forced ? 'FORCE_UPDATE' : 'UPDATE', remote, destination, operation.cwd, `${deleted ? 'Delete' : forced ? 'Force update' : 'Update'} ${remote}/${destination}`);
  });
}

function resolvedPushDestination(cwd: string, source: string, destination: string, explicit: boolean) {
  if (destination.startsWith('refs/')) return normalizeGitRef(destination);
  if (!explicit) {
    try {
      const resolved = execFileSync('git', ['rev-parse', '--symbolic-full-name', '--verify', source], {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
      if (resolved.startsWith('refs/tags/')) return resolved;
    } catch { /* Git will report an unknown source during the governed execution. */ }
  }
  return normalizeGitRef(destination);
}

function gitEffect(operation: number, index: number, kind: GovernedEffectKind, remote: string, ref: string, repositoryPath: string, summary: string): GovernedEffect {
  return {id: `effect-${operation}-${index}-${remote}-${ref.replace(/[^a-z0-9]+/gi, '-')}`, kind, resource: {kind: 'git-ref', id: gitRefResourceId(remote, ref), repositoryPath, remote, ref}, external: true, consequential: true, summary};
}

function canonicalCwd(value: string) { if (!path.isAbsolute(value)) throw new Error('governed_git_cwd_must_be_absolute'); try { return fs.realpathSync.native(value); } catch { throw new Error('governed_git_cwd_unresolvable'); } }
function redactedArg(value: string) { return /(?:token|password|secret|key)=/i.test(value) ? '[REDACTED]' : JSON.stringify(value); }
function splitShellChain(line: string) {
  const segments: string[] = []; let quote = '', escaped = false, current = '';
  for (let index = 0; index < line.length; index++) { const char = line[index], next = line[index + 1]; if (escaped) { current += char; escaped = false; continue; } if (char === '\\' && quote !== "'") { current += char; escaped = true; continue; } if (quote) { current += char; if (char === quote) quote = ''; continue; } if (char === "'" || char === '"') { quote = char; current += char; continue; } if (char === ';' || char === '&' && next === '&') { if (current.trim()) segments.push(current.trim()); current = ''; if (char === '&') index++; continue; } if (char === '&') throw new Error('governed_git_shell_construct_unsupported'); current += char; }
  if (quote || escaped) throw new Error('governed_git_shell_syntax_invalid'); if (current.trim()) segments.push(current.trim()); return segments;
}
function shellWords(value: string) { const words: string[] = []; let current = '', quote = '', escaped = false; for (const char of value) { if (escaped) { current += char; escaped = false; continue; } if (char === '\\' && quote !== "'") { escaped = true; continue; } if (quote) { if (char === quote) quote = ''; else current += char; continue; } if (char === "'" || char === '"') { quote = char; continue; } if (/\s/.test(char)) { if (current) { words.push(current); current = ''; } continue; } current += char; } if (quote || escaped) throw new Error('governed_git_shell_syntax_invalid'); if (current) words.push(current); return words; }
function shaText(value: string) { return createHash('sha256').update(value).digest('hex'); }
